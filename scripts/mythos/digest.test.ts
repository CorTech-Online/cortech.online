// @vitest-environment node
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
