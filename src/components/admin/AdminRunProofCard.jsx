import { useRef } from "react";
import * as htmlToImage from "html-to-image";

function paceText(run) {
  if (!run?.pace_min_per_km) return "—";

  const pace = Number(run.pace_min_per_km);
  const mins = Math.floor(pace);
  const secs = Math.round((pace % 1) * 60);

  return `${mins}:${String(secs).padStart(2, "0")} /km`;
}

function formatDateTime(value) {
  if (!value) return "—";

  return new Date(value).toLocaleString("en-IE", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function routePath(points = []) {
  if (!points.length) return "";

  const valid = points
    .map(point => ({
      lat: Number(point.lat),
      lng: Number(point.lng),
    }))
    .filter(point => Number.isFinite(point.lat) && Number.isFinite(point.lng));

  if (valid.length < 2) return "";

  const minLat = Math.min(...valid.map(point => point.lat));
  const maxLat = Math.max(...valid.map(point => point.lat));
  const minLng = Math.min(...valid.map(point => point.lng));
  const maxLng = Math.max(...valid.map(point => point.lng));

  const latRange = maxLat - minLat || 0.001;
  const lngRange = maxLng - minLng || 0.001;

  return valid
    .map((point, index) => {
      const x = 40 + ((point.lng - minLng) / lngRange) * 420;
      const y = 300 - ((point.lat - minLat) / latRange) * 260;
      return `${index === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
}

export default function AdminRunProofCard({ run }) {
  const cardRef = useRef(null);
  const points = Array.isArray(run?.route_points) ? run.route_points : [];
  const path = routePath(points);
  const isGps = run?.run_type === "gps";

  async function downloadCard() {
    if (!cardRef.current) return;

    const blob = await htmlToImage.toBlob(cardRef.current, {
      cacheBust: true,
      pixelRatio: 2,
      backgroundColor: "#fffaf4",
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${run?.player_name || "run"}-${run?.label || "run"}.png`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="admin-run-proof-card">
      <div className="challenge-run-card" ref={cardRef}>
        <div className="challenge-run-card-top">
          <h1>SUMMER FITNESS CHALLENGE</h1>
          <h2>RUN COMPLETE</h2>
          <p>{isGps ? "🏃 GPS VERIFIED" : "📝 MANUAL ENTRY"}</p>
        </div>

        <div className="challenge-run-card-body">
          <h3>{run?.player_name || "Player"}</h3>
          <p className="challenge-run-card-subtitle">
            Week {run?.week || 1} · {run?.label || "Run"} · Target {run?.target || "—"}
          </p>
          <p className="challenge-run-card-date">{formatDateTime(run?.saved_at)}</p>

          <div className="challenge-run-card-map">
            <svg viewBox="0 0 500 340" preserveAspectRatio="none">
              <rect className="route-card-bg" width="500" height="340" />
              <g className="route-card-grid">
                <path d="M0 68 H500 M0 136 H500 M0 204 H500 M0 272 H500" />
                <path d="M100 0 V340 M200 0 V340 M300 0 V340 M400 0 V340" />
              </g>

              {isGps && path ? (
                <>
                  <path className="route-card-line" d={path} />
                  <text className="route-card-finish" x="438" y="188">🏁</text>
                </>
              ) : (
                <>
                  <text className="route-card-manual-icon" x="250" y="150">📝</text>
                  <text className="route-card-manual-title" x="250" y="196">
                    {isGps ? "GPS route not stored" : "Manual run entry"}
                  </text>
                  <text className="route-card-manual-subtitle" x="250" y="224">
                    {isGps ? "Older run proof" : "No GPS route recorded"}
                  </text>
                </>
              )}
            </svg>
          </div>

          <div className="challenge-run-card-stats">
            <div>
              <span>DISTANCE</span>
              <strong>{Number(run?.distance_km || 0).toFixed(2)} km</strong>
            </div>
            <div>
              <span>TIME</span>
              <strong>{run?.duration_min || "—"} min</strong>
            </div>
            <div>
              <span>PACE</span>
              <strong>{paceText(run)}</strong>
            </div>
          </div>

          <div className="challenge-run-card-achieved">🏅 TARGET ACHIEVED</div>

          <div className="challenge-run-card-footer">
            <strong>Summer Challenge 2026</strong>
            <span>Route details stay private in the club admin app</span>
          </div>
        </div>
      </div>

      <button className="button primary" type="button" onClick={downloadCard}>
        Download Share Card
      </button>
    </div>
  );
}
