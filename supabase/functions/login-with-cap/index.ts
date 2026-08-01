// Edge Function `login-with-cap`
//
// Verifica el token de Cap (siteverify) y, si es válido, autentica contra
// Supabase Auth. El secret de Cap nunca sale del servidor; el frontend solo
// envía el token generado por el widget.
//
// Desde el 16-jul (Fase B/C de identidad): tras autenticar, (1) rechaza la
// entrega de la sesión si `perfiles.aprobacion = 'rechazada'` (bloqueo del
// botón "No fui yo" — antes solo cortaba el login de terreno) y (2) si el
// usuario tiene Telegram vinculado le envía la alerta de inicio de sesión
// con el botón "No fui yo" (la atiende el webhook `telegram-bot`).
//
// Secrets requeridos en Supabase (Edge Functions → Secrets):
//   CAP_SECRET, CAP_SITE_KEY, CAP_BASE_URL (opcional)

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/**
 * Si el login llega como cédula pelada o `op-<cédula>`, elige el username
 * real en `perfiles`:
 *   1. username `op-<cédula>` (canónico terreno)
 *   2. username = cédula (altas admin legacy)
 *   3. perfil con `cedula_norm` = cédula (supervisor/admin cuyo login es nombre)
 * Sin match → `op-<cédula>` (fallback terreno).
 */
async function resolverUsernameLogin(
  admin: SupabaseClient,
  raw: string,
): Promise<string> {
  const limpio = raw.trim();
  const cedula =
    /^op-(\d{5,12})$/i.test(limpio)
      ? limpio.slice(3)
      : /^\d{5,12}$/.test(limpio)
        ? limpio
        : null;
  if (!cedula) return limpio;

  const candidatos = [`op-${cedula}`, cedula];
  const { data: filas } = await admin
    .from("perfiles")
    .select("username")
    .in("username", candidatos);
  const found = new Set((filas ?? []).map((f) => f.username));
  if (found.has(`op-${cedula}`)) return `op-${cedula}`;
  if (found.has(cedula)) return cedula;

  const { data: porCedula } = await admin
    .from("perfiles")
    .select("username")
    .eq("cedula_norm", cedula)
    .limit(1)
    .maybeSingle();
  if (porCedula?.username) return porCedula.username;

  return `op-${cedula}`;
}

async function verificarCap(
  capToken: string,
): Promise<{ ok: true } | { ok: false; motivo: string }> {
  const capSecret = Deno.env.get("CAP_SECRET")?.trim();
  const capSiteKey = Deno.env.get("CAP_SITE_KEY")?.trim();
  const capBaseUrl = (
    Deno.env.get("CAP_BASE_URL") ?? "https://cap.m0n1t0r-d3-3v3nt0s.net"
  ).replace(/\/$/, "");

  if (!capSecret || !capSiteKey) {
    console.error("[login-with-cap] faltan CAP_SECRET o CAP_SITE_KEY");
    return { ok: false, motivo: "CAPTCHA no configurado en el servidor" };
  }

  const url = `${capBaseUrl}/${capSiteKey}/siteverify`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret: capSecret, response: capToken }),
    });
  } catch (err) {
    console.error("[login-with-cap] fetch siteverify:", err);
    return { ok: false, motivo: "No se pudo contactar al servidor CAPTCHA" };
  }

  const data = (await res.json().catch(() => ({}))) as {
    success?: boolean;
    error?: string;
  };

  if (data.success === true) return { ok: true };

  console.warn(
    "[login-with-cap] siteverify falló",
    res.status,
    data.error ?? "sin detalle",
  );

  if (res.status === 403 && data.error?.includes("secret")) {
    return {
      ok: false,
      motivo: "CAP_SECRET incorrecto en Supabase (no coincide con Cap)",
    };
  }
  if (res.status === 404) {
    return {
      ok: false,
      motivo: "Token CAPTCHA expirado o ya usado; verifica de nuevo",
    };
  }

  return {
    ok: false,
    motivo: data.error ?? "Verificación de seguridad fallida",
  };
}

/**
 * Alerta de seguridad post-login (best-effort, timeout 3s: nunca demora ni
 * tumba el login). Mismo circuito que login-terreno; el botón lleva el
 * user_id porque un chat puede tener varios usuarios vinculados.
 */
async function notificarLoginTelegram(
  admin: SupabaseClient,
  userId: string,
  detalle: { username: string; nombre: string; rol: string },
): Promise<void> {
  try {
    const { data: vinculo } = await admin
      .from("telegram_operadores")
      .select("chat_id")
      .eq("user_id", userId)
      .maybeSingle();
    if (!vinculo?.chat_id) return;
    const { data: fila } = await admin
      .from("app_secrets")
      .select("valor")
      .eq("clave", "telegram_bot_token")
      .maybeSingle();
    const botToken = fila?.valor;
    if (!botToken) return;

    const hora = new Date().toLocaleString("es-VE", {
      timeZone: "America/Caracas",
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
    const texto =
      `🔐 *Inicio de sesión en la aplicación*\n\n` +
      `Usuario: ${detalle.username} (${detalle.rol})\n` +
      `Nombre: ${detalle.nombre}\n` +
      `Hora: ${hora}\n\n` +
      `Si fue usted, ignore este mensaje.`;

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 3000);
    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: vinculo.chat_id,
        text: texto,
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [[{ text: "⚠️ No fui yo", callback_data: `nofui:${userId}` }]],
        },
      }),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
  } catch {
    // best-effort
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  // Fallos esperados del usuario (credenciales, Cap, body) van con HTTP 200
  // + `{ error }` en el body. Así el navegador no pinta en consola
  // "Failed to load resource …/login-with-cap" con la URL del proyecto.
  // Solo errores de infraestructura usan 4xx/5xx reales.
  let body: { username?: string; password?: string; capToken?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Body inválido" }, 200);
  }

  const username = body.username?.trim();
  const password = body.password;
  const capToken = body.capToken?.trim();

  if (!username || !password || !capToken) {
    return json(
      { error: "Faltan credenciales o verificación de seguridad" },
      200,
    );
  }

  const cap = await verificarCap(capToken);
  if (!cap.ok) {
    return json({ error: cap.motivo }, 200);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !supabaseAnonKey) {
    return json({ error: "Auth no configurado en el servidor" }, 503);
  }

  // Resolver cédula / op-<cédula> → username real ANTES del sign-in
  // (el token Cap es de un solo uso; no se puede reintentar).
  let usernameAuth = username;
  let admin: SupabaseClient | null = null;
  if (serviceKey) {
    admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    usernameAuth = await resolverUsernameLogin(admin, username);
  }

  const authClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const email = `${usernameAuth}@refugio.app`;
  const { data, error } = await authClient.auth.signInWithPassword({
    email,
    password,
  });

  if (error) return json({ error: error.message }, 200);
  if (!data.session) return json({ error: "Login sin sesión devuelta" }, 200);

  // Perfil: bloqueo de rechazados + alerta Telegram.
  if (admin) {
    const userId = data.session.user.id;
    const { data: perfil } = await admin
      .from("perfiles")
      .select("username, nombre, rol, aprobacion")
      .eq("user_id", userId)
      .maybeSingle();

    if (perfil?.aprobacion === "rechazada") {
      // "No fui yo" o rechazo en bandeja: no se entrega la sesión.
      return json(
        {
          error:
            "Su acceso está bloqueado por seguridad. Contacte a los analistas SAE para reactivarlo.",
        },
        200,
      );
    }

    await notificarLoginTelegram(admin, userId, {
      username: perfil?.username ?? usernameAuth,
      nombre: perfil?.nombre ?? "",
      rol: perfil?.rol ?? "",
    });
  }

  return json(
    {
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      expires_in: data.session.expires_in,
      expires_at: data.session.expires_at,
      token_type: data.session.token_type,
    },
    200,
  );
});
