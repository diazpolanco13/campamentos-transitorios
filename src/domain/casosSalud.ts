// Casos de salud opcionales vinculados al parte (tabla `casos_salud_centros`).

export type EstatusCasoSalud = "activo" | "en_proceso" | "resuelto" | "archivado";

export interface MetaEstatusCasoSalud {
  valor: EstatusCasoSalud;
  label: string;
  color: string;
  orden: number;
}

export const ESTATUS_CASO_SALUD: MetaEstatusCasoSalud[] = [
  { valor: "activo", label: "Activo", color: "#ef4444", orden: 0 },
  { valor: "en_proceso", label: "En proceso", color: "#f59e0b", orden: 1 },
  { valor: "resuelto", label: "Resuelto", color: "#22c55e", orden: 2 },
  { valor: "archivado", label: "Archivado", color: "#64748b", orden: 3 },
];

export const META_ESTATUS_CASO_SALUD: Record<EstatusCasoSalud, MetaEstatusCasoSalud> =
  Object.fromEntries(ESTATUS_CASO_SALUD.map((e) => [e.valor, e])) as Record<
    EstatusCasoSalud,
    MetaEstatusCasoSalud
  >;

export interface CasoSaludCentro {
  id: string;
  centro_id: string;
  /** Título corto del caso (p. ej. "Adulto mayor hipertenso"). */
  titulo: string;
  /** Detalle opcional del caso. */
  descripcion: string;
  estatus: EstatusCasoSalud;
  /** YYYY-MM-DD */
  reportado_dia: string;
  resuelta_ts: number | null;
  archivada_ts: number | null;
  creada_ts: number;
  updated_at: number;
  updated_by: string;
}

export function normalizarEstatusCasoSalud(raw: string | undefined | null): EstatusCasoSalud {
  if (raw === "activo" || raw === "en_proceso" || raw === "resuelto" || raw === "archivado") {
    return raw;
  }
  return "activo";
}

export function normalizarCasoSalud(
  raw: Partial<CasoSaludCentro> & { id: string; centro_id: string },
): CasoSaludCentro {
  return {
    id: raw.id,
    centro_id: raw.centro_id,
    // Casos previos a la columna `titulo`: la descripción hace de título.
    titulo: raw.titulo?.trim() ? raw.titulo : (raw.descripcion ?? ""),
    descripcion: raw.titulo?.trim() ? (raw.descripcion ?? "") : "",
    estatus: normalizarEstatusCasoSalud(raw.estatus),
    reportado_dia: raw.reportado_dia ?? "",
    resuelta_ts: raw.resuelta_ts != null ? Number(raw.resuelta_ts) : null,
    archivada_ts: raw.archivada_ts != null ? Number(raw.archivada_ts) : null,
    creada_ts: Number(raw.creada_ts) || 0,
    updated_at: Number(raw.updated_at) || 0,
    updated_by: raw.updated_by ?? "",
  };
}

export function casosSaludActivos(casos: CasoSaludCentro[]): CasoSaludCentro[] {
  return casos.filter((c) => c.estatus !== "archivado");
}

/** Casos activo o en_proceso que requieren seguimiento (cualquier día). */
export function casosAbiertosSeguimiento(casos: CasoSaludCentro[]): CasoSaludCentro[] {
  return casos.filter((c) => c.estatus === "activo" || c.estatus === "en_proceso");
}

/** Fichas creadas en un día (cualquier estatus). Fuente del conteo del parte. */
export function contarCasosSaludPorDia(
  casos: CasoSaludCentro[],
  centroId: string,
  dia: string,
): number {
  return casos.filter((c) => c.centro_id === centroId && c.reportado_dia === dia).length;
}

export function puedeArchivarCasoSalud(estatus: EstatusCasoSalud): boolean {
  return estatus === "resuelto";
}

/** Solo archivados se pueden devolver a seguimiento (como resuelto). */
export function puedeDesarchivarCasoSalud(estatus: EstatusCasoSalud): boolean {
  return estatus === "archivado";
}
