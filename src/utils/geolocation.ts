import { Capacitor } from "@capacitor/core";
import { Geolocation } from "@capacitor/geolocation";

export interface LocationResult {
  latitude: number;
  longitude: number;
  accuracy: number;
  heading: number | null;
  speed: number | null;
  timestamp: number;
  isCoarseFallback?: boolean;
}

const STORAGE_KEY = "last_gps_position";

/**
 * Valida se as coordenadas de latitude e longitude são válidas.
 * Latitude deve estar entre -90 e 90, longitude entre -180 e 180, e não podem ser nulas/zeradas (0,0).
 */
export function isValidCoordinate(lat?: number | null, lng?: number | null): boolean {
  if (lat === null || lat === undefined || lng === null || lng === undefined) return false;
  if (!isFinite(lat) || !isFinite(lng)) return false;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return false;
  if (lat === 0 && lng === 0) return false;
  return true;
}

export const getStoredPosition = (): { lat: number; lng: number; acc?: number; ts?: number } | null => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && isValidCoordinate(parsed.lat, parsed.lng)) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
};

export const saveStoredPosition = (lat: number, lng: number, acc?: number) => {
  if (!isValidCoordinate(lat, lng)) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ lat, lng, acc, ts: Date.now() }));
  } catch {}
};

/**
 * Checks and requests location permission both on Capacitor Native and Web Browsers.
 */
export async function requestLocationPermission(): Promise<boolean> {
  try {
    if (Capacitor.isNativePlatform()) {
      const status = await Geolocation.checkPermissions();
      if (status.location === "granted" || status.coarseLocation === "granted") {
        return true;
      }
      const requested = await Geolocation.requestPermissions();
      return requested.location === "granted" || requested.coarseLocation === "granted";
    }

    if (typeof navigator !== "undefined" && "permissions" in navigator) {
      const status = await navigator.permissions.query({ name: "geolocation" as any });
      if (status.state === "granted" || status.state === "prompt") return true;
      if (status.state === "denied") return false;
    }
    return true;
  } catch (e) {
    console.warn("[Geolocation] Permission check error:", e);
    return true; // Fallback to attempting request
  }
}

/**
 * Robustly gets current location with progressive fallback.
 * 1. Tries high-accuracy (satellites) with short timeout (6-8s).
 * 2. If it times out or fails (indoors, low signal), falls back to low-accuracy (Wi-Fi/Cellular network).
 * 3. If getCurrentPosition times out on cold start, listens briefly via watchPosition to grab the first sensor fix.
 * 4. Checks stored position as last resort.
 */
export async function getBestLocation(options?: {
  highAccuracyTimeoutMs?: number;
  coarseTimeoutMs?: number;
  watchTimeoutMs?: number;
}): Promise<LocationResult> {
  const highAccuracyTimeout = options?.highAccuracyTimeoutMs ?? 6000;
  const coarseTimeout = options?.coarseTimeoutMs ?? 7000;
  const watchTimeout = options?.watchTimeoutMs ?? 7000;

  const isNative = Capacitor.isNativePlatform();

  // Helper to fetch via Capacitor plugin
  const fetchCapacitor = async (enableHighAccuracy: boolean, timeout: number): Promise<LocationResult> => {
    const pos = await Geolocation.getCurrentPosition({
      enableHighAccuracy,
      timeout,
      maximumAge: enableHighAccuracy ? 0 : 30000,
    });
    if (!isValidCoordinate(pos.coords.latitude, pos.coords.longitude)) {
      throw new Error("Coordenadas obtidas do GPS são inválidas.");
    }
    return {
      latitude: pos.coords.latitude,
      longitude: pos.coords.longitude,
      accuracy: pos.coords.accuracy,
      heading: pos.coords.heading ?? null,
      speed: pos.coords.speed ?? null,
      timestamp: pos.timestamp,
      isCoarseFallback: !enableHighAccuracy,
    };
  };

  // Helper to fetch via Web Geolocation API
  const fetchWeb = (enableHighAccuracy: boolean, timeout: number): Promise<LocationResult> => {
    return new Promise((resolve, reject) => {
      if (typeof navigator === "undefined" || !navigator.geolocation) {
        reject(new Error("Geolocalização não suportada neste dispositivo."));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (!isValidCoordinate(pos.coords.latitude, pos.coords.longitude)) {
            reject(new Error("Coordenadas obtidas do GPS são inválidas."));
            return;
          }
          resolve({
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
            heading: pos.coords.heading ?? null,
            speed: pos.coords.speed ?? null,
            timestamp: pos.timestamp,
            isCoarseFallback: !enableHighAccuracy,
          });
        },
        (err) => reject(err),
        {
          enableHighAccuracy,
          timeout,
          maximumAge: enableHighAccuracy ? 0 : 30000,
        }
      );
    });
  };

  const tryFetch = async (enableHighAccuracy: boolean, timeout: number): Promise<LocationResult> => {
    if (isNative) {
      try {
        return await fetchCapacitor(enableHighAccuracy, timeout);
      } catch (err) {
        return await fetchWeb(enableHighAccuracy, timeout);
      }
    } else {
      return await fetchWeb(enableHighAccuracy, timeout);
    }
  };

  let firstError: any = null;

  // Attempt 1: High Accuracy (GPS Satellite)
  try {
    const highAccResult = await tryFetch(true, highAccuracyTimeout);
    saveStoredPosition(highAccResult.latitude, highAccResult.longitude, highAccResult.accuracy);
    return highAccResult;
  } catch (err: any) {
    firstError = err;
    console.warn("[Geolocation] High accuracy failed/timed out, attempting coarse location fallback...", err?.message);
  }

  // If permission explicitly denied, rethrow immediately without wasting time
  if (firstError?.code === 1 || firstError?.message?.toLowerCase().includes("denied")) {
    throw firstError;
  }

  // Attempt 2: Coarse Accuracy (Wi-Fi / Cell tower triangulation)
  try {
    const coarseResult = await tryFetch(false, coarseTimeout);
    saveStoredPosition(coarseResult.latitude, coarseResult.longitude, coarseResult.accuracy);
    return coarseResult;
  } catch (err: any) {
    console.warn("[Geolocation] Coarse location failed:", err?.message);
  }

  // Attempt 3: Brief watchPosition lock to capture cold-start GPS fix
  try {
    const watchResult = await new Promise<LocationResult>((resolve, reject) => {
      let unwatch: (() => void) | null = null;
      const timer = setTimeout(() => {
        if (unwatch) unwatch();
        reject(new Error("Timeout ao aguardar fixação do sensor GPS."));
      }, watchTimeout);

      unwatch = watchBestLocation(
        (loc) => {
          if (isValidCoordinate(loc.latitude, loc.longitude)) {
            clearTimeout(timer);
            if (unwatch) unwatch();
            resolve(loc);
          }
        },
        (err) => {
          clearTimeout(timer);
          if (unwatch) unwatch();
          reject(err);
        },
        { enableHighAccuracy: true }
      );
    });

    saveStoredPosition(watchResult.latitude, watchResult.longitude, watchResult.accuracy);
    return watchResult;
  } catch (err: any) {
    console.warn("[Geolocation] Watch fallback failed:", err?.message);
  }

  // Attempt 4: Stored position if valid and recent (< 30 minutes)
  const stored = getStoredPosition();
  if (stored && stored.ts && Date.now() - stored.ts < 30 * 60 * 1000) {
    console.info("[Geolocation] Using recent stored position fallback.");
    return {
      latitude: stored.lat,
      longitude: stored.lng,
      accuracy: stored.acc ?? 100,
      heading: null,
      speed: null,
      timestamp: stored.ts,
      isCoarseFallback: true,
    };
  }

  throw firstError || new Error("Não foi possível obter sua localização.");
}

/**
 * Creates a robust watcher for continuous position updates.
 * Switches to fallback polling if watchPosition stops emitting or times out.
 */
export function watchBestLocation(
  onUpdate: (location: LocationResult) => void,
  onError: (error: any) => void,
  options?: { enableHighAccuracy?: boolean }
): () => void {
  let isCancelled = false;
  let watchId: number | string | null = null;
  const enableHighAccuracy = options?.enableHighAccuracy ?? true;

  const handleSuccess = (lat: number, lng: number, acc: number, hdg: number | null, spd: number | null, ts: number, isCoarse = false) => {
    if (isCancelled) return;
    if (!isValidCoordinate(lat, lng)) return;
    saveStoredPosition(lat, lng, acc);
    onUpdate({
      latitude: lat,
      longitude: lng,
      accuracy: acc,
      heading: hdg,
      speed: spd,
      timestamp: ts,
      isCoarseFallback: isCoarse,
    });
  };

  function startWebWatch() {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      onError(new Error("Geolocalização não suportada"));
      return;
    }

    watchId = navigator.geolocation.watchPosition(
      (pos) => {
        handleSuccess(
          pos.coords.latitude,
          pos.coords.longitude,
          pos.coords.accuracy,
          pos.coords.heading ?? null,
          pos.coords.speed ?? null,
          pos.timestamp || Date.now()
        );
      },
      (err) => {
        if (isCancelled) return;
        onError(err);
      },
      {
        enableHighAccuracy,
        maximumAge: 5000,
        timeout: 20000,
      }
    );
  }

  // 1. Primary watchPosition
  if (Capacitor.isNativePlatform()) {
    Geolocation.watchPosition(
      { enableHighAccuracy, maximumAge: 3000 },
      (pos, err) => {
        if (isCancelled) return;
        if (err || !pos) {
          onError(err || new Error("Sem posição disponível"));
          return;
        }
        handleSuccess(
          pos.coords.latitude,
          pos.coords.longitude,
          pos.coords.accuracy,
          pos.coords.heading ?? null,
          pos.coords.speed ?? null,
          pos.timestamp
        );
      }
    ).then((id) => {
      if (isCancelled) {
        Geolocation.clearWatch({ id });
      } else {
        watchId = id;
      }
    }).catch(() => {
      // If native fails, start web watch fallback
      startWebWatch();
    });
  } else {
    startWebWatch();
  }

  // Return unsubscribe callback
  return () => {
    isCancelled = true;
    if (watchId !== null) {
      if (typeof watchId === "string") {
        Geolocation.clearWatch({ id: watchId }).catch(() => {});
      } else if (typeof watchId === "number" && typeof navigator !== "undefined" && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchId);
      }
    }
  };
}

