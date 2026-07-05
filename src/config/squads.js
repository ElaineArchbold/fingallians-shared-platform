export const SQUADS = {
  "2014-boys": {
    key: "2014-boys",
    squad: "2014 Boys",
    shortLabel: "2014 Boys",
    whatsappUrl: "https://chat.whatsapp.com/F3A0lBj6293JQD2oghSoAx",
    showFridayNightHurling: true,
  },
  "2015-girls": {
    key: "2015-girls",
    squad: "2015 Girls",
    shortLabel: "2015 Girls",
    whatsappUrl: "https://chat.whatsapp.com/Bc76P9R4TJvHbbdQ2xEhhA",
    showFridayNightHurling: true,
  },
  "2017-boys": {
    key: "2017-boys",
    squad: "2017 Boys",
    shortLabel: "2017 Boys",
    whatsappUrl: "https://chat.whatsapp.com/FJLfHJpjKbi6KFGzHbpEoQ",
    showFridayNightHurling: false,
  },
  "2017-girls": {
    key: "2017-girls",
    squad: "2017 Girls",
    shortLabel: "2017 Girls",
    whatsappUrl: "https://chat.whatsapp.com/CUeI5EKF8HOGo0hucgSEPF",
    showFridayNightHurling: false,
  },
};

export const SQUAD_KEYS = Object.keys(SQUADS);

export function getSquadKeyFromHost(hostname = window.location.hostname) {
  const host = hostname.toLowerCase();
  if (host.includes("fingallians-girls-2017")) return "2017-girls";
  if (host.includes("fingallians-boys-2017")) return "2017-boys";
  if (host.includes("fingallians-girls")) return "2015-girls";
  if (host.includes("fingallians-app")) return "2014-boys";
  return import.meta.env.VITE_SQUAD_KEY || "2015-girls";
}

export function getSquadKeyFromSearch(search = window.location.search) {
  const params = new URLSearchParams(search);
  const squad = params.get("squad") || params.get("s");
  return SQUADS[squad] ? squad : null;
}

export function getInitialSquadKey() {
  return getSquadKeyFromSearch() || getSquadKeyFromHost();
}

export function getSquadConfig(key) {
  return SQUADS[key] || SQUADS["2015-girls"];
}

export function squadNameMatches(value, squadConfig) {
  return String(value || "").trim().toLowerCase() === String(squadConfig?.squad || "").trim().toLowerCase();
}