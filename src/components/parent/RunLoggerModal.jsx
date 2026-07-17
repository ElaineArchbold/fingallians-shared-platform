import { useEffect, useMemo, useRef, useState } from "react";
import {
  MapContainer,
  Marker,
  Polyline,
  TileLayer,
  useMap,
} from "react-leaflet";
import * as htmlToImage from "html-to-image";
import { supabase } from "../../lib/supabaseClient";
import {
  playCountdownGo,
  playCountdownReady,
  playCountdownSet,
  playRunSaved,
} from "../../lib/sounds";

const DEFAULT_CENTER = [53.389, -6.246];

const SUPPORTED_ACTIVITY_FILE_TYPES = ["gpx", "tcx"];
const MAX_ACTIVITY_FILE_SIZE = 15 * 1024 * 1024;
const DUPLICATE_DISTANCE_TOLERANCE_KM = 0.05;
const DUPLICATE_DURATION_TOLERANCE_MINUTES = 15;

function normaliseRunType(run = {}, fallback = "manual") {
  const values = [
    run?.type,
    run?.runType,
    run?.run_type,
    run?.source,
    run?.runSource,
    run?.run_source,
    run?.completionType,
    run?.activityType,
    run?.importSource,
  ]
    .filter(Boolean)
    .map(value => String(value).trim().toLowerCase());

  if (
    run?.fileType ||
    run?.file_type ||
    run?.originalFilename ||
    run?.original_filename ||
    values.some(value => ["file_upload", "upload", "uploaded", "import", "imported", "gpx", "tcx"].includes(value))
  ) {
    return "file_upload";
  }

  if (values.includes("gps")) return "gps";
  if (values.includes("manual")) return "manual";
  return fallback;
}

const RUN_COACH_NOTES = [
  "Start steady, listen to your body, and do what you can. If it feels too much, slow down or split the distance over two runs.",
  "Nice and easy for the first minute. Find your rhythm, keep breathing, and build from there.",
  "Run tall, relax your shoulders, and keep your steps light. You have got this.",
  "Do not sprint from the start. A steady run beats a rushed one every time.",
  "Pick a safe route, keep your head up, and enjoy ticking off another challenge run.",
  "Small steps, steady breathing, strong finish. Go at your own pace.",
  "Focus on effort, not speed. Every run counts toward your challenge.",
  "Start calm, stay safe, and remember to smile when you finish.",
];

function getRandomCoachNote() {
  return RUN_COACH_NOTES[
    Math.floor(Math.random() * RUN_COACH_NOTES.length)
  ];
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
    Math.sin(dLng / 2) ** 2 *
    Math.cos(lat1) *
    Math.cos(lat2);

  return (
    radiusKm *
    2 *
    Math.atan2(
      Math.sqrt(x),
      Math.sqrt(Math.max(0, 1 - x))
    )
  );
}

function totalDistanceKm(points) {
  return points
    .slice(1)
    .reduce(
      (total, point, index) =>
        total + distanceBetween(points[index], point),
      0
    );
}

function buildRouteSvgPath(
  points,
  width = 500,
  height = 340,
  padding = 42
) {
  const routePoints = (points || [])
    .map((point) => ({
      lat: Number(point?.lat),
      lng: Number(point?.lng),
    }))
    .filter(
      (point) =>
        Number.isFinite(point.lat) &&
        Number.isFinite(point.lng)
    );

  if (routePoints.length < 2) return null;

  const lats = routePoints.map((point) => point.lat);
  const lngs = routePoints.map((point) => point.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);

  const latRange = Math.max(maxLat - minLat, 0.0001);
  const lngRange = Math.max(maxLng - minLng, 0.0001);
  const drawableWidth = width - padding * 2;
  const drawableHeight = height - padding * 2;

  const projected = routePoints.map((point) => {
    const x =
      padding +
      ((point.lng - minLng) / lngRange) *
      drawableWidth;

    const y =
      padding +
      ((maxLat - point.lat) / latRange) *
      drawableHeight;

    return {
      x: Number(x.toFixed(1)),
      y: Number(y.toFixed(1)),
    };
  });

  const path = projected
    .map(
      (point, index) =>
        `${index === 0 ? "M" : "L"}${point.x} ${point.y}`
    )
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
  const route = buildRouteSvgPath(
    run?.routePoints || [],
    width,
    height
  );

  const grid = `
    <path d="M0 68 H500 M0 136 H500 M0 204 H500 M0 272 H500" fill="none" stroke="rgba(85,140,94,0.18)" stroke-width="1"/>
    <path d="M100 0 V340 M200 0 V340 M300 0 V340 M400 0 V340" fill="none" stroke="rgba(85,140,94,0.18)" stroke-width="1"/>
  `;

  let routeMarkup;

  if (route) {
    routeMarkup = `
      <path d="${route.path}" fill="none" stroke="#b01425" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="${route.start.x}" cy="${route.start.y}" r="8" fill="#16843d"/>
      <circle cx="${route.finish.x}" cy="${route.finish.y}" r="10" fill="#b01425"/>
      <text
        x="${Math.min(
      476,
      Math.max(24, route.finish.x + 16)
    )}"
        y="${Math.min(
      316,
      Math.max(24, route.finish.y + 8)
    )}"
        font-size="25"
      >🏁</text>
    `;
  } else if (normaliseRunType(run) === "gps") {
    routeMarkup = `
      <text x="250" y="150" font-size="48" text-anchor="middle">🏃</text>
      <text x="250" y="196" font-size="24" font-weight="900" text-anchor="middle" fill="#351b20">GPS run saved</text>
      <text x="250" y="224" font-size="16" font-weight="700" text-anchor="middle" fill="#7a6269">Route points were not available</text>
    `;
  } else if (normaliseRunType(run) === "file_upload") {
    routeMarkup = `
      <text x="250" y="150" font-size="48" text-anchor="middle">📄</text>
      <text x="250" y="196" font-size="24" font-weight="900" text-anchor="middle" fill="#351b20">Uploaded activity</text>
      <text x="250" y="224" font-size="16" font-weight="700" text-anchor="middle" fill="#7a6269">${String(
      run?.fileType || "fitness file"
    ).toUpperCase()} import</text>
    `;
  } else {
    routeMarkup = `
      <text x="250" y="150" font-size="48" text-anchor="middle">📝</text>
      <text x="250" y="196" font-size="24" font-weight="900" text-anchor="middle" fill="#351b20">Manual run entry</text>
      <text x="250" y="224" font-size="16" font-weight="700" text-anchor="middle" fill="#7a6269">No GPS route recorded</text>
    `;
  }

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <rect width="500" height="340" fill="#e8f6e9"/>
      ${grid}
      ${routeMarkup}
    </svg>
  `;

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
    svg
  )}`;
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
  const secs = Math.round(
    (totalMinutes % 1) * 60
  );

  return `${mins}:${String(secs).padStart(2, "0")} /km`;
}

function parseNumber(value) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : null;
}

function getFileExtension(filename = "") {
  return (
    filename.split(".").pop()?.toLowerCase() || ""
  );
}

function parseXml(text) {
  const document = new DOMParser().parseFromString(
    text,
    "application/xml"
  );

  if (document.querySelector("parsererror")) {
    throw new Error(
      "The selected file contains invalid XML."
    );
  }

  return document;
}

function getElementsByLocalName(root, localName) {
  if (!root) return [];

  return Array.from(
    root.getElementsByTagNameNS("*", localName)
  );
}

function getFirstElementByLocalName(root, localName) {
  return (
    getElementsByLocalName(root, localName)[0] || null
  );
}

function getFirstTextByLocalName(root, localName) {
  return (
    getFirstElementByLocalName(
      root,
      localName
    )?.textContent?.trim() || null
  );
}

function parseTimestamp(value) {
  if (!value) return null;

  const timestamp = new Date(value).getTime();

  return Number.isFinite(timestamp)
    ? timestamp
    : null;
}

function getDurationFromPoints(routePoints) {
  const timestamps = routePoints
    .map((point) => point.ts)
    .filter((timestamp) =>
      Number.isFinite(timestamp)
    );

  if (timestamps.length < 2) return null;

  const firstTimestamp = timestamps[0];
  const lastTimestamp =
    timestamps[timestamps.length - 1];

  if (lastTimestamp <= firstTimestamp) {
    return null;
  }

  return Math.max(
    1,
    Math.round(
      (lastTimestamp - firstTimestamp) / 60000
    )
  );
}

function getActivityDateFromPoints(routePoints) {
  const firstTimestamp = routePoints.find((point) =>
    Number.isFinite(point.ts)
  )?.ts;

  return firstTimestamp
    ? new Date(firstTimestamp).toISOString()
    : null;
}

function parseGpx(text) {
  const document = parseXml(text);
  const trackPoints = getElementsByLocalName(
    document,
    "trkpt"
  );

  if (!trackPoints.length) {
    throw new Error(
      "No GPS track points were found in this GPX file."
    );
  }

  const routePoints = trackPoints
    .map((point) => {
      const lat = parseNumber(
        point.getAttribute("lat")
      );

      const lng = parseNumber(
        point.getAttribute("lon")
      );

      const elevation = parseNumber(
        getFirstTextByLocalName(point, "ele")
      );

      const ts = parseTimestamp(
        getFirstTextByLocalName(point, "time")
      );

      return {
        lat,
        lng,
        elevation,
        ts,
      };
    })
    .filter(
      (point) =>
        Number.isFinite(point.lat) &&
        Number.isFinite(point.lng)
    );

  if (routePoints.length < 2) {
    throw new Error(
      "The GPX file does not contain enough usable route points."
    );
  }

  const distanceKm =
    totalDistanceKm(routePoints);

  if (
    !Number.isFinite(distanceKm) ||
    distanceKm <= 0
  ) {
    throw new Error(
      "A valid distance could not be calculated from this GPX file."
    );
  }

  return {
    fileType: "gpx",
    distanceKm: Number(distanceKm.toFixed(2)),
    durationMin:
      getDurationFromPoints(routePoints),
    activityDate:
      getActivityDateFromPoints(routePoints),
    routePoints,
    pointCount: routePoints.length,
  };
}

function parseTcx(text) {
  const document = parseXml(text);

  const trackPoints = getElementsByLocalName(
    document,
    "Trackpoint"
  );

  if (!trackPoints.length) {
    throw new Error(
      "No track points were found in this TCX file."
    );
  }

  const routePoints = trackPoints
    .map((point) => {
      const position =
        getFirstElementByLocalName(
          point,
          "Position"
        );

      const lat = parseNumber(
        getFirstTextByLocalName(
          position,
          "LatitudeDegrees"
        )
      );

      const lng = parseNumber(
        getFirstTextByLocalName(
          position,
          "LongitudeDegrees"
        )
      );

      const elevation = parseNumber(
        getFirstTextByLocalName(
          point,
          "AltitudeMeters"
        )
      );

      const ts = parseTimestamp(
        getFirstTextByLocalName(point, "Time")
      );

      return {
        lat,
        lng,
        elevation,
        ts,
      };
    })
    .filter(
      (point) =>
        Number.isFinite(point.lat) &&
        Number.isFinite(point.lng)
    );

  const laps = getElementsByLocalName(
    document,
    "Lap"
  );

  const recordedDistanceMeters = laps.reduce(
    (total, lap) => {
      const distance = parseNumber(
        getFirstTextByLocalName(
          lap,
          "DistanceMeters"
        )
      );

      return total + (distance || 0);
    },
    0
  );

  const recordedDurationSeconds = laps.reduce(
    (total, lap) => {
      const duration = parseNumber(
        getFirstTextByLocalName(
          lap,
          "TotalTimeSeconds"
        )
      );

      return total + (duration || 0);
    },
    0
  );

  const routeDistanceKm =
    routePoints.length >= 2
      ? totalDistanceKm(routePoints)
      : null;

  const distanceKm =
    recordedDistanceMeters > 0
      ? recordedDistanceMeters / 1000
      : routeDistanceKm;

  if (!distanceKm || distanceKm <= 0) {
    throw new Error(
      "A valid distance could not be read from this TCX file."
    );
  }

  const activityId =
    getFirstTextByLocalName(document, "Id");

  return {
    fileType: "tcx",
    distanceKm: Number(distanceKm.toFixed(2)),
    durationMin:
      recordedDurationSeconds > 0
        ? Math.max(
          1,
          Math.round(
            recordedDurationSeconds / 60
          )
        )
        : getDurationFromPoints(routePoints),
    activityDate:
      activityId ||
      getActivityDateFromPoints(routePoints),
    routePoints,
    pointCount: routePoints.length,
  };
}

async function parseActivityFile(file) {
  const extension = getFileExtension(file.name);

  if (
    !SUPPORTED_ACTIVITY_FILE_TYPES.includes(
      extension
    )
  ) {
    throw new Error(
      "Choose a GPX or TCX activity file."
    );
  }

  if (file.size > MAX_ACTIVITY_FILE_SIZE) {
    throw new Error(
      "The selected file is too large. The maximum size is 15 MB."
    );
  }

  const text = await file.text();

  if (!text.trim()) {
    throw new Error(
      "The selected activity file is empty."
    );
  }

  return extension === "gpx"
    ? parseGpx(text)
    : parseTcx(text);
}

function normaliseDate(value) {
  if (!value) return null;

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString().slice(0, 10);
}

function findLikelyDuplicate(
  importedActivity,
  existingRuns
) {
  const importedDate = normaliseDate(
    importedActivity.activityDate
  );

  if (!importedDate) return null;

  return (existingRuns || []).find((run) => {
    const runDistance = parseNumber(
      run?.distanceKm ??
      run?.distance_km ??
      run?.distance ??
      run?.completed_value
    );

    const runDuration = parseNumber(
      run?.durationMin ??
      run?.duration_min ??
      run?.duration_minutes ??
      run?.minutes
    );

    const runDate = normaliseDate(
      run?.activityDate ??
      run?.activity_date ??
      run?.savedAt ??
      run?.saved_at ??
      run?.created_at
    );

    const sameDate =
      runDate === importedDate;

    const similarDistance =
      Number.isFinite(runDistance) &&
      Math.abs(
        runDistance -
        importedActivity.distanceKm
      ) <=
      DUPLICATE_DISTANCE_TOLERANCE_KM;

    const similarDuration =
      !importedActivity.durationMin ||
      !Number.isFinite(runDuration) ||
      Math.abs(
        runDuration -
        importedActivity.durationMin
      ) <=
      DUPLICATE_DURATION_TOLERANCE_MINUTES;

    return (
      sameDate &&
      similarDistance &&
      similarDuration
    );
  });
}

function formatActivityDate(value) {
  if (!value) return "Not available";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Not available";
  }

  return date.toLocaleDateString("en-IE", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function RunActivityImport({
  existingRuns = [],
  saving = false,
  onImport,
}) {
  const inputRef = useRef(null);

  const [selectedFile, setSelectedFile] =
    useState(null);

  const [parsedActivity, setParsedActivity] =
    useState(null);

  const [duplicateRun, setDuplicateRun] =
    useState(null);

  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState("");

  const [
    showDuplicateConfirmation,
    setShowDuplicateConfirmation,
  ] = useState(false);

  function resetImport() {
    setSelectedFile(null);
    setParsedActivity(null);
    setDuplicateRun(null);
    setError("");
    setShowDuplicateConfirmation(false);

    if (inputRef.current) {
      inputRef.current.value = "";
    }
  }

  async function handleFileChange(event) {
    const file = event.target.files?.[0];

    setError("");
    setParsedActivity(null);
    setDuplicateRun(null);
    setShowDuplicateConfirmation(false);

    if (!file) {
      setSelectedFile(null);
      return;
    }

    setSelectedFile(file);
    setParsing(true);

    try {
      const parsed =
        await parseActivityFile(file);

      const result = {
        ...parsed,
        originalFilename: file.name,
      };

      setParsedActivity(result);

      setDuplicateRun(
        findLikelyDuplicate(
          result,
          existingRuns
        )
      );
    } catch (parseError) {
      setSelectedFile(null);

      setError(
        parseError?.message ||
        "This activity file could not be imported."
      );

      if (inputRef.current) {
        inputRef.current.value = "";
      }
    } finally {
      setParsing(false);
    }
  }

  async function completeImport(
    allowDuplicate = false
  ) {
    if (!parsedActivity || saving) return;

    if (duplicateRun && !allowDuplicate) {
      setShowDuplicateConfirmation(true);
      return;
    }

    try {
      await onImport(parsedActivity);
    } catch (importError) {
      setError(
        importError?.message ||
        "The activity could not be imported."
      );
    }
  }

  return (
    <section
      style={{
        marginTop: 24,
        paddingTop: 22,
        borderTop: "1px solid #eadadd",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 12,
          marginBottom: 14,
        }}
      >
        <div>
          <h3 style={{ margin: 0 }}>
            Upload Fitness File
          </h3>

          <p
            style={{
              margin: "6px 0 0",
              color: "#765f65",
              fontSize: "0.92rem",
              lineHeight: 1.45,
            }}
          >
            Import a run recorded in another
            fitness app.
          </p>
        </div>

        <span
          style={{
            flexShrink: 0,
            padding: "5px 9px",
            borderRadius: 999,
            background: "#f3e8ea",
            color: "#7f1d1d",
            fontSize: "0.72rem",
            fontWeight: 900,
          }}
        >
          GPX · TCX
        </span>
      </div>

      {!parsedActivity ? (
        <>
          <input
            ref={inputRef}
            type="file"
            accept=".gpx,.tcx,application/gpx+xml,application/vnd.garmin.tcx+xml,application/xml,text/xml"
            onChange={handleFileChange}
            disabled={parsing || saving}
            style={{ display: "none" }}
          />

          <button
            type="button"
            className="button secondary"
            onClick={() =>
              inputRef.current?.click()
            }
            disabled={parsing || saving}
          >
            {parsing
              ? "Reading activity…"
              : "Choose GPX or TCX File"}
          </button>

          {selectedFile && parsing ? (
            <p
              style={{
                margin: "10px 0 0",
                color: "#765f65",
                fontSize: "0.88rem",
              }}
            >
              Reading {selectedFile.name}
            </p>
          ) : null}
        </>
      ) : (
        <div
          style={{
            padding: 16,
            border: "1px solid #e5d4d7",
            borderRadius: 14,
            background: "#fffaf4",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              minWidth: 0,
            }}
          >
            <span
              aria-hidden="true"
              style={{ fontSize: "1.8rem" }}
            >
              📄
            </span>

            <div style={{ minWidth: 0 }}>
              <strong
                style={{
                  display: "block",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {parsedActivity.originalFilename}
              </strong>

              <small
                style={{
                  display: "block",
                  marginTop: 3,
                  color: "#806b70",
                }}
              >
                {parsedActivity.fileType.toUpperCase()}{" "}
                activity
              </small>
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                "repeat(3, minmax(0, 1fr))",
              gap: 8,
              margin: "16px 0",
            }}
          >
            <div
              style={{
                padding: "10px 8px",
                borderRadius: 10,
                background: "#f8eeee",
                textAlign: "center",
              }}
            >
              <span
                style={{
                  display: "block",
                  marginBottom: 4,
                  color: "#806b70",
                  fontSize: "0.72rem",
                  fontWeight: 800,
                  textTransform: "uppercase",
                }}
              >
                Distance
              </span>

              <strong
                style={{
                  display: "block",
                  color: "#351b20",
                }}
              >
                {parsedActivity.distanceKm.toFixed(
                  2
                )}{" "}
                km
              </strong>
            </div>

            <div
              style={{
                padding: "10px 8px",
                borderRadius: 10,
                background: "#f8eeee",
                textAlign: "center",
              }}
            >
              <span
                style={{
                  display: "block",
                  marginBottom: 4,
                  color: "#806b70",
                  fontSize: "0.72rem",
                  fontWeight: 800,
                  textTransform: "uppercase",
                }}
              >
                Time
              </span>

              <strong
                style={{
                  display: "block",
                  color: "#351b20",
                }}
              >
                {parsedActivity.durationMin
                  ? `${parsedActivity.durationMin} min`
                  : "Not available"}
              </strong>
            </div>

            <div
              style={{
                padding: "10px 8px",
                borderRadius: 10,
                background: "#f8eeee",
                textAlign: "center",
              }}
            >
              <span
                style={{
                  display: "block",
                  marginBottom: 4,
                  color: "#806b70",
                  fontSize: "0.72rem",
                  fontWeight: 800,
                  textTransform: "uppercase",
                }}
              >
                Date
              </span>

              <strong
                style={{
                  display: "block",
                  color: "#351b20",
                }}
              >
                {formatActivityDate(
                  parsedActivity.activityDate
                )}
              </strong>
            </div>
          </div>

          {duplicateRun ? (
            <div
              style={{
                marginBottom: 14,
                padding: "10px 12px",
                border:
                  "1px solid #efc76d",
                borderRadius: 10,
                background: "#fff7dd",
                color: "#6d4b00",
                fontSize: "0.87rem",
                fontWeight: 700,
              }}
            >
              This looks similar to a run already
              saved for the same day.
            </div>
          ) : null}

          <div
            style={{
              display: "grid",
              gap: 8,
            }}
          >
            <button
              type="button"
              className="button primary"
              onClick={() =>
                completeImport(false)
              }
              disabled={saving}
            >
              {saving
                ? "Importing…"
                : "Import Run"}
            </button>

            <button
              type="button"
              className="button secondary"
              onClick={resetImport}
              disabled={saving}
            >
              Choose Another File
            </button>
          </div>
        </div>
      )}

      {error ? (
        <p
          role="alert"
          style={{
            margin: "12px 0 0",
            padding: "10px 12px",
            border: "1px solid #f2b8b8",
            borderRadius: 10,
            background: "#fff0f0",
            color: "#9b1c1c",
            fontSize: "0.88rem",
            fontWeight: 700,
          }}
        >
          {error}
        </p>
      ) : null}

      {showDuplicateConfirmation ? (
        <div className="run-confirm-backdrop">
          <div className="run-confirm-modal">
            <h2>Possible duplicate run</h2>

            <p>
              A run with a similar date,
              distance and duration has already
              been saved. Do you still want to
              import this file?
            </p>

            <div className="run-action-grid">
              <button
                type="button"
                className="button secondary"
                onClick={() =>
                  setShowDuplicateConfirmation(
                    false
                  )
                }
                disabled={saving}
              >
                Cancel
              </button>

              <button
                type="button"
                className="button primary"
                onClick={() =>
                  completeImport(true)
                }
                disabled={saving}
              >
                {saving
                  ? "Importing…"
                  : "Import Anyway"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function MapAutoCenter({ point }) {
  const map = useMap();

  useEffect(() => {
    if (point) {
      map.setView(
        [point.lat, point.lng],
        16
      );
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
  existingRuns = [],
  manualOnly = false,
}) {
  const [mode, setMode] = useState(
    manualOnly ? "manual" : "gps"
  );

  const [tracking, setTracking] =
    useState(false);

  const [saving, setSaving] =
    useState(false);

  const [deleting, setDeleting] =
    useState(false);

  const [screenshotBusy, setScreenshotBusy] =
    useState(false);

  const [finishedRun, setFinishedRun] =
    useState(null);

  const [paused, setPaused] =
    useState(false);

  const [gpsStatus, setGpsStatus] = useState(
    "Ready to start."
  );

  const [elapsed, setElapsed] = useState(0);
  const [points, setPoints] = useState([]);

  const [
    showConfirmFinish,
    setShowConfirmFinish,
  ] = useState(false);

  const [
    showDiscardConfirm,
    setShowDiscardConfirm,
  ] = useState(false);

  const [holdPercent, setHoldPercent] =
    useState(0);

  const [countdownStep, setCountdownStep] =
    useState("");

  const [
    showStartCoachNote,
    setShowStartCoachNote,
  ] = useState(false);

  const [coachNote, setCoachNote] = useState(
    () => getRandomCoachNote()
  );

  const [
    showSuccessConfetti,
    setShowSuccessConfetti,
  ] = useState(false);

  const [
    manualDistance,
    setManualDistance,
  ] = useState(
    activity?.target_unit === "km"
      ? String(activity.target_value || "")
      : ""
  );

  const [
    manualMinutes,
    setManualMinutes,
  ] = useState("");

  const watchRef = useRef(null);
  const timerRef = useRef(null);
  const pointsRef = useRef([]);
  const pausedRef = useRef(false);
  const holdStartRef = useRef(null);
  const holdFrameRef = useRef(null);
  const cardRef = useRef(null);
  const countdownTimeoutRef = useRef(null);
  const coachNoteTimeoutRef = useRef(null);
  const successConfettiTimeoutRef =
    useRef(null);
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
  const lastTelemetryHeartbeatRef =
    useRef(0);

  const distanceKm = Number(
    totalDistanceKm(points).toFixed(2)
  );

  const targetKm =
    activity?.target_unit === "km"
      ? Number(activity.target_value || 0)
      : 0;

  const activityWeek = Math.min(
    8,
    Math.max(
      1,
      Number(
        activity?.week_number ??
        activity?.week ??
        1
      )
    )
  );

  const latestPoint =
    points[points.length - 1] || null;

  const route = useMemo(
    () =>
      points.map((point) => [
        point.lat,
        point.lng,
      ]),
    [points]
  );

  const pace = paceFromSeconds(
    elapsed,
    distanceKm
  );

  const screenshotMapSrc = useMemo(
    () =>
      buildScreenshotMapDataUrl(
        finishedRun
      ),
    [finishedRun]
  );

  useEffect(() => {
    setMode(
      manualOnly ? "manual" : "gps"
    );

    setFinishedRun(null);
    setSaving(false);
    savingRef.current = false;

    setManualDistance(
      activity?.target_unit === "km"
        ? String(
          activity.target_value || ""
        )
        : ""
    );

    setManualMinutes("");
    setCoachNote(getRandomCoachNote());
    setShowStartCoachNote(true);

    if (coachNoteTimeoutRef.current) {
      clearTimeout(
        coachNoteTimeoutRef.current
      );
    }

    coachNoteTimeoutRef.current =
      setTimeout(() => {
        setShowStartCoachNote(false);
        coachNoteTimeoutRef.current =
          null;
      }, 4500);

    return () => {
      if (coachNoteTimeoutRef.current) {
        clearTimeout(
          coachNoteTimeoutRef.current
        );

        coachNoteTimeoutRef.current =
          null;
      }
    };
  }, [
    activity?.id,
    manualOnly,
    activity?.target_unit,
    activity?.target_value,
  ]);

  useEffect(() => {
    function blockRefresh(event) {
      if (!tracking) return;

      event.preventDefault();
      event.returnValue = "";
    }

    window.addEventListener(
      "beforeunload",
      blockRefresh
    );

    return () => {
      window.removeEventListener(
        "beforeunload",
        blockRefresh
      );
    };
  }, [tracking]);

  async function logGpsEvent(
    eventType,
    extra = {}
  ) {
    const runSessionId =
      runSessionIdRef.current;

    if (
      !runSessionId ||
      !selectedPlayer?.id ||
      !activity?.id
    ) {
      return;
    }

    const currentPoints =
      pointsRef.current || [];

    try {
      const { error } = await supabase
        .from("gps_run_events")
        .insert({
          run_session_id: runSessionId,
          player_id: selectedPlayer.id,
          activity_id: activity.id,
          event_type: eventType,
          accuracy_m:
            extra.accuracy_m ?? null,
          point_count:
            currentPoints.length,
          distance_km: Number(
            totalDistanceKm(
              currentPoints
            ).toFixed(3)
          ),
          error_code:
            extra.error_code ?? null,
          details: {
            week: activityWeek,
            activity_title:
              activity.title,
            player_name:
              selectedPlayer.name,
            visibility_state:
              document.visibilityState,
            reconnect_count:
              reconnectCountRef.current,
            ...extra.details,
          },
          occurred_at:
            new Date().toISOString(),
        });

      if (error) {
        console.warn(
          "GPS telemetry insert failed:",
          eventType,
          error
        );
      }
    } catch (error) {
      console.warn(
        "GPS telemetry unavailable:",
        eventType,
        error
      );
    }
  }

  useEffect(() => {
    function handleVisibilityChange() {
      if (!trackingRef.current) return;

      if (
        document.visibilityState ===
        "hidden"
      ) {
        logGpsEvent("app_hidden", {
          details: {
            last_gps_at:
              lastGpsUpdateRef.current
                ? new Date(
                  lastGpsUpdateRef.current
                ).toISOString()
                : null,
          },
        });

        return;
      }

      if (
        document.visibilityState ===
        "visible" &&
        !pausedRef.current
      ) {
        logGpsEvent("app_visible", {
          details: {
            last_gps_at:
              lastGpsUpdateRef.current
                ? new Date(
                  lastGpsUpdateRef.current
                ).toISOString()
                : null,
          },
        });

        requestScreenWakeLock();

        const staleForMs =
          Date.now() -
          lastGpsUpdateRef.current;

        if (
          !lastGpsUpdateRef.current ||
          staleForMs > 10000
        ) {
          restartGpsWatch(
            "GPS reconnecting after the app resumed…",
            {
              reason:
                "app_visible_stale",
              stale_for_ms: staleForMs,
            }
          );
        }
      }
    }

    document.addEventListener(
      "visibilitychange",
      handleVisibilityChange
    );

    return () => {
      document.removeEventListener(
        "visibilitychange",
        handleVisibilityChange
      );

      stopTracking();
      cancelHoldFinish();
    };
  }, []);

  async function requestScreenWakeLock() {
    if (!("wakeLock" in navigator)) {
      return;
    }

    if (
      wakeLockRef.current &&
      !wakeLockRef.current.released
    ) {
      return;
    }

    try {
      const lock =
        await navigator.wakeLock.request(
          "screen"
        );

      wakeLockRef.current = lock;
      logGpsEvent("wake_lock_acquired");

      lock.addEventListener(
        "release",
        () => {
          if (
            wakeLockRef.current === lock
          ) {
            wakeLockRef.current = null;
          }

          if (trackingRef.current) {
            logGpsEvent(
              "wake_lock_released",
              {
                details: {
                  unexpected: true,
                },
              }
            );
          }
        }
      );
    } catch (error) {
      console.warn(
        "Screen wake lock unavailable:",
        error
      );

      logGpsEvent(
        "wake_lock_unavailable",
        {
          details: {
            message:
              error?.message ||
              String(error),
          },
        }
      );
    }
  }

  async function releaseScreenWakeLock() {
    const lock = wakeLockRef.current;
    wakeLockRef.current = null;

    if (!lock || lock.released) return;

    try {
      await lock.release();

      logGpsEvent(
        "wake_lock_released",
        {
          details: {
            unexpected: false,
          },
        }
      );
    } catch (error) {
      console.warn(
        "Could not release screen wake lock:",
        error
      );
    }
  }

  function stopTracking() {
    trackingRef.current = false;
    releaseScreenWakeLock();

    if (watchRef.current !== null) {
      navigator.geolocation.clearWatch(
        watchRef.current
      );

      watchRef.current = null;
    }

    if (reconnectTimeoutRef.current) {
      clearTimeout(
        reconnectTimeoutRef.current
      );

      reconnectTimeoutRef.current =
        null;
    }

    if (staleGpsIntervalRef.current) {
      clearInterval(
        staleGpsIntervalRef.current
      );

      staleGpsIntervalRef.current =
        null;
    }

    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    if (countdownTimeoutRef.current) {
      clearTimeout(
        countdownTimeoutRef.current
      );

      countdownTimeoutRef.current =
        null;
    }

    if (coachNoteTimeoutRef.current) {
      clearTimeout(
        coachNoteTimeoutRef.current
      );

      coachNoteTimeoutRef.current =
        null;
    }

    if (
      successConfettiTimeoutRef.current
    ) {
      clearTimeout(
        successConfettiTimeoutRef.current
      );

      successConfettiTimeoutRef.current =
        null;
    }
  }

  function requestClose() {
    if (tracking) {
      alert(
        "Your run is still tracking. Hold to finish before closing."
      );

      return;
    }

    onClose();
  }

  function dismissCoachNote() {
    if (coachNoteTimeoutRef.current) {
      clearTimeout(
        coachNoteTimeoutRef.current
      );

      coachNoteTimeoutRef.current =
        null;
    }

    setShowStartCoachNote(false);
  }

  function playRunCompleteDing() {
    playRunSaved();
  }

  function showRunCompleteCelebration() {
    playRunCompleteDing();
    setShowSuccessConfetti(true);

    if (
      successConfettiTimeoutRef.current
    ) {
      clearTimeout(
        successConfettiTimeoutRef.current
      );
    }

    successConfettiTimeoutRef.current =
      setTimeout(() => {
        setShowSuccessConfetti(false);

        successConfettiTimeoutRef.current =
          null;
      }, 1400);
  }

  function getAudioContext() {
    try {
      const AudioContext =
        window.AudioContext ||
        window.webkitAudioContext;

      if (!AudioContext) return null;

      if (
        !audioContextRef.current ||
        audioContextRef.current.state ===
        "closed"
      ) {
        audioContextRef.current =
          new AudioContext();
      }

      if (
        audioContextRef.current.state ===
        "suspended"
      ) {
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
      const oscillator =
        context.createOscillator();

      const gain =
        context.createGain();

      gain.gain.setValueAtTime(
        0.0001,
        context.currentTime
      );

      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start();

      oscillator.stop(
        context.currentTime + 0.01
      );
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
      setGpsStatus(
        "GPS is not available. Use manual entry instead."
      );

      setMode("manual");
      return;
    }

    if (countdownStep || tracking) {
      return;
    }

    const steps = [
      "READY",
      "SET",
      "GO!",
    ];

    steps.forEach((step, index) => {
      countdownTimeoutRef.current =
        setTimeout(() => {
          setCountdownStep(step);
          playCountdownTone(step);

          if (step === "GO!") {
            countdownTimeoutRef.current =
              setTimeout(() => {
                setCountdownStep("");
                startGps();
              }, 700);
          }
        }, index * 900);
    });
  }

  function beginStartCountdown() {
    if (!navigator.geolocation) {
      setGpsStatus(
        "GPS is not available. Use manual entry instead."
      );

      setMode("manual");
      return;
    }

    if (countdownStep || tracking) {
      return;
    }

    dismissCoachNote();
    primeAudioContext();
    startTrafficLightCountdown();
  }

  function acceptGpsPosition(position) {
    if (
      !trackingRef.current ||
      pausedRef.current
    ) {
      return;
    }

    const accuracy = Number(
      position.coords.accuracy || 999
    );

    const nextPoint = {
      lat: Number(
        position.coords.latitude
      ),
      lng: Number(
        position.coords.longitude
      ),
      acc: accuracy,
      ts: Date.now(),
    };

    if (
      !Number.isFinite(nextPoint.lat) ||
      !Number.isFinite(nextPoint.lng)
    ) {
      return;
    }

    lastGpsUpdateRef.current =
      Date.now();

    staleRecoveryLevelRef.current = 0;

    if (!firstFixLoggedRef.current) {
      firstFixLoggedRef.current = true;

      logGpsEvent("first_fix", {
        accuracy_m: accuracy,
      });
    }

    if (accuracy > 120) {
      setGpsStatus(
        `Weak GPS signal (${Math.round(
          accuracy
        )}m). Searching for a better fix…`
      );

      logGpsEvent("weak_signal", {
        accuracy_m: accuracy,
      });

      return;
    }

    if (
      Date.now() -
      lastTelemetryHeartbeatRef.current >
      60000
    ) {
      lastTelemetryHeartbeatRef.current =
        Date.now();

      logGpsEvent("gps_heartbeat", {
        accuracy_m: accuracy,
      });
    }

    setPoints((previous) => {
      const last =
        previous[previous.length - 1];

      if (last) {
        const segmentKm =
          distanceBetween(
            last,
            nextPoint
          );

        const seconds = Math.max(
          1,
          (nextPoint.ts - last.ts) / 1000
        );

        const speedKmh =
          segmentKm /
          (seconds / 3600);

        if (segmentKm < 0.003) {
          setGpsStatus(
            `GPS active · accuracy ${Math.round(
              accuracy
            )}m`
          );

          return previous;
        }

        if (
          segmentKm > 0.35 &&
          speedKmh > 28
        ) {
          setGpsStatus(
            "Ignored one jumpy GPS point. Still tracking."
          );

          return previous;
        }
      }

      const updated = [
        ...previous,
        nextPoint,
      ];

      pointsRef.current = updated;

      setGpsStatus(
        `GPS active · accuracy ${Math.round(
          accuracy
        )}m`
      );

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
      clearTimeout(
        reconnectTimeoutRef.current
      );
    }

    reconnectTimeoutRef.current =
      setTimeout(() => {
        reconnectTimeoutRef.current =
          null;

        if (
          trackingRef.current &&
          !pausedRef.current
        ) {
          reconnectCountRef.current += 1;

          logGpsEvent(
            "watch_restarted",
            {
              details: {
                reason:
                  context.reason ||
                  "scheduled_reconnect",
                ...context,
              },
            }
          );

          startGpsWatch();
        }
      }, 2000);
  }

  function startGpsWatch() {
    if (
      !navigator.geolocation ||
      !trackingRef.current
    ) {
      return;
    }

    if (watchRef.current !== null) {
      navigator.geolocation.clearWatch(
        watchRef.current
      );

      watchRef.current = null;
    }

    watchRef.current =
      navigator.geolocation.watchPosition(
        acceptGpsPosition,
        (error) => {
          console.error(
            "GPS watch error",
            error
          );

          if (!trackingRef.current) {
            return;
          }

          if (error?.code === 1) {
            setGpsStatus(
              "Location permission was denied. Enable location access or use manual entry."
            );

            logGpsEvent(
              "permission_denied",
              {
                error_code:
                  error.code,
                details: {
                  message:
                    error.message ||
                    null,
                  source:
                    "watch_position",
                },
              }
            );

            return;
          }

          const eventType =
            error?.code === 3
              ? "gps_timeout"
              : "gps_unavailable";

          logGpsEvent(eventType, {
            error_code: error?.code,
            details: {
              message:
                error?.message ||
                null,
              source:
                "watch_position",
            },
          });

          scheduleGpsReconnect(
            error?.code === 3
              ? "GPS timed out. Reconnecting…"
              : "GPS signal dropped. Reconnecting…",
            {
              reason: eventType,
              error_code:
                error?.code ||
                null,
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

  function restartGpsWatch(
    message = "GPS reconnecting…",
    context = {}
  ) {
    if (
      !trackingRef.current ||
      pausedRef.current
    ) {
      return;
    }

    setGpsStatus(message);
    reconnectCountRef.current += 1;

    logGpsEvent("watch_restarted", {
      details: {
        reason:
          context.reason ||
          "direct_restart",
        ...context,
      },
    });

    startGpsWatch();
  }

  function startGps() {
    setCountdownStep("");
    setShowStartCoachNote(false);

    if (!navigator.geolocation) {
      setGpsStatus(
        "GPS is not available. Use manual entry instead."
      );

      setMode("manual");
      return;
    }

    setElapsed(0);
    setPoints([]);
    pointsRef.current = [];

    lastGpsUpdateRef.current =
      Date.now();

    runSessionIdRef.current =
      crypto.randomUUID();

    firstFixLoggedRef.current = false;
    reconnectCountRef.current = 0;
    staleRecoveryLevelRef.current = 0;
    lastTelemetryHeartbeatRef.current = 0;

    trackingRef.current = true;
    setTracking(true);
    requestScreenWakeLock();

    setPaused(false);
    pausedRef.current = false;

    setGpsStatus(
      "Finding GPS signal…"
    );

    logGpsEvent("run_started", {
      details: {
        target_km: targetKm,
        manual_only: manualOnly,
      },
    });

    if (timerRef.current) {
      clearInterval(timerRef.current);
    }

    timerRef.current = setInterval(() => {
      if (!pausedRef.current) {
        setElapsed(
          (value) => value + 1
        );
      }
    }, 1000);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (!trackingRef.current) {
          return;
        }

        const firstPoint = {
          lat: Number(
            position.coords.latitude
          ),
          lng: Number(
            position.coords.longitude
          ),
          acc: Number(
            position.coords.accuracy ||
            999
          ),
          ts: Date.now(),
        };

        if (
          !Number.isFinite(
            firstPoint.lat
          ) ||
          !Number.isFinite(
            firstPoint.lng
          )
        ) {
          return;
        }

        lastGpsUpdateRef.current =
          Date.now();

        setPoints([firstPoint]);
        pointsRef.current = [
          firstPoint,
        ];

        setGpsStatus(
          `GPS active · accuracy ${Math.round(
            firstPoint.acc
          )}m`
        );
      },
      (error) => {
        console.error(
          "Initial GPS fix failed",
          error
        );

        if (error?.code === 1) {
          setGpsStatus(
            "Location permission was denied. Enable location access or use manual entry."
          );

          logGpsEvent(
            "permission_denied",
            {
              error_code:
                error.code,
              details: {
                message:
                  error.message ||
                  null,
                source:
                  "initial_fix",
              },
            }
          );

          return;
        }

        logGpsEvent(
          error?.code === 3
            ? "gps_timeout"
            : "gps_unavailable",
          {
            error_code:
              error?.code,
            details: {
              message:
                error?.message ||
                null,
              source:
                "initial_fix",
            },
          }
        );

        setGpsStatus(
          "Waiting for GPS fix…"
        );
      },
      {
        enableHighAccuracy: true,
        timeout: 30000,
        maximumAge: 2000,
      }
    );

    startGpsWatch();

    if (staleGpsIntervalRef.current) {
      clearInterval(
        staleGpsIntervalRef.current
      );
    }

    staleGpsIntervalRef.current =
      setInterval(() => {
        if (
          !trackingRef.current ||
          pausedRef.current
        ) {
          return;
        }

        const staleForMs =
          Date.now() -
          lastGpsUpdateRef.current;

        if (
          staleForMs > 90000 &&
          staleRecoveryLevelRef.current <
          4
        ) {
          staleRecoveryLevelRef.current =
            4;

          setGpsStatus(
            "GPS signal has been unavailable for a while. Still trying to recover…"
          );

          logGpsEvent(
            "gps_stale_90s",
            {
              details: {
                stale_for_ms:
                  staleForMs,
              },
            }
          );

          restartGpsWatch(
            "GPS signal lost. Trying again…",
            {
              reason: "stale_90s",
              stale_for_ms:
                staleForMs,
            }
          );

          return;
        }

        if (
          staleForMs > 60000 &&
          staleRecoveryLevelRef.current <
          3
        ) {
          staleRecoveryLevelRef.current =
            3;

          logGpsEvent(
            "gps_stale_60s",
            {
              details: {
                stale_for_ms:
                  staleForMs,
              },
            }
          );

          navigator.geolocation.getCurrentPosition(
            acceptGpsPosition,
            (error) => {
              logGpsEvent(
                error?.code === 3
                  ? "gps_timeout"
                  : "gps_unavailable",
                {
                  error_code:
                    error?.code,
                  details: {
                    message:
                      error?.message ||
                      null,
                    source:
                      "stale_recovery_get_current_position",
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

        if (
          staleForMs > 40000 &&
          staleRecoveryLevelRef.current <
          2
        ) {
          staleRecoveryLevelRef.current =
            2;

          logGpsEvent(
            "gps_stale_40s",
            {
              details: {
                stale_for_ms:
                  staleForMs,
              },
            }
          );

          restartGpsWatch(
            "GPS still unavailable. Recreating tracker…",
            {
              reason: "stale_40s",
              stale_for_ms:
                staleForMs,
            }
          );

          return;
        }

        if (
          staleForMs > 20000 &&
          staleRecoveryLevelRef.current <
          1
        ) {
          staleRecoveryLevelRef.current =
            1;

          logGpsEvent(
            "gps_stale_20s",
            {
              details: {
                stale_for_ms:
                  staleForMs,
              },
            }
          );

          restartGpsWatch(
            "No GPS update for 20 seconds. Reconnecting…",
            {
              reason: "stale_20s",
              stale_for_ms:
                staleForMs,
            }
          );
        }
      }, 5000);
  }

  function togglePause() {
    pausedRef.current =
      !pausedRef.current;

    setPaused(pausedRef.current);

    if (pausedRef.current) {
      setGpsStatus("Run paused.");
      logGpsEvent("run_paused");
      return;
    }

    logGpsEvent("run_resumed");

    lastGpsUpdateRef.current =
      Date.now();

    restartGpsWatch(
      "Run resumed. Reconnecting GPS…",
      {
        reason: "run_resumed",
      }
    );
  }

  function startHoldFinish(event) {
    event.preventDefault();

    if (
      saving ||
      showConfirmFinish
    ) {
      return;
    }

    holdStartRef.current =
      Date.now();

    setHoldPercent(0);

    function tick() {
      const elapsedHold =
        Date.now() -
        holdStartRef.current;

      const percent = Math.min(
        100,
        Math.round(
          (elapsedHold / 2000) *
          100
        )
      );

      setHoldPercent(percent);

      if (percent >= 100) {
        cancelHoldFinish(false);
        setShowConfirmFinish(true);
        return;
      }

      holdFrameRef.current =
        requestAnimationFrame(tick);
    }

    holdFrameRef.current =
      requestAnimationFrame(tick);
  }

  function cancelHoldFinish(
    reset = true
  ) {
    if (holdFrameRef.current) {
      cancelAnimationFrame(
        holdFrameRef.current
      );

      holdFrameRef.current = null;
    }

    holdStartRef.current = null;

    if (reset) {
      setHoldPercent(0);
    }
  }

  async function finishGps() {
    if (savingRef.current) return;

    if (!selectedPlayer?.id) {
      alert("Select a player first.");
      return;
    }

    if (
      targetKm &&
      distanceKm < targetKm
    ) {
      alert(
        `Keep going — you need ${(
          targetKm - distanceKm
        ).toFixed(2)} km more.`
      );

      return;
    }

    await logGpsEvent(
      "run_finished",
      {
        details: {
          elapsed_seconds: elapsed,
          final_distance_km:
            distanceKm,
          reconnect_count:
            reconnectCountRef.current,
        },
      }
    );

    stopTracking();
    setTracking(false);
    setShowConfirmFinish(false);

    savingRef.current = true;
    setSaving(true);

    const routePoints =
      pointsRef.current;

    const gpsDurationMin =
      routePoints.length >= 2
        ? Math.max(
          1,
          Math.round(
            (routePoints[
              routePoints.length - 1
            ].ts -
              routePoints[0].ts) /
            60000
          )
        )
        : Math.max(
          1,
          Math.round(elapsed / 60)
        );

    const gpsPace =
      paceFromSeconds(
        gpsDurationMin * 60,
        distanceKm
      );

    const saved = {
      type: "gps",
      source: "gps",
      runSessionId:
        runSessionIdRef.current,
      activityId: activity.id,
      playerId: selectedPlayer.id,
      title: activity.title,
      week: activityWeek,
      targetKm,
      distanceKm,
      durationMin: gpsDurationMin,
      pace: gpsPace,
      pointCount:
        routePoints.length,
      routePoints,
      savedAt:
        new Date().toISOString(),
      locked: true,
    };

    try {
      const savedResult =
        await onSaved(saved);

      setFinishedRun({
        ...saved,
        id:
          savedResult?.id ||
          savedResult?.runProofId ||
          savedResult?.proof?.id ||
          null,
      });

      showRunCompleteCelebration();
    } catch (error) {
      alert(
        error?.message ||
        "Could not save this run."
      );
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  async function discardGpsRun() {
    await logGpsEvent(
      "run_discarded",
      {
        details: {
          elapsed_seconds: elapsed,
          final_distance_km:
            distanceKm,
          reconnect_count:
            reconnectCountRef.current,
        },
      }
    );

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

    setGpsStatus(
      "Run discarded. Ready to start again."
    );
  }

  async function saveManual() {
    if (savingRef.current) return;

    if (!selectedPlayer?.id) {
      alert("Select a player first.");
      return;
    }

    const distance = Number(
      manualDistance
    );

    const minutes = manualMinutes
      ? Number(manualMinutes)
      : null;

    if (!distance || distance <= 0) {
      alert(
        "Enter the distance completed."
      );

      return;
    }

    savingRef.current = true;
    setSaving(true);

    const saved = {
      type: "manual",
      source: "manual",
      runSessionId:
        crypto.randomUUID(),
      activityId: activity.id,
      playerId: selectedPlayer.id,
      title: activity.title,
      week: activityWeek,
      targetKm,
      distanceKm: distance,
      durationMin: minutes || null,
      pace:
        distance > 0 && minutes
          ? paceFromSeconds(
            minutes * 60,
            distance
          )
          : null,
      pointCount: 0,
      savedAt:
        new Date().toISOString(),
      locked: false,
    };

    try {
      const savedResult =
        await onSaved(saved);

      setFinishedRun({
        ...saved,
        id:
          savedResult?.id ||
          savedResult?.runProofId ||
          savedResult?.proof?.id ||
          null,
      });

      showRunCompleteCelebration();
    } catch (error) {
      alert(
        error?.message ||
        "Could not save this manual run."
      );
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  async function saveImportedRun(importedActivity) {
  if (savingRef.current) return;

  if (!selectedPlayer?.id) {
    alert("Select a player first.");
    return;
  }

  if (typeof onSaved !== "function") {
    alert("Saving imported runs is not wired up.");
    return;
  }

  const distance = Number(importedActivity?.distanceKm);

  const minutes =
    importedActivity?.durationMin !== null &&
    importedActivity?.durationMin !== undefined &&
    importedActivity?.durationMin !== ""
      ? Number(importedActivity.durationMin)
      : null;

  if (!Number.isFinite(distance) || distance <= 0) {
    alert("A valid distance could not be read from this activity.");
    return;
  }

  if (
    minutes !== null &&
    (!Number.isFinite(minutes) || minutes <= 0)
  ) {
    alert("A valid duration could not be read from this activity.");
    return;
  }

  let activityDate = null;

  if (importedActivity?.activityDate) {
    const parsedDate = new Date(importedActivity.activityDate);

    if (!Number.isNaN(parsedDate.getTime())) {
      activityDate = parsedDate.toISOString();
    }
  }

  const importedAt = new Date().toISOString();

  const routePoints = Array.isArray(importedActivity?.routePoints)
    ? importedActivity.routePoints
    : [];

  const fileType = String(
    importedActivity?.fileType || ""
  ).toLowerCase();

  const saved = {
    type: "file_upload",
    source: "file_upload",

    activityType: "file_upload",
    completionType: "file_upload",
    runType: "file_upload",
    runSource: "file_upload",
    importSource: "file_upload",

    fileType: fileType || null,

    originalFilename:
      importedActivity?.originalFilename ||
      importedActivity?.fileName ||
      null,

    runSessionId:
      typeof crypto?.randomUUID === "function"
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`,

    activityId: activity.id,
    playerId: selectedPlayer.id,
    title: activity.title,
    week: activityWeek,
    targetKm,

    distanceKm: Number(distance.toFixed(2)),

    durationMin:
      minutes !== null
        ? Math.max(1, Math.round(minutes))
        : null,

    pace:
      distance > 0 && minutes !== null
        ? paceFromSeconds(minutes * 60, distance)
        : null,

    pointCount: Number(
      importedActivity?.pointCount ||
      routePoints.length ||
      0
    ),

    routePoints,

    activityDate,
    savedAt: importedAt,
    importedAt,

    locked: false,
  };

  savingRef.current = true;
  setSaving(true);

  try {
    const savedResult = await onSaved(saved);

    const proofId =
      savedResult?.runProofId ||
      savedResult?.proof?.id ||
      null;

    setFinishedRun({
      ...saved,

      id: proofId,
      runProofId: proofId,
      proofId,
      proof: savedResult?.proof || null,
    });

    showRunCompleteCelebration();
  } catch (error) {
    console.error("Imported run save failed", error);

    alert(
      error?.message ||
      "Could not import this run."
    );
  } finally {
    savingRef.current = false;
    setSaving(false);
  }
}

 async function removeFinishedRun() {
  if (!finishedRun) return;

  const runType = normaliseRunType(finishedRun, "");

  if (!["manual", "file_upload"].includes(runType)) {
    return;
  }

  if (typeof onDeleted !== "function") {
    alert("Remove run is not wired up yet.");
    return;
  }

  const proofId =
    finishedRun?.runProofId ||
    finishedRun?.proofId ||
    finishedRun?.proof?.id ||
    finishedRun?.id ||
    null;

  const activityId =
    finishedRun?.activityId ||
    finishedRun?.activity_id ||
    finishedRun?.task_key ||
    activity?.id ||
    null;

  const playerId =
    finishedRun?.playerId ||
    finishedRun?.player_id ||
    selectedPlayer?.id ||
    null;

  if (!activityId || !playerId) {
    alert("Could not identify the run to remove.");
    return;
  }

  setDeleting(true);

  try {
    await onDeleted({
      ...finishedRun,

      type: runType,
      source: runType,
      runType,
      runSource: runType,
      activityType: runType,
      completionType: runType,

      id: proofId,
      runProofId: proofId,
      proofId,

      activityId,
      playerId,
    });

    setFinishedRun(null);
    onClose?.();
  } catch (error) {
    console.error("Run removal failed", error);

    alert(
      error?.message ||
      "Could not remove this run."
    );
  } finally {
    setDeleting(false);
  }
}

  async function makeScreenshotFile() {
    if (!cardRef.current) {
      console.error("Run screenshot card is not available.");
      return null;
    }

    try {
      const blob = await htmlToImage.toBlob(cardRef.current, {
        cacheBust: true,
        pixelRatio: 2,
        backgroundColor: "#fffaf4",
      });

      if (!blob) {
        throw new Error("Screenshot creation returned no image.");
      }

      const safeName = String(
        finishedRun?.title || activity?.title || "challenge-run"
      )
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "") || "challenge-run";

      return new File(
        [blob],
        `${safeName}.png`,
        { type: "image/png" }
      );
    } catch (error) {
      console.error("Could not create run screenshot", error);
      alert("Could not create the run screenshot.");
      return null;
    }
  }

  async function shareScreenshot() {
    if (screenshotBusy) return;

    setScreenshotBusy(true);

    try {
      const file = await makeScreenshotFile();

      if (!file) return;

      if (
        typeof navigator.share === "function" &&
        navigator.canShare?.({ files: [file] })
      ) {
        await navigator.share({
          title: "Challenge Run",
          text: "My Summer Challenge run",
          files: [file],
        });
        return;
      }

      const url = URL.createObjectURL(file);
      const link = document.createElement("a");
      link.href = url;
      link.download = file.name;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      if (error?.name !== "AbortError") {
        console.error("Could not share run screenshot", error);
        alert("Could not share the run screenshot.");
      }
    } finally {
      setScreenshotBusy(false);
    }
  }

  async function saveScreenshot() {
    if (screenshotBusy) return;

    setScreenshotBusy(true);

    const file =
      await makeScreenshotFile();

    if (!file) {
      setScreenshotBusy(false);
      return;
    }

    try {
      if (
        navigator.canShare?.({
          files: [file],
        })
      ) {
        await navigator.share({
          title:
            "Save Run Screenshot",
          text:
            "Choose Save Image / Save to Photos if your phone shows that option.",
          files: [file],
        });

        return;
      }

      const url =
        URL.createObjectURL(file);

      const link =
        document.createElement("a");

      link.href = url;
      link.download = file.name;
      link.click();

      URL.revokeObjectURL(url);
    } finally {
      setScreenshotBusy(false);
    }
  }

  function getFinishedRunSourceLabel(run) {
    const runType = normaliseRunType(run);

    if (runType === "gps") {
      return "GPS verified";
    }

    if (runType === "file_upload") {
      const fileLabel =
        String(
          run?.fileType ||
          "fitness file"
        ).toUpperCase();

      return `Uploaded from ${fileLabel}`;
    }

    return "Manual entry";
  }

  if (finishedRun) {
    return (
      <div className="run-modal-backdrop">
        <div className="run-modal saved-run-modal">
          <button
            className="modal-close-button"
            onClick={onClose}
          >
            ×
          </button>

          <div className="saved-run-header">
            <h2>
              Great job, run complete!
            </h2>

            <p>
              {getFinishedRunSourceLabel(
                finishedRun
              )}
            </p>
          </div>

          <div className="saved-run-preview-shell">
            <div
              className="challenge-run-card"
              ref={cardRef}
            >
              <div className="challenge-run-card-top">
                <h1>
                  SUMMER FITNESS CHALLENGE
                </h1>

                <h2>RUN COMPLETE</h2>

                <p>
                  {normaliseRunType(finishedRun) ===
                    "gps"
                    ? "🏃 GPS VERIFIED"
                    : normaliseRunType(finishedRun) ===
                      "file_upload"
                      ? `📄 UPLOADED ${String(
                        finishedRun.fileType ||
                        "FILE"
                      ).toUpperCase()}`
                      : "📝 MANUAL ENTRY"}
                </p>
              </div>

              <div className="challenge-run-card-body">
                <h3>
                  {selectedPlayer.name}
                </h3>

                <p className="challenge-run-card-subtitle">
                  Week {activityWeek} ·{" "}
                  {activity.title} · Target{" "}
                  {targetKm ||
                    activity.target_value}
                  {activity.target_unit}
                </p>

                <p className="challenge-run-card-date">
                  {formatDateTime(
                    finishedRun.savedAt
                  )}
                </p>

                <div
                  className="challenge-run-card-map"
                  style={{
                    backgroundColor:
                      "#e8f6e9",
                    border:
                      "1px solid #d5ead7",
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
                      backgroundColor:
                        "#e8f6e9",
                    }}
                  />
                </div>

                <div className="challenge-run-card-stats">
                  <div>
                    <span>DISTANCE</span>

                    <strong>
                      {finishedRun.distanceKm.toFixed(
                        2
                      )}{" "}
                      km
                    </strong>
                  </div>

                  <div>
                    <span>TIME</span>

                    <strong>
                      {finishedRun.durationMin ||
                        "—"}{" "}
                      min
                    </strong>
                  </div>

                  <div>
                    <span>PACE</span>

                    <strong>
                      {finishedRun.pace ||
                        "—"}
                    </strong>
                  </div>
                </div>

                <div className="challenge-run-card-achieved">
                  🏅 TARGET ACHIEVED
                </div>

                <div className="challenge-run-card-footer">
                  <strong>
                    Summer Challenge 2026
                  </strong>

                  <span>
                    Route details stay private
                    on this device
                  </span>
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
              {screenshotBusy
                ? "Preparing…"
                : "📲 Share"}
            </button>

            <button
              className="button secondary saved-run-share-button"
              onClick={saveScreenshot}
              disabled={screenshotBusy}
            >
              {screenshotBusy
                ? "Preparing…"
                : "💾 Save Screenshot"}
            </button>
          </div>

          {["manual", "file_upload"].includes(
            normaliseRunType(finishedRun)
          ) ? (
            <button
              className="button secondary saved-run-delete-button"
              onClick={removeFinishedRun}
              disabled={deleting}
            >
              {deleting
                ? "Removing…"
                : normaliseRunType(finishedRun) ===
                  "file_upload"
                  ? "Remove Uploaded Run"
                  : "Remove Manual Run"}
            </button>
          ) : null}
        </div>

        {showSuccessConfetti ? (
          <div
            className="run-complete-celebration-shell"
            aria-hidden="true"
          >
            <div className="run-complete-celebration">
              <span>🏁</span>
              <strong>
                Run Complete!
              </strong>
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
        <button
          className="modal-close-button"
          onClick={requestClose}
        >
          ×
        </button>

        <div className="run-logger-header">
          <h2>RUN LOGGER</h2>

          <p>
            Week {activityWeek} ·{" "}
            {activity.title} · Target{" "}
            {targetKm ||
              activity.target_value}
            {activity.target_unit}
          </p>
        </div>

        <div className="run-safety-note">
          🚨 Safety first: run with an
          adult, choose a safe route, and
          avoid roads where possible.
        </div>

        <div className="run-mode-toggle">
          <button
            className={
              mode === "gps" ? "active" : ""
            }
            onClick={() => setMode("gps")}
            disabled={tracking}
          >
            GPS
          </button>

          <button
            className={
              mode === "manual"
                ? "active"
                : ""
            }
            onClick={() =>
              setMode("manual")
            }
            disabled={tracking}
          >
            Manual
          </button>
        </div>

        {mode === "gps" ? (
          <>
            <div className="run-stat-grid">
              <div>
                <strong>
                  {distanceKm.toFixed(2)}
                </strong>
                <span>km</span>
              </div>

              <div>
                <strong>
                  {formatTime(elapsed)}
                </strong>
                <span>time</span>
              </div>

              <div>
                <strong>{pace}</strong>
                <span>pace</span>
              </div>
            </div>

            <div className="run-map-live">
              <MapContainer
                center={
                  latestPoint
                    ? [
                      latestPoint.lat,
                      latestPoint.lng,
                    ]
                    : DEFAULT_CENTER
                }
                zoom={15}
                scrollWheelZoom={false}
                style={{
                  height: "100%",
                  width: "100%",
                  borderRadius: 16,
                }}
              >
                <MapAutoCenter
                  point={latestPoint}
                />

                <TileLayer
                  attribution="&copy; OpenStreetMap contributors"
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />

                {route.length > 1 ? (
                  <Polyline
                    positions={route}
                  />
                ) : null}

                {latestPoint ? (
                  <Marker
                    position={[
                      latestPoint.lat,
                      latestPoint.lng,
                    ]}
                  />
                ) : null}
              </MapContainer>
            </div>

            <p className="run-status">
              {gpsStatus}
            </p>

            {tracking && latestPoint ? (
              <div
                role="status"
                aria-live="polite"
                style={{
                  margin: "12px 0",
                  padding: "12px 14px",
                  borderRadius: 14,
                  border: "1px solid rgba(22, 163, 74, 0.35)",
                  background: "rgba(22, 163, 74, 0.10)",
                  fontWeight: 700,
                  lineHeight: 1.4,
                }}
              >
                🟢 GPS connected — you're ready to start running.
              </div>
            ) : null}

            {tracking ? (
              <div
                role="note"
                style={{
                  margin: "12px 0 16px",
                  padding: "14px 16px",
                  borderRadius: 14,
                  borderLeft: "5px solid #2563eb",
                  background: "rgba(37, 99, 235, 0.10)",
                  lineHeight: 1.45,
                }}
              >
                <strong
                  style={{
                    display: "block",
                    marginBottom: 5,
                    fontSize: "1rem",
                  }}
                >
                  📱 Keep this screen open
                </strong>
                <span style={{ display: "block" }}>
                  Your phone may pause GPS if you lock the screen or switch apps.
                </span>
                <strong
                  style={{
                    display: "block",
                    marginTop: 7,
                  }}
                >
                  For the best tracking, keep this page visible until you finish your run.
                </strong>
              </div>
            ) : null}

            {!tracking ? (
              <button
                className="button primary"
                onClick={
                  beginStartCountdown
                }
                disabled={Boolean(
                  countdownStep ||
                  showStartCoachNote
                )}
              >
                {showStartCoachNote
                  ? "Coach note first…"
                  : countdownStep
                    ? "Starting…"
                    : "▶ START GPS RUN"}
              </button>
            ) : (
              <div className="run-action-grid">
                <button
                  className="button secondary"
                  onClick={togglePause}
                >
                  {paused
                    ? "Resume"
                    : "Pause"}
                </button>

                <button
                  className="button primary hold-finish-button"
                  disabled={saving}
                  onPointerDown={
                    startHoldFinish
                  }
                  onPointerUp={() =>
                    cancelHoldFinish(true)
                  }
                  onPointerLeave={() =>
                    cancelHoldFinish(true)
                  }
                  onPointerCancel={() =>
                    cancelHoldFinish(true)
                  }
                  style={{
                    background: `linear-gradient(90deg, #7f1d1d ${holdPercent}%, #b91c1c ${holdPercent}%)`,
                    touchAction: "none",
                  }}
                >
                  {saving
                    ? "Saving…"
                    : holdPercent > 0
                      ? `Hold… ${holdPercent}%`
                      : "Hold to Finish"}
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="run-manual-panel">
            <h3 style={{ marginTop: 0 }}>
              Add Run Manually
            </h3>

            <p
              style={{
                margin:
                  "-4px 0 18px",
                color: "#765f65",
                fontSize: "0.92rem",
                lineHeight: 1.45,
              }}
            >
              The challenge distance is
              already filled in. Minutes are
              optional.
            </p>

            <label
              className="label"
              htmlFor="manual-run-distance"
            >
              Distance km
            </label>

            <input
              id="manual-run-distance"
              className="input"
              type="number"
              min="0.01"
              step="0.01"
              inputMode="decimal"
              value={manualDistance}
              onChange={(event) =>
                setManualDistance(
                  event.target.value
                )
              }
            />

            <label
              className="label"
              htmlFor="manual-run-minutes"
            >
              Minutes optional
            </label>

            <input
              id="manual-run-minutes"
              className="input"
              type="number"
              min="1"
              step="1"
              inputMode="numeric"
              value={manualMinutes}
              onChange={(event) =>
                setManualMinutes(
                  event.target.value
                )
              }
            />

            <button
              type="button"
              className="button primary"
              disabled={saving}
              onClick={saveManual}
            >
              {saving
                ? "Saving run…"
                : "Save Manual Run"}
            </button>

            <RunActivityImport
              existingRuns={existingRuns}
              saving={saving}
              onImport={saveImportedRun}
            />
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

              <p className="run-coach-note-water">
                💧 Have you had enough water
                today?
              </p>

              <small>
                GPS or manual will be ready in
                a few seconds…
              </small>
            </div>
          </div>
        ) : null}

        {countdownStep ? (
          <div
            className={`run-countdown-backdrop ${countdownStep === "GO!"
                ? "is-go"
                : ""
              }`}
          >
            {countdownStep === "GO!" ? (
              <div
                className="race-flag-sweep"
                aria-hidden="true"
              >
                🏁
              </div>
            ) : null}

            <div
              className={`run-countdown-light ${countdownStep
                .toLowerCase()
                .replace("!", "")}`}
            >
              <span>
                {countdownStep === "GO!"
                  ? "GO!"
                  : countdownStep}
              </span>

              {countdownStep === "GO!" ? (
                <em aria-hidden="true">
                  🏁
                </em>
              ) : null}
            </div>
          </div>
        ) : null}

        {showConfirmFinish ? (
          <div className="run-confirm-backdrop">
            <div className="run-confirm-modal">
              <h2>Finish this run?</h2>

              <p>
                Save{" "}
                {distanceKm.toFixed(2)} km
                for {selectedPlayer.name}?
              </p>

              <div className="run-action-grid">
                <button
                  className="button primary"
                  onClick={finishGps}
                >
                  Save Run
                </button>

                <button
                  className="button secondary"
                  onClick={() =>
                    setShowDiscardConfirm(
                      true
                    )
                  }
                >
                  Discard
                </button>
              </div>

              <button
                className="link-button"
                onClick={() => {
                  setShowConfirmFinish(
                    false
                  );

                  setShowDiscardConfirm(
                    false
                  );

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
              <h2>
                Discard this run?
              </h2>

              <p>
                This will delete the GPS route
                from this screen and it will
                not be saved.
              </p>

              <div className="run-action-grid">
                <button
                  className="button secondary"
                  onClick={() =>
                    setShowDiscardConfirm(
                      false
                    )
                  }
                >
                  No, Go Back
                </button>

                <button
                  className="button primary"
                  onClick={discardGpsRun}
                >
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