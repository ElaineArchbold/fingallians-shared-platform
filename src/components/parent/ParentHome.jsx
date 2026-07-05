import { useEffect, useState } from "react";
import ChallengeHome from "./ChallengeHome";
import ProgressHome from "./ProgressHome";
import SettingsHome from "./SettingsHome";
import RunLoggerModal from "./RunLoggerModal";
import { useAllWeeklyActivities } from "../../hooks/useWeeklyActivities";

const CURRENT_WEEK = 1;

function getPlayerInitials(name = "") {
  return name
    .split(" ")
    .map(part => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
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
    activity?.activity_key === "hurling-skill"
  ) {
    return 2;
  }

  if (activity?.activity_key === "fitness") return 2;
  if (activity?.activity_key === "squad-session") return 3;
  if (activity?.activity_key === "bonus") return 0;

  return 1;
}

export default function ParentHome({
  supabase,
  session,
  squadConfig,
  squadKey,
  onChangeSquad,
  players,
  selectedPlayerId,
  onSelectPlayer,
  parentView,
  onChangeParentView,
  onSignOut,
  termsAcceptedAt,
}) {
  const [availablePlayers, setAvailablePlayers] = useState([]);
  const [loadingAvailable, setLoadingAvailable] = useState(false);
  const [linking, setLinking] = useState(false);
  const [localPlayers, setLocalPlayers] = useState(players || []);
  const [allLinkedPlayers, setAllLinkedPlayers] = useState(players || []);
  const [challengeWeek, setChallengeWeek] = useState(CURRENT_WEEK);
  const [runActivity, setRunActivity] = useState(null);
  const [savedRuns, setSavedRuns] = useState([]);
  const [completions, setCompletions] = useState([]);
  const [xpTotal, setXpTotal] = useState(0);
  const [xpTransactions, setXpTransactions] = useState([]);
  const [badges, setBadges] = useState([]);
  const [showChildSwitcher, setShowChildSwitcher] = useState(false);

  const { weeks } = useAllWeeklyActivities(supabase, squadConfig.key);

  const selectedPlayer =
    allLinkedPlayers.find(p => p.id === selectedPlayerId) ||
    localPlayers.find(p => p.id === selectedPlayerId) ||
    null;

  useEffect(() => {
    setLocalPlayers(players || []);
  }, [players]);

  useEffect(() => {
    loadAllLinkedPlayers();
  }, [session?.user?.id, squadConfig.key, players?.length]);

  useEffect(() => {
    if (!allLinkedPlayers.length && !localPlayers.length) return;

    const pool = allLinkedPlayers.length ? allLinkedPlayers : localPlayers;
    const savedPlayerId = localStorage.getItem("selectedPlayerId");
    const savedPlayer = pool.find(p => p.id === savedPlayerId);

    if (savedPlayer && !selectedPlayerId) {
      selectPlayer(savedPlayer);
      return;
    }

    if (pool.length === 1 && !selectedPlayerId) {
      selectPlayer(pool[0]);
    }
  }, [allLinkedPlayers, localPlayers, selectedPlayerId]);

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

    const channel = supabase
      .channel(`parent-player-realtime-${selectedPlayer.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "activity_completions",
          filter: `player_id=eq.${selectedPlayer.id}`,
        },
        () => refreshPlayerData(selectedPlayer.id)
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "run_proofs",
          filter: `player_id=eq.${selectedPlayer.id}`,
        },
        () => refreshPlayerData(selectedPlayer.id)
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "xp_transactions",
          filter: `player_id=eq.${selectedPlayer.id}`,
        },
        () => refreshPlayerData(selectedPlayer.id)
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "player_badges",
          filter: `player_id=eq.${selectedPlayer.id}`,
        },
        () => refreshPlayerData(selectedPlayer.id)
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, selectedPlayer?.id, squadConfig.key]);

  async function loadAllLinkedPlayers() {
    if (!session?.user?.id) {
      setAllLinkedPlayers(players || []);
      return;
    }

    const { data, error } = await supabase
      .from("parent_players")
      .select("player_id, players(id,name,squad,squad_key,child_access_token)")
      .eq("user_id", session.user.id);

    if (error) {
      console.error(error);
      setAllLinkedPlayers(players || []);
      return;
    }

    const linked = (data || [])
      .map(row => row.players)
      .filter(Boolean)
      .sort((a, b) => `${a.squad_key}-${a.name}`.localeCompare(`${b.squad_key}-${b.name}`));

    setAllLinkedPlayers(linked.length ? linked : players || []);
  }

  async function refreshPlayerData(playerId) {
    await Promise.all([
      loadSavedRuns(playerId),
      loadCompletions(playerId),
      loadXp(playerId),
      loadBadges(playerId),
    ]);
  }

  async function loadSavedRuns(playerId) {
    const { data, error } = await supabase
      .from("run_proofs")
      .select("*")
      .eq("player_id", playerId)
      .eq("squad_key", selectedPlayer?.squad_key || squadConfig.key)
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
      .select("*")
      .eq("player_id", playerId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error(error);
      setXpTransactions([]);
      setXpTotal(0);
      return;
    }

    setXpTransactions(data || []);
    setXpTotal((data || []).reduce((total, row) => total + Number(row.xp || 0), 0));
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

    const { data: xpRows } = await supabase
      .from("xp_transactions")
      .select("xp")
      .eq("player_id", playerId);

    const totalCompleted = (completionRows || []).filter(
      row => row.status === "completed" || row.status === "awaiting_approval"
    ).length;

    const totalRuns = (runRows || []).length;
    const totalXp = (xpRows || []).reduce((sum, row) => sum + Number(row.xp || 0), 0);

    const badgeInserts = [];

    if (totalCompleted >= 1) {
      badgeInserts.push({ player_id: playerId, badge_key: "first_mission", badge_label: "First Mission" });
    }

    if (totalRuns >= 1) {
      badgeInserts.push({ player_id: playerId, badge_key: "first_run", badge_label: "First Run" });
    }

    if ((runRows || []).some(row => row.run_type === "gps")) {
      badgeInserts.push({ player_id: playerId, badge_key: "first_gps_run", badge_label: "GPS Verified" });
    }

    if (totalCompleted >= 5) {
      badgeInserts.push({ player_id: playerId, badge_key: "five_missions", badge_label: "Five Missions" });
    }

    if (totalRuns >= 3) {
      badgeInserts.push({ player_id: playerId, badge_key: "three_runs", badge_label: "Three Runs" });
    }

    if (totalXp >= 100) {
      badgeInserts.push({ player_id: playerId, badge_key: "hundred_xp", badge_label: "100 XP Club" });
    }

    if (totalXp >= 250) {
      badgeInserts.push({ player_id: playerId, badge_key: "two_fifty_xp", badge_label: "250 XP Club" });
    }

    if (totalXp >= 500) {
      badgeInserts.push({ player_id: playerId, badge_key: "five_hundred_xp", badge_label: "500 XP Club" });
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

    if (!xp) return;

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

  function selectPlayer(playerOrId) {
    const player =
      typeof playerOrId === "string"
        ? allLinkedPlayers.find(p => p.id === playerOrId) ||
          localPlayers.find(p => p.id === playerOrId)
        : playerOrId;

    if (!player?.id) return;

    localStorage.setItem("selectedPlayerId", player.id);
    localStorage.setItem("selectedSquadKey", player.squad_key || squadConfig.key);

    onSelectPlayer(player.id);

    if (player.squad_key && player.squad_key !== squadConfig.key) {
      onChangeSquad?.(player.squad_key);
    }

    setShowChildSwitcher(false);
    onChangeParentView("challenge");
  }

  async function removeLinkedChild(player) {
    if (!session?.user?.id || !player?.id) return;

    if (player.id === selectedPlayer?.id) {
      alert("Switch to another child before removing this child.");
      return;
    }

    const ok = window.confirm(`Remove ${player.name} from this parent account?`);
    if (!ok) return;

    const { error } = await supabase
      .from("parent_players")
      .delete()
      .eq("user_id", session.user.id)
      .eq("player_id", player.id);

    if (error) {
      alert(error.message);
      return;
    }

    setAllLinkedPlayers(previous => previous.filter(item => item.id !== player.id));
    setLocalPlayers(previous => previous.filter(item => item.id !== player.id));
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

    if (error && !String(error.message || "").toLowerCase().includes("duplicate")) {
      alert(error.message);
      return;
    }

    await loadAllLinkedPlayers();
    setLocalPlayers(previous => {
      if (previous.some(item => item.id === player.id)) return previous;
      return [...previous, player];
    });

    selectPlayer(player);
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
    const fullActivity =
      (weeks || []).find(activity => activity.id === result.activityId) || {
        id: result.activityId,
        title: result.title,
        activity_key: "fitness",
      };

    const completion = await upsertCompletion({
      playerId: result.playerId,
      activity: fullActivity,
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
      week: challengeWeek,
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
      saved_at: result.savedAt,
      updated_at: new Date().toISOString(),
      has_screenshot: false,
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

  function openWeekFromProgress(week) {
    setChallengeWeek(Math.min(Number(week || CURRENT_WEEK), CURRENT_WEEK));
    onChangeParentView("challenge");
  }

  function renderChildSwitcherModal() {
    if (!showChildSwitcher) return null;

    const pool = allLinkedPlayers.length ? allLinkedPlayers : localPlayers;

    return (
      <div className="child-switcher-backdrop" onClick={() => setShowChildSwitcher(false)}>
        <div className="child-switcher-modal" onClick={event => event.stopPropagation()}>
          <button
            className="child-switcher-close"
            onClick={() => setShowChildSwitcher(false)}
          >
            ×
          </button>

          <h2>Select Child</h2>

          <div className="child-switcher-list">
            {pool.map(player => (
              <button
                key={player.id}
                className={
                  selectedPlayer && player.id === selectedPlayer.id
                    ? "child-switcher-row active"
                    : "child-switcher-row"
                }
                onClick={() => selectPlayer(player)}
              >
                <span>{getPlayerInitials(player.name)}</span>
                <div>
                  <strong>{player.name}</strong>
                  <small>{player.squad_key}</small>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!localPlayers.length && !allLinkedPlayers.length) {
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

  if ((allLinkedPlayers.length > 1 || localPlayers.length > 1) && !selectedPlayer) {
    const pool = allLinkedPlayers.length ? allLinkedPlayers : localPlayers;

    return (
      <div className="page">
        <div className="card">
          <h2>Select your child</h2>

          <div className="squad-grid">
            {pool.map(player => (
              <button
                key={player.id}
                className="squad-card"
                onClick={() => selectPlayer(player)}
              >
                {player.name}
                <small>{player.squad_key}</small>
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
      <>
        <ProgressHome
          squadConfig={squadConfig}
        selectedPlayer={selectedPlayer}
        hasMultipleChildren={(allLinkedPlayers.length || localPlayers.length) > 1}
        onSwitchChild={() => setShowChildSwitcher(true)}
        activities={weeks || []}
        completions={completions}
        savedRuns={savedRuns}
        xpTotal={xpTotal}
        xpTransactions={xpTransactions}
        badges={badges}
        onOpenWeek={openWeekFromProgress}
      />
        {renderChildSwitcherModal()}
      </>
    );
  }

  if (parentView === "settings") {
    return (
      <>
        <SettingsHome
          supabase={supabase}
        session={session}
        squadConfig={squadConfig}
        selectedPlayer={selectedPlayer}
        players={allLinkedPlayers.length ? allLinkedPlayers : localPlayers}
        xpTotal={xpTotal}
        badges={badges}
        completions={completions}
        termsAcceptedAt={termsAcceptedAt}
        onSwitchChild={() => setShowChildSwitcher(true)}
        onChildLinked={linkChild}
        onRemoveChild={removeLinkedChild}
        onSignOut={onSignOut}
      />
        {renderChildSwitcherModal()}
      </>
    );
  }

  return (
    <div className="page">
<ChallengeHome
        supabase={supabase}
        squadConfig={squadConfig}
        selectedPlayer={selectedPlayer}
        hasMultipleChildren={(allLinkedPlayers.length || localPlayers.length) > 1}
        onSwitchChild={() => setShowChildSwitcher(true)}
        activeWeek={challengeWeek}
        onChangeWeek={setChallengeWeek}
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
      {renderChildSwitcherModal()}
    </div>
  );
}
