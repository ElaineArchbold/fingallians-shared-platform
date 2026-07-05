import { useRef, useState } from "react";

function distanceBetween(a, b) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;

  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;

  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function totalDistanceKm(points) {
  return points.reduce((sum, point, index) => {
    if (index === 0) return sum;
    return sum + distanceBetween(points[index - 1], point);
  }, 0);
}

export function useRunLogger() {
  const [tracking, setTracking] = useState(false);
  const [paused, setPaused] = useState(false);
  const [points, setPoints] = useState([]);
  const [elapsed, setElapsed] = useState(0);
  const [gpsStatus, setGpsStatus] = useState("Ready");

  const watchRef = useRef(null);
  const timerRef = useRef(null);
  const pointsRef = useRef([]);
  const elapsedRef = useRef(0);
  const pausedRef = useRef(false);

  function start() {
    if (!navigator.geolocation) {
      setGpsStatus("GPS is not available on this device.");
      return;
    }

    setTracking(true);
    setPaused(false);
    pausedRef.current = false;
    setGpsStatus("Finding GPS…");

    timerRef.current = window.setInterval(() => {
      if (pausedRef.current) return;
      setElapsed(current => {
        const next = current + 1;
        elapsedRef.current = next;
        return next;
      });
    }, 1000);

    watchRef.current = navigator.geolocation.watchPosition(
      pos => {
        if (pausedRef.current) return;

        const accuracy = Number(pos.coords.accuracy || 999);
        const next = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          acc: accuracy,
          ts: Date.now(),
        };

        if (!Number.isFinite(next.lat) || !Number.isFinite(next.lng)) return;

        if (accuracy > 60) {
          setGpsStatus(`Weak GPS signal (${Math.round(accuracy)}m)`);
          return;
        }

        setPoints(prev => {
          const last = prev[prev.length - 1];

          if (last) {
            const segmentKm = distanceBetween(last, next);
            const seconds = Math.max(1, (next.ts - last.ts) / 1000);
            const speedKmh = segmentKm / (seconds / 3600);

            if (segmentKm < 0.003) return prev;
            if (segmentKm > 0.35 && speedKmh > 28) {
              setGpsStatus("Ignored one jumpy GPS point.");
              return prev;
            }
          }

          const updated = [...prev, next];
          pointsRef.current = updated;
          setGpsStatus(`GPS active · ${Math.round(accuracy)}m accuracy`);
          return updated;
        });
      },
      () => {
        setGpsStatus("GPS signal dropped. Still waiting for a new fix.");
      },
      {
        enableHighAccuracy: true,
        maximumAge: 1000,
        timeout: 30000,
      }
    );
  }

  function togglePause() {
    pausedRef.current = !pausedRef.current;
    setPaused(pausedRef.current);
  }

  function stop() {
    if (watchRef.current) navigator.geolocation.clearWatch(watchRef.current);
    if (timerRef.current) window.clearInterval(timerRef.current);

    watchRef.current = null;
    timerRef.current = null;
    setTracking(false);
    setPaused(false);
    pausedRef.current = false;

    return {
      points: pointsRef.current,
      elapsed: elapsedRef.current,
      distanceKm: Number(totalDistanceKm(pointsRef.current).toFixed(2)),
      durationMin: Math.max(1, Math.round(elapsedRef.current / 60)),
    };
  }

  function reset() {
    stop();
    setPoints([]);
    setElapsed(0);
    elapsedRef.current = 0;
    pointsRef.current = [];
    setGpsStatus("Ready");
  }

  return {
    tracking,
    paused,
    points,
    elapsed,
    distanceKm: Number(totalDistanceKm(points).toFixed(2)),
    gpsStatus,
    start,
    togglePause,
    stop,
    reset,
  };
}