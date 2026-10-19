import { readFileSync } from 'node:fs';
import { normalizePost, type WPPost, type Config } from './content';
const data = JSON.parse(
  readFileSync('.cache/wordpress.json', 'utf8'),
) as Config & { posts: WPPost[] };
export const posts = data.posts
  .filter((p) => !p.content.protected)
  .map((p) => normalizePost(p, data))
  .sort((a, b) => b.published.localeCompare(a.published) || b.id - a.id);
const paths = new Set<string>();
for (const post of posts) {
  if (paths.has(post.path))
    throw new Error(`Duplicate permalink: ${post.path}`);
  paths.add(post.path);
}
export const authors = [
  ...new Map(posts.map((p) => [p.author.id, p.author])).values(),
];
export const categories = [
  ...new Map(posts.flatMap((p) => p.categories).map((t) => [t.id, t])).values(),
];
export const tags = [
  ...new Map(posts.flatMap((p) => p.tags).map((t) => [t.id, t])).values(),
];
export const PAGE_SIZE = 9;
