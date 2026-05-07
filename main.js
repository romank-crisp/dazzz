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

  /* Measure nav height → --nav-h on root. heroIntro uses it for height calc. */
  function syncNavHeight(nav) {
    const h = nav.offsetHeight;
    document.documentElement.style.setProperty('--nav-h', h + 'px');
  }

  /* ── 2. Nav behavior ────────────────────────────────────────────────── */
  function runNavBehavior() {
    const nav = document.querySelector('.site-nav');
    if (!nav) return;

    // Initial measurement + on every resize. ResizeObserver also catches
    // the height change when the nav transitions between expanded/compact.
    syncNavHeight(nav);
    window.addEventListener('resize', () => syncNavHeight(nav), { passive: true });
    if ('ResizeObserver' in window) {
      new ResizeObserver(() => syncNavHeight(nav)).observe(nav);
    }

    /* Word-mask hover: split each link's text into per-word mask wrappers. */
    nav.querySelectorAll('.site-nav__link').forEach((link) => {
      if (link.dataset.maskDone) return;
      const text = (link.textContent || '').trim().replace(/\s+/g, ' ');
      if (!text) return;
      const words = text.split(' ');
      link.textContent = '';
      words.forEach((word, i) => {
        const wrap = document.createElement('span');
        wrap.className = 'nav-word';
        wrap.style.setProperty('--i', String(i));

        const inner = document.createElement('span');
        inner.className = 'nav-word__inner';

        const a = document.createElement('span');
        a.className = 'nav-word__row';
        a.textContent = word + (i < words.length - 1 ? ' ' : '');

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

    /* Compact-on-scroll. Reverts to expanded 1 s after scroll inactivity. */
    const THRESHOLD = 80;
    let isCompact = null; // null forces first setCompact() call to write the attr
    let inactivityTimer = null;

    const setCompact = (next) => {
      if (next === isCompact) return;
      isCompact = next;
      nav.dataset.scrolled = next ? 'true' : 'false';
    };

    // Explicit init — nav is always expanded on first paint.
    setCompact(false);

    const onScrollUpdate = (scrollY) => {
      // Frozen during hero intro — body[data-hero-active="true"] keeps
      // the nav in its dark theme; compact state is irrelevant.
      if (document.body.dataset.heroActive === 'true') return;
      setCompact(scrollY > THRESHOLD);

      // Schedule auto-expand 1 s after the last scroll event.
      clearTimeout(inactivityTimer);
      if (scrollY > THRESHOLD) {
        inactivityTimer = setTimeout(() => setCompact(false), 1000);
      }
    };

    if (lenis) {
      lenis.on('scroll', ({ scroll }) => onScrollUpdate(scroll));
    } else {
      window.addEventListener('scroll', () => onScrollUpdate(window.scrollY), { passive: true });
    }
  }

  /* ── 3. Hero intro animation ───────────────────────────────────────── */
  function runHeroIntro() {
    const intro = document.getElementById('heroIntro');
    if (!intro || !has.gsap) return Promise.resolve();

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
      rotation: () => gsap.utils.random(-12, 12),
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
    // its natural rendered dimensions.
    const fillScale = () => {
      const r = lastCard.getBoundingClientRect();
      const w = r.width  || 320;
      const h = r.height || 440;
      return Math.max(window.innerWidth / w, window.innerHeight / h) * 1.02;
    };

    return new Promise((resolve) => {
      const tl = gsap.timeline({
        delay: 0.35,
        defaults: { ease: 'power4.out', force3D: true },
        onComplete: resolve,
      });

      // 1 — Cards appear with organic micro-scatter
      cards.forEach((card, i) => {
        tl.to(card, {
          scale:    1,
          opacity:  1,
          rotation: gsap.utils.random(-5, 5),
          x:        gsap.utils.random(-50, 50),
          y:        gsap.utils.random(-50, 50),
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

  /* ── 4. After hero — unlock scroll, switch theme on intersection ────── */
  function afterHero() {
    if (lenis) lenis.start();

    const intro = document.getElementById('heroIntro');
    if (!intro) {
      document.body.dataset.heroActive = 'false';
      return;
    }

    // Watch how much of heroIntro is in the viewport. While > 50% visible,
    // body[data-hero-active="true"] — nav uses dark theme.
    if ('IntersectionObserver' in window) {
      const obs = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            const active = entry.intersectionRatio > 0.5;
            document.body.dataset.heroActive = active ? 'true' : 'false';
          });
        },
        { threshold: [0, 0.25, 0.5, 0.75, 1] }
      );
      obs.observe(intro);
    } else {
      document.body.dataset.heroActive = 'false';
    }
  }

  /* ── 5. Section animations (synopsis, gallery, etc.) ────────────────── */
  function runSections() {
    if (!has.gsap || reduced) return;

    const page = document.getElementById('page');
    if (!page) return;

    return gsap.context(() => {
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

      /* Opening text panel */
      const textPanel = rail.querySelector('.gallery__panel--text');
      if (textPanel) {
        const eyebrow   = textPanel.querySelector('.caps');
        const heading   = textPanel.querySelector('.mega-h2');
        const lead      = textPanel.querySelector('.lead-sm');
        const headWords = heading ? splitWords(heading) : [];
        const leadWords = lead    ? splitWords(lead)    : [];

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
              const lines = lineGroups(leadWords);
              lines.forEach((lw, i) => {
                tl.from(lw, { y: 20, opacity: 0, duration: 0.7, stagger: 0.012 }, 0.38 + i * 0.09);
              });
            }
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

    function tick() {
      cx += (mx - cx) * LERP;
      cy += (my - cy) * LERP;
      cursor.style.transform = `translate3d(${cx}px, ${cy}px, 0)`;
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  /* ── Init — run phases in order ─────────────────────────────────────── */
  function init() {
    bootstrap();
    runCursor();
    runNavBehavior();
    runSections();
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
