/* Core sets and other preconstructed products (Core Set 2019 starters and Planeswalker decks, the 7th Edition to Magic 2012
   theme, intro and event decks, the 2023 Arena starters): rules for the cards the engine's reader can't handle on its own.
   Same shape as msh.js and built from its shared helpers, so this file loads after msh.js. */
(function (root, factory) {
  const A = typeof module === 'object' && module.exports ? require('./engine.js') : root.Arena;
  if (typeof module === 'object' && module.exports) require('./msh.js');
  const S = factory(A);
  A.registerScripts(S);
  if (typeof module === 'object' && module.exports) module.exports = S;
})(typeof self !== 'undefined' ? self : this, function (A) {
'use strict';
const L = A.lib;
const { isCreature, isArtifact, isLand, isEnchantment, isLegendary, pow, tou, has, hasSub, equipmentOn, attach, dirty, onBf, byId, cv, pv, other, allCreatures, allPerms,
  addCounters, removeCounters, ctrCount, chooseMode, isHuman, yesNo, bounceCard, destroyPermanent, exilePermanent, putOntoBattlefield, enterBattlefield, enteredThisTurn,
  attackedThisTurn, scryChoice, targetList, allTargets, ctrlOf, emit, connive, mill, searchLibrary, handValue, nameList, gainControl, sacrifice, makeTokens, discardChoice,
  drawCards, gainLife, damageCreature, dealDamage, canPay, pay, lethalTo, pickCards, isIS, castNow, exileUntil, surveil } = L;
const { C, T, fn, tg, YOU, OPP, alone, attachE, chooseOne, ctrEach, ctx0, discardE, drain, drawN, edictOf, gain, grantKw, hit, hitOpp, impulse, lookTake, loseLife,
  mk, mkE, permCard, pickOne, pickSome, pump, puAi, say, tcs, tokSpec, tokVal, untilMyNextEnd, holdUntilLeaves, toLibrary, castNC, copyToken } = L.mshKit;
const S = {};

/* ---------- Shared pieces ---------- */
const tok = (name, p, t, colors, sub, kw = [], extra = {}) => Object.assign({ id: `core-${name.toLowerCase().replace(/[^a-z]+/g, '-')}-${p}-${t}-${kw.join('-').replace(/ /g, '')}`, name, p, t, colors, sub, kw }, extra);
const SAPROLING = tok('Saproling', 1, 1, ['G'], ['Saproling']);
const ZOMBIE = tok('Zombie', 2, 2, ['B'], ['Zombie']);
const GOBLIN = tok('Goblin', 1, 1, ['R'], ['Goblin']);
const SOLDIER = tok('Soldier', 1, 1, ['W'], ['Soldier']);
const SPIRIT = tok('Spirit', 1, 1, ['W'], ['Spirit'], ['flying']);
const THOPTER = tok('Thopter', 1, 1, [], ['Thopter'], ['flying'], { artifact: true });
const controls = (P, pred) => P.bf.some(pred);
const hasArt = (P) => controls(P, isArtifact);
const hasPW = (P, sub) => controls(P, (c) => !!c.def.loyalty && hasSub(c, sub));
const historic = (d) => d.supertypes.includes('Legendary') || d.types.includes('Artifact') || d.sub.includes('Saga');
const colorOf = (col) => (c) => c.def.colors.includes(col);
const raid = (G, P) => attackedThisTurn(G, P).length > 0;
const cards = (zone, type) => zone.filter((c) => c.def.types.includes(type));
// "As an additional cost to cast this spell, sacrifice a creature"
const sacCost = (d, types = ['Creature'], word) => { d.addCost = { sac: { types }, sacWord: word || (types.length > 1 ? `an ${types.join(' or ').toLowerCase()}` : 'a creature') }; return d; };
// Kicker: the spell as normal, or with the kicker paid on top
function kicker(d, cost, base, kicked) {
  d.modes = [Object.assign({ label: base.label }, base), Object.assign({}, kicked, { label: `${kicked.label} (kicked)`, cost: typeof cost === 'string' ? C(cost) : undefined, addCost: typeof cost === 'string' ? undefined : cost })];
  d.spell = null;
  return d;
}
// "Look at the top N cards. You may reveal a ___ card from among them and put it into your hand. Put the rest on the bottom in a random order."
const lookFor = (n, pred, why) => fn((G, X) => lookTake(G, X.P, n, pred, 1, why), { score: () => 1, value: 1.2 });
// Gain control of a creature until end of turn, untap it, haste (Act of Treason)
function borrow(G, X, c) {
  if (!c || !onBf(G, c)) return;
  gainControl(G, X.P, c, 'eot', X.src);
  c.tapped = false;
  if (!c.tkw.includes('haste')) c.tkw.push('haste');
  dirty(G);
  emit(G, 'control', `${X.P.name} gains control of ${c.def.name} until end of turn; it untaps and gains haste.`, { who: X.P.i, cards: [c.id] });
}
const borrowVal = (G, P, c) => (c.ctrl === P.i ? -1 : cv(c) + Math.max(0, pow(c)) * 0.4);
// Explore: reveal the top card; a land goes to hand, otherwise a +1/+1 counter and the card may go to the graveyard
function explore(G, P, c) {
  const top = P.library[P.library.length - 1];
  if (!top) { if (onBf(G, c)) addCounters(G, c, 1); return; }
  if (top.def.types.includes('Land')) { P.library.pop(); P.hand.push(top); dirty(G); emit(G, 'draw', `${c.def.name} explores: ${P.name} reveals ${top.def.name} and puts it into their hand.`, { who: P.i, cards: [top.id] }); }
  else {
    if (onBf(G, c)) addCounters(G, c, 1, '+1/+1', true);
    const toGy = isHuman(G, P) ? yesNo(G, P, c, `${c.def.name} explores: put ${top.def.name} into your graveyard? (Otherwise it stays on top.)`, false) : top.def.value < 2 || (top.def.mv > P.bf.filter(isLand).length + 2);
    if (toGy) { P.library.pop(); P.gy.push(top); dirty(G); }
    emit(G, 'info', `${c.def.name} explores: ${P.name} reveals ${top.def.name}${toGy ? ' and puts it into their graveyard' : ''}; ${c.def.name} gets a +1/+1 counter.`, { who: P.i, cards: [c.id, top.id] });
  }
  if (G.pending) L.fire(G, 'explore', { c, P });
}
// Enrage — "Whenever this creature is dealt damage"
const enrage = (o) => T('dmgCreature', Object.assign({ self: true, cond: (G, src, ev) => ev.n > 0 }, o));
// Planeswalker AI: plus abilities are steady value; minus abilities when they're worth the loyalty
const pwAi = (score) => (G, P, c, when) => { if (when !== 'main1' && when !== 'main2') return null; const s = typeof score === 'function' ? score(G, P, c) : score; return s > 0 ? { score: s } : null; };
// Pick a color for a permanent as it enters (the color the rest of the deck asks for most)
function chooseColor(G, P, src, label) {
  const want = {};
  for (const c of P.hand.concat(P.library, P.bf, P.gy)) for (const col of L.ANY) want[col] = (want[col] || 0) + (c.def.cost[col] || 0);
  const best = L.ANY.slice().sort((a, b) => want[b] - want[a])[0];
  const names = ['White', 'Blue', 'Black', 'Red', 'Green'];
  const k = chooseMode(G, P, src, label || `${src.def.name}: choose a color`, names, L.ANY.indexOf(best));
  src.mem.color = L.ANY[k];
  say(G, P, `${src.def.name}: ${names[k].toLowerCase()} is chosen.`, [src.id]);
}
// Attacking tokens: created tapped and attacking
function attackers(G, P, spec, n) {
  const made = mk(G, P, spec, n, { tapped: true });
  if (G.combat) for (const t of made) { t.attacking = true; G.combat.attackers.push(t); }
  return made;
}
// A temporary "When this creature dies, ..." until end of turn
function dieGrant(G, c, run, label) {
  if (!onBf(G, c)) return;
  const turn = G.turn;
  c.xtrig = (c.xtrig || []).concat(T('die', { self: true, cond: (G2) => G2.turn === turn, run }));
  dirty(G);
  if (label) emit(G, 'pump', `${c.def.name} gains "${label}" until end of turn.`, { who: c.ctrl, cards: [c.id] });
}

/* ============================================================ Planeswalkers */
S['Ajani, Wise Counselor'] = (d) => {
  d.loyalty = 5;
  d.pw = [
    { n: 2, label: 'Gain 1 life for each creature you control', run: (G, X) => gain(G, X.P, X.P.bf.filter(isCreature).length), ai: pwAi(1.5) },
    { n: -3, label: 'Creatures you control get +2/+2 until end of turn', eff: [{ k: 'pumpAll', side: 'you', p: 2, t: 2, kw: [] }],
      ai: pwAi((G, P, c) => (G.phase === 'main1' && P.bf.filter((x) => isCreature(x) && !x.tapped && (!x.sick || has(x, 'haste'))).length >= 3 ? (ctrCount(c, 'loyalty') > 3 ? 3 : 0.7) : 0)) },
    { n: -9, label: 'Put X +1/+1 counters on a creature, where X is your life total', eff: [fn((G, X, t) => { if (t && t.c) addCounters(G, t.c, Math.max(0, X.P.life)); }, { tgt: tg(YOU), val: (G, P, c) => cv(c) })], ai: pwAi(9) },
  ];
  return d;
};
S['Liliana, the Necromancer'] = (d) => {
  d.loyalty = 4;
  d.pw = [
    { n: 1, label: 'A player loses 2 life', eff: [{ k: 'lose', n: 2, tgt: { what: 'player' } }], ai: (G, P, c, when) => (when === 'main1' || when === 'main2' ? { score: 1.6, targets: [{ p: other(G, P).i }] } : null) },
    { n: -1, label: 'Return a creature card from your graveyard to your hand', eff: [{ k: 'regrow', tgt: { what: 'gy', mine: true, f: { types: ['Creature'] } } }],
      ai: pwAi((G, P, c) => { const b = cards(P.gy, 'Creature').sort((a, x) => x.def.value - a.def.value)[0]; return b && b.def.value >= 3 && ctrCount(c, 'loyalty') >= 3 ? 1.2 + b.def.value * 0.2 : 0; }) },
    { n: -7, label: 'Destroy up to two creatures, then take up to two creature cards from graveyards', run: (G, X) => {
      const P = X.P, foes = other(G, P).bf.filter(isCreature).sort((a, b) => cv(b) - cv(a)).slice(0, 2);
      for (const c of foes) destroyPermanent(G, P, c, `to ${X.src.def.name}`);
      const pool = G.players.flatMap((Q) => cards(Q.gy, 'Creature')).sort((a, b) => b.def.value - a.def.value).slice(0, 2);
      for (const c of pool) { emit(G, 'raise', `${c.def.name} returns under ${P.name}'s control.`, { who: P.i, cards: [c.id] }); putOntoBattlefield(G, P, c, {}); }
    }, ai: pwAi(9) },
  ];
  return d;
};
S['Sarkhan, Dragonsoul'] = (d) => {
  d.loyalty = 5;
  d.pw = [
    { n: 2, label: '1 damage to each opponent and each creature they control', run: (G, X) => { hitOpp(G, X, 1); for (const c of X.O.bf.filter(isCreature)) hit(G, X, c, 1); }, ai: pwAi(1.8) },
    { n: -3, label: '4 damage to a player', eff: [{ k: 'dmgX', nFn: () => 4, tgt: { what: 'player' } }], ai: (G, P, c, when) => ((when === 'main1' || when === 'main2') && (other(G, P).life <= 4 || ctrCount(c, 'loyalty') >= 6) ? { score: other(G, P).life <= 4 ? 100 : 1.5, targets: [{ p: other(G, P).i }] } : null) },
    { n: -9, label: 'Put any number of Dragon creature cards from your library onto the battlefield', run: (G, X) => {
      const got = searchLibrary(G, X.P, (c) => c.def.types.includes('Creature') && c.def.sub.includes('Dragon'), 99, 'bf', 'Dragon creature cards');
      emit(G, 'search', `${X.P.name} puts ${got.length ? nameList(got) : 'nothing'} onto the battlefield.`, { who: X.P.i, cards: got.map((c) => c.id) });
    }, ai: pwAi(9) },
  ];
  return d;
};
S['Tezzeret, Cruel Machinist'] = (d) => {
  d.loyalty = 4;
  d.pw = [
    { n: 1, label: 'Draw a card', eff: [{ k: 'draw', n: 1 }], ai: pwAi(1.6) },
    { n: 0, label: 'An artifact you control becomes a 5/5 creature until your next turn', eff: [fn((G, X, t) => {
      const c = t && t.c; if (!c || !onBf(G, c)) return;
      c.mem.anim = { until: G.turn + (G.active === X.P.i ? 2 : 1), p: 5, t: 5 }; dirty(G);
      emit(G, 'pump', `${c.def.name} becomes a 5/5 artifact creature until ${X.P.name}'s next turn.`, { who: X.P.i, cards: [c.id] });
    }, { tgt: { f: { types: ['Artifact'], side: 'you' } }, val: (G, P, c) => (isCreature(c) ? 5 - pow(c) : 2), label: 'Choose an artifact you control' })], ai: pwAi((G, P) => (P.bf.some((c) => isArtifact(c) && !isCreature(c)) ? 1.2 : 0)) },
    { n: -7, label: 'Put any number of cards from your hand onto the battlefield face down as 5/5 artifact creatures', run: (G, X) => {
      const P = X.P, hand = P.hand.splice(0), face = L.tokenDef(G, { name: 'Face-down card', p: 5, t: 5, colors: [], sub: [], kw: [], artifact: true });
      emit(G, 'enter', `${P.name} puts ${hand.length} cards onto the battlefield face down as 5/5 artifact creatures.`, { who: P.i });
      for (const c of hand) enterBattlefield(G, P, c, null, { face });
    }, ai: pwAi((G, P) => (P.hand.length >= 2 ? 9 : 0)) },
  ];
  return d;
};
S['Vivien of the Arkbow'] = (d) => {
  d.loyalty = 5;
  d.pw = [
    { n: 2, label: 'Two +1/+1 counters on up to one creature', eff: [{ k: 'ctrs', n: 2, tgt: tg(YOU, { min: 0 }) }], ai: pwAi(1.8) },
    { n: -3, label: 'A creature you control deals damage equal to its power to one you don\'t control', eff: [{ k: 'bite' }], ai: (G, P, c, when) => {
      if (when !== 'main1' && when !== 'main2') return null;
      const ch = L.chooseTargets(G, P, [{ k: 'bite' }], 'main1', c);
      return ch && ch.score >= 2.5 ? { score: ch.score, targets: ch.targets } : null;
    } },
    { n: -9, label: 'Creatures you control get +4/+4 and gain trample', eff: [{ k: 'pumpAll', side: 'you', p: 4, t: 4, kw: ['trample'] }], ai: pwAi((G, P) => (G.phase === 'main1' && P.bf.filter(isCreature).length >= 2 ? 9 : 0)) },
  ];
  return d;
};

/* ============================================================ White */
S['Leonin Warleader'] = (d) => { d.trig.push(T('attack', { self: true, run: (G, X) => attackers(G, X.P, tok('Cat', 1, 1, ['W'], ['Cat'], ['lifelink']), 2) })); return d; };
S["Hieromancer's Cage"] = (d) => {
  d.etb = [fn((G, X, t) => { if (t && t.c) exileUntil(G, X.P, X.src, t.c); }, { tgt: { f: { types: ['nonland'], side: 'opp' } }, val: (G, P, c) => pv(G, c) + 0.5, label: 'Exile a nonland permanent an opponent controls' })];
  d.role = 'removal';
  return holdUntilLeaves(d);
};
S['Mentor of the Meek'] = (d) => {
  d.trig.push(T('enter', { you: true, other: true, cond: (G, src, ev) => isCreature(ev.c) && pow(ev.c) <= 2, run: (G, X) => {
    const P = X.P;
    if (!canPay(P, C('{1}')) || !yesNo(G, P, X.src, `${X.src.def.name}: pay {1} to draw a card?`, true)) return;
    if (pay(P, C('{1}'))) drawN(G, P, 1);
  } }));
  return d;
};
S['Militia Bugler'] = (d) => { d.etb = [lookFor(4, (c) => c.def.types.includes('Creature') && c.def.power <= 2, 'Put a creature card with power 2 or less into your hand')]; return d; };
S['Ajani\'s Influence'] = (d) => { d.spell = [{ k: 'ctrs', n: 2, tgt: tg({}) }, lookFor(5, colorOf('W'), 'Put a white card into your hand')]; return d; };
S["Ajani's Last Stand"] = (d) => {
  d.trig.push(T('die', { you: true, cond: (G, src, ev) => isCreature(ev.c) || !!ev.def && !!ev.def.loyalty, run: (G, X) => {
    if (!onBf(G, X.src) || !yesNo(G, X.P, X.src, `Sacrifice ${X.src.def.name} to create a 4/4 Avatar with flying?`, true)) return;
    emit(G, 'sac', `${X.P.name} sacrifices ${X.src.def.name}.`, { who: X.P.i, cards: [X.src.id] });
    sacrifice(G, X.P, X.src, true);
    mk(G, X.P, tok('Avatar', 4, 4, ['W'], ['Avatar'], ['flying']), 1);
  } }));
  return d;
};
S["Ajani's Welcome"] = (d) => { d.trig.push(T('enter', { you: true, cond: (G, src, ev) => isCreature(ev.c), run: (G, X) => gain(G, X.P, 1) })); return d; };
S['Azor, the Lawbringer'] = (d) => {
  d.etb = [fn((G, X) => { X.O.noIS = G.turn + (G.active === X.P.i ? 1 : 2); say(G, X.P, `${X.O.name} can't cast instant or sorcery spells during their next turn.`); }, { score: () => 1 })];
  d.trig.push(T('attack', { self: true, run: (G, X) => {
    const P = X.P, base = C('{W}{U}{U}');
    let max = 0;
    while (max < 20 && canPay(P, Object.assign({}, base, { g: max + 1 }))) max++;
    if (!canPay(P, base) || max < 1) return;
    const x = isHuman(G, P) ? L.chooseNumber(G, P, X.src, 'Azor: pay {X}{W}{U}{U} to gain X life and draw X cards (0 to skip)', 0, max, max) : max;
    if (!x || !pay(P, Object.assign({}, base, { g: x }))) return;
    gain(G, P, x); drawN(G, P, x);
  } }));
  return d;
};
S['Court Cleric'] = (d) => { d.statics.push({ who: 'self', cond: (G, src) => hasPW(G.players[src.ctrl], 'Ajani'), p: 1, t: 1, kw: [] }); return d; };
S['Danitha Capashen, Paragon'] = (d) => { d.spellDiscount = (G, P, card) => (card.def.sub.includes('Aura') || card.def.sub.includes('Equipment') ? 1 : 0); return d; };
S['Aethershield Artificer'] = (d) => {
  d.trig.push(T('combatStart', { you: true, eff: [{ k: 'pumpT', p: 2, t: 2, kw: ['indestructible'], tgt: { f: { types: ['Artifact'], side: 'you', fn: (G, c) => isCreature(c) } } }] }));
  return d;
};
S['Confront the Assault'] = (d) => {
  d.castIf = (G, P) => !!G.combat && G.active !== P.i && G.combat.attackers.some((c) => c.attacking);
  d.spell = [mkE(SPIRIT, 3)];
  return d;
};
S['Goring Ceratops'] = (d) => { d.trig.push(T('attack', { self: true, run: (G, X) => { for (const c of X.P.bf.filter((x) => isCreature(x) && x !== X.src)) grantKw(G, c, ['double strike']); } })); return d; };
S['Heroic Reinforcements'] = (d) => {
  d.spell = [mkE(SOLDIER, 2), fn((G, X) => { const cs = X.P.bf.filter(isCreature); cs.forEach((c) => { c.tp += 1; c.tt += 1; if (!c.tkw.includes('haste')) c.tkw.push('haste'); }); dirty(G); emit(G, 'pump', `${X.P.name}'s creatures get +1/+1 and haste until end of turn.`, { who: X.P.i, cards: cs.map((c) => c.id) }); }, { score: (G, P) => 1 + P.bf.filter(isCreature).length * 0.6 })];
  return d;
};
S['History of Benalia'] = (d) => {
  const KNIGHT = tok('Knight', 2, 2, ['W'], ['Knight'], ['vigilance']);
  d.saga = [
    { ch: [1, 2], eff: [mkE(KNIGHT, 1)] },
    { ch: [3], run: (G, X) => { const cs = X.P.bf.filter((c) => isCreature(c) && hasSub(c, 'Knight')); cs.forEach((c) => { c.tp += 2; c.tt += 1; }); dirty(G); if (cs.length) emit(G, 'pump', `${X.P.name}'s Knights get +2/+1 until end of turn.`, { who: X.P.i, cards: cs.map((c) => c.id) }); } },
  ];
  return d;
};
S['Inspiring Commander'] = (d) => { d.trig.push(T('enter', { you: true, other: true, cond: (G, src, ev) => isCreature(ev.c) && pow(ev.c) <= 2, run: (G, X) => { gain(G, X.P, 1); drawN(G, X.P, 1); } })); return d; };
S["Kinjalli's Sunwing"] = (d) => { d.oppCreaturesTapped = true; return d; };
S['Leonin Vanguard'] = (d) => { d.trig.push(T('combatStart', { you: true, cond: (G, src, ev, Q) => Q.bf.filter(isCreature).length >= 3, run: (G, X) => { pump(G, X.src, 1, 1); gain(G, X.P, 1); } })); return d; };
S['Novice Knight'] = (d) => { d.statics.push({ who: 'self', cond: (G, src) => allPerms(G).some((x) => x.att === src.id), p: 0, t: 0, kw: [], flags: { attackAnyway: true } }); return d; };
S["On Serra's Wings"] = (d) => {
  d.statics = d.statics.filter((x) => x.who !== 'enchanted');
  d.statics.push({ who: 'enchanted', p: 1, t: 1, kw: ['flying', 'vigilance', 'lifelink'], legendary: true });
  return d;
};
S['Paladin of Atonement'] = (d) => {
  d.trig.push(T('upkeep', { cond: (G, src, ev, Q) => Q.lostTurn === G.turn - 1, run: (G, X) => addCounters(G, X.src, 1) }));
  d.trig.push(T('die', { self: true, run: (G, X) => gain(G, X.P, Math.max(0, (X.src.def.toughness || 0) + (X.ev.cnt || 0))) }));
  return d;
};
S['Resplendent Angel'] = (d) => {
  const ANGEL = tok('Angel', 4, 4, ['W'], ['Angel'], ['flying', 'vigilance']);
  d.trig.push(T('endStep', { cond: (G, src, ev, Q) => (Q.gainedTurn || 0) >= 5, eff: [mkE(ANGEL, 1)] }));
  d.acts.push({ cost: { m: C('{3}{W}{W}{W}') }, label: '+2/+2 and lifelink until end of turn', run: (G, X) => pump(G, X.src, 2, 2, ['lifelink']), when: ['blocks'],
    ai: (G, P, c) => (c.attacking || c.blocking ? { score: 1.5 } : null) });
  return d;
};
S['Seal Away'] = (d) => {
  d.etb = [fn((G, X, t) => { if (t && t.c) exileUntil(G, X.P, X.src, t.c); }, { tgt: { f: { side: 'opp', tapped: true } }, val: (G, P, c) => pv(G, c) + 0.5, label: 'Exile a tapped creature an opponent controls' })];
  d.role = 'removal';
  return holdUntilLeaves(d);
};
S['Settle the Wreckage'] = (d) => {
  d.spell = [fn((G, X, t) => {
    const Q = t && t.p != null ? G.players[t.p] : X.O;
    const cs = Q.bf.filter((c) => isCreature(c) && c.attacking);
    for (const c of cs) exilePermanent(G, X.P, c);
    if (!cs.length) return;
    const n = cs.length;
    const want = isHuman(G, Q) ? yesNo(G, Q, X.src, `Search your library for ${n} basic land card${n > 1 ? 's' : ''}?`, true) : true;
    if (want) { const got = searchLibrary(G, Q, (c) => isLand(c) && c.def.supertypes.includes('Basic'), n, 'bfTapped', 'basic lands'); if (got.length) emit(G, 'search', `${Q.name} puts ${nameList(got)} onto the battlefield tapped.`, { who: Q.i, cards: got.map((c) => c.id) }); }
  }, { tgt: { what: 'player' }, val: (G, P, x) => (x.p === P.i ? -5 : G.players[x.p].bf.filter((c) => isCreature(c) && c.attacking).reduce((s, c) => s + cv(c), 0) - 1), label: 'Choose a player' })];
  d.castIf = (G, P) => !!G.combat && G.active !== P.i;
  d.role = 'removal';
  return d;
};
S['Shalai, Voice of Plenty'] = (d) => {
  d.playerHex = () => true;
  d.statics.push({ who: 'all', f: { side: 'you', other: true }, p: 0, t: 0, kw: ['hexproof'] });
  d.acts.push({ cost: { m: C('{4}{G}{G}') }, label: 'A +1/+1 counter on each creature you control', run: (G, X) => ctrEach(G, X.P.bf.filter(isCreature), 1), when: ['main2', 'end'], ai: (G, P) => ({ score: P.bf.filter(isCreature).length * 0.9 }) });
  return d;
};
S['Tactical Advantage'] = (d) => { d.spell = [{ k: 'pumpT', p: 2, t: 2, tgt: { f: { side: 'you', fn: (G, c) => !!c.blocking || (c.attacking && c.blockedBy.length > 0) } } }]; return d; };
S['Teshar, Ancestor\'s Apostle'] = (d) => {
  d.trig.push(T('cast', { you: true, cond: (G, s, ev) => !!ev.card && historic(ev.card.def), eff: [{ k: 'regrow', to: 'bf', tgt: { what: 'gy', mine: true, f: { types: ['Creature'], mvLE: 3 } } }] }));
  return d;
};

/* ============================================================ Blue */
S['Gearsmith Prodigy'] = (d) => { d.statics.push({ who: 'self', cond: (G, src) => hasArt(G.players[src.ctrl]), p: 1, t: 0, kw: [] }); return d; };
S['One with the Machine'] = (d) => { d.spell = [fn((G, X) => drawN(G, X.P, Math.max(0, ...X.P.bf.filter(isArtifact).map((c) => c.def.mv))), { score: (G, P) => Math.max(0, ...P.bf.filter(isArtifact).map((c) => c.def.mv)) * 1.2 - 0.5, value: 2 })]; return d; };
S['Scholar of Stars'] = (d) => { d.etb = [fn((G, X) => { if (hasArt(X.P)) drawN(G, X.P, 1); }, { score: (G, P) => (hasArt(P) ? 1.2 : 0) })]; return d; };
S['Blink of an Eye'] = (d) => kicker(d, '{1}{U}', { label: 'Return a nonland permanent to its owner\'s hand', eff: [{ k: 'bounceP', tgt: { f: { types: ['nonland'] } } }] },
  { label: 'Return it and draw a card', eff: [{ k: 'bounceP', tgt: { f: { types: ['nonland'] } } }, { k: 'draw', n: 1 }] });
S['Chart a Course'] = (d) => { d.spell = [{ k: 'draw', n: 2 }, fn((G, X) => { if (!raid(G, X.P)) discardE(G, X.P, 1, 'discard'); }, { score: (G, P) => (raid(G, P) ? 0.5 : -0.4) })]; return d; };
S['Deadeye Rig-Hauler'] = (d) => { d.etb = [Object.assign({ k: 'bounceP', tgt: { f: {}, min: 0 } }, { if: (G, X) => raid(G, X.P) })]; return d; };
S['Departed Deckhand'] = (d) => {
  d.trig.push(T('targeted', { cond: (G, src, ev) => ev.c === src && !!ev.spell, run: (G, X) => { if (onBf(G, X.src)) { emit(G, 'sac', `${X.src.def.name} is sacrificed.`, { who: X.P.i, cards: [X.src.id] }); sacrifice(G, X.P, X.src, true); } } }));
  d.blockOnlyBy = (G, b) => hasSub(b, 'Spirit');
  d.acts.push({ cost: { m: C('{3}{U}') }, label: "Another creature can't be blocked this turn except by Spirits", when: ['main1'],
    eff: [{ k: 'grant', flags: { spiritsOnly: true }, say: "can't be blocked this turn except by Spirits", tgt: { f: { side: 'you', other: true } } }],
    ai: (G, P, c) => { const a = P.bf.filter((x) => x !== c && isCreature(x) && !x.tapped && (!x.sick || has(x, 'haste'))).sort((x, y) => pow(y) - pow(x))[0]; return a && pow(a) >= 3 ? { score: 0.5 + pow(a) * 0.35, targets: [{ c: a }] } : null; } });
  return d;
};
S['Dreamcaller Siren'] = (d) => {
  d.blockFlyersOnly = true;
  d.etb = [Object.assign({ k: 'tapP', tgt: { f: { types: ['nonland'], side: 'opp' }, n: 2, min: 0 } }, { if: (G, X) => X.P.bf.some((c) => c !== X.src && isCreature(c) && hasSub(c, 'Pirate')) })];
  return d;
};
S['Dwindle'] = (d) => {
  d.trig.push(T('blocks', { cond: (G, src, ev) => ev.c.id === src.att, run: (G, X) => { const h = byId(G, X.src.att); if (h && onBf(G, h)) destroyPermanent(G, X.P, h, `to ${X.src.def.name}`); } }));
  d.auraVal = (G, P, c) => (c.ctrl === P.i ? -cv(c) - 1 : cv(c) * 0.6 + Math.min(6, Math.max(0, pow(c))) * 0.3);
  return d;
};
S['Herald of Secret Streams'] = (d) => { d.statics.push({ who: 'all', f: { side: 'you', fn: (G, c) => c.cnt > 0 }, p: 0, t: 0, kw: [], flags: { unblockable: true } }); return d; };
S['Kitesail Corsair'] = (d) => { d.statics.push({ who: 'self', cond: (G, src) => !!src.attacking, p: 0, t: 0, kw: ['flying'] }); return d; };
S['Kumena\'s Speaker'] = (d) => { d.statics.push({ who: 'self', cond: (G, src) => controls(G.players[src.ctrl], (c) => (c !== src && isCreature(c) && hasSub(c, 'Merfolk')) || (isLand(c) && c.def.sub.includes('Island'))), p: 1, t: 1, kw: [] }); return d; };
S['Merfolk Mistbinder'] = (d) => { d.statics.push({ who: 'all', f: { side: 'you', other: true, sub: 'Merfolk' }, p: 1, t: 1, kw: [] }); return d; };
S['Nezahal, Primal Tide'] = (d) => {
  d.noMaxHand = true;
  d.trig.push(T('cast', { opp: true, cond: (G, s, ev) => !!ev.card && !ev.card.def.types.includes('Creature'), eff: [{ k: 'draw', n: 1 }] }));
  d.acts.push({ cost: { discard: 3 }, label: 'Discard three cards: exile Nezahal; it returns tapped at the next end step', noAi: true,
    run: (G, X) => {
      const c = X.src, owner = G.players[c.owner];
      exilePermanent(G, X.P, c);
      G.delayed.push({ when: 'end', run: (GG) => { if (!owner.exile.includes(c)) return; owner.exile.splice(owner.exile.indexOf(c), 1); emit(GG, 'enter', `${c.def.name} returns to the battlefield tapped.`, { who: owner.i, card: c.id }); enterBattlefield(GG, owner, c, null, { tapped: true }); } });
    } });
  return d;
};
S['Relic Runner'] = (d) => { d.statics.push({ who: 'self', cond: (G, src) => (G.players[src.ctrl].castDefs || []).some(historic), p: 0, t: 0, kw: [], flags: { unblockable: true } }); return d; };
S['River Sneak'] = (d) => { d.unblockable = true; d.trig.push(T('enter', { you: true, other: true, cond: (G, src, ev) => isCreature(ev.c) && hasSub(ev.c, 'Merfolk'), run: (G, X) => pump(G, X.src, 1, 1) })); return d; };
S["River's Rebuke"] = (d) => {
  d.spell = [fn((G, X, t) => { const Q = G.players[t ? t.p : X.O.i]; for (const c of Q.bf.filter((x) => !isLand(x))) bounceCard(G, X.P, c); }, { tgt: { what: 'player' }, val: (G, P, x) => (x.p === P.i ? -5 : G.players[x.p].bf.filter((c) => !isLand(c)).reduce((s, c) => s + pv(G, c), 0) * 0.5), label: 'Choose a player' })];
  return d;
};
S['Sai, Master Thopterist'] = (d) => {
  d.trig.push(T('cast', { you: true, cond: (G, s, ev) => !!ev.card && ev.card.def.types.includes('Artifact'), eff: [mkE(THOPTER, 1)] }));
  d.acts.push({ cost: { m: C('{1}{U}'), sac: { f: { types: ['Artifact'] }, n: 2, label: 'two artifacts' } }, label: 'Draw a card', eff: [{ k: 'draw', n: 1 }], when: ['end'],
    ai: (G, P) => (P.bf.filter((c) => isArtifact(c) && c.token && !c.def.mana).length >= 3 ? { score: 0.8 } : null) });
  return d;
};
S['Salvager of Secrets'] = (d) => { d.etb = [{ k: 'regrow', tgt: { what: 'gy', mine: true, f: { types: ['Instant', 'Sorcery'] } } }]; return d; };
S['Seafloor Oracle'] = (d) => { d.trig.push(T('hitPlayer', { you: true, cond: (G, src, ev) => hasSub(ev.c, 'Merfolk'), eff: [{ k: 'draw', n: 1 }] })); return d; };
S['Silvergill Adept'] = (d) => { d.addCost = { reveal: 'Merfolk', orPay: C('{3}') }; d.etb = [{ k: 'draw', n: 1 }]; return d; };
S['Siren Reaver'] = (d) => { d.costMod = (G, P) => (raid(G, P) ? 1 : 0); return d; };
S['Siren Stormtamer'] = (d) => {
  d.respondAb = { cost: C('{U}'), legal: (G, O, item, c) => allTargets(item.targets).some((t) => (t.p != null && !t.c && t.p === O.i) || (t.c && t.c.ctrl === O.i && isCreature(t.c))),
    ai: (G, O, item) => (item.card.def.role === 'removal' || item.card.def.spell && item.card.def.spell.some((e) => ['destroy', 'exile', 'destroyP', 'exileP', 'dmgX', 'bounceP'].includes(e.k)) ? 5 : 2) };
  return d;
};
S['Skilled Animator'] = (d) => {
  d.statics.push({ who: 'all', f: { types: ['Artifact'], fn: (G, c, P, src) => !!src && src.mem.animated === c.id }, p: 0, t: 0, kw: [], baseFn: () => 5, flags: { animated: true } });
  d.etb = [fn((G, X, t) => { const c = t && t.c; if (!c || !onBf(G, c)) return; X.src.mem.animated = c.id; c.mem.animBy = X.src.id; dirty(G); emit(G, 'pump', `${c.def.name} becomes a 5/5 artifact creature while ${X.src.def.name} remains.`, { who: X.P.i, cards: [c.id] }); },
    { tgt: { f: { types: ['Artifact'], side: 'you' } }, val: (G, P, c) => (isCreature(c) ? 5 - pow(c) : 3) - (c.def.mana || c.def.manaAbs ? 1 : 0), label: 'Choose an artifact you control' })];
  return d;
};
S['Tempest Djinn'] = (d) => { d.statics.push({ who: 'self', p: 0, t: 0, kw: [], pFn: (G, src) => G.players[src.ctrl].bf.filter((c) => isLand(c) && c.def.supertypes.includes('Basic') && c.def.sub.includes('Island')).length }); return d; };
S['Temporal Machinations'] = (d) => { d.spell = [{ k: 'bounceP', tgt: { f: {} } }, fn((G, X) => { if (hasArt(X.P)) drawN(G, X.P, 1); }, { score: (G, P) => (hasArt(P) ? 1.2 : 0) })]; return d; };
S["Tezzeret's Gatebreaker"] = (d) => {
  d.etb = [lookFor(5, (c) => c.def.colors.includes('U') || c.def.types.includes('Artifact'), 'Put a blue or artifact card into your hand')];
  d.acts.push({ cost: { m: C('{5}{U}'), tap: true, sacSelf: true }, label: "Creatures you control can't be blocked this turn", when: ['main1'],
    run: (G, X) => { const cs = X.P.bf.filter(isCreature); cs.forEach((c) => { c.tf.unblockable = true; }); dirty(G); say(G, X.P, `${X.P.name}'s creatures can't be blocked this turn.`); },
    ai: (G, P) => { const dmg = P.bf.filter((c) => isCreature(c) && !c.tapped && (!c.sick || has(c, 'haste'))).reduce((s, c) => s + Math.max(0, pow(c)), 0); return dmg >= other(G, P).life ? { score: 100 } : dmg >= 8 ? { score: 2 } : null; } });
  return d;
};
S["Tezzeret's Strider"] = (d) => { d.statics.push({ who: 'self', cond: (G, src) => hasPW(G.players[src.ctrl], 'Tezzeret'), p: 0, t: 0, kw: ['menace'] }); return d; };
S['Vodalian Arcanist'] = (d) => { d.manaAbs = [{ colors: ['C'], only: (p) => !!p.def && isIS(p.def) }]; return d; };
S['Zahid, Djinn of the Lamp'] = (d) => {
  d.modes = [{ label: 'Cast it', eff: [] }, { label: 'Pay {3}{U} and tap an untapped artifact instead', eff: [], cost: { g: -1, U: -1, W: 0, B: 0, R: 0, G: 0 }, addCost: { tapArt: true } }];
  return d;
};
S['Entrancing Melody'] = (d) => {
  d.spell = [fn((G, X, t) => { const c = t && t.c; if (c && onBf(G, c)) { gainControl(G, X.P, c, 'perm', X.src); emit(G, 'control', `${X.P.name} gains control of ${c.def.name}.`, { who: X.P.i, cards: [c.id] }); } },
    { tgt: { f: { side: 'opp' }, fn: (G, P, c, src, X) => (X && X.x != null ? c.def.mv === X.x : canPay(P, Object.assign(C('{U}{U}'), { g: c.def.mv }))) }, val: (G, P, c) => cv(c) + 1, label: 'Gain control of a creature with mana value X', value: 4 })];
  d.xFromTarget = (t0) => (t0[0] && t0[0].c ? t0[0].c.def.mv : 0);
  d.aiX = (G, P, card, max) => { const b = other(G, P).bf.filter((c) => isCreature(c) && c.def.mv <= max).sort((a, x) => cv(x) - cv(a))[0]; return b ? b.def.mv : null; };
  return d;
};

/* ============================================================ Black */
S['Blood Divination'] = (d) => { d.spell = [{ k: 'draw', n: 3 }]; return sacCost(d); };
S['Demon of Catastrophes'] = (d) => sacCost(d);
S['Costly Plunder'] = (d) => { d.spell = [{ k: 'draw', n: 2 }]; return sacCost(d, ['Artifact', 'Creature'], 'an artifact or creature'); };
S['Open the Graves'] = (d) => { d.trig.push(T('die', { you: true, cond: (G, src, ev) => !ev.token, eff: [mkE(ZOMBIE, 1)] })); return d; };
S['Reassembling Skeleton'] = (d) => {
  d.gyActs = [{ cost: { m: C('{1}{B}') }, label: 'Return it to the battlefield tapped', when: ['main2', 'end'],
    run: (G, X) => { emit(G, 'raise', `${X.src.def.name} returns to the battlefield tapped.`, { who: X.P.i, cards: [X.src.id] }); putOntoBattlefield(G, X.P, X.src, { tapped: true }); }, ai: () => ({ score: 1 }) }];
  return d;
};
S['Abnormal Endurance'] = (d) => {
  d.spell = [{ k: 'pumpT', p: 2, t: 0, tgt: { f: {} } }, fn((G, X) => {
    const c = X.last && X.last.c; if (!c) return;
    dieGrant(G, c, (G2, X2) => { const card = X2.src, Q = G2.players[card.owner]; if (!Q.gy.includes(card)) return; emit(G2, 'raise', `${card.def.name} returns to the battlefield tapped.`, { who: Q.i, cards: [card.id] }); putOntoBattlefield(G2, Q, card, { tapped: true }); }, 'When this creature dies, return it to the battlefield tapped');
  }, { score: () => 0.6 })];
  return d;
};
S['Arisen Gorgon'] = (d) => { d.statics.push({ who: 'self', cond: (G, src) => hasPW(G.players[src.ctrl], 'Liliana'), p: 0, t: 0, kw: ['deathtouch'] }); return d; };
S['Champion of Dusk'] = (d) => {
  d.etb = [fn((G, X) => { const n = X.P.bf.filter((c) => isCreature(c) && hasSub(c, 'Vampire')).length; drawN(G, X.P, n); loseLife(G, X.P, n); }, { score: (G, P) => P.bf.filter((c) => isCreature(c) && hasSub(c, 'Vampire')).length * 0.9 + 0.8 })];
  return d;
};
S['Death Baron'] = (d) => { d.statics.push({ who: 'all', f: { side: 'you', fn: (G, c, P, src) => hasSub(c, 'Skeleton') || (hasSub(c, 'Zombie') && c !== src) }, p: 1, t: 1, kw: ['deathtouch'] }); return d; };
S['Demonlord Belzenlok'] = (d) => {
  d.etb = [fn((G, X) => {
    const P = X.P;
    let n = 0;
    for (let guard = 0; guard < 20; guard++) {
      const shown = [];
      let got = null;
      while (P.library.length) { const c = P.library.pop(); if (c.def.types.includes('Land')) { P.exile.push(c); shown.push(c); continue; } got = c; break; }
      if (shown.length) emit(G, 'exile', `${P.name} exiles ${nameList(shown)}.`, { who: P.i, cards: shown.map((c) => c.id) });
      if (!got) break;
      P.hand.push(got); n++; dirty(G);
      emit(G, 'draw', `${P.name} puts ${got.def.name} into their hand.`, { who: P.i, cards: [got.id] });
      if (got.def.mv < 4) break;
    }
    if (n) hit(G, X, { p: P.i }, n);
  }, { score: () => 2 })];
  return d;
};
S['Dire Fleet Poisoner'] = (d) => { d.etb = [{ k: 'pumpT', p: 1, t: 1, kw: ['deathtouch'], tgt: { f: { side: 'you', sub: 'Pirate', attacking: true } } }]; return d; };
S['Epicure of Blood'] = (d) => { d.trig.push(T('gain', { you: true, run: (G, X) => loseLife(G, X.O, 1, X.P.i) })); return d; };
S['Fathom Fleet Boarder'] = (d) => { d.etb = [fn((G, X) => { if (!X.P.bf.some((c) => c !== X.src && isCreature(c) && hasSub(c, 'Pirate'))) loseLife(G, X.P, 2); }, { score: (G, P) => -0.4 })]; return d; };
S['Kitesail Freebooter'] = (d) => {
  d.etb = [fn((G, X) => {
    const Q = X.O, cs = Q.hand.filter((c) => !c.def.types.includes('Land') && !c.def.types.includes('Creature'));
    emit(G, 'info', `${Q.name} reveals their hand${Q.hand.length ? `: ${nameList(Q.hand)}` : ''}.`, { who: X.P.i, cards: Q.hand.map((c) => c.id) });
    if (!cs.length) return;
    const c = isHuman(G, X.P) ? pickCards(G, { type: 'choose', reason: 'choose', n: 1, min: 1, max: 1, zone: 'hand', cards: cs.map((x) => x.id), label: 'Exile a noncreature, nonland card' }, cs, 1)[0] : cs.slice().sort((a, b) => b.def.value - a.def.value)[0];
    Q.hand.splice(Q.hand.indexOf(c), 1); Q.exile.push(c); dirty(G);
    X.src.mem.heldHand = (X.src.mem.heldHand || []).concat(c);
    emit(G, 'exile', `${c.def.name} is exiled until ${X.src.def.name} leaves the battlefield.`, { who: X.P.i, cards: [c.id] });
  }, { score: (G, P) => (other(G, P).hand.length ? 1.2 : 0.1) })];
  d.trig.push(T('leave', { self: true, run: (G, X) => { for (const c of (X.ev.mem && X.ev.mem.heldHand) || []) { const Q = G.players[c.owner]; if (!Q.exile.includes(c)) continue; Q.exile.splice(Q.exile.indexOf(c), 1); Q.hand.push(c); dirty(G); emit(G, 'info', `${c.def.name} returns to ${Q.name}'s hand.`, { who: Q.i, cards: [c.id] }); } } }));
  return d;
};
S["Liliana's Spoils"] = (d) => { d.spell = [fn((G, X) => discardE(G, X.O, 1, 'discard'), { score: (G, P) => (other(G, P).hand.length ? 1 : 0) }), lookFor(5, colorOf('B'), 'Put a black card into your hand')]; return d; };
S["Nightmare's Thirst"] = (d) => {
  d.spell = [{ k: 'gain', n: 1 }, { k: 'pumpT', pFn: (G, X) => -(X.P.gainedTurn || 0), tFn: (G, X) => -(X.P.gainedTurn || 0), p: -1, t: -1, tgt: { f: {} } }];
  return d;
};
S['Poison-Tip Archer'] = (d) => { d.trig.push(T('die', { other: true, cond: (G, src, ev) => true, run: (G, X) => loseLife(G, X.O, 1, X.P.i) })); return d; };
S['Ravenous Harpy'] = (d) => {
  d.acts.push({ cost: { m: C('{1}'), sac: { f: { types: ['Creature'] }, label: 'another creature' } }, label: 'Put a +1/+1 counter on it', run: (G, X) => addCounters(G, X.src, 1), noAi: true });
  return d;
};
S['Rise from the Grave'] = (d) => {
  d.spell = [fn((G, X, t) => { const c = t && t.c; if (!c) return; emit(G, 'raise', `${c.def.name} returns under ${X.P.name}'s control as a black Zombie.`, { who: X.P.i, cards: [c.id] }); putOntoBattlefield(G, X.P, c, {}); if (onBf(G, c)) { c.addSubs = ['Zombie']; dirty(G); } },
    { tgt: { what: 'gy', f: { types: ['Creature'] } }, val: (G, P, c) => c.def.value + 0.5, label: 'Choose a creature card in a graveyard', value: 3.5 })];
  return d;
};
S['Rite of Belzenlok'] = (d) => {
  const CLERIC = tok('Cleric', 0, 1, ['B'], ['Cleric']);
  const DEMON = tok('Demon', 6, 6, ['B'], ['Demon'], ['flying', 'trample'], { text: 'Flying, trample\nAt the beginning of your upkeep, sacrifice another creature. If you can\'t, this token deals 6 damage to you.',
    trig: [T('upkeep', { you: true, run: (G, X) => { if (!edictOf(G, X.P, (c) => isCreature(c) && c !== X.src)) hit(G, X, { p: X.P.i }, 6); } })] });
  d.saga = [{ ch: [1, 2], eff: [mkE(CLERIC, 2)] }, { ch: [3], eff: [mkE(DEMON, 1)] }];
  return d;
};
S['Ruin Raider'] = (d) => {
  d.trig.push(T('endStep', { you: true, cond: (G, src, ev, Q) => raid(G, Q), run: (G, X) => {
    const c = X.P.library.pop(); if (!c) return;
    X.P.hand.push(c); dirty(G);
    emit(G, 'draw', `${X.P.name} reveals ${c.def.name} and puts it into their hand.`, { who: X.P.i, cards: [c.id] });
    loseLife(G, X.P, c.def.mv);
  } }));
  return d;
};
S['Sanctum Seeker'] = (d) => { d.trig.push(T('attack', { you: true, cond: (G, src, ev) => hasSub(ev.c, 'Vampire'), run: (G, X) => drain(G, X, 1) })); return d; };
S['Skulduggery'] = (d) => { d.spell = [{ k: 'pumpT', p: 1, t: 1, tgt: tg(YOU) }, { k: 'pumpT', p: -1, t: -1, tgt: tg(OPP) }]; return d; };
S['Thallid Omnivore'] = (d) => {
  d.acts.push({ cost: { m: C('{1}'), sac: { f: { types: ['Creature'] }, label: 'another creature' } }, label: '+2/+2 until end of turn', noAi: true,
    run: (G, X) => { pump(G, X.src, 2, 2); if ((X.sacd || []).some((s) => s.c && hasSub(s.c, 'Saproling'))) gain(G, X.P, 2); } });
  return d;
};
S['Torgaar, Famine Incarnate'] = (d) => {
  const half = (G, Q) => Math.floor((Q.life0 || 20) / 2);
  d.modes = [0, 1, 2, 3].map((k) => (k ? { label: `Sacrifice ${k} creature${k > 1 ? 's' : ''} ({${2 * k}} less)`, eff: [], cost: { g: -2 * k, W: 0, U: 0, B: 0, R: 0, G: 0 }, addCost: { sac: { types: ['Creature'] }, n: k } } : { label: 'Cast it', eff: [] }));
  d.etb = [fn((G, X, t) => {
    if (!t || t.p == null) return;
    const Q = G.players[t.p], v = half(G, Q), was = Q.life;
    Q.life = v; dirty(G);
    emit(G, 'life', `${Q.name}'s life total becomes ${v}.`, { who: X.P.i, target: `p${Q.i}`, amount: was - v });
  }, { tgt: { what: 'player', min: 0 }, val: (G, P, x) => { const Q = G.players[x.p], v = half(G, Q); return x.p === P.i ? (v - Q.life) * 0.3 : (Q.life - v) * 0.3; }, label: 'Up to one player\'s life becomes half their starting life' })];
  return d;
};
S['Twilight Prophet'] = (d) => {
  d.ascend = true;
  d.trig.push(T('upkeep', { you: true, cond: (G, src, ev, Q) => !!Q.blessed, run: (G, X) => {
    const c = X.P.library.pop(); if (!c) return;
    X.P.hand.push(c); dirty(G);
    emit(G, 'draw', `${X.P.name} reveals ${c.def.name} and puts it into their hand.`, { who: X.P.i, cards: [c.id] });
    drain(G, X, c.def.mv);
  } }));
  return d;
};
S['Vicious Offering'] = (d) => kicker(d, { sac: { types: ['Creature'] }, sacWord: 'a creature' }, { label: 'A creature gets -2/-2', eff: [{ k: 'pumpT', p: -2, t: -2, tgt: { f: {} } }] },
  { label: 'A creature gets -5/-5', eff: [{ k: 'pumpT', p: -5, t: -5, tgt: { f: {} } }] });
S['Whisper, Blood Liturgist'] = (d) => {
  d.acts.push({ cost: { tap: true, sac: { f: { types: ['Creature'] }, n: 2, label: 'two creatures' } }, label: 'Return a creature card from your graveyard to the battlefield',
    eff: [{ k: 'regrow', to: 'bf', tgt: { what: 'gy', mine: true, f: { types: ['Creature'] } } }],
    ai: (G, P, c) => { const best = cards(P.gy, 'Creature').sort((a, b) => b.def.value - a.def.value)[0]; const fod = P.bf.filter((x) => isCreature(x) && x !== c).sort((a, b) => pv(G, a) - pv(G, b)).slice(0, 2); return best && fod.length === 2 && best.def.value > fod.reduce((s, x) => s + pv(G, x), 0) + 1 ? { score: 1.5 } : null; } });
  return d;
};

/* ============================================================ Red */
S['Act of Treason'] = (d) => { d.spell = [fn((G, X, t) => borrow(G, X, t && t.c), { tgt: { f: {} }, val: borrowVal, label: 'Gain control of a creature until end of turn', value: 2.5 })]; return d; };
S['Captivating Crew'] = (d) => {
  d.acts.push({ cost: { m: C('{3}{R}') }, sorcery: true, label: 'Gain control of a creature until end of turn', when: ['main1'],
    eff: [fn((G, X, t) => borrow(G, X, t && t.c), { tgt: tg(OPP), val: borrowVal, label: 'Choose a creature an opponent controls' })] });
  return d;
};
S['Banefire'] = (d) => {
  d.spell = [{ k: 'dmgX', nFn: (G, X) => X.x || 0, tgt: { what: 'any', f: {} } }];
  d.onCast = (G, P, item) => { if ((item.x || 0) >= 5) item.unc = true; };
  return d;
};
S['Siege-Gang Commander'] = (d) => {
  d.etb = [mkE(GOBLIN, 3)];
  d.acts.push({ cost: { m: C('{1}{R}'), sac: { f: { sub: 'Goblin' }, label: 'a Goblin' } }, label: '2 damage to any target', eff: [{ k: 'dmgX', nFn: () => 2, tgt: { what: 'any', f: {} } }], when: ['main2', 'end'],
    ai: (G, P) => (other(G, P).life <= 2 ? { score: 100, targets: [{ p: other(G, P).i }] } : null) });
  return d;
};
S['Charging Tuskodon'] = (d) => { d.doubleToPlayer = true; return d; };
S['Fight with Fire'] = (d) => kicker(d, '{5}{R}', { label: '5 damage to a creature', eff: [{ k: 'dmgX', nFn: () => 5, tgt: { f: {} } }] },
  { label: '10 damage divided as you choose among any number of targets', eff: [{ k: 'divided', n: 10, max: 6 }] });
S['Ghitu Lavarunner'] = (d) => { d.statics.push({ who: 'self', cond: (G, src) => G.players[src.ctrl].gy.filter((c) => isIS(c.def)).length >= 2, p: 1, t: 0, kw: ['haste'] }); return d; };
S['Goblin Trashmaster'] = (d) => {
  d.statics.push({ who: 'all', f: { side: 'you', other: true, sub: 'Goblin' }, p: 1, t: 1, kw: [] });
  d.acts.push({ cost: { sac: { f: { sub: 'Goblin' }, label: 'a Goblin' } }, label: 'Destroy an artifact', eff: [{ k: 'destroyP', tgt: { f: { types: ['Artifact'] } } }],
    ai: (G, P) => { const a = other(G, P).bf.filter(isArtifact).sort((x, y) => pv(G, y) - pv(G, x))[0]; const g = P.bf.filter((c) => hasSub(c, 'Goblin') && c.token)[0]; return a && g && pv(G, a) > 2 ? { score: pv(G, a) - 1, targets: [{ c: a }] } : null; } });
  return d;
};
S['Goreclaw, Terror of Qal Sisma'] = (d) => {
  d.spellDiscount = (G, P, card) => (card.def.types.includes('Creature') && card.def.power >= 4 ? 2 : 0);
  d.trig.push(T('attack', { self: true, run: (G, X) => { for (const c of X.P.bf.filter((x) => isCreature(x) && pow(x) >= 4)) pump(G, c, 1, 1, ['trample']); } }));
  return d;
};
S['Guttersnipe'] = (d) => { d.trig.push(T('cast', { you: true, cond: (G, s, ev) => !!ev.card && isIS(ev.card.def), run: (G, X) => hitOpp(G, X, 2) })); return d; };
S['Lathliss, Dragon Queen'] = (d) => {
  d.trig.push(T('enter', { you: true, other: true, cond: (G, src, ev) => !ev.c.token && isCreature(ev.c) && hasSub(ev.c, 'Dragon'), eff: [mkE(tok('Dragon', 5, 5, ['R'], ['Dragon'], ['flying']), 1)] }));
  d.acts.push({ cost: { m: C('{1}{R}') }, label: 'Dragons you control get +1/+0', run: (G, X) => { const cs = X.P.bf.filter((c) => isCreature(c) && hasSub(c, 'Dragon')); cs.forEach((c) => { c.tp += 1; }); dirty(G); emit(G, 'pump', `${X.P.name}'s Dragons get +1/+0 until end of turn.`, { who: X.P.i, cards: cs.map((c) => c.id) }); }, when: ['blocks'],
    ai: (G, P) => (P.bf.some((c) => hasSub(c, 'Dragon') && c.attacking && !c.blockedBy.length) ? { score: 1 } : null) });
  return d;
};
S['Needletooth Raptor'] = (d) => { d.trig.push(enrage({ eff: [{ k: 'dmgX', nFn: () => 5, tgt: tg(OPP) }] })); return d; };
S['Raptor Hatchling'] = (d) => { d.trig.push(enrage({ eff: [mkE(tok('Dinosaur', 3, 3, ['G'], ['Dinosaur'], ['trample']), 1)] })); return d; };
S['Rekindling Phoenix'] = (d) => {
  const ELEMENTAL = tok('Elemental', 0, 1, ['R'], ['Elemental'], [], { text: 'At the beginning of your upkeep, sacrifice this token and return target card named Rekindling Phoenix from your graveyard to the battlefield. It gains haste until end of turn.',
    trig: [T('upkeep', { you: true, run: (G, X) => {
      if (onBf(G, X.src)) { emit(G, 'sac', `${X.P.name} sacrifices ${X.src.def.name}.`, { who: X.P.i, cards: [X.src.id] }); sacrifice(G, X.P, X.src, true); }
      const ph = X.P.gy.find((c) => c.def.name === 'Rekindling Phoenix');
      if (ph) { emit(G, 'raise', `${ph.def.name} returns to the battlefield.`, { who: X.P.i, cards: [ph.id] }); putOntoBattlefield(G, X.P, ph, {}); if (onBf(G, ph)) grantKw(G, ph, ['haste']); }
    } })] });
  d.dies = [mkE(ELEMENTAL, 1)];
  return d;
};
S['Repeating Barrage'] = (d) => {
  d.spell = [{ k: 'dmgX', nFn: () => 3, tgt: { what: 'any', f: {} } }];
  d.gyActs = [{ cost: { m: C('{3}{R}{R}') }, label: 'Raid: return it to your hand', cond: (G, P) => raid(G, P), when: ['main2'], run: (G, X) => { X.P.gy.splice(X.P.gy.indexOf(X.src), 1); X.P.hand.push(X.src); dirty(G); emit(G, 'raise', `${X.P.name} returns ${X.src.def.name} to their hand.`, { who: X.P.i, cards: [X.src.id] }); }, ai: () => ({ score: 1.2 }) }];
  return d;
};
S['Rowdy Crew'] = (d) => {
  d.etb = [fn((G, X) => {
    const P = X.P;
    drawN(G, P, 3);
    const gone = [];
    for (let k = 0; k < 2 && P.hand.length; k++) { const c = P.hand.splice(G.rng.int(P.hand.length), 1)[0]; P.gy.push(c); gone.push(c); L.noteDiscard(G, P, c); }
    dirty(G);
    if (gone.length) emit(G, 'discard', `${P.name} discards ${nameList(gone)} at random.`, { who: P.i, cards: gone.map((c) => c.id) });
    if (gone.length === 2 && gone[0].def.types.some((t) => gone[1].def.types.includes(t))) addCounters(G, X.src, 2);
  }, { score: () => 1.2 })];
  return d;
};
S["Sarkhan's Dragonfire"] = (d) => { d.spell = [{ k: 'dmgX', nFn: () => 3, tgt: { what: 'any', f: {} } }, lookFor(5, colorOf('R'), 'Put a red card into your hand')]; return d; };
S["Sarkhan's Whelp"] = (d) => { d.trig.push(T('pwUsed', { you: true, cond: (G, src, ev) => hasSub(ev.c, 'Sarkhan'), eff: [{ k: 'dmgX', nFn: () => 1, tgt: { what: 'any', f: {} } }] })); return d; };
S['Shivan Fire'] = (d) => kicker(d, '{4}', { label: '2 damage to a creature', eff: [{ k: 'dmgX', nFn: () => 2, tgt: { f: {} } }] }, { label: '4 damage to a creature', eff: [{ k: 'dmgX', nFn: () => 4, tgt: { f: {} } }] });
S['Silverclad Ferocidons'] = (d) => { d.trig.push(enrage({ run: (G, X) => edictOf(G, X.O, () => true) })); return d; };
S['Spit Flame'] = (d) => {
  d.spell = [{ k: 'dmgX', nFn: () => 4, tgt: { f: {} } }];
  d.gyTrig = [T('enter', { you: true, cond: (G, src, ev) => isCreature(ev.c) && hasSub(ev.c, 'Dragon'), run: (G, X) => {
    const P = X.P, c = X.src;
    if (!P.gy.includes(c) || !canPay(P, C('{R}')) || !yesNo(G, P, c, `Pay {R} to return ${c.def.name} to your hand?`, true)) return;
    if (!pay(P, C('{R}'))) return;
    P.gy.splice(P.gy.indexOf(c), 1); P.hand.push(c); dirty(G);
    emit(G, 'raise', `${P.name} returns ${c.def.name} to their hand.`, { who: P.i, cards: [c.id] });
  } })];
  d.role = 'removal';
  return d;
};
S['Thud'] = (d) => {
  sacCost(d);
  d.spell = [{ k: 'dmgX', nFn: (G, X) => (X.sac && X.sac.pow) || 0, tgt: { what: 'any', f: {} } }];
  return d;
};
S['Etali, Primal Storm'] = (d) => {
  d.trig.push(T('attack', { self: true, run: (G, X) => {
    const shown = [];
    for (const Q of G.players) { const c = Q.library.pop(); if (c) { Q.exile.push(c); shown.push(c); } }
    dirty(G);
    if (!shown.length) return;
    emit(G, 'exile', `${X.src.def.name} exiles ${nameList(shown)}.`, { who: X.P.i, cards: shown.map((c) => c.id) });
    for (const c of shown) if (!c.def.types.includes('Land')) castNow(G, X.P, c, { free: true });
  } }));
  return d;
};

/* ============================================================ Green */
S['Elvish Rejuvenator'] = (d) => {
  d.etb = [fn((G, X) => {
    const P = X.P, top = P.library.splice(Math.max(0, P.library.length - 5)).reverse();
    if (!top.length) return;
    const lands = top.filter((c) => c.def.types.includes('Land'));
    const pick = lands.length ? (isHuman(G, P) ? pickSome(G, P, lands, 0, 1, 'You may put a land card onto the battlefield tapped', () => 1, 'library')[0] : lands[0]) : null;
    const rest = top.filter((c) => c !== pick);
    G.rng.shuffle(rest); P.library.unshift(...rest); dirty(G);
    if (pick) { emit(G, 'land', `${P.name} puts ${pick.def.name} onto the battlefield tapped.`, { who: P.i, card: pick.id }); enterBattlefield(G, P, pick, null, { tapped: true }); pick.tapped = true; }
  }, { score: () => 1.2 })];
  return d;
};
S['Colossal Majesty'] = (d) => { d.trig.push(T('upkeep', { you: true, cond: (G, src, ev, Q) => Q.bf.some((c) => isCreature(c) && pow(c) >= 4), eff: [{ k: 'draw', n: 1 }] })); return d; };
S['Deeproot Champion'] = (d) => { d.trig.push(castNC({ run: (G, X) => addCounters(G, X.src, 1) })); return d; };
S['Deeproot Elite'] = (d) => { d.trig.push(T('enter', { you: true, other: true, cond: (G, src, ev) => isCreature(ev.c) && hasSub(ev.c, 'Merfolk'), eff: [{ k: 'ctrs', n: 1, tgt: { f: { side: 'you', sub: 'Merfolk' } } }] })); return d; };
S['Druid of Horns'] = (d) => {
  d.trig.push(T('cast', { you: true, cond: (G, src, ev) => !!ev.card && ev.card.def.sub.includes('Aura') && allTargets(ev.item && ev.item.targets).some((t) => t.c === src), eff: [mkE(tok('Beast', 3, 3, ['G'], ['Beast']), 1)] }));
  return d;
};
S['Jade Bearer'] = (d) => { d.etb = [{ k: 'ctrs', n: 1, tgt: { f: { side: 'you', sub: 'Merfolk', other: true } } }]; return d; };
S['Jadelight Ranger'] = (d) => { d.etb = [fn((G, X) => { explore(G, X.P, X.src); explore(G, X.P, X.src); }, { score: () => 2 })]; return d; };
S['Knight of the Stampede'] = (d) => { d.spellDiscount = (G, P, card) => (card.def.sub.includes('Dinosaur') ? 2 : 0); return d; };
S['Path of Discovery'] = (d) => { d.trig.push(T('enter', { you: true, cond: (G, src, ev) => isCreature(ev.c), run: (G, X) => explore(G, X.P, X.ev.c) })); return d; };
S['River Heralds\' Boon'] = (d) => { d.spell = [{ k: 'ctrs', n: 1, tgt: tg({}) }, { k: 'ctrs', n: 1, tgt: tg({ sub: 'Merfolk' }, { min: 0 }) }]; return d; };
S['Saproling Migration'] = (d) => kicker(d, '{4}', { label: 'Create two Saprolings', eff: [mkE(SAPROLING, 2)] }, { label: 'Create four Saprolings', eff: [mkE(SAPROLING, 4)] });
S['Siegehorn Ceratops'] = (d) => { d.trig.push(enrage({ run: (G, X) => addCounters(G, X.src, 2) })); return d; };
S['Skalla Wolf'] = (d) => { d.etb = [lookFor(5, colorOf('G'), 'Put a green card into your hand')]; return d; };
S['Tendershoot Dryad'] = (d) => {
  d.ascend = true;
  d.trig.push(T('upkeep', { eff: [mkE(SAPROLING, 1)] }));
  d.statics.push({ who: 'all', f: { side: 'you', sub: 'Saproling' }, cond: (G, src) => !!G.players[src.ctrl].blessed, p: 2, t: 2, kw: [] });
  return d;
};
S['Thorn Lieutenant'] = (d) => {
  d.trig.push(T('targeted', { cond: (G, src, ev, Q) => ev.c === src && ev.by && ev.by !== Q, eff: [mkE(tok('Elf Warrior', 1, 1, ['G'], ['Elf', 'Warrior']), 1)] }));
  d.acts.push({ cost: { m: C('{5}{G}') }, label: '+4/+4 until end of turn', run: (G, X) => pump(G, X.src, 4, 4), when: ['blocks'], ai: (G, P, c) => (c.attacking || c.blocking ? { score: 2 } : null) });
  return d;
};
S['Verdant Force'] = (d) => { d.trig.push(T('upkeep', { eff: [mkE(SAPROLING, 1)] })); return d; };
S['Verdant Rebirth'] = (d) => {
  d.spell = [fn((G, X, t) => {
    const c = t && t.c; if (!c) return;
    dieGrant(G, c, (G2, X2) => { const card = X2.src, Q = G2.players[card.owner]; if (!Q.gy.includes(card)) return; Q.gy.splice(Q.gy.indexOf(card), 1); Q.hand.push(card); dirty(G2); emit(G2, 'raise', `${card.def.name} returns to ${Q.name}'s hand.`, { who: Q.i, cards: [card.id] }); }, 'When this creature dies, return it to its owner\'s hand');
  }, { tgt: tg(YOU), val: (G, P, c) => 0.3 + cv(c) * 0.1, label: 'Choose a creature' }), { k: 'draw', n: 1 }];
  return d;
};
S["Vivien's Jaguar"] = (d) => {
  d.gyActs = [{ cost: { m: C('{2}{G}') }, label: 'Return it to your hand', cond: (G, P) => hasPW(P, 'Vivien'), when: ['main2', 'end'], run: (G, X) => { X.P.gy.splice(X.P.gy.indexOf(X.src), 1); X.P.hand.push(X.src); dirty(G); emit(G, 'raise', `${X.P.name} returns ${X.src.def.name} to their hand.`, { who: X.P.i, cards: [X.src.id] }); }, ai: () => ({ score: 1 }) }];
  return d;
};

/* ============================================================ Gold and colorless */
S['Aerial Engineer'] = (d) => { d.statics.push({ who: 'self', cond: (G, src) => hasArt(G.players[src.ctrl]), p: 2, t: 0, kw: ['flying'] }); return d; };
S['Brawl-Bash Ogre'] = (d) => {
  d.trig.push(T('attack', { self: true, run: (G, X) => {
    const P = X.P, cs = P.bf.filter((c) => isCreature(c) && c !== X.src);
    if (!cs.length) return;
    const fodder = cs.slice().sort((a, b) => pv(G, a) - pv(G, b))[0];
    const want = isHuman(G, P) ? yesNo(G, P, X.src, 'Sacrifice another creature for +2/+2?', false) : fodder.token && pv(G, fodder) < 1.5;
    if (!want) return;
    const c = isHuman(G, P) ? pickOne(G, P, cs, 'Sacrifice a creature', (x) => -pv(G, x)) : fodder;
    emit(G, 'sac', `${P.name} sacrifices ${c.def.name}.`, { who: P.i, cards: [c.id] });
    sacrifice(G, P, c, true);
    pump(G, X.src, 2, 2);
  } }));
  return d;
};
S['Enigma Drake'] = (d) => { d.powFn = (G, c) => G.players[c.ctrl].gy.filter((x) => isIS(x.def)).length; return d; };
S['Gearsmith Guardian'] = (d) => { d.statics.push({ who: 'self', cond: (G, src) => controls(G.players[src.ctrl], (c) => isCreature(c) && c.def.colors.includes('U')), p: 2, t: 0, kw: [] }); return d; };
S['Diamond Mare'] = (d) => {
  d.etb = [fn((G, X) => chooseColor(G, X.P, X.src), { score: () => 0.1 })];
  d.trig.push(T('cast', { you: true, cond: (G, src, ev) => !!src.mem.color && !!ev.card && ev.card.def.colors.includes(src.mem.color), run: (G, X) => gain(G, X.P, 1) }));
  return d;
};
S['Hostage Taker'] = (d) => {
  d.etb = [fn((G, X, t) => {
    const c = t && t.c; if (!c || !onBf(G, c)) return;
    exileUntil(G, X.P, X.src, c);
    if (!c.token) X.P.xcast.push({ card: c, until: Infinity, anyType: true, cond: (G2, P2, x) => G2.players.some((Q) => Q.exile.includes(x.card)) });
  }, { tgt: { f: { types: ['Artifact', 'Creature'], other: true } }, val: (G, P, c) => (c.ctrl === P.i ? -pv(G, c) - 2 : pv(G, c) + 1), label: 'Exile another creature or artifact' })];
  d.role = 'removal';
  return holdUntilLeaves(d);
};
S['Kumena, Tyrant of Orazca'] = (d) => {
  const mer = (x) => hasSub(x, 'Merfolk');
  d.acts.push({ cost: { tapCre: 1, tapCreF: mer }, label: "Kumena can't be blocked this turn", when: ['main1'], run: (G, X) => { X.src.tf.unblockable = true; dirty(G); say(G, X.P, `${X.src.def.name} can't be blocked this turn.`, [X.src.id]); },
    ai: (G, P, c) => (!c.tf.unblockable && !c.tapped && !c.sick && P.bf.some((x) => x !== c && mer(x) && isCreature(x) && !x.tapped && x.sick) ? { score: 0.9 } : null) });
  d.acts.push({ cost: { tapCre: 3, tapCreF: mer }, label: 'Draw a card', eff: [{ k: 'draw', n: 1 }], when: ['end'], ai: () => ({ score: 1.2 }) });
  d.acts.push({ cost: { tapCre: 5, tapCreF: mer }, label: 'A +1/+1 counter on each Merfolk you control', run: (G, X) => ctrEach(G, X.P.bf.filter((c) => isCreature(c) && mer(c)), 1), when: ['end'], ai: (G, P) => ({ score: P.bf.filter((c) => isCreature(c) && mer(c)).length * 0.9 }) });
  return d;
};
S['Satyr Enchanter'] = (d) => { d.trig.push(T('cast', { you: true, cond: (G, s, ev) => !!ev.card && ev.card.def.types.includes('Enchantment'), eff: [{ k: 'draw', n: 1 }] })); return d; };
S['Slimefoot, the Stowaway'] = (d) => {
  d.trig.push(T('die', { you: true, cond: (G, src, ev) => (ev.sub || []).includes('Saproling'), run: (G, X) => { hitOpp(G, X, 1); gain(G, X.P, 1); } }));
  d.acts.push({ cost: { m: C('{4}') }, label: 'Create a 1/1 Saproling', eff: [mkE(SAPROLING, 1)], when: ['end'], ai: () => ({ score: 1.2 }) });
  return d;
};

return S;
});
