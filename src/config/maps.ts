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
 * Coordenadas cadastradas e verificadas das lojas de Primavera do Leste - MT.
 * Utilizado para garantir precisão máxima de rota quando o cadastro no banco estiver nulo.
 */
export const KNOWN_STORE_COORDS: Record<string, { lat: number; lng: number }> = {
  "8d72f0d3-e521-4c0a-ab10-258f7275793e": { lat: -15.525878, lng: -54.325596 }, // Raízes do Cerrado (Rua Jacarandá 813)
  "3afe9adf-9545-46d4-8f31-1a4d328df368": { lat: -15.523614, lng: -54.328506 }, // Alessandra Bolos (Rua Mangueira 1019, Primavera 3)
  "36685b95-fc3c-4c79-8c09-acb2fad8869b": { lat: -15.526648, lng: -54.333858 }, // Jó cakes (Rua Murici 1873, Buritis)
  "7db08561-de7e-4d0c-a3f6-f5658409487b": { lat: -15.522462, lng: -54.331096 }, // SABOR E ARTE CONFEITARIA (Av. Califórnia 615, Primavera 3)
  "8e853c5f-be7a-459d-adc3-8f8868207028": { lat: -15.563316, lng: -54.283292 }, // Lanchonete Duarte (Rua das Flores 123)
};

export function resolveStoreCoordinates(restaurant?: {
  id?: string;
  latitude?: number | string | null;
  longitude?: number | string | null;
} | null): { lat: number; lng: number } {
  if (restaurant?.latitude && restaurant?.longitude) {
    const lat = Number(restaurant.latitude);
    const lng = Number(restaurant.longitude);
    if (!isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0) {
      return { lat, lng };
    }
  }
  if (restaurant?.id && KNOWN_STORE_COORDS[restaurant.id]) {
    return KNOWN_STORE_COORDS[restaurant.id];
  }
  return { lat: DEFAULT_CENTER.lat, lng: DEFAULT_CENTER.lng };
}

