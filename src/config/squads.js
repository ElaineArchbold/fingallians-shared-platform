export const SQUADS = {
  "2014-boys": {
    key: "2014-boys",
    dbProject: "boys",
    squad: "2014 Boys",
    legacySquad: "2014 Boys",
    appSquad: "2014 Boys",
    label: "Fingallians Fitness Challenge",
    shortLabel: "2014 Boys",
    whatsappUrl: "https://chat.whatsapp.com/F3A0lBj6293JQD2oghSoAx",
    vercelUrl: "https://fingallians-app.vercel.app/",
    showFridayNightHurling: true,
  },
  "2015-girls": {
    key: "2015-girls",
    dbProject: "girls",
    squad: "2015 Girls",
    legacySquad: "2015",
    appSquad: "2015",
    label: "Fingallians Fitness Challenge",
    shortLabel: "2015 Girls",
    whatsappUrl: "https://chat.whatsapp.com/Bc76P9R4TJvHbbdQ2xEhhA",
    vercelUrl: "https://fingallians-girls.vercel.app/",
    showFridayNightHurling: true,
  },
  "2017-boys": {
    key: "2017-boys",
    dbProject: "boys",
    squad: "2017 Boys",
    legacySquad: "2017 Boys",
    appSquad: "2017 Boys",
    label: "Fingallians Fitness Challenge",
    shortLabel: "2017 Boys",
    whatsappUrl: "https://chat.whatsapp.com/FJLfHJpjKbi6KFGzHbpEoQ",
    vercelUrl: "https://fingallians-boys-2017.vercel.app/",
    showFridayNightHurling: false,
  },
  "2017-girls": {
    key: "2017-girls",
    dbProject: "girls",
    squad: "2017 Girls",
    legacySquad: "2017",
    appSquad: "2017",
    label: "Fingallians Fitness Challenge",
    shortLabel: "2017 Girls",
    whatsappUrl: "https://chat.whatsapp.com/CUeI5EKF8HOGo0hucgSEPF",
    vercelUrl: "https://fingallians-girls-2017.vercel.app/",
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
  const val = String(value || "").trim().toLowerCase();
  const names = [
    squadConfig.key,
    squadConfig.squad,
    squadConfig.legacySquad,
    squadConfig.appSquad,
    squadConfig.shortLabel,
    squadConfig.label,
  ].filter(Boolean).map(x => String(x).trim().toLowerCase());
  return names.includes(val);
}
