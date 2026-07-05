export function playCompleteDing() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;

    const context = new AudioContext();
    const now = context.currentTime;

    const notes = [
      { frequency: 660, start: 0, duration: 0.08 },
      { frequency: 880, start: 0.09, duration: 0.1 },
      { frequency: 1175, start: 0.19, duration: 0.13 },
    ];

    notes.forEach(note => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();

      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(note.frequency, now + note.start);

      gain.gain.setValueAtTime(0.0001, now + note.start);
      gain.gain.exponentialRampToValueAtTime(0.08, now + note.start + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + note.start + note.duration);

      oscillator.connect(gain);
      gain.connect(context.destination);

      oscillator.start(now + note.start);
      oscillator.stop(now + note.start + note.duration + 0.02);
    });

    setTimeout(() => context.close(), 700);
  } catch {
    // Sound is optional. Ignore autoplay/browser audio errors.
  }
}
