import { useEffect, useMemo, useState } from "react";
import { Restaurant } from "@/types";
import { DEFAULT_CENTER, DEFAULT_ZOOM } from "@/config/maps";
import { useNavigate } from "react-router-dom";
import { useDriverLocations } from "@/hooks/useDriverLocations";
import { geocodeAddress } from "@/services/mapbox";
import GoogleMapView, { type GoogleMapExtraMarker } from "@/components/maps/GoogleMapView";

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
  return /primavera do leste/i.test(address)
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

  try {
    const parsed = await geocodeAddress(address);
    if (!parsed || !isValidCoordinate(parsed.coordinates.latitude, parsed.coordinates.longitude)) return null;

    cachePosition(restaurant, parsed.coordinates.latitude, parsed.coordinates.longitude);
    return { ...restaurant, mapLatitude: parsed.coordinates.latitude, mapLongitude: parsed.coordinates.longitude };
  } catch {
    return null;
  }
};

const RestaurantMap = ({ restaurants }: RestaurantMapProps) => {
  const navigate = useNavigate();
  const [geocodedMarkers, setGeocodedMarkers] = useState<RestaurantWithMapPosition[]>([]);
  const { data: driverLocations = [] } = useDriverLocations();

  const markers = useMemo<RestaurantWithMapPosition[]>(() => {
    const positioned = restaurants
      .filter((r) => isValidCoordinate(r.latitude, r.longitude))
      .map((r) => ({ ...r, mapLatitude: r.latitude!, mapLongitude: r.longitude! }));

    const positionedIds = new Set(positioned.map((r) => r.id));
    const fallbackMarkers = geocodedMarkers.filter(
      (r) => restaurants.some((restaurant) => restaurant.id === r.id) && !positionedIds.has(r.id)
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
      for (const restaurant of uncachedRestaurants) {
        const marker = await geocodeRestaurant(restaurant).catch(() => null);
        if (cancelled) return;
        if (marker) {
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

  const center = useMemo(
    () =>
      visibleMarkers.length > 0
        ? { lat: visibleMarkers[0].mapLatitude, lng: visibleMarkers[0].mapLongitude }
        : DEFAULT_CENTER,
    [visibleMarkers]
  );

  const extraMarkers = useMemo<GoogleMapExtraMarker[]>(() => {
    const restaurantPins: GoogleMapExtraMarker[] = visibleMarkers.map((r) => ({
      id: `rest-${r.id}`,
      lat: r.mapLatitude,
      lng: r.mapLongitude,
      title: r.name,
      color: r.is_open ? "#e53935" : "#999999",
      onClick: () => navigate(`/restaurant/${r.id}`),
    }));

    const driverPins: GoogleMapExtraMarker[] = driverLocations.map((d: any, idx: number) => ({
      id: `drv-${d.user_id || idx}`,
      lat: Number(d.latitude),
      lng: Number(d.longitude),
      title: "Entregador em atividade",
      color: "#3b82f6",
    }));

    return [...restaurantPins, ...driverPins];
  }, [visibleMarkers, driverLocations, navigate]);

  return (
    <GoogleMapView
      extraMarkers={extraMarkers}
      center={center}
      zoom={DEFAULT_ZOOM}
      autoFitBounds={visibleMarkers.length > 1}
      className="w-full h-full"
    />
  );
};

export default RestaurantMap;
