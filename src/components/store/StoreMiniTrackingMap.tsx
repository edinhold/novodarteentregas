import React, { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { DEFAULT_CENTER, MAP_LAYERS } from "@/config/maps";
import { calculateRoute } from "@/services/mapbox";
import { Maximize2, Crosshair, Navigation } from "lucide-react";

interface StoreMiniTrackingMapProps {
  pickupLocation?: { lat: number; lng: number; name?: string; address?: string } | null;
  deliveryLocation?: { lat: number; lng: number; address?: string } | null;
  driverPosition?: { lat: number; lng: number } | null;
  className?: string;
  onExpand?: () => void;
  statusText?: string;
}

// Ícone personalizado de motocicleta em círculo laranja com sombra e halo pulsante
const createMotorcycleIcon = () => {
  return L.divIcon({
    className: "store-motorcycle-nav-icon",
    html: `
      <div style="width: 38px; height: 38px; position: relative; display: flex; align-items: center; justify-content: center;">
        <div style="position: absolute; inset: -4px; background: rgba(234, 88, 12, 0.3); border-radius: 9999px; animation: ping 2s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>
        <div style="width: 32px; height: 32px; background: #EA580C; border: 2.5px solid #ffffff; border-radius: 9999px; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 14px rgba(0,0,0,0.45); z-index: 10;">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="18.5" cy="17.5" r="3.5"/>
            <circle cx="5.5" cy="17.5" r="3.5"/>
            <circle cx="15" cy="5" r="1"/>
            <path d="M12 17.5V14l-3-3 4-3 2 3h2"/>
          </svg>
        </div>
      </div>
    `,
    iconSize: [38, 38],
    iconAnchor: [19, 19],
  });
};

// Ícone do destino da entrega (pino azul com centro branco)
const deliveryTargetIcon = L.divIcon({
  className: "store-delivery-target-icon",
  html: `
    <div style="width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; position: relative;">
      <div style="position: absolute; width: 28px; height: 28px; background: rgba(37, 99, 235, 0.25); border-radius: 9999px;"></div>
      <div style="width: 20px; height: 20px; background: #2563EB; border: 2.5px solid #ffffff; border-radius: 9999px; display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 10px rgba(0,0,0,0.4);">
        <div style="width: 6px; height: 6px; background: #ffffff; border-radius: 9999px;"></div>
      </div>
    </div>
  `,
  iconSize: [28, 28],
  iconAnchor: [14, 14],
});

// Ícone da loja (ponto de coleta - verde esmeralda)
const storePickupIcon = L.divIcon({
  className: "store-pickup-marker-icon",
  html: `
    <div style="width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; position: relative;">
      <div style="position: absolute; width: 28px; height: 28px; background: rgba(16, 185, 129, 0.25); border-radius: 9999px;"></div>
      <div style="width: 20px; height: 20px; background: #10B981; border: 2.5px solid #ffffff; border-radius: 9999px; display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 10px rgba(0,0,0,0.4);">
        <div style="width: 6px; height: 6px; background: #ffffff; border-radius: 9999px;"></div>
      </div>
    </div>
  `,
  iconSize: [28, 28],
  iconAnchor: [14, 14],
});

export const StoreMiniTrackingMap: React.FC<StoreMiniTrackingMapProps> = ({
  pickupLocation,
  deliveryLocation,
  driverPosition,
  className = "",
  onExpand,
  statusText,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const routeLineRef = useRef<L.Polyline | null>(null);
  const driverMarkerRef = useRef<L.Marker | null>(null);
  const deliveryMarkerRef = useRef<L.Marker | null>(null);
  const pickupMarkerRef = useRef<L.Marker | null>(null);
  const [routeDistance, setRouteDistance] = useState<string | null>(null);

  // Inicializa o mapa Leaflet
  useEffect(() => {
    if (!containerRef.current) return;
    if ((containerRef.current as any)._leaflet_id) return;

    const initialCenter: [number, number] = pickupLocation?.lat && pickupLocation?.lng
      ? [pickupLocation.lat, pickupLocation.lng]
      : [DEFAULT_CENTER.lat, DEFAULT_CENTER.lng];

    const map = L.map(containerRef.current, {
      center: initialCenter,
      zoom: 14,
      zoomControl: false,
      attributionControl: false,
    });

    L.tileLayer(MAP_LAYERS.streets.url, {
      maxZoom: 19,
      subdomains: ["a", "b", "c"],
    }).addTo(map);

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      if (containerRef.current) {
        delete (containerRef.current as any)._leaflet_id;
      }
    };
  }, []);

  // Atualiza marcadores e traçado da rota
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // 1. Ponto de Coleta (Loja)
    const pLat = pickupLocation?.lat ?? DEFAULT_CENTER.lat;
    const pLng = pickupLocation?.lng ?? DEFAULT_CENTER.lng;

    if (!pickupMarkerRef.current) {
      pickupMarkerRef.current = L.marker([pLat, pLng], { icon: storePickupIcon }).addTo(map);
    } else {
      pickupMarkerRef.current.setLatLng([pLat, pLng]);
    }

    // 2. Ponto de Entrega (Destino)
    if (deliveryLocation?.lat && deliveryLocation?.lng) {
      if (!deliveryMarkerRef.current) {
        deliveryMarkerRef.current = L.marker([deliveryLocation.lat, deliveryLocation.lng], {
          icon: deliveryTargetIcon,
        }).addTo(map);
      } else {
        deliveryMarkerRef.current.setLatLng([deliveryLocation.lat, deliveryLocation.lng]);
      }
    } else if (deliveryMarkerRef.current) {
      map.removeLayer(deliveryMarkerRef.current);
      deliveryMarkerRef.current = null;
    }

    // 3. Posição do Motorista (Moto)
    const mLat = driverPosition?.lat ?? (deliveryLocation ? (pLat + deliveryLocation.lat) / 2 : pLat);
    const mLng = driverPosition?.lng ?? (deliveryLocation ? (pLng + deliveryLocation.lng) / 2 : pLng);

    if (!driverMarkerRef.current) {
      driverMarkerRef.current = L.marker([mLat, mLng], { icon: createMotorcycleIcon() }).addTo(map);
    } else {
      driverMarkerRef.current.setLatLng([mLat, mLng]);
    }

    // 4. Cálculo e desenho de rota (Mapbox / OSRM)
    let isCancelled = false;
    const drawRoute = async () => {
      const destLat = deliveryLocation?.lat;
      const destLng = deliveryLocation?.lng;

      if (!destLat || !destLng) {
        if (routeLineRef.current) {
          map.removeLayer(routeLineRef.current);
          routeLineRef.current = null;
        }
        return;
      }

      try {
        const routeData = await calculateRoute(
          { lat: pLat, lng: pLng },
          { lat: destLat, lng: destLng },
          "driving"
        );

        if (isCancelled || !mapRef.current) return;

        if (routeData?.geometry && routeData.geometry.length > 0) {
          setRouteDistance(`${(routeData.distanceMeters / 1000).toFixed(1)} km`);

          if (!routeLineRef.current) {
            routeLineRef.current = L.polyline(routeData.geometry, {
              color: "#2563EB",
              weight: 4.5,
              opacity: 0.9,
              lineJoin: "round",
            }).addTo(map);
          } else {
            routeLineRef.current.setLatLngs(routeData.geometry);
          }

          // Ajusta zoom para enquadrar perfeitamente rota e marcadores
          const bounds = L.latLngBounds([
            [pLat, pLng],
            [destLat, destLng],
            [mLat, mLng],
          ]);
          map.fitBounds(bounds, { padding: [25, 25], maxZoom: 16 });
        } else {
          // Fallback linha direta se a API de rota não responder
          const directLine: [number, number][] = [
            [pLat, pLng],
            [destLat, destLng],
          ];
          if (!routeLineRef.current) {
            routeLineRef.current = L.polyline(directLine, {
              color: "#2563EB",
              weight: 3.5,
              dashArray: "6, 8",
              opacity: 0.8,
            }).addTo(map);
          } else {
            routeLineRef.current.setLatLngs(directLine);
          }
        }
      } catch {
        // Fallback silencioso
      }
    };

    drawRoute();

    return () => {
      isCancelled = true;
    };
  }, [pickupLocation, deliveryLocation, driverPosition]);

  const handleRecenter = () => {
    const map = mapRef.current;
    if (!map) return;
    if (driverPosition) {
      map.flyTo([driverPosition.lat, driverPosition.lng], 15, { animate: true, duration: 0.6 });
    } else if (pickupLocation) {
      map.flyTo([pickupLocation.lat, pickupLocation.lng], 15, { animate: true, duration: 0.6 });
    }
  };

  return (
    <div
      className={`relative rounded-2xl overflow-hidden border border-border/80 shadow-md bg-card select-none group transition-all ${className}`}
    >
      {/* Contêiner Leaflet */}
      <div ref={containerRef} className="w-full h-full min-h-[160px] z-0" />

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
