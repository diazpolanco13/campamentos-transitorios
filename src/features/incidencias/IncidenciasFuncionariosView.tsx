import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { FilterX } from "lucide-react";
import type { Sesion } from "@/data/authSupabase";
import { useCasosSaludCentros } from "@/data/useCasosSaludCentros";
import { useEventosReportes } from "@/data/useEventosReportes";
import { useOcupacionesCentros } from "@/data/useOcupacionesCentros";
import { useSupabaseQueryConEstado } from "@/data/useSupabaseQuery";
import {
  actualizarCasoSalud,
  archivarCasoSalud,
  desarchivarCasoSalud,
} from "@/data/reposCasosSalud";
import { claveDia } from "@/data/reposSupabase";
import { desenvolver, type FilaSync } from "@/data/desenvolver";
import type { CentroTransitorio } from "@/domain/centrosTransitorios";
import {
  casosSaludPendientes,
  severidadMaximaPorDiaSeguimiento,
  type CasoSaludCentro,
  type EstatusCasoSalud,
} from "@/domain/seguimientoReportes";
import { puedeEditarCentro } from "@/domain/permisos";
import { EstadoError, EstadoVacio } from "@/components/skeletons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { CalendarioIncidencias } from "./CalendarioIncidencias";
import { ListaSeguimientoReportes, type ItemSeguimiento } from "./ListaSeguimientoReportes";
import { BandejaIncidenciasSkeleton } from "./BandejaIncidenciasSkeleton";

type FiltroTipo = "todos" | "salud" | "novedades";
type FiltroEstado = "seguimiento" | "archivadas";

/**
 * Bandeja única de la red: casos de salud y novedades del reporte diario.
 * "En seguimiento" = lo accionable (casos abiertos + novedades negativas);
 * "Histórico" = casos archivados y todas las novedades del período.
 */
export function IncidenciasFuncionariosView({ sesion }: { sesion: Sesion }) {
  const hoy = useMemo(() => claveDia(Date.now()), []);
  const desde = useMemo(() => {
    const [y, m, d] = hoy.split("-").map(Number);
    const dt = new Date(y, m - 1, d);
    dt.setDate(dt.getDate() - 60);
    return claveDia(dt.getTime());
  }, [hoy]);

  const { casos } = useCasosSaludCentros();
  const { eventos } = useEventosReportes({ desde });
  const snapshots = useOcupacionesCentros({ desde });

  type CentroFila = CentroTransitorio & { deleted: boolean };
  const {
    datos: filasCentros,
    cargando: cargandoCentros,
    error: errorCentros,
  } = useSupabaseQueryConEstado<CentroFila, FilaSync<CentroTransitorio>>("centros", {
    transform: desenvolver as (raw: FilaSync<CentroTransitorio>) => CentroFila,
    clientFilter: (c) => !c.deleted,
  });
  const centros = useMemo(
    () => [...filasCentros].sort((a, b) => (a.nro ?? 0) - (b.nro ?? 0)),
    [filasCentros],
  );
  const centrosPorId = useMemo(
    () => new Map<string, CentroTransitorio>(centros.map((c) => [c.id, c])),
    [centros],
  );

  // `/incidencias/archivadas` (ruta vieja) redirige aquí con ?estado=archivadas.
  const [searchParams] = useSearchParams();
  const [estado, setEstado] = useState<FiltroEstado>(
    searchParams.get("estado") === "archivadas" ? "archivadas" : "seguimiento",
  );
  const [tipo, setTipo] = useState<FiltroTipo>("todos");
  const [centroId, setCentroId] = useState<string>("todos");
  const [dia, setDia] = useState<string | null>(null);
  const [accionEnCursoId, setAccionEnCursoId] = useState<string | null>(null);

  const hayFiltros = tipo !== "todos" || centroId !== "todos" || dia !== null;

  function limpiarFiltros() {
    setTipo("todos");
    setCentroId("todos");
    setDia(null);
  }

  const casosPendientes = useMemo(() => casosSaludPendientes(casos), [casos]);
  const casosResueltos = useMemo(
    () => casos.filter((c) => c.estatus === "resuelto"),
    [casos],
  );
  const casosArchivados = useMemo(
    () => casos.filter((c) => c.estatus === "archivado"),
    [casos],
  );
  const novedadesNegativas = useMemo(
    () => eventos.filter((e) => e.tipo === "negativo"),
    [eventos],
  );

  const snapshotsFiltrados = useMemo(() => {
    if (centroId === "todos") return snapshots;
    return snapshots.filter((s) => s.centro_id === centroId);
  }, [snapshots, centroId]);
  const eventosCentro = useMemo(() => {
    if (centroId === "todos") return eventos;
    return eventos.filter((e) => e.centro_id === centroId);
  }, [eventos, centroId]);
  const severidadPorDia = useMemo(
    () => severidadMaximaPorDiaSeguimiento(snapshotsFiltrados, eventosCentro),
    [snapshotsFiltrados, eventosCentro],
  );

  const visibles = useMemo((): ItemSeguimiento[] => {
    const items: ItemSeguimiento[] = [];

    if (tipo === "todos" || tipo === "salud") {
      const base =
        estado === "seguimiento" ? [...casosPendientes, ...casosResueltos] : casosArchivados;
      for (const c of base) {
        if (centroId !== "todos" && c.centro_id !== centroId) continue;
        if (dia && c.reportado_dia !== dia) continue;
        items.push({ tipo: "salud", item: c });
      }
    }
    if (tipo === "todos" || tipo === "novedades") {
      const base = estado === "seguimiento" ? novedadesNegativas : eventos;
      for (const e of base) {
        if (centroId !== "todos" && e.centro_id !== centroId) continue;
        if (dia && e.dia !== dia) continue;
        items.push({ tipo: "novedad", item: e });
      }
    }

    return items.sort((a, b) => {
      const diaA = a.tipo === "salud" ? a.item.reportado_dia : a.item.dia;
      const diaB = b.tipo === "salud" ? b.item.reportado_dia : b.item.dia;
      if (diaA !== diaB) return diaB.localeCompare(diaA);
      const tsA = a.tipo === "salud" ? a.item.creada_ts : a.item.ts;
      const tsB = b.tipo === "salud" ? b.item.creada_ts : b.item.ts;
      return tsB - tsA;
    });
  }, [
    tipo,
    estado,
    centroId,
    dia,
    casosPendientes,
    casosResueltos,
    casosArchivados,
    novedadesNegativas,
    eventos,
  ]);

  const conteos = useMemo(() => {
    const filtraCentro = <T extends { centro_id: string }>(xs: T[]) =>
      centroId === "todos" ? xs : xs.filter((x) => x.centro_id === centroId);
    return {
      activos: filtraCentro(casosPendientes).length,
      porArchivar: filtraCentro(casosResueltos).length,
      negativas: filtraCentro(novedadesNegativas).length,
      novedades: filtraCentro(eventos).length,
    };
  }, [centroId, casosPendientes, casosResueltos, novedadesNegativas, eventos]);

  async function cambiarEstatus(id: string, estatus: EstatusCasoSalud) {
    setAccionEnCursoId(id);
    try {
      await actualizarCasoSalud(id, { estatus });
    } catch (err) {
      console.error("[IncidenciasFuncionarios] error actualizando caso:", err);
    } finally {
      setAccionEnCursoId(null);
    }
  }

  async function archivar(id: string) {
    setAccionEnCursoId(id);
    try {
      await archivarCasoSalud(id);
    } catch (err) {
      console.error("[IncidenciasFuncionarios] error archivando caso:", err);
    } finally {
      setAccionEnCursoId(null);
    }
  }

  async function desarchivar(id: string) {
    setAccionEnCursoId(id);
    try {
      await desarchivarCasoSalud(id);
    } catch (err) {
      console.error("[IncidenciasFuncionarios] error desarchivando caso:", err);
    } finally {
      setAccionEnCursoId(null);
    }
  }

  if (cargandoCentros) {
    return <BandejaIncidenciasSkeleton enMarco={false} />;
  }

  if (errorCentros) {
    return (
      <EstadoError
        titulo="No se pudieron cargar las incidencias"
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
    <div className="animate-in fade-in-0 p-4 duration-200 lg:p-6">
      <div className="mx-auto grid w-full max-w-7xl grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Filtros</CardTitle>
              <CardDescription>Casos de salud y novedades del reporte diario</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <CampoFiltro label="Estado">
                <div className="flex overflow-hidden rounded-lg border border-border text-xs font-medium">
                  {(
                    [
                      { valor: "seguimiento" as const, label: "En seguimiento" },
                      { valor: "archivadas" as const, label: "Histórico" },
                    ]
                  ).map((s) => (
                    <button
                      key={s.valor}
                      type="button"
                      onClick={() => setEstado(s.valor)}
                      className={cn(
                        "flex-1 border-r border-border px-2 py-1.5 transition-colors last:border-r-0",
                        estado === s.valor
                          ? "bg-primary/15 text-foreground"
                          : "text-muted-foreground hover:bg-muted/40",
                      )}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </CampoFiltro>

              <CampoFiltro label="Tipo">
                <Select value={tipo} onValueChange={(v) => setTipo(v as FiltroTipo)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Salud + novedades</SelectItem>
                    <SelectItem value="salud">Solo salud</SelectItem>
                    <SelectItem value="novedades">Solo novedades</SelectItem>
                  </SelectContent>
                </Select>
              </CampoFiltro>

              <CampoFiltro label="Campamento">
                <Select value={centroId} onValueChange={setCentroId}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent position="popper">
                    <SelectItem value="todos">Todos los campamentos</SelectItem>
                    {centros.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        N.° {c.nro} · {c.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </CampoFiltro>

              {hayFiltros && (
                <Button variant="outline" size="sm" className="w-full gap-1.5" onClick={limpiarFiltros}>
                  <FilterX className="size-3.5" />
                  Limpiar filtros
                </Button>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Calendario de la red</CardTitle>
              <CardDescription>
                Punto de color = actividad del día. Clic para filtrar.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <CalendarioIncidencias
                severidadPorDia={severidadPorDia}
                diaSeleccionado={dia}
                onSeleccionarDia={setDia}
              />
              <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
                <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <span className="size-1.5 rounded-full bg-red-500" />
                  Salud / negativa
                </span>
                <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <span className="size-1.5 rounded-full bg-emerald-500" />
                  Solo positivas
                </span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Resumen</CardTitle>
              <CardDescription>Últimos 60 días</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-1.5">
              {[
                { label: "Salud activa", valor: conteos.activos },
                { label: "Por archivar", valor: conteos.porArchivar },
                { label: "Novedades", valor: conteos.novedades },
                { label: "Negativas", valor: conteos.negativas },
              ].map(({ label, valor }) => (
                <div
                  key={label}
                  className="flex items-center justify-between gap-1.5 rounded-lg border border-border bg-card px-2 py-1.5 text-xs"
                >
                  <span className="truncate text-muted-foreground">{label}</span>
                  <span className="shrink-0 font-semibold tabular-nums text-foreground">{valor}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <CardTitle className="text-base lg:text-lg">
                  {estado === "seguimiento" ? "En seguimiento" : "Histórico"}
                  {dia && (
                    <span className="ml-2 text-sm font-normal text-muted-foreground">del {dia}</span>
                  )}
                </CardTitle>
                <CardDescription>
                  {estado === "seguimiento"
                    ? "Registros del reporte diario que requieren atención o cierre"
                    : "Casos de salud archivados y novedades registradas"}
                </CardDescription>
              </div>
              <div className="flex items-center gap-1.5">
                <Badge variant="outline" className="tabular-nums">
                  {visibles.length} visible(s)
                </Badge>
                {conteos.activos > 0 && (
                  <Badge variant="outline" className="border-rose-500/40 tabular-nums text-rose-400">
                    {conteos.activos} salud activo(s)
                  </Badge>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {visibles.length === 0 ? (
              <EstadoVacio
                titulo={
                  estado === "seguimiento"
                    ? "Sin casos en seguimiento"
                    : "Sin registros en el histórico"
                }
                descripcion="Cuando haya novedades o casos de salud, aparecerán aquí."
              />
            ) : (
              <ListaSeguimientoReportes
                items={visibles}
                centrosPorId={centrosPorId}
                mostrarAccionesSalud
                puedeEditarSalud={(caso: CasoSaludCentro) =>
                  puedeEditarCentro(sesion.user, caso.centro_id)
                }
                onCambiarEstatusSalud={(id, est) => void cambiarEstatus(id, est)}
                onArchivarSalud={(id) => void archivar(id)}
                onDesarchivarSalud={(id) => void desarchivar(id)}
                accionEnCursoId={accionEnCursoId}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function CampoFiltro({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      {children}
    </div>
  );
}
