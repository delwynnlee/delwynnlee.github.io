/* Cards from Wizards' own preconstructed decks: the Jumpstart packs of The Lord of the Rings, the Starter Kits of LTR and
   FINAL FANTASY, the Welcome Decks of Core Set 2019 and Marvel Super Heroes, the Spellslinger Starter Kit, and the starter,
   advanced and theme decks of the older core sets. Only the cards those decks need that the engine's reader can't handle.
   Each entry gets the card's skeleton (types, cost, keywords, equip and simple static lines already read) and fills in the rest. */
(function (root, factory) {
  const A = typeof module === 'object' && module.exports ? require('./engine.js') : root.Arena;
  const S = factory(A);
  A.registerScripts(S);
  if (typeof module === 'object' && module.exports) module.exports = S;
})(typeof self !== 'undefined' ? self : this, function (A) {
'use strict';
const L = A.lib;
const { isCreature, isLand, isLegendary, pow, tou, has, hasSub, ctrCount, equipmentOn, attach, emit, dirty, onBf, cv, pv, allCreatures, allPerms, other,
  diedThisTurn, makeTokens, TREASURE, FOOD, addCounters, sacrifice, drawCards, gainLife, chooseMode, yesNo, pickCards, isHuman, mill, lifeW, canPay, pay,
  destroyPermanent, bounceCard, gainControl, searchLibrary, dealDamage, damageCreature, nameList, ctrlOf, isIS, scryChoice, exileUntil, sacrificeChoice,
  attackedThisTurn, orcish, fire, fightScore, isEquipped, toGraveyard } = L;

/* ---------- Shorthand ---------- */
const C = (s) => L.parseCost(s);
const T = (on, o) => Object.assign({ on }, o);
const fn = (run, o) => Object.assign({ k: 'fn', run }, o);
const tg = (f, o) => Object.assign({ f: f || {} }, o);
const say = (G, P, text, cards) => emit(G, 'info', text, { who: P.i, cards });
const drawN = (G, P, n) => { if (n <= 0) return; drawCards(G, P, n); emit(G, 'draw', `${P.name} draws ${n === 1 ? 'a card' : `${n} cards`}.`, { who: P.i }); };
const loseLife = (G, Q, n, who) => { if (n <= 0) return; Q.life -= n; emit(G, 'life', `${Q.name} loses ${n} life.`, { who: who != null ? who : Q.i, target: `p${Q.i}`, amount: n }); };
const gain = (G, P, n) => { if (n <= 0) return; const b = P.life; gainLife(G, P, n); const got = P.life - b; if (got > 0) emit(G, 'life', `${P.name} gains ${got} life.`, { who: P.i, target: `p${P.i}`, amount: -got }); };
const pump = (G, c, p, t, kws = []) => { if (!onBf(G, c)) return; c.tp += p; c.tt += t; kws.forEach((k) => { if (!c.tkw.includes(k)) c.tkw.push(k); }); dirty(G); emit(G, 'pump', `${c.def.name} gets ${L.sgn(p)}/${L.sgn(t)}${kws.length ? ` and gains ${kws.join(' and ')}` : ''} until end of turn.`, { who: c.ctrl, cards: [c.id] }); };
const grantKw = (G, c, kws, text) => { if (!onBf(G, c)) return; kws.forEach((k) => { if (!c.tkw.includes(k)) c.tkw.push(k); }); dirty(G); emit(G, 'pump', `${c.def.name} ${text || `gains ${kws.join(' and ')} until end of turn`}.`, { who: c.ctrl, cards: [c.id] }); };
const creaturesOf = (P) => P.bf.filter(isCreature);
const nSub = (P, sub) => P.bf.filter((c) => hasSub(c, sub)).length;
const basic = { types: ['Land'], fn: (dd) => dd.supertypes.includes('Basic') };
const lastC = (X) => (X.last && X.last.c) || null;
// Pick one card: a human chooses, the AI takes the best by `score`
function pickOne(G, P, cards, label, score, zone = 'battlefield') {
  if (!cards.length) return null;
  if (isHuman(G, P)) return cards.length === 1 ? cards[0] : pickCards(G, { type: 'choose', reason: 'choose', n: 1, min: 1, max: 1, zone, cards: cards.map((c) => c.id), label }, cards, 1)[0];
  return cards.slice().sort((a, b) => score(b) - score(a) || a.id - b.id)[0];
}
function pickSome(G, P, cards, min, max, label, score, zone = 'battlefield') {
  max = Math.min(max, cards.length);
  if (max <= 0) return [];
  if (isHuman(G, P)) return pickCards(G, { type: 'choose', reason: 'choose', n: max, min: Math.min(min, max), max, zone, cards: cards.map((c) => c.id), label }, cards, null).slice(0, max);
  const ranked = cards.slice().sort((a, b) => score(b) - score(a) || a.id - b.id);
  return ranked.filter((c, k) => k < min || (k < max && score(c) > 0));
}
function mk(G, P, spec, n, o = {}) {
  if (n <= 0) return [];
  const made = makeTokens(G, P, spec, n, { quiet: true, tapped: o.tapped });
  emit(G, 'token', `${P.name} creates ${n === 1 ? `a ${spec.name} token` : `${n} ${spec.name} tokens`}.`, { who: P.i, cards: made.map((c) => c.id) });
  return made;
}
const tokSpec = (name, p, t, colors, sub, kw = []) => ({ id: `pc-${name.toLowerCase().replace(/[^a-z]+/g, '-')}-${p}-${t}`, name, p, t, colors, sub, kw });
const HALFLING = tokSpec('Halfling', 1, 1, ['W'], ['Halfling']);
const HUMAN_SOLDIER = tokSpec('Human Soldier', 1, 1, ['W'], ['Human', 'Soldier']);
// Look at the top n cards of Q's library and put them back in an order: the AI wants its best cards first and its opponent's worst
function reorderTop(G, P, Q, n) {
  const top = Q.library.slice(-n).reverse();
  if (top.length < 2) return;
  let order;
  if (isHuman(G, P)) {
    const first = pickCards(G, { type: 'choose', reason: 'look', n: top.length, min: 0, max: top.length, zone: 'library', cards: top.map((c) => c.id), label: 'Pick the cards in the order they will be drawn (the rest go under them)' }, top, null);
    order = first.concat(top.filter((c) => !first.includes(c)));
  } else {
    const want = topWant(G, Q);
    order = top.slice().sort((a, b) => (Q === P ? want(b) - want(a) : want(a) - want(b)));
  }
  Q.library.splice(Q.library.length - top.length, top.length, ...order.slice().reverse());
  emit(G, 'search', `${P.name} looks at the top ${top.length} cards of ${Q === P ? 'their' : `${Q.name}'s`} library and puts them back in an order.`, { who: P.i });
  dirty(G);
}
// How much a player wants to draw a card next: lands while they're short of them, otherwise their best spells
const topWant = (G, Q) => { const lands = Q.bf.filter(isLand).length + Q.hand.filter(isLand).length; return (c) => (isLand(c) ? (lands < 5 ? 6 : 0.5) : c.def.value + 1); };
// Tap any number of untapped creatures that pass f (the AI keeps blockers back when it's under pressure)
function tapSome(G, P, src, f, label) {
  const cs = P.bf.filter((c) => c !== src && isCreature(c) && !c.tapped && !c.attacking && f(c));
  const danger = other(G, P).bf.filter((c) => isCreature(c)).reduce((s, c) => s + Math.max(0, pow(c)), 0) >= P.life * 0.6;
  const pick = pickSome(G, P, cs, 0, cs.length, label, (c) => (danger ? -1 : 2 - cv(c) * 0.2));
  pick.forEach((c) => { c.tapped = true; });
  if (pick.length) { emit(G, 'tapfx', `${P.name} taps ${nameList(pick)}.`, { who: P.i, cards: pick.map((c) => c.id) }); fire(G, 'tapped', { P, cs: pick }); }
  return pick;
}
// "At the beginning of combat on your turn"
const combatStart = (o) => T('combatStart', Object.assign({ you: true }, o));
// "Whenever this creature enters or attacks"
const entersOrAttacks = (d, run) => { d.etb.push(fn(run, { score: () => 1 })); d.trig.push(T('attack', { self: true, run })); };
// Removal that also hurts: the AI's value for a target an opponent controls
const killVal = (G, P, c) => (c.ctrl === P.i ? -pv(G, c) - 2 : pv(G, c));
const S = {};

/* ============================================================
   The Lord of the Rings: Jumpstart
   ============================================================ */
S['Saradoc, Master of Buckland'] = (d) => {
  d.trig.push(T('enter', { you: true, cond: (G, src, ev) => ev.c === src || (isCreature(ev.c) && !ev.c.token && pow(ev.c) <= 2), eff: [fn((G, X) => mk(G, X.P, HALFLING, 1), { score: () => 1, value: 1 })] }));
  d.acts.push({ cost: { tapCre: 2, tapCreF: (x) => hasSub(x, 'Halfling') }, label: '+2/+0 and lifelink', run: (G, X) => pump(G, X.src, 2, 0, ['lifelink']),
    when: ['blocks'], ai: (G, P, c) => (c.attacking || c.blocking ? { score: 1.2 } : null) });
  return d;
};
S['Minas Tirith Garrison'] = (d) => {
  d.powFn = (G, c) => G.players[c.ctrl].hand.length;
  d.trig.push(T('attack', { self: true, run: (G, X) => { const n = tapSome(G, X.P, X.src, (c) => hasSub(c, 'Human'), 'Tap any number of untapped Humans: draw a card for each').length; drawN(G, X.P, n); } }));
  d.value = 3.4;
  return d;
};
S['Mirkwood Channeler'] = (d) => {
  const forests = (G, X) => nSub(X.P, 'Forest');
  d.trig.push(combatStart({ eff: [{ k: 'pumpT', tgt: tg({ side: 'you', sub: 'Elf' }), pFn: forests, tFn: forests, kw: ['trample'] }] }));
  d.value = 3.6;
  return d;
};
S['Elanor Gardner'] = (d) => {
  d.etb.push({ k: 'food', n: 1 });
  d.trig.push(T('endStep', { you: true, cond: (G, src, ev, Q) => Q.foodSacTurn === G.turn, may: true, mayAi: () => true, mayLabel: 'Search for a basic land?',
    eff: [{ k: 'tutor', f: basic, to: 'bfTapped', why: 'a basic land' }] }));
  return d;
};
S['Assault on Osgiliath'] = (d) => {
  d.spell = [{ k: 'amass', nFn: (G, X) => X.x || 0 }, fn((G, X) => {
    const cs = X.P.bf.filter((c) => isCreature(c) && orcish(c));
    cs.forEach((c) => { ['double strike', 'haste'].forEach((k) => { if (!c.tkw.includes(k)) c.tkw.push(k); }); });
    dirty(G);
    if (cs.length) emit(G, 'pump', `${nameList(cs)} gain double strike and haste until end of turn.`, { who: X.P.i, cards: cs.map((c) => c.id) });
  }, { score: (G, P, X, ctx) => (ctx === 'main1' ? 1 + P.bf.filter((c) => isCreature(c) && orcish(c)).length * 0.8 : -1), value: 2 })];
  d.minX = 1;
  d.aiX = (G, P, card, max) => max;
  d.castIf = (G, P) => G.phase === 'main1';
  d.value = 3.4;
  return d;
};
S.Ringwraiths = (d) => {
  d.etb.push({ k: 'pump', f: { side: 'opp' }, p: -3, t: -3, kw: [] }, fn((G, X) => { const c = lastC(X); if (c && isLegendary(c)) loseLife(G, G.players[c.ctrl], 3, X.P.i); }, { score: () => 0 }));
  d.gyTrig = [T('tempt', { you: true, run: (G, X) => { const P = X.P; if (!P.gy.includes(X.src)) return; P.gy.splice(P.gy.indexOf(X.src), 1); P.hand.push(X.src); dirty(G); emit(G, 'raise', `${P.name} returns ${X.src.def.name} from the graveyard to their hand.`, { who: P.i, cards: [X.src.id] }); } })];
  return d;
};
S['Eagle of Deliverance'] = (d) => {
  d.etb.push({ k: 'ctrs', n: 1, kind: 'indestructible', tgt: tg({ side: 'you', other: true }) }, fn((G, X) => { const c = lastC(X); if (c && onBf(G, c) && pow(c) <= 2) drawN(G, X.P, 1); }, { score: () => 0.5 }));
  return d;
};
S['Warg Rider'] = (d) => {
  d.statics.push({ who: 'all', f: { side: 'you', other: true, fn: (G, c) => orcish(c) }, p: 0, t: 0, kw: ['menace'] });
  d.trig.push(combatStart({ eff: [{ k: 'amass', n: 2 }] }));
  return d;
};
S['Riders of the Mark'] = (d) => {
  d.costMod = (G, P) => P.bf.filter((c) => isCreature(c) && hasSub(c, 'Human')).length;
  d.trig.push(T('endStep', { you: true, cond: (G, src) => attackedThisTurn(G, src), run: (G, X) => {
    const c = X.src;
    if (!onBf(G, c)) return;
    const n = Math.max(0, tou(c));
    bounceCard(G, X.P, c);
    mk(G, X.P, HUMAN_SOLDIER, n);
  } }));
  return d;
};
S['Elvish Mariner'] = (d) => {
  d.trig.push(T('attack', { self: true, run: (G, X) => scryChoice(G, X.P, 1) }));
  d.trig.push(T('scry', { you: true, cond: (G, src, ev) => ev.n > 0, run: (G, X) => {
    const n = X.ev.n || 1;
    G.pending.unshift({ src: X.src, P: X.P, t: { label: `Tap up to ${n === 1 ? 'one nonland permanent' : `${n} nonland permanents`}`,
      eff: [{ k: 'tapP', tgt: { f: { types: ['nonland'] }, n, min: 0 } }] }, ev: {} });
  } }));
  return d;
};

/* ============================================================
   The Lord of the Rings Starter Kit
   ============================================================ */
S['Aragorn and Arwen, Wed'] = (d) => {
  entersOrAttacks(d, (G, X) => {
    const cs = creaturesOf(X.P).filter((c) => c !== X.src);
    cs.forEach((c) => addCounters(G, c, 1));
    gain(G, X.P, cs.length);
  });
  return d;
};
S['Frodo, Determined Hero'] = (d) => {
  entersOrAttacks(d, (G, X) => {
    const eqs = X.P.bf.filter((c) => c.def.acts.some((a) => a.equip) && [2, 3].includes(c.def.mv) && c.att !== X.src.id);
    if (!eqs.length || !onBf(G, X.src)) return;
    if (isHuman(G, X.P) && !yesNo(G, X.P, X.src, 'Attach an Equipment with mana value 2 or 3 to Frodo?', true)) return;
    const e = pickOne(G, X.P, eqs, 'Attach which Equipment to Frodo?', (c) => L.equipGain(G, X.P, c, X.src) - (c.att != null ? 1 : 0));
    if (e) attach(G, e, X.src);
  });
  d.preventAll = (G, c) => G.active === c.ctrl;
  return d;
};
S['Gandalf, White Rider'] = (d) => {
  d.trig.push(T('cast', { you: true, run: (G, X) => {
    const cs = creaturesOf(X.P);
    cs.forEach((c) => { c.tp += 1; });
    dirty(G);
    if (cs.length) emit(G, 'pump', `${X.P.name}'s creatures get +1/+0 until end of turn.`, { who: X.P.i, cards: cs.map((c) => c.id) });
    scryChoice(G, X.P, 1);
  } }));
  d.trig.push(T('die', { self: true, may: true, mayAi: () => true, mayLabel: 'Put Gandalf into your library fifth from the top?', run: (G, X) => {
    const c = X.src, Q = G.players[c.owner];
    if (!Q.gy.includes(c)) return;
    Q.gy.splice(Q.gy.indexOf(c), 1);
    Q.library.splice(Math.max(0, Q.library.length - 4), 0, c);
    dirty(G);
    emit(G, 'info', `${c.def.name} goes into ${Q.name}'s library fifth from the top.`, { who: Q.i });
  } }));
  return d;
};
S['Galadriel, Gift-Giver'] = (d) => {
  entersOrAttacks(d, (G, X) => {
    const others = allCreatures(G).filter((c) => c !== X.src && c.ctrl === X.P.i);
    const ai = others.length ? 0 : X.P.bf.filter(isLand).length < 6 ? 2 : 1;
    const k = chooseMode(G, X.P, X.src, 'Galadriel: choose one', ['Put a +1/+1 counter on another target creature', 'Create a Food token', 'Create a Treasure token'], ai);
    if (k === 0) G.pending.unshift({ src: X.src, P: X.P, t: { label: 'Put a +1/+1 counter on another creature', eff: [{ k: 'ctrs', n: 1, tgt: tg({ other: true }) }] }, ev: {} });
    else if (k === 1) { makeTokens(G, X.P, FOOD, 1, { quiet: true }); emit(G, 'token', `${X.P.name} creates a Food token.`, { who: X.P.i }); }
    else { makeTokens(G, X.P, TREASURE, 1, { quiet: true }); emit(G, 'token', `${X.P.name} creates a Treasure token.`, { who: X.P.i }); }
  });
  return d;
};
S["Bilbo's Ring"] = (d) => {
  d.statics.push({ who: 'equipped', cond: (G, src) => G.active === src.ctrl, p: 0, t: 0, kw: ['hexproof'], flags: { unblockable: true } });
  d.trig.push(T('attacks', { cond: (G, src, ev) => ev.cs.length === 1 && src.att === ev.cs[0].id, run: (G, X) => { drawN(G, X.P, 1); loseLife(G, X.P, 1); } }));
  return d;
};
S['Banishing Light'] = (d) => {
  d.etb = [fn((G, X, t) => { if (t && t.c) exileUntil(G, X.P, X.src, t.c); }, { tgt: { f: { types: ['nonland'], side: 'opp' } }, val: (G, P, c) => pv(G, c) + 0.5, label: 'Exile a nonland permanent an opponent controls' })];
  d.role = 'removal';
  return d;
};
S['Sauron, the Lidless Eye'] = (d) => {
  d.etb = [fn((G, X, t) => {
    const c = t && t.c;
    if (!c || !onBf(G, c)) return;
    gainControl(G, X.P, c, 'eot', X.src);
    c.tapped = false;
    grantKw(G, c, ['haste'], 'untaps and gains haste until end of turn');
  }, { tgt: tg({ side: 'opp' }), val: (G, P, c) => cv(c) * 0.6 + 0.5, label: 'Gain control of a creature until end of turn' })];
  d.acts.push({ cost: { m: C('{1}{B}{R}') }, label: 'Creatures +2/+0, each opponent loses 2 life', run: (G, X) => {
    const cs = creaturesOf(X.P);
    cs.forEach((c) => { c.tp += 2; });
    dirty(G);
    emit(G, 'pump', `${X.P.name}'s creatures get +2/+0 until end of turn.`, { who: X.P.i, cards: cs.map((c) => c.id) });
    loseLife(G, X.O, 2, X.P.i);
  }, when: ['main1', 'end', 'blocks'], ai: (G, P, c, when) => {
    if (when === 'end') return { score: 1.2 + (other(G, P).life <= 2 ? 100 : 0) };
    if (when === 'blocks') return P.bf.some((x) => x.attacking && !x.blocked) ? { score: 1.5 } : null;
    return other(G, P).life <= 2 ? { score: 100 } : null;
  } });
  return d;
};
S['Gollum, Scheming Guide'] = (d) => {
  d.trig.push(T('attack', { self: true, run: (G, X) => {
    const P = X.P, Q = X.O, g = X.src;
    reorderTop(G, P, P, 2);
    const top = P.library[P.library.length - 1];
    if (!top) return;
    // Gollum's controller names the kind of the top card; the opponent guesses whether it's right
    const kind = isHuman(G, P) ? chooseMode(G, P, g, 'Gollum: choose land or nonland', ['Land', 'Nonland'], 0) : isLand(top) ? 0 : 1;
    const landShare = P.library.filter(isLand).length / Math.max(1, P.library.length);
    const guessYes = isHuman(G, Q) ? yesNo(G, Q, g, `${P.name} chose ${kind === 0 ? 'land' : 'nonland'}. Is the top card of their library ${kind === 0 ? 'a land' : 'a nonland card'}?`, true)
      : G.rng.next() < (kind === 0 ? landShare : 1 - landShare);
    const right = (kind === 0) === isLand(top);
    emit(G, 'reveal', `${P.name} reveals ${top.def.name}. ${Q.name} guessed ${guessYes === right ? 'right' : 'wrong'}.`, { who: P.i, cards: [top.id] });
    if (guessYes === right) {
      if (onBf(G, g)) { g.attacking = false; if (G.combat) G.combat.attackers = G.combat.attackers.filter((c) => c !== g); dirty(G); emit(G, 'info', `${g.def.name} is removed from combat.`, { who: P.i, cards: [g.id] }); }
    } else {
      drawN(G, P, 1);
      if (onBf(G, g)) { g.tf.unblockable = true; emit(G, 'info', `${g.def.name} can't be blocked this turn.`, { who: P.i, cards: [g.id] }); }
    }
  } }));
  return d;
};
S['Witch-king, Bringer of Ruin'] = (d) => {
  d.trig.push(T('attack', { self: true, run: (G, X) => {
    const Q = X.O;
    const cs = creaturesOf(Q);
    if (!cs.length) return;
    const least = Math.min(...cs.map(pow));
    const c = sacrificeChoice(G, Q, cs.filter((x) => pow(x) === least));
    if (!c) return;
    emit(G, 'sac', `${Q.name} sacrifices ${c.def.name}.`, { who: Q.i, cards: [c.id] });
    sacrifice(G, Q, c, true);
  } }));
  return d;
};
S['Fires of Mount Doom'] = (d) => {
  d.etb = [{ k: 'dmg', n: 2, to: 'creature', f: { side: 'opp' } }, fn((G, X) => {
    const c = lastC(X);
    if (!c || !onBf(G, c)) return;
    for (const e of equipmentOn(G, c)) destroyPermanent(G, X.P, e, `to ${X.src.def.name}`);
  }, { score: () => 0 })];
  d.acts.push({ cost: { m: C('{2}{R}') }, label: 'Exile the top card; you may play it this turn', run: (G, X) => {
    const P = X.P, c = P.library.pop();
    if (!c) return;
    P.exile.push(c);
    const src = X.src;
    P.xcast.push({ card: c, until: G.turn, onPlay: (GG) => GG.pending.unshift({ src, P, t: { label: `${src.def.name} deals 2 damage to each player`, eff: [fn((G2, X2) => {
      for (const Q of G2.players) dealDamage(G2, X2, { p: Q.i }, 2, {});
    }, { score: () => 0 })] }, ev: {} }) });
    dirty(G);
    emit(G, 'exile', `${P.name} exiles ${c.def.name} from the top of their library and may play it this turn.`, { who: P.i, cards: [c.id] });
  }, when: ['main1'], ai: (G, P) => (P.life > 8 && P.hand.length < 4 ? { score: 0.9 } : null) });
  d.role = 'removal';
  return d;
};
S['The Balrog, Flame of Udûn'] = (d) => {
  d.trig.push(T('die', { opp: true, cond: (G, src, ev) => !!ev.leg && ev.def && ev.def.types.includes('Creature'), run: (G, X) => {
    const c = X.src;
    if (!onBf(G, c)) return;
    const Q = ctrlOf(G, c);
    L.leaveBattlefield(G, c);
    L.resetCard(c);
    G.players[c.owner].library.unshift(c);
    dirty(G);
    emit(G, 'info', `${c.def.name} is put on the bottom of ${G.players[c.owner].name}'s library.`, { who: Q.i, cards: [c.id] });
  } }));
  return d;
};
S['Feed the Swarm'] = (d) => {
  d.spell = [{ k: 'destroyP', tgt: { f: { types: ['Creature', 'Enchantment'], side: 'opp' } } }, fn((G, X) => { const c = lastC(X); if (c) loseLife(G, X.P, c.def.mv || 0); }, { score: () => 0 })];
  d.role = 'removal';
  return d;
};
S['Evolving Wilds'] = (d) => {
  d.acts.push({ cost: { tap: true, sacSelf: true }, eff: [{ k: 'tutor', f: basic, to: 'bfTapped', why: 'a basic land' }], label: 'Search for a basic land', when: ['end', 'main1', 'main2'],
    ai: (G, P, c, when) => (P.library.some((x) => isLand(x) && x.def.supertypes.includes('Basic')) ? { score: when === 'end' || G.active !== P.i ? 1.5 : 1 } : null) });
  d.role = 'land';
  return d;
};

/* ============================================================
   FINAL FANTASY Starter Kit
   ============================================================ */
S['Sephiroth, Planet\'s Heir'] = (d) => {
  d.etb.push({ k: 'pumpAll', side: 'opp', p: -2, t: -2 });
  d.trig.push(T('die', { opp: true, cond: (G, src, ev) => ev.def && ev.def.types.includes('Creature'), run: (G, X) => { if (onBf(G, X.src)) addCounters(G, X.src, 1); } }));
  return d;
};
S['Ultimecia, Temporal Threat'] = (d) => {
  d.etb.push({ k: 'tapAll' });
  d.trig.push(T('hitPlayer', { you: true, cond: (G, src, ev) => isCreature(ev.c), run: (G, X) => drawN(G, X.P, 1) }));
  return d;
};
S['Seymour Flux'] = (d) => {
  d.trig.push(T('upkeep', { you: true, may: true, mayAi: (G, X) => X.P.life > 6, mayLabel: 'Pay 1 life to draw a card and put a +1/+1 counter on Seymour Flux?',
    run: (G, X) => { loseLife(G, X.P, 1); drawN(G, X.P, 1); if (onBf(G, X.src)) addCounters(G, X.src, 1); } }));
  return d;
};
S['Deadly Embrace'] = (d) => {
  d.spell = [{ k: 'destroy', f: { side: 'opp' } }, fn((G, X) => drawN(G, X.P, diedThisTurn(G)), { score: (G) => diedThisTurn(G) * 0.8 + 0.8, value: 1 })];
  d.role = 'removal';
  return d;
};
S['Xande, Dark Mage'] = (d) => {
  const n = (G, src) => G.players[src.ctrl].gy.filter((c) => !c.def.types.includes('Creature') && !isLand(c)).length;
  d.statics.push({ who: 'self', p: 0, t: 0, kw: [], pFn: n, tFn: n });
  return d;
};
S['Magitek Scythe'] = (d) => {
  d.etb = [fn((G, X, t) => {
    const c = t && t.c;
    if (!c || !onBf(G, c) || !onBf(G, X.src)) return;
    attach(G, X.src, c);
    c.tf.lure = true;
    grantKw(G, c, ['first strike'], 'gains first strike and must be blocked this turn if able');
  }, { tgt: tg({ side: 'you' }), val: (G, P, c) => (c.ctrl === P.i ? 1 + pow(c) * 0.1 : -5), label: 'Attach Magitek Scythe to a creature you control (it must be blocked this turn)', min: 0 })];
  return d;
};
S['Cloud, Planet\'s Champion'] = (d) => {
  d.statics.push({ who: 'self', cond: (G, src) => G.active === src.ctrl && isEquipped(G, src), p: 0, t: 0, kw: ['double strike', 'indestructible'] });
  d.equipCheaper = 2;
  return d;
};
S['Rosa, Resolute White Mage'] = (d) => {
  d.trig.push(combatStart({ eff: [{ k: 'ctrs', n: 1, tgt: tg({ side: 'you' }) }, fn((G, X) => { const c = lastC(X); if (c && onBf(G, c)) grantKw(G, c, ['lifelink']); }, { score: () => 0.4 })] }));
  return d;
};
S['Beatrix, Loyal General'] = (d) => {
  d.trig.push(combatStart({ run: (G, X) => {
    const P = X.P;
    const eqs = P.bf.filter((c) => c.def.acts.some((a) => a.equip));
    const cs = creaturesOf(P);
    if (!eqs.length || !cs.length) return;
    if (isHuman(G, P) && !yesNo(G, P, X.src, 'Attach any number of Equipment to a creature you control?', true)) return;
    const host = pickOne(G, P, cs, 'Attach Equipment to which creature?', (c) => (L.canAttackNow(G, c) ? 2 : 0) + pow(c) * 0.3 + (has(c, 'flying') ? 1 : 0) + (c.def.equipCheaper ? 2 : 0));
    if (!host) return;
    const moving = isHuman(G, P) ? pickSome(G, P, eqs.filter((e) => e.att !== host.id), 0, eqs.length, `Attach which Equipment to ${host.def.name}?`, () => 1) : eqs.filter((e) => e.att !== host.id);
    for (const e of moving) if (onBf(G, e) && onBf(G, host)) attach(G, e, host);
  } }));
  return d;
};
S['Lightning, Security Sergeant'] = (d) => {
  d.trig.push(T('hitPlayer', { self: true, run: (G, X) => {
    const P = X.P, c = P.library.pop();
    if (!c) return;
    P.exile.push(c);
    P.xcast.push({ card: c, until: 1e9, by: X.src.id });
    dirty(G);
    emit(G, 'exile', `${P.name} exiles ${c.def.name} and may play it for as long as they control ${X.src.def.name}.`, { who: P.i, cards: [c.id] });
  } }));
  d.trig.push(T('leave', { self: true, run: (G, X) => { const P = G.players[X.src.owner]; P.xcast = P.xcast.filter((x) => x.by !== X.src.id); for (const Q of G.players) Q.xcast = Q.xcast.filter((x) => x.by !== X.src.id); } }));
  return d;
};
S['Judgment Bolt'] = (d) => {
  d.spell = [{ k: 'dmg', n: 5, to: 'creature', f: {} }, fn((G, X) => {
    const c = lastC(X);
    if (!c) return;
    const n = X.P.bf.filter((x) => x.def.acts.some((a) => a.equip)).length;
    if (n > 0) dealDamage(G, X, { p: c.ctrl }, n, {});
  }, { score: (G, P) => P.bf.filter((x) => x.def.acts.some((a) => a.equip)).length * 0.4 })];
  d.role = 'removal';
  return d;
};
S['Ultima Weapon'] = (d) => {
  d.trig.push(T('attack', { hostOnly: true, eff: [{ k: 'destroy', f: { side: 'opp' } }] }));
  return d;
};

/* ============================================================
   Marvel Super Heroes Welcome Decks
   ============================================================ */
S['Hulk, Brutal Brawler'] = (d) => {
  d.mustAttack = true;
  d.trig.push(T('attack', { self: true, run: (G, X) => creaturesOf(X.P).filter((c) => c !== X.src).forEach((c) => addCounters(G, c, 1)) }));
  return d;
};
S['Goliath, Mass Manipulator'] = (d) => {
  d.acts.push({ cost: { m: C('{4}{G}') }, powerUp: true, label: 'Power-up', run: (G, X) => {
    if (onBf(G, X.src)) addCounters(G, X.src, 2);
    drawN(G, X.P, creaturesOf(X.P).filter((c) => pow(c) >= 4).length);
  }, when: ['main1', 'main2'], ai: (G, P, c) => ({ score: 2 + (c.inTurn === G.turn ? 0.8 : 0) }) });
  return d;
};
S['Kapow!'] = (d) => {
  d.spell = [{ k: 'fight', ctr: 1 }];
  d.role = 'removal';
  return d;
};
S['Thing Swing'] = (d) => {
  d.spell = [{ k: 'bite', mult: 2 }];
  d.costMod = (G, P, card, tgs) => (tgs.some((t) => t && t.c && t.c.ctrl === P.i && hasSub(t.c, 'Hero')) ? 2 : 0);
  d.role = 'removal';
  return d;
};
S['Black Widow, Daring Operative'] = (d) => {
  d.etb.push({ k: 'mill', who: 'self', n: 3 });
  d.trig.push(T('hitPlayer', { self: true, run: (G, X) => loseLife(G, X.O, X.P.gy.filter((c) => c.def.types.includes('Creature')).length, X.P.i) }));
  return d;
};
S['Songbird, Sonic Screamer'] = (d) => {
  d.acts.push({ cost: { discard: 1 }, label: 'Gain flying', run: (G, X) => grantKw(G, X.src, ['flying']), when: ['main1'],
    ai: (G, P, c) => (!has(c, 'flying') && L.canAttackNow(G, c) && P.hand.some((x) => isLand(x)) && P.bf.filter(isLand).length >= 5 && !other(G, P).bf.some((x) => isCreature(x) && (has(x, 'flying') || has(x, 'reach'))) ? { score: 1 } : null) });
  return d;
};
S['Tombstone, Career Criminal'] = (d) => {
  d.etb = [{ k: 'regrow', tgt: { what: 'gy', mine: true, min: 0, f: { types: ['any'], fn: (dd) => dd.sub.includes('Villain') } } }];
  d.spellDiscount = (G, P, card) => (card.def.sub.includes('Villain') ? 1 : 0);
  return d;
};
S["Ultimo, Civilization's End"] = (d) => {
  d.etb.push({ k: 'edict', f: {} });
  d.cycling = C('{2}{B}');
  d.cycleLabel = 'Discard: each opponent sacrifices a creature';
  d.cycleRun = (G, P) => {
    const Q = other(G, P), cs = creaturesOf(Q);
    if (!cs.length) return;
    const c = sacrificeChoice(G, Q, cs);
    emit(G, 'sac', `${Q.name} sacrifices ${c.def.name}.`, { who: Q.i, cards: [c.id] });
    sacrifice(G, Q, c, true);
  };
  d.cycleAi = (G, P) => creaturesOf(other(G, P)).length > 0 && (P.bf.filter(isLand).length < 5 || creaturesOf(other(G, P)).length === 1);
  return d;
};
S['Infernal Rebirth'] = (d) => {
  d.spell = [{ k: 'regrow', tgt: { what: 'gy', mine: true, n: 2, min: 1, f: { types: ['Creature'] } } }];
  return d;
};
S['Living Lightning, Charged Up'] = (d) => {
  d.trig.push(combatStart({ eff: [{ k: 'pumpT', tgt: tg({ side: 'you', other: true }), p: 1, t: 0, kw: ['haste'] }] }));
  return d;
};
S['Rampaging Classmate'] = (d) => {
  d.trig.push(T('attack', { self: true, run: (G, X) => { const n = G.combat ? G.combat.attackers.filter((c) => c !== X.src && c.attacking).length : 0; if (n) pump(G, X.src, n, 0); } }));
  return d;
};
S['Extremis Elite'] = (d) => {
  d.acts.push({ cost: { m: C('{4}{R}') }, powerUp: true, label: 'Power-up', run: (G, X) => {
    if (onBf(G, X.src)) addCounters(G, X.src, 2);
    G.pending.unshift({ src: X.src, P: X.P, t: { label: '1 damage to any target', eff: [{ k: 'dmg', n: 1, to: 'any', f: {} }] }, ev: {} });
  },
    when: ['main1', 'main2'], ai: (G, P, c) => ({ score: 2 + (c.inTurn === G.turn ? 0.8 : 0) }) });
  return d;
};
S["Sif's Spearmaster"] = (d) => {
  d.acts.push({ cost: { tap: true }, label: 'Deal damage equal to its power to an opponent', run: (G, X) => dealDamage(G, X, { p: X.O.i }, Math.max(0, pow(X.src)), {}),
    when: ['end', 'main2'], ai: (G, P, c, when) => (pow(c) > 0 && (when === 'end' || other(G, P).life <= pow(c)) ? { score: 1 + pow(c) * 0.4 } : null) });
  return d;
};
S['The Mary Janes'] = (d) => {
  d.costMod = (G, P) => (P.atkTurn === G.turn ? (P.atkLog || []).length : 0);
  return d;
};
S['Black Panther, Claws of Bast'] = (d) => {
  d.trig.push(T('attacks', { you: true, cond: (G, s, ev) => ev.cs.length === 1, run: (G, X) => { const c = X.ev.cs[0]; if (onBf(G, c)) addCounters(G, c, 1); } }));
  return d;
};
S['Peggy Carter, Secret Agent'] = (d) => {
  d.trig.push(T('attacks', { you: true, cond: (G, s, ev) => ev.cs.length === 1, run: (G, X) => grantKw(G, X.ev.cs[0], ['indestructible']) }));
  return d;
};
S['Mockingbird, Bobbi Morse'] = (d) => {
  d.trig.push(T('dmgCreature', { self: true, run: (G, X) => { if (onBf(G, X.src) && X.src.dmg < tou(X.src)) addCounters(G, X.src, 1); } }));
  return d;
};
S['Doctor Jane Foster'] = (d) => {
  d.etb = [fn((G, X, t) => {
    const card = t && t.c;
    if (!card || !X.P.gy.includes(card)) return;
    X.P.gy.splice(X.P.gy.indexOf(card), 1);
    if (X.P.gainedTurn) { L.enterBattlefield(G, X.P, card, null, {}); emit(G, 'raise', `${X.P.name} returns ${card.def.name} to the battlefield.`, { who: X.P.i, cards: [card.id] }); }
    else { X.P.hand.push(card); dirty(G); emit(G, 'raise', `${X.P.name} returns ${card.def.name} to their hand.`, { who: X.P.i, cards: [card.id] }); }
  }, { tgt: { what: 'gy', mine: true, min: 0, f: { types: ['Creature'], fn: (dd) => dd.mv <= 3 } }, val: (G, P, c) => 0.8 + c.def.value * 0.3, label: 'Return a creature card with mana value 3 or less' })];
  return d;
};
S['Selfless Police Captain'] = (d) => {
  d.etbCtr = () => ({ '+1/+1': 1 });
  d.trig.push(T('leave', { self: true, run: (G, X) => {
    const n = (X.ev.ctr && X.ev.ctr['+1/+1']) || X.ev.cnt || 0;
    if (n <= 0) return;
    G.pending.unshift({ src: X.src, P: X.P, t: { label: `Put ${n === 1 ? 'its +1/+1 counter' : `its ${n} +1/+1 counters`} on a creature you control`, eff: [{ k: 'ctrs', n, tgt: tg({ side: 'you' }) }] }, ev: {} });
  } }));
  return d;
};
S['Fall to Earth'] = (d) => {
  d.spell = [{ k: 'exile', f: {} }, fn((G, X) => G.players.forEach((Q) => gain(G, Q, 3)), { score: () => 0 })];
  d.role = 'removal';
  return d;
};
S['Iron Man, Modern Marvel'] = (d) => {
  d.statics.push({ who: 'all', f: { side: 'you', other: true, types: ['Artifact'] }, p: 1, t: 1, kw: [] });
  d.trig.push(T('attack', { self: true, cond: (G, src) => G.players[src.ctrl].bf.some((c) => c !== src && isCreature(c) && c.def.types.includes('Artifact')), run: (G, X) => drawN(G, X.P, 1) }));
  return d;
};
S['Lyla, Holographic Assistant'] = (d) => {
  d.trig.push(T('draw', { you: true, eff: [{ k: 'ctrs', n: 1, tgt: tg({}) }] }));
  return d;
};
S['Blue Marvel, Adam Brashear'] = (d) => {
  d.trig.push(T('draw', { you: true, cond: (G, s, ev) => ev.nth === 2, run: (G, X) => { if (onBf(G, X.src)) addCounters(G, X.src, 1); } }));
  return d;
};
S['TVA Bureaucrat'] = (d) => {
  d.trig.push(T('cast', { you: true, cond: (G, s, ev) => !ev.card.def.types.includes('Creature'), run: (G, X) => {
    if (!onBf(G, X.src)) return;
    X.src.tp += 1; X.src.tf.unblockable = true; dirty(G);
    emit(G, 'pump', `${X.src.def.name} gets +1/+0 and can't be blocked this turn.`, { who: X.P.i, cards: [X.src.id] });
  } }));
  return d;
};
S['Alchemax Slayer-Bots'] = (d) => {
  d.etb = [{ k: 'tapP', stun: true, tgt: tg({ side: 'opp' }) }];
  return d;
};
S['Whoosh!'] = (d) => {
  const back = { k: 'bounceP', tgt: { f: { types: ['nonland'] } } };
  d.modes = [{ label: 'Return a nonland permanent to its owner\'s hand', eff: [back] }, { label: 'Kicked: return it and draw a card', eff: [back, { k: 'draw', n: 1 }], addCost: { pay: C('{1}{U}') } }];
  d.spell = null;
  d.role = 'removal';
  return d;
};
S["Ant-Man's Air Force"] = (d) => {
  d.trig.push(T('attack', { self: true, eff: [{ k: 'pumpT', tgt: tg({ side: 'opp' }, { min: 0 }), p: -1, t: 0 }] }));
  return d;
};

/* ============================================================
   Core Set 2019: Welcome Decks and the Spellslinger Starter Kit
   ============================================================ */
S['Aven Wind Mage'] = (d) => { d.trig.push(T('cast', { you: true, cond: (G, s, ev) => isIS(ev.card.def), run: (G, X) => pump(G, X.src, 1, 1) })); return d; };
S['Frilled Sea Serpent'] = (d) => {
  d.acts.push({ cost: { m: C('{5}{U}{U}') }, label: "Can't be blocked this turn", run: (G, X) => { X.src.tf.unblockable = true; emit(G, 'info', `${X.src.def.name} can't be blocked this turn.`, { who: X.P.i, cards: [X.src.id] }); },
    when: ['main1'], ai: (G, P, c) => (L.canAttackNow(G, c) && !c.tf.unblockable && other(G, P).bf.some((x) => isCreature(x) && !x.tapped && tou(x) >= 1) ? { score: 1 + pow(c) * 0.2 } : null) });
  return d;
};
S.Waterknot = (d) => {
  d.statics.push({ who: 'enchanted', p: 0, t: 0, kw: [], flags: { noUntap: true } });
  d.etb.push(fn((G, X) => { const h = X.src.att != null ? L.byId(G, X.src.att) : null; if (h && onBf(G, h)) { h.tapped = true; emit(G, 'tapfx', `${h.def.name} is tapped.`, { who: X.P.i, cards: [h.id] }); } }, { score: () => 0 }));
  d.role = 'removal';
  return d;
};
S['Bristling Boar'] = (d) => { d.maxOne = true; return d; };
S['Ghastbark Twins'] = (d) => { d.blockTwo = true; return d; };
S['Ursine Champion'] = (d) => {
  d.acts.push({ cost: { m: C('{5}{G}') }, once: true, label: '+3/+3 and becomes a Bear Berserker', run: (G, X) => { X.src.tf.bear = true; pump(G, X.src, 3, 3); },
    when: ['main1', 'blocks'], ai: (G, P, c, when) => (when === 'blocks' ? ((c.attacking || c.blocking) ? { score: 1.5 } : null) : (L.canAttackNow(G, c) && P.hand.every((x) => isLand(x) || !canPay(P, x.def.cost)) ? { score: 0.8 } : null)) });
  d.subFn = (G, c) => (c.tf && c.tf.bear ? ['Bear', 'Berserker'] : null);
  return d;
};
S['Dwarven Priest'] = (d) => { d.etb = [fn((G, X) => gain(G, X.P, creaturesOf(X.P).length), { score: (G, P) => creaturesOf(P).length * 0.3 + 0.3, value: 1 })]; return d; };
S['Pegasus Courser'] = (d) => {
  d.trig.push(T('attack', { self: true, eff: [{ k: 'grant', kw: ['flying'], tgt: tg({ side: 'you', attacking: true, other: true }, { min: 0 }) }] }));
  return d;
};
S['Star-Crowned Stag'] = (d) => { d.trig.push(T('attack', { self: true, eff: [{ k: 'tap', f: { side: 'opp' } }] })); return d; };
S.Gravewaker = (d) => {
  d.acts.push({ cost: { m: C('{5}{B}{B}') }, label: 'Return a creature card to the battlefield tapped', eff: [{ k: 'regrow', to: 'bfTapped', tgt: { what: 'gy', mine: true, f: { types: ['Creature'] } } }], when: ['end', 'main2'] });
  return d;
};
S['Grasping Scoundrel'] = (d) => { d.statics.push({ who: 'self', cond: (G, src) => !!src.attacking, p: 1, t: 0, kw: [] }); return d; };
S["Sovereign's Bite"] = (d) => { d.spell = [{ k: 'lose', tgt: { what: 'player', f: {} }, n: 3 }, { k: 'gain', n: 3 }]; d.role = 'burn'; return d; };
S['Infernal Scarring'] = (d) => {
  d.statics.push({ who: 'enchanted', p: 2, t: 0, kw: [] });
  d.trig.push(T('die', { cond: (G, src, ev) => ev.c && src.att === ev.c.id, run: (G, X) => drawN(G, G.players[X.ev.ctrl], 1) }));
  return d;
};
S['Sparktongue Dragon'] = (d) => {
  d.etb = [fn((G, X) => {
    const P = X.P, cost = C('{2}{R}');
    if (!canPay(P, cost)) return;
    const prey = other(G, P).bf.filter((c) => isCreature(c) && L.lethalTo(c) <= 3);
    const aiYes = prey.length > 0 || other(G, P).life <= 3;
    if (!yesNo(G, P, X.src, 'Pay {2}{R} to deal 3 damage to any target?', aiYes) || !pay(P, cost)) return;
    G.pending.unshift({ src: X.src, P, t: { label: '3 damage to any target', eff: [{ k: 'dmg', n: 3, to: 'any', f: {} }] }, ev: {} });
  }, { score: () => 1 })];
  return d;
};
S['Kargan Dragonrider'] = (d) => { d.statics.push({ who: 'self', cond: (G, src, P) => P.bf.some((c) => hasSub(c, 'Dragon')), p: 0, t: 0, kw: ['flying'] }); return d; };
S['Trumpet Blast'] = (d) => {
  d.spell = [{ k: 'pumpTeam', p: 2, t: 0, kw: [], attacking: true }];
  return d;
};
S['Radiating Lightning'] = (d) => {
  d.spell = [fn((G, X, t) => {
    const Q = G.players[t.p];
    dealDamage(G, X, { p: Q.i }, 3, {});
    const cs = creaturesOf(Q);
    cs.forEach((c) => damageCreature(G, c, 1, X.src));
    if (cs.length) emit(G, 'hit', `${X.src.def.name} deals 1 damage to each creature ${Q.name} controls.`, { who: X.P.i, cards: cs.map((c) => c.id) });
  }, { tgt: { what: 'player', f: {} }, val: (G, P, x) => (x.p === P.i ? -5 : 1.5 + creaturesOf(G.players[x.p]).filter((c) => L.lethalTo(c) <= 1).reduce((s, c) => s + cv(c), 0) + (G.players[x.p].life <= 3 ? 100 : 0)), label: 'Choose a player' })];
  d.role = 'burn';
  return d;
};
S["Burning Sun's Avatar"] = (d) => {
  d.etb = [{ k: 'dmg', n: 3, to: 'player' }, { k: 'dmgX', nFn: () => 3, tgt: { f: { types: ['Creature'] }, min: 0 } }];
  return d;
};
S['Demanding Dragon'] = (d) => {
  d.etb = [fn((G, X) => {
    const Q = X.O;
    const cs = creaturesOf(Q);
    let sac = null;
    if (cs.length) {
      if (isHuman(G, Q)) { if (yesNo(G, Q, X.src, 'Sacrifice a creature? If you don\'t, Demanding Dragon deals 5 damage to you.', true)) sac = sacrificeChoice(G, Q, cs); }
      else { const w = cs.reduce((a, b) => (cv(a) <= cv(b) ? a : b)); if (Q.life <= 5 || cv(w) < 5 * lifeW(Q) * 2.5) sac = w; }
    }
    if (sac) { emit(G, 'sac', `${Q.name} sacrifices ${sac.def.name}.`, { who: Q.i, cards: [sac.id] }); sacrifice(G, Q, sac, true); }
    else dealDamage(G, X, { p: Q.i }, 5, {});
  }, { score: () => 2.5, value: 2.5 })];
  return d;
};
S['Citywide Bust'] = (d) => {
  d.spell = [fn((G, X) => {
    const hit = allCreatures(G).filter((c) => tou(c) >= 4 && !has(c, 'indestructible'));
    hit.forEach((c) => destroyPermanent(G, X.P, c, `to ${X.src.def.name}`));
    if (!hit.length) say(G, X.P, 'No creature has toughness 4 or greater.');
  }, { score: (G, P) => allCreatures(G).filter((c) => tou(c) >= 4 && !has(c, 'indestructible')).reduce((s, c) => s + (c.ctrl === P.i ? -cv(c) : cv(c)), 0) - 1.5, value: 2.4 })];
  d.role = 'sweeper';
  return d;
};
S['Dual Shot'] = (d) => {
  d.spell = [{ k: 'dmgX', nFn: () => 1, tgt: { f: { types: ['Creature'] }, n: 2, min: 1 } }];
  d.role = 'removal';
  return d;
};
S['Ghalta, Primal Hunger'] = (d) => { d.costMod = (G, P) => creaturesOf(P).reduce((s, c) => s + Math.max(0, pow(c)), 0); return d; };
S['Jungle Creeper'] = (d) => {
  d.gyActs = [{ cost: { m: C('{3}{B}{G}') }, label: 'Return Jungle Creeper to your hand', run: (G, X) => {
    const P = X.P, c = X.src;
    if (!P.gy.includes(c)) return;
    P.gy.splice(P.gy.indexOf(c), 1); P.hand.push(c); dirty(G);
    emit(G, 'raise', `${P.name} returns ${c.def.name} to their hand.`, { who: P.i, cards: [c.id] });
  }, when: ['end', 'main2'], ai: (G, P) => (P.hand.length < 3 ? { score: 1 } : null) }];
  return d;
};
S["Verdant Sun's Avatar"] = (d) => {
  d.trig.push(T('enter', { you: true, cond: (G, src, ev) => isCreature(ev.c), run: (G, X) => gain(G, X.P, Math.max(0, tou(X.ev.c))) }));
  return d;
};
S['Declare Dominance'] = (d) => {
  d.spell = [{ k: 'pump', f: { side: 'you' }, p: 3, t: 3, kw: [] }, fn((G, X) => { const c = lastC(X); if (c && onBf(G, c)) { c.tf.lureAll = true; emit(G, 'info', `All creatures able to block ${c.def.name} this turn do so.`, { who: X.P.i, cards: [c.id] }); } }, { score: () => 0.5 })];
  d.castIf = (G) => G.phase === 'main1';
  return d;
};

/* ============================================================
   The older core sets: starter, advanced and theme decks
   ============================================================ */
S.Armageddon = (d) => {
  const edge = (G, P) => { const O = other(G, P); const mine = creaturesOf(P).reduce((s, c) => s + cv(c), 0), theirs = creaturesOf(O).reduce((s, c) => s + cv(c), 0); return mine - theirs; };
  d.spell = [fn((G, X) => {
    const lands = allPerms(G).filter(isLand);
    lands.forEach((c) => destroyPermanent(G, X.P, c, `to ${X.src.def.name}`));
  }, { score: (G, P) => { const e = edge(G, P); return creaturesOf(P).length >= 2 && e > 4 ? e * 0.6 - 2 : -5; }, value: 1.5 })];
  d.role = 'value';
  return d;
};
S['Blanchwood Armor'] = (d) => {
  const n = (G, src) => nSub(G.players[src.ctrl], 'Forest');
  d.statics.push({ who: 'enchanted', p: 0, t: 0, kw: [], pFn: n, tFn: n });
  d.auraVal = (G, P, c) => { const f = nSub(P, 'Forest'); return c.ctrl === P.i ? f * 1.5 * (has(c, 'flying') || has(c, 'trample') ? 1.2 : 1) + 0.3 : -5; };
  d.value = 2.6;
  return d;
};
S.Blaze = (d) => {
  d.spell = [{ k: 'dmgX', nFn: (G, X) => X.x || 0, tgt: { what: 'any', f: { types: ['Creature'] } } }];
  d.minX = 1;
  d.aiX = (G, P, card, max) => { if (other(G, P).life <= max) return max; const prey = creaturesOf(other(G, P)).sort((a, b) => cv(b) - cv(a)); for (const c of prey) if (L.lethalTo(c) <= max) return Math.max(1, L.lethalTo(c)); return max; };
  d.role = 'burn';
  d.value = 3.2;
  return d;
};
S['Breath of Life'] = (d) => {
  d.spell = [{ k: 'regrow', to: 'bf', tgt: { what: 'gy', mine: true, f: { types: ['Creature'] } } }];
  d.castIf = (G, P) => P.gy.some((c) => c.def.types.includes('Creature'));
  return d;
};
S.Coercion = (d) => {
  d.spell = [fn((G, X) => {
    const O = X.O, cs = O.hand.slice();
    emit(G, 'reveal', `${O.name} reveals their hand${cs.length ? `: ${nameList(cs)}` : ' (empty)'}.`, { who: O.i, cards: cs.map((c) => c.id) });
    if (!cs.length) return;
    const pick = isHuman(G, X.P) ? pickCards(G, { type: 'choose', reason: 'take', n: 1, min: 1, max: 1, zone: 'hand', cards: cs.map((c) => c.id), label: 'Choose a card they discard' }, cs, 1)[0]
      : cs.slice().sort((a, b) => b.def.value + (isLand(b) ? -2 : 0) - (a.def.value + (isLand(a) ? -2 : 0)))[0];
    O.hand.splice(O.hand.indexOf(pick), 1); O.gy.push(pick); dirty(G);
    emit(G, 'discard', `${O.name} discards ${pick.def.name}.`, { who: X.P.i, cards: [pick.id] });
  }, { score: (G, P) => (other(G, P).hand.length ? 1.2 + Math.min(2, other(G, P).hand.length * 0.2) : -1), value: 1.5 })];
  return d;
};
S['Command of Unsummoning'] = (d) => {
  d.spell = [{ k: 'bounceP', tgt: { f: { attacking: true }, n: 2, min: 1 } }];
  d.castIf = (G, P) => !!G.combat && G.active !== P.i && !G.combat.blocksDone && G.combat.attackers.some((c) => c.attacking);
  d.role = 'removal';
  return d;
};
S['Defiant Stand'] = (d) => {
  d.spell = [{ k: 'pump', f: {}, p: 1, t: 3, kw: [] }, { k: 'untapRef' }];
  d.castIf = (G, P) => !!G.combat && G.active !== P.i && !G.combat.blocksDone && G.combat.attackers.some((c) => c.attacking);
  return d;
};
S['Eye Spy'] = (d) => {
  d.spell = [fn((G, X, t) => {
    const Q = G.players[t.p], top = Q.library[Q.library.length - 1];
    if (!top) return;
    const want = Q === X.P ? (isLand(top) ? X.P.bf.filter(isLand).length >= 5 : top.def.value < 1.5) : (!isLand(top) && top.def.value >= 2);
    emit(G, 'reveal', `${X.P.name} looks at the top card of ${Q === X.P ? 'their' : `${Q.name}'s`} library.`, { who: X.P.i });
    if (yesNo(G, X.P, X.src, `The top card is ${top.def.name}. Put it into the graveyard?`, want)) mill(G, Q, 1);
  }, { tgt: { what: 'player', f: {} }, val: (G, P, x) => (x.p === P.i ? 0.2 : 0.4), label: 'Choose a player' })];
  return d;
};
S.Exhaustion = (d) => {
  d.spell = [fn((G, X, t) => {
    const Q = G.players[t.p];
    Q.noUntapNext = true;
    emit(G, 'info', `${Q.name}'s creatures and lands don't untap during their next untap step.`, { who: X.P.i });
  }, { tgt: { what: 'player', f: {} }, val: (G, P, x) => { if (x.p === P.i) return -5; const Q = G.players[x.p]; return Q.bf.filter((c) => c.tapped && (isCreature(c) || isLand(c))).reduce((s, c) => s + (isCreature(c) ? cv(c) * 0.4 : 0.5), 0); }, label: 'Choose an opponent' })];
  return d;
};
S.Extinguish = (d) => { d.spell = [{ k: 'counter', what: 'sorcery spell' }]; d.role = 'counter'; return d; };
S['False Peace'] = (d) => {
  d.spell = [fn((G, X, t) => {
    const Q = G.players[t.p];
    Q.skipCombat = true;
    emit(G, 'info', `${Q.name} skips all combat phases of their next turn.`, { who: X.P.i });
  }, { tgt: { what: 'player', f: {} }, val: (G, P, x) => { if (x.p === P.i) return -5; const Q = G.players[x.p]; const atk = creaturesOf(Q).reduce((s, c) => s + Math.max(0, pow(c)), 0); return atk >= P.life * 0.5 ? 2 + atk * 0.2 : 0.2; }, label: 'Choose a player' })];
  return d;
};
S['Goblin General'] = (d) => {
  d.trig.push(T('attack', { self: true, run: (G, X) => { const cs = creaturesOf(X.P).filter((c) => hasSub(c, 'Goblin')); cs.forEach((c) => { c.tp += 1; c.tt += 1; }); dirty(G); emit(G, 'pump', `${X.P.name}'s Goblins get +1/+1 until end of turn.`, { who: X.P.i, cards: cs.map((c) => c.id) }); } }));
  return d;
};
S.Index = (d) => { d.spell = [fn((G, X) => reorderTop(G, X.P, X.P, 5), { score: () => 0.5, value: 0.5 })]; return d; };
S['Ingenious Thief'] = (d) => {
  d.etb = [fn((G, X, t) => {
    const Q = G.players[t.p];
    emit(G, 'reveal', `${X.P.name} looks at ${Q === X.P ? 'their own' : `${Q.name}'s`} hand${Q.hand.length ? `: ${nameList(Q.hand)}` : ' (empty)'}.`, { who: X.P.i, cards: Q.hand.map((c) => c.id), private: X.P.i });
  }, { tgt: { what: 'player', f: {} }, val: (G, P, x) => (x.p === P.i ? 0 : 0.1), label: 'Look at a player\'s hand' })];
  return d;
};
S['Jagged Lightning'] = (d) => { d.spell = [{ k: 'dmgX', nFn: () => 3, tgt: { f: { types: ['Creature'] }, n: 2, min: 2 } }]; d.role = 'removal'; return d; };
const unblockedDmg = (d) => { d.asUnblocked = true; return d; };
S['Lone Wolf'] = unblockedDmg;
S['Pride of Lions'] = unblockedDmg;
S['Thorn Elemental'] = unblockedDmg;
S["Nature's Lore"] = (d) => { d.spell = [{ k: 'tutor', f: { types: ['Forest'] }, to: 'bf', why: 'a Forest card' }]; d.role = 'ramp'; return d; };
S['Patagia Golem'] = (d) => {
  d.acts.push({ cost: { m: C('{3}') }, label: 'Gain flying', run: (G, X) => grantKw(G, X.src, ['flying']), when: ['main1'],
    ai: (G, P, c, when) => (when === 'main1' && !has(c, 'flying') && L.canAttackNow(G, c) && !other(G, P).bf.some((x) => isCreature(x) && !x.tapped && (has(x, 'flying') || has(x, 'reach'))) ? { score: 0.9 } : null) });
  return d;
};
S['Path of Peace'] = (d) => {
  d.spell = [{ k: 'destroy', f: {} }, fn((G, X) => { const c = lastC(X); if (c) gain(G, G.players[c.owner], 4); }, { score: () => -0.5 })];
  d.role = 'removal';
  return d;
};
S['Rampant Growth'] = (d) => { d.spell = [{ k: 'tutor', f: basic, to: 'bfTapped', why: 'a basic land' }]; d.role = 'ramp'; return d; };
S['Untamed Wilds'] = (d) => { d.spell = [{ k: 'tutor', f: basic, to: 'bf', why: 'a basic land' }]; d.role = 'ramp'; return d; };
S.Ransack = (d) => {
  d.spell = [fn((G, X, t) => {
    const P = X.P, Q = G.players[t.p];
    const top = Q.library.slice(-5).reverse();
    if (!top.length) return;
    const want = topWant(G, Q);
    const down = isHuman(G, P) ? pickCards(G, { type: 'choose', reason: 'look', n: top.length, min: 0, max: top.length, zone: 'library', cards: top.map((c) => c.id), label: 'Put any number of these on the bottom' }, top, null)
      : top.filter((c) => (Q === P ? want(c) < 2 : want(c) >= 3));
    const keep = top.filter((c) => !down.includes(c)).sort((a, b) => (Q === P ? want(b) - want(a) : want(a) - want(b)));
    Q.library.splice(Q.library.length - top.length, top.length);
    Q.library.unshift(...down);
    Q.library.push(...keep.slice().reverse());
    dirty(G);
    emit(G, 'search', `${P.name} looks at the top ${top.length} cards of ${Q === P ? 'their' : `${Q.name}'s`} library and puts ${down.length} on the bottom.`, { who: P.i });
  }, { tgt: { what: 'player', f: {} }, val: (G, P, x) => (x.p === P.i ? 0.3 : 0.5), label: 'Choose a player' })];
  return d;
};
S['Relentless Assault'] = (d) => {
  d.spell = [fn((G, X) => {
    const P = X.P;
    const was = P.atkTurn === G.turn ? (P.atkLog || []).filter((c) => onBf(G, c) && c.ctrl === P.i) : [];
    was.forEach((c) => { c.tapped = false; });
    G.extraMain = true;
    dirty(G);
    emit(G, 'info', `${was.length ? `${nameList(was)} untap. ` : ''}There is an additional combat phase and main phase after this one.`, { who: P.i, cards: was.map((c) => c.id) });
  }, { score: (G, P, X, ctx) => { const was = P.atkTurn === G.turn ? (P.atkLog || []).filter((c) => onBf(G, c) && c.ctrl === P.i) : []; return ctx === 'main2' && was.length ? was.reduce((s, c) => s + Math.max(0, pow(c)), 0) * 0.5 : -1; }, value: 2 })];
  return d;
};
S['Renewing Touch'] = (d) => {
  d.spell = [fn((G, X) => {
    const P = X.P, cs = P.gy.filter((c) => c.def.types.includes('Creature'));
    const back = pickSome(G, P, cs, 0, cs.length, 'Shuffle any number of creature cards into your library', (c) => c.def.value);
    back.forEach((c) => { P.gy.splice(P.gy.indexOf(c), 1); P.library.push(c); });
    G.rng.shuffle(P.library);
    dirty(G);
    emit(G, 'info', `${P.name} shuffles ${back.length ? nameList(back) : 'nothing'} into their library.`, { who: P.i });
  }, { score: (G, P) => (P.gy.filter((c) => c.def.types.includes('Creature')).length >= 3 && P.library.length < 15 ? 1 : 0.2), value: 0.4 })];
  return d;
};
S.Sanctimony = (d) => {
  d.watchMana = true;
  d.trig.push(T('manaTap', { opp: true, cond: (G, src, ev) => hasSub(ev.c, 'Mountain'), may: true, mayAi: () => true, mayLabel: 'Gain 1 life?', run: (G, X) => gain(G, X.P, 1) }));
  d.value = 0.8;
  return d;
};
S['Serpent Warrior'] = (d) => { d.etb = [{ k: 'lose', who: 'self', n: 3 }]; return d; };
S['Sleight of Hand'] = (d) => {
  d.spell = [fn((G, X) => {
    const P = X.P, top = P.library.splice(Math.max(0, P.library.length - 2)).reverse();
    if (!top.length) return;
    const take = pickOne(G, P, top, 'Put one into your hand (the other goes to the bottom)', (c) => topWant(G, P)(c), 'library');
    P.hand.push(take);
    P.library.unshift(...top.filter((c) => c !== take));
    dirty(G);
    emit(G, 'search', `${P.name} looks at the top ${top.length} cards and takes one.`, { who: P.i });
  }, { score: () => 0.9, value: 0.9 })];
  return d;
};
S['Soul Feast'] = (d) => { d.spell = [{ k: 'lose', tgt: { what: 'player', f: {} }, n: 4 }, { k: 'gain', n: 4 }]; d.role = 'burn'; return d; };
S['Spitting Earth'] = (d) => { d.spell = [{ k: 'dmgX', nFn: (G, X) => nSub(X.P, 'Mountain'), tgt: { f: { types: ['Creature'] } } }]; d.role = 'removal'; return d; };
S['Stone Rain'] = (d) => { d.spell = [{ k: 'destroyP', tgt: { f: { types: ['Land'] } } }]; return d; };
S.Telepathy = (d) => { d.telepathy = true; d.value = 0.3; return d; };
S['Time Ebb'] = (d) => { d.spell = [{ k: 'tuckN', pos: 1, tgt: tg({}) }]; d.role = 'removal'; return d; };
S['Time Warp'] = (d) => {
  d.spell = [fn((G, X) => { G.extraTurns.push(X.P.i); emit(G, 'info', `${X.P.name} will take an extra turn after this one.`, { who: X.P.i }); }, { score: () => 3, value: 3.5 })];
  return d;
};
S.Undo = (d) => { d.spell = [{ k: 'bounceP', tgt: { f: {}, n: 2, min: 2 } }]; d.role = 'removal'; return d; };
S.Whirlwind = (d) => {
  d.spell = [fn((G, X) => {
    const hit = allCreatures(G).filter((c) => has(c, 'flying') && !has(c, 'indestructible'));
    hit.forEach((c) => destroyPermanent(G, X.P, c, `to ${X.src.def.name}`));
    if (!hit.length) say(G, X.P, 'No creature has flying.');
  }, { score: (G, P) => allCreatures(G).filter((c) => has(c, 'flying') && !has(c, 'indestructible')).reduce((s, c) => s + (c.ctrl === P.i ? -cv(c) : cv(c)), 0) - 1.5, value: 2 })];
  d.role = 'sweeper';
  return d;
};

return S;
});
