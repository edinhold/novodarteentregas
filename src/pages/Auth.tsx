import { useState } from "react";
import logoDuarte from "@/assets/logo-duarte.jpeg";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Mail, Lock, ArrowLeft, KeyRound } from "lucide-react";
import { motion } from "framer-motion";

const Auth = () => {
  const navigate = useNavigate();
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);

  // Password recovery state
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [sendingForgot, setSendingForgot] = useState(false);

  const handlePostAuthRedirect = async (uid: string) => {
    try {
      const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", uid);
      const userRoles = roles?.map((r) => r.role) || [];

      let targetPath = "/";
      if (userRoles.includes("admin")) {
        targetPath = "/admin";
      } else if (userRoles.includes("store_owner")) {
        targetPath = "/lojas";
      } else if (userRoles.includes("driver")) {
        targetPath = "/entregador";
      } else {
        const [{ data: driverProfiles }, { data: ownedRests }] = await Promise.all([
          supabase.from("drivers").select("id").or(`user_id.eq.${uid},id.eq.${uid}`).limit(1),
          supabase.from("restaurants").select("id").eq("owner_id", uid).limit(1),
        ]);

        const driverProfile = driverProfiles && driverProfiles[0];
        const ownedRest = ownedRests && ownedRests[0];

        if (driverProfile) {
          targetPath = "/entregador";
          await supabase.from("user_roles").upsert({ user_id: uid, role: "driver" as any }, { onConflict: "user_id,role" }).then(() => {}, () => {});
        } else if (ownedRest) {
          targetPath = "/lojas";
          await supabase.from("user_roles").upsert({ user_id: uid, role: "store_owner" as any }, { onConflict: "user_id,role" }).then(() => {}, () => {});
        }
      }

      localStorage.setItem("lastRoute", targetPath);
      try { sessionStorage.setItem("authRedirectDone", uid); } catch {}
      console.log("[Auth] Redirecionamento pós-autenticação:", targetPath);
      navigate(targetPath, { replace: true });
    } catch (e) {
      console.warn("[Auth] Erro no redirecionamento pós-auth:", e);
      navigate("/", { replace: true });
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetEmail = (forgotEmail || email).trim().toLowerCase();
    if (!targetEmail) {
      toast.error("Informe o e-mail cadastrado.");
      return;
    }

    setSendingForgot(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(targetEmail, {
        redirectTo: `${window.location.origin}/auth`,
      });
      if (error) throw error;
      toast.success("E-mail de recuperação enviado! Verifique sua caixa de entrada e spam.");
      setShowForgotModal(false);
    } catch (err: any) {
      toast.error(err.message || "Não foi possível enviar o e-mail de recuperação.");
    } finally {
      setSendingForgot(false);
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const cleanEmail = email.trim().toLowerCase();

    try {
      if (isLogin) {
        let { data: loginData, error } = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password,
        });

        // Caso o usuário esteja com confirmação pendente no GoTrue, auto-confirmar e retentar
        if (error && /email not confirmed/i.test(error.message || "")) {
          try {
            await (supabase as any).rpc("confirm_user_email", { p_email: cleanEmail });
            const retryRes = await supabase.auth.signInWithPassword({
              email: cleanEmail,
              password,
            });
            if (!retryRes.error && retryRes.data?.user) {
              loginData = retryRes.data;
              error = null;
            }
          } catch {}
        }

        if (error) {
          const msg = error.message || "";
          if (/invalid login credentials|invalid credentials/i.test(msg)) {
            throw new Error("E-mail ou senha incorretos. Por favor, verifique seus dados.");
          }
          if (/email not confirmed/i.test(msg)) {
            throw new Error("Por favor, confirme seu e-mail antes de fazer login.");
          }
          if (/invalid email/i.test(msg)) {
            throw new Error("Informe um endereço de e-mail válido.");
          }
          throw error;
        }

        toast.success("Login realizado com sucesso!");
        if (loginData?.user) {
          await handlePostAuthRedirect(loginData.user.id);
        } else {
          navigate("/");
        }
      } else {
        // Fluxo de Cadastro de Cliente
        const doSignUp = async () => {
          const res = await supabase.auth.signUp({
            email: cleanEmail,
            password,
            options: {
              data: { full_name: fullName.trim() },
              emailRedirectTo: window.location.origin,
            },
          });
          if (res.error) throw res.error;
          return res.data;
        };

        let signUpData: any = null;
        try {
          signUpData = await doSignUp();
        } catch (signUpErr: any) {
          const isDuplicate = /already registered|user_already_exists|já cadastrado/i.test(signUpErr?.message || "");

          if (isDuplicate) {
            // 1. Tentar limpar cadastro órfão/incompleto para permitir cadastro novo
            let cleaned = false;
            try {
              const { data: cleanRes } = await supabase.functions.invoke("clean-orphan-signup", {
                body: { email: cleanEmail },
              });
              cleaned = !!cleanRes?.cleaned;
            } catch (cErr) {
              console.warn("[Auth] clean-orphan-signup fallback aviso:", cErr);
            }

            if (cleaned) {
              // Registro órfão limpo com sucesso! Tentar novamente o cadastro limpo
              signUpData = await doSignUp();
            } else {
              // 2. Se a conta já existe, tentar login imediato com a senha digitada
              let signInRes = await supabase.auth.signInWithPassword({
                email: cleanEmail,
                password,
              });

              if (signInRes.error && /email not confirmed/i.test(signInRes.error.message || "")) {
                try {
                  await (supabase as any).rpc("confirm_user_email", { p_email: cleanEmail });
                  signInRes = await supabase.auth.signInWithPassword({
                    email: cleanEmail,
                    password,
                  });
                } catch {}
              }

              if (signInRes.data?.user) {
                // A senha bate com a conta existente! Autentica diretamente e finaliza
                if (fullName.trim()) {
                  await supabase
                    .from("profiles")
                    .update({ full_name: fullName.trim() })
                    .eq("user_id", signInRes.data.user.id)
                    .then(() => {}, () => {});
                }
                toast.success("Conta já existente identificada! Login realizado com sucesso.");
                await handlePostAuthRedirect(signInRes.data.user.id);
                return;
              }

              // Senha diferente da cadastrada: direcionar amigavelmente para login
              setIsLogin(true);
              throw new Error("Este e-mail já possui cadastro no sistema. Insira sua senha para entrar ou clique em 'Esqueceu a senha?' para redefinir.");
            }
          } else {
            throw signUpErr;
          }
        }

        // Se o cadastro foi efetuado, garantir sessão ativa no cliente
        if (signUpData?.user) {
          if (signUpData.session) {
            try { await supabase.auth.setSession(signUpData.session); } catch {}
          } else {
            // Auto-login caso o GoTrue não retorne sessão imediata
            let autoLoginRes = await supabase.auth.signInWithPassword({
              email: cleanEmail,
              password,
            });
            if (autoLoginRes.error && /email not confirmed/i.test(autoLoginRes.error.message || "")) {
              try {
                await (supabase as any).rpc("confirm_user_email", { p_email: cleanEmail });
                autoLoginRes = await supabase.auth.signInWithPassword({
                  email: cleanEmail,
                  password,
                });
              } catch {}
            }
          }

          toast.success("Cadastro realizado com sucesso! Bem-vindo(a).");
          await handlePostAuthRedirect(signUpData.user.id);
          return;
        }

        toast.success("Cadastro realizado com sucesso!");
        navigate("/");
      }
    } catch (error: any) {
      toast.error(error.message || "Erro na autenticação. Verifique seu e-mail e senha.");
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
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Senha</Label>
                {isLogin && (
                  <button
                    type="button"
                    onClick={() => {
                      setForgotEmail(email);
                      setShowForgotModal(true);
                    }}
                    className="text-xs text-primary hover:underline font-medium"
                  >
                    Esqueceu a senha?
                  </button>
                )}
              </div>
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
            <button
              onClick={() => {
                setIsLogin(!isLogin);
              }}
              className="text-primary font-semibold"
            >
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
                onClick={() => navigate("/cadastro/lojas")}
                className="flex flex-col items-center gap-1 p-3 rounded-xl border border-border hover:bg-accent transition-colors"
              >
                <span className="text-2xl">🏪</span>
                <span className="text-xs font-medium text-foreground">Loja</span>
              </button>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Modal Esqueci Minha Senha */}
      <Dialog open={showForgotModal} onOpenChange={setShowForgotModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="w-5 h-5 text-primary" />
              Recuperar Senha
            </DialogTitle>
            <DialogDescription>
              Informe seu e-mail cadastrado para receber as instruções e link de redefinição de senha.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleForgotPassword} className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label htmlFor="forgot-email">E-mail cadastrado</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="forgot-email"
                  type="email"
                  placeholder="seu@email.com"
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  className="pl-10 rounded-xl"
                  required
                />
              </div>
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" onClick={() => setShowForgotModal(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={sendingForgot}>
                {sendingForgot ? "Enviando..." : "Enviar link de recuperação"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Auth;
