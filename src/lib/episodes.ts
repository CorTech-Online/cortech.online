import { z } from 'zod';

// The R2 manifest is the contract between clodcast (producer) and
// cortech.online (consumer). Clodcast writes one JSON file per episode
// under <bucket>/manifest.json and one mp3 under <bucket>/<slug>.mp3.
// The manifest is a flat array of EpisodeEntry — the newest episodes
// first, but the consumer sorts defensively anyway.

const chapterSchema = z.object({
  title: z.string(),
  start_ms: z.number().int().nonnegative(),
  source_url: z.url().nullable().optional(),
});

const episodeSchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]+$/, 'slug must be lowercase kebab-case'),
  title: z.string(),
  description: z.string(),
  pubDate: z.coerce.date(),
  mp3_url: z.url(),
  mp3_bytes: z.number().int().positive(),
  duration_s: z.number().positive(),
  chapters: z.array(chapterSchema).default([]),
  spotify_uri: z.string().nullable().optional(),
  cover_url: z.url().nullable().optional(),
  explicit: z.boolean().default(false),
});

const manifestSchema = z.array(episodeSchema);

export type Chapter = z.infer<typeof chapterSchema>;
export type Episode = z.infer<typeof episodeSchema>;

const FETCH_TIMEOUT_MS = 10_000;

/**
 * Resolve the manifest URL from env. Unset → graceful empty list, so this PR
 * can ship before clodcast publishes anything. We treat unset / 404 / parse
 * failure as "no episodes yet" rather than failing the build.
 */
function manifestUrl(): string | null {
  const url = process.env.EPISODES_MANIFEST_URL;
  return url && url.trim() ? url.trim() : null;
}

export async function fetchEpisodes(): Promise<Episode[]> {
  const url = manifestUrl();
  if (!url) return [];

  let res: Response;
  try {
    res = await fetch(url, {
      headers: { 'User-Agent': 'cortech.online-portfolio', Accept: 'application/json' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch (err) {
    console.warn(`[episodes] manifest fetch failed: ${(err as Error).message}`);
    return [];
  }

  if (res.status === 404) return [];
  if (!res.ok) {
    console.warn(`[episodes] manifest ${url} returned ${res.status} ${res.statusText}`);
    return [];
  }

  let raw: unknown;
  try {
    raw = await res.json();
  } catch (err) {
    console.warn(`[episodes] manifest parse failed: ${(err as Error).message}`);
    return [];
  }

  const parsed = manifestSchema.safeParse(raw);
  if (!parsed.success) {
    console.warn(`[episodes] manifest validation failed: ${parsed.error.message}`);
    return [];
  }

  return parsed.data.sort((a, b) => b.pubDate.getTime() - a.pubDate.getTime());
}

/**
 * Format milliseconds as `H:MM:SS` (or `M:SS` under one hour) for chapter timestamps.
 */
export function formatChapterTimestamp(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const ss = String(seconds).padStart(2, '0');
  if (hours > 0) {
    const mm = String(minutes).padStart(2, '0');
    return `${hours}:${mm}:${ss}`;
  }
  return `${minutes}:${ss}`;
}
