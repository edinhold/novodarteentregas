import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
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

    const { user_id } = await req.json();
    if (!user_id) {
      return new Response(JSON.stringify({ error: "ID do usuário é obrigatório" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Get driver internal id (for FK cleanup on driver_earnings/withdrawal_requests)
    const { data: driverRow } = await adminClient.from("drivers").select("id").eq("user_id", user_id).maybeSingle();
    const driverId = driverRow?.id;

    // Get restaurants owned by this user
    const { data: ownedRestaurants } = await adminClient.from("restaurants").select("id").eq("owner_id", user_id);
    const restaurantIds = (ownedRestaurants || []).map((r: any) => r.id);

    // Delete dependent rows (order matters for FKs)
    await adminClient.from("chat_messages").delete().eq("sender_id", user_id);
    await adminClient.from("driver_locations").delete().eq("user_id", user_id);
    await adminClient.from("location_reports").delete().eq("user_id", user_id).then(() => {}, () => {});
    await adminClient.from("admin_requests").delete().eq("user_id", user_id);
    await adminClient.from("admin_requests").update({ reviewed_by: null }).eq("reviewed_by", user_id);
    await adminClient.from("credit_codes").update({ used_by: null }).eq("used_by", user_id);
    await adminClient.from("store_driver_favorites").delete().eq("driver_user_id", user_id).then(() => {}, () => {});

    // Delivery requests where user is store owner or driver
    await adminClient.from("delivery_requests").delete().eq("store_owner_id", user_id);
    await adminClient.from("delivery_requests").update({ driver_id: null }).eq("driver_id", user_id);

    // Orders placed by user
    await adminClient.from("orders").delete().eq("user_id", user_id);

    // Driver-related financial data
    if (driverId) {
      await adminClient.from("withdrawal_requests").delete().eq("driver_id", driverId);
      await adminClient.from("driver_earnings").delete().eq("driver_id", driverId);
    }
    await adminClient.from("withdrawal_requests").delete().eq("driver_user_id", user_id);

    // Restaurants owned by user (and their products/categories cascade via FK if configured)
    if (restaurantIds.length > 0) {
      await adminClient.from("products").delete().in("restaurant_id", restaurantIds);
      await adminClient.from("delivery_requests").delete().in("restaurant_id", restaurantIds);
      await adminClient.from("orders").delete().in("restaurant_id", restaurantIds);
      await adminClient.from("restaurants").delete().in("id", restaurantIds);
    }

    await adminClient.from("drivers").delete().eq("user_id", user_id);
    await adminClient.from("store_credits").delete().eq("user_id", user_id);
    await adminClient.from("user_roles").delete().eq("user_id", user_id);
    await adminClient.from("profiles").delete().eq("user_id", user_id);

    const { error } = await adminClient.auth.admin.deleteUser(user_id);
    if (error) {
      console.error("Delete user error:", error.message);
      // Return a generic error to the client to avoid leaking database details
      return new Response(JSON.stringify({ error: "Falha ao excluir usuário" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("Unexpected error in delete-user:", err);
    return new Response(JSON.stringify({ error: "Erro interno no servidor" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});