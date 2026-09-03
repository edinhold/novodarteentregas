import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

const STORAGE_KEY = "lastRoute";

// Routes that should NOT be saved/restored (auth flows, etc.)
const EXCLUDED_ROUTES = ["/auth", "/admin/login", "/cadastro/entregador", "/cadastro/lojista"];
const PROTECTED_PANEL_ROUTES = ["/admin", "/lojista", "/entregador"];

const isExcludedRoute = (path: string) =>
  EXCLUDED_ROUTES.some((route) => path === route || path.startsWith(`${route}/`));

const isProtectedPanelRoute = (path: string) =>
  PROTECTED_PANEL_ROUTES.some((route) => path === route || path.startsWith(`${route}/`));

// Module-level flag: the saved route may only be restored ONCE per page load.
// Without it, any remount of the component (or a later auth event) re-navigates
// and fights with the role-based redirect, producing an infinite loop.
let restoreAttempted = false;

const RouteRestorer = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, loading } = useAuth();

  // Save current route on every navigation
  useEffect(() => {
    const path = location.pathname + location.search;
    if (!isExcludedRoute(location.pathname) && (!isProtectedPanelRoute(location.pathname) || user)) {
      localStorage.setItem(STORAGE_KEY, path);
    }
  }, [location, user]);

  // On first mount, restore saved route (only once, after auth finished loading)
  useEffect(() => {
    if (loading) return;
    if (restoreAttempted) return;
    restoreAttempted = true;
    if (isExcludedRoute(location.pathname)) return;

    const saved = localStorage.getItem(STORAGE_KEY);
    if (
      saved &&
      saved !== "/" &&
      saved !== location.pathname &&
      !isExcludedRoute(saved) &&
      (!isProtectedPanelRoute(saved) || user)
    ) {
      console.log("[Auth] Redirect:", saved);
      navigate(saved, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);


  return null;
};

export default RouteRestorer;
