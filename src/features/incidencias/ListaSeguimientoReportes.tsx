// Lista global de casos de salud y novedades del reporte diario.

import { Link } from "react-router-dom";
import {
  ArchiveRestore,
  CalendarPlus,
  Circle,
  ExternalLink,
  Loader2,
  Stethoscope,
  ThumbsDown,
  ThumbsUp,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  META_ESTATUS_CASO_SALUD,
  META_TIPO_EVENTO_REPORTE,
  type CasoSaludCentro,
  type EstatusCasoSalud,
} from "@/domain/seguimientoReportes";
import { textoParticipantesEvento, type EventoReporte } from "@/domain/eventosReportes";
import type { CentroTransitorio } from "@/domain/centrosTransitorios";
import { BadgeAntiguedad } from "@/components/ui/badge-antiguedad";
import { cn } from "@/lib/utils";

export type ItemSeguimiento =
  | { tipo: "salud"; item: CasoSaludCentro }
  | { tipo: "novedad"; item: EventoReporte };

interface Props {
  items: ItemSeguimiento[];
  centrosPorId: Map<string, CentroTransitorio>;
  mostrarAccionesSalud?: boolean;
  puedeEditarSalud?: (caso: CasoSaludCentro) => boolean;
  onCambiarEstatusSalud?: (id: string, estatus: EstatusCasoSalud) => void;
  onArchivarSalud?: (id: string) => void;
  onDesarchivarSalud?: (id: string) => void;
  accionEnCursoId?: string | null;
}

function formatearDia(dia: string): string {
  const [a, m, d] = dia.split("-").map(Number);
  return new Date(a, m - 1, d).toLocaleDateString("es", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatearHora(ts: number): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleTimeString("es", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function EnlaceCentro({
  centroId,
  centrosPorId,
}: {
  centroId: string;
  centrosPorId: Map<string, CentroTransitorio>;
}) {
  const centro = centrosPorId.get(centroId);
  const label = centro
    ? `N.° ${centro.nro ?? "?"} · ${centro.nombre}`
    : centroId;
  return (
    <Link
      to={`/centro/${centroId}?vista=incidencias`}
      className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
    >
      {label}
      <ExternalLink className="size-3 shrink-0 opacity-70" />
    </Link>
  );
}

function FilaCasoSalud({
  caso,
  centrosPorId,
  mostrarAcciones,
  puedeEditar,
  onCambiarEstatus,
  onArchivar,
  onDesarchivar,
  accionEnCurso,
}: {
  caso: CasoSaludCentro;
  centrosPorId: Map<string, CentroTransitorio>;
  mostrarAcciones?: boolean;
  puedeEditar?: boolean;
  onCambiarEstatus?: (estatus: EstatusCasoSalud) => void;
  onArchivar?: () => void;
  onDesarchivar?: () => void;
  accionEnCurso?: boolean;
}) {
  const meta = META_ESTATUS_CASO_SALUD[caso.estatus];

  return (
    <div className="rounded-lg border border-border bg-card px-3 py-3 sm:px-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <Stethoscope className="size-3.5 text-rose-400" />
            <Badge
              variant="outline"
              className="text-[10px]"
              style={{ borderColor: `${meta.color}66`, color: meta.color }}
            >
              {meta.label}
            </Badge>
            <BadgeAntiguedad
              reportadoDia={caso.reportado_dia}
              resueltaTs={caso.resuelta_ts}
              creadaTs={caso.creada_ts}
            />
          </div>
          <p className="text-sm font-medium leading-snug text-foreground">{caso.titulo}</p>
          {caso.descripcion ? (
            <p className="text-xs leading-snug text-muted-foreground">{caso.descripcion}</p>
          ) : null}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
            <EnlaceCentro centroId={caso.centro_id} centrosPorId={centrosPorId} />
            <span>· Reportado {formatearDia(caso.reportado_dia)}</span>
            {caso.updated_by ? <span>· {caso.updated_by}</span> : null}
          </div>
        </div>
      </div>

      {mostrarAcciones && puedeEditar && caso.estatus === "archivado" && (
        <div className="mt-3">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="w-full sm:w-auto"
            disabled={accionEnCurso}
            onClick={onDesarchivar}
          >
            {accionEnCurso ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <ArchiveRestore className="size-4" />
            )}
            Desarchivar
          </Button>
        </div>
      )}

      {mostrarAcciones && puedeEditar && caso.estatus !== "archivado" && (
        <div className="mt-3 space-y-2">
          {caso.estatus !== "resuelto" ? (
            <div className="flex overflow-hidden rounded-lg border border-border/70">
              {(["activo", "en_proceso", "resuelto"] as const).map((est) => {
                const e = META_ESTATUS_CASO_SALUD[est];
                const activo = caso.estatus === est;
                return (
                  <button
                    key={est}
                    type="button"
                    disabled={accionEnCurso || activo}
                    onClick={() => onCambiarEstatus?.(est)}
                    className={cn(
                      "flex-1 border-r border-border/70 px-2 py-1.5 text-[11px] font-semibold transition-colors last:border-r-0",
                      activo
                        ? "text-white"
                        : "text-muted-foreground hover:bg-muted/40",
                    )}
                    style={activo ? { backgroundColor: e.color } : undefined}
                  >
                    {e.label}
                  </button>
                );
              })}
            </div>
          ) : (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="w-full sm:w-auto"
              disabled={accionEnCurso}
              onClick={onArchivar}
            >
              {accionEnCurso ? <Loader2 className="size-4 animate-spin" /> : null}
              Archivar
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function FilaNovedad({
  evento,
  centrosPorId,
}: {
  evento: EventoReporte;
  centrosPorId: Map<string, CentroTransitorio>;
}) {
  const meta = META_TIPO_EVENTO_REPORTE[evento.tipo];

  return (
    <div className="rounded-lg border border-border bg-card px-3 py-3 sm:px-4">
      <div className="flex flex-wrap items-start gap-2">
        {evento.tipo === "positivo" ? (
          <ThumbsUp className="mt-0.5 size-4 shrink-0 text-emerald-400" />
        ) : evento.tipo === "negativo" ? (
          <ThumbsDown className="mt-0.5 size-4 shrink-0 text-red-400" />
        ) : (
          <Circle className="mt-0.5 size-4 shrink-0 fill-zinc-400 text-zinc-400" />
        )}
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <CalendarPlus className="size-3.5 text-emerald-400" />
            <Badge
              variant="outline"
              className="text-[10px]"
              style={{ borderColor: `${meta.color}66`, color: meta.color }}
            >
              {meta.label}
            </Badge>
            <span className="text-[11px] text-muted-foreground">
              {formatearDia(evento.dia)} · {formatearHora(evento.ts)}
            </span>
          </div>
          <p className="text-sm font-medium leading-snug text-foreground">{evento.titulo}</p>
          {evento.descripcion ? (
            <p className="text-xs leading-snug text-muted-foreground">{evento.descripcion}</p>
          ) : null}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
            <EnlaceCentro centroId={evento.centro_id} centrosPorId={centrosPorId} />
            <span>· {textoParticipantesEvento(evento)}</span>
            {evento.creada_por ? <span>· {evento.creada_por}</span> : null}
          </div>
        </div>
      </div>
    </div>
  );
}

export function ListaSeguimientoReportes({
  items,
  centrosPorId,
  mostrarAccionesSalud = false,
  puedeEditarSalud,
  onCambiarEstatusSalud,
  onArchivarSalud,
  onDesarchivarSalud,
  accionEnCursoId = null,
}: Props) {
  if (items.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
        No hay registros que coincidan con los filtros seleccionados.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {items.map((entry) =>
        entry.tipo === "salud" ? (
          <FilaCasoSalud
            key={`salud-${entry.item.id}`}
            caso={entry.item}
            centrosPorId={centrosPorId}
            mostrarAcciones={mostrarAccionesSalud}
            puedeEditar={puedeEditarSalud?.(entry.item) ?? true}
            onCambiarEstatus={(est) => onCambiarEstatusSalud?.(entry.item.id, est)}
            onArchivar={() => onArchivarSalud?.(entry.item.id)}
            onDesarchivar={() => onDesarchivarSalud?.(entry.item.id)}
            accionEnCurso={accionEnCursoId === entry.item.id}
          />
        ) : (
          <FilaNovedad key={`novedad-${entry.item.id}`} evento={entry.item} centrosPorId={centrosPorId} />
        ),
      )}
    </div>
  );
}
