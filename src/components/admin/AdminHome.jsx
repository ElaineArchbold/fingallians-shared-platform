import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../../lib/supabaseClient";

const SQUADS = [
  { key: "all", label: "All Squads" },
  { key: "2014-boys", label: "2014 Boys" },
  { key: "2015-girls", label: "2015 Girls" },
  { key: "2017-boys", label: "2017 Boys" },
  { key: "2017-girls", label: "2017 Girls" },
];

const ADMIN_TABS = [
  { key: "dashboard", label: "Dashboard", icon: "📊" },
  { key: "approvals", label: "Approvals", icon: "🔔" },
  { key: "leaderboard", label: "Leaderboard", icon: "🏆" },
  { key: "players", label: "Players", icon: "👧" },
  { key: "plans", label: "Plans", icon: "🗓️" },
  { key: "progress", label: "Squad Progress", icon: "📈" },
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

function number(value) {
  return Number(value || 0);
}

function dateText(value) {
  if (!value) return "—";

  try {
    return new Date(value).toLocaleDateString([], {
      day: "2-digit",
      month: "short",
    });
  } catch {
    return "—";
  }
}

function timeText(value) {
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

function isApproved(completion) {
  return completion.status === "completed";
}

function isPendingApproval(completion) {
  return completion.status === "awaiting_approval";
}

function isRunActivity(activity) {
  const title = String(activity?.title || "").toLowerCase();

  return activity?.target_unit === "km" || title.includes("run") || activity?.gps_preferred;
}

function defaultXpFor(activity, source) {
  const title = String(activity?.title || "").toLowerCase();
  const run = isRunActivity(activity) || source === "gps" || source === "manual";

  if (run) return 3;

  if (
    activity?.activity_key === "running-technique" ||
    activity?.activity_key === "football-skill" ||
    activity?.activity_key === "hurling-skill"
  ) {
    return 2;
  }

  if (activity?.activity_key === "squad-session") return 3;
  if (activity?.activity_key === "bonus") return 0;

  return 1;
}

function downloadElementAsPng(element, filename) {
  if (!element) return;

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${element.offsetWidth}" height="${element.offsetHeight}">
      <foreignObject width="100%" height="100%">
        <div xmlns="http://www.w3.org/1999/xhtml">
          ${element.outerHTML}
        </div>
      </foreignObject>
    </svg>
  `;

  const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  link.click();

  setTimeout(() => URL.revokeObjectURL(url), 500);
}

export default function AdminHome({ squadConfig, isSuperAdmin }) {
  const [activeTab, setActiveTab] = useState("dashboard");
  const [adminSquad, setAdminSquad] = useState(squadConfig?.key || "all");
  const [loading, setLoading] = useState(true);
  const [players, setPlayers] = useState([]);
  const [completions, setCompletions] = useState([]);
  const [xpRows, setXpRows] = useState([]);
  const [runs, setRuns] = useState([]);
  const [badges, setBadges] = useState([]);
  const [activities, setActivities] = useState([]);
  const [termsRows, setTermsRows] = useState([]);
  const [detailModal, setDetailModal] = useState(null);
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [planWeek, setPlanWeek] = useState(1);
  const [editingActivity, setEditingActivity] = useState(null);
  const [toast, setToast] = useState("");

  const leaderboardRef = useRef(null);

  const visibleSquads = isSuperAdmin ? SQUADS : SQUADS.filter(item => item.key === squadConfig.key);

  const filteredPlayers = useMemo(() => {
    if (adminSquad === "all") return players;
    return players.filter(player => player.squad_key === adminSquad);
  }, [players, adminSquad]);

  const filteredPlayerIds = useMemo(() => {
    return new Set(filteredPlayers.map(player => player.id));
  }, [filteredPlayers]);

  const filteredCompletions = completions.filter(row => filteredPlayerIds.has(row.player_id));
  const filteredXpRows = xpRows.filter(row => filteredPlayerIds.has(row.player_id));
  const filteredRuns = runs.filter(row => filteredPlayerIds.has(row.player_id));
  const filteredBadges = badges.filter(row => filteredPlayerIds.has(row.player_id));
  const filteredTermsRows = termsRows.filter(row => {
    if (adminSquad === "all") return true;
    return row.squad_key === adminSquad;
  });

  const activePlayerIds = new Set([
    ...filteredCompletions.map(row => row.player_id),
    ...filteredRuns.map(row => row.player_id),
  ]);

  const pendingApprovals = filteredCompletions.filter(isPendingApproval);

  const leaderboard = filteredPlayers
    .map(player => {
      const xp = filteredXpRows
        .filter(row => row.player_id === player.id)
        .reduce((total, row) => total + number(row.xp), 0);

      const completed = filteredCompletions.filter(
        row => row.player_id === player.id && isApproved(row)
      ).length;

      const awaiting = filteredCompletions.filter(
        row => row.player_id === player.id && isPendingApproval(row)
      ).length;

      const distance = filteredRuns
        .filter(row => row.player_id === player.id)
        .reduce((total, row) => total + number(row.distance_km), 0);

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

  const squadProgress = SQUADS.filter(squad => squad.key !== "all").map(squad => {
    const squadPlayers = players.filter(player => player.squad_key === squad.key);
    const squadIds = new Set(squadPlayers.map(player => player.id));
    const squadCompletions = completions.filter(row => squadIds.has(row.player_id));
    const squadRuns = runs.filter(row => squadIds.has(row.player_id));
    const squadXp = xpRows
      .filter(row => squadIds.has(row.player_id))
      .reduce((total, row) => total + number(row.xp), 0);

    return {
      ...squad,
      players: squadPlayers.length,
      active: new Set([
        ...squadCompletions.map(row => row.player_id),
        ...squadRuns.map(row => row.player_id),
      ]).size,
      completions: squadCompletions.filter(isApproved).length,
      awaiting: squadCompletions.filter(isPendingApproval).length,
      runs: squadRuns.length,
      distance: squadRuns.reduce((total, row) => total + number(row.distance_km), 0),
      xp: squadXp,
    };
  });

  const planActivities = activities
    .filter(activity => adminSquad === "all" || activity.squad_key === adminSquad)
    .filter(activity => Number(activity.week_number || 1) === Number(planWeek))
    .sort((a, b) => {
      const aKey = `${a.squad_key}-${a.section}-${a.title}`;
      const bKey = `${b.squad_key}-${b.section}-${b.title}`;
      return aKey.localeCompare(bKey);
    });

  useEffect(() => {
    if (!isSuperAdmin && squadConfig?.key) {
      setAdminSquad(squadConfig.key);
    }
  }, [isSuperAdmin, squadConfig?.key]);

  useEffect(() => {
    loadAdminData();
  }, []);

  useEffect(() => {
    const channel = supabase
      .channel("admin-dashboard-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "activity_completions" }, loadAdminData)
      .on("postgres_changes", { event: "*", schema: "public", table: "run_proofs" }, loadAdminData)
      .on("postgres_changes", { event: "*", schema: "public", table: "xp_transactions" }, loadAdminData)
      .on("postgres_changes", { event: "*", schema: "public", table: "players" }, loadAdminData)
      .on("postgres_changes", { event: "*", schema: "public", table: "weekly_activities" }, loadAdminData)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  async function loadAdminData() {
    setLoading(true);

    const [
      playersResult,
      completionsResult,
      xpResult,
      runsResult,
      badgesResult,
      activitiesResult,
      termsResult,
    ] = await Promise.all([
      supabase.from("players").select("*").order("squad_key").order("name"),
      supabase.from("activity_completions").select("*").order("completed_at", { ascending: false }),
      supabase.from("xp_transactions").select("*").order("created_at", { ascending: false }),
      supabase.from("run_proofs").select("*").order("saved_at", { ascending: false }),
      supabase.from("player_badges").select("*").order("earned_at", { ascending: false }),
      supabase.from("weekly_activities").select("*").order("week_number").order("section"),
      supabase.from("terms_acceptances").select("*").order("accepted_at", { ascending: false }),
    ]);

    if (playersResult.error) console.error(playersResult.error);
    if (completionsResult.error) console.error(completionsResult.error);
    if (xpResult.error) console.error(xpResult.error);
    if (runsResult.error) console.error(runsResult.error);
    if (badgesResult.error) console.error(badgesResult.error);
    if (activitiesResult.error) console.error(activitiesResult.error);
    if (termsResult.error) console.error(termsResult.error);

    setPlayers(playersResult.data || []);
    setCompletions(completionsResult.data || []);
    setXpRows(xpResult.data || []);
    setRuns(runsResult.data || []);
    setBadges(badgesResult.data || []);
    setActivities(activitiesResult.data || []);
    setTermsRows(termsResult.data || []);
    setLoading(false);
  }

  function showToast(message) {
    setToast(message);
    setTimeout(() => setToast(""), 2600);
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
    const ok = window.confirm(`Remove ${player.name}? This will delete their player record.`);
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
    const activity = activities.find(item => item.id === completion.activity_id);
    const xp = defaultXpFor(activity, completion.completion_type);

    const { error: updateError } = await supabase
      .from("activity_completions")
      .update({
        status: "completed",
        approved_at: new Date().toISOString(),
      })
      .eq("id", completion.id);

    if (updateError) {
      alert(updateError.message);
      return;
    }

    if (xp) {
      await supabase.from("xp_transactions").insert({
        player_id: completion.player_id,
        activity_id: completion.activity_id,
        activity_completion_id: completion.id,
        xp,
        reason: activity?.title || "Approved activity",
        source: completion.completion_type || "approval",
      });
    }

    showToast("Approved.");
    loadAdminData();
  }

  async function rejectCompletion(completion) {
    const ok = window.confirm("Reject and remove this pending approval?");
    if (!ok) return;

    const { error } = await supabase
      .from("activity_completions")
      .delete()
      .eq("id", completion.id);

    if (error) {
      alert(error.message);
      return;
    }

    showToast("Rejected.");
    loadAdminData();
  }

  async function saveActivity(activity, formData) {
    const updates = {
      title: formData.get("title")?.toString() || activity.title,
      section: formData.get("section")?.toString() || activity.section,
      youtube_id: formData.get("youtube_id")?.toString() || null,
      skill_card_path: formData.get("skill_card_path")?.toString() || null,
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
    loadAdminData();
  }

  function openDetail(type) {
    setDetailModal(type);
  }

  function playerById(id) {
    return players.find(player => player.id === id) || {};
  }

  function activityById(id) {
    return activities.find(activity => activity.id === id) || {};
  }

  function renderDashboard() {
    const registered = filteredPlayers.length;
    const active = activePlayerIds.size;
    const sessionsLogged = filteredCompletions.length + filteredRuns.length;
    const childLinkUsers = new Set(filteredTermsRows.map(row => row.user_id)).size;

    return (
      <div className="admin-panel">
        <div className="admin-stat-grid">
          <button className="admin-stat-card" onClick={() => openDetail("registered")}>
            <span>👧</span>
            <strong>{registered}</strong>
            <small>Registered Players</small>
          </button>

          <button className="admin-stat-card" onClick={() => openDetail("active")}>
            <span>🔥</span>
            <strong>{active}</strong>
            <small>Active Players</small>
          </button>

          <button className="admin-stat-card" onClick={() => openDetail("sessions")}>
            <span>✅</span>
            <strong>{sessionsLogged}</strong>
            <small>Sessions Logged</small>
          </button>

          <button className="admin-stat-card" onClick={() => openDetail("childLinks")}>
            <span>🔗</span>
            <strong>{childLinkUsers}</strong>
            <small>Child Link Users</small>
          </button>

          <button className="admin-stat-card urgent" onClick={() => setActiveTab("approvals")}>
            <span>🔔</span>
            <strong>{pendingApprovals.length}</strong>
            <small>Pending Approvals</small>
          </button>

          <button className="admin-stat-card" onClick={() => openDetail("unregistered")}>
            <span>🕵️</span>
            <strong>{Math.max(0, filteredPlayers.length - filteredTermsRows.length)}</strong>
            <small>Not Yet Registered</small>
          </button>
        </div>

        <section className="admin-card">
          <h2>Admin Notifications</h2>

          {pendingApprovals.length ? (
            <div className="admin-notification-list">
              {pendingApprovals.slice(0, 5).map(item => {
                const player = playerById(item.player_id);
                const activity = activityById(item.activity_id);

                return (
                  <button
                    key={item.id}
                    className="admin-notification-row"
                    onClick={() => setActiveTab("approvals")}
                  >
                    <span>🔔</span>
                    <div>
                      <strong>{player.name || "Unknown player"}</strong>
                      <small>{activity.title || item.completion_type} · {displaySquad(player.squad_key)}</small>
                    </div>
                    <em>Review</em>
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="muted">No approvals waiting.</p>
          )}
        </section>

        <section className="admin-card">
          <h2>Squad Snapshot</h2>

          <div className="admin-squad-grid">
            {squadProgress.map(squad => (
              <div className="admin-squad-card" key={squad.key}>
                <strong>{squad.label}</strong>
                <span>{squad.active}/{squad.players} active</span>
                <div className="admin-progress-track">
                  <div style={{ width: `${squad.players ? Math.round((squad.active / squad.players) * 100) : 0}%` }} />
                </div>
                <small>{squad.distance.toFixed(1)} km · {squad.xp} XP</small>
              </div>
            ))}
          </div>
        </section>
      </div>
    );
  }

  function renderApprovals() {
    return (
      <div className="admin-panel">
        <section className="admin-card">
          <h2>Pending Approvals</h2>

          {pendingApprovals.length ? (
            <div className="admin-approval-list">
              {pendingApprovals.map(item => {
                const player = playerById(item.player_id);
                const activity = activityById(item.activity_id);

                return (
                  <div className="admin-approval-card" key={item.id}>
                    <div>
                      <strong>{player.name || "Unknown player"}</strong>
                      <p>{activity.title || item.completion_type}</p>
                      <small>
                        {displaySquad(player.squad_key)} · {timeText(item.completed_at)}
                      </small>
                    </div>

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
            <p className="muted">No pending approvals.</p>
          )}
        </section>
      </div>
    );
  }

  function renderLeaderboard() {
    return (
      <div className="admin-panel">
        <div className="admin-leaderboard-actions">
          <button
            className="button primary"
            onClick={() => downloadElementAsPng(leaderboardRef.current, "fingallians-leaderboard.png")}
          >
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
              <div className={`admin-leaderboard-row rank-${index + 1}`} key={row.player.id}>
                <span className="rank-number">{index + 1}</span>
                <span className="rank-avatar">{initials(row.player.name)}</span>

                <div>
                  <strong>{row.player.name}</strong>
                  <small>
                    {displaySquad(row.player.squad_key)} · {row.completed} missions · {row.distance.toFixed(1)} km
                  </small>
                </div>

                <em>{row.xp} XP</em>
              </div>
            ))}
          </div>
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
              const playerXp = filteredXpRows
                .filter(row => row.player_id === player.id)
                .reduce((total, row) => total + number(row.xp), 0);

              return (
                <button
                  key={player.id}
                  className="admin-player-row"
                  onClick={() => setSelectedPlayer(player)}
                >
                  <span>{initials(player.name)}</span>
                  <div>
                    <strong>{player.name}</strong>
                    <small>{displaySquad(player.squad_key)} · {playerXp} XP</small>
                  </div>
                  <em>View</em>
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
    const playerRuns = runs.filter(run => run.player_id === player.id);
    const playerCompletions = completions.filter(row => row.player_id === player.id);
    const playerXpRows = xpRows.filter(row => row.player_id === player.id);
    const playerXp = playerXpRows.reduce((total, row) => total + number(row.xp), 0);

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

        <div className="admin-adjust-card">
          <h3>Add / Remove Points</h3>

          <form
            onSubmit={event => {
              event.preventDefault();
              const formData = new FormData(event.currentTarget);
              addPoints(
                player,
                formData.get("xp"),
                formData.get("reason")?.toString() || "Admin adjustment"
              );
              event.currentTarget.reset();
            }}
          >
            <input className="input" name="xp" type="number" placeholder="e.g. 3 or -3" />
            <input className="input" name="reason" placeholder="Reason" />
            <button className="button primary">Save Points</button>
          </form>
        </div>

        <div className="admin-drawer-section">
          <h3>Saved Runs</h3>

          {playerRuns.length ? (
            playerRuns.map(run => (
              <div className="admin-run-row" key={run.id}>
                <div>
                  <strong>{run.label || "Run"}</strong>
                  <small>
                    {run.run_type} · {number(run.distance_km).toFixed(2)} km · {timeText(run.saved_at)}
                  </small>
                </div>

                <button className="button secondary" onClick={() => setDetailModal({ type: "run", run })}>
                  View Card
                </button>
              </div>
            ))
          ) : (
            <p className="muted">No runs saved.</p>
          )}
        </div>

        <div className="admin-drawer-section">
          <h3>Activity Log</h3>

          {playerCompletions.length ? (
            playerCompletions.map(item => {
              const activity = activityById(item.activity_id);

              return (
                <div className="admin-run-row" key={item.id}>
                  <div>
                    <strong>{activity.title || item.completion_type}</strong>
                    <small>{item.status} · {timeText(item.completed_at)}</small>
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
            <p className="muted">No activity logged.</p>
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
          <h2>Plan Editor</h2>

          <div className="admin-plan-toolbar">
            <label>
              Week
              <select className="select" value={planWeek} onChange={event => setPlanWeek(event.target.value)}>
                {[1, 2, 3, 4, 5, 6, 7, 8].map(week => (
                  <option key={week} value={week}>
                    Week {week}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="admin-plan-list">
            {planActivities.map(activity => (
              <div className="admin-plan-row" key={activity.id}>
                <div>
                  <strong>{activity.title}</strong>
                  <small>
                    {displaySquad(activity.squad_key)} · {activity.section} · {activity.activity_key}
                  </small>
                </div>

                <button className="button secondary" onClick={() => setEditingActivity(activity)}>
                  Edit
                </button>
              </div>
            ))}
          </div>
        </section>

        {editingActivity ? (
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

              <label className="label">Skill Card Path</label>
              <input className="input" name="skill_card_path" defaultValue={editingActivity.skill_card_path || ""} />

              <label className="label">Target Value</label>
              <input className="input" name="target_value" defaultValue={editingActivity.target_value || ""} />

              <label className="label">Target Unit</label>
              <input className="input" name="target_unit" defaultValue={editingActivity.target_unit || ""} />

              <button className="button primary">Save Activity</button>
            </form>
          </div>
        ) : null}
      </div>
    );
  }

  function renderProgress() {
    return (
      <div className="admin-panel">
        <section className="admin-card">
          <h2>Overall Squad Progress</h2>

          <div className="admin-squad-progress-list">
            {squadProgress.map(squad => (
              <div className="admin-squad-progress-row" key={squad.key}>
                <div>
                  <strong>{squad.label}</strong>
                  <small>
                    {squad.active}/{squad.players} active · {squad.completions} completions · {squad.runs} runs
                  </small>
                </div>

                <div className="admin-progress-track">
                  <div style={{ width: `${squad.players ? Math.round((squad.active / squad.players) * 100) : 0}%` }} />
                </div>

                <em>{squad.distance.toFixed(1)} km</em>
              </div>
            ))}
          </div>
        </section>
      </div>
    );
  }

  function renderDetailModal() {
    if (!detailModal) return null;

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
              <p>{number(run.distance_km).toFixed(2)} km · {run.duration_min || "—"} mins</p>
              <small>{run.run_type} · {timeText(run.saved_at)}</small>
            </div>

            {run.share_image_url ? (
              <img className="admin-run-proof-image" src={run.share_image_url} alt="Run proof" />
            ) : (
              <p className="muted">
                No uploaded screenshot image is stored yet. Showing run details from the saved run record.
              </p>
            )}
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
          sub: `${activityById(row.activity_id).title || row.completion_type} · ${row.status}`,
        })),
        ...filteredRuns.map(row => ({
          main: row.player_name || playerById(row.player_id).name || "Unknown player",
          sub: `${row.label || "Run"} · ${number(row.distance_km).toFixed(2)} km`,
        })),
      ];
    }

    if (detailModal === "childLinks") {
      title = "Child Link / Registered Users";
      rows = filteredTermsRows.map(row => ({
        main: row.user_email || row.user_id,
        sub: `${displaySquad(row.squad_key)} · ${dateText(row.accepted_at)}`,
      }));
    }

    if (detailModal === "unregistered") {
      title = "Not Yet Registered";
      const registeredSquads = new Set(filteredTermsRows.map(row => row.squad_key));
      rows = filteredPlayers
        .filter(player => !registeredSquads.has(player.squad_key))
        .map(player => ({
          main: player.name,
          sub: displaySquad(player.squad_key),
        }));
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

  function renderCurrentTab() {
    if (loading) {
      return <div className="admin-card">Loading admin dashboard…</div>;
    }

    if (activeTab === "dashboard") return renderDashboard();
    if (activeTab === "approvals") return renderApprovals();
    if (activeTab === "leaderboard") return renderLeaderboard();
    if (activeTab === "players") return renderPlayers();
    if (activeTab === "plans") return renderPlans();
    if (activeTab === "progress") return renderProgress();

    return renderDashboard();
  }

  return (
    <div className="admin-page">
      {toast ? <div className="app-toast">{toast}</div> : null}

      <section className="admin-hero">
        <div>
          <p className="eyebrow">Admin</p>
          <h1>Fingallians Fitness Challenge</h1>
        </div>

        <select
          className="select admin-squad-select"
          value={adminSquad}
          disabled={!isSuperAdmin}
          onChange={event => setAdminSquad(event.target.value)}
        >
          {visibleSquads.map(squad => (
            <option key={squad.key} value={squad.key}>
              {squad.label}
            </option>
          ))}
        </select>
      </section>

      <nav className="admin-tabs">
        {ADMIN_TABS.map(tab => (
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
    </div>
  );
}
