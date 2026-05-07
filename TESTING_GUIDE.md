# Testing Guide — Dazzz Universe (En Coulisses)

## Quick Start

```bash
# Navigate to project directory
cd /Users/roman/Documents/Dev/03-dzz

# Start a simple HTTP server (Python 3.7+)
python3 -m http.server 8000

# Open in browser
# http://localhost:8000
```

Or use Node:
```bash
npx http-server -p 8000
```

## Testing Checklist

### 1. Hero Intro Animation (Page Load)
**Location:** Full viewport height section before "About the project"

- [ ] **Cards appear sequentially** — 12 image thumbnails scatter one by one
  - Each card rotates slightly (-5 to 5 deg)
  - Each card offsets randomly (-50 to 50px on X/Y)
  - Duration: ~1.1s per card, staggered by 0.13s
  - No cards should be visible before the sequence starts

- [ ] **Video card expands fullscreen** — 13th card (video) grows to fill viewport
  - Starts expanding ~0.1s before last image finishes
  - Expands over 1.8s with smooth easing
  - Border radius animates from 4px → 0 (sharp corners)
  - Video fills entire viewport and stays there during rest of animation

- [ ] **Overlay fades in** — semi-transparent dark gradient
  - Appears mid-expansion
  - Creates depth: flat overlay + gradient shadow
  - Should feel atmospheric, not distracting

- [ ] **Title reveals** — "En Coulisse / *Immersive* / unique experience and concept"
  - Words appear one by one, sliding up from below
  - Staggered by ~0.05s per word
  - Starts ~1s before expansion ends
  - Text is large serif, white/cream color

- [ ] **Animation holds briefly** — before scroll unlocks
  - After title fully reveals, animation pauses for ~0.8s
  - This lets viewer absorb the final composition

- [ ] **Total duration** ~4–5 seconds from page load to scroll unlock

### 2. Nav Behavior During Hero

- [ ] **Nav is transparent** — hero background visible through it
  - CSS: `background: transparent !important;`
  - No white/cream background covering hero

- [ ] **Nav text is white/cream** (#EFEAE2)
  - Descriptor text (left)
  - Logo is inverted (white)
  - All menu links are white
  - Language selector is white

- [ ] **Nav stays fully expanded** during hero
  - Not affected by scroll position
  - All menu groups visible (About, Clients, Contact)
  - No compact/collapse behavior

- [ ] **Word-mask hover works**
  - Hover on any nav link
  - First word shows arrow icon + original text
  - Word slides revealing alt state

- [ ] **Nav height is stable** — no jumps
  - ResizeObserver measures height once
  - Negative margin on #heroIntro stays stable
  - No layout shift when hero ends

### 3. Scroll & Theme Switching

- [ ] **Hero theme exits smoothly** when scrolling past hero
  - Nav text transitions from white → dark (ink color)
  - Nav background transitions from transparent → cream
  - Happens as soon as <50% of hero is visible

- [ ] **Nav compact kicks in** after 80px scroll
  - Descriptor, menu groups, language selector fade out
  - Only logo + wordmark stay visible
  - Transition is smooth (CSS opacity/transform)

- [ ] **Nav auto-expands** 1 second after scroll stops
  - After scrolling stops, timer starts
  - Wait 1 second with no scroll
  - Nav automatically expands back to full state

- [ ] **Highlights section theme** — nav text turns white again
  - Scroll into Highlights section (black background)
  - Nav text flips to white/cream
  - Nav background stays transparent (shows black through)
  - This is driven by IntersectionObserver on `.gallery__pin`

### 4. Highlights Section Design

- [ ] **Background is pure black** (#000 or #050505)
  - Full-bleed black panel
  - Highest contrast with cream text

- [ ] **Opening title panel layout**
  - Top decorative rule (mark) — thin line, cream color
  - Title row: "Highlights" + side rule (extends to right)
  - Below: caption text ("minutes of original music…")

- [ ] **Highlights title styling**
  - Class: `.mega-h1` (large serif)
  - Color: cream (#EFEAE2)
  - Font: Instrument Serif, uppercase
  - Size: clamp(56px, 7.91vw, 114px) — responsive

- [ ] **Title animation on scroll**
  - When panel scrolls into view:
  - Top mark scales in from 0 → 1 (left to right)
  - Title words slide up from below (yPercent 100 → 0)
  - Side rule scales in
  - Caption fades in
  - Total stagger: ~0.8–1.0s

### 5. Gallery Pinned Scroll (Highlights)

- [ ] **Horizontal scroll pins** at desktop width
  - Section pins to viewport
  - Content slides horizontally
  - Uses GSAP ScrollTrigger with `pin: true`

- [ ] **Media panels reveal** with left-to-right curtain
  - clipPath animates from right (0% visible) → left (100% visible)
  - Image scales from 1.08 → 1 during reveal
  - Takes ~0.85s per panel

- [ ] **Callout panels animate in**
  - Items fade in + slide up
  - Numbers count up when visible
  - Staggered between items

- [ ] **Parallax effect** on images
  - During horizontal scroll, images shift up/down slightly
  - Creates depth as you scroll through

### 6. Synopsis Section

- [ ] **Lead text reveals by lines**
  - Words split and grouped by Y position (line grouping)
  - Each line fades in + slides up
  - Staggered across lines

- [ ] **Table rows fade in**
  - Client, Format, Location, Year rows
  - Fade in + slide up
  - Staggered timing

### 7. Performance & Polish

- [ ] **No layout shifts** during any animation
  - Especially during nav expand/compact
  - heroIntro margin-top stable via ResizeObserver

- [ ] **Smooth 60fps** throughout
  - Open DevTools → Performance
  - Record during hero intro
  - Check for dropped frames

- [ ] **Respects prefers-reduced-motion**
  - Set system accessibility to reduce motion
  - Animations should skip/simplify
  - Content still visible and accessible

- [ ] **Mobile responsive** (test at 768px, 375px)
  - Nav links hide on mobile
  - Title layout adjusts (no side rule)
  - Gallery becomes vertical scroll at breakpoint

## Known Details

| Element | CSS Class | Initial State | Animated Property |
|---------|-----------|---------------|--------------------|
| Hero intro | `#heroIntro` | height: 100svh, margin-top: calc(var(--nav-h) * -1) | N/A (container) |
| Cards | `.hi-card` | scale: 0.04, opacity: 0, rotation: ±12deg | scale, opacity, rotation, x, y, borderRadius |
| Video card | `.hi-card` (last) | same as above | scale (fillScale), borderRadius: 0 |
| Overlay | `#hiOverlay` | opacity: 0 | opacity: 1 |
| Title text | `.hi-mega` | hidden until expansion | revealed word-by-word |
| Nav | `.site-nav` | background: transparent | text color (--cream ↔ --ink) |
| Highlights title | `.mega-h1.hl-title` | yPercent: 100, opacity: 0 | yPercent: 0, opacity: 1 |

## Debugging Tips

### If hero doesn't animate:
1. Check browser console for GSAP errors
2. Verify GSAP loaded: `window.gsap` should exist
3. Check if `lenis.stop()` was called at bootstrap
4. Verify 12 image files exist in `assets/img/cases/vca-bolshoi/thumb/`
5. Verify video exists at `assets/video/vca-bolshoi-hero.mp4`

### If nav text is wrong color:
1. Check `body[data-hero-active]` attribute value
2. Verify IntersectionObserver observer threshold: `[0, 0.25, 0.5, 0.75, 1]`
3. Check CSS rule for `body[data-hero-active="true"] .site-nav__link { color: #EFEAE2; }`

### If nav compacts incorrectly:
1. Check `window.scrollY > 80` logic in `onScrollUpdate()`
2. Verify ResizeObserver is observing `.site-nav`
3. Check `--nav-h` CSS variable: `getComputedStyle(document.documentElement).getPropertyValue('--nav-h')`

### If scroll feels janky:
1. Check if Lenis is running: `lenis.start()` called after hero
2. Check ScrollTrigger registered: `gsap.registerPlugin(ScrollTrigger)`
3. Verify `lenis.on('scroll', ScrollTrigger.update)` is wired

## Browser Compatibility

- **Requires:** GSAP 3.12+, ScrollTrigger, IntersectionObserver, ResizeObserver
- **Tested:** Chrome 120+, Safari 16+, Firefox 121+
- **Graceful degradation:** Lenis smooth scroll optional; core animations work without it
