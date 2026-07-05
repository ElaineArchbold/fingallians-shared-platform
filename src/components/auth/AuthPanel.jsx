import { useEffect, useState } from "react";

const REMEMBER_EMAIL_KEY = "fingalliansRememberedEmail";

export default function AuthPanel({
  supabase,
  squadConfig,
  squadKey,
  onSelectSquad,
}) {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const remembered = localStorage.getItem(REMEMBER_EMAIL_KEY);

    if (remembered) {
      setEmail(remembered);
      setRememberMe(true);
    }
  }, []);

  function rememberEmailIfNeeded(value) {
    if (rememberMe) {
      localStorage.setItem(REMEMBER_EMAIL_KEY, value);
    } else {
      localStorage.removeItem(REMEMBER_EMAIL_KEY);
    }
  }

  async function handleLogin(event) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");

    const cleanEmail = email.trim().toLowerCase();

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: cleanEmail,
      password,
    });

    setLoading(false);

    if (signInError) {
      setError(signInError.message);
      return;
    }

    rememberEmailIfNeeded(cleanEmail);
  }

  async function handleSignup(event) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");

    const cleanEmail = email.trim().toLowerCase();

    const { error: signUpError } = await supabase.auth.signUp({
      email: cleanEmail,
      password,
      options: {
        emailRedirectTo: window.location.origin,
      },
    });

    setLoading(false);

    if (signUpError) {
      setError(signUpError.message);
      return;
    }

    rememberEmailIfNeeded(cleanEmail);
    setMessage("Account created. Check your email if confirmation is required, then log in.");
    setMode("login");
  }

  async function handleForgotPassword(event) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");

    const cleanEmail = email.trim().toLowerCase();

    if (!cleanEmail) {
      setLoading(false);
      setError("Enter your email address first.");
      return;
    }

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(
      cleanEmail,
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

  return (
    <div className="auth-page">
      <section className="auth-card">
        <div className="auth-logo-wrap">
          <img src="/fingallians-crest.png" alt="Fingallians crest" />
        </div>

        <p className="eyebrow">Fingallians</p>
        <h1>Fitness Challenge</h1>
        <p className="muted">
          Log in to manage your child's weekly challenge.
        </p>

        <label className="label">Squad</label>
        <select
          className="select"
          value={squadKey}
          onChange={event => onSelectSquad(event.target.value)}
        >
          <option value="2014-boys">2014 Boys</option>
          <option value="2015-girls">2015 Girls</option>
          <option value="2017-boys">2017 Boys</option>
          <option value="2017-girls">2017 Girls</option>
        </select>

        <form
          className="auth-form"
          onSubmit={
            mode === "signup"
              ? handleSignup
              : mode === "forgot"
                ? handleForgotPassword
                : handleLogin
          }
        >
          <label className="label">Email</label>
          <input
            className="input"
            type="email"
            value={email}
            autoComplete="email"
            onChange={event => setEmail(event.target.value)}
            required
          />

          {mode !== "forgot" ? (
            <>
              <label className="label">Password</label>
              <input
                className="input"
                type="password"
                value={password}
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                onChange={event => setPassword(event.target.value)}
                required
              />
            </>
          ) : null}

          {mode !== "forgot" ? (
            <label className="remember-row">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={event => setRememberMe(event.target.checked)}
              />
              <span>Remember me on this device</span>
            </label>
          ) : null}

          {error ? <p className="form-error">{error}</p> : null}
          {message ? <p className="form-message">{message}</p> : null}

          <button className="button primary" disabled={loading}>
            {loading
              ? "Please wait…"
              : mode === "signup"
                ? "Create Account"
                : mode === "forgot"
                  ? "Send Reset Email"
                  : "Log In"}
          </button>
        </form>

        <div className="auth-link-row">
          {mode !== "login" ? (
            <button type="button" onClick={() => setMode("login")}>
              Back to login
            </button>
          ) : (
            <>
              <button type="button" onClick={() => setMode("signup")}>
                Create account
              </button>

              <button type="button" onClick={() => setMode("forgot")}>
                Forgot password?
              </button>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
