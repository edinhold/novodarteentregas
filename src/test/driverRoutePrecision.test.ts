import { describe, it, expect, vi } from "vitest";

// Mock helper to simulate the driver routing decision logic
function computeDriverNavigationState(params: {
  activeRequest?: {
    id: string;
    status: string;
    pickup_lat?: number | null;
    pickup_lng?: number | null;
    delivery_lat?: number | null;
    delivery_lng?: number | null;
    restaurants?: { name?: string; latitude?: number | null; longitude?: number | null } | null;
  } | null;
  pendingRequests?: any[];
  driverPosition?: { lat: number; lng: number } | null;
}) {
  const hasActiveDelivery = Boolean(
    params.activeRequest &&
      (params.activeRequest.status === "accepted" || params.activeRequest.status === "picked_up")
  );

  let pickupLocation: { lat: number; lng: number; name?: string } | null = null;
  let deliveryLocation: { lat: number; lng: number; address?: string } | null = null;

  if (hasActiveDelivery && params.activeRequest) {
    if (params.activeRequest.pickup_lat && params.activeRequest.pickup_lng) {
      pickupLocation = {
        lat: Number(params.activeRequest.pickup_lat),
        lng: Number(params.activeRequest.pickup_lng),
        name: params.activeRequest.restaurants?.name || "Coleta",
      };
    }
    if (params.activeRequest.delivery_lat && params.activeRequest.delivery_lng) {
      deliveryLocation = {
        lat: Number(params.activeRequest.delivery_lat),
        lng: Number(params.activeRequest.delivery_lng),
        address: "Entrega",
      };
    }
  }

  // Active route target destination
  const activeStatus = params.activeRequest?.status || null;
  const targetDestination = hasActiveDelivery
    ? activeStatus === "picked_up"
      ? deliveryLocation || pickupLocation
      : pickupLocation || deliveryLocation
    : null;

  return {
    hasActiveDelivery,
    pickupLocation,
    deliveryLocation,
    targetDestination,
    shouldDrawPolyline: Boolean(hasActiveDelivery && params.driverPosition && targetDestination),
  };
}

// Distance calc helper matching DriverDarkMap
function calcDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3;
  const p1 = (lat1 * Math.PI) / 180;
  const p2 = (lat2 * Math.PI) / 180;
  const dp = ((lat2 - lat1) * Math.PI) / 180;
  const dl = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dp / 2) * Math.sin(dp / 2) +
    Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) * Math.sin(dl / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

describe("Driver Map Route Precision & Anti-Flicker Tests", () => {
  it("MUST NOT draw any route polyline when driver has no accepted delivery", () => {
    const state = computeDriverNavigationState({
      activeRequest: null,
      pendingRequests: [
        {
          id: "pending-1",
          pickup_lat: -15.5595,
          pickup_lng: -54.3079,
        },
      ],
      driverPosition: { lat: -15.552, lng: -54.298 },
    });

    expect(state.hasActiveDelivery).toBe(false);
    expect(state.pickupLocation).toBeNull();
    expect(state.deliveryLocation).toBeNull();
    expect(state.targetDestination).toBeNull();
    expect(state.shouldDrawPolyline).toBe(false);
  });

  it("MUST NOT draw route polyline even if pending requests exist in area", () => {
    const state = computeDriverNavigationState({
      activeRequest: undefined,
      pendingRequests: [
        { id: "pending-1", pickup_lat: -15.548, pickup_lng: -54.293 },
        { id: "pending-2", pickup_lat: -15.568, pickup_lng: -54.314 },
      ],
      driverPosition: { lat: -15.555, lng: -54.305 },
    });

    expect(state.hasActiveDelivery).toBe(false);
    expect(state.shouldDrawPolyline).toBe(false);
  });

  it("MUST route to Store (Coleta) when delivery status is 'accepted'", () => {
    const storeLat = -15.548486;
    const storeLng = -54.293056;
    const customerLat = -15.568471;
    const customerLng = -54.314227;

    const state = computeDriverNavigationState({
      activeRequest: {
        id: "active-101",
        status: "accepted",
        pickup_lat: storeLat,
        pickup_lng: storeLng,
        delivery_lat: customerLat,
        delivery_lng: customerLng,
        restaurants: { name: "Burger King" },
      },
      driverPosition: { lat: -15.550, lng: -54.300 },
    });

    expect(state.hasActiveDelivery).toBe(true);
    expect(state.shouldDrawPolyline).toBe(true);
    expect(state.targetDestination?.lat).toBe(storeLat);
    expect(state.targetDestination?.lng).toBe(storeLng);
  });

  it("MUST route to Customer (Entrega) when delivery status is 'picked_up'", () => {
    const storeLat = -15.548486;
    const storeLng = -54.293056;
    const customerLat = -15.568471;
    const customerLng = -54.314227;

    const state = computeDriverNavigationState({
      activeRequest: {
        id: "active-101",
        status: "picked_up",
        pickup_lat: storeLat,
        pickup_lng: storeLng,
        delivery_lat: customerLat,
        delivery_lng: customerLng,
      },
      driverPosition: { lat: -15.550, lng: -54.300 },
    });

    expect(state.hasActiveDelivery).toBe(true);
    expect(state.shouldDrawPolyline).toBe(true);
    expect(state.targetDestination?.lat).toBe(customerLat);
    expect(state.targetDestination?.lng).toBe(customerLng);
  });

  it("calculates distance correctly to prevent GPS jitter re-querying Mapbox", () => {
    // 2 GPS ticks separated by only ~3 meters
    const tick1 = { lat: -15.550000, lng: -54.300000 };
    const tick2 = { lat: -15.550020, lng: -54.300015 };

    const dist = calcDistanceMeters(tick1.lat, tick1.lng, tick2.lat, tick2.lng);
    expect(dist).toBeLessThan(5); // ~2.7m

    // Moving less than 25 meters should be handled in-place without triggering new Mapbox API calls
    const shouldRequery = dist > 25;
    expect(shouldRequery).toBe(false);
  });

  it("triggers route re-query only when driver has moved substantially (>25m)", () => {
    const origin = { lat: -15.550000, lng: -54.300000 };
    const movedFar = { lat: -15.550500, lng: -54.300300 };

    const dist = calcDistanceMeters(origin.lat, origin.lng, movedFar.lat, movedFar.lng);
    expect(dist).toBeGreaterThan(25);

    const shouldRequery = dist > 25;
    expect(shouldRequery).toBe(true);
  });
});

