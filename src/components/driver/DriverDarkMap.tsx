import React, { useEffect, useMemo, useRef, useState } from "react";
import { Crosshair, Layers } from "lucide-react";
import { DEFAULT_CENTER } from "@/config/maps";
import { calculateRoute } from "@/services/mapbox";
import { latLngArrayToLiteralPath, type LatLngLiteral } from "@/utils/mapCoordinates";
import MapLibreView from "@/components/maps/MapLibreView";

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

type VisualMapMode = "dark" | "roadmap" | "3d" | "satellite";

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
  const lastRouteOriginRef = useRef<{ lat: number; lng: number } | null>(null);
  const lastRouteDestRef = useRef<{ lat: number; lng: number } | null>(null);
  const currentRoutePointsRef = useRef<LatLngLiteral[]>([]);
  const routeRequestIdRef = useRef<number>(0);

  const [routePath, setRoutePath] = useState<LatLngLiteral[]>([]);
  const [autoFollow, setAutoFollow] = useState(true);
  const [mapMode, setMapMode] = useState<VisualMapMode>(() =>
    typeof document !== "undefined" && document.documentElement.classList.contains("dark")
      ? "dark"
      : "roadmap"
  );
  const [recenterTrigger, setRecenterTrigger] = useState(0);

  useEffect(() => {
    const onThemeChange = () => {
      const isDark = document.documentElement.classList.contains("dark");
      setMapMode(isDark ? "dark" : "roadmap");
    };
    window.addEventListener("theme-change", onThemeChange);
    return () => window.removeEventListener("theme-change", onThemeChange);
  }, []);

  // Calcula a rota contínua via Mapbox Directions API e converte para { lat, lng }[]
  useEffect(() => {
    const targetDestination =
      activeStatus === "picked_up" && deliveryLocation
        ? deliveryLocation
        : pickupLocation || deliveryLocation;

    if (!hasActiveDelivery || !driverPosition || !targetDestination) {
      setRoutePath([]);
      currentRoutePointsRef.current = [];
      lastRouteOriginRef.current = null;
      lastRouteDestRef.current = null;
      return;
    }

    const calcDistMeters = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
      const R = 6371000;
      const dLat = ((b.lat - a.lat) * Math.PI) / 180;
      const dLon = ((b.lng - a.lng) * Math.PI) / 180;
      const lat1 = (a.lat * Math.PI) / 180;
      const lat2 = (b.lat * Math.PI) / 180;
      const h =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
      return 2 * R * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
    };

    const destChanged =
      !lastRouteDestRef.current ||
      calcDistMeters(lastRouteDestRef.current, targetDestination) > 15;

    const driverMovedFar =
      !lastRouteOriginRef.current ||
      calcDistMeters(lastRouteOriginRef.current, driverPosition) > 25;

    if (currentRoutePointsRef.current.length > 0 && !destChanged && !driverMovedFar) {
      const updatedPoints: LatLngLiteral[] = [
        { lat: driverPosition.lat, lng: driverPosition.lng },
        ...currentRoutePointsRef.current.slice(1),
      ];
      currentRoutePointsRef.current = updatedPoints;
      setRoutePath(updatedPoints);
      return;
    }

    let isCancelled = false;
    const requestId = ++routeRequestIdRef.current;
    const controller = new AbortController();

    const updateRoute = async () => {
      try {
        const res = await calculateRoute(
          { lat: driverPosition.lat, lng: driverPosition.lng },
          { lat: targetDestination.lat, lng: targetDestination.lng },
          { profile: "driving", signal: controller.signal }
        );

        if (isCancelled || requestId !== routeRequestIdRef.current) return;

        const points: LatLngLiteral[] =
          res?.geometry && res.geometry.length > 0
            ? latLngArrayToLiteralPath(res.geometry)
            : [
                { lat: driverPosition.lat, lng: driverPosition.lng },
                { lat: targetDestination.lat, lng: targetDestination.lng },
              ];

        currentRoutePointsRef.current = points;
        lastRouteOriginRef.current = { lat: driverPosition.lat, lng: driverPosition.lng };
        lastRouteDestRef.current = { lat: targetDestination.lat, lng: targetDestination.lng };
        setRoutePath(points);
      } catch {
        if (isCancelled || requestId !== routeRequestIdRef.current) return;
        const fallbackPoints: LatLngLiteral[] = [
          { lat: driverPosition.lat, lng: driverPosition.lng },
          { lat: targetDestination.lat, lng: targetDestination.lng },
        ];
        setRoutePath(fallbackPoints);
      }
    };

    updateRoute();

    return () => {
      isCancelled = true;
      controller.abort();
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

  const extraMarkers = useMemo(
    () =>
      pendingLocations.map((loc) => ({
        id: loc.id,
        lat: loc.lat,
        lng: loc.lng,
        title: loc.name || "Nova Entrega",
        color: "#0ea5e9",
        onClick: () => onSelectPending?.(loc.id),
      })),
    [pendingLocations, onSelectPending]
  );

  const stops = useMemo(
    () =>
      deliveryLocation
        ? [
            {
              id: "driver-delivery-stop",
              lat: deliveryLocation.lat,
              lng: deliveryLocation.lng,
              label: deliveryLocation.address || "Destino da Entrega",
            },
          ]
        : [],
    [deliveryLocation]
  );

  const handleRecenter = () => {
    setAutoFollow(true);
    setRecenterTrigger((prev) => prev + 1);
  };

  return (
    <div className="absolute inset-0 w-full h-full z-0 overflow-hidden bg-background">
      <MapLibreView
        origin={
          pickupLocation
            ? {
                lat: pickupLocation.lat,
                lng: pickupLocation.lng,
                name: pickupLocation.name || "Coleta / Loja",
              }
            : null
        }
        stops={stops}
        driverPosition={
          driverPosition
            ? {
                lat: driverPosition.lat,
                lng: driverPosition.lng,
                heading,
                label: "Sua posição",
              }
            : null
        }
        extraMarkers={extraMarkers}
        routePath={routePath}
        routeColor="#0ea5e9"
        routeWeight={5}
        darkMode={mapMode === "dark" || mapMode === "3d"}
        mapType={mapMode === "satellite" ? "satellite" : "roadmap"}
        pitch={mapMode === "3d" ? 55 : mapMode === "satellite" ? 30 : 0}
        autoFitBounds={!autoFollow || hasActiveDelivery}
        center={autoFollow ? driverPosition || pickupLocation || DEFAULT_CENTER : DEFAULT_CENTER}
        zoom={14}
        fitPadding={60}
        recenterTrigger={recenterTrigger}
        onUserInteract={() => setAutoFollow(false)}
        className="w-full h-full"
      />

      {/* Botões Flutuantes: Alternar Camadas e Recentralizar Mira */}
      <div
        className={`absolute right-4 z-20 flex flex-col gap-2.5 pointer-events-auto transition-all duration-300 ease-in-out ${
          isBottomCardCollapsed ? "bottom-[75px]" : "bottom-[235px] sm:bottom-[245px]"
        }`}
      >
        <button
          type="button"
          onClick={() => {
            const modes: VisualMapMode[] = ["dark", "roadmap", "3d", "satellite"];
            setMapMode(modes[(modes.indexOf(mapMode) + 1) % modes.length]);
          }}
          aria-label="Alternar tipo de mapa"
          title={`Modo atual: ${
            mapMode === "dark"
              ? "Escuro"
              : mapMode === "roadmap"
              ? "Claro"
              : mapMode === "3d"
              ? "3D"
              : "Satélite"
          }`}
          className="w-12 h-12 rounded-full bg-[#18181b]/95 hover:bg-zinc-800 text-white border border-white/15 shadow-2xl flex flex-col items-center justify-center transition active:scale-95 backdrop-blur-md"
        >
          <Layers className="w-4 h-4 text-white" />
          <span className="text-[9px] font-bold uppercase tracking-tight leading-none mt-0.5 text-sky-400">
            {mapMode === "dark" ? "Esc" : mapMode === "roadmap" ? "Cla" : mapMode === "3d" ? "3D" : "Sat"}
          </span>
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
