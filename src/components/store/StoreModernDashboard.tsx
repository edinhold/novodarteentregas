import React, { useState, useEffect, useRef, useMemo } from "react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Bike,
  Search,
  MapPin,
  User,
  ChevronRight,
  Clock,
  XCircle,
  Phone,
  MessageCircle,
  AlertCircle,
  Loader2,
  Wallet,
  Compass,
  ArrowRight,
  ExternalLink,
  CheckCircle2,
  Plus,
} from "lucide-react";
import { searchAddressSuggestions, geocodeAddress, calculateRoute } from "@/services/mapbox";
import { notifyAvailableDrivers } from "@/lib/push";
import { useDriverLocations } from "@/hooks/useDriverLocations";
import StoreMiniTrackingMap from "./StoreMiniTrackingMap";
import { normalizeWhatsAppNumber, formatPhoneNumber } from "@/lib/phoneUtils";
import { DriverPhoto } from "@/components/DriverPhoto";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface StoreModernDashboardProps {
  user: any;
  restaurant: any;
  requests: any[];
  credits?: any;
  activeRequest?: any;
  onOpenCancelModal: (requestId: string, driverName?: string | null, isAccepted?: boolean, driverDetails?: any | null) => void;
  onNavigateTab?: (tab: string) => void;
  isDark?: boolean;
}

export const StoreModernDashboard: React.FC<StoreModernDashboardProps> = ({
  user,
  restaurant,
  requests = [],
  credits,
  activeRequest,
  onOpenCancelModal,
  onNavigateTab,
  isDark = false,
}) => {
  const queryClient = useQueryClient();
  const formCardRef = useRef<HTMLDivElement>(null);
  const recipientInputRef = useRef<HTMLInputElement>(null);

  // Estados do Formulário de Envio
  const [recipientName, setRecipientName] = useState("");
  const [addressInput, setAddressInput] = useState("");
  const [streetNumber, setStreetNumber] = useState("");
  const [observation, setObservation] = useState("");
  const [destinationType, setDestinationType] = useState("Casa / Residência");
  const [additionalNotes, setAdditionalNotes] = useState("");

  // Estados de Geocodificação e Autocomplete
  const [addressSuggestions, setAddressSuggestions] = useState<any[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [searchingAddress, setSearchingAddress] = useState(false);
  const [deliveryCoordinates, setDeliveryCoordinates] = useState<{ lat: number; lng: number } | null>(null);
  const [estimatedDistanceKm, setEstimatedDistanceKm] = useState<number>(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  // Estado das Abas de Filtragem de Entregas Ativas
  const [statusFilter, setStatusFilter] = useState<"pending" | "accepted" | "picked_up" | "all">("pending");

  // Estado para Modal de Detalhes da Corrida
  const [selectedOrderDetails, setSelectedOrderDetails] = useState<any | null>(null);

  // Rastreamento de localização de motoristas em tempo real
  const { data: driverLocations = [] } = useDriverLocations();

  // Consulta de configuração de taxas da plataforma
  const { data: deliveryConfig } = useQuery({
    queryKey: ["delivery-config"],
    queryFn: async () => {
      const { data } = await (supabase as any).rpc("get_public_delivery_config");
      return Array.isArray(data) ? data[0] : data;
    },
    staleTime: 1000 * 60 * 5,
  });

  // Fecha sugestões ao clicar fora
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (suggestionsRef.current && !suggestionsRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Busca sugestões de endereço enquanto o lojista digita (com debounce)
  useEffect(() => {
    if (!addressInput.trim() || addressInput.trim().length < 3) {
      setAddressSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    const timer = setTimeout(async () => {
      setSearchingAddress(true);
      try {
        const proximity = restaurant?.latitude && restaurant?.longitude
          ? { lat: restaurant.latitude, lng: restaurant.longitude }
          : undefined;

        const results = await searchAddressSuggestions(addressInput, {
          proximity,
          limit: 5,
        });

        setAddressSuggestions(results || []);
        setShowSuggestions((results || []).length > 0);
      } catch (err) {
        console.warn("[StoreModernDashboard] Erro ao buscar endereços:", err);
      } finally {
        setSearchingAddress(false);
      }
    }, 280);

    return () => clearTimeout(timer);
  }, [addressInput, restaurant]);

  // Recalcula rota e distância quando coordenadas mudam
  useEffect(() => {
    if (!deliveryCoordinates || !restaurant?.latitude || !restaurant?.longitude) {
      setEstimatedDistanceKm(0);
      return;
    }

    let isCancelled = false;
    const calc = async () => {
      try {
        const routeData = await calculateRoute(
          { lat: restaurant.latitude, lng: restaurant.longitude },
          deliveryCoordinates,
          "driving"
        );
        if (!isCancelled && routeData?.distanceMeters) {
          setEstimatedDistanceKm(Number((routeData.distanceMeters / 1000).toFixed(1)));
        }
      } catch {
        // Fallback cálculo direto
        const R = 6371;
        const dLat = ((deliveryCoordinates.lat - restaurant.latitude) * Math.PI) / 180;
        const dLon = ((deliveryCoordinates.lng - restaurant.longitude) * Math.PI) / 180;
        const a =
          Math.sin(dLat / 2) * Math.sin(dLat / 2) +
          Math.cos((restaurant.latitude * Math.PI) / 180) *
            Math.cos((deliveryCoordinates.lat * Math.PI) / 180) *
            Math.sin(dLon / 2) *
            Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        if (!isCancelled) {
          setEstimatedDistanceKm(Number((R * c).toFixed(1)));
        }
      }
    };

    calc();
    return () => {
      isCancelled = true;
    };
  }, [deliveryCoordinates, restaurant]);

  // Cálculo da estimativa de preço com base na distância
  const estimatedCost = useMemo(() => {
    if (!deliveryConfig || estimatedDistanceKm <= 0) return null;
    const baseFee = Number(deliveryConfig.base_fee ?? 5);
    const feePerKm = Number(deliveryConfig.fee_per_km ?? 1.5);
    const minKm = Number(deliveryConfig.min_km ?? 0);
    const chargeableKm = Math.max(0, estimatedDistanceKm - minKm);
    return baseFee + chargeableKm * feePerKm;
  }, [deliveryConfig, estimatedDistanceKm]);

  // Seleciona um endereço da lista de sugestões
  const handleSelectSuggestion = (sug: any) => {
    const lat = parseFloat(sug.lat);
    const lon = parseFloat(sug.lon);
    setAddressInput(sug.display_name.split(",")[0] || sug.display_name);
    setDeliveryCoordinates({ lat, lng: lon });
    setShowSuggestions(false);
  };

  // Envio do formulário (Criação da corrida / Chamada do entregador)
  const handleSubmitDelivery = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    if (!addressInput.trim()) {
      toast.error("Por favor, digite o endereço de entrega.");
      return;
    }

    let finalCoordinates = deliveryCoordinates;
    let finalDistance = estimatedDistanceKm;

    // Se o usuário digitou mas não selecionou sugestão, geocodifica agora
    if (!finalCoordinates) {
      try {
        setIsSubmitting(true);
        const geo = await geocodeAddress(`${addressInput}, Primavera do Leste`);
        if (geo) {
          finalCoordinates = { lat: geo.latitude, lng: geo.longitude };
          setDeliveryCoordinates(finalCoordinates);
          finalDistance = 3.0; // Distância média de segurança
        }
      } catch {
        // continua
      }
    }

    const fullAddress = streetNumber.trim()
      ? `${addressInput.trim()}, ${streetNumber.trim()} - Primavera do Leste`
      : `${addressInput.trim()} - Primavera do Leste`;

    // Compila observações completas
    const notesParts: string[] = [];
    if (recipientName.trim()) notesParts.push(`Destinatário: ${recipientName.trim()}`);
    if (destinationType) notesParts.push(`Tipo: ${destinationType}`);
    if (observation.trim()) notesParts.push(`Obs: ${observation.trim()}`);
    if (additionalNotes.trim()) notesParts.push(additionalNotes.trim());
    const compiledNotes = notesParts.join(" • ");

    const pickupAddress = restaurant?.address || "Primavera do Leste";

    setIsSubmitting(true);
    try {
      const { data: requestId, error } = await supabase.rpc("deduct_credits_for_delivery", {
        p_pickup_address: pickupAddress,
        p_delivery_address: fullAddress,
        p_notes: compiledNotes || null,
        p_restaurant_id: restaurant?.id || null,
        p_distance_km: finalDistance > 0 ? finalDistance : 3.0,
        p_preferred_driver_id: null,
      } as any);

      if (error) throw error;

      // Dispara push de notificação a todos os motoristas cadastrados
      if (requestId) {
        void notifyAvailableDrivers(String(requestId));
      }

      toast.success("🚀 Entrega solicitada com sucesso! Notificando motoristas...");

      // Limpa formulário
      setRecipientName("");
      setAddressInput("");
      setStreetNumber("");
      setObservation("");
      setAdditionalNotes("");
      setDeliveryCoordinates(null);
      setEstimatedDistanceKm(0);

      // Atualiza consultas
      queryClient.invalidateQueries({ queryKey: ["my-delivery-requests"] });
      queryClient.invalidateQueries({ queryKey: ["my-credits"] });
    } catch (err: any) {
      console.error("[StoreModernDashboard] Erro ao criar envio:", err);
      toast.error(err.message || "Erro ao solicitar entrega. Verifique seus créditos.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Rola até o formulário de envio ao clicar em "Solicitar Nova Entrega"
  const handleScrollToForm = () => {
    if (formCardRef.current) {
      formCardRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
      setTimeout(() => {
        recipientInputRef.current?.focus();
      }, 400);
    }
  };

  // Filtra as entregas conforme a aba ativa
  const filteredRequests = useMemo(() => {
    return requests.filter((r) => {
      if (statusFilter === "pending") return r.status === "pending";
      if (statusFilter === "accepted") return r.status === "accepted";
      if (statusFilter === "picked_up") return r.status === "picked_up";
      return !["delivered", "cancelled"].includes(r.status);
    });
  }, [requests, statusFilter]);

  // Contagem para as abas
  const countPending = useMemo(() => requests.filter((r) => r.status === "pending").length, [requests]);
  const countAccepted = useMemo(() => requests.filter((r) => r.status === "accepted").length, [requests]);
  const countTransit = useMemo(() => requests.filter((r) => r.status === "picked_up").length, [requests]);

  // Corrida para exibição no mini-mapa: prioriza ativa em rota ou aceita
  const displayMapRequest = useMemo(() => {
    return requests.find((r) => r.status === "picked_up") ||
      requests.find((r) => r.status === "accepted") ||
      requests.find((r) => r.status === "pending") ||
      null;
  }, [requests]);

  // Coordenadas do motorista da corrida exibida no mini-mapa
  const currentDriverPos = useMemo(() => {
    if (!displayMapRequest?.driver_id) return null;
    const dl = driverLocations.find(
      (d: any) => d.user_id === displayMapRequest.driver_id || d.driver_id === displayMapRequest.driver_id
    );
    if (dl?.latitude && dl?.longitude) {
      return { lat: dl.latitude, lng: dl.longitude };
    }
    return null;
  }, [displayMapRequest, driverLocations]);

  // Coordenadas de entrega da corrida exibida no mini-mapa
  const mapDeliveryLocation = useMemo(() => {
    if (deliveryCoordinates) return deliveryCoordinates;
    if (restaurant?.latitude && restaurant?.longitude) {
      // Pequeno offset demonstrativo caso a corrida ainda não tenha geocode salvo
      return { lat: restaurant.latitude + 0.008, lng: restaurant.longitude + 0.009 };
    }
    return null;
  }, [deliveryCoordinates, restaurant]);

  return (
    <div className={`flex flex-col flex-1 w-full min-h-screen transition-colors duration-300 ${isDark ? "bg-[#0d0d0f] text-white" : "bg-slate-50 text-zinc-900"}`}>
      {/* 1. Cabeçalho Superior (Header Limpo e Branco / Dark) */}
      <header
        className={`w-full px-5 sm:px-8 py-3.5 border-b flex items-center justify-between sticky top-0 z-20 backdrop-blur-md shadow-xs transition-colors duration-300 ${
          isDark
            ? "bg-[#18181B]/95 border-zinc-800 text-white"
            : "bg-white/95 border-zinc-200/80 text-zinc-900"
        }`}
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[#EA580C] text-white flex items-center justify-center shadow-md shadow-orange-500/20">
            <Bike className="w-5 h-5" />
          </div>
          <div>
            <h1 className="font-extrabold text-base sm:text-lg tracking-tight leading-none text-foreground">
              Duarte Entregas - Painel da Loja
            </h1>
            <p className={`text-[11px] font-medium leading-tight mt-1 ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
              {restaurant?.name || "Estabelecimento Parceiro"} • Primavera do Leste
            </p>
          </div>
        </div>

        {/* Lado Direito: Saldo de Créditos e Botão Laranja "Solicitar Nova Entrega" */}
        <div className="flex items-center gap-3">
          {credits && (
            <button
              type="button"
              onClick={() => onNavigateTab?.("credits")}
              className={`hidden md:flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-semibold transition active:scale-95 ${
                isDark
                  ? "bg-zinc-800/80 border-zinc-700 text-emerald-400 hover:bg-zinc-800"
                  : "bg-emerald-50 border-emerald-200 text-emerald-800 hover:bg-emerald-100"
              }`}
              title="Clique para gerenciar créditos"
            >
              <Wallet className="w-3.5 h-3.5 text-emerald-500" />
              <span>Saldo: R$ {Number(credits.balance || 0).toFixed(2)}</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleScrollToForm}
            className="bg-[#EA580C] hover:bg-[#C2410C] text-white font-bold text-xs sm:text-sm px-4 sm:px-5 py-2.5 rounded-xl shadow-md shadow-orange-500/25 flex items-center gap-2 transition-all active:scale-95 select-none"
          >
            <Plus className="w-4 h-4 stroke-[3]" />
            <span>Solicitar Nova Entrega</span>
          </button>
        </div>
      </header>

      {/* 2. Área Central com Grid de 2 Colunas (Envio à Esquerda, Entregas Ativas à Direita) */}
      <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* ======================================================== */}
          {/* COLUNA ESQUERDA: PAINEL "ENVIO" (FORMULÁRIO MODERNO)      */}
          {/* ======================================================== */}
          <div
            ref={formCardRef}
            className={`lg:col-span-5 rounded-2xl p-5 sm:p-6 border shadow-sm transition-all duration-300 ${
              isDark
                ? "bg-[#18181B] border-zinc-800/90 text-white shadow-black/40"
                : "bg-white border-zinc-200/90 text-zinc-900 shadow-slate-200/60"
            }`}
          >
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-border/40">
              <h2 className="font-extrabold text-lg tracking-tight text-foreground">
                Envio
              </h2>
              <span className="text-[11px] font-semibold text-[#EA580C] bg-orange-500/10 px-2.5 py-0.5 rounded-full border border-orange-500/20">
                Novo Chamado
              </span>
            </div>

            <form onSubmit={handleSubmitDelivery} className="space-y-3.5">
              {/* Campo: Nome do Destinatário */}
              <div className="space-y-1">
                <label className={`text-xs font-semibold ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>
                  Nome do Destinatário
                </label>
                <div className="relative">
                  <input
                    ref={recipientInputRef}
                    type="text"
                    value={recipientName}
                    onChange={(e) => setRecipientName(e.target.value)}
                    placeholder="Ex: João da Silva"
                    className={`w-full px-3.5 py-2.5 rounded-xl border text-xs sm:text-sm transition outline-none ${
                      isDark
                        ? "bg-[#121214] border-zinc-700 text-white placeholder-zinc-500 focus:border-[#EA580C]"
                        : "bg-white border-zinc-300 text-zinc-900 placeholder-zinc-400 focus:border-[#EA580C]"
                    }`}
                  />
                  <User className="absolute right-3 top-2.5 w-4 h-4 text-zinc-400 pointer-events-none" />
                </div>
              </div>

              {/* Campo: Endereço com Autocomplete / Geocodificação Mapbox */}
              <div className="space-y-1 relative" ref={suggestionsRef}>
                <label className={`text-xs font-semibold ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>
                  Endereço
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={addressInput}
                    onChange={(e) => setAddressInput(e.target.value)}
                    onFocus={() => addressSuggestions.length > 0 && setShowSuggestions(true)}
                    placeholder="Rua, avenida ou bairro em Primavera..."
                    className={`w-full px-3.5 py-2.5 pr-8 rounded-xl border text-xs sm:text-sm transition outline-none ${
                      isDark
                        ? "bg-[#121214] border-zinc-700 text-white placeholder-zinc-500 focus:border-[#EA580C]"
                        : "bg-white border-zinc-300 text-zinc-900 placeholder-zinc-400 focus:border-[#EA580C]"
                    }`}
                  />
                  <div className="absolute right-2.5 top-2.5">
                    {searchingAddress ? (
                      <Loader2 className="w-4 h-4 animate-spin text-[#EA580C]" />
                    ) : (
                      <MapPin className="w-4 h-4 text-zinc-400" />
                    )}
                  </div>
                </div>

                {/* Lista Dropdown de Sugestões de Endereço */}
                {showSuggestions && addressSuggestions.length > 0 && (
                  <div
                    className={`absolute z-30 left-0 right-0 mt-1 rounded-xl border shadow-xl max-h-56 overflow-y-auto divide-y backdrop-blur-md ${
                      isDark
                        ? "bg-[#18181B] border-zinc-700 divide-zinc-800"
                        : "bg-white border-zinc-200 divide-zinc-100"
                    }`}
                  >
                    {addressSuggestions.map((sug, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => handleSelectSuggestion(sug)}
                        className={`w-full px-3.5 py-2.5 text-left text-xs sm:text-sm transition flex items-center gap-2.5 ${
                          isDark
                            ? "hover:bg-zinc-800 text-zinc-200"
                            : "hover:bg-orange-50/70 text-zinc-800"
                        }`}
                      >
                        <MapPin className="w-3.5 h-3.5 text-[#EA580C] shrink-0" />
                        <span className="truncate">{sug.display_name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Campo: Número / Complemento */}
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-1 space-y-1">
                  <label className={`text-xs font-semibold ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>
                    Número
                  </label>
                  <input
                    type="text"
                    value={streetNumber}
                    onChange={(e) => setStreetNumber(e.target.value)}
                    placeholder="123"
                    className={`w-full px-3 py-2.5 rounded-xl border text-xs sm:text-sm transition outline-none ${
                      isDark
                        ? "bg-[#121214] border-zinc-700 text-white placeholder-zinc-500 focus:border-[#EA580C]"
                        : "bg-white border-zinc-300 text-zinc-900 placeholder-zinc-400 focus:border-[#EA580C]"
                    }`}
                  />
                </div>

                {/* Campo: Observação (linha única) */}
                <div className="col-span-2 space-y-1">
                  <label className={`text-xs font-semibold ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>
                    Observação
                  </label>
                  <input
                    type="text"
                    value={observation}
                    onChange={(e) => setObservation(e.target.value)}
                    placeholder="Ex: Apto 302, Bloco B"
                    className={`w-full px-3.5 py-2.5 rounded-xl border text-xs sm:text-sm transition outline-none ${
                      isDark
                        ? "bg-[#121214] border-zinc-700 text-white placeholder-zinc-500 focus:border-[#EA580C]"
                        : "bg-white border-zinc-300 text-zinc-900 placeholder-zinc-400 focus:border-[#EA580C]"
                    }`}
                  />
                </div>
              </div>

              {/* Campo: Ponto de Referência / Tipo de Destino (Dropdown Seletor) */}
              <div className="space-y-1">
                <label className={`text-xs font-semibold ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>
                  Ponto de Referência / Tipo de Destino
                </label>
                <select
                  value={destinationType}
                  onChange={(e) => setDestinationType(e.target.value)}
                  className={`w-full px-3.5 py-2.5 rounded-xl border text-xs sm:text-sm transition outline-none cursor-pointer ${
                    isDark
                      ? "bg-[#121214] border-zinc-700 text-white focus:border-[#EA580C]"
                      : "bg-white border-zinc-300 text-zinc-900 focus:border-[#EA580C]"
                  }`}
                >
                  <option value="Casa / Residência">Casa / Residência</option>
                  <option value="Apartamento / Condomínio">Apartamento / Condomínio</option>
                  <option value="Comércio / Loja">Comércio / Loja</option>
                  <option value="Escritório / Empresa">Escritório / Empresa</option>
                  <option value="Hospital / Clínica">Hospital / Clínica</option>
                  <option value="Outro ponto de referência">Outro ponto de referência</option>
                </select>
              </div>

              {/* Campo: Observação Adicional (Textarea Multilinhas) */}
              <div className="space-y-1">
                <label className={`text-xs font-semibold ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>
                  Observação adicional
                </label>
                <textarea
                  value={additionalNotes}
                  onChange={(e) => setAdditionalNotes(e.target.value)}
                  rows={2}
                  placeholder="Instruções de entrega, interfone, troco..."
                  className={`w-full px-3.5 py-2 rounded-xl border text-xs sm:text-sm transition outline-none resize-none ${
                    isDark
                      ? "bg-[#121214] border-zinc-700 text-white placeholder-zinc-500 focus:border-[#EA580C]"
                      : "bg-white border-zinc-300 text-zinc-900 placeholder-zinc-400 focus:border-[#EA580C]"
                  }`}
                />
              </div>

              {/* Prévia de Rota e Taxa Estimada */}
              {estimatedDistanceKm > 0 && (
                <div
                  className={`p-2.5 rounded-xl border flex items-center justify-between text-xs ${
                    isDark
                      ? "bg-zinc-800/70 border-zinc-700 text-zinc-300"
                      : "bg-orange-50/70 border-orange-200 text-orange-950"
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    <Compass className="w-3.5 h-3.5 text-[#EA580C]" />
                    <span>Distância: <strong>{estimatedDistanceKm} km</strong></span>
                  </div>
                  {estimatedCost !== null && (
                    <span className="font-bold text-[#EA580C]">
                      Taxa estimada: R$ {estimatedCost.toFixed(2)}
                    </span>
                  )}
                </div>
              )}

              {/* Botão de Envio (Laranja Largo com Cantos Arredondados) */}
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full bg-[#EA580C] hover:bg-[#C2410C] text-white font-extrabold text-base py-3.5 px-4 rounded-xl shadow-lg shadow-orange-500/25 transition-all duration-200 active:scale-[0.99] disabled:opacity-60 flex items-center justify-center gap-2 select-none cursor-pointer mt-2"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin text-white" />
                    <span>Enviando chamado...</span>
                  </>
                ) : (
                  <span>Envio</span>
                )}
              </button>
            </form>
          </div>

          {/* ======================================================== */}
          {/* COLUNA DIREITA: PAINEL "ENTREGAS ATIVAS"                 */}
          {/* ======================================================== */}
          <div className="lg:col-span-7 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-extrabold text-lg tracking-tight text-foreground">
                Entregas ativas
              </h2>
              <span className={`text-xs font-semibold ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
                Total: <strong>{requests.filter((r) => !["delivered", "cancelled"].includes(r.status)).length}</strong> em andamento
              </span>
            </div>

            {/* Card de Status de Busca (Destaque em Âmbar / Laranja Suave) */}
            <div
              className={`rounded-2xl p-4 border flex items-center gap-3.5 transition-all shadow-xs ${
                isDark
                  ? "bg-amber-950/25 border-amber-800/40 text-amber-200"
                  : "bg-[#FEF3C7] border-[#FCD34D] text-amber-950"
              }`}
            >
              <div className="w-11 h-11 rounded-2xl bg-[#EA580C]/20 border border-[#EA580C]/30 flex items-center justify-center shrink-0 text-[#EA580C]">
                <Bike className="w-6 h-6 animate-pulse" />
              </div>

              <div className="min-w-0 flex-1">
                <h3 className="font-bold text-sm sm:text-base leading-snug truncate">
                  {countPending > 0
                    ? "Procurando motorista parceiro..."
                    : countAccepted > 0 || countTransit > 0
                    ? "Motorista parceiro a caminho!"
                    : "Pronto para novos chamados"}
                </h3>
                <p className={`text-xs leading-tight mt-0.5 ${isDark ? "text-amber-300/80" : "text-amber-900/80"}`}>
                  {countPending > 0
                    ? `Notificando motoristas parceiros em Primavera do Leste para ${countPending} pedido(s)...`
                    : countAccepted > 0 || countTransit > 0
                    ? "Acompanhe a rota em tempo real no mapa abaixo."
                    : "Preencha os dados no formulário ao lado para acionar um entregador."}
                </p>
              </div>
            </div>

            {/* Abas Horizontais de Filtragem de Status */}
            <div className={`flex items-center gap-6 border-b text-xs sm:text-sm font-semibold overflow-x-auto scrollbar-none ${isDark ? "border-zinc-800" : "border-zinc-200"}`}>
              <button
                type="button"
                onClick={() => setStatusFilter("pending")}
                className={`pb-2.5 transition-colors relative whitespace-nowrap ${
                  statusFilter === "pending"
                    ? "text-[#EA580C] font-extrabold"
                    : isDark ? "text-zinc-400 hover:text-white" : "text-zinc-500 hover:text-zinc-900"
                }`}
              >
                <span>Aguardando Motorista</span>
                {countPending > 0 && (
                  <span className="ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] bg-orange-500/15 text-[#EA580C] font-bold">
                    {countPending}
                  </span>
                )}
                {statusFilter === "pending" && (
                  <span className="absolute bottom-0 inset-x-0 h-0.5 bg-[#EA580C] rounded-full"></span>
                )}
              </button>

              <button
                type="button"
                onClick={() => setStatusFilter("accepted")}
                className={`pb-2.5 transition-colors relative whitespace-nowrap ${
                  statusFilter === "accepted"
                    ? "text-[#EA580C] font-extrabold"
                    : isDark ? "text-zinc-400 hover:text-white" : "text-zinc-500 hover:text-zinc-900"
                }`}
              >
                <span>Em Coleta</span>
                {countAccepted > 0 && (
                  <span className="ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] bg-sky-500/15 text-sky-500 font-bold">
                    {countAccepted}
                  </span>
                )}
                {statusFilter === "accepted" && (
                  <span className="absolute bottom-0 inset-x-0 h-0.5 bg-[#EA580C] rounded-full"></span>
                )}
              </button>

              <button
                type="button"
                onClick={() => setStatusFilter("picked_up")}
                className={`pb-2.5 transition-colors relative whitespace-nowrap ${
                  statusFilter === "picked_up"
                    ? "text-[#EA580C] font-extrabold"
                    : isDark ? "text-zinc-400 hover:text-white" : "text-zinc-500 hover:text-zinc-900"
                }`}
              >
                <span>Em Rota</span>
                {countTransit > 0 && (
                  <span className="ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] bg-emerald-500/15 text-emerald-500 font-bold">
                    {countTransit}
                  </span>
                )}
                {statusFilter === "picked_up" && (
                  <span className="absolute bottom-0 inset-x-0 h-0.5 bg-[#EA580C] rounded-full"></span>
                )}
              </button>

              <button
                type="button"
                onClick={() => setStatusFilter("all")}
                className={`pb-2.5 transition-colors relative whitespace-nowrap ${
                  statusFilter === "all"
                    ? "text-[#EA580C] font-extrabold"
                    : isDark ? "text-zinc-400 hover:text-white" : "text-zinc-500 hover:text-zinc-900"
                }`}
              >
                <span>Todas</span>
                {statusFilter === "all" && (
                  <span className="absolute bottom-0 inset-x-0 h-0.5 bg-[#EA580C] rounded-full"></span>
                )}
              </button>
            </div>

            {/* Lista de Cards de Entregas Ativas */}
            <div className="space-y-3">
              {filteredRequests.length > 0 ? (
                filteredRequests.map((req) => {
                  const isPending = req.status === "pending";
                  const isAccepted = req.status === "accepted";
                  const isTransit = req.status === "picked_up";

                  return (
                    <div
                      key={req.id}
                      onClick={() => setSelectedOrderDetails(req)}
                      className={`rounded-2xl p-4 border transition-all duration-200 cursor-pointer shadow-xs hover:shadow-md flex items-center justify-between gap-4 ${
                        isDark
                          ? "bg-[#18181B] border-zinc-800 hover:border-zinc-700 text-white"
                          : "bg-white border-zinc-200 hover:border-orange-200 text-zinc-900"
                      }`}
                    >
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex items-center gap-2">
                          <h4 className="font-extrabold text-sm sm:text-base leading-tight truncate">
                            {restaurant?.name || "Pizzaria Piacenza"}
                          </h4>
                          <span className={`text-[10px] font-mono font-medium ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>
                            #{req.id.slice(0, 6)}
                          </span>
                        </div>

                        <p className={`text-xs truncate ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>
                          Entrega: <span className="font-medium text-foreground">{req.delivery_address || "Endereço não informado"}</span>
                        </p>

                        {/* Etapas / Marcos do Pedido Alinhados */}
                        <div className="flex items-center gap-3 pt-1 text-xs">
                          <span className={`flex items-center gap-1 font-semibold ${isAccepted || isTransit ? "text-sky-500" : isDark ? "text-zinc-500" : "text-zinc-400"}`}>
                            <span>Em Coleta</span>
                          </span>

                          <span className="text-zinc-400">•</span>

                          <span className={`flex items-center gap-1.5 font-semibold ${isTransit ? "text-emerald-500" : isDark ? "text-zinc-500" : "text-zinc-400"}`}>
                            <span className={`w-2 h-2 rounded-full ${isTransit ? "bg-emerald-500 animate-pulse" : "bg-zinc-400"}`}></span>
                            <span>Em Rota</span>
                          </span>
                        </div>
                      </div>

                      {/* Lado Direito: Badge "Disponível" / Status e Seta de Ação */}
                      <div className="flex items-center gap-3 shrink-0">
                        {isPending && (
                          <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-300/40">
                            Disponível
                          </span>
                        )}

                        {isAccepted && (
                          <span className="px-3 py-1 rounded-full text-xs font-bold bg-sky-100 dark:bg-sky-950/60 text-sky-800 dark:text-sky-300 border border-sky-300/40">
                            Em Coleta
                          </span>
                        )}

                        {isTransit && (
                          <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-300/40">
                            Em Rota
                          </span>
                        )}

                        <ChevronRight className="w-5 h-5 text-zinc-400 group-hover:text-foreground transition-transform group-hover:translate-x-0.5" />
                      </div>
                    </div>
                  );
                })
              ) : (
                <div
                  className={`rounded-2xl p-8 border text-center space-y-2 ${
                    isDark ? "bg-[#18181B]/50 border-zinc-800 text-zinc-400" : "bg-white border-zinc-200 text-zinc-500"
                  }`}
                >
                  <Bike className="w-8 h-8 text-zinc-400 mx-auto" />
                  <p className="font-semibold text-sm">Nenhuma corrida neste status no momento</p>
                  <p className="text-xs">Utilize o formulário de Envio para criar uma nova chamada de entrega.</p>
                </div>
              )}
            </div>

            {/* ======================================================== */}
            {/* MINI-MAPA DE ACOMPANHAMENTO (FIXADO NO CANTO INFERIOR)    */}
            {/* ======================================================== */}
            <div className="pt-2 flex justify-end">
              <div className="w-full sm:w-80 md:w-96 h-56 sm:h-64 rounded-2xl overflow-hidden shadow-lg border border-border/80">
                <StoreMiniTrackingMap
                  pickupLocation={
                    restaurant?.latitude && restaurant?.longitude
                      ? { lat: restaurant.latitude, lng: restaurant.longitude, name: restaurant.name }
                      : null
                  }
                  deliveryLocation={mapDeliveryLocation}
                  driverPosition={currentDriverPos}
                  className="w-full h-full"
                  statusText={
                    displayMapRequest?.status === "picked_up"
                      ? "Moto em rota de entrega"
                      : displayMapRequest?.status === "accepted"
                      ? "Moto a caminho da loja"
                      : "Mapa de Coleta e Entrega"
                  }
                  onExpand={() => onNavigateTab?.("map")}
                />
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Modal de Detalhes da Corrida e Ações Rápidas */}
      <Dialog open={!!selectedOrderDetails} onOpenChange={(open) => !open && setSelectedOrderDetails(null)}>
        <DialogContent className={`max-w-md rounded-2xl ${isDark ? "bg-[#18181B] text-white border-zinc-800" : "bg-white text-zinc-900 border-zinc-200"}`}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-bold text-base sm:text-lg">
              <Bike className="w-5 h-5 text-[#EA580C]" />
              <span>Detalhes da Corrida #{selectedOrderDetails?.id?.slice(0, 8)}</span>
            </DialogTitle>
            <DialogDescription className="text-xs">
              Status atual: <strong>{selectedOrderDetails?.status === "pending" ? "Aguardando Motorista" : selectedOrderDetails?.status === "accepted" ? "Em Coleta" : "Em Rota"}</strong>
            </DialogDescription>
          </DialogHeader>

          {selectedOrderDetails && (
            <div className="space-y-4 py-2">
              <div className={`p-3.5 rounded-xl border space-y-2 ${isDark ? "bg-zinc-800/60 border-zinc-700" : "bg-zinc-50 border-zinc-200"}`}>
                <div>
                  <span className="text-[11px] font-semibold text-zinc-400">Coleta</span>
                  <p className="text-xs font-bold text-foreground">{selectedOrderDetails.pickup_address || restaurant?.address || "Loja"}</p>
                </div>
                <div>
                  <span className="text-[11px] font-semibold text-zinc-400">Entrega</span>
                  <p className="text-xs font-bold text-foreground">{selectedOrderDetails.delivery_address || "Não informado"}</p>
                </div>
                {selectedOrderDetails.notes && (
                  <div>
                    <span className="text-[11px] font-semibold text-zinc-400">Observações</span>
                    <p className="text-xs text-foreground">{selectedOrderDetails.notes}</p>
                  </div>
                )}
              </div>

              {/* Botão de Cancelamento */}
              <div className="pt-1">
                <Button
                  variant="outline"
                  onClick={() => {
                    const req = selectedOrderDetails;
                    setSelectedOrderDetails(null);
                    onOpenCancelModal(req.id, null, req.status !== "pending");
                  }}
                  className="w-full text-red-600 border-red-300/60 hover:bg-red-500/10 hover:text-red-700 font-semibold text-xs h-10 rounded-xl"
                >
                  <XCircle className="w-4 h-4 mr-1.5" />
                  <span>Cancelar esta Corrida</span>
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default StoreModernDashboard;