---
name: cinematic-brain-graph
description: >-
  Implementa vistas tipo /brain: grafo radial SVG + d3-force, cámara
  cinematográfica (viewBox), foco árbol/abanico, núcleo neuronal, chrome
  flotante y lazy route. Usar cuando el usuario pida brain, grafo operativo,
  knowledge graph radial, force-graph SVG, foco de unidad, SebinBrain,
  FounderOS-style graph, o pantallas full-bleed con nodos y severidad.
---

# Cinematic Brain Graph

Patrón reutilizable extraído de `/brain` (este repo) y su fuente
**FounderOS** (`KnowledgeGraph` + `tree-layout` + cámara). No inventar stack
nuevo: copiar arquitectura en capas.

Referencia viva: `src/features/brain/`, `src/domain/sebinBrain*.ts`.
Detalle stack/mapa: [reference.md](reference.md). Checklist: [recipes.md](recipes.md).

## Cuándo activar

- Nueva ruta `/algo` estilo cerebro / org chart radial / grafo de mando
- Portar o adaptar FounderOS brain a otro dominio
- Añadir foco de “unidad/pilar”, expand-from-core, filtros sobre nodos
- Performance: d3 tick libre + React a 60fps

## Stack fijo (no negociar sin motivo)

| Capa | Tech |
|------|------|
| Render | **SVG** (no Canvas/WebGL/react-force-graph) |
| Física | **`d3-force`** (`forceSimulation`, link, manyBody, radial, collide, X/Y) |
| Cámara | **`viewBox`** + `cameraRect` / `lerpRect` (puro, sin DOM) |
| Paint React | **`rafThrottle`** → `setTick` (sim libre, re-render ≤1/frame) |
| UI chrome | Tailwind + shadcn (`Button`, `Sheet`, `Tooltip`, `Card`) |
| Iconos | lucide-react |
| Datos | hooks dominio del proyecto (aquí: Supabase); grafo = modelo puro |
| Ruta | `React.lazy` + skeleton dimension-matched |

Deps mínimas nuevas: `d3-force` + `@types/d3-force`.

## Arquitectura obligatoria (3 capas)

```
domain/          ← puro TS, sin React/DOM; testeable
  *Graph.ts      build nodes/edges, severidad, anillos, ángulos
  *Camera.ts     cameraRect, lerpRect, CAM_EASE*
  *Focus.ts      layoutFoco*, branchPath, wheelStageGeom, rotateAbout
features/<id>/
  <Name>View.tsx     datos + filtros + overlays + sheet
  <Name>Graph.tsx    sim + SVG + gestos + rAF cámara
  <Name>Core.tsx     núcleo decorativo (opcional)
  Totales*.tsx       KPIs flotantes
  Filtros*.tsx       filtros OR sobre nodos hoja
  *Skeleton.tsx      fallback lazy
lib/raf-throttle.ts
```

**Regla:** layout/cámara/builder **nunca** importan React. El componente solo
alimenta targets a la sim y dibuja.

## Modelo de grafo (dominio)

1. **Kinds** jerárquicos (ej. `core` → `hub` → `leaf`).
2. **Anillos polares** en overview: `angle` + `radius` unitarios → escalar a canvas.
3. **Edges** tipados (`supervisa` / `opera`…).
4. **Métrica visual** (aquí: `SeveridadBrain`) agrega hacia arriba (`peorSeveridad`).
5. Builder determinístico: mismo input → mismos ángulos/ids.

IDs estables: `core`, `unidad:<clave>`, `camp:<centroId>`.

## Dos modos visuales

| Modo | Layout | Fuerzas |
|------|--------|---------|
| **Overview** | anillos + `restHome(angle,radius)` | link + charge + radial + collide ON |
| **Focus** | árbol/abanico puro (`layoutFoco*`) | charge/radial OFF; custom **stage force** pull a targets |

Transición overview→foco: pull suave unos ms, luego snap (evita teletransporte brusco).
Hermanos fuera de foco: **rim/wheel** (`wheelStageGeom` + `rotateAbout`) — carrusel.

## Cámara cinematográfica

- Un solo rAF: `lerpRect(cur, cameraRect(view, state), ease)`.
- Estados: `coreSolo` | overview | `focusedUnidad` | zoom nodo hoja.
- Ease distinto: home / enter-focus / expand (`CAM_EASE_*`).
- Zoom usuario = factor aparte sobre el rect (clamp); pan = offset; gestos no pelean con lerp.

## Núcleo + expand

1. Vista inicial opcional: solo core grande (`coreSolo`).
2. Expand: `seedExpandBurst` + `alpha` alto → asienta; reveal opacidad con `easeInOutCubic`.
3. Core SVG: hex + golden spiral + pulsos rAF (`SebinNeuralCore`) — cosmético, no física.

## Gestos

- Wheel → zoom al cursor; fondo pointer → pan; nodo pointer → drag (fx/fy) o click.
- Touch: 1 dedo pan/tap; 2 dedos pinch zoom; `touch-none` en SVG.
- `suppressClick` tras drag; Escape limpia foco/selección.
- Respetar `prefers-reduced-motion`.

## Chrome full-bleed

Lienzo `absolute inset-0`. Encima (pointer-events selectivo):

- KPIs top/bottom (`TotalesBrain`)
- Filtros / leyenda clicable
- Controles zoom + reset vista
- Lista/sheet móvil (`Sheet`) para detalle hoja
- Migas / volver a unidad

Filtros: `Set<>` OR; vacío = todos. Filtrar **hojas**; hubs se atenúan si quedan sin hijos visibles.

## Wiring ruta

```tsx
const importX = () => import("./features/.../XView");
const XView = lazy(() => importX().then((m) => ({ default: m.XView })));
// preload en arranque si es ruta inicial del rol
// Route + Suspense con *Skeleton que imita chrome (no spinner genérico)
```

## Anti-patrones

- Meter `d3-force` en el domain builder
- Re-render React en cada tick sin `rafThrottle`
- Librería 3D/canvas “porque queda cool”
- Foco = solo filtrar nodos sin layout dedicado
- Cámara con CSS transform en el SVG entero (usar viewBox)
- Hardcodear W/H sin viewBox estable (aquí 1000×720)
- Copiar FounderOS tal cual (Next, memory core, lenses) — adaptar dominio

## Orden de implementación

Seguir [recipes.md](recipes.md). Resumen:

1. Domain graph + types + builder  
2. Camera + focus puros (+ tests si hay vitest)  
3. `rafThrottle`  
4. Graph SVG mínimo (overview + tick)  
5. Focus + rim  
6. Core / expand / pulsos  
7. View + datos + filtros + sheet  
8. Lazy route + skeleton + sidebar  

## Referencias canónicas (este repo)

| Pieza | Archivo |
|-------|---------|
| Vista | `src/features/brain/BrainView.tsx` |
| Motor SVG | `src/features/brain/SebinBrainGraph.tsx` |
| Núcleo | `src/features/brain/SebinNeuralCore.tsx` |
| Grafo | `src/domain/sebinBrainGraph.ts` |
| Cámara | `src/domain/sebinBrainCamera.ts` |
| Foco | `src/domain/sebinBrainFocus.ts` |
| Throttle | `src/lib/raf-throttle.ts` |

Fuente estética/engine: FounderOS-DEMO
(`components/KnowledgeGraph.tsx`, `lib/tree-layout.ts`, `lib/memory-core.ts`
cámara, `lib/raf-throttle.ts`). En este VPS suele estar en `/tmp/FounderOS-DEMO`
(o carpeta hermana del repo en la máquina del usuario).
