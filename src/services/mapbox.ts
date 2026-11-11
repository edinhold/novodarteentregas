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
  /** Categoria identificada do local: condomínio, comércio/supermercado, avenida, rua, etc. */
  placeCategory?: string;
  /** Rótulo amigável da categoria (ex: "Condomínio", "Supermercado / Comércio", "Avenida", "Rua") */
  placeCategoryLabel?: string;
}

export type LocationCategoryType =
  | "condominium"
  | "commercial"
  | "avenue"
  | "street"
  | "neighborhood"
  | "other";

export interface LocationCategoryInfo {
  type: LocationCategoryType;
  label: string;
  badge: string;
  iconName: "building" | "store" | "navigation" | "map-pin" | "home";
}

/**
 * Identifica com precisão se o endereço é Condomínio, Supermercado/Comércio, Avenida, Rua, etc.
 */
export function detectLocationCategory(
  name: string,
  fullAddress?: string,
  featureType?: string,
  extra?: { osmClass?: string; osmType?: string; poiCategory?: string }
): LocationCategoryInfo {
  const text = `${name || ""} ${fullAddress || ""}`.toLowerCase();

  // 1. Condomínio e Residenciais Fechados
  if (
    /\b(condom[íi]nio|residencial|edif[íi]cio|ed\.?|cond\.?|res\.?|village|ville|portal|parque dos buritis|cidade jardim|ch[áa]caras|vila|residence|apartamento|apto|bloco|torre)\b/i.test(
      text
    ) ||
    extra?.osmType === "residential" ||
    featureType === "residential"
  ) {
    return {
      type: "condominium",
      label: "Condomínio / Residencial",
      badge: "Condomínio",
      iconName: "building",
    };
  }

  // 2. Supermercados, Mercados, Comércios, Farmácias, Centros Comerciais
  if (
    /\b(supermercado|mercado|atacad[ãa]o|hipermercado|shopping|loja|farm[áa]cia|drogaria|panificadora|padaria|a[çc]ougue|posto|hospital|cl[íi]nica|centro m[ée]dico|restaurante|lanchonete|pizzaria|barbearia|oficina|distribuidora|marmoraria|concession[áa]ria|com[ée]rcio|agropecu[áa]ria|auto pe[çc]as|materiais de constru[çc][ãa]o|hotel|pousada)\b/i.test(
      text
    ) ||
    featureType === "poi" ||
    extra?.osmClass === "shop" ||
    extra?.osmClass === "amenity" ||
    extra?.poiCategory?.includes("grocery") ||
    extra?.poiCategory?.includes("supermarket")
  ) {
    return {
      type: "commercial",
      label: "Supermercado / Comércio",
      badge: "Supermercado / Comércio",
      iconName: "store",
    };
  }

  // 3. Avenidas e Rodovias
  if (
    /\b(avenida|av\.?|av\b|rodovia|rod\.?|rod\b|br-\d+|mt-\d+)\b/i.test(name) ||
    /\b(avenida|av\.?|av\b)\b/i.test(text)
  ) {
    return {
      type: "avenue",
      label: "Avenida / Rodovia",
      badge: "Avenida",
      iconName: "navigation",
    };
  }

  // 4. Ruas, Travessas, Alamedas
  if (
    /\b(rua|r\.?|r\b|travessa|tv\.?|alameda|al\.?|beco|estrada)\b/i.test(name) ||
    /\b(rua|r\.?|travessa|alameda)\b/i.test(text)
  ) {
    return {
      type: "street",
      label: "Rua",
      badge: "Rua",
      iconName: "map-pin",
    };
  }

  // 5. Bairros e Loteamentos
  if (
    featureType === "neighborhood" ||
    featureType === "locality" ||
    /\b(bairro|jardim|jd\.?|parque|pq\.?|setor|centro)\b/i.test(name)
  ) {
    return {
      type: "neighborhood",
      label: "Bairro / Setor",
      badge: "Bairro",
      iconName: "home",
    };
  }

  return {
    type: "other",
    label: "Endereço",
    badge: "Endereço",
    iconName: "map-pin",
  };
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
      locality?: {
        name?: string;
      };
      district?: {
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
  return lat >= -15.80 && lat <= -15.35 && lng >= -54.55 && lng <= -54.05;
}

/**
 * Extrai número do imóvel a partir de uma string de endereço
 */
export function extractHouseNumber(text: string): string {
  if (!text) return "";
  const trimmed = text.trim();

  // Se o texto for apenas o nome de uma rua numerada (ex: "Rua 2", "Rua 15", "Av 1"), não é número de casa
  if (
    /^\s*(?:rua|r\.|av\.|avenida|alameda|travessa|tv\.|rodovia|rod\.)\s+\d+[a-zA-Z]?\s*$/i.test(
      trimmed
    )
  ) {
    return "";
  }

  const patterns = [
    /(?:,|n[ºo°]?|número|num|casa|lote|apto|qd\.?\s*\d+\s*lt\.?)\s*[:.]?\s*(\d{1,6}[a-zA-Z]?)\b/i,
    /,\s*(\d{1,6}[a-zA-Z]?)\b/,
    /\b(\d{1,6}[a-zA-Z]?)\s*$/m,
  ];

  for (const pattern of patterns) {
    const match = trimmed.match(pattern);
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

  // 1. Coordenadas DEVEM estar dentro da área de Primavera do Leste
  if (!isWithinPrimaveraBounds(lat, lng)) {
    return {
      valid: false,
      reason: "O endereço localizado está fora dos limites de Primavera do Leste - MT.",
    };
  }

  const context = feature.properties.context || {};
  const placeName = (context.place?.name || "").toLowerCase().trim();
  const regionCode = (context.region?.region_code || "").toUpperCase().trim();
  const countryCode = (context.country?.country_code || "").toUpperCase().trim();

  // 2. País deve ser Brasil se informado explicitamente
  if (countryCode && countryCode !== "BR") {
    return { valid: false, reason: "Endereço localizado fora do Brasil." };
  }

  // 3. Estado deve ser MT se informado explicitamente
  if (regionCode && regionCode !== "MT") {
    return { valid: false, reason: "Endereço localizado fora de Mato Grosso (MT)." };
  }

  // 4. Se a feição identificou especificamente outro município conhecido fora de Primavera do Leste, rejeitar
  const otherCities = [
    "cuiabá", "cuiaba", "rondonópolis", "rondonopolis", "campo verde",
    "paranatinga", "poxoréu", "poxoreu", "barra do garças", "barra do garcas",
    "sinop", "sorriso", "lucas do rio verde", "nova mutum", "são paulo", "rio de janeiro"
  ];
  if (placeName && otherCities.some(city => placeName.includes(city)) && !placeName.includes("primavera do leste")) {
    return {
      valid: false,
      reason: `O endereço encontrado pertence a outro município (${context.place?.name}). Apenas Primavera do Leste - MT é aceito.`,
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
    (feature.properties.feature_type === "street" || feature.properties.feature_type === "address"
      ? feature.properties.name
      : "") ||
    "";

  if (!street && feature.properties.feature_type !== "place") {
    street = feature.properties.name || "";
  }

  const houseNumber =
    context.address?.address_number ||
    (context.address?.name && /^\d+[a-zA-Z]?$/.test(context.address.name)
      ? context.address.name
      : "") ||
    userTypedNumber ||
    "";

  if (houseNumber && street) {
    const numRegex = new RegExp(`\\s+${houseNumber}$`, "i");
    if (numRegex.test(street)) {
      street = street.replace(numRegex, "").trim();
    }
  }

  // Bairro / localidade: NUNCA usar name_preferred como fallback genérico pois ele contém o nome da rua!
  let neighborhood =
    context.neighborhood?.name ||
    context.locality?.name ||
    context.district?.name ||
    (feature.properties.feature_type === "neighborhood" ? feature.properties.name : "") ||
    "";

  // Se neighborhood for igual ou já estiver contido na rua ou cidade, limpa para evitar duplicidade
  const lowerStreet = street.toLowerCase();
  const lowerNeigh = neighborhood.toLowerCase();
  if (
    lowerNeigh &&
    (lowerNeigh === lowerStreet ||
      lowerStreet.includes(lowerNeigh) ||
      lowerNeigh.includes("primavera do leste"))
  ) {
    neighborhood = "";
  }

  let city = context.place?.name || PRIMAVERA_DO_LESTE.CITY_NAME;
  if (!city || !city.toLowerCase().includes("primavera")) {
    city = PRIMAVERA_DO_LESTE.CITY_NAME;
  }
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
  const categoryInfo = detectLocationCategory(
    feature.properties.name || street,
    fullAddress,
    feature.properties.feature_type,
    { poiCategory: (feature.properties as any).poi_category }
  );

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
    placeCategory: categoryInfo.type,
    placeCategoryLabel: categoryInfo.badge,
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
 * Fallback via OpenStreetMap Nominatim com foco exclusivo em Primavera do Leste - MT
 */
async function fetchNominatimSuggestions(
  query: string,
  limit: number = 5,
  detectedNumber?: string,
  signal?: AbortSignal
): Promise<MapboxParsedAddress[]> {
  const results: MapboxParsedAddress[] = [];
  try {
    const nomQuery = `${query}, Primavera do Leste, MT, Brasil`;
    const nomUrl = `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&countrycodes=br&limit=${limit}&q=${encodeURIComponent(nomQuery)}`;
    const nomRes = await fetch(nomUrl, {
      signal,
      headers: { "Accept-Language": "pt-BR" },
    });
    if (nomRes.ok) {
      const nomData = await nomRes.json();
      if (Array.isArray(nomData)) {
        for (const item of nomData) {
          const latNum = parseFloat(item.lat);
          const lonNum = parseFloat(item.lon);
          if (isValidCoordinate(latNum, lonNum) && isWithinPrimaveraBounds(latNum, lonNum)) {
            const addr = item.address || {};
            const road = addr.road || addr.pedestrian || addr.suburb || (item.display_name ? item.display_name.split(",")[0] : query);
            const suburb = addr.suburb || addr.neighbourhood || addr.city_district || "";
            const hNum = addr.house_number || detectedNumber || "";
            const cat = detectLocationCategory(road || item.display_name, item.display_name, item.type, {
              osmClass: item.class,
              osmType: item.type,
            });
            results.push({
              fullAddress: `${road}${hNum ? ", " + hNum : ""}${suburb ? ", " + suburb : ""}, Primavera do Leste - MT`,
              street: road,
              number: hNum,
              neighborhood: suburb,
              city: "Primavera do Leste",
              state: "Mato Grosso",
              stateCode: "MT",
              country: "Brasil",
              postalCode: addr.postcode || "",
              coordinates: { latitude: latNum, longitude: lonNum },
              lngLat: [lonNum, latNum],
              mapboxId: `osm-${item.place_id || item.osm_id || Math.random().toString(36).substring(7)}`,
              featureType: "address",
              isValidPrimavera: true,
              placeCategory: cat.type,
              placeCategoryLabel: cat.badge,
            });
          }
        }
      }
    }
  } catch (err) {
    console.warn("[NominatimFallback] Erro ao buscar endereços:", err);
  }

  // Fallback para nome de logradouro se a busca exata com número não retornou resultados
  if (results.length === 0 && detectedNumber) {
    const streetOnly = query.replace(new RegExp(`[,\\s]*${detectedNumber}\\b`, "i"), "").trim();
    if (streetOnly.length >= 3 && streetOnly !== query) {
      return fetchNominatimSuggestions(streetOnly, limit, detectedNumber, signal);
    }
  }

  return results;
}

/**
 * 1. AUTOCOMPLETE & BUSCA DE SUGESTÕES (Mapbox Geocoding v6 Forward + OpenStreetMap Fallback)
 */
export async function searchAddressSuggestions(
  query: string,
  options: {
    signal?: AbortSignal;
    limit?: number;
    userNumber?: string;
  } = {}
): Promise<MapboxParsedAddress[]> {
  const token = hasMapboxToken() ? assertMapboxToken() : "";
  const trimmed = query.trim();

  if (trimmed.length < 3) {
    return [];
  }

  const detectedNumber = options.userNumber || extractHouseNumber(trimmed);
  const fullQuery = buildPrimaveraQuery(trimmed);
  const limit = options.limit || 5;

  if (!token) {
    return fetchNominatimSuggestions(trimmed, limit, detectedNumber, options.signal);
  }

  const url = new URL(MAPBOX_GEOCODE_FORWARD_URL);
  url.searchParams.set("q", fullQuery);
  url.searchParams.set("access_token", token);
  url.searchParams.set("country", "br");
  url.searchParams.set("language", "pt");
  url.searchParams.set("limit", limit.toString());
  url.searchParams.set("bbox", PRIMAVERA_DO_LESTE.BBOX.join(","));
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

    if (!response.ok) {
      console.warn(`[searchAddressSuggestions] Mapbox retornou status ${response.status}, usando Nominatim.`);
      return fetchNominatimSuggestions(trimmed, limit, detectedNumber, activeSignal);
    }

    const data = (await response.json()) as MapboxGeocodeResponse;
    const parsedList: MapboxParsedAddress[] = [];

    if (data && Array.isArray(data.features)) {
      for (const feature of data.features) {
        const parsed = parseMapboxFeature(feature, detectedNumber);
        if (parsed.isValidPrimavera) {
          parsedList.push(parsed);
        }
      }
    }

    // Se Mapbox retornou 0 resultados e a busca continha número predial,
    // tenta buscar pelo nome do logradouro para cidades onde a Mapbox só indexa ruas
    if (parsedList.length === 0 && detectedNumber) {
      const streetOnly = trimmed.replace(new RegExp(`[,\\s]*${detectedNumber}\\b`, "i"), "").trim();
      if (streetOnly.length >= 3 && streetOnly !== trimmed) {
        const streetUrl = new URL(MAPBOX_GEOCODE_FORWARD_URL);
        streetUrl.searchParams.set("q", buildPrimaveraQuery(streetOnly));
        streetUrl.searchParams.set("access_token", token);
        streetUrl.searchParams.set("country", "br");
        streetUrl.searchParams.set("language", "pt");
        streetUrl.searchParams.set("limit", limit.toString());
        streetUrl.searchParams.set("bbox", PRIMAVERA_DO_LESTE.BBOX.join(","));
        streetUrl.searchParams.set(
          "proximity",
          `${PRIMAVERA_DO_LESTE.CENTER_LNG_LAT[0]},${PRIMAVERA_DO_LESTE.CENTER_LNG_LAT[1]}`
        );

        try {
          const streetRes = await fetch(streetUrl.toString(), {
            signal: activeSignal,
            headers: { Accept: "application/json" },
          });
          if (streetRes.ok) {
            const streetData = (await streetRes.json()) as MapboxGeocodeResponse;
            if (streetData && Array.isArray(streetData.features)) {
              for (const feature of streetData.features) {
                const parsed = parseMapboxFeature(feature, detectedNumber);
                if (parsed.isValidPrimavera) {
                  parsedList.push(parsed);
                }
              }
            }
          }
        } catch (e) {
          console.warn("[searchAddressSuggestions] Fallback de logradouro na Mapbox falhou:", e);
        }
      }
    }

    // Se a Mapbox retornou menos que o limite, complementa com Nominatim
    if (parsedList.length < limit) {
      const nomFallbacks = await fetchNominatimSuggestions(trimmed, limit - parsedList.length, detectedNumber, activeSignal);
      for (const n of nomFallbacks) {
        const already = parsedList.some(
          (p) => Math.abs(p.coordinates.latitude - n.coordinates.latitude) < 0.0008 &&
                 Math.abs(p.coordinates.longitude - n.coordinates.longitude) < 0.0008
        );
        if (!already) {
          parsedList.push(n);
        }
      }
    }

    return parsedList.length > 0 ? parsedList : fetchNominatimSuggestions(trimmed, limit, detectedNumber, activeSignal);
  } catch (error: any) {
    if (error?.name === "AbortError") {
      return [];
    }
    console.warn("[searchAddressSuggestions] Mapbox falhou, ativando fallback Nominatim:", error);
    return fetchNominatimSuggestions(trimmed, limit, detectedNumber, options.signal);
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
  let suggestions = await searchAddressSuggestions(trimmed, {
    signal: options.signal,
    limit: 3,
    userNumber: detectedNumber,
  });

  // Se não encontrou e possui número, tenta buscar apenas pelo nome da rua
  if (suggestions.length === 0 && detectedNumber) {
    const streetOnly = trimmed.replace(new RegExp(`[,\\s]*${detectedNumber}\\b`, "i"), "").trim();
    if (streetOnly.length >= 3 && streetOnly !== trimmed) {
      suggestions = await searchAddressSuggestions(streetOnly, {
        signal: options.signal,
        limit: 3,
        userNumber: detectedNumber,
      });
    }
  }

  if (suggestions.length === 0) {
    throw new MapboxServiceError(
      "ADDRESS_NOT_FOUND",
      "Não foi possível localizar este endereço em Primavera do Leste - MT. Confira a rua, o número e o bairro ou selecione o ponto no mapa."
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
 * 3. GEOCODIFICAÇÃO REVERSA (Reverse Geocoding v6 + Fallback Resiliente)
 */
export async function reverseGeocode(
  latitude: number,
  longitude: number,
  options: { signal?: AbortSignal } = {}
): Promise<MapboxParsedAddress> {
  if (!isValidCoordinate(latitude, longitude)) {
    throw new MapboxServiceError(
      "INVALID_COORDINATES",
      `Coordenadas geográficas inválidas: lat ${latitude}, lng ${longitude}`
    );
  }

  const token = hasMapboxToken() ? assertMapboxToken() : "";

  if (token) {
    const url = new URL(MAPBOX_GEOCODE_REVERSE_URL);
    url.searchParams.set("longitude", longitude.toString());
    url.searchParams.set("latitude", latitude.toString());
    url.searchParams.set("access_token", token);
    url.searchParams.set("country", "br");
    url.searchParams.set("language", "pt");
    url.searchParams.set("types", "address,street,neighborhood,place");

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), MAPBOX_REQUEST_TIMEOUT_MS);
      const activeSignal = options.signal || controller.signal;

      const response = await fetch(url.toString(), {
        signal: activeSignal,
        headers: { Accept: "application/json" },
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const data = (await response.json()) as MapboxGeocodeResponse;
        if (data.features && data.features.length > 0) {
          return parseMapboxFeature(data.features[0]);
        }
      }
    } catch (error: any) {
      if (error?.name === "AbortError") {
        throw new MapboxServiceError(
          "NETWORK_ERROR",
          "Geocodificação reversa cancelada."
        );
      }
      console.warn("[reverseGeocode] Mapbox falhou, tentando fallback Nominatim:", error);
    }
  }

  // Fallback via Nominatim Reverse
  try {
    const nomUrl = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&addressdetails=1`;
    const nomRes = await fetch(nomUrl, {
      signal: options.signal,
      headers: { "Accept-Language": "pt-BR" },
    });
    if (nomRes.ok) {
      const item = await nomRes.json();
      if (item && item.address) {
        const addr = item.address;
        const road = addr.road || addr.pedestrian || addr.suburb || (item.display_name ? item.display_name.split(",")[0] : "");
        const suburb = addr.suburb || addr.neighbourhood || addr.city_district || "";
        const hNum = addr.house_number || "";
        const cat = detectLocationCategory(road || item.display_name, item.display_name, item.type);
        const fullAddress = `${road || "Rua Local"}${hNum ? ", " + hNum : ""}${suburb ? ", " + suburb : ""}, Primavera do Leste - MT`;

        return {
          fullAddress,
          street: road || "Rua Local",
          number: hNum,
          neighborhood: suburb,
          city: "Primavera do Leste",
          state: "Mato Grosso",
          stateCode: "MT",
          country: "Brasil",
          postalCode: addr.postcode || "",
          coordinates: { latitude, longitude },
          lngLat: [longitude, latitude],
          mapboxId: `osm-rev-${item.place_id || item.osm_id || Math.random().toString(36).substring(7)}`,
          featureType: "address",
          isValidPrimavera: isWithinPrimaveraBounds(latitude, longitude),
          placeCategory: cat.type,
          placeCategoryLabel: cat.badge,
        };
      }
    }
  } catch (nomErr) {
    console.warn("[reverseGeocode] Falha também no fallback Nominatim:", nomErr);
  }

  // Fallback gracioso com formato legível por coordenadas
  return {
    fullAddress: `Ponto no Mapa (${latitude.toFixed(5)}, ${longitude.toFixed(5)}), Primavera do Leste - MT`,
    street: "Ponto no Mapa",
    number: "",
    neighborhood: "",
    city: "Primavera do Leste",
    state: "Mato Grosso",
    stateCode: "MT",
    country: "Brasil",
    postalCode: "",
    coordinates: { latitude, longitude },
    lngLat: [longitude, latitude],
    mapboxId: `coord-${latitude}-${longitude}`,
    featureType: "coordinate",
    isValidPrimavera: isWithinPrimaveraBounds(latitude, longitude),
    placeCategory: "other",
    placeCategoryLabel: "Ponto Selecionado",
  };
}

/**
 * Fallback de rota viária utilizando OpenStreetMap / OSRM
 */
async function fetchOSRMRouteFallback(
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number },
  profile: RouteProfile = "driving",
  signal?: AbortSignal
): Promise<MapboxRouteResult | null> {
  try {
    const osrmProfile = profile === "cycling" ? "bike" : profile === "walking" ? "foot" : "driving";
    const osrmUrl = `https://router.project-osrm.org/route/v1/${osrmProfile}/${origin.lng},${origin.lat};${destination.lng},${destination.lat}?overview=full&geometries=geojson`;
    const res = await fetch(osrmUrl, { signal });
    if (res.ok) {
      const data = await res.json();
      if (data?.routes && data.routes.length > 0) {
        const route = data.routes[0];
        const distanceMeters = Number(route.distance) || 0;
        const durationSeconds = Number(route.duration) || 0;
        const coords = Array.isArray(route.geometry?.coordinates)
          ? (route.geometry.coordinates.map(([lon, lat]: [number, number]) => [lat, lon]) as [number, number][])
          : [];
        return {
          distanceMeters,
          distanceKm: Number((distanceMeters / 1000).toFixed(2)),
          durationSeconds,
          durationMin: durationSeconds / 60,
          geometry: coords,
          profile,
        };
      }
    }
  } catch (err) {
    console.warn("[OSRMRouteFallback] Erro no cálculo OSRM:", err);
  }
  return null;
}

/**
 * Fallback geodésico calibrado para a malha urbana de Primavera do Leste
 */
function calculateHaversineFallback(
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number },
  profile: RouteProfile = "driving"
): MapboxRouteResult {
  const R = 6371;
  const dLat = ((destination.lat - origin.lat) * Math.PI) / 180;
  const dLon = ((destination.lng - origin.lng) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((origin.lat * Math.PI) / 180) *
      Math.cos((destination.lat * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const rawDistKm = R * c;
  const gridDistKm = Math.max(0.5, Number((rawDistKm * 1.25).toFixed(2)));
  const distanceMeters = gridDistKm * 1000;
  const durationMin = (gridDistKm / 28) * 60;

  return {
    distanceMeters,
    distanceKm: gridDistKm,
    durationSeconds: durationMin * 60,
    durationMin,
    geometry: [
      [origin.lat, origin.lng],
      [destination.lat, destination.lng],
    ],
    profile,
  };
}

/**
 * 4. CÁLCULO DE ROTA OFICIAL (Mapbox Directions API v5 com Fallback OSRM/OSM)
 */
export async function calculateRoute(
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number },
  options: RouteProfile | {
    profile?: RouteProfile;
    signal?: AbortSignal;
  } = {}
): Promise<MapboxRouteResult> {
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

  const profile: RouteProfile =
    typeof options === "string"
      ? options
      : options?.profile || "driving";
  const activeSignal =
    typeof options === "object" && options?.signal
      ? options.signal
      : undefined;

  const token = hasMapboxToken() ? assertMapboxToken() : "";

  // Se não houver token configurado, vai direto para OSRM
  if (!token) {
    const osrmRes = await fetchOSRMRouteFallback(origin, destination, profile, activeSignal);
    return osrmRes || calculateHaversineFallback(origin, destination, profile);
  }

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
    const effSignal = activeSignal || controller.signal;

    const response = await fetch(url.toString(), {
      signal: effSignal,
      headers: { Accept: "application/json" },
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      const data = await response.json();
      if (data?.routes && data.routes.length > 0) {
        const route = data.routes[0];
        const distanceMeters = Number(route.distance);
        if (Number.isFinite(distanceMeters) && distanceMeters >= 0) {
          const distanceKm = Number((distanceMeters / 1000).toFixed(2));
          const durationSeconds = Number(route.duration) || 0;
          const durationMin = durationSeconds / 60;
          const leafletGeometry: [number, number][] = Array.isArray(route.geometry?.coordinates)
            ? (route.geometry.coordinates.map(([lon, lat]: [number, number]) => [lat, lon]) as [number, number][])
            : [];

          return {
            distanceMeters,
            distanceKm,
            durationSeconds,
            durationMin,
            geometry: leafletGeometry,
            profile,
          };
        }
      }
    }

    console.warn(`[calculateRoute] Mapbox retornou status ${response.status}, ativando OSRM...`);
    const osrmFallback = await fetchOSRMRouteFallback(origin, destination, profile, activeSignal);
    if (osrmFallback) return osrmFallback;
  } catch (err: any) {
    if (err?.name === "AbortError") {
      throw new MapboxServiceError("NETWORK_ERROR", "Cálculo de rota cancelado.");
    }
    console.warn("[calculateRoute] Mapbox falhou, tentando fallback OSRM:", err);
    const osrmFallback = await fetchOSRMRouteFallback(origin, destination, profile, activeSignal);
    if (osrmFallback) return osrmFallback;
  }

  // Fallback seguro final: malha viária geodésica calibrada
  return calculateHaversineFallback(origin, destination, profile);
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

export interface MapboxMultiStopRouteLeg {
  fromIndex: number;
  toIndex: number;
  distanceMeters: number;
  distanceKm: number;
  durationSeconds: number;
  durationMin: number;
}

export interface MapboxMultiStopRouteResult {
  totalDistanceMeters: number;
  totalDistanceKm: number;
  totalDurationSeconds: number;
  totalDurationMin: number;
  legs: MapboxMultiStopRouteLeg[];
  geometry: [number, number][];
  profile: RouteProfile;
}

function haversineDistanceKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

/**
 * 6. CÁLCULO DE ROTA MULTI-PARADAS UNIFICADA (Mapbox Directions API v5 Multi-Waypoint)
 * Calcula a operação inteira como UMA ÚNICA ROTA: Loja -> Parada 1 -> Parada 2 -> ... -> Parada N
 */
export async function calculateMultiStopRoute(
  origin: { lat: number; lng: number },
  destinations: { lat: number; lng: number }[],
  options: {
    profile?: RouteProfile;
    signal?: AbortSignal;
  } = {}
): Promise<MapboxMultiStopRouteResult> {
  const profile = options.profile || "driving";
  const mapboxProfile =
    profile === "cycling"
      ? "cycling"
      : profile === "walking"
      ? "walking"
      : "driving";

  if (!isValidCoordinate(origin.lat, origin.lng)) {
    throw new MapboxServiceError(
      "INVALID_COORDINATES",
      "Coordenadas da loja inválidas para cálculo de rota."
    );
  }

  if (!destinations || destinations.length === 0) {
    throw new MapboxServiceError(
      "INVALID_COORDINATES",
      "Pelo menos uma parada válida é necessária."
    );
  }

  for (let i = 0; i < destinations.length; i++) {
    const dest = destinations[i];
    if (!isValidCoordinate(dest.lat, dest.lng)) {
      throw new MapboxServiceError(
        "INVALID_COORDINATES",
        `Coordenadas da parada ${i + 1} são inválidas.`
      );
    }
  }

  const waypoints = [origin, ...destinations];
  const coordinatesParam = waypoints
    .map((pt) => `${pt.lng},${pt.lat}`)
    .join(";");

  const token = assertMapboxToken();
  const url = new URL(
    `${MAPBOX_DIRECTIONS_URL}/mapbox/${mapboxProfile}/${coordinatesParam}`
  );
  url.searchParams.set("access_token", token);
  url.searchParams.set("geometries", "geojson");
  url.searchParams.set("overview", "full");
  url.searchParams.set("steps", "false");
  url.searchParams.set("alternatives", "false");

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      MAPBOX_REQUEST_TIMEOUT_MS
    );
    const activeSignal = options.signal || controller.signal;

    const response = await fetch(url.toString(), {
      signal: activeSignal,
      headers: { Accept: "application/json" },
    });

    clearTimeout(timeoutId);

    if (response.status === 401 || response.status === 403) {
      throw new MapboxServiceError(
        "AUTH_ERROR",
        "Chave de acesso da Mapbox não autorizada."
      );
    }
    if (response.status === 429) {
      throw new MapboxServiceError(
        "RATE_LIMIT",
        "Limite de requisições atingido na Mapbox."
      );
    }
    if (!response.ok) {
      throw new MapboxServiceError(
        "MAPBOX_API_ERROR",
        `Erro no cálculo de rota multi-paradas (${response.status})`
      );
    }

    const data = await response.json();
    if (data.code === "NoRoute" || !data.routes || data.routes.length === 0) {
      throw new MapboxServiceError(
        "ROUTE_NOT_FOUND",
        "Não foi possível encontrar uma rota transitável conectando todas as paradas."
      );
    }

    const route = data.routes[0];
    const rawTotalMeters = Number(route.distance);
    if (!Number.isFinite(rawTotalMeters) || rawTotalMeters < 0) {
      throw new MapboxServiceError(
        "MAPBOX_API_ERROR",
        "Distância total retornada pela Mapbox é inválida."
      );
    }

    const totalDistanceMeters = rawTotalMeters;
    const totalDistanceKm = totalDistanceMeters / 1000;
    const totalDurationSeconds = Number(route.duration) || 0;
    const totalDurationMin = totalDurationSeconds / 60;

    const rawLegs = Array.isArray(route.legs) ? route.legs : [];
    const legs: MapboxMultiStopRouteLeg[] = [];

    for (let i = 0; i < destinations.length; i++) {
      const legData = rawLegs[i];
      const legDistMeters = legData ? Number(legData.distance) || 0 : 0;
      const legDurSec = legData ? Number(legData.duration) || 0 : 0;

      legs.push({
        fromIndex: i,
        toIndex: i + 1,
        distanceMeters: legDistMeters,
        distanceKm: legDistMeters / 1000,
        durationSeconds: legDurSec,
        durationMin: legDurSec / 60,
      });
    }

    const leafletGeometry: [number, number][] = Array.isArray(
      route.geometry?.coordinates
    )
      ? route.geometry.coordinates.map(([lon, lat]: [number, number]) => [
          lat,
          lon,
        ])
      : [];

    return {
      totalDistanceMeters,
      totalDistanceKm,
      totalDurationSeconds,
      totalDurationMin,
      legs,
      geometry: leafletGeometry,
      profile,
    };
  } catch (error: any) {
    if (error?.name === "AbortError") {
      throw new MapboxServiceError("NETWORK_ERROR", "Cálculo de rota cancelado.");
    }

    console.warn(
      "[Mapbox] Fallback Haversine sequencial acionado para rota multi-entregas:",
      error
    );

    let fallbackTotalKm = 0;
    const fallbackLegs: MapboxMultiStopRouteLeg[] = [];
    const points = [origin, ...destinations];

    for (let i = 0; i < destinations.length; i++) {
      const pFrom = points[i];
      const pTo = points[i + 1];
      const legKm = haversineDistanceKm(pFrom, pTo);
      fallbackTotalKm += legKm;
      const legMin = (legKm / 25) * 60;

      fallbackLegs.push({
        fromIndex: i,
        toIndex: i + 1,
        distanceMeters: legKm * 1000,
        distanceKm: legKm,
        durationSeconds: legMin * 60,
        durationMin: legMin,
      });
    }

    return {
      totalDistanceMeters: fallbackTotalKm * 1000,
      totalDistanceKm: fallbackTotalKm,
      totalDurationSeconds: (fallbackTotalKm / 25) * 3600,
      totalDurationMin: (fallbackTotalKm / 25) * 60,
      legs: fallbackLegs,
      geometry: points.map((p) => [p.lat, p.lng]),
      profile,
    };
  }
}

