import { useEffect, useState } from "react";
import ChallengeHome from "../parent/ChallengeHome";
import RunLoggerModal from "../parent/RunLoggerModal";

const CURRENT_WEEK = 1;

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

export default function ChildHome({ supabase, squadConfig, childToken }) {
  const [loading, setLoading] = useState(true);
  const [player, setPlayer] = useState(null);
  const [error, setError] = useState("");
  const [savedRuns, setSavedRuns] = useState([]);
  const [completions, setCompletions] = useState([]);
  const [xpTotal, setXpTotal] = useState(0);
  const [badges, setBadges] = useState([]);
  const [runActivity, setRunActivity] = useState(null);

  useEffect(() => {
    loadChild();
  }, [childToken, squadConfig.key]);

  useEffect(() => {
    if (!player?.id) return;

    const channel = supabase
      .channel(`child-player-realtime-${player.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "activity_completions",
          filter: `player_id=eq.${player.id}`,
        },
        () => refreshPlayerData(player.id)
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "run_proofs",
          filter: `player_id=eq.${player.id}`,
        },
        () => refreshPlayerData(player.id)
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "xp_transactions",
          filter: `player_id=eq.${player.id}`,
        },
        () => refreshPlayerData(player.id)
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "player_badges",
          filter: `player_id=eq.${player.id}`,
        },
        () => refreshPlayerData(player.id)
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, player?.id, squadConfig.key]);

  async function loadChild() {
    if (!childToken) {
      setError("Missing child link.");
      setLoading(false);
      return;
    }

    setLoading(true);

    const { data, error: playerError } = await supabase
      .from("players")
      .select("id,name,squad,squad_key,child_access_token")
      .eq("child_access_token", childToken)
      .maybeSingle();

    if (playerError || !data) {
      console.error(playerError);
      setError("This child link could not be found.");
      setLoading(false);
      return;
    }

    setPlayer(data);
    await refreshPlayerData(data.id);
    setLoading(false);
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

  async function removeXpForActivity(playerId, activityId) {
    const { error } = await supabase
      .from("xp_transactions")
      .delete()
      .eq("player_id", playerId)
      .eq("activity_id", activityId);

    if (error) throw error;
  }

  async function awardXp({ playerId, activity, completionId, completionType }) {
    const xp = xpForActivity(activity, completionType);

    if (!xp) return;

    const { error } = await supabase.from("xp_transactions").insert({
      player_id: playerId,
      activity_id: activity.id,
      activity_completion_id: completionId || null,
      reason: activity.title || completionType,
      xp,
      source: completionType || "activity",
    });

    if (error) throw error;
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

    if (error) throw error;

    await removeXpForActivity(playerId, activity.id);

    if (awardPoints) {
      await awardXp({
        playerId,
        activity,
        completionId: data.id,
        completionType,
      });
    }

    await refreshPlayerData(playerId);
    return data;
  }

  async function handleToggleActivity(activity, existingCompletion) {
    if (!player?.id) return;

    if (existingCompletion) {
      const { error } = await supabase
        .from("activity_completions")
        .delete()
        .eq("player_id", player.id)
        .eq("activity_id", activity.id)
        .neq("gps_verified", true);

      if (error) {
        alert(error.message);
        return;
      }

      await removeXpForActivity(player.id, activity.id);
      await refreshPlayerData(player.id);
      return;
    }

    try {
      await upsertCompletion({
        playerId: player.id,
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
    if (!player?.id) return;

    try {
      await upsertCompletion({
        playerId: player.id,
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
    const activity = {
      id: result.activityId,
      title: result.title,
      activity_key: "fitness",
      target_unit: "km",
    };

    await upsertCompletion({
      playerId: result.playerId,
      activity,
      status: "completed",
      completionType: result.type,
      gpsVerified: result.type === "gps",
      awardPoints: true,
    });

    const { error } = await supabase.from("run_proofs").insert({
      squad: squadConfig.shortLabel || squadConfig.label || null,
      squad_key: squadConfig.key,
      player_id: result.playerId,
      player_name: player.name,
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
      saved_at: result.savedAt,
      updated_at: new Date().toISOString(),
      has_screenshot: false,
      share_image_url: null,
    });

    if (error) throw error;

    await refreshPlayerData(result.playerId);
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

    if (player?.id && run.task_key) {
      await supabase
        .from("activity_completions")
        .delete()
        .eq("player_id", player.id)
        .eq("activity_id", run.task_key)
        .eq("completion_type", "manual");

      await removeXpForActivity(player.id, run.task_key);
      await refreshPlayerData(player.id);
    }
  }

  if (loading) {
    return (
      <div className="page">
        <div className="card">Loading challenge…</div>
      </div>
    );
  }

  if (error || !player) {
    return (
      <div className="page">
        <div className="card">
          <h2>Link not found</h2>
          <p className="muted">{error || "This child link is not valid."}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page child-home-page">
      <ChallengeHome
        supabase={supabase}
        squadConfig={squadConfig}
        selectedPlayer={player}
        activeWeek={CURRENT_WEEK}
        onChangeWeek={() => {}}
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
          selectedPlayer={player}
          onClose={() => setRunActivity(null)}
          onSaved={handleRunSaved}
        />
      ) : null}
    </div>
  );
}
