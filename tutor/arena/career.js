/* Career: two journeys of ten Commander fights each.
   Cloud's journey runs across Final Fantasy to Sephiroth; Frodo's runs across Middle-earth, from Bag End to Mount Doom.
   The hero starts with a plain deck and their keepsake (the Buster Sword, the One Ring); each win earns a pack of new
   cards from their world that replace their weakest ones, and on Frodo's road friends give him gifts as well. The
   villains get tougher as they go: better cards, the hard AI (from the third stage for Cloud, the fourth for Frodo), and more life.
   Data and rules only: functions take the engine (A) and the compiled card pool, so the page and Node tests share them. */
(function (root, factory) {
  const C = factory();
  if (typeof module === 'object' && module.exports) module.exports = C;
  else root.ARENA_CAREER = C;
})(typeof self !== 'undefined' ? self : this, function () {
  // q: how good their cards are (the share of the cards in their colours they may use, weakest first)
  const CLOUD_STAGES = [
    { id: 'turks', cmd: 'Reno and Rude', title: 'The Turks', deck: 'The Turks', where: 'Sector 7 slums', ai: 'normal', q: 0.3, life: 24, arch: 'aggro',
      text: 'Shinra’s enforcers corner you in the slums. They are paid to bring you in, and they mean to earn it.' },
    { id: 'shinra', cmd: 'Rufus Shinra', title: 'The President', deck: 'Shinra Electric', where: 'Shinra Tower', ai: 'normal', q: 0.36, life: 28, arch: 'midrange',
      text: 'Midgar’s new president rules by fear, with a loyal hound at his side. He wants the Promised Land, and you out of his way.' },
    { id: 'gilgamesh', cmd: 'Gilgamesh, Master-at-Arms', title: 'The Sword Collector', deck: 'Gilgamesh’s Armory', where: 'The Big Bridge', ai: 'hard', q: 0.42, life: 32, arch: 'aggro',
      text: 'A swordsman tumbles out of a rift between worlds, eyes fixed on your blade. He collects legendary weapons. Yours is next.' },
    { id: 'emperor', cmd: 'The Emperor of Palamecia', title: 'The Emperor', deck: 'Palamecian Legion', where: 'Pandaemonium', ai: 'hard', q: 0.47, life: 36, arch: 'control',
      text: 'A tyrant from another world has raised a hellish army in the wastes. Break his legions before they reach the cities.' },
    { id: 'ultimecia', cmd: 'Ultimecia, Time Sorceress', title: 'The Sorceress', deck: 'Ultimecia’s Castle', where: 'The edge of time', ai: 'hard', q: 0.52, life: 40, arch: 'control',
      text: 'Time is folding in on itself. The sorceress means to crush every moment into her own. Hold on to yours.' },
    { id: 'kuja', cmd: 'Kuja, Genome Sorcerer', title: 'The Angel of Death', deck: 'Kuja’s Theater', where: 'Memoria', ai: 'hard', q: 0.56, life: 40, arch: 'midrange',
      text: 'Kuja plays the villain like a starring role and wants a grand finale. Steal the show before his last act.' },
    { id: 'sin', cmd: 'Sin, Spira’s Punishment', title: 'The Punishment', deck: 'Spira’s Punishment', where: 'The Calm Lands', ai: 'hard', q: 0.6, life: 40, arch: 'midrange',
      text: 'A colossal beast rises from the sea and rebuilds itself from everything it has destroyed. It never stays down for long.' },
    { id: 'kefka', cmd: 'Kefka, Court Mage', title: 'The Mad Mage', deck: 'Kefka’s Tower', where: 'The World of Ruin', ai: 'hard', q: 0.58, life: 32, arch: 'control',
      text: 'Kefka has poisoned rivers and toppled kingdoms for his own amusement. He is laughing. Make him stop.' },
    { id: 'jenova', cmd: 'Jenova, Ancient Calamity', title: 'The Calamity', deck: 'Reunion', where: 'The Northern Crater', ai: 'hard', q: 0.68, life: 40, arch: 'midrange',
      text: 'The calamity from the skies stirs beneath the ice, twisting everything it touches and calling her son home.' },
    { id: 'sephiroth', cmd: 'Sephiroth, Fabled SOLDIER', title: 'The One-Winged Angel', deck: 'The One-Winged Angel', where: 'The Lifestream', ai: 'hard', q: 0.8, life: 50, arch: 'midrange', boss: true,
      include: ['Sephiroth’s Intervention'],
      text: 'The legend of SOLDIER waits where the Planet’s memories flow. He has seen how this ends. Prove him wrong.' },
  ];
  // Frodo's road: the villains of The Lord of the Rings, in the order he meets them. A gift comes with the reward for
  // clearing a stage (Bilbo's in Rivendell, the elves' in Lothlórien) and stays in the deck for good.
  const FRODO_STAGES = [
    { id: 'lobelia', cmd: 'Lobelia Sackville-Baggins', title: 'The Sackville-Bagginses', deck: 'Sackville-Baggins Spoons', where: 'Bag End', ai: 'normal', q: 0.3, life: 24, arch: 'midrange',
      text: 'Bilbo has gone, and his cousin Lobelia has come for Bag End and every spoon in it. Show her the door before you set out.' },
    { id: 'ferny', cmd: 'Bill Ferny, Bree Swindler', title: 'The Swindler', deck: 'Bree-land Crooks', where: 'Bree', ai: 'normal', q: 0.36, life: 28, arch: 'aggro',
      text: 'A sly man in Bree watches the road and sells what he sees. Get past him before the riders in black hear about you.' },
    { id: 'riders', cmd: 'Lord of the Nazgûl', title: 'The Black Riders', deck: 'The Nine Riders', where: 'Weathertop', ai: 'normal', q: 0.3, life: 24, arch: 'control',
      include: ['Nazgûl', 'Ringwraiths'],
      gift: { cards: ['Sting, the Glinting Dagger', 'Mithril Coat'], from: 'Bilbo’s gifts', text: 'In Rivendell, Bilbo gives you his old sword Sting and a shirt of mithril rings.' },
      text: 'Dark shapes climb the hill by moonlight, and they are looking for you. Hold the summit until morning.' },
    { id: 'watcher', cmd: 'The Watcher in the Water', title: 'The Watcher', deck: 'The Doors of Durin', where: 'The West-gate of Moria', ai: 'hard', q: 0.54, life: 36, arch: 'control',
      text: 'Something in the still, dark lake by the gate has been waiting a very long time, and it reaches for whoever comes near the doors.' },
    { id: 'balrog', cmd: 'The Balrog, Durin\'s Bane', title: 'Durin’s Bane', deck: 'The Deeps of Moria', where: 'The Bridge of Khazad-dûm', ai: 'hard', q: 0.3, life: 28, arch: 'midrange',
      include: ['Swarming of Moria', 'Moria Marauder'],
      gift: { cards: ['Phial of Galadriel', 'Lembas'], from: 'Gifts of Lothlórien', text: 'In Lothlórien the elves send you on with waybread and a phial of starlight.' },
      text: 'Something old woke in the dark under the mountains, wrapped in shadow and flame. The bridge is narrow and the drums are getting closer.' },
    { id: 'saruman', cmd: 'Saruman, the White Hand', title: 'The White Hand', deck: 'Uruk-hai of Isengard', where: 'Amon Hen', ai: 'hard', q: 0.45, life: 36, arch: 'midrange',
      include: ['Fire of Orthanc', 'Treason of Isengard'],
      text: 'The wizard of Isengard wants the Ring for himself, and his Uruk-hai have caught the Fellowship by the river. Break away before they surround you.' },
    { id: 'gollum', cmd: 'Gollum, Obsessed Stalker', title: 'The Stalker', deck: 'Precious', where: 'The Dead Marshes', ai: 'hard', q: 0.62, life: 40, arch: 'aggro',
      include: ['Gollum\'s Bite', 'The Torment of Gollum'],
      text: 'Something has followed you since Moria, padding along behind and whispering about its precious. Tonight it stops following.' },
    { id: 'witchking', cmd: 'Witch-king of Angmar', title: 'The Witch-king', deck: 'Host of Minas Morgul', where: 'Minas Morgul', ai: 'hard', q: 0.45, life: 32, arch: 'aggro',
      include: ['Mordor Muster', 'Nazgûl'],
      text: 'The gates of the dead city swing open and an army marches out under a pale light, its captain riding at the front. He has sensed the Ring.' },
    { id: 'shelob', cmd: 'Shelob, Child of Ungoliant', title: 'Shelob’s Lair', deck: 'Webs of Cirith Ungol', where: 'Cirith Ungol', ai: 'hard', q: 0.5, life: 40, arch: 'midrange',
      include: ['Shelob\'s Ambush', 'Mineshaft Spider'],
      text: 'Your guide has led you into a tunnel thick with webs and old bones, and something enormous is waiting in the dark.' },
    { id: 'sauron', cmd: 'Sauron, the Dark Lord', title: 'The Dark Lord', deck: 'The Fires of Mount Doom', where: 'Mount Doom', ai: 'hard', q: 0.62, life: 45, arch: 'midrange', boss: true,
      include: ['Relic of Sauron', 'Sauron\'s Ransom', 'Lidless Gaze'],
      text: 'You stand at the edge of the fire with the Ring heavy around your neck, and the Dark Lord knows where you are. Finish what you started.' },
  ];
  const JOURNEYS = {
    cloud: {
      id: 'cloud', set: 'FIN', hero: 'Cloud', his: 'his', title: 'Cloud’s Journey', world: 'Final Fantasy',
      start: 'Cloud, Midgar Mercenary', sword: 'Buster Sword', deck: 'Cloud’s Party', seed: 9001, stages: CLOUD_STAGES,
      kinds: ['Weapons', 'Allies', 'Magic'],
      intro: 'Ten Commander fights across the worlds of Final Fantasy, from the Midgar slums to Sephiroth. Cloud starts with a plain deck; every win earns a pack of new cards.',
      begin: ['Cloud begins with ', 'Cloud, Midgar Mercenary', ' as his commander, the Buster Sword and a deck of plain white cards. Losing costs nothing: you can fight a stage as often as it takes.'],
      road: 'The road to Sephiroth', beaten: 'Sephiroth is defeated',
      doneTitle: 'The Planet is safe', doneText: 'Sephiroth falls, and the Lifestream runs quiet again.',
      blurb: 'Cloud and the cards he has picked up on the way',
    },
    frodo: {
      id: 'frodo', set: 'LTR', hero: 'Frodo', his: 'his', title: 'Frodo’s Journey', world: 'Middle-earth',
      start: 'Frodo, Sauron\'s Bane', sword: 'The One Ring', deck: 'The Ring-bearer', seed: 7001, stages: FRODO_STAGES, plain: 'core',
      kinds: ['Heirlooms', 'Companions', 'Lore'],
      intro: 'Ten Commander fights across Middle-earth, from Bag End to the fires of Mount Doom. Frodo starts with a plain deck and the One Ring; every win earns a pack of new cards, and friends on the road give him gifts.',
      begin: ['Frodo begins with ', 'Frodo, Sauron’s Bane', ' as his commander, the One Ring and a deck of plain white and black cards. Pay to make him a Scout, then a Rogue: once the Ring has tempted you four times, a Rogue Frodo who hits a player wins the game. Losing costs nothing: you can fight a stage as often as it takes.'],
      road: 'The road to Mount Doom', beaten: 'The Ring is destroyed',
      doneTitle: 'The Ring is destroyed', doneText: 'The Ring falls into the fire, and the Dark Lord’s tower comes down.',
      blurb: 'Frodo, the One Ring and the cards he has picked up on the road',
    },
  };
  const IDS = ['cloud', 'frodo'];
  // Old saved runs (and old journal games) were all Cloud's
  const journey = (x) => JOURNEYS[typeof x === 'string' ? x : (x && x.j) || 'cloud'] || JOURNEYS.cloud;
  const STAGES = CLOUD_STAGES;
  const CLOUD = { start: JOURNEYS.cloud.start, sword: JOURNEYS.cloud.sword, deck: JOURNEYS.cloud.deck };
  const PACK = 4; // cards in a reward pack
  const KIND_OF = [
    { id: 'gear', of: (d) => d.types.includes('Artifact') },
    { id: 'allies', of: (d) => d.types.includes('Creature') && !d.types.includes('Artifact') },
    { id: 'magic', of: (d) => !d.types.includes('Creature') && !d.types.includes('Artifact') },
  ];
  const KINDS = KIND_OF.map((k, i) => ({ id: k.id, name: JOURNEYS.cloud.kinds[i], of: k.of }));

  // Card names in the data use straight apostrophes; the stage list is written with curly ones
  const norm = (s) => s.replace(/’/g, "'");
  const named = (pool, n) => pool.find((d) => d.name === norm(n));
  const isLand = (d) => d.types.includes('Land');
  const quantile = (xs, q) => { const s = xs.slice().sort((a, b) => a - b); return s.length ? s[Math.round(q * (s.length - 1))] : 0; };
  const rngOf = (A, seed) => A.makeRng(seed >>> 0 || 1);
  const inIdentity = (A, cmd) => { const id = A.colorIdentity(cmd); return (d) => A.colorIdentity(d).every((c) => id.includes(c)); };
  // Cards that never leave the hero's deck: the keepsake and every gift
  const keepsakes = (J) => [J.sword].concat(...J.stages.map((st) => (st.gift ? st.gift.cards : [])));

  // A villain's deck: their colours, cards up to the stage's quality, built the way every commander deck is built
  function stageDeck(A, pool, k, j) {
    const J = journey(j), st = J.stages[k];
    const cmd = named(pool, st.cmd);
    const ok = inIdentity(A, cmd);
    const cands = pool.filter((d) => !isLand(d) && d.name !== cmd.name && ok(d));
    const cap = quantile(cands.map((d) => d.value), st.q);
    const keep = new Set((st.include || []).map(norm));
    const sub = pool.filter((d) => isLand(d) || (d.name !== cmd.name && ok(d) && (d.value <= cap || keep.has(d.name))));
    const deck = A.buildCommanderDeck(sub, { commander: cmd, archetype: st.arch, seed: J.seed + k * 37, name: norm(st.deck), include: [...keep].filter((n) => sub.some((d) => d.name === n)) });
    if (st.life) deck.life = st.life;
    return deck;
  }

  // The hero's first deck: the keepsake and plain cards in their colours from outside their world, nothing special.
  // Frodo's plain cards come from the classic core sets (plain: the names the page passes), so nothing from another world
  function newRun(A, pool, world, seed, j, plain) {
    const J = journey(j);
    const cmd = named(pool, J.start);
    const ok = inIdentity(A, cmd);
    const cands = pool.filter((d) => !isLand(d) && ok(d) && !world.has(d.name) && (!J.plain || !plain || plain.has(d.name)) && d.name !== cmd.name && !d.supertypes.includes('Legendary'));
    const vals = cands.map((d) => d.value);
    const lo = quantile(vals, 0.15), hi = quantile(vals, 0.5);
    const sub = pool.filter((d) => isLand(d) || d.name === J.sword || (cands.includes(d) && d.value >= lo && d.value <= hi));
    const deck = A.buildCommanderDeck(sub, { commander: cmd, archetype: 'midrange', seed, name: J.deck, include: [J.sword] });
    const spells = deck.list.filter((x) => !isLand(x.def)).map((x) => x.def.name);
    const lands = deck.list.filter((x) => isLand(x.def)).reduce((t, x) => t + x.n, 0);
    const run = { v: 1, seed, stage: 0, cmd: cmd.name, cards: spells, lands, starter: spells.slice(), got: [], fights: [], started: Date.now() };
    if (J.id !== 'cloud') run.j = J.id;
    return run;
  }

  // The hero's deck as it stands: their cards, and basic lands split by the mana symbols they need
  function heroDeck(A, pool, run) {
    const J = journey(run);
    const cmd = named(pool, run.cmd);
    const id = A.colorIdentity(cmd);
    const spells = run.cards.map((n) => named(pool, n)).filter(Boolean);
    const pips = Object.fromEntries(id.map((c) => [c, 0]));
    for (const d of spells) for (const c of id) pips[c] += d.cost[c] || 0;
    for (const c of id) pips[c] += (cmd.cost[c] || 0) * 3;
    // Hybrid symbols count for both colours, so a hybrid commander still gets lands of each
    for (const c of id) if (!pips[c] && cmd.text && cmd.text.includes(`{${c}}`)) pips[c] += 2;
    const total = Object.values(pips).reduce((t, n) => t + n, 0) || 1;
    const BASIC = { W: 'Plains', U: 'Island', B: 'Swamp', R: 'Mountain', G: 'Forest' };
    // Every colour the deck uses gets at least six sources; the rest follow the mana symbols
    const count = run.lands + Math.max(0, 99 - run.lands - spells.length);
    const want = id.map((c) => (pips[c] ? Math.max(6, (count * pips[c]) / total) : 0));
    const sum = want.reduce((t, n) => t + n, 0) || 1;
    const n = want.map((w) => Math.round((w * count) / sum));
    const big = n.indexOf(Math.max(...n));
    n[big] += count - n.reduce((t, x) => t + x, 0);
    const lands = id.map((c, k) => ({ def: named(pool, BASIC[c]), n: n[k] })).filter((x) => x.def && x.n > 0);
    const list = spells.map((def) => ({ def, n: 1 })).concat(lands);
    return A.deckFromList(J.deck, id, 'midrange', list, { commander: cmd, format: 'commander' });
  }

  // Three packs of four cards from the hero's world to choose from after a win, better the further they have come
  function packsFor(A, pool, world, run, k, seed) {
    const J = journey(run);
    const cmd = named(pool, run.cmd);
    const ok = inIdentity(A, cmd);
    const have = new Set(run.cards);
    const gifts = new Set(keepsakes(J));
    const cands = pool.filter((d) => world.has(d.name) && !isLand(d) && ok(d) && !have.has(d.name) && !gifts.has(d.name) && d.name !== cmd.name);
    const vals = cands.map((d) => d.value);
    const lo = quantile(vals, Math.min(0.6, 0.1 * k)), hi = quantile(vals, Math.min(1, 0.55 + 0.08 * k));
    const r = rngOf(A, seed);
    const taken = new Set();
    const packs = KIND_OF.map((kind, i) => {
      let list = cands.filter((d) => kind.of(d) && !taken.has(d.name));
      const band = list.filter((d) => d.value >= lo && d.value <= hi);
      if (band.length >= PACK) list = band;
      else list = list.sort((a, b) => Math.abs(a.value - (lo + hi) / 2) - Math.abs(b.value - (lo + hi) / 2)).slice(0, PACK * 2);
      const cards = r.shuffle(list.slice()).slice(0, PACK);
      // Top up from anything left if a kind runs short
      for (const d of r.shuffle(cands.filter((x) => !taken.has(x.name) && !cards.includes(x)))) { if (cards.length >= PACK) break; cards.push(d); }
      cards.forEach((d) => taken.add(d.name));
      return { kind: kind.id, name: J.kinds[i], cards: cards.map((d) => d.name) };
    });
    return packs;
  }

  // The gift that comes with the reward for clearing stage k, if there is one (cards already in the deck are left out)
  function giftFor(run, k) {
    const st = journey(run).stages[k], g = st && st.gift;
    if (!g) return null;
    const cards = g.cards.map(norm).filter((n) => !run.cards.includes(n));
    return cards.length ? { from: g.from, text: g.text, cards } : null;
  }

  // The worst card goes for each new one: by the engine's own measure of a card; the keepsake and gifts always stay
  function addCards(pool, run, names) {
    const keepers = keepsakes(journey(run)).map(norm);
    const cards = run.cards.slice(), out = [];
    // Cards they started with go first, then the weakest of what they have earned; never a keepsake or this pack
    const keep = (x) => !keepers.includes(x) && !names.includes(x);
    const weakest = (xs) => xs.map((x) => named(pool, x)).filter(Boolean).sort((a, b) => a.value - b.value)[0];
    for (const n of names) {
      if (cards.includes(n)) continue;
      const worst = weakest(cards.filter((x) => keep(x) && !run.got.includes(x))) || weakest(cards.filter(keep));
      if (worst) { cards.splice(cards.indexOf(worst.name), 1); out.push(worst.name); }
      cards.push(n);
    }
    return { run: Object.assign({}, run, { cards, got: run.got.concat(names) }), out };
  }

  // A fight's result: a win opens the next stage, and the last one ends the journey
  function afterFight(run, k, won, info) {
    const fights = run.fights.concat([Object.assign({ k, won, at: Date.now() }, info || {})]);
    const next = Object.assign({}, run, { fights });
    if (won && k === run.stage) {
      next.stage = k + 1;
      if (next.stage >= journey(run).stages.length) next.done = next.done || Date.now();
    }
    return next;
  }

  return { JOURNEYS, IDS, journey, STAGES, CLOUD, PACK, KINDS, norm, stageDeck, newRun, heroDeck, cloudDeck: heroDeck, packsFor, giftFor, addCards, afterFight };
});
