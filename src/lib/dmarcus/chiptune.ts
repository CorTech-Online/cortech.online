// An original 8-bit dance loop in the spirit of cheesy late-'80s synth-pop — the
// "rickroll" era — WITHOUT reproducing any copyrighted melody. The recognizable
// gag lands from context (DMarcus dancing + the "Never gonna click this" link),
// not from the tune. What we borrow here is only the *style*: a bouncing octave
// bassline and an arpeggiated lead over the I–V–vi–IV progression (A–E–F#m–D),
// which is one of pop's most common, non-copyrightable chord progressions. The
// lead is an original arpeggio line, not the song's vocal melody.

export type ChiptuneNote = { freq: number; ms: number }; // freq 0 == rest
export type ChiptuneVoice = { wave: OscillatorType; gain: number; notes: ChiptuneNote[] };

// Note frequencies (equal temperament, A4 = 440).
const A2 = 110.0;
const A3 = 220.0;
const E2 = 82.41;
const E3 = 164.81;
const Fs2 = 92.5;
const Fs3 = 185.0;
const D2 = 73.42;
const D3 = 146.83;

const A4 = 440.0;
const B4 = 493.88;
const Cs5 = 554.37;
const D5 = 587.33;
const E5 = 659.25;
const Fs5 = 739.99;
const A5 = 880.0;
const Fs4 = 369.99;
const Gs4 = 415.3;
const Gs5 = 830.61;
const E4 = 329.63;

const BEAT = 530; // ~113 BPM
const EIGHTH = BEAT / 2; // 265ms

// Bouncing octave bass, one bar per chord (root, octave, root, octave).
const bassBar = (root: number, oct: number): ChiptuneNote[] => [
  { freq: root, ms: BEAT },
  { freq: oct, ms: BEAT },
  { freq: root, ms: BEAT },
  { freq: oct, ms: BEAT },
];

// Eight-note arpeggio per bar over the bar's chord.
const arp = (freqs: number[]): ChiptuneNote[] => freqs.map((freq) => ({ freq, ms: EIGHTH }));

export const SONG: ChiptuneVoice[] = [
  {
    wave: 'triangle',
    gain: 0.13,
    notes: [...bassBar(A2, A3), ...bassBar(E2, E3), ...bassBar(Fs2, Fs3), ...bassBar(D2, D3)],
  },
  {
    wave: 'square',
    gain: 0.09,
    notes: [
      ...arp([A4, Cs5, E5, A5, E5, Cs5, A4, B4]), // A  (I)
      ...arp([Gs4, B4, E5, Gs5, E5, B4, Gs4, E4]), // E  (V)
      ...arp([Fs4, A4, Cs5, Fs5, Cs5, A4, Fs4, A4]), // F#m (vi)
      ...arp([A4, D5, Fs5, A5, Fs5, D5, A4, E5]), // D  (IV) → resolves back to A
    ],
  },
];

export function voiceDurationMs(voice: ChiptuneVoice): number {
  return voice.notes.reduce((sum, n) => sum + n.ms, 0);
}

export function totalDurationMs(song: ChiptuneVoice[] = SONG): number {
  return Math.max(...song.map(voiceDurationMs));
}

export type Chiptune = { play: () => void; stop: () => void };

/** Lazily builds a Web Audio context and loops the song. Only call play() from a user gesture. */
export function createChiptune(song: ChiptuneVoice[] = SONG): Chiptune {
  let ctx: AudioContext | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = true;

  const scheduleLoop = () => {
    if (!ctx || stopped) return;
    const start = ctx.currentTime + 0.03;
    for (const voice of song) {
      let t = start;
      for (const n of voice.notes) {
        if (n.freq > 0) {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = voice.wave;
          osc.frequency.value = n.freq;
          const dur = n.ms / 1000;
          gain.gain.setValueAtTime(0.0001, t);
          gain.gain.exponentialRampToValueAtTime(voice.gain, t + 0.012);
          gain.gain.exponentialRampToValueAtTime(0.0001, t + dur * 0.9);
          osc.connect(gain).connect(ctx.destination);
          osc.start(t);
          osc.stop(t + dur);
        }
        t += n.ms / 1000;
      }
    }
    timer = setTimeout(scheduleLoop, totalDurationMs(song));
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
