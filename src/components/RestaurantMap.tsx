import { useEffect, useMemo, useRef, useState } from "react";
import { Restaurant } from "@/types";
import { DEFAULT_CENTER, DEFAULT_ZOOM, MAP_LAYERS } from "@/config/maps";
import { useNavigate } from "react-router-dom";
import { useDriverLocations } from "@/hooks/useDriverLocations";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

const openIcon = new L.Icon({
  iconUrl: "data:image/svg+xml," + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="%23e53935" stroke="white" stroke-width="1.5"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3" fill="white"/></svg>`
  ),
  iconSize: [32, 32],
  iconAnchor: [16, 32],
  popupAnchor: [0, -32],
});

const closedIcon = new L.Icon({
  iconUrl: "data:image/svg+xml," + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="%23999" stroke="white" stroke-width="1.5"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3" fill="white"/></svg>`
  ),
  iconSize: [32, 32],
  iconAnchor: [16, 32],
  popupAnchor: [0, -32],
});

const driverMapIcon = new L.Icon({
  iconUrl: "data:image/svg+xml," + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="%233b82f6" stroke="white" stroke-width="2"><circle cx="12" cy="12" r="8"/><path d="M12 6v6l3 3" stroke="white" stroke-width="2" fill="none"/></svg>`
  ),
  iconSize: [28, 28],
  iconAnchor: [14, 14],
  popupAnchor: [0, -14],
});

interface RestaurantMapProps {
  restaurants: Restaurant[];
}

type RestaurantWithMapPosition = Restaurant & {
  mapLatitude: number;
  mapLongitude: number;
};

const getCoordinateKey = (restaurant: RestaurantWithMapPosition) =>
  `${restaurant.mapLatitude.toFixed(5)}:${restaurant.mapLongitude.toFixed(5)}`;

const offsetStackedCoordinate = (
  latitude: number,
  longitude: number,
  index: number,
  total: number
) => {
  if (total <= 1) return { latitude, longitude };

  const angle = (Math.PI * 2 * index) / total;
  const radiusMeters = Math.min(22, 10 + total * 2);
  const latitudeOffset = (Math.sin(angle) * radiusMeters) / 111_320;
  const longitudeOffset =
    (Math.cos(angle) * radiusMeters) /
    (111_320 * Math.max(Math.cos((latitude * Math.PI) / 180), 0.1));

  return {
    latitude: latitude + latitudeOffset,
    longitude: longitude + longitudeOffset,
  };
};

const isValidCoordinate = (lat?: number | null, lng?: number | null) =>
  typeof lat === "number" &&
  typeof lng === "number" &&
  Number.isFinite(lat) &&
  Number.isFinite(lng) &&
  lat >= -90 &&
  lat <= 90 &&
  lng >= -180 &&
  lng <= 180 &&
  !(lat === 0 && lng === 0);

const getGeocodeAddress = (restaurant: Restaurant) => {
  const address = restaurant.address?.trim();
  if (!address) return "";
  return /primavera do leste|\bmt\b|mato grosso/i.test(address)
    ? `${address}, Brasil`
    : `${address}, Primavera do Leste, MT, Brasil`;
};

const getCachedPosition = (restaurant: Restaurant): RestaurantWithMapPosition | null => {
  const cacheKey = `restaurant-map-position:${restaurant.id}:${restaurant.address ?? ""}`;
  const cached = localStorage.getItem(cacheKey);
  if (!cached) return null;

  try {
    const position = JSON.parse(cached) as { latitude: number; longitude: number };
    if (!isValidCoordinate(position.latitude, position.longitude)) return null;
    return { ...restaurant, mapLatitude: position.latitude, mapLongitude: position.longitude };
  } catch {
    return null;
  }
};

const cachePosition = (restaurant: Restaurant, latitude: number, longitude: number) => {
  const cacheKey = `restaurant-map-position:${restaurant.id}:${restaurant.address ?? ""}`;
  localStorage.setItem(cacheKey, JSON.stringify({ latitude, longitude }));
};

const geocodeRestaurant = async (restaurant: Restaurant): Promise<RestaurantWithMapPosition | null> => {
  const cached = getCachedPosition(restaurant);
  if (cached) return cached;

  const address = getGeocodeAddress(restaurant);
  if (!address) return null;

  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "1");
  url.searchParams.set("countrycodes", "br");
  url.searchParams.set("q", address);

  const response = await fetch(url.toString());
  if (!response.ok) return null;
  const [result] = await response.json();
  const latitude = Number(result?.lat);
  const longitude = Number(result?.lon);
  if (!isValidCoordinate(latitude, longitude)) return null;

  cachePosition(restaurant, latitude, longitude);
  return { ...restaurant, mapLatitude: latitude, mapLongitude: longitude };
};

const RestaurantMap = ({ restaurants }: RestaurantMapProps) => {
  const navigate = useNavigate();
  const mapRef = useRef<L.Map | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [geocodedMarkers, setGeocodedMarkers] = useState<RestaurantWithMapPosition[]>([]);
  const { data: driverLocations = [] } = useDriverLocations();

  const markers = useMemo<RestaurantWithMapPosition[]>(() => {
    const positioned = restaurants
      .filter((r) => isValidCoordinate(r.latitude, r.longitude))
      .map((r) => ({ ...r, mapLatitude: r.latitude!, mapLongitude: r.longitude! }));

    const positionedIds = new Set(positioned.map((r) => r.id));
    const fallbackMarkers = geocodedMarkers.filter((r) =>
      restaurants.some((restaurant) => restaurant.id === r.id) && !positionedIds.has(r.id)
    );

    return [...positioned, ...fallbackMarkers];
  }, [restaurants, geocodedMarkers]);

  const visibleMarkers = useMemo<RestaurantWithMapPosition[]>(() => {
    const groups = new Map<string, RestaurantWithMapPosition[]>();
    markers.forEach((restaurant) => {
      const key = getCoordinateKey(restaurant);
      groups.set(key, [...(groups.get(key) ?? []), restaurant]);
    });

    return markers.map((restaurant) => {
      const group = groups.get(getCoordinateKey(restaurant)) ?? [restaurant];
      const markerIndex = group.findIndex((item) => item.id === restaurant.id);
      const shifted = offsetStackedCoordinate(
        restaurant.mapLatitude,
        restaurant.mapLongitude,
        Math.max(markerIndex, 0),
        group.length
      );

      return {
        ...restaurant,
        mapLatitude: shifted.latitude,
        mapLongitude: shifted.longitude,
      };
    });
  }, [markers]);

  const center: [number, number] = visibleMarkers.length > 0
    ? [visibleMarkers[0].mapLatitude, visibleMarkers[0].mapLongitude]
    : [DEFAULT_CENTER.lat, DEFAULT_CENTER.lng];

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current).setView(center, DEFAULT_ZOOM);
    mapRef.current = map;

    L.tileLayer(MAP_LAYERS.streets.url, {
      attribution: MAP_LAYERS.streets.attribution,
    }).addTo(map);

    requestAnimationFrame(() => {
      // Map may already be removed when the component unmounts before this frame
      if ((map as any)._container && (map as any)._mapPane) map.invalidateSize();
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const missingCoordinates = restaurants.filter(
      (r) => !isValidCoordinate(r.latitude, r.longitude) && !!r.address?.trim()
    );

    if (missingCoordinates.length === 0) {
      setGeocodedMarkers([]);
      return;
    }

    const cachedMarkers = missingCoordinates
      .map(getCachedPosition)
      .filter((marker): marker is RestaurantWithMapPosition => !!marker);
    setGeocodedMarkers(cachedMarkers);

    const uncachedRestaurants = missingCoordinates.filter(
      (r) => !cachedMarkers.some((marker) => marker.id === r.id)
    );

    if (uncachedRestaurants.length === 0) return;

    (async () => {
      const resolved: RestaurantWithMapPosition[] = [];
      for (const restaurant of uncachedRestaurants) {
        const marker = await geocodeRestaurant(restaurant).catch(() => null);
        if (cancelled) return;
        if (marker) {
          resolved.push(marker);
          setGeocodedMarkers((current) => [
            ...current.filter((item) => item.id !== marker.id),
            marker,
          ]);
        }
        await new Promise((resolve) => setTimeout(resolve, 350));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [restaurants]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Clear existing markers
    map.eachLayer((layer) => {
      if (layer instanceof L.Marker || layer instanceof L.Circle) map.removeLayer(layer);
    });

    // Restaurant markers
    visibleMarkers.forEach((r) => {
      const marker = L.marker([r.mapLatitude, r.mapLongitude], {
        icon: r.is_open ? openIcon : closedIcon,
        title: r.name,
        zIndexOffset: 1000,
      }).addTo(map);

      marker.bindTooltip(r.name, {
        direction: "top",
        offset: [0, -28],
        opacity: 0.95,
        sticky: true,
        className: "restaurant-map-tooltip",
      });

      marker.on("mouseover", () => marker.openTooltip());
      marker.on("mouseout", () => marker.closeTooltip());

      marker.bindPopup(`
        <div style="min-width:160px">
          <h3 style="font-weight:bold;font-size:14px;margin:0">${r.name}</h3>
          <p style="font-size:12px;color:#666;margin:2px 0">${r.category_name}</p>
          <div style="display:flex;gap:8px;font-size:11px;color:#888;margin-top:4px">
            <span>⭐ ${r.rating}</span>
            <span>🕐 ${r.delivery_time}</span>
          </div>
          <p style="font-size:11px;color:${r.is_open ? '#e53935' : '#999'};font-weight:600;margin-top:4px">
            ${r.is_open ? 'Aberto' : 'Fechado'}
          </p>
        </div>
      `);

      marker.on("click", () => navigate(`/restaurant/${r.id}`));
    });

    if (visibleMarkers.length > 1) {
      const bounds = L.latLngBounds(visibleMarkers.map((r) => [r.mapLatitude, r.mapLongitude]));
      map.fitBounds(bounds, { padding: [28, 28], maxZoom: DEFAULT_ZOOM });
    } else if (visibleMarkers.length === 1) {
      map.setView([visibleMarkers[0].mapLatitude, visibleMarkers[0].mapLongitude], DEFAULT_ZOOM);
    }

    requestAnimationFrame(() => {
      // Map may already be removed when the component unmounts before this frame
      if ((map as any)._container && (map as any)._mapPane) map.invalidateSize();
    });

    // Driver markers
    driverLocations.forEach((d: any) => {
      const dMarker = L.marker([d.latitude, d.longitude], {
        icon: driverMapIcon,
      }).addTo(map);

      const speedKmh = d.speed ? Math.round(d.speed * 3.6) : 0;
      const accText = d.accuracy ? `±${Math.round(d.accuracy)}m` : "";

      dMarker.bindPopup(`
        <div style="min-width:120px">
          <h3 style="font-weight:bold;font-size:13px;margin:0">🚴 Entregador</h3>
          ${speedKmh > 0 ? `<p style="font-size:11px;color:#666;margin:2px 0">🚗 ${speedKmh} km/h</p>` : ""}
          ${accText ? `<p style="font-size:11px;color:#888;margin:2px 0">🎯 ${accText}</p>` : ""}
          <p style="font-size:10px;color:#3b82f6;font-weight:600;margin-top:4px">Em atividade</p>
        </div>
      `);

      // Accuracy circle
      if (d.accuracy && d.accuracy > 0) {
        L.circle([d.latitude, d.longitude], {
          radius: d.accuracy,
          fillColor: "#3b82f6",
          fillOpacity: 0.05,
          color: "#3b82f6",
          opacity: 0.15,
          weight: 1,
        }).addTo(map);
      }
    });
  }, [visibleMarkers, navigate, driverLocations]);

  return <div ref={containerRef} style={{ width: "100%", height: "100%" }} />;
};

export default RestaurantMap;
