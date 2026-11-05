import React, { useState, useEffect } from "react";
import DriverDarkHeader from "./DriverDarkHeader";
import DriverDarkMap from "./DriverDarkMap";
import DriverDarkActionCard, { DeliveryCardData } from "./DriverDarkActionCard";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Phone, MessageSquare, X, Navigation, MapPin, ExternalLink } from "lucide-react";
import ChatWidget from "@/components/ChatWidget";
import { geocodeAddress } from "@/services/mapbox";
import { resolveStoreCoordinates, isWithinPrimaveraBounds, formatStorePickupAddress } from "@/config/maps";

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
  const [geocodedPickup, setGeocodedPickup] = useState<{ lat: number; lng: number; name?: string } | null>(null);
  const [geocodedDelivery, setGeocodedDelivery] = useState<{ lat: number; lng: number; address?: string } | null>(null);
  const [isStandbyCollapsed, setIsStandbyCollapsed] = useState(false);

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

  // Determinar qual chamado deve ser exibido no card inferior:
  // 1. Corrida ativa que já está em andamento com este motorista
  // 2. Ou chamada pendente selecionada
  const currentPending = pendingRequests[selectedPendingIndex] || pendingRequests[0] || null;

  const currentDelivery: DeliveryCardData | null = activeRequest
    ? {
        id: activeRequest.id,
        pickupName: activeRequest.restaurants?.name || "Loja",
        pickupAddress: formatStorePickupAddress(activeRequest.restaurants, activeRequest.pickup_address),
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
        pickupAddress: formatStorePickupAddress(currentPending.restaurants, currentPending.pickup_address),
        deliveryAddress: currentPending.delivery_address,
        phone: currentPending.restaurants?.phone || null,
        status: currentPending.status || "pending",
        driverFee: currentPending.driver_fee,
        notes: currentPending.notes,
      }
    : null;

  // Coordenadas base para o mapa:
  // Resolvemos a coleta usando resolução sênior com dicionário e bounds de Primavera do Leste
  const activeOrPendingRest = activeRequest?.restaurants || currentPending?.restaurants;
  const activeOrPendingPickupLat = activeRequest?.pickup_lat ?? currentPending?.pickup_lat;
  const activeOrPendingPickupLng = activeRequest?.pickup_lng ?? currentPending?.pickup_lng;
  const resolvedStore = resolveStoreCoordinates(activeOrPendingRest, activeOrPendingPickupLat, activeOrPendingPickupLng);

  const basePickupLocation = resolvedStore
    ? {
        lat: resolvedStore.lat,
        lng: resolvedStore.lng,
        name: activeOrPendingRest?.name || activeRequest?.pickup_name || currentPending?.pickup_name || "Coleta",
      }
    : null;

  const baseDeliveryLocation =
    (activeRequest?.delivery_lat && activeRequest?.delivery_lng && isWithinPrimaveraBounds(Number(activeRequest.delivery_lat), Number(activeRequest.delivery_lng)))
      ? { lat: Number(activeRequest.delivery_lat), lng: Number(activeRequest.delivery_lng), address: activeRequest.delivery_address }
      : (currentPending?.delivery_lat && currentPending?.delivery_lng && isWithinPrimaveraBounds(Number(currentPending.delivery_lat), Number(currentPending.delivery_lng)))
      ? { lat: Number(currentPending.delivery_lat), lng: Number(currentPending.delivery_lng), address: currentPending.delivery_address }
      : null;

  // Geocodificação inteligente via Mapbox caso faltem coordenadas numéricas
  useEffect(() => {
    let isCancelled = false;

    if (!baseDeliveryLocation && currentDelivery?.deliveryAddress) {
      const fullDelivery = currentDelivery.deliveryAddress.includes("Primavera do Leste")
        ? currentDelivery.deliveryAddress
        : `${currentDelivery.deliveryAddress}, Primavera do Leste - MT`;

      geocodeAddress(fullDelivery)
        .then((res) => {
          if (!isCancelled && res?.coordinates) {
            setGeocodedDelivery({
              lat: res.coordinates.latitude,
              lng: res.coordinates.longitude,
              address: res.fullAddress || currentDelivery.deliveryAddress,
            });
          }
        })
        .catch((err) => {
          console.warn("[DriverMainDarkView] Geocode delivery warning:", err);
        });
    } else {
      setGeocodedDelivery(null);
    }

    if (!basePickupLocation && currentDelivery?.pickupAddress) {
      const fullPickup = currentDelivery.pickupAddress.includes("Primavera do Leste")
        ? currentDelivery.pickupAddress
        : `${currentDelivery.pickupAddress}, Primavera do Leste - MT`;

      geocodeAddress(fullPickup)
        .then((res) => {
          if (!isCancelled && res?.coordinates) {
            setGeocodedPickup({
              lat: res.coordinates.latitude,
              lng: res.coordinates.longitude,
              name: currentDelivery.pickupName,
            });
          }
        })
        .catch((err) => {
          console.warn("[DriverMainDarkView] Geocode pickup warning:", err);
        });
    } else {
      setGeocodedPickup(null);
    }

    return () => {
      isCancelled = true;
    };
  }, [currentDelivery?.id, currentDelivery?.deliveryAddress, currentDelivery?.pickupAddress, baseDeliveryLocation?.lat, basePickupLocation?.lat]);

  const pickupLocation = basePickupLocation || geocodedPickup;
  const deliveryLocation = baseDeliveryLocation || geocodedDelivery;

  const pendingLocations = pendingRequests.map((r) => {
    const coords = resolveStoreCoordinates(r.restaurants, r.pickup_lat, r.pickup_lng);
    return {
      id: r.id,
      lat: coords.lat,
      lng: coords.lng,
      name: r.restaurants?.name || "Chamado",
    };
  });

  // Redirecionamento GPS Externo (Google Maps / Waze)
  const handleOpenNavigation = (app: "google" | "waze") => {
    if (!currentDelivery) return;

    // Se já coletou (status === "picked_up"), o destino atual é a Entrega do cliente.
    // Se acabou de aceitar (status === "accepted" ou "pending"), o destino atual é a Coleta na loja.
    const isHeadingToDelivery = currentDelivery.status === "picked_up";
    const targetLoc = isHeadingToDelivery ? deliveryLocation : pickupLocation;
    const rawTargetAddress = isHeadingToDelivery
      ? currentDelivery.deliveryAddress
      : currentDelivery.pickupAddress || currentDelivery.pickupName;

    const targetAddress = rawTargetAddress && !rawTargetAddress.includes("Primavera do Leste")
      ? `${rawTargetAddress}, Primavera do Leste - MT, Brasil`
      : rawTargetAddress || "Primavera do Leste - MT, Brasil";

    const lat = targetLoc?.lat;
    const lng = targetLoc?.lng;

    if (app === "waze") {
      if (lat && lng) {
        window.open(`https://waze.com/ul?ll=${lat},${lng}&navigate=yes`, "_blank");
      } else {
        window.open(`https://waze.com/ul?q=${encodeURIComponent(targetAddress)}&navigate=yes`, "_blank");
      }
    } else {
      // Google Maps: aciona diretamente o aplicativo de navegação ou web com rota
      const originParam = driverPosition ? `&origin=${driverPosition.lat},${driverPosition.lng}` : "";
      if (lat && lng) {
        window.open(`https://www.google.com/maps/dir/?api=1${originParam}&destination=${lat},${lng}&travelmode=driving`, "_blank");
      } else {
        window.open(`https://www.google.com/maps/dir/?api=1${originParam}&destination=${encodeURIComponent(targetAddress)}&travelmode=driving`, "_blank");
      }
    }
  };

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
    <div
      className={`relative w-full h-full min-h-[100dvh] overflow-hidden flex flex-col select-none transition-colors duration-300 ${
        isDark ? "bg-[#121214]" : "bg-slate-100"
      }`}
    >
      {/* 1. Header Superior Dark / Claro */}
      <DriverDarkHeader
        companyName={companyName}
        isOnline={isOnline}
        statusText={statusText}
        onOpenMenu={onOpenMenu}
        onTestSound={onTestSound}
      />

      {/* Banner Superior de Rota Ativa com Atalho para Google Maps / Waze */}
      {activeRequest && (
        <div className="absolute top-[68px] inset-x-0 z-20 px-4 pointer-events-none">
          <div
            className={`max-w-md mx-auto rounded-2xl p-2.5 shadow-xl backdrop-blur-md flex items-center justify-between gap-3 pointer-events-auto border transition-colors ${
              isDark
                ? "bg-[#18181b]/95 border-zinc-700/80 text-white"
                : "bg-white/95 border-zinc-200 text-zinc-900 shadow-md"
            }`}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div
                className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                  isDark ? "bg-sky-500/20 text-sky-400" : "bg-sky-100 text-sky-600"
                }`}
              >
                <Navigation className="w-4 h-4 animate-pulse" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] uppercase font-bold text-sky-500 tracking-wider">
                  {activeRequest.status === "accepted" ? "A Caminho da Coleta" : "A Caminho da Entrega"}
                </p>
                <p
                  className={`text-xs font-semibold truncate ${
                    isDark ? "text-white" : "text-zinc-900"
                  }`}
                >
                  {activeRequest.status === "accepted" ? (activeRequest.restaurants?.name || activeRequest.pickup_address) : activeRequest.delivery_address}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => handleOpenNavigation("google")}
                className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border flex items-center gap-1 active:scale-95 shadow-sm transition ${
                  isDark
                    ? "bg-zinc-800 hover:bg-zinc-700 text-white border-zinc-600"
                    : "bg-zinc-100 hover:bg-zinc-200 text-zinc-900 border-zinc-200"
                }`}
                title="Google Maps"
              >
                <MapPin className="w-3 h-3 text-emerald-500" />
                <span>Maps</span>
              </button>
              <button
                type="button"
                onClick={() => handleOpenNavigation("waze")}
                className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border flex items-center gap-1 active:scale-95 shadow-sm transition ${
                  isDark
                    ? "bg-zinc-800 hover:bg-zinc-700 text-white border-zinc-600"
                    : "bg-zinc-100 hover:bg-zinc-200 text-zinc-900 border-zinc-200"
                }`}
                title="Waze"
              >
                <ExternalLink className="w-3 h-3 text-sky-500" />
                <span>Waze</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. Área do Mapa Central em Fullscreen (OpenStreetMap como padrão com geocodificação Mapbox) */}
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
        isBottomCardCollapsed={!currentDelivery && isStandbyCollapsed}
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
          onOpenNavigation={handleOpenNavigation}
          onCancelRequest={(d) => onCancelRequest?.(d.id)}
          isStandbyCollapsed={isStandbyCollapsed}
          onToggleStandbyCollapse={setIsStandbyCollapsed}
        />
      </div>

      {/* Modal de Opções de Contato com o Estabelecimento */}
      <Dialog open={contactDialogOpen} onOpenChange={setContactDialogOpen}>
        <DialogContent
          className={`max-w-sm rounded-2xl ${
            isDark ? "bg-[#18181b] text-white border-zinc-800" : "bg-white text-zinc-900 border-zinc-200"
          }`}
        >
          <DialogHeader>
            <DialogTitle className={isDark ? "text-white text-base" : "text-zinc-900 text-base"}>
              Contato com a Loja
            </DialogTitle>
            <DialogDescription className={isDark ? "text-zinc-400 text-xs" : "text-zinc-500 text-xs"}>
              {currentDelivery?.pickupName || "Estabelecimento parceiro"}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 pt-2">
            {currentDelivery?.phone ? (
              <Button
                onClick={handleCallStore}
                className={`w-full font-semibold h-12 rounded-xl flex items-center justify-center gap-2 ${
                  isDark
                    ? "bg-white hover:bg-zinc-100 text-black"
                    : "bg-zinc-900 hover:bg-zinc-800 text-white"
                }`}
              >
                <Phone className={`w-4 h-4 ${isDark ? "text-black" : "text-white"}`} />
                Ligar ({currentDelivery.phone})
              </Button>
            ) : (
              <p className={`text-xs text-center py-1 ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
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
                className={`w-full h-12 rounded-xl flex items-center justify-center gap-2 ${
                  isDark
                    ? "border-white/20 text-white hover:bg-white/10"
                    : "border-zinc-300 text-zinc-900 hover:bg-zinc-100"
                }`}
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
        <DialogContent
          className={`max-w-md rounded-2xl p-4 ${
            isDark ? "bg-[#18181b] text-white border-zinc-800" : "bg-white text-zinc-900 border-zinc-200"
          }`}
        >
          <DialogHeader className="pb-2">
            <DialogTitle className={isDark ? "text-white text-base" : "text-zinc-900 text-base"}>
              Chat com a Loja
            </DialogTitle>
            <DialogDescription className={isDark ? "text-zinc-400 text-xs" : "text-zinc-500 text-xs"}>
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
