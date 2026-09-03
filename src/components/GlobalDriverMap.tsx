import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useAllDriversStatus, DriverStatus } from "@/hooks/useAllDriversStatus";
import { MAP_LAYERS } from "@/config/maps";
import { Button } from "./ui/button";
import { Layers, MapPin, Navigation } from "lucide-react";
import { Badge } from "./ui/badge";
import { Card, CardContent } from "./ui/card";
import MapErrorBoundary from "./MapErrorBoundary";

const getIcon = (status: DriverStatus) => {
  let color = "#94a3b8"; // Gray for inactive
  if (status === "available") color = "#22c55e"; // Green
  if (status === "in_delivery") color = "#ef4444"; // Red

  return new L.Icon({
    iconUrl: "data:image/svg+xml," + encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="${color}" stroke="white" stroke-width="1.5">
        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
        <circle cx="12" cy="10" r="3" fill="white"/>
      </svg>`
    ),
    iconSize: [32, 32],
    iconAnchor: [16, 32],
    popupAnchor: [0, -32],
  });
};

const GlobalDriverMapContent = () => {
  const { data: drivers = [], isLoading } = useAllDriversStatus();
  const mapRef = useRef<L.Map | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [mapType, setMapType] = useState<keyof typeof MAP_LAYERS>("streets");
  const markersRef = useRef<Map<string, L.Marker>>(new Map());

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    mapRef.current = L.map(containerRef.current).setView([-15.5454, -54.2958], 4);
    
    L.tileLayer(MAP_LAYERS[mapType].url, {
      attribution: MAP_LAYERS[mapType].attribution,
    }).addTo(mapRef.current);

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  // Handle map type changes
  useEffect(() => {
    if (!mapRef.current) return;
    
    mapRef.current.eachLayer((layer) => {
      if (layer instanceof L.TileLayer) {
        mapRef.current?.removeLayer(layer);
      }
    });

    L.tileLayer(MAP_LAYERS[mapType].url, {
      attribution: MAP_LAYERS[mapType].attribution,
    }).addTo(mapRef.current);
  }, [mapType]);

  // Update markers
  useEffect(() => {
    if (!mapRef.current || isLoading) return;

    const currentMap = mapRef.current;
    const driverIdsWithLocation = new Set<string>();

    drivers.forEach(driver => {
      if (driver.latitude && driver.longitude) {
        driverIdsWithLocation.add(driver.id);
        const pos: [number, number] = [driver.latitude, driver.longitude];
        
        if (markersRef.current.has(driver.id)) {
          const marker = markersRef.current.get(driver.id)!;
          marker.setLatLng(pos);
          marker.setIcon(getIcon(driver.status));
          marker.getPopup()?.setContent(`
            <div class="p-1">
              <p class="font-bold text-sm">${driver.full_name}</p>
              <p class="text-xs text-muted-foreground">Código: ${driver.driver_code}</p>
              <p class="text-xs mt-1">Status: <strong>${driver.status === 'available' ? 'Disponível' : driver.status === 'in_delivery' ? 'Em Entrega' : 'Inativo'}</strong></p>
            </div>
          `);
        } else {
          const marker = L.marker(pos, { icon: getIcon(driver.status) })
            .addTo(currentMap)
            .bindPopup(`
              <div class="p-1">
                <p class="font-bold text-sm">${driver.full_name}</p>
                <p class="text-xs text-muted-foreground">Código: ${driver.driver_code}</p>
                <p class="text-xs mt-1">Status: <strong>${driver.status === 'available' ? 'Disponível' : driver.status === 'in_delivery' ? 'Em Entrega' : 'Inativo'}</strong></p>
              </div>
            `);
          markersRef.current.set(driver.id, marker);
        }
      }
    });

    // Remove markers for drivers no longer in the list or without location
    markersRef.current.forEach((marker, id) => {
      if (!driverIdsWithLocation.has(id)) {
        currentMap.removeLayer(marker);
        markersRef.current.delete(id);
      }
    });

    // Fit bounds if first load and there are markers
    if (markersRef.current.size > 0 && mapRef.current.getZoom() <= 4) {
      const group = L.featureGroup(Array.from(markersRef.current.values()));
      mapRef.current.fitBounds(group.getBounds().pad(0.1));
    }

  }, [drivers, isLoading]);

  return (
    <div className="relative w-full h-[400px] sm:h-[600px] rounded-xl overflow-hidden border">
      <div ref={containerRef} className="w-full h-full z-0" />

      
      {/* Legend & Controls */}
      <div className="absolute top-3 right-3 z-[400] flex flex-col gap-2">
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

      <div className="absolute bottom-3 left-3 z-[400] flex flex-col gap-2 pointer-events-none">
        <Card className="bg-white/90 dark:bg-slate-800/90 shadow-md backdrop-blur-sm border-none pointer-events-auto">
          <CardContent className="p-3 flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-[#22c55e]" />
              <span className="text-xs font-medium">Disponível</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-[#ef4444]" />
              <span className="text-xs font-medium">Em Entrega</span>
            </div>

            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-[#94a3b8]" />
              <span className="text-xs font-medium">Inativo / Desativado</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {isLoading && (
        <div className="absolute inset-0 bg-background/50 backdrop-blur-[1px] flex items-center justify-center z-[500]">
          <div className="flex flex-col items-center gap-2">
            <Navigation className="w-8 h-8 animate-bounce text-primary" />
            <p className="text-sm font-medium">Carregando mapa...</p>
          </div>
        </div>
      )}
    </div>
  );
};

const GlobalDriverMap = () => {
  return (
    <MapErrorBoundary fallbackHeight="500px">
      <GlobalDriverMapContent />
    </MapErrorBoundary>
  );
};

export default GlobalDriverMap;
