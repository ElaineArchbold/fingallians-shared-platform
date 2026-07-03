import { useMemo, useState } from "react";
import "./styles/app.css";

import { useSquadSelection } from "./hooks/useSquadSelection";
import { useAuth } from "./hooks/useAuth";
import { useRoles } from "./hooks/useRoles";
import { useLinkedPlayers } from "./hooks/useLinkedPlayers";

import { getSupabaseClient } from "./lib/supabaseClient";
import { adminSquadKeysForRoles, isAdminForSquad, isSuperAdminForSquad } from "./lib/rbac";

import SquadSelector from "./components/layout/SquadSelector";
import AuthPanel from "./components/auth/AuthPanel";
import ParentHome from "./components/parent/ParentHome";
import AdminHome from "./components/admin/AdminHome";

export default function App() {
  const { squadKey, squadConfig, setSquadKey } = useSquadSelection();
  const supabase = useMemo(() => getSupabaseClient(squadConfig), [squadConfig.key]);

  const { session, authLoaded } = useAuth(supabase);
  const { roles, rolesLoaded } = useRoles(supabase, session);
  const { players, playersLoaded } = useLinkedPlayers(supabase, session, squadConfig);

  const [selectedPlayerId, setSelectedPlayerId] = useState("");

  const adminKeys = adminSquadKeysForRoles(roles);
  const isSuperAdmin = isSuperAdminForSquad(roles, squadConfig);
  const isAdmin = isAdminForSquad(roles, squadConfig);
  const canUseAdminSelector = isSuperAdmin && adminKeys.length > 1;

  async function signOut() {
    await supabase?.auth.signOut();
    setSelectedPlayerId("");
  }

  if (!supabase) {
    return (
      <div className="app-shell">
        <div className="dev-note">
          Missing Supabase environment variables. Copy .env.example to .env.local and fill in the Boys/Girls project keys.
        </div>
      </div>
    );
  }

  if (!authLoaded || (session && !rolesLoaded) || (session && !isAdmin && !playersLoaded)) {
    return <div className="app-shell"><div className="card">Loading…</div></div>;
  }

  return (
    <div className="app-shell">
      <div className="topbar">
        <div>
          <h1>Fingallians Fitness Challenge</h1>
          <p>{squadConfig.shortLabel}</p>
        </div>
        {session ? (
          <button className="button secondary" style={{ width: "auto" }} onClick={signOut}>
            Sign out
          </button>
        ) : null}
      </div>

      <SquadSelector
        value={squadKey}
        onChange={next => {
          setSelectedPlayerId("");
          setSquadKey(next);
        }}
        allowedKeys={canUseAdminSelector ? adminKeys : undefined}
        label={isSuperAdmin ? "Super Admin squad" : "Select squad/year"}
      />

      <div className="dev-note">
        Foundation v1: auth, squad selection, RBAC lookup and Select your child flow. Existing live apps are untouched.
      </div>

      {!session ? (
        <AuthPanel supabase={supabase} />
      ) : isAdmin ? (
        <AdminHome squadConfig={squadConfig} isSuperAdmin={isSuperAdmin} />
      ) : (
        <ParentHome
          squadConfig={squadConfig}
          players={players}
          selectedPlayerId={selectedPlayerId}
          onSelectPlayer={setSelectedPlayerId}
        />
      )}
    </div>
  );
}
