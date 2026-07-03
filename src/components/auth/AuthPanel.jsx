import { useState } from "react";

export default function AuthPanel({ supabase }) {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setMessage("");

    const fn = mode === "login" ? supabase.auth.signInWithPassword : supabase.auth.signUp;
    const { error } = await fn.call(supabase.auth, { email, password });

    if (error) setMessage(error.message);
    else setMessage(mode === "login" ? "Signed in." : "Check your email to confirm your account.");

    setBusy(false);
  }

  return (
    <div className="auth-panel">
      <h1>Fingallians Fitness Challenge</h1>
      <p>Parent / Guardian, Admin and Super Admin access.</p>

      <form onSubmit={submit} className="form">
        <label className="label">Email</label>
        <input className="input" value={email} onChange={e => setEmail(e.target.value)} type="email" required />

        <label className="label">Password</label>
        <input className="input" value={password} onChange={e => setPassword(e.target.value)} type="password" required />

        <button className="button primary" disabled={busy}>
          {busy ? "Please wait..." : mode === "login" ? "Sign In" : "Create Account"}
        </button>
      </form>

      <button className="link-button" onClick={() => setMode(mode === "login" ? "signup" : "login")}>
        {mode === "login" ? "Need an account? Create one" : "Already have an account? Sign in"}
      </button>

      {message && <div className="message">{message}</div>}
    </div>
  );
}
