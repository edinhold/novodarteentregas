import { useEffect, useState, useMemo } from "react";
import { supabase, createFreshChannel } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Layers, Navigation, Package, Truck } from "lucide-react";
import MapErrorBoundary from "@/components/MapErrorBoundary";
import GoogleMapView, { type GoogleMapExtraMarker } from "@/components/maps/GoogleMapView";
import { geocodeAddress } from "@/services/mapbox";

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

const RadarTabContent = ({ restaurant, userId }: Props) => {
  const queryClient = useQueryClient();
  const [mapType, setMapType] = useState<"roadmap" | "satellite">("roadmap");
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
    const channel = createFreshChannel("radar-tab-realtime")
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
      geocodeAddress(activeDelivery.delivery_address)
        .then((parsed) => {
          if (!cancelled && parsed?.coordinates) {
            setDestCoords({ lat: parsed.coordinates.latitude, lng: parsed.coordinates.longitude });
          } else if (!cancelled) {
            setDestCoords(null);
          }
        })
        .catch(() => {
          if (!cancelled) setDestCoords(null);
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

  const extraMarkers = useMemo<GoogleMapExtraMarker[]>(() => {
    const list: GoogleMapExtraMarker[] = [];

    drivers.forEach((d) => {
      const loc = locationMap.get(d.user_id);
      if (!loc) return;
      const isAssigned = assignedDriver?.user_id === d.user_id;
      const isAvailable = d.is_active && !busySet.has(d.user_id);
      if (!isAssigned && !isAvailable) return;

      list.push({
        id: `drv-${d.user_id}`,
        lat: Number(loc.latitude),
        lng: Number(loc.longitude),
        title: d.full_name || "Motorista",
        color: isAssigned ? "#3b82f6" : "#22c55e",
        infoHtml: `<div style="padding:4px"><b>${d.full_name || "Motorista"}</b>${
          d.vehicle_plate ? ` • <b>${d.vehicle_plate}</b>` : ""
        }<br/><span style="font-size:11px">${d.driver_code || ""} ${d.vehicle_type || ""}</span>${
          isAssigned && tracking
            ? `<br/><span style="font-size:11px">${tracking.label} — ${formatDistance(tracking.meters)}</span>`
            : ""
        }</div>`,
      });
    });

    if (tracking && assignedDriver?.location) {
      list.push({
        id: "radar-target",
        lat: tracking.target.lat,
        lng: tracking.target.lng,
        title: tracking.toLabel,
        color: "#a855f7",
      });
    }

    return list;
  }, [drivers, locationMap, busySet, assignedDriver, tracking]);

  const routePath = useMemo(() => {
    if (tracking && assignedDriver?.location) {
      return [
        { lat: Number(assignedDriver.location.latitude), lng: Number(assignedDriver.location.longitude) },
        { lat: tracking.target.lat, lng: tracking.target.lng },
      ];
    }
    return [];
  }, [tracking, assignedDriver]);


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
        <GoogleMapView
          origin={
            restaurant?.latitude && restaurant?.longitude
              ? { lat: Number(restaurant.latitude), lng: Number(restaurant.longitude), name: restaurant.name || "Sua loja" }
              : null
          }
          extraMarkers={extraMarkers}
          routePath={routePath}
          routeColor="#3b82f6"
          routeWeight={4}
          routeDashed
          mapType={mapType}
          zoom={13}
          autoFitBounds
          className="w-full h-full z-0"
        />

        <div className="absolute top-3 right-3 z-[400]">
          <Button
            size="sm"
            variant="secondary"
            className="bg-white/90 dark:bg-slate-800/90 shadow-md backdrop-blur-sm"
            onClick={() => setMapType(mapType === "roadmap" ? "satellite" : "roadmap")}
          >
            <Layers className="w-4 h-4 mr-2" />
            {mapType === "roadmap" ? "Satélite" : "Mapa"}
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
