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
}) {
  const [mode, setMode] = useState("gps");
  const [tracking, setTracking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [finishedRun, setFinishedRun] = useState(null);
  const [paused, setPaused] = useState(false);
  const [gpsStatus, setGpsStatus] = useState("Ready to start.");
  const [elapsed, setElapsed] = useState(0);
  const [points, setPoints] = useState([]);
  const [showConfirmFinish, setShowConfirmFinish] = useState(false);
  const [holdPercent, setHoldPercent] = useState(0);

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

  const distanceKm = Number(totalDistanceKm(points).toFixed(2));
  const targetKm =
    activity?.target_unit === "km" ? Number(activity.target_value || 0) : 0;
  const latestPoint = points[points.length - 1] || null;
  const route = useMemo(() => points.map(point => [point.lat, point.lng]), [points]);
  const pace = paceFromSeconds(elapsed, distanceKm);

  useEffect(() => {
    function blockRefresh(event) {
      if (!tracking) return;
      event.preventDefault();
      event.returnValue = "";
    }

    window.addEventListener("beforeunload", blockRefresh);

    return () => {
      window.removeEventListener("beforeunload", blockRefresh);
      stopTracking();
      cancelHoldFinish();
    };
  }, [tracking]);

  function stopTracking() {
    if (watchRef.current) {
      navigator.geolocation.clearWatch(watchRef.current);
      watchRef.current = null;
    }

    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }

  function requestClose() {
    if (tracking) {
      alert("Your run is still tracking. Hold to finish before closing.");
      return;
    }

    onClose();
  }

  function startGps() {
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
      savedAt: new Date().toISOString(),
      locked: true,
    };

    try {
      await onSaved(saved);
      setFinishedRun(saved);
    } catch (error) {
      alert(error?.message || "Could not save this run.");
    } finally {
      setSaving(false);
    }
  }

  async function saveManual() {
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
      await onSaved(saved);
      setFinishedRun(saved);
    } catch (error) {
      alert(error?.message || "Could not save this manual run.");
    } finally {
      setSaving(false);
    }
  }

  async function shareOrSaveScreenshot() {
    if (!cardRef.current) return;

    const blob = await htmlToImage.toBlob(cardRef.current, {
      cacheBust: true,
      pixelRatio: 2,
      backgroundColor: "#fffaf4",
    });

    const file = new File(
      [blob],
      `${selectedPlayer.name}-${activity.title}.png`,
      { type: "image/png" }
    );

    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({
        title: "Fingallians Fitness Challenge",
        text: `${selectedPlayer.name} completed ${activity.title}`,
        files: [file],
      });
      return;
    }

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = file.name;
    link.click();
    URL.revokeObjectURL(url);
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

                <div className="challenge-run-card-map">
                  <svg viewBox="0 0 500 340" preserveAspectRatio="none">
                    <rect className="route-card-bg" width="500" height="340" />
                    <g className="route-card-grid">
                      <path d="M0 68 H500 M0 136 H500 M0 204 H500 M0 272 H500" />
                      <path d="M100 0 V340 M200 0 V340 M300 0 V340 M400 0 V340" />
                    </g>
                    {finishedRun.type === "gps" ? (
                      <>
                        <circle className="route-card-start" cx="70" cy="165" r="8" />
                        <path
                          className="route-card-line"
                          d="M45 165 C92 205 125 252 190 238 C258 225 274 305 308 278 C335 254 300 164 338 158 C374 152 391 232 430 190 C468 148 423 62 465 46"
                        />
                        <text className="route-card-finish" x="438" y="188">🏁</text>
                      </>
                    ) : (
                      <>
                        <text className="route-card-manual-icon" x="250" y="150">📝</text>
                        <text className="route-card-manual-title" x="250" y="196">
                          Manual run entry
                        </text>
                        <text className="route-card-manual-subtitle" x="250" y="224">
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

          <button className="button primary saved-run-share-button" onClick={shareOrSaveScreenshot}>
            📥 Share / Save Screenshot
          </button>
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
              <button className="button primary" onClick={startGps}>
                ▶ START GPS RUN
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
              {saving ? "Saving…" : "Save Manual Run"}
            </button>
          </div>
        )}

        {showConfirmFinish ? (
          <div className="run-confirm-backdrop">
            <div className="run-confirm-modal">
              <h2>Finish this run?</h2>
              <p>Save {distanceKm.toFixed(2)} km for {selectedPlayer.name}?</p>

              <div className="run-action-grid">
                <button
                  className="button secondary"
                  onClick={() => {
                    setShowConfirmFinish(false);
                    setHoldPercent(0);
                  }}
                >
                  Keep Going
                </button>
                <button className="button primary" onClick={finishGps}>
                  Yes, Save Run
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
