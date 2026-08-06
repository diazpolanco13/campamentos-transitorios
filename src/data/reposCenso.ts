// Censo rápido en terreno (sin login): RPCs censo_registrar /
// censo_actualizar / censo_eliminar / censo_listado / censo_completar /
// censo_cierre. La escritura pasa por funciones security definer en Supabase;
// el rol anon no tiene acceso directo a las tablas y, desde la migración
// tokens_terreno_censo, sin sesión cada RPC exige el token de terreno del
// campamento (?t= del QR). Con sesión autenticada el token es irrelevante.

import type { PostgrestSingleResponse } from "@supabase/supabase-js";
import type { ResumenCensoCentro } from "@/domain/censoResumen";
import { tokenTerrenoActual } from "@/lib/tokenTerreno";
import { supabase } from "./supabaseClient";

/** Token de terreno a adjuntar en las RPC (null si el dispositivo no tiene). */
function tokenActual(): string | null {
  return tokenTerrenoActual() || null;
}

/** PostgREST/Supabase devuelve como máximo 1000 filas por petición RPC. */
const LIMITE_FILAS_RPC = 1000;

/** Tamaño de bloque al descargar todos los registros (p. ej. exportación). */
export const LIMITE_BLOQUE_EXPORTACION_CENSO_RED = LIMITE_FILAS_RPC;

async function rpcSetofPaginado<T>(
  consultar: (desde: number, hasta: number) => PromiseLike<PostgrestSingleResponse<T[]>>,
): Promise<T[]> {
  const acumulado: T[] = [];
  let desde = 0;

  for (;;) {
    const hasta = desde + LIMITE_FILAS_RPC - 1;
    const { data, error } = await consultar(desde, hasta);
    if (error) throw new Error(error.message);

    const pagina = data ?? [];
    acumulado.push(...pagina);
    if (pagina.length < LIMITE_FILAS_RPC) break;
    desde += LIMITE_FILAS_RPC;
  }

  return acumulado;
}

export interface AnalistaContactoTerreno {
  nombre: string;
  telegram: string | null;
  whatsapp: string | null;
}

export interface CentroCenso {
  id: string;
  nombre: string;
  /** Cuerpo/institución responsable del campamento (no del operador). */
  cuerpo?: string;
  /** Unidad SEBIN de revista diaria del campamento. */
  unidad?: string;
  /** True si el campamento ya tiene coordenada en BD. */
  geolocalizado?: boolean;
  /** True si hay responsables o ámbitos «sin autoridades» en el directorio. */
  autoridades_ok?: boolean;
  /** True si hay aforo oficial, recurso Esfera o agua medida. */
  capacidad_ok?: boolean;
  /** Epoch ms de última actualización por tarea (portal /terreno). */
  geolocalizacion_ts?: number | null;
  autoridades_ts?: number | null;
  capacidad_ts?: number | null;
  /** Analistas SAE del campamento (nombre + Telegram) vía `terreno_centro`. */
  analistas_contacto?: AnalistaContactoTerreno[];
  /** Meta del parte numérico (último snapshot de ocupación). */
  parte_personas?: number;
  parte_familias?: number;
  /** Censo nominal activo en el campamento. */
  censados_personas?: number;
  censados_familias?: number;
  /** Epoch ms de la última edición del reporte de hoy (portal /terreno). */
  reporte_ts?: number | null;
  /** Epoch ms del último alta/actualización en censo nominal. */
  censo_ts?: number | null;
}

/** Funcionario que dirige el levantamiento en la escuela. */
export interface FuncionarioCenso {
  jerarquia: string;
  nombre: string;
  institucion: string;
  telefono: string;
}

/** Geolocalización opcional del censador (validador de presencia en el refugio). */
export interface UbicacionCensador {
  en_refugio: boolean;
  lat: number | null;
  lng: number | null;
  /** Precisión del GPS en metros. */
  precision: number | null;
}

export function ubicacionCensadorVacia(): UbicacionCensador {
  return { en_refugio: true, lat: null, lng: null, precision: null };
}

/** Condición de la vivienda perdida (planilla física). */
export type CondicionVivienda = "" | "destruida" | "inhabitable" | "no_posee";

export const CONDICIONES_VIVIENDA: { valor: CondicionVivienda; label: string }[] = [
  { valor: "destruida", label: "Destruida" },
  { valor: "inhabitable", label: "Inhabitable" },
  { valor: "no_posee", label: "No posee" },
];

/** Parentesco de un menor con el jefe de su familia. */
export const PARENTESCOS_MENOR = [
  "Hijo/a",
  "Nieto/a",
  "Hermano/a",
  "Sobrino/a",
  "Otro familiar",
] as const;

/** Datos de la persona damnificada capturados en terreno (planilla física). */
export interface RegistroCenso {
  primer_nombre: string;
  segundo_nombre: string;
  primer_apellido: string;
  segundo_apellido: string;
  edad: number | null;
  tipo_doc: "V" | "E" | "P" | "";
  documento: string;
  sexo: "M" | "F" | "";
  telefono: string;
  embarazada: boolean;
  embarazo_semanas: number | null;
  discapacidad: boolean;
  discapacidad_detalle: string;
  enfermedad: boolean;
  enfermedad_detalle: string;
  /** Menores de edad: cédula del jefe de familia y parentesco. */
  jefe_tipo_doc: "V" | "E" | "P" | "";
  jefe_documento: string;
  parentesco_jefe: string;
  pais: string;
  estado_federativo: string;
  municipio: string;
  parroquia: string;
  condicion_vivienda: CondicionVivienda;
  calle: string;
  casa_edificio: string;
}

/** Fila devuelta por censo_listado / listado red (registros staging / import). */
export interface RegistroCensoGuardado {
  id: string;
  creado_en: string;
  primer_nombre: string;
  segundo_nombre: string;
  primer_apellido: string;
  segundo_apellido: string;
  edad: number | null;
  tipo_doc: string | null;
  documento: string;
  sexo: string | null;
  telefono: string;
  embarazada: boolean;
  embarazo_semanas: number | null;
  discapacidad: boolean;
  discapacidad_detalle: string;
  enfermedad: boolean;
  enfermedad_detalle: string;
  jefe_tipo_doc: string | null;
  jefe_documento: string;
  parentesco_jefe: string;
  jefe_registro_id: string | null;
  pais: string;
  condicion_vivienda: string;
  estado_federativo: string;
  municipio: string;
  parroquia: string;
  calle: string;
  casa_edificio: string;
  /** terreno | import_excel (listado red). */
  origen?: string;
  fuente_archivo?: string;
  importado_en?: string | null;
  nombre_centro_raw?: string;
  centro_match?: string;
  registro_policial?: boolean;
  solicitado?: boolean;
  firmo_contra_presidente?: boolean;
  deportado?: boolean;
  tipo_registro_policial?: string;
  observaciones_seguridad?: string;
  verificacion_seguridad_en?: string | null;
  verificado_siipol?: boolean;
  verificado_siipol_en?: string | null;
  verificado_siipol_fuente?: string;
  verificado_nexus?: boolean;
  verificado_nexus_en?: string | null;
  verificado_nexus_fuente?: string;
  /** Cédula con formato no consultable en Nexus (largo fuera de 6–8). */
  documento_invalido?: boolean;
}

/** Fila devuelta por censo_listado_red (registro + campamento). */
export interface RegistroCensoRed extends RegistroCensoGuardado {
  centro_id: string;
  centro_nombre: string;
}

/** Último cierre declarado del censo de un refugio. */
export interface CierreCenso {
  creado_en: string;
  funcionario_nombre: string;
  funcionario_institucion: string;
  total_registrados: number;
}

/** Payload JSON que esperan censo_registrar y censo_actualizar. */
function payloadRegistro(registro: RegistroCenso) {
  return {
    primer_nombre: registro.primer_nombre.trim(),
    segundo_nombre: registro.segundo_nombre.trim(),
    primer_apellido: registro.primer_apellido.trim(),
    segundo_apellido: registro.segundo_apellido.trim(),
    edad: registro.edad != null ? String(registro.edad) : "",
    tipo_doc: registro.tipo_doc,
    documento: registro.documento.trim(),
    sexo: registro.sexo,
    telefono: registro.telefono.trim(),
    embarazada: registro.embarazada,
    embarazo_semanas:
      registro.embarazada && registro.embarazo_semanas != null
        ? String(registro.embarazo_semanas)
        : "",
    discapacidad: registro.discapacidad,
    discapacidad_detalle: registro.discapacidad ? registro.discapacidad_detalle.trim() : "",
    enfermedad: registro.enfermedad,
    enfermedad_detalle: registro.enfermedad ? registro.enfermedad_detalle.trim() : "",
    jefe_tipo_doc: registro.jefe_tipo_doc,
    jefe_documento: registro.jefe_documento.trim(),
    parentesco_jefe: registro.parentesco_jefe,
    pais: registro.pais,
    estado_federativo: registro.estado_federativo,
    municipio: registro.municipio,
    parroquia: registro.parroquia,
    condicion_vivienda: registro.condicion_vivienda,
    calle: registro.calle.trim(),
    casa_edificio: registro.casa_edificio.trim(),
  };
}

/** Convierte una fila guardada al formulario de edición. */
export function registroDesdeGuardado(fila: RegistroCensoGuardado): RegistroCenso {
  const tipoDoc = fila.tipo_doc === "V" || fila.tipo_doc === "E" || fila.tipo_doc === "P"
    ? fila.tipo_doc
    : "V";
  const jefeTipoDoc =
    fila.jefe_tipo_doc === "V" || fila.jefe_tipo_doc === "E" || fila.jefe_tipo_doc === "P"
      ? fila.jefe_tipo_doc
      : "V";
  const sexo = fila.sexo === "M" || fila.sexo === "F" ? fila.sexo : "";
  const condicion =
    fila.condicion_vivienda === "destruida" ||
    fila.condicion_vivienda === "inhabitable" ||
    fila.condicion_vivienda === "no_posee"
      ? fila.condicion_vivienda
      : "";

  return {
    primer_nombre: fila.primer_nombre,
    segundo_nombre: fila.segundo_nombre,
    primer_apellido: fila.primer_apellido,
    segundo_apellido: fila.segundo_apellido,
    edad: fila.edad,
    tipo_doc: tipoDoc,
    documento: fila.documento,
    sexo,
    telefono: fila.telefono,
    embarazada: fila.embarazada,
    embarazo_semanas: fila.embarazo_semanas,
    discapacidad: fila.discapacidad,
    discapacidad_detalle: fila.discapacidad_detalle,
    enfermedad: fila.enfermedad,
    enfermedad_detalle: fila.enfermedad_detalle,
    jefe_tipo_doc: jefeTipoDoc,
    jefe_documento: fila.jefe_documento,
    parentesco_jefe: fila.parentesco_jefe,
    pais: fila.pais || "Venezuela",
    estado_federativo: fila.estado_federativo,
    municipio: fila.municipio,
    parroquia: fila.parroquia,
    condicion_vivienda: condicion,
    calle: fila.calle,
    casa_edificio: fila.casa_edificio,
  };
}

/** Fila de contexto del censo manual viejo para una cédula, mostrada como
 * referencia de solo lectura en el flujo "Por cédula" — no se usa para
 * autocompletar el alta nominal, el censador confirma con lo que ve/verifica. */
export interface RegistroCensoViejoResumen {
  creadoEn: string;
  funcionarioNombre: string;
  centroId: string;
  direccion: string;
  telefono: string;
  jefeDocumento: string;
  jefeTipoDoc: string | null;
  parentescoJefe: string;
}

/** Busca en `censo_registros` (importaciones Excel / staging) por cédula
 * normalizada — la más reciente si hubiera más de una. Va por el RPC
 * `censo_registro_por_documento` (SECURITY DEFINER): la RLS de la tabla ya no
 * deja leerla directo a las sesiones de terreno, y el RPC solo devuelve los
 * campos de contacto/dirección (nunca los campos de seguridad del censo). */
export async function buscarCensoRegistroPorDocumento(
  documentoNorm: string,
): Promise<RegistroCensoViejoResumen | null> {
  if (!documentoNorm) return null;
  const { data, error } = await supabase
    .rpc("censo_registro_por_documento", { p_documento_norm: documentoNorm })
    .maybeSingle<{
      creado_en: string;
      funcionario_nombre: string | null;
      centro_id: string;
      calle: string | null;
      casa_edificio: string | null;
      parroquia: string | null;
      municipio: string | null;
      estado_federativo: string | null;
      telefono: string | null;
      jefe_tipo_doc: string | null;
      jefe_documento: string | null;
      parentesco_jefe: string | null;
    }>();
  if (error || !data) return null;

  const direccion = [data.calle, data.casa_edificio, data.parroquia, data.municipio, data.estado_federativo]
    .map((v) => (v ?? "").trim())
    .filter(Boolean)
    .join(", ");

  return {
    creadoEn: data.creado_en,
    funcionarioNombre: data.funcionario_nombre || "",
    centroId: data.centro_id,
    direccion,
    telefono: data.telefono || "",
    jefeDocumento: data.jefe_documento || "",
    jefeTipoDoc: data.jefe_tipo_doc,
    parentescoJefe: data.parentesco_jefe || "",
  };
}

/** Lista de refugios activos (id + nombre). Requiere sesión autenticada. */
export async function listarCentrosCenso(): Promise<CentroCenso[]> {
  const { data, error } = await supabase.rpc("censo_centros");
  if (error) throw new Error(error.message);
  return (data ?? []) as CentroCenso[];
}

/** Campamento asociado a un token de terreno (null si es inválido o fue revocado). */
export async function obtenerCentroTerreno(token: string): Promise<CentroCenso | null> {
  const { data, error } = await supabase.rpc("terreno_centro", { p_token: token });
  if (error) throw new Error(error.message);
  const filas = (data ?? []) as CentroCenso[];
  return filas[0] ?? null;
}

/** Registra una persona en el censo rápido. Devuelve el id del registro. */
export async function registrarCenso(
  centroId: string,
  funcionario: FuncionarioCenso,
  registro: RegistroCenso,
  ubicacion?: UbicacionCensador,
): Promise<string> {
  const { data, error } = await supabase.rpc("censo_registrar", {
    p_centro_id: centroId,
    p_funcionario: {
      jerarquia: funcionario.jerarquia.trim(),
      nombre: funcionario.nombre.trim(),
      institucion: funcionario.institucion.trim(),
      telefono: funcionario.telefono.trim(),
      en_refugio: ubicacion?.en_refugio ?? false,
      lat: ubicacion?.lat ?? null,
      lng: ubicacion?.lng ?? null,
      precision: ubicacion?.precision ?? null,
    },
    p_registro: payloadRegistro(registro),
    p_token: tokenActual(),
  });
  if (error) throw new Error(error.message);
  return data as string;
}

/** Corrige un registro existente del censo. */
export async function actualizarCenso(id: string, registro: RegistroCenso): Promise<void> {
  const { error } = await supabase.rpc("censo_actualizar", {
    p_id: id,
    p_registro: payloadRegistro(registro),
    p_token: tokenActual(),
  });
  if (error) throw new Error(error.message);
}

/** Elimina un registro del censo (irreversible). */
export async function eliminarCenso(id: string): Promise<void> {
  const { error } = await supabase.rpc("censo_eliminar", { p_id: id, p_token: tokenActual() });
  if (error) throw new Error(error.message);
}

/** Registros del censo de un refugio (vista de estadística del operador). */
export async function listarRegistrosCenso(centroId: string): Promise<RegistroCensoGuardado[]> {
  return rpcSetofPaginado<RegistroCensoGuardado>((desde, hasta) =>
    supabase
      .rpc("censo_listado", { p_centro_id: centroId, p_token: tokenActual() })
      .range(desde, hasta),
  );
}

/** Ids de `censo_registros` ya marcados `procesado = true` en un centro (para
 * pintar el badge "verificado" en la lista "Registrados"). Va por el RPC
 * `censo_ids_procesados` (SECURITY DEFINER, autoriza por rol + mis_centros);
 * la RLS de la tabla ya no permite la lectura directa a terreno. */
export async function listarIdsCensoProcesados(centroId: string): Promise<Set<string>> {
  const { data, error } = await supabase.rpc("censo_ids_procesados", {
    p_centro_id: centroId,
  });
  if (error || !data) return new Set();
  return new Set(data as string[]);
}

export interface ResultadoImportacionExcel {
  insertados: number;
  actualizados: number;
  omitidos: number;
  fuente_archivo: string;
  errores: { fila?: number; error?: string; documento?: string; centro_id?: string }[];
}

/** Importa lote de relaciones externas (Excel/MCP) con upsert por cédula.
 *  Requiere rol admin o analista_sae (RPC SECURITY DEFINER). */
export async function importarLoteCensoExcel(
  filas: Record<string, unknown>[],
  meta: { fuente_archivo: string },
): Promise<ResultadoImportacionExcel> {
  const { data, error } = await supabase.rpc("censo_importar_lote", {
    p_filas: filas,
    p_meta: meta,
  });
  if (error) throw new Error(error.message);
  const r = (data ?? {}) as ResultadoImportacionExcel;
  return {
    insertados: Number(r.insertados ?? 0),
    actualizados: Number(r.actualizados ?? 0),
    omitidos: Number(r.omitidos ?? 0),
    fuente_archivo: String(r.fuente_archivo ?? meta.fuente_archivo),
    errores: Array.isArray(r.errores) ? r.errores : [],
  };
}

/** Marca fila de importación Excel como verificada en censo nominal
 * (alta exitosa vía "Por cédula"). Fire-and-forget: nunca debe
 * interrumpir el flujo de alta si falla. */
export function marcarCensoProcesado(documentoNorm: string, centroId: string): void {
  if (!documentoNorm || !centroId) return;
  void supabase
    .rpc("censo_marcar_procesado", { p_documento_norm: documentoNorm, p_centro_id: centroId })
    .then(({ error }) => {
      if (error) console.warn("[reposCenso] marcarCensoProcesado:", error.message);
    });
}

/** Declara completado el registro del refugio. Devuelve el total al momento del cierre. */
export async function completarCenso(
  centroId: string,
  funcionario: FuncionarioCenso,
): Promise<number> {
  const { data, error } = await supabase.rpc("censo_completar", {
    p_centro_id: centroId,
    p_funcionario: {
      jerarquia: funcionario.jerarquia.trim(),
      nombre: funcionario.nombre.trim(),
      institucion: funcionario.institucion.trim(),
      telefono: funcionario.telefono.trim(),
    },
    p_token: tokenActual(),
  });
  if (error) throw new Error(error.message);
  return data as number;
}

/** Anula el cierre declarado y deja el censo en curso / sin iniciar según registros. */
export async function reabrirCenso(centroId: string): Promise<number> {
  const { data, error } = await supabase.rpc("censo_reabrir", {
    p_centro_id: centroId,
  });
  if (error) throw new Error(error.message);
  return Number(data ?? 0);
}

/** Último cierre declarado del censo de un refugio (null si nunca se completó). */
export async function obtenerCierreCenso(centroId: string): Promise<CierreCenso | null> {
  const { data, error } = await supabase.rpc("censo_cierre", {
    p_centro_id: centroId,
    p_token: tokenActual(),
  });
  if (error) throw new Error(error.message);
  const filas = (data ?? []) as CierreCenso[];
  return filas[0] ?? null;
}

interface FilaResumenCensoRed {
  centro_id: string;
  centro_nombre: string;
  total_registrados: number;
  ultimo_registro_en: string | null;
  cierre_en: string | null;
  cierre_total: number | null;
  cierre_funcionario: string | null;
  hombres: number;
  mujeres: number;
  otros_sexo: number;
  recien_nacidos_h: number;
  recien_nacidos_m: number;
  ninos: number;
  ninas: number;
  adolescentes_h: number;
  adolescentes_m: number;
  adultos_h: number;
  adultos_m: number;
  adultos_mayores_h: number;
  adultos_mayores_m: number;
  parte_total: number | null;
  parte_familias: number | null;
  parte_dia: string | null;
  sin_cedula: number;
  importados_planilla: number;
  sin_edad: number;
  solicitados: number;
  con_registro_policial: number;
  firmo_contra_presidente: number;
}

function mapearResumenCensoCentro(fila: FilaResumenCensoRed): ResumenCensoCentro {
  return {
    centroId: fila.centro_id,
    centroNombre: fila.centro_nombre,
    totalRegistrados: Number(fila.total_registrados ?? 0),
    ultimoRegistroEn: fila.ultimo_registro_en,
    cierreEn: fila.cierre_en,
    cierreTotal: fila.cierre_total != null ? Number(fila.cierre_total) : null,
    cierreFuncionario: fila.cierre_funcionario,
    hombres: Number(fila.hombres ?? 0),
    mujeres: Number(fila.mujeres ?? 0),
    otrosSexo: Number(fila.otros_sexo ?? 0),
    recienNacidosH: Number(fila.recien_nacidos_h ?? 0),
    recienNacidosM: Number(fila.recien_nacidos_m ?? 0),
    ninos: Number(fila.ninos ?? 0),
    ninas: Number(fila.ninas ?? 0),
    adolescentesH: Number(fila.adolescentes_h ?? 0),
    adolescentesM: Number(fila.adolescentes_m ?? 0),
    adultosH: Number(fila.adultos_h ?? 0),
    adultosM: Number(fila.adultos_m ?? 0),
    adultosMayoresH: Number(fila.adultos_mayores_h ?? 0),
    adultosMayoresM: Number(fila.adultos_mayores_m ?? 0),
    parteTotal: fila.parte_total != null ? Number(fila.parte_total) : null,
    parteFamilias: fila.parte_familias != null ? Number(fila.parte_familias) : null,
    parteDia: fila.parte_dia,
    sinCedula: Number(fila.sin_cedula ?? 0),
    importadosPlanilla: Number(fila.importados_planilla ?? 0),
    sinEdad: Number(fila.sin_edad ?? 0),
    solicitados: Number(fila.solicitados ?? 0),
    conRegistroPolicial: Number(fila.con_registro_policial ?? 0),
    firmoContraPresidente: Number(fila.firmo_contra_presidente ?? 0),
  };
}

/** Resumen agregado del censo rápido de toda la red (solo roles autorizados). */
export async function obtenerResumenCensoRed(): Promise<ResumenCensoCentro[]> {
  const { data, error } = await supabase.rpc("censo_resumen_red");
  if (error) throw new Error(error.message);
  return ((data ?? []) as FilaResumenCensoRed[]).map(mapearResumenCensoCentro);
}

export interface ResumenSiipol {
  totalImportados: number;
  verificados: number;
  pendientes: number;
}

/** Cobertura SIIPOL de Importaciones Excel para el alcance del usuario. */
export async function obtenerResumenSiipol(): Promise<ResumenSiipol> {
  const { data, error } = await supabase.rpc("censo_siipol_resumen");
  if (error) throw new Error(error.message);
  const fila = (data?.[0] ?? {}) as {
    total_importados?: number;
    verificados?: number;
    pendientes?: number;
  };
  return {
    totalImportados: Number(fila.total_importados ?? 0),
    verificados: Number(fila.verificados ?? 0),
    pendientes: Number(fila.pendientes ?? 0),
  };
}

/** KPIs de cabecera para Importaciones Excel (parte + identidad + verificación).
 *  Identidad es partición de `importadosExcel` (las 5 suman ese total).
 *  `personasVerificables` = adultos cedulados + menores con cédula. */
export interface KpisImportacionesExcel {
  parteUltimo: number;
  importadosExcel: number;
  totalRegistros: number;
  campamentosConImport: number;
  /** Adultos / sin edad, con cédula válida. */
  ceduladasVerificables: number;
  menoresNoCedulados: number;
  menoresConCedula: number;
  /** Adultos o sin edad, sin documento. */
  adultosSinCedula: number;
  cedulasInvalidas: number;
  /** Universo SIIPOL/SAIME: cédula válida (adultos + menores). */
  personasVerificables: number;
  siipolVerificados: number;
  siipolPendientes: number;
  saimeVerificados: number;
  saimePendientes: number;
  solicitados: number;
  conRegistroPolicial: number;
}

const KPIS_IMPORTACIONES_VACIO: KpisImportacionesExcel = {
  parteUltimo: 0,
  importadosExcel: 0,
  totalRegistros: 0,
  campamentosConImport: 0,
  ceduladasVerificables: 0,
  menoresNoCedulados: 0,
  menoresConCedula: 0,
  adultosSinCedula: 0,
  cedulasInvalidas: 0,
  personasVerificables: 0,
  siipolVerificados: 0,
  siipolPendientes: 0,
  saimeVerificados: 0,
  saimePendientes: 0,
  solicitados: 0,
  conRegistroPolicial: 0,
};

export function kpisImportacionesVacios(): KpisImportacionesExcel {
  return { ...KPIS_IMPORTACIONES_VACIO };
}

/** Agregados de Importaciones Excel + último parte (misma regla que Campamentos). */
export async function obtenerKpisImportacionesExcel(): Promise<KpisImportacionesExcel> {
  const { data, error } = await supabase.rpc("censo_importaciones_kpis");
  if (error) throw new Error(error.message);
  const fila = (data?.[0] ?? {}) as {
    parte_ultimo?: number;
    importados_excel?: number;
    total_registros?: number;
    campamentos_con_import?: number;
    ceduladas_verificables?: number;
    menores_no_cedulados?: number;
    menores_con_cedula?: number;
    adultos_sin_cedula?: number;
    cedulas_invalidas?: number;
    personas_verificables?: number;
    siipol_verificados?: number;
    siipol_pendientes?: number;
    saime_verificados?: number;
    saime_pendientes?: number;
    solicitados?: number;
    con_registro_policial?: number;
  };
  return {
    parteUltimo: Number(fila.parte_ultimo ?? 0),
    importadosExcel: Number(fila.importados_excel ?? 0),
    totalRegistros: Number(fila.total_registros ?? 0),
    campamentosConImport: Number(fila.campamentos_con_import ?? 0),
    ceduladasVerificables: Number(fila.ceduladas_verificables ?? 0),
    menoresNoCedulados: Number(fila.menores_no_cedulados ?? 0),
    menoresConCedula: Number(fila.menores_con_cedula ?? 0),
    adultosSinCedula: Number(fila.adultos_sin_cedula ?? 0),
    cedulasInvalidas: Number(fila.cedulas_invalidas ?? 0),
    personasVerificables: Number(fila.personas_verificables ?? 0),
    siipolVerificados: Number(fila.siipol_verificados ?? 0),
    siipolPendientes: Number(fila.siipol_pendientes ?? 0),
    saimeVerificados: Number(fila.saime_verificados ?? 0),
    saimePendientes: Number(fila.saime_pendientes ?? 0),
    solicitados: Number(fila.solicitados ?? 0),
    conRegistroPolicial: Number(fila.con_registro_policial ?? 0),
  };
}

/** Fila agregada de verificación Nexus/SIIPOL por campamento (import_excel). */
export interface VerificacionCensoCentro {
  centroId: string;
  centroNro: number | null;
  centroNombre: string;
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
}

type FilaVerificacionCensoCentro = {
  centro_id?: string;
  centro_nro?: number | null;
  centro_nombre?: string;
  censadas?: number;
  menores?: number;
  adultos?: number;
  nexus?: number;
  siipol?: number;
  ambos?: number;
  solo_nexus?: number;
  solo_siipol?: number;
  verificadas?: number;
  faltan?: number;
  solicitadas?: number;
  con_registro?: number;
};

function mapearVerificacionCensoCentro(
  fila: FilaVerificacionCensoCentro,
): VerificacionCensoCentro {
  const nroRaw = fila.centro_nro;
  const centroNro =
    nroRaw == null || Number.isNaN(Number(nroRaw)) ? null : Number(nroRaw);
  return {
    centroId: String(fila.centro_id ?? ""),
    centroNro,
    centroNombre: String(fila.centro_nombre ?? fila.centro_id ?? ""),
    censadas: Number(fila.censadas ?? 0),
    menores: Number(fila.menores ?? 0),
    adultos: Number(fila.adultos ?? 0),
    nexus: Number(fila.nexus ?? 0),
    siipol: Number(fila.siipol ?? 0),
    ambos: Number(fila.ambos ?? 0),
    soloNexus: Number(fila.solo_nexus ?? 0),
    soloSiipol: Number(fila.solo_siipol ?? 0),
    verificadas: Number(fila.verificadas ?? 0),
    faltan: Number(fila.faltan ?? 0),
    solicitadas: Number(fila.solicitadas ?? 0),
    conRegistro: Number(fila.con_registro ?? 0),
  };
}

/** Verificación Nexus/SIIPOL de Importaciones Excel, una fila por campamento. */
export async function obtenerVerificacionPorCentro(): Promise<
  VerificacionCensoCentro[]
> {
  const { data, error } = await supabase.rpc("censo_verificacion_por_centro");
  if (error) throw new Error(error.message);
  return ((data ?? []) as FilaVerificacionCensoCentro[]).map(
    mapearVerificacionCensoCentro,
  );
}

type FilaListadoCensoRed = RegistroCensoRed;

export const FILAS_POR_PAGINA_CENSO_RED = 50;

export interface FiltrosListadoCensoRed {
  centroId?: string;
  sexo?: string;
  busqueda?: string;
  orden?: string;
  solicitado?: string;
  registroPolicial?: string;
  verificadoSiipol?: string;
}

function paramsFiltrosListadoCensoRed(filtros: FiltrosListadoCensoRed) {
  const boolFiltro = (valor: string | undefined): boolean | null => {
    if (valor === "si") return true;
    if (valor === "no") return false;
    return null;
  };
  return {
    p_centro_id: filtros.centroId && filtros.centroId !== "todos" ? filtros.centroId : null,
    p_sexo: filtros.sexo && filtros.sexo !== "todos" ? filtros.sexo : null,
    p_busqueda: filtros.busqueda?.trim() || null,
    p_orden: filtros.orden ?? "reciente",
    p_solicitado: boolFiltro(filtros.solicitado),
    p_registro_policial: boolFiltro(filtros.registroPolicial),
    // Dato político retirado: RPC aún acepta p_firmo; siempre null.
    p_firmo: null as boolean | null,
    p_verificado_siipol: boolFiltro(filtros.verificadoSiipol),
  };
}

/** Total de registros del listado general con filtros (sin paginar). */
export async function contarListadoCensoRed(filtros: FiltrosListadoCensoRed = {}): Promise<number> {
  const {
    p_centro_id,
    p_sexo,
    p_busqueda,
    p_solicitado,
    p_registro_policial,
    p_firmo,
    p_verificado_siipol,
  } = paramsFiltrosListadoCensoRed(filtros);
  const { data, error } = await supabase.rpc("censo_listado_red_conteo", {
    p_centro_id,
    p_sexo,
    p_busqueda,
    p_solicitado,
    p_registro_policial,
    p_firmo,
    p_verificado_siipol,
  });
  if (error) throw new Error(error.message);
  return Number(data ?? 0);
}

/** Página del listado general del censo rápido en la red. */
export async function obtenerListadoCensoRedPaginado(
  filtros: FiltrosListadoCensoRed,
  pagina: number,
  filasPorPagina = FILAS_POR_PAGINA_CENSO_RED,
): Promise<RegistroCensoRed[]> {
  const {
    p_centro_id,
    p_sexo,
    p_busqueda,
    p_orden,
    p_solicitado,
    p_registro_policial,
    p_firmo,
    p_verificado_siipol,
  } = paramsFiltrosListadoCensoRed(filtros);
  const { data, error } = await supabase.rpc("censo_listado_red_paginado", {
    p_limit: filasPorPagina,
    p_offset: pagina * filasPorPagina,
    p_centro_id,
    p_sexo,
    p_busqueda,
    p_orden,
    p_solicitado,
    p_registro_policial,
    p_firmo,
    p_verificado_siipol,
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as FilaListadoCensoRed[];
}

/** Todos los registros que coinciden con filtros (p. ej. exportación). */
export async function obtenerListadoCensoRedFiltrado(
  filtros: FiltrosListadoCensoRed = {},
  onProgreso?: (cargados: number, total: number) => void,
): Promise<RegistroCensoRed[]> {
  const totalEsperado = await contarListadoCensoRed(filtros);
  const acumulado: RegistroCensoRed[] = [];
  let pagina = 0;

  for (;;) {
    const bloque = await obtenerListadoCensoRedPaginado(
      filtros,
      pagina,
      LIMITE_BLOQUE_EXPORTACION_CENSO_RED,
    );
    acumulado.push(...bloque);
    onProgreso?.(acumulado.length, totalEsperado);
    if (bloque.length < LIMITE_BLOQUE_EXPORTACION_CENSO_RED) break;
    pagina += 1;
  }

  return acumulado;
}

/** @deprecated Usar obtenerListadoCensoRedPaginado o obtenerListadoCensoRedFiltrado. */
export async function obtenerListadoCensoRed(): Promise<RegistroCensoRed[]> {
  return obtenerListadoCensoRedFiltrado();
}

/**
 * Personas solicitadas y/o con registro policial (import_excel) para el
 * anexo del PDF de verificación. Une ambas alertas; deduplica por id.
 */
export async function obtenerAlertasVerificacionCenso(): Promise<
  RegistroCensoRed[]
> {
  const [solicitados, conRegistro] = await Promise.all([
    obtenerListadoCensoRedFiltrado({
      solicitado: "si",
      orden: "campamento",
    }),
    obtenerListadoCensoRedFiltrado({
      registroPolicial: "si",
      orden: "campamento",
    }),
  ]);

  const porId = new Map<string, RegistroCensoRed>();
  for (const fila of [...solicitados, ...conRegistro]) {
    if (fila.origen != null && fila.origen !== "import_excel") continue;
    porId.set(String(fila.id), fila);
  }
  return [...porId.values()];
}
