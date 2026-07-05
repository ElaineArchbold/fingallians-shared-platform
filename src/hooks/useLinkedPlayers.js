import { useEffect, useState } from "react";

export function useLinkedPlayers(supabase, session, squadConfig) {
  const [players, setPlayers] = useState([]);
  const [playersLoaded, setPlayersLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadPlayers() {
      if (!supabase || !session?.user?.id || !squadConfig?.key) {
        setPlayers([]);
        setPlayersLoaded(true);
        return;
      }

      setPlayersLoaded(false);

      try {
        const { data: links, error: linkError } = await supabase
          .from("parent_players")
          .select("player_id")
          .eq("user_id", session.user.id);

        if (linkError) throw linkError;

        const ids = [...new Set((links || []).map(l => l.player_id).filter(Boolean))];

        if (!ids.length) {
          if (!cancelled) setPlayers([]);
          return;
        }

        const { data: players, error: playerError } = await supabase
          .from("players")
          .select("id,name,squad,squad_key,child_access_token")
          .in("id", ids)
          .eq("squad_key", squadConfig.key)
          .order("name");

        if (playerError) throw playerError;

        if (!cancelled) {
          setPlayers(players || []);
        }
      } catch (err) {
        console.error(err);
        if (!cancelled) setPlayers([]);
      } finally {
        if (!cancelled) setPlayersLoaded(true);
      }
    }

    loadPlayers();

    return () => {
      cancelled = true;
    };
  }, [supabase, session?.user?.id, squadConfig?.key]);

  return { players, playersLoaded };
}