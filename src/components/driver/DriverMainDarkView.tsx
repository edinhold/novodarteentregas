import React, { useState } from "react";
import DriverDarkHeader from "./DriverDarkHeader";
import DriverDarkMap from "./DriverDarkMap";
import DriverDarkActionCard, { DeliveryCardData } from "./DriverDarkActionCard";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Phone, MessageSquare, X } from "lucide-react";
import ChatWidget from "@/components/ChatWidget";

interface DriverMainDarkViewProps {
  companyName?: string;
  isOnline: boolean;
  statusText?: string;
  driverPosition: { lat: number; lng: number } | null;
  heading?: number | null;
  activeRequest?: any;
  pendingRequests?: any[];
  onAcceptRequest: (id: string) => void;
  onUpdateStatus?: (id: string, status: string) => void;
  onCancelRequest?: (id: string) => void;
  onOpenMenu?: () => void;
  onTestSound?: () => void;
  currentUserId?: string;
}

export const DriverMainDarkView: React.FC<DriverMainDarkViewProps> = ({
  companyName = "Duarte Entregas",
  isOnline,
  statusText,
  driverPosition,
  heading,
  activeRequest,
  pendingRequests = [],
  onAcceptRequest,
  onUpdateStatus,
  onCancelRequest,
  onOpenMenu,
  onTestSound,
  currentUserId,
}) => {
  const [selectedPendingIndex, setSelectedPendingIndex] = useState(0);
  const [contactDialogOpen, setContactDialogOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [isAccepting, setIsAccepting] = useState(false);

  // Determinar qual chamado deve ser exibido no card inferior:
  // 1. Corrida ativa que já está em andamento com este motorista
  // 2. Ou chamada pendente selecionada
  const currentPending = pendingRequests[selectedPendingIndex] || pendingRequests[0] || null;

  const currentDelivery: DeliveryCardData | null = activeRequest
    ? {
        id: activeRequest.id,
        pickupName: activeRequest.restaurants?.name || "Loja",
        pickupAddress: activeRequest.pickup_address,
        deliveryAddress: activeRequest.delivery_address,
        phone: activeRequest.restaurants?.phone || null,
        status: activeRequest.status,
        driverFee: activeRequest.driver_fee,
        notes: activeRequest.notes,
      }
    : currentPending
    ? {
        id: currentPending.id,
        pickupName: currentPending.restaurants?.name || "Loja",
        pickupAddress: currentPending.pickup_address,
        deliveryAddress: currentPending.delivery_address,
        phone: currentPending.restaurants?.phone || null,
        status: currentPending.status || "pending",
        driverFee: currentPending.driver_fee,
        notes: currentPending.notes,
      }
    : null;

  // Coordenadas para o mapa (suporta delivery_lat/lng e pickup_lat/lng ou latitude/longitude do restaurante)
  const pickupLocation =
    (activeRequest?.pickup_lat && activeRequest?.pickup_lng)
      ? { lat: Number(activeRequest.pickup_lat), lng: Number(activeRequest.pickup_lng), name: activeRequest.restaurants?.name }
      : (activeRequest?.restaurants?.latitude && activeRequest?.restaurants?.longitude)
      ? { lat: Number(activeRequest.restaurants.latitude), lng: Number(activeRequest.restaurants.longitude), name: activeRequest.restaurants.name }
      : (currentPending?.pickup_lat && currentPending?.pickup_lng)
      ? { lat: Number(currentPending.pickup_lat), lng: Number(currentPending.pickup_lng), name: currentPending.restaurants?.name }
      : (currentPending?.restaurants?.latitude && currentPending?.restaurants?.longitude)
      ? { lat: Number(currentPending.restaurants.latitude), lng: Number(currentPending.restaurants.longitude), name: currentPending.restaurants.name }
      : null;

  const deliveryLocation =
    (activeRequest?.delivery_lat && activeRequest?.delivery_lng)
      ? { lat: Number(activeRequest.delivery_lat), lng: Number(activeRequest.delivery_lng), address: activeRequest.delivery_address }
      : (currentPending?.delivery_lat && currentPending?.delivery_lng)
      ? { lat: Number(currentPending.delivery_lat), lng: Number(currentPending.delivery_lng), address: currentPending.delivery_address }
      : null;

  const pendingLocations = pendingRequests
    .filter((r) => r.restaurants?.latitude && r.restaurants?.longitude)
    .map((r) => ({
      id: r.id,
      lat: Number(r.restaurants.latitude),
      lng: Number(r.restaurants.longitude),
      name: r.restaurants.name,
    }));

  // Ação primária do botão
  const handlePrimaryAction = async (delivery: DeliveryCardData) => {
    if (delivery.status === "accepted" && onUpdateStatus) {
      onUpdateStatus(delivery.id, "picked_up");
      return;
    }
    if (delivery.status === "picked_up" && onUpdateStatus) {
      onUpdateStatus(delivery.id, "delivered");
      return;
    }

    try {
      setIsAccepting(true);
      await onAcceptRequest(delivery.id);
    } finally {
      setIsAccepting(false);
    }
  };

  // Contato com a loja
  const handleContactStore = (delivery: DeliveryCardData) => {
    setContactDialogOpen(true);
  };

  const handleCallStore = () => {
    const phone = currentDelivery?.phone;
    if (phone) {
      window.location.href = `tel:${phone.replace(/\D/g, "")}`;
    }
    setContactDialogOpen(false);
  };

  return (
    <div className="relative w-full h-full min-h-[100dvh] bg-[#121214] overflow-hidden flex flex-col select-none">
      {/* 1. Header Superior Dark */}
      <DriverDarkHeader
        companyName={companyName}
        isOnline={isOnline}
        statusText={statusText}
        onOpenMenu={onOpenMenu}
        onTestSound={onTestSound}
      />

      {/* 2. Área do Mapa Central em Fullscreen */}
      <DriverDarkMap
        driverPosition={driverPosition}
        heading={heading}
        pickupLocation={pickupLocation}
        deliveryLocation={deliveryLocation}
        pendingLocations={pendingLocations}
        onSelectPending={(id) => {
          const idx = pendingRequests.findIndex((r) => r.id === id);
          if (idx !== -1) setSelectedPendingIndex(idx);
        }}
      />

      {/* 3. Bottom Sheet / Card Inferior de Ação */}
      <div className="absolute bottom-0 inset-x-0 z-20 pointer-events-none">
        <DriverDarkActionCard
          request={currentDelivery}
          totalPending={pendingRequests.length}
          currentIndex={selectedPendingIndex}
          isLoading={isAccepting}
          onPrev={() => setSelectedPendingIndex((prev) => Math.max(0, prev - 1))}
          onNext={() => setSelectedPendingIndex((prev) => Math.min(pendingRequests.length - 1, prev + 1))}
          onPrimaryAction={handlePrimaryAction}
          onContactStore={handleContactStore}
          onCancelRequest={(d) => onCancelRequest?.(d.id)}
        />
      </div>

      {/* Modal de Opções de Contato com o Estabelecimento */}
      <Dialog open={contactDialogOpen} onOpenChange={setContactDialogOpen}>
        <DialogContent className="bg-[#18181b] text-white border-zinc-800 max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-white text-base">
              Contato com a Loja
            </DialogTitle>
            <DialogDescription className="text-zinc-400 text-xs">
              {currentDelivery?.pickupName || "Estabelecimento parceiro"}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 pt-2">
            {currentDelivery?.phone ? (
              <Button
                onClick={handleCallStore}
                className="w-full bg-white hover:bg-zinc-100 text-black font-semibold h-12 rounded-xl flex items-center justify-center gap-2"
              >
                <Phone className="w-4 h-4 text-black" />
                Ligar ({currentDelivery.phone})
              </Button>
            ) : (
              <p className="text-xs text-zinc-400 text-center py-1">
                Telefone não cadastrado diretamente pela loja.
              </p>
            )}

            {currentDelivery?.id && currentUserId && (
              <Button
                variant="outline"
                onClick={() => {
                  setContactDialogOpen(false);
                  setChatOpen(true);
                }}
                className="w-full border-white/20 text-white hover:bg-white/10 h-12 rounded-xl flex items-center justify-center gap-2"
              >
                <MessageSquare className="w-4 h-4" />
                Abrir Chat com a Loja
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal de Chat Integrado com o Lojista */}
      <Dialog open={chatOpen} onOpenChange={setChatOpen}>
        <DialogContent className="bg-[#18181b] text-white border-zinc-800 max-w-md rounded-2xl p-4">
          <DialogHeader className="pb-2">
            <DialogTitle className="text-white text-base">
              Chat com a Loja
            </DialogTitle>
            <DialogDescription className="text-zinc-400 text-xs">
              {currentDelivery?.pickupName}
            </DialogDescription>
          </DialogHeader>

          {currentDelivery?.id && currentUserId && (
            <div className="mt-2">
              <ChatWidget
                deliveryRequestId={currentDelivery.id}
                currentUserId={currentUserId}
                title={`Chat - ${currentDelivery.pickupName}`}
                maxHeight="max-h-72"
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default DriverMainDarkView;
