// Punto de entrada único: elige el bootstrap según la ruta ANTES de descargar
// el bundle pesado de la app completa (mapa, login, dashboard…).
// Cutover §7: /terreno ya no es portal QR; redirige a login.

import { aplicarTemaTerreno, temaTerrenoGuardado } from "./lib/temaTerreno";
import {
  olvidarTokenTerreno,
  haySesionSupabaseLocal,
} from "./lib/tokenTerreno";

// Tema claro/oscuro guardado (toggle en /terreno). Se aplica aquí, antes de
// descargar cualquier bundle, para que TODAS las vistas (reporte, censo,
// denuncia, app completa) respeten la elección del dispositivo sin parpadeo.
aplicarTemaTerreno(temaTerrenoGuardado());

function rutaEs(base: string): boolean {
  return window.location.pathname === base || window.location.pathname.startsWith(`${base}/`);
}

/** Quita `?t=` de la URL sin recargar (no toca otros params). */
function quitarParamTDeUrl(): void {
  const url = new URL(window.location.href);
  if (!url.searchParams.has("t")) return;
  url.searchParams.delete("t");
  window.history.replaceState({}, "", url.toString());
}

if (rutaEs("/terreno")) {
  // Cutover: cualquier /terreno(?t=…) → limpiar token, cerrar sesión legacy, login.
  olvidarTokenTerreno();
  void import("./data/supabaseClient")
    .then(({ supabase }) => supabase.auth.signOut({ scope: "local" }))
    .catch(() => undefined)
    .finally(() => {
      window.location.replace("/");
    });
} else if (rutaEs("/censo")) {
  // Legacy: planilla pública renombrada a /registro (sin token personal).
  olvidarTokenTerreno();
  const url = new URL(window.location.href);
  url.pathname = url.pathname.replace(/^\/censo/, "/registro");
  url.searchParams.delete("t");
  window.location.replace(url.pathname + url.search + url.hash);
} else if (rutaEs("/registro")) {
  olvidarTokenTerreno();
  quitarParamTDeUrl();
  if (!haySesionSupabaseLocal()) {
    window.location.replace("/");
  } else {
    void import("./censo-entry").then((m) => m.mount());
  }
} else if (rutaEs("/denuncia")) {
  // Denuncias: token publico; no tocar refugio.token_terreno.
  void import("./censo-entry").then((m) => m.mount());
} else {
  // Arranca el chunk del mapa en paralelo al bootstrap (Vite/dev lo transforma
  // mientras montamos React + auth). No espera el resultado aquí.
  olvidarTokenTerreno();
  const path = window.location.pathname;
  if (
    path === "/" ||
    path === "/centros" ||
    path.startsWith("/centros/")
  ) {
    void import("./features/centros/CentrosView");
  }
  void import("./app-entry").then((m) => m.mount());
}
