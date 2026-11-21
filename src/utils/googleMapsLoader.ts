import { GOOGLE_MAPS_API_KEY } from "@/config/maps";

export interface LatLngLiteral {
  lat: number;
  lng: number;
}

/**
 * Converte uma coordenada GeoJSON da Mapbox ([longitude, latitude])
 * para o formato padrão do Google Maps ({ lat, lng }).
 */
export function geoJsonCoordToLatLng(coord: [number, number]): LatLngLiteral {
  const [lng, lat] = coord;
  return { lat: Number(lat), lng: Number(lng) };
}

/**
 * Converte um array de geometria GeoJSON da Mapbox ([longitude, latitude][])
 * para um caminho compatível com google.maps.Polyline ({ lat, lng }[]).
 */
export function geoJsonGeometryToLatLngPath(
  coords: Array<[number, number]> | null | undefined
): LatLngLiteral[] {
  if (!Array.isArray(coords)) return [];
  return coords
    .filter((c) => Array.isArray(c) && c.length >= 2 && Number.isFinite(c[0]) && Number.isFinite(c[1]))
    .map((c) => geoJsonCoordToLatLng(c));
}

/**
 * Converte um array [latitude, longitude][] (formato Leaflet retornado por calculateRoute().geometry)
 * para um caminho compatível com google.maps.Polyline ({ lat, lng }[]).
 */
export function latLngArrayToLiteralPath(
  coords: Array<[number, number]> | null | undefined
): LatLngLiteral[] {
  if (!Array.isArray(coords)) return [];
  return coords
    .filter((c) => Array.isArray(c) && c.length >= 2 && Number.isFinite(c[0]) && Number.isFinite(c[1]))
    .map(([lat, lng]) => ({ lat: Number(lat), lng: Number(lng) }));
}

let googleMapsPromise: Promise<any> | null = null;

/**
 * Carrega apenas a biblioteca principal do Google Maps JS SDK (`libraries=maps`),
 * sem carregar `places` para evitar custos extras.
 */
export function loadGoogleMapsScript(customApiKey?: string): Promise<any> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Google Maps só pode ser carregado no navegador."));
  }

  const w = window as any;
  if (w.google?.maps?.Map) {
    return Promise.resolve(w.google.maps);
  }

  if (googleMapsPromise) {
    return googleMapsPromise;
  }

  const apiKey = (customApiKey || GOOGLE_MAPS_API_KEY || "").trim();
  if (!apiKey) {
    return Promise.reject(new Error("VITE_GOOGLE_MAPS_API_KEY não configurada."));
  }

  googleMapsPromise = new Promise((resolve, reject) => {
    const existingScript = document.querySelector<HTMLScriptElement>(
      'script[data-google-maps-sdk="true"]'
    );
    if (existingScript) {
      existingScript.addEventListener("load", () => {
        if (w.google?.maps?.Map) resolve(w.google.maps);
        else reject(new Error("Google Maps carregou sem o objeto google.maps."));
      });
      existingScript.addEventListener("error", () => {
        googleMapsPromise = null;
        reject(new Error("Falha ao carregar Google Maps JS SDK."));
      });
      return;
    }

    const callbackName = "__onGoogleMapsSdkLoaded";
    w[callbackName] = () => {
      try {
        delete w[callbackName];
      } catch {
        w[callbackName] = undefined;
      }
      if (w.google?.maps?.Map) {
        resolve(w.google.maps);
      } else {
        googleMapsPromise = null;
        reject(new Error("Google Maps SDK inicializado sem google.maps.Map."));
      }
    };

    const script = document.createElement("script");
    script.setAttribute("data-google-maps-sdk", "true");
    // Carrega APENAS a biblioteca principal `maps` (sem `places`)
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(
      apiKey
    )}&libraries=maps&v=weekly&language=pt-BR&region=BR&callback=${callbackName}`;
    script.async = true;
    script.defer = true;
    script.onerror = () => {
      googleMapsPromise = null;
      reject(new Error("Erro de rede ao carregar Google Maps JS SDK."));
    };
    document.head.appendChild(script);
  });

  return googleMapsPromise;
}
