/**
 * Configuração da Mapbox API (Geocoding v6, Directions v5, Matrix v5).
 * A Mapbox é usada como provedor unificado para geocodificação, rotas e distância.
 */

export const MAPBOX_ACCESS_TOKEN: string =
  (import.meta.env.VITE_MAPBOX_ACCESS_TOKEN as string | undefined) ?? "";

/** Mensagem exibida ao usuário quando o token não está configurado. */
export const MAPBOX_TOKEN_MISSING_MESSAGE =
  "O serviço de mapas da Mapbox não está configurado.";

/** True quando existe um token público válido (pk.*). */
export function hasMapboxToken(): boolean {
  const token = MAPBOX_ACCESS_TOKEN.trim();
  return token.length > 0 && token.startsWith("pk.");
}

/**
 * Garante que o token existe e é válido antes de qualquer requisição.
 * Nunca registra nem expõe o valor do token.
 */
export function assertMapboxToken(): string {
  const token = MAPBOX_ACCESS_TOKEN.trim();
  if (!token) {
    throw new Error("Mapbox access token não configurado");
  }
  if (token.startsWith("sk.")) {
    throw new Error("Mapbox access token inválido: use um token público (pk.)");
  }
  if (!token.startsWith("pk.")) {
    throw new Error("Mapbox access token inválido: token deve iniciar com pk.");
  }
  return token;
}

/** Endpoints oficiais da Mapbox API (versões estáveis atuais) */
export const MAPBOX_GEOCODE_FORWARD_URL =
  "https://api.mapbox.com/search/geocode/v6/forward";
export const MAPBOX_GEOCODE_REVERSE_URL =
  "https://api.mapbox.com/search/geocode/v6/reverse";
export const MAPBOX_DIRECTIONS_URL =
  "https://api.mapbox.com/directions/v5/mapbox";
export const MAPBOX_MATRIX_URL =
  "https://api.mapbox.com/directions-matrix/v5/mapbox";

/** Timeout padrão das requisições (ms). */
export const MAPBOX_REQUEST_TIMEOUT_MS = 10_000;

/**
 * Constantes geográficas estritas para Primavera do Leste - MT - Brasil
 */
export const PRIMAVERA_DO_LESTE = {
  CITY_NAME: "Primavera do Leste",
  STATE_NAME: "Mato Grosso",
  STATE_CODE: "MT",
  COUNTRY_NAME: "Brasil",
  COUNTRY_CODE: "BR",
  /** Coordenadas centrais [longitude, latitude] para proximidade da Mapbox */
  CENTER_LNG_LAT: [-54.3079, -15.5595] as [number, number],
  /** Coordenadas centrais { lat, lng } para Leaflet */
  CENTER: { lat: -15.5595, lng: -54.3079 },
  /** Bounding box [minLng, minLat, maxLng, maxLat] que abrange todo o município */
  BBOX: [-54.45, -15.70, -54.15, -15.42] as [number, number, number, number],
  /** Limites estritos de latitude e longitude para validação de coordenadas */
  LAT_RANGE: { min: -15.75, max: -15.35 },
  LNG_RANGE: { min: -54.55, max: -54.05 },
};

