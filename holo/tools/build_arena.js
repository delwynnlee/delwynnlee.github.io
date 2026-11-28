#!/usr/bin/env node
// Build holo/arena/cards.json: the Scarlet & Violet and Mega Evolution cards whose text Arena can play.
// Reads holo/cards.json (run build_data.py first). Usage: node holo/tools/build_arena.js [--report]
const fs = require('fs');
const path = require('path');
const HOLO = path.join(__dirname, '..');
const { compileCard } = require(path.join(HOLO, 'arena', 'compile.js'));

const ERAS = new Set(['Scarlet & Violet', 'Mega Evolution']);
const RARITY_RANK = ['Common', 'Uncommon', 'Rare', 'Double Rare', 'ACE SPEC Rare', 'Promo', 'Ultra Rare', 'Illustration Rare', 'Shiny Rare', 'Shiny Ultra Rare', 'Special Illustration Rare', 'Mega Attack Rare', 'Hyper Rare', 'Mega Hyper Rare'];
const rank = (r) => { const i = RARITY_RANK.indexOf(r); return i < 0 ? 5 : i; };

const d = JSON.parse(fs.readFileSync(path.join(HOLO, 'cards.json'), 'utf8'));
const T = d.T, S = d.S, A = d.A, RR = d.R;
const KIND_ABIL = ['Ability', 'Poké-Power', 'Poké-Body', 'Pokémon Power'];

// Decode the rows Holo stores (field list at the top of build_data.py).
const groups = new Map();
for (const r of d.c) {
  const s = d.sets[r[0]];
  if (!ERAS.has(s.series)) continue;
  const over = r[22] || 0;
  const num = r[1];
  const id = s.id + '-' + (over.i || num);
  const td = r[21] === null ? null : (r[21] || num);
  const card = {
    id, n: r[2], k: r[3], s: (r[4] || []).map((x) => S[x]), hp: r[5] || 0, t: r[6] || '', f: r[7] || '',
    ab: (r[8] || []).map((a) => [T[a[0]], a[1] >= 0 ? T[a[1]] : '', a[2] || 0]),
    at: (r[9] || []).map((a) => [T[a[0]], a[1] || '', a[2] || '', a[3] >= 0 ? T[a[3]] : '']),
    w: r[10] || [], r: r[11] || [], rc: r[12] || 0, ru: (r[13] || []).map((x) => T[x]),
    ra: r[15] >= 0 ? RR[r[15]] : '', reg: r[19] || '', set: s.code || s.id.toUpperCase(), num,
    img: [s.td && td != null ? `${s.td}/${td}` : '', s.img === 's' ? `s:${id}` : `p:${s.id}/${over.k || num}`],
    _g: r[20] || 0, _date: s.date, _artist: r[14] >= 0 ? A[r[14]] : '', _legal: r[18] || 0, _set: s,
  };
  if (!groups.has(card._g)) groups.set(card._g, []);
  groups.get(card._g).push(card);
}

const out = [], alias = {}, fails = new Map(), reasons = new Map();
// The sets of the era, for playing with one set's cards: every card printed in it, by the id the Arena knows it by
const setRows = new Map();
let total = 0;
for (const prints of groups.values()) {
  total++;
  // The everyday printing stands for the card; every printing id still resolves to it.
  prints.sort((a, b) => rank(a.ra) - rank(b.ra) || (a._date < b._date ? -1 : a._date > b._date ? 1 : 0));
  const rep = prints[0];
  const def = compileCard(rep);
  if (!def.ok) {
    for (const w of def.why) {
      const key = w.replace(/\d+/g, 'N');
      fails.set(key, (fails.get(key) || 0) + 1);
    }
    const kind = ['Pokémon', 'Trainer', 'Energy'][rep.k];
    reasons.set(kind, (reasons.get(kind) || 0) + 1);
    continue;
  }
  const entry = { ...rep };
  // Standard-legal if any printing is (a reprint with a newer regulation mark keeps a card in Standard)
  if (prints.some((p) => p._legal & 1)) entry.std = 1;
  delete entry._g; delete entry._date; delete entry._artist; delete entry._legal; delete entry._set;
  out.push(entry);
  for (const p of prints) if (p.id !== rep.id) alias[p.id] = rep.id;
  for (const p of prints) {
    const st = p._set;
    if (!setRows.has(st.id)) setRows.set(st.id, { id: st.id, code: st.code || st.id.toUpperCase(), name: st.name, date: st.date, series: st.series, total: st.total || st.printedTotal || 0, ids: new Set() });
    setRows.get(st.id).ids.add(rep.id);
  }
}
out.sort((a, b) => a.k - b.k || (a.n < b.n ? -1 : 1));
const kinds = [0, 1, 2].map((k) => out.filter((c) => c.k === k).length);
// sets with enough playable cards to build a few decks from, newest first (promos and mini-sets with too few are left out)
const sets = [...setRows.values()].filter((x) => x.ids.size >= 40 && !/promo/i.test(x.name)).sort((a, b) => (a.date < b.date ? 1 : -1))
  .map((x) => ({ code: x.code, name: x.name, date: x.date, total: x.total, ids: [...x.ids].sort() }));
fs.writeFileSync(path.join(HOLO, 'arena', 'cards.json'), JSON.stringify({ built: d.built, cards: out, alias, sets }));
console.log(`${out.length} of ${total} distinct cards playable (${kinds[0]} Pokémon, ${kinds[1]} Trainers, ${kinds[2]} Energy). Left out: ${[...reasons].map(([k, v]) => `${v} ${k}`).join(', ')}`);
console.log(`cards.json ${Math.round(fs.statSync(path.join(HOLO, 'arena', 'cards.json')).size / 1024)} KB`);
if (process.argv.includes('--report')) {
  console.log('\nMost common text Arena can\'t read yet:');
  for (const [k, v] of [...fails].sort((a, b) => b[1] - a[1]).slice(0, +process.env.TOP || 60)) console.log(String(v).padStart(4), k.slice(0, 200));
}
