# Traspaso completo — Campamentos Transitorios

> **Fuente de verdad del negocio** (detalle largo). No está en el always-on de
> Cursor: la IA lo lee bajo demanda (`docs/traspaso.md`). Índice corto always-on:
> `CLAUDE.md`. Reglas operativas (grafo / caveman / UI): `.cursor/rules/`.
>
> Si eres IA/desarrollador retomando el proyecto (p. ej. desde el VPS), **lee
> esto**. Explica qué es, hacia dónde va, qué está hecho, cómo ejecutarlo y qué
> falta. Código y comentarios en **español**.

## Qué es

Herramienta de **gestión humanitaria (CCCM)** para la emergencia de Caracas/La
Guaira tras la tragedia del **24-jun-2026**. Nació como **Sala Situacional** de un
solo refugio, el **Parque del Oeste "Alí Primera"**, y tras el desalojo del parque
migró a gestionar la **red de ~50 Centros Transitorios** repartidos por el Área
Metropolitana y Gran Caracas. Hoy el producto es **la red de centros**: registrar
el **estado, capacidad y ocupación** de cada centro, decidir **a dónde reubicar
gente** (cupo real / cuello de botella) y seguir la **evolución diaria de la
ocupación** de toda la red.

> El módulo original del Parque "Alí Primera" (mapa por sectores, puntos de
> servicio, distribución de comida, salubridad) **fue retirado** del producto
> (commit `803d499`). El repositorio ya no contiene ese código. La herramienta
> actual se centra en `/centros`, `/dashboard` e `/incidencias`.

**Soberanía de datos:** todo se autoaloja. La capa de datos vive en un
**Supabase** propio (Postgres + Auth + Realtime + Storage) del proyecto
`xzwifkckkakldnzkdeby`. La PWA se sirve desde el VPS del usuario vía Dokploy. No
se usan nubes de terceros más que Supabase. **Único uso de Supabase Storage:**
las **fotos de los centros** (bucket público `centros-fotos`); el resto de los
datos viven en Postgres.

## Estado actual

- ✅ **Migración a Supabase completa (Fases 1–7).** Se eliminó el backend Fastify
  propio, el offline-first (Dexie/outbox/sync engine), el JWT propio y PGlite. La
  app ahora habla directo con Supabase vía `@supabase/supabase-js` (Postgres,
  Auth, Realtime, Storage) desde el frontend.
- ✅ **Esquema Supabase:** 7 tablas sync blob+jsonb + `ocupaciones_centros`
  + `reportes_centros` + `perfiles` + `historial` + las tablas del reporte de
  5 fases (`incidencias_centros` fue retirada el 09-jul), RLS por rol +
  centros asignados, Edge Functions `create-user`/`delete-user`/
  `update-user-password`. Ver sección "Supabase — esquema y RLS".
- ✅ **Datos migrados:** los centros del Excel en la tabla `centros` (hoy **61 activos**) (los 49
  del Excel `DATA CENTRAL 03JUL26.xlsx`; la UEN Gran Colombia se divide en 3
  edificios → `centro-03/51/52`) + snapshot inicial 2026-07-03 para los 51 en
  `ocupaciones_centros`; usuarios migrados a `auth.users` + `perfiles` (admin +
  xavier, login verificado). La fuente Excel y el JSON/MD generados viven en
  `scripts/`.
- ✅ **Frontend:** nueva capa `src/data/` (supabaseClient, authSupabase,
  useSupabaseQuery, reposSupabase, useOcupacionesCentros, desenvolver). Todos
  los componentes migrados a Supabase (login, centros, dashboard, usuarios).
- ✅ **Histórico de ocupación:** tabla `ocupaciones_centros`, gráfico individual
  en `DetalleCentro` y agregado de la red en `DashboardView` (Fase 6).
- ✅ **Cutover de producción (Fase 7):** `server/` eliminado, `docker-compose`/
 `Dockerfile.web`/`Caddyfile` actualizados, `refugio-backend` detenido en
 Dokploy, frontend redeployado. (Ver "Producción REAL".)
- ✅ **CRUD completo de centros:** además de editar, la app permite **crear
 centros nuevos** (botón en `PanelCentros` → `CentroForm` con `esNuevo`),
 **eliminarlos** (borrado suave, con confirmación `AlertDialog` en el footer
 del form) y **editar la identificación y las coordenadas** (lat/lng manual o
 GPS, pestaña I del form). El guardado usa el RPC **`upsert_centro`**
 (SECURITY INVOKER, aplicado en Supabase; referencia en
 `supabase/functions.sql`) que actualiza blob `data` + columna PostGIS `geom`
 en una sola llamada. Con esto quedó cerrado el GAP de `geom` documentado en
 la Fase 3.
- ✅ **Reporte diario por centro:** tabla `reportes_centros` (comidas por
 jornada + atenciones médicas, una fila por centro/día), formulario "Reporte
 del día" en la ficha del centro (reutiliza el parte numérico existente →
 `ocupaciones_centros` sigue alimentándose) y KPIs en `/dashboard`. (El
 sistema de incidencias de esa fase fue reemplazado por el seguimiento de
 salud/novedades y luego unificado el 09-jul; ver sección "Seguimiento de
 reportes".)
- ✅ **Sistema de usuarios con 5 roles y permisos por centro** (migración
 `sistema_usuarios_5_roles`, ver `docs/sistema-usuarios.md` y
 `supabase/sistema_usuarios.sql`): roles `admin` / `analista_sae` /
 `autoridad` / `supervisor` / `operador`; `perfiles.centros_asignados text[]`
 (reemplaza a `sector_asignado`); RLS por rol **y** centro asignado (helpers
 `mi_rol()`/`mis_centros()`/`mi_username()`/`mi_hash_id()`); Edge Functions `create-user` v2
 (genera `hash_id` en el servidor), `delete-user` y `update-user-password`
 (gestión de usuarios COMPLETA desde `/usuarios`); vista `/logs` (bitácora
 `historial` con Realtime, solo admin y autoridad) y `registrarHistorial()`
 en los repos. Usuarios actuales: `admin` (admin) y `xavier` (analista_sae).

- ✅ **Red renombrada a "campamentos" y ampliada a 61 activos** (ids `centro-NN`;
 el campo `nro` del blob se rellenó desde el número del id — 08-jul). El mapa
 agrupa por **unidad interna SEBIN** (`supervision.unidad_sebin`, catálogo en
 `src/domain/unidadesSebin.ts`).
- ✅ **Reporte diario de 5 fases** (Parte numérico · Control · Trabajos ·
 Requerimientos · Novedades) en `/centros/reportes/:centroId?vista=reporte`:
 tablas nuevas `reportes_control_dia`, `reparaciones_centros` (trabajos),
 `requerimientos_seguimiento`, `casos_salud_centros` (con `titulo`, migración
 `casos_salud_titulo`) y `eventos_reportes`. El control **hereda las
 respuestas del día anterior**; los casos de salud llevan estatus segmentado
 (activo/en proceso/resuelto) y antigüedad en días (`BadgeAntiguedad`, siempre
 vs el día real). **Editar reportes de fechas pasadas**: solo admin/analista
 (`puedeEditarReportesPasados`); el parte de un día pasado escribe SOLO el
 snapshot (`soloSnapshot`), nunca el estado vigente del centro.
- ✅ **Portal público de terreno `/terreno`** (bootstrap ligero compartido con
 `/censo`, `src/features/terreno/`): dos botones (Reporte diario / Censo),
 pantallas de instrucciones una-vez con toggle de reset
 (`src/lib/instruccionesCampo.ts`). Desde el 09-jul el acceso público va por
 **token de terreno** `?t=<token>` (ver siguiente punto); `?centro=<id>` solo
 sigue funcionando con sesión autenticada.
- ✅ **Tokens de terreno por campamento (09-jul, Fase 1 del plan de acceso de
 campo):** tabla `tokens_centros` (token secreto revocable por centro, tipos
 `personal`/`publico`, RLS solo admin/analista) + helpers `centro_de_token()`
 y `acceso_censo_centro()` + RPC pública `terreno_centro(p_token)`. Las RPC
 del censo (`censo_registrar/actualizar/eliminar/listado/completar/cierre`)
 ganaron `p_token default null`: con sesión autenticada nada cambia; sin
 sesión exigen token `personal` vigente y limitan todo al centro del token.
 Se **cerró la fuga anon**: `censo_listado_red*`, `censo_resumen_red`,
 `censo_centros`, `censo_error_cedula_duplicada` y `censo_normalizar_jefe_doc`
 quedaron solo para `authenticated`, y los buckets `centros-fotos`/
 `infraestructura-fotos`/`reparaciones-fotos` ya no aceptan escritura anon.
 ⚠️ Al recrear cualquiera de esas funciones, Postgres re-otorga EXECUTE a
 PUBLIC: repetir los revoke (ver `supabase/tokens_terreno.sql`). Frontend:
 `src/lib/tokenTerreno.ts` (lee `?t=` con respaldo en localStorage),
 `reposCenso` adjunta `p_token` automáticamente, `/terreno` y `/censo`
 resuelven el campamento vía `obtenerCentroTerreno()`. Hay 61 tokens
 `personal` + 61 `publico` activos (los `publico` los usará el canal de
 denuncias de la Fase 3 — pendiente, junto con la Fase 4: subdominio +
 cerrar :5173 del VPS). **Ficha del campamento:** sección "Acceso de
 terreno" existió en Resumen (`AccesoTerrenoCentro`); **retirado en cutover
 11-ago-2026**. Un **trigger** (`centros_generar_tokens`) crea solo el token
 `publico` (denuncias) al registrar/actualizar un campamento.
- ✅ **Login de terreno por QR (Fase 2, 09-jul) → CUTOVER 11-ago-2026:** el
 acceso por `/terreno?t=` y edges `login-terreno` / `activar-operador` fueron
 **deshabilitados (410)**. Tokens `personal` revocados; operadores entran solo
 con usuario y contraseña. Histórico del canje magiclink en git. Migración
 `cutover_cerrar_token_personal`. Denuncias `/denuncia?t=` (`publico`) siguen.
 **Alcance del operador (rol `operador`):** **Reporte + Población +
 Infraestructura de sus campamentos**: rutas `/centros/reportes*` /
 `/campo/*` / `/registro?centro=`, menú reducido (AppSidebar) y pestañas
 filtradas (`SECCIONES_FICHA_TERRENO`). Además, migración **`blindaje_lectura_refugiados`** (referencia en
 `supabase/blindaje_lectura_refugiados.sql`): `refugiados_select` y
 `beneficios_otorgados_select` estaban en `true` (¡toda sesión autenticada
 leía la ficha humanitaria de toda la red!) → ahora admin/analista/autoridad
 todo, supervisor/operador solo sus campamentos (en `refugiados` vía
 alojamiento + `updated_by = mi_username()` para el RETURNING del alta).
- ✅ **Cap obligatorio en denuncias (10-jul):** el alta pública ya no va por la
 RPC directa (anon revocado) sino por la Edge Function **`denuncia-registrar`**
 (`supabase/functions/denuncia-registrar/`), que verifica el token de Cap
 (siteverify, mismo `CAP_SECRET` que `login-with-cap`) antes de insertar y pasa
 la IP real como `p_ip` (la RPC ganó ese parámetro; migración
 `denuncia_registrar_cap_ip`). Frontend: `DenunciaView` monta `<cap-widget>`
 (estilo reutilizado de `features/auth/cap-login.css`) y `reposDenuncias`
 llama a la Edge Function con el `capToken`. Anti-flood en capas: Cap
 (proof-of-work) + topes de la RPC por campamento/IP/huella.
- ✅ **Denuncias de damnificados por QR (Fase 3, 09-jul):** tabla
 `denuncias_centros` + RPCs `denuncia_registrar` (alta anónima con el token
 `publico` del campamento, validaciones + freno de 20/hora por centro) y
 `denuncia_centro` (nombre para la página pública); SQL de referencia en
 `supabase/denuncias_refugiados.sql`. **Sin policy de INSERT** (solo la RPC
 definer escribe); las ven/gestionan quienes vigilan: admin/analista toda la
 red, autoridad lectura, **supervisor solo sus campamentos** (pasa revista y
 acciona); el **operador de terreno NO las ve** (el personal del centro es el
 potencial denunciado). Frontend: página pública **`/denuncia?t=`**
 (bootstrap ligero, una pantalla, anónima, el token público NO se guarda en
 localStorage), bandeja **`/incidencias/refugiados`**
 (`IncidenciasRefugiadosView`, filtros + resolver con nota, Realtime vía
 `useDenuncias`) y **hoja imprimible `/qrs-terreno`** (solo admin/analista):
 una página por campamento con el QR del personal y el QR público de
 denuncias, botón imprimir (truco CSS de visibilidad para imprimir solo las
 hojas).
- ✅ **Partes en formato Telegram** (negritas `**…**`, pie `REF: <centro_id> |
 <dia>` parseable por un bot futuro): botón "Copiar parte" por campamento
 (`src/domain/reporteTelegramCentro.ts`) y menú **Compartir** en
 `/centros/reportes` con diálogo de vista previa + copiar
 (`src/domain/reporteTelegramRed.ts`) y descarga del PDF.
- ✅ **PDF ejecutivo de 3 secciones** (`@react-pdf/renderer`,
 `src/features/centros/reporte-ejecutivo/` + dominio
 `reporteEjecutivoCampamentos.ts`): portada (KPIs, demografía H/M por grupo,
 censo SEBIN, control con donuts, unidades SEBIN), detalle del día en 3
 columnas (trabajos/salud/novedades con días abiertos) y tabla de la red
 ordenada por N°.
- ✅ **Unificación de incidencias (09-jul):** se eliminó la redundancia de
 vistas. Ficha del campamento: pestaña renombrada a **"Seguimiento"** (el
 `?vista=incidencias` se conserva por compatibilidad) con solo 2 sub-pestañas
 (**Salud** con segmentado En seguimiento/Archivados · **Novedades** con
 "ver anteriores"); desaparecieron "Seguimiento" (unión redundante) e
 "Historial" (duplicado). Grupo del sidebar: **bandeja única**
 `/incidencias/funcionarios` (estado En seguimiento/Histórico + calendario +
 resumen; absorbe las vistas archivadas y analítica, cuyas rutas redirigen).
 Se retiró el sistema legacy `incidencias_centros` (hook, lista, CRUD y tipos
 de dominio; el `drop table` en `supabase/drop_incidencias_centros.sql`
 quedó **pendiente de aplicar**). Ver "Seguimiento de reportes".
- ⚠️ **Datos piloto de simulación** sembrados el 08-jul en todos los
 campamentos (partes, controles, trabajos, requerimientos, casos, novedades)
 con `updated_by = 'simulacion'` / `creada_por = 'simulacion'`. Limpieza:
 `delete from <tabla> where updated_by = 'simulacion'` en las 7 tablas.
- ✅ **Censo nominal + registro por cédula vía Nexus (11–12-jul).** Además de
 **Importaciones Excel** (`censo_registros`, relaciones externas no
 verificadas importadas vía MCP), existe una **base nominal verificada**
 (`refugiados` / `familias_centro` / `alojamientos_refugiados` /
 `residencias_afectadas`, `/centros/refugiados`) alimentada por un flujo
 **por cédula** contra el API institucional **Nexus** (`/censo` → pestaña
 "Por cédula" → `CensoNexusPanel`): verifica identidad (foto SAIME pendiente,
 ver más abajo), crea el hogar, captura **damnificación por el terremoto**
 (severidad de vivienda, pérdidas familiares con fallecidos/desaparecidos,
 **nivel de afectación calculado** 🔴🟡🟢) y **bloquea con aviso accionable**
 (fecha/hora + botón WhatsApp a analistas SAE) si la cédula ya está activa en
 otro campamento. Ver sección "Censo nominal y registro por cédula (Nexus)".
- ✅ **Importaciones Excel redefinidas (16-jul):** la pestaña antes llamada
 «Censo anterior» es el repositorio de planillas externas; metadata
 `origen`/`fuente_archivo`/`centro_match` + RPC `censo_importar_lote`
 (upsert por cédula) + script `importar_relaciones_excel.py`.

- ✅ **Estado del sistema `/estado` + incidentes de servicios (18-jul):**
  tabla `incidentes_servicios` (RLS lectura admin/analista_sae/autoridad,
  Realtime, índice único parcial = un incidente abierto por servicio) escrita
  SOLO por la Edge Function **`registrar-incidente`** (verify_jwt false +
  header `X-Vigilante-Secret` contra `app_secrets.vigilante_incidentes_secret`;
  referencia `supabase/functions/registrar-incidente/`). El **vigilante del
  VPS** (`/opt/vigilante-nexus/vigilante-nexus.sh` +
  `config-incidentes.env`, fuera del repo) abre/cierra el incidente de Nexus
  en cada transición (causas distintas: degraded / offline / gateway sin
  respuesta) y registra `incidente_abierto`/`incidente_resuelto` en
  `historial`. Vista **`/estado`** (`features/estado/EstadoSistemaView`,
  permiso `puedeVerEstadoSistema` = admin/analista/autoridad): grupos
  "Nuestra plataforma" vs "Servicios externos (institución)", uptime 30 días,
  historial 90 días con duración en minutos y botón "Copiar parte" (formato
  Telegram; lógica pura en `domain/estadoServicios.ts`). **Banner público**
  vía RPC anon `estado_servicios_publico()` (solo incidentes ABIERTOS, sin
  PII — ⚠️ mismo gotcha de EXECUTE si se recrea): `AvisoIncidenteNexus` en
  `/terreno` y detalle "falla registrada desde las HH:MM" en `EstadoNexusApi`
  (`/censo`) — corta el bombardeo de reportes cuando cae el API institucional.
  SQL de referencia: `supabase/incidentes_servicios.sql`. Fase 2 opcional
  pendiente: Uptime Kuma en Dokploy monitoreando PWA/Supabase/bot/Cap y
  notificando por webhook a la misma Edge Function (tipo `plataforma`).
- ✅ **IA local disponible (16-jul):** Hermes Agent gateway en Dokploy
  (proyecto independiente `hermes-agent`) consumiendo Gemma 4 12B en una DGX
  Spark vía Tailscale. API OpenAI-compatible en `127.0.0.1:8642` (solo VPS).
  **Ver `docs/hermes-gateway.md`** antes de integrar IA en la app (key en
  Dokploy, gotchas de context_length/max_tokens, qué no tocar).

### Qué falta / próximos pasos
- 🪪 **Identidad de operadores de terreno — Fase A HECHA (16-jul):** login
  por cédula vía Nexus en producción: usuario único `op-<cedula_norm>` por
  persona (Edge Function `login-terreno` v3 con pasos consultar/entrar,
  `IdentificacionCedula.tsx` en `/terreno`, catálogo
  `src/domain/jerarquiasSebin.ts`), bandeja de aprobación
  **`/usuarios/terreno`** (admin + analista; rechazo = bloqueo de login),
  columnas `perfiles.cedula_norm/verificado_nexus/aprobacion*` (migración
  `identidad_operadores_fase_a`, referencia `supabase/identidad_operadores.sql`),
  tabla `app_secrets` (RLS deny-all; `nexus_gateway_secret` para consulta
  server-side del gateway) y limpieza de 49 usuarios de prueba/basura
  (303→254 operadores). **Detalle y decisiones en
  `docs/plan-identidad-terreno.md`** — leerlo antes de tocar `/terreno` o
  `login-terreno`. **Fase B también HECHA (16-jul):** vínculo Telegram real
  vía bot **`@camp_inteligent_bot`** — webhook serverless a la Edge Function
  `telegram-bot` (sin contenedor), tablas `telegram_operadores`/
  `telegram_vinculos` + RPC `telegram_generar_vinculo` (referencia
  `supabase/telegram_operadores.sql`), botón "Vincular Telegram" en /terreno
  y badge en la bandeja; token del bot en `app_secrets` y
  `/etc/dokploy/campamento-bot.env`. **Alertas de seguridad y recordatorios
  también HECHOS (16-jul):** alerta de login con botón "No fui yo" (bloquea
  la cuenta, `alerta_suplantacion` en historial) y mensajería programada vía
  pg_cron → Edge Function `recordatorio-partes` (buenos días 7:00 VE con
  estado por área + censo; recordatorios 11/12/13 y cada 30 min hasta 18:00
  VE a quien no complete; referencia `supabase/recordatorios_terreno.sql`).
  Pendientes: bot emisor de partes y el resto de
  **Fase C** (revisión IA de reportes vía Hermes, resumen a analistas — worker
  en el VPS, no Edge Function: Hermes solo escucha en 127.0.0.1); el flujo legacy
  `funcionario` (v2) sigue vivo para /censo hasta que se decida apagarlo, y
  la fusión de duplicados `operador-*` viejos ocurre gradualmente cuando cada
  persona se identifica con su cédula.
- ✅ **Foto SAIME en el censo por cédula** — HECHO (22-jul-2026): gateway
  `GET /foto/<foto_nombre>` con **cache-aside**: primero MinIO **propio**
  (compose Dokploy `minio-cache`, bucket `saime-fotos`); miss → MinIO
  institucional (`alfa-images`) vía VPN + PutObject best-effort al cache
  (hit ~0.06 s vs miss ~0.6 s; fotos cacheadas se sirven aun con VPN caída).
  UI `/censo` prioriza SAIME sobre foto de campo en Storage. **No** cachear
  en Supabase (factura / salida prevista). Bucket `media` reservado para
  migrar fotos de campo/centros. Las ~8,5k fotos del precache de consultas
  quedaron precalentadas con `nexusEndPoint/backfill_fotos.py` (usuario bot
  `robot`, rol `autoridad`; creds en `/etc/dokploy/backfill-fotos.env`).
  El gateway cachea la validación JWT 5 min (rate limit Supabase Auth).
  Detalle: `nexusEndPoint/README.md` §6.
- ✅ **Traslado formal entre centros (nominal)** — HECHO (20-jul-2026): el
  aviso "ya activa en otro campamento" del censo por cédula ahora ofrece
  **"Trasladar solo a esta persona"** o **"Trasladar a toda la familia (N
  miembros)"**. RPC `trasladar_nominal_a_centro` (`SECURITY DEFINER`,
  `supabase/traslado_nominal_censo.sql`): egresa los alojamientos viejos con
  motivo/destino de traslado y, en modo familia, recrea el hogar completo en
  el destino (referencia, damnificación, residencia afectada, seguimiento);
  queda en `historial` como `traslado_nominal`. El destino debe ser un
  campamento donde la sesión puede censar (`mis_centros()`). El reporte por
  Telegram a analistas sigue como vía secundaria para casos dudosos.
- 🤖 **Bot de Telegram (emisor):** publicar el parte por campamento y el parte
  general de la red al grupo de enlaces desde un contenedor en Dokploy
  (formateadores ya listos en `src/domain/reporteTelegram*.ts`; el `REF:` del
  pie permite casar mensajes con la BD sin matching difuso).
- 🔁 **Traslados entre centros:** hoy el tablero es comparativo (decides tú).
  Falta (si se pide) registrar/rastrear **movimientos de refugiados entre
  centros** y, opcionalmente, un motor de sugerencias de reubicación.
- 🗑️ **Limpieza menor:** restos del módulo del parque que se pueden borrar sin
  riesgo: `src/data/centrosTransitorios.ts` (catálogo estático de los 51
  centros, fallback; la fuente de verdad es la tabla `centros`), `src/ui/`
  (Modal, clases.ts, useEsMovil — sin consumidores), las carpetas vacías
  `src/features/{distribucion,lineas,puntos,salubridad,sectores}/` y las
  dependencias `terra-draw`/`terra-draw-maplibre-gl-adapter` de `package.json`
  (ya no se importan).
- 📊 **Dashboard de la red:** hoy `/dashboard` agrega la red. Se puede ampliar
  con mapa de calor por parroquia, series por grupo (Área Metropolitana vs Gran
  Caracas), etc.

## Cómo ejecutar (desarrollo)

```bash
# Frontend (raíz). Único proceso: ya no hay backend propio.
npm install
npm run dev   # http://localhost:5173
npm run build # genera dist/ (PWA)
npm run typecheck
```

Requiere `.env` local (no se commitea) con:
```
VITE_SUPABASE_URL=https://xzwifkckkakldnzkdeby.supabase.co
VITE_SUPABASE_ANON_KEY=<anon public key>
VITE_MAPTILER_KEY=           # opcional, bases "HD"
```
Sin `VITE_SUPABASE_*` la app no puede loguear ni leer datos.

**Atajo (recomendado):** `./reiniciar.sh` levanta el frontend (:5173) en
segundo plano. Subcomandos: `update` (git pull ff-only + reinicia), `stop`,
`logs`. Reinstala dependencias solo si cambió `package-lock.json`. ⚠️ Es **solo
desarrollo**; **no** toca producción.

## Stack

**Frontend:** React 19 + Vite 7 + TypeScript + Tailwind v4 (plugin
`@tailwindcss/vite`, sin config) · **MapLibre GL** (mapa; Terra Draw quedó como
dependencia en `package.json` pero **ya no se usa** desde que se retiró el
módulo del parque) · **@supabase/supabase-js** (Postgres, Auth, Realtime, Storage) ·
**vite-plugin-pwa** (service worker para caché de assets) · **react-router-dom**
(rutas `/`, `/dashboard`, `/incidencias`, `/usuarios`, `/logs`) · **recharts** (gráficos,
vía componente `chart` de shadcn) · **react-day-picker** + **date-fns** (los
requiere el componente `calendar` de shadcn, usado en incidencias). UI con
**shadcn/ui** (Radix + cva + `cn()` en `src/lib/utils.ts`, componentes en
`src/components/ui/`, estilo `radix-nova` en `components.json`).

**Capa de datos:** **Supabase** (Postgres + Auth + Realtime + Storage),
accedida vía `@supabase/supabase-js` desde el frontend. No hay backend propio:
cada mutación es un `upsert`/`delete` directo a Postgres; Realtime
(`postgres_changes`) refresca la UI en todos los dispositivos conectados. La
creación de usuarios se hace con una **Edge Function** (`create-user`) que usa
`service_role` (el frontend nunca tiene esa key).

## Arquitectura del frontend

```
src/
├─ domain/ tipos.ts (modelo + catálogos), estandares.ts (Esfera),
│  centrosTransitorios.ts (modelo del centro + normalizar),
│  capacidadCentros.ts (cupo real / cuello de botella según Esfera),
│  redCentros.ts (KPIs y agregados de la red),
│  prioridadCentros.ts (orden de urgencia),
│  serieOcupacionCentros.ts (series temporales con carry-forward),
│  reporteDiario.ts (tipos y helpers del reporte diario: comidas por jornada,
│    atenciones médicas, racionesDelDia, reporteDelDia…),
│  seguimientoReportes.ts (casos de salud + novedades: contadores, series,
│    severidad por día para calendarios),
│  permisos.ts (5 roles: INFO_ROLES + helpers puedeEscribir,
│    puedeGestionarUsuarios, puedeVerLogs, puedeCrearCentros,
│    puedeEditarCentro, puedeResolverIncidencia),
│  refugiados.ts (censo nominal: Refugiado, FamiliaCentro, AlojamientoRefugiado,
│    ResidenciaAfectada + normalizadores; ver "Censo nominal…"),
│  nivelAfectacionHogar.ts (🔴🟡🟢 calculado, severidad vivienda + pérdidas),
│  nexusPersona.ts (tipos del slim de Nexus), geografiaResidencia.ts
│    (objetivos geográficos para el mapa de residencia sin geocodificador),
│  censoResumen.ts
├─ data/ supabaseClient.ts (cliente supabase-js con VITE_SUPABASE_*),
│  authSupabase.ts (login/signOut/onAuthStateChange + perfil desde `perfiles`),
│  useSupabaseQuery.ts (hook select + Realtime, reemplaza a useLiveQuery),
│  useSupabaseConectado.ts (estado de conexión a Realtime para la UI),
│  useOcupacionesCentros.ts (snapshots de `ocupaciones_centros` con Realtime),
│  useReportesCentros.ts / useCasosSaludCentros.ts / useEventosReportes.ts
│    (reportes, casos de salud y novedades con Realtime, mismo patrón que
│    useOcupacionesCentros),
│  reposReportes.ts (guardarReporteDiario) · reposCasosSalud.ts ·
│    reposEventosReportes.ts,
│  edgeFunctions.ts (invocarEdgeFunction: helper para llamar Edge Functions),
│  historial.ts (registrarHistorial fire-and-forget + useHistorial con
│    Realtime para /logs),
│  reposSupabase.ts (upserts/deletes; centros vía RPC `upsert_centro` +
│    `eliminarCentro` + snapshot de ocupación al guardar centro),
│  desenvolver.ts (aplana filas blob+jsonb `{id,updated_at,deleted,data}` → T),
│  normalizarGeom.ts (hex EWKB/WKT/GeoJSON de PostgREST → GeoJSON Point),
│  supabase.ts (subida de foto de centro al bucket `centros-fotos`),
│  centrosTransitorios.ts (catálogo estático de los 51 centros, fallback),
│  preferenciasMapa.ts (vista guardada en localStorage),
│  reposRefugiados.ts (CRUD censo nominal + RPC upsert_refugiado_identidad /
│    estado_nominal_cedula, ver "Censo nominal…"), reposCensoNexus.ts (alta
│    desde ficha Nexus → nominal), reposNexus.ts (cliente del gateway Nexus
│    con caché en `nexus_consultas`), reposCenso.ts (censo rápido staging +
│    `censo_centros`/`terreno_centro`), useRefugiadosRed.ts (Realtime red-wide),
│    loginTerreno.ts (canjea token QR por sesión), tokenTerreno.ts (lee `?t=`)
├─ map/ estiloMapa.ts (estilos base del mapa; MapView.tsx se retiró con el parque)
├─ features/ centros/ (FOCO: CentrosView, FichaCentroView (/centro/:id),
│  CentrosMap, MarcadorCentro, InfoCentro,
│  DetalleCentro (panel + secciones Seccion*Centro reutilizables),
│  TableroCentros, CentroForm, LevantamientoCentro,
│  RequerimientosCentro, PanelCentros, ControlesMapaCentros, IconosAlerta,
│  GraficoOcupacionCentro, ReporteDiarioForm, ReporteDiarioCentro,
│  SeguimientoReportesCentro) ·
│  incidencias/ (IncidenciasLayout + IncidenciasFuncionariosView (bandeja
│  única /incidencias/funcionarios), IncidenciasRefugiadosView (denuncias),
│  CalendarioIncidencias, ListaSeguimientoReportes) ·
│  dashboard/ (DashboardView, GraficoOcupacionRed) ·
│  refugiados/ (censo nominal — RefugiadosRedView (/centros/refugiados),
│  RefugiadoDetalleRedView, FichaRefugiadoView (embebida en /centro/:id),
│  RefugiadoForm (alta manual), FamiliaresSection, FamiliaresReferenciaSection,
│  ResidenciaAfectadaSection + CamposResidenciaAfectada + MapaResidencia,
│  SaludBienestarSection, DocumentacionLegalSection, TallasDotacionesSection,
│  HabilidadesMediosVidaSection, BeneficiosRefugiadoSection,
│  ApoyosHogarSection, SeguimientoNotasSection, AgregarFamiliarHogarDialog,
│  DotacionesPendientesView (/centros/dotaciones-pendientes)) ·
│  censo/ (censo rápido staging: CensoRedView/CensoCentroPanel/
│  CensoCentroDetalleView (/centros/censo-rapido) + DesgloseDemografico,
│  DesglosePersonal, PersonalResumen; **censo nominal por cédula**:
│  CensoView (/censo, público) → pestañas Por cédula (**CensoNexusPanel**,
│  ver "Censo nominal…") / Planilla manual; EstadoNexusApi) ·
│  terreno/ (portal público /terreno sin login: TerrenoView con accesos
│  Reporte/Geolocalizar/Autoridades/Capacidad/**Censo**, instrucciones
│  una-vez, ContactoAnalistasTerreno) ·
│  tablero/ (DemografiaResumen) ·
│  auth/Login · usuarios/GestionUsuarios · logs/ (LogsView (/logs)) ·
│  (distribucion/, lineas/, puntos/, salubridad/, sectores/ quedaron VACÍAS
│   tras retirar el módulo del parque; se pueden borrar)
├─ components/ Navbar, PanelFlotante, MarcaAgua, BadgeRol, PantallaCarga,
│  AccionesContacto · ui/ (componentes shadcn: card, chart, badge, alert-dialog,
│  command, select, calendar, tabs…)
├─ lib/ utils.ts (cn())
└─ ui/ (legacy, SIN consumidores: Modal, clases.ts, useEsMovil — se puede borrar)
```

Rutas (react-router en `src/main.tsx` + `src/App.tsx`): `/` = `CentrosView`
(red de Centros Transitorios, **foco actual**), `/centro/:id` =
`FichaCentroView` (ficha completa de un centro a pantalla completa:
multicolumna en escritorio lg+, una columna en móvil; se abre desde el tablero
y, en móvil, desde el botón "detalles" del mapa), `/dashboard` = `DashboardView`
(sala de control a pantalla completa, solo lectura), `/incidencias` →
redirige a la **bandeja única** `/incidencias/funcionarios`
(`IncidenciasFuncionariosView`; las rutas viejas `/incidencias/archivadas` y
`/incidencias/analitica` también redirigen ahí),
`/usuarios` = `GestionUsuarios` (admin), `/logs` = `LogsView` (bitácora,
admin y autoridad). En prod Traefik (Dokploy) hace fallback SPA a
`index.html`; en la PWA se añadió `navigateFallback` en `vite.config.ts` para
deep-link offline a esas rutas.

Censo nominal: `/centros/refugiados` = `RefugiadosRedView` (población de toda
la red), `/centros/refugiados/:alojamientoId` = detalle,
`/centros/censo-rapido` = red-wide del censo de staging,
`/centros/dotaciones-pendientes` = reportes de kit pendiente. **Públicas sin
login** (antes del gate de sesión en `App.tsx`): `/censo` (planilla + censo
por cédula, ver "Censo nominal…") y `/terreno` (portal de campo con QR).

Conceptos del dominio (ver `src/domain/tipos.ts`):
- **`Vulnerables`**: desglose demográfico por edad y sexo con grupos etarios
  excluyentes que suman la población: recién nacidos (0-2), niñez (3-11),
  adolescentes (12-17), adultos (18-59), adultos mayores (60+); más grupos
  transversales `embarazadas` y `discapacidad/patologías` (subconjuntos que
  pueden solaparse); y `mascotas` (conteo aparte que **no** suma como
  población). `normalizarVulnerables` tolera filas viejas sin los campos nuevos
  (default 0).
- **CentroTransitorio**: levantamiento de campo (secciones I–VI:
  identificación, coordinación, seguridad, servicios sí/no, población,
  novedades), `requerimientos[]`, `capacidad` (camas/duchas/pocetas/lavaderos/
  contenedores **instaladas vs operativas** + agua tanque/operativa/litros),
  `ocupacion` (`Vulnerables`), **`personal`** (`PersonalCentro`: funcionarios,
  médicos, psicólogos, justicia TJS/MP/Defensoría), `familias_ocupadas`,
  `responsables`, `foto_url`, `estado`, `notas`. Helpers: `poblacionCentro()`
  (refugiados), `totalPersonalOperativo()`, `personasLogistica()` (refugiados +
  personal → demanda de agua/comida/baños).
- **Cuello de botella** (`capacidadCentros.ts`, pura): `analisisCentro(centro)`
  usa **`personasLogistica`** para calcular requerimientos Esfera (pocetas
  1/20, duchas 1/50, agua 15 l/persona/día; camas 1:1), toma la **capacidad
  efectiva = mínimo** entre los recursos medidos, y de ahí **`cupoReal`** y
  **`cuelloDeBotella`**. Semáforo verde/amarillo/rojo por % de ocupación.
- Todo lleva `id`, `updated_at`, `updated_by` (con sesión = `user.username`).

## Supabase — esquema y RLS

Proyecto `xzwifkckkakldnzkdeby`. El conteo de "12 tablas" de abajo quedó
desactualizado con el tiempo (se sumaron `censo_registros`, `tokens_centros`,
`denuncias_centros`, `nexus_consultas`, las 4 tablas nominales de abajo y
otras del reporte de 5 fases) — usa `list_tables` (MCP Supabase, `verbose`)
para el esquema real; aquí solo se documentan los grupos relevantes:

**7 tablas sincronizables (blob + jsonb, idénticas al backend Fastify viejo):**
`sectores`, `puntos`, `lineas`, `censos`, `distribuciones`, `limpiezas`,
`centros`. Esquema: `id text PK, updated_at bigint, updated_by text, deleted
bool, data jsonb`. `centros` además tiene `geom geography(Point, 4326)` (PostGIS)
aparte del blob. Upsert **last-write-wins** (`updated_at`); borrado **suave**
(`deleted: true`). El frontend usa `desenvolver()` para aplanar `data` + metadatos
al tipo de dominio (y `normalizarGeom()` para convertir el hex EWKB que
devuelve PostgREST en GeoJSON Point).

**RPC `upsert_centro(p_id, p_data, p_lng, p_lat)`** (aplicada, migración
`upsert_centro_rpc`; SQL de referencia en `supabase/functions.sql`): upsert del
blob `data` + recálculo de `geom` en una sola llamada (supabase-js no puede
escribir geography directamente). `SECURITY INVOKER` → la RLS de `centros`
sigue aplicando; `EXECUTE` solo para `authenticated`. Es la vía por la que
`guardarCentro()` crea/edita centros (incl. coordenadas).

**`ocupaciones_centros`** (tipada, el histórico): `id uuid PK default
gen_random_uuid()`, `centro_id text not null references centros(id) on delete
cascade`, `dia date not null`, `ts bigint`, `total_afectados int`, `familias
int`, `personal_total int`, `ocupacion jsonb`, `updated_at bigint`,
`updated_by text`, **`unique(centro_id, dia)`** (una fila por centro por día; la
última edición del día gana), índices en `(dia)` y `(centro_id, dia)`.

**`reportes_centros`** (tipada, reporte diario; SQL de referencia en
`supabase/reportes_incidencias.sql`): `id uuid PK default gen_random_uuid()`,
`centro_id text not null references centros(id) on delete cascade`, `dia date
not null`, `comidas jsonb` (`{desayuno, almuerzo, cena}` → `{raciones,
hora_llegada, proveedor, observacion}`), `atenciones_medicas int`,
`observaciones text`, `updated_at bigint`, `updated_by text`,
**`unique(centro_id, dia)`** (una fila por centro por día; la última edición
gana), índices en `(dia)` y `(centro_id, dia)`.

**`incidencias_centros`** — **RETIRADA (09-jul-2026).** Era el sistema viejo
de incidencias (etiquetas urgente/importante/cotidiana); quedó vacía y sin
consumidores cuando el seguimiento pasó a `casos_salud_centros` +
`eventos_reportes`. El frontend ya no la referencia (se eliminaron
`useIncidencias`, `ListaIncidencias`, `domain/incidencias` y su CRUD en
`reposReportes`). ⚠️ El `drop table` está pendiente de aplicar:
`supabase/drop_incidencias_centros.sql`.

**`perfiles`**: `user_id uuid references auth.users`, `username text unique`,
`nombre`, `rol check in (admin, analista_sae, autoridad, supervisor,
operador)` (default `operador`), **`centros_asignados text[] not null default
'{}'`** (reemplaza al viejo `sector_asignado`), `jerarquia`, `cedula`,
`responsabilidad`, `whatsapp`, `telegram`, `brazalete`, `hash_id unique`,
`marca_agua bool default true`, `created_at timestamptz default now()`.
Vinculada a `auth.users` por `user_id`. Los usuarios de campo no tienen email
real → se usa el sintético `<username>@refugio.app` en `auth.users`.

**`historial`**: `id uuid, ts bigint, usuario text, accion, entidad,
entidad_id, detalle jsonb`. Bitácora con UI en `/logs` (solo admin y
autoridad); en la publicación Realtime. El frontend inserta vía
`registrarHistorial()` (`src/data/historial.ts`, fire-and-forget) desde
`guardarCentro`/`eliminarCentro`/`guardarReporteDiario` y los repos de casos
de salud y eventos; las Edge Functions insertan las acciones de usuarios.

**Censo nominal (4 tablas tipadas):** `refugiados` (`cedula_norm` **única en
toda la red**), `familias_centro`, `alojamientos_refugiados`,
`residencias_afectadas` (`unique(familia_id)`). Esquema y detalle de campos en
la sección "Censo nominal y registro por cédula (Nexus)" — no lo dupliques
aquí, esa sección es la fuente de verdad.

**RPC `upsert_residencia_afectada(...)`** (referencia en
`supabase/`, `SECURITY DEFINER`): upsert de la vivienda afectada de una
familia; acepta `p_lng`/`p_lat` `null` (geom queda `null`, se puede completar
después sin perder lo ya guardado — `coalesce(excluded.geom, ...)` en el
`on conflict`).

**RPC `upsert_refugiado_identidad(...)` y `estado_nominal_cedula(...)`**
(agregadas 11–12-jul, `SECURITY DEFINER`, bypassan la RLS de `refugiados`/
`alojamientos_refugiados` a propósito y con alcance mínimo — ver "Censo
nominal…" para el porqué exacto): resuelven el find-or-create por cédula y el
chequeo de duplicados cross-centro sin el punto ciego de
`blindaje_lectura_refugiados`. ⚠️ Recuerda el gotcha de `CREATE OR REPLACE`
reseteando `EXECUTE` a `PUBLIC` — documentado con el comando de verificación
en esa misma sección.

**RLS por rol + centro** (migración `sistema_usuarios_5_roles`, SQL de
referencia en `supabase/sistema_usuarios.sql`). Helpers `SECURITY DEFINER`
estables: `mi_rol()`, `mis_centros()`, `mi_username()`, `mi_hash_id()` (leen
`perfiles` por `auth.uid()` sin recursión; el último evita un subselect directo
sobre `perfiles` dentro de `perfiles_update`, que dispara "infinite recursion
detected in policy"). Se usan como `(select mi_rol())` → initplan.
Matriz:

- `centros` / `ocupaciones_centros` / `reportes_centros`: **select** —
  `admin/analista_sae/autoridad` todo; `supervisor/operador` solo
  `id/centro_id = any(mis_centros())`. **insert/update** — `admin/analista_sae`
  todo; `supervisor/operador` solo sus centros (insert de `centros` solo
  admin/analista). **delete** — solo `admin/analista_sae`.
- `incidencias_centros` (retirada): su policy especial (`operador` solo
  resolvía las suyas vía `creada_por`) desaparece con el drop pendiente.
- `perfiles`: select/insert/update/delete — `admin` todo; cada usuario lee y
  edita su propia fila **sin poder cambiar** `rol`, `centros_asignados` ni
  `hash_id`. (El `hash_id` dejó de ser legible por todos; nadie más necesita
  leer perfiles ajenos porque `updated_by` guarda el username en texto.)
- `historial`: select — solo `admin` y `autoridad`; insert — los 4 roles que
  escriben; sin update; delete solo admin.
- Las 6 tablas blob del módulo retirado del parque (sectores, puntos, lineas,
  censos, distribuciones, limpiezas) conservan las policies viejas con los
  roles `coordinador`/`campo` (ya inexistentes) → en la práctica solo admin
  escribe. No se tocaron (módulo retirado).

**Edge Functions** (desplegadas vía MCP `deploy_edge_function`, `verify_jwt:
true` + check interno de rol admin; referencia versionada en
`supabase/functions/<nombre>/index.ts`; entrypoint `Deno.serve(...)` — ojo: con
`export default` la request se queda colgada hasta el idle timeout):

- **`create-user` v2**: valida los 5 roles y que los `centros_asignados`
  existan; **genera el `hash_id` en el servidor** (`XXXX-XXXX` hex, único);
  crea `auth.users` + `perfiles` (con rollback del auth.user si falla el
  perfil) y registra `crear_usuario` en `historial`.
- **`delete-user`**: rechaza el auto-borrado; `auth.admin.deleteUser` (el
  `ON DELETE CASCADE` arrastra el perfil); registra `eliminar_usuario`.
- **`update-user-password`**: `auth.admin.updateUserById(user_id, {password})`;
  registra `cambiar_password` (sin la contraseña).

El frontend las invoca con `invocarEdgeFunction()` (`src/data/edgeFunctions.ts`,
usa `supabase.functions.invoke` con el token de la sesión). **CORS:** las tres
funciones deben permitir en `Access-Control-Allow-Headers` los headers que
adjunta supabase-js: `authorization`, `x-client-info`, `apikey`, `content-type`
(sin `x-client-info`/`apikey` el preflight desde el navegador falla aunque
`curl` funcione).

**Bucket `centros-fotos`** (Storage, público, 5 MB, solo imágenes): las fotos se
suben con la anon key (RLS `insert`/`update`/`select` para `anon,
authenticated` en `storage.objects` con `bucket_id = 'centros-fotos'`). La URL
pública se guarda dentro de `data` del centro (`foto_url`) y viaja con el sync.
Sin cambios respecto a la fase pre-migración.

**Verificación / auditoría:** `get_advisors` (MCP Supabase) con `type=security`
reporta advertencias conocidas y no críticas: `spatial_ref_sys` sin RLS (tabla
de PostGIS, no de la app), `postgis` instalado en `public`, funciones
`st_estimatedextent`/`rls_auto_enable` `SECURITY DEFINER` ejecutables por
`anon`/`authenticated` (propias de PostGIS/Supabase), y `centros-fotos` con
policy broad SELECT (público, permite listar). Ninguna afecta a las tablas de
la app.

## Histórico de ocupación de centros

Tabla `ocupaciones_centros` (tipada, no blob). **Una fila por centro por día**
(`unique(centro_id, dia)`): la última edición del día gana. El frontend escribe
el snapshot desde `reposSupabase.guardarCentro()` cuando la `ocupacion` cambió
respecto al centro previo (no hay trigger de BD; el frontend sabe si cambió).

- **Hook `useOcupacionesCentros({ centroId?, desde? })`** (`src/data/`): select
  inicial + Realtime (`postgres_changes` a `ocupaciones_centros`). Devuelve
  `SnapshotOcupacion[]`.
- **Lógica pura `src/domain/serieOcupacionCentros.ts`**:
  `serieDiariaOcupacionRed(snapshots, centros)` (agregado de Caracas por día con
  carry-forward del último snapshot conocido de cada centro),
  `serieDiariaOcupacionCentro(centroId, snapshots)` (serie de un centro),
  `variacionUltimoDia(snapshots)` (entradas/salidas netas del día).
- **`GraficoOcupacionCentro`** (`AreaChart` recharts, en `DetalleCentro`, sección
  desplegable): serie diaria de un centro. Eje X = fecha, eje Y = total de
  refugiados.
- **`GraficoOcupacionRed`** (`AreaChart` en `DashboardView`): serie agregada de
  los 51 centros, con desglose por grupo (Área Metropolitana vs Gran Caracas).
- **Snapshot inicial 2026-07-03** cargado para los 51 centros en la Fase 2 (el
  "día 1" de la red). Los gráficos arrancan desde ahí.

Usa el componente `chart` de shadcn (`ChartContainer`/`ChartTooltip`) con
`var(--chart-N)` como colores (siguiendo la regla del workspace de usar el MCP
de shadcn para cualquier diseño de UI).

## Seguimiento de reportes (salud y novedades) — unificado 09-jul-2026

El "seguimiento" son los dos datasets que nacen del reporte diario de 5 fases:
**casos de salud** (`casos_salud_centros`, ciclo activo → en proceso →
resuelto → archivado) y **novedades** (`eventos_reportes`, positivas/
negativas). El sistema viejo de "incidencias" (`incidencias_centros`,
etiquetas urgente/importante/cotidiana) **fue retirado** (ver "Supabase —
esquema y RLS"). Tras la unificación, cada dato vive en UNA vista por nivel:

- **Ficha del campamento, pestaña "Seguimiento"** (`?vista=incidencias` — el
  id del query param se mantuvo por compatibilidad con enlaces guardados;
  `src/features/centros/SeguimientoReportesCentro.tsx`): franja resumen +
  gráfico/calendario de evolución (colapsables) + **2 pestañas**: **Salud**
  (segmentado "En seguimiento / Archivados"; badge rojo solo con lo
  accionable: casos abiertos + partes sin detallar) y **Novedades**
  (cronológica 30 días, botón "Ver novedades anteriores" amplía la ventana).
  La pestaña por defecto es Salud si hay casos activos, si no Novedades. El
  calendario filtra ambas listas por día (banner "Quitar filtro"). El alta
  siempre se hace desde el formulario del reporte (fases Parte/Novedades) vía
  `onIrAReporte`.
- **Bandeja única de la red `/incidencias/funcionarios`**
  (`IncidenciasFuncionariosView`): fusiona las antiguas vistas
  funcionarios/archivadas/analítica. Filtros de estado ("En seguimiento" =
  casos abiertos + novedades negativas · "Histórico" = casos archivados +
  todas las novedades), tipo, campamento y día (calendario de la red con
  severidad); tarjeta resumen (60 días); acciones de salud (cambiar estatus /
  archivar) según `puedeEditarCentro`. Las rutas viejas redirigen:
  `/incidencias/archivadas` → `?estado=archivadas`, `/incidencias/analitica` →
  la bandeja. `/incidencias` redirige a la bandeja para todos los roles.
- **Bandeja damnificados `/incidencias/refugiados`** (denuncias por QR,
  `denuncias_centros`) sigue aparte: es otro canal y otra tabla.
- **Capa de datos**: `useCasosSaludCentros` / `useEventosReportes` /
  `useReportesCentros` (select + Realtime) y repos `reposCasosSalud` /
  `reposEventosReportes` / `reposReportes` (`guardarReporteDiario()` con
  upsert `onConflict centro_id,dia`). Dominio en
  `src/domain/seguimientoReportes.ts` (contadores, series, severidad por día).

## Auth y usuarios

- **Login** (`src/features/auth/Login.tsx` + `src/data/authSupabase.ts`): el
  usuario escribe su `username` y password; la capa lo mapea a
  `<username>@refugio.app` y llama a `supabase.auth.signInWithPassword`.
  `onAuthStateChange` mantiene la sesión. Tras login se carga el `perfil` desde
  `perfiles` (donde están `rol`, `centros_asignados`, `hash_id`, `marca_agua`,
  etc.) y se arma el `Usuario` de la app. Rol desconocido o perfil ausente →
  fallback a `autoridad` (solo lectura, seguro).
- **Sesión** (`useSesion()`): `useSyncExternalStore` sobre el estado interno
  que publica `onAuthStateChange`. Mantiene la misma interfaz pública que la
  capa legacy (`getSesion`, `getToken`, `cerrarSesion`, `setSesion`) para no
  romper consumidores.
- **Gestión de usuarios** (`/usuarios`, `GestionUsuarios.tsx`, solo admin):
  lista agrupada por rol con filtro y conteos, tarjetas con `BadgeRol`,
  `hash_id` en mono, chips de centros asignados y marca ON/OFF. El formulario
  tiene **multi-select de centros** (Popover + Command, con atajo **"Todos
  los centros"** que selecciona/deselecciona la red entera y colapsa a un chip
  "Toda la red"; deshabilitado para roles de alcance total), selector de rol
  shadcn `Select` con descripción, **cambio de contraseña funcional** (Edge
  Function `update-user-password`) y **eliminación completa** (`delete-user`).
  Ya no quedan gaps de gestión.
- **Roles** (5, ver `docs/sistema-usuarios.md`): `admin` (todo + usuarios +
  logs) · `analista_sae` (opera toda la red, sin usuarios ni logs) ·
  `autoridad` (solo lectura + logs) · `supervisor` (lee/escribe SOLO sus
  `centros_asignados`) · `operador` (ídem supervisor). Los chequeos de UI
  viven en `src/domain/permisos.ts` (`INFO_ROLES`, `puedeEscribir`,
  `puedeGestionarUsuarios`, `puedeVerLogs`, `puedeCrearCentros`,
  `puedeEditarCentro(usuario, centroId)`); la RLS aplica la misma matriz en
  el servidor.
- **Bitácora `/logs`** (`src/features/logs/LogsView.tsx`, solo admin y
  autoridad): lista cronológica de `historial` con Realtime y filtros por
  rango de fechas, entidad y usuario. Link "Bitácora de acciones" en el menú
  del avatar de la Navbar.
- **Marca de agua** anti-foto: `MarcaAgua` muestra la identidad del usuario y
  la fecha si `perfil.marca_agua !== false`.

## Red de Centros Transitorios (`/centros`, foco actual)

La ruta `/centros` (`src/features/centros/`) permite **registrar el estado de
cada centro** y decidir a dónde reubicar refugiados con criterio.

**UI:** `CentrosView` (conmutador **Mapa / Centros** en la Navbar; la vista
"Centros" es el `TableroCentros`, que compara centros por cupo real y cuyo
clic en una tarjeta navega a la ficha completa `/centro/:id`). En el
mapa, `MarcadorCentro` es una **píldora horizontal**: logo del cuerpo +
**`refugiados / funcionarios`** (ej. `200 / 25`) + punto de semáforo. Al
seleccionar un centro, el botón "detalles" de la nube abre el `PanelFlotante`
con `DetalleCentro` en escritorio y navega a `/centro/:id` en móvil (<768px,
`window.matchMedia`). `DetalleCentro` prioriza lo operativo a simple vista:
KPIs grandes de **refugiados** y **familias**, **personal total** (mini-totales
por categoría), tarjeta de **logística** (agua, comida, baños), **gráfico de
ocupación** (desplegable), los desgloses demográfico y de personal en
**secciones desplegables**, foto, Maps, coordinación, seguridad,
requerimientos, capacidad vs ocupación, responsables. Está descompuesto en
**secciones exportables** (`Seccion*Centro` + `BadgesEstadoCentro`) que
reutiliza `FichaCentroView` (`/centro/:id`): cabecera propia con "Volver",
3 columnas en escritorio (identidad/contactos · personas/necesidades ·
capacidad e histórico con el gráfico abierto por defecto) y una columna en
móvil, con el mismo `CentroForm` para editar.
`CentroForm` por pestañas I–VI + Requerimientos, Capacidad, Contactos; el
**personal operativo** se edita en **V · Población** (`DesglosePersonal.tsx`).
La pestaña **I · Identificación** es editable: nombre, grupo, cuerpo asignado,
parroquia, dirección, enlace de Maps y **coordenadas** (lat/lng decimales o
botón GPS). **Crear centro:** botón "Registrar centro nuevo" en `PanelCentros`
(y "+" con el panel plegado) → `CentroForm` en modo `esNuevo` con el siguiente
N.° libre. **Eliminar centro:** botón en el footer del form con confirmación
(`AlertDialog`); borrado suave. Permisos: **crear/eliminar centros** solo
`admin`/`analista_sae`; editar también `supervisor`/`operador` pero únicamente
sus centros asignados (la RLS además les oculta el resto de la red);
**autoridad solo lectura**.

**Foto vía Supabase Storage:** la foto se sube al bucket público
`centros-fotos` (`src/data/supabase.ts`: comprime a JPEG ~1280px antes de
subir) y se guarda solo la **URL** dentro del dato del centro. Requiere
`VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`; sin ellas el botón de foto
queda desactivado.

## Censo nominal y registro por cédula (Nexus)

Coexisten **dos sistemas de censo** distintos — no los confundas:

1. **Importaciones Excel** (`censo_registros`, UI «Importaciones Excel» en
   `/centros/censo/personas` y pestaña homónima del campamento): BD de
   **relaciones externas no verificadas** importadas a mano vía MCP/scripts
   (`scripts/importar_relaciones_excel.py` → RPC `censo_importar_lote`).
   Prioriza cédulas (`documento_norm`), matching de centros y metadatos
   (`origen=import_excel`, `fuente_archivo`, `nombre_centro_raw`,
   `centro_match`, `historial_centros`). Sirve para búsquedas/verificación
   de solicitados; **no** es fuente de verdad operativa. Precarga Nexus:
   `scripts/precargar_nexus_censo.py`.
2. **Base nominal verificada** (esta sección): identidad real de cada
   damnificado, con foto SAIME (pendiente), familia, residencia afectada y
   trazabilidad completa. Vista interna `/centros/refugiados`
   (`RefugiadosRedView` red-wide, `RefugiadoDetalleRedView` /
   `/centros/refugiados/:alojamientoId` el detalle) y `FichaRefugiadoView`
   embebida en `/centro/:id` (pestaña Población). El alta se hace por **cédula
   vía Nexus** (abajo) o manualmente con `RefugiadoForm`.

### Modelo de datos nominal (4 tablas tipadas, `src/domain/refugiados.ts`)

- **`refugiados`**: identidad (`cedula`/`cedula_norm`/`tipo_doc`, nombres
  desglosados, `fecha_nacimiento`, `sexo`, `foto_url`, `vulnerabilidades`
  jsonb, `contacto`/`salud`/`habilidades`/`documentacion`/`tallas` jsonb).
  **`cedula_norm` es única en toda la red** (`refugiados_cedula_norm_uq`) —
  una persona existe una sola vez, sin importar el centro.
- **`familias_centro`**: el hogar (nombre, `familiares_referencia`/
  `familiares_separados` jsonb — este último con `estado`:
  `desaparecido`/`separado`/`contacto_perdido`/**`fallecido`**, más
  `edad_aproximada`/`fecha_fallecimiento`); y el bloque de **damnificación**
  agregado el 12-jul: `miembros_damnificados_declarados int`,
  `fallecidos_confirmados int default 0`, `desaparecidos int default 0` (el
  conteo rápido — fuente de verdad para el nivel de afectación, independiente
  de si hay detalle nominal en `familiares_separados`).
- **`alojamientos_refugiados`**: la relación persona↔hogar↔centro
  (`es_jefe_familia`, `parentesco_jefe`, `estado` activo/observación/
  tránsito/egresado, `creada_ts`/`creada_por`).
- **`residencias_afectadas`**: una por familia (`unique(familia_id)` vía RPC
  upsert), con **`estatus_vivienda`** como eje de **severidad** (`destruida` /
  `inabitable` / `parcial_habitable` / `habitable_con_riesgo` / **`sin_dano`**
  agregado el 12-jul / `sin_verificar`) **separado** de la ubicación
  (`estado_federativo`/`municipio`/`parroquia`/`sector`/`direccion`) — no
  confundir "dónde" con "qué tan grave".

**Nivel de afectación** (`src/domain/nivelAfectacionHogar.ts`, pura, agregada
el 12-jul): 🔴 crítico / 🟡 atención / 🟢 estable / ⚪ sin verificar, derivado de
`estatus_vivienda` + `fallecidos_confirmados`/`desaparecidos` — **nunca se
pregunta al censista, se calcula**. Cualquier fallecido o desaparecido es
crítico sin importar la vivienda. Se muestra en el badge de `FichaRefugiadoView`
(cualquier hogar) y en `CensoNexusPanel` justo al crear el hogar.

### Integración Nexus/Onfalo (censo por cédula)

Documentación completa y detallada en **`nexusEndPoint/README.md`** (léela
antes de tocar esto) — resumen operativo aquí:

- **Qué es:** API institucional (`api.onfalo.nexus.ia.ve`, solo resuelve
  dentro de una VPN de la institución) que, dada una cédula, devuelve nombres,
  sexo, fecha de nacimiento, teléfonos, familiares vinculados (fiscal +
  IPSFA/militar) y metadatos de foto SAIME.
- **Arquitectura:** contenedor `nexus-gateway` en Dokploy (Alpine + OpenVPN +
  proxy Python, `nexusEndPoint/runtime/proxy.py` — **gitignored**, la copia en
  producción vive en `/etc/dokploy/nexus-vpn/`) expuesto en
  `https://nexus.m0n1t0r-d3-3v3nt0s.net`. El frontend nunca ve la API key de
  Nexus; habla con el gateway vía `src/data/reposNexus.ts`
  (`buscarPersonaNexusConCache`) con JWT de Supabase.
- **Caché:** tabla `nexus_consultas` (PK letra+cedula) — el censo por cédula
  sigue operativo con la VPN caída para cédulas ya consultadas; botón
  "Reconsultar" fuerza ir a Nexus.
- **Foto SAIME — PENDIENTE:** Nexus solo da el *nombre* del archivo
  (`foto_nombre`); la imagen vive en un MinIO aparte. Ver "Qué falta" arriba y
  `nexusEndPoint/README.md` §6 para el mecanismo exacto y qué falta pedirle al
  admin de Nexus.

### `CensoNexusPanel.tsx` — flujo por cédula (`src/data/reposCensoNexus.ts`)

1. Buscar cédula → ficha Nexus (o caché) + `estadoNominalPorCedula` (pre-check
   de duplicados, ver abajo).
2. **¿Es jefe/a de familia?** — se pregunta apenas se confirma identidad, antes
   de mostrar dirección/teléfonos/damnificación (agregado 12-jul: esas
   preguntas son del hogar, no tiene sentido hacerlas dos veces ni a quien no
   va a crear el hogar). Si "No" → botón para buscar al jefe real.
3. Si "Sí": dirección/teléfonos (confirmables con un toque) → familiares
   sugeridos por Nexus (botón "Está aquí conmigo — Agregar", deja explícito
   que confirma presencia física, no solo el vínculo que registra el Estado)
   → **sección "Damnificación por el terremoto"** (severidad de vivienda
   obligatoria + ubicación opcional + miembros damnificados declarados +
   conteo rápido de fallecidos/desaparecidos con detalle opcional repetible)
   → "Verificar y crear hogar".
4. `registrarPersonaNexusEnNominal()` hace el alta: find-or-create de la
   identidad, `guardarResidenciaAfectada()` + `actualizarDamnificacionFamilia()`
   + `guardarFamiliaresReferencia()` (pérdidas), `asociarRefugiadoAFamilia()`.
5. Hogar creado → repetir búsqueda por cédula para agregar adultos (cónyuge,
   hijos cedulados, etc. — el buscador queda arriba, en "Hogar en registro");
   `registrarMiembroSinDocumento()` para menores/personas sin cédula.

### Duplicados cross-centro — el bug más importante que corregí (11–12-jul)

**Causa raíz:** la RLS `blindaje_lectura_refugiados` (correcta para proteger
PII: un `supervisor`/`operador` solo ve refugiados que creó él mismo o que
están alojados en **su propio** centro) tiene un efecto colateral: si un
operador censaba una cédula ya activa en **otro** centro (o creada por otro
usuario), el `SELECT` de duplicados devolvía "no existe" **en silencio**, y el
`INSERT` posterior chocaba con `refugiados_cedula_norm_uq` → crash. El mismo
punto ciego rompía el aviso "ya activo en otro campamento" (también dependía
de una lectura RLS-limitada).

**Arreglo — 2 RPC `SECURITY DEFINER`** (bypassan la RLS a propósito, con
alcance mínimo):

- **`upsert_refugiado_identidad(...)`**: find-or-create atómico del lado del
  servidor. Wrapper: `upsertRefugiadoIdentidad()` en `reposRefugiados.ts`.
  Chequeo de rol interno (`admin`/`analista_sae`/`supervisor`/`operador`).
- **`estado_nominal_cedula(p_cedula_norm, p_centro_id)`**: solo expone
  `centro_id`s + flags + **fecha/hora del registro** (`creada_ts`,
  `fecha_ingreso`) + quién lo registró (`registrado_por`) — **nunca PII**
  (nombres, teléfonos, etc.). Wrapper: `estadoNominalCedulaRed()`. Usado tanto
  por `registrarPersonaNexusEnNominal` (evitar el crash) como por
  `estadoNominalPorCedula` (el aviso, ahora confiable cross-centro).

**UI del aviso** (`CensoNexusPanel.tsx`, agregado 12-jul): si la cédula ya
está activa en otro campamento, el flujo **se detiene** — tarjeta roja con
fecha/hora de cada registro previo + explicación de las 3 causas posibles
(duplicado / traslado sin cerrar / error) + botón **"Reportar por WhatsApp"**
a los analistas SAE del campamento actual (`AnalistaContactoTerreno.whatsapp`,
agregado a `terreno_centro`/`censo_centros`; mensaje pre-armado con
`whatsappHref(tel, mensaje)`) + **checkbox de confirmación explícita**
obligatorio antes de habilitar "Verificar y crear hogar" / "Agregar al hogar".

⚠️ **Gotcha reafirmado con esta implementación** (ya documentado para las RPC
de `tokens_centro_auto`, aplica igual aquí): **`CREATE OR REPLACE FUNCTION`
resetea el `EXECUTE` a `PUBLIC` por defecto**, incluso en funciones que la
migración actual no toca directamente — pasó dos veces seguidas con
`upsert_refugiado_identidad`/`estado_nominal_cedula` quedando abiertas a
`anon`. **Siempre verificar después de migrar:**
```sql
select p.proname, r.rolname, has_function_privilege(r.oid, p.oid, 'EXECUTE')
from pg_proc p cross join (select oid, rolname from pg_roles where rolname in ('anon','authenticated')) r
where p.proname in ('<funciones tocadas>');
```
y repetir `revoke ... from anon/public; grant execute ... to authenticated;`
si hace falta. `terreno_centro` es la única excepción legítima (debe seguir
siendo `anon` — la usan `/terreno` y `/censo` sin login).

## Sala de control `/dashboard`

Vista independiente a pantalla completa pensada para **proyectar** en la sala
situacional. Solo lectura (todos los roles), se actualiza sola vía
`useSupabaseQuery` + Realtime. Archivo: `src/features/dashboard/DashboardView.tsx`.
Se abre desde el botón **"Pantalla"** de la `Navbar` (link a `/dashboard`).

Contenido: reloj en vivo, KPIs grandes en rejilla `xl:grid-cols-4` (8
tarjetas: refugiados, familias, personal operativo, centros con datos, cupo
disponible, centros críticos, más 2 nuevas con Realtime: **"Incidencias
abiertas"** con subtexto de urgentes en rojo y **"Raciones hoy"** —suma de
`racionesDelDia` de los reportes del día vs población total—), **gráfico
`GraficoOcupacionRed`** (histórico agregado de la red con carry-forward),
población por parroquia, estado de la red (centros por nivel de urgencia),
demografía de la red y lista de centros que requieren atención (ordenados por
`prioridadCentros.ts`). Indicador de conexión a Supabase (`useSupabaseConectado`).

## Producción REAL — corre en Dokploy

**Dominio de producción:** `https://m0n1t0r-d3-3v3nt0s.net`.

- **`refugio-ali-primera`** — la **PWA/frontend** (aplicación en Dokploy,
  `applicationId: mzf_H0G_JcYUoTZfbJkQI`). Se construye desde GitHub:
  `owner=diazpolanco13, repo=refugio-ali-primera, branch=main, buildPath=/`,
  build type **nixpacks**, `autoDeploy: true`, `triggerType: push`. Un push a
  `main` **debería** redesplegarla solo (verifica en el panel). Env vars del
  build: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (horneadas en el bundle),
  `NIXPACKS_NODE_VERSION=22`.
- **`refugio-backend`** — **DETENIDO** (Fase 7). Compose
  `ACKYOsSdQcksY0vu31loO` que antes corría Postgres + API Fastify. Se dejó en
  **stop** (no destruido) por si hay que rollback. Ya no se usa: Supabase
  reemplaza auth, Postgres, Realtime y la API.
- El enrutado/HTTPS lo hace **Traefik** (de Dokploy). Ya no hay `/api` ni `/ws`
  en el dominio de producción: la PWA habla directo con Supabase.

### Desplegar / actualizar producción (Dokploy)

1. **Sube el código a GitHub `main`** (`git push origin main`). El frontend se
   construye desde `main`; sin push, el redeploy horneará código viejo.
   Confirma con `git ls-remote origin main`.
2. El `autoDeploy: true` debería disparar el rebuild solo. Si no, **Redeploy**
   desde el panel de Dokploy (app `refugio-ali-primera`) o vía MCP
   `application-redeploy` con `applicationId: mzf_H0G_JcYUoTZfbJkQI`.
3. **Verifica** que la nueva versión está activa (ver abajo).

### Verificar producción tras un deploy

```bash
# La PWA responde (HTML del frontend):
curl -s -o /dev/null -w "HTTP %{http_code}\n" https://m0n1t0r-d3-3v3nt0s.net/
# Debe dar 200 y servir el index.html de la PWA.

# Ya NO hay /api ni /ws (el backend está detenido). Esto debe fallar (404/502):
curl -s -o /dev/null -w "HTTP %{http_code}\n" https://m0n1t0r-d3-3v3nt0s.net/api/health
```

Login de prueba (verificado en la Fase 2): `admin` / `refugio_admin_2026`
(email `admin@refugio.app`). Otro usuario: `xavier` /
`refugio_xavier_2026`. **Cambia estas contraseñas cuanto antes.**

## Alternativa manual: desplegar en el VPS con Docker Compose

> Referencia por si algún día se despliega sin Dokploy. **Lo que corre hoy es
> Dokploy.** Tras la Fase 7, el `docker-compose.yml` queda solo con el servicio
> `caddy` (sirve la PWA); ya no hay `db` ni `server`.

```bash
git clone https://github.com/diazpolanco13/refugio-ali-primera.git
cd refugio-ali-primera
cp .env.deploy.example .env
# Editar .env: DOMAIN, VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY (y opcional
# VITE_MAPTILER_KEY). Ya NO hay DB_PASSWORD/JWT_SECRET/ADMIN_*.
docker compose up -d --build
```

`Dockerfile.web` hornea la PWA (build de Vite) y la sirve con Caddy. Las
`VITE_*` se pasan como build-args (compose las toma del `.env`). El
`Caddyfile` ya no proxya `/api` ni `/ws`: solo sirve `dist/` con fallback SPA.

## Notas / gotchas

- **`CREATE OR REPLACE FUNCTION` resetea `EXECUTE` a `PUBLIC`** aunque la
  función no cambie de firma, y a veces afecta incluso a funciones que la
  migración *no* tocó directamente (visto dos veces seguidas el 12-jul con
  `upsert_refugiado_identidad`/`estado_nominal_cedula`). **Después de CUALQUIER
  migración que toque una función `SECURITY DEFINER` con `revoke`/`grant`
  manual, reverifica los grants** — comando y contexto completo en "Censo
  nominal y registro por cédula (Nexus)".
- **Secretos:** `.env` (frontend, `VITE_SUPABASE_*` y `VITE_MAPTILER_KEY`) y el
  `.env` de despliegue están en `.gitignore`. `.env.example` va sin claves.
  Repo es público.
- **Marcadores** de centros son **HTML markers** (no capa de círculos) para
  mostrar logo+cifras+semáforo sin depender de fuentes del mapa
  (`CentrosMap.tsx` + `MarcadorCentro.tsx`).
- **PWA / service worker:** `vite-plugin-pwa` con `autoUpdate`. Ya no hay
  offline-first con cola/outbox; el SW queda para caché de assets estáticos y
  deep-link offline (`navigateFallback: index.html`). `runtimeCaching` cachea
  tiles de mapa ya visitados.
- **shadcn CLI:** al añadir componentes (`npx shadcn add …`) revisa que los
  imports queden con alias `@/...` (a veces el CLI escribe `src/lib/utils` o
  `src/components/ui/button` y rompe Vite; pasó con `cn` y con el import de
  `button` dentro de `calendar.tsx`).
- **`@/data/supabase.ts`** (Storage) **vs `@/data/supabaseClient.ts`** (cliente
  general): el primero es el helper legacy de subida de fotos (solo Storage);
  el segundo es el cliente supabase-js que usa toda la nueva capa. No
  confundirlos.
- **Edge Functions desde el navegador:** `invocarEdgeFunction` usa
  `supabase.functions.invoke`, que envía `x-client-info` y `apikey`. Si al
  crear/editar/eliminar usuarios ves "Failed to send a request to the Edge
  Function" con CORS en consola, revisa que la función incluya esos headers en
  `Access-Control-Allow-Headers` (ver sección Edge Functions).
- **RLS `perfiles`:** no hagas subselects directos sobre `perfiles` dentro de
  sus propias policies; usa helpers `SECURITY DEFINER` (`mi_hash_id()` para el
  chequeo de `hash_id` inmutable en updates).
- **`crypto.randomUUID` no existe en contextos http** (acceso por IP al dev
  server): `nuevoId()` (reposSupabase) genera un UUID v4 con `getRandomValues`
  como fallback — varias tablas tienen `id uuid` y rechazan otros formatos.
- **Copiar al portapapeles en http:** no hay Clipboard API; se usa
  `src/lib/portapapeles.ts` (execCommand) y, en la vista de red, un diálogo
  con textarea visible (copiar "a ciegas" desde un menú Radix falla porque el
  cierre roba el foco).
- Un warning de React "changed size between renders" que aparece **solo en el
  entorno de preview del asistente** NO proviene de esta app (se comprobó); no
  aparece en un navegador normal.

## Verificación rápida

- Frontend: `npm run typecheck` y `npm run build` (deben pasar limpios). Probar
  en navegador: login con `admin`, listar los 51 centros, editar ocupación de
  un centro y ver el snapshot en `ocupaciones_centros` (Supabase Studio),
  crear un centro de prueba con coordenadas y verlo en el mapa (y eliminarlo),
  abrir el gráfico individual y el de red, editar en un dispositivo y ver
  refresco en otro (Realtime), subir foto, llenar el "Reporte del día" de un
  centro (parte numérico + comidas + atención médica), registrar un caso de
  salud y una novedad y verlos en la pestaña "Seguimiento" de la ficha, en la
  bandeja `/incidencias/funcionarios` y en los KPIs del dashboard.
- **Censo nominal por cédula:** desde `/censo` (o `/terreno` → Censo), buscar
  una cédula de prueba, crear un hogar, capturar damnificación (severidad de
  vivienda + un fallecido/desaparecido de prueba) y verificar el nivel de
  afectación calculado en el badge; agregar un adulto por cédula y un menor
  sin documento; **repetir la búsqueda de la MISMA cédula desde un usuario
  `operador` con centro distinto** y confirmar que el aviso de duplicado
  aparece con fecha/hora y bloquea hasta confirmar (esto es lo que estaba roto
  antes del 11-jul — no te saltes esta prueba).
- Usuarios y permisos: desde `/usuarios` crear un `operador` con 2 centros
  asignados, loguearse con él y comprobar que solo ve/edita esos centros,
  cambiarle la contraseña desde
  `/usuarios` (relogin) y eliminarlo (desaparece de `auth.users` y
  `perfiles`); revisar la bitácora en `/logs` con el admin.
- Supabase: `list_tables` (verbose) y `get_advisors` (security) vía MCP para
  confirmar esquema y RLS.

## Caveman / grafo / contexto IA — dónde vive cada pieza

| Pieza | Fuente única (no duplicar aquí) |
|-------|----------------------------------|
| Estilo de respuesta (caveman) | `.cursor/rules/caveman.mdc` + `CURSOR.md` + skill `.agents/skills/caveman/` |
| Grafo antes de grep | `.cursor/rules/code-review-graph.mdc` + `GRAPH_REPORT.md` |
| UI botones/selects | `.cursor/rules/ui-controles-visibles.mdc` |
| Índice always-on | `CLAUDE.md` |
| Hermes (IA local) | `docs/hermes-gateway.md` · puntero en `AGENTS.md` |

**Grafo (hechos de ops, no la tabla MCP):** binario `/root/.local/bin/code-review-graph`;
MCP en `.cursor/mcp.json` / `.mcp.json`; update vía post-commit + hooks editor;
`pre-commit` es no-op a propósito; warm-up `./scripts/crg-warmup.sh` o
`list_graph_stats_tool` + `detect_changes_tool`. Rebuild: `code-review-graph update`
o `build`. **No** correr `/caveman-compress` sobre este `docs/traspaso.md`.
