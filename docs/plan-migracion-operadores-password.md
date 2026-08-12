# Plan — Migración de operadores a credencial propia (usuario + contraseña)

> **Estado (21-jul-2026):** Fases 1a y 1b implementadas y aplicadas en el
> proyecto. RLS scoped + `activado_ts` (`operadores_scoped_activacion.sql`),
> `perfiles_update` scoped + helpers `centros_de_usuario` /
> `puede_gestionar_operador` (`operadores_gestion_supervisor.sql`), edges
> `create-user` v16 / `update-user-password` v12 / `delete-user` v12 scoped.
> UI: `/usuarios/terreno` agrupada por campamento (tarjetas colapsables) y
> `/usuarios` en modo «Mis operadores» para analista/supervisor (crear,
> editar, eliminar operadores de su alcance).
> **Fase 2 implementada:** edge `activar-operador` (histórico: token QR =
> prueba de presencia → fija contraseña + `activado_ts`), gate en `/terreno`,
> operador activado deja de ser "temporal", login acepta cédula pelada.
> **Cutover §7 HECHO (11-ago-2026):** `login-terreno` y `activar-operador`
> responden 410; tokens `personal` revocados + constraint; `/terreno?t=`
> redirige a login; sesiones operador drenadas; denuncias `publico` intactas.
> Centros sin activados se gestionan a mano (ops).
> **Predecesor:** `docs/plan-identidad-terreno.md` (Fase A: identidad por cédula
> vía Nexus). Esto es la continuación: pasar de "sesión de operador por
> QR + cédula" a "credencial propia provisionada / auto-activada".
> **Relacionado:** commit `6223176` (`fix(seguridad): cerrar lectura de red para
> sesiones de terreno`) + `supabase/cerrar_rls_lectura_terreno.sql`.

Este documento es autocontenido: una sesión nueva sin contexto previo debería
poder retomar el trabajo solo con esto.

---

## 1. Motivación

El token de terreno (`/terreno?t=<token>`) canjea una sesión de Supabase Auth
**real** con `rol = operador` (usuario `op-<cedula>`), sin prueba de identidad:
el QR está impreso/compartido en el campamento y basta **cualquier cédula que
Nexus conozca** para entrar como esa persona. Ver la edge function
`supabase/functions/login-terreno/index.ts` (modo v3, `paso: "entrar"`).

Ya se cerró la **fuga de datos** asociada (la RLS de lectura dejaba a esa sesión
leer el censo nominal con PII y campos de seguridad de los 61 campamentos — ver
commit `6223176`). Pero la **suplantación de identidad** sigue abierta: cerrar la
RLS acota el alcance, no impide entrar como otra persona.

**Objetivo de este plan:** que cada operador tenga **usuario + contraseña
propia**, provisionada por su responsable o auto-activada, y retirar el acceso
por URL con token una vez migrados todos.

---

## 2. Modelo objetivo (decisiones ya tomadas)

- **Supervisor = representante de una unidad de supervisión del SEBIN.** Cada
  unidad agrupa varios campamentos. Al crear un supervisor, el admin le asigna
  los `centros_asignados` de su unidad. De ahí, el supervisor ve **sus
  campamentos** y **los operadores que reportan en ellos** (nombre, jerarquía,
  cédula, estado de activación).
- **No se parte de cero.** Los ~100 operadores `op-<cédula>` ya existen y están
  asociados a sus centros. La migración es **auto-servicio**: cada uno activa su
  cuenta la próxima vez que entra por su QR.
- **Activación por QR (enrollment, no sesión permanente).** Al entrar por el
  token, al operador le aparece **obligatoriamente** la opción de crear su
  cuenta: fija su **propia** contraseña, con el aviso de que debe recordarla
  porque **pronto será la única forma de iniciar sesión**. El token pasa de ser
  "sesión permanente" a "prueba de presencia de un solo uso".
- **NO usar la cédula como contraseña inicial.** El usuario puede ser la cédula
  (es un identificador, no un secreto), pero la contraseña la fija el operador.
  Usar cédula = cédula reabriría el hueco durante la coexistencia (cualquiera
  con la cédula entraría, y sin siquiera necesitar el QR).
- **La cédula sigue siendo la clave de identidad** (`cedula_norm`): el
  anti-duplicados y el traslado nominal dependen de ella. Toda alta/activación
  conserva la cédula.
- **Coexistencia y luego corte.** Al principio conviven ambos tipos de sesión
  (token y contraseña). Cuando el tablero de avance garantice que todos los
  campamentos tienen operadores activados, se **mata el acceso por URL**.
- **Criterio de corte objetivo:** el hueco NO se cierra del todo hasta que
  (1) muere el acceso por URL **y** (2) ninguna cuenta queda con credencial
  adivinable. Con la activación por QR, ambos eventos coinciden.

---

## 3. Estado actual del código (puntos de anclaje)

**Roles y permisos** — `src/domain/permisos.ts`
- `puedeGestionarUsuarios(rol)` → hoy **solo admin** (`INFO_ROLES`).
- `esUsuarioTemporalTerreno(username)` → `/^(operador-|op-)/`.
- `puedeEditarCuentaPropia(usuario)` → `!esUsuarioTemporalTerreno`. **Bloquea**
  a los `op-` de cambiar contraseña/usuario/perfil.
- `rutaInicialDeRol('operador')` → `/centros/reportes`.
- `rutaPermitidaParaRol` → el operador solo accede a `/centros/reportes[/...]`.

**Auth de la app** — `src/data/authSupabase.ts`
- `login(username, password, capToken?)` → `signInWithPassword` con email
  sintético `<username>@refugio.app`.
- `cambiarMiPassword` (línea ~339), `actualizarMiPerfil` (~274),
  `renombrarMiUsuario` (~314): **todas** lanzan error para cuentas temporales
  vía `puedeEditarCuentaPropia`.

**Edge functions** — `supabase/functions/`
- `create-user/index.ts`: crea auth user con contraseña + fila en `perfiles`
  (rol, `centros_asignados`, ámbito, `hash_id`). **Caller debe ser admin**
  (línea ~76). Valida colisión de username, valida que los centros existan.
- `update-user-password/index.ts`: cambia contraseña de otro usuario.
  **Caller debe ser admin** (línea ~52).
- `login-terreno/index.ts`: canje token→sesión (v3 cédula, v2 funcionario,
  v1 compartido). Emite magiclink (`hashed_token`), el front lo canjea con
  `verifyOtp`.

**RLS de `perfiles`** (aplicada, ver `supabase/`)
- `perfiles_select` (base): admin ve todo; cada quien ve el suyo.
- `perfiles_select_operadores_terreno.sql`: deja a admin/analista_sae/autoridad/
  supervisor ver perfiles de operador, PERO hoy: (a) solo `username like
  'operador-%'` (NO incluye `op-%`), y (b) **a nivel de toda la red**, sin
  acotar a los centros del supervisor.
- `perfiles_insert`: **solo admin**.
- `perfiles_update`: el propio usuario (sin cambiar rol/centros/hash_id) o admin.

**Flujo de terreno (frontend)**
- `src/features/terreno/TerrenoView.tsx` (orquesta el portal),
  `src/features/terreno/IdentificacionCedula.tsx` (identificación por cédula),
  `src/data/loginTerreno.ts` (canje de token / cédula).

**Tabla `perfiles`** (columnas relevantes): `user_id, username, nombre, rol,
centros_asignados[], ambito_analista, cuerpo_asignado, cedula, cedula_norm,
verificado_nexus, aprobacion ('pendiente'|'aprobada'|'rechazada'), jerarquia,
responsabilidad, hash_id, marca_agua`. **No** existe aún columna de "activado".

**Helpers RLS** (SECURITY DEFINER): `mi_rol()`, `mis_centros()`,
`es_analista_total()`.

---

## 4. Fase 1a — Gestión/visibilidad (solo lectura)

> Menor riesgo, no toca autenticación. Entrega valor inmediato (cada rol ve lo
> suyo) y valida el scoping de la RLS con usuarios reales. **Empezar por aquí.**

### 4.1 RLS: el supervisor ve sus operadores por solape de centros
Reescribir `perfiles_select_operadores_terreno` para:
- Incluir `op-%` además de `operador-%` (o mejor: `rol = 'operador'` sin filtrar
  por prefijo de username).
- **Acotar** a los operadores cuyos `centros_asignados` solapen con
  `mis_centros()` para supervisor y analista de cuerpo/centros. Admin, analista
  de red y autoridad siguen viendo todos (según su alcance actual).
- Recordar el gotcha: tras recrear cualquier RPC SECURITY DEFINER, re-verificar
  grants (`mi_rol`/`mis_centros` no se tocan aquí, pero sí si se crean helpers).

Verificación: simular JWT por rol (patrón usado en `cerrar_rls_lectura_terreno`,
`set local role authenticated` + `request.jwt.claims`) y confirmar que un
supervisor solo ve operadores de sus centros y un operador de otra unidad no.

### 4.2 Data model: señal de "activado"
Agregar a `perfiles` una columna para medir la migración, p. ej.:
```sql
alter table public.perfiles add column activado_ts bigint; -- null = no activado
```
La pone la Fase 2 al completar la activación. En Fase 1 solo se lee (el tablero
arranca en 0% y se mueve cuando la Fase 2 esté viva). Alternativa descartada:
inferir desde `auth.users` (más frágil de consultar desde el cliente).

### 4.3 Vista de gestión scoped (solo lectura)
- Nuevo helper en `permisos.ts`, p. ej. `puedeGestionarOperadores(rol)` →
  admin / analista_sae / supervisor (distinto de `puedeGestionarUsuarios`, que
  sigue siendo admin-only para el CRUD de usuarios permanentes).
- Vista (reusar/extender `src/features/usuarios/BandejaOperadoresView.tsx` y la
  ruta `/usuarios/terreno`): por cada campamento del rol, sus operadores con
  nombre, jerarquía, cédula y **estado** (activado / pendiente), más un
  **resumen de avance** (p. ej. "campamento X: 2/3 operadores activados").
- Exponer la entrada en el menú (`AppSidebar`) para estos roles; ajustar
  `rutaPermitidaParaRol` si hace falta que supervisor/analista entren a la ruta.

---

## 5. Fase 1b — Acciones de gestión (scoped en el servidor)

> Necesario para el mundo **post-URL** (censistas nuevos que llegan cuando el
> token ya no existe). La migración del grueso NO depende de esto (es
> auto-servicio, Fase 2).

### 5.1 Ampliar la autorización de `create-user` (scoped)
- Permitir caller `admin` (como hoy) **+** `analista_sae` **+** `supervisor`.
- Reglas server-side (en la edge function, NO solo UI):
  - `analista_sae` ámbito red → cualquier centro, rol operador.
  - `supervisor` / `analista_sae` ámbito cuerpo/centros → **solo rol operador**
    y **solo** en centros ⊆ sus `centros_asignados`.
  - Bloquear que estos roles creen admin/analista/supervisor/autoridad.
  - **Ampliación 21-jul-2026 (edge v17):** el `analista_sae` también crea
    cuentas de **supervisor** — credencial libre, centros ⊆ su alcance y
    ámbito `cuerpo` solo si el analista es de red o de ese mismo cuerpo. La
    edición/eliminación del supervisor sigue siendo admin-only (RLS
    `perfiles_update` y `puede_gestionar_operador` no cambian); en `/usuarios`
    el analista los ve en una sección de solo lectura.
- Conservar cédula (`cedula`, `cedula_norm`) en el alta para no duplicar
  personas; idealmente verificar contra Nexus (reusar `login-terreno`/`reposNexus`).

### 5.2 Ampliar `update-user-password` (scoped)
- Permitir a supervisor/analista resetear la contraseña **solo** de operadores
  que comparten centro con ellos (validar contra `centros_asignados` /
  `mis_centros()` del caller y del objetivo).
- Definir la regla cuando un operador reporta en centros de varias unidades:
  cualquier supervisor que **comparta al menos un centro** con él puede
  gestionarlo/resetearlo.

### 5.3 Alta manual con activación diferida
- Cuando un rol crea un operador nuevo, generar credencial temporal (aleatoria,
  mostrada una vez) **o** dejarlo "pendiente de activación" y que el operador la
  fije en su primer login. Nunca contraseña = cédula.

---

## 6. Fase 2 — Auto-activación del operador (crear su contraseña)

> Es la pieza que **cierra el hueco**. Se construye después de la Fase 1.

### 6.1 Flujo "reclamar cuenta" vía token
- Al entrar por `/terreno?t=<token>` e identificarse por cédula (flujo v3
  existente), si el `op-<cédula>` **aún no está activado** (`activado_ts is
  null`), mostrar **obligatoriamente** la pantalla de creación de contraseña:
  - Input de contraseña nueva + confirmación (mín. 6, regla a definir).
  - Aviso claro: "Recuérdala: pronto será la única forma de iniciar sesión."
  - Al confirmar: fijar la contraseña del `op-<cédula>` y marcar `activado_ts`.
- Servidor: nueva edge function (p. ej. `activar-operador`) que, validando el
  **token de terreno** (prueba de presencia) + la cédula, hace
  `auth.admin.updateUserById(password)` y `perfiles.activado_ts = now()`. El
  token es la autorización; NO exponer esto como cambio de contraseña libre.
- Marca `aprobacion = 'aprobada'` si aplica (provisionar por presencia +
  contraseña propia puede pre-aprobar; reconciliar con la bandeja de analistas).

### 6.2 Relajar el gating de cuentas temporales
- Hoy `puedeEditarCuentaPropia` bloquea a los `op-` de tener contraseña/perfil
  (`authSupabase.ts` líneas ~280/318/346). Un operador **activado** debe poder
  tener contraseña propia y (según se decida) editar su perfil.
- Opciones:
  - (a) Cambiar el criterio de "temporal" para que un `op-` con `activado_ts`
    **no** cuente como temporal (preferible: sin renombrar usuarios ni migrar
    filas).
  - (b) Cambiar el esquema de username al activar (más invasivo; rompe
    referencias en `historial`/`updated_by`). **Descartada salvo necesidad.**
- Asegurar que `login()` (signInWithPassword) funciona para el `op-<cédula>`
  activado con su email sintético `op-<cedula>@refugio.app`.

### 6.3 Primer login por contraseña
- El operador entra por la pantalla de login normal con usuario (cédula o
  `op-<cédula>`, definir) + su contraseña. `rutaInicialDeRol` ya lo lleva a
  `/centros/reportes`. Confirmar que la sesión por contraseña respeta el mismo
  scoping de centros que la de token.

---

## 7. Tablero de avance y corte (cutover)

- Vista para admin/analista/supervisor: % de operadores activados por
  campamento y por unidad (usa `activado_ts`). Para admin/analista: red
  completa; para supervisor: sus centros.
- **Criterio de corte:** todos los campamentos con ≥1 operador activado (o el
  umbral que se defina), y ventana de gracia comunicada.
- **Matar el acceso por URL:** deshabilitar en `login-terreno` la creación de
  **sesión de operador** por token (dejar, si acaso, solo la planilla de censo
  pública/anónima si se decide conservarla). Revocar/rotar tokens
  `tokens_centros.tipo='personal'`. Revisar `TerrenoView` para que el portal
  redirija al login por contraseña.

---

## 8. Decisiones aún abiertas

1. **Username final del operador:** ¿`op-<cédula>` (actual) o la cédula pelada?
   Afecta la pantalla de login y la retro-compatibilidad de `historial`.
2. **Política de contraseña** (longitud/complejidad mínima) y si se fuerza
   cambio periódico.
3. **Umbral exacto de corte** y qué hacer con campamentos sin operador activado
   al momento del corte.
4. **Planilla de censo pública anónima:** ¿se conserva el token solo para eso, o
   se elimina por completo el acceso por URL?
5. **Reconciliación con la bandeja `aprobacion`**: ¿provisionar/activar
   pre-aprueba, o sigue pasando por revisión de analistas?
6. **Operadores multi-unidad:** confirmar la regla "cualquier supervisor que
   comparta centro puede gestionarlo".

---

## 9. Riesgos / caveats de seguridad

- **Ventana de coexistencia:** mientras el token siga creando sesiones de
  operador, la suplantación por cédula sigue viva. La activación no cierra el
  hueco hasta el corte (§7). Es un riesgo aceptado y acotado en el tiempo.
- **NO contraseña = cédula** en ningún flujo (bootstrap ni reseteo).
- **Autorización siempre en el servidor** (edge functions), la UI solo oculta.
- **Gotcha CLAUDE.md #1:** `CREATE OR REPLACE FUNCTION` re-otorga EXECUTE a
  PUBLIC → repetir revoke/grant tras tocar cualquier RPC SECURITY DEFINER.

---

## 10. Verificación (patrón a reusar)

- **RLS:** simular cada rol con `begin; set local role authenticated; set local
  request.jwt.claims = '{"sub":"<user_id>","role":"authenticated"}'; <consulta>;
  rollback;` (recordar que `execute_sql` corre como service role y saltaría la
  RLS si no se fuerza el rol). IDs de prueba por rol (a 20-jul-2026):
  admin `703d8b88-…`, analista_sae red `131438dc-…`, supervisor `8772fdab-…`,
  operador `ffc91cea-…` (op-10783810, centros 54/52/51/03).
- **Edge functions:** probar caller de cada rol contra objetivos dentro y fuera
  de su alcance (debe rechazar fuera de alcance con 403).
- **Frontend:** `npm run typecheck` y `npm run build` antes de dar por hecho.
- **Repo:** `git fetch`/rebase antes de editar y push al terminar (se pushea
  desde varias máquinas / el VPS).

---

## 11. Orden sugerido de ejecución

1. **Fase 1a** — RLS scoped del supervisor (§4.1) + columna `activado_ts` (§4.2)
   + vista de solo lectura con avance (§4.3).
2. **Fase 1b** — `create-user` scoped (§5.1) + `update-user-password` scoped
   (§5.2) + alta con activación diferida (§5.3).
3. **Fase 2** — flujo "reclamar cuenta" vía token (§6.1) + relajar gating
   temporal (§6.2) + login por contraseña (§6.3).
4. **Cutover** — tablero (§7) + matar acceso por URL.
