import { useEffect, useState } from "react";

export function useTermsAcceptance(supabase, session, squadConfig) {
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [termsAcceptedAt, setTermsAcceptedAt] = useState("");
  const [termsLoaded, setTermsLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadTermsAcceptance() {
      if (!session?.user?.id) {
        if (!cancelled) {
          setTermsAccepted(false);
          setTermsAcceptedAt("");
          setTermsLoaded(true);
        }

        return;
      }

      setTermsLoaded(false);

      const { data, error } = await supabase
        .from("terms_acceptances")
        .select("id,accepted_at,terms_version,squad_key,user_email")
        .eq("user_id", session.user.id)
        .eq("squad_key", squadConfig?.key || "")
        .order("accepted_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (cancelled) return;

      if (error) {
        console.error("Terms acceptance load error:", error);
        setTermsAccepted(false);
        setTermsAcceptedAt("");
        setTermsLoaded(true);
        return;
      }

      setTermsAccepted(Boolean(data?.id));
      setTermsAcceptedAt(data?.accepted_at || "");
      setTermsLoaded(true);
    }

    loadTermsAcceptance();

    return () => {
      cancelled = true;
    };
  }, [supabase, session?.user?.id, squadConfig?.key]);

  return {
    termsAccepted,
    termsAcceptedAt,
    termsLoaded,
  };
}
