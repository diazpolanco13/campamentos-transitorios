import { useState } from "react";
import { ClipboardCheck, CircleDashed, Clock3, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { EstadoReporteDia } from "@/domain/reporteDiario";
import { META_SEVERIDAD_BRAIN } from "@/domain/sebinBrainGraph";
import { cn } from "@/lib/utils";

/** Filtros de estado de reporte (+ crítica) en el brain. */
export type FiltroReporteBrain =
  | "completo"
  | "parcial"
  | "incompleto"
  | "critica";

const OPCIONES_REPORTE: {
  id: Exclude<FiltroReporteBrain, "critica">;
  etiqueta: string;
  detalle: string;
  severidad: "ok" | "parcial" | "pendiente";
  icono: typeof ClipboardCheck;
}[] = [
  {
    id: "completo",
    etiqueta: "Completos",
    detalle: "Al día (6/6)",
    severidad: "ok",
    icono: ClipboardCheck,
  },
  {
    id: "parcial",
    etiqueta: "Parciales",
    detalle: "Reporte incompleto",
    severidad: "parcial",
    icono: Clock3,
  },
  {
    id: "incompleto",
    etiqueta: "Sin reporte",
    detalle: "Aún no enviaron",
    severidad: "pendiente",
    icono: CircleDashed,
  },
];

/** ¿Camp pasa filtro estado/crítica? Vacío = todos. OR entre activos. */
export function campamentoPasaFiltroReporte(
  severidad: keyof typeof META_SEVERIDAD_BRAIN,
  filtros: ReadonlySet<FiltroReporteBrain>,
  estadoReporte?: EstadoReporteDia,
): boolean {
  if (filtros.size === 0) return true;
  if (filtros.has("critica") && severidad === "critica") return true;
  const estado: EstadoReporteDia | undefined =
    estadoReporte ??
    (severidad === "ok"
      ? "completo"
      : severidad === "parcial"
        ? "parcial"
        : severidad === "pendiente"
          ? "pendiente"
          : undefined);
  if (filtros.has("completo") && estado === "completo") return true;
  if (
    filtros.has("parcial") &&
    (estado === "parcial" || estado === "solo_parte")
  ) {
    return true;
  }
  if (filtros.has("incompleto") && estado === "pendiente") return true;
  return false;
}

/** Botón + popover: completos / parciales / sin reporte. */
export function BotonFiltroReporteBrain({
  filtros,
  onAlternar,
}: {
  filtros: ReadonlySet<FiltroReporteBrain>;
  onAlternar: (f: FiltroReporteBrain) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const hayFiltroReporte =
    filtros.has("completo") ||
    filtros.has("parcial") ||
    filtros.has("incompleto");

  return (
    <Popover open={abierto} onOpenChange={setAbierto}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant={hayFiltroReporte ? "secondary" : "outline"}
              size="icon"
              className={cn(
                "h-10 w-10 min-w-10 shrink-0 border-0 bg-card text-foreground shadow-none hover:bg-muted/80",
                hayFiltroReporte && "bg-primary/15 text-primary",
              )}
              aria-label="Filtrar por estado de reporte"
              aria-expanded={abierto}
            >
              <SlidersHorizontal className="size-4" />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="left" sideOffset={8}>
          Estado del reporte
        </TooltipContent>
      </Tooltip>
      <PopoverContent
        side="left"
        align="center"
        sideOffset={8}
        className="w-[min(16rem,calc(100vw-5rem))] gap-1.5 p-2"
      >
        <p className="px-1 pb-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Estado del reporte
        </p>
        {OPCIONES_REPORTE.map((op) => {
          const Icono = op.icono;
          const color = META_SEVERIDAD_BRAIN[op.severidad].color;
          const activo = filtros.has(op.id);
          return (
            <div
              key={op.id}
              className="flex items-center justify-between gap-2 rounded-md border border-border/60 px-2 py-1.5"
            >
              <Label
                htmlFor={`filtro-brain-${op.id}`}
                className="flex min-w-0 cursor-pointer items-center gap-2"
              >
                <span
                  className="flex size-6 shrink-0 items-center justify-center rounded-md"
                  style={{
                    color,
                    background: `color-mix(in oklab, ${color} 15%, transparent)`,
                    boxShadow: `inset 0 0 0 1px ${color}`,
                  }}
                >
                  <Icono className="size-3.5" />
                </span>
                <span className="min-w-0">
                  <span className="block text-xs font-medium leading-tight">
                    {op.etiqueta}
                  </span>
                  <span className="block text-[10px] text-muted-foreground">
                    {op.detalle}
                  </span>
                </span>
              </Label>
              <Switch
                id={`filtro-brain-${op.id}`}
                size="sm"
                checked={activo}
                onCheckedChange={() => onAlternar(op.id)}
                aria-label={op.etiqueta}
              />
            </div>
          );
        })}
      </PopoverContent>
    </Popover>
  );
}
