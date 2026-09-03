import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Tracks the current user as online in a shared Realtime presence channel
 * and exposes the set of every user_id currently online (any role).
 */
export function useOnlinePresence(role?: "driver" | "store_owner" | "admin" | "customer") {
  const { user } = useAuth();
  const [onlineIds, setOnlineIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!user) return;
    const channel = supabase.channel("global-presence", {
      config: { presence: { key: user.id } },
    });

    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState() as Record<string, any[]>;
        setOnlineIds(new Set(Object.keys(state)));
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({ user_id: user.id, role: role || "user", at: Date.now() });
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, role]);

  return { onlineIds, isOnline: (id?: string | null) => !!id && onlineIds.has(id) };
}
