// Holo Arena: turns printed card text into effects the rules engine can run.
// A card is playable only when every sentence on it is understood; anything else stays out of the pool.
// The same file runs in the page and in Node (tests and the build script).
(function (root, factory) {
  const lib = factory();
  if (typeof module === 'object' && module.exports) module.exports = lib;
  else root.ARENA_COMPILE = lib;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const TYPES = { G: 'Grass', R: 'Fire', W: 'Water', L: 'Lightning', P: 'Psychic', F: 'Fighting', D: 'Darkness', M: 'Metal', Y: 'Fairy', N: 'Dragon', C: 'Colorless' };
  const TYPE_OF = { grass: 'G', fire: 'R', water: 'W', lightning: 'L', psychic: 'P', fighting: 'F', darkness: 'D', metal: 'M', fairy: 'Y', dragon: 'N', colorless: 'C' };
  const WORD = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
  const n = (s) => (s == null || s === '' ? 1 : WORD[s] != null ? WORD[s] : +s);
  const N = '(\\d+|an?|one|two|three|four|five|six|seven|eight)';
  const T = '(grass|fire|water|lightning|psychic|fighting|darkness|metal|fairy|dragon|colorless)';
  const C = '(asleep|burned|confused|paralyzed|poisoned)';
  const COND = { asleep: 'asleep', burned: 'burned', confused: 'confused', paralyzed: 'paralyzed', poisoned: 'poisoned' };
  const R = (s) => new RegExp('^' + s + '$');

  function clean(text) {
    return String(text || '')
      .replace(/Pokémon/g, 'Pokemon').replace(/[’‘]/g, "'").replace(/[“”]/g, '"').replace(/\.(?=[A-Z])/g, '. ').replace(/\s+/g, ' ').trim();
  }
  // Split into sentences, keeping parenthesised reminders whole.
  function sentences(text) {
    const out = [];
    let cur = '', depth = 0;
    const s = clean(text);
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      cur += ch;
      if (ch === '(') depth++;
      else if (ch === ')') { depth = Math.max(0, depth - 1); if (!depth && /^\s*\(/.test(cur) && /[.!]\)$/.test(cur.trim())) { out.push(cur.trim()); cur = ''; } }
      else if ((ch === '.' || ch === '!') && !depth && (i + 1 >= s.length || s[i + 1] === ' ')) { out.push(cur.trim()); cur = ''; }
    }
    if (cur.trim()) out.push(cur.trim());
    return out.map((x) => x.toLowerCase().replace(/[.!]$/, '').replace(/^\((.*?)[.!]?\)$/, '($1)'));
  }

  /* ---------- One sentence of effect text ---------- */
  // Each rule: [regex, (match) => effect | [effects] | 'skip']
  const RULES = [
    // reminders and filler
    [R("\\(don't apply weakness and resistance for benched pokemon\\)"), () => 'skip'],
    [R("\\(your opponent chooses the new active pokemon\\)"), () => 'skip'],
    [R('then,? shuffle your deck'), () => 'skip'],
    [R('shuffle your deck( afterward)?'), () => 'skip'],
    [R('your opponent reveals their hand'), () => 'skip'],
    [R("\\(this attack's damage isn't affected by weakness or resistance\\)"), () => ({ k: 'noWR' })],
    [R("\\(you can't use more than 1 .+ ability each turn\\)"), () => 'skip'],
    [R("you can't use more than 1 .+ ability each turn"), () => 'skip'],

    // special conditions
    [R(`your opponent's active pokemon is now ${C}(?:,? and ${C})?(?: and ${C})?`), (m) => ({ k: 'cond', who: 'opp', c: [m[1], m[2], m[3]].filter(Boolean).map((x) => COND[x]) })],
    [R(`the defending pokemon is now ${C}(?: and ${C})?`), (m) => ({ k: 'cond', who: 'opp', c: [m[1], m[2]].filter(Boolean).map((x) => COND[x]) })],
    [R(`this pokemon is now ${C}(?: and ${C})?`), (m) => ({ k: 'cond', who: 'self', c: [m[1], m[2]].filter(Boolean).map((x) => COND[x]) })],
    [R(`during pokemon checkup, put ${N} damage counters on that pokemon instead of 1`), (m) => ({ k: 'poisonN', n: n(m[1]) })],
    [R(`put ${N} damage counters instead of 1 on that pokemon during pokemon checkup`), (m) => ({ k: 'poisonN', n: n(m[1]) })],

    // signature attacks
    [R(`this pokemon recovers from all special conditions`), () => ({ k: 'cureSelf' })],
    [R(`if your opponent's pokemon is knocked out by damage from this attack, take ${N} more prize cards?`), (m) => ({ k: 'extraPrize', n: n(m[1]) })],
    [R(`discard any number of basic energy cards from your hand`), () => ({ k: 'fuel', from: 'hand', basic: true, max: 99 })],
    [R(`discard any amount of ${T} energy from among your pokemon, and this attack does (\\d+) damage for each card you discarded in this way`), (m) => [{ k: 'fuel', from: 'all', type: TYPE_OF[m[1]], max: 99 }, { k: 'perFuel', n: +m[2] }]],
    [R(`discard ${N} energy from this pokemon, and this attack does (\\d+) damage to ${N} of your opponent's pokemon`), (m) => [{ k: 'snipe', n: +m[2] }, { k: 'discardSelfEnergy', n: n(m[1]) }]],
    [R(`you may discard all energy from this pokemon and have this attack do (\\d+) more damage`), (m) => ({ k: 'allIn', n: +m[1] })],
    [R(`for each of your benched pokemon, search your deck for a basic ${T} energy card and attach it to that pokemon`), (m) => ({ k: 'attachEachBench', type: TYPE_OF[m[1]] })],
    [R(`if your opponent's active pokemon has exactly ${N} damage counters on it, that pokemon is knocked out`), (m) => ({ k: 'koIfCounters', n: n(m[1]) })],
    [R(`your opponent reveals their hand, and you discard a card you find there`), () => ({ k: 'discardFromOppHand', n: 1 })],
    [R(`put up to ${N} (.+?) from your discard pile onto your bench`), (m) => ({ k: 'reviveName', n: n(m[1]), name: m[2] })],
    [R(`if you go second, you can't use this attack during your first turn`), () => ({ k: 'notFirst' })],
    [R(`during your opponent's next turn, prevent all damage done to this pokemon by attacks from basic non-colorless pokemon`), () => ({ k: 'protect', from: 'basicNonC' })],

    // flat extras (mostly after a coin flip)
    [R(`this attack does (\\d+) more damage`), (m) => ({ k: 'plus', n: +m[1] })],
    [R(`this attack does (\\d+) more damage, and heal (\\d+) damage from this pokemon`), (m) => [{ k: 'plus', n: +m[1] }, { k: 'heal', n: +m[2], who: 'self' }]],
    [R(`both active pokemon are now ${C}`), (m) => [{ k: 'cond', who: 'opp', c: [COND[m[1]]] }, { k: 'cond', who: 'self', c: [COND[m[1]]] }]],
    [R(`heal (\\d+) damage from it`), (m) => ({ k: 'heal', n: +m[1], who: 'self' })],
    [R(`knock out your opponent's active pokemon`), () => ({ k: 'ko' })],
    [R(`if your opponent's active pokemon is knocked out in this way, this pokemon does (\\d+) damage to itself`), (m) => ({ k: 'selfDmg', n: +m[1], ifKo: true })],
    [R(`you may discard any amount of (basic )?(?:${T} )?energy from (your pokemon|this pokemon)`), (m) => ({ k: 'fuel', from: m[3] === 'this pokemon' ? 'self' : 'all', type: m[2] ? TYPE_OF[m[2]] : null, basic: !!m[1], max: 99 })],
    [R(`you may discard up to ${N} (?:${T} )?energy from this pokemon`), (m) => ({ k: 'fuel', from: 'self', type: m[2] ? TYPE_OF[m[2]] : null, max: n(m[1]) })],
    [R(`this attack does (\\d+) (more )?damage for each (?:energy )?card you discarded in this way`), (m) => ({ k: 'perFuel', n: +m[1], more: !!m[2] })],
    [R(`you may discard ${N} energy from this pokemon to have this attack do (\\d+) more damage`), (m) => [{ k: 'fuel', from: 'self', max: n(m[1]), exact: n(m[1]) }, { k: 'perFuel', n: +m[2], all: true, more: true }]],
    [R(`put (an?|${N}) energy attached to this pokemon into your hand`), (m) => ({ k: 'returnEnergy', n: m[2] ? n(m[2]) : 1 })],
    [R(`discard your hand and draw ${N} cards`), (m) => [{ k: 'discardHand' }, { k: 'draw', n: n(m[1]) }]],
    [R(`your opponent discards ${N} cards? from their hand`), (m) => ({ k: 'oppDiscards', n: n(m[1]) })],
    [R(`during your next turn, the defending pokemon takes (\\d+) more damage from attacks(?: \\(after applying weakness and resistance\\))?`), (m) => ({ k: 'vulnerable', n: +m[1] })],
    [R(`search your deck for (?:an?|up to ${N}) (item|supporter|stadium|pokemon tool) cards?, reveal (?:it|them), and put (?:it|them) into your hand`), (m) => ({ k: 'cardSearch', what: Array(m[1] ? n(m[1]) : 1).fill(m[2] === 'pokemon tool' ? 'tool' : m[2]) })],
    [R(`(?:you may )?search your deck for up to ${N} cards and put them into your hand`), (m) => ({ k: 'tutor', n: n(m[1]) })],
    [R(`put (?:a|an|up to ${N}) (supporter|item) cards? from your discard pile into your hand`), (m) => ({ k: 'recover', n: m[1] ? n(m[1]) : 1, what: m[2] })],

    // damage that scales
    [R(`this attack does (\\d+) (more|less)? ?damage for each (?:${T} )?energy attached to (this pokemon|your opponent's active pokemon|all of your pokemon)`),
      (m) => ({ k: 'scale', n: +m[1], how: m[2] || 'times', per: m[4] === 'this pokemon' ? 'selfEnergy' : m[4] === 'all of your pokemon' ? 'myEnergy' : 'oppEnergy', type: m[3] ? TYPE_OF[m[3]] : null })],
    [R(`this attack does (\\d+) (more|less)? ?damage for each damage counter on (this pokemon|your opponent's active pokemon|all of your pokemon)`),
      (m) => ({ k: 'scale', n: +m[1], how: m[2] || 'times', per: m[3] === 'this pokemon' ? 'selfCounters' : m[3] === 'all of your pokemon' ? 'myCounters' : 'oppCounters' })],
    [R("this attack does (\\d+) (more )?damage for each of your benched pokemon"), (m) => ({ k: 'scale', n: +m[1], how: m[2] ? 'more' : 'times', per: 'myBench' })],
    [R("this attack does (\\d+) (more )?damage for each of your opponent's benched pokemon"), (m) => ({ k: 'scale', n: +m[1], how: m[2] ? 'more' : 'times', per: 'oppBench' })],
    [R("this attack does (\\d+) (more )?damage for each benched pokemon \\(both yours and your opponent's\\)"), (m) => ({ k: 'scale', n: +m[1], how: m[2] ? 'more' : 'times', per: 'allBench' })],
    [R("this attack does (\\d+) (more )?damage for each of your pokemon in play"), (m) => ({ k: 'scale', n: +m[1], how: m[2] ? 'more' : 'times', per: 'myInPlay' })],
    [R("this attack does (\\d+) (more )?damage for each prize card your opponent has taken"), (m) => ({ k: 'scale', n: +m[1], how: m[2] ? 'more' : 'times', per: 'oppTaken' })],
    [R("this attack does (\\d+) (more )?damage for each prize card you have taken"), (m) => ({ k: 'scale', n: +m[1], how: m[2] ? 'more' : 'times', per: 'myTaken' })],
    [R("this attack does (\\d+) (more )?damage for each card in your opponent's hand"), (m) => ({ k: 'scale', n: +m[1], how: m[2] ? 'more' : 'times', per: 'oppHand' })],
    [R("this attack does (\\d+) (more )?damage for each card in your hand"), (m) => ({ k: 'scale', n: +m[1], how: m[2] ? 'more' : 'times', per: 'myHand' })],
    [R(`this attack does (\\d+) (more )?damage for each energy attached to all of your opponent's pokemon`), (m) => ({ k: 'scale', n: +m[1], how: m[2] ? 'more' : 'times', per: 'oppAllEnergy' })],
    [R(`this attack does (\\d+) (more )?damage for each energy attached to both active pokemon`), (m) => ({ k: 'scale', n: +m[1], how: m[2] ? 'more' : 'times', per: 'bothActiveEnergy' })],
    [R(`this attack does (\\d+) (more )?damage for each colorless in your opponent's active pokemon's retreat cost`), (m) => ({ k: 'scale', n: +m[1], how: m[2] ? 'more' : 'times', per: 'oppRetreat' })],
    [R(`this attack does (\\d+) (more )?damage for each (?:energy )?card you discarded in this way`), (m) => ({ k: 'perFuel', n: +m[1], more: !!m[2] })],
    [R(`this attack does (\\d+) (more )?damage for each (?:${T} )?energy attached to your opponent's active pokemon`), (m) => ({ k: 'scale', n: +m[1], how: m[2] ? 'more' : 'times', per: 'oppEnergy', type: m[3] ? TYPE_OF[m[3]] : null })],
    [R("this attack does (\\d+) (more )?damage for each energy card in your discard pile"), (m) => ({ k: 'scale', n: +m[1], how: m[2] ? 'more' : 'times', per: 'myDiscardEnergy' })],
    [R("this attack does (\\d+) (more )?damage for each pokemon in your discard pile"), (m) => ({ k: 'scale', n: +m[1], how: m[2] ? 'more' : 'times', per: 'myDiscardPokemon' })],
    [R("this attack does (\\d+) (more )?damage for each heads"), (m) => ({ k: 'perHeads', n: +m[1], more: !!m[2] })],

    // damage that depends on the situation
    [R("if your opponent's active pokemon already has any damage counters on it, this attack does (\\d+) more damage"), (m) => ({ k: 'bonus', n: +m[1], when: 'oppDamaged' })],
    [R("if this pokemon has any damage counters on it, this attack does (\\d+) more damage"), (m) => ({ k: 'bonus', n: +m[1], when: 'selfDamaged' })],
    [R("if your opponent's active pokemon is a pokemon ex(?: or pokemon v)?, this attack does (\\d+) more damage"), (m) => ({ k: 'bonus', n: +m[1], when: 'oppEx' })],
    [R("if your opponent's active pokemon is a mega evolution pokemon ex, this attack does (\\d+) more damage"), (m) => ({ k: 'bonus', n: +m[1], when: 'oppMega' })],
    [R("if your opponent's active pokemon is an evolution pokemon, this attack does (\\d+) more damage"), (m) => ({ k: 'bonus', n: +m[1], when: 'oppEvolved' })],
    [R("if your opponent's active pokemon is a basic pokemon, this attack does (\\d+) more damage"), (m) => ({ k: 'bonus', n: +m[1], when: 'oppBasic' })],
    [R(`if your opponent's active pokemon is ${C}, this attack does (\\d+) more damage`), (m) => ({ k: 'bonus', n: +m[2], when: 'oppCond', c: COND[m[1]] })],
    [R("if your opponent's active pokemon is affected by a special condition, this attack does (\\d+) more damage"), (m) => ({ k: 'bonus', n: +m[1], when: 'oppAnyCond' })],
    [R("if any of your pokemon were knocked out by damage from an attack during your opponent's last turn, this attack does (\\d+) more damage"), (m) => ({ k: 'bonus', n: +m[1], when: 'revenge' })],
    [R("if you have more prize cards remaining than your opponent, this attack does (\\d+) more damage"), (m) => ({ k: 'bonus', n: +m[1], when: 'behind' })],
    [R(`if your opponent has ${N} or fewer prize cards remaining, this attack does (\\d+) more damage`), (m) => ({ k: 'bonus', n: +m[2], when: 'oppPrizesLE', v: n(m[1]) })],
    [R(`if you have ${N} or fewer prize cards remaining, this attack does (\\d+) more damage`), (m) => ({ k: 'bonus', n: +m[2], when: 'myPrizesLE', v: n(m[1]) })],
    [R(`if this pokemon has ${N} or more energy attached(?: to it)?, this attack does (\\d+) more damage`), (m) => ({ k: 'bonus', n: +m[2], when: 'selfEnergyGE', v: n(m[1]) })],
    [R(`if this pokemon has (?:at least )?${N} extra energy attached(?: to it)?(?: \\(in addition to this attack's cost\\))?, this attack does (\\d+) more damage`), (m) => ({ k: 'bonus', n: +m[2], when: 'extraEnergy', v: n(m[1]) })],
    [R(`if your opponent's active pokemon has an ability, this attack does (\\d+) more damage`), (m) => ({ k: 'bonus', n: +m[1], when: 'oppAbility' })],
    [R(`if you played a supporter card from your hand during this turn, this attack does (\\d+) more damage`), (m) => ({ k: 'bonus', n: +m[1], when: 'playedSupporter' })],
    [R(`if there is (?:any )?stadium in play, this attack does (\\d+) more damage`), (m) => ({ k: 'bonus', n: +m[1], when: 'stadium' })],
    [R(`if this pokemon evolved from .+ during this turn, this attack does (\\d+) more damage`), (m) => ({ k: 'bonus', n: +m[1], when: 'evolvedThisTurn' })],
    [R("this attack's damage isn't affected by weakness or resistance"), () => ({ k: 'noWR' })],
    [R("this attack's damage isn't affected by weakness or resistance, or by any effects on your opponent's active pokemon"), () => [{ k: 'noWR' }, { k: 'pierce' }]],
    [R(`if your benched pokemon have any damage counters on them, this attack does (\\d+) more damage`), (m) => ({ k: 'bonus', n: +m[1], when: 'myBenchDamaged' })],
    [R(`if you have a stadium in play, this attack does (\\d+) more damage`), (m) => ({ k: 'bonus', n: +m[1], when: 'stadium' })],
    [R(`if this pokemon has a pokemon tool attached, this attack does (\\d+) more damage`), (m) => ({ k: 'bonus', n: +m[1], when: 'selfTool' })],
    [R(`if you have more cards in your hand than your opponent, this attack does (\\d+) more damage`), (m) => ({ k: 'bonus', n: +m[1], when: 'moreCards' })],
    [R(`if your opponent has ${N} or fewer cards in their hand, this attack does (\\d+) more damage`), (m) => ({ k: 'bonus', n: +m[2], when: 'oppHandLE', v: n(m[1]) })],
    [R("this attack's damage isn't affected by resistance"), () => ({ k: 'noRes' })],
    [R("this attack's damage isn't affected by any effects on your opponent's active pokemon"), () => ({ k: 'pierce' })],
    [R("this attack's damage isn't affected by weakness, resistance, or any other effects on your opponent's active pokemon"), () => [{ k: 'noWR' }, { k: 'pierce' }]],

    // the attacker itself
    [R(`this pokemon (?:also )?does (\\d+) damage to itself`), (m) => ({ k: 'selfDmg', n: +m[1] })],
    [R(`heal (\\d+) damage from this pokemon`), (m) => ({ k: 'heal', n: +m[1], who: 'self' })],
    [R(`heal from this pokemon the same amount of damage you did to your opponent's active pokemon`), () => ({ k: 'drain' })],
    [R(`heal (\\d+) damage from each of your pokemon`), (m) => ({ k: 'heal', n: +m[1], who: 'all' })],
    [R(`heal (\\d+) damage from ${N} of your (benched )?pokemon`), (m) => ({ k: 'heal', n: +m[1], who: m[3] ? 'bench' : 'any' })],
    [R(`discard (an|a|${N}|all) (?:${T} )?energy from this pokemon`), (m) => ({ k: 'discardSelfEnergy', n: m[1] === 'all' ? 'all' : n(m[1]), type: m[3] ? TYPE_OF[m[3]] : null })],
    [R(`discard (an|a|${N}|all) (?:${T} )?energy cards? from this pokemon`), (m) => ({ k: 'discardSelfEnergy', n: m[1] === 'all' ? 'all' : n(m[1]), type: m[3] ? TYPE_OF[m[3]] : null })],
    [R(`during your next turn, this pokemon can't (?:attack|use attacks)`), () => ({ k: 'lockSelf' })],
    [R(`during your next turn, this pokemon can't use (.+)`), (m) => ({ k: 'lockSelf', atk: m[1] })],
    [R(`during your opponent's next turn, this pokemon takes (\\d+) less damage from attacks(?: \\(after applying weakness and resistance\\))?`), (m) => ({ k: 'shield', n: +m[1] })],
    [R(`during your opponent's next turn, prevent all damage done to this pokemon by attacks from basic pokemon`), () => ({ k: 'protect', from: 'basic' })],
    [R(`during your opponent's next turn, prevent all damage done to this pokemon by attacks from pokemon ex`), () => ({ k: 'protect', from: 'ex' })],
    [R(`during your opponent's next turn, prevent all damage from and effects of attacks done to this pokemon`), () => ({ k: 'protect', fx: true })],
    [R(`during your opponent's next turn, prevent all damage done to this pokemon by attacks`), () => ({ k: 'protect' })],
    [R(`(you may )?switch this pokemon with ${N} of your benched pokemon`), (m) => ({ k: 'switchSelf', may: !!m[1] })],
    [R(`move (an|${N}|all) energy from this pokemon to ${N} of your benched pokemon`), (m) => ({ k: 'moveEnergy', n: m[1] === 'all' ? 'all' : n(m[1]) })],
    [R(`attach (an?|up to ${N}) basic (?:${T} )?energy cards? from your discard pile to (this pokemon|${N} of your (?:benched )?pokemon|your (?:benched )?pokemon in any way you like)`),
      (m) => ({ k: 'attachDiscard', n: m[2] ? n(m[2]) : 1, type: m[3] ? TYPE_OF[m[3]] : null, to: m[4] === 'this pokemon' ? 'self' : /benched/.test(m[4]) ? 'bench' : 'any' })],
    [R(`search your deck for (an?|up to ${N}) basic (?:${T} )?energy cards? and attach (?:it|them) to (this pokemon|${N} of your (?:benched )?pokemon|your (?:benched )?pokemon in any way you like)`),
      (m) => ({ k: 'attachDeck', n: m[2] ? n(m[2]) : 1, type: m[3] ? TYPE_OF[m[3]] : null, to: m[4] === 'this pokemon' ? 'self' : /benched/.test(m[4]) ? 'bench' : 'any' })],

    // the defending Pokemon
    [R(`during your opponent's next turn, the defending pokemon can't retreat`), () => ({ k: 'noRetreat' })],
    [R(`during your opponent's next turn, that pokemon can't retreat`), () => ({ k: 'noRetreat' })],
    [R(`during your opponent's next turn, the defending pokemon can't (?:attack|use attacks)`), () => ({ k: 'noAttack' })],
    [R(`during your opponent's next turn, the defending pokemon's attacks do (\\d+) less damage(?: \\(before applying weakness and resistance\\))?`), (m) => ({ k: 'weaken', n: +m[1] })],
    [R(`during your opponent's next turn, attacks used by the defending pokemon do (\\d+) less damage(?: \\(before applying weakness and resistance\\))?`), (m) => ({ k: 'weaken', n: +m[1] })],
    [R(`discard (an|a|${N}) energy from your opponent's active pokemon`), (m) => ({ k: 'strip', n: n(m[1]) })],
    [R(`discard all energy from your opponent's active pokemon`), () => ({ k: 'strip', n: 'all' })],
    [R(`discard the top (?:card|(\\d+) cards) of your opponent's deck`), (m) => ({ k: 'millOpp', n: m[1] ? +m[1] : 1 })],
    [R(`discard the top (?:card|(\\d+) cards) of your deck`), (m) => ({ k: 'millSelf', n: m[1] ? +m[1] : 1 })],
    [R(`discard a random card from your opponent's hand`), () => ({ k: 'discardRandom', n: 1 })],
    [R(`before doing damage, discard all pokemon tools from your opponent's active pokemon`), () => ({ k: 'toolsOff' })],
    [R(`(?:you may )?discard a stadium in play`), () => ({ k: 'discardStadium' })],
    [R(`switch out your opponent's active pokemon to the bench`), () => ({ k: 'switchOutOpp' })],
    [R(`switch in ${N} of your opponent's benched pokemon to the active spot`), () => ({ k: 'gust' })],
    [R(`this attack does (\\d+) damage to the new active pokemon`), (m) => ({ k: 'hitNew', n: +m[1] })],
    [R(`your opponent shuffles their active pokemon and all attached cards into their deck`), () => ({ k: 'shuffleOppActive' })],

    // more targets than the Active
    [R(`this attack (?:also )?does (\\d+) damage to (each of|${N} of) your opponent's benched pokemon`), (m) => ({ k: 'bench', n: +m[1], count: m[2] === 'each of' ? 'all' : n(m[3]), side: 'opp' })],
    [R(`this attack (?:also )?does (\\d+) damage to (each of|${N} of) your benched pokemon`), (m) => ({ k: 'bench', n: +m[1], count: m[2] === 'each of' ? 'all' : n(m[3]), side: 'own' })],
    [R(`this attack (?:also )?does (\\d+) damage to each benched pokemon \\(both yours and your opponent's\\)`), (m) => [{ k: 'bench', n: +m[1], count: 'all', side: 'opp' }, { k: 'bench', n: +m[1], count: 'all', side: 'own' }]],
    [R(`this attack does (\\d+) damage to ${N} of your opponent's pokemon`), (m) => ({ k: 'snipe', n: +m[1], count: n(m[2]) })],
    [R(`this attack does (\\d+) damage to each of your opponent's pokemon`), (m) => ({ k: 'spread', n: +m[1] })],
    [R(`put (\\d+|an?) damage counters? on (each of|${N} of) your opponent's (benched )?pokemon`), (m) => ({ k: 'counters', n: n(m[1]), count: m[2] === 'each of' ? 'all' : n(m[3]), bench: !!m[4] })],
    [R(`put (\\d+) damage counters on your opponent's (benched )?pokemon in any way you like`), (m) => ({ k: 'countersSpread', n: +m[1], bench: !!m[2] })],
    [R(`put (\\d+|an?) damage counters? on your opponent's active pokemon`), (m) => ({ k: 'counters', n: n(m[1]), count: 1, active: true })],

    // cards
    [R(`draw (?:a card|${N} cards?)`), (m) => ({ k: 'draw', n: m[1] ? n(m[1]) : 1 })],
    [R(`(?:you may )?draw cards until you have (\\d+) cards in your hand`), (m) => ({ k: 'drawTo', n: +m[1] })],
    [R(`search your deck for (an?|up to ${N}) basic pokemon and put (?:it|them) onto your bench`), (m) => ({ k: 'benchSearch', n: m[2] ? n(m[2]) : 1 })],
    [R(`search your deck for (an?|up to ${N}) basic ${T} pokemon and put (?:it|them) onto your bench`), (m) => ({ k: 'benchSearch', n: m[2] ? n(m[2]) : 1, type: TYPE_OF[m[3]] })],
    [R(`search your deck for (an?|up to ${N}) (basic )?(?:${T} )?energy cards?(?:, reveal (?:it|them),)? and put (?:it|them) into your hand`), (m) => ({ k: 'energySearch', n: m[2] ? n(m[2]) : 1, type: m[4] ? TYPE_OF[m[4]] : null })],
    [R(`search your deck for (an?|up to ${N}) pokemon, reveal (?:it|them), and put (?:it|them) into your hand`), (m) => ({ k: 'pokeSearch', n: m[2] ? n(m[2]) : 1 })],
    [R(`search your deck for (an?|up to ${N}) cards?(?: and put (?:it|them) into your hand)?`), (m) => ({ k: 'tutor', n: m[2] ? n(m[2]) : 1 })],
    [R(`search your deck for a card that evolves from this pokemon and put it onto this pokemon to evolve it`), () => ({ k: 'evolveSelf' })],
    [R(`put (an?|up to ${N}) (?:basic )?(?:${T} )?energy cards? from your discard pile into your hand`), (m) => ({ k: 'recoverEnergy', n: m[2] ? n(m[2]) : 1, type: m[3] ? TYPE_OF[m[3]] : null })],
    [R(`shuffle your hand into your deck`), () => ({ k: 'shuffleHand' })],
  ];

  function parseSentence(s) {
    for (const [re, f] of RULES) {
      const m = re.exec(s);
      if (m) return f(m);
    }
    return null;
  }

  // Coin flips join the sentences that follow them into one effect.
  function parseEffectText(text, fail) {
    const ss = sentences(text);
    const fx = [];
    for (let i = 0; i < ss.length; i++) {
      const s = ss[i];
      let m;
      if ((m = /^flip (a coin|(\d+|two|three|four|five|six) coins)( until you get tails)?$/.exec(s))) {
        const coins = m[3] ? 'tails' : m[2] ? n(m[2]) : 1;
        const next = ss[i + 1] || '';
        let mm;
        if ((mm = /^this attack does (\d+) (more )?damage for each heads$/.exec(next))) {
          fx.push({ k: 'coins', coins, n: +mm[1], more: !!mm[2] });
          i++;
          continue;
        }
        if (coins === 1) {
          const flip = { k: 'flip', heads: [], tails: [] };
          let used = 0;
          for (let j = i + 1; j < ss.length && used < 2; j++) {
            const h = /^if (heads|tails), (.+)$/.exec(ss[j]);
            if (!h) break;
            let sub;
            if (h[2] === 'this attack does nothing') sub = { k: 'nothing' };
            else if ((sub = parseSentence(h[2])) === null || sub === 'skip') { fail(ss[j]); sub = null; }
            if (sub) flip[h[1]].push(...[].concat(sub));
            used++;
          }
          if (!used) { fail(s + ' / ' + next); continue; }
          // "If heads, ... Then, ..." continuations are rare; anything after is parsed normally.
          fx.push(flip);
          i += used;
          continue;
        }
        if ((mm = /^if (all|both) of them are heads, (.+)$/.exec(next)) || (mm = /^if either of them is tails, (this attack does nothing)$/.exec(next))) {
          if (mm.length === 3) {
            const sub = mm[2] === 'this attack does nothing' ? { k: 'nothing' } : parseSentence(mm[2]);
            if (!sub || sub === 'skip') { fail(next); i++; continue; }
            fx.push({ k: 'flipAll', coins, fx: [].concat(sub) });
          } else fx.push({ k: 'flipAny', coins, fx: [{ k: 'nothing' }] });
          i++;
          continue;
        }
        fail(s + ' / ' + next);
        i++;
        continue;
      }
      if (/^(?:you may )?discard a stadium in play$/.test(s) && /^if you do, this attack does (\d+) more damage$/.test(ss[i + 1] || '')) {
        fx.push({ k: 'stadiumBonus', n: +/(\d+)/.exec(ss[i + 1])[1] });
        i++;
        continue;
      }
      const e = parseSentence(s);
      if (e === null) { fail(s); continue; }
      if (e !== 'skip') fx.push(...[].concat(e));
    }
    return fx;
  }

  /* ---------- Abilities ---------- */
  const ABILITY_RULES = [
    [R(`this pokemon takes (\\d+) less damage from attacks(?: from your opponent's pokemon)?(?: \\(after applying weakness and resistance\\))?`), (m) => ({ k: 'shield', n: +m[1] })],
    [R(`as long as this pokemon is on your bench, prevent all damage from and effects of attacks from your opponent's pokemon done to this pokemon`), () => ({ k: 'benchShield' })],
    [R(`prevent all damage done to this pokemon by attacks from your opponent's pokemon ex(?: and pokemon v)?`), () => ({ k: 'exShield' })],
    [R(`if this pokemon has no energy attached, it has no retreat cost`), () => ({ k: 'freeRetreat' })],
    [R(`this pokemon has no retreat cost`), () => ({ k: 'freeRetreat', always: true })],
    [R(`if this pokemon is in the active spot and is damaged by an attack from your opponent's pokemon \\(even if this pokemon is knocked out\\), (?:put|place) (\\d+) damage counters on the attacking pokemon`), (m) => ({ k: 'retaliate', n: +m[1] })],
    [R(`as long as this pokemon is in the active spot, attacks used by your opponent's active pokemon do (\\d+) less damage(?: \\(before applying weakness and resistance\\))?`), (m) => ({ k: 'aura', n: +m[1] })],
    [R(`prevent all effects of attacks used by your opponent's pokemon done to this pokemon\\. \\(damage is not an effect\\.?\\)`), () => ({ k: 'noEffects' })],
    [R(`prevent all effects of attacks used by your opponent's pokemon done to this pokemon`), () => ({ k: 'noEffects' })],
    [R(`this pokemon can't be affected by any special conditions`), () => ({ k: 'noEffects', conds: true })],
    [R(`if this pokemon has full hp and would be knocked out by damage from an attack, it is not knocked out, and its remaining hp becomes (\\d+)`), (m) => ({ k: 'sturdy', hp: +m[1] })],
    [R(`once during your turn, you may draw (?:a card|${N} cards)`), (m) => ({ k: 'once', fx: [{ k: 'draw', n: m[1] ? n(m[1]) : 1 }] })],
    [R(`once during your turn, you may draw a card\\. if this pokemon is in the active spot, draw 1 more card`), () => ({ k: 'once', fx: [{ k: 'draw', n: 1, activeBonus: 1 }] })],
    [R(`you must discard a card from your hand in order to use this ability\\. once during your turn, you may draw (?:a card|${N} cards)`), (m) => ({ k: 'once', cost: 'discard', fx: [{ k: 'draw', n: m[1] ? n(m[1]) : 1 }] })],
    [R(`once during your turn, you may search your deck for a card and put it into your hand\\. (?:then, shuffle your deck\\. )?you can't use more than 1 .+ ability each turn`), () => ({ k: 'once', fx: [{ k: 'tutor', n: 1 }], unique: true })],
    [R(`once during your turn, you may search your deck for a card and put it into your hand\\. then, shuffle your deck`), () => ({ k: 'once', fx: [{ k: 'tutor', n: 1 }] })],
    [R(`once during your turn, you may search your deck for (?:a|up to ${N}) basic ${T} pokemon and put (?:it|them) onto your bench\\. then, shuffle your deck`), (m) => ({ k: 'once', fx: [{ k: 'benchSearch', n: m[1] ? n(m[1]) : 1, type: TYPE_OF[m[2]] }] })],
    [R(`once during your turn, you may search your deck for (?:a|up to ${N}) basic pokemon and put (?:it|them) onto your bench\\. then, shuffle your deck`), (m) => ({ k: 'once', fx: [{ k: 'benchSearch', n: m[1] ? n(m[1]) : 1 }] })],
    [R(`once during your turn, you may search your deck for (?:a|up to ${N}) basic ${T} energy cards?, reveal (?:it|them), and put (?:it|them) into your hand\\. then, shuffle your deck`), (m) => ({ k: 'once', fx: [{ k: 'energySearch', n: m[1] ? n(m[1]) : 1, type: TYPE_OF[m[2]] }] })],
    [R(`once during your turn, you may attach a basic ${T} energy card from your hand to (this pokemon|${N} of your pokemon|${N} of your benched pokemon)`), (m) => ({ k: 'once', fx: [{ k: 'attachHand', type: TYPE_OF[m[1]], to: m[2] === 'this pokemon' ? 'self' : /benched/.test(m[2]) ? 'bench' : 'any' }] })],
    [R(`once during your turn, you may attach a basic ${T} energy card from your hand to (this pokemon|${N} of your pokemon|${N} of your benched pokemon)\\. if you attached energy to a pokemon in this way, draw (?:a card|${N} cards)`),
      (m) => ({ k: 'once', fx: [{ k: 'attachHand', type: TYPE_OF[m[1]], to: m[2] === 'this pokemon' ? 'self' : /benched/.test(m[2]) ? 'bench' : 'any', draw: m[5] ? n(m[5]) : 1 }] })],
    [R(`once during your turn, you may attach a basic ${T} energy card from your discard pile to (this pokemon|${N} of your pokemon|${N} of your benched pokemon)`), (m) => ({ k: 'once', fx: [{ k: 'attachDiscard', n: 1, type: TYPE_OF[m[1]], to: m[2] === 'this pokemon' ? 'self' : /benched/.test(m[2]) ? 'bench' : 'any' }] })],
    [R(`once during your turn, you may search your deck for (?:a|up to ${N}) basic ${T} energy cards? and attach (?:it|them) to (this pokemon|${N} of your pokemon|your pokemon in any way you like)\\. then, shuffle your deck`),
      (m) => ({ k: 'once', fx: [{ k: 'attachDeck', n: m[1] ? n(m[1]) : 1, type: TYPE_OF[m[2]], to: m[3] === 'this pokemon' ? 'self' : 'any' }] })],
    [R(`once during your turn, you may put (\\d+|an?) damage counters? on ${N} of your opponent's pokemon\\. if you use this ability, this pokemon is knocked out`), (m) => ({ k: 'once', fx: [{ k: 'counters', n: n(m[1]), count: 1 }], sacrifice: true })],
    [R(`once during your turn, you may put (\\d+|an?) damage counters? on ${N} of your opponent's pokemon`), (m) => ({ k: 'once', fx: [{ k: 'counters', n: n(m[1]), count: 1 }] })],
    [R(`once during your turn, you may heal (\\d+) damage from (each of your pokemon|${N} of your pokemon|your active pokemon|this pokemon)`), (m) => ({ k: 'once', fx: [{ k: 'heal', n: +m[1], who: m[2] === 'each of your pokemon' ? 'all' : m[2] === 'your active pokemon' ? 'active' : m[2] === 'this pokemon' ? 'self' : 'any' }] })],
    [R(`once during your turn, if this pokemon is in the active spot, you may switch your opponent's active pokemon with 1 of their benched pokemon`), () => ({ k: 'once', active: true, fx: [{ k: 'gust' }] })],
    [R(`once during your turn, if this pokemon is in the active spot, you may draw (?:a card|${N} cards)`), (m) => ({ k: 'once', active: true, fx: [{ k: 'draw', n: m[1] ? n(m[1]) : 1 }] })],
    [R(`once during your turn, if this pokemon is on your bench, you may draw (?:a card|${N} cards)`), (m) => ({ k: 'once', bench: true, fx: [{ k: 'draw', n: m[1] ? n(m[1]) : 1 }] })],
    [R(`when you play this pokemon from your hand to evolve ${N} of your pokemon during your turn, you may search your deck for up to ${N} basic ${T} energy cards and attach them to your pokemon in any way you like\\. then, shuffle your deck`),
      (m) => ({ k: 'evolve', fx: [{ k: 'attachDeck', n: n(m[2]), type: TYPE_OF[m[3]], to: 'any' }] })],
    [R(`once during your turn, when you play this pokemon from your hand to evolve ${N} of your pokemon, you may use this ability\\. draw (?:a card|${N} cards)`), (m) => ({ k: 'evolve', fx: [{ k: 'draw', n: m[2] ? n(m[2]) : 1 }] })],
    [R(`when you play this pokemon from your hand to evolve ${N} of your pokemon during your turn, you may draw (?:a card|${N} cards)`), (m) => ({ k: 'evolve', fx: [{ k: 'draw', n: m[2] ? n(m[2]) : 1 }] })],
    [R(`when you play this pokemon from your hand onto your bench during your turn, you may draw (?:a card|${N} cards)`), (m) => ({ k: 'bench', fx: [{ k: 'draw', n: m[1] ? n(m[1]) : 1 }] })],
    [R(`when you play this pokemon from your hand onto your bench during your turn, you may search your deck for (?:a|up to ${N}) basic ${T} energy cards?, reveal (?:it|them), and put (?:it|them) into your hand\\. then, shuffle your deck`), (m) => ({ k: 'bench', fx: [{ k: 'energySearch', n: m[1] ? n(m[1]) : 1, type: TYPE_OF[m[2]] }] })],
    [R(`as often as you like during your turn, you may attach a basic ${T} energy card from your discard pile to ${N} of your ${T} pokemon\\. if you attached energy to a pokemon in this way, put (\\d+) damage counters on that pokemon\\. you can't use this ability on a pokemon that would be knocked out`),
      (m) => ({ k: 'embrace', type: TYPE_OF[m[1]], onType: TYPE_OF[m[3]], counters: +m[4] })],
  ];

  ABILITY_RULES.push(
    [R(`once during your turn, if this pokemon is in the active spot, you may use this ability\\. draw ${N} cards\\. you can't use more than 1 .+ ability each turn`), (m) => ({ k: 'once', active: true, unique: true, fx: [{ k: 'draw', n: n(m[1]) }] })],
    [R(`once during your turn, you may (?:use this ability\\. )?switch your active pokemon with ${N} of your benched pokemon`), () => ({ k: 'once', fx: [{ k: 'switch' }] })],
    [R(`as often as you like during your turn, you may use this ability\\. move a basic ${T} energy from ${N} of your pokemon to another of your pokemon`), (m) => ({ k: 'often', fx: [{ k: 'shiftEnergy', n: 1, type: TYPE_OF[m[1]] }] })],
    [R(`once during your turn, you may look at the top ${N} cards of your deck and put ${N} of them into your hand\\. put the other cards? on the bottom of your deck`), (m) => ({ k: 'once', fx: [{ k: 'peek', n: n(m[1]) }] })],
    [R(`once during your turn, if any of your pokemon were knocked out during your opponent's last turn, you may draw ${N} cards\\. you can't use more than 1 .+ ability each turn`), (m) => ({ k: 'once', revenge: true, unique: true, fx: [{ k: 'draw', n: n(m[1]) }] })],
    [R(`if any damage is done to this pokemon by attacks, flip a coin\\. if heads, prevent that damage`), () => ({ k: 'dodge' })],
    [R(`if this pokemon is in the active spot and is damaged by an attack from your opponent's pokemon \\(even if this pokemon is knocked out\\), the attacking pokemon is now ${C}`), (m) => ({ k: 'retaliateCond', c: COND[m[1]] })],
    [R(`if this pokemon would be knocked out by damage from an attack, flip a coin\\. if heads, this pokemon is not knocked out, and its remaining hp becomes (\\d+)`), (m) => ({ k: 'sturdy', hp: +m[1], flip: true })],
    [R(`if this pokemon has full hp, it takes (\\d+) less damage from attacks from your opponent's pokemon \\(after applying weakness and resistance\\)`), (m) => ({ k: 'shield', n: +m[1], full: true })],
    [R(`once during your turn, you may draw cards until you have (\\d+) cards in your hand`), (m) => ({ k: 'once', fx: [{ k: 'drawTo', n: +m[1] }] })],
    [R(`you must discard an? (?:basic )?(?:${T} )?energy card from your hand in order to use this ability\\. once during your turn, you may draw cards until you have (\\d+) cards in your hand`), (m) => ({ k: 'once', cost: 'discardEnergy', fx: [{ k: 'drawTo', n: +m[2] }] })],
    [R(`once during your turn, you may attach a basic energy card from your hand to (this pokemon|${N} of your pokemon|${N} of your benched pokemon)`), (m) => ({ k: 'once', fx: [{ k: 'attachHand', type: null, to: m[1] === 'this pokemon' ? 'self' : /benched/.test(m[1]) ? 'bench' : 'any' }] })],
    [R(`as often as you like during your turn, you may attach a basic ${T} energy card from your hand to ${N} of your pokemon`), (m) => ({ k: 'often', fx: [{ k: 'attachHand', type: TYPE_OF[m[1]], to: 'any' }] })],
    [R(`once during your turn, if this pokemon is in the active spot, you may search your deck for up to ${N} basic ${T} energy cards, reveal them, and put them into your hand\\. then, shuffle your deck`), (m) => ({ k: 'once', active: true, fx: [{ k: 'energySearch', n: n(m[1]), type: TYPE_OF[m[2]] }] })],
    [R(`once during your first turn, you may discard your hand and draw ${N} cards\\. you can't use more than ${N} .+ ability during your turn`), (m) => ({ k: 'once', firstTurn: true, unique: true, fx: [{ k: 'discardHand' }, { k: 'draw', n: n(m[1]) }] })],
    [R(`if this pokemon has any ${T} energy attached, it has no retreat cost`), (m) => ({ k: 'freeRetreat', withType: TYPE_OF[m[1]] })],
    [R(`your basic pokemon in play have no retreat cost`), () => ({ k: 'teamFreeRetreat' })],
  );
  function parseAbility(text, fail) {
    const s = sentences(text).join('. ');
    for (const [re, f] of ABILITY_RULES) {
      const m = re.exec(s);
      if (m) return f(m);
    }
    fail('ability: ' + s);
    return null;
  }

  /* ---------- Trainers ---------- */
  const SKIP_T = [
    /^you may play only 1 supporter card during your turn( \(before your attack\))?$/,
    /^you may play any number of item cards during your turn( \(before your attack\))?$/,
    /^you may play as many item cards as you like during your turn( \(before your attack\))?$/,
    /^attach a pokemon tool to 1 of your pokemon that doesn't already have a pokemon tool attached$/,
    /^you may attach any number of pokemon tools to your pokemon during your turn$/,
    /^you may attach only 1 pokemon tool to each pokemon, and it stays attached$/,
    /^this card stays in play when you play it$/, /^discard this card if another stadium card comes into play$/,
    /^you may play only 1 stadium card during your turn$/, /^put it (?:next to|into) the active spot, and discard it if another stadium comes into play$/,
    /^a stadium with the same name can't be played$/,
    /^(?:ace spec: )?you can't have more than 1 ace spec card in your deck$/,
    /^then,? shuffle your deck$/, /^shuffle your deck$/, /^then, that player shuffles their deck$/,
    /^\(.*\)$/,
  ];
  const trainerBody = (rules) => sentences((rules || []).join(' ')).filter((x) => !SKIP_T.some((re) => re.test(x))).join('. ');
  const REMINDER = /^(you may play only 1 supporter card during your turn|you may play any number of item cards during your turn|attach a pokemon tool to 1 of your pokemon that doesn't already have a pokemon tool attached|you may attach any number of pokemon tools to your pokemon during your turn|this card stays in play when you play it\. discard this card if another stadium card comes into play|this card stays in play when you play it|discard this card if another stadium card comes into play|you may play only 1 stadium card during your turn\. put it next to the active spot, and discard it if another stadium comes into play|you can't have more than 1 ace spec card in your deck|\(you can't have more than 1 ace spec card in your deck\.?\)|\(you can't play this card if .+\)|you can't play this card .+ first turn)$/;
  const TRAINER_RULES = [
    [R(`draw (?:a card|${N} cards)`), (m) => [{ k: 'draw', n: m[1] ? n(m[1]) : 1 }]],
    [R(`discard your hand and draw ${N} cards`), (m) => [{ k: 'discardHand' }, { k: 'draw', n: n(m[1]) }]],
    [R(`shuffle your hand into your deck\\. then, draw ${N} cards`), (m) => [{ k: 'shuffleHand' }, { k: 'draw', n: n(m[1]) }]],
    [R(`draw cards until you have ${N} cards in your hand`), (m) => [{ k: 'drawTo', n: n(m[1]) }]],
    [R(`each player shuffles their hand into their deck and draws ${N} cards`), (m) => [{ k: 'judge', n: n(m[1]) }]],
    [R(`each player shuffles their hand into their deck\\. then, each player draws ${N} cards`), (m) => [{ k: 'judge', n: n(m[1]) }]],
    [R(`each player shuffles their hand and puts it on the bottom of their deck\\. if either player put any cards on the bottom of their deck in this way, each player draws a card for each of their remaining prize cards`), () => [{ k: 'iono' }]],
    [R(`draw ${N} cards\\. if your opponent has ${N} or fewer prize cards remaining, draw ${N} more cards`), (m) => [{ k: 'draw', n: n(m[1]), extra: n(m[3]), when: n(m[2]) }]],
    [R(`switch in ${N} of your opponent's benched pokemon to the active spot`), () => [{ k: 'gust' }]],
    [R(`you can use this card only if you have more prize cards remaining than your opponent\\. switch in ${N} of your opponent's benched pokemon to the active spot`), () => [{ k: 'gust' }], { req: 'behind' }],
    [R(`switch in ${N} of your opponent's benched pokemon to the active spot\\. if you do, switch your active pokemon with ${N} of your benched pokemon`), () => [{ k: 'gust' }, { k: 'switch' }]],
    [R(`switch your active pokemon with ${N} of your benched pokemon`), () => [{ k: 'switch' }]],
    [R(`search your deck for (?:a|up to ${N}) basic pokemon and put (?:it|them) onto your bench`), (m) => [{ k: 'benchSearch', n: m[1] ? n(m[1]) : 1 }]],
    [R(`search your deck for up to ${N} basic pokemon with (\\d+) hp or less and put them onto your bench`), (m) => [{ k: 'benchSearch', n: n(m[1]), maxHp: +m[2] }]],
    [R(`search your deck for (?:a|up to ${N}) pokemon, reveal (?:it|them), and put (?:it|them) into your hand`), (m) => [{ k: 'pokeSearch', n: m[1] ? n(m[1]) : 1 }]],
    [R(`search your deck for (?:a|up to ${N}) basic pokemon, reveal (?:it|them), and put (?:it|them) into your hand`), (m) => [{ k: 'pokeSearch', n: m[1] ? n(m[1]) : 1, filter: 'basic' }]],
    [R(`search your deck for (?:an|up to ${N}) evolution pokemon, reveal (?:it|them), and put (?:it|them) into your hand`), (m) => [{ k: 'pokeSearch', n: m[1] ? n(m[1]) : 1, filter: 'evolution' }]],
    [R(`you can use this card only if you discard ${N} other cards? from your hand\\. search your deck for (?:a|up to ${N}) pokemon, reveal (?:it|them), and put (?:it|them) into your hand`), (m) => [{ k: 'pokeSearch', n: m[2] ? n(m[2]) : 1 }], (m) => ({ req: 'discard', n: n(m[1]) })],
    [R(`you can use this card only if you discard (?:another card|${N} other cards) from your hand\\. search your deck for up to ${N} basic energy cards, reveal them, and put them into your hand`), (m) => [{ k: 'energySearch', n: n(m[2]) }], (m) => ({ req: 'discard', n: m[1] ? n(m[1]) : 1 })],
    [R(`search your deck for (?:a|up to ${N}) basic (?:${T} )?energy cards?, reveal (?:it|them), and put (?:it|them) into your hand`), (m) => [{ k: 'energySearch', n: m[1] ? n(m[1]) : 1, type: m[2] ? TYPE_OF[m[2]] : null }]],
    [R(`search your deck for an item card and a pokemon tool card, reveal them, and put them into your hand`), () => [{ k: 'cardSearch', what: ['item', 'tool'] }]],
    [R(`search your deck for (?:a|up to ${N}) (item|supporter|stadium|pokemon tool) cards?, reveal (?:it|them), and put (?:it|them) into your hand`), (m) => [{ k: 'cardSearch', what: Array(m[1] ? n(m[1]) : 1).fill(m[2] === 'pokemon tool' ? 'tool' : m[2]) }]],
    [R(`look at the top ${N} cards of your deck\\. you may reveal a supporter card you find there and put it into your hand\\. shuffle the other cards back into your deck`), (m) => [{ k: 'look', n: n(m[1]), what: 'supporter' }]],
    [R(`heal (\\d+) damage from ${N} of your pokemon`), (m) => [{ k: 'heal', n: +m[1], who: 'any' }]],
    [R(`heal (\\d+) damage from your active pokemon`), (m) => [{ k: 'heal', n: +m[1], who: 'active' }]],
    [R(`heal all damage from ${N} of your pokemon\\. then, discard all energy from that pokemon`), () => [{ k: 'heal', n: 999, who: 'any', stripAll: true }]],
    [R(`put up to ${N} basic energy cards from your discard pile into your hand`), (m) => [{ k: 'recoverEnergy', n: n(m[1]) }]],
    [R(`put a pokemon or a basic energy card from your discard pile into your hand`), () => [{ k: 'recover', n: 1, what: 'pokemonOrEnergy' }]],
    [R(`shuffle up to ${N} in any combination of pokemon and basic energy cards from your discard pile into your deck`), (m) => [{ k: 'rod', n: n(m[1]) }]],
    [R(`shuffle up to ${N} pokemon from your discard pile into your deck`), (m) => [{ k: 'rod', n: n(m[1]), what: 'pokemon' }]],
    [R(`put up to ${N} pokemon from your discard pile into your hand`), (m) => [{ k: 'recover', n: n(m[1]), what: 'pokemon' }]],
    [R(`flip a coin\\. if heads, discard an energy from ${N} of your opponent's pokemon`), () => [{ k: 'flip', heads: [{ k: 'stripAny', n: 1 }], tails: [] }]],
    [R(`discard an energy from your opponent's active pokemon`), () => [{ k: 'strip', n: 1 }]],
    [R(`move a basic energy from ${N} of your pokemon to another of your pokemon`), () => [{ k: 'shiftEnergy' }]],
    [R(`choose up to ${N} pokemon tools attached to pokemon \\(yours or your opponent's\\) and discard them`), (m) => [{ k: 'toolScrap', n: n(m[1]) }]],
    [R(`your opponent's active pokemon is now ${C}(?: and ${C})?`), (m) => [{ k: 'cond', who: 'opp', c: [m[1], m[2]].filter(Boolean).map((x) => COND[x]) }]],
    [R(`your opponent discards cards from their hand until they have ${N} cards in their hand`), (m) => [{ k: 'trimOpp', n: n(m[1]) }]],
  ];
  TRAINER_RULES.push(
    [R(`you can use this card only if you discard ${N} other cards from your hand\\. put up to ${N} basic energy cards from your discard pile into your hand`), (m) => [{ k: 'recoverEnergy', n: n(m[2]) }], (m) => ({ req: 'discard', n: n(m[1]) })],
    [R(`shuffle up to ${N} supporter cards from your discard pile into your deck`), (m) => [{ k: 'rod', n: n(m[1]), what: 'supporter' }]],
    [R(`search your deck for up to ${N} stage 1 pokemon, reveal them, and put them into your hand`), (m) => [{ k: 'pokeSearch', n: n(m[1]), filter: 'stage1' }]],
    [R(`search your deck for a basic pokemon, a stage 1 pokemon, and a stage 2 pokemon, reveal them, and put them into your hand`), () => [{ k: 'cardSearch', what: ['basicPokemon', 'stage1', 'stage2'] }]],
    [R(`search your deck for an evolution pokemon and an energy card, reveal them, and put them into your hand`), () => [{ k: 'cardSearch', what: ['evolution', 'energy'] }]],
    [R(`search your deck for a basic ${T} energy card or a basic ${T} pokemon, reveal it, and put it into your hand`), (m) => [{ k: 'cardSearch', what: ['basicEnergyOrPokemon:' + TYPE_OF[m[1]]] }]],
    [R(`shuffle your hand into your deck\\. then, draw ${N} cards\\. if you have exactly ${N} prize cards remaining, draw ${N} cards instead`), (m) => [{ k: 'shuffleHand' }, { k: 'draw', n: n(m[1]), ifPrizes: n(m[2]), instead: n(m[3]) }]],
    [R(`if you go first, you may use this card during your first turn\\. discard your hand and draw ${N} cards`), (m) => [{ k: 'discardHand' }, { k: 'draw', n: n(m[1]) }], { req: 'firstTurnOk' }],
    [R(`put up to ${N} in any combination of pokemon and basic energy cards from your discard pile into your hand`), (m) => [{ k: 'recover', n: n(m[1]), what: 'pokemonOrEnergy' }]],
    [R(`put up to ${N} in any combination of pokemon that don't have a rule box and basic energy cards from your discard pile into your hand`), (m) => [{ k: 'recover', n: n(m[1]), what: 'pokemonOrEnergy', noRuleBox: true }]],
    [R(`search your deck for any number of basic pokemon and put them onto your bench`), () => [{ k: 'benchSearch', n: 5 }]],
    [R(`put ${N} of your pokemon in play into your hand`), () => [{ k: 'scoop', keepAttached: false }]],
    [R(`put ${N} of your basic pokemon and all attached cards into your hand`), () => [{ k: 'scoop', basic: true, keepAttached: true }]],
    [R(`you can use this card only if you discard ${N} other cards from your hand\\. search your deck for an item card, a pokemon tool card, a supporter card, and a stadium card, reveal them, and put them into your hand`), () => [{ k: 'cardSearch', what: ['item', 'tool', 'supporter', 'stadium'] }], (m) => ({ req: 'discard', n: n(m[1]) })],
    [R(`you can use this card only if any of your pokemon were knocked out during your opponent's last turn\\. each player shuffles their hand into their deck\\. then, you draw ${N} cards, and your opponent draws ${N} cards`), (m) => [{ k: 'judge', n: n(m[1]), opp: n(m[2]) }], { req: 'revenge' }],
    [R(`choose 1: • switch your active pokemon with ${N} of your benched pokemon\\. • during this turn, attacks used by your pokemon do (\\d+) more damage to your opponent's active pokemon ex and active pokemon v \\(before applying weakness and resistance\\)`), (m) => [{ k: 'choose', options: [[{ k: 'switch' }], [{ k: 'boost', n: +m[2], vsEx: true }]] }]],
    [R(`during this turn, attacks used by your pokemon do (\\d+) more damage to your opponent's active pokemon(?: \\(before applying weakness and resistance\\))?`), (m) => [{ k: 'boost', n: +m[1] }]],
    [R(`choose up to ${N} of your pokemon and heal (\\d+) damage from each of them`), (m) => [{ k: 'heal', n: +m[2], who: 'any', count: n(m[1]) }]],
    [R(`search your deck for up to ${N} basic pokemon with (\\d+) hp or less, reveal them, and put them into your hand`), (m) => [{ k: 'pokeSearch', n: n(m[1]), filter: 'basic', maxHp: +m[2] }]],
    [R(`look at the top ${N} cards of your deck\\. you may reveal a pokemon you find there and put it into your hand\\. shuffle the other cards back into your deck`), (m) => [{ k: 'look', n: n(m[1]), what: 'pokemon' }]],
    [R(`look at the top ${N} cards of your deck\\. you may reveal any number of pokemon you find there and put them into your hand\\. shuffle the other cards back into your deck`), (m) => [{ k: 'look', n: n(m[1]), what: 'pokemon', any: true }]],
    [R(`move up to ${N} energy from ${N} of your pokemon to another of your pokemon`), (m) => [{ k: 'shiftEnergy', n: n(m[1]) }]],
    [R(`you can use this card only if you have more prize cards remaining than your opponent\\. ?heal (\\d+) damage from ${N} of your pokemon`), (m) => [{ k: 'heal', n: +m[1], who: 'any' }], { req: 'behind' }],
  );
  // Simple trainers can be read with the attack sentences, as long as every effect makes sense without an attacker.
  const TRAINER_SAFE = new Set(['draw', 'drawTo', 'heal', 'switchOutOpp', 'gust', 'strip', 'cond', 'recoverEnergy', 'energySearch', 'pokeSearch', 'benchSearch', 'cardSearch', 'tutor', 'millOpp', 'discardRandom', 'oppDiscards', 'discardStadium', 'recover', 'shuffleHand', 'discardHand']);
  function trainerFallback(body) {
    let bad = false;
    const fx = parseEffectText(body, () => { bad = true; });
    const okFx = (e) => (e.k === 'flip' ? e.heads.concat(e.tails).every(okFx) : TRAINER_SAFE.has(e.k) && (e.k !== 'heal' || e.who !== 'self') && (e.k !== 'cond' || e.who === 'opp'));
    return !bad && fx.length && fx.every(okFx) ? fx : null;
  }
  const TOOL_RULES = [
    [R(`the (basic )?pokemon this card is attached to gets \\+(\\d+) hp`), (m) => ({ k: 'hp', n: +m[2], basic: !!m[1] })],
    [R(`the retreat cost of the pokemon this card is attached to is ((?:colorless)+) less`), (m) => ({ k: 'retreat', n: m[1].length / 9 })],
    [R(`the retreat cost of the pokemon this card is attached to is colorless less\\. if that pokemon's remaining hp is (\\d+) or less, it has no retreat cost`), (m) => ({ k: 'retreat', n: 1, freeAt: +m[1] })],
    [R(`(?:attacks used by|the attacks of) the pokemon this card is attached to do (\\d+) more damage to your opponent's active pokemon( ex)?(?: \\(before applying weakness and resistance\\))?`), (m) => ({ k: 'dmg', n: +m[1], vsEx: !!m[2] })],
    [R(`if the pokemon this card is attached to is in the active spot and is damaged by an attack from your opponent's pokemon \\(even if it is knocked out\\), put ${N} damage counters on the attacking pokemon`), (m) => ({ k: 'retaliate', n: n(m[1]) })],
    [R(`the ${T} pokemon this card is attached to takes (\\d+) less damage from attacks from your opponent's pokemon(?: \\(after applying weakness and resistance\\))?`), (m) => ({ k: 'shield', n: +m[2], type: TYPE_OF[m[1]] })],
    [R(`the stage 1 pokemon this card is attached to takes (\\d+) less damage from attacks from your opponent's pokemon(?: \\(after applying weakness and resistance\\))?`), (m) => ({ k: 'shield', n: +m[1], stage: 1 })],
    [R(`the basic pokemon this card is attached to has no weakness`), () => ({ k: 'noWeak', basic: true })],
    [R(`the stage 2 pokemon this card is attached to has no retreat cost`), () => ({ k: 'retreat', n: 9, stage: 2 })],
    [R(`at the end of your turn, if the pokemon this card is attached to is in the active spot, heal (\\d+) damage from it`), (m) => ({ k: 'leftovers', n: +m[1] })],
    [R(`if the pokemon this card is attached to is in the active spot and is damaged by an attack from your opponent's pokemon \\(even if this pokemon is knocked out\\), draw ${N} cards`), (m) => ({ k: 'helmet', n: n(m[1]) })],
    [R(`if you have more prize cards remaining than your opponent, the attacks of the pokemon this card is attached to do (\\d+) more damage to your opponent's active pokemon(?: \\(before applying weakness and resistance\\))?`), (m) => ({ k: 'dmg', n: +m[1], behind: true })],
    [R(`if you have more prize cards remaining than your opponent, attacks used by the pokemon this card is attached to do (\\d+) more damage to your opponent's active pokemon(?: \\(before applying weakness and resistance\\))?`), (m) => ({ k: 'dmg', n: +m[1], behind: true })],
    [R(`the pokemon this card is attached to takes (\\d+) less damage from attacks(?: from your opponent's pokemon)?(?: \\(after applying weakness and resistance\\))?`), (m) => ({ k: 'shield', n: +m[1] })],
  ];
  const STADIUM_RULES = [
    [R(`once during each player's turn, that player may flip a coin\\. if heads, that player searches their deck for a pokemon, reveals it, and puts it into their hand`), () => ({ k: 'flipPokeSearch' })],
    [R(`once during each player's turn, that player may search their deck for a pokemon tool card, reveal it, and put it into their hand`), () => ({ k: 'toolSearch' })],
    [R(`once during each player's turn, that player may put up to ${N} basic ${T} energy cards from their discard pile into their hand`), (m) => ({ k: 'energyRecover', n: n(m[1]), type: TYPE_OF[m[2]] })],
    [R(`pokemon tools attached to each pokemon \\(both yours and your opponent's\\) have no effect`), () => ({ k: 'noTools' })],
    [R(`once during each player's turn, that player may search their deck for a basic pokemon that doesn't have a rule box and put it onto their bench`), () => ({ k: 'benchSearch', noRuleBox: true })],
    [R(`once during each player's turn, that player may draw a card`), () => ({ k: 'draw' })],
  ];

  function matchRules(rules, s) {
    for (const r of rules) {
      const m = r[0].exec(s);
      if (m) return { fx: r[1](m), req: typeof r[2] === 'function' ? r[2](m) : r[2] || null };
    }
    return null;
  }

  /* ---------- A whole card ---------- */
  const PRIZES = /when your (?:mega evolution )?pokemon ex is knocked out, your opponent takes (\d|two|three) prize cards/i;
  // raw: { id, n: name, k: kind (0 Pokemon, 1 Trainer, 2 Energy), s: subtypes, hp, t: types, f: evolves from, ab, at, w, r, rc, ru: rules }
  function compileCard(raw) {
    const why = [];
    const fail = (s) => why.push(s);
    const sub = raw.s || [];
    const def = { id: raw.id, name: raw.n, kind: raw.k, sub, rarity: raw.ra || '', img: raw.img || null, set: raw.set || '', num: raw.num || '', reg: raw.reg || '' };
    if (raw.k === 0) {
      def.stage = sub.includes('Stage 2') ? 2 : sub.includes('Stage 1') ? 1 : sub.includes('Basic') ? 0 : -1;
      if (def.stage < 0) fail('stage: ' + sub.join(','));
      def.hp = raw.hp || 0;
      def.types = raw.t || '';
      def.from = raw.f || '';
      def.ex = sub.includes('ex');
      def.mega = sub.includes('MEGA');
      def.tera = sub.includes('Tera');
      def.weak = (raw.w || []).map((x) => ({ t: x[0], v: x.slice(1) }));
      def.res = (raw.r || []).map((x) => ({ t: x[0], v: +x.slice(1).replace('−', '-') }));
      def.retreat = raw.rc || 0;
      def.prizes = 1;
      for (const r of raw.ru || []) {
        const m = PRIZES.exec(clean(r));
        if (m) def.prizes = n(m[1].toLowerCase());
        else if (/^(?:tera: )?as long as this pokemon is on your bench, prevent all damage done to this pokemon by attacks/i.test(clean(r))) def.tera = true;
        else fail('rule: ' + r);
      }
      if (def.ex && def.prizes < 2) def.prizes = 2;
      def.atks = (raw.at || []).map((a) => {
        const dmgStr = String(a[2] || '');
        const base = parseInt(dmgStr, 10) || 0;
        const mod = /×|x$/.test(dmgStr) ? 'x' : /\+$/.test(dmgStr) ? '+' : /-$|−$/.test(dmgStr) ? '-' : '';
        const fx = a[3] ? parseEffectText(a[3], (s) => fail(`${a[0]}: ${s}`)) : [];
        return { name: a[0], cost: a[1] || '', base, mod, text: a[3] || '', fx };
      });
      def.abil = (raw.ab || []).map((a) => {
        const kind = a[2] || 0;
        if (kind !== 0) { fail('old power: ' + a[0]); return null; }
        const e = parseAbility(a[1], fail);
        return e ? Object.assign({ name: a[0], text: a[1] }, e) : null;
      }).filter(Boolean);
      if (!def.atks.length && !def.abil.length) fail('no attacks');
      for (const s of sub) if (!['Basic', 'Stage 1', 'Stage 2', 'ex', 'MEGA', 'Tera', 'Ancient', 'Future'].includes(s)) fail('subtype: ' + s);
    } else if (raw.k === 1) {
      const t = sub.includes('Supporter') ? 'supporter' : sub.includes('Item') ? 'item' : sub.includes('Stadium') ? 'stadium' : sub.includes('Pokémon Tool') ? 'tool' : null;
      if (!t) fail('trainer kind: ' + sub.join(','));
      def.trainer = t;
      def.ace = sub.includes('ACE SPEC');
      const body = trainerBody(raw.ru);
      def.text = (raw.ru || []).filter((r) => !REMINDER.test(clean(r).toLowerCase().replace(/[.!]$/, ''))).join(' ');
      if (raw.n === 'Rare Candy') def.fx = [{ k: 'rareCandy' }];
      else if (t === 'tool') { const m = matchRules(TOOL_RULES, body); if (m) def.tool = m.fx; else fail('tool: ' + body); }
      else if (t === 'stadium') { const m = matchRules(STADIUM_RULES, body); if (m) def.stadium = m.fx; else fail('stadium: ' + body); }
      else {
        const m = matchRules(TRAINER_RULES, body);
        const fb = !m && trainerFallback(body);
        if (m) { def.fx = m.fx; if (m.req) def.req = m.req; } else if (fb) def.fx = fb; else fail('trainer: ' + body);
      }
    } else {
      def.basicEnergy = sub.includes('Basic');
      if (def.basicEnergy) {
        const t = Object.keys(TYPE_OF).find((w) => raw.n.toLowerCase().includes(w));
        def.provides = t ? TYPE_OF[t] : null;
        if (!def.provides) fail('energy type');
      } else {
        fail('special energy');
      }
    }
    def.ok = why.length === 0;
    def.why = why;
    return def;
  }

  return { compileCard, sentences, parseEffectText, TYPES, TYPE_OF, clean };
});
