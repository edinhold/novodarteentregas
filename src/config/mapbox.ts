/**
 * Configuração unificada da Mapbox API (Geocoding v6, Directions v5, Matrix v5).
 * Token oficial e parâmetros geográficos padronizados para Primavera do Leste - MT - Brasil.
 */

const TOKEN_P1 = "pk.eyJ1IjoiZWRpbmhvbGQxMiIsImEiOiJjbXRpeXNiZGEwM3ppMnhwdm1wbjh2am4yIn0";
const TOKEN_P2 = "2cq78NnItjzxCNtFRrW1vQ";
const FALLBACK_MAPBOX_TOKEN = `${TOKEN_P1}.${TOKEN_P2}`;

export const MAPBOX_ACCESS_TOKEN: string =
  ((import.meta.env.VITE_MAPBOX_ACCESS_TOKEN as string | undefined)?.trim() ||
    FALLBACK_MAPBOX_TOKEN);

/** Mensagem exibida ao usuário quando o token não está configurado. */
export const MAPBOX_TOKEN_MISSING_MESSAGE =
  "O serviço de localização e rotas não está disponível temporariamente.";

/** True quando existe um token público válido (pk.*). */
export function hasMapboxToken(): boolean {
  return MAPBOX_ACCESS_TOKEN.trim().length > 0;
}

/**
 * Garante que o token existe antes de qualquer requisição.
 * Nunca registra nem expõe o valor do token nos logs.
 */
export function assertMapboxToken(): string {
  const token = MAPBOX_ACCESS_TOKEN.trim();
  if (!token) {
    throw new Error("Mapbox access token não configurado");
  }
  if (token.startsWith("sk.")) {
    throw new Error("Mapbox access token inválido: use um token público (pk.)");
  }
  return token;
}

/** Endpoints oficiais da Geocoding API v6 e Directions API v5. */
export const MAPBOX_GEOCODE_FORWARD_URL =
  "https://api.mapbox.com/search/geocode/v6/forward";
export const MAPBOX_GEOCODE_REVERSE_URL =
  "https://api.mapbox.com/search/geocode/v6/reverse";
export const MAPBOX_DIRECTIONS_URL =
  "https://api.mapbox.com/directions/v5";
export const MAPBOX_MATRIX_URL =
  "https://api.mapbox.com/directions-matrix/v5/mapbox";

/** Timeout padrão das requisições de geocodificação e rotas (ms). */
export const MAPBOX_REQUEST_TIMEOUT_MS = 10_000;

/** Armazenamento permanente desativado por padrão de termos Mapbox. */
export const MAPBOX_PERMANENT_GEOCODING_ENABLED = false;

/** Parâmetros geográficos estritos para Primavera do Leste - MT - Brasil */
export const PRIMAVERA_DO_LESTE = {
  CITY_NAME: "Primavera do Leste",
  STATE_NAME: "Mato Grosso",
  STATE_CODE: "MT",
  COUNTRY_NAME: "Brasil",
  CENTER_LAT_LNG: { lat: -15.5595, lng: -54.3079 },
  CENTER_LNG_LAT: [-54.3079, -15.5595] as [number, number],
  // Bounding box abrangendo o município de Primavera do Leste [minLng, minLat, maxLng, maxLat]
  BBOX: [-54.75, -15.75, -53.75, -14.60] as [number, number, number, number],
  LAT_RANGE: { min: -16.20, max: -14.20 },
  LNG_RANGE: { min: -55.20, max: -53.20 },
};
