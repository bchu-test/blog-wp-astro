import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import { readFileSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
try {
  loadEnvFile();
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
let excluded = new Set();
try {
  const snapshot = JSON.parse(readFileSync('.cache/wordpress.json', 'utf8'));
  excluded = new Set(
    snapshot.posts
      .filter((p) => p.yoast_head_json?.robots?.index === 'noindex')
      .map((p) => new URL(p.link).pathname),
  );
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
export default defineConfig({
  site: process.env.PUBLIC_SITE_URL || 'https://blog.bchurunway.com',
  output: 'static',
  trailingSlash: 'always',
  integrations: [
    sitemap({
      filter: (page) =>
        !page.endsWith('/404/') && !excluded.has(new URL(page).pathname),
    }),
  ],
});
