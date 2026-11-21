/* The Lord of the Rings: Tales of Middle-earth Commander decks (Elven Council, Food and Fellowship, Riders of Rohan,
   The Hosts of Mordor): rules for the cards the engine's reader can't handle on its own. Built from cmdr.js's kit
   (the monarch, voting, the commander's identity, creature types), so this file loads after cmdr.js.
   These decks are made for four players; in a duel "each opponent" is the one opponent, "the player to your right" is
   that opponent too, and every vote has two voters. */
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
  nameList, gainControl, sacrifice, discardChoice, canPay, pay, pickCards, isIS, scryChoice, exileUntil, equipmentOn, becomeMonarch, monarchVal, vote, chooseCreatureType,
  cmdIdentity, isCommander, genericCost, goad, tempt, amass, FOOD, TREASURE, ringBearer, foodsOf, legendsOf, castNow, copySpell, damageCreature, dealDamage, subOf, ANY } = L;
const { C, T, fn, YOU, OPP, drawN, edictOf, gain, grantKw, hit, hitOpp, loseLife, mk, mkE, pickOne, pickSome, pump, say, ctx0, holdUntilLeaves, untap, discardE, lookTake,
  ctrEach, chooseOne, copyToken, untilMyNextEnd, impulse, batchOnce } = L.mshKit;
const { tok, kicker, borrow, borrowVal } = L.coreKit;
const { BIRD_U, count, nCre, monarchE, noMonarch, chooseTypeAs, ofType, defOfType, reanimate, gyCreatures, destroyEach, sweepVal, shrinkAll, shrinkVal, basicLand, fetchBasic, rampVal,
  revealLand, painland } = L.cmdKit;
const S = {};

/* ============================================================ Shared pieces */
const HUMAN = tok('Human', 1, 1, ['W'], ['Human']);
const HUMAN_SOLDIER = tok('Human Soldier', 1, 1, ['W'], ['Human', 'Soldier']);
const HUMAN_KNIGHT = tok('Human Knight', 2, 2, ['R'], ['Human', 'Knight'], ['trample', 'haste']);
const HALFLING = tok('Halfling', 1, 1, ['W'], ['Halfling']);
const ELF_WARRIOR = tok('Elf Warrior', 1, 1, ['G'], ['Elf', 'Warrior']);
const WRAITH = tok('Wraith', 3, 3, ['B'], ['Wraith'], ['menace']);
const BEAST = tok('Beast', 3, 3, ['G'], ['Beast']);
const SOLDIER_LL = tok('Soldier', 1, 1, ['W'], ['Soldier'], ['lifelink']);
const giveFlying = () => fn((G, X, t) => { const c = t && t.c; if (c && onBf(G, c)) grantKw(G, c, ['flying']); }, { tgt: { f: { attacking: true } }, val: (G, P, c) => (c.ctrl === P.i && !has(c, 'flying') ? 1 + pow(c) * 0.3 : -1), label: 'An attacking creature gains flying' });
const EAGLE = tok('Bird', 3, 3, ['W'], ['Bird'], ['flying'], { text: 'Flying\nWhenever this token attacks, target attacking creature gains flying until end of turn.', trig: [T('attack', { self: true, eff: [giveFlying()] })] });
const treefolk = (x) => tok('Treefolk', x, x, ['G'], ['Treefolk']);
const food = (G, P, n = 1) => mk(G, P, FOOD, n);
const treasure = (G, P, n = 1) => mk(G, P, TREASURE, n);
const gained = (P) => P.gainedTurn || 0;
const humans = (P) => P.bf.filter((c) => isCreature(c) && hasSub(c, 'Human'));
const elves = (P) => P.bf.filter((c) => isCreature(c) && hasSub(c, 'Elf'));
const foodE = (n = 1) => ({ k: 'food', n });
const isFood = (c) => hasSub(c, 'Food') && !isCreature(c);
const greatestPow = (P) => Math.max(0, ...P.bf.filter(isCreature).map(pow));
// "Another Human/Elf/legend entered under your control this turn"
const enteredOfType = (G, P, pred, but) => L.enteredThisTurn(G, P).some((c) => c !== but && pred(c));
const creType = (t) => (c) => c.def.types.includes('Creature') && (c.def.sub.includes(t) || hasSub(c, t));
// Sacrifice one of your Foods (the AI gives up the one it values least); false if there's none
function sacFood(G, P, n = 1) {
  const fs = foodsOf(P);
  if (fs.length < n) return false;
  const pick = isHuman(G, P) && fs.length > n ? pickCards(G, { type: 'choose', reason: 'sacrifice-cost', n, min: n, max: n, zone: 'battlefield', cards: fs.map((c) => c.id), label: 'Sacrifice Food' }, fs, n) : fs.slice(0, n);
  for (const c of pick) sacrifice(G, P, c, true);
  emit(G, 'sac', `${P.name} sacrifices ${n === 1 ? 'a Food' : `${n} Foods`}.`, { who: P.i, cards: pick.map((c) => c.id) });
  return true;
}
// Dash: cast it for its dash cost instead; it gains haste and goes back to its owner's hand at the next end step
function dash(d, cost, ai) {
  d.modes = [{ label: 'Cast normally' }, { label: `Dash (${cost}): haste, back to your hand at end of turn`, alt: C(cost), ai: ai || (() => 0.5) }];
  d.spell = null;
  d.etb = (d.etb || []).concat(fn((G, X) => {
    if (!(X.item && X.item.mode && X.item.mode.includes(1))) return;
    const c = X.src;
    grantKw(G, c, ['haste']);
    G.delayed.push({ when: 'end', run: (GG) => { if (onBf(GG, c)) bounceCard(GG, GG.players[c.ctrl], c); } });
  }, { score: () => 0 }));
  return d;
}
const dashed = (X) => !!(X.item && X.item.mode && X.item.mode.includes(1));
// Persist: back from the graveyard with a -1/-1 counter, if it had none
const persist = (d) => {
  d.trig.push(T('die', { self: true, cond: (G, src, ev) => (ev.cnt || 0) >= 0 && !ev.token, run: (G, X) => {
    const c = X.ev.c, O = G.players[c.owner];
    if (!O.gy.includes(c)) return;
    emit(G, 'raise', `${c.def.name} persists: it returns with a -1/-1 counter.`, { who: O.i, cards: [c.id] });
    putOntoBattlefield(G, O, c, { ctr: { '-1/-1': 1 } });
  } }));
  return d;
};
// Exert as it attacks: it won't untap during your next untap step
const exert = (G, c) => { c.stun = true; c.mem.exerted = G.turn; emit(G, 'tapfx', `${c.def.name} is exerted.`, { who: c.ctrl, cards: [c.id] }); };
// An extra combat after this one (untapping the attackers first, when asked)
const extraCombat = (G, P, untapThese) => { for (const c of untapThese || []) if (onBf(G, c)) c.tapped = false; G.extraCombat = true; emit(G, 'info', `${P.name} gets an additional combat phase after this one.`, { who: P.i }); };
// Aftermath: the second half is cast from the graveyard (an ability of the card there, then it's exiled)
const aftermath = (cost, label, run, ai) => ({ cost: { m: C(cost), exileSelf: true }, sorcery: true, label, run, when: ['main1', 'main2'], ai: ai || (() => ({ score: 1 })) });
// Goaded creatures and "creatures can't block": per creature for the rest of this turn
const noBlocks = (G, cs) => { for (const c of cs) c.tf.cantBlock = true; dirty(G); };
// A vote where the AI just wants what's best for itself: score(G, Q, k)
const tally = (r, k) => r.tally[k] || 0;
// "Exile [this spell]" as it resolves: it's already in the graveyard by then, so it moves on to exile
const exileSpell = (G, card) => { const O = G.players[card.owner]; const k = O.gy.indexOf(card); if (k >= 0) { O.gy.splice(k, 1); O.exile.push(card); dirty(G); } };

/* ============================================================ Lands */
S['Access Tunnel'] = (d) => {
  d.mana = ['C'];
  d.acts.push({ cost: { m: C('{3}'), tap: true }, label: "Target creature with power 3 or less can't be blocked this turn", when: ['main1'],
    eff: [fn((G, X, t) => { const c = t && t.c; if (c && onBf(G, c)) { c.tf.unblockable = true; grantKw(G, c, [], "can't be blocked this turn"); } },
      { tgt: { f: { side: 'you', fn: (G, c) => pow(c) <= 3 } }, val: (G, P, c) => (c.tapped || (c.sick && !has(c, 'haste')) ? -1 : pow(c) * 0.5 + (c.def.hit.length || c.def.trig.some((t) => t.on === 'hitPlayer') ? 1 : 0)), label: 'Choose a creature with power 3 or less' })],
    ai: (G, P) => { const cs = P.bf.filter((c) => isCreature(c) && !c.tapped && (!c.sick || has(c, 'haste')) && pow(c) >= 2 && pow(c) <= 3); return cs.length && other(G, P).bf.some(isCreature) ? { score: 1 } : null; } });
  d.role = 'land';
  return d;
};
S['Field of Ruin'] = (d) => {
  d.mana = ['C'];
  d.acts.push({ cost: { m: C('{2}'), tap: true, sacSelf: true }, label: 'Destroy a nonbasic land an opponent controls; each player searches for a basic land', when: ['end'],
    eff: [fn((G, X, t) => {
      const c = t && t.c;
      if (c && onBf(G, c)) destroyPermanent(G, X.P, c);
      for (const Q of [X.P, X.O]) fetchBasic(G, Q, false);
    }, { tgt: { f: { types: ['Land'], side: 'opp', fn: (G, c) => !c.def.supertypes.includes('Basic') } }, val: (G, P, c) => (c.def.mana && c.def.mana.length >= 2 ? 1 : 0.3) + (c.def.acts.length ? 1 : 0), label: 'Choose a nonbasic land an opponent controls' })],
    ai: (G, P) => (other(G, P).bf.some((c) => isLand(c) && !c.def.supertypes.includes('Basic') && (c.def.acts.length || (c.def.manaAbs && c.def.manaAbs.some((ab) => ab.colorsFn)))) ? { score: 1.2 } : null) });
  d.role = 'land';
  return d;
};
S['Ghost Quarter'] = (d) => {
  d.mana = ['C'];
  d.acts.push({ cost: { tap: true, sacSelf: true }, label: 'Destroy a land; its controller may search for a basic land', when: ['end'],
    eff: [fn((G, X, t) => { const c = t && t.c; if (!c || !onBf(G, c)) return; const Q = G.players[c.ctrl]; destroyPermanent(G, X.P, c); fetchBasic(G, Q, false); },
      { tgt: { f: { types: ['Land'], side: 'opp', fn: (G, c) => !c.def.supertypes.includes('Basic') } }, val: (G, P, c) => (c.def.acts.length ? 1.5 : 0.2), label: 'Choose a land' })],
    ai: (G, P) => (other(G, P).bf.some((c) => isLand(c) && !c.def.supertypes.includes('Basic') && c.def.acts.length && c.def.acts.some((a) => a.label && /monarch|exile|destroy/i.test(a.label))) ? { score: 1.2 } : null) });
  d.role = 'land';
  return d;
};
S['Murmuring Bosk'] = (d) => {
  // A Forest (it taps for {G}), or {W}/{B} for 1 damage; tapped unless you reveal a Treefolk card
  d.mana = null;
  d.manaAbs = [{ colors: ['G'] }, { colors: ['W', 'B'], painOnColor: true, life: 1 }];
  d.tappedUnless = (G, P) => P.hand.some((c) => c.def.sub.includes('Treefolk'));
  d.role = 'land';
  return d;
};
S['Necroblossom Snarl'] = revealLand('B', 'G', ['Swamp', 'Forest']);
S['The Black Gate'] = (d) => {
  d.mana = ['B'];
  // Pay 3 life as it enters, or it enters tapped (the AI pays when it has the life to spare and something to cast)
  d.tappedUnless = (G, P) => {
    const pay3 = isHuman(G, P) ? P.life > 3 && yesNo(G, P, null, 'The Black Gate: pay 3 life so it enters untapped?', false) : P.life > 15 && P.hand.some((c) => !isLand(c) && c.def.mv === P.bf.filter(isLand).length);
    if (pay3) loseLife(G, P, 3);
    return pay3;
  };
  d.acts.push({ cost: { m: C('{1}{B}'), tap: true }, label: "Target creature can't be blocked this turn by the player with the most life", when: ['main1'],
    eff: [fn((G, X, t) => {
      const c = t && t.c;
      if (!c || !onBf(G, c)) return;
      const most = Math.max(...G.players.map((Q) => Q.life));
      if (other(G, X.P).life === most || G.players[c.ctrl] === X.P) { c.tf.unblockable = true; grantKw(G, c, [], "can't be blocked this turn"); }
    }, { tgt: { f: { side: 'you' } }, val: (G, P, c) => (c.tapped || (c.sick && !has(c, 'haste')) ? -1 : pow(c) * 0.5), label: 'Choose a creature' })],
    ai: (G, P) => { const O = other(G, P); const cs = P.bf.filter((c) => isCreature(c) && !c.tapped && (!c.sick || has(c, 'haste')) && pow(c) >= 3); return cs.length && O.life >= P.life && O.bf.some(isCreature) ? { score: 1.2 } : null; } });
  d.role = 'land';
  return d;
};
S['Windbrisk Heights'] = (d) => {
  d.mana = ['W'];
  d.etbTapped = true;
  // Hideaway 4: one of the top four is exiled face down
  d.etb = [fn((G, X) => {
    const P = X.P, top = P.library.splice(Math.max(0, P.library.length - 4)).reverse();
    if (!top.length) return;
    const c = pickOne(G, P, top, 'Exile one face down (Hideaway)', (x) => x.def.value + x.def.mv * 0.4, 'look', 'library');
    const rest = top.filter((x) => x !== c);
    G.rng.shuffle(rest); P.library.unshift(...rest);
    P.exile.push(c);
    X.src.mem.hidden = c.id;
    say(G, P, `${P.name} exiles a card face down (hideaway).`);
  }, { score: () => 0.5 })];
  d.acts.push({ cost: { m: C('{W}'), tap: true }, label: 'Play the hidden card for free', when: ['main2'], cond: (G, P, c) => P.atkTurn === G.turn && (P.atkLog || []).length >= 3 && P.exile.some((x) => x.id === c.mem.hidden),
    eff: [fn((G, X) => {
      const P = X.P, c = P.exile.find((x) => x.id === X.src.mem.hidden);
      if (!c) return;
      X.src.mem.hidden = null;
      if (isLand(c)) { if (P.landsPlayed < L.landLimit(G, P)) L.playLandChoice(G, P, { c, from: 'exile' }); else X.src.mem.hidden = c.id; return; }
      castNow(G, P, c, { free: true, ask: false });
    }, { score: () => 3 })], ai: () => ({ score: 3 }) });
  d.role = 'land';
  return d;
};

/* ============================================================ Artifacts */
S['Basalt Monolith'] = (d) => {
  d.mana = null;
  d.manaAbs = [{ colors: ['C'], amount: 3 }];
  d.statics.push({ who: 'self', p: 0, t: 0, kw: [], flags: { noUntap: true } });
  d.acts.push({ cost: { m: C('{3}') }, label: 'Untap Basalt Monolith', when: ['end'], cond: (G, P, c) => c.tapped, run: (G, X) => untap(G, X.src, X.P), ai: (G, P) => (L.manaCount(P) >= 5 && G.active !== P.i ? { score: 0.6 } : null) });
  d.role = 'ramp';
  return d;
};
S['Crown of Gondor'] = (d) => {
  d.statics = d.statics.filter((x) => x.who !== 'equipped');
  d.statics.push({ who: 'equipped', pFn: (G, src) => count(G.players[src.ctrl], isCreature), tFn: (G, src) => count(G.players[src.ctrl], isCreature), kw: [] });
  d.trig.push(T('enter', { you: true, cond: (G, src, ev) => isCreature(ev.c) && isLegendary(ev.c) && noMonarch(G), run: (G, X) => { if (noMonarch(G)) becomeMonarch(G, X.P); } }));
  d.acts = d.acts.filter((a) => !a.equip);
  d.acts.push({ equip: true, cost: { m: C('{4}') }, sorcery: true, label: 'Equip {4}', costMod: (G, P) => (G.monarch === P.i ? 3 : 0) });
  return d;
};
S['Field-Tested Frying Pan'] = (d) => {
  d.etb = [fn((G, X) => {
    food(G, X.P);
    const [h] = mk(G, X.P, HALFLING, 1);
    if (h && onBf(G, X.src)) attach(G, X.src, h);
  }, { score: () => 2.4 })];
  // The equipped creature gets +X/+X until end of turn whenever you gain X life
  d.trig.push(T('gain', { you: true, cond: (G, src) => src.att != null, run: (G, X) => { const h = byId(G, X.src.att); if (h && onBf(G, h)) pump(G, h, X.ev.n, X.ev.n); } }));
  return d;
};
S['Heirloom Blade'] = (d) => {
  d.trig.push(T('die', { cond: (G, src, ev) => (ev.eqs || []).includes(src), may: true, mayLabel: 'Reveal cards until a creature that shares a type with it?', run: (G, X) => {
    const P = X.P, types = X.ev.sub || [];
    const { hits, rest } = L.revealUntil(G, P, (c) => c.def.types.includes('Creature') && c.def.sub.some((t) => types.includes(t)), 1);
    G.rng.shuffle(rest); P.library.unshift(...rest);
    if (hits.length) { P.hand.push(hits[0]); dirty(G); emit(G, 'reveal', `${P.name} reveals ${hits[0].def.name} and puts it into their hand.`, { who: P.i, cards: [hits[0].id] }); }
  } }));
  return d;
};
S['Hithlain Rope'] = (d) => {
  // It can't be sacrificed; each use hands it to the opponent (the player to your right)
  d.noSac = true;
  const pass = (G, X) => { if (onBf(G, X.src)) gainControl(G, X.O, X.src, 'perm'); };
  d.acts.push(
    { cost: { m: C('{1}'), tap: true }, label: 'Search for a basic land, onto the battlefield tapped; the opponent gains control of the Rope', when: ['main1', 'end'], run: (G, X) => { fetchBasic(G, X.P); pass(G, X); }, ai: (G, P) => (rampVal(G, P) > 1.5 ? { score: rampVal(G, P) - 0.5 } : null) },
    { cost: { m: C('{2}'), tap: true }, label: 'Draw a card; the opponent gains control of the Rope', when: ['end'], run: (G, X) => { drawN(G, X.P, 1); pass(G, X); }, ai: () => ({ score: 0.7 }) });
  d.role = 'value';
  return d;
};
S['Lothlórien Blade'] = (d) => {
  d.trig.push(T('attack', { cond: (G, src, ev) => ev.c.id === src.att, eff: [fn((G, X, t) => { const c = t && t.c, h = X.ev.c; if (c && onBf(G, c) && onBf(G, h)) hit(G, X, c, pow(h), h); },
    { tgt: { f: { side: 'opp' } }, val: (G, P, c, X) => { const h = X && X.ev && X.ev.c; return h && pow(h) >= tou(c) - c.dmg ? cv(c) + 1 : 0.2; }, label: 'Choose a creature the defending player controls' })] }));
  d.acts = d.acts.filter((a) => !a.equip);
  d.acts.push({ equip: true, cost: { m: C('{2}') }, sorcery: true, label: 'Equip Elf {2}', only: { sub: 'Elf' } }, { equip: true, cost: { m: C('{5}') }, sorcery: true, label: 'Equip {5}' });
  return d;
};
S['Model of Unity'] = (d) => {
  d.mana = null;
  d.manaAbs = [{ colors: ANY }];
  d.trig.push(T('voted', { run: (G, X) => {
    const mine = new Set(X.ev.votes.filter((v) => v.Q === X.P).map((v) => v.k));
    scryChoice(G, X.P, 2);
    if (X.ev.votes.some((v) => v.Q !== X.P && mine.has(v.k))) scryChoice(G, X.O, 2);
  } }));
  d.role = 'ramp';
  return d;
};
S['Pristine Talisman'] = (d) => { d.mana = ['C']; d.onManaTap = (G, P) => gain(G, P, 1); d.role = 'ramp'; return d; };
S['Relic of Sauron'] = (d) => {
  d.mana = null;
  d.manaAbs = [{ colors: ['U', 'B', 'R'], amount: 2 }];
  d.acts.push({ cost: { m: C('{3}'), tap: true }, label: 'Draw two cards, then discard a card', when: ['end'], eff: [fn((G, X) => { drawN(G, X.P, 2); discardE(G, X.P, 1); }, { score: () => 1.5 })], ai: (G, P) => (L.manaCount(P) >= 6 ? { score: 1.3 } : null) });
  d.role = 'ramp';
  return d;
};
S['Well of Lost Dreams'] = (d) => {
  d.trig.push(T('gain', { you: true, run: (G, X) => {
    const P = X.P, most = Math.min(X.ev.n, L.manaCount(P));
    if (most <= 0) return;
    const n = isHuman(G, P) ? L.chooseNumber(G, P, X.src, 'Well of Lost Dreams: pay {X} to draw X cards', 0, most, 0) : Math.min(most, Math.max(0, L.manaCount(P) - (G.active === P.i ? 2 : 0)), 3);
    if (n > 0 && pay(P, genericCost(n))) drawN(G, P, n);
  } }));
  d.role = 'draw';
  return d;
};

/* ============================================================ White */
S['Beregond of the Guard'] = (d) => {
  d.trig.push(T('enter', { you: true, cond: (G, src, ev) => isCreature(ev.c) && (ev.c === src || hasSub(ev.c, 'Human')), eff: [{ k: 'pumpAll', side: 'you', p: 1, t: 1, kw: ['vigilance'] }] }));
  return d;
};
S['Call for Unity'] = (d) => {
  // Revolt: a permanent left the battlefield under your control this turn
  d.trig.push(T('endStep', { you: true, cond: (G, src, ev, Q) => ev.nth === 1 && Q.leftTurn === G.turn, run: (G, X) => addCounters(G, X.src, 1, 'unity') }));
  d.statics.push({ who: 'all', f: { side: 'you' }, pFn: (G, src) => ctrCount(src, 'unity'), tFn: (G, src) => ctrCount(src, 'unity'), kw: [] });
  d.role = 'value';
  return d;
};
S['Champions of Minas Tirith'] = (d) => {
  d.etb = [monarchE()];
  // On each opponent's turn, while you're the monarch: they pay {X} (X = cards in their hand) or can't attack you this combat
  d.trig.push(T('combatStart', { opp: true, cond: (G, src, ev, Q) => G.monarch === Q.i, run: (G, X) => {
    const O = X.ev.P, n = O.hand.length;
    const atk = O.bf.filter((c) => L.canAttackNow(G, c) && pow(c) > 0);
    if (!atk.length) return;
    const can = canPay(O, genericCost(n));
    const want = can && (isHuman(G, O) ? yesNo(G, O, X.src, `${X.src.def.name}: pay {${n}} so your creatures can attack this combat?`, true) : n <= 3 || atk.reduce((t, c) => t + pow(c), 0) >= X.P.life);
    if (want && pay(O, genericCost(n))) { emit(G, 'info', `${O.name} pays {${n}} to attack.`, { who: O.i }); return; }
    for (const c of O.bf.filter(isCreature)) c.tf.cantAttack = true;
    dirty(G);
    emit(G, 'info', `${O.name} doesn't pay, so their creatures can't attack ${X.P.name} this combat.`, { who: X.P.i });
  } }));
  return d;
};
S['Dawn of Hope'] = (d) => {
  d.trig.push(T('gain', { you: true, run: (G, X) => {
    const P = X.P;
    if (!canPay(P, genericCost(2))) return;
    const want = isHuman(G, P) ? yesNo(G, P, X.src, 'Dawn of Hope: pay {2} to draw a card?', true) : G.active !== P.i || L.manaCount(P) >= 5;
    if (want && pay(P, genericCost(2))) drawN(G, P, 1);
  } }));
  d.acts.push({ cost: { m: C('{3}{W}') }, label: 'Create a 1/1 Soldier with lifelink', when: ['end'], eff: [mkE(SOLDIER_LL, 1)], ai: () => ({ score: 1.2 }) });
  d.role = 'value';
  return d;
};
S['Dearly Departed'] = (d) => {
  // From your graveyard: each Human creature you control enters with an extra +1/+1 counter
  d.enterBonusGy = true;
  d.enterBonus = (G, x, card) => (hasSub(card, 'Human') ? 1 : 0);
  return d;
};
S['Dusk'] = S['Dusk // Dawn'] = (d) => {
  const big = (c) => isCreature(c) && pow(c) >= 3;
  d.spell = [fn((G, X) => destroyEach(G, X.P, allCreatures(G).filter(big)), { score: (G, P) => sweepVal(G, P, big) })];
  // Aftermath — Dawn {3}{W}{W}: return all creature cards with power 2 or less from your graveyard to your hand
  const small = (c) => c.def.types.includes('Creature') && (c.def.power || 0) <= 2;
  d.gyActs = [aftermath('{3}{W}{W}', 'Dawn: return all creature cards with power 2 or less from your graveyard to your hand', (G, X) => {
    const cs = X.P.gy.filter(small);
    for (const c of cs) { X.P.gy.splice(X.P.gy.indexOf(c), 1); X.P.hand.push(c); }
    dirty(G);
    if (cs.length) emit(G, 'raise', `${X.P.name} returns ${nameList(cs)} to hand.`, { who: X.P.i, cards: cs.map((c) => c.id) });
  }, (G, P) => (P.gy.filter(small).length >= 3 ? { score: P.gy.filter(small).length * 0.8 } : null))];
  d.role = 'sweeper';
  return d;
};
S['Fell the Mighty'] = (d) => {
  d.spell = [fn((G, X, t) => { const c = t && t.c; if (!c || !onBf(G, c)) return; const p = pow(c); destroyEach(G, X.P, allCreatures(G).filter((x) => pow(x) > p)); },
    { tgt: { f: {} }, val: (G, P, c) => allCreatures(G).filter((x) => pow(x) > pow(c) && !has(x, 'indestructible')).reduce((s, x) => s + (x.ctrl === P.i ? -cv(x) : cv(x)), 0) - 1, label: 'Choose a creature: every creature with greater power is destroyed' })];
  d.role = 'sweeper';
  return d;
};
S['Fiend Hunter'] = (d) => {
  d.etb = [fn((G, X, t) => { if (t && t.c) exileUntil(G, X.P, X.src, t.c); }, { tgt: { f: { other: true }, min: 0 }, val: (G, P, c) => (c.ctrl === P.i ? -pv(G, c) - 2 : pv(G, c) + 0.5), label: 'Exile another creature' })];
  d.role = 'removal';
  return holdUntilLeaves(d);
};
S['Frontline Medic'] = (d) => {
  d.trig.push(T('attacks', { you: true, cond: (G, src, ev) => ev.cs.includes(src) && ev.cs.length >= 3, eff: [{ k: 'pumpAll', side: 'you', p: 0, t: 0, kw: ['indestructible'] }] }));
  // Sacrifice it: counter a spell with {X} in its mana cost unless its controller pays {3}
  d.respondAb = { cost: genericCost(0), unless: 3, label: 'Counter it unless its controller pays {3}',
    legal: (G, O, item) => item.P !== O && !!item.card.def.cost.x,
    ai: (G, O, item) => (canPay(item.P, genericCost(3)) ? -1 : L.threatOf(G, O, item)) };
  return d;
};
S['Fumigate'] = (d) => { d.spell = [{ k: 'destroyAll', f: {} }, fn((G, X) => gain(G, X.P, X.n || 0), { score: (G) => nCre(G) * 0.15 })]; d.role = 'sweeper'; return d; };
S['Gilraen, Dúnedain Protector'] = (d) => {
  d.acts.push({ cost: { m: C('{2}'), tap: true }, label: 'Exile another creature you control (it returns now, or at the next end step with vigilance and lifelink counters)', when: ['main1', 'end'],
    eff: [fn((G, X, t) => {
      const c = t && t.c;
      if (!c || !onBf(G, c)) return;
      const now = isHuman(G, X.P) ? yesNo(G, X.P, X.src, `Return ${c.def.name} to the battlefield right away?`, true) : c.def.etb.length > 0 && G.phase !== 'end';
      if (now) { L.blink(G, c); return; }
      const O = G.players[c.owner];
      exilePermanent(G, X.P, c);
      if (c.token) return;
      G.delayed.push({ when: 'end', run: (GG) => { if (!O.exile.includes(c)) return; O.exile.splice(O.exile.indexOf(c), 1); emit(GG, 'enter', `${c.def.name} returns with vigilance and lifelink counters.`, { who: O.i, card: c.id }); enterBattlefield(GG, O, c, null, { ctr: { vigilance: 1, lifelink: 1 } }); } });
    }, { tgt: { f: { side: 'you', other: true } }, val: (G, P, c) => (c.def.etb.length ? 1 + c.def.etb.reduce((s, e) => s + Math.max(0, L.effectValue(e)), 0) * 0.5 : 0.2), label: 'Choose another creature you control' })],
    ai: (G, P, c, when) => (P.bf.some((x) => x !== c && isCreature(x) && x.def.etb.length && x.def.etb.some((e) => L.effectValue(e) > 1)) && when !== 'blocks' ? { score: 1.2 } : null) });
  return d;
};
S['Grey Host Reinforcements'] = (d) => {
  d.etb = [fn((G, X, t) => {
    const Q = G.players[t ? t.p : X.O.i];
    const cs = Q.gy.slice(), n = cs.filter((c) => c.def.types.includes('Creature')).length;
    for (const c of cs) { Q.gy.splice(Q.gy.indexOf(c), 1); Q.exile.push(c); }
    dirty(G);
    if (cs.length) emit(G, 'exile', `${Q.name}'s graveyard (${cs.length}) is exiled.`, { who: X.P.i });
    addCounters(G, X.src, n);
  }, { tgt: { what: 'player' }, val: (G, P, x) => G.players[x.p].gy.filter((c) => c.def.types.includes('Creature')).length * 0.9 + (x.p !== P.i ? 0.5 : -0.5), label: "Choose a player whose graveyard is exiled" })];
  return d;
};
S['Gwaihir, Greatest of the Eagles'] = (d) => {
  d.trig.push(T('attack', { self: true, eff: [giveFlying()] }));
  d.trig.push(T('endStep', { cond: (G, src, ev, Q) => ev.nth === 1 && gained(Q) >= 3, eff: [mkE(EAGLE, 1)] }));
  return d;
};
S['Increasing Devotion'] = (d) => {
  d.spell = [fn((G, X) => mk(G, X.P, HUMAN, X.item && X.item.fromGy ? 10 : 5), { score: () => 5 })];
  d.flashback = C('{7}{W}{W}');
  d.role = 'tokens';
  return d;
};
S['Lossarnach Captain'] = (d) => {
  d.trig.push(T('enter', { you: true, cond: (G, src, ev) => isCreature(ev.c) && (ev.c === src || hasSub(ev.c, 'Human')), eff: [{ k: 'tapP', tgt: { f: { side: 'opp' } } }] }));
  d.trig.push(T('upkeep', { you: true, eff: [mkE(HUMAN_SOLDIER, 1)] }));
  return d;
};
S["Marshal's Anthem"] = (d) => {
  // Multikicker {1}{W}: up to three kicks, each returns a creature card from your graveyard
  d.modes = [0, 1, 2, 3].map((k) => ({ label: k ? `Kicked ${k === 1 ? 'once' : `${k} times`}` : 'Not kicked', cost: k ? C(`{${k}}${'{W}'.repeat(k)}`) : undefined,
    ai: (G, P) => (k ? Math.min(k, P.gy.filter((c) => c.def.types.includes('Creature')).length) * 2.2 - (k > P.gy.filter((c) => c.def.types.includes('Creature')).length ? 3 : 0) : 0) }));
  d.spell = null;
  d.statics.push({ who: 'all', f: { side: 'you' }, p: 1, t: 1, kw: [] });
  d.etb = [fn((G, X) => {
    const n = X.item && X.item.mode ? X.item.mode[0] : 0;
    const cs = X.P.gy.filter((c) => c.def.types.includes('Creature'));
    const pick = pickSome(G, X.P, cs, 0, n, `Return up to ${n} creature card${n === 1 ? '' : 's'} to the battlefield`, (c) => c.def.value, 'graveyard');
    for (const c of pick) reanimate(G, X.P, c);
  }, { score: () => 0 })];
  return d;
};
S['Selfless Squire'] = (d) => {
  d.etb = [fn((G, X) => { X.P.youSafeTurn = G.turn; emit(G, 'fog', `All damage that would be dealt to ${X.P.name} this turn will be prevented.`, { who: X.P.i }); }, { score: (G, P) => (G.combat && G.active !== P.i ? 2 : 0.2) })];
  d.trig.push(T('prevented', { you: true, run: (G, X) => addCounters(G, X.src, X.ev.n) }));
  d.castScore = (G, P) => (G.combat && G.active !== P.i && G.combat.attackers.reduce((t, c) => t + Math.max(0, pow(c)), 0) >= 4 ? 3 : 0);
  return d;
};
S['Sunset Revelry'] = (d) => {
  d.spell = [fn((G, X) => {
    const P = X.P, O = X.O;
    if (O.life > P.life) gain(G, P, 4);
    if (count(O, isCreature) > count(P, isCreature)) mk(G, P, HUMAN, 2);
    if (O.hand.length > P.hand.length) drawN(G, P, 1);
  }, { score: (G, P) => { const O = other(G, P); return (O.life > P.life ? 1.2 : 0) + (count(O, isCreature) > count(P, isCreature) ? 2 : 0) + (O.hand.length > P.hand.length - 1 ? 1 : 0) - 0.3; } })];
  return d;
};
S['The Gaffer'] = (d) => { d.trig.push(T('endStep', { cond: (G, src, ev, Q) => ev.nth === 1 && gained(Q) >= 3, eff: [{ k: 'draw', n: 1 }] })); return d; };
S['Unbreakable Formation'] = (d) => {
  d.spell = [fn((G, X) => {
    const cs = X.P.bf.filter(isCreature);
    const addendum = G.active === X.P.i && (G.phase === 'main1' || G.phase === 'main2');
    for (const c of cs) { if (!c.tkw.includes('indestructible')) c.tkw.push('indestructible'); if (addendum) { addCounters(G, c, 1, '+1/+1', true); if (!c.tkw.includes('vigilance')) c.tkw.push('vigilance'); } }
    dirty(G);
    emit(G, 'pump', `${X.P.name}'s creatures gain indestructible${addendum ? ', a +1/+1 counter and vigilance' : ''} until end of turn.`, { who: X.P.i, cards: cs.map((c) => c.id) });
  }, { score: (G, P, X, ctx) => P.bf.filter(isCreature).length * (ctx === 'main1' ? 1 : 0.4) })];
  // It also answers a sweeper or removal spell aimed at your creatures
  d.respond = { counter: false,
    legal: (G, O, item) => item.P !== O,
    ai: (G, O, item) => { const eff = L.spellEffects(item.card.def, item.mode); const hits = L.allTargets(item.targets).filter((t) => t.c && t.c.ctrl === O.i && isCreature(t.c)); return eff.some((e) => ['destroyAll', 'wrath', 'dmgAll'].includes(e.k)) ? O.bf.filter(isCreature).reduce((s, c) => s + cv(c), 0) : hits.length && eff.some((e) => ['destroyP', 'destroy', 'dmg'].includes(e.k)) ? Math.max(...hits.map((t) => cv(t.c))) : 0; },
    res: (G, O) => { for (const c of O.bf.filter(isCreature)) if (!c.tkw.includes('indestructible')) c.tkw.push('indestructible'); dirty(G); emit(G, 'pump', `${O.name}'s creatures gain indestructible until end of turn.`, { who: O.i }); return false; } };
  return d;
};
S['Verge Rangers'] = (d) => {
  // While an opponent controls more lands, you may play lands from the top of your library
  d.topLand = (G, P) => other(G, P).bf.filter(isLand).length > P.bf.filter(isLand).length;
  return d;
};
S['Village Bell-Ringer'] = (d) => {
  d.etb = [fn((G, X) => { const cs = X.P.bf.filter((c) => isCreature(c) && c.tapped); for (const c of cs) c.tapped = false; dirty(G); if (cs.length) emit(G, 'tapfx', `${X.P.name}'s creatures untap.`, { who: X.P.i, cards: cs.map((c) => c.id) }); }, { score: (G, P) => P.bf.filter((c) => isCreature(c) && c.tapped).length * 0.7 })];
  return d;
};
S['Visions of Glory'] = (d) => {
  d.spell = [fn((G, X) => mk(G, X.P, HUMAN, count(X.P, isCreature)), { score: (G, P) => count(P, isCreature) * 1.1 })];
  d.flashback = C('{8}{W}{W}');
  // Flashback costs {X} less, X = the greatest mana value of a commander you own on the battlefield or in the command zone
  d.costMod = (G, P, card) => (P.gy.includes(card) ? Math.max(0, ...(P.cmds || []).filter((c) => P.bf.includes(c) || P.command.includes(c)).map((c) => c.def.mv)) : 0);
  d.castScore = (G, P) => (count(P, isCreature) < 2 ? -3 : 0);
  d.role = 'tokens';
  return d;
};
S['Weathered Wayfarer'] = (d) => {
  d.acts.push({ cost: { m: C('{W}'), tap: true }, label: 'Search for a land card and put it into your hand', when: ['end'], cond: (G, P) => other(G, P).bf.filter(isLand).length > P.bf.filter(isLand).length,
    run: (G, X) => { const got = searchLibrary(G, X.P, (c) => isLand(c), 1, 'hand', 'Search for a land card'); if (got.length) emit(G, 'search', `${X.P.name} reveals ${got[0].def.name} and puts it into their hand.`, { who: X.P.i, cards: [got[0].id] }); },
    ai: (G, P) => (P.library.some(isLand) ? { score: 1.3 } : null) });
  return d;
};
S['Of Herbs and Stewed Rabbit'] = (d) => {
  d.saga = [
    { ch: [1], eff: [{ k: 'ctrs', n: 1, tgt: { f: {}, min: 0 } }, foodE(1)] },
    { ch: [2], eff: [{ k: 'draw', n: 1 }, foodE(1)] },
    { ch: [3], eff: [fn((G, X) => mk(G, X.P, HALFLING, foodsOf(X.P).length), { score: (G, P) => foodsOf(P).length * 1.1 })] },
  ];
  return d;
};

/* ============================================================ Blue */
S['Archivist of Gondor'] = (d) => {
  d.trig.push(T('hitPlayer', { you: true, cond: (G, src, ev) => isCommander(ev.c) && noMonarch(G), run: (G, X) => { if (noMonarch(G)) becomeMonarch(G, X.P); } }));
  d.trig.push(T('endStep', { cond: (G, src, ev) => ev.nth === 1 && G.monarch === ev.P.i, run: (G, X) => drawN(G, X.ev.P, 1) }));
  return d;
};
S['Colossal Whale'] = (d) => {
  d.landwalk = 'Island';
  d.trig.push(T('attack', { self: true, may: true, mayLabel: 'Exile a creature the defending player controls until Colossal Whale leaves?',
    eff: [fn((G, X, t) => { if (t && t.c) exileUntil(G, X.P, X.src, t.c); }, { tgt: { f: { side: 'opp' } }, val: (G, P, c) => pv(G, c) + 0.5, label: 'Choose a creature the defending player controls' })] }));
  d.role = 'creature';
  return holdUntilLeaves(d);
};
S['Corsairs of Umbar'] = (d) => {
  d.acts.push({ cost: { m: C('{2}{U}') }, label: "Target Goblin, Orc, or Pirate can't be blocked this turn", when: ['main1'],
    eff: [fn((G, X, t) => { const c = t && t.c; if (c && onBf(G, c)) { c.tf.unblockable = true; grantKw(G, c, [], "can't be blocked this turn"); } },
      { tgt: { f: { side: 'you', subs: ['Goblin', 'Orc', 'Pirate'] } }, val: (G, P, c) => (c.tapped || (c.sick && !has(c, 'haste')) ? -1 : pow(c) * 0.5 + 0.3), label: 'Choose a Goblin, Orc, or Pirate' })],
    ai: (G, P) => { const cs = P.bf.filter((c) => isCreature(c) && !c.tapped && (!c.sick || has(c, 'haste')) && (hasSub(c, 'Goblin') || L.orcish(c) || hasSub(c, 'Pirate')) && pow(c) >= 3); return cs.length && other(G, P).bf.some(isCreature) ? { score: 1 } : null; } });
  d.trig.push(T('hitPlayer', { self: true, eff: [{ k: 'amass', n: 3 }] }));
  return d;
};
S['Denethor, Stone Seer'] = (d) => {
  d.etb = [{ k: 'scry', n: 2 }];
  d.acts.push({ cost: { m: C('{3}{R}'), tap: true, sacSelf: true }, label: 'A player becomes the monarch; Denethor deals 3 damage to any target', when: ['end', 'main1'],
    eff: [fn((G, X) => { const to = isHuman(G, X.P) ? (chooseMode(G, X.P, X.src, 'Who becomes the monarch?', ['You', X.O.name], 0) ? X.O : X.P) : X.P; becomeMonarch(G, to); }, { score: (G, P) => monarchVal(G, P) }),
      { k: 'dmg', n: 3, tgt: { what: 'any', f: {} } }],
    ai: (G, P) => (G.monarch !== P.i ? { score: 2.5 } : null) });
  return d;
};
S['Devastation Tide'] = (d) => {
  // Miracle isn't modeled: it's a five-mana sorcery here
  d.spell = [fn((G, X) => { for (const c of allPerms(G).filter((x) => !isLand(x))) if (onBf(G, c)) bounceCard(G, X.P, c); },
    { score: (G, P) => allPerms(G).filter((c) => !isLand(c)).reduce((s, c) => s + (c.ctrl === P.i ? -pv(G, c) * 0.6 : pv(G, c) * 0.6 + (c.token ? 1 : 0)), 0) - 1 })];
  d.role = 'sweeper';
  return d;
};
S['Fact or Fiction'] = (d) => {
  d.spell = [fn((G, X) => {
    const P = X.P, O = X.O;
    const top = P.library.splice(Math.max(0, P.library.length - 5)).reverse();
    if (!top.length) return;
    emit(G, 'reveal', `${P.name} reveals ${nameList(top)}.`, { who: P.i, cards: top.map((c) => c.id) });
    // The opponent splits them: the AI puts the best card alone against the rest
    let pile1;
    if (isHuman(G, O)) pile1 = pickCards(G, { type: 'choose', reason: 'pile', n: top.length, min: 0, max: top.length, zone: 'library', cards: top.map((c) => c.id), label: 'Fact or Fiction: choose the cards for the first pile' }, top, null);
    else { const best = top.slice().sort((a, b) => b.def.value - a.def.value)[0]; const sum = top.reduce((s, c) => s + c.def.value, 0); pile1 = best.def.value * 1.6 >= sum - best.def.value ? [best] : top.slice().sort((a, b) => b.def.value - a.def.value).slice(0, 2); }
    const pile2 = top.filter((c) => !pile1.includes(c));
    const val = (cs) => cs.reduce((s, c) => s + c.def.value + 0.5, 0);
    const take = isHuman(G, P) ? (chooseMode(G, P, X.src, 'Fact or Fiction: which pile goes to your hand?', [`${nameList(pile1) || 'nothing'}`, `${nameList(pile2) || 'nothing'}`], 0) ? pile2 : pile1) : val(pile1) >= val(pile2) ? pile1 : pile2;
    const rest = take === pile1 ? pile2 : pile1;
    P.hand.push(...take); P.gy.push(...rest);
    dirty(G);
    emit(G, 'draw', `${P.name} puts ${take.length ? nameList(take) : 'nothing'} into their hand${rest.length ? ` and ${nameList(rest)} into the graveyard` : ''}.`, { who: P.i, cards: take.map((c) => c.id) });
  }, { score: () => 2.2 })];
  d.role = 'draw';
  return d;
};
S['Fealty to the Realm'] = (d) => {
  // The monarch controls the enchanted creature; it attacks each combat if able and can't attack Fealty's controller
  d.etb = [monarchE(), fn((G, X) => { const h = X.src.att != null ? byId(G, X.src.att) : null; if (h && onBf(G, h) && G.monarch != null && h.ctrl !== G.monarch) gainControl(G, G.players[G.monarch], h, 'src', X.src); }, { score: () => 0 })];
  d.trig.push(T('monarch', { cond: (G, src) => src.att != null, run: (G, X) => { const h = byId(G, X.src.att); if (h && onBf(G, h) && h.ctrl !== X.ev.P.i) gainControl(G, X.ev.P, h, 'src', X.src); } }));
  d.statics.push({ who: 'enchanted', p: 0, t: 0, kw: [], flags: { mustAttack: true } });
  d.statics.push({ who: 'enchanted', cond: () => true, f: { fn: (G, c, P, src) => c.ctrl !== src.ctrl }, p: 0, t: 0, kw: [], flags: { cantAttack: true } });
  d.auraVal = (G, P, c) => (c.ctrl === P.i ? -cv(c) : cv(c) + monarchVal(G, P) * 0.3);
  d.role = 'removal';
  return d;
};
S['Forbidden Alchemy'] = (d) => {
  d.spell = [fn((G, X) => lookTake(G, X.P, 4, () => true, 1, 'Put one into your hand (the rest go to your graveyard)', 'gy'), { score: () => 1.3 })];
  d.flashback = C('{6}{B}');
  d.role = 'draw';
  return d;
};
S['Learn from the Past'] = (d) => {
  d.spell = [fn((G, X, t) => { const Q = G.players[t ? t.p : X.P.i]; const n = Q.gy.length; Q.library.push(...Q.gy.splice(0)); G.rng.shuffle(Q.library); dirty(G); emit(G, 'info', `${Q.name} shuffles their graveyard (${n}) into their library.`, { who: X.P.i }); },
    { tgt: { what: 'player' }, val: (G, P, x) => { const Q = G.players[x.p]; return x.p === P.i ? (P.library.length < 12 ? 2 : 0.1) : Q.gy.filter((c) => c.def.flashback || c.def.gyActs || c.def.types.includes('Creature')).length * 0.5; }, label: 'Choose a player' }),
    { k: 'draw', n: 1 }];
  d.role = 'draw';
  return d;
};
S['Monstrosity of the Lake'] = (d) => {
  d.etb = [fn((G, X) => {
    const P = X.P, O = X.O;
    if (!canPay(P, genericCost(5))) return;
    const want = isHuman(G, P) ? yesNo(G, P, X.src, 'Monstrosity of the Lake: pay {5} to tap all creatures your opponents control and stun them?', true) : O.bf.filter(isCreature).reduce((s, c) => s + cv(c), 0) >= 4;
    if (!want || !pay(P, genericCost(5))) return;
    const cs = O.bf.filter(isCreature);
    for (const c of cs) { c.tapped = true; addCounters(G, c, 1, 'stun', true); }
    dirty(G);
    emit(G, 'tapfx', `${O.name}'s creatures are tapped and get stun counters.`, { who: P.i, cards: cs.map((c) => c.id) });
  }, { score: (G, P) => (L.manaCount(P) >= 10 ? other(G, P).bf.filter(isCreature).reduce((s, c) => s + cv(c) * 0.4, 0) : 0) })];
  d.cycling = C('{2}');
  d.cycleFind = 'Island';
  return d;
};
S['Mystic Confluence'] = (d) => {
  // Choose three, repeats allowed: the useful mixes
  const ctr = (n) => ({ k: 'counter', unless: n });
  const bounce = () => ({ k: 'bounceP', tgt: { f: {} } });
  d.modes = [
    { label: 'Draw three cards', eff: [{ k: 'draw', n: 3 }] },
    { label: 'Return a creature to its owner\'s hand and draw two cards', eff: [bounce(), { k: 'draw', n: 2 }] },
    { label: 'Return two creatures to their owners\' hands and draw a card', eff: [bounce(), bounce(), { k: 'draw', n: 1 }] },
  ];
  d.spell = null;
  // As an answer to a spell: counter it unless its controller pays {3} (or {6}, {9}), drawing a card for each mode left
  d.respond = { counter: true,
    legal: (G, O, item) => item.P !== O,
    ai: (G, O, item) => { const m = L.manaCount(item.P); return m >= 9 ? -1 : L.threatOf(G, O, item); },
    res: (G, O, item, cs) => {
      const P = item.P, m = L.manaCount(P);
      const k = isHuman(G, O) ? chooseMode(G, O, cs, 'Mystic Confluence: how many counter modes?', ['One ({3}) and draw two', 'Two ({6}) and draw one', 'Three ({9})'], 1) + 1 : m >= 6 ? 3 : m >= 3 ? 2 : 1;
      drawN(G, O, 3 - k);
      const n = 3 * k;
      if (canPay(P, genericCost(n)) && (!isHuman(G, P) || yesNo(G, P, item.card, `Pay {${n}} so ${item.card.def.name} isn't countered?`, true))) { pay(P, genericCost(n)); emit(G, 'info', `${P.name} pays ${n}, so ${item.card.def.name} resolves.`, { who: P.i }); return false; }
      L.finishCountered(G, item);
      return true;
    } };
  d.role = 'counter';
  return d;
};
S['Plea for Power'] = (d) => {
  d.spell = [fn((G, X) => {
    // Time: an extra turn; knowledge (or a tie): draw three cards
    const r = vote(G, X.P, X.src, ['time', 'knowledge'], (GG, Q, k) => (Q === X.P ? (k === 0 ? 4 : 3) : (k === 0 ? -4 : -3)));
    if (tally(r, 0) > tally(r, 1)) { G.extraTurns.push(X.P.i); emit(G, 'info', `${X.P.name} will take an extra turn after this one.`, { who: X.P.i }); }
    else drawN(G, X.P, 3);
  }, { score: () => 3 })];
  d.role = 'draw';
  return d;
};
S['Subjugate the Hobbits'] = (d) => {
  const ok = (c) => isCreature(c) && c.def.mv <= 3 && !isCommander(c);
  d.spell = [fn((G, X) => { for (const c of X.O.bf.filter(ok)) gainControl(G, X.P, c, 'perm'); }, { score: (G, P) => other(G, P).bf.filter(ok).reduce((s, c) => s + cv(c) * 2, 0) - 1 })];
  d.role = 'removal';
  return d;
};
S['Swan Song'] = (d) => {
  d.spell = [{ k: 'counter' }];
  d.respondOnly = true;
  d.respond = { counter: true,
    legal: (G, O, item) => item.P !== O && ['Enchantment', 'Instant', 'Sorcery'].some((t) => item.card.def.types.includes(t)),
    ai: (G, O, item) => L.threatOf(G, O, item) - 1,
    res: (G, O, item) => { const P = item.P; L.finishCountered(G, item); mk(G, P, BIRD_U, 1); return true; } };
  d.role = 'counter';
  return d;
};
S['Trap the Trespassers'] = (d) => {
  d.spell = [fn((G, X) => {
    // Secret council: each player votes for a creature the caster doesn't control
    const cs = allCreatures(G).filter((c) => c.ctrl !== X.P.i);
    if (!cs.length) return;
    const votes = [];
    for (const Q of [X.P, X.O]) {
      const pick = isHuman(G, Q) ? pickOne(G, Q, cs, `${X.src.def.name}: vote for a creature`, (c) => cv(c), 'choose', 'battlefield')
        : cs.slice().sort((a, b) => (Q === X.P ? cv(b) - cv(a) : cv(a) - cv(b)))[0];
      votes.push(pick);
    }
    emit(G, 'info', `${X.src.def.name}: the votes go to ${nameList(votes)}.`, { who: X.P.i });
    for (const c of new Set(votes)) { if (!onBf(G, c)) continue; addCounters(G, c, votes.filter((v) => v === c).length, 'stun'); c.tapped = true; }
    dirty(G);
    if (G.pending) L.fire(G, 'voted', { P: X.P, votes: votes.map((c, i) => ({ Q: i ? X.O : X.P, k: c.id })), labels: [], src: X.src });
  }, { score: (G, P) => (other(G, P).bf.some(isCreature) ? 1.5 + Math.max(0, ...other(G, P).bf.filter(isCreature).map((c) => cv(c) * 0.3)) : -1) })];
  d.role = 'removal';
  return d;
};

/* ============================================================ Black */
S['Crypt Incursion'] = (d) => {
  d.spell = [fn((G, X, t) => {
    const Q = G.players[t ? t.p : X.O.i];
    const cs = Q.gy.filter((c) => c.def.types.includes('Creature'));
    for (const c of cs) { Q.gy.splice(Q.gy.indexOf(c), 1); Q.exile.push(c); }
    dirty(G);
    if (cs.length) emit(G, 'exile', `${nameList(cs)} ${cs.length === 1 ? 'is' : 'are'} exiled from ${Q.name}'s graveyard.`, { who: X.P.i, cards: cs.map((c) => c.id) });
    gain(G, X.P, 3 * cs.length);
  }, { tgt: { what: 'player' }, val: (G, P, x) => G.players[x.p].gy.filter((c) => c.def.types.includes('Creature')).length * (x.p === P.i ? 0.5 : 1), label: 'Choose a player' })];
  return d;
};
S['Decree of Pain'] = (d) => {
  d.spell = [fn((G, X) => {
    const cs = allCreatures(G);
    for (const c of cs) c.tf.noRegen = true;
    const n = destroyEach(G, X.P, cs);
    drawN(G, X.P, n);
  }, { score: (G, P) => sweepVal(G, P, isCreature) + nCre(G) * 0.5 })];
  d.cycling = C('{3}{B}{B}');
  d.cycleRun = (G, P) => { drawN(G, P, 1); shrinkAll(G, P, 2); };
  d.cycleAi = (G, P) => shrinkVal(G, P, 2) >= 3;
  d.role = 'sweeper';
  return d;
};
S['Gollum, Obsessed Stalker'] = (d) => {
  // Skulk: it can't be blocked by creatures with greater power
  d.blockOnlyBy = (G, b, a) => pow(b) <= pow(a);
  d.trig.push(T('hitPlayer', { self: true, run: (G, X) => { X.ev.Q.gollumHit = true; } }));
  d.trig.push(T('endStep', { you: true, cond: (G, src, ev, Q) => ev.nth === 1 && !!other(G, Q).gollumHit && gained(Q) > 0, run: (G, X) => loseLife(G, X.O, gained(X.P), X.P.i) }));
  return d;
};
S['Languish'] = (d) => { d.spell = [fn((G, X) => shrinkAll(G, X.P, 4), { score: (G, P) => shrinkVal(G, P, 4) - 1 })]; d.role = 'sweeper'; return d; };
S['Living Death'] = (d) => {
  d.spell = [fn((G, X) => {
    const back = [];
    for (const Q of [X.P, X.O]) { const cs = Q.gy.filter((c) => c.def.types.includes('Creature')); for (const c of cs) { Q.gy.splice(Q.gy.indexOf(c), 1); Q.exile.push(c); } back.push([Q, cs]); }
    for (const Q of [X.P, X.O]) for (const c of Q.bf.filter(isCreature)) if (onBf(G, c)) sacrifice(G, Q, c, true);
    for (const [Q, cs] of back) for (const c of cs) if (Q.exile.includes(c)) { Q.exile.splice(Q.exile.indexOf(c), 1); enterBattlefield(G, Q, c, null, {}); }
    emit(G, 'raise', 'Every creature card in the graveyards returns; every creature that was on the battlefield is sacrificed.', { who: X.P.i });
  }, { score: (G, P) => { const O = other(G, P); const v = (cs) => cs.reduce((s, c) => s + c.def.value, 0); return v(P.gy.filter((c) => c.def.types.includes('Creature'))) - v(O.gy.filter((c) => c.def.types.includes('Creature'))) - P.bf.filter(isCreature).reduce((s, c) => s + cv(c), 0) + O.bf.filter(isCreature).reduce((s, c) => s + cv(c), 0) - 1; } })];
  d.role = 'sweeper';
  return d;
};
S['Lobelia, Defender of Bag End'] = (d) => {
  // The top card of the opponent's library, exiled face down; later Lobelia can play it for free
  d.etb = [fn((G, X) => { const c = X.O.library.pop(); if (!c) return; X.O.exile.push(c); X.src.mem.loot = (X.src.mem.loot || []).concat(c.id); dirty(G); say(G, X.P, `${X.P.name} exiles the top card of ${X.O.name}'s library face down.`); }, { score: () => 0.8 })];
  const exiled = (G, src) => G.players.flatMap((Q) => Q.exile).filter((c) => (src.mem.loot || []).includes(c.id));
  d.acts.push(
    { cost: { tap: true, sac: { f: { types: ['Artifact'] }, label: 'Sacrifice an artifact', prefer: (G, c) => (c.token ? 0 : 2) + pv(G, c) } }, label: 'Play a card exiled with Lobelia for free this turn', when: ['main1', 'main2'], cond: (G, P, c) => exiled(G, c).length > 0,
      run: (G, X) => {
        const cs = exiled(G, X.src);
        const c = pickOne(G, X.P, cs, 'Play which card?', (x) => x.def.value, 'choose', 'exile');
        if (!c) return;
        X.src.mem.loot = X.src.mem.loot.filter((id) => id !== c.id);
        if (isLand(c)) { if (X.P.landsPlayed < L.landLimit(G, X.P)) L.playLandChoice(G, X.P, { c, from: 'exile' }); return; }
        castNow(G, X.P, c, { free: true, ask: false });
      }, ai: (G, P, c) => (exiled(G, c).some((x) => !isLand(x) && x.def.value >= 2) ? { score: 2.5 } : null) },
    { cost: { tap: true, sac: { f: { types: ['Artifact'] }, label: 'Sacrifice an artifact', prefer: (G, c) => (c.token ? 0 : 2) + pv(G, c) } }, label: 'Each opponent loses 2 life and you gain 2 life', when: ['end'],
      run: (G, X) => { loseLife(G, X.O, 2, X.P.i); gain(G, X.P, 2); }, ai: (G, P) => (P.bf.some((c) => c.token && (hasSub(c, 'Food') || hasSub(c, 'Treasure') || hasSub(c, 'Clue'))) ? { score: 1.2 } : null) });
  return d;
};
S['Merciless Executioner'] = (d) => { d.etb = [fn((G, X) => { for (const Q of [X.P, X.O]) edictOf(G, Q, null, X.src.def.name); }, { score: (G, P) => (other(G, P).bf.some(isCreature) ? 1.5 : -1) })]; return d; };
S['Rapacious Guest'] = (d) => {
  d.trig.push(T('combatDamagedYou', { opp: true, run: (G, X) => food(G, X.P) }));
  d.trig.push(T('sac', { you: true, cond: (G, src, ev) => isFood(ev.c), run: (G, X) => addCounters(G, X.src, 1) }));
  d.trig.push(T('leave', { self: true, run: (G, X) => loseLife(G, X.O, Math.max(0, X.ev.pow || 0), X.P.i) }));
  return d;
};
S['Revenge of Ravens'] = (d) => {
  d.trig.push(T('attack', { opp: true, run: (G, X) => { loseLife(G, X.O, 1, X.P.i); gain(G, X.P, 1); } }));
  d.role = 'value';
  return d;
};
S['Sanguine Bond'] = (d) => { d.trig.push(T('gain', { you: true, run: (G, X) => loseLife(G, X.O, X.ev.n, X.P.i) })); d.role = 'value'; return d; };
S['Shelob, Dread Weaver'] = (d) => {
  // Nontoken creatures an opponent controls that die are exiled with Shelob
  d.trig.push(T('die', { opp: true, cond: (G, src, ev) => !ev.token, run: (G, X) => {
    const c = X.ev.c, Q = G.players[c.owner];
    if (!Q.gy.includes(c)) return;
    Q.gy.splice(Q.gy.indexOf(c), 1); Q.exile.push(c);
    X.src.mem.webbed = (X.src.mem.webbed || []).concat(c.id);
    dirty(G);
    emit(G, 'exile', `${c.def.name} is exiled with ${X.src.def.name}.`, { who: X.P.i, cards: [c.id] });
  } }));
  const webbed = (G, src) => G.players.flatMap((Q) => Q.exile).filter((c) => (src.mem.webbed || []).includes(c.id));
  d.acts.push(
    { cost: { m: C('{2}{B}') }, label: 'Put a card exiled with Shelob into its owner\'s graveyard: two +1/+1 counters, draw a card', when: ['end'], cond: (G, P, c) => webbed(G, c).length > 0,
      run: (G, X) => { const c = pickOne(G, X.P, webbed(G, X.src), 'Which card goes to the graveyard?', (x) => -x.def.value, 'choose', 'exile'); if (!c) return; const Q = G.players[c.owner]; Q.exile.splice(Q.exile.indexOf(c), 1); Q.gy.push(c); X.src.mem.webbed = X.src.mem.webbed.filter((id) => id !== c.id); addCounters(G, X.src, 2); drawN(G, X.P, 1); },
      ai: () => ({ score: 2 }) },
    { cost: { m: Object.assign(C('{1}{B}'), { x: 1 }) }, label: 'Put a creature card with mana value X exiled with Shelob onto the battlefield tapped', when: ['end', 'main2'], cond: (G, P, c) => webbed(G, c).length > 0,
      run: (G, X) => { const cs = webbed(G, X.src).filter((c) => c.def.mv === (X.x || 0)); const c = pickOne(G, X.P, cs, 'Which creature?', (x) => x.def.value, 'choose', 'exile'); if (!c) return; X.src.mem.webbed = X.src.mem.webbed.filter((id) => id !== c.id); putOntoBattlefield(G, X.P, c, { tapped: true }); },
      aiX: (G, P, c, max) => { const best = webbed(G, c).filter((x) => x.def.mv <= max).sort((a, b) => b.def.value - a.def.value)[0]; return best ? best.def.mv : 0; },
      ai: (G, P, c) => (webbed(G, c).some((x) => x.def.mv + 2 <= L.manaCount(P) && x.def.value >= 2.5) ? { score: 3 } : null) });
  return d;
};

/* ============================================================ Red */
S['Call for Aid'] = (d) => {
  // In a duel the borrowed creatures are no use for attacking: you can't attack that player this turn
  d.spell = [fn((G, X) => { for (const c of X.O.bf.filter(isCreature)) borrow(G, X, c); X.P.skipCombat = G.turn; }, { score: () => -5 })];
  d.castScore = () => -10;
  return d;
};
S['Cavern-Hoard Dragon'] = (d) => {
  d.costMod = (G, P) => count(other(G, P), isArtifact);
  d.trig.push(T('hitPlayer', { self: true, run: (G, X) => treasure(G, X.P, count(X.ev.Q, isArtifact)) }));
  return d;
};
S['Combat Celebrant'] = (d) => {
  d.trig.push(T('attack', { self: true, cond: (G, src) => src.mem.exerted !== G.turn, run: (G, X) => {
    const P = X.P, others = P.bf.filter((c) => c !== X.src && isCreature(c) && pow(c) > 0);
    const want = isHuman(G, P) ? yesNo(G, P, X.src, 'Exert Combat Celebrant to untap your other creatures and get an extra combat?', true) : others.some((c) => c.tapped || L.canAttackNow(G, c));
    if (!want) return;
    exert(G, X.src);
    extraCombat(G, P, P.bf.filter((c) => c !== X.src && isCreature(c)));
  } }));
  return d;
};
S['Court of Ire'] = (d) => {
  d.etb = [monarchE()];
  d.trig.push(T('upkeep', { you: true, eff: [{ k: 'dmgX', nFn: (G, X) => (G.monarch === X.P.i ? 7 : 2), tgt: { what: 'any', f: {} } }] }));
  d.role = 'value';
  return d;
};
S['Flamerush Rider'] = (d) => {
  d.trig.push(T('attack', { self: true, eff: [fn((G, X, t) => {
    const c = t && t.c;
    if (!c || !onBf(G, c) || !G.combat) return;
    const k = copyToken(G, X.P, c, {}, { tapped: true });
    k.attacking = true; k.tapped = true; G.combat.attackers.push(k);
    G.delayed.push({ when: 'combatEnd', run: (GG) => { if (onBf(GG, k)) exilePermanent(GG, X.P, k); } });
  }, { tgt: { f: { attacking: true, other: true } }, val: (G, P, c) => (c.ctrl === P.i ? cv(c) : -5), label: 'Choose another attacking creature to copy' })] }));
  return dash(d, '{2}{R}{R}', (G, P) => 1.2);
};
S['Frontier Warmonger'] = (d) => { d.trig.push(T('attacks', { you: true, run: (G, X) => { for (const c of X.ev.cs) if (onBf(G, c) && !c.tkw.includes('menace')) c.tkw.push('menace'); dirty(G); } })); return d; };
S['Gimli of the Glittering Caves'] = (d) => {
  d.trig.push(T('enter', { you: true, other: true, cond: (G, src, ev) => isCreature(ev.c) && isLegendary(ev.c), run: (G, X) => addCounters(G, X.src, 1) }));
  d.trig.push(T('hitPlayer', { self: true, run: (G, X) => treasure(G, X.P) }));
  return d;
};
S['Goblin Cratermaker'] = (d) => {
  d.acts.push(
    { cost: { m: C('{1}'), sacSelf: true }, label: 'Deal 2 damage to target creature', when: ['main1', 'end', 'blocks'], eff: [{ k: 'dmg', n: 2, to: 'creature', tgt: { f: {} } }],
      ai: (G, P) => (other(G, P).bf.some((c) => isCreature(c) && tou(c) - c.dmg <= 2 && cv(c) >= 2.5 && !has(c, 'indestructible')) ? { score: 2 } : null) },
    { cost: { m: C('{1}'), sacSelf: true }, label: 'Destroy target colorless nonland permanent', when: ['main1', 'end'], eff: [{ k: 'destroyP', tgt: { f: { types: ['nonland'], fn: (G, c) => !c.def.colors.length } } }],
      ai: (G, P) => (other(G, P).bf.some((c) => !isLand(c) && !c.def.colors.length && pv(G, c) >= 3) ? { score: 2 } : null) });
  return d;
};
S['Goblin Dark-Dwellers'] = (d) => {
  d.etb = [fn((G, X, t) => {
    const c = t && t.c;
    if (!c || !X.P.gy.includes(c)) return;
    c.fbExile = true;
    if (!castNow(G, X.P, c, { free: true })) c.fbExile = false;
  }, { tgt: { what: 'gy', mine: true, f: { types: ['Instant', 'Sorcery'], fn: (G, c) => c.def.mv <= 3 } }, min: 0, val: (G, P, c) => c.def.value, label: 'Cast an instant or sorcery card from your graveyard for free' })];
  return d;
};
S['Harsh Mentor'] = (d) => {
  d.trig.push(T('activated', { opp: true, cond: (G, src, ev) => isArtifact(ev.c) || isCreature(ev.c) || isLand(ev.c), run: (G, X) => hit(G, X, { p: X.ev.P.i }, 2) }));
  return d;
};
S['Humble Defector'] = (d) => {
  d.acts.push({ cost: { tap: true }, label: 'Draw two cards; the opponent gains control of Humble Defector', when: ['main2'], cond: (G, P) => G.active === P.i,
    run: (G, X) => { drawN(G, X.P, 2); if (onBf(G, X.src)) gainControl(G, X.O, X.src, 'perm'); }, ai: () => ({ score: 2 }) });
  return d;
};
S['Knollspine Dragon'] = (d) => {
  d.etb = [fn((G, X) => {
    const P = X.P, O = X.O, n = O.hurtNTurn === G.turn ? O.hurtN || 0 : 0;
    const want = isHuman(G, P) ? yesNo(G, P, X.src, `Discard your hand and draw ${n} cards?`, n > P.hand.length) : n > P.hand.length + 1;
    if (!want) return;
    const k = P.hand.length;
    while (P.hand.length) discardChoice(G, P, P.hand.length, 'discard');
    if (k) emit(G, 'discard', `${P.name} discards their hand.`, { who: P.i });
    drawN(G, P, n);
  }, { score: (G, P) => { const O = other(G, P); const n = O.hurtNTurn === G.turn ? O.hurtN || 0 : 0; return Math.max(0, n - P.hand.length) * 0.8; } })];
  return d;
};
S['Orcish Siegemaster'] = (d) => {
  d.statics.push({ who: 'all', f: { side: 'you', other: true, fn: (G, c) => L.orcish(c) }, p: 0, t: 0, kw: ['trample'] });
  d.trig.push(T('attack', { self: true, run: (G, X) => pump(G, X.src, greatestPow(X.P), 0) }));
  return d;
};
S['Rampaging War Mammoth'] = (d) => {
  // Cycling {X}{2}{R}: draw, then destroy up to X artifacts
  d.cycling = C('{2}{R}');
  d.cycleLabel = 'Cycle (X)';
  d.cycleRun = (G, P, card) => {
    drawN(G, P, 1);
    const arts = allPerms(G).filter(isArtifact);
    let max = 0;
    while (max < arts.length && canPay(P, genericCost(max + 1))) max++;
    const x = isHuman(G, P) ? L.chooseNumber(G, P, card, 'Rampaging War Mammoth: pay X to destroy up to X artifacts', 0, max, 0) : Math.min(max, other(G, P).bf.filter((c) => isArtifact(c) && pv(G, c) >= 1).length);
    if (!x || !pay(P, genericCost(x))) return;
    const targets = pickSome(G, P, arts, 0, x, `Destroy up to ${x} artifacts`, (c) => (c.ctrl === P.i ? -5 : pv(G, c)));
    destroyEach(G, P, targets);
  };
  d.cycleAi = (G, P) => other(G, P).bf.filter((c) => isArtifact(c) && pv(G, c) >= 1.5).length >= 2 || P.bf.filter(isLand).length < 5;
  return d;
};
S['Scourge of the Throne'] = (d) => {
  const atTop = (G, P) => other(G, P).life >= P.life;
  // Dethrone, and the first attack each turn against the player with the most life untaps the attackers for another combat
  d.trig.push(T('attack', { self: true, cond: (G, src, ev, Q) => atTop(G, Q), run: (G, X) => addCounters(G, X.src, 1) }));
  d.trig.push(T('attack', { self: true, cond: (G, src, ev, Q) => atTop(G, Q) && src.mem.scourge !== G.turn, run: (G, X) => {
    X.src.mem.scourge = G.turn;
    extraCombat(G, X.P, (G.combat ? G.combat.attackers : []).filter((c) => onBf(G, c)));
  } }));
  return d;
};
S['Shared Animosity'] = (d) => {
  d.trig.push(T('attack', { you: true, run: (G, X) => {
    const c = X.ev.c, mine = subOf(c);
    const n = (G.combat ? G.combat.attackers : []).filter((a) => a !== c && onBf(G, a) && subOf(a).some((t) => mine.includes(t))).length;
    if (n) pump(G, c, n, 0);
  } }));
  d.role = 'value';
  return d;
};
S['Shiny Impetus'] = (d) => {
  d.statics = d.statics.filter((x) => x.who !== 'enchanted');
  d.statics.push({ who: 'enchanted', p: 2, t: 2, kw: [], flags: { mustAttack: true } });
  d.trig.push(T('attack', { cond: (G, src, ev) => ev.c.id === src.att, run: (G, X) => treasure(G, X.P) }));
  d.auraVal = (G, P, c) => (c.ctrl === P.i ? 1.5 + (c.def.mustAttack ? 1 : 0) : 1 + (pow(c) + 2 < P.life / 5 ? 0.5 : -1));
  return d;
};
S['Thrill of Possibility'] = (d) => { d.addCost = { discard: 1 }; d.spell = [{ k: 'draw', n: 2 }]; d.role = 'draw'; return d; };
S['Treasure Nabber'] = (d) => {
  d.watchMana = true;
  d.trig.push(T('manaTap', { opp: true, cond: (G, src, ev) => !!ev.c && isArtifact(ev.c), run: (G, X) => {
    const c = X.ev.c;
    if (!onBf(G, c)) return;
    gainControl(G, X.P, c, 'until', X.src);
    if (c.ctrlFx) c.ctrlFx.until = untilMyNextEnd(G, X.P);
  } }));
  return d;
};
S['Zealous Conscripts'] = (d) => {
  d.etb = [fn((G, X, t) => {
    const c = t && t.c;
    if (!c || !onBf(G, c)) return;
    if (isCreature(c)) { borrow(G, X, c); return; }
    gainControl(G, X.P, c, 'eot', X.src);
    untap(G, c, X.P);
  }, { tgt: { f: { types: ['any'] } }, val: (G, P, c) => (c.ctrl === P.i ? -0.5 : isCreature(c) ? borrowVal(G, P, c) : 0.5), label: 'Gain control of a permanent until end of turn' })];
  return d;
};

/* ============================================================ Green */
const fightE = (label) => fn((G, X, t) => { if (t && t.c && t.c2) L.fightCards(G, X.P, t.c, t.c2); }, { tgt: { pair: true, fa: YOU, fb: OPP, labels: ['Choose your creature', 'Choose the creature it fights'] }, pairVal: (G, P, a, b) => L.fightScore(G, P, a, b), label: label || 'Your creature fights one you don\'t control' });
const biteE = (after) => fn((G, X, t) => {
  const a = t && t.c, b = t && t.c2;
  if (!a || !b || !onBf(G, a) || !onBf(G, b)) return;
  const n = Math.max(0, pow(a)), room = Math.max(0, tou(b) - b.dmg);
  L.biteCards(G, X.P, a, b);
  if (after) after(G, X, Math.max(0, n - room));
}, { tgt: { pair: true, fa: YOU, fb: OPP, labels: ['Choose your creature', 'Choose the creature it damages'] }, pairVal: (G, P, a, b) => (L.kills(a, b) ? cv(b) + 0.5 + Math.max(0, pow(a) - (tou(b) - b.dmg)) * 0.6 : 0.1), label: 'Your creature deals damage equal to its power to one you don\'t control' });
// A regeneration shield (it lasts the turn)
const regenShield = (G, c) => { if (!c || !onBf(G, c)) return; c.tf.regen = (c.tf.regen || 0) + 1; emit(G, 'info', `${c.def.name} gets a regeneration shield.`, { who: c.ctrl, cards: [c.id] }); };
const doomed = (G, c) => { const fc = L.combatDoom(G); return !!fc && fc.dead.has(c); };

S['Arbor Elf'] = (d) => {
  // {T}: untap a Forest — played as one more green mana while you control a Forest
  d.mana = null;
  d.manaAbs = [{ colors: ['G'], cond: (G, c, P) => P.bf.some((x) => isLand(x) && x.def.sub.includes('Forest')) }];
  d.role = 'ramp';
  return d;
};
S['Arwen, Weaver of Hope'] = (d) => { d.enterBonus = (G, x) => Math.max(0, tou(x)); return d; };
S['Asceticism'] = (d) => {
  d.statics.push({ who: 'all', f: { side: 'you' }, p: 0, t: 0, kw: ['hexproof'] });
  d.acts.push({ cost: { m: C('{1}{G}') }, label: 'Regenerate target creature', when: ['blocks'],
    eff: [fn((G, X, t) => regenShield(G, t && t.c), { tgt: { f: { side: 'you' } }, val: (G, P, c) => (doomed(G, c) && !(c.tf.regen > 0) ? cv(c) + 1 : -1), label: 'Choose a creature' })],
    ai: (G, P) => (P.bf.some((c) => isCreature(c) && doomed(G, c) && !(c.tf.regen > 0) && cv(c) >= 2) ? { score: 2 } : null) });
  d.role = 'value';
  return d;
};
S['Assemble the Entmoot'] = (d) => {
  d.statics.push({ who: 'all', f: { side: 'you' }, p: 0, t: 0, kw: ['reach'] });
  d.acts.push({ cost: { sacSelf: true }, label: 'Create three tapped X/X Treefolk with reach counters (X = life gained this turn)', when: ['end', 'main2'],
    run: (G, X) => { const x = gained(X.P); const ts = mk(G, X.P, treefolk(x), 3, { tapped: true }); for (const t of ts) addCounters(G, t, 1, 'reach', true); },
    ai: (G, P) => (gained(P) >= 4 ? { score: gained(P) * 1.2 } : null) });
  d.role = 'value';
  return d;
};
S['Elvish Archdruid'] = (d) => {
  d.statics.push({ who: 'all', f: { side: 'you', other: true, sub: 'Elf' }, p: 1, t: 1, kw: [] });
  d.mana = null;
  d.manaAbs = [{ colors: ['G'], amountFn: (G, c, P) => elves(P).length }];
  d.role = 'ramp';
  return d;
};
S['Elvish Piper'] = (d) => {
  d.acts.push({ cost: { m: C('{G}'), tap: true }, label: 'Put a creature card from your hand onto the battlefield', when: ['end', 'main1'], cond: (G, P) => P.hand.some((c) => c.def.types.includes('Creature')),
    run: (G, X) => { const cs = X.P.hand.filter((c) => c.def.types.includes('Creature')); const c = isHuman(G, X.P) ? pickSome(G, X.P, cs, 0, 1, 'Put a creature card onto the battlefield?', (x) => x.def.value, 'hand')[0] : cs.slice().sort((a, b) => b.def.mv - a.def.mv)[0]; if (c) { emit(G, 'enter', `${X.P.name} puts ${c.def.name} onto the battlefield.`, { who: X.P.i, cards: [c.id] }); putOntoBattlefield(G, X.P, c); } },
    ai: (G, P) => (P.hand.some((c) => c.def.types.includes('Creature') && c.def.mv >= 4) ? { score: 2 + Math.max(...P.hand.filter((c) => c.def.types.includes('Creature')).map((c) => c.def.mv)) * 0.3 } : null) });
  return d;
};
S['Elvish Warmaster'] = (d) => {
  d.trig.push(T('enter', { you: true, other: true, once: true, cond: (G, src, ev) => isCreature(ev.c) && hasSub(ev.c, 'Elf'), eff: [mkE(ELF_WARRIOR, 1)] }));
  d.acts.push({ cost: { m: C('{5}{G}{G}') }, label: 'Elves you control get +2/+2 and gain deathtouch until end of turn', when: ['main1', 'blocks'], eff: [{ k: 'pumpAll', side: 'you', p: 2, t: 2, kw: ['deathtouch'], f: { sub: 'Elf' } }],
    ai: (G, P, c, when) => (elves(P).length >= 3 && (when === 'main1' || P.bf.some((x) => hasSub(x, 'Elf') && (x.attacking || x.blocking))) ? { score: elves(P).length * 0.8 } : null) });
  return d;
};
S['Essence Warden'] = (d) => { d.trig.push(T('enter', { other: true, cond: (G, src, ev) => isCreature(ev.c), run: (G, X) => gain(G, X.P, 1) })); return d; };
S['Farhaven Elf'] = (d) => { d.etb = [fn((G, X) => fetchBasic(G, X.P), { score: rampVal })]; return d; };
S['Feasting Hobbit'] = (d) => {
  // Devour Food 3: as it enters, sacrifice any number of Foods; three +1/+1 counters for each
  d.enterAs = (G, P, card) => {
    const fs = foodsOf(P);
    if (!fs.length) return;
    const n = isHuman(G, P) ? L.chooseNumber(G, P, card, 'Feasting Hobbit: devour how many Foods?', 0, fs.length, fs.length) : fs.length;
    if (!n) return;
    for (const f of fs.slice(0, n)) sacrifice(G, P, f, true);
    emit(G, 'sac', `${P.name} feeds ${n === 1 ? 'a Food' : `${n} Foods`} to ${card.def.name}.`, { who: P.i });
    card.etbAdd = { '+1/+1': 3 * n };
  };
  d.blockOnlyBy = (G, b, a) => pow(b) >= pow(a);
  return d;
};
S['Galadhrim Ambush'] = (d) => {
  d.spell = [fn((G, X) => {
    const n = G.combat ? G.combat.attackers.filter((c) => onBf(G, c) && c.attacking).length : 0;
    mk(G, X.P, ELF_WARRIOR, n);
    G.fogExcept = { turn: G.turn, f: (c) => hasSub(c, 'Elf') };
    emit(G, 'fog', 'All combat damage that would be dealt this turn by non-Elf creatures will be prevented.', { who: X.P.i });
  }, { score: (G, P) => { if (!G.combat || G.active === P.i) return -1; const as = G.combat.attackers.filter((c) => onBf(G, c) && c.attacking); return as.length * 1.1 + as.filter((c) => !hasSub(c, 'Elf')).reduce((t, c) => t + Math.max(0, pow(c)), 0) * 0.3; } })];
  d.castIf = (G, P) => !!G.combat && G.active !== P.i;
  d.role = 'trick';
  return d;
};
S['Genesis Wave'] = (d) => {
  d.spell = [fn((G, X) => {
    const P = X.P, x = X.x || 0;
    const top = P.library.splice(Math.max(0, P.library.length - x)).reverse();
    if (!top.length) return;
    const ok = top.filter((c) => L.isPermanentSpell(c.def) && c.def.mv <= x);
    const put = isHuman(G, P) ? pickSome(G, P, ok, 0, ok.length, 'Put any number of them onto the battlefield', () => 1, 'library') : ok;
    emit(G, 'reveal', `${P.name} reveals ${nameList(top)}.`, { who: P.i, cards: top.map((c) => c.id) });
    for (const c of put) { if (isLand(c)) { P.bf.push(c); L.resetCard(c); c.g = G; c.ctrl = P.i; c.sick = false; dirty(G); emit(G, 'enter', `${c.def.name} enters the battlefield.`, { who: P.i, card: c.id }); } else enterBattlefield(G, P, c, null, {}); }
    for (const c of top.filter((x2) => !put.includes(x2))) P.gy.push(c);
    dirty(G);
  }, { score: (G, P, X) => (X && X.x ? X.x * 0.9 : 0) })];
  d.aiX = (G, P, card, max) => (max >= 4 ? max : null);
  d.role = 'ramp';
  return d;
};
S['Gilded Goose'] = (d) => {
  d.etb = [foodE(1)];
  d.acts.push({ cost: { m: C('{1}{G}'), tap: true }, label: 'Create a Food token', when: ['end'], eff: [foodE(1)], ai: (G, P) => (foodsOf(P).length < 2 ? { score: 0.8 } : null) });
  // {T}, Sacrifice a Food: add one mana of any color
  d.mana = null;
  d.manaAbs = [{ colors: ANY, cond: (G, c, P) => foodsOf(P).length > 0 }];
  d.onManaTap = (G, P) => { const f = foodsOf(P)[0]; if (f) sacrifice(G, P, f, true); };
  d.role = 'ramp';
  return d;
};
S['Great Oak Guardian'] = (d) => {
  d.etb = [fn((G, X, t) => {
    const Q = G.players[t ? t.p : X.P.i];
    const cs = Q.bf.filter(isCreature);
    for (const c of cs) { c.tp += 2; c.tt += 2; c.tapped = false; }
    dirty(G);
    emit(G, 'pump', `${Q.name}'s creatures get +2/+2 until end of turn and untap.`, { who: X.P.i, cards: cs.map((c) => c.id) });
  }, { tgt: { what: 'player' }, val: (G, P, x) => (x.p === P.i ? 1 + P.bf.filter(isCreature).length * 0.6 : -1), label: 'Choose a player' })];
  return d;
};
S['Haldir, Lórien Lieutenant'] = (d) => {
  d.etbCtr = (G, P, card, opts) => ({ '+1/+1': (opts.item && opts.item.x) || 0 });
  d.aiX = (G, P, card, max) => (max >= 2 ? max : null);
  d.acts.push({ cost: { m: C('{5}{G}') }, label: 'Other Elves you control gain vigilance and get +1/+1 for each +1/+1 counter on Haldir', when: ['main1'],
    run: (G, X) => { const n = Math.max(0, X.src.cnt); const cs = X.P.bf.filter((c) => c !== X.src && isCreature(c) && hasSub(c, 'Elf')); for (const c of cs) { c.tp += n; c.tt += n; if (!c.tkw.includes('vigilance')) c.tkw.push('vigilance'); } dirty(G); emit(G, 'pump', `${X.P.name}'s other Elves get +${n}/+${n} and vigilance until end of turn.`, { who: X.P.i, cards: cs.map((c) => c.id) }); },
    ai: (G, P, c) => (c.cnt >= 2 && P.bf.filter((x) => x !== c && isCreature(x) && hasSub(x, 'Elf') && !x.tapped).length >= 2 ? { score: c.cnt * 0.8 } : null) });
  return d;
};
S['Heroic Intervention'] = (d) => {
  const protect = (G, P) => { for (const c of P.bf) { for (const k of ['hexproof', 'indestructible']) if (!c.tkw.includes(k)) c.tkw.push(k); } dirty(G); emit(G, 'pump', `${P.name}'s permanents gain hexproof and indestructible until end of turn.`, { who: P.i }); };
  d.spell = [fn((G, X) => protect(G, X.P), { score: () => 0.2 })];
  d.respondOnly = true;
  d.respond = { counter: false,
    legal: (G, O, item) => item.P !== O,
    ai: (G, O, item) => { const eff = L.spellEffects(item.card.def, item.mode); const mine = L.allTargets(item.targets).filter((t) => t.c && t.c.ctrl === O.i); return eff.some((e) => ['destroyAll', 'wrath', 'dmgAll'].includes(e.k)) || item.card.def.role === 'sweeper' ? O.bf.filter((c) => !isLand(c)).reduce((s, c) => s + pv(G, c), 0) : mine.length ? Math.max(...mine.map((t) => pv(G, t.c))) + 1 : 0; },
    res: (G, O) => { protect(G, O); return false; } };
  d.role = 'trick';
  return d;
};
S['Inscription of Abundance'] = (d) => {
  const m1 = { label: 'Put two +1/+1 counters on a creature', eff: [{ k: 'ctrs', n: 2, tgt: { f: {} } }] };
  const m2 = { label: 'A player gains life equal to the greatest power among creatures they control', eff: [fn((G, X, t) => { const Q = G.players[t ? t.p : X.P.i]; gain(G, Q, greatestPow(Q)); }, { tgt: { what: 'player' }, val: (G, P, x) => (x.p === P.i ? greatestPow(P) * 0.4 : -1), label: 'Choose a player' })] };
  const m3 = { label: 'Your creature fights a creature you don\'t control', eff: [fightE()] };
  d.modes = [m1, m2, m3, { label: 'Kicked: all three', cost: C('{2}{G}'), eff: m1.eff.concat(m2.eff, m3.eff) }];
  d.spell = null;
  d.role = 'removal';
  return d;
};
S['Legolas Greenleaf'] = (d) => {
  d.blockOnlyBy = (G, b) => pow(b) > 2;
  d.trig.push(T('enter', { you: true, other: true, cond: (G, src, ev) => isCreature(ev.c) && isLegendary(ev.c), run: (G, X) => addCounters(G, X.src, 1) }));
  d.trig.push(T('hitPlayer', { self: true, eff: [{ k: 'draw', n: 1 }] }));
  return d;
};
S['Lignify'] = (d) => {
  d.statics = d.statics.filter((x) => x.who !== 'enchanted');
  d.statics.push({ who: 'enchanted', p: 0, t: 0, kw: [], flags: { noAbil: true }, addSub: ['Treefolk'], base: [0, 4] });
  d.auraVal = (G, P, c) => (c.ctrl === P.i ? -cv(c) : cv(c) * 0.8 + (pow(c) >= 3 ? 1 : 0));
  d.role = 'removal';
  return d;
};
S['Mirkwood Elk'] = (d) => {
  const back = fn((G, X, t) => { const c = t && t.c; if (!c || !X.P.gy.includes(c)) return; const p = Math.max(0, c.def.power || 0); X.P.gy.splice(X.P.gy.indexOf(c), 1); X.P.hand.push(c); dirty(G); emit(G, 'raise', `${X.P.name} returns ${c.def.name} to hand.`, { who: X.P.i, cards: [c.id] }); gain(G, X.P, p); },
    { tgt: { what: 'gy', mine: true, f: { sub: 'Elf' } }, val: (G, P, c) => c.def.value + (c.def.power || 0) * 0.2, label: 'Return an Elf card from your graveyard' });
  d.etb = [back];
  d.trig.push(T('attack', { self: true, eff: [back] }));
  return d;
};
S['Motivated Pony'] = (d) => {
  d.trig.push(T('attack', { self: true, run: (G, X) => {
    const P = X.P, as = (G.combat ? G.combat.attackers : []).filter((c) => onBf(G, c));
    const fed = L.enteredThisTurn(G, P).some((c) => c.def.sub.includes('Food'));
    for (const c of as) { c.tp += fed ? 3 : 1; c.tt += fed ? 3 : 1; if (fed) c.tapped = false; }
    dirty(G);
    emit(G, 'pump', `${P.name}'s attackers get +${fed ? 3 : 1}/+${fed ? 3 : 1} until end of turn${fed ? ' and untap' : ''}.`, { who: P.i, cards: as.map((c) => c.id) });
  } }));
  return d;
};
S['Paradise Druid'] = (d) => {
  d.mana = null;
  d.manaAbs = [{ colors: ANY }];
  d.statics.push({ who: 'self', f: { untapped: true }, p: 0, t: 0, kw: ['hexproof'] });
  d.role = 'ramp';
  return d;
};
S['Prize Pig'] = (d) => {
  d.mana = null;
  d.manaAbs = [{ colors: ANY }];
  d.trig.push(T('gain', { you: true, run: (G, X) => {
    const c = X.src;
    addCounters(G, c, X.ev.n, 'ribbon', true);
    if (ctrCount(c, 'ribbon') >= 3) { removeCounters(G, c, 'ribbon', ctrCount(c, 'ribbon')); if (c.tapped) untap(G, c, X.P); }
  } }));
  d.role = 'ramp';
  return d;
};
S['Prosperous Innkeeper'] = (d) => {
  d.etb = [{ k: 'treasure', n: 1 }];
  d.trig.push(T('enter', { you: true, other: true, cond: (G, src, ev) => isCreature(ev.c), run: (G, X) => gain(G, X.P, 1) }));
  return d;
};
S['Realm Seekers'] = (d) => {
  d.etbCtr = (G) => ({ '+1/+1': G.players.reduce((t, Q) => t + Q.hand.length, 0) });
  d.acts.push({ cost: { m: C('{2}{G}'), ctr: { kind: '+1/+1', n: 1 } }, label: 'Search for a land card and put it into your hand', when: ['end'],
    run: (G, X) => { const got = searchLibrary(G, X.P, (c) => isLand(c), 1, 'hand', 'Search for a land card'); if (got.length) emit(G, 'search', `${X.P.name} reveals ${got[0].def.name} and puts it into their hand.`, { who: X.P.i, cards: [got[0].id] }); },
    ai: (G, P, c) => (c.cnt >= 3 && P.hand.filter(isLand).length === 0 && P.library.some(isLand) ? { score: 1.2 } : null) });
  return d;
};
S['Seeds of Renewal'] = (d) => {
  // Undaunted: {1} less for each opponent (one, in a duel)
  d.costMod = () => 1;
  d.spell = [fn((G, X) => {
    const cs = pickSome(G, X.P, X.P.gy.filter((c) => c !== X.src), 0, 2, 'Return up to two cards to your hand', (c) => c.def.value + 0.1, 'graveyard');
    for (const c of cs) { X.P.gy.splice(X.P.gy.indexOf(c), 1); X.P.hand.push(c); }
    dirty(G);
    if (cs.length) emit(G, 'raise', `${X.P.name} returns ${nameList(cs)} to hand.`, { who: X.P.i, cards: cs.map((c) => c.id) });
    exileSpell(G, X.src);
  }, { score: (G, P) => P.gy.slice().sort((a, b) => b.def.value - a.def.value).slice(0, 2).reduce((s, c) => s + c.def.value * 0.7, 0) - 1 })];
  d.role = 'draw';
  return d;
};
S['Sylvan Offering'] = (d) => {
  // In a duel both halves pick the one opponent: you and they each get an X/X Treefolk and X 1/1 Elf Warriors
  d.spell = [fn((G, X) => { const x = X.x || 0; for (const Q of [X.P, X.O]) { mk(G, Q, treefolk(x), 1); mk(G, Q, ELF_WARRIOR, x); } }, { score: (G, P) => (elves(P).length >= 3 ? 1 : -3) })];
  d.aiX = (G, P, card, max) => (max >= 3 ? max : null);
  return d;
};
S['Tireless Provisioner'] = (d) => {
  d.trig.push(T('landfall', { you: true, run: (G, X) => {
    const P = X.P;
    const k = isHuman(G, P) ? chooseMode(G, P, X.src, 'Tireless Provisioner: create a Food or a Treasure?', ['Food', 'Treasure'], 1) : (P.life < 15 && foodsOf(P).length < 1 ? 0 : 1);
    if (k) treasure(G, P); else food(G, P);
  } }));
  return d;
};
S['Windswift Slice'] = (d) => { d.spell = [biteE((G, X, n) => mk(G, X.P, ELF_WARRIOR, n))]; d.role = 'removal'; return d; };
S['Woodfall Primus'] = (d) => {
  d.etb = [{ k: 'destroyP', tgt: { f: { types: ['nonland'], fn: (G, c) => !isCreature(c) } } }];
  return persist(d);
};

/* ============================================================ Multicolor */
const thisTurn = (G, P, src, t) => { (P.turnTrigs = (P.turnTrigs || []).filter((x) => x.turn >= G.turn)).push({ turn: G.turn, src, t }); };
const council = (labels) => labels; // (for reading: the choices of a vote)
S['Anguished Unmaking'] = (d) => { d.spell = [{ k: 'exileP', tgt: { f: { types: ['nonland'] } } }, fn((G, X) => loseLife(G, X.P, 3), { score: () => -0.6 })]; d.role = 'removal'; return d; };
S['Aragorn, King of Gondor'] = (d) => {
  d.etb = [monarchE()];
  d.trig.push(T('attack', { self: true, eff: [fn((G, X, t) => {
    const c = t && t.c;
    if (c && onBf(G, c)) { c.tf.cantBlock = true; emit(G, 'info', `${c.def.name} can't block this turn.`, { who: X.P.i, cards: [c.id] }); }
    if (G.monarch === X.P.i) { noBlocks(G, allCreatures(G)); emit(G, 'info', "Creatures can't block this turn.", { who: X.P.i }); }
  }, { tgt: { f: { side: 'opp' }, min: 0 }, val: (G, P, c) => (c.tapped ? 0 : cv(c) * 0.3 + Math.max(0, tou(c)) * 0.2), label: "Up to one creature can't block this turn" })] }));
  return d;
};
S['Banquet Guests'] = (d) => {
  d.costMod = (G, P) => foodsOf(P).length; // affinity for Foods
  d.etbCtr = (G, P, card, opts) => ({ '+1/+1': 2 * ((opts.item && opts.item.x) || 0) });
  d.aiX = (G, P, card, max) => (max >= 1 ? max : null);
  d.acts.push({ cost: { m: C('{2}') }, label: 'Sacrifice a Food: Banquet Guests gains indestructible until end of turn', when: ['blocks'], cond: (G, P) => foodsOf(P).length > 0,
    run: (G, X) => { if (sacFood(G, X.P)) grantKw(G, X.src, ['indestructible']); }, ai: (G, P, c) => (doomed(G, c) && !has(c, 'indestructible') ? { score: 2 + cv(c) * 0.3 } : null) });
  return d;
};
S['Bilbo, Birthday Celebrant'] = (d) => {
  d.gainPlus = 1;
  d.acts.push({ cost: { m: C('{2}{W}{B}{G}'), tap: true, exileSelf: true }, label: 'Search for any number of creature cards and put them onto the battlefield', when: ['main1'], cond: (G, P) => P.life >= 111,
    run: (G, X) => { const got = searchLibrary(G, X.P, (c) => c.def.types.includes('Creature'), 99, 'bf', 'Search for any number of creature cards'); if (got.length) emit(G, 'enter', `${X.P.name} puts ${nameList(got)} onto the battlefield.`, { who: X.P.i, cards: got.map((c) => c.id) }); },
    ai: () => ({ score: 8 }) });
  return d;
};
S["Boromir, Gondor's Hope"] = (d) => {
  const look = fn((G, X) => lookTake(G, X.P, 6, (c) => c.def.types.includes('Artifact') || (c.def.types.includes('Creature') ? c.def.sub.includes('Human') : c.def.sub.includes('Human')), 1, 'Reveal a Human or artifact card and put it into your hand'), { score: () => 1.3 });
  d.etb = [look];
  d.trig.push(T('attack', { self: true, eff: [look] }));
  return d;
};
S['Círdan the Shipwright'] = (d) => {
  // Secret council: each player votes for a player; each draws a card per vote; a player with no votes may put a permanent card from hand onto the battlefield
  const council = fn((G, X) => {
    const ps = [X.P, X.O];
    const votes = ps.map((Q) => (isHuman(G, Q) ? ps[chooseMode(G, Q, X.src, `${X.src.def.name}: vote for a player`, ps.map((p) => (p === Q ? 'Yourself' : p.name)), 0)] : Q));
    emit(G, 'info', `${X.src.def.name}: ${ps.map((Q, i) => `${Q.name} votes for ${votes[i] === Q ? 'themself' : votes[i].name}`).join('; ')}.`, { who: X.P.i });
    for (const Q of ps) drawN(G, Q, votes.filter((v) => v === Q).length);
    for (const Q of ps) {
      if (votes.includes(Q)) continue;
      const cs = Q.hand.filter((c) => L.isPermanentSpell(c.def) || isLand(c));
      const pick = isHuman(G, Q) ? pickSome(G, Q, cs, 0, 1, 'Put a permanent card from your hand onto the battlefield?', (c) => c.def.value, 'hand')[0] : cs.slice().sort((a, b) => b.def.mv - a.def.mv)[0];
      if (pick) { emit(G, 'enter', `${Q.name} puts ${pick.def.name} onto the battlefield.`, { who: Q.i, cards: [pick.id] }); putOntoBattlefield(G, Q, pick); }
    }
    if (G.pending) L.fire(G, 'voted', { P: X.P, votes: votes.map((v, i) => ({ Q: ps[i], k: v.i })), labels: ps.map((p) => p.name), src: X.src });
  }, { score: () => 1.2 });
  d.etb = [council];
  d.trig.push(T('attack', { self: true, eff: [council] }));
  return d;
};
S['Elrond of the White Council'] = (d) => {
  d.etb = [fn((G, X) => {
    // Fellowship: the voter hands over a creature (it can't attack its owner); aid: a +1/+1 counter on each creature Elrond's controller controls
    const P = X.P, O = X.O;
    const r = vote(G, P, X.src, ['fellowship', 'aid'], (GG, Q, k) => {
      if (Q === P) return k === 1 ? 1 : 0;
      const mine = Q.bf.filter(isCreature), worst = mine.length ? Math.min(...mine.map((c) => cv(c))) : 0;
      return k === 0 ? (mine.length ? -worst - 0.5 : 5) : -P.bf.filter(isCreature).length * 0.9;
    });
    for (const v of r.votes) {
      if (v.k !== 0) continue;
      const cs = v.Q.bf.filter(isCreature);
      if (!cs.length) continue;
      const c = v.Q === P ? null : pickOne(G, v.Q, cs, 'Choose a creature to give to the council', (x) => -cv(x));
      if (!c) continue;
      gainControl(G, P, c, 'perm');
      c.mem.noAttackOwner = c.owner;
    }
    const aid = tally(r, 1);
    if (aid) for (const c of P.bf.filter(isCreature)) addCounters(G, c, aid, '+1/+1', true);
    if (aid) emit(G, 'pump', `${P.name}'s creatures get ${aid === 1 ? 'a +1/+1 counter' : `${aid} +1/+1 counters`}.`, { who: P.i });
  }, { score: (G, P) => P.bf.filter(isCreature).length * 0.8 + 0.5 })];
  return d;
};
S['Éomer, King of Rohan'] = (d) => {
  d.etbCtr = (G, P, card) => ({ '+1/+1': humans(P).filter((c) => c !== card).length });
  d.etb = [fn((G, X) => { const to = isHuman(G, X.P) ? (chooseMode(G, X.P, X.src, 'Who becomes the monarch?', ['You', X.O.name], 0) ? X.O : X.P) : X.P; becomeMonarch(G, to); }, { score: (G, P) => monarchVal(G, P) }),
    { k: 'dmgX', nFn: (G, X) => (onBf(G, X.src) ? Math.max(0, pow(X.src)) : 0), tgt: { what: 'any', f: {} } }];
  return d;
};
S['Éowyn, Shieldmaiden'] = (d) => {
  d.trig.push(T('combatStart', { you: true, cond: (G, src, ev, Q) => enteredOfType(G, Q, creType('Human'), src), run: (G, X) => {
    mk(G, X.P, HUMAN_KNIGHT, 2);
    if (humans(X.P).length >= 6) drawN(G, X.P, 1);
  } }));
  return d;
};
S['Erestor of the Council'] = (d) => {
  d.trig.push(T('voted', { run: (G, X) => {
    const P = X.P, mine = new Set(X.ev.votes.filter((v) => v.Q === P).map((v) => v.k));
    const opp = [...new Set(X.ev.votes.filter((v) => v.Q !== P).map((v) => v.Q))];
    const same = opp.filter((Q) => X.ev.votes.some((v) => v.Q === Q && mine.has(v.k)));
    const diff = opp.filter((Q) => X.ev.votes.some((v) => v.Q === Q && !mine.has(v.k)));
    for (const Q of same) treasure(G, Q);
    if (diff.length) scryChoice(G, P, diff.length);
    drawN(G, P, 1);
  } }));
  return d;
};
S['Extract from Darkness'] = (d) => {
  d.spell = [fn((G, X) => {
    for (const Q of [X.P, X.O]) mill(G, Q, 2);
    const cs = gyCreatures(G);
    const c = pickOne(G, X.P, cs, 'Put a creature card from a graveyard onto the battlefield', (x) => x.def.value, 'choose', 'graveyard');
    if (c) reanimate(G, X.P, c);
  }, { score: (G, P) => Math.max(1, ...gyCreatures(G).map((c) => c.def.value)) })];
  return d;
};
S['Faramir, Steward of Gondor'] = (d) => {
  d.trig.push(T('enter', { you: true, cond: (G, src, ev) => isCreature(ev.c) && isLegendary(ev.c) && ev.c.def.mv >= 4, eff: [monarchE()] }));
  d.trig.push(T('endStep', { you: true, cond: (G, src, ev, Q) => ev.nth === 1 && G.monarch === Q.i, eff: [mkE(HUMAN_SOLDIER, 2)] }));
  return d;
};
S['Farmer Cotton'] = (d) => {
  d.etb = [fn((G, X) => { const x = (X.item && X.item.x) || 0; mk(G, X.P, HALFLING, x); food(G, X.P, x); }, { score: (G, P, X) => ((X && X.item && X.item.x) || 0) * 1.6 })];
  d.aiX = (G, P, card, max) => (max >= 2 ? max : null);
  return d;
};
S['Forth Eorlingas!'] = (d) => {
  d.spell = [fn((G, X) => {
    mk(G, X.P, HUMAN_KNIGHT, X.x || 0);
    thisTurn(G, X.P, X.src, T('combatDamagedYou', { opp: true, run: (GG, XX) => becomeMonarch(GG, XX.P) }));
  }, { score: (G, P, X) => ((X && X.x) || 0) * 2.2 + 0.8 })];
  d.aiX = (G, P, card, max) => (max >= 2 ? max : null);
  d.castIf = (G, P) => G.active === P.i && G.phase === 'main1';
  d.role = 'tokens';
  return d;
};
S['Frodo, Adventurous Hobbit'] = (d) => {
  d.trig.push(T('attack', { self: true, cond: (G, src, ev, Q) => gained(Q) >= 3, run: (G, X) => {
    tempt(G, X.P);
    if (X.P.ring.bearer === X.src.id && X.P.ring.n >= 2) drawN(G, X.P, 1);
  } }));
  return d;
};
S['Galadriel, Elven-Queen'] = (d) => {
  d.trig.push(T('combatStart', { you: true, cond: (G, src, ev, Q) => enteredOfType(G, Q, creType('Elf'), src), run: (G, X) => {
    const r = vote(G, X.P, X.src, ['dominion', 'guidance'], (GG, Q, k) => (Q === X.P ? (k === 0 ? 2.2 : 1.5) : (k === 0 ? -2.2 : -1.5)));
    if (tally(r, 0) > tally(r, 1)) { tempt(G, X.P); const rb = ringBearer(G, X.P); if (rb) addCounters(G, rb, 1); }
    else drawN(G, X.P, 1);
  } }));
  return d;
};
S['Gandalf, Westward Voyager'] = (d) => {
  d.trig.push(T('cast', { you: true, cond: (G, src, ev) => !!ev.card && ev.card.def.mv >= 5 && !!ev.item, run: (G, X) => {
    const O = X.O, top = O.library[O.library.length - 1];
    if (top) emit(G, 'reveal', `${O.name} reveals ${top.def.name}.`, { who: O.i, cards: [top.id] });
    const types = ['Artifact', 'Creature', 'Enchantment', 'Instant', 'Land', 'Planeswalker', 'Sorcery'];
    if (top && types.some((t) => top.def.types.includes(t) && X.ev.card.def.types.includes(t))) { copySpell(G, X.P, X.ev.item); drawN(G, O, 1); }
    else drawN(G, X.P, 1);
  } }));
  return d;
};
S["Gríma, Saruman's Footman"] = (d) => {
  d.unblockable = true;
  d.trig.push(T('hitPlayer', { self: true, run: (G, X) => {
    const Q = X.ev.Q;
    const { hits, rest } = L.revealUntil(G, Q, (c) => isIS(c.def), 1);
    const all = rest.concat(hits);
    for (const c of all) Q.exile.push(c);
    if (all.length) emit(G, 'exile', `${Q.name} exiles ${nameList(all)} from the top of their library.`, { who: X.P.i, cards: all.map((c) => c.id) });
    const c = hits[0];
    let cast = false;
    if (c) { X.P.xcast.push({ card: c, until: G.turn, free: true }); cast = castNow(G, X.P, c, { free: true }); X.P.xcast = X.P.xcast.filter((x) => x.card !== c); }
    const back = all.filter((x) => !(cast && x === c) && Q.exile.includes(x));
    for (const x of back) Q.exile.splice(Q.exile.indexOf(x), 1);
    G.rng.shuffle(back); Q.library.unshift(...back);
    dirty(G);
  } }));
  return d;
};
S['Growth Spiral'] = (d) => {
  d.spell = [{ k: 'draw', n: 1 }, fn((G, X) => {
    const ls = X.P.hand.filter(isLand);
    const c = isHuman(G, X.P) ? pickSome(G, X.P, ls, 0, 1, 'Put a land card from your hand onto the battlefield?', () => 1, 'hand')[0] : ls[0];
    if (c) { emit(G, 'land', `${X.P.name} puts ${c.def.name} onto the battlefield.`, { who: X.P.i, cards: [c.id] }); putOntoBattlefield(G, X.P, c); }
  }, { score: (G, P) => (P.hand.some(isLand) ? 1.5 : 0.3) })];
  d.role = 'ramp';
  return d;
};
S['In the Darkness Bind Them'] = (d) => {
  const wraith = [mkE(WRAITH, 1), { k: 'tempt' }];
  d.saga = [
    { ch: [1, 2, 3], eff: wraith },
    { ch: [4], eff: [fn((G, X, t) => { if (t && t.c) borrow(G, X, t.c); }, { tgt: { f: { side: 'opp' }, min: 0 }, val: borrowVal, label: 'Gain control of up to one creature until end of turn' }), { k: 'tempt' }] },
  ];
  return d;
};
S['Lidless Gaze'] = (d) => {
  d.spell = [fn((G, X) => {
    const until = untilMyNextEnd(G, X.P);
    for (const Q of [X.P, X.O]) {
      const c = Q.library.pop();
      if (!c) continue;
      Q.exile.push(c);
      X.P.xcast.push({ card: c, until, anyType: true });
      emit(G, 'exile', `${c.def.name} is exiled from the top of ${Q.name}'s library; ${X.P.name} may play it.`, { who: X.P.i, cards: [c.id] });
    }
    dirty(G);
  }, { score: () => 1.8 })];
  d.flashback = C('{2}{B}{R}');
  d.role = 'draw';
  return d;
};
S['Lord of the Nazgûl'] = (d) => {
  const bearer = (src) => !!src.g && src.ctrl != null && !!src.g.players[src.ctrl] && src.g.players[src.ctrl].ring.n > 0 && src.g.players[src.ctrl].ring.bearer === src.id;
  d.statics.push({ who: 'all', f: { side: 'you', sub: 'Wraith' }, p: 0, t: 0, kw: [], flags: { proFn: bearer } });
  d.trig.push(T('cast', { you: true, cond: (G, src, ev) => !!ev.card && isIS(ev.card.def), run: (G, X) => {
    mk(G, X.P, WRAITH, 1);
    const ws = X.P.bf.filter((c) => isCreature(c) && hasSub(c, 'Wraith'));
    if (ws.length >= 9) { for (const c of ws) c.base = { p: 9, t: 9 }; G.delayed.push({ when: 'end', run: () => { for (const c of ws) c.base = null; } }); dirty(G); emit(G, 'pump', `${X.P.name}'s Wraiths are 9/9 until end of turn.`, { who: X.P.i }); }
  } }));
  return d;
};
S['Merry, Warden of Isengard'] = (d) => { d.trig.push(T('enter', { you: true, once: true, cond: (G, src, ev) => isArtifact(ev.c), eff: [mkE(SOLDIER_LL, 1)] })); return d; };
S['Mirkwood Trapper'] = (d) => {
  d.trig.push(T('attacks', { opp: true, eff: [{ k: 'pumpT', p: -2, t: 0, tgt: { f: { attacking: true } } }] }));
  return d;
};
S['Moria Scavenger'] = (d) => {
  d.acts.push({ cost: { tap: true }, label: 'Discard a card: draw a card (a creature card discarded amasses Orcs 1)', when: ['end'], cond: (G, P) => P.hand.length > 0,
    run: (G, X) => {
      const P = X.P, before = P.gy.slice();
      discardChoice(G, P, 1, 'loot');
      const gone = P.gy.filter((c) => !before.includes(c));
      drawN(G, P, 1);
      if (gone.some((c) => c.def.types.includes('Creature'))) amass(G, P, 1);
    }, ai: (G, P) => (P.hand.some((c) => isLand(c) && P.bf.filter(isLand).length >= 6) || P.hand.length >= 5 ? { score: 1 } : null) });
  return d;
};
S['Notion Thief'] = (d) => { d.notionThief = true; return d; };
S['Oath of Eorl'] = (d) => {
  d.saga = [
    { ch: [1], eff: [mkE(HUMAN_SOLDIER, 2)] },
    { ch: [2], eff: [mkE(HUMAN_KNIGHT, 2)] },
    { ch: [3], eff: [{ k: 'ctrs', n: 1, kind: 'indestructible', tgt: { f: { side: 'you', sub: 'Human' }, min: 0 } }, monarchE()] },
  ];
  return d;
};
S['Pippin, Warden of Isengard'] = (d) => {
  d.acts.push({ cost: { m: C('{1}'), tap: true }, label: 'Create a Food token', when: ['end'], eff: [foodE(1)], ai: () => ({ score: 0.9 }) });
  d.acts.push({ cost: { tap: true }, sorcery: true, label: 'Sacrifice four Foods: other creatures you control get +3/+3 and haste until end of turn', when: ['main1'], cond: (G, P) => foodsOf(P).length >= 4,
    run: (G, X) => { if (!sacFood(G, X.P, 4)) return; const cs = X.P.bf.filter((c) => c !== X.src && isCreature(c)); for (const c of cs) { c.tp += 3; c.tt += 3; if (!c.tkw.includes('haste')) c.tkw.push('haste'); } dirty(G); emit(G, 'pump', `${X.P.name}'s other creatures get +3/+3 and haste until end of turn.`, { who: X.P.i, cards: cs.map((c) => c.id) }); },
    ai: (G, P, c) => (P.bf.filter((x) => x !== c && isCreature(x)).length >= 3 ? { score: P.bf.filter((x) => x !== c && isCreature(x)).length * 1.5 } : null) });
  return d;
};
S['Radagast, Wizard of Wilds'] = (d) => {
  d.statics.push({ who: 'all', f: { side: 'you', subs: ['Beast', 'Bird'] }, p: 0, t: 0, kw: [], ward: 1 });
  d.trig.push(T('cast', { you: true, cond: (G, src, ev) => !!ev.card && ev.card.def.mv >= 5, eff: [chooseOne([
    { label: 'Create a 3/3 green Beast', eff: [mkE(BEAST, 1)] },
    { label: 'Create a 2/2 blue Bird with flying', eff: [mkE(BIRD_U, 1)] },
  ])] }));
  return d;
};
S['Riders of Rohan'] = (d) => { d.etb = [mkE(HUMAN_KNIGHT, 2)]; return dash(d, '{4}{R}{W}', () => 1.5); };
S['Sail into the West'] = (d) => {
  d.spell = [fn((G, X) => {
    const r = vote(G, X.P, X.src, ['return', 'embark'], (GG, Q, k) => (k === 0 ? Q.gy.slice().sort((a, b) => b.def.value - a.def.value).slice(0, 2).reduce((s, c) => s + c.def.value * 0.6, 0) : Math.max(0, 7 - Q.hand.length) * 0.6));
    if (tally(r, 0) > tally(r, 1)) {
      for (const Q of [X.P, X.O]) {
        const cs = pickSome(G, Q, Q.gy.filter((c) => c !== X.src), 0, 2, 'Return up to two cards to your hand', (c) => c.def.value + 0.1, 'graveyard');
        for (const c of cs) { Q.gy.splice(Q.gy.indexOf(c), 1); Q.hand.push(c); }
        if (cs.length) emit(G, 'raise', `${Q.name} returns ${nameList(cs)} to hand.`, { who: Q.i, cards: cs.map((c) => c.id) });
      }
      exileSpell(G, X.src);
    } else {
      for (const Q of [X.P, X.O]) {
        const want = isHuman(G, Q) ? yesNo(G, Q, X.src, 'Discard your hand and draw seven cards?', Q.hand.length < 4) : Q.hand.length <= 3;
        if (!want) continue;
        const n = Q.hand.length;
        Q.gy.push(...Q.hand.splice(0));
        if (n) emit(G, 'discard', `${Q.name} discards their hand.`, { who: Q.i });
        drawN(G, Q, 7);
      }
    }
    dirty(G);
  }, { score: (G, P) => Math.max(1, 6 - P.hand.length) * 0.5 })];
  return d;
};
S['Sam, Loyal Attendant'] = (d) => { d.trig.push(T('combatStart', { you: true, eff: [foodE(1)] })); d.foodDiscount = true; return d; };
S['Saruman, the White Hand'] = (d) => {
  d.trig.push(T('cast', { you: true, cond: (G, src, ev) => !!ev.card && !ev.card.def.types.includes('Creature'), run: (G, X) => amass(G, X.P, X.ev.card.def.mv + ((X.ev.item && X.ev.item.x) || 0)) }));
  d.statics.push({ who: 'all', f: { side: 'you', fn: (G, c) => L.orcish(c) }, p: 0, t: 0, kw: [], ward: 2 });
  return d;
};
S['Sauron, Lord of the Rings'] = (d) => {
  d.onCast = (G, P) => {
    amass(G, P, 5);
    mill(G, P, 5);
    const cs = P.gy.filter((c) => c.def.types.includes('Creature'));
    const c = pickOne(G, P, cs, 'Return a creature card from your graveyard to the battlefield', (x) => x.def.value, 'choose', 'graveyard');
    if (c) reanimate(G, P, c);
  };
  d.trig.push(T('die', { opp: true, cond: (G, src, ev) => isCommander(ev.c), eff: [{ k: 'tempt' }] }));
  return d;
};
S['Savvy Hunter'] = (d) => {
  d.trig.push(T('attack', { self: true, eff: [foodE(1)] }), T('blocks', { self: true, eff: [foodE(1)] }));
  d.acts.push({ cost: {}, label: 'Sacrifice two Foods: draw a card', when: ['end'], cond: (G, P) => foodsOf(P).length >= 2, run: (G, X) => { if (sacFood(G, X.P, 2)) drawN(G, X.P, 1); }, ai: (G, P) => (foodsOf(P).length >= 3 || (foodsOf(P).length >= 2 && P.life >= 20) ? { score: 1.1 } : null) });
  return d;
};
S['Song of Eärendil'] = (d) => {
  d.saga = [
    { ch: [1], eff: [{ k: 'scry', n: 2 }, { k: 'draw', n: 2 }] },
    { ch: [2], eff: [{ k: 'treasure', n: 1 }, mkE(BIRD_U, 1)] },
    { ch: [3], eff: [fn((G, X) => { const cs = X.P.bf.filter((c) => isCreature(c) && !has(c, 'flying')); for (const c of cs) addCounters(G, c, 1, 'flying', true); if (cs.length) emit(G, 'pump', `${X.P.name}'s creatures get flying counters.`, { who: X.P.i, cards: cs.map((c) => c.id) }); }, { score: (G, P) => P.bf.filter((c) => isCreature(c) && !has(c, 'flying')).length * 1.2 })] },
  ];
  return d;
};
S['Summons of Saruman'] = (d) => {
  d.spell = [fn((G, X) => {
    const P = X.P, x = X.x || 0;
    amass(G, P, x);
    const got = mill(G, P, x) || [];
    const milled = (Array.isArray(got) && got.length ? got : P.gy.slice(-x)).filter((c) => P.gy.includes(c) && isIS(c.def) && c.def.mv <= x && c !== X.src);
    const c = milled.length ? pickOne(G, P, milled, 'Cast an instant or sorcery card from among them for free?', (y) => y.def.value, 'choose', 'graveyard') : null;
    if (c) castNow(G, P, c, { free: true });
  }, { score: (G, P, X) => ((X && X.x) || 0) * 1.3 })];
  d.aiX = (G, P, card, max) => (max >= 2 ? max : null);
  // Flashback {3}{U}{R}, exiling X cards from your graveyard: X is how many were exiled
  d.flashback = C('{3}{U}{R}');
  d.onCast = (G, P, item) => {
    if (!item.flashback) return;
    const pool = P.gy.slice();
    const x = isHuman(G, P) ? L.chooseNumber(G, P, item.card, 'Summons of Saruman: exile how many cards (X)?', 0, pool.length, pool.length) : pool.length;
    const out = pool.sort((a, b) => a.def.value - b.def.value).slice(0, x);
    for (const c of out) { P.gy.splice(P.gy.indexOf(c), 1); P.exile.push(c); }
    item.x = x;
    if (x) emit(G, 'exile', `${P.name} exiles ${x} cards from their graveyard (X = ${x}).`, { who: P.i });
  };
  return d;
};
S['The Balrog of Moria'] = (d) => {
  d.trig.push(T('die', { self: true, may: true, mayLabel: 'Exile The Balrog of Moria to exile a creature the opponent controls?', mayAi: (G, X) => X.O.bf.some(isCreature), run: (G, X) => {
    const c = X.ev.c, Q = G.players[c.owner];
    if (!Q.gy.includes(c)) return;
    Q.gy.splice(Q.gy.indexOf(c), 1); Q.exile.push(c);
    emit(G, 'exile', `${c.def.name} is exiled.`, { who: X.P.i, cards: [c.id] });
    const cs = X.O.bf.filter(isCreature);
    const t = pickOne(G, X.P, cs, 'Exile up to one creature that player controls', (x) => pv(G, x));
    if (t) { X.P.stats.kills++; exilePermanent(G, X.P, t); }
  } }));
  d.cycling = C('{3}{R}');
  d.cycleRun = (G, P) => { drawN(G, P, 1); treasure(G, P, 2); };
  d.cycleAi = (G, P) => P.bf.filter(isLand).length < 5;
  return d;
};
S['Too Greedily, Too Deep'] = (d) => {
  d.spell = [fn((G, X, t) => {
    const c = t && t.c;
    if (!c || !reanimate(G, X.P, c)) return;
    if (!onBf(G, c)) return;
    const n = Math.max(0, pow(c));
    for (const x of allCreatures(G).filter((y) => y !== c)) damageCreature(G, x, n, c);
    emit(G, 'damage', `${c.def.name} deals ${n} damage to each other creature.`, { who: X.P.i, cards: [c.id] });
  }, { tgt: { what: 'gy', f: { types: ['Creature'] } }, val: (G, P, c) => c.def.value + allCreatures(G).filter((x) => tou(x) - x.dmg <= (c.def.power || 0) && !has(x, 'indestructible')).reduce((s, x) => s + (x.ctrl === P.i ? -cv(x) : cv(x)), 0), label: 'Choose a creature card in a graveyard' })];
  d.castIf = (G) => gyCreatures(G).length > 0;
  return d;
};
S['Travel Through Caradhras'] = (d) => {
  d.spell = [fn((G, X) => {
    const P = X.P;
    const r = vote(G, P, X.src, ['Redhorn Pass', 'Mines of Moria'], (GG, Q, k) => (Q === P ? (k === 0 ? rampVal(GG, P) + 0.5 : P.gy.length ? 1.5 : 0) : (k === 0 ? -rampVal(GG, P) - 0.5 : P.gy.length ? -1.5 : 0)));
    const lands = tally(r, 0), back = tally(r, 1);
    if (lands) fetchBasic(G, P, true, lands);
    for (let k = 0; k < back; k++) {
      const cs = P.gy.filter((c) => c !== X.src);
      const c = pickOne(G, P, cs, 'Return a card from your graveyard to your hand', (x) => x.def.value, 'choose', 'graveyard');
      if (c) { P.gy.splice(P.gy.indexOf(c), 1); P.hand.push(c); emit(G, 'raise', `${P.name} returns ${c.def.name} to hand.`, { who: P.i, cards: [c.id] }); }
    }
    exileSpell(G, X.src);
    dirty(G);
  }, { score: (G, P) => 2 + rampVal(G, P) })];
  d.role = 'ramp';
  return d;
};
S['Treebeard, Gracious Host'] = (d) => {
  d.etb = [foodE(2)];
  d.trig.push(T('gain', { you: true, eff: [fn((G, X, t) => { const c = t && t.c; if (c && onBf(G, c)) addCounters(G, c, X.ev.n); }, { tgt: { f: { side: 'you', subs: ['Halfling', 'Treefolk'] } }, val: (G, P, c) => cv(c) * 0.1 + 1, label: 'Choose a Halfling or Treefolk' })] }));
  return d;
};
S["Vanquisher's Banner"] = (d) => {
  chooseTypeAs(d);
  d.statics.push({ who: 'all', f: { side: 'you', fn: (G, c, P, src) => ofType(c, src) }, p: 1, t: 1, kw: [] });
  d.trig.push(T('cast', { you: true, cond: (G, src, ev) => !!ev.card && ev.card.def.types.includes('Creature') && defOfType(ev.card.def, src), eff: [{ k: 'draw', n: 1 }] }));
  d.role = 'value';
  return d;
};
S['Wake the Dragon'] = (d) => {
  const steal = fn((G, X, t) => { const c = t && t.c; if (c && onBf(G, c)) gainControl(G, X.P, c, 'perm'); }, { tgt: { f: { types: ['Artifact'], side: 'opp' } }, val: (G, P, c) => pv(G, c) + 0.5, label: 'Gain control of an artifact that player controls' });
  const DRAGON = tok('Dragon', 6, 6, ['B', 'R'], ['Dragon'], ['flying', 'menace'], { text: 'Flying, menace\nWhenever this token deals combat damage to a player, gain control of target artifact that player controls.', trig: [T('hitPlayer', { self: true, eff: [steal] })] });
  d.spell = [mkE(DRAGON, 1)];
  d.flashback = C('{6}{B}{R}');
  d.role = 'tokens';
  return d;
};

return S;
});
