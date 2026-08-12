import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { AvisoActualizacionApp } from "./components/AvisoActualizacionApp";
import { BotonBorrarCacheFlotante } from "./components/BotonBorrarCacheFlotante";
import { CensoView } from "./features/censo/CensoView";
import { DenunciaView } from "./features/terreno/DenunciaView";
import { ocultarSplashCuandoListo } from "./lib/splash";

/**
 * Arranque mínimo de vistas de campo:
 * /registro (planilla con sesión password) y /denuncia (QR público).
 * /terreno redirige en main.tsx al login (cutover §7).
 */
export function mount(): void {
  const root = document.getElementById("root");
  if (!root) return;

  const ruta = (base: string) =>
    window.location.pathname === base || window.location.pathname.startsWith(`${base}/`);
  const esDenuncia = ruta("/denuncia");

  document.title = esDenuncia
    ? "Denuncias y sugerencias"
    : "Registro y verificación de damnificados";

  createRoot(root).render(
    <StrictMode>
      <AvisoActualizacionApp />
      {esDenuncia && <BotonBorrarCacheFlotante />}
      {esDenuncia ? <DenunciaView /> : <CensoView />}
    </StrictMode>,
  );

  requestAnimationFrame(() => ocultarSplashCuandoListo());
}
