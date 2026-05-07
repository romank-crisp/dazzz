# Dazzz Universe — Architecture Plan

## Target stack

- **Frontend:** Next.js 14+ (App Router, TypeScript)
- **CMS:** WordPress (headless)
- **API:** GraphQL via WPGraphQL
- **Fields:** ACF Pro for structured content
- **Animations:** GSAP 3.12 + Lenis (client islands)

## Architecture diagram

```
┌──────────────┐      GraphQL       ┌──────────────────┐
│  WordPress   │ ◄────(WPGraphQL)───│   Next.js 14+    │
│  (headless)  │                    │   App Router      │
│              │                    │                   │
│  ACF fields  │                    │  React Server     │
│  Media lib   │                    │  Components       │
│  Nav menus   │                    │                   │
│  CPT: Cases  │                    │  GSAP + Lenis     │
│  CPT: Pages  │                    │  (client islands) │
└──────────────┘                    └──────────────────┘
       │                                     │
       │  Media via WP or                    │  Vercel / Node
       │  external CDN (optional)            │  ISR (revalidate)
       └─────────────────────────────────────┘
```

## WordPress plugins (minimal)

| Plugin | Purpose |
|---|---|
| WPGraphQL | Exposes content as GraphQL API |
| WPGraphQL for ACF | Maps ACF fields into the GraphQL schema |
| ACF Pro | Structured field groups for cases, pages, settings |
| Yoast SEO + WPGraphQL Yoast | SEO metadata in the graph (optional) |

## ACF field architecture

### Case Study (CPT `case`)

| Field group | Fields |
|---|---|
| Hero | `hero_thumbs` (gallery), `hero_video` (file), `hero_title` (text), `hero_subtitle` (text) |
| Synopsis | `synopsis_lead` (wysiwyg), `client` (text), `format` (repeater), `location` (text), `year` (text) |
| Highlights | `highlights_title` (text), `highlight_panels` (flexible content: media panel / callout panel) |

### Site Settings (options page)

- `nav_descriptor_line_1`, `nav_descriptor_line_2`
- `wordmark` (image)
- `nav_groups` (repeater of link groups)

## Next.js structure

```
app/
  layout.tsx              ← SiteNav, Lenis provider, fonts
  page.tsx                ← Home / case index
  cases/
    [slug]/
      page.tsx            ← Case study (SSG via generateStaticParams)

components/
  site-nav/
    SiteNav.tsx           ← Server component (data) + client island (scroll/hover)
    NavCompact.client.tsx ← useScroll hook, inactivity timer
  hero-intro/
    HeroIntro.client.tsx  ← GSAP card collage + scroll-away (100% client)
  case/
    Synopsis.tsx           ← Server component
    Gallery.client.tsx     ← GSAP horizontal scroll (client)
    CalloutPanel.tsx       ← Server component (static markup)

lib/
  wp-client.ts            ← GraphQL fetch wrapper with ISR tags
  queries/
    case.ts               ← getCaseBySlug, getAllCaseSlugs
    site-settings.ts      ← getSiteSettings

hooks/
  useLenis.ts             ← Lenis context + GSAP ticker sync
  useGsapContext.ts       ← gsap.context() per route
```

## Key decisions

**Server vs client boundary.** GSAP animations (HeroIntro, Gallery, NavCompact) are `'use client'` islands. Everything else renders on the server — synopsis text, callout numbers, SEO metadata.

**Data fetching.** `fetch()` inside server components with `next: { revalidate: 60 }` (ISR). One thin `wp-client.ts` wrapper — no client-side GraphQL lib needed.

**GSAP in Next.js.** Register plugins once in a layout-level client provider. Each animated section gets its own `gsap.context()` scoped to a ref, cleaned up in `useLayoutEffect` return.

**Images.** `next/image` with WordPress media domain in `next.config.js` `images.remotePatterns`. Thumbnails from ACF gallery → WP optimized sizes → Next.js `srcSet` + lazy loading.

## Migration phases

### Phase 1 — Next.js scaffold + static data (1–2 days)
- `create-next-app` with App Router, TypeScript
- Port CSS variables, fonts, base styles
- Hardcode VCA case data as local JSON
- Port SiteNav as React component
- Verify: nav renders, fonts load, themes work

### Phase 2 — GSAP animations as client islands (2–3 days)
- Port HeroIntro (card collage → expansion → text → scroll-away)
- Port Gallery (pinned horizontal scroll + callout tweens)
- Port NavCompact (scroll compact + 1s inactivity expand)
- Wire Lenis provider with GSAP ticker sync
- Verify: full page matches prototype

### Phase 3 — WordPress + WPGraphQL (1–2 days)
- Set up WP (Local or wp-env)
- Install WPGraphQL + ACF Pro + WPGraphQL for ACF
- Register CPT `case`, create ACF field groups
- Enter VCA data + upload media
- Write GraphQL queries, replace JSON fixtures
- Verify: same page, data from WP

### Phase 4 — Multi-case + routing (1 day)
- `generateStaticParams()` for all case slugs
- Index/home page with case grid or featured hero
- Dynamic `[slug]` route renders any case
- Verify: second case in WP appears on site

### Phase 5 — Polish + deploy (1 day)
- SEO: Yoast → `generateMetadata()`
- OG images
- `next/image` optimization for all media
- Deploy: Next.js → Vercel, WP → managed host
- Webhook: WP → Vercel on-demand revalidation on publish

## Tradeoffs

GSAP animations are inherently client-side — no zero-JS SSR for animated sections. Server components around them (data, SEO, static markup) still give fast TTFB and good Core Web Vitals.
