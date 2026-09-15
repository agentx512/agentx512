/* Interactions: preloader, custom cursor, nav, scroll reveals, skill bars, contact copy */
document.addEventListener('DOMContentLoaded', () => {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isTouch = window.matchMedia('(hover: none), (pointer: coarse)').matches;

  /* ---------- Correct #hash landing position once everything has settled ----------
     The browser jumps to a URL's #fragment very early (as soon as the target
     exists), before images/fonts finish loading and before the preloader's own
     layout settles — on a page landed on from another page (e.g. experience.html
     -> index.html#work) that first jump can end up short or long once the page's
     real height is final. scroll-margin-top (see style.css) fixes the "stuck
     under the fixed navbar" part; this re-asserts the final position once the
     page has fully loaded, cross-page hash landings only. */
  if (window.location.hash) {
    window.addEventListener('load', () => {
      const target = document.getElementById(window.location.hash.slice(1));
      if (target) target.scrollIntoView({ behavior: 'auto', block: 'start' });
    });
  }

  /* ---------- Ambient starfield (behind everything, every page) ---------- */
  const starLayer = document.createElement('div');
  starLayer.className = 'stars-bg';
  document.body.prepend(starLayer);
  const starCount = window.innerWidth < 700 ? 70 : 130;
  const starsFrag = document.createDocumentFragment();
  for (let i = 0; i < starCount; i++) {
    const star = document.createElement('span');
    star.className = 'star';
    star.style.left = (Math.random() * 100).toFixed(2) + '%';
    star.style.top = (Math.random() * 100).toFixed(2) + '%';
    const size = (Math.random() * 1.4 + 1.2).toFixed(2) + 'px';
    star.style.width = size;
    star.style.height = size;
    star.style.animationDuration = (2.5 + Math.random() * 3.5).toFixed(2) + 's';
    star.style.animationDelay = (Math.random() * 4).toFixed(2) + 's';
    starsFrag.appendChild(star);
  }
  starLayer.appendChild(starsFrag);

  /* ---------- Theme toggle ---------- */
  const themeToggle = document.getElementById('theme-toggle');
  themeToggle && themeToggle.addEventListener('click', () => {
    const root = document.documentElement;
    const next = root.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
    root.setAttribute('data-theme', next);
    try { localStorage.setItem('theme', next); } catch (e) { /* storage unavailable */ }
    window.dispatchEvent(new CustomEvent('themechange', { detail: { theme: next } }));
  });

  /* ---------- Preloader: terminal boot sequence ---------- */
  const preloader = document.querySelector('.preloader');
  const preloaderBar = document.querySelector('.preloader-bar span');
  const preloaderPercent = document.querySelector('.preloader-percent');

  if (preloader) {
    let rainRAF = null;

    // -- Matrix-style rain, dimmed, behind the terminal window --
    const rainCanvas = preloader.querySelector('.preloader-rain');
    if (rainCanvas && !reducedMotion) {
      const ctx = rainCanvas.getContext('2d');
      const fontSize = 15;
      let columns = 0;
      let drops = [];
      function sizeRain() {
        rainCanvas.width = preloader.clientWidth;
        rainCanvas.height = preloader.clientHeight;
        columns = Math.max(1, Math.floor(rainCanvas.width / fontSize));
        drops = new Array(columns).fill(0).map(() => Math.random() * -40);
      }
      sizeRain();
      window.addEventListener('resize', sizeRain);
      const chars = '01アイウエオカキクケコサシスセソ$#%&';
      // Read the theme-aware preloader tokens once — they don't change mid-boot.
      const rootStyle = getComputedStyle(document.documentElement);
      const bgRgb = (rootStyle.getPropertyValue('--pl-bg-rgb') || '6, 9, 7').trim();
      const accentHex = (rootStyle.getPropertyValue('--pl-accent') || '#39ff88').trim();
      const trailFill = `rgba(${bgRgb}, 0.16)`;
      function drawRain() {
        ctx.fillStyle = trailFill;
        ctx.fillRect(0, 0, rainCanvas.width, rainCanvas.height);
        ctx.fillStyle = accentHex;
        ctx.font = fontSize + 'px "JetBrains Mono", monospace';
        for (let i = 0; i < drops.length; i++) {
          const char = chars[Math.floor(Math.random() * chars.length)];
          ctx.fillText(char, i * fontSize, drops[i] * fontSize);
          if (drops[i] * fontSize > rainCanvas.height && Math.random() > 0.975) drops[i] = 0;
          drops[i]++;
        }
        rainRAF = requestAnimationFrame(drawRain);
      }
      drawRain();
    }

    // -- Typewriter boot log --
    function wait(ms) {
      return new Promise((resolve) => (reducedMotion ? resolve() : setTimeout(resolve, ms)));
    }
    function typeInto(el, text, speed) {
      return new Promise((resolve) => {
        if (reducedMotion) { el.textContent += text; resolve(); return; }
        let i = 0;
        (function tick() {
          if (i < text.length) {
            el.textContent += text[i];
            i++;
            setTimeout(tick, speed + Math.random() * 8);
          } else {
            resolve();
          }
        })();
      });
    }
    // Cipher-decrypt reveal: scrambles through random glyphs before each
    // character locks in, like a terminal decrypting a string.
    function scrambleInto(el, text, frameMs) {
      return new Promise((resolve) => {
        const prefix = el.textContent;
        if (reducedMotion) { el.textContent = prefix + text; resolve(); return; }
        const glyphs = '!<>-_\\/[]{}=+*^#$%01';
        let revealed = 0;
        let frame = 0;
        const iv = setInterval(() => {
          let out = '';
          for (let i = 0; i < text.length; i++) {
            out += text[i] === ' ' || i < revealed ? text[i] : glyphs[Math.floor(Math.random() * glyphs.length)];
          }
          el.textContent = prefix + out;
          frame++;
          if (frame % 2 === 0) revealed++;
          if (revealed > text.length) {
            clearInterval(iv);
            el.textContent = prefix + text;
            resolve();
          }
        }, frameMs);
      });
    }
    async function runBootSequence(logEl) {
      if (!logEl) return;
      const target = preloader.dataset.bootTarget || 'portfolio';
      let lines = [
        { text: 'loading kernel modules', status: 'OK' },
        { text: 'mounting /' + target, status: 'OK' },
        { text: 'establishing secure tunnel', status: 'OK' },
        { text: 'scanning for vulnerabilities', status: '0 found', dim: true },
        { text: 'decrypting profile.dat', status: 'OK' },
      ];
      // Error pages (404/403/500/503) supply their own in-character boot log
      // via a JSON attribute instead of the default "everything's fine" narrative.
      if (preloader.dataset.bootLines) {
        try {
          const custom = JSON.parse(preloader.dataset.bootLines);
          if (Array.isArray(custom) && custom.length) lines = custom;
        } catch (e) { /* malformed — keep default lines */ }
      }
      const finalMsg = preloader.dataset.bootFinal || 'access granted';
      for (const line of lines) {
        const row = document.createElement('div');
        row.className = 'term-line';
        const textEl = document.createElement('span');
        textEl.className = 'term-line-text';
        textEl.textContent = '> ';
        const cursor = document.createElement('span');
        cursor.className = 'term-cursor';
        row.appendChild(textEl);
        row.appendChild(cursor);
        logEl.appendChild(row);

        await typeInto(textEl, line.text, 9);
        cursor.remove();

        const fill = document.createElement('span');
        fill.className = 'term-line-fill';
        const status = document.createElement('span');
        status.className = 'term-line-status' + (line.dim ? ' is-dim' : '');
        status.textContent = line.status;
        row.appendChild(fill);
        row.appendChild(status);
        requestAnimationFrame(() => status.classList.add('is-in'));
        await wait(60);
      }

      const finalRow = document.createElement('div');
      finalRow.className = 'term-line is-final';
      const finalText = document.createElement('span');
      finalText.className = 'term-line-text';
      finalText.textContent = '> ';
      const finalCursor = document.createElement('span');
      finalCursor.className = 'term-cursor';
      finalRow.appendChild(finalText);
      finalRow.appendChild(finalCursor);
      logEl.appendChild(finalRow);
      await scrambleInto(finalText, finalMsg, 26);
    }
    runBootSequence(document.getElementById('term-log'));

    // -- Progress bar (unchanged pacing) + exit --
    let shown = 0;
    let pageLoaded = false;
    let finished = false;
    window.addEventListener('load', () => { pageLoaded = true; });

    function hidePreloader() {
      if (rainRAF) cancelAnimationFrame(rainRAF);
      if (reducedMotion) {
        preloader.classList.add('is-hidden');
      } else {
        preloader.classList.add('is-exiting');
        setTimeout(() => preloader.classList.add('is-hidden'), 560);
      }
    }

    function stepPreloader() {
      if (finished) return;
      const ceiling = pageLoaded ? 100 : 92;
      const speed = pageLoaded ? 0.16 : 0.05;
      shown += (ceiling - shown) * speed + 0.1;
      if (shown >= ceiling) shown = ceiling;
      const rounded = Math.min(100, Math.round(shown));
      if (preloaderBar) preloaderBar.style.width = rounded + '%';
      if (preloaderPercent) preloaderPercent.textContent = rounded + '%';
      if (rounded >= 100) {
        finished = true;
        setTimeout(hidePreloader, 350);
        return;
      }
      requestAnimationFrame(stepPreloader);
    }
    requestAnimationFrame(stepPreloader);

    // Safety net in case something above stalls
    setTimeout(() => {
      if (finished) return;
      finished = true;
      hidePreloader();
    }, 4000);
  }

  /* ---------- Cross-page transition (scan-sweep overlay on internal navigation) ---------- */
  const pageTransition = document.createElement('div');
  pageTransition.className = 'page-transition';
  pageTransition.innerHTML =
    '<span class="page-transition-scan"></span>' +
    '<img src="/assets/favicon.svg" class="page-transition-mark" alt="">';
  document.body.appendChild(pageTransition);

  function resolveInternalNav(a) {
    if (!a) return null;
    if (a.target && a.target !== '_self') return null;
    if (a.hasAttribute('download')) return null;
    const href = a.getAttribute('href');
    if (!href || /^(#|mailto:|tel:|javascript:)/.test(href)) return null;
    let url;
    try { url = new URL(href, window.location.href); } catch (e) { return null; }
    if (url.origin !== window.location.origin) return null;
    if (url.pathname === window.location.pathname) return null; // same-page anchor
    if (/\.[a-z0-9]+$/i.test(url.pathname)) return null; // asset link (pdf, image, etc.), not a page route
    return url;
  }

  document.addEventListener('click', (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const anchor = e.target.closest('a[href]');
    const url = resolveInternalNav(anchor);
    if (!url) return;
    e.preventDefault();
    if (reducedMotion) {
      window.location.href = url.href;
      return;
    }
    pageTransition.classList.add('is-active');
    setTimeout(() => { window.location.href = url.href; }, 380);
  });

  // Back/forward navigation can restore this page from the bfcache exactly as
  // it was when we left — mid-transition, with the overlay still active (no
  // DOMContentLoaded fires on a bfcache restore, so nothing else would clear it).
  window.addEventListener('pageshow', (e) => {
    if (e.persisted) pageTransition.classList.remove('is-active');
  });

  /* ---------- Custom context menu + devtools deterrent ----------
     Note: this only deters casual right-click / shortcut access. It cannot
     stop a determined visitor — browsers always let users view any page's
     HTML/CSS/JS by design (dev tools via the browser's own menu, curl, etc). */
  const ICON_LINK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 12a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1.5 1.5"/><path d="M15 12a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1.5-1.5"/></svg>';
  const ICON_HOME = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5"/></svg>';
  const ICON_DOWNLOAD = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12"/><polyline points="7 10 12 15 17 10"/><path d="M4 19h16"/></svg>';
  const ICON_EXTERNAL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3h7v7"/><path d="M10 14 21 3"/><path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5"/></svg>';
  const ICON_MAIL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>';
  const ICON_LOCK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>';
  const ICON_COPY = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/></svg>';
  const ICON_CUT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/></svg>';
  const ICON_PASTE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/></svg>';
  const ICON_SELECT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3h5"/><path d="M3 3v5"/><path d="M21 3h-5"/><path d="M21 3v5"/><path d="M3 21h5"/><path d="M3 21v-5"/><path d="M21 21h-5"/><path d="M21 21v-5"/></svg>';

  function defaultMenuHTML(selectionText) {
    return (
      '<div class="ctx-menu-head">agentx512@boot:~$</div>' +
      (selectionText
        ? '<button class="ctx-item" data-action="copy-selection" role="menuitem">' + ICON_COPY + '<span>Copy</span></button><div class="ctx-sep"></div>'
        : '') +
      '<button class="ctx-item" data-action="copy-link" role="menuitem">' + ICON_LINK + '<span>Copy Page Link</span></button>' +
      '<button class="ctx-item" data-action="home" role="menuitem">' + ICON_HOME + '<span>Home</span></button>' +
      '<button class="ctx-item" data-action="cv" role="menuitem">' + ICON_DOWNLOAD + '<span>Download CV</span></button>' +
      '<div class="ctx-sep"></div>' +
      '<a class="ctx-item" href="https://github.com/agentx512" target="_blank" rel="noopener" role="menuitem">' + ICON_EXTERNAL + '<span>GitHub</span></a>' +
      '<button class="ctx-item" data-action="contact" role="menuitem">' + ICON_MAIL + '<span>Contact</span></button>' +
      '<div class="ctx-sep"></div>' +
      '<div class="ctx-item is-disabled" aria-disabled="true">' + ICON_LOCK + '<span>Inspect — restricted</span></div>'
    );
  }

  // Editable fields (the contact form) get real Cut/Copy/Paste/Select All instead
  // of the branded menu — a right-click in a text field is a request for text
  // actions, not a link to GitHub.
  function fieldMenuHTML(field) {
    const hasSelection = field.selectionStart !== field.selectionEnd;
    const hasText = field.value.length > 0;
    return (
      '<div class="ctx-menu-head">clipboard</div>' +
      (hasSelection
        ? '<button class="ctx-item" data-action="cut-field" role="menuitem">' + ICON_CUT + '<span>Cut</span></button>' +
          '<button class="ctx-item" data-action="copy-field" role="menuitem">' + ICON_COPY + '<span>Copy</span></button>'
        : '') +
      '<button class="ctx-item" data-action="paste-field" role="menuitem">' + ICON_PASTE + '<span>Paste</span></button>' +
      (hasText
        ? '<div class="ctx-sep"></div><button class="ctx-item" data-action="select-all-field" role="menuitem">' + ICON_SELECT + '<span>Select All</span></button>'
        : '')
    );
  }

  const ctxMenu = document.createElement('div');
  ctxMenu.className = 'ctx-menu';
  ctxMenu.setAttribute('role', 'menu');
  ctxMenu.innerHTML = defaultMenuHTML('');
  document.body.appendChild(ctxMenu);
  let ctxFieldEl = null;
  let ctxFieldRange = null;
  let ctxSelectionText = '';

  function closeCtxMenu() { ctxMenu.classList.remove('is-open'); }
  function openCtxMenuAt(x, y) {
    ctxMenu.classList.add('is-open');
    // offsetWidth/Height reflect layout size, unaffected by the CSS
    // transform still mid-transition — unlike getBoundingClientRect(),
    // which would under-measure at scale(0.95) the instant the class lands.
    const w = ctxMenu.offsetWidth, h = ctxMenu.offsetHeight;
    const vw = window.innerWidth, vh = window.innerHeight;
    const left = Math.min(x, Math.max(8, vw - w - 8));
    const top = Math.min(y, Math.max(8, vh - h - 8));
    ctxMenu.style.left = left + 'px';
    ctxMenu.style.top = top + 'px';
  }

  document.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    const target = e.target;
    const isField = (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) && !target.disabled;
    if (isField) {
      ctxFieldEl = target;
      ctxFieldRange = { start: target.selectionStart || 0, end: target.selectionEnd || 0 };
      ctxMenu.innerHTML = fieldMenuHTML(target);
    } else {
      ctxFieldEl = null;
      ctxFieldRange = null;
      ctxSelectionText = (window.getSelection() ? window.getSelection().toString() : '').trim();
      ctxMenu.innerHTML = defaultMenuHTML(ctxSelectionText);
    }
    openCtxMenuAt(e.clientX, e.clientY);
  });
  document.addEventListener('click', (e) => {
    if (!ctxMenu.contains(e.target)) closeCtxMenu();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeCtxMenu();
    // Deter the most common devtools / view-source shortcuts.
    const k = e.key;
    const blocked =
      k === 'F12' ||
      ((e.ctrlKey || e.metaKey) && e.shiftKey && ['I', 'i', 'J', 'j', 'C', 'c'].includes(k)) ||
      ((e.ctrlKey || e.metaKey) && ['U', 'u'].includes(k));
    if (blocked) e.preventDefault();
  });
  window.addEventListener('scroll', closeCtxMenu, true);
  window.addEventListener('resize', closeCtxMenu);

  // Writes text to the clipboard, Clipboard API first (needs a secure/HTTPS
  // origin), falling back to a hidden-textarea execCommand('copy') — the
  // Clipboard API is unavailable outright on this plain-HTTP .local vhost, so
  // every copy currently rides the fallback until the site moves to HTTPS.
  function copyText(text) {
    const legacyCopy = () => {
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand('copy');
        ta.remove();
        return ok;
      } catch (err) { return false; }
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).then(() => true).catch(() => legacyCopy());
    }
    return Promise.resolve(legacyCopy());
  }

  // execCommand('copy'/'cut') on a focused field's own selection works even
  // without the Clipboard API/HTTPS — it's the older, still-functional path
  // for editable-element selections specifically.
  function fieldCommand(cmd) {
    if (!ctxFieldEl || !ctxFieldRange) return false;
    ctxFieldEl.focus();
    ctxFieldEl.setSelectionRange(ctxFieldRange.start, ctxFieldRange.end);
    try { return document.execCommand(cmd); } catch (err) { return false; }
  }

  function flashItem(item, ok, okLabel, failLabel) {
    const label = item.querySelector('span');
    const original = label.textContent;
    item.classList.add(ok ? 'is-copied' : 'is-disabled');
    label.textContent = ok ? okLabel : failLabel;
    setTimeout(() => {
      item.classList.remove('is-copied', 'is-disabled');
      label.textContent = original;
      closeCtxMenu();
    }, 850);
  }

  ctxMenu.addEventListener('click', (e) => {
    const item = e.target.closest('.ctx-item');
    if (!item || item.classList.contains('is-disabled')) return;
    const action = item.dataset.action;

    if (action === 'copy-link') {
      copyText(window.location.href).then((ok) => flashItem(item, ok, 'Copied!', 'Copy failed'));
      return;
    }
    if (action === 'copy-selection') {
      copyText(ctxSelectionText).then((ok) => flashItem(item, ok, 'Copied!', 'Copy failed'));
      return;
    }
    if (action === 'copy-field') {
      flashItem(item, fieldCommand('copy'), 'Copied!', 'Copy failed');
      return;
    }
    if (action === 'cut-field') {
      flashItem(item, fieldCommand('cut'), 'Cut!', 'Cut failed');
      return;
    }
    if (action === 'select-all-field') {
      if (ctxFieldEl) { ctxFieldEl.focus(); ctxFieldEl.select(); }
      closeCtxMenu();
      return;
    }
    if (action === 'paste-field') {
      const field = ctxFieldEl;
      const range = ctxFieldRange;
      if (!field || !range || !navigator.clipboard || !navigator.clipboard.readText) {
        // Clipboard read needs a secure (HTTPS) origin — unavailable on this
        // plain-HTTP .local vhost today. Native Ctrl+V still works fine.
        flashItem(item, false, '', 'Use Ctrl+V');
        return;
      }
      navigator.clipboard.readText().then((text) => {
        const val = field.value;
        let next = val.slice(0, range.start) + text + val.slice(range.end);
        if (field.maxLength && field.maxLength > 0 && next.length > field.maxLength) {
          next = next.slice(0, field.maxLength);
        }
        field.value = next;
        const pos = Math.min(range.start + text.length, next.length);
        field.focus();
        field.setSelectionRange(pos, pos);
        field.dispatchEvent(new Event('input', { bubbles: true }));
        flashItem(item, true, 'Pasted!', '');
      }).catch(() => flashItem(item, false, '', 'Use Ctrl+V'));
      return;
    }
    if (action === 'home') {
      const home = document.getElementById('home');
      if (home) home.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth' });
      else window.location.href = '/#home';
    } else if (action === 'cv') {
      const a = document.createElement('a');
      a.href = '/assets/Abdullah-Hussein-CV.pdf';
      a.download = '';
      document.body.appendChild(a);
      a.click();
      a.remove();
    } else if (action === 'contact') {
      const contact = document.getElementById('contact');
      if (contact) contact.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth' });
      else window.location.href = '/#contact';
    }
    closeCtxMenu();
  });

  /* ---------- Custom cursor ---------- */
  if (!isTouch) {
    const dot = document.querySelector('.cursor-dot');
    const outline = document.querySelector('.cursor-outline');
    let dotX = 0, dotY = 0, outX = 0, outY = 0;
    let mouseX = 0, mouseY = 0;

    window.addEventListener('mousemove', (e) => {
      mouseX = e.clientX;
      mouseY = e.clientY;
    });

    function loop() {
      dotX += (mouseX - dotX) * 0.9;
      dotY += (mouseY - dotY) * 0.9;
      outX += (mouseX - outX) * 0.18;
      outY += (mouseY - outY) * 0.18;
      if (dot) { dot.style.left = dotX + 'px'; dot.style.top = dotY + 'px'; }
      if (outline) { outline.style.left = outX + 'px'; outline.style.top = outY + 'px'; }
      requestAnimationFrame(loop);
    }
    loop();

    document.querySelectorAll('a, button').forEach((el) => {
      el.addEventListener('mouseenter', () => outline && outline.classList.add('is-active'));
      el.addEventListener('mouseleave', () => outline && outline.classList.remove('is-active'));
    });
  } else {
    document.body.classList.add('no-custom-cursor');
  }

  /* ---------- Nav scroll state ---------- */
  const navbar = document.querySelector('.navbar');
  window.addEventListener('scroll', () => {
    navbar && navbar.classList.toggle('is-scrolled', window.scrollY > 40);
  }, { passive: true });

  /* ---------- Mobile drawer ---------- */
  const navToggle = document.querySelector('.nav-toggle');
  const drawer = document.querySelector('.mobile-drawer');
  navToggle && navToggle.addEventListener('click', () => {
    drawer.classList.toggle('is-open');
  });
  drawer && drawer.querySelectorAll('a').forEach((a) => {
    a.addEventListener('click', () => drawer.classList.remove('is-open'));
  });

  /* ---------- Active nav link on scroll ---------- */
  const sections = document.querySelectorAll('main section[id]');
  const navLinks = document.querySelectorAll('.nav-links a');
  if ('IntersectionObserver' in window) {
    const navObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          navLinks.forEach((link) => {
            const href = link.getAttribute('href');
            // Cross-page links (certifications.html, services.html, ...) aren't part of
            // this page's scroll-spy — leave whatever active state the page already set.
            if (href.charAt(0) !== '#') return;
            link.classList.toggle('is-active', href === `#${entry.target.id}`);
          });
        }
      });
    }, { rootMargin: '-45% 0px -45% 0px' });
    sections.forEach((s) => navObserver.observe(s));
  }

  /* ---------- Back to top ---------- */
  const backToTop = document.getElementById('back-to-top');
  if (backToTop) {
    const toggleBackToTop = () => backToTop.classList.toggle('is-visible', window.scrollY > 500);
    toggleBackToTop();
    window.addEventListener('scroll', toggleBackToTop, { passive: true });
    backToTop.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: reducedMotion ? 'auto' : 'smooth' });
    });
  }

  /* ---------- Contact form ---------- */
  const contactForm = document.getElementById('contact-form');
  const formStatus = document.getElementById('form-status');

  // Device context sent along with each message (disclosed under the form).
  // All of it is self-reported by the browser, so /api/contact treats it as
  // hints only — the IP, location and User-Agent it records come from the
  // request itself.
  let formStartedAt = 0;
  contactForm && contactForm.addEventListener('input', () => {
    if (!formStartedAt) formStartedAt = performance.now();
  });
  contactForm && contactForm.addEventListener('reset', () => {
    formStartedAt = 0;
  });

  function webglRenderer() {
    try {
      const gl = document.createElement('canvas').getContext('webgl');
      if (!gl) return '';
      const info = gl.getExtension('WEBGL_debug_renderer_info');
      const renderer = info
        ? `${gl.getParameter(info.UNMASKED_VENDOR_WEBGL)} / ${gl.getParameter(info.UNMASKED_RENDERER_WEBGL)}`
        : gl.getParameter(gl.RENDERER);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      return String(renderer || '');
    } catch (err) {
      return '';
    }
  }

  // Classic canvas fingerprint: the same drawing rasterises slightly
  // differently across GPU, driver and font stacks.
  function canvasSignature() {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 240;
      canvas.height = 60;
      const ctx = canvas.getContext('2d');
      ctx.textBaseline = 'top';
      ctx.font = '16px Arial';
      ctx.fillStyle = '#f60';
      ctx.fillRect(100, 1, 62, 20);
      ctx.fillStyle = '#069';
      ctx.fillText('agentx512 fp ✓', 2, 15);
      return canvas.toDataURL();
    } catch (err) {
      return '';
    }
  }

  async function collectClientMeta() {
    const nav = navigator;
    const meta = {
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || '',
      localTime: new Date().toString(),
      languages: (nav.languages && nav.languages.length ? nav.languages : [nav.language]).join(', '),
      platform: nav.userAgentData?.platform || nav.platform || '',
      mobile: nav.userAgentData ? String(nav.userAgentData.mobile) : '',
      screen: `${screen.width}x${screen.height}, ${screen.colorDepth}-bit, ${window.devicePixelRatio}x`,
      viewport: `${window.innerWidth}x${window.innerHeight}`,
      cpuCores: String(nav.hardwareConcurrency || ''),
      memoryGb: String(nav.deviceMemory || ''),
      touchPoints: String(nav.maxTouchPoints || 0),
      connection: nav.connection?.effectiveType || '',
      gpu: webglRenderer(),
      theme: document.documentElement.getAttribute('data-theme') || '',
      referrer: document.referrer,
      userAgent: nav.userAgent,
      webdriver: String(!!nav.webdriver),
      timeOnPageSec: String(Math.round(performance.now() / 1000)),
      fillTimeSec: formStartedAt ? String(Math.round((performance.now() - formStartedAt) / 1000)) : '',
      fingerprint: '',
    };

    // Hash of stable signals only (no viewport, zoom or clock), so the same
    // browser shows the same short ID when it writes again. crypto.subtle
    // needs HTTPS, so this stays empty on plain-HTTP local dev.
    try {
      const source = [meta.userAgent, meta.languages, meta.timezone, meta.platform,
        `${screen.width}x${screen.height}x${screen.colorDepth}`, meta.cpuCores, meta.memoryGb,
        meta.touchPoints, meta.gpu, canvasSignature()].join('|');
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(source));
      meta.fingerprint = Array.from(new Uint8Array(digest).slice(0, 8), (b) => b.toString(16).padStart(2, '0')).join('');
    } catch (err) {
      meta.fingerprint = '';
    }
    return meta;
  }

  contactForm && contactForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    if (!contactForm.reportValidity()) return;

    // Honeypot: bots tend to fill every field, humans never see this one
    const honeypot = contactForm.querySelector('[name="website"]');
    if (honeypot && honeypot.value.trim() !== '') {
      formStatus.textContent = "Thanks! I'll get back to you soon.";
      formStatus.className = 'form-status is-success';
      contactForm.reset();
      return;
    }

    const submitBtn = contactForm.querySelector('.form-submit');
    submitBtn.disabled = true;
    formStatus.textContent = '';
    formStatus.className = 'form-status';

    try {
      const payload = {
        name: contactForm.elements.name?.value?.trim() || '',
        email: contactForm.elements.email?.value?.trim() || '',
        phone: contactForm.elements.phone?.value?.trim() || '',
        message: contactForm.elements.message?.value?.trim() || '',
        website: contactForm.elements.website?.value?.trim() || '',
      };
      try {
        payload.meta = await collectClientMeta();
      } catch (err) {
        // Device details are optional — the message still goes out without them.
      }

      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        formStatus.textContent = "Message sent — thanks! I'll get back to you soon.";
        formStatus.className = 'form-status is-success';
        contactForm.reset();
      } else {
        formStatus.textContent = data.error || 'Could not send your message right now, please try again.';
        formStatus.className = 'form-status is-error';
      }
    } catch (err) {
      formStatus.textContent = 'Network error — please email me directly instead.';
      formStatus.className = 'form-status is-error';
    } finally {
      submitBtn.disabled = false;
    }
  });

  /* ---------- GSAP scroll reveals ---------- */
  if (window.gsap && window.ScrollTrigger) {
    gsap.registerPlugin(ScrollTrigger);

    // Hero intro
    const heroTl = gsap.timeline({ delay: 0.4 });
    heroTl
      .from('.hero .eyebrow', { opacity: 0, y: 20, duration: 0.6, ease: 'power3.out' })
      .from('.hero-name', { opacity: 0, y: 40, duration: 0.8, ease: 'power3.out' }, '-=0.35')
      .from('.hero-tagline', { opacity: 0, y: 20, duration: 0.6, ease: 'power3.out' }, '-=0.45')
      .from('.hero-actions', { opacity: 0, y: 20, duration: 0.6, ease: 'power3.out' }, '-=0.45')
      .from('.hero .social-row', { opacity: 0, y: 20, duration: 0.6, ease: 'power3.out' }, '-=0.45')
      .from('.hero-photo-wrap', { opacity: 0, scale: 0.85, duration: 0.8, ease: 'power3.out' }, '-=0.6')
      .from('.scroll-cue', { opacity: 0, duration: 0.6 }, '-=0.3');

    // Generic reveal on scroll for anything with .reveal
    document.querySelectorAll('.reveal').forEach((el, i) => {
      gsap.to(el, {
        opacity: 1,
        y: 0,
        duration: 0.9,
        ease: 'power3.out',
        scrollTrigger: {
          trigger: el,
          start: 'top 85%',
          toggleActions: 'play none none reverse',
        },
        delay: (i % 4) * 0.06,
      });
    });

    // Skill bars fill on scroll
    document.querySelectorAll('.skill-bar span[data-width]').forEach((bar) => {
      ScrollTrigger.create({
        trigger: bar,
        start: 'top 90%',
        once: true,
        onEnter: () => { bar.style.width = bar.dataset.width + '%'; },
      });
    });

    // Stat numbers count up on scroll
    document.querySelectorAll('[data-count]').forEach((el) => {
      const target = parseInt(el.dataset.count, 10) || 0;
      const suffix = el.dataset.suffix || '';
      const counter = { val: 0 };
      ScrollTrigger.create({
        trigger: el,
        start: 'top 90%',
        once: true,
        onEnter: () => {
          gsap.to(counter, {
            val: target,
            duration: 1.6,
            ease: 'power2.out',
            onUpdate: () => { el.textContent = Math.round(counter.val) + suffix; },
          });
        },
      });
    });

  } else {
    // Fallback: no animation library, just show content
    document.querySelectorAll('.reveal').forEach((el) => {
      el.style.opacity = 1;
      el.style.transform = 'none';
    });
    document.querySelectorAll('.skill-bar span[data-width]').forEach((bar) => {
      bar.style.width = bar.dataset.width + '%';
    });
    document.querySelectorAll('[data-count]').forEach((el) => {
      el.textContent = (el.dataset.count || '0') + (el.dataset.suffix || '');
    });
  }

  /* ---------- Certificate / badge preview lightbox (certifications.html) ---------- */
  const lightbox = document.getElementById('lightbox');
  if (lightbox) {
    const stage = document.getElementById('lb-stage');
    const imageEl = document.getElementById('lb-image');
    const titleEl = document.getElementById('lb-title');
    const metaEl = document.getElementById('lb-meta');
    const switchWrap = document.getElementById('lb-switch');
    const verifyBtn = document.getElementById('lb-verify');
    const openBtn = document.getElementById('lb-open');
    const downloadBtn = document.getElementById('lb-download');
    const counterEl = document.getElementById('lb-counter');
    const prevBtn = document.getElementById('lb-prev');
    const nextBtn = document.getElementById('lb-next');
    const closeBtn = document.getElementById('lb-close');

    // Build ordered groups so prev/next can walk siblings sharing the same data-lb-group.
    const groups = {};
    document.querySelectorAll('.lb-trigger').forEach((el) => {
      const group = el.dataset.lbGroup || 'default';
      (groups[group] = groups[group] || []).push(el);
    });

    let activeGroup = [];
    let activeIndex = 0;
    let activeAlts = [];
    let activeAltIndex = 0;
    let lastFocused = null;

    function altsFor(el) {
      if (el.dataset.lbAlts) {
        try { return JSON.parse(el.dataset.lbAlts); } catch (e) { /* fall through */ }
      }
      return [{
        label: 'Certificate',
        preview: el.dataset.lbPreview,
        pdf: el.dataset.lbPdf,
      }];
    }

    function renderAlt() {
      const alt = activeAlts[activeAltIndex];
      if (!alt) return;
      stage.classList.add('is-loading');
      imageEl.src = alt.preview;
      imageEl.alt = titleEl.textContent;
      openBtn.href = alt.pdf || alt.preview;
      downloadBtn.href = alt.pdf || alt.preview;

      if (activeAlts.length > 1) {
        switchWrap.hidden = false;
        switchWrap.innerHTML = '';
        activeAlts.forEach((a, i) => {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.textContent = a.label;
          btn.className = i === activeAltIndex ? 'is-active' : '';
          btn.addEventListener('click', () => { activeAltIndex = i; renderAlt(); });
          switchWrap.appendChild(btn);
        });
      } else {
        switchWrap.hidden = true;
        switchWrap.innerHTML = '';
      }
    }

    function renderTrigger(el) {
      const type = el.dataset.lbType || 'cert';
      titleEl.textContent = el.dataset.lbTitle || '';
      const issuer = el.dataset.lbIssuer || '';
      const date = el.dataset.lbDate || '';
      metaEl.innerHTML = issuer ? `<span>${issuer}</span>${date ? ' · ' + date : ''}` : (date || '');

      stage.classList.toggle('is-badge', type === 'badge');

      const verify = el.dataset.lbVerify;
      if (verify) {
        verifyBtn.href = verify;
        verifyBtn.hidden = false;
      } else {
        verifyBtn.hidden = true;
      }

      activeAlts = altsFor(el);
      activeAltIndex = 0;
      renderAlt();

      const multi = activeGroup.length > 1;
      prevBtn.hidden = !multi;
      nextBtn.hidden = !multi;
      counterEl.hidden = !multi;
      if (multi) counterEl.textContent = `${activeIndex + 1} / ${activeGroup.length}`;
    }

    function openLightbox(el) {
      const group = el.dataset.lbGroup || 'default';
      activeGroup = groups[group] || [el];
      activeIndex = activeGroup.indexOf(el);
      if (activeIndex < 0) activeIndex = 0;
      lastFocused = document.activeElement;

      renderTrigger(el);
      lightbox.classList.add('is-open');
      lightbox.setAttribute('aria-hidden', 'false');
      document.body.classList.add('lb-open');
      closeBtn.focus();
    }

    function closeLightbox() {
      lightbox.classList.remove('is-open');
      lightbox.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('lb-open');
      if (lastFocused && typeof lastFocused.focus === 'function') lastFocused.focus();
    }

    function step(delta) {
      if (!activeGroup.length) return;
      activeIndex = (activeIndex + delta + activeGroup.length) % activeGroup.length;
      renderTrigger(activeGroup[activeIndex]);
    }

    document.querySelectorAll('.lb-trigger').forEach((el) => {
      el.addEventListener('click', () => openLightbox(el));
    });

    imageEl.addEventListener('load', () => stage.classList.remove('is-loading'));
    imageEl.addEventListener('error', () => stage.classList.remove('is-loading'));

    closeBtn.addEventListener('click', closeLightbox);
    prevBtn.addEventListener('click', () => step(-1));
    nextBtn.addEventListener('click', () => step(1));
    lightbox.addEventListener('click', (e) => {
      if (e.target === lightbox) closeLightbox();
    });
    document.addEventListener('keydown', (e) => {
      if (!lightbox.classList.contains('is-open')) return;
      if (e.key === 'Escape') closeLightbox();
      else if (e.key === 'ArrowLeft') step(-1);
      else if (e.key === 'ArrowRight') step(1);
    });
  }

  /* ---------- Live bug-bounty stats (Bugcrowd + CyberTalents) ---------- */
  // Populates [data-live-stat="source.field"] elements from /api/stats.
  // Markup starts each stat on a "—" loading placeholder (see .stat-loading)
  // rather than a static number, so visitors never see an outdated figure —
  // only the pulsing placeholder or the real, live value. Once real numbers
  // arrive, they count up from zero as the stat scrolls into view
  // (immediately if it's already visible). data-fallback is the last-known-
  // good number, used only if the live fetch fails outright.
  const liveStatEls = document.querySelectorAll('[data-live-stat]');
  if (liveStatEls.length) {
    const showFallback = (el) => {
      const fallback = el.dataset.fallback;
      if (fallback === undefined) return;
      el.classList.remove('stat-loading');
      el.textContent = (el.dataset.livePrefix || '') + fallback + (el.dataset.liveSuffix || '');
    };

    fetch('/api/stats', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        liveStatEls.forEach((el) => {
          const [source, field] = el.dataset.liveStat.split('.');
          const group = data && data[source];
          if (!group || group[field] === null || group[field] === undefined) {
            showFallback(el);
            return;
          }
          const target = group[field];
          const prefix = el.dataset.livePrefix || '';
          const suffix = el.dataset.liveSuffix || '';
          const decimals = target % 1 !== 0 ? 2 : 0;
          const render = (val) => {
            const num = decimals ? val.toFixed(decimals) : Math.round(val).toLocaleString('en-US');
            el.textContent = prefix + num + suffix;
          };

          if (window.gsap && window.ScrollTrigger) {
            const counter = { val: 0 };
            ScrollTrigger.create({
              trigger: el,
              start: 'top 90%',
              once: true,
              onEnter: () => {
                el.classList.remove('stat-loading');
                gsap.to(counter, {
                  val: target,
                  duration: 1.6,
                  ease: 'power2.out',
                  onUpdate: () => render(counter.val),
                });
              },
            });
          } else {
            el.classList.remove('stat-loading');
            render(target);
          }
        });
      })
      .catch(() => { liveStatEls.forEach(showFallback); });
  }

  /* ---------- Error pages (404/403/500/503) ---------- */
  const errPathEl = document.getElementById('err-path');
  if (errPathEl) errPathEl.textContent = window.location.pathname + window.location.search;
  const errReloadBtn = document.getElementById('err-reload');
  errReloadBtn && errReloadBtn.addEventListener('click', () => window.location.reload());

  /* ---------- Project card image galleries ---------- */
  document.querySelectorAll('[data-gallery]').forEach((gallery) => {
    const slides = Array.from(gallery.querySelectorAll('.gallery-img'));
    const dots = Array.from(gallery.querySelectorAll('.gallery-dot'));
    if (slides.length < 2) return;
    let active = 0;
    let timer = null;

    const goTo = (idx) => {
      active = (idx + slides.length) % slides.length;
      gallery.dataset.activeIndex = String(active);
      slides.forEach((s, i) => s.classList.toggle('is-active', i === active));
      dots.forEach((d, i) => d.classList.toggle('is-active', i === active));
    };
    const next = () => goTo(active + 1);
    const start = () => {
      stop();
      timer = window.setInterval(next, 3800);
    };
    const stop = () => { if (timer) { window.clearInterval(timer); timer = null; } };

    dots.forEach((dot, i) => {
      dot.addEventListener('click', (e) => { e.stopPropagation(); goTo(i); start(); });
    });
    gallery.addEventListener('mouseenter', stop);
    gallery.addEventListener('mouseleave', start);

    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) start();
  });

  /* ---------- Project screenshot lightbox (index.html) ---------- */
  const projectLightbox = document.getElementById('project-lightbox');
  if (projectLightbox) {
    const stage = document.getElementById('plb-stage');
    const imageEl = document.getElementById('plb-image');
    const titleEl = document.getElementById('plb-title');
    const counterEl = document.getElementById('plb-counter');
    const prevBtn = document.getElementById('plb-prev');
    const nextBtn = document.getElementById('plb-next');
    const closeBtn = document.getElementById('plb-close');

    let activeSlides = [];
    let activeIndex = 0;
    let activeTitle = '';
    let lastFocused = null;

    function render() {
      const slide = activeSlides[activeIndex];
      if (!slide) return;
      stage.classList.add('is-loading');
      imageEl.src = slide.src;
      imageEl.alt = slide.alt || activeTitle;
      titleEl.textContent = activeTitle;

      const multi = activeSlides.length > 1;
      prevBtn.hidden = !multi;
      nextBtn.hidden = !multi;
      counterEl.hidden = !multi;
      if (multi) counterEl.textContent = `${activeIndex + 1} / ${activeSlides.length}`;
    }

    function open(mediaEl) {
      activeSlides = Array.from(mediaEl.querySelectorAll('img')).map((img) => ({ src: img.currentSrc || img.src, alt: img.alt }));
      if (!activeSlides.length) return;
      activeTitle = mediaEl.dataset.plbTitle || '';
      activeIndex = parseInt(mediaEl.dataset.activeIndex || '0', 10) || 0;
      lastFocused = document.activeElement;

      render();
      projectLightbox.classList.add('is-open');
      projectLightbox.setAttribute('aria-hidden', 'false');
      document.body.classList.add('lb-open');
      closeBtn.focus();
    }

    function close() {
      projectLightbox.classList.remove('is-open');
      projectLightbox.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('lb-open');
      if (lastFocused && typeof lastFocused.focus === 'function') lastFocused.focus();
    }

    function step(delta) {
      if (!activeSlides.length) return;
      activeIndex = (activeIndex + delta + activeSlides.length) % activeSlides.length;
      render();
    }

    document.querySelectorAll('[data-plb-group]').forEach((mediaEl) => {
      mediaEl.addEventListener('click', () => open(mediaEl));
      mediaEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(mediaEl); }
      });
    });

    imageEl.addEventListener('load', () => stage.classList.remove('is-loading'));
    imageEl.addEventListener('error', () => stage.classList.remove('is-loading'));

    closeBtn.addEventListener('click', close);
    prevBtn.addEventListener('click', () => step(-1));
    nextBtn.addEventListener('click', () => step(1));
    projectLightbox.addEventListener('click', (e) => {
      if (e.target === projectLightbox) close();
    });
    document.addEventListener('keydown', (e) => {
      if (!projectLightbox.classList.contains('is-open')) return;
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowLeft') step(-1);
      else if (e.key === 'ArrowRight') step(1);
    });
  }
});
