import {
  normalizarCasoSalud,
  normalizarEstatusCasoSalud,
  type CasoSaludCentro,
  type EstatusCasoSalud,
} from "../domain/casosSalud";
import { supabase } from "./supabaseClient";
import {
  guardarIncidenciasSaludDia,
  claveDia,
  obtenerCentroPorId,
  usuarioActual,
} from "./reposSupabase";
import { notificarMutacionLive } from "./liveInvalidation";
import { registrarHistorial } from "./historial";

/** Reescribe `ocupaciones_centros.incidencias_salud` = COUNT fichas del día. */
async function sincronizarIncidenciasSaludDesdeCasos(
  centroId: string,
  dia: string,
): Promise<void> {
  const { count, error: errCount } = await supabase
    .from("casos_salud_centros")
    .select("id", { count: "exact", head: true })
    .eq("centro_id", centroId)
    .eq("reportado_dia", dia);
  if (errCount) {
    throw new Error(`[reposCasosSalud] count incidencias: ${errCount.message}`);
  }
  const n = count ?? 0;
  const ts = Date.now();

  const { data: existente, error: errLectura } = await supabase
    .from("ocupaciones_centros")
    .select("id")
    .eq("centro_id", centroId)
    .eq("dia", dia)
    .maybeSingle();
  if (errLectura) {
    throw new Error(`[reposCasosSalud] leer ocupaciones: ${errLectura.message}`);
  }

  if (existente?.id) {
    const { error } = await supabase
      .from("ocupaciones_centros")
      .update({
        incidencias_salud: n,
        updated_at: ts,
        updated_by: usuarioActual(),
      })
      .eq("id", existente.id);
    if (error) {
      throw new Error(`[reposCasosSalud] sync incidencias_salud: ${error.message}`);
    }
    notificarMutacionLive("ocupaciones_centros");
    return;
  }

  if (n > 0) {
    const centro = await obtenerCentroPorId(centroId);
    if (centro) {
      await guardarIncidenciasSaludDia(centro, dia, n);
    }
  }
}

export async function crearCasoSalud(datos: {
  centro_id: string;
  titulo: string;
  descripcion?: string;
  estatus?: EstatusCasoSalud;
  reportado_dia?: string;
}): Promise<string> {
  const ts = Date.now();
  const dia = datos.reportado_dia ?? claveDia(ts);
  const estatus = normalizarEstatusCasoSalud(datos.estatus);
  const fila = {
    centro_id: datos.centro_id,
    titulo: datos.titulo.trim(),
    descripcion: (datos.descripcion ?? "").trim(),
    estatus,
    reportado_dia: dia,
    resuelta_ts: estatus === "resuelto" ? ts : null,
    creada_ts: ts,
    updated_at: ts,
    updated_by: usuarioActual(),
  };
  const { data, error } = await supabase
    .from("casos_salud_centros")
    .insert(fila)
    .select("id")
    .single();
  if (error) throw new Error(`[reposCasosSalud] insert: ${error.message}`);
  const id = (data as { id: string }).id;
  registrarHistorial("crear_caso_salud", "caso_salud", id, {
    centro_id: fila.centro_id,
    titulo: fila.titulo,
  });
  await sincronizarIncidenciasSaludDesdeCasos(fila.centro_id, dia);
  return id;
}

export async function actualizarCasoSalud(
  id: string,
  cambios: Partial<Pick<CasoSaludCentro, "titulo" | "descripcion" | "estatus">>,
): Promise<void> {
  const now = Date.now();
  const fila: Record<string, unknown> = {
    updated_at: now,
    updated_by: usuarioActual(),
  };
  if (cambios.titulo !== undefined) fila.titulo = cambios.titulo.trim();
  if (cambios.descripcion !== undefined) fila.descripcion = cambios.descripcion.trim();
  if (cambios.estatus !== undefined) {
    const estatus = normalizarEstatusCasoSalud(cambios.estatus);
    fila.estatus = estatus;
    fila.resuelta_ts = estatus === "resuelto" || estatus === "archivado" ? now : null;
  }
  const { error } = await supabase.from("casos_salud_centros").update(fila).eq("id", id);
  if (error) throw new Error(`[reposCasosSalud] update: ${error.message}`);
  registrarHistorial("actualizar_caso_salud", "caso_salud", id, cambios);
}

export async function archivarCasoSalud(id: string): Promise<void> {
  const now = Date.now();
  const { error } = await supabase
    .from("casos_salud_centros")
    .update({
      estatus: "archivado",
      archivada_ts: now,
      updated_at: now,
      updated_by: usuarioActual(),
    })
    .eq("id", id);
  if (error) throw new Error(`[reposCasosSalud] archivar: ${error.message}`);
  registrarHistorial("archivar_caso_salud", "caso_salud", id);
}

/** Devuelve un caso archivado a `resuelto` (listo para reabrir o re-archivar). */
export async function desarchivarCasoSalud(id: string): Promise<void> {
  const now = Date.now();
  const { error } = await supabase
    .from("casos_salud_centros")
    .update({
      estatus: "resuelto",
      archivada_ts: null,
      resuelta_ts: now,
      updated_at: now,
      updated_by: usuarioActual(),
    })
    .eq("id", id)
    .eq("estatus", "archivado");
  if (error) throw new Error(`[reposCasosSalud] desarchivar: ${error.message}`);
  registrarHistorial("desarchivar_caso_salud", "caso_salud", id);
}

export async function eliminarCasoSalud(id: string): Promise<void> {
  const { data: previo, error: errPrev } = await supabase
    .from("casos_salud_centros")
    .select("centro_id, reportado_dia")
    .eq("id", id)
    .maybeSingle();
  if (errPrev) throw new Error(`[reposCasosSalud] leer antes delete: ${errPrev.message}`);

  const { error } = await supabase.from("casos_salud_centros").delete().eq("id", id);
  if (error) throw new Error(`[reposCasosSalud] delete: ${error.message}`);
  registrarHistorial("eliminar_caso_salud", "caso_salud", id);

  if (previo?.centro_id && previo.reportado_dia) {
    await sincronizarIncidenciasSaludDesdeCasos(previo.centro_id, previo.reportado_dia);
  }
}

export { normalizarCasoSalud, sincronizarIncidenciasSaludDesdeCasos };
