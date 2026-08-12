// Vista completa de un campamento (`/centro/:id`): segmentada por pestañas
// (Resumen, Coordinación, Población, Censo, Reporte, Seguimiento, Infraestructura, Buzón).
// La navegación entre secciones es solo por tabs; el sidebar queda a nivel red
// (Campamentos / Partes del día / …).
// El reporte diario se abre integrado en el mismo marco.
// Vive dentro del AppShell global, con sidebar y TopBar compartidos.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  ClipboardCheck,
  Home,
  LayoutGrid,
  SearchX,
  UserPlus,
} from "lucide-react";
import { useAlojamientosCentro } from "@/data/useAlojamientosCentro";
import { RefugiadoForm } from "@/features/refugiados/RefugiadoForm";
import { FichaRefugiadoView } from "@/features/refugiados/FichaRefugiadoView";
import { useSupabaseQueryConEstado } from "@/data/useSupabaseQuery";
import { FichaCentroSkeleton } from "./FichaCentroSkeleton";
import { claveDia, guardarCentro } from "@/data/reposSupabase";
import { useOcupacionesCentros } from "@/data/useOcupacionesCentros";
import { useReportesCentros } from "@/data/useReportesCentros";
import { useReportesControlDia } from "@/data/useReportesControlDia";
import { useEventosReportes } from "@/data/useEventosReportes";
import { desenvolver, type FilaSync } from "@/data/desenvolver";
import type { Sesion } from "@/data/authSupabase";
import {
  SECCIONES_FICHA_TERRENO,
  esRolTerreno,
  puedeCrearCentros,
  puedeEditarCentro,
  puedeEditarReportesPasados,
  puedeVerBuzonCentro,
  puedeVerCensoCentro,
  centrosEnAlcanceUsuario,
} from "@/domain/permisos";
import { aplicarPartesActualesACentros } from "@/domain/parteActualCentros";
import { controlReportado, reporteControlDelDia } from "@/domain/controlReporte";
import {
  estadoReporteDia,
  eventosRevisados,
  estadosReportePorDia,
  META_ESTADO_REPORTE,
  reporteDelDia,
  ultimosDiasReporte,
  type EstadoReporteDia,
} from "@/domain/reporteDiario";
import type { CentroTransitorio } from "@/domain/centrosTransitorios";
import { esCentroDePrueba } from "@/domain/centrosTransitorios";
import { ANCHO_VISTA_PRINCIPAL, MarcoVista } from "@/components/VistaContenedor";
import { VistaEncabezado } from "@/components/VistaEncabezado";
import { BadgePruebaCentro } from "@/components/BadgePruebaCentro";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  BadgesEstadoCentro,
} from "./DetalleCentro";
import { CoordinacionCentroPanel } from "./CoordinacionCentroPanel";
import { PoblacionCentroPanel } from "./PoblacionCentroPanel";
import { ResumenCentroPanel } from "./ResumenCentroPanel";
import { SeccionReporteDiarioCentro, BadgeEstadoReporte } from "./ReporteDiarioCentro";
import { BotonCopiarReporteTelegram } from "./BotonCopiarReporteTelegram";
import { SeccionSeguimientoReportesCentro } from "./SeguimientoReportesCentro";
import { InfraestructuraCapacidadPanel } from "./InfraestructuraCapacidadPanel";
import { BuzonCentroPanel } from "./BuzonCentroPanel";
import {
  SECCIONES_FICHA_CENTRO,
  normalizarSeccionFichaCentro,
  type SeccionFichaCentro,
} from "./seccionesFichaCentro";
import { CensoCentroPanel } from "@/features/censo/CensoCentroPanel";
import { cn } from "@/lib/utils";
import { ReporteDiarioForm } from "./ReporteDiarioForm";
import { VisorFechaReporte } from "./VisorFechaReporte";
import { BotonEditarSeccion } from "./EdicionSeccionCentro";
import { DialogoEdicionNombreCentro } from "./DialogoEdicionNombreCentro";
import {
  DialogoEdicionUbicacionCentro,
  type UbicacionCentroEdit,
} from "./DialogoEdicionUbicacionCentro";

interface Props {
  sesion: Sesion;
}

function diaDesdeParam(param: string | null, hoy: string): string {
  if (param && /^\d{4}-\d{2}-\d{2}$/.test(param) && param <= hoy) return param;
  return hoy;
}

/** Vuelve al menú del portal /terreno (inicio del operador del QR). */
function BotonVolverInicioTerreno({
  onClick,
  className,
}: {
  onClick: () => void;
  className?: string;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className={cn(
        "h-9 shrink-0 gap-1.5 border-border bg-card px-3 text-foreground shadow-sm",
        "hover:bg-muted hover:text-foreground",
        "dark:border-border dark:bg-card dark:shadow-md",
        className,
      )}
      onClick={onClick}
      aria-label="Volver al inicio del portal de terreno"
      title="Volver al inicio"
    >
      <Home className="size-3.5" aria-hidden />
      <span className="hidden sm:inline">Volver al inicio</span>
      <span className="sm:hidden">Inicio</span>
    </Button>
  );
}

/** Ficha completa de un campamento transitorio. */
export function FichaCentroView({ sesion }: Props) {
  const { id: idParam, centroId: centroIdParam } = useParams<{ id?: string; centroId?: string }>();
  const id = centroIdParam ?? idParam;
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const seccionParam = searchParams.get("vista");
  // Sesión del QR de terreno: la ficha se reduce a sus pestañas operativas
  // (resumen, población, reporte, infraestructura). Una vista oculta en la
  // URL cae al reporte. «Censo» para roles de red y para el supervisor en
  // sus campamentos asignados.
  const esTerreno = esRolTerreno(sesion.user.rol);
  const veCensoFicha = id != null && puedeVerCensoCentro(sesion.user, id);
  const veBuzonFicha = id != null && puedeVerBuzonCentro(sesion.user, id);
  const seccionesVisibles = useMemo(
    () =>
      SECCIONES_FICHA_CENTRO.filter((s) => {
        if (esTerreno && !(SECCIONES_FICHA_TERRENO as readonly string[]).includes(s.id)) {
          return false;
        }
        if (s.id === "censo_rapido" && !veCensoFicha) return false;
        if (s.id === "buzon" && !veBuzonFicha) return false;
        return true;
      }),
    [esTerreno, veCensoFicha, veBuzonFicha],
  );
  const seccionNormalizada = normalizarSeccionFichaCentro(seccionParam);
  const seccionActiva: SeccionFichaCentro = seccionesVisibles.some(
    (s) => s.id === seccionNormalizada,
  )
    ? seccionNormalizada
    : "reporte";
  const modoReporte = searchParams.get("reportar") === "1";
  const modoRegistrar = searchParams.get("registrar") === "1";
  const refugiadoId = searchParams.get("refugiado");
  // Entrada desde /terreno (sesión operador del QR): formularios con retorno
  // al resumen de la ficha y acceso explícito al portal.
  const reporteSoloTerreno = esTerreno && modoReporte;

  const hoyClave = useMemo(() => claveDia(Date.now()), []);
  const [diaReporte, setDiaReporte] = useState(() =>
    diaDesdeParam(searchParams.get("dia"), hoyClave),
  );
  const [editandoNombre, setEditandoNombre] = useState(false);
  const [guardandoNombre, setGuardandoNombre] = useState(false);
  const [errorNombre, setErrorNombre] = useState<string | null>(null);
  /** Nombre local tras guardar: no esperar Realtime para actualizar el título. */
  const [nombreLocal, setNombreLocal] = useState<string | null>(null);
  const [editandoUbicacion, setEditandoUbicacion] = useState(false);
  const [guardandoUbicacion, setGuardandoUbicacion] = useState(false);
  const [errorUbicacion, setErrorUbicacion] = useState<string | null>(null);
  /** Ubicación local tras guardar: no esperar Realtime para el texto del resumen. */
  const [ubicacionLocal, setUbicacionLocal] = useState<UbicacionCentroEdit | null>(null);
  /** Progreso del formulario integrado (evita badge stale hasta que llegue Realtime). */
  const [progresoFormulario, setProgresoFormulario] = useState<{
    completas: number;
    total: number;
    completo: boolean;
  } | null>(null);

  type CentroFila = CentroTransitorio & { deleted: boolean };
  const {
    datos: filasCentros,
    cargando: cargandoCentros,
  } = useSupabaseQueryConEstado<CentroFila, FilaSync<CentroTransitorio>>(
    "centros",
    {
      transform: desenvolver as (raw: FilaSync<CentroTransitorio>) => CentroFila,
      clientFilter: (c) => !c.deleted,
    },
  );
  const centrosBase = useMemo(
    () =>
      centrosEnAlcanceUsuario(
        [...filasCentros].sort((a, b) => (a.nro ?? 0) - (b.nro ?? 0)),
        sesion.user,
      ),
    [filasCentros, sesion.user],
  );
  const snapshotsOcupacion = useOcupacionesCentros();
  const centros = useMemo(
    () => aplicarPartesActualesACentros(centrosBase, snapshotsOcupacion),
    [centrosBase, snapshotsOcupacion],
  );

  const centro = useMemo(
    () => centros.find((c) => c.id === id) ?? null,
    [centros, id],
  );

  useEffect(() => {
    setNombreLocal(null);
    setUbicacionLocal(null);
  }, [centro?.id]);

  useEffect(() => {
    if (!centro || nombreLocal == null) return;
    if (centro.nombre === nombreLocal) setNombreLocal(null);
  }, [centro, nombreLocal]);

  useEffect(() => {
    if (!centro || ubicacionLocal == null) return;
    const geomLocal = ubicacionLocal.geom;
    const geomCentro = centro.geom ?? null;
    const mismaGeom =
      (geomLocal == null && geomCentro == null) ||
      (geomLocal != null &&
        geomCentro != null &&
        geomLocal.coordinates[0] === geomCentro.coordinates[0] &&
        geomLocal.coordinates[1] === geomCentro.coordinates[1]);
    if (
      (centro.estado_federativo ?? "") === ubicacionLocal.estado_federativo &&
      (centro.municipio ?? "") === ubicacionLocal.municipio &&
      (centro.parroquia ?? "") === ubicacionLocal.parroquia &&
      (centro.direccion ?? "").trim() === ubicacionLocal.direccion &&
      (centro.mapsUrl ?? "").trim() === ubicacionLocal.mapsUrl &&
      mismaGeom
    ) {
      setUbicacionLocal(null);
    }
  }, [centro, ubicacionLocal]);

  const puedeEditar = centro != null && puedeEditarCentro(sesion.user, centro.id);
  const puedeEditarPasado = puedeEditarReportesPasados(sesion.user);
  const puedeEliminar = puedeCrearCentros(sesion.user);

  const reportesHoy = useReportesCentros({
    centroId: centro?.id,
    dia: hoyClave,
  });
  const controlesHoy = useReportesControlDia({
    centroId: centro?.id,
    dia: hoyClave,
  });
  const { eventos: eventosHoy } = useEventosReportes({
    centroId: centro?.id,
    dia: hoyClave,
  });
  const snapshotsHoy = useMemo(
    () =>
      snapshotsOcupacion.filter(
        (snapshot) => snapshot.centro_id === centro?.id && snapshot.dia >= hoyClave,
      ),
    [snapshotsOcupacion, centro?.id, hoyClave],
  );
  const hoyEstado = useMemo(() => {
    if (!centro) return "pendiente" as const;
    const reporte = reporteDelDia(reportesHoy, centro.id, hoyClave);
    const parte = snapshotsHoy.some((s) => s.dia === hoyClave);
    const control = reporteControlDelDia(controlesHoy, centro.id, hoyClave);
    return estadoReporteDia(reporte, parte, {
      saludReportada:
        reporte?.salud_reportada === true ||
        snapshotsHoy.some((s) => s.dia === hoyClave && (s.incidencias_salud ?? 0) > 0),
      controlRevisado: controlReportado(control),
      trabajosRevisados: reporte?.trabajos_revisados ?? false,
      requerimientosRevisados: reporte?.requerimientos_revisados ?? false,
      eventosRevisados: eventosRevisados(reporte, eventosHoy.length),
    });
  }, [centro, reportesHoy, controlesHoy, eventosHoy, snapshotsHoy, hoyClave]);

  const desdeMarcas = useMemo(() => ultimosDiasReporte(30, hoyClave)[0], [hoyClave]);
  const reportesMarcas = useReportesCentros({ centroId: centro?.id, desde: desdeMarcas });
  const controlesMarcas = useReportesControlDia({ centroId: centro?.id, desde: desdeMarcas });
  const { eventos: eventosMarcas } = useEventosReportes({ centroId: centro?.id, desde: desdeMarcas });
  const snapshotsMarcas = useOcupacionesCentros({ centroId: centro?.id, desde: desdeMarcas });

  const marcasPorDia = useMemo(() => {
    const diasConParte = new Set(snapshotsMarcas.map((s) => s.dia));
    const diasConControl = new Set(
      controlesMarcas.filter((c) => c.revisado).map((c) => c.dia),
    );
    const diasConTrabajos = new Set(
      reportesMarcas.filter((r) => r.trabajos_revisados).map((r) => r.dia),
    );
    const diasConRequerimientos = new Set(
      reportesMarcas.filter((r) => r.requerimientos_revisados).map((r) => r.dia),
    );
    const eventosPorDia = new Map<string, number>();
    for (const evento of eventosMarcas) {
      eventosPorDia.set(evento.dia, (eventosPorDia.get(evento.dia) ?? 0) + 1);
    }
    const estados = estadosReportePorDia(reportesMarcas, diasConParte, {
      diasConControl,
      diasConTrabajos,
      diasConRequerimientos,
      eventosPorDia,
    });
    const m = new Map<string, string>();
    for (const [dia, estado] of estados) {
      if (estado !== "pendiente") m.set(dia, META_ESTADO_REPORTE[estado].color);
    }
    return m;
  }, [reportesMarcas, snapshotsMarcas, controlesMarcas, eventosMarcas]);

  const leyendaCalendario = useMemo(
    () =>
      (Object.keys(META_ESTADO_REPORTE) as EstadoReporteDia[]).map((e) => ({
        color: META_ESTADO_REPORTE[e].color,
        label: META_ESTADO_REPORTE[e].label,
      })),
    [],
  );

  const reportesDiaReporte = useReportesCentros({ centroId: centro?.id, dia: diaReporte });
  const controlesDiaReporte = useReportesControlDia({ centroId: centro?.id, dia: diaReporte });
  const { eventos: eventosDiaReporte } = useEventosReportes({ centroId: centro?.id, dia: diaReporte });
  const snapshotsDiaReporte = useMemo(
    () => snapshotsMarcas.filter((s) => s.dia === diaReporte),
    [snapshotsMarcas, diaReporte],
  );
  useEffect(() => {
    setProgresoFormulario(null);
  }, [centro?.id, diaReporte, modoReporte]);

  const onProgresoFormulario = useCallback(
    (p: { completas: number; total: number; completo: boolean }) => {
      setProgresoFormulario((prev) => {
        if (
          prev &&
          prev.completas === p.completas &&
          prev.total === p.total &&
          prev.completo === p.completo
        ) {
          return prev;
        }
        return p;
      });
    },
    [],
  );

  const estadoDiaReporte = useMemo(() => {
    if (!centro) return "pendiente" as const;
    if (modoReporte && progresoFormulario?.completo) return "completo" as const;
    if (modoReporte && progresoFormulario && progresoFormulario.completas > 0) {
      // Mientras el form tiene avance local, no mostrar "pendiente" stale.
      if (progresoFormulario.completas === progresoFormulario.total) return "completo" as const;
      if (progresoFormulario.completas === 1 && snapshotsDiaReporte.some((s) => s.dia === diaReporte)) {
        return "solo_parte" as const;
      }
      return "parcial" as const;
    }
    const reporte = reporteDelDia(reportesDiaReporte, centro.id, diaReporte);
    const parte = snapshotsDiaReporte.some((s) => s.dia === diaReporte);
    const control = reporteControlDelDia(controlesDiaReporte, centro.id, diaReporte);
    return estadoReporteDia(reporte, parte, {
      saludReportada:
        reporte?.salud_reportada === true ||
        snapshotsDiaReporte.some((s) => s.dia === diaReporte && (s.incidencias_salud ?? 0) > 0),
      controlRevisado: controlReportado(control),
      trabajosRevisados: reporte?.trabajos_revisados ?? false,
      requerimientosRevisados: reporte?.requerimientos_revisados ?? false,
      eventosRevisados: eventosRevisados(reporte, eventosDiaReporte.length),
    });
  }, [
    centro,
    reportesDiaReporte,
    controlesDiaReporte,
    eventosDiaReporte,
    snapshotsDiaReporte,
    diaReporte,
    modoReporte,
    progresoFormulario,
  ]);

  function cambiarDiaReporte(nuevoDia: string) {
    let clamped = nuevoDia > hoyClave ? hoyClave : nuevoDia;
    // En el editor, sin permiso de fechas pasadas solo se admite hoy.
    if (modoReporte && !puedeEditarPasado) clamped = hoyClave;
    setDiaReporte(clamped);
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (clamped === hoyClave) next.delete("dia");
        else next.set("dia", clamped);
        return next;
      },
      { replace: true },
    );
  }

  function cambiarSeccion(vista: SeccionFichaCentro) {
    setSearchParams(vista === "resumen" ? {} : { vista }, { replace: true });
  }

  function abrirReporte(fase?: string) {
    const next = new URLSearchParams({ vista: "reporte", reportar: "1" });
    // Solo admin/analista SAE pueden abrir el editor de un día pasado.
    if (puedeEditarPasado && diaReporte !== hoyClave) next.set("dia", diaReporte);
    if (fase) next.set("fase", fase);
    setSearchParams(next, { replace: true });
  }

  async function guardarNombreCentro(nombre: string) {
    if (!centro) return;
    setGuardandoNombre(true);
    setErrorNombre(null);
    try {
      await guardarCentro({ ...centro, nombre });
      setNombreLocal(nombre);
      setEditandoNombre(false);
    } catch (err) {
      setErrorNombre(
        err instanceof Error ? err.message : "No se pudo guardar el nombre.",
      );
    } finally {
      setGuardandoNombre(false);
    }
  }

  async function guardarUbicacionCentro(ubicacion: UbicacionCentroEdit) {
    if (!centro) return;
    setGuardandoUbicacion(true);
    setErrorUbicacion(null);
    try {
      await guardarCentro({
        ...centro,
        estado_federativo: ubicacion.estado_federativo,
        municipio: ubicacion.municipio,
        parroquia: ubicacion.parroquia,
        direccion: ubicacion.direccion,
        mapsUrl: ubicacion.mapsUrl,
        geom: ubicacion.geom,
      });
      setUbicacionLocal(ubicacion);
      setEditandoUbicacion(false);
    } catch (err) {
      setErrorUbicacion(
        err instanceof Error ? err.message : "No se pudo guardar la ubicación.",
      );
    } finally {
      setGuardandoUbicacion(false);
    }
  }

  function volverPortalTerreno() {
    // Cutover: sin portal QR; el operador vuelve a reportes.
    navigate("/centros/reportes");
  }

  function cerrarReporte() {
    // Tras editar, volver al resumen del reporte (donde está «COPIAR REPORTE»).
    // El retorno al portal de terreno es explícito vía volverPortalTerreno.
    setSearchParams({ vista: "reporte" }, { replace: true });
  }

  function volverPoblacion() {
    setSearchParams({ vista: "poblacion" }, { replace: true });
  }

  function abrirFichaRefugiado(id: string) {
    setSearchParams({ vista: "poblacion", refugiado: id }, { replace: true });
  }

  const { familias: familiasCentro } = useAlojamientosCentro({
    centroId: centro?.id ?? "",
  });
  const nombresCentros = useMemo(
    () => new Map(centros.map((c) => [c.id, c.nombre || c.id])),
    [centros],
  );

  // Sincronizar día del reporte con ?dia= en pestaña Reporte o modo formulario.
  useEffect(() => {
    if (seccionActiva !== "reporte" && !modoReporte) return;
    const diaUrl = diaDesdeParam(searchParams.get("dia"), hoyClave);
    // Editor sin permiso de pasado: forzar hoy (pueden ver historial en la
    // pestaña Reporte, pero no abrir el formulario de un día anterior).
    if (modoReporte && !puedeEditarPasado && diaUrl !== hoyClave) {
      setDiaReporte(hoyClave);
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.delete("dia");
          return next;
        },
        { replace: true },
      );
      return;
    }
    setDiaReporte(diaUrl);
  }, [
    seccionActiva,
    modoReporte,
    searchParams,
    hoyClave,
    puedeEditarPasado,
    setSearchParams,
  ]);

  // Redirigir ?vista=capacidad (URL antigua) a la pestaña unificada.
  useEffect(() => {
    if (seccionParam === "capacidad") {
      setSearchParams({ vista: "infraestructura" }, { replace: true });
    }
  }, [seccionParam, setSearchParams]);

  // ?editar=1 apuntaba al CentroForm completo; ahora la asignación vive en Coordinación.
  useEffect(() => {
    if (searchParams.get("editar") === "1") {
      setSearchParams({ vista: "coordinacion" }, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  // Operador de terreno: aterriza en la ficha (pestaña Reporte) para ver el
  // resumen y «COPIAR REPORTE»; el formulario se abre con «Editar reporte».
  // (Antes se forzaba ?reportar=1 y no veían el botón de copiar.)

  // Si no puede editar, no mantener modos de edición en la URL.
  useEffect(() => {
    if (centro && !puedeEditar) {
      if (modoReporte && !esTerreno) cerrarReporte();
      if (modoRegistrar) volverPoblacion();
    }
  }, [modoReporte, modoRegistrar, centro, puedeEditar, esTerreno]);

  if (!centro) {
    if (cargandoCentros) {
      return <FichaCentroSkeleton />;
    }
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-background px-6 text-center text-foreground">
        <SearchX className="size-8 text-muted-foreground" />
        <p className="text-sm font-semibold">Campamento no encontrado</p>
        <p className="text-xs text-muted-foreground">
          El campamento solicitado no existe o fue eliminado de la red.
        </p>
        <Button variant="outline" size="sm" onClick={() => navigate("/centros/mapa")}>
          Ir al mapa
        </Button>
      </div>
    );
  }

  const nombreMostrado = nombreLocal ?? centro.nombre;
  const centroMostrado =
    !ubicacionLocal && nombreLocal == null
      ? centro
      : {
          ...centro,
          ...(nombreLocal != null ? { nombre: nombreLocal } : {}),
          ...(ubicacionLocal ?? {}),
        };
  const titulo = `${centro.nro != null ? `N.° ${centro.nro} · ` : ""}${nombreMostrado}`;
  const etiquetaBotonReporte =
    hoyEstado === "pendiente" ? "Reportar hoy" : "Editar reporte de hoy";
  const esReporteTab = seccionActiva === "reporte";
  const esHoyReporte = diaReporte === hoyClave;
  const parteDiaReporte = snapshotsDiaReporte.length > 0;

  if (refugiadoId && centro) {
    return (
      <FichaRefugiadoView
        alojamientoId={refugiadoId}
        puedeEditar={puedeEditar}
        onVolver={volverPoblacion}
        onAbrirMiembro={abrirFichaRefugiado}
      />
    );
  }

  if (modoRegistrar && puedeEditar && centro) {
    return (
      <MarcoVista
        ancho={ANCHO_VISTA_PRINCIPAL}
        rellenarAltura
        className="overflow-hidden"
        marcoClassName="flex min-h-0 flex-col text-foreground"
      >
        <VistaEncabezado
          icono={UserPlus}
          acento="emerald"
          titulo="Registrar persona"
          descripcion={`Registro nominal · ${titulo}`}
          acciones={
            <Button
              variant="outline"
              size="sm"
              className="h-8 shrink-0 gap-1.5 px-2"
              onClick={volverPoblacion}
            >
              <ArrowLeft className="size-3.5" />
              <span className="hidden sm:inline">Volver a Población</span>
              <span className="sm:hidden">Volver</span>
            </Button>
          }
        />
        <RefugiadoForm
          centroId={centro.id}
          familias={familiasCentro}
          nombresCentros={nombresCentros}
          onCancelar={volverPoblacion}
          onRegistrado={abrirFichaRefugiado}
        />
      </MarcoVista>
    );
  }

  if (modoReporte && puedeEditar && (esHoyReporte || puedeEditarPasado)) {
    return (
      <MarcoVista
        ancho={ANCHO_VISTA_PRINCIPAL}
        rellenarAltura
        className="overflow-hidden p-1.5 sm:p-4 lg:p-6"
        marcoClassName="flex min-h-0 flex-col text-foreground"
      >
        <header className="shrink-0 border-b border-border/70 px-2.5 py-2 sm:px-4 sm:py-3 lg:px-6">
          <div className="flex items-center gap-1.5 sm:gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-7 shrink-0 gap-1 px-2 sm:h-8 sm:gap-1.5 sm:px-2.5"
              onClick={cerrarReporte}
              aria-label={reporteSoloTerreno ? "Volver al resumen del reporte" : "Volver a la ficha"}
            >
              <ArrowLeft className="size-3.5" />
              <span className="hidden sm:inline">
                {reporteSoloTerreno ? "Volver al resumen" : "Volver a la ficha"}
              </span>
              <span className="sm:hidden">Volver</span>
            </Button>
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-sm font-semibold leading-tight">Reporte del día</h1>
              <p className="truncate text-[10px] leading-tight text-muted-foreground sm:text-xs">
                {titulo}
              </p>
            </div>
            {reporteSoloTerreno && (
              <BotonVolverInicioTerreno
                className="h-7 sm:h-8"
                onClick={volverPortalTerreno}
              />
            )}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 sm:mt-2 sm:gap-2">
            <VisorFechaReporte
              dia={diaReporte}
              onDiaChange={cambiarDiaReporte}
              hoyClave={hoyClave}
              marcasPorDia={marcasPorDia}
              leyenda={leyendaCalendario}
              compacto
              soloHoy={!puedeEditarPasado}
              className="h-8 min-w-0 flex-1 basis-[11rem] sm:max-w-[13.5rem] sm:flex-none sm:basis-auto"
            />
            <BadgeEstadoReporte estado={estadoDiaReporte} destacado />
            <BotonCopiarReporteTelegram
              centro={centro}
              dia={diaReporte}
              className="h-8 min-w-0 flex-1 basis-full justify-center px-2.5 sm:flex-none sm:basis-auto"
            />
          </div>
        </header>
        <ReporteDiarioForm
          key={diaReporte}
          centro={centro}
          variant="integrado"
          diaReporte={diaReporte}
          faseInicial={searchParams.get("fase") ?? undefined}
          onCerrar={cerrarReporte}
          ocultarCerrar={false}
          etiquetaCerrar={reporteSoloTerreno ? "Volver al resumen" : "Cerrar"}
          permitirDiaPasado={puedeEditarPasado}
          onProgresoChange={onProgresoFormulario}
        />
      </MarcoVista>
    );
  }

  return (
    <MarcoVista
      ancho={ANCHO_VISTA_PRINCIPAL}
      rellenarAltura
      className="overflow-hidden"
      marcoClassName="flex min-h-0 flex-col text-foreground"
    >
      <VistaEncabezado
        icono={LayoutGrid}
        acento="sky"
        titulo={titulo}
        tituloExtra={
          <>
            {esCentroDePrueba(centro) ? <BadgePruebaCentro /> : null}
            {puedeEditar ? (
              <BotonEditarSeccion
                titulo="Editar nombre del campamento"
                onClick={() => {
                  setErrorNombre(null);
                  setEditandoNombre(true);
                }}
              />
            ) : null}
          </>
        }
        descripcion={centro.parroquia || "Ficha del campamento en la red"}
        acciones={
          esReporteTab ? (
            <>
              <div className="hidden sm:block">
                <VisorFechaReporte
                  dia={diaReporte}
                  onDiaChange={cambiarDiaReporte}
                  hoyClave={hoyClave}
                  marcasPorDia={marcasPorDia}
                  leyenda={leyendaCalendario}
                  compacto
                />
              </div>
              {/* En móvil el badge baja a la fila de la fecha (debajo) para no
                  aplastar el nombre del campamento. */}
              <div className="hidden sm:block">
                <BadgeEstadoReporte estado={estadoDiaReporte} destacado />
              </div>
              {puedeEditar && (esHoyReporte || puedeEditarPasado) && (
                <Button
                  size="sm"
                  className="h-9 shrink-0 gap-1.5 bg-teal-600 px-3 hover:bg-teal-500"
                  onClick={() => abrirReporte()}
                >
                  <ClipboardCheck className="size-4" />
                  <span className="hidden sm:inline">
                    {!esHoyReporte
                      ? "Editar este día"
                      : estadoDiaReporte === "pendiente" && !parteDiaReporte
                        ? "Reportar hoy"
                        : "Editar reporte"}
                  </span>
                  <span className="sm:hidden">Reporte</span>
                </Button>
              )}
              {esTerreno && (
                <BotonVolverInicioTerreno onClick={volverPortalTerreno} />
              )}
            </>
          ) : (
            <>
              <div className="hidden shrink-0 sm:block">
                <BadgesEstadoCentro centro={centro} puedeEditar={puedeEditar} />
              </div>
              {puedeEditar && hoyEstado !== "completo" && (
                <Button
                  size="sm"
                  className="h-9 shrink-0 gap-1.5 bg-teal-600 px-3 hover:bg-teal-500"
                  onClick={() => abrirReporte()}
                >
                  <ClipboardCheck className="size-4" />
                  <span className="hidden sm:inline">{etiquetaBotonReporte}</span>
                  <span className="sm:hidden">Reporte</span>
                </Button>
              )}
              {esTerreno && (
                <BotonVolverInicioTerreno onClick={volverPortalTerreno} />
              )}
            </>
          )
        }
        debajo={
          esReporteTab ? (
            <div className="flex items-center gap-2 sm:hidden">
              <VisorFechaReporte
                dia={diaReporte}
                onDiaChange={cambiarDiaReporte}
                hoyClave={hoyClave}
                marcasPorDia={marcasPorDia}
                leyenda={leyendaCalendario}
                compacto
                className="h-9 min-w-0 flex-1"
              />
              <BadgeEstadoReporte estado={estadoDiaReporte} destacado />
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2 sm:hidden">
              <BadgesEstadoCentro centro={centro} puedeEditar={puedeEditar} />
            </div>
          )
        }
      />

      {puedeEditar && (
        <DialogoEdicionNombreCentro
          abierto={editandoNombre}
          centro={{ ...centro, nombre: nombreMostrado }}
          guardando={guardandoNombre}
          error={errorNombre}
          onCerrar={() => {
            if (guardandoNombre) return;
            setEditandoNombre(false);
            setErrorNombre(null);
          }}
          onGuardar={(nombre) => void guardarNombreCentro(nombre)}
        />
      )}

      {puedeEditar && (
        <DialogoEdicionUbicacionCentro
          abierto={editandoUbicacion}
          centro={centroMostrado}
          guardando={guardandoUbicacion}
          error={errorUbicacion}
          onCerrar={() => {
            if (guardandoUbicacion) return;
            setEditandoUbicacion(false);
            setErrorUbicacion(null);
          }}
          onGuardar={(ubicacion) => void guardarUbicacionCentro(ubicacion)}
        />
      )}

      <Tabs
        value={seccionActiva}
        onValueChange={(v) => cambiarSeccion(v as SeccionFichaCentro)}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="h-[50px] shrink-0 border-b border-border bg-background/95 px-4 sm:px-6">
          <TabsList
            variant="line"
            className="!h-[50px] w-full justify-start gap-0 overflow-x-auto rounded-none bg-transparent p-0 align-middle [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {seccionesVisibles.map((s) => {
              const activa = s.id === seccionActiva;
              const reportePendiente =
                s.id === "reporte" && puedeEditar && hoyEstado !== "completo";

              return (
                <TabsTrigger
                  key={s.id}
                  value={s.id}
                  className={cn(
                    "relative shrink-0 rounded-none px-3 py-2.5 text-xs font-medium sm:text-sm",
                    "!h-full !border-x-transparent !border-t-transparent !border-b-2 !border-b-transparent !bg-transparent !shadow-none",
                    "text-muted-foreground transition-colors hover:text-foreground",
                    "after:!hidden after:!content-none",
                    "data-active:!border-x-transparent data-active:!border-t-transparent data-active:!border-b-primary",
                    "data-active:!bg-transparent data-active:!font-semibold data-active:!text-teal-300 data-active:!shadow-none",
                    "dark:data-active:!border-b-primary dark:data-active:!bg-transparent",
                    reportePendiente && !activa && "font-semibold text-teal-300/80",
                  )}
                >
                  {s.label}
                  {reportePendiente && (
                    <span className="ml-1.5 inline-block size-1.5 rounded-full bg-amber-400" />
                  )}
                </TabsTrigger>
              );
            })}
          </TabsList>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <div className="p-4 pb-[max(1rem,env(safe-area-inset-bottom))] lg:p-6">
            <TabsContent value="resumen" className="mt-0">
              <ResumenCentroPanel
                centro={centroMostrado}
                puedeEditar={puedeEditar}
                puedeEliminar={puedeEliminar}
                onIrAPestana={(vista) => cambiarSeccion(vista)}
                onEditarUbicacion={
                  puedeEditar
                    ? () => {
                        setErrorUbicacion(null);
                        setEditandoUbicacion(true);
                      }
                    : undefined
                }
                onEliminado={() => navigate("/centros/mapa")}
              />
            </TabsContent>

            <TabsContent value="coordinacion" className="mt-0">
              <CoordinacionCentroPanel centro={centro} puedeEditar={puedeEditar} />
            </TabsContent>

            <TabsContent value="poblacion" className="mt-0">
              <PoblacionCentroPanel
                centro={centro}
                puedeEditar={puedeEditar}
                onRegistrar={() =>
                  setSearchParams({ vista: "poblacion", registrar: "1" }, { replace: true })
                }
                onAbrirRefugiado={abrirFichaRefugiado}
              />
            </TabsContent>

            {veCensoFicha && (
              <TabsContent value="censo_rapido" className="mt-0">
                <CensoCentroPanel
                  centroId={centro.id}
                  centroNombre={centro.nombre}
                  centro={centro}
                  sesion={sesion}
                  onAbrirRefugiado={abrirFichaRefugiado}
                />
              </TabsContent>
            )}

            <TabsContent value="reporte" className="mt-0">
              <SeccionReporteDiarioCentro
                centro={centro}
                puedeEditar={puedeEditar}
                puedeEditarPasado={puedeEditarPasado}
                variant="expandido"
                onAbrirReporte={puedeEditar ? abrirReporte : undefined}
                diaSeleccionado={diaReporte}
                onDiaChange={cambiarDiaReporte}
                ocultarCabecera
              />
            </TabsContent>

            <TabsContent value="incidencias" className="mt-0">
              <SeccionSeguimientoReportesCentro
                centro={centro}
                puedeEditar={puedeEditar}
                variant="expandido"
                onIrAReporte={puedeEditar ? abrirReporte : undefined}
              />
            </TabsContent>

            <TabsContent value="infraestructura" className="mt-0">
              <InfraestructuraCapacidadPanel
                centro={centro}
                puedeEditar={puedeEditar}
                onIrAReporte={puedeEditar ? abrirReporte : undefined}
              />
            </TabsContent>

            {veBuzonFicha && (
              <TabsContent value="buzon" className="mt-0">
                <BuzonCentroPanel centro={centro} sesion={sesion} />
              </TabsContent>
            )}
          </div>
        </div>
      </Tabs>
    </MarcoVista>
  );
}
