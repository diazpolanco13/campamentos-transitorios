import type { Rol, Usuario } from "../data/authSupabase";
import {
  esCentroDePrueba,
  type CentroTransitorio,
} from "./centrosTransitorios";

/**
 * Metadatos y matriz de permisos de cada rol (ver docs/sistema-usuarios.md).
 *
 * | Rol          | Usuarios | Ver centros | Escribir     | Incidencias                    | Logs | Censo red | Censo ficha | Buzón        |
 * |--------------|----------|-------------|--------------|--------------------------------|------|-----------|-------------|--------------|
 * | admin        | Sí       | Todos       | Todos        | Abrir/resolver en todos        | Sí   | Sí        | Sí (editar) | Todos        |
 * | analista_sae | No       | Todos       | Todos        | Abrir/resolver en todos        | No   | Sí        | Sí (editar) | Todos        |
 * | autoridad    | No       | Todos       | No           | No                             | Sí   | Sí        | Solo lectura| Todos (leer) |
 * | supervisor   | No       | Asignados¹  | Asignados    | Abrir/resolver en asignados    | No   | No        | Asignados (editar) | Asignados |
 * | operador     | No       | Asignados¹  | Asignados    | Abrir; resolver solo las suyas | No   | No        | No          | No           |
 *
 * Traslados entre campamentos: solo admin, analista SAE y supervisor (RLS + RPC).
 * | censo_rapido | No       | Todos       | No           | No                             | No   | Sí        | Solo lectura| No           |
 *
 * ¹ Mapa: red completa con no asignados atenuados (mismo efecto visual que
 *   el filtro por unidad SEBIN). Listas, KPIs, ficha y reportes = solo
 *   asignados.
 *
 * La RLS de Supabase aplica esta misma matriz en el servidor (migración
 * `sistema_usuarios_5_roles`); estos helpers solo controlan la UI.
 */
export interface InfoRol {
  rol: Rol;
  etiqueta: string;
  descripcion: string;
  /** Ve toda la red (lectura); si es false, solo sus centros asignados. */
  alcanceTotal: boolean;
  /** Puede editar datos operativos (dentro de su alcance). */
  puedeEscribir: boolean;
  /** Escribe en cualquier centro de la red (no solo en los asignados). */
  escrituraTotal: boolean;
  /** Crear, editar, eliminar usuarios y cambiar contraseñas. */
  puedeGestionarUsuarios: boolean;
  /** Ver la bitácora /logs. */
  puedeVerLogs: boolean;
  /** Registrar centros nuevos y eliminar centros. */
  puedeCrearCentros: boolean;
}

export const ROLES: Rol[] = [
  "admin",
  "analista_sae",
  "autoridad",
  "supervisor",
  "operador",
  "censo_rapido",
];

export const INFO_ROLES: Record<Rol, InfoRol> = {
  admin: {
    rol: "admin",
    etiqueta: "Administrador",
    descripcion: "Control total: toda la red, gestión de usuarios y logs",
    alcanceTotal: true,
    puedeEscribir: true,
    escrituraTotal: true,
    puedeGestionarUsuarios: true,
    puedeVerLogs: true,
    puedeCrearCentros: true,
  },
  analista_sae: {
    rol: "analista_sae",
    etiqueta: "Analista",
    descripcion:
      "Opera toda la red (campamentos, reportes, incidencias), ve la bitácora y gestiona los catálogos de cuerpos y unidades; sin gestión de usuarios",
    alcanceTotal: true,
    puedeEscribir: true,
    escrituraTotal: true,
    puedeGestionarUsuarios: false,
    puedeVerLogs: true,
    puedeCrearCentros: true,
  },
  autoridad: {
    rol: "autoridad",
    etiqueta: "Autoridad",
    descripcion: "Solo lectura de toda la red; no modifica nada ni ve la bitácora",
    alcanceTotal: true,
    puedeEscribir: false,
    escrituraTotal: false,
    puedeGestionarUsuarios: false,
    puedeVerLogs: false,
    puedeCrearCentros: false,
  },
  supervisor: {
    rol: "supervisor",
    etiqueta: "Supervisor",
    descripcion:
      "Opera sus campamentos asignados; en el mapa ve la red con el resto atenuado",
    alcanceTotal: false,
    puedeEscribir: true,
    escrituraTotal: false,
    puedeGestionarUsuarios: false,
    puedeVerLogs: false,
    puedeCrearCentros: false,
  },
  operador: {
    rol: "operador",
    etiqueta: "Operador",
    descripcion:
      "Reporta a diario en sus campamentos asignados; resuelve solo las incidencias que abrió",
    alcanceTotal: false,
    puedeEscribir: true,
    escrituraTotal: false,
    puedeGestionarUsuarios: false,
    puedeVerLogs: false,
    puedeCrearCentros: false,
  },
  censo_rapido: {
    rol: "censo_rapido",
    etiqueta: "Censo Rápido",
    descripcion:
      "Consulta el mapa de campamentos y el censo rápido de toda la red; sin edición",
    alcanceTotal: true,
    puedeEscribir: false,
    escrituraTotal: false,
    puedeGestionarUsuarios: false,
    puedeVerLogs: false,
    puedeCrearCentros: false,
  },
};

export function permisosDeRol(rol: Rol): InfoRol {
  // Tolerancia a roles desconocidos (sesión vieja): solo lectura.
  return INFO_ROLES[rol] ?? INFO_ROLES.autoridad;
}

/** Puede editar datos operativos (dentro de su alcance). Reemplaza a `puedeEditarMapa`. */
export function puedeEscribir(rol: Rol): boolean {
  return permisosDeRol(rol).puedeEscribir;
}

export function puedeGestionarUsuarios(rol: Rol): boolean {
  return permisosDeRol(rol).puedeGestionarUsuarios;
}

export function puedeVerLogs(rol: Rol): boolean {
  return permisosDeRol(rol).puedeVerLogs;
}

/**
 * Bandeja de operadores de terreno (/usuarios/terreno): admin, analista SAE
 * y supervisor gestionan los operadores de su alcance (aprobación, alertas,
 * desuscripción y eliminación). Distinto de `puedeGestionarUsuarios` (CRUD de
 * cuentas permanentes, admin-only). El analista además crea cuentas de
 * supervisor dentro de su alcance (edge `create-user`), aunque su edición y
 * eliminación siguen siendo admin-only. El servidor aplica el alcance: RLS
 * `perfiles_select_operadores_terreno` / `perfiles_update` por solape de
 * centros, y `delete-user` valida con `puede_gestionar_operador`.
 */
export function puedeGestionarOperadores(rol: Rol): boolean {
  return rol === "admin" || rol === "analista_sae" || rol === "supervisor";
}

/** Acciones de la bandeja (aprobar/rechazar, alertas, quitar, eliminar). */
export function puedeResolverOperadores(rol: Rol): boolean {
  return puedeGestionarOperadores(rol);
}

/**
 * Vista /estado (estado del sistema): salud de la plataforma vs servicios
 * externos (Nexus) con histórico de incidentes. Todos los roles salvo
 * operador y censo_rapido; la RLS de `incidentes_servicios` aplica lo mismo
 * en el servidor.
 */
export function puedeVerEstadoSistema(rol: Rol): boolean {
  return rol !== "operador" && rol !== "censo_rapido";
}

/** Vista interna /centros/registro (resumen agregado del registro nominal en red). */
export function puedeVerCensoRapidoRed(rol: Rol): boolean {
  return (
    rol === "admin" ||
    rol === "analista_sae" ||
    rol === "autoridad" ||
    rol === "censo_rapido"
  );
}

/** Editar o eliminar registros del censo rápido en toda la red (admin / analista SAE). */
export function puedeEditarCensoRapidoRed(rol: Rol): boolean {
  return rol === "admin" || rol === "analista_sae";
}

/** Analista con alcance de toda la red (ámbito 'red'). */
export function esAnalistaDeRed(usuario: Usuario): boolean {
  return usuario.rol === "analista_sae" && usuario.ambito_analista === "red";
}

/** Analista con alcance de un cuerpo policial (ámbito 'cuerpo'). */
export function esAnalistaDeCuerpo(usuario: Usuario): boolean {
  return (
    usuario.rol === "analista_sae" &&
    usuario.ambito_analista === "cuerpo" &&
    Boolean(usuario.cuerpo_asignado)
  );
}

/**
 * Registrar/eliminar campamentos: admin, analista de red y analista de cuerpo
 * (este último solo campamentos supervisados por unidades de su cuerpo; la
 * RLS `centros_insert` exige que la unidad asignada pertenezca al cuerpo).
 * El analista con lista manual de campamentos no crea.
 */
export function puedeCrearCentros(usuario: Usuario): boolean {
  if (usuario.rol === "analista_sae") {
    return esAnalistaDeRed(usuario) || esAnalistaDeCuerpo(usuario);
  }
  return permisosDeRol(usuario.rol).puedeCrearCentros;
}

/**
 * Hoja imprimible de QRs de terreno (/qrs-terreno): solo admin y analista de
 * red — la RLS de `tokens_centros` no deja leer el token `personal` a los
 * analistas con ámbito, así que la hoja saldría incompleta.
 */
export function puedeImprimirQrsTerreno(usuario: Usuario): boolean {
  return usuario.rol === "admin" || esAnalistaDeRed(usuario);
}

/** Catálogo de unidades internas SEBIN (crear/editar/eliminar). */
/** Puede administrar catálogos operativos (cuerpos + unidades de supervisión). */
export function puedeGestionarCatalogosOperativos(rol: Rol): boolean {
  return rol === "admin" || rol === "analista_sae";
}

/**
 * Coordinación → Supervisión (cuerpo, unidad, revista, analistas): solo sala.
 * Operador/supervisor ven la pestaña en solo lectura.
 */
export function puedeEditarAsignacionOperativa(rol: Rol): boolean {
  return rol === "admin" || rol === "analista_sae";
}

/**
 * Entrar a /config/catalogos-operativos: admin, analista de red y analista
 * con cuerpo asignado (gestiona solo las unidades de su cuerpo). El analista
 * con lista manual de campamentos no gestiona catálogos.
 */
export function puedeEntrarACatalogos(usuario: Usuario): boolean {
  if (usuario.rol === "admin") return true;
  if (usuario.rol !== "analista_sae") return false;
  if (usuario.ambito_analista === "red") return true;
  return usuario.ambito_analista === "cuerpo" && Boolean(usuario.cuerpo_asignado);
}

/** Editar el catálogo de cuerpos policiales (solo alcance de red). */
export function puedeEditarCuerposPoliciales(usuario: Usuario): boolean {
  return usuario.rol === "admin" || esAnalistaDeRed(usuario);
}

/** @deprecated Usar `puedeGestionarCatalogosOperativos`. */
export function puedeGestionarUnidadesSebin(rol: Rol): boolean {
  return puedeGestionarCatalogosOperativos(rol);
}

/** Rol con centros asignados como ámbito operativo o de monitoreo. */
export function rolUsaCentrosAsignados(rol: Rol): boolean {
  return rol === "analista_sae" || rol === "supervisor" || rol === "operador";
}

/**
 * Corregir reportes diarios de fechas anteriores: solo la sala (admin y
 * analista SAE). Los supervisores/operadores reportan únicamente el día en
 * curso.
 */
export function puedeEditarReportesPasados(usuario: Usuario): boolean {
  return usuario.rol === "admin" || usuario.rol === "analista_sae";
}

/** Registrar traslados formales entre campamentos (origen → destino). */
export function puedeTrasladarEntreCentros(rol: Rol): boolean {
  return rol === "admin" || rol === "analista_sae" || rol === "supervisor";
}

/** Ver la vista /centros/traslados (wizard o historial). */
export function puedeVerTraslados(rol: Rol): boolean {
  return puedeTrasladarEntreCentros(rol) || rol === "autoridad";
}

/** ¿Puede este usuario editar los datos de un centro concreto? */
/**
 * Alcance dinámico por cuerpo policial (analista, supervisor u operador con
 * ámbito 'cuerpo'): sus campamentos son los supervisados por unidades de su
 * cuerpo. La RLS los resuelve con `mis_centros()`; en el cliente,
 * `authSupabase` hidrata `centros_asignados` con esa misma RPC al cargar la
 * sesión, así los chequeos por lista (abajo) siguen valiendo.
 */
export function tieneAlcancePorCuerpo(usuario: Usuario): boolean {
  return (
    (usuario.rol === "analista_sae" ||
      usuario.rol === "supervisor" ||
      usuario.rol === "operador") &&
    usuario.ambito_analista === "cuerpo" &&
    Boolean(usuario.cuerpo_asignado)
  );
}

export function puedeEditarCentro(usuario: Usuario, centroId: string): boolean {
  const info = permisosDeRol(usuario.rol);
  if (!info.puedeEscribir) return false;
  if (info.escrituraTotal) return true;
  return (usuario.centros_asignados ?? []).includes(centroId);
}

/**
 * Pestaña Censo de la ficha del campamento: roles de red + supervisor en
 * centros asignados (edición operativa del censo de su refugio).
 */
export function puedeVerCensoCentro(usuario: Usuario, centroId: string): boolean {
  if (puedeVerCensoRapidoRed(usuario.rol)) return true;
  return usuario.rol === "supervisor" && puedeEditarCentro(usuario, centroId);
}

/** Editar censo (registros, cierre/reapertura) en un campamento concreto. */
export function puedeEditarCensoCentro(usuario: Usuario, centroId: string): boolean {
  if (puedeEditarCensoRapidoRed(usuario.rol)) return true;
  return usuario.rol === "supervisor" && puedeEditarCentro(usuario, centroId);
}

/**
 * Descargar el Excel del censo nominal de un campamento (relación por
 * campamento): admin, analista SAE, supervisor y autoridad. El operador y
 * censo_rapido no extraen el listado nominal.
 */
export function puedeExportarCensoNominal(rol: Rol): boolean {
  return (
    rol === "admin" ||
    rol === "analista_sae" ||
    rol === "supervisor" ||
    rol === "autoridad"
  );
}

/**
 * Densidad de columnas del listado nominal en reportes (más amplio que el
 * censador terreno). Admin / analista SAE / autoridad ven demografía y PII
 * de contacto; supervisor y censo_rapido ven el set operativo.
 */
export type NivelColumnasCensoNominal = "amplio" | "operativo";

export function nivelColumnasCensoNominal(rol: Rol): NivelColumnasCensoNominal {
  if (rol === "admin" || rol === "analista_sae" || rol === "autoridad") {
    return "amplio";
  }
  return "operativo";
}

/**
 * Pestaña Buzón (canal de denuncias del campamento): admin, analista SAE y
 * autoridad ven toda la red; el supervisor solo en sus campamentos asignados.
 * Alineado con la RLS de `denuncias_centros`.
 */
export function puedeVerBuzonCentro(usuario: Usuario, centroId: string): boolean {
  if (
    usuario.rol === "admin" ||
    usuario.rol === "analista_sae" ||
    usuario.rol === "autoridad"
  ) {
    return true;
  }
  return usuario.rol === "supervisor" && puedeEditarCentro(usuario, centroId);
}

/** Editar o soft-deletear denuncias de damnificados (sala: admin / analista SAE). */
export function puedeGestionarDenuncias(rol: Rol): boolean {
  return rol === "admin" || rol === "analista_sae";
}

/** Papelera de denuncias eliminadas (solo admin). */
export function puedeVerPapeleraDenuncias(rol: Rol): boolean {
  return rol === "admin";
}

/** Campamento sandbox de desarrollo: solo el administrador lo ve en la red. */
export function puedeVerCentrosPrueba(usuario: Usuario): boolean {
  return usuario.rol === "admin";
}

/**
 * Lista de campamentos según quién puede ver el sandbox.
 * Admin: toda la red incluido entrenamiento.
 * Operador/supervisor con el sandbox asignado: lo ven (QR de terreno).
 * Resto: solo campamentos de producción.
 *
 * No filtra por `centros_asignados`: el mapa de roles con alcance limitado
 * muestra la red completa (marcadores no asignados atenuados). Para listas /
 * KPIs / ficha usar `centrosEnAlcanceUsuario`.
 */
export function centrosVisiblesParaUsuario(
  centros: CentroTransitorio[],
  usuario: Usuario | null | undefined,
): CentroTransitorio[] {
  if (usuario && puedeVerCentrosPrueba(usuario)) return centros;
  const asignados = new Set(usuario?.centros_asignados ?? []);
  return centros.filter((c) => {
    if (!esCentroDePrueba(c)) return true;
    return asignados.has(c.id);
  });
}

/** ¿Rol con lectura de toda la red (sin atenuar por asignación en el mapa)? */
export function tieneAlcanceTotalRed(usuario: Usuario | null | undefined): boolean {
  if (!usuario) return false;
  return permisosDeRol(usuario.rol).alcanceTotal;
}

/**
 * Campamentos operativos del usuario.
 * Alcance total → mismos que `centrosVisiblesParaUsuario`.
 * Alcance limitado → solo `centros_asignados` (listas, KPIs, ficha, reportes).
 */
export function centrosEnAlcanceUsuario(
  centros: CentroTransitorio[],
  usuario: Usuario | null | undefined,
): CentroTransitorio[] {
  const visibles = centrosVisiblesParaUsuario(centros, usuario);
  if (!usuario || permisosDeRol(usuario.rol).alcanceTotal) return visibles;
  const asignados = new Set(usuario.centros_asignados ?? []);
  return visibles.filter((c) => asignados.has(c.id));
}

/**
 * IDs a resaltar en el mapa por ámbito del usuario.
 * `null` = sin atenuación por asignación (roles de red completa).
 * Con alcance limitado = solo asignados (el resto se opaca como filtro unidad).
 */
export function idsCentrosResaltadosMapa(
  usuario: Usuario | null | undefined,
): ReadonlySet<string> | null {
  if (!usuario || permisosDeRol(usuario.rol).alcanceTotal) return null;
  return new Set(usuario.centros_asignados ?? []);
}

export function puedeVerSaludMental(rol: Rol): boolean {
  return rol !== "autoridad";
}

/** Vista global /centros/refugiados (población nominal de la red). */
export function puedeVerPoblacionRed(rol: Rol): boolean {
  return rol !== "supervisor" && rol !== "operador" && rol !== "censo_rapido";
}

/** Rol restringido a mapa + censo rápido (sin resto del menú). */
export function esRolCensoRapido(rol: Rol): boolean {
  return rol === "censo_rapido";
}

/**
 * Rol de la sesión de terreno (el QR del campamento): la credencial es un
 * código impreso y compartido, así que la UI se reduce a lo que ese personal
 * hace en el centro — reporte diario, población e infraestructura de SUS
 * campamentos. La RLS limita además los datos en el servidor.
 */
export function esRolTerreno(rol: Rol): boolean {
  return rol === "operador";
}

/**
 * Usuario de terreno sin contraseña propia (entra por QR):
 * `op-<cedula>` (identidad por cédula, v3), `operador-<centro>` o
 * `operador-<centro>-<huella>` (legacy). No edita perfil ni cambia password.
 */
export function esUsuarioTemporalTerreno(username: string): boolean {
  return /^(operador-|op-)/.test(username.trim());
}

/**
 * Cuenta con credencial propia: puede ver/editar su ficha y cambiar su
 * contraseña. Un `op-<cédula>` deja de ser "temporal" cuando activó su
 * credencial (Fase 2 del plan de migración: `activado_ts` puesto por la
 * edge `activar-operador`). El username NO se renombra en ningún caso para
 * los usuarios de terreno (la convención `op-<cédula>` es la identidad).
 */
export function puedeEditarCuentaPropia(
  usuario: Pick<Usuario, "username" | "activado_ts"> | null | undefined,
): boolean {
  if (!usuario?.username) return false;
  if (!esUsuarioTemporalTerreno(usuario.username)) return true;
  return usuario.activado_ts != null;
}

/** Pestañas de la ficha del campamento visibles para la sesión de terreno. */
export const SECCIONES_FICHA_TERRENO = [
  "resumen",
  "poblacion",
  "reporte",
  "infraestructura",
] as const;

/** Ruta de aterrizaje según el rol (destino de las redirecciones). */
export function rutaInicialDeRol(rol: Rol): string {
  return esRolTerreno(rol) ? "/centros/reportes" : "/centros/mapa";
}

/** Rutas permitidas para los roles restringidos (censo_rapido, operador, supervisor). */
export function rutaPermitidaParaRol(pathname: string, rol: Rol): boolean {
  // Preferencias de cuenta: todos los roles permanentes (la vista bloquea temporales).
  if (pathname === "/config/perfil" || pathname.startsWith("/config/perfil/")) {
    return true;
  }
  if (esRolCensoRapido(rol)) {
    return (
      pathname === "/" ||
      pathname === "/centros/mapa" ||
      pathname.startsWith("/centros/registro") ||
      pathname.startsWith("/centros/censo")
    );
  }
  if (esRolTerreno(rol)) {
    return (
      pathname === "/" ||
      pathname === "/centros/reportes" ||
      pathname.startsWith("/centros/reportes/") ||
      pathname.startsWith("/campo/")
    );
  }
  if (rol === "supervisor" && pathname.startsWith("/centros/refugiados")) {
    return false;
  }
  return true;
}
