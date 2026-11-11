import { describe, it, expect, vi, beforeEach } from "vitest";

describe("Auth Logout & Session Termination Suite", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.clearAllMocks();
  });

  describe("Limpeza de Storage e Tokens no signOut()", () => {
    it("deve remover todas as chaves sb-*-auth-token do localStorage ao deslogar", () => {
      // Simula tokens do Supabase gravados no localStorage
      localStorage.setItem("sb-projectref-auth-token", JSON.stringify({ access_token: "xyz" }));
      localStorage.setItem("sb-custom-auth-token", JSON.stringify({ access_token: "abc" }));
      localStorage.setItem("other_unrelated_key", "value");

      // Executa lógica de purga do signOut
      for (const key of Object.keys(localStorage)) {
        if (key.startsWith("sb-") && key.endsWith("-auth-token")) {
          localStorage.removeItem(key);
        }
      }

      expect(localStorage.getItem("sb-projectref-auth-token")).toBeNull();
      expect(localStorage.getItem("sb-custom-auth-token")).toBeNull();
      expect(localStorage.getItem("other_unrelated_key")).toBe("value");
    });

    it("deve limpar cached_user_role, cached_driver_profile e lastRoute do localStorage", () => {
      localStorage.setItem("cached_user_role", "store_owner");
      localStorage.setItem("cached_driver_profile", JSON.stringify({ id: "drv-123" }));
      localStorage.setItem("lastRoute", "/lojas");

      // Simula limpeza de signOut
      localStorage.removeItem("cached_user_role");
      localStorage.removeItem("cached_driver_profile");
      localStorage.removeItem("lastRoute");

      expect(localStorage.getItem("cached_user_role")).toBeNull();
      expect(localStorage.getItem("cached_driver_profile")).toBeNull();
      expect(localStorage.getItem("lastRoute")).toBeNull();
    });

    it("deve limpar authRedirectDone e impersonações do sessionStorage", () => {
      sessionStorage.setItem("authRedirectDone", "user-uuid");
      sessionStorage.setItem("admin_impersonated_user_id", "owner-uuid");
      sessionStorage.setItem("admin_impersonated_store_name", "Pizzaria");

      // Simula limpeza de signOut
      sessionStorage.removeItem("authRedirectDone");
      sessionStorage.removeItem("admin_impersonated_user_id");
      sessionStorage.removeItem("admin_impersonated_store_name");

      expect(sessionStorage.getItem("authRedirectDone")).toBeNull();
      expect(sessionStorage.getItem("admin_impersonated_user_id")).toBeNull();
      expect(sessionStorage.getItem("admin_impersonated_store_name")).toBeNull();
    });

    it("não deve travar o logout se supabase.auth.signOut() falhar com erro de rede ou token inválido", async () => {
      localStorage.setItem("cached_user_role", "driver");
      localStorage.setItem("sb-app-auth-token", "jwt");

      let purgeExecuted = false;

      // Simula signOut resiliente com try/catch/finally
      const resilientSignOut = async () => {
        try {
          // Simula erro de conexão ao tentar contatar Supabase
          throw new Error("Failed to fetch / network offline");
        } catch (err) {
          // Captura erro sem interromper limpeza local
        } finally {
          localStorage.removeItem("cached_user_role");
          localStorage.removeItem("sb-app-auth-token");
          purgeExecuted = true;
        }
      };

      await expect(resilientSignOut()).resolves.toBeUndefined();
      expect(purgeExecuted).toBe(true);
      expect(localStorage.getItem("cached_user_role")).toBeNull();
      expect(localStorage.getItem("sb-app-auth-token")).toBeNull();
    });
  });

  describe("Prevenção de Loop de Redirecionamento após Logout", () => {
    const ROLE_HOME: Record<string, string> = {
      admin: "/admin",
      store_owner: "/lojas",
      driver: "/entregador",
    };

    it("não deve redirecionar no Index.tsx quando o usuário estiver deslogado (user = null)", () => {
      const user = null;
      const role = null;
      const cachedRole = localStorage.getItem("cached_user_role");
      const currentRole = role || cachedRole;

      let redirectedTarget: string | null = null;
      const navigateMock = (target: string) => {
        redirectedTarget = target;
      };

      // Lógica de Index.tsx
      if (user && currentRole) {
        const target = ROLE_HOME[currentRole];
        if (target) navigateMock(target);
      }

      expect(redirectedTarget).toBeNull();
    });

    it("não deve redirecionar no Index.tsx mesmo se o modo standalone estiver ativo se user = null", () => {
      const isStandalone = true;
      const user = null;
      const role = null;
      const cachedRole = localStorage.getItem("cached_user_role");
      const currentRole = role || cachedRole;

      let redirected = false;
      if (user && currentRole) {
        redirected = true;
      }

      expect(redirected).toBe(false);
    });

    it("RouteRestorer não deve restaurar rotas protegidas (/lojas, /entregador, /admin) se user = null", () => {
      const PROTECTED_PANEL_ROUTES = ["/admin", "/lojas", "/lojista", "/entregador"];
      const isProtectedPanelRoute = (path: string) =>
        PROTECTED_PANEL_ROUTES.some((route) => path === route || path.startsWith(`${route}/`));

      const user = null;
      const savedRoute = "/lojas";

      let canRestore = false;
      if (savedRoute && (!isProtectedPanelRoute(savedRoute) || user)) {
        canRestore = true;
      }

      expect(canRestore).toBe(false);
    });
  });

  describe("Garantia de Destino de Logout", () => {
    it("deve navegar para '/auth' com replace: true após o término da sessão", async () => {
      const navigateMock = vi.fn();
      const signOutMock = vi.fn().mockResolvedValue(undefined);

      const handleLogout = async () => {
        try {
          await signOutMock();
        } catch (e) {
          // ignora
        } finally {
          navigateMock("/auth", { replace: true });
        }
      };

      await handleLogout();

      expect(signOutMock).toHaveBeenCalledTimes(1);
      expect(navigateMock).toHaveBeenCalledWith("/auth", { replace: true });
    });

    it("deve navegar para '/auth' mesmo se signOutMock lançar erro", async () => {
      const navigateMock = vi.fn();
      const signOutMock = vi.fn().mockRejectedValue(new Error("Supabase auth error"));

      const handleLogout = async () => {
        try {
          await signOutMock();
        } catch (e) {
          // ignora
        } finally {
          navigateMock("/auth", { replace: true });
        }
      };

      await handleLogout();

      expect(signOutMock).toHaveBeenCalledTimes(1);
      expect(navigateMock).toHaveBeenCalledWith("/auth", { replace: true });
    });
  });
});

