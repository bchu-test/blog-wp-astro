import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import { posts } from '../lib/wordpress';
export function GET(context: APIContext) {
  return rss({
    title: 'Bchu Runway Journal',
    description: 'Fashion, people, and possibilities.',
    site: context.site!,
    items: posts
      .filter((p) => !p.noindex)
      .map((p) => ({
        title: p.title,
        description: p.description,
        pubDate: new Date(p.published),
        link: p.path,
      })),
  });
}
