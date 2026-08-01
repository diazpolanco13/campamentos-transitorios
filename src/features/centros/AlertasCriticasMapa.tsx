// Chips tipados de alertas críticas en el popup del mapa: novedad negativa,
// denuncia abierta y caso de salud. Solo visible si hay ≥1; cada chip deep-linkea
// a la sección de la ficha correspondiente.
//
// Nota: este árbol se monta con createRoot dentro del popup MapLibre, fuera del
// Router. No usar <Link>/useNavigate aquí — navegar vía callback o <a href>.

import { useMemo } from "react";
import { MessageSquareWarning, Stethoscope, ThumbsDown } from "lucide-react";
import { claveDia } from "@/data/reposSupabase";
import { useEventosReportes } from "@/data/useEventosReportes";
import { useDenuncias } from "@/data/useDenuncias";
import { useCasosSaludCentros } from "@/data/useCasosSaludCentros";
import {
  alertasCriticasDeCentro,
  tieneAlertaCritica,
} from "@/domain/alertasCriticasCentro";
import { labelCategoriaDenuncia } from "@/domain/denuncias";
import { cn } from "@/lib/utils";

interface Props {
  centroId: string;
  className?: string;
  /** Navegación SPA desde el árbol del Router (popup MapLibre no tiene contexto). */
  onNavegar?: (ruta: string) => void;
}

function navegarPopup(
  ev: React.MouseEvent,
  to: string,
  onNavegar?: (ruta: string) => void,
) {
  ev.stopPropagation();
  if (onNavegar) {
    ev.preventDefault();
    onNavegar(to);
    return;
  }
  // Fallback sin callback: navegación completa por href.
}

function ChipAlerta({
  to,
  icono,
  titulo,
  preview,
  color,
  onNavegar,
}: {
  to: string;
  icono: React.ReactNode;
  titulo: string;
  preview: string;
  color: string;
  onNavegar?: (ruta: string) => void;
}) {
  return (
    <a
      href={to}
      onClick={(ev) => navegarPopup(ev, to, onNavegar)}
      className={cn(
        "flex min-w-0 items-start gap-2 rounded-lg border px-2 py-1.5 transition-colors",
        "hover:bg-muted/40 active:bg-muted/50",
      )}
      style={{ borderColor: `${color}66` }}
    >
      <span className="mt-0.5 shrink-0" style={{ color }}>
        {icono}
      </span>
      <span className="min-w-0 flex-1 leading-tight">
        <span className="block text-[11px] font-semibold text-foreground">{titulo}</span>
        <span className="mt-0.5 block truncate text-[10px] text-muted-foreground" title={preview}>
          {preview}
        </span>
      </span>
    </a>
  );
}

/** Franja de alertas críticas tipadas bajo el popup del mapa. */
export function AlertasCriticasMapa({ centroId, className, onNavegar }: Props) {
  const hoy = useMemo(() => claveDia(Date.now()), []);
  const { eventos } = useEventosReportes({ centroId, dia: hoy });
  const denuncias = useDenuncias({ centroId, estado: "abierta" });
  const { casos } = useCasosSaludCentros({ centroId, soloActivos: true });

  const alertas = useMemo(
    () =>
      alertasCriticasDeCentro(centroId, {
        dia: hoy,
        eventos,
        denuncias,
        casosSalud: casos,
      }),
    [centroId, hoy, eventos, denuncias, casos],
  );

  if (!tieneAlertaCritica(alertas)) return null;

  const base = `/centro/${centroId}`;
  const rutaSeguimiento = `${base}?vista=incidencias`;
  const rutaBuzon = `${base}?vista=buzon`;
  const rutaNovedadesReporte = `${base}?vista=reporte&reportar=1&fase=novedades`;

  const nNeg = alertas.novedadesNegativas.length;
  const nDen = alertas.denuncias.length;
  const nSalud = alertas.casosSalud.length;

  const previewNovedad =
    alertas.novedadesNegativas[0]?.titulo?.trim() ||
    alertas.novedadesNegativas[0]?.descripcion?.trim() ||
    "Sin título";
  const den0 = alertas.denuncias[0];
  const previewDenuncia = den0
    ? (den0.titulo?.trim() ||
        den0.texto?.trim() ||
        labelCategoriaDenuncia(den0.categoria))
    : "";
  const previewSalud =
    alertas.casosSalud[0]?.titulo?.trim() ||
    alertas.casosSalud[0]?.descripcion?.trim() ||
    "Sin título";

  return (
    <div className={cn("space-y-1.5 border-t border-border/60 pt-2", className)}>
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        Alertas
      </p>
      <div className="flex flex-col gap-1">
        {nNeg > 0 && (
          <ChipAlerta
            to={rutaSeguimiento}
            icono={<ThumbsDown className="size-3.5" />}
            titulo={nNeg === 1 ? "Novedad negativa" : `${nNeg} novedades negativas`}
            preview={previewNovedad}
            color="#ef4444"
            onNavegar={onNavegar}
          />
        )}
        {nNeg > 0 && (
          <a
            href={rutaNovedadesReporte}
            onClick={(ev) => navegarPopup(ev, rutaNovedadesReporte, onNavegar)}
            className="pl-7 text-[10px] font-medium text-primary hover:underline"
          >
            Abrir fase Novedades del reporte
          </a>
        )}
        {nDen > 0 && (
          <ChipAlerta
            to={rutaBuzon}
            icono={<MessageSquareWarning className="size-3.5" />}
            titulo={nDen === 1 ? "Denuncia abierta" : `${nDen} denuncias abiertas`}
            preview={previewDenuncia}
            color="#f59e0b"
            onNavegar={onNavegar}
          />
        )}
        {nSalud > 0 && (
          <ChipAlerta
            to={rutaSeguimiento}
            icono={<Stethoscope className="size-3.5" />}
            titulo={nSalud === 1 ? "Caso de salud" : `${nSalud} casos de salud`}
            preview={previewSalud}
            color="#ef4444"
            onNavegar={onNavegar}
          />
        )}
      </div>
    </div>
  );
}
