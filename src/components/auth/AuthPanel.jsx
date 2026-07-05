import { useEffect, useState } from "react";

const REMEMBER_EMAIL_KEY = "fingalliansRememberedEmail";

export default function AuthPanel({ supabase, squadKey, onSelectSquad }) {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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

  function cleanEmail() {
    return email.trim().toLowerCase();
  }

  function saveRememberedEmail(value) {
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

  const heading =
    mode === "signup"
      ? "Create Account"
      : mode === "forgot"
        ? "Reset Password"
        : "Fitness Challenge";

  return (
    <main className="fg-auth-screen">
      <section className="fg-auth-card">
        <div className="fg-auth-logo">
          <img src="/fingallians-crest.png" alt="Fingallians crest" />
        </div>

        <div className="fg-auth-kicker">Fingallians</div>
        <h1>{heading}</h1>

        <p className="fg-auth-subtitle">
          {mode === "forgot"
            ? "Enter your email and we'll send a reset link."
            : "Log in to manage your child's weekly challenge."}
        </p>

        <form
          className="fg-auth-form"
          onSubmit={
            mode === "signup"
              ? handleSignup
              : mode === "forgot"
                ? handleForgotPassword
                : handleLogin
          }
        >
          <label>Squad</label>
          <select value={squadKey} onChange={event => onSelectSquad(event.target.value)}>
            <option value="2014-boys">2014 Boys</option>
            <option value="2015-girls">2015 Girls</option>
            <option value="2017-boys">2017 Boys</option>
            <option value="2017-girls">2017 Girls</option>
          </select>

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
              <input
                type="password"
                value={password}
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                onChange={event => setPassword(event.target.value)}
                required
              />

              <label className="fg-remember-row">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={event => setRememberMe(event.target.checked)}
                />
                <span>Remember me on this device</span>
              </label>
            </>
          ) : null}

          {error ? <p className="fg-form-error">{error}</p> : null}
          {message ? <p className="fg-form-message">{message}</p> : null}

          <button className="fg-auth-submit" disabled={loading}>
            {loading
              ? "Please wait…"
              : mode === "signup"
                ? "Create Account"
                : mode === "forgot"
                  ? "Send Reset Email"
                  : "Log In"}
          </button>
        </form>

        <div className="fg-auth-links">
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
      </section>
    </main>
  );
}
