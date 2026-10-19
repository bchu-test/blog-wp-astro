import { readFile, access } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { join } from 'node:path';
const snapshot = JSON.parse(await readFile('.cache/wordpress.json', 'utf8'));
const posts = snapshot.posts.filter((p) => !p.content.protected);
for (const post of posts) {
  const path = decodeURI(new URL(post.link).pathname);
  const html = await readFile(join('dist', path, 'index.html'), 'utf8');
  assert.match(html, /rel="canonical"/, `Missing canonical: ${path}`);
  assert.match(html, /name="description"/, `Missing description: ${path}`);
  assert.match(html, /"@type":"BlogPosting"/, `Missing schema: ${path}`);
  assert.equal(
    (html.match(/<h1[ >]/g) || []).length,
    1,
    `Expected one H1: ${path}`,
  );
  assert.doesNotMatch(
    html,
    /<script[^>]+src=/,
    `Unexpected client-side JavaScript: ${path}`,
  );
  assert.doesNotMatch(html, /<img[^>]+src="http:/, `Insecure image: ${path}`);
  const related =
    html.split('A little more inspiration')[1]?.split('</section>')[0] || '';
  assert.equal(
    (related.match(/class="post-card"/g) || []).length,
    Math.min(3, posts.length - 1),
    `Related post count: ${path}`,
  );
}
const pageCount = Math.ceil(posts.length / 9);
for (let page = 1; page <= pageCount; page++) {
  const path = page === 1 ? 'dist/index.html' : `dist/page/${page}/index.html`;
  await access(path);
}
for (const file of [
  'sitemap-index.xml',
  'robots.txt',
  'feed.xml',
  '404.html',
  'authors/index.html',
])
  await access(join('dist', file));
console.log(
  `Verified ${posts.length} article pages, ${pageCount} homepage pages, SEO metadata, related articles, and discovery files.`,
);
