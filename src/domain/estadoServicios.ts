// Estado del sistema (/estado): tipos y lógica pura de los incidentes de
// servicios (tabla `incidentes_servicios`, escrita solo por la Edge Function
// `registrar-incidente` desde el vigilante del VPS).
//
// La distinción `tipo` es el corazón de la vista: separa lo que es de la
// plataforma (app, BD, bots) de los servicios EXTERNOS de la institución
// (Nexus/SAIME) — cuando el externo cae, el histórico demuestra que la
// plataforma siguió operativa.

export interface IncidenteServicio {
  id: string;
  servicio: string;
  tipo: "externo" | "plataforma";
  estado: "abierto" | "resuelto";
  causa: string | null;
  detalle: Record<string, unknown>;
  inicio_ts: number;
  fin_ts: number | null;
  updated_at: number;
}

/** Lo único que expone la RPC pública `estado_servicios_publico` (sin PII). */
export interface IncidenteAbiertoPublico {
  servicio: string;
  tipo: "externo" | "plataforma";
  causa: string | null;
  inicio_ts: number;
}

export interface InfoServicio {
  id: string;
  nombre: string;
  descripcion: string;
  tipo: "externo" | "plataforma";
}

export const CATALOGO_SERVICIOS: InfoServicio[] = [
  {
    id: "pwa",
    nombre: "Aplicación (PWA)",
    descripcion:
      "Interfaz de campamentos, registro y reportes. El vigilante pega el HTTPS público (lo que ve el usuario), no el contenedor interno.",
    tipo: "plataforma",
  },
  {
    id: "supabase",
    nombre: "Base de datos y tiempo real",
    descripcion:
      "Postgres, autenticación y sincronización en vivo (Supabase). Caída aquí tumba login, censo y reportes.",
    tipo: "plataforma",
  },
  {
    id: "cap",
    nombre: "CAPTCHA de acceso (Cap)",
    descripcion:
      "Reto anti-bot del login. Instancia propia en el VPS. Si cae, nadie entra.",
    tipo: "plataforma",
  },
  {
    id: "gateway",
    nombre: "Gateway Nexus / fotos",
    descripcion:
      "Proxy propio (VPN + MinIO de fotos SAIME). Distinto del API institucional: esto es nuestro contenedor.",
    tipo: "plataforma",
  },
  {
    id: "nexus",
    nombre: "API institucional NEXUS/SAIME",
    descripcion:
      "Registro de identidad por cédula. Servicio de la institución, externo a la plataforma.",
    tipo: "externo",
  },
];

export const SERVICIOS_PLATAFORMA: readonly string[] = CATALOGO_SERVICIOS.filter(
  (s) => s.tipo === "plataforma",
).map((s) => s.id);

export function infoServicio(id: string): InfoServicio {
  return (
    CATALOGO_SERVICIOS.find((s) => s.id === id) ?? {
      id,
      nombre: id,
      descripcion: "Servicio monitoreado",
      tipo: "externo",
    }
  );
}

/** Duración del incidente en ms (los abiertos corren hasta `ahora`). */
export function duracionIncidenteMs(
  inc: Pick<IncidenteServicio, "inicio_ts" | "fin_ts">,
  ahora: number,
): number {
  return Math.max(0, (inc.fin_ts ?? ahora) - inc.inicio_ts);
}

/** "38 min" · "3 h 25 min" · "2 d 4 h". Mínimo 1 min. */
export function formatoDuracion(ms: number): string {
  const min = Math.max(1, Math.round(ms / 60000));
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const restoMin = min % 60;
  if (h < 24) return restoMin > 0 ? `${h} h ${restoMin} min` : `${h} h`;
  const d = Math.floor(h / 24);
  const restoH = h % 24;
  return restoH > 0 ? `${d} d ${restoH} h` : `${d} d`;
}

export function formatoFechaHora(ts: number): string {
  return new Date(ts).toLocaleString("es-VE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatoHora(ts: number): string {
  return new Date(ts).toLocaleTimeString("es-VE", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export interface ResumenVentanaServicio {
  incidentes: number;
  caidoMs: number;
  /** % de tiempo operativo dentro de la ventana (2 decimales). */
  uptimePct: number;
}

/**
 * Resumen de un servicio en los últimos `dias`: cuántos incidentes tocaron la
 * ventana y cuánto tiempo estuvo caído (solapamiento con la ventana; los
 * abiertos cuentan hasta `ahora`).
 */
export function resumenVentanaServicio(
  incidentes: IncidenteServicio[],
  servicio: string,
  dias: number,
  ahora: number,
): ResumenVentanaServicio {
  const ventanaMs = dias * 86_400_000;
  const desde = ahora - ventanaMs;
  let caidoMs = 0;
  let conteo = 0;
  for (const inc of incidentes) {
    if (inc.servicio !== servicio) continue;
    const fin = inc.fin_ts ?? ahora;
    if (fin <= desde) continue;
    conteo += 1;
    caidoMs += Math.max(0, Math.min(fin, ahora) - Math.max(inc.inicio_ts, desde));
  }
  const uptimePct = Math.max(0, 100 * (1 - caidoMs / ventanaMs));
  return {
    incidentes: conteo,
    caidoMs,
    uptimePct: Math.round(uptimePct * 100) / 100,
  };
}

export type EstadoSegmento = "ok" | "parcial" | "caido";

export interface SegmentoContinuidad {
  desde: number;
  hasta: number;
  estado: EstadoSegmento;
  /** ms caídos dentro del segmento (para el tooltip). */
  caidoMs: number;
}

/**
 * Barra de continuidad estilo status page: divide la ventana (p. ej. 24 h) en
 * `segmentos` tramos y marca cada uno según el solapamiento con incidentes
 * del servicio: sin solape = ok, solape parcial = parcial, tramo cubierto
 * (>95%) = caido. Los incidentes abiertos cuentan hasta `ahora`.
 */
export function segmentosContinuidad(
  incidentes: IncidenteServicio[],
  servicio: string,
  horas: number,
  segmentos: number,
  ahora: number,
): SegmentoContinuidad[] {
  const ventanaMs = horas * 3_600_000;
  const segMs = ventanaMs / segmentos;
  const inicioVentana = ahora - ventanaMs;
  const delServicio = incidentes.filter((i) => i.servicio === servicio);
  const resultado: SegmentoContinuidad[] = [];
  for (let n = 0; n < segmentos; n++) {
    const desde = inicioVentana + n * segMs;
    const hasta = desde + segMs;
    let caidoMs = 0;
    for (const inc of delServicio) {
      const fin = inc.fin_ts ?? ahora;
      caidoMs += Math.max(0, Math.min(fin, hasta) - Math.max(inc.inicio_ts, desde));
    }
    const estado: EstadoSegmento =
      caidoMs <= 0 ? "ok" : caidoMs >= segMs * 0.95 ? "caido" : "parcial";
    resultado.push({ desde, hasta, estado, caidoMs });
  }
  return resultado;
}

/**
 * Parte del incidente en formato Telegram (negritas `**…**`, pie `REF:`
 * parseable, mismo estilo que reporteTelegramCentro): el descargo con datos
 * para reenviar al grupo de enlaces.
 */
export function parteTelegramIncidente(
  inc: IncidenteServicio,
  ahora: number,
): string {
  const info = infoServicio(inc.servicio);
  const enCurso = inc.estado === "abierto";
  const dur = formatoDuracion(duracionIncidenteMs(inc, ahora));
  const lineas = [
    `**⚠️ Falla de ${info.nombre}**`,
    "",
    `Inicio: ${formatoFechaHora(inc.inicio_ts)}`,
    enCurso
      ? `Estado: EN CURSO (${dur} hasta ahora)`
      : `Fin: ${formatoFechaHora(inc.fin_ts ?? ahora)} · Duración: ${dur}`,
  ];
  if (inc.causa) lineas.push(`Causa: ${inc.causa}`);
  lineas.push(
    "",
    inc.tipo === "externo"
      ? "La plataforma de campamentos operó con normalidad; la falla corresponde al servicio externo de la institución."
      : "Incidente de la plataforma; el equipo técnico fue notificado.",
    "",
    `REF: estado-${inc.servicio} | ${new Date(inc.inicio_ts).toISOString().slice(0, 10)}`,
  );
  return lineas.join("\n");
}
