// Google Maps API desativada — projeto usa exclusivamente Leaflet/OSM/Nominatim/OSRM.
export const GOOGLE_MAPS_API_KEY = "AIzaSyDcdnB6I1Q50awgozDwmlfH2rSqAnX6_Qk";
export const DEFAULT_CENTER = { lat: -15.5595, lng: -54.3079 }; // Primavera do Leste, MT center
export const DEFAULT_ZOOM = 14;

export const MAP_LAYERS = {
  streets: {
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
