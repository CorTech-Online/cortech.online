import { describe, it, expect } from 'vitest';
import { validateFramesData, danceFrames, type DanceFramesData } from './frames';

function makeValid(): DanceFramesData {
  // 2×2 frame: '@' top-left (idx 0) and bottom-right (idx 3); a white eye at idx 0.
  const frame = { w: 2, h: 2, text: '@ \n @', colors: { '0': 'ffffff' } };
  return {
    meta: { loopMs: 1200, cols: 2, ramp: ' .:-=+*#%@' },
    dance: [frame, frame],
    idle: { open: frame, blink: frame },
  };
}

describe('validateFramesData', () => {
  it('accepts a well-formed payload', () => {
    expect(() => validateFramesData(makeValid())).not.toThrow();
  });

  it('rejects a color index out of range', () => {
    const d = makeValid();
    d.dance[0] = { ...d.dance[0], colors: { '9': 'ffffff' } };
    expect(() => validateFramesData(d)).toThrow(/out of range/);
  });

  it('rejects an invalid hex value', () => {
    const d = makeValid();
    d.dance[0] = { ...d.dance[0], colors: { '0': 'nothex' } };
    expect(() => validateFramesData(d)).toThrow(/invalid hex/);
  });

  it('rejects a line whose width !== w', () => {
    const d = makeValid();
    d.dance[0] = { w: 2, h: 2, text: '@@@\n @', colors: {} };
    expect(() => validateFramesData(d)).toThrow(/line width/);
  });

  it('rejects a char not in the ramp', () => {
    const d = makeValid();
    d.dance[0] = { w: 2, h: 2, text: 'Z \n @', colors: {} };
    expect(() => validateFramesData(d)).toThrow(/not in ramp/);
  });

  it('rejects idle missing the blink pose', () => {
    const d = makeValid();
    // @ts-expect-error intentionally break the shape
    delete d.idle.blink;
    expect(() => validateFramesData(d)).toThrow(/idle/);
  });
});

describe('baked dance-frames.json', () => {
  it('is a valid payload', () => {
    expect(() => validateFramesData(danceFrames)).not.toThrow();
  });

  it('has 64 cols, multiple dance frames, and both idle poses', () => {
    expect(danceFrames.meta.cols).toBe(64);
    expect(danceFrames.dance.length).toBeGreaterThanOrEqual(12);
    expect(danceFrames.idle.open).toBeTruthy();
    expect(danceFrames.idle.blink).toBeTruthy();
  });

  it('fits the size budget (< 150 KB)', () => {
    expect(JSON.stringify(danceFrames).length).toBeLessThan(150 * 1024);
  });
});
