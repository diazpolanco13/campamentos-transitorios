// Alertas críticas de un campamento: novedad negativa del día, denuncia
// abierta y caso de salud pendiente. Una sola clasificación reutilizable
// por mapa (base roja + tooltip), popup y tarjetas de seguimiento.

import type { CasoSaludCentro } from "./casosSalud";
import type { Denuncia } from "./denuncias";
import type { EventoReporte } from "./eventosReportes";
import { casosSaludPendientes } from "./seguimientoReportes";

export interface AlertasCriticasCentro {
  novedadesNegativas: EventoReporte[];
  denuncias: Denuncia[];
  casosSalud: CasoSaludCentro[];
}

export interface FlagsAlertaCritica {
  novedadNegativa: boolean;
  denuncia: boolean;
  salud: boolean;
}

/** Ordena por timestamp descendente (más reciente primero). */
function porTsDesc<T extends { ts?: number; creada_ts?: number }>(a: T, b: T): number {
  const ta = a.ts ?? a.creada_ts ?? 0;
  const tb = b.ts ?? b.creada_ts ?? 0;
  return tb - ta;
}

/**
 * Clasifica alertas críticas de un centro.
 *
 * - Novedades: solo `tipo === "negativo"` del `dia` indicado.
 * - Denuncias: abiertas no borradas (el caller suele filtrar ya por estado).
 * - Salud: activo o en_proceso (`casosSaludPendientes`).
 */
export function alertasCriticasDeCentro(
  centroId: string,
  opts: {
    dia: string;
    eventos: EventoReporte[];
    denuncias: Denuncia[];
    casosSalud: CasoSaludCentro[];
  },
): AlertasCriticasCentro {
  const novedadesNegativas = opts.eventos
    .filter(
      (e) =>
        e.centro_id === centroId && e.dia === opts.dia && e.tipo === "negativo",
    )
    .sort(porTsDesc);
  const denuncias = opts.denuncias
    .filter(
      (d) =>
        d.centro_id === centroId &&
        d.estado === "abierta" &&
        !d.deleted,
    )
    .sort(porTsDesc);
  const casosSalud = casosSaludPendientes(
    opts.casosSalud.filter((c) => c.centro_id === centroId),
  ).sort((a, b) => (b.creada_ts || 0) - (a.creada_ts || 0));

  return { novedadesNegativas, denuncias, casosSalud };
}

export function flagsAlertaCritica(a: AlertasCriticasCentro): FlagsAlertaCritica {
  return {
    novedadNegativa: a.novedadesNegativas.length > 0,
    denuncia: a.denuncias.length > 0,
    salud: a.casosSalud.length > 0,
  };
}

export function tieneAlertaCritica(a: AlertasCriticasCentro): boolean {
  const f = flagsAlertaCritica(a);
  return f.novedadNegativa || f.denuncia || f.salud;
}

/**
 * Etiquetas cortas de tipos presentes (para tooltip del marcador).
 * Vacío si no hay alerta.
 */
export function etiquetasAlertaCritica(a: AlertasCriticasCentro): string[] {
  const f = flagsAlertaCritica(a);
  const out: string[] = [];
  if (f.novedadNegativa) {
    const n = a.novedadesNegativas.length;
    out.push(n === 1 ? "Novedad negativa" : `${n} novedades negativas`);
  }
  if (f.denuncia) {
    const n = a.denuncias.length;
    out.push(n === 1 ? "Denuncia abierta" : `${n} denuncias abiertas`);
  }
  if (f.salud) {
    const n = a.casosSalud.length;
    out.push(n === 1 ? "Caso de salud" : `${n} casos de salud`);
  }
  return out;
}

/**
 * IDs de centros con al menos una alerta crítica.
 * Entradas ya deben estar acotadas (eventos del día, denuncias abiertas, salud activa).
 */
export function idsCentrosConAlertaCritica(opts: {
  dia: string;
  eventosHoy: EventoReporte[];
  denunciasAbiertas: Denuncia[];
  casosSaludActivos: CasoSaludCentro[];
}): Set<string> {
  const s = new Set<string>();
  for (const e of opts.eventosHoy) {
    if (e.tipo === "negativo" && e.dia === opts.dia) s.add(e.centro_id);
  }
  for (const d of opts.denunciasAbiertas) {
    if (d.estado === "abierta" && !d.deleted) s.add(d.centro_id);
  }
  for (const c of casosSaludPendientes(opts.casosSaludActivos)) {
    s.add(c.centro_id);
  }
  return s;
}

/** Mapa centro_id → etiquetas de alerta (solo centros con ≥1). */
export function mapaEtiquetasAlertaCritica(opts: {
  dia: string;
  eventosHoy: EventoReporte[];
  denunciasAbiertas: Denuncia[];
  casosSaludActivos: CasoSaludCentro[];
  centroIds: Iterable<string>;
}): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const id of opts.centroIds) {
    const a = alertasCriticasDeCentro(id, {
      dia: opts.dia,
      eventos: opts.eventosHoy,
      denuncias: opts.denunciasAbiertas,
      casosSalud: opts.casosSaludActivos,
    });
    const etiq = etiquetasAlertaCritica(a);
    if (etiq.length > 0) out.set(id, etiq);
  }
  return out;
}
