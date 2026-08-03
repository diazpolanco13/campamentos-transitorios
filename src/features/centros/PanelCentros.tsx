import { useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  MapPinOff,
  PanelLeftClose,
  Search,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { LogoCuerpo } from "@/components/LogoCuerpo";
import {
  metaUnidadSebinCentro,
  unidadSebinDe,
  type CentroTransitorio,
  type ClaveUnidadSebin,
} from "@/domain/centrosTransitorios";
import type { MetaCuerpo } from "@/domain/cuerposPoliciales";
import type { MetaUnidadSebin } from "@/domain/unidadesSebin";
import { useCatalogoCuerpos } from "@/data/useCuerposPoliciales";
import { useCatalogoUnidadesSebinActivas } from "@/data/useUnidadesSebin";
import {
  ESTADO_FILA_VACIO,
  FilaCentroLista,
  calcularEstadosFilas,
  normalizarTextoBusqueda,
} from "./CentrosListaItems";
import {
  ESTADO_ICONOS_VACIO,
  useMapaEstadosIconosReporteDia,
} from "./IconosEstadoReporteDia";

interface Props {
  centros: CentroTransitorio[];
  /** Direcciones SEBIN activas en el mapa (vacío = ver todas). */
  unidadesFiltro: ReadonlySet<ClaveUnidadSebin>;
  onAlternarUnidad: (clave: ClaveUnidadSebin) => void;
  onLimpiarFiltro: () => void;
  expandidos: Set<ClaveUnidadSebin>;
  onSetExpandido: (clave: ClaveUnidadSebin, abierto: boolean) => void;
  seleccionado: string | null;
  onSeleccionarCentro: (centro: CentroTransitorio) => void;
  abierto: boolean;
  onCambiarAbierto: (abierto: boolean) => void;
}

/**
 * Panel lateral del mapa: búsqueda, listado por dirección interna SEBIN
 * y filtro multi-selección (opaca el resto en el mapa).
 */
export function PanelCentros({
  centros,
  unidadesFiltro,
  onAlternarUnidad,
  onLimpiarFiltro,
  expandidos,
  onSetExpandido,
  seleccionado,
  onSeleccionarCentro,
  abierto,
  onCambiarAbierto,
}: Props) {
  const [busqueda, setBusqueda] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const catalogoUnidades = useCatalogoUnidadesSebinActivas();
  const catalogoCuerpos = useCatalogoCuerpos();

  const estados = useMemo(() => calcularEstadosFilas(centros), [centros]);
  const centroIds = useMemo(() => centros.map((c) => c.id), [centros]);
  const estadosReporte = useMapaEstadosIconosReporteDia(centroIds);

  const centrosPorUnidad = useMemo(() => {
    const m = new Map<ClaveUnidadSebin, CentroTransitorio[]>();
    for (const c of centros) {
      const clave = unidadSebinDe(c);
      const lista = m.get(clave) ?? [];
      lista.push(c);
      m.set(clave, lista);
    }
    return m;
  }, [centros]);

  const sinUbicar = useMemo(() => centros.filter((c) => !c.geom), [centros]);

  const termino = normalizarTextoBusqueda(busqueda.trim());
  const resultados = useMemo(() => {
    if (!termino) return null;
    return centros.filter((c) => {
      const meta = metaUnidadSebinCentro(c);
      return normalizarTextoBusqueda(
        `${c.nro} ${c.nombre} ${c.parroquia} ${c.direccion} ${meta.label} ${c.supervision?.unidad_sebin ?? ""}`,
      ).includes(termino);
    });
  }, [centros, termino]);

  function elegirCentro(centro: CentroTransitorio) {
    onSeleccionarCentro(centro);
    // mismo corte que useIsMobile (768)
    if (window.innerWidth < 768) onCambiarAbierto(false);
  }

  /** Clic en una dirección: añade/quita del filtro (multi-selección). */
  function elegirUnidad(clave: ClaveUnidadSebin) {
    onAlternarUnidad(clave);
  }

  const unidadesConCampamentos = catalogoUnidades.filter(
    (u) => u.clave !== "sin_asignar" && (centrosPorUnidad.get(u.clave)?.length ?? 0) > 0,
  );
  const hayFiltro = unidadesFiltro.size > 0;

  /** Unidades presentes agrupadas por cuerpo policial (orden del catálogo). */
  const gruposPorCuerpo = useMemo(() => {
    const porCuerpo = new Map<string, MetaUnidadSebin[]>();
    for (const u of unidadesConCampamentos) {
      const clave = u.cuerpoClave ?? "";
      const lista = porCuerpo.get(clave) ?? [];
      lista.push(u);
      porCuerpo.set(clave, lista);
    }
    const metaDe = new Map(catalogoCuerpos.map((c) => [c.clave, c]));
    return Array.from(porCuerpo.entries())
      .map(([clave, unidades]) => ({
        clave,
        meta: metaDe.get(clave) ?? null,
        unidades,
        total: unidades.reduce(
          (n, u) => n + (centrosPorUnidad.get(u.clave)?.length ?? 0),
          0,
        ),
      }))
      .sort((a, b) => (a.meta?.orden ?? 900) - (b.meta?.orden ?? 900));
  }, [unidadesConCampamentos, catalogoCuerpos, centrosPorUnidad]);

  return (
    <>
      {/* Móvil: scrim — tap fuera cierra; tapa zoom/filtros del brain */}
      {abierto && (
        <Button
          type="button"
          variant="ghost"
          aria-label="Cerrar lista de campamentos"
          onClick={() => onCambiarAbierto(false)}
          className="absolute inset-0 z-[55] h-auto w-auto rounded-none bg-black/50 p-0 hover:bg-black/50 md:hidden"
        />
      )}
      <div
        className={cn(
          "absolute inset-y-0 left-0 z-[60] flex w-[min(21rem,92vw)] flex-col border-r border-border bg-background/95 shadow-xl backdrop-blur-sm transition-transform duration-300 md:w-[min(21rem,86vw)]",
          !abierto && "pointer-events-none -translate-x-full",
        )}
        aria-hidden={!abierto}
        role="dialog"
        aria-modal={abierto || undefined}
        aria-label="Lista de campamentos"
      >
      <div className="shrink-0 space-y-2 border-b border-border px-3 py-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Lista de campamentos
            </p>
            <p className="text-[10px] text-muted-foreground/80">
              Por cuerpo y unidad responsable
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onCambiarAbierto(false)}
            aria-label="Cerrar lista"
            className="shrink-0 gap-1.5"
          >
            <X className="size-4 md:hidden" />
            <PanelLeftClose className="hidden size-4 md:block" />
            <span className="md:hidden">Cerrar</span>
          </Button>
        </div>

        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={inputRef}
            type="search"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar campamento, parroquia, dirección…"
            className="h-8 pl-8 pr-7 text-xs"
            aria-label="Buscar campamento"
          />
          {busqueda && (
            <button
              type="button"
              onClick={() => {
                setBusqueda("");
                inputRef.current?.focus();
              }}
              title="Limpiar búsqueda"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {resultados ? (
          <div className="space-y-0.5">
            <p className="px-2 pb-1 text-[10px] text-muted-foreground">
              {resultados.length === 0
                ? "Sin coincidencias."
                : `${resultados.length} campamento(s) encontrado(s)`}
            </p>
            {resultados.map((centro) => (
              <FilaCentroLista
                key={centro.id}
                centro={centro}
                estado={estados.get(centro.id) ?? ESTADO_FILA_VACIO}
                estadoReporte={estadosReporte.get(centro.id) ?? ESTADO_ICONOS_VACIO}
                seleccionado={seleccionado === centro.id}
                mostrarUnidad
                onSeleccionar={elegirCentro}
              />
            ))}
          </div>
        ) : (
          <div className="space-y-0.5">
            {gruposPorCuerpo.map((grupo) => (
              <div key={grupo.clave || "otros"} className="mb-1">
                <EncabezadoCuerpo meta={grupo.meta} total={grupo.total} />
                {grupo.unidades.map((u) => {
                  const activa = unidadesFiltro.has(u.clave);
                  const atenuada = hayFiltro && !activa;
                  const centrosUnidad = centrosPorUnidad.get(u.clave) ?? [];
                  const grupoAbierto = expandidos.has(u.clave);
                  const pendientesGrupo = centrosUnidad.reduce(
                    (n, centro) =>
                      n + ((estadosReporte.get(centro.id)?.tienePendiente ?? true) ? 1 : 0),
                    0,
                  );
                  return (
                    <Collapsible
                      key={u.clave}
                      open={grupoAbierto}
                      onOpenChange={(o) => onSetExpandido(u.clave, o)}
                    >
                      <div
                        className={cn(
                          "flex items-center gap-0.5 rounded-lg transition-opacity",
                          activa && "bg-primary/10 ring-1 ring-primary/40",
                          atenuada && "opacity-35",
                        )}
                      >
                        <button
                          type="button"
                          onClick={() => elegirUnidad(u.clave)}
                          title={
                            activa
                              ? "Quitar esta dirección del filtro"
                              : "Añadir esta dirección al filtro del mapa"
                          }
                          aria-pressed={activa}
                          className={cn(
                            "flex flex-1 items-center gap-2 rounded-lg px-1.5 py-1 text-left text-xs transition-colors hover:bg-muted/60",
                            activa && "font-semibold text-primary",
                          )}
                        >
                          <span
                            className="ml-1 size-2.5 shrink-0 rounded-full border border-white/70"
                            style={{ backgroundColor: u.color }}
                            aria-hidden
                          />
                          <span className="flex-1 truncate text-foreground">{u.label}</span>
                          {pendientesGrupo > 0 && (
                            <span
                              title={`${pendientesGrupo} campamento(s) con reporte diario pendiente`}
                              className="flex size-4 items-center justify-center rounded-full bg-amber-500/15 text-[9px] font-bold text-amber-500"
                            >
                              {pendientesGrupo}
                            </span>
                          )}
                          <Badge variant="outline" className="h-5 px-1.5 text-[10px]">
                            {centrosUnidad.length}
                          </Badge>
                        </button>
                        <CollapsibleTrigger asChild>
                          <button
                            type="button"
                            title="Ver campamentos asignados"
                            className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
                          >
                            <ChevronDown
                              className={cn(
                                "size-3.5 transition-transform",
                                grupoAbierto && "rotate-180",
                              )}
                            />
                          </button>
                        </CollapsibleTrigger>
                      </div>

                      <CollapsibleContent>
                        <div className="ml-3 mb-1 mt-0.5 space-y-0.5 border-l border-border pl-2">
                          {centrosUnidad.map((centro) => (
                            <FilaCentroLista
                              key={centro.id}
                              centro={centro}
                              estado={estados.get(centro.id) ?? ESTADO_FILA_VACIO}
                              estadoReporte={
                                estadosReporte.get(centro.id) ?? ESTADO_ICONOS_VACIO
                              }
                              seleccionado={seleccionado === centro.id}
                              onSeleccionar={elegirCentro}
                            />
                          ))}
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  );
                })}
              </div>
            ))}

            {(centrosPorUnidad.get("sin_asignar")?.length ?? 0) > 0 && (
              <Collapsible
                open={expandidos.has("sin_asignar")}
                onOpenChange={(o) => onSetExpandido("sin_asignar", o)}
              >
                <div
                  className={cn(
                    "flex items-center gap-0.5 rounded-lg transition-opacity",
                    unidadesFiltro.has("sin_asignar") && "bg-primary/10 ring-1 ring-primary/40",
                    hayFiltro && !unidadesFiltro.has("sin_asignar") && "opacity-35",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => elegirUnidad("sin_asignar")}
                    aria-pressed={unidadesFiltro.has("sin_asignar")}
                    className={cn(
                      "flex flex-1 items-center gap-2 rounded-lg px-1.5 py-1 text-left text-xs",
                      unidadesFiltro.has("sin_asignar")
                        ? "font-semibold text-primary"
                        : "opacity-80",
                    )}
                  >
                    <span className="text-foreground">Sin unidad asignada</span>
                    <Badge variant="outline" className="ml-auto h-5 px-1.5 text-[10px]">
                      {centrosPorUnidad.get("sin_asignar")!.length}
                    </Badge>
                  </button>
                  <CollapsibleTrigger asChild>
                    <button
                      type="button"
                      title="Ver campamentos sin unidad"
                      className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
                    >
                      <ChevronDown
                        className={cn(
                          "size-3.5 transition-transform",
                          expandidos.has("sin_asignar") && "rotate-180",
                        )}
                      />
                    </button>
                  </CollapsibleTrigger>
                </div>
                <CollapsibleContent>
                  <div className="ml-3 mb-1 mt-0.5 space-y-0.5 border-l border-border pl-2">
                    {(centrosPorUnidad.get("sin_asignar") ?? []).map((centro) => (
                      <FilaCentroLista
                        key={centro.id}
                        centro={centro}
                        estado={estados.get(centro.id) ?? ESTADO_FILA_VACIO}
                        estadoReporte={
                          estadosReporte.get(centro.id) ?? ESTADO_ICONOS_VACIO
                        }
                        seleccionado={seleccionado === centro.id}
                        onSeleccionar={elegirCentro}
                      />
                    ))}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            )}

            {hayFiltro && (
              <button
                type="button"
                onClick={onLimpiarFiltro}
                className="mt-2 w-full rounded-md border border-border/60 px-2 py-1.5 text-[10px] text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
              >
                Ver todas las direcciones
                {unidadesFiltro.size > 1 ? ` (${unidadesFiltro.size} activas)` : ""}
              </button>
            )}

            {sinUbicar.length > 0 && (
              <div className="mt-2 flex items-start gap-1.5 border-t border-border pt-2 text-[10px] text-muted-foreground">
                <MapPinOff className="mt-0.5 size-3 shrink-0" />
                <span>{sinUbicar.length} campamento(s) sin coordenadas aún.</span>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="shrink-0 border-t border-border px-3 py-1.5 text-[9.5px] leading-snug text-muted-foreground/80">
        Tocá una o varias unidades responsables para filtrar el mapa (el resto se opaca).
        Íconos por fila: salud, novedades, censo y parte diario (
        <span className="font-semibold text-emerald-400">verde</span> = listo,{" "}
        <span className="font-semibold text-rose-400">rosa</span> = casos activos).
      </div>
    </div>
    </>
  );
}

/** Encabezado de grupo: cuerpo policial dueño de las unidades listadas debajo. */
function EncabezadoCuerpo({ meta, total }: { meta: MetaCuerpo | null; total: number }) {
  return (
    <div className="mb-0.5 flex items-center gap-1.5 px-1.5 pt-1">
      <span
        className="flex size-4.5 shrink-0 items-center justify-center overflow-hidden rounded-full border bg-white text-[9px]"
        style={{ borderColor: meta?.color ?? "#64748b" }}
        aria-hidden
      >
        {meta?.logo ? (
          <LogoCuerpo src={meta.logo} priority="low" />
        ) : (
          <span aria-hidden>{meta?.icono ?? "🛡️"}</span>
        )}
      </span>
      <span className="min-w-0 flex-1 truncate text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {meta?.label ?? "Otras unidades"}
      </span>
      <span className="text-[9px] tabular-nums text-muted-foreground/70">{total}</span>
    </div>
  );
}

/** Estados precalculados exportados para ControlesMapaFlotantes. */
export { calcularEstadosFilas };
