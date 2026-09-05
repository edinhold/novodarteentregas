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
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<AppRole | null>(null);
  const [roleLoading, setRoleLoading] = useState(false);
  // Guards against double initialization (React StrictMode / remounts):
  // only ONE getSession() + ONE onAuthStateChange listener may exist.
  const initializedRef = useRef(false);


  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    console.log("[Auth] App iniciou");

    // Track last processed uid + access token to avoid re-running side effects
    // for duplicate auth events (INITIAL_SESSION + SIGNED_IN + TOKEN_REFRESHED
    // all fire and each carries a fresh object reference, which was causing
    // downstream effects that depend on `user` to re-run in a loop).
    let lastUid: string | null | undefined = undefined;
    let lastToken: string | null | undefined = undefined;
    let handled = false;



    const enforceSuspension = async () => {
      try {
        const { data } = await (supabase as any).rpc("get_my_suspension");
        const row = Array.isArray(data) ? data[0] : data;
        if (row?.suspended_until && new Date(row.suspended_until).getTime() > Date.now()) {
          const until = new Date(row.suspended_until).toLocaleString("pt-BR");
          const reason = row.suspension_reason ? `\nMotivo: ${row.suspension_reason}` : "";
          alert(`Sua conta está suspensa até ${until}.${reason}`);
          await supabase.auth.signOut();
          return true;
        }
      } catch {}
      return false;
    };

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
        const [{ data: driverProfile }, { data: ownedRest }] = await Promise.all([
          supabase.from("drivers").select("id").eq("user_id", uid).maybeSingle(),
          supabase.from("restaurants").select("id").eq("owner_id", uid).maybeSingle(),
        ]);
        if (driverProfile) {
          await supabase.from("user_roles").insert({ user_id: uid, role: "driver" as any }).then(() => {}, () => {});
          return "driver";
        }
        if (ownedRest) {
          await supabase.from("user_roles").insert({ user_id: uid, role: "store_owner" as any }).then(() => {}, () => {});
          return "store_owner";
        }
      } catch {}
      return "customer";
    };

    const handleUser = async (uid: string | undefined) => {
      if (!uid) {
        setRole(null);
        setRoleLoading(false);
        return;
      }
      setRoleLoading(true);
      const suspended = await enforceSuspension();
      if (suspended) {
        setRole(null);
        setRoleLoading(false);
        return;
      }
      const resolved = await resolveRole(uid);
      console.log("[Auth] Role carregada:", resolved);
      setRole(resolved);
      setRoleLoading(false);
    };


    const apply = (nextSession: Session | null, source: string) => {
      const uid = nextSession?.user?.id ?? null;
      const token = nextSession?.access_token ?? null;
      const sameUser = uid === lastUid;
      const sameToken = token === lastToken;

      // Always clear loading on the first signal so UI doesn't hang.
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
        // Duplicate event (e.g. INITIAL_SESSION after getSession): skip.
        return;
      }

      setSession(nextSession);
      // Only swap the user object reference when the uid actually changes,
      // so downstream `useEffect([user])` doesn't re-fire on token refresh.
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
    supabase.auth.getSession().then(({ data: { session } }) => {
      apply(session, "getSession");
    });

    return () => {
      subscription.unsubscribe();
      console.log("[Auth] Listener removido");
    };
  }, []);



  const signOut = async () => {
    try { sessionStorage.removeItem("authRedirectDone"); } catch {}
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, role, roleLoading, signOut }}>

      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
};
