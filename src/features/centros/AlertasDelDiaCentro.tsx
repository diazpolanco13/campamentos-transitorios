// Tarjetas de seguimiento del día: reporte, salud, novedades, denuncias,
// trabajos y déficit de infraestructura.

import { useMemo } from "react";
import {
  ClipboardCheck,
  HardHat,
  MessageSquareWarning,
  Stethoscope,
  ThumbsDown,
  TriangleAlert,
  Wrench,
} from "lucide-react";
import { claveDia } from "@/data/reposSupabase";
import { useReportesCentros } from "@/data/useReportesCentros";
import { useReportesControlDia } from "@/data/useReportesControlDia";
import { useEventosReportes } from "@/data/useEventosReportes";
import { useCasosSaludCentros } from "@/data/useCasosSaludCentros";
import { useDenuncias } from "@/data/useDenuncias";
import { useOcupacionesCentros } from "@/data/useOcupacionesCentros";
import { useReparacionesCentros } from "@/data/useReparacionesCentros";
import { alertasCentro } from "@/domain/capacidadCentros";
import type { CentroTransitorio } from "@/domain/centrosTransitorios";
import { controlReportado, reporteControlDelDia } from "@/domain/controlReporte";
import {
  estadoReporteDia,
  eventosRevisados,
  META_ESTADO_REPORTE,
  reporteDelDia,
} from "@/domain/reporteDiario";
import { reparacionesPendientes } from "@/domain/reparaciones";
import { casosSaludPendientes } from "@/domain/seguimientoReportes";
import { cn } from "@/lib/utils";

export type VistaFichaCentro =
  | "resumen"
  | "coordinacion"
  | "poblacion"
  | "censo_rapido"
  | "reporte"
  | "incidencias"
  | "infraestructura"
  | "buzon";

interface Props {
  centro: CentroTransitorio;
  onIrAPestana?: (vista: VistaFichaCentro) => void;
}

function TarjetaAlerta({
  titulo,
  icono,
  detalle,
  alerta,
  colorAlerta,
  onClick,
}: {
  titulo: string;
  icono: React.ReactNode;
  detalle: string;
  alerta: boolean;
  colorAlerta?: string;
  onClick?: () => void;
}) {
  const interactivo = Boolean(onClick);
  return (
    <button
      type="button"
      disabled={!interactivo}
      onClick={onClick}
      className={cn(
        "rounded-xl border bg-card px-3 py-2.5 text-left transition-colors",
        alerta ? "border-amber-500/50" : "border-border",
        interactivo && "cursor-pointer hover:bg-muted/30 active:bg-muted/40",
        !interactivo && "cursor-default",
      )}
      style={alerta && colorAlerta ? { borderColor: `${colorAlerta}66` } : undefined}
    >
      <div className="flex items-center gap-2">
        <span className="shrink-0 text-muted-foreground">{icono}</span>
        <span className="text-xs font-semibold text-foreground">{titulo}</span>
      </div>
      <p
        className={cn(
          "mt-1 line-clamp-2 text-[11px]",
          alerta ? "text-foreground" : "text-muted-foreground",
        )}
        style={alerta && colorAlerta ? { color: colorAlerta } : undefined}
      >
        {detalle}
      </p>
    </button>
  );
}

/** Alertas clicables del día: reporte, salud, novedades, denuncias, trabajos, infra. */
export function AlertasDelDiaCentro({ centro, onIrAPestana }: Props) {
  const hoy = useMemo(() => claveDia(Date.now()), []);
  const desde = useMemo(() => {
    const [y, m, d] = hoy.split("-").map(Number);
    const dt = new Date(y, m - 1, d);
    dt.setDate(dt.getDate() - 7);
    return claveDia(dt.getTime());
  }, [hoy]);

  const reportes = useReportesCentros({ centroId: centro.id, desde });
  const controles = useReportesControlDia({ centroId: centro.id, desde });
  const { eventos } = useEventosReportes({ centroId: centro.id, desde });
  const snapshots = useOcupacionesCentros({ centroId: centro.id, desde });
  const { casos } = useCasosSaludCentros({ centroId: centro.id, soloActivos: true });
  const denunciasAbiertas = useDenuncias({ centroId: centro.id, estado: "abierta" });
  const { trabajos } = useReparacionesCentros({ centroId: centro.id, soloActivos: true });

  const reporteHoy = reporteDelDia(reportes, centro.id, hoy);
  const snapshotHoy = snapshots.find((s) => s.dia === hoy);
  const parteNumerico = Boolean(snapshotHoy);
  const controlHoy = reporteControlDelDia(controles, centro.id, hoy);
  const eventosHoy = eventos.filter((e) => e.dia === hoy);
  const estadoReporte = estadoReporteDia(reporteHoy, parteNumerico, {
    controlRevisado: controlReportado(controlHoy),
    trabajosRevisados: reporteHoy?.trabajos_revisados ?? false,
    requerimientosRevisados: reporteHoy?.requerimientos_revisados ?? false,
    eventosRevisados: eventosRevisados(reporteHoy, eventosHoy.length),
  });
  const metaReporte = META_ESTADO_REPORTE[estadoReporte];
  const reporteAlerta = estadoReporte !== "completo";

  let detalleReporte = metaReporte.label;
  if (estadoReporte === "parcial") {
    detalleReporte = [
      parteNumerico ? "parte" : null,
      controlReportado(controlHoy) ? "control" : null,
      reporteHoy?.trabajos_revisados ? "trabajos" : null,
      reporteHoy?.requerimientos_revisados ? "req." : null,
      eventosRevisados(reporteHoy, eventosHoy.length) ? "novedades" : null,
    ]
      .filter(Boolean)
      .join(" · ");
  } else if (estadoReporte === "solo_parte") {
    detalleReporte = "Solo parte numérico";
  } else if (estadoReporte === "pendiente") {
    detalleReporte = "Sin reporte hoy";
  }

  const casosActivos = casosSaludPendientes(casos);
  const saludAlerta = casosActivos.length > 0;
  const detalleSalud =
    casosActivos.length > 0
      ? `${casosActivos.length} caso${casosActivos.length === 1 ? "" : "s"} activo${casosActivos.length === 1 ? "" : "s"}`
      : "Sin casos activos";

  const novedadesNegativasHoy = eventosHoy.filter((e) => e.tipo === "negativo");
  const novedadAlerta = novedadesNegativasHoy.length > 0;
  const detalleNovedad = novedadAlerta
    ? novedadesNegativasHoy.length === 1
      ? novedadesNegativasHoy[0].titulo?.trim() || "1 novedad negativa"
      : `${novedadesNegativasHoy.length} novedades negativas`
    : "Sin novedades negativas hoy";

  const denunciaAlerta = denunciasAbiertas.length > 0;
  const detalleDenuncia = denunciaAlerta
    ? denunciasAbiertas.length === 1
      ? denunciasAbiertas[0].titulo?.trim() ||
        denunciasAbiertas[0].texto?.trim() ||
        "1 denuncia abierta"
      : `${denunciasAbiertas.length} denuncias abiertas`
    : "Sin denuncias abiertas";

  const trabajosPendientes = reparacionesPendientes(trabajos);
  const trabajosAlerta = trabajosPendientes.length > 0;
  const detalleTrabajos =
    trabajosPendientes.length > 0
      ? `${trabajosPendientes.length} trabajo${trabajosPendientes.length === 1 ? "" : "s"} pendiente${trabajosPendientes.length === 1 ? "" : "s"}`
      : "Sin trabajos pendientes";

  const deficits = alertasCentro(centro);
  const deficitsRojos = deficits.filter((d) => d.severidad === "rojo");
  const deficitAlerta = deficits.length > 0;
  const colorDeficit = deficitsRojos.length > 0 ? "#ef4444" : "#f59e0b";
  let detalleDeficit = "Sin déficits de infraestructura";
  if (deficits.length > 0) {
    const etiquetas = deficits.slice(0, 3).map((d) => d.label);
    detalleDeficit =
      deficits.length <= 3
        ? etiquetas.join(" · ")
        : `${etiquetas.join(" · ")} · +${deficits.length - 3}`;
  }

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      <TarjetaAlerta
        titulo="Reporte hoy"
        icono={<ClipboardCheck className="size-4" />}
        detalle={detalleReporte}
        alerta={reporteAlerta}
        colorAlerta={metaReporte.color}
        onClick={onIrAPestana ? () => onIrAPestana("reporte") : undefined}
      />
      <TarjetaAlerta
        titulo="Casos de salud"
        icono={<Stethoscope className="size-4" />}
        detalle={detalleSalud}
        alerta={saludAlerta}
        colorAlerta="#ef4444"
        onClick={onIrAPestana ? () => onIrAPestana("incidencias") : undefined}
      />
      <TarjetaAlerta
        titulo="Novedades neg."
        icono={<ThumbsDown className="size-4" />}
        detalle={detalleNovedad}
        alerta={novedadAlerta}
        colorAlerta="#ef4444"
        onClick={onIrAPestana ? () => onIrAPestana("incidencias") : undefined}
      />
      <TarjetaAlerta
        titulo="Denuncias"
        icono={<MessageSquareWarning className="size-4" />}
        detalle={detalleDenuncia}
        alerta={denunciaAlerta}
        colorAlerta="#f59e0b"
        onClick={onIrAPestana ? () => onIrAPestana("buzon") : undefined}
      />
      <TarjetaAlerta
        titulo="Trabajos"
        icono={<Wrench className="size-4" />}
        detalle={detalleTrabajos}
        alerta={trabajosAlerta}
        colorAlerta="#f59e0b"
        onClick={onIrAPestana ? () => onIrAPestana("infraestructura") : undefined}
      />
      <TarjetaAlerta
        titulo="Déficit infra."
        icono={deficitAlerta ? <TriangleAlert className="size-4" /> : <HardHat className="size-4" />}
        detalle={detalleDeficit}
        alerta={deficitAlerta}
        colorAlerta={colorDeficit}
        onClick={onIrAPestana ? () => onIrAPestana("infraestructura") : undefined}
      />
    </div>
  );
}
