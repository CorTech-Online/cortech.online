import { describe, it, expect } from 'vitest';
import { validateFramesData, type DanceFramesData } from './frames';

function makeValid(): DanceFramesData {
  // 2×2 frame: '@' top-left and bottom-right, spaces elsewhere.
  const frame = { w: 2, h: 2, text: '@ \n @', colors: ['f97316', null, null, 'f97316'] };
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

  it('rejects a colors array whose length !== w*h', () => {
    const d = makeValid();
    d.dance[0] = { ...d.dance[0], colors: ['f97316'] };
    expect(() => validateFramesData(d)).toThrow(/colors length/);
  });

  it('rejects a line whose width !== w', () => {
    const d = makeValid();
    d.dance[0] = { w: 2, h: 2, text: '@@@\n @', colors: ['f97316', 'f97316', 'f97316', null] };
    expect(() => validateFramesData(d)).toThrow(/line width/);
  });

  it('rejects a char not in the ramp', () => {
    const d = makeValid();
    d.dance[0] = { w: 2, h: 2, text: 'Z \n @', colors: ['f97316', null, null, 'f97316'] };
    expect(() => validateFramesData(d)).toThrow(/not in ramp/);
  });

  it('rejects idle missing the blink pose', () => {
    const d = makeValid();
    // @ts-expect-error intentionally break the shape
    delete d.idle.blink;
    expect(() => validateFramesData(d)).toThrow(/idle/);
  });
});
