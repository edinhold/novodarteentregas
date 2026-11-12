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
  LogOut,
  DollarSign,
  Route,
  Building2,
  ShoppingBag,
  Car,
  Home,
  Store as StoreIcon,
  FileText,
  Flame,
} from "lucide-react";
import { searchAddressSuggestions, geocodeAddress, calculateRoute, detectLocationCategory } from "@/services/mapbox";
import { DEFAULT_CENTER, resolveStoreCoordinates, formatStorePickupAddress, isWithinPrimaveraBounds } from "@/config/maps";
import { isValidCoordinate } from "@/utils/geolocation";
import { notifyAvailableDrivers } from "@/lib/push";
import { useDriverLocations } from "@/hooks/useDriverLocations";
import StoreMiniTrackingMap from "./StoreMiniTrackingMap";
import { AssignedDriverCard } from "./AssignedDriverCard";
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
  placeCategory?: string;
  placeCategoryLabel?: string;
}

interface ActiveDriverInfoRowProps {
  request: any;
  cachedDriver?: any;
  onOpenCancelModal: (requestId: string, driverName?: string | null, isAccepted?: boolean, driverDetails?: any | null) => void;
  isDark?: boolean;
}

const ActiveDriverInfoRow: React.FC<ActiveDriverInfoRowProps> = ({
  request,
  cachedDriver,
  onOpenCancelModal,
  isDark = false,
}) => {
  const requestId = request?.id;
  const driverId = request?.driver_id;

  // Busca dados oficiais via RPC get_delivery_driver_info se faltar foto, placa ou telefone
  const { data: rpcDriver } = useQuery({
    queryKey: ["active-card-driver", requestId, driverId],
    queryFn: async () => {
      if (!requestId) return null;
      try {
        const { data, error } = await supabase.rpc("get_delivery_driver_info", { p_request_id: requestId });
        if (!error && data) {
          const rows = data as any[];
          return Array.isArray(rows) ? rows[0] : rows;
        }
      } catch (e) {
        console.warn("[ActiveDriverInfoRow] RPC error:", e);
      }
      return null;
    },
    enabled: Boolean(requestId && (!cachedDriver?.photo_url || !cachedDriver?.vehicle_plate || !cachedDriver?.phone)),
    staleTime: 1000 * 60,
  });

  const driver = rpcDriver || cachedDriver;
  const driverName = driver?.full_name || "Motorista Parceiro";
  const driverPhoto = driver?.photo_url || null;
  const vehiclePlate = driver?.vehicle_plate || null;
  const vehicleType = driver?.vehicle_type || "Moto";
  const driverPhone = driver?.phone || null;
  const driverCode = driver?.driver_code || null;
  const driverUserId = driver?.user_id || driverId;

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      className={`mt-2.5 p-3 rounded-xl border transition-all ${
        isDark
          ? "bg-zinc-900/90 border-zinc-700/80 text-white"
          : "bg-orange-50/70 border-orange-200/80 text-zinc-900"
      }`}
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        {/* Foto, Nome, Placa, Tipo de Veículo e Telefone */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="relative shrink-0">
            <DriverPhoto
              photoUrl={driverPhoto}
              driverId={driverUserId}
              alt={driverName}
              className="w-12 h-12 rounded-full border-2 border-emerald-500 shadow-sm object-cover"
            />
            <span
              className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-emerald-500 border-2 border-white dark:border-zinc-900 flex items-center justify-center shadow-xs"
              title="Motorista Confirmado"
            >
              <CheckCircle2 className="w-2.5 h-2.5 text-white" />
            </span>
          </div>

          <div className="min-w-0 space-y-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-extrabold text-sm text-foreground truncate">{driverName}</span>
              <span className="text-[10px] font-bold py-0.5 px-1.5 rounded bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
                {vehicleType}
              </span>
              {driverCode && (
                <span className="text-[10px] font-mono text-muted-foreground font-semibold">
                  ({driverCode})
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 flex-wrap text-xs">
              <span className="font-mono font-bold text-xs bg-amber-500/15 text-amber-800 dark:text-amber-300 px-2 py-0.5 rounded border border-amber-500/30 flex items-center gap-1 shadow-2xs">
                <Car className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                <span>Placa: {vehiclePlate || "Não informada"}</span>
              </span>

              {driverPhone && (
                <span className="text-muted-foreground font-semibold flex items-center gap-1">
                  <Phone className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span>{formatPhoneNumber(driverPhone)}</span>
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Botões de Ação Direta: WhatsApp, Ligar e Cancelar */}
        <div className="flex items-center gap-2 shrink-0 pt-1 sm:pt-0">
          {driverPhone && (
            <>
              <a
                href={`https://wa.me/${normalizeWhatsAppNumber(driverPhone)}?text=${encodeURIComponent(
                  `Olá ${driverName}, sou da loja referente à entrega #${String(requestId).slice(0, 8)}.`
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-bold bg-[#25D366] hover:bg-[#20bd5a] text-white rounded-xl shadow-xs transition-colors"
                title="Conversar no WhatsApp"
              >
                <MessageCircle className="w-3.5 h-3.5 fill-white" />
                <span>WhatsApp</span>
              </a>

              <a
                href={`tel:${driverPhone.replace(/\D/g, "")}`}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold bg-white dark:bg-zinc-800 hover:bg-muted border border-border rounded-xl transition-colors"
                title="Ligar para o motorista"
              >
                <Phone className="w-3.5 h-3.5 text-emerald-600" />
                <span className="hidden xs:inline">Ligar</span>
              </a>
            </>
          )}

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onOpenCancelModal(requestId, driverName, true, driver)}
            className="text-red-600 border-red-300/70 hover:bg-red-500/10 hover:text-red-700 text-xs font-bold rounded-xl h-8 px-2.5"
            title="Cancelar esta corrida"
          >
            <XCircle className="w-3.5 h-3.5 mr-1" />
            <span>Cancelar</span>
          </Button>
        </div>
      </div>
    </div>
  );
};

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
  onSignOut?: () => void;
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
  onSignOut,
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
  const [manualDistanceEnabled, setManualDistanceEnabled] = useState(false);
  const [manualDistanceKm, setManualDistanceKm] = useState("");
  const [loadingRoute, setLoadingRoute] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  // Categoria de local identificada com precisão (Condomínio, Supermercado/Comércio, Avenida, Rua, etc.)
  const detectedCategory = useMemo(() => {
    if (!addressInput || addressInput.trim().length < 2) return null;
    return detectLocationCategory(addressInput.trim());
  }, [addressInput]);

  // Query para resolver dados do motorista aceito (nome, foto, telefone, placa)
  const { data: driversList = [] } = useQuery({
    queryKey: ["all-drivers-list-for-history"],
    queryFn: async () => {
      try {
        const { data: driversData } = await supabase
          .from("drivers")
          .select("id, user_id, full_name, vehicle_plate, vehicle_type, phone, driver_code, photo_url");

        const { data: profilesData } = await supabase
          .from("profiles")
          .select("id, full_name, phone, avatar_url");

        const profilesMap = new Map((profilesData || []).map((p: any) => [p.id, p]));
        const mergedDrivers = (driversData || []).map((d: any) => {
          const prof = profilesMap.get(d.user_id) || profilesMap.get(d.id);
          return {
            ...d,
            full_name: d.full_name || prof?.full_name || "Motorista Parceiro",
            phone: d.phone || prof?.phone || "",
            photo_url: d.photo_url || prof?.avatar_url || null,
            driver_code: d.driver_code || `MOT-${String(d.user_id || d.id || "").slice(0, 5).toUpperCase()}`,
            vehicle_plate: d.vehicle_plate || "Não informada",
            vehicle_type: d.vehicle_type || "Moto",
          };
        });

        (profilesData || []).forEach((p: any) => {
          if (!mergedDrivers.some((d: any) => d.user_id === p.id || d.id === p.id)) {
            mergedDrivers.push({
              id: p.id,
              user_id: p.id,
              full_name: p.full_name || "Motorista Parceiro",
              phone: p.phone || "",
              photo_url: p.avatar_url || null,
              driver_code: `MOT-${String(p?.id || "").slice(0, 5).toUpperCase()}`,
              vehicle_plate: "Não informada",
              vehicle_type: "Moto",
            });
          }
        });

        return mergedDrivers;
      } catch (err) {
        console.warn("[StoreModernDashboard] Error fetching drivers list:", err);
        return [];
      }
    },
    staleTime: 1000 * 60 * 2,
  });

  const getDriverInfo = (driverId: string | null | undefined) => {
    if (!driverId) return null;
    return driversList.find((d: any) => d.id === driverId || d.user_id === driverId) || null;
  };

  // Estado das Abas de Filtragem de Entregas Ativas
  const [statusFilter, setStatusFilter] = useState<"pending" | "accepted" | "picked_up" | "cancelled" | "all">("pending");

  // Estado para Modal de Detalhes da Corrida
  const [selectedOrderDetails, setSelectedOrderDetails] = useState<any | null>(null);

  // Rastreamento de localização de motoristas em tempo real
  const { data: driverLocations = [] } = useDriverLocations();

  // Consulta de configuração de taxas da plataforma (Dynamic Pricing, Fee per km, Base fee)
  const { data: rawDeliveryConfig } = useQuery({
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
      return Array.isArray(tableData) ? tableData[0] : tableData;
    },
    staleTime: 1000 * 15, // 15s para atualizar taxas com rapidez caso o admin altere
    refetchInterval: 1000 * 15, // Atualiza dinamicamente se o admin ligar/desligar a tarifa dinâmica
  });

  const deliveryConfig = useMemo(() => {
    if (!rawDeliveryConfig) return null;
    return Array.isArray(rawDeliveryConfig) ? rawDeliveryConfig[0] : rawDeliveryConfig;
  }, [rawDeliveryConfig]);

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
              const cat = item.placeCategory && item.placeCategoryLabel
                ? { type: item.placeCategory, badge: item.placeCategoryLabel }
                : detectLocationCategory(streetName, item.fullAddress);

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
                placeCategory: cat.type,
                placeCategoryLabel: cat.badge,
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
                      const cat = detectLocationCategory(road, n.display_name, n.type, {
                        osmClass: n.class,
                        osmType: n.type,
                      });
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
                        placeCategory: cat.type,
                        placeCategoryLabel: cat.badge,
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

  // Coordenadas resolvidas da loja (com fallback inteligente e auto-geocodificação se nulas no banco)
  const [storeCoords, setStoreCoords] = useState<{ lat: number; lng: number }>(() => {
    return resolveStoreCoordinates(restaurant);
  });

  // Tenta resolver e geocodificar o endereço da loja com autocura no banco de dados
  useEffect(() => {
    const coords = resolveStoreCoordinates(restaurant);
    setStoreCoords(coords);

    // Se o restaurante no banco não possuir coordenadas válidas dentro de Primavera do Leste,
    // atualizamos imediatamente para curar o registro da loja no banco.
    if (
      restaurant?.id &&
      (!restaurant.latitude ||
        !restaurant.longitude ||
        !isWithinPrimaveraBounds(Number(restaurant.latitude), Number(restaurant.longitude))) &&
      (coords.lat !== DEFAULT_CENTER.lat || coords.lng !== DEFAULT_CENTER.lng)
    ) {
      void supabase
        .from("restaurants")
        .update({
          latitude: coords.lat,
          longitude: coords.lng,
          updated_at: new Date().toISOString(),
        })
        .eq("id", restaurant.id)
        .then(() => {
          queryClient.invalidateQueries({ queryKey: ["my-restaurant"] });
        });
      return;
    }

    if (coords.lat !== DEFAULT_CENTER.lat || coords.lng !== DEFAULT_CENTER.lng) {
      return;
    }

    let isCancelled = false;
    const resolveStore = async () => {
      if (restaurant?.address && restaurant.address.trim().length >= 3) {
        try {
          const parsed = await geocodeAddress(`${restaurant.address.trim()}, Primavera do Leste`);
          if (!isCancelled && parsed?.coordinates) {
            const resolved = { lat: parsed.coordinates.latitude, lng: parsed.coordinates.longitude };
            setStoreCoords(resolved);

            // Persiste no banco de dados para acelerar todas as próximas consultas da loja
            if (restaurant?.id) {
              void supabase
                .from("restaurants")
                .update({
                  latitude: resolved.lat,
                  longitude: resolved.lng,
                  updated_at: new Date().toISOString(),
                })
                .eq("id", restaurant.id)
                .then(() => {
                  queryClient.invalidateQueries({ queryKey: ["my-restaurant"] });
                });
            }
            return;
          }
        } catch (err) {
          console.warn("[StoreModernDashboard] Geocode do endereço da loja falhou:", err);
        }
      }
      if (!isCancelled) {
        setStoreCoords({ lat: DEFAULT_CENTER.lat, lng: DEFAULT_CENTER.lng });
      }
    };

    resolveStore();
    return () => {
      isCancelled = true;
    };
  }, [restaurant?.id, restaurant?.latitude, restaurant?.longitude, restaurant?.address, queryClient]);

  // Recalcula rota viária real e distância quando as coordenadas mudam
  useEffect(() => {
    if (!deliveryCoordinates || !storeCoords) {
      setEstimatedDistanceKm(0);
      setLoadingRoute(false);
      return;
    }

    let isCancelled = false;
    setLoadingRoute(true);

    const calc = async () => {
      try {
        const routeData = await calculateRoute(
          storeCoords,
          deliveryCoordinates,
          { profile: "driving" }
        );
        if (!isCancelled && routeData) {
          const distKm = Number(
            routeData.distanceKm > 0
              ? routeData.distanceKm
              : (routeData.distanceMeters / 1000).toFixed(1)
          );
          setEstimatedDistanceKm(distKm > 0 ? distKm : 1.0);
          setLoadingRoute(false);
          return;
        }
      } catch (err) {
        console.warn("[StoreModernDashboard] calculateRoute falhou, usando cálculo viário aproximado:", err);
      }

      // Fallback viário geodésico aproximado
      const R = 6371;
      const dLat = ((deliveryCoordinates.lat - storeCoords.lat) * Math.PI) / 180;
      const dLon = ((deliveryCoordinates.lng - storeCoords.lng) * Math.PI) / 180;
      const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos((storeCoords.lat * Math.PI) / 180) *
          Math.cos((deliveryCoordinates.lat * Math.PI) / 180) *
          Math.sin(dLon / 2) *
          Math.sin(dLon / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      if (!isCancelled) {
        const estRoadKm = Number((R * c * 1.25).toFixed(1));
        setEstimatedDistanceKm(estRoadKm > 0 ? estRoadKm : 2.5);
      }
    };

    calc().finally(() => {
      setLoadingRoute(false);
    });

    return () => {
      isCancelled = true;
      setLoadingRoute(false);
    };
  }, [deliveryCoordinates, storeCoords]);

  // Cálculo exato do valor total da corrida conforme configurado no painel admin
  // Aplica taxa base, taxa por km (ou tarifa dinâmica), km mínimo/máximo e arredondamento
  const fareDetails = useMemo(() => {
    const hasAddress = Boolean(addressInput.trim().length >= 3);
    if (!hasAddress) {
      return {
        totalCost: null,
        isCalculated: false,
        effectiveKm: 0,
        rawKm: 0,
        feePerKm: 0,
        baseFee: 0,
      };
    }

    const baseFee = Number(deliveryConfig?.base_fee ?? 5.3);
    const baseKmFee = Number(deliveryConfig?.fee_per_km ?? 1.7);
    const dynamicEnabled = Boolean(deliveryConfig?.dynamic_pricing_enabled);
    const dynamicFee = (dynamicEnabled && Number(deliveryConfig?.dynamic_fee_per_km ?? 0) > 0)
      ? Number(deliveryConfig?.dynamic_fee_per_km)
      : 0;
    // REGRA SÊNIOR: A taxa dinâmica SOMA com a taxa regular por km (baseKmFee + dynamicFee)
    const feePerKm = baseKmFee + dynamicFee;
    const minKm = Number(deliveryConfig?.min_km ?? 0);
    const maxKm = Number(deliveryConfig?.max_km ?? 0);
    const roundKmUp = Boolean(deliveryConfig?.round_km_up ?? false);

    const manualKm = manualDistanceEnabled && parseFloat(manualDistanceKm) > 0 ? parseFloat(manualDistanceKm) : null;
    let rawKm = manualKm ?? estimatedDistanceKm;
    if (rawKm <= 0 && deliveryCoordinates) {
      rawKm = 2.5;
    }

    let effectiveKm = rawKm;
    if (effectiveKm <= 0 && ((manualKm != null && manualKm > 0) || estimatedDistanceKm > 0)) {
      effectiveKm = minKm > 0 ? minKm : 1.0;
    }
    if (roundKmUp && effectiveKm > 0) effectiveKm = Math.ceil(effectiveKm);
    if (minKm > 0 && effectiveKm < minKm) effectiveKm = minKm;
    if (maxKm > 0 && effectiveKm > maxKm) effectiveKm = maxKm;

    const kmCost = effectiveKm * feePerKm;
    const totalCost = baseFee + kmCost;

    return {
      totalCost,
      kmCost,
      isCalculated: (manualKm != null && manualKm > 0) || estimatedDistanceKm > 0,
      effectiveKm,
      rawKm,
      feePerKm,
      baseFee,
      baseKmFee,
      dynamicFee,
      isDynamicActive: dynamicEnabled && dynamicFee > 0,
      isManual: manualKm != null && manualKm > 0,
    };
  }, [deliveryConfig, estimatedDistanceKm, deliveryCoordinates, addressInput, manualDistanceEnabled, manualDistanceKm]);

  // Geocodifica e calcula automaticamente quando o lojista termina de digitar o endereço
  const handleAddressBlur = async () => {
    // Não ativa loadingRoute aqui para evitar cancelar o evento de clique/submit do botão no navegador
    if (addressInput.trim().length >= 3 && !deliveryCoordinates) {
      try {
        const geo = await geocodeAddress(`${addressInput.trim()}, Primavera do Leste`).catch(() => null);
        if (geo?.coordinates) {
          setDeliveryCoordinates({
            lat: geo.coordinates.latitude,
            lng: geo.coordinates.longitude,
          });
        }
      } catch {
        // Fallback silencioso
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

    // Ajusta o tipo de destino automaticamente de acordo com a categoria detectada
    if (sug.placeCategory === "condominium") {
      setDestinationType("Apartamento / Condomínio");
    } else if (sug.placeCategory === "commercial") {
      setDestinationType("Comércio / Supermercado");
    } else if (sug.placeCategory === "avenue") {
      setDestinationType("Avenida / Rodovia");
    } else if (sug.placeCategory === "neighborhood") {
      setDestinationType("Bairro / Residencial");
    } else if (sug.placeCategory === "street") {
      setDestinationType("Casa / Residência");
    }
  };

  // Envio do formulário (Criação da corrida / Chamada do entregador)
  const handleSubmitDelivery = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    if (!addressInput.trim()) {
      toast.error("Por favor, digite o endereço de entrega.");
      return;
    }

    // Se o saldo for insuficiente, avisa de forma imediata e amigável em vez de travar o botão silenciosamente
    if (credits && fareDetails.totalCost !== null && Number(credits.balance || 0) < fareDetails.totalCost) {
      toast.error(`Saldo insuficiente na carteira (Possui R$ ${Number(credits.balance || 0).toFixed(2).replace(".", ",")}, necessário R$ ${fareDetails.totalCost.toFixed(2).replace(".", ",")}). Recarregue para chamar.`);
      if (onNavigateTab) onNavigateTab("credits");
      return;
    }

    const manualKmVal = manualDistanceEnabled && parseFloat(manualDistanceKm) > 0 ? parseFloat(manualDistanceKm) : null;
    let finalCoordinates = deliveryCoordinates;
    let finalDistance = manualKmVal ?? estimatedDistanceKm;

    // Se o usuário digitou mas não selecionou sugestão, geocodifica agora com suporte a Mapbox + Nominatim
    if (!finalCoordinates) {
      try {
        setIsSubmitting(true);
        const geo = await geocodeAddress(`${addressInput}, Primavera do Leste`);
        if (geo?.coordinates) {
          finalCoordinates = {
            lat: geo.coordinates.latitude,
            lng: geo.coordinates.longitude,
          };
          setDeliveryCoordinates(finalCoordinates);

          // Calcula a rota instantaneamente
          if (storeCoords && manualKmVal == null) {
            try {
              const r = await calculateRoute(storeCoords, finalCoordinates, { profile: "driving" });
              if (r?.distanceKm && r.distanceKm > 0) {
                finalDistance = r.distanceKm;
                setEstimatedDistanceKm(r.distanceKm);
              }
            } catch {
              // Mantém distância fallback
            }
          }
        }
      } catch (geoErr) {
        console.warn("[StoreModernDashboard] Geocode no submit:", geoErr);
      }
    }

    // Se as coordenadas de entrega existem mas a distância ainda não foi calculada (ou rota em andamento)
    if (finalCoordinates && (finalDistance <= 0 || !finalDistance) && storeCoords && manualKmVal == null) {
      try {
        const r = await calculateRoute(storeCoords, finalCoordinates, { profile: "driving" });
        if (r?.distanceKm && r.distanceKm > 0) {
          finalDistance = r.distanceKm;
          setEstimatedDistanceKm(r.distanceKm);
        }
      } catch {
        // Fallback viário geodésico calibrado
      }

      if (finalDistance <= 0 || !finalDistance) {
        const R = 6371;
        const dLat = ((finalCoordinates.lat - storeCoords.lat) * Math.PI) / 180;
        const dLon = ((finalCoordinates.lng - storeCoords.lng) * Math.PI) / 180;
        const a =
          Math.sin(dLat / 2) * Math.sin(dLat / 2) +
          Math.cos((storeCoords.lat * Math.PI) / 180) *
            Math.cos((finalCoordinates.lat * Math.PI) / 180) *
            Math.sin(dLon / 2) *
            Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        finalDistance = Math.max(1.0, Number((R * c * 1.30).toFixed(1)));
        setEstimatedDistanceKm(finalDistance);
      }
    }

    let cleanAddress = addressInput.trim();
    // Remove sufixos duplicados de cidade se já estiverem presentes
    cleanAddress = cleanAddress.replace(/,?\s*-?\s*Primavera do Leste(\s*-?\s*MT)?(\s*-?\s*Brasil)?/gi, "").trim();

    let prefixTag = "";
    if (detectedCategory?.type === "condominium" && !cleanAddress.toLowerCase().includes("condom") && !cleanAddress.toLowerCase().includes("residencial")) {
      prefixTag = "[Condomínio] ";
    } else if (detectedCategory?.type === "commercial" && !cleanAddress.toLowerCase().includes("mercado") && !cleanAddress.toLowerCase().includes("loja") && !cleanAddress.toLowerCase().includes("comércio")) {
      prefixTag = "[Comércio/Supermercado] ";
    }

    const fullAddress = `${prefixTag}${
      streetNumber.trim() && !cleanAddress.includes(streetNumber.trim())
        ? `${cleanAddress}, ${streetNumber.trim()} - Primavera do Leste`
        : `${cleanAddress} - Primavera do Leste`
    }`;

    // Compila observações completas
    const notesParts: string[] = [];
    if (recipientName.trim()) notesParts.push(`Destinatário: ${recipientName.trim()}`);
    if (destinationType) notesParts.push(`Tipo: ${destinationType}`);
    if (detectedCategory?.badge && !destinationType.toLowerCase().includes(detectedCategory.badge.toLowerCase())) {
      notesParts.push(`Local: ${detectedCategory.label}`);
    }
    if (observation.trim()) notesParts.push(`Obs: ${observation.trim()}`);
    if (additionalNotes.trim()) notesParts.push(`Obs adicional: ${additionalNotes.trim()}`);
    const compiledNotes = notesParts.join(" • ");

    const pickupAddress = formatStorePickupAddress(restaurant, restaurant?.address);

    // Passa a quilometragem viária real calculada para o backend (mínimo garantido para saída + km)
    const rawDistanceToSend = manualKmVal ?? (finalDistance > 0 ? finalDistance : (fareDetails.rawKm > 0 ? fareDetails.rawKm : 2.5));
    const distanceToSend = Math.max(rawDistanceToSend, minKm > 0 ? minKm : 1.0);

    const roundKmUp = Boolean(deliveryConfig?.round_km_up ?? false);
    const minKm = Number(deliveryConfig?.min_km ?? 0);
    const maxKm = Number(deliveryConfig?.max_km ?? 0);
    const baseFee = Number(deliveryConfig?.base_fee ?? 5.3);
    const baseKmFee = Number(deliveryConfig?.fee_per_km ?? 1.7);
    const dynamicEnabled = Boolean(deliveryConfig?.dynamic_pricing_enabled);
    const dynamicFee = (dynamicEnabled && Number(deliveryConfig?.dynamic_fee_per_km ?? 0) > 0)
      ? Number(deliveryConfig?.dynamic_fee_per_km)
      : 0;
    // REGRA SÊNIOR: A taxa dinâmica SOMA com a taxa regular por km
    const feePerKm = baseKmFee + dynamicFee;

    let effectiveKm = distanceToSend;
    if (roundKmUp && effectiveKm > 0) effectiveKm = Math.ceil(effectiveKm);
    if (minKm > 0 && effectiveKm < minKm) effectiveKm = minKm;
    if (maxKm > 0 && effectiveKm > maxKm) effectiveKm = maxKm;

    const finalCalculatedCost = fareDetails.totalCost ?? (baseFee + (effectiveKm * feePerKm));

    setIsSubmitting(true);
    try {
      const { data: requestId, error } = await supabase.rpc("deduct_credits_for_delivery", {
        p_pickup_address: pickupAddress,
        p_delivery_address: fullAddress,
        p_notes: compiledNotes || null,
        p_restaurant_id: restaurant?.id || null,
        p_distance_km: distanceToSend,
        p_preferred_driver_id: null,
      } as any);

      if (error) throw error;

      // Grava imediatamente as coordenadas precisas de coleta e entrega e as observações completas na entrega criada
      if (requestId) {
        void supabase
          .from("delivery_requests")
          .update({
            pickup_address: pickupAddress,
            pickup_lat: storeCoords.lat,
            pickup_lng: storeCoords.lng,
            delivery_lat: deliveryCoordinates?.lat || null,
            delivery_lng: deliveryCoordinates?.lng || null,
            notes: compiledNotes || null,
          })
          .eq("id", requestId);

        // Dispara push de notificação a todos os motoristas cadastrados
        void notifyAvailableDrivers(String(requestId));
      }

      toast.success(`🚀 Entrega solicitada! Valor: R$ ${finalCalculatedCost.toFixed(2).replace(".", ",")}. Notificando motoristas...`);

      // Limpa formulário
      setRecipientName("");
      setAddressInput("");
      setStreetNumber("");
      setObservation("");
      setAdditionalNotes("");
      setDeliveryCoordinates(null);
      setEstimatedDistanceKm(0);
      setManualDistanceEnabled(false);
      setManualDistanceKm("");

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

  // Filtra as entregas conforme a aba ativa com proteção defensiva total
  const filteredRequests = useMemo(() => {
    if (!Array.isArray(requests)) return [];
    return requests.filter((r) => {
      if (!r) return false;
      if (statusFilter === "pending") return r.status === "pending";
      if (statusFilter === "accepted") return r.status === "accepted";
      if (statusFilter === "picked_up") return r.status === "picked_up";
      if (statusFilter === "cancelled") return r.status === "cancelled";
      if (statusFilter === "all") return true;
      return !["delivered", "cancelled"].includes(r.status);
    });
  }, [requests, statusFilter]);

  // Contagem para as abas com proteção contra nulos
  const countPending = useMemo(() => (Array.isArray(requests) ? requests.filter((r) => r?.status === "pending").length : 0), [requests]);
  const countAccepted = useMemo(() => (Array.isArray(requests) ? requests.filter((r) => r?.status === "accepted").length : 0), [requests]);
  const countTransit = useMemo(() => (Array.isArray(requests) ? requests.filter((r) => r?.status === "picked_up").length : 0), [requests]);
  const countCancelled = useMemo(() => (Array.isArray(requests) ? requests.filter((r) => r?.status === "cancelled").length : 0), [requests]);

  // Corrida para exibição no mini-mapa: prioriza ativa em rota ou aceita
  const displayMapRequest = useMemo(() => {
    if (!Array.isArray(requests)) return null;
    return (
      requests.find((r) => r?.status === "picked_up") ||
      requests.find((r) => r?.status === "accepted") ||
      requests.find((r) => r?.status === "pending") ||
      null
    );
  }, [requests]);

  // Coordenadas do motorista da corrida exibida no mini-mapa
  const currentDriverPos = useMemo(() => {
    if (!displayMapRequest?.driver_id || !Array.isArray(driverLocations)) return null;
    const dl = driverLocations.find(
      (d: any) => d && (d.user_id === displayMapRequest.driver_id || d.driver_id === displayMapRequest.driver_id)
    );
    if (dl) {
      const lat = Number(dl.latitude);
      const lng = Number(dl.longitude);
      if (isValidCoordinate(lat, lng)) {
        return { lat, lng };
      }
    }
    return null;
  }, [displayMapRequest, driverLocations]);

  // Geocodifica automaticamente o endereço de entrega da corrida ativa para traçar no mapa
  const [activeRequestCoords, setActiveRequestCoords] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    if (!displayMapRequest?.delivery_address) {
      setActiveRequestCoords(null);
      return;
    }
    let isCancelled = false;
    geocodeAddress(displayMapRequest.delivery_address)
      .then((parsed) => {
        if (!isCancelled && parsed?.coordinates) {
          const lat = Number(parsed.coordinates.latitude);
          const lng = Number(parsed.coordinates.longitude);
          if (isValidCoordinate(lat, lng)) {
            setActiveRequestCoords({ lat, lng });
          }
        }
      })
      .catch(() => {});

    return () => {
      isCancelled = true;
    };
  }, [displayMapRequest?.id, displayMapRequest?.delivery_address]);

  // Coordenadas de entrega da corrida exibida no mini-mapa
  const mapDeliveryLocation = useMemo(() => {
    if (deliveryCoordinates && isValidCoordinate(deliveryCoordinates.lat, deliveryCoordinates.lng)) {
      return deliveryCoordinates;
    }
    if (activeRequestCoords && isValidCoordinate(activeRequestCoords.lat, activeRequestCoords.lng)) {
      return activeRequestCoords;
    }
    if (storeCoords && isValidCoordinate(storeCoords.lat, storeCoords.lng)) {
      return { lat: storeCoords.lat + 0.008, lng: storeCoords.lng + 0.009 };
    }
    return null;
  }, [deliveryCoordinates, activeRequestCoords, storeCoords]);

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

        {/* Lado Direito: Saldo de Créditos, Botão Sair e Botão Laranja "Solicitar Nova Entrega" */}
        <div className="flex items-center gap-2 sm:gap-3">
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

          {onSignOut && (
            <button
              type="button"
              onClick={onSignOut}
              className="px-2.5 py-1.5 rounded-xl text-zinc-400 hover:text-red-500 hover:bg-red-500/10 border border-zinc-700/50 hover:border-red-500/30 transition-all flex items-center gap-1.5 text-xs font-semibold cursor-pointer active:scale-95"
              title="Sair da conta"
              aria-label="Sair da conta"
            >
              <LogOut className="w-4 h-4 text-red-500" />
              <span className="hidden sm:inline">Sair</span>
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
                    onChange={(e) => {
                      const val = e.target.value;
                      setAddressInput(val);
                      if (!val.trim()) {
                        setDeliveryCoordinates(null);
                        setEstimatedDistanceKm(0);
                      }
                    }}
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

                {/* Indicador de Precisão da Categoria de Local */}
                {detectedCategory && (
                  <div className="flex items-center gap-1.5 pt-1 text-[11px] font-medium animate-in fade-in duration-200">
                    <span className="text-muted-foreground">Classificação do local:</span>
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-bold text-[10px] border ${
                        detectedCategory.type === "condominium"
                          ? "bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-500/30"
                          : detectedCategory.type === "commercial"
                          ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30"
                          : detectedCategory.type === "avenue"
                          ? "bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30"
                          : detectedCategory.type === "neighborhood"
                          ? "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30"
                          : "bg-zinc-500/10 text-zinc-700 dark:text-zinc-300 border-zinc-500/20"
                      }`}
                    >
                      {detectedCategory.iconName === "building" && <Building2 className="w-3 h-3 text-purple-600 dark:text-purple-400" />}
                      {detectedCategory.iconName === "store" && <StoreIcon className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />}
                      {detectedCategory.iconName === "navigation" && <Route className="w-3 h-3 text-sky-600 dark:text-sky-400" />}
                      {detectedCategory.iconName === "home" && <Home className="w-3 h-3 text-amber-600 dark:text-amber-400" />}
                      {detectedCategory.iconName === "map-pin" && <MapPin className="w-3 h-3 text-[#EA580C]" />}
                      <span>{detectedCategory.label}</span>
                    </span>
                  </div>
                )}

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

                    {addressSuggestions.map((sug) => {
                      const cat = sug.placeCategory || "street";
                      return (
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
                          <div
                            className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 transition-colors ${
                              cat === "condominium"
                                ? "bg-purple-500/15 text-purple-600 dark:text-purple-400 group-hover:bg-purple-600 group-hover:text-white"
                                : cat === "commercial"
                                ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 group-hover:bg-emerald-600 group-hover:text-white"
                                : cat === "avenue"
                                ? "bg-sky-500/15 text-sky-600 dark:text-sky-400 group-hover:bg-sky-600 group-hover:text-white"
                                : cat === "neighborhood"
                                ? "bg-amber-500/15 text-amber-600 dark:text-amber-400 group-hover:bg-amber-600 group-hover:text-white"
                                : "bg-[#EA580C]/10 text-[#EA580C] group-hover:bg-[#EA580C] group-hover:text-white"
                            }`}
                          >
                            {cat === "condominium" ? (
                              <Building2 className="w-4 h-4" />
                            ) : cat === "commercial" ? (
                              <StoreIcon className="w-4 h-4" />
                            ) : cat === "avenue" ? (
                              <Route className="w-4 h-4" />
                            ) : cat === "neighborhood" ? (
                              <Home className="w-4 h-4" />
                            ) : (
                              <MapPin className="w-4 h-4" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-xs sm:text-sm font-bold text-foreground truncate group-hover:text-[#EA580C] transition-colors">
                                {sug.title}
                              </p>
                              {sug.placeCategoryLabel && (
                                <span
                                  className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0 border ${
                                    cat === "condominium"
                                      ? "bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-500/30"
                                      : cat === "commercial"
                                      ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30"
                                      : cat === "avenue"
                                      ? "bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30"
                                      : cat === "neighborhood"
                                      ? "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30"
                                      : "bg-zinc-500/10 text-zinc-700 dark:text-zinc-300 border-zinc-500/20"
                                  }`}
                                >
                                  {sug.placeCategoryLabel}
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-muted-foreground truncate">
                              {sug.subtitle}
                            </p>
                          </div>
                          <ChevronRight className="w-4 h-4 text-muted-foreground/60 group-hover:text-[#EA580C] shrink-0" />
                        </button>
                      );
                    })}
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
                  <option value="Comércio / Supermercado">Comércio / Supermercado</option>
                  <option value="Avenida / Rodovia">Avenida / Rodovia</option>
                  <option value="Escritório / Empresa">Escritório / Empresa</option>
                  <option value="Hospital / Clínica">Hospital / Clínica</option>
                  <option value="Bairro / Residencial">Bairro / Residencial</option>
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
                            {fareDetails.effectiveKm.toFixed(1)} km
                          </span>
                          <span className="text-[10px] text-muted-foreground block mt-0.5">
                            ~{Math.max(4, Math.round(fareDetails.effectiveKm * 2.5))} min de trajeto
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Detalhamento do Cálculo: Taxa de Saída + KM Rodado */}
                    <div className="p-2.5 rounded-xl bg-background/60 border border-border/50 text-xs space-y-1.5">
                      <div className="flex items-center justify-between text-muted-foreground">
                        <span>Taxa de saída (partida):</span>
                        <strong className="text-foreground">R$ {fareDetails.baseFee.toFixed(2).replace(".", ",")}</strong>
                      </div>
                      <div className="flex items-center justify-between text-muted-foreground">
                        <span>KM rodado ({fareDetails.effectiveKm.toFixed(1)} km × R$ {fareDetails.feePerKm.toFixed(2).replace(".", ",")}/km):</span>
                        <strong className="text-foreground">+ R$ {fareDetails.kmCost.toFixed(2).replace(".", ",")}</strong>
                      </div>
                      <div className="border-t border-border/50 pt-1 flex items-center justify-between font-bold text-xs text-[#EA580C]">
                        <span>Total da Corrida (Saída + KM):</span>
                        <span>R$ {fareDetails.totalCost.toFixed(2).replace(".", ",")}</span>
                      </div>
                    </div>

                    {/* Ajuste Manual de Quilometragem */}
                    <div className="pt-0.5">
                      {!manualDistanceEnabled ? (
                        <button
                          type="button"
                          onClick={() => {
                            setManualDistanceEnabled(true);
                            setManualDistanceKm((fareDetails.effectiveKm || 2.5).toFixed(1));
                          }}
                          className="text-[11px] text-[#EA580C] hover:underline font-semibold flex items-center gap-1 cursor-pointer"
                        >
                          <Route className="w-3 h-3" /> Ajustar km manualmente se necessário
                        </button>
                      ) : (
                        <div className="flex items-center gap-2 p-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs">
                          <label className="text-[11px] font-semibold text-amber-700 dark:text-amber-400 shrink-0">
                            KM Manual:
                          </label>
                          <input
                            type="number"
                            step="0.1"
                            min="0.5"
                            max="50"
                            value={manualDistanceKm}
                            onChange={(e) => setManualDistanceKm(e.target.value)}
                            className="w-20 px-2 py-1 text-xs rounded-lg border border-border bg-background font-bold text-foreground"
                          />
                          <span className="text-[11px] text-muted-foreground">km</span>
                          <button
                            type="button"
                            onClick={() => {
                              setManualDistanceEnabled(false);
                              setManualDistanceKm("");
                            }}
                            className="text-[10px] text-muted-foreground hover:text-foreground underline ml-auto cursor-pointer"
                          >
                            Voltar ao automático
                          </button>
                        </div>
                      )}
                    </div>

                    {fareDetails.isDynamicActive && (
                      <div className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-800 dark:text-amber-300 text-xs">
                        <span className="flex items-center gap-1.5 font-bold">
                          <Flame className="w-3.5 h-3.5 text-amber-500 fill-amber-500 animate-pulse" />
                          Tarifa Dinâmica Ativa
                        </span>
                        <span className="font-semibold text-[11px]">
                          + R$ {fareDetails.dynamicFee.toFixed(2)}/km (Total: R$ {fareDetails.feePerKm.toFixed(2)}/km)
                        </span>
                      </div>
                    )}

                    {/* Informações complementares de saldo */}
                    <div className="pt-2 border-t border-border/40 flex items-center justify-between text-[11px] text-muted-foreground">
                      <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Cálculo oficial: taxa de saída + km rodado
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
                disabled={isSubmitting || !addressInput.trim()}
                className="w-full bg-[#EA580C] hover:bg-[#C2410C] text-white font-extrabold text-sm sm:text-base py-3.5 px-4 rounded-xl shadow-lg shadow-orange-500/25 transition-all duration-200 active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 select-none cursor-pointer mt-1"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin text-white" />
                    <span>Enviando chamado...</span>
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
                Total: <strong>{(Array.isArray(requests) ? requests.filter((r) => r && !["delivered", "cancelled"].includes(r.status)) : []).length}</strong> em andamento
              </span>
            </div>

            {/* Card de Status de Busca (Destaque em Âmbar / Laranja Suave) */}
            <div
              className={`rounded-2xl p-4 border flex items-center justify-between gap-3.5 transition-all shadow-xs ${
                isDark
                  ? "bg-amber-950/25 border-amber-800/40 text-amber-200"
                  : "bg-[#FEF3C7] border-[#FCD34D] text-amber-950"
              }`}
            >
              <div className="flex items-center gap-3.5 min-w-0">
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

              {countPending > 0 && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const pendingReq = requests.find((r) => r?.status === "pending");
                    if (pendingReq?.id) onOpenCancelModal(pendingReq.id, null, false, null);
                  }}
                  className="shrink-0 text-red-600 border-red-300 bg-white/90 dark:bg-zinc-900/90 hover:bg-red-50 dark:hover:bg-red-950/50 hover:text-red-700 text-xs font-bold rounded-xl h-9 px-3 shadow-2xs"
                >
                  <XCircle className="w-4 h-4 mr-1.5 text-red-600" />
                  <span>Cancelar Chamada</span>
                </Button>
              )}
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
                  const deliveryVal = Number(req.credit_cost ?? req.driver_fee ?? 0);

                  return (
                    <div
                      key={req.id}
                      onClick={() => setSelectedOrderDetails(req)}
                      className={`rounded-2xl p-4 border transition-all duration-200 cursor-pointer shadow-xs hover:shadow-md space-y-3 ${
                        isDark
                          ? "bg-[#18181B] border-zinc-800 hover:border-zinc-700 text-white"
                          : "bg-white border-zinc-200 hover:border-orange-200 text-zinc-900"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h4 className="font-extrabold text-sm sm:text-base leading-tight truncate">
                              {restaurant?.name || "Pizzaria Piacenza"}
                            </h4>
                            <span className={`text-[10px] font-mono font-medium ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>
                              #{req?.id ? String(req.id).slice(0, 6) : "------"}
                            </span>
                            {deliveryVal > 0 && (
                              <span className="text-xs font-black text-[#EA580C] bg-orange-500/10 px-2 py-0.5 rounded-md border border-orange-500/20">
                                R$ {deliveryVal.toFixed(2).replace(".", ",")}
                              </span>
                            )}
                          </div>

                          <p className={`text-xs truncate ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>
                            Entrega: <span className="font-medium text-foreground">{req.delivery_address || "Endereço não informado"}</span>
                          </p>

                          {req.notes && (
                            <p className={`text-xs flex items-center gap-1.5 pt-0.5 ${isDark ? "text-amber-300/90" : "text-amber-800"}`} title={req.notes}>
                              <FileText className="w-3.5 h-3.5 shrink-0 text-amber-500" />
                              <span className="truncate font-medium">{req.notes}</span>
                            </p>
                          )}

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

                        {/* Lado Direito: Badge de Status e Seta */}
                        <div className="flex items-center gap-2.5 shrink-0">
                          {isPending && (
                            <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-300/40">
                              Aguardando
                            </span>
                          )}

                          {isAccepted && (
                            <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-sky-100 dark:bg-sky-950/60 text-sky-800 dark:text-sky-300 border border-sky-300/40">
                              Em Coleta
                            </span>
                          )}

                          {isTransit && (
                            <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-300/40">
                              Em Rota
                            </span>
                          )}

                          {isCancelled && (
                            <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-300 border border-red-300/40">
                              Cancelada
                            </span>
                          )}

                          <ChevronRight className="w-4 h-4 text-zinc-400 group-hover:text-foreground transition-transform" />
                        </div>
                      </div>

                      {/* SE PENDENTE: Linha com botão destacado e visível "Cancelar Chamada" */}
                      {isPending && (
                        <div
                          onClick={(e) => e.stopPropagation()}
                          className={`p-2.5 rounded-xl border flex items-center justify-between gap-3 flex-wrap ${
                            isDark
                              ? "bg-amber-950/20 border-amber-900/40 text-amber-200"
                              : "bg-amber-50/80 border-amber-200/80 text-amber-900"
                          }`}
                        >
                          <div className="flex items-center gap-2 text-xs font-medium">
                            <Loader2 className="w-4 h-4 animate-spin text-[#EA580C] shrink-0" />
                            <span>Aguardando motorista aceitar a chamada...</span>
                          </div>

                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => onOpenCancelModal(req.id, null, false, null)}
                            className="text-red-600 border-red-300 hover:bg-red-500/10 dark:hover:bg-red-950/40 hover:text-red-700 text-xs font-bold rounded-xl h-8 px-3 shrink-0 shadow-2xs"
                          >
                            <XCircle className="w-3.5 h-3.5 mr-1.5 text-red-600" />
                            <span>Cancelar Chamada</span>
                          </Button>
                        </div>
                      )}

                      {/* SE ACEITO OU EM ROTA: Dados completos do motorista (Foto, Nome, Placa, Telefone, WhatsApp, Ligar, Cancelar) */}
                      {(isAccepted || isTransit) && (
                        <ActiveDriverInfoRow
                          request={req}
                          cachedDriver={getDriverInfo(req.driver_id)}
                          onOpenCancelModal={onOpenCancelModal}
                          isDark={isDark}
                        />
                      )}
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
                    storeCoords && isValidCoordinate(storeCoords.lat, storeCoords.lng)
                      ? { lat: storeCoords.lat, lng: storeCoords.lng, name: restaurant?.name || "Loja" }
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
              <span>Detalhes da Corrida #{selectedOrderDetails?.id ? String(selectedOrderDetails.id).slice(0, 8) : "--------"}</span>
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
                {(selectedOrderDetails.credit_cost || selectedOrderDetails.driver_fee) && (
                  <div className="flex items-center justify-between pt-1.5 border-t border-border/40">
                    <span className="text-[11px] font-semibold text-zinc-400">Valor da Corrida</span>
                    <span className="text-sm font-black text-[#EA580C]">
                      R$ {Number(selectedOrderDetails.credit_cost || selectedOrderDetails.driver_fee || 0).toFixed(2).replace(".", ",")}
                    </span>
                  </div>
                )}
              </div>

              {/* Informações completas do motorista vinculado (se já aceito) */}
              {selectedOrderDetails.driver_id && selectedOrderDetails.status !== "cancelled" && (
                <div className="pt-1">
                  <AssignedDriverCard
                    activeRequest={selectedOrderDetails}
                    onCancelRequest={(reqId, dName, isAcc, dDetails) => {
                      setSelectedOrderDetails(null);
                      onOpenCancelModal(reqId, dName, isAcc, dDetails);
                    }}
                  />
                </div>
              )}

              {/* Botão de Cancelamento (apenas se ainda NÃO estiver cancelada) */}
              {selectedOrderDetails.status !== "cancelled" && (
                <div className="pt-1">
                  <Button
                    variant="outline"
                    onClick={() => {
                      const req = selectedOrderDetails;
                      setSelectedOrderDetails(null);
                      if (req?.id) {
                        onOpenCancelModal(req.id, null, req.status !== "pending");
                      }
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