import { supabase } from "../supabase/client";

type SignInOptions = {
  redirect_uri?: string;
  extraParams?: Record<string, string>;
};

export const lovable = {
  auth: {
    signInWithOAuth: async (
      provider: "google" | "apple" | "microsoft" | "lovable",
      opts?: SignInOptions
    ) => {
      // Open popup synchronously during user gesture to prevent browser popup blocker from blocking it
      let popup: Window | null = null;
      try {
        popup = window.open(
          "about:blank",
          "oauth_popup",
          "width=540,height=680,left=200,top=100,toolbar=no,menubar=no,status=no"
        );
      } catch {
        // Popup blocker or permission issue
      }

      try {
        const redirectTo = opts?.redirect_uri || window.location.origin;
        const targetProvider = (provider === "apple" ? "apple" : "google") as "google" | "apple";

        const { data, error } = await supabase.auth.signInWithOAuth({
          provider: targetProvider,
          options: {
            redirectTo,
            queryParams: opts?.extraParams,
            skipBrowserRedirect: true,
          },
        });

        if (error) {
          if (popup && !popup.closed) popup.close();
          console.warn("[Auth OAuth] Erro do Supabase Auth:", error.message);
          return { error };
        }

        if (!data?.url) {
          if (popup && !popup.closed) popup.close();
          return { error: new Error("URL de autorização não retornada pelo Supabase.") };
        }

        if (popup && !popup.closed) {
          popup.location.href = data.url;
          return { data, popup: true };
        } else {
          window.location.href = data.url;
          return { redirected: true };
        }
      } catch (e) {
        if (popup && !popup.closed) popup.close();
        console.error("[Auth OAuth] Falha ao iniciar OAuth:", e);
        return { error: e instanceof Error ? e : new Error(String(e)) };
      }
    },
  },
};

