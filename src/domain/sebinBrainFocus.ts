/**
 * Layout de foco: árbol ordenado y legible (estilo FounderOS treeLayout).
 * SEBIN base → unidad tronco → camps en filas/abanico, siempre on-canvas.
 */

export type Pt = { x: number; y: number };
export type Bounds = { minX: number; minY: number; maxX: number; maxY: number };

export type FocusLayoutInput = {
  sebinId: string;
  unidadId: string;
  campIds: string[];
  otrasUnidadIds: string[];
  width: number;
  height: number;
};

export type FocusLayoutResult = {
  positions: Map<string, Pt>;
  focusCenter: Pt;
  focusBounds: Bounds;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Árbol vertical ordenado.
 * Muchos camps → grilla de filas (no un fan que se va del frame).
 */
export function layoutFocoUnidad(input: FocusLayoutInput): FocusLayoutResult {
  const { sebinId, unidadId, campIds, otrasUnidadIds, width, height } = input;
  const cx = width / 2;
  const margin = 56;
  const positions = new Map<string, Pt>();

  // fracciones como FounderOS DEPTH_FRAC (base → canopy)
  const sebinY = height * 0.9;
  const unidadY = height * 0.72;
  const canopyTop = height * 0.1;
  const canopyBot = height * 0.52;

  positions.set(sebinId, { x: cx, y: sebinY });
  positions.set(unidadId, { x: cx, y: unidadY });

  const n = campIds.length;
  if (n > 0) {
    // columnas: ~sqrt, capadas al ancho útil
    const usableW = width - margin * 2;
    const colPitch = 52;
    const maxCols = Math.max(1, Math.floor(usableW / colPitch));
    const cols = Math.min(n, Math.max(1, Math.min(maxCols, Math.ceil(Math.sqrt(n * 1.8)))));
    const rows = Math.ceil(n / cols);
    const rowPitch = Math.min(56, (canopyBot - canopyTop) / Math.max(1, rows));

    campIds.forEach((id, i) => {
      const row = Math.floor(i / cols);
      const col = i % cols;
      const inRow = Math.min(cols, n - row * cols);
      const rowWidth = (inRow - 1) * colPitch;
      const x0 = cx - rowWidth / 2;
      const x = inRow <= 1 ? cx : x0 + col * colPitch;
      // filas de arriba (canopy) hacia abajo hacia la unidad
      const y = canopyTop + row * rowPitch + rowPitch * 0.35;
      positions.set(id, {
        x: round2(Math.max(margin, Math.min(width - margin, x))),
        y: round2(y),
      });
    });
  }

  // flancos: otras unidades a los costados del tronco, fuera del canopy
  const m = otrasUnidadIds.length;
  if (m > 0) {
    const left: string[] = [];
    const right: string[] = [];
    otrasUnidadIds.forEach((id, i) => {
      (i % 2 === 0 ? left : right).push(id);
    });
    const placeSide = (ids: string[], side: -1 | 1) => {
      ids.forEach((id, i) => {
        const x = side < 0 ? margin + 28 : width - margin - 28;
        const y = height * 0.78 + i * 34;
        positions.set(id, { x: round2(x), y: round2(Math.min(height - 40, y)) });
      });
    };
    placeSide(left, -1);
    placeSide(right, 1);
  }

  // bounds del árbol enfocado (SEBIN + unidad + camps — sin flancos)
  let minX = cx;
  let maxX = cx;
  let minY = unidadY;
  let maxY = sebinY;
  for (const id of [sebinId, unidadId, ...campIds]) {
    const p = positions.get(id);
    if (!p) continue;
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  // padding de nodos
  minX -= 24;
  maxX += 24;
  minY -= 28;
  maxY += 28;

  const focusBounds: Bounds = { minX, minY, maxX, maxY };
  const focusCenter = {
    x: round2((minX + maxX) / 2),
    y: round2((minY + maxY) / 2),
  };

  return { positions, focusCenter, focusBounds };
}

export function deltaGiroApex(unidadAngle: number): number {
  const apex = -Math.PI / 2;
  let d = apex - unidadAngle;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
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
