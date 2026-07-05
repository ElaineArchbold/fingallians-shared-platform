import { useState } from "react";

const FEATURES = [
  { icon: "🏃", title: "GPS Runs", text: "Track and save verified runs" },
  { icon: "📈", title: "Progress", text: "Follow weekly challenge progress" },
  { icon: "🏆", title: "Leaderboards", text: "Celebrate effort and consistency" },
  { icon: "🛡️", title: "Admin Tools", text: "Squad dashboard and proof review" },
];

const SQUADS = [
  { key: "2014-boys", label: "2014 Boys" },
  { key: "2015-girls", label: "2015 Girls" },
  { key: "2017-girls", label: "2017 Girls" },
  { key: "2017-boys", label: "2017 Boys" },
];
export default function AuthPanel({
  supabase,
  squadConfig,
  squadKey,
  onSelectSquad,
}) {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setMessage("");

    const authPayload = { email, password };
    const result =
      mode === "login"
        ? await supabase.auth.signInWithPassword(authPayload)
        : await supabase.auth.signUp(authPayload);

   if (result.error) {
  setMessage(result.error.message);
} else {
  if (mode === "signup") {
    setMode("login");
    setPassword("");
    setMessage("Account created successfully. Please sign in.");
  } else {
    setMessage("Signed in.");
  }
}
    setBusy(false);
  }

  return (
    <div className="login-shell">
      <section className="brand-panel">
        <div className="brand-glow" />

        <div className="crest-wrap">
          <img src="/fingallians-crest.png" alt="Fingallians crest" />
        </div>

        <div className="brand-copy">
          <div className="eyebrow">Summer 2026</div>
          <h1>Fingallians Fitness Challenge</h1>
          <p>
            One shared platform for parents, players, coaches and squad admins.
          </p>
        </div>

        <div className="feature-grid">
          {FEATURES.map(feature => (
            <div className="feature-card" key={feature.title}>
              <div className="feature-icon">{feature.icon}</div>
              <div>
                <strong>{feature.title}</strong>
                <span>{feature.text}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="login-panel">
        <div className="login-heading">
          <span>Step 1</span>
          <h2>Select your squad</h2>

          <div className="squad-grid" style={{ margin: "20px 0" }}>
            {SQUADS.map(squad => (
              <button
                type="button"
                key={squad.key}
                className={
                  squadKey === squad.key
                    ? "button primary login-squad-button"
                    : "button secondary login-squad-button"
                }
                onClick={() => onSelectSquad(squad.key)}
              >
                {squad.label}
              </button>
            ))}
          </div>

          <span>Step 2</span>
          <h2>{mode === "login" ? "Sign in" : "Create account"}</h2>

          <p>
            Sign in as a Parent / Guardian, Admin or Super Admin.
          </p>
        </div>

        <form onSubmit={submit} className="form">
          <label className="label">Email</label>
          <input
            className="input"
            value={email}
            onChange={e => setEmail(e.target.value)}
            type="email"
            autoComplete="email"
            required
            disabled={!squadKey}
          />

          <label className="label">Password</label>

          <div className="password-field">
            <input
              className="input"
              value={password}
              onChange={e => setPassword(e.target.value)}
              type={showPassword ? "text" : "password"}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              required
              disabled={!squadKey}
            />

            <button
              type="button"
              className="password-toggle"
              onClick={() => setShowPassword(!showPassword)}
              disabled={!squadKey}
            >
              {showPassword ? "🙈" : "👁️"}
            </button>
          </div>

          <button className="button primary" disabled={busy || !squadKey}>
            {busy ? "Please wait..." : mode === "login" ? "Sign In" : "Create Account"}
          </button>
        </form>
        <button
          className="link-button"
          onClick={() => {
            setMode(mode === "login" ? "signup" : "login");
            setMessage("");
          }}
        >
          {mode === "login"
            ? "Need an account? Create one"
            : "Already have an account? Sign in"}
        </button>

        {message && <div className="message">{message}</div>}
      </section>
    </div>
  );
}
