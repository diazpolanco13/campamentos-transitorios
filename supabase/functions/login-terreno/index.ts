// Edge Function `login-terreno` — CUTOVER (§7 plan migración operadores).
// Acceso por token QR deshabilitado. Use login con usuario y contraseña.
// Histórico del canje magiclink: git history previo a este stub.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MENSAJE =
  "El acceso por enlace o código QR fue deshabilitado. Inicie sesión con su usuario y contraseña.";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  return new Response(JSON.stringify({ error: MENSAJE }), {
    status: 410,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
