import React, { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Crosshair, Layers } from "lucide-react";
import { DEFAULT_CENTER, MAP_LAYERS } from "@/config/maps";
import { calculateRoute } from "@/services/mapbox";

interface DriverDarkMapProps {
  driverPosition: { lat: number; lng: number } | null;
  heading?: number | null;
  pickupLocation?: { lat: number; lng: number; name?: string } | null;
  deliveryLocation?: { lat: number; lng: number; address?: string } | null;
  pendingLocations?: Array<{ id: string; lat: number; lng: number; name?: string }>;
  hasActiveDelivery?: boolean;
  activeStatus?: "accepted" | "picked_up" | string | null;
  onSelectPending?: (id: string) => void;
  isBottomCardCollapsed?: boolean;
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
  hasActiveDelivery = false,
  activeStatus = null,
  onSelectPending,
  isBottomCardCollapsed = false,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const driverMarkerRef = useRef<L.Marker | null>(null);
  const pickupMarkerRef = useRef<L.Marker | null>(null);
  const deliveryMarkerRef = useRef<L.Marker | null>(null);
  const pendingMarkersRef = useRef<L.Marker[]>([]);
  const routePolylineRef = useRef<L.Polyline | null>(null);

  // Rastreamento de rota contínua e sem piscamento
  const lastRouteOriginRef = useRef<{ lat: number; lng: number } | null>(null);
  const lastRouteDestRef = useRef<{ lat: number; lng: number } | null>(null);
  const currentRoutePointsRef = useRef<[number, number][]>([]);
  const isFetchingRouteRef = useRef<boolean>(false);

  const [autoFollow, setAutoFollow] = useState(true);
  const [mapType, setMapType] = useState<keyof typeof MAP_LAYERS>("streets");

  // Inicialização do Mapa com a camada OpenStreetMap (streets) como padrão
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

    // Camada oficial: OpenStreetMap (ou selecionada)
    const currentConfig = MAP_LAYERS[mapType] || MAP_LAYERS.streets;
    tileLayerRef.current = L.tileLayer(currentConfig.url, {
      maxZoom: mapType.includes("satellite") || mapType.includes("google") ? 20 : 19,
      subdomains: mapType === "dark" ? "abcd" : "abc",
      attribution: currentConfig.attribution,
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

  // Atualizar camada do mapa quando o motorista alternar
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const currentConfig = MAP_LAYERS[mapType] || MAP_LAYERS.streets;

    if (tileLayerRef.current) {
      map.removeLayer(tileLayerRef.current);
    }
    tileLayerRef.current = L.tileLayer(currentConfig.url, {
      maxZoom: mapType.includes("satellite") || mapType.includes("google") ? 20 : 19,
      subdomains: mapType === "dark" ? "abcd" : "abc",
      attribution: currentConfig.attribution,
    }).addTo(map);
  }, [mapType]);

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

  // Marcador de Coleta (Loja) - Apenas se houver corrida aceita ativa
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (pickupMarkerRef.current) {
      map.removeLayer(pickupMarkerRef.current);
      pickupMarkerRef.current = null;
    }

    // Apenas exibe o marcador de coleta se o motorista tiver aceito a corrida e ainda não tiver coletado o pedido
    if (hasActiveDelivery && activeStatus !== "picked_up" && pickupLocation && pickupLocation.lat && pickupLocation.lng) {
      pickupMarkerRef.current = L.marker([pickupLocation.lat, pickupLocation.lng], {
        icon: pickupIcon,
        zIndexOffset: 500,
      }).addTo(map);
    }
  }, [hasActiveDelivery, activeStatus, pickupLocation?.lat, pickupLocation?.lng]);

  // Marcador de Entrega (Cliente) - Apenas se houver corrida aceita ativa
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (deliveryMarkerRef.current) {
      map.removeLayer(deliveryMarkerRef.current);
      deliveryMarkerRef.current = null;
    }

    // Apenas exibe o marcador de entrega se houver corrida aceita ativa
    if (hasActiveDelivery && deliveryLocation && deliveryLocation.lat && deliveryLocation.lng) {
      deliveryMarkerRef.current = L.marker([deliveryLocation.lat, deliveryLocation.lng], {
        icon: deliveryIcon,
        zIndexOffset: 600,
      }).addTo(map);
    }
  }, [hasActiveDelivery, deliveryLocation?.lat, deliveryLocation?.lng]);

  // Traçado da Rota em Azul Ciano (Directions v5 / Polyline)
  // REGRA SÊNIOR: NUNCA traça rota sem que haja um chamado aceito pelo motorista (hasActiveDelivery).
  // E NUNCA remove a polyline antes da nova estar pronta (evita efeito "piscando" / flashing no GPS).
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Se NÃO houver corrida aceita ativa, remove imediatamente qualquer traçado do mapa
    if (!hasActiveDelivery) {
      if (routePolylineRef.current) {
        map.removeLayer(routePolylineRef.current);
        routePolylineRef.current = null;
      }
      currentRoutePointsRef.current = [];
      lastRouteOriginRef.current = null;
      lastRouteDestRef.current = null;
      return;
    }

    // Determina o destino prioritário da rota conforme a etapa da entrega ativa:
    // Se status === 'picked_up' (já coletou): o destino é a Entrega (cliente)
    // Se status === 'accepted' (ainda não coletou): o destino é a Coleta (loja)
    const targetDestination =
      activeStatus === "picked_up"
        ? (deliveryLocation || pickupLocation)
        : (pickupLocation || deliveryLocation);

    if (!driverPosition || !targetDestination || !targetDestination.lat || !targetDestination.lng) {
      if (routePolylineRef.current) {
        map.removeLayer(routePolylineRef.current);
        routePolylineRef.current = null;
      }
      currentRoutePointsRef.current = [];
      lastRouteOriginRef.current = null;
      lastRouteDestRef.current = null;
      return;
    }

    const calcDistanceMeters = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
      const R = 6371e3;
      const p1 = (lat1 * Math.PI) / 180;
      const p2 = (lat2 * Math.PI) / 180;
      const dp = ((lat2 - lat1) * Math.PI) / 180;
      const dl = ((lon2 - lon1) * Math.PI) / 180;
      const a =
        Math.sin(dp / 2) * Math.sin(dp / 2) +
        Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) * Math.sin(dl / 2);
      return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    };

    const destChanged =
      !lastRouteDestRef.current ||
      calcDistanceMeters(
        lastRouteDestRef.current.lat,
        lastRouteDestRef.current.lng,
        targetDestination.lat,
        targetDestination.lng
      ) > 10;

    const driverMovedFar =
      !lastRouteOriginRef.current ||
      calcDistanceMeters(
        lastRouteOriginRef.current.lat,
        lastRouteOriginRef.current.lng,
        driverPosition.lat,
        driverPosition.lng
      ) > 25;

    // Se já temos a rota traçada e o motorista apenas teve micro-oscilação do GPS (<25m),
    // atualizamos suavemente apenas a ponta inicial do traçado sem requisição de rede e sem piscar!
    if (routePolylineRef.current && !destChanged && !driverMovedFar) {
      if (currentRoutePointsRef.current.length > 0) {
        const updatedPoints: [number, number][] = [
          [driverPosition.lat, driverPosition.lng],
          ...currentRoutePointsRef.current.slice(1),
        ];
        currentRoutePointsRef.current = updatedPoints;
        routePolylineRef.current.setLatLngs(updatedPoints);
      }
      return;
    }

    let isCancelled = false;

    const updateRoute = async () => {
      if (isFetchingRouteRef.current) return;
      isFetchingRouteRef.current = true;

      try {
        const res = await calculateRoute(
          { lat: driverPosition.lat, lng: driverPosition.lng },
          { lat: targetDestination.lat, lng: targetDestination.lng }
        );

        if (isCancelled || !mapRef.current) return;

        const points: [number, number][] =
          res?.geometry && res.geometry.length > 0
            ? res.geometry
            : [
                [driverPosition.lat, driverPosition.lng],
                [targetDestination.lat, targetDestination.lng],
              ];

        currentRoutePointsRef.current = points;
        lastRouteOriginRef.current = { lat: driverPosition.lat, lng: driverPosition.lng };
        lastRouteDestRef.current = { lat: targetDestination.lat, lng: targetDestination.lng };

        // Atualiza a polyline existente in-place com setLatLngs (Zero piscamento!)
        if (routePolylineRef.current) {
          routePolylineRef.current.setLatLngs(points);
        } else {
          routePolylineRef.current = L.polyline(points, {
            color: "#0ea5e9", // Azul Ciano vibrante
            weight: 5,
            opacity: 0.95,
            lineCap: "round",
            lineJoin: "round",
          }).addTo(mapRef.current);
        }
      } catch {
        if (isCancelled || !mapRef.current) return;
        const fallbackPoints: [number, number][] = [
          [driverPosition.lat, driverPosition.lng],
          [targetDestination.lat, targetDestination.lng],
        ];
        if (routePolylineRef.current) {
          routePolylineRef.current.setLatLngs(fallbackPoints);
        } else {
          routePolylineRef.current = L.polyline(fallbackPoints, {
            color: "#0ea5e9",
            weight: 5,
            opacity: 0.95,
            lineCap: "round",
            lineJoin: "round",
          }).addTo(mapRef.current);
        }
      } finally {
        isFetchingRouteRef.current = false;
      }
    };

    updateRoute();

    return () => {
      isCancelled = true;
    };
  }, [
    hasActiveDelivery,
    activeStatus,
    driverPosition?.lat,
    driverPosition?.lng,
    pickupLocation?.lat,
    pickupLocation?.lng,
    deliveryLocation?.lat,
    deliveryLocation?.lng,
  ]);

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

      {/* Botões Flutuantes: Alternar Camadas e Recentralizar Mira */}
      <div
        className={`absolute right-4 z-20 flex flex-col gap-2.5 pointer-events-auto transition-all duration-300 ease-in-out ${
          isBottomCardCollapsed
            ? "bottom-[75px]"
            : "bottom-[235px] sm:bottom-[245px]"
        }`}
      >
        <button
          type="button"
          onClick={() => {
            const types: (keyof typeof MAP_LAYERS)[] = ["streets", "google", "satellite", "dark"];
            const next = types[(types.indexOf(mapType) + 1) % types.length];
            setMapType(next);
          }}
          aria-label="Alternar camada do mapa"
          title={`Camada atual: ${mapType === "streets" ? "OpenStreetMap (Padrão)" : mapType === "google" ? "Google Maps" : mapType === "satellite" ? "Satélite" : "Escuro"}`}
          className="w-12 h-12 rounded-full bg-[#18181b]/95 hover:bg-zinc-800 text-white border border-white/15 shadow-2xl flex items-center justify-center transition active:scale-95 backdrop-blur-md"
        >
          <Layers className="w-5 h-5 text-white" />
        </button>

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
