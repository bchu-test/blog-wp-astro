import { mkdir, writeFile, rename } from 'node:fs/promises';
import { loadEnvFile } from 'node:process';
try {
  loadEnvFile();
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
const origin = process.env.WORDPRESS_URL || 'https://blog.bchurunway.com';
const endpoint = new URL('wp-json/wp/v2/posts', origin.replace(/\/?$/, '/'));
const headers = {
  Accept: 'application/json',
  'User-Agent': 'bchu-blog-astro-build/1.0 (+https://blog.bchurunway.com)',
};
// Lets a firewall rule on the WordPress side recognise and allow build requests.
if (process.env.WORDPRESS_BUILD_TOKEN)
  headers['X-Bchu-Build-Token'] = process.env.WORDPRESS_BUILD_TOKEN;
async function describeFailure(response) {
  const details = ['server', 'cf-mitigated', 'cf-ray']
    .filter((name) => response.headers.has(name))
    .map((name) => `${name}=${response.headers.get(name)}`);
  const body = await response.text().catch(() => '');
  const title = body.match(/<title>([^<]*)<\/title>/i)?.[1]?.trim();
  if (title) details.push(`page title "${title}"`);
  else {
    try {
      const { code, message } = JSON.parse(body);
      if (code) details.push(`WordPress error ${code}: ${message}`);
    } catch {}
  }
  let hint = '';
  if (
    response.status === 403 &&
    /cloudflare/i.test(response.headers.get('server') ?? '')
  )
    hint =
      '. Cloudflare is blocking the build server; see "Build requests blocked by Cloudflare" in README.md';
  return (details.length ? ` (${details.join(', ')})` : '') + hint;
}
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
      const response = await fetch(url, {
        headers,
        signal: AbortSignal.timeout(60000),
      });
      if (!response.ok) {
        const error = new Error(
          `WordPress returned HTTP ${response.status} on page ${number}${await describeFailure(response)}`,
        );
        // Client errors other than rate limiting will not succeed on retry.
        error.permanent =
          response.status >= 400 &&
          response.status < 500 &&
          response.status !== 429;
        throw error;
      }
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
      if (attempt === 2 || error.permanent)
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
