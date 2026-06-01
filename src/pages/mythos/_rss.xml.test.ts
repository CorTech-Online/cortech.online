import { beforeEach, describe, expect, it, vi } from 'vitest';

type FakeMythosPost = {
  id: string;
  data: {
    title: string;
    description: string;
    pubDate: Date;
    triggers: string[];
  };
};

const postsRef: { current: FakeMythosPost[] } = { current: [] };

vi.mock('astro:content', () => ({
  getCollection: async (_name: string, filter?: (entry: FakeMythosPost) => boolean) =>
    filter ? postsRef.current.filter(filter) : postsRef.current,
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
  return [...xml.matchAll(/<item>[\s\S]*?<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/g)].map(
    (m) => m[1],
  );
}

function makePost(overrides: Partial<FakeMythosPost> = {}): FakeMythosPost {
  return {
    id: 'sample-2026-05-24',
    data: {
      title: 'Sample mythos update',
      description: 'desc',
      pubDate: new Date('2026-05-24T00:00:00Z'),
      triggers: ['revealed'],
      ...overrides.data,
    },
    ...overrides,
  } as FakeMythosPost;
}

beforeEach(() => {
  postsRef.current = [];
});

describe('mythos rss.xml route', () => {
  it('returns a valid empty feed when no posts exist', async () => {
    const xml = await getXml();
    expect(xml).toContain('<rss');
    expect(countItems(xml)).toBe(0);
  });

  it('declares an atom:link rel="self" pointing at the feed URL', async () => {
    const xml = await getXml();
    expect(xml).toContain('xmlns:atom="http://www.w3.org/2005/Atom"');
    expect(xml).toMatch(
      /<atom:link href="https:\/\/cortech\.online\/mythos\/rss\.xml" rel="self" type="application\/rss\+xml"\s*\/>/,
    );
  });

  it('sorts posts newest first', async () => {
    postsRef.current = [
      makePost({
        id: 'older',
        data: {
          title: 'Older',
          description: 'o',
          pubDate: new Date('2026-05-20'),
          triggers: ['revealed'],
        },
      }),
      makePost({
        id: 'newer',
        data: {
          title: 'Newer',
          description: 'n',
          pubDate: new Date('2026-05-25'),
          triggers: ['revealed'],
        },
      }),
    ];
    const xml = await getXml();
    expect(listTitles(xml)).toEqual(['Newer', 'Older']);
  });

  it('tags posts with a mythos category alongside their triggers', async () => {
    postsRef.current = [
      makePost({
        data: {
          title: 'T',
          description: 'd',
          pubDate: new Date('2026-05-24'),
          triggers: ['revealed', 'funnel_shift'],
        },
      }),
    ];
    const xml = await getXml();
    expect(xml).toContain('<category>mythos</category>');
    expect(xml).toContain('<category>revealed</category>');
    expect(xml).toContain('<category>funnel_shift</category>');
  });

  it('uses absolute /mythos/<id>/ links scoped to context.site', async () => {
    postsRef.current = [makePost({ id: 'bootstrap-2026-05-24' })];
    const xml = await getXml();
    expect(xml).toContain('https://cortech.online/mythos/bootstrap-2026-05-24/');
  });

  it('declares the feed language', async () => {
    const xml = await getXml();
    expect(xml).toContain('<language>en-us</language>');
  });
});
