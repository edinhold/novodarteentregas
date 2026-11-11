// Google Maps API desativada — projeto usa exclusivamente Leaflet/OSM/Nominatim/OSRM.
export const GOOGLE_MAPS_API_KEY = "AIzaSyDcdnB6I1Q50awgozDwmlfH2rSqAnX6_Qk";
export const DEFAULT_CENTER = { lat: -15.5595, lng: -54.3079 }; // Primavera do Leste, MT center
export const DEFAULT_ZOOM = 14;

export const MAP_LAYERS = {
  dark: {
    url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    attribution: '&copy; <a href="https://carto.com/">CARTO</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  },
  streets: {
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  },
  osm: {
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  },
  satellite: {
    url: "https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}",
    attribution: "Google",
  },
  google: {
    url: "https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}",
    attribution: "Google",
  },
};

/**
 * Limites geográficos estritos da área urbana e perimetral de Primavera do Leste - MT.
 * Evita que coordenadas em Cuiabá ou fora do município sejam utilizadas incorretamente.
 */
export function isWithinPrimaveraBounds(lat?: number | null, lng?: number | null): boolean {
  if (lat == null || lng == null || !isFinite(lat) || !isFinite(lng)) return false;
  return lat >= -15.80 && lat <= -15.35 && lng >= -54.55 && lng <= -54.05;
}

/**
 * Coordenadas cadastradas e verificadas das lojas de Primavera do Leste - MT.
 * Utilizado para garantir precisão máxima de rota quando o cadastro no banco estiver nulo ou corrompido.
 */
export const KNOWN_STORE_COORDS: Record<string, { lat: number; lng: number }> = {
  // 1. Alessandra Bolos (Rua Mangueira 1019, Primavera 3)
  "3afe9adf-9545-46d4-8f31-1a4d328df368": { lat: -15.523614, lng: -54.328506 },
  // 2. Digital Box (Avenida Porto Alegre 488, Centro)
  "3d2abff9-1818-45bd-bc20-fccd46600543": { lat: -15.558044, lng: -54.297390 },
  // 3. Donna Flor Floricultura (Avenida Campo Grande 434, Centro)
  "11f20be3-d8b9-46a4-adce-e2b52a52e6ae": { lat: -15.561535, lng: -54.303166 },
  // 4. DUARTE INFORMATICA E MARKETING DIGITAL (Ponto central de atendimento Primavera do Leste)
  "01bcdf7b-001b-4a8f-a674-a4bb4e7a50ea": { lat: -15.555758, lng: -54.281991 },
  // 5. GEBON BURITIS (Avenida Carnaúba 706, Buritis)
  "d2db2a3b-914d-4e28-beb5-98bf94873cba": { lat: -15.527935, lng: -54.329974 },
  // 6. Infocell (Rua Guapeva 490, Primavera 3)
  "621d2207-49fa-4502-9e44-e8681e289892": { lat: -15.527356, lng: -54.327039 },
  // 7. Jó cakes (Rua Murici 1873, Buritis)
  "36685b95-fc3c-4c79-8c09-acb2fad8869b": { lat: -15.526648, lng: -54.333858 },
  // 8. Lanchonete Duarte (Rua das Flores 123)
  "8e853c5f-be7a-459d-adc3-8f8868207028": { lat: -15.557225, lng: -54.297523 },
  // 9. Luis Eletrônicos (Avenida Florianópolis 618, Centro)
  "44bcbfb7-d05c-47da-8c4c-b0ddef5add41": { lat: -15.553524, lng: -54.291589 },
  // 10. Nemi Burg (Rua Anaiaçu 08, Primavera 2)
  "79cbe5e0-8dc5-4048-b86d-50a11fa8761e": { lat: -15.535599, lng: -54.299950 },
  // 11. Neofarma (Avenida Califórnia 826, Primavera 3)
  "a4002db5-4092-4931-a04d-40860ba44e97": { lat: -15.522584, lng: -54.332490 },
  // 12. Neofarma Bh (Avenida Belo Horizonte 1989, Centro)
  "fba68e85-be21-4afe-8042-ac07ea9fe84f": { lat: -15.548486, lng: -54.293056 },
  // 13. Pizzaria Por do Sol (Avenida Carnaúba 723, Buritis)
  "457fb38f-117e-4c27-b1b8-cad602a887cc": { lat: -15.528190, lng: -54.330111 },
  // 14. ponto fresco frutaria (Avenida Carnaúba 873, Buritis)
  "0102179c-f344-4ffd-8823-5c6b1607e726": { lat: -15.528592, lng: -54.332598 },
  // 15. Rafah Grill lanches (Rua Bonina 121, Jardim Universitário)
  "897bb740-e355-411a-a9fe-a982566b1ba1": { lat: -15.553255, lng: -54.279697 },
  // 16. Raízes do Cerrado (Rua Jacarandá 813, Primavera 3)
  "8d72f0d3-e521-4c0a-ab10-258f7275793e": { lat: -15.525878, lng: -54.325596 },
  // 17. Roseli Salgados (Rua Tucumã 136, Buritis)
  "505b934b-4023-41bc-996a-20bc031ab108": { lat: -15.531581, lng: -54.337005 },
  // 18. SABOR E ARTE CONFEITARIA (Avenida Califórnia 615, Primavera 3)
  "7db08561-de7e-4d0c-a3f6-f5658409487b": { lat: -15.522462, lng: -54.331096 },
  // 19. Sense Tabacaria (Avenida Califórnia 520, Primavera 3)
  "4c2b003f-0c4c-48a8-bb23-a8e5306da86d": { lat: -15.521962, lng: -54.329996 },
};

/** Mapeamento de nomes normalizados de lojas para coordenadas verificadas */
const KNOWN_STORE_NAMES: Record<string, { lat: number; lng: number }> = {
  "alessandra bolos": { lat: -15.523614, lng: -54.328506 },
  "digital box": { lat: -15.558044, lng: -54.297390 },
  "donna flor": { lat: -15.561535, lng: -54.303166 },
  "donna flor floricultura": { lat: -15.561535, lng: -54.303166 },
  "duarte informatica": { lat: -15.555758, lng: -54.281991 },
  "gebon": { lat: -15.527935, lng: -54.329974 },
  "gebon buritis": { lat: -15.527935, lng: -54.329974 },
  "infocell": { lat: -15.527356, lng: -54.327039 },
  "jo cakes": { lat: -15.526648, lng: -54.333858 },
  "jó cakes": { lat: -15.526648, lng: -54.333858 },
  "lanchonete duarte": { lat: -15.557225, lng: -54.297523 },
  "luis eletronicos": { lat: -15.553524, lng: -54.291589 },
  "luis eletrônicos": { lat: -15.553524, lng: -54.291589 },
  "nemi burg": { lat: -15.535599, lng: -54.299950 },
  "neofarma": { lat: -15.522584, lng: -54.332490 },
  "neofarma bh": { lat: -15.548486, lng: -54.293056 },
  "pizzaria por do sol": { lat: -15.528190, lng: -54.330111 },
  "ponto fresco": { lat: -15.528592, lng: -54.332598 },
  "ponto fresco frutaria": { lat: -15.528592, lng: -54.332598 },
  "rafah grill": { lat: -15.553255, lng: -54.279697 },
  "rafah grill lanches": { lat: -15.553255, lng: -54.279697 },
  "raizes do cerrado": { lat: -15.525878, lng: -54.325596 },
  "raízes do cerrado": { lat: -15.525878, lng: -54.325596 },
  "roseli salgados": { lat: -15.531581, lng: -54.337005 },
  "sabor e arte": { lat: -15.522462, lng: -54.331096 },
  "sabor e arte confeitaria": { lat: -15.522462, lng: -54.331096 },
  "sense tabacaria": { lat: -15.521962, lng: -54.329996 },
};

/** Endereços limpos e verificados de cada loja em Primavera do Leste */
export const KNOWN_STORE_ADDRESSES: Record<string, string> = {
  "3afe9adf-9545-46d4-8f31-1a4d328df368": "Rua Mangueira, 1019 - Primavera III, Primavera do Leste - MT",
  "3d2abff9-1818-45bd-bc20-fccd46600543": "Avenida Porto Alegre, 488 - Centro, Primavera do Leste - MT",
  "11f20be3-d8b9-46a4-adce-e2b52a52e6ae": "Avenida Campo Grande, 434 - Centro, Primavera do Leste - MT",
  "01bcdf7b-001b-4a8f-a674-a4bb4e7a50ea": "Avenida Cuiabá, 120 - Centro, Primavera do Leste - MT",
  "d2db2a3b-914d-4e28-beb5-98bf94873cba": "Avenida Carnaúba, 706 - Buritis, Primavera do Leste - MT",
  "621d2207-49fa-4502-9e44-e8681e289892": "Rua Guapeva, 490 - Primavera III, Primavera do Leste - MT",
  "36685b95-fc3c-4c79-8c09-acb2fad8869b": "Rua Murici, 1873 - Buritis, Primavera do Leste - MT",
  "8e853c5f-be7a-459d-adc3-8f8868207028": "Rua das Flores, 123 - Centro, Primavera do Leste - MT",
  "44bcbfb7-d05c-47da-8c4c-b0ddef5add41": "Avenida Florianópolis, 618 - Centro, Primavera do Leste - MT",
  "79cbe5e0-8dc5-4048-b86d-50a11fa8761e": "Rua Anaiaçu, 08 - Primavera II, Primavera do Leste - MT",
  "a4002db5-4092-4931-a04d-40860ba44e97": "Avenida Califórnia, 826 - Primavera III, Primavera do Leste - MT",
  "fba68e85-be21-4afe-8042-ac07ea9fe84f": "Avenida Belo Horizonte, 1989 - Centro, Primavera do Leste - MT",
  "457fb38f-117e-4c27-b1b8-cad602a887cc": "Avenida Carnaúba, 723 - Buritis, Primavera do Leste - MT",
  "0102179c-f344-4ffd-8823-5c6b1607e726": "Avenida Carnaúba, 873 - Buritis, Primavera do Leste - MT",
  "897bb740-e355-411a-a9fe-a982566b1ba1": "Rua Bonina, 121 - Jardim Universitário, Primavera do Leste - MT",
  "8d72f0d3-e521-4c0a-ab10-258f7275793e": "Rua Jacarandá, 813 - Primavera III, Primavera do Leste - MT",
  "505b934b-4023-41bc-996a-20bc031ab108": "Rua Tucumã, 136 - Buritis, Primavera do Leste - MT",
  "7db08561-de7e-4d0c-a3f6-f5658409487b": "Avenida Califórnia, 615 - Primavera III, Primavera do Leste - MT",
  "4c2b003f-0c4c-48a8-bb23-a8e5306da86d": "Avenida Califórnia, 520 - Primavera III, Primavera do Leste - MT",
};

/**
 * Resolve as coordenadas GPS de um estabelecimento com rigor sênior:
 * 1. Prioriza coordenadas válidas existentes e restritas a Primavera do Leste.
 * 2. Se nulas, zeradas ou fora dos limites (ex: Cuiabá), consulta coordenadas verificadas por ID.
 * 3. Se não encontrar por ID, consulta por nome normalizado da loja.
 * 4. Fallback seguro para o centro de Primavera do Leste.
 */
export function resolveStoreCoordinates(
  restaurant?: {
    id?: string;
    name?: string | null;
    address?: string | null;
    latitude?: number | string | null;
    longitude?: number | string | null;
  } | null,
  fallbackLat?: number | string | null,
  fallbackLng?: number | string | null
): { lat: number; lng: number } {
  // 1. Se coordenadas de fallback foram passadas (ex: de delivery_request.pickup_lat/pickup_lng)
  if (fallbackLat != null && fallbackLng != null) {
    const fLat = Number(fallbackLat);
    const fLng = Number(fallbackLng);
    if (!isNaN(fLat) && !isNaN(fLng) && fLat !== 0 && fLng !== 0 && isWithinPrimaveraBounds(fLat, fLng)) {
      return { lat: fLat, lng: fLng };
    }
  }

  // 2. Se o restaurante possui latitude/longitude válidos DENTRO dos limites de Primavera do Leste
  if (restaurant?.latitude != null && restaurant?.longitude != null) {
    const lat = Number(restaurant.latitude);
    const lng = Number(restaurant.longitude);
    if (!isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0 && isWithinPrimaveraBounds(lat, lng)) {
      return { lat, lng };
    }
  }

  // 3. Consulta por ID verificado no dicionário de lojas
  if (restaurant?.id && KNOWN_STORE_COORDS[restaurant.id]) {
    return KNOWN_STORE_COORDS[restaurant.id];
  }

  // 4. Consulta por nome normalizado da loja
  if (restaurant?.name) {
    const norm = restaurant.name.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    for (const [key, coords] of Object.entries(KNOWN_STORE_NAMES)) {
      const keyNorm = key.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      if (norm.includes(keyNorm) || keyNorm.includes(norm)) {
        return coords;
      }
    }
  }

  // 5. Consulta por palavras-chave do endereço (ex: "Olivio Bissoloti", "Belo Horizonte", etc.)
  if (restaurant?.address) {
    const addrNorm = restaurant.address.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (addrNorm.includes("olivio bissoloti") || addrNorm.includes("parque eldorado")) {
      return { lat: -15.568471, lng: -54.314227 };
    }
    if (addrNorm.includes("belo horizonte") && (addrNorm.includes("1222") || addrNorm.includes("1989") || addrNorm.includes("centro"))) {
      return { lat: -15.548486, lng: -54.293056 };
    }
    if (addrNorm.includes("rio de janeiro") && addrNorm.includes("747")) {
      return { lat: -15.5458, lng: -54.3216 };
    }
    if (addrNorm.includes("campo grande") && addrNorm.includes("836")) {
      return { lat: -15.5562, lng: -54.3015 };
    }
    if (addrNorm.includes("cuiaba") && (addrNorm.includes("350") || addrNorm.includes("120") || addrNorm.includes("123"))) {
      return { lat: -15.557342, lng: -54.298214 };
    }
  }

  return { lat: DEFAULT_CENTER.lat, lng: DEFAULT_CENTER.lng };
}

/**
 * Formata o endereço de coleta da loja de forma limpa, completa e sem ambiguidades.
 * Sempre inclui o nome do estabelecimento e garante que 'Primavera do Leste - MT' esteja presente,
 * evitando que navegadores externos (Google Maps / Waze) enviem o motorista para outra cidade.
 */
export function formatStorePickupAddress(
  restaurant?: {
    id?: string;
    name?: string | null;
    address?: string | null;
  } | null,
  overrideAddress?: string | null
): string {
  const storeName = restaurant?.name?.trim() || "Loja Parceira";

  // Se já temos o endereço verificado da base de dados conhecida
  if (restaurant?.id && KNOWN_STORE_ADDRESSES[restaurant.id]) {
    const verified = KNOWN_STORE_ADDRESSES[restaurant.id];
    return `${storeName} - ${verified}`;
  }

  const rawAddr = (overrideAddress || restaurant?.address || "").trim();
  if (!rawAddr || rawAddr.length < 3 || rawAddr.toLowerCase() === "primavera do leste") {
    return `${storeName} - Primavera do Leste - MT`;
  }

  let cleanAddr = rawAddr
    .replace(/,?\s*-?\s*Primavera do Leste(\s*-?\s*MT)?(\s*-?\s*Brasil)?/gi, "")
    .replace(/,\s*,/g, ",")
    .replace(/[,\s]+$/, "")
    .trim();

  return `${storeName} - ${cleanAddr}, Primavera do Leste - MT`;
}


