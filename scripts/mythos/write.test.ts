// @vitest-environment node
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
      disclosed: 1010,
      acknowledged: 910,
      fixed: 92,
      advisories: 82,
      candidates: 0,
      reviewed: 0,
      verified: 0,
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
