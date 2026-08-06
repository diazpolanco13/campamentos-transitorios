// Hook para la vista interna /centros/censo: carga el resumen agregado
// de toda la red vía RPC censo_resumen_red() con refresh manual.

import { useCallback, useEffect, useState } from "react";
import {
  kpisImportacionesVacios,
  obtenerKpisImportacionesExcel,
  obtenerResumenCensoRed,
  obtenerResumenSiipol,
  type KpisImportacionesExcel,
  type ResumenSiipol,
} from "./reposCenso";
import type { ResumenCensoCentro } from "@/domain/censoResumen";

export function useCensoRedResumen() {
  const [resumenes, setResumenes] = useState<ResumenCensoCentro[]>([]);
  const [siipol, setSiipol] = useState<ResumenSiipol>({
    totalImportados: 0,
    verificados: 0,
    pendientes: 0,
  });
  const [kpisImportaciones, setKpisImportaciones] =
    useState<KpisImportacionesExcel>(() => kpisImportacionesVacios());
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refrescar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const [data, resumenSiipol, kpis] = await Promise.all([
        obtenerResumenCensoRed(),
        obtenerResumenSiipol(),
        obtenerKpisImportacionesExcel(),
      ]);
      setResumenes(data);
      setSiipol(resumenSiipol);
      setKpisImportaciones(kpis);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar el registro");
      setResumenes([]);
      setSiipol({ totalImportados: 0, verificados: 0, pendientes: 0 });
      setKpisImportaciones(kpisImportacionesVacios());
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    void refrescar();
  }, [refrescar]);

  return { resumenes, siipol, kpisImportaciones, cargando, error, refrescar };
}
