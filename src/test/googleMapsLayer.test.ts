import { describe, it, expect } from "vitest";
import {
  geoJsonCoordToLatLng,
  geoJsonGeometryToLatLngPath,
  latLngArrayToLiteralPath,
} from "@/utils/googleMapsLoader";

describe("Google Maps Visual Layer & Mapbox Coordinate Conversion", () => {
  it("converte coordenadas GeoJSON da Mapbox [lng, lat] para Google Maps { lat, lng }", () => {
    const mapboxCoord: [number, number] = [-54.328506, -15.523614];
    expect(geoJsonCoordToLatLng(mapboxCoord)).toEqual({
      lat: -15.523614,
      lng: -54.328506,
    });
  });

  it("converte geometria GeoJSON da Mapbox ([lng, lat][]) para polilinha do Google Maps ({ lat, lng }[])", () => {
    const mapboxGeoJson: [number, number][] = [
      [-54.3285, -15.5236],
      [-54.3150, -15.5400],
      [-54.2974, -15.5580],
    ];

    expect(geoJsonGeometryToLatLngPath(mapboxGeoJson)).toEqual([
      { lat: -15.5236, lng: -54.3285 },
      { lat: -15.5400, lng: -54.3150 },
      { lat: -15.5580, lng: -54.2974 },
    ]);
  });

  it("converte array [lat, lng][] de calculateRoute().geometry para { lat, lng }[]", () => {
    const routeGeometry: [number, number][] = [
      [-15.5236, -54.3285],
      [-15.5580, -54.2974],
    ];

    expect(latLngArrayToLiteralPath(routeGeometry)).toEqual([
      { lat: -15.5236, lng: -54.3285 },
      { lat: -15.5580, lng: -54.2974 },
    ]);
  });

  it("ignora entradas nulas ou inválidas sem lançar exceções", () => {
    expect(geoJsonGeometryToLatLngPath(null)).toEqual([]);
    expect(latLngArrayToLiteralPath(undefined)).toEqual([]);
  });
});
