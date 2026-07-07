import { useEffect, useState } from "react";

const REMEMBER_EMAIL_KEY = "fingalliansRememberedEmail";
const KEEP_LOGGED_IN_KEY = "fingalliansKeepLoggedIn";
const MIGRATION_POPUP_KEY = "fingalliansMigrationPasswordPopupSeen";

const SQUADS = [
  { key: "2014-boys", label: "2014 Boys" },
  { key: "2015-girls", label: "2015 Girls" },
  { key: "2017-boys", label: "2017 Boys" },
  { key: "2017-girls", label: "2017 Girls" },
];

function browserDetails() {
  const params = new URLSearchParams(window.location.search);
  return {
    user_agent: navigator.userAgent,
    language: navigator.language,
    platform: navigator.platform,
    path: window.location.pathname,
    url: window.location.href,
    from_app: params.get("from_app") || params.get("old_app") || localStorage.getItem("fingalliansFromApp") || null,
  };
}

export default function AuthPanel({
  supabase,
  squadConfig,
  squadKey,
  onSelectSquad,
}) {
  const [mode, setMode] = useState("signup");
  const [selectedSquad, setSelectedSquad] = useState(squadKey || "");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [showMigrationPopup, setShowMigrationPopup] = useState(false);
  const [resetPassword, setResetPassword] = useState("");
  const [confirmResetPassword, setConfirmResetPassword] = useState("");
  const [recoveryMode, setRecoveryMode] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const fromApp = params.get("from_app") || params.get("old_app");

    if (fromApp) {
      localStorage.setItem("fingalliansFromApp", fromApp);
    }

    const rememberedEmail = localStorage.getItem(REMEMBER_EMAIL_KEY);

    if (rememberedEmail) {
      setEmail(rememberedEmail);
      setRememberMe(true);
    }

    const popupSeen = localStorage.getItem(MIGRATION_POPUP_KEY);
    if (!popupSeen) {
      setShowMigrationPopup(true);
      localStorage.setItem(MIGRATION_POPUP_KEY, "true");
    }

    const hash = window.location.hash || "";
    const search = window.location.search || "";

    if (hash.includes("type=recovery") || search.includes("type=recovery")) {
      setRecoveryMode(true);
      setMode("reset");
      setMessage("Enter a new password below.");
    }

    const { data: listener } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === "PASSWORD_RECOVERY") {
        setRecoveryMode(true);
        setMode("reset");
        setMessage("Enter a new password below.");
        await logMigrationAudit("password_recovery_opened", session?.user?.email || cleanEmail(), {}, session?.user?.id || null);
      }

      if (event === "SIGNED_IN" && session?.user?.email) {
        await logMigrationAudit("signed_in_event", session.user.email, { source: "auth_state_change" }, session.user.id);
      }
    });

    return () => {
      listener?.subscription?.unsubscribe?.();
    };
  }, []);

  useEffect(() => {
    if (squadKey) {
      setSelectedSquad(squadKey);
    }
  }, [squadKey]);

  function chooseSquad(key) {
    setSelectedSquad(key);
    onSelectSquad?.(key);
    localStorage.setItem("lastSquadKey", key);
    setError("");
    setMessage("");
  }

  function cleanEmail() {
    return email.trim().toLowerCase();
  }

  function saveRememberedEmail(value) {
    if (rememberMe) {
      localStorage.setItem(REMEMBER_EMAIL_KEY, value);
      localStorage.setItem(KEEP_LOGGED_IN_KEY, "true");
    } else {
      localStorage.removeItem(REMEMBER_EMAIL_KEY);
      localStorage.removeItem(KEEP_LOGGED_IN_KEY);
    }
  }

  async function logMigrationAudit(event, parentEmail, details = {}, userId = null) {
    try {
      await supabase.from("migration_audit").insert({
        parent_email: parentEmail || null,
        parent_user_id: userId || null,
        event,
        details: {
          squad_key: selectedSquad || squadKey || squadConfig?.key || null,
          ...browserDetails(),
          ...details,
        },
      });
    } catch (auditError) {
      console.warn("Migration audit failed", auditError);
    }
  }

  async function claimMigratedChildren(userId, parentEmail) {
    if (!userId || !parentEmail) return 0;

    try {
      const { data: existingLinks } = await supabase
        .from("parent_players")
        .select("player_id")
        .eq("user_id", userId);

      const existingIds = new Set((existingLinks || []).map(row => row.player_id));

      const { data: candidatePlayers, error: playerError } = await supabase
        .from("players")
        .select("id,parent_email,squad_key,name")
        .ilike("parent_email", parentEmail);

      if (playerError) {
        console.warn("Could not check migrated children", playerError);
        return 0;
      }

      const rowsToInsert = (candidatePlayers || [])
        .filter(player => !existingIds.has(player.id))
        .map(player => ({
          user_id: userId,
          player_id: player.id,
        }));

      if (!rowsToInsert.length) return 0;

      const { error: linkError } = await supabase
        .from("parent_players")
        .insert(rowsToInsert);

      if (linkError) {
        console.warn("Could not auto-link migrated children", linkError);
        return 0;
      }

      return rowsToInsert.length;
    } catch (claimError) {
      console.warn("Auto-link migrated children failed", claimError);
      return 0;
    }
  }

  async function handleCreateOrContinue(event) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");

    const loginEmail = cleanEmail();

    if (!loginEmail || !password) {
      setLoading(false);
      setError("Enter your email and choose a password.");
      return;
    }

    await logMigrationAudit("auth_attempt", loginEmail, { mode: "create_or_continue" });

    const loginResult = await supabase.auth.signInWithPassword({
      email: loginEmail,
      password,
    });

    if (!loginResult.error && loginResult.data?.user?.id) {
      const linkedCount = await claimMigratedChildren(loginResult.data.user.id, loginEmail);
      await logMigrationAudit(
        "login",
        loginEmail,
        { method: "password", linked_children: linkedCount },
        loginResult.data.user.id
      );
      saveRememberedEmail(loginEmail);
      setLoading(false);
      return;
    }

    const signupResult = await supabase.auth.signUp({
      email: loginEmail,
      password,
      options: {
        emailRedirectTo: window.location.origin,
        data: {
          squad_key: selectedSquad || squadKey || squadConfig?.key || null,
        },
      },
    });

    if (signupResult.error) {
      await logMigrationAudit("auth_failed", loginEmail, {
        login_error: loginResult.error?.message || null,
        signup_error: signupResult.error.message,
      });

      setLoading(false);

      const errorText = String(signupResult.error.message || "").toLowerCase();
      if (errorText.includes("already") || errorText.includes("registered") || errorText.includes("exists")) {
        setError(
          "This email already has an account. Please use the password you created, or ask Elaine/SuperAdmin to reset it manually."
        );
      } else {
        setError(signupResult.error.message);
      }
      return;
    }

    const userId = signupResult.data?.user?.id || null;
    const linkedCount = await claimMigratedChildren(userId, loginEmail);

    await logMigrationAudit(
      "account_created",
      loginEmail,
      {
        method: "create_or_continue",
        linked_children: linkedCount,
        needs_email_confirmation: !signupResult.data?.session,
      },
      userId
    );

    saveRememberedEmail(loginEmail);
    setLoading(false);

    if (signupResult.data?.session) {
      return;
    }

    setMessage("Account created. Check your email if confirmation is required, then log in with the password you just chose.");
    setMode("login");
  }

  async function handleLogin(event) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");

    const loginEmail = cleanEmail();

    const { data, error: loginError } = await supabase.auth.signInWithPassword({
      email: loginEmail,
      password,
    });

    setLoading(false);

    if (loginError) {
      await logMigrationAudit("login_failed", loginEmail, { error: loginError.message });
      setError(loginError.message);
      return;
    }

    const linkedCount = await claimMigratedChildren(data?.user?.id, loginEmail);
    await logMigrationAudit("login", loginEmail, { method: "password", linked_children: linkedCount }, data?.user?.id);
    saveRememberedEmail(loginEmail);
  }

  async function handleForgotPassword(event) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");

    const resetEmail = cleanEmail();

    if (!resetEmail) {
      setLoading(false);
      setError("Enter your email address first.");
      return;
    }

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(
      resetEmail,
      {
        redirectTo: "https://fingallians-shared-platform.vercel.app/",
      }
    );

    setLoading(false);

    if (resetError) {
      await logMigrationAudit("password_reset_failed", resetEmail, { error: resetError.message });
      setError(resetError.message);
      return;
    }

    await logMigrationAudit("password_reset_requested", resetEmail);
    setMessage("Password reset email sent. Check your inbox and spam folder.");
  }

  async function handleResetPassword(event) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");

    if (!resetPassword || resetPassword.length < 8) {
      setLoading(false);
      setError("Password must be at least 8 characters.");
      return;
    }

    if (resetPassword !== confirmResetPassword) {
      setLoading(false);
      setError("Passwords do not match.");
      return;
    }

    const { data: userData } = await supabase.auth.getUser();
    const { error: updateError } = await supabase.auth.updateUser({
      password: resetPassword,
    });

    setLoading(false);

    if (updateError) {
      await logMigrationAudit("password_update_failed", userData?.user?.email || cleanEmail(), { error: updateError.message }, userData?.user?.id || null);
      setError(updateError.message);
      return;
    }

    await logMigrationAudit("password_updated", userData?.user?.email || cleanEmail(), {}, userData?.user?.id || null);
    setPassword(resetPassword);
    setResetPassword("");
    setConfirmResetPassword("");
    setRecoveryMode(false);
    setMode("login");
    setMessage("Password updated. You can now log in with your new password.");

    if (window.location.hash || window.location.search.includes("type=recovery")) {
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }

  const chosenSquad = SQUADS.find(squad => squad.key === selectedSquad);
  const heading =
    mode === "reset"
      ? "Choose New Password"
      : mode === "login"
        ? "Log In"
        : mode === "forgot"
          ? "Reset Password"
          : "Create Password";

  const introText =
    mode === "reset"
      ? "Enter your new password from the reset link."
      : mode === "forgot"
        ? "Enter your email and we'll send a reset link."
        : mode === "login"
          ? "Log in with the password you created."
          : "Existing parents: use the same email address and choose a password. New parents can do the same.";

  return (
    <main className="split-auth-screen">
      {showMigrationPopup ? (
        <div className="migration-auth-popup-backdrop">
          <div className="migration-auth-popup">
            <button
              type="button"
              className="migration-auth-popup-close"
              onClick={() => setShowMigrationPopup(false)}
              aria-label="Close"
            >
              ×
            </button>

            <img src="/fingallians-crest.png" alt="Fingallians crest" />
            <h2>Welcome to the updated app</h2>
            <p>
              We have moved everyone into one shared Fingallians Fitness Challenge app.
            </p>
            <p>
              Parents should enter the same email address used before, then choose a password.
              Your linked children and progress should appear automatically.
            </p>

            <button
              type="button"
              className="button primary"
              onClick={() => setShowMigrationPopup(false)}
            >
              Continue
            </button>
          </div>
        </div>
      ) : null}

      <section className="split-auth-card">
        <div className="split-auth-brand">
          <div className="split-auth-crest">
            <img src="/fingallians-crest.png" alt="Fingallians crest" />
          </div>

          <p className="split-auth-kicker">Fingallians</p>
          <h1>Fitness Challenge</h1>
          <p>
            Select your squad, then continue with your parent email address.
          </p>

          {chosenSquad ? (
            <div className="split-auth-selected">
              <span>Selected Squad</span>
              <strong>{chosenSquad.label}</strong>
            </div>
          ) : null}
        </div>

        <div className="split-auth-panel">
          <div className="split-auth-panel-header">
            <h2>{heading}</h2>
            <p>{introText}</p>
          </div>

          <div className="squad-button-grid">
            {SQUADS.map(squad => (
              <button
                key={squad.key}
                type="button"
                className={
                  selectedSquad === squad.key
                    ? "squad-choice-button active"
                    : "squad-choice-button"
                }
                onClick={() => chooseSquad(squad.key)}
              >
                {squad.label}
              </button>
            ))}
          </div>

          {selectedSquad ? (
            <form
              className="split-auth-form"
              onSubmit={
                mode === "reset"
                  ? handleResetPassword
                  : mode === "forgot"
                    ? handleForgotPassword
                    : mode === "login"
                      ? handleLogin
                      : handleCreateOrContinue
              }
            >
              {mode !== "reset" ? (
                <>
                  <label>Email</label>
                  <input
                    type="email"
                    value={email}
                    autoComplete="email"
                    onChange={event => setEmail(event.target.value)}
                    required
                  />
                </>
              ) : null}

              {mode === "reset" ? (
                <>
                  <label>New password</label>
                  <input
                    type={showPassword ? "text" : "password"}
                    value={resetPassword}
                    autoComplete="new-password"
                    onChange={event => setResetPassword(event.target.value)}
                    required
                  />

                  <label>Confirm new password</label>
                  <input
                    type={showPassword ? "text" : "password"}
                    value={confirmResetPassword}
                    autoComplete="new-password"
                    onChange={event => setConfirmResetPassword(event.target.value)}
                    required
                  />

                  <label className="split-remember-row">
                    <input
                      type="checkbox"
                      checked={showPassword}
                      onChange={event => setShowPassword(event.target.checked)}
                    />
                    <span>Show password</span>
                  </label>
                </>
              ) : mode !== "forgot" ? (
                <>
                  <label>Password</label>
                  <div className="password-input-wrap">
                    <input
                      type={showPassword ? "text" : "password"}
                      value={password}
                      autoComplete={
                        mode === "signup" ? "new-password" : "current-password"
                      }
                      onChange={event => setPassword(event.target.value)}
                      required
                    />

                    <button
                      type="button"
                      className="password-eye-button"
                      onClick={() => setShowPassword(previous => !previous)}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? (
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                          <path d="M2.3 4.3 4 2.6l17.7 17.7-1.7 1.7-3.1-3.1A11.7 11.7 0 0 1 12 20C6.5 20 2.2 15.9 1 12c.6-2 2-4 3.9-5.5L2.3 4.3Zm5.4 5.4a4.4 4.4 0 0 0 5.6 5.6l-1.9-1.9a1.8 1.8 0 0 1-1.8-1.8L7.7 9.7ZM12 4c5.5 0 9.8 4.1 11 8-.4 1.5-1.4 3-2.6 4.3l-3-3A4.5 4.5 0 0 0 10.7 6.6L8.6 4.5A11.7 11.7 0 0 1 12 4Z" />
                        </svg>
                      ) : (
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                          <path d="M12 4c5.5 0 9.8 4.1 11 8-1.2 3.9-5.5 8-11 8S2.2 15.9 1 12c1.2-3.9 5.5-8 11-8Zm0 13a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0-2.6a2.4 2.4 0 1 1 0-4.8 2.4 2.4 0 0 1 0 4.8Z" />
                        </svg>
                      )}
                    </button>
                  </div>

                  <label className="split-remember-row">
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={event => setRememberMe(event.target.checked)}
                    />
                    <span>Keep me logged in on this device</span>
                  </label>
                </>
              ) : null}

              {error ? <p className="split-form-error">{error}</p> : null}
              {message ? <p className="split-form-message">{message}</p> : null}

              <button className="split-auth-submit" disabled={loading}>
                {loading
                  ? "Please wait…"
                  : mode === "reset"
                    ? "Save New Password"
                    : mode === "forgot"
                      ? "Send Reset Email"
                      : mode === "login"
                        ? "Log In"
                        : "Create Password & Continue"}
              </button>
            </form>
          ) : (
            <div className="select-squad-empty">
              <span>👆</span>
              <strong>Select a squad to continue</strong>
            </div>
          )}

          <div className="split-auth-links">
            {mode === "reset" ? (
              <button type="button" onClick={() => setMode("login")}>
                Back to login
              </button>
            ) : mode === "signup" ? (
              <>
                <button type="button" onClick={() => setMode("login")}>
                  I already created a password
                </button>

                <button type="button" onClick={() => setMode("forgot")}>
                  Forgot password?
                </button>
              </>
            ) : mode === "login" ? (
              <>
                <button type="button" onClick={() => setMode("signup")}>
                  Create password / account
                </button>

                <button type="button" onClick={() => setMode("forgot")}>
                  Forgot password?
                </button>
              </>
            ) : (
              <button type="button" onClick={() => setMode("signup")}>
                Back to create password
              </button>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
