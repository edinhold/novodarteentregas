import React, { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Crosshair } from "lucide-react";
import { DEFAULT_CENTER, MAP_LAYERS } from "@/config/maps";
import { calculateRoute } from "@/services/mapbox";

interface DriverDarkMapProps {
  driverPosition: { lat: number; lng: number } | null;
  heading?: number | null;
  pickupLocation?: { lat: number; lng: number; name?: string } | null;
  deliveryLocation?: { lat: number; lng: number; address?: string } | null;
  pendingLocations?: Array<{ id: string; lat: number; lng: number; name?: string }>;
  onSelectPending?: (id: string) => void;
}

// Marker customizado do Motorista (círculo azul com seta branca direcional giratória)
const createDriverIcon = (heading: number | null | undefined) => {
  const rot = heading != null ? heading : 315;
  return L.divIcon({
    className: "driver-nav-icon",
    html: `
      <div style="width: 36px; height: 36px; position: relative; display: flex; align-items: center; justify-content: center;">
        <div style="position: absolute; inset: -4px; background: rgba(59, 130, 246, 0.25); border-radius: 9999px;"></div>
        <div style="width: 30px; height: 30px; background: #2563eb; border: 2.5px solid #ffffff; border-radius: 9999px; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 14px rgba(0,0,0,0.6);">
          <svg width="16" height="16" viewBox="0 0 24 24" style="transform: rotate(${rot}deg); transform-origin: 50% 50%; fill: #ffffff;">
            <polygon points="12,2 22,21 12,17 2,21" />
          </svg>
        </div>
      </div>
    `,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
  });
};

// Marker customizado do Ponto de Coleta (halo azul ciano com ponto central)
const pickupIcon = L.divIcon({
  className: "pickup-nav-icon",
  html: `
    <div style="width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; position: relative;">
      <div style="position: absolute; width: 30px; height: 30px; background: rgba(14, 165, 233, 0.3); border-radius: 9999px;"></div>
      <div style="width: 22px; height: 22px; background: #0284c7; border: 2.5px solid #ffffff; border-radius: 9999px; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 12px rgba(0,0,0,0.6);">
        <div style="width: 6px; height: 6px; background: #ffffff; border-radius: 9999px;"></div>
      </div>
    </div>
  `,
  iconSize: [32, 32],
  iconAnchor: [16, 16],
});

// Marker customizado do Ponto de Entrega (pino branco com silhueta de cliente/avatar)
const deliveryIcon = L.divIcon({
  className: "delivery-nav-icon",
  html: `
    <div style="filter: drop-shadow(0 4px 12px rgba(0,0,0,0.7)); transform: translateY(-4px);">
      <svg width="34" height="42" viewBox="0 0 34 42" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M17 0C7.61 0 0 7.61 0 17C0 29.75 17 42 17 42C17 42 34 29.75 34 17C34 7.61 26.39 0 17 0Z" fill="#FFFFFF"/>
        <circle cx="17" cy="14" r="5" fill="#18181B"/>
        <path d="M9.5 25C9.5 21 12.8 18 17 18C21.2 18 24.5 21 24.5 25" fill="#18181B"/>
      </svg>
    </div>
  `,
  iconSize: [34, 42],
  iconAnchor: [17, 42],
});

export const DriverDarkMap: React.FC<DriverDarkMapProps> = ({
  driverPosition,
  heading,
  pickupLocation,
  deliveryLocation,
  pendingLocations = [],
  onSelectPending,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const driverMarkerRef = useRef<L.Marker | null>(null);
  const pickupMarkerRef = useRef<L.Marker | null>(null);
  const deliveryMarkerRef = useRef<L.Marker | null>(null);
  const pendingMarkersRef = useRef<L.Marker[]>([]);
  const routePolylineRef = useRef<L.Polyline | null>(null);

  const [autoFollow, setAutoFollow] = useState(true);

  // Inicialização do Mapa com tema Dark (CartoDB Dark Matter)
  useEffect(() => {
    if (!containerRef.current) return;
    if (mapRef.current) return;

    const initialCenter: [number, number] = driverPosition
      ? [driverPosition.lat, driverPosition.lng]
      : pickupLocation
      ? [pickupLocation.lat, pickupLocation.lng]
      : [DEFAULT_CENTER.lat, DEFAULT_CENTER.lng];

    const map = L.map(containerRef.current, {
      zoomControl: false,
      attributionControl: false,
    }).setView(initialCenter, 16);

    // Camada escura oficial
    const darkTileUrl = MAP_LAYERS.dark.url;
    tileLayerRef.current = L.tileLayer(darkTileUrl, {
      maxZoom: 19,
      subdomains: "abcd",
    }).addTo(map);

    map.on("dragstart", () => setAutoFollow(false));
    mapRef.current = map;

    return () => {
      try {
        map.remove();
        mapRef.current = null;
      } catch (err) {
        console.warn("[DriverDarkMap] Erro ao desmontar mapa:", err);
      }
    };
  }, []);

  // Atualização da posição do motorista e orientação da seta
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !driverPosition) return;

    const latLng: [number, number] = [driverPosition.lat, driverPosition.lng];

    if (driverMarkerRef.current) {
      driverMarkerRef.current.setLatLng(latLng);
      driverMarkerRef.current.setIcon(createDriverIcon(heading));
    } else {
      driverMarkerRef.current = L.marker(latLng, {
        icon: createDriverIcon(heading),
        zIndexOffset: 1000,
      }).addTo(map);
    }

    if (autoFollow) {
      map.setView(latLng, map.getZoom(), { animate: true });
    }
  }, [driverPosition, heading, autoFollow]);

  // Marcador de Coleta (Loja)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (pickupMarkerRef.current) {
      map.removeLayer(pickupMarkerRef.current);
      pickupMarkerRef.current = null;
    }

    if (pickupLocation && pickupLocation.lat && pickupLocation.lng) {
      pickupMarkerRef.current = L.marker([pickupLocation.lat, pickupLocation.lng], {
        icon: pickupIcon,
        zIndexOffset: 500,
      }).addTo(map);
    }
  }, [pickupLocation?.lat, pickupLocation?.lng]);

  // Marcador de Entrega (Cliente)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (deliveryMarkerRef.current) {
      map.removeLayer(deliveryMarkerRef.current);
      deliveryMarkerRef.current = null;
    }

    if (deliveryLocation && deliveryLocation.lat && deliveryLocation.lng) {
      deliveryMarkerRef.current = L.marker([deliveryLocation.lat, deliveryLocation.lng], {
        icon: deliveryIcon,
        zIndexOffset: 600,
      }).addTo(map);
    }
  }, [deliveryLocation?.lat, deliveryLocation?.lng]);

  // Traçado da Rota em Azul Ciano (Directions v5 / Polyline)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (routePolylineRef.current) {
      map.removeLayer(routePolylineRef.current);
      routePolylineRef.current = null;
    }

    // Determinar os dois pontos prioritários para rota
    // 1. Motorista -> Coleta (se ainda não coletou)
    // 2. Coleta -> Entrega (se já coletou ou traçando caminho completo)
    let startPoint = driverPosition;
    let endPoint = pickupLocation || deliveryLocation;

    if (!startPoint || !endPoint) return;

    let isSubscribed = true;

    const drawPolyline = (points: [number, number][]) => {
      if (!isSubscribed || !mapRef.current) return;
      if (routePolylineRef.current) {
        mapRef.current.removeLayer(routePolylineRef.current);
      }
      routePolylineRef.current = L.polyline(points, {
        color: "#0ea5e9", // Azul Ciano vibrante do mockup
        weight: 5,
        opacity: 0.95,
        lineCap: "round",
        lineJoin: "round",
      }).addTo(mapRef.current);
    };

    // Tentar obter rota real pelas ruas via Mapbox / OSRM
    const fetchRoutes = async () => {
      try {
        if (driverPosition && pickupLocation && deliveryLocation) {
          // Trajeto completo de 2 etapas: Motorista -> Coleta -> Entrega
          const [res1, res2] = await Promise.allSettled([
            calculateRoute(
              { lat: driverPosition.lat, lng: driverPosition.lng },
              { lat: pickupLocation.lat, lng: pickupLocation.lng }
            ),
            calculateRoute(
              { lat: pickupLocation.lat, lng: pickupLocation.lng },
              { lat: deliveryLocation.lat, lng: deliveryLocation.lng }
            ),
          ]);

          const geom1 = res1.status === "fulfilled" && res1.value?.geometry?.length ? res1.value.geometry : [
            [driverPosition.lat, driverPosition.lng] as [number, number],
            [pickupLocation.lat, pickupLocation.lng] as [number, number],
          ];

          const geom2 = res2.status === "fulfilled" && res2.value?.geometry?.length ? res2.value.geometry : [
            [pickupLocation.lat, pickupLocation.lng] as [number, number],
            [deliveryLocation.lat, deliveryLocation.lng] as [number, number],
          ];

          drawPolyline([...geom1, ...geom2]);
          return;
        }

        // Caso tenha apenas 1 destino (Coleta ou Entrega)
        const res = await calculateRoute(
          { lat: startPoint.lat, lng: startPoint.lng },
          { lat: endPoint.lat, lng: endPoint.lng }
        );

        if (res?.geometry && res.geometry.length > 0) {
          drawPolyline(res.geometry);
        } else {
          drawPolyline([
            [startPoint!.lat, startPoint!.lng],
            [endPoint!.lat, endPoint!.lng],
          ]);
        }
      } catch {
        drawPolyline([
          [startPoint!.lat, startPoint!.lng],
          [endPoint!.lat, endPoint!.lng],
        ]);
      }
    };

    fetchRoutes();

    return () => {
      isSubscribed = false;
    };
  }, [driverPosition?.lat, driverPosition?.lng, pickupLocation?.lat, pickupLocation?.lng, deliveryLocation?.lat, deliveryLocation?.lng]);

  // Marcadores de chamados pendentes adicionais
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    pendingMarkersRef.current.forEach((m) => map.removeLayer(m));
    pendingMarkersRef.current = [];

    pendingLocations.forEach((loc) => {
      const marker = L.marker([loc.lat, loc.lng], { icon: pickupIcon })
        .addTo(map)
        .on("click", () => onSelectPending?.(loc.id));
      pendingMarkersRef.current.push(marker);
    });
  }, [pendingLocations, onSelectPending]);

  // Botão flutuante de recentralizar localização (mira/target)
  const handleRecenter = () => {
    const map = mapRef.current;
    if (!map) return;

    if (driverPosition) {
      setAutoFollow(true);
      map.flyTo([driverPosition.lat, driverPosition.lng], 16, {
        animate: true,
        duration: 0.8,
      });
    } else if (pickupLocation) {
      map.flyTo([pickupLocation.lat, pickupLocation.lng], 16, {
        animate: true,
        duration: 0.8,
      });
    }
  };

  return (
    <div className="absolute inset-0 w-full h-full z-0 overflow-hidden bg-[#121214]">
      {/* Contêiner Leaflet do mapa */}
      <div ref={containerRef} className="w-full h-full z-0" />

      {/* Botão Flutuante de Recentralizar (Ícone de Mira / Target)
          Posicionado no canto inferior direito, logo acima do card inferior */}
      <div className="absolute right-4 bottom-[235px] sm:bottom-[245px] z-20 pointer-events-auto">
        <button
          type="button"
          onClick={handleRecenter}
          aria-label="Recentralizar no motorista"
          title="Recentralizar no motorista"
          className="w-12 h-12 rounded-full bg-[#18181b]/95 hover:bg-zinc-800 text-white border border-white/15 shadow-2xl flex items-center justify-center transition active:scale-95 backdrop-blur-md"
        >
          <Crosshair className="w-5 h-5 text-white" />
        </button>
      </div>
    </div>
  );
};

export default DriverDarkMap;
