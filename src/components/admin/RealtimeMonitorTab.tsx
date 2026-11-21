import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase, createFreshChannel } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Layers, Truck, Package, Users, Search, Activity } from "lucide-react";
import MapErrorBoundary from "@/components/MapErrorBoundary";
import GoogleMapView, { type GoogleMapExtraMarker } from "@/components/maps/GoogleMapView";
import { DriverPhoto } from "@/components/DriverPhoto";
import { geocodeAddress } from "@/services/mapbox";

async function geocode(address: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const parsed = await geocodeAddress(address);
    if (parsed?.coordinates) {
      return { lat: parsed.coordinates.latitude, lng: parsed.coordinates.longitude };
    }
  } catch {}
  return null;
}

const RealtimeMonitorContent = () => {
  const qc = useQueryClient();
  const [mapType, setMapType] = useState<"roadmap" | "satellite">("roadmap");
  const [search, setSearch] = useState("");
  const [destCoordsMap, setDestCoordsMap] = useState<Record<string, { lat: number; lng: number }>>({});

  const { data: drivers = [] } = useQuery({
    queryKey: ["monitor-drivers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("drivers")
        .select("id, user_id, full_name, driver_code, vehicle_type, vehicle_plate, is_active, approval_status, photo_url")
        .eq("approval_status", "approved");
      if (error) throw error;
      return data || [];
    },
    refetchInterval: 30000,
  });

  const { data: locations = [] } = useQuery({
    queryKey: ["monitor-locations"],
    queryFn: async () => {
      const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from("driver_locations")
        .select("user_id, latitude, longitude, updated_at")
        .gte("updated_at", tenMinAgo);
      if (error) throw error;
      return data || [];
    },
    refetchInterval: 15000,
  });

  const { data: activeDeliveries = [] } = useQuery({
    queryKey: ["monitor-active-deliveries"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("delivery_requests")
        .select("id, driver_id, store_owner_id, status, pickup_address, delivery_address, customer_name, created_at")
        .in("status", ["accepted", "picked_up"])
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    refetchInterval: 15000,
  });

  // Realtime subscriptions
  useEffect(() => {
    const ch = createFreshChannel("admin-monitor")
      .on("postgres_changes", { event: "*", schema: "public", table: "driver_locations" }, (payload) => {
        const row: any = payload.new ?? payload.old;
        if (!row?.user_id) return;
        qc.setQueryData<any[]>(["monitor-locations"], (prev = []) => {
          if (payload.eventType === "DELETE") return prev.filter((l) => l.user_id !== row.user_id);
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
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "delivery_requests" }, () =>
        qc.invalidateQueries({ queryKey: ["monitor-active-deliveries"] })
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "drivers" }, () =>
        qc.invalidateQueries({ queryKey: ["monitor-drivers"] })
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [qc]);

  const locMap = useMemo(() => new Map(locations.map((l) => [l.user_id, l])), [locations]);
  const busyDriverIds = useMemo(
    () => new Set(activeDeliveries.map((d) => d.driver_id).filter(Boolean)),
    [activeDeliveries]
  );

  const enrichedDrivers = useMemo(
    () =>
      drivers.map((d: any) => {
        const loc = locMap.get(d.user_id);
        const active = activeDeliveries.find((a) => a.driver_id === d.user_id);
        return {
          ...d,
          latitude: loc?.latitude,
          longitude: loc?.longitude,
          lastSeen: loc?.updated_at,
          active,
          status: active ? "in_delivery" : loc ? "available" : "offline",
        };
      }),
    [drivers, locMap, activeDeliveries]
  );

  const filtered = enrichedDrivers.filter((d: any) => {
    const q = search.toLowerCase();
    return (
      !q ||
      (d.full_name || "").toLowerCase().includes(q) ||
      (d.driver_code || "").toLowerCase().includes(q) ||
      (d.vehicle_plate || "").toLowerCase().includes(q)
    );
  });

  const stats = useMemo(() => {
    const available = enrichedDrivers.filter((d: any) => d.status === "available").length;
    const busy = enrichedDrivers.filter((d: any) => d.status === "in_delivery").length;
    const offline = enrichedDrivers.filter((d: any) => d.status === "offline").length;
    return { available, busy, offline, activeCount: activeDeliveries.length };
  }, [enrichedDrivers, activeDeliveries]);

  // Resolve destination coordinates for active deliveries via Mapbox Geocoding
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const nextMap: Record<string, { lat: number; lng: number }> = {};
      for (const a of activeDeliveries) {
        const target = a.status === "picked_up" ? a.delivery_address : a.pickup_address;
        if (!target) continue;
        const coords = await geocode(target);
        if (cancelled) return;
        if (coords) nextMap[a.id] = coords;
      }
      if (!cancelled) setDestCoordsMap(nextMap);
    })();
    return () => {
      cancelled = true;
    };
  }, [activeDeliveries]);

  const extraMarkers = useMemo<GoogleMapExtraMarker[]>(() => {
    const markers: GoogleMapExtraMarker[] = [];
    enrichedDrivers.forEach((d: any) => {
      if (!d.latitude || !d.longitude) return;
      const statusLabel =
        d.status === "in_delivery"
          ? `Em Entrega (${d.active?.status === "picked_up" ? "entregando" : "coletando"})`
          : "Disponível";
      markers.push({
        id: `drv-${d.user_id}`,
        lat: Number(d.latitude),
        lng: Number(d.longitude),
        title: d.full_name || "Motorista",
        color: d.status === "in_delivery" ? "#ef4444" : "#22c55e",
        infoHtml: `<div style="padding:4px;min-width:160px">
          <p style="font-weight:700;font-size:13px;margin:0">${d.full_name || "Sem nome"}</p>
          <p style="font-size:11px;color:#666;margin:2px 0">Cód: ${d.driver_code || "-"}</p>
          <p style="font-size:11px;margin:2px 0"><strong>${statusLabel}</strong></p>
        </div>`,
      });
    });

    activeDeliveries.forEach((a: any) => {
      const coords = destCoordsMap[a.id];
      if (!coords) return;
      markers.push({
        id: `dest-${a.id}`,
        lat: coords.lat,
        lng: coords.lng,
        title: a.status === "picked_up" ? "Entrega" : "Coleta",
        color: a.status === "picked_up" ? "#a855f7" : "#f59e0b",
      });
    });

    return markers;
  }, [enrichedDrivers, activeDeliveries, destCoordsMap]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-green-500/10"><Users className="w-5 h-5 text-green-600" /></div>
            <div>
              <p className="text-xs text-muted-foreground">Disponíveis</p>
              <p className="text-xl font-bold">{stats.available}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-red-500/10"><Truck className="w-5 h-5 text-red-600" /></div>
            <div>
              <p className="text-xs text-muted-foreground">Em Entrega</p>
              <p className="text-xl font-bold">{stats.busy}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-slate-500/10"><Activity className="w-5 h-5 text-slate-600" /></div>
            <div>
              <p className="text-xs text-muted-foreground">Offline</p>
              <p className="text-xl font-bold">{stats.offline}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-purple-500/10"><Package className="w-5 h-5 text-purple-600" /></div>
            <div>
              <p className="text-xs text-muted-foreground">Entregas Ativas</p>
              <p className="text-xl font-bold">{stats.activeCount}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
          <CardTitle className="text-base">Mapa em Tempo Real</CardTitle>
          <Button size="sm" variant="outline" onClick={() => setMapType(mapType === "roadmap" ? "satellite" : "roadmap")}>
            <Layers className="w-4 h-4 mr-1" /> {mapType === "roadmap" ? "Satélite" : "Mapa"}
          </Button>
        </CardHeader>
        <CardContent>
          <div className="relative w-full h-[500px] rounded-lg overflow-hidden border">
            <GoogleMapView
              extraMarkers={extraMarkers}
              mapType={mapType}
              zoom={12}
              autoFitBounds={extraMarkers.length > 0}
              className="w-full h-full z-0"
            />
            <div className="absolute bottom-3 left-3 z-[400] bg-background/90 backdrop-blur-sm rounded-md p-2 text-xs space-y-1 shadow border">
              <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-[#22c55e]" /> Disponível</div>
              <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-[#ef4444]" /> Em entrega</div>
              <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-[#f59e0b]" /> Coleta</div>
              <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-[#a855f7]" /> Destino</div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
          <CardTitle className="text-base">Motoristas ({filtered.length})</CardTitle>
          <div className="relative w-56">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Nome, código, placa..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 h-9" />
          </div>
        </CardHeader>
        <CardContent className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((d: any) => (
            <div key={d.user_id} className="p-3 border rounded-lg bg-card">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <DriverPhoto
                    photoUrl={d.photo_url}
                    driverId={d.user_id}
                    alt={d.full_name}
                    className="w-10 h-10 rounded-full shrink-0 border border-border object-cover"
                  />
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate">{d.full_name}</p>
                    <p className="text-xs text-muted-foreground">{d.driver_code} • {d.vehicle_plate || "s/ placa"}</p>
                  </div>
                </div>
                <Badge
                  variant={d.status === "in_delivery" ? "destructive" : d.status === "available" ? "default" : "secondary"}
                  className="text-[10px] shrink-0"
                >
                  {d.status === "in_delivery" ? "Entregando" : d.status === "available" ? "Online" : "Offline"}
                </Badge>
              </div>
              {d.active && (
                <div className="mt-2 text-xs text-muted-foreground">
                  <p className="truncate">📦 {d.active.customer_name || "Cliente"}</p>
                  <p className="truncate">→ {d.active.delivery_address}</p>
                  <p className="mt-1 text-[10px] uppercase font-medium text-primary">
                    {d.active.status === "picked_up" ? "A caminho do destino" : "Indo coletar"}
                  </p>
                </div>
              )}
              {d.lastSeen && (
                <p className="mt-1 text-[10px] text-muted-foreground">
                  Últ. sinal: {new Date(d.lastSeen).toLocaleTimeString("pt-BR")}
                </p>
              )}
            </div>
          ))}
          {filtered.length === 0 && (
            <p className="text-sm text-muted-foreground col-span-full text-center py-6">Nenhum motorista encontrado</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

const RealtimeMonitorTab = () => (
  <MapErrorBoundary fallbackHeight="500px">
    <RealtimeMonitorContent />
  </MapErrorBoundary>
);

export default RealtimeMonitorTab;
