import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Não autenticado" }, 401);

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: { user: caller }, error: authError } = await admin.auth.getUser(token);
    if (authError || !caller) return json({ error: "Token inválido" }, 401);

    const { data: isAdmin } = await admin.rpc("has_role", { _user_id: caller.id, _role: "admin" });
    if (!isAdmin) return json({ error: "Sem permissão de administrador" }, 403);

    const { target_user_id } = await req.json();
    if (!target_user_id) return json({ error: "target_user_id é obrigatório" }, 400);

    // Fetch target user
    const { data: target, error: getErr } = await admin.auth.admin.getUserById(target_user_id);
    if (getErr || !target?.user?.email) return json({ error: "Usuário alvo não encontrado" }, 404);
    const email = target.user.email;

    // Determine role (best effort, for logging)
    const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", target_user_id);
    const role = Array.isArray(roles) && roles.length > 0 ? String((roles[0] as any).role) : null;

    console.log("[Admin:Impersonate] admin=", caller.id, "target=", target_user_id, "role=", role);

    // Generate a magic link — we return the hashed token so the client can verifyOtp locally.
    const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email,
    });
    if (linkErr || !link?.properties?.hashed_token) {
      console.error("[Admin:Impersonate] generateLink failed", linkErr);
      return json({ error: "Falha ao gerar acesso" }, 500);
    }

    // Audit log
    await admin.from("admin_impersonation_logs").insert({
      admin_user_id: caller.id,
      target_user_id,
      target_email: email,
      target_role: role,
    });

    return json({
      email,
      token_hash: link.properties.hashed_token,
      role,
    });
  } catch (err) {
    console.error("[Admin:Impersonate] unexpected", err);
    return json({ error: "Erro interno" }, 500);
  }
});
