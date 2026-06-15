import { describe, it, expect } from 'vitest';
import { HOOK, totalDurationMs } from './chiptune';

describe('chiptune HOOK', () => {
  it('is a non-empty note sequence', () => {
    expect(HOOK.length).toBeGreaterThan(4);
  });

  it('has only positive, finite frequencies and durations', () => {
    for (const n of HOOK) {
      expect(Number.isFinite(n.freq)).toBe(true);
      expect(n.freq).toBeGreaterThan(0);
      expect(n.ms).toBeGreaterThan(0);
    }
  });

  it('loops over a sane duration', () => {
    const total = totalDurationMs();
    expect(total).toBeGreaterThan(800);
    expect(total).toBeLessThan(6000);
  });
});
