import type { ReactNode } from "react";
import { Home, Network, Siren, ClipboardCheck } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { META_SEVERIDAD_BRAIN } from "@/domain/sebinBrainGraph";
import { cn } from "@/lib/utils";

export type ResumenBrain = {
  camps: number;
  unidades: number;
  reportesOk: number;
  criticos: number;
};

function KpiBrain({
  icono,
  etiqueta,
  valor,
  color,
}: {
  icono: ReactNode;
  etiqueta: string;
  valor: string | number;
  color?: string;
}) {
  return (
    <Card
      size="sm"
      className="min-w-[5.75rem] shrink-0 border-white/10 bg-background/60 py-2 shadow-lg shadow-black/25 backdrop-blur-md"
    >
      <CardContent className="flex items-center gap-2 px-2.5 sm:px-3">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-white/5 text-primary ring-1 ring-white/10">
          {icono}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-[9px] font-semibold uppercase tracking-wide text-muted-foreground sm:text-[10px]">
            {etiqueta}
          </span>
          <span
            className="block text-sm font-bold tabular-nums leading-tight sm:text-base"
            style={color ? { color } : undefined}
          >
            {typeof valor === "number" ? valor.toLocaleString("es") : valor}
          </span>
        </span>
      </CardContent>
    </Card>
  );
}

/** KPIs flotantes del brain (mismo patrón visual que TotalesMapaCentros). */
export function TotalesBrain({
  resumen,
  className,
}: {
  resumen: ResumenBrain;
  className?: string;
}) {
  return (
    <div
      className={cn(
        // fila compacta — no estira a full width (deja libre el zoom a la derecha)
        "pointer-events-auto flex w-max max-w-full gap-1.5 overflow-x-auto scrollbar-oculto",
        className,
      )}
    >
      <KpiBrain
        icono={<Home className="size-3.5" />}
        etiqueta="Camp."
        valor={resumen.camps}
      />
      <KpiBrain
        icono={<Network className="size-3.5" />}
        etiqueta="Und."
        valor={resumen.unidades}
      />
      <KpiBrain
        icono={<ClipboardCheck className="size-3.5" />}
        etiqueta="Rep. OK"
        valor={`${resumen.reportesOk}/${resumen.camps}`}
        color={META_SEVERIDAD_BRAIN.ok.color}
      />
      <KpiBrain
        icono={<Siren className="size-3.5" />}
        etiqueta="Crít."
        valor={resumen.criticos}
        color={
          resumen.criticos > 0 ? META_SEVERIDAD_BRAIN.critica.color : undefined
        }
      />
    </div>
  );
}
