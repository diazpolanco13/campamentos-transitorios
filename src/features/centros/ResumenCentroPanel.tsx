// Pestaña Resumen de la ficha del centro: foto compacta, KPIs, seguimiento del día,
// identificación, acceso de terreno y alertas de servicios.

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Camera, ImagePlus, Loader2, Trash2 } from "lucide-react";
import { claveDia, eliminarCentro, guardarCentro } from "@/data/reposSupabase";
import { subirFotoCentro, supabaseDisponible } from "@/data/supabase";
import { useOcupacionesCentros } from "@/data/useOcupacionesCentros";
import {
  ESTATUS_INSTALACION_OFICIAL,
  normalizarCentro,
  normalizarServicios,
  poblacionCentro,
  type CentroTransitorio,
  type ServiciosCentro,
} from "@/domain/centrosTransitorios";
import { analisisCentro, COLOR_SEMAFORO } from "@/domain/capacidadCentros";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  SeccionFotoCentro,
  SeccionIdentificacionCentro,
} from "./DetalleCentro";
import { AlertasDelDiaCentro, type VistaFichaCentro } from "./AlertasDelDiaCentro";
import { ProgresoCensoPoblacion } from "@/features/refugiados/ProgresoCensoPoblacion";
import { ultimoSnapshotAntes } from "./ParteNumericoResumen";

interface Props {
  centro: CentroTransitorio;
  puedeEditar?: boolean;
  /** Solo admin / analista: borrado suave del campamento de la red. */
  puedeEliminar?: boolean;
  onIrAPestana: (vista: VistaFichaCentro) => void;
  onEditarUbicacion?: () => void;
  /** Tras eliminar con éxito (p. ej. volver al mapa). */
  onEliminado?: () => void;
}

/** Variación vs día anterior: verde +N, rojo -N. */
function Delta({ valor, anterior }: { valor: number; anterior?: number }) {
  if (anterior === undefined) return null;
  const d = valor - anterior;
  if (d === 0) return null;
  if (d > 0) {
    return (
      <span className="text-[10px] font-bold text-emerald-400">+{d.toLocaleString("es")}</span>
    );
  }
  return <span className="text-[10px] font-bold text-rose-400">{d.toLocaleString("es")}</span>;
}

function CardKpi({
  etiqueta,
  valor,
  anterior,
  clase,
  color,
}: {
  etiqueta: string;
  valor: string | number;
  anterior?: number;
  clase?: string;
  color?: string;
}) {
  const esNumero = typeof valor === "number";
  return (
    <div className="rounded-lg border border-border bg-card px-2 py-2 text-center sm:px-3 sm:py-2.5">
      <div className="flex items-baseline justify-center gap-1">
        <div
          className={cn(
            "text-lg font-bold tabular-nums leading-none text-foreground sm:text-xl",
            clase,
          )}
          style={color ? { color } : undefined}
        >
          {esNumero ? valor.toLocaleString("es") : valor}
        </div>
        {esNumero && <Delta valor={valor} anterior={anterior} />}
      </div>
      <div className="mt-1 text-[10px] text-muted-foreground">{etiqueta}</div>
    </div>
  );
}

/** KPIs: reporte diario + aforo oficial (estatus, máximas, instalada, disponibles). */
function KpisResumen({ centro }: { centro: CentroTransitorio }) {
  const c = normalizarCentro(centro);
  const analisis = analisisCentro(centro);
  const refugiados = poblacionCentro(centro);
  const hoy = useMemo(() => claveDia(Date.now()), []);
  const desde = useMemo(() => {
    const [y, m, d] = hoy.split("-").map(Number);
    const dt = new Date(y, m - 1, d);
    dt.setDate(dt.getDate() - 14);
    return claveDia(dt.getTime());
  }, [hoy]);

  const snapshots = useOcupacionesCentros({ centroId: centro.id, desde });
  const ayer = ultimoSnapshotAntes(snapshots, hoy);

  const colorSemaforo = COLOR_SEMAFORO[analisis.semaforo];
  const estatusLabel =
    ESTATUS_INSTALACION_OFICIAL.find(
      (e) => e.valor === c.censo_oficial.estatus_instalacion,
    )?.label ?? "—";
  const estatusClase =
    c.censo_oficial.estatus_instalacion === "instalado"
      ? "text-emerald-400"
      : c.censo_oficial.estatus_instalacion === "proceso_de_instalacion"
        ? "text-amber-400"
        : "text-muted-foreground";

  const fmt = (n: number | null) => (n == null ? "—" : n.toLocaleString("es"));
  // total_disponibles oficial = capacidad_instalada − damnificados del reporte
  const disponibles = analisis.cupoOficial;

  return (
    <div className="min-w-0 space-y-2">
      {/* Parte diario */}
      <div className="grid grid-cols-3 gap-1.5">
        <CardKpi
          etiqueta="Damnificados"
          valor={refugiados}
          anterior={ayer?.total_afectados}
          clase="text-sky-300"
        />
        <CardKpi
          etiqueta="Familias"
          valor={analisis.familias}
          anterior={ayer?.familias}
        />
        <CardKpi
          etiqueta="Personal"
          valor={analisis.personal}
          clase="text-violet-300"
        />
      </div>

      {/* Aforo / censo oficial */}
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
        <CardKpi etiqueta="Estatus" valor={estatusLabel} clase={estatusClase} />
        <CardKpi
          etiqueta="Capacidad máxima"
          valor={fmt(analisis.capacidadMaxima)}
        />
        <CardKpi
          etiqueta="Capacidad instalada"
          valor={fmt(analisis.capacidadInstalada)}
        />
        <CardKpi
          etiqueta="Disponibles"
          valor={disponibles == null ? "—" : disponibles.toLocaleString("es")}
          color={disponibles == null ? undefined : colorSemaforo}
          clase={disponibles == null ? "text-muted-foreground" : undefined}
        />
      </div>

      {c.censo_en_proceso && (
        <Badge variant="outline" className="border-amber-500/40 text-[10px] text-amber-500">
          Censo demográfico en proceso
        </Badge>
      )}
    </div>
  );
}

const CLAVES_SERVICIOS: { clave: keyof ServiciosCentro; label: string }[] = [
  { clave: "medicos", label: "Médicos" },
  { clave: "ambulancias", label: "Ambulancias" },
  { clave: "psicologo", label: "Psicólogo" },
  { clave: "contacto_juez_paz", label: "Juez de paz" },
];

/** Servicios con respuesta No o En proceso. */
function serviciosConAlerta(servicios: ServiciosCentro): string[] {
  return CLAVES_SERVICIOS.filter(({ clave }) => {
    const v = servicios[clave];
    return v === false || v === null;
  }).map(({ label }) => label);
}

/** Chip de alerta si algún servicio está No o En proceso. */
function ChipAlertaServicios({
  centro,
  onIrAPestana,
}: {
  centro: CentroTransitorio;
  onIrAPestana: (vista: VistaFichaCentro) => void;
}) {
  const c = normalizarCentro(centro);
  const pendientes = serviciosConAlerta(normalizarServicios(c.servicios));
  if (pendientes.length === 0) return null;

  return (
    <button
      type="button"
      onClick={() => onIrAPestana("poblacion")}
      className="flex w-full items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-left transition-colors hover:bg-amber-500/15"
    >
      <AlertTriangle className="size-4 shrink-0 text-amber-500" />
      <div className="min-w-0">
        <p className="text-xs font-semibold text-foreground">Servicios pendientes</p>
        <p className="truncate text-[11px] text-muted-foreground">
          {pendientes.join(" · ")}
        </p>
      </div>
    </button>
  );
}

/** Foto editable desde Resumen: clic para subir/cambiar, se guarda al instante. */
function FotoCentroEditable({
  centro,
  puedeEditar,
}: {
  centro: CentroTransitorio;
  puedeEditar: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Copia local: no esperamos Realtime para mostrar la foto tras subir/quitar.
  const [fotoUrl, setFotoUrl] = useState(() => normalizarCentro(centro).foto_url);
  useEffect(() => {
    setFotoUrl(normalizarCentro(centro).foto_url);
  }, [centro.id, centro.foto_url, centro.updated_at]);

  const hayFoto = Boolean(fotoUrl);
  const hayStorage = supabaseDisponible();
  const editable = puedeEditar && hayStorage && !subiendo;

  async function persistirFoto(url: string) {
    setFotoUrl(url);
    try {
      await guardarCentro({ ...centro, foto_url: url });
    } catch (err) {
      setFotoUrl(normalizarCentro(centro).foto_url);
      throw err;
    }
  }

  async function onArchivo(file: File) {
    if (!editable) return;
    setError(null);
    setSubiendo(true);
    try {
      const url = await subirFotoCentro(centro.id, file);
      await persistirFoto(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo subir la foto.");
    } finally {
      setSubiendo(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function quitarFoto() {
    if (!puedeEditar || subiendo) return;
    setError(null);
    setSubiendo(true);
    try {
      await persistirFoto("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo quitar la foto.");
    } finally {
      setSubiendo(false);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-1.5">
      <div
        className={cn(
          "relative aspect-square min-h-0 w-full overflow-hidden rounded-xl border border-border bg-muted/20 sm:aspect-auto sm:h-full",
          editable && "group",
        )}
      >
        {hayFoto ? (
          <img
            src={fotoUrl}
            alt={centro.nombre}
            className="size-full object-cover"
          />
        ) : subiendo ? (
          <div className="flex size-full flex-col items-center justify-center gap-2 px-3 text-center">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Subiendo…</span>
          </div>
        ) : editable ? (
          // Estado vacío editable: una sola CTA (evita solapar "Sin foto" + "Añadir foto")
          <button
            type="button"
            className="flex size-full flex-col items-center justify-center gap-2.5 px-3 text-center transition-colors hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none"
            onClick={() => inputRef.current?.click()}
            aria-label="Añadir foto del campamento"
          >
            <span className="flex size-10 items-center justify-center rounded-full border border-dashed border-border bg-background/40">
              <ImagePlus className="size-5 text-muted-foreground" />
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background/80 px-3 py-1 text-[11px] font-medium text-foreground shadow-sm">
              <Camera className="size-3.5" />
              Añadir foto
            </span>
          </button>
        ) : (
          <div className="flex size-full flex-col items-center justify-center gap-1.5 px-2 text-center">
            <ImagePlus className="size-5 text-muted-foreground/70" />
            <span className="text-[10px] leading-tight text-muted-foreground sm:text-xs">
              Sin foto
            </span>
          </div>
        )}

        {subiendo && hayFoto && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/45">
            <Loader2 className="size-5 animate-spin text-white" />
          </div>
        )}

        {editable && (
          <>
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void onArchivo(file);
              }}
            />
            {hayFoto && (
              <>
                <button
                  type="button"
                  className={cn(
                    "absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/0 text-white transition-colors",
                    "hover:bg-black/45 focus-visible:bg-black/45 focus-visible:outline-none",
                  )}
                  onClick={() => inputRef.current?.click()}
                  aria-label="Cambiar foto del campamento"
                >
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-medium opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                    <Camera className="size-3.5" />
                    Cambiar foto
                  </span>
                </button>
                <Button
                  type="button"
                  size="icon-xs"
                  variant="secondary"
                  className="absolute right-1.5 top-1.5 z-10 size-7 bg-black/55 text-white hover:bg-black/70"
                  title="Quitar foto"
                  onClick={(e) => {
                    e.stopPropagation();
                    void quitarFoto();
                  }}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </>
            )}
          </>
        )}
      </div>
      {!hayStorage && puedeEditar && (
        <p className="text-[10px] text-amber-400">
          Subida desactivada: falta configurar Supabase.
        </p>
      )}
      {error && <p className="text-[10px] text-destructive">{error}</p>}
    </div>
  );
}

/** Borrado suave del campamento (admin / analista). Confirmación obligatoria. */
function ZonaEliminarCampamento({
  centro,
  onEliminado,
}: {
  centro: CentroTransitorio;
  onEliminado?: () => void;
}) {
  const [eliminando, setEliminando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function eliminar() {
    setError(null);
    setEliminando(true);
    try {
      await eliminarCentro(centro.id);
      onEliminado?.();
    } catch (err) {
      console.error("[ResumenCentroPanel] error eliminando centro:", err);
      setError(
        err instanceof Error ? err.message : "No se pudo eliminar el campamento.",
      );
    } finally {
      setEliminando(false);
    }
  }

  return (
    <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 sm:p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 space-y-0.5">
          <p className="text-sm font-semibold text-foreground">Eliminar campamento</p>
          <p className="text-xs text-muted-foreground">
            Desaparece del mapa, el tablero y el dashboard. El histórico queda en
            la base; un administrador puede restaurarlo.
          </p>
        </div>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              type="button"
              variant="destructive"
              className="shrink-0"
              disabled={eliminando}
            >
              {eliminando ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Trash2 className="size-4" />
              )}
              Eliminar campamento
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>¿Eliminar este campamento de la red?</AlertDialogTitle>
              <AlertDialogDescription>
                N.° {centro.nro} · {centro.nombre}. Desaparecerá del mapa, el tablero y
                el dashboard en todos los dispositivos. El histórico queda guardado y un
                administrador puede restaurarlo desde la base de datos.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={eliminando}>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                disabled={eliminando}
                onClick={() => void eliminar()}
              >
                Eliminar campamento
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
    </div>
  );
}

/** Composición de la pestaña Resumen. */
export function ResumenCentroPanel({
  centro,
  puedeEditar = false,
  puedeEliminar = false,
  onIrAPestana,
  onEditarUbicacion,
  onEliminado,
}: Props) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-4 sm:items-stretch">
        <div className="sm:col-span-1">
          {puedeEditar ? (
            <FotoCentroEditable centro={centro} puedeEditar />
          ) : (
            <SeccionFotoCentro
              centro={centro}
              className="h-full max-h-40 sm:max-h-none sm:aspect-auto"
            />
          )}
        </div>
        <div className="flex min-w-0 flex-col gap-2 sm:col-span-3">
          <KpisResumen centro={centro} />
          <ProgresoCensoPoblacion centro={centro} compacto />
          <AlertasDelDiaCentro centro={centro} onIrAPestana={onIrAPestana} />
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Identificación y asignación
        </p>
        <SeccionIdentificacionCentro
          centro={centro}
          puedeEditar={puedeEditar}
          onEditarUbicacion={onEditarUbicacion}
        />
      </div>

      <ChipAlertaServicios centro={centro} onIrAPestana={onIrAPestana} />

      {puedeEliminar && (
        <ZonaEliminarCampamento centro={centro} onEliminado={onEliminado} />
      )}
    </div>
  );
}
