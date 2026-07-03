import { useEffect, useState } from "react";
import { squadNameMatches } from "../config/squads";

export function useLinkedPlayers(supabase, session, squadConfig) {
  const [players, setPlayers] = useState([]);
  const [playersLoaded, setPlayersLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadPlayers() {
      if (!supabase || !session?.user?.id || !squadConfig) {
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

        const { data: allPlayers, error: playerError } = await supabase
          .from("players")
          .select("id,name,squad,child_access_token")
          .in("id", ids)
          .order("name");

        if (playerError) throw playerError;

        const filtered = (allPlayers || []).filter(p => squadNameMatches(p.squad, squadConfig));
        if (!cancelled) setPlayers(filtered);
      } catch (e) {
        console.error("Linked players lookup failed", e);
        if (!cancelled) setPlayers([]);
      } finally {
        if (!cancelled) setPlayersLoaded(true);
      }
    }

    loadPlayers();
    return () => { cancelled = true; };
  }, [supabase, session?.user?.id, squadConfig?.key]);

  return { players, playersLoaded };
}
