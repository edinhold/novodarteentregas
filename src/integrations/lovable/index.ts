import { supabase } from "../supabase/client";

type SignInOptions = {
  redirect_uri?: string;
  extraParams?: Record<string, string>;
};

export const lovable = {
  auth: {
    signInWithOAuth: async (provider: "google" | "apple" | "microsoft" | "lovable", opts?: SignInOptions) => {
      try {
        const redirectTo = opts?.redirect_uri || window.location.origin;
        const targetProvider = (provider === "apple" ? "apple" : "google") as "google" | "apple";

        const { data, error } = await supabase.auth.signInWithOAuth({
          provider: targetProvider,
          options: {
            redirectTo,
            queryParams: opts?.extraParams,
          },
        });

        if (error) {
          console.warn("[Auth OAuth] Erro do Supabase Auth:", error.message);
          return { error };
        }

        if (data?.url) {
          window.location.href = data.url;
          return { redirected: true };
        }

        return { data };
      } catch (e) {
        console.error("[Auth OAuth] Falha ao iniciar OAuth:", e);
        return { error: e instanceof Error ? e : new Error(String(e)) };
      }
    },
  },
};

