/**
 * Serviço oficial unificado da Mapbox API (Geocoding v6, Directions v5, Matrix v5).
 * Cumpre integralmente os requisitos para Primavera do Leste - MT - Brasil.
 */

import {
  assertMapboxToken,
  hasMapboxToken,
  MAPBOX_GEOCODE_FORWARD_URL,
  MAPBOX_GEOCODE_REVERSE_URL,
  MAPBOX_DIRECTIONS_URL,
  MAPBOX_MATRIX_URL,
  MAPBOX_REQUEST_TIMEOUT_MS,
  PRIMAVERA_DO_LESTE,
} from "@/config/mapbox";

export type RouteProfile = "driving" | "cycling" | "walking";

export type MapboxErrorType =
  | "ADDRESS_NOT_FOUND"
  | "OUTSIDE_CITY"
  | "LOW_ACCURACY"
  | "AUTH_ERROR"
  | "RATE_LIMIT"
  | "NETWORK_ERROR"
  | "MAPBOX_API_ERROR"
  | "ROUTE_NOT_FOUND"
  | "INVALID_COORDINATES";

export class MapboxServiceError extends Error {
  public readonly type: MapboxErrorType;
  public readonly userMessage: string;
  public readonly details?: unknown;

  constructor(type: MapboxErrorType, userMessage: string, details?: unknown) {
    super(userMessage);
    this.name = "MapboxServiceError";
    this.type = type;
    this.userMessage = userMessage;
    this.details = details;
  }
}

/** Interface oficial para endereço formatado e componentes extraídos */
export interface MapboxParsedAddress {
  /** Endereço completo formatado: "Rua X, 123, Bairro Y, Primavera do Leste - MT" */
  fullAddress: string;
  /** Nome da rua / logradouro */
  street: string;
  /** Número do imóvel */
  number: string;
  /** Bairro / subdivisão */
  neighborhood: string;
  /** Cidade validada */
  city: string;
  /** Estado ("Mato Grosso") */
  state: string;
  /** Sigla do estado ("MT") */
  stateCode: string;
  /** País ("Brasil") */
  country: string;
  /** CEP / Postcode */
  postalCode: string;
  /** Coordenadas internas { latitude, longitude } */
  coordinates: {
    latitude: number;
    longitude: number;
  };
  /** Coordenadas Mapbox [longitude, latitude] */
  lngLat: [number, number];
  /** Identificador oficial da feição na Mapbox */
  mapboxId: string;
  /** Tipo da feição ("address", "street", "neighborhood", etc.) */
  featureType: string;
  /** Confiança da correspondência */
  confidence?: string;
  /** Indica se pertence comprovadamente a Primavera do Leste - MT */
  isValidPrimavera: boolean;
}

/** Interface da resposta de rota oficial da Mapbox Directions v5 */
export interface MapboxRouteResult {
  /** Distância real da rota em metros (retorno bruto da Mapbox) */
  distanceMeters: number;
  /** Distância convertida UMA ÚNICA VEZ para quilômetros (distanceMeters / 1000) */
  distanceKm: number;
  /** Duração em segundos */
  durationSeconds: number;
  /** Duração em minutos (durationSeconds / 60) */
  durationMin: number;
  /** Geometria da rota adaptada para renderização no Leaflet: [latitude, longitude][] */
  geometry: [number, number][];
  /** Perfil de locomoção utilizado */
  profile: RouteProfile;
}

interface MapboxGeocodeFeature {
  id: string;
  type: "Feature";
  geometry: {
    type: "Point";
    coordinates: [number, number]; // [longitude, latitude]
  };
  properties: {
    mapbox_id?: string;
    feature_type?: string;
    name?: string;
    name_preferred?: string;
    place_formatted?: string;
    full_address?: string;
    coordinates?: {
      longitude: number;
      latitude: number;
    };
    context?: {
      address?: {
        name?: string;
        address_number?: string;
        street_name?: string;
      };
      street?: {
        name?: string;
      };
      neighborhood?: {
        name?: string;
      };
      postcode?: {
        name?: string;
      };
      place?: {
        name?: string;
      };
      region?: {
        name?: string;
        region_code?: string;
      };
      country?: {
        name?: string;
        country_code?: string;
      };
    };
    match_code?: {
      confidence?: string;
    };
  };
}

interface MapboxGeocodeResponse {
  type: "FeatureCollection";
  features: MapboxGeocodeFeature[];
  attribution?: string;
}

/**
 * Validação rigorosa de coordenadas geográficas
 */
export function isValidCoordinate(latitude: number, longitude: number): boolean {
  return (
    typeof latitude === "number" &&
    typeof longitude === "number" &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    !isNaN(latitude) &&
    !isNaN(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180 &&
    !(latitude === 0 && longitude === 0)
  );
}

/**
 * Valida se as coordenadas estão dentro da área de Primavera do Leste - MT
 */
export function isWithinPrimaveraBounds(lat: number, lng: number): boolean {
  if (!isValidCoordinate(lat, lng)) return false;
  return (
    lat >= PRIMAVERA_DO_LESTE.LAT_RANGE.min &&
    lat <= PRIMAVERA_DO_LESTE.LAT_RANGE.max &&
    lng >= PRIMAVERA_DO_LESTE.LNG_RANGE.min &&
    lng <= PRIMAVERA_DO_LESTE.LNG_RANGE.max
  );
}

/**
 * Extrai número do imóvel a partir de uma string de endereço
 */
export function extractHouseNumber(text: string): string {
  if (!text) return "";
  const patterns = [
    /(?:,|n[ºo°]?|número|num|casa|lote|apto|qd\.?\s*\d+\s*lt\.?)\s*[:.]?\s*(\d{1,6}[a-zA-Z]?)\b/i,
    /,\s*(\d{1,6}[a-zA-Z]?)\b/,
    /\b(\d{1,6})\s*$/m,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      return match[1].trim();
    }
  }
  return "";
}

/**
 * Valida se a feição retornada pertence comprovadamente a Primavera do Leste - MT - Brasil
 */
export function validatePrimaveraFeature(feature: MapboxGeocodeFeature): {
  valid: boolean;
  reason?: string;
} {
  const [lng, lat] = feature.geometry.coordinates;

  if (!isValidCoordinate(lat, lng)) {
    return { valid: false, reason: "Coordenadas retornadas pela Mapbox são inválidas." };
  }

  const context = feature.properties.context || {};
  const placeName = (context.place?.name || "").toLowerCase().trim();
  const regionName = (context.region?.name || "").toLowerCase().trim();
  const regionCode = (context.region?.region_code || "").toUpperCase().trim();
  const countryCode = (context.country?.country_code || "").toUpperCase().trim();
  const countryName = (context.country?.name || "").toLowerCase().trim();

  const fullAddress = (feature.properties.full_address || "").toLowerCase();
  const placeFormatted = (feature.properties.place_formatted || "").toLowerCase();

  // 1. País deve ser Brasil
  const isBrazil =
    countryCode === "BR" ||
    countryName.includes("brasil") ||
    countryName.includes("brazil") ||
    fullAddress.includes("brasil");

  if (!isBrazil) {
    return { valid: false, reason: "Endereço localizado fora do Brasil." };
  }

  // 2. Estado deve ser Mato Grosso (MT)
  const isMatoGrosso =
    regionCode === "MT" ||
    regionName.includes("mato grosso") ||
    fullAddress.includes("mato grosso") ||
    placeFormatted.includes("mato grosso") ||
    /\bmt\b/.test(fullAddress) ||
    /\bmt\b/.test(placeFormatted);

  if (!isMatoGrosso) {
    return { valid: false, reason: "Endereço localizado fora de Mato Grosso (MT)." };
  }

  // 3. Município deve ser Primavera do Leste
  const isPrimaveraName =
    placeName.includes("primavera do leste") ||
    fullAddress.includes("primavera do leste") ||
    placeFormatted.includes("primavera do leste");

  const withinBounds = isWithinPrimaveraBounds(lat, lng);

  if (!isPrimaveraName && !withinBounds) {
    return {
      valid: false,
      reason: `O endereço encontrado pertence a outro município (${context.place?.name || "outro município"}). Apenas Primavera do Leste - MT é aceito.`,
    };
  }

  return { valid: true };
}

/**
 * Parser unificado para as feições da Mapbox Geocoding API v6
 */
export function parseMapboxFeature(
  feature: MapboxGeocodeFeature,
  userTypedNumber?: string
): MapboxParsedAddress {
  const [lng, lat] = feature.geometry.coordinates;
  const context = feature.properties.context || {};

  let street =
    context.address?.street_name ||
    context.street?.name ||
    feature.properties.name ||
    "";

  const houseNumber =
    context.address?.address_number ||
    (context.address?.name && /^\d+$/.test(context.address.name)
      ? context.address.name
      : "") ||
    userTypedNumber ||
    "";

  if (houseNumber && street.endsWith(` ${houseNumber}`)) {
    street = street.substring(0, street.length - houseNumber.length - 1).trim();
  }

  const neighborhood =
    context.neighborhood?.name ||
    feature.properties.name_preferred ||
    "";

  const city = context.place?.name || PRIMAVERA_DO_LESTE.CITY_NAME;
  const state = context.region?.name || PRIMAVERA_DO_LESTE.STATE_NAME;
  const stateCode = context.region?.region_code || PRIMAVERA_DO_LESTE.STATE_CODE;
  const country = context.country?.name || PRIMAVERA_DO_LESTE.COUNTRY_NAME;
  const postalCode = context.postcode?.name || "";

  const addressParts: string[] = [];
  if (street) {
    addressParts.push(houseNumber ? `${street}, ${houseNumber}` : street);
  }
  if (neighborhood) {
    addressParts.push(neighborhood);
  }
  addressParts.push(`${city} - ${stateCode}`);

  const fullAddress =
    addressParts.length > 0
      ? addressParts.join(", ")
      : feature.properties.full_address || feature.properties.name || "";

  const validation = validatePrimaveraFeature(feature);

  return {
    fullAddress,
    street,
    number: houseNumber,
    neighborhood,
    city,
    state,
    stateCode,
    country,
    postalCode,
    coordinates: {
      latitude: lat,
      longitude: lng,
    },
    lngLat: [lng, lat],
    mapboxId: feature.properties.mapbox_id || feature.id,
    featureType: feature.properties.feature_type || "address",
    confidence: feature.properties.match_code?.confidence,
    isValidPrimavera: validation.valid,
  };
}

/**
 * Prepara a query de busca garantindo foco em Primavera do Leste - MT - Brasil
 */
function buildPrimaveraQuery(rawInput: string): string {
  const cleaned = rawInput.trim();
  if (!cleaned) return "";

  const lower = cleaned.toLowerCase();
  const hasCity = lower.includes("primavera do leste");
  const hasState = lower.includes("mato grosso") || /\bmt\b/.test(lower);
  const hasCountry = lower.includes("brasil") || lower.includes("brazil");

  const additions: string[] = [];
  if (!hasCity) additions.push("Primavera do Leste");
  if (!hasState) additions.push("MT");
  if (!hasCountry) additions.push("Brasil");

  return additions.length > 0 ? `${cleaned}, ${additions.join(", ")}` : cleaned;
}

/**
 * 1. AUTOCOMPLETE & BUSCA DE SUGESTÕES (Mapbox Geocoding v6 Forward)
 */
export async function searchAddressSuggestions(
  query: string,
  options: {
    signal?: AbortSignal;
    limit?: number;
    userNumber?: string;
  } = {}
): Promise<MapboxParsedAddress[]> {
  const token = assertMapboxToken();
  const trimmed = query.trim();

  if (trimmed.length < 3) {
    return [];
  }

  const detectedNumber = options.userNumber || extractHouseNumber(trimmed);
  const fullQuery = buildPrimaveraQuery(trimmed);
  const limit = options.limit || 5;

  const url = new URL(MAPBOX_GEOCODE_FORWARD_URL);
  url.searchParams.set("q", fullQuery);
  url.searchParams.set("access_token", token);
  url.searchParams.set("country", "br");
  url.searchParams.set("language", "pt");
  url.searchParams.set("limit", limit.toString());
  url.searchParams.set(
    "proximity",
    `${PRIMAVERA_DO_LESTE.CENTER_LNG_LAT[0]},${PRIMAVERA_DO_LESTE.CENTER_LNG_LAT[1]}`
  );

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), MAPBOX_REQUEST_TIMEOUT_MS);
    const activeSignal = options.signal || controller.signal;

    const response = await fetch(url.toString(), {
      signal: activeSignal,
      headers: { Accept: "application/json" },
    });

    clearTimeout(timeoutId);

    if (response.status === 401 || response.status === 403) {
      throw new MapboxServiceError(
        "AUTH_ERROR",
        "Chave de acesso da Mapbox inválida ou não autorizada. Verifique as configurações."
      );
    }
    if (response.status === 429) {
      throw new MapboxServiceError(
        "RATE_LIMIT",
        "Limite de requisições atinga na Mapbox. Aguarde alguns instantes."
      );
    }
    if (!response.ok) {
      throw new MapboxServiceError(
        "MAPBOX_API_ERROR",
        `Erro no serviço de mapas Mapbox (${response.status})`
      );
    }

    const data = (await response.json()) as MapboxGeocodeResponse;
    if (!data || !Array.isArray(data.features)) {
      return [];
    }

    const parsedList: MapboxParsedAddress[] = [];
    for (const feature of data.features) {
      const parsed = parseMapboxFeature(feature, detectedNumber);
      if (parsed.isValidPrimavera) {
        parsedList.push(parsed);
      }
    }

    return parsedList;
  } catch (error: any) {
    if (error?.name === "AbortError") {
      return [];
    }
    if (error instanceof MapboxServiceError) {
      throw error;
    }
    throw new MapboxServiceError(
      "NETWORK_ERROR",
      "Falha ao conectar com o serviço da Mapbox.",
      error
    );
  }
}

/**
 * 2. GEOCODIFICAÇÃO DIRETA (Forward Geocoding v6)
 */
export async function geocodeAddress(
  address: string,
  options: {
    signal?: AbortSignal;
    houseNumber?: string;
  } = {}
): Promise<MapboxParsedAddress> {
  const trimmed = address.trim();
  if (!trimmed) {
    throw new MapboxServiceError(
      "ADDRESS_NOT_FOUND",
      "Nenhum endereço foi fornecido para localização."
    );
  }

  const detectedNumber = options.houseNumber || extractHouseNumber(trimmed);
  const suggestions = await searchAddressSuggestions(trimmed, {
    signal: options.signal,
    limit: 3,
    userNumber: detectedNumber,
  });

  if (suggestions.length === 0) {
    throw new MapboxServiceError(
      "ADDRESS_NOT_FOUND",
      "Não foi possível localizar este endereço em Primavera do Leste - MT. Confira a rua, o número e o bairro."
    );
  }

  const bestMatch = suggestions[0];
  if (!bestMatch.isValidPrimavera) {
    throw new MapboxServiceError(
      "OUTSIDE_CITY",
      "O endereço encontrado pertence a outro município. Apenas Primavera do Leste - MT é aceito."
    );
  }

  return bestMatch;
}

/**
 * 3. GEOCODIFICAÇÃO REVERSA (Reverse Geocoding v6)
 */
export async function reverseGeocode(
  latitude: number,
  longitude: number,
  options: { signal?: AbortSignal } = {}
): Promise<MapboxParsedAddress> {
  const token = assertMapboxToken();

  if (!isValidCoordinate(latitude, longitude)) {
    throw new MapboxServiceError(
      "INVALID_COORDINATES",
      `Coordenadas geográficas inválidas: lat ${latitude}, lng ${longitude}`
    );
  }

  const url = new URL(MAPBOX_GEOCODE_REVERSE_URL);
  url.searchParams.set("longitude", longitude.toString());
  url.searchParams.set("latitude", latitude.toString());
  url.searchParams.set("access_token", token);
  url.searchParams.set("country", "br");
  url.searchParams.set("language", "pt");
  url.searchParams.set("types", "address,street");

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), MAPBOX_REQUEST_TIMEOUT_MS);
    const activeSignal = options.signal || controller.signal;

    const response = await fetch(url.toString(), {
      signal: activeSignal,
      headers: { Accept: "application/json" },
    });

    clearTimeout(timeoutId);

    if (response.status === 401 || response.status === 403) {
      throw new MapboxServiceError(
        "AUTH_ERROR",
        "Chave de acesso da Mapbox inválida ou não autorizada."
      );
    }
    if (response.status === 429) {
      throw new MapboxServiceError(
        "RATE_LIMIT",
        "Limite de requisições da Mapbox atingido."
      );
    }
    if (!response.ok) {
      throw new MapboxServiceError(
        "MAPBOX_API_ERROR",
        `Erro na geocodificação reversa (${response.status})`
      );
    }

    const data = (await response.json()) as MapboxGeocodeResponse;
    if (!data.features || data.features.length === 0) {
      throw new MapboxServiceError(
        "ADDRESS_NOT_FOUND",
        "Nenhum endereço encontrado para este ponto no mapa."
      );
    }

    const bestFeature = data.features[0];
    return parseMapboxFeature(bestFeature);
  } catch (error: any) {
    if (error?.name === "AbortError") {
      throw new MapboxServiceError(
        "NETWORK_ERROR",
        "Geocodificação reversa cancelada."
      );
    }
    if (error instanceof MapboxServiceError) {
      throw error;
    }
    throw new MapboxServiceError(
      "NETWORK_ERROR",
      "Falha ao conectar com o serviço de geocodificação reversa da Mapbox.",
      error
    );
  }
}

/**
 * 4. CÁLCULO DE ROTA OFICIAL (Mapbox Directions API v5)
 */
export async function calculateRoute(
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number },
  options: {
    profile?: RouteProfile;
    signal?: AbortSignal;
  } = {}
): Promise<MapboxRouteResult> {
  const token = assertMapboxToken();

  if (!isValidCoordinate(origin.lat, origin.lng)) {
    throw new MapboxServiceError(
      "INVALID_COORDINATES",
      "Coordenadas de origem inválidas para cálculo de rota."
    );
  }
  if (!isValidCoordinate(destination.lat, destination.lng)) {
    throw new MapboxServiceError(
      "INVALID_COORDINATES",
      "Coordenadas de destino inválidas para cálculo de rota."
    );
  }

  const profile = options.profile || "driving";
  const mapboxProfile =
    profile === "cycling"
      ? "cycling"
      : profile === "walking"
      ? "walking"
      : "driving";

  // ORDEM ESTRITA MAPBOX: {origem_lng},{origem_lat};{destino_lng},{destino_lat}
  const coordinatesParam = `${origin.lng},${origin.lat};${destination.lng},${destination.lat}`;
  const url = new URL(`${MAPBOX_DIRECTIONS_URL}/mapbox/${mapboxProfile}/${coordinatesParam}`);
  url.searchParams.set("access_token", token);
  url.searchParams.set("geometries", "geojson");
  url.searchParams.set("overview", "full");
  url.searchParams.set("steps", "false");
  url.searchParams.set("alternatives", "false");

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), MAPBOX_REQUEST_TIMEOUT_MS);
    const activeSignal = options.signal || controller.signal;

    const response = await fetch(url.toString(), {
      signal: activeSignal,
      headers: { Accept: "application/json" },
    });

    clearTimeout(timeoutId);

    if (response.status === 401 || response.status === 403) {
      throw new MapboxServiceError(
        "AUTH_ERROR",
        "Chave de acesso da Mapbox não autorizada para serviço de rotas."
      );
    }
    if (response.status === 429) {
      throw new MapboxServiceError(
        "RATE_LIMIT",
        "Limite de requisições de rota atingido."
      );
    }
    if (!response.ok) {
      throw new MapboxServiceError(
        "MAPBOX_API_ERROR",
        `Erro no cálculo de rota (${response.status})`
      );
    }

    const data = await response.json();
    if (data.code === "NoRoute" || !data.routes || data.routes.length === 0) {
      throw new MapboxServiceError(
        "ROUTE_NOT_FOUND",
        "Não foi possível encontrar uma rota transitável entre os dois pontos."
      );
    }

    const route = data.routes[0];
    const distanceMeters = Number(route.distance);
    if (!Number.isFinite(distanceMeters) || distanceMeters < 0) {
      throw new MapboxServiceError(
        "MAPBOX_API_ERROR",
        "Distância retornada pela Mapbox é inválida."
      );
    }

    // CONVERSÃO ÚNICA DE METROS PARA QUILÔMETROS
    const distanceKm = distanceMeters / 1000;
    const durationSeconds = Number(route.duration) || 0;
    const durationMin = durationSeconds / 60;

    // Converte geometria Mapbox [lng, lat] para formato Leaflet [lat, lng]
    const leafletGeometry: [number, number][] = Array.isArray(route.geometry?.coordinates)
      ? route.geometry.coordinates.map(([lon, lat]: [number, number]) => [lat, lon])
      : [];

    return {
      distanceMeters,
      distanceKm,
      durationSeconds,
      durationMin,
      geometry: leafletGeometry,
      profile,
    };
  } catch (error: any) {
    if (error?.name === "AbortError") {
      throw new MapboxServiceError(
        "NETWORK_ERROR",
        "Cálculo de rota cancelado."
      );
    }
    if (error instanceof MapboxServiceError) {
      throw error;
    }
    throw new MapboxServiceError(
      "NETWORK_ERROR",
      "Falha de conexão com a API de rotas da Mapbox.",
      error
    );
  }
}

/**
 * 5. CÁLCULO DE MATRIZ DE DISTÂNCIAS (Mapbox Matrix API v5)
 */
export async function calculateDistanceMatrix(
  origins: { lat: number; lng: number }[],
  destinations: { lat: number; lng: number }[],
  options: {
    profile?: RouteProfile;
    signal?: AbortSignal;
  } = {}
): Promise<{ distancesKm: number[][]; durationsMin: number[][] }> {
  const token = assertMapboxToken();

  const allPoints = [...origins, ...destinations];
  const coordsParam = allPoints.map((p) => `${p.lng},${p.lat}`).join(";");
  const originsIndexes = origins.map((_, i) => i).join(";");
  const destinationsIndexes = destinations.map((_, i) => origins.length + i).join(";");

  const profile = options.profile || "driving";
  const url = new URL(`${MAPBOX_MATRIX_URL}/${profile}/${coordsParam}`);
  url.searchParams.set("access_token", token);
  url.searchParams.set("sources", originsIndexes);
  url.searchParams.set("destinations", destinationsIndexes);
  url.searchParams.set("annotations", "distance,duration");

  const response = await fetch(url.toString(), {
    signal: options.signal,
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new MapboxServiceError(
      "MAPBOX_API_ERROR",
      `Erro na Matrix API Mapbox: ${response.statusText}`
    );
  }

  const data = await response.json();
  const distancesMeters: number[][] = data.distances || [];
  const durationsSec: number[][] = data.durations || [];

  const distancesKm = distancesMeters.map((row) =>
    row.map((meters) => (meters != null ? meters / 1000 : 0))
  );
  const durationsMin = durationsSec.map((row) =>
    row.map((sec) => (sec != null ? sec / 60 : 0))
  );

  return { distancesKm, durationsMin };
}
