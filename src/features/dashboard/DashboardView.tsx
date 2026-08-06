// Sala situacional 24/7 (pantalla ultrawide mural, SIN scroll en xl+):
// mapa izquierda + KPIs globales/por zona + cinta alertas + paneles plegables.

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeft,
  Building2,
  DoorOpen,
  HeartPulse,
  Home,
  PawPrint,
  Users,
  Utensils,
} from "lucide-react";
import { useSupabaseQuery } from "@/data/useSupabaseQuery";
import { useOcupacionesCentros } from "@/data/useOcupacionesCentros";
import { useCasosSaludCentros } from "@/data/useCasosSaludCentros";
import { useReportesCentros } from "@/data/useReportesCentros";
import { useEventosReportes } from "@/data/useEventosReportes";
import { useDenuncias } from "@/data/useDenuncias";
import { useCensoNominalRed } from "@/data/useCensoNominalRed";
import { useReportesControlDia } from "@/data/useReportesControlDia";
import { claveDia } from "@/data/reposSupabase";
import { desenvolver, type FilaSync } from "@/data/desenvolver";
import { aplicarPartesActualesACentros } from "@/domain/parteActualCentros";
import { contarAtenciones, racionesDelDia } from "@/domain/reporteDiario";
import {
  serieDiariaOcupacionRed,
  serieDiariaOcupacionRedVsAsignados,
  variacionUltimoDia,
} from "@/domain/serieOcupacionCentros";
import {
  centrosDeProduccion,
  idCentroEsPrueba,
  type CentroTransitorio,
} from "@/domain/centrosTransitorios";
import {
  centrosEnAlcanceUsuario,
  centrosVisiblesParaUsuario,
  idsCentrosResaltadosMapa,
} from "@/domain/permisos";
import {
  centrosDeZonaSala,
  demografiaRed,
  kpisPorZonaSala,
  kpisRedCentros,
  ZONAS_SALA,
  type ZonaSala,
} from "@/domain/redCentros";
import { casosSaludPendientes } from "@/domain/seguimientoReportes";
import type { Sesion } from "@/data/authSupabase";
import { useSupabaseConectado } from "@/data/useSupabaseConectado";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { MapaRedSala } from "./MapaRedSala";
import { KpisPorZonaSala } from "./KpisPorZonaSala";
import { PanelSalaPlegable, ResumenPlegadoSala } from "./PanelSalaPlegable";
import { GraficoOcupacionRed } from "./GraficoOcupacionRed";
import {
  FeedCasosSalud,
  FeedDenuncias,
  FeedNovedadesDiarias,
} from "./FeedsSala";
import {
  calcularFilasReportesSala,
  conteoReportesPendientes,
  PanelReportesSala,
} from "./PanelReportesSala";
import { PanelCensoSala, conteosCensoNominalSala } from "./PanelCensoSala";

type CentroFila = CentroTransitorio & { deleted: boolean };

function Reloj() {
  const [ahora, setAhora] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setAhora(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const fecha = ahora.toLocaleDateString("es", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  const hora = ahora.toLocaleTimeString("es", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  return (
    <div className="text-right">
      <div className="text-2xl font-bold tabular-nums text-foreground lg:text-3xl">
        {hora}
      </div>
      <div className="text-xs capitalize text-muted-foreground lg:text-sm">{fecha}</div>
    </div>
  );
}

/** Sala situacional proyectable: red agregada de Campamentos Transitorios. */
export function DashboardView({ sesion }: { sesion: Sesion }) {
  const navegar = useNavigate();
  const conectado = useSupabaseConectado();
  const [filtroZona, setFiltroZona] = useState<ZonaSala | null>(null);

  const filasCentros = useSupabaseQuery<CentroFila, FilaSync<CentroTransitorio>>(
    "centros",
    {
      transform: desenvolver as (raw: FilaSync<CentroTransitorio>) => CentroFila,
      clientFilter: (c) => !c.deleted,
    },
  );
  const snapshots = useOcupacionesCentros();
  const centrosRed = useMemo(
    () =>
      aplicarPartesActualesACentros(
        centrosVisiblesParaUsuario(
          [...filasCentros].sort((a, b) => (a.nro ?? 0) - (b.nro ?? 0)),
          sesion.user,
        ),
        snapshots,
      ),
    [filasCentros, snapshots, sesion.user],
  );
  /** KPIs, feeds y paneles: solo alcance operativo del rol. */
  const centros = useMemo(
    () => centrosEnAlcanceUsuario(centrosRed, sesion.user),
    [centrosRed, sesion.user],
  );
  const idsResaltadosAmbito = useMemo(
    () => idsCentrosResaltadosMapa(sesion.user),
    [sesion.user],
  );

  const centrosMapa = useMemo(
    () => centrosDeZonaSala(centrosRed, filtroZona),
    [centrosRed, filtroZona],
  );

  const kpis = useMemo(() => kpisRedCentros(centros), [centros]);
  const demografia = useMemo(() => demografiaRed(centros), [centros]);
  const kpisZona = useMemo(() => kpisPorZonaSala(centros), [centros]);

  const nombresCentros = useMemo(
    () =>
      new Map(
        centros.map((c) => [c.id, `N.° ${c.nro ?? "?"} · ${c.nombre}`] as const),
      ),
    [centros],
  );
  const idsVisibles = useMemo(() => new Set(centros.map((c) => c.id)), [centros]);

  const { casos: casosSalud } = useCasosSaludCentros({ soloActivos: true });
  const casosSaludProd = useMemo(
    () =>
      casosSalud.filter(
        (c) => !idCentroEsPrueba(c.centro_id) && idsVisibles.has(c.centro_id),
      ),
    [casosSalud, idsVisibles],
  );
  /** Abiertos: activo + en_proceso. Fuera: resuelto/archivado (histórico). */
  const casosPendientes = useMemo(
    () => casosSaludPendientes(casosSaludProd),
    [casosSaludProd],
  );
  const casosActivos = casosPendientes.length;

  const hoy = claveDia(Date.now());
  const reportesHoy = useReportesCentros({ dia: hoy });
  const controlesHoy = useReportesControlDia({ dia: hoy });
  const { eventos: eventosHoy } = useEventosReportes({ dia: hoy });
  const reportesHoyProd = useMemo(
    () => reportesHoy.filter((r) => !idCentroEsPrueba(r.centro_id)),
    [reportesHoy],
  );
  const controlesHoyProd = useMemo(
    () => controlesHoy.filter((c) => !idCentroEsPrueba(c.centro_id)),
    [controlesHoy],
  );
  const eventosHoyProd = useMemo(
    () => eventosHoy.filter((e) => !idCentroEsPrueba(e.centro_id)),
    [eventosHoy],
  );
  const racionesHoy = useMemo(
    () => reportesHoyProd.reduce((acc, r) => acc + racionesDelDia(r), 0),
    [reportesHoyProd],
  );
  const atencionesHoy = useMemo(
    () =>
      reportesHoyProd.reduce(
        (acc, r) =>
          acc + contarAtenciones(r.atenciones_medicas_detalle, r.atenciones_medicas),
        0,
      ),
    [reportesHoyProd],
  );
  const eventosPositivos = useMemo(
    () => eventosHoyProd.filter((e) => e.tipo === "positivo").length,
    [eventosHoyProd],
  );
  const eventosNegativos = eventosHoyProd.length - eventosPositivos;

  const denuncias = useDenuncias({ desde: hoy });
  const denunciasProd = useMemo(
    () => denuncias.filter((d) => !idCentroEsPrueba(d.centro_id) && idsVisibles.has(d.centro_id)),
    [denuncias, idsVisibles],
  );
  const denunciasAbiertas = useMemo(
    () => denunciasProd.filter((d) => d.estado === "abierta").length,
    [denunciasProd],
  );
  const denunciasResueltas = denunciasProd.length - denunciasAbiertas;

  const casosSaludActivo = useMemo(
    () => casosPendientes.filter((c) => c.estatus === "activo").length,
    [casosPendientes],
  );
  const casosSaludEnProceso = useMemo(
    () => casosPendientes.filter((c) => c.estatus === "en_proceso").length,
    [casosPendientes],
  );

  const { resumenes: resumenesCenso, cargando: cargandoCenso } =
    useCensoNominalRed();
  const resumenesCensoVisibles = useMemo(
    () => resumenesCenso.filter((r) => idsVisibles.has(r.centroId)),
    [resumenesCenso, idsVisibles],
  );
  const conteosCenso = useMemo(
    () => conteosCensoNominalSala(resumenesCensoVisibles),
    [resumenesCensoVisibles],
  );

  /** Resumen plegado del gráfico de ocupación (serie = red de producción). */
  const serieOcupacionRed = useMemo(() => {
    const centrosSerie = centrosDeProduccion(centrosRed).map((c) => ({
      id: c.id,
      grupo: c.grupo,
    }));
    return serieDiariaOcupacionRed(snapshots, centrosSerie);
  }, [centrosRed, snapshots]);
  const serieOcupacionComparativa = useMemo(() => {
    if (!idsResaltadosAmbito || idsResaltadosAmbito.size === 0) return [];
    const centrosSerie = centrosDeProduccion(centrosRed).map((c) => ({
      id: c.id,
      grupo: c.grupo,
    }));
    return serieDiariaOcupacionRedVsAsignados(
      snapshots,
      centrosSerie,
      idsResaltadosAmbito,
    );
  }, [centrosRed, snapshots, idsResaltadosAmbito]);
  const variacionOcupacion = useMemo(
    () => variacionUltimoDia(serieOcupacionRed),
    [serieOcupacionRed],
  );
  const ultimoOcupacion = serieOcupacionRed[serieOcupacionRed.length - 1];
  const ultimoComparativa =
    serieOcupacionComparativa[serieOcupacionComparativa.length - 1];

  const diasConParteHoy = useMemo(() => {
    const s = new Set<string>();
    for (const snap of snapshots) {
      if (snap.dia === hoy && !idCentroEsPrueba(snap.centro_id)) {
        s.add(snap.centro_id);
      }
    }
    return s;
  }, [snapshots, hoy]);

  const snapshotsHoy = useMemo(
    () =>
      snapshots.filter(
        (s) => s.dia === hoy && !idCentroEsPrueba(s.centro_id),
      ),
    [snapshots, hoy],
  );

  const eventosPorCentro = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of eventosHoyProd) {
      m.set(e.centro_id, (m.get(e.centro_id) ?? 0) + 1);
    }
    return m;
  }, [eventosHoyProd]);

  const filasReportes = useMemo(
    () =>
      calcularFilasReportesSala(
        centrosDeProduccion(centros),
        reportesHoyProd,
        diasConParteHoy,
        controlesHoyProd,
        snapshotsHoy,
        eventosPorCentro,
      ),
    [
      centros,
      reportesHoyProd,
      diasConParteHoy,
      controlesHoyProd,
      snapshotsHoy,
      eventosPorCentro,
    ],
  );
  const { sinIniciar, parciales, incompletos, completos } = useMemo(
    () => conteoReportesPendientes(filasReportes),
    [filasReportes],
  );

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-background text-foreground">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border bg-background/95 px-4 py-2.5 backdrop-blur lg:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <Button asChild variant="outline" size="sm" className="h-9 gap-1.5">
            <Link to="/centros/mapa">
              <ArrowLeft className="size-4" />
              <span className="hidden sm:inline">Campamentos</span>
            </Link>
          </Button>
          <div className="min-w-0">
            <h1 className="truncate text-lg font-bold leading-tight text-foreground lg:text-2xl">
              Campamentos Transitorios
            </h1>
            <p className="truncate text-xs text-muted-foreground lg:text-sm">
              Área Metropolitana de Caracas · Sala situacional
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <IndicadorConexion conectado={conectado} />
          <Reloj />
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-3 xl:overflow-hidden lg:p-4">
        <div className="grid h-full grid-cols-1 gap-3 xl:grid-cols-5">
          <div className="h-[320px] min-h-0 xl:col-span-1 xl:h-full">
            <MapaRedSala
              centros={centrosMapa}
              idsResaltadosAmbito={idsResaltadosAmbito}
              onAbrirCentro={(id) => {
                if (idsResaltadosAmbito && !idsResaltadosAmbito.has(id)) return;
                navegar(`/centro/${id}`);
              }}
            />
          </div>

          <div className="flex min-h-0 flex-col gap-3 xl:col-span-4">
            {/* L1: Globales */}
            <div className="grid shrink-0 grid-cols-2 gap-3 sm:grid-cols-4">
              <KpiSala
                label="Total refugios"
                valor={kpis.centrosTotal}
                icono={<Building2 className="size-4" />}
                grande
              />
              <KpiSala
                label="Familias"
                valor={kpis.familiasTotal}
                icono={<Home className="size-4" />}
                grande
              />
              <KpiSala
                label="Damnificados"
                valor={kpis.refugiadosTotal}
                icono={<Users className="size-4" />}
                acento="text-sky-300"
                grande
              />
              <KpiSala
                label="Mascotas"
                valor={demografia.mascotas}
                icono={<PawPrint className="size-4" />}
                acento="text-amber-200"
                grande
              />
            </div>

            {/* L2: Por estado */}
            <div className="grid shrink-0 grid-cols-1 gap-3 xl:grid-cols-2">
              {ZONAS_SALA.map((zona) => (
                <KpisPorZonaSala
                  key={zona}
                  zona={zona}
                  kpis={kpisZona[zona]}
                  activo={filtroZona === zona}
                  onSeleccionar={setFiltroZona}
                />
              ))}
            </div>

            {/* Cinta alertas */}
            <div className="flex shrink-0 flex-wrap items-center gap-2 rounded-xl border border-border bg-card/50 px-3 py-2">
              <ChipAlerta
                tono={kpis.centrosCriticos > 0 ? "danger" : "ok"}
                icono={<AlertTriangle className="size-3.5" />}
                label="Críticos"
                valor={kpis.centrosCriticos}
              />
              <ChipAlerta
                tono="neutral"
                icono={<DoorOpen className="size-3.5" />}
                label="Cupo"
                valor={kpis.cupoDisponible}
              />
              <ChipAlerta
                tono="neutral"
                label="Personal"
                valor={kpis.personalTotal}
              />
              <ChipAlerta
                tono={casosActivos > 0 ? "warn" : "ok"}
                icono={<HeartPulse className="size-3.5" />}
                label="Salud activa"
                valor={casosActivos}
              />
              <ChipAlerta
                tono="neutral"
                label="Atenciones hoy"
                valor={atencionesHoy}
              />
              <ChipAlerta
                tono={eventosNegativos > 0 ? "warn" : "ok"}
                label="Eventos"
                valor={`+${eventosPositivos} / −${eventosNegativos}`}
              />
              <ChipAlerta
                tono="neutral"
                icono={<Utensils className="size-3.5" />}
                label="Raciones"
                valor={racionesHoy}
              />
              <ChipAlerta
                tono={incompletos > 0 ? "warn" : "ok"}
                label="Reportes incompletos"
                valor={incompletos}
              />
              {parciales > 0 && (
                <ChipAlerta tono="warn" label="Reportes parciales" valor={parciales} />
              )}
              {sinIniciar > 0 && (
                <ChipAlerta tono="warn" label="Sin iniciar" valor={sinIniciar} />
              )}
              {denunciasAbiertas > 0 && (
                <ChipAlerta
                  tono="warn"
                  label="Denuncias abiertas"
                  valor={denunciasAbiertas}
                />
              )}
            </div>

            {/* Fila paneles operativos — ocupación primero (izq → der) */}
            <div className="flex min-h-0 flex-1 gap-2 overflow-x-auto xl:overflow-hidden">
              <PanelSalaPlegable
                id="ocupacion"
                titulo="Histórico de ocupación de la red"
                tituloCorto="Ocupación"
                contenidoFlexible
                className="min-w-[18rem] sm:min-w-[22rem]"
                resumenPlegado={
                  <ResumenPlegadoSala
                    nombre="Ocupación"
                    items={
                      ultimoComparativa
                        ? [
                            {
                              valor: ultimoComparativa.totalRed,
                              tono: "neutral",
                              label: "Total red",
                            },
                            {
                              valor: ultimoComparativa.totalAsignados,
                              tono: "ok",
                              label: "Mis centros",
                            },
                          ]
                        : [
                            {
                              valor: ultimoOcupacion?.total ?? 0,
                              tono: "neutral",
                              label: "Damnificados",
                            },
                            ...(variacionOcupacion &&
                            variacionOcupacion.total !== 0
                              ? [
                                  {
                                    valor: Math.abs(variacionOcupacion.total),
                                    tono:
                                      variacionOcupacion.total > 0
                                        ? ("ok" as const)
                                        : ("danger" as const),
                                    label: "vs día previo",
                                  },
                                ]
                              : []),
                          ]
                    }
                  />
                }
              >
                <GraficoOcupacionRed
                  flexible
                  idsAsignados={idsResaltadosAmbito}
                />
              </PanelSalaPlegable>

              <PanelSalaPlegable
                id="novedades"
                titulo="Novedades diarias"
                tituloCorto="Novedades"
                badge={eventosHoyProd.length}
                resumenPlegado={
                  <ResumenPlegadoSala
                    nombre="Novedades"
                    items={[
                      { valor: eventosPositivos, tono: "ok", label: "Positivas" },
                      { valor: eventosNegativos, tono: "danger", label: "Negativas" },
                    ]}
                  />
                }
              >
                <FeedNovedadesDiarias
                  eventos={eventosHoyProd}
                  nombresCentros={nombresCentros}
                  hoy={hoy}
                />
              </PanelSalaPlegable>

              <PanelSalaPlegable
                id="salud"
                titulo="Casos de salud"
                tituloCorto="Salud"
                badge={casosPendientes.length}
                resumenPlegado={
                  <ResumenPlegadoSala
                    nombre="Salud"
                    items={[
                      {
                        valor: casosSaludEnProceso,
                        tono: "warn",
                        label: "En proceso",
                      },
                      {
                        valor: casosSaludActivo,
                        tono: "danger",
                        label: "Activos",
                      },
                    ]}
                  />
                }
              >
                <FeedCasosSalud
                  casos={casosPendientes}
                  nombresCentros={nombresCentros}
                  hoy={hoy}
                />
              </PanelSalaPlegable>

              <PanelSalaPlegable
                id="denuncias"
                titulo="Denuncias"
                tituloCorto="Denuncias"
                badge={denunciasAbiertas || denunciasProd.length}
                resumenPlegado={
                  <ResumenPlegadoSala
                    nombre="Denuncias"
                    items={[
                      {
                        valor: denunciasResueltas,
                        tono: "ok",
                        label: "Resueltas",
                      },
                      {
                        valor: denunciasAbiertas,
                        tono: "danger",
                        label: "Abiertas",
                      },
                    ]}
                  />
                }
              >
                <FeedDenuncias
                  denuncias={denunciasProd}
                  nombresCentros={nombresCentros}
                  hoy={hoy}
                />
              </PanelSalaPlegable>

              <PanelSalaPlegable
                id="reportes"
                titulo="Reportes diarios"
                tituloCorto="Reportes"
                badge={incompletos > 0 ? incompletos : null}
                resumenPlegado={
                  <ResumenPlegadoSala
                    nombre="Reportes"
                    items={[
                      { valor: completos, tono: "ok", label: "Completos" },
                      { valor: parciales, tono: "warn", label: "Parciales" },
                      {
                        valor: sinIniciar,
                        tono: "danger",
                        label: "Sin iniciar",
                      },
                    ]}
                  />
                }
              >
                <PanelReportesSala filas={filasReportes} hoy={hoy} />
              </PanelSalaPlegable>

              <PanelSalaPlegable
                id="censo"
                titulo="Registro nominal vs parte"
                tituloCorto="Registro"
                badge={
                  conteosCenso.enCurso > 0
                    ? conteosCenso.enCurso
                    : conteosCenso.sinIniciar > 0
                      ? conteosCenso.sinIniciar
                      : null
                }
                resumenPlegado={
                  <ResumenPlegadoSala
                    nombre="Registro"
                    items={[
                      {
                        valor: conteosCenso.completo,
                        tono: "ok",
                        label: "Completo",
                      },
                      {
                        valor: conteosCenso.enCurso,
                        tono: "warn",
                        label: "En curso",
                      },
                      {
                        valor: conteosCenso.sinIniciar,
                        tono: "danger",
                        label: "Sin iniciar",
                      },
                    ]}
                  />
                }
              >
                <PanelCensoSala
                  resumenes={resumenesCensoVisibles}
                  cargando={cargandoCenso}
                />
              </PanelSalaPlegable>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function IndicadorConexion({ conectado }: { conectado: boolean }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "gap-1.5 px-2.5 py-1 text-xs font-medium",
        conectado
          ? "border-emerald-500/40 text-emerald-300"
          : "border-amber-500/40 text-amber-200",
      )}
    >
      <span
        className={cn(
          "size-2 rounded-full",
          conectado ? "bg-emerald-400 animate-pulse" : "bg-amber-400",
        )}
      />
      {conectado ? "En vivo" : "Reconectando…"}
    </Badge>
  );
}

function KpiSala({
  label,
  valor,
  sub,
  subClassName,
  icono,
  acento = "text-foreground",
  grande = false,
}: {
  label: string;
  valor: number;
  sub?: string;
  subClassName?: string;
  icono?: ReactNode;
  acento?: string;
  grande?: boolean;
}) {
  return (
    <Card className="gap-1 py-3">
      <CardContent className="px-3 pt-0">
        <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {icono}
          <span className="truncate">{label}</span>
        </div>
        <div
          className={cn(
            "mt-1 font-bold tabular-nums",
            grande ? "text-3xl lg:text-4xl" : "text-2xl lg:text-3xl",
            acento,
          )}
        >
          {valor.toLocaleString("es")}
        </div>
        {sub && (
          <p className={cn("mt-0.5 text-xs text-muted-foreground", subClassName)}>
            {sub}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function ChipAlerta({
  label,
  valor,
  icono,
  tono = "neutral",
}: {
  label: string;
  valor: number | string;
  icono?: ReactNode;
  tono?: "ok" | "warn" | "danger" | "neutral";
}) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "h-8 gap-1.5 border px-2.5 text-xs font-medium",
        tono === "danger" && "border-red-500/50 text-red-300",
        tono === "warn" && "border-amber-500/50 text-amber-200",
        tono === "ok" && "border-emerald-500/40 text-emerald-300",
        tono === "neutral" && "border-border text-foreground",
      )}
    >
      {icono}
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular-nums font-semibold">
        {typeof valor === "number" ? valor.toLocaleString("es") : valor}
      </span>
    </Badge>
  );
}
