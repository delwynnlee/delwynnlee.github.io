/* Standard 2025–26: the cards of the Famous Finals (Worlds 31 and 32, Pro Tour Lorwyn Eclipsed, Pro Tour Secrets of
   Strixhaven). Rules for every card in the eight finalists' main decks that the engine's reader can't handle on its own.
   Same shape as the other set files and built from their kits (msh, core, cmdr, fic), so this file loads after msc.js.
   New pieces of rules live here too: Classes, a Room, earthbend, evoke with "if {U}{U} was spent", warp, gift, spree,
   collect evidence, blight, bargain, harmonize, offspring, sunburst and the Verge lands. */
(function (root, factory) {
  const A = typeof module === 'object' && module.exports ? require('./engine.js') : root.Arena;
  if (typeof module === 'object' && module.exports) { require('./msh.js'); require('./core.js'); require('./cmdr.js'); require('./fic.js'); }
  const S = factory(A);
  A.registerScripts(S);
  if (typeof module === 'object' && module.exports) module.exports = S;
  else root.ARENA_STD = Object.keys(S); // the page keeps these out of older modes' deck building (careers), so saved games replay the same
})(typeof self !== 'undefined' ? self : this, function (A) {
'use strict';
const L = A.lib;
const { isCreature, isArtifact, isLand, isEnchantment, isLegendary, pow, tou, has, hasSub, dirty, onBf, byId, cv, pv, other, allCreatures, allPerms,
  addCounters, removeCounters, ctrCount, chooseMode, isHuman, yesNo, bounceCard, destroyPermanent, exilePermanent, putOntoBattlefield, emit, mill, searchLibrary,
  nameList, sacrifice, discardChoice, canPay, pay, pickCards, isIS, scryChoice, makeTokens, drawCards, dealDamage, ctrlOf, targetList, handValue, TREASURE,
  fire, genericCost, costMV, matches, ANY, castZone, chooseNumber, removeFromZones, resetCard, lethalTo, threatOf, castCost } = L;
const { C, T, fn, tg, YOU, OPP, drawN, gain, grantKw, hit, hitOpp, loseLife, mk, pickOne, pickSome, pump, say, tcs, tokSpec, lookTake, ctrEach, becomeCopy } = L.mshKit;
const { kicker } = L.coreKit;
const { basicLand, fetchBasic, rampVal } = L.cmdKit;
const S = {};

/* ============================================================ The kit */
const COL_OF = { Plains: 'W', Island: 'U', Swamp: 'B', Mountain: 'R', Forest: 'G' };
const TYPE_OF = { W: 'Plains', U: 'Island', B: 'Swamp', R: 'Mountain', G: 'Forest' };
const OTTER = tokSpec('Otter', 1, 1, ['U', 'R'], ['Otter'], ['prowess']);
const FISH = tokSpec('Fish', 1, 1, ['U'], ['Fish']);
const ROBOT = tokSpec('Robot', 2, 2, [], ['Robot'], [], { artifact: true });
const isLesson = (c) => c.def.sub.includes('Lesson');
const lessons = (P) => P.gy.filter(isLesson).length;
const nonCreSpell = (d) => !d.types.includes('Creature');
const isISDef = (d) => d.types.includes('Instant') || d.types.includes('Sorcery');
const landsOf = (P) => P.bf.filter(isLand);
const otherLands = (P, c) => P.bf.filter((x) => x !== c && isLand(x)).length;
// The land that is entering right now (playLand puts it on the battlefield before asking how it enters)
const entering = (P) => P.bf[P.bf.length - 1];
// The mana a player could make right now without this land
const manaNow = (P, c) => P.bf.filter((x) => x !== c && !x.tapped && (isLand(x) || x.def.mana || x.def.manaAbs) && !(isCreature(x) && x.sick)).length;
// "You may pay 2 life. If you don't, it enters tapped": the AI pays when the land lets it cast something this turn
function payTwo(G, P, c) {
  if (!c) return false;
  let want;
  if (isHuman(G, P)) want = P.life >= 2 && yesNo(G, P, c, `Pay 2 life so ${c.def.name} enters untapped?`, false);
  else {
    const m = manaNow(P, c);
    want = P.life > 7 && G.active === P.i && P.hand.some((x) => !isLand(x) && x.def.mv === m + 1 && canPayWithOneMore(P, x) && (!L.isInstantSpeed(x.def) || !!x.def.respondOnly));
  }
  if (!want) return false;
  P.life -= 2;
  L.noteLoss(G, P, 2);
  emit(G, 'life', `${P.name} pays 2 life so ${c.def.name} enters untapped.`, { who: P.i, target: `p${P.i}`, amount: 2 });
  return true;
}
const canPayWithOneMore = (P, x) => x.def.mv > 0;
// Verge lands: one colour always, the second while you control a land of either type
const verge = (a, b, ta, tb) => (d) => {
  d.mana = null;
  d.manaAbs = [{ colorsFn: (G, c, P) => (G && P && P.bf.some((x) => x !== c && isLand(x) && (hasSub(x, ta) || hasSub(x, tb))) ? [a, b] : [a]) }];
  d.role = 'land';
  return d;
};
// Lands that enter tapped unless you control a basic land
const basicCheck = (col) => (d) => { d.mana = [col]; d.tappedUnless = (G, P) => P.bf.some((x) => x !== entering(P) && isLand(x) && x.def.supertypes.includes('Basic')); d.role = 'land'; return d; };
// Earthbend N: target land you control becomes a 0/0 creature with haste that's still a land, with N +1/+1 counters.
// When it dies or is exiled, it returns to the battlefield tapped.
function earthbend(G, P, land, n) {
  if (!land || !onBf(G, land) || !isLand(land)) return;
  land.mem.anim = { p: 0, t: 0, until: Infinity };
  land.mem.earth = true;
  (land.timedKw = land.timedKw || []).push({ kw: 'haste', until: Infinity });
  land.xtrig = (land.xtrig || []).concat(EARTH_RETURN);
  dirty(G);
  emit(G, 'pump', `${P.name} earthbends ${land.def.name}: it becomes a 0/0 creature with haste that's still a land.`, { who: P.i, cards: [land.id] });
  addCounters(G, land, n);
}
const EARTH_RETURN = T('leave', { self: true, cond: (G, s, ev) => ev.to === 'gy' || ev.to === 'exile', run: (G, X) => {
  const card = X.ev.c, Q = G.players[card.owner];
  if (!Q.gy.includes(card) && !Q.exile.includes(card)) return;
  emit(G, 'raise', `${card.def.name} returns to the battlefield tapped.`, { who: Q.i, cards: [card.id] });
  putOntoBattlefield(G, Q, card, { tapped: true });
} });
// The best land to earthbend: one that can attack now (untapped), and not the only source of a colour
const earthVal = (G, P, c) => (c.ctrl !== P.i || !isLand(c) ? -9 : (isCreature(c) ? 0.2 : 1) + (c.tapped ? 0 : 0.5) + (c.def.supertypes.includes('Basic') ? 0.3 : 0));
const earthTgt = (n) => fn((G, X, t) => earthbend(G, X.P, t && t.c, n), { tgt: { f: { types: ['Land'], side: 'you' } }, val: earthVal, label: `Earthbend ${n}`, value: 0.8 + n * 0.5 });
// Counting cards of a kind in a graveyard
const gyTypes = (cs) => { const s = new Set(); for (const c of cs) for (const t of c.def.types) if (['Artifact', 'Battle', 'Creature', 'Enchantment', 'Instant', 'Land', 'Planeswalker', 'Sorcery', 'Kindred'].includes(t)) s.add(t); return s.size; };
// Gift: the opponent gets something first (they draw, or a tapped 1/1 Fish)
function giftTo(G, P, what) {
  const O = other(G, P);
  if (what === 'card') { drawCards(G, O, 1); emit(G, 'draw', `${P.name} promised a gift: ${O.name} draws a card.`, { who: O.i }); }
  else if (what === 'fish') { const made = makeTokens(G, O, FISH, 1, { quiet: true, tapped: true }); emit(G, 'token', `${P.name} promised a gift: ${O.name} creates a tapped 1/1 Fish.`, { who: O.i, cards: made.map((c) => c.id) }); }
}
// "Damage can't be prevented this turn"; "if it would die this turn, exile it instead"
const exileIfDies = (G, c) => { if (c && onBf(G, c)) c.exileDead = true; };
// The noncreature spells a deck is built around count for Ral, the Talents, the Mission
const castNonCre = (o) => T('cast', Object.assign({ you: true, cond: (G, src, ev) => nonCreSpell(ev.card.def) }, o));
const castIS = (o) => T('cast', Object.assign({ you: true, cond: (G, src, ev) => isISDef(ev.card.def) }, o));
// Draw, then discard (the AI throws away its worst card)
function loot(G, P, draw = 1, disc = 1, why = 'discard') { drawN(G, P, draw); discardChoice(G, P, Math.min(disc, P.hand.length), why); }
// How much a player wants to throw a card away (an extra land late, a dead card)
const junk = (G, P) => (P.hand.length ? Math.min(...P.hand.map((c) => handValue(G, P, c))) : 9);

/* ============================================================ Lands */
S['Gloomlake Verge'] = verge('U', 'B', 'Island', 'Swamp');
S['Hushwood Verge'] = verge('G', 'W', 'Forest', 'Plains');
S['Riverpyre Verge'] = verge('R', 'U', 'Island', 'Mountain');
S['Thornspire Verge'] = verge('R', 'G', 'Mountain', 'Forest');
S['Willowrush Verge'] = verge('U', 'G', 'Forest', 'Island');
const shock = (d) => { d.tappedUnless = (G, P) => payTwo(G, P, entering(P)); d.role = 'land'; return d; };
S['Watery Grave'] = shock;
S['Steam Vents'] = shock;
S['Temple Garden'] = shock;
// Fast and slow lands
S['Spirebluff Canal'] = (d) => { d.mana = ['U', 'R']; d.tappedUnless = (G, P) => otherLands(P, entering(P)) <= 2; d.role = 'land'; return d; };
S['Stormcarved Coast'] = (d) => { d.mana = ['U', 'R']; d.tappedUnless = (G, P) => otherLands(P, entering(P)) >= 2; d.role = 'land'; return d; };
// Multiversal Passage: choose a basic land type as it enters; it is that type (and taps for its colour); pay 2 life or tapped
S['Multiversal Passage'] = (d) => {
  d.mana = null;
  d.enterAs = (G, P, c) => {
    const need = {};
    for (const x of P.hand.concat(P.library)) for (const col of ANY) need[col] = (need[col] || 0) + (x.def.cost[col] || 0) + (x.def.cost.hy || []).filter((h) => h.includes(col)).length * 0.5;
    const have = {};
    for (const x of P.bf) if (isLand(x)) for (const col of ANY) if ((x.def.mana || []).includes(col) || hasSub(x, TYPE_OF[col])) have[col] = (have[col] || 0) + 1;
    const best = ANY.slice().sort((a, b) => (need[b] || 0) / (1 + (have[b] || 0)) - (need[a] || 0) / (1 + (have[a] || 0)))[0];
    const k = chooseMode(G, P, c, `${c.def.name}: choose a basic land type`, ['Plains', 'Island', 'Swamp', 'Mountain', 'Forest'], ANY.indexOf(best));
    c.mem.btype = ['Plains', 'Island', 'Swamp', 'Mountain', 'Forest'][k];
    say(G, P, `${c.def.name} becomes ${/^[AEIOU]/.test(c.mem.btype) ? 'an' : 'a'} ${c.mem.btype}.`, [c.id]);
  };
  d.subFn = (G, c) => (c.mem && c.mem.btype ? [c.mem.btype] : null);
  d.manaAbs = [{ colorsFn: (G, c) => (c.mem && c.mem.btype ? [COL_OF[c.mem.btype]] : []) }];
  d.tappedUnless = (G, P) => payTwo(G, P, entering(P));
  d.role = 'land';
  return d;
};
S['Abandoned Air Temple'] = (d) => {
  basicCheck('W')(d);
  d.acts.push({ cost: { m: C('{3}{W}'), tap: true }, label: 'Put a +1/+1 counter on each creature you control', when: ['main2', 'end'],
    run: (G, X) => ctrEach(G, X.P.bf.filter(isCreature)),
    ai: (G, P, c, when) => { const n = P.bf.filter(isCreature).length; return n >= 2 && (when === 'end' ? G.active !== P.i : true) ? { score: 0.5 + n * 0.6 } : null; } });
  return d;
};
S["Agna Qel'a"] = (d) => {
  basicCheck('U')(d);
  d.acts.push({ cost: { m: C('{2}{U}'), tap: true }, label: 'Draw a card, then discard a card', when: ['end'],
    run: (G, X) => loot(G, X.P), ai: (G, P) => (G.active !== P.i && P.hand.length ? { score: 0.6 + Math.max(0, 1.5 - junk(G, P)) } : null) });
  return d;
};
S['Ba Sing Se'] = (d) => {
  basicCheck('G')(d);
  d.acts.push({ cost: { m: C('{2}{G}'), tap: true }, sorcery: true, label: 'Earthbend 2', eff: [earthTgt(2)],
    ai: (G, P) => (landsOf(P).length >= 5 ? { score: 1.6 } : null) });
  return d;
};
S['Escape Tunnel'] = (d) => {
  d.mana = null;
  d.acts.push({ cost: { tap: true, sacSelf: true }, label: 'Search for a basic land, onto the battlefield tapped', when: ['end', 'main1', 'main2'],
    run: (G, X) => fetchBasic(G, X.P), ai: (G, P, c, when) => (P.library.some(basicLand) ? { score: (P.bf.some((x) => x.def.landfallFan) ? 2 : 1.2) + (when === 'end' ? 0.2 : 0) } : null) });
  d.acts.push({ cost: { tap: true, sacSelf: true }, label: 'A creature with power 2 or less can\'t be blocked this turn', when: ['main1'],
    eff: [fn((G, X, t) => { const c = t && t.c; if (!c || !onBf(G, c)) return; c.tf.unblockable = true; emit(G, 'pump', `${c.def.name} can't be blocked this turn.`, { who: X.P.i, cards: [c.id] }); },
      { tgt: { f: { side: 'you', fn: (G, c) => pow(c) <= 2 } }, val: (G, P, c) => (c.ctrl === P.i && !c.sick ? pow(c) : -1) })],
    ai: () => null });
  d.role = 'land';
  return d;
};
// Restless Reef: a land that becomes a 4/4 Shark with deathtouch; when it attacks, a player mills four
S['Restless Reef'] = (d) => {
  d.mana = ['U', 'B'];
  d.etbTapped = true;
  d.acts.push({ cost: { m: C('{2}{U}{B}') }, label: 'Become a 4/4 Shark with deathtouch until end of turn', when: ['main1'],
    cond: (G, P, c) => !isCreature(c),
    run: (G, X) => { const c = X.src; c.mem.anim = { p: 4, t: 4, until: G.turn + 1 }; c.addSubs = ['Shark']; (c.timedKw = c.timedKw || []).push({ kw: 'deathtouch', until: G.turn + 1 }); dirty(G); emit(G, 'pump', `${c.def.name} becomes a 4/4 Shark creature with deathtouch until end of turn.`, { who: X.P.i, cards: [c.id] }); },
    ai: (G, P, c) => (G.active === P.i && !c.tapped && landsOf(P).filter((x) => !x.tapped).length >= 5 ? { score: 1.4 } : null) });
  d.trig.push(T('attack', { self: true, run: (G, X) => { mill(G, X.O, 4); } }));
  d.role = 'land';
  return d;
};
// Great Hall of the Biblioplex: {C}; any colour for instants and sorceries (1 life); {5}: a 2/4 Wizard
S['Great Hall of the Biblioplex'] = (d) => {
  d.mana = null;
  d.manaAbs = [{ colors: ['C'] }, { colors: ANY.slice(), life: 1, only: (p) => !!p.def && isISDef(p.def) }];
  d.acts.push({ cost: { m: C('{5}') }, label: 'Become a 2/4 Wizard creature (it stays one)', when: ['main1', 'end'], cond: (G, P, c) => !isCreature(c),
    run: (G, X) => { const c = X.src; c.mem.anim = { p: 2, t: 4, until: Infinity }; c.addSubs = ['Wizard']; dirty(G); emit(G, 'pump', `${c.def.name} becomes a 2/4 Wizard creature. It's still a land.`, { who: X.P.i, cards: [c.id] }); },
    ai: (G, P, c, when) => (landsOf(P).filter((x) => !x.tapped).length >= 7 && when === 'end' && G.active !== P.i ? { score: 0.9 } : null) });
  d.trig.push(castIS({ cond: (G, src, ev) => isISDef(ev.card.def) && isCreature(src), run: (G, X) => { if (onBf(G, X.src)) { X.src.tp += 1; dirty(G); } } }));
  d.role = 'land';
  return d;
};

/* ============================================================ Counterspells
   They answer a spell as it's cast (the engine offers them then): { legal, ai, res } */
function counterIt(G, O, item, unless) {
  const P = item.P, card = item.card;
  if (unless && canPay(P, genericCost(unless))) {
    pay(P, genericCost(unless));
    emit(G, 'info', `${P.name} pays {${unless}}, so ${card.def.name} resolves.`, { who: P.i });
    return false;
  }
  L.finishCountered(G, item);
  return true;
}
// Cheap counters are spent more freely (bonus): a one-mana answer to a three-mana spell is a good trade
const counterAi = (unless, extra, bonus = 0) => (G, O, item) => (unless && canPay(item.P, genericCost(unless)) ? -1 : threatOf(G, O, item) + bonus + (extra ? extra(G, O, item) : 0));
const respondOnly = (d, respond, value) => { d.respond = Object.assign({ counter: true }, respond); d.respondOnly = true; d.spell = [{ k: 'counter', what: 'spell' }]; d.value = value; return d; };
S['Spell Pierce'] = (d) => respondOnly(d, { legal: (G, O, item) => nonCreSpell(item.card.def), ai: counterAi(2, null, 3), res: (G, O, item) => counterIt(G, O, item, 2) }, 2.2);
S['Spell Snare'] = (d) => respondOnly(d, { legal: (G, O, item) => item.card.def.mv === 2, ai: counterAi(0, null, 3), res: (G, O, item) => counterIt(G, O, item) }, 2.1);
S['Spider-Sense'] = (d) => {
  d.webSling = C('{U}');
  return respondOnly(d, { legal: (G, O, item) => isISDef(item.card.def), ai: counterAi(0, null, 1.2), res: (G, O, item) => counterIt(G, O, item) }, 2.3);
};
// Long River's Pull: a creature spell; or, with a gift (they draw a card), any spell
S["Long River's Pull"] = (d) => respondOnly(d, {
  legal: () => true,
  ai: counterAi(0, (G, O, item) => (item.card.def.types.includes('Creature') ? 0.3 : -0.8), 1),
  res: (G, O, item) => { if (!item.card.def.types.includes('Creature')) giftTo(G, O, 'card'); return counterIt(G, O, item); },
}, 2.6);

/* ============================================================ Izzet: Lessons, Otters and spells */
S['Abandon Attachments'] = (d) => {
  d.spell = [fn((G, X) => {
    const P = X.P;
    if (!P.hand.length) return;
    if (isHuman(G, P) && !yesNo(G, P, X.src, 'Discard a card to draw two cards?', true)) return;
    discardChoice(G, P, 1, 'discard');
    drawN(G, P, 2);
  }, { score: (G, P) => (P.hand.length > 1 ? 1.1 + Math.max(0, 1.2 - junk(G, P)) * 0.6 : 0.2), value: 1.7 })];
  return d;
};
S['Accumulate Wisdom'] = (d) => {
  d.spell = [fn((G, X) => { const all = lessons(X.P) >= 3; lookTake(G, X.P, 3, () => true, all ? 3 : 1, 'Accumulate Wisdom'); }, { score: (G, P) => (lessons(P) >= 3 ? 2.6 : 1.3), value: 1.7 })];
  return d;
};
S['Boomerang Basics'] = (d) => {
  d.spell = [fn((G, X, t) => {
    const c = t && t.c; if (!c || !onBf(G, c)) return;
    const mine = c.ctrl === X.P.i;
    bounceCard(G, X.P, c);
    if (mine) drawN(G, X.P, 1);
  }, { tgt: { f: { types: ['nonland'] } }, val: (G, P, c) => (c.ctrl === P.i ? (c.def.etb.length && !c.token ? 0.5 : -1.5) : pv(G, c) * 0.75 + (c.token ? 1.2 : 0) + (ctrCount(c, '+1/+1') || c.cnt > 0 ? 0.5 : 0)), value: 1.6 })];
  return d;
};
S['Combustion Technique'] = (d) => {
  d.spell = [fn((G, X, t) => { const c = t && t.c; if (!c || !onBf(G, c)) return; exileIfDies(G, c); hit(G, X, c, 2 + lessons(X.P)); },
    { tgt: tg({}), val: (G, P, c) => (c.ctrl === P.i ? -5 : tou(c) - c.dmg <= 2 + lessons(P) && !has(c, 'indestructible') ? cv(c) + 1 : 0.1), value: 2.6 })];
  return d;
};
S['Firebending Lesson'] = (d) => kicker(d, '{4}', { label: '2 damage to a creature', eff: L.fx('Firebending Lesson deals 2 damage to target creature.', 'Firebending Lesson') },
  { label: '5 damage to a creature', eff: L.fx('Firebending Lesson deals 5 damage to target creature.', 'Firebending Lesson') });
S["Iroh's Demonstration"] = (d) => {
  d.modes = [
    { label: '1 damage to each creature your opponents control', eff: [{ k: 'dmgAll', n: 1, side: 'opp' }] },
    { label: '4 damage to a creature', eff: L.fx("Iroh's Demonstration deals 4 damage to target creature.", "Iroh's Demonstration") },
  ];
  d.spell = null;
  return d;
};
S['Gran-Gran'] = (d) => {
  d.trig.push(T('tapped', { cond: (G, src, ev) => !!ev.cs && ev.cs.includes(src), run: (G, X) => loot(G, X.P) }));
  d.spellDiscount = (G, P, card) => (nonCreSpell(card.def) && lessons(P) >= 3 ? 1 : 0);
  d.value = 3.2;
  return d;
};
// Monument to Endurance: each discard, a different one of three things each turn
S['Monument to Endurance'] = (d) => {
  const LABELS = ['Draw a card', 'Create a Treasure token', 'Each opponent loses 3 life'];
  d.trig.push(T('discard', { you: true, run: (G, X) => {
    const m = X.src.mem, P = X.P;
    if (m.mtTurn !== G.turn) { m.mtTurn = G.turn; m.used = []; }
    const opts = [0, 1, 2].filter((k) => !m.used.includes(k));
    if (!opts.length) return;
    const want = X.O.life <= 3 && opts.includes(2) ? 2 : opts.includes(0) ? 0 : opts.includes(2) ? 2 : 1;
    const k = opts.length === 1 ? opts[0] : opts[chooseMode(G, P, X.src, `${X.src.def.name}: choose one`, opts.map((x) => LABELS[x]), opts.indexOf(want))];
    m.used.push(k);
    if (k === 0) drawN(G, P, 1);
    else if (k === 1) mk(G, P, TREASURE, 1);
    else loseLife(G, X.O, 3, P.i);
  } }));
  d.value = 3.4;
  return d;
};
// Classes: level 1 as it enters; "{cost}: Level N" as a sorcery adds the next level's ability
const level = (c) => (c.mem && c.mem.level) || 1;
function classLevel(d, n, cost, label, onLevel, ai) {
  d.acts.push({ cost: { m: C(cost) }, sorcery: true, cond: (G, P, c) => level(c) === n - 1, label: `Level ${n}: ${label}`,
    run: (G, X) => { X.src.mem.level = n; dirty(G); emit(G, 'info', `${X.src.def.name} becomes level ${n}.`, { who: X.P.i, cards: [X.src.id] }); if (onLevel) onLevel(G, X); }, ai });
}
S["Stormchaser's Talent"] = (d) => {
  d.etb = [fn((G, X) => mk(G, X.P, OTTER, 1), { score: () => 1.5, value: 1.6 })];
  classLevel(d, 2, '{3}{U}', 'return an instant or sorcery card from your graveyard to your hand', (G, X) => {
    const cs = X.P.gy.filter((c) => isISDef(c.def));
    const c = pickOne(G, X.P, cs, 'Return an instant or sorcery card to your hand', (x) => x.def.value);
    if (c) { X.P.gy.splice(X.P.gy.indexOf(c), 1); X.P.hand.push(c); dirty(G); emit(G, 'raise', `${X.P.name} returns ${c.def.name} to hand.`, { who: X.P.i, cards: [c.id] }); }
  }, (G, P) => (P.gy.some((c) => isISDef(c.def) && c.def.value >= 1.5) ? { score: 1.6 } : null));
  classLevel(d, 3, '{5}{U}', 'whenever you cast an instant or sorcery spell, create a 1/1 Otter with prowess', null, (G, P) => ({ score: P.hand.filter((c) => isISDef(c.def)).length >= 2 ? 2 : 1 }));
  d.trig.push(castIS({ cond: (G, src, ev) => isISDef(ev.card.def) && level(src) >= 3, run: (G, X) => mk(G, X.P, OTTER, 1) }));
  d.value = 2.6;
  return d;
};
S["Artist's Talent"] = (d) => {
  d.trig.push(castNonCre({ run: (G, X) => {
    const P = X.P;
    if (!P.hand.length) return;
    const mono = P.bf.some((c) => c.def.name === 'Monument to Endurance');
    if (!yesNo(G, P, X.src, `${X.src.def.name}: discard a card to draw a card?`, mono || junk(G, P) < 1.3)) return;
    discardChoice(G, P, 1, 'discard');
    drawN(G, P, 1);
  } }));
  classLevel(d, 2, '{2}{R}', 'noncreature spells you cast cost {1} less', null, (G, P) => (P.hand.filter((c) => nonCreSpell(c.def) && !isLand(c)).length >= 2 ? { score: 1.5 } : null));
  classLevel(d, 3, '{2}{R}', 'your noncombat damage to opponents and their permanents gets +2', null, (G, P) => ({ score: 1.2 }));
  d.spellDiscount = (G, P, card, src) => (level(src) >= 2 && nonCreSpell(card.def) ? 1 : 0);
  d.dmgBoost = (G, src) => (level(src) >= 3 ? 2 : 0);
  d.value = 2.8;
  return d;
};
// Bargain: sacrifice an artifact, enchantment or token as you cast it
const BARGAIN = { sac: { types: ['any'], fn: (G, c) => isArtifact(c) || isEnchantment(c) || !!c.token }, sacWord: 'an artifact, enchantment or token' };
S['Torch the Tower'] = (d) => {
  const burn = (n, scry) => fn((G, X, t) => { const c = t && t.c; if (!c || !onBf(G, c)) return; exileIfDies(G, c); hit(G, X, c, n); if (scry) scryChoice(G, X.P, 1); },
    { tgt: tg({}), val: (G, P, c) => (c.ctrl === P.i ? -5 : tou(c) - c.dmg <= n && !has(c, 'indestructible') ? cv(c) + 1 : 0.1), value: 2 + n * 0.3 });
  d.modes = [{ label: '2 damage to a creature', log: '', eff: [burn(2)] }, { label: 'Bargain: 3 damage and scry 1', log: 'bargained', addCost: BARGAIN, eff: [burn(3, true)], ai: () => 0.2 }];
  d.spell = null;
  return d;
};
S['Impractical Joke'] = (d) => {
  d.spell = [fn((G, X, t) => { const c = t && t.c; if (!c || !onBf(G, c)) return; G.noPrevent = true; hit(G, X, c, 3); G.noPrevent = false; },
    { tgt: tg({}), val: (G, P, c) => (c.ctrl === P.i ? -5 : tou(c) - c.dmg <= 3 && !has(c, 'indestructible') ? cv(c) + 1 : 0.1), value: 2.4 })];
  return d;
};
S['Burst Lightning'] = (d) => kicker(d, '{4}', { label: '2 damage to any target', eff: L.fx('Burst Lightning deals 2 damage to any target.', 'Burst Lightning') },
  { label: '4 damage to any target', eff: L.fx('Burst Lightning deals 4 damage to any target.', 'Burst Lightning') });
S['Consult the Star Charts'] = (d) => {
  const look = (k) => fn((G, X) => lookTake(G, X.P, landsOf(X.P).length, () => true, k, 'Consult the Star Charts'), { score: (G, P) => 1 + k * 0.6, value: 1.2 + k * 0.5 });
  return kicker(d, '{1}{U}', { label: 'Look at the top X cards, take one', eff: [look(1)] }, { label: 'Look at the top X cards, take two', eff: [look(2)] });
};
S['Traumatic Critique'] = (d) => {
  d.spell = [fn((G, X, t) => {
    const n = X.x || (X.item && X.item.x) || 0;
    if (t && (t.c || t.p != null) && n > 0) hit(G, X, t.c ? t.c : { p: t.p }, n);
    drawN(G, X.P, 2);
    discardChoice(G, X.P, 1, 'discard');
  }, { tgt: { what: 'any' }, val: (G, P, x) => (x.def ? (x.ctrl === P.i ? -5 : cv(x)) : x.p === P.i ? -9 : 1.5), value: 2.8 })];
  return d;
};
// Flashback (the card): an instant or sorcery in your graveyard can be cast this turn for its mana cost, then exiled
S['Flashback'] = (d) => {
  d.spell = [fn((G, X, t) => {
    const c = t && t.c; if (!c || !X.P.gy.includes(c)) return;
    X.P.xcast = X.P.xcast || [];
    X.P.xcast.push({ card: c, cost: Object.assign({}, c.def.cost), until: G.turn, exileAfter: true, cond: (GG, P, x) => P.gy.includes(x.card) });
    emit(G, 'info', `${c.def.name} gains flashback until end of turn.`, { who: X.P.i, cards: [c.id] });
  }, { tgt: { what: 'gy', mine: true, f: { types: ['Instant', 'Sorcery'] } }, val: (G, P, c) => (L.canPayBoth && L.canPayBoth(P, C('{R}'), c.def.cost) && !c.def.respondOnly ? c.def.value * 0.8 : -1), value: 1.6 })];
  return d;
};
// Gift a tapped Fish: bounce a creature, or with the gift any nonland permanent
S['Into the Flood Maw'] = (d) => {
  const back = (f) => fn((G, X, t) => { const c = t && t.c; if (c && onBf(G, c)) bounceCard(G, X.P, c); }, { tgt: { f }, val: (G, P, c) => (c.ctrl === P.i ? -3 : pv(G, c) * 0.8 + (c.token ? 1 : 0)), value: 1.6 });
  d.modes = [
    { label: 'Return a creature an opponent controls to its owner\'s hand', log: '', eff: [back({ side: 'opp' })] },
    { label: 'Promise a gift (a tapped 1/1 Fish for them): return a nonland permanent an opponent controls', log: 'with a gift', eff: [fn((G, X) => giftTo(G, X.P, 'fish'), { score: () => -1.2, value: -0.6 }), back({ side: 'opp', types: ['nonland'] })] },
  ];
  d.spell = null;
  return d;
};
// Anthropological Mission: a quest counter, a card, and a discard until it has three
S['Anthropological Mission'] = (d) => {
  d.trig.push(castNonCre({ run: (G, X) => {
    if (onBf(G, X.src)) addCounters(G, X.src, 1, 'quest', true);
    drawN(G, X.P, 1);
    if (ctrCount(X.src, 'quest') < 3) discardChoice(G, X.P, 1, 'discard');
  } }));
  d.value = 3.6;
  return d;
};
S['Ral, Crackling Wit'] = (d) => {
  d.loyalty = 4;
  d.trig.push(castNonCre({ run: (G, X) => { if (onBf(G, X.src)) addCounters(G, X.src, 1, 'loyalty'); } }));
  const pwAi = L.coreKit.pwAi;
  d.pw = [
    { n: 1, label: 'Create a 1/1 Otter with prowess', run: (G, X) => mk(G, X.P, OTTER, 1), ai: pwAi(1.6) },
    { n: -3, label: 'Draw three cards, then discard two', run: (G, X) => loot(G, X.P, 3, 2), ai: pwAi((G, P, c) => (ctrCount(c, 'loyalty') >= 5 ? 2.2 : P.hand.length <= 1 ? 1.8 : 0)) },
    { n: -10, label: 'Draw three cards; instants and sorceries you cast have storm', run: (G, X) => {
      drawN(G, X.P, 3);
      L.addEmblem(G, X.P, 'Ral, Crackling Wit', [castIS({ run: (GG, Y) => { const n = Math.max(0, (Y.ev.nth || 1) - 1); for (let k = 0; k < n && !GG.over; k++) L.copySpell(GG, Y.P, Y.ev.item); } })]);
    }, ai: pwAi(9) },
  ];
  d.value = 5;
  return d;
};
// Engineered Explosives: sunburst charge counters; {2}, sacrifice: destroy each nonland permanent with that mana value
S['Engineered Explosives'] = (d) => {
  d.etbCtr = (G, P, c, o) => ({ charge: o.item && o.item.spentCols ? Object.keys(o.item.spentCols).filter((k) => ANY.includes(k) && o.item.spentCols[k] > 0).length : 0 });
  d.aiX = () => 0;
  const hitList = (G, c) => allPerms(G).filter((x) => !isLand(x) && x !== c && (x.def.mv || 0) === ctrCount(c, 'charge'));
  d.acts.push({ cost: { m: C('{2}'), sacSelf: true }, label: 'Destroy each nonland permanent with mana value equal to its charge counters', when: ['main1', 'main2', 'end'],
    run: (G, X) => { const n = ctrCount(X.src, 'charge'); for (const c of allPerms(G).filter((x) => !isLand(x) && (x.def.mv || 0) === n)) destroyPermanent(G, X.P, c); },
    ai: (G, P, c) => { const s = hitList(G, c).reduce((t, x) => t + (x.ctrl === P.i ? -pv(G, x) : pv(G, x)), 0); return s > 2 ? { score: s } : null; } });
  d.value = 2.4;
  return d;
};
// A Room: two doors. Cast either half; that door unlocks. As a sorcery, pay a locked door's cost to unlock it.
S['Roaring Furnace // Steaming Sauna'] = (d) => {
  const furnace = (G, P, c) => {
    const foes = other(G, P).bf.filter(isCreature);
    if (!foes.length) return;
    const n = P.hand.length;
    const t = isHuman(G, P) ? pickOne(G, P, foes, 'Roaring Furnace: deal damage equal to the cards in your hand to a creature', (x) => cv(x)) : foes.slice().sort((a, b) => ((tou(b) - b.dmg <= n ? cv(b) + 2 : 0) - (tou(a) - a.dmg <= n ? cv(a) + 2 : 0)) || cv(b) - cv(a))[0];
    if (t) hit(G, { P, O: other(G, P), src: c }, t, n);
  };
  const sauna = (G, P, c) => { const nd = Object.assign({}, c.def, { id: `${c.def.id}-sauna-${c.id}`, noMaxHand: true }); G.defs[nd.id] = nd; if (!c.faceBase) c.faceBase = c.def; c.def = nd; dirty(G); };
  const unlock = (G, P, c, door) => {
    if (!onBf(G, c)) return;
    c.mem.doors = c.mem.doors || {};
    if (c.mem.doors[door]) return;
    c.mem.doors[door] = true;
    emit(G, 'info', `${P.name} unlocks ${door === 'f' ? 'Roaring Furnace' : 'Steaming Sauna'}.`, { who: P.i, cards: [c.id] });
    if (door === 'f') furnace(G, P, c); else sauna(G, P, c);
  };
  d.modes = [
    { label: 'Roaring Furnace', log: 'Roaring Furnace', eff: [] },
    { label: 'Steaming Sauna', log: 'Steaming Sauna', alt: C('{3}{U}{U}'), eff: [], ai: () => 0.3 },
  ];
  d.spell = null;
  d.etb = [fn((G, X) => unlock(G, X.P, X.src, X.item && X.item.mode && X.item.mode[0] === 1 ? 's' : 'f'), { score: () => 1 })];
  d.acts.push({ cost: { m: C('{1}{R}') }, sorcery: true, cond: (G, P, c) => !(c.mem.doors || {}).f, label: 'Unlock Roaring Furnace', run: (G, X) => unlock(G, X.P, X.src, 'f'),
    ai: (G, P) => (P.hand.length >= 2 && other(G, P).bf.some((x) => isCreature(x) && tou(x) <= P.hand.length) ? { score: 1.8 } : null) });
  d.acts.push({ cost: { m: C('{3}{U}{U}') }, sorcery: true, cond: (G, P, c) => !(c.mem.doors || {}).s, label: 'Unlock Steaming Sauna', run: (G, X) => unlock(G, X.P, X.src, 's'), ai: () => ({ score: 1.6 }) });
  d.trig.push(T('endStep', { you: true, cond: (G, src) => !!(src.mem.doors || {}).s, run: (G, X) => drawN(G, X.P, 1) }));
  d.value = 2.8;
  return d;
};

/* ============================================================ Green: landfall, earthbending, counters */
const landfall = (o) => T('landfall', Object.assign({ you: true }, o));
// The creature a "target creature you control" effect should go on: the biggest attacker
const bestMine = (G, P, pred) => P.bf.filter((c) => isCreature(c) && (!pred || pred(c))).sort((a, b) => cv(b) - cv(a) || pow(b) - pow(a))[0] || null;
S['Earthbender Ascension'] = (d) => {
  d.etb = [earthTgt(2), fn((G, X) => fetchBasic(G, X.P), { score: rampVal, value: 1.4 })];
  d.trig.push(landfall({ run: (G, X) => {
    if (!onBf(G, X.src)) return;
    addCounters(G, X.src, 1, 'quest', true);
    if (ctrCount(X.src, 'quest') < 4) return;
    const cs = X.P.bf.filter(isCreature);
    const c = cs.length ? (isHuman(G, X.P) ? pickOne(G, X.P, cs, 'Earthbender Ascension: a +1/+1 counter and trample', cv) : bestMine(G, X.P)) : null;
    if (!c) return;
    addCounters(G, c, 1);
    grantKw(G, c, ['trample']);
  } }));
  d.landfallFan = true;
  d.value = 3.4;
  return d;
};
S['Badgermole Cub'] = (d) => {
  d.etb = [earthTgt(1)];
  d.creatureManaPlus = true;
  d.value = 3.4;
  return d;
};
S['Icetill Explorer'] = (d) => {
  d.extraLand = true;
  d.gyLand = () => true;
  d.trig.push(landfall({ run: (G, X) => mill(G, X.P, 1) }));
  d.landfallFan = true;
  d.value = 4;
  return d;
};
// Warp: cast it cheaply from hand; it's exiled at the next end step and can be cast from exile on a later turn
function warpMode(d, cost) {
  const base = { label: `Cast ${d.name}`, log: '', eff: [] };
  d.modes = [base, { label: `Warp for ${A.costText(C(cost))} (exiled at the end of the turn; cast it again later)`, alt: C(cost), log: 'warped', eff: [], cond: (G, P, card) => !card || P.hand.includes(card), ai: (G, P) => (G.phase === 'main1' ? 0.4 : -1) }];
  d.spell = null;
  d.etb = (d.etb || []).concat(fn((G, X) => {
    if (!(X.item && X.item.mode && X.item.mode[0] === 1)) return;
    const c = X.src, P = X.P, t0 = G.turn;
    c.warped = G.turn;
    G.delayed.push({ when: 'end', run: (GG) => {
      if (!onBf(GG, c)) return;
      exilePermanent(GG, GG.players[c.ctrl], c);
      const Q = GG.players[c.owner];
      if (!Q.exile.includes(c)) return;
      Q.xcast = Q.xcast || [];
      Q.xcast.push({ card: c, until: 1e9, cond: (G3, PP, x) => G3.turn > t0 && PP.exile.includes(x.card) });
      emit(GG, 'exile', `${c.def.name} is exiled (warp); it can be cast from exile on a later turn.`, { who: Q.i, cards: [c.id] });
    } });
  }, { score: () => 0 }));
}
S['Mightform Harmonizer'] = (d) => {
  d.trig.push(landfall({ run: (G, X) => {
    const cs = X.P.bf.filter(isCreature);
    if (!cs.length) return;
    const c = isHuman(G, X.P) ? pickOne(G, X.P, cs, 'Mightform Harmonizer: double the power of a creature you control', (x) => pow(x)) : cs.slice().sort((a, b) => (b.attacking ? 2 : 0) + pow(b) - ((a.attacking ? 2 : 0) + pow(a)))[0];
    if (!c || pow(c) <= 0) return;
    const p = pow(c);
    c.tp += p;
    dirty(G);
    emit(G, 'pump', `${c.def.name}'s power is doubled to ${p * 2} until end of turn.`, { who: X.P.i, cards: [c.id] });
  } }));
  warpMode(d, '{2}{G}');
  d.landfallFan = true;
  d.value = 4.6;
  return d;
};
S['Mossborn Hydra'] = (d) => {
  d.etbCtr = () => ({ '+1/+1': 1 });
  d.trig.push(landfall({ run: (G, X) => { const c = X.src; if (onBf(G, c) && c.cnt > 0) addCounters(G, c, c.cnt); } }));
  d.landfallFan = true;
  d.value = 3.6;
  return d;
};
S['Keen-Eyed Curator'] = (d) => {
  d.statics.push({ who: 'self', cond: (G, src) => gyTypes((src.mem && src.mem.ex) || []) >= 4, p: 4, t: 4, kw: ['trample'] });
  d.acts.push({ cost: { m: C('{1}') }, label: 'Exile a card from a graveyard', when: ['end', 'main2'],
    eff: [fn((G, X, t) => {
      const c = t && t.c; if (!c) return;
      const Q = G.players.find((q) => q.gy.includes(c)); if (!Q) return;
      Q.gy.splice(Q.gy.indexOf(c), 1); Q.exile.push(c);
      X.src.mem.ex = (X.src.mem.ex || []).concat(c);
      dirty(G);
      emit(G, 'exile', `${X.src.def.name} exiles ${c.def.name} from ${Q.name}'s graveyard.`, { who: X.P.i, cards: [c.id] });
    }, { tgt: { what: 'gy' }, val: (G, P, c) => { const have = new Set(((P.bf.find((x) => x.def.name === 'Keen-Eyed Curator') || { mem: {} }).mem.ex || []).flatMap((x) => x.def.types)); return c.def.types.some((ty) => !have.has(ty)) ? 1 + c.def.value * 0.1 : 0.2; } })],
    ai: (G, P, c, when) => (when === 'end' && G.active !== P.i && gyTypes((c.mem && c.mem.ex) || []) < 4 && G.players.some((Q) => Q.gy.length) ? { score: 0.9 } : null) });
  d.value = 4;
  return d;
};
S['Lumbering Worldwagon'] = (d) => {
  d.powFn = (G, c) => G.players[c.ctrl].bf.filter(isLand).length;
  const ramp = { may: true, mayLabel: 'Search for a basic land, onto the battlefield tapped?', mayAi: (G, X) => X.P.library.some(basicLand), run: (G, X) => fetchBasic(G, X.P) };
  d.trig.push(T('enter', Object.assign({ self: true }, ramp)), T('attack', Object.assign({ self: true }, ramp)));
  d.value = 3.6;
  return d;
};
// "Whenever a creature you control becomes the target of a spell or ability an opponent controls"
const targetedMine = (o) => T('targeted', Object.assign({ cond: (G, src, ev, Q) => !!ev.c && ev.c.ctrl === Q.i && isCreature(ev.c) && !!ev.by && ev.by.i !== Q.i }, o));
S['Surrak, Elusive Hunter'] = (d) => {
  d.uncounterable = true;
  d.trig.push(targetedMine({ run: (G, X) => drawN(G, X.P, 1) }));
  d.value = 4.6;
  return d;
};
S['Dyadrine, Synthesis Amalgam'] = (d) => {
  d.etbCtr = (G, P, c, o) => ({ '+1/+1': o.item ? o.item.spent || 0 : 0 });
  d.minX = 1;
  d.trig.push(T('attacks', { you: true, run: (G, X) => {
    const cs = X.P.bf.filter((c) => isCreature(c) && c.cnt > 0);
    if (cs.length < 2) return;
    const ranked = cs.slice().sort((a, b) => (b.cnt - (b.attacking ? 1 : 0)) - (a.cnt - (a.attacking ? 1 : 0)));
    const ok = isHuman(G, X.P) ? yesNo(G, X.P, X.src, 'Remove a +1/+1 counter from each of two creatures to draw a card and make a 2/2 Robot?', true) : ranked[1].cnt >= 2 || tou(ranked[1]) > 1;
    if (!ok) return;
    const two = isHuman(G, X.P) ? pickSome(G, X.P, cs, 2, 2, 'Remove a +1/+1 counter from two creatures', cv) : ranked.slice(0, 2);
    if (two.length < 2) return;
    for (const c of two) removeCounters(G, c, '+1/+1', 1);
    emit(G, 'pump', `${X.P.name} removes a +1/+1 counter from ${nameList(two)}.`, { who: X.P.i, cards: two.map((c) => c.id) });
    drawN(G, X.P, 1);
    mk(G, X.P, ROBOT, 1);
  } }));
  d.value = 4.2;
  return d;
};
S['Erode'] = (d) => {
  d.spell = [fn((G, X, t) => {
    const c = t && t.c; if (!c || !onBf(G, c)) return;
    const Q = ctrlOf(G, c);
    destroyPermanent(G, X.P, c);
    if (!Q.library.some(basicLand)) return;
    if (!yesNo(G, Q, c, 'Search your library for a basic land and put it onto the battlefield tapped?', true)) return;
    fetchBasic(G, Q);
  }, { tgt: tg({}), val: (G, P, c) => (c.ctrl === P.i ? -5 : cv(c) - 0.6), value: 3.2 })];
  d.role = 'removal';
  return d;
};

/* ============================================================ Selesnya counters (Michelangelo) */
const MUTAGEN = { name: 'Mutagen', art: true, sub: ['Mutagen'], colors: [], value: 1, text: '{1}, {T}, Sacrifice this token: Put a +1/+1 counter on target creature. Activate only as a sorcery.',
  acts: [{ cost: { m: C('{1}'), tap: true, sacSelf: true }, sorcery: true, label: 'Put a +1/+1 counter on a creature',
    eff: [fn((G, X, t) => { if (t && t.c) addCounters(G, t.c, 1); }, { tgt: tg(YOU), val: (G, P, c) => (c.ctrl === P.i ? cv(c) * 0.2 + 1 : -2) })],
    ai: (G, P) => (P.bf.some(isCreature) && P.bf.filter((x) => isLand(x) && !x.tapped).length >= 2 ? { score: 0.9 } : null) }] };
S['Michelangelo, Weirdness to 11'] = (d) => {
  d.etb = [fn((G, X) => mk(G, X.P, MUTAGEN, 1), { score: () => 1, value: 1 })];
  d.plusOnePlus = (G, x, c) => isCreature(c);
  d.value = 4;
  return d;
};
S['Ouroboroid'] = (d) => {
  d.trig.push(T('combatStart', { you: true, cond: (G) => true, run: (G, X) => {
    if (!onBf(G, X.src)) return;
    const n = Math.max(0, pow(X.src));
    if (!n) return;
    for (const c of X.P.bf.filter(isCreature)) addCounters(G, c, n, '+1/+1', true);
    emit(G, 'pump', `${X.src.def.name} puts ${n === 1 ? 'a +1/+1 counter' : `${n} +1/+1 counters`} on each creature ${X.P.name} controls.`, { who: X.P.i, cards: X.P.bf.filter(isCreature).map((c) => c.id) });
  } }));
  d.value = 5;
  return d;
};
S['Pawpatch Recruit'] = (d) => {
  d.modes = [{ label: 'Cast Pawpatch Recruit', log: '', eff: [] }, { label: 'Offspring {2}: also create a 1/1 token copy', log: 'with offspring', cost: C('{2}'), eff: [], ai: () => 0.8 }];
  d.spell = null;
  d.etb = [fn((G, X) => { if (X.item && X.item.mode && X.item.mode[0] === 1 && !X.src.token) L.mshKit.copyToken(G, X.P, X.src, { def: { power: 1, toughness: 1, modes: null } }); }, { score: () => 0 })];
  d.trig.push(targetedMine({ run: (G, X) => {
    const cs = X.P.bf.filter((c) => isCreature(c) && c !== X.ev.c);
    const c = cs.length ? (isHuman(G, X.P) ? pickOne(G, X.P, cs, 'Pawpatch Recruit: a +1/+1 counter', cv) : bestMine(G, X.P, (x) => x !== X.ev.c)) : null;
    if (c) addCounters(G, c, 1);
  } }));
  d.value = 2.6;
  return d;
};
S['Bejeweled Warg'] = (d) => {
  d.trig.push(T('hitPlayer', { self: true, run: (G, X) => {
    const wolves = X.P.bf.filter((c) => isCreature(c) && hasSub(c, 'Wolf'));
    const k = chooseMode(G, X.P, X.src, 'Bejeweled Warg: choose one', ['A +1/+1 counter on a Wolf you control', 'Create a Treasure token'], wolves.length ? 0 : 1);
    if (k === 0 && wolves.length) { const c = pickOne(G, X.P, wolves, 'A +1/+1 counter on a Wolf', cv); if (c) addCounters(G, c, 1); }
    else mk(G, X.P, TREASURE, 1);
  } }));
  d.value = 3.4;
  return d;
};
S['Brightglass Gearhulk'] = (d) => {
  d.etb = [fn((G, X) => {
    const pred = (c) => c.def.mv <= 1 && ['Artifact', 'Creature', 'Enchantment'].some((t) => c.def.types.includes(t));
    const got = searchLibrary(G, X.P, pred, 2, 'hand', 'Up to two artifact, creature or enchantment cards with mana value 1 or less');
    emit(G, 'search', `${X.P.name} searches for ${got.length ? nameList(got) : 'nothing'}${got.length ? ' and puts them into their hand' : ''}.`, { who: X.P.i, cards: got.map((c) => c.id) });
  }, { score: () => 1.6, value: 1.8 })];
  d.value = 6;
  return d;
};
S['Gene Pollinator'] = (d) => {
  d.manaAbs = [{ colors: ANY.slice(), conv: 1 }];
  d.value = 1.8;
  return d;
};
S['Guiding Hydra'] = (d) => {
  d.etbCtr = (G, P, c, o) => ({ '+1/+1': o.item ? o.item.x || 0 : 0 });
  d.minX = 1;
  d.trig.push(T('combatStart', { you: true, run: (G, X) => {
    const c = X.src, P = X.P;
    if (!onBf(G, c) || c.cnt <= 0) return;
    const others = P.bf.filter((x) => isCreature(x) && x !== c);
    if (!others.length) return;
    if (!yesNo(G, P, c, 'Remove a +1/+1 counter from Guiding Hydra to put one on each other creature you control?', others.length >= 2 || c.cnt >= 3)) return;
    removeCounters(G, c, '+1/+1', 1);
    for (const x of others) addCounters(G, x, 1, '+1/+1', true);
    emit(G, 'pump', `${c.def.name} moves a counter: each other creature ${P.name} controls gets a +1/+1 counter.`, { who: P.i, cards: others.map((x) => x.id) });
  } }));
  d.value = 3.8;
  return d;
};
S["Meltstrider's Resolve"] = (d) => {
  d.aura = { f: { side: 'you' } };
  d.statics.push({ who: 'enchanted', p: 0, t: 2, flags: { maxOne: true } });
  d.etb = [fn((G, X, t) => {
    const host = X.src.att != null ? byId(G, X.src.att) : null, foe = t && t.c;
    if (!host || !foe || !onBf(G, foe) || !onBf(G, host)) return;
    L.fightCards(G, host, foe, X.src);
  }, { tgt: tg(OPP), val: (G, P, c) => cv(c), value: 1.6 })];
  d.value = 2.6;
  return d;
};
S['Seam Rip'] = (d) => {
  d.etb = [fn((G, X, t) => { if (t && t.c) L.exileUntil(G, X.P, X.src, t.c); }, { tgt: { f: { side: 'opp', types: ['nonland'], fn: (G, c) => (c.def.mv || 0) <= 2 } }, val: (G, P, c) => pv(G, c) + 0.5, label: 'Exile a nonland permanent with mana value 2 or less' })];
  d.role = 'removal';
  d.value = 2.6;
  return L.mshKit.holdUntilLeaves(d);
};
S['Practiced Offense'] = (d) => {
  d.spell = [
    fn((G, X, t) => { const Q = t && t.p != null ? G.players[t.p] : X.P; for (const c of Q.bf.filter(isCreature)) addCounters(G, c, 1, '+1/+1', true); emit(G, 'pump', `Each creature ${Q.name} controls gets a +1/+1 counter.`, { who: X.P.i, cards: Q.bf.filter(isCreature).map((c) => c.id) }); },
      { tgt: { what: 'player' }, val: (G, P, x) => (x.p === P.i ? 2 : -2), value: 1.4 }),
    fn((G, X, t) => { const c = t && t.c; if (!c || !onBf(G, c)) return; const k = chooseMode(G, X.P, X.src, `${c.def.name} gains:`, ['Double strike', 'Lifelink'], X.P.life < 8 ? 1 : 0); grantKw(G, c, [k ? 'lifelink' : 'double strike']); },
      { tgt: tg({}), val: (G, P, c) => (c.ctrl === P.i ? cv(c) + (c.sick ? 0 : 1) : -2), value: 1.2 }),
  ];
  d.value = 3;
  return d;
};

/* ============================================================ Black and blue: Dimir Excruciator */
// Incarnations: how they're paid for decides what they do, so each way to pay is a choice as they're cast
function incarnation(d, opts) {
  // opts: [{ label, cost, a: bool, b: bool, evoke: bool, ai }]
  d.modes = opts.map((o) => ({ label: o.label, log: o.log, alt: C(o.cost), eff: [], ai: o.ai || (() => 0), inc: o }));
  d.spell = null;
  return d;
}
const incOf = (X) => (X.item && X.item.mode && X.src.def.modes ? (X.src.def.modes[X.item.mode[0]] || {}).inc : null) || {};
const evokeSac = fn((G, X) => { if (incOf(X).evoke && onBf(G, X.src)) { emit(G, 'sac', `${X.src.def.name} was evoked and is sacrificed.`, { who: X.P.i, cards: [X.src.id] }); sacrifice(G, X.P, X.src, true); } }, { score: () => 0 });
S['Deceit'] = (d) => {
  incarnation(d, [
    { label: 'Pay {2}{U}{U}{B}{B}: return a nonland permanent and make them discard', cost: '{2}{U}{U}{B}{B}', log: 'paid with {U}{U} and {B}{B}', a: true, b: true, ai: () => 1.5 },
    { label: 'Pay {4}{U}{U}: return a nonland permanent', cost: '{4}{U}{U}', log: 'paid with {U}{U}', a: true },
    { label: 'Pay {4}{B}{B}: they discard a card you choose', cost: '{4}{B}{B}', log: 'paid with {B}{B}', b: true },
    { label: 'Evoke {U}{U}: return a nonland permanent, then sacrifice it', cost: '{U}{U}', log: 'evoked with {U}{U}', a: true, evoke: true, ai: () => -1.2 },
    { label: 'Evoke {B}{B}: they discard a card you choose, then sacrifice it', cost: '{B}{B}', log: 'evoked with {B}{B}', b: true, evoke: true, ai: () => -1.4 },
  ]);
  d.etb = [
    fn((G, X, t) => { if (!incOf(X).a) return; const c = t && t.c; if (c && onBf(G, c) && c !== X.src) bounceCard(G, X.P, c); },
      { tgt: { f: { types: ['nonland'] }, min: 0 }, val: (G, P, c) => (c.ctrl === P.i ? -2 : pv(G, c) * 0.8 + (c.token ? 1 : 0)), value: 1.6 }),
    fn((G, X) => {
      if (!incOf(X).b) return;
      const O = X.O, cs = O.hand.filter((c) => !isLand(c));
      emit(G, 'info', `${O.name} reveals their hand${O.hand.length ? `: ${nameList(O.hand)}` : ' (it is empty)'}.`, { who: X.P.i, cards: O.hand.map((c) => c.id) });
      if (!cs.length) return;
      const c = pickOne(G, X.P, cs, 'Choose a nonland card for them to discard', (x) => x.def.value, 'choose', 'hand');
      if (!c) return;
      O.hand.splice(O.hand.indexOf(c), 1); O.gy.push(c); dirty(G);
      emit(G, 'discard', `${O.name} discards ${c.def.name}.`, { who: O.i, cards: [c.id] });
      L.noteDiscard(G, O, c);
    }, { score: (G, P) => (other(G, P).hand.length ? 1.6 : 0), value: 1.6 }),
    evokeSac,
  ];
  d.value = 6;
  return d;
};
S['Wistfulness'] = (d) => {
  incarnation(d, [
    { label: 'Pay {1}{G}{G}{U}{U}: exile an artifact or enchantment, then draw two and discard one', cost: '{1}{G}{G}{U}{U}', log: 'paid with {G}{G} and {U}{U}', a: true, b: true, ai: () => 1.4 },
    { label: 'Pay {3}{G}{G}: exile an artifact or enchantment an opponent controls', cost: '{3}{G}{G}', log: 'paid with {G}{G}', a: true },
    { label: 'Pay {3}{U}{U}: draw two cards, then discard one', cost: '{3}{U}{U}', log: 'paid with {U}{U}', b: true },
    { label: 'Evoke {G}{G}: exile an artifact or enchantment, then sacrifice it', cost: '{G}{G}', log: 'evoked with {G}{G}', a: true, evoke: true, ai: () => -1.2 },
    { label: 'Evoke {U}{U}: draw two and discard one, then sacrifice it', cost: '{U}{U}', log: 'evoked with {U}{U}', b: true, evoke: true, ai: () => -1.5 },
  ]);
  d.etb = [
    fn((G, X, t) => { if (!incOf(X).a) return; const c = t && t.c; if (c && onBf(G, c)) exilePermanent(G, X.P, c); },
      { tgt: { f: { side: 'opp', types: ['Artifact', 'Enchantment'] }, min: 0 }, val: (G, P, c) => pv(G, c) + 0.5, value: 1.4 }),
    fn((G, X) => { if (incOf(X).b) loot(G, X.P, 2, 1); }, { score: () => 1.4, value: 1.4 }),
    evokeSac,
  ];
  d.value = 5.6;
  return d;
};
S['Harvester of Misery'] = (d) => {
  d.etb = [fn((G, X) => {
    const cs = allCreatures(G).filter((c) => c !== X.src);
    for (const c of cs) { c.tp -= 2; c.tt -= 2; }
    dirty(G);
    emit(G, 'pump', `Other creatures get -2/-2 until end of turn.`, { who: X.P.i, cards: cs.map((c) => c.id) });
  }, { score: (G, P) => L.cmdKit.shrinkVal(G, P, 2), value: 1.8 })];
  d.handActs = [{ cost: { m: C('{1}{B}'), discardSelf: true }, label: 'Discard it: a creature gets -2/-2 until end of turn', when: ['main1', 'main2', 'end', 'blocks'],
    eff: [fn((G, X, t) => { const c = t && t.c; if (!c || !onBf(G, c)) return; c.tp -= 2; c.tt -= 2; dirty(G); emit(G, 'pump', `${c.def.name} gets -2/-2 until end of turn.`, { who: X.P.i, cards: [c.id] }); },
      { tgt: tg(OPP), val: (G, P, c) => (tou(c) - c.dmg <= 2 && !has(c, 'indestructible') ? cv(c) + 1 : -1) })],
    ai: (G, P) => (other(G, P).bf.some((c) => isCreature(c) && tou(c) - c.dmg <= 2 && cv(c) >= 2.5) && P.bf.filter(isLand).length < 5 ? { score: 1.8 } : null) }];
  d.value = 5.4;
  return d;
};
// Doomsday Excruciator: each player keeps only the bottom six cards of their library
function doomsday(G, P) {
  for (const Q of G.players) {
    const n = Math.max(0, Q.library.length - 6);
    if (!n) continue;
    const gone = Q.library.splice(Q.library.length - n, n);
    for (const c of gone) { c.faceDown = true; Q.exile.push(c); }
    emit(G, 'exile', `${Q.name} exiles all but the bottom six cards of their library (${n} cards), face down.`, { who: Q.i });
  }
  dirty(G);
}
// Is the race after Doomsday good for P? They draw two a turn from then on, the opponent one.
const doomsdayGood = (G, P, power) => {
  const O = other(G, P);
  if (O.library.length <= 4) return true;
  // From then on P draws two a turn and runs out first, so the opponent has to be dead in two or three attacks
  const team = P.bf.filter((c) => isCreature(c) && !c.sick).reduce((t, c) => t + Math.max(0, pow(c)), 0);
  const walls = O.bf.some((c) => isCreature(c) && (has(c, 'flying') || has(c, 'reach')));
  return !walls && O.life <= power * 2 + team;
};
S['Doomsday Excruciator'] = (d) => {
  d.etb = [fn((G, X) => { if (X.item) doomsday(G, X.P); }, { score: (G, P) => (doomsdayGood(G, P, 6) ? 4 : -9), value: 0 })];
  d.trig.push(T('upkeep', { you: true, run: (G, X) => drawN(G, X.P, 1) }));
  d.value = 6.4;
  return d;
};
// Superior Spider-Man: may enter as a copy of a creature card in any graveyard (still a 4/4 Spider Human Hero named
// Superior Spider-Man), and that card is exiled
S['Superior Spider-Man'] = (d) => {
  d.enterAs = (G, P, card) => {
    const cs = G.players.flatMap((Q) => Q.gy.filter((c) => c.def.types.includes('Creature')));
    if (!cs.length) return;
    const score = (c) => (c.def.name === 'Doomsday Excruciator' ? (doomsdayGood(G, P, 4) ? 20 : -5) : c.def.name === 'Superior Spider-Man' ? -5 : c.def.value + c.def.etb.length * 0.6 - (c.def.modes ? 3 : 0));
    let pick;
    if (isHuman(G, P)) { if (!yesNo(G, P, card, 'Have Superior Spider-Man enter as a copy of a creature card in a graveyard?', true)) return; pick = pickOne(G, P, cs, 'Choose a creature card to copy', (c) => c.def.value, 'choose', 'graveyard'); }
    else { pick = cs.slice().sort((a, b) => score(b) - score(a))[0]; if (!pick || score(pick) < 4.5) return; }
    if (!pick) return;
    const base = pick.def;
    const cdef = Object.assign({}, base, { id: `${base.id}-mind-swap-${card.id}-${G.nextId++}`, name: 'Superior Spider-Man', token: !!card.token, power: 4, toughness: 4, ptText: null, powFn: null,
      sub: base.sub.concat(['Spider', 'Human', 'Hero'].filter((x) => !base.sub.includes(x))), supertypes: base.supertypes.includes('Legendary') ? base.supertypes : base.supertypes.concat('Legendary'),
      front: null, back: null, adv: null, advOf: null, meldInto: null, isBack: false, mdfc: false, enterAs: null, modes: null });
    G.defs[cdef.id] = cdef;
    card.faceBase = card.def;
    card.def = cdef;
    const Q = G.players.find((q) => q.gy.includes(pick));
    Q.gy.splice(Q.gy.indexOf(pick), 1); Q.exile.push(pick);
    emit(G, 'copy', `Superior Spider-Man enters as a copy of ${base.name}; ${base.name} is exiled.`, { who: P.i, cards: [card.id, pick.id] });
  };
  d.value = 5.2;
  return d;
};
S['Deadly Cover-Up'] = (d) => {
  const wrath = L.fx('Destroy all creatures.');
  const purge = fn((G, X) => {
    const O = X.O, cs = O.gy.slice();
    if (!cs.length) return;
    const c = pickOne(G, X.P, cs, 'Exile a card from their graveyard, and every card with that name', (x) => x.def.value + (O.hand.concat(O.library).filter((y) => y.def.name === x.def.name).length) * 1.5, 'choose', 'graveyard');
    if (!c) return;
    const name = c.def.name;
    let fromHand = 0;
    for (const z of [O.gy, O.hand, O.library]) for (const y of z.filter((x) => x.def.name === name)) { z.splice(z.indexOf(y), 1); O.exile.push(y); if (z === O.hand) fromHand++; }
    G.rng.shuffle(O.library);
    dirty(G);
    emit(G, 'exile', `${X.P.name} exiles every ${name} from ${O.name}'s graveyard, hand and library.`, { who: X.P.i });
    if (fromHand) drawN(G, O, fromHand);
  }, { score: (G, P) => (other(G, P).gy.length ? 1.2 : 0) });
  d.modes = [{ label: 'Destroy all creatures', log: '', eff: wrath }, { label: 'Collect evidence 6: also exile a card from their graveyard and every copy of it', log: 'with evidence', addCost: { evidence: 6 }, eff: wrath.concat(purge), ai: () => 0.6 }];
  d.spell = null;
  d.role = 'removal';
  return d;
};
S['Insatiable Avarice'] = (d) => {
  d.modes = [
    { label: '+{2}: put any card from your library on top', log: '+{2}', cost: C('{2}'), eff: [fn((G, X) => { const got = searchLibrary(G, X.P, () => true, 1, 'top', 'Choose a card to put on top of your library'); if (got.length) emit(G, 'search', `${X.P.name} searches their library and puts a card on top.`, { who: X.P.i }); }, { score: () => 1, value: 1.2 })] },
    { label: '+{B}{B}: a player draws three cards and loses 3 life', log: '+{B}{B}', cost: C('{B}{B}'), eff: [fn((G, X, t) => { const Q = t && t.p != null ? G.players[t.p] : X.P; drawN(G, Q, 3); loseLife(G, Q, 3, X.P.i); },
      { tgt: { what: 'player' }, val: (G, P, x) => { const Q = G.players[x.p]; if (!Q) return -9; if (x.p !== P.i) return Q.library.length <= 3 || Q.life <= 3 ? 9 : -3; return P.life > 6 ? 2 : -2; }, value: 2.4 })] },
  ];
  d.modeN = 2;
  d.spell = null;
  return d;
};
S['Intimidation Tactics'] = (d) => {
  d.spell = [fn((G, X) => {
    const O = X.O, cs = O.hand.filter((c) => c.def.types.includes('Artifact') || c.def.types.includes('Creature'));
    emit(G, 'info', `${O.name} reveals their hand${O.hand.length ? `: ${nameList(O.hand)}` : ' (it is empty)'}.`, { who: X.P.i, cards: O.hand.map((c) => c.id) });
    const c = pickOne(G, X.P, cs, 'Exile an artifact or creature card from their hand', (x) => x.def.value, 'choose', 'hand');
    if (!c) return;
    O.hand.splice(O.hand.indexOf(c), 1); O.exile.push(c); dirty(G);
    emit(G, 'exile', `${X.P.name} exiles ${c.def.name} from ${O.name}'s hand.`, { who: X.P.i, cards: [c.id] });
  }, { score: (G, P) => (other(G, P).hand.length >= 2 ? 1.4 : 0.6), value: 1.4 })];
  return d;
};
S['Stock Up'] = (d) => {
  d.spell = [fn((G, X) => lookTake(G, X.P, 5, () => true, 2, 'Stock Up'), { score: () => 2, value: 2.2 })];
  return d;
};
S['Winternight Stories'] = (d) => {
  d.spell = [fn((G, X) => {
    const P = X.P;
    drawN(G, P, 3);
    const cres = P.hand.filter((c) => c.def.types.includes('Creature'));
    const oneCre = cres.length && (isHuman(G, P) ? chooseMode(G, P, X.src, 'Winternight Stories: discard', ['Two cards', 'One creature card'], 1) === 1 : cres.some((c) => handValue(G, P, c) < 3 || c.def.name === 'Doomsday Excruciator'));
    if (oneCre) {
      const c = pickOne(G, P, cres, 'Discard a creature card', (x) => (x.def.name === 'Doomsday Excruciator' ? 9 : -handValue(G, P, x)), 'choose', 'hand');
      if (c) { P.hand.splice(P.hand.indexOf(c), 1); P.gy.push(c); dirty(G); emit(G, 'discard', `${P.name} discards ${c.def.name}.`, { who: P.i, cards: [c.id] }); L.noteDiscard(G, P, c); return; }
    }
    discardChoice(G, P, Math.min(2, P.hand.length), 'discard');
  }, { score: () => 1.8, value: 2.2 })];
  // Harmonize {4}{U}: cast it from the graveyard, tapping a creature to pay {X} of it (X: its power), then it's exiled
  d.flashback = C('{4}{U}');
  d.costMod = (G, P, card) => (P.gy.includes(card) ? Math.max(0, ...P.bf.filter((c) => isCreature(c) && !c.tapped).map((c) => pow(c))) : 0);
  d.onCast = (G, P, item) => {
    if (item.zone !== 'flashback') return;
    const c = P.bf.filter((x) => isCreature(x) && !x.tapped).sort((a, b) => pow(b) - pow(a))[0];
    if (c && pow(c) > 0) { c.tapped = true; dirty(G); emit(G, 'tapfx', `${P.name} taps ${c.def.name} to harmonize.`, { who: P.i, cards: [c.id] }); }
  };
  return d;
};
S["Archenemy's Charm"] = (d) => {
  d.modes = [
    { label: 'Exile a creature or planeswalker', eff: [fn((G, X, t) => { if (t && t.c && onBf(G, t.c)) exilePermanent(G, X.P, t.c); }, { tgt: tg({}), val: (G, P, c) => (c.ctrl === P.i ? -5 : cv(c) + 0.5), value: 3.4 })] },
    { label: 'Return one or two creature cards from your graveyard to your hand', eff: [fn((G, X, t) => { for (const c of tcs(t)) if (X.P.gy.includes(c)) { X.P.gy.splice(X.P.gy.indexOf(c), 1); X.P.hand.push(c); emit(G, 'raise', `${X.P.name} returns ${c.def.name} to hand.`, { who: X.P.i, cards: [c.id] }); } dirty(G); },
      { tgt: { what: 'gy', mine: true, f: { types: ['Creature', 'Planeswalker'] }, n: 2, min: 1 }, val: (G, P, c) => c.def.value * 0.4, value: 2 })] },
    { label: 'Two +1/+1 counters and lifelink on a creature you control', eff: [fn((G, X, t) => { const c = t && t.c; if (!c || !onBf(G, c)) return; addCounters(G, c, 2); grantKw(G, c, ['lifelink']); }, { tgt: tg(YOU), val: (G, P, c) => (c.ctrl === P.i ? cv(c) * 0.2 + 1 : -3), value: 1.6 })] },
  ];
  d.spell = null;
  d.role = 'removal';
  return d;
};
S['Bitter Triumph'] = (d) => {
  d.addCost = { discard: 1, life: 3 };
  d.spell = [fn((G, X, t) => { if (t && t.c && onBf(G, t.c)) destroyPermanent(G, X.P, t.c); }, { tgt: tg({}), val: (G, P, c) => (c.ctrl === P.i ? -5 : cv(c)), value: 3.4 })];
  d.role = 'removal';
  return d;
};
S['Requiting Hex'] = (d) => {
  const kill = fn((G, X, t) => { if (t && t.c && onBf(G, t.c)) destroyPermanent(G, X.P, t.c); }, { tgt: { f: { fn: (G, c) => (c.def.mv || 0) <= 2 } }, val: (G, P, c) => (c.ctrl === P.i ? -5 : cv(c)), value: 2.8 });
  d.modes = [{ label: 'Destroy a creature with mana value 2 or less', log: '', eff: [kill] }, { label: 'Blight 1 (a -1/-1 counter on a creature you control): also gain 2 life', log: 'blighted', addCost: { blight: 1 }, eff: [kill, fn((G, X) => gain(G, X.P, 2), { score: () => 0.8 })], ai: () => 0.1 }];
  d.spell = null;
  d.role = 'removal';
  return d;
};
S['Analyze the Pollen'] = (d) => {
  const find = (pred, why) => fn((G, X) => { const got = searchLibrary(G, X.P, pred, 1, 'hand', why); emit(G, 'search', `${X.P.name} searches for ${got.length ? got[0].def.name : 'nothing'}${got.length ? ' and puts it into their hand' : ''}.`, { who: X.P.i, cards: got.map((c) => c.id) }); }, { score: () => 1.2, value: 1.2 });
  d.modes = [{ label: 'Search for a basic land card', log: '', eff: [find(basicLand, 'A basic land card')] },
    { label: 'Collect evidence 8: search for a creature or land card instead', log: 'with evidence', addCost: { evidence: 8 }, eff: [find((c) => c.def.types.includes('Creature') || isLand(c), 'A creature or land card')], ai: () => 0.8 }];
  d.spell = null;
  return d;
};
S['Full Bore'] = (d) => {
  d.spell = [fn((G, X, t) => { const c = t && t.c; if (!c || !onBf(G, c)) return; pump(G, c, 3, 2, c.warped ? ['trample', 'haste'] : []); },
    { tgt: tg(YOU), val: (G, P, c) => (c.ctrl === P.i ? (c.attacking ? 2 : 0.4) + pow(c) * 0.1 : -3), value: 1.4 })];
  return d;
};

return S;
});
