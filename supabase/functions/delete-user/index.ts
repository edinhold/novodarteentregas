import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Não autenticado" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: { user: caller }, error: authError } = await adminClient.auth.getUser(token);
    if (authError || !caller) {
      return new Response(JSON.stringify({ error: "Token inválido" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: isAdmin } = await adminClient.rpc("has_role", { _user_id: caller.id, _role: "admin" });
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Sem permissão de administrador" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const reqData = await req.json().catch(() => ({}));
    const user_id = reqData.user_id || reqData.target_user_id || reqData.owner_id;
    const restaurant_id = reqData.restaurant_id || reqData.id;

    if (!user_id && !restaurant_id) {
      return new Response(JSON.stringify({ error: "ID do usuário ou restaurante é obrigatório" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Call atomic RPC admin_delete_user_cascade
    const { data: rpcRes, error: rpcError } = await adminClient.rpc("admin_delete_user_cascade", {
      p_target_user_id: user_id || null,
      p_target_restaurant_id: restaurant_id || null,
    });

    if (rpcError) {
      console.warn("[delete-user EdgeFunction] RPC error, executing direct fallback:", rpcError.message);

      let restIds: string[] = restaurant_id ? [restaurant_id] : [];
      if (user_id) {
        const { data: ownedRests } = await adminClient.from("restaurants").select("id").eq("owner_id", user_id);
        if (ownedRests && ownedRests.length > 0) {
          restIds = Array.from(new Set([...restIds, ...ownedRests.map((r: any) => r.id)]));
        }
      }

      // Unlink historical financial data
      if (user_id) {
        await adminClient.from("orders").update({ user_id: null }).eq("user_id", user_id);
        await adminClient.from("delivery_requests").update({ store_owner_id: null }).eq("store_owner_id", user_id);
        await adminClient.from("delivery_requests").update({ driver_id: null }).eq("driver_id", user_id);
        await adminClient.from("store_recharges").update({ store_owner_id: null }).eq("store_owner_id", user_id);
        await adminClient.from("credit_codes").update({ used_by: null }).eq("used_by", user_id);
        await adminClient.from("credit_codes").update({ assigned_to_user_id: null }).eq("assigned_to_user_id", user_id);
        await adminClient.from("delivery_groups").update({ store_owner_id: null }).eq("store_owner_id", user_id);
        await adminClient.from("withdrawal_requests").update({ driver_user_id: null }).eq("driver_user_id", user_id);
      }

      if (restIds.length > 0) {
        await adminClient.from("orders").update({ restaurant_id: null }).in("restaurant_id", restIds);
        await adminClient.from("delivery_requests").update({ restaurant_id: null }).in("restaurant_id", restIds);
        await adminClient.from("store_recharges").update({ restaurant_id: null }).in("restaurant_id", restIds);
        await adminClient.from("credit_codes").update({ restaurant_id: null }).in("restaurant_id", restIds);
        await adminClient.from("delivery_groups").update({ restaurant_id: null }).in("restaurant_id", restIds);
      }

      // Delete non-financial dependent rows
      if (user_id) {
        await adminClient.from("chat_messages").delete().eq("sender_id", user_id);
        await adminClient.from("driver_locations").delete().eq("user_id", user_id);
        await adminClient.from("push_subscriptions").delete().eq("user_id", user_id);
        await adminClient.from("driver_push_devices").delete().eq("external_id", user_id);
        await adminClient.from("location_reports").delete().eq("reporter_id", user_id);
        await adminClient.from("admin_requests").delete().eq("user_id", user_id);
        await adminClient.from("store_credits").delete().eq("user_id", user_id);
        await adminClient.from("drivers").delete().eq("user_id", user_id);
        await adminClient.from("user_roles").delete().eq("user_id", user_id);
      }

      if (restIds.length > 0) {
        await adminClient.from("store_driver_favorites").delete().in("restaurant_id", restIds);
        await adminClient.from("products").delete().in("restaurant_id", restIds);
        await adminClient.from("restaurants").delete().in("id", restIds);
      }

      if (user_id) {
        await adminClient.from("profiles").delete().eq("user_id", user_id);
      }
    }

    if (user_id) {
      const { error: deleteAuthError } = await adminClient.auth.admin.deleteUser(user_id);
      if (deleteAuthError) {
        console.warn("Delete auth user warning:", deleteAuthError.message);
      }
    }

    return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err: any) {
    console.error("Unexpected error in delete-user:", err);
    return new Response(JSON.stringify({ error: err?.message || "Erro interno no servidor" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});