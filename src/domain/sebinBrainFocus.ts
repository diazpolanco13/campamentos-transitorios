/**
 * Layout de foco estilo FounderOS (abanico, no grilla-columna):
 * SEBIN → unidad (tronco corto, centrado) → camps en arco horizontal.
 * Muchos camps → 2 filas intercaladas (brick), no 3×N columnas.
 */

export type Pt = { x: number; y: number };
export type Bounds = { minX: number; minY: number; maxX: number; maxY: number };

export type FocusBranch = {
  source: string;
  target: string;
  depth: number;
};

export type FocusLimb = {
  id: string;
  campId: string;
  x: number;
  y: number;
  label: string;
};

export type FocusLayoutInput = {
  sebinId: string;
  unidadId: string;
  camps: { id: string; label: string; sublabel?: string | null }[];
  width: number;
  height: number;
};

export type FocusLayoutResult = {
  positions: Map<string, Pt>;
  branches: FocusBranch[];
  limbs: FocusLimb[];
  labelsReadable: boolean;
  dense: boolean;
  focusCenter: Pt;
  focusBounds: Bounds;
};

export function limbIdForCamp(campId: string): string {
  return `limb:${campId}`;
}

const round2 = (n: number) => {
  const v = Math.round(n * 100) / 100;
  return Object.is(v, -0) ? 0 : v;
};

export function branchPath(a: Pt, b: Pt): string {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  // curva más abierta cerca del hub — menos haz apretado al salir
  const c1x = a.x + dx * 0.18;
  const c1y = a.y + dy * 0.28;
  const c2x = b.x - dx * 0.12;
  const c2y = a.y + dy * 0.72;
  return `M ${round2(a.x)} ${round2(a.y)} C ${round2(c1x)} ${round2(c1y)}, ${round2(c2x)} ${round2(c2y)}, ${round2(b.x)} ${round2(b.y)}`;
}

export function branchWidth(depth: number): number {
  return round2(Math.max(1.1, 3.2 - depth * 0.7));
}

/** Unidad cerca del centro vertical — bloque compacto. */
const UNIDAD_Y = 0.58;
const SEBIN_GAP = 100; // aire SEBIN ↔ unidad (antes 48, se pisaban)
const CAMP_Y1 = 0.30; // arco más arriba → vínculos más largos desde unidad
const CAMP_Y2 = 0.17; // segunda fila (solo denso)
const MARGIN = 56;
const TWO_ROW_AT = 13;
const LABEL_MAX_N = 8;

function displayName(label: string, max = 14): string {
  const base = label.trim();
  if (base.length <= max) return base;
  return `${base.slice(0, max - 1).trimEnd()}…`;
}

function fanXs(
  count: number,
  cx: number,
  half: number,
  stagger = 0,
): number[] {
  if (count <= 0) return [];
  if (count === 1) return [cx + stagger];
  return Array.from({ length: count }, (_, i) => {
    const t = (i / (count - 1)) * 2 - 1;
    return cx + t * half + stagger;
  });
}

export function layoutFocoUnidad(input: FocusLayoutInput): FocusLayoutResult {
  const { sebinId, unidadId, camps, width: W, height: H } = input;
  const cx = W / 2;
  const clampX = (x: number) => Math.max(MARGIN, Math.min(W - MARGIN, x));

  const yUnidad = round2(H * UNIDAD_Y);
  const ySebin = round2(yUnidad + SEBIN_GAP);
  const yCamp1 = round2(H * CAMP_Y1);
  const yCamp2 = round2(H * CAMP_Y2);
  const yLimb = round2((yUnidad + yCamp1) / 2);

  const positions = new Map<string, Pt>();
  const branches: FocusBranch[] = [];
  const limbs: FocusLimb[] = [];

  positions.set(sebinId, { x: cx, y: ySebin });
  positions.set(unidadId, { x: cx, y: yUnidad });
  branches.push({ source: sebinId, target: unidadId, depth: 1 });

  const n = camps.length;
  const dense = n >= TWO_ROW_AT;
  const half = W / 2 - MARGIN;

  if (n > 0 && !dense) {
    // 1 fila — abanico clásico
    const xs = fanXs(n, cx, half * Math.min(1, 0.35 + n * 0.06));
    camps.forEach((c, i) => {
      const x = clampX(xs[i] ?? cx);
      const lid = limbIdForCamp(c.id);
      positions.set(lid, { x, y: yLimb });
      positions.set(c.id, { x, y: yCamp1 });
      limbs.push({
        id: lid,
        campId: c.id,
        x,
        y: yLimb,
        label: displayName(c.label),
      });
      branches.push({ source: unidadId, target: lid, depth: 2 });
      branches.push({ source: lid, target: c.id, depth: 3 });
    });
  } else if (n > 0) {
    // 2 filas intercaladas (brick) — evita columnas verticales
    const n1 = Math.ceil(n / 2);
    const n2 = n - n1;
    const xs1 = fanXs(n1, cx, half);
    const cell = n1 <= 1 ? 0 : (2 * half) / (n1 - 1);
    const xs2 = fanXs(n2, cx, half - cell / 2, 0);

    const place = (
      slice: typeof camps,
      xs: number[],
      campY: number,
    ) => {
      slice.forEach((c, i) => {
        const x = clampX(xs[i] ?? cx);
        positions.set(c.id, { x, y: campY });
        branches.push({ source: unidadId, target: c.id, depth: 2 });
      });
    };
    place(camps.slice(0, n1), xs1, yCamp1);
    place(camps.slice(n1), xs2, yCamp2);
  }

  const labelsReadable = n > 0 && n <= LABEL_MAX_N;

  let minX = cx;
  let maxX = cx;
  let minY = dense ? yCamp2 : yCamp1;
  let maxY = ySebin;
  for (const id of [sebinId, unidadId, ...camps.map((c) => c.id)]) {
    const p = positions.get(id);
    if (!p) continue;
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  minX -= 32;
  maxX += 32;
  minY -= labelsReadable ? 36 : 18;
  maxY += 72; // margen bajo SEBIN — evita corte en el borde del viewport

  return {
    positions,
    branches,
    limbs,
    labelsReadable,
    dense,
    focusCenter: { x: cx, y: round2((yUnidad + (dense ? yCamp2 : yCamp1)) / 2) },
    focusBounds: { minX, minY, maxX, maxY },
  };
}

export const DEPTH_Y = [UNIDAD_Y + 0.07, UNIDAD_Y, CAMP_Y1];

// ── foco camp → operadores (micro-abanico, no anillo overview) ───────────

const OP_R1 = 38;
const OP_R2 = 58;
const OP_TWO_RING_AT = 9;
const OP_PAD = 28;

export type FocusCampOpsInput = {
  campId: string;
  camp: Pt;
  /** Unidad padre: el abanico apunta hacia afuera (opuesto a este punto). */
  unidad?: Pt | null;
  ops: { id: string }[];
};

export type FocusCampOpsResult = {
  positions: Map<string, Pt>;
  branches: FocusBranch[];
  bounds: Bounds;
  dense: boolean;
};

/** Operadores en arco alrededor del camp. 9+ → dos aros. */
export function layoutFocoCampamento(
  input: FocusCampOpsInput,
): FocusCampOpsResult {
  const { campId, camp, unidad, ops } = input;
  const n = ops.length;
  const dense = n >= OP_TWO_RING_AT;
  const dx = camp.x - (unidad?.x ?? camp.x);
  const dy = camp.y - (unidad?.y ?? camp.y + 48);
  const base =
    Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01 ? -Math.PI / 2 : Math.atan2(dy, dx);

  const positions = new Map<string, Pt>();
  const branches: FocusBranch[] = [];
  positions.set(campId, { x: round2(camp.x), y: round2(camp.y) });

  const placeRing = (
    slice: { id: string }[],
    radius: number,
    span: number,
  ) => {
    const m = slice.length;
    slice.forEach((op, i) => {
      const t = m <= 1 ? 0.5 : i / (m - 1);
      const a = base - span / 2 + t * span;
      positions.set(op.id, {
        x: round2(camp.x + Math.cos(a) * radius),
        y: round2(camp.y + Math.sin(a) * radius),
      });
      branches.push({ source: campId, target: op.id, depth: 4 });
    });
  };

  if (n === 1) {
    placeRing(ops, OP_R1, 0);
  } else if (n > 0 && !dense) {
    const span = Math.min(Math.PI * 1.25, 0.38 * n + 0.55);
    placeRing(ops, OP_R1, span);
  } else if (n > 0) {
    const n1 = Math.ceil(n / 2);
    placeRing(ops.slice(0, n1), OP_R1, Math.PI * 1.35);
    placeRing(ops.slice(n1), OP_R2, Math.PI * 1.5);
  }

  let minX = camp.x;
  let maxX = camp.x;
  let minY = camp.y;
  let maxY = camp.y;
  for (const p of positions.values()) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  return {
    positions,
    branches,
    dense,
    bounds: {
      minX: minX - OP_PAD,
      minY: minY - OP_PAD,
      maxX: maxX + OP_PAD,
      maxY: maxY + OP_PAD,
    },
  };
}

// ── rim / wheel ──────────────────────────────────────────────────────────

const RIM_EDGE_INSET = 88;
const RIM_DROP_FRAC = 0.11;

export type FocusWheel = {
  hub: Pt;
  scale: number;
  stage: number;
};

export function focusWheel(
  width: number,
  height: number,
  ringR1: number,
): FocusWheel {
  const hub = { x: width / 2, y: height * 1.28 };
  const teamBandY = height * UNIDAD_Y;
  const scale = (hub.y - teamBandY) / Math.max(1, ringR1);
  return { hub, scale, stage: -Math.PI / 2 };
}

export function wheelStageGeom(
  width: number,
  height: number,
): { hub: Pt; R: number; delta: number } {
  const apexY = height * UNIDAD_Y;
  const dx = width / 2 - RIM_EDGE_INSET;
  const dy = height * RIM_DROP_FRAC;
  const R = (dx * dx + dy * dy) / (2 * dy);
  return {
    hub: { x: width / 2, y: apexY + R },
    R,
    delta: Math.asin(Math.min(1, dx / R)),
  };
}

export function wheelStageSpot(
  offset: number,
  width: number,
  height: number,
): Pt {
  const { hub, R, delta } = wheelStageGeom(width, height);
  const a = -Math.PI / 2 + offset * delta;
  return {
    x: round2(hub.x + R * Math.cos(a)),
    y: round2(hub.y + R * Math.sin(a)),
  };
}

export function cyclicDeltaF(from: number, to: number, n: number): number {
  if (n <= 0) return 0;
  let d = (to - from) % n;
  if (d < 0) d += n;
  if (d > n / 2) d -= n;
  return d;
}

export function shortestAngleDelta(a: number, b: number): number {
  let d = (b - a) % (2 * Math.PI);
  if (d > Math.PI) d -= 2 * Math.PI;
  if (d <= -Math.PI) d += 2 * Math.PI;
  return d;
}

export function deltaGiroApex(unidadAngle: number): number {
  return shortestAngleDelta(unidadAngle, -Math.PI / 2);
}

export function rotateAbout(p: Pt, origin: Pt, radians: number): Pt {
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const dx = p.x - origin.x;
  const dy = p.y - origin.y;
  return {
    x: origin.x + dx * cos - dy * sin,
    y: origin.y + dx * sin + dy * cos,
  };
}
