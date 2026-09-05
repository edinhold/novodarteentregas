// OneSignal Web SDK v16 service worker com suporte a áudio e tela desligada
importScripts("https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js");

// Manipulador de evento de push para exibição em segundo plano e tela desligada
self.addEventListener("push", function (event) {
  if (!event.data) return;

  try {
    const payload = event.data.json();
    const notification = payload.notification || payload;
    const title = notification.title || notification.headings?.pt || "🚚 Nova entrega disponível!";
    const body = notification.body || notification.contents?.pt || "Um lojista solicitou um motorista. Toque para visualizar.";
    const data = notification.data || payload.custom?.a || {};

    const options = {
      body: body,
      icon: "/pwa-192x192.png",
      badge: "/pwa-192x192.png",
      vibrate: [500, 200, 500, 200, 500, 200, 1000],
      tag: data.pedido_id ? `entrega-${data.pedido_id}` : "nova-entrega",
      renotify: true,
      requireInteraction: true, // Mantém o alerta ativo até o motorista tocar
      data: data,
      actions: [
        { action: "open", title: "Ver entrega 🚚" }
      ]
    };

    event.waitUntil(
      self.registration.showNotification(title, options)
    );
  } catch (err) {
    console.warn("[OneSignalSDKWorker] Erro no push background:", err);
  }
});

// Clique na notificação abre ou foca no painel do motorista
self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  const data = event.notification.data || {};
  const targetUrl = data.url || data.rota || "/entregador";

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (clientList) {
      for (let i = 0; i < clientList.length; i++) {
        const client = clientList[i];
        if (client.url.includes("/entregador") && "focus" in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
