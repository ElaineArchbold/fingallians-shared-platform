function num(value) {
  return Number(value || 0);
}

function initials(name = "") {
  return String(name)
    .trim()
    .split(/\s+/)
    .map(part => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function isRunActivity(activity) {
  const title = String(activity?.title || "").toLowerCase();

  return (
    activity?.gps_preferred ||
    activity?.target_unit === "km" ||
    title.includes("run")
  );
}

function isApprovalActivity(activity) {
  return (
    activity?.activity_key === "squad-session" ||
    activity?.activity_key === "bonus"
  );
}

function activityIcon(activity) {
  if (isRunActivity(activity)) return "🏃";
  if (activity?.activity_key === "running-technique") return "🏃‍♂️";
  if (activity?.activity_key === "football-skill") return "⚽";
  if (activity?.activity_key === "hurling-skill") return "🏑";
  if (activity?.activity_key === "squad-session") return "🤝";
  if (activity?.activity_key === "bonus") return "⭐";
  if (activity?.activity_key === "recovery") return "🧘";
  return "🎯";
}

function completionFor(activityId, completions = []) {
  return completions.find(row => row.activity_id === activityId) || null;
}

function runFor(activityId, runs = []) {
  return (
    runs.find(
      row => String(row.task_key || row.activity_id) === String(activityId)
    ) || null
  );
}

function approvalLabel(activity) {
  if (activity?.activity_key === "bonus") return "Friday Night Hurling";
  return "Squad Session";
}

export default function CoachPlayerView({
  player,
  squadLabel,
  week,
  currentWeek,
  activities = [],
  completions = [],
  runs = [],
  xpTotal = 0,
  badges = [],
  onChangeWeek,
  onAddRun,
  onToggleActivity,
  onRemoveActivity,
  onApproveActivity,
}) {
  const cappedCurrentWeek = Math.min(
    8,
    Math.max(1, Number(currentWeek || 1))
  );

  const safeWeek = Math.min(
    8,
    Math.max(1, Number(week || cappedCurrentWeek))
  );

  const isFutureWeek = safeWeek > cappedCurrentWeek;

  const weekActivities = activities
    .filter(activity => {
      const activityWeek = Number(activity.week_number || 1);

      return (
        activityWeek >= 1 &&
        activityWeek <= 8 &&
        activityWeek === safeWeek
      );
    })
    .sort((a, b) => {
      const order = {
        fitness: 10,
        "running-technique": 20,
        "football-skill": 30,
        "hurling-skill": 40,
        recovery: 45,
        "squad-session": 50,
        bonus: 60,
      };

      return (
        (order[a.activity_key] || 70) -
          (order[b.activity_key] || 70) ||
        Number(a.sort_order || 0) - Number(b.sort_order || 0) ||
        String(a.title || "").localeCompare(String(b.title || ""))
      );
    });

  const completedThisWeek = weekActivities.filter(activity => {
    const completion = completionFor(activity.id, completions);
    return completion?.status === "completed";
  }).length;

  const progressPercent = weekActivities.length
    ? Math.round((completedThisWeek / weekActivities.length) * 100)
    : 0;

  return (
    <div className="coach-player-view">
      <section className="coach-player-hero">
        <div className="coach-player-avatar">{initials(player.name)}</div>

        <div>
          <h2>{player.name}</h2>
          <p>{squadLabel}</p>

          <div className="coach-player-xp-track">
            <div style={{ width: `${Math.min(100, xpTotal % 100)}%` }} />
          </div>

          <small>{xpTotal} XP · {badges.length} badges</small>
        </div>

        <strong>{progressPercent}%</strong>
      </section>

      <section className="coach-week-nav">
        <button
          type="button"
          disabled={safeWeek <= 1}
          onClick={() => onChangeWeek?.(Math.max(1, safeWeek - 1))}
        >
          ‹
        </button>

        <div>
          <strong>Week {safeWeek}</strong>
          <span>
            {safeWeek === cappedCurrentWeek ? "Current week" : "Coach view"}
          </span>
        </div>

        <button
          type="button"
          disabled={safeWeek >= 8}
          onClick={() => onChangeWeek?.(Math.min(8, safeWeek + 1))}
        >
          ›
        </button>
      </section>

      {isFutureWeek ? (
        <section className="coach-future-lock-card">
          <strong>🔒 Week {safeWeek} is locked for now</strong>
          <span>
            You can preview it, but you cannot add or remove completions
            until the week starts.
          </span>
        </section>
      ) : null}

      <section className="coach-activity-panel">
        <div className="coach-panel-title">
          <h3>Coach Actions</h3>
          <p>
            Use Add, Approve or Complete to award points. Use Remove to
            undo anything.
          </p>
        </div>

        <div className="coach-action-list">
          {weekActivities.map(activity => {
            const completion = completionFor(activity.id, completions);
            const savedRun = runFor(activity.id, runs);
            const isCompleted = completion?.status === "completed";
            const isPending = completion?.status === "awaiting_approval";
            const isRun = isRunActivity(activity);
            const needsApproval = isApprovalActivity(activity);
            const hasAnything = Boolean(completion || savedRun);

            return (
              <article
                className={
                  isCompleted
                    ? "coach-action-card completed"
                    : isPending
                      ? "coach-action-card pending"
                      : "coach-action-card"
                }
                key={activity.id}
              >
                <div className="coach-action-main">
                  <span>{activityIcon(activity)}</span>

                  <div>
                    <strong>
                      {needsApproval
                        ? approvalLabel(activity)
                        : activity.title}
                    </strong>

                    <small>
                      {savedRun
                        ? `${num(savedRun.distance_km).toFixed(2)} km saved`
                        : isCompleted
                          ? "Completed"
                          : isPending
                            ? "Awaiting approval"
                            : activity.target_value
                              ? `${activity.target_value} ${activity.target_unit || ""}`
                              : "Not completed"}
                    </small>
                  </div>
                </div>

                <div className="coach-action-buttons">
                  {isRun ? (
                    <button
                      type="button"
                      className="button primary"
                      disabled={isFutureWeek || hasAnything}
                      onClick={() => onAddRun?.(activity)}
                    >
                      Add Run
                    </button>
                  ) : needsApproval ? (
                    <button
                      type="button"
                      className="button primary"
                      disabled={isFutureWeek || isCompleted}
                      onClick={() => onApproveActivity?.(activity, completion)}
                    >
                      Approve
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="button primary"
                      disabled={isFutureWeek || isCompleted}
                      onClick={() => onToggleActivity?.(activity, completion)}
                    >
                      Mark Complete
                    </button>
                  )}

                  <button
                    type="button"
                    className="button secondary danger-button"
                    disabled={isFutureWeek || !hasAnything}
                    onClick={() => onRemoveActivity?.(activity)}
                  >
                    Remove
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
