import { PanelLeftOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { CentroTransitorio } from "@/domain/centrosTransitorios";
import { BuscadorCompacto } from "./BuscadorCompacto";
import type { EstadoFilaCentro } from "./CentrosListaItems";

interface Props {
  centros: CentroTransitorio[];
  estados: Map<string, EstadoFilaCentro>;
  seleccionado: string | null;
  onSeleccionarCentro: (centro: CentroTransitorio) => void;
  panelAbierto: boolean;
  onAbrirPanel: () => void;
}

/** Columna flotante del mapa: lista y búsqueda rápida. */
export function ControlesMapaFlotantes({
  centros,
  estados,
  seleccionado,
  onSeleccionarCentro,
  panelAbierto,
  onAbrirPanel,
}: Props) {
  if (panelAbierto) return null;

  return (
    <TooltipProvider delayDuration={200}>
      <div className="map-controls-overlay pointer-events-none absolute left-3 top-3 z-40">
        <ButtonGroup
          orientation="vertical"
          className="pointer-events-auto w-10 min-w-10 overflow-hidden rounded-xl border border-border bg-card shadow-lg"
        >
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-10 w-10 min-w-10 shrink-0 border-0 bg-card text-foreground shadow-none hover:bg-muted/80"
                onClick={onAbrirPanel}
                aria-label="Lista de campamentos"
              >
                <PanelLeftOpen className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={8}>
              Lista de campamentos
            </TooltipContent>
          </Tooltip>

          <BuscadorCompacto
            centros={centros}
            estados={estados}
            seleccionado={seleccionado}
            onSeleccionar={onSeleccionarCentro}
          />
        </ButtonGroup>
      </div>
    </TooltipProvider>
  );
}
