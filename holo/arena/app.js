/* Holo Arena: the page. Lobby, replays, playing against the AI and the lessons.
   The rules live in engine.js; this file only draws what the engine records. */
'use strict';
(function () {
/* ============================================================
   1. Small utilities
   ============================================================ */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (ch) => ESC[ch]);
const nf = new Intl.NumberFormat('en-US');
const plural = (n, one, many = one + 's') => `${nf.format(n)} ${n === 1 ? one : many}`;
const listWords = (xs) => (xs.length <= 2 ? xs.join(' and ') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
const store = {
  get(key, fallback) { try { const v = localStorage.getItem(key); return v == null ? fallback : JSON.parse(v); } catch { return fallback; } },
  set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; } },
  del(key) { try { localStorage.removeItem(key); } catch { /* private mode */ } },
};
const ICON = {
  play: '<path class="fill" d="M8.2 5.6v12.8a.6.6 0 0 0 .9.5l10.2-6.4a.6.6 0 0 0 0-1L9.1 5.1a.6.6 0 0 0-.9.5z"/>',
  pause: '<path d="M8.5 5.5v13M15.5 5.5v13" stroke-width="2.6"/>',
  prev: '<path d="M14.5 5.5L8 12l6.5 6.5"/>',
  next: '<path d="M9.5 5.5L16 12l-6.5 6.5"/>',
  first: '<path d="M6.5 5.5v13M17 5.5L10.5 12l6.5 6.5"/>',
  last: '<path d="M17.5 5.5v13M7 5.5l6.5 6.5L7 18.5"/>',
  eye: '<path d="M2.5 12s3.6-6.3 9.5-6.3 9.5 6.3 9.5 6.3-3.6 6.3-9.5 6.3S2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.8"/>',
  log: '<path d="M5 6.5h14M5 12h14M5 17.5h9"/>',
  x: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
  chart: '<path d="M5 19.5V11M10 19.5V5.5M15 19.5v-6M20 19.5V9"/>',
  die: '<rect x="4" y="4" width="16" height="16" rx="3.6"/><circle class="fill" cx="8.6" cy="8.6" r="1.25"/><circle class="fill" cx="15.4" cy="8.6" r="1.25"/><circle class="fill" cx="12" cy="12" r="1.25"/><circle class="fill" cx="8.6" cy="15.4" r="1.25"/><circle class="fill" cx="15.4" cy="15.4" r="1.25"/>',
  back: '<path d="M14.5 5.5L8 12l6.5 6.5"/>',
  sparkle: '<path d="M11 4l1.7 4.8L17.5 10.5l-4.8 1.7L11 17l-1.7-4.8L4.5 10.5l4.8-1.7z"/><path d="M18 14.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z"/>',
  cap: '<path d="M2.8 9.5L12 5l9.2 4.5L12 14z"/><path d="M6.5 11.4v4.3c1.6 1.5 3.4 2.2 5.5 2.2s3.9-.7 5.5-2.2v-4.3M21.2 9.5v5.2"/>',
  undo: '<path d="M9 7.5h6.2a4.3 4.3 0 0 1 0 8.6H9.5"/><path d="M11.8 4.6L8.8 7.5l3 3"/>',
  tool: '<path d="M14.6 4.6a4 4 0 0 0-5.1 5.1l-5.2 5.2a1.9 1.9 0 0 0 2.7 2.7l5.2-5.2a4 4 0 0 0 5.1-5.1l-2.4 2.4-2.1-.6-.6-2.1z"/>',
  drop: '<path d="M12 4.5s5.5 6 5.5 9.6a5.5 5.5 0 0 1-11 0C6.5 10.5 12 4.5 12 4.5z"/>',
  flame: '<path d="M12 3.8c.6 3.4 5 5.2 5 10a5 5 0 0 1-10 0c0-2.4 1.3-3.9 2.4-4.9.2 1.6.9 2.6 1.9 2.9-.6-3.3-.2-5.9.7-8z"/>',
  moon: '<path d="M18.5 14.6A7 7 0 0 1 9.4 5.5a7 7 0 1 0 9.1 9.1z"/>',
  bolt: '<path d="M13 3.5L5.5 13.5h6l-1 7 7.5-10h-6z"/>',
  swirl: '<path d="M12 12.5a1.5 1.5 0 1 1 1.5-1.5 3.5 3.5 0 1 1-3.5-3.5 5.5 5.5 0 1 1-5.5 5.5"/>',
  zoom: '<circle cx="10.5" cy="10.5" r="5.5"/><path d="M15 15l4.5 4.5"/>',
  check: '<path d="M5.5 12.5l4.2 4.2 8.8-9.4"/>',
  copy: '<rect x="8.5" y="8.5" width="11" height="11" rx="2.4"/><path d="M15.5 8.5V6.4a1.9 1.9 0 0 0-1.9-1.9H6.4a1.9 1.9 0 0 0-1.9 1.9v7.2a1.9 1.9 0 0 0 1.9 1.9h2.1"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.2"/><path d="M15.2 15.2l4.6 4.6"/>',
  swords: '<path d="M4.5 4.5l9 9M4.5 4.5h3.2M4.5 4.5v3.2M13 15.5l-2.5 2.5M8.5 11l-2.5 2.5M19.5 4.5l-9 9M19.5 4.5h-3.2M19.5 4.5v3.2M11 15.5l2.5 2.5M15.5 11l2.5 2.5M6.4 17.6l-2 2M17.6 17.6l2 2"/>',
  star: '<path d="M12 4.2l2.4 4.9 5.4.8-3.9 3.8.9 5.4-4.8-2.6-4.8 2.6.9-5.4-3.9-3.8 5.4-.8z"/>',
  book: '<path d="M5 5.2c2.6-.9 5-.6 7 1v13c-2-1.6-4.4-1.9-7-1z"/><path d="M19 5.2c-2.6-.9-5-.6-7 1v13c2-1.6 4.4-1.9 7-1z"/>',
  grid: '<rect x="4.5" y="4.5" width="6" height="6" rx="1.4"/><rect x="13.5" y="4.5" width="6" height="6" rx="1.4"/><rect x="4.5" y="13.5" width="6" height="6" rx="1.4"/><rect x="13.5" y="13.5" width="6" height="6" rx="1.4"/>',
  list: '<path d="M9 7h11M9 12h11M9 17h11M4.5 7h.5M4.5 12h.5M4.5 17h.5"/>',
};
const icon = (name) => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${ICON[name]}</svg>`;

/* ============================================================
   2. Cards and pictures
   ============================================================ */
const A = window.ARENA;
const TYPES = A.TYPES;
const DATA = { pool: null };
const def = (id) => DATA.pool.get(id);
const pipHTML = (t, cls = '') => `<i class="pip t-${t}${cls}" title="${TYPES[t] || t}" aria-label="${TYPES[t] || t}">${t}</i>`;
const pipsHTML = (letters, cls = '') => [...(letters || '')].map((t) => pipHTML(t, cls)).join('');
function srcs(d, big) {
  const [td, alt] = d.img || [];
  const out = [];
  if (td) out.push(`https://assets.tcgdex.net/${td}/${big ? 'high' : 'low'}.webp`);
  if (alt && alt.startsWith('p:')) out.push(`https://images.pokemontcg.io/${alt.slice(2)}${big ? '_hires' : ''}.png`);
  out.push(`https://images.scrydex.com/pokemon/${alt && alt.startsWith('s:') ? alt.slice(2) : d.id}/${big ? 'large' : 'small'}`);
  return out;
}
const toneOf = (d) => (d.kind === 0 ? (d.types || 'C')[0] : d.kind === 2 ? d.provides || 'E' : 'T');
function faceHTML(d) {
  const sub = d.kind === 0 ? `${d.hp} HP` : d.kind === 2 ? 'Energy' : d.trainer === 'supporter' ? 'Supporter' : d.trainer === 'stadium' ? 'Stadium' : d.trainer === 'tool' ? 'Pokémon Tool' : 'Item';
  return `<div class="face"><b>${esc(d.name)}</b><span>${esc(sub)}</span></div>`;
}
function cardHTML(d, opts = {}) {
  const big = !!opts.big;
  return `<div class="card t-${toneOf(d)}${opts.cls ? ' ' + opts.cls : ''}"${opts.attrs || ''}><img src="${esc(srcs(d, big)[0])}" alt="${esc(opts.alt != null ? opts.alt : d.name)}" data-def="${esc(d.id)}" data-big="${big ? 1 : 0}" data-try="0" draggable="false" decoding="async"${opts.lazy ? ' loading="lazy"' : ''}>${faceHTML(d)}</div>`;
}
function cropHTML(d) {
  return `<div class="crop"><img src="${esc(srcs(d, false)[0])}" alt="" data-def="${esc(d.id)}" data-big="0" data-try="0" loading="lazy" decoding="async"></div>`;
}
const backHTML = (cls = '') => `<div class="card back${cls ? ' ' + cls : ''}" aria-hidden="true"></div>`;
// One listener walks each picture down its list of sources; the text face stays if none load.
document.addEventListener('load', (e) => { const img = e.target; if (img.tagName === 'IMG' && img.dataset.def) img.classList.add('on'); }, true);
document.addEventListener('error', (e) => {
  const img = e.target;
  if (img.tagName !== 'IMG' || !img.dataset.def || !DATA.pool) return;
  const d = def(img.dataset.def);
  const list = d ? srcs(d, img.dataset.big === '1') : [];
  const n = +img.dataset.try + 1;
  if (n < list.length) { img.dataset.try = n; img.src = list[n]; } else img.remove();
}, true);
function stageLine(d) {
  if (d.kind === 2) return d.basicEnergy ? `Basic ${TYPES[d.provides]} Energy` : 'Special Energy';
  if (d.kind === 1) return { item: 'Item', supporter: 'Supporter', stadium: 'Stadium', tool: 'Pokémon Tool' }[d.trainer] + (d.ace ? ', ACE SPEC' : '');
  const kind = d.mega ? 'Mega Evolution Pokémon ex' : d.ex ? 'Pokémon ex' : 'Pokémon';
  const st = d.stage === 0 ? 'Basic' : `Stage ${d.stage}`;
  return `${st} ${kind}${d.from ? `, evolves from ${d.from}` : ''}`;
}

/* ============================================================
   3. Decks
   ============================================================ */
const ARCH = { aggro: 'Aggro', midrange: 'Midrange', control: 'Control' };
const PICK_TYPES = ['G', 'R', 'W', 'L', 'P', 'F', 'D', 'M'];
const DECKS = new Map();
function finishDeck(d, extra) {
  const counts = new Map();
  for (const c of d.cards) counts.set(c, (counts.get(c) || 0) + 1);
  const list = [...counts].map(([x, n]) => ({ def: x, n }));
  const sum = (f) => list.filter(({ def: x }) => f(x)).reduce((s, x) => s + x.n, 0);
  const out = Object.assign({}, d, extra, {
    list, size: d.cards.length,
    mons: sum((x) => x.kind === 0), trainers: sum((x) => x.kind === 1), energy: sum((x) => x.kind === 2),
    tone: (d.types && d.types[0]) || 'C',
  });
  DECKS.set(out.key, out);
  return out;
}
function claudeDeck(spec) {
  const key = `c.${spec.id}`;
  if (DECKS.has(key)) return DECKS.get(key);
  const d = A.resolveDeck(DATA.pool, spec);
  return finishDeck(d, { key, by: 'claude' });
}
function genDeck(types, archetype, seed) {
  const key = `g.${types.join('')}.${archetype}.${seed}`;
  if (DECKS.has(key)) return DECKS.get(key);
  const d = A.buildDeck(DATA.pool, { types, archetype, seed });
  const face = def(d.face);
  const blurb = `${listWords(types.map((t) => TYPES[t]))} Pokémon played ${ARCH[archetype].toLowerCase()}, drafted by the generator${face ? ` around ${face.name}` : ''}.`;
  return finishDeck(d, { key, by: 'gen', blurb, seed });
}
function deckByKey(key) {
  if (!key || typeof key !== 'string') return null;
  if (DECKS.has(key)) return DECKS.get(key);
  let m;
  if ((m = /^c\.([a-z0-9-]+)$/.exec(key))) { const spec = window.ARENA_DECKS.find((x) => x.id === m[1]); return spec ? claudeDeck(spec) : null; }
  if ((m = /^g\.([GRWLPFDM]{1,2})\.(aggro|midrange|control)\.(\d{1,10})$/.exec(key))) return genDeck([...m[1]], m[2], +m[3]);
  if (key === 'cr.me' && window.careerMe) return careerMe();
  if ((m = /^cr\.(\d{1,2})$/.exec(key)) && window.careerFoe) return careerFoe(+m[1]);
  if (window.finalsDeck && /^f\./.test(key)) return finalsDeck(key);
  return null;
}
const newSeed = () => (Math.random() * 2 ** 31) >>> 0;
// The engine needs the name, plan and cards; the table also wants the types and the face card for its two halves
const forEngine = (d, name) => ({ name: name || d.name, archetype: d.archetype, cards: d.cards, types: d.types, face: d.face, prizes: d.prizes });
function mirrorSafe(d0, d1) {
  return [forEngine(d0), forEngine(d1, d0.name === d1.name ? `${d1.name} (mirror)` : d1.name)];
}

/* ============================================================
   4. Lobby state and the address bar
   ============================================================ */
const KEY = { seats: 'holo.arena.seats.v1', recent: 'holo.arena.recent.v1', play: 'holo.arena.play.v1', hands: 'holo.arena.hands.v1', speed: 'holo.arena.speed.v1', tut: 'holo.arena.tut.v1', ai: 'holo.arena.ai.v1' };
const S = { view: 'lobby', seats: [null, null], active: 0, src: 'claude', gen: { types: ['R'], arch: 'aggro' }, recent: [], sim: null, ai: store.get(KEY.ai, 'hard') === 'normal' ? 'normal' : 'hard' };
function renderAi() { $$('#aiSeg button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.ai === S.ai))); }
const saveSeats = () => store.set(KEY.seats, S.seats);
function hashFor() {
  if (S.view === 'learn') return '#learn';
  if (S.view === 'decks') return '#decks';
  if (S.view === 'journal') return '#journal';
  if (S.view === 'career') return '#career';
  if (S.view === 'finals') return '#finals';
  if (S.view === 'watch' && TU.on) return `#lesson=${TU.lesson.id}`;
  const p = new URLSearchParams();
  if (S.seats[0]) p.set('a', S.seats[0]);
  if (S.seats[1]) p.set('b', S.seats[1]);
  if (S.view === 'watch' && W.mode === 'play') p.set('play', String(PL.seed));
  else if (S.view === 'watch' && W.seed != null) p.set('seed', String(W.seed));
  return `#${p.toString()}`;
}
function syncHash(push) {
  const next = hashFor();
  if (next === location.hash) return;
  try { history[push ? 'pushState' : 'replaceState'](null, '', next); } catch { /* sandboxed */ }
}
function readHash() {
  const p = new URLSearchParams(location.hash.slice(1));
  const num = (v) => (v != null && /^\d{1,10}$/.test(v) ? +v : null);
  return { a: deckByKey(p.get('a')), b: deckByKey(p.get('b')), seed: num(p.get('seed')), play: num(p.get('play')), learn: p.has('learn'), lesson: p.get('lesson') };
}

/* ============================================================
   5. Lobby
   ============================================================ */
const L = { boot: $('#boot'), body: $('#lobbyBody'), seats: $('#seats'), sim: $('#sim'), pickBody: $('#pickBody'), pickTitle: $('#pickTitle'), pickHint: $('#pickHint') };
const seatName = (i) => `Player ${i + 1}`;
const BY = { claude: 'Designed by Claude', gen: 'Built by the generator', career: 'Victory Road', finals: 'As registered at Worlds' };
function metaHTML(d) {
  return `<div class="deck-meta"><span class="pips">${pipsHTML(d.types.join(''))}</span><span class="arch">${ARCH[d.archetype]}</span><span>${BY[d.by] || ''}</span></div>`;
}
function mixHTML(d) {
  const pct = (n) => (n / d.size) * 100;
  return `<div class="mix t-${d.tone}" role="img" aria-label="${d.mons} Pokémon, ${d.trainers} Trainers, ${d.energy} Energy"><i class="m-p" style="width:${pct(d.mons)}%"></i><i class="m-t" style="width:${pct(d.trainers)}%"></i><i class="m-e" style="width:${pct(d.energy)}%"></i></div>`;
}
function listHTML(d) {
  const groups = [['Pokémon', (x) => x.kind === 0], ['Trainers', (x) => x.kind === 1], ['Energy', (x) => x.kind === 2]];
  const order = (x) => (x.kind === 0 ? x.stage : x.kind === 1 ? ['supporter', 'item', 'tool', 'stadium'].indexOf(x.trainer) : 0);
  return `<div class="decklist">${groups.map(([label, f]) => {
    const rows = d.list.filter(({ def: x }) => f(x)).sort((a, b) => order(a.def) - order(b.def) || b.n - a.n || a.def.name.localeCompare(b.def.name));
    if (!rows.length) return '';
    return `<h4>${label} (${rows.reduce((s, x) => s + x.n, 0)})</h4>${rows.map(({ def: x, n }) => `<div class="row"><span class="n">${n}</span><span class="nm"><button type="button" data-zoom="${esc(x.id)}">${esc(x.name)}</button></span></div>`).join('')}`;
  }).join('')}</div>`;
}
const openLists = new Set();
function renderSeats() {
  const parts = [0, 1].map((i) => {
    const d = deckByKey(S.seats[i]);
    if (!d) return '<div class="seat"></div>';
    const open = openLists.has(i);
    const face = def(d.face);
    return `<div class="seat" data-seat="${i}" data-on="${S.active === i}">`
      + `<div class="seat-art">${face ? cropHTML(face) : ''}<button type="button" class="seat-tag" data-pick="${i}" aria-pressed="${S.active === i}">${seatName(i)}${S.active === i ? ', choosing' : ''}</button></div>`
      + `<div class="seat-body"><h3 class="deck-name">${esc(d.name)}</h3>${metaHTML(d)}<p class="blurb">${esc(d.blurb)}</p>${mixHTML(d)}`
      + `<div class="seat-foot"><button type="button" class="link-btn" data-dv="${esc(d.key)}">See all ${d.size} cards</button><span class="faint">${d.mons} Pokémon, ${d.trainers} Trainers, ${d.energy} Energy</span></div>`
      + `</div></div>`;
  });
  L.seats.innerHTML = `${parts[0]}<span class="vs-big" aria-hidden="true">vs</span>${parts[1]}`;
  L.pickTitle.textContent = `Choose a deck for ${seatName(S.active)}`;
  L.pickHint.textContent = 'Pick a deck below, or select the other seat to change it instead.';
  $$('.tile').forEach(markTile);
}
function tileHTML(d) {
  const face = def(d.face);
  return `<button type="button" class="tile" data-key="${esc(d.key)}"><div class="tile-art">${face ? cropHTML(face) : ''}</div>`
    + `<div class="tile-body"><h3 class="deck-name">${esc(d.name)}</h3>${metaHTML(d).replace(/<span>(Designed by Claude|Built by the generator)<\/span>/, '')}<p class="blurb">${esc(d.blurb)}</p></div></button>`;
}
function markTile(t) {
  const where = [0, 1].filter((i) => S.seats[i] === t.dataset.key);
  let b = t.querySelector('.in-seat');
  if (!where.length) { if (b) b.remove(); return; }
  if (!b) { b = document.createElement('span'); b.className = 'in-seat'; t.appendChild(b); }
  b.textContent = where.length === 2 ? 'Both seats' : seatName(where[0]);
}
function renderPick() {
  $$('#srcSeg button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.src === S.src)));
  if (S.src === 'claude') {
    const ds = window.ARENA_DECKS.map((x) => deckByKey(`c.${x.id}`)).filter(Boolean);
    L.pickBody.innerHTML = `<div class="deck-grid">${ds.map(tileHTML).join('')}</div>`;
  } else {
    const recent = S.recent.map(deckByKey).filter(Boolean);
    const g = S.gen;
    L.pickBody.innerHTML = `<div class="gen">
      <div class="gen-box">
        <h3>Build a deck</h3>
        <p>The generator drafts from all ${nf.format(DATA.pool.list.length)} playable cards: the strongest evolution lines in your types, a stack of Trainers to find and power them, and the right Basic Energy. Every build is different.</p>
        <p class="gen-label" id="genTypesLbl">Types, one or two</p>
        <div class="types" role="group" aria-labelledby="genTypesLbl">${PICK_TYPES.map((t) => `<button type="button" data-t="${t}" aria-pressed="${g.types.includes(t)}" aria-label="${TYPES[t]}">${pipHTML(t)}</button>`).join('')}</div>
        <p class="gen-label" id="genArchLbl">Plan</p>
        <div class="seg" role="group" aria-labelledby="genArchLbl" id="archSeg">${Object.keys(ARCH).map((a) => `<button type="button" data-arch="${a}" aria-pressed="${g.arch === a}">${ARCH[a]}</button>`).join('')}</div>
        <div class="gen-row">
          <button type="button" class="pill pill-solid" id="genGo"${g.types.length ? '' : ' disabled'}>${icon('sparkle')}Build it for ${seatName(S.active)}</button>
          <button type="button" class="pill" id="genRand">${icon('die')}Surprise me</button>
        </div>
      </div>
      <div class="gen-box">
        <h3>Recent builds</h3>
        <p>Your last few generated decks, so a good one isn't lost.</p>
        <div class="recent">${recent.length ? recent.map(tileHTML).join('') : '<p class="empty-note">Nothing yet. Build a deck and it will show up here.</p>'}</div>
      </div>
    </div>`;
  }
  $$('.tile', L.pickBody).forEach(markTile);
}
function setSeat(key) {
  S.seats[S.active] = key;
  if (S.active === 0 && S.seats[1] && !openLists.size) S.active = 1;
  S.sim = null;
  L.sim.hidden = true;
  saveSeats();
  renderSeats();
  syncHash(false);
}
function renderButtons() {
  $('#playBtn').innerHTML = `${icon('play')}<span>Play as Player 1</span>`;
  $('#watchBtn').innerHTML = `${icon('eye')}<span>Watch AI vs AI</span>`;
  $('#simBtn').innerHTML = `${icon('chart')}<span>Simulate 100 games</span>`;
  $('#randBtn').innerHTML = `${icon('die')}<span>Random matchup</span>`;
}
function buildFromPanel(random) {
  let types = S.gen.types.slice(), arch = S.gen.arch;
  if (random || !types.length) {
    const a = PICK_TYPES[Math.floor(Math.random() * 8)];
    types = Math.random() < 0.35 ? [a, PICK_TYPES.filter((t) => t !== a)[Math.floor(Math.random() * 7)]] : [a];
    types.sort((x, y) => PICK_TYPES.indexOf(x) - PICK_TYPES.indexOf(y));
    arch = Object.keys(ARCH)[Math.floor(Math.random() * 3)];
    S.gen = { types, arch };
  }
  const d = genDeck(types, arch, newSeed());
  S.recent = [d.key].concat(S.recent.filter((k) => k !== d.key)).slice(0, 5);
  store.set(KEY.recent, S.recent);
  setSeat(d.key);
  renderPick();
}
function randomMatchup() {
  const ids = window.ARENA_DECKS.map((x) => `c.${x.id}`);
  const a = ids[Math.floor(Math.random() * ids.length)];
  let b = a;
  while (b === a) b = ids[Math.floor(Math.random() * ids.length)];
  S.seats = [a, b];
  S.sim = null;
  L.sim.hidden = true;
  saveSeats();
  renderSeats();
  syncHash(false);
}

/* Batch simulation, in slices so the page stays responsive */
async function simulate() {
  const d0 = deckByKey(S.seats[0]), d1 = deckByKey(S.seats[1]);
  if (!d0 || !d1) return;
  const decks = mirrorSafe(d0, d1);
  const base = newSeed();
  const res = { base, games: [], w: [0, 0], d: 0, turns: 0, names: decks.map((d) => d.name), keys: S.seats.slice() };
  S.sim = res;
  L.sim.hidden = false;
  L.sim.innerHTML = '<div class="sim-head"><h3>Simulating 100 games</h3><span class="sim-sub">Same two decks, a fresh shuffle every game</span></div><div class="progress"><i id="simProg"></i></div>';
  $('#simBtn').disabled = true;
  for (let k = 0; k < 100; k++) {
    if (S.sim !== res) { $('#simBtn').disabled = false; return; }
    const seed = (base + k * 7919) >>> 0;
    const { G } = A.play({ decks, seed, pool: DATA.pool, record: false });
    res.games.push({ seed, winner: G.winner, turns: G.turn, reason: G.reason });
    if (G.winner == null) res.d++; else res.w[G.winner]++;
    res.turns += G.turn;
    if (k % 10 === 9) { const p = $('#simProg'); if (p) p.style.width = `${k + 1}%`; await sleep(0); }
  }
  $('#simBtn').disabled = false;
  if (S.sim === res) renderSim();
}
function renderSim() {
  const r = S.sim;
  if (!r) { L.sim.hidden = true; return; }
  const c = ['var(--p0)', 'var(--p1)'];
  const pct = (n) => Math.round((n / r.games.length) * 100);
  const wins = r.games.filter((g) => g.winner != null);
  const fastest = wins.slice().sort((a, b) => a.turns - b.turns)[0];
  const longest = r.games.slice().sort((a, b) => b.turns - a.turns)[0];
  const leader = r.w[0] === r.w[1] ? null : r.w[0] > r.w[1] ? 0 : 1;
  const avg = (r.turns / r.games.length / 2).toFixed(1);
  const why = (g) => (g.winner == null ? 'a draw' : `${r.names[g.winner]} wins on turn ${g.turns}`);
  L.sim.innerHTML = `<div class="sim-head"><h3>${leader == null ? 'Dead even' : `${esc(r.names[leader])} wins ${r.w[leader]} of 100`}</h3><span class="sim-sub">Games last about ${avg} turns per player</span></div>
    <div class="bar" role="img" aria-label="${esc(r.names[0])} ${r.w[0]} wins, ${esc(r.names[1])} ${r.w[1]} wins, ${r.d} draws">
      <div style="width:${pct(r.w[0])}%;background:${c[0]}">${pct(r.w[0]) >= 12 ? `${pct(r.w[0])}%` : ''}</div>
      ${r.d ? `<div class="bd" style="width:${pct(r.d)}%"></div>` : ''}
      <div style="width:${pct(r.w[1])}%;background:${c[1]}">${pct(r.w[1]) >= 12 ? `${pct(r.w[1])}%` : ''}</div>
    </div>
    <div class="bar-legend"><span><b>${esc(r.names[0])}</b>, ${plural(r.w[0], 'win')}</span>${r.d ? `<span>${plural(r.d, 'draw')}</span>` : ''}<span><b>${esc(r.names[1])}</b>, ${plural(r.w[1], 'win')}</span></div>
    <div class="games" aria-label="Every game. Select one to watch it.">${r.games.map((g, k) => `<button type="button" data-g="${k}" class="${g.winner == null ? 'd' : ''}" style="${g.winner == null ? '' : `background:${c[g.winner]}`}" title="Game ${k + 1}: ${esc(why(g))}" aria-label="Game ${k + 1}, ${esc(why(g))}">${g.turns}</button>`).join('')}</div>
    <div class="sim-notes">
      ${fastest ? `<span>Fastest win: ${esc(r.names[fastest.winner])} on turn ${fastest.turns}. <button type="button" class="link-btn" data-g="${r.games.indexOf(fastest)}">Watch it</button></span>` : ''}
      ${longest ? `<span>Longest game: ${longest.turns} turns. <button type="button" class="link-btn" data-g="${r.games.indexOf(longest)}">Watch it</button></span>` : ''}
      <span>Each square is one game, numbered by how many turns it took.</span>
    </div>`;
}

/* ============================================================
   6. The table: sizes, sides and drawing a frame
   ============================================================ */
const W = { replay: null, seed: null, decks: null, i: 0, playing: false, speed: store.get(KEY.speed, 1), timer: 0, hands: store.get(KEY.hands, true), mode: 'watch', els: new Map(), lastPlayed: -1 };
const T = {
  table: $('#table'), board: $('#board'), sides: [$('#side0'), $('#side1')], mid: $('#mid'), floaters: $('#floaters'), banner: $('#banner'), toast: $('#toast'),
  turnchip: $('#turnchip'), stadium: $('#stadium'), played: $('#played'), log: $('#log'), logpane: $('#logpane'), scrub: $('#scrub'), track: $('#track'),
  trackFill: $('#trackFill'), tlabel: $('#tlabel'), play: $('#cPlay'), hands: $('#cHands'), live: $('#live'),
};
const SPEEDS = [0.5, 1, 2, 4];
const DUR = {
  start: 1300, mulligan: 1100, coin: 1100, turn: 900, draw: 450, bench: 600, evolve: 950, energy: 600, trainer: 1150, tool: 700, ability: 950,
  attack: 900, damage: 1150, heal: 900, ko: 1000, prize: 850, promote: 800, retreat: 800, switch: 750, checkup: 950, cond: 850, effect: 850,
  discard: 650, search: 650, shuffle: 400, move: 700, stadium: 950, prevent: 850, miss: 850, end: 0, ask: 0,
};
const names = () => W.replay.names;
const youName = (i) => names()[i];
// In a game you play, the engine calls your seat "You": its sentences need first-person verbs.
const VERBS = new Set(['attaches', 'draws', 'discards', 'puts', 'uses', 'moves', 'takes', 'shuffles', 'sends', 'searches', 'returns', 'retreats', 'plays', 'picks', 'looks', 'has', 'finds', 'evolves', 'wins', 'goes', 'chooses', 'flips', 'heals', 'switches', 'reveals', 'gets', 'tries', 'does', 'is']);
const baseVerb = (v) => ({ has: 'have', is: 'are', does: 'do', goes: 'go', tries: 'try' }[v] || (/(ch|sh|ss|x|z)es$/.test(v) ? v.slice(0, -2) : v.slice(0, -1)));
function youText(t) {
  if (!t || !/\bYou\b/.test(t)) return t;
  return t.split(/(?<=[.!])\s+/).map((x) => {
    x = x.replace(/^You's\b/, 'Your').replace(/\bYou's\b/g, 'your');
    if (!/^You\b/.test(x) && !/\bYou (?:[a-z]+)\b/.test(x)) return x;
    x = x.replace(/\b(You|and) ([a-z']+)\b/g, (m, w, v) => (VERBS.has(v) ? `${w} ${baseVerb(v)}` : m));
    if (/^You\b/.test(x)) x = x.replace(/\btheir\b/g, 'your').replace(/\bthey\b/g, 'you');
    return x;
  }).join(' ');
}
const say = (text) => (W.mode === 'play' ? youText(text) : text);
// The painted scene at the top of each page (theme.css); a game has the playmat instead
const ART = { lobby: 'arena', decks: 'decks', learn: 'learn', journal: 'journal', career: 'career', finals: 'finals' };
const VIEWS = ['lobby', 'decks', 'learn', 'finals', 'career', 'journal', 'watch'];
const VIEW_EL = { lobby: '#lobby', decks: '#vDecks', learn: '#vLearn', finals: '#vFinals', career: '#vCareer', journal: '#vJournal', watch: '#watch' };
// Where each page was scrolled to, so coming back to a long list finds the same place
const SCROLL = {};
try { history.scrollRestoration = 'manual'; } catch { /* old browsers */ }
function setView(view, push) {
  const was = S.view;
  if (was !== 'watch') SCROLL[was] = window.scrollY;
  S.view = view;
  for (const v of VIEWS) $(VIEW_EL[v]).hidden = v !== view;
  if (ART[view]) document.body.dataset.art = ART[view]; else delete document.body.dataset.art;
  const tab = view === 'learn' || view === 'finals' || (view === 'watch' && !TU.on) ? 'lobby' : view;
  $$('#nav [data-nav]').forEach((a) => { if (a.dataset.nav === tab) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  document.body.classList.toggle('watching', view === 'watch');
  document.body.classList.toggle('in-game', view === 'watch');
  const back = $('#toLobby');
  // Back to where the game came from; the other pages have their tabs
  back.hidden = view !== 'watch';
  back.innerHTML = `${icon('back')}${view === 'watch' && TU.on ? 'Lessons' : { decks: 'Decks', career: 'Career', finals: 'Finals', journal: 'Journal' }[S.backTo] || 'Lobby'}`;
  $('#matchup').hidden = view !== 'watch';
  if (view !== 'watch') { stop(); endPlay(); closeInspector(); closeSheet(); }
  if (view === 'lobby') { renderResume(); renderLearnBtn(); renderSeats(); }
  if (view === 'learn') renderLessons();
  if (view === 'decks') renderLibrary();
  if (view === 'watch') requestAnimationFrame(measure);
  if (was !== view) window.scrollTo(0, view !== 'watch' && SCROLL[view] ? SCROLL[view] : 0);
  syncHash(push);
}
function headerHeight() { document.documentElement.style.setProperty('--hdr', `${$('#top').offsetHeight}px`); }
function matchupHTML() {
  const n = names();
  if (W.mode === 'play' && TU.on) return `<b>${esc(TU.lesson.title)}</b>`;
  if (W.mode === 'play') return `<b>You</b> <span class="muted">(${esc(PL.labels[0])})</span><span class="vs">vs</span><b>${esc(n[1])}</b>`;
  return `<b>${esc(n[0])}</b><span class="vs">vs</span><b>${esc(n[1])}</b>`;
}
// The opponent's hand is small; your own is as big as the room allows.
function measure() {
  if (S.view !== 'watch' || !W.replay) return;
  headerHeight();
  const b = T.board;
  const BW = b.clientWidth - 16, BH = b.clientHeight - 12;
  const gap = BH < 560 ? 4 : 6;
  const showOpp = showHand(1);
  const oppH = showOpp ? 0.6 : 0, chip = showOpp ? 0 : 28;
  const K = 1.396, M = 4, MID = 34, cg = gap * 2.5;
  // tall: Active above the Bench (phones held upright). wide: Active beside the Bench (laptops, tablets on their side).
  const tallH = (BH - 4 * M - MID - chip - 7 * gap) / (K * (2 * 1.25 + 2 + 0.9 + oppH));
  const tallW = (BW - 4 * gap) / 5;
  const tall = Math.min(tallH, tallW, 132);
  const wideH = (BH - 2 * M - MID - chip - 5 * gap) / (K * (2 * 1.25 + 0.9 + oppH));
  const wideW = (BW - 3 - 4 * gap - 4 * cg) / (0.84 + 1.25 + 5 + 0.6);
  const wide = Math.min(wideH, wideW, 150);
  const isWide = wide > tall * 1.08;
  let bw = Math.floor(Math.max(30, isWide ? wide : tall));
  b.classList.toggle('wide', isWide);
  applySizes(bw, gap);
  // one correction pass: measure what the board really used and scale the cards to fill the height
  const fixed = MID + chip + (isWide ? 5 : 7) * gap;
  const used = T.sides[0].offsetHeight + T.sides[1].offsetHeight + T.mid.offsetHeight + 2 * gap;
  if (used > fixed + 20) {
    const k = (BH - fixed) / (used - fixed);
    const cap = isWide ? Math.min(wideW, 150) : Math.min(tallW, 132);
    const next = Math.floor(clamp(bw * k, 30, cap));
    if (Math.abs(next - bw) >= 2) { bw = next; applySizes(bw, gap); }
  }
  layoutHands();
}
function applySizes(bw, gap) {
  const b = T.board;
  const aw = Math.floor(bw * 1.25);
  const st = b.style;
  st.setProperty('--gap', `${gap}px`);
  st.setProperty('--bw', `${bw}px`);
  st.setProperty('--aw', `${aw}px`);
  st.setProperty('--hw', `${Math.floor(bw * 0.9)}px`);
  st.setProperty('--ohw', `${Math.floor(bw * 0.6)}px`);
  st.setProperty('--pw', `${Math.floor(Math.min(aw / 3.1, bw * 0.42))}px`);
  st.setProperty('--pw2', `${Math.floor(Math.min(aw / 2.2, bw * 0.6))}px`);
  st.setProperty('--sw', `${Math.floor(clamp(bw * 0.42, 26, 46))}px`);
}
function layoutHands() {
  for (const p of [0, 1]) {
    const h = T.sides[p].querySelector('.hand');
    if (!h) continue;
    const cards = h.querySelectorAll('.card');
    const n = cards.length;
    if (!n) { h.style.removeProperty('--hov'); continue; }
    const w = cards[0].getBoundingClientRect().width || 40;
    const room = T.board.clientWidth - 24;
    const need = n * (w + 4) - 4;
    h.style.setProperty('--hov', need > room && n > 1 ? `${Math.ceil((need - room) / (n - 1)) - 4}px` : '-4px');
  }
}
function showHand(p) {
  if (W.mode === 'play') return p === 0;
  return W.hands;
}
const TYPE_HEX = { G: '#6dbb5a', R: '#ef6a3e', W: '#4aa3e8', L: '#f5cf3c', P: '#b071d9', F: '#cf7f43', D: '#4f8796', M: '#a7b0b8', Y: '#ec94c6', N: '#c4a43c', C: '#c9c6bb' };
// Each half washes from its deck's first type into its second; a mirror match gives the top half a quieter wash
function deckColors(p) {
  const t = (W.decks[p] && W.decks[p].types) || [];
  const t0 = (W.decks[0] && W.decks[0].types) || [];
  const c = TYPE_HEX[t[0]] || 'var(--violet)';
  if (p === 1 && t[0] && t[0] === t0[0]) return [TYPE_HEX[t[1]] || 'var(--muted)', 'var(--muted)'];
  return [c, TYPE_HEX[t[1]] || c];
}
function buildSides() {
  for (const p of [0, 1]) {
    const el = T.sides[p];
    const [c1, c2] = deckColors(p);
    el.style.setProperty('--pc', c1);
    el.style.setProperty('--pc2', c2);
    const face = W.decks[p] && W.decks[p].face ? def(W.decks[p].face) : null;
    el.innerHTML = `
      <div class="side-art" aria-hidden="true">${face ? `<img src="${esc(srcs(face, false)[0])}" alt="" data-def="${esc(face.id)}" data-big="0" data-try="0" decoding="async">` : ''}</div>
      <div class="hand-zone"><div class="hand" data-zone="hand"></div></div>
      <div class="bench" data-zone="bench"></div>
      <div class="prizes" data-zone="prizes" aria-label="Prize cards"></div>
      <div class="zone-active" data-zone="active"><div class="slot" style="--w:var(--aw)">Active</div></div>
      <div class="piles"><button type="button" class="pile" data-pile="deck" aria-label="Deck"></button><button type="button" class="pile" data-pile="discard" aria-label="Discard pile"></button></div>`;
  }
  W.els.clear();
}
const COND_ICON = { poisoned: 'drop', burned: 'flame', asleep: 'moon', paralyzed: 'bolt', confused: 'swirl' };
function energyHTML(e) {
  const counts = new Map();
  for (const t of e || '') counts.set(t, (counts.get(t) || 0) + 1);
  return [...counts].map(([t, n]) => `${pipHTML(t)}${n > 1 ? `<small>${n}</small>` : ''}`).join('');
}
function monInner(o) {
  const d = def(o.d);
  const left = Math.max(0, o.hp - o.dmg);
  const r = o.hp ? left / o.hp : 0;
  const tool = o.t ? def(o.t) : null;
  return `${cardHTML(d, { alt: '' })}`
    + (o.dmg ? `<span class="dmg" aria-label="${o.dmg} damage">${o.dmg}</span>` : '')
    + (tool ? `<span class="tool" title="${esc(tool.name)}">${icon('tool')}</span>` : '')
    + (o.c && o.c.length ? `<span class="conds">${o.c.map((c) => `<span class="cond ${c}" title="${A.COND_WORD[c]}">${icon(COND_ICON[c])}</span>`).join('')}</span>` : '')
    + `<div class="meta"><span class="en">${energyHTML(o.e)}</span><span class="hpn">${left}</span><div class="hpbar"><i class="${r <= 0.34 ? 'low' : r <= 0.6 ? 'mid' : ''}" style="width:${(r * 100).toFixed(1)}%"></i></div></div>`;
}
function monLabel(o, p) {
  const d = def(o.d);
  const bits = [`${d.name}, ${Math.max(0, o.hp - o.dmg)} of ${o.hp} HP`];
  if (o.e) bits.push(`${o.e.length} Energy`);
  if (o.c && o.c.length) bits.push(o.c.map((c) => A.COND_WORD[c]).join(', '));
  return `${p === 0 && W.mode === 'play' ? 'Your' : `${names()[p]}'s`} ${bits.join(', ')}`;
}
function monEl(o, p) {
  const key = `m${o.id}`;
  let el = W.els.get(key);
  const sig = JSON.stringify([o.d, o.hp, o.dmg, o.e, o.t, o.c]);
  if (!el) {
    el = document.createElement('button');
    el.type = 'button';
    el.className = 'mon cardbtn';
    el.dataset.mon = o.id;
    W.els.set(key, el);
  }
  if (el.dataset.sig !== sig) {
    const oldDef = el.dataset.def;
    if (oldDef !== o.d || !el.firstChild) el.innerHTML = monInner(o);
    else {
      // keep the picture, redraw the rest
      const card = el.querySelector('.card');
      el.innerHTML = monInner(o);
      el.replaceChild(card, el.querySelector('.card'));
    }
    el.dataset.def = o.d;
    el.dataset.sig = sig;
  }
  el.classList.remove('rot-asleep', 'rot-paralyzed', 'rot-confused');
  const rot = (o.c || []).find((c) => c === 'asleep' || c === 'paralyzed' || c === 'confused');
  if (rot) el.classList.add(`rot-${rot}`);
  el.setAttribute('aria-label', monLabel(o, p));
  el.dataset.p = p;
  return el;
}
function handEl(id, defId, faceUp) {
  const key = `${faceUp ? 'h' : 'b'}${id}`;
  let el = W.els.get(key);
  if (!el) {
    if (faceUp) {
      const d = def(defId);
      const w = document.createElement('div');
      w.innerHTML = cardHTML(d, { attrs: ` role="button" tabindex="0" data-card="${id}" aria-label="${esc(d.name)}"` });
      el = w.firstChild;
    } else {
      el = document.createElement('div');
      el.className = 'card back';
      el.setAttribute('aria-hidden', 'true');
    }
    W.els.set(key, el);
  }
  return el;
}
function place(container, nodes) {
  const want = new Set(nodes);
  for (const c of Array.from(container.children)) if (!want.has(c)) c.remove();
  nodes.forEach((n, k) => { if (container.children[k] !== n) container.insertBefore(n, container.children[k] || null); });
}
function renderSide(p, ps, f) {
  const side = T.sides[p];
  // hand
  const hand = side.querySelector('.hand');
  const up = showHand(p);
  hand.classList.toggle('backs', !up);
  const hcards = ps.hand.map(([id, d]) => handEl(id, d, up));
  place(hand, hcards);
  let chip = side.querySelector('.hand-chip');
  if (!up) {
    if (!chip) { chip = document.createElement('span'); chip.className = 'hand-chip'; side.querySelector('.hand-zone').appendChild(chip); }
    chip.textContent = `${plural(ps.hand.length, 'card')} in hand`;
    hand.hidden = true;
  } else { if (chip) chip.remove(); hand.hidden = false; }
  // active
  const act = side.querySelector('[data-zone="active"]');
  let slot = W.els.get(`aslot${p}`);
  if (!slot) { slot = act.querySelector('.slot'); W.els.set(`aslot${p}`, slot); }
  place(act, [ps.active ? monEl(ps.active, p) : slot]);
  // bench: fixed slots, filled in order
  const bench = side.querySelector('[data-zone="bench"]');
  const kids = ps.bench.map((o) => monEl(o, p));
  const slots = [];
  for (let k = 0; k < 5; k++) slots.push(kids[k] || W.els.get(`slot${p}${k}`) || (() => { const s = document.createElement('div'); s.className = 'slot'; W.els.set(`slot${p}${k}`, s); return s; })());
  place(bench, slots);
  // prizes: the ones left are face down; the gaps show what has been taken
  const pz = side.querySelector('[data-zone="prizes"]');
  const left = ps.prizes, total = Math.max(6, left + (ps.taken || 0));
  if (pz.dataset.n !== `${left}/${total}`) {
    pz.innerHTML = Array.from({ length: total }, (_, k) => (k < left ? '<div class="pz back"></div>' : '<div class="pz gone"></div>')).join('');
    pz.dataset.n = `${left}/${total}`;
    pz.setAttribute('aria-label', `${plural(left, 'Prize card')} left`);
  }
  // piles
  const deck = side.querySelector('[data-pile="deck"]');
  const dsig = String(ps.deck);
  if (deck.dataset.sig !== dsig) {
    deck.dataset.sig = dsig;
    deck.classList.toggle('empty', !ps.deck);
    deck.innerHTML = `${ps.deck ? backHTML() : ''}<span class="count">${ps.deck}</span>`;
    deck.setAttribute('aria-label', `Deck, ${plural(ps.deck, 'card')}`);
  }
  const dis = side.querySelector('[data-pile="discard"]');
  const topCard = ps.dtop && ps.dtop.length ? ps.dtop[ps.dtop.length - 1] : null;
  const ssig = `${ps.discard}/${topCard ? topCard[1] : ''}`;
  if (dis.dataset.sig !== ssig) {
    dis.dataset.sig = ssig;
    dis.classList.toggle('empty', !ps.discard);
    dis.innerHTML = `${topCard ? cardHTML(def(topCard[1]), { alt: '' }) : ''}<span class="count">${ps.discard}</span>`;
    dis.setAttribute('aria-label', `Discard pile, ${plural(ps.discard, 'card')}`);
  }
  dis.dataset.p = p;
  deck.dataset.p = p;
}
function renderMid(f) {
  const s = f.s;
  const who = f.k === 'start' || f.turn === 0 ? null : s.active;
  T.sides.forEach((el, p) => el.classList.toggle('now', who === p));
  T.turnchip.className = `turnchip${who === 1 ? ' p1' : ''}`;
  T.turnchip.innerHTML = f.turn === 0 || s.turn === 0 ? 'Setup' : `Turn ${s.turn}<span class="who">${esc(who === 0 && W.mode === 'play' ? 'you' : names()[who])}</span>`;
  // Stadium
  const sig = s.stadium ? s.stadium.join('/') : '';
  if (T.stadium.dataset.sig !== sig) {
    T.stadium.dataset.sig = sig;
    T.stadium.innerHTML = s.stadium ? `<span class="lbl">${esc(def(s.stadium[1]).name)}</span><button type="button" class="cardbtn" data-stadium="1" aria-label="Stadium: ${esc(def(s.stadium[1]).name)}">${cardHTML(def(s.stadium[1]), { alt: '' })}</button>` : '';
  }
}
// What changed since the previous frame gets a short effect.
function effects(f, prev) {
  if (reduceMotion.matches) return;
  const posOf = (id) => {
    const el = W.els.get(`m${id}`);
    if (!el || !el.isConnected) return null;
    const r = el.querySelector('.card').getBoundingClientRect(), b = T.board.getBoundingClientRect();
    return { x: r.left - b.left + r.width / 2, y: r.top - b.top + r.height * 0.42 };
  };
  const float = (id, text, cls) => {
    const p = posOf(id);
    if (!p) return;
    const n = document.createElement('div');
    n.className = `float${cls ? ' ' + cls : ''}`;
    n.textContent = text;
    n.style.left = `${p.x}px`; n.style.top = `${p.y}px`;
    n.style.animationDuration = `${Math.max(700, 1250 / W.speed)}ms`;
    T.floaters.appendChild(n);
    setTimeout(() => n.remove(), 1900);
  };
  const pulse = (id, cls, ms = 700) => {
    const el = W.els.get(`m${id}`);
    if (!el) return;
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
    setTimeout(() => el.classList.remove(cls), ms);
  };
  for (const [id, n] of f.hits || []) { float(id, String(n)); pulse(id, 'shake', 500); }
  for (const [id, n] of f.heals || []) float(id, `+${n}`, 'heal');
  if (f.k === 'attack' && f.hl) { for (const id of f.hl) { pulse(id, 'lunge', 600); float(id, f.atk || 'Attack', 'word'); } }
  if (f.k === 'coin') coinToast(f);
}
function coinToast(f) {
  const coins = f.coins || (f.coin ? [f.coin] : []);
  if (!coins.length) return;
  $$('.coin', T.board).forEach((x) => x.remove());
  const el = document.createElement('div');
  el.className = 'coin';
  const shown = coins.slice(0, 8);
  el.innerHTML = `${shown.map((c) => `<i class="${c}">${c === 'heads' ? 'H' : 'T'}</i>`).join('')}<span>${coins.length > 1 ? `${coins.filter((c) => c === 'heads').length} of ${coins.length} heads` : c0(coins[0])}</span>`;
  T.board.appendChild(el);
  setTimeout(() => el.remove(), Math.max(900, 1500 / W.speed));
}
const c0 = (c) => (c === 'heads' ? 'Heads' : 'Tails');
function showPlayed(f) {
  if (!f.card || (f.k !== 'trainer' && f.k !== 'stadium')) return;
  const d = def(f.card[1]);
  T.played.innerHTML = `${cardHTML(d, { alt: '' })}<span class="lbl">${esc(f.who === 0 && W.mode === 'play' ? 'You play' : `${names()[f.who]} plays`)} ${esc(d.name)}</span>`;
  T.played.classList.remove('fade');
  clearTimeout(T.played._t);
  T.played._t = setTimeout(() => T.played.classList.add('fade'), Math.max(1400, 2600 / W.speed));
}
function render(i, animate = true) {
  if (!W.replay) return;
  const frames = W.replay.frames;
  i = clamp(i, 0, frames.length - 1);
  const prev = W.i;
  W.i = i;
  const f = frames[i];
  // FLIP: remember where every card was, move them, then glide from there
  const first = new Map();
  const anim = animate && !reduceMotion.matches && Math.abs(i - prev) <= 2;
  if (anim) for (const [k, el] of W.els) if (el.isConnected && !k.includes('slot')) first.set(k, el.getBoundingClientRect());
  renderSide(0, f.s.p[0], f);
  renderSide(1, f.s.p[1], f);
  renderMid(f);
  layoutHands();
  // highlights
  for (const [k, el] of W.els) if (k[0] === 'm') el.classList.remove('hl', 'ko', 'target');
  for (const id of f.hl || []) { const el = W.els.get(`m${id}`); if (el) el.classList.add(f.k === 'damage' ? 'target' : 'hl'); }
  if (f.ko != null) { const el = W.els.get(`m${f.ko}`); if (el) el.classList.add('ko'); }
  if (anim) {
    for (const [k, el] of W.els) {
      const a = first.get(k);
      if (!a || !el.isConnected) continue;
      const b = el.getBoundingClientRect();
      const dx = a.left - b.left, dy = a.top - b.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
      const sx = a.width / (b.width || 1);
      el.animate([{ transform: `translate(${dx}px, ${dy}px) scale(${sx})`, transformOrigin: 'top left' }, { transform: 'none', transformOrigin: 'top left' }],
        { duration: Math.max(220, 480 / W.speed), easing: 'cubic-bezier(.2,.75,.15,1)' });
    }
  }
  if (animate && i === prev + 1) { effects(f, frames[prev]); showPlayed(f); }
  else if (!animate || Math.abs(i - prev) > 1) { T.played.classList.add('fade'); }
  // banner at the end
  if (f.k === 'end' && W.mode === 'watch') showBanner();
  else if (W.mode === 'watch') T.banner.hidden = true;
  updateTimeline();
  markLog(i);
  if (f.text && animate) T.live.textContent = say(f.text);
  if (W.mode === 'play') decorate();
}

/* ---------- Log, timeline and controls ---------- */
function buildLog() {
  const frames = W.replay.frames;
  let html = '', turn = -1;
  frames.forEach((f, i) => {
    if (!f.text || f.k === 'ask') return;
    const t = f.k === 'start' && f.turn === 0 ? 0 : f.turn;
    if (t !== turn) {
      turn = t;
      html += t === 0 ? '<h3>Setup</h3>' : `<h3>Turn ${t}, <span class="p${f.s.active}">${esc(youName(f.s.active))}</span></h3>`;
    }
    if (f.k === 'turn') return;
    const big = f.k === 'attack' || f.k === 'ko' || f.k === 'prize' || f.k === 'end' || f.k === 'evolve';
    html += `<button type="button" data-i="${i}" class="${f.who != null && f.k !== 'end' ? `p${f.who}` : ''}${big ? ' big' : ''}">${esc(say(f.text))}</button>`;
  });
  T.log.innerHTML = html;
  W.logBtns = new Map($$('button[data-i]', T.log).map((b) => [+b.dataset.i, b]));
}
function markLog(i) {
  if (!W.logBtns) return;
  let now = null;
  for (const [k, b] of W.logBtns) {
    b.classList.toggle('future', k > i);
    b.classList.remove('now');
    if (k <= i) now = b;
  }
  if (now) {
    now.classList.add('now');
    if (T.logpane.offsetParent !== null || getComputedStyle(T.logpane).position !== 'absolute') {
      const r = now.getBoundingClientRect(), L2 = T.log.getBoundingClientRect();
      if (r.top < L2.top + 30 || r.bottom > L2.bottom - 10) T.log.scrollTop += r.top - L2.top - L2.height / 2;
    }
  }
}
function updateTimeline() {
  const frames = W.replay.frames, n = frames.length - 1;
  T.scrub.max = String(n);
  T.scrub.value = String(W.i);
  T.trackFill.style.width = `${n ? (W.i / n) * 100 : 0}%`;
  const f = frames[W.i];
  const turns = W.replay.turns;
  T.tlabel.innerHTML = W.mode === 'play' ? (f.turn ? `Turn ${f.turn}` : 'Setup') : f.turn ? `Turn ${f.turn}<span class="hide-s"> of ${turns}</span>` : 'Setup';
  T.scrub.setAttribute('aria-valuetext', W.mode === 'play' || !f.turn ? T.tlabel.textContent : `Turn ${f.turn} of ${turns}`);
}
function buildTicks() {
  T.track.querySelectorAll('.tick').forEach((t) => t.remove());
  const frames = W.replay.frames, n = frames.length - 1;
  if (!n) return;
  frames.forEach((f, i) => { if (f.k === 'turn') { const t = document.createElement('i'); t.className = 'tick'; t.style.left = `${(i / n) * 100}%`; T.track.appendChild(t); } });
}
function frameDur(f) { return (DUR[f.k] != null ? DUR[f.k] : 800) / W.speed; }
function play() {
  if (!W.replay) return;
  if (W.i >= W.replay.frames.length - 1) render(0, false);
  W.playing = true;
  setPlayIcon();
  clearTimeout(W.timer);
  W.timer = setTimeout(tick, 350);
}
function tick() {
  if (!W.playing) return;
  if (W.i >= W.replay.frames.length - 1) { stop(); return; }
  render(W.i + 1, true);
  W.timer = setTimeout(tick, frameDur(W.replay.frames[W.i]));
}
function stop() { W.playing = false; clearTimeout(W.timer); setPlayIcon(); }
function setPlayIcon() { T.play.innerHTML = icon(W.playing ? 'pause' : 'play'); T.play.setAttribute('aria-label', W.playing ? 'Pause' : 'Play'); }
function step(d) { stop(); render(W.i + d, true); }
function jumpTurn(d) {
  stop();
  const frames = W.replay.frames;
  let i = W.i + d;
  while (i > 0 && i < frames.length - 1 && frames[i].k !== 'turn') i += d;
  render(i, false);
}
function setSpeed(v) {
  W.speed = v;
  store.set(KEY.speed, v);
  $$('#speedSeg button').forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.speed === v)));
  $('#speedOne').textContent = `${v}x`;
}
function openLog() { T.logpane.classList.add('open'); }
function closeLog() { T.logpane.classList.remove('open'); }
function showBanner() {
  const r = W.replay;
  const crk = W.mode === 'play' && PL.career != null ? PL.career : null;
  const crSt = crk != null ? CAR.STAGES[crk] : null;
  let title = r.winner == null ? 'A draw' : W.mode === 'play' ? (r.winner === 0 ? 'You win' : 'You lose') : `${r.names[r.winner]} wins`;
  if (crSt) title = r.winner === 0 ? (crSt.boss ? CAR.JOURNEY.doneTitle : `${crSt.who} beaten`) : 'Not this time';
  if (W.mode === 'play' && PL.fin && window.finalsBannerTitle) title = finalsBannerTitle(r) || title;
  let acts = '';
  if (crSt) {
    acts = r.winner === 0
      ? (crSt.boss ? '<button type="button" class="pill pill-solid" data-b="career">Finish the journey</button>'
        : '<button type="button" class="pill pill-solid" data-b="crreward">Choose your reward</button><button type="button" class="pill" data-b="career">Back to the road</button>')
      : '<button type="button" class="pill pill-solid" data-b="crretry">Try again</button><button type="button" class="pill" data-b="career">Back to the road</button>';
  } else if (W.mode === 'play' && PL.fin) {
    acts = '<button type="button" class="pill pill-solid" data-b="finretry">Play it again</button><button type="button" class="pill" data-b="toReplay">Watch the replay</button><button type="button" class="pill" data-b="finals">Back to the finals</button>';
  } else if (TU.on) {
    acts = r.winner === 0
      ? `${TU.next ? '<button type="button" class="pill pill-solid" data-b="nextLesson">Next lesson</button>' : ''}<button type="button" class="pill" data-b="lessons">All lessons</button>`
      : '<button type="button" class="pill pill-solid" data-b="retryLesson">Try again</button><button type="button" class="pill" data-b="lessons">All lessons</button>';
  } else if (W.mode === 'play') {
    acts = '<button type="button" class="pill pill-solid" data-b="rematch">Play again</button><button type="button" class="pill" data-b="toReplay">Watch the replay</button><button type="button" class="pill" data-b="lobby">Lobby</button>';
  } else {
    acts = '<button type="button" class="pill pill-solid" data-b="again">Watch again</button><button type="button" class="pill" data-b="newGame">New game</button><button type="button" class="pill" data-b="lobby">Lobby</button>';
  }
  const sub = TU.on && r.winner === 0 ? esc(TU.lesson.outro || say(r.reason)) : esc(say(r.reason));
  const seal = r.winner == null ? 'draw' : W.mode === 'play' && r.winner !== 0 ? 'lost' : 'won';
  const st = r.stats;
  const row = (label, k) => `<tr><td>${label}</td><td>${nf.format(st[0][k])}</td><td>${nf.format(st[1][k])}</td></tr>`;
  const table = st && !TU.on ? `<table class="stats"><thead><tr><th></th><th>${esc(W.mode === 'play' ? 'You' : r.names[0])}</th><th>${esc(r.names[1])}</th></tr></thead><tbody>`
    + `${row('Prize cards taken', 'taken')}${row('Damage dealt', 'damage')}${row('Knocked Out', 'kos')}${row('Biggest hit', 'best')}${row('Trainers played', 'trainers')}${row('Energy attached', 'energy')}</tbody></table>` : '';
  T.banner.innerHTML = `<img class="medal seal" src="../img/${seal}.webp" alt="" width="96" height="96"><h2>${esc(TU.on && r.winner === 0 ? 'Lesson complete' : title)}</h2><p>${sub}</p>`
    + `<span class="ornament center" aria-hidden="true"></span>${table}<div class="acts">${acts}</div>`;
  T.banner.hidden = false;
}

/* ---------- Watching a game ---------- */
function replayOf(G, decks) {
  const stats = G.players.map((P) => Object.assign({ taken: P.taken || 0, left: P.prizes.length }, P.stats));
  return { frames: G.frames, names: decks.map((d) => d.name), winner: G.winner, reason: G.reason, why: G.why, turns: G.turn, first: G.first, stats };
}
function watch(seed, opts = {}) {
  const d0 = deckByKey(S.seats[0]), d1 = deckByKey(S.seats[1]);
  if (!d0 || !d1) return;
  stop();
  endPlay();
  const decks = mirrorSafe(d0, d1);
  const { G } = A.play({ decks, seed, pool: DATA.pool, record: true });
  W.mode = 'watch';
  W.seed = seed;
  W.decks = decks;
  W.replay = replayOf(G, decks);
  T.table.classList.remove('playing');
  enterTable();
  setView('watch', !opts.replace);
  render(0, false);
  if (opts.autoplay !== false) play();
}
function enterTable() {
  buildSides();
  buildLog();
  buildTicks();
  $('#matchup').innerHTML = matchupHTML();
  T.banner.hidden = true;
  T.played.classList.add('fade');
  W.i = 0;
  requestAnimationFrame(measure);
}

/* ============================================================
   6b. Deck view: every card in a deck, its plan, and its numbers
   ============================================================ */
const DV = { key: null, from: null, ctx: 'lobby', set: null, mode: store.get('holo.arena.dvmode.v1', 'pics') === 'list' ? 'list' : 'pics' };
const TRAINER_ORDER = ['supporter', 'item', 'tool', 'stadium'];
const cardOrder = (x) => (x.kind === 0 ? x.stage : x.kind === 1 ? TRAINER_ORDER.indexOf(x.trainer) : 0);
function deckGroups(d) {
  return [['Pokémon', (x) => x.kind === 0], ['Trainers', (x) => x.kind === 1], ['Energy', (x) => x.kind === 2]]
    .map(([label, f]) => [label, d.list.filter(({ def: x }) => f(x)).sort((a, b) => cardOrder(a.def) - cardOrder(b.def) || b.n - a.n || a.def.name.localeCompare(b.def.name))])
    .filter(([, rows]) => rows.length);
}
function deckStats(d) {
  const count = (f) => d.list.filter(({ def: x }) => f(x)).reduce((t, x) => t + x.n, 0);
  const energy = {};
  for (const { def: x, n } of d.list) if (x.kind === 2) energy[x.provides || 'C'] = (energy[x.provides || 'C'] || 0) + n;
  return {
    basic: count((x) => x.kind === 0 && x.stage === 0), s1: count((x) => x.kind === 0 && x.stage === 1), s2: count((x) => x.kind === 0 && x.stage === 2),
    ex: count((x) => x.kind === 0 && x.ex), supporter: count((x) => x.trainer === 'supporter'), item: count((x) => x.trainer === 'item'),
    tool: count((x) => x.trainer === 'tool'), stadium: count((x) => x.trainer === 'stadium'), energy,
  };
}
// The list as Pokémon TCG Live reads it: a section per kind, then count, name, set code and number
function deckText(d) {
  return deckGroups(d).map(([label, rows]) => `${label === 'Trainers' ? 'Trainer' : label}: ${rows.reduce((t, x) => t + x.n, 0)}\n${rows.map(({ def: x, n }) => `${n} ${x.name}${x.set ? ` ${x.set} ${x.num}` : ''}`).join('\n')}`).join('\n\n') + '\n';
}
// The cards that make a deck work: its notes say which; otherwise its biggest Pokémon
function keyCards(d) {
  const inDeck = (name) => (d.list.find(({ def: x }) => x.name === name) || {}).def || (DATA.pool.byName.get(name) || [])[0];
  if (d.keys) return d.keys.map(inDeck).filter(Boolean);
  return d.list.map((x) => x.def).filter((x) => x.kind === 0).sort((a, b) => b.stage - a.stage || (b.ex ? 1 : 0) - (a.ex ? 1 : 0) || b.hp - a.hp).slice(0, 4);
}
function statHTML(n, label) { return `<div class="dv-stat"><b>${nf.format(n)}</b><span>${label}</span></div>`; }
function dvFootHTML(d, key) {
  if (d && d.fin && (DV.ctx === 'finals' || DV.ctx === 'library')) {
    const x = FIN.byId.get(d.fin.id);
    return `<button type="button" class="pill pill-solid" data-dvplay="play"${d.playable ? '' : ' disabled'}>${icon('swords')}Play as ${esc(FIN.surname(x.d.player))}</button>`;
  }
  if (DV.ctx === 'career' || DV.ctx === 'finals') return '';
  if (DV.ctx === 'library') return `<button type="button" class="pill" data-dvplay="setup">Set up a match</button><button type="button" class="pill pill-solid" data-dvplay="play">${icon('play')}Play vs AI</button>`;
  return [0, 1].map((i) => (S.seats[i] === key
    ? `<button type="button" class="pill" disabled>${icon('check')}${seatName(i)}'s deck</button>`
    : `<button type="button" class="pill${i === S.active ? ' pill-solid' : ''}" data-dvseat="${i}">Use for ${seatName(i)}</button>`)).join('');
}
// The decks you can page through from the open one: the rest of the list it was opened from
function deckSet(src) {
  if (!src || !src.isConnected) return null;
  const tile = src.closest('[data-lib], .tile[data-key]');
  const list = tile && tile.closest('#libBody, .deck-grid, .recent');
  if (!list) return null;
  const items = $$('[data-lib], .tile[data-key]', list).filter((t) => t.getClientRects().length > 0);
  const i = items.indexOf(tile);
  if (i < 0 || items.length < 2) return null;
  const grp = tile.closest('.lib-group');
  return { items, i, label: grp ? grp.querySelector('h2').firstChild.textContent : '' };
}
function openDeckView(key, from, ctx) {
  const d = deckByKey(key);
  if (!d) return;
  const box = $('#deckView');
  const was = !box.hidden;
  DV.key = key;
  DV.ctx = ctx || 'lobby';
  DV.from = from || document.activeElement;
  const ds = DV.set = deckSet(DV.from);
  const keys = keyCards(d);
  const st = deckStats(d);
  const face = def(d.face);
  const eTypes = Object.keys(st.energy);
  const maxE = Math.max(1, ...Object.values(st.energy));
  const nav = ds ? `<div class="dv-nav"><button type="button" class="icon-btn" data-dvpage="-1" aria-label="Previous deck"${ds.i <= 0 ? ' disabled' : ''}>${icon('prev')}</button>`
    + `<span class="dv-pos"><b>${ds.i + 1}</b> of ${ds.items.length}${ds.label ? ` · ${esc(ds.label)}` : ''}</span>`
    + `<button type="button" class="icon-btn" data-dvpage="1" aria-label="Next deck"${ds.i >= ds.items.length - 1 ? ' disabled' : ''}>${icon('next')}</button></div>` : '';
  const html = `<div class="dv-box">
    <div class="dv-hero">${face ? cropHTML(face).replace('<div class="crop">', '<div class="crop dv-crop">') : ''}${nav}<button type="button" class="icon-btn dv-x" data-dvclose aria-label="Close">${icon('x')}</button></div>
    <div class="dv-head"><h2 class="deck-name" id="dvName">${esc(d.name)}</h2>${metaHTML(d)}</div>
    <div class="dv-plan"><h4>${d.by === 'gen' ? 'How it was built' : 'Strategy'}</h4><p>${esc(d.plan || d.blurb)}</p>
      ${keys.length ? `<h4 class="dv-keys-h">Key cards</h4><div class="dv-keys">${keys.map((k) => `<button type="button" class="chip" data-zoom="${esc(k.id)}">${esc(k.name)}</button>`).join('')}</div>` : ''}</div>
    <div class="dv-stats">${statHTML(d.mons, 'Pokémon')}${statHTML(d.trainers, 'Trainers')}${statHTML(d.energy, 'Energy')}${statHTML(st.basic, 'Basic Pokémon')}${st.s1 || st.s2 ? statHTML(st.s1 + st.s2, 'Evolutions') : ''}${statHTML(st.ex, 'Pokémon ex')}</div>
    <div class="dv-charts">
      <div class="dv-chart"><h4>Trainers by kind</h4><div class="dv-bars">${[['Supporters', st.supporter], ['Items', st.item], ['Tools', st.tool], ['Stadiums', st.stadium]].filter(([, n]) => n).map(([l, n]) => `<div class="dv-bar-row"><span>${l}</span><i class="bar" style="width:${Math.round((n / Math.max(1, d.trainers)) * 100)}%"></i><b>${n}</b></div>`).join('')}</div></div>
      <div class="dv-chart"><h4>Energy by type</h4><div class="dv-bars">${eTypes.length ? eTypes.map((t) => `<div class="dv-bar-row ty t-${t}">${pipHTML(t)}<i class="bar" style="width:${Math.round((st.energy[t] / maxE) * 100)}%"></i><b>${st.energy[t]}</b></div>`).join('') : '<p class="empty-note">No Energy cards.</p>'}</div></div>
    </div>
    <div class="dv-tools">
      <div class="seg" role="group" aria-label="Show the cards as" id="dvMode"><button type="button" data-dvmode="pics" aria-pressed="${DV.mode === 'pics'}">${icon('grid')}Pictures</button><button type="button" data-dvmode="list" aria-pressed="${DV.mode === 'list'}">${icon('list')}List</button></div>
      <button type="button" class="ghost" data-dvcopy>${icon('copy')}Copy the list</button>
    </div>
    <div class="dv-cards" id="dvCards"></div>
    <div class="dv-foot">${dvFootHTML(d, key)}</div>
  </div>`;
  // Turning to another deck changes the box; the scrim behind it stays
  if (was) box.querySelector('.dv-box').outerHTML = html;
  else box.innerHTML = `<div class="dv-scrim" data-dvclose></div>${html}`;
  renderDeckCards(d);
  box.hidden = false;
  box.querySelector('.dv-box').scrollTop = 0;
  box.querySelector('.dv-x').focus({ preventScroll: true });
  if (!was && window.UI) UI.overlay.open('dv', () => closeDeckView(true));
}
function renderDeckCards(d) {
  const host = $('#dvCards');
  if (!host) return;
  $$('#dvMode button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.dvmode === DV.mode)));
  if (DV.mode === 'list') { host.innerHTML = listHTML(d); return; }
  host.innerHTML = deckGroups(d).map(([label, rows]) => `<section class="dv-group"><h3>${label}<span>${rows.reduce((t, x) => t + x.n, 0)}</span></h3><div class="dv-grid">${rows.map(({ def: x, n }) => `<button type="button" class="dv-cell cardbtn" data-zoom="${esc(x.id)}" aria-label="${esc(`${n > 1 ? `${n} copies of ` : ''}${x.name}. Open it to read it.`)}">${cardHTML(x, { alt: '', lazy: true })}${n > 1 ? `<span class="dv-n" aria-hidden="true">×${n}</span>` : ''}</button>`).join('')}</div></section>`).join('');
}
// Turn to the deck before or after the open one
function pageDeck(dir) {
  const ds = DV.set;
  if (!ds) return;
  const to = ds.i + dir;
  const boxEl = $('#deckView .dv-box');
  if (to < 0 || to >= ds.items.length || !ds.items[to].isConnected) { if (window.UI) UI.slide(boxEl, dir, true); return; }
  const t = ds.items[to];
  t.scrollIntoView({ block: 'nearest' });
  openDeckView(t.dataset.lib || t.dataset.key, t, DV.ctx);
  if (window.UI) UI.slide($('#deckView .dv-box'), dir);
}
function closeDeckView(viaHistory) {
  const box = $('#deckView');
  if (box.hidden) return;
  box.hidden = true;
  box.innerHTML = '';
  DV.set = null;
  if (viaHistory !== true && window.UI) UI.overlay.closed('dv');
  if (DV.from && DV.from.isConnected) DV.from.focus({ preventScroll: true });
}
async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch {
    const t = document.createElement('textarea');
    t.value = text; t.style.position = 'fixed'; t.style.opacity = '0';
    document.body.appendChild(t); t.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    t.remove();
    return ok;
  }
}
function pageToast(text) {
  let t = $('#pageToast');
  if (!t) { t = document.createElement('div'); t.id = 'pageToast'; t.className = 'page-toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
  t.textContent = text;
  t.hidden = false;
  clearTimeout(t._h);
  t._h = setTimeout(() => { t.hidden = true; }, 2200);
}

/* ============================================================
   6c. Decks: every deck, with its plan, to read and play
   ============================================================ */
const LIB = Object.assign({ src: 'all', q: '', arch: 'all', types: [] }, store.get('holo.arena.lib.v1', {}));
const LIB_TYPES = ['G', 'R', 'W', 'L', 'P', 'F', 'D', 'M', 'N'];
const libSave = () => store.set('holo.arena.lib.v1', { src: LIB.src, arch: LIB.arch, types: LIB.types });
// Every deck in the library: Claude's, and any others the page knows (the Famous Finals decks)
function libEntries() {
  const out = [];
  for (const spec of window.ARENA_DECKS) { const d = deckByKey(`c.${spec.id}`); if (d) out.push({ d, src: 'claude', group: "Claude's decks" }); }
  for (const e of (window.libExtra ? window.libExtra() : [])) out.push(e);
  return out.map((e) => Object.assign(e, { hay: `${e.d.name}\n${e.d.plan || e.d.blurb || ''}\n${e.d.list.map((x) => x.def.name).join('\n')}`.toLowerCase() }));
}
function libFilter(entries) {
  const q = LIB.q.trim().toLowerCase();
  return entries.filter((e) => (LIB.src === 'all' || e.src === LIB.src)
    && (LIB.arch === 'all' || e.d.archetype === LIB.arch)
    && LIB.types.every((t) => (e.d.types || []).includes(t))
    && (!q || q.split(/\s+/).every((w) => e.hay.includes(w))));
}
function libTileHTML(e) {
  const d = e.d, face = def(d.face);
  const keys = keyCards(d).slice(0, 3);
  return `<div class="lib-tile tile" data-lib="${esc(d.key)}" role="button" tabindex="0" aria-label="${esc(d.name)}: open the deck">`
    + `<div class="tile-art">${face ? cropHTML(face) : ''}</div>`
    + `<div class="tile-body"><h3 class="deck-name">${esc(d.name)}</h3>${metaHTML(d)}<p class="blurb">${esc(d.blurb)}</p>`
    + `${keys.length ? `<div class="lib-keys">${keys.map((k) => `<span class="lib-key">${esc(k.name)}</span>`).join('')}</div>` : ''}`
    + `<div class="lib-acts"><button type="button" class="pill pill-solid" data-libplay="${esc(d.key)}"${d.playable === false ? ' disabled' : ''}>${icon('play')}Play</button><button type="button" class="link-btn" data-libopen="${esc(d.key)}">Open the deck</button></div></div></div>`;
}
function renderLibrary() {
  const all = libEntries();
  const srcs = [['all', 'All'], ['claude', "Claude's"]].concat(all.some((e) => e.src === 'finals') ? [['finals', 'Famous finals']] : []);
  if (!srcs.some(([k]) => k === LIB.src)) LIB.src = 'all';
  const list = libFilter(all);
  const groups = [];
  for (const e of list) { let g = groups.find((x) => x.name === e.group); if (!g) groups.push(g = { name: e.group, items: [] }); g.items.push(e); }
  const head = `<div class="lib-bar">
      <div class="seg seg-lg" role="group" aria-label="Whose decks" id="libSrc">${srcs.map(([k, l]) => `<button type="button" data-libsrc="${k}" aria-pressed="${LIB.src === k}">${l}</button>`).join('')}</div>
      <label class="lib-search">${icon('search')}<input type="search" id="libQ" placeholder="Search decks and cards" autocomplete="off" spellcheck="false" aria-label="Search decks and cards" value="${esc(LIB.q)}"></label>
    </div>
    <div class="lib-filters">
      <div class="seg" role="group" aria-label="Plan" id="libArch">${[['all', 'Any plan']].concat(Object.entries(ARCH)).map(([k, l]) => `<button type="button" data-libarch="${k}" aria-pressed="${LIB.arch === k}">${l}</button>`).join('')}</div>
      <div class="types lib-types" role="group" aria-label="Types">${LIB_TYPES.map((t) => `<button type="button" data-libtype="${t}" aria-pressed="${LIB.types.includes(t)}" aria-label="${TYPES[t]}">${pipHTML(t)}</button>`).join('')}</div>
    </div>
    <p class="lib-count" role="status">${list.length === all.length ? `${plural(all.length, 'deck')}` : `${plural(list.length, 'deck')} of ${all.length}`}</p>`;
  const body = groups.length ? groups.map((g) => `<section class="lib-group"><h2>${esc(g.name)}<small>${g.items.length}</small></h2><div class="deck-grid lib-grid">${g.items.map(libTileHTML).join('')}</div></section>`).join('')
    : `<div class="lib-empty"><img class="medal" src="../img/empty-search.webp" alt="" width="96" height="96"><p>No deck matches. <button type="button" class="link-btn" data-libreset>Clear the filters</button></p></div>`;
  const keepFocus = document.activeElement && document.activeElement.id === 'libQ';
  const pos = keepFocus ? document.activeElement.selectionStart : 0;
  $('#libBody').innerHTML = head + body;
  if (keepFocus) { const q = $('#libQ'); q.focus(); q.setSelectionRange(pos, pos); }
}
function openLibrary(push = true) {
  setView('decks', push);
  renderLibrary();
}
window.openLibrary = openLibrary;
// An opponent for a deck from the library: another of the same kind of deck, of a different type when there is one
function libOpponent(key) {
  const d = deckByKey(key);
  if (d && d.fin) { const rv = FIN.rival(d.fin.id); if (rv) return `f.${rv.id}`; }
  const all = libEntries().filter((e) => e.d.key !== key);
  const same = all.filter((e) => e.src === (libEntries().find((x) => x.d.key === key) || {}).src);
  const pool = (same.length ? same : all);
  const other = pool.filter((e) => !(e.d.types || []).some((t) => (d.types || []).includes(t)));
  const pick = (other.length ? other : pool);
  return pick[Math.floor(Math.random() * pick.length)].d.key;
}
function libPlay(key, how) {
  const d = deckByKey(key);
  if (!d) return;
  if (d.fin && how !== 'setup') { finalStart(d.fin.id); return; }
  closeDeckView();
  S.seats = [key, libOpponent(key)];
  S.active = 1;
  saveSeats();
  if (how === 'setup') { setView('lobby', true); renderSeats(); return; }
  S.backTo = 'decks';
  playStart(newSeed(), []);
}

/* ============================================================
   6d. Journal: every game you play against the AI
   ============================================================ */
const JRN = window.ARENA_JOURNAL;
const JV = { filter: ['all', 'free', 'career', 'finals'].includes(store.get('holo.arena.jfilter.v1', 'all')) ? store.get('holo.arena.jfilter.v1', 'all') : 'all', shown: 40 };
const journalList = () => store.get('holo.arena.journal.v1', []) || [];
const RES = { win: ['W', 'Win'], loss: ['L', 'Loss'], draw: ['D', 'Draw'] };
const pct = (x) => `${Math.round(x * 100)}%`;
const wl = (t) => `${t.w}–${t.l}${t.d ? `–${t.d}` : ''}`;
// A game you played to the end goes in once: a reload of a finished game doesn't add it again. Lessons aren't recorded.
function journalRecord() {
  if (TU.on || !JRN || !W.replay || W.mode !== 'play' || !W.replay.stats) return;
  const id = PL.career != null ? `cr${PL.career}.${PL.seed}.${PL.answers.length}` : `${PL.seed}.${PL.answers.length}.${(PL.keys || PL.labels).join('|')}`;
  const list = journalList();
  if (list.some((e) => e.id === id)) return;
  const secs = PL.t0 ? Math.min(7200, Math.round((Date.now() - PL.t0) / 1000)) : 0;
  const decks = PL.decks.map((d, i) => Object.assign({}, d, { name: PL.labels[i] }));
  const mode = PL.career != null ? 'career' : PL.fin ? 'finals' : 'free';
  store.set('holo.arena.journal.v1', JRN.add(list, JRN.entryOf(W.replay, { id, ai: PL.ai || 'normal', decks, mode, career: PL.career, fin: PL.fin, secs })));
}
const jFilter = (f) => (f === 'all' ? null : (e) => e.mode === f);
const typePips = (t) => (t ? pipsHTML(t) : pipHTML('C'));
// A vertical bar from the baseline y0 out to y1, rounded only at its far end
function vbar(x, y0, y1, w, r) {
  r = Math.min(r, w / 2, Math.abs(y1 - y0));
  if (y1 < y0) return `M${x},${y0}V${y1 + r}Q${x},${y1} ${x + r},${y1}H${x + w - r}Q${x + w},${y1} ${x + w},${y1 + r}V${y0}Z`;
  return `M${x},${y0}V${y1 - r}Q${x},${y1} ${x + r},${y1}H${x + w - r}Q${x + w},${y1} ${x + w},${y1 - r}V${y0}Z`;
}
// Wins rise above the line, losses hang below it, draws sit on it: the last games at a glance, oldest first
function sparkHTML(last) {
  if (!last.length) return '';
  const bw = 7, gap = 3, h = 36, mid = h / 2;
  const w = last.length * (bw + gap) - gap;
  const bars = last.map((e, i) => {
    const x = i * (bw + gap);
    if (e.res === 'draw') return `<rect class="d" x="${x}" y="${mid - 1.5}" width="${bw}" height="3" rx="1.5"/>`;
    return `<path class="${e.res === 'win' ? 'w' : 'l'}" d="${vbar(x, mid + (e.res === 'win' ? -1 : 1), e.res === 'win' ? 1 : h - 1, bw, 2)}"/>`;
  }).join('');
  const label = `Last ${plural(last.length, 'game')}, oldest first: ${last.map((e) => RES[e.res][1].toLowerCase()).join(', ')}`;
  return `<svg class="jr-spark" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="${esc(label)}"><line class="mid" x1="0" x2="${w}" y1="${mid}" y2="${mid}"/>${bars}</svg>`;
}
function meterList(rows, name) {
  return `<div class="mts">${rows.map((t) => `<div class="mt"><span class="mt-name">${name(t)}</span><span class="mt-bar" role="img" aria-label="${pct(t.rate)} won"><i style="width:${(t.rate * 100).toFixed(1)}%"></i></span><span class="mt-fig"><b>${pct(t.rate)}</b>${wl(t)}</span></div>`).join('')}</div>`;
}
function howBars(counts, loss) {
  const rows = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  if (!rows.length) return '';
  const max = Math.max(...rows.map((r) => r[1]));
  return `<div class="hb"><p class="hb-h">${loss ? 'Your losses' : 'Your wins'}</p>${rows.map(([why, n]) => `<div class="hb-row"><span>${esc(JRN.HOW[why] || why)}</span><span class="hb-bar${loss ? ' l' : ''}"><i style="width:${Math.max(3, (n / max) * 100).toFixed(1)}%"></i><b>${n}</b></span></div>`).join('')}</div>`;
}
const dayOf = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
function dayLabel(t) {
  const today = dayOf(Date.now()), d = dayOf(t);
  if (d === today) return 'Today';
  if (d === today - 864e5) return 'Yesterday';
  return new Date(t).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: new Date(t).getFullYear() === new Date().getFullYear() ? undefined : 'numeric' });
}
function gameRow(e) {
  const what = e.mode === 'career' && window.careerStageName ? careerStageName(e.career) : e.mode === 'finals' && window.finalName ? finalName(e.fin) : `${e.ai === 'hard' ? 'Hard' : 'Normal'} AI`;
  const how = e.res === 'draw' ? JRN.HOW[e.why] || 'Draw' : JRN.HOW[e.why] || '';
  return `<li class="jg"><span class="jg-r ${e.res}" aria-label="${RES[e.res][1]}">${RES[e.res][0]}</span>`
    + `<span class="jg-main"><b>vs ${esc(e.op.n)}</b><span>${esc(e.me.n)} · ${esc(what)}</span></span>`
    + `<span class="jg-side"><b>Turn ${e.turns}</b>${esc(how)}<br>${new Date(e.at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</span></li>`;
}
function renderJournal() {
  const all = journalList();
  const s = JRN.stats(all, jFilter(JV.filter));
  const modes = [['all', 'All'], ['free', 'Free play'], ['career', 'Career'], ['finals', 'Finals']].filter(([k]) => k === 'all' || k === 'free' || all.some((e) => e.mode === k));
  const seg = `<div class="seg jr-filter" role="group" aria-label="Which games">${modes.map(([k, l]) => `<button type="button" data-jf="${k}" aria-pressed="${JV.filter === k}">${l}</button>`).join('')}</div>`;
  const head = `<section class="hero art-title"><h1>Journal</h1><span class="ornament" aria-hidden="true"></span><p>Every game you play against the AI, the way it went, and how you're doing.</p></section>`;
  if (!s.n) {
    $('#journalBody').innerHTML = `${head}${all.length ? seg : ''}<div class="jr-empty"><img class="medal" src="../img/empty-journal.webp" alt="" width="116" height="116"><b>${all.length ? 'Nothing here yet' : 'No games yet'}</b>${all.length ? 'No games of this kind so far.' : 'Play a game against the AI and it shows up here, with your win rate, your best decks and your records.'}<p class="jr-go"><button type="button" class="pill pill-solid" data-jr="play">${icon('swords')}Find a match</button></p></div>`;
    return;
  }
  const t = s.all;
  const streak = s.streak > 0 ? [plural(s.streak, 'win'), 'in a row'] : s.streak < 0 ? [plural(-s.streak, 'loss', 'losses'), 'in a row'] : ['None', 'the last game was a draw'];
  const parts = [head, seg];
  const hours = Math.round(s.totals.secs / 3600);
  parts.push(`<div class="jr-top"><div class="jr-hero"><p class="jr-lbl">Win rate</p><p class="jr-big">${pct(s.rate)}</p>`
    + `<p class="jr-sub">${plural(t.w, 'win')}, ${plural(t.l, 'loss', 'losses')}${t.d ? ` and ${plural(t.d, 'draw')}` : ''} in ${plural(t.n, 'game')}</p>`
    + `${sparkHTML(s.last)}<div class="jr-key"><span><i style="background:var(--win)"></i>Win</span><span><i style="background:var(--loss)"></i>Loss</span>${s.last.some((e) => e.res === 'draw') ? '<span><i style="background:var(--draw)"></i>Draw</span>' : ''}<span>Last ${plural(s.last.length, 'game')}</span></div></div>`
    + `<div class="jr-kpis"><div class="kpi"><span>Games played</span><b>${nf.format(t.n)}</b>${s.totals.secs > 600 ? `<small>About ${hours || '<1'} hour${hours === 1 ? '' : 's'} at the table</small>` : ''}</div>`
    + `<div class="kpi"><span>Current streak</span><b>${streak[0]}</b><small>${streak[1]}</small></div>`
    + `<div class="kpi"><span>Best winning streak</span><b>${s.bestStreak ? plural(s.bestStreak, 'win') : 'None yet'}</b></div>`
    + `<div class="kpi"><span>Turns to win</span><b>${s.avgWinTurns ? s.avgWinTurns.toFixed(1) : '–'}</b><small>on average</small></div></div></div>`);
  parts.push(`<section class="jr-card"><h2>Win rate over time</h2><p class="jr-cap">Your overall win rate after each game. The line at 50% is an even record.</p><div class="jl" id="jrLine" tabindex="0" aria-label="Win rate after each game: ${pct(s.trend[0].rate)} after the first, ${pct(s.rate)} now. Use the arrow keys to step through the games."></div></section>`);
  const grid = [];
  const ais = ['normal', 'hard'].filter((k) => s.byAi[k]).map((k) => Object.assign({ name: k }, s.byAi[k], { rate: JRN.rate(s.byAi[k]) }));
  if (ais.length) grid.push(`<section class="jr-card"><h2>Against each AI</h2><p class="jr-cap">Wins out of games played.</p>${meterList(ais, (x) => `<span class="nm">${x.name === 'hard' ? 'Hard' : 'Normal'} AI</span>`)}</section>`);
  const fs = ['first', 'second'].filter((k) => s.byFirst[k].n).map((k) => Object.assign({ name: k }, s.byFirst[k], { rate: JRN.rate(s.byFirst[k]) }));
  if (fs.length) grid.push(`<section class="jr-card"><h2>Going first or second</h2><p class="jr-cap">Who took the first turn.</p>${meterList(fs, (x) => `<span class="nm">You went ${x.name}</span>`)}</section>`);
  if (s.decks.length) grid.push(`<section class="jr-card"><h2>Your decks</h2><p class="jr-cap">The ones you've played most.</p>${meterList(s.decks.slice(0, 6), (x) => `${typePips(x.t)}<span class="nm">${esc(x.name)}</span>`)}</section>`);
  if (s.opps.length) grid.push(`<section class="jr-card"><h2>Opponents</h2><p class="jr-cap">Decks you've met at least twice, the hardest first.</p>${meterList(s.opps.slice(0, 6), (x) => `${typePips(x.t)}<span class="nm">${esc(x.name)}</span>`)}</section>`);
  if (s.types.length) grid.push(`<section class="jr-card"><h2>By type</h2><p class="jr-cap">A deck of two types counts for both.</p>${meterList(s.types, (x) => `${pipHTML(x.name)}<span class="nm">${TYPES[x.name] || x.name}</span>`)}</section>`);
  if (t.w || t.l) grid.push(`<section class="jr-card"><h2>How games end</h2><p class="jr-cap">What finished each game.</p>${howBars(s.winHow, false)}${howBars(s.lossHow, true)}</section>`);
  parts.push(`<div class="jr-grid">${grid.join('')}</div>`);
  const r = s.rec, vs = (e) => `${esc(e.me.n)} vs ${esc(e.op.n)}`;
  const recs = [
    r.fastest && ['fastest', 'Fastest win', `Turn ${r.fastest.turns}`, vs(r.fastest)],
    r.closest && ['closest', 'Closest call', r.closest.op.left ? `${plural(r.closest.op.left, 'Prize card')} from losing` : 'Won at the wire', vs(r.closest)],
    r.damage && r.damage.me.best ? ['damage', 'Biggest hit', `${nf.format(r.damage.me.best)} damage`, `One attack, ${vs(r.damage)}`] : null,
    r.longest && ['longest', 'Longest game', `${r.longest.turns} turns`, vs(r.longest)],
  ].filter(Boolean);
  const tt = s.totals;
  parts.push(`<section class="jr-card"><h2>Records</h2><p class="jr-cap">Your bests so far.</p><div class="recs">${recs.map(([k, a, b, c]) => `<div class="rec"><img class="medal" src="../img/rec-${k}.webp" alt="" width="54" height="54" loading="lazy"><span>${a}</span><b>${b}</b><small>${c}</small></div>`).join('')}</div>`
    + `<p class="tots"><span><b>${nf.format(tt.taken)}</b> Prize cards taken</span><span><b>${nf.format(tt.kos)}</b> Pokémon Knocked Out</span><span><b>${nf.format(tt.dmg)}</b> damage dealt</span><span><b>${nf.format(tt.tr)}</b> Trainers played</span><span><b>${nf.format(tt.turns)}</b> turns played</span></p></section>`);
  // The games themselves, newest first, a day at a time
  const games = (jFilter(JV.filter) ? all.filter(jFilter(JV.filter)) : all).slice().reverse();
  const shown = games.slice(0, JV.shown);
  let html = '', day = null;
  for (const e of shown) {
    const d = dayOf(e.at);
    if (d !== day) { html += `${day == null ? '' : '</ul>'}<h3 class="jg-day">${esc(dayLabel(e.at))}</h3><ul class="jg-list">`; day = d; }
    html += gameRow(e);
  }
  html += '</ul>';
  parts.push(`<section class="jr-games"><h2>Games</h2>${html}${games.length > shown.length ? `<div class="jr-more"><button type="button" class="pill" data-jr="more">Show more</button></div>` : ''}</section>`);
  parts.push('<p class="jr-foot"><button type="button" class="link-btn" data-jr="clear">Clear the journal</button></p>');
  $('#journalBody').innerHTML = parts.join('');
  drawTrend(s.trend);
}
// The win-rate line, drawn at the width it has; a crosshair follows the pointer or the arrow keys
function drawTrend(trend) {
  const box = $('#jrLine');
  if (!box) return;
  const W0 = Math.max(260, box.clientWidth), Hh = W0 < 500 ? 170 : 210, Lm = 38, Rm = 46, Tm = 12, Bm = 26;
  const n = trend.length;
  const x = (k) => Lm + (n === 1 ? (W0 - Lm - Rm) / 2 : ((k - 1) / (n - 1)) * (W0 - Lm - Rm));
  const y = (v) => Tm + (1 - v) * (Hh - Tm - Bm);
  const pts = trend.map((p) => [x(p.k), y(p.rate)]);
  const line = pts.map(([a, b], i) => `${i ? 'L' : 'M'}${a.toFixed(1)},${b.toFixed(1)}`).join('');
  const area = `${line}L${pts[n - 1][0].toFixed(1)},${y(0)}L${pts[0][0].toFixed(1)},${y(0)}Z`;
  const ticks = [0, 0.5, 1].map((v) => `<line class="${v === 0 ? 'base' : 'g'}" x1="${Lm}" x2="${W0 - Rm}" y1="${y(v)}" y2="${y(v)}"/><text class="ax" x="${Lm - 8}" y="${y(v) + 4}" text-anchor="end">${v * 100}%</text>`).join('');
  const xl = `<text class="ax" x="${Lm}" y="${Hh - 6}">Game 1</text>${n > 1 ? `<text class="ax" x="${W0 - Rm}" y="${Hh - 6}" text-anchor="end">Game ${n}</text>` : ''}`;
  const last = pts[n - 1];
  box.innerHTML = `<svg width="${W0}" height="${Hh}" viewBox="0 0 ${W0} ${Hh}" aria-hidden="true">${ticks}${xl}<path class="area" d="${area}"/><path class="ln" d="${line}"/>`
    + `<circle class="dot" cx="${last[0]}" cy="${last[1]}" r="4.5"/><text class="end" x="${last[0] + 9}" y="${last[1] + 4}">${pct(trend[n - 1].rate)}</text>`
    + `<line class="xh" x1="0" x2="0" y1="${Tm}" y2="${y(0)}" visibility="hidden"/><circle class="dot hov" r="4.5" visibility="hidden"/></svg>`;
  const svg = box.querySelector('svg'), xh = svg.querySelector('.xh'), hov = svg.querySelector('.hov');
  const show = (i) => {
    const p = trend[i], [px, py] = pts[i];
    xh.setAttribute('x1', px); xh.setAttribute('x2', px); xh.setAttribute('visibility', 'visible');
    hov.setAttribute('cx', px); hov.setAttribute('cy', py); hov.setAttribute('visibility', 'visible');
    const rr = svg.getBoundingClientRect();
    jTip(`${pct(p.rate)} overall`, `Game ${p.k}: ${RES[p.e.res][1].toLowerCase()} vs ${p.e.op.n}`, rr.left + px, rr.top + py);
    box._i = i;
  };
  const hide = () => { xh.setAttribute('visibility', 'hidden'); hov.setAttribute('visibility', 'hidden'); jTip(); };
  const at = (cx) => { const rr = svg.getBoundingClientRect(); const k = n === 1 ? 0 : Math.round(((cx - rr.left - Lm) / (W0 - Lm - Rm)) * (n - 1)); return clamp(k, 0, n - 1); };
  svg.addEventListener('pointermove', (e) => show(at(e.clientX)));
  svg.addEventListener('pointerdown', (e) => show(at(e.clientX)));
  // A finger lifting off counts as leaving: on touch the readout stays until the next tap elsewhere
  svg.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') hide(); });
  box.onkeydown = (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight' && e.key !== 'Home' && e.key !== 'End') return;
    e.preventDefault();
    const i = box._i == null ? n - 1 : box._i;
    show(e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : clamp(i + (e.key === 'ArrowLeft' ? -1 : 1), 0, n - 1));
  };
  box.onblur = hide;
}
// One tooltip for the journal: the value first, then what it is
function jTip(head, sub, x, y) {
  let t = $('#jtip');
  if (!head) { if (t) t.hidden = true; return; }
  if (!t) { t = document.createElement('div'); t.id = 'jtip'; t.className = 'jtip'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
  t.innerHTML = '';
  const b = document.createElement('b'); b.textContent = head; t.appendChild(b);
  if (sub) t.appendChild(document.createTextNode(sub));
  t.hidden = false;
  const w = t.offsetWidth, h = t.offsetHeight;
  t.style.left = `${clamp(x - w / 2, 8, innerWidth - w - 8)}px`;
  t.style.top = `${y - h - 14 < 8 ? y + 16 : y - h - 14}px`;
}
function openJournal(push = true) {
  setView('journal', push);
  JV.shown = 40;
  renderJournal();
}
window.openJournal = openJournal;

/* ============================================================
   6e. Career: Victory Road, from the first Gym to your rival
   ============================================================ */
const CAR = window.ARENA_CAREER;
const CR = { run: undefined, pend: null, autoReward: false };
const CR_KEY = 'holo.arena.career.v1', CR_GAME = 'holo.arena.career.game.v1';
const careerRun = () => (CR.run !== undefined ? CR.run : (CR.run = store.get(CR_KEY, null)));
function careerSave(run) { CR.run = run; store.set(CR_KEY, run); DECKS.delete('cr.me'); }
const careerGame = () => store.get(CR_GAME, null);
window.careerStageName = (k) => (CAR && CAR.STAGES[k] ? `Victory Road, ${CAR.STAGES[k].who}` : 'Victory Road');
// Your deck and the Leaders', kept like any other deck so the deck view can open them
function careerMe() {
  const run = careerRun();
  if (!run) return null;
  if (DECKS.has('cr.me')) return DECKS.get('cr.me');
  const P = CAR.PARTNERS[run.partner];
  return finishDeck(CAR.heroDeck(A, DATA.pool, run), { key: 'cr.me', by: 'career',
    blurb: `${P.name}'s deck: ${plural(run.got.length, 'card')} earned so far. Every win brings a pack of new cards, which replace your weakest.` });
}
function careerFoe(k) {
  const st = CAR.STAGES[k];
  if (!st) return null;
  if (DECKS.has(`cr.${k}`)) return DECKS.get(`cr.${k}`);
  return finishDeck(CAR.stageDeck(A, DATA.pool, k), { key: `cr.${k}`, by: 'career', blurb: st.text });
}
window.careerMe = careerMe;
window.careerFoe = careerFoe;
const crCard = (key) => CAR.card(A, DATA.pool, key);
const crArt = (key, cls) => { const d = typeof key === 'string' ? crCard(key) : key; return `<span class="cr-art ${cls || ''}">${d ? cropHTML(d) : ''}</span>`; };
function careerStartFight(resume) {
  const run = careerRun();
  if (!run || run.done || run.reward) return;
  const k = run.stage, st = CAR.STAGES[k];
  const decks = [Object.assign(forEngine(careerMe()), { prizes: st.you }), forEngine(careerFoe(k))];
  const sv = careerGame();
  S.backTo = 'career';
  if (resume && sv && !sv.done && sv.k === k) playStart(sv.seed, sv.answers, { decks, career: k, ai: sv.ai === 'hard' ? 'hard' : 'normal', memo: sv.memo || null });
  else playStart(newSeed(), [], { decks, career: k, ai: st.ai });
}
// A career game has ended: the road moves on after a win, and a pack of cards waits to be chosen
function careerResult() {
  const run = careerRun();
  if (!run || PL.career == null) return;
  const id = `${PL.seed}.${PL.answers.length}`;
  if (run.fights.some((f) => f.id === id)) return;
  const won = W.replay.winner === 0;
  const next = CAR.afterFight(run, PL.career, won, { id, turns: W.replay.turns });
  if (next.stage === run.stage + 1 && !next.done) next.reward = { k: PL.career, seed: newSeed() };
  careerSave(next);
}
function renderCareer() {
  const J = CAR.JOURNEY, N = CAR.STAGES.length;
  const run = careerRun();
  const parts = [];
  if (!run) {
    parts.push(`<section class="cr-hero cr-intro-hero"><div class="cr-hero-in"><p class="cr-kick">Career</p><h1>${esc(J.title)}</h1><span class="ornament" aria-hidden="true"></span><p class="cr-intro">${esc(J.intro)}</p></div></section>`);
    parts.push(`<h2 class="cr-h">Choose your partner</h2><p class="cr-sub">Your partner's line starts your deck, with plain Trainers and a lot of Energy. The rest you earn on the road.</p>`
      + `<div class="cr-partners">${Object.values(CAR.PARTNERS).map((P) => `<button type="button" class="cr-partner" data-crpartner="${P.id}">${crArt(P.line[2][1], 'big')}<span class="cr-pt"><b>${esc(P.name)}</b><span class="pips">${pipHTML(P.type)}</span><span>${esc(P.blurb)}</span></span></button>`).join('')}</div>`);
    $('#careerBody').innerHTML = parts.join('');
    return;
  }
  const P = CAR.PARTNERS[run.partner];
  const k = run.stage;
  const me = careerMe();
  const prog = CAR.STAGES.map((st, i) => `<i class="${i < k || run.done ? 'on' : i === k ? 'now' : ''}"></i>`).join('');
  parts.push(`<section class="cr-hero">${crArt(me.face, 'cr-hero-art')}<div class="cr-hero-in"><p class="cr-kick">Career · ${esc(P.name)}'s journey</p><h1>${esc(J.title)}</h1>`
    + `<p class="cr-intro">${esc(J.intro)}</p><div class="cr-prog" aria-hidden="true">${prog}</div><p class="cr-prog-l">${run.done ? 'Journey complete' : `${k} of ${N} stages cleared`}</p></div></section>`);
  if (run.reward) parts.push(`<div class="cr-note"><p><b>${esc(CAR.STAGES[run.reward.k].who)} beaten.</b> Choose your reward before the next battle.</p><button type="button" class="pill pill-solid" data-cr="reward">${icon('sparkle')}Choose your reward</button></div>`);
  const sv = careerGame();
  if (!run.done && !run.reward && sv && !sv.done && sv.k === k) parts.push(`<div class="cr-note"><p><b>Your battle is waiting.</b> ${esc(CAR.STAGES[k].who)}, turn ${sv.turn || 1}.</p><button type="button" class="pill pill-solid" data-cr="resume">${icon('play')}Resume</button></div>`);
  if (run.done) {
    const wins = run.fights.filter((f) => f.won).length;
    parts.push(`<section class="cr-next boss cr-done">${crArt(me.face, 'cr-next-art')}<div class="cr-next-body"><p class="cr-stage">Journey complete</p><h2>${esc(J.doneTitle)}</h2>`
      + `<p class="cr-text">${esc(J.doneText)} ${plural(run.fights.length, 'battle')}, ${plural(wins, 'win')}, ${plural(run.got.length, 'new card')} along the way.</p>`
      + `<div class="cr-acts"><button type="button" class="pill pill-solid" data-cr="new">${icon('swords')}Start a new journey</button><button type="button" class="link-btn" data-cr="deck">See your deck</button></div></div></section>`);
  } else {
    const st = CAR.STAGES[k], foe = careerFoe(k);
    const tries = run.fights.filter((f) => f.k === k).length;
    const rules = [st.ai === 'hard' ? 'Hard AI' : 'Normal AI', `you take ${st.you} Prize cards to win`, tries ? `${plural(tries, 'try', 'tries')} so far` : ''].filter(Boolean).join(' · ');
    parts.push(`<section class="cr-next${st.boss ? ' boss' : ''}">${crArt(foe.face, 'cr-next-art')}<div class="cr-next-body">`
      + `<p class="cr-stage">${st.boss ? 'Final battle' : `Stage ${k + 1} of ${N}`} · ${esc(st.where)}</p><h2>${esc(st.who)}: ${esc(st.title)}</h2>`
      + `<p class="cr-foe"><span class="pips">${pipsHTML(foe.types.join(''))}</span><span>${esc(foe.name)}</span></p>`
      + `<p class="cr-text">${esc(st.text)}</p><p class="cr-rules">${esc(rules.charAt(0).toUpperCase() + rules.slice(1))}</p>`
      + `<div class="cr-acts"><button type="button" class="pill pill-solid" data-cr="fight"${run.reward ? ' disabled' : ''}>${icon('swords')}${tries ? 'Battle again' : 'Battle'}</button><button type="button" class="link-btn" data-cr="foe">See their deck</button></div></div></section>`);
  }
  const got = run.got.slice(-8).reverse();
  parts.push(`<section class="cr-deck">${crArt(me.face, 'cr-deck-art')}<span class="cr-deck-tx"><h3>${esc(me.name)}</h3><p>${me.size} cards · ${me.mons} Pokémon, ${me.trainers} Trainers, ${me.energy} Energy · ${plural(run.got.length, 'card')} earned</p></span>`
    + `<button type="button" class="pill" data-cr="deck">See your deck</button>`
    + `${got.length ? `<div class="cr-new"><span class="lbl">Latest cards</span>${got.map((n) => { const d = (DATA.pool.byName.get(n) || [])[0]; return d ? `<button type="button" class="chip got" data-zoom="${esc(d.id)}">${esc(n)}</button>` : ''; }).join('')}</div>` : ''}</section>`);
  parts.push(`<section class="cr-path"><h2>${esc(J.road)}</h2><ol class="cr-steps">${CAR.STAGES.map((st, i) => {
    const state = i < k || run.done ? 'done' : i === k ? 'now' : 'locked';
    const win = run.fights.find((f) => f.k === i && f.won);
    const r = state === 'done' ? (win ? `Won on turn ${win.turns}` : 'Cleared') : state === 'now' ? 'Up next' : st.boss ? 'Final battle' : '';
    const face = crCard(st.face);
    return `<li class="cr-st ${state}${st.boss ? ' boss' : ''}"><span class="n">${state === 'done' ? icon('check') : i + 1}</span>${crArt(face, 'th')}`
      + `<span><b>${esc(st.who)}: ${esc(st.title)}</b><span class="s">${esc(st.where)} · ${st.ai === 'hard' ? 'Hard AI' : 'Normal AI'} · ${st.you} Prize cards</span></span><span class="r">${r}</span></li>`;
  }).join('')}</ol></section>`);
  if (!run.done) parts.push(`<p class="cr-foot"><button type="button" class="link-btn" data-cr="reset">Start the journey over</button></p>`);
  $('#careerBody').innerHTML = parts.join('');
}
function openCareer(push = true) {
  setView('career', push);
  renderCareer();
  const run = careerRun();
  if (run && run.reward && CR.autoReward) { CR.autoReward = false; openReward(); }
}
window.openCareer = openCareer;
// The reward: three packs; the chosen one's cards go into your deck in place of its weakest
function openReward() {
  const run = careerRun();
  if (!run || !run.reward) return;
  const { k, seed } = run.reward;
  const packs = CAR.packsFor(A, DATA.pool, run, k, seed);
  CR.pend = packs;
  const box = $('#crReward');
  box.innerHTML = `<div class="rw-scrim" data-rw="close"></div><div class="rw-box" role="dialog" aria-modal="true" aria-labelledby="rwTitle">
    <img class="medal rw-medal" src="../img/won.webp" alt="" width="72" height="72"><h2 id="rwTitle">${esc(CAR.STAGES[k].who)} beaten</h2>
    <p class="rw-sub">Choose one pack. Its cards go into your deck in place of the weakest ones (plain Trainers and spare Energy first). Tap a card to read it.</p>
    <div class="rw-packs">${packs.map((p, i) => `<section class="rw-pack"><h3>${esc(p.name)}<span>${plural(p.cards.reduce((t, x) => t + x[0], 0), 'card')}</span></h3>`
      + `<div class="rw-cards">${p.cards.map(([n, key]) => { const d = crCard(key); return d ? `<button type="button" class="rw-card cardbtn" data-zoom="${esc(d.id)}">${cardHTML(d, { alt: d.name })}${n > 1 ? `<span class="dv-n">×${n}</span>` : ''}</button>` : ''; }).join('')}</div>`
      + `<button type="button" class="pill pill-solid" data-take="${i}">Take the ${esc(p.name)}</button></section>`).join('')}</div>
    <p class="rw-hint">You can close this and choose later; the next battle waits until you do.</p>
    <button type="button" class="icon-btn rw-x" data-rw="close" aria-label="Close">${icon('x')}</button></div>`;
  const was = !box.hidden;
  box.hidden = false;
  box.querySelector('[data-take]').focus({ preventScroll: true });
  if (!was && window.UI) UI.overlay.open('rw', () => closeReward(true));
}
function closeReward(viaHistory) {
  const box = $('#crReward');
  if (box.hidden) return;
  box.hidden = true;
  box.innerHTML = '';
  if (viaHistory !== true && window.UI) UI.overlay.closed('rw');
}
function takeReward(i) {
  const run = careerRun();
  const pack = CR.pend && CR.pend[i];
  if (!run || !run.reward || !pack) return;
  const res = CAR.addPack(A, DATA.pool, run, pack);
  careerSave(res.run);
  closeReward();
  renderCareer();
  pageToast(`${pack.name} added${res.out.length ? `; out went ${listWords(res.out.map(([n, name]) => `${n > 1 ? `${n} ` : ''}${name}`))}` : ''}.`);
}

/* ============================================================
   6f. Famous finals: World Championship finals, both decks as registered
   ============================================================ */
const FIN = window.ARENA_FINALS || { FINALS: [], byId: new Map(), deckName: (d) => d.archetype, rival: () => null, surname: (p) => p };
const FIN_KEY = 'holo.arena.finals.v1', FIN_GAME = 'holo.arena.finals.game.v1';
// A finalist's deck, kept like any other deck (key f.<id>) so seats, the hash and the deck view all work
function finalsDeck(key) {
  if (DECKS.has(key)) return DECKS.get(key);
  const x = FIN.byId.get(String(key).slice(2));
  if (!x || !DATA.pool) return null;
  const { f, d } = x;
  const r = A.resolveDeck(DATA.pool, { name: FIN.deckName(d), archetype: d.arch, types: d.types, face: d.face, plan: d.plan, keys: d.keys, cards: d.cards });
  return finishDeck(r, { key, by: 'finals', blurb: `${d.player}'s deck from the ${f.short} final, card for card.`, fin: { id: d.id, final: f.id, won: d.won, player: d.player }, playable: !r.missing.length });
}
window.finalsDeck = finalsDeck;
const finRecs = () => store.get(FIN_KEY, null) || {};
const finalRecord = (id) => finRecs()[id] || { n: 0, w: 0, best: null, ids: [] };
const finalSides = () => FIN.FINALS.flatMap((f) => f.decks);
const finalsDone = () => finalSides().filter((d) => finalRecord(d.id).w > 0).length;
const finGame = () => store.get(FIN_GAME, null);
window.finalName = (id) => { const x = FIN.byId.get(id); return x ? `${x.f.short} final, as ${FIN.surname(x.d.player)}` : 'Famous final'; };
function finalsBtnHTML() {
  const n = finalSides().length, done = finalsDone();
  return `<img class="medal" src="../img/finals.webp" alt="" width="46" height="46"><span><b>Famous finals</b><span>${done ? `${done} of ${n} goals done` : `Replay ${plural(FIN.FINALS.length, 'World Championship final')} with the real decks`}</span></span>`;
}
function finalSideHTML(f, d) {
  const r = finalRecord(d.id), deck = finalsDeck(`f.${d.id}`), rv = FIN.rival(d.id), op = rv && finalsDeck(`f.${rv.id}`);
  const face = deck && def(deck.face);
  const rec = !r.n ? 'Not played yet' : r.w ? `${plural(r.w, 'win')} in ${plural(r.n, 'game')}${r.best ? `, the fastest on turn ${r.best}` : ''}` : `${plural(r.n, 'game')}, no wins yet`;
  const can = deck && deck.playable && op && op.playable;
  return `<div class="fin-side${r.w ? ' done' : ''}${d.won ? ' champ' : ''}"><span class="fin-art">${face ? cropHTML(face) : ''}</span><div class="fin-sb">`
    + `<p class="fin-role">${d.won ? 'Champion' : 'Runner-up'}</p><h3>${esc(FIN.deckName(d))}</h3>`
    + `<p class="fin-who">${deck ? `<span class="pips">${pipsHTML(deck.types.join(''))}</span>` : ''}<span>${esc(d.player)}, ${esc(d.from)}</span></p>`
    + `<p class="fin-goal">${r.w ? `<span class="fin-tick" aria-label="Goal done">${icon('check')}</span>` : ''}${esc(d.goal)}</p><p class="fin-rec">${esc(can ? rec : "Arena can't play every card in these decks yet.")}</p>`
    + `<div class="fin-acts"><button type="button" class="pill pill-solid" data-fplay="${esc(d.id)}"${can ? '' : ' disabled'}>${icon('swords')}Play as ${esc(FIN.surname(d.player))}</button><button type="button" class="link-btn" data-fdeck="${esc(d.id)}"${deck ? '' : ' disabled'}>See the deck</button></div></div></div>`;
}
function renderFinals() {
  const n = finalSides().length, done = finalsDone();
  const parts = [`<div class="fin-bar"><div class="ai-pick"><span id="finAiLbl">AI opponent</span><div class="seg" role="group" aria-labelledby="finAiLbl">${['normal', 'hard'].map((k) => `<button type="button" data-fai="${k}" aria-pressed="${S.ai === k}">${k === 'hard' ? 'Hard' : 'Normal'}</button>`).join('')}</div></div>`
    + `<p class="fin-count">${done ? `${done} of ${n} goals done` : 'One game decides it, with the decks exactly as they were registered.'}</p></div>`];
  const g = finGame(), gx = g && !g.done && FIN.byId.get(g.id);
  if (gx) {
    const rv = FIN.rival(g.id);
    parts.push(`<div class="cr-note fin-note"><p><b>Your game is waiting.</b> ${esc(FIN.deckName(gx.d))} against ${esc(FIN.deckName(rv))}, turn ${g.turn || 1}.</p><button type="button" class="pill pill-solid" data-fres>${icon('play')}Resume</button></div>`);
  }
  for (const f of FIN.FINALS) {
    const win = f.decks.find((d) => d.won) || f.decks[0];
    parts.push(`<section class="fin" id="fin-${esc(f.id)}"><div class="fin-head"><img class="medal fin-medal" src="../img/final-${esc(f.id)}.webp" alt="" width="76" height="76" loading="lazy">`
      + `<div class="fin-tx"><p class="fin-kick">${esc(f.when)}, ${esc(f.where)}</p><h2>${esc(f.event)}</h2><p class="fin-score">${esc(win.player)} won${f.score ? ` ${esc(f.score)}` : ''}</p></div></div>`
      + `<p class="fin-story">${esc(f.story)}</p>`
      + `<div class="fin-sides">${f.decks.map((d) => finalSideHTML(f, d)).join('')}</div>`
      + `<p class="fin-foot"><button type="button" class="link-btn" data-fwatch="${esc(win.id)}">Watch the AI play it</button><a href="${esc(f.link.url)}" target="_blank" rel="noopener">Read about the final on ${esc(f.link.label)}</a></p></section>`);
  }
  $('#finalsBody').innerHTML = parts.join('');
}
function openFinals(push = true) {
  setView('finals', push);
  renderFinals();
}
window.openFinals = openFinals;
// Play one finalist's deck against the other's, or watch the AI play the champion's side
function finalStart(id, watchIt) {
  const rv = FIN.rival(id), me = finalsDeck(`f.${id}`), op = rv && finalsDeck(`f.${rv.id}`);
  if (!me || !op || !me.playable || !op.playable) return;
  closeDeckView();
  S.seats = [me.key, op.key];
  saveSeats();
  S.backTo = 'finals';
  if (watchIt) watch(newSeed());
  else playStart(newSeed(), [], { fin: id });
}
function finalsResume(replace) {
  const g = finGame();
  if (!g || g.done) return false;
  const rv = FIN.rival(g.id), me = finalsDeck(`f.${g.id}`), op = rv && finalsDeck(`f.${rv.id}`);
  if (!me || !op || !me.playable || !op.playable) return false;
  S.seats = [me.key, op.key];
  saveSeats();
  S.backTo = 'finals';
  playStart(g.seed, g.answers, { fin: g.id, ai: g.ai === 'hard' ? 'hard' : 'normal', memo: g.memo || null, replace });
  return true;
}
window.finalsRetry = () => { if (PL.fin) finalStart(PL.fin); };
window.finalsSave = () => {
  const r = W.replay;
  store.set(FIN_GAME, { id: PL.fin, seed: PL.seed, answers: PL.answers, ai: PL.ai, memo: PL.ai === 'hard' ? PL.memo : undefined, turn: PL.done ? r.turns : PL.req.turn, done: PL.done || undefined });
};
// A finals game has ended: count it toward that side's goal, once
window.finalsResult = () => {
  const id = PL.fin;
  if (!id) return;
  const gid = `${PL.seed}.${PL.answers.length}`;
  const recs = finRecs(), r = Object.assign({ n: 0, w: 0, best: null, ids: [] }, recs[id]);
  if (r.ids.includes(gid)) return;
  r.ids = r.ids.concat(gid).slice(-40);
  r.n++;
  if (W.replay.winner === 0) { r.w++; r.best = r.best == null ? W.replay.turns : Math.min(r.best, W.replay.turns); }
  recs[id] = r;
  store.set(FIN_KEY, recs);
};
window.finalsBannerTitle = (r) => {
  const x = FIN.byId.get(PL.fin);
  if (!x || r.winner == null) return null;
  if (r.winner !== 0) return 'Not this time';
  return x.d.won ? `You won it as ${FIN.surname(x.d.player)} did` : `You won it for ${FIN.surname(x.d.player)}`;
};
// The finalists' decks in the Decks library
window.libExtra = () => FIN.FINALS.flatMap((f) => f.decks.map((d) => finalsDeck(`f.${d.id}`)).filter(Boolean).map((d) => ({ d, src: 'finals', group: `${FIN.byId.get(d.fin.id).f.short} final` })));

/* ============================================================
   7. Inspector: one card, big, with what you can do with it
   ============================================================ */
const INSP = $('#insp'), SCRIM = $('#scrim');
let inspReturn = null;
// gl: { found, used } from the glossary, so each explained term is underlined once
function cardText(d, gl) {
  const out = [];
  const tx = (t) => (gl ? Gloss.mark(esc(t), gl.found, gl.used) : esc(t));
  for (const a of d.abil || []) out.push(`<div class="block"><p class="k">Ability</p><b>${esc(a.name)}</b>${a.text ? `<p>${tx(a.text)}</p>` : ''}</div>`);
  for (const a of d.atks || []) out.push(`<div class="block"><div class="atk-top"><span class="pips">${a.cost ? pipsHTML(a.cost) : '<span class="muted">Free</span>'}</span><b>${esc(a.name)}</b>${a.base || a.mod ? `<span class="dmg">${a.base || ''}${esc(a.mod || '')}</span>` : ''}</div>${a.text ? `<p>${tx(a.text)}</p>` : ''}</div>`);
  for (const a of d.tmAtks || []) out.push(`<div class="block"><div class="atk-top"><span class="pips">${a.cost ? pipsHTML(a.cost) : '<span class="muted">Free</span>'}</span><b>${esc(a.name)}</b>${a.base ? `<span class="dmg">${a.base}</span>` : ''}</div>${a.text ? `<p>${tx(a.text)}</p>` : ''}</div>`);
  if (d.kind !== 0 && d.text) out.push(`<div class="block"><p>${tx(d.text)}</p></div>`);
  if (d.kind === 0) {
    const w = (d.weak || []).map((x) => `${pipHTML(x.t)} ${esc(x.v)}`).join(' ') || 'none';
    const r = (d.res || []).map((x) => `${pipHTML(x.t)} ${x.v}`).join(' ') || 'none';
    out.push(`<div class="wrr"><span>Weakness ${w}</span><span>Resistance ${r}</span><span>Retreat ${d.retreat ? pipsHTML('C'.repeat(d.retreat)) : 'free'}</span>${d.prizes > 1 ? `<span>Gives up ${d.prizes} Prize cards</span>` : ''}</div>`);
  }
  return out.join('');
}
// The terms worth explaining on a card: those in its text, and those it is (a Pokémon ex, an ACE SPEC, a Tera Pokémon)
function glossFor(d) {
  if (!window.Gloss) return [];
  const text = [].concat((d.abil || []).map((a) => a.text), (d.atks || []).map((a) => a.text), (d.tmAtks || []).map((a) => a.text), d.kind !== 0 ? [d.text] : []).filter(Boolean).join('\n');
  const extra = [d.mega ? 'mega-ex' : d.ex ? 'pokemon-ex' : null, d.tera ? 'tera' : null, d.ace ? 'ace-spec' : null, d.tmAtks ? 'tm' : null, d.kind === 2 && !d.basicEnergy ? 'special-energy' : null, d.abil && d.abil.length ? 'ability' : null].filter(Boolean);
  return Gloss.find(text, extra, [d.name]);
}
// What the terms on a card mean, under its text; everyday game words wait behind "More terms"
function glossHTML(found) {
  if (!found.length) return '';
  const main = found.filter((t) => !t.more), more = found.filter((t) => t.more);
  const row = (t) => `<div class="gl" data-gl="${esc(t.id)}"><dt>${esc(t.k)}</dt><dd>${esc(t.d)}</dd></div>`;
  return `<div class="gloss">${main.length ? `<p class="gl-h">What the terms mean</p><dl>${main.map(row).join('')}</dl>` : ''}`
    + `${more.length ? `<details class="gl-more"><summary><b>${main.length ? 'More terms' : 'Terms'} on this card</b><span>${more.map((t) => esc(t.k)).join(', ')}</span></summary><dl>${more.map(row).join('')}</dl></details>` : ''}</div>`;
}
// A tapped term: open its meaning and point at it
function showGloss(id) {
  const row = INSP.querySelector(`.gl[data-gl="${CSS.escape(id)}"]`);
  if (!row) return;
  const det = row.closest('details');
  if (det) det.open = true;
  row.scrollIntoView({ block: 'nearest', behavior: reduceMotion.matches ? 'auto' : 'smooth' });
  row.classList.remove('hit');
  void row.offsetWidth;
  row.classList.add('hit');
}
// What you can page through from a card: the rest of its row or hand on the table, the deck it's in, the cards to
// choose from, or the other key cards
const INS = { page: null, from: null };
function pageSet(src) {
  if (!src || !src.isConnected) return { items: [], i: 0, label: '' };
  const shown = (el) => el.getClientRects().length > 0 && !el.closest('[hidden]');
  let items = [], label = '';
  const side = src.closest('.side[data-p]');
  if (side && src.matches('.mon')) { items = $$('.mon', side); label = `${W.mode === 'play' && side.dataset.p === '0' ? 'Your' : `${names()[+side.dataset.p]}'s`} Pokémon`; }
  else if (side && src.matches('[data-card]')) { items = $$('[data-card]', side).filter((el) => !el.classList.contains('back')); label = `${W.mode === 'play' && side.dataset.p === '0' ? 'Your' : `${names()[+side.dataset.p]}'s`} hand`; }
  else if (src.matches('[data-zoomdef]')) { items = $$('[data-zoomdef]', SHEET); label = SH.opts ? SH.opts.title : ''; }
  else if (src.closest('#dvCards')) { items = $$('[data-zoom]', $('#dvCards')); label = $('#dvName') ? $('#dvName').textContent : ''; }
  else if (src.closest('.dv-keys, .cr-new, .rw-cards')) { const box = src.closest('.dv-keys, .cr-new, .rw-cards'); items = $$('[data-zoom]', box); label = box.matches('.rw-cards') ? 'This pack' : box.matches('.cr-new') ? 'Latest cards' : 'Key cards'; }
  items = items.filter(shown);
  const i = items.indexOf(src);
  return i < 0 ? { items: [], i: 0, label } : { items, i, label };
}
// Open a card from the element it is shown by, with whatever you could do with it right now
function inspectEl(el) {
  if (el.matches('.mon')) return inspectMon(+el.dataset.mon, el);
  if (el.matches('[data-card]')) {
    const id = +el.dataset.card;
    if (PL.on && W.mode === 'play' && el.closest('.side[data-p="0"]')) return inspectHand(id, el);
    const f = curFrame();
    for (const ps of f.s.p) { const h = ps.hand.find(([x]) => x === id); if (h) return openInspector({ def: def(h[1]), from: el }); }
    return;
  }
  if (el.dataset.zoomdef) return openInspector({ def: def(el.dataset.zoomdef), from: el });
  if (el.dataset.zoom) return openInspector({ def: def(el.dataset.zoom), from: el });
}
// Turn to the card before or after the open one (d: -1 or 1), or to card i (Home and End). Past either end it nudges.
function pageInspector(d, i, viaBtn) {
  const pg = INS.page;
  if (!pg) return;
  const to = i != null ? i : pg.i + d;
  const dir = to > pg.i ? 1 : -1;
  const pageEl = () => INSP.querySelector('.insp-page');
  if (to < 0 || to >= pg.items.length || to === pg.i || !pg.items[to].isConnected) { if (window.UI && pageEl()) UI.slide(pageEl(), d || dir, true); return; }
  inspectEl(pg.items[to]);
  if (window.UI && pageEl()) UI.slide(pageEl(), dir);
  if (viaBtn) { const b = INSP.querySelector(`[data-page="${dir}"]`); (b && !b.disabled ? b : INSP.querySelector(`[data-page="${-dir}"]`) || INSP.querySelector('.x')).focus({ preventScroll: true }); }
}
function openInspector(opts) {
  // opts: { def, mon (snapshot), acts: [{label, html, a}], why, from (what was tapped: paging goes from there) }
  const d = opts.def;
  const was = !INSP.hidden;
  if (!was) inspReturn = document.activeElement;
  const m = opts.mon;
  const state = [];
  if (m) {
    state.push(`<span>${Math.max(0, m.hp - m.dmg)} of ${m.hp} HP left</span>`);
    if (m.e) state.push(`<span>Energy ${pipsHTML(m.e)}</span>`);
    if (m.t) state.push(`<span>${esc(def(m.t).name)} attached</span>`);
    for (const c of m.c || []) state.push(`<span>${A.COND_WORD[c]}</span>`);
  }
  const found = glossFor(d);
  const gl = found.length ? { found, used: new Set() } : null;
  const pg = pageSet(opts.from || (was ? null : inspReturn));
  INS.page = pg.items.length > 1 ? pg : null;
  INS.from = opts.from || null;
  const nav = INS.page ? `<div class="insp-nav"><button type="button" class="icon-btn" data-page="-1" aria-label="Previous card"${pg.i <= 0 ? ' disabled' : ''}>${icon('prev')}</button>`
    + `<span class="insp-pos"><b>${pg.i + 1}</b> of ${pg.items.length}${pg.label ? ` · ${esc(pg.label)}` : ''}</span>`
    + `<button type="button" class="icon-btn" data-page="1" aria-label="Next card"${pg.i >= pg.items.length - 1 ? ' disabled' : ''}>${icon('next')}</button></div>` : '';
  const hp = d.kind === 0 ? ` <span class="pips">${pipsHTML(d.types)}</span>` : '';
  const acts = opts.acts && opts.acts.length ? `<div class="acts">${opts.acts.map((x, k) => `<button type="button" class="pill${k === 0 ? ' pill-solid' : ''}" data-act="${k}">${x.html || esc(x.label)}</button>`).join('')}</div>` : '';
  const page = `<div class="insp-page"><div class="big">${cardHTML(d, { big: true })}</div>
    <div class="insp-info"><h2 id="inspName">${esc(d.name)}</h2><p class="line">${esc(stageLine(d))}${d.kind === 0 ? `, ${d.hp} HP` : ''}${hp}</p>
    ${state.length ? `<div class="state">${state.join('')}</div>` : ''}
    ${m && m.st ? `<div class="stack">${m.st.map((x) => cardHTML(def(x), { alt: def(x).name })).join('')}</div>` : ''}
    ${cardText(d, gl)}
    ${glossHTML(found)}
    ${opts.why ? `<p class="why">${esc(opts.why)}</p>` : ''}
    ${acts}</div></div>`;
  if (was && INSP.querySelector('.insp-page')) {
    // Turning to another card: the bar and the page change, the dialog stays
    const on = INSP.querySelector('.insp-nav');
    if (on) on.remove();
    INSP.querySelector('.insp-page').outerHTML = page;
    if (nav) INSP.insertAdjacentHTML('afterbegin', nav);
    INSP.scrollTop = 0;
  } else INSP.innerHTML = `${nav}${page}<button type="button" class="icon-btn x" data-close="1" aria-label="Close">${icon('x')}</button>`;
  INSP._acts = opts.acts || [];
  INSP.hidden = false;
  SCRIM.hidden = false;
  if (!was && window.UI) UI.overlay.open('insp', () => closeInspector(true));
  if (!was) { const btn = INSP.querySelector('[data-act="0"]') || INSP.querySelector('[data-close]'); btn.focus({ preventScroll: true }); }
}
function closeInspector(viaHistory) {
  if (INSP.hidden) return;
  INSP.hidden = true;
  if ($('#sheet').hidden) SCRIM.hidden = true;
  INSP.innerHTML = '';
  INS.page = null;
  if (viaHistory !== true && window.UI) UI.overlay.closed('insp');
  // focus goes back to the card you ended on, if you paged
  const back = INS.from && INS.from.isConnected ? INS.from : inspReturn;
  if (back && back.isConnected) back.focus({ preventScroll: true });
  inspReturn = null;
  INS.from = null;
}
function snapMon(f, id) {
  for (const ps of f.s.p) {
    if (ps.active && ps.active.id === id) return ps.active;
    const b = ps.bench.find((x) => x.id === id);
    if (b) return b;
  }
  return null;
}
function monOwner(f, id) { return f.s.p.findIndex((ps) => (ps.active && ps.active.id === id) || ps.bench.some((x) => x.id === id)); }
function inspectDiscard(p) {
  const f = W.replay.frames[W.i];
  const ps = f.s.p[p];
  const ids = (ps.dl || []).slice().reverse();
  openSheet({
    title: `${p === 0 && W.mode === 'play' ? 'Your' : `${names()[p]}'s`} discard pile`,
    sub: ids.length ? plural(ids.length, 'card') : 'Nothing has been discarded yet.',
    cards: ids.map((d, k) => ({ id: `d${k}`, def: d })), readOnly: true,
  });
}

/* ============================================================
   8. Choice sheet: pick cards from a list
   ============================================================ */
const SHEET = $('#sheet');
const SH = { opts: null, sel: [], roles: null };
function openSheet(opts) {
  SH.opts = opts;
  SH.sel = (opts.preset || []).slice();
  SHEET.hidden = false;
  SCRIM.hidden = false;
  drawSheet();
}
function drawSheet() {
  const o = SH.opts;
  const count = o.readOnly ? '' : o.setup ? '' : o.max > 1 ? `${SH.sel.length} of ${o.min === o.max ? o.max : `up to ${o.max}`} chosen` : '';
  const groups = o.groups || [{ label: null, cards: o.cards }];
  SHEET.innerHTML = `<div class="sheet-head"><h2 id="sheetTitle">${esc(o.title)}</h2>${o.sub ? `<p>${o.sub}</p>` : ''}</div>
    <div class="sheet-body">${groups.map((g) => `${g.label ? `<p class="sheet-sub">${esc(g.label)}</p>` : ''}<div class="choices">${g.cards.map((c) => {
      const on = SH.sel.includes(c.id);
      const role = o.setup ? (SH.sel[0] === c.id ? 'Active' : on ? 'Bench' : '') : '';
      const dim = c.dim ? ' dim' : '';
      return `<div style="position:relative"><button type="button" class="choice${dim}" data-ch="${esc(c.id)}" ${o.readOnly || c.dim ? 'data-ro="1"' : `aria-pressed="${on}"`} aria-label="${esc(def(c.def).name)}${role ? `, ${role}` : ''}">${cardHTML(def(c.def), { alt: '', lazy: true })}${role ? `<span class="role">${role}</span>` : ''}</button><button type="button" class="zoom" data-zoomdef="${esc(c.def)}" aria-label="Read ${esc(def(c.def).name)}">${icon('zoom')}</button></div>`;
    }).join('')}</div>`).join('')}</div>
    <div class="sheet-foot"><span class="note">${esc(o.note ? o.note(SH.sel) : count)}</span>${o.readOnly ? '<button type="button" class="pill pill-solid" data-sh="close">Done</button>'
      : `${o.undo ? `<button type="button" class="pill" data-sh="undo">${icon('undo')}Take back</button>` : ''}<button type="button" class="pill pill-solid" data-sh="ok"${valid() ? '' : ' disabled'}>${esc(o.ok ? o.ok(SH.sel) : 'Confirm')}</button>`}</div>`;
}
function valid() {
  const o = SH.opts;
  if (o.setup) return SH.sel.length >= 1;
  return SH.sel.length >= o.min && SH.sel.length <= o.max;
}
function toggleChoice(id) {
  const o = SH.opts;
  if (o.readOnly) return;
  const k = SH.sel.indexOf(id);
  if (k >= 0) SH.sel.splice(k, 1);
  else if (o.setup) { if (SH.sel.length < 1 + o.max) SH.sel.push(id); }
  else if (o.max === 1) SH.sel = [id];
  else if (SH.sel.length < o.max) SH.sel.push(id);
  drawSheet();
  const b = SHEET.querySelector(`[data-ch="${CSS.escape(String(id))}"]`);
  if (b) b.focus({ preventScroll: true });
}
function closeSheet() {
  if (SHEET.hidden) return;
  SHEET.hidden = true;
  SHEET.innerHTML = '';
  SH.opts = null;
  if (INSP.hidden) SCRIM.hidden = true;
}

/* ============================================================
   9. Playing against the AI
   ============================================================ */
const PL = { on: false, keys: null, decks: null, seed: 0, answers: [], req: null, done: false, shown: -1, ui: 'idle', anim: 0, skip: null, setup: null, first: null, toastTurn: 0 };
const PB = { title: $('#pbTitle'), hint: $('#pbHint'), acts: $('#pbActs'), coach: $('#coach') };
const PLAY_PACE = 1.7, AI_PACE = 1.25;
const savedPlay = () => store.get(KEY.play, null);
function playStart(seed, answers, opts = {}) {
  const d0 = opts.decks ? null : deckByKey(S.seats[0]), d1 = opts.decks ? null : deckByKey(S.seats[1]);
  if (!opts.decks && (!d0 || !d1)) return;
  if (!opts.lesson) endLesson();
  stop();
  clearTimeout(PL.anim);
  closeSheet();
  closeInspector();
  const both = opts.decks || mirrorSafe(d0, d1);
  const labels = both.map((d) => d.name);
  const decks = [Object.assign({}, both[0], { name: 'You' }), both[1]];
  // Lessons are written for the normal AI; a game picks its level when it starts and keeps it when resumed
  const ai = opts.lesson ? 'normal' : opts.ai || S.ai;
  Object.assign(PL, { on: true, keys: opts.decks ? null : S.seats.slice(), decks, labels, ai, memo: opts.memo || {}, t0: Date.now(), career: opts.career != null ? opts.career : null, fin: opts.fin || null, finSeat: opts.finSeat || 0, setup: opts.setup || null, first: opts.first != null ? opts.first : null, seed, answers: (answers || []).slice(), req: null, done: false, shown: -1, skip: null, toastTurn: 0 });
  W.mode = 'play';
  W.seed = seed;
  W.decks = decks;
  W.replay = { frames: [], names: decks.map((d) => d.name), winner: null, reason: '', turns: 0 };
  T.table.classList.add('playing');
  T.banner.hidden = true;
  buildSides();
  setView('watch', !opts.replace);
  advance(false, true);
}
function endPlay() {
  if (!PL.on) return;
  PL.on = false;
  clearTimeout(PL.anim);
  PL.skip = null;
  W.mode = 'watch';
  T.table.classList.remove('playing');
  delete T.table.dataset.ui;
  $('#cSkip').hidden = true;
}
function runGame() {
  return A.play({ decks: PL.decks, seed: PL.seed, pool: DATA.pool, human: 0, answers: PL.answers, record: true, setup: PL.setup, first: PL.first, ai: [null, PL.ai], aiCache: PL.memo });
}
function advance(animate, first) {
  let r;
  try { r = runGame(); } catch (err) {
    // A saved game from an older version can fall out of step: keep the answers that still fit.
    const m = /answer (\d+)/.exec((err && err.message) || '');
    if (m && PL.answers.length > +m[1]) { PL.answers = PL.answers.slice(0, +m[1]); return advance(false, first); }
    throw err;
  }
  const G = r.G;
  W.replay = replayOf(G, PL.decks);
  if (r.need) W.replay.frames.push({ k: 'ask', text: '', turn: r.need.turn, who: r.need.active, s: r.need.s });
  if (first) { $('#matchup').innerHTML = matchupHTML(); requestAnimationFrame(measure); }
  buildLog();
  buildTicks();
  PL.done = !r.need;
  PL.req = r.need;
  const from = PL.shown;
  const end = W.replay.frames.length - 1;
  PL.shown = end;
  setUi('busy');
  if (animate && from >= 0 && end > from) runFrames(from + 1, end, () => settle());
  else { render(end, false); settle(); }
}
function runFrames(i, end, done) {
  clearTimeout(PL.anim);
  $('#cSkip').hidden = false;
  PL.skip = () => { clearTimeout(PL.anim); PL.skip = null; $('#cSkip').hidden = true; render(end, false); done(); };
  render(i, true);
  const f = W.replay.frames[i];
  if (f.k !== 'ask' && f.text) { PB.title.textContent = say(f.text); PB.hint.textContent = ''; }
  const next = () => { if (i >= end) { PL.skip = null; $('#cSkip').hidden = true; done(); } else runFrames(i + 1, end, done); };
  if (i >= end) { next(); return; }
  const mine = f.who === 0 && f.k !== 'turn';
  const pace = TU.on ? 1.1 : mine ? PLAY_PACE : AI_PACE;
  PL.anim = setTimeout(next, (frameDur(f) / pace) * (mine ? 0.6 : 1));
}
function settle() {
  const r = W.replay;
  if (PL.keys && PL.career == null && !PL.fin) store.set(KEY.play, { v: 2, a: PL.keys[0], b: PL.keys[1], seed: PL.seed, answers: PL.answers, ai: PL.ai, memo: PL.ai === 'hard' ? PL.memo : undefined, turn: PL.done ? r.turns : PL.req.turn, names: PL.labels, at: Date.now(), done: PL.done || undefined });
  if (PL.career != null) store.set(CR_GAME, { k: PL.career, seed: PL.seed, answers: PL.answers, ai: PL.ai, memo: PL.ai === 'hard' ? PL.memo : undefined, turn: PL.done ? r.turns : PL.req.turn, done: PL.done || undefined });
  if (PL.fin && window.finalsSave) finalsSave();
  if (PL.done) {
    journalRecord();
    if (PL.career != null) careerResult();
    if (PL.fin && window.finalsResult) finalsResult();
    setUi('over');
    showBanner();
    if (TU.on && r.winner === 0) markLessonDone(TU.lesson.id);
    return;
  }
  const req = PL.req;
  if (req.active === 0 && req.turn > 0 && PL.toastTurn !== req.turn && req.type === 'act') { PL.toastTurn = req.turn; toast('Your turn'); }
  openRequest(req);
}
function openRequest(req) {
  coachFor(req);
  if (req.type === 'act') setUi('act');
  else if (req.type === 'target') setUi('target');
  else if (req.type === 'yes' || req.type === 'option' || req.type === 'first') setUi('ask');
  else { setUi('sheet'); openChoice(req); }
}
function setUi(ui) {
  PL.ui = ui;
  T.table.dataset.ui = ui;
  renderPlaybar();
  decorate();
}
function answer(a) {
  if (!PL.on || PL.done || PL.ui === 'busy' || PL.ui === 'over') return;
  if (coachOn()) {
    if (!TUTOR.matches(TU.exp, a, coachCtx())) { nudge('Not quite. Follow the coach for this one.'); return; }
    TU.step++;
  }
  T.toast.hidden = true;
  PL.answers.push(a);
  closeSheet();
  closeInspector();
  advance(true);
}
function undo() {
  if (!PL.on || !PL.answers.length || coachOn()) return;
  clearTimeout(PL.anim);
  PL.skip = null;
  PL.answers.pop();
  // undoing a choice inside an action takes back the action too
  closeSheet();
  closeInspector();
  T.banner.hidden = true;
  PL.shown = -1;
  advance(false);
}
const curFrame = () => W.replay.frames[W.i];
function nameOfId(id) {
  const f = W.replay.frames[W.replay.frames.length - 1];
  const m = snapMon(f, id);
  if (m) return def(m.d).name;
  for (const ps of f.s.p) { const h = ps.hand.find(([x]) => x === id); if (h) return def(h[1]).name; }
  const req = PL.req;
  if (req && req.defs && req.defs[id]) return def(req.defs[id]).name;
  return '';
}
// A Pokémon's attacks as the engine numbers them: its own, then any a Technical Machine on it lends
const atksOfSnap = (m) => { const t = m.t && def(m.t); return t && t.tmAtks ? def(m.d).atks.concat(t.tmAtks) : def(m.d).atks; };
// What an attack costs right now: Bloodmoon Ursaluna ex's Blood Moon costs less for each Prize card the opponent has taken
function costNow(f, m, atk) {
  let cost = atk.cost;
  const cl = (def(m.d).abil || []).find((x) => x.k === 'costLess' && x.atk === atk.name.toLowerCase());
  if (cl) { let k = f.s.p[1 - monOwner(f, m.id)].taken || 0; while (k-- > 0 && cost.includes('C')) cost = cost.replace('C', ''); }
  return cost;
}
const coachCtx = () => ({ nameOf: nameOfId, atkName: (i) => { const m = curFrame().s.p[0].active; return m ? atksOfSnap(m)[i].name : ''; } });
const monName = (id) => { const f = curFrame(); const m = snapMon(f, id); return m ? def(m.d).name : 'that Pokémon'; };
const where = (id) => { const f = curFrame(); const p = monOwner(f, id); const ps = f.s.p[p]; const act = ps && ps.active && ps.active.id === id; return `${p === 1 ? "your opponent's " : ''}${act ? 'Active ' : 'Benched '}${monName(id)}`; };
function actLabel(a) {
  const f = curFrame();
  const hand = f.s.p[0].hand;
  const cardName = a.c != null ? (def((hand.find(([x]) => x === a.c) || [])[1] || '') || { name: 'card' }).name : '';
  switch (a.k) {
    case 'bench': return `Put ${cardName} on your Bench`;
    case 'evolve': return `Evolve your ${where(a.m).replace(/^your /, '')} into ${cardName}`;
    case 'energy': return `Attach ${cardName} to your ${where(a.m)}`;
    case 'tool': return `Attach ${cardName} to your ${where(a.m)}`;
    case 'play': return `Play ${cardName}`;
    case 'ability': { const m = snapMon(f, a.m); return `Use ${def(m.d).abil[a.i].name}`; }
    case 'stadium': return `Use ${def(f.s.stadium[1]).name}`;
    case 'retreat': return 'Retreat your Active Pokémon';
    case 'attack': { const m = f.s.p[0].active; return `Attack with ${atksOfSnap(m)[a.i].name}`; }
    case 'end': return 'End your turn';
    default: return a.k;
  }
}
function atkHTML(a) {
  const f = curFrame();
  const m = f.s.p[0].active;
  const atk = atksOfSnap(m)[a.i];
  return `<span class="pips">${pipsHTML(costNow(f, m, atk))}</span>${esc(atk.name)}${atk.base || atk.mod ? `<span class="dmgn">${atk.base || ''}${esc(atk.mod || '')}</span>` : ''}`;
}
const sameAct = (x, y) => x.k === y.k && x.c === y.c && x.m === y.m && x.i === y.i;
function optsForCard(id) { return PL.req && PL.req.type === 'act' ? PL.req.options.filter((a) => a.c === id) : []; }
function optsForMon(id) {
  if (!PL.req || PL.req.type !== 'act') return [];
  const mine = PL.req.options.filter((a) => a.m === id && a.c == null);
  const f = curFrame();
  const isAct = f.s.p[0].active && f.s.p[0].active.id === id;
  const more = isAct ? PL.req.options.filter((a) => a.k === 'attack' || a.k === 'retreat') : [];
  const fromHand = PL.req.options.filter((a) => a.m === id && a.c != null);
  return [...more.filter((a) => a.k === 'attack'), ...mine, ...more.filter((a) => a.k === 'retreat'), ...fromHand];
}
function whyNot(d) {
  const f = curFrame();
  const me = f.s.p[0];
  if (PL.ui !== 'act') return '';
  if (d.kind === 2) return me.energyUsed ? 'You have already attached an Energy card from your hand this turn.' : '';
  if (d.kind === 0 && d.stage > 0) return `Evolve a ${d.from} that has been in play since before this turn. Neither player can evolve on their first turn.`;
  if (d.kind === 0) return me.bench.length >= 5 ? 'Your Bench is full.' : '';
  if (d.trainer === 'supporter') return me.supporterUsed ? 'You can play only one Supporter each turn.' : f.s.turn === 1 ? "The player who goes first can't play a Supporter on their first turn." : "This card can't do anything right now.";
  if (d.trainer === 'stadium') return 'A Stadium with the same name is already in play, or you have played one this turn.';
  if (d.fx && d.fx[0] && d.fx[0].k === 'rareCandy') return "Rare Candy needs a Stage 2 card in your hand and a Basic Pokémon that has been in play since before this turn. It can't be used on your first turn.";
  return "This card can't do anything right now.";
}
function inspectHand(id, from) {
  const f = curFrame();
  const h = f.s.p[0].hand.find(([x]) => x === id);
  if (!h) return;
  const d = def(h[1]);
  const acts = optsForCard(id).map((a) => ({ a, label: actLabel(a) }));
  openInspector({ def: d, acts, why: acts.length ? '' : whyNot(d), from });
}
function inspectMon(id, from) {
  const f = curFrame();
  const m = snapMon(f, id);
  if (!m) return;
  const mine = monOwner(f, id) === 0 && W.mode === 'play';
  const acts = mine ? optsForMon(id).map((a) => ({ a, label: actLabel(a), html: a.k === 'attack' ? `${atkHTML(a)}` : null })) : [];
  openInspector({ def: def(m.d), mon: m, acts, from });
}
function renderPlaybar() {
  const req = PL.req;
  PB.acts.innerHTML = '';
  $('#cUndo').innerHTML = `${icon('undo')}Undo`;
  $('#cUndo').disabled = !PL.answers.length || coachOn() || PL.ui === 'busy';
  if (PL.ui === 'busy') { PB.hint.textContent = ''; return; }
  if (PL.ui === 'over') {
    PB.coach.hidden = true;
    const r = W.replay;
    PB.title.textContent = r.winner == null ? 'A draw' : r.winner === 0 ? 'You win' : 'You lose';
    PB.hint.textContent = say(r.reason);
    // the same next step the banner offers: a career game moves on or retries, a final replays that side
    const crSt = PL.career != null && CAR ? CAR.STAGES[PL.career] : null;
    const again = crSt ? (r.winner === 0 ? (crSt.boss ? '' : '<button type="button" class="pill pill-solid" data-b="crreward">Choose your reward</button>') : '<button type="button" class="pill pill-solid" data-b="crretry">Try again</button>')
      : PL.fin ? '<button type="button" class="pill pill-solid" data-b="finretry">Play it again</button>'
      : '<button type="button" class="pill pill-solid" data-b="rematch">Play again</button>';
    PB.acts.innerHTML = `${again}<button type="button" class="pill" data-b="toReplay">Watch the replay</button>`;
    if (TU.on) PB.acts.innerHTML = '';
    return;
  }
  if (!req) return;
  const btn = (label, data, solid, html) => `<button type="button" class="pill${solid ? ' pill-solid' : ''}" ${data}>${html || esc(label)}</button>`;
  let title = '', hint = '', acts = '';
  switch (req.type) {
    case 'act': {
      const f = curFrame();
      title = `<span class="pb-kicker">Turn ${f.s.turn}</span>Your turn`;
      const atks = req.options.filter((a) => a.k === 'attack');
      const firstTurnNoAtk = f.s.turn === 1 && req.options.every((a) => a.k !== 'attack');
      hint = atks.length ? 'Play cards from your hand or tap your Pokémon. Attacking ends your turn.' : firstTurnNoAtk && f.s.turn === 1 ? "Play cards from your hand. The player who goes first can't attack on their first turn." : 'Play cards from your hand or tap your Pokémon. None of your attacks can be used yet.';
      acts = atks.map((a) => btn('', `data-opt="${req.options.indexOf(a)}"`, true, atkHTML(a))).join('') + btn('End turn', 'data-b="end"', !atks.length);
      break;
    }
    case 'target': {
      title = TARGET_TEXT(req);
      hint = req.may ? 'Tap a highlighted Pokémon, or skip.' : 'Tap a highlighted Pokémon.';
      acts = req.ids.map((id) => btn(where(id).replace(/^./, (c) => c.toUpperCase()), `data-tgt="${id}"`)).join('') + (req.may ? btn('Skip', 'data-tgt="none"') : '');
      break;
    }
    case 'yes': {
      title = YES_TEXT(req);
      acts = btn('Yes', 'data-yes="1"', true) + btn('No', 'data-yes="0"');
      break;
    }
    case 'option': {
      title = req.reason === 'copyAttack' ? 'Choose the attack to copy' : 'Choose one';
      acts = req.options.map((o, k) => btn(o, `data-option="${k}"`, k === 0)).join('');
      break;
    }
    case 'first': {
      title = 'You won the coin flip';
      hint = 'Going first lets you set up first, but you can\'t attack or play a Supporter on that turn.';
      acts = btn('Go first', 'data-first="1"', true) + btn('Go second', 'data-first="0"');
      break;
    }
    default: {
      title = SHEET_TEXT(req).title;
      acts = btn('Choose', 'data-b="reopen"', true);
    }
  }
  PB.title.innerHTML = title;
  PB.hint.textContent = coachOn() ? '' : hint;
  PB.acts.innerHTML = acts;
  refreshCoachBox();
}
// Mark what can be used right now.
function decorate() {
  for (const [k, el] of W.els) { el.classList.remove('can', 'pick'); }
  if (!PL.on || W.i !== W.replay.frames.length - 1) return;
  const req = PL.req;
  if (!req) return;
  if (PL.ui === 'act' && !coachOn()) {
    const ids = new Set(req.options.map((a) => a.c).filter((x) => x != null));
    for (const id of ids) { const el = W.els.get(`h${id}`); if (el) el.classList.add('can'); }
    const mons = new Set(req.options.filter((a) => a.c == null && a.m != null).map((a) => a.m));
    if (req.options.some((a) => a.k === 'attack' || a.k === 'retreat')) { const f = curFrame(); if (f.s.p[0].active) mons.add(f.s.p[0].active.id); }
    for (const id of mons) { const el = W.els.get(`m${id}`); if (el) el.classList.add('can'); }
  } else if (PL.ui === 'target') {
    for (const id of req.ids) { const el = W.els.get(`m${id}`); if (el) el.classList.add('pick'); }
  }
  decorateCoach();
}
const REASON_T = {
  gust: "Choose one of your opponent's Benched Pokémon to switch into the Active Spot",
  snipe: 'Choose the Pokémon to attack',
  heal: 'Choose a Pokémon to heal',
  switchIn: 'Choose a Benched Pokémon to switch in',
  moveEnergyTo: 'Move the Energy to which Pokémon?',
  shiftFrom: 'Move Energy from which Pokémon?',
  shiftTo: 'Move it to which Pokémon?',
  strip: 'Discard Energy from which Pokémon?',
  promote: 'Choose your new Active Pokémon',
  bench: 'Choose a Benched Pokémon to damage',
  benchOwn: 'Choose one of your Benched Pokémon to take the damage',
  toolScrap: 'Discard a Pokémon Tool from which Pokémon?',
  scoop: 'Choose a Pokémon to put back into your hand',
  candyBasic: 'Use Rare Candy on which Basic Pokémon?',
  retreatTo: 'Retreat: which Benched Pokémon comes in?',
  moveFrom: 'Move damage counters from which of your Pokémon?',
  moveTo: "Move them to which of your opponent's Pokémon?",
  tmEvolve: 'Evolve which Benched Pokémon?',
};
function TARGET_TEXT(req) {
  if (req.reason === 'attachTo') return `Attach ${req.def ? def(req.def).name : 'the Energy'} to which Pokémon?`;
  if (req.reason === 'counters') return `Put ${plural(req.n / 10 || 1, 'damage counter')} on which Pokémon?`;
  if (req.reason === 'heal' && req.n) return `Heal ${req.n} damage from which Pokémon?`;
  return REASON_T[req.reason] || 'Choose a Pokémon';
}
function YES_TEXT(req) {
  switch (req.reason) {
    case 'abilityTrigger': return `Use ${req.ability}?`;
    case 'allIn': return `Discard all Energy from ${monName(req.mon)} for ${req.n} more damage?`;
    case 'fuel': return `Discard ${plural(req.n, 'Energy', 'Energy')} for ${req.attack}?`;
    case 'stadiumBonus': return `Discard ${req.stadium} for ${req.n} more damage?`;
    case 'switchSelf': return `Switch ${monName(req.mon)} with one of your Benched Pokémon?`;
    default: return 'Do it?';
  }
}
function SHEET_TEXT(req) {
  const n = (k) => plural(k, 'card');
  const upTo = req.min === req.max ? `${req.max}` : req.min ? `${req.min} to ${req.max}` : `up to ${req.max}`;
  const fromName = req.card != null ? nameOfId(req.card) : '';
  switch (req.reason) {
    case 'search': return { title: 'Search your deck', sub: `Choose ${upTo} to put into your hand.` };
    case 'benchSearch': return { title: 'Search your deck for Basic Pokémon', sub: `Choose ${upTo} to put onto your Bench.` };
    case 'look': return { title: 'Look at the top of your deck', sub: `Choose ${upTo} to put into your hand. The rest go back.` };
    case 'evolve': case 'evolveFromDeck': return { title: 'Search your deck for an Evolution card', sub: 'Choose one to evolve with.' };
    case 'peek': return { title: 'Look at the top of your deck', sub: 'Choose one to keep.' };
    case 'attachEnergy': return { title: `Choose Energy from your ${req.from || 'deck'}`, sub: `Choose ${upTo} to attach.` };
    case 'cost': return { title: fromName ? `Discard for ${fromName}` : 'Discard a card', sub: `Choose ${n(req.min)} from your hand to discard.` };
    case 'discardEnergy': return { title: `Discard Energy from ${monName(req.mon)}`, sub: `Choose ${upTo}.` };
    case 'returnEnergy': return { title: `Choose Energy on ${monName(req.mon)}`, sub: `Choose ${upTo}.` };
    case 'moveEnergy': case 'shiftEnergy': return { title: `Move Energy from ${monName(req.mon)}`, sub: `Choose ${upTo} to move.` };
    case 'stripEnergy': return { title: `Discard Energy from ${monName(req.mon)}`, sub: `Choose ${upTo}.` };
    case 'discardHand': return { title: 'Discard from your hand', sub: `Choose ${n(req.min)} to discard.` };
    case 'fuel': return { title: `Discard Energy for ${req.attack}`, sub: `Each one adds damage. Choose ${upTo}.` };
    case 'fuelHand': return { title: `Discard Energy from your hand for ${req.attack}`, sub: `Each one adds damage. Choose ${upTo}.` };
    case 'retreatCost': return { title: 'Pay the Retreat Cost', sub: `Choose ${plural(req.min, 'Energy', 'Energy')} to discard from ${monName(req.mon)}.` };
    case 'rod': case 'recover': return { title: 'Choose from your discard pile', sub: `Choose ${upTo}.` };
    case 'revive': return { title: 'Choose Basic Pokémon from your discard pile', sub: `Choose ${upTo} to put onto your Bench.` };
    case 'discardOppHand': return { title: "Your opponent's hand", sub: req.min === req.max ? `Choose ${n(req.min)} to discard.` : `Choose ${upTo} to discard.` };
    case 'crispin': return { title: 'Search your deck for Basic Energy', sub: 'Choose up to 2 of different types: one goes into your hand, the other onto one of your Pokémon.' };
    case 'crispinAttach': return { title: 'Crispin', sub: 'Choose the Energy to attach. The other one goes into your hand.' };
    case 'candyStage2': return { title: 'Rare Candy', sub: 'Choose the Stage 2 Pokémon to evolve into.' };
    default: return { title: 'Choose cards', sub: `Choose ${upTo}.` };
  }
}
function openChoice(req) {
  if (req.type === 'setup') {
    openSheet({
      setup: true, max: req.max, title: 'Set up your Pokémon',
      sub: 'Tap a Basic Pokémon for your Active Spot first, then any you want on your Bench.',
      cards: req.cards.map((id) => ({ id, def: req.defs[id] })),
      note: (sel) => (sel.length ? `Active: ${def(req.defs[sel[0]]).name}${sel.length > 1 ? `. Bench: ${sel.length - 1}` : ''}` : 'Choose your Active Pokémon'),
      ok: () => 'Start the game', undo: PL.answers.length > 0 && !coachOn(),
      done: (sel) => answer({ type: 'setup', active: sel[0], bench: sel.slice(1) }),
    });
    return;
  }
  const t = SHEET_TEXT(req);
  const ids = req.cards;
  const sub = esc(t.sub);
  openSheet({
    min: req.min, max: req.max, title: t.title, sub,
    cards: ids.map((id) => ({ id, def: req.defs[id] })),
    ok: (sel) => (sel.length || req.min ? 'Confirm' : 'Choose none'), undo: PL.answers.length > 0 && !coachOn(),
    done: (sel) => answer({ type: 'pick', ids: sel }),
  });
}

/* ---------- small messages ---------- */
function toast(text) {
  T.toast.textContent = text;
  T.toast.hidden = false;
  clearTimeout(T.toast._h);
  T.toast._h = setTimeout(() => { T.toast.hidden = true; }, 1600);
}
function toReplay() {
  const r = W.replay;
  endPlay();
  W.mode = 'watch';
  W.replay = { ...r, frames: r.frames.filter((f) => f.k !== 'ask') };
  enterTable();
  T.table.classList.remove('playing');
  render(0, false);
  play();
  syncHash(false);
}
function renderResume() {
  const s = savedPlay();
  const box = $('#resume');
  if (!s || s.done || !deckByKey(s.a) || !deckByKey(s.b)) { box.hidden = true; return; }
  box.hidden = false;
  box.innerHTML = `<p><b>Game in progress</b> <span>${esc(s.names[0])} against ${esc(s.names[1])}, turn ${s.turn || 1}.</span></p><button type="button" class="pill pill-solid" data-b="resume">${icon('play')}Resume</button><button type="button" class="link-btn" data-b="discardSaved">Forget it</button>`;
}
// A saved game keeps the AI it started with (games saved before there was a choice were against the normal AI)
const savedOpts = (sv) => ({ ai: sv.ai === 'hard' ? 'hard' : 'normal', memo: sv.memo || null });
function resumeSaved() {
  const s = savedPlay();
  if (!s) return;
  S.seats = [s.a, s.b];
  saveSeats();
  playStart(s.seed, s.answers, savedOpts(s));
}

/* ============================================================
   10. Lessons
   ============================================================ */
const TUTOR = window.ARENA_TUTORIAL || { LESSONS: [], matches: () => true };
const TU = { on: false, lesson: null, step: 0, exp: null, next: null };
const lessonById = (id) => TUTOR.LESSONS.find((x) => x.id === id);
const tutDone = () => new Set((store.get(KEY.tut, null) || { done: [] }).done);
const coachOn = () => TU.on && !!TU.exp;
function markLessonDone(id) { const d = tutDone(); d.add(id); store.set(KEY.tut, { done: [...d] }); }
const LESSON_ART = { 'first-attack': 'first', 'pokemon-ex': 'ex' };
const lessonArt = (id) => `../img/lesson-${LESSON_ART[id] || id}.webp`;
function renderLearnBtn() {
  const done = tutDone().size, n = TUTOR.LESSONS.length;
  const head = done ? (done < n ? 'Continue the lessons' : 'Lessons complete') : 'New to the Pokémon TCG?';
  $('#learnBtn').innerHTML = `<img class="medal" src="../img/lesson-learn.webp" alt="" width="46" height="46"><span><b>${head}</b><span>${done ? `${done} of ${n} lessons done` : `Learn to play in ${n} short lessons`}</span></span>`;
  renderFinalsBtn();
}
function renderFinalsBtn() {
  const b = $('#finalsBtn');
  if (!b) return;
  const FIN = window.ARENA_FINALS;
  b.hidden = !FIN;
  if (FIN && typeof finalsBtnHTML === 'function') b.innerHTML = finalsBtnHTML();
}
function renderLessons() {
  const done = tutDone();
  const groups = [];
  for (const l of TUTOR.LESSONS) { let g = groups.find((x) => x.name === l.group); if (!g) groups.push(g = { name: l.group, items: [] }); g.items.push(l); }
  $('#lessons').innerHTML = groups.map((g) => `<section class="lsn-group"><h2>${esc(g.name)}</h2><div class="lsn-list">${g.items.map((l) => {
    const k = TUTOR.LESSONS.indexOf(l) + 1;
    const next = !done.has(l.id) && TUTOR.LESSONS.find((x) => !done.has(x.id)) === l;
    return `<button type="button" class="lsn${done.has(l.id) ? ' done' : ''}${next ? ' next' : ''}" data-lesson="${esc(l.id)}"><span class="lmedal"><img class="medal" src="${lessonArt(l.id)}" alt="" width="66" height="66" loading="lazy"><span class="no">${done.has(l.id) ? icon('check') : k}</span></span>`
      + `<span class="lt"><b>${esc(l.title)}<small>${esc(next ? 'Up next' : l.time)}</small></b><span>${esc(l.blurb)}</span></span></button>`;
  }).join('')}</div></section>`).join('');
}
function goLessons(push = true) { endLesson(); setView('learn', push); }
function lessonStart(id, replace) {
  const l = lessonById(id);
  if (!l) return;
  const pool = DATA.pool;
  const mk = (side) => ({ name: side.name, archetype: side.archetype || 'midrange', cards: (side.deckList || []).map((x) => def(x)).filter(Boolean) });
  Object.assign(TU, { on: true, lesson: l, step: 0, exp: null, next: TUTOR.LESSONS[TUTOR.LESSONS.indexOf(l) + 1] || null });
  playStart(l.seed || 7, [], { decks: [mk(l.you), mk(l.foe)], setup: l.setup, lesson: true, replace });
  void pool;
}
function endLesson() {
  if (!TU.on) return;
  Object.assign(TU, { on: false, lesson: null, step: 0, exp: null });
  PB.coach.hidden = true;
}
function coachFor(req) {
  if (!TU.on) { TU.exp = null; return; }
  const steps = TU.lesson.steps;
  TU.exp = TU.step < steps.length ? steps[TU.step] : null;
  void req;
}
function refreshCoachBox() {
  if (!TU.on) { PB.coach.hidden = true; return; }
  const s = TU.exp;
  const box = PB.coach;
  if (!s) {
    box.hidden = !TU.lesson;
    box.className = 'coach';
    box.innerHTML = `${icon('cap')}<div><b>${esc(TU.lesson.freeTitle || 'Your move')}</b><p>${esc(TU.lesson.free || 'Finish the game your way.')}</p></div>`;
    return;
  }
  box.hidden = false;
  box.className = 'coach';
  box.innerHTML = `${icon('cap')}<div><b>${esc(s.title)}</b><p>${esc(s.say)}</p></div>`;
}
function nudge(text) {
  const box = PB.coach;
  if (!TU.on) { toast(text); return; }
  box.classList.add('nudge');
  const p = box.querySelector('p');
  if (p) p.textContent = `${text} ${TU.exp ? TU.exp.say : ''}`;
  setTimeout(() => box.classList.remove('nudge'), 1600);
}
function decorateCoach() {
  if (!coachOn()) return;
  const e = TU.exp.do;
  const f = curFrame();
  const glow = (el) => el && el.classList.add('pick');
  if (e.target) for (const ps of f.s.p) for (const m of [ps.active, ...ps.bench]) if (m && def(m.d).name === e.target) glow(W.els.get(`m${m.id}`));
  if (e.act) {
    if (e.card) for (const [id, d] of f.s.p[0].hand) if (def(d).name === e.card) { glow(W.els.get(`h${id}`)); break; }
    if (e.act === 'retreat' && f.s.p[0].active) glow(W.els.get(`m${f.s.p[0].active.id}`));
    if (e.act === 'attack') $$('#pbActs [data-opt]').forEach((b) => { const a = PL.req.options[+b.dataset.opt]; if (a && coachCtx().atkName(a.i) === e.atk) b.classList.add('pick'); });
    if (e.act === 'ability' && e.on) for (const m of [f.s.p[0].active, ...f.s.p[0].bench]) if (m && def(m.d).name === e.on) { glow(W.els.get(`m${m.id}`)); break; }
  }
}

/* ============================================================
   11. Wiring
   ============================================================ */
function onBoardClick(e) {
  const t = e.target;
  if (t.closest('[data-b]')) return;
  const pile = t.closest('[data-pile]');
  if (pile) { if (pile.dataset.pile === 'discard') inspectDiscard(+pile.dataset.p); return; }
  if (t.closest('[data-stadium]')) {
    const f = curFrame();
    const acts = PL.on && PL.ui === 'act' && PL.req.options.some((a) => a.k === 'stadium') ? [{ a: { k: 'stadium' }, label: actLabel({ k: 'stadium' }) }] : [];
    openInspector({ def: def(f.s.stadium[1]), acts });
    return;
  }
  const monB = t.closest('.mon');
  if (monB) {
    const id = +monB.dataset.mon;
    if (PL.on && PL.ui === 'target' && PL.req.ids.includes(id)) { answer({ type: 'target', id }); return; }
    inspectMon(id, monB);
    return;
  }
  const hc = t.closest('[data-card]');
  if (hc) {
    const id = +hc.dataset.card;
    inspectEl(hc);
  }
}
function onButton(name) {
  switch (name) {
    case 'rematch': if (PL.keys) { S.seats = PL.keys.slice(); playStart(newSeed(), []); } return;
    case 'toReplay': toReplay(); return;
    case 'lobby': setView('lobby', true); return;
    case 'again': T.banner.hidden = true; render(0, false); play(); return;
    case 'newGame': watch(newSeed(), { replace: true }); return;
    case 'end': answer({ type: 'act', a: { k: 'end' } }); return;
    case 'reopen': if (PL.req) openChoice(PL.req); return;
    case 'resume': resumeSaved(); return;
    case 'discardSaved': store.del(KEY.play); renderResume(); return;
    case 'nextLesson': if (TU.next) lessonStart(TU.next.id, true); return;
    case 'retryLesson': lessonStart(TU.lesson.id, true); return;
    case 'lessons': goLessons(true); return;
    case 'career': openCareer(true); return;
    case 'crreward': CR.autoReward = true; openCareer(true); return;
    case 'crretry': careerStartFight(false); return;
    case 'finals': if (window.openFinals) openFinals(true); return;
    case 'finretry': if (window.finalsRetry) finalsRetry(); return;
    default:
  }
}
// A tab: the page it names; tapped again, back to the top of that page
function goNav(v) {
  if (S.view === v) { window.scrollTo({ top: 0, behavior: reduceMotion.matches ? 'auto' : 'smooth' }); return; }
  if (v === 'lobby') { if (S.view === 'watch' && TU.on) endLesson(); setView('lobby', true); return; }
  const open = { decks: window.openLibrary, career: window.openCareer, journal: window.openJournal }[v];
  if (typeof open === 'function') open(true);
}
function wire() {
  if (window.UI) UI.menu.mount($('#themeBtn'));
  $('#nav').addEventListener('click', (e) => {
    const a = e.target.closest('[data-nav]');
    if (!a || a.dataset.nav === 'cards' || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button) return;
    e.preventDefault();
    goNav(a.dataset.nav);
  });
  $('#aiSeg').addEventListener('click', (e) => { const b = e.target.closest('[data-ai]'); if (!b) return; S.ai = b.dataset.ai; store.set(KEY.ai, S.ai); renderAi(); });
  $('#toLobby').addEventListener('click', () => {
    if (S.view === 'watch' && TU.on) { goLessons(true); return; }
    const open = { decks: openLibrary, career: openCareer, finals: openFinals, journal: window.openJournal }[S.backTo];
    if (open) open(true); else setView('lobby', true);
  });
  $('#learnBtn').addEventListener('click', () => goLessons(true));
  $('#finalsBtn').addEventListener('click', () => openFinals(true));
  $('#finalsBody').addEventListener('click', (e) => {
    const b = e.target.closest('[data-fplay], [data-fdeck], [data-fwatch], [data-fai], [data-fres]');
    if (!b || b.disabled) return;
    if (b.dataset.fplay) finalStart(b.dataset.fplay);
    else if (b.dataset.fdeck) openDeckView(`f.${b.dataset.fdeck}`, b, 'finals');
    else if (b.dataset.fwatch) finalStart(b.dataset.fwatch, true);
    else if (b.dataset.fai) { S.ai = b.dataset.fai; store.set(KEY.ai, S.ai); renderAi(); renderFinals(); }
    else if (b.hasAttribute('data-fres')) finalsResume(false);
  });
  $('#lessons').addEventListener('click', (e) => { const b = e.target.closest('[data-lesson]'); if (b) lessonStart(b.dataset.lesson); });
  $('#playBtn').addEventListener('click', () => { S.backTo = null; playStart(newSeed(), []); });
  $('#watchBtn').addEventListener('click', () => { S.backTo = null; watch(newSeed()); });
  $('#simBtn').addEventListener('click', simulate);
  $('#randBtn').addEventListener('click', randomMatchup);
  $('#swapBtn').addEventListener('click', () => { S.seats.reverse(); S.sim = null; L.sim.hidden = true; saveSeats(); renderSeats(); syncHash(false); });
  L.sim.addEventListener('click', (e) => {
    const b = e.target.closest('[data-g]');
    if (!b || !S.sim) return;
    const g = S.sim.games[+b.dataset.g];
    S.seats = S.sim.keys.slice();
    watch(g.seed);
  });
  L.seats.addEventListener('click', (e) => {
    const z = e.target.closest('[data-zoom]');
    if (z) { openInspector({ def: def(z.dataset.zoom), from: z }); return; }
    const dv = e.target.closest('[data-dv]');
    if (dv) { openDeckView(dv.dataset.dv, dv, 'lobby'); return; }
    const l = e.target.closest('[data-list]');
    if (l) { const i = +l.dataset.list; if (openLists.has(i)) openLists.delete(i); else openLists.add(i); renderSeats(); return; }
    const s = e.target.closest('.seat');
    if (s) { S.active = +s.dataset.seat; renderSeats(); }
  });
  $('#srcSeg').addEventListener('click', (e) => { const b = e.target.closest('[data-src]'); if (!b) return; S.src = b.dataset.src; renderPick(); });
  L.pickBody.addEventListener('click', (e) => {
    const t = e.target.closest('.tile');
    if (t) { setSeat(t.dataset.key); return; }
    const ty = e.target.closest('[data-t]');
    if (ty) {
      const g = S.gen, k = ty.dataset.t;
      if (g.types.includes(k)) g.types = g.types.filter((x) => x !== k);
      else g.types = g.types.concat(k).slice(-2);
      g.types.sort((x, y) => PICK_TYPES.indexOf(x) - PICK_TYPES.indexOf(y));
      renderPick();
      return;
    }
    const ar = e.target.closest('[data-arch]');
    if (ar) { S.gen.arch = ar.dataset.arch; renderPick(); return; }
    if (e.target.closest('#genGo')) buildFromPanel(false);
    if (e.target.closest('#genRand')) buildFromPanel(true);
  });
  // the Decks page
  const lib = $('#libBody');
  let libTyping = 0;
  lib.addEventListener('input', (e) => {
    if (e.target.id !== 'libQ') return;
    clearTimeout(libTyping);
    libTyping = setTimeout(() => { LIB.q = e.target.value; renderLibrary(); }, 120);
  });
  lib.addEventListener('click', (e) => {
    const b = e.target.closest('[data-libsrc], [data-libarch], [data-libtype], [data-libreset], [data-libplay], [data-libopen], [data-lib]');
    if (!b) return;
    if (b.dataset.libsrc) { LIB.src = b.dataset.libsrc; libSave(); renderLibrary(); return; }
    if (b.dataset.libarch) { LIB.arch = b.dataset.libarch; libSave(); renderLibrary(); return; }
    if (b.dataset.libtype) { const t = b.dataset.libtype; LIB.types = LIB.types.includes(t) ? LIB.types.filter((x) => x !== t) : LIB.types.concat(t); libSave(); renderLibrary(); return; }
    if (b.hasAttribute('data-libreset')) { Object.assign(LIB, { src: 'all', q: '', arch: 'all', types: [] }); libSave(); renderLibrary(); return; }
    if (b.dataset.libplay) { libPlay(b.dataset.libplay, 'play'); return; }
    const key = b.dataset.libopen || b.dataset.lib;
    openDeckView(key, b.closest('[data-lib]') || b, 'library');
  });
  lib.addEventListener('keydown', (e) => {
    const t = e.target.closest('[data-lib]');
    if (t && e.target === t && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openDeckView(t.dataset.lib, t, 'library'); }
  });
  // Holding a deck tile in the lobby opens it instead of seating it
  const HOLD = { ms: 450, timer: 0, swallow: 0 };
  L.pickBody.addEventListener('pointerdown', (e) => {
    const t = e.target.closest('.tile[data-key]');
    if (!t || e.button) return;
    clearTimeout(HOLD.timer);
    const x = e.clientX, y = e.clientY;
    const cancel = () => { clearTimeout(HOLD.timer); removeEventListener('pointermove', moved); };
    const moved = (m) => { if (Math.hypot(m.clientX - x, m.clientY - y) > 10) cancel(); };
    addEventListener('pointermove', moved, { passive: true });
    addEventListener('pointerup', cancel, { once: true });
    addEventListener('pointercancel', cancel, { once: true });
    HOLD.timer = setTimeout(() => { removeEventListener('pointermove', moved); HOLD.swallow = Date.now(); if (navigator.vibrate) navigator.vibrate(8); openDeckView(t.dataset.key, t, 'lobby'); }, HOLD.ms);
  });
  L.pickBody.addEventListener('contextmenu', (e) => { if (e.target.closest('.tile[data-key]') && Date.now() - HOLD.swallow < 900) e.preventDefault(); });
  // the career
  $('#careerBody').addEventListener('click', (e) => {
    const p = e.target.closest('[data-crpartner]');
    if (p) { careerSave(CAR.newRun(p.dataset.crpartner)); renderCareer(); window.scrollTo({ top: 0 }); return; }
    const z = e.target.closest('[data-zoom]');
    if (z) { openInspector({ def: def(z.dataset.zoom), from: z }); return; }
    const b = e.target.closest('[data-cr]');
    if (!b) return;
    const run = careerRun();
    switch (b.dataset.cr) {
      case 'fight': careerStartFight(false); break;
      case 'resume': careerStartFight(true); break;
      case 'reward': openReward(); break;
      case 'deck': openDeckView('cr.me', b, 'career'); break;
      case 'foe': if (run) openDeckView(`cr.${run.stage}`, b, 'career'); break;
      case 'new': store.del(CR_GAME); CR.run = null; store.del(CR_KEY); DECKS.delete('cr.me'); renderCareer(); window.scrollTo({ top: 0 }); break;
      case 'reset':
        if (!b.dataset.armed) { b.dataset.armed = '1'; b.textContent = 'Tap again to start over'; setTimeout(() => { if (b.isConnected) { delete b.dataset.armed; b.textContent = 'Start the journey over'; } }, 3000); return; }
        store.del(CR_GAME); CR.run = null; store.del(CR_KEY); DECKS.delete('cr.me'); renderCareer(); window.scrollTo({ top: 0 });
        break;
      default:
    }
  });
  $('#crReward').addEventListener('click', (e) => {
    if (e.target.closest('[data-rw="close"]')) { closeReward(); return; }
    const t = e.target.closest('[data-take]');
    if (t) { takeReward(+t.dataset.take); return; }
    const z = e.target.closest('[data-zoom]');
    if (z) openInspector({ def: def(z.dataset.zoom), from: z });
  });
  // the journal
  $('#journalBody').addEventListener('click', (e) => {
    const f = e.target.closest('[data-jf]');
    if (f) { JV.filter = f.dataset.jf; store.set('holo.arena.jfilter.v1', JV.filter); JV.shown = 40; renderJournal(); return; }
    const b = e.target.closest('[data-jr]');
    if (!b) return;
    if (b.dataset.jr === 'more') { JV.shown += 60; renderJournal(); return; }
    if (b.dataset.jr === 'play') { setView('lobby', true); return; }
    if (b.dataset.jr === 'clear') {
      if (!b.dataset.armed) { b.dataset.armed = '1'; b.textContent = 'Tap again to clear every game'; setTimeout(() => { if (b.isConnected) { delete b.dataset.armed; b.textContent = 'Clear the journal'; } }, 3000); return; }
      store.set('holo.arena.journal.v1', []); renderJournal();
    }
  });
  addEventListener('scroll', () => jTip(), { passive: true });
  // the deck view
  const dvb = $('#deckView');
  dvb.addEventListener('click', async (e) => {
    if (e.target.closest('[data-dvclose]')) { closeDeckView(); return; }
    const pg = e.target.closest('[data-dvpage]');
    if (pg) { pageDeck(+pg.dataset.dvpage); return; }
    const md = e.target.closest('[data-dvmode]');
    if (md) { DV.mode = md.dataset.dvmode; store.set('holo.arena.dvmode.v1', DV.mode); renderDeckCards(deckByKey(DV.key)); return; }
    if (e.target.closest('[data-dvcopy]')) { const ok = await copyText(deckText(deckByKey(DV.key))); pageToast(ok ? 'List copied. Paste it into Pokémon TCG Live to build the deck.' : "The list couldn't be copied here."); return; }
    const z = e.target.closest('[data-zoom]');
    if (z) { openInspector({ def: def(z.dataset.zoom), from: z }); return; }
    const st = e.target.closest('[data-dvseat]');
    if (st) { S.active = +st.dataset.dvseat; setSeat(DV.key); closeDeckView(); return; }
    const pl = e.target.closest('[data-dvplay]');
    if (pl) libPlay(DV.key, pl.dataset.dvplay);
  });
  if (window.UI) {
    UI.swipe(INSP, { ignore: () => !INS.page, move: (dx, paged) => { const el = INSP.querySelector('.insp-page'); if (el && INS.page) UI.drag(el, dx, INS.page.i > 0, INS.page.i < INS.page.items.length - 1, paged); }, swipe: (dir) => pageInspector(dir) });
    UI.wheel(INSP, { ignore: () => !INS.page, swipe: (dir) => pageInspector(dir) });
    UI.swipe(dvb, {
      ignore: () => !DV.set || !INSP.hidden,
      move: (dx, paged) => UI.drag($('#deckView .dv-box'), dx, DV.set && DV.set.i > 0, DV.set && DV.set.i < DV.set.items.length - 1, paged),
      swipe: (dir) => pageDeck(dir),
    });
    UI.wheel(dvb, { ignore: () => !DV.set || !INSP.hidden, swipe: (dir) => pageDeck(dir) });
  }
  // table
  T.board.addEventListener('click', onBoardClick);
  T.board.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[data-card]')) { e.preventDefault(); onBoardClick(e); } });
  T.banner.addEventListener('click', (e) => { const b = e.target.closest('[data-b]'); if (b) onButton(b.dataset.b); });
  $('#playbar').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || !PL.on) return;
    if (b.dataset.b) { onButton(b.dataset.b); return; }
    if (b.dataset.opt != null) { answer({ type: 'act', a: PL.req.options[+b.dataset.opt] }); return; }
    if (b.dataset.tgt != null) { answer({ type: 'target', id: b.dataset.tgt === 'none' ? null : +b.dataset.tgt }); return; }
    if (b.dataset.yes != null) { answer({ type: 'yes', yes: b.dataset.yes === '1' }); return; }
    if (b.dataset.option != null) { answer({ type: 'option', i: +b.dataset.option }); return; }
    if (b.dataset.first != null) answer({ type: 'first', first: b.dataset.first === '1' });
  });
  $('#cUndo').addEventListener('click', undo);
  $('#cSkip').addEventListener('click', () => { if (PL.skip) PL.skip(); });
  $('#cFirst').innerHTML = icon('first'); $('#cPrev').innerHTML = icon('prev'); $('#cNext').innerHTML = icon('next'); $('#cLast').innerHTML = icon('last');
  T.hands.innerHTML = icon('eye'); $('#cLog').innerHTML = icon('log'); $('#logClose').innerHTML = icon('x');
  setPlayIcon();
  $('#cFirst').addEventListener('click', () => { stop(); render(0, false); });
  $('#cLast').addEventListener('click', () => { stop(); render(W.replay.frames.length - 1, false); });
  $('#cPrev').addEventListener('click', () => step(-1));
  $('#cNext').addEventListener('click', () => step(1));
  T.play.addEventListener('click', () => (W.playing ? stop() : play()));
  T.scrub.addEventListener('input', () => { stop(); render(+T.scrub.value, false); });
  $('#speedSeg').innerHTML = SPEEDS.map((v) => `<button type="button" data-speed="${v}" aria-pressed="${v === W.speed}">${v}x</button>`).join('');
  $('#speedSeg').addEventListener('click', (e) => { const b = e.target.closest('[data-speed]'); if (b) setSpeed(+b.dataset.speed); });
  $('#speedOne').addEventListener('click', () => setSpeed(SPEEDS[(SPEEDS.indexOf(W.speed) + 1) % SPEEDS.length]));
  setSpeed(SPEEDS.includes(W.speed) ? W.speed : 1);
  T.hands.setAttribute('aria-pressed', String(W.hands));
  T.hands.addEventListener('click', () => { W.hands = !W.hands; store.set(KEY.hands, W.hands); T.hands.setAttribute('aria-pressed', String(W.hands)); measure(); render(W.i, false); });
  $('#cLog').addEventListener('click', () => (T.logpane.classList.contains('open') ? closeLog() : openLog()));
  $('#logClose').addEventListener('click', closeLog);
  T.log.addEventListener('click', (e) => {
    const b = e.target.closest('[data-i]');
    if (!b) return;
    if (W.mode === 'play') return;
    stop();
    render(+b.dataset.i, false);
  });
  // inspector and sheet
  INSP.addEventListener('click', (e) => {
    if (e.target.closest('[data-close]')) { closeInspector(); return; }
    const pgb = e.target.closest('[data-page]');
    if (pgb) { pageInspector(+pgb.dataset.page, null, true); return; }
    const kt = e.target.closest('.kwt');
    if (kt) { showGloss(kt.dataset.gl); return; }
    const b = e.target.closest('[data-act]');
    if (b) { const x = INSP._acts[+b.dataset.act]; closeInspector(); if (x && x.a) answer({ type: 'act', a: x.a }); }
  });
  SCRIM.addEventListener('click', () => { if (!INSP.hidden) closeInspector(); else if (SH.opts && SH.opts.readOnly) closeSheet(); });
  SHEET.addEventListener('click', (e) => {
    const z = e.target.closest('[data-zoomdef]');
    if (z) { openInspector({ def: def(z.dataset.zoomdef), from: z }); return; }
    const c = e.target.closest('[data-ch]');
    if (c && !c.dataset.ro) { toggleChoice(isNaN(+c.dataset.ch) ? c.dataset.ch : +c.dataset.ch); return; }
    const a = e.target.closest('[data-sh]');
    if (!a) return;
    if (a.dataset.sh === 'close') closeSheet();
    else if (a.dataset.sh === 'undo') undo();
    else if (a.dataset.sh === 'ok' && valid()) { const sel = SH.sel.slice(); const done = SH.opts.done; closeSheet(); done(sel); }
  });
  document.addEventListener('keydown', (e) => {
    if (!INSP.hidden && INS.page && !e.target.closest('input, textarea') && !e.metaKey && !e.ctrlKey && !e.altKey) {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); pageInspector(e.key === 'ArrowLeft' ? -1 : 1); return; }
      if (e.key === 'Home' || e.key === 'End') { e.preventDefault(); pageInspector(0, e.key === 'Home' ? 0 : INS.page.items.length - 1); return; }
    }
    if (e.key === 'Escape') { if (!INSP.hidden) { closeInspector(); return; } if (!$('#deckView').hidden) { closeDeckView(); return; } if (!$('#crReward').hidden) { closeReward(); return; } if (SH.opts && SH.opts.readOnly) { closeSheet(); return; } if (T.logpane.classList.contains('open')) closeLog(); return; }
    const arrow = /^Arrow(Left|Right|Up|Down)$/.test(e.key) && !e.metaKey && !e.ctrlKey && !e.altKey;
    if (!$('#deckView').hidden && INSP.hidden && !e.target.closest('input, textarea')) {
      // on one of the deck's cards the arrows move between its cards; anywhere else ← → turn to the next deck
      if (arrow && e.target.closest('#dvCards [data-zoom]') && window.UI && UI.arrows(e, $$('#dvCards [data-zoom]'))) return;
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); pageDeck(e.key === 'ArrowLeft' ? -1 : 1); }
      return;
    }
    if (!INSP.hidden || !SHEET.hidden || e.target.closest('input, textarea, select') || (window.UI && UI.keys.isOpen())) return;
    // '/' searches the decks
    if (e.key === '/' && !e.metaKey && !e.ctrlKey) { e.preventDefault(); if (S.view !== 'decks') openLibrary(true); const q = $('#libQ'); if (q) { q.focus(); q.select(); } return; }
    // lists of decks, lessons and finals: the arrows move between them
    if (arrow && S.view !== 'watch' && window.UI) {
      const lists = { lobby: '#pickBody .tile', decks: '#libBody .lib-tile', learn: '#lessons [data-lesson]', finals: '#finalsBody [data-fplay]:not([disabled]), #finalsBody [data-fdeck]' };
      const sel = lists[S.view];
      if (sel && e.target.closest && e.target.matches(sel)) { UI.arrows(e, $$(sel)); return; }
    }
    if (S.view !== 'watch') return;
    // on the table: the arrows move between the cards in play and in the hands; Enter or I reads the one you're on
    const onCard = e.target.closest && e.target.closest('#board .mon, #board [data-card]');
    if (arrow && onCard && window.UI) { UI.arrows(e, $$('#board .mon, #board [data-card]').filter((x) => x.getClientRects().length && !x.classList.contains('back'))); return; }
    if ((e.key === 'i' || e.key === 'I') && onCard && !e.metaKey && !e.ctrlKey) { e.preventDefault(); inspectEl(onCard); return; }
    if ((e.key === 'l' || e.key === 'L') && !e.metaKey && !e.ctrlKey) { e.preventDefault(); if (T.logpane.classList.contains('open')) closeLog(); else openLog(); return; }
    if (W.mode === 'watch') {
      if (e.key === ' ' && !e.target.closest('button')) { e.preventDefault(); W.playing ? stop() : play(); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); e.shiftKey ? jumpTurn(1) : step(1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); e.shiftKey ? jumpTurn(-1) : step(-1); }
      else if ((e.key === 'h' || e.key === 'H') && !e.metaKey && !e.ctrlKey) { e.preventDefault(); T.hands.click(); }
    } else if (((e.metaKey || e.ctrlKey) && e.key === 'z') || (e.key === 'z' && !e.metaKey && !e.ctrlKey && !e.altKey)) { e.preventDefault(); undo(); }
  });
  if (window.UI) UI.keys.set(() => [
    { title: 'Anywhere', rows: [[['?'], 'These shortcuts'], [['/'], 'Search the decks'], [['Esc'], "Close the card, deck or log that's open"]] },
    { title: 'Lists of decks, lessons and finals', rows: [[['←', '↑', '→', '↓'], 'Move between them'], [['Enter'], "Open the one you're on"]] },
    { title: "A card you've opened", rows: [[['←', '→'], 'The card before or after it: on the same side of the table, in the same hand or deck, or among the same choices'], [['Home', 'End'], 'The first or last of them']] },
    { title: "A deck you've opened", rows: [[['←', '→'], 'The deck before or after it in the list'], [['←', '↑', '→', '↓'], "Move between its cards, once you're on one"]] },
    { title: 'Watching a game', rows: [[['Space'], 'Play or pause'], [['←', '→'], 'Step back or forward'], [['Shift', '←', '→'], 'A turn back or forward'], [['H'], 'Show or hide the hands'], [['L'], 'The game log']] },
    { title: 'Playing a game', rows: [[['←', '↑', '→', '↓'], 'Move between the cards on the table and in your hand'], [['Enter'], "Read the card you're on, with what you can do with it"], [['Z'], 'Undo'], [['L'], 'The game log']] },
  ]);
  let rz = 0;
  addEventListener('resize', () => { cancelAnimationFrame(rz); rz = requestAnimationFrame(() => { headerHeight(); measure(); if (S.view === 'journal' && $('#jrLine')) renderJournal(); }); });
  // Back closes whatever is open on top (a card, a deck) before it leaves the page
  addEventListener('popstate', (e) => { if (window.UI && UI.overlay.pop(e)) return; route(); });
}
function route() {
  const h = readHash();
  if (location.hash === '#decks') { setView('decks', false); return; }
  if (location.hash === '#journal') { openJournal(false); return; }
  if (location.hash === '#career') { openCareer(false); return; }
  if (location.hash === '#finals') { openFinals(false); return; }
  if (h.lesson && lessonById(h.lesson)) { lessonStart(h.lesson, true); return; }
  if (h.learn || location.hash === '#learn') { setView('learn', false); return; }
  if (h.a) S.seats[0] = h.a.key;
  if (h.b) S.seats[1] = h.b.key;
  saveSeats();
  if (h.play != null) {
    const g = finGame();
    if (g && !g.done && g.seed === h.play && S.seats[0] === `f.${g.id}` && finalsResume(true)) return;
    const s = savedPlay();
    if (s && s.seed === h.play && s.a === S.seats[0] && s.b === S.seats[1]) playStart(s.seed, s.answers, Object.assign(savedOpts(s), { replace: true }));
    else playStart(h.play, [], { replace: true });
    return;
  }
  if (h.seed != null) { watch(h.seed, { replace: true, autoplay: false }); return; }
  setView('lobby', false);
}

/* ============================================================
   12. Start
   ============================================================ */
async function boot() {
  headerHeight();
  wire();
  try {
    const res = await fetch('cards.json?v=2026-11-29');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    DATA.pool = A.loadPool(json);
  } catch (err) {
    L.boot.textContent = `The card pool didn't load (${err.message}). Reload the page to try again.`;
    L.boot.classList.remove('boot');
    return;
  }
  $('#poolCount').textContent = nf.format(DATA.pool.list.length);
  const saved = store.get(KEY.seats, null);
  const defs = [`c.${window.ARENA_DECKS[0].id}`, `c.${window.ARENA_DECKS[2].id}`];
  S.seats = [0, 1].map((i) => (saved && deckByKey(saved[i]) ? saved[i] : defs[i]));
  S.recent = store.get(KEY.recent, []).filter((k) => deckByKey(k));
  L.boot.hidden = true;
  L.body.hidden = false;
  renderButtons();
  renderPick();
  renderSeats();
  renderAi();
  renderLearnBtn();
  route();
}
window.HOLO_ARENA = { S, W, PL, TU, deckByKey, answer, render, get pool() { return DATA.pool; } };
boot();
})();
