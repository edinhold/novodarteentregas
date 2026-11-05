import { describe, it, expect } from "vitest";
import {
  isWithinPrimaveraBounds,
  resolveStoreCoordinates,
  formatStorePickupAddress,
  KNOWN_STORE_COORDS,
  DEFAULT_CENTER,
} from "@/config/maps";

describe("Store Coordinates & Geocoding Resolution Unit Tests", () => {
  it("should validate coordinates within Primavera do Leste bounds and reject outside coordinates", () => {
    // Primavera do Leste valid point
    expect(isWithinPrimaveraBounds(-15.5595, -54.3079)).toBe(true);
    expect(isWithinPrimaveraBounds(-15.568471, -54.314227)).toBe(true);
    expect(isWithinPrimaveraBounds(-15.522584, -54.332490)).toBe(true);

    // Cuiabá point (Duarte Informática previous bad coords) - must be rejected
    expect(isWithinPrimaveraBounds(-15.5978422, -56.0974321)).toBe(false);

    // Brasília point (cellular IP gateway) - must be rejected
    expect(isWithinPrimaveraBounds(-15.7975, -47.8919)).toBe(false);

    // Null Island or extreme coordinates
    expect(isWithinPrimaveraBounds(0, 0)).toBe(false);
    expect(isWithinPrimaveraBounds(-23.5505, -46.6333)).toBe(false); // São Paulo
    expect(isWithinPrimaveraBounds(NaN, NaN)).toBe(false);
  });

  it("should resolve DUARTE INFORMATICA to Primavera do Leste even if provided coords are in Cuiabá", () => {
    const restaurant = {
      id: "01bcdf7b-001b-4a8f-a674-a4bb4e7a50ea",
      name: "DUARTE INFORMATICA",
      latitude: -15.5978422, // Cuiabá!
      longitude: -56.0974321,
    };

    const coords = resolveStoreCoordinates(restaurant);
    expect(coords.lat).toBeCloseTo(-15.555758, 4);
    expect(coords.lng).toBeCloseTo(-54.281991, 4);
    expect(isWithinPrimaveraBounds(coords.lat, coords.lng)).toBe(true);
  });

  it("should resolve stores with null coordinates using known store registry", () => {
    const alessandraBolos = {
      id: "3afe9adf-9545-46d4-8f31-1a4d328df368",
      name: "Alessandra Bolos",
      latitude: null,
      longitude: null,
    };

    const coords = resolveStoreCoordinates(alessandraBolos);
    expect(coords.lat).toBeCloseTo(-15.523614, 4);
    expect(coords.lng).toBeCloseTo(-54.328506, 4);

    const joCakes = {
      name: "Jó cakes",
      latitude: null,
      longitude: null,
    };
    const joCoords = resolveStoreCoordinates(joCakes);
    expect(joCoords.lat).toBeCloseTo(-15.526648, 4);
    expect(joCoords.lng).toBeCloseTo(-54.333858, 4);
  });

  it("should resolve unknown store name by address keywords fallback", () => {
    const unknownStore = {
      name: "Loja Nova do Bairro",
      address: "Rua Olivio Bissoloti, 859, Parque Eldorado",
      latitude: null,
      longitude: null,
    };

    const coords = resolveStoreCoordinates(unknownStore);
    expect(coords.lat).toBeCloseTo(-15.568471, 4);
    expect(coords.lng).toBeCloseTo(-54.314227, 4);
  });

  it("should prioritize valid fallback coordinates passed from delivery_request", () => {
    const restaurant = {
      name: "Loja Qualquer",
      latitude: null,
      longitude: null,
    };

    const coords = resolveStoreCoordinates(restaurant, -15.5540, -54.3010);
    expect(coords.lat).toBeCloseTo(-15.5540, 4);
    expect(coords.lng).toBeCloseTo(-54.3010, 4);
  });

  it("should reject invalid fallback coordinates and use internal registry or center", () => {
    const restaurant = {
      name: "Loja Qualquer Sem Cadastro",
      latitude: null,
      longitude: null,
    };

    // Cuiabá coordinates passed as fallback
    const coords = resolveStoreCoordinates(restaurant, -15.5978, -56.0974);
    expect(coords.lat).toBeCloseTo(DEFAULT_CENTER.lat, 4);
    expect(coords.lng).toBeCloseTo(DEFAULT_CENTER.lng, 4);
  });

  it("should format store pickup address clearly with store name and address", () => {
    const rest = {
      name: "DUARTE INFORMATICA",
      address: "Rua Olivio Bissoloti, 859, Parque Eldorado",
    };

    const formatted = formatStorePickupAddress(rest);
    expect(formatted).toContain("DUARTE INFORMATICA");
    expect(formatted).toContain("Primavera do Leste");
  });

  it("should format store pickup address with override address cleanly", () => {
    const rest = {
      name: "Lanchonete Duarte",
      address: "Primavera do Leste",
    };

    const formatted = formatStorePickupAddress(rest, "Rua Olivio Bissoloti, 859, Primavera do Leste - MT");
    expect(formatted).toContain("Lanchonete Duarte");
    expect(formatted).toContain("Rua Olivio Bissoloti, 859");
    expect(formatted.match(/Primavera do Leste/g)?.length).toBe(1);
  });

  it("should have all registered stores in KNOWN_STORE_COORDS within Primavera bounds", () => {
    expect(Object.keys(KNOWN_STORE_COORDS).length).toBeGreaterThanOrEqual(19);

    for (const [id, coords] of Object.entries(KNOWN_STORE_COORDS)) {
      expect(isWithinPrimaveraBounds(coords.lat, coords.lng)).toBe(true);
    }
  });
});
