# Mythos vulnerability tracker — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a daily GitHub Actions cron that diffs Anthropic's CVD payload against a committed snapshot and, when meaningful deltas fire, auto-merges a PR containing a generated Mythos tracker post and an updated `/mythos` dashboard.

**Architecture:** All logic lives in a Node entry script (`scripts/mythos/run.ts`) that's pure-data → fetch → digest → diff → generate → write. Pure modules are unit-tested with vitest. Astro renders the dashboard and posts from a new `mythos` content collection. The YAML workflow is thin — checkout, run script, conditionally open + auto-merge a PR.

**Tech Stack:** TypeScript (executed via `tsx`), Astro 6 content collections, `@anthropic-ai/sdk` (Sonnet 4.6), vitest, GitHub Actions, `gh` CLI for PR creation + auto-merge.

**Spec:** [docs/superpowers/specs/2026-05-24-mythos-tracker-design.md](../specs/2026-05-24-mythos-tracker-design.md)

---

## File map

**Created:**
- `scripts/mythos/run.ts` — entry point, orchestrates the pipeline
- `scripts/mythos/fetch.ts` — HTTP with timeout
- `scripts/mythos/digest.ts` — raw payload → snapshot digest
- `scripts/mythos/triggers.ts` — pure: `(oldDigest, newDigest) → Trigger[]`
- `scripts/mythos/generate.ts` — calls Anthropic SDK, enforces slop guardrails
- `scripts/mythos/write.ts` — writes post + snapshot to working tree, creates branch
- `scripts/mythos/types.ts` — shared `Digest` and `Trigger` types
- `scripts/mythos/fixtures/payload-old.json` — small hand-crafted fixture
- `scripts/mythos/fixtures/payload-new.json` — small hand-crafted fixture (one of each delta)
- `scripts/mythos/digest.test.ts`
- `scripts/mythos/triggers.test.ts`
- `scripts/mythos/generate.test.ts`
- `scripts/mythos/fetch.test.ts`
- `src/content/mythos/_data/snapshot.json` — bootstrap snapshot
- `src/content/mythos/.gitkeep`
- `src/pages/mythos/index.astro` — dashboard + recent posts
- `src/pages/mythos/[...slug].astro` — individual post route
- `src/pages/mythos/rss.xml.ts` — mythos-only RSS feed
- `src/pages/api/mythos.json.ts` — JSON endpoint for `MythosApp`
- `src/components/os/apps/MythosApp.tsx` — in-OS window view
- `.github/workflows/mythos.yml` — cron + auto-merge

**Modified:**
- `src/content.config.ts` — add `mythos` collection
- `src/apps/registry.ts` — add `mythos` AppManifest entry
- `package.json` — add `tsx` + `@anthropic-ai/sdk` deps, `mythos:run` script
- `docs/architecture.md` — append a Mythos tracker section
- `eslint.config.js` (if needed) — allow `scripts/mythos/**`
- `tsconfig.json` (if needed) — ensure `scripts/**` is included

---

## Task 1: Add `tsx`, Anthropic SDK, and the `mythos:run` script

**Files:**
- Modify: `package.json`
- Verify: `node --version` (must be ≥22.12 per `engines`)

- [ ] **Step 1: Install runtime deps**

Run:
```bash
npm install --save-dev tsx
npm install @anthropic-ai/sdk
```

- [ ] **Step 2: Add the `mythos:run` script**

Edit `package.json`, add inside `scripts`:
```json
"mythos:run": "tsx scripts/mythos/run.ts"
```

- [ ] **Step 3: Verify install**

Run: `npx tsx --version`
Expected: prints a version, no error.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore(mythos): add tsx and anthropic SDK for tracker scripts"
```

---

## Task 2: Add the `mythos` content collection + bootstrap empty state

**Files:**
- Create: `src/content/mythos/.gitkeep`
- Create: `src/content/mythos/_data/snapshot.json`
- Modify: `src/content.config.ts`

- [ ] **Step 1: Write a failing test for the collection schema**

Create `src/test/mythos-collection.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

// Mirror the schema from src/content.config.ts so we can validate frontmatter
// fixtures without booting Astro.
const mythosFrontmatter = z.object({
  title: z.string(),
  description: z.string(),
  pubDate: z.coerce.date(),
  triggers: z.array(z.enum(['revealed', 'new_project', 'bug_class_shift', 'funnel_shift'])),
  cve_ids: z.array(z.string()).default([]),
  projects: z.array(z.string()).default([]),
  headline_snapshot: z.object({
    disclosed: z.number(),
    acknowledged: z.number(),
    fixed: z.number(),
    advisories: z.number(),
  }),
});

describe('mythos frontmatter schema', () => {
  it('accepts a minimal valid post', () => {
    const result = mythosFrontmatter.parse({
      title: 'Test',
      description: 'desc',
      pubDate: '2026-05-24',
      triggers: ['revealed'],
      headline_snapshot: { disclosed: 1, acknowledged: 1, fixed: 1, advisories: 1 },
    });
    expect(result.cve_ids).toEqual([]);
    expect(result.projects).toEqual([]);
  });

  it('rejects unknown trigger kinds', () => {
    expect(() =>
      mythosFrontmatter.parse({
        title: 't',
        description: 'd',
        pubDate: '2026-05-24',
        triggers: ['nonsense'],
        headline_snapshot: { disclosed: 0, acknowledged: 0, fixed: 0, advisories: 0 },
      }),
    ).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it passes (zod is already installed)**

Run: `npx vitest run src/test/mythos-collection.test.ts`
Expected: 2 tests pass. (This task just locks the schema contract; the next step ports it to `src/content.config.ts`.)

- [ ] **Step 3: Add the collection to `src/content.config.ts`**

Replace the contents of `src/content.config.ts` with:
```ts
import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'zod';

const blog = defineCollection({
  loader: glob({ pattern: '**/[^_]*.md', base: './src/content/blog' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    pubDate: z.coerce.date(),
    updatedDate: z.coerce.date().optional(),
    tags: z.array(z.string()).default([]),
    draft: z.boolean().default(false),
  }),
});

const mythos = defineCollection({
  loader: glob({ pattern: '**/[^_]*.md', base: './src/content/mythos' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    pubDate: z.coerce.date(),
    triggers: z.array(z.enum(['revealed', 'new_project', 'bug_class_shift', 'funnel_shift'])),
    cve_ids: z.array(z.string()).default([]),
    projects: z.array(z.string()).default([]),
    headline_snapshot: z.object({
      disclosed: z.number(),
      acknowledged: z.number(),
      fixed: z.number(),
      advisories: z.number(),
    }),
  }),
});

export const collections = { blog, mythos };
```

- [ ] **Step 4: Create the directory and bootstrap snapshot**

Create `src/content/mythos/.gitkeep` (empty).

Create `src/content/mythos/_data/snapshot.json`:
```json
{
  "as_of": "1970-01-01T00:00:00Z",
  "fetched_at": "1970-01-01T00:00:00Z",
  "headline": {
    "disclosed": 0, "acknowledged": 0, "fixed": 0, "advisories": 0,
    "candidates": 0, "reviewed": 0, "verified": 0
  },
  "rates": { "true_positive_pct": 0, "median_days_to_ack": 0, "median_days_to_patch": 0 },
  "by_bug_class": {},
  "by_ecosystem": {},
  "project_names": [],
  "revealed_cve_ids": []
}
```

The epoch placeholder dates ensure the first real run treats every CVE as "newly revealed" only if we explicitly want — see Task 7 for the bootstrap-mode override.

- [ ] **Step 5: Verify `astro check` is clean**

Run: `npm run typecheck`
Expected: passes with no errors.

- [ ] **Step 6: Commit**

```bash
git add src/content.config.ts src/content/mythos src/test/mythos-collection.test.ts
git commit -m "feat(mythos): add content collection schema and bootstrap snapshot"
```

---

## Task 3: Define shared types

**Files:**
- Create: `scripts/mythos/types.ts`

- [ ] **Step 1: Write the types**

Create `scripts/mythos/types.ts`:
```ts
export type SeverityBucket = {
  critical: number;
  high: number;
  medium: number;
  low: number;
  unknown: number;
};

export type Digest = {
  as_of: string;
  fetched_at: string;
  headline: {
    disclosed: number;
    acknowledged: number;
    fixed: number;
    advisories: number;
    candidates: number;
    reviewed: number;
    verified: number;
  };
  rates: {
    true_positive_pct: number;
    median_days_to_ack: number;
    median_days_to_patch: number;
  };
  by_bug_class: Record<string, number>;
  by_ecosystem: Record<string, SeverityBucket>;
  project_names: string[];
  revealed_cve_ids: string[];
};

export type Trigger =
  | { kind: 'revealed'; cve_id: string; project: string; bug_class: string; ecosystem: string }
  | { kind: 'new_project'; project: string; ecosystem: string; first_cves: string[] }
  | { kind: 'bug_class_shift'; bug_class: string; delta: number; pct_change: number }
  | {
      kind: 'funnel_shift';
      metric: 'tp_rate' | 'days_to_ack' | 'days_to_patch';
      from: number;
      to: number;
      pct_change: number;
    };
```

- [ ] **Step 2: Verify the file type-checks**

Run: `npx tsc --noEmit scripts/mythos/types.ts`
Expected: no output, exit 0.

- [ ] **Step 3: Commit**

```bash
git add scripts/mythos/types.ts
git commit -m "feat(mythos): add Digest and Trigger types"
```

---

## Task 4: Fixtures — `payload-old.json` and `payload-new.json`

**Files:**
- Create: `scripts/mythos/fixtures/payload-old.json`
- Create: `scripts/mythos/fixtures/payload-new.json`

These are hand-crafted minimal fixtures shaped like the real payload, but small enough to read in tests. The "new" fixture is designed so a diff with "old" produces **one of every trigger kind** for `triggers.test.ts`.

- [ ] **Step 1: Create the old fixture**

Create `scripts/mythos/fixtures/payload-old.json`:
```json
{
  "as_of": "2026-05-22T17:27:03Z",
  "headline": {
    "total_disclosed": 1000, "total_acknowledged": 900,
    "total_fixed": 90, "total_cves": 80,
    "total_candidates": 20000, "total_reviewed": 1500, "total_verified": 1300
  },
  "fp_rate": 0.10,
  "median_days_to_ack": 7,
  "median_days_to_patch": 21,
  "by_bug_class": { "heap-buffer-overflow": 100, "xss": 40 },
  "by_ecosystem": {
    "Other": { "critical": 4, "high": 10, "medium": 5, "low": 0, "unknown": 0 }
  },
  "by_project": [
    { "project": "wolfSSL", "ecosystem": "Other", "cve_ids": ["CVE-2026-0001", "CVE-2026-0002"] }
  ],
  "cve_records": [
    { "cve_id": "CVE-2026-0001", "project": "wolfSSL", "bug_class": "heap-buffer-overflow", "ecosystem": "Other" }
  ],
  "ghsa_records": []
}
```

- [ ] **Step 2: Create the new fixture**

Create `scripts/mythos/fixtures/payload-new.json`:
```json
{
  "as_of": "2026-05-23T17:27:03Z",
  "headline": {
    "total_disclosed": 1010, "total_acknowledged": 910,
    "total_fixed": 92, "total_cves": 82,
    "total_candidates": 20050, "total_reviewed": 1520, "total_verified": 1320
  },
  "fp_rate": 0.05,
  "median_days_to_ack": 7,
  "median_days_to_patch": 21,
  "by_bug_class": { "heap-buffer-overflow": 130, "xss": 40 },
  "by_ecosystem": {
    "Other": { "critical": 4, "high": 12, "medium": 5, "low": 0, "unknown": 0 }
  },
  "by_project": [
    { "project": "wolfSSL", "ecosystem": "Other", "cve_ids": ["CVE-2026-0001", "CVE-2026-0002"] },
    { "project": "curl", "ecosystem": "Other", "cve_ids": ["CVE-2026-9001"] }
  ],
  "cve_records": [
    { "cve_id": "CVE-2026-0001", "project": "wolfSSL", "bug_class": "heap-buffer-overflow", "ecosystem": "Other" },
    { "cve_id": "CVE-2026-0002", "project": "wolfSSL", "bug_class": "use-after-free", "ecosystem": "Other" }
  ],
  "ghsa_records": []
}
```

The deltas this fixture produces:
- **revealed**: `CVE-2026-0002` is newly in `cve_records`
- **new_project**: `curl` appears for the first time
- **bug_class_shift**: `heap-buffer-overflow` 100 → 130 (delta 30, +30%)
- **funnel_shift**: `tp_rate` derived from `(1 - fp_rate)` goes 90% → 95% (+5.5% relative)

- [ ] **Step 3: Commit**

```bash
git add scripts/mythos/fixtures
git commit -m "test(mythos): add hand-crafted payload fixtures for trigger tests"
```

---

## Task 5: `digest.ts` (pure)

**Files:**
- Create: `scripts/mythos/digest.ts`
- Test: `scripts/mythos/digest.test.ts`

- [ ] **Step 1: Write the failing test**

Create `scripts/mythos/digest.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { digest } from './digest';

const rawNew = JSON.parse(
  readFileSync(fileURLToPath(new URL('./fixtures/payload-new.json', import.meta.url)), 'utf8'),
);

describe('digest()', () => {
  it('extracts headline counters from the raw payload', () => {
    const d = digest(rawNew, '2026-05-24T19:00:00Z');
    expect(d.headline.disclosed).toBe(1010);
    expect(d.headline.acknowledged).toBe(910);
    expect(d.headline.fixed).toBe(92);
    expect(d.headline.advisories).toBe(82);
    expect(d.headline.candidates).toBe(20050);
    expect(d.headline.reviewed).toBe(1520);
    expect(d.headline.verified).toBe(1320);
  });

  it('derives true_positive_pct from fp_rate', () => {
    const d = digest(rawNew, '2026-05-24T19:00:00Z');
    expect(d.rates.true_positive_pct).toBeCloseTo(95, 0);
  });

  it('passes through by_bug_class and by_ecosystem unchanged', () => {
    const d = digest(rawNew, '2026-05-24T19:00:00Z');
    expect(d.by_bug_class['heap-buffer-overflow']).toBe(130);
    expect(d.by_ecosystem.Other.high).toBe(12);
  });

  it('collects sorted unique project names from by_project', () => {
    const d = digest(rawNew, '2026-05-24T19:00:00Z');
    expect(d.project_names).toEqual(['curl', 'wolfSSL']);
  });

  it('collects sorted unique CVE IDs from cve_records', () => {
    const d = digest(rawNew, '2026-05-24T19:00:00Z');
    expect(d.revealed_cve_ids).toEqual(['CVE-2026-0001', 'CVE-2026-0002']);
  });

  it('stamps as_of from the payload and fetched_at from the argument', () => {
    const d = digest(rawNew, '2026-05-24T19:00:00Z');
    expect(d.as_of).toBe('2026-05-23T17:27:03Z');
    expect(d.fetched_at).toBe('2026-05-24T19:00:00Z');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run scripts/mythos/digest.test.ts`
Expected: FAIL with "Cannot find module './digest'".

- [ ] **Step 3: Implement `digest.ts`**

Create `scripts/mythos/digest.ts`:
```ts
import type { Digest, SeverityBucket } from './types';

type RawPayload = {
  as_of: string;
  headline: {
    total_disclosed: number;
    total_acknowledged: number;
    total_fixed: number;
    total_cves: number;
    total_candidates: number;
    total_reviewed: number;
    total_verified: number;
  };
  fp_rate: number;
  median_days_to_ack: number;
  median_days_to_patch: number;
  by_bug_class: Record<string, number>;
  by_ecosystem: Record<string, SeverityBucket>;
  by_project: Array<{ project: string; ecosystem: string; cve_ids: string[] }>;
  cve_records: Array<{ cve_id: string; project: string; bug_class: string; ecosystem: string }>;
  ghsa_records: Array<{ ghsa_id: string; project: string; bug_class: string; ecosystem: string }>;
};

export function digest(raw: RawPayload, fetchedAt: string): Digest {
  const projectNames = Array.from(new Set(raw.by_project.map((p) => p.project))).sort();
  const cveIds = Array.from(new Set(raw.cve_records.map((r) => r.cve_id))).sort();
  return {
    as_of: raw.as_of,
    fetched_at: fetchedAt,
    headline: {
      disclosed: raw.headline.total_disclosed,
      acknowledged: raw.headline.total_acknowledged,
      fixed: raw.headline.total_fixed,
      advisories: raw.headline.total_cves,
      candidates: raw.headline.total_candidates,
      reviewed: raw.headline.total_reviewed,
      verified: raw.headline.total_verified,
    },
    rates: {
      true_positive_pct: Math.round((1 - raw.fp_rate) * 1000) / 10,
      median_days_to_ack: raw.median_days_to_ack,
      median_days_to_patch: raw.median_days_to_patch,
    },
    by_bug_class: { ...raw.by_bug_class },
    by_ecosystem: { ...raw.by_ecosystem },
    project_names: projectNames,
    revealed_cve_ids: cveIds,
  };
}
```

> If the actual `payload.json` field names differ from what's assumed here (`total_disclosed` etc.), adjust `RawPayload` to match. The earlier `jq keys` output of the real payload confirms `total_disclosed`, `total_acknowledged`, `total_fixed`, `total_cves`, `fp_rate`, `by_bug_class`, `by_ecosystem`, `by_project`, `cve_records`, `ghsa_records` all exist — but `total_candidates`/`total_reviewed`/`total_verified` are not in the keys list. If those aren't present, derive them from `funnel.analyzed/triaged/verified` (the `funnel` key is in the real payload). Verify with: `curl -s https://red.anthropic.com/2026/cvd/data/payload.json | jq '.funnel'` and adjust before writing the test.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run scripts/mythos/digest.test.ts`
Expected: 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add scripts/mythos/digest.ts scripts/mythos/digest.test.ts
git commit -m "feat(mythos): pure digest function maps raw payload to snapshot"
```

---

## Task 6: `triggers.ts` (pure)

**Files:**
- Create: `scripts/mythos/triggers.ts`
- Test: `scripts/mythos/triggers.test.ts`

- [ ] **Step 1: Write the failing test**

Create `scripts/mythos/triggers.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { digest } from './digest';
import { triggersFor, BUG_CLASS_MIN_DELTA, BUG_CLASS_MIN_PCT, FUNNEL_MIN_PCT } from './triggers';
import type { Digest } from './types';

function loadRaw(name: 'old' | 'new') {
  return JSON.parse(
    readFileSync(
      fileURLToPath(new URL(`./fixtures/payload-${name}.json`, import.meta.url)),
      'utf8',
    ),
  );
}
function loadDigest(name: 'old' | 'new'): Digest {
  return digest(loadRaw(name), '2026-05-24T19:00:00Z');
}

describe('triggersFor()', () => {
  it('returns empty when digests are identical', () => {
    const d = loadDigest('new');
    expect(triggersFor(d, d)).toEqual([]);
  });

  it('detects newly revealed CVEs', () => {
    const ts = triggersFor(loadDigest('old'), loadDigest('new'), loadRaw('new'));
    const revealed = ts.filter((t) => t.kind === 'revealed');
    expect(revealed).toHaveLength(1);
    expect(revealed[0]).toMatchObject({
      kind: 'revealed',
      cve_id: 'CVE-2026-0002',
      project: 'wolfSSL',
      bug_class: 'use-after-free',
      ecosystem: 'Other',
    });
  });

  it('detects new projects with enrichment from the raw payload', () => {
    const ts = triggersFor(loadDigest('old'), loadDigest('new'), loadRaw('new'));
    const np = ts.filter((t) => t.kind === 'new_project');
    expect(np).toHaveLength(1);
    expect(np[0]).toMatchObject({ kind: 'new_project', project: 'curl', ecosystem: 'Other' });
    expect((np[0] as { first_cves: string[] }).first_cves).toEqual(['CVE-2026-9001']);
  });

  it('detects bug-class shifts above thresholds', () => {
    const ts = triggersFor(loadDigest('old'), loadDigest('new'));
    const shifts = ts.filter((t) => t.kind === 'bug_class_shift');
    expect(shifts).toHaveLength(1);
    expect(shifts[0]).toMatchObject({
      kind: 'bug_class_shift',
      bug_class: 'heap-buffer-overflow',
      delta: 30,
    });
    expect((shifts[0] as { pct_change: number }).pct_change).toBeCloseTo(30, 0);
  });

  it('detects funnel-rate shifts above the threshold', () => {
    const ts = triggersFor(loadDigest('old'), loadDigest('new'));
    const fs = ts.filter((t) => t.kind === 'funnel_shift');
    expect(fs.find((t) => (t as { metric: string }).metric === 'tp_rate')).toBeDefined();
  });

  it('ignores bug-class shifts below threshold', () => {
    const o = loadDigest('new');
    const n: Digest = {
      ...o,
      by_bug_class: { ...o.by_bug_class, xss: 42 }, // delta 2, < BUG_CLASS_MIN_DELTA
    };
    const ts = triggersFor(o, n);
    expect(ts.filter((t) => t.kind === 'bug_class_shift')).toEqual([]);
  });

  it('exposes thresholds as named constants', () => {
    expect(BUG_CLASS_MIN_DELTA).toBeGreaterThan(0);
    expect(BUG_CLASS_MIN_PCT).toBeGreaterThan(0);
    expect(FUNNEL_MIN_PCT).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run scripts/mythos/triggers.test.ts`
Expected: FAIL with "Cannot find module './triggers'".

- [ ] **Step 3: Implement `triggers.ts`**

Create `scripts/mythos/triggers.ts`:
```ts
import type { Digest, Trigger } from './types';

export const BUG_CLASS_MIN_DELTA = 5;
export const BUG_CLASS_MIN_PCT = 25;
export const FUNNEL_MIN_PCT = 5;

type RawForRevealed = {
  cve_records: Array<{ cve_id: string; project: string; bug_class: string; ecosystem: string }>;
  by_project: Array<{ project: string; ecosystem: string; cve_ids: string[] }>;
};

/**
 * Diff two digests and return a list of triggers. Pure.
 *
 * `newRaw` (optional) lets us enrich `revealed` and `new_project` triggers with
 * project/bug_class/ecosystem context that isn't in the digest itself. If
 * omitted, those triggers fall back to "unknown" strings.
 */
export function triggersFor(oldD: Digest, newD: Digest, newRaw?: RawForRevealed): Trigger[] {
  const triggers: Trigger[] = [];
  const oldCves = new Set(oldD.revealed_cve_ids);
  const newProjects = new Set(newD.project_names);
  const oldProjects = new Set(oldD.project_names);

  for (const cveId of newD.revealed_cve_ids) {
    if (oldCves.has(cveId)) continue;
    const meta = newRaw?.cve_records.find((r) => r.cve_id === cveId);
    triggers.push({
      kind: 'revealed',
      cve_id: cveId,
      project: meta?.project ?? 'unknown',
      bug_class: meta?.bug_class ?? 'unknown',
      ecosystem: meta?.ecosystem ?? 'unknown',
    });
  }

  for (const project of newProjects) {
    if (oldProjects.has(project)) continue;
    const meta = newRaw?.by_project.find((p) => p.project === project);
    triggers.push({
      kind: 'new_project',
      project,
      ecosystem: meta?.ecosystem ?? 'unknown',
      first_cves: meta?.cve_ids ?? [],
    });
  }

  for (const [bugClass, count] of Object.entries(newD.by_bug_class)) {
    const oldCount = oldD.by_bug_class[bugClass] ?? 0;
    const delta = count - oldCount;
    if (delta < BUG_CLASS_MIN_DELTA) continue;
    const pct = oldCount === 0 ? 100 : ((count - oldCount) / oldCount) * 100;
    if (pct < BUG_CLASS_MIN_PCT) continue;
    triggers.push({ kind: 'bug_class_shift', bug_class: bugClass, delta, pct_change: pct });
  }

  type FunnelMetric = 'tp_rate' | 'days_to_ack' | 'days_to_patch';
  const funnelChecks: Array<[FunnelMetric, number, number]> = [
    ['tp_rate', oldD.rates.true_positive_pct, newD.rates.true_positive_pct],
    ['days_to_ack', oldD.rates.median_days_to_ack, newD.rates.median_days_to_ack],
    ['days_to_patch', oldD.rates.median_days_to_patch, newD.rates.median_days_to_patch],
  ];
  for (const [metric, from, to] of funnelChecks) {
    if (from === 0) continue;
    const pct = Math.abs(((to - from) / from) * 100);
    if (pct < FUNNEL_MIN_PCT) continue;
    triggers.push({ kind: 'funnel_shift', metric, from, to, pct_change: pct });
  }

  return triggers;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run scripts/mythos/triggers.test.ts`
Expected: 7 tests pass. If `triggers.test.ts` references `triggersFor(oldD, newD)` without the third arg and expects enriched revealed fields, the test will need the raw payload passed too — update the calls in the "detects newly revealed CVEs" and "detects new projects" tests to pass `loadRaw('new')` as the third argument. Add this helper at the top of the test file:
```ts
function loadRaw(name: 'old' | 'new') {
  return JSON.parse(
    readFileSync(
      fileURLToPath(new URL(`./fixtures/payload-${name}.json`, import.meta.url)),
      'utf8',
    ),
  );
}
```
and change the two relevant assertions to `triggersFor(loadDigest('old'), loadDigest('new'), loadRaw('new'))`.

- [ ] **Step 5: Commit**

```bash
git add scripts/mythos/triggers.ts scripts/mythos/triggers.test.ts
git commit -m "feat(mythos): pure trigger detection with tunable thresholds"
```

---

## Task 7: `fetch.ts` — bounded HTTP

**Files:**
- Create: `scripts/mythos/fetch.ts`
- Test: `scripts/mythos/fetch.test.ts`

- [ ] **Step 1: Write the failing test**

Create `scripts/mythos/fetch.test.ts`:
```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchPayload, FetchError } from './fetch';

describe('fetchPayload()', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns parsed JSON on 200', async () => {
    (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response(JSON.stringify({ as_of: '2026-05-24T00:00:00Z' }), { status: 200 }),
    );
    const result = await fetchPayload('https://example/payload.json');
    expect(result.as_of).toBe('2026-05-24T00:00:00Z');
  });

  it('throws FetchError on non-200', async () => {
    (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response('nope', { status: 503 }),
    );
    await expect(fetchPayload('https://example/payload.json')).rejects.toThrow(FetchError);
  });

  it('throws FetchError on malformed JSON', async () => {
    (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response('not json', { status: 200 }),
    );
    await expect(fetchPayload('https://example/payload.json')).rejects.toThrow(FetchError);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run scripts/mythos/fetch.test.ts`
Expected: FAIL with "Cannot find module './fetch'".

- [ ] **Step 3: Implement `fetch.ts`**

Create `scripts/mythos/fetch.ts`:
```ts
export class FetchError extends Error {
  constructor(
    message: string,
    public cause?: unknown,
  ) {
    super(message);
    this.name = 'FetchError';
  }
}

const DEFAULT_TIMEOUT_MS = 30_000;

export async function fetchPayload(url: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  } catch (err) {
    throw new FetchError(`fetch failed for ${url}`, err);
  }
  if (!response.ok) {
    throw new FetchError(`fetch ${url} returned HTTP ${response.status}`);
  }
  try {
    return (await response.json()) as unknown;
  } catch (err) {
    throw new FetchError(`fetch ${url} returned malformed JSON`, err);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run scripts/mythos/fetch.test.ts`
Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add scripts/mythos/fetch.ts scripts/mythos/fetch.test.ts
git commit -m "feat(mythos): bounded HTTP fetch with timeout and typed errors"
```

---

## Task 8: `generate.ts` — Claude SDK call + slop guardrails

> **Before implementing**, invoke the `claude-api` skill if available — it covers Anthropic SDK best practices (prompt caching, model ID conventions, error handling). Default model: `claude-sonnet-4-6`.

**Files:**
- Create: `scripts/mythos/generate.ts`
- Test: `scripts/mythos/generate.test.ts`

- [ ] **Step 1: Write the failing test**

Create `scripts/mythos/generate.test.ts`:
```ts
import { describe, expect, it, vi } from 'vitest';
import { renderPost, GenerationError, deriveSlug } from './generate';
import type { Digest, Trigger } from './types';

const oldDigest: Digest = {
  as_of: '2026-05-22T00:00:00Z',
  fetched_at: '2026-05-23T19:00:00Z',
  headline: {
    disclosed: 1000, acknowledged: 900, fixed: 90, advisories: 80,
    candidates: 20000, reviewed: 1500, verified: 1300,
  },
  rates: { true_positive_pct: 90, median_days_to_ack: 7, median_days_to_patch: 21 },
  by_bug_class: { 'heap-buffer-overflow': 100 },
  by_ecosystem: {},
  project_names: ['wolfSSL'],
  revealed_cve_ids: ['CVE-2026-0001'],
};

const newDigest: Digest = {
  ...oldDigest,
  as_of: '2026-05-23T00:00:00Z',
  headline: { ...oldDigest.headline, disclosed: 1010, advisories: 82 },
  revealed_cve_ids: ['CVE-2026-0001', 'CVE-2026-0002'],
};

const triggers: Trigger[] = [
  {
    kind: 'revealed',
    cve_id: 'CVE-2026-0002',
    project: 'wolfSSL',
    bug_class: 'use-after-free',
    ecosystem: 'Other',
  },
];

const allKnownCves = ['CVE-2026-0001', 'CVE-2026-0002'];

describe('renderPost()', () => {
  it('passes when guardrails are satisfied', async () => {
    const callLlm = vi.fn().mockResolvedValue(
      `wolfSSL CVE-2026-0002 is a newly revealed use-after-free vulnerability discovered by ` +
        `Mythos Preview. It joins ${'detail '.repeat(40)}.`,
    );
    const post = await renderPost({ oldDigest, newDigest, triggers, allKnownCves, callLlm });
    expect(post.body).toContain('CVE-2026-0002');
    expect(post.frontmatter.cve_ids).toContain('CVE-2026-0002');
    expect(post.frontmatter.triggers).toContain('revealed');
  });

  it('rejects output missing a required CVE', async () => {
    const callLlm = vi
      .fn()
      .mockResolvedValueOnce(`A vague summary with no CVE id. ${'detail '.repeat(40)}.`)
      .mockResolvedValueOnce(`Still no CVE id. ${'detail '.repeat(40)}.`);
    await expect(
      renderPost({ oldDigest, newDigest, triggers, allKnownCves, callLlm }),
    ).rejects.toThrow(GenerationError);
    expect(callLlm).toHaveBeenCalledTimes(2);
  });

  it('rejects hallucinated CVE ids', async () => {
    const callLlm = vi
      .fn()
      .mockResolvedValueOnce(
        `CVE-2026-0002 and also CVE-2026-9999. ${'detail '.repeat(40)}.`,
      )
      .mockResolvedValueOnce(
        `CVE-2026-0002 and also CVE-2026-9999. ${'detail '.repeat(40)}.`,
      );
    await expect(
      renderPost({ oldDigest, newDigest, triggers, allKnownCves, callLlm }),
    ).rejects.toThrow(GenerationError);
  });

  it('rejects output outside the word-count band', async () => {
    const callLlm = vi.fn().mockResolvedValueOnce('CVE-2026-0002 short.');
    await expect(
      renderPost({ oldDigest, newDigest, triggers, allKnownCves, callLlm }),
    ).rejects.toThrow(GenerationError);
  });
});

describe('deriveSlug()', () => {
  it('uses project + cve when there is a single revealed trigger', () => {
    expect(
      deriveSlug(new Date('2026-05-24T19:00:00Z'), [
        {
          kind: 'revealed',
          cve_id: 'CVE-2026-0002',
          project: 'wolfSSL',
          bug_class: 'use-after-free',
          ecosystem: 'Other',
        },
      ]),
    ).toBe('2026-05-24-wolfssl-cve-2026-0002');
  });

  it('uses mythos-<weekday> for multi-trigger days', () => {
    const slug = deriveSlug(new Date('2026-05-24T19:00:00Z'), [
      { kind: 'new_project', project: 'curl', ecosystem: 'Other', first_cves: [] },
      {
        kind: 'revealed',
        cve_id: 'CVE-2026-0002',
        project: 'wolfSSL',
        bug_class: 'use-after-free',
        ecosystem: 'Other',
      },
    ]);
    expect(slug).toBe('2026-05-24-mythos-sunday');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run scripts/mythos/generate.test.ts`
Expected: FAIL with "Cannot find module './generate'".

- [ ] **Step 3: Implement `generate.ts`**

Create `scripts/mythos/generate.ts`:
```ts
import type { Digest, Trigger } from './types';

export class GenerationError extends Error {
  constructor(
    message: string,
    public draft?: string,
  ) {
    super(message);
    this.name = 'GenerationError';
  }
}

export type Post = {
  slug: string;
  frontmatter: {
    title: string;
    description: string;
    pubDate: string;
    triggers: Array<Trigger['kind']>;
    cve_ids: string[];
    projects: string[];
    headline_snapshot: {
      disclosed: number;
      acknowledged: number;
      fixed: number;
      advisories: number;
    };
  };
  body: string;
};

const CVE_REGEX = /\bCVE-\d{4}-\d{4,7}\b/g;
const MIN_WORDS = 120;
const MAX_WORDS = 400;

const SYSTEM_PROMPT = `You are writing a daily tracker post for cortech.online about \
vulnerabilities discovered by Claude Mythos Preview, Anthropic's AI security research tool. \
You are a security-news tracker, not a hype outlet. Be specific, cite CVE IDs, never speculate \
beyond the data you are given. Output ONLY the body of the post in markdown. No frontmatter. \
Aim for ${MIN_WORDS}-${MAX_WORDS} words. Lead with the most concrete item (a revealed CVE or new \
project). End with a single line crediting Anthropic's dashboard at \
https://red.anthropic.com/2026/cvd/ as the source.`;

export type RenderOpts = {
  oldDigest: Digest;
  newDigest: Digest;
  triggers: Trigger[];
  allKnownCves: string[];
  callLlm: (system: string, user: string) => Promise<string>;
  now?: Date;
};

export async function renderPost(opts: RenderOpts): Promise<Post> {
  const now = opts.now ?? new Date();
  const requiredCves = opts.triggers
    .filter((t): t is Extract<Trigger, { kind: 'revealed' }> => t.kind === 'revealed')
    .map((t) => t.cve_id);
  const knownSet = new Set(opts.allKnownCves);

  const userPrompt = buildUserPrompt(opts.oldDigest, opts.newDigest, opts.triggers);

  let lastDraft = '';
  let lastError = '';
  for (let attempt = 0; attempt < 2; attempt++) {
    const corrective = attempt === 0 ? '' : `\n\nPrior attempt failed: ${lastError}. Try again.`;
    const body = (await opts.callLlm(SYSTEM_PROMPT, userPrompt + corrective)).trim();
    lastDraft = body;

    const wordCount = body.split(/\s+/).filter(Boolean).length;
    if (wordCount < MIN_WORDS || wordCount > MAX_WORDS) {
      lastError = `word count ${wordCount} outside ${MIN_WORDS}-${MAX_WORDS}`;
      continue;
    }
    const mentionedCves = Array.from(new Set(body.match(CVE_REGEX) ?? []));
    const missing = requiredCves.filter((c) => !mentionedCves.includes(c));
    if (missing.length > 0) {
      lastError = `missing required CVEs: ${missing.join(', ')}`;
      continue;
    }
    const hallucinated = mentionedCves.filter((c) => !knownSet.has(c));
    if (hallucinated.length > 0) {
      lastError = `hallucinated CVEs not present in payload: ${hallucinated.join(', ')}`;
      continue;
    }

    return {
      slug: deriveSlug(now, opts.triggers),
      frontmatter: {
        title: deriveTitle(opts.triggers),
        description: deriveDescription(opts.triggers, opts.newDigest),
        pubDate: now.toISOString(),
        triggers: Array.from(new Set(opts.triggers.map((t) => t.kind))),
        cve_ids: requiredCves,
        projects: collectProjects(opts.triggers),
        headline_snapshot: {
          disclosed: opts.newDigest.headline.disclosed,
          acknowledged: opts.newDigest.headline.acknowledged,
          fixed: opts.newDigest.headline.fixed,
          advisories: opts.newDigest.headline.advisories,
        },
      },
      body,
    };
  }
  throw new GenerationError(`generation failed after retry: ${lastError}`, lastDraft);
}

function buildUserPrompt(oldD: Digest, newD: Digest, triggers: Trigger[]): string {
  return [
    `As of ${newD.as_of}, the Mythos dashboard reports:`,
    `- ${newD.headline.disclosed} disclosed (was ${oldD.headline.disclosed})`,
    `- ${newD.headline.acknowledged} acknowledged (was ${oldD.headline.acknowledged})`,
    `- ${newD.headline.fixed} patched (was ${oldD.headline.fixed})`,
    `- ${newD.headline.advisories} CVEs/GHSAs published (was ${oldD.headline.advisories})`,
    ``,
    `Today's triggers to cover:`,
    JSON.stringify(triggers, null, 2),
  ].join('\n');
}

function deriveTitle(triggers: Trigger[]): string {
  const revealed = triggers.find((t): t is Extract<Trigger, { kind: 'revealed' }> => t.kind === 'revealed');
  if (revealed) return `${revealed.project} ${revealed.cve_id}: ${revealed.bug_class}`;
  const np = triggers.find((t): t is Extract<Trigger, { kind: 'new_project' }> => t.kind === 'new_project');
  if (np) return `Mythos adds ${np.project} to the disclosure list`;
  return `Mythos tracker update`;
}

function deriveDescription(triggers: Trigger[], newD: Digest): string {
  const parts = [`Daily Mythos tracker.`];
  if (triggers.some((t) => t.kind === 'revealed')) parts.push(`Newly revealed CVE.`);
  if (triggers.some((t) => t.kind === 'new_project')) parts.push(`New project added.`);
  if (triggers.some((t) => t.kind === 'bug_class_shift' || t.kind === 'funnel_shift'))
    parts.push(`Funnel or bug-class shift.`);
  parts.push(`${newD.headline.disclosed} total disclosed.`);
  return parts.join(' ');
}

function collectProjects(triggers: Trigger[]): string[] {
  const s = new Set<string>();
  for (const t of triggers) {
    if (t.kind === 'revealed' || t.kind === 'new_project') s.add(t.project);
  }
  return Array.from(s).sort();
}

export function deriveSlug(now: Date, triggers: Trigger[]): string {
  const date = now.toISOString().slice(0, 10);
  const revealed = triggers.filter(
    (t): t is Extract<Trigger, { kind: 'revealed' }> => t.kind === 'revealed',
  );
  if (revealed.length === 1 && triggers.length === 1) {
    const project = revealed[0].project.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const cve = revealed[0].cve_id.toLowerCase();
    return `${date}-${project}-${cve}`;
  }
  const weekday = now.toLocaleString('en-US', { weekday: 'long', timeZone: 'UTC' }).toLowerCase();
  return `${date}-mythos-${weekday}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run scripts/mythos/generate.test.ts`
Expected: 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add scripts/mythos/generate.ts scripts/mythos/generate.test.ts
git commit -m "feat(mythos): post generator with hallucination + length guardrails"
```

---

## Task 9: `write.ts` — write files to working tree

**Files:**
- Create: `scripts/mythos/write.ts`
- Test: `scripts/mythos/write.test.ts`

- [ ] **Step 1: Write the failing test**

Create `scripts/mythos/write.test.ts`:
```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writePostAndSnapshot } from './write';
import type { Digest } from './types';
import type { Post } from './generate';

describe('writePostAndSnapshot()', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'mythos-write-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  const post: Post = {
    slug: '2026-05-24-wolfssl-cve-2026-0002',
    frontmatter: {
      title: 'wolfSSL CVE-2026-0002: use-after-free',
      description: 'desc',
      pubDate: '2026-05-24T19:00:00Z',
      triggers: ['revealed'],
      cve_ids: ['CVE-2026-0002'],
      projects: ['wolfSSL'],
      headline_snapshot: { disclosed: 1010, acknowledged: 910, fixed: 92, advisories: 82 },
    },
    body: 'CVE-2026-0002 is...',
  };

  const digest: Digest = {
    as_of: '2026-05-23T00:00:00Z',
    fetched_at: '2026-05-24T19:00:00Z',
    headline: {
      disclosed: 1010, acknowledged: 910, fixed: 92, advisories: 82,
      candidates: 0, reviewed: 0, verified: 0,
    },
    rates: { true_positive_pct: 95, median_days_to_ack: 7, median_days_to_patch: 21 },
    by_bug_class: {},
    by_ecosystem: {},
    project_names: ['wolfSSL', 'curl'],
    revealed_cve_ids: ['CVE-2026-0001', 'CVE-2026-0002'],
  };

  it('writes a valid frontmatter markdown post and the snapshot JSON', () => {
    writePostAndSnapshot({
      post,
      digest,
      postsDir: join(dir, 'src/content/mythos'),
      snapshotPath: join(dir, 'src/content/mythos/_data/snapshot.json'),
    });

    const md = readFileSync(
      join(dir, 'src/content/mythos/2026-05-24-wolfssl-cve-2026-0002.md'),
      'utf8',
    );
    expect(md).toMatch(/^---\n/);
    expect(md).toContain("title: 'wolfSSL CVE-2026-0002: use-after-free'");
    expect(md).toContain('CVE-2026-0002 is...');

    const snapPath = join(dir, 'src/content/mythos/_data/snapshot.json');
    expect(existsSync(snapPath)).toBe(true);
    const snap = JSON.parse(readFileSync(snapPath, 'utf8'));
    expect(snap.revealed_cve_ids).toEqual(['CVE-2026-0001', 'CVE-2026-0002']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run scripts/mythos/write.test.ts`
Expected: FAIL with "Cannot find module './write'".

- [ ] **Step 3: Implement `write.ts`**

Create `scripts/mythos/write.ts`:
```ts
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { Digest } from './types';
import type { Post } from './generate';

export type WriteOpts = {
  post: Post;
  digest: Digest;
  postsDir: string;
  snapshotPath: string;
};

export function writePostAndSnapshot({ post, digest, postsDir, snapshotPath }: WriteOpts): void {
  mkdirSync(postsDir, { recursive: true });
  mkdirSync(dirname(snapshotPath), { recursive: true });

  const md = renderMarkdown(post);
  writeFileSync(join(postsDir, `${post.slug}.md`), md, 'utf8');
  writeFileSync(snapshotPath, JSON.stringify(digest, null, 2) + '\n', 'utf8');
}

function renderMarkdown(post: Post): string {
  const fm = post.frontmatter;
  const yaml = [
    `title: ${yamlString(fm.title)}`,
    `description: ${yamlString(fm.description)}`,
    `pubDate: ${fm.pubDate}`,
    `triggers: [${fm.triggers.map(yamlString).join(', ')}]`,
    `cve_ids: [${fm.cve_ids.map(yamlString).join(', ')}]`,
    `projects: [${fm.projects.map(yamlString).join(', ')}]`,
    `headline_snapshot:`,
    `  disclosed: ${fm.headline_snapshot.disclosed}`,
    `  acknowledged: ${fm.headline_snapshot.acknowledged}`,
    `  fixed: ${fm.headline_snapshot.fixed}`,
    `  advisories: ${fm.headline_snapshot.advisories}`,
  ].join('\n');
  return `---\n${yaml}\n---\n\n${post.body}\n`;
}

function yamlString(s: string): string {
  // Single-quoted YAML string; escape internal single quotes per YAML spec.
  return `'${s.replace(/'/g, "''")}'`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run scripts/mythos/write.test.ts`
Expected: 1 test passes.

- [ ] **Step 5: Commit**

```bash
git add scripts/mythos/write.ts scripts/mythos/write.test.ts
git commit -m "feat(mythos): write post + snapshot to working tree"
```

---

## Task 10: `run.ts` — pipeline orchestrator

**Files:**
- Create: `scripts/mythos/run.ts`

This is the only step without a vitest test — its integration is exercised end-to-end via `workflow_dispatch` in Task 14.

- [ ] **Step 1: Implement `run.ts`**

Create `scripts/mythos/run.ts`:
```ts
#!/usr/bin/env node
import Anthropic from '@anthropic-ai/sdk';
import { existsSync, readFileSync, appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { fetchPayload } from './fetch';
import { digest } from './digest';
import { triggersFor } from './triggers';
import { renderPost } from './generate';
import { writePostAndSnapshot } from './write';
import type { Digest } from './types';

const PAYLOAD_URL = 'https://red.anthropic.com/2026/cvd/data/payload.json';
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const POSTS_DIR = join(REPO_ROOT, 'src/content/mythos');
const SNAPSHOT_PATH = join(POSTS_DIR, '_data/snapshot.json');
const DRY_RUN = process.argv.includes('--dry-run');

async function main(): Promise<void> {
  console.log(`[mythos] fetching ${PAYLOAD_URL}`);
  const raw = (await fetchPayload(PAYLOAD_URL)) as Parameters<typeof digest>[0];
  const fetchedAt = new Date().toISOString();
  const newDigest = digest(raw, fetchedAt);

  if (!existsSync(SNAPSHOT_PATH)) {
    bail('snapshot missing — please re-create from Task 2 bootstrap', 1);
  }
  const oldDigest = JSON.parse(readFileSync(SNAPSHOT_PATH, 'utf8')) as Digest;

  if (oldDigest.as_of === newDigest.as_of) {
    console.log(`[mythos] payload as_of=${newDigest.as_of} unchanged; exiting cleanly`);
    return;
  }

  // Bootstrap detection: very first real run has the epoch placeholder.
  const isBootstrap = oldDigest.as_of === '1970-01-01T00:00:00Z';
  if (isBootstrap) {
    console.log(`[mythos] bootstrap: snapshot updated, no post`);
    if (!DRY_RUN) {
      writePostAndSnapshot({
        post: bootstrapPost(),
        digest: newDigest,
        postsDir: POSTS_DIR,
        snapshotPath: SNAPSHOT_PATH,
      });
      setGitHubOutput('branch', `mythos/bootstrap-${fetchedAt.slice(0, 10)}`);
    }
    return;
  }

  const triggers = triggersFor(oldDigest, newDigest, raw);
  if (triggers.length === 0) {
    console.log(`[mythos] no triggers fired; exiting cleanly`);
    return;
  }
  console.log(`[mythos] ${triggers.length} triggers fired:`, triggers.map((t) => t.kind));

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const callLlm = async (system: string, user: string): Promise<string> => {
    const msg = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system,
      messages: [{ role: 'user', content: user }],
    });
    const block = msg.content[0];
    if (block.type !== 'text') throw new Error('expected text response');
    return block.text;
  };

  const allKnownCves = newDigest.revealed_cve_ids;
  const post = await renderPost({
    oldDigest,
    newDigest,
    triggers,
    allKnownCves,
    callLlm,
  });

  if (DRY_RUN) {
    console.log('--- post ---');
    console.log(JSON.stringify(post.frontmatter, null, 2));
    console.log(post.body);
    return;
  }

  writePostAndSnapshot({
    post,
    digest: newDigest,
    postsDir: POSTS_DIR,
    snapshotPath: SNAPSHOT_PATH,
  });
  const branch = `mythos/${post.slug}`;
  setGitHubOutput('branch', branch);
  setGitHubOutput('title', post.frontmatter.title);
  console.log(`[mythos] wrote post + snapshot; branch=${branch}`);
}

function bootstrapPost() {
  return {
    slug: `bootstrap-${new Date().toISOString().slice(0, 10)}`,
    frontmatter: {
      title: 'Mythos tracker — bootstrap',
      description: 'First snapshot captured; future runs will be delta-driven.',
      pubDate: new Date().toISOString(),
      triggers: [] as never[],
      cve_ids: [] as string[],
      projects: [] as string[],
      headline_snapshot: { disclosed: 0, acknowledged: 0, fixed: 0, advisories: 0 },
    },
    body: 'Bootstrap snapshot only. Real posts begin with the next delta.',
  };
}

function setGitHubOutput(key: string, value: string): void {
  const out = process.env.GITHUB_OUTPUT;
  if (!out) return;
  appendFileSync(out, `${key}=${value}\n`);
}

function bail(msg: string, code: number): never {
  console.error(`[mythos] FATAL: ${msg}`);
  process.exit(code);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 2: Smoke-test dry run locally**

Run: `ANTHROPIC_API_KEY=skip npm run mythos:run -- --dry-run`
Expected: fetches payload, prints `[mythos] no triggers fired; exiting cleanly` (since the committed snapshot matches the live payload after the first real run). On the very first run it will print the bootstrap message instead.

If the run errors out, debug before continuing. Most likely: field-name mismatch between `digest.ts` `RawPayload` and the actual payload — adjust `digest.ts` and rerun its tests.

- [ ] **Step 3: Commit**

```bash
git add scripts/mythos/run.ts
git commit -m "feat(mythos): orchestrator wires fetch, digest, triggers, generate, write"
```

---

## Task 11: `/api/mythos.json` endpoint + dashboard page

**Files:**
- Create: `src/pages/api/mythos.json.ts`
- Create: `src/pages/mythos/index.astro`

- [ ] **Step 1: Implement the JSON endpoint**

Create `src/pages/api/mythos.json.ts`:
```ts
import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import snapshot from '../../content/mythos/_data/snapshot.json';

export const GET: APIRoute = async () => {
  const entries = await getCollection('mythos');
  const posts = entries
    .map((p) => ({
      slug: p.id,
      title: p.data.title,
      description: p.data.description,
      pubDate: p.data.pubDate.toISOString(),
      triggers: p.data.triggers,
      cve_ids: p.data.cve_ids,
      projects: p.data.projects,
    }))
    .sort((a, b) => +new Date(b.pubDate) - +new Date(a.pubDate));

  return new Response(JSON.stringify({ snapshot, posts, fetchedAt: new Date().toISOString() }), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'public, max-age=3600',
    },
  });
};

export const prerender = true;
```

- [ ] **Step 2: Implement the dashboard page**

Create `src/pages/mythos/index.astro`:
```astro
---
import { getCollection } from 'astro:content';
import Base from '../../layouts/Base.astro';
import snapshot from '../../content/mythos/_data/snapshot.json';

const posts = (await getCollection('mythos')).sort(
  (a, b) => b.data.pubDate.getTime() - a.data.pubDate.getTime(),
);

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  year: 'numeric', month: 'short', day: 'numeric',
});

const topBugClasses = Object.entries(snapshot.by_bug_class)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 10);
---

<Base
  title="Mythos tracker"
  description="Daily progress on vulnerabilities discovered by Claude Mythos Preview, tracked from Anthropic's CVD dashboard."
  canonical="https://cortech.online/mythos"
>
  <section class="mx-auto max-w-3xl px-6 pt-16 pb-10">
    <p class="font-mono text-[11px] tracking-[0.35em] text-[var(--color-amber)] uppercase">
      Mythos tracker
    </p>
    <h1 class="mt-2 text-3xl font-[var(--font-display)] font-bold tracking-tight sm:text-4xl">
      Vulnerabilities found by Mythos Preview
    </h1>
    <p class="mt-3 max-w-xl text-sm text-[var(--color-muted)]">
      Delta-driven daily summaries of <a href="https://red.anthropic.com/2026/cvd/" class="text-[var(--color-amber)] hover:underline">Anthropic's CVD dashboard</a>.
      Snapshot as of {snapshot.as_of}.
    </p>

    <div class="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
      {[
        ['Disclosed', snapshot.headline.disclosed],
        ['Acknowledged', snapshot.headline.acknowledged],
        ['Patched', snapshot.headline.fixed],
        ['Advisories', snapshot.headline.advisories],
      ].map(([label, n]) => (
        <div class="rounded-md border border-[var(--color-border)] bg-[var(--color-panel)]/60 p-4">
          <div class="text-2xl font-bold">{n}</div>
          <div class="text-xs text-[var(--color-muted)] uppercase tracking-wide">{label}</div>
        </div>
      ))}
    </div>

    <h2 class="mt-10 text-lg font-semibold">Top bug classes</h2>
    <ul class="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
      {topBugClasses.map(([k, n]) => (
        <li class="flex justify-between border-b border-[var(--color-border)]/40 py-1">
          <span class="font-mono text-xs">{k}</span><span>{n}</span>
        </li>
      ))}
    </ul>

    <h2 class="mt-10 text-lg font-semibold">Recent posts</h2>
    {posts.length === 0 ? (
      <p class="mt-3 text-sm text-[var(--color-muted)]">No posts yet — first delta will start the stream.</p>
    ) : (
      <ul class="mt-2 space-y-3">
        {posts.slice(0, 10).map((p) => (
          <li>
            <a href={`/mythos/${p.id}/`} class="text-[var(--color-amber)] hover:underline">{p.data.title}</a>
            <span class="ml-2 text-xs text-[var(--color-muted)]">{dateFormatter.format(p.data.pubDate)}</span>
          </li>
        ))}
      </ul>
    )}
  </section>
</Base>
```

- [ ] **Step 3: Verify the build**

Run: `npm run build`
Expected: builds cleanly, `/mythos/` and `/api/mythos.json` show up in the output.

- [ ] **Step 4: Commit**

```bash
git add src/pages/api/mythos.json.ts src/pages/mythos/index.astro
git commit -m "feat(mythos): dashboard page and JSON endpoint"
```

---

## Task 12: Individual post route + RSS feed

**Files:**
- Create: `src/pages/mythos/[...slug].astro`
- Create: `src/pages/mythos/rss.xml.ts`

- [ ] **Step 1: Implement the post route**

Create `src/pages/mythos/[...slug].astro`:
```astro
---
import { getCollection, render } from 'astro:content';
import Base from '../../layouts/Base.astro';

export async function getStaticPaths() {
  const posts = await getCollection('mythos');
  return posts.map((post) => ({ params: { slug: post.id }, props: { post } }));
}

const { post } = Astro.props;
const { Content } = await render(post);

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  year: 'numeric', month: 'short', day: 'numeric',
});
---

<Base
  title={post.data.title}
  description={post.data.description}
  canonical={`https://cortech.online/mythos/${post.id}`}
>
  <article class="mx-auto max-w-2xl px-6 pt-16 pb-10 prose prose-invert">
    <p class="font-mono text-[11px] tracking-[0.35em] text-[var(--color-amber)] uppercase">
      Mythos tracker · {dateFormatter.format(post.data.pubDate)}
    </p>
    <h1 class="mt-2">{post.data.title}</h1>
    <Content />
  </article>
</Base>
```

- [ ] **Step 2: Implement the RSS feed**

Create `src/pages/mythos/rss.xml.ts`:
```ts
import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import { getCollection } from 'astro:content';

export async function GET(context: APIContext) {
  const posts = await getCollection('mythos');
  return rss({
    title: 'Cortech — Mythos tracker',
    description: 'Daily delta-driven posts on vulnerabilities found by Claude Mythos Preview.',
    site: context.site!,
    items: posts
      .sort((a, b) => b.data.pubDate.getTime() - a.data.pubDate.getTime())
      .map((p) => ({
        title: p.data.title,
        description: p.data.description,
        link: new URL(`/mythos/${p.id}/`, context.site!).toString(),
        pubDate: p.data.pubDate,
        categories: ['mythos', ...p.data.triggers],
      })),
    customData: '<language>en-us</language>',
  });
}

export const prerender = true;
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: build succeeds. The mythos collection is empty so no individual post routes are emitted yet, but `/mythos/rss.xml` is.

- [ ] **Step 4: Commit**

```bash
git add src/pages/mythos/[...slug].astro src/pages/mythos/rss.xml.ts
git commit -m "feat(mythos): per-post route and dedicated RSS feed"
```

---

## Task 13: `MythosApp.tsx` + registry entry

**Files:**
- Create: `src/components/os/apps/MythosApp.tsx`
- Modify: `src/apps/registry.ts`

- [ ] **Step 1: Implement `MythosApp.tsx`**

Create `src/components/os/apps/MythosApp.tsx` — mirroring `BlogApp.tsx`'s fetch-and-cache pattern:
```tsx
import { useEffect, useState } from 'react';

type MythosPayload = {
  snapshot: {
    as_of: string;
    headline: { disclosed: number; acknowledged: number; fixed: number; advisories: number };
    by_bug_class: Record<string, number>;
  };
  posts: Array<{
    slug: string;
    title: string;
    description: string;
    pubDate: string;
    triggers: string[];
  }>;
  fetchedAt: string;
};

let fetchPromise: Promise<MythosPayload> | null = null;
let cachedPayload: MythosPayload | null = null;

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  year: 'numeric', month: 'short', day: 'numeric',
});

export default function MythosApp() {
  const [payload, setPayload] = useState<MythosPayload | null>(cachedPayload);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (cachedPayload) return;

    if (!fetchPromise) {
      fetchPromise = fetch('/api/mythos.json', { signal: AbortSignal.timeout(10000) })
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
        .then((data: MythosPayload) => {
          cachedPayload = data;
          return data;
        })
        .catch((err) => {
          fetchPromise = null;
          throw err;
        });
    }
    fetchPromise
      .then((data) => { if (!cancelled) setPayload(data); })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : 'failed'); });

    return () => { cancelled = true; };
  }, []);

  if (error) return <div class="p-6 text-sm text-red-400">Failed to load: {error}</div>;
  if (!payload) return <div class="p-6 text-sm text-[var(--color-muted)]">Loading…</div>;

  const { snapshot, posts } = payload;
  const topBugClasses = Object.entries(snapshot.by_bug_class).sort((a, b) => b[1] - a[1]).slice(0, 8);

  return (
    <div class="overflow-y-auto p-6">
      <p class="text-xs uppercase tracking-widest text-[var(--color-amber)]">Mythos tracker</p>
      <p class="mt-1 text-xs text-[var(--color-muted)]">Snapshot as of {snapshot.as_of}</p>

      <div class="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ['Disclosed', snapshot.headline.disclosed],
          ['Acknowledged', snapshot.headline.acknowledged],
          ['Patched', snapshot.headline.fixed],
          ['Advisories', snapshot.headline.advisories],
        ].map(([label, n]) => (
          <div class="rounded border border-[var(--color-border)] p-3">
            <div class="text-xl font-semibold">{n}</div>
            <div class="text-[10px] uppercase tracking-wider text-[var(--color-muted)]">{label}</div>
          </div>
        ))}
      </div>

      <h3 class="mt-6 text-sm font-semibold">Top bug classes</h3>
      <ul class="mt-2 text-xs font-mono">
        {topBugClasses.map(([k, n]) => (
          <li class="flex justify-between border-b border-[var(--color-border)]/40 py-0.5">
            <span>{k}</span><span>{n}</span>
          </li>
        ))}
      </ul>

      <h3 class="mt-6 text-sm font-semibold">Recent posts</h3>
      {posts.length === 0 ? (
        <p class="mt-2 text-xs text-[var(--color-muted)]">No posts yet.</p>
      ) : (
        <ul class="mt-2 space-y-2 text-sm">
          {posts.slice(0, 10).map((p) => (
            <li>
              <a href={`/mythos/${p.slug}/`} class="text-[var(--color-amber)] hover:underline">{p.title}</a>
              <span class="ml-2 text-xs text-[var(--color-muted)]">
                {dateFormatter.format(new Date(p.pubDate))}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Add the registry entry**

Edit `src/apps/registry.ts`. Append inside the `apps` array (between `support` and `dmarc-mx`, or at the end — placement is cosmetic):
```ts
  {
    id: 'mythos',
    name: 'Mythos tracker',
    description: 'Daily progress on vulnerabilities found by Claude Mythos Preview.',
    icon: '🔎',
    type: 'native',
    component: () => import('../components/os/apps/MythosApp'),
    defaultSize: { w: 760, h: 580 },
    minSize: { w: 480, h: 360 },
    allowMultiple: false,
  },
```

- [ ] **Step 3: Verify build, lint, typecheck**

Run:
```bash
npm run lint
npm run typecheck
npm run build
```
Expected: all pass.

- [ ] **Step 4: Verify the e2e tile-count assertion still passes**

Run: `npm run test:e2e -- --grep "springboard"` (or just `npm run test:e2e` if the grep doesn't match)
Expected: passes. The assertion in `e2e/smoke.spec.ts` is derived from `apps.length + featuredRepos.length`, so adding one app updates the expected count automatically.

- [ ] **Step 5: Commit**

```bash
git add src/components/os/apps/MythosApp.tsx src/apps/registry.ts
git commit -m "feat(mythos): add CortechOS app entry and window component"
```

---

## Task 14: GitHub Actions workflow

**Files:**
- Create: `.github/workflows/mythos.yml`

> **Before merging**, add `ANTHROPIC_API_KEY` to repo Settings → Secrets → Actions. Document this in the PR description.

- [ ] **Step 1: Create the workflow**

Create `.github/workflows/mythos.yml`:
```yaml
name: Mythos tracker

on:
  schedule:
    - cron: '0 19 * * *' # 2pm EST / 3pm EDT
  workflow_dispatch:

permissions:
  contents: write
  pull-requests: write
  issues: write

jobs:
  generate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
        with:
          fetch-depth: 0

      - uses: actions/setup-node@v6
        with:
          node-version-file: '.nvmrc'
          cache: 'npm'

      - run: npm ci

      - name: Run tracker
        id: tracker
        run: npm run mythos:run
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}

      - name: Configure git
        if: steps.tracker.outputs.branch
        run: |
          git config user.name 'mythos-bot'
          git config user.email 'mythos-bot@users.noreply.github.com'

      - name: Commit + push branch
        if: steps.tracker.outputs.branch
        run: |
          BRANCH="${{ steps.tracker.outputs.branch }}"
          git checkout -b "$BRANCH"
          git add src/content/mythos
          git commit -m "feat(mythos): ${{ steps.tracker.outputs.title || 'tracker update' }}

          Generated by .github/workflows/mythos.yml.

          Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
          git push --set-upstream origin "$BRANCH"

      - name: Open + auto-merge PR
        if: steps.tracker.outputs.branch
        run: |
          BRANCH="${{ steps.tracker.outputs.branch }}"
          gh pr create \
            --base main \
            --head "$BRANCH" \
            --title "feat(mythos): ${{ steps.tracker.outputs.title || 'tracker update' }}" \
            --body "Automated Mythos tracker post. Source: red.anthropic.com/2026/cvd/. Workflow: .github/workflows/mythos.yml."
          gh pr merge --auto --squash "$BRANCH"
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}

      - name: Open issue on guardrail failure
        if: failure()
        run: |
          gh issue create \
            --title "Mythos tracker workflow failed on $(date +%Y-%m-%d)" \
            --body "Workflow run: ${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}" \
            --label "mythos,bot-failure"
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

- [ ] **Step 2: Validate the YAML**

Run: `npx js-yaml .github/workflows/mythos.yml > /dev/null` (or `gh workflow view mythos.yml --yaml` after pushing)
Expected: no syntax error.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/mythos.yml
git commit -m "ci(mythos): daily cron workflow with auto-merge"
```

- [ ] **Step 4: Manually trigger after merge**

After the PR for this branch merges, in the GitHub UI go to Actions → "Mythos tracker" → Run workflow.
Expected:
- First run: bootstrap mode (snapshot is epoch-stamped), opens a "bootstrap" PR that auto-merges.
- Subsequent runs (within 24h): no triggers (snapshot matches live), exits cleanly without opening a PR.

If guardrail failures happen, the workflow creates a `bot-failure` issue containing the draft and triggers for your review.

---

## Task 15: Update `docs/architecture.md`

**Files:**
- Modify: `docs/architecture.md`

- [ ] **Step 1: Append a Mythos tracker section**

At the end of `docs/architecture.md`, add:
```markdown
## Mythos tracker

A scheduled workflow (`.github/workflows/mythos.yml`) runs daily at 19:00 UTC. It diffs Anthropic's CVD payload against `src/content/mythos/_data/snapshot.json` and, when meaningful deltas fire, generates a post via the Anthropic SDK, writes it to `src/content/mythos/`, and opens an auto-merge PR.

- All logic lives in `scripts/mythos/*.ts`; the YAML is thin.
- Pure modules (`digest.ts`, `triggers.ts`, `generate.ts` guardrails) are unit-tested with vitest.
- `claude-sonnet-4-6` is the default model; cost is roughly cents per delta day.
- Slop guardrails (in `generate.ts`) reject hallucinated CVE IDs, missing required CVEs, and out-of-band word counts. A guardrail failure opens a GitHub issue instead of merging a bad post.
- `ANTHROPIC_API_KEY` must be set in repo Settings → Secrets → Actions.
- Spec: [docs/superpowers/specs/2026-05-24-mythos-tracker-design.md](superpowers/specs/2026-05-24-mythos-tracker-design.md). Plan: [docs/superpowers/plans/2026-05-24-mythos-tracker.md](superpowers/plans/2026-05-24-mythos-tracker.md).
```

- [ ] **Step 2: Commit**

```bash
git add docs/architecture.md
git commit -m "docs(mythos): describe tracker in architecture.md"
```

---

## Task 16: Final verification

- [ ] **Step 1: Run the full local CI suite**

Run:
```bash
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
```
Expected: all green. If `format:check` fails, run `npm run format` and commit the formatting changes as `chore: prettier`.

- [ ] **Step 2: Run the dry-run pipeline against the live payload**

Run: `ANTHROPIC_API_KEY=skip npm run mythos:run -- --dry-run`
Expected: either "no triggers fired" or "bootstrap" — both are clean exits.

- [ ] **Step 3: Open the PR for the implementation branch**

Use the `/ship` slash command or `gh pr create` manually. PR description must include:
- A note that **`ANTHROPIC_API_KEY` needs to be added to Settings → Secrets → Actions before the cron will succeed**
- A pointer to the spec and this plan
- A call-out that the first scheduled run will be a bootstrap (no post)
