import { useMemo, useState } from "react";
import { useAllDriversStatus } from "@/hooks/useAllDriversStatus";
import { Button } from "./ui/button";
import { Layers, Navigation } from "lucide-react";
import { Card, CardContent } from "./ui/card";
import MapErrorBoundary from "./MapErrorBoundary";
import MapLibreView, { type MapExtraMarker } from "./maps/MapLibreView";

const GlobalDriverMapContent = () => {
  const { data: drivers = [], isLoading } = useAllDriversStatus();
  const [mapType, setMapType] = useState<"roadmap" | "satellite">("roadmap");

  const extraMarkers = useMemo<MapExtraMarker[]>(() => {
    return drivers
      .filter((d) => d.latitude && d.longitude)
      .map((driver) => {
        const color =
          driver.status === "available"
            ? "#22c55e"
            : driver.status === "in_delivery"
            ? "#ef4444"
            : "#94a3b8";
        const statusText =
          driver.status === "available"
            ? "Disponível"
            : driver.status === "in_delivery"
            ? "Em Entrega"
            : "Inativo";
        return {
          id: driver.id,
          lat: Number(driver.latitude),
          lng: Number(driver.longitude),
          title: driver.full_name || "Motorista",
          color,
          infoHtml: `
            <div style="padding:4px">
              <p style="font-weight:700;font-size:13px;margin:0">${driver.full_name || "Motorista"}</p>
              <p style="font-size:11px;color:#666;margin:2px 0">Código: ${driver.driver_code || "-"}</p>
              <p style="font-size:11px;margin:2px 0">Status: <strong>${statusText}</strong></p>
            </div>
          `,
        };
      });
  }, [drivers]);

  return (
    <div className="relative w-full h-[400px] sm:h-[600px] rounded-xl overflow-hidden border">
      <MapLibreView
        extraMarkers={extraMarkers}
        mapType={mapType}
        zoom={12}
        autoFitBounds={extraMarkers.length > 0}
        className="w-full h-full z-0"
      />

      <div className="absolute top-3 right-3 z-[400] flex flex-col gap-2">
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
