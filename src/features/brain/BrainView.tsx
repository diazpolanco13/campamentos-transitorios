import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FilterX, Inbox, Info, Siren } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Sesion } from "@/data/authSupabase";
import { useSupabaseQuery } from "@/data/useSupabaseQuery";
import { useOcupacionesCentros } from "@/data/useOcupacionesCentros";
import { useEstadoReporteHoy, fasesCompletadasHoy } from "@/data/useEstadoReporteHoy";
import { useCasosSaludCentros } from "@/data/useCasosSaludCentros";
import { useEventosReportes } from "@/data/useEventosReportes";
import { useDenuncias } from "@/data/useDenuncias";
import { claveDia } from "@/data/reposSupabase";
import { desenvolver, type FilaSync } from "@/data/desenvolver";
import { aplicarPartesActualesACentros } from "@/domain/parteActualCentros";
import {
  centrosDeProduccion,
  idCentroEsPrueba,
  unidadSebinDe,
  type CentroTransitorio,
  type ClaveUnidadSebin,
} from "@/domain/centrosTransitorios";
import { centrosEnAlcanceUsuario, centrosVisiblesParaUsuario } from "@/domain/permisos";
import { idsCentrosConAlertaCritica } from "@/domain/alertasCriticasCentro";
import {
  buildSebinBrainGraph,
  estadoDesdeFases,
  type PulseCentroBrain,
  type SebinBrainNode,
} from "@/domain/sebinBrainGraph";
import { PanelFlotante } from "@/components/PanelFlotante";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useIsMobile } from "@/hooks/use-mobile";
import { BotonBorrarCache } from "@/components/BotonBorrarCache";
import { ControlesMapaFlotantes } from "@/features/centros/ControlesMapaFlotantes";
import { PanelCentros, calcularEstadosFilas } from "@/features/centros/PanelCentros";
import {
  DetalleNodoBrain,
  LeyendaSeveridadBrain,
  SebinBrainGraph,
  type NovedadesBrainResumen,
} from "./SebinBrainGraph";
import { TotalesBrain } from "./TotalesBrain";
import {
  BotonFiltroReporteBrain,
  campamentoPasaFiltroReporte,
  type FiltroReporteBrain,
} from "./FiltrosReporteBrain";

type CentroFila = CentroTransitorio & { deleted: boolean };

/** Grafo operativo: SEBIN → unidades → campamentos + severidad del día. */
export function BrainView({ sesion }: { sesion: Sesion }) {
  const navegar = useNavigate();
  const esMovil = useIsMobile();
  const hoy = claveDia(Date.now());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [focusUnidadId, setFocusUnidadId] = useState<string | null>(null);
  const [filtrosReporte, setFiltrosReporte] = useState<Set<FiltroReporteBrain>>(
    () => new Set(),
  );
  const [panelCentrosAbierto, setPanelCentrosAbierto] = useState(false);
  const [unidadesFiltro, setUnidadesFiltro] = useState<Set<ClaveUnidadSebin>>(
    () => new Set(),
  );
  const [expandidos, setExpandidos] = useState<Set<ClaveUnidadSebin>>(
    () => new Set(),
  );
  /** Móvil: leyenda colapsada para liberar lienzo táctil. */
  const [leyendaMovilAbierta, setLeyendaMovilAbierta] = useState(false);
  /** Incrementar → SebinBrainGraph expande + centra cámara. */
  const [vistaResetKey, setVistaResetKey] = useState(0);

  const filasCentros = useSupabaseQuery<CentroFila, FilaSync<CentroTransitorio>>(
    "centros",
    {
      transform: desenvolver as (raw: FilaSync<CentroTransitorio>) => CentroFila,
      clientFilter: (c) => !c.deleted,
    },
  );
  const snapshots = useOcupacionesCentros();
  const estadosHoy = useEstadoReporteHoy();
  const { casos: casosSalud } = useCasosSaludCentros({ soloActivos: true });
  const { eventos: eventosHoy } = useEventosReportes({ dia: hoy });
  const denuncias = useDenuncias({ estado: "abierta", alcance: "activas" });

  const centros = useMemo(() => {
    const visibles = centrosVisiblesParaUsuario(
      [...filasCentros].sort((a, b) => (a.nro ?? 0) - (b.nro ?? 0)),
      sesion.user,
    );
    const conParte = aplicarPartesActualesACentros(visibles, snapshots);
    return centrosDeProduccion(centrosEnAlcanceUsuario(conParte, sesion.user));
  }, [filasCentros, snapshots, sesion.user]);

  const idsCriticos = useMemo(
    () =>
      idsCentrosConAlertaCritica({
        dia: hoy,
        eventosHoy: eventosHoy.filter((e) => !idCentroEsPrueba(e.centro_id)),
        denunciasAbiertas: denuncias.filter((d) => !idCentroEsPrueba(d.centro_id)),
        casosSaludActivos: casosSalud.filter((c) => !idCentroEsPrueba(c.centro_id)),
      }),
    [hoy, eventosHoy, denuncias, casosSalud],
  );

  const pulses = useMemo(() => {
    const m = new Map<string, PulseCentroBrain>();
    for (const c of centros) {
      const fasesOk = fasesCompletadasHoy(estadosHoy.get(c.id));
      m.set(c.id, {
        critica: idsCriticos.has(c.id),
        estadoReporte: estadoDesdeFases(fasesOk),
        fasesOk,
      });
    }
    return m;
  }, [centros, estadosHoy, idsCriticos]);

  const graphFull = useMemo(
    () => buildSebinBrainGraph(centros, { dia: hoy, pulses }),
    [centros, hoy, pulses],
  );

  const graph = useMemo(() => {
    const hayFiltroUnidad = unidadesFiltro.size > 0;
    const hayFiltroEstado = filtrosReporte.size > 0;
    if (!hayFiltroEstado && !hayFiltroUnidad) return graphFull;
    const keep = new Set<string>(["sebin"]);
    if (focusUnidadId) keep.add(focusUnidadId);
    if (selectedId) keep.add(selectedId);
    for (const n of graphFull.nodes) {
      if (n.kind === "campamento") {
        const enFiltro =
          !hayFiltroUnidad ||
          (n.unidadClave != null && unidadesFiltro.has(n.unidadClave));
        const enEstado = campamentoPasaFiltroReporte(
          n.severidad,
          filtrosReporte,
          n.estadoReporte,
        );
        if (enFiltro && enEstado) {
          keep.add(n.id);
          if (n.unidadClave) keep.add(`unidad:${n.unidadClave}`);
        }
      }
    }
    // Sin filtro de estado: unidades del filtro de unidad (aunque sin camps match).
    if (!hayFiltroEstado) {
      for (const n of graphFull.nodes) {
        if (n.kind !== "unidad") continue;
        if (n.unidadClave != null && unidadesFiltro.has(n.unidadClave)) {
          keep.add(n.id);
        }
      }
    } else if (filtrosReporte.has("critica")) {
      // Unidad con críticas agregadas (misma lógica lente anterior).
      for (const n of graphFull.nodes) {
        if (n.kind !== "unidad" || n.criticos <= 0) continue;
        const enFiltro =
          !hayFiltroUnidad ||
          (n.unidadClave != null && unidadesFiltro.has(n.unidadClave));
        if (enFiltro) keep.add(n.id);
      }
    }
    return {
      ...graphFull,
      nodes: graphFull.nodes.filter((n) => keep.has(n.id)),
      edges: graphFull.edges.filter(
        (e) => keep.has(e.source) && keep.has(e.target),
      ),
    };
  }, [graphFull, filtrosReporte, unidadesFiltro, focusUnidadId, selectedId]);

  const selected = useMemo(
    () => graphFull.nodes.find((n) => n.id === selectedId) ?? null,
    [graphFull.nodes, selectedId],
  );

  const estadosFilas = useMemo(() => calcularEstadosFilas(centros), [centros]);
  const centroSeleccionadoId =
    selected?.kind === "campamento" ? (selected.centroId ?? null) : null;

  function alternarUnidadFiltro(clave: ClaveUnidadSebin) {
    setUnidadesFiltro((prev) => {
      const next = new Set(prev);
      if (next.has(clave)) next.delete(clave);
      else next.add(clave);
      return next;
    });
  }

  function alternarFiltroReporte(f: FiltroReporteBrain) {
    setFiltrosReporte((prev) => {
      const next = new Set(prev);
      if (next.has(f)) next.delete(f);
      else next.add(f);
      return next;
    });
  }

  /** Quita estado/unidad/foco/selección y centra zoom+pan. */
  function limpiarFiltrosYCentrar() {
    setFiltrosReporte(new Set());
    setUnidadesFiltro(new Set());
    setFocusUnidadId(null);
    setSelectedId(null);
    setVistaResetKey((k) => k + 1);
  }

  const lenteCritica = filtrosReporte.has("critica");
  const hayFiltrosActivos =
    filtrosReporte.size > 0 ||
    unidadesFiltro.size > 0 ||
    focusUnidadId != null ||
    selectedId != null;

  function setExpandido(clave: ClaveUnidadSebin, abierto: boolean) {
    setExpandidos((prev) => {
      const s = new Set(prev);
      if (abierto) s.add(clave);
      else s.delete(clave);
      return s;
    });
  }

  /** Lista/buscador → foco unidad + campamento en el grafo. */
  function seleccionarCentroBrain(centro: CentroTransitorio) {
    const clave = unidadSebinDe(centro);
    setExpandido(clave, true);
    setFocusUnidadId(`unidad:${clave}`);
    setSelectedId(`camp:${centro.id}`);
  }

  const novedadesSelected = useMemo((): NovedadesBrainResumen | null => {
    if (!selected) return null;
    const eventos = eventosHoy.filter((e) => !idCentroEsPrueba(e.centro_id));
    let scope = eventos;
    if (selected.kind === "campamento" && selected.centroId) {
      scope = eventos.filter((e) => e.centro_id === selected.centroId);
    } else if (selected.kind === "unidad" && selected.unidadClave) {
      const ids = new Set(
        graphFull.nodes
          .filter(
            (n) =>
              n.kind === "campamento" &&
              n.unidadClave === selected.unidadClave &&
              n.centroId,
          )
          .map((n) => n.centroId as string),
      );
      scope = eventos.filter((e) => ids.has(e.centro_id));
    }
    const negativas = scope.filter((e) => e.tipo === "negativo");
    return {
      total: scope.length,
      negativas: negativas.length,
      titulos: negativas
        .slice(0, 3)
        .map((e) => e.titulo?.trim() || "Sin título"),
    };
  }, [selected, eventosHoy, graphFull.nodes]);

  const onSelect = (node: SebinBrainNode | null) => {
    setSelectedId(node?.id ?? null);
  };

  const cerrarDetalle = () => setSelectedId(null);

  const { resumen } = graphFull;
  const tipoNodo =
    selected?.kind === "sebin"
      ? "Núcleo"
      : selected?.kind === "unidad"
        ? "Unidad"
        : selected?.kind === "campamento"
          ? "Campamento"
          : undefined;

  const panelEscritorio = Boolean(selected) && !esMovil;
  /**
   * Móvil: sheet solo en campamento (acciones). Unidad/SEBIN = foco/navegación
   * sin tapar el grafo.
   */
  const sheetMovil =
    Boolean(selected) && esMovil && selected?.kind === "campamento";
  /** Top ocupado: KPI/migas o foco — liberar zona superior del lienzo. */
  const chromeSuperiorOcupado = Boolean(focusUnidadId) || panelEscritorio;

  return (
    <div
      className={cn(
        "relative h-full min-h-0 w-full overflow-hidden",
        // zoom fijo top-right; debajo empieza panel/filtros
        "[--sebin-under-zoom:3.5rem]",
        // migas al lado de lista (KPI baja con foco/detalle)
        "[--sebin-chrome-top:0.75rem]",
        // panel 16rem + right-3 + gap filtros
        panelEscritorio && "[--sebin-chrome-right:17.5rem]",
      )}
    >
      <SebinBrainGraph
        graph={graph}
        selectedId={selectedId}
        onSelect={onSelect}
        focusUnidadId={focusUnidadId}
        onFocusUnidadIdChange={setFocusUnidadId}
        ocultarChromeFlotante={panelCentrosAbierto && esMovil}
        vistaResetKey={vistaResetKey}
        className="h-full w-full"
      />

      {/* Mismo pill del mapa: lista/filtro + buscador → navega en el brain */}
      <ControlesMapaFlotantes
        centros={centros}
        estados={estadosFilas}
        seleccionado={centroSeleccionadoId}
        onSeleccionarCentro={seleccionarCentroBrain}
        panelAbierto={panelCentrosAbierto}
        onAbrirPanel={() => setPanelCentrosAbierto(true)}
      />

      <PanelCentros
        centros={centros}
        unidadesFiltro={unidadesFiltro}
        onAlternarUnidad={alternarUnidadFiltro}
        onLimpiarFiltro={() => setUnidadesFiltro(new Set())}
        expandidos={expandidos}
        onSetExpandido={setExpandido}
        seleccionado={centroSeleccionadoId}
        onSeleccionarCentro={seleccionarCentroBrain}
        abierto={panelCentrosAbierto}
        onCambiarAbierto={setPanelCentrosAbierto}
      />

      {/* KPIs: solo desktop — en móvil liberan el lienzo para el dedo */}
      {!esMovil && !chromeSuperiorOcupado && (
        <div
          className={cn(
            "map-controls-overlay pointer-events-none absolute z-30 md:right-36 md:top-3",
            panelCentrosAbierto
              ? "md:left-[calc(min(21rem,86vw)+0.75rem)]"
              : "md:left-14",
          )}
        >
          <TotalesBrain resumen={resumen} />
        </div>
      )}
      {!esMovil && chromeSuperiorOcupado && (
        <div className="map-controls-overlay pointer-events-none absolute bottom-3 left-3 z-30">
          <TotalesBrain resumen={resumen} />
        </div>
      )}

      {/* Filtros: desktop bajo zoom; móvil abajo-derecha (no tapa centro) */}
      {!(panelCentrosAbierto && esMovil) && (
      <TooltipProvider delayDuration={200}>
        <div
          className={cn(
            "map-controls-overlay pointer-events-none absolute z-30",
            esMovil
              ? "bottom-[max(0.75rem,env(safe-area-inset-bottom))] right-3"
              : undefined,
          )}
          style={
            esMovil
              ? undefined
              : {
                  top: "var(--sebin-under-zoom)",
                  right: "max(0.75rem, var(--sebin-chrome-right, 0.75rem))",
                }
          }
        >
          <ButtonGroup
            orientation="vertical"
            className="pointer-events-auto w-10 min-w-10 overflow-hidden rounded-xl border border-border bg-card shadow-lg"
          >
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant={lenteCritica ? "secondary" : "outline"}
                  size="icon"
                  className={cn(
                    "h-10 w-10 min-w-10 shrink-0 border-0 bg-card text-foreground shadow-none hover:bg-muted/80",
                    lenteCritica && "bg-primary/15 text-primary",
                  )}
                  aria-label={
                    lenteCritica ? "Quitar filtro de críticas" : "Solo críticas"
                  }
                  aria-pressed={lenteCritica}
                  onClick={() => alternarFiltroReporte("critica")}
                >
                  <Siren className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="left" sideOffset={8}>
                {lenteCritica ? "Quitar críticas" : "Solo críticas"}
              </TooltipContent>
            </Tooltip>
            <BotonFiltroReporteBrain
              filtros={filtrosReporte}
              onAlternar={alternarFiltroReporte}
            />
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-10 w-10 min-w-10 shrink-0 border-0 bg-card text-foreground shadow-none hover:bg-muted/80"
                  aria-label="Bandeja de críticas"
                  onClick={() => navegar("/incidencias/funcionarios")}
                >
                  <Inbox className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="left" sideOffset={8}>
                Bandeja
              </TooltipContent>
            </Tooltip>
            <BotonBorrarCache
              variante="mapa"
              className="text-red-500 hover:bg-red-500/10 hover:text-red-500"
            />
          </ButtonGroup>
        </div>
      </TooltipProvider>
      )}

      {/* Desktop: misma columna que zoom (debajo), sin solaparse */}
      {panelEscritorio && selected && (
        <PanelFlotante
          titulo={selected.label}
          descripcion={tipoNodo}
          onCerrar={cerrarDetalle}
          className="z-40 md:top-[var(--sebin-under-zoom)] md:right-3 md:bottom-auto md:left-auto md:h-auto md:max-h-[min(34rem,calc(100%-var(--sebin-under-zoom)-0.75rem))] md:w-[16rem]"
        >
          <DetalleAccionesBrain
            selected={selected}
            dia={hoy}
            novedades={novedadesSelected}
            onAbrirReporte={() =>
              navegar(
                `/centros/reportes/${selected.centroId}?vista=reporte&dia=${hoy}`,
              )
            }
            onAbrirSeguimiento={() =>
              navegar(
                `/centros/reportes/${selected.centroId}?vista=incidencias`,
              )
            }
            onAbrirBandeja={() =>
              navegar("/incidencias/funcionarios?estado=seguimiento")
            }
          />
        </PanelFlotante>
      )}

      {/* Móvil: sheet solo campamento — unidad se navega sin modal */}
      <Sheet
        open={sheetMovil}
        onOpenChange={(open) => {
          if (!open) cerrarDetalle();
        }}
      >
        <SheetContent
          side="bottom"
          showCloseButton
          className="max-h-[min(72dvh,34rem)] gap-0 rounded-t-2xl p-0 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:hidden"
        >
          <div className="flex justify-center pt-2" aria-hidden>
            <div className="h-1 w-10 rounded-full bg-muted-foreground/35" />
          </div>
          <SheetHeader className="border-b border-border/60 px-4 pb-3 pt-2 text-left">
            <SheetTitle className="truncate pr-8">
              {selected?.label ?? "Detalle"}
            </SheetTitle>
            {tipoNodo && (
              <SheetDescription>{tipoNodo}</SheetDescription>
            )}
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3">
            {selected && (
              <DetalleAccionesBrain
                selected={selected}
                dia={hoy}
                novedades={novedadesSelected}
                onAbrirReporte={() =>
                  navegar(
                    `/centros/reportes/${selected.centroId}?vista=reporte&dia=${hoy}`,
                  )
                }
                onAbrirSeguimiento={() =>
                  navegar(
                    `/centros/reportes/${selected.centroId}?vista=incidencias`,
                  )
                }
                onAbrirBandeja={() =>
                  navegar("/incidencias/funcionarios?estado=seguimiento")
                }
              />
            )}
          </div>
        </SheetContent>
      </Sheet>

      {!(panelCentrosAbierto && esMovil) && (
      <div
        className={cn(
          // anclado inferior-derecha siempre — no usar --sebin-chrome-right
          // (al abrir panel/KPI eso empujaba la cinta al centro y tapaba TotalesBrain)
          "pointer-events-none absolute z-30 flex flex-col items-end gap-2",
          esMovil
            ? "bottom-[max(0.75rem,env(safe-area-inset-bottom))] right-14 max-w-[min(100%,calc(100%-5.5rem))]"
            : cn(
                "bottom-3 right-3",
                // con KPI abajo-izq (foco/detalle), deja hueco a la izquierda
                chromeSuperiorOcupado
                  ? "max-w-[min(100%,calc(100%-16rem))]"
                  : "max-w-[min(100%,calc(100%-5.5rem))]",
              ),
        )}
      >
        <div className="flex max-w-full flex-wrap items-end justify-end gap-2">
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant={hayFiltrosActivos ? "secondary" : "outline"}
                  size="icon"
                  className={cn(
                    "pointer-events-auto size-10 shrink-0 rounded-xl border border-border bg-card shadow-lg",
                    hayFiltrosActivos && "bg-primary/15 text-primary",
                  )}
                  aria-label="Quitar filtros y centrar grafo"
                  onClick={limpiarFiltrosYCentrar}
                >
                  <FilterX className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top" sideOffset={8}>
                Quitar filtros y centrar
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          {esMovil ? (
            <>
              <Button
                type="button"
                variant={leyendaMovilAbierta ? "secondary" : "outline"}
                size="icon"
                className="pointer-events-auto size-10 shrink-0 rounded-xl border border-border bg-card shadow-lg"
                aria-label={
                  leyendaMovilAbierta ? "Ocultar filtros de estado" : "Filtrar por estado"
                }
                aria-expanded={leyendaMovilAbierta}
                onClick={() => setLeyendaMovilAbierta((v) => !v)}
              >
                <Info className="size-4" />
              </Button>
              {leyendaMovilAbierta && (
                <LeyendaSeveridadBrain
                  filtros={filtrosReporte}
                  onAlternar={alternarFiltroReporte}
                  className="pointer-events-auto rounded-xl border border-border/70 bg-background/90 p-1.5 shadow-lg backdrop-blur"
                />
              )}
            </>
          ) : (
            <LeyendaSeveridadBrain
              filtros={filtrosReporte}
              onAlternar={alternarFiltroReporte}
              className="pointer-events-auto rounded-xl border border-border/70 bg-background/80 p-1.5 shadow-lg backdrop-blur"
            />
          )}
        </div>
      </div>
      )}
    </div>
  );
}

function DetalleAccionesBrain({
  selected,
  dia,
  novedades,
  onAbrirReporte,
  onAbrirSeguimiento,
  onAbrirBandeja,
}: {
  selected: SebinBrainNode;
  dia: string;
  novedades?: NovedadesBrainResumen | null;
  onAbrirReporte: () => void;
  onAbrirSeguimiento: () => void;
  onAbrirBandeja: () => void;
}) {
  // Crítica (salud / novedad / denuncia) vive en seguimiento — no en el reporte del día
  const esCritica = selected.severidad === "critica";

  return (
    <div className="space-y-2.5">
      <DetalleNodoBrain node={selected} dia={dia} novedades={novedades} />
      {selected.centroId && (
        <div className="flex flex-col gap-1.5">
          {esCritica ? (
            <>
              <Button type="button" size="sm" onClick={onAbrirSeguimiento}>
                Seguimiento
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={onAbrirReporte}
              >
                Abrir reporte
              </Button>
            </>
          ) : (
            <>
              <Button type="button" size="sm" onClick={onAbrirReporte}>
                Abrir reporte
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={onAbrirSeguimiento}
              >
                Seguimiento
              </Button>
            </>
          )}
        </div>
      )}
      {selected.kind === "unidad" && selected.criticos > 0 && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="w-full"
          onClick={onAbrirBandeja}
        >
          Críticas en bandeja
        </Button>
      )}
    </div>
  );
}

