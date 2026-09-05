import { notifyAvailableDrivers } from "@/lib/push";
import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

import { DriverPhoto } from "@/components/DriverPhoto";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Truck, DollarSign, MapPin, Navigation, Search, Route, Car, Bike, Footprints, Clock, Pencil, RotateCcw, AlertTriangle, Layers, Heart, Star, Code, XCircle, Loader2 } from "lucide-react";
import ReportLocationButton from "@/components/ReportLocationButton";
import ChatWidget from "@/components/ChatWidget";
import { useDriverLocations } from "@/hooks/useDriverLocations";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { MAP_LAYERS, GOOGLE_MAPS_API_KEY } from "@/config/maps";

import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

const storeIcon = new L.Icon({
  iconUrl: "data:image/svg+xml," + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="%23e53935" stroke="white" stroke-width="1.5"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3" fill="white"/></svg>`
  ),
  iconSize: [32, 32],
  iconAnchor: [16, 32],
  popupAnchor: [0, -32],
});

const deliveryIcon = new L.Icon({
  iconUrl: "data:image/svg+xml," + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="%2322c55e" stroke="white" stroke-width="1.5"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3" fill="white"/></svg>`
  ),
  iconSize: [32, 32],
  iconAnchor: [16, 32],
  popupAnchor: [0, -32],
});

const driverMapIcon = new L.Icon({
  iconUrl: "data:image/svg+xml," + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="%233b82f6" stroke="white" stroke-width="2"><circle cx="12" cy="12" r="8"/><path d="M12 6v6l3 3" stroke="white" stroke-width="2" fill="none"/></svg>`
  ),
  iconSize: [28, 28],
  iconAnchor: [14, 14],
  popupAnchor: [0, -14],
});

// Haversine as fallback only
function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

type RouteProfile = "driving" | "cycling" | "walking";

const PROFILE_CONFIG: Record<RouteProfile, { label: string; icon: typeof Car; osrmProfile: string }> = {
  driving: { label: "Carro/Moto", icon: Car, osrmProfile: "driving" },
  cycling: { label: "Bicicleta", icon: Bike, osrmProfile: "bike" },
  walking: { label: "A pé", icon: Footprints, osrmProfile: "foot" },
};

// OSRM route fetcher — returns road distance (km), duration (min), and route geometry
async function fetchOSRMRoute(
  fromLat: number, fromLng: number, toLat: number, toLng: number,
  profile: RouteProfile = "driving"
): Promise<{ distanceKm: number; durationMin: number; geometry: [number, number][] } | null> {
  try {
    const osrmProfile = PROFILE_CONFIG[profile].osrmProfile;
    const url = `https://router.project-osrm.org/route/v1/${osrmProfile}/${fromLng},${fromLat};${toLng},${toLat}?overview=full&geometries=geojson&alternatives=false`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.code === "Ok" && data.routes?.[0]) {
      const route = data.routes[0];
      const coords = route.geometry.coordinates.map((c: [number, number]) => [c[1], c[0]] as [number, number]);
      return {
        distanceKm: route.distance / 1000,
        durationMin: route.duration / 60,
        geometry: coords,
      };
    }
  } catch (err) {
    console.error("OSRM route error:", err);
  }
  return null;
}

interface CallDriverTabProps {
  user: any;
  restaurant: any;
  requests: any[];
  activeRequest: any;
  chatMessages: any[];
}

const CallDriverTab = ({ user, restaurant, requests, activeRequest, chatMessages }: CallDriverTabProps) => {
  const queryClient = useQueryClient();
  const [callForm, setCallForm] = useState({ pickup: "", delivery: "", delivery_number: "", notes: "" });
  const [calling, setCalling] = useState(false);
  const [deliveryLatLng, setDeliveryLatLng] = useState<[number, number] | null>(null);
  const [storeLatLng, setStoreLatLng] = useState<[number, number] | null>(null);
  const [gpsStatus, setGpsStatus] = useState<"idle" | "requesting" | "granted" | "denied" | "timeout" | "unsupported" | "error">("idle");
  const [gpsMessage, setGpsMessage] = useState<string | null>(null);
  const [gpsAccuracy, setGpsAccuracy] = useState<number | null>(null);
  const [searchingAddress, setSearchingAddress] = useState(false);
  const [addressSuggestions, setAddressSuggestions] = useState<any[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const { data: driverLocations = [] } = useDriverLocations();
  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(null);

  const { data: favoriteDrivers = [] } = useQuery({
    queryKey: ["favorite-drivers", restaurant?.id],
    queryFn: async () => {
      if (!restaurant?.id) return [];
      const { data, error } = await supabase
        .from("store_driver_favorites")
        .select("driver_id, is_default, driver:drivers(id, user_id, full_name, driver_code)")
        .eq("restaurant_id", restaurant.id);
      if (error) return [];
      return data;
    },
    enabled: !!restaurant?.id,
  });

  // Auto-select default favorite driver when available
  useEffect(() => {
    if (selectedDriverId) return;
    const def = favoriteDrivers.find((f: any) => f.is_default);
    if (def && def.driver?.user_id) {
      setSelectedDriverId(def.driver.user_id);
    }
  }, [favoriteDrivers]);

  // Determine if selected driver is currently online
  const selectedDriverOnline = !!selectedDriverId && driverLocations.some((dl: any) => dl.user_id === selectedDriverId);
  const selectedDriverName = (() => {
    if (!selectedDriverId) return null;
    const fav = favoriteDrivers.find((f: any) => f.driver?.user_id === selectedDriverId);
    if (fav) return fav.driver?.full_name;
    const dl = driverLocations.find((d: any) => d.user_id === selectedDriverId);
    return (dl as any)?.driver?.full_name || "Entregador";
  })();
  const gpsWatchRef = useRef<number | null>(null);
  const gpsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gpsRequestingRef = useRef(false);
  const gpsInitRef = useRef(false);
  const pickupManualRef = useRef(false);

  // Route profile & road distance state
  const [routeProfile, setRouteProfile] = useState<RouteProfile>("driving");
  const [roadDistanceKm, setRoadDistanceKm] = useState(0);
  const [roadDurationMin, setRoadDurationMin] = useState(0);
  const [routeCoords, setRouteCoords] = useState<[number, number][]>([]);
  const [loadingRoute, setLoadingRoute] = useState(false);

  // Manual distance override
  const [manualDistanceEnabled, setManualDistanceEnabled] = useState(false);
  const [manualDistanceKm, setManualDistanceKm] = useState("");

  const mapRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [mapType, setMapType] = useState<keyof typeof MAP_LAYERS>("google");
  const storeMarkerRef = useRef<L.Marker | null>(null);
  const deliveryMarkerRef = useRef<L.Marker | null>(null);
  const routeLineRef = useRef<L.Polyline | null>(null);
  const driverMarkersRef = useRef<L.Marker[]>([]);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data: deliveryConfig } = useQuery({
    queryKey: ["delivery-config"],
    queryFn: async () => {
      const { data } = await (supabase as any).rpc("get_public_delivery_config");
      return Array.isArray(data) ? data[0] : data;
    },
  });

  // Driver info shown once a driver accepts the active request
  const assignedDriverId = activeRequest?.driver_id || null;
  const activeStatus = activeRequest?.status;
  const showDriverInfo = !!activeRequest && !!assignedDriverId && ["accepted", "picked_up", "delivering", "in_transit", "delivered"].includes(activeStatus);
  const { data: assignedDriver } = useQuery({
    queryKey: ["assigned-driver-info", activeRequest?.id, assignedDriverId],
    queryFn: async () => {
      if (!activeRequest?.id || !assignedDriverId) return null;
      try {
        const { data, error } = await (supabase as any).rpc("get_assigned_driver_info", { p_request_id: activeRequest.id });
        if (!error && data) {
          const item = Array.isArray(data) ? data[0] : data;
          if (item && item.full_name) return item;
        }
      } catch {
        /* fallback to direct query below */
      }

      // Direct fallback to drivers table if RPC fails or is missing
      const { data: drv } = await supabase
        .from("drivers")
        .select("id, user_id, full_name, photo_url, vehicle_plate, vehicle_type, phone")
        .or(`id.eq.${assignedDriverId},user_id.eq.${assignedDriverId}`)
        .maybeSingle();

      return drv || null;
    },
    enabled: showDriverInfo,
  });

  // Use ADMIN config strictly — no defaults. Cost is null until config loads,
  // ensuring the value shown always matches exactly what admin configured.
  const configLoaded = !!deliveryConfig;
  const baseFee = Number((deliveryConfig as any)?.base_fee ?? 0);
  const feePerKm = Number((deliveryConfig as any)?.fee_per_km ?? 0);
  const minKm = Number((deliveryConfig as any)?.min_km ?? 0);
  const maxKm = Number((deliveryConfig as any)?.max_km ?? 0);
  const roundKmUp = !!(deliveryConfig as any)?.round_km_up;

  const storeLat = storeLatLng?.[0] ?? restaurant?.latitude;
  const storeLng = storeLatLng?.[1] ?? restaurant?.longitude;

  // Distance logic: manual override > OSRM road > Haversine fallback
  const autoDistanceKm = roadDistanceKm > 0
    ? roadDistanceKm
    : (deliveryLatLng && storeLat && storeLng ? haversineKm(storeLat, storeLng, deliveryLatLng[0], deliveryLatLng[1]) : 0);

  const rawDistanceKm = manualDistanceEnabled && parseFloat(manualDistanceKm) > 0
    ? parseFloat(manualDistanceKm)
    : autoDistanceKm;

  // Apply km rules — MUST match server-side deduct_credits_for_delivery exactly
  let effectiveKm = rawDistanceKm;
  if (roundKmUp && effectiveKm > 0) effectiveKm = Math.ceil(effectiveKm);
  if (minKm > 0 && effectiveKm < minKm) effectiveKm = minKm;
  if (maxKm > 0 && effectiveKm > maxKm) effectiveKm = maxKm;

  const distanceKm = rawDistanceKm;
  const deliveryCost = configLoaded ? (baseFee + feePerKm * effectiveKm) : null;

  const distanceSource = manualDistanceEnabled && parseFloat(manualDistanceKm) > 0
    ? "manual"
    : roadDistanceKm > 0 ? "osrm" : (autoDistanceKm > 0 ? "haversine" : "none");

  const statusLabels: Record<string, string> = {
    pending: "Aguardando", accepted: "Aceito", picked_up: "Coletado", delivered: "Finalizado", cancelled: "Cancelado",
  };

  // Fetch OSRM route when both points are set or profile changes
  useEffect(() => {
    if (!storeLat || !storeLng || !deliveryLatLng) {
      setRoadDistanceKm(0);
      setRoadDurationMin(0);
      setRouteCoords([]);
      return;
    }

    let cancelled = false;
    setLoadingRoute(true);

    fetchOSRMRoute(storeLat, storeLng, deliveryLatLng[0], deliveryLatLng[1], routeProfile).then((result) => {
      if (cancelled) return;
      if (result) {
        setRoadDistanceKm(result.distanceKm);
        setRoadDurationMin(result.durationMin);
        setRouteCoords(result.geometry);
      } else {
        setRoadDistanceKm(0);
        setRoadDurationMin(0);
        setRouteCoords([]);
      }
      setLoadingRoute(false);
    });

    return () => { cancelled = true; };
  }, [storeLat, storeLng, deliveryLatLng?.[0], deliveryLatLng?.[1], routeProfile]);

  const formatAddress = useCallback((data: any, includeNumber = false): string => {
    if (!data?.address) return data?.display_name ?? "";
    const a = data.address;
    const parts: string[] = [];
    
    // Check if it's Google Maps format (array) or Nominatim (object)
    if (Array.isArray(a)) {
      // Google Maps components
      const getComp = (type: string) => a.find((c: any) => c.types.includes(type))?.long_name || "";
      const route = getComp("route");
      const streetNumber = getComp("street_number");
      
      if (route) {
        parts.push(includeNumber && streetNumber ? `${route}, ${streetNumber}` : route);
      }
      const neighborhood = getComp("sublocality") || getComp("neighborhood");
      if (neighborhood) parts.push(neighborhood);
      const city = getComp("locality");
      if (city) parts.push(city);
      const state = getComp("administrative_area_level_1");
      if (state) parts.push(state);
    } else {
      // Nominatim format
      const road = a.road || a.pedestrian || a.footway || a.street || "";
      if (road) {
        parts.push(includeNumber && a.house_number ? `${road}, ${a.house_number}` : road);
      }
      const neighborhood = a.suburb || a.neighbourhood || a.quarter || "";
      if (neighborhood) parts.push(neighborhood);
      const city = a.city || a.town || a.village || a.municipality || "";
      if (city) parts.push(city);
      if (a.state) parts.push(a.state);
    }
    
    return parts.length > 0 ? parts.join(", ") : data.display_name;
  }, []);

  const reverseGeocode = useCallback(async (lat: number, lng: number) => {
    if (pickupManualRef.current) return; // não sobrescreve endereço digitado
    try {
      if (GOOGLE_MAPS_API_KEY) {
        const res = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${GOOGLE_MAPS_API_KEY}&language=pt-BR`);
        const data = await res.json();
        if (data.status === "OK" && data.results?.[0]) {
          console.info("[GPS:coleta] endereço obtido via Google", data.results[0].formatted_address);
          setCallForm(f => ({ ...f, pickup: data.results[0].formatted_address }));
          return;
        }
      }
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1&zoom=18&accept-language=pt-BR`);
      const data = await res.json();
      if (data) {
        const formatted = formatAddress(data, true); // Include number for pickup address
        console.info("[GPS:coleta] endereço obtido via Nominatim", formatted);
        setCallForm(f => (f.pickup ? f : { ...f, pickup: formatted }));
      }
    } catch (err) {
      console.error("[GPS:coleta] erro no reverse geocoding:", err);
      setGpsMessage("Erro ao carregar o mapa. Tente novamente.");
    }
  }, [formatAddress]);

  // ---------------------------------------------------------------------
  // GPS do endereço de coleta — implementação robusta
  // Regras: 1 pedido por carregamento, timeout de 10s, sem carregamento
  // infinito, cache de sessão, fallback manual e mensagens claras de erro.
  // ---------------------------------------------------------------------
  const GPS_LOG = "[GPS:coleta]";
  const GPS_CACHE_KEY = "store_pickup_gps_cache";
  const GPS_CACHE_TTL_MS = 5 * 60 * 1000;

  const readGpsCache = (): { lat: number; lng: number; acc: number | null } | null => {
    try {
      const raw = sessionStorage.getItem(GPS_CACHE_KEY);
      if (!raw) return null;
      const c = JSON.parse(raw);
      if (!c || typeof c.lat !== "number" || typeof c.lng !== "number") return null;
      if (Date.now() - (c.ts || 0) > GPS_CACHE_TTL_MS) return null;
      return { lat: c.lat, lng: c.lng, acc: c.acc ?? null };
    } catch {
      return null;
    }
  };

  const writeGpsCache = (lat: number, lng: number, acc: number | null) => {
    try {
      sessionStorage.setItem(GPS_CACHE_KEY, JSON.stringify({ lat, lng, acc, ts: Date.now() }));
    } catch { /* storage indisponível — ignora */ }
  };

  const applyPosition = useCallback((lat: number, lng: number, acc: number | null, source: string) => {
    console.info(`${GPS_LOG} coordenadas aplicadas (${source})`, { lat, lng, acc });
    setGpsAccuracy(acc);
    setStoreLatLng([lat, lng]);
    setGpsStatus("granted");
    setGpsMessage(null);
    writeGpsCache(lat, lng, acc);
    if (!pickupManualRef.current) reverseGeocode(lat, lng);
  }, [reverseGeocode]);

  const requestGPS = useCallback((opts?: { silent?: boolean }) => {
    const silent = opts?.silent === true;

    if (typeof navigator === "undefined" || !navigator.geolocation) {
      console.warn(`${GPS_LOG} geolocalização não suportada`);
      setGpsStatus("unsupported");
      setGpsMessage("Este dispositivo/navegador não suporta GPS. Digite o endereço manualmente.");
      return;
    }
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      setGpsStatus("error");
      setGpsMessage("Sem conexão com a internet.");
      return;
    }
    if (gpsRequestingRef.current) {
      console.info(`${GPS_LOG} pedido ignorado — já existe uma requisição em andamento`);
      return;
    }

    gpsRequestingRef.current = true;
    setGpsStatus("requesting");
    setGpsMessage(null);
    const startedAt = Date.now();
    console.info(`${GPS_LOG} solicitando posição...`);

    let settled = false;
    const finish = () => {
      settled = true;
      gpsRequestingRef.current = false;
      if (gpsTimerRef.current) {
        clearTimeout(gpsTimerRef.current);
        gpsTimerRef.current = null;
      }
    };

    // Trava de segurança: nunca deixa a tela carregando para sempre
    gpsTimerRef.current = setTimeout(() => {
      if (settled) return;
      finish();
      console.warn(`${GPS_LOG} timeout de segurança (11s)`);
      setGpsStatus("timeout");
      setGpsMessage("Não foi possível localizar sua posição.");
      if (!silent) toast.error("Não foi possível obter sua localização automaticamente.");
    }, 11000);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (settled) return;
        finish();
        console.info(`${GPS_LOG} permissão concedida — resposta em ${Date.now() - startedAt}ms`);
        applyPosition(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy ?? null, "getCurrentPosition");
      },
      (err) => {
        if (settled) return;
        finish();
        console.warn(`${GPS_LOG} erro (${err.code}) após ${Date.now() - startedAt}ms: ${err.message}`);
        if (err.code === err.PERMISSION_DENIED) {
          setGpsStatus("denied");
          setGpsMessage("Permita o acesso à localização para preencher automaticamente.");
          if (!silent) toast.error("Permita o acesso à localização para preencher automaticamente.");
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          setGpsStatus("error");
          setGpsMessage("Ative o GPS do aparelho.");
          if (!silent) toast.error("Ative o GPS do aparelho.");
        } else {
          setGpsStatus("timeout");
          setGpsMessage("Não foi possível localizar sua posição.");
          if (!silent) toast.error("Não foi possível localizar sua posição.");
        }
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  }, [applyPosition]);

  // Inicialização única por carregamento da tela
  useEffect(() => {
    if (gpsInitRef.current) return;

    // 1) Coordenadas já cadastradas da loja têm prioridade
    if (restaurant?.latitude && restaurant?.longitude) {
      gpsInitRef.current = true;
      console.info(`${GPS_LOG} usando coordenadas cadastradas da loja`);
      setStoreLatLng([restaurant.latitude, restaurant.longitude]);
      setGpsStatus("granted");
      if (restaurant.address) {
        setCallForm((f) => (f.pickup ? f : { ...f, pickup: restaurant.address }));
      } else {
        reverseGeocode(restaurant.latitude, restaurant.longitude);
      }
      return;
    }

    if (restaurant === undefined) return; // aguarda o carregamento da loja
    gpsInitRef.current = true;

    // 2) Cache da sessão evita novo pedido ao GPS
    const cached = readGpsCache();
    if (cached) {
      console.info(`${GPS_LOG} usando cache da sessão`);
      applyPosition(cached.lat, cached.lng, cached.acc, "cache");
      return;
    }

    // 3) Pede o GPS apenas uma vez (silencioso: fallback manual continua disponível)
    requestGPS({ silent: true });
  }, [restaurant, applyPosition, requestGPS, reverseGeocode]);

  useEffect(() => {
    return () => {
      if (gpsTimerRef.current) clearTimeout(gpsTimerRef.current);
      if (gpsWatchRef.current !== null && navigator.geolocation) {
        navigator.geolocation.clearWatch(gpsWatchRef.current);
        gpsWatchRef.current = null;
      }
    };
  }, []);

  const retryGPS = useCallback(() => {
    pickupManualRef.current = false;
    requestGPS();
  }, [requestGPS]);

  // ---------------------------------------------------------------------
  // Seta de GPS do endereço de coleta — clique único, estados reais
  // ---------------------------------------------------------------------
  const [pickupGpsState, setPickupGpsState] = useState<"idle" | "loading" | "success" | "error">("idle");
  const pickupGpsBusyRef = useRef(false);

  const extractNumber = (addr: string): string | null => {
    const m = addr?.match(/,\s*(\d{1,6})\b/);
    return m ? m[1] : null;
  };

  const reverseGeocodeAddress = useCallback(async (lat: number, lng: number): Promise<string | null> => {
    try {
      if (GOOGLE_MAPS_API_KEY) {
        const res = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${GOOGLE_MAPS_API_KEY}&language=pt-BR`);
        const data = await res.json();
        if (data.status === "OK" && data.results?.[0]?.formatted_address) {
          return data.results[0].formatted_address as string;
        }
      }
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1&zoom=18&accept-language=pt-BR`);
      const data = await res.json();
      const formatted = formatAddress(data, true);
      return formatted && formatted.trim().length > 0 ? formatted : null;
    } catch (e) {
      console.error(`${GPS_LOG} reverse geocoding falhou`, e);
      return null;
    }
  }, [formatAddress]);

  const handlePickupGpsClick = useCallback(async () => {
    if (pickupGpsBusyRef.current) {
      console.info(`${GPS_LOG} clique ignorado — busca em andamento`);
      return;
    }
    pickupGpsBusyRef.current = true;
    setPickupGpsState("loading");
    setGpsStatus("requesting");
    setGpsMessage("Localizando endereço da loja...");

    const savedAddress = (restaurant?.address || callForm.pickup || "").trim();
    const savedNumber = extractNumber(savedAddress);

    const finishError = (msg: string) => {
      pickupGpsBusyRef.current = false;
      setPickupGpsState("error");
      setGpsMessage(msg);
      if (savedAddress) {
        setGpsStatus(restaurant?.latitude && restaurant?.longitude ? "granted" : "error");
        setCallForm((f) => ({ ...f, pickup: f.pickup || savedAddress }));
        if (restaurant?.latitude && restaurant?.longitude) {
          setStoreLatLng([restaurant.latitude, restaurant.longitude]);
        }
      } else {
        setGpsStatus("error");
      }
      toast.error(msg);
    };

    if (typeof navigator === "undefined" || !navigator.geolocation) {
      finishError(savedAddress
        ? "Não foi possível obter a localização. O endereço salvo da loja foi mantido."
        : "Não foi possível localizar automaticamente. Digite ou selecione o endereço da loja no mapa.");
      return;
    }

    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
        let done = false;
        const timer = setTimeout(() => { if (!done) { done = true; reject({ code: 3 }); } }, 10000);
        navigator.geolocation.getCurrentPosition(
          (p) => { if (!done) { done = true; clearTimeout(timer); resolve(p); } },
          (e) => { if (!done) { done = true; clearTimeout(timer); reject(e); } },
          { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        );
      });

      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      if (!isFinite(lat) || !isFinite(lng)) {
        finishError("Não foi possível obter a localização. O endereço salvo da loja foi mantido.");
        return;
      }

      const geocoded = await reverseGeocodeAddress(lat, lng);

      // Endereço oficial da loja tem prioridade; GPS só atualiza coordenadas.
      let finalAddress = savedAddress;
      if (!finalAddress) {
        finalAddress = geocoded || "";
      } else if (geocoded && savedNumber && !extractNumber(geocoded)) {
        // mantém número/complemento já informados
        finalAddress = savedAddress;
      }

      if (!finalAddress) {
        finishError("Não foi possível localizar automaticamente. Digite ou selecione o endereço da loja no mapa.");
        return;
      }

      pickupManualRef.current = false;
      setCallForm((f) => ({ ...f, pickup: finalAddress }));
      setStoreLatLng([lat, lng]);
      setGpsAccuracy(pos.coords.accuracy ?? null);
      setGpsStatus("granted");
      setGpsMessage(null);
      setPickupGpsState("success");
      writeGpsCache(lat, lng, pos.coords.accuracy ?? null);

      if (restaurant?.id) {
        const payload: any = { latitude: lat, longitude: lng };
        if (!restaurant.address && geocoded) payload.address = finalAddress;
        const { error } = await supabase.from("restaurants").update(payload).eq("id", restaurant.id);
        if (error) console.warn(`${GPS_LOG} não foi possível salvar coordenadas`, error.message);
      }

      toast.success("Endereço de coleta atualizado com sucesso.");
    } catch (err: any) {
      const code = err?.code;
      if (code === 1) {
        finishError("Permita o acesso à localização para atualizar o endereço da loja.");
      } else if (savedAddress) {
        finishError("Não foi possível obter a localização. O endereço salvo da loja foi mantido.");
      } else {
        finishError("Não foi possível localizar automaticamente. Digite ou selecione o endereço da loja no mapa.");
      }
      return;
    } finally {
      pickupGpsBusyRef.current = false;
    }
  }, [restaurant, callForm.pickup, reverseGeocodeAddress]);


  // Geocodifica o endereço digitado manualmente e atualiza o marcador
  const geocodePickupAddress = useCallback(async (address: string) => {
    if (!address || address.trim().length < 5) return;
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=br&addressdetails=1&q=${encodeURIComponent(address)}`;
      const res = await fetch(url, { headers: { "Accept-Language": "pt-BR" } });
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        const lat = parseFloat(data[0].lat);
        const lng = parseFloat(data[0].lon);
        console.info(`${GPS_LOG} endereço manual geocodificado`, { lat, lng });
        setStoreLatLng([lat, lng]);
        setGpsStatus("granted");
        setGpsAccuracy(null);
        setGpsMessage(null);
      } else {
        console.warn(`${GPS_LOG} endereço manual não localizado`);
      }
    } catch (e) {
      console.error(`${GPS_LOG} erro ao geocodificar endereço manual`, e);
      setGpsMessage("Erro ao carregar o mapa. Tente novamente.");
    }
  }, []);

  const geocodeDeliveryAddress = useCallback((address: string) => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    if (address.trim().length < 5) {
      setAddressSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    searchTimeoutRef.current = setTimeout(async () => {
      setSearchingAddress(true);
      try {
        if (GOOGLE_MAPS_API_KEY) {
          let googleUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${GOOGLE_MAPS_API_KEY}&language=pt-BR&components=country:BR`;
          if (storeLat && storeLng) {
            googleUrl += `&location=${storeLat},${storeLng}&radius=50000`;
          }
          const res = await fetch(googleUrl);
          const data = await res.json();
          if (data.status === "OK" && data.results?.length > 0) {
            const mapped = data.results.map((r: any) => ({
              display_name: r.formatted_address,
              lat: r.geometry.location.lat.toString(),
              lon: r.geometry.location.lng.toString(),
              address: r.address_components
            }));
            setAddressSuggestions(mapped);
            setShowSuggestions(true);
            setSearchingAddress(false);
            return;
          }
        }

        // Nominatim: acrescenta cidade/UF quando o usuário só digitou rua/bairro
        const hasCity = /primavera do leste|\bmt\b|mato grosso/i.test(address);
        const query = hasCity ? address : `${address}, Primavera do Leste, MT`;
        let searchUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5&countrycodes=br&addressdetails=1&accept-language=pt-BR`;

        if (storeLat && storeLng) {
          const delta = 0.25;
          searchUrl += `&viewbox=${storeLng - delta},${storeLat - delta},${storeLng + delta},${storeLat + delta}&bounded=1`;
        }
        
        const res = await fetch(searchUrl);
        const data = await res.json();
        if (data && data.length > 0) {
          if (storeLat && storeLng) {
            data.sort((a: any, b: any) => {
              const da = haversineKm(storeLat, storeLng, parseFloat(a.lat), parseFloat(a.lon));
              const db = haversineKm(storeLat, storeLng, parseFloat(b.lat), parseFloat(b.lon));
              return da - db;
            });
          }
          setAddressSuggestions(data);
          setShowSuggestions(true);
        } else {
          setAddressSuggestions([]);
          setShowSuggestions(false);
          toast.info("Endereço não encontrado. Toque no mapa para marcar a localização manualmente.", { duration: 5000 });
        }
      } catch (err) {
        console.error("Geocode error:", err);
      } finally {
        setSearchingAddress(false);
      }
    }, 800);
  }, [storeLat, storeLng]);

  const selectSuggestion = useCallback((item: any) => {
    const lat = parseFloat(item.lat);
    const lng = parseFloat(item.lon);
    setDeliveryLatLng([lat, lng]);
    
    // Extract number if present
    let houseNumber = "";
    if (item.address) {
      if (Array.isArray(item.address)) {
        houseNumber = item.address.find((c: any) => c.types.includes("street_number"))?.long_name || "";
      } else {
        houseNumber = item.address.house_number || "";
      }
    }

    const formatted = formatAddress(item, false); // Format without number
    setCallForm(f => ({ 
      ...f, 
      delivery: formatted,
      delivery_number: houseNumber 
    }));
    
    setAddressSuggestions([]);
    setShowSuggestions(false);
    setManualDistanceEnabled(false);

    if (mapRef.current && storeLat && storeLng) {
      const bounds = L.latLngBounds([[storeLat, storeLng], [lat, lng]]);
      mapRef.current.fitBounds(bounds, { padding: [40, 40] });
    }
  }, [storeLat, storeLng, formatAddress]);

  // Close suggestions on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (suggestionsRef.current && !suggestionsRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Initialize map
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const center: [number, number] = storeLat && storeLng
      ? [storeLat, storeLng]
      : [-15.5454, -54.2958];

    const map = L.map(containerRef.current).setView(center, 14);
    mapRef.current = map;
    
    tileLayerRef.current = L.tileLayer(MAP_LAYERS[mapType].url, {
      attribution: MAP_LAYERS[mapType].attribution,
      maxZoom: mapType === "satellite" ? 18 : 19,
    }).addTo(map);

    map.on("click", async (e: L.LeafletMouseEvent) => {
      const { lat, lng } = e.latlng;
      setDeliveryLatLng([lat, lng]);
      setManualDistanceEnabled(false);
      
      try {
        if (GOOGLE_MAPS_API_KEY) {
          const res = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${GOOGLE_MAPS_API_KEY}&language=pt-BR`);
          const data = await res.json();
          if (data.status === "OK" && data.results?.[0]) {
            const first = data.results[0];
            const comps = first.address_components;
            const streetNumber = comps.find((c: any) => c.types.includes("street_number"))?.long_name || "";
            
            // Format without number for the main field
            const itemForFormat = { ...first, address: comps };
            const formatted = formatAddress(itemForFormat, false);
            
            setCallForm(f => ({ 
              ...f, 
              delivery: formatted,
              delivery_number: streetNumber 
            }));
            return;
          }
        }

        // Fallback to Nominatim
        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1&zoom=18&accept-language=pt-BR`);
        const data = await res.json();
        if (data) {
          const formatted = formatAddress(data, false);
          const streetNumber = data.address?.house_number || "";
          setCallForm(f => ({ 
            ...f, 
            delivery: formatted,
            delivery_number: streetNumber 
          }));
        }
      } catch (err) {
        console.error("Map click geocode error:", err);
      }
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Update tile layer if mapType changed
  useEffect(() => {
    const map = mapRef.current;
    if (tileLayerRef.current && map) {
      const currentUrl = MAP_LAYERS[mapType].url;
      if ((tileLayerRef.current as any)._url !== currentUrl) {
        map.removeLayer(tileLayerRef.current);
        tileLayerRef.current = L.tileLayer(currentUrl, {
          attribution: MAP_LAYERS[mapType].attribution,
          maxZoom: String(mapType).includes("satellite") || String(mapType).includes("google") ? 20 : 19,
        }).addTo(map);
      }
    }
  }, [mapType]);

  // Update store marker
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !storeLat || !storeLng) return;

    if (storeMarkerRef.current) map.removeLayer(storeMarkerRef.current);

    storeMarkerRef.current = L.marker([storeLat, storeLng], { icon: storeIcon })
      .addTo(map)
      .bindPopup(`<b>🏪 ${restaurant?.name || "Sua Loja"}</b>`);

    // Only set view if not manual dragging or searching
    if (!deliveryLatLng && !searchingAddress) {
      map.setView([storeLat, storeLng], map.getZoom());
    }
  }, [storeLat, storeLng, restaurant?.name]);

  // Update delivery marker + route line
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (deliveryMarkerRef.current) {
      map.removeLayer(deliveryMarkerRef.current);
      deliveryMarkerRef.current = null;
    }
    if (routeLineRef.current) {
      map.removeLayer(routeLineRef.current);
      routeLineRef.current = null;
    }

    if (deliveryLatLng) {
      deliveryMarkerRef.current = L.marker(deliveryLatLng, { icon: deliveryIcon, draggable: true })
        .addTo(map)
        .bindPopup("<b>📍 Ponto de Entrega</b><br><small>Arraste para ajustar</small>")
        .openPopup();

      // Reverse geocode on drag end
      deliveryMarkerRef.current.on("dragend", async () => {
        const pos = deliveryMarkerRef.current?.getLatLng();
        if (pos) {
          setDeliveryLatLng([pos.lat, pos.lng]);
          setManualDistanceEnabled(false);
          
          try {


            // Fallback to Nominatim
            const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${pos.lat}&lon=${pos.lng}&format=json&addressdetails=1&zoom=18&accept-language=pt-BR`);
            const data = await res.json();
            if (data) {
              const formatted = formatAddress(data);
              setCallForm(f => ({ ...f, delivery: formatted }));
            }
          } catch (err) {
            console.error("Marker drag geocode error:", err);
          }
        }
      });

      if (storeLat && storeLng) {
        const lineCoords = routeCoords.length > 0
          ? routeCoords
          : [[storeLat, storeLng] as [number, number], deliveryLatLng];

        const profileColors: Record<RouteProfile, string> = {
          driving: "hsl(var(--primary))",
          cycling: "#22c55e",
          walking: "#f59e0b",
        };

        routeLineRef.current = L.polyline(lineCoords, {
          color: routeCoords.length > 0 ? profileColors[routeProfile] : "#94a3b8",
          weight: routeCoords.length > 0 ? 5 : 3,
          dashArray: routeCoords.length > 0 ? undefined : "8 4",
          opacity: 0.85,
        }).addTo(map);

        const bounds = routeLineRef.current.getBounds();
        map.fitBounds(bounds, { padding: [40, 40] });
      }
    }
  }, [deliveryLatLng, storeLat, storeLng, routeCoords, routeProfile]);

  // Driver markers + nearest
  const [nearestDriverInfo, setNearestDriverInfo] = useState<{
    distanceKm: number;
    etaMinutes: number;
    speedKmh: number;
  } | null>(null);
  const proximityAlertRef = useRef(false);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    driverMarkersRef.current.forEach(m => map.removeLayer(m));
    driverMarkersRef.current = [];

    let nearest: typeof nearestDriverInfo = null;

    driverLocations.forEach((d: any) => {
      const speedKmh = d.speed ? Math.round(d.speed * 3.6) : 0;
      const marker = L.marker([d.latitude, d.longitude], { icon: driverMapIcon })
        .addTo(map)
        .bindPopup(`<b>🚴 Entregador</b><br/>${speedKmh > 0 ? `${speedKmh} km/h` : "Parado"}`);
      driverMarkersRef.current.push(marker);

      if (storeLat && storeLng) {
        const dist = haversineKm(storeLat, storeLng, d.latitude, d.longitude);
        const avgSpeed = speedKmh > 3 ? speedKmh : 25;
        const eta = (dist / avgSpeed) * 60;
        if (!nearest || dist < nearest.distanceKm) {
          nearest = { distanceKm: dist, etaMinutes: eta, speedKmh };
        }
      }
    });

    setNearestDriverInfo(nearest);

    if (nearest && nearest.distanceKm <= 0.5 && !proximityAlertRef.current) {
      proximityAlertRef.current = true;
      toast.info("🚴 Entregador está a menos de 500m!", { duration: 5000 });
    } else if (!nearest || nearest.distanceKm > 0.5) {
      proximityAlertRef.current = false;
    }
  }, [driverLocations, storeLat, storeLng]);

  const handleDeliveryAddressChange = (value: string) => {
    setCallForm(f => ({ ...f, delivery: value }));
    setManualDistanceEnabled(false);
    geocodeDeliveryAddress(value);
    if (value.trim().length < 5) {
      setShowSuggestions(false);
    }
  };

  const handleCallDriver = async () => {
    if (!callForm.pickup.trim() || !callForm.delivery.trim() || !callForm.delivery_number.trim()) {
      toast.error("Preencha endereço de coleta, entrega e número");
      return;
    }

    let finalDistance = distanceKm;
    let finalLatLng = deliveryLatLng;
    const finalDeliveryAddress = callForm.delivery_number.trim() 
      ? `${callForm.delivery}, ${callForm.delivery_number}` 
      : callForm.delivery;

    // If no coordinates yet, try to use the first suggestion if available
    if (!finalLatLng && addressSuggestions.length > 0) {
      const first = addressSuggestions[0];
      const lat = parseFloat(first.lat);
      const lng = parseFloat(first.lon);
      finalLatLng = [lat, lng];
      setDeliveryLatLng(finalLatLng);
      
      // Re-calculate distance with the new coordinates
      if (storeLat && storeLng) {
        finalDistance = haversineKm(storeLat, storeLng, lat, lng);
      }
    }

    if (finalDistance <= 0 || !finalLatLng) {
      toast.error("Localização de entrega não definida. Selecione um endereço da lista ou clique no mapa.");
      return;
    }

    setCalling(true);
    try {
      const { data: requestId, error } = await supabase.rpc("deduct_credits_for_delivery", {
        p_pickup_address: callForm.pickup,
        p_delivery_address: finalDeliveryAddress,
        p_notes: callForm.notes || null,
        p_restaurant_id: restaurant?.id || null,
        p_distance_km: finalDistance,
        p_preferred_driver_id: selectedDriverId || null,
      } as any);

      if (error) throw error;

      // Backend dispara o push para todos os motoristas online (nunca bloqueia o pedido)
      if (requestId) void notifyAvailableDrivers(String(requestId));








      // Play a confirmation sound for the store owner
      try {
        const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioContext) {
          const ctx = new AudioContext();
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.frequency.value = 880;
          gain.gain.setValueAtTime(0.1, ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);
          osc.start();
          osc.stop(ctx.currentTime + 0.2);
        }
      } catch (e) {}

      toast.success(`Entregador chamado! Custo: R$ ${(deliveryCost ?? 0).toFixed(2)}`);

      const pickupAddr = restaurant?.address || callForm.pickup;
      setCallForm({ pickup: pickupAddr, delivery: "", delivery_number: "", notes: "" });
      setDeliveryLatLng(null);
      setRoadDistanceKm(0);
      setRoadDurationMin(0);
      setRouteCoords([]);
      setManualDistanceEnabled(false);
      setManualDistanceKm("");
      
      queryClient.invalidateQueries({ queryKey: ["my-delivery-requests"] });
      queryClient.invalidateQueries({ queryKey: ["my-credits"] });
    } catch (err: any) {
      console.error("Call driver error:", err);
      toast.error(err.message || "Erro ao chamar entregador. Verifique seus créditos.");
    } finally {
      setCalling(false);
    }
  };

  const handleCancelRequest = async (requestId: string) => {
    if (!confirm("Cancelar esta corrida? Os créditos descontados serão devolvidos à sua loja.")) return;
    try {
      const { data, error } = await (supabase as any).rpc("cancel_delivery_request", { p_request_id: requestId });
      if (error) throw error;
      if (!data) throw new Error("Não foi possível cancelar");
      toast.success("Corrida cancelada. Créditos devolvidos!");
      queryClient.invalidateQueries({ queryKey: ["my-delivery-requests"] });
      queryClient.invalidateQueries({ queryKey: ["my-credits"] });
    } catch (err: any) {
      toast.error(err.message || "Erro ao cancelar corrida");
    }
  };

  return (
    <div className="space-y-4">
      {/* GPS Status Bar */}
      {gpsStatus === "granted" && gpsAccuracy !== null && (
        <Card className={`border ${gpsAccuracy <= 15 ? "border-green-500/40 bg-green-500/5" : gpsAccuracy <= 50 ? "border-yellow-500/40 bg-yellow-500/5" : "border-orange-500/40 bg-orange-500/5"}`}>
          <CardContent className="p-3 flex items-center gap-3">
            <Navigation className={`w-4 h-4 ${gpsAccuracy <= 15 ? "text-green-500" : gpsAccuracy <= 50 ? "text-yellow-500" : "text-orange-500"}`} />
            <div className="flex-1">
              <p className="text-xs font-medium">
                📍 Localização ativa — Precisão: {Math.round(gpsAccuracy)}m
                {gpsAccuracy <= 15 ? " (Excelente)" : gpsAccuracy <= 50 ? " (Boa)" : " (Baixa)"}
              </p>
            </div>
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={retryGPS}>
              <RotateCcw className="w-3 h-3 mr-1" /> Atualizar
            </Button>
          </CardContent>
        </Card>
      )}

      {/* GPS Permission / erro — only when not granted */}
      {gpsStatus !== "granted" && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="p-4 flex items-center gap-3">
            <Navigation className="w-5 h-5 text-primary flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium">
                {gpsStatus === "requesting" ? "Obtendo sua localização..." : "Localização automática"}
              </p>
              <p className="text-xs text-muted-foreground">
                {gpsMessage ?? "Ative o GPS para localizar sua loja automaticamente. Você também pode digitar o endereço de coleta manualmente."}
              </p>
            </div>
            <Button size="sm" onClick={retryGPS} disabled={gpsStatus === "requesting"}>
              {gpsStatus === "requesting" ? "Obtendo..." : gpsStatus === "idle" ? "Permitir GPS" : "Tentar novamente"}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Active Delivery — Cancel banner */}
      {activeRequest && ["pending", "accepted", "picked_up"].includes(activeRequest.status) && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="p-3 flex items-center gap-3">
            <Truck className="w-5 h-5 text-destructive shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold truncate">
                Entrega em andamento #{activeRequest.id.slice(0, 8)}
              </p>
              <p className="text-[11px] text-muted-foreground truncate">
                Status: {statusLabels[activeRequest.status] || activeRequest.status} • {activeRequest.delivery_address}
              </p>
            </div>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => handleCancelRequest(activeRequest.id)}
              className="shrink-0"
            >
              <XCircle className="w-4 h-4 mr-1" /> Cancelar
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Assigned Driver Info — shown after a driver accepts */}
      {showDriverInfo && assignedDriver && (
        <Card className="border-primary/40 bg-primary/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Truck className="w-4 h-4 text-primary" /> Entregador a caminho
            </CardTitle>
          </CardHeader>
          <CardContent className="flex items-center gap-3">
            <DriverPhoto
              photoUrl={assignedDriver.photo_url}
              driverId={assignedDriver.user_id}
              alt={assignedDriver.full_name || "Entregador"}
              className="w-16 h-16 rounded-full border-2 border-primary shrink-0"
            />
            <div className="flex-1 min-w-0 space-y-0.5">
              <p className="font-semibold truncate">{assignedDriver.full_name || "Entregador"}</p>
              {assignedDriver.phone && (
                <a
                  href={`tel:${assignedDriver.phone.replace(/\D/g, "")}`}
                  className="text-sm text-primary hover:underline block truncate"
                >
                  📞 {assignedDriver.phone}
                </a>
              )}
              <p className="text-xs text-muted-foreground truncate">
                🛵 {assignedDriver.vehicle_type || "Veículo não informado"}
                {assignedDriver.vehicle_plate ? ` • ${assignedDriver.vehicle_plate}` : ""}
              </p>
            </div>
            {assignedDriver.phone && (
              <a
                href={`https://wa.me/55${assignedDriver.phone.replace(/\D/g, "")}`}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0"
              >
                <Button size="sm" variant="outline" className="gap-1">
                  💬 WhatsApp
                </Button>
              </a>
            )}
          </CardContent>
        </Card>
      )}

      {/* Map */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <MapPin className="w-4 h-4" /> Mapa de Entrega
            </CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const types: (keyof typeof MAP_LAYERS)[] = ["google", "streets", "satellite"];
                const next = types[(types.indexOf(mapType) + 1) % types.length];
                setMapType(next);
              }}
              className="gap-1 text-xs h-7"
            >
              <Layers className="w-3 h-3" />
              {mapType === "google" ? "Google" : mapType === "streets" ? "OSM" : "Satélite"}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div ref={containerRef} style={{ width: "100%", height: 320, borderRadius: 8 }} className="border border-border" />
          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">🔴 Sua loja</span>
            <span className="flex items-center gap-1">🟢 Ponto de entrega</span>
            <span className="flex items-center gap-1">🔵 Entregadores</span>
          </div>

          {/* Route Profile Selector */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-medium text-muted-foreground mr-1">Modo:</span>
            {(Object.keys(PROFILE_CONFIG) as RouteProfile[]).map((p) => {
              const config = PROFILE_CONFIG[p];
              const Icon = config.icon;
              const active = routeProfile === p;
              return (
                <Button
                  key={p}
                  variant={active ? "default" : "outline"}
                  size="sm"
                  className={`h-8 gap-1.5 text-xs ${active ? "" : "text-muted-foreground"}`}
                  onClick={() => setRouteProfile(p)}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {config.label}
                </Button>
              );
            })}
          </div>

          {/* Route summary when route exists */}
          {distanceKm > 0 && (
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-lg bg-muted/50 p-2.5 text-center">
                <Route className="w-4 h-4 mx-auto mb-1 text-primary" />
                <p className="text-sm font-bold">{distanceKm.toFixed(1)} km</p>
                <p className="text-[10px] text-muted-foreground">
                  {distanceSource === "osrm" ? "Por rota" : distanceSource === "manual" ? "Manual" : "Aprox."}
                </p>
              </div>
              <div className="rounded-lg bg-muted/50 p-2.5 text-center">
                <Clock className="w-4 h-4 mx-auto mb-1 text-primary" />
                <p className="text-sm font-bold">
                  {roadDurationMin > 0 ? `~${Math.round(roadDurationMin)} min` : "—"}
                </p>
                <p className="text-[10px] text-muted-foreground">Tempo estimado</p>
              </div>
              <div className="rounded-lg bg-muted/50 p-2.5 text-center">
                <DollarSign className="w-4 h-4 mx-auto mb-1 text-primary" />
                <p className="text-sm font-bold">R$ {(deliveryCost ?? 0).toFixed(2).replace(".", ",")}</p>
                <p className="text-[10px] text-muted-foreground">Custo total</p>
              </div>
            </div>
          )}

          {loadingRoute && (
            <p className="text-xs text-muted-foreground animate-pulse text-center">🔄 Calculando rota...</p>
          )}
        </CardContent>
      </Card>

      {/* Real-time nearest driver info */}
      {nearestDriverInfo && activeRequest && (
        <Card className="border-primary/40 bg-primary/5">
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center gap-2">
              <Navigation className="w-4 h-4 text-primary" />
              <span className="text-sm font-semibold">Entregador mais próximo</span>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="bg-background rounded-lg p-2">
                <p className="text-lg font-bold text-primary">
                  {nearestDriverInfo.distanceKm < 1
                    ? `${Math.round(nearestDriverInfo.distanceKm * 1000)}m`
                    : `${nearestDriverInfo.distanceKm.toFixed(1)}km`}
                </p>
                <p className="text-[10px] text-muted-foreground">Distância</p>
              </div>
              <div className="bg-background rounded-lg p-2">
                <p className="text-lg font-bold text-primary">
                  {nearestDriverInfo.etaMinutes < 1
                    ? "<1 min"
                    : `${Math.round(nearestDriverInfo.etaMinutes)} min`}
                </p>
                <p className="text-[10px] text-muted-foreground">ETA</p>
              </div>
              <div className="bg-background rounded-lg p-2">
                <p className="text-lg font-bold text-primary">
                  {nearestDriverInfo.speedKmh > 0 ? `${nearestDriverInfo.speedKmh} km/h` : "Parado"}
                </p>
                <p className="text-[10px] text-muted-foreground">Velocidade</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2"><Truck className="w-4 h-4" /> Chamar Entregador</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Pickup address — automático com fallback manual */}
          <div className="space-y-2">
            <Label className="flex items-center gap-1.5">
              <Navigation className="w-3.5 h-3.5 text-green-500" />
              Endereço de coleta (automático ou manual)
            </Label>
            <div className="flex gap-2">
              <Input
                value={callForm.pickup}
                onChange={(e) => {
                  pickupManualRef.current = true;
                  setCallForm((f) => ({ ...f, pickup: e.target.value }));
                }}
                onBlur={(e) => {
                  if (pickupManualRef.current) geocodePickupAddress(e.target.value);
                }}
                placeholder={pickupGpsState === "loading" ? "Localizando endereço da loja..." : "Digite o endereço de coleta"}
                className="flex-1"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={handlePickupGpsClick}
                title="Atualizar localização"
                disabled={pickupGpsState === "loading"}
              >
                {pickupGpsState === "loading"
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <Navigation className="w-4 h-4" />}
              </Button>
            </div>
            {pickupGpsState === "loading" ? (
              <p className="text-[10px] text-muted-foreground">Localizando endereço da loja...</p>
            ) : pickupGpsState === "error" && gpsMessage ? (
              <p className="text-[10px] text-orange-500">{gpsMessage}</p>
            ) : callForm.pickup ? (
              <p className="text-[10px] text-green-600 dark:text-green-400">
                {pickupManualRef.current ? "✓ Endereço informado manualmente" : "✓ Endereço de coleta definido"}
              </p>
            ) : gpsMessage ? (
              <p className="text-[10px] text-muted-foreground">{gpsMessage} Você pode digitar o endereço manualmente.</p>
            ) : null}

          </div>
          <div className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div className="md:col-span-3 space-y-2">
                <Label>Endereço de entrega *</Label>
                <div className="relative" ref={suggestionsRef}>
                  <Input
                    value={callForm.delivery}
                    onChange={(e) => handleDeliveryAddressChange(e.target.value)}
                    onFocus={() => { if (addressSuggestions.length > 0) setShowSuggestions(true); }}
                    placeholder="Digite o endereço do cliente..."
                  />
                  {searchingAddress && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                      <Search className="w-4 h-4 animate-spin text-muted-foreground" />
                    </div>
                  )}
                  {/* Autocomplete dropdown */}
                  {showSuggestions && addressSuggestions.length > 0 && (
                    <div className="absolute z-50 w-full mt-1 bg-card border border-border rounded-lg shadow-lg max-h-56 overflow-y-auto">
                      {addressSuggestions.map((item: any, idx: number) => {
                        const formatted = formatAddress(item);
                        const dist = storeLat && storeLng
                          ? haversineKm(storeLat, storeLng, parseFloat(item.lat), parseFloat(item.lon))
                          : null;
                        return (
                          <button
                            key={idx}
                            type="button"
                            className="w-full text-left px-3 py-2.5 hover:bg-muted/80 border-b border-border/30 last:border-b-0 transition-colors"
                            onClick={() => selectSuggestion(item)}
                          >
                            <p className="text-sm font-medium leading-tight">{formatted}</p>
                            {dist !== null && (
                              <p className="text-[10px] text-muted-foreground mt-0.5">
                                📍 ~{dist < 1 ? `${Math.round(dist * 1000)}m` : `${dist.toFixed(1)}km`} da loja
                              </p>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
              <div className="space-y-2">
                <Label>Número *</Label>
                <Input
                  value={callForm.delivery_number}
                  onChange={(e) => setCallForm(f => ({ ...f, delivery_number: e.target.value }))}
                  placeholder="Nº"
                />
              </div>
            </div>
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                📍 Digite o endereço, selecione uma sugestão, e coloque o número
              </p>
              {deliveryLatLng && user?.id && (
                <ReportLocationButton
                  latitude={deliveryLatLng[0]}
                  longitude={deliveryLatLng[1]}
                  address={callForm.delivery_number.trim() ? `${callForm.delivery}, ${callForm.delivery_number}` : callForm.delivery}
                  userId={user.id}
                />
              )}
            </div>
          </div>
          <div className="space-y-2">
            <Label>Observações</Label>
            <Textarea value={callForm.notes} onChange={(e) => setCallForm(f => ({ ...f, notes: e.target.value }))} rows={2} placeholder="Detalhes da entrega..." />
          </div>

          {/* Manual distance adjustment */}
          {distanceKm > 0 && (
            <div className="space-y-2">
              {!manualDistanceEnabled ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs gap-1 text-muted-foreground"
                  onClick={() => {
                    setManualDistanceEnabled(true);
                    setManualDistanceKm(autoDistanceKm.toFixed(1));
                  }}
                >
                  <Pencil className="w-3 h-3" />
                  Ajustar distância manualmente
                </Button>
              ) : (
                <div className="flex items-center gap-2">
                  <Label className="text-xs whitespace-nowrap">Distância (km):</Label>
                  <Input
                    type="number"
                    step="0.1"
                    min="0.1"
                    value={manualDistanceKm}
                    onChange={(e) => setManualDistanceKm(e.target.value)}
                    className="w-24 h-8 text-sm"
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 text-xs gap-1"
                    onClick={() => {
                      setManualDistanceEnabled(false);
                      setManualDistanceKm("");
                    }}
                  >
                    <RotateCcw className="w-3 h-3" />
                    Usar automático
                  </Button>
                </div>
              )}
            </div>
          )}

          {distanceKm > 0 && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-accent/50 border border-accent">
              <DollarSign className="w-5 h-5 text-primary" />
              <div className="flex-1">
                <p className="text-sm font-semibold">Valor da corrida: <span className="text-primary">R$ {(deliveryCost ?? 0).toFixed(2).replace(".", ",")}</span></p>
                <p className="text-xs text-muted-foreground">
                  Taxa fixa R$ {baseFee.toFixed(2).replace(".", ",")} + {distanceKm.toFixed(1)} km × R$ {feePerKm.toFixed(2).replace(".", ",")} = R$ {(feePerKm * distanceKm).toFixed(2).replace(".", ",")}
                </p>
                <div className="flex items-center gap-2 mt-1">
                  <Route className="w-3 h-3 text-muted-foreground" />
                  <span className="text-[10px] text-muted-foreground">
                    {distanceSource === "osrm" && `Distância por rota (${PROFILE_CONFIG[routeProfile].label}) • ETA: ~${Math.round(roadDurationMin)} min`}
                    {distanceSource === "manual" && "Distância ajustada manualmente"}
                    {distanceSource === "haversine" && "Distância em linha reta (aproximada)"}
                  </span>
                </div>
              </div>
            </div>
          )}

          {distanceKm <= 0 && !loadingRoute && (
            <p className="text-xs text-muted-foreground text-center py-2">
              📍 Digite o endereço de entrega ou clique no mapa para calcular o valor automaticamente
            </p>
          )}

          {/* Preferred Driver Selection */}
          <div className="space-y-2 pt-2 border-t border-border/50">
            <Label className="text-xs font-semibold flex items-center gap-1.5">
              <Star className="w-3.5 h-3.5 text-yellow-500" />
              Direcionar para entregador específico (Opcional)
            </Label>
            <div className="grid grid-cols-1 gap-2">
              <select 
                className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm"
                value={selectedDriverId || ""}
                onChange={(e) => setSelectedDriverId(e.target.value || null)}
              >
                <option value="">Qualquer entregador disponível</option>
                <optgroup label="Seus Favoritos Online">
                  {favoriteDrivers.filter((f: any) => driverLocations.some((dl: any) => dl.driver_id === f.driver_id)).map((f: any) => (
                    <option key={f.driver_id} value={f.driver?.user_id}>
                      ⭐ {f.driver?.full_name} ({f.driver?.driver_code})
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Outros Entregadores Online">
                  {driverLocations
                    .filter((dl: any) => !favoriteDrivers.some((f: any) => f.driver_id === dl.driver_id))
                    .map((dl: any) => (
                      <option key={dl.driver_id} value={dl.user_id}>
                        {dl.driver?.full_name || "Entregador"} ({dl.driver?.driver_code || "N/A"})
                      </option>
                    ))}
                </optgroup>
              </select>
              {selectedDriverId && selectedDriverOnline && (
                <p className="text-[10px] text-primary font-medium flex items-center gap-1">
                  ✓ {selectedDriverName} está online. A solicitação será enviada prioritariamente a ele.
                </p>
              )}
              {selectedDriverId && !selectedDriverOnline && (
                <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2 flex items-start gap-2">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600 mt-0.5 shrink-0" />
                  <div className="flex-1">
                    <p className="text-[11px] font-semibold text-amber-700 dark:text-amber-400">
                      {selectedDriverName} está indisponível no momento
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      Você pode chamar mesmo assim (será enviado quando ele voltar) ou liberar para qualquer entregador.
                    </p>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-6 px-2 mt-1 text-[10px]"
                      onClick={() => setSelectedDriverId(null)}
                    >
                      Liberar para qualquer entregador
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>

          <Button onClick={handleCallDriver} disabled={calling || distanceKm <= 0 || loadingRoute} className="w-full">
            {calling ? "Chamando..." : loadingRoute ? "Calculando rota..." : distanceKm > 0 ? `📲 Chamar Entregador (R$ ${(deliveryCost ?? 0).toFixed(2).replace(".", ",")})` : "📲 Defina o ponto de entrega"}
          </Button>
        </CardContent>
      </Card>

      {/* Chat with driver */}
      {activeRequest && (
        <ChatWidget
          deliveryRequestId={activeRequest.id}
          currentUserId={user.id}
          title="Chat com Entregador"
        />
      )}

      {/* Delivery History */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Entregas Recentes</CardTitle>
        </CardHeader>
        <CardContent>
          {requests.length === 0 ? (
            <p className="text-muted-foreground text-center py-4">Nenhuma entrega solicitada</p>
          ) : (
            <div className="space-y-2">
              {requests.map((r: any) => {
                const canCancel = ["pending", "accepted", "picked_up"].includes(r.status);
                return (
                  <div key={r.id} className="p-3 rounded-lg bg-muted/50 space-y-1">
                    <div className="flex justify-between items-center gap-2">
                      <p className="text-sm font-bold">#{r.id.slice(0, 8)}</p>
                      <div className="flex items-center gap-2">
                        <Badge variant={r.status === "delivered" ? "default" : r.status === "cancelled" ? "destructive" : "secondary"}>
                          {statusLabels[r.status] || r.status}
                        </Badge>
                        {canCancel && (
                          <Button
                            size="sm"
                            variant="destructive"
                            className="h-7 px-2"
                            onClick={() => handleCancelRequest(r.id)}
                          >
                            <XCircle className="w-3.5 h-3.5 mr-1" /> Cancelar
                          </Button>
                        )}
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">📍 {r.pickup_address} → {r.delivery_address}</p>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default CallDriverTab;
