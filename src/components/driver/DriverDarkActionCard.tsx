import React, { useState, useEffect } from "react";
import {
  Phone,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Navigation,
  MapPin,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Bell,
  Radio,
} from "lucide-react";

export interface DeliveryCardData {
  id: string;
  pickupName: string;
  pickupAddress?: string;
  deliveryAddress: string;
  phone?: string | null;
  status?: "pending" | "accepted" | "picked_up" | "delivered" | string;
  driverFee?: number;
  notes?: string | null;
}

interface DriverDarkActionCardProps {
  request: DeliveryCardData | null;
  totalPending?: number;
  currentIndex?: number;
  onNext?: () => void;
  onPrev?: () => void;
  isLoading?: boolean;
  onPrimaryAction: (request: DeliveryCardData) => void;
  onContactStore: (request: DeliveryCardData) => void;
  onOpenNavigation?: (app: "google" | "waze") => void;
  onCancelRequest?: (request: DeliveryCardData) => void;
  primaryButtonLabel?: string;
  isStandbyCollapsed?: boolean;
  onToggleStandbyCollapse?: (collapsed: boolean) => void;
}

export const DriverDarkActionCard: React.FC<DriverDarkActionCardProps> = ({
  request,
  totalPending = 1,
  currentIndex = 0,
  onNext,
  onPrev,
  isLoading = false,
  onPrimaryAction,
  onContactStore,
  onOpenNavigation,
  onCancelRequest,
  primaryButtonLabel,
  isStandbyCollapsed,
  onToggleStandbyCollapse,
}) => {
  const [internalCollapsed, setInternalCollapsed] = useState(false);
  const isCollapsed = isStandbyCollapsed !== undefined ? isStandbyCollapsed : internalCollapsed;

  const toggleCollapse = (nextState?: boolean) => {
    const val = nextState !== undefined ? nextState : !isCollapsed;
    setInternalCollapsed(val);
    onToggleStandbyCollapse?.(val);
  };

  // Se houver uma nova corrida, garantir que o painel expanda automaticamente
  useEffect(() => {
    if (request && isCollapsed) {
      toggleCollapse(false);
    }
  }, [request]);

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

  // Determinar texto do botão primário conforme o status da entrega
  const getPrimaryLabel = () => {
    if (primaryButtonLabel) return primaryButtonLabel;
    if (!request) return "Aguardando";
    if (request.status === "accepted") return "Cheguei na Coleta / Coletado";
    if (request.status === "picked_up") return "Finalizar Entrega";
    return "Aceitar Corrida e Ir para Coleta";
  };

  // MODO RECOLHIDO (STANDBY COMPACTO):
  // Quando não há chamados ativos e o motorista recolheu o painel,
  // exibe uma barra inferior ultra-limpa e touch-friendly que sobe ao tocar.
  if (!request && isCollapsed) {
    return (
      <div className="w-full max-w-lg mx-auto pointer-events-auto px-2 sm:px-0">
        <div
          onClick={() => toggleCollapse(false)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") toggleCollapse(false);
          }}
          className={`w-full cursor-pointer select-none px-4 py-3 sm:py-3.5 flex items-center justify-between gap-3 shadow-2xl transition-all duration-300 active:scale-[0.99] border-t ${
            isDark
              ? "bg-[#121214] hover:bg-[#18181c] text-white border-white/10 shadow-[0_-10px_35px_rgba(0,0,0,0.85)]"
              : "bg-white hover:bg-slate-50 text-zinc-900 border-zinc-200 shadow-[0_-8px_25px_rgba(0,0,0,0.12)]"
          }`}
          style={{
            borderRadius: "22px 22px 0 0",
          }}
          title="Toque para subir e ver opções"
        >
          {/* Indicador de Status com Ponto Pulsante Verde */}
          <div className="flex items-center gap-3 min-w-0">
            <span className="relative flex h-3.5 w-3.5 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-emerald-500 shadow-sm shadow-emerald-500/50"></span>
            </span>

            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-xs sm:text-sm tracking-tight truncate">
                  Aguardando novos chamados...
                </span>
                <span
                  className={`hidden xs:inline-flex text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded ${
                    isDark
                      ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/20"
                      : "bg-emerald-100 text-emerald-700 border border-emerald-200"
                  }`}
                >
                  Radar Ativo
                </span>
              </div>
              <p className={`text-[11px] truncate ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
                GPS & Sirene conectados • Toque para subir
              </p>
            </div>
          </div>

          {/* Botão de Subir / Expandir */}
          <div
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold shrink-0 transition-colors ${
              isDark
                ? "bg-zinc-800 text-zinc-100 border border-zinc-700 hover:bg-zinc-700"
                : "bg-zinc-100 text-zinc-800 border border-zinc-300 hover:bg-zinc-200"
            }`}
          >
            <span>Subir</span>
            <ChevronUp className="w-3.5 h-3.5 text-emerald-500 animate-bounce" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-lg mx-auto pointer-events-auto">
      <div
        className="w-full shadow-2xl transition-all duration-300"
        style={{
          backgroundColor: isDark ? "#121214" : "#FFFFFF",
          color: isDark ? "#FFFFFF" : "#18181B",
          borderRadius: "24px 24px 0 0",
          borderTop: isDark
            ? "1px solid rgba(255, 255, 255, 0.08)"
            : "1px solid rgba(0, 0, 0, 0.08)",
          boxShadow: isDark
            ? "0 -10px 40px rgba(0, 0, 0, 0.75)"
            : "0 -10px 30px rgba(0, 0, 0, 0.12)",
        }}
      >
        {/* Handle superior de arraste */}
        <div className="pt-3 pb-1 flex justify-center">
          <div
            className={`w-12 h-1 rounded-full ${
              isDark ? "bg-zinc-600/80" : "bg-zinc-300"
            }`}
          />
        </div>

        <div className="px-5 pb-6 pt-2 space-y-4">
          {request ? (
            <>
              {/* Badge discreto quando houver mais de uma corrida pendente */}
              {totalPending > 1 && (
                <div
                  className={`flex items-center justify-between text-xs pb-1 ${
                    isDark ? "text-zinc-400" : "text-zinc-500"
                  }`}
                >
                  <span className="font-semibold text-emerald-500">
                    Chamado {currentIndex + 1} de {totalPending}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={onPrev}
                      className={`p-1 rounded disabled:opacity-30 ${
                        isDark
                          ? "bg-zinc-800 hover:bg-zinc-700 text-zinc-300"
                          : "bg-zinc-100 hover:bg-zinc-200 text-zinc-700 border border-zinc-200"
                      }`}
                      disabled={currentIndex === 0}
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={onNext}
                      className={`p-1 rounded disabled:opacity-30 ${
                        isDark
                          ? "bg-zinc-800 hover:bg-zinc-700 text-zinc-300"
                          : "bg-zinc-100 hover:bg-zinc-200 text-zinc-700 border border-zinc-200"
                      }`}
                      disabled={currentIndex >= totalPending - 1}
                    >
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}

              {/* Informações do Pedido */}
              <div className="space-y-1.5 text-left select-none">
                {/* Linha de Coleta */}
                <div className="text-[14px] sm:text-base leading-snug">
                  <div>
                    <span className={isDark ? "text-zinc-400" : "text-zinc-500"}>Coleta: </span>
                    <span
                      className={`font-bold tracking-wide ${
                        isDark ? "text-white" : "text-zinc-900"
                      }`}
                    >
                      {request.pickupName || "Estabelecimento"}
                    </span>
                  </div>
                  {request.pickupAddress && request.pickupAddress !== request.pickupName && (
                    <p className={`text-xs mt-0.5 truncate ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>
                      📍 {request.pickupAddress}
                    </p>
                  )}
                </div>

                {/* Linha de Entrega */}
                <div className="text-[15px] sm:text-base leading-snug">
                  <span className={isDark ? "text-zinc-400" : "text-zinc-500"}>Entrega: </span>
                  <span
                    className={`font-normal ${
                      isDark ? "text-zinc-100" : "text-zinc-800"
                    }`}
                  >
                    {request.deliveryAddress || "Endereço não informado"}
                  </span>
                </div>
              </div>

              {/* Botões de Redirecionamento GPS Externo (Google Maps / Waze) */}
              {onOpenNavigation && (
                <div className="pt-1 pb-0.5 space-y-1.5">
                  <div
                    className={`flex items-center justify-between text-[11px] ${
                      isDark ? "text-zinc-400" : "text-zinc-500"
                    }`}
                  >
                    <span
                      className={`flex items-center gap-1 font-medium ${
                        isDark ? "text-zinc-300" : "text-zinc-700"
                      }`}
                    >
                      <Navigation className="w-3 h-3 text-sky-400" />
                      <span>GPS Rota para {request.status === "picked_up" ? "Entrega" : "Coleta"}:</span>
                    </span>
                    <span className="text-[10px] opacity-75">Toque para navegar</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => onOpenNavigation("google")}
                      className={`flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl active:scale-95 font-medium text-xs sm:text-sm transition shadow-sm ${
                        isDark
                          ? "bg-zinc-800/95 hover:bg-zinc-700 text-white border border-zinc-700"
                          : "bg-zinc-100 hover:bg-zinc-200 text-zinc-900 border border-zinc-200"
                      }`}
                      title="Navegar no Google Maps"
                    >
                      <MapPin className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                      <span>Google Maps</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onOpenNavigation("waze")}
                      className={`flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl active:scale-95 font-medium text-xs sm:text-sm transition shadow-sm ${
                        isDark
                          ? "bg-zinc-800/95 hover:bg-zinc-700 text-white border border-zinc-700"
                          : "bg-zinc-100 hover:bg-zinc-200 text-zinc-900 border border-zinc-200"
                      }`}
                      title="Navegar no Waze"
                    >
                      <ExternalLink className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                      <span>Waze</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Botões de Ação */}
              <div className="space-y-2.5 pt-1">
                {/* Botão Primário: Em modo escuro: branco sólido com texto preto; em modo claro: preto sólido com texto branco */}
                <button
                  type="button"
                  onClick={() => onPrimaryAction(request)}
                  disabled={isLoading}
                  className={`w-full font-bold py-3.5 px-4 rounded-[14px] text-[15px] sm:text-base shadow-lg transition-all flex items-center justify-center gap-2 select-none disabled:opacity-60 active:scale-[0.99] ${
                    isDark
                      ? "bg-[#FFFFFF] hover:bg-zinc-100 text-[#000000]"
                      : "bg-[#18181B] hover:bg-zinc-800 text-[#FFFFFF]"
                  }`}
                >
                  {isLoading ? (
                    <>
                      <Loader2
                        className={`w-5 h-5 animate-spin ${
                          isDark ? "text-black" : "text-white"
                        }`}
                      />
                      <span>Aceitando chamada...</span>
                    </>
                  ) : (
                    <span>{getPrimaryLabel()}</span>
                  )}
                </button>

                {/* Botão Secundário: Contato com a Loja */}
                <button
                  type="button"
                  onClick={() => onContactStore(request)}
                  className={`w-full font-medium py-3.5 px-4 rounded-[14px] text-[15px] sm:text-base transition-all flex items-center justify-center gap-2 select-none active:scale-[0.99] ${
                    isDark
                      ? "bg-transparent hover:bg-white/[0.08] text-white border border-white/20"
                      : "bg-transparent hover:bg-zinc-100 text-zinc-800 border border-zinc-300"
                  }`}
                >
                  <Phone className={`w-4 h-4 ${isDark ? "text-white" : "text-zinc-800"}`} />
                  <span>Contato com a loja</span>
                </button>

                {request.status === "accepted" && onCancelRequest && (
                  <div className="flex justify-center pt-0.5">
                    <button
                      type="button"
                      onClick={() => onCancelRequest(request)}
                      className="text-xs text-red-500 hover:text-red-600 transition py-1 underline font-medium"
                    >
                      Cancelar esta corrida
                    </button>
                  </div>
                )}
              </div>
            </>
          ) : (
            /* Standby / Sem corridas no momento - Organizado com botão de recolher */
            <div className="space-y-3.5 pt-0.5">
              {/* Barra de Topo do Standby: Status e Botão de Recolher */}
              <div className="flex items-center justify-between pb-1 border-b border-white/5">
                <div
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
                    isDark
                      ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/20"
                      : "bg-emerald-100 text-emerald-700 border border-emerald-200"
                  }`}
                >
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                  </span>
                  <span>Disponível no Radar</span>
                </div>

                {/* Botão de Recolher */}
                <button
                  type="button"
                  onClick={() => toggleCollapse(true)}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition active:scale-95 ${
                    isDark
                      ? "bg-zinc-800/90 hover:bg-zinc-700 text-zinc-300 border border-zinc-700"
                      : "bg-zinc-100 hover:bg-zinc-200 text-zinc-700 border border-zinc-300"
                  }`}
                  title="Recolher painel para ver mapa completo"
                >
                  <span>Recolher</span>
                  <ChevronDown className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Título Principal */}
              <div className="text-left space-y-0.5">
                <h3
                  className={`font-bold text-base sm:text-lg leading-tight ${
                    isDark ? "text-white" : "text-zinc-900"
                  }`}
                >
                  Aguardando novos chamados...
                </h3>
                <p
                  className={`text-xs ${
                    isDark ? "text-zinc-400" : "text-zinc-500"
                  }`}
                >
                  Você está posicionado e pronto para receber entregas. O toque sonoro tocará assim que surgir uma corrida.
                </p>
              </div>

              {/* Grid Organizado com 3 Indicadores de Prontidão */}
              <div className="grid grid-cols-3 gap-2 pt-1">
                {/* 1. Sirene */}
                <div
                  className={`p-2.5 rounded-xl border text-center flex flex-col items-center justify-center gap-1 ${
                    isDark
                      ? "bg-zinc-800/60 border-zinc-700/60 text-zinc-200"
                      : "bg-zinc-50 border-zinc-200 text-zinc-800"
                  }`}
                >
                  <div
                    className={`w-7 h-7 rounded-lg flex items-center justify-center ${
                      isDark ? "bg-amber-500/20 text-amber-400" : "bg-amber-100 text-amber-600"
                    }`}
                  >
                    <Bell className="w-3.5 h-3.5 animate-pulse" />
                  </div>
                  <span className="text-[11px] font-bold leading-none">Sirene</span>
                  <span className="text-[9px] text-emerald-500 font-semibold leading-none">Ativa</span>
                </div>

                {/* 2. GPS */}
                <div
                  className={`p-2.5 rounded-xl border text-center flex flex-col items-center justify-center gap-1 ${
                    isDark
                      ? "bg-zinc-800/60 border-zinc-700/60 text-zinc-200"
                      : "bg-zinc-50 border-zinc-200 text-zinc-800"
                  }`}
                >
                  <div
                    className={`w-7 h-7 rounded-lg flex items-center justify-center ${
                      isDark ? "bg-sky-500/20 text-sky-400" : "bg-sky-100 text-sky-600"
                    }`}
                  >
                    <Navigation className="w-3.5 h-3.5 animate-pulse" />
                  </div>
                  <span className="text-[11px] font-bold leading-none">GPS</span>
                  <span className="text-[9px] text-sky-500 font-semibold leading-none">Conectado</span>
                </div>

                {/* 3. Radar */}
                <div
                  className={`p-2.5 rounded-xl border text-center flex flex-col items-center justify-center gap-1 ${
                    isDark
                      ? "bg-zinc-800/60 border-zinc-700/60 text-zinc-200"
                      : "bg-zinc-50 border-zinc-200 text-zinc-800"
                  }`}
                >
                  <div
                    className={`w-7 h-7 rounded-lg flex items-center justify-center ${
                      isDark ? "bg-emerald-500/20 text-emerald-400" : "bg-emerald-100 text-emerald-600"
                    }`}
                  >
                    <Radio className="w-3.5 h-3.5 animate-pulse" />
                  </div>
                  <span className="text-[11px] font-bold leading-none">Radar</span>
                  <span className="text-[9px] text-emerald-500 font-semibold leading-none">Buscando</span>
                </div>
              </div>

              {/* Botão de Rodapé para Recolher e Ampliar o Mapa */}
              <button
                type="button"
                onClick={() => toggleCollapse(true)}
                className={`w-full py-2.5 px-3 rounded-xl text-xs font-semibold transition flex items-center justify-center gap-1.5 active:scale-95 ${
                  isDark
                    ? "bg-zinc-800/80 hover:bg-zinc-800 text-zinc-300 border border-zinc-700/80"
                    : "bg-zinc-100 hover:bg-zinc-200 text-zinc-700 border border-zinc-200"
                }`}
              >
                <ChevronDown className="w-3.5 h-3.5 text-zinc-400" />
                <span>Recolher painel para ver mapa completo</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DriverDarkActionCard;
