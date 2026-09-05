import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ArrowLeft, Lock, Mail, ShieldCheck, UserPlus, Phone, User } from "lucide-react";
import { toast } from "sonner";
import { motion } from "framer-motion";

const AdminLogin = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  // Register state
  const [regName, setRegName] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPhone, setRegPhone] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regConfirm, setRegConfirm] = useState("");
  const [regLoading, setRegLoading] = useState(false);

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
    localStorage.setItem("lastRoute", "/admin");
    const { error } = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (error) toast.error("Erro ao conectar com Google");
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
                  variant="outline"
                  className="w-full rounded-xl h-12 font-semibold mb-4"
                  onClick={handleGoogleLogin}
                >
                  <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                  </svg>
                  Entrar com Google
                </Button>

                <div className="flex items-center gap-3 mb-4">
                  <div className="flex-1 h-px bg-border" />
                  <span className="text-xs text-muted-foreground">ou</span>
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
