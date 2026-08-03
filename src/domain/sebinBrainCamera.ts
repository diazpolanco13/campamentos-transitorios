/**
 * Cámara cinematic (contrato FounderOS cameraRect/lerpRect).
 * En foco de unidad: enmarca el árbol completo — no zoom al hub.
 * Zoom estrecho solo si el seleccionado es un campamento.
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

const ZOOM_NODE = 0.48;
const ZOOM_FOCUS = 0.88;
const ZOOM_OUT_PAD = 0.06;

const round2 = (n: number): number => {
  const v = Math.round(n * 100) / 100;
  return Object.is(v, -0) ? 0 : v;
};

function frameOn(view: ViewSize, c: Pt, frac: number): Rect {
  const w = view.w * frac;
  const h = w * (view.h / view.w);
  const x = Math.max(0, Math.min(view.w - w, c.x - w / 2));
  const y = Math.max(0, Math.min(view.h - h, c.y - h / 2));
  return { x: round2(x), y: round2(y), w: round2(w), h: round2(h) };
}

/** Enmarca bounds con padding fraccional; mantiene aspect del canvas. */
function frameBounds(view: ViewSize, b: Bounds, padFrac: number): Rect {
  const padX = (b.maxX - b.minX) * padFrac + view.w * 0.04;
  const padY = (b.maxY - b.minY) * padFrac + view.h * 0.04;
  let x = b.minX - padX;
  let y = b.minY - padY;
  let w = b.maxX - b.minX + padX * 2;
  let h = b.maxY - b.minY + padY * 2;
  const aspect = view.w / view.h;
  if (w / h > aspect) {
    const nh = w / aspect;
    y -= (nh - h) / 2;
    h = nh;
  } else {
    const nw = h * aspect;
    x -= (nw - w) / 2;
    w = nw;
  }
  // no más chico que ZOOM_FOCUS del canvas
  const minW = view.w * 0.55;
  if (w < minW) {
    x -= (minW - w) / 2;
    const nh = minW / aspect;
    y -= (nh - h) / 2;
    w = minW;
    h = nh;
  }
  return { x: round2(x), y: round2(y), w: round2(w), h: round2(h) };
}

export function cameraRect(view: ViewSize, s: CameraState): Rect {
  // zoom nodo solo en camp — si no, el árbol queda cortado (bug del MVP)
  if (s.selectedKind === "campamento" && s.selectedNodePos) {
    return frameOn(view, s.selectedNodePos, ZOOM_NODE);
  }
  if (s.focusedUnidad) {
    if (s.focusBounds) return frameBounds(view, s.focusBounds, 0.12);
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

export const CAM_EASE = 0.12;
export const CAM_EASE_HOME = 0.08;
