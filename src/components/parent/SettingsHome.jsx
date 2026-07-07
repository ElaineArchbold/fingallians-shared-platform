import { useEffect, useMemo, useState } from "react";
import { getSquadWhatsAppLink } from "../../lib/squadLinks";
import TermsText from "../../auth/TermsText";

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

function formatAcceptedDate(value) {
  if (!value) return "Accepted date not found";

  try {
    return new Date(value).toLocaleString([], {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "Accepted date not found";
  }
}

export default function SettingsHome({
  supabase,
  session,
  squadConfig,
  selectedPlayer,
  players = [],
  xpTotal = 0,
  badges = [],
  termsAcceptedAt = "",
  onSwitchChild,
  onChildLinked,
  onSelectChild,
  onRemoveChild,
  onSignOut,
}) {
  const [copyMessage, setCopyMessage] = useState("");
  const [allPlayers, setAllPlayers] = useState([]);
  const [loadingPlayers, setLoadingPlayers] = useState(false);
  const [addSquadKey, setAddSquadKey] = useState("");
  const [addPlayerId, setAddPlayerId] = useState("");
  const [showTerms, setShowTerms] = useState(false);

  const whatsappLink = getSquadWhatsAppLink(squadConfig.key);

  useEffect(() => {
    loadAllPlayers();
  }, []);

  const squadOptions = useMemo(() => {
    return [...new Set(allPlayers.map(player => player.squad_key).filter(Boolean))].sort();
  }, [allPlayers]);

  const playersForSelectedSquad = allPlayers.filter(
    player => !addSquadKey || player.squad_key === addSquadKey
  );

  function childLink() {
    if (!selectedPlayer?.child_access_token) return "";

    const token = encodeURIComponent(selectedPlayer.child_access_token);
    return `${window.location.origin}/child/${token}`;
  }

  function openChildLink() {
    const link = childLink();

    if (!link) {
      setCopyMessage("No child access token found for this player.");
      return;
    }

    window.open(link, "_blank", "noopener,noreferrer");
  }

  async function loadAllPlayers() {
    setLoadingPlayers(true);

    const { data, error } = await supabase
      .from("players")
      .select("id,name,squad,squad_key,child_access_token")
      .order("squad_key")
      .order("name");

    setLoadingPlayers(false);

    if (error) {
      console.error(error);
      setAllPlayers([]);
      return;
    }

    setAllPlayers(data || []);
  }

  async function copyChildLink() {
    const link = childLink();

    if (!link) {
      setCopyMessage("No child access token found for this player.");
      return;
    }

    await navigator.clipboard.writeText(link);
    setCopyMessage("Child link copied.");
    setTimeout(() => setCopyMessage(""), 2400);
  }

  function addSelectedChild() {
    const player = allPlayers.find(item => item.id === addPlayerId);

    if (!player) {
      alert("Choose a child to add.");
      return;
    }

    onChildLinked?.(player);
    setAddPlayerId("");
  }

  return (
    <div className="page settings-home">
      <section className="player-card settings-player-card">
        <div className="player-avatar">{initials(selectedPlayer.name)}</div>

        <div className="player-card-main">
          <p className="eyebrow">Settings</p>
          <h2>{selectedPlayer.name}</h2>
          <p>{squadConfig.shortLabel}</p>

          <div className="player-xp-bar">
            <div style={{ width: `${Math.min(100, xpTotal % 100)}%` }} />
          </div>

          <small>
            Level {levelFromXp(xpTotal)} · {xpTotal} XP · {badges.length} badges
          </small>
        </div>

        <button className="button secondary settings-switch-button" onClick={onSwitchChild}>
          Switch
        </button>
      </section>

      <section className="settings-card">
        <h2>Children</h2>

        <div className="settings-card-content">
          <div>
            <strong>Selected child</strong>
            <p className="muted">{selectedPlayer.name}</p>
          </div>

          {players.length ? (
            <div className="settings-child-list">
              {players.map(player => (
                <div
                  key={player.id}
                  className={
                    player.id === selectedPlayer.id
                      ? "settings-child-box active"
                      : "settings-child-box"
                  }
                >
                  <button
                    type="button"
                    className="settings-child-main"
                    onClick={() => onSelectChild?.(player)}
                  >
                    <span>{initials(player.name)}</span>
                    <div>
                      <strong>{player.name}</strong>
                      <small>{player.squad_key}</small>
                    </div>
                  </button>

                  {players.length > 1 ? (
                    <button
                      type="button"
                      className="settings-remove-child-link"
                      onClick={() => onRemoveChild?.(player)}
                      aria-label={`Remove ${player.name}`}
                    >
                      Remove
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}

          <div className="settings-add-child">
            <strong>Add another child</strong>

            <label className="label">Squad</label>
            <select
              className="select"
              value={addSquadKey}
              onChange={event => {
                setAddSquadKey(event.target.value);
                setAddPlayerId("");
              }}
            >
              <option value="">All squads</option>
              {squadOptions.map(key => (
                <option key={key} value={key}>
                  {key}
                </option>
              ))}
            </select>

            <label className="label">Child</label>
            <select
              className="select"
              value={addPlayerId}
              disabled={loadingPlayers}
              onChange={event => setAddPlayerId(event.target.value)}
            >
              <option value="">
                {loadingPlayers ? "Loading children…" : "Choose child"}
              </option>

              {playersForSelectedSquad.map(player => (
                <option key={player.id} value={player.id}>
                  {player.name} · {player.squad_key}
                </option>
              ))}
            </select>

            <button className="button primary" onClick={addSelectedChild}>
              Add Child
            </button>
          </div>
        </div>
      </section>

      <section className="settings-card">
        <h2>Child Access</h2>

        <div className="settings-card-content">
          <div>
            <strong>Child link</strong>
            <p className="muted">
              Opens the child-only home page. No parent progress page, settings page or bottom navigation.
            </p>
          </div>

          <div className="settings-action-row">
            <button className="button primary" onClick={openChildLink}>
              Open Child View in New Tab
            </button>

            <button className="button secondary" onClick={copyChildLink}>
              Copy Child Link
            </button>
          </div>

          {copyMessage ? <p className="settings-message">{copyMessage}</p> : null}
        </div>
      </section>

      <section className="settings-card">
        <h2>Squad</h2>

        <div className="settings-card-content">
          {whatsappLink ? (
            <a
              className="settings-whatsapp-card"
              href={whatsappLink}
              target="_blank"
              rel="noreferrer"
            >
              <div>
                <strong>💬 Squad WhatsApp</strong>
                <p>Open your squad group for reminders, proof posts and coach updates.</p>
              </div>
            </a>
          ) : (
            <p className="muted">No WhatsApp group link has been added for this squad yet.</p>
          )}
        </div>
      </section>

      <section className="settings-card">
        <h2>Account</h2>

        <div className="settings-card-content">
          <button className="settings-row-button" type="button">
            <span>🔐 Change password</span>
            <strong>›</strong>
          </button>

          <button
            className="settings-row-button"
            type="button"
            onClick={() => setShowTerms(true)}
          >
            <span>📄 Terms and Conditions</span>
            <strong>View</strong>
          </button>

          <p className="settings-watermark">
            Terms accepted: {formatAcceptedDate(termsAcceptedAt)}
          </p>
        </div>
      </section>

      <section className="settings-card signout-card">
        <h2>Sign Out</h2>

        <div className="settings-card-content">
          <p className="muted">Sign out of the parent app on this device.</p>

          <button className="button secondary danger-button" onClick={onSignOut}>
            Sign Out
          </button>
        </div>
      </section>

      {showTerms ? (
        <div className="terms-modal-backdrop" onClick={() => setShowTerms(false)}>
          <div className="terms-modal" onClick={event => event.stopPropagation()}>
            <button
              className="terms-modal-close"
              onClick={() => setShowTerms(false)}
            >
              ×
            </button>

            <div className="terms-readonly-card">
              <h2>Terms and Conditions</h2>
              <p className="muted">
                Accepted: {formatAcceptedDate(termsAcceptedAt)}
              </p>

              <div className="terms-readonly-body">
                <TermsText />
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
