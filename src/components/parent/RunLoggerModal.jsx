import { useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, Marker, Polyline, TileLayer, useMap } from "react-leaflet";
import * as htmlToImage from "html-to-image";
import { supabase } from "../../lib/supabaseClient";
import {
  playCountdownGo,
  playCountdownReady,
  playCountdownSet,
  playRunSaved,
} from "../../lib/sounds";

const DEFAULT_CENTER = [53.389, -6.246];

const RUN_COACH_NOTES = [
  "Start steady, listen to your body, and do what you can. If it feels too much, slow down or split the distance over two runs.",
  "Nice and easy for the first minute. Find your rhythm, keep breathing, and build from there.",
  "Run tall, relax your shoulders, and keep your steps light. You have got this.",
  "Do not sprint from the start. A steady run beats a rushed one every time.",
  "Pick a safe route, keep your head up, and enjoy ticking off another challenge run.",
  "Small steps, steady breathing, strong finish. Go at your own pace.",
  "Focus on effort, not speed. Every run counts toward your challenge.",
  "Start calm, stay safe, and remember to smile when you finish."
];

function getRandomCoachNote() {
  return RUN_COACH_NOTES[Math.floor(Math.random() * RUN_COACH_NOTES.length)];
}

function toRad(value) {
  return (value * Math.PI) / 180;
}

function distanceBetween(a, b) {
  const radiusKm = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);

  return radiusKm * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function totalDistanceKm(points) {
  return points
    .slice(1)
    .reduce(
      (total, point, index) => total + distanceBetween(points[index], point),
      0
    );
}


function buildRouteSvgPath(points, width = 500, height = 340, padding = 42) {
  const routePoints = (points || [])
    .map(point => ({
      lat: Number(point?.lat),
      lng: Number(point?.lng),
    }))
    .filter(point => Number.isFinite(point.lat) && Number.isFinite(point.lng));

  if (routePoints.length < 2) return null;

  const lats = routePoints.map(point => point.lat);
  const lngs = routePoints.map(point => point.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);

  const latRange = Math.max(maxLat - minLat, 0.0001);
  const lngRange = Math.max(maxLng - minLng, 0.0001);
  const drawableWidth = width - padding * 2;
  const drawableHeight = height - padding * 2;

  const projected = routePoints.map(point => {
    const x = padding + ((point.lng - minLng) / lngRange) * drawableWidth;
    const y = padding + ((maxLat - point.lat) / latRange) * drawableHeight;

    return {
      x: Number(x.toFixed(1)),
      y: Number(y.toFixed(1)),
    };
  });

  const path = projected
    .map((point, index) => `${index === 0 ? "M" : "L"}${point.x} ${point.y}`)
    .join(" ");

  return {
    path,
    start: projected[0],
    finish: projected[projected.length - 1],
  };
}


function buildScreenshotMapDataUrl(run) {
  const width = 500;
  const height = 340;
  const route = buildRouteSvgPath(run?.routePoints || [], width, height);

  const grid = `
    <path d="M0 68 H500 M0 136 H500 M0 204 H500 M0 272 H500" fill="none" stroke="rgba(85,140,94,0.18)" stroke-width="1"/>
    <path d="M100 0 V340 M200 0 V340 M300 0 V340 M400 0 V340" fill="none" stroke="rgba(85,140,94,0.18)" stroke-width="1"/>
  `;

  const routeMarkup =
    run?.type === "gps" && route
      ? `
        <path d="${route.path}" fill="none" stroke="#b01425" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>
        <circle cx="${route.start.x}" cy="${route.start.y}" r="8" fill="#16843d"/>
        <circle cx="${route.finish.x}" cy="${route.finish.y}" r="10" fill="#b01425"/>
        <text x="${Math.min(476, Math.max(24, route.finish.x + 16))}" y="${Math.min(316, Math.max(24, route.finish.y + 8))}" font-size="25">🏁</text>
      `
      : run?.type === "gps"
        ? `
          <text x="250" y="150" font-size="48" text-anchor="middle">🏃</text>
          <text x="250" y="196" font-size="24" font-weight="900" text-anchor="middle" fill="#351b20">GPS run saved</text>
          <text x="250" y="224" font-size="16" font-weight="700" text-anchor="middle" fill="#7a6269">Route points were not available</text>
        `
        : `
          <text x="250" y="150" font-size="48" text-anchor="middle">📝</text>
          <text x="250" y="196" font-size="24" font-weight="900" text-anchor="middle" fill="#351b20">Manual run entry</text>
          <text x="250" y="224" font-size="16" font-weight="700" text-anchor="middle" fill="#7a6269">No GPS route recorded</text>
        `;

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <rect width="500" height="340" fill="#e8f6e9"/>
      ${grid}
      ${routeMarkup}
    </svg>
  `;

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

function formatDateTime(value) {
  return new Date(value).toLocaleString("en-IE", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function paceFromSeconds(seconds, distanceKm) {
  if (!distanceKm || !seconds) return "—";

  const totalMinutes = seconds / 60 / distanceKm;
  const mins = Math.floor(totalMinutes);
  const secs = Math.round((totalMinutes % 1) * 60);

  return `${mins}:${String(secs).padStart(2, "0")} /km`;
}

function MapAutoCenter({ point }) {
  const map = useMap();

  useEffect(() => {
    if (point) {
      map.setView([point.lat, point.lng], 16);
    }
  }, [map, point]);

  return null;
}

export default function RunLoggerModal({
  activity,
  selectedPlayer,
  onClose,
  onSaved,
  onDeleted,
  manualOnly = false,
}) {
  const [mode, setMode] = useState(manualOnly ? "manual" : "gps");
  const [tracking, setTracking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [screenshotBusy, setScreenshotBusy] = useState(false);
  const [finishedRun, setFinishedRun] = useState(null);
  const [paused, setPaused] = useState(false);
  const [gpsStatus, setGpsStatus] = useState("Ready to start.");
  const [elapsed, setElapsed] = useState(0);
  const [points, setPoints] = useState([]);
  const [showConfirmFinish, setShowConfirmFinish] = useState(false);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const [holdPercent, setHoldPercent] = useState(0);
  const [countdownStep, setCountdownStep] = useState("");
  const [showStartCoachNote, setShowStartCoachNote] = useState(false);
  const [coachNote, setCoachNote] = useState(() => getRandomCoachNote());
  const [showSuccessConfetti, setShowSuccessConfetti] = useState(false);

  const [manualDistance, setManualDistance] = useState(
    activity?.target_unit === "km" ? String(activity.target_value || "") : ""
  );
  const [manualMinutes, setManualMinutes] = useState("");

  const watchRef = useRef(null);
  const timerRef = useRef(null);
  const pointsRef = useRef([]);
  const pausedRef = useRef(false);
  const holdStartRef = useRef(null);
  const holdFrameRef = useRef(null);
  const cardRef = useRef(null);
  const countdownTimeoutRef = useRef(null);
  const coachNoteTimeoutRef = useRef(null);
  const successConfettiTimeoutRef = useRef(null);
  const savingRef = useRef(false);
  const audioContextRef = useRef(null);
  const trackingRef = useRef(false);
  const reconnectTimeoutRef = useRef(null);
  const staleGpsIntervalRef = useRef(null);
  const lastGpsUpdateRef = useRef(0);
  const wakeLockRef = useRef(null);
  const runSessionIdRef = useRef(null);
  const firstFixLoggedRef = useRef(false);
  const reconnectCountRef = useRef(0);
  const staleRecoveryLevelRef = useRef(0);
  const lastTelemetryHeartbeatRef = useRef(0);

  const distanceKm = Number(totalDistanceKm(points).toFixed(2));
  const targetKm =
    activity?.target_unit === "km" ? Number(activity.target_value || 0) : 0;
  const activityWeek = Math.min(
    8,
    Math.max(1, Number(activity?.week_number ?? activity?.week ?? 1))
  );
  const latestPoint = points[points.length - 1] || null;
  const route = useMemo(() => points.map(point => [point.lat, point.lng]), [points]);
  const pace = paceFromSeconds(elapsed, distanceKm);
  const screenshotMapSrc = useMemo(
    () => buildScreenshotMapDataUrl(finishedRun),
    [finishedRun]
  );


  useEffect(() => {
    setMode(manualOnly ? "manual" : "gps");
    setFinishedRun(null);
    setSaving(false);
    savingRef.current = false;
    setManualDistance(activity?.target_unit === "km" ? String(activity.target_value || "") : "");
    setManualMinutes("");
    setCoachNote(getRandomCoachNote());
    setShowStartCoachNote(true);

    if (coachNoteTimeoutRef.current) {
      clearTimeout(coachNoteTimeoutRef.current);
    }

    coachNoteTimeoutRef.current = setTimeout(() => {
      setShowStartCoachNote(false);
      coachNoteTimeoutRef.current = null;
    }, 4500);

    return () => {
      if (coachNoteTimeoutRef.current) {
        clearTimeout(coachNoteTimeoutRef.current);
        coachNoteTimeoutRef.current = null;
      }
    };
  }, [activity?.id, manualOnly, activity?.target_unit, activity?.target_value]);

  useEffect(() => {
    function blockRefresh(event) {
      if (!tracking) return;
      event.preventDefault();
      event.returnValue = "";
    }

    window.addEventListener("beforeunload", blockRefresh);

    return () => {
      window.removeEventListener("beforeunload", blockRefresh);
    };
  }, [tracking]);

  async function logGpsEvent(eventType, extra = {}) {
    const runSessionId = runSessionIdRef.current;

    if (!runSessionId || !selectedPlayer?.id || !activity?.id) return;

    const currentPoints = pointsRef.current || [];

    try {
      const { error } = await supabase.from("gps_run_events").insert({
        run_session_id: runSessionId,
        player_id: selectedPlayer.id,
        activity_id: activity.id,
        event_type: eventType,
        accuracy_m: extra.accuracy_m ?? null,
        point_count: currentPoints.length,
        distance_km: Number(totalDistanceKm(currentPoints).toFixed(3)),
        error_code: extra.error_code ?? null,
        details: {
          week: activityWeek,
          activity_title: activity.title,
          player_name: selectedPlayer.name,
          visibility_state: document.visibilityState,
          reconnect_count: reconnectCountRef.current,
          ...extra.details,
        },
        occurred_at: new Date().toISOString(),
      });

      if (error) console.warn("GPS telemetry insert failed:", eventType, error);
    } catch (error) {
      console.warn("GPS telemetry unavailable:", eventType, error);
    }
  }

  useEffect(() => {
    function handleVisibilityChange() {
      if (!trackingRef.current) return;

      if (document.visibilityState === "hidden") {
        logGpsEvent("app_hidden", {
          details: {
            last_gps_at: lastGpsUpdateRef.current
              ? new Date(lastGpsUpdateRef.current).toISOString()
              : null,
          },
        });
        return;
      }

      if (document.visibilityState === "visible" && !pausedRef.current) {
        logGpsEvent("app_visible", {
          details: {
            last_gps_at: lastGpsUpdateRef.current
              ? new Date(lastGpsUpdateRef.current).toISOString()
              : null,
          },
        });

        requestScreenWakeLock();

        const staleForMs = Date.now() - lastGpsUpdateRef.current;

        if (!lastGpsUpdateRef.current || staleForMs > 10000) {
          restartGpsWatch("GPS reconnecting after the app resumed…", {
            reason: "app_visible_stale",
            stale_for_ms: staleForMs,
          });
        }
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      stopTracking();
      cancelHoldFinish();
    };
  }, []);

  async function requestScreenWakeLock() {
    if (!("wakeLock" in navigator)) return;

    if (wakeLockRef.current && !wakeLockRef.current.released) {
      return;
    }

    try {
      const lock = await navigator.wakeLock.request("screen");
      wakeLockRef.current = lock;
      logGpsEvent("wake_lock_acquired");

      lock.addEventListener("release", () => {
        if (wakeLockRef.current === lock) {
          wakeLockRef.current = null;
        }

        if (trackingRef.current) {
          logGpsEvent("wake_lock_released", {
            details: { unexpected: true },
          });
        }
      });
    } catch (error) {
      console.warn("Screen wake lock unavailable:", error);
      logGpsEvent("wake_lock_unavailable", {
        details: { message: error?.message || String(error) },
      });
    }
  }

  async function releaseScreenWakeLock() {
    const lock = wakeLockRef.current;
    wakeLockRef.current = null;

    if (!lock || lock.released) return;

    try {
      await lock.release();
      logGpsEvent("wake_lock_released", {
        details: { unexpected: false },
      });
    } catch (error) {
      console.warn("Could not release screen wake lock:", error);
    }
  }

  function stopTracking() {
    trackingRef.current = false;
    releaseScreenWakeLock();

    if (watchRef.current !== null) {
      navigator.geolocation.clearWatch(watchRef.current);
      watchRef.current = null;
    }

    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (staleGpsIntervalRef.current) {
      clearInterval(staleGpsIntervalRef.current);
      staleGpsIntervalRef.current = null;
    }

    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    if (countdownTimeoutRef.current) {
      clearTimeout(countdownTimeoutRef.current);
      countdownTimeoutRef.current = null;
    }

    if (coachNoteTimeoutRef.current) {
      clearTimeout(coachNoteTimeoutRef.current);
      coachNoteTimeoutRef.current = null;
    }

    if (successConfettiTimeoutRef.current) {
      clearTimeout(successConfettiTimeoutRef.current);
      successConfettiTimeoutRef.current = null;
    }
  }

  function requestClose() {
    if (tracking) {
      alert("Your run is still tracking. Hold to finish before closing.");
      return;
    }

    onClose();
  }

  function dismissCoachNote() {
    if (coachNoteTimeoutRef.current) {
      clearTimeout(coachNoteTimeoutRef.current);
      coachNoteTimeoutRef.current = null;
    }

    setShowStartCoachNote(false);
  }

  function playRunCompleteDing() {
    playRunSaved();
  }

  function showRunCompleteCelebration() {
    playRunCompleteDing();
    setShowSuccessConfetti(true);

    if (successConfettiTimeoutRef.current) {
      clearTimeout(successConfettiTimeoutRef.current);
    }

    successConfettiTimeoutRef.current = setTimeout(() => {
      setShowSuccessConfetti(false);
      successConfettiTimeoutRef.current = null;
    }, 1400);
  }

  function getAudioContext() {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return null;

      if (!audioContextRef.current || audioContextRef.current.state === "closed") {
        audioContextRef.current = new AudioContext();
      }

      if (audioContextRef.current.state === "suspended") {
        audioContextRef.current.resume?.();
      }

      return audioContextRef.current;
    } catch {
      return null;
    }
  }

  function primeAudioContext() {
    const context = getAudioContext();
    if (!context) return;

    try {
      const oscillator = context.createOscillator();
      const gain = context.createGain();

      gain.gain.setValueAtTime(0.0001, context.currentTime);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + 0.01);
    } catch {
      // Ignore audio priming errors.
    }
  }

  function playCountdownTone(step) {
    if (step === "READY") {
      playCountdownReady();
      return;
    }

    if (step === "SET") {
      playCountdownSet();
      return;
    }

    playCountdownGo();
  }

  function startTrafficLightCountdown() {
    if (!navigator.geolocation) {
      setGpsStatus("GPS is not available. Use manual entry instead.");
      setMode("manual");
      return;
    }

    if (countdownStep || tracking) return;

    const steps = ["READY", "SET", "GO!"];

    steps.forEach((step, index) => {
      countdownTimeoutRef.current = setTimeout(() => {
        setCountdownStep(step);
        playCountdownTone(step);

        if (step === "GO!") {
          countdownTimeoutRef.current = setTimeout(() => {
            setCountdownStep("");
            startGps();
          }, 700);
        }
      }, index * 900);
    });
  }

  function beginStartCountdown() {
    if (!navigator.geolocation) {
      setGpsStatus("GPS is not available. Use manual entry instead.");
      setMode("manual");
      return;
    }

    if (countdownStep || tracking) return;

    dismissCoachNote();
    primeAudioContext();
    startTrafficLightCountdown();
  }

  function acceptGpsPosition(position) {
    if (!trackingRef.current || pausedRef.current) return;

    const accuracy = Number(position.coords.accuracy || 999);
    const nextPoint = {
      lat: Number(position.coords.latitude),
      lng: Number(position.coords.longitude),
      acc: accuracy,
      ts: Date.now(),
    };

    if (!Number.isFinite(nextPoint.lat) || !Number.isFinite(nextPoint.lng)) return;

    lastGpsUpdateRef.current = Date.now();
    staleRecoveryLevelRef.current = 0;

    if (!firstFixLoggedRef.current) {
      firstFixLoggedRef.current = true;
      logGpsEvent("first_fix", { accuracy_m: accuracy });
    }

    if (accuracy > 120) {
      setGpsStatus(`Weak GPS signal (${Math.round(accuracy)}m). Searching for a better fix…`);
      logGpsEvent("weak_signal", { accuracy_m: accuracy });
      return;
    }

    if (Date.now() - lastTelemetryHeartbeatRef.current > 60000) {
      lastTelemetryHeartbeatRef.current = Date.now();
      logGpsEvent("gps_heartbeat", { accuracy_m: accuracy });
    }

    setPoints(previous => {
      const last = previous[previous.length - 1];

      if (last) {
        const segmentKm = distanceBetween(last, nextPoint);
        const seconds = Math.max(1, (nextPoint.ts - last.ts) / 1000);
        const speedKmh = segmentKm / (seconds / 3600);

        if (segmentKm < 0.003) {
          setGpsStatus(`GPS active · accuracy ${Math.round(accuracy)}m`);
          return previous;
        }

        if (segmentKm > 0.35 && speedKmh > 28) {
          setGpsStatus("Ignored one jumpy GPS point. Still tracking.");
          return previous;
        }
      }

      const updated = [...previous, nextPoint];
      pointsRef.current = updated;
      setGpsStatus(`GPS active · accuracy ${Math.round(accuracy)}m`);
      return updated;
    });
  }

  function scheduleGpsReconnect(
    message = "GPS signal dropped. Reconnecting…",
    context = {}
  ) {
    if (!trackingRef.current) return;

    setGpsStatus(message);

    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }

    reconnectTimeoutRef.current = setTimeout(() => {
      reconnectTimeoutRef.current = null;

      if (trackingRef.current && !pausedRef.current) {
        reconnectCountRef.current += 1;
        logGpsEvent("watch_restarted", {
          details: {
            reason: context.reason || "scheduled_reconnect",
            ...context,
          },
        });
        startGpsWatch();
      }
    }, 2000);
  }

  function startGpsWatch() {
    if (!navigator.geolocation || !trackingRef.current) return;

    if (watchRef.current !== null) {
      navigator.geolocation.clearWatch(watchRef.current);
      watchRef.current = null;
    }

    watchRef.current = navigator.geolocation.watchPosition(
      acceptGpsPosition,
      error => {
        console.error("GPS watch error", error);

        if (!trackingRef.current) return;

        if (error?.code === 1) {
          setGpsStatus("Location permission was denied. Enable location access or use manual entry.");
          logGpsEvent("permission_denied", {
            error_code: error.code,
            details: {
              message: error.message || null,
              source: "watch_position",
            },
          });
          return;
        }

        const eventType = error?.code === 3 ? "gps_timeout" : "gps_unavailable";

        logGpsEvent(eventType, {
          error_code: error?.code,
          details: {
            message: error?.message || null,
            source: "watch_position",
          },
        });

        scheduleGpsReconnect(
          error?.code === 3
            ? "GPS timed out. Reconnecting…"
            : "GPS signal dropped. Reconnecting…",
          {
            reason: eventType,
            error_code: error?.code || null,
          }
        );
      },
      {
        enableHighAccuracy: true,
        maximumAge: 2000,
        timeout: 60000,
      }
    );
  }

  function restartGpsWatch(message = "GPS reconnecting…", context = {}) {
    if (!trackingRef.current || pausedRef.current) return;

    setGpsStatus(message);
    reconnectCountRef.current += 1;
    logGpsEvent("watch_restarted", {
      details: {
        reason: context.reason || "direct_restart",
        ...context,
      },
    });
    startGpsWatch();
  }

  function startGps() {
    setCountdownStep("");
    setShowStartCoachNote(false);

    if (!navigator.geolocation) {
      setGpsStatus("GPS is not available. Use manual entry instead.");
      setMode("manual");
      return;
    }

    setElapsed(0);
    setPoints([]);
    pointsRef.current = [];
    lastGpsUpdateRef.current = Date.now();
    runSessionIdRef.current = crypto.randomUUID();
    firstFixLoggedRef.current = false;
    reconnectCountRef.current = 0;
    staleRecoveryLevelRef.current = 0;
    lastTelemetryHeartbeatRef.current = 0;

    trackingRef.current = true;
    setTracking(true);
    requestScreenWakeLock();
    setPaused(false);
    pausedRef.current = false;
    setGpsStatus("Finding GPS signal…");
    logGpsEvent("run_started", {
      details: {
        target_km: targetKm,
        manual_only: manualOnly,
      },
    });

    if (timerRef.current) clearInterval(timerRef.current);

    timerRef.current = setInterval(() => {
      if (!pausedRef.current) setElapsed(value => value + 1);
    }, 1000);

    navigator.geolocation.getCurrentPosition(
      position => {
        if (!trackingRef.current) return;

        const firstPoint = {
          lat: Number(position.coords.latitude),
          lng: Number(position.coords.longitude),
          acc: Number(position.coords.accuracy || 999),
          ts: Date.now(),
        };

        if (!Number.isFinite(firstPoint.lat) || !Number.isFinite(firstPoint.lng)) return;

        lastGpsUpdateRef.current = Date.now();
        setPoints([firstPoint]);
        pointsRef.current = [firstPoint];
        setGpsStatus(`GPS active · accuracy ${Math.round(firstPoint.acc)}m`);
      },
      error => {
        console.error("Initial GPS fix failed", error);

        if (error?.code === 1) {
          setGpsStatus("Location permission was denied. Enable location access or use manual entry.");
          logGpsEvent("permission_denied", {
            error_code: error.code,
            details: {
              message: error.message || null,
              source: "initial_fix",
            },
          });
          return;
        }

        logGpsEvent(
          error?.code === 3 ? "gps_timeout" : "gps_unavailable",
          {
            error_code: error?.code,
            details: {
              message: error?.message || null,
              source: "initial_fix",
            },
          }
        );

        setGpsStatus("Waiting for GPS fix…");
      },
      { enableHighAccuracy: true, timeout: 30000, maximumAge: 2000 }
    );

    startGpsWatch();

    if (staleGpsIntervalRef.current) clearInterval(staleGpsIntervalRef.current);

    staleGpsIntervalRef.current = setInterval(() => {
      if (!trackingRef.current || pausedRef.current) return;

      const staleForMs = Date.now() - lastGpsUpdateRef.current;

      if (staleForMs > 90000 && staleRecoveryLevelRef.current < 4) {
        staleRecoveryLevelRef.current = 4;
        setGpsStatus("GPS signal has been unavailable for a while. Still trying to recover…");
        logGpsEvent("gps_stale_90s", {
          details: { stale_for_ms: staleForMs },
        });
        restartGpsWatch("GPS signal lost. Trying again…", {
          reason: "stale_90s",
          stale_for_ms: staleForMs,
        });
        return;
      }

      if (staleForMs > 60000 && staleRecoveryLevelRef.current < 3) {
        staleRecoveryLevelRef.current = 3;
        logGpsEvent("gps_stale_60s", {
          details: { stale_for_ms: staleForMs },
        });

        navigator.geolocation.getCurrentPosition(
          acceptGpsPosition,
          error => {
            logGpsEvent(
              error?.code === 3 ? "gps_timeout" : "gps_unavailable",
              {
                error_code: error?.code,
                details: {
                  message: error?.message || null,
                  source: "stale_recovery_get_current_position",
                },
              }
            );
          },
          {
            enableHighAccuracy: true,
            timeout: 30000,
            maximumAge: 0,
          }
        );
        return;
      }

      if (staleForMs > 40000 && staleRecoveryLevelRef.current < 2) {
        staleRecoveryLevelRef.current = 2;
        logGpsEvent("gps_stale_40s", {
          details: { stale_for_ms: staleForMs },
        });
        restartGpsWatch("GPS still unavailable. Recreating tracker…", {
          reason: "stale_40s",
          stale_for_ms: staleForMs,
        });
        return;
      }

      if (staleForMs > 20000 && staleRecoveryLevelRef.current < 1) {
        staleRecoveryLevelRef.current = 1;
        logGpsEvent("gps_stale_20s", {
          details: { stale_for_ms: staleForMs },
        });
        restartGpsWatch("No GPS update for 20 seconds. Reconnecting…", {
          reason: "stale_20s",
          stale_for_ms: staleForMs,
        });
      }
    }, 5000);
  }

  function togglePause() {
    pausedRef.current = !pausedRef.current;
    setPaused(pausedRef.current);

    if (pausedRef.current) {
      setGpsStatus("Run paused.");
      logGpsEvent("run_paused");
      return;
    }

    logGpsEvent("run_resumed");
    lastGpsUpdateRef.current = Date.now();
    restartGpsWatch("Run resumed. Reconnecting GPS…", {
      reason: "run_resumed",
    });
  }

  function startHoldFinish(event) {
    event.preventDefault();
    if (saving || showConfirmFinish) return;

    holdStartRef.current = Date.now();
    setHoldPercent(0);

    function tick() {
      const elapsedHold = Date.now() - holdStartRef.current;
      const percent = Math.min(100, Math.round((elapsedHold / 2000) * 100));

      setHoldPercent(percent);

      if (percent >= 100) {
        cancelHoldFinish(false);
        setShowConfirmFinish(true);
        return;
      }

      holdFrameRef.current = requestAnimationFrame(tick);
    }

    holdFrameRef.current = requestAnimationFrame(tick);
  }

  function cancelHoldFinish(reset = true) {
    if (holdFrameRef.current) {
      cancelAnimationFrame(holdFrameRef.current);
      holdFrameRef.current = null;
    }

    holdStartRef.current = null;

    if (reset) setHoldPercent(0);
  }

  async function finishGps() {
    if (savingRef.current) return;

    if (!selectedPlayer?.id) {
      alert("Select a player first.");
      return;
    }

    if (targetKm && distanceKm < targetKm) {
      alert(`Keep going — you need ${(targetKm - distanceKm).toFixed(2)} km more.`);
      return;
    }

    await logGpsEvent("run_finished", {
      details: {
        elapsed_seconds: elapsed,
        final_distance_km: distanceKm,
        reconnect_count: reconnectCountRef.current,
      },
    });

    stopTracking();
    setTracking(false);
    setShowConfirmFinish(false);
    savingRef.current = true;
    setSaving(true);

    const routePoints = pointsRef.current;
    const gpsDurationMin =
      routePoints.length >= 2
        ? Math.max(
            1,
            Math.round(
              (routePoints[routePoints.length - 1].ts - routePoints[0].ts) /
                60000
            )
          )
        : Math.max(1, Math.round(elapsed / 60));
    const gpsPace = paceFromSeconds(gpsDurationMin * 60, distanceKm);

    const saved = {
      type: "gps",
      runSessionId: runSessionIdRef.current,
      activityId: activity.id,
      playerId: selectedPlayer.id,
      title: activity.title,
      week: activityWeek,
      targetKm,
      distanceKm,
      durationMin: gpsDurationMin,
      pace: gpsPace,
      pointCount: routePoints.length,
      routePoints,
      savedAt: new Date().toISOString(),
      locked: true,
    };

    try {
      const savedResult = await onSaved(saved);
      setFinishedRun({
        ...saved,
        id: savedResult?.id || savedResult?.runProofId || savedResult?.proof?.id || null,
      });
      showRunCompleteCelebration();
    } catch (error) {
      alert(error?.message || "Could not save this run.");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  async function discardGpsRun() {
    await logGpsEvent("run_discarded", {
      details: {
        elapsed_seconds: elapsed,
        final_distance_km: distanceKm,
        reconnect_count: reconnectCountRef.current,
      },
    });

    stopTracking();
    setTracking(false);
    setPaused(false);
    pausedRef.current = false;
    setShowConfirmFinish(false);
    setShowDiscardConfirm(false);
    setHoldPercent(0);
    setElapsed(0);
    setPoints([]);
    pointsRef.current = [];
    setGpsStatus("Run discarded. Ready to start again.");
  }

  async function saveManual() {
    if (savingRef.current) return;

    if (!selectedPlayer?.id) {
      alert("Select a player first.");
      return;
    }

    const distance = Number(manualDistance);
    const minutes = manualMinutes ? Number(manualMinutes) : null;

    if (!distance || distance <= 0) {
      alert("Enter the distance completed.");
      return;
    }

    savingRef.current = true;
    setSaving(true);

    const saved = {
      type: "manual",
      runSessionId: crypto.randomUUID(),
      activityId: activity.id,
      playerId: selectedPlayer.id,
      title: activity.title,
      week: activityWeek,
      targetKm,
      distanceKm: distance,
      durationMin: minutes || null,
      pace: distance > 0 && minutes ? paceFromSeconds(minutes * 60, distance) : null,
      pointCount: 0,
      savedAt: new Date().toISOString(),
      locked: false,
    };

    try {
      const savedResult = await onSaved(saved);
      setFinishedRun({
        ...saved,
        id: savedResult?.id || savedResult?.runProofId || savedResult?.proof?.id || null,
      });
      showRunCompleteCelebration();
    } catch (error) {
      alert(error?.message || "Could not save this manual run.");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  async function removeFinishedManualRun() {
    if (!finishedRun || finishedRun.type !== "manual") return;

    setDeleting(true);

    try {
      if (typeof onDeleted === "function") {
        await onDeleted(finishedRun);
      } else {
        throw new Error("Remove manual run is not wired up yet.");
      }

      setFinishedRun(null);
      onClose?.();
    } catch (error) {
      alert(error?.message || "Could not remove this manual run.");
    } finally {
      setDeleting(false);
    }
  }

  async function makeScreenshotFile() {
    if (!cardRef.current) return null;

    const images = Array.from(cardRef.current.querySelectorAll("img"));

    await Promise.all(
      images.map(image => {
        if (image.complete) return Promise.resolve();

        return new Promise(resolve => {
          image.onload = resolve;
          image.onerror = resolve;
        });
      })
    );

    const blob = await htmlToImage.toBlob(cardRef.current, {
      cacheBust: true,
      pixelRatio: 2,
      backgroundColor: "#fffaf4",
      skipFonts: true,
      filter: node => !node.classList?.contains("leaflet-container"),
    });

    return new File(
      [blob],
      `${selectedPlayer.name}-${activity.title}.png`,
      { type: "image/png" }
    );
  }

  async function shareScreenshot() {
    if (screenshotBusy) return;
    setScreenshotBusy(true);

    const file = await makeScreenshotFile();
    if (!file) {
      setScreenshotBusy(false);
      return;
    }

    const shareText =
      `${selectedPlayer.name} completed ${activity.title} in the Fingallians Fitness Challenge.`;

    try {
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          title: "Fingallians Fitness Challenge",
          text: shareText,
          files: [file],
        });
        return;
      }

      const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(shareText)}`;
      window.open(whatsappUrl, "_blank", "noopener,noreferrer");
    } finally {
      setScreenshotBusy(false);
    }
  }

  async function saveScreenshot() {
    if (screenshotBusy) return;
    setScreenshotBusy(true);

    const file = await makeScreenshotFile();
    if (!file) {
      setScreenshotBusy(false);
      return;
    }

    try {
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          title: "Save Run Screenshot",
          text: "Choose Save Image / Save to Photos if your phone shows that option.",
          files: [file],
        });
        return;
      }

      const url = URL.createObjectURL(file);
      const link = document.createElement("a");
      link.href = url;
      link.download = file.name;
      link.click();
      URL.revokeObjectURL(url);
    } finally {
      setScreenshotBusy(false);
    }
  }

  if (finishedRun) {
    return (
      <div className="run-modal-backdrop">
        <div className="run-modal saved-run-modal">
          <button className="modal-close-button" onClick={onClose}>×</button>

          <div className="saved-run-header">
            <h2>Great job, run complete!</h2>
            <p>{finishedRun.type === "gps" ? "GPS verified" : "Manual entry"}</p>
          </div>

          <div className="saved-run-preview-shell">
            <div className="challenge-run-card" ref={cardRef}>
              <div className="challenge-run-card-top">
                <h1>SUMMER FITNESS CHALLENGE</h1>
                <h2>RUN COMPLETE</h2>
                <p>{finishedRun.type === "gps" ? "🏃 GPS VERIFIED" : "📝 MANUAL ENTRY"}</p>
              </div>

              <div className="challenge-run-card-body">
                <h3>{selectedPlayer.name}</h3>
                <p className="challenge-run-card-subtitle">
                  Week {activityWeek} · {activity.title} · Target {targetKm || activity.target_value}
                  {activity.target_unit}
                </p>
                <p className="challenge-run-card-date">{formatDateTime(finishedRun.savedAt)}</p>

                <div
                  className="challenge-run-card-map"
                  style={{
                    backgroundColor: "#e8f6e9",
                    border: "1px solid #d5ead7",
                    overflow: "hidden",
                  }}
                >
                  <img
                    src={screenshotMapSrc}
                    alt="Run route map"
                    style={{
                      display: "block",
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                      backgroundColor: "#e8f6e9",
                    }}
                  />
                </div>

                <div className="challenge-run-card-stats">
                  <div>
                    <span>DISTANCE</span>
                    <strong>{finishedRun.distanceKm.toFixed(2)} km</strong>
                  </div>
                  <div>
                    <span>TIME</span>
                    <strong>{finishedRun.durationMin || "—"} min</strong>
                  </div>
                  <div>
                    <span>PACE</span>
                    <strong>{finishedRun.pace || "—"}</strong>
                  </div>
                </div>

                <div className="challenge-run-card-achieved">🏅 TARGET ACHIEVED</div>

                <div className="challenge-run-card-footer">
                  <strong>Summer Challenge 2026</strong>
                  <span>Route details stay private on this device</span>
                </div>
              </div>
            </div>
          </div>

          <div className="saved-run-share-grid">
            <button
              className="button primary saved-run-share-button"
              onClick={shareScreenshot}
              disabled={screenshotBusy}
            >
              {screenshotBusy ? "Preparing…" : "📲 Share"}
            </button>

            <button
              className="button secondary saved-run-share-button"
              onClick={saveScreenshot}
              disabled={screenshotBusy}
            >
              {screenshotBusy ? "Preparing…" : "💾 Save Screenshot"}
            </button>
          </div>

          {finishedRun.type === "manual" ? (
            <button
              className="button secondary saved-run-delete-button"
              onClick={removeFinishedManualRun}
              disabled={deleting}
            >
              {deleting ? "Removing…" : "Remove Manual Run"}
            </button>
          ) : null}
        </div>

        {showSuccessConfetti ? (
          <div className="run-complete-celebration-shell" aria-hidden="true">
            <div className="run-complete-celebration">
              <span>🏁</span>
              <strong>Run Complete!</strong>
              <small>Great job!</small>
              <em>👏 👏 👏</em>
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="run-modal-backdrop">
      <div className="run-modal run-logger-modal">
        <button className="modal-close-button" onClick={requestClose}>×</button>

        <div className="run-logger-header">
          <h2>RUN LOGGER</h2>
          <p>
            Week {activityWeek} · {activity.title} · Target {targetKm || activity.target_value}
            {activity.target_unit}
          </p>
        </div>

        <div className="run-safety-note">
          🚨 Safety first: run with an adult, choose a safe route, and avoid roads where possible.
        </div>

        <div className="run-mode-toggle">
          <button className={mode === "gps" ? "active" : ""} onClick={() => setMode("gps")} disabled={tracking}>
            GPS
          </button>
          <button className={mode === "manual" ? "active" : ""} onClick={() => setMode("manual")} disabled={tracking}>
            Manual
          </button>
        </div>

        {mode === "gps" ? (
          <>
            <div className="run-stat-grid">
              <div>
                <strong>{distanceKm.toFixed(2)}</strong>
                <span>km</span>
              </div>
              <div>
                <strong>{formatTime(elapsed)}</strong>
                <span>time</span>
              </div>
              <div>
                <strong>{pace}</strong>
                <span>pace</span>
              </div>
            </div>

            <div className="run-map-live">
              <MapContainer
                center={latestPoint ? [latestPoint.lat, latestPoint.lng] : DEFAULT_CENTER}
                zoom={15}
                scrollWheelZoom={false}
                style={{ height: "100%", width: "100%", borderRadius: 16 }}
              >
                <MapAutoCenter point={latestPoint} />
                <TileLayer
                  attribution="&copy; OpenStreetMap contributors"
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                {route.length > 1 ? <Polyline positions={route} /> : null}
                {latestPoint ? <Marker position={[latestPoint.lat, latestPoint.lng]} /> : null}
              </MapContainer>
            </div>

            <p className="run-status">{gpsStatus}</p>

            {tracking ? (
              <p className="run-status">
                🔋 Keep this screen open. Your phone will stay awake while GPS tracking is active.
              </p>
            ) : null}

            {!tracking ? (
              <button
                className="button primary"
                onClick={beginStartCountdown}
                disabled={Boolean(countdownStep || showStartCoachNote)}
              >
                {showStartCoachNote
                  ? "Coach note first…"
                  : countdownStep
                    ? "Starting…"
                    : "▶ START GPS RUN"}
              </button>
            ) : (
              <div className="run-action-grid">
                <button className="button secondary" onClick={togglePause}>
                  {paused ? "Resume" : "Pause"}
                </button>
                <button
                  className="button primary hold-finish-button"
                  disabled={saving}
                  onPointerDown={startHoldFinish}
                  onPointerUp={() => cancelHoldFinish(true)}
                  onPointerLeave={() => cancelHoldFinish(true)}
                  onPointerCancel={() => cancelHoldFinish(true)}
                  style={{
                    background: `linear-gradient(90deg, #7f1d1d ${holdPercent}%, #b91c1c ${holdPercent}%)`,
                    touchAction: "none",
                  }}
                >
                  {saving ? "Saving…" : holdPercent > 0 ? `Hold… ${holdPercent}%` : "Hold to Finish"}
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="run-manual-panel">
            <label className="label">Distance km</label>
            <input
              className="input"
              type="number"
              min="0"
              step="0.1"
              value={manualDistance}
              onChange={event => setManualDistance(event.target.value)}
            />

            <label className="label">Minutes optional</label>
            <input
              className="input"
              type="number"
              min="0"
              value={manualMinutes}
              onChange={event => setManualMinutes(event.target.value)}
            />

            <button className="button primary" disabled={saving} onClick={saveManual}>
              {saving ? "Saving run…" : "Save Manual Run"}
            </button>
          </div>
        )}

        {showStartCoachNote ? (
          <div className="run-coach-note-backdrop">
            <div className="run-coach-note-modal">
              <button
                className="run-coach-note-close"
                type="button"
                aria-label="Close coach note"
                onClick={dismissCoachNote}
              >
                ×
              </button>

              <h2>Coach Note</h2>
              <p>{coachNote}</p>
              <p className="run-coach-note-water">💧 Have you had enough water today?</p>

              <small>GPS or manual will be ready in a few seconds…</small>
            </div>
          </div>
        ) : null}

        {countdownStep ? (
          <div className={`run-countdown-backdrop ${countdownStep === "GO!" ? "is-go" : ""}`}>
            {countdownStep === "GO!" ? (
              <div className="race-flag-sweep" aria-hidden="true">🏁</div>
            ) : null}

            <div className={`run-countdown-light ${countdownStep.toLowerCase().replace("!", "")}`}>
              <span>{countdownStep === "GO!" ? "GO!" : countdownStep}</span>
              {countdownStep === "GO!" ? <em aria-hidden="true">🏁</em> : null}
            </div>
          </div>
        ) : null}

        {showConfirmFinish ? (
          <div className="run-confirm-backdrop">
            <div className="run-confirm-modal">
              <h2>Finish this run?</h2>
              <p>Save {distanceKm.toFixed(2)} km for {selectedPlayer.name}?</p>

              <div className="run-action-grid">
                <button className="button primary" onClick={finishGps}>
                  Save Run
                </button>

                <button
                  className="button secondary"
                  onClick={() => setShowDiscardConfirm(true)}
                >
                  Discard
                </button>
              </div>

              <button
                className="link-button"
                onClick={() => {
                  setShowConfirmFinish(false);
                  setShowDiscardConfirm(false);
                  setHoldPercent(0);
                }}
              >
                Keep going
              </button>
            </div>
          </div>
        ) : null}

        {showDiscardConfirm ? (
          <div className="run-confirm-backdrop">
            <div className="run-confirm-modal">
              <h2>Discard this run?</h2>
              <p>This will delete the GPS route from this screen and it will not be saved.</p>

              <div className="run-action-grid">
                <button
                  className="button secondary"
                  onClick={() => setShowDiscardConfirm(false)}
                >
                  No, Go Back
                </button>

                <button className="button primary" onClick={discardGpsRun}>
                  Yes, Discard
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>

    
  );
}