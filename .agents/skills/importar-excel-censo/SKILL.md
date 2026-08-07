---
name: importar-excel-censo
description: Importa Excel de censo externo a Importaciones Excel con validación de cédulas y flags SIIPOL/seguridad. Usar cuando el usuario pida importar excel, importar censo, verificar planilla, o pase un .xlsx para cargar personas.
---

# Importar Excel Censo

## Cuándo usar

Usar si usuario pide importar un `.xlsx` de censo, relaciones externas, SIIPOL,
solicitados, registros policiales, o una planilla de campamento.

**Listas solo-verificación SIIPOL** (contrainteligencia / antecedentes por
campamento, sin alta de personas) → skill `importar-verificacion-siipol`
(`--solo-marcar-siipol`).

## Entrada esperada

- Archivo `.xlsx` accesible en VPS, preferido `tmp/<archivo>.xlsx` dentro del
  proyecto o `/tmp/<archivo>.xlsx`.
- Si planilla es de un solo campamento, pedir o inferir `--centro-id`.
- Credenciales en entorno: `NEXUS_SCRIPT_EMAIL` y `NEXUS_SCRIPT_PASSWORD`.
- `.env` del repo con `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.

## Flujo de comandos (por defecto: solo Excel, sin Nexus)

Siempre dry-run **local, sin Nexus**. Valida hoja, encabezados, nombres,
campamentos, cédulas y flags:

```bash
python3 scripts/importar_excel_censo.py \
  --archivo "tmp/ARCHIVO.xlsx" \
  --dry-run
```

Aplicar solo después de mostrar resumen y recibir confirmación explícita:

```bash
python3 scripts/importar_excel_censo.py \
  --archivo "tmp/ARCHIVO.xlsx" \
  --aplicar
```

**Nexus es opcional y no forma parte del flujo estándar.** Solo usar
`--con-nexus` si el usuario lo pide explícitamente. En ese caso:

```bash
python3 scripts/importar_excel_censo.py \
  --archivo "tmp/ARCHIVO.xlsx" \
  --con-nexus \
  --concurrency 5 \
  --timeout-nexus 20 \
  --dry-run
```

Y al aplicar inmediatamente después del dry-run Nexus:

```bash
python3 scripts/importar_excel_censo.py \
  --archivo "tmp/ARCHIVO.xlsx" \
  --con-nexus \
  --solo-cache-nexus \
  --aplicar
```

El script bloquea `--aplicar` si hay filas inválidas, campamentos inexistentes
o inactivos. `--permitir-omisiones` habilita importación parcial; usarlo solo
con aprobación explícita después de informar cantidades y causas.

**Dato político (referéndum / militancia):** nunca se importa.
`firmo_contra_presidente` siempre queda `false`. Columnas `Firmó contra el
Gob.` / texto de firma / `Milita oposición` / afiliación (PJ, Vente) se
ignoran y se limpian de `observaciones_seguridad` (se conservan solo
solicitado, reg. policial y deportado). `--omitir-firmo-presidente` es
legado no-op.

## Validación de cédulas (obligatoria)

`parse_cedula` **no** importa texto libre como documento:

- Marcadores → sin cédula: `no posee`, `no tiene`, `no`, `s/c`, `sin cédula`,
  `sin documento`, `n/a`, `-`, etc.
- Solo acepta: `V`/`E`/`P` + dígitos, o solo dígitos (con `.` `,` espacios /
  guiones como separadores de miles).
- Núcleos familiares (`12345678-1`) → sin cédula.
- Cualquier otro texto (letras residuales, frases) → documento vacío; la fila
  se importa **sin** cédula, nunca con el texto crudo.

Reportar en resumen: `con_cedula`, `sin_cedula` (incluye marcadores y basura).

## Archivos consolidados

- El script busca automáticamente, entre todas las hojas, la primera con
  encabezados reales de censo. Ignora hojas de resumen.
- Si hay columna `Campamento`, resuelve cada fila por nombre contra centros
  reales, incluyendo detección explícita de centros inactivos.
- No pasar `--centro-id` a un consolidado: mezclaría toda la red en un centro.
- `Nombre completo` se separa como 2 nombres + apellidos cuando hay 4+ tokens.
- Filas sin nombre recuperable se omiten y deben quedar en
  `errores_por_tipo.sin_nombre`.
- Cédulas repetidas se reportan como `documentos_repetidos`.

Si Excel de una sola hoja trae columna de campamento por fila y el encabezado
no usa un alias conocido:

```bash
python3 scripts/importar_excel_censo.py \
  --archivo "tmp/ARCHIVO.xlsx" \
  --col-centro "Campamento" \
  --dry-run
```

## Flujo obligatorio

1. Confirmar que archivo existe y es `.xlsx`.
2. Resolver campamento:
   - **Preferir `--col-centro`** si Excel trae columna Campamento (match
     por nombre → id real). El `N.°` de la UI **no siempre** = `centro-NN`
     (ej. N.° 32 Mamá Rosa = `centro-36`; `centro-32` = Andrés Bello).
   - Solo usar `--centro-id` tras verificar en BD nombre+nro del id;
     no asumir por número del id.
3. Ejecutar dry-run local **sin Nexus**. Debe mostrar hoja elegida, filas,
   campamentos sin resolver/inactivos, cédulas válidas vs marcadores/basura
   y nombres inválidos.
4. Reportar:
   - `filas_leidas`, `listas`, `con_cedula`, `sin_cedula`;
   - `documentos_repetidos`, `errores_por_tipo`, `centros_con_error`;
   - `solicitados`, `registro_policial`;
   - `verificados_siipol`;
   - columnas sensibles ignoradas (referéndum / militancia).
5. Si hay errores, corregirlos o pedir aprobación explícita para importación
   parcial con `--permitir-omisiones`.
6. Preguntar confirmación antes de `--aplicar` (salvo que el usuario ya haya
   pedido explícitamente importar/aplicar).
7. Ejecutar `--aplicar` **sin** `--con-nexus` por defecto.
8. Verificar vista Importaciones Excel: filtros Solicitados / Con reg. policial.

## Mapeo

Identidad:

- Fuente de verdad = Excel (nombres, edad, sexo, teléfono, cédula validada).
- Nunca inventar cédulas ni nombres.
- Texto tipo "no posee" / "no tiene" **nunca** se guarda en `documento`.

Verificación Nexus (solo si el usuario lo pide):

- Si persona tiene cédula `V` o `E`, Nexus puede reemplazar nombres, edad, sexo
  y teléfono si falta.
- Antes de cualquier petición, consultar `nexus_consultas` por `letra + cedula`.
- Si existe ficha válida en `nexus_consultas`, reutilizarla y **no llamar Nexus**.
- Deduplicar cédulas del mismo Excel: una cédula genera como máximo una petición.
- Toda respuesta Nexus exitosa se guarda en `nexus_consultas`, incluso durante
  dry-run; así `--aplicar` con `--solo-cache-nexus` reutiliza la ficha.
- Si Nexus falla, usar datos del Excel y reportar en `nexus_errores`.
- Calibración: `--concurrency 5`, `--timeout-nexus 20`; no subir concurrency
  sin autorización.

Verificación SIIPOL:

- Preferir skill `importar-verificacion-siipol` (`--solo-marcar-siipol`) para
  listas de antecedentes por campamento (marca + flags; no borra otras marcas).
- `--reconciliar-siipol` solo si el usuario pide lista autoritativa global
  (reemplaza marcas: solo documentos del Excel quedan verificados). Dry-run
  primero; confirmar antes de `--aplicar`.
- Nexus verifica identidad; **no** equivale a verificación SIIPOL.
- **Nunca reimportar el mismo archivo** para backfill de personas: filas sin
  cédula se duplicarían.

Seguridad:

- `Tiene Registro Policial`, `Registro Policial`, `Reg. policial`,
  `Con reg. policial` → `registro_policial`
- `Está Solicitado`, `Solicitado`, `Requerido` → `solicitado`
- Texto SIIPOL con `se encuentra solicitado` / `solicitado por` /
  `persona extraviada` / `extraviada(o)` → `solicitado` (denuncia de
  extraviado = búsqueda activa; misma bandeja KPI Solicitados)
- `Firmó contra Presidente`, `Firmo vs Pres.`, `Milita oposición`,
  afiliación política en texto → **ignorados** (scrub; no persisten)
- `Deportado` → `deportado`
- `Tipo de Registro` → `tipo_registro_policial`
- `Descripción (verificación)` / `Observaciones` /
  `Información de interés` → `observaciones_seguridad`

Destino BD:

- Tabla `censo_registros`
- RPC `censo_importar_lote`
- `origen = import_excel`
- `fuente_archivo = nombre del archivo`

## Reglas de seguridad

- No importar `censo_registros` sin dry-run previo.
- No usar usuario anon; requiere sesión admin/analista.
- No mostrar datos sensibles innecesarios en la respuesta; resumen basta.
- Si aparecen solicitados o registros policiales, informar conteos, no copiar observaciones completas salvo que usuario lo pida.
