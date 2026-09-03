import { useCallback, useEffect, useState } from "react";
import { enablePush, initPush, syncCurrentSubscription, type PushState } from "@/lib/push";

export function usePushNotifications(userId?: string | null, profileType = "driver") {
  const [state, setState] = useState<PushState | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    (async () => {
      await initPush();
      const s = await syncCurrentSubscription(userId, profileType);
      if (!cancelled) setState(s);
    })();
    return () => { cancelled = true; };
  }, [userId, profileType]);

  const activate = useCallback(async () => {
    if (!userId) return null;
    setLoading(true);
    try {
      const s = await enablePush(userId, profileType);
      setState(s);
      return s;
    } finally {
      setLoading(false);
    }
  }, [userId, profileType]);

  return { state, loading, activate };
}
