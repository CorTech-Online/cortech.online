#!/usr/bin/env node
import Anthropic from '@anthropic-ai/sdk';
import { existsSync, readFileSync, appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { fetchPayload } from './fetch';
import { digest } from './digest';
import { triggersFor } from './triggers';
import { renderPost } from './generate';
import type { Post } from './generate';
import { writePostAndSnapshot } from './write';
import type { Digest } from './types';

const PAYLOAD_URL = 'https://red.anthropic.com/2026/cvd/data/payload.json';
const MODEL = 'claude-sonnet-4-6';
const MAX_TOKENS = 1024;
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
    console.log(`[mythos] bootstrap: writing placeholder post + snapshot`);
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
      model: MODEL,
      max_tokens: MAX_TOKENS,
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

function bootstrapPost(): Post {
  return {
    slug: `bootstrap-${new Date().toISOString().slice(0, 10)}`,
    frontmatter: {
      title: 'Mythos tracker — bootstrap',
      description: 'First snapshot captured; future runs will be delta-driven.',
      pubDate: new Date().toISOString(),
      triggers: [],
      cve_ids: [],
      projects: [],
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

main().catch((err: unknown) => {
  if (err instanceof Error) {
    console.error(`[mythos] FATAL: ${err.message}`);
    if ('cause' in err && err.cause) console.error('  cause:', err.cause);
    if ('draft' in err && err.draft) console.error('  draft:', err.draft);
    if (err.stack) console.error(err.stack);
  } else {
    console.error('[mythos] FATAL (non-Error):', err);
  }
  process.exit(1);
});
