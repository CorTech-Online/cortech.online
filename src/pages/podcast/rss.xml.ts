import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import { fetchEpisodes } from '../../lib/episodes';

// Apple Podcasts directory requires the iTunes namespace + a fairly strict
// set of channel-level tags. Item-level adds <enclosure> (the audio binary)
// and <itunes:duration>. The bytes-accurate `length` on <enclosure> is
// load-bearing for some podcatchers; clodcast supplies it from ffprobe.

const PODCAST_TITLE = 'Daily Digest — Cortech';
const PODCAST_DESCRIPTION =
  'A daily, AI-narrated digest of links worth your morning — AI tooling, security, Cloudflare, and developer ergonomics. Produced by Cory Schmug.';
const AUTHOR = 'Cory Schmug';
const OWNER_NAME = 'Cory Schmug';
const OWNER_EMAIL = 'cory@cortech.online';
const CATEGORY = 'Technology';
// Apple Podcasts & Spotify require square cover art, 1400–3000px. og-image.png
// is 1200×630 and would bounce on submission; podcast-cover.png is 1400×1400.
const COVER_URL = 'https://cortech.online/podcast-cover.png';

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export async function GET(context: APIContext) {
  const episodes = await fetchEpisodes();
  const site = context.site!;
  const feedSelfUrl = new URL('/podcast/rss.xml', site).toString();

  const channelExtras = [
    `<atom:link href="${escapeXml(feedSelfUrl)}" rel="self" type="application/rss+xml" />`,
    `<language>en-us</language>`,
    `<itunes:author>${escapeXml(AUTHOR)}</itunes:author>`,
    `<itunes:summary>${escapeXml(PODCAST_DESCRIPTION)}</itunes:summary>`,
    `<itunes:explicit>false</itunes:explicit>`,
    `<itunes:type>episodic</itunes:type>`,
    `<itunes:image href="${escapeXml(COVER_URL)}" />`,
    `<itunes:category text="${escapeXml(CATEGORY)}" />`,
    `<itunes:owner><itunes:name>${escapeXml(OWNER_NAME)}</itunes:name><itunes:email>${escapeXml(OWNER_EMAIL)}</itunes:email></itunes:owner>`,
  ].join('');

  const totalEpisodes = episodes.length;

  return rss({
    title: PODCAST_TITLE,
    description: PODCAST_DESCRIPTION,
    site,
    xmlns: {
      itunes: 'http://www.itunes.com/dtds/podcast-1.0.dtd',
      atom: 'http://www.w3.org/2005/Atom',
    },
    customData: channelExtras,
    items: episodes.map((ep, idx) => {
      const episodeNumber = totalEpisodes - idx; // newest is highest
      const durationSeconds = Math.round(ep.duration_s);
      const itemExtras = [
        `<itunes:author>${escapeXml(AUTHOR)}</itunes:author>`,
        `<itunes:duration>${durationSeconds}</itunes:duration>`,
        `<itunes:episode>${episodeNumber}</itunes:episode>`,
        `<itunes:explicit>${ep.explicit ? 'true' : 'false'}</itunes:explicit>`,
        ep.cover_url ? `<itunes:image href="${escapeXml(ep.cover_url)}" />` : '',
      ]
        .filter(Boolean)
        .join('');

      return {
        title: ep.title,
        description: ep.description,
        link: new URL(`/podcast/${ep.slug}/`, site).toString(),
        pubDate: ep.pubDate,
        enclosure: {
          url: ep.mp3_url,
          length: ep.mp3_bytes,
          type: 'audio/mpeg',
        },
        customData: itemExtras,
      };
    }),
  });
}

export const prerender = true;
