import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";

export function serviceClient(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
}

/** Returns the authenticated user id or null. Never throws. */
export async function getCaller(req: Request): Promise<{ id: string; email?: string } | null> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return null;
  const anon = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } },
  );
  const { data, error } = await anon.auth.getUser();
  if (error || !data?.user) return null;
  return { id: data.user.id, email: data.user.email ?? undefined };
}

export async function isAdmin(svc: SupabaseClient, userId: string): Promise<boolean> {
  const { data } = await svc.from("user_roles").select("role").eq("user_id", userId).eq("role", "admin").maybeSingle();
  return !!data;
}

/** Online = driver profile active + approved + recent heartbeat. */
export const ONLINE_WINDOW_MINUTES = 10;

export interface OnlineDriver {
  user_id: string;
  full_name: string;
}

export async function fetchOnlineDrivers(svc: SupabaseClient): Promise<OnlineDriver[]> {
  const cutoff = new Date(Date.now() - ONLINE_WINDOW_MINUTES * 60 * 1000).toISOString();
  const { data, error } = await svc
    .from("drivers")
    .select("user_id, full_name, is_online, is_active, approval_status, last_seen_at")
    .eq("is_active", true)
    .eq("approval_status", "approved")
    .eq("is_online", true)
    .gte("last_seen_at", cutoff);
  if (error) throw error;
  return (data ?? []).map((d) => ({ user_id: d.user_id, full_name: d.full_name }));
}

export interface Subscription {
  onesignal_subscription_id: string;
  platform: string;
  user_id: string;
}

export async function fetchActiveSubscriptions(
  svc: SupabaseClient,
  userIds: string[],
): Promise<Subscription[]> {
  if (userIds.length === 0) return [];
  const { data, error } = await svc
    .from("push_subscriptions")
    .select("onesignal_subscription_id, platform, user_id")
    .in("user_id", userIds)
    .eq("active", true)
    .eq("permission_status", "granted")
    .eq("subscription_status", "subscribed")
    .not("onesignal_subscription_id", "is", null);
  if (error) throw error;
  const seen = new Set<string>();
  const out: Subscription[] = [];
  for (const s of data ?? []) {
    const id = (s.onesignal_subscription_id ?? "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push({ onesignal_subscription_id: id, platform: s.platform, user_id: s.user_id });
  }
  return out;
}

export function groupByPlatform(subs: Subscription[]): Record<string, string[]> {
  const groups: Record<string, string[]> = {};
  for (const s of subs) {
    const key = s.platform === "android_apk" ? "android_apk" : "web_pwa";
    (groups[key] ||= []).push(s.onesignal_subscription_id);
  }
  return groups;
}
