export function playCompleteDing() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;

    const context = new AudioContext();
    const now = context.currentTime;
    const master = context.createGain();

    master.gain.setValueAtTime(0.0001, now);
    master.gain.exponentialRampToValueAtTime(0.18, now + 0.02);
    master.gain.exponentialRampToValueAtTime(0.0001, now + 0.7);
    master.connect(context.destination);

    const notes = [
      { frequency: 523.25, start: 0.00, duration: 0.08, type: "triangle" },
      { frequency: 659.25, start: 0.08, duration: 0.08, type: "triangle" },
      { frequency: 783.99, start: 0.16, duration: 0.10, type: "triangle" },
      { frequency: 1046.5, start: 0.27, duration: 0.18, type: "sine" },
    ];

    notes.forEach(note => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();

      oscillator.type = note.type;
      oscillator.frequency.setValueAtTime(note.frequency, now + note.start);

      gain.gain.setValueAtTime(0.0001, now + note.start);
      gain.gain.exponentialRampToValueAtTime(0.12, now + note.start + 0.012);
      gain.gain.exponentialRampToValueAtTime(
        0.0001,
        now + note.start + note.duration
      );

      oscillator.connect(gain);
      gain.connect(master);
      oscillator.start(now + note.start);
      oscillator.stop(now + note.start + note.duration + 0.04);
    });

    // Tiny sparkle noise burst.
    const bufferSize = context.sampleRate * 0.16;
    const buffer = context.createBuffer(1, bufferSize, context.sampleRate);
    const output = buffer.getChannelData(0);

    for (let i = 0; i < bufferSize; i += 1) {
      output[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
    }

    const noise = context.createBufferSource();
    const noiseGain = context.createGain();
    const filter = context.createBiquadFilter();

    filter.type = "highpass";
    filter.frequency.setValueAtTime(3500, now + 0.2);

    noise.buffer = buffer;
    noiseGain.gain.setValueAtTime(0.0001, now + 0.2);
    noiseGain.gain.exponentialRampToValueAtTime(0.035, now + 0.22);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.36);

    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(master);

    noise.start(now + 0.2);
    noise.stop(now + 0.38);

    setTimeout(() => context.close(), 900);
  } catch {
    // Optional feedback only.
  }
}
