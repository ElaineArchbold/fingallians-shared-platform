import { useMemo, useState } from "react";
import { getSquadWhatsAppLink } from "../../lib/squadLinks";
import SkillCardModal from "./SkillCardModal";

const CURRENT_WEEK = 1;

const BADGE_PREVIEW = [
  { badge_key: "first_mission", badge_label: "First Mission", icon: "⭐" },
  { badge_key: "first_run", badge_label: "First Run", icon: "🏃" },
  { badge_key: "first_gps_run", badge_label: "GPS Verified", icon: "📍" },
  { badge_key: "first_skill", badge_label: "First Skill", icon: "🎯" },
  { badge_key: "first_week", badge_label: "First Week", icon: "✅" },
  { badge_key: "perfect_week", badge_label: "Perfect Week", icon: "💯" },
  { badge_key: "hundred_xp", badge_label: "100 XP Club", icon: "⚡" },
  { badge_key: "two_fifty_xp", badge_label: "250 XP Club", icon: "⚡" },
  { badge_key: "five_hundred_xp", badge_label: "500 XP Club", icon: "⚡" },
  { badge_key: "training_machine", badge_label: "Training Machine", icon: "💪" },
  { badge_key: "solo_master", badge_label: "Solo Master", icon: "🏐" },
  { badge_key: "football_ace", badge_label: "Football Ace", icon: "⚽" },
  { badge_key: "hurling_hero", badge_label: "Hurling Hero", icon: "🏑" },
  { badge_key: "camogie_star", badge_label: "Camogie Star", icon: "🏑" },
  { badge_key: "squad_captain", badge_label: "Squad Captain", icon: "🤝" },
  { badge_key: "friday_regular", badge_label: "Friday Regular", icon: "🌟" },
  { badge_key: "bronze_summer", badge_label: "Bronze Summer", icon: "🥉" },
  { badge_key: "silver_summer", badge_label: "Silver Summer", icon: "🥈" },
  { badge_key: "gold_summer", badge_label: "Gold Summer", icon: "🥇" },
  { badge_key: "summer_champion", badge_label: "Summer Champion", icon: "🏆" },
];

function initials(name = "") {
  return name
    .split(" ")
    .map(part => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function levelFromXp(xp) {
  return Math.max(1, Math.floor(Number(xp || 0) / 100) + 1);
}

function xpIntoLevel(xp) {
  return Number(xp || 0) % 100;
}

function completionFor(activityId, completions = []) {
  return completions.find(item => item.activity_id === activityId) || null;
}

function missionIcon(activity) {
  if (activity.activity_key === "fitness") return "🔥";
  if (activity.activity_key === "running-technique") return "🏃";
  if (activity.activity_key === "football-skill") return "⚽";
  if (activity.activity_key === "hurling-skill") return "🏑";
  if (activity.activity_key === "squad-session") return "🤝";
  if (activity.activity_key === "bonus") return "⭐";
  return "✅";
}

function missionStatus(activity, completions, selectedWeek) {
  if (selectedWeek > CURRENT_WEEK) return "locked";

  const completion = completionFor(activity.id, completions);

  if (!completion) return "not_started";
  if (completion.status === "awaiting_approval") return "awaiting_approval";
  return "completed";
}

function statusLabel(status) {
  if (status === "completed") return "Complete";
  if (status === "awaiting_approval") return "Awaiting approval";
  if (status === "locked") return "Preview";
  return "Not started";
}

function isBonusActivity(activity) {
  return activity.activity_key === "bonus";
}

function isRunActivity(activity) {
  return (
    activity.gps_preferred ||
    activity.title?.toLowerCase().includes("run") ||
    activity.target_unit === "km"
  );
}

function youtubeEmbedUrl(id) {
  return `https://www.youtube.com/embed/${id}`;
}


function isApprovedCompletion(activityId, completions = []) {
  const completion = completionFor(activityId, completions);
  return completion?.status === "completed";
}

function sumRunTargets(activities = []) {
  return activities
    .filter(activity => isRunActivity(activity))
    .reduce((total, activity) => total + Number(activity.target_value || 0), 0);
}

function progressPercent(value, target) {
  if (!target) return 0;
  return Math.min(100, Math.round((Number(value || 0) / Number(target || 1)) * 100));
}

function minutesForSkill(activities, completions, skillKey, includeSquadSessions = true) {
  const drillMinutes = activities
    .filter(activity => activity.activity_key === skillKey)
    .filter(activity => isApprovedCompletion(activity.id, completions))
    .length * 20;

  const squadMinutes = includeSquadSessions
    ? activities
        .filter(activity => activity.activity_key === "squad-session")
        .filter(activity => isApprovedCompletion(activity.id, completions))
        .length * 20
    : 0;

  return drillMinutes + squadMinutes;
}

function targetMinutesForSkill(activities, skillKey, includeSquadSessions = true) {
  const drillMinutes =
    activities.filter(activity => activity.activity_key === skillKey).length * 20;

  const squadMinutes = includeSquadSessions
    ? activities.filter(activity => activity.activity_key === "squad-session").length * 20
    : 0;

  return drillMinutes + squadMinutes;
}

export default function ProgressHome({
  squadConfig,
  selectedPlayer,
  hasMultipleChildren = false,
  onSwitchChild,
  activities = [],
  completions = [],
  savedRuns = [],
  xpTotal = 0,
  xpTransactions = [],
  badges = [],
  onOpenWeek,
}) {
  const [activeTab, setActiveTab] = useState("journey");
  const [selectedWeek, setSelectedWeek] = useState(CURRENT_WEEK);
  const [previewWeek, setPreviewWeek] = useState(null);
  const [openSkillCard, setOpenSkillCard] = useState(null);

  const whatsappLink = getSquadWhatsAppLink(squadConfig.key);

  const weekNumbers = useMemo(() => {
    return [...new Set((activities || []).map(activity => activity.week_number))]
      .filter(Boolean)
      .sort((a, b) => a - b);
  }, [activities]);

  const level = levelFromXp(xpTotal);
  const xpProgress = xpIntoLevel(xpTotal);

  const selectedWeekActivities = activities.filter(
    activity => activity.week_number === selectedWeek
  );

  const previewWeekActivities = previewWeek
    ? activities.filter(activity => activity.week_number === previewWeek)
    : [];

  const previewRuns = previewWeekActivities
    .filter(activity => activity.activity_key === "fitness" && isRunActivity(activity))
    .slice(0, 3);

  const previewDrills = previewWeekActivities.filter(activity =>
    ["running-technique", "football-skill", "hurling-skill"].includes(
      activity.activity_key
    )
  );

  const coreWeekActivities = selectedWeekActivities.filter(
    activity => !isBonusActivity(activity)
  );

  const approvedCount = coreWeekActivities.filter(activity => {
    const status = missionStatus(activity, completions, selectedWeek);
    return status === "completed";
  }).length;

  const awaitingCount = coreWeekActivities.filter(activity => {
    const status = missionStatus(activity, completions, selectedWeek);
    return status === "awaiting_approval";
  }).length;

  const completedCount = approvedCount + awaitingCount;
  const totalMissions = coreWeekActivities.length || 1;

  const approvedPercent =
    selectedWeek > CURRENT_WEEK
      ? 0
      : Math.round((approvedCount / totalMissions) * 100);

  const pendingPercent =
    selectedWeek > CURRENT_WEEK
      ? 0
      : Math.round(((approvedCount + awaitingCount) / totalMissions) * 100);

  const weekPercent = approvedPercent;

  const selectedWeekRuns = savedRuns.filter(
    run => Number(run.week || 1) === Number(selectedWeek)
  );

  const approvedCompletions = completions.filter(
    completion => completion.status === "completed"
  );

  const distanceRanKm = savedRuns.reduce(
    (total, run) => total + Number(run.distance_km || 0),
    0
  );

  const distanceTargetKm = sumRunTargets(activities);

  const speedMinutes = minutesForSkill(
    activities,
    approvedCompletions,
    "running-technique"
  );

  const footballMinutes = minutesForSkill(
    activities,
    approvedCompletions,
    "football-skill"
  );

  const hurlingMinutes = minutesForSkill(
    activities,
    approvedCompletions,
    "hurling-skill"
  );

  const speedTargetMinutes = targetMinutesForSkill(
    activities,
    "running-technique"
  );

  const footballTargetMinutes = targetMinutesForSkill(
    activities,
    "football-skill"
  );

  const hurlingTargetMinutes = targetMinutesForSkill(
    activities,
    "hurling-skill"
  );

  const recentActivities = completions.slice(0, 5);

  function xpForCompletion(completion) {
    const tx = xpTransactions.find(item => item.activity_id === completion.activity_id);
    return Number(tx?.xp || 0);
  }

  function earnedBadge(key) {
    return badges.some(badge => badge.badge_key === key);
  }

  function handleWeekClick(week) {
    if (week > CURRENT_WEEK) {
      setPreviewWeek(week);
      return;
    }

    setSelectedWeek(week);

    if (typeof onOpenWeek === "function") {
      onOpenWeek(week);
    }
  }

  return (
    <div className="page progress-home">
      <section className="player-card progress-player-card">
        <div className="player-avatar">{initials(selectedPlayer.name)}</div>

        <div className="player-card-main">
          <div className="settings-player-title-row">
            <h2>{selectedPlayer.name}</h2>

            {hasMultipleChildren ? (
              <button
                className="child-name-switch"
                onClick={onSwitchChild}
                aria-label="Switch child"
              >
                ⌄
              </button>
            ) : null}
          </div>

          <p>{squadConfig.shortLabel}</p>

          <div className="player-xp-bar">
            <div style={{ width: `${xpProgress}%` }} />
          </div>

          <small>
            Level {level} · {xpTotal} XP · {badges.length} badges
          </small>
        </div>

        <div className="player-rank">
          <strong>{weekPercent}%</strong>
          <span>week {selectedWeek}</span>
        </div>
      </section>

      <section className="parent-journey-shell">
        <div className="parent-journey-tabs">
          <button
            className={activeTab === "journey" ? "active" : ""}
            onClick={() => setActiveTab("journey")}
          >
            Journey
          </button>

          <button
            className={activeTab === "plan" ? "active" : ""}
            onClick={() => setActiveTab("plan")}
          >
            Plan
          </button>

          <button
            className={activeTab === "achievements" ? "active" : ""}
            onClick={() => setActiveTab("achievements")}
          >
            Achievements
          </button>
        </div>

        {activeTab === "journey" ? (
          <div className="parent-journey-panel">
            <div className="parent-progress-card">
              <h2>Level Progress</h2>

              <div className="level-progress-head">
                <strong>LEVEL {level}</strong>
                <span>{xpTotal} total XP</span>
              </div>

              <div className="level-track">
                <div
                  className="level-fill"
                  style={{ width: `${xpProgress}%` }}
                />
              </div>
            </div>

            <div className="parent-progress-card journey-totals-card">
              <h2>Summer Totals</h2>
              <p className="muted">
                Approved activity only. Squad sessions add 20 minutes to speed,
                football and hurling practice.
              </p>

              <div className="journey-total-list">
                <div className="journey-total-row">
                  <div className="journey-total-head">
                    <span>🏃</span>
                    <strong>Distance ran</strong>
                    <em>{distanceRanKm.toFixed(2)} km</em>
                  </div>

                  <div className="journey-total-track">
                    <div
                      style={{
                        width: `${progressPercent(distanceRanKm, distanceTargetKm)}%`,
                      }}
                    />
                  </div>

                  <small>
                    Challenge target: {distanceTargetKm.toFixed(2)} km
                  </small>
                </div>

                <div className="journey-total-row">
                  <div className="journey-total-head">
                    <span>🏃‍♂️</span>
                    <strong>Speed practice</strong>
                    <em>{speedMinutes} mins</em>
                  </div>

                  <div className="journey-total-track">
                    <div
                      style={{
                        width: `${progressPercent(speedMinutes, speedTargetMinutes)}%`,
                      }}
                    />
                  </div>

                  <small>
                    Challenge target: {speedTargetMinutes} mins
                  </small>
                </div>

                <div className="journey-total-row">
                  <div className="journey-total-head">
                    <span>⚽</span>
                    <strong>Football practice</strong>
                    <em>{footballMinutes} mins</em>
                  </div>

                  <div className="journey-total-track">
                    <div
                      style={{
                        width: `${progressPercent(footballMinutes, footballTargetMinutes)}%`,
                      }}
                    />
                  </div>

                  <small>
                    Challenge target: {footballTargetMinutes} mins
                  </small>
                </div>

                <div className="journey-total-row">
                  <div className="journey-total-head">
                    <span>🏑</span>
                    <strong>Hurling/Camogie practice</strong>
                    <em>{hurlingMinutes} mins</em>
                  </div>

                  <div className="journey-total-track">
                    <div
                      style={{
                        width: `${progressPercent(hurlingMinutes, hurlingTargetMinutes)}%`,
                      }}
                    />
                  </div>

                  <small>
                    Challenge target: {hurlingTargetMinutes} mins
                  </small>
                </div>
              </div>
            </div>

            <div className="parent-progress-card">
              <h2>Mission Path</h2>

              <div className="mission-path">
                {selectedWeekActivities.map(activity => {
                  const status = missionStatus(activity, completions, selectedWeek);
                  const bonus = isBonusActivity(activity);

                  return (
                    <div
                      key={activity.id}
                      className={`mission-path-row ${status}`}
                    >
                      <div className="mission-path-node">
                        <span>{bonus ? "⭐" : missionIcon(activity)}</span>
                      </div>

                      <div className="mission-path-card">
                        <div>
                          <strong>{activity.title}</strong>
                          <small>
                            {bonus
                              ? "Bonus mission"
                              : activity.section || `Week ${activity.week_number}`}
                          </small>
                        </div>

                        <span className="mission-status-pill">
                          {bonus && status !== "completed" && status !== "awaiting_approval"
                            ? "Bonus"
                            : statusLabel(status)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="parent-progress-card">
              <h2>Recent Activity</h2>

              <div className="recent-activity-list">
                {recentActivities.length ? (
                  recentActivities.map(item => {
                    const activity = activities.find(a => a.id === item.activity_id);

                    return (
                      <div className="recent-activity-row" key={item.id}>
                        <span className="activity-icon">
                          {activity ? missionIcon(activity) : "✅"}
                        </span>

                        <div>
                          <strong>{activity?.title || item.completion_type}</strong>
                          <small>
                            {item.status === "awaiting_approval"
                              ? "Awaiting approval"
                              : "Completed"}
                          </small>
                        </div>

                        <span className="activity-xp">
                          +{xpForCompletion(item)} XP
                        </span>
                      </div>
                    );
                  })
                ) : (
                  <p className="muted">No activity yet.</p>
                )}
              </div>
            </div>
          </div>
        ) : null}

        {activeTab === "plan" ? (
          <div className="parent-journey-panel">
            {whatsappLink ? (
              <a
                className="whatsapp-card-button"
                href={whatsappLink}
                target="_blank"
                rel="noreferrer"
              >
                <h2>💬 Squad WhatsApp</h2>
                <p>Use the squad group for reminders, proof posts and coach updates.</p>
                <strong>Open WhatsApp Group</strong>
              </a>
            ) : null}

            <div className="parent-progress-card">
              <h2>Summer Plan</h2>
              <p className="muted">
                Parents can preview future weeks. Current and previous weeks open on
                the home page.
              </p>

              <div className="plan-week-grid">
                {weekNumbers.map(week => {
                  const future = week > CURRENT_WEEK;

                  return (
                    <button
                      key={week}
                      className={
                        week === selectedWeek
                          ? "plan-week-button active"
                          : "plan-week-button"
                      }
                      onClick={() => handleWeekClick(week)}
                    >
                      <span>Week {week}</span>
                      <strong>
                        {future ? "Preview" : week < CURRENT_WEEK ? "Open" : "Open"}
                      </strong>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="parent-progress-card">
              <h2>Week {selectedWeek} Activities</h2>

              <div className="mission-path">
                {selectedWeekActivities.map(activity => {
                  const status = missionStatus(activity, completions, selectedWeek);
                  const bonus = isBonusActivity(activity);

                  return (
                    <div
                      key={activity.id}
                      className={`mission-path-row ${status}`}
                    >
                      <div className="mission-path-node">
                        <span>{bonus ? "⭐" : missionIcon(activity)}</span>
                      </div>

                      <div className="mission-path-card">
                        <div>
                          <strong>{activity.title}</strong>
                          <small>
                            {bonus
                              ? "Bonus mission"
                              : activity.section || `Week ${activity.week_number}`}
                          </small>
                        </div>

                        <span className="mission-status-pill">
                          {bonus ? "Bonus" : statusLabel(status)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="parent-progress-card">
              <h2>Saved Runs</h2>

              {selectedWeekRuns.length ? (
                <div className="recent-activity-list">
                  {selectedWeekRuns.map(run => (
                    <div className="recent-activity-row" key={run.id}>
                      <span className="activity-icon">🏃</span>

                      <div>
                        <strong>{run.label || "Run"}</strong>
                        <small>{Number(run.distance_km || 0).toFixed(2)} km</small>
                      </div>

                      <span className="activity-xp">
                        {run.run_type === "gps" ? "GPS" : "Manual"}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="muted">No saved runs for this week yet.</p>
              )}
            </div>
          </div>
        ) : null}

        {activeTab === "achievements" ? (
          <div className="parent-journey-panel">
            <div className="parent-progress-card achievement-section">
              <h2>Earned Badges</h2>

              {badges.length ? (
                <div className="badge-grid">
                  {badges.map(badge => (
                    <div className="badge-card" key={badge.id}>
                      <span>🏅</span>
                      <strong>{badge.badge_label}</strong>
                      <small>Earned</small>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="muted">Complete your first mission to earn a badge.</p>
              )}
            </div>

            <div className="parent-progress-card achievement-section">
              <h2>Badge Goals</h2>

              <div className="badge-grid">
                {BADGE_PREVIEW.map(badge => (
                  <div
                    className={earnedBadge(badge.badge_key) ? "badge-card" : "badge-card locked"}
                    key={badge.badge_key}
                  >
                    <span>{badge.icon}</span>
                    <strong>{badge.badge_label}</strong>
                    <small>{earnedBadge(badge.badge_key) ? "Earned" : "Locked"}</small>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : null}
      </section>

      {previewWeek ? (
        <div className="week-preview-backdrop" onClick={() => setPreviewWeek(null)}>
          <div className="week-preview-modal" onClick={event => event.stopPropagation()}>
            <button className="week-preview-close" onClick={() => setPreviewWeek(null)}>
              ×
            </button>

            <div className="week-preview-header">
              <h2>Week {previewWeek} Preview</h2>
              <p>
                Future week preview for parents. Only runs and drills are shown here.
              </p>
            </div>

            <div className="week-preview-content">
              <section className="preview-section">
                <h3>🏃 Runs</h3>
                <p className="muted">Preview the running targets for this week.</p>

                {previewRuns.length ? (
                  <div className="preview-run-grid">
                    {previewRuns.map(run => (
                      <div className="preview-run-pill" key={run.id}>
                        <div>
                          <span>🏃</span>
                          <strong>{run.title}</strong>
                          <small>{run.target_value} {run.target_unit}</small>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="muted">No run activities found for this week.</p>
                )}
              </section>

              <section className="preview-section">
                <h3>🎥 Drills</h3>
                <p className="muted">Watch the videos and open skill cards before the week starts.</p>

                {previewDrills.length ? (
                  <div className="preview-drill-grid">
                    {previewDrills.map(drill => (
                      <div className="preview-drill-card" key={drill.id}>
                        <h4>{drill.title}</h4>

                        {drill.youtube_id ? (
                          <div className="video-frame">
                            <iframe
                              src={youtubeEmbedUrl(drill.youtube_id)}
                              title={drill.title}
                              allowFullScreen
                            />
                          </div>
                        ) : null}

                        {drill.skill_card_path ? (
                          <button
                            className="button secondary preview-skill-card-button"
                            onClick={() =>
                              setOpenSkillCard({
                                title: drill.skill_card_title || drill.title,
                                pdf: drill.skill_card_path,
                              })
                            }
                          >
                            📖 Open Skill Card
                          </button>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="muted">No drills found for this week.</p>
                )}
              </section>
            </div>
          </div>
        </div>
      ) : null}

      {openSkillCard ? (
        <SkillCardModal
          title={openSkillCard.title}
          pdf={openSkillCard.pdf}
          onClose={() => setOpenSkillCard(null)}
        />
      ) : null}
    </div>
  );
}
