import { Component, useEffect, useState } from "react";
import "./styles/app.css";
import ChildHome from "./components/child/ChildHome";

import { useSquadSelection } from "./hooks/useSquadSelection";
import { useAuth } from "./hooks/useAuth";
import { useRoles } from "./hooks/useRoles";
import { useLinkedPlayers } from "./hooks/useLinkedPlayers";
import { useTermsAcceptance } from "./hooks/useTermsAcceptance";

import { supabase } from "./lib/supabaseClient";
import {
  adminSquadKeysForRoles,
  isAdminForSquad,
  isSuperAdminForSquad,
} from "./lib/rbac";

import AuthPanel from "./components/auth/AuthPanel";
import TermsAndConditions from "./components/auth/TermsAndConditions";
import ParentHome from "./components/parent/ParentHome";
import AdminHome from "./components/admin/AdminHome";

const SUPER_ADMIN_EMAILS = ["e.t.archbold@gmail.com"];
const TEST_SQUAD_ADMIN_EMAILS = ["e.t.archbold+admin@gmail.com"];
const SINGLE_SQUAD_ADMIN_EMAILS = {
  "lee@ssa.ie": ["2017-girls"],
};

function NavIcon({ name }) {
  if (name === "home") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M3 10.6 12 3l9 7.6v9.1a1.3 1.3 0 0 1-1.3 1.3h-5.1v-6.2H9.4V21H4.3A1.3 1.3 0 0 1 3 19.7v-9.1Z" />
      </svg>
    );
  }

  if (name === "trophy") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M7 3h10v2h3a1 1 0 0 1 1 1v2.2a5.8 5.8 0 0 1-4.7 5.7A6.1 6.1 0 0 1 13 17.4V20h3.4a1 1 0 0 1 1 1v1H6.6v-1a1 1 0 0 1 1-1H11v-2.6a6.1 6.1 0 0 1-3.3-3.5A5.8 5.8 0 0 1 3 8.2V6a1 1 0 0 1 1-1h3V3Zm0 4H5v1.2a3.8 3.8 0 0 0 2.4 3.5A9 9 0 0 1 7 9V7Zm12 0h-2v2c0 1-.1 1.9-.4 2.7A3.8 3.8 0 0 0 19 8.2V7Z" />
      </svg>
    );
  }

 if (name === "skills") {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M6 3a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v19l-6-4-6 4V3z"
      />
    </svg>
  );
}

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 12.2a4.7 4.7 0 1 0 0-9.4 4.7 4.7 0 0 0 0 9.4Zm0 2.1c-4.2 0-7.7 2.4-7.7 5.3V21h15.4v-1.4c0-2.9-3.5-5.3-7.7-5.3Z" />
    </svg>
  );
}


class AppErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("App render failed", error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="app-shell">
        <div className="card app-error-card">
          <span>⚠️</span>
          <h2>Something went wrong</h2>
          <p className="muted">
            The page could not be displayed. Reload the app to try again.
          </p>
          <button className="button primary" onClick={() => window.location.reload()}>
            Reload App
          </button>
        </div>
      </div>
    );
  }
}

function getChildLinkParams() {
  const params = new URLSearchParams(window.location.search);
  const pathMatch = window.location.pathname.match(/^\/child\/([^/]+)$/);
  const tokenFromPath = pathMatch?.[1] ? decodeURIComponent(pathMatch[1]) : "";
  const tokenFromQuery = params.get("child") || "";
  const childToken = tokenFromPath || tokenFromQuery;

  if (childToken) localStorage.setItem("childAccessToken", childToken);

  return {
    childToken,
    squadFromUrl: params.get("squad") || localStorage.getItem("childSquadKey") || "",
  };
}

function AppContent() {
  const { childToken, squadFromUrl } = getChildLinkParams();
  const params = new URLSearchParams(window.location.search);
  const previewPlayerId = params.get("previewPlayer") || "";
  const parentPreviewRequested = params.get("previewMode") === "parent";
  const childMode = Boolean(childToken);
  const { squadKey, squadConfig, setSquadKey } = useSquadSelection();

  useEffect(() => {
    document.body.classList.toggle("is-child-link-mode", childMode);
    return () => document.body.classList.remove("is-child-link-mode");
  }, [childMode]);

  useEffect(() => {
    if (childMode && squadFromUrl && squadFromUrl !== squadKey) {
      setSquadKey(squadFromUrl);
      localStorage.setItem("lastSquadKey", squadFromUrl);
    }
  }, [childMode, squadFromUrl, squadKey, setSquadKey]);

  const { session, authLoaded } = useAuth(supabase);
  const { roles, rolesLoaded } = useRoles(supabase, session);
  const { players, playersLoaded } = useLinkedPlayers(supabase, session, squadConfig);
  const { termsAccepted, termsAcceptedAt, termsLoaded } = useTermsAcceptance(
    supabase,
    session,
    squadConfig
  );

  const [parentView, setParentView] = useState("challenge");
  const [selectedPlayerId, setSelectedPlayerId] = useState("");
  const [previewPlayer, setPreviewPlayer] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const adminKeys = adminSquadKeysForRoles(roles);
  const isSuperAdmin = isSuperAdminForSquad(roles, squadConfig);
  const userEmail = String(session?.user?.email || "").toLowerCase();
  const isEmailSuperAdmin = SUPER_ADMIN_EMAILS.includes(userEmail);
  const isTestSquadAdmin = TEST_SQUAD_ADMIN_EMAILS.includes(userEmail);
  const effectiveIsSuperAdmin = isSuperAdmin || isEmailSuperAdmin;
  const singleSquadAdminKeys = SINGLE_SQUAD_ADMIN_EMAILS[userEmail] || [];

  const availableAdminKeys = effectiveIsSuperAdmin
    ? ["2014-boys", "2015-girls", "2017-boys", "2017-girls"]
    : singleSquadAdminKeys.length
      ? singleSquadAdminKeys
      : isTestSquadAdmin
        ? [squadKey]
        : adminKeys;

  const isAdmin =
    isAdminForSquad(roles, squadConfig) ||
    effectiveIsSuperAdmin ||
    isTestSquadAdmin ||
    singleSquadAdminKeys.includes(squadKey);

  const parentPreviewMode = Boolean(
    parentPreviewRequested &&
    previewPlayerId &&
    effectiveIsSuperAdmin
  );

  useEffect(() => {
    let cancelled = false;

    async function loadPreviewPlayer() {
      if (!parentPreviewMode) {
        setPreviewPlayer(null);
        return;
      }

      setPreviewLoading(true);
      const { data, error } = await supabase
        .from("players")
        .select("id,name,squad,squad_key,child_access_token,is_test_player")
        .eq("id", previewPlayerId)
        .eq("is_test_player", true)
        .maybeSingle();

      if (cancelled) return;
      if (error) console.error("Could not load test-player preview", error);
      setPreviewPlayer(data || null);
      setSelectedPlayerId(data?.id || "");
      if (data?.squad_key && data.squad_key !== squadKey) {
        setSquadKey(data.squad_key);
      }
      setPreviewLoading(false);
    }

    loadPreviewPlayer();
    return () => { cancelled = true; };
  }, [parentPreviewMode, previewPlayerId]);

  async function signOut() {
    const ok = window.confirm("Are you sure you want to sign out?");
    if (!ok) return;
    await supabase.auth.signOut();
    setSelectedPlayerId("");
    setParentView("challenge");
  }

  if (childMode) {
    return (
      <div className="app-shell child-link-shell">
        <div className="topbar child-topbar">
          <div className="topbar-brand">
            <img src="/fingallians-crest.png" alt="Fingallians crest" />
            <div className="topbar-title"><h1>Fingallians Fitness Challenge</h1></div>
          </div>
        </div>
        <ChildHome key={childToken} supabase={supabase} squadConfig={squadConfig} childToken={childToken} />
      </div>
    );
  }

  const waitingForAuth = !authLoaded;
  const waitingForRoles = Boolean(session && !rolesLoaded);
  const waitingForTerms = Boolean(session && rolesLoaded && !isAdmin && !termsLoaded);
  const waitingForPlayers = Boolean(session && rolesLoaded && !isAdmin && !playersLoaded);

  if (waitingForAuth || waitingForRoles || waitingForTerms || waitingForPlayers || previewLoading) {
    return <div className="app-shell"><div className="card">Loading…</div></div>;
  }

  return (
    <>
      <div className={isAdmin && !parentPreviewMode ? "app-shell admin-app-shell" : "app-shell"}>
        {parentPreviewMode ? (
          <div className="test-preview-banner">
            <div>
              <strong>🧪 Parent Preview</strong>
              <span>{previewPlayer?.name || "Test player"}</span>
            </div>
            <button type="button" onClick={() => { window.location.href = window.location.pathname; }}>
              Exit Preview
            </button>
          </div>
        ) : null}
        {session && !isAdmin ? (
          <div className="topbar">
            <div className="topbar-brand">
              <img src="/fingallians-crest.png" alt="Fingallians crest" />
              <div className="topbar-title"><h1>Fingallians Fitness Challenge</h1></div>
            </div>
          </div>
        ) : null}

        {session && !isAdmin && !termsAccepted ? (
          <TermsAndConditions supabase={supabase} session={session} squadConfig={squadConfig} onAccepted={() => window.location.reload()} />
        ) : null}

        {parentPreviewMode && previewPlayer ? (
          <ParentHome
            supabase={supabase}
            session={session}
            squadConfig={squadConfig}
            squadKey={squadKey}
            onChangeSquad={next => {
              setSquadKey(next);
              localStorage.setItem("lastSquadKey", next);
            }}
            players={[previewPlayer]}
            selectedPlayerId={previewPlayer.id}
            onSelectPlayer={setSelectedPlayerId}
            parentView={parentView}
            onChangeParentView={setParentView}
            onSignOut={() => {}}
            termsAcceptedAt={termsAcceptedAt}
            previewPlayer={previewPlayer}
          />
        ) : !session ? (
          <AuthPanel
            supabase={supabase}
            squadConfig={squadConfig}
            squadKey={squadKey}
            onSelectSquad={next => {
              setSelectedPlayerId("");
              setParentView("challenge");
              setSquadKey(next);
              localStorage.setItem("lastSquadKey", next);
            }}
          />
        ) : isAdmin ? (
          <AdminHome squadConfig={squadConfig} isSuperAdmin={effectiveIsSuperAdmin} adminSquadKeys={availableAdminKeys} onSignOut={signOut} />
        ) : !termsAccepted ? null : (
          <ParentHome
            supabase={supabase}
            session={session}
            squadConfig={squadConfig}
            squadKey={squadKey}
            onChangeSquad={next => {
              setSquadKey(next);
              localStorage.setItem("lastSquadKey", next);
            }}
            players={players}
            selectedPlayerId={selectedPlayerId}
            onSelectPlayer={setSelectedPlayerId}
            parentView={parentView}
            onChangeParentView={setParentView}
            onSignOut={signOut}
            termsAcceptedAt={termsAcceptedAt}
          />
        )}
      </div>

      {session && (parentPreviewMode || (!isAdmin && termsAccepted)) ? (
        <nav className="bottom-nav">
          <button className={parentView === "challenge" ? "active" : ""} onClick={() => setParentView("challenge")}>
            <NavIcon name="home" /><small>Home</small>
          </button>
          <button className={parentView === "progress" ? "active" : ""} onClick={() => setParentView("progress")}>
            <NavIcon name="trophy" /><small>Progress</small>
          </button>
          <button className={parentView === "skills" ? "active" : ""} onClick={() => setParentView("skills")}>
            <NavIcon name="skills" /><small>Skills</small>
          </button>
          <button className={parentView === "settings" ? "active" : ""} onClick={() => setParentView("settings")}>
            <NavIcon name="user" /><small>Settings</small>
          </button>
        </nav>
      ) : null}
    </>
  );
}


export default function App() {
  return (
    <AppErrorBoundary>
      <AppContent />
    </AppErrorBoundary>
  );
}
