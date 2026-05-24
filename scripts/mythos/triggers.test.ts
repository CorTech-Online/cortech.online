// @vitest-environment node
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

  it('detects newly revealed GHSA identifiers', () => {
    const oldDigest = loadDigest('old');
    const newRaw = loadRaw('new');
    // Inject a GHSA into a copy of newRaw so it shows up as newly revealed.
    const augmentedRaw = {
      ...newRaw,
      ghsa_records: [
        ...(newRaw.ghsa_records ?? []),
        {
          identifier: 'GHSA-aaaa-bbbb-cccc',
          findings: [{ project: 'curl', bug_class: 'xss', ecosystem: 'Other' }],
        },
      ],
    };
    const newDigest = digest(augmentedRaw, '2026-05-24T19:00:00Z');
    const ts = triggersFor(oldDigest, newDigest, augmentedRaw);
    const revealed = ts.filter((t) => t.kind === 'revealed' && t.cve_id === 'GHSA-aaaa-bbbb-cccc');
    expect(revealed).toHaveLength(1);
    expect(revealed[0]).toMatchObject({
      kind: 'revealed',
      cve_id: 'GHSA-aaaa-bbbb-cccc',
      project: 'curl',
      bug_class: 'xss',
    });
  });
});
