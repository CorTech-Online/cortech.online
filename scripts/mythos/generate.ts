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

// Matches both CVE (CVE-YYYY-NNNNN) and GHSA (GHSA-xxxx-xxxx-xxxx) identifiers.
// Note: `gi` makes matching case-insensitive, but knownSet.has() is case-sensitive —
// so a lowercased emission like `cve-2026-0002` would be extracted but fail the hallucination check.
const CVE_REGEX = /\b(?:CVE-\d{4}-\d{4,7}|GHSA-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4})\b/gi;
const MIN_WORDS = 120;
const MAX_WORDS = 400;
const MAX_ATTEMPTS = 2;

const SYSTEM_PROMPT = `You are writing a daily tracker post for cortech.online about \
vulnerabilities discovered by Claude Mythos Preview, Anthropic's AI security research tool. \
You are a security-news tracker, not a hype outlet. Be specific, cite CVE IDs, never speculate \
beyond the data you are given. Output ONLY the body of the post in markdown. No frontmatter. \
Aim for 120-${MAX_WORDS} words. Lead with the most concrete item (a revealed CVE or new \
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
  if (opts.triggers.length === 0) {
    throw new GenerationError('renderPost called with empty triggers — caller should skip');
  }
  const requiredCves = opts.triggers
    .filter((t): t is Extract<Trigger, { kind: 'revealed' }> => t.kind === 'revealed')
    .map((t) => t.cve_id);
  const knownSet = new Set(opts.allKnownCves);

  const userPrompt = buildUserPrompt(opts.oldDigest, opts.newDigest, opts.triggers);

  let lastDraft = '';
  let lastError = '';
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const corrective = attempt === 0 ? '' : `\n\nPrior attempt failed: ${lastError}. Try again.`;
    let body: string;
    try {
      body = (await opts.callLlm(SYSTEM_PROMPT, userPrompt + corrective)).trim();
    } catch (err) {
      lastError = `callLlm threw: ${err instanceof Error ? err.message : String(err)}`;
      continue;
    }
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
  const revealed = triggers.find(
    (t): t is Extract<Trigger, { kind: 'revealed' }> => t.kind === 'revealed',
  );
  if (revealed) return `${revealed.project} ${revealed.cve_id}: ${revealed.bug_class}`;
  const np = triggers.find(
    (t): t is Extract<Trigger, { kind: 'new_project' }> => t.kind === 'new_project',
  );
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
