import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderPost, GenerationError, deriveSlug } from './generate';
import type { Digest, Trigger } from './types';

const oldDigest: Digest = {
  as_of: '2026-05-22T00:00:00Z',
  fetched_at: '2026-05-23T19:00:00Z',
  headline: {
    disclosed: 1000,
    acknowledged: 900,
    fixed: 90,
    advisories: 80,
    candidates: 20000,
    reviewed: 1500,
    verified: 1300,
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
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('passes when guardrails are satisfied', async () => {
    const callLlm = vi
      .fn()
      .mockResolvedValue(
        `wolfSSL CVE-2026-0002 is a newly revealed use-after-free vulnerability discovered by ` +
          `Mythos Preview. It joins the project's growing list. ${'detail '.repeat(120)}.`,
      );
    const post = await renderPost({ oldDigest, newDigest, triggers, allKnownCves, callLlm });
    expect(post.body).toContain('CVE-2026-0002');
    expect(post.frontmatter.cve_ids).toContain('CVE-2026-0002');
    expect(post.frontmatter.triggers).toContain('revealed');
  });

  it('rejects output missing a required CVE', async () => {
    const callLlm = vi
      .fn()
      .mockResolvedValueOnce(`A vague summary with no CVE id. ${'detail '.repeat(120)}.`)
      .mockResolvedValueOnce(`Still no CVE id. ${'detail '.repeat(120)}.`);
    const [result] = await Promise.allSettled([
      renderPost({ oldDigest, newDigest, triggers, allKnownCves, callLlm }),
      vi.runAllTimersAsync(),
    ]);
    expect(result.status).toBe('rejected');
    expect((result as PromiseRejectedResult).reason).toBeInstanceOf(GenerationError);
    expect(callLlm).toHaveBeenCalledTimes(2);
  });

  it('rejects hallucinated CVE ids', async () => {
    const callLlm = vi
      .fn()
      .mockResolvedValueOnce(`CVE-2026-0002 and also CVE-2026-9999. ${'detail '.repeat(120)}.`)
      .mockResolvedValueOnce(`CVE-2026-0002 and also CVE-2026-9999. ${'detail '.repeat(120)}.`);
    const [result] = await Promise.allSettled([
      renderPost({ oldDigest, newDigest, triggers, allKnownCves, callLlm }),
      vi.runAllTimersAsync(),
    ]);
    expect(result.status).toBe('rejected');
    expect((result as PromiseRejectedResult).reason).toBeInstanceOf(GenerationError);
  });

  it('rejects output outside the word-count band', async () => {
    const callLlm = vi
      .fn()
      .mockResolvedValueOnce('CVE-2026-0002 short.')
      .mockResolvedValueOnce('CVE-2026-0002 still short.');
    const [result] = await Promise.allSettled([
      renderPost({ oldDigest, newDigest, triggers, allKnownCves, callLlm }),
      vi.runAllTimersAsync(),
    ]);
    expect(result.status).toBe('rejected');
    expect((result as PromiseRejectedResult).reason).toBeInstanceOf(GenerationError);
  });

  it('throws when called with no triggers', async () => {
    const callLlm = vi.fn();
    // No retry on empty-triggers path, no timer needed.
    await expect(
      renderPost({ oldDigest, newDigest, triggers: [], allKnownCves, callLlm }),
    ).rejects.toThrow(GenerationError);
    expect(callLlm).not.toHaveBeenCalled();
  });

  it('retries once then throws GenerationError when callLlm rejects', async () => {
    const callLlm = vi.fn().mockRejectedValue(new Error('API down'));
    const [result] = await Promise.allSettled([
      renderPost({ oldDigest, newDigest, triggers, allKnownCves, callLlm }),
      vi.runAllTimersAsync(),
    ]);
    expect(result.status).toBe('rejected');
    expect((result as PromiseRejectedResult).reason).toBeInstanceOf(GenerationError);
    expect(callLlm).toHaveBeenCalledTimes(2);
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
