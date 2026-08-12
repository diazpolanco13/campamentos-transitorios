---
name: cinematic-brain-graph-reference
description: Stack, técnicas y mapa FounderOS → /brain. Leer desde SKILL.md.
---

# Reference — Cinematic Brain Graph

## Inventario `/brain` (este repo)

### Dependencias npm usadas por la feature

| Package | Rol en /brain |
|---------|----------------|
| `d3-force` | Simulación: link, manyBody, radial, collide, X, Y |
| `@types/d3-force` | Tipos |
| `react` / `react-dom` | Vista + refs + rAF |
| `react-router-dom` | Ruta `/brain`, navigate a ficha |
| `lucide-react` | Iconos chrome / KPIs / filtros |
| `clsx` + `tailwind-merge` vía `@/lib/utils` `cn` | Clases |
| shadcn/radix (`button`, `sheet`, `tooltip`, `card`, `popover`, `switch`, `label`, `button-group`) | Chrome |
| Tailwind 4 | Layout full-bleed, blur KPI, grid animado |
| Supabase hooks (`useSupabaseQuery`, ocupaciones, reporte, salud, eventos, denuncias) | Datos operativos |

**No usa:** react-force-graph, three.js, pixi, canvas API, framer-motion en el grafo
(framer puede existir en el monorepo; el brain anima con rAF + SVG attrs).

### Archivos y responsabilidad

| Archivo | Líneas ~ | Qué hace |
|---------|----------|----------|
| `BrainView.tsx` | 667 | Orquesta datos, permisos, filtros, KPIs, panel lista, sheet detalle |
| `SebinBrainGraph.tsx` | 2490 | Motor: sim, cámara, gestos, SVG, leyenda, detalle nodo |
| `SebinNeuralCore.tsx` | 276 | Hex + spiral dorada + pulsos + corriente en aro |
| `FiltrosReporteBrain.tsx` | 174 | Set OR de estados reporte + crítica |
| `TotalesBrain.tsx` | 93 | 4 KPIs flotantes glass |
| `BrainViewSkeleton.tsx` | 32 | Fallback lazy |
| `sebinBrainGraph.ts` | ~280 | Builder + severidad |
| `sebinBrainCamera.ts` | ~140 | cameraRect / lerpRect / eases |
| `sebinBrainFocus.ts` | ~270 | Abanico foco + wheel geom |
| `raf-throttle.ts` | 19 | Paint ≤1/frame |

### Técnicas concretas

1. **SVG viewBox como cámara** — no transform CSS del root.
2. **Custom force “stage”** — pull a `targetOf(node)` además de fuerzas d3.
3. **Focus = layout manda** — `forceManyBody`/`forceRadial` strength 0; collide solo apex.
4. **Rim carousel** — unidades hermanas en arco bajo el canvas (`wheelStageGeom`).
5. **Expand burst** — seed posiciones cerca del core + vx radial + alpha spike.
6. **Pulsos en aristas** — círculos que interpolan Bezier/`puntoArco` en rAF (DOM directo, no React state).
7. **Labels densos** — abanico: N.º corto; hover → nombre; `fixedLabel` scale-invariant opcional (FounderOS).
8. **Glow** — `<filter id="brainSoftGlow">` feGaussianBlur.
9. **Grid espacial** — CSS `.sebin-space-grid` (equivalente `kg-grid` FounderOS).
10. **Radar rings** — círculos `ORBIT_R` que aparecen con expand.
11. **Dim/spotlight** — `nodeOpacity` / `edgeActive` según focus + filtros + hover.
12. **Lazy + preload** — `importBrainView` factory; App precarga si pathname/role lo pide.
13. **Mobile** — sheet solo campamentos; leyenda colapsable; touch pan/pinch.
14. **A11y motion** — `prefers-reduced-motion` corta rotación/pulsos/ease agresivo.

### Constantes típicas (Sebin)

```
VB 1000×720 · SCALE 340 · RING_PX {0, 0.42S, 0.82S}
USER_ZOOM 0.35–3.2 · EXPAND_MS 3200 · velocityDecay ~0.72
```

Ajustar por densidad de nodos; no copiar ciego si el dominio tiene 10× más hojas.

---

## Mapa FounderOS → adaptación SEBIN

Fuente demo: `/tmp/FounderOS-DEMO` (o clone Founder OS open-source).

| FounderOS | Este repo | Notas |
|-----------|-----------|-------|
| `components/KnowledgeGraph.tsx` | `SebinBrainGraph.tsx` | Mismo motor; dominio org→campamentos |
| `lib/tree-layout.ts` | `sebinBrainFocus.ts` | Founder = árbol 5 niveles; SEBIN = abanico 2 filas brick |
| `lib/memory-core.ts` (`cameraRect`/`lerpRect`) | `sebinBrainCamera.ts` | Misma idea; estados renombrados (`focusedTeam`→`focusedUnidad`, `coreExpanded`→`coreSolo` invertido en semántica inicial) |
| `lib/raf-throttle.ts` | `lib/raf-throttle.ts` | Casi idéntico |
| `lib/knowledge-graph.ts` | `sebinBrainGraph.ts` | Builder distinto (pilares/agents vs unidades/camps) |
| `components/BrainCore.tsx` / hex en KG | `SebinNeuralCore.tsx` | Núcleo interactivo vs núcleo visual |
| `components/BrainGraphView.tsx` | (no portado) | Switch radial/neural — opcional futuro |
| `components/NeuralGraph.tsx` | (no portado) | Layout horizontal capas; sin d3 |
| `lib/graph-lens.ts` | filtros reporte | Lentes → Set de severidad |
| Next `dynamic(ssr:false)` | `React.lazy` + Vite | Mismo objetivo: chunk pesado fuera del boot |
| Vitest tree/camera/raf | (gaps) | Ideal portar tests al adaptar |

### Qué NO portar de FounderOS (salvo pedido explícito)

- Memory core / distill embeddings / search notes
- GraphDirectory aside dual
- Lenses ACTION/ENTITY/FUNCTION
- Fullscreen portal separado
- Neural horizontal shimmer strands
- Next.js / SQLite / agent roster

---

## Contrato de props del motor (plantilla)

```ts
type BrainGraphProps<Node> = {
  graph: { nodes: Node[]; edges: { source: string; target: string; kind: string }[] };
  selectedId: string | null;
  onSelect: (node: Node | null) => void;
  focusHubId: string | null;
  onFocusHubIdChange: (id: string | null) => void;
  ocultarChromeFlotante?: boolean;
  vistaResetKey?: number; // ++ → expand + home camera
  className?: string;
};
```

Vista padre posee: datos, filtros, `selectedId`, `focusHubId`, navegación.

---

## Fuerzas d3 — receta overview

```
forceLink      distance hub>leaf mayor; strength ~0.28; 0 en focus
forceManyBody  leaf débil, hub fuerte; 0 en focus
forceRadial    hacia RING_PX[ring]; 0 en focus
forceCollide   R_NODE[kind] + padding
forceX/Y       strength 0 (ancla suave opcional)
+ stageForce   pull a restHome / layout foco / rim
```

`velocityDecay` alto (~0.7) = asienta sin jelly eterno.

---

## Datos / severidad (patrón SEBIN)

```
pulses: Map<centroId, { critica, estadoReporte, fasesOk }>
severidadCampamento → peorSeveridad sube a unidad → core
colores META_SEVERIDAD_BRAIN
```

Al adaptar: reemplazar “reporte diario” por la métrica de negocio (SLA, health, riesgo).
Mantener agregación monotónica hacia la raíz.
