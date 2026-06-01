import type { APIContext } from 'astro';

// OPML 2.0 "subscription list" — a single file an RSS reader can import to
// subscribe to every Cortech feed at once. The site's three feeds form a
// hub-and-spoke: /rss.xml is the everything-firehose; mythos and podcast are
// topic spokes. Keep this list in sync when a feed is added or removed.
type FeedEntry = {
  title: string;
  description: string;
  feedPath: string;
  pagePath: string;
};

export const FEEDS: FeedEntry[] = [
  {
    title: 'Cortech — everything',
    description: 'Projects, blog posts, and podcast episodes from cortech.online',
    feedPath: '/rss.xml',
    pagePath: '/',
  },
  {
    title: 'Cortech — Mythos tracker',
    description: 'Daily delta-driven posts on vulnerabilities found by Claude Mythos Preview',
    feedPath: '/mythos/rss.xml',
    pagePath: '/mythos',
  },
  {
    title: 'Daily Digest — Cortech',
    description: 'A daily, AI-narrated digest of links worth your morning',
    feedPath: '/podcast/rss.xml',
    pagePath: '/podcast',
  },
];

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export async function GET(context: APIContext) {
  const site = context.site!;

  const outlines = FEEDS.map((f) => {
    const xmlUrl = new URL(f.feedPath, site).toString();
    const htmlUrl = new URL(f.pagePath, site).toString();
    return (
      `    <outline text="${escapeXml(f.title)}" title="${escapeXml(f.title)}"` +
      ` description="${escapeXml(f.description)}" type="rss"` +
      ` xmlUrl="${escapeXml(xmlUrl)}" htmlUrl="${escapeXml(htmlUrl)}" />`
    );
  }).join('\n');

  const opml = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head>
    <title>Cortech feeds</title>
    <ownerName>Schmug</ownerName>
  </head>
  <body>
${outlines}
  </body>
</opml>
`;

  return new Response(opml, {
    headers: {
      // Mirrored by a public/_headers override — Cloudflare Pages serves static
      // assets by extension, and `.opml` isn't in its MIME map. With the global
      // X-Content-Type-Options: nosniff, the served type has to be set explicitly.
      'content-type': 'text/x-opml; charset=utf-8',
      'cache-control': 'public, max-age=3600',
    },
  });
}

export const prerender = true;
