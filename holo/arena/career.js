/* Career: Victory Road, across Paldea. You pick a partner (Fuecoco, Quaxly or Pawmi) and a plain deck, then take on
   the eight Gyms, the Top Champion and, at the end of the road, your rival Nemona. Each win earns a pack of cards
   (Pokémon, Items, or Supporters and Tools) that go into your deck in place of its weakest cards. The road gets
   harder as it goes: better cards for them, the hard AI from the fourth Gym, and more Prize cards for you to take.
   Data and rules only: functions take the engine (A) and the compiled card pool, so the page and Node tests share them. */
(function (root, factory) {
  const C = factory();
  if (typeof module === 'object' && module.exports) module.exports = C;
  else root.ARENA_CAREER = C;
})(typeof self !== 'undefined' ? self : this, function () {
  const PACK = 4;
  // you: the Prize cards you take to win (they always take 6); tier: how good their Trainers are (0 plain, 4 tournament)
  const STAGES = [
    { id: 'katy', who: 'Katy', title: 'The Bug Gym', where: 'Cortondo', types: ['G'], ai: 'normal', you: 4, tier: 0, face: 'Lokix',
      lines: [[[4, 'Nymble'], [3, 'Lokix']], [[3, 'Tarountula'], [2, 'Spidops']]],
      text: 'Cortondo’s Gym Leader bakes the town’s famous pastries and raises bugs that jump far higher than they look. A gentle first test.' },
    { id: 'brassius', who: 'Brassius', title: 'The Grass Gym', where: 'Artazon', types: ['G'], ai: 'normal', you: 4, tier: 0, face: 'Lilligant', stadium: 'Artazon',
      lines: [[[3, 'Petilil'], [2, 'Lilligant']], [[3, 'Skiddo'], [2, 'Gogoat']], [[2, 'Smoliv'], [2, 'Dolliv']]],
      text: 'An artist who builds sculptures out of living plants. His Gym is one of them, and so, he says, is his deck.' },
    { id: 'iono', who: 'Iono', title: 'The Electric Gym', where: 'Levincia', types: ['L'], ai: 'normal', you: 5, tier: 1, face: 'Bellibolt', stadium: 'Levincia', extra: [[2, 'Iono']],
      lines: [[[2, 'Iono\'s Tadbulb'], [2, 'Tadbulb'], [3, 'Bellibolt']], [[2, 'Iono\'s Wattrel'], [2, 'Wattrel'], [2, 'Kilowattrel']]],
      text: 'Paldea’s most famous streamer runs her Gym battle live for millions of viewers. Don’t lose on camera.' },
    { id: 'kofu', who: 'Kofu', title: 'The Water Gym', where: 'Cascarrafa', types: ['W'], ai: 'hard', you: 5, tier: 1, face: 'Cetitan',
      lines: [[[3, 'Wiglett'], [2, 'Wugtrio']], [[3, 'Cetoddle'], [2, 'Cetitan']], [[2, 'Finizen']]],
      text: 'A seafood-loving Leader with a big laugh and bigger Pokémon. From here on the AI plays its turns out to the end before it moves.' },
    { id: 'larry', who: 'Larry', title: 'The Normal Gym', where: 'Medali', types: ['C'], energy: 'F', ai: 'hard', you: 5, tier: 2, face: 'Larry\'s Braviary',
      lines: [[[3, 'Larry\'s Rufflet'], [2, 'Larry\'s Braviary']], [[2, 'Larry\'s Starly'], [2, 'Larry\'s Staravia']], [[2, 'Larry\'s Dunsparce']], [[3, 'Lechonk'], [2, 'Oinkologne ex']]],
      text: 'A tired office worker who also happens to be a Gym Leader and one of the Elite Four. Normal Pokémon, nothing flashy, and very hard to beat.' },
    { id: 'ryme', who: 'Ryme', title: 'The Ghost Gym', where: 'Montenevera', types: ['P'], ai: 'hard', you: 6, tier: 2, face: 'Houndstone ex', extra: [[2, 'Ryme']],
      lines: [[[4, 'Greavard'], [3, 'Houndstone ex']], [[2, 'Mimikyu']], [[2, 'Flittle'], [2, 'Espathra']]],
      text: 'The rapper of the snowy mountain town turns every battle into a show, and her ghosts keep coming back for an encore.' },
    { id: 'tulip', who: 'Tulip', title: 'The Psychic Gym', where: 'Alfornada', types: ['P'], ai: 'hard', you: 6, tier: 3, face: 'Gardevoir ex',
      lines: [[[3, 'Ralts'], [2, 'Kirlia'], [2, 'Gardevoir ex']], [[3, 'Flittle'], [2, 'Espathra']], [[2, 'Flabébé'], [1, 'Floette']]],
      text: 'A makeup artist who says beauty is a kind of strength. Her Gardevoir ex pulls Energy back from the discard pile as fast as you can take it.' },
    { id: 'grusha', who: 'Grusha', title: 'The Ice Gym', where: 'Glaseado', types: ['W'], ai: 'hard', you: 6, tier: 3, face: 'Baxcalibur',
      lines: [[[3, 'Frigibax'], [1, 'Arctibax'], [2, 'Baxcalibur']], [[2, 'Chien-Pao ex']], [[2, 'Snom'], [2, 'Frosmoth']], [[2, 'Cubchoo'], [1, 'Beartic']]],
      text: 'A former snowboard champion, cool as the mountain. The last Gym: beat him and the Pokémon League opens its doors.' },
    { id: 'geeta', who: 'Geeta', title: 'The Top Champion', where: 'The Pokémon League', types: ['D', 'F'], ai: 'hard', you: 6, tier: 4, face: 'Kingambit',
      lines: [[[4, 'Pawniard'], [2, 'Bisharp'], [3, 'Kingambit']], [[3, 'Glimmet'], [2, 'Glimmora']], [[1, 'Fezandipiti ex']]],
      text: 'The head of the Pokémon League tests every new Champion herself. Kingambit leads her team, and it does not give ground.' },
    { id: 'nemona', who: 'Nemona', title: 'Your rival', where: 'Naranja Academy', types: ['L', 'F'], ai: 'hard', you: 6, tier: 4, face: 'Pawmot ex', boss: true,
      lines: [[[4, 'Pawmi'], [3, 'Pawmo'], [3, 'Pawmot ex']], [[3, 'Rockruff'], [2, 'Lycanroc']], [[1, 'Iron Hands ex']]],
      text: 'She has been waiting since your first day at the Academy. Nemona is already a Champion, and she wants the best battle of her life. Give it to her.' },
  ];
  // Your partner: a Basic, its Stage 1 and a plain Stage 2. The ex version comes as a reward, for the two that have one.
  const PARTNERS = {
    fuecoco: { id: 'fuecoco', name: 'Fuecoco', type: 'R', line: [[4, 'sv1-36'], [3, 'sv1-37'], [2, 'sv1-38']], top: 'Skeledirge', ex: 'sv2-37',
      blurb: 'A hungry little fire crocodile who grows up into Skeledirge, singing flames.' },
    quaxly: { id: 'quaxly', name: 'Quaxly', type: 'W', line: [[4, 'sv1-52'], [3, 'sv1-53'], [2, 'sv1-54']], top: 'Quaquaval',
      blurb: 'A tidy duckling who grows up into Quaquaval, a fighter that dances.' },
    pawmi: { id: 'pawmi', name: 'Pawmi', type: 'L', line: [[4, 'sv1-74'], [3, 'sv1-75'], [2, 'sv1-76']], top: 'Pawmot', ex: 'sv3-73',
      blurb: 'Nemona’s favourite: a fizzy electric mouse who grows up into Pawmot.' },
  };
  const JOURNEY = {
    title: 'Victory Road', world: 'Paldea', road: 'The road to the Pokémon League',
    intro: 'Eight Gyms, the Top Champion, and your rival waiting at the end. Pick a partner, start with a plain deck, and earn better cards with every win.',
    doneTitle: 'Champion of Paldea', doneText: 'You beat every Gym, the Top Champion and Nemona herself.',
  };
  // The plain cards every new Trainer starts with
  const STARTER = [[3, 'Lechonk'], [2, 'Oinkologne'], [4, 'Poké Ball'], [3, 'Potion'], [2, 'Energy Search'], [2, 'Switch'], [3, 'Youngster'], [2, 'Professor\'s Research'], [2, 'Nest Ball'], [2, 'Great Ball']];
  // How good a Trainer card is, for choosing what a new card replaces (higher stays longer)
  const VALUE = { 'Potion': 1, 'Poké Ball': 1, 'Energy Search': 1.5, 'Youngster': 2, 'Great Ball': 3, 'Picnicker': 3, 'Cheren': 3.5, 'Jacq': 4, 'Hilda': 5, 'Switch': 4.5, 'Energy Retrieval': 5,
    'Nest Ball': 7, 'Professor\'s Research': 8, 'Iono': 8, 'Arven': 8.5, 'Ultra Ball': 9, 'Rare Candy': 9, 'Boss\'s Orders': 9, 'Buddy-Buddy Poffin': 7.5, 'Earthen Vessel': 7, 'Nemona': 6,
    'Night Stretcher': 7, 'Super Rod': 6, 'Pokégear 3.0': 6, 'Hero\'s Cape': 7, 'Defiance Band': 6, 'Bravery Charm': 6.5, 'Rescue Board': 6, 'Prime Catcher': 8.5, 'Counter Catcher': 7, 'Superior Energy Retrieval': 7 };
  // The Trainers each side gets, by tier: plain, then search, then draw and switching, then the tournament set
  const TRAINERS = [
    [[4, 'Poké Ball'], [3, 'Potion'], [3, 'Youngster'], [2, 'Energy Search'], [2, 'Switch'], [2, 'Great Ball'], [2, 'Professor\'s Research']],
    [[3, 'Nest Ball'], [3, 'Great Ball'], [3, 'Professor\'s Research'], [2, 'Hilda'], [2, 'Switch'], [2, 'Energy Retrieval'], [2, 'Potion'], [1, 'Boss\'s Orders']],
    [[4, 'Nest Ball'], [3, 'Ultra Ball'], [4, 'Professor\'s Research'], [2, 'Iono'], [2, 'Boss\'s Orders'], [2, 'Switch'], [2, 'Energy Retrieval'], [1, 'Super Rod'], [1, 'Hero\'s Cape']],
    [[4, 'Ultra Ball'], [3, 'Nest Ball'], [4, 'Professor\'s Research'], [3, 'Iono'], [2, 'Boss\'s Orders'], [1, 'Arven'], [2, 'Switch'], [1, 'Night Stretcher'], [1, 'Super Rod'], [2, 'Pokégear 3.0'], [1, 'Hero\'s Cape'], [1, 'Earthen Vessel']],
    [[4, 'Ultra Ball'], [2, 'Nest Ball'], [2, 'Buddy-Buddy Poffin'], [4, 'Professor\'s Research'], [3, 'Iono'], [2, 'Boss\'s Orders'], [1, 'Arven'], [1, 'Switch'], [1, 'Prime Catcher'], [1, 'Night Stretcher'], [1, 'Super Rod'], [2, 'Pokégear 3.0'], [1, 'Hero\'s Cape'], [2, 'Earthen Vessel']],
  ];
  // Rewards. Items and Supporters by tier; Pokémon by your partner's type, each a line that fits the deck
  const ITEM_PACKS = [
    [[2, 'Nest Ball'], [2, 'Ultra Ball']], [[2, 'Rare Candy'], [2, 'Ultra Ball']], [[2, 'Rare Candy'], [2, 'Nest Ball']], [[2, 'Buddy-Buddy Poffin'], [2, 'Earthen Vessel']],
    [[1, 'Night Stretcher'], [1, 'Super Rod'], [2, 'Pokégear 3.0']], [[1, 'Prime Catcher'], [1, 'Counter Catcher'], [2, 'Ultra Ball']], [[2, 'Energy Retrieval'], [2, 'Superior Energy Retrieval']],
  ];
  const SUPPORT_PACKS = [
    [[2, 'Professor\'s Research'], [1, 'Hilda'], [1, 'Switch']], [[2, 'Iono'], [1, 'Boss\'s Orders'], [1, 'Professor\'s Research']], [[1, 'Arven'], [1, 'Boss\'s Orders'], [1, 'Hero\'s Cape'], [1, 'Professor\'s Research']],
    [[1, 'Iono'], [1, 'Nemona'], [1, 'Defiance Band'], [1, 'Boss\'s Orders']], [[1, 'Professor\'s Research'], [1, 'Rescue Board'], [1, 'Bravery Charm'], [1, 'Arven']], [[1, 'Iono'], [1, 'Boss\'s Orders'], [2, 'Hero\'s Cape']],
  ];
  const MON_PACKS = {
    R: [[[3, 'Growlithe'], [2, 'Arcanine']], [[3, 'Larvesta'], [2, 'Volcarona']], [[2, 'Chi-Yu'], [1, 'Fezandipiti ex']], [[2, 'Pidgey'], [1, 'Pidgeotto'], [2, 'Pidgeot ex']], [[3, 'Charmander'], [1, 'Charmeleon'], [2, 'Charizard ex']]],
    W: [[[3, 'Cetoddle'], [2, 'Cetitan']], [[3, 'Wiglett'], [2, 'Wugtrio']], [[2, 'Chien-Pao ex'], [1, 'Squawkabilly ex']], [[2, 'Staryu'], [2, 'Mega Starmie ex']], [[3, 'Frigibax'], [1, 'Arctibax'], [2, 'Baxcalibur']]],
    L: [[[3, 'Tadbulb'], [2, 'Bellibolt']], [[3, 'Wattrel'], [2, 'Kilowattrel']], [[2, 'Zapdos'], [1, 'Squawkabilly ex']], [[2, 'Miraidon ex'], [1, 'Pikachu ex']], [[2, 'Iron Hands ex'], [1, 'Pikachu ex']]],
  };
  const PACK_NAMES = ['Pokémon pack', 'Item pack', 'Supporter pack'];

  function newRun(partner) {
    const P = PARTNERS[partner];
    return { partner: P.id, stage: 0, cards: P.line.map(([n, id]) => [n, id]).concat(STARTER.map(([n, name]) => [n, name])), got: [], fights: [], started: Date.now() };
  }
  // A card from an id or a name; a Pokémon name picks the strongest printing of that type that evolves the right way
  function card(A, pool, key, opts = {}) {
    if (pool.get(key)) return pool.get(key);
    let list = (pool.byName.get(key) || []).slice();
    if (opts.from !== undefined) { const f = list.filter((d) => (d.from || null) === opts.from); if (f.length) list = f; }
    if (opts.types) { const f = list.filter((d) => [...(d.types || '')].some((t) => opts.types.includes(t))); if (f.length) list = f; }
    return list.sort((a, b) => (A.pokemonScore ? A.pokemonScore(b) - A.pokemonScore(a) : b.hp - a.hp))[0] || null;
  }
  function resolveLine(A, pool, line, types) {
    const out = [];
    let prev = null;
    for (const [n, name] of line) {
      const d = card(A, pool, name, { from: prev ? prev.name : undefined, types });
      // a later card in a line evolves from the card before it (or is another Basic)
      if (!d || (prev && d.stage > 0 && d.from !== prev.name)) continue;
      out.push([n, d]);
      prev = d;
    }
    return out;
  }
  const BASIC_ENERGY = (pool, t) => pool.list.find((d) => d.kind === 2 && d.basicEnergy && d.provides === t);
  // Basic Energy to fill the deck to 60, split by how much each type is asked for in attack costs
  function withEnergy(pool, list, prefer) {
    const n = list.reduce((s, [k]) => s + k, 0);
    const want = {};
    for (const [k, d] of list) if (d.kind === 0) for (const a of d.atks || []) for (const ch of a.cost || '') if (ch !== 'C') want[ch] = (want[ch] || 0) + k;
    let types = Object.keys(want).filter((t) => BASIC_ENERGY(pool, t));
    if (!types.length) types = [prefer || 'F'];
    const total = Math.max(0, 60 - n);
    const sum = types.reduce((s, t) => s + (want[t] || 1), 0);
    const counts = types.map((t) => Math.round((total * (want[t] || 1)) / sum));
    counts[0] += total - counts.reduce((s, x) => s + x, 0);
    return list.concat(types.map((t, i) => [counts[i], BASIC_ENERGY(pool, t)]).filter(([k, d]) => k > 0 && d));
  }
  function expand(list) { const cards = []; for (const [k, d] of list) for (let i = 0; i < k; i++) cards.push(d); return cards; }
  function trainersOf(A, pool, tier, stage2) {
    const out = [];
    for (const [n, name] of TRAINERS[Math.min(tier, TRAINERS.length - 1)]) { const d = card(A, pool, name); if (d) out.push([n, d]); }
    if (stage2 && tier >= 1) { const rc = card(A, pool, 'Rare Candy'); if (rc) out.push([tier >= 3 ? 3 : 2, rc]); }
    return out;
  }
  // The deck a stage's Leader plays
  function stageDeck(A, pool, k) {
    const st = STAGES[k];
    let list = [];
    for (const line of st.lines) list = list.concat(resolveLine(A, pool, line, st.types.concat('C')));
    const stage2 = list.some(([, d]) => d.stage === 2);
    list = list.concat(trainersOf(A, pool, st.tier, stage2));
    for (const [n, name] of st.extra || []) { const d = card(A, pool, name); if (d) list.push([n, d]); }
    if (st.stadium) { const d = card(A, pool, st.stadium); if (d) list.push([2, d]); }
    // Never more than 60 before the Energy: the plainest Trainers go first
    while (list.reduce((s, [n]) => s + n, 0) > 47) {
      const i = list.map(([n, d], j) => [VALUE[d.name] != null ? VALUE[d.name] : d.kind === 0 ? 99 : 5, j]).sort((a, b) => a[0] - b[0])[0][1];
      if (list[i][0] > 1) list[i] = [list[i][0] - 1, list[i][1]]; else list.splice(i, 1);
    }
    list = withEnergy(pool, list, st.energy || st.types[0]);
    const face = card(A, pool, st.face, { types: st.types.concat('C') });
    return { id: `cr-${st.id}`, name: `${st.who}’s deck`, archetype: st.tier >= 3 ? 'midrange' : 'aggro', types: st.types.filter((t) => t !== 'C').length ? st.types.filter((t) => t !== 'C') : ['C'], cards: expand(list), face: face && face.id };
  }
  // Your deck: the cards you've got, by id or name, then Basic Energy up to 60
  function heroDeck(A, pool, run) {
    const P = PARTNERS[run.partner];
    const list = [];
    for (const [n, key] of run.cards) {
      const d = card(A, pool, key, { types: [P.type, 'C'] });
      if (d) list.push([n, d]);
    }
    const full = withEnergy(pool, list, P.type);
    const top = list.filter(([, d]) => d.kind === 0).map(([, d]) => d).sort((a, b) => b.stage - a.stage || (b.ex ? 1 : 0) - (a.ex ? 1 : 0) || b.hp - a.hp)[0];
    const types = [...new Set(full.filter(([, d]) => d.kind === 2).map(([, d]) => d.provides))];
    return { id: 'cr-you', name: `${P.top} deck`, archetype: 'midrange', types: types.length ? types : [P.type], cards: expand(full), face: top && top.id };
  }
  const nonEnergy = (cards) => cards.reduce((s, [n]) => s + n, 0);
  const nameOf = (A, pool, key) => { const d = card(A, pool, key); return d ? d.name : key; };
  // Three packs to choose one from after a win at stage k: a Pokémon line, Items, Supporters and Tools, better the further you've come
  function packsFor(A, pool, run, k, seed) {
    const P = PARTNERS[run.partner];
    const r = A.makeRng(seed);
    const have = new Set(run.cards.map(([, key]) => nameOf(A, pool, key)));
    const tier = (list, lo) => { const at = Math.min(list.length - 1, lo + r.int(2)); return list[Math.max(0, at)]; };
    // Pokémon: the partner's ex form first (after the second win), then lines of its type you don't have yet
    let mon;
    if (P.ex && k >= 1 && !run.cards.some(([, key]) => key === P.ex)) mon = { kind: 'ex', cards: [[2, P.ex]] };
    else {
      const cands = MON_PACKS[P.type].filter((line) => !line.some(([, name]) => have.has(name)));
      const pick = cands[Math.min(cands.length - 1, Math.max(0, Math.floor(k / 2) + r.int(2) - 1))] || MON_PACKS[P.type][0];
      mon = { kind: 'mon', cards: pick };
    }
    const items = { kind: 'items', cards: tier(ITEM_PACKS, Math.floor(k * 0.7)) };
    const sup = { kind: 'support', cards: tier(SUPPORT_PACKS, Math.floor(k * 0.6)) };
    return [mon, items, sup].map((p, i) => ({ kind: p.kind, name: p.kind === 'ex' ? `${nameOf(A, pool, P.ex)} pack` : PACK_NAMES[i], cards: p.cards.map(([n, key]) => [n, key, nameOf(A, pool, key)]) }));
  }
  // A pack goes in: its cards join the deck (no more than four of a name), the partner's ex replaces its plain Stage 2,
  // and while there are fewer than 13 cards' room for Energy the weakest cards go: plain Trainers first, then the starter Pokémon
  function addPack(A, pool, run, pack) {
    const P = PARTNERS[run.partner];
    let cards = run.cards.map((x) => x.slice());
    const out = [];
    if (pack.kind === 'ex') {
      const plain = cards.findIndex(([, key]) => key === P.line[2][1]);
      if (plain >= 0) { out.push([cards[plain][0], nameOf(A, pool, cards[plain][1])]); cards.splice(plain, 1); }
    }
    for (const [n, key, name] of pack.cards) {
      const at = cards.findIndex(([, k2]) => nameOf(A, pool, k2) === name);
      if (at >= 0) cards[at][0] = Math.min(4, cards[at][0] + n);
      else cards.push([Math.min(4, n), key]);
    }
    const keep = new Set(P.line.map(([, id]) => id).concat(P.ex ? [P.ex] : []).concat(pack.cards.map(([, key]) => key)));
    const value = ([, key]) => {
      const d = card(A, pool, key);
      if (!d) return 0;
      if (d.kind === 0) return ['Lechonk', 'Oinkologne'].includes(d.name) ? 2.5 : 10;
      return VALUE[d.name] != null ? VALUE[d.name] : 5;
    };
    while (nonEnergy(cards) > 47) {
      const order = cards.map((x, i) => [value(x), i]).filter(([, i]) => !keep.has(cards[i][1])).sort((a, b) => a[0] - b[0]);
      if (!order.length) break;
      const i = order[0][1];
      const d = card(A, pool, cards[i][1]);
      // A plain Pokémon line goes as a whole, so nothing is left without the card it evolves from
      if (d && d.kind === 0) {
        const fam = cards.filter(([, key]) => ['Lechonk', 'Oinkologne'].includes(nameOf(A, pool, key)));
        for (const x of fam) { out.push([x[0], nameOf(A, pool, x[1])]); cards.splice(cards.indexOf(x), 1); }
        continue;
      }
      out.push([1, d ? d.name : cards[i][1]]);
      if (cards[i][0] > 1) cards[i][0]--; else cards.splice(i, 1);
    }
    return { run: Object.assign({}, run, { cards, got: run.got.concat(pack.cards.map(([, , name]) => name)), reward: null }), out };
  }
  // A fight's result: a win opens the next stage, and the last one ends the journey
  function afterFight(run, k, won, info) {
    const fights = run.fights.concat([Object.assign({ k, won, at: Date.now() }, info || {})]);
    const next = Object.assign({}, run, { fights });
    if (won && k === run.stage) {
      next.stage = k + 1;
      if (next.stage >= STAGES.length) next.done = next.done || Date.now();
    }
    return next;
  }
  return { JOURNEY, STAGES, PARTNERS, PACK, newRun, heroDeck, stageDeck, packsFor, addPack, afterFight, card };
});
