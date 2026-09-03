import { useState, useCallback, useRef, useEffect } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { startNoSleepLoop, stopNoSleepLoop } from "@/lib/notificationSound";

interface GPSPosition {
  lat: number;
  lng: number;
}

interface KalmanState {
  lat: number;
  lng: number;
  varLat: number;
  varLng: number;
  speed: number;
  timestamp: number;
}

interface GPSTrackingOptions {
  userId?: string;
  driverId?: string;
  saveIntervalMoving?: number;
  saveIntervalStationary?: number;
  maxAcceptableAccuracy?: number;
  outlierThresholdKmh?: number;
  stationarySpeedThreshold?: number;
}

// Haversine distance in meters
const haversineM = (lat1: number, lng1: number, lat2: number, lng2: number) => {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const isValidCoord = (lat: number, lng: number): boolean =>
  lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180 && lat !== 0 && lng !== 0;

export const useGPSTracking = (options: GPSTrackingOptions = {}) => {
  const {
    userId,
    driverId,
    saveIntervalMoving = 2000,
    saveIntervalStationary = 15000,
    maxAcceptableAccuracy = 300, // Relaxed from 150
    outlierThresholdKmh = 250,   // Relaxed from 200
    stationarySpeedThreshold = 0.2,
  } = options;

  const [position, setPosition] = useState<GPSPosition | null>(() => {
    const saved = localStorage.getItem("last_gps_position");
    return saved ? JSON.parse(saved) : null;
  });
  const [accuracy, setAccuracy] = useState(0);
  const [heading, setHeading] = useState<number | null>(null);
  const [speed, setSpeed] = useState<number | null>(null);
  const [watching, setWatching] = useState(false);
  const [gpsQuality, setGpsQuality] = useState<"excellent" | "good" | "fair" | "poor">("poor");
  const [sampleCount, setSampleCount] = useState(0);
  const [isStationary, setIsStationary] = useState(false);
  const [totalDistance, setTotalDistance] = useState(0);
  const [errorStatus, setErrorStatus] = useState<string | null>(null);
  const [permissionStatus, setPermissionStatus] = useState<PermissionState | "unsupported">("prompt");

  const watchIdRef = useRef<number | null>(null);
  const userIdRef = useRef(userId);
  const driverIdRef = useRef(driverId);
  const optionsRef = useRef(options);
  const lastSavedRef = useRef(0);
  const kalmanRef = useRef<KalmanState | null>(null);
  const historyRef = useRef<Array<{ lat: number; lng: number; acc: number; ts: number }>>([]);
  const discardedCountRef = useRef(0);
  const stationaryCountRef = useRef(0);
  const lastMovingPosRef = useRef<GPSPosition | null>(null);
  const lastAcceptedPosRef = useRef<GPSPosition | null>(null);
  const totalDistanceRef = useRef(0);
  const lastReadingTsRef = useRef<number>(0);
  const lastErrorTsRef = useRef<number>(0);
  const errorToastShownRef = useRef<Record<number, number>>({});
  const watchdogRef = useRef<number | null>(null);
  const restartTimeoutRef = useRef<number | null>(null);
  const wakeLockRef = useRef<any>(null);
  const pollingIntervalRef = useRef<number | null>(null);
  const offlineQueueRef = useRef<any[]>([]);


  // Sync refs
  useEffect(() => {
    userIdRef.current = userId;
    driverIdRef.current = driverId;
    optionsRef.current = options;
  }, [userId, driverId, options]);

  const classifyQuality = useCallback((acc: number) => {
    if (acc <= 5) return "excellent";
    if (acc <= 15) return "good";
    if (acc <= 40) return "fair";
    return "poor";
  }, []);

  // ---------- Adaptive Kalman Filter ----------
  // Key fix: reduce over-smoothing by using speed-adaptive gain
  const applyKalman = useCallback(
    (lat: number, lng: number, acc: number, ts: number, rawSpeed: number | null): GPSPosition => {
      const speedMs = rawSpeed && rawSpeed > 0 ? rawSpeed : 1.4;
      const speedDeg = speedMs / 111_320;
      const dt = kalmanRef.current ? (ts - kalmanRef.current.timestamp) / 1000 : 1;
      // Higher process noise when moving fast = trust measurements more
      const processNoise = speedDeg * speedDeg * dt * (speedMs > 2 ? 2.0 : 1.0);

      if (!kalmanRef.current) {
        kalmanRef.current = {
          lat, lng,
          varLat: acc * acc * 0.0000001,
          varLng: acc * acc * 0.0000001,
          speed: speedMs,
          timestamp: ts,
        };
        return { lat, lng };
      }

      const k = kalmanRef.current;
      k.varLat += processNoise;
      k.varLng += processNoise;

      const measNoise = (acc / 111_320) ** 2;
      const gainLat = k.varLat / (k.varLat + measNoise);
      const gainLng = k.varLng / (k.varLng + measNoise);

      k.lat += gainLat * (lat - k.lat);
      k.lng += gainLng * (lng - k.lng);
      k.varLat *= 1 - gainLat;
      k.varLng *= 1 - gainLng;
      k.speed = speedMs;
      k.timestamp = ts;

      return { lat: k.lat, lng: k.lng };
    },
    []
  );

  // ---------- Outlier detection ----------
  const isOutlier = useCallback(
    (lat: number, lng: number, ts: number): boolean => {
      const history = historyRef.current;
      if (history.length === 0) return false;

      const last = history[history.length - 1];
      const dist = haversineM(last.lat, last.lng, lat, lng);
      const dtSec = (ts - last.ts) / 1000;
      if (dtSec <= 0) return false;

      const speedKmh = (dist / dtSec) * 3.6;
      return speedKmh > outlierThresholdKmh;
    },
    [outlierThresholdKmh]
  );

  // ---------- Weighted average (reduced influence) ----------
  const weightedAverage = useCallback((samples: typeof historyRef.current): GPSPosition | null => {
    if (samples.length === 0) return null;
    if (samples.length === 1) return { lat: samples[0].lat, lng: samples[0].lng };

    let totalWeight = 0;
    let wLat = 0;
    let wLng = 0;

    for (const s of samples) {
      const w = 1 / Math.max(s.acc, 1);
      wLat += s.lat * w;
      wLng += s.lng * w;
      totalWeight += w;
    }

    return { lat: wLat / totalWeight, lng: wLng / totalWeight };
  }, []);

  // ---------- Save to DB with Robust Offline Queue ----------
  const savePositionToDb = useCallback(
    async (lat: number, lng: number, acc: number, hdg: number | null, spd: number | null, stationary: boolean) => {
      const currentUserId = userIdRef.current;
      const currentDriverId = driverIdRef.current;
      if (!currentUserId) return;
      
      const now = Date.now();
      const interval = stationary ? saveIntervalStationary : saveIntervalMoving;
      
      // Still enforce interval even if we queue
      if (now - lastSavedRef.current < interval) return;
      lastSavedRef.current = now;

      const payload = {
        user_id: currentUserId,
        driver_id: currentDriverId || currentUserId,
        latitude: lat,
        longitude: lng,
        accuracy: acc,
        heading: hdg,
        speed: spd,
        updated_at: new Date().toISOString(),
      };

      // Helper to try upsert
      const tryUpsert = async (data: any) => {
        const { error } = await (supabase as any).from("driver_locations").upsert(data, { onConflict: "user_id" });
        if (error) throw error;
        
        // Also update driver active status
        await (supabase as any).from("drivers").update({ is_active: true, updated_at: new Date().toISOString() }).eq("user_id", currentUserId);
      };

      try {
        await tryUpsert(payload);
        
        // Success! Now try to clear the queue if any
        if (offlineQueueRef.current.length > 0) {
          const queue = [...offlineQueueRef.current];
          offlineQueueRef.current = []; // Clear first to avoid loops
          localStorage.removeItem("pending_gps_queue");
          
          // Just sync the most recent 3 points to avoid overloading
          const toSync = queue.slice(-3);
          for (const item of toSync) {
            try { await tryUpsert(item); } catch {}
          }
        }
        
        // If we were showing a connection error, clear it only after success
        if (errorStatus?.includes("conexão")) {
          setErrorStatus(null);
        }
      } catch (e) {
        console.warn("[GPS] DB Sync failed, adding to queue:", e);
        // Add to in-memory queue and persist
        offlineQueueRef.current.push(payload);
        if (offlineQueueRef.current.length > 50) offlineQueueRef.current.shift(); // Limit size
        localStorage.setItem("pending_gps_queue", JSON.stringify(offlineQueueRef.current));
        
        // Only show error if it's been failing for a while (> 15s)
        if (Date.now() - lastReadingTsRef.current > 15_000) {
          setErrorStatus("Erro de conexão. Sincronização pendente...");
        }
      }
    },
    [saveIntervalMoving, saveIntervalStationary, errorStatus]
  );

  // ---------- Process raw GPS reading ----------
  const processReading = useCallback(
    (pos: GeolocationPosition) => {
      const { latitude, longitude, accuracy: acc, heading: hdg, speed: spd } = pos.coords;
      const ts = pos.timestamp || Date.now();

      // 1. Validate coordinates
      if (!isValidCoord(latitude, longitude)) {
        discardedCountRef.current++;
        return;
      }

      // 2. Discard very poor accuracy (relaxed for stability)
      if (acc > maxAcceptableAccuracy) {
        discardedCountRef.current++;
        return;
      }

      // 3. Outlier rejection
      if (isOutlier(latitude, longitude, ts)) {
        discardedCountRef.current++;
        return;
      }

      // 3. Add to sliding window (keep last 5 samples)
      historyRef.current.push({ lat: latitude, lng: longitude, acc, ts });
      if (historyRef.current.length > 5) historyRef.current.shift();

      // 5. Apply Kalman filter
      const kalmanPos = applyKalman(latitude, longitude, acc, ts, spd);

      // 6. Reduced blending — only 15% weighted avg (was 30%) to preserve real path
      const recentSamples = historyRef.current.filter((s) => ts - s.ts < 8_000);
      let finalPos = kalmanPos;

      if (recentSamples.length >= 3) {
        const weighted = weightedAverage(recentSamples);
        if (weighted) {
          finalPos = {
            lat: kalmanPos.lat * 0.85 + weighted.lat * 0.15,
            lng: kalmanPos.lng * 0.85 + weighted.lng * 0.15,
          };
        }
      }

      // 7. Detect stationary state — use both speed AND position change
      const currentSpeed = spd ?? -1; // -1 means GPS didn't report speed
      const hasMovement = lastAcceptedPosRef.current
        ? haversineM(lastAcceptedPosRef.current.lat, lastAcceptedPosRef.current.lng, finalPos.lat, finalPos.lng) > 2
        : true;
      // Only consider stationary if speed is explicitly low AND position didn't change
      const stationary = currentSpeed >= 0 && currentSpeed < stationarySpeedThreshold && !hasMovement;

      if (stationary) {
        stationaryCountRef.current++;
        // Only lock after 15 consecutive stationary readings to avoid premature locking
        if (stationaryCountRef.current >= 15 && lastMovingPosRef.current) {
          finalPos = lastMovingPosRef.current;
        }
      } else {
        stationaryCountRef.current = 0;
        lastMovingPosRef.current = finalPos;
      }

      // 8. Accumulate distance — count when not locked-stationary and accuracy is acceptable
      if (lastAcceptedPosRef.current && !stationary) {
        const segmentM = haversineM(
          lastAcceptedPosRef.current.lat,
          lastAcceptedPosRef.current.lng,
          finalPos.lat,
          finalPos.lng
        );
        // Adaptive max segment based on speed: at 60 km/h with 2s interval ≈ 33m, allow up to 10x
        const maxSegmentM = Math.max(1000, (currentSpeed > 0 ? currentSpeed : 15) * 30);
        // Only count segments > 0.5m (noise) and below adaptive max (anti-teleport)
        if (segmentM > 0.5 && segmentM < maxSegmentM) {
          totalDistanceRef.current += segmentM;
          setTotalDistance(totalDistanceRef.current);
        }
      }
      lastAcceptedPosRef.current = finalPos;

      setIsStationary(stationary);
      setSampleCount((c) => c + 1);
      setPosition(finalPos);
      localStorage.setItem("last_gps_position", JSON.stringify(finalPos));
      setAccuracy(acc);
      setHeading(hdg);
      setSpeed(spd);
      setGpsQuality(classifyQuality(acc));
      setWatching(true);
      setErrorStatus(null);
      lastReadingTsRef.current = Date.now();

      savePositionToDb(finalPos.lat, finalPos.lng, acc, hdg, spd, stationary);
    },
    [applyKalman, isOutlier, weightedAverage, classifyQuality, savePositionToDb, maxAcceptableAccuracy, stationarySpeedThreshold]
  );

  // Throttled toast — avoid spamming the same error repeatedly
  const maybeToastError = useCallback((code: number, msg: string) => {
    const now = Date.now();
    const last = errorToastShownRef.current[code] || 0;
    if (now - last > 30_000) {
      errorToastShownRef.current[code] = now;
      toast.error(msg);
    }
  }, []);

  // ---------- Wake Lock (Keep Screen On) ----------
  const requestWakeLock = useCallback(async () => {
    if ("wakeLock" in navigator && !wakeLockRef.current) {
      try {
        wakeLockRef.current = await (navigator as any).wakeLock.request("screen");
        console.log("[GPS] Wake Lock active");
        wakeLockRef.current.addEventListener("release", () => {
          console.log("[GPS] Wake Lock released");
          wakeLockRef.current = null;
        });
      } catch (err: any) {
        console.warn(`[GPS] Wake Lock failed: ${err.message}`);
      }
    }
  }, []);

  const releaseWakeLock = useCallback(async () => {
    if (wakeLockRef.current) {
      try {
        await wakeLockRef.current.release();
        wakeLockRef.current = null;
      } catch {}
    }
  }, []);

  // ---------- Start / Stop ----------
  const startTracking = useCallback((isRestart = false) => {
    if (!navigator.geolocation) {
      toast.error("GPS não suportado neste dispositivo");
      return;
    }

    // Request wake lock to keep GPS active
    requestWakeLock();
    startNoSleepLoop();

    // Clear any existing watch
    if (watchIdRef.current !== null) {
      try { navigator.geolocation.clearWatch(watchIdRef.current); } catch {}
      watchIdRef.current = null;
    }

    // Only reset state if this is NOT a silent restart/re-tracking attempt
    if (!isRestart) {
      kalmanRef.current = null;
      historyRef.current = [];
      discardedCountRef.current = 0;
      stationaryCountRef.current = 0;
      lastMovingPosRef.current = null;
      lastAcceptedPosRef.current = null;
      totalDistanceRef.current = 0;
      setTotalDistance(0);
      setSampleCount(0);
      setErrorStatus(null);
      lastReadingTsRef.current = Date.now();
      
      // Restore queue from storage if any
      try {
        const savedQueue = localStorage.getItem("pending_gps_queue");
        if (savedQueue) offlineQueueRef.current = JSON.parse(savedQueue);
      } catch {}
    }

    // 1) Quick warm-up: get a fast cached fix
    navigator.geolocation.getCurrentPosition(
      processReading,
      () => {},
      { enableHighAccuracy: false, maximumAge: 60_000, timeout: 5_000 }
    );

    const id = navigator.geolocation.watchPosition(
      processReading,
      (err) => {
        const code = err.code;
        lastErrorTsRef.current = Date.now();

        if (code === err.PERMISSION_DENIED) {
          setErrorStatus("Permissão de localização negada.");
          maybeToastError(code, "Permissão de localização negada.");
          setWatching(false);
          return;
        } 
        
        // For other errors, only show in UI if prolonged
        const sinceLastReading = Date.now() - lastReadingTsRef.current;
        if (sinceLastReading > 15_000) {
          if (code === err.POSITION_UNAVAILABLE) {
            setErrorStatus("Buscando sinal GPS...");
          } else if (code === err.TIMEOUT) {
            setErrorStatus("Sinal GPS instável...");
          } else {
            setErrorStatus("Reconectando GPS...");
          }
        }

        // Silent restart watch after 3s
        if (restartTimeoutRef.current) window.clearTimeout(restartTimeoutRef.current);
        restartTimeoutRef.current = window.setTimeout(() => {
          startTracking(true); // silent restart
        }, 3000);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 30_000, 
      }
    );

    watchIdRef.current = id;
    setWatching(true);

    // 4) Background Heartbeat/Polling: secondary mechanism to watchPosition
    // Some browsers stop watchPosition but allow interval-based getCurrentPosition
    if (pollingIntervalRef.current) window.clearInterval(pollingIntervalRef.current);
    pollingIntervalRef.current = window.setInterval(() => {
      if (document.visibilityState === 'hidden') {
        // Even more critical when hidden
        console.log("[GPS] Polling while in background...");
      }
      navigator.geolocation.getCurrentPosition(
        processReading,
        (err) => console.warn("[GPS] Polling error:", err.message),
        { enableHighAccuracy: true, maximumAge: 0, timeout: 10_000 }
      );
    }, 15_000); // 15s polling interval as fallback

    // 3) Watchdog: Check status every 10s
    if (watchdogRef.current) window.clearInterval(watchdogRef.current);
    watchdogRef.current = window.setInterval(() => {
      requestWakeLock();
      
      const sinceLast = Date.now() - lastReadingTsRef.current;
      
      // If no reading in 15s, try a direct poke
      if (sinceLast > 15_000) {
        console.warn("[GPS] Watchdog: no readings for", sinceLast, "ms. Poking sensor.");
        navigator.geolocation.getCurrentPosition(
          processReading,
          (err) => console.warn("[GPS] Heartbeat poke failed:", err.message),
          { enableHighAccuracy: true, maximumAge: 0, timeout: 8_000 }
        );
        
        // If no reading in 40s, force a restart
        if (sinceLast > 40_000) {
          console.warn("[GPS] Watchdog: critical delay. Silent restart.");
          startTracking(true);
        }
      }
    }, 10_000);
  }, [processReading, maybeToastError, requestWakeLock, errorStatus]);

  const stopTracking = useCallback(() => {
    releaseWakeLock();
    stopNoSleepLoop();
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    if (watchdogRef.current) {
      window.clearInterval(watchdogRef.current);
      watchdogRef.current = null;
    }
    if (restartTimeoutRef.current) {
      window.clearTimeout(restartTimeoutRef.current);
      restartTimeoutRef.current = null;
    }
    if (pollingIntervalRef.current) {
      window.clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
    setWatching(false);
  }, [releaseWakeLock]);

  // Monitor permission
  useEffect(() => {
    if ("permissions" in navigator) {
      navigator.permissions.query({ name: "geolocation" as any }).then((status) => {
        setPermissionStatus(status.state);
        status.onchange = () => setPermissionStatus(status.state);
      });
    } else {
      setPermissionStatus("unsupported");
    }
  }, []);

  // Auto-start on mount or when userId becomes available
  useEffect(() => {
    if (userId && watchIdRef.current === null) {
      startTracking();
    }
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      if (watchdogRef.current) {
        window.clearInterval(watchdogRef.current);
        watchdogRef.current = null;
      }
      if (restartTimeoutRef.current) {
        window.clearTimeout(restartTimeoutRef.current);
        restartTimeoutRef.current = null;
      }
    };
  }, [userId, startTracking]);

  // Restart when tab becomes visible again (mobile browsers pause GPS in background)
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "visible" && userId) {
        requestWakeLock();
        const sinceLast = Date.now() - lastReadingTsRef.current;
        if (sinceLast > 10_000) {
          startTracking();
        }
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onVisibility);
    window.addEventListener("online", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onVisibility);
      window.removeEventListener("online", onVisibility);
    };
  }, [userId, startTracking]);


  return {
    position,
    accuracy,
    heading,
    speed,
    watching,
    gpsQuality,
    sampleCount,
    isStationary,
    totalDistance,
    permissionStatus,
    errorStatus,
    discardedCount: discardedCountRef.current,
    startTracking,
    stopTracking,
  };
};
