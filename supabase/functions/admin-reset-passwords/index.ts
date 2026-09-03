import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authHeader = req.headers.get("Authorization")!;

    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Não autenticado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const callerClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller } } = await callerClient.auth.getUser();
    if (!caller) {
      return new Response(JSON.stringify({ error: "Sessão inválida" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: isAdmin } = await adminClient.rpc("has_role", {
      _user_id: caller.id,
      _role: "admin",
    });
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Acesso negado" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // MANDATORY password re-confirmation
    const body = await req.json();
    const { admin_password } = body;
    
    if (!admin_password) {
      return new Response(JSON.stringify({ error: "Confirmação de senha administrativa é obrigatória." }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Use a fresh client for credential verification to avoid any session contamination
    const verificationClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!);
    const { error: signInError } = await verificationClient.auth.signInWithPassword({ 
      email: caller.email!, 
      password: admin_password 
    });
    
    if (signInError) {
      return new Response(JSON.stringify({ error: "Senha incorreta. Ação não autorizada." }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // List users in chunks
    const allUsers: any[] = [];
    let page = 1;
    const perPage = 100;
    while (true) {
      const { data: { users }, error } = await adminClient.auth.admin.listUsers({
        page,
        perPage,
      });
      if (error) throw new Error("Falha ao listar usuários");
      if (!users || users.length === 0) break;
      allUsers.push(...users);
      if (users.length < perPage) break;
      page++;
    }

    const targetUsers = allUsers.filter((u) => u.id !== caller.id);

    let successCount = 0;
    let failureCount = 0;

    for (const user of targetUsers) {
      if (!user.email) continue;
      try {
        const { error: linkError } = await adminClient.auth.admin.generateLink({
          type: "recovery",
          email: user.email,
        });
        if (linkError) {
          failureCount++;
        } else {
          successCount++;
        }
      } catch (e) {
        failureCount++;
      }
    }

    // Audit the action
    await adminClient.from("password_reset_logs").insert({
      admin_user_id: caller.id,
      action: "bulk_reset",
      total_users: targetUsers.length,
      success_count: successCount,
      failure_count: failureCount,
    });

    return new Response(
      JSON.stringify({
        success: true,
        processed: targetUsers.length,
        success_count: successCount,
        failure_count: failureCount,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Bulk reset error:", err);
    return new Response(JSON.stringify({ error: "Ocorreu um erro ao processar a solicitação." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});