import React, { useState, useEffect } from "react";
import { Menu, Signal, Sun, Moon } from "lucide-react";

interface DriverDarkHeaderProps {
  companyName?: string;
  isOnline?: boolean;
  statusText?: string;
  onOpenMenu?: () => void;
  onTestSound?: () => void;
  unreadCount?: number;
}

export const DriverDarkHeader: React.FC<DriverDarkHeaderProps> = ({
  companyName = "Duarte Entregas",
  isOnline = true,
  statusText,
  onOpenMenu,
  onTestSound,
}) => {
  const [isDark, setIsDark] = useState(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("theme");
      if (stored) return stored === "dark";
      return document.documentElement.classList.contains("dark");
    }
    return true;
  });

  useEffect(() => {
    const handleThemeChange = () => {
      const darkActive =
        document.documentElement.classList.contains("dark") ||
        localStorage.getItem("theme") === "dark";
      setIsDark(darkActive);
    };

    window.addEventListener("theme-change", handleThemeChange);
    window.addEventListener("storage", handleThemeChange);
    return () => {
      window.removeEventListener("theme-change", handleThemeChange);
      window.removeEventListener("storage", handleThemeChange);
    };
  }, []);

  const toggleTheme = () => {
    const nextDark = !isDark;
    setIsDark(nextDark);
    if (typeof window !== "undefined") {
      const root = document.documentElement;
      if (nextDark) {
        root.classList.add("dark");
        localStorage.setItem("theme", "dark");
      } else {
        root.classList.remove("dark");
        localStorage.setItem("theme", "light");
      }
      window.dispatchEvent(new Event("theme-change"));
    }
  };

  const displayStatus = statusText || (isOnline ? "Disponível" : "Offline");
  const isAvailable = isOnline && (!statusText || statusText.toLowerCase().includes("dispon"));

  return (
    <header className="absolute top-0 inset-x-0 z-20 pointer-events-none">
      {/* Degradê superior adaptativo para contraste sobre o mapa */}
      <div
        className={`w-full pt-4 pb-8 px-4 transition-colors duration-300 ${
          isDark
            ? "bg-gradient-to-b from-[#0a0a0c]/95 via-[#0a0a0c]/70 to-transparent"
            : "bg-gradient-to-b from-white/95 via-white/80 to-transparent"
        }`}
      >
        <div className="relative flex items-center justify-between max-w-lg mx-auto pointer-events-auto">
          {/* Menu / Gaveta Lateral */}
          <div className="w-10 flex items-center justify-start">
            {onOpenMenu && (
              <button
                type="button"
                onClick={onOpenMenu}
                aria-label="Menu principal"
                className={`w-9 h-9 rounded-full flex items-center justify-center transition active:scale-95 shadow-lg backdrop-blur-md border ${
                  isDark
                    ? "bg-zinc-900/80 hover:bg-zinc-800 text-zinc-300 hover:text-white border-white/10"
                    : "bg-white/90 hover:bg-white text-zinc-700 hover:text-black border-zinc-200"
                }`}
              >
                <Menu className="w-5 h-5" />
              </button>
            )}
          </div>

          {/* Título Centralizado & Tag de Status */}
          <div className="flex-1 flex flex-col items-center justify-center text-center px-2">
            <h1
              className={`font-semibold text-base sm:text-lg tracking-tight select-none transition-colors ${
                isDark ? "text-white drop-shadow-md" : "text-zinc-900 drop-shadow-sm font-bold"
              }`}
            >
              {companyName} - Motorista
            </h1>

            {/* Pill de Status */}
            <div className="mt-1 flex items-center justify-center">
              {isAvailable ? (
                <div
                  className={`inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full text-xs font-medium select-none shadow-sm backdrop-blur-md transition-all ${
                    isDark
                      ? "text-[#22C55E]"
                      : "text-emerald-700 bg-emerald-50 border border-emerald-500/40 font-semibold"
                  }`}
                  style={
                    isDark
                      ? {
                          backgroundColor: "rgba(34, 197, 94, 0.15)",
                          border: "1px solid rgba(34, 197, 94, 0.35)",
                        }
                      : undefined
                  }
                >
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#22C55E] opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-[#22C55E]" />
                  </span>
                  <span>{displayStatus}</span>
                </div>
              ) : (
                <div
                  className={`inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full text-xs font-medium select-none shadow-sm backdrop-blur-md transition-all ${
                    isDark
                      ? "text-amber-400"
                      : "text-amber-800 bg-amber-50 border border-amber-500/40 font-semibold"
                  }`}
                  style={
                    isDark
                      ? {
                          backgroundColor: "rgba(245, 158, 11, 0.15)",
                          border: "1px solid rgba(245, 158, 11, 0.35)",
                        }
                      : undefined
                  }
                >
                  <span className="h-2 w-2 rounded-full bg-amber-400" />
                  <span>{displayStatus}</span>
                </div>
              )}
            </div>
          </div>

          {/* Ações da Direita: Alternador de Tema (Claro/Escuro) & Sirene de Alerta */}
          <div className="flex items-center justify-end gap-1.5">
            {/* Botão de Alternar Modo Claro / Modo Escuro */}
            <button
              type="button"
              onClick={toggleTheme}
              aria-label={isDark ? "Mudar para modo claro" : "Mudar para modo escuro"}
              title={isDark ? "Mudar para modo claro" : "Mudar para modo escuro"}
              className={`w-9 h-9 rounded-full flex items-center justify-center transition active:scale-95 shadow-lg backdrop-blur-md border ${
                isDark
                  ? "bg-zinc-900/80 hover:bg-zinc-800 text-amber-300 border-white/10"
                  : "bg-white/90 hover:bg-white text-zinc-700 hover:text-black border-zinc-200"
              }`}
            >
              {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>

            {/* Teste do Som de Notificação */}
            {onTestSound && (
              <button
                type="button"
                onClick={onTestSound}
                aria-label="Testar sirene / som de alerta"
                title="Sirene de chamada"
                className={`w-9 h-9 rounded-full flex items-center justify-center transition active:scale-95 shadow-lg backdrop-blur-md border ${
                  isDark
                    ? "bg-zinc-900/80 hover:bg-zinc-800 text-emerald-400 border-white/10"
                    : "bg-white/90 hover:bg-white text-emerald-600 border-zinc-200"
                }`}
              >
                <Signal className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};

export default DriverDarkHeader;
