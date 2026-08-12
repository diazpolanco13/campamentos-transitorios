---
name: cinematic-brain-graph-recipes
description: Checklist paso a paso para implementar un brain graph. Leer desde SKILL.md.
---

# Recipes — implementar un brain graph

Copiar checklist y marcar. Referencia código: `src/features/brain/` + `src/domain/sebinBrain*`.

## Recipe A — Nueva vista en este monorepo

```
Progress:
- [ ] 1. Tipos + builder dominio
- [ ] 2. Cámara pura
- [ ] 3. Focus/wheel puro
- [ ] 4. rafThrottle (reusar @/lib/raf-throttle)
- [ ] 5. Graph SVG overview
- [ ] 6. Focus + rim + camera rAF
- [ ] 7. Core / expand (opcional)
- [ ] 8. View + hooks datos + filtros
- [ ] 9. Skeleton + lazy route + nav
- [ ] 10. Mobile sheet + reduced motion
```

### 1. Domain graph

Crear `src/domain/<x>BrainGraph.ts`:

- Types: `Kind`, `Node`, `Edge`, `Graph`, métrica visual
- `build…Graph(entities, opts)` → nodes con `angle`/`radius`/`ring`
- Agregar métrica hacia arriba
- Export `META_*` colores/labels

Validar: builder puro, sin imports de features/.

### 2. Cámara

Copiar/adaptar `sebinBrainCamera.ts`:

- `cameraRect(view, state)` para: coreSolo, focus, selected leaf, overview
- `lerpRect` + `CAM_EASE*`

### 3. Focus

Adaptar `sebinBrainFocus.ts`:

- 1 hub + N leaves → abanico; si N grande → 2 filas brick
- `branchPath` cúbica; `wheelStageGeom` / `rotateAbout` / `cyclicDeltaF`

### 4–6. Motor SVG

Nuevo `src/features/<x>/<X>Graph.tsx`:

1. viewBox fijo (ej. 1000×720), `restHome` polar
2. `forceSimulation` + `rafThrottle(() => setTick)`
3. stage force → `targetOf`
4. Un rAF: cámara + pulsos + wheel ease
5. Pointer/wheel/touch
6. Al set focusHub: layout map → targets; charge off
7. Rim para hubs no focales

Empezar sin labels fancy; añadir glow/radar después.

### 7. Core

Opcional: portar `SebinNeuralCore` (hex + golden angle). Props: `radius`, `color`, `label`.

### 8. View

`BrainView` pattern:

- Hooks datos → `useMemo` graph
- State: selected, focus, filtros, vistaResetKey
- Full-bleed: Graph absolute; chrome z-index
- Sheet detalle solo leaf en móvil
- KPIs desde `graph.resumen`

### 9. Ruta

En `App.tsx`:

- `importX` factory + `lazy`
- Route + skeleton
- Preload opcional
- Sidebar link + `migasPan` si aplica
- Permisos ruta (`rutaPermitidaParaRol`)

### 10. Pulido

- `prefers-reduced-motion`
- Filtros OR + atenuar hubs vacíos
- Reset vista (`vistaResetKey++`)
- No solapar chrome ( ControlesMapaFlotantes pattern)

---

## Recipe B — Portar desde FounderOS

Si el usuario apunta a un clone FounderOS:

1. Leer `components/KnowledgeGraph.tsx` (imports top + sim setup + camera effect).
2. Extraer solo: sim forces, stage targets, viewBox lerp, gestos.
3. Sustituir `lib/knowledge-graph` por builder del dominio destino.
4. Sustituir `treeLayout` multi-nivel por abanico 2–3 niveles si el dominio es plano.
5. Tirar memory/lenses/directory salvo que se pidan.
6. Cambiar Next `dynamic` → Vite `lazy`.
7. Re-theme: tokens Tailwind del destino (no `--os-*`).

Diff mental: FounderOS = org AI + notes; SEBIN = mando territorial + severidad día.

---

## Recipe C — Extender /brain existente

| Pedido | Dónde tocar |
|--------|-------------|
| Nueva métrica color | `sebinBrainGraph.ts` + leyenda |
| Nuevo filtro | `FiltrosReporteBrain.tsx` + opacity en Graph |
| Otro layout foco | `sebinBrainFocus.ts` only |
| Más zoom/pan feel | `sebinBrainCamera.ts` + gestos Graph |
| KPI nuevo | `TotalesBrain.tsx` + resumen builder |
| Performance jank | verificar rafThrottle; bajar nodos; pulsos vía refs no state |

No meter lógica de negocio nueva dentro de `SebinBrainGraph.tsx` si cabe en domain.

---

## Smoke test manual

1. Load `/brain` — skeleton → expand/asiento sin crash.
2. Click hub → abanico; flechas rim cambian hub.
3. Click leaf → sheet/detalle; Escape limpia.
4. Pinch/wheel zoom; doble reset vuelve home.
5. Filtro severidad atenúa; limpiar restaura.
6. `prefers-reduced-motion: reduce` — sin spin loco.
7. Rol sin permiso — ruta bloqueada (si aplica).

---

## Commit style (si piden commit)

`feat(brain): …` / `fix(brain): …` — cuerpo: por qué (cámara, foco, severidad), no lista de archivos.
