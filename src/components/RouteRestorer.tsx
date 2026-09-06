import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

const STORAGE_KEY = "lastRoute";

// Routes that should NOT be saved/restored (auth flows, etc.)
const EXCLUDED_ROUTES = ["/auth", "/admin/login", "/cadastro/entregador", "/cadastro/lojas", "/cadastro/lojista"];
const PROTECTED_PANEL_ROUTES = ["/admin", "/lojas", "/lojista", "/entregador"];

const isExcludedRoute = (path: string) =>
  EXCLUDED_ROUTES.some((route) => path === route || path.startsWith(`${route}/`));

const isProtectedPanelRoute = (path: string) =>
  PROTECTED_PANEL_ROUTES.some((route) => path === route || path.startsWith(`${route}/`));

const isAuthorizedRoute = (path: string, userRole: string | null): boolean => {
  if (path.startsWith("/admin")) return userRole === "admin";
  if (path.startsWith("/lojas") || path.startsWith("/lojista")) return userRole === "store_owner" || userRole === "admin";
  if (path.startsWith("/entregador")) return userRole === "driver" || userRole === "admin";
  return true;
};

// Module-level flag: the saved route may only be restored ONCE per page load.
let restoreAttempted = false;

const RouteRestorer = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, role, loading, roleLoading } = useAuth();

  // Save current route on every navigation
  useEffect(() => {
    const path = location.pathname + location.search;
    if (!isExcludedRoute(location.pathname) && (!isProtectedPanelRoute(location.pathname) || user)) {
      try {
        localStorage.setItem(STORAGE_KEY, path);
      } catch (err) {
        console.warn("[RouteRestorer] Failed to save route to localStorage:", err);
      }
    }
  }, [location, user]);

  // On first mount, restore saved route (only once, after auth & role finished loading)
  useEffect(() => {
    if (loading || roleLoading) return;
    if (restoreAttempted) return;
    restoreAttempted = true;
    if (isExcludedRoute(location.pathname)) return;

    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (
        saved &&
        saved !== "/" &&
        saved !== location.pathname &&
        !isExcludedRoute(saved) &&
        (!isProtectedPanelRoute(saved) || user) &&
        isAuthorizedRoute(saved, role)
      ) {
        console.log("[Auth] RouteRestorer redirect:", saved);
        navigate(saved, { replace: true });
      }
    } catch (err) {
      console.warn("[RouteRestorer] Failed to read route from localStorage:", err);
    }
  }, [loading, roleLoading, user, role, location.pathname, navigate]);

  return null;
};

export default RouteRestorer;
