# Vigilante de servicios (alertas Telegram + `/estado`)

En el VPS corre un timer systemd cada **3 minutos**. Avisa por Telegram
**solo cuando cambia el estado** y abre/cierra el incidente en `/estado`
vía la Edge Function `registrar-incidente`.

Reutiliza el mismo bot que el vigilante SSH (`/opt/vigilante-ssh/config.env`).

**Por qué no Dokploy:** el 502 del 27-ago-2026 tumba el contenedor Swarm de
la PWA **y** Dokploy. Un monitor dentro de Dokploy no avisa. systemd en el
host sí.

| Qué | URL | `servicio` / `tipo` |
|---|---|---|
| PWA (HTTPS público) | `https://m0n1t0r-d3-3v3nt0s.net/` | `pwa` / `plataforma` |
| Supabase Auth | `…supabase.co/auth/v1/health` | `supabase` / `plataforma` |
| Cap (login) | `https://cap.m0n1t0r-d3-3v3nt0s.net/` | `cap` / `plataforma` |
| Gateway / fotos | `https://nexus.…/health` | `gateway` / `plataforma` |
| API institucional | `https://nexus.…/health/nexus` | `nexus` / `externo` |

| Pieza | Ruta |
|---|---|
| Ciclo (timer) | `nexusEndPoint/vigilante-ciclo.sh` → `/opt/vigilante-nexus/vigilante-ciclo.sh` |
| Nexus | `nexusEndPoint/vigilante-nexus.sh` |
| Plataforma | `nexusEndPoint/vigilante-plataforma.sh` |
| Estado Nexus | `/var/lib/vigilante-nexus/estado` |
| Estado plataforma | `/var/lib/vigilante-nexus/plataforma/<servicio>` |
| Timer | `vigilante-nexus.timer` (cada 3 min) |
| Incidentes app | `/opt/vigilante-nexus/config-incidentes.env` |

```bash
# Estado / próxima ejecución
systemctl list-timers vigilante-nexus.timer
cat /var/lib/vigilante-nexus/estado
ls /var/lib/vigilante-nexus/plataforma/

# Forzar comprobación (solo avisa si cambió)
sudo systemctl start vigilante-nexus.service

# Reenviar estado actual (Nexus + plataforma)
sudo /opt/vigilante-nexus/vigilante-ciclo.sh --init

# Desplegar versión del repo al VPS
sudo install -m 700 nexusEndPoint/vigilante-ciclo.sh \
  nexusEndPoint/vigilante-nexus.sh \
  nexusEndPoint/vigilante-plataforma.sh /opt/vigilante-nexus/
```

No es un poll agresivo al API institucional: el gateway cachea `/health/nexus`
~120 s; el timer solo golpea nuestro dominio. PWA/Cap/Supabase sí son GET
reales cada 3 min (baratos).

## Gotcha (23-jul-2026)

`/estado` **no** sondea en vivo: solo mira `incidentes_servicios`. Si el
vigilante abre caída por `unknown` (p. ej. `gateway_http=501`) y luego el
health vuelve a `online`, debe emitir `recuperacion`.

Bug previo: el script trataba `previo=unknown` igual que “primera corrida
sin historial” y, al recuperar, salía sin cerrar el incidente. `/registro`
seguía verde (health + búsqueda real) mientras `/estado` quedaba rojo.
Fix: baseline solo si **no existe** el archivo de estado; `unknown` real
sí dispara Telegram + `recuperacion`.
