import { useEffect, useState } from "react";

const REMEMBER_EMAIL_KEY = "fingalliansRememberedEmail";
const KEEP_LOGGED_IN_KEY = "fingalliansKeepLoggedIn";

const SQUADS = [
  { key: "2014-boys", label: "2014 Boys" },
  { key: "2015-girls", label: "2015 Girls" },
  { key: "2017-boys", label: "2017 Boys" },
  { key: "2017-girls", label: "2017 Girls" },
];

const APP_URL = "https://fingallians-shared-platform.vercel.app";

function getFromApp() {
  try {
    return new URLSearchParams(window.location.search).get("from_app") || "direct";
  } catch {
    return "direct";
  }
}

async function writeAudit(supabase, event, email, details = {}, parentUserId = null) {
  try {
    await supabase.from("migration_audit").insert({
      parent_email: email || null,
      parent_user_id: parentUserId || null,
      event,
      details: {
        from_app: getFromApp(),
        url: window.location.href,
        user_agent: navigator.userAgent,
        ...details,
      },
    });
  } catch (error) {
    console.warn("migration audit failed", error);
  }
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
  const [showMigrationNote, setShowMigrationNote] = useState(true);
  const [resetMode, setResetMode] = useState(false);
  const [resetPassword, setResetPassword] = useState("");
  const [confirmResetPassword, setConfirmResetPassword] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlMode = params.get("mode");

    if (urlMode === "signup" || urlMode === "create") {
      setMode("signup");
      setShowMigrationNote(true);
    }

    if (window.location.hash.includes("type=recovery") || params.get("type") === "recovery") {
      setResetMode(true);
      setMode("reset");
      setShowMigrationNote(false);
    }

    const rememberedEmail = localStorage.getItem(REMEMBER_EMAIL_KEY);

    if (rememberedEmail) {
      setEmail(rememberedEmail);
      setRememberMe(true);
    }
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

  async function handleLogin(event) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");

    const loginEmail = cleanEmail();
    await writeAudit(supabase, "login_attempt", loginEmail, { mode: "login", squad_key: selectedSquad });

    const { data, error: loginError } = await supabase.auth.signInWithPassword({
      email: loginEmail,
      password,
    });

    setLoading(false);

    if (loginError) {
      await writeAudit(supabase, "login_failed", loginEmail, {
        mode: "login",
        squad_key: selectedSquad,
        message: loginError.message,
      });
      setError(loginError.message);
      return;
    }

    saveRememberedEmail(loginEmail);
    await writeAudit(supabase, "login_success", loginEmail, { mode: "login", squad_key: selectedSquad }, data?.user?.id);
  }

  async function handleSignup(event) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");

    const signupEmail = cleanEmail();
    await writeAudit(supabase, "create_password_attempt", signupEmail, {
      mode: "signup",
      squad_key: selectedSquad,
    });

    const loginFirst = await supabase.auth.signInWithPassword({
      email: signupEmail,
      password,
    });

    if (!loginFirst.error) {
      saveRememberedEmail(signupEmail);
      setLoading(false);
      await writeAudit(supabase, "login_success_existing_account", signupEmail, {
        mode: "signup_login_first",
        squad_key: selectedSquad,
      }, loginFirst.data?.user?.id);
      return;
    }

    const { data, error: signupError } = await supabase.auth.signUp({
      email: signupEmail,
      password,
      options: {
        emailRedirectTo: APP_URL,
      },
    });

    setLoading(false);

    if (signupError) {
      await writeAudit(supabase, "create_password_failed", signupEmail, {
        mode: "signup",
        squad_key: selectedSquad,
        message: signupError.message,
      });
      setError(signupError.message);
      return;
    }

    saveRememberedEmail(signupEmail);
    await writeAudit(supabase, "create_password_success", signupEmail, {
      mode: "signup",
      squad_key: selectedSquad,
    }, data?.user?.id);

    setMessage("Password created. If you are not brought in automatically, use Log In with the same email and password.");
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

    await writeAudit(supabase, "forgot_password_requested", resetEmail, {
      mode: "forgot",
      squad_key: selectedSquad,
    });

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(
      resetEmail,
      {
        redirectTo: `${APP_URL}/?mode=reset`,
      }
    );

    setLoading(false);

    if (resetError) {
      await writeAudit(supabase, "forgot_password_failed", resetEmail, {
        message: resetError.message,
        squad_key: selectedSquad,
      });
      setError(resetError.message);
      return;
    }

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

    const { error: updateError } = await supabase.auth.updateUser({
      password: resetPassword,
    });

    setLoading(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setMessage("Password updated. You can now continue into the app.");
    setResetPassword("");
    setConfirmResetPassword("");
  }

  const chosenSquad = SQUADS.find(squad => squad.key === selectedSquad);
  const heading =
    mode === "signup"
      ? "Create Password"
      : mode === "forgot"
        ? "Reset Password"
        : resetMode
          ? "Choose New Password"
          : "Log In";

  return (
    <main className="split-auth-screen">
      {showMigrationNote && mode === "signup" ? (
        <div className="migration-note-backdrop">
          <div className="migration-note-modal">
            <button
              type="button"
              className="migration-note-close"
              onClick={() => setShowMigrationNote(false)}
            >
              ×
            </button>
            <h2>Welcome to the new app 🎉</h2>
            <p>
              Please enter the same email address you used before, then add a
              password. Your linked children, progress, runs, XP and badges should
              still be there.
            </p>
            <button className="button primary" onClick={() => setShowMigrationNote(false)}>
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
            Select your squad, then continue with your parent account.
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
            <p>
              {mode === "signup"
                ? "Use your same email address and choose a password."
                : mode === "forgot"
                  ? "Enter your email and we'll send a reset link."
                  : resetMode
                    ? "Enter your new password below."
                    : "Log in with your email and password."}
            </p>
          </div>

          {!resetMode ? (
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
          ) : null}

          {resetMode ? (
            <form className="split-auth-form" onSubmit={handleResetPassword}>
              <label>New password</label>
              <input
                type="password"
                value={resetPassword}
                autoComplete="new-password"
                onChange={event => setResetPassword(event.target.value)}
                required
                minLength={8}
              />

              <label>Confirm new password</label>
              <input
                type="password"
                value={confirmResetPassword}
                autoComplete="new-password"
                onChange={event => setConfirmResetPassword(event.target.value)}
                required
                minLength={8}
              />

              {error ? <p className="split-form-error">{error}</p> : null}
              {message ? <p className="split-form-message">{message}</p> : null}

              <button className="split-auth-submit" disabled={loading}>
                {loading ? "Saving…" : "Save New Password"}
              </button>
            </form>
          ) : selectedSquad ? (
            <form
              className="split-auth-form"
              onSubmit={
                mode === "signup"
                  ? handleSignup
                  : mode === "forgot"
                    ? handleForgotPassword
                    : handleLogin
              }
            >
              <label>Email</label>
              <input
                type="email"
                value={email}
                autoComplete="email"
                onChange={event => setEmail(event.target.value)}
                required
              />

              {mode !== "forgot" ? (
                <>
                  <label>{mode === "signup" ? "Add password" : "Password"}</label>
                  <div className="password-input-wrap">
                    <input
                      type={showPassword ? "text" : "password"}
                      value={password}
                      autoComplete={
                        mode === "signup" ? "new-password" : "current-password"
                      }
                      onChange={event => setPassword(event.target.value)}
                      required
                      minLength={8}
                    />

                    <button
                      type="button"
                      className="password-eye-button"
                      onClick={() => setShowPassword(previous => !previous)}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? "Hide" : "Show"}
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
                  : mode === "signup"
                    ? "Create Password / Continue"
                    : mode === "forgot"
                      ? "Send Reset Email"
                      : "Log In"}
              </button>
            </form>
          ) : (
            <div className="select-squad-empty">
              <span>👆</span>
              <strong>Select a squad to continue</strong>
            </div>
          )}

          {!resetMode ? (
            <div className="split-auth-links">
              {mode === "login" ? (
                <>
                  <button type="button" onClick={() => setMode("signup")}>
                    Create password
                  </button>

                  <button type="button" onClick={() => setMode("forgot")}>
                    Forgot password?
                  </button>
                </>
              ) : (
                <button type="button" onClick={() => setMode("login")}>
                  I already have a password
                </button>
              )}
            </div>
          ) : null}
        </div>
      </section>
    </main>
  );
}
