import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import { getCollection } from 'astro:content';

export async function GET(context: APIContext) {
  const posts = await getCollection('mythos');
  return rss({
    title: 'Cortech — Mythos tracker',
    description: 'Daily delta-driven posts on vulnerabilities found by Claude Mythos Preview.',
    site: context.site!,
    items: posts
      .sort((a, b) => b.data.pubDate.getTime() - a.data.pubDate.getTime())
      .map((p) => ({
        title: p.data.title,
        description: p.data.description,
        link: new URL(`/mythos/${p.id}/`, context.site!).toString(),
        pubDate: p.data.pubDate,
        categories: ['mythos', ...p.data.triggers],
      })),
    customData: '<language>en-us</language>',
  });
}

export const prerender = true;
