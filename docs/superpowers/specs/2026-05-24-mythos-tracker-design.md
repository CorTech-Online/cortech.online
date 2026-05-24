# Mythos vulnerability tracker — design

**Status:** Approved, ready for implementation plan.
**Date:** 2026-05-24
**Source feed:** [red.anthropic.com/2026/cvd/](https://red.anthropic.com/2026/cvd/) — payload at [`/2026/cvd/data/payload.json`](https://red.anthropic.com/2026/cvd/data/payload.json)

## Problem

Anthropic publishes a daily-updated dashboard tracking vulnerabilities discovered by Claude Mythos Preview in open-source projects (1,596 disclosed, 1,451 acknowledged, 97 patched, 88 advisories as of 2026-05-22). The dashboard is a great primary source but doesn't narrate progress over time. A daily delta-driven feed on cortech.online would surface concrete news (revealed CVEs, new projects, notable shifts) without inheriting the slop risk of timer-driven AI content.

## Goals

- Fully automated daily generation — no human in the loop on flat days OR delta days
- Posts only when there's real news (delta-driven, not calendar-driven)
- Posts live in a dedicated content collection so they don't drown out personal blog essays
- A live dashboard page summarises current state from the most recent snapshot
- Integrates with existing CortechOS pattern (registry entry, window-rendered)
- Slop guardrails: hallucinated CVE IDs, undersized/oversized posts, missing required IDs all fail the workflow loudly

## Non-goals

- Mirroring Anthropic's full ledger (their dashboard already does this — we link to it)
- Real-time updates between scheduled runs
- Editorial commentary beyond what the payload supports
- Tracking patch-count or advisory-count milestones (explicitly excluded — those are vanity numbers)

## Architecture

One GitHub Actions cron workflow runs daily at `0 19 * * *` UTC (2pm EST / 3pm EDT) — chosen to fall after Anthropic's typical morning dashboard update. GitHub Actions cron is always UTC, so the ET clock-time drifts an hour at DST transitions; that's acceptable for a daily tracker. The workflow invokes a Node script that owns all the logic; YAML stays thin. The script can be run locally as `npm run mythos:run -- --dry-run` for development.

```
red.anthropic.com/2026/cvd/data/payload.json
  → fetch.ts          (download + parse, timeout-bounded)
  → digest.ts         (raw payload → small snapshot)
  → triggers.ts       (oldDigest + newDigest → Trigger[])
  → if Trigger[] empty: exit 0, no commit, no PR
  → generate.ts       (Trigger[] + digests → markdown via Claude API)
  → write.ts          (writes post + updated snapshot, creates branch)
  → workflow opens PR with `gh pr create`, enables `gh pr merge --auto --squash`
  → existing CI workflow (format/lint/typecheck/test/build) gates merge
  → Cloudflare Pages deploys on merge to main
```

### File layout

```
.github/workflows/mythos.yml          # cron + auto-merge wiring (thin)
scripts/mythos/
  run.ts                              # entry point, orchestrates the pipeline
  fetch.ts                            # downloads + parses payload.json
  digest.ts                           # raw payload → snapshot
  triggers.ts                         # pure: oldDigest + newDigest → Trigger[]
  generate.ts                         # Trigger[] + digest → markdown via Claude API
  write.ts                            # writes branch with post + snapshot
  fixtures/                           # canned payload pairs for tests
  digest.test.ts
  triggers.test.ts
  generate.test.ts                    # guardrail tests against canned LLM output
src/content/mythos/
  _data/snapshot.json                 # latest digest (committed; ~10–20KB)
  YYYY-MM-DD-<slug>.md                # one per delta day
src/pages/mythos/
  index.astro                         # dashboard + recent posts list
  [...slug].astro                     # individual post route
  rss.xml.ts                          # mythos-only feed
src/content.config.ts                 # add `mythos` collection alongside `blog`
src/apps/registry.ts                  # add Mythos entry
src/components/os/apps/MythosApp.tsx  # window-rendered view (mirrors BlogApp)
```

## Snapshot digest

Committed at `src/content/mythos/_data/snapshot.json`. Small, diff-friendly, sufficient for both trigger computation and dashboard rendering. The raw 969KB payload is **not** stored.

```jsonc
{
  "as_of": "2026-05-22T17:27:03Z",          // from payload.as_of
  "fetched_at": "2026-05-24T19:00:00Z",     // when our cron ran
  "headline": {
    "disclosed": 1596,
    "acknowledged": 1451,
    "fixed": 97,
    "advisories": 88,
    "candidates": 23019,
    "reviewed": 1900,
    "verified": 1726
  },
  "rates": {
    "true_positive_pct": 90.8,
    "median_days_to_ack": 7,
    "median_days_to_patch": 21
  },
  "by_bug_class": { "heap-buffer-overflow": 162, "...": 0 },
  "by_ecosystem": { "Other": { "critical": 4, "high": 14, "medium": 8, "low": 0, "unknown": 0 } },
  "project_names": ["wolfSSL", "..."],         // sorted; for "new project" detection
  "revealed_cve_ids": ["CVE-2026-5446", "..."] // sorted; for "newly revealed" detection
}
```

## Trigger logic

Pure functions in `triggers.ts`, fully unit-tested against fixture pairs.

```ts
type Trigger =
  | { kind: 'revealed'; cve_id: string; project: string; bug_class: string; ecosystem: string }
  | { kind: 'new_project'; project: string; ecosystem: string; first_cves: string[] }
  | { kind: 'bug_class_shift'; bug_class: string; delta: number; pct_change: number }
  | { kind: 'funnel_shift'; metric: 'tp_rate' | 'days_to_ack' | 'days_to_patch';
                            from: number; to: number; pct_change: number };
```

Concrete thresholds (centralised in `triggers.ts` so they're easy to tune):

- **revealed**: any CVE/GHSA in `new.revealed_cve_ids` not in `old.revealed_cve_ids`
- **new_project**: any name in `new.project_names` not in `old.project_names`
- **bug_class_shift**: a class where `delta ≥ 5` **and** `pct_change ≥ 25%` since last snapshot
- **funnel_shift**: a rate that moved `≥5%` relative since last snapshot

If the resulting `Trigger[]` is empty, the workflow exits without committing — no PR, no churn. If non-empty, **one** consolidated post covers all triggers; the LLM is told to weight `revealed > new_project > bug_class_shift > funnel_shift` when picking the lede.

Patch/advisory milestones are intentionally **not** triggers (per user decision — they're vanity counters).

## Post generation

Model: Claude Sonnet 4.6 (`claude-sonnet-4-6`). Cheap and capable enough for this output size.

System prompt persona: "security-news tracker, not a hype outlet." Output is strict frontmatter + markdown body, ≤350 words, cites the source dashboard in a footer line, no speculation beyond payload data.

Input context to the API call:
1. The triggers array (with project, bug_class, CVE IDs, deltas)
2. The current digest (so the model can give 1-sentence context: "this is the Nth heap-buffer-overflow in $project")
3. Yesterday's headline numbers (for delta phrasing)
4. A short style example pulled from `src/content/blog/_template.md` so voice matches the rest of the site

### Slop guardrails (enforced in `generate.ts` post-call)

- Post **must** include every CVE ID from `revealed` triggers (validated by regex against the rendered markdown)
- Post **must not** mention any CVE ID that isn't in the new payload (hallucination check against the full payload's `cve_records` list)
- Word count must be 120–400; outside range → retry **once** with a corrective system message, then fail the workflow
- Slug is derived deterministically from triggers, **not** from the LLM:
  - 1 revealed trigger: `YYYY-MM-DD-<project-kebab>-<cve-id-lower>.md`
  - Multiple triggers: `YYYY-MM-DD-mythos-<weekday>.md` (e.g. `2026-05-24-mythos-sunday.md`)
- On any guardrail failure, the workflow opens a GitHub issue containing the offending draft + trigger context so the news day isn't silently dropped

## Content collection schema

Added to `src/content.config.ts` next to `blog`:

```ts
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
```

The `_data/` directory is excluded by the leading-underscore glob pattern, mirroring the existing `_template.md` convention.

## Dashboard page

`/mythos` — Astro, mostly static, no React island required:

- Hero: 4 headline counters from `snapshot.json`, "as of {as_of}" stamp
- Funnel sparkline: candidates → reviewed → verified → reported → disclosed → acked → patched → advisories
- Top 10 bug classes (sorted desc by count)
- Top 10 projects (sorted desc by total disclosed)
- "Recent posts" list (last 10 from the mythos collection)
- Footer link to Anthropic's dashboard for the live/full data

CortechOS app entry uses the same wrapper pattern as `BlogApp` — fetches the rendered HTML and mounts it inside a window. Springboard tile-count assertion in `e2e/smoke.spec.ts` updates automatically because it's derived from `apps.length + featuredRepos.length`.

## Workflow

`.github/workflows/mythos.yml`:

```yaml
name: Mythos tracker

on:
  schedule:
    - cron: '0 19 * * *'   # 2pm EST / 3pm EDT
  workflow_dispatch:

permissions:
  contents: write
  pull-requests: write
  issues: write              # for guardrail-failure fallback

jobs:
  generate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - uses: actions/setup-node@v6
        with:
          node-version-file: '.nvmrc'
          cache: 'npm'
      - run: npm ci
      - run: npm run mythos:run
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
      - name: Open PR if branch was created
        run: scripts/mythos/open-pr.sh
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

`ANTHROPIC_API_KEY` is added to repo secrets. The existing CI workflow (`.github/workflows/ci.yml`) runs on every PR and gates the auto-merge — no changes needed there.

## Error handling

| Failure mode | Behaviour |
| --- | --- |
| Fetch non-200 / timeout / malformed JSON | Workflow fails loudly, no commit, no PR |
| Snapshot missing (first run) | Bootstrap mode — write snapshot only, no post |
| Claude API failure | Retry once with backoff, then fail the workflow |
| Slop guardrail fails | Open GitHub issue with draft + triggers, fail the workflow |
| Multiple workflow runs same day | Idempotent — branch name includes date; second run sees snapshot already matches and exits |
| Anthropic dashboard hasn't updated | `new.as_of == old.as_of` → exit 0 without committing |

## Testing

- `digest.test.ts` — fixture-driven; verifies digest extracts the right fields from raw payload shape, drops the bulky ones
- `triggers.test.ts` — fixture pairs (old/new digests) covering each trigger kind, threshold edges, and empty-deltas case
- `generate.test.ts` — uses canned LLM responses to verify guardrails (CVE-must-appear, no-hallucinated-CVEs, word count) catch bad output
- The workflow itself is the integration test — exercised on a feature branch via `workflow_dispatch` before merge

E2E (Playwright) is **not** added for the generator — the workflow is the integration test. A small smoke test for the `/mythos` page is reasonable but can be in scope of the implementation plan, not this spec.

## Open questions

None — all clarified during brainstorming.

## Out of scope (future work, file issues if pursued)

- Filtering by severity once Anthropic adds that to the payload
- Per-project subscription RSS feeds
- Cross-posting to other channels (Mastodon, Bluesky, email digest)
- Backfilling historical posts from the ledger archive
