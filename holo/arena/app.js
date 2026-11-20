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
  return null;
}
const newSeed = () => (Math.random() * 2 ** 31) >>> 0;
const forEngine = (d, name) => ({ name: name || d.name, archetype: d.archetype, cards: d.cards });
function mirrorSafe(d0, d1) {
  return [forEngine(d0), forEngine(d1, d0.name === d1.name ? `${d1.name} (mirror)` : d1.name)];
}

/* ============================================================
   4. Lobby state and the address bar
   ============================================================ */
const S = { view: 'lobby', seats: [null, null], active: 0, src: 'claude', gen: { types: ['R'], arch: 'aggro' }, recent: [], sim: null };
const KEY = { seats: 'holo.arena.seats.v1', recent: 'holo.arena.recent.v1', play: 'holo.arena.play.v1', hands: 'holo.arena.hands.v1', speed: 'holo.arena.speed.v1', tut: 'holo.arena.tut.v1' };
const saveSeats = () => store.set(KEY.seats, S.seats);
function hashFor() {
  if (S.view === 'learn') return '#learn';
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
function metaHTML(d) {
  return `<div class="deck-meta"><span class="pips">${pipsHTML(d.types.join(''))}</span><span class="arch">${ARCH[d.archetype]}</span><span>${d.by === 'claude' ? 'Designed by Claude' : 'Built by the generator'}</span></div>`;
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
      + `<div class="seat-foot"><button type="button" class="link-btn" data-list="${i}" aria-expanded="${open}">${open ? 'Hide the list' : `See all ${d.size} cards`}</button><span class="faint">${d.mons} Pokémon, ${d.trainers} Trainers, ${d.energy} Energy</span></div>`
      + `${open ? listHTML(d) : ''}</div></div>`;
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
function setView(view, push) {
  const was = S.view;
  S.view = view;
  $('#lobby').hidden = view !== 'lobby';
  $('#learn').hidden = view !== 'learn';
  $('#watch').hidden = view !== 'watch';
  document.body.classList.toggle('watching', view === 'watch');
  document.body.classList.toggle('in-game', view === 'watch');
  const back = $('#toLobby');
  back.hidden = view === 'lobby';
  back.innerHTML = `${icon('back')}${view === 'watch' && TU.on ? 'Lessons' : 'Lobby'}`;
  $('#matchup').hidden = view !== 'watch';
  if (view !== 'watch') { stop(); endPlay(); closeInspector(); closeSheet(); }
  if (view === 'lobby') { renderResume(); renderLearnBtn(); renderSeats(); }
  if (view === 'learn') renderLessons();
  if (view === 'watch') requestAnimationFrame(measure);
  if (was !== view) window.scrollTo(0, 0);
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
function buildSides() {
  for (const p of [0, 1]) {
    const el = T.sides[p];
    el.innerHTML = `
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
  const title = r.winner == null ? 'A draw' : W.mode === 'play' ? (r.winner === 0 ? 'You win' : 'You lose') : `${r.names[r.winner]} wins`;
  let acts = '';
  if (TU.on) {
    acts = r.winner === 0
      ? `${TU.next ? '<button type="button" class="pill pill-solid" data-b="nextLesson">Next lesson</button>' : ''}<button type="button" class="pill" data-b="lessons">All lessons</button>`
      : '<button type="button" class="pill pill-solid" data-b="retryLesson">Try again</button><button type="button" class="pill" data-b="lessons">All lessons</button>';
  } else if (W.mode === 'play') {
    acts = '<button type="button" class="pill pill-solid" data-b="rematch">Play again</button><button type="button" class="pill" data-b="toReplay">Watch the replay</button><button type="button" class="pill" data-b="lobby">Lobby</button>';
  } else {
    acts = '<button type="button" class="pill pill-solid" data-b="again">Watch again</button><button type="button" class="pill" data-b="newGame">New game</button><button type="button" class="pill" data-b="lobby">Lobby</button>';
  }
  const sub = TU.on && r.winner === 0 ? esc(TU.lesson.outro || say(r.reason)) : esc(say(r.reason));
  T.banner.innerHTML = `<h2>${esc(TU.on && r.winner === 0 ? 'Lesson complete' : title)}</h2><p>${sub}</p><div class="acts">${acts}</div>`;
  T.banner.hidden = false;
}

/* ---------- Watching a game ---------- */
function replayOf(G, decks) {
  return { frames: G.frames, names: decks.map((d) => d.name), winner: G.winner, reason: G.reason, turns: G.turn, first: G.first };
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
   7. Inspector: one card, big, with what you can do with it
   ============================================================ */
const INSP = $('#insp'), SCRIM = $('#scrim');
let inspReturn = null;
function cardText(d) {
  const out = [];
  for (const a of d.abil || []) out.push(`<div class="block"><p class="k">Ability</p><b>${esc(a.name)}</b>${a.text ? `<p>${esc(a.text)}</p>` : ''}</div>`);
  for (const a of d.atks || []) out.push(`<div class="block"><div class="atk-top"><span class="pips">${a.cost ? pipsHTML(a.cost) : '<span class="muted">Free</span>'}</span><b>${esc(a.name)}</b>${a.base || a.mod ? `<span class="dmg">${a.base || ''}${esc(a.mod || '')}</span>` : ''}</div>${a.text ? `<p>${esc(a.text)}</p>` : ''}</div>`);
  if (d.kind === 1 && d.text) out.push(`<div class="block"><p>${esc(d.text)}</p></div>`);
  if (d.kind === 0) {
    const w = (d.weak || []).map((x) => `${pipHTML(x.t)} ${esc(x.v)}`).join(' ') || 'none';
    const r = (d.res || []).map((x) => `${pipHTML(x.t)} ${x.v}`).join(' ') || 'none';
    out.push(`<div class="wrr"><span>Weakness ${w}</span><span>Resistance ${r}</span><span>Retreat ${d.retreat ? pipsHTML('C'.repeat(d.retreat)) : 'free'}</span>${d.prizes > 1 ? `<span>Gives up ${d.prizes} Prize cards</span>` : ''}</div>`);
  }
  return out.join('');
}
function openInspector(opts) {
  // opts: { def, mon (snapshot), acts: [{label, html, a}], why, title }
  const d = opts.def;
  inspReturn = document.activeElement;
  const m = opts.mon;
  const state = [];
  if (m) {
    state.push(`<span>${Math.max(0, m.hp - m.dmg)} of ${m.hp} HP left</span>`);
    if (m.e) state.push(`<span>Energy ${pipsHTML(m.e)}</span>`);
    if (m.t) state.push(`<span>${esc(def(m.t).name)} attached</span>`);
    for (const c of m.c || []) state.push(`<span>${A.COND_WORD[c]}</span>`);
  }
  const hp = d.kind === 0 ? ` <span class="pips">${pipsHTML(d.types)}</span>` : '';
  INSP.innerHTML = `<div class="big">${cardHTML(d, { big: true })}</div>
    <div><h2 id="inspName">${esc(d.name)}</h2><p class="line">${esc(stageLine(d))}${d.kind === 0 ? `, ${d.hp} HP` : ''}${hp}</p>
    ${state.length ? `<div class="state">${state.join('')}</div>` : ''}
    ${m && m.st ? `<div class="stack">${m.st.map((x) => cardHTML(def(x), { alt: def(x).name })).join('')}</div>` : ''}
    ${cardText(d)}
    ${opts.acts && opts.acts.length ? `<div class="acts">${opts.acts.map((x, k) => `<button type="button" class="pill${k === 0 ? ' pill-solid' : ''}" data-act="${k}">${x.html || esc(x.label)}</button>`).join('')}</div>` : ''}
    ${opts.why ? `<p class="why">${esc(opts.why)}</p>` : ''}</div>
    <button type="button" class="icon-btn x" data-close="1" aria-label="Close">${icon('x')}</button>`;
  INSP._acts = opts.acts || [];
  INSP.hidden = false;
  SCRIM.hidden = false;
  const btn = INSP.querySelector('[data-act="0"]') || INSP.querySelector('[data-close]');
  btn.focus({ preventScroll: true });
}
function closeInspector() {
  if (INSP.hidden) return;
  INSP.hidden = true;
  if ($('#sheet').hidden) SCRIM.hidden = true;
  INSP.innerHTML = '';
  if (inspReturn && inspReturn.isConnected) inspReturn.focus({ preventScroll: true });
  inspReturn = null;
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
  Object.assign(PL, { on: true, keys: opts.decks ? null : S.seats.slice(), decks, labels, setup: opts.setup || null, first: opts.first != null ? opts.first : null, seed, answers: (answers || []).slice(), req: null, done: false, shown: -1, skip: null, toastTurn: 0 });
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
  return A.play({ decks: PL.decks, seed: PL.seed, pool: DATA.pool, human: 0, answers: PL.answers, record: true, setup: PL.setup, first: PL.first });
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
  if (PL.keys) store.set(KEY.play, { v: 1, a: PL.keys[0], b: PL.keys[1], seed: PL.seed, answers: PL.answers, turn: PL.done ? r.turns : PL.req.turn, names: PL.labels, at: Date.now(), done: PL.done || undefined });
  if (PL.done) {
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
const coachCtx = () => ({ nameOf: nameOfId, atkName: (i) => { const m = curFrame().s.p[0].active; return m ? def(m.d).atks[i].name : ''; } });
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
    case 'attack': { const m = f.s.p[0].active; return `Attack with ${def(m.d).atks[a.i].name}`; }
    case 'end': return 'End your turn';
    default: return a.k;
  }
}
function atkHTML(a) {
  const f = curFrame();
  const m = f.s.p[0].active;
  const atk = def(m.d).atks[a.i];
  return `<span class="pips">${pipsHTML(atk.cost)}</span>${esc(atk.name)}${atk.base || atk.mod ? `<span class="dmgn">${atk.base || ''}${esc(atk.mod || '')}</span>` : ''}`;
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
function inspectHand(id) {
  const f = curFrame();
  const h = f.s.p[0].hand.find(([x]) => x === id);
  if (!h) return;
  const d = def(h[1]);
  const acts = optsForCard(id).map((a) => ({ a, label: actLabel(a) }));
  openInspector({ def: d, acts, why: acts.length ? '' : whyNot(d) });
}
function inspectMon(id) {
  const f = curFrame();
  const m = snapMon(f, id);
  if (!m) return;
  const mine = monOwner(f, id) === 0 && W.mode === 'play';
  const acts = mine ? optsForMon(id).map((a) => ({ a, label: actLabel(a), html: a.k === 'attack' ? `${atkHTML(a)}` : null })) : [];
  openInspector({ def: def(m.d), mon: m, acts });
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
    PB.acts.innerHTML = '<button type="button" class="pill pill-solid" data-b="rematch">Play again</button><button type="button" class="pill" data-b="toReplay">Watch the replay</button>';
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
      title = 'Choose one';
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
    case 'evolve': return { title: 'Search your deck for an Evolution card', sub: 'Choose one to evolve with.' };
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
    case 'discardOppHand': return { title: "Your opponent's hand", sub: `Choose ${n(req.min)} to discard.` };
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
function resumeSaved() {
  const s = savedPlay();
  if (!s) return;
  S.seats = [s.a, s.b];
  saveSeats();
  playStart(s.seed, s.answers);
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
function renderLearnBtn() {
  const done = tutDone().size, n = TUTOR.LESSONS.length;
  $('#learnBtn').innerHTML = `${icon('cap')}<span><b>Learn to play</b><span>${done ? `${done} of ${n} lessons done` : `${n} short lessons, about 15 minutes`}</span></span>`;
}
function renderLessons() {
  const done = tutDone();
  const groups = [];
  for (const l of TUTOR.LESSONS) { let g = groups.find((x) => x.name === l.group); if (!g) groups.push(g = { name: l.group, items: [] }); g.items.push(l); }
  $('#lessons').innerHTML = groups.map((g) => `<section class="lsn-group"><h2>${esc(g.name)}</h2><div class="lsn-list">${g.items.map((l) => {
    const k = TUTOR.LESSONS.indexOf(l) + 1;
    return `<button type="button" class="lsn${done.has(l.id) ? ' done' : ''}" data-lesson="${esc(l.id)}"><span class="no">${done.has(l.id) ? icon('check') : k}</span><b>${esc(l.title)}<small>${esc(l.time)}</small></b><span>${esc(l.blurb)}</span></button>`;
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
    inspectMon(id);
    return;
  }
  const hc = t.closest('[data-card]');
  if (hc) {
    const id = +hc.dataset.card;
    if (PL.on && W.mode === 'play' && hc.closest('.side[data-p="0"]')) { inspectHand(id); return; }
    const f = curFrame();
    for (const ps of f.s.p) { const h = ps.hand.find(([x]) => x === id); if (h) { openInspector({ def: def(h[1]) }); return; } }
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
    default:
  }
}
function wire() {
  $('#toLobby').addEventListener('click', () => { if (S.view === 'watch' && TU.on) goLessons(true); else setView('lobby', true); });
  $('#learnBtn').addEventListener('click', () => goLessons(true));
  $('#lessons').addEventListener('click', (e) => { const b = e.target.closest('[data-lesson]'); if (b) lessonStart(b.dataset.lesson); });
  $('#playBtn').addEventListener('click', () => playStart(newSeed(), []));
  $('#watchBtn').addEventListener('click', () => watch(newSeed()));
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
    if (z) { openInspector({ def: def(z.dataset.zoom) }); return; }
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
    const b = e.target.closest('[data-act]');
    if (b) { const x = INSP._acts[+b.dataset.act]; closeInspector(); if (x && x.a) answer({ type: 'act', a: x.a }); }
  });
  SCRIM.addEventListener('click', () => { if (!INSP.hidden) closeInspector(); else if (SH.opts && SH.opts.readOnly) closeSheet(); });
  SHEET.addEventListener('click', (e) => {
    const z = e.target.closest('[data-zoomdef]');
    if (z) { openInspector({ def: def(z.dataset.zoomdef) }); return; }
    const c = e.target.closest('[data-ch]');
    if (c && !c.dataset.ro) { toggleChoice(isNaN(+c.dataset.ch) ? c.dataset.ch : +c.dataset.ch); return; }
    const a = e.target.closest('[data-sh]');
    if (!a) return;
    if (a.dataset.sh === 'close') closeSheet();
    else if (a.dataset.sh === 'undo') undo();
    else if (a.dataset.sh === 'ok' && valid()) { const sel = SH.sel.slice(); const done = SH.opts.done; closeSheet(); done(sel); }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { if (!INSP.hidden) { closeInspector(); return; } if (SH.opts && SH.opts.readOnly) { closeSheet(); return; } if (T.logpane.classList.contains('open')) closeLog(); return; }
    if (S.view !== 'watch' || !INSP.hidden || !SHEET.hidden || e.target.closest('input, textarea')) return;
    if (W.mode === 'watch') {
      if (e.key === ' ' && !e.target.closest('button')) { e.preventDefault(); W.playing ? stop() : play(); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); e.shiftKey ? jumpTurn(1) : step(1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); e.shiftKey ? jumpTurn(-1) : step(-1); }
    } else if ((e.metaKey || e.ctrlKey) && e.key === 'z') { e.preventDefault(); undo(); }
  });
  let rz = 0;
  addEventListener('resize', () => { cancelAnimationFrame(rz); rz = requestAnimationFrame(() => { headerHeight(); measure(); }); });
  addEventListener('popstate', route);
}
function route() {
  const h = readHash();
  if (h.lesson && lessonById(h.lesson)) { lessonStart(h.lesson, true); return; }
  if (h.learn || location.hash === '#learn') { setView('learn', false); return; }
  if (h.a) S.seats[0] = h.a.key;
  if (h.b) S.seats[1] = h.b.key;
  saveSeats();
  if (h.play != null) {
    const s = savedPlay();
    if (s && s.seed === h.play && s.a === S.seats[0] && s.b === S.seats[1]) playStart(s.seed, s.answers, { replace: true });
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
    const res = await fetch('cards.json?v=2026-11-20');
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
  renderLearnBtn();
  route();
}
window.HOLO_ARENA = { S, W, PL, TU, deckByKey, answer, render, get pool() { return DATA.pool; } };
boot();
})();
