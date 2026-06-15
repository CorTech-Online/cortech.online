// Cleanroom, Node-only DMarcus bake. Renders the real dmarcheck creature CSS
// animation with Playwright (already a devDependency), ASCII-fies each frame
// in-canvas (our own implementation of the standard luminance/coverage -> char
// ramp technique, inspired by github.com/YusufB5/ASCILINE), and writes
// src/lib/dmarcus/dance-frames.json. Authoring-time only — never runs in CI.
//
// Run: node scripts/dmarcus/render-frames.mjs

import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

let chromium;
try {
  ({ chromium } = await import('@playwright/test'));
} catch {
  ({ chromium } = await import('playwright-core'));
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, '../../src/lib/dmarcus/dance-frames.json');

const COLS = 64;
const DANCE_FRAMES = 16;
const LOOP_MS = 1200;
const RAMP = ' .:-=+*#%@';
const CREDIT = 'ASCII technique inspired by github.com/YusufB5/ASCILINE';

// Creature CSS lifted verbatim from dmarcheck src/views/styles.ts, plus a blink
// state (eyes closed) we add for the idle pose.
const CSS = `
  :root { --clr-accent:#f97316; --clr-accent-hover:#fb923c; --clr-accent-glow:rgba(249,115,22,0.55); }
  html,body { margin:0; padding:0; background:transparent; }
  .stage { width:92px; height:104px; display:flex; align-items:center; justify-content:center; padding-top:14px; box-sizing:border-box; }
  .creature { display:inline-flex; flex-direction:column; align-items:center; vertical-align:middle; }
  .creature .creature-body { font-family:'SF Mono','Fira Code',monospace; color:var(--clr-accent); line-height:1; text-shadow:0 2px 8px var(--clr-accent-glow); position:relative; }
  .creature .creature-eyes { position:absolute; display:flex; pointer-events:none; }
  .creature .creature-eye { background:white; border-radius:50%; position:relative; overflow:hidden; box-shadow:0 0 0 1.5px var(--clr-accent-hover); }
  .creature .creature-pupil { background:#0a0a0f; border-radius:50%; position:absolute; }
  .creature .creature-legs { display:flex; pointer-events:none; }
  .creature .creature-leg { background:var(--clr-accent-hover); border-radius:0 0 3px 3px; }
  .creature-lg .creature-body { font-size:48px; }
  .creature-lg .creature-eyes { top:6px; left:12px; gap:6px; }
  .creature-lg .creature-eye { width:10px; height:10px; }
  .creature-lg .creature-pupil { width:5px; height:5px; top:3px; left:3px; }
  .creature-lg .creature-legs { gap:6px; margin-top:-4px; }
  .creature-lg .creature-leg { width:6px; height:12px; }
  .creature-celebrating .creature-pupil { top:1px; left:1px; }
  .creature-partying { position:relative; animation:creature-dance 1.2s ease-in-out infinite; transform-origin:bottom center; }
  .creature-partying .creature-leg:nth-child(1) { animation:creature-kick 0.6s ease-in-out infinite alternate; }
  .creature-partying .creature-leg:nth-child(3) { animation:creature-kick 0.6s ease-in-out infinite alternate-reverse; }
  @keyframes creature-dance { 0%,100%{ transform:translateY(0) rotate(0deg);} 25%{ transform:translateY(-3px) rotate(-4deg);} 50%{ transform:translateY(0) rotate(0deg);} 75%{ transform:translateY(-3px) rotate(4deg);} }
  @keyframes creature-kick { 0%{ transform:rotate(-12deg);} 100%{ transform:rotate(12deg);} }
  .creature-hat { position:absolute; top:-12px; left:50%; transform:translateX(-50%) rotate(8deg); width:0; height:0; border-left:7px solid transparent; border-right:7px solid transparent; border-bottom:14px solid #f59e0b; z-index:1; filter:drop-shadow(0 1px 2px rgba(0,0,0,0.15)); }
  /* added blink state for the idle pose */
  .creature-blink .creature-eye { transform:scaleY(0.12); }
`;

function pageHtml(creatureClasses) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>${CSS}</style><style id="seek"></style></head><body>
    <div class="stage">
      <div class="${creatureClasses}" aria-hidden="true">
        <div class="creature-hat"></div>
        <div class="creature-body">@<div class="creature-eyes"><div class="creature-eye"><div class="creature-pupil"></div></div><div class="creature-eye"><div class="creature-pupil"></div></div></div></div>
        <div class="creature-legs"><div class="creature-leg"></div><div class="creature-leg"></div><div class="creature-leg"></div></div>
      </div>
    </div>
  </body></html>`;
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 200, height: 240 }, deviceScaleFactor: 2 });

// Our own ASCII conversion (coverage/luminance -> char ramp), run in-canvas.
async function asciify(b64, cols, ramp) {
  return page.evaluate(
    async ({ b64, cols, ramp }) => {
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const bmp = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
      const rows = Math.max(1, Math.round(cols * (bmp.height / bmp.width) * 0.5));
      const cnv = new OffscreenCanvas(cols, rows);
      const ctx = cnv.getContext('2d', { willReadFrequently: true });
      ctx.clearRect(0, 0, cols, rows);
      ctx.drawImage(bmp, 0, 0, cols, rows);
      const d = ctx.getImageData(0, 0, cols, rows).data;
      const lines = [];
      const colors = {}; // sparse: cell index -> hex, only for cells that deviate from accent
      for (let y = 0; y < rows; y++) {
        let line = '';
        for (let x = 0; x < cols; x++) {
          const i = (y * cols + x) * 4;
          const a = d[i + 3] / 255;
          if (a < 0.14) {
            line += ' ';
            continue;
          }
          const lvl = Math.min(ramp.length - 1, Math.max(1, Math.round(a * (ramp.length - 1))));
          line += ramp[lvl];
          // Most of DMarcus is the accent orange — leave those cells out of the
          // map (the renderer fills them with its accent fallback) and only
          // record an explicit hex for cells that deviate (white eyes, dark
          // pupils). This is the main lever that keeps the baked JSON small.
          const dr = d[i] - 249;
          const dg = d[i + 1] - 115;
          const db = d[i + 2] - 22;
          const nearAccent = dr * dr + dg * dg + db * db < 60 * 60;
          if (!nearAccent) {
            colors[y * cols + x] = [d[i], d[i + 1], d[i + 2]]
              .map((v) => v.toString(16).padStart(2, '0'))
              .join('');
          }
        }
        lines.push(line);
      }
      return { w: cols, h: rows, text: lines.join('\n'), colors };
    },
    { b64, cols, ramp },
  );
}

async function captureStill(creatureClasses) {
  await page.setContent(pageHtml(creatureClasses), { waitUntil: 'load' });
  await page.waitForTimeout(40);
  const buf = await page.locator('.stage').screenshot({ omitBackground: true });
  return asciify(buf.toString('base64'), COLS, RAMP);
}

// --- dance: 16 frames across one loop, frozen via paused negative delay ---
await page.setContent(pageHtml('creature creature-lg creature-celebrating creature-partying'), {
  waitUntil: 'load',
});
const dance = [];
for (let f = 0; f < DANCE_FRAMES; f++) {
  const seekMs = (f / DANCE_FRAMES) * LOOP_MS;
  await page.evaluate((ms) => {
    document.getElementById('seek').textContent =
      `.stage, .stage * { animation-play-state: paused !important; animation-delay: -${ms}ms !important; }`;
  }, seekMs);
  await page.waitForTimeout(30);
  const buf = await page.locator('.stage').screenshot({ omitBackground: true });
  dance.push(await asciify(buf.toString('base64'), COLS, RAMP));
  process.stdout.write(`dance ${f + 1}/${DANCE_FRAMES}\r`);
}

// --- idle: standing (no partying), eyes open and eyes closed ---
const open = await captureStill('creature creature-lg creature-celebrating');
const blink = await captureStill('creature creature-lg creature-celebrating creature-blink');

await browser.close();

const payload = {
  meta: { loopMs: LOOP_MS, cols: COLS, ramp: RAMP, credit: CREDIT },
  dance,
  idle: { open, blink },
};
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(payload));
const sizeKb = (JSON.stringify(payload).length / 1024).toFixed(0);
console.log(`\nwrote ${OUT} (${sizeKb} KB) — ${dance.length} dance frames + idle open/blink @ ${COLS} cols`);
