import React from "react";
import { Home, LayoutGrid, Settings, Bike, Sun, Moon, PanelLeftClose, ArrowLeft } from "lucide-react";

interface StoreSlimSidebarProps {
  currentTab: string;
  onTabChange: (tab: string) => void;
  isDark: boolean;
  onToggleTheme: () => void;
  storeName?: string;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onGoBackHome?: () => void;
}

export const StoreSlimSidebar: React.FC<StoreSlimSidebarProps> = ({
  currentTab,
  onTabChange,
  isDark,
  onToggleTheme,
  storeName = "Duarte",
  isCollapsed,
  onToggleCollapse,
  onGoBackHome,
}) => {
  const navItems = [
    { id: "dashboard", label: "Início", icon: Home },
    { id: "orders", label: "Pedidos / Grade", icon: LayoutGrid },
    { id: "settings", label: "Configurações", icon: Settings },
  ];

  return (
    <aside
      className={`flex-shrink-0 flex flex-col items-center justify-between py-4 border-r select-none transition-all duration-300 ease-in-out z-30 ${
        isCollapsed
          ? "w-0 p-0 border-r-0 opacity-0 -translate-x-full overflow-hidden pointer-events-none"
          : "w-16 sm:w-18 opacity-100 translate-x-0"
      }`}
      style={{
        backgroundColor: isDark ? "#121214" : "#18181B",
        borderColor: isDark ? "rgba(255, 255, 255, 0.08)" : "rgba(255, 255, 255, 0.12)",
      }}
      aria-label="Menu Lateral"
    >
      {/* Topo: Botão Voltar + Ícone / Logotipo de Moto Laranja */}
      <div className="flex flex-col items-center gap-3 w-full px-2">
        {/* Botão de Voltar para a página inicial */}
        {onGoBackHome && (
          <button
            type="button"
            onClick={onGoBackHome}
            className="w-10 h-10 rounded-2xl bg-white/5 hover:bg-white/15 text-zinc-400 hover:text-white border border-white/10 flex items-center justify-center transition-all duration-200 active:scale-95 group"
            title="Voltar para a página inicial"
            aria-label="Voltar para a página inicial"
          >
            <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-0.5" />
          </button>
        )}

        {/* Logotipo / Botão da Duarte */}
        <button
          type="button"
          onClick={() => onTabChange("dashboard")}
          className="w-11 h-11 rounded-2xl bg-[#EA580C] hover:bg-[#C2410C] text-white shadow-lg shadow-orange-500/20 flex items-center justify-center transition-all duration-200 active:scale-95 group"
          title={`Duarte Entregas - ${storeName}`}
        >
          <Bike className="w-6 h-6 transition-transform group-hover:scale-110" />
        </button>

        {/* Coluna Vertical de Ícones de Navegação */}
        <nav className="flex flex-col items-center gap-3 mt-2 w-full">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentTab === item.id;

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onTabChange(item.id)}
                title={item.label}
                aria-label={item.label}
                className={`w-11 h-11 rounded-2xl flex items-center justify-center transition-all duration-200 relative group active:scale-95 ${
                  isActive
                    ? "bg-white/15 text-white shadow-inner font-bold"
                    : "text-zinc-400 hover:text-white hover:bg-white/10"
                }`}
              >
                <Icon className={`w-5 h-5 transition-transform duration-200 ${isActive ? "scale-105 text-[#EA580C]" : "group-hover:scale-110"}`} />
                {isActive && (
                  <span className="absolute -left-1 w-1 h-5 bg-[#EA580C] rounded-r-full"></span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Base: Tema Claro/Escuro + Botão de Recolher Menu */}
      <div className="flex flex-col items-center gap-3 w-full px-2">
        {/* Alternar tema */}
        <button
          type="button"
          onClick={onToggleTheme}
          title={isDark ? "Mudar para modo claro" : "Mudar para modo escuro"}
          aria-label={isDark ? "Mudar para modo claro" : "Mudar para modo escuro"}
          className="w-10 h-10 rounded-2xl bg-white/5 hover:bg-white/15 text-zinc-300 hover:text-white border border-white/10 flex items-center justify-center transition-all active:scale-95"
        >
          {isDark ? (
            <Sun className="w-5 h-5 text-amber-400 animate-spin-slow" />
          ) : (
            <Moon className="w-5 h-5 text-zinc-300" />
          )}
        </button>

        {/* Botão de Recolher o Menu Lateral */}
        <button
          type="button"
          onClick={onToggleCollapse}
          title="Recolher menu lateral"
          aria-label="Recolher menu lateral"
          className="w-10 h-10 rounded-2xl bg-white/5 hover:bg-orange-500/20 text-zinc-400 hover:text-[#EA580C] border border-white/10 hover:border-orange-500/30 flex items-center justify-center transition-all active:scale-95 group"
        >
          <PanelLeftClose className="w-5 h-5 transition-transform group-hover:scale-110 text-orange-400" />
        </button>
      </div>
    </aside>
  );
};

export default StoreSlimSidebar;
