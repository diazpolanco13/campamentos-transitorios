// Pestaña Eventos del reporte diario: novedades neutras/positivas/negativas y
// participantes vinculados a fichas nominales o capturados manualmente.

import { useEffect, useMemo, useState } from "react";
import {
  Archive,
  CalendarPlus,
  Check,
  Circle,
  Loader2,
  Pencil,
  Plus,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  UserRound,
  Users,
} from "lucide-react";
import { useAlojamientosCentro } from "@/data/useAlojamientosCentro";
import { useEventosReportes } from "@/data/useEventosReportes";
import { eliminarEventoReporte } from "@/data/reposEventosReportes";
import { nuevoId } from "@/data/reposSupabase";
import {
  CATALOGO_TIPOS_EVENTO_REPORTE,
  META_TIPO_EVENTO_REPORTE,
  TIPO_EVENTO_REPORTE_DEFAULT,
  eventosArchivados,
  textoParticipantesEvento,
  tituloEventoValido,
  type EventoReporte,
  type ParticipanteEventoReporte,
  type TipoEventoReporte,
} from "@/domain/eventosReportes";
import { formatearCedula, nombreCompleto, type AlojamientoEnriquecido } from "@/domain/refugiados";
import { BloqueConfirmacionReporte } from "@/features/centros/BloqueConfirmacionReporte";
import { ChecklistTituloNovedad } from "@/features/centros/ChecklistTituloNovedad";
import { ConfirmarTituloDescriptivoDialog } from "@/features/centros/ConfirmarTituloDescriptivoDialog";
import { claseSelectReporte } from "@/features/centros/clasesReporte";
import { formatearDiaCalendario } from "@/features/centros/CalendarioSelectorDia";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { normalizarTextoBusqueda } from "./CentrosListaItems";

type VistaNovedades = "dia" | "archivados";

interface Props {
  centroId: string;
  dia: string;
  eventos: EventoReporte[];
  eventosRevisados: boolean;
  modificado: boolean;
  onEventosChange: (eventos: EventoReporte[]) => void;
  onEventosRevisadosChange: (valor: boolean) => void;
  onBorradorPendienteChange?: (pendiente: boolean) => void;
  onConfirmarRevision?: () => void;
  onDesmarcarRevision?: () => void;
  deshabilitado?: boolean;
  guardando?: boolean;
}

interface BorradorEvento {
  tipo: TipoEventoReporte;
  hora: string;
  titulo: string;
  descripcion: string;
  participantes: ParticipanteEventoReporte[];
}

const BORRADOR_INICIAL: BorradorEvento = {
  tipo: TIPO_EVENTO_REPORTE_DEFAULT,
  hora: "",
  titulo: "",
  descripcion: "",
  participantes: [],
};

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

function participanteDesdeAlojamiento(a: AlojamientoEnriquecido): ParticipanteEventoReporte {
  const refugiado = a.refugiado;
  const cedula = formatearCedula(refugiado.cedula, refugiado.tipo_doc);
  return {
    refugiado_id: refugiado.id,
    nombre: nombreCompleto(refugiado),
    cedula: cedula === "—" ? "" : cedula,
    codigo_ficha: refugiado.codigo_ficha,
  };
}

function etiquetaParticipante(p: ParticipanteEventoReporte): string {
  return p.nombre_manual?.trim() || p.nombre;
}

function IconoTipoEvento({ tipo }: { tipo: TipoEventoReporte }) {
  if (tipo === "positivo") return <ThumbsUp className="size-3.5 text-emerald-400" />;
  if (tipo === "negativo") return <ThumbsDown className="size-3.5 text-red-400" />;
  return <Circle className="size-3.5 fill-zinc-400 text-zinc-400" />;
}

export function EventosReporteTab({
  centroId,
  dia,
  eventos,
  eventosRevisados,
  modificado,
  onEventosChange,
  onEventosRevisadosChange,
  onBorradorPendienteChange,
  onConfirmarRevision,
  onDesmarcarRevision,
  deshabilitado,
  guardando,
}: Props) {
  const { alojamientos, cargando } = useAlojamientosCentro({ centroId, estado: "activo" });
  const { eventos: eventosCentro, recargar: recargarHistorial } = useEventosReportes({
    centroId,
  });
  const [vista, setVista] = useState<VistaNovedades>("dia");
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [borrador, setBorrador] = useState<BorradorEvento>(BORRADOR_INICIAL);
  const [consulta, setConsulta] = useState("");
  const [nombreManual, setNombreManual] = useState("");
  const [selectorAbierto, setSelectorAbierto] = useState(false);
  const [eliminandoArchivadoId, setEliminandoArchivadoId] = useState<string | null>(null);

  const archivados = useMemo(
    () => eventosArchivados(eventosCentro, centroId, dia),
    [eventosCentro, centroId, dia],
  );

  const borradorPendiente =
    editandoId !== null ||
    borrador.titulo.trim() !== "" ||
    borrador.descripcion.trim() !== "" ||
    borrador.hora.trim() !== "" ||
    borrador.participantes.length > 0;

  useEffect(() => {
    onBorradorPendienteChange?.(borradorPendiente);
  }, [borradorPendiente, onBorradorPendienteChange]);

  function resetForm() {
    setEditandoId(null);
    setBorrador(BORRADOR_INICIAL);
    setConsulta("");
    setNombreManual("");
    setSelectorAbierto(false);
  }

  function cargarEdicion(evento: EventoReporte) {
    setEditandoId(evento.id);
    setBorrador({
      tipo: evento.tipo,
      hora: horaDesdeTs(evento.ts),
      titulo: evento.titulo,
      descripcion: evento.descripcion,
      participantes: [...evento.participantes],
    });
    setConsulta("");
    setNombreManual("");
    setSelectorAbierto(false);
  }

  const idsSeleccionados = useMemo(
    () => new Set(borrador.participantes.map((p) => p.refugiado_id).filter(Boolean)),
    [borrador.participantes],
  );

  const resultados = useMemo(() => {
    const q = normalizarTextoBusqueda(consulta.trim());
    return alojamientos
      .filter((a) => !idsSeleccionados.has(a.refugiado_id))
      .filter((a) => {
        if (!q) return true;
        const r = a.refugiado;
        const texto = normalizarTextoBusqueda(
          [
            nombreCompleto(r),
            r.cedula,
            r.cedula_norm,
            r.codigo_ficha,
          ]
            .filter(Boolean)
            .join(" "),
        );
        return texto.includes(q);
      })
      .slice(0, 20);
  }, [alojamientos, consulta, idsSeleccionados]);

  function agregarParticipante(participante: ParticipanteEventoReporte) {
    setBorrador((prev) => ({
      ...prev,
      participantes: [...prev.participantes, participante],
    }));
    setConsulta("");
    setNombreManual("");
    setSelectorAbierto(false);
  }

  function agregarManual() {
    const nombre = nombreManual.trim();
    if (!nombre) return;
    agregarParticipante({
      nombre,
      nombre_manual: nombre,
      refugiado_id: null,
    });
  }

  function quitarParticipante(idx: number) {
    setBorrador((prev) => ({
      ...prev,
      participantes: prev.participantes.filter((_, i) => i !== idx),
    }));
  }

  function guardarEvento() {
    if (!tituloEventoValido(borrador.titulo)) return;
    const datos = {
      centro_id: centroId,
      dia,
      ts: tsDesdeHora(borrador.hora, dia),
      tipo: borrador.tipo,
      titulo: borrador.titulo.trim(),
      descripcion: borrador.descripcion.trim(),
      participantes: borrador.participantes,
      updated_at: Date.now(),
      updated_by: "",
    };

    if (editandoId) {
      onEventosChange(
        eventos.map((evento) =>
          evento.id === editandoId ? { ...evento, ...datos } : evento,
        ),
      );
    } else {
      onEventosChange([
        ...eventos,
        {
          id: nuevoId(),
          ...datos,
          creada_por: "",
        },
      ]);
    }
    onEventosRevisadosChange(true);
    resetForm();
  }

  function quitarEvento(id: string) {
    if (editandoId === id) resetForm();
    const restantes = eventos.filter((evento) => evento.id !== id);
    onEventosChange(restantes);
    if (restantes.length === 0) onEventosRevisadosChange(false);
  }

  async function eliminarArchivado(id: string) {
    setEliminandoArchivadoId(id);
    try {
      await eliminarEventoReporte(id);
      await recargarHistorial();
    } finally {
      setEliminandoArchivadoId(null);
    }
  }

  const mensajeBloqueoConfirmacion = borradorPendiente
    ? editandoId
      ? "Actualiza o cancela la novedad en edición antes de guardar todos los cambios."
      : "Guarda la novedad en edición antes de guardar todos los cambios."
    : undefined;

  const formularioNovedad = (
    <Card size="sm" className="border-border/80">
      <CardHeader className="px-3 py-2">
        <CardTitle className="flex items-center gap-1.5 text-xs">
          {editandoId ? <Pencil className="size-3.5 text-teal-400" /> : <Plus className="size-3.5 text-teal-400" />}
          {editandoId ? "Editar novedad" : "Nueva novedad"}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 px-3 pb-3">
        <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-[140px_minmax(0,1fr)]">
          <div>
            <Label className="text-[11px] text-muted-foreground">Tipo</Label>
            <Select
              value={borrador.tipo}
              disabled={deshabilitado}
              onValueChange={(v) =>
                setBorrador((prev) => ({ ...prev, tipo: v as TipoEventoReporte }))
              }
            >
              <SelectTrigger className={claseSelectReporte}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATALOGO_TIPOS_EVENTO_REPORTE.map((tipo) => (
                  <SelectItem key={tipo.valor} value={tipo.valor}>
                    <span className="flex items-center gap-2">
                      <span
                        className="size-2 shrink-0 rounded-full"
                        style={{ backgroundColor: tipo.color }}
                        aria-hidden
                      />
                      {tipo.label}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="evento-hora" className="text-[11px] text-muted-foreground">
              Hora
            </Label>
            <Input
              id="evento-hora"
              type="time"
              className="mt-1"
              disabled={deshabilitado}
              value={borrador.hora}
              onChange={(e) => setBorrador((prev) => ({ ...prev, hora: e.target.value }))}
            />
          </div>
        </div>

        <div>
          <Label htmlFor="evento-titulo" className="text-[11px] text-muted-foreground">
            Título descriptivo
          </Label>
          <Input
            id="evento-titulo"
            className="mt-1"
            disabled={deshabilitado}
            value={borrador.titulo}
            onChange={(e) => setBorrador((prev) => ({ ...prev, titulo: e.target.value }))}
            placeholder="Ej. Pelea entre dos adultos en módulo B; mediación y separación"
          />
          <ChecklistTituloNovedad titulo={borrador.titulo} />
        </div>

        <div>
          <Label htmlFor="evento-desc" className="text-[11px] text-muted-foreground">
            Detalles de la novedad
          </Label>
          <Textarea
            id="evento-desc"
            className="mt-1"
            rows={3}
            disabled={deshabilitado}
            value={borrador.descripcion}
            onChange={(e) =>
              setBorrador((prev) => ({ ...prev, descripcion: e.target.value }))
            }
            placeholder="Contexto extra, acciones y seguimiento (opcional). No sustituye al título descriptivo."
          />
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <Label className="text-[11px] text-muted-foreground">Participantes</Label>
            <Popover open={selectorAbierto} onOpenChange={setSelectorAbierto}>
              <PopoverTrigger asChild>
                <Button type="button" size="xs" variant="outline" disabled={deshabilitado}>
                  <UserRound className="size-3" />
                  Agregar
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[min(22rem,calc(100vw-2rem))] p-0" align="end">
                <Command shouldFilter={false}>
                  <CommandInput
                    value={consulta}
                    onValueChange={setConsulta}
                    placeholder="Buscar por nombre o cédula…"
                  />
                  <CommandList>
                    <CommandEmpty>
                      {cargando ? "Cargando…" : "Sin resultados en este campamento."}
                    </CommandEmpty>
                    <CommandGroup>
                      {resultados.map((a) => {
                        const r = a.refugiado;
                        return (
                          <CommandItem
                            key={a.id}
                            value={r.id}
                            onSelect={() => agregarParticipante(participanteDesdeAlojamiento(a))}
                            className="items-start py-2"
                          >
                            <UserRound className="mt-0.5 size-4 text-muted-foreground" />
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium">
                                {nombreCompleto(r)}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {r.codigo_ficha ?? formatearCedula(r.cedula, r.tipo_doc)}
                              </p>
                            </div>
                          </CommandItem>
                        );
                      })}
                    </CommandGroup>
                  </CommandList>
                </Command>
                <div className="border-t border-border p-2">
                  <Label htmlFor="evento-participante-manual" className="text-[10px]">
                    Agregar nombre manual
                  </Label>
                  <div className="mt-1 flex gap-1.5">
                    <Input
                      id="evento-participante-manual"
                      className="h-8"
                      value={nombreManual}
                      onChange={(e) => setNombreManual(e.target.value)}
                      placeholder="Nombre y apellido"
                    />
                    <Button
                      type="button"
                      size="xs"
                      disabled={!nombreManual.trim()}
                      onClick={agregarManual}
                    >
                      <Plus className="size-3" />
                    </Button>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          </div>

          {borrador.participantes.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
              Puedes dejarlo vacío si el evento no involucra damnificados específicos.
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {borrador.participantes.map((p, i) => (
                <Badge key={`${etiquetaParticipante(p)}-${i}`} variant="secondary" className="gap-1 pr-1">
                  {etiquetaParticipante(p)}
                  <button
                    type="button"
                    disabled={deshabilitado}
                    onClick={() => quitarParticipante(i)}
                    className="rounded-full p-0.5 text-muted-foreground hover:text-foreground"
                  >
                    <Trash2 className="size-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <ConfirmarTituloDescriptivoDialog onConfirm={guardarEvento}>
            <Button
              type="button"
              size="sm"
              disabled={deshabilitado || !tituloEventoValido(borrador.titulo)}
            >
              {editandoId ? <Check className="size-4" /> : <Plus className="size-4" />}
              {editandoId ? "Actualizar" : "Guardar esta novedad"}
            </Button>
          </ConfirmarTituloDescriptivoDialog>
          {editandoId && (
            <Button type="button" size="sm" variant="outline" onClick={resetForm}>
              Cancelar
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="min-w-0 space-y-4">
      <BloqueConfirmacionReporte
        titulo="Novedades y eventos"
        tituloRevisado="Novedades revisadas hoy"
        descripcion="Registra actividades y novedades (neutras, positivas o negativas) relevantes para el cierre diario. Las de días previos quedan en Archivados."
        icono={CalendarPlus}
        acento="teal"
        revisado={eventosRevisados}
        modificado={modificado}
        guardando={guardando}
        deshabilitado={deshabilitado}
        onConfirmar={() => onConfirmarRevision?.()}
        onDesmarcar={onDesmarcarRevision}
        etiquetaGuardar="Guardar todos los cambios"
        etiquetaConfirmar={
          eventos.length === 0 ? "Confirmar sin novedades" : "Confirmar sin cambios"
        }
        etiquetaActualizar="Actualizar novedades"
        confirmacionBloqueada={borradorPendiente}
        mensajeConfirmacionBloqueada={mensajeBloqueoConfirmacion}
        badgeExtra={
          <Badge variant="outline" className="w-fit shrink-0 gap-1 tabular-nums">
            {eventos.length} evento{eventos.length === 1 ? "" : "s"}
          </Badge>
        }
      />

      <div className="flex flex-wrap gap-1.5">
        <Button
          type="button"
          size="sm"
          variant={vista === "dia" ? "default" : "outline"}
          className="h-8"
          onClick={() => setVista("dia")}
        >
          Del día
          {eventos.length > 0 ? ` (${eventos.length})` : ""}
        </Button>
        <Button
          type="button"
          size="sm"
          variant={vista === "archivados" ? "default" : "outline"}
          className="h-8 gap-1.5"
          onClick={() => {
            setVista("archivados");
            if (editandoId) resetForm();
          }}
        >
          <Archive className="size-3.5" />
          Archivados
          {archivados.length > 0 ? ` (${archivados.length})` : ""}
        </Button>
      </div>

      {vista === "dia" && (
        <>
          {formularioNovedad}

          {eventos.length > 0 ? (
            <div className="space-y-2">
              {eventos.map((evento) => {
                const meta = META_TIPO_EVENTO_REPORTE[evento.tipo];
                const enEdicion = editandoId === evento.id;
                return (
                  <Card
                    key={evento.id}
                    size="sm"
                    className={cn(
                      "border-border/80 py-0",
                      enEdicion && "border-teal-500/40 bg-teal-500/5",
                    )}
                  >
                    <CardContent className="flex min-w-0 items-start gap-2 px-3 py-2.5">
                      <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted/40">
                        <IconoTipoEvento tipo={evento.tipo} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <p className="min-w-0 truncate text-sm font-medium text-foreground">
                            {evento.titulo}
                          </p>
                          <Badge
                            variant="outline"
                            className="px-1.5 py-0 text-[10px]"
                            style={{ borderColor: `${meta.color}66`, color: meta.color }}
                          >
                            {meta.label}
                          </Badge>
                          <span className="text-[10px] tabular-nums text-muted-foreground">
                            {horaDesdeTs(evento.ts) || "Sin hora"}
                          </span>
                        </div>
                        {evento.descripcion && (
                          <p className="mt-1 whitespace-pre-wrap text-xs leading-snug text-muted-foreground">
                            {evento.descripcion}
                          </p>
                        )}
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          <Users className="mr-1 inline size-3" />
                          {textoParticipantesEvento(evento)}
                        </p>
                        {evento.participantes.length > 0 && (
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            {evento.participantes.map((p, i) => (
                              <Badge key={`${evento.id}-${i}`} variant="secondary" className="text-[10px]">
                                {etiquetaParticipante(p)}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="flex shrink-0 gap-0.5">
                        <Button
                          type="button"
                          size="icon-xs"
                          variant="ghost"
                          disabled={deshabilitado}
                          onClick={() => cargarEdicion(evento)}
                          aria-label="Editar novedad"
                        >
                          <Pencil className="size-3.5" />
                        </Button>
                        <Button
                          type="button"
                          size="icon-xs"
                          variant="ghost"
                          className="text-destructive hover:text-destructive"
                          disabled={deshabilitado}
                          onClick={() => quitarEvento(evento.id)}
                          aria-label="Eliminar novedad"
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Sin novedades registradas.</p>
          )}
        </>
      )}

      {vista === "archivados" &&
        (archivados.length > 0 ? (
          <div className="space-y-2">
            {archivados.map((evento) => {
              const meta = META_TIPO_EVENTO_REPORTE[evento.tipo];
              const eliminando = eliminandoArchivadoId === evento.id;
              return (
                <Card
                  key={evento.id}
                  size="sm"
                  className="border-border/70 bg-muted/20 py-0"
                >
                  <CardContent className="flex min-w-0 items-start gap-2 px-3 py-2.5">
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted/40">
                      <IconoTipoEvento tipo={evento.tipo} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <p className="min-w-0 truncate text-sm font-medium text-foreground">
                          {evento.titulo}
                        </p>
                        <Badge
                          variant="outline"
                          className="px-1.5 py-0 text-[10px]"
                          style={{ borderColor: `${meta.color}66`, color: meta.color }}
                        >
                          {meta.label}
                        </Badge>
                        <Badge variant="secondary" className="px-1.5 py-0 text-[10px] tabular-nums">
                          {formatearDiaCalendario(evento.dia)}
                        </Badge>
                        <span className="text-[10px] tabular-nums text-muted-foreground">
                          {horaDesdeTs(evento.ts) || "Sin hora"}
                        </span>
                      </div>
                      {evento.descripcion && (
                        <p className="mt-1 whitespace-pre-wrap text-xs leading-snug text-muted-foreground">
                          {evento.descripcion}
                        </p>
                      )}
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        <Users className="mr-1 inline size-3" />
                        {textoParticipantesEvento(evento)}
                      </p>
                      {evento.participantes.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {evento.participantes.map((p, i) => (
                            <Badge key={`${evento.id}-${i}`} variant="secondary" className="text-[10px]">
                              {etiquetaParticipante(p)}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          type="button"
                          size="icon-xs"
                          variant="ghost"
                          className="shrink-0 text-destructive hover:text-destructive"
                          disabled={deshabilitado || eliminando}
                          aria-label="Eliminar novedad archivada"
                        >
                          {eliminando ? (
                            <Loader2 className="size-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="size-3.5" />
                          )}
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
                          <AlertDialogAction
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            onClick={() => void eliminarArchivado(evento.id)}
                          >
                            Eliminar
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Sin novedades archivadas.</p>
        ))}
    </div>
  );
}
