import { useState } from "react";
import { Download, FileSpreadsheet, FileText, Loader2 } from "lucide-react";
import type { RegistroCensoRed } from "@/data/reposCenso";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { exportarCensoRedExcel, exportarCensoRedPdf } from "./exportarCensoRed";

export function BotonExportarCensoRed({
  obtenerFilas,
  totalEsperado,
  deshabilitado,
}: {
  obtenerFilas: (onProgreso?: (cargados: number, total: number) => void) => Promise<RegistroCensoRed[]>;
  totalEsperado?: number;
  deshabilitado?: boolean;
}) {
  const [exportando, setExportando] = useState<"pdf" | "excel" | null>(null);
  const [progreso, setProgreso] = useState<{ cargados: number; total: number } | null>(null);

  async function exportar(tipo: "pdf" | "excel") {
    setExportando(tipo);
    setProgreso(null);
    try {
      const filas = await obtenerFilas((cargados, total) => {
        setProgreso({ cargados, total });
      });
      if (filas.length === 0) {
        alert("No hay registros para exportar con los filtros actuales.");
        return;
      }
      if (tipo === "pdf") await exportarCensoRedPdf(filas);
      else await exportarCensoRedExcel(filas);
    } catch (err) {
      alert(err instanceof Error ? err.message : "No se pudo exportar los datos");
    } finally {
      setExportando(null);
      setProgreso(null);
    }
  }

  const ocupado = exportando != null;
  const etiquetaProgreso =
    progreso != null
      ? `${progreso.cargados.toLocaleString("es")}/${progreso.total.toLocaleString("es")}`
      : totalEsperado != null
        ? totalEsperado.toLocaleString("es")
        : null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="outline" className="gap-1.5" disabled={deshabilitado || ocupado}>
          {ocupado ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Download className="size-4" />
          )}
          {ocupado
            ? progreso
              ? `Descargando ${etiquetaProgreso}…`
              : "Preparando…"
            : "Exportar datos"}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>
          {totalEsperado != null
            ? `Exportar ${totalEsperado.toLocaleString("es")} persona${totalEsperado === 1 ? "" : "s"}`
            : "Formato de exportación"}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={ocupado} onSelect={() => void exportar("pdf")}>
          <FileText className="size-4" />
          PDF (filtros actuales)
          {exportando === "pdf" && <Loader2 className="ml-auto size-3.5 animate-spin" />}
        </DropdownMenuItem>
        <DropdownMenuItem disabled={ocupado} onSelect={() => void exportar("excel")}>
          <FileSpreadsheet className="size-4" />
          Excel (filtros + delitos)
          {exportando === "excel" && <Loader2 className="ml-auto size-3.5 animate-spin" />}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
