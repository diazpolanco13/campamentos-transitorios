#!/usr/bin/env python3
"""Siembra censo_registros desde censo nominal (centros sin Excel).

Llama RPC censo_sembrar_desde_nominal. Marca verificado_nexus=true;
SIIPOL queda pendiente.

Uso:
  python3 scripts/sembrar_nominal_a_excel.py
  python3 scripts/sembrar_nominal_a_excel.py --centro centro-06
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ENV = ROOT / ".env"
DEFAULT_URL = "https://xzwifkckkakldnzkdeby.supabase.co"


def cargar_env() -> tuple[str, str]:
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
    if not key:
        raise SystemExit("Falta VITE_SUPABASE_ANON_KEY")
    for k in ("NEXUS_SCRIPT_EMAIL", "NEXUS_SCRIPT_PASSWORD"):
        if not os.environ.get(k) and valores.get(k):
            os.environ[k] = valores[k]
    return url.rstrip("/"), key


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
    with urllib.request.urlopen(req, timeout=60) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    token = data.get("access_token")
    if not token:
        raise SystemExit("Auth sin access_token")
    return token


def llamar_rpc(url: str, anon_key: str, token: str, centro_id: str | None) -> dict:
    payload: dict = {"p_centro_id": centro_id}
    req = urllib.request.Request(
        f"{url}/rest/v1/rpc/censo_sembrar_desde_nominal",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "apikey": anon_key,
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "Prefer": "return=representation",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=300) as resp:
            body = resp.read().decode("utf-8")
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", errors="replace")
        raise SystemExit(f"RPC HTTP {e.code}: {detail}") from e
    return json.loads(body) if body else {}


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--centro", default=None, help="centro_id opcional (default: todos candidatos)")
    args = ap.parse_args()

    url, key = cargar_env()
    print("Auth…", flush=True)
    token = autenticar(url, key)
    print(
        f"RPC censo_sembrar_desde_nominal"
        + (f" centro={args.centro}" if args.centro else " (todos)"),
        flush=True,
    )
    result = llamar_rpc(url, key, token, args.centro)
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
