import rawFrames from './dance-frames.json';

export type AsciiFrame = {
  w: number;
  h: number;
  text: string; // rows joined by '\n'
  // Sparse color map: cell index (y*w+x, as a string key) -> 6-digit hex (no '#').
  // Cells absent from the map are drawn with the accent fallback — most of DMarcus
  // is the accent orange, so keeping the map sparse keeps the baked JSON small.
  colors: Record<string, string>;
};

export type IdleFrames = { open: AsciiFrame; blink: AsciiFrame };

export type DanceFramesMeta = { loopMs: number; cols: number; ramp: string; credit?: string };

export type DanceFramesData = {
  meta: DanceFramesMeta;
  dance: AsciiFrame[];
  idle: IdleFrames;
};

const HEX6 = /^[0-9a-f]{6}$/i;

function validateFrame(frame: AsciiFrame, cols: number, ramp: string, label: string): void {
  if (frame.w !== cols) throw new Error(`${label}: w ${frame.w} !== meta.cols ${cols}`);
  if (frame.h <= 0) throw new Error(`${label}: h must be > 0`);
  const lines = frame.text.split('\n');
  if (lines.length !== frame.h) throw new Error(`${label}: ${lines.length} lines, expected ${frame.h}`);
  for (const line of lines) {
    if (line.length !== frame.w) throw new Error(`${label}: line width ${line.length} !== ${frame.w}`);
  }
  const max = frame.w * frame.h;
  for (const key of Object.keys(frame.colors)) {
    const idx = Number(key);
    if (!Number.isInteger(idx) || idx < 0 || idx >= max) {
      throw new Error(`${label}: color index ${key} out of range`);
    }
    if (!HEX6.test(frame.colors[key])) throw new Error(`${label}: invalid hex ${frame.colors[key]}`);
  }
  const allowed = new Set(ramp.split(''));
  for (const ch of frame.text.replace(/\n/g, '')) {
    if (ch !== ' ' && !allowed.has(ch)) throw new Error(`${label}: char '${ch}' not in ramp`);
  }
}

export function validateFramesData(data: DanceFramesData): void {
  const { meta } = data;
  if (!meta || meta.cols <= 0 || meta.loopMs <= 0 || !meta.ramp) throw new Error('meta invalid');
  if (!Array.isArray(data.dance) || data.dance.length === 0) {
    throw new Error('dance must be a non-empty array');
  }
  data.dance.forEach((f, i) => validateFrame(f, meta.cols, meta.ramp, `dance[${i}]`));
  if (!data.idle || !data.idle.open || !data.idle.blink) throw new Error('idle must have open and blink');
  validateFrame(data.idle.open, meta.cols, meta.ramp, 'idle.open');
  validateFrame(data.idle.blink, meta.cols, meta.ramp, 'idle.blink');
}

export const danceFrames = rawFrames as DanceFramesData;

/** Draw one ASCII frame to a 2D canvas context. Caller sets font + textBaseline first. */
export function drawAsciiFrame(
  ctx: CanvasRenderingContext2D,
  frame: AsciiFrame,
  cell: number,
  fallback = '#f97316',
): void {
  ctx.clearRect(0, 0, frame.w * cell, frame.h * cell);
  const lines = frame.text.split('\n');
  for (let y = 0; y < lines.length; y++) {
    const line = lines[y];
    for (let x = 0; x < line.length; x++) {
      const ch = line[x];
      if (ch === ' ') continue;
      const hex = frame.colors[y * frame.w + x];
      ctx.fillStyle = hex ? `#${hex}` : fallback;
      ctx.fillText(ch, x * cell, y * cell);
    }
  }
}
