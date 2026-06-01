import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import { getCollection } from 'astro:content';

export async function GET(context: APIContext) {
  const posts = await getCollection('mythos');
  const feedSelfUrl = new URL('/mythos/rss.xml', context.site!).toString();
  return rss({
    title: 'Cortech — Mythos tracker',
    description: 'Daily delta-driven posts on vulnerabilities found by Claude Mythos Preview.',
    site: context.site!,
    xmlns: { atom: 'http://www.w3.org/2005/Atom' },
    items: posts
      .sort((a, b) => b.data.pubDate.getTime() - a.data.pubDate.getTime())
      .map((p) => ({
        title: p.data.title,
        description: p.data.description,
        link: new URL(`/mythos/${p.id}/`, context.site!).toString(),
        pubDate: p.data.pubDate,
        categories: ['mythos', ...p.data.triggers],
      })),
    customData: `<atom:link href="${feedSelfUrl}" rel="self" type="application/rss+xml" /><language>en-us</language>`,
  });
}

export const prerender = true;
