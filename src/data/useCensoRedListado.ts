import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { OrdenRegistrosCenso } from "@/features/censo/censoRegistrosUtil";
import {
  contarListadoCensoRed,
  FILAS_POR_PAGINA_CENSO_RED,
  obtenerListadoCensoRedPaginado,
  type FiltrosListadoCensoRed,
  type RegistroCensoRed,
} from "./reposCenso";

export interface FiltrosCensoRedListado {
  busqueda: string;
  centroId: string;
  sexo: string;
  orden: OrdenRegistrosCenso;
  solicitado: string;
  registroPolicial: string;
  verificadoSiipol?: string;
  categoriaDelito?: string | null;
}

export function useCensoRedListado(
  filtros: FiltrosCensoRedListado,
  opciones: { enabled?: boolean } = {},
) {
  const enabled = opciones.enabled !== false;
  const [registros, setRegistros] = useState<RegistroCensoRed[]>([]);
  const [total, setTotal] = useState(0);
  const [pagina, setPagina] = useState(0);
  const [cargando, setCargando] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const busquedaDebounced = useDebouncedValue(filtros.busqueda, 350);
  const filtrosApi = useMemo<FiltrosListadoCensoRed>(
    () => ({
      busqueda: busquedaDebounced,
      centroId: filtros.centroId,
      sexo: filtros.sexo,
      orden: filtros.orden,
      solicitado: filtros.solicitado,
      registroPolicial: filtros.registroPolicial,
      verificadoSiipol: filtros.verificadoSiipol,
      categoriaDelito: filtros.categoriaDelito ?? null,
    }),
    [
      busquedaDebounced,
      filtros.centroId,
      filtros.sexo,
      filtros.orden,
      filtros.solicitado,
      filtros.registroPolicial,
      filtros.verificadoSiipol,
      filtros.categoriaDelito,
    ],
  );
  const filtrosKey = useMemo(() => JSON.stringify(filtrosApi), [filtrosApi]);
  const paginaRef = useRef(pagina);

  useEffect(() => {
    paginaRef.current = pagina;
  }, [pagina]);

  useEffect(() => {
    setPagina(0);
  }, [filtrosKey]);

  const refrescar = useCallback(async () => {
    if (!enabled) {
      setCargando(false);
      return;
    }
    setCargando(true);
    setError(null);
    const paginaActual = paginaRef.current;
    try {
      const [data, totalFiltrado] = await Promise.all([
        obtenerListadoCensoRedPaginado(filtrosApi, paginaActual),
        contarListadoCensoRed(filtrosApi),
      ]);
      setRegistros(data);
      setTotal(totalFiltrado);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar el listado");
      setRegistros([]);
      setTotal(0);
    } finally {
      setCargando(false);
    }
  }, [enabled, filtrosApi]);

  useEffect(() => {
    void refrescar();
  }, [refrescar, pagina, filtrosKey]);

  const totalPaginas = Math.max(1, Math.ceil(total / FILAS_POR_PAGINA_CENSO_RED));

  useEffect(() => {
    if (pagina > 0 && pagina >= totalPaginas) {
      setPagina(Math.max(0, totalPaginas - 1));
    }
  }, [pagina, totalPaginas]);

  return {
    registros,
    total,
    pagina,
    setPagina,
    totalPaginas,
    filasPorPagina: FILAS_POR_PAGINA_CENSO_RED,
    cargando,
    error,
    refrescar,
    filtrosApi,
  };
}

function useDebouncedValue<T>(valor: T, retardoMs: number): T {
  const [debounced, setDebounced] = useState(valor);

  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(valor), retardoMs);
    return () => window.clearTimeout(id);
  }, [valor, retardoMs]);

  return debounced;
}
