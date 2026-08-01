#!/usr/bin/env python3
"""Progreso legible de la corrida Nexus secuencial (1 cédula / 20 s)."""
from __future__ import annotations

import re
import subprocess
from pathlib import Path

LOG = Path("/tmp/nexus_seq_20s.log")
LOG_LEGACY = Path("/tmp/nexus_seq2_20s.log")

RE_START = re.compile(
    r"Nexus: (\d+) cédulas únicas · (\d+) ya verificadas · (\d+) pendientes"
)
RE_PROG = re.compile(
    r"Nexus: (\d+)/(\d+) procesadas · (\d+) verificadas · (\d+) errores"
)
RE_STEP = re.compile(r"^(OK|NO_ENCONTRADO|ERROR) (\d+)/(\d+):")
RE_ABORT = re.compile(r"^ABORTADO:")
RE_LOTE = re.compile(r"Lote (\d+):")
RE_DONE_IMPORT = re.compile(r'"actualizados":\s*(\d+)')


def proceso_vivo() -> bool:
    for pat in (
        "servicio_nexus_pendientes.py",
        "precargar_nexus_censo.py",
        "correr_nexus_pendientes_bg.sh",
        "nexus-pendientes-consultables-seq2.xlsx",
        "nexus-pendientes-consultables-seq.xlsx",
    ):
        try:
            out = subprocess.check_output(["pgrep", "-f", pat], text=True)
            if out.strip():
                return True
        except subprocess.CalledProcessError:
            continue
    # systemd unit
    try:
        out = subprocess.check_output(
            ["systemctl", "is-active", "nexus-pendientes.service"], text=True
        )
        if out.strip() == "active":
            return True
    except (subprocess.CalledProcessError, FileNotFoundError):
        pass
    return False


def elegir_log() -> Path:
    service_log = Path("/var/log/nexus-pendientes.log")
    if service_log.exists() and service_log.stat().st_size > 0:
        return service_log
    return LOG if LOG.exists() else LOG_LEGACY


def main() -> None:
    log = elegir_log()
    if not log.exists():
        print("Aún no hay log. ¿Arrancó el job?")
        return

    lines = log.read_text(encoding="utf-8", errors="replace").splitlines()

    unicas = cache_ok = api_total = None
    for line in lines:
        hit = RE_START.search(line)
        if hit:
            unicas, cache_ok, api_total = map(int, hit.groups())

    hechas = total = halladas = fallos = None
    for line in lines:
        hit = RE_PROG.search(line)
        if hit:
            hechas, total, halladas, fallos = map(int, hit.groups())

    if hechas is None:
        oks = nos = errs = 0
        for line in lines:
            hit = RE_STEP.search(line)
            if not hit:
                continue
            kind, i, n = hit.group(1), int(hit.group(2)), int(hit.group(3))
            hechas, total = i, n
            if kind == "OK":
                oks += 1
            elif kind == "NO_ENCONTRADO":
                nos += 1
            else:
                errs += 1
        if hechas is not None:
            halladas, fallos = oks, nos + errs

    lotes = sum(1 for line in lines if RE_LOTE.search(line))
    done_m = None
    for line in lines:
        hit = RE_DONE_IMPORT.search(line)
        if hit:
            done_m = hit

    abortado = any(RE_ABORT.search(line) for line in lines)
    vivo = proceso_vivo()

    print("=== Nexus secuencial (1 cédula / 20 s) ===")
    print(f"Proceso: {'CORRIENDO' if vivo else 'NO CORRE / terminó'}")
    print(f"Log: {log}")
    if unicas is not None:
        print(f"Plan: {cache_ok} de caché (sin API) + {api_total} consultas · universo {unicas}")
    if hechas is not None and total is not None:
        pct = (100 * hechas / total) if total else 0
        print(f"Consultas API: {hechas}/{total} ({pct:.1f}%)")
        print(f"  · Halladas en SAIME: {halladas}")
        print(f"  · No encontradas / fallo: {fallos}")
        if hechas < total and vivo:
            print(f"  · ETA resto: ~{(total - hechas) * 20 / 60:.0f} min")
    elif vivo:
        print("Fase: cargando caché / arrancando consultas…")
    if abortado:
        print("ABORTADO por circuit-breaker (revisar gateway/VPN).")
    if lotes:
        print(f"Aplicando a BD: {lotes} lote(s) escritos")
    if done_m:
        print(f"LISTO — actualizados en censo: {done_m.group(1)}")


if __name__ == "__main__":
    main()
