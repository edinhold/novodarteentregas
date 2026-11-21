import React, { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { MapPin } from "lucide-react";
import { DEFAULT_CENTER, OPENFREEMAP_STYLES } from "@/config/maps";
import { isValidCoordinate } from "@/utils/geolocation";
import {
  geoJsonGeometryToLatLngPath,
  literalPathToGeoJsonCoords,
  type LatLngLiteral,
} from "@/utils/mapCoordinates";

export interface MapOrigin {
  lat: number;
  lng: number;
  name?: string;
  infoHtml?: string;
  draggable?: boolean;
  onDragEnd?: (lat: number, lng: number) => void;
}

export interface MapStop {
  id?: string;
  lat: number;
  lng: number;
  label?: string;
  number?: number;
  infoHtml?: string;
  draggable?: boolean;
  onDragEnd?: (lat: number, lng: number) => void;
}

export interface MapDriverPosition {
  lat: number;
  lng: number;
  heading?: number | null;
  label?: string;
  infoHtml?: string;
}

export interface MapExtraMarker {
  id: string;
  lat: number;
  lng: number;
  title?: string;
  color?: string;
  label?: string;
  infoHtml?: string;
  onClick?: () => void;
}

export interface MapLibreViewProps {
  origin?: MapOrigin | null;
  stops?: MapStop[];
  driverPosition?: MapDriverPosition | null;
  extraMarkers?: MapExtraMarker[];
  /** Caminho já em { lat, lng }[] */
  routePath?: LatLngLiteral[];
  /** Geometria GeoJSON vinda diretamente do Mapbox Directions ([lng, lat][]) */
  geoJsonRoute?: Array<[number, number]>;
  routeColor?: string;
  routeWeight?: number;
  routeDashed?: boolean;
  darkMode?: boolean;
  mapType?: "roadmap" | "satellite" | "hybrid";
  pitch?: number;
  center?: LatLngLiteral | null;
  zoom?: number;
  autoFitBounds?: boolean;
  fitPadding?: number;
  recenterTrigger?: number;
  onMapClick?: (lat: number, lng: number) => void;
  onUserInteract?: () => void;
  onMapReady?: (map: maplibregl.Map) => void;
  className?: string;
}

const ROUTE_SOURCE_ID = "duarte-route-source";
const ROUTE_CASING_LAYER_ID = "duarte-route-casing";
const ROUTE_LINE_LAYER_ID = "duarte-route-line";
const BUILDINGS_3D_LAYER_ID = "duarte-3d-buildings";

const OSM_RASTER_FALLBACK_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution: "© OpenStreetMap",
    },
  },
  layers: [{ id: "osm", type: "raster", source: "osm" }],
};

const SATELLITE_RASTER_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    esri: {
      type: "raster",
      tiles: [
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      ],
      tileSize: 256,
      maxzoom: 19,
      attribution: "© Esri World Imagery",
    },
  },
  layers: [{ id: "esri-satellite", type: "raster", source: "esri" }],
};

function createOriginElement(): HTMLElement {
  const el = document.createElement("div");
  el.style.cssText =
    "width:24px;height:24px;border-radius:9999px;background:#10B981;border:3px solid #FFFFFF;box-shadow:0 2px 8px rgba(0,0,0,0.35);display:flex;align-items:center;justify-content:center;cursor:pointer;";
  const dot = document.createElement("div");
  dot.style.cssText = "width:7px;height:7px;border-radius:9999px;background:#FFFFFF;";
  el.appendChild(dot);
  return el;
}

function createStopElement(stopNumber?: number): HTMLElement {
  const el = document.createElement("div");
  el.style.cssText =
    "width:28px;height:28px;border-radius:9999px;background:#2563EB;border:2.5px solid #FFFFFF;color:#FFFFFF;font-family:Arial,sans-serif;font-size:12px;font-weight:700;display:flex;align-items:center;justify-content:center;box-shadow:0 3px 8px rgba(0,0,0,0.4);cursor:pointer;";
  el.textContent = stopNumber != null && stopNumber > 0 ? String(stopNumber) : "•";
  return el;
}

function createDriverElement(heading?: number | null): HTMLElement {
  const wrapper = document.createElement("div");
  wrapper.style.cssText =
    "position:relative;width:42px;height:42px;display:flex;align-items:center;justify-content:center;pointer-events:auto;";

  const pulse = document.createElement("div");
  pulse.style.cssText =
    "position:absolute;inset:2px;border-radius:9999px;background:rgba(14,165,233,0.28);animation:ping 1.8s cubic-bezier(0,0,0.2,1) infinite;";
  wrapper.appendChild(pulse);

  const badge = document.createElement("div");
  const rot = heading != null && Number.isFinite(heading) ? heading : 0;
  badge.style.cssText = `position:relative;width:30px;height:30px;border-radius:9999px;background:#0EA5E9;border:2.5px solid #FFFFFF;box-shadow:0 2px 10px rgba(0,0,0,0.45);display:flex;align-items:center;justify-content:center;transform:rotate(${rot}deg);transition:transform 0.25s ease;`;
  badge.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="#FFFFFF"><polygon points="12,3 20,20 12,16 4,20"/></svg>`;
  wrapper.appendChild(badge);
  return wrapper;
}

function createExtraElement(color = "#F59E0B"): HTMLElement {
  const el = document.createElement("div");
  el.style.cssText = `width:20px;height:20px;border-radius:9999px;background:${color};border:2.5px solid #FFFFFF;box-shadow:0 2px 6px rgba(0,0,0,0.35);cursor:pointer;`;
  return el;
}

export const MapLibreView: React.FC<MapLibreViewProps> = ({
  origin,
  stops = [],
  driverPosition,
  extraMarkers = [],
  routePath,
  geoJsonRoute,
  routeColor = "#0EA5E9",
  routeWeight = 5,
  routeDashed = false,
  darkMode,
  mapType = "roadmap",
  pitch = 0,
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
  const mapRef = useRef<maplibregl.Map | null>(null);
  const originMarkerRef = useRef<maplibregl.Marker | null>(null);
  const stopMarkersRef = useRef<maplibregl.Marker[]>([]);
  const driverMarkerRef = useRef<maplibregl.Marker | null>(null);
  const extraMarkersRef = useRef<maplibregl.Marker[]>([]);

  const onMapClickRef = useRef(onMapClick);
  const onUserInteractRef = useRef(onUserInteract);
  onMapClickRef.current = onMapClick;
  onUserInteractRef.current = onUserInteract;

  const [docDark, setDocDark] = useState<boolean>(() =>
    typeof document !== "undefined" ? document.documentElement.classList.contains("dark") : false
  );
  const [mapReady, setMapReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    const onThemeChange = () => {
      setDocDark(document.documentElement.classList.contains("dark"));
    };
    window.addEventListener("theme-change", onThemeChange);
    return () => window.removeEventListener("theme-change", onThemeChange);
  }, []);

  const isDark = darkMode !== undefined ? darkMode : docDark;
  const isSatellite = mapType === "satellite" || mapType === "hybrid";
  const targetStyleKey = isSatellite ? "satellite" : isDark ? "dark" : "liberty";
  const targetStyle: string | maplibregl.StyleSpecification = isSatellite
    ? SATELLITE_RASTER_STYLE
    : isDark
    ? OPENFREEMAP_STYLES.dark
    : OPENFREEMAP_STYLES.liberty;
  const activeStyleKeyRef = useRef<string>(targetStyleKey);
  const usingFallbackStyleRef = useRef(false);
  const styleLoadedRef = useRef(false);
  const styleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pitchRef = useRef<number>(pitch);
  pitchRef.current = pitch;

  const ensure3DBuildings = useRef<() => void>(() => {});
  ensure3DBuildings.current = () => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded() || pitchRef.current <= 0) return;
    if (map.getLayer(BUILDINGS_3D_LAYER_ID)) return;
    try {
      const style = map.getStyle();
      const vectorSourceName = Object.keys(style?.sources || {}).find(
        (key) => (style.sources as any)[key]?.type === "vector"
      );
      if (!vectorSourceName) return;
      map.addLayer({
        id: BUILDINGS_3D_LAYER_ID,
        source: vectorSourceName,
        "source-layer": "building",
        type: "fill-extrusion",
        minzoom: 14,
        paint: {
          "fill-extrusion-color": isDark ? "#334155" : "#cbd5e1",
          "fill-extrusion-height": ["coalesce", ["get", "render_height"], ["get", "height"], 10],
          "fill-extrusion-base": ["coalesce", ["get", "render_min_height"], 0],
          "fill-extrusion-opacity": 0.72,
        },
      });
    } catch {
      // Style may not include a building layer (e.g., raster fallback)
    }
  };

  // Sync route GeoJSON into MapLibre Source + Layer
  const syncRouteLayer = useRef<() => void>(() => {});
  syncRouteLayer.current = () => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    const convertedPath: LatLngLiteral[] =
      routePath && routePath.length > 0
        ? routePath
        : geoJsonRoute && geoJsonRoute.length > 0
        ? geoJsonGeometryToLatLngPath(geoJsonRoute)
        : [];
    const coords = literalPathToGeoJsonCoords(convertedPath);

    const geojson: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features:
        coords.length >= 2
          ? [
              {
                type: "Feature",
                properties: {},
                geometry: { type: "LineString", coordinates: coords },
              },
            ]
          : [],
    };

    const existingSource = map.getSource(ROUTE_SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
    if (existingSource) {
      existingSource.setData(geojson);
    } else {
      map.addSource(ROUTE_SOURCE_ID, { type: "geojson", data: geojson });
      map.addLayer({
        id: ROUTE_CASING_LAYER_ID,
        type: "line",
        source: ROUTE_SOURCE_ID,
        layout: { "line-join": "round", "line-cap": "round" },
        paint: {
          "line-color": isDark ? "#0f172a" : "#ffffff",
          "line-width": routeWeight + 4,
          "line-opacity": 0.85,
        },
      });
      map.addLayer({
        id: ROUTE_LINE_LAYER_ID,
        type: "line",
        source: ROUTE_SOURCE_ID,
        layout: { "line-join": "round", "line-cap": "round" },
        paint: {
          "line-color": routeColor,
          "line-width": routeWeight,
          "line-opacity": 0.95,
          ...(routeDashed ? { "line-dasharray": [2, 2] } : {}),
        },
      });
    }
  };

  // 1. Inicialização do MapLibre GL
  useEffect(() => {
    const containerEl = containerRef.current;
    if (!containerEl || mapRef.current) return;

    let resizeObserver: ResizeObserver | null = null;
    styleLoadedRef.current = false;

    const activateFallbackStyle = (map: maplibregl.Map, reason: unknown) => {
      if (usingFallbackStyleRef.current || activeStyleKeyRef.current === "satellite") return;
      usingFallbackStyleRef.current = true;
      console.warn("[MapLibreView] Estilo vetorial indisponível, ativando fallback OpenStreetMap:", reason);
      try {
        map.setStyle(OSM_RASTER_FALLBACK_STYLE);
      } catch (fallbackErr) {
        console.error("MapLibre Fallback Error:", fallbackErr);
      }
    };

    try {
      const initialCenter =
        center && isValidCoordinate(center.lat, center.lng)
          ? [center.lng, center.lat]
          : driverPosition && isValidCoordinate(driverPosition.lat, driverPosition.lng)
          ? [driverPosition.lng, driverPosition.lat]
          : origin && isValidCoordinate(origin.lat, origin.lng)
          ? [origin.lng, origin.lat]
          : [DEFAULT_CENTER.lng, DEFAULT_CENTER.lat];

      const map = new maplibregl.Map({
        container: containerEl,
        style: targetStyle,
        center: initialCenter as [number, number],
        zoom,
        pitch,
        attributionControl: false,
      });

      activeStyleKeyRef.current = targetStyleKey;
      usingFallbackStyleRef.current = false;

      // Fallback automático se o estilo vetorial demorar mais de 4.5s para carregar
      styleTimeoutRef.current = setTimeout(() => {
        if (!styleLoadedRef.current && mapRef.current) {
          activateFallbackStyle(map, "timeout_4.5s");
        }
      }, 4500);

      map.on("load", () => {
        styleLoadedRef.current = true;
        if (styleTimeoutRef.current) {
          clearTimeout(styleTimeoutRef.current);
          styleTimeoutRef.current = null;
        }
        map.resize();
        requestAnimationFrame(() => map.resize());
        setMapReady(true);
        setLoadError(null);
        ensure3DBuildings.current();
        syncRouteLayer.current();
        onMapReady?.(map);
      });

      map.on("style.load", () => {
        styleLoadedRef.current = true;
        if (styleTimeoutRef.current) {
          clearTimeout(styleTimeoutRef.current);
          styleTimeoutRef.current = null;
        }
        map.resize();
        ensure3DBuildings.current();
        syncRouteLayer.current();
      });

      map.on("click", (e) => {
        onMapClickRef.current?.(e.lngLat.lat, e.lngLat.lng);
      });

      map.on("dragstart", () => {
        onUserInteractRef.current?.();
      });

      map.on("error", (e) => {
        console.error("MapLibre Error:", e);
        if (!styleLoadedRef.current) {
          activateFallbackStyle(map, e?.error?.message || "style_error");
        }
      });

      if (typeof ResizeObserver !== "undefined") {
        resizeObserver = new ResizeObserver(() => {
          map.resize();
        });
        resizeObserver.observe(containerEl);
      }

      mapRef.current = map;
    } catch (err: any) {
      console.error("MapLibre Error:", err);
      setLoadError(err?.message || "Erro ao inicializar mapa vetorial");
    }

    return () => {
      if (styleTimeoutRef.current) clearTimeout(styleTimeoutRef.current);
      resizeObserver?.disconnect();
      originMarkerRef.current?.remove();
      stopMarkersRef.current.forEach((m) => m.remove());
      driverMarkerRef.current?.remove();
      extraMarkersRef.current.forEach((m) => m.remove());
      originMarkerRef.current = null;
      stopMarkersRef.current = [];
      driverMarkerRef.current = null;
      extraMarkersRef.current = [];
      mapRef.current?.remove();
      mapRef.current = null;
      setMapReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 2. Alternância dinâmica entre Claro (Liberty), Escuro (Dark) e Satélite (Esri) sem tela preta/branca
  useEffect(() => {
    const map = mapRef.current;
    if (!map || activeStyleKeyRef.current === targetStyleKey) return;
    activeStyleKeyRef.current = targetStyleKey;
    usingFallbackStyleRef.current = false;
    styleLoadedRef.current = false;

    if (styleTimeoutRef.current) {
      clearTimeout(styleTimeoutRef.current);
      styleTimeoutRef.current = null;
    }

    if (targetStyleKey !== "satellite") {
      styleTimeoutRef.current = setTimeout(() => {
        if (!styleLoadedRef.current && mapRef.current && !usingFallbackStyleRef.current) {
          usingFallbackStyleRef.current = true;
          mapRef.current.setStyle(OSM_RASTER_FALLBACK_STYLE);
        }
      }, 4500);
    }

    map.setStyle(targetStyle);
  }, [targetStyleKey, targetStyle]);

  // 2b. Alternância suave de inclinação 3D (pitch)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.easeTo({ pitch, duration: 450 });
    if (pitch > 0) {
      ensure3DBuildings.current();
    }
  }, [pitch]);

  // 3. Atualiza marcador da Origem (Loja)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (origin && isValidCoordinate(origin.lat, origin.lng)) {
      if (!originMarkerRef.current) {
        const marker = new maplibregl.Marker({
          element: createOriginElement(),
          draggable: !!origin.draggable,
        })
          .setLngLat([origin.lng, origin.lat])
          .addTo(map);
        if (origin.infoHtml) {
          marker.setPopup(new maplibregl.Popup({ offset: 18 }).setHTML(origin.infoHtml));
        }
        if (origin.onDragEnd) {
          marker.on("dragend", () => {
            const p = marker.getLngLat();
            origin.onDragEnd?.(p.lat, p.lng);
          });
        }
        originMarkerRef.current = marker;
      } else {
        originMarkerRef.current.setLngLat([origin.lng, origin.lat]);
        originMarkerRef.current.setDraggable(!!origin.draggable);
      }
    } else if (originMarkerRef.current) {
      originMarkerRef.current.remove();
      originMarkerRef.current = null;
    }
  }, [origin, mapReady]);

  // 4. Atualiza marcadores das Paradas / Destinos
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    stopMarkersRef.current.forEach((m) => m.remove());
    stopMarkersRef.current = [];

    stops.forEach((stop, idx) => {
      if (!isValidCoordinate(stop.lat, stop.lng)) return;
      const num = stop.number ?? idx + 1;
      const marker = new maplibregl.Marker({
        element: createStopElement(num),
        draggable: !!stop.draggable,
      })
        .setLngLat([stop.lng, stop.lat])
        .addTo(map);
      if (stop.infoHtml) {
        marker.setPopup(new maplibregl.Popup({ offset: 18 }).setHTML(stop.infoHtml));
      }
      if (stop.onDragEnd) {
        marker.on("dragend", () => {
          const p = marker.getLngLat();
          stop.onDragEnd?.(p.lat, p.lng);
        });
      }
      stopMarkersRef.current.push(marker);
    });
  }, [stops, mapReady]);

  // 5. Atualiza marcador do Motorista em tempo real
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (driverPosition && isValidCoordinate(driverPosition.lat, driverPosition.lng)) {
      if (!driverMarkerRef.current) {
        const marker = new maplibregl.Marker({
          element: createDriverElement(driverPosition.heading),
        })
          .setLngLat([driverPosition.lng, driverPosition.lat])
          .addTo(map);
        if (driverPosition.infoHtml) {
          marker.setPopup(new maplibregl.Popup({ offset: 20 }).setHTML(driverPosition.infoHtml));
        }
        driverMarkerRef.current = marker;
      } else {
        driverMarkerRef.current.setLngLat([driverPosition.lng, driverPosition.lat]);
        const el = driverMarkerRef.current.getElement();
        const arrow = el.children[1] as HTMLElement | undefined;
        if (arrow && driverPosition.heading != null && Number.isFinite(driverPosition.heading)) {
          arrow.style.transform = `rotate(${driverPosition.heading}deg)`;
        }
      }
    } else if (driverMarkerRef.current) {
      driverMarkerRef.current.remove();
      driverMarkerRef.current = null;
    }
  }, [driverPosition, mapReady]);

  // 6. Atualiza marcadores extras
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    extraMarkersRef.current.forEach((m) => m.remove());
    extraMarkersRef.current = [];

    extraMarkers.forEach((em) => {
      if (!isValidCoordinate(em.lat, em.lng)) return;
      const el = createExtraElement(em.color);
      if (em.title) el.title = em.title;
      if (em.onClick) {
        el.addEventListener("click", (ev) => {
          ev.stopPropagation();
          em.onClick?.();
        });
      }
      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([em.lng, em.lat])
        .addTo(map);
      if (em.infoHtml) {
        marker.setPopup(new maplibregl.Popup({ offset: 16 }).setHTML(em.infoHtml));
      }
      extraMarkersRef.current.push(marker);
    });
  }, [extraMarkers, mapReady]);

  // 7. Atualiza camada GeoJSON da rota (Mapbox Directions -> MapLibre Line Layer)
  useEffect(() => {
    syncRouteLayer.current();
  }, [routePath, geoJsonRoute, routeColor, routeWeight, routeDashed, isDark, mapReady]);

  // 8. Enquadramento automático (fitBounds) ou centralização
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (autoFitBounds) {
      const bounds = new maplibregl.LngLatBounds();
      let pointsCount = 0;

      if (origin && isValidCoordinate(origin.lat, origin.lng)) {
        bounds.extend([origin.lng, origin.lat]);
        pointsCount++;
      }
      stops.forEach((s) => {
        if (isValidCoordinate(s.lat, s.lng)) {
          bounds.extend([s.lng, s.lat]);
          pointsCount++;
        }
      });
      if (driverPosition && isValidCoordinate(driverPosition.lat, driverPosition.lng)) {
        bounds.extend([driverPosition.lng, driverPosition.lat]);
        pointsCount++;
      }

      if (pointsCount >= 2) {
        map.fitBounds(bounds, { padding: fitPadding, duration: 500 });
        return;
      }
      if (pointsCount === 1) {
        const single: [number, number] =
          driverPosition && isValidCoordinate(driverPosition.lat, driverPosition.lng)
            ? [driverPosition.lng, driverPosition.lat]
            : stops[0] && isValidCoordinate(stops[0].lat, stops[0].lng)
            ? [stops[0].lng, stops[0].lat]
            : origin && isValidCoordinate(origin.lat, origin.lng)
            ? [origin.lng, origin.lat]
            : [DEFAULT_CENTER.lng, DEFAULT_CENTER.lat];
        map.easeTo({ center: single, duration: 400 });
        return;
      }
    }

    if (center && isValidCoordinate(center.lat, center.lng)) {
      map.easeTo({ center: [center.lng, center.lat], duration: 400 });
    }
  }, [origin, stops, driverPosition, autoFitBounds, fitPadding, center, recenterTrigger, mapReady]);

  if (loadError) {
    return (
      <div
        className={`${className} flex flex-col items-center justify-center bg-slate-900/90 text-slate-300 p-4 text-center gap-2`}
      >
        <MapPin className="w-6 h-6 text-sky-400" />
        <p className="text-xs font-medium">Mapa indisponível no momento</p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`relative ${className}`}
      style={{ width: "100%", height: "100%" }}
    />
  );
};

export default MapLibreView;
