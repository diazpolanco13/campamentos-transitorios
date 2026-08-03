import { lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import { Navigate, Route, Routes, useLocation, useParams } from "react-router-dom";
import { initAuth, useSesion, type Sesion } from "./data/authSupabase";
import { AvisoActualizacionApp } from "./components/AvisoActualizacionApp";
import { BotonBorrarCacheFlotante } from "./components/BotonBorrarCacheFlotante";
import { CapaLogin } from "./components/CapaLogin";
import { MarcaAgua } from "./components/MarcaAgua";
import { PantallaCarga } from "./components/PantallaCarga";
import { SectionSuspense } from "./components/SectionSuspense";
import { SplashIntro } from "./components/SplashIntro";
import { AppShell } from "./layouts/AppShell";
import { señalarAppObsoleta, esErrorModuloObsoleto } from "./lib/avisoAppObsoleta";
import { rutaInicialDeRol, rutaPermitidaParaRol } from "./domain/permisos";
import { useIsMobile } from "./hooks/use-mobile";
import { DashboardViewSkeleton } from "./features/dashboard/DashboardViewSkeleton";
import { BrainViewSkeleton } from "./features/brain/BrainViewSkeleton";
import { MapaSectionSkeleton } from "./features/centros/MapaSectionSkeleton";
import { TableroCampamentosSkeleton } from "./features/centros/TableroCampamentosSkeleton";
import { TablaRedSkeleton } from "./features/centros/TablaRedSkeleton";
import { CensoRedSkeleton } from "./features/censo/CensoRedSkeleton";
import { RefugiadosRedSkeleton } from "./features/refugiados/RefugiadosRedSkeleton";
import { FichaCentroSkeleton } from "./features/centros/FichaCentroSkeleton";
import { BandejaIncidenciasSkeleton } from "./features/incidencias/BandejaIncidenciasSkeleton";
import { GestionSkeleton } from "./features/usuarios/GestionSkeleton";
import { LogsSkeleton } from "./features/logs/LogsSkeleton";

// Rutas con carga perezosa: cada vista pesada (MapLibre, recharts, ficha
// humanitaria…) viaja en su propio chunk. El bundle inicial queda en el núcleo
// (React + Supabase + login) y el resto se descarga al navegar — clave para
// conexiones lentas. Los factories de import van aparte para poder PRECARGAR
// el chunk de la ruta inicial durante el arranque (mientras se restaura la
// sesión) y que el fallback de Suspense no destelle al soltar el splash.
const importCentrosView = () => import("./features/centros/CentrosView");
const importFichaCentroView = () => import("./features/centros/FichaCentroView");
const importNuevoCentroView = () => import("./features/centros/NuevoCentroView");
const importDashboardView = () => import("./features/dashboard/DashboardView");
const importBrainView = () => import("./features/brain/BrainView");
const importIncidenciasRedirect = () => import("./features/incidencias/IncidenciasRedirect");
const importIncidenciasLayout = () => import("./features/incidencias/IncidenciasLayout");
const importIncidenciasFuncionariosView = () =>
  import("./features/incidencias/IncidenciasFuncionariosView");
const importIncidenciasRefugiadosView = () =>
  import("./features/incidencias/IncidenciasRefugiadosView");
const importDenunciasEliminadasView = () =>
  import("./features/incidencias/DenunciasEliminadasView");
const importGestionUsuarios = () => import("./features/usuarios/GestionUsuarios");
const importFormUsuarioView = () => import("./features/usuarios/FormUsuarioView");
const importBandejaOperadoresView = () =>
  import("./features/usuarios/BandejaOperadoresView");
const importGestionCatalogosOperativos = () =>
  import("./features/config/GestionCatalogosOperativos");
const importPreferenciasCuentaView = () =>
  import("./features/config/PreferenciasCuentaView");
const importLogsView = () => import("./features/logs/LogsView");
const importEstadoSistemaView = () => import("./features/estado/EstadoSistemaView");
const importReportesDiariosRedView = () => import("./features/centros/ReportesDiariosRedView");
const importRefugiadosRedView = () => import("./features/refugiados/RefugiadosRedView");
const importRefugiadoDetalleRedView = () =>
  import("./features/refugiados/RefugiadoDetalleRedView");
const importDotacionesPendientesView = () =>
  import("./features/refugiados/DotacionesPendientesView");
const importCensoView = () => import("./features/censo/CensoView");
const importCensoRedView = () => import("./features/censo/CensoRedView");
const importCensoRedListadoView = () => import("./features/censo/CensoRedListadoView");
const importCensoVerificacionView = () =>
  import("./features/censo/CensoVerificacionView");
const importCensoCentroDetalleView = () => import("./features/censo/CensoCentroDetalleView");
const importTrasladosView = () => import("./features/traslados/TrasladosView");
const importCampoTareaView = () => import("./features/terreno/CampoTareaView");

const CentrosView = lazy(() => importCentrosView().then((m) => ({ default: m.CentrosView })));
const FichaCentroView = lazy(() =>
  importFichaCentroView().then((m) => ({ default: m.FichaCentroView })),
);
const NuevoCentroView = lazy(() =>
  importNuevoCentroView().then((m) => ({ default: m.NuevoCentroView })),
);
const DashboardView = lazy(() =>
  importDashboardView().then((m) => ({ default: m.DashboardView })),
);
const BrainView = lazy(() =>
  importBrainView().then((m) => ({ default: m.BrainView })),
);
const IncidenciasRedirect = lazy(() =>
  importIncidenciasRedirect().then((m) => ({ default: m.IncidenciasRedirect })),
);
const IncidenciasLayout = lazy(() =>
  importIncidenciasLayout().then((m) => ({ default: m.IncidenciasLayout })),
);
const IncidenciasFuncionariosView = lazy(() =>
  importIncidenciasFuncionariosView().then((m) => ({ default: m.IncidenciasFuncionariosView })),
);
const IncidenciasRefugiadosView = lazy(() =>
  importIncidenciasRefugiadosView().then((m) => ({ default: m.IncidenciasRefugiadosView })),
);
const DenunciasEliminadasView = lazy(() =>
  importDenunciasEliminadasView().then((m) => ({ default: m.DenunciasEliminadasView })),
);
const HojaQrsTerrenoView = lazy(() =>
  import("./features/centros/HojaQrsTerrenoView").then((m) => ({
    default: m.HojaQrsTerrenoView,
  })),
);
const GestionUsuarios = lazy(() =>
  importGestionUsuarios().then((m) => ({ default: m.GestionUsuarios })),
);
const FormUsuarioView = lazy(() =>
  importFormUsuarioView().then((m) => ({ default: m.FormUsuarioView })),
);
const BandejaOperadoresView = lazy(() =>
  importBandejaOperadoresView().then((m) => ({ default: m.BandejaOperadoresView })),
);
const GestionCatalogosOperativos = lazy(() =>
  importGestionCatalogosOperativos().then((m) => ({
    default: m.GestionCatalogosOperativos,
  })),
);
const PreferenciasCuentaView = lazy(() =>
  importPreferenciasCuentaView().then((m) => ({ default: m.PreferenciasCuentaView })),
);
const LogsView = lazy(() => importLogsView().then((m) => ({ default: m.LogsView })));
const EstadoSistemaView = lazy(() =>
  importEstadoSistemaView().then((m) => ({ default: m.EstadoSistemaView })),
);
const ReportesDiariosRedView = lazy(() =>
  importReportesDiariosRedView().then((m) => ({ default: m.ReportesDiariosRedView })),
);
const RefugiadosRedView = lazy(() =>
  importRefugiadosRedView().then((m) => ({ default: m.RefugiadosRedView })),
);
const RefugiadoDetalleRedView = lazy(() =>
  importRefugiadoDetalleRedView().then((m) => ({ default: m.RefugiadoDetalleRedView })),
);
const DotacionesPendientesView = lazy(() =>
  importDotacionesPendientesView().then((m) => ({ default: m.DotacionesPendientesView })),
);
const CensoView = lazy(() => importCensoView().then((m) => ({ default: m.CensoView })));
const CensoRedView = lazy(() => importCensoRedView().then((m) => ({ default: m.CensoRedView })));
const CensoRedListadoView = lazy(() =>
  importCensoRedListadoView().then((m) => ({ default: m.CensoRedListadoView })),
);
const CensoVerificacionView = lazy(() =>
  importCensoVerificacionView().then((m) => ({ default: m.CensoVerificacionView })),
);
const CensoCentroDetalleView = lazy(() =>
  importCensoCentroDetalleView().then((m) => ({ default: m.CensoCentroDetalleView })),
);
const TrasladosView = lazy(() =>
  importTrasladosView().then((m) => ({ default: m.TrasladosView })),
);
const CampoTareaView = lazy(() =>
  importCampoTareaView().then((m) => ({ default: m.CampoTareaView })),
);

/**
 * Devuelve el import del chunk que renderizará la ruta actual, para
 * precargarlo en paralelo con la restauración de la sesión. Las rutas no
 * listadas caen al chunk del mapa (destino del fallback `*`).
 */
function esListadoCensoRed(pathname: string): boolean {
  return (
    pathname.startsWith("/centros/registro/personas") ||
    pathname.startsWith("/centros/censo/personas") ||
    pathname.startsWith("/centros/censo-rapido/personas")
  );
}

function esVerificacionCensoRed(pathname: string): boolean {
  return (
    pathname.startsWith("/centros/registro/verificacion") ||
    pathname.startsWith("/centros/censo/verificacion") ||
    pathname.startsWith("/centros/censo-rapido/verificacion")
  );
}

function esDetalleCensoRed(pathname: string): boolean {
  if (esListadoCensoRed(pathname) || esVerificacionCensoRed(pathname)) {
    return false;
  }
  return (
    /^\/centros\/registro\/[^/]+$/.test(pathname) ||
    /^\/centros\/censo\/[^/]+$/.test(pathname) ||
    /^\/centros\/censo-rapido\/[^/]+$/.test(pathname)
  );
}

function esTableroCensoRed(pathname: string): boolean {
  return (
    pathname === "/centros/registro" ||
    pathname === "/centros/censo" ||
    pathname === "/centros/censo-rapido"
  );
}

/** Redirect legacy `/centros/censo|censo-rapido/:centroId` → `/centros/registro/:centroId`. */
function RedirigirRegistroCentroLegacy() {
  const { centroId } = useParams<{ centroId: string }>();
  return <Navigate to={`/centros/registro/${centroId ?? ""}`} replace />;
}

function precargarRutaInicial(pathname: string): Promise<unknown> {
  if (esListadoCensoRed(pathname)) return importCensoRedListadoView();
  if (esVerificacionCensoRed(pathname)) return importCensoVerificacionView();
  if (esDetalleCensoRed(pathname)) return importCensoCentroDetalleView();
  if (esTableroCensoRed(pathname)) return importCensoRedView();
  if (pathname.startsWith("/registro") || pathname.startsWith("/censo"))
    return importCensoView();
  if (pathname.startsWith("/dashboard")) return importDashboardView();
  if (pathname.startsWith("/brain")) return importBrainView();
  if (pathname.startsWith("/centros/tablero")) return importCentrosView();
  if (/^\/centros\/reportes\/[^/]+/.test(pathname)) return importFichaCentroView();
  if (pathname.startsWith("/centros/reportes")) return importReportesDiariosRedView();
  if (pathname.startsWith("/centros/refugiados/")) return importRefugiadoDetalleRedView();
  if (pathname.startsWith("/centros/refugiados")) return importRefugiadosRedView();
  if (pathname.startsWith("/centros/traslados")) return importTrasladosView();
  if (pathname.startsWith("/centros/dotaciones-pendientes"))
    return importDotacionesPendientesView();
  if (pathname.startsWith("/centro/nuevo")) return importNuevoCentroView();
  if (pathname.startsWith("/centro/")) return importFichaCentroView();
  if (pathname.startsWith("/incidencias/eliminadas")) return importDenunciasEliminadasView();
  if (pathname.startsWith("/incidencias"))
    return Promise.all([importIncidenciasLayout(), importIncidenciasRedirect()]);
  if (pathname === "/usuarios/nuevo" || /^\/usuarios\/[^/]+\/editar/.test(pathname))
    return importFormUsuarioView();
  if (pathname === "/usuarios/terreno") return importBandejaOperadoresView();
  if (pathname.startsWith("/usuarios")) return importGestionUsuarios();
  if (pathname.startsWith("/config/catalogos-operativos"))
    return importGestionCatalogosOperativos();
  if (pathname.startsWith("/config/unidades-sebin"))
    return importGestionCatalogosOperativos();
  if (pathname.startsWith("/config/perfil")) return importPreferenciasCuentaView();
  if (pathname.startsWith("/logs")) return importLogsView();
  if (pathname.startsWith("/estado")) return importEstadoSistemaView();
  return importCentrosView();
}

/** Redirige a la vista inicial del rol si no tiene acceso a la ruta actual. */
function RutaAutorizada({ sesion, children }: { sesion: Sesion; children: ReactNode }) {
  const { pathname } = useLocation();
  if (!rutaPermitidaParaRol(pathname, sesion.user.rol)) {
    return <Navigate to={rutaInicialDeRol(sesion.user.rol)} replace />;
  }
  return children;
}

/** Lazy route con skeleton de sección (shell ya montado). */
function RutaConSkeleton({
  fallback,
  children,
}: {
  fallback: ReactNode;
  children: ReactNode;
}) {
  return <SectionSuspense fallback={fallback}>{children}</SectionSuspense>;
}

export function App() {
  const sesion = useSesion();
  const location = useLocation();
  const esMovil = useIsMobile();
  const [arrancando, setArrancando] = useState(true);

  const enMapa =
    location.pathname === "/centros/mapa" ||
    location.pathname === "/centros" ||
    location.pathname === "/";
  // En reporte diario el FAB tapa la barra de fases móvil.
  const enReporteDiario =
    new URLSearchParams(location.search).get("reportar") === "1";
  const enBrain = location.pathname.startsWith("/brain");
  /** Mapa móvil / brain: botón en controles; no FAB suelto. */
  const mostrarFabCache =
    !(esMovil && enMapa) && !enReporteDiario && !enBrain;

  useEffect(() => {
    const esPlanillaPublica =
      window.location.pathname === "/registro" ||
      window.location.pathname.startsWith("/registro/") ||
      window.location.pathname === "/censo" ||
      window.location.pathname.startsWith("/censo/");

    // La planilla pública no necesita restaurar sesión: evita una ida a Supabase
    // Auth antes de pintar. (En /registro el bootstrap ligero ni siquiera monta App.)
    const sesionLista = esPlanillaPublica ? Promise.resolve() : initAuth();
    // Prefetch del chunk de la ruta EN PARALELO, pero NO bloquea el splash:
    // antes se esperaba auth+chunk juntos (~10–20s en dev con MapLibre) y el
    // intro mentía "SISTEMA LISTO". Suspense/skeleton cubren el hueco del chunk.
    void precargarRutaInicial(window.location.pathname).catch((err) => {
      console.warn("[app] Fallo al precargar la ruta inicial:", err);
      if (esErrorModuloObsoleto(err)) señalarAppObsoleta();
    });
    void sesionLista.finally(() => setArrancando(false));
  }, []);

  // Splash cinematográfico vive en index.html; SplashIntro solo lo cierra.
  const contenido = (() => {
    if (arrancando) return null;

    // Planilla de registro en terreno: vista pública, sin login. Va antes
    // del gate de sesión para que los operadores accedan directo desde el enlace.
    if (
      location.pathname.startsWith("/registro") ||
      location.pathname.startsWith("/censo")
    ) {
      return (
        <>
          <AvisoActualizacionApp />
          {mostrarFabCache && <BotonBorrarCacheFlotante />}
          <Suspense fallback={<PantallaCarga />}>
            <CensoView />
          </Suspense>
        </>
      );
    }

    // Login vive en CapaLogin (overlay fijo, siempre en el mismo sitio del
    // árbol): al autenticar la app monta DEBAJO y el login se disuelve con el
    // mismo gesto del splash. Si CapaLogin se remonta, pierde el puente → corte.
    const mostrarMarcaAgua = sesion?.user.marca_agua !== false;

    return (
      <>
        <AvisoActualizacionApp />
        {mostrarFabCache && <BotonBorrarCacheFlotante />}
        {sesion ? (
        <Routes>
        <Route
          path="/dashboard"
          element={
            <RutaAutorizada sesion={sesion}>
              <RutaConSkeleton fallback={<DashboardViewSkeleton />}>
                <DashboardView sesion={sesion} />
              </RutaConSkeleton>
            </RutaAutorizada>
          }
        />

        <Route
          element={
            <RutaAutorizada sesion={sesion}>
              <AppShell sesion={sesion} />
            </RutaAutorizada>
          }
        >
          <Route path="/" element={<Navigate to="/centros/mapa" replace />} />
          <Route
            path="/brain"
            element={
              <RutaConSkeleton fallback={<BrainViewSkeleton />}>
                <BrainView sesion={sesion} />
              </RutaConSkeleton>
            }
          />
          <Route
            path="/centros/mapa"
            element={
              <RutaConSkeleton fallback={<MapaSectionSkeleton />}>
                <CentrosView />
              </RutaConSkeleton>
            }
          />
          <Route
            path="/centros/tablero"
            element={
              <RutaConSkeleton fallback={<TableroCampamentosSkeleton />}>
                <CentrosView />
              </RutaConSkeleton>
            }
          />
          <Route
            path="/centros/traslados"
            element={
              <RutaConSkeleton
                fallback={<TablaRedSkeleton etiqueta="Cargando traslados" />}
              >
                <TrasladosView />
              </RutaConSkeleton>
            }
          />
          <Route
            path="/campo/:tarea"
            element={
              <RutaConSkeleton
                fallback={<TablaRedSkeleton etiqueta="Cargando trabajo de terreno" />}
              >
                <CampoTareaView sesion={sesion} />
              </RutaConSkeleton>
            }
          />
          <Route
            path="/centros/reportes/:centroId"
            element={
              <RutaConSkeleton fallback={<FichaCentroSkeleton />}>
                <FichaCentroView sesion={sesion} />
              </RutaConSkeleton>
            }
          />
          <Route
            path="/centros/reportes"
            element={
              <RutaConSkeleton
                fallback={<TablaRedSkeleton etiqueta="Cargando reportes diarios" />}
              >
                <ReportesDiariosRedView />
              </RutaConSkeleton>
            }
          />
          <Route
            path="/centros/registro/personas"
            element={
              <RutaConSkeleton
                fallback={<TablaRedSkeleton conTabs etiqueta="Cargando listado de registro" />}
              >
                <CensoRedListadoView sesion={sesion} />
              </RutaConSkeleton>
            }
          />
          <Route
            path="/centros/registro/verificacion"
            element={
              <RutaConSkeleton
                fallback={<TablaRedSkeleton conTabs etiqueta="Cargando verificación de registro" />}
              >
                <CensoVerificacionView sesion={sesion} />
              </RutaConSkeleton>
            }
          />
          <Route
            path="/centros/registro/:centroId"
            element={
              <RutaConSkeleton fallback={<FichaCentroSkeleton />}>
                <CensoCentroDetalleView sesion={sesion} />
              </RutaConSkeleton>
            }
          />
          <Route
            path="/centros/registro"
            element={
              <RutaConSkeleton fallback={<CensoRedSkeleton />}>
                <CensoRedView sesion={sesion} />
              </RutaConSkeleton>
            }
          />
          {/* Alias legacy: /centros/censo y /centros/censo-rapido → /centros/registro */}
          <Route
            path="/centros/censo/personas"
            element={<Navigate to="/centros/registro/personas" replace />}
          />
          <Route
            path="/centros/censo/verificacion"
            element={<Navigate to="/centros/registro/verificacion" replace />}
          />
          <Route
            path="/centros/censo/:centroId"
            element={<RedirigirRegistroCentroLegacy />}
          />
          <Route
            path="/centros/censo"
            element={<Navigate to="/centros/registro" replace />}
          />
          <Route
            path="/centros/censo-rapido/personas"
            element={<Navigate to="/centros/registro/personas" replace />}
          />
          <Route
            path="/centros/censo-rapido/verificacion"
            element={<Navigate to="/centros/registro/verificacion" replace />}
          />
          <Route
            path="/centros/censo-rapido/:centroId"
            element={<RedirigirRegistroCentroLegacy />}
          />
          <Route
            path="/centros/censo-rapido"
            element={<Navigate to="/centros/registro" replace />}
          />
          <Route
            path="/centros/refugiados"
            element={
              <RutaConSkeleton fallback={<RefugiadosRedSkeleton />}>
                <RefugiadosRedView />
              </RutaConSkeleton>
            }
          />
          <Route
            path="/centros/refugiados/:alojamientoId"
            element={
              <RutaConSkeleton fallback={<FichaCentroSkeleton />}>
                <RefugiadoDetalleRedView />
              </RutaConSkeleton>
            }
          />
          <Route
            path="/centros/dotaciones-pendientes"
            element={
              <RutaConSkeleton
                fallback={<TablaRedSkeleton etiqueta="Cargando dotaciones" />}
              >
                <DotacionesPendientesView />
              </RutaConSkeleton>
            }
          />
          <Route
            path="/centro/nuevo"
            element={
              <RutaConSkeleton fallback={<FichaCentroSkeleton />}>
                <NuevoCentroView sesion={sesion} />
              </RutaConSkeleton>
            }
          />
          <Route
            path="/centro/:id"
            element={
              <RutaConSkeleton fallback={<FichaCentroSkeleton />}>
                <FichaCentroView sesion={sesion} />
              </RutaConSkeleton>
            }
          />
          <Route
            path="/incidencias/eliminadas"
            element={
              <RutaConSkeleton fallback={<BandejaIncidenciasSkeleton />}>
                <DenunciasEliminadasView sesion={sesion} />
              </RutaConSkeleton>
            }
          />
          <Route
            path="/incidencias"
            element={
              <RutaConSkeleton fallback={<BandejaIncidenciasSkeleton />}>
                <IncidenciasLayout sesion={sesion} />
              </RutaConSkeleton>
            }
          >
            <Route index element={<IncidenciasRedirect sesion={sesion} />} />
            <Route
              path="funcionarios"
              element={<IncidenciasFuncionariosView sesion={sesion} />}
            />
            {/* Rutas absorbidas por la bandeja unificada de funcionarios. */}
            <Route
              path="archivadas"
              element={<Navigate to="/incidencias/funcionarios?estado=archivadas" replace />}
            />
            <Route
              path="analitica"
              element={<Navigate to="/incidencias/funcionarios" replace />}
            />
            <Route path="refugiados" element={<IncidenciasRefugiadosView sesion={sesion} />} />
          </Route>
          <Route
            path="/qrs-terreno"
            element={
              <RutaConSkeleton fallback={<TablaRedSkeleton etiqueta="Cargando QRs" />}>
                <HojaQrsTerrenoView sesion={sesion} />
              </RutaConSkeleton>
            }
          />
          <Route
            path="/usuarios"
            element={
              <RutaConSkeleton fallback={<GestionSkeleton variante="usuarios" />}>
                <GestionUsuarios sesion={sesion} />
              </RutaConSkeleton>
            }
          />
          <Route
            path="/usuarios/terreno"
            element={
              <RutaConSkeleton fallback={<GestionSkeleton variante="usuarios" />}>
                <BandejaOperadoresView sesion={sesion} />
              </RutaConSkeleton>
            }
          />
          <Route
            path="/usuarios/nuevo"
            element={
              <RutaConSkeleton fallback={<GestionSkeleton variante="usuarios" />}>
                <FormUsuarioView sesion={sesion} />
              </RutaConSkeleton>
            }
          />
          <Route
            path="/usuarios/:userId/editar"
            element={
              <RutaConSkeleton fallback={<GestionSkeleton variante="usuarios" />}>
                <FormUsuarioView sesion={sesion} />
              </RutaConSkeleton>
            }
          />
          <Route
            path="/config/catalogos-operativos"
            element={
              <RutaConSkeleton fallback={<GestionSkeleton variante="unidades" />}>
                <GestionCatalogosOperativos sesion={sesion} />
              </RutaConSkeleton>
            }
          />
          <Route
            path="/config/unidades-sebin"
            element={<Navigate to="/config/catalogos-operativos" replace />}
          />
          <Route
            path="/logs"
            element={
              <RutaConSkeleton fallback={<LogsSkeleton />}>
                <LogsView sesion={sesion} />
              </RutaConSkeleton>
            }
          />
          <Route
            path="/estado"
            element={
              <RutaConSkeleton fallback={<LogsSkeleton />}>
                <EstadoSistemaView sesion={sesion} />
              </RutaConSkeleton>
            }
          />
          <Route
            path="/config/perfil"
            element={
              <RutaConSkeleton fallback={<GestionSkeleton variante="usuarios" />}>
                <PreferenciasCuentaView sesion={sesion} />
              </RutaConSkeleton>
            }
          />
          <Route
            path="/config/sistema"
            element={<Navigate to="/config/catalogos-operativos" replace />}
          />
          <Route path="*" element={<Navigate to="/centros/mapa" replace />} />
        </Route>
      </Routes>
        ) : null}
      {sesion && mostrarMarcaAgua && <MarcaAgua usuario={sesion.user} />}
      <CapaLogin listo={!arrancando} sesion={sesion} />
    </>
    );
  })();

  return (
    <SplashIntro listo={!arrancando} esperarOrbitaMapa={!!sesion && enMapa}>
      {contenido}
    </SplashIntro>
  );
}
