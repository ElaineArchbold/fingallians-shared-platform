import { useState } from "react";
import TermsText from "./TermsText";

export default function TermsAndConditions({
  supabase,
  session,
  squadConfig,
  onAccepted,
  readOnly = false,
}) {
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState("");

  async function acceptTerms() {
    if (!session?.user?.id) return;

    setAccepting(true);
    setError("");

    const { error: upsertError } = await supabase
      .from("terms_acceptances")
      .upsert(
        {
          user_id: session.user.id,
          user_email: session.user.email || null,
          squad_key: squadConfig?.key || null,
          terms_version: "2026-summer-challenge-v1",
          accepted_at: new Date().toISOString(),
        },
        {
          onConflict: "user_id,squad_key",
        }
      );

    setAccepting(false);

    if (upsertError) {
      console.error(upsertError);
      setError(upsertError.message);
      return;
    }

    onAccepted?.();
  }

  return (
    <div className="terms-panel">
      <TermsText />

      {error ? <p className="form-error">{error}</p> : null}

      {!readOnly ? (
        <button
          className="button primary"
          disabled={accepting}
          onClick={acceptTerms}
        >
          {accepting ? "Saving…" : "I Accept"}
        </button>
      ) : null}
    </div>
  );
}
