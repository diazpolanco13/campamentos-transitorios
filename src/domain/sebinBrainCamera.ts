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
  selectedKind?: "campamento" | "unidad" | "sebin" | null;
  selectedNodePos?: Pt | null;
  focusCenter?: Pt | null;
  focusBounds?: Bounds | null;
};

const ZOOM_NODE = 0.42;
const ZOOM_FOCUS = 0.78;
const ZOOM_OUT_PAD = 0.06;

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

export function cameraRect(view: ViewSize, s: CameraState): Rect {
  if (s.selectedKind === "campamento" && s.selectedNodePos) {
    return frameOn(view, s.selectedNodePos, ZOOM_NODE);
  }
  if (s.focusedUnidad) {
    // prioriza centro en la unidad (eje vertical mid-pantalla)
    if (s.focusBounds && s.focusCenter) {
      const framed = frameBounds(view, s.focusBounds, 0.08);
      // re-centrar horizontal/vertical en focusCenter (tronco al medio)
      return {
        ...framed,
        x: round2(s.focusCenter.x - framed.w / 2),
        y: round2(s.focusCenter.y - framed.h / 2),
      };
    }
    if (s.focusBounds) return frameBounds(view, s.focusBounds, 0.08);
    if (s.focusCenter) return frameOn(view, s.focusCenter, ZOOM_FOCUS);
  }
  if (s.selectedNodePos) return frameOn(view, s.selectedNodePos, ZOOM_NODE);
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
