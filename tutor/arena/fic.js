/* FINAL FANTASY Commander decks (Counter Blitz, Limit Break, Revival Trance, Scions & Spellcraft): rules for the cards the
   engine's reader can't handle on its own. Built from cmdr.js's kit, so this file loads after cmdr.js and ltc.js.
   New here: foretell, support, evolve, undying, adapt and monstrosity, delve, rebound, tiered spells, shield counters
   in play, "modified" creatures, ninjutsu and blitz. Four-player text reads as a duel: "each opponent" is the one opponent. */
(function (root, factory) {
  const A = typeof module === 'object' && module.exports ? require('./engine.js') : root.Arena;
  if (typeof module === 'object' && module.exports) { require('./msh.js'); require('./core.js'); require('./cmdr.js'); }
  const S = factory(A);
  A.registerScripts(S);
  if (typeof module === 'object' && module.exports) module.exports = S;
})(typeof self !== 'undefined' ? self : this, function (A) {
'use strict';
const L = A.lib;
const { isCreature, isArtifact, isLand, isEnchantment, isLegendary, pow, tou, has, hasSub, attach, dirty, onBf, byId, cv, pv, other, allCreatures, allPerms,
  addCounters, removeCounters, ctrCount, chooseMode, isHuman, yesNo, bounceCard, destroyPermanent, exilePermanent, putOntoBattlefield, enterBattlefield, emit, mill, searchLibrary,
  nameList, gainControl, sacrifice, discardChoice, canPay, pay, pickCards, isIS, scryChoice, surveil, exileUntil, equipmentOn, attachedTo, becomeMonarch, monarchVal, vote,
  cmdIdentity, isCommander, genericCost, goad, amass, FOOD, TREASURE, CLUE, foodsOf, legendsOf, castNow, copySpell, damageCreature, dealDamage, subOf, proliferate, investigate,
  connive, makeTokens, ANY } = L;
const { C, T, fn, YOU, OPP, drawN, edictOf, gain, grantKw, hit, hitOpp, loseLife, mk, mkE, pickOne, pickSome, pump, say, ctx0, holdUntilLeaves, untap, discardE, lookTake,
  ctrEach, chooseOne, copyToken, untilMyNextEnd, impulse, becomeCopy, unCopy } = L.mshKit;
const { tok, kicker, borrow, borrowVal } = L.coreKit;
const { GOAT, BIRD_U, count, nCre, monarchE, noMonarch, reanimate, gyCreatures, destroyEach, sweepVal, shrinkAll, shrinkVal, basicLand, fetchBasic, rampVal,
  revealLand, painland, filterLand, cmdEnters, nextUpkeep } = L.cmdKit;
const targetOk = A._internal.targetOk;
const S = {};

/* ============================================================ The kit */
const HERO = tok('Hero', 1, 1, [], ['Hero']);
const SOLDIER = tok('Soldier', 1, 1, ['W'], ['Soldier']);
const HUMAN_SOLDIER = tok('Human Soldier', 1, 1, ['W'], ['Human', 'Soldier']);
const SPIRIT = tok('Spirit', 1, 1, ['W'], ['Spirit'], ['flying']);
const MOOGLE = tok('Moogle', 1, 2, ['W'], ['Moogle'], ['lifelink']);
const REBEL = tok('Rebel', 2, 2, ['R'], ['Rebel']);
const ZOMBIE = tok('Zombie', 2, 2, ['B'], ['Zombie']);
const SQUID = tok('Squid', 1, 1, ['U'], ['Squid'], [], { landwalk: 'Island', text: 'Islandwalk' });
const BIRD_V = tok('Bird', 1, 1, ['U'], ['Bird'], ['flying', 'vigilance']);
const treasure = (G, P, n = 1, o) => mk(G, P, TREASURE, n, o);
const gained = (P) => P.gainedTurn || 0;
const lostLife = (G, Q) => L.lifeLost(G, Q) > 0;
// A creature with counters on it, equipped, or enchanted by an Aura its controller controls
const ctrKinds = (c) => (c.cnt > 0 ? 1 : 0) + (c.cnt < 0 ? 1 : 0) + Object.keys(c.ctr || {}).filter((k) => c.ctr[k] > 0).length;
const hasCtrs = (c) => ctrKinds(c) > 0;
const modified = (G, c) => hasCtrs(c) || attachedTo(G, c).some((x) => x.ctrl === c.ctrl && (hasSub(x, 'Equipment') || hasSub(x, 'Aura')));
const fromExile = (X) => !!X.item && X.item.zone === 'xcast' && !X.item.fromGy;
const castFromGy = (X) => !!X.item && !!X.item.fromGy;
const greatestPow = (P) => Math.max(0, ...P.bf.filter(isCreature).map(pow));
// Support N: a +1/+1 counter on each of up to N other target creatures
const support = (n) => fn((G, X) => {
  const cs = allCreatures(G).filter((c) => c !== X.src);
  const pick = isHuman(G, X.P) ? pickSome(G, X.P, cs, 0, n, `Support ${n}: put a +1/+1 counter on up to ${n} other creatures`, (c) => (c.ctrl === X.P.i ? cv(c) : -1), 'battlefield')
    : cs.filter((c) => c.ctrl === X.P.i).sort((a, b) => cv(b) - cv(a)).slice(0, n);
  for (const c of pick) addCounters(G, c, 1);
}, { score: (G, P, X) => Math.min(n, P.bf.filter((c) => isCreature(c) && (!X || c !== X.src)).length) * 0.9 });
// Evolve: a bigger creature of yours entering grows this one
const evolve = (d) => { d.trig.push(T('enter', { you: true, other: true, cond: (G, src, ev) => isCreature(ev.c) && (pow(ev.c) > pow(src) || tou(ev.c) > tou(src)), run: (G, X) => addCounters(G, X.src, 1) })); return d; };
// Undying: back with a +1/+1 counter, if it had none
const undying = (d) => {
  d.trig.push(T('die', { self: true, cond: (G, src, ev) => (ev.cnt || 0) <= 0 && !ev.token, run: (G, X) => {
    const c = X.ev.c, O = G.players[c.owner];
    if (!O.gy.includes(c)) return;
    emit(G, 'raise', `${c.def.name} returns with a +1/+1 counter (undying).`, { who: O.i, cards: [c.id] });
    putOntoBattlefield(G, O, c, { ctr: { '+1/+1': 1 } });
  } }));
  return d;
};
// Adapt N and monstrosity: counters once
const adaptAb = (cost, n, label = `Adapt ${n}`) => ({ cost: { m: C(cost) }, label, when: ['end', 'main1'], cond: (G, P, c) => c.cnt <= 0, run: (G, X) => { if (X.src.cnt <= 0) addCounters(G, X.src, n); }, ai: (G, P, c) => (c.cnt <= 0 ? { score: n * 0.9 } : null) });
// Foretell: {2} during your turn to exile it face down; later turns it's cast from exile for its foretell cost
function foretell(d, cost) {
  d.handActs = (d.handActs || []).concat({ cost: { m: C('{2}') }, label: `Foretell: exile it face down (cast it on a later turn for ${cost})`, when: ['main2', 'main1'],
    cond: (G, P) => G.active === P.i,
    run: (G, X) => {
      const P = X.P, c = X.src;
      if (!P.hand.includes(c)) return;
      P.hand.splice(P.hand.indexOf(c), 1);
      P.exile.push(c);
      const turn = G.turn;
      P.xcast.push({ card: c, until: 1e9, cost: C(cost), cond: (GG) => GG.turn > turn, foretold: true });
      dirty(G);
      say(G, P, `${P.name} foretells a card.`);
    },
    ai: (G, P, c, when) => (when === 'main2' && L.manaCount(P) >= 2 && P.hand.filter((x) => !isLand(x)).length >= 2 ? { score: 0.7 } : null) });
  return d;
}
// Delve: each card exiled from your graveyard pays for {1}
function delve(d) {
  d.costMod = (G, P, card) => Math.min(P.gy.filter((x) => x !== card).length, d.cost.g || 0);
  const before = d.onCast;
  d.onCast = (G, P, item) => {
    const n = Math.min(P.gy.filter((x) => x !== item.card).length, d.cost.g || 0);
    const out = P.gy.filter((x) => x !== item.card).sort((a, b) => a.def.value - b.def.value).slice(0, n);
    for (const c of out) { P.gy.splice(P.gy.indexOf(c), 1); P.exile.push(c); }
    if (out.length) emit(G, 'exile', `${P.name} exiles ${out.length} cards from their graveyard (delve).`, { who: P.i });
    if (before) before(G, P, item);
  };
  return d;
}
// Rebound: cast from your hand, it's exiled; at your next upkeep you may cast it for free
const rebound = () => fn((G, X) => {
  if (!X.item || X.item.zone !== 'hand' || !X.src || !X.P.gy) return;
  const P = X.P, card = X.src;
  const k = P.gy.indexOf(card);
  if (k >= 0) { P.gy.splice(k, 1); P.exile.push(card); dirty(G); }
  nextUpkeep(G, P, card, (GG) => { if (GG.active !== P.i || !P.exile.includes(card)) return; P.xcast.push({ card, until: GG.turn, free: true }); if (!castNow(GG, P, card, { free: true })) P.xcast = P.xcast.filter((x) => x.card !== card); });
}, { score: () => 0.6 });
// Tiered: one tier, each with its extra cost
const tiered = (d, tiers) => { d.modes = tiers.map(([label, cost, eff]) => ({ label, cost: cost ? C(cost) : undefined, eff })); d.spell = null; return d; };
// Exile from the top until a card matches; returns [hit, rest]
const revealTil = (G, Q, pred) => { const r = L.revealUntil(G, Q, pred, 1); return [r.hits[0] || null, r.rest]; };
const toBottom = (G, Q, cs) => { G.rng.shuffle(cs); Q.library.unshift(...cs); dirty(G); };
// The +X/+0 or "can't be blocked" grants used all over
const unblockable = (G, c) => { if (c && onBf(G, c)) { c.tf.unblockable = true; grantKw(G, c, [], "can't be blocked this turn"); } };
const regenShield = (G, c) => { if (!c || !onBf(G, c)) return; c.tf.regen = (c.tf.regen || 0) + 1; emit(G, 'info', `${c.def.name} gets a regeneration shield.`, { who: c.ctrl, cards: [c.id] }); };
const doomed = (G, c) => { const fc = L.combatDoom(G); return !!fc && fc.dead.has(c); };
// A creature card from your graveyard to hand
function gyToHand(G, P, c) { if (!c || !P.gy.includes(c)) return false; P.gy.splice(P.gy.indexOf(c), 1); P.hand.push(c); dirty(G); emit(G, 'raise', `${P.name} returns ${c.def.name} to hand.`, { who: P.i, cards: [c.id] }); return true; }
// Clone: enter as a copy of a creature (Altered Ego)
function cloneAs(extra) {
  return (G, P, card) => {
    const cs = allCreatures(G).filter((c) => c !== card);
    if (!cs.length) return;
    let pick;
    if (isHuman(G, P)) { if (!yesNo(G, P, card, `Have ${card.def.name} enter as a copy of a creature?`, true)) return; pick = pickOne(G, P, cs, 'Choose a creature to copy', (c) => cv(c), 'choose', 'battlefield'); }
    else pick = cs.slice().sort((a, b) => b.def.value - a.def.value || cv(b) - cv(a))[0];
    if (!pick) return;
    const base = pick.def;
    const cdef = Object.assign({}, base, { id: `${base.id}-clone-${card.id}-${G.nextId++}`, token: !!card.token, front: null, back: null, adv: null, advOf: null, meldInto: null, isBack: false, mdfc: false }, extra ? extra(base) : null);
    G.defs[cdef.id] = cdef;
    card.faceBase = card.def;
    card.def = cdef;
    emit(G, 'copy', `${card.faceBase.name} enters as a copy of ${base.name}.`, { who: P.i, cards: [card.id, pick.id] });
  };
}

/* ============================================================ Lands */
const twoFor = (a, b) => (d) => { d.mana = null; d.manaAbs = [{ colors: [a, b], amount: 2, conv: 1 }]; d.role = 'land'; return d; };
S['Darkwater Catacombs'] = twoFor('U', 'B');
S['Desolate Mire'] = twoFor('W', 'B');
S['Mossfire Valley'] = twoFor('R', 'G');
S['Overflowing Basin'] = twoFor('G', 'U');
S['Shadowblood Ridge'] = twoFor('B', 'R');
S['Skycloud Expanse'] = twoFor('W', 'U');
S['Sunscorched Divide'] = twoFor('R', 'W');
S['Fetid Heath'] = filterLand('W', 'B');
S['Fire-Lit Thicket'] = filterLand('R', 'G');
S['Graven Cairns'] = filterLand('B', 'R');
S['Rugged Prairie'] = filterLand('R', 'W');
S['Sunken Ruins'] = filterLand('U', 'B');
S['Game Trail'] = revealLand('R', 'G', ['Mountain', 'Forest']);
S['Talisman of Hierarchy'] = painland('W', 'B');
S["Bonders' Enclave"] = (d) => {
  d.mana = ['C'];
  d.acts.push({ cost: { m: C('{3}'), tap: true }, label: 'Draw a card', when: ['end'], cond: (G, P) => P.bf.some((c) => isCreature(c) && pow(c) >= 4), eff: [{ k: 'draw', n: 1 }], ai: (G, P) => (P.bf.filter(isLand).length >= 6 ? { score: 1 } : null) });
  d.role = 'land';
  return d;
};
S['Demolition Field'] = (d) => {
  d.mana = ['C'];
  d.acts.push({ cost: { m: C('{2}'), tap: true, sacSelf: true }, label: 'Destroy a nonbasic land an opponent controls; each of you may search for a basic land', when: ['end'],
    eff: [fn((G, X, t) => { const c = t && t.c; if (c && onBf(G, c)) destroyPermanent(G, X.P, c); fetchBasic(G, X.O, false); fetchBasic(G, X.P, false); },
      { tgt: { f: { types: ['Land'], side: 'opp', fn: (G, c) => !c.def.supertypes.includes('Basic') } }, val: (G, P, c) => (c.def.acts.length ? 1.5 : 0.3), label: 'Choose a nonbasic land an opponent controls' })],
    ai: (G, P) => (other(G, P).bf.some((c) => isLand(c) && !c.def.supertypes.includes('Basic') && c.def.acts.length) ? { score: 1.2 } : null) });
  d.role = 'land';
  return d;
};
S['Forge of Heroes'] = (d) => {
  d.mana = ['C'];
  d.acts.push({ cost: { tap: true }, label: 'Put a +1/+1 counter on a commander that entered this turn', when: ['main1', 'main2'],
    eff: [fn((G, X, t) => { const c = t && t.c; if (c && onBf(G, c)) addCounters(G, c, 1); }, { tgt: { f: { fn: (G, c) => isCommander(c) && c.inTurn === G.turn } }, val: (G, P, c) => (c.ctrl === P.i ? 1.5 : -1), label: 'Choose a commander that entered this turn' })],
    ai: (G, P) => (P.bf.some((c) => isCommander(c) && c.inTurn === G.turn) ? { score: 1.5 } : null) });
  d.role = 'land';
  return d;
};
S['High Market'] = (d) => {
  d.mana = ['C'];
  d.acts.push({ cost: { tap: true, sac: { f: { types: ['Creature'] }, label: 'Sacrifice a creature', prefer: (G, c) => (doomed(G, c) ? -5 : cv(c)) } }, label: 'You gain 1 life', when: ['blocks'],
    eff: [{ k: 'gain', n: 1 }], ai: (G, P) => (P.bf.some((c) => isCreature(c) && doomed(G, c) && P.bf.some((x) => x.def.trig.some((t) => t.on === 'die'))) ? { score: 0.6 } : null) });
  d.role = 'land';
  return d;
};
S['Nesting Grounds'] = (d) => {
  d.mana = ['C'];
  d.acts.push({ cost: { m: C('{1}'), tap: true }, sorcery: true, label: 'Move a counter from a permanent you control onto another', when: ['main1'],
    eff: [fn((G, X, t) => { const a = t && t.c, b = t && t.c2; if (!a || !b || !onBf(G, a) || !onBf(G, b)) return; const k = a.cnt > 0 ? '+1/+1' : Object.keys(a.ctr).find((x) => a.ctr[x] > 0); if (!k) return; removeCounters(G, a, k, 1); addCounters(G, b, 1, k); },
      { tgt: { pair: true, fa: { types: ['any'], side: 'you', fn: (G, c) => hasCtrs(c) }, fb: { types: ['any'], side: 'you' }, labels: ['Move a counter from', 'onto'] }, pairVal: (G, P, a, b) => (isCreature(b) && a.cnt > 0 && !isCreature(a) ? 0.8 : 0.1), label: 'Move a counter' })],
    ai: () => null });
  d.role = 'land';
  return d;
};
S['Spire of Industry'] = (d) => { d.mana = null; d.manaAbs = [{ colors: ['C'] }, { colors: ANY, life: 1, cond: (G, c, P) => P.bf.some(isArtifact) }]; d.role = 'land'; return d; };
S['Temple of the False God'] = (d) => { d.mana = null; d.manaAbs = [{ colors: ['C'], amount: 2, cond: (G, c, P) => P.bf.filter(isLand).length >= 5 }]; d.role = 'land'; return d; };

/* ============================================================ Artifacts */
S["Archaeomancer's Map"] = (d) => {
  d.etb = [fn((G, X) => { const got = searchLibrary(G, X.P, (c) => isLand(c) && c.def.supertypes.includes('Basic') && c.def.sub.includes('Plains'), 2, 'hand', 'Search for up to two basic Plains cards'); if (got.length) emit(G, 'search', `${X.P.name} reveals ${nameList(got)} and puts them into their hand.`, { who: X.P.i, cards: got.map((c) => c.id) }); }, { score: () => 1.6 })];
  d.trig.push(T('enter', { opp: true, cond: (G, src, ev, Q) => isLand(ev.c) && other(G, Q).bf.filter(isLand).length > Q.bf.filter(isLand).length && Q.hand.some(isLand), may: true, mayLabel: 'Put a land card from your hand onto the battlefield?',
    run: (G, X) => { const ls = X.P.hand.filter(isLand); const c = pickOne(G, X.P, ls, 'Put which land onto the battlefield?', () => 1, 'choose', 'hand'); if (c) { emit(G, 'land', `${X.P.name} puts ${c.def.name} onto the battlefield.`, { who: X.P.i, cards: [c.id] }); putOntoBattlefield(G, X.P, c); } } }));
  d.role = 'ramp';
  return d;
};
S['Armory Automaton'] = (d) => {
  const gear = fn((G, X) => {
    const P = X.P, eqs = P.bf.filter((c) => hasSub(c, 'Equipment') && c.att !== X.src.id);
    const pick = isHuman(G, P) ? pickSome(G, P, eqs, 0, eqs.length, 'Attach any number of Equipment to Armory Automaton', () => 1) : eqs.filter((c) => c.att == null || !onBf(G, byId(G, c.att)));
    for (const c of pick) if (onBf(G, X.src)) attach(G, c, X.src);
  }, { score: (G, P) => P.bf.filter((c) => hasSub(c, 'Equipment')).length * 0.8 });
  d.etb = [gear];
  d.trig.push(T('attack', { self: true, eff: [gear] }));
  return d;
};
S['Blitzball Stadium'] = (d) => {
  d.etb = [fn((G, X) => support((X.item && X.item.x) || 0).run(G, X), { score: (G, P, X) => Math.min((X && X.item && X.item.x) || 0, count(P, isCreature)) * 0.9 })];
  d.aiX = (G, P, card, max) => (max >= 2 ? Math.min(max, count(P, isCreature)) : null);
  d.acts.push({ cost: { m: C('{3}'), tap: true }, label: "A creature can't be blocked this turn and draws a card for each kind of counter on it when it connects", when: ['main1'],
    eff: [fn((G, X, t) => {
      const c = t && t.c;
      if (!c || !onBf(G, c)) return;
      unblockable(G, c);
      const id = c.id;
      (X.P.turnTrigs = (X.P.turnTrigs || []).filter((x) => x.turn >= G.turn)).push({ turn: G.turn, src: X.src, t: T('hitPlayer', { cond: (GG, s, ev) => !!ev.c && ev.c.id === id, run: (GG, XX) => drawN(GG, XX.P, ctrKinds(XX.ev.c)) }) });
    }, { tgt: { f: { side: 'you' } }, val: (G, P, c) => (c.tapped || (c.sick && !has(c, 'haste')) ? -1 : pow(c) * 0.4 + ctrKinds(c)), label: 'Choose a creature' })],
    ai: (G, P) => (P.bf.some((c) => isCreature(c) && !c.tapped && (!c.sick || has(c, 'haste')) && ctrKinds(c) >= 1) ? { score: 1.5 } : null) });
  d.role = 'value';
  return d;
};
S["Blue Mage's Cane"] = (d) => {
  d.statics.push({ who: 'equipped', p: 0, t: 2, kw: [], addSub: ['Wizard'] });
  // The equipped creature attacks: exile an instant or sorcery card from their graveyard and cast a copy for {3}
  d.trig.push(T('attack', { cond: (G, src, ev) => ev.c.id === src.att, run: (G, X) => {
    const O = X.O, cs = O.gy.filter((c) => isIS(c.def));
    if (!cs.length) return;
    const c = pickOne(G, X.P, cs, 'Exile an instant or sorcery card from their graveyard', (x) => x.def.value, 'choose', 'graveyard');
    if (!c) return;
    O.gy.splice(O.gy.indexOf(c), 1); O.exile.push(c);
    emit(G, 'exile', `${c.def.name} is exiled from ${O.name}'s graveyard.`, { who: X.P.i, cards: [c.id] });
    if (!canPay(X.P, genericCost(3))) return;
    const want = isHuman(G, X.P) ? yesNo(G, X.P, X.src, `Pay {3} to cast a copy of ${c.def.name}?`, true) : c.def.value >= 1.5;
    if (want && pay(X.P, genericCost(3))) L.castCopyOfCard(G, X.P, c.def);
  } }));
  return d;
};
S["Champion's Helm"] = (d) => { d.statics.push({ who: 'equipped', f: { legendary: true }, p: 0, t: 0, kw: ['hexproof'] }); return d; };
S['Coin of Fate'] = (d) => {
  d.etb = [fn((G, X) => surveil(G, X.P, 1), { score: () => 0.5 })];
  d.acts.push({ cost: { m: C('{3}{W}'), tap: true, sacSelf: true }, label: 'Exile two creature cards from your graveyard: the opponent picks one for the bottom, the other returns; you become the monarch', when: ['main1', 'end'],
    cond: (G, P) => P.gy.filter((c) => c.def.types.includes('Creature')).length >= 2,
    run: (G, X) => {
      const P = X.P, O = X.O, cs = P.gy.filter((c) => c.def.types.includes('Creature'));
      const two = pickSome(G, P, cs, 2, 2, 'Exile two creature cards', (c) => c.def.value, 'graveyard');
      if (two.length < 2) return;
      for (const c of two) { P.gy.splice(P.gy.indexOf(c), 1); P.exile.push(c); }
      const down = isHuman(G, O) ? pickOne(G, O, two, 'Which one goes to the bottom of their library?', (c) => c.def.value, 'choose', 'exile') : two.slice().sort((a, b) => b.def.value - a.def.value)[0];
      const up = two.find((c) => c !== down);
      P.exile.splice(P.exile.indexOf(down), 1); P.library.unshift(down);
      P.exile.splice(P.exile.indexOf(up), 1);
      emit(G, 'raise', `${up.def.name} returns to the battlefield; ${down.def.name} goes to the bottom of the library.`, { who: P.i, cards: [up.id] });
      enterBattlefield(G, P, up, null, { tapped: true });
      up.tapped = true;
      becomeMonarch(G, P);
    }, ai: (G, P) => (P.gy.filter((c) => c.def.types.includes('Creature') && c.def.value >= 2).length >= 2 ? { score: 2.5 + monarchVal(G, P) * 0.5 } : null) });
  return d;
};
S['Colossus Hammer'] = (d) => {
  d.statics = d.statics.filter((x) => x.who !== 'equipped');
  d.statics.push({ who: 'equipped', p: 10, t: 10, kw: [], flags: { loseFlying: true } });
  return d;
};
S['Conformer Shuriken'] = (d) => {
  d.trig.push(T('attack', { cond: (G, src, ev) => ev.c.id === src.att, eff: [fn((G, X, t) => {
    const c = t && t.c, h = X.ev.c;
    if (!c || !onBf(G, c)) return;
    c.tapped = true; emit(G, 'tapfx', `${c.def.name} is tapped.`, { who: X.P.i, cards: [c.id] });
    if (onBf(G, h) && pow(c) > pow(h)) addCounters(G, h, pow(c) - pow(h));
  }, { tgt: { f: { side: 'opp' } }, val: (G, P, c) => (c.tapped ? 0 : cv(c) * 0.3) + Math.max(0, pow(c)) * 0.3, label: 'Tap a creature the defending player controls' })] }));
  return d;
};
S["Conqueror's Flail"] = (d) => {
  const colors = (G, src) => { const s = new Set(); for (const c of G.players[src.ctrl].bf) for (const col of c.def.colors) s.add(col); return s.size; };
  d.statics = d.statics.filter((x) => x.who !== 'equipped');
  d.statics.push({ who: 'equipped', pFn: colors, tFn: colors, kw: [] });
  d.silenceOpp = (G, c) => c.att != null;
  return d;
};
S["Dancer's Chakrams"] = (d) => {
  d.statics.push({ who: 'equipped', p: 2, t: 2, kw: ['lifelink'], addSub: ['Performer'] });
  d.statics.push({ who: 'all', f: { side: 'you', fn: (G, c, P, src) => isCommander(c) && c.id !== src.att }, cond: (G, src) => src.att != null, p: 2, t: 2, kw: ['lifelink'] });
  return d;
};
S["Explorer's Scope"] = (d) => {
  d.trig.push(T('attack', { cond: (G, src, ev) => ev.c.id === src.att, run: (G, X) => {
    const P = X.P, top = P.library[P.library.length - 1];
    if (!top || !isLand(top)) return;
    const want = isHuman(G, P) ? yesNo(G, P, X.src, `Put ${top.def.name} onto the battlefield tapped?`, true) : true;
    if (want) { P.library.pop(); emit(G, 'land', `${P.name} puts ${top.def.name} onto the battlefield tapped.`, { who: P.i, cards: [top.id] }); putOntoBattlefield(G, P, top, { tapped: true }); }
  } }));
  return d;
};
S["Hero's Heirloom"] = (d) => { d.statics.push({ who: 'equipped', f: { legendary: true }, p: 0, t: 0, kw: ['trample', 'haste'] }); return d; };
S['Inspiring Statuary'] = (d) => { d.improviseFor = (def) => !def.types.includes('Artifact'); d.role = 'ramp'; return d; };
S['Key to the City'] = (d) => {
  d.acts.push({ cost: { tap: true, discard: 1 }, label: "Up to one target creature can't be blocked this turn", when: ['main1'],
    eff: [fn((G, X, t) => { unblockable(G, t && t.c); X.src.mem.keyUsed = true; }, { tgt: { f: { side: 'you' }, min: 0 }, val: (G, P, c) => (c.tapped || (c.sick && !has(c, 'haste')) ? -1 : pow(c) * 0.5), label: "Choose a creature that can't be blocked" })],
    ai: (G, P) => (P.hand.some((c) => isLand(c)) && P.bf.filter(isLand).length >= 6 && P.bf.some((c) => isCreature(c) && pow(c) >= 4 && !c.tapped) ? { score: 1.2 } : null) });
  // It untaps in your untap step: you may pay {2} to draw
  d.trig.push(T('upkeep', { you: true, cond: (G, src) => !!src.mem.keyUsed, run: (G, X) => {
    X.src.mem.keyUsed = false;
    if (!canPay(X.P, genericCost(2))) return;
    const want = isHuman(G, X.P) ? yesNo(G, X.P, X.src, 'Key to the City untapped: pay {2} to draw a card?', true) : L.manaCount(X.P) >= 5;
    if (want && pay(X.P, genericCost(2))) drawN(G, X.P, 1);
  } }));
  return d;
};
S['Mask of Memory'] = (d) => {
  d.trig.push(T('hitPlayer', { cond: (G, src, ev) => !!ev.c && ev.c.id === src.att, may: true, mayLabel: 'Draw two cards, then discard a card?', run: (G, X) => { drawN(G, X.P, 2); discardE(G, X.P, 1); } }));
  return d;
};
S['Millikin'] = (d) => { d.mana = null; d.manaAbs = [{ colors: ['C'] }]; d.onManaTap = (G, P) => mill(G, P, 1); d.role = 'ramp'; return d; };
S["Reaper's Scythe"] = (d) => {
  d.trig.push(T('endStep', { you: true, cond: (G, src, ev) => ev.nth === 1, run: (G, X) => { const n = G.players.filter((Q) => lostLife(G, Q)).length; if (n) addCounters(G, X.src, n, 'soul'); } }));
  d.statics.push({ who: 'equipped', pFn: (G, src) => ctrCount(src, 'soul'), tFn: (G, src) => ctrCount(src, 'soul'), kw: [], addSub: ['Assassin'] });
  return d;
};
S['Summoning Materia'] = (d) => {
  d.statics.push({ who: 'equipped', p: 2, t: 2, kw: ['vigilance'] });
  d.topCast = (G, P, card, src) => src.att != null && card.def.types.includes('Creature');
  d.peekTop = true;
  // The equipped creature's "{T}: Add {G}": the Materia stands in for it as a mana source, and taps the creature
  const host = (G, c) => (c.att != null ? byId(G, c.att) : null);
  d.mana = null;
  d.manaAbs = [{ colors: ['G'], cond: (G, c) => { const h = host(G, c); return !!h && onBf(G, h) && !h.tapped && (!h.sick || has(h, 'haste')); } }];
  d.onManaTap = (G, P, c) => { const h = host(G, c); if (h) h.tapped = true; c.tapped = false; };
  return d;
};
S['The Falcon, Airship Restored'] = (d) => {
  d.trig.push(T('hitPlayer', { self: true, cond: (G, src, ev, Q) => Q.gy.some((c) => c.def.types.includes('Creature')), may: true, mayLabel: 'Sacrifice The Falcon to return a creature card from your graveyard?',
    mayAi: (G, X) => X.P.gy.some((c) => c.def.types.includes('Creature') && c.def.value >= 3.5),
    run: (G, X) => {
      sacrifice(G, X.P, X.src);
      const cs = X.P.gy.filter((c) => c.def.types.includes('Creature') && c !== X.src);
      const c = pickOne(G, X.P, cs, 'Return a creature card to the battlefield', (x) => x.def.value, 'choose', 'graveyard');
      if (c) reanimate(G, X.P, c);
    } }));
  d.gyActs = [{ cost: { m: C('{4}{B}') }, label: 'Return The Falcon to the battlefield tapped', sorcery: true, when: ['main1', 'main2'], run: (G, X) => { if (X.P.gy.includes(X.src)) reanimate(G, X.P, X.src, { tapped: true }); }, ai: (G, P) => (L.manaCount(P) >= 7 ? { score: 1.5 } : null) }];
  return d;
};
S['The Warring Triad'] = (d) => {
  // Not a creature until its controller has eight or more cards in their graveyard
  d.types = ['Artifact'];
  d.animate = (G, c) => G.players[c.ctrl].gy.length >= 8;
  d.mana = null;
  d.manaAbs = [{ colors: ANY }];
  d.onManaTap = (G, P) => mill(G, P, 1);
  d.role = 'ramp';
  return d;
};
S["Trailblazer's Boots"] = (d) => {
  d.statics = d.statics.filter((x) => x.who !== 'equipped');
  // Nonbasic landwalk: unblockable while the defender controls a nonbasic land
  d.statics.push({ who: 'equipped', cond: (G, src) => G.players.some((Q) => Q.i !== src.ctrl && Q.bf.some((c) => isLand(c) && !c.def.supertypes.includes('Basic'))), p: 0, t: 0, kw: [], flags: { unblockable: true } });
  return d;
};
S['Walking Ballista'] = (d) => {
  d.etbCtr = (G, P, card, opts) => ({ '+1/+1': (opts.item && opts.item.x) || 0 });
  d.aiX = (G, P, card, max) => (max >= 1 ? max : null);
  d.acts.push({ cost: { m: C('{4}') }, label: 'Put a +1/+1 counter on Walking Ballista', when: ['end'], run: (G, X) => addCounters(G, X.src, 1), ai: (G, P) => (L.manaCount(P) >= 6 ? { score: 0.8 } : null) });
  d.acts.push({ cost: { ctr: { kind: '+1/+1', n: 1 } }, label: 'Remove a +1/+1 counter: 1 damage to any target', when: ['main1', 'end', 'blocks'],
    eff: [{ k: 'dmg', n: 1, tgt: { what: 'any', f: {} } }],
    ai: (G, P, c) => { const O = other(G, P); return O.bf.some((x) => isCreature(x) && tou(x) - x.dmg <= 1 && cv(x) >= 1.5 && !has(x, 'indestructible')) || O.life <= c.cnt ? { score: 2 } : null; } });
  return d;
};
S['Wrecking Ball Arm'] = (d) => {
  d.statics = d.statics.filter((x) => x.who !== 'equipped');
  d.statics.push({ who: 'equipped', p: 0, t: 0, kw: [], base: [7, 7], flags: { bigOnly: true } });
  d.acts = d.acts.filter((a) => !a.equip);
  d.acts.push({ equip: true, cost: { m: C('{3}') }, sorcery: true, label: 'Equip legendary creature {3}', only: { legendary: true } }, { equip: true, cost: { m: C('{7}') }, sorcery: true, label: 'Equip {7}' });
  return d;
};

/* ============================================================ White */
S['Alisaie Leveilleur'] = (d) => { d.spellDiscount = (G, P) => (P.cast === 1 ? 2 : 0); return d; };
S['Angel of the Ruins'] = (d) => {
  d.etb = [fn((G, X) => {
    const cs = X.O.bf.filter((c) => isArtifact(c) || isEnchantment(c)).concat(X.P.bf.filter((c) => (isArtifact(c) || isEnchantment(c)) && c !== X.src && pv(G, c) < 0));
    const pick = pickSome(G, X.P, cs, 0, 2, 'Exile up to two artifacts and/or enchantments', (c) => (c.ctrl === X.P.i ? -pv(G, c) : pv(G, c)));
    for (const c of pick) if (onBf(G, c)) exilePermanent(G, X.P, c);
  }, { score: (G, P) => other(G, P).bf.filter((c) => isArtifact(c) || isEnchantment(c)).map((c) => pv(G, c)).sort((a, b) => b - a).slice(0, 2).reduce((s, v) => s + v, 0) })];
  d.cycling = C('{2}');
  d.cycleFind = 'Plains';
  return d;
};
S['Auron, Venerated Guardian'] = (d) => {
  d.trig.push(T('attack', { self: true, run: (G, X) => {
    addCounters(G, X.src, 1);
    const cs = X.O.bf.filter((c) => isCreature(c) && pow(c) < pow(X.src) && targetOk(G, X.P, {}, c, X.src));
    const c = pickOne(G, X.P, cs, 'Exile a creature with less power until Auron leaves', (x) => pv(G, x));
    if (c) exileUntil(G, X.P, X.src, c);
  } }));
  return holdUntilLeaves(d);
};
S['Authority of the Consuls'] = (d) => {
  d.oppCreaturesTapped = true;
  d.trig.push(T('enter', { opp: true, cond: (G, src, ev) => isCreature(ev.c), run: (G, X) => gain(G, X.P, 1) }));
  d.role = 'value';
  return d;
};
S['Champions from Beyond'] = (d) => {
  d.etb = [fn((G, X) => mk(G, X.P, HERO, (X.item && X.item.x) || 0), { score: (G, P, X) => ((X && X.item && X.item.x) || 0) * 1.1 })];
  d.aiX = (G, P, card, max) => (max >= 2 ? max : null);
  d.trig.push(T('attacks', { you: true, cond: (G, src, ev) => ev.cs.length >= 4, run: (G, X) => { scryChoice(G, X.P, 2); drawN(G, X.P, 1); } }));
  d.trig.push(T('attacks', { you: true, cond: (G, src, ev) => ev.cs.length >= 8, run: (G, X) => { for (const c of X.ev.cs) if (onBf(G, c)) { c.tp += 4; c.tt += 4; } dirty(G); emit(G, 'pump', 'The attackers get +4/+4 until end of turn.', { who: X.P.i }); } }));
  return d;
};
S['Chocobo Knights'] = (d) => { d.trig.push(T('attacks', { you: true, run: (G, X) => { for (const c of X.P.bf.filter((c) => isCreature(c) && hasCtrs(c))) grantKw(G, c, ['double strike']); } })); return d; };
S['Cid, Freeflier Pilot'] = (d) => {
  d.spellDiscount = (G, P, card) => (card.def.sub.includes('Equipment') || card.def.sub.includes('Vehicle') ? 1 : 0);
  d.statics.push({ who: 'self', cond: (G, src) => G.active === src.ctrl, p: 0, t: 0, kw: ['flying'] });
  d.acts.push({ cost: { m: C('{2}'), tap: true }, label: 'Return an Equipment or Vehicle card from your graveyard to your hand', when: ['end'],
    eff: [{ k: 'regrow', tgt: { what: 'gy', mine: true, f: { types: ['any'], fn: (G, c) => c.def.sub.includes('Equipment') || c.def.sub.includes('Vehicle') } } }],
    ai: (G, P) => (P.gy.some((c) => c.def.sub.includes('Equipment') || c.def.sub.includes('Vehicle')) ? { score: 1.3 } : null) });
  return d;
};
S["Cloud's Limit Break"] = (d) => {
  const tapped = { f: { tapped: true } };
  tiered(d, [
    ['Cross-Slash — destroy a tapped creature', null, [{ k: 'destroyP', tgt: tapped }]],
    ['Blade Beam ({1} more) — destroy a tapped creature of each player', '{1}', [{ k: 'destroyP', tgt: { f: { tapped: true, side: 'opp' } } }, { k: 'destroyP', tgt: { f: { tapped: true, side: 'you' }, min: 0 } }]],
    ['Omnislash ({3}{W} more) — destroy all tapped creatures', '{3}{W}', [fn((G, X) => destroyEach(G, X.P, allCreatures(G).filter((c) => c.tapped)), { score: (G, P) => sweepVal(G, P, (c) => isCreature(c) && c.tapped) })]],
  ]);
  d.role = 'removal';
  return d;
};
S['Damning Verdict'] = (d) => { d.spell = [fn((G, X) => destroyEach(G, X.P, allCreatures(G).filter((c) => !hasCtrs(c))), { score: (G, P) => sweepVal(G, P, (c) => isCreature(c) && !hasCtrs(c)) })]; d.role = 'sweeper'; return d; };
S['Farewell'] = (d) => {
  const parts = [
    ['artifacts', (G, X) => { for (const c of allPerms(G).filter(isArtifact)) if (onBf(G, c)) exilePermanent(G, X.P, c); }, (G, P) => sweepVal(G, P, isArtifact)],
    ['creatures', (G, X) => { for (const c of allCreatures(G)) if (onBf(G, c)) exilePermanent(G, X.P, c); }, (G, P) => sweepVal(G, P, isCreature)],
    ['enchantments', (G, X) => { for (const c of allPerms(G).filter(isEnchantment)) if (onBf(G, c)) exilePermanent(G, X.P, c); }, (G, P) => sweepVal(G, P, isEnchantment)],
    ['graveyards', (G) => { for (const Q of G.players) { Q.exile.push(...Q.gy.splice(0)); } dirty(G); }, (G, P) => other(G, P).gy.length * 0.1 - P.gy.length * 0.05],
  ];
  d.modes = [];
  for (let m = 1; m < 16; m++) {
    const ps = parts.filter((p, k) => m & (1 << k));
    d.modes.push({ label: `Exile all ${ps.map((p) => p[0]).join(', ')}`, eff: [fn((G, X) => { for (const p of ps) p[1](G, X); emit(G, 'exile', `Farewell exiles all ${ps.map((p) => p[0]).join(', ')}.`, { who: X.P.i }); }, { score: (G, P) => ps.reduce((t, p) => t + p[2](G, P), 0) })] });
  }
  d.spell = null;
  d.role = 'sweeper';
  return d;
};
S['Final Judgment'] = (d) => { d.spell = [fn((G, X) => { for (const c of allCreatures(G)) if (onBf(G, c)) { if (c.ctrl !== X.P.i) X.P.stats.kills++; exilePermanent(G, X.P, c); } }, { score: (G, P) => sweepVal(G, P, isCreature) })]; d.role = 'sweeper'; return d; };
S['Gatta and Luzzu'] = (d) => {
  d.etb = [fn((G, X, t) => { const c = t && t.c; if (c && onBf(G, c)) { c.tf.dmgToCtr = true; say(G, X.P, `Damage to ${c.def.name} this turn becomes +1/+1 counters.`, [c.id]); } }, { tgt: { f: { side: 'you' } }, val: (G, P, c) => (c.attacking || c.blocking ? 2 + cv(c) * 0.3 : 0.5), label: 'Choose a creature you control' })];
  return d;
};
S['General Leo Cristophe'] = (d) => {
  d.etb = [fn((G, X, t) => { const c = t && t.c; if (c && X.P.gy.includes(c)) reanimate(G, X.P, c); if (onBf(G, X.src)) addCounters(G, X.src, count(X.P, isCreature)); },
    { tgt: { what: 'gy', mine: true, f: { types: ['Creature'], fn: (G, c) => c.def.mv <= 3 } }, min: 0, val: (G, P, c) => c.def.value, label: 'Return a creature card with mana value 3 or less' })];
  return d;
};
S['Heidegger, Shinra Executive'] = (d) => {
  d.trig.push(T('combatStart', { you: true, eff: [fn((G, X, t) => { const c = t && t.c; if (c && onBf(G, c)) pump(G, c, X.P.bf.filter((x) => isCreature(x) && hasSub(x, 'Soldier')).length, 0); }, { tgt: { f: { side: 'you' } }, val: (G, P, c) => (c.tapped ? 0 : 1 + pow(c) * 0.1), label: 'Choose a creature you control' })] }));
  d.trig.push(T('endStep', { you: true, cond: (G, src, ev, Q) => ev.nth === 1 && count(other(G, Q), isCreature) > count(Q, isCreature), eff: [mkE(SOLDIER, 1)] }));
  return d;
};
S['Helitrooper'] = (d) => {
  d.trig.push(T('attack', { self: true, eff: [fn((G, X, t) => { const c = t && t.c; if (c && onBf(G, c)) grantKw(G, c, ['flying']); }, { tgt: { f: { attacking: true, other: true } }, val: (G, P, c) => (c.ctrl === P.i && !has(c, 'flying') ? 1 + pow(c) * 0.3 : -1), label: 'Another attacking creature gains flying' })] }));
  d.equipCheaper = 2;
  return d;
};
S['Hildibrand Manderville'] = (d) => {
  d.statics.push({ who: 'all', f: { side: 'you', token: true }, p: 1, t: 1, kw: [] });
  // Dies: until the end of your next turn it may go on its adventure from the graveyard (Gentleman's Rise: a 2/2 Zombie), then be cast from exile
  d.trig.push(T('die', { self: true, run: (G, X) => { X.ev.c.mem = X.ev.c.mem || {}; X.ev.c.advUntil = untilMyNextEnd(G, X.P); } }));
  d.gyActs = [{ cost: { m: C('{2}{B}') }, label: "Gentleman's Rise: create a 2/2 Zombie, and Hildibrand goes on an adventure", when: ['main1', 'main2', 'end'], cond: (G, P, c) => (c.advUntil || 0) >= G.turn,
    run: (G, X) => { const P = X.P, c = X.src; if (!P.gy.includes(c)) return; mk(G, P, ZOMBIE, 1); P.gy.splice(P.gy.indexOf(c), 1); P.exile.push(c); P.xcast.push({ card: c, until: 1e9 }); dirty(G); say(G, P, `${c.def.name} goes on an adventure: it can be cast from exile.`); },
    ai: () => ({ score: 2.5 }) }];
  return d;
};
S['Lord Jyscal Guado'] = (d) => {
  d.trig.push(T('counters', { cond: (G, src, ev, Q) => isCreature(ev.c) && (ev.c.ctrl === Q.i || G.active === Q.i), run: (G, X) => { X.src.mem.ctrTurn = G.turn; } }));
  d.trig.push(T('endStep', { cond: (G, src, ev) => ev.nth === 1 && src.mem.ctrTurn === G.turn, run: (G, X) => investigate(G, X.P, 1) }));
  return d;
};
S['Luminous Broodmoth'] = (d) => {
  d.trig.push(T('die', { you: true, cond: (G, src, ev) => !ev.token && !(ev.def && ev.def.kw.includes('flying')) && !(ev.ctr && ev.ctr.flying), run: (G, X) => {
    const c = X.ev.c, O = G.players[c.owner];
    if (!O.gy.includes(c)) return;
    emit(G, 'raise', `${c.def.name} returns with a flying counter.`, { who: X.P.i, cards: [c.id] });
    putOntoBattlefield(G, O, c, { ctr: { flying: 1 } });
  } }));
  return d;
};
S['Mog, Moogle Warrior'] = (d) => {
  d.trig.push(T('endStep', { you: true, cond: (G, src, ev) => ev.nth === 1, run: (G, X) => {
    let cre = false, non = false;
    for (const Q of [X.P, X.O]) {
      if (!Q.hand.length) continue;
      const worst = Q.hand.slice().sort((a, b) => L.handValue(G, Q, a) - L.handValue(G, Q, b))[0];
      const want = isHuman(G, Q) ? yesNo(G, Q, X.src, 'Mog: discard a card to draw a card?', false) : L.handValue(G, Q, worst) < 1.5;
      if (!want) continue;
      const before = Q.gy.slice();
      discardChoice(G, Q, 1, 'loot');
      const gone = Q.gy.filter((c) => !before.includes(c));
      if (gone.some((c) => c.def.types.includes('Creature'))) cre = true; else if (gone.length) non = true;
      drawN(G, Q, 1);
    }
    if (cre) mk(G, X.P, MOOGLE, 1);
    if (non) for (const c of X.P.bf.filter((x) => isCreature(x) && hasSub(x, 'Moogle'))) addCounters(G, c, 1);
  } }));
  return d;
};
S['Protection Magic'] = (d) => {
  d.spell = [fn((G, X) => {
    const cs = X.P.bf.filter(isCreature);
    const pick = pickSome(G, X.P, cs, 0, 3, 'Put a shield counter on up to three creatures', (c) => cv(c) + (ctrCount(c, 'shield') ? -5 : 0));
    for (const c of pick) addCounters(G, c, 1, 'shield');
  }, { score: (G, P) => Math.min(3, count(P, isCreature)) * 0.8 })];
  d.role = 'trick';
  return d;
};
S['Puresteel Paladin'] = (d) => {
  d.trig.push(T('enter', { you: true, cond: (G, src, ev) => hasSub(ev.c, 'Equipment'), may: true, mayLabel: 'Draw a card?', eff: [{ k: 'draw', n: 1 }] }));
  d.equipZero = (G, P) => count(P, isArtifact) >= 3;
  return d;
};
S['Scholar of New Horizons'] = (d) => {
  d.etbCtr = () => ({ '+1/+1': 1 });
  d.acts.push({ cost: { tap: true }, label: 'Remove a counter from a permanent you control: search for a Plains card', when: ['end', 'main1'], cond: (G, P) => P.bf.some(hasCtrs),
    run: (G, X) => {
      const P = X.P, cs = P.bf.filter(hasCtrs);
      const c = pickOne(G, P, cs, 'Remove a counter from which permanent?', (x) => (x === X.src ? 2 : -cv(x)));
      if (!c) return;
      if (c.cnt > 0) removeCounters(G, c, '+1/+1', 1); else { const k = Object.keys(c.ctr).find((x) => c.ctr[x] > 0); if (k) removeCounters(G, c, k, 1); }
      const bf = other(G, P).bf.filter(isLand).length > P.bf.filter(isLand).length;
      const got = searchLibrary(G, P, (x) => isLand(x) && x.def.sub.includes('Plains'), 1, bf ? 'bfTapped' : 'hand', 'Search for a Plains card');
      if (got.length) emit(G, 'search', `${P.name} finds ${got[0].def.name}${bf ? ' and puts it onto the battlefield tapped' : ''}.`, { who: P.i, cards: [got[0].id] });
    }, ai: (G, P, c) => (c.cnt > 0 && P.library.some((x) => x.def.sub.includes('Plains')) && P.bf.filter(isLand).length < 8 ? { score: 1.2 } : null) });
  return d;
};
S['Secret Rendezvous'] = (d) => { d.spell = [fn((G, X) => { drawN(G, X.P, 3); drawN(G, X.O, 3); }, { score: () => 0.5 })]; d.role = 'draw'; return d; };
S['SOLDIER Military Program'] = (d) => {
  d.trig.push(T('combatStart', { you: true, run: (G, X) => {
    const P = X.P, both = P.bf.some((c) => isCommander(c));
    const soldiers = P.bf.filter((c) => isCreature(c) && hasSub(c, 'Soldier'));
    const opts = ['Create a 1/1 Soldier', 'A +1/+1 counter on each of up to two Soldiers'].concat(both ? ['Both'] : []);
    const k = isHuman(G, P) ? chooseMode(G, P, X.src, 'SOLDIER Military Program: choose', opts, both ? 2 : 0) : both ? 2 : soldiers.length >= 2 ? 1 : 0;
    if (k === 0 || k === 2) mk(G, P, SOLDIER, 1);
    if (k === 1 || k === 2) { const ss = P.bf.filter((c) => isCreature(c) && hasSub(c, 'Soldier')); for (const c of pickSome(G, P, ss, 0, 2, 'Up to two Soldiers get a +1/+1 counter', (x) => cv(x))) addCounters(G, c, 1); }
  } }));
  d.role = 'value';
  return d;
};
S['Summon: Good King Mog XII'] = (d) => {
  d.saga = [
    { ch: [1], eff: [mkE(MOOGLE, 2)] },
    { ch: [2, 3], eff: [fn((G, X) => {
      (X.P.turnTrigs = (X.P.turnTrigs || []).filter((x) => x.turn >= G.turn)).push({ turn: G.turn, src: X.src, t: T('cast', { you: true, cond: (GG, s, ev) => !!ev.card && !ev.card.def.types.includes('Creature'), run: (GG, XX) => {
        const ts = XX.P.bf.filter((c) => c.token && !hasSub(c, 'Saga'));
        const c = pickOne(GG, XX.P, ts, 'Copy which token?', (x) => cv(x) + (isCreature(x) ? 1 : 0));
        if (c) copyToken(GG, XX.P, c);
      } }) });
    }, { score: () => 0.6 })] },
    { ch: [4], eff: [fn((G, X) => { for (const c of X.P.bf.filter((x) => x !== X.src && isCreature(x) && hasSub(x, 'Moogle'))) addCounters(G, c, 2); }, { score: (G, P) => P.bf.filter((x) => isCreature(x) && hasSub(x, 'Moogle')).length * 1.6 })] },
  ];
  return d;
};
S['Summon: Ixion'] = (d) => {
  d.saga = [
    { ch: [1], eff: [fn((G, X, t) => { if (t && t.c) exileUntil(G, X.P, X.src, t.c); }, { tgt: { f: { side: 'opp' } }, val: (G, P, c) => pv(G, c) + 0.5, label: 'Exile a creature an opponent controls until Ixion leaves' })] },
    { ch: [2, 3], eff: [fn((G, X) => { for (const c of pickSome(G, X.P, X.P.bf.filter(isCreature), 0, 2, 'Up to two creatures get a +1/+1 counter', (x) => cv(x))) addCounters(G, c, 1); gain(G, X.P, 2); }, { score: (G, P) => 1 + Math.min(2, count(P, isCreature)) * 0.9 })] },
  ];
  d.role = 'removal';
  return holdUntilLeaves(d);
};
S['Summon: Yojimbo'] = (d) => {
  d.saga = [
    { ch: [1], eff: [{ k: 'exileP', tgt: { f: { side: 'opp', types: ['Artifact', 'Enchantment', 'Creature'], fn: (G, c) => !isCreature(c) || c.tapped } } }] },
    { ch: [2, 3], eff: [fn((G, X) => { X.src.mem.taxUntil = untilMyNextEnd(G, X.P) - 1; say(G, X.P, `Until ${X.P.name}'s next turn, attacking them costs {2} for each creature.`); }, { score: () => 1 })] },
    { ch: [4], eff: [fn((G, X) => { if (X.O.bf.some((c) => isCreature(c) && pow(c) >= 4)) treasure(G, X.P, 1); }, { score: () => 0.5 })] },
  ];
  d.attackTax = (G, src) => ((src.mem.taxUntil || 0) >= G.turn ? 2 : 0);
  return d;
};
S["Summoner's Sending"] = (d) => {
  d.trig.push(T('endStep', { you: true, cond: (G, src, ev) => ev.nth === 1 && gyCreatures(G).length > 0, run: (G, X) => {
    const cs = gyCreatures(G);
    const c = isHuman(G, X.P) ? pickSome(G, X.P, cs, 0, 1, 'Exile a creature card from a graveyard?', (x) => x.def.value, 'graveyard')[0] : cs.slice().sort((a, b) => (a.owner === X.P.i ? 1 : 0) - (b.owner === X.P.i ? 1 : 0) || b.def.value - a.def.value)[0];
    if (!c) return;
    const Q = G.players[c.owner];
    Q.gy.splice(Q.gy.indexOf(c), 1); Q.exile.push(c);
    emit(G, 'exile', `${c.def.name} is exiled from ${Q.name}'s graveyard.`, { who: X.P.i, cards: [c.id] });
    const [sp] = mk(G, X.P, SPIRIT, 1);
    if (sp && c.def.mv >= 4) addCounters(G, sp, 1);
  } }));
  d.role = 'value';
  return d;
};
S['Sun Titan'] = (d) => {
  const back = fn((G, X, t) => { const c = t && t.c; if (c && X.P.gy.includes(c)) reanimate(G, X.P, c); }, { tgt: { what: 'gy', mine: true, f: { types: ['any'], fn: (G, c) => L.isPermanentSpell(c.def) || isLand(c) ? c.def.mv <= 3 : false } }, min: 0, val: (G, P, c) => c.def.value, label: 'Return a permanent card with mana value 3 or less' });
  d.etb = [back];
  d.trig.push(T('attack', { self: true, eff: [back] }));
  return d;
};
S['Sunscorch Regent'] = (d) => { d.trig.push(T('cast', { opp: true, run: (G, X) => { addCounters(G, X.src, 1); gain(G, X.P, 1); } })); return d; };
S['Tataru Taru'] = (d) => {
  d.etb = [fn((G, X) => { drawN(G, X.P, 1); const want = isHuman(G, X.O) ? yesNo(G, X.O, X.src, 'Tataru Taru: draw a card?', true) : true; if (want) drawN(G, X.O, 1); }, { score: () => 0.6 })];
  d.trig.push(T('draw', { opp: true, once: true, cond: (G, src, ev) => G.active !== ev.P.i, run: (G, X) => treasure(G, X.P, 1, { tapped: true }) }));
  return d;
};
S['Thancred Waters'] = (d) => {
  d.etb = [fn((G, X, t) => { const c = t && t.c; if (!c || !onBf(G, c)) return; c.mem.thancred = X.src.id; dirty(G); say(G, X.P, `${c.def.name} is indestructible for as long as ${X.P.name} controls ${X.src.def.name}.`, [c.id]); },
    { tgt: { f: { types: ['any'], side: 'you', other: true, legendary: true } }, val: (G, P, c) => pv(G, c), label: 'Another legendary permanent you control gains indestructible' })];
  d.statics.push({ who: 'all', f: { types: ['any'], side: 'you', fn: (G, c, P, src) => c.mem && c.mem.thancred === src.id }, p: 0, t: 0, kw: ['indestructible'] });
  d.trig.push(T('cast', { you: true, cond: (G, src, ev) => !!ev.card && !ev.card.def.types.includes('Creature'), run: (G, X) => grantKw(G, X.src, ['indestructible']) }));
  return d;
};
S['Together Forever'] = (d) => {
  d.etb = [support(2)];
  d.acts.push({ cost: { m: C('{1}') }, label: 'When a creature with a counter on it dies this turn, return it to its owner\'s hand', when: ['blocks'],
    eff: [fn((G, X, t) => { const c = t && t.c; if (!c || !onBf(G, c)) return; if (X.src.mem.saveTurn !== G.turn) { X.src.mem.saveTurn = G.turn; X.src.mem.save = []; } X.src.mem.save.push(c.id); },
      { tgt: { f: { side: 'you', fn: (G, c) => hasCtrs(c) } }, val: (G, P, c) => (doomed(G, c) ? cv(c) : -1), label: 'Choose a creature with a counter on it' })],
    ai: (G, P, c) => (P.bf.some((x) => isCreature(x) && hasCtrs(x) && doomed(G, x) && !(c.mem.saveTurn === G.turn && (c.mem.save || []).includes(x.id))) ? { score: 1.5 } : null) });
  // "When that creature dies this turn, return that card to its owner's hand"
  d.trig.push(T('die', { cond: (G, src, ev) => src.mem.saveTurn === G.turn && (src.mem.save || []).includes(ev.c.id), run: (G, X) => {
    const c = X.ev.c, O = G.players[c.owner];
    if (!O.gy.includes(c)) return;
    O.gy.splice(O.gy.indexOf(c), 1); O.hand.push(c); dirty(G);
    emit(G, 'raise', `${c.def.name} returns to ${O.name}'s hand.`, { who: X.P.i, cards: [c.id] });
  } }));
  return d;
};
S['Ultimate Magic: Holy'] = (d) => {
  d.spell = [fn((G, X) => {
    for (const c of X.P.bf) if (!c.tkw.includes('indestructible')) c.tkw.push('indestructible');
    dirty(G);
    emit(G, 'pump', `${X.P.name}'s permanents gain indestructible until end of turn.`, { who: X.P.i });
    if (fromExile(X)) { X.P.youSafeTurn = G.turn; emit(G, 'fog', `Damage to ${X.P.name} is prevented this turn.`, { who: X.P.i }); }
  }, { score: (G, P) => 0.3 })];
  d.respond = { counter: false, legal: (G, O, item) => item.P !== O,
    ai: (G, O, item) => { const eff = L.spellEffects(item.card.def, item.mode); const mine = L.allTargets(item.targets).filter((t) => t.c && t.c.ctrl === O.i); return eff.some((e) => ['destroyAll', 'wrath', 'dmgAll'].includes(e.k)) || item.card.def.role === 'sweeper' ? O.bf.filter((c) => !isLand(c)).reduce((s, c) => s + pv(G, c), 0) : mine.length ? Math.max(...mine.map((t) => pv(G, t.c))) : 0; },
    res: (G, O) => { for (const c of O.bf) if (!c.tkw.includes('indestructible')) c.tkw.push('indestructible'); dirty(G); emit(G, 'pump', `${O.name}'s permanents gain indestructible until end of turn.`, { who: O.i }); return false; } };
  d.respondOnly = true;
  d.role = 'trick';
  return foretell(d, '{2}{W}');
};
S['Unfinished Business'] = (d) => {
  d.spell = [fn((G, X, t) => {
    const c = t && t.c, P = X.P;
    if (!c || !reanimate(G, P, c) || !onBf(G, c)) return;
    const gear = P.gy.filter((x) => x.def.sub.includes('Aura') || x.def.sub.includes('Equipment'));
    for (const g of pickSome(G, P, gear, 0, 2, 'Return up to two Auras and/or Equipment attached to it', (x) => x.def.value, 'graveyard')) { P.gy.splice(P.gy.indexOf(g), 1); enterBattlefield(G, P, g, null, { attachTo: c }); }
  }, { tgt: { what: 'gy', mine: true, f: { types: ['Creature'] } }, val: (G, P, c) => c.def.value, label: 'Return a creature card from your graveyard to the battlefield' })];
  d.castIf = (G, P) => P.gy.some((c) => c.def.types.includes('Creature'));
  return d;
};
S['Cyan, Vengeful Samurai'] = (d) => {
  d.costMod = (G, P) => P.gy.filter((c) => c.def.types.includes('Creature')).length;
  d.trig.push(T('leaveGy', { you: true, cond: (G, src, ev) => !!ev.card && ev.card.def.types.includes('Creature'), run: (G, X) => addCounters(G, X.src, 1) }));
  return d;
};

/* ============================================================ Blue */
S['Alphinaud Leveilleur'] = (d) => { d.trig.push(T('cast', { you: true, cond: (G, src, ev) => ev.nth === 2, eff: [{ k: 'draw', n: 1 }] })); return d; };
S["An Offer You Can't Refuse"] = (d) => {
  d.spell = [{ k: 'counter', what: 'noncreature spell' }];
  d.respondOnly = true;
  d.respond = { counter: true, legal: (G, O, item) => item.P !== O && !item.card.def.types.includes('Creature'),
    ai: (G, O, item) => L.threatOf(G, O, item) - 1.2, res: (G, O, item) => { const P = item.P; L.finishCountered(G, item); treasure(G, P, 2); return true; } };
  d.role = 'counter';
  return d;
};
S['Archmage Emeritus'] = (d) => { d.trig.push(T('cast', { you: true, cond: (G, src, ev) => !!ev.card && isIS(ev.card.def), eff: [{ k: 'draw', n: 1 }] })); return d; };
S['Chasm Skulker'] = (d) => {
  d.trig.push(T('draw', { you: true, run: (G, X) => addCounters(G, X.src, 1, '+1/+1', true) }));
  d.trig.push(T('die', { self: true, run: (G, X) => mk(G, X.P, SQUID, Math.max(0, X.ev.cnt || 0)) }));
  return d;
};
S['Dig Through Time'] = (d) => { d.spell = [fn((G, X) => lookTake(G, X.P, 7, () => true, 2, 'Put two into your hand'), { score: () => 3 })]; d.role = 'draw'; return delve(d); };
S['Hermes, Overseer of Elpis'] = (d) => {
  d.trig.push(T('cast', { you: true, cond: (G, src, ev) => !!ev.card && !ev.card.def.types.includes('Creature'), eff: [mkE(BIRD_V, 1)] }));
  d.trig.push(T('attacks', { you: true, cond: (G, src, ev) => ev.cs.some((c) => hasSub(c, 'Bird')), eff: [{ k: 'scry', n: 2 }] }));
  return d;
};
S['Hraesvelgr of the First Brood'] = (d) => {
  const aid = fn((G, X, t) => { const c = t && t.c; if (c && onBf(G, c)) { pump(G, c, 1, 0); unblockable(G, c); } }, { tgt: { f: {} }, val: (G, P, c) => (c.ctrl === P.i && !c.tapped && (!c.sick || has(c, 'haste')) && G.active === P.i ? 1 + pow(c) * 0.3 : -0.5), label: "A creature gets +1/+0 and can't be blocked this turn" });
  d.etb = [aid];
  d.trig.push(T('cast', { you: true, cond: (G, src, ev) => !!ev.card && !ev.card.def.types.includes('Creature'), eff: [aid] }));
  return d;
};
S['Inexorable Tide'] = (d) => { d.trig.push(T('cast', { you: true, run: (G, X) => proliferate(G, X.P) })); d.role = 'value'; return d; };
S['Into the Story'] = (d) => { d.costMod = (G, P) => (other(G, P).gy.length >= 7 ? 3 : 0); d.spell = [{ k: 'draw', n: 4 }]; d.role = 'draw'; return d; };
S['Lulu, Stern Guardian'] = (d) => {
  d.trig.push(T('attacks', { opp: true, eff: [{ k: 'ctrs', n: 1, kind: 'stun', tgt: { f: { attacking: true } } }] }));
  d.acts.push({ cost: { m: C('{3}{U}') }, label: 'Proliferate', when: ['end'], run: (G, X) => proliferate(G, X.P), ai: (G, P) => (P.bf.some((c) => c.cnt > 0) ? { score: 1 } : null) });
  return d;
};
S["O'aka, Traveling Merchant"] = (d) => {
  d.acts.push({ cost: { tap: true }, label: 'Remove a counter from a nonland permanent you control: draw a card', when: ['end'], cond: (G, P) => P.bf.some((c) => !isLand(c) && hasCtrs(c)),
    run: (G, X) => { const cs = X.P.bf.filter((c) => !isLand(c) && hasCtrs(c)); const c = pickOne(G, X.P, cs, 'Remove a counter from which permanent?', (x) => (!isCreature(x) ? 2 : -cv(x))); if (!c) return; if (c.cnt > 0) removeCounters(G, c, '+1/+1', 1); else { const k = Object.keys(c.ctr).find((x) => c.ctr[x] > 0); if (k) removeCounters(G, c, k, 1); } dirty(G); drawN(G, X.P, 1); },
    ai: (G, P) => (P.bf.some((c) => !isLand(c) && hasCtrs(c) && (!isCreature(c) || c.cnt >= 2 || ctrCount(c, 'stun'))) ? { score: 1.1 } : null) });
  return d;
};
S['Observed Stasis'] = (d) => {
  d.aura = { f: { side: 'opp' } };
  d.etb = [fn((G, X) => {
    const h = X.src.att != null ? byId(G, X.src.att) : null;
    if (!h) return;
    if (h.attacking) { h.attacking = false; h.blocked = false; if (G.combat) G.combat.attackers = G.combat.attackers.filter((c) => c !== h); }
    h.blocking = 0;
    drawN(G, X.P, G.players[h.ctrl].bf.filter((c) => isCreature(c) && c.tapped).length);
  }, { score: () => 1 })];
  d.statics = d.statics.filter((x) => x.who !== 'enchanted');
  d.statics.push({ who: 'enchanted', p: 0, t: 0, kw: [], flags: { noAbil: true, cantAttack: true, cantBlock: true } });
  d.auraVal = (G, P, c) => (c.ctrl === P.i ? -10 : pv(G, c) + 0.5);
  d.role = 'removal';
  return d;
};
S['Pull from Tomorrow'] = (d) => { d.spell = [fn((G, X) => { drawN(G, X.P, X.x || 0); discardE(G, X.P, 1); }, { score: (G, P, X) => ((X && X.x) || 0) * 0.9 - 0.5 })]; d.aiX = (G, P, card, max) => (max >= 3 ? max : null); d.role = 'draw'; return d; };
S['Rikku, Resourceful Guardian'] = (d) => {
  d.trig.push(T('counters', { cond: (G, src, ev, Q) => isCreature(ev.c) && G.active === Q.i && ev.c.ctrl === Q.i && GOOD(ev.kind), run: (G, X) => { const c = X.ev.c; if (onBf(G, c)) c.tf.unblockable = true; } }));
  d.acts.push({ cost: { m: C('{1}'), tap: true }, sorcery: true, label: 'Move a counter from a creature an opponent controls onto a creature you control', when: ['main1'],
    eff: [fn((G, X, t) => { const a = t && t.c, b = t && t.c2; if (!a || !b || !onBf(G, a) || !onBf(G, b)) return; const k = a.cnt > 0 ? '+1/+1' : Object.keys(a.ctr).find((x) => a.ctr[x] > 0); if (!k) return; removeCounters(G, a, k, 1); addCounters(G, b, 1, k); },
      { tgt: { pair: true, fa: { side: 'opp', fn: (G, c) => hasCtrs(c) }, fb: YOU, labels: ['Take a counter from', 'and put it onto'] }, pairVal: (G, P, a, b) => (a.cnt > 0 ? 1.2 : 0.2) + (b.tapped ? 0 : 0.3), label: 'Steal a counter' })],
    ai: (G, P) => (other(G, P).bf.some((c) => isCreature(c) && c.cnt > 0) ? { score: 1.3 } : null) });
  return d;
};
const GOOD = (k) => !['stun', '-1/-1', 'finality'].includes(k);
S['Rite of Replication'] = (d) => {
  const copy = (n) => [fn((G, X, t) => { const c = t && t.c; if (!c || !onBf(G, c)) return; for (let k = 0; k < n; k++) copyToken(G, X.P, c); }, { tgt: { f: {} }, val: (G, P, c) => cv(c) * n * 0.8 + (c.def.etb.length ? 1 : 0), label: 'Copy a creature' })];
  return kicker(d, '{5}', { label: 'Create a token copy of a creature', eff: copy(1) }, { label: 'Create five token copies', eff: copy(5) });
};
S['Sublime Epiphany'] = (d) => {
  const bounce = { k: 'bounceP', tgt: { f: { types: ['nonland'] } } };
  const copyMine = fn((G, X, t) => { const c = t && t.c; if (c && onBf(G, c)) copyToken(G, X.P, c); }, { tgt: { f: { side: 'you' } }, val: (G, P, c) => cv(c) * 0.9, label: 'Copy a creature you control' });
  d.modes = [
    { label: 'Bounce a nonland permanent, copy a creature you control, and draw a card', eff: [bounce, copyMine, { k: 'draw', n: 1 }] },
    { label: 'Bounce a nonland permanent and draw a card', eff: [bounce, { k: 'draw', n: 1 }] },
  ];
  d.spell = null;
  // As an answer: counter the spell, bounce something of theirs, copy your best creature and draw
  d.respond = { counter: true, legal: (G, O, item) => item.P !== O, ai: (G, O, item) => L.threatOf(G, O, item) + 1,
    res: (G, O, item) => {
      const P = item.P;
      L.finishCountered(G, item);
      const t = P.bf.filter((c) => !isLand(c) && (!isCreature(c) || targetOk(G, O, {}, c))).sort((a, b) => pv(G, b) - pv(G, a))[0];
      if (t) bounceCard(G, O, t);
      const mine = O.bf.filter(isCreature).sort((a, b) => cv(b) - cv(a))[0];
      if (mine) copyToken(G, O, mine);
      drawN(G, O, 1);
      return true;
    } };
  d.role = 'counter';
  return d;
};
S['Summon: Valefor'] = (d) => {
  d.saga = [
    { ch: [1], eff: [fn((G, X) => { const cs = X.O.bf.filter(isCreature); if (!cs.length) return; const top = Math.max(...cs.map((c) => c.def.mv)); const c = pickOne(G, X.O, cs.filter((x) => x.def.mv === top), 'Return which creature?', (x) => -cv(x)); if (c) bounceCard(G, X.P, c); }, { score: (G, P) => (other(G, P).bf.some(isCreature) ? 2 : 0) })] },
    { ch: [2, 3, 4], eff: [{ k: 'tapP', stun: true, tgt: { f: { side: 'opp' }, min: 0 } }] },
  ];
  return d;
};
S['Torrential Gearhulk'] = (d) => {
  d.etb = [fn((G, X, t) => { const c = t && t.c; if (!c || !X.P.gy.includes(c)) return; c.fbExile = true; if (!castNow(G, X.P, c, { free: true })) c.fbExile = false; },
    { tgt: { what: 'gy', mine: true, f: { types: ['Instant'] } }, min: 0, val: (G, P, c) => c.def.value, label: 'Cast an instant card from your graveyard for free' })];
  return d;
};

/* ============================================================ Black */
S['Archfiend of Depravity'] = (d) => {
  d.trig.push(T('endStep', { opp: true, cond: (G, src, ev) => ev.nth === 1, run: (G, X) => {
    const O = X.ev.P, cs = O.bf.filter(isCreature);
    if (cs.length <= 2) return;
    const keep = isHuman(G, O) ? pickSome(G, O, cs, Math.min(2, cs.length), 2, 'Choose up to two creatures to keep', (c) => cv(c)) : cs.slice().sort((a, b) => cv(b) - cv(a)).slice(0, 2);
    const gone = cs.filter((c) => !keep.includes(c));
    for (const c of gone) if (onBf(G, c)) sacrifice(G, O, c, true);
    emit(G, 'sac', `${O.name} keeps ${nameList(keep)} and sacrifices the rest.`, { who: O.i, cards: gone.map((c) => c.id) });
  } }));
  return d;
};
S['Bastion of Remembrance'] = (d) => {
  d.etb = [mkE(HUMAN_SOLDIER, 1)];
  d.trig.push(T('die', { you: true, run: (G, X) => { loseLife(G, X.O, 1, X.P.i); gain(G, X.P, 1); } }));
  d.role = 'value';
  return d;
};
S['Espers to Magicite'] = (d) => {
  d.spell = [fn((G, X) => {
    const O = X.O, cs = O.gy.slice();
    for (const c of cs) { O.gy.splice(O.gy.indexOf(c), 1); O.exile.push(c); }
    dirty(G);
    if (cs.length) emit(G, 'exile', `${O.name}'s graveyard (${cs.length}) is exiled.`, { who: X.P.i });
    const cre = cs.filter((c) => c.def.types.includes('Creature'));
    const c = pickOne(G, X.P, cre, 'Make an artifact token copy of a creature card exiled this way', (x) => x.def.value, 'choose', 'exile');
    if (c) copyToken(G, X.P, c.def, { def: { types: ['Artifact'], name: c.def.name } });
  }, { score: (G, P) => other(G, P).gy.length * 0.15 + Math.max(0, ...other(G, P).gy.filter((c) => c.def.types.includes('Creature')).map((c) => c.def.value * 0.3)) })];
  return d;
};
S['Exsanguinate'] = (d) => { d.spell = [fn((G, X) => { const n = Math.min(X.x || 0, Math.max(0, X.O.life)); loseLife(G, X.O, X.x || 0, X.P.i); gain(G, X.P, n); }, { score: (G, P, X) => ((X && X.x) || 0) * 0.9 })]; d.aiX = (G, P, card, max) => (max >= 4 || max >= other(G, P).life ? max : null); d.role = 'burn'; return d; };
S['Fandaniel, Telophoroi Ascian'] = (d) => {
  d.trig.push(T('cast', { you: true, cond: (G, src, ev) => !!ev.card && isIS(ev.card.def), run: (G, X) => surveil(G, X.P, 1) }));
  d.trig.push(T('endStep', { you: true, cond: (G, src, ev) => ev.nth === 1, run: (G, X) => {
    const O = X.O, n = 2 * X.P.gy.filter((c) => isIS(c.def)).length;
    const cs = O.bf.filter((c) => isCreature(c) && !c.token);
    const sac = cs.length && (isHuman(G, O) ? yesNo(G, O, X.src, `Sacrifice a nontoken creature, or lose ${n} life?`, n >= 4) : n >= Math.min(...cs.map((c) => cv(c))) * 1.5 || n >= O.life);
    if (sac) edictOf(G, O, (c) => isCreature(c) && !c.token, X.src.def.name);
    else loseLife(G, O, n, X.P.i);
  } }));
  return d;
};
S["Interceptor, Shadow's Hound"] = (d) => {
  d.statics.push({ who: 'all', f: { side: 'you', sub: 'Assassin' }, p: 0, t: 0, kw: ['menace'] });
  d.gyTrig = [T('attacks', { you: true, cond: (G, src, ev, Q) => ev.cs.some(isLegendary) && canPay(Q, C('{2}{B}')), run: (G, X) => {
    const want = isHuman(G, X.P) ? yesNo(G, X.P, X.src, "Pay {2}{B} to return Interceptor, Shadow's Hound tapped and attacking?", true) : true;
    if (!want || !X.P.gy.includes(X.src) || !pay(X.P, C('{2}{B}'))) return;
    emit(G, 'raise', `${X.src.def.name} returns, tapped and attacking.`, { who: X.P.i, cards: [X.src.id] });
    putOntoBattlefield(G, X.P, X.src, { tapped: true, attacking: true });
  } })];
  return d;
};
S['Morbid Opportunist'] = (d) => { d.trig.push(T('die', { other: true, once: true, eff: [{ k: 'draw', n: 1 }] })); return d; };
S['Murderous Rider'] = (d) => {
  d.trig.push(T('die', { self: true, run: (G, X) => { const c = X.ev.c, O = G.players[c.owner]; if (!O.gy.includes(c)) return; O.gy.splice(O.gy.indexOf(c), 1); O.library.unshift(c); dirty(G); emit(G, 'info', `${c.def.name} goes to the bottom of ${O.name}'s library.`, { who: O.i }); } }));
  if (d.adv) { d.adv.spell = [{ k: 'destroyP', tgt: { f: { types: ['Creature', 'Planeswalker'] } } }, fn((G, X) => loseLife(G, X.P, 2), { score: () => -0.5 })]; d.adv.role = 'removal'; }
  return d;
};
S['Pitiless Plunderer'] = (d) => { d.trig.push(T('die', { you: true, other: true, run: (G, X) => treasure(G, X.P) })); return d; };
S['Priest of Fell Rites'] = (d) => {
  d.acts.push({ cost: { tap: true, life: 3, sacSelf: true }, sorcery: true, label: 'Return a creature card from your graveyard to the battlefield', when: ['main1'],
    eff: [{ k: 'regrow', to: 'bf', tgt: { what: 'gy', mine: true, f: { types: ['Creature'] } } }],
    ai: (G, P, c) => (P.life > 10 && P.gy.some((x) => x !== c && x.def.types.includes('Creature') && x.def.value >= 3.5) ? { score: 2.5 } : null) });
  d.unearth = d.unearth || C('{3}{W}{B}');
  return d;
};
S['Rejoin the Fight'] = (d) => {
  d.spell = [fn((G, X) => {
    mill(G, X.P, 3);
    const cs = X.P.gy.filter((c) => c.def.types.includes('Creature'));
    // The opponent chooses which card comes back
    const c = pickOne(G, X.O, cs, 'Choose a creature card in their graveyard to return', (x) => -x.def.value, 'choose', 'graveyard');
    if (c) reanimate(G, X.P, c);
  }, { score: (G, P) => (P.gy.some((c) => c.def.types.includes('Creature')) ? 2 : 1) })];
  return d;
};
S['Rise of the Dark Realms'] = (d) => { d.spell = [fn((G, X) => { for (const c of gyCreatures(G)) reanimate(G, X.P, c); }, { score: (G) => gyCreatures(G).reduce((s, c) => s + c.def.value, 0) * 0.8 })]; return d; };
S['Sepulchral Primordial'] = (d) => {
  d.etb = [fn((G, X, t) => { const c = t && t.c; if (c && X.O.gy.includes(c)) reanimate(G, X.P, c); }, { tgt: { what: 'gy', f: { types: ['Creature'], fn: (G, c, P) => c.owner !== P.i } }, min: 0, val: (G, P, c) => c.def.value, label: "Put a creature card from the opponent's graveyard onto the battlefield" })];
  return d;
};
S['Siegfried, Famed Swordsman'] = (d) => { d.etb = [fn((G, X) => { mill(G, X.P, 3); addCounters(G, X.src, 2 * X.P.gy.filter((c) => c.def.types.includes('Creature')).length); }, { score: (G, P) => 1 + P.gy.filter((c) => c.def.types.includes('Creature')).length })]; return d; };
S['Snuff Out'] = (d) => {
  const kill = [{ k: 'destroyP', tgt: { f: { fn: (G, c) => !c.def.colors.includes('B') } } }];
  d.modes = [{ label: 'Destroy a nonblack creature', eff: kill }, { label: 'Pay 4 life instead of its mana cost', alt: C('{0}'), eff: kill, cond: (G, P) => P.life > 4 && P.bf.some((c) => isLand(c) && c.def.sub.includes('Swamp')), ai: (G, P) => (P.life > 12 ? 1.5 : -3) }];
  d.spell = null;
  d.onCast = (G, P, item) => { if (item.mode && item.mode.includes(1)) { P.life -= 4; L.noteLoss(G, P, 4); emit(G, 'life', `${P.name} pays 4 life.`, { who: P.i, target: `p${P.i}`, amount: 4 }); } };
  d.role = 'removal';
  return d;
};
S['Stitch Together'] = (d) => {
  d.spell = [fn((G, X, t) => { const c = t && t.c; if (!c || !X.P.gy.includes(c)) return; if (X.P.gy.length >= 7) reanimate(G, X.P, c); else gyToHand(G, X.P, c); },
    { tgt: { what: 'gy', mine: true, f: { types: ['Creature'] } }, val: (G, P, c) => c.def.value, label: 'Return a creature card from your graveyard' })];
  d.castIf = (G, P) => P.gy.some((c) => c.def.types.includes('Creature'));
  return d;
};
S["Stitcher's Supplier"] = (d) => { d.etb = [{ k: 'mill', n: 3, who: 'self' }]; d.dies = [{ k: 'mill', n: 3, who: 'self' }]; return d; };
S['Transpose'] = (d) => {
  const WIZ = tok('Wizard', 0, 1, ['B'], ['Wizard'], [], { text: 'Whenever you cast a noncreature spell, this token deals 1 damage to each opponent.', trig: [T('cast', { you: true, cond: (G, src, ev) => !!ev.card && !ev.card.def.types.includes('Creature'), run: (G, X) => hitOpp(G, X, 1) })] });
  d.spell = [fn((G, X) => { drawN(G, X.P, 1); discardE(G, X.P, 1); loseLife(G, X.P, 1); if (X.item && X.item.zone === 'hand') mk(G, X.P, WIZ, 1); }, { score: () => 1.2 }), rebound()];
  d.role = 'draw';
  return d;
};
S['Shadow, Mysterious Assassin'] = (d) => {
  d.trig.push(T('hitPlayer', { self: true, run: (G, X) => {
    const cs = X.P.bf.filter((c) => c !== X.src && !isLand(c));
    if (!cs.length) return;
    const pick = isHuman(G, X.P) ? pickSome(G, X.P, cs, 0, 1, 'Sacrifice another nonland permanent to draw two?', (c) => -pv(G, c))[0] : cs.filter((c) => c.token || pv(G, c) < 1.2).sort((a, b) => b.def.mv - a.def.mv)[0];
    if (!pick) return;
    const mv = pick.def.mv || 0;
    sacrifice(G, X.P, pick);
    drawN(G, X.P, 2);
    loseLife(G, X.O, mv, X.P.i);
  } }));
  return d;
};

/* ============================================================ Red */
S['Avalanche of Sector 7'] = (d) => {
  d.powFn = (G, c) => count(other(G, G.players[c.ctrl]), isArtifact);
  d.trig.push(T('activated', { opp: true, cond: (G, src, ev) => isArtifact(ev.c), run: (G, X) => hit(G, X, { p: X.ev.P.i }, 1) }));
  return d;
};
S['Combustible Gearhulk'] = (d) => {
  d.etb = [fn((G, X) => {
    const O = X.O;
    const top = X.P.library.slice(-3);
    const risk = top.reduce((s, c) => s + c.def.mv, 0);
    const give = isHuman(G, O) ? yesNo(G, O, X.src, 'Combustible Gearhulk: let them draw three cards (or they mill three and you take damage equal to their total mana value)?', O.life <= 10) : O.life - 9 <= 3 || O.life <= 12;
    if (give) { drawN(G, X.P, 3); return; }
    const ms = mill(G, X.P, 3);
    const n = ms.reduce((s, c) => s + (c.def.mv || 0), 0);
    if (n) hitOpp(G, X, n);
    void risk;
  }, { score: () => 2.5 })];
  return d;
};
S['Flayer of the Hatebound'] = (d) => {
  d.trig.push(T('enter', { you: true, cond: (G, src, ev) => isCreature(ev.c) && ev.from === 'gy', eff: [{ k: 'dmgX', nFn: (G, X) => (onBf(G, X.ev.c) ? Math.max(0, pow(X.ev.c)) : 0), tgt: { what: 'any', f: {} } }] }));
  return undying(d);
};
S['Furious Rise'] = (d) => {
  d.trig.push(T('endStep', { you: true, cond: (G, src, ev, Q) => ev.nth === 1 && Q.bf.some((c) => isCreature(c) && pow(c) >= 4), run: (G, X) => {
    const P = X.P;
    P.xcast = P.xcast.filter((x) => !(x.rise === X.src.id));
    const c = P.library.pop();
    if (!c) return;
    P.exile.push(c);
    P.xcast.push({ card: c, until: 1e9, rise: X.src.id });
    dirty(G);
    emit(G, 'exile', `${P.name} exiles ${c.def.name} (Furious Rise) and may play it.`, { who: P.i, cards: [c.id] });
  } }));
  d.role = 'draw';
  return d;
};
S['Gau, Feral Youth'] = (d) => {
  d.trig.push(T('attack', { self: true, run: (G, X) => addCounters(G, X.src, 1) }));
  d.trig.push(T('leaveGy', { you: true, run: (G, X) => { X.P.gyLeftTurn = G.turn; } }));
  d.trig.push(T('endStep', { cond: (G, src, ev, Q) => ev.nth === 1 && Q.gyLeftTurn === G.turn, run: (G, X) => hitOpp(G, X, Math.max(0, pow(X.src))) }));
  return d;
};
S['Gogo, Mysterious Mime'] = (d) => {
  d.trig.push(T('combatStart', { you: true, run: (G, X) => {
    const cs = X.P.bf.filter((c) => c !== X.src && isCreature(c));
    if (!cs.length) return;
    const c = isHuman(G, X.P) ? pickSome(G, X.P, cs, 0, 1, 'Gogo becomes a copy of which creature?', (x) => cv(x))[0] : cs.filter((x) => cv(x) > cv(X.src) + 1).sort((a, b) => cv(b) - cv(a))[0];
    if (!c) return;
    becomeCopy(G, X.src, Object.assign({}, c.def, { name: X.src.def.name }), null, { untilEnd: true });
    for (const k of [X.src, c]) { pump(G, k, 2, 0, ['haste']); k.tf.mustAttack = true; }
  } }));
  return d;
};
S['Hellkite Tyrant'] = (d) => {
  d.trig.push(T('hitPlayer', { self: true, run: (G, X) => { for (const c of X.ev.Q.bf.filter(isArtifact)) gainControl(G, X.P, c, 'perm'); } }));
  d.trig.push(T('upkeep', { you: true, cond: (G, src, ev, Q) => count(Q, isArtifact) >= 20, run: (G, X) => { X.O.loseNow = true; X.O.loseWhy = 'Hellkite Tyrant: twenty artifacts'; L.emit(G, 'info', `${X.P.name} controls twenty artifacts and wins the game.`, { who: X.P.i }); } }));
  return d;
};
S['Professional Face-Breaker'] = (d) => {
  d.trig.push(T('combatDamagedYou', { opp: true, run: (G, X) => treasure(G, X.P) }));
  d.acts.push({ cost: { sac: { f: { types: ['Artifact'], sub: 'Treasure' }, label: 'Sacrifice a Treasure' } }, label: 'Exile the top card of your library; you may play it this turn', when: ['main1', 'main2'],
    run: (G, X) => impulse(G, X.P, G.turn), ai: (G, P) => (P.bf.filter((c) => hasSub(c, 'Treasure')).length >= 2 && G.active === P.i ? { score: 1.1 } : null) });
  return d;
};
S['Ruin Grinder'] = (d) => {
  d.dies = [fn((G, X) => {
    for (const Q of [X.P, X.O]) {
      const want = isHuman(G, Q) ? yesNo(G, Q, X.src, 'Discard your hand and draw seven cards?', Q.hand.length < 4) : Q.hand.length <= 3;
      if (!want) continue;
      const n = Q.hand.length;
      Q.gy.push(...Q.hand.splice(0));
      if (n) emit(G, 'discard', `${Q.name} discards their hand.`, { who: Q.i });
      drawN(G, Q, 7);
    }
  }, { score: () => 1 })];
  d.cycling = C('{2}');
  d.cycleFind = 'Mountain';
  return d;
};
S['Sabin, Master Monk'] = (d) => {
  // Blitz {2}{R}{R}, discard a card: haste, "dies: draw a card", sacrificed at the end step; also from the graveyard
  const blitzRun = (G, P, c) => {
    grantKw(G, c, ['haste']);
    c.mem.blitz = true;
    G.delayed.push({ when: 'end', run: (GG) => { if (onBf(GG, c)) { sacrifice(GG, GG.players[c.ctrl], c); } } });
  };
  d.modes = [{ label: 'Cast normally' }, { label: 'Blitz ({2}{R}{R}, discard a card)', alt: C('{2}{R}{R}'), addCost: { discard: 1 }, ai: (G, P) => (P.hand.filter((x) => isLand(x)).length >= 2 ? 1 : -0.5) }];
  d.spell = null;
  d.etb = [fn((G, X) => { if (X.item && X.item.mode && X.item.mode.includes(1)) blitzRun(G, X.P, X.src); }, { score: () => 0 })];
  d.trig.push(T('leave', { self: true, cond: (G, src, ev) => !!(ev.mem && ev.mem.blitz) && ev.to === 'gy', eff: [{ k: 'draw', n: 1 }] }));
  d.gyActs = [{ cost: { m: C('{2}{R}{R}'), discard: 1 }, sorcery: true, label: 'Blitz from your graveyard', when: ['main1'],
    run: (G, X) => { if (!X.P.gy.includes(X.src)) return; emit(G, 'enter', `${X.P.name} blitzes ${X.src.def.name} from the graveyard.`, { who: X.P.i, cards: [X.src.id] }); putOntoBattlefield(G, X.P, X.src); blitzRun(G, X.P, X.src); },
    ai: (G, P) => (P.hand.some(isLand) && other(G, P).bf.filter(isCreature).length <= 2 ? { score: 2 } : null) }];
  return d;
};
S['Snort'] = (d) => {
  d.spell = [fn((G, X) => {
    const did = [];
    for (const Q of [X.P, X.O]) {
      const want = isHuman(G, Q) ? yesNo(G, Q, X.src, 'Discard your hand and draw five cards?', Q.hand.length < 3) : Q === X.P ? Q.hand.length <= 3 : Q.hand.length <= 1 && Q.life > 10;
      if (!want) continue;
      const n = Q.hand.length;
      Q.gy.push(...Q.hand.splice(0));
      if (n) emit(G, 'discard', `${Q.name} discards their hand.`, { who: Q.i });
      drawN(G, Q, 5);
      did.push(Q);
    }
    if (did.includes(X.O)) hitOpp(G, X, 5);
  }, { score: (G, P) => Math.max(0.5, 5 - P.hand.length) * 0.6 })];
  d.flashback = C('{5}{R}');
  d.role = 'draw';
  return d;
};
S['Strago and Relm'] = (d) => {
  d.acts.push({ cost: { m: C('{2}{R}'), tap: true }, sorcery: true, label: "Exile from the top of the opponent's library until an instant, sorcery, or creature card; cast it for free", when: ['main1'],
    run: (G, X) => {
      const O = X.O;
      const [hitC, rest] = revealTil(G, O, (c) => isIS(c.def) || c.def.types.includes('Creature'));
      const all = rest.concat(hitC ? [hitC] : []);
      for (const c of all) O.exile.push(c);
      if (all.length) emit(G, 'exile', `${O.name} exiles ${nameList(all)}.`, { who: X.P.i, cards: all.map((c) => c.id) });
      if (!hitC) return;
      X.P.xcast.push({ card: hitC, until: G.turn, free: true });
      const cre = hitC.def.types.includes('Creature');
      const ok = castNow(G, X.P, hitC, { free: true });
      X.P.xcast = X.P.xcast.filter((x) => x.card !== hitC);
      if (ok && cre && onBf(G, hitC)) { grantKw(G, hitC, ['haste']); G.delayed.push({ when: 'end', run: (GG) => { if (onBf(GG, hitC)) sacrifice(GG, GG.players[hitC.ctrl], hitC); } }); }
    }, ai: () => ({ score: 2.2 }) });
  return d;
};
S['Umaro, Raging Yeti'] = (d) => {
  d.trig.push(T('combatStart', { you: true, run: (G, X) => {
    const k = G.rng.int(3);
    if (k === 0) { for (const c of X.P.bf.filter((x) => x !== X.src && isCreature(x))) { c.tp += 3; if (!c.tkw.includes('trample')) c.tkw.push('trample'); } dirty(G); emit(G, 'pump', `${X.P.name}'s other creatures get +3/+0 and trample until end of turn.`, { who: X.P.i }); }
    else if (k === 1) { const n = X.P.hand.length; X.P.gy.push(...X.P.hand.splice(0)); if (n) emit(G, 'discard', `${X.P.name} discards their hand.`, { who: X.P.i }); drawN(G, X.P, 4); }
    else { const t = L.chooseTargets(G, X.P, [{ k: 'dmg', n: 5, tgt: { what: 'any', f: {} } }], 'trigger', X.src, X); L.resolveWithTargets(G, X.P, X.src, [{ k: 'dmg', n: 5, tgt: { what: 'any', f: {} } }], X, 'trigger', t ? t.targets : null); }
  } }));
  return d;
};
S['Vincent, Vengeful Atoner'] = (d) => { d.trig.push(T('combatDamagedYou', { opp: true, run: (G, X) => addCounters(G, X.src, 1) })); return d; };
S['Cait Sith, Fortune Teller'] = (d) => {
  d.trig.push(T('combatStart', { you: true, run: (G, X) => {
    scryChoice(G, X.P, 1);
    const c = impulse(G, X.P, G.turn, X.src.def.name);
    if (!c) return;
    const t = X.P.bf.filter(isCreature).sort((a, b) => (b.tapped ? -1 : 1) - (a.tapped ? -1 : 1) || pow(b) - pow(a));
    const pick = pickOne(G, X.P, t, `A creature gets +${c.def.mv}/+0`, (x) => (x.tapped ? 0 : pow(x)));
    if (pick && c.def.mv) pump(G, pick, c.def.mv, 0);
  } }));
  return d;
};
S['Yuffie, Materia Hunter'] = (d) => {
  d.etb = [fn((G, X, t) => {
    const c = t && t.c;
    if (c && onBf(G, c)) gainControl(G, X.P, c, 'src', X.src);
    const eqs = X.P.bf.filter((x) => hasSub(x, 'Equipment'));
    const eq = isHuman(G, X.P) ? pickSome(G, X.P, eqs, 0, 1, 'Attach an Equipment to Yuffie?', () => 1)[0] : eqs.find((x) => x.att == null);
    if (eq && onBf(G, X.src)) attach(G, eq, X.src);
  }, { tgt: { f: { types: ['Artifact'], fn: (G, c) => !isCreature(c) }, min: 0 }, val: (G, P, c) => (c.ctrl === P.i ? -1 : pv(G, c) + 0.5), label: 'Gain control of a noncreature artifact' })];
  // Ninjutsu {1}{R}: swap an unblocked attacker back to hand
  d.handActs = [{ cost: { m: C('{1}{R}') }, label: 'Ninjutsu: return an unblocked attacker to hand; Yuffie enters tapped and attacking', when: ['blocks'],
    cond: (G, P) => !!G.combat && G.active === P.i && !!G.combat.blocksDone && G.combat.attackers.some((c) => onBf(G, c) && c.ctrl === P.i && c.attacking && !c.blocked),
    run: (G, X) => {
      const as = G.combat.attackers.filter((c) => onBf(G, c) && c.ctrl === X.P.i && c.attacking && !c.blocked);
      const back = pickOne(G, X.P, as, 'Return which unblocked attacker?', (c) => -cv(c));
      if (!back || !X.P.hand.includes(X.src)) return;
      bounceCard(G, X.P, back);
      X.P.hand.splice(X.P.hand.indexOf(X.src), 1);
      enterBattlefield(G, X.P, X.src, null, { tapped: true });
      X.src.tapped = true; X.src.attacking = true; X.src.blocked = false; X.src.blockedBy = [];
      G.combat.attackers.push(X.src);
    }, ai: (G, P) => (G.combat && G.combat.attackers.some((c) => onBf(G, c) && c.ctrl === P.i && c.attacking && !c.blocked && cv(c) < 2.5) ? { score: 2 } : null) }];
  return d;
};
S['Ultimate Magic: Meteor'] = (d) => {
  d.spell = [{ k: 'dmgAll', n: 7 }, fn((G, X) => {
    if (!fromExile(X)) return;
    const cs = X.O.bf.filter((c) => isArtifact(c) || isLand(c));
    const c = pickOne(G, X.P, cs, 'Destroy an artifact or land they control', (x) => pv(G, x) + (isLand(x) && x.def.mana && x.def.mana.length > 1 ? 1 : 0));
    if (c) destroyPermanent(G, X.P, c);
  }, { score: () => 0.3 })];
  d.role = 'sweeper';
  return foretell(d, '{5}{R}');
};

/* ============================================================ Green */
S['Bane of Progress'] = (d) => {
  d.etb = [fn((G, X) => { const n = destroyEach(G, X.P, allPerms(G).filter((c) => isArtifact(c) || isEnchantment(c))); if (n && onBf(G, X.src)) addCounters(G, X.src, n); }, { score: (G, P) => sweepVal(G, P, (c) => isArtifact(c) || isEnchantment(c)) })];
  return d;
};
S['Bugenhagen, Wise Elder'] = (d) => {
  d.mana = null;
  d.manaAbs = [{ colors: ANY }];
  d.trig.push(T('upkeep', { you: true, cond: (G, src, ev, Q) => Q.bf.some((c) => isCreature(c) && pow(c) >= 7), eff: [{ k: 'draw', n: 1 }] }));
  return d;
};
S['Duskshell Crawler'] = (d) => {
  d.etb = [{ k: 'ctrs', n: 1, tgt: { f: {} } }];
  d.statics.push({ who: 'all', f: { side: 'you', fn: (G, c) => c.cnt > 0 }, p: 0, t: 0, kw: ['trample'] });
  return d;
};
S['Forgotten Ancient'] = (d) => {
  d.trig.push(T('cast', { may: true, mayLabel: 'Put a +1/+1 counter on Forgotten Ancient?', run: (G, X) => addCounters(G, X.src, 1) }));
  // At your upkeep you may move its counters onto other creatures (the AI spreads them when it's threatened)
  d.trig.push(T('upkeep', { you: true, cond: (G, src) => src.cnt > 0, run: (G, X) => {
    const others = X.P.bf.filter((c) => c !== X.src && isCreature(c));
    if (!others.length) return;
    const move = isHuman(G, X.P) ? L.chooseNumber(G, X.P, X.src, 'Move how many +1/+1 counters to another creature?', 0, X.src.cnt, 0) : 0;
    if (!move) return;
    const c = pickOne(G, X.P, others, 'Move them onto which creature?', (x) => cv(x));
    removeCounters(G, X.src, '+1/+1', move);
    addCounters(G, c, move);
  } }));
  return d;
};
S['Generous Patron'] = (d) => {
  d.etb = [support(2)];
  d.trig.push(T('counters', { cond: (G, src, ev, Q) => isCreature(ev.c) && ev.c.ctrl !== Q.i && G.active === Q.i && GOOD(ev.kind), once: true, eff: [{ k: 'draw', n: 1 }] }));
  return d;
};
S['Gyre Sage'] = (d) => { evolve(d); d.mana = null; d.manaAbs = [{ colors: ['G'], amountFn: (G, c) => Math.max(0, c.cnt) }]; return d; };
S['Hardened Scales'] = (d) => { d.plusOnePlus = (G, x, c) => isCreature(c) && c.ctrl === x.ctrl; d.role = 'value'; return d; };
S['Incubation Druid'] = (d) => {
  d.mana = null;
  d.manaAbs = [{ colorsFn: (G, c, P) => { if (!G) return []; const s = new Set(); for (const l of P.bf.filter(isLand)) for (const col of (l.def.mana || []).concat(...(l.def.manaAbs || []).map((ab) => ab.colors || []))) s.add(col); return ['C'].concat(ANY).filter((x) => s.has(x)); }, amountFn: (G, c) => (c.cnt > 0 ? 3 : 1) }];
  d.acts.push(adaptAb('{3}{G}{G}', 3));
  d.role = 'ramp';
  return d;
};
S['Inspiring Call'] = (d) => {
  d.spell = [fn((G, X) => { const cs = X.P.bf.filter((c) => isCreature(c) && c.cnt > 0); drawN(G, X.P, cs.length); for (const c of cs) if (!c.tkw.includes('indestructible')) c.tkw.push('indestructible'); dirty(G); }, { score: (G, P) => P.bf.filter((c) => isCreature(c) && c.cnt > 0).length * 1.1 })];
  d.role = 'draw';
  return d;
};
S["Lifestream's Blessing"] = (d) => {
  d.onCast = (G, P, item) => { item.lifestream = greatestPow(P); };
  d.spell = [fn((G, X) => { const x = X.item && X.item.lifestream != null ? X.item.lifestream : greatestPow(X.P); drawN(G, X.P, x); if (fromExile(X)) gain(G, X.P, 2 * x); }, { score: (G, P) => greatestPow(P) * 0.9 })];
  d.castScore = (G, P) => (greatestPow(P) < 3 ? -3 : 0);
  d.role = 'draw';
  return foretell(d, '{4}{G}');
};
S['Maester Seymour'] = (d) => {
  d.trig.push(T('combatStart', { you: true, eff: [fn((G, X, t) => { const c = t && t.c; if (c && onBf(G, c)) addCounters(G, c, Math.max(0, pow(X.src))); }, { tgt: { f: { side: 'you', other: true } }, val: (G, P, c) => cv(c) * 0.2 + 1, label: 'Put counters on another creature you control' })] }));
  d.acts.push({ cost: { m: C('{3}{G}{G}') }, label: 'Monstrosity X (X = counters among creatures you control)', when: ['end', 'main1'], cond: (G, P, c) => !c.mem.monstrous,
    run: (G, X) => { if (X.src.mem.monstrous) return; X.src.mem.monstrous = true; addCounters(G, X.src, X.P.bf.filter(isCreature).reduce((t, c) => t + ctrKinds(c) * Math.max(1, Math.abs(c.cnt)), 0)); },
    ai: (G, P, c) => (P.bf.filter((x) => isCreature(x) && x.cnt > 0).length >= 2 ? { score: 2 } : null) });
  return d;
};
S['Professor Hojo'] = (d) => {
  d.trig.push(T('targeted', { once: true, cond: (G, src, ev, Q) => !!ev.ability && ev.by === Q && !!ev.c && ev.c.ctrl === Q.i && isCreature(ev.c), eff: [{ k: 'draw', n: 1 }] }));
  return d;
};
S['Rampant Rejuvenator'] = (d) => {
  d.etbCtr = () => ({ '+1/+1': 2 });
  d.trig.push(T('die', { self: true, run: (G, X) => fetchBasic(G, X.P, false, Math.max(0, X.ev.pow || 0)) }));
  return d;
};
S['Sphere Grid'] = (d) => {
  d.trig.push(T('hitPlayer', { you: true, run: (G, X) => { if (onBf(G, X.ev.c)) addCounters(G, X.ev.c, 1); } }));
  d.statics.push({ who: 'all', f: { side: 'you', fn: (G, c) => c.cnt > 0 }, p: 0, t: 0, kw: ['reach', 'trample'] });
  d.role = 'value';
  return d;
};
S['Tireless Tracker'] = (d) => {
  d.trig.push(T('landfall', { you: true, run: (G, X) => investigate(G, X.P, 1) }));
  d.trig.push(T('sac', { you: true, cond: (G, src, ev) => hasSub(ev.c, 'Clue'), run: (G, X) => addCounters(G, X.src, 1) }));
  return d;
};
S["Yuna's Decision"] = (d) => {
  d.modes = [
    { label: 'Sacrifice a creature: draw a card, then put a creature card and/or a land card from your hand onto the battlefield', eff: [fn((G, X) => {
      const P = X.P;
      if (!edictOf(G, P, null, X.src.def.name)) return;
      drawN(G, P, 1);
      for (const pred of [(c) => c.def.types.includes('Creature'), isLand]) {
        const cs = P.hand.filter(pred);
        const c = isHuman(G, P) ? pickSome(G, P, cs, 0, 1, 'Put it onto the battlefield?', (x) => x.def.value, 'hand')[0] : cs.slice().sort((a, b) => b.def.mv - a.def.mv)[0];
        if (c) { emit(G, 'enter', `${P.name} puts ${c.def.name} onto the battlefield.`, { who: P.i, cards: [c.id] }); putOntoBattlefield(G, P, c); }
      }
    }, { score: (G, P) => (P.bf.some(isCreature) && P.hand.some((c) => c.def.types.includes('Creature') && c.def.mv >= 5) ? 4 : -1) })] },
    { label: 'Return one or two permanent cards from your graveyard to your hand', eff: [fn((G, X) => { for (const c of pickSome(G, X.P, X.P.gy.filter((c) => L.isPermanentSpell(c.def) || isLand(c)), 1, 2, 'Return one or two permanent cards', (x) => x.def.value, 'graveyard')) gyToHand(G, X.P, c); }, { score: (G, P) => P.gy.filter((c) => L.isPermanentSpell(c.def)).map((c) => c.def.value).sort((a, b) => b - a).slice(0, 2).reduce((s, v) => s + v * 0.6, 0) })] },
  ];
  d.spell = null;
  return d;
};
S["Yuna's Whistle"] = (d) => {
  d.spell = [fn((G, X) => {
    const P = X.P;
    const [c, rest] = revealTil(G, P, (x) => x.def.types.includes('Creature'));
    toBottom(G, P, rest);
    if (!c) return;
    P.hand.push(c); dirty(G);
    emit(G, 'reveal', `${P.name} reveals ${c.def.name} and puts it into their hand.`, { who: P.i, cards: [c.id] });
    const t = pickOne(G, P, P.bf.filter(isCreature), `Put ${c.def.mv} +1/+1 counters on a creature you control`, (x) => cv(x));
    if (t && c.def.mv) addCounters(G, t, c.def.mv);
  }, { score: (G, P) => 1.5 + (P.bf.some(isCreature) ? 1.5 : 0) })];
  return d;
};
S['Crux of Fate'] = (d) => {
  d.modes = [
    { label: 'Destroy all Dragon creatures', eff: [fn((G, X) => destroyEach(G, X.P, allCreatures(G).filter((c) => hasSub(c, 'Dragon'))), { score: (G, P) => sweepVal(G, P, (c) => isCreature(c) && hasSub(c, 'Dragon')) })] },
    { label: 'Destroy all non-Dragon creatures', eff: [fn((G, X) => destroyEach(G, X.P, allCreatures(G).filter((c) => !hasSub(c, 'Dragon'))), { score: (G, P) => sweepVal(G, P, (c) => isCreature(c) && !hasSub(c, 'Dragon')) })] },
  ];
  d.spell = null;
  d.role = 'sweeper';
  return d;
};
S['Fight Rigging'] = (d) => {
  d.etb = [fn((G, X) => {
    const P = X.P, top = P.library.splice(Math.max(0, P.library.length - 5)).reverse();
    if (!top.length) return;
    const c = pickOne(G, P, top, 'Exile one face down (Hideaway)', (x) => x.def.value + x.def.mv * 0.4, 'look', 'library');
    const rest = top.filter((x) => x !== c);
    G.rng.shuffle(rest); P.library.unshift(...rest);
    P.exile.push(c);
    X.src.mem.hidden = c.id;
    say(G, P, `${P.name} exiles a card face down (hideaway).`);
  }, { score: () => 0.8 })];
  d.trig.push(T('combatStart', { you: true, eff: [{ k: 'ctrs', n: 1, tgt: { f: { side: 'you' } } }, fn((G, X) => {
    const P = X.P;
    if (!P.bf.some((c) => isCreature(c) && pow(c) >= 7)) return;
    const c = P.exile.find((x) => x.id === X.src.mem.hidden);
    if (!c) return;
    X.src.mem.hidden = null;
    if (isLand(c)) { if (P.landsPlayed < L.landLimit(G, P)) L.playLandChoice(G, P, { c, from: 'exile' }); else X.src.mem.hidden = c.id; return; }
    P.xcast.push({ card: c, until: G.turn, free: true });
    if (!castNow(G, P, c, { free: true })) X.src.mem.hidden = c.id;
    P.xcast = P.xcast.filter((x) => x.card !== c);
  }, { score: () => 0 })] }));
  d.role = 'value';
  return d;
};
S['Grateful Apparition'] = (d) => { d.trig.push(T('hitPlayer', { self: true, run: (G, X) => proliferate(G, X.P) })); return d; };
S['Resourceful Defense'] = (d) => {
  d.trig.push(T('leave', { you: true, cond: (G, src, ev) => ev.c !== src && ((ev.cnt || 0) > 0 || Object.values(ev.ctr || {}).some((n) => n > 0)), run: (G, X) => {
    const ts = X.P.bf.filter((c) => c !== X.src);
    const t = pickOne(G, X.P, ts, 'Put those counters on a permanent you control', (c) => (isCreature(c) ? cv(c) : 0));
    if (!t) return;
    if ((X.ev.cnt || 0) > 0) addCounters(G, t, X.ev.cnt);
    for (const [k, n] of Object.entries(X.ev.ctr || {})) if (n > 0) addCounters(G, t, n, k);
  } }));
  d.role = 'value';
  return d;
};
S['Ruinous Ultimatum'] = (d) => { d.spell = [fn((G, X) => destroyEach(G, X.P, X.O.bf.filter((c) => !isLand(c))), { score: (G, P) => other(G, P).bf.filter((c) => !isLand(c)).reduce((s, c) => s + pv(G, c), 0) })]; d.role = 'sweeper'; return d; };
S['Summon: Esper Valigarmanda'] = (d) => {
  d.saga = [
    { ch: [1], eff: [fn((G, X) => {
      for (const Q of [X.P, X.O]) {
        const cs = Q.gy.filter((c) => isIS(c.def));
        const c = pickOne(G, X.P, cs, `Exile an instant or sorcery card from ${Q.name}'s graveyard`, (x) => x.def.value, 'choose', 'graveyard');
        if (!c) continue;
        Q.gy.splice(Q.gy.indexOf(c), 1); Q.exile.push(c);
        X.src.mem.held2 = (X.src.mem.held2 || []).concat(c.id);
        emit(G, 'exile', `${c.def.name} is exiled with ${X.src.def.name}.`, { who: X.P.i, cards: [c.id] });
      }
    }, { score: () => 1 })] },
    { ch: [2, 3, 4], eff: [fn((G, X) => {
      L.addPool(G, X.P, Array(ctrCount(X.src, 'lore')).fill('R'));
      const cs = G.players.flatMap((Q) => Q.exile).filter((c) => (X.src.mem.held2 || []).includes(c.id));
      for (const c of cs) if (!X.P.xcast.some((x) => x.card === c)) X.P.xcast.push({ card: c, until: G.turn, anyType: true, cond: () => true });
    }, { score: () => 1 })] },
  ];
  return d;
};
S['Summon: Kujata'] = (d) => {
  d.saga = [
    { ch: [1], eff: [fn((G, X) => { const cs = X.O.bf.filter((c) => isCreature(c) && targetOk(G, X.P, {}, c, X.src)); for (const c of pickSome(G, X.P, cs, 0, 2, 'Deal 3 damage to up to two creatures', (x) => (tou(x) - x.dmg <= 3 ? cv(x) + 1 : 0.1))) damageCreature(G, c, 3, X.src); }, { score: () => 2 })] },
    { ch: [2], eff: [fn((G, X) => { const cs = X.O.bf.filter(isCreature); for (const c of pickSome(G, X.P, cs, 0, 3, "Up to three creatures can't block this turn", (x) => cv(x))) c.tf.cantBlock = true; dirty(G); }, { score: () => 1 })] },
    { ch: [3], eff: [fn((G, X) => { const before = X.P.gy.slice(); discardE(G, X.P, 1); const gone = X.P.gy.filter((c) => !before.includes(c)); drawN(G, X.P, 2); const mv = gone.reduce((s, c) => s + (c.def.mv || 0), 0); if (mv && onBf(G, X.src)) hitOpp(G, X, mv); }, { score: () => 2 })] },
  ];
  return d;
};
S['Summon: Magus Sisters'] = (d) => {
  const sisters = fn((G, X) => {
    const k = G.rng.int(3);
    const mine = X.P.bf.filter(isCreature);
    if (k === 0) { const c = pickOne(G, X.P, mine, 'Put three +1/+1 counters on a creature', (x) => cv(x)); if (c) addCounters(G, c, 3); }
    else if (k === 1) { const c = pickOne(G, X.P, mine, 'Put a shield counter on a creature', (x) => cv(x)); if (c) addCounters(G, c, 1, 'shield'); gain(G, X.P, 3); }
    else { const cs = X.O.bf.filter((c) => isCreature(c) && targetOk(G, X.P, {}, c, X.src)); const c = pickOne(G, X.P, cs, 'Fight a creature', (x) => L.fightScore(G, X.P, X.src, x)); if (c && onBf(G, X.src) && L.fightScore(G, X.P, X.src, c) > -1) L.fightCards(G, X.P, X.src, c); }
  }, { score: () => 2 });
  d.saga = [{ ch: [1, 2, 3], eff: [sisters] }];
  return d;
};

/* ============================================================ Multicolor */
S['Mesmeric Glare'] = (d) => {
  d.spell = [{ k: 'counter' }];
  d.respondOnly = true;
  d.respond = { counter: true, legal: (G, O, item) => item.P !== O && item.card.def.mv <= 3, ai: (G, O, item) => L.threatOf(G, O, item), res: (G, O, item) => { L.finishCountered(G, item); return true; } };
  d.role = 'counter';
  return d;
};
S['Swift End'] = (d) => { d.spell = [{ k: 'destroyP', tgt: { f: { types: ['Creature', 'Planeswalker'] } } }, fn((G, X) => loseLife(G, X.P, 2), { score: () => -0.5 })]; d.role = 'removal'; return d; };
S['Aerith, Last Ancient'] = (d) => {
  d.trig.push(T('endStep', { you: true, cond: (G, src, ev, Q) => ev.nth === 1 && gained(Q) > 0 && Q.gy.some((c) => c.def.types.includes('Creature')), eff: [fn((G, X, t) => { const c = t && t.c; if (!c || !X.P.gy.includes(c)) return; if (gained(X.P) >= 7) reanimate(G, X.P, c); else gyToHand(G, X.P, c); },
    { tgt: { what: 'gy', mine: true, f: { types: ['Creature'] } }, val: (G, P, c) => c.def.value, label: 'Return a creature card from your graveyard' })] }));
  return d;
};
S['Altered Ego'] = (d) => {
  d.uncounterable = true;
  d.enterAs = (G, P, card, opts) => { cloneAs()(G, P, card, opts); card.etbAdd = { '+1/+1': (opts.item && opts.item.x) || 0 }; };
  d.aiX = (G, P, card, max) => (max >= 0 ? max : null);
  d.castScore = (G) => (allCreatures(G).length ? 0 : -10);
  return d;
};
S['Ardbert, Warrior of Darkness'] = (d) => {
  const grow = (kw) => (G, X) => { for (const c of X.P.bf.filter((x) => isCreature(x) && isLegendary(x))) { addCounters(G, c, 1); grantKw(G, c, [kw]); } };
  d.trig.push(T('cast', { you: true, cond: (G, src, ev) => !!ev.card && ev.card.def.colors.includes('W'), run: grow('vigilance') }));
  d.trig.push(T('cast', { you: true, cond: (G, src, ev) => !!ev.card && ev.card.def.colors.includes('B'), run: grow('menace') }));
  return d;
};
S["Banon, the Returners' Leader"] = (d) => {
  // Pray: once each of your turns, cast a creature card that went to your graveyard this turn from anywhere but the battlefield
  d.gyCast = (G, P, card, src) => G.active === P.i && src.mem.pray !== G.turn && card.def.types.includes('Creature') && !(P.gyStart || []).includes(card.id) && !(G.bfGy || []).includes(card);
  d.trig.push(T('cast', { you: true, cond: (G, src, ev) => ev.zone === 'gycast' && !!ev.card && ev.card.def.types.includes('Creature') && src.mem.pray !== G.turn, run: (G, X) => { X.src.mem.pray = G.turn; } }));
  d.trig.push(T('attacks', { you: true, cond: (G, src, ev, Q) => Q.hand.length > 0 && canPay(Q, genericCost(1)), run: (G, X) => {
    const P = X.P;
    const worst = P.hand.slice().sort((a, b) => L.handValue(G, P, a) - L.handValue(G, P, b))[0];
    const want = isHuman(G, P) ? yesNo(G, P, X.src, 'Pay {1} and discard a card to draw a card?', false) : L.handValue(G, P, worst) < 1;
    if (want && pay(P, genericCost(1))) { discardE(G, P, 1); drawN(G, P, 1); }
  } }));
  return d;
};
S['Barret, Avalanche Leader'] = (d) => {
  d.trig.push(T('enter', { you: true, cond: (G, src, ev) => hasSub(ev.c, 'Equipment'), eff: [mkE(REBEL, 1)] }));
  d.trig.push(T('combatStart', { you: true, run: (G, X) => {
    const eqs = X.P.bf.filter((c) => hasSub(c, 'Equipment')), rebels = X.P.bf.filter((c) => isCreature(c) && hasSub(c, 'Rebel'));
    if (!eqs.length || !rebels.length) return;
    const eq = pickOne(G, X.P, eqs, 'Attach which Equipment?', (c) => (c.att == null ? 2 : 0) + c.def.value);
    const r = pickOne(G, X.P, rebels.filter((c) => c.id !== eq.att), 'to which Rebel?', (c) => (c.tapped ? 0 : 1) + cv(c));
    if (r) attach(G, eq, r);
  } }));
  return d;
};
S['Bred for the Hunt'] = (d) => { d.trig.push(T('hitPlayer', { you: true, cond: (G, src, ev) => !!ev.c && ev.c.cnt > 0, may: true, mayLabel: 'Draw a card?', eff: [{ k: 'draw', n: 1 }] })); d.role = 'draw'; return d; };
S['Bronze Guardian'] = (d) => {
  d.powFn = (G, c) => count(G.players[c.ctrl], isArtifact);
  d.statics.push({ who: 'all', f: { types: ['Artifact'], side: 'you', other: true }, p: 0, t: 0, kw: [], ward: 2 });
  return d;
};
S['Celes, Rune Knight'] = (d) => {
  d.etb = [fn((G, X) => {
    const P = X.P;
    const n = isHuman(G, P) ? L.chooseNumber(G, P, X.src, 'Celes: discard how many cards?', 0, P.hand.length, 0) : P.hand.filter((c) => L.handValue(G, P, c) < 1.2).length;
    if (n) discardE(G, P, n, 'discard');
    drawN(G, P, n + 1);
  }, { score: () => 1.2 })];
  d.trig.push(T('enter', { you: true, other: true, cond: (G, src, ev) => isCreature(ev.c) && (ev.from === 'gy' || !!ev.castFromGy), once: true, run: (G, X) => ctrEach(G, X.P.bf.filter(isCreature), 1) }));
  return d;
};
S['Cloud, Ex-SOLDIER'] = (d) => {
  d.etb = [fn((G, X) => { const eqs = X.P.bf.filter((c) => hasSub(c, 'Equipment')); const eq = isHuman(G, X.P) ? pickSome(G, X.P, eqs, 0, 1, 'Attach an Equipment to Cloud?', () => 1)[0] : eqs.slice().sort((a, b) => b.def.value - a.def.value)[0]; if (eq && onBf(G, X.src)) attach(G, eq, X.src); }, { score: (G, P) => (P.bf.some((c) => hasSub(c, 'Equipment')) ? 1 : 0) })];
  d.trig.push(T('attack', { self: true, run: (G, X) => {
    const n = (G.combat ? G.combat.attackers : []).filter((c) => onBf(G, c) && c.ctrl === X.P.i && equipmentOn(G, c).length).length;
    drawN(G, X.P, n);
    if (pow(X.src) >= 7) treasure(G, X.P, 2);
  } }));
  return d;
};
S['Crackling Doom'] = (d) => {
  d.spell = [fn((G, X) => { hitOpp(G, X, 2); const cs = X.O.bf.filter(isCreature); if (!cs.length) return; const top = Math.max(...cs.map(pow)); edictOf(G, X.O, (c) => isCreature(c) && pow(c) === top, X.src.def.name); }, { score: (G, P) => 1 + Math.max(0, ...other(G, P).bf.filter(isCreature).map((c) => cv(c))) })];
  d.role = 'removal';
  return d;
};
S['Decimate'] = (d) => {
  const kill = (types) => ({ k: 'destroyP', tgt: { f: { types } } });
  d.spell = [kill(['Artifact']), kill(['Creature']), kill(['Enchantment']), kill(['Land'])];
  d.castIf = (G) => ['Artifact', 'Enchantment', 'Land'].every((t) => allPerms(G).some((c) => c.def.types.includes(t))) && allCreatures(G).length > 0;
  d.role = 'removal';
  return d;
};
S['Edgar, Master Machinist'] = (d) => {
  // Once during each of your turns: cast an artifact spell from your graveyard (it enters tapped)
  d.gyCast = (G, P, card, src) => G.active === P.i && src.mem.edgar !== G.turn && card.def.types.includes('Artifact') && !isLand(card);
  d.trig.push(T('cast', { you: true, cond: (G, src, ev) => ev.zone === 'gycast' && !!ev.card && ev.card.def.types.includes('Artifact') && src.mem.edgar !== G.turn, run: (G, X) => { X.src.mem.edgar = G.turn; X.ev.card.edgarTapped = true; } }));
  d.trig.push(T('enter', { you: true, cond: (G, src, ev) => !!ev.c.edgarTapped, run: (G, X) => { X.ev.c.edgarTapped = false; X.ev.c.tapped = true; } }));
  d.trig.push(T('attack', { self: true, run: (G, X) => pump(G, X.src, Math.max(0, ...X.P.bf.filter(isArtifact).map((c) => c.def.mv)), 0) }));
  return d;
};
S['Elena, Turk Recruit'] = (d) => {
  d.etb = [fn((G, X, t) => gyToHand(G, X.P, t && t.c), { tgt: { what: 'gy', mine: true, f: { types: ['any'], fn: (G, c) => L.historicDef(c.def) && !c.def.sub.includes('Assassin') } }, min: 0, val: (G, P, c) => c.def.value, label: 'Return a non-Assassin historic card from your graveyard' })];
  d.trig.push(T('cast', { you: true, cond: (G, src, ev) => !!ev.card && L.historicDef(ev.card.def), run: (G, X) => addCounters(G, X.src, 1) }));
  return d;
};
S['Emet-Selch of the Third Seat'] = (d) => {
  d.spellDiscount = (G, P, card) => (P.gy.includes(card) ? 2 : 0);
  d.trig.push(T('dmgPlayer', { cond: (G, src, ev, Q) => ev.P !== Q && Q.gy.some((c) => isIS(c.def)) && src.mem.emet !== G.turn, run: (G, X) => {
    X.src.mem.emet = G.turn;
    const cs = X.P.gy.filter((c) => isIS(c.def));
    const c = pickOne(G, X.P, cs, 'Cast an instant or sorcery card from your graveyard', (x) => x.def.value, 'choose', 'graveyard');
    if (!c) return;
    c.fbExile = true;
    X.P.xcast.push({ card: c, until: G.turn });
    if (!castNow(G, X.P, c, {})) c.fbExile = false;
    X.P.xcast = X.P.xcast.filter((x) => x.card !== c);
  } }));
  return d;
};
S['Endless Detour'] = (d) => {
  d.spell = [fn((G, X, t) => {
    const c = t && t.c;
    if (!c || !onBf(G, c)) return;
    const O = G.players[c.owner];
    const top = isHuman(G, O) ? chooseMode(G, O, X.src, `Put ${c.def.name} on top or bottom of your library?`, ['Top', 'Bottom'], 0) === 0 : true;
    L.mshKit.toLibrary(G, X, c, top ? 'top' : 'bottom');
  }, { tgt: { f: { types: ['nonland'] } }, val: (G, P, c) => (c.ctrl === P.i ? -pv(G, c) : pv(G, c) * 0.85 + (c.token ? 1 : 0)), label: 'Choose a nonland permanent' })];
  d.role = 'removal';
  return d;
};
S['Estinien Varlineau'] = (d) => {
  d.trig.push(T('cast', { you: true, cond: (G, src, ev) => !!ev.card && !ev.card.def.types.includes('Creature'), run: (G, X) => { addCounters(G, X.src, 1); grantKw(G, X.src, ['flying']); } }));
  d.trig.push(T('hitPlayer', { you: true, cond: (G, src, ev) => !!ev.c && (ev.c === src || hasSub(ev.c, 'Dragon')), run: (G, X) => { X.src.mem.estinien = G.turn; } }));
  d.trig.push(T('mainStart', { you: true, cond: (G, src) => G.phase === 'main2' && src.mem.estinien === G.turn, run: (G, X) => { drawN(G, X.P, 1); loseLife(G, X.P, 1); } }));
  return d;
};
S['Eye of Nidhogg'] = (d) => {
  d.statics = d.statics.filter((x) => x.who !== 'enchanted');
  d.statics.push({ who: 'enchanted', p: 0, t: 0, kw: ['flying', 'deathtouch'], base: [4, 2], addSub: ['Dragon'], flags: { mustAttack: true } });
  d.trig.push(T('toGy', { self: true, run: (G, X) => { const c = X.ev.c, O = G.players[c.owner]; if (O.gy.includes(c)) { O.gy.splice(O.gy.indexOf(c), 1); O.hand.push(c); dirty(G); emit(G, 'raise', `${c.def.name} returns to ${O.name}'s hand.`, { who: O.i, cards: [c.id] }); } } }));
  d.auraVal = (G, P, c) => (c.ctrl === P.i ? 2 + (has(c, 'flying') ? 0 : 1) : 0.5 + (cv(c) < 2 ? 1 : -1));
  return d;
};
S['Fathom Mage'] = (d) => { evolve(d); d.trig.push(T('counters', { self: true, cond: (G, src, ev) => ev.kind === '+1/+1', may: true, mayLabel: 'Draw a card?', eff: [{ k: 'draw', n: 1 }] })); return d; };
S["G'raha Tia, Scion Reborn"] = (d) => {
  d.trig.push(T('cast', { you: true, once: true, cond: (G, src, ev) => !!ev.card && !ev.card.def.types.includes('Creature') && ev.card.def.mv > 0, run: (G, X) => {
    const n = X.ev.card.def.mv, P = X.P;
    if (P.life <= n) return;
    const want = isHuman(G, P) ? yesNo(G, P, X.src, `Pay ${n} life for a Hero with ${n} +1/+1 counters?`, P.life > 15) : P.life - n >= 15;
    if (!want) return;
    loseLife(G, P, n);
    const [h] = mk(G, P, HERO, 1);
    if (h) addCounters(G, h, n);
  } }));
  return d;
};
S['Kefka, Dancing Mad'] = (d) => {
  d.statics.push({ who: 'self', cond: (G, src) => G.active === src.ctrl, p: 0, t: 0, kw: ['indestructible'] });
  d.trig.push(T('endStep', { you: true, cond: (G, src, ev) => ev.nth === 1, run: (G, X) => {
    const O = X.O;
    if (!O.gy.length) return;
    const c = O.gy[G.rng.int(O.gy.length)];
    O.gy.splice(O.gy.indexOf(c), 1); O.exile.push(c);
    emit(G, 'exile', `${c.def.name} is exiled at random from ${O.name}'s graveyard.`, { who: X.P.i, cards: [c.id] });
    if (isLand(c)) return;
    X.P.xcast.push({ card: c, until: G.turn, free: true });
    const ok = castNow(G, X.P, c, { free: true });
    X.P.xcast = X.P.xcast.filter((x) => x.card !== c);
    if (ok) loseLife(G, O, c.def.mv, X.P.i);
  } }));
  return d;
};
const KIMAHRI_TRIG = T('combatStart', { you: true, run: (G, X) => {
  addCounters(G, X.src, 1);
  const cs = X.O.bf.filter((c) => isCreature(c) && targetOk(G, X.P, { side: 'opp' }, c, X.src));
  const c = pickOne(G, X.P, cs, 'Tap a creature an opponent controls', (x) => cv(x));
  if (!c) return;
  c.tapped = true;
  emit(G, 'tapfx', `${c.def.name} is tapped.`, { who: X.P.i, cards: [c.id] });
  const want = isHuman(G, X.P) ? yesNo(G, X.P, X.src, `Have Kimahri become a copy of ${c.def.name}?`, false) : c.def.value > X.src.def.value + 1;
  if (!want) return;
  const name = 'Kimahri, Valiant Guardian';
  becomeCopy(G, X.src, Object.assign({}, c.def, { name, kw: [...new Set(c.def.kw.concat('vigilance'))], trig: (c.def.trig || []).concat(KIMAHRI_TRIG) }), null, {});
} });
S['Kimahri, Valiant Guardian'] = (d) => { d.trig.push(KIMAHRI_TRIG); return d; };
S['Krile Baldesion'] = (d) => {
  d.trig.push(T('cast', { you: true, once: true, cond: (G, src, ev, Q) => !!ev.card && !ev.card.def.types.includes('Creature') && Q.gy.some((c) => c.def.types.includes('Creature') && c.def.mv === ev.card.def.mv), run: (G, X) => {
    const cs = X.P.gy.filter((c) => c.def.types.includes('Creature') && c.def.mv === X.ev.card.def.mv);
    gyToHand(G, X.P, pickOne(G, X.P, cs, 'Return a creature card with that mana value', (x) => x.def.value, 'choose', 'graveyard'));
  } }));
  return d;
};
S['Legions to Ashes'] = (d) => {
  d.spell = [fn((G, X, t) => {
    const c = t && t.c;
    if (!c || !onBf(G, c)) return;
    const Q = G.players[c.ctrl], name = c.def.name;
    const also = Q.bf.filter((x) => x !== c && x.token && x.def.name === name);
    for (const x of [c].concat(also)) if (onBf(G, x)) { if (isCreature(x)) X.P.stats.kills++; exilePermanent(G, X.P, x); }
  }, { tgt: { f: { types: ['nonland'], side: 'opp' } }, val: (G, P, c) => pv(G, c) + G.players[c.ctrl].bf.filter((x) => x !== c && x.token && x.def.name === c.def.name).reduce((s, x) => s + pv(G, x), 0), label: 'Exile a nonland permanent an opponent controls' })];
  d.role = 'removal';
  return d;
};
S['Locke, Treasure Hunter'] = (d) => {
  d.blockOnlyBy = (G, b, a) => pow(b) <= pow(a);
  d.trig.push(T('attack', { self: true, run: (G, X) => {
    const ms = [X.P, X.O].flatMap((Q) => mill(G, Q, 1));
    if (ms.some(isLand)) treasure(G, X.P, 1);
    for (const c of ms.filter((x) => !isLand(x))) X.P.xcast.push({ card: c, until: G.turn, locke: true, cond: (GG, P) => !P.lockeCast || P.lockeCast !== GG.turn });
  } }));
  d.trig.push(T('cast', { you: true, cond: (G, src, ev) => !!ev.item && ev.item.fromGy, run: (G, X) => { X.P.lockeCast = G.turn; X.P.xcast = X.P.xcast.filter((x) => !x.locke); } }));
  return d;
};
S['Lyse Hext'] = (d) => {
  d.spellDiscount = (G, P, card) => (card.def.types.includes('Creature') ? 0 : 1);
  d.statics.push({ who: 'self', cond: (G, src) => (G.players[src.ctrl].castDefs || []).filter((x) => !x.types.includes('Creature')).length >= 2, p: 0, t: 0, kw: ['double strike'] });
  return d;
};
S['Papalymo Totolymo'] = (d) => {
  d.trig.push(T('cast', { you: true, cond: (G, src, ev) => !!ev.card && !ev.card.def.types.includes('Creature'), run: (G, X) => { hitOpp(G, X, 1); gain(G, X.P, 1); } }));
  d.acts.push({ cost: { m: C('{4}'), tap: true, sacSelf: true }, label: 'Each opponent who lost life this turn sacrifices their greatest-power creature', when: ['end', 'main2'],
    run: (G, X) => { if (!lostLife(G, X.O)) return; const cs = X.O.bf.filter(isCreature); if (!cs.length) return; const top = Math.max(...cs.map(pow)); edictOf(G, X.O, (c) => isCreature(c) && pow(c) === top, X.src.def.name); },
    ai: (G, P) => (lostLife(G, other(G, P)) && other(G, P).bf.some((c) => isCreature(c) && cv(c) >= 4) ? { score: 2.5 } : null) });
  return d;
};
S['Red XIII, Proud Warrior'] = (d) => {
  d.statics.push({ who: 'all', f: { side: 'you', other: true, fn: (G, c) => modified(G, c) }, p: 0, t: 0, kw: ['vigilance', 'trample'] });
  d.etb = [fn((G, X, t) => gyToHand(G, X.P, t && t.c), { tgt: { what: 'gy', mine: true, f: { types: ['any'], fn: (G, c) => c.def.sub.includes('Aura') || c.def.sub.includes('Equipment') } }, min: 0, val: (G, P, c) => c.def.value, label: 'Return an Aura or Equipment card from your graveyard' })];
  return d;
};
S['Sephiroth, Fallen Hero'] = (d) => {
  d.trig.push(T('attack', { self: true, run: (G, X) => {
    const cs = allCreatures(G).filter((c) => targetOk(G, X.P, {}, c, X.src));
    const c = isHuman(G, X.P) ? pickSome(G, X.P, cs, 0, 1, 'Put a cell counter on a creature?', (x) => cv(x))[0] : cs.filter((x) => x.ctrl === X.P.i && !modified(G, x)).sort((a, b) => (b.attacking ? 1 : 0) - (a.attacking ? 1 : 0) || pow(a) - pow(b))[0];
    if (c) addCounters(G, c, 1, 'cell');
    for (const m of X.P.bf.filter((x) => isCreature(x) && modified(G, x))) m.base = { p: 7, t: 5 };
    const ms = X.P.bf.filter((x) => isCreature(x) && modified(G, x));
    G.delayed.push({ when: 'end', run: () => { for (const m of ms) m.base = null; } });
    dirty(G);
    if (ms.length) emit(G, 'pump', `${X.P.name}'s modified creatures are 7/5 until end of turn.`, { who: X.P.i, cards: ms.map((m) => m.id) });
  } }));
  d.gyActs = [{ cost: { m: C('{3}'), sac: { f: { fn: (G, c) => modified(G, c) }, label: 'Sacrifice a modified creature', prefer: (G, c) => cv(c) } }, label: 'Return Sephiroth to the battlefield tapped', when: ['main1', 'main2', 'end'],
    run: (G, X) => { if (X.P.gy.includes(X.src)) reanimate(G, X.P, X.src, { tapped: true }); }, ai: (G, P) => (P.bf.some((c) => isCreature(c) && modified(G, c) && (c.token || cv(c) < 3)) ? { score: 3 } : null) }];
  return d;
};
S['Setzer, Wandering Gambler'] = (d) => {
  const BLACKJACK = { id: 'fic-the-blackjack', name: 'The Blackjack', art: true, legendary: true, sub: ['Vehicle'], colors: [], text: 'Flying\nCrew 2', vehicle: { p: 3, t: 3, kw: ['flying'], crew: 2 } };
  d.etb = [fn((G, X) => {
    const def = L.tokenDef(G, { id: 'fic-the-blackjack-v', name: 'The Blackjack', p: 3, t: 3, colors: [], sub: ['Vehicle'], kw: ['flying'], artifact: true, legendary: true, text: 'Flying\nCrew 2' });
    def.types = ['Artifact']; def.crew = 2; def.power = 3; def.toughness = 3;
    const [t] = makeTokens(G, X.P, def, 1, { quiet: true });
    if (t) emit(G, 'token', `${X.P.name} creates The Blackjack, a 3/3 flying Vehicle.`, { who: X.P.i, cards: [t.id] });
    void BLACKJACK;
  }, { score: () => 2 })];
  d.trig.push(T('hitPlayer', { you: true, cond: (G, src, ev) => !!ev.c && hasSub(ev.c, 'Vehicle'), run: (G, X) => { const win = G.rng.int(2) === 0; emit(G, 'info', `${X.P.name} flips a coin and ${win ? 'wins' : 'loses'}.`, { who: X.P.i }); if (win) treasure(G, X.P, 2, { tapped: true }); } }));
  return d;
};
S['Shelinda, Yevon Acolyte'] = (d) => {
  d.trig.push(T('enter', { you: true, other: true, cond: (G, src, ev) => isCreature(ev.c), run: (G, X) => { const c = X.ev.c; if (onBf(G, c) && pow(c) < pow(X.src)) addCounters(G, c, 1); else addCounters(G, X.src, 1); } }));
  return d;
};
S['Sin, Unending Cataclysm'] = (d) => {
  d.enterAs = (G, P, card) => {
    const cs = allPerms(G).filter((c) => (isArtifact(c) || isCreature(c) || isEnchantment(c)) && hasCtrs(c));
    const pick = isHuman(G, P) ? pickSome(G, P, cs, 0, cs.length, 'Remove all counters from any number of these', () => 1) : cs.filter((c) => c.ctrl !== P.i ? c.cnt > 0 || Object.keys(c.ctr).some((k) => GOOD(k) && c.ctr[k] > 0) : Object.keys(c.ctr).some((k) => !GOOD(k) && c.ctr[k] > 0));
    let n = 0;
    for (const c of pick) { n += Math.abs(c.cnt) + Object.values(c.ctr).reduce((s, v) => s + v, 0); c.cnt = 0; c.ctr = {}; }
    if (n) { dirty(G); emit(G, 'pump', `${card.def.name} gathers ${n} counters.`, { who: P.i }); }
    card.etbAdd = { '+1/+1': 2 * n };
  };
  d.trig.push(T('die', { self: true, run: (G, X) => {
    const n = Math.max(0, X.ev.cnt || 0);
    const c = pickOne(G, X.P, X.P.bf.filter(isCreature), 'Put its counters on a creature you control', (x) => cv(x));
    if (c && n) addCounters(G, c, n);
    const card = X.ev.c, O = G.players[card.owner];
    if (O.gy.includes(card)) { O.gy.splice(O.gy.indexOf(card), 1); O.library.push(card); G.rng.shuffle(O.library); dirty(G); }
  } }));
  return d;
};
S['Terra, Herald of Hope'] = (d) => {
  d.trig.push(T('combatStart', { you: true, run: (G, X) => { mill(G, X.P, 2); grantKw(G, X.src, ['flying']); } }));
  d.trig.push(T('hitPlayer', { self: true, cond: (G, src, ev, Q) => canPay(Q, genericCost(2)) && Q.gy.some((c) => c.def.types.includes('Creature') && (c.def.power || 0) <= 3), run: (G, X) => {
    const cs = X.P.gy.filter((c) => c.def.types.includes('Creature') && (c.def.power || 0) <= 3);
    const c = pickOne(G, X.P, cs, 'Pay {2} to return a creature card with power 3 or less?', (x) => x.def.value, 'choose', 'graveyard');
    const want = c && (isHuman(G, X.P) ? yesNo(G, X.P, X.src, `Pay {2} to return ${c.def.name} tapped?`, true) : c.def.value >= 1.5);
    if (want && pay(X.P, genericCost(2))) reanimate(G, X.P, c, { tapped: true });
  } }));
  return d;
};
S["Tidus, Yuna's Guardian"] = (d) => {
  d.trig.push(T('combatStart', { you: true, run: (G, X) => {
    const from = X.P.bf.filter((c) => isCreature(c) && hasCtrs(c));
    if (!from.length) return;
    const a = isHuman(G, X.P) ? pickSome(G, X.P, from, 0, 1, 'Move a counter from which creature? (optional)', () => 1)[0] : from.filter((c) => c.cnt > 1 && !c.attacking).sort((x, y) => y.cnt - x.cnt)[0];
    if (!a) return;
    const to = X.P.bf.filter((c) => isCreature(c) && c !== a);
    const b = pickOne(G, X.P, to, 'Onto which creature?', (c) => (c.cnt > 0 ? 0 : 1) + pow(c) * 0.2 + (has(c, 'flying') || c.tf.unblockable ? 1 : 0));
    if (!b) return;
    const k = a.cnt > 0 ? '+1/+1' : Object.keys(a.ctr).find((x) => a.ctr[x] > 0);
    removeCounters(G, a, k, 1); addCounters(G, b, 1, k);
  } }));
  d.trig.push(T('hitPlayer', { you: true, once: true, cond: (G, src, ev) => !!ev.c && hasCtrs(ev.c), may: true, mayLabel: 'Draw a card and proliferate?', run: (G, X) => { drawN(G, X.P, 1); proliferate(G, X.P); } }));
  return d;
};
S['Tifa, Martial Artist'] = (d) => {
  d.trig.push(T('attack', { self: true, run: (G, X) => pump(G, X.src, 1, 1) })); // melee: one opponent attacked
  d.trig.push(T('hitPlayer', { you: true, once: true, cond: (G, src, ev) => !!ev.c && pow(ev.c) >= 7, run: (G, X) => {
    for (const c of X.P.bf.filter((x) => isCreature(x) && x.tapped)) c.tapped = false;
    dirty(G);
    emit(G, 'tapfx', `${X.P.name}'s creatures untap.`, { who: X.P.i });
    if ((G.combatN || 1) === 1) { G.extraCombat = true; emit(G, 'info', `${X.P.name} gets an additional combat phase.`, { who: X.P.i }); }
  } }));
  return d;
};
S['Tromell, Seymour\'s Butler'] = (d) => {
  d.enterBonus = (G, x, card) => (!card.token ? 1 : 0);
  d.acts.push({ cost: { m: C('{1}'), tap: true }, label: 'Proliferate X times (X = nontoken creatures you control that entered this turn)', when: ['end', 'main2'],
    run: (G, X) => { const n = L.enteredThisTurn(G, X.P).filter((c) => !c.token && onBf(G, c) && isCreature(c)).length; for (let k = 0; k < n; k++) proliferate(G, X.P); },
    ai: (G, P) => (L.enteredThisTurn(G, P).some((c) => !c.token && onBf(G, c) && isCreature(c)) && P.bf.some((c) => c.cnt > 0) ? { score: 1.5 } : null) });
  return d;
};
S['Urianger Augurelt'] = (d) => {
  d.trig.push(T('cast', { you: true, cond: (G, src, ev) => !!ev.item && ev.item.zone === 'xcast' && !ev.item.fromGy, run: (G, X) => gain(G, X.P, 2) }));
  d.acts.push({ cost: { tap: true }, label: 'Draw Arcanum: look at the top card; you may exile it face down', when: ['end'],
    run: (G, X) => { const P = X.P, c = P.library[P.library.length - 1]; if (!c) return; const want = isHuman(G, P) ? yesNo(G, P, X.src, `Exile ${c.def.name} face down with Urianger?`, true) : !isLand(c) || P.hand.filter(isLand).length === 0; if (!want) return; P.library.pop(); P.exile.push(c); X.src.mem.arcana = (X.src.mem.arcana || []).concat(c.id); dirty(G); say(G, P, `${P.name} exiles a card face down.`); },
    ai: (G, P, c) => ((c.mem.arcana || []).length < 2 ? { score: 0.9 } : null) });
  d.acts.push({ cost: { tap: true }, label: 'Play Arcanum: until end of turn, play the exiled cards for {2} less', when: ['main1'], cond: (G, P, c) => (c.mem.arcana || []).some((id) => P.exile.some((x) => x.id === id)),
    run: (G, X) => { const P = X.P; for (const c of P.exile.filter((x) => (X.src.mem.arcana || []).includes(x.id))) P.xcast.push({ card: c, until: G.turn, uri: X.src.id }); P.uriTurn = G.turn; },
    ai: (G, P, c) => ((c.mem.arcana || []).length >= 1 ? { score: 2 } : null) });
  d.spellDiscount = (G, P, card, src) => (P.uriTurn === G.turn && P.xcast.some((x) => x.card === card && x.uri === src.id) ? 2 : 0);
  return d;
};
S['Wakka, Devoted Guardian'] = (d) => {
  d.trig.push(T('hitPlayer', { self: true, run: (G, X) => {
    const arts = X.ev.Q.bf.filter(isArtifact);
    const c = pickOne(G, X.P, arts, 'Destroy up to one artifact that player controls', (x) => pv(G, x));
    if (c) destroyPermanent(G, X.P, c);
    addCounters(G, X.src, 1);
  } }));
  d.trig.push(T('counters', { self: true, run: (G, X) => { X.src.mem.wakka = G.turn; } }));
  d.trig.push(T('endStep', { you: true, cond: (G, src, ev) => ev.nth === 1 && src.mem.wakka === G.turn, run: (G, X) => ctrEach(G, X.P.bf.filter((c) => c !== X.src && isCreature(c)), 1) }));
  return d;
};
S["Y'shtola, Night's Blessed"] = (d) => {
  d.trig.push(T('endStep', { cond: (G, src, ev) => ev.nth === 1 && G.players.some((Q) => L.lifeLost(G, Q) >= 4), eff: [{ k: 'draw', n: 1 }] }));
  d.trig.push(T('cast', { you: true, cond: (G, src, ev) => !!ev.card && !ev.card.def.types.includes('Creature') && ev.card.def.mv >= 3, run: (G, X) => { hitOpp(G, X, 2); gain(G, X.P, 2); } }));
  return d;
};
S['Yuna, Grand Summoner'] = (d) => {
  d.mana = null;
  d.manaAbs = [{ colors: ANY }];
  // Grand Summon: the next creature spell this turn enters with two more +1/+1 counters
  d.onManaTap = (G, P) => { P.grandSummon = G.turn; };
  d.trig.push(T('cast', { you: true, cond: (G, src, ev, Q) => Q.grandSummon === G.turn && !!ev.card && ev.card.def.types.includes('Creature'), run: (G, X) => { X.P.grandSummon = 0; X.ev.card.finCtr = (X.ev.card.finCtr || 0) + 2; } }));
  d.trig.push(T('leave', { you: true, cond: (G, src, ev) => ev.c !== src && ev.to === 'gy' && ((ev.cnt || 0) > 0 || Object.values(ev.ctr || {}).some((n) => n > 0)), run: (G, X) => {
    const n = Math.max(0, X.ev.cnt || 0) + Object.values(X.ev.ctr || {}).reduce((s, v) => s + Math.max(0, v), 0);
    const c = pickOne(G, X.P, X.P.bf.filter(isCreature), `Put ${n} +1/+1 counters on a creature`, (x) => cv(x));
    if (c && n) addCounters(G, c, n);
  } }));
  return d;
};

return S;
});
