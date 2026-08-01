import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useOutletContext } from "react-router-dom";
import { PanelFlotante } from "@/components/PanelFlotante";
import { preloadLogosCuerpos } from "@/data/preloadLogosCuerpos";
import { cargarBaseMapaCentros, guardarBaseMapaCentros } from "@/data/preferenciasMapa";
import {
  cargarModoMarcadorCentros,
  cargarMostrarParteMarcador,
  cargarMostrarLeyendaMarcador,
  cargarMostrarCintaTotales,
  cargarColorearPorUnidad,
  guardarModoMarcadorCentros,
  guardarMostrarParteMarcador,
  guardarMostrarLeyendaMarcador,
  guardarMostrarCintaTotales,
  guardarColorearPorUnidad,
  type ModoMarcadorCentros,
} from "@/data/preferenciasMapa";
import type { BaseMapa } from "@/map/estiloMapa";
import { BASE_MAPA_DEFECTO } from "@/map/estiloMapa";
import { useSupabaseQueryConEstado } from "@/data/useSupabaseQuery";
import { useOcupacionesCentros } from "@/data/useOcupacionesCentros";
import { desenvolver, type FilaSync } from "@/data/desenvolver";
import { aplicarPartesActualesACentros } from "@/domain/parteActualCentros";
import {
  type CentroTransitorio,
  type ClaveUnidadSebin,
  unidadSebinDe,
} from "@/domain/centrosTransitorios";
import type { Sesion } from "@/data/authSupabase";
import {
  centrosEnAlcanceUsuario,
  centrosVisiblesParaUsuario,
  idsCentrosResaltadosMapa,
  puedeCrearCentros,
  puedeEscribir,
} from "@/domain/permisos";
import { useMapaCentros } from "@/contexts/MapaCentrosContext";
import { EstadoError } from "@/components/skeletons";
import { Button } from "@/components/ui/button";
import { ANCHO_VISTA_PRINCIPAL, MarcoVista } from "@/components/VistaContenedor";
import { CentrosMap, type CentrosMapHandle } from "./CentrosMap";
import { DetalleCentro } from "./DetalleCentro";
import { TableroCentros } from "./TableroCentros";
import { PanelCentros, calcularEstadosFilas } from "./PanelCentros";
import { ControlesMapaFlotantes } from "./ControlesMapaFlotantes";
import { TotalesMapaCentros } from "./TotalesMapaCentros";

interface OutletContext {
  sesion: Sesion;
}

/** Vista de conjunto: mapa o tablero de la red de Centros Transitorios. */
export function CentrosView() {
  const { sesion } = useOutletContext<OutletContext>();
  const location = useLocation();
  const vista = location.pathname.includes("/tablero") ? "tablero" : "mapa";
  const puedeEditar = puedeEscribir(sesion.user.rol);
  const puedeEliminar = puedeCrearCentros(sesion.user);
  const navigate = useNavigate();
  const {
    panelCentrosAbierto,
    setPanelCentrosAbierto,
  } = useMapaCentros();

  const [baseMapa, setBaseMapa] = useState<BaseMapa>(
    () => cargarBaseMapaCentros() ?? BASE_MAPA_DEFECTO,
  );
  const [seleccionado, setSeleccionado] = useState<string | null>(null);
  const [detalleAbierto, setDetalleAbierto] = useState(false);
  const [modoMarcador, setModoMarcador] = useState<ModoMarcadorCentros>(
    () => cargarModoMarcadorCentros() ?? "color",
  );
  const [mostrarParteMarcador, setMostrarParteMarcador] = useState(
    () => cargarMostrarParteMarcador() ?? false,
  );
  const [mostrarLeyendaMarcador, setMostrarLeyendaMarcador] = useState(
    () => cargarMostrarLeyendaMarcador() ?? true,
  );
  const [mostrarCintaTotales, setMostrarCintaTotales] = useState(
    () => cargarMostrarCintaTotales() ?? true,
  );
  const [colorearPorUnidad, setColorearPorUnidad] = useState(
    () => cargarColorearPorUnidad() ?? false,
  );
  const [unidadesFiltroMapa, setUnidadesFiltroMapa] = useState<Set<ClaveUnidadSebin>>(
    () => new Set(),
  );
  const [expandidos, setExpandidos] = useState<Set<ClaveUnidadSebin>>(() => new Set());
  const [exportando, setExportando] = useState(false);
  const mapaRef = useRef<CentrosMapHandle>(null);

  function alternarUnidadFiltro(clave: ClaveUnidadSebin) {
    setUnidadesFiltroMapa((prev) => {
      const next = new Set(prev);
      if (next.has(clave)) next.delete(clave);
      else next.add(clave);
      return next;
    });
  }

  function limpiarUnidadesFiltro() {
    setUnidadesFiltroMapa(new Set());
  }

  useEffect(() => {
    guardarBaseMapaCentros(baseMapa);
  }, [baseMapa]);

  useEffect(() => {
    guardarModoMarcadorCentros(modoMarcador);
  }, [modoMarcador]);

  useEffect(() => {
    guardarMostrarParteMarcador(mostrarParteMarcador);
  }, [mostrarParteMarcador]);

  useEffect(() => {
    guardarMostrarLeyendaMarcador(mostrarLeyendaMarcador);
  }, [mostrarLeyendaMarcador]);

  useEffect(() => {
    guardarMostrarCintaTotales(mostrarCintaTotales);
  }, [mostrarCintaTotales]);

  useEffect(() => {
    guardarColorearPorUnidad(colorearPorUnidad);
  }, [colorearPorUnidad]);

  useEffect(() => {
    if (modoMarcador !== "color") setUnidadesFiltroMapa(new Set());
  }, [modoMarcador]);

  useEffect(() => {
    preloadLogosCuerpos();
  }, []);

  type CentroFila = CentroTransitorio & { deleted: boolean };
  const {
    datos: filasCentros,
    cargando: cargandoCentros,
    error: errorCentros,
  } = useSupabaseQueryConEstado<CentroFila, FilaSync<CentroTransitorio>>(
    "centros",
    {
      transform: desenvolver as (raw: FilaSync<CentroTransitorio>) => CentroFila,
      clientFilter: (c) => !c.deleted,
    },
  );
  const snapshotsOcupacion = useOcupacionesCentros();
  const centrosRed = useMemo(
    () =>
      aplicarPartesActualesACentros(
        centrosVisiblesParaUsuario(
          [...filasCentros].sort((a, b) => (a.nro ?? 0) - (b.nro ?? 0)),
          sesion.user,
        ),
        snapshotsOcupacion,
      ),
    [filasCentros, snapshotsOcupacion, sesion.user],
  );
  /** Listas, tablero, cinta de totales: solo alcance operativo. */
  const centros = useMemo(
    () => centrosEnAlcanceUsuario(centrosRed, sesion.user),
    [centrosRed, sesion.user],
  );
  const idsResaltadosAmbito = useMemo(
    () => idsCentrosResaltadosMapa(sesion.user),
    [sesion.user],
  );

  const estadosFilas = useMemo(() => calcularEstadosFilas(centros), [centros]);

  useEffect(() => {
    if (vista !== "mapa") return;
    if (sessionStorage.getItem("abrirListaCentros") === "1") {
      sessionStorage.removeItem("abrirListaCentros");
      setPanelCentrosAbierto(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vista, setPanelCentrosAbierto]);

  async function exportarVista() {
    setExportando(true);
    try {
      const fecha = new Date().toISOString().slice(0, 10);
      await mapaRef.current?.exportarImagen(`centros-transitorios-caracas-${fecha}.png`);
    } catch (err) {
      alert(err instanceof Error ? err.message : "No se pudo exportar la imagen del mapa.");
    } finally {
      setExportando(false);
    }
  }

  const centroSel = useMemo(
    () => centros.find((c) => c.id === seleccionado) ?? null,
    [centros, seleccionado],
  );

  function setExpandido(clave: ClaveUnidadSebin, abierto: boolean) {
    setExpandidos((prev) => {
      const s = new Set(prev);
      if (abierto) s.add(clave);
      else s.delete(clave);
      return s;
    });
  }

  function seleccionarDesdeLista(centro: CentroTransitorio) {
    if (!centro.geom) return;
    setSeleccionado(centro.id);
    setDetalleAbierto(false);
  }

  function seleccionarDesdeMapa(id: string | null) {
    if (id == null) {
      cerrarSeleccion();
      return;
    }
    // Alcance limitado: solo interactuar con asignados (los atenuados no reciben clic).
    if (idsResaltadosAmbito && !idsResaltadosAmbito.has(id)) return;
    setSeleccionado(id);
  }

  function cerrarSeleccion() {
    setSeleccionado(null);
    setDetalleAbierto(false);
  }

  function toggleDetalle() {
    if (!seleccionado) return;
    if (window.matchMedia("(max-width: 767px)").matches) {
      navigate(`/centro/${seleccionado}`);
      return;
    }
    setDetalleAbierto((prev) => !prev);
  }

  useEffect(() => {
    if (!seleccionado) return;
    const centro = centros.find((c) => c.id === seleccionado);
    if (centro) setExpandido(unidadSebinDe(centro), true);
  }, [seleccionado, centros]);

  // Mapa monta YA (tiles + MapLibre en paralelo a Supabase). Antes el skeleton
  // bloqueaba todo hasta tener filas → segunda espera de ~10–20s tras el splash.
  if (errorCentros) {
    return (
      <EstadoError
        titulo="No se pudieron cargar los campamentos"
        descripcion="Revisa la conexión e inténtalo de nuevo."
        accion={
          <Button size="sm" variant="outline" onClick={() => window.location.reload()}>
            Reintentar
          </Button>
        }
      />
    );
  }

  return (
    <>
      {/* Sin fade-in en el mapa: pelea con la intro órbita→Caracas bajo el splash. */}
      <div className="relative h-full min-h-0">
        {vista === "mapa" ? (
          <>
            <CentrosMap
              ref={mapaRef}
              centros={centrosRed}
              baseMapa={baseMapa}
              onCambiarBase={setBaseMapa}
              seleccionado={seleccionado}
              onSeleccionar={seleccionarDesdeMapa}
              modoMarcador={modoMarcador}
              onCambiarModoMarcador={setModoMarcador}
              mostrarParteMarcador={mostrarParteMarcador}
              onCambiarMostrarParteMarcador={setMostrarParteMarcador}
              mostrarLeyenda={mostrarLeyendaMarcador}
              onCambiarMostrarLeyenda={setMostrarLeyendaMarcador}
              mostrarCintaTotales={mostrarCintaTotales}
              onCambiarMostrarCintaTotales={setMostrarCintaTotales}
              colorearPorUnidad={colorearPorUnidad}
              onCambiarColorearPorUnidad={setColorearPorUnidad}
              unidadesFiltro={unidadesFiltroMapa}
              onAlternarUnidadFiltro={alternarUnidadFiltro}
              onLimpiarUnidadesFiltro={limpiarUnidadesFiltro}
              idsResaltadosAmbito={idsResaltadosAmbito}
              detalleAbierto={detalleAbierto}
              onToggleDetalle={toggleDetalle}
              onNavegar={(ruta) => navigate(ruta)}
              onExportar={() => void exportarVista()}
              exportando={exportando}
            />

            <ControlesMapaFlotantes
              centros={centros}
              estados={estadosFilas}
              seleccionado={seleccionado}
              onSeleccionarCentro={seleccionarDesdeLista}
              panelAbierto={panelCentrosAbierto}
              onAbrirPanel={() => setPanelCentrosAbierto(true)}
            />

            {mostrarCintaTotales && (
              <div
                className={
                  panelCentrosAbierto
                    ? "map-controls-overlay pointer-events-none absolute inset-x-3 bottom-3 z-10 md:inset-x-auto md:bottom-auto md:left-[calc(min(21rem,86vw)+0.75rem)] md:right-14 md:top-3"
                    : "map-controls-overlay pointer-events-none absolute inset-x-3 bottom-3 z-10 md:inset-x-auto md:bottom-auto md:left-14 md:right-14 md:top-3"
                }
              >
                <TotalesMapaCentros centros={centros} />
              </div>
            )}

            <PanelCentros
              centros={centros}
              unidadesFiltro={unidadesFiltroMapa}
              onAlternarUnidad={alternarUnidadFiltro}
              onLimpiarFiltro={limpiarUnidadesFiltro}
              expandidos={expandidos}
              onSetExpandido={setExpandido}
              seleccionado={seleccionado}
              onSeleccionarCentro={seleccionarDesdeLista}
              abierto={panelCentrosAbierto}
              onCambiarAbierto={setPanelCentrosAbierto}
            />
          </>
        ) : (
          <MarcoVista ancho={ANCHO_VISTA_PRINCIPAL}>
            <TableroCentros
              centros={centros}
              onSeleccionar={(id) => navigate(`/centro/${id}`)}
              puedeCrearCentro={puedeEliminar}
              cargando={cargandoCentros}
            />
          </MarcoVista>
        )}

        {vista === "mapa" && centroSel && detalleAbierto && (
          <PanelFlotante
            titulo={`${centroSel.nro != null ? `N.° ${centroSel.nro} · ` : ""}${centroSel.nombre}`}
            descripcion={centroSel.parroquia}
            onCerrar={() => setDetalleAbierto(false)}
          >
            <DetalleCentro
              centro={centroSel}
              puedeEditar={puedeEditar}
              onEditar={() => navigate(`/centro/${centroSel.id}?vista=coordinacion`)}
              onIrAPestana={(vista) =>
                navigate(
                  vista === "resumen"
                    ? `/centro/${centroSel.id}`
                    : `/centro/${centroSel.id}?vista=${vista}`,
                )
              }
            />
          </PanelFlotante>
        )}
      </div>
    </>
  );
}
