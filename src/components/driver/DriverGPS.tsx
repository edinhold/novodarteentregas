import { useEffect, useMemo, useState } from "react";
import ReportLocationButton from "@/components/ReportLocationButton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Navigation,
  ExternalLink,
  Signal,
  SignalZero,
  Shield,
  Crosshair,
  Layers,
  RotateCcw,
} from "lucide-react";
import {
  resolveStoreCoordinates,
  isWithinPrimaveraBounds,
  formatStorePickupAddress,
} from "@/config/maps";
import { calculateRoute } from "@/services/mapbox";
import { latLngArrayToLiteralPath, type LatLngLiteral } from "@/utils/googleMapsLoader";
import GoogleMapView from "@/components/maps/GoogleMapView";
import { useAuth } from "@/contexts/AuthContext";
import { resumeAudioContext } from "@/lib/notificationSound";

const qualityConfig = {
  excellent: { color: "text-green-600", label: "Excelente", icon: "🟢" },
  good: { color: "text-green-500", label: "Boa", icon: "🟡" },
  fair: { color: "text-yellow-600", label: "Regular", icon: "🟠" },
  poor: { color: "text-red-500", label: "Fraca", icon: "🔴" },
};

interface DriverGPSProps {
  activeRequest?: any;
  pendingRequests?: any[];
  onAcceptRequest?: (id: string) => void;
  trackingData: {
    position: { lat: number; lng: number } | null;
    accuracy: number;
    heading: number | null;
    speed: number | null;
    watching: boolean;
    gpsQuality: "excellent" | "good" | "fair" | "poor";
    sampleCount: number;
    isStationary: boolean;
    totalDistance: number;
    permissionStatus: string;
    errorStatus: string | null;
    startTracking: () => void;
    stopTracking: () => void;
  };
}

const DriverGPS = ({
  activeRequest,
  pendingRequests = [],
  onAcceptRequest,
  trackingData,
}: DriverGPSProps) => {
  const { user } = useAuth();
  const {
    position: driverPosition,
    accuracy,
    gpsQuality,
    isStationary,
    permissionStatus,
    watching,
    heading,
    startTracking,
  } = trackingData;

  const [autoFollow, setAutoFollow] = useState(true);
  const [mapMode, setMapMode] = useState<"roadmap" | "satellite">("roadmap");
  const [routePath, setRoutePath] = useState<LatLngLiteral[]>([]);
  const [recenterTrigger, setRecenterTrigger] = useState(0);

  const openNavigation = (
    address: string,
    app: "google" | "waze",
    coords?: { lat: number; lng: number } | null
  ) => {
    const formattedAddress =
      address && !address.includes("Primavera do Leste")
        ? `${address}, Primavera do Leste - MT, Brasil`
        : address || "Primavera do Leste - MT, Brasil";

    if (app === "waze") {
      if (coords && coords.lat && coords.lng) {
        window.open(`https://waze.com/ul?ll=${coords.lat},${coords.lng}&navigate=yes`, "_blank");
      } else {
        window.open(`https://waze.com/ul?q=${encodeURIComponent(formattedAddress)}&navigate=yes`, "_blank");
      }
    } else {
      if (coords && coords.lat && coords.lng) {
        window.open(
          `https://www.google.com/maps/dir/?api=1&destination=${coords.lat},${coords.lng}&travelmode=driving`,
          "_blank"
        );
      } else {
        window.open(
          `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(formattedAddress)}&travelmode=driving`,
          "_blank"
        );
      }
    }
  };

  const isPickupPhase = activeRequest?.status === "accepted";

  const activeDestCoords = useMemo(() => {
    if (!activeRequest) return null;
    if (isPickupPhase) {
      return resolveStoreCoordinates(
        activeRequest.restaurants,
        activeRequest.pickup_lat,
        activeRequest.pickup_lng
      );
    }
    if (isWithinPrimaveraBounds(activeRequest.delivery_lat, activeRequest.delivery_lng)) {
      return {
        lat: Number(activeRequest.delivery_lat),
        lng: Number(activeRequest.delivery_lng),
      };
    }
    return null;
  }, [activeRequest, isPickupPhase]);

  // Calcula rota viária usando exclusivamente Mapbox Directions API
  useEffect(() => {
    if (!driverPosition || !activeDestCoords) {
      setRoutePath([]);
      return;
    }

    let cancelled = false;
    calculateRoute(driverPosition, activeDestCoords, { profile: "driving" })
      .then((res) => {
        if (cancelled) return;
        if (res?.geometry && res.geometry.length > 0) {
          setRoutePath(latLngArrayToLiteralPath(res.geometry));
        } else {
          setRoutePath([driverPosition, activeDestCoords]);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setRoutePath([driverPosition, activeDestCoords]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [driverPosition?.lat, driverPosition?.lng, activeDestCoords?.lat, activeDestCoords?.lng]);

  const pendingMarkers = useMemo(
    () =>
      pendingRequests
        .filter((r) => !activeRequest || r.id !== activeRequest.id)
        .map((r) => {
          const coords = resolveStoreCoordinates(r.restaurants, r.pickup_lat, r.pickup_lng);
          return {
            id: r.id,
            lat: coords.lat,
            lng: coords.lng,
            title: r.restaurants?.name || "Nova Entrega",
            color: "#F59E0B",
            onClick: () => onAcceptRequest?.(r.id),
          };
        }),
    [pendingRequests, activeRequest, onAcceptRequest]
  );

  const qc = qualityConfig[gpsQuality] || qualityConfig.good;

  return (
    <div className="relative w-full h-full overflow-hidden flex flex-col">
      <div className="flex-1 relative min-h-0">
        <GoogleMapView
          origin={
            activeRequest
              ? resolveStoreCoordinates(
                  activeRequest.restaurants,
                  activeRequest.pickup_lat,
                  activeRequest.pickup_lng
                )
              : null
          }
          stops={
            activeDestCoords
              ? [
                  {
                    id: "active-gps-dest",
                    lat: activeDestCoords.lat,
                    lng: activeDestCoords.lng,
                    label: isPickupPhase
                      ? `Coleta: ${activeRequest?.restaurants?.name || "Loja"}`
                      : `Entrega: ${activeRequest?.delivery_address || "Destino"}`,
                  },
                ]
              : []
          }
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
          extraMarkers={pendingMarkers}
          routePath={routePath}
          routeColor="#3b82f6"
          routeWeight={5}
          mapType={mapMode === "satellite" ? "hybrid" : "roadmap"}
          autoFitBounds={!autoFollow || !!activeDestCoords}
          center={autoFollow ? driverPosition : null}
          zoom={16}
          recenterTrigger={recenterTrigger}
          onUserInteract={() => setAutoFollow(false)}
          className="w-full h-full"
        />

        {/* Floating Controls - Top Right */}
        <div className="absolute top-4 right-4 z-[1000] flex flex-col gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setMapMode((m) => (m === "roadmap" ? "satellite" : "roadmap"))}
            className="shadow-md gap-2 bg-white/90 backdrop-blur-sm hover:bg-white text-zinc-900"
          >
            <Layers className="w-4 h-4" />
            <span className="hidden sm:inline">
              {mapMode === "roadmap" ? "Ver Satélite" : "Ver Ruas"}
            </span>
          </Button>

          <Button
            variant={autoFollow ? "default" : "secondary"}
            size="sm"
            onClick={() => {
              setAutoFollow((v) => !v);
              setRecenterTrigger((p) => p + 1);
            }}
            className="shadow-md gap-2 bg-white/90 backdrop-blur-sm hover:bg-white text-zinc-900"
          >
            <Crosshair className="w-4 h-4" />
            <span className="hidden sm:inline">{autoFollow ? "Seguindo" : "Seguir Me"}</span>
          </Button>

          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              resumeAudioContext();
              startTracking();
            }}
            className="shadow-md gap-2 bg-white/90 backdrop-blur-sm hover:bg-white text-zinc-900"
          >
            <RotateCcw className="w-4 h-4" />
            <span className="hidden sm:inline">Reiniciar</span>
          </Button>
        </div>

        {/* GPS Status Overlay - Top Left */}
        <div className="absolute top-4 left-4 z-[1000] max-w-[200px] sm:max-w-xs">
          <div className="bg-white/90 backdrop-blur-sm p-3 rounded-lg shadow-md border border-gray-200 text-zinc-900">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                {watching ? (
                  <Signal className="w-3.5 h-3.5 text-green-600 animate-pulse" />
                ) : (
                  <SignalZero className="w-3.5 h-3.5 text-red-500" />
                )}
                <span className="text-xs font-bold uppercase tracking-wider">
                  GPS {watching ? "Ativo" : "Inativo"}
                </span>
              </div>
              {isStationary && watching && (
                <Badge variant="outline" className="text-[10px] h-4 px-1">
                  Parado
                </Badge>
              )}
            </div>

            {permissionStatus === "denied" && (
              <div className="bg-red-50 text-red-600 p-2 rounded text-[10px] mb-2 flex items-center gap-1">
                <Shield className="w-3 h-3" />
                <span>Acesso negado. Ative no navegador.</span>
              </div>
            )}

            {driverPosition ? (
              <div className="space-y-1">
                <div className="flex justify-between text-[11px]">
                  <span className="text-gray-500">Qualidade:</span>
                  <span className={`font-bold ${qc.color}`}>
                    {qc.icon} {qc.label}
                  </span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-gray-500">Precisão:</span>
                  <span className="font-mono font-semibold">±{Math.round(accuracy)}m</span>
                </div>
              </div>
            ) : (
              <p className="text-[11px] text-gray-500">Aguardando sinal de GPS...</p>
            )}
          </div>
        </div>

        {/* Active Request Navigation Bar */}
        {activeRequest && (
          <div className="absolute bottom-4 left-4 right-4 z-[1000] bg-white/95 backdrop-blur-md p-3 rounded-xl shadow-lg border border-gray-200 flex flex-wrap items-center justify-between gap-2 text-zinc-900">
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold uppercase text-primary">
                {isPickupPhase ? "Ir para coleta" : "Ir para entrega"}
              </p>
              <p className="text-xs font-semibold truncate">
                {isPickupPhase
                  ? formatStorePickupAddress(activeRequest.restaurants, activeRequest.pickup_address)
                  : activeRequest.delivery_address}
              </p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  openNavigation(
                    isPickupPhase
                      ? formatStorePickupAddress(activeRequest.restaurants, activeRequest.pickup_address)
                      : activeRequest.delivery_address,
                    "waze",
                    activeDestCoords
                  )
                }
                className="h-8 text-xs gap-1"
              >
                <Navigation className="w-3.5 h-3.5" /> Waze
              </Button>
              <Button
                size="sm"
                onClick={() =>
                  openNavigation(
                    isPickupPhase
                      ? formatStorePickupAddress(activeRequest.restaurants, activeRequest.pickup_address)
                      : activeRequest.delivery_address,
                    "google",
                    activeDestCoords
                  )
                }
                className="h-8 text-xs gap-1"
              >
                <ExternalLink className="w-3.5 h-3.5" /> Maps
              </Button>
              {activeDestCoords && user?.id && (
                <ReportLocationButton
                  latitude={activeDestCoords.lat}
                  longitude={activeDestCoords.lng}
                  address={
                    isPickupPhase ? activeRequest.pickup_address : activeRequest.delivery_address
                  }
                />
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default DriverGPS;
