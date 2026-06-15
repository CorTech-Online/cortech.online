// An original 8-bit dance loop in the spirit of cheesy late-'80s synth-pop — the
// "rickroll" era — WITHOUT reproducing any copyrighted melody. The recognizable
// gag lands from context (DMarcus dancing + the "Never gonna click this" link),
// not from the tune. What we borrow here is only the *style*: a bouncing octave
// bassline, an arpeggiated lead, and a four-on-the-floor drum groove over the
// I–V–vi–IV progression (A–E–F#m–D), one of pop's most common, non-copyrightable
// progressions. Lead and drums are original; nothing is sampled or transcribed.
//
// All synthesis is pure Web Audio (no deps, no samples, fully offline).

export type ChiptuneNote = { freq: number; ms: number }; // freq 0 == rest
export type ChiptuneVoice = {
  wave: OscillatorType;
  gain: number;
  detune?: number; // cents for a second, slightly detuned osc (fatter lead)
  delay?: boolean; // send this voice to the echo bus
  notes: ChiptuneNote[];
};

export type DrumType = 'kick' | 'snare' | 'hat';
export type DrumVoice = { type: DrumType; gain: number; steps: boolean[] };

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
export const EIGHTH = BEAT / 2; // 265ms — the drum-grid step

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
    gain: 0.12,
    notes: [...bassBar(A2, A3), ...bassBar(E2, E3), ...bassBar(Fs2, Fs3), ...bassBar(D2, D3)],
  },
  {
    wave: 'square',
    gain: 0.055,
    detune: 8, // fat, slightly-detuned lead
    delay: true, // synthwave echo
    notes: [
      ...arp([A4, Cs5, E5, A5, E5, Cs5, A4, B4]), // A  (I)
      ...arp([Gs4, B4, E5, Gs5, E5, B4, Gs4, E4]), // E  (V)
      ...arp([Fs4, A4, Cs5, Fs5, Cs5, A4, Fs4, A4]), // F#m (vi)
      ...arp([A4, D5, Fs5, A5, Fs5, D5, A4, E5]), // D  (IV) → resolves back to A
    ],
  },
];

const STEPS = 32; // eighth-note grid over the whole loop (matches the lead)
const grid = (predicate: (i: number) => boolean): boolean[] =>
  Array.from({ length: STEPS }, (_, i) => predicate(i));

export const DRUMS: DrumVoice[] = [
  { type: 'kick', gain: 0.6, steps: grid((i) => i % 2 === 0) }, // four-on-the-floor
  { type: 'snare', gain: 0.22, steps: grid((i) => i % 4 === 2) }, // backbeat (beats 2 & 4)
  { type: 'hat', gain: 0.1, steps: grid((i) => i % 2 === 1) }, // offbeat eighths
];

export function voiceDurationMs(voice: ChiptuneVoice): number {
  return voice.notes.reduce((sum, n) => sum + n.ms, 0);
}

export function totalDurationMs(song: ChiptuneVoice[] = SONG): number {
  return Math.max(...song.map(voiceDurationMs));
}

export type Chiptune = { play: () => void; stop: () => void };

type Bus = { master: GainNode; echo: DelayNode; noise: AudioBuffer };

function buildBus(ctx: AudioContext): Bus {
  const master = ctx.createGain();
  master.gain.value = 0.85;
  const comp = ctx.createDynamicsCompressor(); // tame peaks from layered voices
  master.connect(comp).connect(ctx.destination);

  // Feedback echo for the lead (dotted-eighth delay).
  const echo = ctx.createDelay(1.0);
  echo.delayTime.value = (EIGHTH / 1000) * 1.5;
  const feedback = ctx.createGain();
  feedback.gain.value = 0.28;
  const wet = ctx.createGain();
  wet.gain.value = 0.32;
  echo.connect(feedback);
  feedback.connect(echo);
  echo.connect(wet);
  wet.connect(master);

  // One white-noise buffer reused for snare/hat.
  const noise = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.2), ctx.sampleRate);
  const data = noise.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

  return { master, echo, noise };
}

function playNote(
  ctx: AudioContext,
  bus: Bus,
  voice: ChiptuneVoice,
  freq: number,
  t: number,
  dur: number,
) {
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, t);
  env.gain.exponentialRampToValueAtTime(voice.gain, t + 0.012);
  env.gain.exponentialRampToValueAtTime(0.0001, t + dur * 0.9);
  env.connect(bus.master);
  if (voice.delay) env.connect(bus.echo);

  const oscs = [0, ...(voice.detune ? [voice.detune] : [])];
  for (const detune of oscs) {
    const osc = ctx.createOscillator();
    osc.type = voice.wave;
    osc.frequency.value = freq;
    osc.detune.value = detune;
    osc.connect(env);
    osc.start(t);
    osc.stop(t + dur);
  }
}

function playDrum(ctx: AudioContext, bus: Bus, type: DrumType, gain: number, t: number) {
  if (type === 'kick') {
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.exponentialRampToValueAtTime(50, t + 0.08);
    env.gain.setValueAtTime(gain, t);
    env.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    osc.connect(env).connect(bus.master);
    osc.start(t);
    osc.stop(t + 0.2);
    return;
  }
  // snare / hat: filtered noise burst
  const src = ctx.createBufferSource();
  src.buffer = bus.noise;
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = type === 'hat' ? 7000 : 1400;
  const env = ctx.createGain();
  const decay = type === 'hat' ? 0.04 : 0.13;
  env.gain.setValueAtTime(gain, t);
  env.gain.exponentialRampToValueAtTime(0.0001, t + decay);
  src.connect(hp).connect(env).connect(bus.master);
  src.start(t);
  src.stop(t + decay + 0.02);
}

/** Lazily builds a Web Audio context and loops the song + drums. Only call play() from a user gesture. */
export function createChiptune(song: ChiptuneVoice[] = SONG, drums: DrumVoice[] = DRUMS): Chiptune {
  let ctx: AudioContext | null = null;
  let bus: Bus | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = true;

  const loopMs = Math.max(totalDurationMs(song), drums[0] ? drums[0].steps.length * EIGHTH : 0);

  const scheduleLoop = () => {
    if (!ctx || !bus || stopped) return;
    const start = ctx.currentTime + 0.05;

    for (const voice of song) {
      let t = start;
      for (const n of voice.notes) {
        if (n.freq > 0) playNote(ctx, bus, voice, n.freq, t, n.ms / 1000);
        t += n.ms / 1000;
      }
    }

    const step = EIGHTH / 1000;
    for (const drum of drums) {
      for (let i = 0; i < drum.steps.length; i++) {
        if (drum.steps[i]) playDrum(ctx, bus, drum.type, drum.gain, start + i * step);
      }
    }

    timer = setTimeout(scheduleLoop, loopMs);
  };

  return {
    play() {
      if (!stopped) return;
      stopped = false;
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ctx = ctx ?? new Ctor();
      bus = buildBus(ctx);
      void ctx.resume();
      scheduleLoop();
    },
    stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
      timer = null;
      bus = null;
      if (ctx) {
        void ctx.close();
        ctx = null;
      }
    },
  };
}
