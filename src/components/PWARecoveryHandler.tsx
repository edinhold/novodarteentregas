import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { resumeAudioContext } from "@/lib/notificationSound";

/**
 * Monitora eventos de ciclo de vida (visibilitychange, focus, online)
 * cruciais para o PWA no Safari iOS / WebKit.
 * Quando o iOS congela a aplicação em segundo plano e o motorista ou lojista retorna:
 * 1. Reconecta o WebSocket do Supabase Realtime (que o iOS suspende em background)
 * 2. Reativa o AudioContext para que alertas sonoros de novas entregas e pedidos continuem audíveis
 * 3. Invalida queries ativas no TanStack Query para atualizar a tela imediatamente
 * 4. Valida a sessão de autenticação evitando estado corrompido
 */
export const PWARecoveryHandler = () => {
  const queryClient = useQueryClient();

  useEffect(() => {
    let lastRecoveryTs = 0;

    const recover = async () => {
      const now = Date.now();
      // Throttle de 2 segundos para evitar rajada de eventos simultâneos (focus + visibilitychange)
      if (now - lastRecoveryTs < 2000) return;
      lastRecoveryTs = now;

      console.log("[PWA:Recovery] Retomando aplicação do segundo plano (Safari/PWA)");

      // 1. Reconectar Realtime
      try {
        if (supabase.realtime && typeof (supabase.realtime as any).connect === "function") {
          supabase.realtime.connect();
        }
      } catch (err) {
        console.warn("[PWA:Recovery] Erro ao reconectar Realtime:", err);
      }

      // 2. Despertar AudioContext
      try {
        resumeAudioContext();
      } catch {}

      // 3. Atualizar queries ativas do React Query
      try {
        queryClient.invalidateQueries({ refetchType: "active" });
      } catch (err) {
        console.warn("[PWA:Recovery] Erro ao invalidar queries:", err);
      }

      // 4. Checar integridade da sessão auth
      try {
        await supabase.auth.getSession();
      } catch (err) {
        console.warn("[PWA:Recovery] Erro ao verificar sessão:", err);
      }
    };

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        recover();
      }
    };

    const handleOnline = () => {
      recover();
    };

    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("focus", recover);
    window.addEventListener("online", handleOnline);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("focus", recover);
      window.removeEventListener("online", handleOnline);
    };
  }, [queryClient]);

  return null;
};

export default PWARecoveryHandler;
