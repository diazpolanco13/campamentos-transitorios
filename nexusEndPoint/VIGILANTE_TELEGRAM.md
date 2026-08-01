# Vigilante Nexus (alertas Telegram)

En el VPS corre un timer systemd que consulta
`https://nexus.m0n1t0r-d3-3v3nt0s.net/health/nexus` cada **3 minutos**
y avisa por Telegram **solo cuando cambia el estado** (caída o reactivación).
También abre/cierra el incidente en `/estado` vía la Edge Function
`registrar-incidente`.

Reutiliza el mismo bot que el vigilante SSH (`/opt/vigilante-ssh/config.env`).

| Pieza | Ruta |
|---|---|
| Fuente en repo | `nexusEndPoint/vigilante-nexus.sh` |
| Script en VPS | `/opt/vigilante-nexus/vigilante-nexus.sh` |
| Estado | `/var/lib/vigilante-nexus/estado` |
| Timer | `vigilante-nexus.timer` (cada 3 min) |
| Incidentes app | `/opt/vigilante-nexus/config-incidentes.env` |

```bash
# Estado / próxima ejecución
systemctl list-timers vigilante-nexus.timer
cat /var/lib/vigilante-nexus/estado

# Forzar comprobación (solo avisa si cambió)
sudo systemctl start vigilante-nexus.service

# Reenviar estado actual
sudo /opt/vigilante-nexus/vigilante-nexus.sh --init

# Desplegar versión del repo al VPS
sudo install -m 700 nexusEndPoint/vigilante-nexus.sh /opt/vigilante-nexus/vigilante-nexus.sh
```

No es un poll agresivo al API institucional: el gateway cachea `/health/nexus`
~120 s; el timer solo golpea nuestro dominio.

## Gotcha (23-jul-2026)

`/estado` **no** sondea Nexus en vivo: solo mira incidentes abiertos en
`incidentes_servicios`. Si el vigilante abre caída por `unknown` (p. ej.
`gateway_http=501`) y luego el health vuelve a `online`, debe emitir
`recuperacion`.

Bug previo: el script trataba `previo=unknown` igual que “primera corrida
sin historial” y, al recuperar, salía sin cerrar el incidente. `/registro`
seguía verde (health + búsqueda real) mientras `/estado` quedaba rojo.
Fix: baseline solo si **no existe** el archivo de estado; `unknown` real
sí dispara Telegram + `recuperacion`.
