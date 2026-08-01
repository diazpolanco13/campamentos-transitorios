#!/usr/bin/env bash
# Vigilante Nexus → Telegram
# Sondea https://nexus.…/health/nexus y avisa SOLO cuando cambia el estado
# (caída o reactivación). No spamea: un mensaje por transición.
#
# Config: /opt/vigilante-nexus/config.env → BOT_TOKEN, CHAT_ID
#         (enlace a /opt/vigilante-ssh/config.env)
# Estado: /var/lib/vigilante-nexus/estado

set -u
source /opt/vigilante-nexus/config.env
# Reporte de incidentes a la app (opcional; si falta el config, se omite).
[ -f /opt/vigilante-nexus/config-incidentes.env ] && source /opt/vigilante-nexus/config-incidentes.env

API="https://api.telegram.org/bot${BOT_TOKEN}/sendMessage"
HEALTH_URL="${NEXUS_HEALTH_URL:-https://nexus.m0n1t0r-d3-3v3nt0s.net/health/nexus}"
STATE_FILE="${NEXUS_STATE_FILE:-/var/lib/vigilante-nexus/estado}"
HOSTNAME_L="$(hostname -s 2>/dev/null || hostname)"

enviar() {
  curl -sS -o /dev/null --max-time 15 "$API" \
    -d chat_id="${CHAT_ID}" \
    -d parse_mode="HTML" \
    --data-urlencode text="$1" || true
}

# Abre/cierra el incidente en la app (tabla incidentes_servicios) vía la
# Edge Function registrar-incidente. Best-effort: nunca rompe el vigilante.
# $1 = caida|recuperacion  $2 = causa  $3 = detalle (texto corto)
reportar_incidente() {
  [ -n "${INCIDENTES_URL:-}" ] && [ -n "${VIGILANTE_INC_SECRET:-}" ] || return 0
  local evento="$1" causa="$2" detalle="${3:-}"
  local payload
  payload="$(python3 -c '
import json, sys
print(json.dumps({
  "evento": sys.argv[1],
  "servicio": "nexus",
  "tipo": "externo",
  "causa": sys.argv[2] or None,
  "detalle": {"detalle": sys.argv[3][:200]} if sys.argv[3] else {},
}))' "$evento" "$causa" "$detalle" 2>/dev/null)" || return 0
  curl -sS -o /dev/null --max-time 15 -X POST "$INCIDENTES_URL" \
    -H "Content-Type: application/json" \
    -H "X-Vigilante-Secret: ${VIGILANTE_INC_SECRET}" \
    -d "$payload" || true
}

# Normaliza a online|offline|unknown
sondear() {
  local body http estado upstream detail
  body="$(curl -sS --max-time 20 -w '\n%{http_code}' "$HEALTH_URL" 2>/dev/null || true)"
  http="$(printf '%s' "$body" | tail -n1)"
  body="$(printf '%s' "$body" | sed '$d')"

  if [ "$http" != "200" ] || [ -z "$body" ]; then
    printf 'unknown|gateway_http=%s||unknown' "${http:-000}"
    return
  fi

  estado="$(printf '%s' "$body" | python3 -c '
import sys, json
try:
  d=json.load(sys.stdin)
  print(d.get("nexus") or "unknown")
except Exception:
  print("unknown")
' 2>/dev/null || echo unknown)"

  upstream="$(printf '%s' "$body" | python3 -c '
import sys, json
try:
  d=json.load(sys.stdin)
  v=d.get("upstream_status")
  print("" if v is None else v)
except Exception:
  print("")
' 2>/dev/null || true)"

  detail="$(printf '%s' "$body" | python3 -c '
import sys, json
try:
  d=json.load(sys.stdin)
  print((d.get("detail") or "")[:120])
except Exception:
  print("")
' 2>/dev/null || true)"

  case "$estado" in
    online|offline|degraded) ;;
    *) estado=unknown ;;
  esac

  # bruto conserva degraded/offline para la causa del incidente en la app
  local bruto="$estado"

  # degraded se trata como offline para alerta (API inestable)
  if [ "$estado" = "degraded" ]; then
    estado=offline
  fi

  printf '%s|%s|%s|%s' "$estado" "${upstream}" "${detail}" "${bruto}"
}

mensaje_caida() {
  local upstream="$1" detail="$2"
  cat <<EOF
🔴 <b>Nexus fuera de línea</b>
El API de censo por cédula no responde.

Host: <code>${HOSTNAME_L}</code>
Upstream: <code>${upstream:-n/d}</code>
Detalle: <code>${detail:-sin detalle}</code>
Hora: $(date '+%d-%m-%Y %H:%M:%S')

El censo puede seguir con consultas guardadas o planilla manual.
EOF
}

mensaje_ok() {
  local upstream="$1"
  cat <<EOF
🟢 <b>Nexus en línea</b>
El API de censo por cédula volvió a responder.

Host: <code>${HOSTNAME_L}</code>
Upstream: <code>${upstream:-200}</code>
Hora: $(date '+%d-%m-%Y %H:%M:%S')

Ya se pueden buscar cédulas en vivo.
EOF
}

mensaje_gateway() {
  local detail="$1"
  cat <<EOF
🟠 <b>Gateway Nexus sin respuesta</b>
No se pudo leer <code>/health/nexus</code>.

Host: <code>${HOSTNAME_L}</code>
Detalle: <code>${detail:-n/d}</code>
Hora: $(date '+%d-%m-%Y %H:%M:%S')
EOF
}

IFS='|' read -r ahora upstream detail bruto <<<"$(sondear)"
[ -z "${bruto:-}" ] && bruto="$ahora"
# Distinguir "nunca corrió" (sin archivo) de unknown REAL (gateway sin
# respuesta). Antes: previo=unknown en ambos casos → al recuperar a online
# salía por "primera corrida" y NUNCA cerraba el incidente en /estado.
previo=""
archivo_existia=0
if [ -f "$STATE_FILE" ]; then
  archivo_existia=1
  previo="$(tr -d '[:space:]' < "$STATE_FILE" || true)"
fi
[ -z "$previo" ] && previo="unknown"

mkdir -p "$(dirname "$STATE_FILE")"
printf '%s\n' "$ahora" > "$STATE_FILE"

# --init: deja baseline y avisa el estado actual (instalación).
if [ "${1:-}" = "--init" ]; then
  enviar "🤖 <b>Vigilante Nexus activo</b>
Estado inicial: <b>${ahora}</b>
Host: <code>${HOSTNAME_L}</code>
$(date '+%d-%m-%Y %H:%M:%S')"
  exit 0
fi

# Primera corrida automática: solo si NO había archivo de estado.
if [ "$archivo_existia" -eq 0 ] && [ "${1:-}" != "--force-notify" ]; then
  exit 0
fi

if [ "$ahora" = "$previo" ]; then
  exit 0
fi

case "$ahora" in
  offline)
    enviar "$(mensaje_caida "$upstream" "$detail")"
    if [ "$bruto" = "degraded" ]; then
      reportar_incidente caida "API institucional NEXUS/SAIME degradada (búsquedas nuevas salen vacías)" "$detail"
    else
      reportar_incidente caida "API institucional Nexus fuera de línea" "$detail"
    fi
    ;;
  online)
    enviar "$(mensaje_ok "$upstream")"
    reportar_incidente recuperacion "" ""
    # Nexus volvió: reconsultar en segundo plano las cédulas capturadas
    # durante la caída (planilla manual / sin caché). Con lock interno.
    systemd-run --collect --unit "reconsulta-censo-$(date +%s)" \
      /opt/vigilante-nexus/reconsulta-censo.sh >/dev/null 2>&1 \
      || nohup /opt/vigilante-nexus/reconsulta-censo.sh >/dev/null 2>&1 &
    ;;
  unknown)
    enviar "$(mensaje_gateway "${upstream}|${detail}")"
    reportar_incidente caida "Gateway Nexus sin respuesta (no se pudo leer /health/nexus)" "${upstream}|${detail}"
    ;;
esac
