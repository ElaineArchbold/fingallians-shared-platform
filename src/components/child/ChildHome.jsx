import { useEffect, useMemo, useState } from "react";
import ChallengeHome from "../parent/ChallengeHome";
import RunLoggerModal from "../parent/RunLoggerModal";
import SkillsLibrary from "../parent/SkillsLibrary";
import { useAllWeeklyActivities } from "../../hooks/useWeeklyActivities";
import { playActivityComplete } from "../../lib/sounds";
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
  function returnToParentView() {
    localStorage.removeItem("childAccessToken");
    localStorage.removeItem("childPlayerId");
    localStorage.removeItem("childSquadKey");
    window.location.href = "/";
  }

  const [player, setPlayer] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(true);
  const [challengeWeek, setChallengeWeek] = useState(CURRENT_WEEK);
  const [runActivity, setRunActivity] = useState(null);
  const [savedRuns, setSavedRuns] = useState([]);
  const [completions, setCompletions] = useState([]);
  const [xpTotal, setXpTotal] = useState(0);
  const [badges, setBadges] = useState([]);
  const [childView, setChildView] = useState("challenge");

  const childSquadConfig = useMemo(
    () => getSquadConfigFromPlayer(player, squadConfig),
    [player, squadConfig]
  );

  const { weeks } = useAllWeeklyActivities(supabase, childSquadConfig.key);

  async function findParentForChild(foundPlayer) {
    if (!foundPlayer?.id) {
      return { parentEmail: null, parentUserId: null, source: "none" };
    }

    try {
      const { data: linkedAuditRows } = await supabase
        .from("migration_audit")
        .select("parent_email,parent_user_id,created_at,event,details")
        .in("event", ["child_linked", "admin_child_linked"])
        .filter("details->>player_id", "eq", foundPlayer.id)
        .not("parent_email", "is", null)
        .order("created_at", { ascending: false })
        .limit(1);

      const auditMatch = linkedAuditRows?.[0];

      if (auditMatch?.parent_email || auditMatch?.parent_user_id) {
        return {
          parentEmail: auditMatch.parent_email || null,
          parentUserId: auditMatch.parent_user_id || null,
          source: "migration_audit_child_linked",
        };
      }
    } catch (auditLookupError) {
      console.warn("Could not look up parent from child_linked audit", auditLookupError);
    }

    try {
      const { data: parentRows } = await supabase
        .from("parent_players")
        .select("user_id")
        .eq("player_id", foundPlayer.id)
        .limit(1);

      const parentMatch = parentRows?.[0];

      if (parentMatch?.user_id) {
        return {
          parentEmail: null,
          parentUserId: parentMatch.user_id,
          source: "parent_players_user_id_only",
        };
      }
    } catch (parentLookupError) {
      console.warn("Could not look up parent_players row for child link", parentLookupError);
    }

    return { parentEmail: null, parentUserId: null, source: "not_found" };
  }

  async function logChildLinkAccess(foundPlayer, token) {
    if (!foundPlayer?.id) return;

    const auditKey = `childLinkAccessLogged:${foundPlayer.id}:${token}`;
    const alreadyLoggedThisBrowserTab = sessionStorage.getItem(auditKey) === "true";
    const parentInfo = await findParentForChild(foundPlayer);

    const auditRow = {
      parent_email: parentInfo.parentEmail,
      parent_user_id: parentInfo.parentUserId,
      event: "child_link_accessed",
      details: {
        player_id: foundPlayer.id,
        child_name: foundPlayer.name,
        squad_key: foundPlayer.squad_key,
        child_token_suffix: token ? String(token).slice(-6) : null,
        parent_lookup_source: parentInfo.source,
        source: "child_view",
        access_type: alreadyLoggedThisBrowserTab ? "repeat_view_same_tab" : "page_view",
        path: window.location.pathname,
        url: window.location.href,
        user_agent: navigator.userAgent,
      },
    };

    try {
      const { error } = await supabase.from("migration_audit").insert(auditRow);

      if (error) {
        console.error("Child link migration_audit insert failed", error);
        return;
      }

      sessionStorage.setItem(auditKey, "true");
    } catch (auditError) {
      console.error("Child link audit insert failed", auditError);
    }
  }

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
      await logChildLinkAccess(data, token);
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

  async function removeCompletionForActivity(playerId, activityId) {
    const { data, error } = await supabase
      .from("activity_completions")
      .delete()
      .eq("player_id", playerId)
      .eq("activity_id", activityId)
      .or("gps_verified.is.null,gps_verified.eq.false")
      .select("id,player_id,activity_id,completion_type,gps_verified");

    if (error) throw error;
    return data || [];
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

    if (
      (status === "completed" || status === "awaiting_approval") &&
      completionType !== "gps" &&
      completionType !== "manual"
    ) {
      playActivityComplete();
    }

    return data;
  }

  async function handleToggleActivity(activity, existingCompletion) {
    if (!player?.id) return;

    if (existingCompletion) {
      try {
        await removeCompletionForActivity(player.id, activity.id);
        await removeXpForActivity(player.id, activity.id);
        await refreshPlayerData(player.id);
      } catch (error) {
        alert(error.message);
      }

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

  async function deleteManualRun(run) {
    const flowId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const playerId = run?.playerId || run?.player_id || player?.id;
    const activityId = run?.activityId || run?.task_key || run?.activity_id;

    console.groupCollapsed("[child-manual-run-delete]", flowId);
    console.log("handler fired", { run, playerId, activityId });

    if (!playerId || !activityId) {
      console.error("Missing playerId or activityId", { playerId, activityId, run });
      console.groupEnd();
      alert("Could not identify the manual run to remove.");
      return;
    }

    const ok = window.confirm("Remove this manual run and uncheck the activity?");

    if (!ok) {
      console.log("cancelled by user");
      console.groupEnd();
      return;
    }

    const previousSavedRuns = savedRuns;
    const previousCompletions = completions;

    setSavedRuns(current =>
      current.filter(item =>
        run?.id
          ? item.id !== run.id
          : !(
              item.player_id === playerId &&
              item.task_key === activityId &&
              item.run_type === "manual"
            )
      )
    );

    setCompletions(current =>
      current.filter(item => !(item.player_id === playerId && item.activity_id === activityId))
    );

    try {
      let proofQuery = supabase
        .from("run_proofs")
        .delete()
        .eq("player_id", playerId)
        .eq("task_key", activityId)
        .eq("run_type", "manual")
        .select("id,player_id,task_key,run_type");

      if (run?.id) {
        proofQuery = supabase
          .from("run_proofs")
          .delete()
          .eq("id", run.id)
          .eq("player_id", playerId)
          .eq("run_type", "manual")
          .select("id,player_id,task_key,run_type");
      }

      const { data: deletedProofs, error: proofError } = await proofQuery;
      if (proofError) throw proofError;
      console.log("run_proofs deleted", deletedProofs);

      if (!deletedProofs?.length) {
        const { data: fallbackProofs, error: fallbackProofError } = await supabase
          .from("run_proofs")
          .delete()
          .eq("player_id", playerId)
          .eq("task_key", activityId)
          .eq("run_type", "manual")
          .select("id,player_id,task_key,run_type");

        if (fallbackProofError) throw fallbackProofError;
        console.log("run_proofs fallback deleted", fallbackProofs);
      }

      const deletedCompletions = await removeCompletionForActivity(playerId, activityId);
      console.log("activity_completions deleted", deletedCompletions);

      const { data: deletedXp, error: xpError } = await supabase
        .from("xp_transactions")
        .delete()
        .eq("player_id", playerId)
        .eq("activity_id", activityId)
        .select("id,player_id,activity_id,xp,source");

      if (xpError) throw xpError;
      console.log("xp_transactions deleted", deletedXp);

      await refreshPlayerData(playerId);
      console.log("refresh complete");
    } catch (error) {
      console.error("child manual run delete failed", error);
      setSavedRuns(previousSavedRuns);
      setCompletions(previousCompletions);
      alert(error?.message || "Could not remove this manual run.");
    } finally {
      console.groupEnd();
    }
  }

  if (loading) {
    return (
      <div className="card">
        <button className="child-parent-return-link" type="button" onClick={returnToParentView}>
          ← Parent view
        </button>
        Opening child link…
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="card">
        <button className="child-parent-return-link" type="button" onClick={returnToParentView}>
          ← Parent view
        </button>
        <h2>Child Link</h2>
        <p className="muted">{loadError}</p>
      </div>
    );
  }

  if (childView === "skills") {
    return (
      <SkillsLibrary
        supabase={supabase}
        squadConfig={childSquadConfig}
        selectedPlayer={player}
        hasMultipleChildren={false}
        onBack={() => setChildView("challenge")}
      />
    );
  }

  return (
    <div className="page">
      <div className="child-home-action-row">
        <button className="child-parent-return-link" type="button" onClick={returnToParentView}>
          ← Parent view
        </button>
        <button className="child-skills-library-button" type="button" onClick={() => setChildView("skills")}>
          📚 Skills Library
        </button>
      </div>

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
        onDeleteManualRun={deleteManualRun}
      />

      {runActivity ? (
        <RunLoggerModal
          activity={runActivity}
          selectedPlayer={player}
          onClose={() => setRunActivity(null)}
          onSaved={async result => {
            return await handleRunSaved(result);
          }}
          onDeleted={deleteManualRun}
        />
      ) : null}
    </div>
  );
}
