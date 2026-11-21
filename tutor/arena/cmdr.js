/* Commander staples: the cards that turn up in more than one of the Commander precons (The Lord of the Rings, FINAL FANTASY,
   Marvel), and the shared kit the three Commander files build on (cmdKit): the monarch, voting, the commander's color
   identity, "choose a creature type", and the dual lands of Commander decks (pain, reveal, battle and filter lands).
   Same shape as core.js and built from its helpers, so this file loads after arena23.js. */
(function (root, factory) {
  const A = typeof module === 'object' && module.exports ? require('./engine.js') : root.Arena;
  if (typeof module === 'object' && module.exports) { require('./msh.js'); require('./core.js'); }
  const S = factory(A);
  A.registerScripts(S);
  if (typeof module === 'object' && module.exports) module.exports = S;
})(typeof self !== 'undefined' ? self : this, function (A) {
'use strict';
const L = A.lib;
const { isCreature, isArtifact, isLand, isEnchantment, isLegendary, pow, tou, has, hasSub, attach, dirty, onBf, byId, cv, pv, other, allCreatures, allPerms,
  addCounters, ctrCount, chooseMode, isHuman, yesNo, bounceCard, destroyPermanent, exilePermanent, putOntoBattlefield, enterBattlefield, emit, mill, searchLibrary,
  nameList, gainControl, sacrifice, discardChoice, canPay, pay, pickCards, isIS, scryChoice, exileUntil, equipmentOn, becomeMonarch, monarchVal, vote, chooseCreatureType,
  cmdIdentity, isCommander, phaseOut, genericCost, goad, connive, ANY } = L;
const { C, T, fn, YOU, OPP, drawN, edictOf, gain, grantKw, hit, loseLife, mk, mkE, pickOne, pickSome, pump, say, ctx0, holdUntilLeaves, untap, discardE } = L.mshKit;
const { tok } = L.coreKit;
const S = {};

/* ============================================================ The kit */
const GOAT = tok('Goat', 0, 1, ['W'], ['Goat']);
const BIRD_U = tok('Bird', 2, 2, ['U'], ['Bird'], ['flying']);
const basic = (c) => c.def.supertypes.includes('Basic');
const count = (P, pred) => P.bf.filter(pred).length;
const nCre = (G) => allCreatures(G).length;
// Lands
// Painlands and Talismans: {T}: {C}; {T}: one of two colors, and 1 damage to you
const painland = (a, b) => (d) => { d.mana = null; d.manaAbs = [{ colors: ['C', a, b], painOnColor: true, life: 1 }]; d.role = d.types.includes('Land') ? 'land' : 'ramp'; return d; };
// Reveal lands and snarls: tapped unless you reveal a land card of one of two types from your hand
const revealLand = (a, b, types) => (d) => { d.mana = [a, b]; d.tappedUnless = (G, P) => P.hand.some((c) => c.def.types.includes('Land') && types.some((t) => c.def.sub.includes(t))); d.role = 'land'; return d; };
// Battle lands: tapped unless you control two or more basic lands
const tangoLand = (a, b) => (d) => { d.mana = [a, b]; d.tappedUnless = (G, P) => count(P, (c) => isLand(c) && basic(c)) >= 2; d.role = 'land'; return d; };
// "Tapped unless you have two or more opponents": a duel always has one
const crowdLand = (a, b) => (d) => { d.mana = [a, b]; d.etbTapped = true; d.role = 'land'; return d; };
// Filter lands ({T}: {C}; {A/B}, {T}: two mana in those colors): played as a land that makes either color
const filterLand = (a, b) => (d) => { d.mana = null; d.manaAbs = [{ colors: ['C'] }, { colors: [a, b], amount: 2, conv: 1 }]; d.role = 'land'; return d; };
// "{T}: Add one mana of any color in your commander's color identity": nothing at all without a commander
const identityMana = (d, o = {}) => { d.mana = null; d.manaAbs = [Object.assign({ colorsFn: (G, c, P) => (G ? cmdIdentity(G, P) : []) }, o)]; d.cmdOnly = true; return d; };
// The monarch
const monarchE = () => fn((G, X) => becomeMonarch(G, X.P), { score: (G, P) => monarchVal(G, P), value: 2 });
const noMonarch = (G) => G.monarch == null;
// "As this enters, choose a creature type": remembered on the permanent (c.mem.ctype)
const chooseTypeAs = (d, prefer) => { d.enterAs = (G, P, c) => { c.mem.ctype = chooseCreatureType(G, P, c, prefer ? (t) => prefer(G, P, t) : null); }; return d; };
const ofType = (c, src) => !!src.mem.ctype && (isCreature(c) ? hasSub(c, src.mem.ctype) : c.def.sub.includes(src.mem.ctype));
const defOfType = (def, src) => !!src.mem.ctype && def.sub.includes(src.mem.ctype);
// Something that happens at the beginning of the next turn's upkeep (Arcane Denial)
function nextUpkeep(G, P, src, run) { (P.turnTrigs = (P.turnTrigs || []).filter((x) => x.turn >= G.turn)).push({ turn: G.turn + 1, src, t: T('upkeep', { run }) }); }
// "Whenever your commander enters or attacks"
const cmdEnters = (o) => T('enter', Object.assign({ you: true, cond: (G, s, ev) => isCommander(ev.c) }, o));
const cmdAttacks = (o) => T('attack', Object.assign({ you: true, cond: (G, s, ev) => isCommander(ev.c) }, o));
// A creature card from a graveyard onto the battlefield under your control
function reanimate(G, P, c, opts = {}) {
  if (!c || !G.players.some((Q) => Q.gy.includes(c))) return null;
  emit(G, 'raise', `${c.def.name} returns to the battlefield under ${P.name}'s control.`, { who: P.i, cards: [c.id] });
  putOntoBattlefield(G, P, c, opts);
  return c;
}
const gyCreatures = (G) => G.players.flatMap((Q) => Q.gy.filter((c) => c.def.types.includes('Creature')));
// Destroy everything a filter catches (any permanent type)
function destroyEach(G, P, cs, why) { let n = 0; for (const c of cs) if (destroyPermanent(G, P, c, why)) n++; return n; }
const sweepVal = (G, P, pred) => allPerms(G).filter(pred).reduce((s, c) => s + (c.ctrl === P.i ? -pv(G, c) : pv(G, c)), 0);
// Each creature gets -N/-N until end of turn
function shrinkAll(G, P, n, pred) {
  const cs = allCreatures(G).filter((c) => !pred || pred(c));
  for (const c of cs) { c.tp -= n; c.tt -= n; }
  dirty(G);
  emit(G, 'pump', `${pred ? 'Those creatures get' : 'All creatures get'} -${n}/-${n} until end of turn.`, { who: P.i, cards: cs.map((c) => c.id) });
}
const shrinkVal = (G, P, n) => allCreatures(G).filter((c) => tou(c) - c.dmg <= n && !has(c, 'indestructible')).reduce((s, c) => s + (c.ctrl === P.i ? -cv(c) : cv(c)), 0);
// Search for a basic land (to the battlefield, tapped unless untapped is said)
const basicLand = (c) => c.def.types.includes('Land') && basic(c);
function fetchBasic(G, P, tapped = true, n = 1) {
  const got = searchLibrary(G, P, basicLand, n, tapped ? 'bfTapped' : 'bf', 'Search for a basic land card');
  if (got.length) emit(G, 'search', `${P.name} searches for ${nameList(got)} and puts ${got.length === 1 ? 'it' : 'them'} onto the battlefield${tapped ? ' tapped' : ''}.`, { who: P.i, cards: got.map((c) => c.id) });
  else emit(G, 'search', `${P.name} searches their library and finds no basic land.`, { who: P.i });
  return got;
}
const rampVal = (G, P) => (P.library.some(basicLand) ? 1.4 + (P.bf.filter(isLand).length < 7 ? 0.6 : 0) : 0);
L.cmdKit = { GOAT, BIRD_U, basic, count, nCre, painland, revealLand, tangoLand, crowdLand, filterLand, identityMana, monarchE, noMonarch, chooseTypeAs, ofType, defOfType, nextUpkeep,
  cmdEnters, cmdAttacks, reanimate, gyCreatures, destroyEach, sweepVal, shrinkAll, shrinkVal, basicLand, fetchBasic, rampVal };

/* ============================================================ Lands */
S['Brushland'] = painland('G', 'W');
S['Underground River'] = painland('U', 'B');
S['Canopy Vista'] = tangoLand('G', 'W');
S['Prairie Stream'] = tangoLand('W', 'U');
S['Smoldering Marsh'] = tangoLand('B', 'R');
S['Sunken Hollow'] = tangoLand('U', 'B');
S['Cinder Glade'] = tangoLand('R', 'G');
S['Choked Estuary'] = revealLand('U', 'B', ['Island', 'Swamp']);
S['Foreboding Ruins'] = revealLand('B', 'R', ['Swamp', 'Mountain']);
S['Fortified Village'] = revealLand('G', 'W', ['Forest', 'Plains']);
S['Port Town'] = revealLand('W', 'U', ['Plains', 'Island']);
S['Frostboil Snarl'] = revealLand('U', 'R', ['Island', 'Mountain']);
S['Furycalm Snarl'] = revealLand('R', 'W', ['Mountain', 'Plains']);
S['Shineshadow Snarl'] = revealLand('W', 'B', ['Plains', 'Swamp']);
S['Vineglimmer Snarl'] = revealLand('G', 'U', ['Forest', 'Island']);
S['Rejuvenating Springs'] = crowdLand('G', 'U');
S['Flooded Grove'] = filterLand('G', 'U');
S['Command Tower'] = (d) => { identityMana(d); d.role = 'land'; return d; };
S['Path of Ancestry'] = (d) => {
  identityMana(d);
  d.etbTapped = true;
  d.role = 'land';
  // Its mana spent on a creature spell that shares a creature type with your commander: scry 1
  d.onManaTap = (G, P, c) => { P.ancestry = { turn: G.turn, n: ((P.ancestry && P.ancestry.turn === G.turn) ? P.ancestry.n : 0) + 1 }; };
  d.trig.push(T('cast', { you: true, cond: (G, src, ev) => !!ev.card && ev.card.def.types.includes('Creature') && !!ev.P.ancestry && ev.P.ancestry.turn === G.turn && ev.P.ancestry.n > 0
      && (ev.P.cmds || []).some((k) => k.def.sub.some((t) => ev.card.def.sub.includes(t))),
    run: (G, X) => { X.P.ancestry.n--; scryChoice(G, X.P, 1); } }));
  return d;
};
S['Exotic Orchard'] = (d) => {
  d.mana = null;
  // Any color a land an opponent controls could produce
  d.manaAbs = [{ colorsFn: (G, c, P) => { if (!G) return []; const s = new Set(); for (const x of other(G, P).bf) if (isLand(x)) for (const col of (x.def.mana || []).concat(...(x.def.manaAbs || []).map((ab) => ab.colors || []))) if (ANY.includes(col)) s.add(col); return ANY.filter((col) => s.has(col)); } }];
  d.role = 'land';
  return d;
};
S["Rogue's Passage"] = (d) => {
  d.mana = ['C'];
  d.acts.push({ cost: { m: C('{4}'), tap: true }, label: "Target creature can't be blocked this turn", when: ['main1'],
    eff: [fn((G, X, t) => { const c = t && t.c; if (c && onBf(G, c)) { c.tf.unblockable = true; grantKw(G, c, [], "can't be blocked this turn"); } }, { tgt: { f: { side: 'you' } }, val: (G, P, c) => (c.tapped || (c.sick && !has(c, 'haste')) ? -1 : pow(c) * 0.5), label: 'Choose a creature' })],
    ai: (G, P) => { const cs = P.bf.filter((c) => isCreature(c) && !c.tapped && (!c.sick || has(c, 'haste')) && pow(c) >= 3); return cs.length && other(G, P).bf.some(isCreature) ? { score: 1 + Math.max(...cs.map(pow)) * 0.3 } : null; } });
  d.role = 'land';
  return d;
};
S['Throne of the High City'] = (d) => {
  d.mana = ['C'];
  d.acts.push({ cost: { m: C('{4}'), tap: true, sacSelf: true }, label: 'You become the monarch', when: ['end', 'main2'], eff: [monarchE()],
    ai: (G, P) => (G.monarch !== P.i && P.bf.filter(isLand).length >= 7 ? { score: monarchVal(G, P) } : null) });
  d.role = 'land';
  return d;
};
S['Scavenger Grounds'] = (d) => {
  d.mana = ['C'];
  d.acts.push({ cost: { m: C('{2}'), tap: true, sac: { f: { types: ['Land'], sub: 'Desert' }, label: 'Sacrifice a Desert' } }, label: 'Exile all graveyards', when: ['end', 'main1'],
    run: (G, X) => { for (const Q of G.players) { const n = Q.gy.length; while (Q.gy.length) L.exileCard(G, Q.gy[Q.gy.length - 1]); if (n) emit(G, 'exile', `${Q.name}'s graveyard (${n}) is exiled.`, { who: X.P.i }); } },
    ai: (G, P) => { const theirs = other(G, P).gy.filter((c) => c.def.types.includes('Creature') || c.def.flashback || c.def.gyActs).length; return theirs >= 3 && theirs > P.gy.length / 2 ? { score: theirs * 0.5 } : null; } });
  d.role = 'land';
  return d;
};
S['Secluded Courtyard'] = (d) => {
  chooseTypeAs(d);
  d.mana = null;
  d.manaAbs = [{ colors: ['C'] }, { colors: ANY, only: (purpose, c) => !!c && ((!!purpose.def && purpose.def.types.includes('Creature') && defOfType(purpose.def, c)) || (!!purpose.ability && !!purpose.src && isCreature(purpose.src) && ofType(purpose.src, c))) }];
  d.role = 'land';
  return d;
};
S['Sungrass Prairie'] = (d) => { d.mana = null; d.manaAbs = [{ colors: ['G', 'W'], amount: 2, conv: 1 }]; d.role = 'land'; return d; };

/* ============================================================ Artifacts */
S['Arcane Signet'] = (d) => { identityMana(d); d.role = 'ramp'; return d; };
S["Commander's Sphere"] = (d) => {
  identityMana(d);
  d.acts.push({ cost: { sacSelf: true }, label: 'Draw a card', when: ['end'], eff: [{ k: 'draw', n: 1 }], ai: (G, P) => (P.bf.filter(isLand).length >= 8 && P.hand.length <= 1 ? { score: 1 } : null) });
  d.role = 'ramp';
  return d;
};
S['Talisman of Conviction'] = painland('R', 'W');
S['Talisman of Dominance'] = painland('U', 'B');
S['Talisman of Indulgence'] = painland('B', 'R');
S['Talisman of Progress'] = painland('W', 'U');
S['Thought Vessel'] = (d) => { d.mana = ['C']; d.noMaxHand = true; d.role = 'ramp'; return d; };
S['Chromatic Lantern'] = (d) => { d.mana = null; d.manaAbs = [{ colors: ANY }]; d.landsAny = true; d.role = 'ramp'; return d; };
S['Relic of Legends'] = (d) => {
  d.mana = null;
  // Its own {T}, or tapping an untapped legendary creature you control (counted as one more source)
  d.manaAbs = [{ colors: ANY }];
  d.acts.push({ cost: { tapCreF: (x) => isLegendary(x), tapCre: 1 }, label: 'Tap a legendary creature: add one mana of any color', noAi: true,
    run: (G, X) => { const col = isHuman(G, X.P) ? ANY[chooseMode(G, X.P, X.src, 'Add which color?', ['White', 'Blue', 'Black', 'Red', 'Green'], 0)] : 'C'; L.addPool(G, X.P, [col]); } });
  d.role = 'ramp';
  return d;
};
S['Everflowing Chalice'] = (d) => {
  // Multikicker {2}: cast with up to four kicks, one charge counter each
  d.modes = [0, 1, 2, 3, 4].map((k) => ({ label: k ? `Kicked ${k === 1 ? 'once' : `${k} times`}: ${k} charge counter${k > 1 ? 's' : ''}` : 'Not kicked (no charge counters)', cost: k ? C(`{${2 * k}}`) : undefined, ai: () => (k ? 0.5 + k * 1.2 : -2) }));
  d.spell = null;
  d.etbCtr = (G, P, card, opts) => ({ charge: opts.item && opts.item.mode ? opts.item.mode[0] : 0 });
  d.mana = null;
  d.manaAbs = [{ colors: ['C'], amountFn: (G, c) => ctrCount(c, 'charge') }];
  d.castScore = (G, P, card) => (L.manaCount(P) < 4 ? -2 : 0);
  d.role = 'ramp';
  return d;
};
S['Coveted Jewel'] = (d) => {
  d.etb = [{ k: 'draw', n: 3 }];
  d.mana = null;
  d.manaAbs = [{ colors: ANY, amount: 3, one: true }];
  // Unblocked attackers take it: their controller draws three, gains control of it and untaps it
  d.trig.push(T('attacks', { opp: true, cond: (G, src, ev) => ev.cs.length > 0, run: (G, X) => {
    G.delayed.push({ when: 'combatEnd', run: (GG) => {
      const src = X.src;
      if (!onBf(GG, src) || src.ctrl === X.ev.P.i) return;
      if (!X.ev.cs.some((c) => onBf(GG, c) && !c.blocked && c.attacking !== false)) return;
      drawN(GG, X.ev.P, 3);
      gainControl(GG, X.ev.P, src, 'perm');
      src.tapped = false;
    } });
  } }));
  d.role = 'ramp';
  return d;
};
S["Wayfarer's Bauble"] = (d) => {
  d.acts.push({ cost: { m: C('{2}'), tap: true, sacSelf: true }, label: 'Search for a basic land, onto the battlefield tapped', when: ['main1', 'end'], run: (G, X) => fetchBasic(G, X.P), ai: (G, P) => (rampVal(G, P) ? { score: rampVal(G, P) } : null) });
  d.role = 'ramp';
  return d;
};
S['Trading Post'] = (d) => {
  d.acts.push(
    { cost: { m: C('{1}'), tap: true, discard: 1 }, label: 'Discard a card: gain 4 life', when: ['end'], eff: [{ k: 'gain', n: 4 }], ai: (G, P) => (P.life <= 15 && P.hand.length >= 2 ? { score: 1 } : null) },
    { cost: { m: C('{1}'), tap: true, life: 1 }, label: 'Pay 1 life: create a 0/1 Goat', when: ['end'], eff: [mkE(GOAT, 1)], ai: (G, P) => (P.life >= 12 ? { score: 0.5 } : null) },
    { cost: { m: C('{1}'), tap: true, sac: { f: { types: ['Creature'] }, label: 'Sacrifice a creature', prefer: (G, c) => (c.token ? 0 : 1) + cv(c) } }, label: 'Sacrifice a creature: return an artifact card from your graveyard', when: ['end'],
      eff: [{ k: 'regrow', tgt: { what: 'gy', mine: true, f: { types: ['Artifact'] } } }], ai: (G, P) => (P.gy.some((c) => c.def.types.includes('Artifact') && c.def.value >= 2.5) && P.bf.some((c) => c.token && hasSub(c, 'Goat')) ? { score: 1.2 } : null) },
    { cost: { m: C('{1}'), tap: true, sac: { f: { types: ['Artifact'] }, label: 'Sacrifice an artifact', prefer: (G, c) => (c.token ? 0 : 2) + pv(G, c) } }, label: 'Sacrifice an artifact: draw a card', when: ['end'],
      eff: [{ k: 'draw', n: 1 }], ai: (G, P) => (P.bf.some((c) => c.token && isArtifact(c) && !isCreature(c) && !hasSub(c, 'Treasure')) ? { score: 1 } : null) });
  d.role = 'value';
  return d;
};
S['Door of Destinies'] = (d) => {
  chooseTypeAs(d);
  d.trig.push(T('cast', { you: true, cond: (G, src, ev) => !!ev.card && defOfType(ev.card.def, src), run: (G, X) => addCounters(G, X.src, 1, 'charge') }));
  d.statics.push({ who: 'all', f: { side: 'you', fn: (G, c, P, src) => ofType(c, src) }, pFn: (G, src) => ctrCount(src, 'charge'), tFn: (G, src) => ctrCount(src, 'charge'), kw: [] });
  d.role = 'value';
  return d;
};
S["Herald's Horn"] = (d) => {
  chooseTypeAs(d);
  d.spellDiscount = (G, P, card, src) => (card.def.types.includes('Creature') && defOfType(card.def, src) ? 1 : 0);
  d.trig.push(T('upkeep', { you: true, run: (G, X) => {
    const P = X.P, top = P.library[P.library.length - 1];
    if (!top) return;
    if (top.def.types.includes('Creature') && defOfType(top.def, X.src)) { P.library.pop(); P.hand.push(top); dirty(G); emit(G, 'draw', `${P.name} reveals ${top.def.name} and puts it into their hand (${X.src.def.name}).`, { who: P.i, cards: [top.id] }); }
  } }));
  d.role = 'value';
  return d;
};
S['Skullclamp'] = (d) => {
  d.statics = d.statics.filter((x) => x.who !== 'equipped');
  d.statics.push({ who: 'equipped', p: 1, t: -1, kw: [] });
  d.trig.push(T('die', { cond: (G, src, ev) => (ev.eqs || []).includes(src), eff: [{ k: 'draw', n: 2 }] }));
  d.role = 'value';
  return d;
};
S["Hero's Blade"] = (d) => {
  d.trig.push(T('enter', { you: true, cond: (G, src, ev) => isCreature(ev.c) && isLegendary(ev.c), may: true, mayLabel: 'Attach Hero\'s Blade to it?',
    run: (G, X) => { if (onBf(G, X.ev.c)) attach(G, X.src, X.ev.c); } }));
  return d;
};
S['Sword of the Animist'] = (d) => {
  d.trig.push(T('attack', { cond: (G, src, ev) => ev.c.id === src.att, may: true, mayLabel: 'Search for a basic land?', mayAi: (G, X) => X.P.library.some(basicLand), run: (G, X) => fetchBasic(G, X.P) }));
  return d;
};
S['Tome of Legends'] = (d) => {
  d.etbCtr = () => ({ page: 1 });
  d.trig.push(cmdEnters({ run: (G, X) => addCounters(G, X.src, 1, 'page') }), cmdAttacks({ run: (G, X) => addCounters(G, X.src, 1, 'page') }));
  d.acts.push({ cost: { m: C('{1}'), tap: true, ctr: { kind: 'page', n: 1 } }, label: 'Draw a card', when: ['end'], eff: [{ k: 'draw', n: 1 }], ai: () => ({ score: 1.1 }) });
  d.role = 'value';
  return d;
};
S['Solemn Simulacrum'] = (d) => {
  d.etb = [fn((G, X) => fetchBasic(G, X.P), { score: rampVal })];
  d.dies = [{ k: 'draw', n: 1 }];
  return d;
};

/* ============================================================ White */
S['Bastion Protector'] = (d) => { d.statics.push({ who: 'all', f: { side: 'you', fn: (G, c) => isCommander(c) }, p: 2, t: 2, kw: ['indestructible'] }); return d; };
S['Palace Jailer'] = (d) => {
  // Exiled until an opponent becomes the monarch
  d.etb = [monarchE(), fn((G, X, t) => {
    const c = t && t.c;
    if (!c || !onBf(G, c)) return;
    if (c.ctrl !== X.P.i) X.P.stats.kills++;
    exilePermanent(G, X.P, c);
    if (!c.token) (G.jail = G.jail || []).push({ c, by: X.P.i });
  }, { tgt: { f: { side: 'opp' } }, val: (G, P, c) => pv(G, c) + 0.5, label: 'Exile a creature an opponent controls' })];
  d.role = 'removal';
  return d;
};
S['Destroy Evil'] = (d) => {
  d.modes = [
    { label: 'Destroy a creature with toughness 4 or greater', eff: [{ k: 'destroyP', tgt: { f: { fn: (G, c) => tou(c) >= 4 } } }] },
    { label: 'Destroy an enchantment', eff: [{ k: 'destroyP', tgt: { f: { types: ['Enchantment'] } } }] },
  ];
  d.spell = null;
  d.role = 'removal';
  return d;
};
S['Dispatch'] = (d) => {
  d.spell = [fn((G, X, t) => { const c = t && t.c; if (!c || !onBf(G, c)) return; if (count(X.P, isArtifact) >= 3) { if (c.ctrl !== X.P.i) X.P.stats.kills++; exilePermanent(G, X.P, c); } else { c.tapped = true; emit(G, 'tapfx', `${c.def.name} is tapped.`, { who: X.P.i, cards: [c.id] }); } },
    { tgt: { f: {} }, val: (G, P, c) => (c.ctrl === P.i ? -2 : count(P, isArtifact) >= 3 ? pv(G, c) + 0.5 : c.tapped ? 0 : cv(c) * 0.3), label: 'Choose a creature' })];
  d.role = 'removal';
  return d;
};
S['Cut a Deal'] = (d) => { d.spell = [fn((G, X) => { drawN(G, X.O, 1); drawN(G, X.P, 1); }, { score: () => 0.3 })]; return d; };
S['Cleansing Nova'] = (d) => {
  d.modes = [
    { label: 'Destroy all creatures', eff: [{ k: 'destroyAll', f: {} }] },
    { label: 'Destroy all artifacts and enchantments', eff: [fn((G, X) => destroyEach(G, X.P, allPerms(G).filter((c) => isArtifact(c) || isEnchantment(c))), { score: (G, P) => sweepVal(G, P, (c) => isArtifact(c) || isEnchantment(c)) })] },
  ];
  d.spell = null;
  d.role = 'sweeper';
  return d;
};
S['Austere Command'] = (d) => {
  const kinds = [
    ['Destroy all artifacts', (c) => isArtifact(c)],
    ['Destroy all enchantments', (c) => isEnchantment(c)],
    ['Destroy all creatures with mana value 3 or less', (c) => isCreature(c) && c.def.mv <= 3],
    ['Destroy all creatures with mana value 4 or greater', (c) => isCreature(c) && c.def.mv >= 4],
  ];
  d.modes = kinds.map(([label, f]) => ({ label, eff: [fn((G, X) => destroyEach(G, X.P, allPerms(G).filter(f)), { score: (G, P) => sweepVal(G, P, f) })] }));
  d.modeN = 2;
  d.spell = null;
  d.role = 'sweeper';
  return d;
};
S['Collective Effort'] = (d) => {
  // Escalate (tap a creature per extra mode): played as one mode, or all three for two tapped creatures
  const m1 = { label: 'Destroy a creature with power 4 or greater', eff: [{ k: 'destroyP', tgt: { f: { powGE: 4 } } }] };
  const m2 = { label: 'Destroy an enchantment', eff: [{ k: 'destroyP', tgt: { f: { types: ['Enchantment'] } } }] };
  const m3 = { label: 'A +1/+1 counter on each creature you control', eff: [fn((G, X) => L.mshKit.ctrEach(G, X.P.bf.filter(isCreature), 1), { score: (G, P) => P.bf.filter(isCreature).length * 0.8 })] };
  d.modes = [m1, m2, m3, { label: 'All three (escalate: tap two creatures you control)', eff: m1.eff.concat(m2.eff, m3.eff), addCost: { tapCre: 2 } }];
  d.spell = null;
  d.role = 'removal';
  return d;
};
S['Promise of Loyalty'] = (d) => {
  d.spell = [fn((G, X) => {
    for (const Q of [X.P, X.O]) {
      const cs = Q.bf.filter(isCreature);
      if (!cs.length) continue;
      const keep = pickOne(G, Q, cs, 'Keep which creature (it gets a vow counter)?', (c) => cv(c));
      addCounters(G, keep, 1, 'vow');
      keep.mem.vowBy = X.P.i;
      for (const c of cs) if (c !== keep && onBf(G, c)) sacrifice(G, Q, c, true);
      emit(G, 'sac', `${Q.name} keeps ${keep.def.name} and sacrifices the rest.`, { who: Q.i, cards: [keep.id] });
    }
  }, { score: (G, P) => { const mine = P.bf.filter(isCreature).map(cv).sort((a, b) => b - a), theirs = other(G, P).bf.filter(isCreature).map(cv).sort((a, b) => b - a); return theirs.slice(1).reduce((s, v) => s + v, 0) - mine.slice(1).reduce((s, v) => s + v, 0) - 1; } })];
  // A creature with a vow counter can't attack the player who cast this (in a duel: can't attack at all, if that's its opponent)
  d.role = 'sweeper';
  return d;
};
S['Tragic Arrogance'] = (d) => {
  d.spell = [fn((G, X) => {
    for (const Q of [X.P, X.O]) {
      const mine = Q === X.P;
      const keep = new Set();
      for (const [type, f] of [['artifact', isArtifact], ['creature', isCreature], ['enchantment', isEnchantment], ['planeswalker', (c) => !!c.def.loyalty]]) {
        const cs = Q.bf.filter((c) => !isLand(c) && f(c) && !keep.has(c));
        if (!cs.length) continue;
        const pick = isHuman(G, X.P) ? pickOne(G, X.P, cs, `Tragic Arrogance: the ${type} ${Q.name} keeps`, (c) => cv(c)) : cs.slice().sort((a, b) => (mine ? pv(G, b) - pv(G, a) : pv(G, a) - pv(G, b)))[0];
        keep.add(pick);
      }
      for (const c of Q.bf.filter((x) => !isLand(x) && !keep.has(x))) if (onBf(G, c)) sacrifice(G, Q, c, true);
      emit(G, 'sac', `${Q.name} keeps ${keep.size ? nameList([...keep]) : 'nothing'} and sacrifices the rest.`, { who: Q.i });
    }
  }, { score: (G, P) => { const v = (Q) => Q.bf.filter((c) => !isLand(c)).reduce((s, c) => s + pv(G, c), 0); return v(other(G, P)) * 0.6 - v(P) * 0.4 - 1; } })];
  d.role = 'sweeper';
  return d;
};
S['Vanquish the Horde'] = (d) => {
  d.costMod = (G) => nCre(G);
  d.spell = [{ k: 'destroyAll', f: {} }];
  d.role = 'sweeper';
  return d;
};
S['Clever Concealment'] = (d) => {
  d.convoke = true;
  d.spell = [fn((G, X) => { const cs = X.P.bf.filter((c) => !isLand(c)); const pick = isHuman(G, X.P) ? pickSome(G, X.P, cs, 0, cs.length, 'Phase out which permanents?', () => 1) : cs.filter((c) => pv(G, c) >= 1.5); for (const c of pick) phaseOut(G, c); },
    { score: (G, P) => (allCreatures(G).filter((c) => c.ctrl !== P.i).length >= 2 ? 0.5 : 0.1) })];
  // The AI saves it for a sweeper: it casts it in response to a spell that would wreck its board
  d.respondOnly = true;
  d.respond = { counter: false,
    legal: (G, O, item) => item.P !== O,
    ai: (G, O, item) => { const eff = L.spellEffects(item.card.def, item.mode); return eff.some((e) => ['destroyAll', 'wrath'].includes(e.k)) ? O.bf.filter((c) => !isLand(c)).reduce((s, c) => s + pv(G, c), 0) : 0; },
    res: (G, O) => { for (const c of O.bf.filter((x) => !isLand(x))) phaseOut(G, c); emit(G, 'info', `${O.name}'s nonland permanents phase out.`, { who: O.i }); return false; } };
  d.role = 'trick';
  return d;
};

/* ============================================================ Blue */
S['Arcane Denial'] = (d) => {
  d.spell = [{ k: 'counter' }, fn((G, X) => {
    const item = X.countered, Q = item ? item.P : X.O, P = X.P;
    nextUpkeep(G, P, X.src, (GG) => {
      const n = isHuman(GG, Q) ? chooseMode(GG, Q, X.src, 'Arcane Denial: draw how many cards?', ['Two', 'One', 'None'], 0) : 0;
      drawN(GG, Q, [2, 1, 0][n]);
      drawN(GG, P, 1);
    });
  }, { score: () => 0 })];
  d.role = 'counter';
  return d;
};
S['Deep Analysis'] = (d) => {
  d.spell = [fn((G, X, t) => drawN(G, G.players[t ? t.p : X.P.i], 2), { tgt: { what: 'player' }, val: (G, P, x) => (x.p === P.i ? 2 : -2), label: 'Choose a player to draw two cards' })];
  d.flashback = C('{1}{U}');
  d.flashbackLife = 3;
  d.role = 'draw';
  return d;
};
S['Raise the Palisade'] = (d) => {
  d.spell = [fn((G, X) => {
    const t = chooseCreatureType(G, X.P, X.src, (ty) => X.P.bf.filter((c) => isCreature(c) && hasSub(c, ty)).reduce((s, c) => s + cv(c), 0) - X.O.bf.filter((c) => isCreature(c) && hasSub(c, ty)).reduce((s, c) => s + cv(c), 0));
    const cs = allCreatures(G).filter((c) => !hasSub(c, t));
    for (const c of cs) if (onBf(G, c)) bounceCard(G, X.P, c);
  }, { score: (G, P) => { const best = L.creatureTypesOf(G, P).slice(0, 6).map((ty) => allCreatures(G).filter((c) => !hasSub(c, ty)).reduce((s, c) => s + (c.ctrl === P.i ? -cv(c) * 0.6 : cv(c) * 0.7 + (c.token ? 0.8 : 0)), 0)); return Math.max(0, ...best) - 1; } })];
  d.role = 'sweeper';
  return d;
};
S['Propaganda'] = (d) => { d.attackTax = () => 2; d.role = 'value'; d.value = 2.6; return d; };

/* ============================================================ Black */
S['Reanimate'] = (d) => {
  d.spell = [fn((G, X, t) => { const c = t && t.c; if (!c) return; const mv = c.def.mv; if (reanimate(G, X.P, c)) loseLife(G, X.P, mv); },
    { tgt: { what: 'gy', f: { types: ['Creature'] } }, val: (G, P, c) => c.def.value * 0.8 - (P.life - c.def.mv < 8 ? 4 : c.def.mv * 0.15), label: 'Choose a creature card in a graveyard' })];
  d.castIf = (G, P) => gyCreatures(G).length > 0;
  d.role = 'value';
  return d;
};
S['Toxic Deluge'] = (d) => {
  // Pay X life: the AI picks the smallest X that clears what matters
  d.spell = [fn((G, X) => {
    const P = X.P;
    const opts = [1, 2, 3, 4, 5, 6, 7, 8].filter((n) => n < P.life);
    let n;
    if (isHuman(G, P)) n = L.chooseNumber(G, P, X.src, 'Toxic Deluge: pay how much life?', 0, Math.max(0, P.life - 1), 3);
    else n = opts.map((k) => ({ k, s: shrinkVal(G, P, k) - k * 0.35 })).sort((a, b) => b.s - a.s)[0].k;
    loseLife(G, P, n);
    shrinkAll(G, P, n);
  }, { score: (G, P) => Math.max(...[1, 2, 3, 4, 5, 6].filter((n) => n < P.life - 4).map((n) => shrinkVal(G, P, n) - n * 0.35), -1) })];
  d.role = 'sweeper';
  return d;
};
S['Syphon Mind'] = (d) => { d.spell = [fn((G, X) => { const n = X.O.hand.length ? 1 : 0; discardE(G, X.O, 1, 'discard'); drawN(G, X.P, n); }, { score: (G, P) => (other(G, P).hand.length ? 1.6 : 0.2) })]; d.role = 'draw'; return d; };
S['Lethal Scheme'] = (d) => {
  d.convoke = true;
  d.spell = [{ k: 'destroyP', tgt: { f: { types: ['Creature', 'Planeswalker'] } } }, fn((G, X) => { for (const c of (X.item && X.item.convoked) || []) if (onBf(G, c)) connive(G, X.P, c, 1); }, { score: () => 0 })];
  d.role = 'removal';
  return d;
};

/* ============================================================ Red */
S['Anger'] = (d) => {
  // From the graveyard, with a Mountain: creatures you control have haste
  d.gyStatics = [{ f: { side: 'you' }, cond: (G, g, P) => P.bf.some((c) => isLand(c) && hasSub(c, 'Mountain')), kw: ['haste'] }];
  return d;
};
S['Blasphemous Act'] = (d) => { d.costMod = (G) => nCre(G); d.spell = [{ k: 'dmgAll', n: 13 }]; d.role = 'sweeper'; return d; };
S['Chaos Warp'] = (d) => {
  d.spell = [fn((G, X, t) => {
    const c = t && t.c;
    if (!c || !onBf(G, c)) return;
    const owner = G.players[c.owner];
    if (c.ctrl !== X.P.i && isCreature(c)) X.P.stats.kills++;
    L.leaveBattlefield(G, c); L.resetCard(c);
    if (!c.token) { owner.library.push(c); G.rng.shuffle(owner.library); }
    emit(G, 'exile', `${c.def.name} is shuffled into ${owner.name}'s library.`, { who: X.P.i, cards: [c.id] });
    const top = owner.library[owner.library.length - 1];
    if (!top) return;
    emit(G, 'reveal', `${owner.name} reveals ${top.def.name}.`, { who: owner.i, cards: [top.id] });
    if (!top.def.types.includes('Instant') && !top.def.types.includes('Sorcery')) putOntoBattlefield(G, owner, top);
  }, { tgt: { f: { types: ['any'] } }, val: (G, P, c) => (c.ctrl === P.i ? -pv(G, c) - 2 : pv(G, c) - 1), label: 'Choose a permanent' })];
  d.role = 'removal';
  return d;
};
S['Vandalblast'] = (d) => {
  d.modes = [
    { label: "Destroy an artifact you don't control", eff: [{ k: 'destroyP', tgt: { f: { types: ['Artifact'], side: 'opp' } } }] },
    { label: "Overload: destroy each artifact you don't control", cost: C('{3}'), eff: [fn((G, X) => destroyEach(G, X.P, X.O.bf.filter(isArtifact)), { score: (G, P) => other(G, P).bf.filter(isArtifact).reduce((s, c) => s + pv(G, c), 0) - 1 })] },
  ];
  d.spell = null;
  d.role = 'removal';
  return d;
};
S['Taunt from the Rampart'] = (d) => {
  d.spell = [fn((G, X) => {
    // Until your next turn they can't block: in a duel, that's the rest of this turn
    const cs = X.O.bf.filter(isCreature);
    for (const c of cs) { goad(G, X.P, c); c.tf.cantBlock = true; }
    emit(G, 'info', `${X.O.name}'s creatures can't block until ${X.P.name}'s next turn.`, { who: X.P.i, cards: cs.map((c) => c.id) });
  }, { score: (G, P) => other(G, P).bf.filter(isCreature).reduce((s, c) => s + cv(c) * 0.5, 0) + P.bf.filter((c) => isCreature(c) && !c.tapped).length * 0.6 - 1 })];
  return d;
};

/* ============================================================ Green */
S['Three Visits'] = (d) => {
  d.spell = [fn((G, X) => { const got = searchLibrary(G, X.P, (c) => c.def.types.includes('Land') && c.def.sub.includes('Forest'), 1, 'bf', 'Search for a Forest card'); if (got.length) emit(G, 'search', `${X.P.name} puts ${got[0].def.name} onto the battlefield.`, { who: X.P.i, cards: [got[0].id] }); },
    { score: (G, P) => (P.library.some((c) => c.def.sub.includes('Forest')) ? 1.8 : 0) })];
  d.role = 'ramp';
  return d;
};

/* ============================================================ Multicolor */
S['Bedevil'] = (d) => { d.spell = [{ k: 'destroyP', tgt: { f: { types: ['Artifact', 'Creature', 'Planeswalker'] } } }]; d.role = 'removal'; return d; };

return S;
});
