import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Layers, Truck, Package, Users, Search, Activity } from "lucide-react";
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

const svgIcon = (color: string, size = 30) =>
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

const iconAvailable = svgIcon("#22c55e", 28);
const iconBusy = svgIcon("#ef4444", 32);
const iconStore = svgIcon("#f59e0b", 28);
const iconDest = svgIcon("#a855f7", 26);

async function geocode(address: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(address + ", Primavera do Leste, MT")}`,
      { headers: { Accept: "application/json" } }
    );
    const data = await res.json();
    if (data?.[0]) return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
  } catch {}
  return null;
}

const RealtimeMonitorContent = () => {
  const qc = useQueryClient();
  const mapRef = useRef<L.Map | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const driverMarkers = useRef<Map<string, L.Marker>>(new Map());
  const routeLines = useRef<Map<string, L.Polyline>>(new Map());
  const extraMarkers = useRef<L.Marker[]>([]);
  const didFit = useRef(false);
  const [mapType, setMapType] = useState<keyof typeof MAP_LAYERS>("streets");
  const [search, setSearch] = useState("");

  const { data: drivers = [] } = useQuery({
    queryKey: ["monitor-drivers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("drivers")
        .select("id, user_id, full_name, driver_code, vehicle_type, vehicle_plate, is_active, approval_status")
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
    const ch = supabase
      .channel("admin-monitor")
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
    return !q || d.full_name?.toLowerCase().includes(q) || d.driver_code?.toLowerCase().includes(q) || d.vehicle_plate?.toLowerCase().includes(q);
  });

  const stats = useMemo(() => {
    const available = enrichedDrivers.filter((d: any) => d.status === "available").length;
    const busy = enrichedDrivers.filter((d: any) => d.status === "in_delivery").length;
    const offline = enrichedDrivers.filter((d: any) => d.status === "offline").length;
    return { available, busy, offline, activeCount: activeDeliveries.length };
  }, [enrichedDrivers, activeDeliveries]);

  // Init map
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    mapRef.current = L.map(containerRef.current).setView([-15.5454, -54.2958], 12);
    L.tileLayer(MAP_LAYERS[mapType].url, { attribution: MAP_LAYERS[mapType].attribution }).addTo(mapRef.current);
    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  // Change map type
  useEffect(() => {
    if (!mapRef.current) return;
    mapRef.current.eachLayer((l) => {
      if (l instanceof L.TileLayer) mapRef.current!.removeLayer(l);
    });
    L.tileLayer(MAP_LAYERS[mapType].url, { attribution: MAP_LAYERS[mapType].attribution }).addTo(mapRef.current);
  }, [mapType]);

  // Update driver markers
  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;
    const seen = new Set<string>();

    enrichedDrivers.forEach((d: any) => {
      if (!d.latitude || !d.longitude) return;
      seen.add(d.user_id);
      const pos: [number, number] = [d.latitude, d.longitude];
      const icon = d.status === "in_delivery" ? iconBusy : iconAvailable;
      const statusLabel =
        d.status === "in_delivery"
          ? `Em Entrega (${d.active?.status === "picked_up" ? "entregando" : "coletando"})`
          : "Disponível";
      const popup = `
        <div class="p-1 min-w-[180px]">
          <p class="font-bold text-sm">${d.full_name || "Sem nome"}</p>
          <p class="text-xs text-muted-foreground">Cód: ${d.driver_code || "-"}</p>
          <p class="text-xs">${d.vehicle_type || ""} ${d.vehicle_plate ? "• " + d.vehicle_plate : ""}</p>
          <p class="text-xs mt-1"><strong>${statusLabel}</strong></p>
          ${d.active ? `<p class="text-xs mt-1">📦 ${d.active.customer_name || "Cliente"}</p><p class="text-xs">→ ${d.active.delivery_address || ""}</p>` : ""}
        </div>`;
      if (driverMarkers.current.has(d.user_id)) {
        const m = driverMarkers.current.get(d.user_id)!;
        m.setLatLng(pos);
        m.setIcon(icon);
        m.getPopup()?.setContent(popup);
      } else {
        const m = L.marker(pos, { icon }).addTo(map).bindPopup(popup);
        driverMarkers.current.set(d.user_id, m);
      }
    });

    driverMarkers.current.forEach((m, id) => {
      if (!seen.has(id)) {
        map.removeLayer(m);
        driverMarkers.current.delete(id);
      }
    });

    if (!didFit.current && driverMarkers.current.size > 0) {
      const g = L.featureGroup(Array.from(driverMarkers.current.values()));
      map.fitBounds(g.getBounds().pad(0.2));
      didFit.current = true;
    }
  }, [enrichedDrivers]);

  // Draw active delivery routes (driver → destination)
  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;

    // Clear old lines & extra markers
    routeLines.current.forEach((l) => map.removeLayer(l));
    routeLines.current.clear();
    extraMarkers.current.forEach((m) => map.removeLayer(m));
    extraMarkers.current = [];

    (async () => {
      for (const a of activeDeliveries) {
        if (!a.driver_id) continue;
        const loc = locMap.get(a.driver_id);
        if (!loc?.latitude || !loc?.longitude) continue;
        const target = a.status === "picked_up" ? a.delivery_address : a.pickup_address;
        if (!target) continue;
        const coords = await geocode(target);
        if (!coords) continue;

        const color = a.status === "picked_up" ? "#a855f7" : "#f59e0b";
        const line = L.polyline(
          [
            [loc.latitude, loc.longitude],
            [coords.lat, coords.lng],
          ],
          { color, weight: 3, opacity: 0.75, dashArray: "6,8" }
        ).addTo(map);
        routeLines.current.set(a.id, line);

        const destMarker = L.marker([coords.lat, coords.lng], {
          icon: a.status === "picked_up" ? iconDest : iconStore,
        })
          .addTo(map)
          .bindPopup(
            `<div class="p-1"><p class="font-bold text-xs">${a.status === "picked_up" ? "Entrega" : "Coleta"}</p><p class="text-xs">${target}</p></div>`
          );
        extraMarkers.current.push(destMarker);
      }
    })();
  }, [activeDeliveries, locMap]);

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
          <Button size="sm" variant="outline" onClick={() => setMapType(mapType === "streets" ? "satellite" : "streets")}>
            <Layers className="w-4 h-4 mr-1" /> {mapType === "streets" ? "Satélite" : "Mapa"}
          </Button>
        </CardHeader>
        <CardContent>
          <div className="relative w-full h-[500px] rounded-lg overflow-hidden border">
            <div ref={containerRef} className="w-full h-full z-0" />
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
                <div className="min-w-0">
                  <p className="font-medium text-sm truncate">{d.full_name}</p>
                  <p className="text-xs text-muted-foreground">{d.driver_code} • {d.vehicle_plate || "s/ placa"}</p>
                </div>
                <Badge
                  variant={d.status === "in_delivery" ? "destructive" : d.status === "available" ? "default" : "secondary"}
                  className="text-[10px]"
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
