// Tablas de contabilización por delito (solicitados / reg. policial).

import { useEffect, useState } from "react";
import { Loader2, Scale } from "lucide-react";
import {
  obtenerDelitosResumen,
  type DelitosResumen,
  type DelitoCategoriaFila,
} from "@/data/reposCenso";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Panel = "solicitados" | "registro";

export function DelitosSalaSituacional({
  categoriaActiva,
  panelActivo,
  onSeleccionar,
}: {
  categoriaActiva: string | null;
  panelActivo: Panel | null;
  onSeleccionar: (panel: Panel, slug: string) => void;
}) {
  const [resumen, setResumen] = useState<DelitosResumen | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    setCargando(true);
    setError(null);
    void obtenerDelitosResumen()
      .then((data) => {
        if (vivo) setResumen(data);
      })
      .catch((err: unknown) => {
        if (vivo) {
          setError(err instanceof Error ? err.message : "No se pudo cargar delitos");
          setResumen(null);
        }
      })
      .finally(() => {
        if (vivo) setCargando(false);
      });
    return () => {
      vivo = false;
    };
  }, []);

  return (
    <div>
      <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        <Scale className="size-3.5" />
        Sala situacional · delitos · clic para filtrar
      </p>
      {cargando ? (
        <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Cargando categorías…
        </div>
      ) : error ? (
        <p className="py-2 text-sm text-destructive">{error}</p>
      ) : resumen ? (
        <div className="grid gap-3 lg:grid-cols-2">
          <TablaDelitos
            titulo="Personas en estatus de «Solicitados»"
            total={resumen.solicitados.total}
            filas={resumen.solicitados.categorias}
            panel="solicitados"
            activo={panelActivo === "solicitados" ? categoriaActiva : null}
            onSeleccionar={onSeleccionar}
            acento="red"
          />
          <TablaDelitos
            titulo="Personas con historial / registro policial"
            total={resumen.registro_policial.total}
            filas={resumen.registro_policial.categorias}
            panel="registro"
            activo={panelActivo === "registro" ? categoriaActiva : null}
            onSeleccionar={onSeleccionar}
            acento="amber"
          />
        </div>
      ) : null}
    </div>
  );
}

function TablaDelitos({
  titulo,
  total,
  filas,
  panel,
  activo,
  onSeleccionar,
  acento,
}: {
  titulo: string;
  total: number;
  filas: DelitoCategoriaFila[];
  panel: Panel;
  activo: string | null;
  onSeleccionar: (panel: Panel, slug: string) => void;
  acento: "red" | "amber";
}) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-lg border",
        acento === "red" ? "border-red-500/25" : "border-amber-500/25",
      )}
    >
      <div
        className={cn(
          "flex items-center justify-between gap-2 px-3 py-2 text-xs font-semibold",
          acento === "red"
            ? "bg-red-500/10 text-red-700 dark:text-red-300"
            : "bg-amber-500/10 text-amber-800 dark:text-amber-300",
        )}
      >
        <span className="min-w-0 leading-snug">{titulo}</span>
        <span className="shrink-0 tabular-nums">
          Total {total.toLocaleString("es")}
        </span>
      </div>
      <div className="max-h-72 overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-muted/80 text-[10px] uppercase tracking-wide text-muted-foreground backdrop-blur">
            <tr>
              <th className="px-3 py-1.5 text-left font-medium">Categoría</th>
              <th className="px-3 py-1.5 text-right font-medium">Casos</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((fila) => {
              const selected = activo === fila.slug;
              return (
                <tr key={fila.slug} className="border-t border-border/60">
                  <td className="px-2 py-0.5" colSpan={2}>
                    <Button
                      type="button"
                      variant={selected ? "secondary" : "ghost"}
                      className={cn(
                        "h-auto w-full justify-between gap-2 rounded-md px-2 py-1.5 text-left font-normal",
                        selected &&
                          (acento === "red"
                            ? "bg-red-500/15 hover:bg-red-500/20"
                            : "bg-amber-500/15 hover:bg-amber-500/20"),
                      )}
                      onClick={() => onSeleccionar(panel, fila.slug)}
                    >
                      <span className="min-w-0 flex-1 whitespace-normal text-xs leading-snug">
                        {fila.etiqueta}
                      </span>
                      <span className="shrink-0 text-sm font-semibold tabular-nums">
                        {fila.casos.toLocaleString("es")}
                      </span>
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
