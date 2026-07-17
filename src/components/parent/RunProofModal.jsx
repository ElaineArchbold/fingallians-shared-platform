import { useRef, useState } from "react";
import * as htmlToImage from "html-to-image";

function formatDateTime(value) {
  if (!value) return "—";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  return date.toLocaleString("en-IE", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function normaliseRunType(run = {}) {
  const values = [
    run?.type,
    run?.runType,
    run?.run_type,
    run?.source,
    run?.runSource,
    run?.run_source,
    run?.completionType,
    run?.completion_type,
  ]
    .filter(Boolean)
    .map(value => String(value).trim().toLowerCase());

  if (
    run?.file_type ||
    run?.fileType ||
    run?.original_filename ||
    run?.originalFilename ||
    values.some(value =>
      ["file_upload", "upload", "uploaded", "import", "imported", "gpx", "tcx"].includes(value)
    )
  ) {
    return "file_upload";
  }

  if (values.includes("gps")) return "gps";
  return "manual";
}

function numericValue(...values) {
  for (const value of values) {
    if (value === null || value === undefined || value === "") continue;
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }

  return null;
}

function runMetrics(run = {}) {
  const distanceKm = numericValue(
    run.distance_km,
    run.distanceKm,
    run.distance
  );

  const durationMin = numericValue(
    run.duration_min,
    run.durationMin,
    run.duration_minutes
  );

  let paceMinPerKm = numericValue(
    run.pace_min_per_km,
    run.paceMinPerKm
  );

  if (
    paceMinPerKm === null &&
    distanceKm !== null &&
    distanceKm > 0 &&
    durationMin !== null
  ) {
    paceMinPerKm = durationMin / distanceKm;
  }

  return {
    distanceKm,
    durationMin,
    paceMinPerKm,
  };
}

function paceText(paceMinPerKm) {
  if (paceMinPerKm === null || !Number.isFinite(paceMinPerKm)) return "—";

  let mins = Math.floor(paceMinPerKm);
  let secs = Math.round((paceMinPerKm - mins) * 60);

  if (secs === 60) {
    mins += 1;
    secs = 0;
  }

  return `${mins}:${String(secs).padStart(2, "0")} /km`;
}

export default function RunProofModal({
  run,
  selectedPlayer,
  onClose,
  onDeleted,
}) {
  const cardRef = useRef(null);
  const [deleting, setDeleting] = useState(false);

  const runType = normaliseRunType(run);
  const isGps = runType === "gps";
  const isUploaded = runType === "file_upload";
  const isManual = runType === "manual";
  const canDelete = isManual || isUploaded;
  const completionOnly = Boolean(run?.completion_only);

  const {
    distanceKm,
    durationMin,
    paceMinPerKm,
  } = runMetrics(run);

  const hasDistance = distanceKm !== null;
  const hasDuration = durationMin !== null;
  const hasMetrics = hasDistance || hasDuration || paceMinPerKm !== null;

  const typeLabel = isGps
    ? "GPS verified"
    : isUploaded
      ? "Uploaded run"
      : "Manual entry";

  const cardLabel = isGps
    ? "🏃 GPS VERIFIED"
    : isUploaded
      ? "📤 UPLOADED RUN"
      : "📝 MANUAL ENTRY";

  const emptyTitle = isUploaded
    ? "Uploaded activity"
    : isGps
      ? "GPS run completed"
      : "Manual run entry";

  const emptySubtitle = completionOnly
    ? "Saved distance and time are unavailable"
    : isUploaded
      ? "Imported file details"
      : isGps
        ? "No route preview available"
        : "No GPS route recorded";

  async function shareOrSaveScreenshot() {
    if (!cardRef.current) return;

    try {
      const blob = await htmlToImage.toBlob(cardRef.current, {
        cacheBust: true,
        pixelRatio: 2,
        backgroundColor: "#fffaf4",
      });

      if (!blob) throw new Error("Could not create screenshot.");

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
    } catch (error) {
      console.error("Could not share run screenshot", error);
      window.alert(error?.message || "Could not create the run screenshot.");
    }
  }

  async function removeRun() {
    if (!canDelete || deleting) return;

    const runLabel = isUploaded ? "uploaded run" : "manual run entry";
    const ok = window.confirm(`Remove this ${runLabel}?`);
    if (!ok) return;

    if (typeof onDeleted !== "function") return;

    try {
      setDeleting(true);
      await onDeleted({
        ...run,
        run_type: runType,
        run_source: runType,
        type: runType,
        source: runType,
      });
    } catch (error) {
      console.error("Could not remove run", error);
      window.alert(error?.message || `Could not remove this ${runLabel}.`);
      setDeleting(false);
    }
  }

  return (
    <div className="run-modal-backdrop" onClick={onClose}>
      <div className="run-modal saved-run-modal" onClick={event => event.stopPropagation()}>
        <button className="modal-close-button" onClick={onClose} aria-label="Close run details">
          ×
        </button>

        <div className="saved-run-header">
          <h2>SAVED RUN</h2>
          <p>Week {run.week || 1} · {typeLabel}</p>
        </div>

        {completionOnly ? (
          <div className="saved-run-lock-note" role="status">
            This run is marked complete and verified, but its original saved proof could not be found.
          </div>
        ) : null}

        <div className="saved-run-preview-shell">
          <div className="challenge-run-card" ref={cardRef}>
            <div className="challenge-run-card-top">
              <h1>SUMMER FITNESS CHALLENGE</h1>
              <h2>RUN COMPLETE</h2>
              <p>{cardLabel}</p>
            </div>

            <div className="challenge-run-card-body">
              <h3>{run.player_name || selectedPlayer?.name}</h3>
              <p className="challenge-run-card-subtitle">
                Week {run.week || 1} · {run.label || "Run"} · Target {run.target || "—"}
              </p>
              <p className="challenge-run-card-date">
                {formatDateTime(run.saved_at || run.completed_at)}
              </p>

              <div className="challenge-run-card-map">
                <svg viewBox="0 0 500 340" preserveAspectRatio="none">
                  <rect className="route-card-bg" width="500" height="340" />
                  <g className="route-card-grid">
                    <path d="M0 68 H500 M0 136 H500 M0 204 H500 M0 272 H500" />
                    <path d="M100 0 V340 M200 0 V340 M300 0 V340 M400 0 V340" />
                  </g>

                  {isGps && !completionOnly ? (
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
                      <text className="route-card-manual-icon" x="250" y="150">
                        {isUploaded ? "📤" : isGps ? "🏃" : "📝"}
                      </text>
                      <text className="route-card-manual-title" x="250" y="196">
                        {emptyTitle}
                      </text>
                      <text className="route-card-manual-subtitle" x="250" y="224">
                        {emptySubtitle}
                      </text>
                    </>
                  )}
                </svg>
              </div>

              <div className="challenge-run-card-stats">
                <div>
                  <span>DISTANCE</span>
                  <strong>{hasDistance ? `${distanceKm.toFixed(2)} km` : "—"}</strong>
                </div>

                <div>
                  <span>TIME</span>
                  <strong>{hasDuration ? `${durationMin} min` : "—"}</strong>
                </div>

                <div>
                  <span>PACE</span>
                  <strong>{paceText(paceMinPerKm)}</strong>
                </div>
              </div>

              {completionOnly && !hasMetrics ? (
                <div className="challenge-run-card-achieved">
                  ✅ COMPLETION VERIFIED · DETAILS UNAVAILABLE
                </div>
              ) : (
                <div className="challenge-run-card-achieved">
                  🏅 TARGET ACHIEVED
                </div>
              )}

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

        {canDelete ? (
          <button
            className="button secondary saved-run-delete-button"
            onClick={removeRun}
            disabled={deleting}
          >
            {deleting
              ? "Removing…"
              : isUploaded
                ? "Remove Uploaded Run"
                : "Remove Manual Entry"}
          </button>
        ) : null}
      </div>
    </div>
  );
}