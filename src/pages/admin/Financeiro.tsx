import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import FinancialTab from "@/components/admin/FinancialTab";
import AppSidebar from "@/components/AppSidebar";
import { SidebarProvider, SidebarTrigger, SidebarInset } from "@/components/ui/sidebar";
import ThemeToggle from "@/components/ThemeToggle";
import { ArrowLeft } from "lucide-react";

const FinanceiroPage = () => {
  const navigate = useNavigate();
  const [authChecked, setAuthChecked] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    const checkAdmin = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate("/admin/login", { replace: true });
        return;
      }
      const { data: isAdmin, error: roleError } = await supabase.rpc("has_role", {
        _user_id: session.user.id,
        _role: "admin",
      });
      if (roleError) {
        setAuthError("Não foi possível verificar sua permissão. Tente novamente em instantes.");
        toast.error("Erro ao verificar permissão de administrador.");
        return;
      }
      if (!isAdmin) {
        toast.error("Acesso negado. Sua conta não possui permissão de administrador.", {
          description: `Conta: ${session.user.email}`,
          duration: 6000,
        });
        await supabase.auth.signOut();
        navigate("/admin/login", { replace: true });
        return;
      }
      setAuthChecked(true);
    };
    checkAdmin();
  }, [navigate]);

  if (!authChecked) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-3 px-4">
          <p className="text-muted-foreground">{authError ?? "Verificando permissões..."}</p>
        </div>
      </div>
    );
  }

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background overflow-hidden">
        <AppSidebar
          role="admin"
          currentTab="financial"
          onTabChange={(tab) => {
            if (tab === "financial") return;
            navigate("/admin");
          }}
        />

        <SidebarInset className="flex-1 overflow-y-auto">
          <header className="bg-card border-b px-4 py-3 flex items-center gap-3 sticky top-0 z-30">
            <SidebarTrigger />
            <button onClick={() => navigate("/admin")} className="hover:bg-muted p-1 rounded-full transition-colors ml-1">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="font-bold text-lg flex-1 truncate">Módulo Financeiro — Painel Admin</h1>
            <ThemeToggle />
          </header>

          <main className="p-4 max-w-7xl mx-auto w-full space-y-6">
            <FinancialTab />
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
};

export default FinanceiroPage;
