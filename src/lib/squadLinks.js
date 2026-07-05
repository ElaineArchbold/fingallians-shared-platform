export const SQUAD_WHATSAPP_LINKS = {
  "2014-boys": "https://chat.whatsapp.com/F3A0lBj6293JQD2oghSoAx",
  "2015-girls": "https://chat.whatsapp.com/Bc76P9R4TJvHbbdQ2xEhhA",
  "2017-boys": "https://chat.whatsapp.com/FJLfHJpjKbi6KFGzHbpEoQ",
  "2017-girls": "https://chat.whatsapp.com/CUeI5EKF8HOGo0hucgSEPF",
};

export function getSquadWhatsAppLink(squadKey) {
  return SQUAD_WHATSAPP_LINKS[squadKey] || "";
}