/* ---------------------------------------------------------------------------
   Dazzz Universe — Case Study (En Coulisses)
   Pass 1: bootstrap only. Section animations land Pass 2+.

   - Single gsap.context() so cleanup is one call on resize / route change.
   - Lenis owns scroll; ScrollTrigger ticks off Lenis so they stay in sync.
   - prefers-reduced-motion short-circuits everything that moves.
   --------------------------------------------------------------------------- */

const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Lucide ArrowRight as inline SVG (24×24, stroke-width 2)
const ARROW_RIGHT_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>';

// ---- GSAP plugin registration -----------------------------------------------
// SplitText is paid; we'll feature-detect when Pass 2 needs it.
if (window.gsap) {
  if (window.ScrollTrigger) gsap.registerPlugin(ScrollTrigger);
  if (window.Flip)          gsap.registerPlugin(Flip);
  gsap.defaults({ ease: 'expo.out', duration: 0.9 });
}

// ---- Lenis smooth scroll ----------------------------------------------------
// Initialised even under reduced-motion (with damping ≈ native) so resize logic
// has one code path. Disable wheel-handling under reduced-motion to be safe.
let lenis = null;
if (window.Lenis && window.gsap) {
  lenis = new Lenis({
    duration: reduced ? 0 : 1.1,
    easing: (t) => 1 - Math.pow(1 - t, 4),
    smoothWheel: !reduced,
    smoothTouch: false,
  });

  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((time) => lenis.raf(time * 1000));
  gsap.ticker.lagSmoothing(0);

  // Block scroll during hero intro; scroll heroIntro away once unlocked
  if (document.getElementById('heroIntro')) {
    lenis.stop();
    document.addEventListener('heroIntroComplete', () => {
      lenis.start();
      const scrollAway = ({ scroll }) => {
        const intro = document.getElementById('heroIntro');
        if (!intro) { lenis.off('scroll', scrollAway); return; }
        gsap.set(intro, { y: -scroll });
        if (scroll >= window.innerHeight) {
          intro.remove();
          lenis.off('scroll', scrollAway);
        }
      };
      lenis.on('scroll', scrollAway);
    }, { once: true });
  }
}

const cursor = null; // cursor removed

// ---- Manual SplitText fallback ---------------------------------------------
// SplitText is paid; this covers what we need (chars + words) with proper
// inline-block wrapping so transforms don't break flow.
function splitText(el, mode) {
  if (!el || el.dataset.splitDone) return [];
  const text = el.innerHTML;
  // Split on a single regex pass so HTML stays intact for words mode.
  if (mode === 'chars') {
    // Char split — strip-and-rebuild from textContent only (drops markup).
    const raw = el.textContent || '';
    el.textContent = '';
    const out = [];
    for (const ch of raw) {
      if (ch === ' ') {
        el.appendChild(document.createTextNode(' '));
        continue;
      }
      const span = document.createElement('span');
      span.className = 'split-char';
      span.textContent = ch;
      el.appendChild(span);
      out.push(span);
    }
    el.dataset.splitDone = '1';
    return out;
  }
  // Words — preserve inline tags (em, sup) by walking nodes.
  const out = [];
  const walk = (node) => {
    const kids = [...node.childNodes];
    for (const child of kids) {
      if (child.nodeType === Node.TEXT_NODE) {
        const parts = child.nodeValue.split(/(\s+)/);
        const frag = document.createDocumentFragment();
        for (const p of parts) {
          if (!p) continue;
          if (/^\s+$/.test(p)) {
            frag.appendChild(document.createTextNode(p));
          } else {
            const span = document.createElement('span');
            span.className = 'split-word';
            span.textContent = p;
            frag.appendChild(span);
            out.push(span);
          }
        }
        node.replaceChild(frag, child);
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        walk(child);
      }
    }
  };
  walk(el);
  el.dataset.splitDone = '1';
  return out;
}

// ---- Stat counter -----------------------------------------------------------
function tweenStat(el) {
  const target = parseFloat(el.dataset.count || '0');
  const suffix = el.dataset.suffix || '';
  const obj = { v: 0 };
  gsap.to(obj, {
    v: target,
    duration: 1.6,
    ease: 'power3.out',
    onUpdate: () => {
      const n = Math.round(obj.v);
      el.textContent = n.toLocaleString('en-US') + suffix;
    },
  });
}

// ---- Callout number tween ---------------------------------------------------
// Reads the text content, extracts the numeric part, animates 0 → target,
// then restores the original string exactly (handles units, commas, floats,
// and the "X + Y" two-number pattern).
function tweenCalloutNum(el, delay) {
  if (!el || !window.gsap) return;
  const raw = el.textContent.trim();

  // Pattern: "30 + 8" — two separate integers
  const plusMatch = raw.match(/^([\d,]+)\s*\+\s*(\d+)(.*)$/);
  if (plusMatch) {
    const a      = parseInt(plusMatch[1].replace(/,/g, ''), 10);
    const b      = parseInt(plusMatch[2], 10);
    const suffix = plusMatch[3] || '';
    const obj    = { a: 0, b: 0 };
    gsap.to(obj, {
      a, b, duration: 1.8, ease: 'power3.out', delay: delay || 0,
      onUpdate()   { el.textContent = Math.round(obj.a) + ' + ' + Math.round(obj.b) + suffix; },
      onComplete() { el.textContent = raw; },
    });
    return;
  }

  // General: leading number (int or float, optional comma thousands) + suffix
  const m = raw.match(/^([\d,]+\.?\d*)(.*)/);
  if (!m) return;

  const target   = parseFloat(m[1].replace(/,/g, ''));
  const suffix   = m[2] || '';
  const isFloat  = m[1].includes('.');
  const useComma = m[1].includes(',');
  const obj      = { v: 0 };

  gsap.to(obj, {
    v: target, duration: 1.8, ease: 'power3.out', delay: delay || 0,
    onUpdate() {
      const n = isFloat
        ? obj.v.toFixed(1)
        : useComma
          ? Math.round(obj.v).toLocaleString('en-US')
          : String(Math.round(obj.v));
      el.textContent = n + suffix;
    },
    onComplete() { el.textContent = raw; },
  });
}

// ---- lineGroups -------------------------------------------------------------
// Groups .split-word spans into visual lines by comparing getBoundingClientRect
// top values. 12 px tolerance absorbs sup/em vertical offsets on the same line.
// Must be called after layout (reliable rects) — use inside ScrollTrigger onEnter.
function lineGroups(words, tolerance = 12) {
  if (!words.length) return [];
  const buckets = []; // [{ y, words[] }]
  words.forEach(w => {
    const y = w.getBoundingClientRect().top;
    const hit = buckets.find(b => Math.abs(b.y - y) <= tolerance);
    if (hit) hit.words.push(w);
    else     buckets.push({ y, words: [w] });
  });
  buckets.sort((a, b) => a.y - b.y);
  return buckets.map(b => b.words);
}

// ---- gsap.context() — section animations -----------------------------------
const page = document.getElementById('page');
const ctx  = (window.gsap && page) ? gsap.context(() => {

  // HERO --------------------------------------------------------------------
  const heroImg = document.querySelector('.hero__media img, .hero__media video');

  // Image mask reveal (clip-path inset 100% → 0%) + scale settle.
  if (heroImg) {
    gsap.set(heroImg.parentElement, { clipPath: 'inset(100% 0 0 0)' });
    gsap.set(heroImg, { scale: 1.06 });
  }

  const heroTl = gsap.timeline({ defaults: { ease: 'expo.out' } });
  heroTl
    .to(heroImg ? heroImg.parentElement : {}, {
      clipPath: 'inset(0% 0 0 0)',
      duration: 1.1,
    }, 0)
    .to(heroImg || {}, { scale: 1, duration: 1.6, ease: 'power3.out' }, 0);

  // Hero parallax — image gently drifts on scroll.
  if (window.ScrollTrigger && !reduced) {
    gsap.to('.hero__media img, .hero__media video', {
      yPercent: 12,
      scale: 1.08,
      ease: 'none',
      scrollTrigger: {
        trigger: '.hero',
        start: 'top top',
        end: 'bottom top',
        scrub: true,
      },
    });
  }

  // INTRO ------------------------------------------------------------------
  if (window.ScrollTrigger && !reduced) {
    // Title: each .mega-h1 is one visual line — animate as units with stagger.
    const titleEls = document.querySelectorAll('.intro .mega-h1');
    if (titleEls.length) {
      gsap.from(titleEls, {
        y: 36,
        opacity: 0,
        duration: 1.0,
        ease: 'expo.out',
        stagger: 0.1,
        scrollTrigger: { trigger: '.intro', start: 'top 82%', once: true },
      });
    }

    // Body: each <p class="text"> is a paragraph / natural line unit.
    const bodyParas = document.querySelectorAll('.intro__body .text');
    if (bodyParas.length) {
      gsap.from(bodyParas, {
        y: 22,
        opacity: 0,
        duration: 0.75,
        ease: 'expo.out',
        stagger: 0.13,
        scrollTrigger: { trigger: '.intro__body', start: 'top 82%', once: true },
      });
    }
  }

  // SYNOPSIS ---------------------------------------------------------------
  const synLead = document.querySelector('.synopsis .lead');
  const synRows = document.querySelectorAll('.synopsis__row');

  if (synLead && window.ScrollTrigger && !reduced) {
    // Pre-split into words so spans exist before the trigger fires.
    const synWords = splitText(synLead, 'words');
    ScrollTrigger.create({
      trigger: synLead,
      start: 'top 80%',
      once: true,
      onEnter() {
        // lineGroups is called here — rects are reliable once element is in view.
        const lines = lineGroups(synWords);
        lines.forEach((lineWords, i) => {
          gsap.from(lineWords, {
            y: 24,
            opacity: 0,
            duration: 0.78,
            ease: 'expo.out',
            stagger: 0.012,
            delay: i * 0.09,
          });
        });
      },
    });
  }

  if (synRows.length && window.ScrollTrigger) {
    gsap.from(synRows, {
      y: 12,
      opacity: 0,
      duration: 0.6,
      ease: 'expo.out',
      stagger: 0.07,
      scrollTrigger: { trigger: '.synopsis__table', start: 'top 85%', once: true },
    });
  }

  // METHOD -----------------------------------------------------------------
  // Each block: heading rises, body fades, paired media masks in.
  // Headings on .method__heading get word split (small enough to be cheap).
  document.querySelectorAll('.method__block').forEach((block) => {
    const heading = block.querySelector('.method__heading');
    const body    = block.querySelector('.method__body, .method__body--lead');
    const num     = block.querySelector('.method__num');
    const media   = block.querySelector('.method__media');
    const quote   = block.querySelector('.method__quote [data-split="words"]');
    const headingWords = heading ? splitText(heading, 'words') : [];
    const quoteWords   = quote   ? splitText(quote, 'words')   : [];

    // Mask reveal on the figure (overflow:hidden already in CSS).
    if (media) {
      const img = media.querySelector('img, video');
      gsap.set(media, { clipPath: 'inset(100% 0 0 0)' });
      if (img) gsap.set(img, { scale: 1.06 });
    }

    if (!window.ScrollTrigger) return;

    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: block,
        start: 'top 78%',
        once: true,
      },
      defaults: { ease: 'expo.out' },
    });

    if (num)   tl.from(num,   { y: 28, opacity: 0, duration: 0.7 }, 0);
    if (headingWords.length) {
      tl.from(headingWords, { yPercent: 100, opacity: 0, stagger: 0.05, duration: 0.9 }, 0.05);
    }
    if (body)  tl.from(body,  { y: 18, opacity: 0, duration: 0.8 }, 0.2);
    if (quoteWords.length) {
      tl.from(quoteWords, { yPercent: 100, opacity: 0, stagger: 0.04, duration: 0.9 }, 0.35);
    }
    if (media) {
      const img = media.querySelector('img, video');
      tl.to(media, { clipPath: 'inset(0% 0 0 0)', duration: 1.0 }, 0)
        .to(img,   { scale: 1, duration: 1.6, ease: 'power3.out' }, 0);
    }
  });

  // Section opener — method title word stagger
  const methodTitle = document.querySelector('.method__title');
  const methodTitleWords = methodTitle ? splitText(methodTitle, 'words') : [];
  if (methodTitleWords.length && window.ScrollTrigger) {
    gsap.from(methodTitleWords, {
      yPercent: 100,
      opacity: 0,
      duration: 1,
      stagger: 0.06,
      ease: 'expo.out',
      scrollTrigger: { trigger: methodTitle, start: 'top 80%', once: true },
    });
  }

  // GALLERY ----------------------------------------------------------------
  // Pinned horizontal scroll + progressive reveal animations.
  //
  // Desktop (≥900px, no reduced-motion):
  //   • Rail is pinned and tweened horizontally via ScrollTrigger.
  //   • Child reveals use containerAnimation so they fire on horizontal
  //     progress rather than vertical scroll position.
  //
  // Mobile / reduced-motion:
  //   • Pin is skipped; panels stack vertically.
  //   • Reveals fall back to normal vertical ScrollTrigger.

  const pinSection = document.querySelector('[data-pin]');
  const rail       = pinSection ? pinSection.querySelector('.gallery__rail') : null;

  if (pinSection && rail && window.ScrollTrigger) {
    const isWide     = window.matchMedia('(min-width: 900px)').matches;
    const getDistance = () => Math.max(0, rail.scrollWidth - window.innerWidth);

    // ── Pin tween (desktop only) ──────────────────────────────────────────
    let pinTween = null;
    if (isWide && !reduced) {
      pinTween = gsap.to(rail, {
        x: () => -getDistance(),
        ease: 'none',
        scrollTrigger: {
          trigger: pinSection,
          start: 'top top',
          end: () => '+=' + getDistance(),
          pin: true,
          scrub: 0.6,
          invalidateOnRefresh: true,
          anticipatePin: 1,
        },
      });
    }

    // Helper — creates a ScrollTrigger that fires once when an element
    // enters view, respecting the horizontal container when active.
    const onReveal = (el, cb, hStart = 'left 88%', vStart = 'top 82%') => {
      if (pinTween) {
        ScrollTrigger.create({
          trigger: el, containerAnimation: pinTween,
          start: hStart, once: true, onEnter: cb,
        });
      } else {
        ScrollTrigger.create({
          trigger: el, start: vStart, once: true, onEnter: cb,
        });
      }
    };

    // ── Opening text panel ───────────────────────────────────────────────
    const textPanel = rail.querySelector('.gallery__panel--text');
    if (textPanel && !reduced) {
      const eyebrow   = textPanel.querySelector('.caps');
      const heading   = textPanel.querySelector('.mega-h2');
      const lead      = textPanel.querySelector('.lead-sm');
      const headWords = heading ? splitText(heading, 'words') : [];
      // Pre-split lead into words so spans exist; lines computed lazily in onEnter.
      const leadWords = lead    ? splitText(lead, 'words')    : [];

      // Text panel is the first visible panel — trigger from the section
      // entering view, not from the panel itself scrolling in horizontally.
      const triggerEl = pinTween ? pinSection : textPanel;
      ScrollTrigger.create({
        trigger: triggerEl,
        start: 'top 80%',
        once: true,
        onEnter() {
          const tl = gsap.timeline({ defaults: { ease: 'expo.out' } });
          if (eyebrow)            tl.from(eyebrow,   { y: 16, opacity: 0, duration: 0.5 }, 0);
          if (headWords.length)   tl.from(headWords, { yPercent: 100, opacity: 0, stagger: 0.045, duration: 0.85 }, 0.08);
          if (leadWords.length) {
            // Line-by-line: group words by visual row, stagger between lines.
            const lines = lineGroups(leadWords);
            lines.forEach((lw, i) => {
              tl.from(lw, { y: 20, opacity: 0, duration: 0.7, stagger: 0.012 }, 0.38 + i * 0.09);
            });
          }
        },
      });
    }

    // ── Media panels — left-to-right mask reveal + scale settle ──────────
    rail.querySelectorAll('.gallery__panel--media').forEach((fig) => {
      const img     = fig.querySelector('img, video');
      const caption = fig.querySelector('figcaption');

      if (!reduced) {
        gsap.set(fig, { clipPath: 'inset(0 100% 0 0)' }); // clipped from the right, reveals L→R
        if (img) gsap.set(img, { scale: 1.08 });
      }

      onReveal(fig, () => {
        if (reduced) return;
        const tl = gsap.timeline();
        // power2.inOut: symmetric ease feels like a physical curtain pull
        tl.to(fig,       { clipPath: 'inset(0 0% 0 0)', duration: 0.85, ease: 'power2.inOut' }, 0)
          .to(img || {}, { scale: 1, duration: 1.4, ease: 'power3.out' }, 0);
        if (caption) tl.from(caption, { y: 10, opacity: 0, duration: 0.5, ease: 'expo.out' }, 0.6);
      }, 'left 95%', 'top 85%'); // 95% = fires the instant the left edge enters viewport
    });

    // ── Gallery image background parallax ────────────────────────────────
    // Each image drifts −5% → +5% in Y as its panel travels through the
    // viewport. panel overflow:hidden clips the overhang; inset:-6% 0 on
    // the img gives enough content to fill during the drift.
    if (pinTween) {
      rail.querySelectorAll('.gallery__panel--media').forEach((fig) => {
        const img = fig.querySelector('img, video');
        if (!img) return;
        gsap.fromTo(img,
          { yPercent: -5 },
          {
            yPercent: 5,
            ease: 'none',
            scrollTrigger: {
              trigger: fig,
              containerAnimation: pinTween,
              start: 'left right',  // panel's left edge at viewport right
              end: 'right left',    // panel's right edge at viewport left
              scrub: true,
            },
          }
        );
      });
    }

    // ── Callout panels — item slide-in + number counter ──────────────────
    rail.querySelectorAll('.gallery__panel--callout').forEach((panel) => {
      onReveal(panel, () => {
        panel.querySelectorAll('.callout-item').forEach((item, i) => {
          const numEl   = item.querySelector('.callout-num');
          const quoteEl = item.querySelector('.callout-quote');
          const labelEl = item.querySelector('.callout-label');
          const delay   = i * 0.13;

          if (!reduced) {
            gsap.from(item, { y: 28, opacity: 0, duration: 0.7, ease: 'expo.out', delay });
          }

          // Numbers count up from zero
          if (numEl) tweenCalloutNum(numEl, delay + 0.08);

          // Italic quote (no number) — simple slide up
          if (quoteEl && !reduced) {
            gsap.from(quoteEl, { yPercent: 30, opacity: 0, duration: 0.75, ease: 'expo.out', delay });
          }

          // Label fades in slightly after its number
          if (labelEl && !reduced) {
            gsap.from(labelEl, { y: 8, opacity: 0, duration: 0.55, ease: 'expo.out', delay: delay + 0.22 });
          }
        });
      }, 'left 90%', 'top 85%');
    });
  }

  // PARALLAX — section depth layering --------------------------------------
  // Text foreground: headings drift upward slightly faster than scroll,
  // separating them visually from the page base layer.
  // Images are handled inside the gallery block above (per-panel scrub).
  if (window.ScrollTrigger && !reduced) {
    [
      { sel: '.intro__title-row', trigger: '.intro',    y: -18 },
      { sel: '.synopsis .lead',   trigger: '.synopsis', y: -14 },
    ].forEach(({ sel, trigger, y }) => {
      const el  = document.querySelector(sel);
      const trg = document.querySelector(trigger);
      if (!el || !trg) return;
      gsap.to(el, {
        y, ease: 'none',
        scrollTrigger: { trigger: trg, start: 'top bottom', end: 'bottom top', scrub: true },
      });
    });
  }

  // STATS ------------------------------------------------------------------
  document.querySelectorAll('.stats__item').forEach((item, i) => {
    const num = item.querySelector('.stats__num');
    const label = item.querySelector('.stats__label');
    if (!num) return;

    if (window.ScrollTrigger) {
      ScrollTrigger.create({
        trigger: item,
        start: 'top 85%',
        once: true,
        onEnter: () => {
          gsap.from(item, { y: 24, opacity: 0, duration: 0.7, ease: 'expo.out', delay: i * 0.04 });
          tweenStat(num);
        },
      });
    } else {
      tweenStat(num);
    }
  });

}, page) : null;

// ---- Site nav: word-mask hover + sticky compact-on-scroll -----------------
// Wrap each link's text into per-word mask wrappers (two stacked rows),
// then drive a [data-scrolled] flag on the header from Lenis (or scroll).
(function siteNavBehavior() {
  const nav = document.querySelector('.site-nav');
  if (!nav) return;

  // Wrap link text into mask structure once.
  const links = nav.querySelectorAll('.site-nav__link');
  links.forEach((link) => {
    if (link.dataset.maskDone) return;
    const text = (link.textContent || '').trim().replace(/\s+/g, ' ');
    if (!text) return;
    const words = text.split(' ');
    link.textContent = '';
    words.forEach((word, i) => {
      // Wrap each word in a mask container
      const wrap = document.createElement('span');
      wrap.className = 'nav-word';
      wrap.style.setProperty('--i', String(i));
      const inner = document.createElement('span');
      inner.className = 'nav-word__inner';

      // Resting row: word + space (except last word)
      const a = document.createElement('span');
      a.className = 'nav-word__row';
      a.textContent = word + (i < words.length - 1 ? ' ' : '');

      // Hover row: icon (first word only) + word, no space
      const b = document.createElement('span');
      b.className = 'nav-word__row nav-word__row--alt';
      b.setAttribute('aria-hidden', 'true');
      if (i === 0) {
        const icon = document.createElement('span');
        icon.className = 'nav-word__icon';
        icon.innerHTML = ARROW_RIGHT_SVG;
        b.appendChild(icon);
      }
      const txt = document.createElement('span');
      txt.textContent = word;
      b.appendChild(txt);

      inner.append(a, b);
      wrap.appendChild(inner);
      link.appendChild(wrap);
    });
    link.dataset.maskDone = '1';
  });

  // Compact-on-scroll. Reverts to expanded 1 s after scroll stops.
  const THRESHOLD = 80;
  let isCompact = false;
  const setCompact = (next) => {
    if (next === isCompact) return;
    isCompact = next;
    nav.dataset.scrolled = next ? 'true' : 'false';
  };

  // Initialize nav expanded (not compact)
  setCompact(false);

  let navInactivityTimer;
  const handleScroll = (scroll) => {
    if (document.getElementById('heroIntro')) return; // frozen during intro
    setCompact(scroll > THRESHOLD);
    clearTimeout(navInactivityTimer);
    if (scroll > THRESHOLD) {
      navInactivityTimer = setTimeout(() => setCompact(false), 1000);
    }
  };

  if (lenis) {
    lenis.on('scroll', ({ scroll }) => handleScroll(scroll));
  } else {
    const onScroll = () => handleScroll(window.scrollY);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }
})();

// Mark ready so CSS pre-hide for splits releases.
requestAnimationFrame(() => document.documentElement.setAttribute('data-ready', '1'));


// Re-measure on resize. ScrollTrigger does this natively, but consolidating
// here makes future Lenis-aware logic (anchor offsets, pinned section heights)
// one place to look.
window.addEventListener('resize', () => {
  if (window.ScrollTrigger) ScrollTrigger.refresh();
}, { passive: true });

// Expose handles for the dev console + future passes.
window.__dzzz = { lenis, ctx, reduced };
