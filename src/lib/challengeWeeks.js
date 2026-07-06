export const CHALLENGE_START_DATE = "2026-06-29";
export const CHALLENGE_WEEKS = 8;

function startOfLocalDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function getCurrentChallengeWeek(today = new Date()) {
  const start = startOfLocalDay(new Date(`${CHALLENGE_START_DATE}T00:00:00`));
  const current = startOfLocalDay(today);
  const daysSinceStart = Math.floor((current - start) / (1000 * 60 * 60 * 24));
  const week = Math.floor(daysSinceStart / 7) + 1;

  return Math.min(CHALLENGE_WEEKS, Math.max(1, week));
}

export function clampChallengeWeek(week, currentWeek = getCurrentChallengeWeek()) {
  const numeric = Number(week || currentWeek);
  return Math.min(currentWeek, Math.max(1, numeric));
}

export function isCurrentChallengeWeek(week, currentWeek = getCurrentChallengeWeek()) {
  return Number(week) === Number(currentWeek);
}
