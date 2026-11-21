import React, { useEffect, useRef, useState } from "react";
import L from "leaflet";
import { DEFAULT_CENTER, MAP_LAYERS } from "@/config/maps";
import { isValidCoordinate } from "@/utils/geolocation";
import {
  geoJsonGeometryToLatLngPath,
  hasGoogleMapsAuthFailed,
  loadGoogleMapsScript,
  onGoogleMapsAuthFailure,
  type LatLngLiteral,
} from "@/utils/googleMapsLoader";

export interface GoogleMapOrigin {
  lat: number;
  lng: number;
  name?: string;
  infoHtml?: string;
  draggable?: boolean;
  onDragEnd?: (lat: number, lng: number) => void;
}

export interface GoogleMapStop {
  id?: string;
  lat: number;
  lng: number;
  label?: string;
  number?: number;
  infoHtml?: string;
  draggable?: boolean;
  onDragEnd?: (lat: number, lng: number) => void;
}

export interface GoogleMapDriverPosition {
  lat: number;
  lng: number;
  heading?: number | null;
  label?: string;
  infoHtml?: string;
}

export interface GoogleMapExtraMarker {
  id: string;
  lat: number;
  lng: number;
  title?: string;
  color?: string;
  label?: string;
  infoHtml?: string;
  onClick?: () => void;
}

export interface GoogleMapViewProps {
  origin?: GoogleMapOrigin | null;
  stops?: GoogleMapStop[];
  driverPosition?: GoogleMapDriverPosition | null;
  extraMarkers?: GoogleMapExtraMarker[];
  /** Caminho já em { lat, lng }[] */
  routePath?: LatLngLiteral[];
  /** Geometria GeoJSON vinda diretamente do Mapbox Directions ([lng, lat][]) */
  geoJsonRoute?: Array<[number, number]>;
  routeColor?: string;
  routeWeight?: number;
  routeDashed?: boolean;
  darkMode?: boolean;
  mapType?: "roadmap" | "satellite" | "hybrid";
  center?: LatLngLiteral | null;
  zoom?: number;
  autoFitBounds?: boolean;
  fitPadding?: number;
  recenterTrigger?: number;
  onMapClick?: (lat: number, lng: number) => void;
  onUserInteract?: () => void;
  onMapReady?: (map: any) => void;
  className?: string;
}

const DARK_MAP_STYLES = [
  { elementType: "geometry", stylers: [{ color: "#1d222b" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#1d222b" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#8e99a8" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#2c3442" }] },
  { featureType: "road.arterial", elementType: "geometry", stylers: [{ color: "#364152" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#435066" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#11161d" }] },
  { featureType: "poi", elementType: "labels", stylers: [{ visibility: "off" }] },
];

function createSvgIcon(maps: any, svg: string, width: number, height: number, anchorX?: number, anchorY?: number) {
  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    scaledSize: new maps.Size(width, height),
    anchor: new maps.Point(anchorX ?? width / 2, anchorY ?? height / 2),
  };
}

function getOriginIcon(maps: any) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
    <circle cx="16" cy="16" r="14" fill="#10B981" fill-opacity="0.22"/>
    <circle cx="16" cy="16" r="10" fill="#10B981" stroke="#FFFFFF" stroke-width="2.5"/>
    <circle cx="16" cy="16" r="3.5" fill="#FFFFFF"/>
  </svg>`;
  return createSvgIcon(maps, svg, 32, 32, 16, 16);
}

function getStopIcon(maps: any, stopNumber?: number) {
  const labelText =
    stopNumber != null && stopNumber > 0
      ? `<text x="17" y="19" text-anchor="middle" fill="#FFFFFF" font-family="Arial,sans-serif" font-size="12" font-weight="bold">${stopNumber}</text>`
      : `<circle cx="17" cy="15" r="4.5" fill="#FFFFFF"/>`;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="34" height="42" viewBox="0 0 34 42">
    <path d="M17 1C8.16 1 1 8.16 1 17C1 29.2 17 41 17 41C17 41 33 29.2 33 17C33 8.16 25.84 1 17 1Z" fill="#2563EB" stroke="#FFFFFF" stroke-width="2"/>
    ${labelText}
  </svg>`;
  return createSvgIcon(maps, svg, 32, 40, 16, 40);
}

function getDriverIcon(maps: any, heading?: number | null) {
  const rot = heading != null && Number.isFinite(heading) ? heading : 0;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="38" height="38" viewBox="0 0 38 38">
    <circle cx="19" cy="19" r="17" fill="#EA580C" fill-opacity="0.25"/>
    <circle cx="19" cy="19" r="13" fill="#EA580C" stroke="#FFFFFF" stroke-width="2.5"/>
    <g transform="rotate(${rot} 19 19)">
      <polygon points="19,9 25,25 19,21.5 13,25" fill="#FFFFFF"/>
    </g>
  </svg>`;
  return createSvgIcon(maps, svg, 38, 38, 19, 19);
}

function getExtraMarkerIcon(maps: any, color = "#F59E0B") {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 26 26">
    <circle cx="13" cy="13" r="11" fill="${color}" fill-opacity="0.22"/>
    <circle cx="13" cy="13" r="7.5" fill="${color}" stroke="#FFFFFF" stroke-width="2"/>
  </svg>`;
  return createSvgIcon(maps, svg, 26, 26, 13, 13);
}

export const GoogleMapView: React.FC<GoogleMapViewProps> = ({
  origin,
  stops = [],
  driverPosition,
  extraMarkers = [],
  routePath,
  geoJsonRoute,
  routeColor = "#EA580C",
  routeWeight = 5,
  routeDashed = false,
  darkMode = false,
  mapType = "roadmap",
  center,
  zoom = 14,
  autoFitBounds = true,
  fitPadding = 48,
  recenterTrigger = 0,
  onMapClick,
  onUserInteract,
  onMapReady,
  className = "w-full h-full",
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapsApiRef = useRef<any>(null);
  const mapInstanceRef = useRef<any>(null);
  const infoWindowRef = useRef<any>(null);

  const originMarkerRef = useRef<any>(null);
  const stopMarkersRef = useRef<any[]>([]);
  const driverMarkerRef = useRef<any>(null);
  const extraMarkersRef = useRef<any[]>([]);
  const polylineRef = useRef<any>(null);

  const onMapClickRef = useRef(onMapClick);
  const onUserInteractRef = useRef(onUserInteract);
  onMapClickRef.current = onMapClick;
  onUserInteractRef.current = onUserInteract;

  const [loadError, setLoadError] = useState<string | null>(() =>
    hasGoogleMapsAuthFailed() ? "Falha de autenticação do Google Maps." : null
  );
  const [mapReadyState, setMapReadyState] = useState(false);

  // Escuta falhas de autenticação em tempo de execução (gm_authFailure -> "Ops! Algo deu errado")
  useEffect(() => {
    return onGoogleMapsAuthFailure(() => {
      setLoadError("Falha de autenticação do Google Maps (gm_authFailure).");
    });
  }, []);

  // 1. Inicialização do Google Map
  useEffect(() => {
    let cancelled = false;
    if (!containerRef.current) return;

    loadGoogleMapsScript()
      .then((maps) => {
        if (cancelled || !containerRef.current) return;
        mapsApiRef.current = maps;

        const initialCenter =
          center && isValidCoordinate(center.lat, center.lng)
            ? center
            : driverPosition && isValidCoordinate(driverPosition.lat, driverPosition.lng)
              ? { lat: driverPosition.lat, lng: driverPosition.lng }
              : origin && isValidCoordinate(origin.lat, origin.lng)
                ? { lat: origin.lat, lng: origin.lng }
                : DEFAULT_CENTER;

        const map = new maps.Map(containerRef.current, {
          center: initialCenter,
          zoom,
          mapTypeId: mapType,
          disableDefaultUI: true,
          zoomControl: false,
          streetViewControl: false,
          mapTypeControl: false,
          fullscreenControl: false,
          clickableIcons: false,
          gestureHandling: "greedy",
          styles: darkMode ? DARK_MAP_STYLES : undefined,
        });

        infoWindowRef.current = new maps.InfoWindow();
        mapInstanceRef.current = map;

        map.addListener("click", (e: any) => {
          if (onMapClickRef.current && e?.latLng) {
            onMapClickRef.current(e.latLng.lat(), e.latLng.lng());
          }
        });

        map.addListener("dragstart", () => {
          onUserInteractRef.current?.();
        });

        setLoadError(null);
        setMapReadyState(true);
        onMapReady?.(map);
      })
      .catch((err: any) => {
        if (!cancelled) {
          console.warn("[GoogleMapView] Falha ao inicializar Google Maps:", err);
          setLoadError(err?.message || "Erro ao carregar Google Maps");
        }
      });

    return () => {
      cancelled = true;
      if (originMarkerRef.current) originMarkerRef.current.setMap(null);
      stopMarkersRef.current.forEach((m) => m.setMap(null));
      if (driverMarkerRef.current) driverMarkerRef.current.setMap(null);
      extraMarkersRef.current.forEach((m) => m.setMap(null));
      if (polylineRef.current) polylineRef.current.setMap(null);
      originMarkerRef.current = null;
      stopMarkersRef.current = [];
      driverMarkerRef.current = null;
      extraMarkersRef.current = [];
      polylineRef.current = null;
      mapInstanceRef.current = null;
      setMapReadyState(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 2. Atualiza tipo de mapa e tema escuro dinamicamente
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !mapReadyState) return;
    map.setMapTypeId(mapType);
    map.setOptions({ styles: darkMode && mapType === "roadmap" ? DARK_MAP_STYLES : null });
  }, [mapType, darkMode, mapReadyState]);

  // 3. Atualiza marcador da Origem (Loja)
  useEffect(() => {
    const map = mapInstanceRef.current;
    const maps = mapsApiRef.current;
    if (!map || !maps || !mapReadyState) return;

    if (origin && isValidCoordinate(origin.lat, origin.lng)) {
      const pos = { lat: origin.lat, lng: origin.lng };
      if (!originMarkerRef.current) {
        originMarkerRef.current = new maps.Marker({
          map,
          position: pos,
          icon: getOriginIcon(maps),
          title: origin.name || "Loja / Coleta",
          draggable: !!origin.draggable,
          zIndex: 20,
        });
      } else {
        originMarkerRef.current.setPosition(pos);
        originMarkerRef.current.setTitle(origin.name || "Loja / Coleta");
        originMarkerRef.current.setDraggable(!!origin.draggable);
      }

      maps.event.clearListeners(originMarkerRef.current, "dragend");
      if (origin.draggable && origin.onDragEnd) {
        originMarkerRef.current.addListener("dragend", (e: any) => {
          if (e?.latLng) origin.onDragEnd?.(e.latLng.lat(), e.latLng.lng());
        });
      }

      maps.event.clearListeners(originMarkerRef.current, "click");
      if (origin.infoHtml || origin.name) {
        originMarkerRef.current.addListener("click", () => {
          infoWindowRef.current?.setContent(
            origin.infoHtml || `<div style="color:#111;font-size:12px;"><b>🏪 ${origin.name || "Loja"}</b></div>`
          );
          infoWindowRef.current?.open(map, originMarkerRef.current);
        });
      }
    } else if (originMarkerRef.current) {
      originMarkerRef.current.setMap(null);
      originMarkerRef.current = null;
    }
  }, [origin, mapReadyState]);

  // 4. Atualiza marcadores de Destinos / Paradas
  useEffect(() => {
    const map = mapInstanceRef.current;
    const maps = mapsApiRef.current;
    if (!map || !maps || !mapReadyState) return;

    stopMarkersRef.current.forEach((m) => m.setMap(null));
    stopMarkersRef.current = [];

    stops.forEach((stop, idx) => {
      if (!isValidCoordinate(stop.lat, stop.lng)) return;
      const marker = new maps.Marker({
        map,
        position: { lat: stop.lat, lng: stop.lng },
        icon: getStopIcon(maps, stop.number ?? (stops.length > 1 ? idx + 1 : undefined)),
        title: stop.label || `Entrega ${idx + 1}`,
        draggable: !!stop.draggable,
        zIndex: 25,
      });

      if (stop.draggable && stop.onDragEnd) {
        marker.addListener("dragend", (e: any) => {
          if (e?.latLng) stop.onDragEnd?.(e.latLng.lat(), e.latLng.lng());
        });
      }

      if (stop.infoHtml || stop.label) {
        marker.addListener("click", () => {
          infoWindowRef.current?.setContent(
            stop.infoHtml || `<div style="color:#111;font-size:12px;"><b>📍 ${stop.label || "Destino"}</b></div>`
          );
          infoWindowRef.current?.open(map, marker);
        });
      }

      stopMarkersRef.current.push(marker);
    });
  }, [stops, mapReadyState]);

  // 5. Atualiza marcador do Motorista em tempo real (sem recriar / sem piscar)
  useEffect(() => {
    const map = mapInstanceRef.current;
    const maps = mapsApiRef.current;
    if (!map || !maps || !mapReadyState) return;

    if (driverPosition && isValidCoordinate(driverPosition.lat, driverPosition.lng)) {
      const pos = { lat: driverPosition.lat, lng: driverPosition.lng };
      const icon = getDriverIcon(maps, driverPosition.heading);
      if (!driverMarkerRef.current) {
        driverMarkerRef.current = new maps.Marker({
          map,
          position: pos,
          icon,
          title: driverPosition.label || "Motorista",
          zIndex: 40,
        });
      } else {
        driverMarkerRef.current.setPosition(pos);
        driverMarkerRef.current.setIcon(icon);
      }

      maps.event.clearListeners(driverMarkerRef.current, "click");
      if (driverPosition.infoHtml || driverPosition.label) {
        driverMarkerRef.current.addListener("click", () => {
          infoWindowRef.current?.setContent(
            driverPosition.infoHtml ||
            `<div style="color:#111;font-size:12px;"><b>🛵 ${driverPosition.label || "Motorista"}</b></div>`
          );
          infoWindowRef.current?.open(map, driverMarkerRef.current);
        });
      }
    } else if (driverMarkerRef.current) {
      driverMarkerRef.current.setMap(null);
      driverMarkerRef.current = null;
    }
  }, [driverPosition, mapReadyState]);

  // 6. Atualiza marcadores extras (motoristas próximos ou pedidos pendentes)
  useEffect(() => {
    const map = mapInstanceRef.current;
    const maps = mapsApiRef.current;
    if (!map || !maps || !mapReadyState) return;

    extraMarkersRef.current.forEach((m) => m.setMap(null));
    extraMarkersRef.current = [];

    extraMarkers.forEach((item) => {
      if (!isValidCoordinate(item.lat, item.lng)) return;
      const marker = new maps.Marker({
        map,
        position: { lat: item.lat, lng: item.lng },
        icon: getExtraMarkerIcon(maps, item.color || "#F59E0B"),
        title: item.title || item.label || "",
        zIndex: 15,
      });

      marker.addListener("click", () => {
        if (item.infoHtml) {
          infoWindowRef.current?.setContent(item.infoHtml);
          infoWindowRef.current?.open(map, marker);
        }
        item.onClick?.();
      });

      extraMarkersRef.current.push(marker);
    });
  }, [extraMarkers, mapReadyState]);

  // 7. Atualiza Polyline da rota (Mapbox Directions convertido para { lat, lng }[])
  useEffect(() => {
    const map = mapInstanceRef.current;
    const maps = mapsApiRef.current;
    if (!map || !maps || !mapReadyState) return;

    const resolvedPath: LatLngLiteral[] =
      routePath && routePath.length > 0
        ? routePath
        : geoJsonRoute && geoJsonRoute.length > 0
          ? geoJsonGeometryToLatLngPath(geoJsonRoute)
          : [];

    if (polylineRef.current) {
      polylineRef.current.setMap(null);
      polylineRef.current = null;
    }

    if (resolvedPath.length >= 2) {
      const polylineOptions: Record<string, any> = {
        map,
        path: resolvedPath,
        strokeColor: routeColor,
        strokeOpacity: routeDashed ? 0 : 0.9,
        strokeWeight: routeWeight,
        zIndex: 10,
      };

      if (routeDashed) {
        polylineOptions.icons = [
          {
            icon: {
              path: "M 0,-1 0,1",
              strokeOpacity: 0.85,
              scale: 3,
              strokeColor: routeColor,
            },
            offset: "0",
            repeat: "14px",
          },
        ];
      }

      polylineRef.current = new maps.Polyline(polylineOptions);
    }
  }, [routePath, geoJsonRoute, routeColor, routeWeight, routeDashed, mapReadyState]);

  // 8. Enquadramento automático (LatLngBounds) ou centralização explícita
  useEffect(() => {
    const map = mapInstanceRef.current;
    const maps = mapsApiRef.current;
    if (!map || !maps || !mapReadyState) return;

    if (autoFitBounds) {
      const bounds = new maps.LatLngBounds();
      let pointsCount = 0;

      if (origin && isValidCoordinate(origin.lat, origin.lng)) {
        bounds.extend({ lat: origin.lat, lng: origin.lng });
        pointsCount++;
      }
      stops.forEach((s) => {
        if (isValidCoordinate(s.lat, s.lng)) {
          bounds.extend({ lat: s.lat, lng: s.lng });
          pointsCount++;
        }
      });
      if (driverPosition && isValidCoordinate(driverPosition.lat, driverPosition.lng)) {
        bounds.extend({ lat: driverPosition.lat, lng: driverPosition.lng });
        pointsCount++;
      }

      if (pointsCount >= 2) {
        map.fitBounds(bounds, fitPadding);
        return;
      }
      if (pointsCount === 1) {
        const single =
          driverPosition && isValidCoordinate(driverPosition.lat, driverPosition.lng)
            ? { lat: driverPosition.lat, lng: driverPosition.lng }
            : stops[0] && isValidCoordinate(stops[0].lat, stops[0].lng)
              ? { lat: stops[0].lat, lng: stops[0].lng }
              : origin && isValidCoordinate(origin.lat, origin.lng)
                ? { lat: origin.lat, lng: origin.lng }
                : DEFAULT_CENTER;
        map.panTo(single);
        return;
      }
    }

    if (center && isValidCoordinate(center.lat, center.lng)) {
      map.panTo(center);
    }
  }, [
    origin,
    stops,
    driverPosition,
    autoFitBounds,
    fitPadding,
    center,
    recenterTrigger,
    mapReadyState,
  ]);

  if (loadError) {
    return (
      <LeafletFallbackMap
        origin={origin}
        stops={stops}
        driverPosition={driverPosition}
        extraMarkers={extraMarkers}
        routePath={routePath}
        geoJsonRoute={geoJsonRoute}
        routeColor={routeColor}
        routeWeight={routeWeight}
        routeDashed={routeDashed}
        darkMode={darkMode}
        mapType={mapType}
        center={center}
        zoom={zoom}
        autoFitBounds={autoFitBounds}
        fitPadding={fitPadding}
        recenterTrigger={recenterTrigger}
        onMapClick={onMapClick}
        onUserInteract={onUserInteract}
        className={className}
      />
    );
  }

  return <div ref={containerRef} className={className} />;
};

const LeafletFallbackMap: React.FC<GoogleMapViewProps> = ({
  origin,
  stops = [],
  driverPosition,
  extraMarkers = [],
  routePath,
  geoJsonRoute,
  routeColor = "#EA580C",
  routeWeight = 5,
  routeDashed = false,
  darkMode = false,
  mapType = "roadmap",
  center,
  zoom = 14,
  autoFitBounds = true,
  fitPadding = 48,
  recenterTrigger = 0,
  onMapClick,
  onUserInteract,
  className = "w-full h-full",
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const onMapClickRef = useRef(onMapClick);
  const onUserInteractRef = useRef(onUserInteract);
  onMapClickRef.current = onMapClick;
  onUserInteractRef.current = onUserInteract;

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const initialCenter: [number, number] =
      center && isValidCoordinate(center.lat, center.lng)
        ? [center.lat, center.lng]
        : driverPosition && isValidCoordinate(driverPosition.lat, driverPosition.lng)
          ? [driverPosition.lat, driverPosition.lng]
          : origin && isValidCoordinate(origin.lat, origin.lng)
            ? [origin.lat, origin.lng]
            : [DEFAULT_CENTER.lat, DEFAULT_CENTER.lng];

    const map = L.map(containerRef.current, {
      center: initialCenter,
      zoom,
      zoomControl: false,
      attributionControl: false,
    });

    const layerCfg =
      mapType === "satellite" || mapType === "hybrid"
        ? MAP_LAYERS.satellite
        : darkMode
          ? MAP_LAYERS.dark
          : MAP_LAYERS.streets;
    tileLayerRef.current = L.tileLayer(layerCfg.url, { maxZoom: 19 }).addTo(map);
    layerGroupRef.current = L.layerGroup().addTo(map);

    map.on("click", (e: L.LeafletMouseEvent) => {
      onMapClickRef.current?.(e.latlng.lat, e.latlng.lng);
    });
    map.on("dragstart", () => {
      onUserInteractRef.current?.();
    });

    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      layerGroupRef.current = null;
      tileLayerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const layerCfg =
      mapType === "satellite" || mapType === "hybrid"
        ? MAP_LAYERS.satellite
        : darkMode
          ? MAP_LAYERS.dark
          : MAP_LAYERS.streets;
    if (tileLayerRef.current) {
      tileLayerRef.current.setUrl(layerCfg.url);
    }
  }, [darkMode, mapType]);

  useEffect(() => {
    const map = mapRef.current;
    const group = layerGroupRef.current;
    if (!map || !group) return;
    group.clearLayers();

    const boundsPts: [number, number][] = [];

    if (origin && isValidCoordinate(origin.lat, origin.lng)) {
      const icon = L.divIcon({
        className: "",
        html: `<div style="width:20px;height:20px;border-radius:9999px;background:#10B981;border:2.5px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.35)"></div>`,
        iconSize: [20, 20],
        iconAnchor: [10, 10],
      });
      const marker = L.marker([origin.lat, origin.lng], {
        icon,
        draggable: !!origin.draggable,
      }).addTo(group);
      if (origin.infoHtml) marker.bindPopup(origin.infoHtml);
      if (origin.draggable && origin.onDragEnd) {
        marker.on("dragend", () => {
          const p = marker.getLatLng();
          origin.onDragEnd?.(p.lat, p.lng);
        });
      }
      boundsPts.push([origin.lat, origin.lng]);
    }

    stops.forEach((stop, idx) => {
      if (!isValidCoordinate(stop.lat, stop.lng)) return;
      const num = stop.number ?? idx + 1;
      const icon = L.divIcon({
        className: "",
        html: `<div style="width:24px;height:24px;border-radius:9999px;background:#2563EB;border:2px solid #fff;color:#fff;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,.35)">${num}</div>`,
        iconSize: [24, 24],
        iconAnchor: [12, 12],
      });
      const marker = L.marker([stop.lat, stop.lng], {
        icon,
        draggable: !!stop.draggable,
      }).addTo(group);
      if (stop.infoHtml) marker.bindPopup(stop.infoHtml);
      if (stop.draggable && stop.onDragEnd) {
        marker.on("dragend", () => {
          const p = marker.getLatLng();
          stop.onDragEnd?.(p.lat, p.lng);
        });
      }
      boundsPts.push([stop.lat, stop.lng]);
    });

    if (driverPosition && isValidCoordinate(driverPosition.lat, driverPosition.lng)) {
      const icon = L.divIcon({
        className: "",
        html: `<div style="width:24px;height:24px;border-radius:9999px;background:#EA580C;border:2.5px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.4)"></div>`,
        iconSize: [24, 24],
        iconAnchor: [12, 12],
      });
      const marker = L.marker([driverPosition.lat, driverPosition.lng], { icon }).addTo(group);
      if (driverPosition.infoHtml) marker.bindPopup(driverPosition.infoHtml);
      boundsPts.push([driverPosition.lat, driverPosition.lng]);
    }

    extraMarkers.forEach((em) => {
      if (!isValidCoordinate(em.lat, em.lng)) return;
      const icon = L.divIcon({
        className: "",
        html: `<div style="width:16px;height:16px;border-radius:9999px;background:${em.color || "#F59E0B"};border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.3)"></div>`,
        iconSize: [16, 16],
        iconAnchor: [8, 8],
      });
      const marker = L.marker([em.lat, em.lng], { icon }).addTo(group);
      if (em.infoHtml) marker.bindPopup(em.infoHtml);
      if (em.onClick) marker.on("click", em.onClick);
    });

    const convertedPath =
      routePath && routePath.length > 0
        ? routePath
        : geoJsonRoute && geoJsonRoute.length > 0
          ? geoJsonGeometryToLatLngPath(geoJsonRoute)
          : [];
    if (convertedPath.length >= 2) {
      L.polyline(
        convertedPath.map((p) => [p.lat, p.lng] as [number, number]),
        {
          color: routeColor,
          weight: routeWeight,
          opacity: 0.9,
          dashArray: routeDashed ? "8, 8" : undefined,
        }
      ).addTo(group);
    }

    if (autoFitBounds && boundsPts.length >= 2) {
      map.fitBounds(boundsPts, { padding: [fitPadding, fitPadding] });
    } else if (autoFitBounds && boundsPts.length === 1) {
      map.panTo(boundsPts[0]);
    } else if (center && isValidCoordinate(center.lat, center.lng)) {
      map.panTo([center.lat, center.lng]);
    }
  }, [
    origin,
    stops,
    driverPosition,
    extraMarkers,
    routePath,
    geoJsonRoute,
    routeColor,
    routeWeight,
    routeDashed,
    autoFitBounds,
    fitPadding,
    center,
    recenterTrigger,
  ]);

  return <div ref={containerRef} className={className} />;
};

export default GoogleMapView;
