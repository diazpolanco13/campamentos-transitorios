import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Network, Siren } from "lucide-react";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
    <div className="flex h-full min-h-0 flex-col gap-3 p-3 md:p-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
            <Network className="size-3.5" />
            Brain operativo
          </div>
          <h1 className="mt-0.5 text-xl font-bold tracking-tight md:text-2xl">
            SEBIN · unidades · campamentos
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Pulso del día {hoy}: reportes diarios y alertas críticas (novedades
            negativas, salud abierta, denuncias).
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
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
      </header>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
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

      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[1fr_280px]">
        <Card className="min-h-[420px] overflow-hidden border-border/80 bg-background py-0">
          <CardContent className="relative h-full min-h-[420px] p-0 lg:min-h-[560px]">
            <div className="pointer-events-none absolute inset-x-3 bottom-3 z-10 flex flex-wrap items-center justify-between gap-2">
              <LeyendaSeveridadBrain className="rounded-md border bg-background/80 px-2 py-1 backdrop-blur" />
              {lenteCritica && (
                <Badge variant="destructive" className="pointer-events-auto text-[10px]">
                  Lente críticas
                </Badge>
              )}
            </div>
            <SebinBrainGraph
              graph={graph}
              selectedId={selectedId}
              onSelect={onSelect}
              className="min-h-[420px] lg:min-h-[560px]"
            />
          </CardContent>
        </Card>

        <Card className="min-h-0">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Detalle</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {selected ? (
              <>
                <DetalleNodoBrain node={selected} dia={hoy} />
                {selected.centroId && (
                  <div className="flex flex-col gap-2">
                    <Button
                      type="button"
                      onClick={() =>
                        navegar(
                          `/centros/reportes/${selected.centroId}?vista=reporte&dia=${hoy}`,
                        )
                      }
                    >
                      Abrir reporte del día
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() =>
                        navegar(
                          `/centros/reportes/${selected.centroId}?vista=incidencias`,
                        )
                      }
                    >
                      Ver seguimiento
                    </Button>
                  </div>
                )}
                {selected.kind === "unidad" && selected.criticos > 0 && (
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={() =>
                      navegar("/incidencias/funcionarios?estado=seguimiento")
                    }
                  >
                    Ver críticas en bandeja
                  </Button>
                )}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Tocá un nodo: SEBIN, unidad o campamento.
              </p>
            )}
          </CardContent>
        </Card>
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
    <div className="rounded-lg border bg-card px-3 py-2">
      <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div
        className="mt-0.5 text-lg font-bold tabular-nums"
        style={color ? { color } : undefined}
      >
        {valor}
      </div>
    </div>
  );
}
