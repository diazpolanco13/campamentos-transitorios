import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import maplibregl from "maplibre-gl";
import { toPng } from "html-to-image";
import {
  calcularReglaEscala,
  debeMostrarEtiquetaNombre,
  opacidadEtiquetaNombre,
  zoomParaAnchoMetros,
  type ReglaEscala,
} from "@/map/escalaVista";
import {
  CAPAS_BASE,
  VISIBILIDAD_BASE,
  aplicarEdificios3d,
  esBaseEstiloExterno,
  estiloMapaParaBase,
  type BaseMapa,
} from "@/map/estiloMapa";
import {
  ERRORES_CARTO_PARA_FALLBACK,
  TIMEOUT_CARGA_ESTILO_CARTO_MS,
  baseDependeDeCarto,
  cartoDisponible,
  esUrlOErrorCarto,
  siguienteFallbackSinCarto,
  textoErrorMapa,
} from "@/map/disponibilidadCarto";
import {
  AvisoFallbackBaseMapa,
  type InfoFallbackBaseMapa,
} from "@/features/centros/AvisoFallbackBaseMapa";
import {
  esCentroDePrueba,
  CARACAS_CENTRO,
  CARACAS_ZOOM,
  CARACAS_ZOOM_MAX_ENCUDRE,
  LOGO_SEBIN,
  metaUnidadSebinCentro,
  normalizarCentro,
  poblacionCentro,
  totalPersonalOperativo,
  unidadSebinDe,
  type CentroTransitorio,
  type ClaveUnidadSebin,
} from "@/domain/centrosTransitorios";
import {
  cargarModo3dCentros,
  cargarModoGloboCentros,
  cargarVistaCentros,
  guardarModo3dCentros,
  guardarModoGloboCentros,
  guardarVistaCentros,
  VISTA_DEFECTO_CENTROS,
  type ModoMarcadorCentros,
} from "@/data/preferenciasMapa";
import {
  ANCHO_INTRO_DESTINO_METROS,
  DURACION_INTRO_MAPA_MS,
  TIMEOUT_INTRO_FALLBACK_MS,
  ZOOM_INTRO_ORBITA,
  avisarMapaOrbitaLista,
  marcarIntroMapaLanzada,
  onInicioSalidaOverlay,
  reservarIntroMapa,
} from "@/lib/introMapa";
import { analisisCentro, COLOR_SEMAFORO } from "@/domain/capacidadCentros";
import { boundsRedCentros } from "@/domain/redCentros";
import { COLOR_NUCLEO_NEUTRO } from "@/domain/unidadesSebin";
import { useEstadoReporteHoy, fasesCompletadasHoy } from "@/data/useEstadoReporteHoy";
import { useEventosReportes } from "@/data/useEventosReportes";
import { useDenuncias } from "@/data/useDenuncias";
import { useCasosSaludCentros } from "@/data/useCasosSaludCentros";
import { claveDia } from "@/data/reposSupabase";
import {
  idsCentrosConAlertaCritica,
  mapaEtiquetasAlertaCritica,
} from "@/domain/alertasCriticasCentro";
import { MarcadorCentro } from "./MarcadorCentro";
import { InfoCentro } from "./InfoCentro";
import { ControlesMapaCentros } from "./ControlesMapaCentros";
import { SelectoresVistaMapa } from "./SelectoresVistaMapa";
import { LeyendaUnidadesSebin } from "./LeyendaUnidadesSebin";
import { LogoMini } from "@/components/LogoMini";

interface Props {
  centros: CentroTransitorio[];
  baseMapa: BaseMapa;
  onCambiarBase: (base: BaseMapa) => void;
  seleccionado: string | null;
  onSeleccionar: (id: string | null) => void;
  modoMarcador: ModoMarcadorCentros;
  onCambiarModoMarcador: (modo: ModoMarcadorCentros) => void;
  mostrarParteMarcador: boolean;
  onCambiarMostrarParteMarcador: (mostrar: boolean) => void;
  mostrarLeyenda: boolean;
  onCambiarMostrarLeyenda: (mostrar: boolean) => void;
  mostrarCintaTotales: boolean;
  onCambiarMostrarCintaTotales: (mostrar: boolean) => void;
  /** Núcleo del marcador coloreado por unidad SEBIN. Default: off (un solo color neutro). */
  colorearPorUnidad: boolean;
  onCambiarColorearPorUnidad: (activo: boolean) => void;
  /** Direcciones SEBIN activas (vacío = ver todas). */
  unidadesFiltro: ReadonlySet<ClaveUnidadSebin>;
  onAlternarUnidadFiltro: (clave: ClaveUnidadSebin) => void;
  onLimpiarUnidadesFiltro: () => void;
  /**
   * IDs resaltados por ámbito del usuario (supervisor/operador).
   * `null`/`undefined` = sin atenuación por asignación.
   * Con set: el resto se opaca igual que el filtro por unidad SEBIN.
   */
  idsResaltadosAmbito?: ReadonlySet<string> | null;
  /** Indica si el panel DetalleCentro está abierto (estado "presionado" del botón "detalles"). */
  detalleAbierto: boolean;
  /** Alternar (abrir/cerrar) el panel de detalle completo del centro seleccionado. */
  onToggleDetalle?: () => void;
  /** Navegación SPA hacia ficha (chips de alerta del popup; sin contexto Router ahí). */
  onNavegar?: (ruta: string) => void;
  onExportar?: () => void;
  exportando?: boolean;
}

export interface CentrosMapHandle {
  exportarImagen: (nombreArchivo: string) => Promise<void>;
  centrarCaracas: () => void;
  activarGps: () => void;
}

export const CentrosMap = forwardRef<CentrosMapHandle, Props>(function CentrosMap(
  {
    centros,
    baseMapa,
    onCambiarBase,
    seleccionado,
    onSeleccionar,
    modoMarcador,
    onCambiarModoMarcador,
    mostrarParteMarcador,
    onCambiarMostrarParteMarcador,
    mostrarLeyenda,
    onCambiarMostrarLeyenda,
    mostrarCintaTotales,
    onCambiarMostrarCintaTotales,
    colorearPorUnidad,
    onCambiarColorearPorUnidad,
    unidadesFiltro,
    onAlternarUnidadFiltro,
    onLimpiarUnidadesFiltro,
    idsResaltadosAmbito = null,
    detalleAbierto,
    onToggleDetalle,
    onNavegar,
    onExportar,
    exportando,
  },
  ref,
) {
  const contenedorRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const listoRef = useRef(false);
  const marcadores = useRef<Map<string, maplibregl.Marker>>(new Map());
  const roots = useRef<Map<string, Root>>(new Map());
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const popupRootRef = useRef<Root | null>(null);
  const marcadorUsuarioRef = useRef<maplibregl.Marker | null>(null);
  const watchGpsRef = useRef<number | null>(null);
  const guardarVistaTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const vistaDefectoAplicadaRef = useRef(false);
  const usaVistaGuardadaRef = useRef(cargarVistaCentros() != null);
  /** Modo de estilo activo en el mapa (`raster` = estilo compuesto; externo = URL). */
  const modoEstiloRef = useRef<"raster" | "dark-matter">(
    esBaseEstiloExterno(baseMapa) ? "dark-matter" : "raster",
  );
  const generacionEstiloRef = useRef(0);
  const [gpsActivo, setGpsActivo] = useState(false);
  const [reglaEscala, setReglaEscala] = useState<ReglaEscala | undefined>();
  const [mostrarEtiquetaNombre, setMostrarEtiquetaNombre] = useState(false);
  const [modo3d, setModo3d] = useState(() => cargarModo3dCentros() ?? true);
  const modo3dRef = useRef(modo3d);
  modo3dRef.current = modo3d;
  const [modoGlobo, setModoGlobo] = useState(() => cargarModoGloboCentros() ?? false);
  const modoGloboRef = useRef(modoGlobo);
  modoGloboRef.current = modoGlobo;
  /**
   * Override de sesión si Carto (u otra base Carto) no carga.
   * No pisa la preferencia del usuario en localStorage.
   */
  const [baseSesion, setBaseSesion] = useState<BaseMapa | null>(null);
  const [avisoFallback, setAvisoFallback] = useState<InfoFallbackBaseMapa | null>(null);
  const [reintentandoCarto, setReintentandoCarto] = useState(false);
  const baseEfectiva = baseSesion ?? baseMapa;
  const baseEfectivaRef = useRef(baseEfectiva);
  baseEfectivaRef.current = baseEfectiva;
  const basePreferidaRef = useRef(baseMapa);
  basePreferidaRef.current = baseMapa;
  const fallbackActivoRef = useRef(false);
  const erroresCartoRef = useRef(0);
  const basesFallbackProbadasRef = useRef<Set<BaseMapa>>(new Set());
  const activarFallbackRef = useRef<(motivo: string) => void>(() => {});
  /** Intro Google Earth: una vez por carga de página, sync con fade splash/login. */
  const hacerIntroRef = useRef(reservarIntroMapa());
  const introEnCursoRef = useRef(hacerIntroRef.current);
  const estadoReporteHoy = useEstadoReporteHoy();
  const hoy = useMemo(() => claveDia(Date.now()), []);
  const { eventos: eventosHoy } = useEventosReportes({ dia: hoy });
  const denunciasAbiertas = useDenuncias({ estado: "abierta" });
  const { casos: casosSaludActivos } = useCasosSaludCentros({ soloActivos: true });
  /** Campamentos con novedad negativa hoy, denuncia abierta o caso de salud → base roja. */
  const centrosConAlertaBase = useMemo(
    () =>
      idsCentrosConAlertaCritica({
        dia: hoy,
        eventosHoy,
        denunciasAbiertas,
        casosSaludActivos,
      }),
    [hoy, eventosHoy, denunciasAbiertas, casosSaludActivos],
  );
  const etiquetasAlertaPorCentro = useMemo(
    () =>
      mapaEtiquetasAlertaCritica({
        dia: hoy,
        eventosHoy,
        denunciasAbiertas,
        casosSaludActivos,
        centroIds: centrosConAlertaBase,
      }),
    [hoy, eventosHoy, denunciasAbiertas, casosSaludActivos, centrosConAlertaBase],
  );

  useEffect(() => {
    guardarModo3dCentros(modo3d);
  }, [modo3d]);

  useEffect(() => {
    guardarModoGloboCentros(modoGlobo);
  }, [modoGlobo]);

  function actualizarEscalaVista() {
    const map = mapRef.current;
    if (!map || !listoRef.current) return;
    const zoom = map.getZoom();
    setReglaEscala(calcularReglaEscala(zoom, map.getCenter().lat));
    // Fade continuo vía variable CSS (sin re-renderizar los marcadores en
    // cada frame de zoom): mismo rango que el fill-extrusion-opacity de los
    // edificios 3D, para que las etiquetas "aparezcan progresivamente" igual.
    map.getContainer().style.setProperty(
      "--etiqueta-opacity",
      opacidadEtiquetaNombre(zoom).toFixed(3),
    );
    const mostrarNombre = debeMostrarEtiquetaNombre(zoom);
    if (mostrarNombre !== cbRef.current.mostrarEtiquetaNombre) {
      cbRef.current.mostrarEtiquetaNombre = mostrarNombre;
      setMostrarEtiquetaNombre(mostrarNombre);
    }
  }

  const cbRef = useRef({
    centros,
    seleccionado,
    detalleAbierto,
    modoMarcador,
    mostrarParteMarcador,
    mostrarEtiquetaNombre,
    colorearPorUnidad,
    unidadesFiltro,
    idsResaltadosAmbito,
    estadoReporteHoy,
    centrosConAlertaBase,
    etiquetasAlertaPorCentro,
    onSeleccionar,
    onToggleDetalle,
    onNavegar,
  });
  cbRef.current = {
    centros,
    seleccionado,
    detalleAbierto,
    modoMarcador,
    mostrarParteMarcador,
    mostrarEtiquetaNombre,
    colorearPorUnidad,
    unidadesFiltro,
    idsResaltadosAmbito,
    estadoReporteHoy,
    centrosConAlertaBase,
    etiquetasAlertaPorCentro,
    onSeleccionar,
    onToggleDetalle,
    onNavegar,
  };

  const unidadesPresentes = useMemo(() => {
    const s = new Set<ClaveUnidadSebin>();
    for (const c of centros) s.add(unidadSebinDe(c));
    return s;
  }, [centros]);

  function persistirVista() {
    const map = mapRef.current;
    if (!map || !listoRef.current || introEnCursoRef.current) return;
    const c = map.getCenter();
    guardarVistaCentros({
      center: [c.lng, c.lat],
      zoom: map.getZoom(),
    });
  }

  function programarPersistirVista() {
    if (introEnCursoRef.current) return;
    if (guardarVistaTimer.current) clearTimeout(guardarVistaTimer.current);
    guardarVistaTimer.current = setTimeout(persistirVista, 400);
  }

  function detenerGps() {
    if (watchGpsRef.current != null) {
      navigator.geolocation.clearWatch(watchGpsRef.current);
      watchGpsRef.current = null;
    }
    marcadorUsuarioRef.current?.remove();
    marcadorUsuarioRef.current = null;
    setGpsActivo(false);
  }

  function crearMarcadorUsuario(map: maplibregl.Map, lngLat: [number, number]) {
    const el = document.createElement("div");
    el.className =
      "size-4 rounded-full border-2 border-white bg-sky-500 shadow-[0_0_0_4px_rgba(14,165,233,0.35)]";
    el.setAttribute("aria-hidden", "true");
    const marcador = new maplibregl.Marker({ element: el }).setLngLat(lngLat).addTo(map);
    marcadorUsuarioRef.current = marcador;
  }

  function alternarGps() {
    if (watchGpsRef.current != null) {
      detenerGps();
      return;
    }
    if (!navigator.geolocation) {
      alert("Tu navegador no soporta geolocalización (GPS).");
      return;
    }
    watchGpsRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const map = mapRef.current;
        if (!map) return;
        const lngLat: [number, number] = [pos.coords.longitude, pos.coords.latitude];
        if (!marcadorUsuarioRef.current) {
          crearMarcadorUsuario(map, lngLat);
          map.flyTo({
            center: lngLat,
            zoom: Math.max(map.getZoom(), 14),
            duration: 600,
          });
        } else {
          marcadorUsuarioRef.current.setLngLat(lngLat);
        }
        setGpsActivo(true);
      },
      () => {
        detenerGps();
        alert("No se pudo obtener tu ubicación. Revisa los permisos del navegador.");
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 },
    );
  }

  function encuadrarRed(opciones: { animar?: boolean } = {}) {
    const map = mapRef.current;
    if (!map || !listoRef.current) return;

    const bounds = boundsRedCentros(cbRef.current.centros);
    if (!bounds) {
      map.flyTo({
        center: CARACAS_CENTRO,
        zoom: CARACAS_ZOOM,
        duration: opciones.animar ? 800 : 0,
      });
      return;
    }

    map.fitBounds(bounds, {
      padding: { top: 56, bottom: 56, left: 56, right: 56 },
      maxZoom: CARACAS_ZOOM_MAX_ENCUDRE,
      duration: opciones.animar ? 800 : 0,
    });
  }

  function aplicarVistaDefectoSiCorresponde() {
    if (usaVistaGuardadaRef.current || vistaDefectoAplicadaRef.current) return;
    if (!boundsRedCentros(cbRef.current.centros)) return;
    encuadrarRed({ animar: false });
    vistaDefectoAplicadaRef.current = true;
  }

  function centrarCaracas() {
    encuadrarRed({ animar: true });
  }

  /**
   * Espera el fade del splash/login y lanza flyTo órbita → Caracas ~30 km.
   * Devuelve cancelador para StrictMode / unmount.
   */
  function programarIntroFly(map: maplibregl.Map): () => void {
    let lanzado = false;
    let fallbackId = 0;

    const finalizarIntro = () => {
      introEnCursoRef.current = false;
      // Restaura preferencia de globo del usuario (puede ser off).
      if (mapRef.current) {
        aplicarProyeccionGlobo(mapRef.current, modoGloboRef.current);
      }
      vistaDefectoAplicadaRef.current = true;
      actualizarEscalaVista();
      persistirVista();
    };

    const lanzar = () => {
      if (lanzado || !mapRef.current || mapRef.current !== map) return;
      lanzado = true;
      marcarIntroMapaLanzada();
      window.clearTimeout(fallbackId);

      const m = mapRef.current;
      const anchoPx = m.getContainer().clientWidth || 1200;
      const zoomDestino = zoomParaAnchoMetros(
        ANCHO_INTRO_DESTINO_METROS,
        CARACAS_CENTRO[1],
        anchoPx,
      );
      const pitchFinal =
        modoEstiloRef.current === "dark-matter" && modo3dRef.current ? 45 : 0;

      introEnCursoRef.current = true;
      m.setMinZoom(0);
      m.flyTo({
        center: CARACAS_CENTRO,
        zoom: zoomDestino,
        pitch: pitchFinal,
        bearing: 0,
        duration: DURACION_INTRO_MAPA_MS,
        essential: true,
        // Ease-out: rápido al salir de órbita, frena al aterrizar.
        easing: (t) => 1 - (1 - t) * (1 - t),
      });
      m.once("moveend", finalizarIntro);
    };

    // Ya en órbita: el login puede empezar a disolverse encima.
    avisarMapaOrbitaLista();

    const unsub = onInicioSalidaOverlay(lanzar);
    fallbackId = window.setTimeout(lanzar, TIMEOUT_INTRO_FALLBACK_MS);

    return () => {
      unsub();
      window.clearTimeout(fallbackId);
      if (!lanzado) {
        // Remount StrictMode: no marcar hecha; el siguiente montaje reintenta.
        introEnCursoRef.current = hacerIntroRef.current;
      }
    };
  }

  function ocultarPopup() {
    popupRef.current?.remove();
    popupRootRef.current?.unmount();
    popupRootRef.current = null;
  }

  function renderPopupContent(centro: CentroTransitorio) {
    if (!popupRootRef.current) return;
    popupRootRef.current.render(
      <InfoCentro
        centro={centro}
        detalleAbierto={cbRef.current.detalleAbierto}
        onToggleDetalle={cbRef.current.onToggleDetalle}
        onNavegar={cbRef.current.onNavegar}
      />,
    );
  }

  function mostrarPopup(map: maplibregl.Map, centro: CentroTransitorio) {
    if (!centro.geom) return;
    ocultarPopup();
    const mount = document.createElement("div");
    const root = createRoot(mount);
    popupRootRef.current = root;
    renderPopupContent(centro);

    popupRef.current = new maplibregl.Popup({
      closeButton: true,
      offset: 14,
      maxWidth: "300px",
    })
      .setDOMContent(mount)
      .setLngLat(centro.geom.coordinates as [number, number])
      .addTo(map);

    popupRef.current.on("close", () => cbRef.current.onSeleccionar(null));
  }

  /**
   * Aplica un estilo aunque el mapa aún no haya disparado `load`
   * (Carto a veces nunca carga: hay que rescatar con setStyle).
   */
  function forzarEstiloBase(base: BaseMapa, trasCargar?: (map: maplibregl.Map) => void) {
    const map = mapRef.current;
    if (!map) return;
    const gen = ++generacionEstiloRef.current;
    const externo = esBaseEstiloExterno(base);
    modoEstiloRef.current = externo ? "dark-matter" : "raster";
    map.setStyle(estiloMapaParaBase(base));
    map.once("style.load", () => {
      if (generacionEstiloRef.current !== gen || !mapRef.current) return;
      const m = mapRef.current;
      if (externo) {
        aplicarEdificios3d(m, modo3dRef.current);
        sincronizarPitch3d(m, modo3dRef.current);
      } else {
        aplicarVisibilidadRaster(m, base);
        if (m.getPitch() > 0 || m.getBearing() !== 0) {
          m.easeTo({ pitch: 0, bearing: 0, duration: 600 });
        }
      }
      aplicarProyeccionGlobo(m, modoGloboRef.current);
      trasCargar?.(m);
    });
  }

  function activarFallbackCarto(motivo: string) {
    if (fallbackActivoRef.current) return;

    const preferida = basePreferidaRef.current;
    const actual = baseEfectivaRef.current;
    if (baseDependeDeCarto(actual)) {
      basesFallbackProbadasRef.current.add(actual);
    }
    const siguiente = siguienteFallbackSinCarto(
      preferida,
      basesFallbackProbadasRef.current,
    );
    if (!siguiente) return;

    basesFallbackProbadasRef.current.add(siguiente);
    fallbackActivoRef.current = true;
    erroresCartoRef.current = 0;
    setBaseSesion(siguiente);
    setAvisoFallback({
      preferida: baseDependeDeCarto(preferida) ? preferida : "dark-matter",
      usada: siguiente,
      motivo,
    });

    // Si el estilo Carto nunca disparó `load`, hay que rescatar con setStyle.
    // Si ya estaba listo, el useEffect de baseSesion llama aplicarBase.
    if (!listoRef.current) {
      forzarEstiloBase(siguiente, (m) => {
        if (listoRef.current) return;
        listoRef.current = true;
        sincronizarMarcadores();
        if (hacerIntroRef.current) {
          aplicarProyeccionGlobo(m, true);
          m.resize();
          m.triggerRepaint();
          avisarMapaOrbitaLista();
        } else {
          aplicarProyeccionGlobo(m, modoGloboRef.current);
          aplicarVistaDefectoSiCorresponde();
          avisarMapaOrbitaLista();
        }
        actualizarEscalaVista();
        m.resize();
      });
    }
  }
  activarFallbackRef.current = activarFallbackCarto;

  function limpiarFallbackSesion() {
    fallbackActivoRef.current = false;
    erroresCartoRef.current = 0;
    basesFallbackProbadasRef.current = new Set();
    setBaseSesion(null);
    setAvisoFallback(null);
  }

  function manejarCambiarBase(base: BaseMapa) {
    if (baseDependeDeCarto(base)) {
      void (async () => {
        setReintentandoCarto(true);
        const ok = await cartoDisponible();
        setReintentandoCarto(false);
        if (!ok) {
          activarFallbackCarto("CDN Carto no responde desde esta red");
          // Preferencia del usuario sigue siendo Carto (padre).
          if (base !== basePreferidaRef.current) onCambiarBase(base);
          return;
        }
        limpiarFallbackSesion();
        onCambiarBase(base);
        // Si el padre ya tenía Carto, forzar reaplicación del estilo.
        if (base === basePreferidaRef.current) {
          forzarEstiloBase(base);
        }
      })();
      return;
    }
    limpiarFallbackSesion();
    onCambiarBase(base);
  }

  async function reintentarCarto() {
    setReintentandoCarto(true);
    const ok = await cartoDisponible();
    setReintentandoCarto(false);
    if (!ok) {
      setAvisoFallback((prev) =>
        prev
          ? {
              ...prev,
              motivo: "Sigue sin respuesta basemaps.cartocdn.com",
            }
          : prev,
      );
      return;
    }
    const preferida = baseDependeDeCarto(basePreferidaRef.current)
      ? basePreferidaRef.current
      : "dark-matter";
    limpiarFallbackSesion();
    if (preferida !== basePreferidaRef.current) {
      onCambiarBase(preferida);
    }
    forzarEstiloBase(preferida);
  }

  useEffect(() => {
    if (!contenedorRef.current || mapRef.current) return;
    const hacerIntro = hacerIntroRef.current;
    const vistaGuardada = cargarVistaCentros();
    // Intro: parte desde órbita sobre Caracas. Si no, vista guardada / default.
    const vistaInicial = hacerIntro
      ? { center: CARACAS_CENTRO, zoom: ZOOM_INTRO_ORBITA }
      : (vistaGuardada ?? VISTA_DEFECTO_CENTROS);
    const baseInicial = baseMapa;
    modoEstiloRef.current = esBaseEstiloExterno(baseInicial) ? "dark-matter" : "raster";
    const map = new maplibregl.Map({
      container: contenedorRef.current,
      style: estiloMapaParaBase(baseInicial),
      center: vistaInicial.center,
      zoom: vistaInicial.zoom,
      pitch:
        hacerIntro
          ? 0
          : esBaseEstiloExterno(baseInicial) && modo3dRef.current
            ? 45
            : 0,
      maxZoom: 19,
      // Intro / globo: minZoom 0 para ver el planeta.
      minZoom: hacerIntro || modoGloboRef.current ? 0 : 3,
      attributionControl: false,
      canvasContextAttributes: { preserveDrawingBuffer: true },
    });
    mapRef.current = map;
    map.on("moveend", programarPersistirVista);
    map.on("move", actualizarEscalaVista);
    map.on("zoom", actualizarEscalaVista);
    map.on("resize", actualizarEscalaVista);

    let cancelarIntro: (() => void) | null = null;
    let timeoutArmarIntro = 0;
    let introArmada = false;
    let timeoutCarto = 0;
    let cancelado = false;

    map.on("error", (ev) => {
      if (cancelado) return;
      if (!baseDependeDeCarto(baseEfectivaRef.current)) return;
      const texto = textoErrorMapa(ev.error);
      if (!esUrlOErrorCarto(texto)) return;
      erroresCartoRef.current += 1;
      if (erroresCartoRef.current >= ERRORES_CARTO_PARA_FALLBACK) {
        activarFallbackRef.current(
          "timeout o bloqueo de basemaps.cartocdn.com",
        );
      }
    });

    map.on("load", () => {
      listoRef.current = true;
      window.clearTimeout(timeoutCarto);
      sincronizarMarcadores();
      aplicarBase();
      if (hacerIntro) {
        // Esfera durante el vuelo (aunque el usuario no tenga globo permanente).
        aplicarProyeccionGlobo(map, true);
        map.resize();
        map.triggerRepaint();
        // Pintar órbita debajo del splash opaco; solo entonces avisar.
        // El splash ESPERA este aviso antes de disolverse.
        const armarIntro = () => {
          if (introArmada || !mapRef.current) return;
          introArmada = true;
          window.clearTimeout(timeoutArmarIntro);
          cancelarIntro = programarIntroFly(map);
        };
        requestAnimationFrame(() => {
          requestAnimationFrame(armarIntro);
        });
        map.once("idle", armarIntro);
        timeoutArmarIntro = window.setTimeout(armarIntro, 1200);
      } else {
        aplicarProyeccionGlobo(map, modoGloboRef.current);
        aplicarVistaDefectoSiCorresponde();
        // Sin intro: desbloquear igual el fade del login (no esperar timeout).
        avisarMapaOrbitaLista();
      }
      actualizarEscalaVista();
      map.resize();
    });

    if (baseDependeDeCarto(baseInicial)) {
      void cartoDisponible().then((ok) => {
        if (cancelado || ok || listoRef.current) return;
        activarFallbackRef.current("CDN Carto no responde desde esta red");
      });
      timeoutCarto = window.setTimeout(() => {
        if (cancelado || listoRef.current) return;
        if (!baseDependeDeCarto(baseEfectivaRef.current)) return;
        activarFallbackRef.current("Carto no cargó a tiempo");
      }, TIMEOUT_CARGA_ESTILO_CARTO_MS);
    }

    const contenedor = contenedorRef.current;
    const ro = new ResizeObserver(() => {
      const mapActual = mapRef.current;
      if (!mapActual || !listoRef.current) return;
      if (contenedor.clientWidth === 0 || contenedor.clientHeight === 0) return;
      mapActual.resize();
    });
    ro.observe(contenedor);
    requestAnimationFrame(() => {
      if (mapRef.current && listoRef.current) mapRef.current.resize();
    });

    return () => {
      cancelado = true;
      introArmada = true;
      window.clearTimeout(timeoutArmarIntro);
      window.clearTimeout(timeoutCarto);
      cancelarIntro?.();
      ro.disconnect();
      if (guardarVistaTimer.current) clearTimeout(guardarVistaTimer.current);
      detenerGps();
      ocultarPopup();
      // Diferir unmount: React 19 no permite desmontar un root síncrono
      // mientras otro render está en curso (Strict Mode / remount).
      const rootsADesmontar = [...roots.current.values()];
      roots.current.clear();
      marcadores.current.forEach((m) => m.remove());
      marcadores.current.clear();
      map.remove();
      mapRef.current = null;
      listoRef.current = false;
      queueMicrotask(() => {
        for (const root of rootsADesmontar) {
          try {
            root.unmount();
          } catch {
            /* root ya desmontado */
          }
        }
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function sincronizarMarcadores() {
    const map = mapRef.current;
    if (!map || !listoRef.current) return;
    const vistos = new Set<string>();
    for (const c of cbRef.current.centros) {
      if (!c.geom) continue;
      vistos.add(c.id);
      const metaUnidad = metaUnidadSebinCentro(c);
      const claveUnidad = unidadSebinDe(c);
      const filtro = cbRef.current.unidadesFiltro;
      const hayFiltroUnidad = filtro.size > 0;
      const ambito = cbRef.current.idsResaltadosAmbito;
      const resaltadoAmbito = ambito == null || ambito.has(c.id);
      const resaltadoUnidad = !hayFiltroUnidad || filtro.has(claveUnidad);
      const resaltado = resaltadoAmbito && resaltadoUnidad;
      let marcador = marcadores.current.get(c.id);
      if (!marcador) {
        const anchor = document.createElement("div");
        const root = createRoot(anchor);
        roots.current.set(c.id, root);
        marcador = new maplibregl.Marker({ element: anchor }).setLngLat(
          c.geom.coordinates as [number, number],
        );
        marcador.addTo(map);
        marcadores.current.set(c.id, marcador);
      }
      // Los atenuados van detrás para que la dirección / ámbito filtrado quede al frente.
      const el = marcador.getElement();
      el.style.zIndex = resaltado ? "2" : "1";
      el.style.pointerEvents = resaltado ? "auto" : "none";
      const analisis = analisisCentro(c);
      const refugiados = poblacionCentro(c);
      const personalTotal = totalPersonalOperativo(normalizarCentro(c).personal);
      // El núcleo del marcador (modo "color") es neutro por defecto: el número ya
      // identifica el campamento, y un solo tono deja que el aro de progreso del
      // reporte se lea en vez de competir con ~12 colores de unidad SEBIN.
      const colorNucleo =
        cbRef.current.modoMarcador === "color" && !cbRef.current.colorearPorUnidad
          ? COLOR_NUCLEO_NEUTRO
          : metaUnidad.color;
      roots.current.get(c.id)?.render(
        <MarcadorCentro
          modo={cbRef.current.modoMarcador}
          nro={c.nro}
          nombre={c.nombre}
          icono="🛡️"
          logo={LOGO_SEBIN}
          color={colorNucleo}
          seleccionado={cbRef.current.seleccionado === c.id}
          resaltado={resaltado}
          mostrarParte={cbRef.current.mostrarParteMarcador}
          mostrarNombre={cbRef.current.mostrarEtiquetaNombre}
          refugiados={refugiados}
          personalTotal={personalTotal}
          semaforoColor={
            analisis.semaforo === "rojo" ? COLOR_SEMAFORO.rojo : null
          }
          fasesReporteHoy={fasesCompletadasHoy(cbRef.current.estadoReporteHoy.get(c.id))}
          alertaBase={cbRef.current.centrosConAlertaBase.has(c.id)}
          alertaBaseEtiquetas={cbRef.current.etiquetasAlertaPorCentro.get(c.id)}
          esPrueba={esCentroDePrueba(c)}
          onClick={() => cbRef.current.onSeleccionar(c.id)}
        />,
      );
    }
    for (const [id, m] of marcadores.current) {
      if (!vistos.has(id)) {
        const root = roots.current.get(id);
        roots.current.delete(id);
        m.remove();
        marcadores.current.delete(id);
        if (root) {
          queueMicrotask(() => {
            try {
              root.unmount();
            } catch {
              /* root ya desmontado */
            }
          });
        }
      }
    }
  }

  useEffect(() => {
    sincronizarMarcadores();
    aplicarVistaDefectoSiCorresponde();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [centros, seleccionado, modoMarcador, mostrarParteMarcador, mostrarEtiquetaNombre, colorearPorUnidad, unidadesFiltro, idsResaltadosAmbito, estadoReporteHoy, centrosConAlertaBase, etiquetasAlertaPorCentro]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !listoRef.current) return;
    if (seleccionado) {
      const centro = cbRef.current.centros.find((c) => c.id === seleccionado);
      if (centro?.geom) {
        mostrarPopup(map, centro);
        map.flyTo({
          center: centro.geom.coordinates as [number, number],
          zoom: Math.max(map.getZoom(), 13),
          duration: 500,
        });
      }
    } else {
      ocultarPopup();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seleccionado]);

  // Refresca el contenido del popup cuando cambia el estado del panel, para que
  // el botón "detalles" refleje el estado "presionado" sin reabrir la nube.
  useEffect(() => {
    if (!seleccionado || !popupRootRef.current) return;
    const centro = cbRef.current.centros.find((c) => c.id === seleccionado);
    if (centro) renderPopupContent(centro);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detalleAbierto]);

  function aplicarVisibilidadRaster(map: maplibregl.Map, base: BaseMapa) {
    const visibles = new Set(VISIBILIDAD_BASE[base] ?? []);
    for (const capa of CAPAS_BASE) {
      if (!map.getLayer(capa)) continue;
      map.setLayoutProperty(capa, "visibility", visibles.has(capa) ? "visible" : "none");
    }
  }

  function aplicarBase() {
    const map = mapRef.current;
    if (!map || !listoRef.current) return;
    const base = baseEfectivaRef.current;
    const con3d = modo3dRef.current;

    if (esBaseEstiloExterno(base)) {
      if (modoEstiloRef.current === "dark-matter") {
        aplicarEdificios3d(map, con3d);
        sincronizarPitch3d(map, con3d);
        aplicarProyeccionGlobo(map, modoGloboRef.current);
        return;
      }
      const gen = ++generacionEstiloRef.current;
      modoEstiloRef.current = "dark-matter";
      map.setStyle(estiloMapaParaBase(base));
      map.once("style.load", () => {
        if (generacionEstiloRef.current !== gen || !mapRef.current) return;
        aplicarEdificios3d(mapRef.current, modo3dRef.current);
        sincronizarPitch3d(mapRef.current, modo3dRef.current);
        // setStyle resetea la proyección: hay que reponer el globo.
        aplicarProyeccionGlobo(mapRef.current, modoGloboRef.current);
      });
      return;
    }

    if (modoEstiloRef.current === "dark-matter") {
      const gen = ++generacionEstiloRef.current;
      const baseObjetivo = base;
      modoEstiloRef.current = "raster";
      map.setStyle(estiloMapaParaBase(baseObjetivo));
      map.once("style.load", () => {
        if (generacionEstiloRef.current !== gen || !mapRef.current) return;
        // Refuerzo: por si el estilo llegó sin la visibilidad esperada.
        aplicarVisibilidadRaster(mapRef.current, baseObjetivo);
        if (mapRef.current.getPitch() > 0 || mapRef.current.getBearing() !== 0) {
          mapRef.current.easeTo({ pitch: 0, bearing: 0, duration: 600 });
        }
        aplicarProyeccionGlobo(mapRef.current, modoGloboRef.current);
      });
      return;
    }

    aplicarVisibilidadRaster(map, base);
    aplicarProyeccionGlobo(map, modoGloboRef.current);
  }

  /** Proyección esfera de MapLibre (funciona con Carto Dark y con raster/sat). */
  function aplicarProyeccionGlobo(map: maplibregl.Map, activo: boolean) {
    // Mientras dura la intro (órbita → Caracas), no dejar que un setStyle quite el globo.
    const usarGlobo = introEnCursoRef.current ? true : activo;
    map.setMinZoom(usarGlobo ? 0 : 3);
    const tipoActual = map.getProjection()?.type;
    const tipoObjetivo = usarGlobo ? "globe" : "mercator";
    if (tipoActual === tipoObjetivo) return;
    map.setProjection({ type: tipoObjetivo });
  }

  function sincronizarPitch3d(map: maplibregl.Map, con3d: boolean) {
    // El flyTo de intro lleva el pitch final; no pelear con easeTo aquí.
    if (introEnCursoRef.current) return;
    if (con3d) {
      if (map.getPitch() < 30) {
        map.easeTo({ pitch: 45, duration: 800 });
      }
      return;
    }
    if (map.getPitch() > 0 || map.getBearing() !== 0) {
      map.easeTo({ pitch: 0, bearing: 0, duration: 600 });
    }
  }

  useEffect(() => {
    aplicarBase();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseMapa, baseSesion, modo3d]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !listoRef.current) return;
    aplicarProyeccionGlobo(map, modoGlobo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modoGlobo]);

  async function exportarImagen(nombreArchivo: string) {
    const contenedor = contenedorRef.current?.parentElement;
    const map = mapRef.current;
    if (!contenedor || !map) throw new Error("El mapa no está listo.");

    map.triggerRepaint();
    await new Promise<void>((resolve) => map.once("idle", () => resolve()));

    const chrome = contenedor.querySelectorAll<HTMLElement>(
      ".maplibregl-control-container, .maplibregl-popup, .map-controls-overlay",
    );
    const previos = Array.from(chrome).map((el) => el.style.display);
    chrome.forEach((el) => (el.style.display = "none"));

    try {
      const dataUrl = await toPng(contenedor, {
        pixelRatio: 3,
        cacheBust: true,
        backgroundColor: "#0b1220",
      });
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = nombreArchivo;
      a.click();
    } finally {
      chrome.forEach((el, i) => (el.style.display = previos[i]));
    }
  }

  useImperativeHandle(ref, () => ({
    exportarImagen,
    centrarCaracas,
    activarGps: alternarGps,
  }));

  return (
    <div className="relative h-full w-full">
      <div ref={contenedorRef} className="h-full w-full" />
      {avisoFallback && (
        <AvisoFallbackBaseMapa
          info={avisoFallback}
          reintentando={reintentandoCarto}
          onReintentar={() => void reintentarCarto()}
          onCerrar={() => setAvisoFallback(null)}
        />
      )}
      <SelectoresVistaMapa
        baseMapa={baseEfectiva}
        modo3d={modo3d}
        onCambiarBase={manejarCambiarBase}
        onCambiarModo3d={setModo3d}
        reglaEscala={reglaEscala}
      />
      <ControlesMapaCentros
        gpsActivo={gpsActivo}
        exportando={exportando}
        baseMapa={baseEfectiva}
        onCambiarBase={manejarCambiarBase}
        onGps={alternarGps}
        onCentrarCaracas={centrarCaracas}
        onExportar={onExportar}
        vistaMarcadores={{
          modoMarcador,
          onCambiarModo: onCambiarModoMarcador,
          mostrarParte: mostrarParteMarcador,
          onCambiarMostrarParte: onCambiarMostrarParteMarcador,
          mostrarLeyenda,
          onCambiarMostrarLeyenda,
          mostrarCintaTotales,
          onCambiarMostrarCintaTotales,
          colorearPorUnidad,
          onCambiarColorearPorUnidad,
          modoGlobo,
          onCambiarModoGlobo: setModoGlobo,
        }}
      />
      <LogoMini
        variant="minimo"
        position="bottom-left"
        onClick={centrarCaracas}
        className="hidden md:flex"
      />
      {modoMarcador === "color" && mostrarLeyenda && (
        <LeyendaUnidadesSebin
          unidadesPresentes={unidadesPresentes}
          unidadesFiltro={unidadesFiltro}
          onAlternarUnidad={onAlternarUnidadFiltro}
          onLimpiarFiltro={onLimpiarUnidadesFiltro}
          onMinimizar={() => onCambiarMostrarLeyenda(false)}
        />
      )}
    </div>
  );
});
