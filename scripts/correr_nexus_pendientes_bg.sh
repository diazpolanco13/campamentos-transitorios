#!/usr/bin/env bash
# Corrida durable: consulta Nexus secuencial (pendientes sin caché) +
# aplica fichas a censo_registros cada 5 min y al final.
# Uso: nohup bash scripts/correr_nexus_pendientes_bg.sh >> /tmp/nexus_seq_20s.log 2>&1 &
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
set -a
# shellcheck disable=SC1091
source "$ROOT/.env"
set +a

if [[ -z "${NEXUS_SCRIPT_EMAIL:-}" || -z "${NEXUS_SCRIPT_PASSWORD:-}" ]]; then
  echo "ABORTADO: faltan NEXUS_SCRIPT_EMAIL / NEXUS_SCRIPT_PASSWORD" >&2
  exit 1
fi

aplicar_cache() {
  python3 - <<'PY'
import json, os, urllib.request
url = os.environ["VITE_SUPABASE_URL"].rstrip("/")
key = os.environ["VITE_SUPABASE_ANON_KEY"]
email = os.environ["NEXUS_SCRIPT_EMAIL"]
pw = os.environ["NEXUS_SCRIPT_PASSWORD"]
req = urllib.request.Request(
    f"{url}/auth/v1/token?grant_type=password",
    data=json.dumps({"email": email, "password": pw}).encode(),
    headers={"apikey": key, "Content-Type": "application/json"},
    method="POST",
)
jwt = json.loads(urllib.request.urlopen(req, timeout=30).read())["access_token"]
req = urllib.request.Request(
    f"{url}/rest/v1/rpc/censo_aplicar_nexus_cache",
    data=b"{}",
    headers={
        "apikey": key,
        "Authorization": f"Bearer {jwt}",
        "Content-Type": "application/json",
    },
    method="POST",
)
with urllib.request.urlopen(req, timeout=120) as resp:
    print(f"[aplicar_cache] {resp.read().decode()}", flush=True)
PY
}

echo "=== Inicio Nexus pendientes $(date -Is) pid=$$ ===" >&2

(
  while true; do
    sleep 300
    echo "[aplicar_cache] tick $(date -Is)" >&2
    aplicar_cache || echo "[aplicar_cache] error (reintento en 5m)" >&2
  done
) &
APPLIER_PID=$!
trap 'kill "$APPLIER_PID" 2>/dev/null || true' EXIT

python3 "$ROOT/scripts/precargar_nexus_censo.py" --rate 20
STATUS=$?

echo "=== Precarga terminó status=$STATUS $(date -Is) ===" >&2
kill "$APPLIER_PID" 2>/dev/null || true
wait "$APPLIER_PID" 2>/dev/null || true

echo "[aplicar_cache] final" >&2
aplicar_cache || true
echo "=== Fin Nexus pendientes $(date -Is) ===" >&2
exit "$STATUS"
