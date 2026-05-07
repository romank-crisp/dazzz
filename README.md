# Dazzz Universe — Case Study (En Coulisses)

Static prototype, single page. **Van Cleef & Arpels — *En Coulisses*, Pashkov House, 2021.**

Plain HTML + vanilla CSS + GSAP 3.x. No framework, no build step. Open `index.html` directly in a modern browser.

---

## Design log

A running record of decisions across passes. Pass = a discrete deliverable agreed before moving on.

### Pass 1 — Tokens & shell · current
**What's real**
- Type pairing: **Fraunces** (display, opsz 144, weight 350, italic for editorial breath) + **Inter Tight** (UI/body, 400/500). Both Google Fonts.
- Colour: **3 values committed** — `--ink #0F0E0C` (warm off-black), `--cream #F1ECE3` (warm paper), `--oxblood #8B2E1E` (deep red, used sparingly for marks and one credit rule).
- Modular type scale via `clamp()` custom properties — title hits `14vw` so it can break the grid in Pass 2.
- Motion tokens: `--ease-out` (expo.out), `--ease-inout` (power3.inOut). Durations cluster 0.4s/0.6s/0.9s/1.2s.
- Lenis bootstrapped, ticks ScrollTrigger. `gsap.context()` shell open for Pass 2+.
- Custom 12px cursor lerps at 0.12 — hidden on touch + reduced-motion.
- `prefers-reduced-motion` strips smooth-wheel, cursor, motion durations down to 0.3s opacity fades.

**What's faked / placeholder**
- `<main>` is empty — sections land in passes 2–4.
- No images yet; `assets/img/` is a directory.
- SplitText is referenced as a Pass-2 dependency but not loaded — it's a paid GSAP plugin; manual word/char splitter will be the fallback.

**What I tried & killed**
- Considered Reckless + Inter — killed: Reckless is on every Awwwards site this season, reads as trend not register.
- Considered ultramarine accent — killed: VCA + Bolshoi + Pashkov reads as theatre velvet, oxblood is native; ultramarine would fight the subject.
- Considered loading GSAP locally up-front — kept on CDN for now, will bundle if budget tightens past 200KB.

**What I'd push further with another day**
- Self-host Fraunces + Inter Tight as subset woff2 (currently Google Fonts CDN — one extra connection).
- A second cream tone for paper-on-paper sections (e.g. credits) is tempting but breaks the 3-value commitment; revisit only if a section truly demands it.

### Pass 2 — Hero, synopsis, stats · current
**What's real**
- Hero: full-bleed image (Unsplash placeholder, candlelit interior), title `En Coulisses` set at `14vw` Fraunces 350, breaks below the image baseline (`bottom: -1vw`) so the descender intentionally bleeds into the next section's whitespace. Corner metadata (Client / Year · Location) in eyebrow small caps; vertical "Scroll" cue bottom-right.
- Hero entrance: `clip-path inset(100% 0 0 0) → inset(0%)` (1.1s expo.out) paired with image scale 1.06 → 1, then char-stagger title rise (0.025s each, total ~1.2s), then nav/meta fade-up.
- Hero parallax via ScrollTrigger scrub: title rises 22%, image drifts down 12% + scales to 1.08. Decoupled from Lenis (ScrollTrigger ticks off Lenis already).
- Synopsis: one paragraph at `--fs-display` (Fraunces italic 300), max-width 22ch, 7-col grid placement on ≥1024 with eyebrow in left rail. Word-level split + 0.04s stagger reveal triggered at 80% viewport.
- Stats: 6 numerals in a 6-column grid (≥1100), top-rule on each. GSAP tweens 0 → target over 1.6s `power3.out`, snaps to int via `Math.round`, comma-formatted via `toLocaleString`. Suffixes (m², min) supported via `data-suffix`.
- Cursor: switched from manual RAF to `gsap.ticker` + `gsap.quickSetter`; GSAP now owns the transform matrix so scale tweens (1 → 5.3 over media) compose cleanly with the position lerp. `mix-blend-mode: difference` does the inversion.
- Manual SplitText fallback in `main.js` (chars + words modes) — no club plugin needed. Handles inline `<em>` / `<sup>` by recursing through nodes for words mode.

**What's faked / placeholder**
- Hero image is Unsplash. Final plate would be an in-house photograph from the actual production; no licensing path for a real Pashkov House interior in this prototype.
- Top nav links go nowhere (`href="#"`).
- "Scroll" cue is decorative — not a button, doesn't trigger anything.

**What I tried & killed**
- Initial split CSS pre-hid words to `opacity: 0` until `data-ready`, but Fraunces FOIT made the synopsis flash. Kept the pre-hide (still wanted for split-clean entrances) but `data-ready` flips on first RAF, so the gap is one frame.
- Considered a cream-on-cream synopsis card with a thin rule — killed, reads as decorative; the silasveta reference proves prose-on-page is enough.
- Initially sized title at `font-size: var(--fs-title)` only — looked anaemic. Pulled `letter-spacing: -0.025em` and weight 350 (over 400) to get the proper editorial confidence.

**What I'd push further**
- Replace the hero image with a muted autoplay video loop (theatre curtain rising, ~6s, ≤1MB webm). The clip-path entrance is already video-ready.
- Stats labels could rise from below in concert with the counter — currently they're static-on-fade. A small detail; would feel more orchestrated.
- A subtle film-grain over the hero (SVG turbulence, opacity 0.05) — every luxury reference uses one. Avoiding for now to keep the perf budget honest.

### Pass 3 — Method, gallery (pinned) · current
**What's real**
- 5 method blocks, **rhythm explicitly varied** so no two adjacent compositions repeat:
  - 01 *paired*: copy-left, image-right (tall 4:5).
  - 02 *full-bleed*: cinematic image with copy overlaid bottom-left in cream over ink.
  - 03 *prose*: text-only, italic pull-quote with a hairline rule above it.
  - 04 *paired-mirror*: image-left, copy-right (mirror of 01).
  - 05 *quiet bleed*: lead caption + wide image breaking the gutter on both sides.
- Numerals (01..05) set in **Fraunces italic, oxblood** — the only place the accent appears in the page so far. Not a logo treatment; a maker's notation.
- Each block: number lifts up, heading word-staggers, body fades, image masks via clip-path. ScrollTrigger fires once at 78% viewport. Pull-quote has its own word stagger after the body.
- Method title (`From concept to final scene.`) word-staggers on enter.
- Gallery has three movements:
  - **A** full-bleed plate with hairline caption.
  - **B** asymmetric pair — vertical 3:4 + landscape 16:10 with a 8% Y-offset on the wide image to break the baseline.
  - **C** **PINNED horizontal scroll** — 5 panels (one text + four media), `scrub: 0.6` for slight settle (not snap), `invalidateOnRefresh` so resize recalcs the rail width. Rail width is read live from `scrollWidth` and used to compute pin distance.
- Mobile fallback (<900px): pinned section becomes a native horizontal scroller with scroll-snap. Pin doesn't fire — viewport is too cramped to justify the choreography.

**What's faked / placeholder**
- All gallery + method imagery is Unsplash. Final case would be the actual production photography (Bolshoi / VCA archive).
- Block 02 overlay text contrast relies on the placeholder image being dark enough; in production, an `--ink` 30% tinted scrim under the overlay would make this safe across plates.
- The "horizontal reel" panel titles (Curtain · Defile · Ballet · Garden) are real to the project but the panel images are stand-ins.

**What I tried & killed**
- First pass had the method numerals in `--ink` to match the rest of the type. Killed: lost the maker's-mark feel. Oxblood numerals tie back to the accent strategy without bleeding red across body copy.
- Considered making the pinned reel **3 panels, one image each** (cleaner). Killed: the text-anchor panel at the start gives the section a verbal hand-off and matches the editorial register; pure image-only would feel like a lookbook.
- Tried `pin: true, scrub: true` (1:1 binding). Felt sticky on Lenis. `scrub: 0.6` was the right amount of damping — page settles after wheel input ends.

**What I'd push further**
- A subtle reel progress indicator (vertical hairline + roman numeral I/II/III/IV) tracked to the pin's progress — cheap, would orient the viewer.
- Replace block-02 image with a frame from the actual stage transformation to flowers (the spec moment).
- Image-grain pass over the bleed plates (one shared SVG turbulence) to unify them.

### Pass 4 — Credits, related case (Flip), the "D" mark · *next*
TBD.

---

## File map
```
index.html   — shell, font preconnect, GSAP/Lenis CDN, single <main>
style.css    — design tokens (colour, type, motion), reset, type primitives, cursor stub, reduced-motion guard
main.js      — Lenis + ScrollTrigger sync, custom-cursor RAF, gsap.context() shell, resize handler
assets/      — fonts/ img/ video/ (empty in Pass 1)
```

## Performance budget
- 60fps on a 2019-class MBP through every section.
- Total JS < 200KB before GSAP plugins.
- Hero preloaded; everything else lazy.
- No console errors in any pass.
