import { useEffect, useState } from "react";

export function useAuth(supabase) {
  const [session, setSession] = useState(null);
  const [authLoaded, setAuthLoaded] = useState(false);

  useEffect(() => {
    if (!supabase) {
      setSession(null);
      setAuthLoaded(true);
      return;
    }

    let mounted = true;
    setAuthLoaded(false);

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session || null);
      setAuthLoaded(true);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession || null);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  return { session, authLoaded };
}
