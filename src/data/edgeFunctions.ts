// Helper único para invocar las Edge Functions de administración de usuarios
// (`create-user`, `delete-user`, `update-user-password`). supabase-js adjunta
// solo el JWT de la sesión activa; la función valida en el servidor que el
// caller sea admin.

import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "./supabaseClient";

/**
 * Invoca una Edge Function y devuelve el body JSON. Si el servidor responde
 * con error (4xx/5xx), lanza un `Error` con el mensaje devuelto por la
 * función (campo `error`), listo para mostrar en la UI.
 */
export async function invocarEdgeFunction<T = unknown>(
  nombre: string,
  body: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>(nombre, { body });
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const detalle = (await error.context.json().catch(() => null)) as
        | { error?: string; message?: string }
        | null;
      throw new Error(detalle?.error || detalle?.message || `Error HTTP en ${nombre}`);
    }
    throw new Error(error.message || `No se pudo invocar ${nombre}`);
  }
  // Edge que responde 200 con `{ error }` (contrato propio): fallar aquí.
  if (
    data &&
    typeof data === "object" &&
    "error" in data &&
    typeof (data as { error: unknown }).error === "string" &&
    (data as { error: string }).error
  ) {
    throw new Error((data as { error: string }).error);
  }
  return data as T;
}
