import { Home, Map as MapIcon, Radar, Wallet, Settings, Store, UtensilsCrossed, Truck, CreditCard, Package, ShoppingCart, Users, Ticket, DollarSign, ShieldCheck, MessageSquare, KeyRound, UserCheck, ChevronLeft, ChevronRight, LogOut, Star, RefreshCw, Shield, Route, History, Bell } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";

interface AppSidebarProps {
  role: "admin" | "store" | "driver";
  currentTab: string;
  onTabChange: (tab: string) => void;
}

const AppSidebar = ({ role, currentTab, onTabChange }: AppSidebarProps) => {
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const { state } = useSidebar();
  const isCollapsed = state === "collapsed";

  const getMenuItems = () => {
    switch (role) {
      case "driver":
        return [
          { id: "home", label: "Início", icon: Home },
          { id: "map", label: "GPS", icon: MapIcon },
          { id: "radar", label: "Radar", icon: Radar },
          { id: "finance", label: "Ganhos", icon: Wallet },
          { id: "history", label: "Histórico", icon: History },
          { id: "support", label: "Suporte", icon: MessageSquare },
          { id: "settings", label: "Ajustes", icon: Settings },
        ];
      case "store":
        return [
          { id: "store", label: "Loja", icon: Store },
          { id: "menu", label: "Cardápio", icon: UtensilsCrossed },
          { id: "driver", label: "Entregador", icon: Truck },
          { id: "multi", label: "Multi-Entregas", icon: Route },
          { id: "reassign", label: "Reatribuir", icon: RefreshCw },
          { id: "favorites", label: "Favoritos", icon: Star },
          { id: "map", label: "Mapa", icon: MapIcon },
          { id: "credits", label: "Recarga", icon: CreditCard },
          { id: "support", label: "Suporte", icon: MessageSquare },
        ];
      case "admin":
        return [
          { id: "restaurants", label: "Restaurantes", icon: Store },
          { id: "products", label: "Produtos", icon: Package },
          { id: "orders", label: "Pedidos", icon: ShoppingCart },
          { id: "map", label: "Mapa Geral", icon: MapIcon },
          { id: "drivers", label: "Motoristas", icon: Truck },
          { id: "storeowners", label: "Lojas", icon: Users },
          { id: "fees", label: "Taxas", icon: Settings },
          { id: "credits", label: "Créditos", icon: Ticket },
          { id: "financial", label: "Financeiro", icon: DollarSign },
          { id: "admins", label: "Admins", icon: ShieldCheck },
          { id: "chat", label: "Chat", icon: MessageSquare },
          { id: "password-reset", label: "Senhas", icon: KeyRound },
          { id: "customers", label: "Clientes", icon: UserCheck },
          { id: "push", label: "Notificações", icon: Bell },
          { id: "privacy", label: "Privacidade", icon: Shield },
        ];
      default:
        return [];
    }
  };

  const menuItems = getMenuItems();

  const handleLogout = async () => {
    await signOut();
    navigate("/");
  };

  return (
    <Sidebar collapsible="icon" className="border-r border-border/50">
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="px-4 py-4 mb-2">
            {!isCollapsed && <span className="font-bold text-primary truncate">Sistema de Entregas</span>}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map((item) => (
                <SidebarMenuItem key={item.id}>
                  <SidebarMenuButton
                    isActive={currentTab === item.id}
                    onClick={() => onTabChange(item.id)}
                    tooltip={item.label}
                    className={cn(
                      "transition-all duration-200 h-11 px-4",
                      currentTab === item.id 
                        ? "bg-primary/10 text-primary font-bold shadow-sm" 
                        : "hover:bg-muted text-muted-foreground"
                    )}
                  >
                    <item.icon className={cn("w-5 h-5", currentTab === item.id ? "text-primary" : "")} />
                    <span>{item.label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="p-4">
        <Button 
          variant="ghost" 
          size={isCollapsed ? "icon" : "default"} 
          className={cn("w-full justify-start gap-3 text-destructive hover:text-destructive hover:bg-destructive/10", isCollapsed && "justify-center")}
          onClick={handleLogout}
        >
          <LogOut className="w-5 h-5" />
          {!isCollapsed && <span>Sair</span>}
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
};

export default AppSidebar;