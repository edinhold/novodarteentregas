import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { FinancialModule } from "@/components/admin/financial/FinancialModule";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ShieldCheck, TrendingUp, Loader2 } from "lucide-react";
import ThemeToggle from "@/components/ThemeToggle";
import { toast } from "sonner";

const Financeiro = () => {
  const navigate = useNavigate();
  const [authChecked, setAuthChecked] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const verifyAdmin = async (userId: string, email?: string) => {
      try {
        const { data: isAdmin, error: roleError } = await supabase.rpc("has_role", {
          _user_id: userId,
          _role: "admin",
        });

        if (!mounted) return;

        if (roleError) {
          const { data: roles } = await supabase
            .from("user_roles")
            .select("role")
            .eq("user_id", userId);
          const hasAdmin = Array.isArray(roles) && roles.some((r: any) => r.role === "admin");
          if (hasAdmin) {
            setAuthChecked(true);
            return;
          }
          toast.error("Não foi possível validar suas permissões de administrador.");
          navigate("/admin/login", { replace: true });
          return;
        }

        if (!isAdmin) {
          toast.error("Acesso negado. Esta área é restrita a administradores.", {
            description: email ? `Conta: ${email}` : undefined,
          });
          navigate("/admin/login", { replace: true });
          return;
        }

        setAuthChecked(true);
      } catch {
        if (mounted) {
          navigate("/admin/login", { replace: true });
        }
      }
    };

    const checkSession = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        navigate("/admin/login", { replace: true });
        return;
      }

      setUserEmail(session.user.email || null);
      await verifyAdmin(session.user.id, session.user.email);
    };

    checkSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        navigate("/admin/login", { replace: true });
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [navigate]);

  if (!authChecked) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background p-4">
        <div className="flex items-center gap-2 text-primary font-bold mb-2">
          <Loader2 className="w-6 h-6 animate-spin" />
          <span>Verificando permissões administrativas...</span>
        </div>
        <p className="text-xs text-muted-foreground">Validando credenciais do módulo financeiro</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Top Navbar */}
      <header className="sticky top-0 z-40 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/admin")}
              className="gap-1.5 text-xs font-semibold h-8"
            >
              <ArrowLeft className="w-4 h-4" />
              Voltar ao Painel Admin
            </Button>
            <div className="hidden sm:flex items-center gap-1.5 pl-3 border-l border-border text-xs text-muted-foreground">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
              <span>Admin: <strong>{userEmail}</strong></span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl mx-auto w-full p-4 sm:p-6">
        <FinancialModule standalone={true} />
      </main>
    </div>
  );
};

export default Financeiro;
