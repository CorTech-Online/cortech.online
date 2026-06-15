export type ChiptuneNote = { freq: number; ms: number };

// A short, evocative hook — original square-wave synth, NOT the recording. Pitches
// are tuned by ear; this is a recognizable riff, not a faithful transcription.
export const HOOK: ChiptuneNote[] = [
  { freq: 293.66, ms: 140 }, // D4
  { freq: 329.63, ms: 140 }, // E4
  { freq: 293.66, ms: 140 }, // D4
  { freq: 369.99, ms: 280 }, // F#4
  { freq: 440.0, ms: 140 }, // A4
  { freq: 293.66, ms: 140 }, // D4
  { freq: 329.63, ms: 140 }, // E4
  { freq: 293.66, ms: 140 }, // D4
  { freq: 392.0, ms: 280 }, // G4
  { freq: 329.63, ms: 280 }, // E4
];

export function totalDurationMs(notes: ChiptuneNote[] = HOOK): number {
  return notes.reduce((sum, n) => sum + n.ms, 0);
}

export type Chiptune = { play: () => void; stop: () => void };

/** Lazily builds a Web Audio context and loops the hook. Only call play() from a user gesture. */
export function createChiptune(notes: ChiptuneNote[] = HOOK): Chiptune {
  let ctx: AudioContext | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = true;

  const scheduleLoop = () => {
    if (!ctx || stopped) return;
    let t = ctx.currentTime + 0.02;
    for (const n of notes) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'square';
      osc.frequency.value = n.freq;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.1, t + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + n.ms / 1000);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + n.ms / 1000);
      t += n.ms / 1000;
    }
    timer = setTimeout(scheduleLoop, totalDurationMs(notes));
  };

  return {
    play() {
      if (!stopped) return;
      stopped = false;
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ctx = ctx ?? new Ctor();
      void ctx.resume();
      scheduleLoop();
    },
    stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
      timer = null;
      if (ctx) {
        void ctx.close();
        ctx = null;
      }
    },
  };
}
