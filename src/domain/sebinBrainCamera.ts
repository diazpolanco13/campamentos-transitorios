/**
 * Cámara cinematic (contrato FounderOS cameraRect/lerpRect).
 * En foco: enmarca el árbol compacto centrado — SEBIN alineado con unidad.
 */

export type Rect = { x: number; y: number; w: number; h: number };
export type ViewSize = { w: number; h: number };
export type Pt = { x: number; y: number };
export type Bounds = { minX: number; minY: number; maxX: number; maxY: number };

export type CameraState = {
  focusedUnidad: boolean;
  selectedKind?: "campamento" | "unidad" | "sebin" | "operador" | null;
  selectedNodePos?: Pt | null;
  /** Camp + operadores (clic hoja). Gana sobre zoom estrecho de nodo. */
  campOpsBounds?: Bounds | null;
  /** Posición layout de la unidad en foco (centrado horizontal). */
  focusUnidadPos?: Pt | null;
  focusCenter?: Pt | null;
  focusBounds?: Bounds | null;
  /** Solo núcleo SEBIN (vista inicial cerebro). */
  coreSolo?: boolean;
  /** Posición del núcleo (centro del lienzo). */
  corePos?: Pt | null;
};

const ZOOM_NODE = 0.42;
const ZOOM_FOCUS = 0.78;
/** Núcleo solo: fracción pequeña = cerebro grande y centrado. */
const ZOOM_CORE = 0.34;
const ZOOM_OUT_PAD = 0.06;
/**
 * Ancla el borde inferior del árbol cerca del bottom, con margen para que
 * SEBIN (nodo principal) no quede cortado.
 */
const TREE_BOTTOM_SCREEN_Y = 0.86;

const round2 = (n: number): number => {
  const v = Math.round(n * 100) / 100;
  return Object.is(v, -0) ? 0 : v;
};

function frameOn(view: ViewSize, c: Pt, frac: number): Rect {
  const w = view.w * frac;
  const h = w * (view.h / view.w);
  const x = c.x - w / 2;
  const y = c.y - h / 2;
  return { x: round2(x), y: round2(y), w: round2(w), h: round2(h) };
}

/** Enmarca bounds; centra el bloque en el viewport (no pega abajo). */
function frameBounds(view: ViewSize, b: Bounds, padFrac: number): Rect {
  const padX = (b.maxX - b.minX) * padFrac + view.w * 0.03;
  const padY = (b.maxY - b.minY) * padFrac + view.h * 0.04;
  let w = b.maxX - b.minX + padX * 2;
  let h = b.maxY - b.minY + padY * 2;
  const aspect = view.w / view.h;
  if (w / h > aspect) {
    h = w / aspect;
  } else {
    w = h * aspect;
  }
  // zoom un poco más cerca que antes (nombres legibles)
  const maxW = view.w * 0.92;
  if (w > maxW) {
    const s = maxW / w;
    w = maxW;
    h *= s;
  }
  const minW = view.w * 0.62;
  if (w < minW) {
    const s = minW / w;
    w = minW;
    h *= s;
  }
  const cx = (b.minX + b.maxX) / 2;
  const cy = (b.minY + b.maxY) / 2;
  return {
    x: round2(cx - w / 2),
    y: round2(cy - h / 2),
    w: round2(w),
    h: round2(h),
  };
}

/** Enmarca cluster camp+ops: más cerca que el árbol, más aire que ZOOM_NODE. */
function frameCluster(view: ViewSize, b: Bounds): Rect {
  const pad = 18;
  let w = b.maxX - b.minX + pad * 2;
  let h = b.maxY - b.minY + pad * 2;
  const aspect = view.w / view.h;
  if (w / h > aspect) h = w / aspect;
  else w = h * aspect;
  const minW = view.w * 0.28;
  const maxW = view.w * 0.58;
  if (w < minW) {
    const s = minW / w;
    w = minW;
    h *= s;
  } else if (w > maxW) {
    const s = maxW / w;
    w = maxW;
    h *= s;
  }
  const cx = (b.minX + b.maxX) / 2;
  const cy = (b.minY + b.maxY) / 2;
  return {
    x: round2(cx - w / 2),
    y: round2(cy - h / 2),
    w: round2(w),
    h: round2(h),
  };
}

export function cameraRect(view: ViewSize, s: CameraState): Rect {
  if (s.coreSolo) {
    const c = s.corePos ?? { x: view.w / 2, y: view.h / 2 };
    return frameOn(view, c, ZOOM_CORE);
  }
  if (
    s.campOpsBounds &&
    (s.selectedKind === "campamento" || s.selectedKind === "operador")
  ) {
    return frameCluster(view, s.campOpsBounds);
  }
  if (s.selectedKind === "campamento" && s.selectedNodePos) {
    return frameOn(view, s.selectedNodePos, ZOOM_NODE);
  }
  if (s.focusedUnidad) {
    const unidad =
      s.focusUnidadPos ??
      (s.selectedKind === "unidad" ? s.selectedNodePos : null);
    // Árbol bajado: SEBIN entero cerca del borde; unidad y vínculos arriba
    if (s.focusBounds) {
      const framed = frameBounds(view, s.focusBounds, 0.08);
      const cx = unidad?.x ?? s.focusCenter?.x ?? (s.focusBounds.minX + s.focusBounds.maxX) / 2;
      return {
        ...framed,
        x: round2(cx - framed.w / 2),
        y: round2(s.focusBounds.maxY - framed.h * TREE_BOTTOM_SCREEN_Y),
      };
    }
    if (unidad) return frameOn(view, unidad, ZOOM_FOCUS);
    if (s.focusCenter) return frameOn(view, s.focusCenter, ZOOM_FOCUS);
  }
  // SEBIN no usa zoom de nodo — overview o coreSolo
  if (s.selectedNodePos && s.selectedKind !== "sebin") {
    return frameOn(view, s.selectedNodePos, ZOOM_NODE);
  }
  return {
    x: round2(-view.w * ZOOM_OUT_PAD),
    y: round2(-view.h * ZOOM_OUT_PAD),
    w: round2(view.w * (1 + 2 * ZOOM_OUT_PAD)),
    h: round2(view.h * (1 + 2 * ZOOM_OUT_PAD)),
  };
}

export function lerpRect(cur: Rect, target: Rect, t: number): Rect {
  if (t >= 1) return target;
  const done =
    Math.abs(cur.x - target.x) < 0.05 &&
    Math.abs(cur.y - target.y) < 0.05 &&
    Math.abs(cur.w - target.w) < 0.05 &&
    Math.abs(cur.h - target.h) < 0.05;
  if (done) return target;
  return {
    x: cur.x + (target.x - cur.x) * t,
    y: cur.y + (target.y - cur.y) * t,
    w: cur.w + (target.w - cur.w) * t,
    h: cur.h + (target.h - cur.h) * t,
  };
}

export const CAM_EASE = 0.055;
export const CAM_EASE_HOME = 0.045;
/** Entrada overview → unidad: un poco más lento. */
export const CAM_EASE_ENTER_FOCUS = 0.018;
/** Núcleo → red expandida: zoom-out cinematográfico. */
export const CAM_EASE_EXPAND = 0.014;
