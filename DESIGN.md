# Bchu Runway blog identity

The blog is part of bchurunway.com and uses the parent storefront's visual identity.
Keep article reading surfaces white and the editorial structure responsive.

## Brand references

The parent homepage is https://www.bchurunway.com/.
User-supplied desktop and mobile screenshots on 2026-10-19 are the latest visual reference.
Local reference evidence is in the sibling `fe-revamped/docs/design/LIVE_SITE_FINDINGS.md`, `fe-revamped/src/app/globals.css`, and `front-end/src/styles.css`.
The live-site capture documents the gradient header and footer, centered logo, geometric English typography, and Prompt Thai typography.
The parent rebuild records the approved Montserrat alternative to the live site's Century Gothic.

## Shared identity

- Primary pink: `#f06992`, used as a surface with near-black labels.
- Mauve: `#a75762`, used for text links and focus indicators on white.
- Reading surface: white, with `#101010` primary text and `#636569` secondary text.
- Soft sections: `#fbf5f7`.
- Header and footer: the parent site's lavender, cyan, white, blue, and pink wash.
- Centered official Bchu Runway logo, sourced from the existing frontend's `public/logo.webp`.
- English typography: Montserrat, with Prompt for Thai.

Font files are self-hosted WOFF2 subsets from the existing parent frontend build.
They are served without Google Fonts requests, use `font-display: swap`, and retain their SIL Open Font License in `public/fonts/OFL.txt`.
The blog imports only the Montserrat Latin variable subset and Prompt Thai weights 400, 500, 600, and 700.

## Reader experience

Keep the parent-site navigation small: Clothing, Designers, Lookbook, and Blog.
Keep blog categories in their own navigation row on desktop.
On mobile, put the parent links and blog categories in a native collapsible menu beside the centered logo.
Use compact bold uppercase desktop navigation and black primary buttons with white labels, matching the supplied screenshots.
Do not put an announcement strip above the parent-style header.
Retain the featured latest story, archive pagination, author profiles, related articles, RSS, and existing dated URLs.
Use pink for emphasis without placing white text on bright pink.

## Intentional choices

Montserrat is a deliberate match to the parent storefront, even when a generic design detector flags its popularity.
