import { useMemo, useState } from "react";
import { getInitialSquadKey, getSquadConfig, SQUADS } from "../config/squads";

export function useSquadSelection() {
  const [squadKey, setSquadKeyState] = useState(() => {
    try {
      const stored = localStorage.getItem("selectedSquadKey");
      return SQUADS[stored] ? stored : getInitialSquadKey();
    } catch {
      return getInitialSquadKey();
    }
  });

  function setSquadKey(nextKey) {
    if (!SQUADS[nextKey]) return;
    setSquadKeyState(nextKey);
    try { localStorage.setItem("selectedSquadKey", nextKey); } catch {}
  }

  const squadConfig = useMemo(() => getSquadConfig(squadKey), [squadKey]);
  return { squadKey, squadConfig, setSquadKey };
}
