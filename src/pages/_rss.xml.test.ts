import { beforeEach, describe, expect, it, vi } from 'vitest';

type FakeRepo = {
  name: string;
  description: string | null;
  html_url: string;
  updated_at: string;
};

type FakePost = {
  id: string;
  data: {
    title: string;
    description: string;
    pubDate: Date;
    tags: string[];
    draft: boolean;
  };
};

type FakeEpisode = {
  slug: string;
  title: string;
  description: string;
  pubDate: Date;
  mp3_url: string;
  mp3_bytes: number;
  duration_s: number;
  chapters: { title: string; start_ms: number; source_url?: string | null }[];
  spotify_uri: string | null;
  cover_url: string | null;
  explicit: boolean;
};

const reposRef: { current: FakeRepo[] } = { current: [] };
const postsRef: { current: FakePost[] } = { current: [] };
const episodesRef: { current: FakeEpisode[] } = { current: [] };

vi.mock('astro:content', () => ({
  // Mirror Astro's getCollection signature: optional filter that receives the entry.
  getCollection: async (_name: string, filter?: (entry: FakePost) => boolean) =>
    filter ? postsRef.current.filter(filter) : postsRef.current,
}));

vi.mock('../lib/github', () => ({
  fetchOriginalRepos: async () => reposRef.current,
}));

vi.mock('../lib/episodes', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/episodes')>()),
  fetchEpisodes: async () => episodesRef.current,
}));

import { GET } from './rss.xml';

const SITE = new URL('https://cortech.online');

function makeContext() {
  return { site: SITE } as Parameters<typeof GET>[0];
}

async function getXml(): Promise<string> {
  const res = await GET(makeContext());
  return await res.text();
}

function countItems(xml: string): number {
  return xml.match(/<item>/g)?.length ?? 0;
}

function listTitles(xml: string): string[] {
  // RSS items wrap titles in CDATA; pull the inner text.
  return [...xml.matchAll(/<item>[\s\S]*?<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/g)].map(
    (m) => m[1],
  );
}

beforeEach(() => {
  reposRef.current = [];
  postsRef.current = [];
  episodesRef.current = [];
});

describe('rss.xml route', () => {
  it('declares an atom:link rel="self" pointing at the feed URL', async () => {
    const xml = await getXml();
    expect(xml).toContain('xmlns:atom="http://www.w3.org/2005/Atom"');
    expect(xml).toMatch(
      /<atom:link href="https:\/\/cortech\.online\/rss\.xml" rel="self" type="application\/rss\+xml"\s*\/>/,
    );
  });

  it('returns repo items when no posts exist', async () => {
    reposRef.current = [
      {
        name: 'repo-a',
        description: 'first',
        html_url: 'https://github.com/schmug/repo-a',
        updated_at: '2026-04-10T12:00:00Z',
      },
    ];

    const xml = await getXml();
    expect(countItems(xml)).toBe(1);
    expect(xml).toContain('repo-a');
    expect(xml).toContain('<category>project</category>');
  });

  it('merges blog posts and repos and sorts by date desc', async () => {
    reposRef.current = [
      {
        name: 'older-repo',
        description: 'old',
        html_url: 'https://github.com/schmug/older-repo',
        updated_at: '2026-01-01T00:00:00Z',
      },
      {
        name: 'newer-repo',
        description: 'new',
        html_url: 'https://github.com/schmug/newer-repo',
        updated_at: '2026-04-15T00:00:00Z',
      },
    ];
    postsRef.current = [
      {
        id: 'middle-post',
        data: {
          title: 'Middle Post',
          description: 'in between',
          pubDate: new Date('2026-03-01T00:00:00Z'),
          tags: ['cloudflare'],
          draft: false,
        },
      },
    ];

    const xml = await getXml();
    expect(countItems(xml)).toBe(3);
    const titles = listTitles(xml);
    expect(titles).toEqual(['newer-repo', 'Middle Post', 'older-repo']);
  });

  it('excludes draft posts', async () => {
    postsRef.current = [
      {
        id: 'published',
        data: {
          title: 'Published',
          description: 'live',
          pubDate: new Date('2026-04-01T00:00:00Z'),
          tags: [],
          draft: false,
        },
      },
      {
        id: 'wip',
        data: {
          title: 'Work In Progress',
          description: 'not yet',
          pubDate: new Date('2026-04-05T00:00:00Z'),
          tags: [],
          draft: true,
        },
      },
    ];

    const xml = await getXml();
    expect(xml).toContain('Published');
    expect(xml).not.toContain('Work In Progress');
  });

  it('caps the feed at 40 items', async () => {
    reposRef.current = Array.from({ length: 50 }, (_, i) => ({
      name: `repo-${i}`,
      description: `desc ${i}`,
      html_url: `https://github.com/schmug/repo-${i}`,
      updated_at: new Date(2026, 0, 1 + i).toISOString(),
    }));

    const xml = await getXml();
    expect(countItems(xml)).toBe(40);
  });

  it('uses absolute /blog/<slug>/ links scoped to context.site', async () => {
    postsRef.current = [
      {
        id: 'hello-world',
        data: {
          title: 'Hello',
          description: 'world',
          pubDate: new Date('2026-04-12T00:00:00Z'),
          tags: [],
          draft: false,
        },
      },
    ];

    const xml = await getXml();
    expect(xml).toContain('https://cortech.online/blog/hello-world/');
  });

  it('tags posts with a blog category alongside their tags', async () => {
    postsRef.current = [
      {
        id: 'tagged',
        data: {
          title: 'Tagged',
          description: 'with tags',
          pubDate: new Date('2026-04-12T00:00:00Z'),
          tags: ['cortechos'],
          draft: false,
        },
      },
    ];

    const xml = await getXml();
    expect(xml).toContain('<category>blog</category>');
    expect(xml).toContain('<category>cortechos</category>');
  });

  it('excludes podcast episodes — they live only in /podcast/rss.xml (#149)', async () => {
    // Episodes are intentionally absent from the everything-feed: the dedicated
    // podcast feed carries them with audio enclosures, and listing them here too
    // duplicated every episode for anyone subscribed to both feeds. This guard
    // fails if episodes are ever merged back into /rss.xml.
    reposRef.current = [
      {
        name: 'a-repo',
        description: 'repo',
        html_url: 'https://github.com/schmug/a-repo',
        updated_at: '2026-04-01T00:00:00Z',
      },
    ];
    postsRef.current = [
      {
        id: 'a-post',
        data: {
          title: 'A Post',
          description: 'post',
          pubDate: new Date('2026-04-10T00:00:00Z'),
          tags: [],
          draft: false,
        },
      },
    ];
    episodesRef.current = [
      {
        slug: 'newest-episode',
        title: 'Newest Episode',
        description: 'fresh',
        pubDate: new Date('2026-04-20T00:00:00Z'),
        mp3_url: 'https://audio.cortech.online/newest.mp3',
        mp3_bytes: 1000,
        duration_s: 100,
        chapters: [],
        spotify_uri: null,
        cover_url: null,
        explicit: false,
      },
    ];

    const xml = await getXml();
    // Only repo + post items; the episode must not appear despite being newest.
    expect(countItems(xml)).toBe(2);
    expect(listTitles(xml)).toEqual(['A Post', 'a-repo']);
    expect(xml).not.toContain('Newest Episode');
    expect(xml).not.toContain('newest-episode');
    expect(xml).not.toContain('<category>podcast</category>');
  });
});
