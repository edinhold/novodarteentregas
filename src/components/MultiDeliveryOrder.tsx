import { notifyAvailableDrivers } from "@/lib/push";
import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  Plus,
  Trash2,
  MapPin,
  User,
  Phone,
  Package,
  Route,
  Loader2,
  ArrowUp,
  ArrowDown,
  Info,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Search,
  Check,
  Map as MapIcon,
} from "lucide-react";
import {
  geocodeAddress,
  searchAddressSuggestions,
  calculateMultiStopRoute,
  isValidCoordinate,
  MapboxMultiStopRouteResult,
  MapboxParsedAddress,
} from "@/services/mapbox";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { MAP_LAYERS } from "@/config/maps";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

const MAX_STOPS = 10;

type StopItem = {
  id: string;
  customer_name: string;
  customer_phone: string;
  delivery_address: string;
  notes: string;
  distance_km: string; // Exibição do trecho sequencial
  lat?: number | null;
  lng?: number | null;
};

const createEmptyStop = (): StopItem => ({
  id: Math.random().toString(36).substring(2, 9),
  customer_name: "",
  customer_phone: "",
  delivery_address: "",
  notes: "",
  distance_km: "0.00",
  lat: null,
  lng: null,
});

interface Props {
  restaurant: any;
  userId: string;
}

// Geocodificação inteligente com fallback para Primavera do Leste - MT
async function safeGeocode(address: string): Promise<{ lat: number; lng: number } | null> {
  if (!address || address.trim().length < 3) return null;
  const cleanAddr = address.trim();

  try {
    const parsed = await geocodeAddress(cleanAddr);
    if (parsed?.coordinates && isValidCoordinate(parsed.coordinates.latitude, parsed.coordinates.longitude)) {
      return {
        lat: parsed.coordinates.latitude,
        lng: parsed.coordinates.longitude,
      };
    }
  } catch (err) {
    // Fallback: busca por sugestões caso a geocodificação direta estrita falhe por conta de complementos
    try {
      const suggestions = await searchAddressSuggestions(cleanAddr, { limit: 1 });
      if (suggestions.length > 0 && suggestions[0].coordinates) {
        return {
          lat: suggestions[0].coordinates.latitude,
          lng: suggestions[0].coordinates.longitude,
        };
      }
    } catch (sugErr) {
      console.warn("[MultiDelivery] Falha no fallback de geocodificação:", cleanAddr, sugErr);
    }
  }
  return null;
}

const MultiDeliveryOrder = ({ restaurant, userId }: Props) => {
  const queryClient = useQueryClient();
  const [stops, setStops] = useState<StopItem[]>([createEmptyStop()]);
  const [groupNotes, setGroupNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [calculating, setCalculating] = useState(false);
  const [routeResult, setRouteResult] = useState<MapboxMultiStopRouteResult | null>(null);

  // Estado de busca de endereço por parada para Autocomplete
  const [activeSearchIdx, setActiveSearchIdx] = useState<number | null>(null);
  const [suggestionsMap, setSuggestionsMap] = useState<Record<number, MapboxParsedAddress[]>>({});
  const [searchingMap, setSearchingMap] = useState<Record<number, boolean>>({});

  // Refs de mapa Leaflet para renderizar prévia da rota
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const polylineRef = useRef<L.Polyline | null>(null);
  const markersRef = useRef<L.Marker[]>([]);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Contador de requisições para prevenir race condition
  const calcRequestIdRef = useRef(0);

  const { data: config } = useQuery({
    queryKey: ["public-delivery-config"],
    queryFn: async () => {
      const { data } = await supabase.rpc("get_public_delivery_config").maybeSingle();
      return data as any;
    },
  });

  const { data: credits } = useQuery({
    queryKey: ["my-credits", userId],
    queryFn: async () => {
      const { data } = await supabase
        .from("store_credits")
        .select("*")
        .eq("user_id", userId)
        .limit(1)
        .maybeSingle();
      return data;
    },
  });

  const { data: groups = [] } = useQuery({
    queryKey: ["my-delivery-groups", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("delivery_groups")
        .select("*")
        .eq("store_owner_id", userId)
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data || [];
    },
  });

  useEffect(() => {
    const channel = supabase
      .channel("multi-delivery-groups")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "delivery_groups",
          filter: `store_owner_id=eq.${userId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["my-delivery-groups", userId] });
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, queryClient]);

  // Parâmetros oficiais da regra de precificação do Admin
  const baseFee = Number(config?.base_fee ?? 5.30);
  const isDynamicPricing = !!(config as any)?.dynamic_pricing_enabled && Number((config as any)?.dynamic_fee_per_km ?? 0) > 0;
  const feePerKm = isDynamicPricing
    ? Number((config as any).dynamic_fee_per_km)
    : Number(config?.fee_per_km ?? 1.70);
  const minKm = Number(config?.min_km ?? 0);
  const maxKm = Number(config?.max_km ?? 0);
  const roundUp = Boolean(config?.round_km_up);

  // Distância total da operação (soma dos trechos sequenciais)
  const totalRouteKm = useMemo(() => {
    let sum = 0;
    for (const s of stops) {
      const val = parseFloat(s.distance_km) || 0;
      if (Number.isFinite(val) && val > 0) {
        sum += val;
      }
    }
    return Math.max(0, sum);
  }, [stops]);

  // Cálculo de km faturável (arredondamento/limites do Admin)
  const billableKm = useMemo(() => {
    let km = totalRouteKm;
    if (roundUp && km > 0) km = Math.ceil(km);
    if (minKm > 0 && km < minKm) km = minKm;
    if (maxKm > 0 && maxKm > 0 && km > maxKm) km = maxKm;
    return km;
  }, [totalRouteKm, roundUp, minKm, maxKm]);

  // CUSTO TOTAL DA OPERAÇÃO MULTI-ENTREGAS (Base fee aplicada 1x)
  const totalOperationCost = useMemo(() => {
    if (stops.length === 0) return 0;
    return baseFee + feePerKm * billableKm;
  }, [baseFee, feePerKm, billableKm, stops.length]);

  // Rateio proporcional do custo por parada (sem duplicar o valor total)
  const stopCostBreakdown = useMemo(() => {
    const validStopsCount = stops.filter((s) => s.delivery_address.trim()).length || stops.length;
    return stops.map((s) => {
      const legKm = parseFloat(s.distance_km) || 0;
      if (totalRouteKm > 0) {
        const fraction = legKm / totalRouteKm;
        return Number((totalOperationCost * fraction).toFixed(2));
      } else {
        return Number((totalOperationCost / validStopsCount).toFixed(2));
      }
    });
  }, [stops, totalRouteKm, totalOperationCost]);

  const balance = Number(credits?.balance ?? 0);
  const insufficient = totalOperationCost > balance;

  // Atualiza um campo da parada e reseta coordenadas velhas caso o endereço texto seja editado manualmente
  const updateStop = (idx: number, patch: Partial<StopItem>) => {
    setRouteResult(null);
    setStops((prev) =>
      prev.map((s, i) => {
        if (i !== idx) return s;
        const updated = { ...s, ...patch };
        if (patch.delivery_address !== undefined && patch.lat === undefined && patch.lng === undefined) {
          updated.lat = null;
          updated.lng = null;
        }
        return updated;
      })
    );
  };

  // Autocomplete debocado por parada
  const handleAddressInputChange = (idx: number, text: string) => {
    updateStop(idx, { delivery_address: text });

    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);

    if (text.trim().length < 3) {
      setActiveSearchIdx(null);
      setSuggestionsMap((prev) => ({ ...prev, [idx]: [] }));
      setSearchingMap((prev) => ({ ...prev, [idx]: false }));
      return;
    }

    setActiveSearchIdx(idx);
    setSearchingMap((prev) => ({ ...prev, [idx]: true }));

    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const suggestions = await searchAddressSuggestions(text, { limit: 5 });
        setSuggestionsMap((prev) => ({ ...prev, [idx]: suggestions }));
      } catch (e) {
        console.warn("[MultiDelivery] Autocomplete error:", e);
        setSuggestionsMap((prev) => ({ ...prev, [idx]: [] }));
      } finally {
        setSearchingMap((prev) => ({ ...prev, [idx]: false }));
      }
    }, 350);
  };

  const selectSuggestion = (idx: number, item: MapboxParsedAddress) => {
    updateStop(idx, {
      delivery_address: item.fullAddress,
      lat: item.coordinates.latitude,
      lng: item.coordinates.longitude,
    });
    setActiveSearchIdx(null);
    setSuggestionsMap((prev) => ({ ...prev, [idx]: [] }));
    toast.success(`📍 Parada ${idx + 1} localizada: ${item.street}${item.number ? ", " + item.number : ""}`);
  };

  const addStop = () => {
    if (stops.length >= MAX_STOPS) {
      return toast.error(`Máximo de ${MAX_STOPS} paradas por operação`);
    }
    setRouteResult(null);
    setStops((prev) => [...prev, createEmptyStop()]);
  };

  const removeStop = (idx: number) => {
    if (stops.length <= 1) return;
    setRouteResult(null);
    setStops((prev) => prev.filter((_, i) => i !== idx));
    setSuggestionsMap((prev) => {
      const next = { ...prev };
      delete next[idx];
      return next;
    });
  };

  const moveStop = (fromIdx: number, toIdx: number) => {
    if (toIdx < 0 || toIdx >= stops.length) return;
    setRouteResult(null);
    setStops((prev) => {
      const updated = [...prev];
      const [moved] = updated.splice(fromIdx, 1);
      updated.splice(toIdx, 0, moved);
      return updated;
    });
  };

  // Renderização do Mapa Leaflet da Rota Multi-Paradas
  useEffect(() => {
    if (!mapContainerRef.current) return;
    if (!mapInstanceRef.current && !(mapContainerRef.current as any)._leaflet_id) {
      const map = L.map(mapContainerRef.current).setView([-15.5454, -54.2958], 13);
      const tileUrl = MAP_LAYERS.streets?.url || MAP_LAYERS.osm?.url || "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
      const tileAttr = MAP_LAYERS.streets?.attribution || MAP_LAYERS.osm?.attribution || '&copy; OpenStreetMap';
      L.tileLayer(tileUrl, {
        attribution: tileAttr,
        maxZoom: 19,
      }).addTo(map);
      mapInstanceRef.current = map;
    }

    const map = mapInstanceRef.current;
    if (!map) return;

    // Limpa marcadores e linhas anteriores
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];
    if (polylineRef.current) {
      polylineRef.current.remove();
      polylineRef.current = null;
    }

    const bounds: [number, number][] = [];

    // 1. Marcador da Loja (Origem)
    if (
      restaurant?.latitude != null &&
      restaurant?.longitude != null &&
      isValidCoordinate(Number(restaurant.latitude), Number(restaurant.longitude))
    ) {
      const storeLatLng: [number, number] = [Number(restaurant.latitude), Number(restaurant.longitude)];
      const storeMarker = L.marker(storeLatLng, {
        icon: L.icon({
          iconUrl:
            "data:image/svg+xml," +
            encodeURIComponent(
              `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="%23e53935" stroke="white" stroke-width="1.5"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3" fill="white"/></svg>`
            ),
          iconSize: [32, 32],
          iconAnchor: [16, 32],
        }),
      })
        .bindPopup(`<b>Loja (Coleta Única):</b> ${restaurant.name || "Sua Loja"}`)
        .addTo(map);

      markersRef.current.push(storeMarker);
      bounds.push(storeLatLng);
    }

    // 2. Marcadores das Paradas (Destinos)
    stops.forEach((s, i) => {
      if (s.lat != null && s.lng != null && isValidCoordinate(s.lat, s.lng)) {
        const stopLatLng: [number, number] = [s.lat, s.lng];
        const stopMarker = L.marker(stopLatLng, {
          icon: L.divIcon({
            className: "custom-stop-marker",
            html: `<div style="background-color: #22c55e; color: white; border: 2px solid white; border-radius: 50%; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 12px; box-shadow: 0 2px 6px rgba(0,0,0,0.3);">${i + 1}</div>`,
            iconSize: [28, 28],
            iconAnchor: [14, 14],
          }),
        })
          .bindPopup(`<b>Parada ${i + 1}:</b> ${s.customer_name || "Cliente"}<br/>${s.delivery_address}`)
          .addTo(map);

        markersRef.current.push(stopMarker);
        bounds.push(stopLatLng);
      }
    });

    // 3. Traçado Polylines da rota Mapbox
    if (routeResult?.geometry && routeResult.geometry.length > 0) {
      const poly = L.polyline(routeResult.geometry, {
        color: "#2563eb",
        weight: 5,
        opacity: 0.8,
        lineCap: "round",
      }).addTo(map);
      polylineRef.current = poly;
    }

    if (bounds.length > 0) {
      map.fitBounds(L.latLngBounds(bounds), { padding: [40, 40] });
    }
  }, [restaurant, stops, routeResult]);

  // CÁLCULO UNIFICADO DA ROTA COMPLETA VIA MAPBOX
  const calculateAllDistances = useCallback(async () => {
    if (!restaurant) {
      return toast.error("Cadastre sua loja primeiro");
    }
    if (!restaurant?.address && (restaurant.latitude == null || restaurant.longitude == null)) {
      return toast.error("Loja sem endereço de coleta cadastrado");
    }

    const currentRequestId = ++calcRequestIdRef.current;
    setCalculating(true);

    try {
      // 1. Obtém a coordenada da loja (origem da operação)
      let origin: { lat: number; lng: number } | null = null;
      if (
        restaurant.latitude != null &&
        restaurant.longitude != null &&
        isValidCoordinate(Number(restaurant.latitude), Number(restaurant.longitude))
      ) {
        origin = { lat: Number(restaurant.latitude), lng: Number(restaurant.longitude) };
      } else {
        origin = await safeGeocode(restaurant.address);
      }

      if (!origin) {
        toast.error("Não foi possível localizar as coordenadas da loja (origem).");
        return;
      }

      // 2. Geocodifica todas as paradas preenchidas
      const currentStops = [...stops];
      const validDestinations: { index: number; lat: number; lng: number }[] = [];

      for (let i = 0; i < currentStops.length; i++) {
        const addr = currentStops[i].delivery_address.trim();
        if (!addr) continue;

        let coords: { lat: number; lng: number } | null = null;
        if (
          currentStops[i].lat != null &&
          currentStops[i].lng != null &&
          isValidCoordinate(currentStops[i].lat!, currentStops[i].lng!)
        ) {
          coords = { lat: currentStops[i].lat!, lng: currentStops[i].lng! };
        } else {
          coords = await safeGeocode(addr);
        }

        if (coords) {
          validDestinations.push({ index: i, ...coords });
        } else {
          toast.error(`Não foi possível localizar o endereço da Parada ${i + 1}`);
        }
      }

      if (currentRequestId !== calcRequestIdRef.current) return;

      if (validDestinations.length === 0) {
        toast.error("Preencha ao menos um endereço de entrega válido.");
        return;
      }

      // 3. Executa a rota unificada Multi-Waypoints Mapbox: Loja -> P1 -> P2 -> ... -> PN
      const destCoords = validDestinations.map((d) => ({ lat: d.lat, lng: d.lng }));
      const result = await calculateMultiStopRoute(origin, destCoords);

      if (currentRequestId !== calcRequestIdRef.current) return;

      // 4. Atualiza cada parada com a distância real do trecho percorrido (leg)
      const updatedStops = [...currentStops];
      for (let i = 0; i < validDestinations.length; i++) {
        const dest = validDestinations[i];
        const leg = result.legs[i];
        const legKm = leg ? leg.distanceKm : 0;

        updatedStops[dest.index] = {
          ...updatedStops[dest.index],
          lat: dest.lat,
          lng: dest.lng,
          distance_km: legKm.toFixed(2),
        };
      }

      setStops(updatedStops);
      setRouteResult(result);
      toast.success(
        `Rota otimizada com sucesso! Distância total: ${result.totalDistanceKm.toFixed(1)} km`
      );
    } catch (e: any) {
      console.error("[MultiDelivery] Erro no cálculo de rota:", e);
      toast.error(e?.userMessage || e?.message || "Erro ao calcular rota do Multi Entregas.");
    } finally {
      if (currentRequestId === calcRequestIdRef.current) {
        setCalculating(false);
      }
    }
  }, [restaurant, stops]);

  const submit = async () => {
    if (!restaurant) return toast.error("Cadastre sua loja primeiro");
    if (!restaurant.address) return toast.error("Defina o endereço de coleta da loja");

    const valid = stops.filter((s) => s.delivery_address.trim() && s.customer_name.trim());
    if (valid.length === 0) {
      return toast.error("Preencha cliente e endereço de pelo menos uma parada");
    }
    if (valid.length !== stops.length) {
      return toast.error("Preencha cliente e endereço em todas as paradas (ou remova as vazias)");
    }
    if (insufficient) {
      return toast.error("Créditos insuficientes para esta operação");
    }

    setSubmitting(true);
    try {
      const payload = stops.map((s) => ({
        delivery_address: s.delivery_address.trim(),
        customer_name: s.customer_name.trim(),
        customer_phone: s.customer_phone.trim() || null,
        notes: s.notes.trim() || null,
        distance_km: Math.max(0, parseFloat(s.distance_km) || 0),
      }));

      const { data, error } = await supabase.rpc("create_delivery_group", {
        p_restaurant_id: restaurant.id,
        p_pickup_address: restaurant.address,
        p_stops: payload,
        p_preferred_driver_id: null,
        p_group_notes: groupNotes.trim() || null,
      });

      if (error) throw error;

      // Notifica motoristas online sobre cada parada criada
      try {
        const { data: created } = await supabase
          .from("delivery_requests")
          .select("id")
          .eq("group_id", String(data))
          .eq("status", "pending");
        (created ?? []).forEach((r: any) => void notifyAvailableDrivers(r.id));
      } catch {
        /* push nunca bloqueia a criação */
      }

      toast.success(`Operação Multi Entregas criada com ${stops.length} parada(s)!`);

      setStops([createEmptyStop()]);
      setGroupNotes("");
      setRouteResult(null);
      queryClient.invalidateQueries({ queryKey: ["my-credits", userId] });
      queryClient.invalidateQueries({ queryKey: ["my-delivery-groups", userId] });
    } catch (e: any) {
      toast.error(e.message || "Erro ao criar operação Multi Entregas");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl font-bold">
            <Route className="w-6 h-6 text-primary" /> Multi Entregas (Operação Única)
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Monte uma rota unificada com até {MAX_STOPS} paradas em Primavera do Leste - MT. Um único motorista realiza a coleta na loja e segue a sequência logística com preço otimizado.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Informações da Coleta Única */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border bg-muted/40 p-4">
            <div className="text-sm space-y-1">
              <div className="font-semibold flex items-center gap-2">
                <MapPin className="w-4 h-4 text-red-500" />
                Coleta Única: {restaurant?.name || "—"}
              </div>
              <div className="text-muted-foreground text-xs truncate">
                {restaurant?.address || "Endereço não cadastrado"}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs px-3 py-1 font-semibold">
                1x Taxa de Coleta
              </Badge>
              <Badge variant="secondary" className="text-xs px-3 py-1">
                {stops.length}/{MAX_STOPS} Paradas
              </Badge>
            </div>
          </div>

          {/* Cards de Paradas Sequenciais */}
          {stops.map((s, idx) => {
            const hasCoords = s.lat != null && s.lng != null;
            const currentSuggestions = suggestionsMap[idx] || [];
            const isSearchingThis = searchingMap[idx];
            const isDropdownOpen = activeSearchIdx === idx && currentSuggestions.length > 0;

            return (
              <Card key={s.id} className="border border-border/80 shadow-sm relative transition-all">
                <CardContent className="pt-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge className="gap-1 bg-primary text-primary-foreground font-semibold">
                        <Package className="w-3.5 h-3.5" /> Parada {idx + 1}
                      </Badge>

                      {hasCoords ? (
                        <Badge variant="outline" className="bg-emerald-500/10 text-emerald-700 border-emerald-300 gap-1 text-[10px]">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Endereço Localizado
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="bg-amber-500/10 text-amber-700 border-amber-300 gap-1 text-[10px]">
                          <Search className="w-3 h-3 text-amber-600" /> Digite para buscar
                        </Badge>
                      )}

                      {idx === 0 && (
                        <span className="text-xs text-muted-foreground font-medium">
                          (Trecho 1: Loja ➔ Destino 1)
                        </span>
                      )}
                      {idx > 0 && (
                        <span className="text-xs text-muted-foreground font-medium">
                          (Trecho {idx + 1}: Parada {idx} ➔ Destino {idx + 1})
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      {/* Botões de reordenamento */}
                      <div className="flex items-center gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          disabled={idx === 0}
                          onClick={() => moveStop(idx, idx - 1)}
                          title="Mover para cima"
                        >
                          <ArrowUp className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          disabled={idx === stops.length - 1}
                          onClick={() => moveStop(idx, idx + 1)}
                          title="Mover para baixo"
                        >
                          <ArrowDown className="w-3.5 h-3.5" />
                        </Button>
                      </div>

                      <div className="text-right">
                        <span className="text-xs text-muted-foreground block">Rateio estimado</span>
                        <span className="text-sm font-bold text-foreground">
                          R$ {stopCostBreakdown[idx]?.toFixed(2) ?? "0.00"}
                        </span>
                      </div>

                      {stops.length > 1 && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-destructive hover:bg-destructive/10"
                          onClick={() => removeStop(idx)}
                          title="Remover parada"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="flex items-center gap-1 text-xs">
                        <User className="w-3 h-3 text-muted-foreground" /> Nome do Cliente *
                      </Label>
                      <Input
                        value={s.customer_name}
                        onChange={(e) => updateStop(idx, { customer_name: e.target.value })}
                        placeholder="Ex.: Maria Souza"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="flex items-center gap-1 text-xs">
                        <Phone className="w-3 h-3 text-muted-foreground" /> Telefone (WhatsApp)
                      </Label>
                      <Input
                        value={s.customer_phone}
                        onChange={(e) => updateStop(idx, { customer_phone: e.target.value })}
                        placeholder="(66) 99999-0000"
                      />
                    </div>
                  </div>

                  {/* Campo de Endereço com Autocomplete Inteligente */}
                  <div className="space-y-1 relative">
                    <Label className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-1">
                        <MapPin className="w-3 h-3 text-muted-foreground" /> Endereço de Entrega *
                      </span>
                      {isSearchingThis && (
                        <span className="text-[10px] text-primary flex items-center gap-1">
                          <Loader2 className="w-3 h-3 animate-spin" /> Buscando no mapa...
                        </span>
                      )}
                    </Label>

                    <div className="relative">
                      <Input
                        value={s.delivery_address}
                        onChange={(e) => handleAddressInputChange(idx, e.target.value)}
                        onFocus={() => {
                          if (currentSuggestions.length > 0) setActiveSearchIdx(idx);
                        }}
                        placeholder="Digite rua, número, bairro em Primavera do Leste - MT..."
                      />

                      {/* Dropdown de sugestões de endereço Mapbox */}
                      {isDropdownOpen && (
                        <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-background border rounded-lg shadow-xl overflow-hidden max-h-60 overflow-y-auto">
                          <div className="p-1.5 bg-muted/40 text-[10px] font-semibold text-muted-foreground border-b flex items-center justify-between">
                            <span>Sugestões em Primavera do Leste - MT</span>
                            <span>Selecione uma opção</span>
                          </div>
                          {currentSuggestions.map((item, sugIdx) => (
                            <button
                              key={item.mapboxId || sugIdx}
                              type="button"
                              onClick={() => selectSuggestion(idx, item)}
                              className="w-full text-left p-2.5 hover:bg-accent transition-colors border-b last:border-b-0 flex items-start gap-2 text-xs"
                            >
                              <MapPin className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                              <div>
                                <p className="font-semibold text-foreground">{item.fullAddress}</p>
                                <p className="text-[10px] text-muted-foreground">
                                  {item.street} {item.number ? `, ${item.number}` : ""} — {item.neighborhood}
                                </p>
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Dist. Trecho (km)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={s.distance_km}
                        onChange={(e) => updateStop(idx, { distance_km: e.target.value })}
                        placeholder="0.00"
                      />
                    </div>
                    <div className="space-y-1 col-span-2">
                      <Label className="text-xs">Observação / Ponto de Referência</Label>
                      <Input
                        value={s.notes}
                        onChange={(e) => updateStop(idx, { notes: e.target.value })}
                        placeholder="Ex.: entregar para recepção, portão branco"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}

          {/* Mapa de Prévia da Rota Multi-Entregas */}
          <div className="space-y-2 pt-2">
            <Label className="flex items-center gap-1.5 text-xs font-semibold">
              <MapIcon className="w-4 h-4 text-primary" /> Visualização do Mapa e Prévia da Rota
            </Label>
            <div
              ref={mapContainerRef}
              className="w-full h-64 rounded-xl border bg-muted shadow-inner overflow-hidden z-0"
            />
          </div>

          {/* Botões de Ação */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <Button
              variant="outline"
              onClick={addStop}
              disabled={stops.length >= MAX_STOPS}
              className="gap-2"
            >
              <Plus className="w-4 h-4" /> Adicionar Parada
            </Button>

            <Button
              variant="secondary"
              onClick={calculateAllDistances}
              disabled={calculating}
              className="gap-2 font-medium"
            >
              {calculating ? (
                <Loader2 className="w-4 h-4 animate-spin text-primary" />
              ) : (
                <Route className="w-4 h-4 text-primary" />
              )}
              Calcular e Otimizar Rota
            </Button>
          </div>

          <div className="space-y-1 pt-2">
            <Label className="text-xs">Observação Geral da Operação</Label>
            <Textarea
              value={groupNotes}
              onChange={(e) => setGroupNotes(e.target.value)}
              rows={2}
              placeholder="Instruções para o motorista referente a toda a rota (opcional)"
            />
          </div>

          <Separator />

          {/* Painel de Resumo do Cálculo Unificado */}
          <div className="rounded-xl border bg-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold flex items-center gap-1.5">
                <Info className="w-4 h-4 text-primary" /> Resumo da Operação Multi Entregas
              </h4>
              {routeResult && (
                <Badge variant="secondary" className="gap-1 bg-green-500/10 text-green-700 border-green-200">
                  <CheckCircle2 className="w-3 h-3 text-green-600" /> Rota Mapbox Otimizada
                </Badge>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm bg-muted/30 p-3 rounded-lg border">
              <div>
                <span className="text-xs text-muted-foreground block">Paradas</span>
                <span className="font-semibold">{stops.length} destinos</span>
              </div>
              <div>
                <span className="text-xs text-muted-foreground block">Distância Total</span>
                <span className="font-semibold">{totalRouteKm.toFixed(2)} km</span>
              </div>
              <div>
                <span className="text-xs text-muted-foreground block">Tempo Estimado</span>
                <span className="font-semibold">
                  {routeResult ? `${Math.ceil(routeResult.totalDurationMin)} min` : "—"}
                </span>
              </div>
              <div>
                <span className="text-xs text-muted-foreground block">Taxa de Coleta</span>
                <span className="font-semibold">R$ {baseFee.toFixed(2)} (Única)</span>
              </div>
            </div>

            <div className="space-y-1 text-xs text-muted-foreground">
              <div className="flex justify-between">
                <span>Fórmula Aplicada:</span>
                <span>
                  R$ {baseFee.toFixed(2)} + (R$ {feePerKm.toFixed(2)}/km × {billableKm.toFixed(2)} km)
                </span>
              </div>
              <div className="flex justify-between">
                <span>Saldo Atual da Loja:</span>
                <span className="font-medium text-foreground">R$ {balance.toFixed(2)}</span>
              </div>
            </div>

            <Separator />

            <div className="flex items-center justify-between text-base pt-1">
              <span className="font-bold text-foreground">Valor Total da Operação:</span>
              <span
                className={`text-xl font-extrabold ${
                  insufficient ? "text-destructive" : "text-primary"
                }`}
              >
                R$ {totalOperationCost.toFixed(2)}
              </span>
            </div>

            {insufficient && (
              <div className="flex items-center gap-2 p-2.5 rounded-lg bg-destructive/10 text-destructive text-xs">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>
                  Saldo insuficiente para esta operação (Necessário: R$ {totalOperationCost.toFixed(2)} | Possui: R$ {balance.toFixed(2)}).
                </span>
              </div>
            )}
          </div>

          <Button
            className="w-full h-12 text-base font-bold shadow-md"
            size="lg"
            onClick={submit}
            disabled={submitting || insufficient || stops.length === 0}
          >
            {submitting ? (
              <Loader2 className="w-5 h-5 mr-2 animate-spin" />
            ) : (
              <Route className="w-5 h-5 mr-2" />
            )}
            Criar Operação Multi Entregas
          </Button>
        </CardContent>
      </Card>

      {/* Histórico de Rotas Recentes */}
      {groups.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold">Operações Recentes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {groups.map((g: any) => (
              <div
                key={g.id}
                className="flex items-center justify-between rounded-lg border p-3 bg-muted/20 hover:bg-muted/40 transition-colors"
              >
                <div className="text-sm">
                  <div className="font-medium flex items-center gap-2">
                    <span>{g.stops_count} paradas</span>
                    <span>·</span>
                    <span className="text-primary font-bold">
                      R$ {Number(g.total_cost).toFixed(2)}
                    </span>
                  </div>
                  <div className="text-muted-foreground text-xs flex items-center gap-1 mt-0.5">
                    <Clock className="w-3 h-3" />
                    {new Date(g.created_at).toLocaleString("pt-BR")}
                  </div>
                </div>
                <Badge
                  variant={
                    g.status === "pending"
                      ? "secondary"
                      : g.status === "accepted"
                      ? "default"
                      : "outline"
                  }
                >
                  {g.status === "pending"
                    ? "Aguardando Motorista"
                    : g.status === "accepted"
                    ? "Em Andamento"
                    : g.status}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default MultiDeliveryOrder;
