import { mkdir, writeFile, rename } from 'node:fs/promises';
import { loadEnvFile } from 'node:process';
try {
  loadEnvFile();
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
const origin = process.env.WORDPRESS_URL || 'https://blog.bchurunway.com';
const endpoint = new URL('wp-json/wp/v2/posts', origin.replace(/\/?$/, '/'));
async function page(number) {
  const url = new URL(endpoint);
  url.search = new URLSearchParams({
    per_page: '20',
    page: String(number),
    status: 'publish',
    orderby: 'date',
    order: 'desc',
    _embed: 'author,wp:term,wp:featuredmedia',
  });
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      console.log(
        `Fetching WordPress page ${number}, attempt ${attempt + 1}...`,
      );
      const response = await fetch(url, { signal: AbortSignal.timeout(60000) });
      if (!response.ok)
        throw new Error(
          `WordPress returned HTTP ${response.status} on page ${number}`,
        );
      const posts = await response.json();
      const total = Number(response.headers.get('x-wp-total'));
      const pages = Number(response.headers.get('x-wp-totalpages'));
      if (
        !Array.isArray(posts) ||
        !response.headers.has('x-wp-totalpages') ||
        !Number.isInteger(pages) ||
        pages < 0 ||
        !response.headers.has('x-wp-total') ||
        !Number.isInteger(total) ||
        total < 0
      )
        throw new Error('Invalid WordPress pagination response');
      return { posts, total, pages };
    } catch (error) {
      if (attempt === 2)
        throw new Error(
          `WordPress import failed on page ${number}: ${error.message}`,
          { cause: error },
        );
      await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
    }
  }
}
const first = await page(1);
const posts = [...first.posts];
for (let number = 2; number <= first.pages; number++) {
  const next = await page(number);
  if (next.total !== first.total)
    throw new Error('WordPress changed during import. Retry the build.');
  posts.push(...next.posts);
}
if (
  posts.length !== first.total ||
  new Set(posts.map((post) => post.id)).size !== posts.length
)
  throw new Error(
    'Incomplete or duplicate WordPress import; refusing to publish',
  );
await mkdir('.cache', { recursive: true });
await writeFile(
  '.cache/wordpress.tmp',
  JSON.stringify({
    posts,
    origin,
    publicOrigin:
      process.env.WORDPRESS_PUBLIC_ORIGIN || 'https://blog.bchurunway.com',
    mediaBase: process.env.MEDIA_BASE_URL || '',
    fetchedAt: new Date().toISOString(),
  }),
);
await rename('.cache/wordpress.tmp', '.cache/wordpress.json');
console.log(
  `Imported ${posts.length} published WordPress posts across ${first.pages} API pages.`,
);
