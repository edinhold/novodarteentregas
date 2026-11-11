/**
 * Utilitário para envio seguro de notificações no navegador em Desktop, Android e Safari iOS PWA.
 * Em navegadores mobile (Safari iOS Standalone e Chrome Android), instanciar `new Notification()` diretamente
 * no contexto da janela dispara exceção TypeError (Illegal constructor).
 * Este helper utiliza ServiceWorkerRegistration.showNotification() quando disponível,
 * prevenindo erros não tratados que travariam a aplicação ou os canais Realtime.
 */
export async function showSafeNotification(
  title: string,
  options?: NotificationOptions
): Promise<boolean> {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return false;
  }

  try {
    if (Notification.permission !== "granted") {
      return false;
    }

    // 1. Tentar exibir via Service Worker Registration (padrão suportado em iOS Safari PWA e Android)
    if ("serviceWorker" in navigator) {
      try {
        const reg = await navigator.serviceWorker.ready;
        if (reg && typeof reg.showNotification === "function") {
          await reg.showNotification(title, options);
          return true;
        }
      } catch (swErr) {
        console.warn("[SafeNotification] ServiceWorker showNotification falhou, tentando fallback:", swErr);
      }
    }

    // 2. Fallback para construtor nativo window.Notification (desktop Chrome/Safari/Firefox)
    try {
      new Notification(title, options);
      return true;
    } catch (ctorErr) {
      console.warn("[SafeNotification] Construtor window.Notification não suportado no contexto mobile:", ctorErr);
      return false;
    }
  } catch (err) {
    console.warn("[SafeNotification] Erro geral ao disparar notificação:", err);
    return false;
  }
}
