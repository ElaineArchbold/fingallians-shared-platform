import { useRef } from "react";
import * as htmlToImage from "html-to-image";

function formatDateTime(value) {
  if (!value) return "—";

  return new Date(value).toLocaleString("en-IE", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function paceText(run) {
  if (!run.pace_min_per_km) return "—";

  const pace = Number(run.pace_min_per_km);
  const mins = Math.floor(pace);
  const secs = Math.round((pace % 1) * 60);

  return `${mins}:${String(secs).padStart(2, "0")} /km`;
}

export default function RunProofModal({
  run,
  selectedPlayer,
  onClose,
  onDeleted,
}) {
  const cardRef = useRef(null);

  const isGps = run.run_type === "gps";
  const isManual = run.run_type === "manual";

  async function shareOrSaveScreenshot() {
    if (!cardRef.current) return;

    const blob = await htmlToImage.toBlob(cardRef.current, {
      cacheBust: true,
      pixelRatio: 2,
      backgroundColor: "#fffaf4",
    });

    const file = new File(
      [blob],
      `${run.player_name || selectedPlayer?.name || "run"}-${run.label || "activity"}.png`,
      { type: "image/png" }
    );

    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({
        title: "Fingallians Fitness Challenge",
        text: `${run.player_name || selectedPlayer?.name} completed ${run.label || "a run"}`,
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

  async function removeManualRun() {
    if (!isManual) return;

    const ok = window.confirm("Remove this manual run entry?");
    if (!ok) return;

    if (typeof onDeleted === "function") {
      await onDeleted(run);
    }
  }

  return (
    <div className="run-modal-backdrop" onClick={onClose}>
      <div className="run-modal saved-run-modal" onClick={event => event.stopPropagation()}>
        <button className="modal-close-button" onClick={onClose}>
          ×
        </button>

        <div className="saved-run-header">
          <h2>SAVED RUN</h2>
          <p>Week {run.week || 1} · {isGps ? "GPS verified" : "Manual entry"}</p>
        </div>

        <div className="saved-run-preview-shell">
          <div className="challenge-run-card" ref={cardRef}>
            <div className="challenge-run-card-top">
              <h1>SUMMER FITNESS CHALLENGE</h1>
              <h2>RUN COMPLETE</h2>
              <p>{isGps ? "🏃 GPS VERIFIED" : "📝 MANUAL ENTRY"}</p>
            </div>

            <div className="challenge-run-card-body">
              <h3>{run.player_name || selectedPlayer?.name}</h3>
              <p className="challenge-run-card-subtitle">
                Week {run.week || 1} · {run.label || "Run"} · Target {run.target || "—"}
              </p>
              <p className="challenge-run-card-date">{formatDateTime(run.saved_at)}</p>

              <div className="challenge-run-card-map">
                <svg viewBox="0 0 500 340" preserveAspectRatio="none">
                  <rect className="route-card-bg" width="500" height="340" />
                  <g className="route-card-grid">
                    <path d="M0 68 H500 M0 136 H500 M0 204 H500 M0 272 H500" />
                    <path d="M100 0 V340 M200 0 V340 M300 0 V340 M400 0 V340" />
                  </g>
                  {isGps ? (
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
                  <strong>{Number(run.distance_km || 0).toFixed(2)} km</strong>
                </div>

                <div>
                  <span>TIME</span>
                  <strong>{run.duration_min || "—"} min</strong>
                </div>

                <div>
                  <span>PACE</span>
                  <strong>{paceText(run)}</strong>
                </div>
              </div>

              <div className="challenge-run-card-achieved">
                🏅 TARGET ACHIEVED
              </div>

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

        {isGps ? (
          <p className="saved-run-lock-note">
            🔒 GPS runs are protected and cannot be removed here.
          </p>
        ) : null}

        {isManual ? (
          <button className="button secondary saved-run-delete-button" onClick={removeManualRun}>
            Remove Manual Entry
          </button>
        ) : null}
      </div>
    </div>
  );
}
