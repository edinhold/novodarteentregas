import { useState } from "react";
import logoDuarte from "@/assets/logo-duarte.jpeg";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Mail, Lock, ArrowLeft } from "lucide-react";
import { motion } from "framer-motion";

const Auth = () => {
  const navigate = useNavigate();
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (isLogin) {
        const { data: loginData, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Login realizado com sucesso!");
        
        // Check user role and redirect accordingly
        if (loginData.user) {
          const uid = loginData.user.id;
          const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", uid);
          const userRoles = roles?.map(r => r.role) || [];

          let targetPath = "/";
          if (userRoles.includes("admin")) {
            targetPath = "/admin";
          } else if (userRoles.includes("store_owner")) {
            targetPath = "/lojista";
          } else if (userRoles.includes("driver")) {
            targetPath = "/entregador";
          } else {
            // Fallback: detect by associated data (driver profile or owned restaurant)
            const [{ data: driverProfile }, { data: ownedRest }] = await Promise.all([
              supabase.from("drivers").select("id").eq("user_id", uid).maybeSingle(),
              supabase.from("restaurants").select("id").eq("owner_id", uid).maybeSingle(),
            ]);
            if (driverProfile) {
              targetPath = "/entregador";
              await supabase.from("user_roles").insert({ user_id: uid, role: "driver" as any }).then(() => {}, () => {});
            } else if (ownedRest) {
              targetPath = "/lojista";
              await supabase.from("user_roles").insert({ user_id: uid, role: "store_owner" as any }).then(() => {}, () => {});
            }
          }

          localStorage.setItem("lastRoute", targetPath);
          // Marca o redirect como já efetuado para esta sessão, evitando um
          // segundo redirect automático na home (loop de navegação).
          try { sessionStorage.setItem("authRedirectDone", uid); } catch {}
          console.log("[Auth] Redirect:", targetPath);
          navigate(targetPath, { replace: true });

        } else {
          navigate("/");
        }
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: fullName },
            emailRedirectTo: window.location.origin,
          },
        });
        if (error) throw error;
        toast.success("Cadastro realizado com sucesso!");
        navigate("/");
      }
    } catch (error: any) {
      toast.error(error.message || "Erro na autenticação");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    const { error } = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (error) toast.error("Erro ao conectar com Google");
  };

  const handleAppleLogin = async () => {
    const { error } = await lovable.auth.signInWithOAuth("apple", {
      redirect_uri: window.location.origin,
    });
    if (error) toast.error("Erro ao conectar com Apple");
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <div className="bg-primary text-primary-foreground px-4 pt-10 pb-16 rounded-b-3xl">
        <button onClick={() => navigate("/")} className="mb-4">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <img src={logoDuarte} alt="Duarte Delivery" className="h-12 object-contain" />
        <p className="text-primary-foreground/80 mt-1">
          {isLogin ? "Entre na sua conta" : "Crie sua conta"}
        </p>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="px-4 -mt-8 max-w-md mx-auto w-full"
      >
        <div className="bg-card rounded-2xl p-6 shadow-lg border border-border/50">
          {/* Social logins */}
          <div className="space-y-3 mb-6">
            <Button
              variant="outline"
              className="w-full rounded-xl h-12 font-semibold"
              onClick={handleGoogleLogin}
            >
              <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
              Continuar com Google
            </Button>
            <Button
              variant="outline"
              className="w-full rounded-xl h-12 font-semibold"
              onClick={handleAppleLogin}
            >
              <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
              </svg>
              Continuar com Apple
            </Button>
          </div>

          <div className="flex items-center gap-3 mb-6">
            <div className="flex-1 h-px bg-border" />
            <span className="text-xs text-muted-foreground">ou</span>
            <div className="flex-1 h-px bg-border" />
          </div>

          {/* Email form */}
          <form onSubmit={handleEmailAuth} className="space-y-4">
            {!isLogin && (
              <div className="space-y-2">
                <Label htmlFor="name">Nome completo</Label>
                <Input
                  id="name"
                  placeholder="Seu nome"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="rounded-xl h-11"
                  required={!isLogin}
                />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="email">E-mail</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  placeholder="seu@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-10 rounded-xl h-11"
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-10 rounded-xl h-11"
                  required
                  minLength={6}
                />
              </div>
            </div>
            <Button type="submit" className="w-full rounded-xl h-12 font-bold text-base" disabled={loading}>
              {loading ? "Carregando..." : isLogin ? "Entrar" : "Cadastrar"}
            </Button>
          </form>

          <p className="text-center text-sm text-muted-foreground mt-4">
            {isLogin ? "Não tem conta?" : "Já tem conta?"}{" "}
            <button onClick={() => setIsLogin(!isLogin)} className="text-primary font-semibold">
              {isLogin ? "Cadastre-se" : "Faça login"}
            </button>
          </p>

          {/* Registration type links */}
          <div className="mt-6 pt-4 border-t border-border">
            <p className="text-sm text-muted-foreground text-center mb-3">Cadastre-se como:</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => navigate("/cadastro/entregador")}
                className="flex flex-col items-center gap-1 p-3 rounded-xl border border-border hover:bg-accent transition-colors"
              >
                <span className="text-2xl">🏍️</span>
                <span className="text-xs font-medium text-foreground">Entregador</span>
              </button>
              <button
                onClick={() => navigate("/cadastro/lojista")}
                className="flex flex-col items-center gap-1 p-3 rounded-xl border border-border hover:bg-accent transition-colors"
              >
                <span className="text-2xl">🏪</span>
                <span className="text-xs font-medium text-foreground">Lojista</span>
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default Auth;
