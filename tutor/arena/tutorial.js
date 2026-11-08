// Tutorial lessons. Each lesson starts from a fixed board, and every step names the one action the coach asks for.
// The same file runs in the page and in the Node tests, so a lesson that plays out here plays out the same way there.
(function (root, factory) {
  const lib = factory();
  if (typeof module === 'object' && module.exports) module.exports = lib;
  else root.ARENA_TUTORIAL = lib;
})(typeof self !== 'undefined' ? self : this, function () {
  const fill = (top, card, n) => top.concat(Array(Math.max(0, n - top.length)).fill(card));
  const lands = (name, n, tapped) => Array.from({ length: n }, () => ({ name, tapped: !!tapped }));

  const LESSONS = [
    {
      id: 'mana', group: 'basics', title: 'Lands and mana', time: '2 min',
      blurb: 'Play lands, make mana and cast your first creatures.',
      you: { name: 'Green Grove', colors: ['G'], archetype: 'midrange' },
      foe: { name: 'Goblin Gang', colors: ['R'], archetype: 'midrange' },
      setup: {
        turn: 1, active: 0, text: 'Lesson 1: lands and mana.',
        players: [
          { life: 20, hand: ['Forest', 'Llanowar Elves', 'Centaur Courser'], library: fill(['Forest', 'Grizzly Bears'], 'Forest', 20) },
          { life: 20, bf: lands('Mountain', 1), hand: ['Goblin Piker'], library: fill([], 'Mountain', 20) },
        ],
      },
      intro: [
        { title: 'Welcome to Magic', text: 'You and your opponent each start with 20 life. Bring theirs to 0 and you win. You do that with creatures and spells, and you pay for them with mana from your lands.' },
      ],
      steps: [
        { title: 'Play a land', say: 'Lands make mana, and you may play one land on each of your turns. Tap the glowing Forest in your hand, then choose Play this land.', do: { land: 'Forest' } },
        { title: 'Cast Llanowar Elves', say: 'Llanowar Elves costs {G}: one green mana, which your Forest makes. Tap it and cast it. Arena taps your lands for you.', do: { cast: 'Llanowar Elves' } },
        { title: 'Play another land', say: 'Your opponent played a creature on their turn. Now it\'s your turn again and you drew a card. Play the Forest you drew.', do: { land: 'Forest' } },
        { title: 'Cast Centaur Courser', say: 'New creatures can\'t attack or tap the turn they arrive. Llanowar Elves arrived last turn, so now it can tap for {G}. With two Forests that makes three mana: enough for Centaur Courser.', do: { cast: 'Centaur Courser' } },
      ],
      outro: { title: 'You cast your first creatures', points: ['You may play one land each turn.', 'Mana pays a card\'s cost. A colored symbol needs mana of that color.', 'A new creature can\'t attack or tap until your next turn.'] },
    },
    {
      id: 'combat', group: 'basics', title: 'Attack and block', time: '2 min',
      blurb: 'Choose attackers, block, and see how creatures fight.',
      you: { name: 'Green Grove', colors: ['G'], archetype: 'midrange' },
      foe: { name: 'Goblin Gang', colors: ['R'], archetype: 'midrange' },
      setup: {
        turn: 5, active: 0, text: 'Lesson 2: attack and block.',
        players: [
          { life: 18, bf: [...lands('Forest', 3), { name: 'Grizzly Bears' }, { name: 'Centaur Courser' }], library: fill([], 'Craw Wurm', 12) },
          { life: 20, bf: [...lands('Mountain', 3), { name: 'Goblin Brigand', tapped: true }], library: fill([], 'Mountain', 12) },
        ],
      },
      intro: [
        { title: 'Combat', text: 'Creatures attack your opponent. They may block an attacker with one of their untapped creatures, and then the two deal damage to each other instead. A creature is destroyed when it takes damage equal to its toughness, the second number.' },
      ],
      steps: [
        { title: 'Attack with Grizzly Bears', say: 'Goblin Brigand attacked you last turn and is still tapped, so it can\'t block. Attack with Grizzly Bears only. Keep Centaur Courser home: attacking taps a creature, and tapped creatures can\'t block.', do: { attack: ['Grizzly Bears'] } },
        { title: 'Block with Centaur Courser', say: 'Goblin Brigand has to attack every turn. Block it: tap Centaur Courser, then tap Goblin Brigand. Your 3/3 deals 3 damage to their 2/2 and takes only 2.', do: { block: [['Centaur Courser', 'Goblin Brigand']] } },
        { title: 'Attack with both', say: 'Damage wears off at the end of every turn, so Courser is as good as new. Their side is empty: attack with both creatures.', do: { attack: ['Grizzly Bears', 'Centaur Courser'] } },
      ],
      outro: { title: 'You won the fight', points: ['Attacking taps your creatures, so they can\'t block on your opponent\'s turn.', 'A blocker and the attacker it blocks deal damage to each other.', 'Damage heals at the end of every turn.'] },
    },
    {
      id: 'instants', group: 'basics', title: 'Instants and targets', time: '2 min',
      blurb: 'Cast a spell on your opponent\'s turn, then aim one at a player.',
      you: { name: 'Bolt Club', colors: ['R'], archetype: 'midrange' },
      foe: { name: 'Hill Giants', colors: ['R'], archetype: 'aggro' },
      setup: {
        turn: 6, active: 1, text: 'Lesson 3: instants and targets.',
        players: [
          { life: 20, bf: lands('Mountain', 2), hand: ['Lightning Bolt', 'Lightning Bolt'], library: fill([], 'Mountain', 12) },
          { life: 3, bf: [...lands('Mountain', 4), { name: 'Hill Giant' }], library: fill([], 'Mountain', 12) },
        ],
      },
      intro: [
        { title: 'Instants', text: 'Most spells can only be cast in your own turn. Instants can be cast at any time, even in the middle of your opponent\'s attack. Lightning Bolt is an instant that deals 3 damage to any target: a creature or a player.' },
      ],
      steps: [
        { title: 'Bolt the attacker', say: 'Hill Giant is attacking you. Cast Lightning Bolt now and target Hill Giant: 3 damage destroys a 3/3.', do: { cast: 'Lightning Bolt', t: [{ card: 'Hill Giant' }] } },
        { title: 'Keep the other Bolt', say: 'Nothing is attacking you any more. Keep your second Lightning Bolt for later: choose Pass.', do: { pass: true } },
        { title: 'Their turn is ending', say: 'At the end of your opponent\'s turn you get one more chance to cast instants. Pass again and wait for your turn.', do: { pass: true } },
        { title: 'Finish them', say: 'Your opponent has 3 life left, and Lightning Bolt can hit players too. Cast it and tap their life total as the target.', do: { cast: 'Lightning Bolt', t: [{ player: 1 }] } },
      ],
      outro: { title: 'You won the game', points: ['Instants can be cast on either player\'s turn.', '"Any target" means a creature or a player.', 'A player at 0 life loses.'] },
    },
    {
      id: 'commander', group: 'commander', title: 'Meet your commander', time: '2 min',
      blurb: 'The command zone, 40 life, and casting your commander.',
      you: { name: "Rorix's Roost", colors: ['R'], archetype: 'midrange', commander: 'Rorix Bladewing' },
      foe: { name: "Barktooth's Band", colors: ['B', 'R'], archetype: 'midrange', commander: 'Barktooth Warbeard' },
      setup: {
        turn: 7, active: 0, text: 'Lesson 4: meet your commander.',
        players: [
          { life: 40, bf: lands('Mountain', 5), library: fill(['Mountain'], 'Mountain', 14) },
          { life: 40, bf: [...lands('Swamp', 2), ...lands('Mountain', 2), { name: 'Gray Ogre' }], library: fill([], 'Swamp', 14) },
        ],
      },
      intro: [
        { title: 'Commander', text: 'Commander is the most played way to enjoy Magic. Each player picks a legendary creature as their commander and builds a 100-card deck around it: the commander and 99 other cards, only one copy of each (basic lands aside), all in the commander\'s colors.' },
        { title: 'The command zone', text: 'Everyone starts at 40 life, so games are longer and big creatures matter. Your commander isn\'t shuffled into your deck. It waits beside you in the command zone, and you can cast it from there whenever you have the mana.' },
      ],
      steps: [
        { title: 'Play a land', say: 'You have five Mountains and you drew a sixth. Play it.', do: { land: 'Mountain' } },
        { title: 'Cast your commander', say: 'Rorix Bladewing waits in the command zone: the card with the gold star at the left of your hand. It costs six mana and you have six Mountains. Cast it from the command zone.', do: { cast: 'Rorix Bladewing' } },
        { title: 'Attack with Rorix', say: 'Rorix has haste, so it can attack straight away, and flying, so only creatures with flying or reach can block it. Gray Ogre can\'t. Attack!', do: { attack: ['Rorix Bladewing'] } },
      ],
      outro: { title: 'Rorix strikes', points: ['Your commander starts in the command zone and can be cast from there.', 'Combat damage from a commander is counted on its own. Watch the star badge under your opponent\'s life.', '40 life, 100 cards, one copy of each.'] },
    },
    {
      id: 'tax', group: 'commander', title: 'Commander tax', time: '2 min',
      blurb: 'Your commander dies and comes back, for a price.',
      you: { name: "Rorix's Roost", colors: ['R'], archetype: 'midrange', commander: 'Rorix Bladewing' },
      foe: { name: "Barktooth's Band", colors: ['B', 'R'], archetype: 'midrange', commander: 'Barktooth Warbeard' },
      setup: {
        turn: 8, active: 1, text: 'Lesson 5: commander tax.',
        players: [
          { life: 34, bf: lands('Mountain', 7), cmdOnBf: true, cmdCasts: 1, library: fill(['Mountain'], 'Mountain', 14) },
          { life: 34, cmdDmg: 6, bf: [...lands('Swamp', 2), ...lands('Mountain', 2)], hand: ['Doom Blade'], library: fill([], 'Swamp', 14) },
        ],
      },
      intro: [
        { title: 'When a commander falls', text: 'Removal works on commanders too. But a commander never stays in the graveyard or in exile: it goes back to the command zone, ready to be cast again. Watch what your opponent does on their turn.' },
      ],
      steps: [
        { title: 'Play a land', say: 'Your opponent destroyed Rorix with Doom Blade, and Rorix went back to the command zone. Start your turn by playing the Mountain you drew.', do: { land: 'Mountain' } },
        { title: 'Cast Rorix again', say: 'Each time you cast your commander from the command zone it costs {2} more than the time before. That\'s the commander tax. Rorix now costs eight mana, and you have eight Mountains.', do: { cast: 'Rorix Bladewing' } },
        { title: 'Attack', say: 'Rorix is back, and still has haste. Attack!', do: { attack: ['Rorix Bladewing'] } },
      ],
      outro: { title: 'Back from the command zone', points: ['A commander that dies or is exiled returns to the command zone.', 'Commander tax: {2} more for each earlier cast from the command zone.', 'Casting it from your hand never costs extra.'] },
    },
    {
      id: 'cmddamage', group: 'commander', title: 'Commander damage', time: '2 min',
      blurb: 'Win with 21 damage from your commander, at any life total.',
      you: { name: "Rorix's Roost", colors: ['R'], archetype: 'midrange', commander: 'Rorix Bladewing' },
      foe: { name: "Barktooth's Band", colors: ['B', 'R'], archetype: 'midrange', commander: 'Barktooth Warbeard' },
      setup: {
        turn: 11, active: 0, text: 'Lesson 6: commander damage.',
        players: [
          { life: 30, bf: lands('Mountain', 8), cmdOnBf: true, cmdCasts: 2, hand: ['Flame Slash'], library: fill(['Mountain'], 'Mountain', 14) },
          { life: 25, cmdDmg: 15, bf: [...lands('Swamp', 3), ...lands('Mountain', 3), { name: 'Vampire Nighthawk' }], library: fill([], 'Swamp', 14) },
        ],
      },
      intro: [
        { title: 'Commander damage', text: 'If one commander deals a player 21 combat damage over a game, that player loses, however much life they have left. Your opponent still has 25 life, but Rorix has already hit them for 15.' },
      ],
      steps: [
        { title: 'Clear the way', say: 'Vampire Nighthawk has flying, so it can block Rorix, and deathtouch, so any damage it deals is enough to destroy him. Flame Slash deals 4 damage to a creature. Cast it on the Nighthawk.', do: { cast: 'Flame Slash', t: [{ card: 'Vampire Nighthawk' }] } },
        { title: 'Go to combat', say: 'Nothing on their side can block a flyer now. Go to combat.', do: { pass: 'combat' } },
        { title: 'Attack with Rorix', say: 'Rorix deals 6. Fifteen plus six makes 21 commander damage.', do: { attack: ['Rorix Bladewing'] } },
      ],
      outro: { title: 'Victory by commander damage', points: ['21 combat damage from one commander wins the game.', 'It counts per commander, so watch the number under each life total.', 'Removal that clears blockers sets up the final hit.'] },
    },
    {
      id: 'practice', group: 'commander', title: 'Your first Commander game', time: '15 min',
      blurb: 'A full game against the AI, with tips along the way.', practice: true,
      you: { deck: 'k.rorix' }, foe: { deck: 'k.cyclops' },
      intro: [
        { title: 'Your first game', text: 'You play Rorix\'s Roost, a red dragon deck led by Rorix Bladewing. The AI plays Cyclops Stampede, led by Borborygmos. Tips will pop up the first time something new happens. Undo is always there if you change your mind.' },
      ],
      outro: { title: 'Game over', points: ['Try the other decks in the Commander lobby.', 'Build a deck around any of 58 legendary commanders.'] },
    },
  ];

  // Tips for the practice game, each shown once, the first time it applies.
  const TIPS = [
    { id: 'mull', when: (q) => q.type === 'mulligan', title: 'Your opening hand', say: 'Keep a hand with two to five lands. In Commander your first mulligan is free: you draw a new seven and keep all of them.' },
    { id: 'land', when: (q) => q.type === 'act' && q.when === 'main1' && q.actions.some((a) => a.kind === 'land'), title: 'Your turn', say: 'Play a land every turn you can. Tap a glowing card to see what you can do with it.' },
    { id: 'cmd', when: (q) => q.type === 'act' && q.actions.some((a) => a.cmd), title: 'Your commander is ready', say: 'You have the mana for your commander. Tap it at the left of your hand to cast it from the command zone.' },
    { id: 'attack', when: (q) => q.type === 'attack', title: 'Attack', say: 'Tap creatures to attack with them, then confirm. Attackers get tapped, so they can\'t block on your opponent\'s turn.' },
    { id: 'block', when: (q) => q.type === 'block', title: 'Block', say: 'Tap one of your untapped creatures, then the attacker it should block. The bar shows how much damage you\'d take.' },
    { id: 'window', when: (q) => q.type === 'act' && q.when === 'attackers', title: 'Instant speed', say: 'You can cast an instant or use an ability now, in the middle of their attack. Or pass and go on to blocks.' },
    { id: 'tax', when: (q, s) => s && s.p[0].tax > 0 && s.p[0].cmd && s.p[0].cmd.length > 0 && q.type === 'act', title: 'Commander tax', say: 'Your commander is back in the command zone. Casting it again costs {2} more for each time you\'ve already cast it from there.' },
  ];

  // The answer a step asks for, worked out from the question the engine is asking now.
  // nameOf(id) gives a card's name. Returns null when the question isn't the one this step expects.
  function resolve(step, req, nameOf) {
    const d = step.do;
    const is = (id, n) => nameOf(id) === n;
    if (d.land || d.cast) {
      if (req.type !== 'act') return null;
      const kind = d.land ? 'land' : 'cast';
      const a = req.actions.find((x) => x.kind === kind && is(x.card, d.land || d.cast));
      if (!a) return null;
      const t = [], etb = [], targets = [];
      (d.t || []).forEach((want, k) => {
        const sp = (a.specs || [])[k];
        if (!sp) return;
        let val = null;
        if (want.player != null) val = `p${want.player}`;
        else val = (sp.cands || []).find((c) => typeof c === 'number' && is(c, want.card));
        if (val == null) return;
        targets.push(val);
        (a.etb ? etb : t)[sp.k] = typeof val === 'string' ? { p: +val.slice(1) } : { c: val };
      });
      if (targets.length < (d.t || []).length) return null;
      return { kind: 'act', action: a, targets, answer: { type: 'act', act: a.act, t, etb } };
    }
    if (d.pass != null) {
      if (req.type !== 'act') return null;
      if (d.pass === 'combat' && !req.canAttack) return null;
      return { kind: 'pass', answer: { type: 'act', pass: d.pass } };
    }
    if (d.attack) {
      if (req.type !== 'attack') return null;
      const ids = d.attack.map((n) => req.cands.find((id) => is(id, n)));
      if (ids.some((x) => x == null)) return null;
      return { kind: 'attack', ids, answer: { type: 'attack', ids } };
    }
    if (d.block) {
      if (req.type !== 'block') return null;
      const blocks = [];
      for (const [bn, an] of d.block) {
        const o = req.attackers.find((x) => is(x.id, an));
        const b = o && o.by.find((id) => is(id, bn));
        if (b == null) return null;
        blocks.push([o.id, [b]]);
      }
      return { kind: 'block', blocks, answer: { type: 'block', blocks } };
    }
    if (d.keep != null) {
      if (req.type !== 'mulligan') return null;
      return { kind: 'sheet', answer: { type: 'mulligan', keep: d.keep } };
    }
    return null;
  }
  // Does a given answer do what the step asked? (Order of attackers or blocks doesn't matter.)
  function matches(exp, a) {
    const e = exp.answer;
    if (!a || a.type !== e.type) return false;
    if (e.type === 'act') {
      if (e.pass != null) return a.pass === e.pass || (e.pass === true && a.pass != null && a.pass !== 'combat');
      return a.act === e.act && JSON.stringify(a.t || []) === JSON.stringify(e.t) && JSON.stringify(a.etb || []) === JSON.stringify(e.etb);
    }
    if (e.type === 'attack') return (a.ids || []).length === e.ids.length && e.ids.every((id) => a.ids.includes(id));
    if (e.type === 'block') {
      const norm = (bs) => JSON.stringify((bs || []).map(([x, y]) => [x, (y || []).slice().sort()]).sort((p, q) => p[0] - q[0]));
      return norm(a.blocks) === norm(e.blocks);
    }
    if (e.type === 'mulligan') return a.keep === e.keep;
    return false;
  }
  // Decks and a starting board for a lesson, given a name-to-card lookup.
  function build(lesson, byName) {
    const def = (n) => { const d = byName(n); if (!d) throw new Error(`Lesson card missing: ${n}`); return d; };
    const deck = (p) => ({ name: p.name, colors: p.colors, archetype: p.archetype, cards: [], list: [], commander: p.commander ? def(p.commander) : undefined });
    const zone = (names) => (names || []).map(def);
    const players = lesson.setup.players.map((sp) => ({
      life: sp.life, hand: zone(sp.hand), library: zone(sp.library), gy: zone(sp.gy), cmdOnBf: sp.cmdOnBf, cmdCasts: sp.cmdCasts, cmdDmg: sp.cmdDmg,
      bf: (sp.bf || []).map((b) => ({ def: def(b.name), tapped: b.tapped, sick: b.sick })),
    }));
    return { decks: [deck(lesson.you), deck(lesson.foe)], setup: Object.assign({}, lesson.setup, { players }) };
  }
  return { LESSONS, TIPS, resolve, matches, build };
});
