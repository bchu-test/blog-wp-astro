# Bchu Runway Journal

A static Astro frontend for the existing WordPress blog.
WordPress remains the editorial CMS; readers receive prebuilt HTML from Netlify.

## Local development

Use Node 22.22+ and pnpm.

```sh
pnpm install
cp .env.example .env
pnpm dev
```

`pnpm dev` imports published WordPress posts before starting Astro.
After editing WordPress during local development, run `pnpm sync` and restart the dev server.
The generated `.cache/wordpress.json` is ignored by Git and contains only public API data.
No WordPress credentials are needed.

```sh
pnpm test
pnpm check
pnpm format:check
pnpm build
pnpm verify:build
pnpm preview
```

Every production build imports fresh content and fails if an API page fails or the post count is inconsistent.
A failed Netlify build leaves the previous successful deployment online.
The importer deliberately does not fall back to stale cached content.
Password-protected articles are excluded.

## Features

- Existing dated WordPress post paths, including Thai slugs.
- Latest-first homepage, nine posts per page, with a featured newest article.
- Paginated author, category, and tag archives, plus a writer directory.
- Three related articles ranked by shared tags and categories, then publication date.
- Responsive images using WordPress image sizes, lazy loading below the fold, and prioritized article covers.
- Thai-aware reading times, publication dates, and updated dates.
- Canonical URLs, descriptions, Open Graph and Twitter metadata, BlogPosting structured data, sitemap, robots.txt, and RSS.
- Sanitized WordPress HTML with common Gutenberg block styles and no comments.
- No frontend JavaScript, database, server functions, or image transformation service.

## Configuration

| Variable                  | Purpose                                                                      |
| ------------------------- | ---------------------------------------------------------------------------- |
| `WORDPRESS_URL`           | WordPress installation origin, later your CMS subdomain.                     |
| `PUBLIC_SITE_URL`         | Canonical reader-facing origin, normally `https://blog.bchurunway.com`.      |
| `WORDPRESS_PUBLIC_ORIGIN` | Original WordPress origin for rewriting links embedded in old posts.         |
| `MEDIA_BASE_URL`          | Optional public CDN base containing a full mirror of `wp-content/uploads`.   |
| `WORDPRESS_BUILD_TOKEN`   | Optional secret sent as `X-Bchu-Build-Token` so a firewall can allow builds. |

Secrets must stay in your hosting environment or WordPress configuration.
Do not commit `.env` or the Netlify build hook URL.

## Netlify deployment

1. Connect this repository to your existing legacy Free Netlify team.
2. Use the settings in `netlify.toml`: build command `pnpm build`, publish directory `dist`, Node 22.
3. Set the environment variables above in Netlify.
4. Deploy to the Netlify preview domain and review it before changing DNS.
5. Create a build hook for the production branch in Netlify's build settings.
6. Install the WordPress plugin below and test an edit, a new post, and an unpublish action.

Netlify's [legacy plan documentation](https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-legacy-plans/legacy-pricing-plans/) lists 300 build minutes per month for the legacy Free plan.
Check the actual allowance and usage in your existing account; this project does not change your plan or enable paid services.
The plugin batches changes for five minutes and requests builds only for content changes.
Actual build usage depends on publishing frequency, API latency, and Netlify's build environment.
Images load directly from WordPress or your configured CDN, rather than consuming Netlify image-delivery bandwidth.
Disable unnecessary branch deploys and deploy previews in Netlify if their build usage is not useful to your team.
Use Netlify's deploy failure notifications to catch builds that were accepted by a hook but subsequently failed.

### Build requests blocked by Cloudflare

WordPress sits behind Cloudflare, which can block Netlify's build servers because they run on cloud-provider IP ranges.
The build then fails with `WordPress returned HTTP 403 ... (server=cloudflare, ...)`, even though the same request works from your own computer.
The `cf-ray` value in the error identifies the blocked request in Cloudflare's **Security → Events** log, which names the feature that blocked it.

- **Bot Fight Mode** (Security → Bots) is the usual cause. On the Free plan it cannot be skipped by a WAF rule, so turn it off for this zone, or move WordPress to a CMS hostname on a zone without it.
- **Custom rules, Security Level, Browser Integrity Check, or Under Attack mode**: set a random `WORDPRESS_BUILD_TOKEN` in Netlify, then add a WAF custom rule with the action **Skip** for those features, matching `http.request.uri.path wildcard "/wp-json/wp/v2/posts*"` and request header `x-bchu-build-token` equal to the same value.
- A 403 without `server=cloudflare` comes from the WordPress host or a security plugin such as Wordfence; allow the REST API there instead.

## WordPress rebuild plugin

Copy `wordpress/bchu-astro-rebuild.php` into `wp-content/plugins/bchu-astro-rebuild/bchu-astro-rebuild.php` on WordPress.
Add the following to `wp-config.php` before the stop-editing comment:

```php
define('BCHU_NETLIFY_BUILD_HOOK', 'https://api.netlify.com/build_hooks/YOUR_SECRET_HOOK_ID');
define('BCHU_REBUILD_DELAY', 300);
```

Activate **Bchu Astro Rebuild** in WordPress.
Publishing, editing, unpublishing, and deleting public posts schedules a build.
Author profile changes, taxonomy edits, and attachment changes also schedule builds.
Scheduled publications trigger a build when WordPress actually publishes the post.
Failed hook requests retry up to four times with backoff, then show an administrator notice with a protected retry link.
A successful hook request means Netlify accepted the request; it does not prove that the deploy succeeded.

**Configure a real cron job on the WordPress host.**
After readers move to Astro, traffic-driven WP-Cron may rarely run.
Run `wp cron event run --due-now --path=/path/to/wordpress` every minute using the host's scheduler, and follow the host's guidance for disabling traffic-triggered cron.
This is also necessary for reliable scheduled WordPress publications.
Normal update latency is the batching delay plus cron delay plus the Netlify build and deploy duration.

## Domain cutover and SEO

Do not point `blog.bchurunway.com` at Netlify until WordPress has a separate working origin.

1. Back up WordPress and its database.
2. Move WordPress to a CMS origin such as `cms.bchurunway.com`, with working HTTPS, admin login, REST API, and uploads.
3. Update `WORDPRESS_URL` in Netlify and keep `WORDPRESS_PUBLIC_ORIGIN=https://blog.bchurunway.com`.
4. Confirm all dated post paths still match the existing public URLs.
5. Keep the public blog indexable, but prevent the CMS HTML frontend from competing in search results using origin-server `X-Robots-Tag: noindex` or suitable WordPress SEO settings.
6. Confirm original `/wp-content/uploads/*` URLs still resolve after cutover, using a Netlify proxy to the new CMS or explicit media redirects.
7. Audit legacy WordPress Pages, feeds, attachments, query-string URLs, and changed post slugs for redirects before launch.
8. Point the blog domain at Netlify, verify HTTPS, and submit `/sitemap-index.xml` to Search Console.

This frontend preserves current post permalinks from the REST API.
It cannot discover historic slugs or all plugin-generated routes from the posts API.
WordPress Pages and private editorial previews are outside the initial frontend scope.
Changing a published post's slug still needs a redirect from the old URL.

If WordPress media stays on the CMS origin, add this rule above other Netlify redirect rules after replacing the example host:

```toml
[[redirects]]
from = "/wp-content/uploads/*"
to = "https://cms.bchurunway.com/wp-content/uploads/:splat"
status = 200
```

Add a `/feed/` to `/feed.xml` redirect if the existing WordPress feed URL is in use.
Do not redirect `/wp-json/*` back to the reader frontend; builds must fetch the CMS origin.

## Optional R2 media

Copy the entire uploads tree to R2, including all WordPress-generated resized variants, before enabling `MEDIA_BASE_URL`.
The base should map directly to the uploads root: `2026/10/image.jpg` must exist beneath it.
Use a public custom media domain with HTTPS and suitable cache headers.
Configure a WordPress media offload integration so future uploads and resized variants are copied too.
This repository rewrites URLs but does not provision an R2 bucket, copy images, or synchronize uploads.
R2 storage and request charges are independent of the Netlify plan.

## Structure

- `scripts/sync-wordpress.mjs`: paginated API ingestion, retries, and atomic cache writes.
- `src/lib/content.ts`: content normalization, sanitization, URL mapping, and related-post ranking.
- `src/lib/wordpress.ts`: build-time content snapshot and archive data.
- `src/pages/[...path].astro`: post and paginated archive generation.
- `src/components`: shared listing and article cards.
- `src/layouts/Layout.astro`: site navigation and SEO metadata.
- `src/styles/global.css`: responsive editorial design and WordPress block styling.
- `wordpress/bchu-astro-rebuild.php`: installable rebuild plugin.

## Follow-up opportunities

Add static client-side search if the archive becomes difficult to browse.
Consider a dedicated authenticated preview deployment if editors need to review unpublished content in the Astro design.
Monitor real-user Core Web Vitals after launch; WordPress media response times remain a factor until images move to a fast CDN.
