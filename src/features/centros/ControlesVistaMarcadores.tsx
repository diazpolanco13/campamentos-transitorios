import { BarChart3, Droplet, Globe2, Hash, List, Palette } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import type { ModoMarcadorCentros } from "@/data/preferenciasMapa";

export interface PropsTogglesVistaMapa {
  modoMarcador: ModoMarcadorCentros;
  onCambiarModo: (modo: ModoMarcadorCentros) => void;
  mostrarParte: boolean;
  onCambiarMostrarParte: (mostrar: boolean) => void;
  mostrarLeyenda: boolean;
  onCambiarMostrarLeyenda: (mostrar: boolean) => void;
  mostrarCintaTotales: boolean;
  onCambiarMostrarCintaTotales: (mostrar: boolean) => void;
  /** Proyección esfera (MapLibre globe). Independiente del estilo Carto/sat. */
  modoGlobo: boolean;
  onCambiarModoGlobo: (activo: boolean) => void;
  /** Núcleo del marcador coloreado por unidad SEBIN. Default: off (un solo color neutro). */
  colorearPorUnidad: boolean;
  onCambiarColorearPorUnidad: (activo: boolean) => void;
}

/** Panel de switches para la vista del mapa (dentro del popover de controles). */
export function PanelTogglesVistaMapa({
  modoMarcador,
  onCambiarModo,
  mostrarParte,
  onCambiarMostrarParte,
  mostrarLeyenda,
  onCambiarMostrarLeyenda,
  mostrarCintaTotales,
  onCambiarMostrarCintaTotales,
  modoGlobo,
  onCambiarModoGlobo,
  colorearPorUnidad,
  onCambiarColorearPorUnidad,
}: PropsTogglesVistaMapa) {
  const vistaColor = modoMarcador === "color";

  return (
    <div className="flex flex-col gap-2 p-0.5">
      <p className="px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        Vista del mapa
      </p>
      <FilaToggle
        id="toggle-cinta-totales"
        icono={<BarChart3 className="size-3.5 shrink-0 text-muted-foreground" />}
        etiqueta="Cinta de totales"
        checked={mostrarCintaTotales}
        onCheckedChange={onCambiarMostrarCintaTotales}
        ariaLabel="Mostrar u ocultar la cinta de totales en la parte superior"
      />
      <FilaToggle
        id="toggle-globo"
        icono={<Globe2 className="size-3.5 shrink-0 text-muted-foreground" />}
        etiqueta="Vista globo (esfera)"
        checked={modoGlobo}
        onCheckedChange={onCambiarModoGlobo}
        ariaLabel="Activar o desactivar la proyección esférica del planeta"
        conBorde
      />
      <FilaToggle
        id="toggle-vista-color"
        icono={<Palette className="size-3.5 shrink-0 text-primary" />}
        etiqueta="Puntos por dirección"
        checked={vistaColor}
        onCheckedChange={(checked) => onCambiarModo(checked ? "color" : "logo")}
        ariaLabel="Alternar entre puntos de color y logo SEBIN"
        conBorde
      />
      <FilaToggle
        id="toggle-parte-numerico"
        icono={<Hash className="size-3.5 shrink-0 text-muted-foreground" />}
        etiqueta="Parte en marcadores"
        checked={mostrarParte}
        onCheckedChange={onCambiarMostrarParte}
        ariaLabel="Mostrar u ocultar damnificados en los marcadores"
        conBorde
      />
      <FilaToggle
        id="toggle-colorear-unidad"
        icono={<Droplet className="size-3.5 shrink-0 text-muted-foreground" />}
        etiqueta="Colorear por unidad"
        checked={colorearPorUnidad}
        onCheckedChange={onCambiarColorearPorUnidad}
        ariaLabel="Colorear el núcleo del marcador por unidad responsable (si no, un solo color)"
        conBorde
        deshabilitado={!vistaColor}
      />
      <FilaToggle
        id="toggle-leyenda-sebin"
        icono={<List className="size-3.5 shrink-0 text-muted-foreground" />}
        etiqueta="Unidades responsables"
        checked={mostrarLeyenda}
        onCheckedChange={onCambiarMostrarLeyenda}
        ariaLabel="Mostrar u ocultar el filtro de unidades responsables"
        conBorde
        deshabilitado={!vistaColor}
      />
      <p className="px-1 text-[10px] leading-snug text-muted-foreground">
        {modoGlobo
          ? "Aleja el zoom para ver el planeta en esfera."
          : !vistaColor
            ? mostrarParte
              ? "Logo SEBIN con parte diario."
              : "Solo logo SEBIN por campamento."
            : !colorearPorUnidad
              ? "Un solo color: el aro de progreso del reporte es lo que resalta."
              : mostrarParte
                ? "Puntos de color con conteo debajo."
                : mostrarLeyenda
                  ? "Toque una o varias unidades responsables para filtrar."
                  : "Solo puntos de color por dirección SEBIN."}
      </p>
      {vistaColor && (
        <p className="border-t border-border/60 px-1 pt-2 text-[10px] leading-snug text-muted-foreground">
          Base roja: novedad negativa, denuncia abierta o caso de salud. Detalle tipado en el
          popup.
        </p>
      )}
    </div>
  );
}

function FilaToggle({
  id,
  icono,
  etiqueta,
  checked,
  onCheckedChange,
  ariaLabel,
  conBorde = false,
  deshabilitado = false,
}: {
  id: string;
  icono: React.ReactNode;
  etiqueta: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  ariaLabel: string;
  conBorde?: boolean;
  deshabilitado?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 px-1",
        conBorde && "border-t border-border/60 pt-2",
        deshabilitado && "opacity-50",
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        {icono}
        <Label htmlFor={id} className={cn("text-xs leading-snug", !deshabilitado && "cursor-pointer")}>
          {etiqueta}
        </Label>
      </div>
      <Switch
        id={id}
        size="sm"
        checked={checked}
        disabled={deshabilitado}
        onCheckedChange={onCheckedChange}
        aria-label={ariaLabel}
      />
    </div>
  );
}
