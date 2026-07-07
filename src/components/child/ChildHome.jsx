import { useEffect, useMemo, useState } from "react";
import ChallengeHome from "../parent/ChallengeHome";
import RunLoggerModal from "../parent/RunLoggerModal";
import { useAllWeeklyActivities } from "../../hooks/useWeeklyActivities";
import { playCompleteDing } from "../../lib/sounds";

const CURRENT_WEEK = 1;

function getPlayerInitials(name = "") {
  return name
    .split(" ")
    .map(part => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function groupWeeks(activities) {
  return [...new Set((activities || []).map(a => a.week_number))].sort(
    (a, b) => a - b
  );
}

function xpForActivity(activity, completionType = "activity") {
  const title = String(activity?.title || "").toLowerCase();
  const isRun =
    activity?.gps_preferred ||
    activity?.target_unit === "km" ||
    title.includes("run");

  if (isRun || completionType === "gps" || completionType === "manual") return 3;

  if (
    activity?.activity_key === "running-technique" ||
    activity?.activity_key === "football-skill" ||
    activity?.activity_key === "hurling-skill" ||
    activity?.activity_key === "camogie-skill"
  ) {
    return 2;
  }

  if (activity?.activity_key === "fitness") return 2;
  if (activity?.activity_key === "squad-session") return 4;
  if (activity?.activity_key === "bonus") return 4;
  if (activity?.activity_key === "recovery") return 1;

  return 1;
}

function levelFromXp(xp) {
  return Math.max(1, Math.floor(Number(xp || 0) / 100) + 1);
}

export default function ChildHome({
  supabase,
  squadConfig,
  players,
  selectedPlayerId,
  onSelectPlayer,
  parentView,
  onChangeParentView,
  onSignOut,
}) {
  const [availablePlayers, setAvailablePlayers] = useState([]);
  const [loadingAvailable, setLoadingAvailable] = useState(false);
  const [linking, setLinking] = useState(false);
  const [localPlayers, setLocalPlayers] = useState(players || []);
  const [selectedWeek, setSelectedWeek] = useState(CURRENT_WEEK);
  const [runActivity, setRunActivity] = useState(null);
  const [savedRuns, setSavedRuns] = useState([]);
  const [completions, setCompletions] = useState([]);
  const [xpTotal, setXpTotal] = useState(0);
  const [badges, setBadges] = useState([]);
  const [squadRank, setSquadRank] = useState(null);

  const { weeks } = useAllWeeklyActivities(supabase, squadConfig.key);

  const weekNumbers = useMemo(() => groupWeeks(weeks), [weeks]);

  const selectedPlayer =
    localPlayers.find(p => p.id === selectedPlayerId) || null;

  useEffect(() => {
    setLocalPlayers(players || []);
  }, [players]);

  useEffect(() => {
    if (!localPlayers.length) return;

    const savedPlayerId = localStorage.getItem("selectedPlayerId");
    const savedPlayer = localPlayers.find(p => p.id === savedPlayerId);

    if (savedPlayer && !selectedPlayerId) {
      selectPlayer(savedPlayer.id);
      return;
    }

    if (localPlayers.length === 1 && !selectedPlayerId) {
      selectPlayer(localPlayers[0].id);
    }
  }, [localPlayers, selectedPlayerId]);

  useEffect(() => {
    async function loadAvailablePlayers() {
      if (localPlayers.length || !squadConfig?.key) return;

      setLoadingAvailable(true);

      const { data, error } = await supabase
        .from("players")
        .select("id,name,squad,squad_key,child_access_token")
        .eq("squad_key", squadConfig.key)
        .order("name");

      if (error) {
        console.error(error);
        setAvailablePlayers([]);
      } else {
        setAvailablePlayers(data || []);
      }

      setLoadingAvailable(false);
    }

    loadAvailablePlayers();
  }, [supabase, squadConfig?.key, localPlayers.length]);

  useEffect(() => {
    if (!selectedPlayer?.id) return;

    refreshPlayerData(selectedPlayer.id);
  }, [selectedPlayer?.id, squadConfig.key]);

  async function refreshPlayerData(playerId) {
    const playerForRank =
      selectedPlayer?.id === playerId
        ? selectedPlayer
        : localPlayers.find(player => player.id === playerId);

    await Promise.all([
      loadSavedRuns(playerId),
      loadCompletions(playerId),
      loadXp(playerId),
      loadBadges(playerId),
      loadSquadRank(playerForRank),
    ]);
  }

  async function loadSavedRuns(playerId) {
    const { data, error } = await supabase
      .from("run_proofs")
      .select("*")
      .eq("player_id", playerId)
      .eq("squad_key", squadConfig.key)
      .order("saved_at", { ascending: false });

    if (error) {
      console.error(error);
      setSavedRuns([]);
      return;
    }

    setSavedRuns(data || []);
  }

  async function loadCompletions(playerId) {
    const { data, error } = await supabase
      .from("activity_completions")
      .select("*")
      .eq("player_id", playerId)
      .order("completed_at", { ascending: false });

    if (error) {
      console.error(error);
      setCompletions([]);
      return;
    }

    setCompletions(data || []);
  }

  async function loadXp(playerId) {
    const { data, error } = await supabase
      .from("xp_transactions")
      .select("xp")
      .eq("player_id", playerId);

    if (error) {
      console.error(error);
      setXpTotal(0);
      return;
    }

    setXpTotal((data || []).reduce((total, row) => total + Number(row.xp || 0), 0));
  }

  async function loadSquadRank(player) {
    if (!player?.id || !player?.squad_key) {
      setSquadRank(null);
      return;
    }

    const { data: squadPlayers, error: playerError } = await supabase
      .from("players")
      .select("id,name,squad_key")
      .eq("squad_key", player.squad_key);

    if (playerError) {
      console.error(playerError);
      setSquadRank(null);
      return;
    }

    const ids = (squadPlayers || []).map(item => item.id);

    if (!ids.length) {
      setSquadRank(null);
      return;
    }

    const { data: xpRows, error: xpError } = await supabase
      .from("xp_transactions")
      .select("player_id,xp")
      .in("player_id", ids);

    if (xpError) {
      console.error(xpError);
      setSquadRank(null);
      return;
    }

    const totals = new Map(ids.map(id => [id, 0]));

    (xpRows || []).forEach(row => {
      totals.set(row.player_id, (totals.get(row.player_id) || 0) + Number(row.xp || 0));
    });

    const ranked = (squadPlayers || [])
      .map(item => ({
        ...item,
        xp: totals.get(item.id) || 0,
      }))
      .sort((a, b) => b.xp - a.xp || a.name.localeCompare(b.name));

    const index = ranked.findIndex(item => item.id === player.id);

    setSquadRank(
      index >= 0
        ? {
            position: index + 1,
            total: ranked.length,
            xp: ranked[index].xp,
          }
        : null
    );
  }

  async function loadBadges(playerId) {
    const { data, error } = await supabase
      .from("player_badges")
      .select("*")
      .eq("player_id", playerId)
      .order("earned_at", { ascending: false });

    if (error) {
      console.error(error);
      setBadges([]);
      return;
    }

    setBadges(data || []);
  }

  async function maybeAwardBadges(playerId) {
    const { data: completionRows } = await supabase
      .from("activity_completions")
      .select("id,status")
      .eq("player_id", playerId);

    const { data: runRows } = await supabase
      .from("run_proofs")
      .select("id,run_type")
      .eq("player_id", playerId);

    const totalCompleted = (completionRows || []).filter(
      row => row.status === "completed" || row.status === "awaiting_approval"
    ).length;

    const totalRuns = (runRows || []).length;

    const badgeInserts = [];

    if (totalCompleted >= 1) {
      badgeInserts.push({
        player_id: playerId,
        badge_key: "first_mission",
        badge_label: "First Mission",
      });
    }

    if (totalRuns >= 1) {
      badgeInserts.push({
        player_id: playerId,
        badge_key: "first_run",
        badge_label: "First Run",
      });
    }

    if (totalCompleted >= 5) {
      badgeInserts.push({
        player_id: playerId,
        badge_key: "five_missions",
        badge_label: "Five Missions",
      });
    }

    if (totalRuns >= 3) {
      badgeInserts.push({
        player_id: playerId,
        badge_key: "three_runs",
        badge_label: "Three Runs",
      });
    }

    if (!badgeInserts.length) return;

    await supabase
      .from("player_badges")
      .upsert(badgeInserts, { onConflict: "player_id,badge_key" });
  }

  async function awardXp({
    playerId,
    activity,
    completionId,
    completionType,
    reason,
  }) {
    const xp = xpForActivity(activity, completionType);

    const { error } = await supabase.from("xp_transactions").insert({
      player_id: playerId,
      activity_id: activity?.id || null,
      activity_completion_id: completionId || null,
      reason,
      xp,
      source: completionType || "activity",
    });

    if (error) {
      throw error;
    }
  }

  async function removeXpForActivity(playerId, activityId) {
    const { error } = await supabase
      .from("xp_transactions")
      .delete()
      .eq("player_id", playerId)
      .eq("activity_id", activityId);

    if (error) {
      throw error;
    }
  }

  function selectPlayer(playerId) {
    localStorage.setItem("selectedPlayerId", playerId);
    localStorage.setItem("selectedSquadKey", squadConfig.key);
    onSelectPlayer(playerId);
    onChangeParentView("challenge");
  }

  async function linkChild(player) {
    setLinking(true);

    const { data: userData, error: userError } = await supabase.auth.getUser();

    if (userError || !userData?.user?.id) {
      alert("Could not find logged-in parent.");
      setLinking(false);
      return;
    }

    const { error } = await supabase.from("parent_players").insert({
      user_id: userData.user.id,
      player_id: player.id,
    });

    setLinking(false);

    if (error) {
      alert(error.message);
      return;
    }

    setLocalPlayers([player]);
    selectPlayer(player.id);
  }

  async function upsertCompletion({
    playerId,
    activity,
    status = "completed",
    completionType = "activity",
    gpsVerified = false,
    awardPoints = true,
  }) {
    const { data, error } = await supabase
      .from("activity_completions")
      .upsert(
        {
          player_id: playerId,
          activity_id: activity.id,
          status,
          completion_type: completionType,
          gps_verified: gpsVerified,
          completed_at: new Date().toISOString(),
        },
        {
          onConflict: "player_id,activity_id",
        }
      )
      .select()
      .single();

    if (error) {
      throw error;
    }

    await removeXpForActivity(playerId, activity.id);

    if (awardPoints) {
      await awardXp({
        playerId,
        activity,
        completionId: data.id,
        completionType,
        reason: activity.title || completionType,
      });
    }

    await maybeAwardBadges(playerId);
    await refreshPlayerData(playerId);

    if (status === "completed" || status === "awaiting_approval") {
      playCompleteDing();
    }

    return data;
  }

  async function handleToggleActivity(activity, existingCompletion) {
    if (!selectedPlayer?.id) return;

    if (existingCompletion) {
      const { error } = await supabase
        .from("activity_completions")
        .delete()
        .eq("player_id", selectedPlayer.id)
        .eq("activity_id", activity.id)
        .neq("gps_verified", true);

      if (error) {
        alert(error.message);
        return;
      }

      try {
        await removeXpForActivity(selectedPlayer.id, activity.id);
      } catch (xpError) {
        alert(xpError.message);
      }

      await refreshPlayerData(selectedPlayer.id);
      return;
    }

    try {
      await upsertCompletion({
        playerId: selectedPlayer.id,
        activity,
        status: "completed",
        completionType: "activity",
        gpsVerified: false,
        awardPoints: true,
      });
    } catch (error) {
      alert(error.message);
    }
  }

  async function handleSubmitApproval(activity, type) {
    if (!selectedPlayer?.id) return;

    try {
      await upsertCompletion({
        playerId: selectedPlayer.id,
        activity,
        status: "awaiting_approval",
        completionType: type === "bonus" ? "bonus_approval" : "squad_approval",
        gpsVerified: false,
        awardPoints: false,
      });
    } catch (error) {
      alert(error.message);
    }
  }

  async function handleRunSaved(result) {
    const completion = await upsertCompletion({
      playerId: result.playerId,
      activity: {
        id: result.activityId,
        title: result.title,
        activity_key: "fitness",
        target_unit: "km",
      },
      status: "completed",
      completionType: result.type,
      gpsVerified: result.type === "gps",
      awardPoints: true,
    });

    const { error: proofError } = await supabase.from("run_proofs").insert({
      squad: squadConfig.shortLabel || squadConfig.label || null,
      squad_key: selectedPlayer?.squad_key || squadConfig.key,
      player_id: result.playerId,
      player_name: selectedPlayer.name,
      task_key: result.activityId,
      week: CURRENT_WEEK,
      label: result.title,
      target: result.targetKm ? `${result.targetKm} km` : null,
      run_type: result.type,
      distance_km: result.distanceKm,
      duration_min: result.durationMin,
      pace_min_per_km:
        result.distanceKm > 0 && result.durationMin
          ? Number((result.durationMin / result.distanceKm).toFixed(2))
          : null,
      note: result.type === "gps" ? "Verified GPS run" : "Manual run entry",
      route_points: result.type === "gps" ? result.routePoints || [] : null,
      saved_at: result.savedAt,
      updated_at: new Date().toISOString(),
      has_screenshot: result.type === "gps" && Array.isArray(result.routePoints) && result.routePoints.length > 0,
      share_image_url: null,
    });

    if (proofError) {
      throw proofError;
    }

    await maybeAwardBadges(result.playerId);
    await refreshPlayerData(result.playerId);
    return completion;
  }

  async function deleteManualRun(run) {
    const { error } = await supabase
      .from("run_proofs")
      .delete()
      .eq("id", run.id)
      .eq("run_type", "manual");

    if (error) {
      alert(error.message);
      return;
    }

    if (selectedPlayer?.id && run.task_key) {
      await supabase
        .from("activity_completions")
        .delete()
        .eq("player_id", selectedPlayer.id)
        .eq("activity_id", run.task_key)
        .eq("completion_type", "manual");

      await removeXpForActivity(selectedPlayer.id, run.task_key);
    }

    if (selectedPlayer?.id) {
      await refreshPlayerData(selectedPlayer.id);
    }
  }

  if (!localPlayers.length) {
    return (
      <div className="page">
        <div className="card">
          <h2>Select your child</h2>
          <p className="muted">Choose your child from {squadConfig.shortLabel}.</p>

          {loadingAvailable ? (
            <p className="muted">Loading players…</p>
          ) : (
            <>
              <label className="label">Child name</label>

              <select
                className="select"
                disabled={linking}
                defaultValue=""
                onChange={e => {
                  const player = availablePlayers.find(
                    p => p.id === e.target.value
                  );

                  if (player) linkChild(player);
                }}
              >
                <option value="">Select your child</option>

                {availablePlayers.map(player => (
                  <option key={player.id} value={player.id}>
                    {player.name}
                  </option>
                ))}
              </select>
            </>
          )}
        </div>
      </div>
    );
  }

  if (localPlayers.length > 1 && !selectedPlayer) {
    return (
      <div className="page">
        <div className="card">
          <h2>Select your child</h2>

          <div className="squad-grid">
            {localPlayers.map(player => (
              <button
                key={player.id}
                className="squad-card"
                onClick={() => selectPlayer(player.id)}
              >
                {player.name}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!selectedPlayer) return null;

  if (parentView === "progress") {
    return (
      <div className="page">
        <div className="player-card">
          <div className="player-avatar">
            {getPlayerInitials(selectedPlayer.name)}
          </div>

          <div>
            <h2>{selectedPlayer.name}</h2>
            <p>{squadConfig.shortLabel}</p>
          </div>

          <div className="player-level">
            <strong>Level {levelFromXp(xpTotal)}</strong>
            <span>{xpTotal} XP</span>
          </div>
        </div>

        <div className="card">
          <h2>Progress</h2>

          <div className="progress-summary-grid">
            <div>
              <strong>{completions.length}</strong>
              <span>missions logged</span>
            </div>

            <div>
              <strong>{xpTotal}</strong>
              <span>XP earned</span>
            </div>

            <div>
              <strong>{badges.length}</strong>
              <span>badges</span>
            </div>
          </div>

          <p className="muted">
            Leaderboard position is shown privately. Parents see rank only, not
            the full leaderboard.
          </p>
        </div>

        <div className="card">
          <h2>Badges</h2>

          {badges.length ? (
            <div className="week-list">
              {badges.map(badge => (
                <div className="week-row" key={badge.id}>
                  <span>🏅 {badge.badge_label}</span>
                  <strong>Earned</strong>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted">Complete missions to earn badges.</p>
          )}
        </div>

        <div className="card">
          <h2>All Weeks</h2>

          <div className="week-list">
            {weekNumbers.map(week => {
              const future = week > CURRENT_WEEK;

              return (
                <button
                  key={week}
                  className={
                    week === selectedWeek ? "week-row is-active" : "week-row"
                  }
                  onClick={() => setSelectedWeek(week)}
                >
                  <span>Week {week}</span>
                  <strong>
                    {future
                      ? "Preview"
                      : week < CURRENT_WEEK
                        ? "Complete"
                        : "Current"}
                  </strong>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  if (parentView === "profile") {
    return (
      <div className="page">
        <div className="player-card">
          <div className="player-avatar">
            {getPlayerInitials(selectedPlayer.name)}
          </div>

          <div>
            <h2>{selectedPlayer.name}</h2>
            <p>{squadConfig.shortLabel}</p>
          </div>

          <div className="player-level">
            <strong>Level {levelFromXp(xpTotal)}</strong>
            <span>{xpTotal} XP</span>
          </div>
        </div>

        <div className="card">
          <h2>Player Card</h2>
          <p className="muted">
            Badges earned: {badges.length}. Missions logged: {completions.length}.
          </p>

          {localPlayers.length > 1 ? (
            <button
              className="button secondary"
              onClick={() => {
                localStorage.removeItem("selectedPlayerId");
                onSelectPlayer("");
                onChangeParentView("challenge");
              }}
            >
              Switch child
            </button>
          ) : null}

          <button className="button secondary" style={{ marginTop: 12 }}>
            Change password
          </button>

          <button
            className="button secondary"
            style={{ marginTop: 12 }}
            onClick={onSignOut}
          >
            Sign out
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      {squadRank ? (
        <div className="home-leaderboard-position-card">
          <span>🏆</span>
          <div>
            <strong>Squad Leaderboard</strong>
            <p>
              {selectedPlayer.name} is <b>#{squadRank.position}</b> of {squadRank.total}
              {squadRank.xp ? ` with ${squadRank.xp} XP` : ""}.
            </p>
          </div>
        </div>
      ) : null}

      <ChallengeHome
        supabase={supabase}
        squadConfig={squadConfig}
        selectedPlayer={selectedPlayer}
        savedRuns={savedRuns}
        completions={completions}
        xpTotal={xpTotal}
        badges={badges}
        onStartRun={activity => setRunActivity(activity)}
        onDeleteManualRun={deleteManualRun}
        onToggleActivity={handleToggleActivity}
        onSubmitApproval={handleSubmitApproval}
      />

      {runActivity ? (
        <RunLoggerModal
          activity={runActivity}
          selectedPlayer={selectedPlayer}
          onClose={() => setRunActivity(null)}
          onSaved={handleRunSaved}
        />
      ) : null}
    </div>
  );
}
