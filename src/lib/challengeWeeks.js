export const CHALLENGE_START_DATE = "2026-06-29";
export const TOTAL_CHALLENGE_WEEKS = 8;

function startOfLocalDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function getCurrentChallengeWeek(today = new Date()) {
  const start = startOfLocalDay(new Date(`${CHALLENGE_START_DATE}T00:00:00`));
  const current = startOfLocalDay(today);
  const daysSinceStart = Math.floor((current - start) / 86400000);

  if (daysSinceStart < 0) return 1;

  return Math.min(
    TOTAL_CHALLENGE_WEEKS,
    Math.max(1, Math.floor(daysSinceStart / 7) + 1)
  );
}

export function clampChallengeWeek(week, currentWeek = getCurrentChallengeWeek()) {
  return Math.min(
    currentWeek,
    Math.max(1, Number(week || currentWeek || 1))
  );
}

export function isFutureChallengeWeek(week, currentWeek = getCurrentChallengeWeek()) {
  return Number(week || 1) > currentWeek;
}
