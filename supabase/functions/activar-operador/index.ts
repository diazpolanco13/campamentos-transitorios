// Edge Function `activar-operador` — CUTOVER (§7 plan migración operadores).
// Activación por QR deshabilitada. Alta/reset de clave: /usuarios o
// /usuarios/terreno. Histórico: git history previo a este stub.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MENSAJE =
  "La activación por enlace o código QR fue deshabilitada. Inicie sesión con su usuario y contraseña; si no tiene clave, pida un reseteo a su supervisor.";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  return new Response(JSON.stringify({ error: MENSAJE }), {
    status: 410,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
