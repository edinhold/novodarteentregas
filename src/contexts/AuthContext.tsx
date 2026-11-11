import React, { createContext, useContext, useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";

export type AppRole = "admin" | "store_owner" | "driver" | "customer";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  role: AppRole | null;
  roleLoading: boolean;
  signOut: () => Promise<void>;
  refreshRole: () => Promise<AppRole>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Recupera imediatamente a sessão salva em localStorage para evitar flash/loops de verificação
const getInitialSession = (): { session: Session | null; user: User | null } => {
  if (typeof window === "undefined") return { session: null, user: null };
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith("sb-") && key.endsWith("-auth-token")) {
        const raw = localStorage.getItem(key);
        if (raw) {
          const parsed = JSON.parse(raw);
          const s = parsed.currentSession || parsed;
          if (s && s.user) {
            return { session: s, user: s.user };
          }
        }
      }
    }
  } catch {}
  return { session: null, user: null };
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const initialRef = useRef(getInitialSession());
  const [user, setUser] = useState<User | null>(() => initialRef.current.user);
  const [session, setSession] = useState<Session | null>(() => initialRef.current.session);
  const [loading, setLoading] = useState(() => !initialRef.current.user);
  const [role, setRole] = useState<AppRole | null>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("cached_user_role");
      if (saved) return saved as AppRole;
    }
    return null;
  });
  const [roleLoading, setRoleLoading] = useState(false);
  // Guards against double initialization (React StrictMode / remounts):
  // only ONE getSession() + ONE onAuthStateChange listener may exist.
  const initializedRef = useRef(false);

  const resolveRole = async (uid: string): Promise<AppRole> => {
    try {
      const { data: roles } = await (supabase as any)
        .from("user_roles")
        .select("role")
        .eq("user_id", uid);
      const list: string[] = Array.isArray(roles) ? roles.map((r: any) => String(r.role)) : [];
      if (list.includes("admin")) return "admin";
      if (list.includes("store_owner")) return "store_owner";
      if (list.includes("driver")) return "driver";

      // Fallback: infer from associated data (legacy accounts without a row in user_roles)
      const [{ data: driverProfiles }, { data: ownedRests }] = await Promise.all([
        supabase.from("drivers").select("id").or(`user_id.eq.${uid},id.eq.${uid}`).limit(1),
        supabase.from("restaurants").select("id").eq("owner_id", uid).limit(1),
      ]);

      const driverProfile = driverProfiles && driverProfiles[0];
      const ownedRest = ownedRests && ownedRests[0];

      if (driverProfile) {
        await supabase.from("user_roles").upsert({ user_id: uid, role: "driver" as any }, { onConflict: "user_id,role" }).then(() => {}, () => {});
        return "driver";
      }
      if (ownedRest) {
        await supabase.from("user_roles").upsert({ user_id: uid, role: "store_owner" as any }, { onConflict: "user_id,role" }).then(() => {}, () => {});
        return "store_owner";
      }
    } catch (err) {
      console.warn("[Auth] Erro na resolução de role:", err);
    }
    return "customer";
  };

  const refreshRole = async (): Promise<AppRole> => {
    if (!user?.id) {
      setRole(null);
      return "customer";
    }
    setRoleLoading(true);
    try {
      const resolved = await resolveRole(user.id);
      console.log("[Auth] Role atualizada:", resolved);
      setRole(resolved);
      return resolved;
    } catch (err) {
      console.error("[Auth] Erro em refreshRole:", err);
      return role || "customer";
    } finally {
      setRoleLoading(false);
    }
  };

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    console.log("[Auth] App iniciou");

    let lastUid: string | null | undefined = undefined;
    let lastToken: string | null | undefined = undefined;
    let handled = false;

    const handleUser = async (uid: string | undefined) => {
      if (!uid) {
        setRole(null);
        setRoleLoading(false);
        try { localStorage.removeItem("cached_user_role"); } catch {}
        return;
      }
      setRoleLoading(true);
      try {
        const resolved = await resolveRole(uid);
        console.log("[Auth] Role carregada:", resolved);
        setRole(resolved);
        try { localStorage.setItem("cached_user_role", resolved); } catch {}
      } catch (err) {
        console.error("[Auth] Erro em handleUser:", err);
      } finally {
        setRoleLoading(false);
      }
    };

    const apply = (nextSession: Session | null, source: string) => {
      const uid = nextSession?.user?.id ?? null;
      const token = nextSession?.access_token ?? null;
      const sameUser = uid === lastUid;
      const sameToken = token === lastToken;

      if (!handled) {
        handled = true;
        setSession(nextSession);
        setUser(nextSession?.user ?? null);
        setLoading(false);
        lastUid = uid;
        lastToken = token;
        console.log("[Auth] Sessão inicial", { source, uid });
        handleUser(uid ?? undefined);
        return;
      }

      if (sameUser && sameToken) {
        return;
      }

      setSession(nextSession);
      if (!sameUser) {
        setUser(nextSession?.user ?? null);
        console.log("[Auth] Sessão alterada", { source, uid });
        handleUser(uid ?? undefined);
      }
      lastUid = uid;
      lastToken = token;
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      console.log("[Auth] onAuthStateChange:", event);
      apply(session, `event:${event}`);
    });
    console.log("[Auth] Listener registrado");

    console.log("[Auth] Recuperando sessão");
    const sessionTimeout = setTimeout(() => {
      if (!handled) {
        console.warn("[Auth] getSession timeout (2.5s), forçando inicialização da aplicação...");
        apply(initialRef.current.session, "timeout");
      }
    }, 2500);

    supabase.auth.getSession()
      .then(({ data: { session } }) => {
        clearTimeout(sessionTimeout);
        apply(session, "getSession");
      })
      .catch((err) => {
        clearTimeout(sessionTimeout);
        console.error("[Auth] getSession error:", err);
        apply(null, "error");
      });

    return () => {
      subscription.unsubscribe();
      console.log("[Auth] Listener removido");
    };
  }, []);

  const signOut = async () => {
    try {
      sessionStorage.removeItem("authRedirectDone");
      sessionStorage.removeItem("admin_impersonated_user_id");
      sessionStorage.removeItem("admin_impersonated_store_name");
      localStorage.removeItem("cached_user_role");
      localStorage.removeItem("cached_driver_profile");
      localStorage.removeItem("lastRoute");
      // Remove todas as chaves de autenticação do Supabase de forma imediata e síncrona
      Object.keys(localStorage).forEach((key) => {
        if (key.startsWith("sb-") && key.endsWith("-auth-token")) {
          localStorage.removeItem(key);
        }
      });
    } catch {}

    setUser(null);
    setSession(null);
    setRole(null);
    setRoleLoading(false);

    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.warn("[Auth] Erro ao deslogar no servidor Supabase:", err);
    } finally {
      // Limpeza forçada de qualquer chave residual do Supabase
      try {
        Object.keys(localStorage).forEach((key) => {
          if (key.startsWith("sb-")) {
            localStorage.removeItem(key);
          }
        });
      } catch {}
    }
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, role, roleLoading, signOut, refreshRole }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
};
