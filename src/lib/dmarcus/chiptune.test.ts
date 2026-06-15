import { describe, it, expect } from 'vitest';
import { SONG, DRUMS, EIGHTH, voiceDurationMs, totalDurationMs } from './chiptune';

describe('chiptune SONG', () => {
  it('has at least a bass and a lead voice', () => {
    expect(SONG.length).toBeGreaterThanOrEqual(2);
  });

  it('every voice is a non-empty note sequence', () => {
    for (const v of SONG) expect(v.notes.length).toBeGreaterThan(4);
  });

  it('notes have finite, non-negative freqs and positive durations', () => {
    for (const v of SONG) {
      for (const n of v.notes) {
        expect(Number.isFinite(n.freq)).toBe(true);
        expect(n.freq).toBeGreaterThanOrEqual(0); // 0 == rest
        expect(n.ms).toBeGreaterThan(0);
      }
    }
  });

  it('every voice has at least one sounding note', () => {
    for (const v of SONG) expect(v.notes.some((n) => n.freq > 0)).toBe(true);
  });

  it('all voices share the same total duration so the loop stays aligned', () => {
    const durations = SONG.map(voiceDurationMs);
    for (const d of durations) expect(d).toBe(durations[0]);
  });

  it('loops over a danceable duration', () => {
    const total = totalDurationMs();
    expect(total).toBeGreaterThan(2000);
    expect(total).toBeLessThan(12000);
  });
});

describe('chiptune DRUMS', () => {
  it('has kick, snare, and hat voices', () => {
    expect(DRUMS.map((d) => d.type).sort()).toEqual(['hat', 'kick', 'snare']);
  });

  it('every drum voice has positive gain and at least one hit', () => {
    for (const d of DRUMS) {
      expect(d.gain).toBeGreaterThan(0);
      expect(d.steps.some(Boolean)).toBe(true);
    }
  });

  it('all drum voices share the same step count', () => {
    const lengths = DRUMS.map((d) => d.steps.length);
    for (const l of lengths) expect(l).toBe(lengths[0]);
  });

  it('the drum grid spans the full melodic loop', () => {
    expect(DRUMS[0].steps.length * EIGHTH).toBe(totalDurationMs());
  });
});
