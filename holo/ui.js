/* Holo's shared UI kit, for the card browser and the Arena (the same kit as Tutor's). Both pages load it in <head>, before they draw.
   UI.theme    Match this device, Dark or Light: remembered on this device, set as <html data-theme> straight away
   UI.menu     the header button with those choices (and, on a keyboard, the shortcuts)
   UI.swipe    a sideways swipe with a finger, the drag following it, for paging through cards and decks
   UI.wheel    the same with two fingers on a trackpad
   UI.overlay  the browser's Back (or the edge swipe on an iPhone) closes the card or deck you have open
   UI.arrows   arrow keys move focus to the nearest card or tile in that direction
   UI.keys     the keyboard shortcuts sheet, opened with ? */
(function () {
  'use strict';
  const root = document.documentElement;
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const typing = (e) => { const t = e.target; return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable); };

  /* ---------- Theme ---------- */
  const KEY = 'holo.theme';
  const mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: light)') : null;
  const read = () => { try { const v = localStorage.getItem(KEY); return v === 'dark' || v === 'light' ? v : 'auto'; } catch (e) { return 'auto'; } };
  const resolve = (p) => (p === 'auto' ? (mq && mq.matches ? 'light' : 'dark') : p);
  const subs = [];
  function paint() {
    const t = resolve(read());
    const changed = root.dataset.theme !== t;
    root.dataset.theme = t;
    const tc = document.querySelector('meta[name="theme-color"]');
    if (tc) tc.setAttribute('content', t === 'light' ? '#ecebf5' : '#161b33');
    const cs = document.querySelector('meta[name="color-scheme"]');
    if (cs) cs.setAttribute('content', t);
    if (changed) for (const f of subs) { try { f(t); } catch (e) { /* a listener's own problem */ } }
  }
  paint();
  if (mq) { const on = () => { if (read() === 'auto') paint(); }; if (mq.addEventListener) mq.addEventListener('change', on); else if (mq.addListener) mq.addListener(on); }
  window.addEventListener('storage', (e) => { if (e.key === KEY) { paint(); syncBtn(); } });
  document.addEventListener('DOMContentLoaded', paint);
  const theme = {
    get: read,
    now: () => resolve(read()),
    set(p) { try { if (p === 'auto') localStorage.removeItem(KEY); else localStorage.setItem(KEY, p); } catch (e) { /* private browsing */ } paint(); syncBtn(); },
    on(f) { subs.push(f); },
  };

  const SVG = (p) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
  const ICON = {
    auto: SVG('<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5a8.5 8.5 0 0 1 0 17z" fill="currentColor" stroke="none"/>'),
    dark: SVG('<path d="M20 14.6A8.6 8.6 0 0 1 9.4 4a8.6 8.6 0 1 0 10.6 10.6z"/>'),
    light: SVG('<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.2M12 19.3v2.2M4.6 4.6l1.6 1.6M17.8 17.8l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.6 19.4l1.6-1.6M17.8 6.2l1.6-1.6"/>'),
    keys: SVG('<rect x="2.5" y="6" width="19" height="12" rx="2.5"/><path d="M6.5 10h.01M10 10h.01M13.5 10h.01M17 10h.01M7.5 14h9"/>'),
    tick: SVG('<path d="M5 12.5l4.5 4.5L19 7.5"/>'),
    x: SVG('<path d="M6 6l12 12M18 6L6 18"/>'),
  };

  /* ---------- The header menu: appearance, then the keyboard shortcuts ---------- */
  let menuEl = null, menuBtn = null;
  function syncBtn() {
    if (!menuBtn) return;
    const p = read();
    menuBtn.innerHTML = ICON[p === 'auto' ? 'auto' : p];
    menuBtn.setAttribute('aria-label', `Appearance: ${p === 'auto' ? 'matching this device' : p}`);
    menuBtn.title = 'Appearance';
  }
  function closeMenu(focusBtn) {
    if (!menuEl) return;
    menuEl.remove();
    menuEl = null;
    if (menuBtn) { menuBtn.setAttribute('aria-expanded', 'false'); if (focusBtn) menuBtn.focus(); }
  }
  function openMenu() {
    closeMenu(false);
    const p = read();
    menuEl = document.createElement('div');
    menuEl.className = 'ui-menu';
    menuEl.setAttribute('role', 'menu');
    menuEl.setAttribute('aria-label', 'Appearance');
    const item = (v, label) => `<button type="button" role="menuitemradio" aria-checked="${p === v}" data-ui-theme="${v}">${ICON[v]}<span>${label}</span><span class="ui-tick">${ICON.tick}</span></button>`;
    menuEl.innerHTML = `<p class="ui-mh">Appearance</p>${item('auto', 'Match this device')}${item('dark', 'Dark')}${item('light', 'Light')}`
      + (keys.has() ? `<hr><button type="button" role="menuitem" data-ui-keys>${ICON.keys}<span>Keyboard shortcuts</span><kbd>?</kbd></button>` : '');
    document.body.appendChild(menuEl);
    const r = menuBtn.getBoundingClientRect(), w = menuEl.offsetWidth;
    menuEl.style.top = `${Math.round(r.bottom + 8)}px`;
    menuEl.style.left = `${Math.round(Math.max(8, Math.min(window.innerWidth - w - 8, r.right - w)))}px`;
    menuBtn.setAttribute('aria-expanded', 'true');
    (menuEl.querySelector('[aria-checked="true"]') || menuEl.querySelector('button')).focus();
    menuEl.addEventListener('click', (e) => {
      const t = e.target.closest('[data-ui-theme]');
      if (t) { theme.set(t.dataset.uiTheme); closeMenu(true); return; }
      if (e.target.closest('[data-ui-keys]')) { closeMenu(false); keys.open(); }
    });
    menuEl.addEventListener('keydown', (e) => {
      const items = [...menuEl.querySelectorAll('button')], k = items.indexOf(document.activeElement);
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); items[(k + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length].focus(); }
      else if (e.key === 'Home' || e.key === 'End') { e.preventDefault(); items[e.key === 'Home' ? 0 : items.length - 1].focus(); }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeMenu(true); }
      else if (e.key === 'Tab') closeMenu(false);
    });
  }
  document.addEventListener('pointerdown', (e) => { if (menuEl && !menuEl.contains(e.target) && !(menuBtn && menuBtn.contains(e.target))) closeMenu(false); }, true);
  window.addEventListener('resize', () => closeMenu(false));
  const menu = {
    mount(btn) {
      menuBtn = btn;
      btn.setAttribute('aria-haspopup', 'menu');
      btn.setAttribute('aria-expanded', 'false');
      syncBtn();
      btn.addEventListener('click', () => (menuEl ? closeMenu(true) : openMenu()));
    },
    close: () => closeMenu(false),
    isOpen: () => !!menuEl,
  };

  /* ---------- Back closes what's open ----------
     Opening a card or a deck adds a history entry at the same address; Back pops it and closes the overlay instead of
     leaving the page. Closing it any other way (X, Esc, a button) takes that entry back out. While that Back is on its way,
     any history change the page makes is held and replayed once it lands, so the two never cross. */
  const H = { push: history.pushState.bind(history), replace: history.replaceState.bind(history) };
  const stack = [];
  let ignore = 0, held = null, heldTimer = 0;
  const flush = () => { clearTimeout(heldTimer); const q = held; held = null; if (q) for (const [k, a] of q) { try { H[k](...a); } catch (e) { /* sandboxed */ } } };
  history.pushState = function (...a) { if (held) held.push(['push', a]); else H.push(...a); };
  // A page that rewrites its address while something is open keeps the entry marked as that something's
  history.replaceState = function (st, t, url) {
    if (held) { held.push(['replace', [st, t, url]]); return; }
    const cur = history.state;
    if (stack.length && cur && cur.uiOverlay) st = Object.assign({}, st || {}, { uiOverlay: cur.uiOverlay, uiDepth: cur.uiDepth });
    H.replace(st, t, url);
  };
  const overlay = {
    open(id, close) {
      if (stack.some((o) => o.id === id)) return;
      stack.push({ id, close });
      const a = [Object.assign({}, history.state || {}, { uiOverlay: id, uiDepth: stack.length }), '', location.href];
      // Opened again before the last close's Back has landed: its entry goes in after that
      if (held) held.push(['push', a]);
      else { try { H.push(...a); } catch (e) { /* sandboxed */ } }
    },
    // The page closed it itself
    closed(id) {
      const k = stack.findIndex((o) => o.id === id);
      if (k < 0) return;
      stack.splice(k, 1);
      if (!(history.state && history.state.uiOverlay === id)) return;
      ignore++;
      held = held || [];
      clearTimeout(heldTimer);
      heldTimer = setTimeout(() => { ignore = 0; flush(); }, 700);
      history.back();
    },
    // First thing in the page's popstate handler: true when this was about an overlay, and the page should do nothing more
    pop(e) {
      if (ignore) { ignore--; if (!ignore) flush(); return true; }
      const top = stack[stack.length - 1];
      if (!top) return false;
      if (e && e.state && e.state.uiOverlay === top.id) return true;
      stack.pop();
      top.close();
      return true;
    },
    has: (id) => stack.some((o) => o.id === id),
  };

  /* ---------- Swipe ----------
     o.move(dx) follows a sideways drag, and o.move(0, paged) ends it; o.swipe(dir) then fires with +1 for the next one (a
     swipe to the left) and -1 for the previous. Vertical scrolling stays native, rows that scroll sideways keep their own
     swipe, and a swipe from the very edge is left to the browser (that's Back on an iPhone). */
  const sideways = (el, stop) => { for (let n = el; n && n !== stop; n = n.parentElement) if (n.scrollWidth > n.clientWidth + 2 && /auto|scroll/.test(getComputedStyle(n).overflowX)) return true; return false; };
  function swallowClick() {
    const kill = (e) => { e.stopPropagation(); e.preventDefault(); };
    document.addEventListener('click', kill, true);
    setTimeout(() => document.removeEventListener('click', kill, true), 380);
  }
  function swipe(el, o) {
    el.style.touchAction = 'pan-y pinch-zoom';
    if (!el.style.touchAction) el.style.touchAction = 'pan-y';
    let s = null;
    el.addEventListener('pointerdown', (e) => {
      s = null;
      if (e.pointerType === 'mouse' || !e.isPrimary) return;
      if (e.clientX < 24 || e.clientX > window.innerWidth - 24) return;
      if (o.ignore && o.ignore(e)) return;
      if (sideways(e.target, el) || (e.target.closest && e.target.closest('input, select, textarea, [data-noswipe]'))) return;
      s = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now(), lock: null, dx: 0 };
    }, { passive: true });
    el.addEventListener('pointermove', (e) => {
      if (!s || e.pointerId !== s.id) return;
      const dx = e.clientX - s.x, dy = e.clientY - s.y;
      if (!s.lock) {
        if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
        s.lock = Math.abs(dx) > Math.abs(dy) * 1.3 ? 'x' : 'y';
        if (s.lock === 'x') { try { el.setPointerCapture(e.pointerId); } catch (err) { /* already released */ } }
      }
      if (s.lock !== 'x') return;
      s.dx = dx;
      if (o.move) o.move(dx);
    }, { passive: true });
    const end = (e) => {
      if (!s || e.pointerId !== s.id) return;
      const st = s;
      s = null;
      if (st.lock !== 'x') return;
      const v = st.dx / Math.max(1, performance.now() - st.t);
      const go = e.type === 'pointerup' && (Math.abs(st.dx) > (o.threshold || 64) || (Math.abs(st.dx) > 26 && Math.abs(v) > 0.5));
      if (o.move) o.move(0, go);
      if (go) { swallowClick(); o.swipe(st.dx < 0 ? 1 : -1); }
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  }
  // A sideways two-finger swipe on a trackpad: one page per swipe, however long the glide after it
  function wheel(el, o) {
    let acc = 0, quiet = 0, fired = false;
    el.addEventListener('wheel', (e) => {
      if (e.ctrlKey || Math.abs(e.deltaX) <= Math.abs(e.deltaY) * 1.2 || (o.ignore && o.ignore(e)) || sideways(e.target, el)) return;
      e.preventDefault();
      clearTimeout(quiet);
      quiet = setTimeout(() => { acc = 0; fired = false; }, 200);
      if (fired) return;
      acc += e.deltaX;
      if (Math.abs(acc) > 60) { fired = true; o.swipe(acc > 0 ? 1 : -1); }
    }, { passive: false });
  }
  // The slide that goes with a page turn: dir +1 slides the new one in from the right; bumped, it nudges to say there's no more.
  // Script animations sit on top of the page's own, so an element's opening animation can't hide the slide.
  const still = window.matchMedia('(prefers-reduced-motion: reduce)');
  function slide(el, dir, bumped) {
    if (!el || !el.animate || still.matches) return;
    const k = dir > 0 ? 1 : -1;
    el.animate(bumped ? [{ transform: 'none' }, { transform: `translateX(${-12 * k}px)`, offset: 0.4 }, { transform: 'none' }]
      : [{ transform: `translateX(${46 * k}px)`, opacity: 0.25 }, { transform: 'none', opacity: 1 }], { duration: bumped ? 300 : 240, easing: 'cubic-bezier(.2, .75, .15, 1)' });
  }
  // During a drag: the content follows the finger, with some give at either end. At the end it springs back, or, when the
  // page turns, goes straight back for the next one to slide in.
  function drag(el, dx, canPrev, canNext, paged) {
    if (!el) return;
    if (!dx) {
      el.style.transform = ''; el.style.opacity = '';
      if (paged) el.classList.remove('ui-paging');
      else { el.classList.add('ui-paging'); setTimeout(() => el.classList.remove('ui-paging'), 240); }
      return;
    }
    el.classList.remove('ui-paging');
    const free = dx > 0 ? canPrev : canNext;
    const x = free ? dx : dx / 3.5;
    el.style.transform = `translateX(${Math.round(x)}px)`;
    el.style.opacity = String(Math.max(0.55, 1 - Math.abs(x) / 900));
  }

  /* ---------- Arrow keys between cards and tiles ---------- */
  const DIRS = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
  const shown = (el) => el.getClientRects().length > 0 && !el.closest('[hidden]');
  // Moves focus from the focused item to the nearest one in the arrow's direction; false when there's nowhere to go
  function arrows(e, items) {
    const dir = DIRS[e.key];
    if (!dir) return false;
    const list = items.filter(shown);
    const cur = document.activeElement;
    if (!list.length || !list.includes(cur)) return false;
    const a = cur.getBoundingClientRect(), ax = a.left + a.width / 2, ay = a.top + a.height / 2;
    let best = null, bs = Infinity;
    for (const el of list) {
      if (el === cur) continue;
      const b = el.getBoundingClientRect();
      const bx = b.left + b.width / 2, by = b.top + b.height / 2;
      const along = (bx - ax) * dir[0] + (by - ay) * dir[1];
      // Half its own size away at least: a card raised a little in the same row isn't "above" it, and the copies stacked
      // in one pile count as one stop
      if (along < Math.max(4, (dir[0] ? a.width : a.height) / 2)) continue;
      const across = Math.abs(dir[0] ? by - ay : bx - ax);
      const overlap = dir[0] ? Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) : Math.min(a.right, b.right) - Math.max(a.left, b.left);
      const score = along + across * (overlap > 0 ? 0.25 : 2.2);
      if (score < bs) { bs = score; best = el; }
    }
    if (!best) return false;
    e.preventDefault();
    best.focus({ preventScroll: true });
    best.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    return true;
  }

  /* ---------- Keyboard shortcuts ---------- */
  let keysFn = null, keysEl = null, keysFrom = null, keyboard = false;
  // The menu offers the shortcuts once there's a keyboard: a mouse or trackpad suggests one, a key pressed proves it
  document.addEventListener('keydown', (e) => { if (!typing(e) && e.key.length === 1) keyboard = true; }, true);
  const keys = {
    // sections(): [{ title, rows: [[['←', '→'], 'What they do'], ...] }], asked each time the sheet opens
    set(fn) { keysFn = fn; },
    has: () => !!keysFn && (keyboard || window.matchMedia('(any-pointer: fine)').matches),
    open() {
      if (keysEl || !keysFn) return;
      keysFrom = document.activeElement;
      const secs = keysFn() || [];
      keysEl = document.createElement('div');
      keysEl.className = 'ui-keys';
      keysEl.setAttribute('role', 'dialog');
      keysEl.setAttribute('aria-modal', 'true');
      keysEl.setAttribute('aria-labelledby', 'uiKeysH');
      keysEl.innerHTML = `<div class="ui-keys-scrim" data-ui-close></div><div class="ui-keys-box"><h2 id="uiKeysH">Keyboard shortcuts</h2><p>On a computer, or an iPad with a keyboard. Press <kbd>?</kbd> to see them again.</p>`
        + secs.map((s) => `<h3>${esc(s.title)}</h3><dl>${s.rows.map(([ks, d]) => `<dt>${ks.map((k) => `<kbd>${esc(k)}</kbd>`).join('')}</dt><dd>${esc(d)}</dd>`).join('')}</dl>`).join('')
        + `<button type="button" class="icon-btn ui-x" data-ui-close aria-label="Close">${ICON.x}</button></div>`;
      document.body.appendChild(keysEl);
      keysEl.addEventListener('click', (e) => { if (e.target.closest('[data-ui-close]')) keys.close(); });
      keysEl.querySelector('.ui-x').focus();
      overlay.open('keys', () => keys.close(true));
    },
    close(viaHistory) {
      if (!keysEl) return;
      keysEl.remove();
      keysEl = null;
      if (!viaHistory) overlay.closed('keys');
      if (keysFrom && keysFrom.isConnected) keysFrom.focus();
    },
    isOpen: () => !!keysEl,
  };
  document.addEventListener('keydown', (e) => {
    if (keysEl) {
      if (e.key === 'Escape' || e.key === '?') { e.preventDefault(); e.stopImmediatePropagation(); keys.close(); }
      else if (e.key === 'Tab') { e.preventDefault(); keysEl.querySelector('.ui-x').focus(); }
      // Nothing behind the sheet reacts while it's open; arrows and Page Down still scroll it
      else e.stopImmediatePropagation();
      return;
    }
    if (e.key === '?' && keysFn && !typing(e) && !e.metaKey && !e.ctrlKey && !e.altKey) { e.preventDefault(); e.stopImmediatePropagation(); closeMenu(false); keys.open(); }
  }, true);

  window.UI = { theme, menu, overlay, swipe, wheel, slide, drag, arrows, keys, typing, icon: ICON };
})();
