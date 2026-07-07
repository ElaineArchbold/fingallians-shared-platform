import { useEffect, useState } from "react";

const REMEMBER_EMAIL_KEY = "fingalliansRememberedEmail";
const KEEP_LOGGED_IN_KEY = "fingalliansKeepLoggedIn";

const SQUADS = [
  { key: "2014-boys", label: "2014 Boys" },
  { key: "2015-girls", label: "2015 Girls" },
  { key: "2017-boys", label: "2017 Boys" },
  { key: "2017-girls", label: "2017 Girls" },
];

export default function AuthPanel({
  supabase,
  squadConfig,
  squadKey,
  onSelectSquad,
}) {
  const [mode, setMode] = useState("login");
  const [selectedSquad, setSelectedSquad] = useState(squadKey || "");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
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

    const { error: loginError } = await supabase.auth.signInWithPassword({
      email: loginEmail,
      password,
    });

    setLoading(false);

    if (loginError) {
      setError(loginError.message);
      return;
    }

    saveRememberedEmail(loginEmail);
  }

  async function handleSignup(event) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");

    const signupEmail = cleanEmail();

    const { error: signupError } = await supabase.auth.signUp({
      email: signupEmail,
      password,
      options: {
        emailRedirectTo: window.location.origin,
      },
    });

    setLoading(false);

    if (signupError) {
      setError(signupError.message);
      return;
    }

    saveRememberedEmail(signupEmail);
    setMode("login");
    setMessage("Account created. Check your email if confirmation is required, then log in.");
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
        redirectTo: window.location.origin,
      }
    );

    setLoading(false);

    if (resetError) {
      setError(resetError.message);
      return;
    }

    setMessage("Password reset email sent. Check your inbox.");
  }

  const chosenSquad = SQUADS.find(squad => squad.key === selectedSquad);
  const heading =
    mode === "signup"
      ? "Create Account"
      : mode === "forgot"
        ? "Reset Password"
        : "Log In";

  return (
    <main className="split-auth-screen">
      <section className="split-auth-card">
        <div className="split-auth-brand">
          <div className="split-auth-crest">
            <img src="/fingallians-crest.png" alt="Fingallians crest" />
          </div>

          <p className="split-auth-kicker">Fingallians</p>
          <h1>Fitness Challenge</h1>
          <p>
            Select your squad, then log in to manage your child's weekly challenge.
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
              {mode === "forgot"
                ? "Enter your email and we'll send a reset link."
                : "Choose your squad to continue."}
            </p>
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
                  : mode === "signup"
                    ? "Create Account"
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

          <div className="split-auth-links">
            {mode === "login" ? (
              <>
                <button type="button" onClick={() => setMode("signup")}>
                  Create account
                </button>

                <button type="button" onClick={() => setMode("forgot")}>
                  Forgot password?
                </button>
              </>
            ) : (
              <button type="button" onClick={() => setMode("login")}>
                Back to login
              </button>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
