/* Magic: The Gathering FINAL FANTASY (FIN): rules for the cards whose text the engine's reader can't handle on its own.
   Each entry gets the card's skeleton (types, cost, keywords, equip, job select, flashback, crew and cycling lines already
   read) and fills in the rest from the engine's shared vocabulary of effects and triggers. Double-faced cards have an entry
   for each face; the engine turns them over (transform) and remembers both. */
(function (root, factory) {
  const A = typeof module === 'object' && module.exports ? require('./engine.js') : root.Arena;
  const S = factory(A);
  A.registerScripts(S);
  if (typeof module === 'object' && module.exports) module.exports = S;
})(typeof self !== 'undefined' ? self : this, function (A) {
'use strict';
const L = A.lib;
const { fx, isCreature, isLand, isArtifact, isEnchantment, isLegendary, pow, tou, has, hasSub, ctrCount, equipmentOn, attach, emit, dirty, onBf, byId, cv, pv,
  allCreatures, allPerms, other, diedThisTurn, makeTokens, TREASURE, FOOD, addCounters, removeCounters, sacrifice, drawCards, gainLife, chooseMode, yesNo, pickCards,
  isHuman, mill, lifeW, handValue, canPay, pay, matches, transform, blink, surveil, destroyPermanent, exilePermanent, bounceCard, gainControl, putOntoBattlefield,
  enterBattlefield, searchLibrary, dealDamage, damageCreature, legendsOf, sgn, nameList, discardChoice, ctrlOf, costMV, targetList, isIS, chooseNumber } = L;

/* ---------- Shorthand ---------- */
const C = (s) => L.parseCost(s);
const T = (on, o) => Object.assign({ on }, o);
const fn = (run, o) => Object.assign({ k: 'fn', run }, o);
const tg = (f, o) => Object.assign({ f: f || {} }, o);
const YOU = { side: 'you' }, OPP = { side: 'opp' };
const myTurn = (G, src) => G.active === src.ctrl;
const nonCre = (ev) => !ev.card.def.types.includes('Creature');
const spent = (ev) => ev.spent || 0;
const tcs = (t) => targetList(t).map((x) => x.c).filter(Boolean);
const isEquip = (c) => hasSub(c, 'Equipment');
const nArt = (P) => P.bf.filter(isArtifact).length;
const nCre = (P) => P.bf.filter(isCreature).length;
const nEquip = (P) => P.bf.filter(isEquip).length;
const nTowns = (P) => P.bf.filter((c) => hasSub(c, 'Town')).length;
const permCard = (d) => !d.types.includes('Instant') && !d.types.includes('Sorcery');
const gyPerms = (P) => P.gy.filter((c) => permCard(c.def)).length;
const say = (G, P, text, cards) => emit(G, 'info', text, { who: P.i, cards });
const drawN = (G, P, n) => { if (n <= 0) return; drawCards(G, P, n); emit(G, 'draw', `${P.name} draws ${n === 1 ? 'a card' : `${n} cards`}.`, { who: P.i }); };
const loseLife = (G, Q, n, who) => { if (n <= 0) return; Q.life -= n; emit(G, 'life', `${Q.name} loses ${n} life.`, { who: who != null ? who : Q.i, target: `p${Q.i}`, amount: n }); };
const gain = (G, P, n) => { if (n <= 0) return; const b = P.life; gainLife(G, P, n); const got = P.life - b; if (got > 0) emit(G, 'life', `${P.name} gains ${got} life.`, { who: P.i, target: `p${P.i}`, amount: -got }); };
const pump = (G, c, p, t, kws = []) => { if (!onBf(G, c)) return; c.tp += p; c.tt += t; kws.forEach((k) => { if (!c.tkw.includes(k)) c.tkw.push(k); }); dirty(G); emit(G, 'pump', `${c.def.name} gets ${sgn(p)}/${sgn(t)}${kws.length ? ` and gains ${kws.join(' and ')}` : ''} until end of turn.`, { who: c.ctrl, cards: [c.id] }); };
const grantKw = (G, c, kws, text) => { if (!onBf(G, c)) return; kws.forEach((k) => { if (!c.tkw.includes(k)) c.tkw.push(k); }); dirty(G); emit(G, 'pump', `${c.def.name} ${text || `gains ${kws.join(' and ')} until end of turn`}.`, { who: c.ctrl, cards: [c.id] }); };
// Damage from a source to a player or creature (lifelink, protection and the damage doublers apply)
const hit = (G, X, to, n, src) => dealDamage(G, Object.assign({}, X, { src: src || X.src }), to.def ? { c: to } : to, n);
const hitOpp = (G, X, n, src) => hit(G, X, { p: X.O.i }, n, src);
const ctx0 = (G, P) => ({ P, O: other(G, P), src: null, ev: {} });
// Pick one card: a human chooses, the AI takes the best by `score`
function pickOne(G, P, cards, label, score, reason = 'choose') {
  if (!cards.length) return null;
  if (cards.length === 1) return cards[0];
  if (isHuman(G, P)) return pickCards(G, { type: 'choose', reason, n: 1, min: 1, max: 1, zone: onBf(G, cards[0]) ? 'battlefield' : 'graveyard', cards: cards.map((c) => c.id), label }, cards, 1)[0];
  return cards.slice().sort((a, b) => score(b) - score(a) || a.id - b.id)[0];
}
function pickSome(G, P, cards, min, max, label, score, zone, reason = 'choose') {
  max = Math.min(max, cards.length);
  if (max <= 0) return [];
  if (isHuman(G, P)) return pickCards(G, { type: 'choose', reason, n: max, min: Math.min(min, max), max, zone: zone || 'battlefield', cards: cards.map((c) => c.id), label }, cards, null).slice(0, max);
  const ranked = cards.slice().sort((a, b) => score(b) - score(a) || a.id - b.id);
  return ranked.filter((c, k) => k < min || (k < max && score(c) > 0));
}
// Look at the top n cards; up to k that match go to hand; the rest go to the bottom in a random order (or the graveyard)
function lookTake(G, P, n, pred, k, why, rest = 'bottom') {
  const top = P.library.splice(Math.max(0, P.library.length - n)).reverse();
  if (!top.length) return [];
  const ok = top.filter(pred);
  const take = pickSome(G, P, ok, 0, k, why, (c) => c.def.value + 1, 'library', 'look');
  const others = top.filter((c) => !take.includes(c));
  P.hand.push(...take);
  if (rest === 'gy') P.gy.push(...others); else { G.rng.shuffle(others); P.library.unshift(...others); }
  dirty(G);
  emit(G, 'search', `${P.name} looks at the top ${top.length === 1 ? 'card' : `${top.length} cards`}${take.length ? ` and takes ${nameList(take)}` : ''}${others.length && rest === 'gy' ? `; ${nameList(others)} go${others.length === 1 ? 'es' : ''} to the graveyard` : ''}.`, { who: P.i, cards: take.map((c) => c.id) });
  return take;
}
function mk(G, P, spec, n, o = {}) {
  if (n <= 0) return [];
  const made = makeTokens(G, P, spec, n, { quiet: true, tapped: o.tapped });
  emit(G, 'token', `${P.name} creates ${n === 1 ? `a ${spec.name} token` : `${n} ${spec.name} tokens`}${o.tapped ? ', tapped' : ''}.`, { who: P.i, cards: made.map((c) => c.id) });
  return made;
}
const tokVal = (s) => (s.p != null ? s.p + s.t * 0.6 + 0.3 + (s.kw || []).length * 0.4 + (s.trig ? 0.8 : 0) : 1);
const mkE = (spec, n = 1, o = {}) => fn((G, X) => mk(G, X.P, spec, typeof n === 'function' ? n(G, X) : n, o), {
  score: (G, P, X) => (typeof n === 'function' ? n(G, X || ctx0(G, P)) : n) * tokVal(spec) * (o.tapped ? 0.8 : 1), value: (typeof n === 'number' ? n : 2) * tokVal(spec) });
// Tokens
const tokSpec = (name, p, t, colors, sub, kw = [], extra = {}) => Object.assign({ id: `fin-${name.toLowerCase().replace(/[^a-z]+/g, '-')}-${p}-${t}`, name, p, t, colors, sub, kw }, extra);
const HERO = tokSpec('Hero', 1, 1, [], ['Hero']);
const KNIGHT = tokSpec('Knight', 2, 2, ['W'], ['Knight']);
const HORROR = tokSpec('Horror', 2, 2, ['B'], ['Horror']);
const MOOGLE = tokSpec('Moogle', 1, 2, ['W'], ['Moogle'], ['lifelink']);
const FROG = tokSpec('Frog', 1, 1, ['G'], ['Frog']);
const ROBOT = tokSpec('Robot Warrior', 3, 3, ['U'], ['Robot', 'Warrior'], [], { artifact: true });
const ELEMENTAL = tokSpec('Elemental', 2, 2, ['W', 'U', 'B', 'R', 'G'], ['Elemental']);
const ANGELO = tokSpec('Angelo', 1, 1, ['G', 'W'], ['Dog'], [], { legendary: true });
const DARKSTAR = tokSpec('Darkstar', 2, 2, ['W', 'B'], ['Dog'], [], { legendary: true });
const WIZARD = tokSpec('Wizard', 0, 1, ['B'], ['Wizard'], [], { text: 'Whenever you cast a noncreature spell, this token deals 1 damage to each opponent.',
  trig: [T('cast', { you: true, cond: (G, s, ev) => nonCre(ev), run: (G, X) => hitOpp(G, X, 1) })] });
const BIRD = tokSpec('Bird', 2, 2, ['G'], ['Bird'], [], { text: 'Whenever a land you control enters, this token gets +1/+0 until end of turn.',
  trig: [T('landfall', { you: true, run: (G, X) => pump(G, X.src, 1, 0) })] });
// Shared abilities
const castNC = (min, o) => T('cast', Object.assign({ you: true, cond: (G, src, ev) => nonCre(ev) && spent(ev) >= min }, o));
// "{cost}: Exile this, then return it to the battlefield transformed under its owner's control. Activate only as a sorcery."
const blinkT = (cost, label, score = 3) => ({ cost: { m: C(cost) }, sorcery: true, label: label || 'Exile it, then return it transformed',
  eff: [fn((G, X) => blink(G, X.src, { transformed: true }), { score: () => score })], ai: () => ({ score }) });
const transformE = (o) => fn((G, X) => transform(G, X.src), Object.assign({ score: () => 2 }, o));
const discountFor = (color) => (G, P, card) => (card.def.colors.includes(color) ? 1 : 0);
// Mana for The Crystal cycle and others
const anyOf = (cols, o) => Object.assign({ colors: cols }, o);
// Choose a player's creature to sacrifice (their choice: the AI gives up its least valuable)
function edictOf(G, Q, f, why) {
  const cs = Q.bf.filter((c) => (f ? f(c) : isCreature(c)));
  if (!cs.length) return null;
  const c = L.sacrificeChoice(G, Q, cs);
  emit(G, 'sac', `${Q.name} sacrifices ${c.def.name}${why ? ` (${why})` : ''}.`, { who: Q.i, cards: [c.id] });
  sacrifice(G, Q, c, true);
  return c;
}
const S = {};

/* ============================ White ============================ */
S['Summon: Bahamut'] = (d) => {
  d.saga = [
    { ch: [1, 2], eff: [{ k: 'destroyP', tgt: { f: { types: ['nonland'] }, min: 0 } }] },
    { ch: [3], eff: fx('Draw two cards.') },
    { ch: [4], eff: [fn((G, X) => hitOpp(G, X, X.P.bf.filter((c) => c !== X.src).reduce((s, c) => s + (c.def.mv || 0), 0)), { score: (G, P) => P.bf.reduce((s, c) => s + (c.def.mv || 0), 0) * 0.5 })] },
  ];
  return d;
};
S['Ultima, Origin of Oblivion'] = (d) => {
  d.trig.push(T('attack', { self: true, eff: [fn((G, X, t) => { const c = t && t.c; if (c && onBf(G, c)) { addCounters(G, c, 1, 'blight'); dirty(G); } },
    { tgt: { f: { types: ['Land'] } }, val: (G, P, c) => (c.ctrl === P.i ? -1 : ctrCount(c, 'blight') ? 0.05 : (c.def.mana || []).filter((x) => x !== 'C').length * 0.4 + 0.2), label: 'Put a blight counter on a land' })] }));
  d.cBoost = true;
  return d;
};
S['Adelbert Steiner'] = (d) => {
  d.statics.push({ who: 'self', p: 0, t: 0, kw: [], pFn: (G, s) => nEquip(G.players[s.ctrl]), tFn: (G, s) => nEquip(G.players[s.ctrl]) });
  return d;
};
S['Aerith Gainsborough'] = (d) => {
  d.onGain = [{ k: 'countersSelf', n: 1 }];
  d.trig.push(T('die', { self: true, run: (G, X) => { const n = X.ev.cnt || 0; if (n > 0) for (const c of legendsOf(X.P)) addCounters(G, c, n); } }));
  return d;
};
S['Aerith Rescue Mission'] = (d) => {
  d.modes = [
    { label: 'Create three 1/1 Hero tokens', eff: [mkE(HERO, 3)] },
    { label: 'Tap up to three creatures; one gets a stun counter', eff: [fn((G, X, t) => {
      const cs = tcs(t).filter((c) => onBf(G, c));
      cs.forEach((c) => { c.tapped = true; });
      if (cs.length) emit(G, 'tapfx', `${nameList(cs)} ${cs.length > 1 ? 'are' : 'is'} tapped.`, { who: X.P.i, cards: cs.map((c) => c.id) });
      const s = pickOne(G, X.P, cs, 'Put a stun counter on one of them', (c) => (c.ctrl === X.P.i ? -cv(c) : cv(c)));
      if (s) addCounters(G, s, 1, 'stun');
    }, { tgt: { f: {}, n: 3, min: 0 }, val: (G, P, c) => (c.ctrl === P.i ? -0.6 : c.tapped ? 0.2 : cv(c) * 0.35), label: 'Tap up to three creatures' })] },
  ];
  d.spell = null;
  return d;
};
S['Ambrosia Whiteheart'] = (d) => {
  d.etb = [fn((G, X, t) => { const c = t && t.c; if (c && onBf(G, c) && c !== X.src) bounceCard(G, X.P, c); },
    { tgt: { f: { types: ['any'], side: 'you' }, other: true, min: 0 }, val: (G, P, c) => (!isLand(c) && !c.token && c.def.etb.length && c.def.mv <= 4 ? 0.4 + c.def.mv * 0.15 : -2), label: 'Return another permanent you control to its owner\'s hand' })];
  d.landfall = [{ k: 'pumpSelf', p: 1, t: 0 }];
  return d;
};
S['Ashe, Princess of Dalmasca'] = (d) => {
  d.trig.push(T('attack', { self: true, run: (G, X) => lookTake(G, X.P, 5, (c) => isArtifact({ def: c.def }), 1, 'Put an artifact card into your hand') }));
  return d;
};
S["Auron's Inspiration"] = (d) => {
  d.spell = [{ k: 'pumpAll', p: 2, t: 0, kw: [], f: { attacking: true } }];
  d.castIf = (G, P) => G.combat && G.active === P.i && P.bf.some((c) => c.attacking);
  return d;
};
S['Battle Menu'] = (d) => {
  d.modes = [
    { label: 'Attack: create a 2/2 Knight', eff: fx('Create a 2/2 white Knight creature token.') },
    { label: 'Ability: a creature gets +0/+4', eff: fx('Target creature gets +0/+4 until end of turn.') },
    { label: 'Magic: destroy a creature with power 4 or greater', eff: fx('Destroy target creature with power 4 or greater.') },
    { label: 'Item: gain 4 life', eff: fx('You gain 4 life.') },
  ];
  d.spell = null;
  return d;
};
S['Cloud, Midgar Mercenary'] = (d) => {
  d.etb = [{ k: 'tutor', f: { types: ['Equipment'] }, to: 'hand' }];
  d.cloudEcho = true;
  return d;
};
S['Coeurl'] = (d) => {
  d.acts.push({ cost: { m: C('{1}{W}'), tap: true }, eff: [{ k: 'tapP', tgt: { f: { fn: (G, c) => !isEnchantment(c) } } }], label: 'Tap a nonenchantment creature', when: ['main1', 'end'],
    ai: (G, P, c, when) => {
      const O = other(G, P);
      const foes = O.bf.filter((x) => isCreature(x) && !x.tapped && !isEnchantment(x));
      if (!foes.length) return null;
      const best = foes.sort((a, b) => cv(b) - cv(a))[0];
      if (when === 'main1' && G.active === P.i) return { score: 0.4 + cv(best) * 0.3, targets: [{ c: best }] };
      return null;
    } });
  return d;
};
S['Crystal Fragments'] = (d) => { d.acts.push(blinkT('{5}{W}{W}', 'Become Summon: Alexander')); return d; };
S['Summon: Alexander'] = (d) => {
  d.saga = [
    { ch: [1, 2], eff: [fn((G, X) => { X.P.shieldTurn = G.turn; say(G, X.P, `Damage to ${X.P.name}'s creatures is prevented this turn.`); }, { score: () => 0.8 })] },
    { ch: [3], eff: [fn((G, X) => { const cs = X.O.bf.filter(isCreature); cs.forEach((c) => { c.tapped = true; }); if (cs.length) emit(G, 'tapfx', `${X.O.name}'s creatures are tapped.`, { who: X.P.i, cards: cs.map((c) => c.id) }); }, { score: (G, P) => other(G, P).bf.filter(isCreature).length * 0.8 })] },
  ];
  return d;
};
S["The Crystal's Chosen"] = (d) => {
  d.spell = [mkE(HERO, 4), fn((G, X) => { for (const c of X.P.bf.filter(isCreature)) addCounters(G, c, 1); }, { score: (G, P) => (nCre(P) + 4) * 0.8 })];
  return d;
};
S['Delivery Moogle'] = (d) => {
  d.etb = [fn((G, X) => {
    const P = X.P;
    const ok = (c) => c.def.types.includes('Artifact') && c.def.mv <= 2;
    const pool = P.library.filter(ok).concat(P.gy.filter(ok));
    if (!pool.length) return;
    const c = pickOne(G, P, L.uniqueByName(pool), 'Put an artifact card into your hand', (x) => x.def.value);
    if (!c) return;
    const fromLib = P.library.includes(c);
    L.removeFromZones(G, c);
    P.hand.push(c);
    if (fromLib) G.rng.shuffle(P.library);
    emit(G, 'search', `${P.name} puts ${c.def.name} into their hand.`, { who: P.i, cards: [c.id] });
  }, { score: () => 1.2 })];
  return d;
};
S["Dion, Bahamut's Dominant"] = (d) => {
  d.statics.push({ who: 'all', f: { side: 'you', fn: (G, c, P, src) => c === src || hasSub(c, 'Knight') }, cond: myTurn, p: 0, t: 0, kw: ['flying'] });
  d.etb = [mkE(KNIGHT)];
  d.acts.push(Object.assign(blinkT('{4}{W}{W}', 'Become Bahamut, Warden of Light'), { cost: { m: C('{4}{W}{W}'), tap: true } }));
  return d;
};
S['Bahamut, Warden of Light'] = (d) => {
  d.saga = [
    { ch: [1, 2], eff: [fn((G, X) => { for (const c of X.P.bf.filter((x) => isCreature(x) && x !== X.src)) { addCounters(G, c, 1); grantKw(G, c, ['flying']); } }, { score: (G, P) => (nCre(P) - 1) * 1.1 })] },
    { ch: [3], eff: [{ k: 'destroyP', tgt: { f: { types: ['any'] } } }, fn((G, X) => blink(G, X.src), { score: () => 0.5 })] },
  ];
  return d;
};
S["Dragoon's Lance"] = (d) => { d.statics.push({ who: 'equipped', p: 0, t: 0, kw: ['flying'], cond: myTurn }); return d; };
S['Fate of the Sun-Cryst'] = (d) => {
  d.spell = [{ k: 'destroyP', tgt: { f: { types: ['nonland'] }, fn: (G, P, c, src, X) => !(X && X.cheapOnly) || (isCreature(c) && c.tapped) } }];
  d.costMod = (G, P, card, tgs) => (tgs.some((t) => t && t.c && t.c.tapped && isCreature(t.c)) ? 2 : 0);
  d.role = 'removal';
  return d;
};
S['From Father to Son'] = (d) => {
  d.spell = [fn((G, X) => {
    const gy = X.item && X.item.fromGy;
    const got = searchLibrary(G, X.P, (c) => hasSub(c, 'Vehicle'), 1, gy ? 'bf' : 'hand', 'a Vehicle');
    emit(G, 'search', got.length ? `${X.P.name} finds ${got[0].def.name}${gy ? ' and puts it onto the battlefield' : ''}.` : `${X.P.name} finds no Vehicle.`, { who: X.P.i, cards: got.map((c) => c.id) });
  }, { score: (G, P) => (P.library.some((c) => hasSub(c, 'Vehicle')) ? 1.5 : -1) })];
  return d;
};
S["G'raha Tia"] = (d) => {
  d.trig.push(T('toGy', { you: true, other: true, once: true, cond: (G, src, ev) => !!ev.c && (ev.c.def.types.includes('Creature') || ev.c.def.types.includes('Artifact')), eff: fx('Draw a card.') }));
  return d;
};
S['Gaelicat'] = (d) => { d.statics.push({ who: 'self', p: 2, t: 0, kw: [], cond: (G, s) => nArt(G.players[s.ctrl]) >= 2 }); return d; };
S["Machinist's Arsenal"] = (d) => {
  d.statics.push({ who: 'equipped', p: 0, t: 0, kw: [], pFn: (G, s) => 2 * nArt(G.players[s.ctrl]), tFn: (G, s) => 2 * nArt(G.players[s.ctrl]), addSub: ['Artificer'] });
  return d;
};
S['Magitek Infantry'] = (d) => {
  d.statics.push({ who: 'self', p: 1, t: 0, kw: [], cond: (G, s) => G.players[s.ctrl].bf.some((x) => x !== s && isArtifact(x)) });
  d.acts.push({ cost: { m: C('{2}{W}') }, eff: [{ k: 'tutor', f: { fn: (dd) => dd.name === 'Magitek Infantry' }, to: 'bfTapped' }], label: 'Search for another Magitek Infantry', when: ['main2', 'end'],
    ai: (G, P) => (P.library.some((c) => c.def.name === 'Magitek Infantry') ? { score: 1.5 } : null) });
  return d;
};
S['Minwu, White Mage'] = (d) => {
  d.trig.push(T('gain', { you: true, run: (G, X) => { for (const c of X.P.bf.filter((x) => isCreature(x) && hasSub(x, 'Cleric'))) addCounters(G, c, 1); } }));
  return d;
};
S["Moogles' Valor"] = (d) => {
  d.spell = [fn((G, X) => {
    mk(G, X.P, MOOGLE, nCre(X.P));
    for (const c of X.P.bf.filter(isCreature)) if (!c.tkw.includes('indestructible')) c.tkw.push('indestructible');
    dirty(G);
    say(G, X.P, `${X.P.name}'s creatures gain indestructible until end of turn.`);
  }, { score: (G, P, X, ctx) => nCre(P) * 1.3 + (ctx === 'combat' ? P.bf.filter((c) => c.attacking || c.blocking).length : 0) })];
  return d;
};
S["Paladin's Arms"] = (d) => { d.statics.push({ who: 'equipped', p: 2, t: 1, kw: [], ward: 1, addSub: ['Knight'] }); return d; };
S['Phoenix Down'] = (d) => {
  const cost = { m: C('{1}{W}'), tap: true, exileSelfBf: true };
  d.acts.push({ cost, eff: [{ k: 'regrow', to: 'bfTapped', tgt: { what: 'gy', mine: true, f: { types: ['Creature'], mvLE: 4 } } }], label: 'Return a creature card (mana value 4 or less) to the battlefield tapped', when: ['main2', 'end'] });
  d.acts.push({ cost, eff: [{ k: 'exileP', tgt: { f: { subs: ['Skeleton', 'Spirit', 'Zombie'] } } }], label: 'Exile a Skeleton, Spirit or Zombie' });
  return d;
};
const shield = (G, c) => grantKw(G, c, ['hexproof', 'indestructible']);
S['Restoration Magic'] = (d) => {
  const protect = { tgt: { f: { types: ['any'] } }, val: (G, P, c, X, ctx) => (c.ctrl !== P.i ? -1 : (ctx === 'combat' || ctx === 'trigger') && (c.blocking || c.attacking) ? cv(c) * 0.5 : 0.1), label: 'Give a permanent hexproof and indestructible' };
  d.modes = [
    { label: 'Cure', eff: [fn((G, X, t) => t && t.c && shield(G, t.c), protect)] },
    { label: 'Cura (+{1})', cost: C('{1}'), eff: [fn((G, X, t) => t && t.c && shield(G, t.c), protect), { k: 'gain', n: 3 }] },
    { label: 'Curaga (+{3}{W})', cost: C('{3}{W}'), eff: [fn((G, X) => { for (const c of X.P.bf) { c.tkw.push('hexproof', 'indestructible'); } dirty(G); say(G, X.P, `${X.P.name}'s permanents gain hexproof and indestructible until end of turn.`); gain(G, X.P, 6); }, { score: (G, P) => 3 + lifeW(P) * 6 })] },
  ];
  d.spell = null;
  // Cast in answer to a spell that would remove one of your permanents
  d.respond = {
    legal: (G, O, item) => item.P !== O && L.allTargets(item.targets).some((t) => t.c && t.c.ctrl === O.i && onBf(G, t.c)),
    ai: (G, O, item) => { const mine = L.allTargets(item.targets).map((t) => t.c).filter((c) => c && c.ctrl === O.i && onBf(G, c)); return mine.length ? Math.max(...mine.map((c) => cv(c))) + 1 : 0; },
    res: (G, O, item) => { for (const t of L.allTargets(item.targets)) if (t.c && t.c.ctrl === O.i && onBf(G, t.c)) shield(G, t.c); return false; },
  };
  return d;
};
S['Sidequest: Catch a Fish'] = (d) => {
  d.trig.push(T('upkeep', { you: true, run: (G, X) => {
    const P = X.P, top = P.library[P.library.length - 1];
    if (!top) return;
    const ok = top.def.types.includes('Artifact') || top.def.types.includes('Creature');
    say(G, P, `${P.name} looks at the top card of their library${ok ? `: ${top.def.name}` : ''}.`);
    if (!ok || !yesNo(G, P, X.src, `Put ${top.def.name} into your hand?`, true)) return;
    P.library.pop(); P.hand.push(top);
    emit(G, 'search', `${P.name} reveals ${top.def.name} and puts it into their hand.`, { who: P.i, cards: [top.id] });
    mk(G, P, FOOD, 1);
    transform(G, X.src);
  } }));
  return d;
};
S['Cooking Campsite'] = (d) => {
  d.mana = ['W'];
  d.acts.push({ cost: { m: C('{3}'), tap: true, sac: { types: ['Artifact'] } }, sorcery: true, label: 'Put a +1/+1 counter on each creature you control',
    eff: [fn((G, X) => { for (const c of X.P.bf.filter(isCreature)) addCounters(G, c, 1); }, { score: (G, P) => nCre(P) * 0.9 - 1 })] });
  return d;
};
S['Slash of Light'] = (d) => {
  d.spell = [{ k: 'dmgX', nFn: (G, X) => nCre(X.P) + nEquip(X.P), tgt: { f: {} } }];
  d.role = 'removal';
  return d;
};
S['Snow Villiers'] = (d) => {
  d.power = 0;
  d.statics.push({ who: 'self', p: 0, t: 0, kw: [], pFn: (G, s) => nCre(G.players[s.ctrl]) });
  return d;
};
S['Stiltzkin, Moogle Merchant'] = (d) => {
  d.acts.push({ cost: { m: C('{2}'), tap: true }, label: 'Give an opponent another permanent you control; draw a card',
    eff: [fn((G, X, t) => { const c = t && t.c; if (!c || !onBf(G, c)) return; gainControl(G, X.O, c, 'perm'); if (c.ctrl === X.O.i) drawN(G, X.P, 1); },
      { tgt: { f: { types: ['any'], side: 'you' }, other: true }, val: (G, P, c) => (isLand(c) && P.bf.filter(isLand).length >= 8 && P.hand.length <= 1 ? 0.8 : c.token && !isCreature(c) && !hasSub(c, 'Treasure') ? 0.3 : -3), label: 'Give away another permanent you control' })],
    when: ['main2', 'end'] });
  return d;
};
S['Summon: Choco/Mog'] = (d) => {
  d.saga = [{ ch: [1, 2, 3, 4], eff: [{ k: 'pumpAll', side: 'you', p: 1, t: 0, kw: [], f: { other: true } }] }];
  return d;
};
S['Summon: Knights of Round'] = (d) => {
  d.saga = [
    { ch: [1, 2, 3, 4], eff: [mkE(KNIGHT, 3)] },
    { ch: [5], eff: [fn((G, X) => { for (const c of X.P.bf.filter((x) => isCreature(x) && x !== X.src)) { c.tp += 2; c.tt += 2; addCounters(G, c, 1, 'indestructible', true); } dirty(G); say(G, X.P, `${X.P.name}'s other creatures get +2/+2 and an indestructible counter.`); }, { score: (G, P) => nCre(P) * 2 })] },
  ];
  return d;
};
S['Summon: Primal Garuda'] = (d) => {
  d.saga = [
    { ch: [1], eff: [{ k: 'dmgX', nFn: () => 4, tgt: { f: { side: 'opp', tapped: true } } }] },
    { ch: [2, 3], eff: [{ k: 'pumpT', p: 1, t: 0, kw: ['flying'], tgt: { f: YOU, other: true } }] },
  ];
  return d;
};
S['Ultima'] = (d) => {
  d.spell = [{ k: 'destroyAll', f: { types: ['Artifact', 'Creature'] } }, fn((G, X) => { G.endTurn = true; say(G, X.P, 'The turn ends.'); }, { score: () => -0.5 })];
  return d;
};
S['Venat, Heart of Hydaelyn'] = (d) => {
  d.trig.push(T('cast', { you: true, once: true, cond: (G, src, ev) => ev.card.def.supertypes.includes('Legendary'), eff: fx('Draw a card.') }));
  d.acts.push({ cost: { m: C('{7}'), tap: true }, sorcery: true, label: 'Exile a nonland permanent and transform Venat',
    eff: [{ k: 'exileP', tgt: { f: { types: ['nonland'], side: 'opp' } } }, transformE()] });
  return d;
};
S['Hydaelyn, the Mothercrystal'] = (d) => {
  d.trig.push(T('combatStart', { you: true, eff: [fn((G, X, t) => {
    const c = t && t.c;
    if (!c || !onBf(G, c)) return;
    addCounters(G, c, 1);
    c.timedKw = (c.timedKw || []).concat({ kw: 'indestructible', until: G.turn + 2 });
    dirty(G);
    say(G, X.P, `${c.def.name} gains indestructible until ${X.P.name}'s next turn.`, [c.id]);
    if (isLegendary(c)) drawN(G, X.P, 1);
  }, { tgt: tg(YOU, { other: true }), val: (G, P, c) => cv(c) * 0.3 + (isLegendary(c) ? 1.2 : 0) + 0.8, label: 'Put a +1/+1 counter on another creature you control' })] }));
  return d;
};
S['Weapons Vendor'] = (d) => {
  d.trig.push(T('combatStart', { you: true, cond: (G, src, ev, Q) => Q.bf.some(isEquip), run: (G, X) => {
    const P = X.P;
    const eqs = P.bf.filter(isEquip), cs = P.bf.filter(isCreature);
    if (!eqs.length || !cs.length || !canPay(P, C('{1}'))) return;
    let pick = null;
    if (isHuman(G, P)) {
      if (!yesNo(G, P, X.src, 'Pay {1} to attach an Equipment?', true)) return;
      const eq = pickOne(G, P, eqs, 'Choose an Equipment to attach', () => 0);
      const to = pickOne(G, P, cs.filter((c) => c.id !== eq.att), `Attach ${eq.def.name} to`, () => 0);
      if (eq && to) pick = { eq, to };
    } else {
      for (const eq of eqs) for (const c of cs) { if (eq.att === c.id) continue; const s = L.equipGain(G, P, eq, c) - (eq.att != null && byId(G, eq.att) ? L.equipGain(G, P, eq, byId(G, eq.att)) : 0); if (s > 0.5 && (!pick || s > pick.s)) pick = { eq, to: c, s }; }
    }
    if (!pick || !pay(P, C('{1}'))) return;
    attach(G, pick.eq, pick.to);
  } }));
  return d;
};
S['White Auracite'] = (d) => {
  d.mana = ['W'];
  d.etb = [fn((G, X, t) => { if (t && t.c) L.exileUntil(G, X.P, X.src, t.c); }, { tgt: { f: { types: ['nonland'], side: 'opp' } }, val: (G, P, c) => pv(G, c) + 0.5, label: 'Exile a nonland permanent an opponent controls' })];
  d.trig.push(T('leave', { self: true, run: (G, X) => L.returnHeld(G, X.ev.mem) }));
  d.role = 'removal';
  return d;
};
S["White Mage's Staff"] = (d) => { d.trig.push(T('attack', { hostOnly: true, eff: fx('You gain 1 life.') })); return d; };
S['The Wind Crystal'] = (d) => {
  d.spellDiscount = discountFor('W');
  d.lifeDouble = true;
  d.acts.push({ cost: { m: C('{4}{W}{W}'), tap: true }, label: 'Creatures you control gain flying and lifelink', when: ['main1'],
    eff: [{ k: 'pumpAll', side: 'you', p: 0, t: 0, kw: ['flying', 'lifelink'] }], ai: (G, P) => { const n = P.bf.filter((c) => L.canAttackNow(G, c) && !has(c, 'flying')).length; return n >= 2 ? { score: n * 0.8 } : null; } });
  return d;
};
S["You're Not Alone"] = (d) => {
  const n = (G, X) => (nCre(X.P) >= 3 ? 4 : 2);
  d.spell = [{ k: 'pumpT', p: 2, t: 2, pFn: n, tFn: n, tgt: { f: {} } }];
  return d;
};
S['Zack Fair'] = (d) => {
  d.etbCtr = () => ({ '+1/+1': 1 });
  d.acts.push({ cost: { m: C('{1}'), sacSelf: true }, label: 'Give a creature indestructible and Zack\'s counters and Equipment', when: ['blocks', 'main1'],
    eff: [fn((G, X, t) => {
      const c = t && t.c;
      if (!c || !onBf(G, c)) return;
      grantKw(G, c, ['indestructible']);
      const z = X.self || {};
      if (z.cnt) addCounters(G, c, z.cnt);
      for (const [k, n] of Object.entries(z.ctr || {})) if (n > 0) addCounters(G, c, n, k);
      const eq = (z.eqs || []).find((x) => onBf(G, x));
      if (eq) attach(G, eq, c);
    }, { tgt: tg(YOU), val: (G, P, c, X, ctx) => (ctx === 'combat' && (c.attacking || c.blocking) ? cv(c) * 0.6 : 0.1), label: 'Choose a creature you control' })],
    ai: (G, P, c, when) => {
      if (when !== 'blocks') return null;
      const dying = allCreatures(G).filter((x) => x.ctrl === P.i && x !== c && (x.attacking || x.blocking) && x.dmg + 0 >= 0);
      const best = dying.sort((a, b) => cv(b) - cv(a))[0];
      return best && cv(best) > 3 ? { score: cv(best) * 0.4, targets: [{ c: best }] } : null;
    } });
  return d;
};


/* ============================ Blue ============================ */
// A token that's a copy of a permanent or card, with changes (mods.def overrides the copied characteristics)
function copyToken(G, P, src, mods = {}, o = {}) {
  const base = src.def || src;
  const def = Object.assign({}, base, { id: `${base.id}-copy-${G.nextId}`, token: true, front: null, back: null, adv: null, advOf: null, meldInto: null, isBack: false }, mods.def || {});
  if (mods.nonLegendary) def.supertypes = def.supertypes.filter((x) => x !== 'Legendary');
  G.defs[def.id] = def;
  const t = A._internal.newCard(G, def, P.i);
  t.token = true;
  enterBattlefield(G, P, t, null, { tapped: !!o.tapped });
  if (o.tapped) t.tapped = true;
  if (o.haste) grantKw(G, t, ['haste']);
  return t;
}
S["Astrologian's Planisphere"] = (d) => {
  d.statics.push({ who: 'equipped', p: 0, t: 0, kw: [], addSub: ['Wizard'] });
  const grow = (G, X) => { const h = X.src.att != null && byId(G, X.src.att); if (h) addCounters(G, h, 1); };
  d.trig.push(castNC(0, { cond: (G, src, ev) => nonCre(ev) && src.att != null, run: grow }));
  d.trig.push(T('draw', { you: true, cond: (G, src, ev) => ev.nth === 3 && src.att != null, run: grow }));
  return d;
};
S['Cargo Ship'] = (d) => {
  d.manaAbs = [{ colors: ['C'], only: (pu) => !!pu.def && pu.def.types.includes('Artifact') }];
  return d;
};
S['Combat Tutorial'] = (d) => {
  d.spell = [{ k: 'draw', n: 2 }, fn((G, X, t) => { if (t && t.c) addCounters(G, t.c, 1); }, { tgt: tg(YOU, { min: 0 }), val: (G, P, c) => 0.6 + cv(c) * 0.05, label: 'Put a +1/+1 counter on a creature you control' })];
  return d;
};
S['Edgar, King of Figaro'] = (d) => {
  d.etb = [fn((G, X) => drawN(G, X.P, nArt(X.P)), { score: (G, P) => nArt(P) * 1.1 })];
  d.coinHeads = true;
  return d;
};
S['Eject'] = (d) => {
  d.spell = [{ k: 'bounceP', tgt: { f: { types: ['nonland'] } } }, { k: 'draw', n: 1 }];
  return d;
};
S['Ether'] = (d) => {
  d.acts.push({ cost: { tap: true, exileSelfBf: true }, label: 'Add {U}; copy your next instant or sorcery this turn', when: ['main1', 'main2'],
    eff: [fn((G, X) => { L.addPool(G, X.P, ['U']); X.P.copyNext = { turn: G.turn, n: 1 }; say(G, X.P, `${X.P.name} adds {U}. The next instant or sorcery they cast this turn is copied.`); }, { score: () => 1 })],
    ai: (G, P) => (P.hand.some((c) => isIS(c.def) && c.def.mv >= 2 && canPay(P, Object.assign({}, c.def.cost, { g: Math.max(0, c.def.cost.g - 1) }))) ? { score: 1.6 } : null) });
  return d;
};
S['Gogo, Master of Mimicry'] = (d) => {
  // The engine resolves abilities at once, so Gogo copies the next ability of yours that resolves this turn
  d.acts.push({ cost: { m: Object.assign(C('{0}'), { x: 2 }), tap: true }, label: 'Copy your next ability this turn X times', minX: 1,
    eff: [fn((G, X) => { const n = Math.max(1, X.x || 1); X.P.echoNext = { turn: G.turn, n, src: X.src.id }; say(G, X.P, `The next ability ${X.P.name} activates or that triggers this turn is copied ${n === 1 ? 'once' : `${n} times`}.`); }, { score: () => 0.2 })], noAi: true });
  d.value = 1.5;
  return d;
};
S['Ice Flan'] = (d) => { d.etb = [{ k: 'tapP', stun: true, tgt: { f: { types: ['Artifact', 'Creature'], side: 'opp' } } }]; return d; };
S['Ice Magic'] = (d) => {
  const toLib = (how) => (G, X, t) => {
    const c = t && t.c;
    if (!c || !onBf(G, c)) return;
    const O = G.players[c.owner];
    const top = how === 'shuffle' ? false : chooseMode(G, O, X.src, `${c.def.name}: put it on top or bottom of your library?`, ['Top', 'Bottom'], 0) === 0;
    L.leaveBattlefield(G, c); L.resetCard(c);
    if (!c.token) { if (how === 'shuffle') { O.library.push(c); G.rng.shuffle(O.library); } else if (top) O.library.push(c); else O.library.unshift(c); }
    emit(G, 'bounce', `${c.def.name} goes into ${O.name}'s library${how === 'shuffle' ? ', which is shuffled' : top ? ' on top' : ' on the bottom'}.`, { who: X.P.i, cards: [c.id] });
    dirty(G);
  };
  const tgtOpp = { f: {} };
  const val = (k) => (G, P, c) => (c.ctrl === P.i ? -cv(c) : cv(c) * k);
  d.modes = [
    { label: 'Blizzard: return a creature to hand', eff: [{ k: 'bounceP', tgt: { f: {} } }] },
    { label: 'Blizzara (+{2}): a creature goes on top or bottom of its library', cost: C('{2}'), eff: [fn(toLib('topbottom'), { tgt: tgtOpp, val: val(0.85), label: 'Put a creature into its owner\'s library' })] },
    { label: 'Blizzaga (+{5}{U}): a creature is shuffled into its library', cost: C('{5}{U}'), eff: [fn(toLib('shuffle'), { tgt: tgtOpp, val: val(1), label: 'Shuffle a creature into its owner\'s library' })] },
  ];
  d.spell = null;
  d.role = 'removal';
  return d;
};
S["Jill, Shiva's Dominant"] = (d) => {
  d.etb = [{ k: 'bounceP', tgt: { f: { types: ['nonland'] }, other: true, min: 0 } }];
  d.acts.push(Object.assign(blinkT('{3}{U}{U}', 'Become Shiva, Warden of Ice'), { cost: { m: C('{3}{U}{U}'), tap: true } }));
  return d;
};
S['Shiva, Warden of Ice'] = (d) => {
  d.saga = [
    { ch: [1, 2], eff: [{ k: 'grant', flags: { unblockable: true }, say: "can't be blocked this turn", tgt: { f: YOU } }] },
    { ch: [3], eff: [fn((G, X) => { const ls = X.O.bf.filter(isLand); ls.forEach((c) => { c.tapped = true; }); emit(G, 'tapfx', `${X.O.name}'s lands are tapped.`, { who: X.P.i, cards: ls.map((c) => c.id) }); blink(G, X.src); }, { score: () => 2 })] },
  ];
  return d;
};
S["Louisoix's Sacrifice"] = (d) => {
  d.spell = [{ k: 'noop2' }];
  d.respondOnly = true;
  d.addCost = { sac: { legendary: true }, orPay: C('{2}'), legendBonus: 0 };
  const canExtra = (G, O) => O.bf.some((c) => isCreature(c) && isLegendary(c)) || canPay(O, C('{3}'));
  d.respond = {
    counter: true,
    legal: (G, O, item) => item.P !== O && !item.card.def.types.includes('Creature') && !item.card.def.uncounterable && canExtra(G, O),
    ai: (G, O, item) => L.threatOf(G, O, item),
    res: (G, O, item, cs) => {
      const legs = O.bf.filter((c) => isCreature(c) && isLegendary(c));
      const payOk = canPay(O, C('{2}'));
      let sac = null;
      if (legs.length && (!payOk || (isHuman(G, O) ? chooseMode(G, O, cs, `${cs.def.name}: pay the extra cost`, ['Sacrifice a legendary creature', 'Pay {2}'], 1) === 0 : false))) sac = pickOne(G, O, legs, 'Sacrifice a legendary creature', (c) => -cv(c));
      if (sac) { emit(G, 'sac', `${O.name} sacrifices ${sac.def.name}.`, { who: O.i, cards: [sac.id] }); sacrifice(G, O, sac, true); }
      else if (!pay(O, C('{2}'))) return false;
      const k = G.stack.indexOf(item);
      if (k >= 0) G.stack.splice(k, 1);
      removeSpell(G, item);
      emit(G, 'countered', `${item.card.def.name} is countered.`, { who: O.i, cards: [item.card.id] });
      return true;
    },
  };
  return d;
};
S['The Lunar Whale'] = (d) => {
  d.trig.push(T('attack', { self: true, run: (G, X) => { X.src.mem.atk = G.turn; } }));
  d.topCast = (G, P, card, src) => src.mem.atk === G.turn;
  d.topLand = (G, P, card, src) => src.mem.atk === G.turn;
  return d;
};
S['Matoya, Archon Elder'] = (d) => { d.trig.push(T('scry', { you: true, eff: fx('Draw a card.') })); return d; };
S['Memories Returning'] = (d) => {
  d.spell = [fn((G, X) => {
    const P = X.P, O = X.O;
    const pile = P.library.splice(Math.max(0, P.library.length - 5)).reverse();
    if (!pile.length) return;
    emit(G, 'search', `${P.name} reveals ${nameList(pile)}.`, { who: P.i, cards: pile.map((c) => c.id) });
    const youTake = () => { const c = pickOne(G, P, pile, 'Put one into your hand', (x) => x.def.value); if (c) { pile.splice(pile.indexOf(c), 1); P.hand.push(c); emit(G, 'draw', `${P.name} puts ${c.def.name} into their hand.`, { who: P.i, cards: [c.id] }); } };
    const theyBottom = () => { const c = pickOne(G, O, pile, `Put one of ${P.name}'s cards on the bottom of their library`, (x) => x.def.value); if (c) { pile.splice(pile.indexOf(c), 1); P.library.unshift(c); emit(G, 'info', `${O.name} puts ${c.def.name} on the bottom of ${P.name}'s library.`, { who: O.i }); } };
    youTake(); theyBottom(); youTake(); theyBottom();
    while (pile.length) { const c = pile.shift(); P.hand.push(c); emit(G, 'draw', `${P.name} puts ${c.def.name} into their hand.`, { who: P.i, cards: [c.id] }); }
    dirty(G);
  }, { score: () => 3 })];
  return d;
};
S['The Prima Vista'] = (d) => {
  d.trig.push(castNC(4, { run: (G, X) => { X.src.crewed = true; dirty(G); say(G, X.P, `${X.src.def.name} becomes an artifact creature until end of turn.`, [X.src.id]); } }));
  return d;
};
S['Qiqirn Merchant'] = (d) => {
  d.acts.push({ cost: { m: C('{1}'), tap: true }, eff: [{ k: 'loot', n: 1, d: 1 }], label: 'Draw a card, then discard a card', when: ['end', 'main2'] });
  d.acts.push({ cost: { m: C('{7}'), tap: true, sacSelf: true }, costMod: (G, P) => nTowns(P), eff: [{ k: 'draw', n: 3 }], label: 'Draw three cards', when: ['end', 'main2'] });
  return d;
};
S['Quistis Trepe'] = (d) => {
  d.etb = [fn((G, X, t) => {
    const c = t && t.c;
    if (!c) return;
    X.P.xcast.push({ card: c, until: G.turn, anyType: true, exileAfter: true });
    say(G, X.P, `${X.P.name} may cast ${c.def.name} from a graveyard this turn, spending mana as though it were mana of any type.`, [c.id]);
  }, { tgt: { what: 'gy', f: { types: ['Instant', 'Sorcery'] } }, val: (G, P, c) => c.def.value * 0.5 + 0.3, label: 'Choose an instant or sorcery card in a graveyard' })];
  return d;
};
S["Relm's Sketching"] = (d) => {
  d.spell = [fn((G, X, t) => { if (t && t.c && onBf(G, t.c)) { const k = copyToken(G, X.P, t.c); emit(G, 'token', `${X.P.name} creates a token copy of ${t.c.def.name}.`, { who: X.P.i, cards: [k.id] }); } },
    { tgt: { f: { types: ['Artifact', 'Creature', 'Land'] } }, val: (G, P, c) => pv(G, c) * 0.9, label: 'Copy an artifact, creature or land' })];
  return d;
};
S['Retrieve the Esper'] = (d) => {
  d.spell = [fn((G, X) => { const [t] = mk(G, X.P, ROBOT, 1); if (t && X.item && X.item.fromGy) addCounters(G, t, 2); }, { score: () => 3.5, value: 3.2 })];
  return d;
};
S['Rook Turret'] = (d) => { d.trig.push(T('enter', { you: true, other: true, f: { types: ['Artifact'] }, may: true, mayAi: () => true, eff: [{ k: 'loot', n: 1, d: 1 }] })); return d; };
S["Sage's Nouliths"] = (d) => {
  d.statics.push({ who: 'equipped', p: 1, t: 0, kw: [], addSub: ['Cleric'] });
  d.trig.push(T('attack', { hostOnly: true, eff: [{ k: 'untapP', tgt: { f: { side: 'you', attacking: true } } }] }));
  return d;
};
S['Sahagin'] = (d) => {
  d.trig.push(castNC(4, { run: (G, X) => { addCounters(G, X.src, 1); X.src.tf.unblockable = true; say(G, X.P, `${X.src.def.name} can't be blocked this turn.`, [X.src.id]); } }));
  return d;
};
S['Scorpion Sentinel'] = (d) => { d.statics.push({ who: 'self', p: 3, t: 0, kw: [], cond: (G, s) => G.players[s.ctrl].bf.filter(isLand).length >= 7 }); return d; };
S['Sidequest: Card Collection'] = (d) => {
  d.etb = [{ k: 'loot', n: 3, d: 2 }];
  d.trig.push(T('endStep', { you: true, cond: (G, s, ev, Q) => Q.gy.length >= 8, check: (G, s, ev, Q) => Q.gy.length >= 8, run: (G, X) => transform(G, X.src) }));
  return d;
};
S['Magicked Card'] = (d) => d;
S['Sleep Magic'] = (d) => {
  d.statics.push({ who: 'enchanted', p: 0, t: 0, kw: [], flags: { noUntap: true } });
  d.etb = [fn((G, X) => { const h = X.src.att != null && byId(G, X.src.att); if (h) { h.tapped = true; emit(G, 'tapfx', `${h.def.name} is tapped.`, { who: X.P.i, cards: [h.id] }); } }, { score: () => 0.5 })];
  d.trig.push(T('dmgCreature', { cond: (G, src, ev) => ev.c && ev.c.id === src.att, run: (G, X) => { if (onBf(G, X.src)) { emit(G, 'sac', `${X.src.def.name} is sacrificed.`, { who: X.P.i, cards: [X.src.id] }); sacrifice(G, X.P, X.src, true); } } }));
  d.role = 'removal';
  return d;
};
S['Stolen Uniform'] = (d) => {
  d.spell = [
    fn(() => {}, { tgt: tg(YOU), val: (G, P, c) => (c.attacking || c.blocking ? 1 : 0.3) + pow(c) * 0.1, label: 'Choose a creature you control' }),
    fn((G, X, t) => {
      const eq = t && t.c, cre = X.last && X.last.c;
      if (!eq || !onBf(G, eq) || !cre || !onBf(G, cre)) return;
      if (eq.ctrl !== X.P.i) gainControl(G, X.P, eq, 'eot');
      attach(G, eq, cre);
    }, { tgt: { f: { types: ['Equipment'] } }, val: (G, P, c) => (c.ctrl === P.i ? 0.2 : 1 + c.def.value * 0.3), label: 'Choose an Equipment' }),
  ];
  return d;
};
S["Stuck in Summoner's Sanctum"] = (d) => {
  d.aura = { f: { types: ['Artifact', 'Creature'] } };
  d.statics.push({ who: 'enchanted', p: 0, t: 0, kw: [], flags: { noUntap: true, noActs: true } });
  d.etb = [fn((G, X) => { const h = X.src.att != null && byId(G, X.src.att); if (h) { h.tapped = true; emit(G, 'tapfx', `${h.def.name} is tapped.`, { who: X.P.i, cards: [h.id] }); } }, { score: () => 0.5 })];
  d.role = 'removal';
  return d;
};
const SEA = ['Kraken', 'Leviathan', 'Merfolk', 'Octopus', 'Serpent'];
const seaFolk = (c) => SEA.some((s) => hasSub(c, s));
S['Summon: Leviathan'] = (d) => {
  d.saga = [
    { ch: [1], eff: [fn((G, X) => { const cs = allCreatures(G).filter((c) => !seaFolk(c)); for (const c of cs) bounceCard(G, X.P, c); }, { score: (G, P) => allCreatures(G).filter((c) => !seaFolk(c)).reduce((s, c) => s + (c.ctrl === P.i ? -1 : 1) * pv(G, c) * 0.7, 0) })] },
    { ch: [2, 3], eff: [fn((G, X) => { X.src.mem.lev = G.turn; }, { score: () => 0.6 })] },
  ];
  d.trig.push(T('attack', { cond: (G, src, ev) => src.mem.lev === G.turn && seaFolk(ev.c), eff: fx('Draw a card.') }));
  // Chapter I sends back every creature that isn't a sea creature, yours too
  d.castScore = (G, P) => allCreatures(G).filter((c) => !seaFolk(c)).reduce((s, c) => s + (c.ctrl === P.i ? -1 : 1) * pv(G, c) * 0.6, 0);
  return d;
};
S['Summon: Shiva'] = (d) => {
  d.saga = [
    { ch: [1, 2], eff: [{ k: 'tapP', stun: true, tgt: { f: OPP } }] },
    { ch: [3], eff: [fn((G, X) => drawN(G, X.P, X.O.bf.filter((c) => isCreature(c) && c.tapped).length), { score: (G, P) => other(G, P).bf.filter((c) => isCreature(c) && c.tapped).length })] },
  ];
  return d;
};
// Answers to a spell, cast when the other player casts something
const removeSpell = (G, item, exile) => {
  const k = G.stack.indexOf(item);
  if (k >= 0) G.stack.splice(k, 1);
  const card = item.card;
  if (card.def.advOf) card.def = card.def.advOf;
  if (!card.token && !card.isCopy) G.players[card.owner][exile || card.fbExile ? 'exile' : 'gy'].push(card);
  card.fbExile = false;
};
const manaLeft = (P) => A._internal.manaSources(P, { count: true }).reduce((s, x) => s + (x.amount || 1), 0);
S['Swallowed by Leviathan'] = (d) => {
  d.spell = [{ k: 'noop2' }];
  d.respondOnly = true;
  d.respond = {
    counter: true,
    legal: (G, O, item) => item.P !== O && !item.card.def.uncounterable,
    ai: (G, O, item) => (canPay(item.P, L.genericCost(O.gy.length + 2)) ? 0 : L.threatOf(G, O, item)),
    res: (G, O, item) => {
      surveil(G, O, 2);
      const n = O.gy.length, P = item.P;
      if (n > 0 && canPay(P, L.genericCost(n)) && (isHuman(G, P) ? yesNo(G, P, item.card, `Pay {${n}} so ${item.card.def.name} isn't countered?`, true) : true)) { pay(P, L.genericCost(n)); emit(G, 'info', `${P.name} pays {${n}}, so ${item.card.def.name} resolves.`, { who: P.i }); return false; }
      removeSpell(G, item);
      emit(G, 'countered', `${item.card.def.name} is countered.`, { who: O.i, cards: [item.card.id] });
      return true;
    },
  };
  return d;
};
S['Syncopate'] = (d) => {
  d.spell = [{ k: 'noop2' }];
  d.respondOnly = true;
  d.respond = {
    counter: true,
    legal: (G, O, item) => item.P !== O && !item.card.def.uncounterable,
    ai: (G, O, item) => (manaLeft(O) - 1 > manaLeft(item.P) ? L.threatOf(G, O, item) : L.threatOf(G, O, item) * 0.2),
    res: (G, O, item, cs) => {
      const P = item.P;
      let x = 0;
      while (x < 15 && canPay(O, L.genericCost(x + 1))) x++;
      if (isHuman(G, O)) x = chooseNumber(G, O, cs, `${cs.def.name}: choose X`, 0, x, x);
      else x = Math.min(x, manaLeft(P) + 1);
      if (x > 0) pay(O, L.genericCost(x));
      emit(G, 'info', `${O.name} chooses X = ${x}.`, { who: O.i });
      if (x > 0 && canPay(P, L.genericCost(x)) && (isHuman(G, P) ? yesNo(G, P, item.card, `Pay {${x}} so ${item.card.def.name} isn't countered?`, true) : true)) { pay(P, L.genericCost(x)); emit(G, 'info', `${P.name} pays {${x}}, so ${item.card.def.name} resolves.`, { who: P.i }); return false; }
      removeSpell(G, item, true);
      emit(G, 'countered', `${item.card.def.name} is countered and exiled.`, { who: O.i, cards: [item.card.id] });
      return true;
    },
  };
  return d;
};
S["Thief's Knife"] = (d) => {
  d.statics.push({ who: 'equipped', p: 1, t: 1, kw: [], addSub: ['Rogue'] });
  d.trig.push(T('hitPlayer', { hostOnly: true, eff: fx('Draw a card.') }));
  return d;
};
S['Travel the Overworld'] = (d) => { d.spell = fx('Draw four cards.'); d.costMod = (G, P) => nTowns(P); return d; };
S['Ultros, Obnoxious Octopus'] = (d) => {
  d.trig.push(castNC(4, { eff: [{ k: 'tapP', stun: true, tgt: { f: OPP } }] }));
  d.trig.push(castNC(8, { run: (G, X) => addCounters(G, X.src, 8) }));
  return d;
};
S['Valkyrie Aerial Unit'] = (d) => { d.costMod = (G, P) => nArt(P); d.etb = fx('Surveil 2.'); return d; };
S['The Water Crystal'] = (d) => {
  d.spellDiscount = discountFor('U');
  d.millPlus = 4;
  d.acts.push({ cost: { m: C('{4}{U}{U}'), tap: true }, label: 'Each opponent mills cards equal to the cards in your hand', when: ['end', 'main2'],
    eff: [fn((G, X) => mill(G, X.O, X.P.hand.length), { score: (G, P) => P.hand.length * 0.4 })] });
  return d;
};
S["Y'shtola Rhul"] = (d) => {
  d.trig.push(T('endStep', { you: true, eff: [fn((G, X, t) => {
    if (t && t.c && onBf(G, t.c)) blink(G, t.c);
    if (G.endSteps === 1) G.extraEnd = true;
  }, { tgt: tg(YOU), val: (G, P, c) => (c.def.etb.length ? 1 + L.effsValue(c.def.etb) * 0.5 : 0.1) + (c.dmg ? 0.3 : 0) + (c.def.back ? 0.5 : 0) - (c.cnt || 0) * 0.5, label: 'Exile a creature you control, then return it' })] }));
  return d;
};


/* ============================ Black ============================ */
const lowSac = (G, P, c) => P.bf.filter((x) => x !== c && (isCreature(x) || isArtifact(x)) && (x.token || pv(G, x) < 1.2)).sort((a, b) => pv(G, a) - pv(G, b));
S['Ahriman'] = (d) => {
  d.acts.push({ cost: { m: C('{3}'), sac: { types: ['Creature', 'Artifact'] } }, eff: fx('Draw a card.'), label: 'Draw a card', when: ['end', 'main2'],
    ai: (G, P, c) => (lowSac(G, P, c).some((x) => x.token && !hasSub(x, 'Treasure')) ? { score: 1 } : null) });
  return d;
};
S['Al Bhed Salvagers'] = (d) => {
  d.trig.push(T('toGy', { you: true, cond: (G, src, ev) => !!ev.c && (ev.c.def.types.includes('Creature') || ev.c.def.types.includes('Artifact')), eff: [{ k: 'drain', n: 1 }, { k: 'gain', n: 1 }] }));
  return d;
};
S['Ardyn, the Usurper'] = (d) => {
  d.statics.push({ who: 'all', f: { side: 'you', sub: 'Demon' }, p: 0, t: 0, kw: ['menace', 'lifelink', 'haste'] });
  d.trig.push(T('combatStart', { you: true, eff: [fn((G, X, t) => {
    const c = t && t.c;
    const Q = c && G.players.find((q) => q.gy.includes(c));
    if (!Q) return;
    Q.gy.splice(Q.gy.indexOf(c), 1); Q.exile.push(c);
    emit(G, 'exile', `${c.def.name} is exiled from ${Q.name}'s graveyard.`, { who: X.P.i, cards: [c.id] });
    const k = copyToken(G, X.P, c, { def: { power: 5, toughness: 5, colors: ['B'], sub: ['Demon'] } });
    emit(G, 'token', `${X.P.name} creates a 5/5 black Demon copy of ${c.def.name}.`, { who: X.P.i, cards: [k.id] });
  }, { tgt: { what: 'gy', f: { types: ['Creature'] }, min: 0 }, val: (G, P, c) => 3 + c.def.value * 0.3, label: 'Exile a creature card from a graveyard' })] }));
  return d;
};
S["Black Mage's Rod"] = (d) => {
  d.statics.push({ who: 'equipped', p: 1, t: 0, kw: [], addSub: ['Wizard'] });
  d.trig.push(castNC(0, { cond: (G, src, ev) => nonCre(ev) && src.att != null && !!byId(G, src.att), run: (G, X) => hitOpp(G, X, 1, byId(G, X.src.att)) }));
  return d;
};
const startLife = (G) => (G.format === 'commander' ? 40 : 20);
S['Cecil, Dark Knight'] = (d) => {
  const dark = (G, X, n) => {
    loseLife(G, X.P, n);
    if (X.P.life * 2 <= startLife(G) && onBf(G, X.src)) { X.src.tapped = false; transform(G, X.src); }
  };
  d.trig.push(T('dmgCreature', { cond: (G, src, ev) => ev.src === src && ev.n > 0, run: (G, X) => dark(G, X, X.ev.n) }));
  d.trig.push(T('hitPlayer', { self: true, run: (G, X) => dark(G, X, X.ev.n) }));
  return d;
};
S['Cecil, Redeemed Paladin'] = (d) => {
  d.trig.push(T('attack', { self: true, run: (G, X) => { for (const c of X.P.bf.filter((x) => x !== X.src && x.attacking)) grantKw(G, c, ['indestructible']); } }));
  return d;
};
S['Circle of Power'] = (d) => {
  d.spell = [{ k: 'draw', n: 2 }, { k: 'loseSelf', n: 2 }, mkE(WIZARD), { k: 'pumpAll', side: 'you', p: 1, t: 0, kw: ['lifelink'], f: { sub: 'Wizard' } }];
  return d;
};
S['Cornered by Black Mages'] = (d) => { d.spell = fx('Target opponent sacrifices a creature of their choice.').concat([mkE(WIZARD)]); d.role = 'removal'; return d; };
S['Dark Confidant'] = (d) => {
  d.trig.push(T('upkeep', { you: true, run: (G, X) => {
    const P = X.P, c = P.library.pop();
    if (!c) return;
    P.hand.push(c);
    emit(G, 'draw', `${P.name} reveals ${c.def.name} and puts it into their hand.`, { who: P.i, cards: [c.id] });
    loseLife(G, P, c.def.mv || 0);
  } }));
  return d;
};
S["Dark Knight's Greatsword"] = (d) => {
  d.acts.push({ equip: true, cost: { m: C('{0}'), life: 3 }, sorcery: true, once: true, label: 'Equip: pay 3 life' });
  return d;
};
S['The Darkness Crystal'] = (d) => {
  d.spellDiscount = discountFor('B');
  d.darkCrystal = true;
  const held = (G, src) => (src.mem.exiled || []).map((id) => G.players.flatMap((Q) => Q.exile).find((c) => c.id === id)).filter((c) => c && c.def.types.includes('Creature'));
  d.acts.push({ cost: { m: C('{4}{B}{B}'), tap: true }, label: 'Put a creature card exiled with it onto the battlefield', when: ['main2', 'end'],
    cond: (G, P, c) => held(G, c).length > 0,
    eff: [fn((G, X) => {
      const c = pickOne(G, X.P, held(G, X.src), 'Put a creature card onto the battlefield', (x) => x.def.value);
      if (!c) return;
      putOntoBattlefield(G, X.P, c, { tapped: true, ctr: { '+1/+1': 2 } });
    }, { score: (G, P, X) => 2 })],
    ai: (G, P, c) => (held(G, c).length ? { score: 2 + Math.max(...held(G, c).map((x) => x.def.value)) * 0.4 } : null) });
  return d;
};
S['Demon Wall'] = (d) => {
  d.kw = d.kw.filter((k) => k !== 'defender');
  d.statics.push({ who: 'self', p: 0, t: 0, kw: ['defender'], cond: (G, s) => !s.cnt && !Object.values(s.ctr || {}).some((n) => n > 0) });
  d.acts.push({ cost: { m: C('{5}{B}') }, eff: [{ k: 'countersSelf', n: 2 }], label: 'Put two +1/+1 counters on it', when: ['main1', 'end'] });
  return d;
};
S['Evil Reawakened'] = (d) => {
  d.spell = [fn((G, X, t) => { const c = t && t.c; if (c && X.P.gy.includes(c)) putOntoBattlefield(G, X.P, c, { ctr: { '+1/+1': 2 } }); },
    { tgt: { what: 'gy', mine: true, f: { types: ['Creature'] } }, val: (G, P, c) => c.def.value + 2, label: 'Return a creature card to the battlefield' })];
  return d;
};
S["Fang, Fearless l'Cie"] = (d) => {
  d.trig.push(T('leaveGy', { you: true, once: true, run: (G, X) => { drawN(G, X.P, 1); loseLife(G, X.P, 1); } }));
  return d;
};
S['Ragnarok, Divine Deliverance'] = (d) => {
  d.dies = [{ k: 'destroyP', tgt: { f: { types: ['any'] } } },
    { k: 'regrow', to: 'bf', tgt: { what: 'gy', mine: true, f: { types: ['permanent'], fn: (dd) => !dd.supertypes.includes('Legendary') } } }];
  return d;
};
S['Fight On!'] = (d) => {
  d.spell = [fn((G, X, t) => { for (const c of tcs(t)) if (X.P.gy.includes(c)) { X.P.gy.splice(X.P.gy.indexOf(c), 1); X.P.hand.push(c); emit(G, 'raise', `${X.P.name} returns ${c.def.name} to hand.`, { who: X.P.i, cards: [c.id] }); } },
    { tgt: { what: 'gy', mine: true, f: { types: ['Creature'] }, n: 2, min: 0 }, val: (G, P, c) => 0.8 + c.def.value * 0.3, label: 'Return up to two creature cards' })];
  return d;
};
S['The Final Days'] = (d) => {
  d.spell = [fn((G, X) => mk(G, X.P, HORROR, X.item && X.item.fromGy ? X.P.gy.filter((c) => c.def.types.includes('Creature')).length : 2, { tapped: true }),
    { score: (G, P) => 3, value: 3 })];
  return d;
};
S['Gaius van Baelsar'] = (d) => {
  const kinds = [
    { label: 'Each player sacrifices a creature token', f: (c) => isCreature(c) && c.token },
    { label: 'Each player sacrifices a nontoken creature', f: (c) => isCreature(c) && !c.token },
    { label: 'Each player sacrifices an enchantment', f: (c) => isEnchantment(c) },
  ];
  d.etb = [fn((G, X) => {
    const swing = (k) => { const w = (Q) => { const cs = Q.bf.filter((c) => c !== X.src && kinds[k].f(c)); return cs.length ? Math.min(...cs.map((c) => pv(G, c))) : 0; }; return w(X.O) - w(X.P); };
    const k = chooseMode(G, X.P, X.src, `${X.src.def.name}: choose one`, kinds.map((x) => x.label), [0, 1, 2].sort((a, b) => swing(b) - swing(a))[0]);
    for (const Q of [X.P, X.O]) edictOf(G, Q, (c) => c !== X.src && kinds[k].f(c));
  }, { score: () => 1.5 })];
  return d;
};
S['Jecht, Reluctant Guardian'] = (d) => {
  d.trig.push(T('hitPlayer', { self: true, may: true, mayAi: () => true, mayLabel: "Exile Jecht and return it as Braska's Final Aeon?", run: (G, X) => blink(G, X.src, { transformed: true }) }));
  return d;
};
S["Braska's Final Aeon"] = (d) => {
  d.saga = [
    { ch: [1, 2], eff: [{ k: 'discard', n: 1 }, { k: 'draw', n: 1 }] },
    { ch: [3], eff: [fn((G, X) => { edictOf(G, X.O); edictOf(G, X.O); }, { score: (G, P) => Math.min(2, other(G, P).bf.filter(isCreature).length) * 2.5 })] },
  ];
  return d;
};
S['Kain, Traitorous Dragoon'] = (d) => {
  d.statics.push({ who: 'self', p: 0, t: 0, kw: ['flying'], cond: myTurn });
  d.trig.push(T('hitPlayer', { self: true, run: (G, X) => {
    const Q = X.ev.Q, n = X.ev.n;
    if (!Q || Q === X.P || !onBf(G, X.src)) return;
    gainControl(G, Q, X.src, 'perm');
    if (X.src.ctrl !== Q.i) return;
    drawN(G, X.P, n);
    mk(G, X.P, TREASURE, n, { tapped: true });
    loseLife(G, X.P, n);
  } }));
  return d;
};
S['Malboro'] = (d) => {
  d.etb = [{ k: 'discard', n: 1 }, fn((G, X) => { loseLife(G, X.O, 2, X.P.i); const ex = X.O.library.splice(Math.max(0, X.O.library.length - 3)); X.O.exile.push(...ex); if (ex.length) emit(G, 'exile', `${nameList(ex)} ${ex.length > 1 ? 'are' : 'is'} exiled from the top of ${X.O.name}'s library.`, { who: X.P.i, cards: ex.map((c) => c.id) }); }, { score: () => 1.6 })];
  return d;
};
S['Namazu Trader'] = (d) => {
  d.etb = [{ k: 'loseSelf', n: 1 }, { k: 'treasure', n: 1 }];
  d.trig.push(T('attack', { self: true, run: (G, X) => {
    const P = X.P;
    const cs = P.bf.filter((c) => c !== X.src && (isCreature(c) || isArtifact(c)));
    if (!cs.length) return;
    let c = null;
    if (isHuman(G, P)) { if (yesNo(G, P, X.src, 'Sacrifice another creature or artifact to surveil 2?', false)) c = pickOne(G, P, cs, 'Sacrifice a creature or artifact', () => 0); }
    else c = lowSac(G, P, X.src).find((x) => x.token && !hasSub(x, 'Treasure') && !x.attacking) || null;
    if (!c) return;
    emit(G, 'sac', `${P.name} sacrifices ${c.def.name}.`, { who: P.i, cards: [c.id] });
    sacrifice(G, P, c, true);
    surveil(G, P, 2);
  } }));
  return d;
};
S["Ninja's Blades"] = (d) => {
  d.statics.push({ who: 'equipped', p: 1, t: 1, kw: [], addSub: ['Ninja'] });
  d.trig.push(T('hitPlayer', { hostOnly: true, run: (G, X) => {
    const P = X.P;
    drawN(G, P, 1);
    const before = P.gy.length;
    discardChoice(G, P, 1, 'discard');
    const c = P.gy.length > before ? P.gy[P.gy.length - 1] : null;
    if (c && X.ev.Q) loseLife(G, X.ev.Q, c.def.mv || 0, P.i);
  } }));
  return d;
};
S['Phantom Train'] = (d) => {
  d.acts.push({ cost: { sac: { types: ['Creature', 'Artifact'] } }, label: 'Put a +1/+1 counter on it; it becomes a creature until end of turn', when: ['main1', 'blocks'],
    eff: [fn((G, X) => { addCounters(G, X.src, 1); X.src.crewed = true; dirty(G); }, { score: () => 1 })],
    ai: (G, P, c, when) => { if (when !== 'main1' || c.crewed || G.active !== P.i) return null; const s = lowSac(G, P, c).find((x) => x.token); return s ? { score: 1.2 } : null; } });
  return d;
};
S['Poison the Waters'] = (d) => {
  d.modes = [
    { label: 'All creatures get -1/-1', eff: [{ k: 'pumpAll', p: -1, t: -1, kw: [] }] },
    { label: 'Look at a hand; discard an artifact or creature card', eff: [fn((G, X) => {
      const Q = X.O;
      emit(G, 'info', `${Q.name} reveals their hand: ${Q.hand.length ? nameList(Q.hand) : 'nothing'}.`, { who: X.P.i, cards: Q.hand.map((c) => c.id) });
      const ok = Q.hand.filter((c) => c.def.types.includes('Artifact') || c.def.types.includes('Creature'));
      const c = pickOne(G, X.P, ok, `Choose a card for ${Q.name} to discard`, (x) => x.def.value + x.def.mv * 0.2, 'hand-discard');
      if (!c) return;
      Q.hand.splice(Q.hand.indexOf(c), 1); Q.gy.push(c);
      emit(G, 'discard', `${Q.name} discards ${c.def.name}.`, { who: X.P.i, cards: [c.id] });
      dirty(G);
    }, { score: (G, P) => (other(G, P).hand.length ? 1.6 : 0) })] },
  ];
  d.spell = null;
  return d;
};
S['Qutrub Forayer'] = (d) => {
  d.etb = [fn((G, X) => {
    const P = X.P;
    const hurt = allCreatures(G).filter((c) => c.dmgTurn === G.turn && L.tgtOk(G, P, { tgt: { f: {} } }, c, X.src));
    const gys = G.players.filter((Q) => Q.gy.length);
    const opts = ['Destroy a creature that was dealt damage this turn', 'Exile up to two cards from a graveyard'];
    const ai = hurt.some((c) => c.ctrl !== P.i) ? 0 : 1;
    const k = hurt.length && gys.length ? chooseMode(G, P, X.src, `${X.src.def.name}: choose one`, opts, ai) : hurt.length ? 0 : 1;
    if (k === 0) { const c = pickOne(G, P, hurt, 'Destroy a creature dealt damage this turn', (x) => (x.ctrl === P.i ? -cv(x) : cv(x))); if (c) destroyPermanent(G, P, c, `by ${X.src.def.name}`); return; }
    const Q = gys.length > 1 ? (isHuman(G, P) ? G.players[chooseMode(G, P, X.src, 'Exile from whose graveyard?', G.players.map((q) => q.name), 1)] : X.O.gy.length ? X.O : P) : gys[0];
    if (!Q) return;
    const cs = pickSome(G, P, Q.gy, 0, 2, 'Exile up to two cards', (c) => (Q === P ? -1 : c.def.value), 'graveyard');
    for (const c of cs) { Q.gy.splice(Q.gy.indexOf(c), 1); Q.exile.push(c); }
    if (cs.length) emit(G, 'exile', `${nameList(cs)} ${cs.length > 1 ? 'are' : 'is'} exiled from ${Q.name}'s graveyard.`, { who: P.i, cards: cs.map((c) => c.id) });
  }, { score: (G, P) => (allCreatures(G).some((c) => c.ctrl !== P.i && c.dmgTurn === G.turn) ? 3 : 0.3) })];
  return d;
};
S['Reno and Rude'] = (d) => {
  d.trig.push(T('hitPlayer', { self: true, run: (G, X) => {
    const P = X.P, Q = X.ev.Q;
    const c = Q && Q.library.pop();
    if (!c) return;
    Q.exile.push(c);
    emit(G, 'exile', `${c.def.name} is exiled from the top of ${Q.name}'s library.`, { who: P.i, cards: [c.id] });
    const cs = P.bf.filter((x) => x !== X.src && (isCreature(x) || isArtifact(x)));
    if (!cs.length) return;
    let s = null;
    if (isHuman(G, P)) { if (yesNo(G, P, X.src, `Sacrifice a creature or artifact to be able to play ${c.def.name} this turn?`, false)) s = pickOne(G, P, cs, 'Sacrifice a creature or artifact', () => 0); }
    else if (c.def.value >= 2.5 || isLand(c)) s = lowSac(G, P, X.src).find((x) => x.token) || null;
    if (!s) return;
    emit(G, 'sac', `${P.name} sacrifices ${s.def.name}.`, { who: P.i, cards: [s.id] });
    sacrifice(G, P, s, true);
    P.xcast.push({ card: c, until: G.turn, anyType: true });
    say(G, P, `${P.name} may play ${c.def.name} this turn.`, [c.id]);
  } }));
  return d;
};
S['Resentful Revelation'] = (d) => {
  d.spell = [fn((G, X) => {
    const P = X.P, top = P.library.splice(Math.max(0, P.library.length - 3)).reverse();
    if (!top.length) return;
    const c = pickOne(G, P, top, 'Put one into your hand', (x) => x.def.value + (isLand(x) && P.bf.filter(isLand).length < 5 ? 2 : 0), 'look');
    P.hand.push(c);
    const rest = top.filter((x) => x !== c);
    P.gy.push(...rest);
    dirty(G);
    emit(G, 'search', `${P.name} puts ${c.def.name} into their hand${rest.length ? ` and ${nameList(rest)} into their graveyard` : ''}.`, { who: P.i, cards: [c.id] });
  }, { score: () => 1.4, value: 1.4 })];
  return d;
};
const sacThenDraw = (G, X, many) => {
  const P = X.P;
  const cs = P.bf.filter((c) => c !== X.src && isCreature(c));
  if (!cs.length) return;
  let pick = [];
  if (isHuman(G, P)) pick = pickSome(G, P, cs, 0, many ? cs.length : 1, many ? 'Sacrifice any number of other creatures' : 'You may sacrifice another creature', () => 0);
  else pick = cs.filter((c) => c.token && pv(G, c) < 1.6 && !c.attacking).sort((a, b) => pv(G, a) - pv(G, b)).slice(0, many ? 3 : 1);
  for (const c of pick) { emit(G, 'sac', `${P.name} sacrifices ${c.def.name}.`, { who: P.i, cards: [c.id] }); sacrifice(G, P, c, true); }
  drawN(G, P, pick.length);
};
const drainOne = (G, X) => { loseLife(G, X.O, 1, X.P.i); gain(G, X.P, 1); };
S['Sephiroth, Fabled SOLDIER'] = (d) => {
  d.etb = [fn((G, X) => sacThenDraw(G, X, false), { score: () => 0.3 })];
  d.trig.push(T('attack', { self: true, run: (G, X) => sacThenDraw(G, X, false) }));
  d.trig.push(T('die', { other: true, counted: true, run: (G, X) => { drainOne(G, X); if (X.nth === 4 && onBf(G, X.src)) transform(G, X.src); } }));
  return d;
};
S['Sephiroth, One-Winged Angel'] = (d) => {
  d.trig.push(T('transform', { self: true, cond: (G, src, ev) => ev.to === src.def, run: (G, X) => L.addEmblem(G, X.P, 'Super Nova', [T('die', { run: drainOne })]) }));
  d.trig.push(T('attack', { self: true, run: (G, X) => sacThenDraw(G, X, true) }));
  return d;
};
S["Shambling Cie'th"] = (d) => {
  d.etbTapped = true;
  d.gyTrig = [castNC(0, { run: (G, X) => {
    const P = X.P, c = X.src;
    if (!P.gy.includes(c) || !canPay(P, C('{B}'))) return;
    if (!yesNo(G, P, c, `Pay {B} to return ${c.def.name} to your hand?`, P.hand.length < 4)) return;
    pay(P, C('{B}'));
    P.gy.splice(P.gy.indexOf(c), 1); P.hand.push(c);
    emit(G, 'raise', `${P.name} pays {B} and returns ${c.def.name} to hand.`, { who: P.i, cards: [c.id] });
  } })];
  return d;
};
S['Sidequest: Hunt the Mark'] = (d) => {
  d.etb = [{ k: 'destroyP', tgt: { f: {}, min: 0 } }];
  d.trig.push(T('endStep', { you: true, cond: (G, src, ev, Q) => diedThisTurn(G, other(G, Q)) > 0, run: (G, X) => {
    mk(G, X.P, TREASURE, 1);
    if (X.P.bf.filter((c) => hasSub(c, 'Treasure')).length >= 3) transform(G, X.src);
  } }));
  d.role = 'removal';
  return d;
};
S['Yiazmat, Ultimate Mark'] = (d) => {
  d.acts.push({ cost: { m: C('{1}{B}'), sac: { types: ['Creature', 'Artifact'] } }, label: 'Gains indestructible until end of turn; tap it', when: ['blocks'],
    eff: [fn((G, X) => { grantKw(G, X.src, ['indestructible']); X.src.tapped = true; }, { score: () => 0.5 })],
    ai: (G, P, c) => (c.blocking && c.dmg + 0 >= 0 && lowSac(G, P, c).some((x) => x.token) ? { score: 1 } : null) });
  return d;
};
S['Summon: Anima'] = (d) => {
  d.saga = [
    { ch: [1, 2, 3], eff: [{ k: 'draw', n: 1 }, { k: 'loseSelf', n: 1 }] },
    { ch: [4], eff: [fn((G, X) => { edictOf(G, X.O); loseLife(G, X.O, 3, X.P.i); }, { score: () => 4 })] },
  ];
  return d;
};
S['Summon: Primal Odin'] = (d) => {
  d.saga = [
    { ch: [1], eff: fx('Destroy target creature an opponent controls.') },
    { ch: [2], eff: [fn((G, X) => { X.src.mem.odin = true; say(G, X.P, `${X.src.def.name}: a player it deals combat damage to loses the game.`, [X.src.id]); }, { score: () => 1 })] },
    { ch: [3], eff: [{ k: 'draw', n: 2 }, fn((G, X) => { for (const Q of G.players) loseLife(G, Q, 2, X.P.i); }, { score: (G, P) => (other(G, P).life <= 2 ? 100 : 0) })] },
  ];
  d.trig.push(T('hitPlayer', { self: true, cond: (G, src) => !!src.mem.odin, run: (G, X) => { if (X.ev.Q) { X.ev.Q.loseNow = true; say(G, X.P, `${X.ev.Q.name} loses the game (Zantetsuken).`); } } }));
  return d;
};
S['Tonberry'] = (d) => {
  d.etbTapped = true;
  d.etbCtr = () => ({ stun: 1 });
  d.statics.push({ who: 'self', p: 0, t: 0, kw: ['first strike', 'deathtouch'], cond: myTurn });
  return d;
};
S["Vayne's Treachery"] = (d) => {
  d.modes = [
    { label: '-2/-2', eff: [{ k: 'pump', f: {}, p: -2, t: -2, kw: [] }] },
    { label: 'Kicked (sacrifice an artifact or creature): -6/-6', addCost: { sac: { types: ['Artifact', 'Creature'] } }, eff: [{ k: 'pump', f: {}, p: -6, t: -6, kw: [] }] },
  ];
  d.spell = null;
  d.role = 'removal';
  return d;
};
S['Vincent Valentine'] = (d) => {
  d.trig.push(T('die', { opp: true, run: (G, X) => { if (X.ev.pow > 0 && onBf(G, X.src)) addCounters(G, X.src, X.ev.pow); } }));
  d.trig.push(T('attack', { self: true, may: true, mayAi: () => true, mayLabel: 'Transform Vincent Valentine into Galian Beast?', run: (G, X) => transform(G, X.src) }));
  return d;
};
const backTapped = (G, X) => { const c = X.src, Q = G.players[c.owner]; if (Q.gy.includes(c)) { putOntoBattlefield(G, Q, c, { tapped: true }); emit(G, 'raise', `${c.def.name} returns to the battlefield tapped.`, { who: Q.i, cards: [c.id] }); } };
S['Galian Beast'] = (d) => { d.dies = [fn(backTapped, { score: () => 3, value: 2 })]; return d; };
S["Vincent's Limit Break"] = (d) => {
  const lb = (p) => fn((G, X, t) => {
    const c = t && t.c;
    if (!c || !onBf(G, c)) return;
    c.base = { p, t: 2, eot: true };
    c.xtrig = (c.xtrig || []).concat(T('die', { self: true, eot: true, run: backTapped }));
    dirty(G);
    emit(G, 'pump', `${c.def.name} is ${p}/2 and returns to the battlefield when it dies this turn.`, { who: X.P.i, cards: [c.id] });
  }, { tgt: tg(YOU), val: (G, P, c, X, ctx) => (c.attacking || c.blocking ? 1.2 : ctx === 'main1' && L.canAttackNow(G, c) ? 0.6 : 0.2) * Math.max(0, p - pow(c)) + (c.attacking || c.blocking ? cv(c) * 0.3 : 0), label: 'Choose a creature you control' });
  d.modes = [
    { label: 'Galian Beast: 3/2', eff: [lb(3)] },
    { label: 'Death Gigas (+{1}): 5/2', cost: C('{1}'), eff: [lb(5)] },
    { label: 'Hellmasker (+{3}): 7/2', cost: C('{3}'), eff: [lb(7)] },
  ];
  d.spell = null;
  return d;
};
S['Zenos yae Galvus'] = (d) => {
  d.etb = [fn((G, X) => {
    const foes = X.O.bf.filter(isCreature);
    const f = pickOne(G, X.P, foes, 'Choose a creature an opponent controls', (c) => cv(c));
    if (f) { X.src.mem.friend = f.id; say(G, X.P, `${X.src.def.name} chooses ${f.def.name}.`, [f.id]); }
    for (const c of allCreatures(G)) if (c !== X.src && c !== f) { c.tp -= 2; c.tt -= 2; }
    dirty(G);
    emit(G, 'pump', 'Other creatures get -2/-2 until end of turn.', { who: X.P.i });
  }, { score: (G, P) => allCreatures(G).filter((c) => tou(c) <= 2).reduce((s, c) => s + (c.ctrl === P.i ? -cv(c) : cv(c)), 0) + 1 })];
  d.trig.push(T('leave', { cond: (G, src, ev) => ev.c && ev.c.id === src.mem.friend, run: (G, X) => transform(G, X.src) }));
  return d;
};
S['Shinryu, Transcendent Rival'] = (d) => d;
S['Zodiark, Umbral God'] = (d) => {
  d.etb = [fn((G, X) => {
    for (const Q of [X.P, X.O]) {
      const cs = Q.bf.filter((c) => isCreature(c) && !hasSub(c, 'God'));
      const n = Math.floor(cs.length / 2);
      for (let k = 0; k < n; k++) edictOf(G, Q, (c) => isCreature(c) && !hasSub(c, 'God'));
    }
  }, { score: (G, P) => Math.floor(other(G, P).bf.filter(isCreature).length / 2) * 2 - Math.floor(P.bf.filter((c) => isCreature(c) && !hasSub(c, 'God')).length / 2) * 1.5 })];
  d.trig.push(T('sac', { cond: (G, src, ev) => ev.c !== src && ev.c && ev.c.def.types.includes('Creature'), run: (G, X) => { if (onBf(G, X.src)) addCounters(G, X.src, 1); } }));
  return d;
};


/* ============================ Red ============================ */
const isEquipped = (G, c) => equipmentOn(G, c).length > 0;
const fightIt = (G, X, a, b) => {
  if (!a || !b || !onBf(G, a) || !onBf(G, b) || a === b) return;
  const pa = pow(a), pb = pow(b);
  hit(G, X, b, pa, a);
  hit(G, X, a, pb, b);
};
S['Barret Wallace'] = (d) => {
  d.trig.push(T('attack', { self: true, run: (G, X) => hitOpp(G, X, X.P.bf.filter((c) => isCreature(c) && isEquipped(G, c)).length) }));
  return d;
};
S['Blazing Bomb'] = (d) => {
  d.trig.push(castNC(4, { run: (G, X) => addCounters(G, X.src, 1) }));
  d.acts.push({ cost: { tap: true, sacSelf: true }, sorcery: true, label: 'Deal damage equal to its power to a creature',
    eff: [{ k: 'dmgX', nFn: (G, X) => (X.self ? X.self.pow : X.src ? pow(X.src) : 0), tgt: { f: {} } }],
    ai: (G, P, c) => { const n = pow(c); const t = other(G, P).bf.filter((x) => isCreature(x) && L.lethalTo(x) <= n && L.tgtOk(G, P, { tgt: { f: {} } }, x, c)).sort((a, b) => cv(b) - cv(a))[0]; return t && cv(t) > cv(c) + 0.5 ? { score: cv(t) - cv(c), targets: [{ c: t }] } : null; } });
  return d;
};
S['Call the Mountain Chocobo'] = (d) => { d.spell = [{ k: 'tutor', f: { types: ['Mountain'] }, to: 'hand' }, mkE(BIRD)]; return d; };
S['Choco-Comet'] = (d) => {
  d.spell = [{ k: 'dmgX', nFn: (G, X) => X.x || 0, tgt: { what: 'any', f: {} } }, mkE(BIRD)];
  d.minX = 1;
  d.role = 'burn';
  return d;
};
const devotion = (P, col) => P.bf.reduce((s, c) => s + (c.def.cost[col] || 0) + (c.def.cost.hy || []).filter((h) => h.includes(col)).length, 0);
S["Clive, Ifrit's Dominant"] = (d) => {
  d.etb = [fn((G, X) => {
    const P = X.P, n = devotion(P, 'R');
    const ok = isHuman(G, P) ? yesNo(G, P, X.src, `Discard your hand (${P.hand.length}) and draw ${n} cards?`, n > P.hand.length) : n > P.hand.length + 1;
    if (!ok) return;
    const k = P.hand.length;
    if (k) { const hand = P.hand.splice(0); P.gy.push(...hand); emit(G, 'discard', `${P.name} discards their hand.`, { who: P.i, cards: hand.map((c) => c.id) }); dirty(G); }
    drawN(G, P, n);
  }, { score: (G, P) => Math.max(0, devotion(P, 'R') + 2 - P.hand.length) * 0.8 })];
  d.acts.push(Object.assign(blinkT('{4}{R}{R}', 'Become Ifrit, Warden of Inferno'), { cost: { m: C('{4}{R}{R}'), tap: true } }));
  return d;
};
S['Ifrit, Warden of Inferno'] = (d) => {
  d.saga = [
    { ch: [1], eff: [fn((G, X, t) => fightIt(G, X, X.src, t && t.c), { tgt: { f: {}, other: true, min: 0 }, val: (G, P, c) => (c.ctrl === P.i ? -cv(c) : 9 >= L.lethalTo(c) && !has(c, 'deathtouch') ? cv(c) : 0.1), label: 'Fight another creature' })] },
    { ch: [2, 3], eff: [fn((G, X) => { L.addPool(G, X.P, ['R', 'R', 'R', 'R']); say(G, X.P, `${X.P.name} adds {R}{R}{R}{R}.`); if (ctrCount(X.src, 'lore') >= 3) blink(G, X.src); }, { score: () => 1.5 })] },
  ];
  return d;
};
S['Coral Sword'] = (d) => {
  d.etb = [fn((G, X, t) => { const c = t && t.c; if (c && onBf(G, c)) { attach(G, X.src, c); grantKw(G, c, ['first strike']); } },
    { tgt: tg(YOU), val: (G, P, c) => 0.5 + (c.attacking || c.blocking ? 1 : 0) + pow(c) * 0.1, label: 'Attach it to a creature you control' })];
  return d;
};
S['The Fire Crystal'] = (d) => {
  d.spellDiscount = discountFor('R');
  d.statics.push({ who: 'all', f: { side: 'you' }, p: 0, t: 0, kw: ['haste'] });
  d.acts.push({ cost: { m: C('{4}{R}{R}'), tap: true }, label: 'Create a token copy of a creature you control (sacrificed at end step)', when: ['main1'],
    eff: [fn((G, X, t) => {
      const c = t && t.c;
      if (!c || !onBf(G, c)) return;
      const k = copyToken(G, X.P, c);
      emit(G, 'token', `${X.P.name} creates a token copy of ${c.def.name}.`, { who: X.P.i, cards: [k.id] });
      G.delayed.push({ when: 'end', run: (G2) => { if (onBf(G2, k)) { emit(G2, 'sac', `${k.def.name} is sacrificed.`, { who: k.ctrl, cards: [k.id] }); sacrifice(G2, G2.players[k.ctrl], k, true); } } });
    }, { tgt: tg(YOU), val: (G, P, c) => cv(c) * 0.8 + L.effsValue(c.def.etb) * 0.5, label: 'Copy a creature you control' })] });
  return d;
};
S['Fire Magic'] = (d) => {
  d.modes = [
    { label: 'Fire: 1 damage to each creature', eff: fx('Fire Magic deals 1 damage to each creature.', 'Fire Magic') },
    { label: 'Fira (+{2}): 2 damage to each creature', cost: C('{2}'), eff: fx('Fire Magic deals 2 damage to each creature.', 'Fire Magic') },
    { label: 'Firaga (+{5}): 3 damage to each creature', cost: C('{5}'), eff: fx('Fire Magic deals 3 damage to each creature.', 'Fire Magic') },
  ];
  d.spell = null;
  d.role = 'sweeper';
  return d;
};
S['Firion, Wild Rose Warrior'] = (d) => {
  d.statics.push({ who: 'all', f: { side: 'you', fn: (G, c) => isEquipped(G, c) }, p: 0, t: 0, kw: ['haste'] });
  d.trig.push(T('enter', { you: true, f: { types: ['Equipment'] }, cond: (G, src, ev) => !ev.c.token, run: (G, X) => {
    const e = X.ev.c;
    const acts = e.def.acts.map((a) => (a.equip ? Object.assign({}, a, { costMod: () => 2 }) : a));
    const k = copyToken(G, X.P, e, { def: { acts, trig: (e.def.trig || []).concat(T('upkeep', { run: (G2, X2) => { if (onBf(G2, X2.src)) { emit(G2, 'sac', `${X2.src.def.name} is sacrificed.`, { who: X2.P.i, cards: [X2.src.id] }); sacrifice(G2, X2.P, X2.src, true); } } })) } });
    emit(G, 'token', `${X.P.name} creates a token copy of ${e.def.name}.`, { who: X.P.i, cards: [k.id] });
  } }));
  return d;
};
S['Freya Crescent'] = (d) => {
  d.statics.push({ who: 'self', p: 0, t: 0, kw: ['flying'], cond: myTurn });
  d.manaAbs = [{ colors: ['R'], only: (pu) => (!!pu.def && (pu.def.sub || []).includes('Equipment')) || (!!pu.ability && !!pu.src && isEquip(pu.src)) }];
  return d;
};
const gilgamesh = (G, X) => {
  const P = X.P;
  const top = P.library.splice(Math.max(0, P.library.length - 6)).reverse();
  if (!top.length) return;
  const eqs = top.filter((c) => (c.def.sub || []).includes('Equipment'));
  const put = pickSome(G, P, eqs, 0, eqs.length, 'Put any number of Equipment onto the battlefield', (c) => c.def.value + 1, 'library', 'look');
  const rest = top.filter((c) => !put.includes(c));
  G.rng.shuffle(rest); P.library.unshift(...rest);
  emit(G, 'search', `${P.name} looks at the top ${top.length} cards${put.length ? ` and puts ${nameList(put)} onto the battlefield` : ''}.`, { who: P.i, cards: put.map((c) => c.id) });
  for (const c of put) enterBattlefield(G, P, c, null, {});
  const live = put.filter((c) => onBf(G, c));
  const sams = P.bf.filter((c) => isCreature(c) && hasSub(c, 'Samurai'));
  if (!live.length || !sams.length) return;
  if (isHuman(G, P) && !yesNo(G, P, X.src, 'Attach one of them to a Samurai you control?', true)) return;
  const eq = pickOne(G, P, live, 'Choose an Equipment to attach', (c) => c.def.value);
  const to = pickOne(G, P, sams, `Attach ${eq.def.name} to`, (c) => cv(c) + (c.attacking ? 2 : 0));
  attach(G, eq, to);
};
S['Gilgamesh, Master-at-Arms'] = (d) => {
  d.etb = [fn(gilgamesh, { score: () => 2 })];
  d.trig.push(T('attack', { self: true, run: gilgamesh }));
  return d;
};
// Exile the top card of P's library; P may play it until a given turn
function impulse(G, P, until, label) {
  const c = P.library.pop();
  if (!c) return null;
  P.exile.push(c);
  P.xcast.push({ card: c, until });
  emit(G, 'exile', `${P.name} exiles ${c.def.name} from the top of their library${label ? ` (${label})` : ''} and may play it.`, { who: P.i, cards: [c.id] });
  dirty(G);
  return c;
}
const untilMyNextEnd = (G, P) => G.turn + (G.active === P.i ? 2 : 1);
S['Haste Magic'] = (d) => {
  d.spell = [{ k: 'pump', f: {}, p: 3, t: 1, kw: ['haste'] }, fn((G, X) => impulse(G, X.P, untilMyNextEnd(G, X.P)), { score: () => 0.8 })];
  return d;
};
S['Item Shopkeep'] = (d) => {
  d.trig.push(T('attacks', { you: true, eff: [{ k: 'grant', kw: ['menace'], tgt: { f: { side: 'you', attacking: true, fn: (G, c) => isEquipped(G, c) } } }] }));
  return d;
};
S['Laughing Mad'] = (d) => { d.spell = fx('Draw two cards.'); d.addCost = { discard: 1 }; return d; };
S['Light of Judgment'] = (d) => {
  d.spell = [{ k: 'dmgX', nFn: () => 6, tgt: { f: {} } }, fn((G, X) => {
    const c = X.last && X.last.c;
    if (!c) return;
    const eqs = equipmentOn(G, c);
    const e = pickOne(G, X.P, eqs, 'Destroy an Equipment attached to it', (x) => (x.ctrl === X.P.i ? -1 : x.def.value));
    if (e && e.ctrl !== X.P.i) destroyPermanent(G, X.P, e);
  }, { score: () => 0.2 })];
  d.role = 'removal';
  return d;
};
S['Mysidian Elder'] = (d) => { d.etb = [mkE(WIZARD)]; return d; };
S['Nibelheim Aflame'] = (d) => {
  d.spell = [fn((G, X, t) => {
    const c = t && t.c;
    if (c && onBf(G, c)) { const n = pow(c); for (const o of allCreatures(G).filter((x) => x !== c)) hit(G, X, o, n, c); }
    if (X.item && X.item.fromGy) { const hand = X.P.hand.splice(0); X.P.gy.push(...hand); if (hand.length) emit(G, 'discard', `${X.P.name} discards their hand.`, { who: X.P.i }); dirty(G); drawN(G, X.P, 4); }
  }, { tgt: tg(YOU), val: (G, P, c) => { const n = pow(c); return allCreatures(G).filter((o) => o !== c && L.lethalTo(o) <= n && !has(o, 'indestructible')).reduce((s, o) => s + (o.ctrl === P.i ? -cv(o) : cv(o)), 0); }, label: 'Choose a creature you control' })];
  d.role = 'sweeper';
  return d;
};
S['Opera Love Song'] = (d) => {
  d.modes = [
    { label: 'Exile the top two cards; you may play them until your next end step', eff: [fn((G, X) => { const u = untilMyNextEnd(G, X.P); impulse(G, X.P, u); impulse(G, X.P, u); }, { score: () => 1.6 })] },
    { label: 'One or two creatures each get +2/+0', eff: [{ k: 'pumpT', p: 2, t: 0, tgt: { f: {}, n: 2, min: 1 } }] },
  ];
  d.spell = null;
  return d;
};
S['Prompto Argentum'] = (d) => { d.trig.push(castNC(4, { eff: [{ k: 'treasure', n: 1 }] })); return d; };
S['Queen Brahne'] = (d) => { d.trig.push(T('attack', { self: true, eff: [mkE(WIZARD)] })); return d; };
S['Random Encounter'] = (d) => {
  d.spell = [fn((G, X) => {
    const P = X.P;
    G.rng.shuffle(P.library);
    emit(G, 'info', `${P.name} shuffles their library.`, { who: P.i });
    const milled = mill(G, P, 4).filter((c) => c.def.types.includes('Creature'));
    const back = [];
    for (const c of milled) { if (!P.gy.includes(c)) continue; putOntoBattlefield(G, P, c, {}); grantKw(G, c, ['haste']); back.push(c); }
    if (back.length) G.delayed.push({ when: 'end', run: (G2) => { for (const c of back) if (onBf(G2, c)) bounceCard(G2, P, c); } });
  }, { score: (G, P) => 2.5 })];
  return d;
};
S['Raubahn, Bull of Ala Mhigo'] = (d) => {
  d.wardCost = (G, P, c) => {
    const n = Math.max(0, pow(c));
    if (P.life <= n) return false;
    if (!yesNo(G, P, c, `Pay ${n} life for ${c.def.name}'s ward?`, P.life > n + 5)) return false;
    loseLife(G, P, n);
    return true;
  };
  d.trig.push(T('attack', { self: true, run: (G, X) => {
    const P = X.P;
    const eqs = P.bf.filter(isEquip), atk = P.bf.filter((c) => c.attacking);
    if (!eqs.length || !atk.length) return;
    let pick = null;
    if (isHuman(G, P)) { const eq = pickSome(G, P, eqs, 0, 1, 'Attach up to one Equipment you control', () => 0)[0]; if (eq) pick = { eq, to: pickOne(G, P, atk, `Attach ${eq.def.name} to an attacking creature`, () => 0) }; }
    else for (const eq of eqs) for (const c of atk) { if (eq.att === c.id) continue; const h = eq.att != null && byId(G, eq.att); const s = L.equipGain(G, P, eq, c) - (h ? L.equipGain(G, P, eq, h) * (h.attacking ? 1 : 0.3) : 0); if (s > 0.4 && (!pick || s > pick.s)) pick = { eq, to: c, s }; }
    if (pick && pick.to) attach(G, pick.eq, pick.to);
  } }));
  return d;
};
S["Red Mage's Rapier"] = (d) => {
  d.statics.push({ who: 'equipped', p: 0, t: 0, kw: [], addSub: ['Wizard'] });
  d.trig.push(castNC(0, { cond: (G, src, ev) => nonCre(ev) && src.att != null && !!byId(G, src.att), run: (G, X) => pump(G, byId(G, X.src.att), 2, 0) }));
  return d;
};
S['Sandworm'] = (d) => {
  d.etb = [fn((G, X, t) => {
    const c = t && t.c;
    if (!c || !onBf(G, c)) return;
    const Q = ctrlOf(G, c);
    destroyPermanent(G, X.P, c);
    if (isHuman(G, Q) && !yesNo(G, Q, X.src, 'Search for a basic land and put it onto the battlefield tapped?', true)) return;
    const got = searchLibrary(G, Q, (x) => isLand(x) && x.def.supertypes.includes('Basic'), 1, 'bfTapped', 'a basic land');
    if (got.length) emit(G, 'search', `${Q.name} puts ${got[0].def.name} onto the battlefield tapped.`, { who: Q.i, cards: [got[0].id] });
  }, { tgt: { f: { types: ['Land'] } }, val: (G, P, c) => (c.ctrl === P.i ? -2 : c.def.supertypes.includes('Basic') ? 0.2 : 1 + (c.def.mana || []).length * 0.3), label: 'Destroy a land' })];
  return d;
};
S['Seifer Almasy'] = (d) => {
  d.trig.push(T('attacks', { you: true, cond: (G, src, ev) => ev.cs.length === 1, run: (G, X) => grantKw(G, X.ev.cs[0], ['double strike']) }));
  d.trig.push(T('hitPlayer', { self: true, run: (G, X) => {
    const cs = X.P.gy.filter((c) => L.isIS(c.def) && c.def.mv <= 3 && !c.def.respondOnly && !(c.def.spell || []).some((e) => e.k === 'counter'));
    const c = pickSome(G, X.P, cs, 0, 1, 'You may cast an instant or sorcery (mana value 3 or less) for free', (x) => x.def.value, 'graveyard')[0];
    if (!c) return;
    c.fbExile = true;
    if (!L.castNow(G, X.P, c, { free: true, ask: false })) c.fbExile = false;
  } }));
  return d;
};
S['Self-Destruct'] = (d) => {
  d.spell = [
    fn(() => {}, { tgt: tg(YOU), val: (G, P, c) => pow(c) * 0.3 - cv(c) * 0.2, label: 'Choose a creature you control' }),
    fn((G, X, t) => { const c = X.last && X.last.c; if (!c || !onBf(G, c) || !t) return; const n = pow(c); hit(G, X, t.c ? t.c : t, n, c); hit(G, X, c, n, c); },
      { tgt: { what: 'any', f: {}, fn: (G, P, x, src, X) => !(X && X.last && X.last.c === x) }, val: (G, P, x) => (x.p != null && !x.def ? (x.p === P.i ? -5 : 1) : x.ctrl === P.i ? -cv(x) : cv(x)), label: 'Choose another target' }),
  ];
  return d;
};
S['Sidequest: Play Blitzball'] = (d) => {
  d.trig.push(T('combatStart', { you: true, eff: [{ k: 'pumpT', p: 2, t: 0, tgt: { f: YOU } }] }));
  d.trig.push(T('hitPlayer', { run: (G, X) => { const m = X.src.mem; if (m.bt !== G.turn) { m.bt = G.turn; m.bd = [0, 0]; } m.bd[X.ev.Q.i] += X.ev.n; } }));
  d.trig.push(T('combatEnd', { you: true, cond: (G, src) => src.mem.bt === G.turn && src.mem.bd.some((n) => n >= 6), run: (G, X) => {
    if (!transform(G, X.src)) return;
    const cs = X.P.bf.filter(isCreature);
    const to = pickOne(G, X.P, cs, `Attach ${X.src.def.name} to a creature you control`, (c) => cv(c));
    if (to) attach(G, X.src, to);
  } }));
  return d;
};
S['World Champion, Celestial Weapon'] = (d) => {
  if (!d.statics.some((x) => x.who === 'equipped')) d.statics.push({ who: 'equipped', p: 2, t: 0, kw: ['double strike'] });
  return d;
};
S["Sorceress's Schemes"] = (d) => {
  d.spell = [fn((G, X) => {
    const P = X.P;
    const cs = P.gy.filter((c) => isIS(c.def)).concat(P.exile.filter((c) => c.def.flashback));
    const c = pickOne(G, P, cs, 'Return an instant or sorcery card to your hand', (x) => x.def.value);
    if (c) { L.removeFromZones(G, c); P.hand.push(c); emit(G, 'raise', `${P.name} returns ${c.def.name} to hand.`, { who: P.i, cards: [c.id] }); }
    L.addPool(G, P, ['R']);
  }, { score: (G, P) => (P.gy.some((c) => isIS(c.def)) ? 1.8 : 0.1) })];
  return d;
};
S['Summon: Brynhildr'] = (d) => {
  const permit = (G, X) => { const c = (X.src.mem.chain && G.players.flatMap((Q) => Q.exile).find((x) => x.id === X.src.mem.chain)) || null; if (c) X.P.xcast.push({ card: c, until: G.turn }); };
  d.saga = [
    { ch: [1], eff: [fn((G, X) => { const c = impulse(G, X.P, G.turn, 'Chain'); if (c) X.src.mem.chain = c.id; }, { score: () => 1 })] },
    { ch: [2, 3], eff: [fn((G, X) => { permit(G, X); X.P.hasteNext = G.turn; say(G, X.P, `The next creature spell ${X.P.name} casts this turn gains haste.`); }, { score: () => 0.6 })] },
  ];
  return d;
};
S['Summon: Esper Ramuh'] = (d) => {
  const n = (P) => P.gy.filter((c) => !c.def.types.includes('Creature') && !c.def.types.includes('Land')).length;
  d.saga = [
    { ch: [1], eff: [{ k: 'dmgX', nFn: (G, X) => n(X.P), tgt: { f: OPP } }] },
    { ch: [2, 3], eff: [{ k: 'pumpAll', side: 'you', p: 1, t: 0, kw: [], f: { sub: 'Wizard' } }] },
  ];
  return d;
};
S['Summon: G.F. Cerberus'] = (d) => {
  d.saga = [
    { ch: [1], eff: fx('Surveil 1.') },
    { ch: [2], eff: [fn((G, X) => { X.P.copyNext = { turn: G.turn, n: 1 }; say(G, X.P, `The next instant or sorcery ${X.P.name} casts this turn is copied.`); }, { score: () => 0.8 })] },
    { ch: [3], eff: [fn((G, X) => { X.P.copyNext = { turn: G.turn, n: 2 }; say(G, X.P, `The next instant or sorcery ${X.P.name} casts this turn is copied twice.`); }, { score: () => 1 })] },
  ];
  return d;
};
S['Summon: G.F. Ifrit'] = (d) => {
  d.saga = [
    { ch: [1, 2], eff: [fn((G, X) => {
      const P = X.P;
      if (!P.hand.length) return;
      const ok = isHuman(G, P) ? yesNo(G, P, X.src, 'Discard a card to draw a card?', true) : Math.min(...P.hand.map((c) => handValue(G, P, c))) < 2;
      if (!ok) return;
      discardChoice(G, P, 1, 'rummage');
      drawN(G, P, 1);
    }, { score: () => 0.6 })] },
    { ch: [3, 4], eff: [fn((G, X) => { L.addPool(G, X.P, ['R']); say(G, X.P, `${X.P.name} adds {R}.`); }, { score: () => 0.5 })] },
  ];
  return d;
};
S['Suplex'] = (d) => {
  d.modes = [
    { label: '3 damage to a creature (exiled if it would die)', eff: [fn((G, X, t) => { const c = t && t.c; if (!c || !onBf(G, c)) return; c.exileDead = true; hit(G, X, c, 3); },
      { tgt: { f: {} }, val: (G, P, c) => (c.ctrl === P.i ? -cv(c) : L.lethalTo(c) <= 3 ? cv(c) + 0.5 : 0.1), label: 'Deal 3 damage to a creature' })] },
    { label: 'Exile an artifact', eff: [{ k: 'exileP', tgt: { f: { types: ['Artifact'] } } }] },
  ];
  d.spell = null;
  d.role = 'removal';
  return d;
};
S['Thunder Magic'] = (d) => {
  const z = (n) => [{ k: 'dmgX', nFn: () => n, tgt: { f: {} } }];
  d.modes = [
    { label: 'Thunder: 2 damage to a creature', eff: z(2) },
    { label: 'Thundara (+{3}): 4 damage to a creature', cost: C('{3}'), eff: z(4) },
    { label: 'Thundaga (+{5}{R}): 8 damage to a creature', cost: C('{5}{R}'), eff: z(8) },
  ];
  d.spell = null;
  d.role = 'removal';
  return d;
};
S['Triple Triad'] = (d) => {
  d.trig.push(T('upkeep', { you: true, run: (G, X) => {
    const tops = G.players.map((Q) => { const c = Q.library.pop(); if (c) Q.exile.push(c); return c; });
    const shown = tops.filter(Boolean);
    if (!shown.length) return;
    emit(G, 'exile', `Each player exiles the top card of their library: ${nameList(shown)}.`, { who: X.P.i, cards: shown.map((c) => c.id) });
    const mine = tops[X.P.i];
    if (!mine) return;
    X.P.xcast.push({ card: mine, until: G.turn, free: true });
    for (const c of shown) if (c !== mine && (c.def.mv || 0) < (mine.def.mv || 0)) X.P.xcast.push({ card: c, until: G.turn, free: true, anyType: true });
    dirty(G);
  } }));
  return d;
};
S['Unexpected Request'] = (d) => {
  d.spell = [fn((G, X, t) => {
    const c = t && t.c;
    if (!c || !onBf(G, c)) return;
    gainControl(G, X.P, c, 'eot');
    c.tapped = false;
    grantKw(G, c, ['haste']);
    const eqs = X.P.bf.filter(isEquip);
    if (!eqs.length) return;
    let eq = null;
    if (isHuman(G, X.P)) eq = pickSome(G, X.P, eqs, 0, 1, `You may attach an Equipment to ${c.def.name}`, () => 0)[0];
    else eq = eqs.filter((e) => e.att == null).sort((a, b) => L.equipGain(G, X.P, b, c) - L.equipGain(G, X.P, a, c))[0] || null;
    if (eq && attach(G, eq, c)) G.delayed.push({ when: 'end', run: (G2) => { if (eq.att === c.id) { eq.att = null; dirty(G2); } } });
  }, { tgt: { f: OPP }, val: (G, P, c) => (c.tapped ? 0.2 : pow(c) * 0.6 + 0.3), label: 'Gain control of a creature until end of turn' })];
  d.castIf = (G, P) => G.active === P.i;
  return d;
};
const THIEF = ['Scout', 'Pirate', 'Rogue'];
S['Vaan, Street Thief'] = (d) => {
  d.trig.push(T('hitPlayer', { once: true, cond: (G, src, ev) => ev.c && ev.c.ctrl === src.ctrl && THIEF.some((s) => hasSub(ev.c, s)), run: (G, X) => {
    const Q = X.ev.Q, P = X.P;
    const c = Q && Q.library.pop();
    if (!c) return;
    Q.exile.push(c);
    emit(G, 'exile', `${c.def.name} is exiled from the top of ${Q.name}'s library.`, { who: P.i, cards: [c.id] });
    const xc = { card: c, until: G.turn };
    P.xcast.push(xc);
    const cast = !isLand(c) && L.castNow(G, P, c, {});
    if (!cast) { P.xcast.splice(P.xcast.indexOf(xc), 1); mk(G, P, TREASURE, 1); }
  } }));
  d.trig.push(T('cast', { you: true, cond: (G, src, ev, Q) => ev.card.owner !== Q.i, run: (G, X) => { for (const c of X.P.bf.filter((x) => isCreature(x) && THIEF.some((s) => hasSub(x, s)))) addCounters(G, c, 1); } }));
  return d;
};
S['Zell Dincht'] = (d) => {
  d.extraLand = true;
  d.statics.push({ who: 'self', p: 0, t: 0, kw: [], pFn: (G, s) => G.players[s.ctrl].bf.filter(isLand).length });
  d.trig.push(T('endStep', { you: true, run: (G, X) => {
    const ls = X.P.bf.filter(isLand);
    const c = pickOne(G, X.P, ls, 'Return a land you control to its owner\'s hand', (x) => (x.def.adv ? 5 : 0) + (x.tapped ? 1 : 0) + (x.def.supertypes.includes('Basic') ? 0.5 : 0) - (x.def.mana || []).length * 0.2);
    if (c) bounceCard(G, X.P, c);
  } }));
  return d;
};


/* ============================ Green ============================ */
S['Airship Crash'] = (d) => {
  d.spell = [{ k: 'destroyP', tgt: { f: { types: ['Artifact', 'Enchantment', 'Creature'], fn: (G, c) => isArtifact(c) || isEnchantment(c) || has(c, 'flying') } } }];
  d.role = 'removal';
  return d;
};
S['Ancient Adamantoise'] = (d) => {
  d.keepDmg = true;
  d.soak = true;
  d.dies = [fn((G, X) => { const c = X.src, Q = G.players[c.owner]; if (Q.gy.includes(c)) { Q.gy.splice(Q.gy.indexOf(c), 1); Q.exile.push(c); } mk(G, X.P, TREASURE, 10, { tapped: true }); }, { score: () => 5, value: 4 })];
  return d;
};
const birds = (P) => P.bf.filter((c) => isCreature(c) && hasSub(c, 'Bird'));
S['Bartz and Boko'] = (d) => {
  d.costMod = (G, P) => birds(P).length;
  d.etb = [fn((G, X, t) => { const c = t && t.c; if (!c) return; for (const b of birds(X.P).filter((x) => x !== X.src)) if (onBf(G, c)) hit(G, X, c, pow(b), b); },
    { tgt: { f: OPP }, val: (G, P, c) => { const n = birds(P).reduce((s, b) => s + pow(b), 0); return n >= L.lethalTo(c) ? cv(c) : 0.1; }, label: 'Choose a creature an opponent controls' })];
  return d;
};
S['Cactuar'] = (d) => {
  d.etb = [fn((G, X) => { X.src.mem.et = G.turn; }, { score: () => 0, value: 0 })];
  d.trig.push(T('endStep', { you: true, cond: (G, src) => src.mem.et !== G.turn, run: (G, X) => bounceCard(G, X.P, X.src) }));
  return d;
};
const biteBy = (k) => [
  fn(() => {}, { tgt: tg(YOU), val: (G, P, c) => pow(c) * 0.4 + 0.2, label: 'Choose a creature you control' }),
  fn((G, X, t) => { const a = X.last && X.last.c, b = t && t.c; if (a && b && onBf(G, a) && onBf(G, b)) hit(G, X, b, pow(a) * k, a); },
    { tgt: { f: OPP }, val: (G, P, c) => { const best = Math.max(0, ...P.bf.filter(isCreature).map((x) => pow(x))) * k; return best >= L.lethalTo(c) ? cv(c) + 0.5 : 0.1; }, label: 'Choose a creature an opponent controls' }),
];
S['Chocobo Kick'] = (d) => {
  d.modes = [
    { label: 'Deal damage equal to its power', eff: biteBy(1) },
    { label: 'Kicked (return a land you control to hand): twice that damage', addCost: { bounceLand: true }, eff: biteBy(2) },
  ];
  d.spell = null;
  d.role = 'removal';
  return d;
};
S['Chocobo Racetrack'] = (d) => { d.trig.push(T('landfall', { you: true, eff: [mkE(BIRD)] })); return d; };
S['Clash of the Eikons'] = (d) => {
  const sagaF = { types: ['Enchantment'], side: 'you', fn: (G, c) => !!c.def.saga };
  d.modes = [
    { label: 'Your creature fights an opponent\'s creature', eff: [
      fn(() => {}, { tgt: tg(YOU), val: (G, P, c) => pow(c) * 0.4, label: 'Choose a creature you control' }),
      fn((G, X, t) => fightIt(G, X, X.last && X.last.c, t && t.c), { tgt: { f: OPP }, val: (G, P, c) => { const best = Math.max(0, ...P.bf.filter(isCreature).map((x) => pow(x))); return best >= L.lethalTo(c) ? cv(c) : 0.1; }, label: 'Choose a creature an opponent controls' })] },
    { label: 'Remove a lore counter from a Saga you control', eff: [fn((G, X, t) => { if (t && t.c) { removeCounters(G, t.c, 'lore', 1); say(G, X.P, `${t.c.def.name} loses a lore counter.`, [t.c.id]); } }, { tgt: { f: sagaF }, val: () => 0.6, label: 'Choose a Saga you control' })] },
    { label: 'Put a lore counter on a Saga you control', eff: [fn((G, X, t) => { if (t && t.c) L.addLore(G, X.P, t.c, 1); }, { tgt: { f: sagaF }, val: () => 1, label: 'Choose a Saga you control' })] },
  ];
  d.modeN = 2;
  d.spell = null;
  return d;
};
S['Coliseum Behemoth'] = (d) => {
  d.etb = [fn((G, X) => {
    const P = X.P;
    const cs = allPerms(G).filter((c) => (isArtifact(c) || isEnchantment(c)) && L.tgtOk(G, P, { tgt: { f: { types: ['Artifact', 'Enchantment'] } } }, c, X.src));
    const best = cs.filter((c) => c.ctrl !== P.i).sort((a, b) => pv(G, b) - pv(G, a))[0];
    const k = cs.length ? chooseMode(G, P, X.src, `${X.src.def.name}: choose one`, ['Destroy an artifact or enchantment', 'Draw a card'], best && pv(G, best) > 1.5 ? 0 : 1) : 1;
    if (k === 1) { drawN(G, P, 1); return; }
    const c = pickOne(G, P, cs, 'Destroy an artifact or enchantment', (x) => (x.ctrl === P.i ? -pv(G, x) : pv(G, x)));
    if (c) destroyPermanent(G, P, c);
  }, { score: () => 1.3 })];
  return d;
};
S['Commune with Beavers'] = (d) => {
  d.spell = [fn((G, X) => lookTake(G, X.P, 3, (c) => ['Artifact', 'Creature', 'Land'].some((t) => c.def.types.includes(t)), 1, 'Reveal an artifact, creature or land card'), { score: () => 1 })];
  return d;
};
S['Diamond Weapon'] = (d) => { d.costMod = (G, P) => gyPerms(P); d.noCombatDmg = true; return d; };
S['The Earth Crystal'] = (d) => {
  d.spellDiscount = discountFor('G');
  d.ctrDouble = true;
  d.acts.push({ cost: { m: C('{4}{G}{G}'), tap: true }, label: 'Distribute two +1/+1 counters among one or two creatures you control', when: ['main1', 'end'],
    eff: [fn((G, X, t) => { const cs = tcs(t).filter((c) => onBf(G, c)); if (cs.length === 1) addCounters(G, cs[0], 2); else for (const c of cs) addCounters(G, c, 1); },
      { tgt: { f: YOU, n: 2, min: 1 }, val: (G, P, c) => 0.8 + (has(c, 'trample') || has(c, 'flying') ? 0.3 : 0), label: 'Choose one or two creatures you control' })] });
  return d;
};
S['Esper Origins'] = (d) => {
  d.spell = [{ k: 'surveil', n: 2 }, { k: 'gain', n: 2 }, fn((G, X) => {
    if (!X.item || !X.item.fromGy) return;
    const c = X.item.card, Q = G.players[c.owner];
    const k = Q.exile.indexOf(c);
    if (k < 0) return;
    Q.exile.splice(k, 1);
    enterBattlefield(G, X.P, c, null, { transformed: true, ctr: { finality: 1 } });
  }, { score: () => 0.2 })];
  return d;
};
S['Summon: Esper Maduin'] = (d) => {
  d.saga = [
    { ch: [1], eff: [fn((G, X) => { const P = X.P, c = P.library[P.library.length - 1]; if (!c) return; emit(G, 'search', `${P.name} reveals ${c.def.name}.`, { who: P.i, cards: [c.id] }); if (permCard(c.def)) { P.library.pop(); P.hand.push(c); dirty(G); } }, { score: () => 0.7 })] },
    { ch: [2], eff: [fn((G, X) => { L.addPool(G, X.P, ['G', 'G']); say(G, X.P, `${X.P.name} adds {G}{G}.`); }, { score: () => 0.5 })] },
    { ch: [3], eff: [{ k: 'pumpAll', side: 'you', p: 2, t: 2, kw: ['trample'], f: { other: true } }] },
  ];
  return d;
};
S["Galuf's Final Act"] = (d) => {
  d.spell = [fn((G, X, t) => {
    const c = t && t.c;
    if (!c || !onBf(G, c)) return;
    pump(G, c, 1, 0);
    c.xtrig = (c.xtrig || []).concat(T('die', { self: true, eot: true, eff: [fn((G2, X2, t2) => { if (t2 && t2.c) addCounters(G2, t2.c, Math.max(0, X2.ev.pow || 0)); }, { tgt: { f: {}, min: 0 }, val: (G2, P2, x) => (x.ctrl === P2.i ? 1 + cv(x) * 0.1 : -1), label: 'Put the counters on up to one creature' })] }));
  }, { tgt: { f: {} }, val: (G, P, c, X, ctx) => (c.ctrl === P.i ? (ctx === 'combat' && (c.attacking || c.blocking) ? 1 + pow(c) * 0.3 : 0.2) : -0.5), label: 'Choose a creature' })];
  return d;
};
S['Gigantoad'] = (d) => { d.statics.push({ who: 'self', p: 2, t: 2, kw: [], cond: (G, s) => G.players[s.ctrl].bf.filter(isLand).length >= 7 }); return d; };
S['Gran Pulse Ochu'] = (d) => {
  d.acts.push({ cost: { m: C('{8}') }, label: '+1/+1 for each permanent card in your graveyard', when: ['blocks'],
    eff: [fn((G, X) => { const n = gyPerms(X.P); pump(G, X.src, n, n); }, { score: (G, P) => gyPerms(P) * 0.3 })] });
  return d;
};
S['Gysahl Greens'] = (d) => { d.spell = [mkE(BIRD)]; return d; };
S['Loporrit Scout'] = (d) => { d.trig.push(T('enter', { you: true, other: true, f: {}, run: (G, X) => pump(G, X.src, 1, 1) })); return d; };
const basicOrTown = (c) => isLand(c) && (c.def.supertypes.includes('Basic') || hasSub(c, 'Town'));
S["Prishe's Wanderings"] = (d) => {
  d.spell = [fn((G, X) => { const got = searchLibrary(G, X.P, basicOrTown, 1, 'bfTapped', 'a basic land or Town'); if (got.length) emit(G, 'search', `${X.P.name} puts ${got[0].def.name} onto the battlefield tapped.`, { who: X.P.i, cards: [got[0].id] }); }, { score: () => 1.4 }),
    fn((G, X, t) => { if (t && t.c) addCounters(G, t.c, 1); }, { tgt: tg(YOU), val: () => 0.7, label: 'Put a +1/+1 counter on a creature you control' })];
  return d;
};
S['Quina, Qu Gourmet'] = (d) => {
  d.tokenExtra = FROG;
  d.acts.push({ cost: { m: C('{2}'), sac: { sub: 'Frog' } }, eff: [{ k: 'countersSelf', n: 1 }], label: 'Put a +1/+1 counter on Quina', when: ['end', 'main2'] });
  return d;
};
S['Reach the Horizon'] = (d) => {
  d.spell = [fn((G, X) => {
    const first = searchLibrary(G, X.P, basicOrTown, 1, 'bfTapped', 'a basic land or Town');
    const name = first[0] && first[0].def.name;
    const second = searchLibrary(G, X.P, (c) => basicOrTown(c) && c.def.name !== name, 1, 'bfTapped', 'another with a different name');
    const got = first.concat(second);
    emit(G, 'search', got.length ? `${X.P.name} puts ${nameList(got)} onto the battlefield tapped.` : `${X.P.name} finds no land.`, { who: X.P.i, cards: got.map((c) => c.id) });
  }, { score: () => 2.2 })];
  return d;
};
S['A Realm Reborn'] = (d) => { d.realmReborn = true; d.value = 3; return d; };
S['Ride the Shoopuf'] = (d) => {
  d.trig.push(T('landfall', { you: true, eff: fx('Put a +1/+1 counter on target creature you control.') }));
  d.animate = (G, c) => !!c.mem.beast;
  d.ptFn = () => 7;
  d.subFn = (G, c) => (c.mem.beast ? c.def.sub.concat('Beast') : c.def.sub);
  d.acts.push({ cost: { m: C('{5}{G}{G}') }, label: 'Becomes a 7/7 Beast creature', when: ['main1'], cond: (G, P, c) => !c.mem.beast,
    eff: [fn((G, X) => { X.src.mem.beast = true; X.src.sick = false; dirty(G); say(G, X.P, `${X.src.def.name} becomes a 7/7 Beast creature.`, [X.src.id]); }, { score: () => 4 })] });
  return d;
};
S["Rydia's Return"] = (d) => {
  d.modes = [
    { label: 'Creatures you control get +3/+3', eff: [{ k: 'pumpAll', side: 'you', p: 3, t: 3, kw: [] }] },
    { label: 'Return up to two permanent cards from your graveyard to hand', eff: [fn((G, X, t) => { for (const c of tcs(t)) if (X.P.gy.includes(c)) { X.P.gy.splice(X.P.gy.indexOf(c), 1); X.P.hand.push(c); emit(G, 'raise', `${X.P.name} returns ${c.def.name} to hand.`, { who: X.P.i, cards: [c.id] }); } },
      { tgt: { what: 'gy', mine: true, f: { types: ['permanent'] }, n: 2, min: 0 }, val: (G, P, c) => 0.8 + c.def.value * 0.3, label: 'Return up to two permanent cards' })] },
  ];
  d.spell = null;
  return d;
};
S['Sazh Katzroy'] = (d) => {
  d.etb = [fn((G, X) => {
    if (isHuman(G, X.P) && !yesNo(G, X.P, X.src, 'Search for a Bird or basic land card?', true)) return;
    const got = searchLibrary(G, X.P, (c) => hasSub(c, 'Bird') || (isLand(c) && c.def.supertypes.includes('Basic')), 1, 'hand', 'a Bird or basic land');
    if (got.length) emit(G, 'search', `${X.P.name} reveals ${got[0].def.name} and puts it into their hand.`, { who: X.P.i, cards: [got[0].id] });
  }, { score: () => 1 })];
  d.trig.push(T('attack', { self: true, eff: [fn((G, X, t) => { const c = t && t.c; if (!c || !onBf(G, c)) return; addCounters(G, c, 1); if (c.cnt > 0) addCounters(G, c, c.cnt); },
    { tgt: { f: {} }, val: (G, P, c) => (c.ctrl === P.i ? 1 + (c.cnt || 0) + (c.attacking ? 0.5 : 0) : -2), label: 'Put a +1/+1 counter on a creature, then double its counters' })] }));
  return d;
};
S['Sidequest: Raise a Chocobo'] = (d) => {
  d.etb = [mkE(BIRD)];
  d.trig.push(T('mainStart', { you: true, cond: (G, s, ev, Q) => birds(Q).length >= 4, check: (G, s, ev, Q) => birds(Q).length >= 4, run: (G, X) => transform(G, X.src) }));
  return d;
};
S['Black Chocobo'] = (d) => {
  d.trig.push(T('transform', { self: true, cond: (G, src, ev) => ev.to === src.def, run: (G, X) => { const got = searchLibrary(G, X.P, isLand, 1, 'bfTapped', 'a land'); if (got.length) emit(G, 'search', `${X.P.name} puts ${got[0].def.name} onto the battlefield tapped.`, { who: X.P.i, cards: [got[0].id] }); } }));
  d.trig.push(T('landfall', { you: true, eff: [{ k: 'pumpAll', side: 'you', p: 1, t: 0, kw: [], f: { sub: 'Bird' } }] }));
  return d;
};
S['Summon: Fat Chocobo'] = (d) => {
  d.saga = [
    { ch: [1], eff: [mkE(BIRD)] },
    { ch: [2, 3, 4], eff: [{ k: 'pumpAll', side: 'you', p: 0, t: 0, kw: ['trample'] }] },
  ];
  return d;
};
S['Summon: Fenrir'] = (d) => {
  d.saga = [
    { ch: [1], eff: [fn((G, X) => { const got = searchLibrary(G, X.P, (c) => isLand(c) && c.def.supertypes.includes('Basic'), 1, 'bfTapped', 'a basic land'); if (got.length) emit(G, 'search', `${X.P.name} puts ${got[0].def.name} onto the battlefield tapped.`, { who: X.P.i, cards: [got[0].id] }); }, { score: () => 1.5 })] },
    { ch: [2], eff: [fn((G, X) => { X.P.ctrNext = { turn: G.turn, n: 1 }; say(G, X.P, `The next creature spell ${X.P.name} casts this turn enters with an additional +1/+1 counter.`); }, { score: () => 0.5 })] },
    { ch: [3], eff: [fn((G, X) => { const top = Math.max(0, ...allCreatures(G).map((c) => pow(c))); if (X.P.bf.some((c) => isCreature(c) && pow(c) === top)) drawN(G, X.P, 1); }, { score: () => 0.6 })] },
  ];
  return d;
};
S['Summon: Titan'] = (d) => {
  d.saga = [
    { ch: [1], eff: [{ k: 'mill', who: 'self', n: 5 }] },
    { ch: [2], eff: [fn((G, X) => { const ls = X.P.gy.filter((c) => c.def.types.includes('Land')); for (const c of ls) putOntoBattlefield(G, X.P, c, { tapped: true }); if (ls.length) emit(G, 'raise', `${nameList(ls)} return${ls.length === 1 ? 's' : ''} to the battlefield tapped.`, { who: X.P.i, cards: ls.map((c) => c.id) }); }, { score: (G, P) => P.gy.filter((c) => c.def.types.includes('Land')).length * 1.2 })] },
    { ch: [3], eff: [{ k: 'pumpT', p: 1, t: 1, kw: ['trample'], pFn: (G, X) => X.P.bf.filter(isLand).length, tFn: (G, X) => X.P.bf.filter(isLand).length, tgt: { f: YOU, other: true } }] },
  ];
  return d;
};
S["Summoner's Grimoire"] = (d) => {
  d.statics.push({ who: 'equipped', p: 0, t: 0, kw: [], addSub: ['Shaman'] });
  d.trig.push(T('attack', { hostOnly: true, run: (G, X) => {
    const P = X.P;
    const cs = P.hand.filter((c) => c.def.types.includes('Creature'));
    const c = pickSome(G, P, cs, 0, 1, 'You may put a creature card from your hand onto the battlefield', (x) => x.def.value + x.def.mv * 0.3, 'hand')[0];
    if (!c) return;
    const ench = c.def.types.includes('Enchantment');
    putOntoBattlefield(G, P, c, ench ? { tapped: true, attacking: true } : {});
    emit(G, 'enter', `${c.def.name} is put onto the battlefield${ench ? ' tapped and attacking' : ''}.`, { who: P.i, card: c.id });
  } }));
  return d;
};
S['Tifa Lockhart'] = (d) => { d.trig.push(T('landfall', { you: true, run: (G, X) => pump(G, X.src, Math.max(0, pow(X.src)), 0) })); return d; };
S["Tifa's Limit Break"] = (d) => {
  const pt = (k) => [{ k: 'pumpT', p: 1, t: 1, pFn: (G, X, c) => pow(c) * k, tFn: (G, X, c) => tou(c) * k, tgt: { f: {} } }];
  d.modes = [
    { label: 'Somersault: +2/+2', eff: [{ k: 'pumpT', p: 2, t: 2, tgt: { f: {} } }] },
    { label: 'Meteor Strikes (+{2}): double power and toughness', cost: C('{2}'), eff: pt(1) },
    { label: 'Final Heaven (+{6}{G}): triple power and toughness', cost: C('{6}{G}'), eff: pt(2) },
  ];
  d.spell = null;
  return d;
};
S['Torgal, A Fine Hound'] = (d) => {
  d.mana = L.ANY.slice();
  d.trig.push(T('cast', { you: true, cond: (G, src, ev, Q) => ev.card.def.types.includes('Creature') && ev.card.def.sub.includes('Human') && (Q.castDefs || []).filter((x) => x.types.includes('Creature') && x.sub.includes('Human')).length === 1,
    run: (G, X) => { const n = X.P.bf.filter((c) => isCreature(c) && (hasSub(c, 'Dog') || hasSub(c, 'Wolf'))).length; if (n) { X.ev.card.finCtr = (X.ev.card.finCtr || 0) + n; say(G, X.P, `${X.ev.card.def.name} will enter with ${n} additional +1/+1 counter${n > 1 ? 's' : ''}.`); } } }));
  return d;
};
S['Town Greeter'] = (d) => {
  d.etb = [fn((G, X) => {
    const P = X.P;
    const milled = mill(G, P, 4);
    const ls = milled.filter((c) => c.def.types.includes('Land') && P.gy.includes(c));
    const c = pickSome(G, P, ls, 0, 1, 'You may put a land card into your hand', (x) => 1 + (hasSub(x, 'Town') ? 1 : 0), 'graveyard')[0];
    if (!c) return;
    P.gy.splice(P.gy.indexOf(c), 1); P.hand.push(c);
    emit(G, 'raise', `${P.name} puts ${c.def.name} into their hand.`, { who: P.i, cards: [c.id] });
    if (c.def.sub.includes('Town')) gain(G, P, 2);
  }, { score: () => 1 })];
  return d;
};
S['Traveling Chocobo'] = (d) => {
  d.topCast = (G, P, card) => card.def.sub.includes('Bird');
  d.topLand = () => true;
  d.chocoEcho = true;
  return d;
};
S["Vanille, Cheerful l'Cie"] = (d) => {
  d.etb = [fn((G, X) => {
    const P = X.P;
    mill(G, P, 2);
    const cs = P.gy.filter((c) => permCard(c.def));
    const c = pickOne(G, P, cs, 'Return a permanent card to your hand', (x) => x.def.value);
    if (c) { P.gy.splice(P.gy.indexOf(c), 1); P.hand.push(c); emit(G, 'raise', `${P.name} returns ${c.def.name} to hand.`, { who: P.i, cards: [c.id] }); }
  }, { score: () => 1.5 })];
  const fangOf = (P) => P.bf.find((c) => c.def.name === "Fang, Fearless l'Cie" && c.owner === P.i && isCreature(c));
  d.trig.push(T('mainStart', { you: true, cond: (G, src, ev, Q) => src.owner === Q.i && !!fangOf(Q) && canPay(Q, C('{3}{B}{G}')), run: (G, X) => {
    const P = X.P, f = fangOf(P);
    if (!f || !onBf(G, X.src) || !canPay(P, C('{3}{B}{G}'))) return;
    if (!yesNo(G, P, X.src, 'Pay {3}{B}{G} to meld Vanille and Fang into Ragnarok, Divine Deliverance?', true)) return;
    if (!pay(P, C('{3}{B}{G}'))) return;
    const into = X.src.def.meldInto;
    if (into) L.meld(G, P, X.src, f, into);
  } }));
  return d;
};


/* ============================ Multicolored ============================ */
S['Absolute Virtue'] = (d) => { d.playerPro = true; return d; };
S['Balthier and Fran'] = (d) => {
  d.statics.push({ who: 'all', f: { types: ['any'], side: 'you', sub: 'Vehicle' }, p: 1, t: 1, kw: ['vigilance', 'reach'] });
  d.trig.push(T('attack', { you: true, cond: (G, src, ev) => hasSub(ev.c, 'Vehicle') && ev.c.crewBy && ev.c.crewBy.turn === G.turn && ev.c.crewBy.ids.includes(src.id) && (G.combatN || 1) === 1 && src.mem.bf !== G.turn,
    run: (G, X) => {
      if (!canPay(X.P, C('{1}{R}{G}')) || !yesNo(G, X.P, X.src, 'Pay {1}{R}{G} for an additional combat phase?', true) || !pay(X.P, C('{1}{R}{G}'))) return;
      X.src.mem.bf = G.turn; G.extraCombat = true;
      say(G, X.P, 'There will be an additional combat phase after this one.');
    } }));
  return d;
};
S['Black Waltz No. 3'] = (d) => { d.trig.push(castNC(0, { run: (G, X) => hitOpp(G, X, 2) })); return d; };
S['Choco, Seeker of Paradise'] = (d) => {
  d.trig.push(T('attacks', { you: true, cond: (G, src, ev) => ev.cs.some((c) => hasSub(c, 'Bird')), run: (G, X) => {
    const P = X.P, n = X.ev.cs.filter((c) => hasSub(c, 'Bird')).length;
    const top = P.library.splice(Math.max(0, P.library.length - n)).reverse();
    if (!top.length) return;
    const take = pickSome(G, P, top, 0, 1, 'You may put one into your hand', (c) => c.def.value + (isLand(c) ? -1 : 1), 'library', 'look');
    P.hand.push(...take);
    const rest = top.filter((c) => !take.includes(c));
    const lands = pickSome(G, P, rest.filter(isLand), 0, rest.length, 'Put any number of lands onto the battlefield tapped', () => 1, 'library', 'look');
    for (const c of lands) enterBattlefield(G, P, c, null, { tapped: true });
    const gy = rest.filter((c) => !lands.includes(c));
    P.gy.push(...gy);
    dirty(G);
    emit(G, 'search', `${P.name} looks at the top ${top.length}: ${take.length ? `${nameList(take)} to hand` : 'none to hand'}${lands.length ? `, ${nameList(lands)} onto the battlefield` : ''}${gy.length ? `, ${nameList(gy)} to the graveyard` : ''}.`, { who: P.i, cards: take.concat(lands).map((c) => c.id) });
  } }));
  d.landfall = [{ k: 'pumpSelf', p: 1, t: 0 }];
  return d;
};
const artificers = (P) => P.bf.filter((c) => hasSub(c, 'Artificer')).length + P.gy.filter((c) => c.def.sub.includes('Artificer')).length;
S['Cid, Timeless Artificer'] = (d) => {
  d.statics.push({ who: 'all', f: { side: 'you', fn: (G, c) => isArtifact(c) || hasSub(c, 'Hero') }, p: 0, t: 0, kw: [], pFn: (G, s) => artificers(G.players[s.ctrl]), tFn: (G, s) => artificers(G.players[s.ctrl]) });
  d.anyNumber = true;
  return d;
};
S['Cloud of Darkness'] = (d) => {
  d.etb = [{ k: 'pumpT', p: -1, t: -1, pFn: (G, X) => -gyPerms(X.P), tFn: (G, X) => -gyPerms(X.P), tgt: { f: OPP } }];
  d.role = 'removal';
  return d;
};
S['Emet-Selch, Unsundered'] = (d) => {
  d.etb = [{ k: 'loot', n: 1, d: 1 }];
  d.trig.push(T('attack', { self: true, eff: [{ k: 'loot', n: 1, d: 1 }] }));
  d.trig.push(T('upkeep', { you: true, cond: (G, s, ev, Q) => Q.gy.length >= 14, may: true, mayAi: () => true, mayLabel: 'Transform Emet-Selch into Hades?', run: (G, X) => transform(G, X.src) }));
  return d;
};
S['Hades, Sorcerer of Eld'] = (d) => {
  d.gyCast = (G, P, card, src) => G.active === P.i;
  d.gyLand = (G, P) => G.active === P.i;
  d.gyToExile = true;
  return d;
};
S['The Emperor of Palamecia'] = (d) => {
  d.manaAbs = [{ colors: ['U', 'R'], only: (pu) => !!pu.def && !pu.def.types.includes('Creature') }];
  d.trig.push(castNC(4, { run: (G, X) => { addCounters(G, X.src, 1); if (X.src.cnt >= 3) transform(G, X.src); } }));
  return d;
};
S['The Lord Master of Hell'] = (d) => {
  d.trig.push(T('attack', { self: true, run: (G, X) => hitOpp(G, X, X.P.gy.filter((c) => !c.def.types.includes('Creature') && !c.def.types.includes('Land')).length) }));
  return d;
};
S['Exdeath, Void Warlock'] = (d) => {
  d.etb = [{ k: 'gain', n: 3 }];
  d.trig.push(T('endStep', { you: true, cond: (G, s, ev, Q) => gyPerms(Q) >= 6, check: (G, s, ev, Q) => gyPerms(Q) >= 6, run: (G, X) => transform(G, X.src) }));
  return d;
};
S["Neo Exdeath, Dimension's End"] = (d) => { d.power = 0; d.statics.push({ who: 'self', p: 0, t: 0, kw: [], pFn: (G, s) => gyPerms(G.players[s.ctrl]) }); return d; };
S['Garland, Knight of Cornelia'] = (d) => {
  d.trig.push(castNC(0, { eff: fx('Surveil 1.') }));
  d.gyActs = [{ cost: { m: C('{3}{B}{B}{R}{R}') }, sorcery: true, label: 'Return it to the battlefield as Chaos, the Endless',
    eff: [fn((G, X) => { if (X.P.gy.includes(X.src)) putOntoBattlefield(G, X.P, X.src, { transformed: true }); }, { score: () => 5 })], ai: () => ({ score: 5 }) }];
  return d;
};
S['Chaos, the Endless'] = (d) => {
  d.dies = [fn((G, X) => { const c = X.src, Q = G.players[c.owner]; if (Q.gy.includes(c)) { Q.gy.splice(Q.gy.indexOf(c), 1); Q.library.unshift(c); emit(G, 'info', `${c.def.name} is put on the bottom of ${Q.name}'s library.`, { who: Q.i }); } }, { score: () => 0, value: 0 })];
  return d;
};
S['Garnet, Princess of Alexandria'] = (d) => {
  d.trig.push(T('attack', { self: true, run: (G, X) => {
    const sagas = X.P.bf.filter((c) => c.def.saga && ctrCount(c, 'lore') > 0);
    const pick = pickSome(G, X.P, sagas, 0, sagas.length, 'Remove a lore counter from any number of Sagas', () => 1);
    let n = 0;
    for (const c of pick) n += removeCounters(G, c, 'lore', 1);
    if (n) { addCounters(G, X.src, n); dirty(G); }
  } }));
  return d;
};
const rummageMay = (G, X, label) => {
  const P = X.P;
  if (!P.hand.length) return;
  const ok = isHuman(G, P) ? yesNo(G, P, X.src, label || 'Discard a card to draw a card?', true) : Math.min(...P.hand.map((c) => handValue(G, P, c))) < 2;
  if (!ok) return;
  discardChoice(G, P, 1, 'rummage');
  drawN(G, P, 1);
};
S['Giott, King of the Dwarves'] = (d) => {
  d.trig.push(T('enter', { you: true, f: { types: ['any'], fn: (G, c) => (isCreature(c) && hasSub(c, 'Dwarf')) || isEquip(c) }, run: (G, X) => rummageMay(G, X) }));
  return d;
};
S['Gladiolus Amicitia'] = (d) => {
  d.etb = [fn((G, X) => { const got = searchLibrary(G, X.P, isLand, 1, 'bfTapped', 'a land'); if (got.length) emit(G, 'search', `${X.P.name} puts ${got[0].def.name} onto the battlefield tapped.`, { who: X.P.i, cards: [got[0].id] }); }, { score: () => 1.5 })];
  d.trig.push(T('landfall', { you: true, eff: [{ k: 'pumpT', p: 2, t: 2, kw: ['trample'], tgt: { f: YOU, other: true } }] }));
  return d;
};
S['Golbez, Crystal Collector'] = (d) => {
  d.trig.push(T('enter', { you: true, f: { types: ['Artifact'] }, eff: fx('Surveil 1.') }));
  d.trig.push(T('endStep', { you: true, cond: (G, s, ev, Q) => nArt(Q) >= 4, eff: [fn((G, X, t) => {
    const c = t && t.c;
    if (!c || !X.P.gy.includes(c)) return;
    X.P.gy.splice(X.P.gy.indexOf(c), 1); X.P.hand.push(c);
    emit(G, 'raise', `${X.P.name} returns ${c.def.name} to hand.`, { who: X.P.i, cards: [c.id] });
    if (nArt(X.P) >= 8) loseLife(G, X.O, Math.max(0, +c.def.power || 0), X.P.i);
  }, { tgt: { what: 'gy', mine: true, f: { types: ['Creature'] } }, val: (G, P, c) => 0.8 + c.def.value * 0.3 + (+c.def.power || 0) * 0.1, label: 'Return a creature card to your hand' })] }));
  return d;
};
S['Hope Estheim'] = (d) => {
  d.trig.push(T('endStep', { you: true, cond: (G, s, ev, Q) => (Q.gainedTurn || 0) > 0, run: (G, X) => mill(G, X.O, X.P.gainedTurn || 0) }));
  return d;
};
S['Ignis Scientia'] = (d) => {
  d.etb = [fn((G, X) => {
    const P = X.P, top = P.library.splice(Math.max(0, P.library.length - 6)).reverse();
    if (!top.length) return;
    const land = pickSome(G, P, top.filter(isLand), 0, 1, 'You may put a land onto the battlefield tapped', () => 1, 'library', 'look')[0];
    const rest = top.filter((c) => c !== land);
    G.rng.shuffle(rest); P.library.unshift(...rest);
    if (land) { enterBattlefield(G, P, land, null, { tapped: true }); emit(G, 'search', `${P.name} puts ${land.def.name} onto the battlefield tapped.`, { who: P.i, cards: [land.id] }); }
  }, { score: () => 1.3 })];
  d.acts.push({ cost: { m: C('{1}{G}{U}'), tap: true }, label: 'Exile a card from a graveyard; a creature card makes a Food', when: ['end'],
    eff: [fn((G, X, t) => { const c = t && t.c; const Q = c && G.players.find((q) => q.gy.includes(c)); if (!Q) return; Q.gy.splice(Q.gy.indexOf(c), 1); Q.exile.push(c); emit(G, 'exile', `${c.def.name} is exiled from ${Q.name}'s graveyard.`, { who: X.P.i, cards: [c.id] }); if (c.def.types.includes('Creature')) mk(G, X.P, FOOD, 1); },
      { tgt: { what: 'gy', f: {} }, val: (G, P, c) => (c.def.types.includes('Creature') ? 1 : 0.2) + (G.players[c.owner] !== P ? c.def.value * 0.2 : -0.3), label: 'Exile a card from a graveyard' })] });
  return d;
};
S['Jenova, Ancient Calamity'] = (d) => {
  d.trig.push(T('combatStart', { you: true, eff: [fn((G, X, t) => { const c = t && t.c; if (!c || !onBf(G, c)) return; addCounters(G, c, Math.max(0, pow(X.src))); c.addSubs = (c.addSubs || []).concat('Mutant'); dirty(G); },
    { tgt: { f: {}, other: true, min: 0 }, val: (G, P, c) => (c.ctrl === P.i ? 1.5 + (has(c, 'trample') || has(c, 'flying') ? 0.4 : 0) : -2), label: 'Put +1/+1 counters on another creature' })] }));
  d.trig.push(T('die', { you: true, cond: (G, src, ev) => G.active === src.ctrl && (ev.sub || []).includes('Mutant'), run: (G, X) => drawN(G, X.P, Math.max(0, X.ev.pow || 0)) }));
  return d;
};
S["Joshua, Phoenix's Dominant"] = (d) => {
  d.etb = [fn((G, X) => {
    const P = X.P;
    const max = Math.min(2, P.hand.length);
    const n = isHuman(G, P) ? (max ? chooseNumber(G, P, X.src, 'Discard up to two cards, then draw that many', 0, max, max) : 0) : Math.min(max, P.hand.filter((c) => handValue(G, P, c) < 2).length);
    if (n) { discardChoice(G, P, n, 'rummage'); drawN(G, P, n); }
  }, { score: () => 0.6 })];
  d.acts.push(Object.assign(blinkT('{3}{R}{W}', 'Become Phoenix, Warden of Fire'), { cost: { m: C('{3}{R}{W}'), tap: true } }));
  return d;
};
S['Phoenix, Warden of Fire'] = (d) => {
  d.saga = [
    { ch: [1, 2], eff: [fn((G, X) => hitOpp(G, X, 2), { score: () => 1 })] },
    { ch: [3], eff: [fn((G, X) => {
      const P = X.P;
      const cs = P.gy.filter((c) => c.def.types.includes('Creature') && c.def.mv <= 6);
      let left = 6;
      const pick = [];
      if (isHuman(G, P)) { for (const c of pickSome(G, P, cs, 0, cs.length, 'Return creature cards with total mana value 6 or less', () => 0, 'graveyard')) if (c.def.mv <= left) { pick.push(c); left -= c.def.mv; } }
      else for (const c of cs.sort((a, b) => b.def.value - a.def.value)) if (c.def.mv <= left) { pick.push(c); left -= c.def.mv; }
      for (const c of pick) putOntoBattlefield(G, P, c, {});
      if (pick.length) emit(G, 'raise', `${nameList(pick)} return${pick.length === 1 ? 's' : ''} to the battlefield.`, { who: P.i, cards: pick.map((c) => c.id) });
      blink(G, X.src);
    }, { score: () => 3 })] },
  ];
  return d;
};
S['Judge Magister Gabranth'] = (d) => {
  d.trig.push(T('toGy', { you: true, other: true, cond: (G, src, ev) => !!ev.c && (ev.c.def.types.includes('Creature') || ev.c.def.types.includes('Artifact')), run: (G, X) => addCounters(G, X.src, 1) }));
  return d;
};
const kefka = (G, X) => {
  const types = new Set();
  for (const Q of [X.P, X.O]) {
    if (!Q.hand.length) continue;
    const before = Q.gy.length;
    discardChoice(G, Q, 1, 'discard');
    emit(G, 'discard', `${Q.name} discards a card.`, { who: Q.i });
    const c = Q.gy.length > before ? Q.gy[Q.gy.length - 1] : null;
    if (c) for (const t of ['Artifact', 'Creature', 'Enchantment', 'Instant', 'Land', 'Sorcery', 'Battle', 'Planeswalker', 'Kindred']) if (c.def.types.includes(t)) types.add(t);
  }
  drawN(G, X.P, types.size);
};
S['Kefka, Court Mage'] = (d) => {
  d.etb = [fn(kefka, { score: (G, P) => 1.5 })];
  d.trig.push(T('attack', { self: true, run: kefka }));
  d.acts.push({ cost: { m: C('{8}') }, sorcery: true, label: 'Each opponent sacrifices a permanent; transform Kefka',
    eff: [fn((G, X) => { edictOf(G, X.O, () => true); transform(G, X.src); }, { score: () => 5 })], ai: () => ({ score: 5 }) });
  return d;
};
S['Kefka, Ruler of Ruin'] = (d) => {
  d.trig.push(T('lostLife', { opp: true, cond: (G, src) => G.active === src.ctrl, run: (G, X) => drawN(G, X.P, X.ev.n) }));
  return d;
};
S['Kuja, Genome Sorcerer'] = (d) => {
  d.trig.push(T('endStep', { you: true, run: (G, X) => { mk(G, X.P, WIZARD, 1, { tapped: true }); if (X.P.bf.filter((c) => isCreature(c) && hasSub(c, 'Wizard')).length >= 4) transform(G, X.src); } }));
  return d;
};
S['Trance Kuja, Fate Defied'] = (d) => { d.wizardDouble = true; return d; };
S['Lightning, Army of One'] = (d) => {
  d.trig.push(T('hitPlayer', { self: true, run: (G, X) => { const Q = X.ev.Q; if (!Q) return; G.stagger = (G.stagger || []).filter((x) => x.until > G.turn).concat({ p: Q.i, until: G.turn + 2 }); say(G, X.P, `Damage to ${Q.name} and their permanents is doubled until ${X.P.name}'s next turn.`); } }));
  return d;
};
S['Noctis, Prince of Lucis'] = (d) => {
  d.gyCast = (G, P, card) => card.def.types.includes('Artifact');
  d.gyCastLife = 3;
  d.gyCastFinality = () => true;
  return d;
};
S['Omega, Heartless Evolution'] = (d) => {
  const nb = (P) => P.bf.filter((c) => isLand(c) && !c.def.supertypes.includes('Basic')).length;
  d.etb = [fn((G, X, t) => {
    const x = nb(X.P);
    const c = t && t.c;
    if (c && onBf(G, c)) { c.tapped = true; if (x) addCounters(G, c, x, 'stun'); emit(G, 'tapfx', `${c.def.name} is tapped${x ? ` with ${x} stun counter${x > 1 ? 's' : ''}` : ''}.`, { who: X.P.i, cards: [c.id] }); }
    gain(G, X.P, x);
  }, { tgt: { f: { types: ['nonland'], side: 'opp' }, min: 0 }, val: (G, P, c) => pv(G, c) * 0.4 + nb(P) * 0.3, label: 'Tap a nonland permanent an opponent controls' })];
  return d;
};
S['Rinoa Heartilly'] = (d) => {
  d.etb = [mkE(ANGELO)];
  d.trig.push(T('attack', { self: true, eff: [{ k: 'pumpT', p: 1, t: 1, pFn: (G, X) => nCre(X.P), tFn: (G, X) => nCre(X.P), tgt: { f: YOU, other: true } }] }));
  return d;
};
S['Rufus Shinra'] = (d) => {
  d.trig.push(T('attack', { self: true, cond: (G, src, ev, Q) => !Q.bf.some((c) => isCreature(c) && c.def.name === 'Darkstar'), eff: [mkE(DARKSTAR)] }));
  return d;
};
S['Rydia, Summoner of Mist'] = (d) => {
  d.trig.push(T('landfall', { you: true, run: (G, X) => rummageMay(G, X) }));
  const sagas = (P, x) => P.gy.filter((c) => c.def.sub.includes('Saga') && (x == null || c.def.mv === x));
  d.acts.push({ cost: { m: Object.assign(C('{0}'), { x: 1 }), tap: true }, sorcery: true, label: 'Return a Saga card with mana value X with a finality counter',
    eff: [fn((G, X, t) => { const c = t && t.c; if (!c || !X.P.gy.includes(c) || c.def.mv !== (X.x || 0)) return; putOntoBattlefield(G, X.P, c, { ctr: { finality: 1 } }); grantKw(G, c, ['haste']); },
      { tgt: { what: 'gy', mine: true, f: { types: ['Saga'], fn: (dd, card, G) => true } }, val: (G, P, c) => c.def.value, label: 'Choose a Saga card' })],
    ai: (G, P, c) => {
      let best = null;
      for (const s of sagas(P)) if (canPay(P, L.genericCost(s.def.mv)) && (!best || s.def.value > best.def.value)) best = s;
      return best ? { score: 1 + best.def.value, targets: [{ c: best }], x: best.def.mv } : null;
    } });
  return d;
};
const serahDiscount = (G, P, card) => (card.def.types.includes('Creature') && card.def.supertypes.includes('Legendary') && !(P.castDefs || []).some((x) => x.types.includes('Creature') && x.supertypes.includes('Legendary')) ? 2 : 0);
S['Serah Farron'] = (d) => {
  d.spellDiscount = serahDiscount;
  d.trig.push(T('combatStart', { you: true, cond: (G, src, ev, Q) => Q.bf.filter((c) => c !== src && isCreature(c) && isLegendary(c)).length >= 2, may: true, mayAi: () => true, mayLabel: 'Transform Serah Farron into Crystallized Serah?', run: (G, X) => transform(G, X.src) }));
  return d;
};
S['Crystallized Serah'] = (d) => {
  d.spellDiscount = serahDiscount;
  d.statics.push({ who: 'all', f: { side: 'you', legendary: true }, p: 2, t: 2, kw: [] });
  return d;
};
S['Shantotto, Tactician Magician'] = (d) => {
  d.trig.push(castNC(0, { run: (G, X) => { const n = spent(X.ev); if (n > 0) pump(G, X.src, n, 0); if (n >= 4) drawN(G, X.P, 1); } }));
  return d;
};
const sinPull = (G, X) => {
  const P = X.P;
  for (let guard = 0; guard < 10; guard++) {
    const cs = P.gy.filter((c) => permCard(c.def));
    if (!cs.length) return;
    const c = cs[G.rng.int(cs.length)];
    P.gy.splice(P.gy.indexOf(c), 1); P.exile.push(c);
    const k = copyToken(G, P, c, {}, { tapped: true });
    emit(G, 'token', `${P.name} exiles ${c.def.name} at random and creates a tapped token copy of it.`, { who: P.i, cards: [k.id] });
    if (!c.def.types.includes('Land')) return;
  }
};
S["Sin, Spira's Punishment"] = (d) => {
  d.etb = [fn(sinPull, { score: (G, P) => (P.gy.some((c) => permCard(c.def)) ? 2.5 : 0) })];
  d.trig.push(T('attack', { self: true, run: sinPull }));
  return d;
};
S['Squall, SeeD Mercenary'] = (d) => {
  d.trig.push(T('attacks', { you: true, cond: (G, src, ev) => ev.cs.length === 1, run: (G, X) => grantKw(G, X.ev.cs[0], ['double strike']) }));
  d.trig.push(T('hitPlayer', { self: true, eff: [{ k: 'regrow', to: 'bf', tgt: { what: 'gy', mine: true, f: { types: ['permanent'], mvLE: 3 } } }] }));
  return d;
};
S['Tellah, Great Sage'] = (d) => {
  d.trig.push(castNC(0, { run: (G, X) => {
    mk(G, X.P, HERO, 1);
    const n = spent(X.ev);
    if (n >= 4) drawN(G, X.P, 2);
    if (n >= 8 && onBf(G, X.src)) { emit(G, 'sac', `${X.P.name} sacrifices ${X.src.def.name}.`, { who: X.P.i, cards: [X.src.id] }); sacrifice(G, X.P, X.src, true); hitOpp(G, X, n); }
  } }));
  return d;
};
S['Terra, Magical Adept'] = (d) => {
  d.etb = [fn((G, X) => {
    const P = X.P;
    const milled = mill(G, P, 5).filter((c) => c.def.types.includes('Enchantment') && P.gy.includes(c));
    const c = pickSome(G, P, milled, 0, 1, 'Put up to one enchantment card into your hand', (x) => x.def.value, 'graveyard')[0];
    if (c) { P.gy.splice(P.gy.indexOf(c), 1); P.hand.push(c); emit(G, 'raise', `${P.name} puts ${c.def.name} into their hand.`, { who: P.i, cards: [c.id] }); }
  }, { score: () => 1.2 })];
  d.acts.push(Object.assign(blinkT('{4}{R}{G}', 'Become Esper Terra'), { cost: { m: C('{4}{R}{G}'), tap: true } }));
  return d;
};
S['Esper Terra'] = (d) => {
  d.saga = [
    { ch: [1, 2, 3], eff: [fn((G, X, t) => {
      const c = t && t.c;
      if (!c || !onBf(G, c)) return;
      const k = copyToken(G, X.P, c, {}, { haste: true });
      emit(G, 'token', `${X.P.name} creates a token copy of ${c.def.name}.`, { who: X.P.i, cards: [k.id] });
      if (k.def.saga && onBf(G, k)) {
        const left = L.sagaFinal(k.def) - ctrCount(k, 'lore');
        const n = isHuman(G, X.P) ? chooseNumber(G, X.P, X.src, 'Put up to three lore counters on it', 0, 3, Math.min(3, left)) : Math.min(3, left);
        if (n > 0) L.addLore(G, X.P, k, n);
      }
      const P = X.P;
      G.delayed.push({ when: 'end', at: null, run: (G2) => { if (onBf(G2, k)) { emit(G2, 'sac', `${k.def.name} is sacrificed.`, { who: P.i, cards: [k.id] }); sacrifice(G2, P, k, true); } } });
    }, { tgt: { f: { types: ['Enchantment'], side: 'you', nonlegendary: true } }, val: (G, P, c) => pv(G, c) + 1, label: 'Copy a nonlegendary enchantment you control' })] },
    { ch: [4], eff: [fn((G, X) => { L.addPool(G, X.P, ['W', 'W', 'U', 'U', 'B', 'B', 'R', 'R', 'G', 'G']); say(G, X.P, `${X.P.name} adds {W}{W}{U}{U}{B}{B}{R}{R}{G}{G}.`); blink(G, X.src); }, { score: () => 3 })] },
  ];
  return d;
};
S['Tidus, Blitzball Star'] = (d) => {
  d.trig.push(T('enter', { you: true, f: { types: ['Artifact'] }, run: (G, X) => addCounters(G, X.src, 1) }));
  d.trig.push(T('attack', { self: true, eff: [{ k: 'tapP', tgt: { f: OPP } }] }));
  return d;
};
S['Ultimecia, Time Sorceress'] = (d) => {
  d.etb = fx('Surveil 2.');
  d.trig.push(T('attack', { self: true, eff: fx('Surveil 2.') }));
  d.trig.push(T('endStep', { you: true, cond: (G, s, ev, Q) => Q.gy.length >= 8 && canPay(Q, C('{4}{U}{U}{B}{B}')), run: (G, X) => {
    const P = X.P;
    if (!yesNo(G, P, X.src, 'Pay {4}{U}{U}{B}{B} and exile eight cards from your graveyard to transform Ultimecia?', true) || !pay(P, C('{4}{U}{U}{B}{B}'))) return;
    const ex = isHuman(G, P) ? pickCards(G, { type: 'choose', reason: 'exile-cost', n: 8, min: 8, max: 8, zone: 'graveyard', cards: P.gy.map((c) => c.id), label: X.src.def.name }, P.gy.slice(), 8) : P.gy.slice().sort((a, b) => a.def.value - b.def.value).slice(0, 8);
    for (const c of ex) { P.gy.splice(P.gy.indexOf(c), 1); P.exile.push(c); }
    transform(G, X.src);
  } }));
  return d;
};
S['Ultimecia, Omnipotent'] = (d) => {
  d.trig.push(T('transform', { self: true, cond: (G, src, ev) => ev.to === src.def, run: (G, X) => { G.extraTurns.push(X.P.i); say(G, X.P, `${X.P.name} will take an extra turn after this one.`); } }));
  return d;
};
S['Vivi Ornitier'] = (d) => {
  d.manaAbs = [{ colors: ['U', 'R'], tap: false, once: true, amountFn: (G, c) => Math.max(0, pow(c)), cond: (G, c, P) => G.active === P.i }];
  d.trig.push(castNC(0, { run: (G, X) => { addCounters(G, X.src, 1); hitOpp(G, X, 1); } }));
  return d;
};
S['The Wandering Minstrel'] = (d) => {
  d.landsUntapped = true;
  d.trig.push(T('combatStart', { you: true, cond: (G, s, ev, Q) => nTowns(Q) >= 5, eff: [mkE(ELEMENTAL)] }));
  d.acts.push({ cost: { m: C('{3}{W}{U}{B}{R}{G}') }, label: 'Other creatures you control get +X/+X (X = Towns)', when: ['main1', 'blocks'],
    eff: [fn((G, X) => { const n = nTowns(X.P); for (const c of X.P.bf.filter((x) => isCreature(x) && x !== X.src)) { c.tp += n; c.tt += n; } dirty(G); say(G, X.P, `${X.P.name}'s other creatures get +${n}/+${n} until end of turn.`); }, { score: (G, P) => nTowns(P) * (nCre(P) - 1) * 0.4 })] });
  return d;
};
S['Yuna, Hope of Spira'] = (d) => {
  d.statics.push({ who: 'all', f: { side: 'you', fn: (G, c, P, src) => c === src || (isEnchantment(c) && isCreature(c)) }, cond: myTurn, p: 0, t: 0, kw: ['trample', 'lifelink'], ward: 2 });
  d.trig.push(T('endStep', { you: true, eff: [fn((G, X, t) => { const c = t && t.c; if (c && X.P.gy.includes(c)) putOntoBattlefield(G, X.P, c, { ctr: { finality: 1 } }); },
    { tgt: { what: 'gy', mine: true, f: { types: ['Enchantment'] }, min: 0 }, val: (G, P, c) => 1 + c.def.value * 0.5, label: 'Return an enchantment card with a finality counter' })] }));
  return d;
};
S['Zidane, Tantalus Thief'] = (d) => {
  d.etb = [fn((G, X, t) => { const c = t && t.c; if (!c || !onBf(G, c)) return; gainControl(G, X.P, c, 'eot'); c.tapped = false; grantKw(G, c, ['lifelink', 'haste']); },
    { tgt: { f: OPP }, val: (G, P, c) => 0.5 + pow(c) * 0.5, label: 'Gain control of a creature until end of turn' })];
  d.trig.push(T('ctrlChange', { cond: (G, src, ev) => ev.from === src.ctrl && ev.to !== src.ctrl, eff: [{ k: 'treasure', n: 1 }] }));
  return d;
};


/* ============================ Artifacts ============================ */
S["Adventurer's Airship"] = (d) => { d.trig.push(T('attack', { self: true, eff: [{ k: 'loot', n: 1, d: 1 }] })); return d; };
S['Aettir and Priwen'] = (d) => { d.statics.push({ who: 'equipped', p: 0, t: 0, kw: [], baseFn: (G, s) => Math.max(0, G.players[s.ctrl].life) }); return d; };
S['Blitzball'] = (d) => {
  d.mana = L.ANY.slice();
  d.trig.push(T('hitPlayer', { cond: (G, src, ev) => ev.c && isLegendary(ev.c) && ev.Q && ev.Q.i !== src.ctrl, run: (G, X) => { X.src.mem.goal = G.turn; } }));
  d.acts.push({ cost: { tap: true, sacSelf: true }, label: 'GOOOOAAAALLL! Draw two cards', cond: (G, P, c) => c.mem.goal === G.turn, eff: fx('Draw two cards.'), ai: () => ({ score: 2 }) });
  return d;
};
S['Buster Sword'] = (d) => {
  d.trig.push(T('hitPlayer', { hostOnly: true, run: (G, X) => {
    drawN(G, X.P, 1);
    const n = X.ev.n || 0;
    const cs = X.P.hand.filter((c) => !isLand(c) && c.def.mv <= n && !c.def.respondOnly && !(c.def.spell || []).some((e) => e.k === 'counter'));
    const c = pickSome(G, X.P, cs, 0, 1, `You may cast a spell with mana value ${n} or less for free`, (x) => x.def.value + x.def.mv * 0.3, 'hand')[0];
    if (c) L.castNow(G, X.P, c, { free: true, ask: false });
  } }));
  return d;
};
S['Elixir'] = (d) => {
  d.etbTapped = true;
  d.acts.push({ cost: { m: C('{5}'), tap: true, exileSelfBf: true }, label: 'Shuffle your graveyard\'s nonland cards into your library; gain that much life', when: ['end', 'main2'],
    eff: [fn((G, X) => { const P = X.P; const cs = P.gy.filter((c) => !c.def.types.includes('Land')); P.gy = P.gy.filter((c) => c.def.types.includes('Land')); P.library.push(...cs); G.rng.shuffle(P.library); dirty(G); emit(G, 'info', `${P.name} shuffles ${cs.length} cards into their library.`, { who: P.i }); gain(G, P, cs.length); }, { score: () => 1 })],
    ai: (G, P) => (P.gy.filter((c) => !c.def.types.includes('Land')).length >= 6 && (P.life <= 10 || P.library.length < 10) ? { score: 2 } : null) });
  return d;
};
S['Excalibur II'] = (d) => {
  d.trig.push(T('gain', { you: true, run: (G, X) => addCounters(G, X.src, 1, 'charge', true) }));
  d.statics.push({ who: 'equipped', p: 0, t: 0, kw: [], pFn: (G, s) => ctrCount(s, 'charge'), tFn: (G, s) => ctrCount(s, 'charge') });
  return d;
};
S['Genji Glove'] = (d) => {
  if (!d.statics.some((x) => x.who === 'equipped')) d.statics.push({ who: 'equipped', p: 0, t: 0, kw: ['double strike'] });
  d.trig.push(T('attack', { hostOnly: true, cond: () => true, run: (G, X) => { if ((G.combatN || 1) !== 1) return; X.ev.c.tapped = false; G.extraCombat = true; say(G, X.P, `${X.ev.c.def.name} untaps; there will be an additional combat phase.`, [X.ev.c.id]); } }));
  return d;
};
S['Magic Pot'] = (d) => {
  d.dies = [{ k: 'treasure', n: 1 }];
  d.acts.push({ cost: { m: C('{2}'), tap: true }, label: 'Exile a card from a graveyard', when: ['end'],
    eff: [fn((G, X, t) => { const c = t && t.c; const Q = c && G.players.find((q) => q.gy.includes(c)); if (!Q) return; Q.gy.splice(Q.gy.indexOf(c), 1); Q.exile.push(c); emit(G, 'exile', `${c.def.name} is exiled from ${Q.name}'s graveyard.`, { who: X.P.i, cards: [c.id] }); },
      { tgt: { what: 'gy', f: {} }, val: (G, P, c) => (G.players[c.owner] !== P ? 0.3 + (c.def.flashback || c.def.gyActs ? 1.5 : 0) : -1), label: 'Exile a card from a graveyard' })],
    ai: (G, P) => { const O = other(G, P); const c = O.gy.find((x) => x.def.flashback || x.def.gyActs || x.def.gyTrig); return c ? { score: 1.5, targets: [{ c }] } : null; } });
  return d;
};
S['The Masamune'] = (d) => {
  d.statics.push({ who: 'equipped', p: 0, t: 0, kw: ['first strike'], f: { attacking: true } });
  d.trig.push(T('attack', { hostOnly: true, run: (G, X) => { X.ev.c.tf.lure = true; } }));
  d.masamune = true;
  return d;
};
S['PuPu UFO'] = (d) => {
  d.acts.push({ cost: { tap: true }, label: 'Put a land card from your hand onto the battlefield', when: ['main1', 'main2'], cond: (G, P) => P.hand.some(isLand),
    eff: [fn((G, X) => { const ls = X.P.hand.filter(isLand); const c = pickOne(G, X.P, ls, 'Put a land onto the battlefield', (x) => (x.def.adv ? -2 : 0) + (x.def.mana || []).length); if (c) { X.P.hand.splice(X.P.hand.indexOf(c), 1); enterBattlefield(G, X.P, c, null, {}); } }, { score: () => 1.5 })],
    ai: (G, P) => (P.hand.filter(isLand).length >= (P.landsPlayed ? 1 : 2) ? { score: 1.6 } : null) });
  d.acts.push({ cost: { m: C('{3}') }, label: 'Base power becomes the number of Towns you control', when: ['main1'],
    eff: [fn((G, X) => { X.src.base = { p: nTowns(X.P), t: tou(X.src) - X.src.cnt - X.src.tt, eot: true }; dirty(G); }, { score: () => 0 })],
    ai: (G, P, c) => (nTowns(P) >= 3 && L.canAttackNow(G, c) ? { score: nTowns(P) * 0.4 } : null) });
  return d;
};
S['The Regalia'] = (d) => {
  d.trig.push(T('attack', { self: true, run: (G, X) => {
    const P = X.P, seen = [];
    let land = null;
    while (P.library.length) { const c = P.library.pop(); if (isLand(c)) { land = c; break; } seen.push(c); }
    G.rng.shuffle(seen); P.library.unshift(...seen);
    if (land) { enterBattlefield(G, P, land, null, { tapped: true }); emit(G, 'search', `${P.name} reveals cards until ${land.def.name} and puts it onto the battlefield tapped.`, { who: P.i, cards: [land.id] }); }
  } }));
  return d;
};
S['Relentless X-ATM092'] = (d) => {
  d.minBlock = 3;
  d.gyActs = [{ cost: { m: C('{8}') }, label: 'Return it to the battlefield tapped with a finality counter', eff: [fn((G, X) => { if (X.P.gy.includes(X.src)) putOntoBattlefield(G, X.P, X.src, { tapped: true, ctr: { finality: 1 } }); }, { score: () => 4 })], ai: () => ({ score: 4 }), when: ['main2', 'end'] }];
  return d;
};
S['Ring of the Lucii'] = (d) => {
  d.mana = ['C', 'C'];
  d.acts.push({ cost: { m: C('{2}'), tap: true, life: 1 }, label: 'Tap a nonland permanent', when: ['main1', 'end'], eff: [{ k: 'tapP', tgt: { f: { types: ['nonland'] } } }],
    ai: (G, P, c, when) => { if (when !== 'main1' || G.active !== P.i) return null; const b = other(G, P).bf.filter((x) => isCreature(x) && !x.tapped).sort((a, b2) => cv(b2) - cv(a))[0]; return b && cv(b) > 2.5 ? { score: cv(b) * 0.3, targets: [{ c: b }] } : null; } });
  return d;
};
S['World Map'] = (d) => {
  const find = (basic) => fn((G, X) => { const got = searchLibrary(G, X.P, (c) => isLand(c) && (!basic || c.def.supertypes.includes('Basic')), 1, 'hand', basic ? 'a basic land' : 'a land'); if (got.length) emit(G, 'search', `${X.P.name} puts ${got[0].def.name} into their hand.`, { who: X.P.i, cards: [got[0].id] }); }, { score: (G, P) => (P.hand.some(isLand) ? 0.3 : 1.2) });
  d.acts.push({ cost: { m: C('{1}'), tap: true, sacSelf: true }, label: 'Search for a basic land card', eff: [find(true)], when: ['main2', 'end'], ai: (G, P) => (!P.hand.some(isLand) && P.bf.filter(isLand).length < 6 ? { score: 1.4 } : null) });
  d.acts.push({ cost: { m: C('{3}'), tap: true, sacSelf: true }, label: 'Search for a land card', eff: [find(false)], when: ['main2', 'end'], noAi: true });
  return d;
};

/* ============================ Lands ============================ */
S['Balamb Garden, SeeD Academy'] = (d) => {
  d.etbTapped = true;
  d.mana = ['G', 'U'];
  d.acts.push({ cost: { m: C('{5}{G}{U}'), tap: true }, costMod: (G, P, c) => P.bf.filter((x) => x !== c && hasSub(x, 'Town')).length, label: 'Transform into Balamb Garden, Airborne', when: ['main2', 'end'],
    eff: [transformE()], ai: () => ({ score: 3 }) });
  return d;
};
S['Balamb Garden, Airborne'] = (d) => { d.trig.push(T('attack', { self: true, eff: fx('Draw a card.') })); return d; };
S['Capital City'] = (d) => { d.manaAbs = [{ colors: ['C'] }, { colors: L.ANY.slice(), conv: 1 }]; return d; };
S["Clive's Hideaway"] = (d) => {
  d.mana = ['C'];
  d.etb = [fn((G, X) => {
    const P = X.P, top = P.library.splice(Math.max(0, P.library.length - 4)).reverse();
    if (!top.length) return;
    const c = pickOne(G, P, top, 'Exile one face down (Hideaway)', (x) => x.def.value + x.def.mv * 0.3);
    const rest = top.filter((x) => x !== c);
    G.rng.shuffle(rest); P.library.unshift(...rest);
    P.exile.push(c);
    X.src.mem.hidden = c.id;
    say(G, P, `${P.name} exiles a card face down.`);
  }, { score: () => 0.5 })];
  d.acts.push({ cost: { m: C('{2}'), tap: true }, label: 'Play the hidden card for free', when: ['main1', 'main2'], cond: (G, P, c) => legendsOf(P).length >= 4 && P.exile.some((x) => x.id === c.mem.hidden),
    eff: [fn((G, X) => {
      const P = X.P, c = P.exile.find((x) => x.id === X.src.mem.hidden);
      if (!c) return;
      X.src.mem.hidden = null;
      if (isLand(c)) { if (P.landsPlayed < L.landLimit(G, P)) L.playLandChoice(G, P, { c, from: 'exile' }); else X.src.mem.hidden = c.id; return; }
      L.castNow(G, P, c, { free: true, ask: false });
    }, { score: () => 3 })], ai: () => ({ score: 3 }) });
  return d;
};
S['Crossroads Village'] = (d) => {
  d.etbTapped = true;
  d.etb = [fn((G, X) => {
    const P = X.P, want = {};
    for (const c of P.hand.concat(P.bf)) for (const col of L.ANY) want[col] = (want[col] || 0) + (c.def.cost[col] || 0);
    const best = L.ANY.slice().sort((a, b) => want[b] - want[a])[0];
    const k = chooseMode(G, P, X.src, 'Choose a color', ['White', 'Blue', 'Black', 'Red', 'Green'], L.ANY.indexOf(best));
    X.src.mem.color = L.ANY[k];
    say(G, P, `${X.src.def.name}: ${['white', 'blue', 'black', 'red', 'green'][k]} is chosen.`, [X.src.id]);
  }, { score: () => 0.2 })];
  d.manaAbs = [{ colorsFn: (G, c) => (c.mem.color ? [c.mem.color] : []) }];
  return d;
};
S['Eden, Seat of the Sanctum'] = (d) => {
  d.mana = ['C'];
  d.acts.push({ cost: { m: C('{5}'), tap: true }, label: 'Mill two cards; you may sacrifice it to return a permanent card', when: ['end'],
    eff: [fn((G, X) => {
      const P = X.P;
      mill(G, P, 2);
      const cs = P.gy.filter((c) => permCard(c.def) && c !== X.src);
      if (!cs.length || !onBf(G, X.src)) return;
      const best = cs.slice().sort((a, b) => b.def.value - a.def.value)[0];
      if (!yesNo(G, P, X.src, `Sacrifice ${X.src.def.name} to return a permanent card from your graveyard to your hand?`, best.def.value >= 3.5 && P.bf.filter(isLand).length >= 6)) return;
      sacrifice(G, P, X.src, true);
      const c = pickOne(G, P, cs, 'Return a permanent card to your hand', (x) => x.def.value);
      if (c && P.gy.includes(c)) { P.gy.splice(P.gy.indexOf(c), 1); P.hand.push(c); emit(G, 'raise', `${P.name} returns ${c.def.name} to hand.`, { who: P.i, cards: [c.id] }); }
    }, { score: () => 0.5 })], ai: (G, P) => (P.bf.filter(isLand).length >= 7 ? { score: 0.8 } : null) });
  return d;
};
S['The Gold Saucer'] = (d) => {
  d.mana = ['C'];
  d.acts.push({ cost: { m: C('{2}'), tap: true }, label: 'Flip a coin; win a Treasure', when: ['end'],
    eff: [fn((G, X) => {
      const P = X.P;
      const edgar = P.bf.some((c) => c.def.coinHeads) && P.coinTurn !== G.turn;
      P.coinTurn = G.turn;
      const win = edgar || G.rng.next() < 0.5;
      say(G, P, `${P.name} flips a coin and ${win ? 'wins' : 'loses'}${edgar ? ' (Two-Headed Coin)' : ''}.`);
      if (win) mk(G, P, TREASURE, 1);
    }, { score: () => 0.4 })], ai: (G, P) => (P.hand.every((c) => isLand(c) || !canPay(P, c.def.cost)) ? { score: 0.7 } : null) });
  d.acts.push({ cost: { m: C('{3}'), tap: true, sac: { types: ['Artifact'], n: 2 } }, label: 'Draw a card', eff: fx('Draw a card.'), when: ['end'],
    ai: (G, P) => (P.bf.filter((c) => hasSub(c, 'Treasure')).length >= 3 ? { score: 0.8 } : null) });
  return d;
};
const turnOf = (G, P) => (P.i === G.first ? Math.ceil(G.turn / 2) : Math.floor(G.turn / 2));
S['Starting Town'] = (d) => {
  d.tappedUnless = (G, P) => turnOf(G, P) <= 3;
  d.manaAbs = [{ colors: ['C'] }, { colors: L.ANY.slice(), life: 1 }];
  return d;
};
// Adventures of the Towns
S['Faith & Grief'] = (d) => {
  d.spell = [fn((G, X, t) => { for (const c of tcs(t)) if (X.P.gy.includes(c)) { X.P.gy.splice(X.P.gy.indexOf(c), 1); X.P.hand.push(c); emit(G, 'raise', `${X.P.name} returns ${c.def.name} to hand.`, { who: X.P.i, cards: [c.id] }); } },
    { tgt: { what: 'gy', mine: true, f: { types: ['Artifact', 'Enchantment'] }, n: 2, min: 0 }, val: (G, P, c) => 0.8 + c.def.value * 0.3, label: 'Return up to two artifact or enchantment cards' })];
  return d;
};
S['Overture'] = (d) => { d.spell = [fn((G, X) => mill(G, X.O, Math.floor(X.O.library.length / 2)), { score: (G, P) => (other(G, P).library.length <= 14 ? 6 : 1.2) })]; return d; };
S['Mage Siege'] = (d) => { d.spell = [mkE(WIZARD)]; return d; };
S['Reactor Raid'] = (d) => {
  d.spell = [fn((G, X) => {
    const P = X.P;
    const cs = P.bf.filter((c) => isCreature(c) || isArtifact(c));
    let c = null;
    if (isHuman(G, P)) { if (cs.length && yesNo(G, P, X.src, 'Sacrifice an artifact or creature to draw two cards?', true)) c = pickOne(G, P, cs, 'Sacrifice an artifact or creature', () => 0); }
    else c = cs.filter((x) => x.token || pv(G, x) < 1.5).sort((a, b) => pv(G, a) - pv(G, b))[0] || null;
    if (!c) return;
    emit(G, 'sac', `${P.name} sacrifices ${c.def.name}.`, { who: P.i, cards: [c.id] });
    sacrifice(G, P, c, true);
    drawN(G, P, 2);
  }, { score: (G, P) => (P.bf.some((x) => (isCreature(x) || isArtifact(x)) && (x.token || pv(G, x) < 1.5)) ? 1.6 : -1) })];
  return d;
};
S['Lasting Fayth'] = (d) => {
  d.spell = [fn((G, X) => { const [t] = mk(G, X.P, HERO, 1); if (t) addCounters(G, t, X.P.bf.filter(isLand).length); }, { score: (G, P) => 1.5 + P.bf.filter(isLand).length, value: 5 })];
  return d;
};

/* @@MORE@@ */
return S;
});
