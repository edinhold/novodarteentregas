import { useEffect, useRef, useState, useMemo } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Layers, Navigation, Package, Truck, MapPin } from "lucide-react";
import { MAP_LAYERS } from "@/config/maps";
import MapErrorBoundary from "@/components/MapErrorBoundary";

import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

const makeIcon = (color: string, size = 30) =>
  new L.Icon({
    iconUrl:
      "data:image/svg+xml," +
      encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="${color}" stroke="white" stroke-width="1.5"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3" fill="white"/></svg>`
      ),
    iconSize: [size, size],
    iconAnchor: [size / 2, size],
    popupAnchor: [0, -size],
  });

const storeIcon = makeIcon("#e53935", 34);
const availableIcon = makeIcon("#22c55e", 28);
const assignedIcon = makeIcon("#3b82f6", 34);
const destIcon = makeIcon("#a855f7", 30);

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatDistance(m: number) {
  if (m < 1000) return `${Math.round(m)} m`;
  return `${(m / 1000).toFixed(2)} km`;
}

async function geocode(address: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(address)}`,
      { headers: { Accept: "application/json" } }
    );
    const data = await res.json();
    if (data?.[0]) return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
  } catch (e) {
    console.error("[RadarTab] geocode error", e);
  }
  return null;
}

interface Props {
  restaurant: any;
  userId: string;
}

const RadarTabContent = ({ restaurant, userId }: Props) => {
  const queryClient = useQueryClient();
  const mapRef = useRef<L.Map | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const markersRef = useRef<Map<string, L.Marker>>(new Map());
  const extraMarkersRef = useRef<L.Marker[]>([]);
  const routeLineRef = useRef<L.Polyline | null>(null);
  const didInitialFitRef = useRef(false);
  const lastAssignedRef = useRef<string | null>(null);

  const [mapType, setMapType] = useState<keyof typeof MAP_LAYERS>("streets");
  const [destCoords, setDestCoords] = useState<{ lat: number; lng: number } | null>(null);

  // Available drivers (safe RPC — no PIX/CPF/phone exposed)
  const { data: drivers = [] } = useQuery({
    queryKey: ["radar-drivers"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("get_radar_drivers");
      if (error) throw error;
      return (data || []) as any[];
    },
    refetchInterval: 30000,
  });

  const { data: locations = [] } = useQuery({
    queryKey: ["radar-locations"],
    queryFn: async () => {
      const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from("driver_locations")
        .select("user_id, latitude, longitude, updated_at")
        .gte("updated_at", tenMinAgo);
      if (error) throw error;
      return data || [];
    },
    refetchInterval: 30000,
    staleTime: 5000,
  });


  // Active delivery for this store
  const { data: activeDelivery } = useQuery({
    queryKey: ["radar-active-delivery", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("delivery_requests")
        .select("id, driver_id, status, pickup_address, delivery_address, restaurant_id")
        .eq("store_owner_id", userId)
        .in("status", ["accepted", "picked_up"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    refetchInterval: 15000,
  });

  // Driver IDs currently in active deliveries (any store) — to mark as unavailable
  const { data: busyDriverIds = [] } = useQuery({
    queryKey: ["radar-busy-drivers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("delivery_requests")
        .select("driver_id")
        .in("status", ["accepted", "picked_up"]);
      if (error) throw error;
      return (data || []).map((d) => d.driver_id).filter(Boolean);
    },
    refetchInterval: 15000,
  });

  // Realtime — patch cache directly for instant map updates
  useEffect(() => {
    const channel = supabase
      .channel("radar-tab-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "driver_locations" },
        (payload) => {
          const row: any = payload.new ?? payload.old;
          if (!row?.user_id) return;
          queryClient.setQueryData<any[]>(["radar-locations"], (prev = []) => {
            if (payload.eventType === "DELETE") {
              return prev.filter((l) => l.user_id !== row.user_id);
            }
            const next = {
              user_id: row.user_id,
              latitude: Number(row.latitude),
              longitude: Number(row.longitude),
              updated_at: row.updated_at ?? new Date().toISOString(),
            };
            const idx = prev.findIndex((l) => l.user_id === row.user_id);
            if (idx === -1) return [...prev, next];
            const copy = prev.slice();
            copy[idx] = { ...copy[idx], ...next };
            return copy;
          });
        }
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "delivery_requests" }, () => {
        queryClient.invalidateQueries({ queryKey: ["radar-active-delivery", userId] });
        queryClient.invalidateQueries({ queryKey: ["radar-busy-drivers"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "drivers" }, () =>
        queryClient.invalidateQueries({ queryKey: ["radar-drivers"] })
      )
      .subscribe((status) => {
        console.log("[RadarTab] realtime status", status);
      });
    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient, userId]);


  const locationMap = useMemo(
    () => new Map(locations.map((l) => [l.user_id, l])),
    [locations]
  );
  const busySet = useMemo(() => new Set(busyDriverIds), [busyDriverIds]);

  const assignedDriver = useMemo(() => {
    if (!activeDelivery?.driver_id) return null;
    const d = drivers.find((d) => d.user_id === activeDelivery.driver_id);
    if (!d) return null;
    const loc = locationMap.get(d.user_id);
    return { ...d, location: loc || null };
  }, [activeDelivery, drivers, locationMap]);

  // Geocode delivery address when needed (picked_up)
  useEffect(() => {
    if (activeDelivery?.status === "picked_up" && activeDelivery.delivery_address) {
      let cancelled = false;
      geocode(activeDelivery.delivery_address).then((c) => {
        if (!cancelled) setDestCoords(c);
      });
      return () => {
        cancelled = true;
      };
    } else {
      setDestCoords(null);
    }
  }, [activeDelivery?.status, activeDelivery?.delivery_address]);

  // Distance + target
  const tracking = useMemo(() => {
    if (!assignedDriver?.location) return null;
    const dLat = assignedDriver.location.latitude;
    const dLng = assignedDriver.location.longitude;
    if (activeDelivery?.status === "accepted" && restaurant?.latitude && restaurant?.longitude) {
      return {
        label: "Indo coletar o pedido",
        toLabel: "Loja",
        meters: haversineMeters(dLat, dLng, restaurant.latitude, restaurant.longitude),
        target: { lat: restaurant.latitude, lng: restaurant.longitude },
      };
    }
    if (activeDelivery?.status === "picked_up" && destCoords) {
      return {
        label: "Indo entregar ao cliente",
        toLabel: "Destino",
        meters: haversineMeters(dLat, dLng, destCoords.lat, destCoords.lng),
        target: destCoords,
      };
    }
    return null;
  }, [assignedDriver, activeDelivery, restaurant, destCoords]);

  // Init map
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const center: [number, number] =
      restaurant?.latitude && restaurant?.longitude
        ? [restaurant.latitude, restaurant.longitude]
        : [-15.5454, -54.2958];
    mapRef.current = L.map(containerRef.current).setView(center, 13);
    L.tileLayer(MAP_LAYERS[mapType].url, { attribution: MAP_LAYERS[mapType].attribution }).addTo(
      mapRef.current
    );
    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Tile layer change
  useEffect(() => {
    if (!mapRef.current) return;
    mapRef.current.eachLayer((l) => {
      if (l instanceof L.TileLayer) mapRef.current?.removeLayer(l);
    });
    L.tileLayer(MAP_LAYERS[mapType].url, { attribution: MAP_LAYERS[mapType].attribution }).addTo(
      mapRef.current
    );
  }, [mapType]);

  // Render markers
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Clear extra markers + route
    extraMarkersRef.current.forEach((m) => map.removeLayer(m));
    extraMarkersRef.current = [];
    if (routeLineRef.current) {
      map.removeLayer(routeLineRef.current);
      routeLineRef.current = null;
    }

    // Store marker
    if (restaurant?.latitude && restaurant?.longitude) {
      const m = L.marker([restaurant.latitude, restaurant.longitude], { icon: storeIcon })
        .addTo(map)
        .bindPopup(`<b>${restaurant.name || "Sua loja"}</b>`);
      extraMarkersRef.current.push(m);
    }

    // Driver markers — show available (active, with location, not busy) + assigned
    const seen = new Set<string>();
    drivers.forEach((d) => {
      const loc = locationMap.get(d.user_id);
      if (!loc) return;
      const isAssigned = assignedDriver?.user_id === d.user_id;
      const isAvailable = d.is_active && !busySet.has(d.user_id);
      if (!isAssigned && !isAvailable) return;

      seen.add(d.user_id);
      const pos: [number, number] = [loc.latitude, loc.longitude];
      const icon = isAssigned ? assignedIcon : availableIcon;
      const plate = d.vehicle_plate ? ` • <b>${d.vehicle_plate}</b>` : "";
      const popup = `<div class="p-1"><b>${d.full_name || "Motorista"}</b>${plate}<br/><span style="font-size:11px">${d.driver_code || ""} ${d.vehicle_type || ""}</span>${
        isAssigned && tracking ? `<br/><span style="font-size:11px">${tracking.label} — ${formatDistance(tracking.meters)}</span>` : ""
      }</div>`;

      if (markersRef.current.has(d.user_id)) {
        const mk = markersRef.current.get(d.user_id)!;
        mk.setLatLng(pos);
        mk.setIcon(icon);
        mk.getPopup()?.setContent(popup);
      } else {
        const mk = L.marker(pos, { icon }).addTo(map).bindPopup(popup);
        markersRef.current.set(d.user_id, mk);
      }
    });

    // Remove stale
    markersRef.current.forEach((mk, id) => {
      if (!seen.has(id)) {
        map.removeLayer(mk);
        markersRef.current.delete(id);
      }
    });

    // Destination marker + route line
    if (tracking && assignedDriver?.location) {
      const tm = L.marker([tracking.target.lat, tracking.target.lng], { icon: destIcon })
        .addTo(map)
        .bindPopup(`<b>${tracking.toLabel}</b>`);
      extraMarkersRef.current.push(tm);

      routeLineRef.current = L.polyline(
        [
          [assignedDriver.location.latitude, assignedDriver.location.longitude],
          [tracking.target.lat, tracking.target.lng],
        ],
        { color: "#3b82f6", weight: 4, opacity: 0.7, dashArray: "8 8" }
      ).addTo(map);

      const bounds = L.latLngBounds([
        [assignedDriver.location.latitude, assignedDriver.location.longitude],
        [tracking.target.lat, tracking.target.lng],
      ]);
      if (!didInitialFitRef.current || lastAssignedRef.current !== assignedDriver.user_id) {
        map.fitBounds(bounds.pad(0.3));
        didInitialFitRef.current = true;
        lastAssignedRef.current = assignedDriver.user_id;
      }
    } else if (markersRef.current.size > 0) {
      const grp = L.featureGroup([
        ...Array.from(markersRef.current.values()),
        ...extraMarkersRef.current,
      ]);
      if (!didInitialFitRef.current && grp.getBounds().isValid()) {
        map.fitBounds(grp.getBounds().pad(0.2));
        didInitialFitRef.current = true;
      }
      lastAssignedRef.current = null;
    }
  }, [drivers, locationMap, busySet, assignedDriver, tracking, restaurant]);


  const availableCount = useMemo(
    () =>
      drivers.filter(
        (d) => d.is_active && !busySet.has(d.user_id) && locationMap.has(d.user_id)
      ).length,
    [drivers, busySet, locationMap]
  );

  return (
    <div className="space-y-3">
      {/* Status card */}
      {assignedDriver && tracking ? (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                {activeDelivery?.status === "accepted" ? (
                  <Package className="w-5 h-5 text-primary" />
                ) : (
                  <Truck className="w-5 h-5 text-primary" />
                )}
                <span className="font-semibold text-sm">{tracking.label}</span>
              </div>
              <Badge variant="secondary" className="text-base font-bold">
                {formatDistance(tracking.meters)}
              </Badge>
            </div>
            <div className="text-sm">
              <div>
                <span className="text-muted-foreground">Motorista:</span>{" "}
                <span className="font-medium">{assignedDriver.full_name}</span>
              </div>
              {assignedDriver.vehicle_plate && (
                <div>
                  <span className="text-muted-foreground">Placa:</span>{" "}
                  <span className="font-mono font-semibold tracking-wider">
                    {assignedDriver.vehicle_plate}
                  </span>
                  {assignedDriver.vehicle_type && (
                    <span className="text-muted-foreground"> • {assignedDriver.vehicle_type}</span>
                  )}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Navigation className="w-5 h-5 text-green-500" />
              <span className="font-medium text-sm">Motoristas disponíveis no radar</span>
            </div>
            <Badge variant="secondary" className="text-base font-bold">
              {availableCount}
            </Badge>
          </CardContent>
        </Card>
      )}

      <div className="relative w-full h-[400px] sm:h-[560px] rounded-xl overflow-hidden border">
        <div ref={containerRef} className="w-full h-full z-0" />

        <div className="absolute top-3 right-3 z-[400]">
          <Button
            size="sm"
            variant="secondary"
            className="bg-white/90 dark:bg-slate-800/90 shadow-md backdrop-blur-sm"
            onClick={() => setMapType(mapType === "streets" ? "satellite" : "streets")}
          >
            <Layers className="w-4 h-4 mr-2" />
            {mapType === "streets" ? "Satélite" : "Mapa"}
          </Button>
        </div>

        <div className="absolute bottom-3 left-3 z-[400] pointer-events-none">
          <Card className="bg-white/90 dark:bg-slate-800/90 shadow-md backdrop-blur-sm border-none pointer-events-auto">
            <CardContent className="p-2.5 flex flex-col gap-1.5 text-xs">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-[#e53935]" />
                <span>Sua loja</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-[#22c55e]" />
                <span>Disponível</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-[#3b82f6]" />
                <span>Seu entregador</span>
              </div>
              {tracking && (
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-[#a855f7]" />
                  <span>{tracking.toLabel}</span>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

const RadarTab = (props: Props) => (
  <MapErrorBoundary fallbackHeight="500px">
    <RadarTabContent {...props} />
  </MapErrorBoundary>
);

export default RadarTab;
