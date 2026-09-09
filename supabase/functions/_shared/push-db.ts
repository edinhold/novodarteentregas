import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";

export function serviceClient(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } }
  );
}

/** Returns the authenticated user id or null. Never throws. */
export async function getCaller(req: Request): Promise<{ id: string; email?: string } | null> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return null;
  const anon = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } }
  );
  const { data, error } = await anon.auth.getUser();
  if (error || !data?.user) return null;
  return { id: data.user.id, email: data.user.email ?? undefined };
}

export async function isAdmin(svc: SupabaseClient, userId: string): Promise<boolean> {
  const { data } = await svc
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  return !!data;
}

export async function checkAdmin(userId: string): Promise<boolean> {
  return isAdmin(serviceClient(), userId);
}

/** Online = driver profile active + approved + recent heartbeat (15 min) + not suspended. */
export const ONLINE_WINDOW_MINUTES = 15;

export interface OnlineDriver {
  id: string;
  user_id: string;
  full_name: string;
}

export async function fetchOnlineDrivers(svc: SupabaseClient): Promise<OnlineDriver[]> {
  const cutoff = new Date(Date.now() - ONLINE_WINDOW_MINUTES * 60 * 1000).toISOString();
  const { data, error } = await svc
    .from("drivers")
    .select("id, user_id, full_name, is_online, is_active, approval_status, last_seen_at, suspended_until")
    .eq("is_active", true)
    .eq("approval_status", "approved")
    .eq("is_online", true)
    .gte("last_seen_at", cutoff);

  if (error) throw error;

  const now = new Date().getTime();
  const unsuspended = (data ?? []).filter(
    (d) => !d.suspended_until || new Date(d.suspended_until).getTime() < now
  );

  if (unsuspended.length === 0) return [];

  // Exclude drivers that currently have an active delivery (accepted or in_transit / picked_up)
  const driverIds = unsuspended.map((d) => d.id);
  const { data: activeDeliveries } = await svc
    .from("delivery_requests")
    .select("driver_id")
    .in("driver_id", driverIds)
    .in("status", ["accepted", "in_transit", "picked_up"]);

  const busyIds = new Set((activeDeliveries ?? []).map((ad) => ad.driver_id));
  const available = unsuspended.filter((d) => !busyIds.has(d.id));

  return available.map((d) => ({ id: d.id, user_id: d.user_id, full_name: d.full_name }));
}

export interface Subscription {
  onesignal_subscription_id: string;
  platform: string;
  user_id: string;
}

/** Fetches active subscriptions for given user_ids, enforcing single active device per driver. */
export async function fetchActiveSubscriptions(
  svc: SupabaseClient,
  userIds: string[]
): Promise<Subscription[]> {
  if (userIds.length === 0) return [];

  // 1. Query dedicated driver_push_devices table
  const { data: driverDevs } = await svc
    .from("driver_push_devices")
    .select("driver_id, subscription_id, platform, active, subscription_status, updated_at")
    .in("driver_id", userIds)
    .eq("active", true)
    .not("subscription_id", "is", null);

  // 2. Query push_subscriptions table
  const { data: generalSubs } = await svc
    .from("push_subscriptions")
    .select("onesignal_subscription_id, platform, user_id, active, subscription_status, updated_at")
    .in("user_id", userIds)
    .eq("active", true)
    .not("onesignal_subscription_id", "is", null);

  // Single active subscription map per driver
  const driverSubMap = new Map<string, Subscription>();

  for (const d of driverDevs ?? []) {
    if (d.active && d.subscription_status === "active" && d.subscription_id) {
      const subId = d.subscription_id.trim();
      if (subId) {
        driverSubMap.set(d.driver_id, {
          onesignal_subscription_id: subId,
          platform: d.platform || "web_pwa",
          user_id: d.driver_id,
        });
      }
    }
  }

  for (const s of generalSubs ?? []) {
    if (
      s.active &&
      s.subscription_status !== "unsubscribed" &&
      s.subscription_status !== "deleted" &&
      s.onesignal_subscription_id
    ) {
      const subId = s.onesignal_subscription_id.trim();
      if (subId && !driverSubMap.has(s.user_id)) {
        driverSubMap.set(s.user_id, {
          onesignal_subscription_id: subId,
          platform: s.platform || "web_pwa",
          user_id: s.user_id,
        });
      }
    }
  }

  return Array.from(driverSubMap.values());
}

export function groupByPlatform(subs: Subscription[]): Record<string, string[]> {
  const groups: Record<string, string[]> = {};
  for (const s of subs) {
    const key = s.platform === "android_apk" ? "android_apk" : "web_pwa";
    (groups[key] ||= []).push(s.onesignal_subscription_id);
  }
  return groups;
}
