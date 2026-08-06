// Feeds clickeables de la sala: novedades diarias, casos de salud y denuncias.

import { Link } from "react-router-dom";
import { ArrowDownRight, ArrowUpRight, HeartPulse, MessageSquareWarning, Minus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  META_ESTATUS_CASO_SALUD,
  type CasoSaludCentro,
} from "@/domain/casosSalud";
import {
  META_TIPO_EVENTO_REPORTE,
  type EventoReporte,
} from "@/domain/eventosReportes";
import {
  labelCategoriaDenuncia,
  type Denuncia,
} from "@/domain/denuncias";

function horaDe(ts: number, dia: string, hoy: string): string {
  const hora =
    ts > 0
      ? new Date(ts).toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" })
      : "";
  if (!dia || dia === hoy) return hora;
  const [, m, d] = dia.split("-");
  return `${d}-${m}${hora ? ` · ${hora}` : ""}`;
}

const claseItem =
  "block rounded-lg border border-border bg-card/60 px-2.5 py-2 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

interface BaseFeedProps {
  nombresCentros: Map<string, string>;
  hoy: string;
}

export function FeedNovedadesDiarias({
  eventos,
  nombresCentros,
  hoy,
}: BaseFeedProps & { eventos: EventoReporte[] }) {
  const eventosDesc = [...eventos].sort((a, b) => b.ts - a.ts);
  if (eventosDesc.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">Sin novedades reportadas hoy.</p>
    );
  }
  return (
    <div className="space-y-2">
      {eventosDesc.map((ev) => {
        const meta = META_TIPO_EVENTO_REPORTE[ev.tipo];
        const Icono =
          ev.tipo === "positivo"
            ? ArrowUpRight
            : ev.tipo === "negativo"
              ? ArrowDownRight
              : Minus;
        return (
          <Link
            key={ev.id}
            to={`/centro/${ev.centro_id}?vista=incidencias`}
            className={claseItem}
            style={{ borderLeft: `3px solid ${meta.color}` }}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="flex min-w-0 items-center gap-1 text-xs font-semibold text-foreground">
                <Icono className="size-3.5 shrink-0" style={{ color: meta.color }} />
                <span className="truncate">
                  {nombresCentros.get(ev.centro_id) ?? ev.centro_id}
                </span>
              </span>
              <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
                {horaDe(ev.ts, ev.dia, hoy)}
              </span>
            </div>
            <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
              <span className="font-medium text-foreground/90">{ev.titulo}</span>
              {ev.descripcion ? ` — ${ev.descripcion}` : ""}
            </p>
          </Link>
        );
      })}
    </div>
  );
}

export function FeedCasosSalud({
  casos,
  nombresCentros,
  hoy,
}: BaseFeedProps & { casos: CasoSaludCentro[] }) {
  // Solo abiertos (activo / en_proceso). Resuelto y archivado = histórico.
  const casosOrdenados = [...casos]
    .filter((c) => c.estatus === "activo" || c.estatus === "en_proceso")
    .sort(
      (a, b) =>
        META_ESTATUS_CASO_SALUD[a.estatus].orden -
          META_ESTATUS_CASO_SALUD[b.estatus].orden || b.creada_ts - a.creada_ts,
    );
  if (casosOrdenados.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">Sin casos de salud activos.</p>
    );
  }
  return (
    <div className="space-y-2">
      {casosOrdenados.map((caso) => {
        const meta = META_ESTATUS_CASO_SALUD[caso.estatus];
        return (
          <Link
            key={caso.id}
            to={`/centro/${caso.centro_id}?vista=incidencias`}
            className={claseItem}
            style={{ borderLeft: `3px solid ${meta.color}` }}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="flex min-w-0 items-center gap-1 text-xs font-semibold text-foreground">
                <HeartPulse className="size-3.5 shrink-0" style={{ color: meta.color }} />
                <span className="truncate">
                  {nombresCentros.get(caso.centro_id) ?? caso.centro_id}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-1.5">
                <Badge
                  variant="outline"
                  className="px-1.5 py-0 text-[10px]"
                  style={{ borderColor: `${meta.color}66`, color: meta.color }}
                >
                  {meta.label}
                </Badge>
                <span className="text-[10px] tabular-nums text-muted-foreground">
                  {horaDe(caso.creada_ts, caso.reportado_dia, hoy)}
                </span>
              </span>
            </div>
            <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
              <span className="font-medium text-foreground/90">
                {caso.titulo || "Caso de salud"}
              </span>
              {caso.descripcion ? ` — ${caso.descripcion}` : ""}
            </p>
          </Link>
        );
      })}
    </div>
  );
}

export function FeedDenuncias({
  denuncias,
  nombresCentros,
  hoy,
}: BaseFeedProps & { denuncias: Denuncia[] }) {
  const ordenadas = [...denuncias].sort((a, b) => b.ts - a.ts);
  if (ordenadas.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">Sin denuncias recientes.</p>
    );
  }
  return (
    <div className="space-y-2">
      {ordenadas.map((d) => {
        const color = d.estado === "abierta" ? "#f59e0b" : "#22c55e";
        return (
          <Link
            key={d.id}
            to={`/incidencias/refugiados`}
            className={claseItem}
            style={{ borderLeft: `3px solid ${color}` }}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="flex min-w-0 items-center gap-1 text-xs font-semibold text-foreground">
                <MessageSquareWarning
                  className="size-3.5 shrink-0"
                  style={{ color }}
                />
                <span className="truncate">
                  {nombresCentros.get(d.centro_id) ?? d.centro_id}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-1.5">
                <Badge
                  variant="outline"
                  className="px-1.5 py-0 text-[10px]"
                  style={{ borderColor: `${color}66`, color }}
                >
                  {d.estado === "abierta" ? "Abierta" : "Resuelta"}
                </Badge>
                <span className="text-[10px] tabular-nums text-muted-foreground">
                  {horaDe(d.ts, d.dia, hoy)}
                </span>
              </span>
            </div>
            <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
              <span className="font-medium text-foreground/90">
                {d.titulo || labelCategoriaDenuncia(d.categoria)}
              </span>
              {d.texto ? ` — ${d.texto}` : ""}
            </p>
          </Link>
        );
      })}
    </div>
  );
}
