#!/usr/bin/env bash
# Vigilante plataforma → Telegram + /estado
# Sondea por HTTPS PÚBLICO (lo que ve el usuario, no el IP interno):
#   pwa       https://m0n1t0r-d3-3v3nt0s.net/
#   supabase  Auth health
#   cap       https://cap.m0n1t0r-d3-3v3nt0s.net/
#   gateway   https://nexus.…/health  (nuestro proxy + MinIO de fotos)
# Avisa SOLO cuando cambia el estado. No spamea.
#
# Config: /opt/vigilante-nexus/config.env → BOT_TOKEN, CHAT_ID
#         config-incidentes.env → INCIDENTES_URL, VIGILANTE_INC_SECRET
# Estado: /var/lib/vigilante-nexus/plataforma/<servicio>

set -u
source /opt/vigilante-nexus/config.env
[ -f /opt/vigilante-nexus/config-incidentes.env ] && source /opt/vigilante-nexus/config-incidentes.env

API="https://api.telegram.org/bot${BOT_TOKEN}/sendMessage"
STATE_DIR="${PLATAFORMA_STATE_DIR:-/var/lib/vigilante-nexus/plataforma}"
HOSTNAME_L="$(hostname -s 2>/dev/null || hostname)"

PWA_URL="${PWA_URL:-https://m0n1t0r-d3-3v3nt0s.net/}"
SUPABASE_HEALTH_URL="${SUPABASE_HEALTH_URL:-https://xzwifkckkakldnzkdeby.supabase.co/auth/v1/health}"
CAP_URL="${CAP_URL:-https://cap.m0n1t0r-d3-3v3nt0s.net/}"
GATEWAY_HEALTH_URL="${GATEWAY_HEALTH_URL:-https://nexus.m0n1t0r-d3-3v3nt0s.net/health}"

INIT=0
[ "${1:-}" = "--init" ] && INIT=1
FORCE=0
[ "${1:-}" = "--force-notify" ] && FORCE=1

enviar() {
  curl -sS -o /dev/null --max-time 15 "$API" \
    -d chat_id="${CHAT_ID}" \
    -d parse_mode="HTML" \
    --data-urlencode text="$1" || true
}

# $1=evento  $2=servicio  $3=tipo  $4=causa  $5=detalle
reportar_incidente() {
  [ -n "${INCIDENTES_URL:-}" ] && [ -n "${VIGILANTE_INC_SECRET:-}" ] || return 0
  local evento="$1" servicio="$2" tipo="$3" causa="$4" detalle="${5:-}"
  local payload
  payload="$(python3 -c '
import json, sys
print(json.dumps({
  "evento": sys.argv[1],
  "servicio": sys.argv[2],
  "tipo": sys.argv[3],
  "causa": sys.argv[4] or None,
  "detalle": {"detalle": sys.argv[5][:200]} if sys.argv[5] else {},
}))' "$evento" "$servicio" "$tipo" "$causa" "$detalle" 2>/dev/null)" || return 0
  curl -sS -o /dev/null --max-time 15 -X POST "$INCIDENTES_URL" \
    -H "Content-Type: application/json" \
    -H "X-Vigilante-Secret: ${VIGILANTE_INC_SECRET}" \
    -d "$payload" || true
}

swarm_hint() {
  docker node inspect self --format '{{.Status.State}} {{.Status.Message}}' 2>/dev/null \
    | sed 's/[[:space:]]*$//' || echo "n/d"
}

# stdout: online|detalle   o   offline|detalle
sondear_pwa() {
  local tmp http body swarm
  tmp="$(mktemp)"
  http="$(curl -sS -o "$tmp" -w '%{http_code}' --max-time 15 "$PWA_URL" 2>/dev/null || echo 000)"
  body="$(head -c 64 "$tmp" 2>/dev/null || true)"
  rm -f "$tmp"
  if [ "$http" = "200" ] && printf '%s' "$body" | grep -qiE '<!doctype|<html'; then
    printf 'online|http=200'
    return
  fi
  swarm="$(swarm_hint)"
  printf 'offline|http=%s swarm=%s' "${http:-000}" "$swarm"
}

sondear_supabase() {
  local http
  http="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 15 "$SUPABASE_HEALTH_URL" 2>/dev/null || echo 000)"
  # 401 = Auth vivo pero pide apikey. 5xx / 000 = caído.
  case "$http" in
    200|401) printf 'online|http=%s' "$http" ;;
    *) printf 'offline|http=%s' "${http:-000}" ;;
  esac
}

sondear_cap() {
  local http
  http="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 15 "$CAP_URL" 2>/dev/null || echo 000)"
  if [ "$http" = "200" ]; then
    printf 'online|http=200'
  else
    printf 'offline|http=%s' "${http:-000}"
  fi
}

sondear_gateway() {
  local body http ok foto
  body="$(curl -sS --max-time 15 -w '\n%{http_code}' "$GATEWAY_HEALTH_URL" 2>/dev/null || true)"
  http="$(printf '%s' "$body" | tail -n1)"
  body="$(printf '%s' "$body" | sed '$d')"
  if [ "$http" != "200" ] || [ -z "$body" ]; then
    printf 'offline|http=%s' "${http:-000}"
    return
  fi
  ok="$(printf '%s' "$body" | python3 -c '
import sys, json
try:
  d=json.load(sys.stdin)
  print("1" if d.get("ok") else "0")
except Exception:
  print("0")
' 2>/dev/null || echo 0)"
  foto="$(printf '%s' "$body" | python3 -c '
import sys, json
try:
  d=json.load(sys.stdin)
  print("1" if d.get("foto_minio") else "0")
except Exception:
  print("0")
' 2>/dev/null || echo 0)"
  if [ "$ok" = "1" ] && [ "$foto" = "1" ]; then
    printf 'online|ok foto_minio'
  elif [ "$ok" = "1" ]; then
    printf 'offline|gateway_ok pero MinIO fotos caido'
  else
    printf 'offline|health ok=false'
  fi
}

mensaje_caida() {
  local nombre="$1" detalle="$2"
  cat <<EOF
🔴 <b>${nombre} fuera de línea</b>
El vigilante de plataforma no obtuvo respuesta sana.

Host: <code>${HOSTNAME_L}</code>
Detalle: <code>${detalle:-n/d}</code>
Hora: $(date '+%d-%m-%Y %H:%M:%S')

Revisa /estado. Si es la PWA: Traefik vivo + 502 = contenedor Swarm caído.
EOF
}

mensaje_ok() {
  local nombre="$1"
  cat <<EOF
🟢 <b>${nombre} en línea</b>
Volvió a responder.

Host: <code>${HOSTNAME_L}</code>
Hora: $(date '+%d-%m-%Y %H:%M:%S')
EOF
}

nombre_de() {
  case "$1" in
    pwa) echo "Aplicación (PWA)" ;;
    supabase) echo "Base de datos (Supabase)" ;;
    cap) echo "CAPTCHA de acceso (Cap)" ;;
    gateway) echo "Gateway Nexus / fotos" ;;
    *) echo "$1" ;;
  esac
}

causa_de() {
  local id="$1" detalle="$2"
  case "$id" in
    pwa) echo "Aplicación (PWA) fuera de línea (${detalle})" ;;
    supabase) echo "Supabase Auth no responde (${detalle})" ;;
    cap) echo "CAPTCHA Cap fuera de línea (${detalle})" ;;
    gateway) echo "Gateway Nexus / fotos fuera de línea (${detalle})" ;;
    *) echo "Falla de ${id} (${detalle})" ;;
  esac
}

# $1=id $2=tipo $3=ahora $4=detalle
procesar() {
  local id="$1" tipo="$2" ahora="$3" detalle="$4"
  local state="$STATE_DIR/$id"
  local previo="" archivo_existia=0
  local nombre
  nombre="$(nombre_de "$id")"

  mkdir -p "$STATE_DIR"
  if [ -f "$state" ]; then
    archivo_existia=1
    previo="$(tr -d '[:space:]' < "$state" || true)"
  fi
  [ -z "$previo" ] && previo="unknown"
  printf '%s\n' "$ahora" > "$state"

  if [ "$INIT" -eq 1 ]; then
    return 0
  fi
  if [ "$archivo_existia" -eq 0 ] && [ "$FORCE" -eq 0 ]; then
    return 0
  fi
  if [ "$ahora" = "$previo" ]; then
    return 0
  fi

  case "$ahora" in
    offline)
      enviar "$(mensaje_caida "$nombre" "$detalle")"
      reportar_incidente caida "$id" "$tipo" "$(causa_de "$id" "$detalle")" "$detalle"
      ;;
    online)
      enviar "$(mensaje_ok "$nombre")"
      reportar_incidente recuperacion "$id" "$tipo" "" ""
      ;;
  esac
}

IFS='|' read -r pwa_estado pwa_detalle <<<"$(sondear_pwa)"
IFS='|' read -r sb_estado sb_detalle <<<"$(sondear_supabase)"
IFS='|' read -r cap_estado cap_detalle <<<"$(sondear_cap)"
IFS='|' read -r gw_estado gw_detalle <<<"$(sondear_gateway)"

procesar pwa plataforma "$pwa_estado" "$pwa_detalle"
procesar supabase plataforma "$sb_estado" "$sb_detalle"
procesar cap plataforma "$cap_estado" "$cap_detalle"
procesar gateway plataforma "$gw_estado" "$gw_detalle"

if [ "$INIT" -eq 1 ]; then
  enviar "🤖 <b>Vigilante plataforma activo</b>
PWA: <b>${pwa_estado}</b>
Supabase: <b>${sb_estado}</b>
Cap: <b>${cap_estado}</b>
Gateway/fotos: <b>${gw_estado}</b>
Host: <code>${HOSTNAME_L}</code>
$(date '+%d-%m-%Y %H:%M:%S')"
fi
