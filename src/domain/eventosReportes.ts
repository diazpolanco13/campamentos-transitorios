// Dominio de eventos del reporte diario por campamento (`eventos_reportes`).
//
// Cada fila representa un evento puntual del día. El cierre del bloque Eventos
// (incluso cuando no hubo eventos) se guarda en `reportes_centros.eventos_revisados`.

/** Tipo operativo del evento reportado. */
export type TipoEventoReporte = "neutro" | "positivo" | "negativo";

/** Valor por defecto al crear una novedad. */
export const TIPO_EVENTO_REPORTE_DEFAULT: TipoEventoReporte = "neutro";

export const CATALOGO_TIPOS_EVENTO_REPORTE: {
  valor: TipoEventoReporte;
  label: string;
  color: string;
}[] = [
  { valor: "neutro", label: "Neutra", color: "#71717a" },
  { valor: "positivo", label: "Positiva", color: "#22c55e" },
  { valor: "negativo", label: "Negativa", color: "#ef4444" },
];

export const META_TIPO_EVENTO_REPORTE: Record<
  TipoEventoReporte,
  (typeof CATALOGO_TIPOS_EVENTO_REPORTE)[number]
> = Object.fromEntries(CATALOGO_TIPOS_EVENTO_REPORTE.map((t) => [t.valor, t])) as Record<
  TipoEventoReporte,
  (typeof CATALOGO_TIPOS_EVENTO_REPORTE)[number]
>;

/** Participante vinculado a una ficha nominal o capturado manualmente. */
export interface ParticipanteEventoReporte {
  refugiado_id?: string | null;
  nombre_manual?: string;
  /** Snapshot de nombre/documento para que el evento siga legible si cambia la ficha. */
  nombre: string;
  cedula?: string;
  codigo_ficha?: string | null;
}

/** Evento puntual asociado al reporte diario de un centro. */
export interface EventoReporte {
  id: string;
  centro_id: string;
  /** YYYY-MM-DD */
  dia: string;
  /** Timestamp ms del evento. */
  ts: number;
  tipo: TipoEventoReporte;
  titulo: string;
  descripcion: string;
  participantes: ParticipanteEventoReporte[];
  creada_por: string;
  updated_at: number;
  updated_by: string;
}

export function normalizarTipoEventoReporte(
  raw: string | undefined | null,
): TipoEventoReporte {
  if (raw === "positivo" || raw === "negativo" || raw === "neutro") return raw;
  return TIPO_EVENTO_REPORTE_DEFAULT;
}

export function normalizarParticipantesEvento(raw: unknown): ParticipanteEventoReporte[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((p): p is Record<string, unknown> => Boolean(p && typeof p === "object"))
    .map((p) => {
      const nombreManual = typeof p.nombre_manual === "string" ? p.nombre_manual.trim() : "";
      const nombre = typeof p.nombre === "string" ? p.nombre.trim() : nombreManual;
      return {
        refugiado_id: typeof p.refugiado_id === "string" ? p.refugiado_id : null,
        nombre_manual: nombreManual,
        nombre,
        cedula: typeof p.cedula === "string" ? p.cedula : "",
        codigo_ficha: typeof p.codigo_ficha === "string" ? p.codigo_ficha : null,
      };
    })
    .filter((p) => p.nombre.length > 0);
}

export function normalizarEventoReporte(
  raw: Partial<EventoReporte> & { id: string; centro_id: string; dia: string },
): EventoReporte {
  return {
    id: raw.id,
    centro_id: raw.centro_id,
    dia: raw.dia,
    ts: Number(raw.ts) || 0,
    tipo: normalizarTipoEventoReporte(raw.tipo),
    titulo: raw.titulo?.trim() ?? "",
    descripcion: raw.descripcion?.trim() ?? "",
    participantes: normalizarParticipantesEvento(raw.participantes),
    creada_por: raw.creada_por ?? "",
    updated_at: Number(raw.updated_at) || 0,
    updated_by: raw.updated_by ?? "",
  };
}

export function eventosDelDia(
  eventos: EventoReporte[],
  centroId: string,
  dia: string,
): EventoReporte[] {
  return eventos
    .filter((e) => e.centro_id === centroId && e.dia === dia)
    .sort((a, b) => a.ts - b.ts || a.titulo.localeCompare(b.titulo, "es"));
}

/**
 * Novedades de días anteriores a `diaActual` (historial / archivados del reporte).
 * El día en curso permanece en la vista activa para el parte y Telegram.
 */
export function eventosArchivados(
  eventos: EventoReporte[],
  centroId: string,
  diaActual: string,
): EventoReporte[] {
  return eventos
    .filter((e) => e.centro_id === centroId && e.dia < diaActual)
    .sort(
      (a, b) =>
        b.dia.localeCompare(a.dia) ||
        b.ts - a.ts ||
        a.titulo.localeCompare(b.titulo, "es"),
    );
}

/** Mínimo de palabras en el título (evita títulos como «Pelea»). */
export const MIN_PALABRAS_TITULO_EVENTO = 6;

export function contarPalabrasTituloEvento(titulo: string): number {
  return titulo
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

export function tituloEventoValido(titulo: string): boolean {
  return contarPalabrasTituloEvento(titulo) >= MIN_PALABRAS_TITULO_EVENTO;
}

export function contarParticipantesEvento(evento: EventoReporte): number {
  return evento.participantes.length;
}

export function textoParticipantesEvento(evento: EventoReporte): string {
  const total = contarParticipantesEvento(evento);
  if (total === 0) return "Sin participantes vinculados";
  if (total === 1) return "1 participante";
  return `${total} participantes`;
}
