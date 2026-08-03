import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Network, Siren, X } from "lucide-react";
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
  type CentroTransitorio,
} from "@/domain/centrosTransitorios";
import { centrosEnAlcanceUsuario, centrosVisiblesParaUsuario } from "@/domain/permisos";
import { idsCentrosConAlertaCritica } from "@/domain/alertasCriticasCentro";
import {
  buildSebinBrainGraph,
  estadoDesdeFases,
  META_SEVERIDAD_BRAIN,
  type PulseCentroBrain,
  type SebinBrainNode,
} from "@/domain/sebinBrainGraph";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DetalleNodoBrain,
  LeyendaSeveridadBrain,
  SebinBrainGraph,
} from "./SebinBrainGraph";

type CentroFila = CentroTransitorio & { deleted: boolean };

/** Grafo operativo: SEBIN → unidades → campamentos + severidad del día. */
export function BrainView({ sesion }: { sesion: Sesion }) {
  const navegar = useNavigate();
  const hoy = claveDia(Date.now());
  const [selectedId, setSelectedId] = useState<string | null>("sebin");
  const [lenteCritica, setLenteCritica] = useState(false);

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
    if (!lenteCritica) return graphFull;
    const keep = new Set<string>(["sebin"]);
    for (const n of graphFull.nodes) {
      if (n.kind === "campamento" && n.severidad === "critica") {
        keep.add(n.id);
        if (n.unidadClave) keep.add(`unidad:${n.unidadClave}`);
      }
      if (n.kind === "unidad" && n.criticos > 0) keep.add(n.id);
    }
    return {
      ...graphFull,
      nodes: graphFull.nodes.filter((n) => keep.has(n.id)),
      edges: graphFull.edges.filter(
        (e) => keep.has(e.source) && keep.has(e.target),
      ),
    };
  }, [graphFull, lenteCritica]);

  const selected = useMemo(
    () => graphFull.nodes.find((n) => n.id === selectedId) ?? null,
    [graphFull.nodes, selectedId],
  );

  const onSelect = (node: SebinBrainNode | null) => {
    setSelectedId(node?.id ?? null);
  };

  const { resumen } = graphFull;

  return (
    <div className="relative h-full min-h-0 w-full overflow-hidden [--sebin-chrome-top:8.5rem] [--sebin-chrome-right:15.5rem] lg:[--sebin-chrome-top:6.75rem]">
      <SebinBrainGraph
        graph={graph}
        selectedId={selectedId}
        onSelect={onSelect}
        className="h-full w-full"
      />

      {/* KPI + acciones — overlay superior */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-30 p-3 pr-[calc(var(--sebin-chrome-right)+0.5rem)]">
        <div className="pointer-events-auto flex flex-col gap-2 rounded-xl border border-border/70 bg-background/80 p-3 shadow-sm backdrop-blur-md lg:flex-row lg:items-end lg:justify-between lg:gap-4">
          <div className="min-w-0 lg:max-w-md">
            <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
              <Network className="size-3.5 shrink-0" />
              Brain operativo
            </div>
            <h1 className="mt-0.5 truncate text-base font-bold tracking-tight md:text-lg">
              SEBIN · unidades · campamentos
            </h1>
            <p className="mt-0.5 hidden text-xs text-muted-foreground sm:block">
              Pulso del día {hoy}
            </p>
          </div>

          <div className="grid min-w-0 flex-1 grid-cols-2 gap-1.5 sm:grid-cols-4 lg:max-w-xl">
            <KpiChip label="Campamentos" valor={resumen.camps} />
            <KpiChip label="Unidades" valor={resumen.unidades} />
            <KpiChip
              label="Reportes OK"
              valor={`${resumen.reportesOk}/${resumen.camps}`}
              tono="ok"
            />
            <KpiChip
              label="Críticos hoy"
              valor={resumen.criticos}
              tono={resumen.criticos > 0 ? "critica" : "muted"}
            />
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <Button
              type="button"
              variant={lenteCritica ? "default" : "outline"}
              size="sm"
              onClick={() => setLenteCritica((v) => !v)}
            >
              <Siren className="size-3.5" />
              Solo críticas
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => navegar("/incidencias/funcionarios")}
            >
              Bandeja
            </Button>
          </div>
        </div>
      </div>

      {/* Detalle — siempre lateral derecho, compacto */}
      <aside className="absolute bottom-3 right-3 top-3 z-30 flex w-[14.5rem] flex-col overflow-hidden rounded-xl border border-border/70 bg-background/85 shadow-sm backdrop-blur-md">
        <div className="flex items-center justify-between gap-1 border-b border-border/60 px-2.5 py-1.5">
          <h2 className="text-xs font-semibold">Detalle</h2>
          {selected && (
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              aria-label="Cerrar detalle"
              onClick={() => setSelectedId(null)}
            >
              <X className="size-3.5" />
            </Button>
          )}
        </div>
        <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto p-2.5">
          {selected ? (
            <>
              <DetalleNodoBrain node={selected} dia={hoy} />
              {selected.centroId && (
                <div className="flex flex-col gap-1.5">
                  <Button
                    type="button"
                    size="sm"
                    onClick={() =>
                      navegar(
                        `/centros/reportes/${selected.centroId}?vista=reporte&dia=${hoy}`,
                      )
                    }
                  >
                    Abrir reporte
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      navegar(
                        `/centros/reportes/${selected.centroId}?vista=incidencias`,
                      )
                    }
                  >
                    Seguimiento
                  </Button>
                </div>
              )}
              {selected.kind === "unidad" && selected.criticos > 0 && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="w-full"
                  onClick={() =>
                    navegar("/incidencias/funcionarios?estado=seguimiento")
                  }
                >
                  Críticas en bandeja
                </Button>
              )}
            </>
          ) : (
            <p className="text-xs text-muted-foreground">
              Tocá un nodo: SEBIN, unidad o campamento.
            </p>
          )}
        </div>
      </aside>

      <div className="pointer-events-none absolute bottom-3 left-3 z-30 flex max-w-[min(100%,20rem)] flex-wrap items-end gap-2">
        <LeyendaSeveridadBrain className="pointer-events-auto rounded-md border border-border/70 bg-background/80 px-2 py-1 backdrop-blur" />
        {lenteCritica && (
          <Badge variant="destructive" className="pointer-events-auto text-[10px]">
            Lente críticas
          </Badge>
        )}
      </div>
    </div>
  );
}

function KpiChip({
  label,
  valor,
  tono = "muted",
}: {
  label: string;
  valor: string | number;
  tono?: "muted" | "ok" | "critica";
}) {
  const color =
    tono === "ok"
      ? META_SEVERIDAD_BRAIN.ok.color
      : tono === "critica"
        ? META_SEVERIDAD_BRAIN.critica.color
        : undefined;
  return (
    <div className="rounded-lg border border-border/60 bg-background/60 px-2.5 py-1.5">
      <div className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div
        className="mt-0.5 text-base font-bold tabular-nums leading-none"
        style={color ? { color } : undefined}
      >
        {valor}
      </div>
    </div>
  );
}
