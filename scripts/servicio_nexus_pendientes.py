#!/usr/bin/env python3
"""Servicio durable: verifica en Nexus solo cédulas pendientes de la tabla.

Pendiente = censo_registros con tipo_doc V/E, documento válido,
verificado_nexus=false y sin entrada en nexus_consultas (ni OK ni 404).

Comportamiento:
  - Bucle infinito; si no hay pendientes, duerme y reescanea (imports nuevos).
  - Timeout / caída de gateway: reintento con backoff; no tumba el proceso.
  - Circuit breaker: pausa y reanuda (no exit).
  - Tras OK/404 en caché: aplica ficha a censo_registros (RPC).
  - Pensado para systemd Restart=always.

Uso manual:
  python3 scripts/servicio_nexus_pendientes.py
  python3 scripts/servicio_nexus_pendientes.py --once --limit 5
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
import traceback
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent
ENV = ROOT / ".env"

DEFAULT_URL = "https://xzwifkckkakldnzkdeby.supabase.co"
DEFAULT_GATEWAY = "https://nexus.m0n1t0r-d3-3v3nt0s.net"
DEFAULT_RATE = 20.0
DEFAULT_TIMEOUT = 45.0
DEFAULT_IDLE_SLEEP = 900.0  # 15 min al día
DEFAULT_GATEWAY_PAUSE = 600.0  # 10 min tras circuit breaker
DEFAULT_CIRCUIT_BREAKER = 5
DEFAULT_APPLY_EVERY = 5
LETRAS_VALIDAS = {"V", "E"}
PAGE_SIZE = 1000


def cargar_env() -> tuple[str, str, str]:
    valores: dict[str, str] = {}
    if ENV.exists():
        for linea in ENV.read_text(encoding="utf-8").splitlines():
            linea = linea.strip()
            if not linea or linea.startswith("#") or "=" not in linea:
                continue
            k, v = linea.split("=", 1)
            valores[k.strip()] = v.strip().strip('"').strip("'")
    url = os.environ.get("VITE_SUPABASE_URL", valores.get("VITE_SUPABASE_URL", DEFAULT_URL))
    key = os.environ.get("VITE_SUPABASE_ANON_KEY", valores.get("VITE_SUPABASE_ANON_KEY", ""))
    gateway = os.environ.get(
        "VITE_NEXUS_GATEWAY_URL", valores.get("VITE_NEXUS_GATEWAY_URL", DEFAULT_GATEWAY)
    )
    if not key:
        raise SystemExit("Falta VITE_SUPABASE_ANON_KEY")
    # Preferir env real (systemd EnvironmentFile) sobre archivo.
    for k in ("NEXUS_SCRIPT_EMAIL", "NEXUS_SCRIPT_PASSWORD"):
        if not os.environ.get(k) and valores.get(k):
            os.environ[k] = valores[k]
    return url.rstrip("/"), key, gateway.rstrip("/")


def autenticar(url: str, anon_key: str) -> str:
    email = os.environ.get("NEXUS_SCRIPT_EMAIL")
    password = os.environ.get("NEXUS_SCRIPT_PASSWORD")
    if not email or not password:
        raise SystemExit("Faltan NEXUS_SCRIPT_EMAIL / NEXUS_SCRIPT_PASSWORD")
    req = urllib.request.Request(
        f"{url}/auth/v1/token?grant_type=password",
        data=json.dumps({"email": email, "password": password}).encode("utf-8"),
        headers={"apikey": anon_key, "Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        body = json.loads(resp.read().decode("utf-8"))
    token = body.get("access_token")
    if not token:
        raise SystemExit(f"Login sin access_token: {body}")
    return token


class SesionAuth:
    def __init__(self, url: str, anon_key: str):
        self.url = url
        self.anon_key = anon_key
        self.token = autenticar(url, anon_key)

    def renovar(self) -> str:
        self.token = autenticar(self.url, self.anon_key)
        log("JWT renovado")
        return self.token


def log(msg: str) -> None:
    print(msg, file=sys.stderr, flush=True)


def rest_get(url: str, anon_key: str, token: str, path: str) -> list:
    acumulado: list = []
    desde = 0
    while True:
        hasta = desde + PAGE_SIZE - 1
        req = urllib.request.Request(
            f"{url}/rest/v1/{path}",
            headers={
                "apikey": anon_key,
                "Authorization": f"Bearer {token}",
                "Range-Unit": "items",
                "Range": f"{desde}-{hasta}",
            },
            method="GET",
        )
        with urllib.request.urlopen(req, timeout=60) as resp:
            pagina = json.loads(resp.read().decode("utf-8"))
        acumulado.extend(pagina)
        if len(pagina) < PAGE_SIZE:
            break
        desde += PAGE_SIZE
    return acumulado


def rpc(url: str, anon_key: str, sesion: SesionAuth, nombre: str, payload: dict) -> Any:
    for intento in range(2):
        req = urllib.request.Request(
            f"{url}/rest/v1/rpc/{nombre}",
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "apikey": anon_key,
                "Authorization": f"Bearer {sesion.token}",
                "Content-Type": "application/json",
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=120) as resp:
                raw = resp.read().decode("utf-8")
                return json.loads(raw) if raw else None
        except urllib.error.HTTPError as exc:
            if exc.code == 401 and intento == 0:
                sesion.renovar()
                continue
            detalle = exc.read().decode("utf-8", errors="replace")
            raise RuntimeError(f"RPC {nombre} HTTP {exc.code}: {detalle}") from exc
    raise RuntimeError(f"RPC {nombre}: JWT no renovable")


def upsert_nexus_consulta(url: str, anon_key: str, sesion: SesionAuth, fila: dict) -> None:
    for intento in range(2):
        req = urllib.request.Request(
            f"{url}/rest/v1/nexus_consultas?on_conflict=letra,cedula",
            data=json.dumps(fila).encode("utf-8"),
            headers={
                "apikey": anon_key,
                "Authorization": f"Bearer {sesion.token}",
                "Content-Type": "application/json",
                "Prefer": "resolution=merge-duplicates,return=minimal",
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=30):
                return
        except urllib.error.HTTPError as exc:
            if exc.code == 401 and intento == 0:
                sesion.renovar()
                continue
            raise


def consultar_nexus(
    gateway: str, sesion: SesionAuth, letra: str, cedula: str, timeout: float
) -> dict:
    """Nunca lanza: timeout/red → status None + error en body."""
    for intento in range(2):
        req = urllib.request.Request(
            f"{gateway}/v1/person/search/external/full/{letra}/{cedula}/censo",
            data=b"{}",
            headers={
                "Authorization": f"Bearer {sesion.token}",
                "Content-Type": "application/json",
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return {"status": resp.status, "body": json.loads(resp.read().decode("utf-8"))}
        except urllib.error.HTTPError as exc:
            if exc.code == 401 and intento == 0:
                try:
                    sesion.renovar()
                    continue
                except Exception as auth_exc:  # noqa: BLE001
                    return {"status": 401, "body": {"error": f"JWT: {auth_exc}"}}
            cuerpo = exc.read().decode("utf-8", errors="replace")
            try:
                cuerpo_json = json.loads(cuerpo)
            except json.JSONDecodeError:
                cuerpo_json = {"error": cuerpo}
            return {"status": exc.code, "body": cuerpo_json}
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            return {"status": None, "body": {"error": str(exc)}}
        except Exception as exc:  # noqa: BLE001
            return {"status": None, "body": {"error": f"{type(exc).__name__}: {exc}"}}
    return {"status": 401, "body": {"error": "JWT no renovable"}}


def cedula_valida(cedula: str) -> bool:
    return cedula.isdigit() and 5 <= len(cedula) <= 12


def listar_pendientes_api(
    url: str, anon_key: str, sesion: SesionAuth
) -> list[tuple[str, str]]:
    """Solo filas tabla sin verificado_nexus y sin ninguna entrada en caché."""
    pendientes_raw = rest_get(
        url,
        anon_key,
        sesion.token,
        "censo_registros?select=documento_norm,tipo_doc"
        "&verificado_nexus=eq.false"
        "&documento_norm=not.is.null"
        "&tipo_doc=in.(V,E)"
        "&order=id",
    )
    cache_raw = rest_get(
        url, anon_key, sesion.token, "nexus_consultas?select=letra,cedula&order=letra,cedula"
    )
    en_cache = {(f["letra"], f["cedula"]) for f in cache_raw}

    vistos: set[tuple[str, str]] = set()
    salida: list[tuple[str, str]] = []
    for fila in pendientes_raw:
        cedula = (fila.get("documento_norm") or "").strip()
        letra = (fila.get("tipo_doc") or "").strip().upper()
        if letra not in LETRAS_VALIDAS or not cedula_valida(cedula):
            continue
        clave = (letra, cedula)
        if clave in vistos or clave in en_cache:
            continue
        vistos.add(clave)
        salida.append(clave)
    return salida


def registrar_resultado(
    url: str,
    anon_key: str,
    sesion: SesionAuth,
    status: int | None,
    body: dict,
    letra: str,
    cedula: str,
) -> str:
    if status == 200 and body.get("ok") is not False:
        upsert_nexus_consulta(
            url,
            anon_key,
            sesion,
            {
                "letra": letra,
                "cedula": cedula,
                "data": body,
                "actualizado_ts": int(time.time() * 1000),
                "actualizado_por": "script:servicio_nexus_pendientes",
            },
        )
        return "ok"
    if status == 404 or (status == 200 and body.get("ok") is False):
        upsert_nexus_consulta(
            url,
            anon_key,
            sesion,
            {
                "letra": letra,
                "cedula": cedula,
                "data": {"ok": False, "motivo": "no_encontrado"},
                "actualizado_ts": int(time.time() * 1000),
                "actualizado_por": "script:servicio_nexus_pendientes",
            },
        )
        return "no_encontrado"
    return "error"


def aplicar_cache(url: str, anon_key: str, sesion: SesionAuth) -> int:
    try:
        res = rpc(url, anon_key, sesion, "censo_aplicar_nexus_cache", {})
        n = int((res or {}).get("aplicados_cache") or 0) if isinstance(res, dict) else 0
        if n:
            log(f"[aplicar_cache] {n} filas actualizadas")
        return n
    except Exception as exc:  # noqa: BLE001
        log(f"[aplicar_cache] error: {exc}")
        return 0


def ciclo(
    url: str,
    anon_key: str,
    gateway: str,
    sesion: SesionAuth,
    *,
    rate: float,
    timeout: float,
    circuit_breaker: int,
    gateway_pause: float,
    apply_every: int,
    limit: int | None,
) -> dict[str, int]:
    aplicados = aplicar_cache(url, anon_key, sesion)
    pendientes = listar_pendientes_api(url, anon_key, sesion)
    if limit is not None:
        pendientes = pendientes[:limit]
    log(f"Pendientes API (sin caché): {len(pendientes)} · cache aplicada al inicio: {aplicados}")

    resumen = {"ok": 0, "no_encontrado": 0, "error": 0, "reintentos": 0}
    if not pendientes:
        return resumen

    fallos_consecutivos = 0
    desde_apply = 0

    for i, (letra, cedula) in enumerate(pendientes, start=1):
        if i > 1:
            time.sleep(rate)

        # Hasta 3 intentos por cédula ante fallo de red/timeout (sin escribir caché).
        outcome = "error"
        status: int | None = None
        body: dict = {}
        for intento_local in range(1, 4):
            resultado = consultar_nexus(gateway, sesion, letra, cedula, timeout)
            status, body = resultado["status"], resultado["body"]
            outcome = registrar_resultado(url, anon_key, sesion, status, body, letra, cedula)
            if outcome != "error":
                break
            # Error de gateway/red: no marcar en caché; reintentar.
            resumen["reintentos"] += 1
            backoff = min(60 * intento_local, 180)
            log(
                f"RETRY {intento_local}/3 {i}/{len(pendientes)}: {letra}-{cedula} "
                f"status={status} → sleep {backoff}s"
            )
            time.sleep(backoff)

        resumen[outcome] += 1
        if outcome == "ok":
            fallos_consecutivos = 0
            desde_apply += 1
            log(f"OK {i}/{len(pendientes)}: {letra}-{cedula}")
        elif outcome == "no_encontrado":
            fallos_consecutivos = 0
            log(f"NO_ENCONTRADO {i}/{len(pendientes)}: {letra}-{cedula}")
        else:
            fallos_consecutivos += 1
            log(f"ERROR {i}/{len(pendientes)}: {letra}-{cedula} -> status={status} {body}")
            if fallos_consecutivos >= circuit_breaker:
                log(
                    f"CIRCUIT: {fallos_consecutivos} fallos consecutivos. "
                    f"Pausa {int(gateway_pause)}s (proceso sigue vivo)."
                )
                time.sleep(gateway_pause)
                fallos_consecutivos = 0
                try:
                    sesion.renovar()
                except Exception as exc:  # noqa: BLE001
                    log(f"JWT tras circuit: {exc}")

        if desde_apply >= apply_every:
            aplicar_cache(url, anon_key, sesion)
            desde_apply = 0

        if i == 1 or i % 10 == 0 or i == len(pendientes):
            log(
                f"Nexus: {i}/{len(pendientes)} procesadas · "
                f"{resumen['ok']} ok · {resumen['no_encontrado']} 404 · "
                f"{resumen['error']} error"
            )

    aplicar_cache(url, anon_key, sesion)
    return resumen


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--rate", type=float, default=DEFAULT_RATE)
    ap.add_argument("--timeout-nexus", type=float, default=DEFAULT_TIMEOUT)
    ap.add_argument("--idle-sleep", type=float, default=DEFAULT_IDLE_SLEEP)
    ap.add_argument("--gateway-pause", type=float, default=DEFAULT_GATEWAY_PAUSE)
    ap.add_argument("--circuit-breaker", type=int, default=DEFAULT_CIRCUIT_BREAKER)
    ap.add_argument("--apply-every", type=int, default=DEFAULT_APPLY_EVERY)
    ap.add_argument("--limit", type=int, default=None, help="Tope por ciclo (pruebas)")
    ap.add_argument("--once", action="store_true", help="Un solo ciclo y sale")
    args = ap.parse_args()

    url, anon_key, gateway = cargar_env()
    log(f"Servicio Nexus pendientes · Supabase={url} · Gateway={gateway}")
    log(
        f"rate={args.rate}s timeout={args.timeout_nexus}s idle={args.idle_sleep}s "
        f"circuit={args.circuit_breaker} pause={args.gateway_pause}s"
    )

    while True:
        try:
            sesion = SesionAuth(url, anon_key)
            resumen = ciclo(
                url,
                anon_key,
                gateway,
                sesion,
                rate=args.rate,
                timeout=args.timeout_nexus,
                circuit_breaker=args.circuit_breaker,
                gateway_pause=args.gateway_pause,
                apply_every=args.apply_every,
                limit=args.limit,
            )
            log(f"Ciclo fin: {json.dumps(resumen, ensure_ascii=False)}")
        except Exception as exc:  # noqa: BLE001
            log(f"CICLO ERROR (reintento en 60s): {exc}")
            traceback.print_exc(file=sys.stderr)
            time.sleep(60)
            if args.once:
                return 1
            continue

        if args.once:
            return 0

        log(f"Al día o ciclo cerrado. Reescaneo en {int(args.idle_sleep)}s…")
        time.sleep(args.idle_sleep)


if __name__ == "__main__":
    raise SystemExit(main())
