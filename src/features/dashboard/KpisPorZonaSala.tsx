// Bloque KPI por zona (Caracas/Miranda | Vargas) para la sala situacional.

import type { ReactNode } from "react";
import { Building2, Home, PawPrint, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  ETIQUETA_ZONA_SALA,
  type KpisZonaSala,
  type ZonaSala,
} from "@/domain/redCentros";

interface Props {
  zona: ZonaSala;
  kpis: KpisZonaSala;
  activo?: boolean;
  onSeleccionar?: (zona: ZonaSala | null) => void;
}

function MiniStat({
  label,
  valor,
  icono,
  acento,
}: {
  label: string;
  valor: number | string;
  icono?: ReactNode;
  acento?: string;
}) {
  return (
    <div className="min-w-0 rounded-lg border border-border bg-card/40 px-2.5 py-2">
      <div className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {icono}
        <span className="truncate">{label}</span>
      </div>
      <div className={cn("mt-0.5 text-xl font-bold tabular-nums lg:text-2xl", acento)}>
        {typeof valor === "number" ? valor.toLocaleString("es") : valor}
      </div>
    </div>
  );
}

export function KpisPorZonaSala({ zona, kpis, activo, onSeleccionar }: Props) {
  return (
    <Card
      className={cn(
        "gap-2 py-3 transition-colors",
        activo && "border-sky-500/60 ring-1 ring-sky-500/40",
      )}
    >
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-0">
        <CardTitle className="text-sm lg:text-base">{ETIQUETA_ZONA_SALA[zona]}</CardTitle>
        {onSeleccionar && (
          <Button
            type="button"
            variant={activo ? "default" : "outline"}
            size="sm"
            className="h-8 shrink-0"
            onClick={() => onSeleccionar(activo ? null : zona)}
          >
            {activo ? "Ver todos" : "Filtrar mapa"}
          </Button>
        )}
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        <MiniStat
          label="Campamentos"
          valor={kpis.refugiosTotal}
          icono={<Building2 className="size-3" />}
        />
        <MiniStat
          label="Ocupados / vacíos"
          valor={`${kpis.ocupados} / ${kpis.vacios}`}
          icono={<Building2 className="size-3" />}
          acento={kpis.vacios > 0 ? "text-amber-200" : "text-emerald-300"}
        />
        <MiniStat
          label="Familias"
          valor={kpis.familias}
          icono={<Home className="size-3" />}
        />
        <MiniStat
          label="Damnificados"
          valor={kpis.damnificados}
          icono={<Users className="size-3" />}
          acento="text-sky-300"
        />
        <MiniStat
          label="Mascotas"
          valor={kpis.mascotas}
          icono={<PawPrint className="size-3" />}
          acento="text-amber-200"
        />
      </CardContent>
    </Card>
  );
}
