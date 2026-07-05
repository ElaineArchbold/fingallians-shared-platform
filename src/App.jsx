import { useEffect, useState } from "react";
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

function getChildLinkParams() {
  const params = new URLSearchParams(window.location.search);

  return {
    childToken: params.get("child") || "",
    squadFromUrl: params.get("squad") || "",
  };
}

export default function App() {
  const { childToken, squadFromUrl } = getChildLinkParams();
  const childMode = Boolean(childToken);

  const { squadKey, squadConfig, setSquadKey } = useSquadSelection();

  useEffect(() => {
    document.body.classList.toggle("is-child-link-mode", childMode);

    return () => {
      document.body.classList.remove("is-child-link-mode");
    };
  }, [childMode]);

  useEffect(() => {
    if (childMode && squadFromUrl && squadFromUrl !== squadKey) {
      setSquadKey(squadFromUrl);
      localStorage.setItem("lastSquadKey", squadFromUrl);
    }
  }, [childMode, squadFromUrl, squadKey, setSquadKey]);

  const { session, authLoaded } = useAuth(supabase);
  const { roles, rolesLoaded } = useRoles(supabase, session);
  const { players, playersLoaded } = useLinkedPlayers(
    supabase,
    session,
    squadConfig
  );
  const { termsAccepted, termsAcceptedAt, termsLoaded } = useTermsAcceptance(
    supabase,
    session,
    squadConfig
  );

  const [parentView, setParentView] = useState("challenge");
  const [selectedPlayerId, setSelectedPlayerId] = useState("");

  const adminKeys = adminSquadKeysForRoles(roles);
  const isSuperAdmin = isSuperAdminForSquad(roles, squadConfig);
  const isAdmin = isAdminForSquad(roles, squadConfig);
  const canUseAdminSelector = isSuperAdmin && adminKeys.length > 1;

  async function signOut() {
    const ok = window.confirm("Are you sure you want to sign out?");
    if (!ok) return;

    await supabase.auth.signOut();
    setSelectedPlayerId("");
    setParentView("challenge");
  }

  function changeSquad(next) {
    setSelectedPlayerId("");
    setParentView("challenge");
    setSquadKey(next);
    localStorage.setItem("lastSquadKey", next);
  }

  if (childMode) {
    return (
      <div className="app-shell child-link-shell">
        <div className="topbar child-topbar">
          <div className="topbar-brand">
            <img src="/fingallians-crest.png" alt="Fingallians crest" />

            <div className="topbar-title">
              <h1>Fingallians Fitness Challenge</h1>
            </div>
          </div>
        </div>

        <ChildHome
          supabase={supabase}
          squadConfig={squadConfig}
          childToken={childToken}
        />
      </div>
    );
  }

  const waitingForAuth = !authLoaded;
  const waitingForRoles = Boolean(session && !rolesLoaded);
  const waitingForTerms = Boolean(session && rolesLoaded && !isAdmin && !termsLoaded);
  const waitingForPlayers = Boolean(session && rolesLoaded && !isAdmin && !playersLoaded);

  if (waitingForAuth || waitingForRoles || waitingForTerms || waitingForPlayers) {
    return (
      <div className="app-shell">
        <div className="card">Loading…</div>
      </div>
    );
  }

  return (
    <>
      <div className={isAdmin ? "app-shell admin-app-shell" : "app-shell"}>
        {session && !isAdmin ? (
          <div className="topbar">
            <div className="topbar-brand">
              <img src="/fingallians-crest.png" alt="Fingallians crest" />

              <div className="topbar-title">
                <h1>Fingallians Fitness Challenge</h1>
              </div>
            </div>

            {isAdmin ? (
              <div className="topbar-actions admin-topbar-actions">
                {canUseAdminSelector ? (
                  <select
                    className="select topbar-select"
                    value={squadKey}
                    onChange={e => changeSquad(e.target.value)}
                  >
                    {adminKeys.map(key => (
                      <option key={key} value={key}>
                        {key}
                      </option>
                    ))}
                  </select>
                ) : null}

                <button
                  className="admin-signout-link"
                  onClick={signOut}
                >
                  Sign out
                </button>
              </div>
            ) : null}
          </div>
        ) : null}

        {session && !isAdmin && !termsAccepted ? (
          <TermsAndConditions
            supabase={supabase}
            session={session}
            squadConfig={squadConfig}
            onAccepted={() => window.location.reload()}
          />
        ) : null}

        {!session ? (
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
          <AdminHome squadConfig={squadConfig} isSuperAdmin={isSuperAdmin} onSignOut={signOut} />
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

      {!isAdmin && session && termsAccepted ? (
        <nav className="bottom-nav">
          <button
            className={parentView === "challenge" ? "active" : ""}
            onClick={() => setParentView("challenge")}
          >
            <span>🏠</span>
            <small>Home</small>
          </button>

          <button
            className={parentView === "progress" ? "active" : ""}
            onClick={() => setParentView("progress")}
          >
            <span>📈</span>
            <small>Progress</small>
          </button>

          <button
            className={parentView === "settings" ? "active" : ""}
            onClick={() => setParentView("settings")}
          >
            <span>⚙️</span>
            <small>Settings</small>
          </button>
        </nav>
      ) : null}
    </>
  );
}
