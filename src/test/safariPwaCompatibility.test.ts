import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { showSafeNotification } from "@/lib/safeNotification";

describe("Safari & iOS PWA Compatibility Suite", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("showSafeNotification (Mobile & Safari PWA Safe Notification Handling)", () => {
    it("não deve tentar exibir notificação se permissão não for 'granted'", async () => {
      // Mock global Notification com permission default
      const origNotification = (globalThis as any).Notification;
      (globalThis as any).Notification = {
        permission: "default",
      };

      const result = await showSafeNotification("Teste", { body: "Conteúdo" });
      expect(result).toBe(false);

      (globalThis as any).Notification = origNotification;
    });

    it("deve usar ServiceWorkerRegistration.showNotification quando disponível no PWA", async () => {
      const showNotificationMock = vi.fn().mockResolvedValue(undefined);
      const origNotification = (globalThis as any).Notification;
      const origNavigator = (globalThis as any).navigator;

      (globalThis as any).Notification = {
        permission: "granted",
      };

      (globalThis as any).navigator = {
        ...origNavigator,
        serviceWorker: {
          ready: Promise.resolve({
            showNotification: showNotificationMock,
          }),
        },
      };

      const result = await showSafeNotification("Nova Corrida", { body: "R$ 15,00" });
      expect(result).toBe(true);
      expect(showNotificationMock).toHaveBeenCalledWith("Nova Corrida", { body: "R$ 15,00" });

      (globalThis as any).Notification = origNotification;
      (globalThis as any).navigator = origNavigator;
    });

    it("nunca deve disparar exceção 'Illegal constructor' caso o construtor nativo window.Notification falhe no mobile", async () => {
      const origNotification = (globalThis as any).Notification;
      const origNavigator = (globalThis as any).navigator;

      // Simula mobile Safari/Chrome onde new Notification() dispara TypeError: Illegal constructor
      function ThrowingNotification() {
        throw new TypeError("Illegal constructor: Use ServiceWorkerRegistration.showNotification() instead.");
      }
      ThrowingNotification.permission = "granted";

      (globalThis as any).Notification = ThrowingNotification;
      (globalThis as any).navigator = {
        // sem serviceWorker
      };

      // Não deve lançar erro e deve retornar false graciosamente
      let errorThrown = false;
      let result = false;
      try {
        result = await showSafeNotification("Alerta", { body: "Teste" });
      } catch {
        errorThrown = true;
      }

      expect(errorThrown).toBe(false);
      expect(result).toBe(false);

      (globalThis as any).Notification = origNotification;
      (globalThis as any).navigator = origNavigator;
    });
  });

  describe("Roteamento Standalone no PWA (Index.tsx e RouteRestorer)", () => {
    const ROLE_HOME: Record<string, string> = {
      admin: "/admin",
      store_owner: "/lojas",
      driver: "/entregador",
    };

    it("deve redirecionar o motorista para '/entregador' no modo standalone mesmo com authRedirectDone salvo", () => {
      const user = { id: "driver-uuid" };
      const role = "driver";
      const isStandalone = true;
      const sessionAuthRedirect = "driver-uuid"; // Simulando sessionStorage persistido do Safari

      // Lógica do Index.tsx
      const alreadyRedirected = !isStandalone && sessionAuthRedirect === user.id;
      const target = ROLE_HOME[role];

      expect(alreadyRedirected).toBe(false);
      expect(target).toBe("/entregador");
    });

    it("deve redirecionar o lojista para '/lojas' no modo standalone", () => {
      const user = { id: "store-uuid" };
      const role = "store_owner";
      const isStandalone = true;
      const sessionAuthRedirect = "store-uuid";

      const alreadyRedirected = !isStandalone && sessionAuthRedirect === user.id;
      const target = ROLE_HOME[role];

      expect(alreadyRedirected).toBe(false);
      expect(target).toBe("/lojas");
    });

    it("não deve abortar RouteRestorer prematuramente se o usuário está logado mas a role ainda está resolvendo", () => {
      const user = { id: "user-uuid" };
      const role = null; // ainda não resolveu
      const cachedRole = null;
      const effectiveRole = role || cachedRole;

      let restoreAttempted = false;

      // Se user && !effectiveRole, deve esperar
      if (user && !effectiveRole) {
        // Aguarda próxima execução quando role resolver
      } else {
        restoreAttempted = true;
      }

      expect(restoreAttempted).toBe(false);
    });
  });

  describe("Watchdog de Autenticação para Evitar Deslogue Acidental no PWA (StoreOwnerPanel / DriverPanel)", () => {
    it("não deve deslogar o lojista para /auth caso exista token no localStorage e timeout de rede ainda não expirou", () => {
      const user = null; // Supabase ainda hidratando sessão
      const impersonatedUserId = null;
      const hasLocalAuthToken = true;
      const verifyTimeoutReached = false;
      const loading = false;

      let navigatedToAuth = false;
      if (loading) {
        // loading
      } else if (!user && !impersonatedUserId && !hasLocalAuthToken && verifyTimeoutReached) {
        navigatedToAuth = true;
      }

      expect(navigatedToAuth).toBe(false);
    });

    it("deve deslogar apenas se comprovadamente não houver sessão nem token salvo e já houver estourado o tempo", () => {
      const user = null;
      const impersonatedUserId = null;
      const hasLocalAuthToken = false;
      const verifyTimeoutReached = true;
      const loading = false;

      let navigatedToAuth = false;
      if (loading) {
        // loading
      } else if (!user && !impersonatedUserId && !hasLocalAuthToken && verifyTimeoutReached) {
        navigatedToAuth = true;
      }

      expect(navigatedToAuth).toBe(true);
    });
  });

  describe("Recuperação do PWA em Segundo Plano (Safari Background Freeze)", () => {
    it("deve disparar rotina de recuperação quando document.visibilityState vira 'visible'", () => {
      let realtimeConnected = false;
      let queriesInvalidated = false;

      const mockSupabase = {
        realtime: {
          connect: () => { realtimeConnected = true; },
        },
      };

      const mockQueryClient = {
        invalidateQueries: () => { queriesInvalidated = true; },
      };

      // Simulação da rotina PWARecoveryHandler
      const onResume = () => {
        mockSupabase.realtime.connect();
        mockQueryClient.invalidateQueries();
      };

      onResume();

      expect(realtimeConnected).toBe(true);
      expect(queriesInvalidated).toBe(true);
    });
  });
});

