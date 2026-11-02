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
  PanelLeftOpen,
  ArrowLeft,
  DollarSign,
  Route,
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

export interface AddressSuggestionItem {
  id: string;
  title: string;
  subtitle: string;
  fullAddress: string;
  street: string;
  number?: string;
  neighborhood?: string;
  lat: number;
  lng: number;
}

interface StoreModernDashboardProps {
  user: any;
  restaurant: any;
  requests: any[];
  credits?: any;
  activeRequest?: any;
  onOpenCancelModal: (requestId: string, driverName?: string | null, isAccepted?: boolean, driverDetails?: any | null) => void;
  onNavigateTab?: (tab: string) => void;
  isDark?: boolean;
  isSidebarCollapsed?: boolean;
  onToggleSidebar?: () => void;
  onGoBackHome?: () => void;
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
  isSidebarCollapsed = false,
  onToggleSidebar,
  onGoBackHome,
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
  const [addressSuggestions, setAddressSuggestions] = useState<AddressSuggestionItem[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [searchingAddress, setSearchingAddress] = useState(false);
  const [deliveryCoordinates, setDeliveryCoordinates] = useState<{ lat: number; lng: number } | null>(null);
  const [estimatedDistanceKm, setEstimatedDistanceKm] = useState<number>(0);
  const [loadingRoute, setLoadingRoute] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  // Estado das Abas de Filtragem de Entregas Ativas
  const [statusFilter, setStatusFilter] = useState<"pending" | "accepted" | "picked_up" | "all">("pending");

  // Estado para Modal de Detalhes da Corrida
  const [selectedOrderDetails, setSelectedOrderDetails] = useState<any | null>(null);

  // Rastreamento de localização de motoristas em tempo real
  const { data: driverLocations = [] } = useDriverLocations();

  // Consulta de configuração de taxas da plataforma (Dynamic Pricing, Fee per km, Base fee)
  const { data: deliveryConfig } = useQuery({
    queryKey: ["delivery-config"],
    queryFn: async () => {
      try {
        const { data, error } = await (supabase as any).rpc("get_public_delivery_config");
        if (!error && data) {
          return Array.isArray(data) ? data[0] : data;
        }
      } catch (e) {
        console.warn("[StoreModernDashboard] Erro RPC get_public_delivery_config:", e);
      }
      const { data: tableData } = await supabase.from("delivery_config").select("*").limit(1).maybeSingle();
      return tableData;
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

  // Busca sugestões de ruas e endereços enquanto o lojista digita (com debounce)
  useEffect(() => {
    const query = addressInput.trim();
    if (!query || query.length < 3) {
      setAddressSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    const timer = setTimeout(async () => {
      setSearchingAddress(true);
      try {
        const formatted: AddressSuggestionItem[] = [];

        // 1. Busca oficial pela Mapbox (Geocoding Forward com foco em Primavera do Leste)
        try {
          const mapboxResults = await searchAddressSuggestions(query, {
            userNumber: streetNumber.trim() || undefined,
            limit: 6,
          });

          if (Array.isArray(mapboxResults) && mapboxResults.length > 0) {
            for (const item of mapboxResults) {
              const streetName = item.street || item.fullAddress.split(",")[0] || query;
              const neighborhood = item.neighborhood || "";
              const num = item.number || "";
              formatted.push({
                id: item.mapboxId || `${item.coordinates.latitude},${item.coordinates.longitude}`,
                title: num ? `${streetName}, ${num}` : streetName,
                subtitle: [neighborhood, item.city || "Primavera do Leste", item.stateCode || "MT"].filter(Boolean).join(" • "),
                fullAddress: item.fullAddress,
                street: streetName,
                number: num,
                neighborhood: neighborhood,
                lat: item.coordinates.latitude,
                lng: item.coordinates.longitude,
              });
            }
          }
        } catch (mapboxErr) {
          console.warn("[StoreModernDashboard] Mapbox suggestions failed, tentando fallback:", mapboxErr);
        }

        // 2. Fallback complementar no Nominatim (OpenStreetMap) caso Mapbox retorne menos de 3 resultados
        if (formatted.length < 3) {
          try {
            const nomQuery = `${query}, Primavera do Leste, MT, Brasil`;
            const url = `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&countrycodes=br&limit=6&q=${encodeURIComponent(nomQuery)}`;
            const nomRes = await fetch(url, { headers: { "Accept-Language": "pt-BR" } });
            if (nomRes.ok) {
              const nomData = await nomRes.json();
              if (Array.isArray(nomData)) {
                for (const n of nomData) {
                  const addr = n.address || {};
                  const road = addr.road || addr.pedestrian || addr.suburb || n.display_name.split(",")[0];
                  const suburb = addr.suburb || addr.neighbourhood || addr.city_district || "";
                  const houseNum = addr.house_number || "";
                  const latNum = parseFloat(n.lat);
                  const lngNum = parseFloat(n.lon);
                  if (!isNaN(latNum) && !isNaN(lngNum)) {
                    const alreadyExists = formatted.some(f => Math.abs(f.lat - latNum) < 0.0008 && Math.abs(f.lng - lngNum) < 0.0008);
                    if (!alreadyExists) {
                      formatted.push({
                        id: `nom-${n.place_id || n.osm_id}`,
                        title: houseNum ? `${road}, ${houseNum}` : road,
                        subtitle: [suburb, "Primavera do Leste"].filter(Boolean).join(" • "),
                        fullAddress: n.display_name,
                        street: road,
                        number: houseNum,
                        neighborhood: suburb,
                        lat: latNum,
                        lng: lngNum,
                      });
                    }
                  }
                }
              }
            }
          } catch (nomErr) {
            console.warn("[StoreModernDashboard] Nominatim fallback failed:", nomErr);
          }
        }

        setAddressSuggestions(formatted);
        setShowSuggestions(formatted.length > 0);
      } catch (err) {
        console.warn("[StoreModernDashboard] Erro geral ao buscar endereços:", err);
      } finally {
        setSearchingAddress(false);
      }
    }, 280);

    return () => clearTimeout(timer);
  }, [addressInput, streetNumber]);

  // Recalcula rota e distância quando coordenadas mudam
  useEffect(() => {
    if (!deliveryCoordinates || !restaurant?.latitude || !restaurant?.longitude) {
      setEstimatedDistanceKm(0);
      setLoadingRoute(false);
      return;
    }

    let isCancelled = false;
    setLoadingRoute(true);

    const calc = async () => {
      try {
        const routeData = await calculateRoute(
          { lat: restaurant.latitude, lng: restaurant.longitude },
          deliveryCoordinates,
          "driving"
        );
        if (!isCancelled && routeData?.distanceMeters) {
          setEstimatedDistanceKm(Number((routeData.distanceMeters / 1000).toFixed(1)));
          setLoadingRoute(false);
          return;
        }
      } catch (err) {
        console.warn("[StoreModernDashboard] calculateRoute falhou, usando distância geodésica:", err);
      }

      // Fallback geodésico aproximado
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
        // Multiplica por 1.25 para simular o traçado das ruas em grade da cidade
        const estRoadKm = Number((R * c * 1.25).toFixed(1));
        setEstimatedDistanceKm(estRoadKm > 0 ? estRoadKm : 2.5);
        setLoadingRoute(false);
      }
    };

    calc();
    return () => {
      isCancelled = true;
    };
  }, [deliveryCoordinates, restaurant]);

  // Cálculo exato do valor total da corrida conforme configurado no painel admin
  // Só calcula quando o endereço estiver preenchido, sem expor taxa base
  const fareDetails = useMemo(() => {
    const hasAddress = Boolean(addressInput.trim().length >= 3);
    if (!hasAddress) {
      return {
        totalCost: null,
        isCalculated: false,
        effectiveKm: 0,
      };
    }

    const baseFee = Number(deliveryConfig?.base_fee ?? 5);
    const dynamicEnabled = Boolean(deliveryConfig?.dynamic_pricing_enabled);
    const dynamicFee = Number(deliveryConfig?.dynamic_fee_per_km ?? 0);
    const feePerKm = dynamicEnabled && dynamicFee > 0 ? dynamicFee : Number(deliveryConfig?.fee_per_km ?? 1.5);
    const minKm = Number(deliveryConfig?.min_km ?? 0);
    const maxKm = Number(deliveryConfig?.max_km ?? 0);
    const roundKmUp = Boolean(deliveryConfig?.round_km_up ?? false);

    let effectiveKm = estimatedDistanceKm;
    if (effectiveKm <= 0 && deliveryCoordinates) {
      effectiveKm = 3.0; // Distância padrão estimada quando ponto definido
    }
    if (effectiveKm <= 0 && hasAddress) {
      effectiveKm = 3.0; // Distância de segurança enquanto calcula rota
    }

    if (roundKmUp && effectiveKm > 0) effectiveKm = Math.ceil(effectiveKm);
    if (minKm > 0 && effectiveKm < minKm) effectiveKm = minKm;
    if (maxKm > 0 && effectiveKm > maxKm) effectiveKm = maxKm;

    const totalCost = baseFee + (effectiveKm * feePerKm);

    return {
      totalCost,
      isCalculated: estimatedDistanceKm > 0,
      effectiveKm,
    };
  }, [deliveryConfig, estimatedDistanceKm, deliveryCoordinates, addressInput]);

  // Geocodifica e calcula automaticamente quando o lojista termina de digitar o endereço
  const handleAddressBlur = async () => {
    if (addressInput.trim().length >= 3 && !deliveryCoordinates) {
      setLoadingRoute(true);
      try {
        const geo = await geocodeAddress(`${addressInput.trim()}, Primavera do Leste`).catch(() => null);
        if (geo?.coordinates) {
          setDeliveryCoordinates({
            lat: geo.coordinates.latitude,
            lng: geo.coordinates.longitude,
          });
        } else {
          setEstimatedDistanceKm(3.0);
        }
      } catch {
        setEstimatedDistanceKm(3.0);
      } finally {
        setLoadingRoute(false);
      }
    }
  };

  // Seleciona um endereço da lista de sugestões de ruas
  const handleSelectSuggestion = (sug: AddressSuggestionItem) => {
    setAddressInput(sug.street || sug.title);
    if (sug.number) {
      setStreetNumber(sug.number);
    }
    setDeliveryCoordinates({ lat: sug.lat, lng: sug.lng });
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

    const finalDistanceToCharge = fareDetails.effectiveKm > 0 ? fareDetails.effectiveKm : (finalDistance > 0 ? finalDistance : 3.0);

    setIsSubmitting(true);
    try {
      const { data: requestId, error } = await supabase.rpc("deduct_credits_for_delivery", {
        p_pickup_address: pickupAddress,
        p_delivery_address: fullAddress,
        p_notes: compiledNotes || null,
        p_restaurant_id: restaurant?.id || null,
        p_distance_km: finalDistanceToCharge,
        p_preferred_driver_id: null,
      } as any);

      if (error) throw error;

      // Dispara push de notificação a todos os motoristas cadastrados
      if (requestId) {
        void notifyAvailableDrivers(String(requestId));
      }

      toast.success(`🚀 Entrega solicitada! Valor: R$ ${fareDetails.totalCost.toFixed(2).replace(".", ",")}. Notificando motoristas...`);

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
      if (statusFilter === "cancelled") return r.status === "cancelled";
      if (statusFilter === "all") return true;
      return !["delivered", "cancelled"].includes(r.status);
    });
  }, [requests, statusFilter]);

  // Contagem para as abas
  const countPending = useMemo(() => requests.filter((r) => r.status === "pending").length, [requests]);
  const countAccepted = useMemo(() => requests.filter((r) => r.status === "accepted").length, [requests]);
  const countTransit = useMemo(() => requests.filter((r) => r.status === "picked_up").length, [requests]);
  const countCancelled = useMemo(() => requests.filter((r) => r.status === "cancelled").length, [requests]);

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
        className={`w-full px-4 sm:px-8 py-3.5 border-b flex items-center justify-between sticky top-0 z-20 backdrop-blur-md shadow-xs transition-colors duration-300 ${
          isDark
            ? "bg-[#18181B]/95 border-zinc-800 text-white"
            : "bg-white/95 border-zinc-200/80 text-zinc-900"
        }`}
      >
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Botão de Expandir / Voltar o Menu Lateral quando recolhido */}
          {isSidebarCollapsed && onToggleSidebar && (
            <button
              type="button"
              onClick={onToggleSidebar}
              className="px-2.5 py-1.5 rounded-xl bg-orange-500/10 hover:bg-orange-500/20 text-[#EA580C] border border-orange-500/30 transition-all flex items-center gap-1.5 text-xs font-bold active:scale-95 shadow-xs"
              title="Expandir menu lateral"
              aria-label="Expandir menu lateral"
            >
              <PanelLeftOpen className="w-4 h-4 text-[#EA580C]" />
              <span className="hidden sm:inline">Menu</span>
            </button>
          )}

          {/* Botão de Voltar para a Página Inicial */}
          {onGoBackHome && (
            <button
              type="button"
              onClick={onGoBackHome}
              className="px-2.5 py-1.5 rounded-xl hover:bg-muted text-muted-foreground hover:text-foreground border border-transparent hover:border-border transition-all flex items-center gap-1 text-xs font-semibold"
              title="Voltar para a página inicial"
              aria-label="Voltar para a página inicial"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="hidden md:inline">Início</span>
            </button>
          )}

          <div className="w-9 h-9 rounded-xl bg-[#EA580C] text-white flex items-center justify-center shadow-md shadow-orange-500/20 shrink-0">
            <Bike className="w-5 h-5" />
          </div>
          <div>
            <h1 className="font-extrabold text-sm sm:text-lg tracking-tight leading-none text-foreground">
              Duarte Entregas - Painel da Loja
            </h1>
            <p className={`text-[10px] sm:text-[11px] font-medium leading-tight mt-1 ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
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
                    onBlur={handleAddressBlur}
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
                    className={`absolute z-30 left-0 right-0 mt-1 rounded-2xl border shadow-2xl max-h-64 overflow-y-auto divide-y backdrop-blur-md animate-in fade-in slide-in-from-top-1 duration-150 ${
                      isDark
                        ? "bg-[#18181B]/95 border-zinc-700 divide-zinc-800"
                        : "bg-white/95 border-zinc-200 divide-zinc-100"
                    }`}
                  >
                    <div className="px-3.5 py-1.5 bg-muted/40 text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center justify-between">
                      <span>Ruas em Primavera do Leste</span>
                      <span className="text-[#EA580C]">{addressSuggestions.length} encontradas</span>
                    </div>

                    {addressSuggestions.map((sug) => (
                      <button
                        key={sug.id}
                        type="button"
                        onClick={() => handleSelectSuggestion(sug)}
                        className={`w-full px-3.5 py-2.5 text-left transition flex items-center gap-3 cursor-pointer group ${
                          isDark
                            ? "hover:bg-zinc-800/80 text-zinc-200"
                            : "hover:bg-orange-50/80 text-zinc-900"
                        }`}
                      >
                        <div className="w-8 h-8 rounded-xl bg-[#EA580C]/10 text-[#EA580C] group-hover:bg-[#EA580C] group-hover:text-white flex items-center justify-center shrink-0 transition-colors">
                          <MapPin className="w-4 h-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs sm:text-sm font-bold text-foreground truncate group-hover:text-[#EA580C] transition-colors">
                            {sug.title}
                          </p>
                          <p className="text-[11px] text-muted-foreground truncate">
                            {sug.subtitle}
                          </p>
                        </div>
                        <ChevronRight className="w-4 h-4 text-muted-foreground/60 group-hover:text-[#EA580C] shrink-0" />
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

              {/* Exibição do Valor Total da Corrida: apenas após o preenchimento do endereço, sem exibir taxa base */}
              {addressInput.trim().length >= 3 ? (
                loadingRoute ? (
                  <div
                    className={`p-3.5 rounded-2xl border flex items-center justify-center gap-2 text-xs font-semibold ${
                      isDark ? "bg-[#18181B] border-zinc-700 text-[#EA580C]" : "bg-orange-50/80 border-orange-200 text-[#EA580C]"
                    }`}
                  >
                    <Loader2 className="w-4 h-4 animate-spin text-[#EA580C]" />
                    <span>Calculando valor total da corrida...</span>
                  </div>
                ) : fareDetails.totalCost !== null ? (
                  <div
                    className={`p-3.5 sm:p-4 rounded-2xl border transition-all duration-300 space-y-2.5 ${
                      isDark
                        ? "bg-[#121214] border-zinc-700/80 shadow-inner"
                        : "bg-gradient-to-br from-orange-50/70 to-amber-50/50 border-orange-200/90 shadow-xs"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="w-10 h-10 rounded-2xl bg-[#EA580C]/15 text-[#EA580C] flex items-center justify-center shrink-0">
                          <DollarSign className="w-5 h-5 stroke-[2.5]" />
                        </div>
                        <div>
                          <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-muted-foreground block leading-tight">
                            Valor Total da Corrida
                          </span>
                          <span className="text-xl sm:text-2xl font-black text-[#EA580C] tracking-tight leading-tight">
                            R$ {fareDetails.totalCost.toFixed(2).replace(".", ",")}
                          </span>
                        </div>
                      </div>

                      {fareDetails.isCalculated && (
                        <div className="text-right">
                          <span className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-lg bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30">
                            <Route className="w-3.5 h-3.5" />
                            {estimatedDistanceKm} km
                          </span>
                          <span className="text-[10px] text-muted-foreground block mt-0.5">
                            ~{Math.max(4, Math.round(estimatedDistanceKm * 2.5))} min de trajeto
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Informações complementares de saldo (SEM taxa base para evitar confusão) */}
                    <div className="pt-2 border-t border-border/40 flex items-center justify-between text-[11px] text-muted-foreground">
                      <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Valor calculado por quilometragem e rota
                      </span>

                      {credits && (
                        <span className={`font-semibold ${Number(credits.balance || 0) < fareDetails.totalCost ? "text-red-500 font-bold" : "text-foreground"}`}>
                          Saldo em conta: R$ {Number(credits.balance || 0).toFixed(2).replace(".", ",")}
                        </span>
                      )}
                    </div>

                    {/* Alerta de Saldo Insuficiente */}
                    {credits && Number(credits.balance || 0) < fareDetails.totalCost && (
                      <div className="flex items-center gap-1.5 p-2 rounded-xl bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400 text-[11px] font-medium">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                        <span>Saldo insuficiente na carteira (R$ {Number(credits.balance || 0).toFixed(2).replace(".", ",")}). Recarregue para chamar.</span>
                      </div>
                    )}
                  </div>
                ) : null
              ) : (
                /* Card Orientativo exibido antes do endereço ser informado */
                <div
                  className={`p-3 rounded-xl border border-dashed flex items-center justify-center gap-2 text-xs transition-colors ${
                    isDark ? "border-zinc-800 bg-zinc-900/30 text-zinc-500" : "border-zinc-200 bg-slate-50/60 text-zinc-500"
                  }`}
                >
                  <MapPin className="w-3.5 h-3.5 text-[#EA580C] shrink-0" />
                  <span>Preencha o endereço de entrega para calcular o valor total da corrida</span>
                </div>
              )}

              {/* Botão de Envio (Laranja Largo com Cantos Arredondados) */}
              <button
                type="submit"
                disabled={isSubmitting || loadingRoute || !addressInput.trim() || (fareDetails.totalCost !== null && credits && Number(credits.balance || 0) < fareDetails.totalCost)}
                className="w-full bg-[#EA580C] hover:bg-[#C2410C] text-white font-extrabold text-sm sm:text-base py-3.5 px-4 rounded-xl shadow-lg shadow-orange-500/25 transition-all duration-200 active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 select-none cursor-pointer mt-1"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin text-white" />
                    <span>Enviando chamado...</span>
                  </>
                ) : loadingRoute ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin text-white" />
                    <span>Calculando valor...</span>
                  </>
                ) : addressInput.trim().length >= 3 && fareDetails.totalCost !== null ? (
                  <>
                    <Bike className="w-5 h-5" />
                    <span>Confirmar Envio • R$ {fareDetails.totalCost.toFixed(2).replace(".", ",")}</span>
                  </>
                ) : (
                  <>
                    <Bike className="w-5 h-5" />
                    <span>Solicitar Entrega</span>
                  </>
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
                onClick={() => setStatusFilter("cancelled")}
                className={`pb-2.5 transition-colors relative whitespace-nowrap ${
                  statusFilter === "cancelled"
                    ? "text-red-600 font-extrabold"
                    : isDark ? "text-zinc-400 hover:text-white" : "text-zinc-500 hover:text-zinc-900"
                }`}
              >
                <span>Canceladas</span>
                {countCancelled > 0 && (
                  <span className="ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] bg-red-500/15 text-red-600 font-bold">
                    {countCancelled}
                  </span>
                )}
                {statusFilter === "cancelled" && (
                  <span className="absolute bottom-0 inset-x-0 h-0.5 bg-red-600 rounded-full"></span>
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
                  const isCancelled = req.status === "cancelled";

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
                        {isCancelled ? (
                          <div className="flex items-center gap-1.5 pt-1 text-xs text-red-600 dark:text-red-400 font-bold">
                            <XCircle className="w-3.5 h-3.5 shrink-0" />
                            <span>Corrida Cancelada • Valor não cobrado da loja</span>
                          </div>
                        ) : (
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
                        )}
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

                        {isCancelled && (
                          <span className="px-3 py-1 rounded-full text-xs font-bold bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-300 border border-red-300/40">
                            Corrida Cancelada
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
                  <p className="font-semibold text-sm">
                    {statusFilter === "cancelled"
                      ? "Nenhuma corrida cancelada."
                      : "Nenhuma corrida neste status no momento"}
                  </p>
                  <p className="text-xs">
                    {statusFilter === "cancelled"
                      ? "As corridas canceladas aparecerão listadas aqui com o estorno confirmado."
                      : "Utilize o formulário de Envio para criar uma nova chamada de entrega."}
                  </p>
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
              {selectedOrderDetails?.status === "cancelled" ? (
                <XCircle className="w-5 h-5 text-red-600" />
              ) : (
                <Bike className="w-5 h-5 text-[#EA580C]" />
              )}
              <span>Detalhes da Corrida #{selectedOrderDetails?.id?.slice(0, 8)}</span>
            </DialogTitle>
            <DialogDescription className="text-xs">
              Status atual:{" "}
              <strong className={selectedOrderDetails?.status === "cancelled" ? "text-red-600 font-bold" : ""}>
                {selectedOrderDetails?.status === "pending"
                  ? "Aguardando Motorista"
                  : selectedOrderDetails?.status === "accepted"
                  ? "Em Coleta"
                  : selectedOrderDetails?.status === "picked_up"
                  ? "Em Rota"
                  : selectedOrderDetails?.status === "cancelled"
                  ? "Corrida Cancelada"
                  : selectedOrderDetails?.status || "Em Andamento"}
              </strong>
            </DialogDescription>
          </DialogHeader>

          {selectedOrderDetails && (
            <div className="space-y-4 py-2">
              {selectedOrderDetails.status === "cancelled" && (
                <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/30 text-xs text-red-800 dark:text-red-300 space-y-1">
                  <p className="font-bold flex items-center gap-1.5 text-red-600 dark:text-red-400">
                    <XCircle className="w-4 h-4" /> Corrida Cancelada
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Esta corrida foi cancelada pela loja. Nenhum valor foi repassado ao motorista e o valor não foi descontado da carteira da loja (estorno de 100% dos créditos garantido).
                  </p>
                </div>
              )}

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

              {/* Botão de Cancelamento (apenas se ainda NÃO estiver cancelada) */}
              {selectedOrderDetails.status !== "cancelled" && (
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
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default StoreModernDashboard;