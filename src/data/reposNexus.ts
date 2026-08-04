// Cliente del gateway Nexus (VPN en Dokploy) con caché en Supabase.
// El navegador llama a https://nexus.… con el JWT de la sesión Supabase.
// La API key de Nexus nunca sale del contenedor.
// Cada consulta exitosa se guarda en `nexus_consultas`: la próxima búsqueda de
// esa cédula sale de nuestra base (más rápido y funciona con la VPN caída).

import { supabase } from "./supabaseClient";
import { usuarioActual } from "./reposSupabase";
import {
  normalizarPersonaNexus,
  type PersonaNexusCenso,
} from "@/domain/nexusPersona";

const GATEWAY_URL = (
  import.meta.env.VITE_NEXUS_GATEWAY_URL as string | undefined
)?.replace(/\/$/, "") || "https://nexus.m0n1t0r-d3-3v3nt0s.net";

export function urlGatewayNexus(): string {
  return GATEWAY_URL;
}

/** Estado del API institucional Nexus (vía gateway). */
export type EstadoNexusApi = "online" | "offline" | "degraded";

export interface InformeEstadoNexus {
  estado: EstadoNexusApi | "unknown";
  gatewayOk: boolean;
  upstreamStatus: number | null;
  checkedAt: number | null;
  cached: boolean;
  detail: string | null;
}

/**
 * Consulta el estado del API Nexus (cacheado ~45s en el gateway).
 * Público: no requiere sesión. `force` pide re-sondeo inmediato.
 */
export async function consultarEstadoNexusApi(
  opts?: { force?: boolean; signal?: AbortSignal },
): Promise<InformeEstadoNexus> {
  const q = opts?.force ? "?force=1" : "";
  try {
    const resp = await fetch(`${GATEWAY_URL}/health/nexus${q}`, {
      method: "GET",
      signal: opts?.signal,
    });
    const json = (await resp.json()) as {
      ok?: boolean;
      gateway?: boolean;
      nexus?: string;
      upstream_status?: number | null;
      checked_at?: number;
      cached?: boolean;
      detail?: string | null;
    };
    const raw = json.nexus;
    const estado: InformeEstadoNexus["estado"] =
      raw === "online" || raw === "offline" || raw === "degraded" ? raw : "unknown";
    return {
      estado,
      gatewayOk: json.gateway === true || json.ok === true,
      upstreamStatus:
        typeof json.upstream_status === "number" ? json.upstream_status : null,
      checkedAt: typeof json.checked_at === "number" ? json.checked_at : null,
      cached: Boolean(json.cached),
      detail: typeof json.detail === "string" ? json.detail : null,
    };
  } catch {
    return {
      estado: "unknown",
      gatewayOk: false,
      upstreamStatus: null,
      checkedAt: null,
      cached: false,
      detail: "Sin respuesta del gateway",
    };
  }
}

/** Error de infraestructura: el API Nexus / gateway no respondió bien. */
export class NexusNoDisponibleError extends Error {
  readonly code = "nexus_unavailable" as const;
  constructor(message?: string) {
    super(
      message ||
        "Nexus no está disponible ahora (servidor caído o saturado). Pruebe una cédula ya consultada o use la planilla manual.",
    );
    this.name = "NexusNoDisponibleError";
  }
}

export function esNexusNoDisponible(err: unknown): err is NexusNoDisponibleError {
  return (
    err instanceof NexusNoDisponibleError ||
    (err instanceof Error &&
      (err.name === "NexusNoDisponibleError" ||
        /Nexus no está disponible|NEXUS\/SAIME|Respuesta inválida del gateway \(50[234]\)|bad_gateway/i.test(
          err.message,
        )))
  );
}

/**
 * ¿La búsqueda por cédula está degradada aunque el health "responda"?
 * Modo de falla visto el 17-jul-2026: /v1/health del API institucional da 200
 * pero la búsqueda devuelve vacío para casi toda cédula. El gateway lo
 * detecta observando el tráfico real (campo `busqueda` de /health/nexus) y
 * degrada `nexus` a "degraded". Un 404 con Nexus degradado NO significa que
 * la cédula no exista.
 */
async function busquedaNexusDegradada(): Promise<boolean> {
  const informe = await consultarEstadoNexusApi().catch(() => null);
  return informe?.estado === "degraded" || informe?.estado === "offline";
}

/**
 * Botón "Reportar falla": manda el aviso por Telegram al vigilante de la red
 * (endpoint del gateway; throttle de 60s del lado del servidor).
 */
export async function reportarFallaNexus(contexto: {
  cedula?: string;
  centro?: string;
}): Promise<void> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Sin sesión para reportar.");
  const resp = await fetch(`${GATEWAY_URL}/v1/reportar-falla`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({
      usuario: usuarioActual(),
      centro: contexto.centro ?? "?",
      cedula: contexto.cedula ?? "?",
    }),
  });
  if (!resp.ok) throw new Error(`No se pudo enviar el reporte (${resp.status})`);
}

/**
 * Baja la foto SAIME desde el gateway (`GET /foto/<foto_nombre>` → MinIO).
 * Devuelve un blob: URL (revoke con URL.revokeObjectURL al limpiar).
 * Requiere sesión: el <img> no puede mandar Authorization.
 */
export async function cargarFotoSaime(
  fotoNombre: string,
  opts?: { signal?: AbortSignal },
): Promise<string | null> {
  const nombre = (fotoNombre || "").trim();
  if (!nombre || /[\\/]/.test(nombre) || nombre.includes("..")) return null;

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) return null;

  let resp: Response;
  try {
    resp = await fetch(`${GATEWAY_URL}/foto/${encodeURIComponent(nombre)}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${session.access_token}` },
      signal: opts?.signal,
    });
  } catch {
    return null;
  }
  if (!resp.ok) return null;
  const blob = await resp.blob();
  if (!blob.type.startsWith("image/") && blob.size < 100) return null;
  return URL.createObjectURL(blob);
}

/** Busca una persona por cédula (modo slim para censo). Requiere sesión. */
export async function buscarPersonaNexus(
  letra: "V" | "E" | "J",
  cedula: string,
): Promise<PersonaNexusCenso> {
  const digits = cedula.replace(/\D/g, "");
  if (digits.length < 5 || digits.length > 12) {
    throw new Error("Cédula inválida");
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error("Inicie sesión o entre con el QR del campamento para consultar cédulas.");
  }

  const url = `${GATEWAY_URL}/v1/person/search/external/full/${letra}/${digits}/censo`;
  let resp: Response;
  try {
    resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: "{}",
    });
  } catch {
    throw new NexusNoDisponibleError(
      "No se pudo contactar el gateway de Nexus. Revise la conexión o use la planilla manual.",
    );
  }

  const texto = await resp.text();
  let json: PersonaNexusCenso | { error?: string; message?: string };
  try {
    json = JSON.parse(texto) as PersonaNexusCenso;
  } catch {
    if (resp.status === 502 || resp.status === 503 || resp.status === 504) {
      throw new NexusNoDisponibleError();
    }
    throw new Error(`Respuesta inválida del gateway (${resp.status})`);
  }

  if (resp.status === 401) {
    throw new Error("Sesión no autorizada para consultar Nexus. Vuelva a entrar.");
  }
  if (resp.status === 404 || (json as PersonaNexusCenso).ok === false) {
    const err = (json as PersonaNexusCenso).error || "no_encontrado";
    if (err === "no_encontrado") {
      // Antes de decir "no existe": si Nexus está degradado, el vacío es
      // mentira (falla del 17-jul: health 200 pero búsqueda vacía).
      if (await busquedaNexusDegradada()) {
        throw new NexusNoDisponibleError(
          "Los servicios NEXUS/SAIME están caídos en este momento. La cédula NO se pudo verificar (no significa que no exista). Pause el censo por cédula e intente más tarde.",
        );
      }
      throw new Error("No se encontró esa cédula en el registro.");
    }
    throw new Error(`No se pudo obtener la ficha (${err})`);
  }
  if (resp.status === 502 || resp.status === 503 || resp.status === 504) {
    throw new NexusNoDisponibleError(
      (json as { message?: string }).message ||
        (json as { error?: string }).error ||
        undefined,
    );
  }
  if (!resp.ok) {
    const msg =
      (json as { error?: string; message?: string }).error ||
      (json as { message?: string }).message ||
      `Error HTTP ${resp.status}`;
    if (/bad_gateway|unavailable|timeout/i.test(msg)) {
      throw new NexusNoDisponibleError(msg);
    }
    throw new Error(msg);
  }

  return normalizarPersonaNexus(json as PersonaNexusCenso);
}

/** Ficha para el censo con procedencia: de la caché propia o del gateway. */
export interface FichaNexusCenso {
  persona: PersonaNexusCenso;
  desdeCache: boolean;
  /** Momento (ms) en que se consultó Nexus por última vez para esta cédula. */
  consultadaTs: number | null;
}

async function leerConsultaGuardada(
  letra: string,
  digits: string,
): Promise<{ persona: PersonaNexusCenso; ts: number } | null> {
  // Vía RPC `nexus_cache_cedula` (SECURITY DEFINER): la RLS de `nexus_consultas`
  // ya no deja leerla directo a terreno. El upsert de más abajo no necesita
  // SELECT, así que la caché se sigue poblando igual.
  const { data, error } = await supabase
    .rpc("nexus_cache_cedula", { p_letra: letra, p_cedula: digits })
    .maybeSingle<{ data: unknown; actualizado_ts: number }>();
  if (error || !data) return null;
  return {
    persona: normalizarPersonaNexus(data.data as PersonaNexusCenso),
    ts: Number(data.actualizado_ts),
  };
}

function guardarConsulta(letra: string, digits: string, persona: PersonaNexusCenso): void {
  // Fire-and-forget: la caché nunca debe romper el flujo de censo.
  void supabase
    .from("nexus_consultas")
    .upsert(
      {
        letra,
        cedula: digits,
        data: persona,
        actualizado_ts: Date.now(),
        actualizado_por: usuarioActual(),
      },
      { onConflict: "letra,cedula" },
    )
    .then(({ error }) => {
      if (error) console.warn("[reposNexus] cache:", error.message);
    });
}

/**
 * Busca la ficha primero en `nexus_consultas` (nuestra BD) y solo si no está
 * consulta el gateway; la respuesta nueva queda guardada para la próxima.
 * `forzarNexus` salta la caché (botón «Reconsultar»).
 */
export async function buscarPersonaNexusConCache(
  letra: "V" | "E" | "J",
  cedula: string,
  opts?: { forzarNexus?: boolean },
): Promise<FichaNexusCenso> {
  const digits = cedula.replace(/\D/g, "");
  if (digits.length < 5 || digits.length > 12) {
    throw new Error("Cédula inválida");
  }

  if (!opts?.forzarNexus) {
    const guardada = await leerConsultaGuardada(letra, digits).catch(() => null);
    if (guardada) {
      return { persona: guardada.persona, desdeCache: true, consultadaTs: guardada.ts };
    }
  }

  const persona = await buscarPersonaNexus(letra, digits);
  guardarConsulta(letra, digits, persona);
  return { persona, desdeCache: false, consultadaTs: Date.now() };
}
