import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { playCompleteDing } from "../../lib/sounds";
import ChallengeHome from "../parent/ChallengeHome";
import RunLoggerModal from "../parent/RunLoggerModal";
import CoachPlayerView from "./CoachPlayerView";
import { getCurrentChallengeWeek } from "../../lib/challengeWeeks";

const SQUADS = [
  { key: "all", label: "All Squads" },
  { key: "2014-boys", label: "2014 Boys" },
  { key: "2015-girls", label: "2015 Girls" },
  { key: "2017-boys", label: "2017 Boys" },
  { key: "2017-girls", label: "2017 Girls" },
];

const ADMIN_TABS = [
  { key: "overview", label: "Overview", icon: "📊" },
  { key: "approvals", label: "Approvals", icon: "🔔" },
  { key: "players", label: "Players", icon: "👧" },
  { key: "plans", label: "Plans", icon: "🗓️" },
  { key: "leaderboard", label: "Leaderboard", icon: "🏆" },
  { key: "migration", label: "Migration", icon: "🧭", superAdminOnly: true },
];

function displaySquad(key) {
  return SQUADS.find(item => item.key === key)?.label || key || "Unknown";
}

function initials(name = "") {
  return name
    .split(" ")
    .map(part => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function num(value) {
  return Number(value || 0);
}

function isApproved(completion) {
  return completion.status === "completed";
}

function isPendingApproval(completion) {
  return completion.status === "awaiting_approval";
}

function isApprovalType(completion) {
  return ["squad_approval", "bonus_approval"].includes(completion.completion_type);
}

function statusLabel(status) {
  if (status === "completed") return "Approved";
  if (status === "awaiting_approval") return "Awaiting Approval";
  if (status === "rejected") return "Rejected";
  return status || "Not started";
}

function planSortWeight(activity) {
  if (isRunActivity(activity)) return 10;
  if (activity?.activity_key === "running-technique") return 20;
  if (activity?.activity_key === "football-skill") return 30;
  if (activity?.activity_key === "hurling-skill") return 40;
  if (activity?.activity_key === "squad-session") return 50;
  if (activity?.activity_key === "bonus") return 60;
  return 70;
}

function isRunActivity(activity) {
  const title = String(activity?.title || "").toLowerCase();
  const targetUnit = String(activity?.target_unit || "").toLowerCase();

  return targetUnit === "km" || title.includes("run") || activity?.gps_preferred === true;
}

function xpForActivity(activity, completionType = "activity") {
  const title = String(activity?.title || "").toLowerCase();
  const run =
    isRunActivity(activity) ||
    completionType === "gps" ||
    completionType === "manual";

  if (run) return 3;

  if (
    activity?.activity_key === "running-technique" ||
    activity?.activity_key === "football-skill" ||
    activity?.activity_key === "hurling-skill"
  ) {
    return 2;
  }

  if (activity?.activity_key === "squad-session") return 4;
  if (activity?.activity_key === "bonus") return 4;
  if (activity?.activity_key === "recovery") return 1;

  return 1;
}

function rpcDeleteSummary(data) {
  if (!data) return "No response returned.";
  return [
    `runs: ${data.deleted_runs ?? 0}`,
    `completions: ${data.deleted_completions ?? 0}`,
    `xp: ${data.deleted_xp ?? 0}`,
    data.auth_email ? `auth: ${data.auth_email}` : null,
  ].filter(Boolean).join(" · ");
}

function dateTime(value) {
  if (!value) return "—";

  try {
    return new Date(value).toLocaleString([], {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

function canShareFiles() {
  return Boolean(navigator.share);
}

async function dataUrlToBlob(dataUrl) {
  const response = await fetch(dataUrl);
  return response.blob();
}

async function downloadNodeAsImage(node, filename) {
  if (!node) return;

  const htmlToImage = await import("html-to-image").catch(() => null);

  if (htmlToImage?.toPng) {
    const dataUrl = await htmlToImage.toPng(node, {
      pixelRatio: 2,
      backgroundColor: "#fffaf4",
      cacheBust: true,
    });

    if (canShareFiles()) {
      try {
        const blob = await dataUrlToBlob(dataUrl);
        const file = new File([blob], filename, { type: "image/png" });

        if (!navigator.canShare || navigator.canShare({ files: [file] })) {
          await navigator.share({
            title: "Fingallians Leaderboard",
            files: [file],
          });
          return;
        }
      } catch {
        // Fall through to download/print.
      }
    }

    const link = document.createElement("a");
    link.href = dataUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    return;
  }

  window.print();
}

export default function AdminHome({ squadConfig, isSuperAdmin, adminSquadKeys = [], onSignOut }) {
  const currentChallengeWeek = getCurrentChallengeWeek();
  const [activeTab, setActiveTab] = useState("overview");
  const [adminSquad, setAdminSquad] = useState(isSuperAdmin ? "all" : (adminSquadKeys[0] || squadConfig.key));
  const [loading, setLoading] = useState(true);
  const [players, setPlayers] = useState([]);
  const [completions, setCompletions] = useState([]);
  const [xpRows, setXpRows] = useState([]);
  const [runs, setRuns] = useState([]);
  const [badges, setBadges] = useState([]);
  const [activities, setActivities] = useState([]);
  const [termsRows, setTermsRows] = useState([]);
  const [migrationRows, setMigrationRows] = useState([]);
  const [migrationFilter, setMigrationFilter] = useState("all");
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [detailModal, setDetailModal] = useState(null);
  const [planWeek, setPlanWeek] = useState(1);
  const [editingActivity, setEditingActivity] = useState(null);
  const [coachPlayer, setCoachPlayer] = useState(null);
  const [coachWeek, setCoachWeek] = useState(1);
  const [runActivity, setRunActivity] = useState(null);
  const [toast, setToast] = useState("");
  const [coachRefreshKey, setCoachRefreshKey] = useState(0);

  const leaderboardRef = useRef(null);
  const migrationListRef = useRef(null);

  const visibleSquads = isSuperAdmin
    ? SQUADS
    : SQUADS.filter(item => item.key !== "all" && (adminSquadKeys.length ? adminSquadKeys.includes(item.key) : item.key === squadConfig.key));

  const filteredPlayers = useMemo(() => {
    if (adminSquad === "all") return players;
    return players.filter(player => player.squad_key === adminSquad);
  }, [players, adminSquad]);

  const filteredIds = useMemo(() => new Set(filteredPlayers.map(player => player.id)), [filteredPlayers]);

  const filteredCompletions = completions.filter(row => filteredIds.has(row.player_id));
  const filteredXpRows = xpRows.filter(row => filteredIds.has(row.player_id));
  const filteredRuns = runs.filter(row => filteredIds.has(row.player_id));
  const filteredBadges = badges.filter(row => filteredIds.has(row.player_id));
  const filteredTerms = termsRows.filter(row => adminSquad === "all" || row.squad_key === adminSquad);

  const filteredMigrationRows = isSuperAdmin
    ? migrationRows.filter(row => {
        const detailsSquad = row?.details?.squad_key || row?.details?.selected_squad || row?.details?.squadKey;
        return adminSquad === "all" || !detailsSquad || detailsSquad === adminSquad;
      })
    : [];

  function migrationRowsForFilter(filterKey = "all") {
    return filteredMigrationRows.filter(row => {
      if (filterKey === "all") return true;
      if (filterKey === "parents") return Boolean(row.parent_email);
      if (filterKey === "accounts") return ["account_created", "password_created"].includes(row.event);
      if (filterKey === "logins") return row.event === "login";
      if (filterKey === "children") return row.event === "child_linked" || row.event === "child_removed";
      if (filterKey === "today") {
        if (!row.created_at) return false;
        return new Date(row.created_at).toDateString() === new Date().toDateString();
      }
      return true;
    });
  }

  const visibleMigrationRows = migrationRowsForFilter(migrationFilter);

  const migratedParentEmails = new Set(
    filteredMigrationRows
      .filter(row => ["login", "account_created", "password_created", "parent_migrated"].includes(row.event))
      .map(row => String(row.parent_email || "").toLowerCase())
      .filter(Boolean)
  );

  const migrationTodayCount = filteredMigrationRows.filter(row => {
    if (!row.created_at) return false;
    return new Date(row.created_at).toDateString() === new Date().toDateString();
  }).length;

  const activePlayerIds = new Set([
    ...filteredCompletions.map(row => row.player_id),
    ...filteredRuns.map(row => row.player_id),
  ]);

  const pendingApprovals = filteredCompletions.filter(row => isPendingApproval(row) && isApprovalType(row));

  const leaderboard = filteredPlayers
    .map(player => {
      const xp = filteredXpRows
        .filter(row => row.player_id === player.id)
        .reduce((sum, row) => sum + num(row.xp), 0);

      const completed = filteredCompletions.filter(
        row => row.player_id === player.id && isApproved(row)
      ).length;

      const awaiting = filteredCompletions.filter(
        row => row.player_id === player.id && isPendingApproval(row)
      ).length;

      const distance = playerDistanceFor(player);

      return {
        player,
        xp,
        completed,
        awaiting,
        distance,
        badges: filteredBadges.filter(row => row.player_id === player.id).length,
      };
    })
    .sort((a, b) => b.xp - a.xp || b.completed - a.completed || a.player.name.localeCompare(b.player.name));

  const squadStats = SQUADS.filter(item => item.key !== "all").map(squad => {
    const squadPlayers = players.filter(player => player.squad_key === squad.key);
    const ids = new Set(squadPlayers.map(player => player.id));
    const squadCompletions = completions.filter(row => ids.has(row.player_id));
    const squadRuns = runs.filter(row => ids.has(row.player_id));
    const squadXp = xpRows
      .filter(row => ids.has(row.player_id))
      .reduce((sum, row) => sum + num(row.xp), 0);

    return {
      ...squad,
      registered: squadPlayers.length,
      active: new Set([
        ...squadCompletions.map(row => row.player_id),
        ...squadRuns.map(row => row.player_id),
      ]).size,
      completions: squadCompletions.filter(isApproved).length,
      awaiting: squadCompletions.filter(isPendingApproval).length,
      runs: squadRunCountFor(ids),
      distance: squadDistanceFor(ids),
      xp: squadXp,
    };
  });

  const planActivities = activities
    .filter(activity => adminSquad === "all" || activity.squad_key === adminSquad)
    .filter(activity => Number(activity.week_number || 1) === Number(planWeek))
    .sort((a, b) =>
      planSortWeight(a) - planSortWeight(b) ||
      Number(a.sort_order || 0) - Number(b.sort_order || 0) ||
      String(a.title || "").localeCompare(String(b.title || ""))
    );

  const totalDistance = squadDistanceFor(filteredIds);
  const totalXp = filteredXpRows.reduce((sum, row) => sum + num(row.xp), 0);

  function selectedSquadStats() {
    if (adminSquad === "all") return null;

    return squadStats.find(squad => squad.key === adminSquad) || null;
  }


  useEffect(() => {
    loadAdminData();
  }, []);

  useEffect(() => {
    if (!isSuperAdmin && activeTab === "migration") {
      setActiveTab("overview");
    }
  }, [isSuperAdmin, activeTab]);

  useEffect(() => {
    const channel = supabase
      .channel("admin-dashboard-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "activity_completions" }, loadAdminData)
      .on("postgres_changes", { event: "*", schema: "public", table: "run_proofs" }, loadAdminData)
      .on("postgres_changes", { event: "*", schema: "public", table: "xp_transactions" }, loadAdminData)
      .on("postgres_changes", { event: "*", schema: "public", table: "players" }, loadAdminData)
      .on("postgres_changes", { event: "*", schema: "public", table: "weekly_activities" }, loadAdminData)
      .on("postgres_changes", { event: "*", schema: "public", table: "migration_audit" }, loadAdminData)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  async function loadAdminData() {
    setLoading(true);

    const [
      playerResult,
      completionResult,
      xpResult,
      runResult,
      badgeResult,
      activityResult,
      termsResult,
      migrationResult,
    ] = await Promise.all([
      supabase.from("players").select("*").order("squad_key").order("name"),
      supabase.from("activity_completions").select("*").order("completed_at", { ascending: false }),
      supabase.from("xp_transactions").select("*").order("created_at", { ascending: false }),
      supabase.from("run_proofs").select("*").order("saved_at", { ascending: false }),
      supabase.from("player_badges").select("*").order("earned_at", { ascending: false }),
      supabase.from("weekly_activities").select("*").order("week_number").order("section"),
      supabase.from("terms_acceptances").select("*").order("accepted_at", { ascending: false }),
      isSuperAdmin
        ? supabase.from("migration_audit").select("*").order("created_at", { ascending: false }).limit(250)
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (playerResult.error) console.error(playerResult.error);
    if (completionResult.error) console.error(completionResult.error);
    if (xpResult.error) console.error(xpResult.error);
    if (runResult.error) console.error(runResult.error);
    if (badgeResult.error) console.error(badgeResult.error);
    if (activityResult.error) console.error(activityResult.error);
    if (termsResult.error) console.error(termsResult.error);
    if (migrationResult.error) console.error(migrationResult.error);

    setPlayers(playerResult.data || []);
    setCompletions(completionResult.data || []);
    setXpRows(xpResult.data || []);
    setRuns(runResult.data || []);
    setBadges(badgeResult.data || []);
    setActivities(activityResult.data || []);
    setTermsRows(termsResult.data || []);
    setMigrationRows(migrationResult.data || []);
    setLoading(false);
  }

  function showToast(message) {
    setToast(message);
    setTimeout(() => setToast(""), 2600);
  }

  function playerById(id) {
    return players.find(player => player.id === id) || {};
  }

  function activityById(id) {
    return activities.find(activity => activity.id === id) || {};
  }

  function playerRunsFor(player) {
    if (!player?.id) return [];

    return runs.filter(run => run.player_id === player.id);
  }

  function playerCompletionsFor(player) {
    if (!player?.id) return [];

    return completions.filter(row => row.player_id === player.id);
  }

  function playerXpFor(player) {
    if (!player?.id) return 0;

    return xpRows
      .filter(row => row.player_id === player.id)
      .reduce((sum, row) => sum + num(row.xp), 0);
  }

  function completedRunActivitiesFor(player) {
    if (!player?.id) return [];

    return playerCompletionsFor(player)
      .filter(isApproved)
      .map(completion => ({
        completion,
        activity: activityById(completion.activity_id),
      }))
      .filter(({ activity }) => isRunActivity(activity));
  }

  function playerDistanceFor(player) {
    return completedRunActivitiesFor(player).reduce(
      (sum, { activity }) => sum + num(activity.target_value),
      0
    );
  }

  function playerRunCountFor(player) {
    return completedRunActivitiesFor(player).length;
  }

  function squadDistanceFor(playerIds) {
    return completions
      .filter(completion => playerIds.has(completion.player_id) && isApproved(completion))
      .map(completion => activityById(completion.activity_id))
      .filter(activity => isRunActivity(activity))
      .reduce((sum, activity) => sum + num(activity.target_value), 0);
  }

  function squadRunCountFor(playerIds) {
    return completions
      .filter(completion => playerIds.has(completion.player_id) && isApproved(completion))
      .map(completion => activityById(completion.activity_id))
      .filter(activity => isRunActivity(activity))
      .length;
  }

  function playerCompletedCountFor(player) {
    return playerCompletionsFor(player).filter(isApproved).length;
  }

  async function addPlayer(formData) {
    const name = formData.get("name")?.toString().trim();
    const squadKey = formData.get("squad_key")?.toString();

    if (!name || !squadKey) {
      alert("Enter a name and squad.");
      return;
    }

    const { error } = await supabase.from("players").insert({
      name,
      squad_key: squadKey,
      squad: displaySquad(squadKey),
    });

    if (error) {
      alert(error.message);
      return;
    }

    showToast("Player added.");
    loadAdminData();
  }

  async function removePlayer(player) {
    const ok = window.confirm(`Remove ${player.name}?`);
    if (!ok) return;

    const { error } = await supabase.from("players").delete().eq("id", player.id);

    if (error) {
      alert(error.message);
      return;
    }

    showToast("Player removed.");
    setSelectedPlayer(null);
    loadAdminData();
  }

  async function addPoints(player, amount, reason = "Admin adjustment") {
    const xp = Number(amount);

    if (!player?.id || !Number.isFinite(xp) || xp === 0) {
      alert("Enter a valid points amount.");
      return;
    }

    const { error } = await supabase.from("xp_transactions").insert({
      player_id: player.id,
      activity_id: null,
      activity_completion_id: null,
      xp,
      reason,
      source: "admin_adjustment",
    });

    if (error) {
      alert(error.message);
      return;
    }

    showToast(`${xp > 0 ? "Added" : "Removed"} ${Math.abs(xp)} points.`);
    loadAdminData();
  }

  async function approveCompletion(completion) {
    if (!isApprovalType(completion)) {
      alert("Only Squad Sessions and Friday Night Hurling need admin approval.");
      return false;
    }

    const activity = activityById(completion.activity_id);
    const xp = xpForActivity(activity, completion.completion_type);

    const { data: updatedRows, error: updateError } = await supabase
      .from("activity_completions")
      .update({
        status: "completed",
      })
      .eq("id", completion.id)
      .eq("status", "awaiting_approval")
      .in("completion_type", ["squad_approval", "bonus_approval"])
      .select("id,status,completion_type");

    if (updateError) {
      console.error("Approval update failed:", updateError);
      alert(`Could not approve: ${updateError.message}`);
      return false;
    }

    if (!updatedRows?.length) {
      alert("Could not approve this item. It may already be approved, or it is not a Squad Session/Friday Night Hurling approval.");
      await loadAdminData();
      return false;
    }

    const { error: deleteXpError } = await supabase
      .from("xp_transactions")
      .delete()
      .eq("player_id", completion.player_id)
      .eq("activity_id", completion.activity_id);

    if (deleteXpError) {
      console.error("XP reset failed:", deleteXpError);
      alert(`Approved, but could not reset XP: ${deleteXpError.message}`);
      await loadAdminData();
      return;
    }

    if (xp) {
      const { error: xpError } = await supabase.from("xp_transactions").insert({
        player_id: completion.player_id,
        activity_id: completion.activity_id,
        xp,
        reason: activity?.title || "Approved activity",
        source: completion.completion_type || "approval",
      });

      if (xpError) {
        console.error("XP insert failed:", xpError);
        alert(`Approved, but could not award XP: ${xpError.message}`);
        await loadAdminData();
        return false;
      }
    }

    showToast(`Approved${xp ? ` and awarded ${xp} XP` : ""}.`);
    await loadAdminData();
    return true;
  }

  async function rejectCompletion(completion) {
    if (!isApprovalType(completion)) {
      alert("Only Squad Sessions and Friday Night Hurling need admin approval.");
      return;
    }

    const ok = window.confirm("Reject and remove this pending item?");
    if (!ok) return;

    const { data: deletedRows, error } = await supabase
      .from("activity_completions")
      .delete()
      .eq("id", completion.id)
      .eq("status", "awaiting_approval")
      .in("completion_type", ["squad_approval", "bonus_approval"])
      .select("id");

    if (error) {
      console.error("Reject failed:", error);
      alert(`Could not reject: ${error.message}`);
      return;
    }

    if (!deletedRows?.length) {
      alert("Could not reject this item. It may already be approved, or it is not a Squad Session/Friday Night Hurling approval.");
      await loadAdminData();
      return;
    }

    showToast("Rejected.");
    await loadAdminData();
  }

  async function saveActivity(activity, formData) {
    const ok = window.confirm("Are you sure you want to save these plan changes?");
    if (!ok) return;

    const updates = {
      title: formData.get("title")?.toString() || activity.title,
      section: formData.get("section")?.toString() || activity.section,
      youtube_id: formData.get("youtube_id")?.toString() || null,
      skill_card_path: formData.get("skill_card_path")?.toString() || null,
      skill_card_title: formData.get("skill_card_title")?.toString() || null,
      target_value: formData.get("target_value")?.toString() || null,
      target_unit: formData.get("target_unit")?.toString() || null,
    };

    const { error } = await supabase
      .from("weekly_activities")
      .update(updates)
      .eq("id", activity.id);

    if (error) {
      alert(error.message);
      return;
    }

    setEditingActivity(null);
    showToast("Plan updated.");
    await loadAdminData();
  }

  async function adminToggleActivity(activity, existingCompletion, player) {
    if (!player?.id || !activity?.id) return false;

    if (existingCompletion) {
      const { error } = await supabase
        .from("activity_completions")
        .delete()
        .eq("player_id", player.id)
        .eq("activity_id", activity.id);

      if (error) {
        alert(error.message);
        return false;
      }

      await supabase
        .from("xp_transactions")
        .delete()
        .eq("player_id", player.id)
        .eq("activity_id", activity.id);

      await loadAdminData();
      showToast("Completion removed.");
      return true;
    }

    const { data, error } = await supabase
      .from("activity_completions")
      .upsert(
        {
          player_id: player.id,
          activity_id: activity.id,
          status: "completed",
          completion_type: "admin_activity",
          gps_verified: false,
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "player_id,activity_id" }
      )
      .select()
      .single();

    if (error) {
      alert(error.message);
      return false;
    }

    const xp = xpForActivity(activity, "admin_activity");

    await supabase
      .from("xp_transactions")
      .delete()
      .eq("player_id", player.id)
      .eq("activity_id", activity.id);

    if (xp) {
      const { error: xpError } = await supabase.from("xp_transactions").insert({
        player_id: player.id,
        activity_id: activity.id,
        activity_completion_id: data?.id || null,
        xp,
        reason: activity.title,
        source: "admin_activity",
      });

      if (xpError) {
        alert(xpError.message);
        return false;
      }
    }

    await loadAdminData();
    showToast(`Activity saved${xp ? ` (+${xp} XP)` : ""}.`);
    return true;
  }

  async function adminSubmitApproval(activity, type, player) {
    if (!player?.id) return;

    const { error } = await supabase.from("activity_completions").upsert(
      {
        player_id: player.id,
        activity_id: activity.id,
        status: "awaiting_approval",
        completion_type: type === "bonus" ? "bonus_approval" : "squad_approval",
        gps_verified: false,
        completed_at: new Date().toISOString(),
      },
      {
        onConflict: "player_id,activity_id",
      }
    );

    if (error) {
      alert(error.message);
      return;
    }

    loadAdminData();
  }

  function renderOverview() {
    return (
      <div className="admin-panel">
        <div className="admin-stat-grid">
          <button className="admin-stat-card" onClick={() => setDetailModal("registered")}>
            <span>👧</span>
            <strong>{filteredPlayers.length}</strong>
            <small>Registered</small>
          </button>

          <button className="admin-stat-card" onClick={() => setDetailModal("active")}>
            <span>🔥</span>
            <strong>{activePlayerIds.size}</strong>
            <small>Active</small>
          </button>

          <button className="admin-stat-card" onClick={() => setDetailModal("sessions")}>
            <span>✅</span>
            <strong>{filteredCompletions.length + filteredRuns.length}</strong>
            <small>Logged</small>
          </button>

          <button className="admin-stat-card" onClick={() => setActiveTab("approvals")}>
            <span>🔔</span>
            <strong>{pendingApprovals.length}</strong>
            <small>Approvals</small>
          </button>

          <button className="admin-stat-card">
            <span>🏃</span>
            <strong>{totalDistance.toFixed(1)}</strong>
            <small>KM Run</small>
          </button>

          <button className="admin-stat-card">
            <span>⚡</span>
            <strong>{totalXp}</strong>
            <small>Total XP</small>
          </button>
        </div>

        {adminSquad === "all" ? (
          <section className="admin-card">
            <h2>All-Squads Overview</h2>

            <div className="admin-squad-grid">
              {squadStats.map(squad => (
                <button
                  key={squad.key}
                  className="admin-squad-card"
                  onClick={() => setAdminSquad(squad.key)}
                >
                  <strong>{squad.label}</strong>
                  <span>{squad.active}/{squad.registered} active</span>
                  <div className="admin-progress-track">
                    <div style={{ width: `${squad.registered ? Math.round((squad.active / squad.registered) * 100) : 0}%` }} />
                  </div>
                  <small>{squad.distance.toFixed(1)} km · {squad.xp} XP · {squad.awaiting} waiting</small>
                </button>
              ))}
            </div>
          </section>
        ) : null}

        {adminSquad !== "all" && selectedSquadStats() ? (
          <section className="admin-card admin-selected-squad-card">
            <h2>{selectedSquadStats().label} Details</h2>

            <div className="admin-squad-detail-grid">
              <div>
                <strong>{selectedSquadStats().registered}</strong>
                <span>Players</span>
              </div>

              <div>
                <strong>{selectedSquadStats().active}</strong>
                <span>Active</span>
              </div>

              <div>
                <strong>{selectedSquadStats().completions}</strong>
                <span>Approved</span>
              </div>

              <div>
                <strong>{selectedSquadStats().awaiting}</strong>
                <span>Awaiting Approval</span>
              </div>

              <div>
                <strong>{selectedSquadStats().runs}</strong>
                <span>Runs</span>
              </div>

              <div>
                <strong>{selectedSquadStats().distance.toFixed(1)} km</strong>
                <span>Distance</span>
              </div>
            </div>

            <div className="admin-squad-detail-actions">
              <button className="button secondary" onClick={() => setActiveTab("players")}>
                View Players
              </button>

              <button className="button secondary" onClick={() => setActiveTab("approvals")}>
                View Approvals
              </button>

              <button className="button secondary" onClick={() => setActiveTab("leaderboard")}>
                View Leaderboard
              </button>
            </div>
          </section>
        ) : null}

        <section className="admin-card">
          <h2>Activity Feed</h2>

          <div className="admin-feed-list">
            {[...filteredCompletions, ...filteredRuns]
              .sort((a, b) => new Date(b.completed_at || b.saved_at || 0) - new Date(a.completed_at || a.saved_at || 0))
              .slice(0, 10)
              .map((item, index) => {
                const player = playerById(item.player_id);
                const activity = item.activity_id ? activityById(item.activity_id) : null;

                return (
                  <div className="admin-feed-row" key={`${item.id}-${index}`}>
                    <span>{item.run_type ? "🏃" : item.status === "awaiting_approval" ? "🔔" : "✅"}</span>
                    <div>
                      <strong>{player.name || item.player_name || "Unknown"}</strong>
                      <small>
                        {item.run_type
                          ? `${item.label || "Run"} · ${num(item.distance_km).toFixed(2)} km`
                          : `${activity?.title || item.completion_type} · ${statusLabel(item.status)}`}
                      </small>
                    </div>
                    <em>{dateTime(item.completed_at || item.saved_at)}</em>
                  </div>
                );
              })}
          </div>
        </section>
      </div>
    );
  }

  function renderApprovals() {
    return (
      <div className="admin-panel">
        <section className="admin-card">
          <h2>Approvals Queue</h2>

          {pendingApprovals.length ? (
            <div className="admin-approval-list">
              {pendingApprovals.map(item => {
                const player = playerById(item.player_id);
                const activity = activityById(item.activity_id);
                const run = runs.find(row => row.player_id === item.player_id && row.task_key === item.activity_id);

                return (
                  <div className="admin-approval-card" key={item.id}>
                    <div>
                      <strong>{player.name || "Unknown player"}</strong>
                      <p>
                        {item.completion_type === "bonus_approval"
                          ? "Friday Night Hurling"
                          : "Squad Session"}
                      </p>
                      <small>{displaySquad(player.squad_key)} · {dateTime(item.completed_at)}</small>
                    </div>

                    {run ? (
                      <button className="button secondary" onClick={() => setDetailModal({ type: "run", run })}>
                        View Run
                      </button>
                    ) : null}

                    <div className="admin-approval-actions">
                      <button className="button primary" onClick={() => approveCompletion(item)}>
                        Approve
                      </button>

                      <button className="button secondary" onClick={() => rejectCompletion(item)}>
                        Reject
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="admin-empty-help">
              <p className="muted">No pending approvals. Items appear here when status is awaiting_approval.</p>
              <small>
                Test it by submitting Squad Session or Friday Night Hurling from a parent/child account.
              </small>
            </div>
          )}
        </section>
      </div>
    );
  }

  function renderPlayers() {
    return (
      <div className="admin-panel">
        <section className="admin-card">
          <h2>Add Player</h2>

          <form
            className="admin-add-player"
            onSubmit={event => {
              event.preventDefault();
              addPlayer(new FormData(event.currentTarget));
              event.currentTarget.reset();
            }}
          >
            <input className="input" name="name" placeholder="Player name" />

            <select className="select" name="squad_key" defaultValue={adminSquad === "all" ? "" : adminSquad}>
              <option value="">Choose squad</option>
              {SQUADS.filter(item => item.key !== "all").map(item => (
                <option key={item.key} value={item.key}>
                  {item.label}
                </option>
              ))}
            </select>

            <button className="button primary">Add Player</button>
          </form>
        </section>

        <section className="admin-card">
          <h2>Players</h2>

          <div className="admin-player-list">
            {filteredPlayers.map(player => {
              const playerXp = playerXpFor(player);
              const playerDistance = playerDistanceFor(player);

              return (
                <button key={player.id} className="admin-player-row" onClick={() => setSelectedPlayer(player)}>
                  <span>{initials(player.name)}</span>
                  <div>
                    <strong>{player.name}</strong>
                    <small>
                      {displaySquad(player.squad_key)} · {playerXp} XP · {playerDistance.toFixed(1)} km
                    </small>
                  </div>
                  <em>Manage</em>
                </button>
              );
            })}
          </div>
        </section>

        {selectedPlayer ? renderPlayerDrawer(selectedPlayer) : null}
      </div>
    );
  }

  function renderPlayerDrawer(player) {
    const playerRuns = playerRunsFor(player);
    const playerCompletions = playerCompletionsFor(player);
    const playerXp = playerXpFor(player);
    const playerDistance = playerDistanceFor(player);
    const playerCompleted = playerCompletedCountFor(player);
    const playerRunCount = playerRunCountFor(player);

    return (
      <div className="admin-player-drawer">
        <button className="admin-drawer-close" onClick={() => setSelectedPlayer(null)}>
          ×
        </button>

        <div className="admin-player-drawer-head">
          <span>{initials(player.name)}</span>
          <div>
            <h2>{player.name}</h2>
            <p>{displaySquad(player.squad_key)} · {playerXp} XP</p>
          </div>
        </div>

        <div className="admin-player-mini-stats">
          <div>
            <strong>{playerCompleted}</strong>
            <span>Completed</span>
          </div>
          <div>
            <strong>{playerRunCount}</strong>
            <span>Completed Runs</span>
          </div>
          <div>
            <strong>{playerDistance.toFixed(1)} km</strong>
            <span>Player Distance</span>
          </div>
        </div>

        <div className="admin-adjust-card">
          <h3>Coach Actions</h3>

          <button className="button primary" onClick={() => { setCoachPlayer(player); setCoachWeek(currentChallengeWeek); }}>
            View / Edit as Player
          </button>

          <form
            onSubmit={event => {
              event.preventDefault();
              const formData = new FormData(event.currentTarget);
              addPoints(player, formData.get("xp"), formData.get("reason") || "Admin adjustment");
              event.currentTarget.reset();
            }}
          >
            <input className="input" name="xp" type="number" placeholder="+3 or -3" />
            <input className="input" name="reason" placeholder="Reason" />
            <button className="button secondary">Save Points</button>
          </form>
        </div>

        <div className="admin-drawer-section">
          <h3>Saved Runs</h3>

          {playerRuns.length ? (
            playerRuns.map(run => (
              <div className="admin-run-row" key={run.id}>
                <div>
                  <strong>{run.label || "Run"}</strong>
                  <small>{run.run_type} · {num(run.distance_km).toFixed(2)} km · {dateTime(run.saved_at)}</small>
                </div>

                <div className="admin-row-actions">
                  <button className="button secondary" onClick={() => setDetailModal({ type: "run", run })}>
                    View
                  </button>

                  <button className="button secondary danger-button" onClick={() => adminDeleteRun(run)}>
                    Remove
                  </button>
                </div>
              </div>
            ))
          ) : (
            <p className="muted">No runs saved.</p>
          )}
        </div>

        <div className="admin-drawer-section">
          <h3>Activity History</h3>

          {playerCompletions.length ? (
            playerCompletions.map(item => {
              const activity = activityById(item.activity_id);

              return (
                <div className="admin-run-row" key={item.id}>
                  <div>
                    <strong>{activity.title || item.completion_type}</strong>
                    <small>{statusLabel(item.status)} · {dateTime(item.completed_at)}</small>
                  </div>

                  {isPendingApproval(item) ? (
                    <button className="button primary" onClick={() => approveCompletion(item)}>
                      Approve
                    </button>
                  ) : null}
                </div>
              );
            })
          ) : (
            <p className="muted">No activity yet.</p>
          )}
        </div>

        <button className="button secondary danger-button" onClick={() => removePlayer(player)}>
          Remove Player
        </button>
      </div>
    );
  }

  function renderPlans() {
    return (
      <div className="admin-panel">
        <section className="admin-card">
          <div className="admin-section-title-row">
            <h2>Plan Editor</h2>
            <button
              type="button"
              className="admin-info-pill"
              onClick={() =>
                alert("Edit the current weekly plan here. The cards are shown in the same order players see them: runs, speed, football, hurling/camogie, squad session, bonus. Click Edit, update the fields, then Save. You will be asked to confirm before the change is written.")
              }
            >
              ⓘ How to edit
            </button>
          </div>

          <p className="muted admin-plan-note">
            Displayed in player order. Click Edit to change titles, targets, videos or skill cards.
          </p>

          <div className="admin-plan-toolbar">
            <label>
              Week
              <select className="select" value={planWeek} onChange={event => setPlanWeek(event.target.value)}>
                {[1, 2, 3, 4, 5, 6, 7, 8].map(week => (
                  <option key={week} value={week}>Week {week}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="admin-plan-card-grid">
            {planActivities.map(activity => (
              <div className="admin-plan-card" key={activity.id}>
                <span>
                  {isRunActivity(activity)
                    ? "🏃"
                    : activity.activity_key === "football-skill"
                      ? "⚽"
                      : activity.activity_key === "hurling-skill"
                        ? "🏑"
                        : activity.activity_key === "bonus"
                          ? "⭐"
                          : "🎯"}
                </span>

                <div>
                  <strong>{activity.title}</strong>
                  <small>{displaySquad(activity.squad_key)} · {activity.section}</small>
                  {activity.target_value ? (
                    <em>{activity.target_value} {activity.target_unit}</em>
                  ) : null}
                </div>

                <button className="button secondary" onClick={() => setEditingActivity(activity)}>
                  Edit
                </button>
              </div>
            ))}
          </div>
        </section>

        {editingActivity ? renderEditActivityModal() : null}
      </div>
    );
  }

  function renderEditActivityModal() {
    return (
      <div className="admin-edit-backdrop" onClick={() => setEditingActivity(null)}>
        <form
          className="admin-edit-modal"
          onClick={event => event.stopPropagation()}
          onSubmit={event => {
            event.preventDefault();
            saveActivity(editingActivity, new FormData(event.currentTarget));
          }}
        >
          <button className="admin-drawer-close" type="button" onClick={() => setEditingActivity(null)}>
            ×
          </button>

          <h2>Edit Activity</h2>

          <label className="label">Title</label>
          <input className="input" name="title" defaultValue={editingActivity.title || ""} />

          <label className="label">Section</label>
          <input className="input" name="section" defaultValue={editingActivity.section || ""} />

          <label className="label">YouTube ID</label>
          <input className="input" name="youtube_id" defaultValue={editingActivity.youtube_id || ""} />

          <label className="label">Skill Card Title</label>
          <input className="input" name="skill_card_title" defaultValue={editingActivity.skill_card_title || ""} />

          <label className="label">Skill Card Path</label>
          <input className="input" name="skill_card_path" defaultValue={editingActivity.skill_card_path || ""} />

          <label className="label">Target Value</label>
          <input className="input" name="target_value" defaultValue={editingActivity.target_value || ""} />

          <label className="label">Target Unit</label>
          <input className="input" name="target_unit" defaultValue={editingActivity.target_unit || ""} />

          <button className="button primary">Save</button>
        </form>
      </div>
    );
  }

  function renderLeaderboard() {
    return (
      <div className="admin-panel">
        <div className="admin-leaderboard-actions">
          <button className="button primary" onClick={() => downloadNodeAsImage(leaderboardRef.current, "fingallians-leaderboard.png")}>
            Save Leaderboard Image
          </button>
        </div>

        <section className="admin-leaderboard-card" ref={leaderboardRef}>
          <div className="admin-leaderboard-header">
            <img src="/fingallians-crest.png" alt="" />
            <div>
              <h2>Fingallians Fitness Challenge</h2>
              <p>{displaySquad(adminSquad)} Leaderboard</p>
            </div>
          </div>

          <div className="admin-leaderboard-list">
            {leaderboard.map((row, index) => (
              <button
                type="button"
                className={`admin-leaderboard-row rank-${index + 1}`}
                key={row.player.id}
                onClick={() => setDetailModal({ type: "playerActivity", player: row.player })}
              >
                <span className="rank-number">{index + 1}</span>
                <span className="rank-avatar">{initials(row.player.name)}</span>

                <div>
                  <strong>{row.player.name}</strong>
                  <small>{displaySquad(row.player.squad_key)} · {row.completed} missions · {row.distance.toFixed(1)} km</small>
                </div>

                <em>{row.xp} XP</em>
              </button>
            ))}
          </div>
        </section>
      </div>
    );
  }

  function renderMigration() {
    if (!isSuperAdmin) {
      return (
        <div className="admin-panel">
          <section className="admin-card">
            <h2>Migration Audit</h2>
            <p className="muted">This view is only available to SuperAdmin.</p>
          </section>
        </div>
      );
    }

    const loginCount = filteredMigrationRows.filter(row => row.event === "login").length;
    const accountCount = filteredMigrationRows.filter(row => ["account_created", "password_created"].includes(row.event)).length;
    const childLinkCount = filteredMigrationRows.filter(row => row.event === "child_linked" || row.event === "child_removed").length;

    const statCards = [
      {
        key: "parents",
        icon: "👨‍👩‍👧",
        value: migratedParentEmails.size,
        label: "Parents seen",
      },
      {
        key: "accounts",
        icon: "🔐",
        value: accountCount,
        label: "Accounts created",
      },
      {
        key: "logins",
        icon: "✅",
        value: loginCount,
        label: "Logins",
      },
      {
        key: "children",
        icon: "🔗",
        value: childLinkCount,
        label: "Child activity",
      },
      {
        key: "today",
        icon: "📅",
        value: migrationTodayCount,
        label: "Events today",
      },
      {
        key: "all",
        icon: "🧾",
        value: filteredMigrationRows.length,
        label: "Total events",
      },
    ];

    return (
      <div className="admin-panel">
        <div className="admin-stat-grid migration-stat-grid">
          {statCards.map(card => (
            <button
              key={card.key}
              type="button"
              className={
                migrationFilter === card.key
                  ? "admin-stat-card migration-filter-card active"
                  : "admin-stat-card migration-filter-card"
              }
              onClick={() => {
                setMigrationFilter(card.key);
                setDetailModal({
                  type: "migrationList",
                  filter: card.key,
                  title: `${card.label} Audit Log`,
                });
              }}
            >
              <span>{card.icon}</span>
              <strong>{card.value}</strong>
              <small>{card.label}</small>
              <em className="migration-card-action">View full log →</em>
            </button>
          ))}
        </div>

        <section className="admin-card" ref={migrationListRef}>
          <div className="admin-section-title-row migration-title-row">
            <div>
              <h2>Migration Audit Trail</h2>
              <p className="muted">
                SuperAdmin-only view of parent logins, account creation and child linking events from the new shared app.
              </p>
            </div>

            {migrationFilter !== "all" ? (
              <button
                type="button"
                className="button secondary migration-clear-filter"
                onClick={() => setMigrationFilter("all")}
              >
                Show All
              </button>
            ) : null}
          </div>

          <p className="migration-filter-note">
            Showing <strong>{visibleMigrationRows.length}</strong> of <strong>{filteredMigrationRows.length}</strong> events.
          </p>

          <div className="admin-feed-list migration-feed-list">
            {visibleMigrationRows.length ? (
              visibleMigrationRows.map(row => {
                const details = row.details || {};
                const squad = details.squad_key || details.selected_squad || details.squadKey || "all squads";
                const childName = details.child_name || details.player_name || "";

                return (
                  <button
                    type="button"
                    className="admin-feed-row migration-feed-row"
                    key={row.id}
                    onClick={() => setDetailModal({ type: "migration", row })}
                  >
                    <span>
                      {row.event === "login"
                        ? "✅"
                        : row.event === "account_created" || row.event === "password_created"
                          ? "🔐"
                          : row.event === "child_linked" || row.event === "child_removed"
                            ? "🔗"
                            : "🧭"}
                    </span>
                    <div>
                      <strong>{row.parent_email || "Unknown parent"}</strong>
                      <small>
                        {row.event}
                        {childName ? ` · ${childName}` : ""}
                        {squad ? ` · ${squad}` : ""}
                      </small>
                    </div>
                    <em>{dateTime(row.created_at)}</em>
                  </button>
                );
              })
            ) : (
              <p className="muted">No migration audit events match this filter yet.</p>
            )}
          </div>
        </section>
      </div>
    );
  }

  function renderSettings() {
    return (
      <div className="admin-panel">
        <section className="admin-card">
          <h2>Admin Settings</h2>
          <p className="muted">
            Use All Squads for a club-wide view. Use a specific squad to filter all admin tools.
          </p>

          <button className="button secondary danger-button" onClick={onSignOut}>
            Sign Out
          </button>
        </section>
      </div>
    );
  }

  function renderDetailModal() {
    if (!detailModal) return null;

    if (typeof detailModal === "object" && detailModal.type === "migrationList") {
      const rows = migrationRowsForFilter(detailModal.filter || "all");

      return (
        <div className="admin-modal-backdrop" onClick={() => setDetailModal(null)}>
          <div className="admin-modal migration-list-modal" onClick={event => event.stopPropagation()}>
            <button className="admin-drawer-close" onClick={() => setDetailModal(null)}>×</button>

            <h2>{detailModal.title || "Migration Log"}</h2>
            <p className="muted">Full clickable audit log for this total. Click any row to see the exact event details.</p>

            <div className="admin-feed-list migration-feed-list migration-modal-feed-list">
              {rows.length ? (
                rows.map(row => {
                  const details = row.details || {};
                  const squad = details.squad_key || details.selected_squad || details.squadKey || "all squads";
                  const childName = details.child_name || details.player_name || "";

                  return (
                    <button
                      type="button"
                      className="admin-feed-row migration-feed-row"
                      key={row.id}
                      onClick={() => setDetailModal({ type: "migration", row })}
                    >
                      <span>
                        {row.event === "login"
                          ? "✅"
                          : row.event === "account_created" || row.event === "password_created"
                            ? "🔐"
                            : row.event === "child_linked" || row.event === "child_removed"
                              ? "🔗"
                              : "🧭"}
                      </span>
                      <div>
                        <strong>{row.parent_email || "Unknown parent"}</strong>
                        <small>
                          {row.event}
                          {childName ? ` · ${childName}` : ""}
                          {squad ? ` · ${squad}` : ""}
                        </small>
                      </div>
                      <em>{dateTime(row.created_at)}</em>
                    </button>
                  );
                })
              ) : (
                <p className="muted">No migration audit events match this total yet.</p>
              )}
            </div>
          </div>
        </div>
      );
    }

    if (typeof detailModal === "object" && detailModal.type === "migration") {
      const row = detailModal.row || {};
      const details = row.details || {};
      const detailEntries = Object.entries(details).filter(([, value]) => value !== null && value !== undefined && value !== "");

      return (
        <div className="admin-modal-backdrop" onClick={() => setDetailModal(null)}>
          <div className="admin-modal migration-detail-modal" onClick={event => event.stopPropagation()}>
            <button className="admin-drawer-close" onClick={() => setDetailModal(null)}>×</button>

            <h2>Migration Event</h2>

            <div className="migration-detail-card">
              <span>
                {row.event === "login"
                  ? "✅"
                  : row.event === "account_created" || row.event === "password_created"
                    ? "🔐"
                    : row.event === "child_linked" || row.event === "child_removed"
                      ? "🔗"
                      : "🧭"}
              </span>
              <div>
                <strong>{row.parent_email || "Unknown parent"}</strong>
                <small>{row.event || "migration_event"} · {dateTime(row.created_at)}</small>
              </div>
            </div>

            <div className="migration-detail-list">
              <div>
                <strong>Email</strong>
                <small>{row.parent_email || "—"}</small>
              </div>
              <div>
                <strong>User ID</strong>
                <small>{row.parent_user_id || "—"}</small>
              </div>
              <div>
                <strong>Event</strong>
                <small>{row.event || "—"}</small>
              </div>
              <div>
                <strong>Time</strong>
                <small>{row.created_at ? new Date(row.created_at).toLocaleString() : "—"}</small>
              </div>
              {detailEntries.map(([key, value]) => (
                <div key={key}>
                  <strong>{key.replaceAll("_", " ")}</strong>
                  <small>{typeof value === "object" ? JSON.stringify(value) : String(value)}</small>
                </div>
              ))}
            </div>
          </div>
        </div>
      );
    }

    if (typeof detailModal === "object" && detailModal.type === "run") {
      const run = detailModal.run;

      return (
        <div className="admin-modal-backdrop" onClick={() => setDetailModal(null)}>
          <div className="admin-modal" onClick={event => event.stopPropagation()}>
            <button className="admin-drawer-close" onClick={() => setDetailModal(null)}>×</button>

            <h2>{run.label || "Run Card"}</h2>

            <div className="admin-run-proof-card">
              <span>🏃</span>
              <strong>{run.player_name}</strong>
              <p>{num(run.distance_km).toFixed(2)} km · {run.duration_min || "—"} mins</p>
              <small>{run.run_type} · {dateTime(run.saved_at)}</small>
            </div>

            {run.share_image_url ? (
              <img className="admin-run-proof-image" src={run.share_image_url} alt="Run proof" />
            ) : (
              <p className="muted">
                No stored screenshot image yet. The run record is saved and can still be reviewed here.
              </p>
            )}

            <button
              className="button secondary danger-button"
              onClick={async () => {
                const removed = await adminDeleteRun(run);
                if (removed) setDetailModal(null);
              }}
            >
              Remove Run
            </button>
          </div>
        </div>
      );
    }


    if (typeof detailModal === "object" && detailModal.type === "playerActivity") {
      const player = detailModal.player;
      const playerCompletions = playerCompletionsFor(player)
        .sort((a, b) => new Date(b.completed_at || 0) - new Date(a.completed_at || 0));

      const playerRuns = playerRunsFor(player)
        .sort((a, b) => new Date(b.saved_at || 0) - new Date(a.saved_at || 0));

      const playerXp = playerXpFor(player);
      const playerDistance = playerDistanceFor(player);
      const playerRunCount = playerRunCountFor(player);

      return (
        <div className="admin-modal-backdrop" onClick={() => setDetailModal(null)}>
          <div className="admin-modal admin-player-activity-modal" onClick={event => event.stopPropagation()}>
            <button className="admin-drawer-close" onClick={() => setDetailModal(null)}>×</button>

            <h2>{player.name}</h2>
            <p className="muted">{displaySquad(player.squad_key)} · {playerXp} XP</p>

            <div className="admin-player-activity-summary">
              <div>
                <strong>{playerCompletions.filter(isApproved).length}</strong>
                <span>Completed</span>
              </div>
              <div>
                <strong>{playerRunCount}</strong>
                <span>Completed Runs</span>
              </div>
              <div>
                <strong>{playerDistance.toFixed(1)} km</strong>
                <span>Distance</span>
              </div>
            </div>

            <div className="admin-drawer-section">
              <h3>Completed Activities</h3>
              {playerCompletions.length ? (
                playerCompletions.map(item => {
                  const activity = activityById(item.activity_id);

                  return (
                    <div className="admin-run-row" key={item.id}>
                      <div>
                        <strong>{activity.title || item.completion_type}</strong>
                        <small>{statusLabel(item.status)} · {dateTime(item.completed_at)}</small>
                      </div>
                    </div>
                  );
                })
              ) : (
                <p className="muted">No completed activities yet.</p>
              )}
            </div>

            <div className="admin-drawer-section">
              <h3>Saved Runs</h3>
              {playerRuns.length ? (
                playerRuns.map(run => (
                  <div className="admin-run-row" key={run.id}>
                    <div>
                      <strong>{run.label || "Run"}</strong>
                      <small>{run.run_type} · {num(run.distance_km).toFixed(2)} km · {dateTime(run.saved_at)}</small>
                    </div>

                    <button className="button secondary" onClick={() => setDetailModal({ type: "run", run })}>
                      View
                    </button>
                  </div>
                ))
              ) : (
                <p className="muted">No runs saved.</p>
              )}
            </div>
          </div>
        </div>
      );
    }

    let title = "";
    let rows = [];

    if (detailModal === "registered") {
      title = "Registered Players";
      rows = filteredPlayers.map(player => ({
        main: player.name,
        sub: displaySquad(player.squad_key),
      }));
    }

    if (detailModal === "active") {
      title = "Active Players";
      rows = filteredPlayers
        .filter(player => activePlayerIds.has(player.id))
        .map(player => ({
          main: player.name,
          sub: displaySquad(player.squad_key),
        }));
    }

    if (detailModal === "sessions") {
      title = "Logged Sessions";
      rows = [
        ...filteredCompletions.map(row => ({
          main: playerById(row.player_id).name || "Unknown player",
          sub: `${activityById(row.activity_id).title || row.completion_type} · ${statusLabel(row.status)}`,
        })),
        ...filteredRuns.map(row => ({
          main: row.player_name || playerById(row.player_id).name || "Unknown player",
          sub: `${row.label || "Run"} · ${num(row.distance_km).toFixed(2)} km`,
        })),
      ];
    }

    return (
      <div className="admin-modal-backdrop" onClick={() => setDetailModal(null)}>
        <div className="admin-modal" onClick={event => event.stopPropagation()}>
          <button className="admin-drawer-close" onClick={() => setDetailModal(null)}>×</button>

          <h2>{title}</h2>

          <div className="admin-detail-list">
            {rows.length ? (
              rows.map((row, index) => (
                <div className="admin-detail-row" key={`${row.main}-${index}`}>
                  <strong>{row.main}</strong>
                  <small>{row.sub}</small>
                </div>
              ))
            ) : (
              <p className="muted">No records found.</p>
            )}
          </div>
        </div>
      </div>
    );
  }

  async function adminDeleteRun(run) {
    if (!run?.id) return false;

    const ok = window.confirm(`Remove ${run.label || "this run"} for ${run.player_name || "this player"}?`);
    if (!ok) return false;

    const { error: runError } = await supabase
      .from("run_proofs")
      .delete()
      .eq("id", run.id);

    if (runError) {
      alert(runError.message);
      return false;
    }

    if (run.player_id && run.task_key) {
      await supabase
        .from("activity_completions")
        .delete()
        .eq("player_id", run.player_id)
        .eq("activity_id", run.task_key)
        .in("completion_type", ["manual", "gps"]);

      await supabase
        .from("xp_transactions")
        .delete()
        .eq("player_id", run.player_id)
        .eq("activity_id", run.task_key);
    }

    await loadAdminData();
    setCoachRefreshKey(current => current + 1);
    showToast("Run removed.");
    return true;
  }

  async function adminUnapproveCompletion(completion) {
    if (!completion?.id) return false;

    const ok = window.confirm("Move this approval back to Awaiting Approval and remove its XP?");
    if (!ok) return false;

    const { error: updateError } = await supabase
      .from("activity_completions")
      .update({
        status: "awaiting_approval",
        updated_at: new Date().toISOString(),
      })
      .eq("id", completion.id);

    if (updateError) {
      alert(updateError.message);
      return false;
    }

    await supabase
      .from("xp_transactions")
      .delete()
      .eq("player_id", completion.player_id)
      .eq("activity_id", completion.activity_id);

    await loadAdminData();
    showToast("Moved back to awaiting approval.");
    return true;
  }

  async function adminHandleRunSaved(result, player) {
    if (!player?.id) return false;

    const activity = activityById(result.activityId) || {
      id: result.activityId,
      title: result.title,
      activity_key: "fitness",
      target_unit: "km",
    };

    const { data: completion, error: completionError } = await supabase
      .from("activity_completions")
      .upsert(
        {
          player_id: player.id,
          activity_id: result.activityId,
          status: "completed",
          completion_type: result.type,
          gps_verified: result.type === "gps",
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "player_id,activity_id" }
      )
      .select()
      .single();

    if (completionError) {
      alert(completionError.message);
      return false;
    }

    const { error: runError } = await supabase.from("run_proofs").insert({
      squad: displaySquad(player.squad_key),
      squad_key: player.squad_key,
      player_id: player.id,
      player_name: player.name,
      task_key: result.activityId,
      week: 1,
      label: result.title,
      target: result.targetKm ? `${result.targetKm} km` : null,
      run_type: result.type,
      distance_km: result.distanceKm,
      duration_min: result.durationMin,
      pace_min_per_km:
        result.distanceKm > 0 && result.durationMin
          ? Number((result.durationMin / result.distanceKm).toFixed(2))
          : null,
      note: result.type === "gps" ? "Verified GPS run added by admin" : "Manual run entry added by admin",
      saved_at: result.savedAt || new Date().toISOString(),
      updated_at: new Date().toISOString(),
      has_screenshot: false,
      share_image_url: null,
    });

    if (runError) {
      alert(runError.message);
      return false;
    }

    const xp = xpForActivity(activity, result.type);

    await supabase
      .from("xp_transactions")
      .delete()
      .eq("player_id", player.id)
      .eq("activity_id", result.activityId);

    if (xp) {
      const { error: xpError } = await supabase.from("xp_transactions").insert({
        player_id: player.id,
        activity_id: result.activityId,
        activity_completion_id: completion?.id || null,
        xp,
        reason: result.title || activity.title || "Run added by admin",
        source: result.type || "admin_run",
      });

      if (xpError) {
        alert(xpError.message);
        return false;
      }
    }

    await loadAdminData();
    showToast(`Run saved${xp ? ` (+${xp} XP)` : ""}.`);
    return true;
  }

  async function adminCoachApprove(completion) {
    if (!completion) return false;

    if (completion.status === "completed") {
      showToast("Already approved.");
      return true;
    }

    const saved = await approveCompletion(completion);
    setCoachRefreshKey(current => current + 1);
    return saved;
  }

  async function adminCoachUnapprove(completion) {
    if (!completion) return false;

    const saved = await adminUnapproveCompletion(completion);

    if (saved) {
      setCoachRefreshKey(current => current + 1);
    }

    return saved;
  }

  async function adminCoachApproveActivity(activity, completion, player) {
    if (!player?.id || !activity?.id) return false;

    let approvalCompletion = completion;

    if (!approvalCompletion) {
      const { data, error } = await supabase
        .from("activity_completions")
        .insert({
          player_id: player.id,
          activity_id: activity.id,
          status: "awaiting_approval",
          completion_type: activity.activity_key === "bonus" ? "bonus_approval" : "squad_approval",
          gps_verified: false,
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) {
        alert(error.message);
        return false;
      }

      approvalCompletion = data;
    }

    const saved = await approveCompletion(approvalCompletion);

    if (saved) {
      setCoachRefreshKey(current => current + 1);
    }

    return saved;
  }

  async function adminCoachUnapproveActivity(activity, completion) {
    if (!coachPlayer?.id || !activity?.id) return false;

    const saved = await adminMarkActivityIncomplete(activity, completion, coachPlayer);

    if (saved) {
      setCoachRefreshKey(current => current + 1);
    }

    return saved;
  }

  async function adminMarkActivityIncomplete(activity, completion, player) {
    if (!player?.id || !activity?.id) {
      alert("Missing player or activity ID.");
      return false;
    }

    const ok = window.confirm(`Remove completion for "${activity.title}" from ${player.name}?`);
    if (!ok) return false;

    const { data, error } = await supabase.rpc("admin_debug_remove_player_activity", {
      target_player_id: player.id,
      target_activity_id: activity.id,
    });

    if (error) {
      console.error("admin_debug_remove_player_activity failed", error);
      alert(`Remove failed: ${error.message}`);
      return false;
    }

    await loadAdminData();
    setCoachRefreshKey(current => current + 1);

    const message = rpcDeleteSummary(data);
    showToast(`Remove result — ${message}`);

    if ((data?.deleted_completions || 0) === 0 && (data?.deleted_runs || 0) === 0 && (data?.deleted_xp || 0) === 0) {
      alert(`Nothing was removed. ${message}`);
    }

    return true;
  }

  async function adminRemoveCoachActivity(activity, player) {
    if (!player?.id || !activity?.id) {
      alert("Missing player or activity ID.");
      return false;
    }

    const ok = window.confirm(`Remove "${activity.title}" for ${player.name}? This will remove completions, run proof and XP for this activity.`);
    if (!ok) return false;

    const { data, error } = await supabase.rpc("admin_debug_remove_player_activity", {
      target_player_id: player.id,
      target_activity_id: activity.id,
    });

    if (error) {
      console.error("admin_debug_remove_player_activity failed", error);
      alert(`Remove failed: ${error.message}`);
      return false;
    }

    await loadAdminData();
    setCoachRefreshKey(current => current + 1);

    const summary = rpcDeleteSummary(data);
    showToast(`Remove result — ${summary}`);

    if ((data?.deleted_completions || 0) === 0 && (data?.deleted_runs || 0) === 0 && (data?.deleted_xp || 0) === 0) {
      alert(`Nothing was removed. ${summary}`);
    }

    return true;
  }

  function renderCoachMode() {
    if (!coachPlayer) return null;

    const playerCompletions = playerCompletionsFor(coachPlayer);
    const playerRuns = playerRunsFor(coachPlayer);
    const playerXp = playerXpFor(coachPlayer);
    const playerBadges = badges.filter(row => row.player_id === coachPlayer.id);
    const playerActivities = activities.filter(
      activity => activity.squad_key === coachPlayer.squad_key
    );

    return (
      <div className="coach-mode-backdrop" onClick={() => setCoachPlayer(null)}>
        <div className="coach-mode-modal" onClick={event => event.stopPropagation()}>
          <button className="admin-drawer-close" onClick={() => setCoachPlayer(null)}>×</button>

          <div className="coach-mode-header">
            <h2>Coach Mode</h2>
            <p>{coachPlayer.name} · {displaySquad(coachPlayer.squad_key)}</p>
          </div>

          <CoachPlayerView
            key={`${coachPlayer.id}-${coachRefreshKey}-${coachWeek}`}
            player={coachPlayer}
            squadLabel={displaySquad(coachPlayer.squad_key)}
            week={coachWeek}
            currentWeek={currentChallengeWeek}
            activities={playerActivities}
            completions={playerCompletions}
            runs={playerRuns}
            playerDistanceKm={playerDistanceFor(coachPlayer)}
            xpTotal={playerXp}
            badges={playerBadges}
            onChangeWeek={setCoachWeek}
            onAddRun={activity => setRunActivity(activity)}
            onRemoveActivity={activity =>
              adminRemoveCoachActivity(activity, coachPlayer)
            }
            onToggleActivity={async (activity, existingCompletion) => {
              const saved = await adminToggleActivity(activity, existingCompletion, coachPlayer);
              if (saved) setCoachRefreshKey(current => current + 1);
            }}
            onApproveActivity={(activity, completion) =>
              adminCoachApproveActivity(activity, completion, coachPlayer)
            }
            onUnapproveActivity={adminCoachUnapproveActivity}
          />

          {runActivity ? (
            <RunLoggerModal
              activity={runActivity}
              selectedPlayer={coachPlayer}
              manualOnly={true}
              onClose={() => setRunActivity(null)}
              onSaved={async result => {
                const saved = await adminHandleRunSaved(result, coachPlayer);
                if (saved) {
                  setRunActivity(null);
                  setCoachRefreshKey(current => current + 1);
                }
              }}
            />
          ) : null}
        </div>
      </div>
    );
  }

  function renderCurrentTab() {
    if (loading) return <div className="admin-card">Loading admin dashboard…</div>;
    if (activeTab === "overview") return renderOverview();
    if (activeTab === "approvals") return renderApprovals();
    if (activeTab === "players") return renderPlayers();
    if (activeTab === "plans") return renderPlans();
    if (activeTab === "leaderboard") return renderLeaderboard();
    if (activeTab === "migration") return renderMigration();
    return renderOverview();
  }

  return (
    <div className="admin-page">
      {toast ? <div className="app-toast">{toast}</div> : null}

      <section className="admin-control-bar">
        <div className="admin-control-title">
          <img src="/fingallians-crest.png" alt="" />
          <div>
            <strong>Fingallians Fitness Challenge</strong>
            <small>Admin Dashboard</small>
          </div>
        </div>

        <div className="admin-control-actions">
          {isSuperAdmin ? (
            <select
              className="select admin-squad-select"
              value={adminSquad}
              onChange={event => setAdminSquad(event.target.value)}
            >
              {visibleSquads.map(squad => (
                <option key={squad.key} value={squad.key}>
                  {squad.label}
                </option>
              ))}
            </select>
          ) : (
            <div className="admin-squad-label">{displaySquad(adminSquad)}</div>
          )}

          <button className="admin-bell-button admin-icon-button" onClick={() => setActiveTab("approvals")} aria-label="Approvals">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 22a2.7 2.7 0 0 0 2.6-2h-5.2A2.7 2.7 0 0 0 12 22Zm7-6V11a7 7 0 0 0-5-6.7V3a2 2 0 0 0-4 0v1.3A7 7 0 0 0 5 11v5l-2 2v1h18v-1l-2-2Z"/></svg>
            {pendingApprovals.length ? <em>{pendingApprovals.length}</em> : null}
          </button>

          <button className="admin-signout-link admin-icon-button" onClick={onSignOut} aria-label="Sign out">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3h9a2 2 0 0 1 2 2v3h-2V5H7v14h7v-3h2v3a2 2 0 0 1-2 2H5V3Zm11.6 5.4L20.2 12l-3.6 3.6-1.4-1.4 1.2-1.2H10v-2h6.4l-1.2-1.2 1.4-1.4Z"/></svg>
          </button>
        </div>
      </section>

      <nav className="admin-tabs">
        {ADMIN_TABS
          .filter(tab => !tab.superAdminOnly || isSuperAdmin)
          .sort((a, b) => (a.key === "migration" ? 1 : 0) - (b.key === "migration" ? 1 : 0))
          .map(tab => (
          <button
            key={tab.key}
            className={activeTab === tab.key ? "active" : ""}
            onClick={() => setActiveTab(tab.key)}
          >
            <span>{tab.icon}</span>
            <small>{tab.label}</small>

            {tab.key === "approvals" && pendingApprovals.length ? (
              <em>{pendingApprovals.length}</em>
            ) : null}
          </button>
        ))}
      </nav>

      {renderCurrentTab()}
      {renderDetailModal()}
      {renderCoachMode()}
    </div>
  );
}
