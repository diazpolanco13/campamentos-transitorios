/**
 * Grafo operativo SEBIN → unidades de supervisión → campamentos.
 * Modelo puro (sin React/DOM). Severidad del día sube por anillos.
 */

import {
  metaUnidadSebinDe,
  unidadSebinDe,
  type CentroTransitorio,
} from "./centrosTransitorios";
import type { EstadoReporteDia } from "./reporteDiario";
import { META_ESTADO_REPORTE } from "./reporteDiario";

export type SebinBrainKind = "sebin" | "unidad" | "campamento";

/** Orden de severidad: mayor = más grave. */
export type SeveridadBrain = "ok" | "pendiente" | "parcial" | "critica";

const RANK: Record<SeveridadBrain, number> = {
  ok: 0,
  pendiente: 1,
  parcial: 2,
  critica: 3,
};

export const META_SEVERIDAD_BRAIN: Record<
  SeveridadBrain,
  { label: string; color: string }
> = {
  ok: { label: "Al día", color: "#22c55e" },
  pendiente: { label: "Sin reporte", color: "#64748b" },
  parcial: { label: "Reporte incompleto", color: "#f59e0b" },
  critica: { label: "Alerta crítica", color: "#ef4444" },
};

export type SebinBrainNode = {
  id: string;
  kind: SebinBrainKind;
  label: string;
  sublabel?: string;
  ring: 0 | 1 | 2;
  color: string;
  severidad: SeveridadBrain;
  /** Campamentos bajo este nodo (unidad/SEBIN). */
  camps: number;
  /** Con alerta crítica hoy. */
  criticos: number;
  /** Reporte completo hoy. */
  reportesOk: number;
  /** Fases 0–6 del reporte (solo campamentos). */
  fasesOk?: number;
  /** Estado reporte crudo (solo campamentos). */
  estadoReporte?: EstadoReporteDia;
  unidadClave?: string;
  centroId?: string;
  /** Layout polar unitario (−1…1) antes de escalar al canvas. */
  angle: number;
  radius: number;
};

export type SebinBrainEdge = {
  source: string;
  target: string;
  kind: "supervisa" | "opera";
};

export type SebinBrainGraph = {
  nodes: SebinBrainNode[];
  edges: SebinBrainEdge[];
  dia: string;
  resumen: {
    camps: number;
    unidades: number;
    criticos: number;
    reportesOk: number;
    reportesPendientes: number;
  };
};

export type PulseCentroBrain = {
  critica: boolean;
  estadoReporte: EstadoReporteDia;
  fasesOk: number;
};

/** Peor severidad entre varias. */
export function peorSeveridad(...xs: SeveridadBrain[]): SeveridadBrain {
  let worst: SeveridadBrain = "ok";
  for (const x of xs) {
    if (RANK[x] > RANK[worst]) worst = x;
  }
  return worst;
}

/** Severidad de un campamento a partir de reporte + alerta crítica. */
export function severidadCampamento(pulse: PulseCentroBrain): SeveridadBrain {
  if (pulse.critica) return "critica";
  if (pulse.estadoReporte === "completo") return "ok";
  if (pulse.estadoReporte === "pendiente") return "pendiente";
  return "parcial";
}

/** Estado reporte aproximado desde conteo de fases (0–6). */
export function estadoDesdeFases(fasesOk: number, total = 6): EstadoReporteDia {
  if (fasesOk >= total) return "completo";
  if (fasesOk > 1) return "parcial";
  if (fasesOk === 1) return "solo_parte";
  return "pendiente";
}

const SELF_ID = "sebin";
const RING_U = 0.42;
const RING_C = 0.82;

/**
 * Arma el grafo radial. Solo unidades con ≥1 campamento visible.
 * Ángulos determinísticos por orden de catálogo.
 */
export function buildSebinBrainGraph(
  centros: CentroTransitorio[],
  opts: {
    dia: string;
    pulses: Map<string, PulseCentroBrain>;
  },
): SebinBrainGraph {
  const { dia, pulses } = opts;

  const porUnidad = new Map<string, CentroTransitorio[]>();
  for (const c of centros) {
    const clave = unidadSebinDe(c);
    const list = porUnidad.get(clave) ?? [];
    list.push(c);
    porUnidad.set(clave, list);
  }

  const claves = [...porUnidad.keys()].sort((a, b) => {
    const ma = metaUnidadSebinDe(a);
    const mb = metaUnidadSebinDe(b);
    return (ma.orden ?? 999) - (mb.orden ?? 999) || ma.label.localeCompare(mb.label, "es");
  });

  const nU = Math.max(1, claves.length);
  const nodes: SebinBrainNode[] = [];
  const edges: SebinBrainEdge[] = [];

  let totalCriticos = 0;
  let totalOk = 0;
  let totalPend = 0;
  const sevUnidades: SeveridadBrain[] = [];

  claves.forEach((clave, ui) => {
    const camps = porUnidad.get(clave)!;
    const meta = metaUnidadSebinDe(clave);
    const angleU = -Math.PI / 2 + (ui / nU) * Math.PI * 2;
    const unidadId = `unidad:${clave}`;

    const sevCamps: SeveridadBrain[] = [];
    let critU = 0;
    let okU = 0;

    const span = (Math.PI * 2) / nU;
    const start = angleU - span * 0.38;
    const end = angleU + span * 0.38;

    camps
      .slice()
      .sort(
        (a, b) =>
          (a.nro ?? 0) - (b.nro ?? 0) || a.nombre.localeCompare(b.nombre, "es"),
      )
      .forEach((c, ci) => {
        const pulse = pulses.get(c.id) ?? {
          critica: false,
          estadoReporte: "pendiente" as const,
          fasesOk: 0,
        };
        const sev = severidadCampamento(pulse);
        sevCamps.push(sev);
        if (pulse.critica) {
          critU += 1;
          totalCriticos += 1;
        }
        if (pulse.estadoReporte === "completo") {
          okU += 1;
          totalOk += 1;
        }
        if (pulse.estadoReporte === "pendiente") totalPend += 1;

        const t = camps.length === 1 ? 0.5 : ci / (camps.length - 1);
        const angleC = start + t * (end - start);

        nodes.push({
          id: `camp:${c.id}`,
          kind: "campamento",
          label: c.nombre,
          sublabel: c.nro != null ? `N.° ${c.nro}` : undefined,
          ring: 2,
          color: META_SEVERIDAD_BRAIN[sev].color,
          severidad: sev,
          camps: 1,
          criticos: pulse.critica ? 1 : 0,
          reportesOk: pulse.estadoReporte === "completo" ? 1 : 0,
          fasesOk: pulse.fasesOk,
          estadoReporte: pulse.estadoReporte,
          unidadClave: clave,
          centroId: c.id,
          angle: angleC,
          radius: RING_C,
        });
        edges.push({ source: unidadId, target: `camp:${c.id}`, kind: "opera" });
      });

    const sevU = peorSeveridad(...sevCamps);
    sevUnidades.push(sevU);

    nodes.push({
      id: unidadId,
      kind: "unidad",
      label: meta.label,
      sublabel: `${camps.length} camp.`,
      ring: 1,
      color: meta.color || META_SEVERIDAD_BRAIN[sevU].color,
      severidad: sevU,
      camps: camps.length,
      criticos: critU,
      reportesOk: okU,
      unidadClave: clave,
      angle: angleU,
      radius: RING_U,
    });
    edges.push({ source: SELF_ID, target: unidadId, kind: "supervisa" });
  });

  const sevCore = peorSeveridad(...sevUnidades);
  nodes.unshift({
    id: SELF_ID,
    kind: "sebin",
    label: "SEBIN",
    sublabel: "Núcleo operativo",
    ring: 0,
    color: META_SEVERIDAD_BRAIN[sevCore].color,
    severidad: sevCore,
    camps: centros.length,
    criticos: totalCriticos,
    reportesOk: totalOk,
    angle: 0,
    radius: 0,
  });

  return {
    nodes,
    edges,
    dia,
    resumen: {
      camps: centros.length,
      unidades: claves.length,
      criticos: totalCriticos,
      reportesOk: totalOk,
      reportesPendientes: totalPend,
    },
  };
}

/** Posición en canvas a partir de coords polares unitarias. */
export function posNodoBrain(
  n: Pick<SebinBrainNode, "angle" | "radius">,
  cx: number,
  cy: number,
  scale: number,
): { x: number; y: number } {
  return {
    x: cx + Math.cos(n.angle) * n.radius * scale,
    y: cy + Math.sin(n.angle) * n.radius * scale,
  };
}

export function colorEstadoReporte(estado: EstadoReporteDia | undefined): string {
  if (!estado) return META_SEVERIDAD_BRAIN.pendiente.color;
  return META_ESTADO_REPORTE[estado].color;
}

export { SELF_ID as SEBIN_BRAIN_CORE_ID };
