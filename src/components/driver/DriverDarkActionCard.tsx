import React from "react";
import { Phone, ChevronLeft, ChevronRight, Loader2, Navigation, AlertCircle } from "lucide-react";

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
  onCancelRequest?: (request: DeliveryCardData) => void;
  primaryButtonLabel?: string;
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
  onCancelRequest,
  primaryButtonLabel,
}) => {
  // Determine primary action text based on delivery status
  const getPrimaryLabel = () => {
    if (primaryButtonLabel) return primaryButtonLabel;
    if (!request) return "Aguardando";
    if (request.status === "accepted") return "Cheguei na Coleta / Coletado";
    if (request.status === "picked_up") return "Finalizar Entrega";
    return "Aceitar Corrida e Ir para Coleta";
  };

  return (
    <div className="w-full max-w-lg mx-auto pointer-events-auto">
      <div
        className="w-full text-white shadow-2xl transition-all duration-300"
        style={{
          backgroundColor: "#121214",
          borderRadius: "24px 24px 0 0",
          borderTop: "1px solid rgba(255, 255, 255, 0.08)",
          boxShadow: "0 -10px 40px rgba(0, 0, 0, 0.75)",
        }}
      >
        {/* Handle superior de arraste */}
        <div className="pt-3 pb-1 flex justify-center">
          <div className="w-12 h-1 rounded-full bg-zinc-600/80" />
        </div>

        <div className="px-5 pb-6 pt-2 space-y-4">
          {request ? (
            <>
              {/* Badge discreto quando houver mais de uma corrida pendente */}
              {totalPending > 1 && (
                <div className="flex items-center justify-between text-xs text-zinc-400 pb-1">
                  <span className="font-medium text-emerald-400">
                    Chamado {currentIndex + 1} de {totalPending}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={onPrev}
                      className="p-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 disabled:opacity-30"
                      disabled={currentIndex === 0}
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={onNext}
                      className="p-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 disabled:opacity-30"
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
                <div className="text-[15px] sm:text-base leading-snug">
                  <span className="text-zinc-400">Coleta: </span>
                  <span className="font-bold text-white tracking-wide">
                    {request.pickupName || "Estabelecimento"}
                  </span>
                </div>

                {/* Linha de Entrega */}
                <div className="text-[15px] sm:text-base leading-snug">
                  <span className="text-zinc-400">Entrega: </span>
                  <span className="text-zinc-100 font-normal">
                    {request.deliveryAddress || "Endereço não informado"}
                  </span>
                </div>
              </div>

              {/* Botões de Ação */}
              <div className="space-y-2.5 pt-1">
                {/* Botão Primário: Branco sólido, texto preto */}
                <button
                  type="button"
                  onClick={() => onPrimaryAction(request)}
                  disabled={isLoading}
                  className="w-full bg-[#FFFFFF] hover:bg-zinc-100 active:scale-[0.99] text-[#000000] font-bold py-3.5 px-4 rounded-[14px] text-[15px] sm:text-base shadow-lg transition-all flex items-center justify-center gap-2 select-none disabled:opacity-60"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin text-black" />
                      <span>Aceitando chamada...</span>
                    </>
                  ) : (
                    <span>{getPrimaryLabel()}</span>
                  )}
                </button>

                {/* Botão Secundário: Fundo transparente com borda fina branca/cinza */}
                <button
                  type="button"
                  onClick={() => onContactStore(request)}
                  className="w-full bg-transparent hover:bg-white/[0.08] active:scale-[0.99] text-white font-medium py-3.5 px-4 rounded-[14px] text-[15px] sm:text-base border border-white/20 transition-all flex items-center justify-center gap-2 select-none"
                >
                  <Phone className="w-4 h-4 text-white" />
                  <span>Contato com a loja</span>
                </button>

                {request.status === "accepted" && onCancelRequest && (
                  <div className="flex justify-center pt-0.5">
                    <button
                      type="button"
                      onClick={() => onCancelRequest(request)}
                      className="text-xs text-red-400 hover:text-red-300 transition py-1"
                    >
                      Cancelar esta corrida
                    </button>
                  </div>
                )}
              </div>
            </>
          ) : (
            /* Standby / Sem corridas no momento */
            <div className="py-4 text-center space-y-2">
              <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-zinc-800 text-emerald-400 mb-1">
                <Navigation className="w-5 h-5 animate-pulse" />
              </div>
              <h3 className="text-white font-medium text-base">Aguardando novos chamados...</h3>
              <p className="text-xs text-zinc-400 max-w-xs mx-auto">
                Você está posicionado e disponível. O toque sonoro tocará assim que uma nova corrida surgir.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DriverDarkActionCard;
