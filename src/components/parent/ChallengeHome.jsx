import { useState } from "react";
import { useWeeklyActivities } from "../../hooks/useWeeklyActivities";
import { getCurrentChallengeWeek } from "../../lib/challengeWeeks";
import SkillCardModal from "./SkillCardModal";
import RunProofModal from "./RunProofModal";
import MyBadgesModal from "./MyBadgesModal";


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


const RECOVERY_STRETCHES = {
  1: {
    title: "Standing Quad Stretch",
    how: "Stand on one leg, hold your ankle behind you and gently pull your heel towards your bottom. Keep your knees together.",
    stretches: "Front of thighs (quadriceps)",
  },
  2: {
    title: "Hamstring Stretch",
    how: "Sit with one leg straight and the other foot tucked in. Reach towards your toes while keeping your back straight.",
    stretches: "Back of thighs (hamstrings)",
  },
  3: {
    title: "Calf Stretch",
    how: "Place your hands against a wall, step one foot back and press the heel into the ground while bending the front knee.",
    stretches: "Calves",
  },
  4: {
    title: "Butterfly Stretch",
    how: "Sit with the soles of your feet together and gently let your knees fall towards the floor. Sit up tall.",
    stretches: "Groin and inner thighs",
  },
  5: {
    title: "Figure 4 Glute Stretch",
    how: "Lie on your back, cross one ankle over the opposite knee and gently pull the supporting leg towards your chest.",
    stretches: "Glutes and hips",
  },
  6: {
    title: "Hip Flexor Lunge Stretch",
    how: "Step into a lunge with one knee on the ground. Keep your chest up and gently push your hips forward.",
    stretches: "Front of hips",
  },
  7: {
    title: "Child's Pose",
    how: "Kneel on the floor, sit back on your heels and stretch your arms out in front while lowering your chest.",
    stretches: "Back, shoulders and hips",
  },
  8: {
    title: "Shoulder & Chest Stretch",
    how: "Clasp your hands behind your back, straighten your arms and gently lift them while opening your chest.",
    stretches: "Chest and shoulders",
  },
};

function recoveryStretchForWeek(week) {
  return RECOVERY_STRETCHES[Number(week)] || RECOVERY_STRETCHES[1];
}

export default function ChallengeHome({
  supabase,
  squadConfig,
  selectedPlayer,
  hasMultipleChildren = false,
  onSwitchChild,
  activeWeek = getCurrentChallengeWeek(),
  currentWeek = getCurrentChallengeWeek(),
  lockFutureWeeks = false,
  showLockedWeekToast = false,
  onChangeWeek,
  savedRuns = [],
  completions = [],
  xpTotal = 0,
  badges = [],
  onStartRun,
  onDeleteManualRun,
  onToggleActivity,
  onSubmitApproval,
  adminManualRuns = false,
  isCoachMode = false,
  onCoachRemoveRun,
  onCoachApprove,
  onCoachUnapprove,
}) {
  const [toast, setToast] = useState("");
  const [showConfetti, setShowConfetti] = useState(false);
  const [completionBurst, setCompletionBurst] = useState(null);
  const [squadOpen, setSquadOpen] = useState(false);
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [recoveryVideoOpen, setRecoveryVideoOpen] = useState(false);
  const [recoveryVideoStartedById, setRecoveryVideoStartedById] = useState({});
  const [openSkillCard, setOpenSkillCard] = useState(null);
  const [selectedRunProof, setSelectedRunProof] = useState(null);
  const [showBadges, setShowBadges] = useState(false);

  const safeWeek = lockFutureWeeks
    ? Math.min(Number(activeWeek || currentWeek), currentWeek)
    : Math.max(1, Number(activeWeek || currentWeek));

  const nextWeekLocked = lockFutureWeeks && safeWeek >= currentWeek;
  const isFutureWeek = safeWeek > currentWeek;

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

  function celebrate(activity, options = {}) {
    const isRecovery = activity?.activity_key === "recovery";
    const isWeekComplete = Boolean(options.isWeekComplete);
    const isChallengeComplete = Boolean(options.isChallengeComplete);

    const burst = isChallengeComplete
      ? { icon: "🎉", title: "Challenge Complete!", subtitle: "Amazing effort all summer." }
      : isWeekComplete
        ? { icon: "🏆", title: "Week Complete!", subtitle: `Week ${safeWeek} finished.` }
        : isRecovery
          ? { icon: "🩵", title: "Recovered!", subtitle: "Great job listening to your body." }
          : { icon: "👏", title: "Great Job!", subtitle: "Activity complete." };

    setCompletionBurst(burst);
    setShowConfetti(true);

    setTimeout(() => setShowConfetti(false), isWeekComplete || isChallengeComplete ? 1800 : 1300);
    setTimeout(() => setCompletionBurst(null), isWeekComplete || isChallengeComplete ? 2100 : 1600);
  }

  async function toggleActivity(activity) {
    if (isFutureWeek) {
      showToast(`Week ${safeWeek} is locked for now.`);
      return;
    }

    const existing = completionFor(activity.id, completions);
    const wasDone = Boolean(existing);

    if (typeof onToggleActivity === "function") {
      await onToggleActivity(activity, existing);
    }

    if (!wasDone) {
      const nextCompletedCount = Math.min(totalMissions, completedCount + 1);
      const isWeekComplete = nextCompletedCount >= totalMissions;
      const isChallengeComplete = isWeekComplete && Number(safeWeek) >= 8;

      celebrate(activity, { isWeekComplete, isChallengeComplete });
    }
  }

  async function submitForApproval(activity, type) {
    if (isFutureWeek) {
      showToast(`Week ${safeWeek} is locked for now.`);
      return;
    }

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

  function runForActivity(activity) {
    if (!activity) return null;

    return savedRuns.find(run => {
      const sameTask = String(run.task_key || "") === String(activity.id || "");
      const sameWeek = Number(run.week || safeWeek) === Number(safeWeek);
      const sameTitle =
        String(run.label || "").toLowerCase().trim() ===
        String(activity.title || "").toLowerCase().trim();

      return sameTask || (sameWeek && sameTitle);
    });
  }

  function markRecoveryVideoStarted(activityId) {
    setRecoveryVideoStartedById(previous => ({
      ...previous,
      [activityId]: true,
    }));
  }

  const fitnessItems = activities
    .filter(a => a.activity_key === "fitness")
    .slice(0, 3);

  const speed = activities.find(a => a.activity_key === "running-technique");
  const football = activities.find(a => a.activity_key === "football-skill");
  const hurling = activities.find(a => a.activity_key === "hurling-skill");
  const squadSession = activities.find(a => a.activity_key === "squad-session");
  const bonus = activities.find(a => a.activity_key === "bonus");
  const recoveryItems = activities.filter(a => a.activity_key === "recovery");
  const recoveryItem = recoveryItems[0] || null;

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
  const squadApproved = squadCompletion?.status === "completed";
  const bonusApproved = bonusCompletion?.status === "completed";

  return (
    <div className="challenge-page">
      {showConfetti && <div className="confetti-pop">🎉</div>}
      {completionBurst ? (
        <div className="completion-burst" aria-hidden="true">
          <span>{completionBurst.icon}</span>
          <strong>{completionBurst.title}</strong>
          <small>{completionBurst.subtitle}</small>
        </div>
      ) : null}
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

      <button className="my-badges-button badge-feature-card" onClick={() => setShowBadges(true)}>
        <span className="badge-feature-icon">🏅</span>
        <div>
          <strong>{badges.length} Badge{badges.length === 1 ? "" : "s"} Earned</strong>
          <small>View your collection</small>
        </div>
        <em>›</em>
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
          <span>{safeWeek === currentWeek ? "Current week" : `Week ${safeWeek}`}</span>
        </div>

        <button
          disabled={nextWeekLocked && !showLockedWeekToast}
          className={nextWeekLocked ? "week-nav-disabled" : ""}
          onClick={() => {
            if (nextWeekLocked) {
              showToast("🔒 Week not available yet. Check back next week!");
              return;
            }

            onChangeWeek?.(safeWeek + 1);
          }}
        >
          ›
        </button>
      </section>

      {isFutureWeek ? (
        <section className="future-week-lock-card">
          <strong>🔒 Week {safeWeek} is locked for now</strong>
          <span>You can preview the plan, but activities can only be completed once the week starts.</span>
        </section>
      ) : null}

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

          {awaitingCount ? (
            <p className="mission-snapshot-foot">
              {awaitingCount} mission{awaitingCount === 1 ? "" : "s"} awaiting coach approval.
            </p>
          ) : null}
        </div>
      </section>

      <section className="weekly-section fitness-section">
        <h2>🔥 Weekly Fitness Challenge</h2>
        <p className="muted">Complete all three challenges this week.</p>

        <div className="fitness-pill-grid">
          {fitnessItems.map(item => {
            const savedRun = runForActivity(item);
            const completion = completionFor(item.id, completions);
            const done = Boolean(completion) || Boolean(savedRun);
            const run = isRunActivity(item);
            const useGps = run && olderSquadUsesGps(squadConfig.key);

            return (
              <button
                key={item.id}
                className={`fitness-pill ${done ? "is-complete" : ""}`}
                onClick={() => {
                  if (isFutureWeek) {
                    showToast(`Week ${safeWeek} is locked for now.`);
                    return;
                  }

                  if (savedRun) {
                    if (isCoachMode && typeof onCoachRemoveRun === "function") {
                      onCoachRemoveRun(savedRun);
                      return;
                    }

                    setSelectedRunProof(savedRun);
                    return;
                  }

                  if (run && adminManualRuns) {
                    openRunLogger(item);
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
                {squadApproved
                  ? "Approved by coach."
                  : squadPending
                    ? "Awaiting coach approval."
                    : "Get together with 3–4 teammates and practise this week's drills."}
              </p>
            </div>

            <strong>{squadOpen ? "⌃" : "⌄"}</strong>
          </button>

          <div className="squad-session-body">
            {isCoachMode ? (
              <div className="coach-approval-actions">
                <button
                  type="button"
                  className="button primary"
                  disabled={isFutureWeek || squadApproved}
                  onClick={() =>
                    squadCompletion
                      ? onCoachApprove?.(squadCompletion)
                      : submitForApproval(squadSession, "squad")
                  }
                >
                  {squadApproved ? "Approved" : "Approve"}
                </button>

                <button
                  type="button"
                  className="button secondary danger-button"
                  disabled={isFutureWeek || !squadApproved}
                  onClick={() => onCoachUnapprove?.(squadCompletion)}
                >
                  Unapprove
                </button>
              </div>
            ) : (
              <button
                className="button primary"
                disabled={isFutureWeek || squadPending || squadApproved}
                onClick={() => submitForApproval(squadSession, "squad")}
              >
                {squadApproved
                  ? "Approved"
                  : squadPending
                    ? "Awaiting Approval"
                    : "Submit for Approval"}
              </button>
            )}
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

                    {item.skill_card_path ? (
                      <button
                        className="button secondary squad-skill-card-link"
                        onClick={() =>
                          setOpenSkillCard({
                            title: item.skill_card_title || item.title,
                            pdf: item.skill_card_path,
                          })
                        }
                      >
                        📖 Skill Card
                      </button>
                    ) : null}
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
            {bonusApproved
              ? "Approved by coach."
              : bonusPending
                ? "Awaiting coach approval."
                : "Submit your attendance for coach approval."}
          </p>

          {isCoachMode ? (
            <div className="coach-approval-actions">
              <button
                type="button"
                className="button primary"
                disabled={isFutureWeek || bonusApproved}
                onClick={() =>
                  bonusCompletion
                    ? onCoachApprove?.(bonusCompletion)
                    : submitForApproval(bonus, "bonus")
                }
              >
                {bonusApproved ? "Approved" : "Approve"}
              </button>

              <button
                type="button"
                className="button secondary danger-button"
                disabled={isFutureWeek || !bonusApproved}
                onClick={() => onCoachUnapprove?.(bonusCompletion)}
              >
                Unapprove
              </button>
            </div>
          ) : (
            <button
              className="button secondary"
              disabled={isFutureWeek || bonusPending || bonusApproved}
              onClick={() => submitForApproval(bonus, "bonus")}
            >
              {bonusApproved
                ? "Approved"
                : bonusPending
                  ? "Awaiting Approval"
                  : "Submit Attendance"}
            </button>
          )}
        </section>
      )}


      {recoveryItems.length ? (
        <section className="recovery-session-card">
          {recoveryItems.slice(0, 1).map(item => {
            const done = completionFor(item.id, completions)?.status === "completed";
            const videoId = item.youtube_id;
            const hasStartedRecoveryVideo = Boolean(recoveryVideoStartedById[item.id]);
            const canCompleteRecovery = done || (recoveryOpen && (!videoId || hasStartedRecoveryVideo));
            const safetyTip =
              item.description ||
              "Only do what your body can do. Never push too far. If something hurts, stop and tell an adult.";

            const stretch = recoveryStretchForWeek(safeWeek);

            return (
              <div key={item.id}>
                <button
                  className="recovery-session-toggle"
                  type="button"
                  onClick={() => setRecoveryOpen(previous => !previous)}
                >
                  <div>
                    <span className="recovery-label">Rest & Recovery</span>
                    <h2>🩵 Recover Like a Champion</h2>
                    <p>
                      {done
                        ? "Recovery complete. Great job listening to your body."
                        : "Cool down, stretch gently, and help your body feel ready for next time."}
                    </p>
                  </div>

                  <strong className="recovery-chevron">{recoveryOpen ? "⌃" : "⌄"}</strong>
                </button>

                {recoveryOpen ? (
                  <div className="recovery-session-body">
                    <div className="recovery-media-grid">
                      <div className="recovery-video-column">
                        <div className="recovery-subheading">
                          <span>🎥</span>
                          <strong>Stretches</strong>
                          <small>{item.target_value ? `${item.target_value} ${item.target_unit || "mins"}` : "Follow the video"}</small>
                        </div>

                        {videoId ? (
                          <div className="recovery-video-card">
                            {!recoveryVideoOpen ? (
                              <button
                                className="recovery-video-cover"
                                type="button"
                                onClick={() => {
                                  setRecoveryVideoOpen(true);
                                  markRecoveryVideoStarted(item.id);
                                }}
                              >
                                <img
                                  src={`https://img.youtube.com/vi/${videoId}/hqdefault.jpg`}
                                  alt={`${item.title} video thumbnail`}
                                />

                                <span className="recovery-play-button">▶</span>
                              </button>
                            ) : (
                              <div className="video-frame recovery-video-frame">
                                <iframe
                                  src={youtubeEmbedUrl(videoId)}
                                  title={item.title}
                                  allowFullScreen
                                />
                              </div>
                            )}
                          </div>
                        ) : null}
                      </div>

                      <div className="recovery-stretches-panel">
                        <div className="recovery-subheading">
                          <span>🧘</span>
                          <strong>Weekly Stretch</strong>
                        </div>

                        <div className="recovery-stretch-box">
                          <h3>{stretch.title}</h3>
                          <p>
                            You can do this any day, especially after running,
                            training or matches.
                          </p>

                          <div className="stretch-instruction-group">
                            <strong>How to do it</strong>
                            <span>{stretch.how}</span>
                          </div>

                          <div className="stretch-instruction-group">
                            <strong>What it stretches</strong>
                            <span>{stretch.stretches}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {!done && videoId && !hasStartedRecoveryVideo ? (
                      <p className="recovery-video-required-note">
                        ▶ Start the stretch video first, then you can mark Recovery complete.
                      </p>
                    ) : null}

                    <p className="recovery-safety-line">
                      <strong>Champion Safety Tip:</strong> {safetyTip}
                    </p>
                  </div>
                ) : null}

                <div className="recovery-session-footer">
                  <button
                    className={`button recovery-complete-button ${done ? "is-complete" : ""}`}
                    disabled={isFutureWeek || !canCompleteRecovery}
                    onClick={() => {
                      if (!canCompleteRecovery) {
                        showToast("Start the Recovery video first, then you can complete it.");
                        return;
                      }

                      toggleActivity(item);
                    }}
                    type="button"
                  >
                    {done ? "Recovered ✓" : canCompleteRecovery ? "Complete Recovery" : "Watch Video First"}
                    <span>+{item.points || 1} XP</span>
                  </button>
                </div>
              </div>
            );
          })}
        </section>
      ) : null}

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
