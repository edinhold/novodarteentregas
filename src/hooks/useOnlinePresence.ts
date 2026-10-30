import { useEffect, useState } from "react";
import { supabase, createFreshChannel } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Tracks the current user as online in a shared Realtime presence channel
 * and exposes the set of every user_id currently online (any role).
 */
export function useOnlinePresence(role?: "driver" | "store_owner" | "admin" | "customer") {
  const { user } = useAuth();
  const userId = user?.id;
  const [onlineIds, setOnlineIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!userId) return;
    const channel = createFreshChannel(
      "global-presence",
      { config: { presence: { key: userId } } },
      true
    );

    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState() as Record<string, any[]>;
        setOnlineIds(new Set(Object.keys(state)));
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({ user_id: userId, role: role || "user", at: Date.now() });
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, role]);

  return { onlineIds, isOnline: (id?: string | null) => !!id && onlineIds.has(id) };
}
