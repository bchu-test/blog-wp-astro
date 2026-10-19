import sanitizeHtml from 'sanitize-html';
import { decode } from 'he';

export interface Term {
  id: number;
  name: string;
  slug: string;
  taxonomy: string;
}
export interface Author {
  id: number;
  name: string;
  slug: string;
  description?: string;
  avatar_urls?: Record<string, string>;
}
interface Media {
  source_url: string;
  alt_text: string;
  media_details?: {
    width: number;
    height: number;
    sizes?: Record<
      string,
      { source_url: string; width: number; height: number }
    >;
  };
}
export interface WPPost {
  id: number;
  link: string;
  slug: string;
  date_gmt: string;
  modified_gmt: string;
  title: { rendered: string };
  excerpt: { rendered: string; protected?: boolean };
  content: { rendered: string; protected?: boolean };
  _embedded?: {
    author?: Author[];
    'wp:term'?: Term[][];
    'wp:featuredmedia'?: Media[];
  };
  yoast_head_json?: {
    title?: string;
    description?: string;
    robots?: { index?: string };
  };
}
export interface Config {
  origin: string;
  publicOrigin: string;
  mediaBase: string;
}
export const plainText = (html: string) =>
  decode(sanitizeHtml(html, { allowedTags: [], allowedAttributes: {} }))
    .replace(/\s+/g, ' ')
    .trim();
export const decodedSlug = (slug: string) => decodeURIComponent(slug);
export const termPath = (term: Term) =>
  `/${term.taxonomy === 'category' ? 'category' : 'tag'}/${encodeURIComponent(decodedSlug(term.slug))}/`;
export const authorPath = (author: Author) =>
  `/author/${encodeURIComponent(decodedSlug(author.slug))}/`;
export function postPath(link: string) {
  const path = decodeURI(new URL(link).pathname);
  if (path === '/' || path.includes('..') || !path.endsWith('/'))
    throw new Error(`Unsupported WordPress permalink: ${link}`);
  return path;
}
export function rewriteUrl(value: string, config: Config): string {
  if (!value || value.startsWith('#')) return value;
  try {
    const url = new URL(value, config.origin);
    const origins = [
      new URL(config.origin).hostname,
      new URL(config.publicOrigin).hostname,
    ];
    if (!origins.includes(url.hostname)) return value;
    if (url.pathname.startsWith('/wp-content/uploads/')) {
      const base = config.mediaBase
        ? config.mediaBase.replace(/\/$/, '')
        : `${new URL(config.origin).origin}/wp-content/uploads`;
      return `${base}${url.pathname.slice('/wp-content/uploads'.length)}${url.search}`.replace(
        /^http:/,
        'https:',
      );
    }
    if (/^\/wp-(admin|json|login|content|includes)/.test(url.pathname))
      return new URL(url.pathname + url.search, config.origin).href;
    return url.pathname + url.search + url.hash;
  } catch {
    return value;
  }
}
export function cleanContent(html: string, config: Config) {
  return sanitizeHtml(html, {
    allowedTags: [
      ...sanitizeHtml.defaults.allowedTags,
      'img',
      'figure',
      'figcaption',
      'video',
      'source',
      'iframe',
    ],
    allowedAttributes: {
      '*': ['class', 'id', 'lang'],
      a: ['href', 'title', 'rel'],
      img: [
        'src',
        'srcset',
        'sizes',
        'alt',
        'width',
        'height',
        'loading',
        'decoding',
      ],
      iframe: ['src', 'title', 'width', 'height', 'allowfullscreen', 'loading'],
      video: ['src', 'poster', 'controls', 'preload'],
      source: ['src', 'type'],
      td: ['colspan', 'rowspan'],
      th: ['colspan', 'rowspan', 'scope'],
    },
    allowedIframeHostnames: [
      'www.youtube.com',
      'www.youtube-nocookie.com',
      'player.vimeo.com',
    ],
    transformTags: {
      '*': (tagName, attribs) => {
        for (const key of ['href', 'src', 'poster'])
          if (attribs[key]) attribs[key] = rewriteUrl(attribs[key], config);
        if (attribs.srcset)
          attribs.srcset = attribs.srcset
            .split(',')
            .map((item) => {
              const [url, ...size] = item.trim().split(/\s+/);
              return [rewriteUrl(url, config), ...size].join(' ');
            })
            .join(', ');
        if (tagName === 'img') {
          attribs.loading = 'lazy';
          attribs.decoding = 'async';
          attribs.alt ??= '';
          attribs.sizes = '(max-width: 760px) 100vw, 760px';
        }
        if (tagName === 'iframe') attribs.loading = 'lazy';
        return { tagName, attribs };
      },
    },
  });
}
export function normalizePost(raw: WPPost, config: Config) {
  const terms = (raw._embedded?.['wp:term'] || [])
    .flat()
    .filter((t) => t.id)
    .map((t) => ({ ...t, name: plainText(t.name) }));
  const author = raw._embedded?.author?.[0];
  if (!author?.slug)
    throw new Error(`Missing embedded author for post ${raw.id}`);
  const media = raw._embedded?.['wp:featuredmedia']?.[0];
  const title = plainText(raw.title.rendered);
  const text = plainText(raw.content.rendered);
  const words = [
    ...new Intl.Segmenter('th', { granularity: 'word' }).segment(text),
  ].filter((s) => s.isWordLike).length;
  return {
    id: raw.id,
    path: postPath(raw.link),
    title,
    seoTitle: plainText(raw.yoast_head_json?.title || title),
    description: plainText(
      raw.yoast_head_json?.description || raw.excerpt.rendered || text,
    ).slice(0, 180),
    noindex: raw.yoast_head_json?.robots?.index === 'noindex',
    html: cleanContent(raw.content.rendered, config),
    published: `${raw.date_gmt}Z`,
    modified: `${raw.modified_gmt}Z`,
    author: {
      ...author,
      name: plainText(author.name),
      description: plainText(author.description || ''),
    },
    tags: terms.filter((t) => t.taxonomy === 'post_tag'),
    categories: terms.filter((t) => t.taxonomy === 'category'),
    minutes: Math.max(1, Math.ceil(words / 220)),
    image: media?.source_url
      ? {
          src: rewriteUrl(media.source_url, config),
          alt: plainText(media.alt_text || title),
          width: media.media_details?.width,
          height: media.media_details?.height,
          srcset: Object.values(media.media_details?.sizes || {})
            .filter((s) => s.width > 250)
            .map((s) => `${rewriteUrl(s.source_url, config)} ${s.width}w`)
            .join(', '),
        }
      : undefined,
  };
}
export type Post = ReturnType<typeof normalizePost>;
export function relatedPosts(post: Post, posts: Post[], count = 3) {
  const score = (candidate: Post) =>
    candidate.tags.filter((t) => post.tags.some((x) => x.id === t.id)).length *
      3 +
    candidate.categories.filter((t) =>
      post.categories.some((x) => x.id === t.id),
    ).length;
  return posts
    .filter((p) => p.id !== post.id)
    .sort(
      (a, b) =>
        score(b) - score(a) ||
        b.published.localeCompare(a.published) ||
        b.id - a.id,
    )
    .slice(0, count);
}
export const dateLabel = (value: string) =>
  new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Bangkok',
  }).format(new Date(value));
