/* Career: Cloud's journey. Ten Commander fights against villains from across Final Fantasy, ending with Sephiroth.
   Cloud starts with a plain deck; each win earns a pack of new Final Fantasy cards that replace his weakest ones. The
   villains get tougher as he goes: better cards, the hard AI from the third stage, and more life.
   Data and rules only: functions take the engine (A) and the compiled card pool, so the page and Node tests share them. */
(function (root, factory) {
  const C = factory();
  if (typeof module === 'object' && module.exports) module.exports = C;
  else root.ARENA_CAREER = C;
})(typeof self !== 'undefined' ? self : this, function () {
  // q: how good their cards are (the share of the cards in their colours they may use, weakest first)
  const STAGES = [
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
  const CLOUD = { start: 'Cloud, Midgar Mercenary', sword: 'Buster Sword', deck: 'Cloud’s Party' };
  const PACK = 4; // cards in a reward pack
  const KINDS = [
    { id: 'gear', name: 'Weapons', of: (d) => d.types.includes('Artifact') },
    { id: 'allies', name: 'Allies', of: (d) => d.types.includes('Creature') && !d.types.includes('Artifact') },
    { id: 'magic', name: 'Magic', of: (d) => !d.types.includes('Creature') && !d.types.includes('Artifact') },
  ];

  // Card names in the data use straight apostrophes; the stage list is written with curly ones
  const norm = (s) => s.replace(/’/g, "'");
  const named = (pool, n) => pool.find((d) => d.name === norm(n));
  const isLand = (d) => d.types.includes('Land');
  const quantile = (xs, q) => { const s = xs.slice().sort((a, b) => a - b); return s.length ? s[Math.round(q * (s.length - 1))] : 0; };
  const rngOf = (A, seed) => A.makeRng(seed >>> 0 || 1);
  const inIdentity = (A, cmd) => { const id = A.colorIdentity(cmd); return (d) => A.colorIdentity(d).every((c) => id.includes(c)); };

  // A villain's deck: their colours, cards up to the stage's quality, built the way every commander deck is built
  function stageDeck(A, pool, k) {
    const st = STAGES[k];
    const cmd = named(pool, st.cmd);
    const ok = inIdentity(A, cmd);
    const cands = pool.filter((d) => !isLand(d) && d.name !== cmd.name && ok(d));
    const cap = quantile(cands.map((d) => d.value), st.q);
    const keep = new Set((st.include || []).map(norm));
    const sub = pool.filter((d) => isLand(d) || (d.name !== cmd.name && ok(d) && (d.value <= cap || keep.has(d.name))));
    const deck = A.buildCommanderDeck(sub, { commander: cmd, archetype: st.arch, seed: 9001 + k * 37, name: norm(st.deck), include: [...keep] });
    if (st.life) deck.life = st.life;
    return deck;
  }

  // Cloud's first deck: his sword and plain white cards from outside Final Fantasy, nothing special
  function newRun(A, pool, fin, seed) {
    const cmd = named(pool, CLOUD.start);
    const ok = inIdentity(A, cmd);
    const cands = pool.filter((d) => !isLand(d) && ok(d) && !fin.has(d.name) && d.name !== cmd.name && !d.supertypes.includes('Legendary'));
    const vals = cands.map((d) => d.value);
    const lo = quantile(vals, 0.15), hi = quantile(vals, 0.5);
    const sub = pool.filter((d) => isLand(d) || d.name === CLOUD.sword || (cands.includes(d) && d.value >= lo && d.value <= hi));
    const deck = A.buildCommanderDeck(sub, { commander: cmd, archetype: 'midrange', seed, name: CLOUD.deck, include: [CLOUD.sword] });
    const spells = deck.list.filter((x) => !isLand(x.def)).map((x) => x.def.name);
    const lands = deck.list.filter((x) => isLand(x.def)).reduce((t, x) => t + x.n, 0);
    return { v: 1, seed, stage: 0, cmd: cmd.name, cards: spells, lands, starter: spells.slice(), got: [], fights: [], started: Date.now() };
  }

  // Cloud's deck as it stands: his cards, and basic lands split by the mana symbols they need
  function cloudDeck(A, pool, run) {
    const cmd = named(pool, run.cmd);
    const id = A.colorIdentity(cmd);
    const spells = run.cards.map((n) => named(pool, n)).filter(Boolean);
    const pips = Object.fromEntries(id.map((c) => [c, 0]));
    for (const d of spells) for (const c of id) pips[c] += d.cost[c] || 0;
    for (const c of id) pips[c] += (cmd.cost[c] || 0) * 3;
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
    return A.deckFromList(CLOUD.deck, id, 'midrange', list, { commander: cmd, format: 'commander' });
  }

  // Three packs of three Final Fantasy cards to choose from after a win, better the further Cloud has come
  function packsFor(A, pool, fin, run, k, seed) {
    const cmd = named(pool, run.cmd);
    const ok = inIdentity(A, cmd);
    const have = new Set(run.cards);
    const cands = pool.filter((d) => fin.has(d.name) && !isLand(d) && ok(d) && !have.has(d.name) && d.name !== cmd.name);
    const vals = cands.map((d) => d.value);
    const lo = quantile(vals, Math.min(0.6, 0.1 * k)), hi = quantile(vals, Math.min(1, 0.55 + 0.08 * k));
    const r = rngOf(A, seed);
    const taken = new Set();
    const packs = KINDS.map((kind) => {
      let list = cands.filter((d) => kind.of(d) && !taken.has(d.name));
      const band = list.filter((d) => d.value >= lo && d.value <= hi);
      if (band.length >= PACK) list = band;
      else list = list.sort((a, b) => Math.abs(a.value - (lo + hi) / 2) - Math.abs(b.value - (lo + hi) / 2)).slice(0, PACK * 2);
      const cards = r.shuffle(list.slice()).slice(0, PACK);
      // Top up from anything left if a kind runs short
      for (const d of r.shuffle(cands.filter((x) => !taken.has(x.name) && !cards.includes(x)))) { if (cards.length >= PACK) break; cards.push(d); }
      cards.forEach((d) => taken.add(d.name));
      return { kind: kind.id, name: kind.name, cards: cards.map((d) => d.name) };
    });
    return packs;
  }

  // The worst card goes for each new one: by the engine's own measure of a card, the sword always stays
  function addCards(pool, run, names) {
    const cards = run.cards.slice(), out = [];
    // Cards he started with go first, then the weakest of what he has earned; never the sword or this pack
    const keep = (x) => x !== CLOUD.sword && !names.includes(x);
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
      if (next.stage >= STAGES.length) next.done = next.done || Date.now();
    }
    return next;
  }

  return { STAGES, CLOUD, PACK, KINDS, norm, stageDeck, newRun, cloudDeck, packsFor, addCards, afterFight };
});
