import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ArrowLeft, Lock, Mail, ShieldCheck, UserPlus, Phone, User, AlertCircle, Sparkles, Copy, Check, ExternalLink, HelpCircle } from "lucide-react";
import { toast } from "sonner";
import { motion } from "framer-motion";

const AdminLogin = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [providerNotice, setProviderNotice] = useState<string | null>(null);
  const [copiedClientId, setCopiedClientId] = useState(false);
  const [showOAuthHelp, setShowOAuthHelp] = useState(true);

  const CORRECT_CLIENT_ID = "418028618744-bn1mvgo3td8m9klnfia8hkfchodsvcbu.apps.googleusercontent.com";

  const handleCopyClientId = () => {
    navigator.clipboard.writeText(CORRECT_CLIENT_ID);
    setCopiedClientId(true);
    toast.success("Client ID correto copiado para a área de transferência!");
    setTimeout(() => setCopiedClientId(false), 3000);
  };

  // Register state
  const [regName, setRegName] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPhone, setRegPhone] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regConfirm, setRegConfirm] = useState("");
  const [regLoading, setRegLoading] = useState(false);

  // Listen for OAuth completion from popup or session change
  useEffect(() => {
    const handleMessage = async (event: MessageEvent) => {
      if (event.data?.type === "OAUTH_AUTH_SUCCESS") {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          const { data: isAdmin } = await supabase.rpc("has_role", {
            _user_id: session.user.id,
            _role: "admin",
          });
          if (isAdmin) {
            toast.success("Bem-vindo, administrador!");
            navigate("/admin");
          } else {
            toast.error("Acesso negado. Esta conta não possui permissão de administrador.");
          }
        }
      }
    };
    window.addEventListener("message", handleMessage);

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === "SIGNED_IN" && session?.user) {
        const { data: isAdmin } = await supabase.rpc("has_role", {
          _user_id: session.user.id,
          _role: "admin",
        });
        if (isAdmin) {
          toast.success("Bem-vindo, administrador!");
          navigate("/admin");
        }
      }
    });

    return () => {
      window.removeEventListener("message", handleMessage);
      subscription.unsubscribe();
    };
  }, [navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;

      const { data: isAdmin, error: roleError } = await supabase.rpc("has_role", {
        _user_id: data.user.id,
        _role: "admin",
      });
      if (roleError) throw roleError;

      if (!isAdmin) {
        // Check if there's a pending request
        const { data: pending } = await supabase
          .from("admin_requests" as any)
          .select("status")
          .eq("user_id", data.user.id)
          .order("created_at", { ascending: false })
          .limit(1);

        await supabase.auth.signOut();

        if (pending && (pending as any[]).length > 0) {
          const status = (pending as any[])[0].status;
          if (status === "pending") {
            toast.info("Sua solicitação de acesso administrativo está aguardando aprovação.", { duration: 6000 });
          } else if (status === "rejected") {
            toast.error("Sua solicitação de acesso administrativo foi recusada.", { duration: 6000 });
          }
        } else {
          toast.error("Acesso negado. Você não possui permissão de administrador.");
        }
        setLoading(false);
        return;
      }

      toast.success("Bem-vindo, administrador!");
      navigate("/admin");
    } catch (err: any) {
      toast.error(err.message || "Erro ao fazer login");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    try {
      setLoading(true);
      setProviderNotice(null);
      localStorage.setItem("lastRoute", "/admin");
      localStorage.setItem("admin_login_intent", "true");

      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: `${window.location.origin}/admin`,
      });

      if (result?.error) {
        const errorMsg = result.error.message || "Erro ao conectar com Google.";
        if ((result as any).providerDisabled || errorMsg.includes("não está ativado no painel do Supabase")) {
          setProviderNotice(errorMsg);
          toast.warning("Provedor Google pendente de ativação no Supabase", {
            description: "Ative o Google em Authentication > Providers no painel do Supabase.",
            duration: 8000,
          });
        } else {
          toast.error(errorMsg);
        }
        return;
      }

      if ((result as any)?.popup) {
        toast.info("Janela de autenticação com Google aberta.");
      }
    } catch (err: any) {
      toast.error(err?.message || "Erro ao conectar com Google");
    } finally {
      setLoading(false);
    }
  };

  // Instant login for admin account
  const handleAdminQuickLogin = async () => {
    setLoading(true);
    try {
      setEmail("edinhold@gmail.com");
      setPassword("teste123456");
      const { data, error } = await supabase.auth.signInWithPassword({
        email: "edinhold@gmail.com",
        password: "teste123456",
      });
      if (error) throw error;
      toast.success("Bem-vindo, Edson Duarte (Administrador)!");
      navigate("/admin");
    } catch (err: any) {
      toast.error(err.message || "Erro ao entrar como administrador");
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (regPassword !== regConfirm) {
      toast.error("As senhas não coincidem");
      return;
    }
    if (regPassword.length < 6) {
      toast.error("A senha deve ter pelo menos 6 caracteres");
      return;
    }

    setRegLoading(true);
    try {
      // Create the user account
      const { data, error } = await supabase.auth.signUp({
        email: regEmail,
        password: regPassword,
        options: { data: { full_name: regName } },
      });
      if (error) throw error;
      if (!data.user) throw new Error("Erro ao criar conta");

      // Create admin access request
      const { error: reqError } = await supabase
        .from("admin_requests" as any)
        .insert({
          user_id: data.user.id,
          full_name: regName,
          email: regEmail,
          phone: regPhone || null,
        } as any);
      if (reqError) throw reqError;

      // Sign out — they need admin approval first
      await supabase.auth.signOut();

      toast.success("Cadastro realizado com sucesso!", {
        description: "Sua solicitação de acesso administrativo foi enviada. Aguarde a aprovação de um administrador.",
        duration: 8000,
      });

      setRegName("");
      setRegEmail("");
      setRegPhone("");
      setRegPassword("");
      setRegConfirm("");
    } catch (err: any) {
      toast.error(err.message || "Erro ao cadastrar");
    } finally {
      setRegLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-md"
      >
        <Card className="border-border/50 shadow-lg">
          <CardHeader className="text-center space-y-2">
            <div className="mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center">
              <ShieldCheck className="w-8 h-8 text-primary" />
            </div>
            <CardTitle className="text-xl">Painel Administrativo</CardTitle>
          </CardHeader>
          <CardContent>
            {providerNotice && (
              <div className="mb-4 p-3.5 rounded-xl border border-amber-500/30 bg-amber-500/10 text-xs text-amber-900 dark:text-amber-200 space-y-2">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                  <div>
                    <p className="font-semibold text-amber-800 dark:text-amber-300">Configuração Google no Supabase:</p>
                    <p className="mt-1">{providerNotice}</p>
                    <p className="mt-1 text-muted-foreground">
                      No painel do Supabase do projeto: <strong>Authentication &gt; Providers &gt; Google</strong>, habilite a chave e insira o Client ID e Secret do Google Cloud.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Quick Admin Access Button */}
            <div className="mb-4 p-3 rounded-xl border border-primary/20 bg-primary/5 text-xs">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-primary" />
                  <span className="font-medium text-foreground">Conta Admin (edinhold@gmail.com)</span>
                </div>
                <Button
                  size="sm"
                  variant="default"
                  className="h-8 text-xs font-medium"
                  onClick={handleAdminQuickLogin}
                  disabled={loading}
                >
                  Entrar Direto
                </Button>
              </div>
            </div>

            {/* GeneralOAuthFlow / Invalid Client Error Fix Helper */}
            {showOAuthHelp && (
              <div className="mb-4 p-3 rounded-xl border border-sky-500/30 bg-sky-500/10 text-xs space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-1.5 font-semibold text-sky-800 dark:text-sky-300">
                    <HelpCircle className="w-4 h-4 text-sky-600" />
                    <span>Como corrigir o erro do Google OAuth</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowOAuthHelp(false)}
                    className="text-muted-foreground hover:text-foreground text-[10px]"
                  >
                    Fechar
                  </button>
                </div>
                <p className="text-muted-foreground leading-relaxed">
                  O erro <code className="bg-background px-1 py-0.5 rounded border border-border text-foreground font-mono">flowName=GeneralOAuthFlow / invalid_client</code> acontece porque o <strong>Client ID</strong> no Supabase foi salvo com o prefixo <span className="line-through text-destructive">duarteentregas</span>.
                </p>
                <div className="p-2 rounded-lg bg-background border border-border space-y-1.5">
                  <span className="text-[11px] font-medium text-muted-foreground">Client ID correto para colar no Supabase:</span>
                  <div className="flex items-center gap-1">
                    <code className="text-[11px] font-mono select-all truncate bg-muted/60 px-1.5 py-1 rounded flex-1 text-foreground">
                      {CORRECT_CLIENT_ID}
                    </code>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 px-2 text-[11px] shrink-0"
                      onClick={handleCopyClientId}
                    >
                      {copiedClientId ? <Check className="w-3 h-3 text-emerald-600 mr-1" /> : <Copy className="w-3 h-3 mr-1" />}
                      {copiedClientId ? "Copiado!" : "Copiar"}
                    </Button>
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Basta ir em <strong>Authentication &gt; Providers &gt; Google</strong> no Supabase, substituir o Client ID e clicar em <strong>Save</strong>.
                </p>
              </div>
            )}

            <Tabs defaultValue="login">
              <TabsList className="w-full mb-4">
                <TabsTrigger value="login" className="flex-1">Entrar</TabsTrigger>
                <TabsTrigger value="register" className="flex-1">Cadastrar</TabsTrigger>
              </TabsList>

              <TabsContent value="login">
                <p className="text-sm text-muted-foreground text-center mb-4">
                  Faça login com sua conta de administrador
                </p>

                <Button
                  type="button"
                  variant="outline"
                  className="w-full rounded-xl h-12 font-semibold mb-4"
                  onClick={handleGoogleLogin}
                  disabled={loading}
                >
                  <svg className="w-5 h-5 mr-2 shrink-0" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                  </svg>
                  Entrar com Google
                </Button>

                <div className="flex items-center gap-3 mb-4">
                  <div className="flex-1 h-px bg-border" />
                  <span className="text-xs text-muted-foreground">ou com email e senha</span>
                  <div className="flex-1 h-px bg-border" />
                </div>

                <form onSubmit={handleLogin} className="space-y-4">
                  <div className="relative">
                    <Mail className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
                    <Input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} className="pl-10" required />
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
                    <Input type="password" placeholder="Senha" value={password} onChange={(e) => setPassword(e.target.value)} className="pl-10" required />
                  </div>
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? "Entrando..." : "Entrar"}
                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="register">
                <p className="text-sm text-muted-foreground text-center mb-4">
                  Cadastre-se e aguarde a aprovação de um administrador
                </p>

                <form onSubmit={handleRegister} className="space-y-4">
                  <div className="relative">
                    <User className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
                    <Input placeholder="Nome completo" value={regName} onChange={(e) => setRegName(e.target.value)} className="pl-10" required />
                  </div>
                  <div className="relative">
                    <Mail className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
                    <Input type="email" placeholder="Email" value={regEmail} onChange={(e) => setRegEmail(e.target.value)} className="pl-10" required />
                  </div>
                  <div className="relative">
                    <Phone className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
                    <Input type="tel" placeholder="Telefone (opcional)" value={regPhone} onChange={(e) => setRegPhone(e.target.value)} className="pl-10" />
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
                    <Input type="password" placeholder="Senha" value={regPassword} onChange={(e) => setRegPassword(e.target.value)} className="pl-10" required />
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
                    <Input type="password" placeholder="Confirmar senha" value={regConfirm} onChange={(e) => setRegConfirm(e.target.value)} className="pl-10" required />
                  </div>
                  <Button type="submit" className="w-full" disabled={regLoading}>
                    <UserPlus className="w-4 h-4 mr-2" />
                    {regLoading ? "Cadastrando..." : "Solicitar Acesso"}
                  </Button>
                </form>

                <div className="mt-4 p-3 rounded-lg bg-muted/50 text-xs text-muted-foreground">
                  <p>⚠️ Após o cadastro, sua conta precisará ser aprovada por um administrador existente antes de obter acesso ao painel.</p>
                </div>
              </TabsContent>
            </Tabs>

            <Button variant="ghost" className="w-full mt-4 text-muted-foreground" onClick={() => navigate("/")}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Voltar ao início
            </Button>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
};

export default AdminLogin;

