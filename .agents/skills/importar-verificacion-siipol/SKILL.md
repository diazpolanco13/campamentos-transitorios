---
name: importar-verificacion-siipol
description: Marca verificación SIIPOL y flags de seguridad (registro policial / solicitado) desde listas de antecedentes por campamento, sin reimportar personas ni firmas de referéndum. Usar cuando el usuario pase Excel de verificación/contrainteligencia/SIIPOL, diga marcar siipol, o trabaje archivos en tmp/siipol/.
---

# Importar verificación SIIPOL

## Cuándo

Listas de verificación policial / contrainteligencia / antecedentes por
campamento (columna `SISTEMAS DE CONTRAINTELIGENCIA Y SIIPOL`).

**No** usar para censo nuevo de personas → skill `importar-excel-censo`.

## Qué hace

- `verificado_siipol = true` (match por `documento_norm`)
- `registro_policial` / `solicitado` / `deportado` si texto lo indica
- Obs = delito / solicitado; **scrub** firmas referéndum (`FIRMO…GOBIERNO/PRESIDENTE`)
- `SIN INFORMACION` / `NO REGISTRA` / `MENOR` / `N/A` → verificado, sin obs
- **No** crea personas. **No** Nexus. **No** `--reconciliar-siipol`.

## Flujo

1. Confirmar `.xlsx` existe (preferido `tmp/siipol/…`).
2. Dry-run:

```bash
python3 scripts/importar_excel_censo.py \
  --archivo "tmp/siipol/ARCHIVO.xlsx" \
  --solo-marcar-siipol \
  --dry-run
```

3. Reportar solo conteos: `filas_leidas`, `verificados_siipol`,
   `registro_policial`, `solicitados`. No pegar obs sensibles.
4. Tras OK explícito del usuario:

```bash
python3 scripts/importar_excel_censo.py \
  --archivo "tmp/siipol/ARCHIVO.xlsx" \
  --solo-marcar-siipol \
  --aplicar
```

5. Verificar KPIs Importaciones Excel (SIIPOL / reg. policial).

## Reglas

- Credenciales: `NEXUS_SCRIPT_EMAIL` / `NEXUS_SCRIPT_PASSWORD` + `.env` Supabase.
- `firmo_contra_presidente` siempre false; nunca persistir referéndum.
- Sin cédula → no match por documento (RPC fallback nombre+fuente frágil; reportar).
- Un archivo = un campamento típico; no mezclar con import censo.
