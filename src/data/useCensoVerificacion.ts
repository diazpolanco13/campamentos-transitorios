// Hook para /centros/censo/verificacion: agregados Nexus/SIIPOL por campamento
// (solo origen=import_excel) vía RPC censo_verificacion_por_centro.
// Totales de campamentos usan unidades de conteo (complejo Gran Colombia = 1).

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  COMPLEJO_GRAN_COLOMBIA,
  IDS_COMPLEJO_GRAN_COLOMBIA,
  contarUnidadesCon,
  totalUnidadesConteo,
  type CentroConUnidad,
} from "@/domain/complejosCentros";
import {
  obtenerVerificacionPorCentro,
  type VerificacionCensoCentro,
} from "./reposCenso";

export interface TotalesVerificacionCenso {
  campamentos: number;
  campamentosConLista: number;
  campamentosSinLista: number;
  /** En proceso de instalación y sin planilla Excel (no exigibles). */
  campamentosNoInstalados: number;
  censadas: number;
  menores: number;
  adultos: number;
  nexus: number;
  siipol: number;
  ambos: number;
  soloNexus: number;
  soloSiipol: number;
  verificadas: number;
  faltan: number;
  solicitadas: number;
  conRegistro: number;
  campamentosConSolicitadas: number;
  campamentosConRegistro: number;
}

/** Centro aún en instalación MIJ y sin importación Excel. */
export function esNoInstaladoSinExcel(f: VerificacionCensoCentro): boolean {
  return (
    f.estatusInstalacion === "proceso_de_instalacion" && f.censadas === 0
  );
}

type FilaConUnidad = VerificacionCensoCentro & CentroConUnidad;

function conUnidad(f: VerificacionCensoCentro): FilaConUnidad {
  const esGranColombia = (IDS_COMPLEJO_GRAN_COLOMBIA as readonly string[]).includes(
    f.centroId,
  );
  return {
    ...f,
    id: f.centroId,
    complejoId: esGranColombia ? COMPLEJO_GRAN_COLOMBIA : null,
  };
}

function sumarTotales(filas: VerificacionCensoCentro[]): TotalesVerificacionCenso {
  const unidades = filas.map(conUnidad);
  const campamentos = totalUnidadesConteo(unidades);
  const campamentosConLista = contarUnidadesCon(unidades, (u) => u.censadas > 0);

  const totales: TotalesVerificacionCenso = {
    campamentos,
    campamentosConLista,
    campamentosSinLista: campamentos - campamentosConLista,
    campamentosNoInstalados: contarUnidadesCon(unidades, esNoInstaladoSinExcel),
    censadas: 0,
    menores: 0,
    adultos: 0,
    nexus: 0,
    siipol: 0,
    ambos: 0,
    soloNexus: 0,
    soloSiipol: 0,
    verificadas: 0,
    faltan: 0,
    solicitadas: 0,
    conRegistro: 0,
    campamentosConSolicitadas: contarUnidadesCon(
      unidades,
      (u) => u.solicitadas > 0,
    ),
    campamentosConRegistro: contarUnidadesCon(unidades, (u) => u.conRegistro > 0),
  };

  for (const f of filas) {
    totales.censadas += f.censadas;
    totales.menores += f.menores;
    totales.adultos += f.adultos;
    totales.nexus += f.nexus;
    totales.siipol += f.siipol;
    totales.ambos += f.ambos;
    totales.soloNexus += f.soloNexus;
    totales.soloSiipol += f.soloSiipol;
    totales.verificadas += f.verificadas;
    totales.faltan += f.faltan;
    totales.solicitadas += f.solicitadas;
    totales.conRegistro += f.conRegistro;
  }

  return totales;
}

export function useCensoVerificacion(enabled = true) {
  const [filas, setFilas] = useState<VerificacionCensoCentro[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refrescar = useCallback(async () => {
    if (!enabled) {
      setFilas([]);
      setCargando(false);
      setError(null);
      return;
    }
    setCargando(true);
    setError(null);
    try {
      const data = await obtenerVerificacionPorCentro();
      setFilas(data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "No se pudo cargar la verificación",
      );
      setFilas([]);
    } finally {
      setCargando(false);
    }
  }, [enabled]);

  useEffect(() => {
    void refrescar();
  }, [refrescar]);

  const totales = useMemo(() => sumarTotales(filas), [filas]);

  return { filas, totales, cargando, error, refrescar };
}
