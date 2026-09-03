import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const json = (status: number, body: any) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json(401, { error: "Não autenticado" });

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller } } = await callerClient.auth.getUser();
    if (!caller) return json(401, { error: "Sessão inválida" });

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: isAdmin } = await adminClient.rpc("has_role", {
      _user_id: caller.id,
      _role: "admin",
    });
    if (!isAdmin) return json(403, { error: "Acesso negado" });

    const body = await req.json().catch(() => ({}));
    const {
      target_user_id,
      target_email,
      new_password,
      mode = "set_password", // "set_password" | "send_recovery"
      admin_password,
    } = body ?? {};

    if (!admin_password) return json(403, { error: "Confirme sua senha administrativa" });

    // Re-verify admin credentials
    const verify = createClient(supabaseUrl, anonKey);
    const { error: signInError } = await verify.auth.signInWithPassword({
      email: caller.email!,
      password: admin_password,
    });
    if (signInError) return json(403, { error: "Senha administrativa incorreta" });

    // Resolve target user
    let targetId = target_user_id as string | undefined;
    let targetEmail = target_email as string | undefined;
    if (!targetId && targetEmail) {
      const { data: found } = await adminClient.auth.admin.listUsers({ page: 1, perPage: 200 });
      const match = found?.users?.find((u) => u.email?.toLowerCase() === targetEmail!.toLowerCase());
      if (!match) return json(404, { error: "Usuário não encontrado" });
      targetId = match.id;
      targetEmail = match.email!;
    } else if (targetId && !targetEmail) {
      const { data } = await adminClient.auth.admin.getUserById(targetId);
      targetEmail = data.user?.email ?? undefined;
    }
    if (!targetId) return json(400, { error: "Informe o usuário alvo" });
    if (targetId === caller.id) return json(400, { error: "Não é permitido redefinir a própria senha aqui" });

    let successCount = 0;
    let failureCount = 0;
    let action = mode === "send_recovery" ? "single_recovery" : "single_set_password";

    if (mode === "send_recovery") {
      if (!targetEmail) return json(400, { error: "Email do usuário indisponível" });
      const { error } = await adminClient.auth.admin.generateLink({
        type: "recovery",
        email: targetEmail,
      });
      if (error) failureCount = 1;
      else successCount = 1;
    } else {
      if (!new_password || String(new_password).length < 6) {
        return json(400, { error: "A nova senha precisa ter pelo menos 6 caracteres" });
      }
      const { error } = await adminClient.auth.admin.updateUserById(targetId, {
        password: String(new_password),
      });
      if (error) {
        failureCount = 1;
      } else {
        successCount = 1;
      }
    }

    await adminClient.from("password_reset_logs").insert({
      admin_user_id: caller.id,
      action,
      total_users: 1,
      success_count: successCount,
      failure_count: failureCount,
    });

    if (failureCount > 0) return json(500, { error: "Falha ao redefinir senha do usuário" });
    return json(200, { success: true, target_id: targetId, target_email: targetEmail, mode });
  } catch (err) {
    console.error("admin-reset-user-password error:", err);
    return json(500, { error: "Erro ao processar a solicitação" });
  }
});
