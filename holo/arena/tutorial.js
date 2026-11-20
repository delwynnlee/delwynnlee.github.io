/* Holo Arena lessons. Each one is a fixed board (engine `setup`) and the moves the coach asks for, in order.
   Card names in steps are matched against the cards the engine offers, so ids never appear here. */
(function (root) {
  const E = { G: 'sve-1', R: 'sve-2', W: 'sve-3', L: 'sve-4', P: 'sve-5', F: 'sve-6', D: 'sve-7' };
  const PIKACHU = 'me55-30', PAWMI = 'sv2-74', AIPOM = 'sv6-137', BUNEARY = 'sv8pt5-83', BUIZEL = 'sv3-48';
  const CHARMANDER = 'me2-11', CHARMELEON = 'me2pt5-21', DONDOZO = 'svp-12', CLAMPERL = 'sv10-54', SHROODLE = 'sv2-145';
  const IRON_HANDS = 'sv4-70', SQUAWK = 'sv2-169';
  const NEST_BALL = 'sv1-181', BOSS = 'me1-114';
  const filler = (k, id) => Array.from({ length: k }, () => id);
  const you = (ids) => ({ name: 'You', archetype: 'midrange', deckList: ids });
  const rival = (ids) => ({ name: 'Rival', archetype: 'midrange', deckList: ids });

  const LESSONS = [
    {
      id: 'first-attack', group: 'Your first turns', title: 'Your first attack', time: '2 min',
      blurb: 'Put a Pokémon on your Bench, attach an Energy and attack.',
      you: you([PIKACHU, PAWMI, E.L]), foe: rival([AIPOM]),
      setup: {
        turn: 2, active: 0, first: 1, text: 'Your opponent went first. Now it is your turn.',
        players: [
          { active: { d: PIKACHU }, hand: [PAWMI, E.L], deck: filler(12, E.L), prizes: 6, turns: 0 },
          { active: { d: AIPOM, dmg: 30 }, hand: [], deck: filler(12, E.G), prizes: 6, turns: 1 },
        ],
      },
      steps: [
        { title: 'Put a Pokémon on your Bench', say: 'Pawmi is a Basic Pokémon. Tap it in your hand and put it on your Bench, where it waits until it is needed.', do: { act: 'bench', card: 'Pawmi' } },
        { title: 'Attach an Energy', say: 'Attacks cost Energy. Tap the Lightning Energy in your hand and attach it to Pikachu, your Active Pokémon. You can attach one Energy card from your hand each turn.', do: { act: 'energy', card: 'Basic Lightning Energy', to: 'Pikachu' } },
        { title: 'Attack', say: 'Mach Bolt costs one Lightning Energy and does 30 damage. Aipom has 30 HP left. Tap Mach Bolt below.', do: { act: 'attack', atk: 'Mach Bolt' } },
      ],
      outro: 'Aipom is Knocked Out and your opponent has no Pokémon left, so you win. Usually you win by taking all six of your Prize cards, one for each Pokémon you Knock Out.',
    },
    {
      id: 'evolution', group: 'Your first turns', title: 'Evolution', time: '2 min',
      blurb: 'Evolve Charmander into Charmeleon for more HP and a bigger attack.',
      you: you([CHARMANDER, CHARMELEON, E.R]), foe: rival([BUIZEL]),
      setup: {
        turn: 3, active: 0, first: 0, text: 'Charmander has been in play since your last turn, so it can evolve.',
        players: [
          { active: { d: CHARMANDER, energy: [E.R] }, hand: [CHARMELEON, E.R], deck: filler(12, E.R), prizes: 6, turns: 1 },
          { active: { d: BUIZEL, dmg: 20 }, hand: [], deck: filler(12, E.W), prizes: 6, turns: 1 },
        ],
      },
      steps: [
        { title: 'Evolve', say: 'Charmeleon is a Stage 1 Pokémon that evolves from Charmander. Tap Charmeleon in your hand and play it on top of Charmander. It keeps its Energy and damage and gets more HP and a new attack.', do: { act: 'evolve', card: 'Charmeleon', to: 'Charmander' } },
        { title: 'Power it up', say: 'Heat Blast costs one Fire Energy and one Energy of any type. Charmeleon already has one Fire Energy, so attach the other.', do: { act: 'energy', card: 'Basic Fire Energy', to: 'Charmeleon' } },
        { title: 'Heat Blast', say: 'Heat Blast does 50 damage, exactly what Buizel has left.', do: { act: 'attack', atk: 'Heat Blast' } },
      ],
      outro: 'A Pokémon can evolve once a turn, but not on your first turn or the turn it came into play. Stage 2 Pokémon evolve from Stage 1 the same way, and Rare Candy lets a Basic skip straight to Stage 2.',
    },
    {
      id: 'trainers', group: 'Your first turns', title: 'Trainer cards', time: '3 min',
      blurb: 'Search your deck with an Item, then use a Supporter to pick your target.',
      you: you([PIKACHU, PAWMI, NEST_BALL, BOSS, E.L]), foe: rival([DONDOZO, BUNEARY, AIPOM]),
      setup: {
        turn: 2, active: 0, first: 1, text: 'One Prize card left. Knock out anything to win.',
        players: [
          { active: { d: PIKACHU }, hand: [NEST_BALL, BOSS, E.L], deck: [E.L, PAWMI, E.L, E.L, E.L, E.L], prizes: 1, turns: 0 },
          { active: { d: DONDOZO }, bench: [{ d: BUNEARY, dmg: 30 }, { d: AIPOM }], hand: [], deck: filler(12, E.W), prizes: 6, turns: 1 },
        ],
      },
      steps: [
        { title: 'Play an Item', say: 'Nest Ball is an Item card, and you can play as many Items as you like each turn. It finds a Basic Pokémon in your deck and puts it onto your Bench. Tap Nest Ball.', do: { act: 'play', card: 'Nest Ball' } },
        { title: 'Choose a Pokémon', say: 'Pick Pawmi from your deck.', do: { pick: ['Pawmi'] } },
        { title: 'Play a Supporter', say: "Dondozo has 150 HP, too much for Pikachu. Boss's Orders is a Supporter, limited to one each turn: it pulls one of your opponent's Benched Pokémon into the Active Spot.", do: { act: 'play', card: "Boss's Orders" } },
        { title: 'Pick the target', say: 'Buneary has only 30 HP left. Bring it in.', do: { target: 'Buneary' } },
        { title: 'Attach an Energy', say: 'Attach the Lightning Energy to Pikachu.', do: { act: 'energy', card: 'Basic Lightning Energy', to: 'Pikachu' } },
        { title: 'Take your last Prize card', say: 'Each Knock Out lets you take a Prize card, and this is your last one. Attack with Mach Bolt.', do: { act: 'attack', atk: 'Mach Bolt' } },
      ],
      outro: 'Taking your last Prize card wins the game. Items, Supporters, Stadiums and Pokémon Tools are all Trainer cards. The player who goes first can\'t play a Supporter on their first turn.',
    },
    {
      id: 'weakness', group: 'Winning battles', title: 'Weakness', time: '1 min',
      blurb: 'Hit a Water Pokémon with Lightning and double the damage.',
      you: you([PIKACHU, E.L]), foe: rival([BUIZEL]),
      setup: {
        turn: 2, active: 0, first: 1, text: 'Tap Buizel to read its card. Near the bottom it lists Weakness: Lightning ×2.',
        players: [
          { active: { d: PIKACHU }, hand: [E.L], deck: filler(12, E.L), prizes: 6, turns: 0 },
          { active: { d: BUIZEL, dmg: 10 }, hand: [], deck: filler(12, E.W), prizes: 6, turns: 1 },
        ],
      },
      steps: [
        { title: 'Attach an Energy', say: 'Buizel has 60 HP left, and Mach Bolt only does 30. Attach the Lightning Energy to Pikachu anyway.', do: { act: 'energy', card: 'Basic Lightning Energy', to: 'Pikachu' } },
        { title: 'Attack into the Weakness', say: 'Buizel is weak to Lightning, so damage from your Lightning Pikachu is doubled: 30 becomes 60.', do: { act: 'attack', atk: 'Mach Bolt' } },
      ],
      outro: 'Weakness doubles the damage an attack does to the Active Pokémon. Resistance works the other way, usually taking 30 off. Neither applies to damage done to the Bench.',
    },
    {
      id: 'retreat', group: 'Winning battles', title: 'Retreat', time: '2 min',
      blurb: 'Pay the Retreat Cost to swap in a Pokémon that can finish the job.',
      you: you([CLAMPERL, PIKACHU, E.W, E.L]), foe: rival([AIPOM]),
      setup: {
        turn: 3, active: 0, first: 0, text: 'Clamperl\'s Shell Press only does 10 damage. Pikachu, on your Bench, is ready to attack.',
        players: [
          { active: { d: CLAMPERL, energy: [E.W, E.W] }, bench: [{ d: PIKACHU, energy: [E.L] }], hand: [], deck: filler(12, E.W), prizes: 6, turns: 1 },
          { active: { d: AIPOM, dmg: 30 }, hand: [], deck: filler(12, E.G), prizes: 6, turns: 1 },
        ],
      },
      steps: [
        { title: 'Retreat', say: 'Tap Clamperl, your Active Pokémon, and retreat it. You can retreat once each turn.', do: { act: 'retreat' } },
        { title: 'Pay the Retreat Cost', say: 'Clamperl\'s Retreat Cost is two Energy of any type. Discard both Water Energy.', do: { pick: ['Basic Water Energy', 'Basic Water Energy'] } },
        { title: 'Attack', say: 'Pikachu is now your Active Pokémon and already has its Energy. Attack with Mach Bolt.', do: { act: 'attack', atk: 'Mach Bolt' } },
      ],
      outro: 'A retreated Pokémon keeps its damage on the Bench. Switch cards do the same swap without discarding Energy, and some Pokémon retreat for free.',
    },
    {
      id: 'conditions', group: 'Winning battles', title: 'Special Conditions', time: '2 min',
      blurb: 'Poison your opponent and let Pokémon Checkup finish it.',
      you: you([SHROODLE, E.D]), foe: rival([AIPOM]),
      setup: {
        turn: 2, active: 0, first: 1, text: 'Aipom has 10 HP left.',
        players: [
          { active: { d: SHROODLE }, hand: [E.D], deck: filler(12, E.D), prizes: 6, turns: 0 },
          { active: { d: AIPOM, dmg: 50 }, hand: [], deck: filler(12, E.G), prizes: 6, turns: 1 },
        ],
      },
      steps: [
        { title: 'Attach an Energy', say: 'Attach the Darkness Energy to Shroodle.', do: { act: 'energy', card: 'Basic Darkness Energy', to: 'Shroodle' } },
        { title: 'Spit Poison', say: 'Spit Poison does no damage, but it leaves Aipom Poisoned. Between every turn, Pokémon Checkup puts 10 damage on each Poisoned Pokémon.', do: { act: 'attack', atk: 'Spit Poison' } },
      ],
      outro: 'Poison did the last 10 damage. Burned Pokémon take 20 between turns. Asleep, Paralyzed and Confused Pokémon turn sideways or upside down: they can\'t attack or retreat, and Confused ones flip a coin to attack. Evolving or retreating cures them all.',
    },
    {
      id: 'pokemon-ex', group: 'Winning battles', title: 'Pokémon ex and Prize cards', time: '1 min',
      blurb: 'Knock Out a Pokémon ex and take two Prize cards at once.',
      you: you([IRON_HANDS, E.L]), foe: rival([SQUAWK, AIPOM]),
      setup: {
        turn: 3, active: 0, first: 0, text: 'You have two Prize cards left.',
        players: [
          { active: { d: IRON_HANDS, energy: [E.L, E.L] }, hand: [E.L], deck: filler(12, E.L), prizes: 2, turns: 1 },
          { active: { d: SQUAWK }, bench: [{ d: AIPOM }], hand: [], deck: filler(12, E.G), prizes: 6, turns: 1 },
        ],
      },
      steps: [
        { title: 'Attach an Energy', say: 'Arm Press needs two Lightning Energy and one of any type. Attach the third to Iron Hands ex.', do: { act: 'energy', card: 'Basic Lightning Energy', to: 'Iron Hands ex' } },
        { title: 'Arm Press', say: 'Arm Press does 160, doubled by Squawkabilly ex\'s Lightning Weakness. Knocking out a Pokémon ex is worth two Prize cards.', do: { act: 'attack', atk: 'Arm Press' } },
      ],
      outro: 'Pokémon ex are strong but give up two Prize cards when Knocked Out, and Mega Evolution Pokémon ex give up three. That trade decides most games.',
    },
  ];

  // ctx: { nameOf(id) -> card or Pokémon name, atkName(i) -> name of your Active Pokémon's attack i }
  function matches(step, a, ctx) {
    const e = step.do;
    if (e.act) {
      if (!a || a.type !== 'act' || !a.a || a.a.k !== e.act) return false;
      if (e.card && ctx.nameOf(a.a.c) !== e.card) return false;
      if (e.to && ctx.nameOf(a.a.m) !== e.to) return false;
      if (e.atk && ctx.atkName(a.a.i) !== e.atk) return false;
      return true;
    }
    if (e.pick) {
      if (!a || a.type !== 'pick') return false;
      const got = (a.ids || []).map(ctx.nameOf).sort();
      const want = e.pick.slice().sort();
      return got.length === want.length && got.every((x, k) => x === want[k]);
    }
    if (e.target) return !!a && a.type === 'target' && ctx.nameOf(a.id) === e.target;
    if (e.yes != null) return !!a && a.type === 'yes' && !!a.yes === e.yes;
    return true;
  }
  // The answer a step stands for, given what the engine is asking (used by tests and the coach's highlights).
  function answerFor(step, req, ctx) {
    const e = step.do;
    if (e.act && req.type === 'act') {
      const o = req.options.find((x) => matches(step, { type: 'act', a: x }, ctx));
      return o ? { type: 'act', a: o } : null;
    }
    if (e.pick && req.type === 'pick') {
      const left = e.pick.slice(), ids = [];
      for (const id of req.cards) { const k = left.indexOf(ctx.nameOf(id)); if (k >= 0) { ids.push(id); left.splice(k, 1); } }
      return left.length ? null : { type: 'pick', ids };
    }
    if (e.target && req.type === 'target') { const id = req.ids.find((x) => ctx.nameOf(x) === e.target); return id != null ? { type: 'target', id } : null; }
    if (e.yes != null && req.type === 'yes') return { type: 'yes', yes: e.yes };
    return null;
  }
  const api = { LESSONS, matches, answerFor };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ARENA_TUTORIAL = api;
})(typeof self !== 'undefined' ? self : this);
