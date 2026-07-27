// Ayuda viva del título descriptivo: contador de palabras + recordatorio de claridad.
// Sin léxico semántico — evita falsos "falta dónde/quién" en títulos válidos.

import { Check, Circle } from "lucide-react";
import {
  contarPalabrasTituloEvento,
  MIN_PALABRAS_TITULO_EVENTO,
  tituloEventoValido,
} from "@/domain/eventosReportes";
import { cn } from "@/lib/utils";

type Props = {
  titulo: string;
  className?: string;
};

export function ChecklistTituloNovedad({ titulo, className }: Props) {
  const palabras = contarPalabrasTituloEvento(titulo);
  const ok = tituloEventoValido(titulo);
  const hayTexto = titulo.trim().length > 0;

  return (
    <div
      className={cn(
        "mt-1.5 rounded-md border px-2 py-1.5",
        ok
          ? "border-emerald-500/40 bg-emerald-500/10"
          : "border-amber-500/40 bg-amber-500/10",
        className,
      )}
      role="status"
      aria-live="polite"
    >
      <p className="text-[10px] leading-snug text-muted-foreground">
        Una sola línea que se entienda sola: qué ocurrió, dónde y (si aplica)
        quién. Detalles extras en «Detalles de la novedad».
      </p>
      <div
        className={cn(
          "mt-1.5 flex items-center gap-1.5 text-[10px] font-medium leading-snug",
          ok ? "text-emerald-400" : "text-amber-200/90",
        )}
      >
        {ok ? (
          <Check className="size-3 shrink-0" aria-hidden />
        ) : (
          <Circle className="size-3 shrink-0 opacity-70" aria-hidden />
        )}
        <span>
          {hayTexto ? palabras : 0} / {MIN_PALABRAS_TITULO_EVENTO} palabras mínimas
          {ok ? " — mínimo cumplido" : ""}
        </span>
      </div>
      {ok ? (
        <p className="mt-1.5 text-[10px] leading-snug text-emerald-200/90">
          Revisá que quien lea solo el título entienda el evento. Si hace falta
          aclarar, ampliá esta línea — los Detalles de la novedad son opcionales y
          no reemplazan al título.
        </p>
      ) : null}
    </div>
  );
}
