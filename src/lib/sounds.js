const SOUND_EFFECTS_KEY = "fingalliansSoundEffectsOn";

export const Sounds = {
  BUTTON: "button",
  COUNTDOWN_READY: "countdownReady",
  COUNTDOWN_SET: "countdownSet",
  COUNTDOWN_GO: "countdownGo",
  ACTIVITY_COMPLETE: "activityComplete",
  RUN_COMPLETE: "runComplete",
  RUN_SAVED: "runComplete",
  BADGE_UNLOCKED: "badgeUnlocked",
  XP: "xp",
  LEVEL_UP: "levelUp",
  WEEK_COMPLETE: "weekComplete",
  CHALLENGE_COMPLETE: "challengeComplete",
};

let audioContext = null;

export function soundEffectsEnabled() {
  try {
    return localStorage.getItem(SOUND_EFFECTS_KEY) !== "false";
  } catch {
    return true;
  }
}

export function setSoundEffectsEnabled(enabled) {
  try {
    localStorage.setItem(SOUND_EFFECTS_KEY, String(Boolean(enabled)));
  } catch {
    // Ignore localStorage failures.
  }
}

export function feedbackEnabled() {
  return soundEffectsEnabled();
}

function getAudioContext() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return null;

    if (!audioContext || audioContext.state === "closed") {
      audioContext = new AudioContext();
    }

    if (audioContext.state === "suspended") {
      audioContext.resume?.();
    }

    return audioContext;
  } catch {
    return null;
  }
}

function tone({
  frequency = 440,
  start = 0,
  duration = 0.12,
  volume = 0.18,
  type = "sine",
  endFrequency = null,
}) {
  const context = getAudioContext();
  if (!context) return;

  const oscillator = context.createOscillator();
  const gain = context.createGain();
  const now = context.currentTime + start;
  const safeVolume = Math.max(0, Math.min(0.5, volume));

  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, now);

  if (endFrequency) {
    oscillator.frequency.exponentialRampToValueAtTime(
      Math.max(1, endFrequency),
      now + duration
    );
  }

  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(safeVolume, now + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

  oscillator.connect(gain);
  gain.connect(context.destination);

  oscillator.start(now);
  oscillator.stop(now + duration + 0.03);
}

function whistle(start = 0, volume = 0.105) {
  tone({
    frequency: 1900,
    endFrequency: 2600,
    start,
    duration: 0.16,
    volume,
    type: "square",
  });

  tone({
    frequency: 2650,
    endFrequency: 2100,
    start: start + 0.13,
    duration: 0.12,
    volume: volume * 0.72,
    type: "square",
  });
}

function sparkle(start = 0, volume = 0.13) {
  tone({ frequency: 1046.5, start, duration: 0.08, volume, type: "triangle" });
  tone({ frequency: 1568, start: start + 0.055, duration: 0.12, volume: volume * 0.9, type: "triangle" });
  tone({ frequency: 2093, start: start + 0.125, duration: 0.16, volume: volume * 0.75, type: "sine" });
}

function fanfare(start = 0, volume = 0.16) {
  tone({ frequency: 523.25, start, duration: 0.11, volume, type: "triangle" });
  tone({ frequency: 659.25, start: start + 0.1, duration: 0.11, volume, type: "triangle" });
  tone({ frequency: 783.99, start: start + 0.2, duration: 0.16, volume, type: "triangle" });
  tone({ frequency: 1046.5, start: start + 0.34, duration: 0.28, volume: volume * 0.9, type: "sine" });
}

function successChime(start = 0, volume = 0.105) {
  tone({ frequency: 523.25, start, duration: 0.08, volume, type: "triangle" });
  tone({ frequency: 659.25, start: start + 0.075, duration: 0.08, volume: volume * 1.05, type: "triangle" });
  tone({ frequency: 783.99, start: start + 0.15, duration: 0.09, volume: volume * 1.02, type: "triangle" });
  tone({ frequency: 1046.5, start: start + 0.235, duration: 0.16, volume: volume * 0.78, type: "sine" });
}

function runFinishChime(start = 0, volume = 0.12) {
  whistle(start, 0.1);

  tone({
    frequency: 523.25,
    start: start + 0.2,
    duration: 0.1,
    volume,
    type: "triangle",
  });

  tone({
    frequency: 659.25,
    start: start + 0.3,
    duration: 0.11,
    volume: volume * 1.08,
    type: "triangle",
  });

  tone({
    frequency: 783.99,
    start: start + 0.42,
    duration: 0.16,
    volume,
    type: "sine",
  });

  sparkle(start + 0.6, 0.07);
}

export function playSound(sound) {
  if (!soundEffectsEnabled()) return;

  switch (sound) {
    case Sounds.BUTTON:
      tone({ frequency: 520, duration: 0.045, volume: 0.045, type: "square" });
      tone({ frequency: 760, start: 0.02, duration: 0.04, volume: 0.025, type: "triangle" });
      break;

    case Sounds.COUNTDOWN_READY:
      tone({ frequency: 587.33, duration: 0.18, volume: 0.09, type: "triangle" });
      tone({ frequency: 880, start: 0.04, duration: 0.16, volume: 0.052, type: "sine" });
      break;

    case Sounds.COUNTDOWN_SET:
      tone({ frequency: 659.25, duration: 0.18, volume: 0.095, type: "triangle" });
      tone({ frequency: 987.77, start: 0.04, duration: 0.16, volume: 0.056, type: "sine" });
      break;

    case Sounds.COUNTDOWN_GO:
      whistle(0, 0.11);
      break;

    case Sounds.ACTIVITY_COMPLETE:
      successChime(0, 0.105);
      break;

    case Sounds.RUN_COMPLETE:
      runFinishChime(0, 0.12);
      break;

    case Sounds.BADGE_UNLOCKED:
      fanfare(0, 0.16);
      sparkle(0.42, 0.105);
      successChime(0.68, 0.075);
      break;

    case Sounds.XP:
      tone({ frequency: 784, duration: 0.07, volume: 0.08, type: "triangle" });
      tone({ frequency: 1174.66, start: 0.06, duration: 0.09, volume: 0.07, type: "triangle" });
      break;

    case Sounds.LEVEL_UP:
      tone({ frequency: 392, duration: 0.1, volume: 0.13, type: "triangle" });
      tone({ frequency: 523.25, start: 0.09, duration: 0.1, volume: 0.14, type: "triangle" });
      tone({ frequency: 659.25, start: 0.18, duration: 0.11, volume: 0.15, type: "triangle" });
      tone({ frequency: 1046.5, start: 0.31, duration: 0.34, volume: 0.16, type: "sine" });
      sparkle(0.56, 0.09);
      break;

    case Sounds.WEEK_COMPLETE:
      fanfare(0, 0.17);
      successChime(0.48, 0.095);
      fanfare(0.88, 0.13);
      break;

    case Sounds.CHALLENGE_COMPLETE:
      fanfare(0, 0.18);
      successChime(0.48, 0.105);
      tone({ frequency: 1318.51, start: 0.88, duration: 0.18, volume: 0.14, type: "triangle" });
      tone({ frequency: 1568, start: 1.04, duration: 0.22, volume: 0.13, type: "triangle" });
      sparkle(1.28, 0.12);
      fanfare(1.52, 0.12);
      break;

    default:
      break;
  }
}

export function playButtonClick() {
  playSound(Sounds.BUTTON);
}

export function playCountdownReady() {
  playSound(Sounds.COUNTDOWN_READY);
}

export function playCountdownSet() {
  playSound(Sounds.COUNTDOWN_SET);
}

export function playCountdownGo() {
  playSound(Sounds.COUNTDOWN_GO);
}

export function playActivityComplete() {
  playSound(Sounds.ACTIVITY_COMPLETE);
}

export function playRunSaved() {
  playSound(Sounds.RUN_COMPLETE);
}

export function playRunComplete() {
  playSound(Sounds.RUN_COMPLETE);
}

export function playBadgeUnlocked() {
  playSound(Sounds.BADGE_UNLOCKED);
}

export function playXp() {
  playSound(Sounds.XP);
}

export function playLevelUp() {
  playSound(Sounds.LEVEL_UP);
}

export function playWeekComplete() {
  playSound(Sounds.WEEK_COMPLETE);
}

export function playChallengeComplete() {
  playSound(Sounds.CHALLENGE_COMPLETE);
}

export function playCompleteDing() {
  playSound(Sounds.ACTIVITY_COMPLETE);
}

export function playCompleteSound() {
  playSound(Sounds.ACTIVITY_COMPLETE);
}

export function playSuccessSound() {
  playSound(Sounds.ACTIVITY_COMPLETE);
}