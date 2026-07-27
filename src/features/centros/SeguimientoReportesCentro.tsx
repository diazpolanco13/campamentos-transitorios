// Seguimiento de salud, trabajos y novedades del reporte diario.
// Se pueden crear aquí o en el reporte.

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Archive,
  CalendarDays,
  CalendarPlus,
  Check,
  ChevronDown,
  ChevronRight,
  Circle,
  Clock,
  Loader2,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Plus,
  Stethoscope,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  Wrench,
  X,
} from "lucide-react";
import { useCasosSaludCentros } from "@/data/useCasosSaludCentros";
import { useEventosReportes } from "@/data/useEventosReportes";
import { useOcupacionesCentros } from "@/data/useOcupacionesCentros";
import { useReparacionesCentros } from "@/data/useReparacionesCentros";
import {
  actualizarCasoSalud,
  archivarCasoSalud,
  crearCasoSalud,
  eliminarCasoSalud,
} from "@/data/reposCasosSalud";
import {
  actualizarEventoReporte,
  crearEventoReporte,
  eliminarEventoReporte,
} from "@/data/reposEventosReportes";
import { claveDia } from "@/data/reposSupabase";
import { ESTATUS_CASO_SALUD, puedeArchivarCasoSalud } from "@/domain/casosSalud";
import {
  casosSaludEnSeguimiento,
  casosSaludPendientes,
  contadoresSeguimientoCentro,
  marcasCalendarioSeguimiento,
  META_ESTATUS_CASO_SALUD,
  META_TIPO_EVENTO_REPORTE,
  type CasoSaludCentro,
  type EstatusCasoSalud,
} from "@/domain/seguimientoReportes";
import {
  CATALOGO_TIPOS_EVENTO_REPORTE,
  TIPO_EVENTO_REPORTE_DEFAULT,
  eventosArchivados,
  eventosDelDia,
  textoParticipantesEvento,
  tituloEventoValido,
  type EventoReporte,
  type TipoEventoReporte,
} from "@/domain/eventosReportes";
import type { CentroTransitorio } from "@/domain/centrosTransitorios";
import { BadgeAntiguedad } from "@/components/ui/badge-antiguedad";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PaginadorTabla } from "@/components/ui/pagination";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { ChecklistTituloNovedad } from "@/features/centros/ChecklistTituloNovedad";
import { ConfirmarTituloDescriptivoDialog } from "@/features/centros/ConfirmarTituloDescriptivoDialog";
import { claseSelectReporte } from "@/features/centros/clasesReporte";
import {
  CalendarioSelectorDia,
  formatearDiaCalendario,
} from "./CalendarioSelectorDia";
import { GraficoSeguimientoCentro } from "./GraficoSeguimientoCentro";
import {
  contarTrabajosPendientesSeguimiento,
  SeguimientoTrabajosCentro,
} from "./SeguimientoTrabajosCentro";
import {
  EncabezadoDiaSeguimiento,
  SEGUIMIENTO_ITEMS_POR_PAGINA,
  agruparPorDiaCampo,
} from "./seguimientoListaUi";

interface Props {
  centro: CentroTransitorio;
  puedeEditar: boolean;
  variant?: "compacto" | "expandido";
  /** Abre el formulario del reporte en la fase indicada (parte | salud | trabajos | novedades). */
  onIrAReporte?: (fase?: string) => void;
}

type TabSeguimiento = "salud" | "trabajos" | "novedades";

const LEYENDA_CALENDARIO = [
  { color: "#ef4444", label: "Salud o novedad negativa" },
  { color: "#22c55e", label: "Solo novedades positivas" },
];

function formatearHora(ts: number): string {
  return new Date(ts).toLocaleTimeString("es-VE", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function horaDesdeTs(ts: number): string {
  if (!ts) return "";
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function tsDesdeHora(hora: string, dia: string): number {
  const base = new Date(`${dia}T00:00:00`);
  if (!hora.trim()) return Date.now();
  const [h, m] = hora.split(":").map((x) => Number.parseInt(x, 10));
  if (!Number.isFinite(h) || !Number.isFinite(m)) return Date.now();
  base.setHours(h, m, 0, 0);
  return base.getTime();
}

/** Partes con contador de salud pero sin casos detallados registrados. */
function TarjetaCasoSalud({
  caso,
  puedeEditar,
  editando,
  borrador,
  onBorradorChange,
  onEditar,
  onCancelarEdicion,
  onGuardar,
  onCambiarEstatus,
  onArchivar,
  onEliminar,
  cambiando,
  archivando,
  eliminando,
  guardando,
}: {
  caso: CasoSaludCentro;
  puedeEditar: boolean;
  editando: boolean;
  borrador: { titulo: string; descripcion: string; estatus: EstatusCasoSalud };
  onBorradorChange: (b: { titulo: string; descripcion: string; estatus: EstatusCasoSalud }) => void;
  onEditar: () => void;
  onCancelarEdicion: () => void;
  onGuardar: () => void;
  onCambiarEstatus: (estatus: EstatusCasoSalud) => void;
  onArchivar: () => void;
  onEliminar: () => void;
  cambiando: boolean;
  archivando: boolean;
  eliminando: boolean;
  guardando: boolean;
}) {
  const meta = META_ESTATUS_CASO_SALUD[caso.estatus];
  const ocupado = cambiando || archivando || eliminando || guardando;
  const puedeCambiarEstatus = puedeEditar && !editando && caso.estatus !== "archivado";
  const puedeArchivar = puedeEditar && puedeArchivarCasoSalud(caso.estatus);

  if (editando) {
    return (
      <div className="rounded-lg border border-teal-500/50 bg-muted/10 px-3 py-3 ring-1 ring-teal-500/20">
        <div className="space-y-3">
          <Input
            className="h-10 text-sm"
            value={borrador.titulo}
            disabled={guardando}
            onChange={(e) => onBorradorChange({ ...borrador, titulo: e.target.value })}
            placeholder="Título del caso"
          />
          <Textarea
            className="min-h-[4rem] text-sm"
            rows={2}
            value={borrador.descripcion}
            disabled={guardando}
            onChange={(e) => onBorradorChange({ ...borrador, descripcion: e.target.value })}
            placeholder="Detalle (opcional)"
          />
          <Select
            value={borrador.estatus}
            onValueChange={(v) =>
              onBorradorChange({ ...borrador, estatus: v as EstatusCasoSalud })
            }
            disabled={guardando}
          >
            <SelectTrigger className={cn(claseSelectReporte, "mt-0")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ESTATUS_CASO_SALUD.filter((e) => e.valor !== "archivado").map((e) => (
                <SelectItem key={e.valor} value={e.valor}>
                  {e.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              type="button"
              size="sm"
              className="sm:flex-1"
              disabled={!borrador.titulo.trim() || guardando}
              onClick={onGuardar}
            >
              {guardando ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
              Guardar
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={guardando}
              onClick={onCancelarEdicion}
            >
              <X className="size-4" />
              Cancelar
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "rounded-lg border bg-muted/10 px-3 py-3",
        caso.estatus === "activo" && "border-red-500/30",
        caso.estatus === "en_proceso" && "border-amber-500/30",
        caso.estatus === "resuelto" && "border-emerald-500/30",
        caso.estatus === "archivado" && "border-border/70",
      )}
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge
              variant="outline"
              className="text-[9px]"
              style={{ borderColor: `${meta.color}66`, color: meta.color }}
            >
              {meta.label}
            </Badge>
            <BadgeAntiguedad
              reportadoDia={caso.reportado_dia}
              resueltaTs={caso.resuelta_ts}
              creadaTs={caso.creada_ts}
            />
            {ocupado && <Loader2 className="size-3.5 animate-spin text-muted-foreground" />}
          </div>
          <p className="mt-1.5 text-sm font-medium leading-snug text-foreground">{caso.titulo}</p>
          {caso.descripcion ? (
            <p className="mt-0.5 text-xs leading-snug text-muted-foreground">{caso.descripcion}</p>
          ) : null}
          <p className="mt-1 text-[10px] text-muted-foreground">
            Reportado {formatearDiaCalendario(caso.reportado_dia)}
            {caso.updated_by ? ` · ${caso.updated_by}` : ""}
          </p>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1.5 sm:flex-row sm:items-start">
          {puedeCambiarEstatus ? (
            <Select
              value={caso.estatus}
              disabled={ocupado}
              onValueChange={(v) => onCambiarEstatus(v as EstatusCasoSalud)}
            >
              <SelectTrigger
                className="h-8 w-[8rem] shrink-0 text-[11px]"
                style={{ borderColor: `${meta.color}66`, color: meta.color }}
              >
                {cambiando ? <Loader2 className="size-3 animate-spin" /> : <SelectValue />}
              </SelectTrigger>
              <SelectContent>
                {ESTATUS_CASO_SALUD.filter((e) => e.valor !== "archivado").map((e) => (
                  <SelectItem key={e.valor} value={e.valor} className="text-xs">
                    {e.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : caso.estatus === "archivado" ? (
            <Badge
              variant="outline"
              className="h-5 shrink-0 px-1.5 text-[10px]"
              style={{ borderColor: `${meta.color}66`, color: meta.color }}
            >
              {meta.label}
            </Badge>
          ) : null}

          {puedeEditar && !editando && (
            <div className="flex shrink-0 items-center gap-0.5">
              {puedeArchivar && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      disabled={ocupado}
                      aria-label="Archivar caso"
                      title="Archivar"
                    >
                      {archivando ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Archive className="size-4" />
                      )}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>¿Archivar caso de salud?</AlertDialogTitle>
                      <AlertDialogDescription>
                        «{caso.titulo}» pasará a Archivados. Podrás consultarlo después en esa
                        pestaña.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction onClick={onArchivar}>Archivar</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
              {caso.estatus !== "archivado" && (
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  disabled={ocupado}
                  aria-label="Editar caso"
                  onClick={onEditar}
                >
                  <Pencil className="size-4" />
                </Button>
              )}
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    className="text-destructive hover:text-destructive"
                    disabled={ocupado}
                    aria-label="Eliminar caso"
                  >
                    {eliminando ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Trash2 className="size-4" />
                    )}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>¿Eliminar caso de salud?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Se borrará «{caso.titulo}» de forma permanente. Esta acción no se puede
                      deshacer.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      onClick={onEliminar}
                    >
                      Eliminar
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function TarjetaNovedad({
  evento,
  puedeEditar,
  editando,
  borrador,
  onBorradorChange,
  onEditar,
  onCancelarEdicion,
  onGuardar,
  onEliminar,
  guardando,
  eliminando,
}: {
  evento: EventoReporte;
  puedeEditar: boolean;
  editando: boolean;
  borrador: { tipo: TipoEventoReporte; hora: string; titulo: string; descripcion: string };
  onBorradorChange: (b: {
    tipo: TipoEventoReporte;
    hora: string;
    titulo: string;
    descripcion: string;
  }) => void;
  onEditar: () => void;
  onCancelarEdicion: () => void;
  onGuardar: () => void;
  onEliminar: () => void;
  guardando: boolean;
  eliminando: boolean;
}) {
  const meta = META_TIPO_EVENTO_REPORTE[evento.tipo];
  const ocupado = guardando || eliminando;

  return (
    <div
      className={cn(
        "rounded-lg border bg-muted/10 px-3 py-3",
        editando ? "border-teal-500/50 ring-1 ring-teal-500/20" : "border-border/70",
      )}
    >
      <div className="flex items-start gap-2">
        {!editando &&
          (evento.tipo === "positivo" ? (
            <ThumbsUp className="mt-0.5 size-4 shrink-0 text-emerald-400" />
          ) : evento.tipo === "negativo" ? (
            <ThumbsDown className="mt-0.5 size-4 shrink-0 text-red-400" />
          ) : (
            <Circle className="mt-0.5 size-4 shrink-0 fill-zinc-400 text-zinc-400" />
          ))}
        <div className="min-w-0 flex-1">
          {!editando && (
            <>
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge
                  variant="outline"
                  className="text-[9px]"
                  style={{ borderColor: `${meta.color}66`, color: meta.color }}
                >
                  {meta.label}
                </Badge>
                <span className="text-[10px] text-muted-foreground">
                  {formatearDiaCalendario(evento.dia)} · {formatearHora(evento.ts)}
                </span>
                {ocupado && <Loader2 className="size-3.5 animate-spin text-muted-foreground" />}
              </div>
              <p className="mt-1 text-sm font-medium leading-snug text-foreground">{evento.titulo}</p>
              {evento.descripcion ? (
                <p className="mt-0.5 text-xs leading-snug text-muted-foreground">{evento.descripcion}</p>
              ) : null}
              <p className="mt-1 text-[10px] text-muted-foreground">
                {textoParticipantesEvento(evento)}
                {evento.creada_por ? ` · ${evento.creada_por}` : ""}
              </p>
            </>
          )}
        </div>
        {puedeEditar && !editando && (
          <div className="flex shrink-0 gap-1">
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              disabled={ocupado}
              aria-label="Editar novedad"
              onClick={onEditar}
            >
              <Pencil className="size-4" />
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  className="text-destructive hover:text-destructive"
                  disabled={ocupado}
                  aria-label="Eliminar novedad"
                >
                  {eliminando ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>¿Eliminar novedad?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Se eliminará «{evento.titulo}» del reporte del{" "}
                    {formatearDiaCalendario(evento.dia)}. Esta acción no se puede deshacer.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={onEliminar}>Eliminar</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        )}
      </div>

      {editando && (
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[140px_minmax(0,1fr)]">
            <div>
              <Label className="text-[11px] text-muted-foreground">Tipo</Label>
              <Select
                value={borrador.tipo}
                disabled={guardando}
                onValueChange={(v) => onBorradorChange({ ...borrador, tipo: v as TipoEventoReporte })}
              >
                <SelectTrigger className={claseSelectReporte}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATALOGO_TIPOS_EVENTO_REPORTE.map((t) => (
                    <SelectItem key={t.valor} value={t.valor}>
                      <span className="flex items-center gap-2">
                        <span
                          className="size-2 shrink-0 rounded-full"
                          style={{ backgroundColor: t.color }}
                          aria-hidden
                        />
                        {t.label}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[11px] text-muted-foreground">Hora</Label>
              <Input
                type="time"
                className="mt-1"
                disabled={guardando}
                value={borrador.hora}
                onChange={(e) => onBorradorChange({ ...borrador, hora: e.target.value })}
              />
            </div>
          </div>
          <div>
            <Label className="text-[11px] text-muted-foreground">Título descriptivo</Label>
            <Input
              className="mt-1"
              value={borrador.titulo}
              disabled={guardando}
              onChange={(e) => onBorradorChange({ ...borrador, titulo: e.target.value })}
              placeholder="Ej. Pelea entre dos adultos en módulo B; mediación y separación"
            />
            <ChecklistTituloNovedad titulo={borrador.titulo} />
          </div>
          <div>
            <Label className="text-[11px] text-muted-foreground">Detalles de la novedad</Label>
            <Textarea
              className="mt-1"
              rows={3}
              value={borrador.descripcion}
              disabled={guardando}
              onChange={(e) => onBorradorChange({ ...borrador, descripcion: e.target.value })}
              placeholder="Contexto extra, acciones y seguimiento (opcional). No sustituye al título descriptivo."
            />
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <ConfirmarTituloDescriptivoDialog onConfirm={onGuardar}>
              <Button
                type="button"
                size="sm"
                className="sm:flex-1"
                disabled={!tituloEventoValido(borrador.titulo) || guardando}
              >
                {guardando ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                Guardar
              </Button>
            </ConfirmarTituloDescriptivoDialog>
            <Button type="button" size="sm" variant="outline" disabled={guardando} onClick={onCancelarEdicion}>
              <X className="size-4" />
              Cancelar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function SeguimientoExpandido({
  centro,
  puedeEditar,
  onIrAReporte,
}: {
  centro: CentroTransitorio;
  puedeEditar: boolean;
  onIrAReporte?: (fase?: string) => void;
}) {
  const hoyClave = useMemo(() => claveDia(Date.now()), []);
  const desde = useMemo(() => {
    const [y, m, d] = hoyClave.split("-").map(Number);
    const dt = new Date(y, m - 1, d);
    dt.setDate(dt.getDate() - 30);
    return claveDia(dt.getTime());
  }, [hoyClave]);

  const [verNovedadesAnteriores, setVerNovedadesAnteriores] = useState(false);

  const { casos: todosCasos, recargar: recargarCasos } = useCasosSaludCentros({ centroId: centro.id });
  const { eventos, recargar: recargarEventos } = useEventosReportes({
    centroId: centro.id,
    desde: verNovedadesAnteriores ? undefined : desde,
  });
  const snapshots = useOcupacionesCentros({ centroId: centro.id, desde });
  const { trabajos: trabajosActivosLista, recargar: recargarTrabajosActivos } = useReparacionesCentros({
    centroId: centro.id,
    soloActivos: true,
  });
  const { trabajos: trabajosArchivadosLista, recargar: recargarTrabajosArchivados } =
    useReparacionesCentros({
      centroId: centro.id,
      estatus: "archivado",
    });

  const recargarTrabajos = useCallback(async () => {
    await Promise.all([recargarTrabajosActivos(), recargarTrabajosArchivados()]);
  }, [recargarTrabajosActivos, recargarTrabajosArchivados]);

  const casos = useMemo(() => casosSaludEnSeguimiento(todosCasos), [todosCasos]);
  const trabajosPendientesCount = useMemo(
    () => contarTrabajosPendientesSeguimiento(trabajosActivosLista),
    [trabajosActivosLista],
  );

  const contadores = useMemo(
    () => contadoresSeguimientoCentro(casos, eventos, hoyClave),
    [casos, eventos, hoyClave],
  );
  const marcasPorDia = useMemo(
    () => marcasCalendarioSeguimiento(centro.id, snapshots, eventos),
    [centro.id, snapshots, eventos],
  );

  // Pestaña activa: salud con pendientes → trabajos abiertos → novedades.
  const [tabManual, setTabManual] = useState<TabSeguimiento | null>(null);
  const [subSalud, setSubSalud] = useState<"seguimiento" | "archivados">("seguimiento");
  const [subNovedades, setSubNovedades] = useState<"seguimiento" | "archivados">(
    "seguimiento",
  );
  const [paginaSalud, setPaginaSalud] = useState(0);
  const [paginaNovedades, setPaginaNovedades] = useState(0);
  const [diaSel, setDiaSel] = useState<string | null>(null);
  const [calendarioAbierto, setCalendarioAbierto] = useState(false);
  const [evolucionAbierta, setEvolucionAbierta] = useState(false);
  const [cambiandoId, setCambiandoId] = useState<string | null>(null);
  const [archivandoId, setArchivandoId] = useState<string | null>(null);
  const [eliminandoCasoId, setEliminandoCasoId] = useState<string | null>(null);
  const [guardandoCasoId, setGuardandoCasoId] = useState<string | null>(null);
  const [editandoCasoId, setEditandoCasoId] = useState<string | null>(null);
  const [borradorCaso, setBorradorCaso] = useState({
    titulo: "",
    descripcion: "",
    estatus: "activo" as EstatusCasoSalud,
  });
  const [formularioNuevoCaso, setFormularioNuevoCaso] = useState(false);
  const [nuevoCaso, setNuevoCaso] = useState({
    titulo: "",
    descripcion: "",
    estatus: "activo" as EstatusCasoSalud,
  });
  const [guardandoNuevoCaso, setGuardandoNuevoCaso] = useState(false);

  const [editandoNovedadId, setEditandoNovedadId] = useState<string | null>(null);
  const [borradorNovedad, setBorradorNovedad] = useState({
    tipo: TIPO_EVENTO_REPORTE_DEFAULT as TipoEventoReporte,
    hora: "",
    titulo: "",
    descripcion: "",
  });
  const [formularioNuevaNovedad, setFormularioNuevaNovedad] = useState(false);
  const [nuevaNovedad, setNuevaNovedad] = useState({
    tipo: TIPO_EVENTO_REPORTE_DEFAULT as TipoEventoReporte,
    hora: "",
    titulo: "",
    descripcion: "",
  });
  const [guardandoNuevaNovedad, setGuardandoNuevaNovedad] = useState(false);
  const [guardandoNovedadId, setGuardandoNovedadId] = useState<string | null>(null);
  const [eliminandoNovedadId, setEliminandoNovedadId] = useState<string | null>(null);

  const casosPendientes = useMemo(() => casosSaludPendientes(casos), [casos]);
  const casosResueltos = useMemo(
    () => casos.filter((c) => c.estatus === "resuelto"),
    [casos],
  );
  const historialCasos = useMemo(
    () => todosCasos.filter((c) => c.estatus === "archivado"),
    [todosCasos],
  );

  // Novedades: del día = en seguimiento; día anterior = archivadas (auto al cerrar el día).
  const novedadesEnSeguimiento = useMemo(
    () =>
      [...eventosDelDia(eventos, centro.id, hoyClave)].sort(
        (a, b) => b.ts - a.ts || a.titulo.localeCompare(b.titulo, "es"),
      ),
    [eventos, centro.id, hoyClave],
  );
  const novedadesArchivadas = useMemo(
    () => eventosArchivados(eventos, centro.id, hoyClave),
    [eventos, centro.id, hoyClave],
  );

  const tab: TabSeguimiento =
    tabManual ??
    (casosPendientes.length > 0
      ? "salud"
      : trabajosPendientesCount > 0
        ? "trabajos"
        : "novedades");

  function seleccionarDia(dia: string | null) {
    setDiaSel(dia);
    if (dia) {
      setEvolucionAbierta(true);
      setCalendarioAbierto(true);
    }
  }

  const listaCasos = useMemo(() => {
    const base =
      subSalud === "archivados"
        ? historialCasos
        : [...casosPendientes, ...casosResueltos];
    const filtrados = diaSel ? base.filter((c) => c.reportado_dia === diaSel) : base;
    return [...filtrados].sort(
      (a, b) => b.reportado_dia.localeCompare(a.reportado_dia) || b.creada_ts - a.creada_ts,
    );
  }, [subSalud, casosPendientes, casosResueltos, historialCasos, diaSel]);

  const totalPaginasSalud = Math.max(
    1,
    Math.ceil(listaCasos.length / SEGUIMIENTO_ITEMS_POR_PAGINA),
  );
  const paginaSaludSegura = Math.min(paginaSalud, totalPaginasSalud - 1);
  const listaCasosPagina = useMemo(() => {
    const inicio = paginaSaludSegura * SEGUIMIENTO_ITEMS_POR_PAGINA;
    return listaCasos.slice(inicio, inicio + SEGUIMIENTO_ITEMS_POR_PAGINA);
  }, [listaCasos, paginaSaludSegura]);

  const listaNovedades = useMemo(() => {
    const base =
      subNovedades === "archivados" ? novedadesArchivadas : novedadesEnSeguimiento;
    const filtrados = diaSel ? base.filter((e) => e.dia === diaSel) : base;
    return [...filtrados].sort(
      (a, b) => b.dia.localeCompare(a.dia) || b.ts - a.ts || a.titulo.localeCompare(b.titulo, "es"),
    );
  }, [subNovedades, novedadesArchivadas, novedadesEnSeguimiento, diaSel]);

  const totalPaginasNovedades = Math.max(
    1,
    Math.ceil(listaNovedades.length / SEGUIMIENTO_ITEMS_POR_PAGINA),
  );
  const paginaNovedadesSegura = Math.min(paginaNovedades, totalPaginasNovedades - 1);
  const listaNovedadesPagina = useMemo(() => {
    const inicio = paginaNovedadesSegura * SEGUIMIENTO_ITEMS_POR_PAGINA;
    return listaNovedades.slice(inicio, inicio + SEGUIMIENTO_ITEMS_POR_PAGINA);
  }, [listaNovedades, paginaNovedadesSegura]);

  useEffect(() => {
    setPaginaSalud(0);
  }, [subSalud, diaSel]);

  useEffect(() => {
    setPaginaNovedades(0);
  }, [subNovedades, diaSel, verNovedadesAnteriores]);

  const diaMarcado = diaSel;

  async function cambiarEstatus(id: string, estatus: EstatusCasoSalud) {
    setCambiandoId(id);
    try {
      await actualizarCasoSalud(id, { estatus });
      await recargarCasos();
    } finally {
      setCambiandoId(null);
    }
  }

  async function archivar(id: string) {
    setArchivandoId(id);
    try {
      await archivarCasoSalud(id);
      await recargarCasos();
      if (editandoCasoId === id) cancelarEdicionCaso();
    } finally {
      setArchivandoId(null);
    }
  }

  async function eliminarCaso(id: string) {
    setEliminandoCasoId(id);
    try {
      await eliminarCasoSalud(id);
      await recargarCasos();
      if (editandoCasoId === id) cancelarEdicionCaso();
    } finally {
      setEliminandoCasoId(null);
    }
  }

  function cancelarEdicionCaso() {
    setEditandoCasoId(null);
    setBorradorCaso({ titulo: "", descripcion: "", estatus: "activo" });
  }

  function cancelarNuevoCaso() {
    setFormularioNuevoCaso(false);
    setNuevoCaso({ titulo: "", descripcion: "", estatus: "activo" });
  }

  function abrirNuevoCaso() {
    cancelarEdicionCaso();
    cancelarNuevaNovedad();
    setEditandoNovedadId(null);
    setSubSalud("seguimiento");
    setFormularioNuevoCaso(true);
  }

  function iniciarEdicionCaso(caso: CasoSaludCentro) {
    setEditandoNovedadId(null);
    cancelarNuevoCaso();
    setEditandoCasoId(caso.id);
    setBorradorCaso({
      titulo: caso.titulo,
      descripcion: caso.descripcion,
      estatus: caso.estatus,
    });
  }

  async function guardarCasoEditado(id: string) {
    if (!borradorCaso.titulo.trim()) return;
    setGuardandoCasoId(id);
    try {
      await actualizarCasoSalud(id, borradorCaso);
      await recargarCasos();
      cancelarEdicionCaso();
    } finally {
      setGuardandoCasoId(null);
    }
  }

  async function guardarNuevoCaso() {
    if (!nuevoCaso.titulo.trim()) return;
    setGuardandoNuevoCaso(true);
    try {
      await crearCasoSalud({
        centro_id: centro.id,
        titulo: nuevoCaso.titulo,
        descripcion: nuevoCaso.descripcion,
        estatus: nuevoCaso.estatus,
        reportado_dia: diaSel ?? hoyClave,
      });
      await recargarCasos();
      cancelarNuevoCaso();
    } finally {
      setGuardandoNuevoCaso(false);
    }
  }

  function cancelarEdicionNovedad() {
    setEditandoNovedadId(null);
    setBorradorNovedad({ tipo: TIPO_EVENTO_REPORTE_DEFAULT, hora: "", titulo: "", descripcion: "" });
  }

  function cancelarNuevaNovedad() {
    setFormularioNuevaNovedad(false);
    setNuevaNovedad({ tipo: TIPO_EVENTO_REPORTE_DEFAULT, hora: "", titulo: "", descripcion: "" });
  }

  function abrirNuevaNovedad() {
    cancelarEdicionCaso();
    cancelarNuevoCaso();
    cancelarEdicionNovedad();
    setSubNovedades(diaSel && diaSel < hoyClave ? "archivados" : "seguimiento");
    setFormularioNuevaNovedad(true);
  }

  function iniciarEdicionNovedad(evento: EventoReporte) {
    setEditandoCasoId(null);
    cancelarNuevoCaso();
    cancelarNuevaNovedad();
    setSubNovedades(evento.dia < hoyClave ? "archivados" : "seguimiento");
    setEditandoNovedadId(evento.id);
    setBorradorNovedad({
      tipo: evento.tipo,
      hora: horaDesdeTs(evento.ts),
      titulo: evento.titulo,
      descripcion: evento.descripcion,
    });
  }

  async function guardarNovedadEditada(evento: EventoReporte) {
    if (!tituloEventoValido(borradorNovedad.titulo)) return;
    setGuardandoNovedadId(evento.id);
    try {
      await actualizarEventoReporte(evento.id, {
        tipo: borradorNovedad.tipo,
        titulo: borradorNovedad.titulo,
        descripcion: borradorNovedad.descripcion,
        ts: tsDesdeHora(borradorNovedad.hora, evento.dia),
      });
      await recargarEventos();
      cancelarEdicionNovedad();
    } finally {
      setGuardandoNovedadId(null);
    }
  }

  async function guardarNuevaNovedad() {
    if (!tituloEventoValido(nuevaNovedad.titulo)) return;
    const dia = diaSel ?? hoyClave;
    setGuardandoNuevaNovedad(true);
    try {
      await crearEventoReporte({
        centro_id: centro.id,
        dia,
        tipo: nuevaNovedad.tipo,
        titulo: nuevaNovedad.titulo,
        descripcion: nuevaNovedad.descripcion,
        ts: tsDesdeHora(nuevaNovedad.hora, dia),
      });
      await recargarEventos();
      cancelarNuevaNovedad();
    } finally {
      setGuardandoNuevaNovedad(false);
    }
  }

  async function eliminarNovedad(id: string) {
    setEliminandoNovedadId(id);
    try {
      await eliminarEventoReporte(id);
      await recargarEventos();
      if (editandoNovedadId === id) cancelarEdicionNovedad();
    } finally {
      setEliminandoNovedadId(null);
    }
  }

  const hayAlerta =
    contadores.casosActivos > 0 ||
    contadores.novedadesNegativasRecientes > 0 ||
    trabajosPendientesCount > 0;
  // Badge Salud = casos abiertos (activo / en proceso).
  const totalSaludTab = casosPendientes.length;

  const tabTriggerClass = cn(
    "relative flex h-full min-h-0 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-none px-2 py-0",
    "!border-x-transparent !border-t-transparent !border-b-2 !border-b-transparent !bg-transparent !shadow-none",
    "text-xs font-medium text-muted-foreground",
    "transition-colors hover:text-foreground",
    "after:!hidden after:!content-none",
    "data-active:!border-x-transparent data-active:!border-t-transparent data-active:!border-b-primary",
    "data-active:!bg-transparent data-active:!font-semibold data-active:!text-teal-300 data-active:!shadow-none",
    "dark:data-active:!border-b-primary dark:data-active:!bg-transparent",
  );

  function renderListaSalud(casosLista: CasoSaludCentro[]) {
    const vacio = casosLista.length === 0 && listaCasos.length === 0;

    if (vacio) {
      return (
        <div className="rounded-lg border border-dashed border-border px-6 py-10 text-center">
          <Stethoscope className="mx-auto size-10 text-muted-foreground/40" />
          <p className="mt-3 text-sm font-medium text-foreground">
            {subSalud === "archivados"
              ? diaSel
                ? "Sin casos archivados ese día"
                : "Sin casos archivados"
              : "Sin casos de salud en seguimiento"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Añade un caso aquí o desde el reporte del día.
          </p>
          {puedeEditar && subSalud === "seguimiento" && (
            <Button
              type="button"
              size="sm"
              className="mt-4 gap-1.5"
              onClick={abrirNuevoCaso}
            >
              <Plus className="size-3.5" />
              Añadir caso
            </Button>
          )}
        </div>
      );
    }

    const grupos = agruparPorDiaCampo(casosLista, (c) => c.reportado_dia);

    return (
      <div className="space-y-4">
        {grupos.map((grupo) => (
          <div key={grupo.dia} className="space-y-2">
            <EncabezadoDiaSeguimiento
              dia={grupo.dia}
              cantidad={grupo.items.length}
              hoyClave={hoyClave}
            />
            <div className="space-y-2">
              {grupo.items.map((c) => (
                <TarjetaCasoSalud
                  key={c.id}
                  caso={c}
                  puedeEditar={puedeEditar}
                  editando={editandoCasoId === c.id}
                  borrador={borradorCaso}
                  onBorradorChange={setBorradorCaso}
                  onEditar={() => iniciarEdicionCaso(c)}
                  onCancelarEdicion={cancelarEdicionCaso}
                  onGuardar={() => void guardarCasoEditado(c.id)}
                  cambiando={cambiandoId === c.id}
                  archivando={archivandoId === c.id}
                  eliminando={eliminandoCasoId === c.id}
                  guardando={guardandoCasoId === c.id}
                  onCambiarEstatus={(est) => void cambiarEstatus(c.id, est)}
                  onArchivar={() => void archivar(c.id)}
                  onEliminar={() => void eliminarCaso(c.id)}
                />
              ))}
            </div>
          </div>
        ))}
        {listaCasos.length > SEGUIMIENTO_ITEMS_POR_PAGINA && (
          <PaginadorTabla
            pagina={paginaSaludSegura}
            totalPaginas={totalPaginasSalud}
            totalFilas={listaCasos.length}
            filasPorPagina={SEGUIMIENTO_ITEMS_POR_PAGINA}
            onPagina={setPaginaSalud}
          />
        )}
      </div>
    );
  }

  function renderListaNovedades(lista: EventoReporte[], vacioTitulo: string) {
    if (lista.length === 0 && listaNovedades.length === 0) {
      return (
        <div className="rounded-lg border border-dashed border-border px-6 py-10 text-center">
          <CalendarPlus className="mx-auto size-10 text-muted-foreground/40" />
          <p className="mt-3 text-sm font-medium text-foreground">{vacioTitulo}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Añade una novedad aquí o desde el reporte del día.
          </p>
          {puedeEditar && (
            <Button
              type="button"
              size="sm"
              className="mt-4 gap-1.5"
              onClick={abrirNuevaNovedad}
            >
              <Plus className="size-3.5" />
              Añadir novedad
            </Button>
          )}
        </div>
      );
    }

    const grupos = agruparPorDiaCampo(lista, (e) => e.dia);

    return (
      <div className="space-y-4">
        {grupos.map((grupo) => (
          <div key={grupo.dia} className="space-y-2">
            <EncabezadoDiaSeguimiento
              dia={grupo.dia}
              cantidad={grupo.items.length}
              hoyClave={hoyClave}
            />
            <div className="space-y-2">
              {grupo.items.map((e) => (
                <TarjetaNovedad
                  key={e.id}
                  evento={e}
                  puedeEditar={puedeEditar}
                  editando={editandoNovedadId === e.id}
                  borrador={borradorNovedad}
                  onBorradorChange={setBorradorNovedad}
                  onEditar={() => iniciarEdicionNovedad(e)}
                  onCancelarEdicion={cancelarEdicionNovedad}
                  onGuardar={() => void guardarNovedadEditada(e)}
                  onEliminar={() => void eliminarNovedad(e.id)}
                  guardando={guardandoNovedadId === e.id}
                  eliminando={eliminandoNovedadId === e.id}
                />
              ))}
            </div>
          </div>
        ))}
        {listaNovedades.length > SEGUIMIENTO_ITEMS_POR_PAGINA && (
          <PaginadorTabla
            pagina={paginaNovedadesSegura}
            totalPaginas={totalPaginasNovedades}
            totalFilas={listaNovedades.length}
            filasPorPagina={SEGUIMIENTO_ITEMS_POR_PAGINA}
            onPagina={setPaginaNovedades}
          />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Franja resumen */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-border bg-muted/20 px-4 py-2.5 text-xs">
        <span className="text-muted-foreground">
          Salud:{" "}
          <span className={cn("font-medium", contadores.casosActivos > 0 ? "text-rose-400" : "text-foreground")}>
            {contadores.casosActivos > 0
              ? `${contadores.casosActivos} activo${contadores.casosActivos === 1 ? "" : "s"}`
              : "sin activos"}
          </span>
        </span>
        <span className="hidden text-border sm:inline">·</span>
        <span className="text-muted-foreground">
          Trabajos:{" "}
          <span
            className={cn(
              "font-medium",
              trabajosPendientesCount > 0 ? "text-amber-400" : "text-foreground",
            )}
          >
            {trabajosPendientesCount > 0
              ? `${trabajosPendientesCount} abierto${trabajosPendientesCount === 1 ? "" : "s"}`
              : trabajosActivosLista.length > 0
                ? `${trabajosActivosLista.length} en curso`
                : "sin abiertos"}
          </span>
        </span>
        <span className="hidden text-border sm:inline">·</span>
        <span className="text-muted-foreground">
          Novedades:{" "}
          <span className="font-medium text-foreground">
            {novedadesEnSeguimiento.length > 0
              ? `${novedadesEnSeguimiento.length} hoy`
              : novedadesArchivadas.length > 0
                ? `${novedadesArchivadas.length} archivada${novedadesArchivadas.length === 1 ? "" : "s"}`
                : "ninguna"}
          </span>
        </span>
        {contadores.novedadesNegativasRecientes > 0 && (
          <>
            <span className="hidden text-border sm:inline">·</span>
            <span className="font-medium text-rose-400">
              {contadores.novedadesNegativasRecientes} negativa
              {contadores.novedadesNegativasRecientes === 1 ? "" : "s"}
            </span>
          </>
        )}
        {contadores.casosResueltos > 0 && (
          <>
            <span className="hidden text-border sm:inline">·</span>
            <span className="font-medium text-emerald-400">
              {contadores.casosResueltos} por archivar
            </span>
          </>
        )}
      </div>

      {/* Evolución colapsable */}
      <Collapsible open={evolucionAbierta} onOpenChange={setEvolucionAbierta}>
        <div className="rounded-lg border border-border">
          <div className="flex items-center justify-between gap-2 px-3 py-2">
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className="flex min-w-0 flex-1 items-center gap-2 text-left text-xs font-medium text-foreground hover:text-teal-300"
              >
                <ChevronDown
                  className={cn(
                    "size-3.5 shrink-0 text-muted-foreground transition-transform",
                    evolucionAbierta && "rotate-180",
                  )}
                />
                <span>Evolución diaria</span>
                {hayAlerta && (
                  <span className="size-1.5 shrink-0 rounded-full bg-rose-400" />
                )}
              </button>
            </CollapsibleTrigger>
            <Button
              type="button"
              size="xs"
              variant={calendarioAbierto ? "secondary" : "outline"}
              className="h-6 gap-1 px-2 text-[10px]"
              onClick={() => setCalendarioAbierto((v) => !v)}
            >
              {calendarioAbierto ? (
                <PanelLeftClose className="size-3" />
              ) : (
                <PanelLeftOpen className="size-3" />
              )}
              <CalendarDays className="size-3" />
              {diaMarcado ? formatearDiaCalendario(diaMarcado) : "Fecha"}
            </Button>
          </div>
          <CollapsibleContent>
            <div className="flex items-stretch gap-2 border-t border-border p-2">
              {calendarioAbierto && (
                <div className="w-[11.5rem] shrink-0 sm:w-[12.5rem]">
                  <CalendarioSelectorDia
                    titulo="Calendario"
                    diaSeleccionado={diaSel}
                    onSeleccionarDia={(dia) => seleccionarDia(dia)}
                    marcasPorDia={marcasPorDia}
                    leyenda={LEYENDA_CALENDARIO}
                    onCerrar={() => setCalendarioAbierto(false)}
                  />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <GraficoSeguimientoCentro
                  centroId={centro.id}
                  snapshots={snapshots}
                  eventos={eventos}
                  diaMarcado={diaMarcado}
                  casosAbiertos={contadores.casosAbiertos}
                />
              </div>
            </div>
          </CollapsibleContent>
        </div>
      </Collapsible>

      <Tabs
        value={tab}
        onValueChange={(v) => setTabManual(v as TabSeguimiento)}
        className="gap-0"
      >
        <div className="border-b border-border">
          <TabsList
            variant="line"
            className="!grid h-10 w-full grid-cols-3 gap-0 overflow-hidden rounded-none bg-transparent p-0"
          >
            <TabsTrigger value="salud" className={tabTriggerClass}>
              <Stethoscope className="size-3.5 shrink-0" />
              <span className="truncate">Salud</span>
              {totalSaludTab > 0 && (
                <Badge
                  variant="secondary"
                  className="h-4 min-w-4 border-rose-500/30 bg-rose-500/10 px-1 text-[9px] tabular-nums text-rose-400"
                >
                  {totalSaludTab}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="trabajos" className={tabTriggerClass}>
              <Wrench className="size-3.5 shrink-0" />
              <span className="truncate">Trabajos</span>
              {trabajosPendientesCount > 0 && (
                <Badge
                  variant="secondary"
                  className="h-4 min-w-4 border-amber-500/30 bg-amber-500/10 px-1 text-[9px] tabular-nums text-amber-400"
                >
                  {trabajosPendientesCount}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="novedades" className={tabTriggerClass}>
              <CalendarPlus className="size-3.5 shrink-0" />
              <span className="truncate">Novedades</span>
              {novedadesEnSeguimiento.length > 0 && (
                <Badge variant="secondary" className="h-4 min-w-4 px-1 text-[9px] tabular-nums">
                  {novedadesEnSeguimiento.length}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Banner día filtrado */}
        {diaSel && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-sky-500/30 bg-sky-500/5 px-3 py-2 text-xs">
            <span className="text-sky-300">
              Filtrado por día {formatearDiaCalendario(diaSel)}
            </span>
            <Button
              type="button"
              size="xs"
              variant="ghost"
              className="h-6"
              onClick={() => seleccionarDia(null)}
            >
              Quitar filtro
            </Button>
          </div>
        )}

        <TabsContent value="salud" className="mt-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex overflow-hidden rounded-lg border border-border/70 text-[11px] font-semibold">
              {(
                [
                  {
                    valor: "seguimiento" as const,
                    label: `En seguimiento${
                      casosPendientes.length + casosResueltos.length > 0
                        ? ` (${casosPendientes.length + casosResueltos.length})`
                        : ""
                    }`,
                  },
                  {
                    valor: "archivados" as const,
                    label: `Archivados${
                      historialCasos.length > 0 ? ` (${historialCasos.length})` : ""
                    }`,
                  },
                ]
              ).map((s) => (
                <button
                  key={s.valor}
                  type="button"
                  onClick={() => setSubSalud(s.valor)}
                  className={cn(
                    "border-r border-border/70 px-2.5 py-1.5 transition-colors last:border-r-0",
                    subSalud === s.valor
                      ? "bg-teal-600/20 text-teal-300"
                      : "text-muted-foreground hover:bg-muted/40",
                  )}
                >
                  {s.label}
                </button>
              ))}
            </div>
            {puedeEditar && (
              <div className="flex flex-wrap items-center gap-1.5">
                <Button
                  type="button"
                  size="sm"
                  className="h-8 gap-1.5 bg-teal-600 hover:bg-teal-500"
                  disabled={formularioNuevoCaso}
                  onClick={abrirNuevoCaso}
                >
                  <Plus className="size-3.5" />
                  Añadir caso
                </Button>
                {onIrAReporte && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8 gap-1.5"
                    onClick={() => onIrAReporte("salud")}
                  >
                    <Stethoscope className="size-3.5" />
                    Ir al reporte
                  </Button>
                )}
              </div>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {subSalud === "seguimiento"
              ? "Casos activos, en proceso o resueltos pendientes de archivar."
              : "Casos de salud ya archivados, ordenados por fecha."}
          </p>
          {puedeEditar && formularioNuevoCaso && (
            <div className="rounded-lg border border-teal-500/40 bg-teal-500/5 px-3 py-3 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-foreground">Nuevo caso de salud</p>
                <Badge variant="outline" className="text-[10px] tabular-nums">
                  {formatearDiaCalendario(diaSel ?? hoyClave)}
                </Badge>
              </div>
              <Input
                className="h-10 text-sm"
                value={nuevoCaso.titulo}
                disabled={guardandoNuevoCaso}
                onChange={(e) => setNuevoCaso({ ...nuevoCaso, titulo: e.target.value })}
                placeholder="Título del caso (obligatorio)"
                autoFocus
              />
              <Textarea
                className="min-h-[4rem] text-sm"
                rows={2}
                value={nuevoCaso.descripcion}
                disabled={guardandoNuevoCaso}
                onChange={(e) => setNuevoCaso({ ...nuevoCaso, descripcion: e.target.value })}
                placeholder="Detalle del caso (opcional)"
              />
              <Select
                value={nuevoCaso.estatus}
                onValueChange={(v) =>
                  setNuevoCaso({ ...nuevoCaso, estatus: v as EstatusCasoSalud })
                }
                disabled={guardandoNuevoCaso}
              >
                <SelectTrigger className={cn(claseSelectReporte, "mt-0")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ESTATUS_CASO_SALUD.filter((e) => e.valor !== "archivado").map((e) => (
                    <SelectItem key={e.valor} value={e.valor}>
                      {e.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button
                  type="button"
                  size="sm"
                  className="sm:flex-1"
                  disabled={!nuevoCaso.titulo.trim() || guardandoNuevoCaso}
                  onClick={() => void guardarNuevoCaso()}
                >
                  {guardandoNuevoCaso ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Check className="size-4" />
                  )}
                  Guardar caso
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={guardandoNuevoCaso}
                  onClick={cancelarNuevoCaso}
                >
                  <X className="size-4" />
                  Cancelar
                </Button>
              </div>
            </div>
          )}
          {renderListaSalud(listaCasosPagina)}
        </TabsContent>

        <TabsContent value="trabajos" className="mt-4 space-y-4">
          <SeguimientoTrabajosCentro
            centroId={centro.id}
            puedeEditar={puedeEditar}
            hoyClave={hoyClave}
            diaSel={diaSel}
            activos={trabajosActivosLista}
            archivados={trabajosArchivadosLista}
            onRecargar={recargarTrabajos}
            onIrAReporte={onIrAReporte}
          />
        </TabsContent>

        <TabsContent value="novedades" className="mt-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex overflow-hidden rounded-lg border border-border/70 text-[11px] font-semibold">
              {(
                [
                  {
                    valor: "seguimiento" as const,
                    label: `En seguimiento${
                      novedadesEnSeguimiento.length > 0
                        ? ` (${novedadesEnSeguimiento.length})`
                        : ""
                    }`,
                  },
                  {
                    valor: "archivados" as const,
                    label: `Archivados${
                      novedadesArchivadas.length > 0
                        ? ` (${novedadesArchivadas.length})`
                        : ""
                    }`,
                  },
                ]
              ).map((s) => (
                <button
                  key={s.valor}
                  type="button"
                  onClick={() => {
                    setSubNovedades(s.valor);
                    if (s.valor === "archivados" && formularioNuevaNovedad) {
                      cancelarNuevaNovedad();
                    }
                  }}
                  className={cn(
                    "border-r border-border/70 px-2.5 py-1.5 transition-colors last:border-r-0",
                    subNovedades === s.valor
                      ? "bg-teal-600/20 text-teal-300"
                      : "text-muted-foreground hover:bg-muted/40",
                  )}
                >
                  {s.label}
                </button>
              ))}
            </div>
            {puedeEditar && (
              <div className="flex flex-wrap items-center gap-1.5">
                <Button
                  type="button"
                  size="sm"
                  className="h-8 gap-1.5 bg-teal-600 hover:bg-teal-500"
                  disabled={formularioNuevaNovedad}
                  onClick={abrirNuevaNovedad}
                >
                  <Plus className="size-3.5" />
                  Añadir novedad
                </Button>
                {onIrAReporte && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8 gap-1.5"
                    onClick={() => onIrAReporte("novedades")}
                  >
                    <CalendarPlus className="size-3.5" />
                    Ir al reporte
                  </Button>
                )}
              </div>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {subNovedades === "seguimiento"
              ? "Novedades del día en curso. Al cerrar el día pasan a Archivados."
              : verNovedadesAnteriores
                ? "Historial completo de novedades de días anteriores."
                : "Novedades de días anteriores (últimos 30 días)."}
          </p>
          {puedeEditar && formularioNuevaNovedad && (
            <div className="space-y-3 rounded-lg border border-teal-500/40 bg-teal-500/5 px-3 py-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-foreground">Nueva novedad</p>
                <Badge variant="outline" className="text-[10px] tabular-nums">
                  {formatearDiaCalendario(diaSel ?? hoyClave)}
                </Badge>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-[140px_minmax(0,1fr)]">
                <div>
                  <Label className="text-[11px] text-muted-foreground">Tipo</Label>
                  <Select
                    value={nuevaNovedad.tipo}
                    disabled={guardandoNuevaNovedad}
                    onValueChange={(v) =>
                      setNuevaNovedad({ ...nuevaNovedad, tipo: v as TipoEventoReporte })
                    }
                  >
                    <SelectTrigger className={claseSelectReporte}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CATALOGO_TIPOS_EVENTO_REPORTE.map((t) => (
                        <SelectItem key={t.valor} value={t.valor}>
                          <span className="flex items-center gap-2">
                            <span
                              className="size-2 shrink-0 rounded-full"
                              style={{ backgroundColor: t.color }}
                              aria-hidden
                            />
                            {t.label}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-[11px] text-muted-foreground">Hora</Label>
                  <Input
                    type="time"
                    className="mt-1"
                    disabled={guardandoNuevaNovedad}
                    value={nuevaNovedad.hora}
                    onChange={(e) =>
                      setNuevaNovedad({ ...nuevaNovedad, hora: e.target.value })
                    }
                  />
                </div>
              </div>
              <div>
                <Label className="text-[11px] text-muted-foreground">Título descriptivo</Label>
                <Input
                  className="mt-1"
                  value={nuevaNovedad.titulo}
                  disabled={guardandoNuevaNovedad}
                  onChange={(e) =>
                    setNuevaNovedad({ ...nuevaNovedad, titulo: e.target.value })
                  }
                  placeholder="Ej. Pelea entre dos adultos en módulo B; mediación y separación"
                  autoFocus
                />
                <ChecklistTituloNovedad titulo={nuevaNovedad.titulo} />
              </div>
              <div>
                <Label className="text-[11px] text-muted-foreground">Detalles de la novedad</Label>
                <Textarea
                  className="mt-1"
                  rows={3}
                  value={nuevaNovedad.descripcion}
                  disabled={guardandoNuevaNovedad}
                  onChange={(e) =>
                    setNuevaNovedad({ ...nuevaNovedad, descripcion: e.target.value })
                  }
                  placeholder="Contexto extra, acciones y seguimiento (opcional). No sustituye al título descriptivo."
                />
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <ConfirmarTituloDescriptivoDialog onConfirm={() => void guardarNuevaNovedad()}>
                  <Button
                    type="button"
                    size="sm"
                    className="sm:flex-1"
                    disabled={!tituloEventoValido(nuevaNovedad.titulo) || guardandoNuevaNovedad}
                  >
                    {guardandoNuevaNovedad ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Check className="size-4" />
                    )}
                    Guardar novedad
                  </Button>
                </ConfirmarTituloDescriptivoDialog>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={guardandoNuevaNovedad}
                  onClick={cancelarNuevaNovedad}
                >
                  <X className="size-4" />
                  Cancelar
                </Button>
              </div>
            </div>
          )}
          {renderListaNovedades(
            listaNovedadesPagina,
            subNovedades === "archivados"
              ? diaSel
                ? "Sin novedades archivadas ese día"
                : "Sin novedades archivadas"
              : diaSel
                ? "Sin novedades este día"
                : "Sin novedades del día en curso",
          )}
          {subNovedades === "archivados" && !verNovedadesAnteriores && !diaSel && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="w-full gap-1.5 text-xs text-muted-foreground"
              onClick={() => setVerNovedadesAnteriores(true)}
            >
              <Clock className="size-3.5" />
              Ver novedades anteriores a 30 días
            </Button>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function SeguimientoCompacto({
  centro,
  puedeEditar,
  onIrAReporte,
}: {
  centro: CentroTransitorio;
  puedeEditar: boolean;
  onIrAReporte?: (fase?: string) => void;
}) {
  const hoyClave = useMemo(() => claveDia(Date.now()), []);
  const { casos } = useCasosSaludCentros({ centroId: centro.id, soloActivos: true });
  const { eventos } = useEventosReportes({ centroId: centro.id, dia: hoyClave });
  const { trabajos: trabajosActivosLista } = useReparacionesCentros({
    centroId: centro.id,
    soloActivos: true,
  });
  const pendientes = useMemo(() => casosSaludPendientes(casos), [casos]);
  const trabajosPendientesCount = useMemo(
    () => contarTrabajosPendientesSeguimiento(trabajosActivosLista),
    [trabajosActivosLista],
  );
  const contadores = useMemo(
    () => contadoresSeguimientoCentro(casos, eventos, hoyClave),
    [casos, eventos, hoyClave],
  );

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Stethoscope className="size-4 text-teal-400" />
          Seguimiento del reporte
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-xs text-muted-foreground">
          {contadores.casosActivos > 0
            ? `${contadores.casosActivos} caso(s) de salud activo(s)`
            : "Sin casos de salud activos"}
          {trabajosPendientesCount > 0
            ? ` · ${trabajosPendientesCount} trabajo(s) abierto(s)`
            : ""}
          {eventos.length > 0 ? ` · ${eventos.length} novedad(es) hoy` : ""}
        </p>
        {pendientes.slice(0, 2).map((c) => (
          <div key={c.id} className="rounded-md border border-border/60 px-2 py-1.5 text-xs">
            <span className="font-medium">{c.titulo}</span>
            <BadgeAntiguedad reportadoDia={c.reportado_dia} className="ml-1.5" />
          </div>
        ))}
        {onIrAReporte && puedeEditar && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="w-full gap-1"
            onClick={() => onIrAReporte()}
          >
            Ver seguimiento completo
            <ChevronRight className="size-3.5" />
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

export function SeccionSeguimientoReportesCentro({
  centro,
  puedeEditar,
  variant = "compacto",
  onIrAReporte,
}: Props) {
  if (variant === "expandido") {
    return (
      <SeguimientoExpandido centro={centro} puedeEditar={puedeEditar} onIrAReporte={onIrAReporte} />
    );
  }
  return (
    <SeguimientoCompacto centro={centro} puedeEditar={puedeEditar} onIrAReporte={onIrAReporte} />
  );
}

/** Alias de exportación para sustituir la sección anterior. */
export const SeccionIncidenciasCentro = SeccionSeguimientoReportesCentro;
