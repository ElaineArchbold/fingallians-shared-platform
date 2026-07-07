import { useEffect, useMemo, useState } from "react";
import { getSquadWhatsAppLink } from "../../lib/squadLinks";

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

function TermsText() {
  return (
    <div className="terms-copy">
      <h2>Terms and Conditions</h2>

      <h3>Parent / Guardian Responsibility</h3>
      <p>
        Parents and guardians are responsible for supervising children during the
        Fingallians Summer Fitness Challenge. Children should only complete runs,
        skills and activities in safe locations and with adult supervision where
        appropriate.
      </p>

      <h3>Safety First</h3>
      <p>
        Children should avoid roads, unsafe routes, poor weather conditions and
        any activity that feels too difficult. If a child feels unwell, sore or
        unsafe, they should stop immediately and tell an adult.
      </p>

      <h3>GPS and Manual Runs</h3>
      <p>
        GPS and manual run entries are used only for challenge tracking. Route
        information is not shown publicly in the app. Manual entries should be
        completed honestly by a parent or guardian.
      </p>

      <h3>Challenge Tracking</h3>
      <p>
        Progress, XP, badges, completed activities, run entries and coach
        approvals are used for the Fingallians Summer Fitness Challenge only.
        Some activities may require coach approval before points are awarded.
      </p>

      <h3>Photos, Screenshots and Sharing</h3>
      <p>
        Parents and guardians are responsible for deciding whether to save or
        share screenshots from the app. Please avoid sharing personal information
        publicly.
      </p>

      <h3>Agreement</h3>
      <p>
        By continuing to use the app, you confirm that you are a parent or
        guardian and that you accept these terms on behalf of your child.
      </p>
    </div>
  );
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
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState("");
  const [passwordError, setPasswordError] = useState("");

  const whatsappLink = getSquadWhatsAppLink(squadConfig.key);
  const hasMultipleChildren = players.length > 1;

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

  async function changePassword(event) {
    event.preventDefault();
    setPasswordBusy(true);
    setPasswordError("");
    setPasswordMessage("");

    if (!newPassword || newPassword.length < 8) {
      setPasswordBusy(false);
      setPasswordError("Password must be at least 8 characters.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordBusy(false);
      setPasswordError("Passwords do not match.");
      return;
    }

    const { error } = await supabase.auth.updateUser({ password: newPassword });

    setPasswordBusy(false);

    if (error) {
      setPasswordError(error.message);
      return;
    }

    setPasswordMessage("Password updated successfully.");
    setNewPassword("");
    setConfirmPassword("");

    setTimeout(() => {
      setShowPasswordModal(false);
      setPasswordMessage("");
      setPasswordError("");
    }, 1400);
  }

  return (
    <div className="page settings-home">
      <section className="player-card settings-player-card">
        <div className="player-avatar">{initials(selectedPlayer.name)}</div>

        <div className="player-card-main">
          <p className="eyebrow">Settings</p>

          <div className="settings-player-title-row">
            <h2>{selectedPlayer.name}</h2>
            {hasMultipleChildren ? (
              <button
                type="button"
                className="child-name-switch"
                onClick={onSwitchChild}
                aria-label="Switch child"
              >
                ›
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
      </section>

      <section className="settings-card">
        <h2>Children</h2>

        <div className="settings-card-content">
          <div>
            <strong>Selected child</strong>
            <p className="muted">{selectedPlayer.name}</p>
          </div>

          {players.length > 1 ? (
            <div className="settings-child-button-list">
              {players.map(player => (
                <div
                  key={player.id}
                  className={
                    player.id === selectedPlayer.id
                      ? "settings-linked-child active"
                      : "settings-linked-child"
                  }
                >
                  <button
                    type="button"
                    onClick={() => onSelectChild?.(player)}
                    aria-label={`Select ${player.name}`}
                  >
                    <span>{initials(player.name)}</span>
                    <div>
                      <strong>{player.name}</strong>
                      <small>{player.squad_key}</small>
                      {player.id === selectedPlayer.id ? <em>Selected</em> : null}
                    </div>
                  </button>

                  {player.id !== selectedPlayer.id ? (
                    <button
                      type="button"
                      className="settings-remove-child"
                      onClick={() => {
                        const ok = window.confirm(
                          `Remove ${player.name} from this parent account?`
                        );

                        if (ok) onRemoveChild?.(player);
                      }}
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
          <button
            className="settings-row-button"
            type="button"
            onClick={() => setShowPasswordModal(true)}
          >
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

      {showPasswordModal ? (
        <div className="terms-modal-backdrop" onClick={() => setShowPasswordModal(false)}>
          <form className="password-modal" onClick={event => event.stopPropagation()} onSubmit={changePassword}>
            <button
              className="terms-modal-close"
              type="button"
              onClick={() => setShowPasswordModal(false)}
            >
              ×
            </button>

            <h2>Change Password</h2>
            <p className="muted">Choose a new password for this parent account.</p>

            <label className="label">New password</label>
            <input
              className="input"
              type="password"
              value={newPassword}
              onChange={event => setNewPassword(event.target.value)}
              minLength={8}
              required
            />

            <label className="label">Confirm password</label>
            <input
              className="input"
              type="password"
              value={confirmPassword}
              onChange={event => setConfirmPassword(event.target.value)}
              minLength={8}
              required
            />

            {passwordError ? <p className="form-error">{passwordError}</p> : null}
            {passwordMessage ? <p className="form-message">{passwordMessage}</p> : null}

            <button className="button primary" disabled={passwordBusy}>
              {passwordBusy ? "Saving…" : "Save Password"}
            </button>
          </form>
        </div>
      ) : null}

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
              <TermsText />
              <p className="terms-accepted-line muted">
                Accepted: {formatAcceptedDate(termsAcceptedAt)}
              </p>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
