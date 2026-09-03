import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import ReportLocationButton from "@/components/ReportLocationButton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Navigation, MapPin, Locate, ExternalLink, Loader2, Signal, SignalZero, Shield, Pause, Crosshair, Layers, RotateCcw } from "lucide-react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { DEFAULT_CENTER, MAP_LAYERS, GOOGLE_MAPS_API_KEY } from "@/config/maps";
import { useAuth } from "@/contexts/AuthContext";
import { useGPSTracking } from "@/hooks/useGPSTracking";
import { resumeAudioContext } from "@/lib/notificationSound";

import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

const driverIcon = new L.Icon({
  iconUrl: "data:image/svg+xml," + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="%233b82f6" stroke="white" stroke-width="2"><circle cx="12" cy="12" r="10"/></svg>`
  ),
  iconSize: [24, 24],
  iconAnchor: [12, 12],
});

const destIcon = new L.Icon({
  iconUrl: "data:image/svg+xml," + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="%23e53935" stroke="white" stroke-width="1.5"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3" fill="white"/></svg>`
  ),
  iconSize: [32, 32],
  iconAnchor: [16, 32],
  popupAnchor: [0, -32],
});

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
  // Tracking data passed from parent
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

const DriverGPS = ({ activeRequest, pendingRequests = [], onAcceptRequest, trackingData }: DriverGPSProps) => {
  const { user } = useAuth();
  const {
    position: driverPosition,
    accuracy,
    heading,
    speed,
    watching,
    gpsQuality,
    sampleCount,
    isStationary,
    totalDistance,
    permissionStatus,
    errorStatus,
    startTracking,
    stopTracking,
  } = trackingData;

  const [autoFollow, setAutoFollow] = useState(true);
  const [mapType, setMapType] = useState<keyof typeof MAP_LAYERS>("streets");

  const mapRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const driverMarkerRef = useRef<L.Marker | null>(null);
  const accuracyCircleRef = useRef<L.Circle | null>(null);
  const destMarkerRef = useRef<L.Marker | null>(null);
  const routeLineRef = useRef<L.Polyline | null>(null);

  const openNavigation = (address: string, app: "google" | "waze") => {
    if (app === "waze") {
      window.open(`https://waze.com/ul?q=${encodeURIComponent(address)}&navigate=yes`, "_blank");
    } else {
      const prefix = driverPosition ? `${driverPosition.lat},${driverPosition.lng}/` : "";
      window.open(`https://www.google.com/maps/dir/${prefix}${encodeURIComponent(address)}`, "_blank");
    }
  };

  const currentDestination = activeRequest
    ? activeRequest.status === "accepted" ? activeRequest.pickup_address : activeRequest.delivery_address
    : null;

  const currentDestinationLabel = activeRequest
    ? activeRequest.status === "accepted" ? "📦 Coleta" : "🏠 Entrega"
    : null;

  const requestMarkers = pendingRequests
    .filter((r: any) => r.restaurants?.latitude && r.restaurants?.longitude)
    .map((r: any) => ({ id: r.id, lat: r.restaurants.latitude, lng: r.restaurants.longitude, name: r.restaurants.name }));

  const showMap = true; // Always show map frame
  const qc = qualityConfig[gpsQuality];

  // Initialize and update map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapRef.current) {
      const center: [number, number] = driverPosition
        ? [driverPosition.lat, driverPosition.lng]
        : requestMarkers.length > 0
          ? [requestMarkers[0].lat, requestMarkers[0].lng]
          : [DEFAULT_CENTER.lat, DEFAULT_CENTER.lng];

      const map = L.map(mapContainerRef.current).setView(center, 15);
      tileLayerRef.current = L.tileLayer(MAP_LAYERS[mapType].url, {
        attribution: MAP_LAYERS[mapType].attribution,
        maxZoom: mapType.includes("satellite") || mapType.includes("google") ? 20 : 19,
      }).addTo(map);
      map.on("dragstart", () => setAutoFollow(false));
      mapRef.current = map;
    }

    const map = mapRef.current;

    // Update tile layer if mapType changed
    if (tileLayerRef.current && map) {
      const currentUrl = MAP_LAYERS[mapType].url;
      if ((tileLayerRef.current as any)._url !== currentUrl) {
        map.removeLayer(tileLayerRef.current);
        tileLayerRef.current = L.tileLayer(currentUrl, {
          attribution: MAP_LAYERS[mapType].attribution,
          maxZoom: mapType.includes("satellite") || mapType.includes("google") ? 20 : 19,
        }).addTo(map);
      }
    }

    if (driverPosition) {
      if (driverMarkerRef.current) {
        driverMarkerRef.current.setLatLng([driverPosition.lat, driverPosition.lng]);
      } else {
        driverMarkerRef.current = L.marker([driverPosition.lat, driverPosition.lng], { icon: driverIcon })
          .addTo(map)
          .bindPopup("Você está aqui");
      }
      if (accuracyCircleRef.current) {
        accuracyCircleRef.current.setLatLng([driverPosition.lat, driverPosition.lng]).setRadius(accuracy);
      } else {
        accuracyCircleRef.current = L.circle([driverPosition.lat, driverPosition.lng], {
          radius: accuracy, fillColor: "#3b82f6", fillOpacity: 0.1, color: "#3b82f6", opacity: 0.3,
        }).addTo(map);
      }

      // Auto-follow: center on driver
      if (autoFollow) {
        map.setView([driverPosition.lat, driverPosition.lng], map.getZoom());
      }
    }

    // Update destination marker for active request
    if (destMarkerRef.current) {
      map.removeLayer(destMarkerRef.current);
      destMarkerRef.current = null;
    }
    if (routeLineRef.current) {
      map.removeLayer(routeLineRef.current);
      routeLineRef.current = null;
    }

    // If there's a restaurant location on the active request, show it
    if (activeRequest?.restaurants?.latitude && activeRequest?.restaurants?.longitude) {
      const destLat = activeRequest.restaurants.latitude;
      const destLng = activeRequest.restaurants.longitude;
      const label = activeRequest.status === "accepted" ? "📦 Coleta" : "🏠 Entrega";

      destMarkerRef.current = L.marker([destLat, destLng], { icon: destIcon })
        .addTo(map)
        .bindPopup(`<b>${label}</b><br/>${activeRequest.restaurants.name || ""}`);

      if (driverPosition) {
        routeLineRef.current = L.polyline(
          [[driverPosition.lat, driverPosition.lng], [destLat, destLng]],
          { color: "#e53935", weight: 3, dashArray: "8 4", opacity: 0.7 }
        ).addTo(map);
      }
    }

    // Pending request markers
    map.eachLayer((layer) => {
      if (layer instanceof L.Marker && layer !== driverMarkerRef.current && layer !== destMarkerRef.current) {
        map.removeLayer(layer);
      }
    });
    requestMarkers.forEach((m) => {
      L.marker([m.lat, m.lng]).addTo(map)
        .bindPopup(m.name)
        .on("click", () => onAcceptRequest?.(m.id));
    });
  }, [driverPosition, accuracy, requestMarkers.length, showMap, autoFollow, activeRequest?.id, activeRequest?.status, mapType]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        driverMarkerRef.current = null;
        accuracyCircleRef.current = null;
        destMarkerRef.current = null;
        routeLineRef.current = null;
      }
    };
  }, []);

  return (
    <div className="relative w-full h-full overflow-hidden flex flex-col">
      {/* Map Container */}
      <div className="flex-1 relative min-h-0">
        <div ref={mapContainerRef} className="w-full h-full z-0" />

        {/* Floating Controls - Top Right */}
        <div className="absolute top-4 right-4 z-[1000] flex flex-col gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              const types: (keyof typeof MAP_LAYERS)[] = ["streets", "google", "satellite"];
              const next = types[(types.indexOf(mapType) + 1) % types.length];
              setMapType(next);
            }}
            className="shadow-md gap-2 bg-white/90 backdrop-blur-sm hover:bg-white"
          >
            <Layers className="w-4 h-4" />
            <span className="hidden sm:inline">
              {mapType === "streets" ? "Ver Google" : mapType === "google" ? "Ver Satélite" : "Ver Ruas"}
            </span>
          </Button>

          <Button
            variant={autoFollow ? "default" : "secondary"}
            size="sm"
            onClick={() => setAutoFollow(!autoFollow)}
            className="shadow-md gap-2 bg-white/90 backdrop-blur-sm hover:bg-white"
          >
            <Crosshair className={`w-4 h-4 ${autoFollow ? "text-white" : ""}`} />
            <span className="hidden sm:inline">{autoFollow ? "Seguindo" : "Seguir Me"}</span>
          </Button>
          
          <Button
            variant="secondary"
            size="sm"
            onClick={startTracking}
            className="shadow-md gap-2 bg-white/90 backdrop-blur-sm hover:bg-white"
          >
            <RotateCcw className="w-4 h-4" />
            <span className="hidden sm:inline">Reiniciar</span>
          </Button>
        </div>

        {/* GPS Status Overlay - Top Left */}
        <div className="absolute top-4 left-4 z-[1000] max-w-[200px] sm:max-w-xs">
          <div className="bg-white/90 backdrop-blur-sm p-3 rounded-lg shadow-md border border-gray-200">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${watching ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
                <span className="text-xs font-bold uppercase tracking-wider">
                  GPS {watching ? 'Ativo' : 'Inativo'}
                </span>
              </div>
              {isStationary && watching && (
                <Badge variant="outline" className="text-[10px] h-4 px-1">Parado</Badge>
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
                  <span className={`font-bold ${qc.color}`}>{qc.icon} {qc.label}</span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-gray-500">Precisão:</span>
                  <span className={`font-bold ${accuracy <= 10 ? "text-green-600" : "text-yellow-600"}`}>±{Math.round(accuracy)}m</span>
                </div>
                {speed !== null && speed > 0 && (
                  <div className="flex justify-between text-[11px]">
                    <span className="text-gray-500">Velocidade:</span>
                    <span className="font-bold">{Math.round(speed * 3.6)} km/h</span>
                  </div>
                )}
                <div className="mt-2 flex gap-1">
                  {!watching ? (
                    <Button onClick={() => { resumeAudioContext(); startTracking(); }} size="sm" className="w-full h-7 text-[10px] px-2">
                      <Locate className="w-3 h-3 mr-1" /> Reativar
                    </Button>
                  ) : (
                    <Button onClick={stopTracking} variant="ghost" size="sm" className="w-full h-7 text-[10px] text-red-500 hover:text-red-700 hover:bg-red-50 px-2">
                      <Pause className="w-3 h-3 mr-1" /> Pausar
                    </Button>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 py-1">
                <Loader2 className="w-3 h-3 animate-spin text-primary" />
                <span className="text-[11px]">Buscando sinal...</span>
              </div>
            )}
            
            {errorStatus && (
              <div className="mt-2 text-[10px] text-red-500 font-medium leading-tight">
                ⚠️ {errorStatus}
              </div>
            )}
          </div>
        </div>

        {/* Navigation Overlay - Bottom */}
        {activeRequest && currentDestination && (
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-[1000] w-[90%] max-w-sm">
            <div className="bg-primary text-primary-foreground p-3 rounded-xl shadow-xl border border-primary-foreground/10 overflow-hidden">
              <div className="flex items-start gap-3">
                <div className="bg-white/20 p-2 rounded-lg">
                  <MapPin className="w-5 h-5 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] uppercase font-bold opacity-80">{currentDestinationLabel}</p>
                  <p className="text-sm font-semibold truncate leading-tight">{currentDestination}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 mt-3">
                <Button 
                  onClick={() => openNavigation(currentDestination, "google")} 
                  variant="secondary" 
                  size="sm" 
                  className="bg-white text-primary hover:bg-white/90 h-8 text-xs font-bold"
                >
                  <ExternalLink className="w-3 h-3 mr-1" /> Google Maps
                </Button>
                <Button 
                  onClick={() => openNavigation(currentDestination, "waze")} 
                  variant="secondary" 
                  size="sm" 
                  className="bg-white text-primary hover:bg-white/90 h-8 text-xs font-bold"
                >
                  <ExternalLink className="w-3 h-3 mr-1" /> Waze
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Manual Report Action (Hidden/Minimized or only shown if needed) */}
      {driverPosition && user?.id && (
        <div className="hidden">
           <ReportLocationButton
              latitude={driverPosition.lat}
              longitude={driverPosition.lng}
              userId={user.id}
            />
        </div>
      )}
    </div>
  );
};

export default DriverGPS;
