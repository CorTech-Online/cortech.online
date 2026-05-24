import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Episode } from '../../lib/episodes';

const episodesRef: { current: Episode[] } = { current: [] };

vi.mock('../../lib/episodes', async () => {
  const actual = await vi.importActual<typeof import('../../lib/episodes')>(
    '../../lib/episodes',
  );
  return {
    ...actual,
    fetchEpisodes: async () => episodesRef.current,
  };
});

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

function makeEpisode(overrides: Partial<Episode> = {}): Episode {
  return {
    slug: 'sample-episode',
    title: 'Sample Episode',
    description: 'desc',
    pubDate: new Date('2026-05-20T12:00:00Z'),
    mp3_url: 'https://audio.cortech.online/sample.mp3',
    mp3_bytes: 1000000,
    duration_s: 300,
    chapters: [],
    spotify_uri: null,
    cover_url: null,
    explicit: false,
    ...overrides,
  };
}

beforeEach(() => {
  episodesRef.current = [];
});

describe('podcast rss.xml route', () => {
  it('returns a valid empty feed when no episodes exist', async () => {
    const xml = await getXml();
    expect(xml).toContain('<rss');
    expect(xml).toContain('xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"');
    expect(countItems(xml)).toBe(0);
  });

  it('declares required channel-level iTunes tags', async () => {
    const xml = await getXml();
    expect(xml).toContain('<itunes:author>');
    expect(xml).toContain('<itunes:explicit>false</itunes:explicit>');
    expect(xml).toContain('<itunes:type>episodic</itunes:type>');
    expect(xml).toContain('<itunes:image href=');
    expect(xml).toContain('<itunes:category text=');
    expect(xml).toContain('<itunes:owner>');
  });

  it('emits an <enclosure> with byte length and audio/mpeg type', async () => {
    episodesRef.current = [
      makeEpisode({
        mp3_url: 'https://audio.cortech.online/abc.mp3',
        mp3_bytes: 4192384,
      }),
    ];

    const xml = await getXml();
    expect(xml).toContain('url="https://audio.cortech.online/abc.mp3"');
    expect(xml).toContain('length="4192384"');
    expect(xml).toContain('type="audio/mpeg"');
  });

  it('emits item-level <itunes:duration> in whole seconds', async () => {
    episodesRef.current = [makeEpisode({ duration_s: 524.6 })];
    const xml = await getXml();
    expect(xml).toContain('<itunes:duration>525</itunes:duration>');
  });

  it('numbers episodes so newest gets the highest itunes:episode', async () => {
    episodesRef.current = [
      makeEpisode({ slug: 'newer', pubDate: new Date('2026-05-21') }),
      makeEpisode({ slug: 'older', pubDate: new Date('2026-05-20') }),
    ];
    const xml = await getXml();
    // newest first → episode 2; older → episode 1
    const items = xml.split('<item>').slice(1);
    expect(items[0]).toContain('<itunes:episode>2</itunes:episode>');
    expect(items[1]).toContain('<itunes:episode>1</itunes:episode>');
  });

  it('uses /podcast/<slug>/ absolute links scoped to context.site', async () => {
    episodesRef.current = [makeEpisode({ slug: 'foo-bar' })];
    const xml = await getXml();
    expect(xml).toContain('https://cortech.online/podcast/foo-bar/');
  });

  it('marks explicit episodes per-item', async () => {
    episodesRef.current = [makeEpisode({ explicit: true })];
    const xml = await getXml();
    const itemBlock = xml.split('<item>')[1] ?? '';
    expect(itemBlock).toContain('<itunes:explicit>true</itunes:explicit>');
  });
});
