/* Plain-English meanings of Pokémon TCG terms, for the Arena and the Holo card browser.
   Each term has: id, k (its name), re (how it shows up in card text) and d (what it means). `more` marks the everyday
   game words: they're explained on request rather than listed under every card. `covers` drops a shorter term when a
   longer one that contains it is found (Mega Evolution Pokémon ex over Pokémon ex). */
(function (root) {
  const T = [
    // Special Conditions
    { id: 'asleep', k: 'Asleep', re: /\bAsleep\b/, d: "An Asleep Pokémon can't attack or retreat. Between turns its owner flips a coin: heads, it wakes up." },
    { id: 'burned', k: 'Burned', re: /\bBurned\b/, d: 'Between turns, put 2 damage counters on a Burned Pokémon, then flip a coin: heads, it is no longer Burned.' },
    { id: 'confused', k: 'Confused', re: /\bConfused\b/, d: "Before a Confused Pokémon attacks, flip a coin: tails, the attack doesn't happen and it puts 3 damage counters on itself." },
    { id: 'paralyzed', k: 'Paralyzed', re: /\bParalyzed\b/, d: "A Paralyzed Pokémon can't attack or retreat during its owner's next turn. It recovers at the end of that turn." },
    { id: 'poisoned', k: 'Poisoned', re: /\bPoisoned\b/, d: 'Between turns, put a damage counter on a Poisoned Pokémon (more if the card says so). It stays Poisoned until it leaves the Active Spot.' },
    { id: 'condition', k: 'Special Conditions', re: /\bSpecial Conditions?\b/i, d: 'Asleep, Burned, Confused, Paralyzed and Poisoned. Only an Active Pokémon can have them, and going to the Bench or evolving cures them all.' },
    // Things that change the rules for a card
    { id: 'damage-counter', k: 'Damage counters', re: /\bdamage counters?\b/i, d: "Each damage counter is 10 damage. Putting damage counters on a Pokémon isn't damage from an attack, so Weakness, Resistance and effects that reduce damage don't change how many go on." },
    { id: 'mega-ex', k: 'Mega Evolution Pokémon ex', re: /\bMega Evolution Pokémon ex\b/, covers: ['pokemon-ex'], d: 'A Pokémon ex at its most powerful. When it is Knocked Out, the opponent takes 3 Prize cards.' },
    { id: 'pokemon-ex', k: 'Pokémon ex', re: /\bPokémon ex\b/, d: 'A stronger Pokémon with a Rule Box. When it is Knocked Out, the opponent takes 2 Prize cards instead of 1.' },
    { id: 'rule-box', k: 'Rule Box', re: /\bRule Box(?:es)?\b/i, d: 'The extra rule printed on Pokémon ex and other special cards. Some effects only work on Pokémon that have one, or that don’t.' },
    { id: 'tera', k: 'Tera', re: /\bTera\b/, d: 'A Tera Pokémon on the Bench takes no damage from attacks, yours or your opponent’s. In the Active Spot it’s a normal target.' },
    { id: 'ace-spec', k: 'ACE SPEC', re: /\bACE SPEC\b/, d: 'An especially strong card. A deck can have only one ACE SPEC card in it, whatever its name.' },
    { id: 'tm', k: 'Technical Machine', re: /\bTechnical Machine\b/, d: 'A Pokémon Tool that lends its attack to the Pokémon it is attached to. That Pokémon still needs the Energy to use it, and the Tool is discarded at the end of your turn.' },
    { id: 'devolve', k: 'Devolve', re: /\bDevolve\b/i, d: 'Take the highest Stage card off an evolved Pokémon: it becomes the Pokémon it evolved from, and keeps its damage and attached cards.' },
    { id: 'ability', k: 'Ability', re: /\bAbilit(?:y|ies)\b/, d: "An effect printed on a Pokémon, apart from its attacks. Some always work; others you choose to use during your turn. Using one isn't attacking, so it doesn't end your turn." },
    { id: 'ancient', k: 'Ancient and Future', re: /\b(?:Ancient|Future) Pokémon\b/, d: 'Traits printed under some Pokémon’s names. Cards that mention Ancient or Future Pokémon work only with Pokémon that have that trait.' },
    { id: 'special-energy', k: 'Special Energy', re: /\bSpecial Energy\b/i, d: 'Energy with a rule of its own: what type and how much it provides, and anything else it does, is printed on the card. Basic Energy just provides its type.' },
    // Older rules the card browser shows
    { id: 'pokemon-v', k: 'Pokémon V', re: /\bPokémon V\b/, d: 'A stronger Pokémon from the Sword & Shield era, with a Rule Box. When it is Knocked Out, the opponent takes 2 Prize cards.' },
    { id: 'vmax', k: 'Pokémon VMAX', re: /\bVMAX\b/, covers: ['pokemon-v'], d: 'Evolves from a Pokémon V. When it is Knocked Out, the opponent takes 3 Prize cards.' },
    { id: 'vstar', k: 'VSTAR Power', re: /\bVSTAR Power\b/, d: 'A special attack or Ability on a Pokémon VSTAR. Each player can use only one VSTAR Power in a game.' },
    { id: 'gx', k: 'GX attack', re: /\bGX attacks?\b/, d: 'A powerful attack on a Pokémon-GX. Each player can use only one GX attack in a game.' },
    { id: 'pokemon-gx', k: 'Pokémon-GX', re: /\bPokémon-GX\b/, d: 'A stronger Pokémon from the Sun & Moon era, with a Rule Box. When it is Knocked Out, the opponent takes 2 Prize cards (3 for a TAG TEAM).' },
    { id: 'pokemon-ex-old', k: 'Pokémon-EX', re: /\bPokémon-EX\b/, d: 'A stronger Pokémon from the Black & White and XY eras. When it is Knocked Out, the opponent takes 2 Prize cards.' },
    { id: 'lost-zone', k: 'Lost Zone', re: /\bLost Zone\b/, d: "Cards sent to the Lost Zone are out of the game for good. Some cards count how many you have there." },
    { id: 'prism', k: 'Prism Star', re: /\bPrism Star\b/, d: 'A deck can have only one of each Prism Star card, and one that would go to the discard pile goes to the Lost Zone instead.' },
    { id: 'radiant', k: 'Radiant Pokémon', re: /\bRadiant Pokémon\b/, d: 'A deck can have only one Radiant Pokémon in it.' },
    { id: 'poke-power', k: 'Poké-Power', re: /\bPoké-Powers?\b/, d: "An older kind of Ability you choose to use. It doesn't work while the Pokémon is Asleep, Confused or Paralyzed." },
    { id: 'poke-body', k: 'Poké-Body', re: /\bPoké-Bod(?:y|ies)\b/, d: 'An older kind of Ability that is always working while the Pokémon is in play.' },
    { id: 'lock', k: "Can't play Items", re: /\bcan't play any Item cards\b/i, d: 'Until the end of that turn the player can still play Supporters, Stadiums, Energy and Pokémon, just no Item cards from their hand. Pokémon Tools are Items too.' },
    // Everyday game words, on request
    { id: 'active', k: 'Active Pokémon', re: /\bActive (?:Pokémon|Spot)\b/, more: true, d: 'The Pokémon in front. Only it attacks, and attacks hit it unless they say otherwise.' },
    { id: 'defending', k: 'Defending Pokémon', re: /\bDefending Pokémon\b/, more: true, d: "The opponent's Active Pokémon that the attack hit. If it leaves the Active Spot, effects on it end." },
    { id: 'bench', k: 'Bench', re: /\bBench(?:ed)?\b/, more: true, d: 'Up to five Pokémon waiting behind the Active Pokémon. They can evolve, take Energy and use Abilities there.' },
    { id: 'knocked-out', k: 'Knocked Out', re: /\bKnocked Out\b/i, more: true, d: 'A Pokémon with as much damage as its HP is Knocked Out: it and every card attached go to the discard pile, and the opponent takes a Prize card (2 for a Pokémon ex, 3 for a Mega Evolution Pokémon ex).' },
    { id: 'prize', k: 'Prize cards', re: /\bPrize cards?\b/i, more: true, d: 'Six cards set aside face down at the start. Take one for each Pokémon you Knock Out; take your last one to win.' },
    { id: 'discard', k: 'Discard pile', re: /\bdiscard pile\b/i, more: true, d: 'Where played Trainers, discarded cards and Knocked Out Pokémon go, face up. Some cards can bring things back from it.' },
    { id: 'evolve', k: 'Evolve', re: /\bevolv(?:e|es|ed|ing)\b/i, more: true, d: 'Put a Stage 1 card on the Basic Pokémon it evolves from, or a Stage 2 on the Stage 1. It keeps its damage and attached cards. Neither player can evolve on their first turn, or a Pokémon that came into play this turn.' },
    { id: 'retreat', k: 'Retreat', re: /\bretreat\b/i, more: true, d: 'Swap your Active Pokémon with a Benched one by discarding Energy equal to its Retreat Cost. Once a turn.' },
    { id: 'switch', k: 'Switch', re: /\bswitch\b/i, more: true, d: "Swap your Active Pokémon with one of your Benched Pokémon. It isn't retreating, so no Energy is discarded." },
    { id: 'weakness', k: 'Weakness and Resistance', re: /\b(?:Weakness|Resistance)\b/, more: true, d: "Weakness: an attack from a Pokémon of that type does double damage to it. Resistance: that type's attacks do that much less. Only the Active Pokémon has them in play." },
    { id: 'supporter', k: 'Supporter', re: /\bSupporter\b/, more: true, d: "A Trainer card you can play only one of each turn. The player who goes first can't play one on their first turn." },
    { id: 'item', k: 'Item', re: /\bItems?\b/, more: true, d: 'A Trainer card you can play as many of as you like during your turn.' },
    { id: 'tool', k: 'Pokémon Tool', re: /\bPokémon Tools?\b/, more: true, d: 'An Item you attach to one of your Pokémon. It stays attached and keeps working; each Pokémon can have only one.' },
    { id: 'stadium', k: 'Stadium', re: /\bStadium\b/, more: true, d: 'A Trainer card that stays in play and affects both players. Only one can be in play: a new one sends the old one to the discard pile.' },
    { id: 'heal', k: 'Heal', re: /\bheal(?:s|ed)?\b/i, more: true, d: 'Remove that much damage (that many damage counters) from the Pokémon.' },
    { id: 'search', k: 'Search your deck', re: /\bsearch (?:your|their) deck\b/i, more: true, d: 'Look through the deck for the cards it describes and take them. You can choose to find nothing. Then shuffle the deck.' },
  ];
  const byId = new Map(T.map((t) => [t.id, t]));
  const global = (re) => new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`);
  // Terms in a card's text, plus terms it has by its kind (ids), in the order they appear; the card's own name doesn't count
  function find(text, extra, names) {
    let src = String(text || '');
    for (const n of [].concat(names || [])) if (n) src = src.split(n).join(' ');
    const hits = [];
    for (const t of T) {
      const m = global(t.re).exec(src);
      if (m) hits.push({ t, at: m.index });
    }
    for (const id of extra || []) { const t = byId.get(id); if (t && !hits.some((h) => h.t === t)) hits.push({ t, at: -1 }); }
    const covered = new Set(hits.filter((h) => h.at >= 0).flatMap((h) => h.t.covers || []));
    return hits.filter((h) => !covered.has(h.t.id)).sort((a, b) => a.at - b.at).map((h) => h.t);
  }
  // Escaped text with the first appearance of each found term wrapped in a button; `used` carries over between the
  // blocks of one card so each term is marked once
  function mark(html, found, used) {
    let out = html;
    for (const t of found) {
      if (used.has(t.id)) continue;
      let done = false;
      out = out.replace(global(t.re), (m, ...rest) => {
        const at = rest[rest.length - 2], whole = rest[rest.length - 1];
        if (done || /<[^>]*$/.test(whole.slice(0, at))) return m;
        done = true;
        return `<button type="button" class="kwt" data-gl="${t.id}">${m}</button>`;
      });
      if (done) used.add(t.id);
    }
    return out;
  }
  root.Gloss = { terms: T, byId, find, mark };
  if (typeof module === 'object' && module.exports) module.exports = root.Gloss;
})(typeof self !== 'undefined' ? self : this);
