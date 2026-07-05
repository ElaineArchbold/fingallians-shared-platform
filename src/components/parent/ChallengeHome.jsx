import { useState } from "react";
import { useWeeklyActivities } from "../../hooks/useWeeklyActivities";
import SkillCardModal from "./SkillCardModal";
import RunProofModal from "./RunProofModal";
import MyBadgesModal from "./MyBadgesModal";

const CURRENT_WEEK = 1;

function isGirlsSquad(squadKey = "") {
  return squadKey.includes("girls");
}

function olderSquadUsesGps(squadKey = "") {
  return squadKey === "2014-boys" || squadKey === "2015-girls";
}

function isRunActivity(activity) {
  return (
    activity.gps_preferred ||
    activity.title.toLowerCase().includes("run") ||
    activity.target_unit === "km"
  );
}

function isBonusActivity(activity) {
  return activity.activity_key === "bonus";
}

function displaySquadText(text, squadKey) {
  const skill = squadKey.includes("girls") ? "Camogie" : "Hurling";

  return String(text || "")
    .replaceAll("Camogie", skill)
    .replaceAll("camogie", skill.toLowerCase())
    .replaceAll("Hurling", skill)
    .replaceAll("hurling", skill.toLowerCase());
}

function youtubeEmbedUrl(id) {
  return `https://www.youtube.com/embed/${id}`;
}

function initials(name = "") {
  return name
    .split(" ")
    .map(part => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function drillIntro(activity, camogieLabel) {
  const title = activity.title.toLowerCase();

  if (activity.activity_key === "running-technique") {
    if (title.includes("fall")) {
      return "Practise leaning forward, staying balanced and moving smoothly.";
    }

    if (title.includes("arm")) {
      return "Focus on strong arm drive to improve running rhythm.";
    }

    if (title.includes("skip")) {
      return "Work on posture, knee lift and quick light feet.";
    }

    return "Focus on good running posture and smooth acceleration.";
  }

  if (activity.activity_key === "football-skill") {
    return "Practise the football skill for 20 minutes and try to improve each attempt.";
  }

  if (activity.activity_key === "hurling-skill") {
    return `Practise the ${camogieLabel.toLowerCase()} skill for 20 minutes. Focus on good technique first.`;
  }

  return "Watch the video, then practise for 20 minutes.";
}

function completionFor(activityId, completions = []) {
  return completions.find(item => item.activity_id === activityId) || null;
}

function levelFromXp(xp) {
  return Math.max(1, Math.floor(Number(xp || 0) / 100) + 1);
}

export default function ChallengeHome({
  supabase,
  squadConfig,
  selectedPlayer,
  hasMultipleChildren = false,
  onSwitchChild,
  activeWeek = CURRENT_WEEK,
  onChangeWeek,
  savedRuns = [],
  completions = [],
  xpTotal = 0,
  badges = [],
  onStartRun,
  onDeleteManualRun,
  onToggleActivity,
  onSubmitApproval,
}) {
  const [toast, setToast] = useState("");
  const [showConfetti, setShowConfetti] = useState(false);
  const [squadOpen, setSquadOpen] = useState(false);
  const [openSkillCard, setOpenSkillCard] = useState(null);
  const [selectedRunProof, setSelectedRunProof] = useState(null);
  const [showBadges, setShowBadges] = useState(false);

  const safeWeek = Math.min(Number(activeWeek || CURRENT_WEEK), CURRENT_WEEK);

  const { activities, activitiesLoaded } = useWeeklyActivities(
    supabase,
    squadConfig.key,
    safeWeek
  );

  if (!activitiesLoaded) {
    return <div className="card">Loading weekly plan…</div>;
  }

  function showToast(message) {
    setToast(message);
    setTimeout(() => setToast(""), 3400);
  }

  function celebrate() {
    setShowConfetti(true);
    setTimeout(() => setShowConfetti(false), 1200);
  }

  async function toggleActivity(activity) {
    const existing = completionFor(activity.id, completions);
    const wasDone = Boolean(existing);

    if (typeof onToggleActivity === "function") {
      await onToggleActivity(activity, existing);
    }

    if (!wasDone) {
      celebrate();
    }
  }

  async function submitForApproval(activity, type) {
    if (typeof onSubmitApproval === "function") {
      await onSubmitApproval(activity, type);
    }

    if (type === "bonus") {
      showToast("We’ll check attendance with the coaches and award points once confirmed.");
    }

    if (type === "squad") {
      showToast("Ask a parent to submit photo/video proof of your squad session to be awarded the points.");
    }
  }

  function openRunLogger(activity) {
    if (typeof onStartRun === "function") {
      onStartRun(activity);
    }
  }

  const fitnessItems = activities
    .filter(a => a.activity_key === "fitness")
    .slice(0, 3);

  const speed = activities.find(a => a.activity_key === "running-technique");
  const football = activities.find(a => a.activity_key === "football-skill");
  const hurling = activities.find(a => a.activity_key === "hurling-skill");
  const squadSession = activities.find(a => a.activity_key === "squad-session");
  const bonus = activities.find(a => a.activity_key === "bonus");

  const camogieLabel = isGirlsSquad(squadConfig.key) ? "Camogie" : "Hurling";

  const missionActivities = activities.filter(activity => !isBonusActivity(activity));

  const approvedCount = missionActivities.filter(activity => {
    const completion = completionFor(activity.id, completions);
    return completion?.status === "completed";
  }).length;

  const awaitingCount = missionActivities.filter(activity => {
    const completion = completionFor(activity.id, completions);
    return completion?.status === "awaiting_approval";
  }).length;

  const completedCount = approvedCount + awaitingCount;
  const totalMissions = missionActivities.length || 1;

  const approvedPercent = Math.min(
    100,
    Math.round((approvedCount / totalMissions) * 100)
  );

  const pendingPercent = Math.min(
    100,
    Math.round(((approvedCount + awaitingCount) / totalMissions) * 100)
  );

  const progressPercent = approvedPercent;

  const currentWeekRuns = savedRuns.filter(run => Number(run.week || 1) === safeWeek);
  const dayStreak = Math.min(5, Math.max(0, completedCount));

  const squadCompletion = squadSession
    ? completionFor(squadSession.id, completions)
    : null;

  const bonusCompletion = bonus
    ? completionFor(bonus.id, completions)
    : null;

  const squadPending = squadCompletion?.status === "awaiting_approval";
  const bonusPending = bonusCompletion?.status === "awaiting_approval";

  return (
    <div className="challenge-page">
      {showConfetti && <div className="confetti-pop">🎉</div>}
      {toast ? <div className="app-toast">{toast}</div> : null}

      <section className="player-card">
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
            <div style={{ width: `${Math.min(100, xpTotal % 100)}%` }} />
          </div>

          <small>
            Level {levelFromXp(xpTotal)} · {xpTotal} XP · {badges.length} badges
          </small>
        </div>

        <div className="player-rank">
          <strong>{progressPercent}%</strong>
          <span>complete</span>
        </div>
      </section>

      <button className="my-badges-button" onClick={() => setShowBadges(true)}>
        <span>🏅</span>
        <strong>My Badges</strong>
        <small>{badges.length} earned</small>
      </button>

      <section className="week-nav-card">
        <button
          disabled={safeWeek <= 1}
          onClick={() => onChangeWeek?.(safeWeek - 1)}
        >
          ‹
        </button>

        <div>
          <strong>Week {safeWeek}</strong>
          <span>{safeWeek === CURRENT_WEEK ? "Current week" : "Previous week"}</span>
        </div>

        <button
          disabled={safeWeek >= CURRENT_WEEK}
          onClick={() => onChangeWeek?.(safeWeek + 1)}
        >
          ›
        </button>
      </section>

      <section className="card mission-summary-card">
        <div className="mission-snapshot-card">
          <h2 className="mission-snapshot-title">This Week (Week {safeWeek})</h2>

          <div className="mission-snapshot-main">
            <div
              className="mission-progress-ring"
              style={{
                "--approved": `${approvedPercent}%`,
                "--pending": `${pendingPercent}%`,
              }}
            >
              <div className="mission-progress-ring-inner">
                <strong>{progressPercent}%</strong>
                <span>
                  {approvedCount} / {totalMissions}
                  <br />
                  approved
                </span>
              </div>
            </div>

            <div className="mission-snapshot-stats">
              <div className="mission-snapshot-stat">
                <span className="stat-icon">⚡</span>
                <div>
                  <strong>{xpTotal}</strong>
                  <span>XP Earned</span>
                </div>
              </div>

              <div className="mission-snapshot-stat">
                <span className="stat-icon">🔥</span>
                <div>
                  <strong>{dayStreak}</strong>
                  <span>Day Streak</span>
                </div>
              </div>

              <div className="mission-snapshot-stat">
                <span className="stat-icon">🏃</span>
                <div>
                  <strong>{currentWeekRuns.length}</strong>
                  <span>Runs Saved</span>
                </div>
              </div>
            </div>
          </div>

          <p className="mission-snapshot-foot">
            {awaitingCount
              ? `${awaitingCount} mission${awaitingCount === 1 ? "" : "s"} awaiting approval and shown in amber. `
              : ""}
            Friday Night Hurling is a bonus and does not affect 100%.
          </p>
        </div>
      </section>

      <section className="weekly-section fitness-section">
        <h2>🔥 Weekly Fitness Challenge</h2>
        <p className="muted">Complete all three challenges this week.</p>

        <div className="fitness-pill-grid">
          {fitnessItems.map(item => {
            const savedRun = savedRuns.find(run => run.task_key === item.id);
            const completion = completionFor(item.id, completions);
            const done = Boolean(completion) || Boolean(savedRun);
            const run = isRunActivity(item);
            const useGps = run && olderSquadUsesGps(squadConfig.key);

            return (
              <button
                key={item.id}
                className={`fitness-pill ${done ? "is-complete" : ""}`}
                onClick={() => {
                  if (savedRun) {
                    setSelectedRunProof(savedRun);
                    return;
                  }

                  if (useGps) {
                    openRunLogger(item);
                    return;
                  }

                  toggleActivity(item);
                }}
              >
                <span>
                  {done
                    ? "✅"
                    : run
                      ? "🏃"
                      : item.title.toLowerCase().includes("solo")
                        ? "🏑"
                        : "⭐"}
                </span>

                <strong>{displaySquadText(item.title, squadConfig.key)}</strong>

                <small>
                  {savedRun
                    ? "View Run"
                    : useGps
                      ? "Open GPS"
                      : done
                        ? "Completed"
                        : `${item.target_value} ${item.target_unit}`}
                </small>
              </button>
            );
          })}
        </div>
      </section>

      <section className="weekly-section drills-section">
        <h2>🎥 Skill Challenges</h2>
        <p className="muted">Watch each video before practising.</p>

        <div className="drill-grid">
          {[speed, football, hurling].filter(Boolean).map(item => {
            const completion = completionFor(item.id, completions);
            const done = Boolean(completion);

            const icon =
              item.activity_key === "running-technique"
                ? "🏃"
                : item.activity_key === "football-skill"
                  ? "⚽"
                  : "🏑";

            return (
              <div className="drill-card" key={item.id}>
                <div className="challenge-card-header">
                  <div className="challenge-icon">{icon}</div>

                  <div>
                    <span>
                      {item.activity_key === "hurling-skill"
                        ? `${camogieLabel} Skill`
                        : item.section}
                    </span>

                    <h3>{displaySquadText(item.title, squadConfig.key)}</h3>
                  </div>
                </div>

                {item.youtube_id && (
                  <div className="video-frame">
                    <iframe
                      src={youtubeEmbedUrl(item.youtube_id)}
                      title={item.title}
                      allowFullScreen
                    />
                  </div>
                )}

                {item.skill_card_path ? (
                  <button
                    className="button secondary drill-card-link"
                    onClick={() =>
                      setOpenSkillCard({
                        title: item.skill_card_title || item.title,
                        pdf: item.skill_card_path,
                      })
                    }
                  >
                    📖 Learn the Skill
                  </button>
                ) : null}

                <p className="drill-note">{drillIntro(item, camogieLabel)}</p>

                <button
                  className={`button secondary drill-complete-button ${
                    done ? "is-complete" : ""
                  }`}
                  onClick={() => toggleActivity(item)}
                >
                  {done ? "Completed ✓" : "Mark Complete"}
                </button>
              </div>
            );
          })}
        </div>
      </section>

      {squadSession && (
        <section className="squad-session-card">
          <button
            className="squad-session-toggle"
            onClick={() => setSquadOpen(!squadOpen)}
          >
            <div>
              <span className="bonus-label">Team Mission</span>
              <h2 style={{ fontSize: 26 }}>🤝 Squad Session</h2>
              <p style={{ fontSize: 15, fontWeight: 700 }}>
                {squadPending
                  ? "Awaiting coach approval."
                  : "Get together with 3–4 teammates and practise this week's drills."}
              </p>
            </div>

            <strong>{squadOpen ? "⌃" : "⌄"}</strong>
          </button>

          <div className="squad-session-body">
            <button
              className="button primary"
              disabled={squadPending}
              onClick={() => submitForApproval(squadSession, "squad")}
            >
              {squadPending ? "Awaiting Approval" : "Submit for Approval"}
            </button>
          </div>

          {squadOpen && (
            <div className="squad-session-body">
              <div className="squad-session-instructions">
                <p>Get 3–4 teammates together.</p>

                <ol>
                  <li>🏃 5 mins Speed Mechanics.</li>
                  <li>🏑 {camogieLabel} relay challenge.</li>
                  <li>⚽ Football solo relay.</li>
                </ol>

                <p>
                  🏅 Ask a parent to post a photo or video in WhatsApp. Your
                  coach will approve the points.
                </p>
              </div>

              <div className="small-video-grid">
                {[speed, football, hurling].filter(Boolean).map(item => (
                  <div className="small-video-card" key={item.id}>
                    <strong>{displaySquadText(item.title, squadConfig.key)}</strong>

                    {item.youtube_id && (
                      <div className="video-frame small">
                        <iframe
                          src={youtubeEmbedUrl(item.youtube_id)}
                          title={item.title}
                          allowFullScreen
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {bonus && (
        <section className="bonus-card">
          <span className="bonus-label">Bonus Mission</span>

          <h2>⭐ Friday Night Hurling</h2>

          <p>
            {bonusPending
              ? "Awaiting coach approval."
              : "Submit your attendance for coach approval."}
          </p>

          <button
            className="button secondary"
            disabled={bonusPending}
            onClick={() => submitForApproval(bonus, "bonus")}
          >
            {bonusPending ? "Awaiting Approval" : "Submit Attendance"}
          </button>
        </section>
      )}

      {showBadges ? (
        <MyBadgesModal badges={badges} onClose={() => setShowBadges(false)} />
      ) : null}

      {openSkillCard ? (
        <SkillCardModal
          title={openSkillCard.title}
          pdf={openSkillCard.pdf}
          onClose={() => setOpenSkillCard(null)}
        />
      ) : null}

      {selectedRunProof ? (
        <RunProofModal
          run={selectedRunProof}
          selectedPlayer={selectedPlayer}
          onClose={() => setSelectedRunProof(null)}
          onDeleted={async run => {
            if (typeof onDeleteManualRun === "function") {
              await onDeleteManualRun(run);
            }

            setSelectedRunProof(null);
          }}
        />
      ) : null}
    </div>
  );
}
