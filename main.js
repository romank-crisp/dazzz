/* ============================================================================
   Dazzz Universe — Case Study (En Coulisses)
   Single-file architecture. Deterministic lifecycle.

   Lifecycle:
     1. bootstrap()       Plugins, Lenis, scroll-restore reset.
     2. runNavBehavior()  Word-mask + compact toggle (idle in hero phase).
     3. runHeroIntro()    Card collage → fullscreen expansion → text reveal.
     4. afterHero()       Unlock scroll, mount IntersectionObserver for theme.
     5. runSections()     gsap.context() for synopsis/gallery — runs after hero.

   Why this order:
     - bootstrap stops Lenis BEFORE the user can scroll (history restore).
     - Section animations register AFTER hero so layout is settled and
       ScrollTrigger reads accurate positions.
     - Nav behavior is independent — runs early but listens passively until
       afterHero() flips data-hero-active off.
   ============================================================================ */

(() => {
  'use strict';

  /* ── Capabilities ────────────────────────────────────────────────────── */
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const has = {
    gsap:          !!window.gsap,
    scrollTrigger: !!window.ScrollTrigger,
    flip:          !!window.Flip,
    lenis:         !!window.Lenis,
  };

  // Disable browser scroll restoration — we always start at 0 so the hero
  // intro plays from a clean state.
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  window.scrollTo(0, 0);

  let lenis = null;
  const ARROW_RIGHT_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>';

  /* ── 1. Bootstrap ───────────────────────────────────────────────────── */
  function bootstrap() {
    if (!has.gsap) return;
    if (has.scrollTrigger) gsap.registerPlugin(ScrollTrigger);
    if (has.flip)          gsap.registerPlugin(Flip);
    gsap.defaults({ ease: 'expo.out', duration: 0.9 });

    if (has.lenis) {
      lenis = new Lenis({
        duration: reduced ? 0 : 1.1,
        easing: (t) => 1 - Math.pow(1 - t, 4),
        smoothWheel: !reduced,
        smoothTouch: false,
      });
      lenis.on('scroll', ScrollTrigger.update);
      gsap.ticker.add((time) => lenis.raf(time * 1000));
      gsap.ticker.lagSmoothing(0);

      // If hero intro is on the page, lock scroll until animation completes.
      if (document.getElementById('heroIntro')) lenis.stop();
    }
  }

  /* ── Word splitter (shared helper) ──────────────────────────────────── */
  function splitWords(el) {
    if (!el) return [];
    const out = [];
    const walk = (node) => {
      [...node.childNodes].forEach((child) => {
        if (child.nodeType === Node.TEXT_NODE) {
          const frag = document.createDocumentFragment();
          child.nodeValue.split(/(\s+)/).forEach((p) => {
            if (!p) return;
            if (/^\s+$/.test(p)) {
              frag.appendChild(document.createTextNode(p));
              return;
            }
            const span = document.createElement('span');
            span.className = 'split-word';
            span.textContent = p;
            frag.appendChild(span);
            out.push(span);
          });
          node.replaceChild(frag, child);
        } else if (child.nodeType === Node.ELEMENT_NODE) {
          walk(child);
        }
      });
    };
    walk(el);
    return out;
  }

  /* Group split-word spans into visual lines by Y position. */
  function lineGroups(words, tolerance = 12) {
    if (!words.length) return [];
    const buckets = [];
    words.forEach((w) => {
      const y = w.getBoundingClientRect().top;
      const hit = buckets.find((b) => Math.abs(b.y - y) <= tolerance);
      if (hit) hit.words.push(w);
      else     buckets.push({ y, words: [w] });
    });
    buckets.sort((a, b) => a.y - b.y);
    return buckets.map((b) => b.words);
  }

  /* Counts a number from 0 → target, restoring original suffix. */
  function tweenCalloutNum(el, delay) {
    if (!el || !has.gsap) return;
    const raw = el.textContent.trim();

    const plusMatch = raw.match(/^([\d,]+)\s*\+\s*(\d+)(.*)$/);
    if (plusMatch) {
      const a = parseInt(plusMatch[1].replace(/,/g, ''), 10);
      const b = parseInt(plusMatch[2], 10);
      const suffix = plusMatch[3] || '';
      const obj = { a: 0, b: 0 };
      gsap.to(obj, {
        a, b, duration: 1.8, ease: 'power3.out', delay: delay || 0,
        onUpdate()   { el.textContent = Math.round(obj.a) + ' + ' + Math.round(obj.b) + suffix; },
        onComplete() { el.textContent = raw; },
      });
      return;
    }

    const m = raw.match(/^([\d,]+\.?\d*)(.*)/);
    if (!m) return;
    const target  = parseFloat(m[1].replace(/,/g, ''));
    const suffix  = m[2] || '';
    const isFloat = m[1].includes('.');
    const useComma = m[1].includes(',');
    const obj = { v: 0 };

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

  /* Measure nav height → --nav-h on root.
     Skip while nav is compact: --nav-h should always reflect the expanded
     reference, so heroIntro's negative margin-top stays stable when the
     nav transitions between compact and expanded (no layout jumps). */
  function syncNavHeight(nav) {
    if (nav.dataset.scrolled === 'true') return;
    const h = nav.offsetHeight;
    document.documentElement.style.setProperty('--nav-h', h + 'px');
  }

  /* ── 2. Nav behavior ────────────────────────────────────────────────── */
  function runNavBehavior() {
    const nav = document.querySelector('.site-nav');
    if (!nav) return;

    // ── DEBUG ──────────────────────────────────────────────────────────────
    // Hide the nav while iterating on lower sections. Set true to hide.
    const SKIP_NAV = false;
    if (SKIP_NAV) { nav.style.display = 'none'; return; }
    // ───────────────────────────────────────────────────────────────────────

    // Initial measurement + on every resize. ResizeObserver also catches
    // the height change when the nav transitions between expanded/compact.
    syncNavHeight(nav);
    window.addEventListener('resize', () => syncNavHeight(nav), { passive: true });
    if ('ResizeObserver' in window) {
      new ResizeObserver(() => syncNavHeight(nav)).observe(nav);
    }

    /* Word-mask hover: each link's text is wrapped as a single mask unit so
       multi-word labels ("Awards & Press", "Contact us") slide up as one
       phrase with a single leading arrow — same behaviour as one-word links. */
    nav.querySelectorAll('.site-nav__link').forEach((link) => {
      if (link.dataset.maskDone) return;
      const text = (link.textContent || '').trim().replace(/\s+/g, ' ');
      if (!text) return;
      link.textContent = '';

      const wrap = document.createElement('span');
      wrap.className = 'nav-word';
      wrap.style.setProperty('--i', '0');

      const inner = document.createElement('span');
      inner.className = 'nav-word__inner';

      const a = document.createElement('span');
      a.className = 'nav-word__row';
      a.textContent = text;

      const b = document.createElement('span');
      b.className = 'nav-word__row nav-word__row--alt';
      b.setAttribute('aria-hidden', 'true');
      const icon = document.createElement('span');
      icon.className = 'nav-word__icon';
      icon.innerHTML = ARROW_RIGHT_SVG;
      b.appendChild(icon);
      const txt = document.createElement('span');
      txt.textContent = text;
      b.appendChild(txt);

      inner.append(a, b);
      wrap.appendChild(inner);
      link.appendChild(wrap);
      link.dataset.maskDone = '1';
    });

    /* ── Compact / expanded state machine ────────────────────────────────
       Goal: deterministic, smooth, user-intent-driven. Three layers
       eliminate jitter from Lenis frame-easing:

         · NOISE_PX     sub-pixel dy (bounce / momentum tail) is ignored
         · UP_DELTA     60 px cumulative upward scroll required to expand
         · COOLDOWN_MS  minimum interval between state flips. If a flip
                        is requested during cooldown, the desired state
                        is buffered and applied (or cancelled if intent
                        reverts) when the cooldown ends.

       Triggers:
         expand   when scrollY < THRESHOLD              (at top)
                  when accumulated up-scroll ≥ UP_DELTA  (scroll-up)
         compact  when scrolling DOWN past THRESHOLD

       Hero entrance (data-hero-active="true") locks state to expanded. */
    const THRESHOLD   = 80;
    const UP_DELTA    = 60;
    const NOISE_PX    = 0.5;
    const COOLDOWN_MS = 380;     // ≈ longest CSS nav transition (0.4 s)

    let lastY        = 0;
    let upAccum      = 0;
    let state        = null;     // applied state
    let pendingState = null;     // desired state buffered during cooldown
    let lastChangeAt = -Infinity;
    let pendingTimer = null;

    const applyState = (next) => {
      if (next === state) return;
      state = next;
      lastChangeAt = performance.now();
      nav.dataset.scrolled = (next === 'compact') ? 'true' : 'false';
    };

    const setState = (next) => {
      // Already at desired state → cancel any pending opposite flip.
      if (next === state) {
        if (pendingTimer) { clearTimeout(pendingTimer); pendingTimer = null; }
        pendingState = null;
        return;
      }
      // Outside cooldown → apply immediately.
      const wait = (lastChangeAt + COOLDOWN_MS) - performance.now();
      if (wait <= 0) {
        applyState(next);
        return;
      }
      // Inside cooldown → buffer the latest desired state for later.
      pendingState = next;
      if (pendingTimer) return;
      pendingTimer = setTimeout(() => {
        pendingTimer = null;
        const target = pendingState;
        pendingState = null;
        if (target && target !== state) applyState(target);
      }, wait);
    };

    applyState('expanded');

    /* ── Theme probe ─────────────────────────────────────────────────────
       Sample the element directly under the nav (centre x, navBottom + 1px),
       walk up to the nearest [data-theme]. If "ink" → dark; otherwise light.
       Runs on every scroll/resize and reacts to per-panel theme changes
       inside pinned horizontal scrolls (the gallery's --hl panel).        */
    let lastTheme = null;
    const setTheme = (next) => {
      if (next === lastTheme) return;
      lastTheme = next;
      document.body.dataset.navTheme = next;
    };

    const probeTheme = () => {
      const probeY = nav.getBoundingClientRect().bottom + 1;
      const probeX = window.innerWidth / 2;
      const els = document.elementsFromPoint(probeX, probeY);
      let theme = 'light';
      for (const el of els) {
        const themed = el.closest && el.closest('[data-theme]');
        if (themed) {
          theme = themed.dataset.theme === 'ink' ? 'dark' : 'light';
          break;
        }
      }
      setTheme(theme);
    };

    /* ── Scroll handler ──────────────────────────────────────────────── */
    const onScrollUpdate = (scrollY) => {
      const dy = scrollY - lastY;
      lastY = scrollY;

      // Hero entrance: always expanded, no compact transitions.
      if (document.body.dataset.heroActive === 'true') {
        setState('expanded');
        upAccum = 0;
      } else if (scrollY < THRESHOLD) {
        // At top: forced expanded.
        setState('expanded');
        upAccum = 0;
      } else if (Math.abs(dy) < NOISE_PX) {
        // Sub-pixel bounce / momentum tail — ignore for state, not for theme.
      } else if (dy > 0) {
        // Scrolling DOWN past threshold → compact, reset up-accumulator.
        upAccum = 0;
        setState('compact');
      } else {
        // Scrolling UP → accumulate. Past UP_DELTA, expand.
        upAccum += -dy;
        if (upAccum >= UP_DELTA) setState('expanded');
      }

      probeTheme();
    };

    if (lenis) {
      lenis.on('scroll', ({ scroll }) => onScrollUpdate(scroll));
    } else {
      window.addEventListener('scroll', () => onScrollUpdate(window.scrollY), { passive: true });
    }

    // Re-probe on resize and when hero-active flips (entrance starts/ends).
    window.addEventListener('resize', probeTheme, { passive: true });
    if ('MutationObserver' in window) {
      new MutationObserver(probeTheme).observe(document.body, {
        attributes: true,
        attributeFilter: ['data-hero-active'],
      });
    }

    // Initial probe so first paint matches what's under the nav.
    probeTheme();
  }

  /* ── 3. Hero intro animation ───────────────────────────────────────── */
  function runHeroIntro() {
    const intro = document.getElementById('heroIntro');
    if (!intro || !has.gsap) return Promise.resolve();

    // ── DEBUG SHORT-CIRCUIT ────────────────────────────────────────────
    // Skip the full hero collage/expansion animation so the page is
    // immediately interactive while iterating on later sections. Set
    // SKIP_HERO_INTRO = false to restore the production intro.
    const SKIP_HERO_INTRO = false;
    if (SKIP_HERO_INTRO) {
      intro.style.display = 'none';
      document.body.dataset.heroActive = 'false';
      return Promise.resolve();
    }

    // Mark page in "hero" theme — flips nav to dark/transparent variant.
    document.body.dataset.heroActive = 'true';

    const stackEl = document.getElementById('hiStack');
    if (!stackEl) return Promise.resolve();

    // Reduced motion: skip animation, jump to end state.
    if (reduced) {
      // Build only the video card at fullscreen and show title.
      const videoCard = document.createElement('div');
      videoCard.className = 'hi-card';
      Object.assign(videoCard.style, {
        position: 'absolute', inset: '0', width: '100%',
        borderRadius: '0', transform: 'none',
      });
      const vid = document.createElement('video');
      Object.assign(vid, { src: 'assets/video/vca-bolshoi-hero.mp4', autoplay: true, muted: true, loop: true, playsInline: true });
      vid.setAttribute('playsinline', '');
      Object.assign(vid.style, { width: '100%', height: '100%', objectFit: 'cover' });
      videoCard.appendChild(vid);
      stackEl.appendChild(videoCard);
      const overlay = document.getElementById('hiOverlay');
      const text = document.getElementById('hiText');
      if (overlay) overlay.style.opacity = '1';
      if (text) text.style.opacity = '1';
      return Promise.resolve();
    }

    const IMGS = [
      'assets/img/cases/vca-bolshoi/thumb/vca-1.png',
      'assets/img/cases/vca-bolshoi/thumb/vca-2.png',
      'assets/img/cases/vca-bolshoi/thumb/vca-3.png',
      'assets/img/cases/vca-bolshoi/thumb/vca-4.png',
      'assets/img/cases/vca-bolshoi/thumb/vca-5.png',
      'assets/img/cases/vca-bolshoi/thumb/vca-6.png',
      'assets/img/cases/vca-bolshoi/thumb/vca-7.png',
      'assets/img/cases/vca-bolshoi/thumb/vca-8.png',
      'assets/img/cases/vca-bolshoi/thumb/vca-9.png',
      'assets/img/cases/vca-bolshoi/thumb/vca-10.png',
      'assets/img/cases/vca-bolshoi/thumb/vca-11.png',
      'assets/img/cases/vca-bolshoi/thumb/vca-12.png',
    ];
    const VIDEO_SRC = 'assets/video/vca-bolshoi-hero.mp4';

    // Build image cards
    IMGS.forEach((src, i) => {
      const card = document.createElement('div');
      card.className = 'hi-card';
      card.style.zIndex = i + 1;
      const img = Object.assign(document.createElement('img'), { src, alt: '', draggable: false });
      card.appendChild(img);
      stackEl.appendChild(card);
    });

    // Build video card (last, highest z-index, expands to fill)
    const videoCard = document.createElement('div');
    videoCard.className = 'hi-card';
    videoCard.style.zIndex = IMGS.length + 1;
    const vid = document.createElement('video');
    Object.assign(vid, { src: VIDEO_SRC, autoplay: true, muted: true, loop: true, playsInline: true });
    vid.setAttribute('playsinline', '');
    videoCard.appendChild(vid);
    stackEl.appendChild(videoCard);

    const cards    = gsap.utils.toArray('.hi-card');
    const lastCard = cards[cards.length - 1];

    // Seed all cards: tiny, invisible, scattered.
    gsap.set(cards, {
      scale:    0.04,
      opacity:  0,
      rotation: () => gsap.utils.random(-15, 15),
      x:        () => gsap.utils.random(-40, 40),
      y:        () => gsap.utils.random(-30, 30),
      transformOrigin: 'center center',
      force3D:  true,
    });

    // Title words — split + hide.
    const words = ['hiT1', 'hiT2', 'hiT3'].flatMap((id) => {
      const el = document.getElementById(id);
      if (!el) return [];
      // Mark them as hi-sw for the existing CSS hook.
      const ws = splitWords(el);
      ws.forEach((w) => w.classList.add('hi-sw'));
      return ws;
    });
    gsap.set(words, { y: 44, opacity: 0, rotation: 3, force3D: true });

    // fillScale is evaluated at tween-start time so the video card has
    // its natural rendered dimensions. Final size = cover-fit × 1.95
    // (1.5 × 1.3 — scaled up 30% from the prior 1.5 ceiling).
    const fillScale = () => {
      const r = lastCard.getBoundingClientRect();
      const w = r.width  || 320;
      const h = r.height || 440;
      return Math.max(window.innerWidth / w, window.innerHeight / h) * 1.02 * 1.95;
    };

    return new Promise((resolve) => {
      const tl = gsap.timeline({
        delay: 0.35,
        defaults: { ease: 'power4.out', force3D: true },
        onComplete: resolve,
      });

      // 1 — Cards appear stacked at center (x: 0). All deterministic, no
      //     randomness — every card lands at viewport center; the video
      //     card is the final layer that expands.
      cards.forEach((card, i) => {
        tl.to(card, {
          scale:    1,
          opacity:  1,
          rotation: 0,
          x:        0,
          y:        0,
          duration: 1.1,
        }, i * 0.13);
      });

      // 2 — Video card expands fullscreen
      tl.to(lastCard, {
        scale:        fillScale,
        x:            0,
        y:            0,
        rotation:     0,
        borderRadius: 0,
        duration:     1.8,
        ease:         'expo.inOut',
      }, '>-0.1');

      // 3 — Atmospheric overlay fades in mid-expansion
      tl.to('#hiOverlay', { opacity: 1, duration: 1.2 }, '-=1.2');

      // 4 — Title fades + word-stagger
      tl.set('#hiText', { opacity: 1 }, '-=1.0');
      tl.to(words, {
        y: 0, opacity: 1, rotation: 0,
        duration: 1.0, ease: 'power3.out',
        stagger: { each: 0.05, from: 'start' },
      }, '<');

      // 5 — Hold so user perceives the final composition
      tl.to({}, { duration: 0.8 });
    });
  }

  /* ── 4. After hero — unlock scroll, drop the entrance lock ──────────────
     Theme detection is owned by the probe in runNavBehavior(); this only
     needs to release the entrance-state lock so compact-on-scroll resumes.
     The MutationObserver in runNavBehavior re-probes on this attribute flip. */
  function afterHero() {
    if (lenis) lenis.start();
    document.body.dataset.heroActive = 'false';
  }

  /* ── 5. Section animations (synopsis, gallery, etc.) ────────────────── */
  function runSections() {
    if (!has.gsap || reduced) return;

    const page = document.getElementById('page');
    if (!page) return;

    return gsap.context(() => {
      /* VIDEO BLEED — cinematic shutter reveal + slow settle ───────── */
      document.querySelectorAll('[data-video-bleed]').forEach((section) => {
        const media = section.querySelector('.video-bleed__media');
        if (!media || !has.scrollTrigger) return;

        // Closed letterbox + slight scale-up at rest.
        gsap.set(media, { clipPath: 'inset(50% 0 50% 0)', scale: 1.06 });

        ScrollTrigger.create({
          trigger: section,
          start: 'top 75%',
          once: true,
          onEnter() {
            const tl = gsap.timeline({ defaults: { ease: 'expo.out' } });
            tl.to(media, { clipPath: 'inset(0% 0 0% 0)', duration: 1.4 }, 0)
              .to(media, { scale: 1, duration: 2.0, ease: 'power3.out' }, 0);

            // Best-effort play in case autoplay was blocked until user interaction.
            const v = media;
            if (v.paused && v.tagName === 'VIDEO') v.play().catch(() => {});
          },
        });
      });

      /* SYNOPSIS — lead by lines + table rows ──────────────────────── */
      const synLead = document.querySelector('.synopsis .lead');
      const synRows = document.querySelectorAll('.synopsis__row');

      if (synLead && has.scrollTrigger) {
        const synWords = splitWords(synLead);
        ScrollTrigger.create({
          trigger: synLead,
          start: 'top 80%',
          once: true,
          onEnter() {
            const lines = lineGroups(synWords);
            lines.forEach((lineWords, i) => {
              gsap.from(lineWords, {
                y: 24, opacity: 0,
                duration: 0.78, ease: 'expo.out',
                stagger: 0.012,
                delay: i * 0.09,
              });
            });
          },
        });
      }

      if (synRows.length && has.scrollTrigger) {
        gsap.from(synRows, {
          y: 12, opacity: 0,
          duration: 0.6, ease: 'expo.out', stagger: 0.07,
          scrollTrigger: { trigger: '.synopsis__table', start: 'top 85%', once: true },
        });
      }

      /* METHOD — text rows + image reveals ────────────────────────── */
      document.querySelectorAll('[data-method-text]').forEach((row) => {
        const label   = row.querySelector('.method__label');
        const content = row.querySelector('.method__inline');
        if (!label || !content || !has.scrollTrigger) return;

        gsap.set(label,   { opacity: 0 });
        gsap.set(content, { y: 20, opacity: 0 });

        ScrollTrigger.create({
          trigger: row,
          start: 'top 82%',
          once: true,
          onEnter() {
            gsap.to(label,   { opacity: 1, duration: 0.55, ease: 'expo.out' });
            gsap.to(content, { y: 0, opacity: 1, duration: 0.75, ease: 'expo.out', delay: 0.08 });
          },
        });
      });

      document.querySelectorAll('[data-method-images] .method__img').forEach((fig, i) => {
        const img = fig.querySelector('img');
        if (!img || !has.scrollTrigger) return;

        gsap.set(fig, { clipPath: 'inset(0 100% 0 0)' });
        gsap.set(img, { scale: 1.06 });

        ScrollTrigger.create({
          trigger: fig,
          start: 'top 88%',
          once: true,
          onEnter() {
            gsap.to(fig, { clipPath: 'inset(0 0% 0 0)', duration: 0.9, ease: 'power2.inOut', delay: i * 0.08 });
            gsap.to(img, { scale: 1, duration: 1.4, ease: 'power3.out', delay: i * 0.08 });
          },
        });
      });

      /* GALLERY — pinned horizontal scroll + per-panel reveals ──────── */
      const pinSection = document.querySelector('[data-pin]');
      const rail       = pinSection ? pinSection.querySelector('.gallery__rail') : null;

      if (!pinSection || !rail || !has.scrollTrigger) return;

      const isWide      = window.matchMedia('(min-width: 900px)').matches;
      const getDistance = () => Math.max(0, rail.scrollWidth - window.innerWidth);

      let pinTween = null;
      if (isWide) {
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

      /* Opening text panel — HIGHLIGHTS title reveal */
      const textPanel = rail.querySelector('.gallery__panel--hl');
      if (textPanel) {
        const mark      = textPanel.querySelector('.hl-mark');
        const titleEl   = textPanel.querySelector('.hl-title');
        const rule      = textPanel.querySelector('.hl-rule');
        const caption   = textPanel.querySelector('.hl-caption');
        const titleWords = titleEl ? splitWords(titleEl) : [];

        // Initial state set immediately so there's no flash before reveal.
        if (mark)             gsap.set(mark,        { scaleX: 0, transformOrigin: 'left center' });
        if (titleWords.length) gsap.set(titleWords, { yPercent: 100, opacity: 0 });
        if (rule)             gsap.set(rule,        { scaleX: 0, transformOrigin: 'left center' });
        if (caption)          gsap.set(caption,     { y: 16, opacity: 0 });

        const triggerEl = pinTween ? pinSection : textPanel;
        ScrollTrigger.create({
          trigger: triggerEl,
          start: 'top top',
          once: true,
          onEnter() {
            const tl = gsap.timeline({ defaults: { ease: 'expo.out' } });
            if (mark)              tl.to(mark,        { scaleX: 1, duration: 0.7 }, 0);
            if (titleWords.length) tl.to(titleWords,  { yPercent: 0, opacity: 1, stagger: 0.06, duration: 1.0 }, 0.15);
            if (rule)              tl.to(rule,        { scaleX: 1, duration: 1.1, ease: 'power3.out' }, 0.35);
            if (caption)           tl.to(caption,     { y: 0, opacity: 1, duration: 0.6 }, 0.6);
          },
        });
      }

      /* Media panels — left-to-right curtain reveal */
      rail.querySelectorAll('.gallery__panel--media').forEach((fig) => {
        const img     = fig.querySelector('img, video');
        const caption = fig.querySelector('figcaption');

        gsap.set(fig, { clipPath: 'inset(0 100% 0 0)' });
        if (img) gsap.set(img, { scale: 1.08 });

        onReveal(fig, () => {
          const tl = gsap.timeline();
          tl.to(fig,       { clipPath: 'inset(0 0% 0 0)', duration: 0.85, ease: 'power2.inOut' }, 0)
            .to(img || {}, { scale: 1, duration: 1.4, ease: 'power3.out' }, 0);
          if (caption) tl.from(caption, { y: 10, opacity: 0, duration: 0.5, ease: 'expo.out' }, 0.6);
        }, 'left 95%', 'top 85%');
      });

      /* Per-panel parallax */
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
                start: 'left right',
                end: 'right left',
                scrub: true,
              },
            }
          );
        });
      }

      /* Callout panels — items + counters */
      rail.querySelectorAll('.gallery__panel--callout').forEach((panel) => {
        onReveal(panel, () => {
          panel.querySelectorAll('.callout-item').forEach((item, i) => {
            const numEl   = item.querySelector('.callout-num');
            const quoteEl = item.querySelector('.callout-quote');
            const labelEl = item.querySelector('.callout-label');
            const delay   = i * 0.13;

            gsap.from(item, { y: 28, opacity: 0, duration: 0.7, ease: 'expo.out', delay });
            if (numEl)   tweenCalloutNum(numEl, delay + 0.08);
            if (quoteEl) gsap.from(quoteEl, { yPercent: 30, opacity: 0, duration: 0.75, ease: 'expo.out', delay });
            if (labelEl) gsap.from(labelEl, { y: 8, opacity: 0, duration: 0.55, ease: 'expo.out', delay: delay + 0.22 });
          });
        }, 'left 90%', 'top 85%');
      });
    }, page);
  }

  /* ── Custom cursor — violet dot with lerp physics ───────────────────────
     Skipped on touch / coarse pointer devices (CSS handles default-cursor
     restore + display:none). On precise pointers, OS cursor is hidden via
     CSS and this dot follows with a soft lerp so it lags slightly behind
     the actual mouse position — gives the "physics" feel.
     Hover-targets (a, button, .tag, .site-nav__link) swap the dot to a
     larger ring via [data-hover="true"]. */
  function runCursor() {
    if (reduced) return;
    if (window.matchMedia('(hover: none), (pointer: coarse)').matches) return;

    const cursor = document.createElement('div');
    cursor.className = 'cursor';
    cursor.setAttribute('aria-hidden', 'true');
    cursor.dataset.hidden = 'true';
    document.body.appendChild(cursor);

    let mx = window.innerWidth / 2, my = window.innerHeight / 2;
    let cx = mx, cy = my;
    const LERP = 0.18;     // higher = snappier, lower = laggier
    let firstMove = true;

    window.addEventListener('mousemove', (e) => {
      mx = e.clientX; my = e.clientY;
      if (firstMove) {
        cx = mx; cy = my; firstMove = false;
        cursor.dataset.hidden = 'false';
      }
    }, { passive: true });

    document.addEventListener('mouseleave', () => { cursor.dataset.hidden = 'true'; });
    document.addEventListener('mouseenter', () => { cursor.dataset.hidden = 'false'; });

    // Hover affordance — delegated to keep listeners cheap.
    const hoverSelector = 'a, button, .tag, [role="button"], input, textarea, select';
    document.addEventListener('mouseover', (e) => {
      if (e.target.closest?.(hoverSelector)) cursor.dataset.hover = 'true';
    });
    document.addEventListener('mouseout', (e) => {
      if (e.target.closest?.(hoverSelector)) cursor.dataset.hover = 'false';
    });

    // Cursor mode swap — over the full-bleed video the dot becomes a
    // play-button affordance (accent-filled disc + cream play triangle).
    // Direct enter/leave on the element avoids flickers from descendant
    // mouseover/mouseout bubbling.
    document.querySelectorAll('[data-video-bleed]').forEach((zone) => {
      zone.addEventListener('mouseenter', () => { cursor.dataset.mode = 'play'; });
      zone.addEventListener('mouseleave', () => { cursor.dataset.mode = ''; });
    });

    function tick() {
      cx += (mx - cx) * LERP;
      cy += (my - cy) * LERP;
      cursor.style.transform = `translate3d(${cx}px, ${cy}px, 0)`;
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  /* ── Footer mark — per-letter slide-in on hover ─────────────────────────
     Inline-fetch the horizontal wordmark SVG so each <path> (one per letter)
     becomes individually targetable. Letters are pushed outward from the
     wordmark's center at rest (so the mark visibly bleeds off-canvas) and
     gsap-staggered back to translateX:0 on hover.
     Bails silently if GSAP missing or fetch fails — the static <img>
     fallback continues to display the wordmark. */
  async function runFooterMark() {
    const wrap = document.querySelector('[data-footer-mark]');
    if (!wrap || !has.gsap) return;
    const img = wrap.querySelector('img');
    if (!img) return;

    let svg;
    try {
      const res = await fetch(img.getAttribute('src'));
      if (!res.ok) return;
      const text = await res.text();
      const parsed = new DOMParser().parseFromString(text, 'image/svg+xml');
      svg = parsed.querySelector('svg');
      if (!svg) return;
    } catch {
      return;
    }

    svg.setAttribute('aria-hidden', 'true');
    wrap.replaceChild(svg, img);
    // Hover animation removed — wordmark stays at its 150vw default size.
  }

  /* ── Related projects — pinned horizontal scroll + pointer parallax ─────
     Mirrors the gallery pin pattern: ScrollTrigger pins the section and
     tweens the rail's translateX from 0 → -(rail width − viewport).
     Each card additionally listens for pointer movement and shifts its
     bg image opposite to the cursor — a small parallax depth effect.
     The accent overlay tint is pure CSS (mix-blend-mode: multiply). */
  function runRelated() {
    const section = document.querySelector('[data-pin-related]');
    const rail = section?.querySelector('.related__rail');
    if (!section || !rail || !has.scrollTrigger) return;

    const isWide = window.matchMedia('(min-width: 900px)').matches;
    if (isWide) {
      const distance = () => Math.max(0, rail.scrollWidth - window.innerWidth);
      gsap.to(rail, {
        x: () => -distance(),
        ease: 'none',
        scrollTrigger: {
          trigger: section,
          start: 'top top',
          end: () => '+=' + distance(),
          pin: true,
          scrub: 0.6,
          invalidateOnRefresh: true,
          anticipatePin: 1,
        },
      });
    }

    // Pointer parallax — each card shifts its image opposite to the
    // pointer's position inside the card. Subtle (max ±14px) so it's
    // felt rather than seen. Skipped under reduced-motion.
    if (reduced) return;
    section.querySelectorAll('[data-related-card]').forEach((card) => {
      const img = card.querySelector('.related__card-img');
      if (!img) return;
      const MAX = 14;
      let raf = 0;
      let tx = 0, ty = 0, cx = 0, cy = 0;
      const tick = () => {
        cx += (tx - cx) * 0.12;
        cy += (ty - cy) * 0.12;
        img.style.transform = `translate3d(${cx}px, ${cy}px, 0) scale(${card.matches(':hover') ? 1.08 : 1})`;
        if (Math.abs(tx - cx) > 0.05 || Math.abs(ty - cy) > 0.05) {
          raf = requestAnimationFrame(tick);
        } else {
          raf = 0;
        }
      };
      const onMove = (e) => {
        const r = card.getBoundingClientRect();
        const nx = ((e.clientX - r.left) / r.width  - 0.5) * -2; // -1..1, inverted
        const ny = ((e.clientY - r.top)  / r.height - 0.5) * -2;
        tx = nx * MAX;
        ty = ny * MAX;
        if (!raf) raf = requestAnimationFrame(tick);
      };
      const onLeave = () => {
        tx = 0; ty = 0;
        if (!raf) raf = requestAnimationFrame(tick);
      };
      card.addEventListener('mousemove', onMove);
      card.addEventListener('mouseleave', onLeave);
    });

    // WebGL hover crossfade for cards that declare a hover image.
    section.querySelectorAll('[data-hover-img]').forEach(initWebGLHover);
  }

  /* ── WebGL hover crossfade ─────────────────────────────────────────────
     For a card with [data-default-img] + [data-hover-img], overlay a canvas
     that renders both textures via a fragment shader. On hover, animate a
     `progress` uniform 0→1 with GSAP — the shader warps and crossfades the
     two images for a "liquid" reveal. Falls back to the CSS bg image if
     WebGL is unavailable or images fail to load. */
  function initWebGLHover(card) {
    const defaultUrl = card.dataset.defaultImg;
    const hoverUrl   = card.dataset.hoverImg;
    if (!defaultUrl || !hoverUrl || !window.gsap) return;

    const canvas = document.createElement('canvas');
    canvas.className = 'related__card-canvas';
    const cssImg = card.querySelector('.related__card-img');
    card.insertBefore(canvas, cssImg ? cssImg.nextSibling : card.firstChild);

    const gl = canvas.getContext('webgl', { premultipliedAlpha: false, antialias: true });
    if (!gl) return;                       // graceful fallback: CSS bg shows through

    const VERT = `
      attribute vec2 a_pos;
      varying vec2 v_uv;
      void main() {
        v_uv = a_pos * 0.5 + 0.5;
        v_uv.y = 1.0 - v_uv.y;
        gl_Position = vec4(a_pos, 0.0, 1.0);
      }`;
    const FRAG = `
      precision mediump float;
      uniform sampler2D u_tex0;
      uniform sampler2D u_tex1;
      uniform float u_progress;
      uniform vec2 u_res0;
      uniform vec2 u_res1;
      uniform vec2 u_size;
      varying vec2 v_uv;

      // cover-fit a texture into the quad
      vec2 coverUV(vec2 uv, vec2 texRes, vec2 boxRes) {
        float texAR = texRes.x / texRes.y;
        float boxAR = boxRes.x / boxRes.y;
        vec2 scale = (texAR > boxAR)
          ? vec2(boxAR / texAR, 1.0)
          : vec2(1.0, texAR / boxAR);
        return (uv - 0.5) * scale + 0.5;
      }

      void main() {
        // Smooth bell-curve displacement amplitude — peaks mid-transition.
        float amp = sin(u_progress * 3.14159) * 0.06;
        vec2 dir = vec2(0.0, 1.0);
        vec2 d0 =  dir * amp * (1.0 - u_progress);
        vec2 d1 = -dir * amp * u_progress;

        vec2 uv0 = coverUV(v_uv + d0, u_res0, u_size);
        vec2 uv1 = coverUV(v_uv + d1, u_res1, u_size);

        vec4 c0 = texture2D(u_tex0, uv0);
        vec4 c1 = texture2D(u_tex1, uv1);
        // Slightly eased blend
        float t = smoothstep(0.0, 1.0, u_progress);
        gl_FragColor = mix(c0, c1, t);
      }`;

    const compile = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        console.warn('shader fail:', gl.getShaderInfoLog(s));
        return null;
      }
      return s;
    };
    const vs = compile(gl.VERTEX_SHADER, VERT);
    const fs = compile(gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return;
    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
    const posLoc = gl.getAttribLocation(prog, 'a_pos');
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    const uTex0 = gl.getUniformLocation(prog, 'u_tex0');
    const uTex1 = gl.getUniformLocation(prog, 'u_tex1');
    const uProg = gl.getUniformLocation(prog, 'u_progress');
    const uRes0 = gl.getUniformLocation(prog, 'u_res0');
    const uRes1 = gl.getUniformLocation(prog, 'u_res1');
    const uSize = gl.getUniformLocation(prog, 'u_size');

    const makeTex = (img, unit) => {
      gl.activeTexture(gl.TEXTURE0 + unit);
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
      return tex;
    };

    let tex0Res = [1, 1], tex1Res = [1, 1];
    let ready = 0;
    const state = { progress: 0 };

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = card.clientWidth, h = card.clientHeight;
      canvas.width  = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      gl.viewport(0, 0, canvas.width, canvas.height);
    };
    const render = () => {
      if (ready < 2) return;
      gl.uniform1i(uTex0, 0);
      gl.uniform1i(uTex1, 1);
      gl.uniform1f(uProg, state.progress);
      gl.uniform2f(uRes0, tex0Res[0], tex0Res[1]);
      gl.uniform2f(uRes1, tex1Res[0], tex1Res[1]);
      gl.uniform2f(uSize, canvas.width, canvas.height);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    };

    const loadImg = (url, unit) => new Promise((res, rej) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        makeTex(img, unit);
        if (unit === 0) tex0Res = [img.naturalWidth, img.naturalHeight];
        else            tex1Res = [img.naturalWidth, img.naturalHeight];
        ready++;
        res();
      };
      img.onerror = rej;
      img.src = url;
    });

    Promise.all([loadImg(defaultUrl, 0), loadImg(hoverUrl, 1)])
      .then(() => {
        resize();
        render();
        // Hide the CSS background image now that WebGL has both frames.
        if (cssImg) cssImg.style.opacity = '0';
      })
      .catch(() => { /* fallback: CSS bg image stays visible */ });

    window.addEventListener('resize', () => { resize(); render(); }, { passive: true });

    const tweenTo = (target) => {
      gsap.to(state, {
        progress: target,
        duration: 0.9,
        ease: 'power3.inOut',
        onUpdate: render,
      });
    };
    card.addEventListener('mouseenter', () => tweenTo(1));
    card.addEventListener('mouseleave', () => tweenTo(0));
  }

  /* ── Method reveal — per-card text stagger.
     Each .method-card title is split into words; on scroll-into-view the
     words rise + fade in with a small stagger, body fades after. Images
     get a subtle scale-in. ScrollTrigger uses the card itself as trigger
     so the reveal fires when the card slides in to become visible. */
  // Hand-picked X positions (% of head width) that feel random but stay in-bounds.
  const NUM_X = [8, 55, 36, 62, 14, 44, 22];

  // Wrap a node's text in an inner span so the outer can mask the slide.
  function wrapInner(node, innerClass) {
    const inner = document.createElement('span');
    inner.className = innerClass;
    inner.textContent = node.textContent;
    node.textContent = '';
    node.appendChild(inner);
    return inner;
  }

  function runMethodReveal() {
    const cards = document.querySelectorAll('.method-card');
    if (!cards.length || !has.gsap) return;

    cards.forEach((card, i) => {
      const title = card.querySelector('.method-card__title');
      const body  = card.querySelector('.method-card__body');
      const figs  = card.querySelectorAll('.method-card__img');
      const imgs  = card.querySelectorAll('.method-card__img img');
      const num   = card.querySelector('.method-card__num');

      // Position number at its random X + wrap its digit for masked slide.
      let numInner = null;
      if (num) {
        num.style.left = NUM_X[i % NUM_X.length] + '%';
        numInner = wrapInner(num, 'method-card__num__inner');
      }

      // Title stays visible by default. A subtle fade-up enhances on reveal but
      // never hides the text if the trigger fails — title text is the priority.
      // (Mask reveal is reserved for the number badge and images.)

      // Pre-hide (only the elements that have safe fallback if anim doesn't run)
      if (numInner)         gsap.set(numInner,    { yPercent: 110 });
      if (body)             gsap.set(body,        { y: 20, opacity: 0 });
      if (figs.length)      gsap.set(figs,        { clipPath: 'inset(100% 0% 0% 0%)' });
      if (imgs.length)      gsap.set(imgs,        { scale: 1.12 });

      const play = () => {
        const ease = 'power3.inOut';
        const tl = gsap.timeline({ defaults: { ease } });
        if (numInner) {
          tl.to(numInner, {
            yPercent: 0,
            duration: 1.6,
          }, 0);
        }
        if (title) {
          tl.from(title, {
            y: 30, opacity: 0,
            duration: 1.0,
          }, 0.15);
        }
        if (body) {
          tl.to(body, {
            y: 0, opacity: 1,
            duration: 0.9, ease: 'power2.inOut',
          }, 0.4);
        }
        if (figs.length) {
          tl.to(figs, {
            clipPath: 'inset(0% 0% 0% 0%)',
            duration: 1.3,
            ease: 'expo.inOut',
            stagger: 0.1,
          }, 0.2);
        }
        if (imgs.length) {
          tl.to(imgs, {
            scale: 1,
            duration: 1.6,
            ease: 'expo.inOut',
            stagger: 0.1,
          }, 0.2);
        }
      };

      if (has.scrollTrigger) {
        ScrollTrigger.create({
          trigger: card,
          start: 'top 85%',
          once: true,
          onEnter: play,
        });
      } else {
        play();
      }
    });
  }

  /* ── Init — run phases in order ─────────────────────────────────────── */
  function init() {
    bootstrap();
    runCursor();
    runNavBehavior();
    runSections();
    runMethodReveal();
    runRelated();
    runFooterMark();
    runHeroIntro().then(afterHero);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  /* Resize: ScrollTrigger refresh covers most cases. */
  window.addEventListener('resize', () => {
    if (window.ScrollTrigger) ScrollTrigger.refresh();
  }, { passive: true });

  /* Dev-console handle. */
  Object.defineProperty(window, '__dzzz', {
    value: { get lenis() { return lenis; }, reduced },
    writable: false,
    configurable: false,
  });
})();
