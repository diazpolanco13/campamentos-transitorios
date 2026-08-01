// Lógica compartida del alta/edición de usuarios (la usan la vista a pantalla
// completa `/usuarios/nuevo` · `/usuarios/:userId/editar` y la lista).

import type { AmbitoAnalista, Rol } from "@/data/authSupabase";
import { supabase } from "@/data/supabaseClient";
import { invocarEdgeFunction } from "@/data/edgeFunctions";
import { rolUsaCentrosAsignados } from "@/domain/permisos";
import type { UsuarioPerfil } from "./TarjetaUsuario";

export type Formulario = {
  username: string;
  password: string;
  nombre: string;
  rol: Rol;
  ambito_analista: AmbitoAnalista;
  cuerpo_asignado: string | null;
  centros_asignados: string[];
  jerarquia: string;
  cedula: string;
  responsabilidad: string;
  whatsapp: string;
  telegram: string;
  brazalete: string;
  marca_agua: boolean;
};

export const formVacio = (): Formulario => ({
  username: "",
  password: "",
  nombre: "",
  rol: "operador",
  ambito_analista: "centros",
  cuerpo_asignado: null,
  centros_asignados: [],
  jerarquia: "",
  cedula: "",
  responsabilidad: "",
  whatsapp: "",
  telegram: "",
  brazalete: "",
  marca_agua: true,
});

/** Formulario inicial a partir de un perfil existente (edición). */
export function formDesdePerfil(p: UsuarioPerfil): Formulario {
  return {
    username: p.username ?? "",
    password: "",
    nombre: p.nombre ?? "",
    rol: p.rol,
    ambito_analista:
      p.ambito_analista === "cuerpo" || p.ambito_analista === "centros"
        ? p.ambito_analista
        : p.rol === "supervisor" || p.rol === "operador"
          ? "centros"
          : "red",
    cuerpo_asignado: p.cuerpo_asignado ?? null,
    centros_asignados: p.centros_asignados ?? [],
    jerarquia: p.jerarquia ?? "",
    cedula: p.cedula ?? "",
    responsabilidad: p.responsabilidad ?? "",
    whatsapp: p.whatsapp ?? "",
    telegram: p.telegram ?? "",
    brazalete: p.brazalete ?? "",
    marca_agua: p.marca_agua ?? true,
  };
}

/**
 * Ámbito efectivo a persistir. Aplica a los 3 roles de alcance limitado
 * (analista, supervisor, operador); 'red' solo tiene sentido en el analista
 * (para el resto se corrige a 'centros').
 */
export function camposAmbito(form: Formulario): {
  ambito_analista: AmbitoAnalista;
  cuerpo_asignado: string | null;
} {
  if (!rolUsaCentrosAsignados(form.rol)) {
    return { ambito_analista: "red", cuerpo_asignado: null };
  }
  const ambito: AmbitoAnalista =
    form.rol !== "analista_sae" && form.ambito_analista === "red"
      ? "centros"
      : form.ambito_analista;
  if (ambito === "cuerpo" && !form.cuerpo_asignado) {
    throw new Error("Elegí el cuerpo policial asignado.");
  }
  return {
    ambito_analista: ambito,
    cuerpo_asignado: ambito === "cuerpo" ? form.cuerpo_asignado : null,
  };
}

export function centrosAPersistir(form: Formulario): string[] {
  if (!rolUsaCentrosAsignados(form.rol)) return [];
  return camposAmbito(form).ambito_analista === "centros"
    ? form.centros_asignados
    : [];
}

/** Alta vía Edge Function `create-user` (hash_id y validaciones en servidor). */
export async function crearUsuario(form: Formulario): Promise<void> {
  const ambito = camposAmbito(form);
  await invocarEdgeFunction("create-user", {
    username: form.username.trim(),
    password: form.password,
    nombre: form.nombre.trim() || null,
    rol: form.rol,
    ...ambito,
    centros_asignados: centrosAPersistir(form),
    jerarquia: form.jerarquia.trim() || null,
    cedula: form.cedula.trim() || null,
    responsabilidad: form.responsabilidad.trim() || null,
    whatsapp: form.whatsapp.trim() || null,
    telegram: form.telegram.trim() || null,
    brazalete: form.brazalete.trim() || null,
    marca_agua: form.marca_agua,
  });
}

/**
 * Edición: update directo de `perfiles` (RLS admin) + Edge Functions para
 * password y para renombrar el login (`update-username`: el email sintético
 * vive en auth.users y solo se toca con service_role). `usernameOriginal`
 * permite detectar el cambio; omitirlo deja el username como está.
 */
export async function actualizarUsuario(
  userId: string,
  form: Formulario,
  usernameOriginal?: string | null,
): Promise<void> {
  const ambito = camposAmbito(form);
  const patch: Partial<UsuarioPerfil> = {
    nombre: form.nombre.trim() || null,
    rol: form.rol,
    ...ambito,
    centros_asignados: centrosAPersistir(form),
    jerarquia: form.jerarquia.trim() || null,
    cedula: form.cedula.trim() || null,
    responsabilidad: form.responsabilidad.trim() || null,
    whatsapp: form.whatsapp.trim() || null,
    telegram: form.telegram.trim() || null,
    brazalete: form.brazalete.trim() || null,
    marca_agua: form.marca_agua,
  };
  const { error } = await supabase.from("perfiles").update(patch).eq("user_id", userId);
  if (error) throw new Error(error.message);

  const usernameNuevo = form.username.trim().toLowerCase();
  const usernamePrev = (usernameOriginal ?? "").trim().toLowerCase();
  if (usernameNuevo && usernameNuevo !== usernamePrev) {
    const renombre = await invocarEdgeFunction<{
      ok?: boolean;
      username?: string;
      error?: string;
    }>("update-username", {
      user_id: userId,
      username: usernameNuevo,
    });
    // Algunas respuestas 2xx traen `{ error }` en body; no tragar en silencio.
    if (renombre?.error) throw new Error(renombre.error);
    if (renombre?.username && renombre.username !== usernameNuevo) {
      throw new Error(
        `No se pudo renombrar: quedó «${renombre.username}» en lugar de «${usernameNuevo}»`,
      );
    }
  }

  if (form.password) {
    await invocarEdgeFunction("update-user-password", {
      user_id: userId,
      password: form.password,
    });
  }
}
