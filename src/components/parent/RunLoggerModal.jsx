import { useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, Marker, Polyline, TileLayer, useMap } from "react-leaflet";
import * as htmlToImage from "html-to-image";

const DEFAULT_CENTER = [53.389, -6.246];

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
  const savingRef = useRef(false);
  const audioContextRef = useRef(null);

  const distanceKm = Number(totalDistanceKm(points).toFixed(2));
  const targetKm =
    activity?.target_unit === "km" ? Number(activity.target_value || 0) : 0;
  const latestPoint = points[points.length - 1] || null;
  const route = useMemo(() => points.map(point => [point.lat, point.lng]), [points]);
  const pace = paceFromSeconds(elapsed, distanceKm);

  useEffect(() => {
    setMode(manualOnly ? "manual" : "gps");
    setFinishedRun(null);
    setSaving(false);
    savingRef.current = false;
    setManualDistance(activity?.target_unit === "km" ? String(activity.target_value || "") : "");
    setManualMinutes("");
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

  useEffect(() => {
    return () => {
      stopTracking();
      cancelHoldFinish();
    };
  }, []);

  function stopTracking() {
    if (watchRef.current) {
      navigator.geolocation.clearWatch(watchRef.current);
      watchRef.current = null;
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
  }

  function requestClose() {
    if (tracking) {
      alert("Your run is still tracking. Hold to finish before closing.");
      return;
    }

    onClose();
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
    try {
      const context = getAudioContext();
      if (!context) return;

      const now = context.currentTime;

      const notes =
        step === "READY"
          ? [392, 523]
          : step === "SET"
            ? [523, 659]
            : [659, 784, 1046, 1318];

      notes.forEach((frequency, index) => {
        const start = now + index * 0.075;
        const duration = step === "GO!" ? 0.38 : 0.24;

        const oscillator = context.createOscillator();
        const gain = context.createGain();

        oscillator.type = step === "GO!" ? "square" : "sawtooth";
        oscillator.frequency.setValueAtTime(frequency, start);
        oscillator.frequency.exponentialRampToValueAtTime(frequency * 1.08, start + duration);

        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(0.26, start + 0.018);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

        oscillator.connect(gain);
        gain.connect(context.destination);

        oscillator.start(start);
        oscillator.stop(start + duration + 0.02);
      });
    } catch {
      // Sound is a bonus only.
    }
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

  function dismissCoachNoteAndStart() {
    if (coachNoteTimeoutRef.current) {
      clearTimeout(coachNoteTimeoutRef.current);
      coachNoteTimeoutRef.current = null;
    }

    setShowStartCoachNote(false);
    startTrafficLightCountdown();
  }

  function beginStartCountdown() {
    if (!navigator.geolocation) {
      setGpsStatus("GPS is not available. Use manual entry instead.");
      setMode("manual");
      return;
    }

    if (countdownStep || tracking || showStartCoachNote) return;

    primeAudioContext();
    setShowStartCoachNote(true);

    coachNoteTimeoutRef.current = setTimeout(() => {
      dismissCoachNoteAndStart();
    }, 5000);
  }

  function startGps() {
    setCountdownStep("");
    setShowStartCoachNote(false);

    if (!navigator.geolocation) {
      setGpsStatus("GPS is not available. Use manual entry instead.");
      setMode("manual");
      return;
    }

    setTracking(true);
    setPaused(false);
    pausedRef.current = false;
    setGpsStatus("Finding GPS signal…");

    timerRef.current = setInterval(() => {
      if (!pausedRef.current) {
        setElapsed(value => value + 1);
      }
    }, 1000);

    navigator.geolocation.getCurrentPosition(
      position => {
        const firstPoint = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          acc: Number(position.coords.accuracy || 999),
          ts: Date.now(),
        };

        setPoints([firstPoint]);
        pointsRef.current = [firstPoint];
        setGpsStatus(`GPS active · accuracy ${Math.round(firstPoint.acc)}m`);
      },
      () => {
        setGpsStatus("Waiting for GPS fix…");
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 1000 }
    );

    watchRef.current = navigator.geolocation.watchPosition(
      position => {
        if (pausedRef.current) return;

        const accuracy = Number(position.coords.accuracy || 999);

        const nextPoint = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          acc: accuracy,
          ts: Date.now(),
        };

        if (!Number.isFinite(nextPoint.lat) || !Number.isFinite(nextPoint.lng)) return;

        if (accuracy > 80) {
          setGpsStatus(`Weak GPS signal (${Math.round(accuracy)}m). Keep moving in open sky.`);
          return;
        }

        setPoints(previous => {
          const last = previous[previous.length - 1];

          if (last) {
            const segmentKm = distanceBetween(last, nextPoint);
            const seconds = Math.max(1, (nextPoint.ts - last.ts) / 1000);
            const speedKmh = segmentKm / (seconds / 3600);

            if (segmentKm < 0.003) return previous;

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
      },
      error => {
        console.error(error);
        setGpsStatus("GPS signal dropped. Keep moving — it should reconnect.");
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

    stopTracking();
    setTracking(false);
    setShowConfirmFinish(false);
    savingRef.current = true;
    savingRef.current = true;
    setSaving(true);

    const saved = {
      type: "gps",
      activityId: activity.id,
      playerId: selectedPlayer.id,
      title: activity.title,
      targetKm,
      distanceKm,
      durationMin: Math.max(1, Math.round(elapsed / 60)),
      pace,
      pointCount: pointsRef.current.length,
      routePoints: pointsRef.current,
      savedAt: new Date().toISOString(),
      locked: true,
    };

    try {
      const savedResult = await onSaved(saved);
      setFinishedRun({
        ...saved,
        id: savedResult?.id || savedResult?.runProofId || savedResult?.proof?.id || null,
      });
    } catch (error) {
      alert(error?.message || "Could not save this run.");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  function discardGpsRun() {
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
      activityId: activity.id,
      playerId: selectedPlayer.id,
      title: activity.title,
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
    } catch (error) {
      alert(error?.message || "Could not save this manual run.");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  async function removeFinishedManualRun() {
    if (!finishedRun || finishedRun.type !== "manual") return;

    const ok = window.confirm("Remove this manual run entry?");
    if (!ok) return;

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

    const blob = await htmlToImage.toBlob(cardRef.current, {
      cacheBust: true,
      pixelRatio: 2,
      backgroundColor: "#fffaf4",
      skipFonts: true,
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
            <h2>RUN COMPLETE</h2>
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
                  Week 1 · {activity.title} · Target {targetKm || activity.target_value}
                  {activity.target_unit}
                </p>
                <p className="challenge-run-card-date">{formatDateTime(finishedRun.savedAt)}</p>

                <div
                  className="challenge-run-card-map"
                  style={{ backgroundColor: "#e8f6e9", border: "1px solid #d5ead7" }}
                >
                  <svg
                    viewBox="0 0 500 340"
                    preserveAspectRatio="none"
                    style={{ display: "block", backgroundColor: "#e8f6e9" }}
                  >
                    <rect width="500" height="340" fill="#e8f6e9" />
                    <g>
                      <path
                        d="M0 68 H500 M0 136 H500 M0 204 H500 M0 272 H500"
                        fill="none"
                        stroke="rgba(85, 140, 94, 0.18)"
                        strokeWidth="1"
                      />
                      <path
                        d="M100 0 V340 M200 0 V340 M300 0 V340 M400 0 V340"
                        fill="none"
                        stroke="rgba(85, 140, 94, 0.18)"
                        strokeWidth="1"
                      />
                    </g>
                    {finishedRun.type === "gps" ? (
                      <>
                        <circle cx="70" cy="165" r="8" fill="#b01425" />
                        <path
                          d="M45 165 C92 205 125 252 190 238 C258 225 274 305 308 278 C335 254 300 164 338 158 C374 152 391 232 430 190 C468 148 423 62 465 46"
                          fill="none"
                          stroke="#b01425"
                          strokeWidth="8"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                        <text x="438" y="188" fontSize="25">🏁</text>
                      </>
                    ) : (
                      <>
                        <text
                          x="250"
                          y="150"
                          fontSize="48"
                          textAnchor="middle"
                          dominantBaseline="middle"
                        >
                          📝
                        </text>
                        <text
                          x="250"
                          y="196"
                          fontSize="24"
                          fontWeight="900"
                          textAnchor="middle"
                          fill="#351b20"
                        >
                          Manual run entry
                        </text>
                        <text
                          x="250"
                          y="224"
                          fontSize="16"
                          fontWeight="700"
                          textAnchor="middle"
                          fill="#7a6269"
                        >
                          No GPS route recorded
                        </text>
                      </>
                    )}
                  </svg>
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
            Week 1 · {activity.title} · Target {targetKm || activity.target_value}
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

            {!tracking ? (
              <button className="button primary" onClick={beginStartCountdown} disabled={Boolean(countdownStep || showStartCoachNote)}>
                {showStartCoachNote || countdownStep ? "Starting…" : "▶ START GPS RUN"}
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
                onClick={dismissCoachNoteAndStart}
              >
                ×
              </button>

              <h2>Coach Note</h2>
              <p>
                Start steady, listen to your body, and do what you can. If it feels too much,
                slow down or split the distance over two runs.
              </p>
              <p className="run-coach-note-water">💧 Have you had enough water today?</p>

              <small>Starting automatically in a few seconds…</small>
            </div>
          </div>
        ) : null}

        {countdownStep ? (
          <div className="run-countdown-backdrop">
            <div className={`run-countdown-light ${countdownStep.toLowerCase().replace("!", "")}`}>
              <span>{countdownStep}</span>
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
