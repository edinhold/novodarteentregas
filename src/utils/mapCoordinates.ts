export interface LatLngLiteral {
  lat: number;
  lng: number;
}

/**
 * Converte uma coordenada GeoJSON da Mapbox ([longitude, latitude])
 * para o formato { lat, lng }.
 */
export function geoJsonCoordToLatLng(coord: [number, number]): LatLngLiteral {
  const [lng, lat] = coord;
  return { lat: Number(lat), lng: Number(lng) };
}

/**
 * Converte um array de geometria GeoJSON da Mapbox ([longitude, latitude][])
 * para um caminho { lat, lng }[].
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
 * Converte um array [latitude, longitude][] (retornado por calculateRoute().geometry)
 * para um caminho { lat, lng }[].
 */
export function latLngArrayToLiteralPath(
  coords: Array<[number, number]> | null | undefined
): LatLngLiteral[] {
  if (!Array.isArray(coords)) return [];
  return coords
    .filter((c) => Array.isArray(c) && c.length >= 2 && Number.isFinite(c[0]) && Number.isFinite(c[1]))
    .map(([lat, lng]) => ({ lat: Number(lat), lng: Number(lng) }));
}

/**
 * Converte um caminho { lat, lng }[] para coordenadas GeoJSON ([lng, lat][]) do MapLibre GL.
 */
export function literalPathToGeoJsonCoords(
  path: LatLngLiteral[] | null | undefined
): Array<[number, number]> {
  if (!Array.isArray(path)) return [];
  return path
    .filter((p) => Number.isFinite(p?.lat) && Number.isFinite(p?.lng))
    .map((p) => [p.lng, p.lat]);
}
