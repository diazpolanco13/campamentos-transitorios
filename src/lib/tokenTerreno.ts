// Token de terreno: cutover §7 — el acceso por `?t=` personal quedó
// deshabilitado. Solo queda el token `publico` de denuncias y la limpieza
// de la clave legacy en localStorage.

const STORAGE_KEY = "refugio.token_terreno";

/**
 * Dominio público de la PWA. Los QR de denuncias apuntan siempre a
 * producción (nunca al dev server).
 */
export const URL_PORTAL_TERRENO = "https://m0n1t0r-d3-3v3nt0s.net";

/** Enlace público de denuncias de un campamento a partir de su token 'publico'. */
export function enlaceDenuncia(token: string): string {
  return `${URL_PORTAL_TERRENO}/denuncia?t=${encodeURIComponent(token)}`;
}

/**
 * @deprecated Cutover: el portal QR personal ya no existe.
 * Conservado por si algún deep-link viejo lo importa; siempre redirige a `/`.
 */
export function enlaceTerreno(_token: string): string {
  return `${URL_PORTAL_TERRENO}/`;
}

export type TareaTerreno =
  | "reporte"
  | "geo"
  | "autoridades"
  | "capacidad"
  | "censo";

/** @deprecated Cutover: portal QR retirado. */
export function tareaTerrenoDeUrl(_search = window.location.search): TareaTerreno | null {
  return null;
}

/** @deprecated Cutover: no hay portal QR; devolver inicio. */
export function urlPortalTerreno(_opts?: {
  token?: string;
  tarea?: TareaTerreno;
}): string {
  return "/";
}

/** @deprecated Cutover: navega al AppShell (login o home). */
export function irAlPortalTerreno(_opts?: {
  token?: string;
  tarea?: TareaTerreno;
}): void {
  olvidarTokenTerreno();
  window.location.assign("/");
}

/** @deprecated Cutover: siempre null; ya no se lee ni persiste `?t=` personal. */
export function tokenTerrenoActual(): string {
  return "";
}

/** Borra la clave legacy del token personal (p. ej. al aterrizar en / o /terreno). */
export function olvidarTokenTerreno(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Modo privado: nada que borrar.
  }
}

/** ¿Hay sesión Supabase persistida en este dispositivo? (sin importar supabase-js). */
export function haySesionSupabaseLocal(): boolean {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const clave = localStorage.key(i) ?? "";
      if (clave.startsWith("sb-") && clave.endsWith("-auth-token")) {
        const raw = localStorage.getItem(clave);
        if (raw && raw.includes("access_token")) return true;
      }
    }
  } catch {
    // Modo privado.
  }
  return false;
}
