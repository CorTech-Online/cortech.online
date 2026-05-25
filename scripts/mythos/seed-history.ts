/**
 * Generates synthetic history.jsonl for visual mockup of the timeline.
 *
 * Real history will be appended by the daily workflow once it lands; this
 * script seeds enough days of plausible data to demo the chart before then.
 * Re-run anytime: it overwrites the file.
 *
 *   npx tsx scripts/mythos/seed-history.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

type HistoryRow = {
  date: string;
  disclosed: number;
  acknowledged: number;
  fixed: number;
  advisories: number;
  median_days_to_ack: number;
  median_days_to_patch: number;
  severity: { critical: number; high: number; medium: number; low: number; unknown: number };
};

const DAYS = 90;
const END = new Date('2026-05-22T00:00:00Z');

const TARGET = { disclosed: 1596, acknowledged: 1451, fixed: 97, advisories: 88 };
const START = { disclosed: 980, acknowledged: 845, fixed: 41, advisories: 32 };

// Deterministic noise so re-runs produce identical files (PR diffs stay clean).
function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(0xc0de);

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function noisyMonotone(start: number, end: number, t: number, jitter: number): number {
  // monotone-ish: occasional flat day, occasional small bump
  const base = lerp(start, end, t);
  const drift = (rand() - 0.45) * jitter;
  return Math.max(0, Math.round(base + drift));
}

const rows: HistoryRow[] = [];
let lastDisclosed = START.disclosed;
let lastAcked = START.acknowledged;
let lastFixed = START.fixed;
let lastAdvisories = START.advisories;

for (let i = 0; i < DAYS; i++) {
  const t = i / (DAYS - 1);
  const day = new Date(END.getTime() - (DAYS - 1 - i) * 86400000);

  // Counters never decrease — clamp to previous value.
  const disclosed = Math.max(lastDisclosed, noisyMonotone(START.disclosed, TARGET.disclosed, t, 4));
  const acknowledged = Math.max(
    lastAcked,
    Math.min(disclosed, noisyMonotone(START.acknowledged, TARGET.acknowledged, t, 4)),
  );
  const fixed = Math.max(
    lastFixed,
    Math.min(acknowledged, noisyMonotone(START.fixed, TARGET.fixed, t, 1)),
  );
  const advisories = Math.max(
    lastAdvisories,
    Math.min(fixed + 5, noisyMonotone(START.advisories, TARGET.advisories, t, 1)),
  );

  lastDisclosed = disclosed;
  lastAcked = acknowledged;
  lastFixed = fixed;
  lastAdvisories = advisories;

  // Lag rates wander — ack is fast (<1d), patch drifts 4-9 days with stress spikes.
  const median_days_to_ack = +(0.15 + rand() * 0.4).toFixed(2);
  const stressSpike = i > 45 && i < 60 ? 2.5 : 0;
  const median_days_to_patch = +(
    5 +
    Math.sin(t * Math.PI * 1.5) * 1.6 +
    stressSpike +
    rand() * 0.6
  ).toFixed(1);

  // Severity totals (rough split of disclosed) — heavy "other"/unknown on this dataset.
  const critical = Math.round(disclosed * 0.014 + rand() * 2);
  const high = Math.round(disclosed * 0.075 + rand() * 3);
  const medium = Math.round(disclosed * 0.055 + rand() * 3);
  const low = Math.round(disclosed * 0.018 + rand() * 2);
  const unknown = Math.max(0, disclosed - critical - high - medium - low);

  rows.push({
    date: day.toISOString().slice(0, 10),
    disclosed,
    acknowledged,
    fixed,
    advisories,
    median_days_to_ack,
    median_days_to_patch,
    severity: { critical, high, medium, low, unknown },
  });
}

const out = resolve('src/content/mythos/_data/history.jsonl');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, rows.map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf8');
console.log(`wrote ${rows.length} rows → ${out}`);
