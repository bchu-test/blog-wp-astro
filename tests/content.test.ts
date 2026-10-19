import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  cleanContent,
  normalizePost,
  postPath,
  relatedPosts,
  rewriteUrl,
  termPath,
  type WPPost,
} from '../src/lib/content.ts';
const config = {
  origin: 'https://cms.example.com',
  publicOrigin: 'https://blog.example.com',
  mediaBase: '',
};
const raw = (id: number): WPPost => ({
  id,
  link: `https://blog.example.com/2026/10/15/story-${id}/`,
  slug: `story-${id}`,
  date_gmt: '2026-10-15T07:00:00',
  modified_gmt: '2026-10-16T07:00:00',
  title: { rendered: 'Style &amp; stories' },
  excerpt: { rendered: '<p>Read &amp; enjoy</p>' },
  content: { rendered: '<p>สวัสดี โลก fashion</p>' },
  _embedded: {
    author: [{ id: 1, name: 'Editor', slug: 'editor' }],
    'wp:term': [
      [{ id: 1, name: 'Fashion', slug: 'fashion', taxonomy: 'category' }],
    ],
  },
});
test('preserves dated and Thai permalinks, rejects query-based homepage links', () => {
  assert.equal(
    postPath('https://old.example/2026/10/15/%E0%B9%84%E0%B8%97%E0%B8%A2/'),
    '/2026/10/15/ไทย/',
  );
  assert.throws(() => postPath('https://old.example/?p=1'));
  assert.equal(
    termPath({
      id: 1,
      slug: '%E0%B9%84%E0%B8%97%E0%B8%A2',
      name: 'ไทย',
      taxonomy: 'post_tag',
    }),
    '/tag/%E0%B9%84%E0%B8%97%E0%B8%A2/',
  );
});
test('rewrites only WordPress content and media to the correct destinations', () => {
  assert.equal(
    rewriteUrl('http://blog.example.com/wp-content/uploads/image.jpg', config),
    'https://cms.example.com/wp-content/uploads/image.jpg',
  );
  assert.equal(
    rewriteUrl('https://blog.example.com/2026/story/#look', config),
    '/2026/story/#look',
  );
  assert.equal(
    rewriteUrl('https://shop.example.com/item', config),
    'https://shop.example.com/item',
  );
  assert.equal(
    rewriteUrl('https://blog.example.com/wp-content/uploads/a.jpg', {
      ...config,
      mediaBase: 'https://media.example.com',
    }),
    'https://media.example.com/a.jpg',
  );
});
test('removes executable HTML while preserving responsive WordPress images', () => {
  const html = cleanContent(
    '<script>alert(1)</script><img src="http://blog.example.com/wp-content/uploads/a.jpg" onerror="alert(1)" srcset="http://blog.example.com/wp-content/uploads/a.jpg 300w" width="300" height="200"><a href="javascript:alert(1)">click</a><iframe src="https://evil.example/embed"></iframe>',
    config,
  );
  assert.doesNotMatch(html, /<script|onerror|javascript:|evil\.example/);
  assert.match(html, /loading="lazy"/);
  assert.match(
    html,
    /https:\/\/cms.example.com\/wp-content\/uploads\/a.jpg 300w/,
  );
});
test('normalizes SEO text and GMT dates and computes Thai reading time', () => {
  const post = normalizePost(raw(1), config);
  assert.equal(post.title, 'Style & stories');
  assert.equal(post.published, '2026-10-15T07:00:00Z');
  assert.equal(post.description, 'Read & enjoy');
  assert.ok(post.minutes >= 1);
});
test('returns three unique related posts, excludes self and prefers shared tags', () => {
  const all = [1, 2, 3, 4, 5].map((id) => normalizePost(raw(id), config));
  const tag = { id: 9, name: 'Evening', slug: 'evening', taxonomy: 'post_tag' };
  all[0].tags = [tag];
  all[4].tags = [tag];
  const related = relatedPosts(all[0], all);
  assert.equal(related.length, 3);
  assert.equal(related[0].id, 5);
  assert.ok(related.every((p) => p.id !== 1));
  assert.equal(new Set(related.map((p) => p.id)).size, 3);
});
