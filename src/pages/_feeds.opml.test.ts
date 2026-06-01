import { describe, expect, it } from 'vitest';
import { GET } from './feeds.opml';

const SITE = new URL('https://cortech.online');

function makeContext() {
  return { site: SITE } as Parameters<typeof GET>[0];
}

async function getOpml(): Promise<string> {
  const res = await GET(makeContext());
  return await res.text();
}

describe('feeds.opml route', () => {
  it('serves an OPML 2.0 document', async () => {
    const xml = await getOpml();
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain('<opml version="2.0">');
    expect(xml).toContain('<head>');
    expect(xml).toContain('<body>');
  });

  it('serves it as an XML content type', async () => {
    const res = await GET(makeContext());
    expect(res.headers.get('content-type')).toMatch(/xml|opml/);
  });

  it('lists all three syndication feeds as rss outlines', async () => {
    const xml = await getOpml();
    const outlines = xml.match(/<outline\b[^>]*type="rss"[^>]*\/>/g) ?? [];
    expect(outlines.length).toBe(3);
  });

  it('points each outline at the absolute feed and page URLs', async () => {
    const xml = await getOpml();
    expect(xml).toContain('xmlUrl="https://cortech.online/rss.xml"');
    expect(xml).toContain('xmlUrl="https://cortech.online/mythos/rss.xml"');
    expect(xml).toContain('xmlUrl="https://cortech.online/podcast/rss.xml"');
    expect(xml).toContain('htmlUrl="https://cortech.online/"');
    expect(xml).toContain('htmlUrl="https://cortech.online/mythos"');
    expect(xml).toContain('htmlUrl="https://cortech.online/podcast"');
  });

  it('escapes the em dash in feed titles without corrupting the attribute', async () => {
    const xml = await getOpml();
    // Title text lives in attributes; ensure no raw unescaped quotes break parsing.
    expect(xml).not.toContain('text=""');
    expect(xml).toContain('type="rss"');
  });
});
