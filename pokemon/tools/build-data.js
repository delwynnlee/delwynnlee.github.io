// Regenerates ../pokemon.json from Pokémon Showdown's data.
// Usage: cd pokemon/tools && npm install && npm run build
const fs = require('fs');
const path = require('path');
const { Dex } = require('pokemon-showdown');

const REGIONAL = { Alola: 'Alolan', Galar: 'Galarian', Hisui: 'Hisuian', Paldea: 'Paldean' };
const RENAME = { 'Nidoran-F': 'Nidoran♀', 'Nidoran-M': 'Nidoran♂' };
const LAST = 1025; // highest National Dex number to include

const species = Dex.species.all()
  .filter(s => s.num >= 1 && s.num <= LAST && !s.forme)
  .sort((a, b) => a.num - b.num);
if (species.length !== LAST) throw new Error(`expected ${LAST} species, got ${species.length}`);

const classOf = tags => tags.includes('Mythical') ? 'Mythical'
  : tags.some(t => /Legendary/.test(t)) ? 'Legendary'
  : tags.includes('Ultra Beast') ? 'Ultra Beast'
  : tags.includes('Paradox') ? 'Paradox' : null;

const female = s => s.gender === 'N' ? null : s.gender === 'M' ? 0 : s.gender === 'F' ? 100
  : Math.round(s.genderRatio.F * 1000) / 10;

const recs = species.map(s => ({
  id: s.id, num: s.num, name: RENAME[s.name] || s.name, types: s.types,
  stats: ['hp', 'atk', 'def', 'spa', 'spd', 'spe'].map(k => s.baseStats[k]),
  abilities: [s.abilities[0], s.abilities[1]].filter(Boolean), hidden: s.abilities.H || null,
  height: s.heightm, weight: s.weightkg, gen: s.gen, class: classOf(s.tags),
  eggGroups: s.eggGroups, female: female(s), from: null, method: null,
}));
const byId = Object.fromEntries(recs.map(r => [r.id, r]));

// Evolutions: regional and other formes are folded into their base species.
const cap = t => t.charAt(0).toUpperCase() + t.slice(1);
function method(s, p) {
  const parts = [];
  switch (s.evoType) {
    case 'useItem': parts.push(`Use ${s.evoItem}`); break;
    case 'trade': parts.push(s.evoItem ? `Trade holding ${s.evoItem}` : 'Trade'); break;
    case 'levelFriendship': parts.push('Level up with high friendship'); break;
    case 'levelHold': parts.push(`Level up holding ${s.evoItem}`); break;
    case 'levelMove': parts.push(`Level up knowing ${s.evoMove}`); break;
    case 'other': break;
    default: parts.push(s.evoLevel ? `Level ${s.evoLevel}` : 'Level up');
  }
  if (s.evoCondition) parts.push(s.evoCondition);
  let out = cap(parts.join(', '));
  if (p.forme) out += ` (from ${REGIONAL[p.forme] || p.forme} ${p.baseSpecies})`;
  return out;
}
const primary = new Set();
for (const s of Dex.species.all()) {
  if (!s.prevo) continue;
  const p = Dex.species.get(s.prevo);
  const child = byId[Dex.species.get(s.baseSpecies).id], parent = byId[Dex.species.get(p.baseSpecies).id];
  if (!child || !parent || child === parent) continue;
  const isPrimary = !s.forme;
  if (child.from && (primary.has(child.id) || !isPrimary)) continue;
  child.from = parent.id; child.method = method(s, p);
  if (isPrimary) primary.add(child.id);
}

const out = path.join(__dirname, '..', 'pokemon.json');
fs.writeFileSync(out, '[\n' + recs.map(r => JSON.stringify(r)).join(',\n') + '\n]\n');
console.log(`Wrote ${recs.length} Pokémon to ${out}`);
