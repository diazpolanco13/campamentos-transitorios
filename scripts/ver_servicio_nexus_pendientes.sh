#!/usr/bin/env bash
# Estado rápido del servicio nexus-pendientes.
set -euo pipefail
echo "=== systemctl ==="
systemctl is-active nexus-pendientes.service || true
systemctl --no-pager -l status nexus-pendientes.service | head -20 || true
echo
echo "=== últimas líneas log ==="
if [[ -f /var/log/nexus-pendientes.log ]]; then
  tail -30 /var/log/nexus-pendientes.log
else
  echo "(sin /var/log/nexus-pendientes.log aún)"
fi
