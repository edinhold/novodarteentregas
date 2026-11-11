import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const body = await req.json().catch(() => ({}));
    const email = body?.email?.trim() || null;
    const phone = body?.phone?.trim() || null;

    if (!email && !phone) {
      return new Response(
        JSON.stringify({ success: false, cleaned: false, active: false, message: "E-mail ou telefone obrigatório." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Call atomic RPC clean_orphan_signup
    const { data: rpcRes, error: rpcError } = await adminClient.rpc("clean_orphan_signup", {
      p_email: email,
      p_phone: phone,
    });

    if (!rpcError && rpcRes) {
      return new Response(JSON.stringify(rpcRes), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fallback if RPC is not found: direct admin check
    const { data: usersData } = await adminClient.auth.admin.listUsers({ page: 1, perPage: 100 });
    const users: any[] = usersData?.users || [];
    const cleanPhone = phone ? phone.replace(/\D/g, "") : "";
    const matched = users.find((u: any) => {
      const emailMatches = email && u.email?.toLowerCase() === email.toLowerCase();
      const uPhone = u.phone ? u.phone.replace(/\D/g, "") : "";
      const phoneMatches = cleanPhone && uPhone && (uPhone === cleanPhone || uPhone.endsWith(cleanPhone) || cleanPhone.endsWith(uPhone));
      return emailMatches || phoneMatches;
    });

    if (!matched) {
      return new Response(
        JSON.stringify({ success: true, cleaned: false, active: false, message: "Nenhum usuário encontrado." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const uid = matched.id;
    const [{ data: ownedStore }, { data: driverRow }, { data: roles }, { data: orders }] = await Promise.all([
      adminClient.from("restaurants").select("id").eq("owner_id", uid).maybeSingle(),
      adminClient.from("drivers").select("id").eq("user_id", uid).maybeSingle(),
      adminClient.from("user_roles").select("role").eq("user_id", uid),
      adminClient.from("orders").select("id").eq("user_id", uid).maybeSingle(),
    ]);

    const isPrivileged = roles?.some((r: any) => ["admin", "store_owner", "driver"].includes(r.role));
    const isActive = !!ownedStore || !!driverRow || !!orders || isPrivileged;

    if (isActive) {
      return new Response(
        JSON.stringify({ success: true, cleaned: false, active: true, message: "Usuário com cadastro ativo no sistema." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Clean orphan user
    await adminClient.from("profiles").delete().eq("user_id", uid);
    await adminClient.from("user_roles").delete().eq("user_id", uid);
    await adminClient.auth.admin.deleteUser(uid);

    return new Response(
      JSON.stringify({ success: true, cleaned: true, active: false, message: "Registro órfão limpo com sucesso." }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, cleaned: false, active: false, error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

