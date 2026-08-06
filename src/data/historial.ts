// Bitácora de acciones (tabla `historial`). Dos piezas:
//
//  · `registrarHistorial()` — inserta una entrada tras cada acción crítica
//    (crear/editar/eliminar centro, abrir/resolver incidencia, reporte
//    diario). Fire-and-forget: NUNCA rompe la acción principal si falla. Las
//    acciones sobre usuarios se registran desde las Edge Functions con
//    service_role (el frontend no las duplica).
//  · `useHistorial()` — lectura con Realtime para la vista /logs. La RLS solo
//    deja LEER a admin y analista_sae; los demás insertan sin leer.

import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import { getUsuario } from "./authSupabase";

/** Acciones registradas por el frontend (las Edge Functions añaden las de usuarios). */
export type AccionHistorial =
  | "crear_centro"
  | "editar_centro"
  | "eliminar_centro"
  | "abrir_incidencia"
  | "editar_incidencia"
  | "resolver_incidencia"
  | "eliminar_incidencia"
  | "reporte_diario"
  | "reporte_control"
  | "desmarcar_reporte_control"
  | "crear_trabajo"
  | "actualizar_trabajo"
  | "archivar_trabajo"
  | "eliminar_trabajo"
  | "aprobar_identificacion"
  | "rechazar_identificacion"
  | "desuscribir_campamento"
  | "toggle_alertas_campamento"
  | "desvincular_telegram"
  | "generar_vinculo_telegram"
  | "crear_requerimiento"
  | "actualizar_requerimiento"
  | "archivar_requerimiento"
  | "crear_caso_salud"
  | "actualizar_caso_salud"
  | "archivar_caso_salud"
  | "desarchivar_caso_salud"
  | "registrar_refugiado"
  | "editar_refugiado"
  | "egreso_refugiado"
  | "trasladar_familia"
  | "traslado_nominal"
  | "otorgar_beneficio"
  | "otorgar_item_kit"
  | "eliminar_beneficio"
  | "editar_tallas"
  | "editar_contacto"
  | "editar_salud"
  | "editar_habilidades"
  | "editar_documentacion"
  | "editar_seguimiento"
  | "editar_familiares_referencia"
  | "editar_residencia"
  | "crear_usuario"
  | "renombrar_usuario"
  | "eliminar_usuario"
  | "cambiar_password"
  | "editar_perfil_propio"
  | (string & {});

/** Fila de la tabla `historial`. */
export interface EntradaHistorial {
  id: string;
  ts: number;
  usuario: string | null;
  accion: AccionHistorial;
  entidad: string | null;
  entidad_id: string | null;
  detalle: Record<string, unknown> | null;
}

/**
 * Inserta una entrada en la bitácora. Nunca lanza: si falla (p. ej. RLS para
 * un rol sin permiso de insert, o sin conexión) solo lo avisa por consola,
 * porque la bitácora no debe tumbar la acción que la origina.
 */
export function registrarHistorial(
  accion: AccionHistorial,
  entidad: string,
  entidadId: string,
  detalle?: Record<string, unknown>,
): void {
  void (async () => {
    try {
      const { error } = await supabase.from("historial").insert({
        ts: Date.now(),
        usuario: getUsuario()?.username ?? "local",
        accion,
        entidad,
        entidad_id: entidadId,
        detalle: detalle ?? null,
      });
      if (error) console.warn("[historial] insert:", error.message);
    } catch (err) {
      console.warn("[historial] insert:", err);
    }
  })();
}

/**
 * Entradas de la bitácora (más recientes primero) con Realtime. Pensado para
 * la vista /logs (solo admin y analista_sae pueden leer; para el resto la RLS
 * devuelve vacío). Filtros server-side por rango de fechas; los filtros por
 * entidad/usuario se aplican en el cliente (el volumen es moderado).
 */
export function useHistorial({
  desdeTs,
  entidadId,
  limite = 500,
}: { desdeTs?: number; entidadId?: string; limite?: number } = {}) {
  const [entradas, setEntradas] = useState<EntradaHistorial[]>([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let cancelado = false;

    (async () => {
      let q = supabase
        .from("historial")
        .select("*")
        .order("ts", { ascending: false })
        .limit(limite);
      if (desdeTs) q = q.gte("ts", desdeTs);
      if (entidadId) q = q.eq("entidad_id", entidadId);
      const { data, error } = await q;
      if (cancelado) return;
      if (error) {
        console.warn("[useHistorial] select:", error.message);
        setEntradas([]);
      } else {
        setEntradas((data ?? []) as EntradaHistorial[]);
      }
      setCargando(false);
    })();

    const canal = supabase
      .channel(`historial-logs-${desdeTs ?? "all"}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "historial" },
        (payload) => {
          const fila = payload.new as EntradaHistorial;
          if (desdeTs && fila.ts < desdeTs) return;
          setEntradas((prev) =>
            prev.some((e) => e.id === fila.id) ? prev : [fila, ...prev],
          );
        },
      )
      .subscribe();

    return () => {
      cancelado = true;
      void supabase.removeChannel(canal);
    };
  }, [desdeTs, entidadId, limite]);

  return { entradas, cargando };
}
