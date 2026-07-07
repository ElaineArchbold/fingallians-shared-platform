import { useEffect, useMemo, useState } from "react";
import ChallengeHome from "../parent/ChallengeHome";
import RunLoggerModal from "../parent/RunLoggerModal";
import { useAllWeeklyActivities } from "../../hooks/useWeeklyActivities";
import { playCompleteDing } from "../../lib/sounds";
import { getCurrentChallengeWeek } from "../../lib/challengeWeeks";

const CURRENT_WEEK = getCurrentChallengeWeek();

function xpForActivity(activity, completionType = "activity") {
  const title = String(activity?.title || "").toLowerCase();
  const targetUnit = String(activity?.target_unit || "").toLowerCase();
  const isRun = activity?.gps_preferred === true || targetUnit === "km" || title.includes("run");

  if (isRun || completionType === "gps" || completionType === "manual") return 3;

  if (
    activity?.activity_key === "fitness" ||
    activity?.activity_key === "running-technique" ||
    activity?.activity_key === "football-skill" ||
    activity?.activity_key === "hurling-skill" ||
    activity?.activity_key === "camogie-skill"
  ) {
    return 2;
  }

  if (activity?.activity_key === "squad-session") return 4;
  if (activity?.activity_key === "bonus") return 4;
  if (activity?.activity_key === "recovery") return 1;

  return 1;
}

function getSquadConfigFromPlayer(player, fallback) {
  const squadKey = player?.squad_key || fallback?.key || "";
  const label = player?.squad || fallback?.label || squadKey;

  return {
    ...(fallback || {}),
    key: squadKey,
    label,
    shortLabel: label,
  };
}

export default function ChildHome({
  supabase,
  squadConfig,
  childToken,
}) {
  const [player, setPlayer] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(true);
  const [challengeWeek, setChallengeWeek] = useState(CURRENT_WEEK);
  const [runActivity, setRunActivity] = useState(null);
  const [savedRuns, setSavedRuns] = useState([]);
  const [completions, setCompletions] = useState([]);
  const [xpTotal, setXpTotal] = useState(0);
  const [badges, setBadges] = useState([]);

  const childSquadConfig = useMemo(
    () => getSquadConfigFromPlayer(player, squadConfig),
    [player, squadConfig]
  );

  const { weeks } = useAllWeeklyActivities(supabase, childSquadConfig.key);

  useEffect(() => {
    async function loadPlayerFromToken() {
      const token = childToken || localStorage.getItem("childAccessToken");

      if (!token) {
        setLoadError("No child link token found.");
        setLoading(false);
        return;
      }

      localStorage.setItem("childAccessToken", token);

      const { data, error } = await supabase
        .from("players")
        .select("id,name,squad,squad_key,child_access_token")
        .eq("child_access_token", token)
        .single();

      if (error || !data) {
        console.error(error);
        setLoadError("This child link is not valid. Ask a parent to copy the link again from Settings.");
        setLoading(false);
        return;
      }

      localStorage.setItem("childPlayerId", data.id);
      localStorage.setItem("childSquadKey", data.squad_key || "");
      setPlayer(data);
      setLoading(false);
    }

    loadPlayerFromToken();
  }, [supabase, childToken]);

  useEffect(() => {
    if (!player?.id) return;
    refreshPlayerData(player.id);
  }, [player?.id]);

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

    if (error) throw error;
  }

  async function removeXpForActivity(playerId, activityId) {
    const { error } = await supabase
      .from("xp_transactions")
      .delete()
      .eq("player_id", playerId)
      .eq("activity_id", activityId);

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
        reason: activity.title || completionType,
      });
    }

    await refreshPlayerData(playerId);

    if (status === "completed" || status === "awaiting_approval") {
      playCompleteDing();
    }

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
    if (!player?.id) return;

    const activity =
      weeks.find(item => item.id === result.activityId) || {
        id: result.activityId,
        title: result.title,
        activity_key: "run",
        target_unit: "km",
        target_value: result.targetKm || result.distanceKm || 0,
      };

    const completion = await upsertCompletion({
      playerId: player.id,
      activity,
      status: "completed",
      completionType: result.type === "gps" ? "gps" : "manual",
      gpsVerified: result.type === "gps",
      awardPoints: true,
    });

    const proof = {
      squad: player.squad,
      squad_key: player.squad_key,
      player_id: player.id,
      player_name: player.name,
      task_key: result.activityId,
      week: result.week || challengeWeek,
      run_index: result.runIndex,
      label: result.title,
      target: result.target,
      run_type: result.type,
      distance_km: result.distanceKm,
      duration_min: result.durationMin,
      pace_min_per_km: result.paceMinPerKm,
      note: result.type === "gps" ? "Verified GPS run" : "Manual run entry",
      route_points: result.type === "gps" ? result.routePoints || [] : null,
      saved_at: result.savedAt,
      updated_at: new Date().toISOString(),
      has_screenshot: result.type === "gps" && Array.isArray(result.routePoints) && result.routePoints.length > 0,
      share_image_url: null,
    };

    const { error } = await supabase.from("run_proofs").insert(proof);

    if (error) {
      alert(error.message);
      return;
    }

    await refreshPlayerData(player.id);
    return completion;
  }

  if (loading) {
    return <div className="card">Opening child link…</div>;
  }

  if (loadError) {
    return (
      <div className="card">
        <h2>Child Link</h2>
        <p className="muted">{loadError}</p>
      </div>
    );
  }

  return (
    <div className="page">
      <ChallengeHome
        supabase={supabase}
        squadConfig={childSquadConfig}
        selectedPlayer={player}
        hasMultipleChildren={false}
        activeWeek={challengeWeek}
        currentWeek={CURRENT_WEEK}
        lockFutureWeeks={false}
        onChangeWeek={setChallengeWeek}
        activities={weeks || []}
        completions={completions}
        savedRuns={savedRuns}
        xpTotal={xpTotal}
        badges={badges}
        onToggleActivity={handleToggleActivity}
        onSubmitApproval={handleSubmitApproval}
        onStartRun={setRunActivity}
      />

      {runActivity ? (
        <RunLoggerModal
          activity={runActivity}
          selectedPlayer={player}
          onClose={() => setRunActivity(null)}
          onSaved={async result => {
            await handleRunSaved(result);
            setRunActivity(null);
          }}
        />
      ) : null}
    </div>
  );
}
