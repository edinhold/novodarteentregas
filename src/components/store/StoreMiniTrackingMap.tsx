import React, { useEffect, useState } from "react";
import { calculateRoute } from "@/services/mapbox";
import { isValidCoordinate } from "@/utils/geolocation";
import { latLngArrayToLiteralPath, type LatLngLiteral } from "@/utils/mapCoordinates";
import MapLibreView from "@/components/maps/MapLibreView";
import { Maximize2, Crosshair } from "lucide-react";

interface StoreMiniTrackingMapProps {
  pickupLocation?: { lat: number; lng: number; name?: string; address?: string } | null;
  deliveryLocation?: { lat: number; lng: number; address?: string } | null;
  driverPosition?: { lat: number; lng: number } | null;
  className?: string;
  onExpand?: () => void;
  statusText?: string;
}

export const StoreMiniTrackingMap: React.FC<StoreMiniTrackingMapProps> = ({
  pickupLocation,
  deliveryLocation,
  driverPosition,
  className = "",
  onExpand,
  statusText,
}) => {
  const [routeDistance, setRouteDistance] = useState<string | null>(null);
  const [routePath, setRoutePath] = useState<LatLngLiteral[]>([]);
  const [routeDashed, setRouteDashed] = useState(false);
  const [recenterTrigger, setRecenterTrigger] = useState(0);

  const hasPickup = isValidCoordinate(pickupLocation?.lat, pickupLocation?.lng);
  const hasDelivery = isValidCoordinate(deliveryLocation?.lat, deliveryLocation?.lng);
  const hasDriver = isValidCoordinate(driverPosition?.lat, driverPosition?.lng);

  // Calcula a rota exclusivamente via Mapbox Directions API e converte para { lat, lng }[]
  useEffect(() => {
    if (!hasPickup || !hasDelivery) {
      setRoutePath([]);
      setRouteDistance(null);
      setRouteDashed(false);
      return;
    }

    let isCancelled = false;
    const pLat = pickupLocation!.lat;
    const pLng = pickupLocation!.lng;
    const destLat = deliveryLocation!.lat;
    const destLng = deliveryLocation!.lng;

    const drawRoute = async () => {
      try {
        const routeData = await calculateRoute(
          { lat: pLat, lng: pLng },
          { lat: destLat, lng: destLng },
          { profile: "driving" }
        );

        if (isCancelled) return;

        if (routeData?.geometry && routeData.geometry.length > 0) {
          setRoutePath(latLngArrayToLiteralPath(routeData.geometry));
          setRouteDashed(false);
        } else {
          setRoutePath([
            { lat: pLat, lng: pLng },
            { lat: destLat, lng: destLng },
          ]);
          setRouteDashed(true);
        }

        const distText = routeData?.distanceKm
          ? `${routeData.distanceKm} km`
          : routeData?.distanceMeters
          ? `${(routeData.distanceMeters / 1000).toFixed(1)} km`
          : null;
        if (distText) setRouteDistance(distText);
      } catch (err) {
        console.warn("[StoreMiniTrackingMap] Erro ao traçar rota:", err);
        if (isCancelled) return;
        setRoutePath([
          { lat: pLat, lng: pLng },
          { lat: destLat, lng: destLng },
        ]);
        setRouteDashed(true);
      }
    };

    drawRoute();

    return () => {
      isCancelled = true;
    };
  }, [hasPickup, hasDelivery, pickupLocation?.lat, pickupLocation?.lng, deliveryLocation?.lat, deliveryLocation?.lng]);

  const handleRecenter = () => {
    setRecenterTrigger((prev) => prev + 1);
  };

  return (
    <div
      className={`relative rounded-2xl overflow-hidden border border-border/80 shadow-md bg-card select-none group transition-all ${className}`}
    >
      <MapLibreView
        origin={
          hasPickup
            ? {
                lat: pickupLocation!.lat,
                lng: pickupLocation!.lng,
                name: pickupLocation?.name || "Loja / Coleta",
              }
            : null
        }
        stops={
          hasDelivery
            ? [
                {
                  id: "delivery-target",
                  lat: deliveryLocation!.lat,
                  lng: deliveryLocation!.lng,
                  label: deliveryLocation?.address || "Destino da Entrega",
                },
              ]
            : []
        }
        driverPosition={
          hasDriver
            ? {
                lat: driverPosition!.lat,
                lng: driverPosition!.lng,
                label: "Entregador a caminho",
              }
            : null
        }
        routePath={routePath}
        routeColor="#2563EB"
        routeWeight={4}
        routeDashed={routeDashed}
        autoFitBounds={true}
        fitPadding={28}
        recenterTrigger={recenterTrigger}
        className="w-full h-full min-h-[160px]"
      />

      {/* Badge Superior com status e distância */}
      <div className="absolute top-2 left-2 z-10 flex items-center gap-1.5 pointer-events-none">
        <span className="bg-background/90 dark:bg-zinc-900/90 backdrop-blur-md text-[11px] font-bold text-foreground px-2.5 py-1 rounded-lg border border-border/60 shadow-xs flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
          <span>{statusText || "Rastreamento em tempo real"}</span>
          {routeDistance && (
            <span className="text-primary font-extrabold ml-0.5">• {routeDistance}</span>
          )}
        </span>
      </div>

      {/* Botões Flutuantes de Ação no Mapa */}
      <div className="absolute bottom-2 right-2 z-10 flex items-center gap-1.5">
        <button
          type="button"
          onClick={handleRecenter}
          title="Recentralizar no entregador"
          aria-label="Recentralizar no entregador"
          className="w-8 h-8 rounded-lg bg-background/90 dark:bg-zinc-900/90 backdrop-blur-md hover:bg-background text-foreground border border-border/60 shadow-sm flex items-center justify-center transition active:scale-95"
        >
          <Crosshair className="w-4 h-4" />
        </button>

        {onExpand && (
          <button
            type="button"
            onClick={onExpand}
            title="Expandir mapa completo"
            aria-label="Expandir mapa completo"
            className="w-8 h-8 rounded-lg bg-background/90 dark:bg-zinc-900/90 backdrop-blur-md hover:bg-background text-foreground border border-border/60 shadow-sm flex items-center justify-center transition active:scale-95"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
};

export default StoreMiniTrackingMap;
