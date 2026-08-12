// Operadores con identidad (op-<cédula>) por campamento para el Brain.
// Excluye cuentas link/QR `operador-centro-*` (1ª fase). RLS:
// `perfiles_select_operadores_terreno`.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSupabaseQuery, type QueryBuilder } from "./useSupabaseQuery";
import { useReportesCentros } from "./useReportesCentros";
import { supabase } from "./supabaseClient";
import { esCuentaLinkTerreno } from "@/domain/permisos";
import type { OperadorBrain } from "@/domain/sebinBrainGraph";

export type { OperadorBrain };

interface PerfilOperadorRow extends Record<string, unknown> {
  user_id: string;
  username: string | null;
  nombre: string | null;
  cedula_norm: string | null;
  centros_asignados: string[] | null;
  rol: string;
}

export type PerfilOperadorBrain = {
  id: string;
  userId: string;
  username: string;
  nombre: string;
  cedulaNorm: string;
  centros_asignados: string[];
};

function filtrarOperadores<T>(q: QueryBuilder<T>): QueryBuilder<T> {
  return q.eq("rol", "operador");
}

function transformarOperador(r: PerfilOperadorRow): PerfilOperadorBrain {
  const username = (r.username ?? "").trim();
  const cedulaNorm = (r.cedula_norm ?? "").trim();
  return {
    id: r.user_id,
    userId: r.user_id,
    username,
    nombre: (r.nombre ?? "").trim() || username,
    cedulaNorm,
    centros_asignados: Array.isArray(r.centros_asignados)
      ? r.centros_asignados.filter((id) => typeof id === "string" && id.length > 0)
      : [],
  };
}

/** Identidad actual: cédula + no es cuenta QR/link. */
function esOperadorIdentidad(row: PerfilOperadorBrain): boolean {
  if (!row.userId || !row.cedulaNorm) return false;
  if (esCuentaLinkTerreno(row.username)) return false;
  return true;
}

function autorCoincide(
  op: PerfilOperadorBrain,
  by: string | null | undefined,
  cedulaAutor: string | undefined,
): boolean {
  const a = (by ?? "").trim();
  if (a && (a === op.username || a === op.userId || a === op.nombre)) return true;
  if (cedulaAutor && cedulaAutor === op.cedulaNorm) return true;
  return false;
}

/**
 * Mapa centroId → operadores con identidad. `reportoHoy` cruza `updated_by`
 * (username o misma cédula: p. ej. supervisor `samir` ≡ `op-20309543`).
 */
export function useOperadoresBrain(dia: string): Map<string, OperadorBrain[]> {
  const filter = useCallback(filtrarOperadores, []);
  const transform = useCallback(transformarOperador, []);
  const clientFilter = useCallback(esOperadorIdentidad, []);
  const perfiles = useSupabaseQuery<PerfilOperadorBrain, PerfilOperadorRow>(
    "perfiles",
    {
      select: "user_id, username, nombre, cedula_norm, centros_asignados, rol",
      filter,
      order: { column: "nombre", ascending: true },
      transform,
      clientFilter,
    },
  );
  const reportesHoy = useReportesCentros({ dia });

  const autoresPorCentro = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of reportesHoy) {
      const by = r.updated_by?.trim();
      if (by) m.set(r.centro_id, by);
    }
    return m;
  }, [reportesHoy]);

  const autoresKey = useMemo(() => {
    const s = new Set<string>();
    for (const by of autoresPorCentro.values()) s.add(by);
    return [...s].sort().join("|");
  }, [autoresPorCentro]);

  const [cedulaPorUsername, setCedulaPorUsername] = useState<Map<string, string>>(
    () => new Map(),
  );

  useEffect(() => {
    const names = autoresKey ? autoresKey.split("|").filter(Boolean) : [];
    if (names.length === 0) {
      setCedulaPorUsername(new Map());
      return;
    }
    let cancelado = false;
    void supabase
      .from("perfiles")
      .select("username, cedula_norm")
      .in("username", names)
      .then(({ data, error }) => {
        if (cancelado) return;
        if (error) {
          console.warn("[useOperadoresBrain] autores:", error.message);
          return;
        }
        const m = new Map<string, string>();
        for (const row of data ?? []) {
          const u = (row.username ?? "").trim();
          const c = (row.cedula_norm ?? "").trim();
          if (u && c) m.set(u, c);
        }
        setCedulaPorUsername(m);
      });
    return () => {
      cancelado = true;
    };
  }, [autoresKey]);

  return useMemo(() => {
    const porCentro = new Map<string, OperadorBrain[]>();
    for (const p of perfiles) {
      for (const centroId of p.centros_asignados) {
        const list = porCentro.get(centroId) ?? [];
        if (list.some((o) => o.userId === p.userId)) continue;
        const by = autoresPorCentro.get(centroId);
        list.push({
          userId: p.userId,
          username: p.username,
          label: p.nombre,
          centroId,
          reportoHoy: autorCoincide(p, by, cedulaPorUsername.get(by ?? "")),
        });
        porCentro.set(centroId, list);
      }
    }
    return porCentro;
  }, [perfiles, autoresPorCentro, cedulaPorUsername]);
}
