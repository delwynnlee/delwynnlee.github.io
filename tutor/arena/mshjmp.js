/* Marvel Super Heroes Jumpstart: rules for the cards in the Jumpstart packs that the engine's reader can't handle on its own.
   Same shape as msh.js (each entry gets the card's skeleton and fills in the rest) and built from msh.js's shared helpers,
   so this file loads after msh.js. */
(function (root, factory) {
  const A = typeof module === 'object' && module.exports ? require('./engine.js') : root.Arena;
  if (typeof module === 'object' && module.exports) require('./msh.js');
  const S = factory(A);
  A.registerScripts(S);
  if (typeof module === 'object' && module.exports) module.exports = S;
})(typeof self !== 'undefined' ? self : this, function (A) {
'use strict';
const L = A.lib;
const { isCreature, isArtifact, isLand, pow, tou, has, hasSub, equipmentOn, attach, dirty, onBf, byId, cv, pv, other, allCreatures, addCounters, chooseMode, isHuman, yesNo,
  bounceCard, destroyPermanent, putOntoBattlefield, enteredThisTurn, attackedThisTurn, scryChoice, targetList, allTargets, ctrlOf, emit, connive, mill, searchLibrary,
  handValue, nameList } = L;
const { C, T, fn, tg, YOU, OPP, VILLAIN, MERFOLK, SOLDIER, WALL, MOLOID, ROBOT_VILLAIN, alone, aloneSelf, lone, attackingAlone, attachE, castNC, chooseOne, ctrEach, ctx0,
  discardE, drain, draw2, drawN, edictOf, gain, grantKw, hit, hitOpp, impulse, isEquip, lookTake, loseLife, mk, mkE, permCard, pickOne, pickSome, plan, planOn, pump, puAi,
  say, setPU, tcs, tokSpec, tokVal, twSpell, untilMyNextEnd, STURDY_SHIELD, copyToken, becomeCopy, impulseE, holdUntilLeaves, toLibrary } = L.mshKit;

/* ---------- Shared pieces ---------- */
const COLOR_WORD = { W: 'white', U: 'blue', B: 'black', R: 'red', G: 'green' };
const cap = (s) => s[0].toUpperCase() + s.slice(1);
const startLife = (G, P) => P.life0 || (G.format === 'commander' ? 40 : 20);
const nEquip = (P) => P.bf.filter(isEquip).length;
const nCreatures = (P) => P.bf.filter(isCreature).length;
const ROBOT_HERO = tokSpec('Robot Hero', 1, 1, [], ['Robot', 'Hero'], ['flying'], { artifact: true });
// Exile a creature, then return it to the battlefield under its owner's control
const blinkVal = (G, P, c) => (c.token ? -3 : (c.def.etb.length ? 0.9 : 0.1) + (c.tapped && !c.attacking ? 0.3 : 0) - (c.attacking ? 1.5 : 0) - c.cnt * 0.8 - (equipmentOn(G, c).length ? 1 : 0));
const blinkE = (o) => fn((G, X, t) => { const c = t && t.c; if (c && onBf(G, c)) { emit(G, 'exile', `${c.def.name} is exiled and returns to the battlefield.`, { who: X.P.i, cards: [c.id] }); L.blink(G, c); } },
  Object.assign({ tgt: tg({ side: 'you' }), val: blinkVal, label: 'Exile a creature you control, then return it' }, o));
// "This ability triggers only once each turn", shared by two triggers of the same card (MACH-1)
const onceATurn = (G, src) => { if (src.mem.onceTurn === G.turn) return false; src.mem.onceTurn = G.turn; return true; };
const isArtCard = (c) => c.def.types.includes('Artifact');
const ctrCountSafe = (c, k) => (c.ctr && c.ctr[k]) || 0;
// "Until your next end step": this turn's end step if it's your turn, otherwise your next turn's
const untilMyEndStep = (G, P) => (G.active === P.i ? G.turn : G.turn + 1);
function exileTopUntil(G, P, until, n = 1, label) {
  const cs = P.library.splice(Math.max(0, P.library.length - n)).reverse();
  if (!cs.length) return [];
  P.exile.push(...cs);
  for (const c of cs) P.xcast.push({ card: c, until });
  dirty(G);
  emit(G, 'exile', `${P.name} exiles ${nameList(cs)} from the top of their library${label ? ` (${label})` : ''} and may play ${cs.length === 1 ? 'it' : 'them'}.`, { who: P.i, cards: cs.map((c) => c.id) });
  return cs;
}
// Exile cards from the top until a nonland card; you may cast it without paying its mana cost (it stays exiled if you don't)
function freeFromTop(G, P, src) {
  const shown = [];
  let hitC = null;
  while (P.library.length) { const c = P.library.pop(); P.exile.push(c); shown.push(c); if (!c.def.types.includes('Land')) { hitC = c; break; } }
  dirty(G);
  if (!shown.length) return;
  emit(G, 'exile', `${P.name} exiles ${nameList(shown)} from the top of their library.`, { who: P.i, cards: shown.map((c) => c.id) });
  if (hitC) L.castNow(G, P, hitC, { free: true });
}
// "Until end of turn" triggers that live on the player, not the card (sagas)
const turnTrig = (G, P, src, t) => { (P.turnTrigs = (P.turnTrigs || []).filter((x) => x.turn === G.turn)).push({ turn: G.turn, src, t }); };
const battalion = (o) => T('attacks', Object.assign({ you: true, cond: (G, src, ev) => ev.cs.includes(src) && ev.cs.length >= 3 }, o));
const ILLUSION = tokSpec('Illusion Villain', 3, 3, ['U'], ['Illusion', 'Villain']);
const TREASURE = L.TREASURE;
// "Whenever you discard one or more cards": one trigger per batch, counting the cards
function discardBatch(o) {
  const id = `disc${++nBatch}`;
  return T('discard', Object.assign({}, o, { batchId: id, cond: (G, src, ev, Q) => {
    if (ev.P !== Q) return false;
    const p = (G.pending || []).find((x) => x.src === src && x.t && x.t.batchId === id);
    if (p) { p.ev.n = (p.ev.n || 1) + 1; return false; }
    return true;
  } }));
}
// Discard a whole hand, noting each card (mayhem, "whenever you discard" triggers)
function discardHand(G, P) {
  const hand = P.hand.splice(0);
  if (!hand.length) return 0;
  P.gy.push(...hand); dirty(G);
  emit(G, 'discard', `${P.name} discards their hand: ${nameList(hand)}.`, { who: P.i, cards: hand.map((c) => c.id) });
  for (const c of hand) L.noteDiscard(G, P, c);
  return hand.length;
}
const isSpider = (c) => hasSub(c, 'Spider');
const hasMutant = (P, except) => P.bf.some((c) => c !== except && isCreature(c) && hasSub(c, 'Mutant'));
const ELEMENTAL = tokSpec('Elemental', 1, 1, ['R'], ['Elemental']);
const isVehicle = (c) => hasSub(c, 'Vehicle');
const creatureCards = (cards) => cards.filter((c) => c.def.types.includes('Creature'));
// "Choose one that hasn't been chosen this turn" (The Fantastic Four): a mode resolves as its own ability, targets chosen then
function chooseFresh(modes) {
  const legal = (G, P, X, m) => m.eff.every((e) => !L.needsTarget(e) || (e.tgt && e.tgt.min === 0)) || !!L.chooseTargets(G, P, m.eff, 'trigger', X.src, X);
  const scoreOf = (G, P, X, m) => (L.chooseTargets(G, P, m.eff, 'trigger', X.src, X) || { score: -1 }).score;
  return fn((G, X) => {
    const P = X.P, src = X.src, used = src.mem.freshTurn === G.turn ? src.mem.fresh : [];
    const ok = modes.map((m, k) => k).filter((k) => !used.includes(k) && legal(G, P, X, modes[k]));
    if (!ok.length) return;
    const ai = ok.slice().sort((a, b) => scoreOf(G, P, X, modes[b]) - scoreOf(G, P, X, modes[a]))[0];
    const k = isHuman(G, P) && ok.length > 1 ? ok[chooseMode(G, P, src, `${src.def.name}: choose one that hasn't been chosen this turn`, ok.map((j) => modes[j].label), ok.indexOf(ai))] : ai;
    src.mem.freshTurn = G.turn; src.mem.fresh = used.concat(k);
    emit(G, 'info', `${src.def.name}: ${modes[k].label}.`, { who: P.i });
    if (G.pending) G.pending.unshift({ src, P, t: { eff: modes[k].eff, label: modes[k].label }, ev: X.ev || {} });
  }, { score: () => 2, value: 2 });
}
// "Whenever one or more ...": one trigger per batch of events (skipped while this ability is already waiting to resolve)
let nBatch = 0;
function batchT(on, o) {
  const id = `jmp${++nBatch}`, c0 = o.cond;
  return T(on, Object.assign({}, o, { batchId: id, cond: (G, src, ev, Q) => (!c0 || c0(G, src, ev, Q)) && !(G.pending || []).some((p) => p.src === src && p.t && p.t.batchId === id) }));
}
// "Whenever one or more creature cards leave your graveyard" (the engine reports each batch that left a graveyard)
const creCardsLeft = (G, src, ev) => ev.cards.some((c) => c.def.types.includes('Creature'));
// Thriving lands: enter tapped; as one enters, choose a color other than its own; it taps for either
function thriving(base) {
  return (d) => {
    d.mana = [base];
    d.etbTapped = true;
    d.manaPlus = (G, c) => (c.mem.color ? [c.mem.color] : []);
    d.etb = [fn((G, X) => {
      const P = X.P, opts = L.ANY.filter((col) => col !== base), want = {};
      // the color the rest of the deck asks for most
      for (const c of P.hand.concat(P.library, P.bf, P.gy)) for (const col of opts) want[col] = (want[col] || 0) + (c.def.cost[col] || 0) + (c.def.cost.hy || []).filter((h) => h.includes(col)).length;
      const best = opts.slice().sort((a, b) => want[b] - want[a])[0];
      const k = chooseMode(G, P, X.src, `${X.src.def.name}: choose a color`, opts.map((col) => cap(COLOR_WORD[col])), opts.indexOf(best));
      X.src.mem.color = opts[k];
      say(G, P, `${X.src.def.name}: ${COLOR_WORD[opts[k]]} is chosen.`, [X.src.id]);
    }, { score: () => 0.2 })];
    d.role = 'land';
    return d;
  };
}
const S = {};
S['Thriving Heath'] = thriving('W');
S['Thriving Isle'] = thriving('U');
S['Thriving Moor'] = thriving('B');
S['Thriving Bluff'] = thriving('R');
S['Thriving Grove'] = thriving('G');

/* ============================================================ White */
S['Nick Fury, Spymaster'] = (d) => {
  d.trig.push(alone({ run: (G, X) => {
    const P = X.P;
    drawN(G, P, 1);
    const cs = P.hand.filter((c) => c.def.types.includes('Creature') && c.def.mv <= 3);
    if (!cs.length) return;
    const pick = isHuman(G, P) ? pickSome(G, P, cs, 0, 1, 'You may put a creature card with mana value 3 or less onto the battlefield tapped and attacking', (c) => c.def.value, 'hand')[0]
      : cs.slice().sort((a, b) => b.def.value - a.def.value || a.id - b.id)[0];
    if (!pick) return;
    emit(G, 'enter', `${P.name} puts ${pick.def.name} onto the battlefield tapped and attacking.`, { who: P.i, card: pick.id });
    putOntoBattlefield(G, P, pick, { tapped: true, attacking: true });
    grantKw(G, pick, ['indestructible']);
  } }));
  return d;
};
S['Strategic Intervention'] = (d) => {
  d.trig.push(alone({ eff: [fn((G, X) => pump(G, lone(X), 1, 1), { score: () => 0.8 }), { k: 'tapP', tgt: tg(OPP, { min: 0 }) }] }));
  return d;
};
S['Doctor Strange, Surgeon'] = (d) => {
  d.lifeDouble = true;
  d.trig.push(T('combatStart', { cond: (G, src, ev, Q) => Q.life >= startLife(G, Q) + 10, eff: [{ k: 'pumpAll', side: 'you', p: 2, t: 2, kw: ['vigilance'] }] }));
  return d;
};
S['Donald Blake, Guise of Thor'] = (d) => {
  // After his power-up he's a God Warrior Hero (and no longer a Human Doctor)
  d.statics.push({ who: 'self', cond: (G, src) => !!src.mem.god, p: 0, t: 0, kw: [], sub: ['God', 'Warrior', 'Hero'] });
  return setPU(d, '{4}{W}{W}', { run: (G, X) => { addCounters(G, X.src, 2); addCounters(G, X.src, 1, 'flying'); X.src.mem.god = true; dirty(G); }, ai: puAi(3.6) });
};
S['Infinity Formula'] = (d) => {
  d.etb = [attachE()];
  d.statics.push({ who: 'equipped', p: 1, t: 2, kw: [] });
  d.trig.push(T('attack', { hostOnly: true, eff: [{ k: 'gain', n: 2 }] }));
  d.equipAi = () => 0.5;
  return d;
};
S['Hawkeye, Bowslinger'] = (d) => {
  d.trig.push(T('cast', { you: true, cond: (G, s, ev) => !!ev.item && allTargets(ev.item.targets).some((t) => t.c && isCreature(t.c)),
    run: (G, X) => { addCounters(G, X.src, 1); scryChoice(G, X.P, 1); } }));
  return d;
};
S['Heroic Teamwork'] = (d) => twSpell(d, 3,
  { label: 'One or two creatures each get +2/+1', eff: [{ k: 'pumpT', p: 2, t: 1, tgt: { f: {}, n: 2, min: 1 } }] },
  { label: 'One or two creatures each get +2/+1; draw a card (teamwork)', eff: [{ k: 'pumpT', p: 2, t: 1, tgt: { f: {}, n: 2, min: 1 } }, { k: 'draw', n: 1 }] });
S['Stunning Shot'] = (d) => {
  d.spell = [{ k: 'ctrs', n: 2, tgt: tg(YOU, { min: 0 }) }, { k: 'tapP', stun: true, tgt: tg(OPP, { min: 0 }) }];
  return d;
};
S['Black Panther, Most Dangerous'] = (d) => {
  d.trig.push(T('dmgCreature', { self: true, cond: (G, src, ev) => ev.n > 0, eff: [{ k: 'dmgX', nFn: (G, X) => X.ev.n, tgt: { what: 'any', f: { other: true } } }] }));
  return setPU(d, '{5}{W}{W}', { run: (G, X) => {
    addCounters(G, X.src, 2);
    const cs = X.P.bf.filter((c) => isCreature(c) && c !== X.src);
    cs.forEach((c) => { c.tp += 2; c.tt += 2; });
    dirty(G);
    if (cs.length) emit(G, 'pump', `${X.P.name}'s other creatures get +2/+2 until end of turn.`, { who: X.P.i, cards: cs.map((c) => c.id) });
  }, ai: puAi((G, P, c, when) => 2 + (when === 'main1' ? P.bf.filter(isCreature).length * 0.6 : 0)) });
};
S['Secure Detention'] = (d) => {
  d.aura = { f: { types: ['Artifact', 'Creature'] } };
  d.statics.push({ who: 'enchanted', p: 0, t: 0, kw: [], flags: { cantAttack: true, cantBlock: true, noActs: true } });
  d.etb = [mkE(SOLDIER, 1)];
  d.auraVal = (G, P, c) => (c.ctrl === P.i ? -cv(c) - 1 : cv(c) * 0.9 + 0.3);
  d.role = 'removal';
  return d;
};
S['Captain Marvel, Shooting Star'] = (d) => {
  const ex = fn((G, X, t) => {
    const c = t && t.c; if (!c || !onBf(G, c)) return;
    const Q = ctrlOf(G, c), n = Math.max(0, pow(c));
    L.exilePermanent(G, X.P, c);
    gain(G, Q, n);
  }, { tgt: tg({}, { min: 0 }), val: (G, P, c) => (c.ctrl === P.i ? -cv(c) - 1 : cv(c) - Math.max(0, pow(c)) * 0.1), label: 'Exile up to one creature' });
  d.etb = [ex];
  d.trig.push(T('attack', { self: true, eff: [ex] }));
  d.trig.push(T('leave', { cond: (G, src, ev) => ev.to === 'exile' && ev.cre && ev.c !== src && ev.pow > 0, run: (G, X) => gain(G, X.P, X.ev.pow) }));
  d.role = 'removal';
  return d;
};
S['Photon, Lady of Light'] = (d) => { d.trig.push(T('attack', { self: true, eff: [blinkE({ tgt: tg({ side: 'you', other: true }, { min: 0 }) })] })); return d; };
S['Quantum Entanglement'] = (d) => {
  const offer = fn((G, X) => {
    const P = X.P, cost = C('{1}{W}');
    const cs = P.bf.filter(isCreature);
    if (!cs.length || !L.canPay(P, cost)) return;
    const best = Math.max(...cs.map((c) => blinkVal(G, P, c))) + (P.bf.some((x) => x.def.name === 'Captain Marvel, Shooting Star') ? 0.6 : 0);
    if (!yesNo(G, P, X.src, `${X.src.def.name}: pay {1}{W} to exile a creature you control, then return it?`, best > 0.5)) return;
    if (!L.pay(P, cost)) return;
    if (G.pending) G.pending.unshift({ src: X.src, P, t: { eff: [blinkE()], label: 'Exile a creature you control, then return it' }, ev: {} });
  }, { score: () => 0.6 });
  d.etb = [offer];
  d.trig.push(T('endStep', { you: true, eff: [offer] }));
  return d;
};
S['Bucky Barnes, Eager Ally'] = (d) => {
  d.dies = [fn((G, X) => lookTake(G, X.P, 4, (c) => c.def.sub.includes('Equipment') || c.def.sub.includes('Hero') || c.def.sub.includes('Soldier'), 1, 'Put an Equipment, Hero or Soldier card into your hand'), { score: () => 0.8 })];
  return d;
};
S['Captain America, Liberator'] = (d) => {
  d.etb = [{ k: 'tutor', f: { types: ['Equipment'], mvLE: 3 }, to: 'bf', why: 'an Equipment with mana value 3 or less' }];
  d.trig.push(T('attack', { self: true, run: (G, X) => mk(G, X.P, SOLDIER, equipmentOn(G, X.src).length) }));
  return d;
};
S['Origin of Captain America'] = (d) => {
  d.saga = [
    { ch: [1], eff: [{ k: 'ctrs', n: 1, tgt: tg(YOU) }, fn((G, X) => { const c = X.last && X.last.c; if (c && onBf(G, c)) grantKw(G, c, ['first strike', 'vigilance']); }, { score: () => 0.5 })] },
    { ch: [2], run: (G, X) => mk(G, X.P, STURDY_SHIELD, 1) },
    { ch: [3], eff: [{ k: 'tapP', stun: true, tgt: tg({}, { min: 0 }) }] },
  ];
  return d;
};
S['The Howling Commandos'] = (d) => {
  d.acts.push({ cost: { m: C('{5}') }, label: 'Creatures you control get +1/+1; Soldiers gain vigilance', when: ['blocks', 'main1'],
    run: (G, X) => {
      const cs = X.P.bf.filter(isCreature);
      cs.forEach((c) => { c.tp += 1; c.tt += 1; if (hasSub(c, 'Soldier') && !c.tkw.includes('vigilance')) c.tkw.push('vigilance'); });
      dirty(G);
      emit(G, 'pump', `${X.P.name}'s creatures get +1/+1 until end of turn.`, { who: X.P.i, cards: cs.map((c) => c.id) });
    },
    ai: (G, P, c, when) => { const n = P.bf.filter((x) => isCreature(x) && (when === 'blocks' ? x.attacking || x.blocking : !x.tapped && hasSub(x, 'Soldier'))).length; return n >= 2 ? { score: n * 0.55 } : null; } });
  return d;
};
S['Captain America, Skybound'] = (d) => {
  d.trig.push(battalion({ run: (G, X) => { const cs = X.ev.cs.filter((c) => onBf(G, c)); ctrEach(G, cs, 1); cs.forEach((c) => grantKw(G, c, ['indestructible'])); } }));
  return d;
};
S['Falcon, Joaquin Torres'] = (d) => { d.trig.push(battalion({ run: (G, X) => { addCounters(G, X.src, 1); scryChoice(G, X.P, 1); } })); return d; };
S['General Thunderbolt Ross'] = (d) => { d.trig.push(battalion({ eff: [{ k: 'pumpAll', side: 'you', p: 1, t: 0, kw: [], f: { attacking: true } }] })); return d; };
S['Wild Pack Squad'] = (d) => { d.trig.push(T('combatStart', { you: true, eff: [{ k: 'grant', kw: ['first strike', 'vigilance'], tgt: tg(YOU, { min: 0 }) }] })); return d; };
S['Blur of Heroism'] = (d) => { d.etb = [{ k: 'draw', n: 1 }]; d.flashFor = (def) => def.sub.includes('Hero'); return d; };
S['Doctor Spectrum'] = (d) => {
  d.etb = [chooseOne([
    { label: 'Create a 0/4 Wall token with defender', eff: [mkE(WALL, 1)] },
    { label: 'A +1/+1 counter on each other Hero you control', eff: [fn((G, X) => ctrEach(G, X.P.bf.filter((c) => c !== X.src && isCreature(c) && hasSub(c, 'Hero')), 1), { score: (G, P, X) => P.bf.filter((c) => (!X || c !== X.src) && isCreature(c) && hasSub(c, 'Hero')).length * 1.1 - 0.5 })] },
    { label: 'Destroy an enchantment', eff: [{ k: 'destroyP', tgt: { f: { types: ['Enchantment'] } } }] },
  ])];
  return d;
};
S['Hyperion, Supreme Hero'] = (d) => { d.capOne = true; return d; };
S["Hyperion's Atomic Vision"] = (d) => {
  d.modes = [{ label: 'Destroy a tapped creature', eff: [{ k: 'destroyP', tgt: { f: { tapped: true } } }] },
    { label: 'Destroy a tapped creature, then scry 2 (behold a Hero)', eff: [{ k: 'destroyP', tgt: { f: { tapped: true } } }, { k: 'scry', n: 2 }], addCost: { behold: 'Hero' } }];
  d.spell = null;
  d.role = 'removal';
  return d;
};
S['Nighthawk, Dark Defender'] = (d) => { d.trig.push(T('enter', { you: true, cond: (G, src, ev) => isCreature(ev.c) && hasSub(ev.c, 'Hero'), eff: [{ k: 'pumpT', p: 1, t: 1, tgt: { f: {} } }] })); return d; };
S['Zarda, the Power Princess'] = (d) => {
  d.statics.push({ who: 'all', f: { side: 'you', other: true, sub: 'Hero' }, p: 0, t: 0, kw: ['exalted'] });
  // Exalted: a creature attacking alone gets +1/+1 for each instance among your permanents
  d.trig.push(alone({ run: (G, X) => { const n = X.P.bf.filter((c) => has(c, 'exalted')).length; if (n) pump(G, lone(X), n, n); } }));
  return d;
};
S['Costume Closet'] = (d) => {
  d.etbCtr = () => ({ '+1/+1': 2 });
  d.acts.push({ cost: { tap: true }, sorcery: true, label: 'Move a +1/+1 counter onto a creature you control', cond: (G, P, c) => c.cnt > 0, when: ['main1'],
    eff: [fn((G, X, t) => { const c = t && t.c; if (!c || !onBf(G, c) || X.src.cnt <= 0) return; X.src.cnt--; dirty(G); addCounters(G, c, 1); }, { tgt: tg(YOU), val: (G, P, c) => 0.9 + (c.attacking ? 0 : 0.1), label: 'Choose a creature you control' })] });
  d.trig.push(T('leave', { you: true, cond: (G, src, ev) => ev.cre && (ev.cnt > 0 || Object.keys(ev.ctr || {}).length > 0 || ev.attached > 0), run: (G, X) => addCounters(G, X.src, 1) }));
  return d;
};
S['Daily Bugle Reporters'] = (d) => {
  d.etb = [chooseOne([
    { label: 'Puff Piece: a +1/+1 counter on each of up to two creatures', eff: [{ k: 'ctrs', n: 1, tgt: { f: {}, n: 2, min: 0 } }] },
    { label: 'Investigative Journalism: return a creature card with mana value 2 or less to your hand', eff: [{ k: 'regrow', tgt: { what: 'gy', mine: true, f: { types: ['Creature'], mvLE: 2 } } }] },
  ])];
  return d;
};
S['Foggy Nelson, On Retainer'] = (d) => {
  d.etb = [fn((G, X, t) => { const c = t && t.c; if (!c || !onBf(G, c)) return; addCounters(G, c, 1); grantKw(G, c, ['hexproof']); }, { tgt: tg({ side: 'you', other: true }), val: (G, P, c) => 0.9 + cv(c) * 0.05, label: 'Another creature you control gets a counter and hexproof' })];
  return d;
};
S['Matt Murdock, Justice Seeker'] = (d) => {
  d.statics.push({ who: 'all', f: { side: 'you', fn: (G, c) => c.cnt > 0 || Object.keys(c.ctr || {}).length > 0 }, p: 0, t: 0, kw: [], ward: 1 });
  d.trig.push(T('combatStart', { you: true, run: (G, X) => {
    const P = X.P;
    if (!P.bf.some(isCreature) || !L.canPay(P, C('{1}')) || !yesNo(G, P, X.src, `${X.src.def.name}: pay {1} to put a +1/+1 counter on a creature you control?`, true)) return;
    if (!L.pay(P, C('{1}'))) return;
    if (G.pending) G.pending.unshift({ src: X.src, P, t: { eff: [{ k: 'ctrs', n: 1, tgt: tg(YOU) }], label: 'A +1/+1 counter on a creature you control' }, ev: {} });
  } }));
  return d;
};
S['Starling, Aerial Ally'] = (d) => { d.etb = [{ k: 'grant', kw: ['flying'], tgt: tg({ side: 'you', other: true }) }]; return d; };
S['Vault Guardsman'] = (d) => {
  d.convoke = true;
  d.etb = [fn((G, X, t) => { if (t && t.c) L.exileUntil(G, X.P, X.src, t.c); }, { tgt: { f: { types: ['Artifact', 'Creature'], side: 'opp' } }, val: (G, P, c) => pv(G, c) + 0.5, label: 'Exile an artifact or creature an opponent controls' })];
  d.role = 'removal';
  return holdUntilLeaves(d);
};
S['Amazing Spider-Girl'] = (d) => { d.webSling = C('{2}{W}'); return d; };
S['Spider-Man, Web-Slinger'] = (d) => { d.webSling = C('{W}'); return d; };
S['Spider-UK'] = (d) => {
  d.webSling = C('{2}{W}');
  d.trig.push(T('endStep', { you: true, cond: (G, src, ev, Q) => enteredThisTurn(G, Q).filter((c) => c.def.types.includes('Creature')).length >= 2, run: (G, X) => { drawN(G, X.P, 1); gain(G, X.P, 2); } }));
  return d;
};
S['Aunt May'] = (d) => {
  d.trig.push(T('enter', { you: true, other: true, cond: (G, src, ev) => isCreature(ev.c), run: (G, X) => { gain(G, X.P, 1); if (isSpider(X.ev.c)) addCounters(G, X.ev.c, 1); } }));
  return d;
};
S['Flash Thompson, Spider-Fan'] = (d) => {
  const heckle = { k: 'tapP', tgt: tg(OPP) }, worship = { k: 'untapP', tgt: tg(YOU) };
  d.etb = [chooseOne([
    { label: 'Heckle: tap a creature', eff: [heckle] },
    { label: 'Hero Worship: untap a creature', eff: [worship] },
    { label: 'Both: tap a creature and untap a creature', eff: [heckle, worship] },
  ])];
  return d;
};
S['Spectacular Tactics'] = (d) => {
  d.modes = [
    { label: 'A +1/+1 counter and hexproof on a creature you control', eff: [{ k: 'ctrs', n: 1, tgt: tg(YOU) }, fn((G, X) => { const c = X.last && X.last.c; if (c && onBf(G, c)) grantKw(G, c, ['hexproof']); }, { score: () => 0.3 })] },
    { label: 'Destroy a creature with power 4 or greater', eff: [{ k: 'destroyP', tgt: { f: { powGE: 4 } } }] },
  ];
  d.spell = null;
  return d;
};
S['Thwip!'] = (d) => {
  d.spell = [{ k: 'pumpT', p: 2, t: 2, kw: ['flying'], tgt: { f: {} } }, fn((G, X) => { const c = X.last && X.last.c; if (c && isSpider(c)) gain(G, X.P, 2); }, { score: () => 0.2 })];
  return d;
};
S['Ultimate Alliance'] = (d) => { d.spell = [{ k: 'dmgX', nFn: (G, X) => nCreatures(X.P), tgt: { f: {} } }]; d.role = 'removal'; return d; };
S['Wall Off'] = (d) => { d.spell = [mkE(WALL, 1), { k: 'gain', n: 4 }]; d.costMod = (G, P) => nCreatures(other(G, P)); return d; };

/* ============================================================ Blue */
S['Ant-Man, Reformed Rogue'] = (d) => {
  const colored = (col) => (G, s, ev) => !!ev.card && ev.card.def.colors.includes(col);
  d.trig.push(T('cast', { you: true, cond: colored('G'), run: (G, X) => pump(G, X.src, 1, 0, ['trample']) }));
  d.trig.push(T('cast', { you: true, cond: colored('U'), run: (G, X) => {
    const c = X.src; if (!onBf(G, c)) return;
    c.tp -= 1; c.tf.unblockable = true; dirty(G);
    say(G, X.P, `${c.def.name} gets -1/-0 and can't be blocked this turn.`, [c.id]);
  } }));
  d.hit = [{ k: 'draw', n: 1 }];
  return d;
};
S['Quantum Reduction'] = (d) => {
  d.twFlash = 2; // as though it had flash, when cast using teamwork
  d.statics.push({ who: 'enchanted', p: -5, t: 0, kw: [], flags: { noAbil: true } });
  d.auraVal = (G, P, c) => (c.ctrl === P.i ? -cv(c) - 1 : cv(c) * 0.55 + Math.min(5, Math.max(0, pow(c))) * 0.35 + (c.attacking ? 1 : 0));
  return d;
};
S['Wasp, Shrinking Savior'] = (d) => {
  const shrinks = (c) => pow(c) - 3 < 0 && pow(c) >= 0;
  d.trig.push(T('attack', { self: true, eff: [fn((G, X, t) => {
    const c = t && t.c;
    if (c && onBf(G, c)) {
      c.timedPT = (c.timedPT || []).concat({ p: -3, t: 0, until: G.turn + (G.active === X.P.i ? 2 : 1) });
      dirty(G);
      say(G, X.P, `${c.def.name} gets -3/-0 until ${X.P.name}'s next turn.`, [c.id]);
    }
    drawN(G, X.P, allCreatures(G).filter((x) => pow(x) < 0).length);
  }, { tgt: tg({ other: true }, { min: 0 }), score: () => 0.8,
    val: (G, P, c) => (c.ctrl === P.i ? (shrinks(c) ? 1.25 : 0) - Math.min(3, Math.max(0, pow(c))) * (c.attacking ? 0.5 : 0.15)
      : Math.min(3, Math.max(0, pow(c))) * 0.35 + (shrinks(c) ? 1.25 : 0) + (c.blocking ? 0.5 : 0)),
    label: 'Up to one other creature gets -3/-0 until your next turn' })] }));
  return d;
};
S['Flying Drone'] = (d) => {
  const flyerIn = (G, P, c) => enteredThisTurn(G, P).some((x) => x !== c && x.def.types.includes('Creature') && has(x, 'flying'));
  d.acts.push({ cost: { m: C('{1}{U}'), tap: true }, label: 'Draw a card, then discard a card', eff: [{ k: 'loot', n: 1, d: 1 }], when: ['end', 'main2'],
    costFn: (G, P, c, m) => (flyerIn(G, P, c) ? Object.assign({}, m, { g: Math.max(0, m.g - 1), U: Math.max(0, (m.U || 0) - 1) }) : m) });
  return d;
};
S['Namora, the Sea Queen'] = (d) => setPU(d, '{5}{U}', { run: (G, X) => { addCounters(G, X.src, 1); mk(G, X.P, MERFOLK, 2); }, ai: puAi(3.4) });
S['Rescue, Pepper Potts'] = (d) => {
  const worth = (G, P, c) => (c.token ? -3 : (c.def.etb.length ? 0.5 : -0.6) + (isArtifact(c) ? 0.9 : 0) - c.def.mv * 0.2 - (c.cnt || 0) * 0.8);
  d.etb = [fn((G, X, t) => {
    const c = t && t.c; if (!c || !onBf(G, c)) return;
    const art = isArtifact(c);
    bounceCard(G, X.P, c);
    if (art) addCounters(G, X.src, 1);
  }, { tgt: tg({ types: ['Artifact', 'Creature'], side: 'you', other: true }, { min: 0 }), val: worth, label: 'Return up to one other artifact or creature you control' })];
  return d;
};
S['Vulture, Feathered Fiend'] = (d) => {
  const flyers = (cs, Q) => cs.filter((c) => c.ctrl === Q.i && has(c, 'flying'));
  d.trig.push(T('combatDamagedYou', { opp: true, cond: (G, src, ev, Q) => flyers(ev.cs, Q).length > 0, run: (G, X) => {
    ctrEach(G, flyers(X.ev.cs, X.P).filter((c) => onBf(G, c)), 1);
    drawN(G, X.P, 1);
  } }));
  return d;
};
S['Reed Richards, Smartest Man'] = (d) => { d.noMaxHand = true; d.drawFour = true; d.value = (d.value || 0) + 1.5; return d; };
S['Fantastic Bounce'] = (d) => {
  d.spell = [{ k: 'bounceP', tgt: { f: { types: ['nonland'] } } }, { k: 'draw', n: 1 }];
  d.costMod = (G, P, card, targets) => ((targets || []).some((t) => targetList(t).some((x) => x.c && isCreature(x.c) && x.c.tapped)) ? 2 : 0);
  return d;
};
S['Brawn, Amadeus Cho'] = (d) => {
  d.etb = [{ k: 'draw', n: 1 }];
  return setPU(d, '{4}{G/U}', { run: (G, X) => addCounters(G, X.src, X.P.hand.length), ai: puAi((G, P) => P.hand.length * 0.9 - 0.4) });
};
S['Daughter of the Deep'] = (d) => {
  d.trig.push(draw2({ eff: [mkE(MERFOLK, 1)] }));
  const ready = (G, P, c) => P.bf.filter((x) => x !== c && isCreature(x) && hasSub(x, 'Merfolk') && !x.tapped && (!x.sick || has(x, 'haste')) && pow(x) > 0 && !x.tf.unblockable);
  d.acts.push({ cost: { m: C('{U}'), tap: true }, label: "A Merfolk can't be blocked this turn", when: ['main1'],
    eff: [{ k: 'grant', flags: { unblockable: true }, say: "can't be blocked this turn", tgt: { f: { side: 'you', sub: 'Merfolk' } } }],
    ai: (G, P, c) => {
      const cs = ready(G, P, c).sort((a, b) => pow(b) - pow(a));
      if (!cs.length || !other(G, P).bf.some((x) => isCreature(x) && !x.tapped)) return null;
      return { score: 0.5 + pow(cs[0]) * 0.45, targets: [{ c: cs[0] }] };
    } });
  return d;
};
S['Namor, Scourge of the Seas'] = (d) => {
  d.statics.push({ who: 'all', f: { side: 'you', other: true, sub: 'Merfolk', fn: (G, c) => c.cnt > 0 }, p: 0, t: 0, kw: ['flying'] });
  d.trig.push(T('combatStart', { you: true, eff: [fn((G, X, t) => { if (t && t.c) connive(G, X.P, t.c, 1); }, { tgt: tg(YOU), score: () => 1,
    val: (G, P, c) => 0.8 + (hasSub(c, 'Merfolk') ? 0.6 : 0) + (has(c, 'flying') ? 0.2 : 0), label: 'Choose a creature you control to connive' })] }));
  return d;
};
S['Shipwreck Patrol'] = (d) => { d.etb = [{ k: 'tapP', stun: true, tgt: tg(OPP) }]; return d; };
S['Unstable Experiment'] = (d) => {
  d.spell = [fn((G, X, t) => { if (t && t.p != null) drawN(G, G.players[t.p], 1); }, { tgt: { what: 'player' }, val: (G, P, x) => (x.p === P.i ? 1.2 : -1), label: 'Choose a player to draw a card', value: 1.2 }),
    fn((G, X, t) => { if (t && t.c && onBf(G, t.c)) connive(G, X.P, t.c, 1); }, { tgt: tg(YOU, { min: 0 }), val: () => 0.9, label: 'Up to one creature you control connives' })];
  return d;
};
S['Machine Man, Model X-51'] = (d) => { d.trig.push(castNC({ run: (G, X) => { addCounters(G, X.src, 1); grantKw(G, X.src, ['flying']); } })); return d; };
S['Timeline Inquiry'] = (d) => twSpell(d, 2,
  { label: 'Draw three cards, then discard a card', eff: [{ k: 'loot', n: 3, d: 1 }] },
  { label: 'Draw three cards (teamwork)', eff: [{ k: 'draw', n: 3 }] });
S['Victor Mancha, Runaway'] = (d) => {
  const permit = (G, P, x) => P.bf.some((y) => y.id === x.src);
  d.etb = [fn((G, X, t) => {
    const c = t && t.c; if (!c || !X.P.gy.includes(c)) return;
    X.P.gy.splice(X.P.gy.indexOf(c), 1); X.P.exile.push(c);
    X.P.xcast.push({ card: c, until: Infinity, src: X.src.id, cond: permit });
    dirty(G);
    emit(G, 'exile', `${X.P.name} exiles ${c.def.name} from their graveyard; they may play it while they control ${X.src.def.name}.`, { who: X.P.i, cards: [c.id] });
  }, { tgt: { what: 'gy', mine: true, f: { types: ['any'] } }, val: (G, P, c) => c.def.value + 0.5, label: 'Exile a card from your graveyard' })];
  return d;
};
S['Virtual Assistant'] = (d) => { d.trig.push(T('cast', { you: true, cond: (G, s, ev) => !!(ev.item && ev.item.teamwork), eff: [mkE(ROBOT_HERO, 1)] })); return d; };
S['Vision, Spectral Synthezoid'] = (d) => {
  d.freeCastIf = (G, P, card, src) => G.active === P.i && P.visionTurn !== G.turn && P.hand.includes(card) && (!card.def.types.includes('Creature') || card.def.sub.includes('Robot'));
  d.onFreeCast = (G, P, card, src) => { P.visionTurn = G.turn; say(G, P, `${P.name} casts ${card.def.name} without paying its mana cost (${src.def.name}).`, [card.id]); };
  return d;
};
S['Impossible Man'] = (d) => {
  d.acts.push({ cost: { m: C('{2}{U}') }, label: 'Become a copy of another permanent until end of turn', when: ['main1'],
    eff: [fn((G, X, t) => {
      const c = t && t.c, h = X.src; if (!c || !onBf(G, c) || !onBf(G, h)) return;
      const name = (h.faceBase || h.def).name;
      becomeCopy(G, h, c.def, null, { untilEnd: true });
      h.def.name = name; // except his name is Impossible Man
      dirty(G);
    },
      { tgt: { f: { types: ['any'], other: true } }, val: (G, P, c) => (isCreature(c) ? (cv(c) - cv(byId(G, G.resolving) || c)) * 0.4 : -1), label: 'Choose another permanent' })],
    ai: (G, P, c) => {
      const best = allCreatures(G).filter((x) => x !== c).sort((a, b) => cv(b) - cv(a))[0];
      return best && cv(best) > cv(c) + 2.5 && !c.tapped ? { score: (cv(best) - cv(c)) * 0.3, targets: [{ c: best }] } : null;
    } });
  return d;
};
S['Living Lies of Loki'] = (d) => {
  d.statics.push({ who: 'self', p: 0, t: 0, kw: [], pFn: (G, src) => G.players[src.ctrl].bf.filter((c) => c !== src && hasSub(c, 'Illusion')).length });
  d.dies = [{ k: 'draw', n: 1 }];
  return d;
};
S['Loki, Lord of Misrule'] = (d) => {
  const gain = (G, P, t, src) => P.bf.filter((c) => c !== t && isCreature(c)).reduce((s, c) => s + (cv(t) - cv(c)) * 0.4, 0);
  d.acts.push({ cost: { m: C('{U}'), tap: true }, sorcery: true, label: 'Your other creatures become copies of one you control', when: ['main1'],
    eff: [fn((G, X, t) => {
      const c = t && t.c; if (!c || !onBf(G, c)) return;
      for (const o of X.P.bf.filter((x) => x !== c && isCreature(x))) becomeCopy(G, o, c.def, null, { untilEnd: true, nonLegendary: true });
    }, { tgt: tg(YOU), val: (G, P, c) => gain(G, P, c), label: 'Choose a creature you control' })],
    ai: (G, P, c) => { const t = P.bf.filter(isCreature).sort((a, b) => cv(b) - cv(a))[0]; const s = t ? gain(G, P, t, c) : 0; return s > 2 ? { score: s, targets: [{ c: t }] } : null; } });
  return d;
};
S['Multiversal Recruitment'] = (d) => {
  d.spell = [fn((G, X, t) => { const c = t && t.c; if (c && onBf(G, c)) { const k = copyToken(G, X.P, c.def, { nonLegendary: true }); emit(G, 'token', `${X.P.name} creates a token copy of ${c.def.name}.`, { who: X.P.i, cards: [k.id] }); } },
    { tgt: tg(YOU), val: (G, P, c) => cv(c), label: 'Choose a creature you control to copy', value: 3 })];
  return d;
};
S['The Clone Saga'] = (d) => {
  d.saga = [
    { ch: [1], run: (G, X) => L.surveil(G, X.P, 3) },
    { ch: [2], run: (G, X) => {
      say(G, X.P, `When ${X.P.name} next casts a creature spell this turn, it's copied.`);
      turnTrig(G, X.P, X.src, T('cast', { you: true, cond: (G2, s2, ev, Q) => Q.cloneUsed !== G2.turn && !!ev.card && ev.card.def.types.includes('Creature'), run: (G2, X2) => {
        X2.P.cloneUsed = G2.turn;
        const k = copyToken(G2, X2.P, X2.ev.card.def, { nonLegendary: true });
        emit(G2, 'copy', `${X2.ev.card.def.name} is copied: ${X2.P.name} gets a token copy.`, { who: X2.P.i, cards: [k.id] });
      } }));
    } },
    { ch: [3], run: (G, X) => {
      const P = X.P, names = [...new Set(P.bf.filter(isCreature).map((c) => c.def.name))];
      if (!names.length) return;
      const ai = names.map((n) => P.bf.find((c) => c.def.name === n)).sort((a, b) => (has(b, 'flying') ? 2 : 0) + pow(b) - (has(a, 'flying') ? 2 : 0) - pow(a))[0].def.name;
      const name = names.length === 1 ? names[0] : names[chooseMode(G, P, X.src, 'The Clone Saga: choose a card name', names, names.indexOf(ai))];
      say(G, P, `${X.src.def.name}: ${name} is chosen. When a creature named ${name} deals combat damage to a player this turn, ${P.name} draws a card.`);
      turnTrig(G, P, X.src, T('hitPlayer', { you: true, cond: (G2, s2, ev) => ev.c.def.name === name, eff: [{ k: 'draw', n: 1 }] }));
    } },
  ];
  return d;
};
S['Immortus, Master of Eternity'] = (d) => {
  d.manaAbs = [{ colors: ['U'], amountFn: (G, c, P) => P.drawn || 0, only: (p) => !!p.def && !p.def.types.includes('Creature') }];
  return setPU(d, '{5}{U}{U}', { run: (G, X) => {
    for (const Q of G.players) { Q.library.push(...Q.hand.splice(0), ...Q.gy.splice(0)); G.rng.shuffle(Q.library); }
    dirty(G);
    emit(G, 'info', 'Each player shuffles their hand and graveyard into their library, then draws seven cards.', { who: X.P.i });
    for (const Q of G.players) drawN(G, Q, 7);
    addCounters(G, X.src, 1);
  }, ai: puAi((G, P) => (P.hand.length <= 2 ? 3 + (2 - P.hand.length) : -1)) });
};
S['Pharaoh Rama-Tut'] = (d) => { d.trig.push(castNC({ run: (G, X) => connive(G, X.P, X.src, 1) })); return d; };
S['Victor Timely, Wily Tycoon'] = (d) => {
  d.etb = [fn((G, X, t) => {
    const c = t && t.c; if (!c || !X.P.gy.includes(c)) return;
    if (L.isIS(c.def)) c.fbExile = true;
    if (!L.castNow(G, X.P, c, { free: true })) c.fbExile = false;
  }, { tgt: { what: 'gy', mine: true, f: { types: ['Artifact', 'Instant', 'Sorcery'], mvLE: 4 }, min: 0 }, val: (G, P, c) => c.def.value + 0.5, label: 'Cast an artifact, instant or sorcery card from your graveyard for free' })];
  return d;
};
S['Doc Ock, Sinister Scientist'] = (d) => {
  d.statics.push({ who: 'self', cond: (G, src) => G.players[src.ctrl].gy.length >= 8, p: 0, t: 0, kw: [], baseFn: () => 8 });
  d.statics.push({ who: 'self', cond: (G, src) => G.players[src.ctrl].bf.some((c) => c !== src && isCreature(c) && hasSub(c, 'Villain')), p: 0, t: 0, kw: ['hexproof'] });
  return d;
};
S['Flying Octobot'] = (d) => { d.trig.push(T('enter', { you: true, other: true, once: true, cond: (G, src, ev) => isCreature(ev.c) && hasSub(ev.c, 'Villain'), run: (G, X) => addCounters(G, X.src, 1) })); return d; };
S['Graviton, Fundamental Force'] = (d) => {
  d.trig.push(draw2({ eff: [chooseOne([
    { label: 'A creature gains flying until end of turn', eff: [{ k: 'grant', kw: ['flying'], tgt: tg(YOU) }] },
    { label: 'Tap a creature', eff: [{ k: 'tapP', tgt: tg(OPP) }] },
  ])] }));
  return d;
};
S["Mysterio's Mirage"] = (d) => { d.trig.push(T('endStep', { you: true, cond: (G, src, ev, Q) => L.discardsThisTurn(G, Q) > 0, eff: [mkE(ILLUSION, 1)] })); return d; };
S["Collector's Case"] = (d) => {
  d.etb = [fn((G, X, t) => { const c = t && t.c; if (!c || !onBf(G, c)) return; c.tapped = true; addCounters(G, c, 2, 'stun'); }, { tgt: tg(OPP, { min: 0 }), val: (G, P, c) => cv(c) * 0.6, label: 'Tap a creature and put two stun counters on it' })];
  d.acts.push({ cost: { m: C('{3}{U}'), tap: true }, label: 'Tap a creature', eff: [{ k: 'tapP', tgt: tg(OPP) }], when: ['main1'],
    ai: (G, P) => { const t = other(G, P).bf.filter((c) => isCreature(c) && !c.tapped).sort((a, b) => cv(b) - cv(a))[0]; return t && P.bf.some((c) => isCreature(c) && !c.tapped && !c.sick) ? { score: 0.5 + cv(t) * 0.25, targets: [{ c: t }] } : null; } });
  return d;
};
S['Imperial Cosmographer'] = (d) => { d.trig.push(T('leave', { you: true, other: true, cond: (G, src, ev) => ev.cre && ev.to !== 'gy', run: (G, X) => addCounters(G, X.src, 2) })); return d; };
S["Shi'ar Soldier"] = (d) => {
  d.acts.push({ cost: { m: C('{U}'), tap: true }, label: 'Return another permanent you control to its owner\'s hand', cond: (G, P) => G.active === P.i, when: ['main1'],
    eff: [{ k: 'bounceP', ownOk: true, tgt: { f: { types: ['any'], side: 'you', other: true } } }],
    ai: (G, P, c) => {
      const t = P.bf.filter((x) => x !== c && !x.token && !isLand(x) && x.def.etb.length && L.canPay(P, x.def.cost)).sort((a, b) => b.def.value - a.def.value)[0];
      return t && L.manaCount(P) >= t.def.mv + 1 ? { score: 0.9, targets: [{ c: t }] } : null;
    } });
  return d;
};
S['Silver Surfer, Cosmic Voyager'] = (d) => {
  d.etb = [fn((G, X, t) => {
    const P = X.P, cs = tcs(t).filter((c) => onBf(G, c) && c !== X.src);
    if (!cs.length) return;
    for (const c of cs) L.exilePermanent(G, P, c);
    const back = cs.filter((c) => !c.token);
    G.delayed.push({ when: 'end', run: (GG) => {
      for (const c of back) {
        const owner = GG.players[c.owner];
        if (!owner.exile.includes(c)) continue;
        owner.exile.splice(owner.exile.indexOf(c), 1);
        emit(GG, 'enter', `${c.def.name} returns to the battlefield.`, { who: owner.i, card: c.id });
        L.enterBattlefield(GG, owner, c, null, { tapped: c.def.types.includes('Land') });
      }
    } });
  }, { tgt: { f: { types: ['any'], side: 'you', other: true }, n: 12, min: 0 }, val: (G, P, c) => (c.token ? -3 : (c.def.etb.length ? 0.4 : -1) - (isCreature(c) && G.active !== P.i ? 1 : 0)), label: 'Exile any number of other permanents you control until the next end step' })];
  return d;
};
S['Spaceshift'] = (d) => {
  d.spell = [fn((G, X, t) => { const c = t && t.c; if (c && onBf(G, c)) { emit(G, 'exile', `${c.def.name} is exiled and returns with a +1/+1 counter.`, { who: X.P.i, cards: [c.id] }); L.blink(G, c, { ctr: { '+1/+1': 1 } }); } },
    { tgt: { f: { types: ['Artifact', 'Creature'] } }, val: (G, P, c) => (c.ctrl === P.i ? blinkVal(G, P, c) + 0.6 : c.token ? cv(c) + 1 : -0.5), label: 'Exile an artifact or creature, then return it', value: 1.5 })];
  return d;
};
S['Happy Hogan, Bodyguard'] = (d) => {
  d.etb = [fn((G, X, t) => {
    const c = t && t.c; if (!c || !onBf(G, c)) return;
    const Q = G.players[c.owner];
    const k = isHuman(G, Q) ? chooseMode(G, Q, X.src, `Put ${c.def.name} into your library:`, ['Second from the top', 'On the bottom'], 0) : (c.def.value >= 3 ? 0 : 1);
    toLibrary(G, X, c, k === 0 ? 'second' : 'bottom');
  }, { tgt: tg(OPP), val: (G, P, c) => pv(G, c) * 0.8 + (c.token ? 1 : 0), label: 'Put a creature an opponent controls into its owner\'s library' })];
  d.role = 'removal';
  return d;
};
S['Iron Man, Bleeding Edge'] = (d) => {
  d.trig.push(T('cast', { you: true, cond: (G, s, ev, Q) => !!ev.card && ev.card.def.types.includes('Artifact') && Q.ironTurn !== G.turn, run: (G, X) => {
    const P = X.P, def = X.ev.card.def;
    if (!yesNo(G, P, X.src, `Copy ${def.name}? (Only once each turn)`, true)) return;
    P.ironTurn = G.turn;
    const k = copyToken(G, P, def, { nonLegendary: true });
    emit(G, 'copy', `${def.name} is copied: ${P.name} gets a token copy.`, { who: P.i, cards: [k.id] });
  } }));
  return d;
};
S['Iron Suitcase'] = (d) => {
  d.etb = [fn((G, X) => scryChoice(G, X.P, 2), { score: () => 0.5 })];
  d.acts.push({ cost: { m: C('{3}') }, label: 'Become a 3/3 Construct artifact creature with flying until end of turn', when: ['main1'],
    run: (G, X) => { const c = X.src; c.tf.animated = true; c.base = { p: 3, t: 3, eot: true }; c.addSubs = ['Construct']; if (!c.tkw.includes('flying')) c.tkw.push('flying'); dirty(G); emit(G, 'pump', `${c.def.name} becomes a 3/3 Construct artifact creature with flying until end of turn.`, { who: X.P.i, cards: [c.id] }); },
    ai: (G, P, c) => (!c.sick && !c.tapped && !L.isCreature(c) ? { score: 1.1 } : null) });
  return d;
};
S['Origin of Iron Man'] = (d) => {
  d.statics.push({ who: 'all', f: { types: ['any'], fn: (G, c, P, src) => !!src && src.mem.frozen === c.id }, p: 0, t: 0, kw: [], flags: { noUntap: true } });
  d.saga = [
    { ch: [1], eff: [fn((G, X, t) => { const c = t && t.c; if (!c || !onBf(G, c)) return; c.tapped = true; X.src.mem.frozen = c.id; dirty(G); emit(G, 'tapfx', `${c.def.name} is tapped and won't untap while ${X.src.def.name} remains.`, { who: X.P.i, cards: [c.id] }); },
      { tgt: tg(OPP, { min: 0 }), val: (G, P, c) => cv(c) * 0.6, label: 'Tap up to one creature' })] },
    { ch: [2], eff: [{ k: 'draw', n: 2 }] },
    { ch: [3], run: (G, X) => {
      const P = X.P, cs = P.hand.filter((c) => c.def.types.includes('Artifact') && c.def.mv <= 5);
      const pick = cs.length ? (isHuman(G, P) ? pickSome(G, P, cs, 0, 1, 'You may put an artifact card with mana value 5 or less onto the battlefield', (c) => c.def.value, 'hand')[0] : cs.slice().sort((a, b) => b.def.value - a.def.value)[0]) : null;
      if (!pick) return;
      P.hand.splice(P.hand.indexOf(pick), 1);
      emit(G, 'enter', `${P.name} puts ${pick.def.name} onto the battlefield.`, { who: P.i, card: pick.id });
      L.enterBattlefield(G, P, pick, null, {});
    } },
  ];
  return d;
};
S['Shuri, Vibranium Technologist'] = (d) => {
  d.etb = [chooseOne([{ label: 'Create a 1/1 Robot Hero artifact token with flying', eff: [mkE(ROBOT_HERO, 1)] }, { label: 'Draw a card', eff: [{ k: 'draw', n: 1 }] }])];
  return d;
};

/* ============================================================ Black */
S['Bob, Reluctant HYDRA Agent'] = (d) => {
  d.trig.push(aloneSelf({ run: (G, X) => {
    const c = X.src; if (!onBf(G, c)) return;
    bounceCard(G, X.P, c);
    if (G.players[c.owner].hand.includes(c)) drain(G, X, 2);
  } }));
  return d;
};
S['HYDRA Disintegrator'] = (d) => {
  d.etb = [fn((G, X) => { const [t] = mk(G, X.P, VILLAIN, 1); if (t && onBf(G, t) && onBf(G, X.src)) attach(G, X.src, t); }, { score: () => tokVal(VILLAIN) + 3, value: 4 })];
  return d;
};
S['Viper, Cruel Conspirator'] = (d) => {
  const lone1 = { fn: (G, c) => attackingAlone(G, c) };
  d.acts.push({ cost: { m: C('{B}') }, label: 'A creature attacking alone gets +1/+1', when: ['blocks'], eff: [{ k: 'pumpT', p: 1, t: 1, tgt: { f: lone1 } }] });
  d.acts.push({ cost: { m: C('{B}') }, label: 'A creature attacking alone gains deathtouch or lifelink', when: ['blocks'], eff: [fn((G, X, t) => {
    const c = t && t.c; if (!c || !onBf(G, c)) return;
    const opts = ['Deathtouch', 'Lifelink'];
    const aiK = c.blockedBy.length && !has(c, 'deathtouch') ? 0 : 1;
    const k = isHuman(G, X.P) ? chooseMode(G, X.P, X.src, `${c.def.name} gains:`, opts, aiK) : aiK;
    grantKw(G, c, [opts[k].toLowerCase()]);
  }, { tgt: { f: lone1 }, label: 'Choose a creature attacking alone',
    val: (G, P, c) => (c.ctrl !== P.i ? -0.5 : c.blockedBy.length ? (has(c, 'deathtouch') ? -0.2 : 1.4) : has(c, 'lifelink') ? -0.2 : 0.3 + Math.max(0, pow(c)) * 0.15) })] });
  return d;
};
S['Armed Assailant'] = (d) => {
  d.statics.push({ who: 'self', cond: (G, src) => equipmentOn(G, src).length > 0, p: 2, t: 0, kw: ['menace'] });
  return d;
};
S["Swordsman's Steel"] = (d) => {
  d.etb = [fn((G, X) => drawN(G, X.P, nEquip(X.P)), { score: (G, P) => (nEquip(P) + 1) * 1.1, value: 1.6 })];
  d.statics.push({ who: 'equipped', p: 2, t: 2, kw: [], pFn: (G, src) => 2 * nEquip(G.players[src.ctrl]), tFn: (G, src) => 2 * nEquip(G.players[src.ctrl]) });
  d.equipAi = (G, P) => Math.max(0, nEquip(P) - 1) * 2.2;
  return d;
};
S['Voltaic Whip'] = (d) => {
  d.statics.push({ who: 'equipped', p: 2, t: 0, kw: [] });
  d.trig.push(T('attacks', { you: true, cond: (G, src, ev) => ev.cs.length === 1 && src.att === ev.cs[0].id, run: (G, X) => { drawN(G, X.P, 1); loseLife(G, X.P, 1); } }));
  d.equipAi = () => 0.7;
  return d;
};
S["Doom's Servo-Guards"] = (d) => { d.etb = [{ k: 'gain', n: 2 }, { k: 'mill', n: 2, who: 'self' }]; return d; };
S["Grim Reaper's Scythe"] = (d) => {
  const ZOMBIE = tokSpec('Zombie', 2, 2, ['B'], ['Zombie']);
  d.trig.push(T('gyLeft', { you: true, cond: creCardsLeft, eff: [mkE(ZOMBIE, 1)] }));
  d.acts.push({ cost: { m: C('{3}{B}'), tap: true, sac: { f: { types: ['Creature'] }, n: 2 } }, sorcery: true, label: 'Return a creature card with a finality counter',
    eff: [fn((G, X, t) => {
      const c = t && t.c; if (!c || !X.P.gy.includes(c)) return;
      emit(G, 'raise', `${c.def.name} returns to the battlefield with a finality counter.`, { who: X.P.i, cards: [c.id] });
      putOntoBattlefield(G, X.P, c, { ctr: { finality: 1 } });
    }, { tgt: { what: 'gy', mine: true, f: { types: ['Creature'] } }, val: (G, P, c) => c.def.value, label: 'Choose a creature card in your graveyard' })],
    ai: (G, P, c) => {
      const best = P.gy.filter((x) => x.def.types.includes('Creature')).sort((a, b) => b.def.value - a.def.value)[0];
      if (!best) return null;
      const fodder = P.bf.filter((x) => isCreature(x)).sort((a, b) => pv(G, a) - pv(G, b)).slice(0, 2);
      const s = best.def.value + 2.2 - fodder.reduce((t, x) => t + pv(G, x), 0);
      return s > 0.8 ? { score: s, targets: [{ c: best }] } : null;
    } });
  return d;
};
S['Minion Missile'] = (d) => {
  d.addCost = { sac: { types: ['Creature'] }, discard: 1 };
  d.spell = [fn((G, X, t) => {
    const c = t && t.c; if (!c || !onBf(G, c)) return;
    const Q = ctrlOf(G, c);
    destroyPermanent(G, X.P, c, `to ${X.src.def.name}`);
    hit(G, X, { p: Q.i }, 2);
  }, { tgt: { f: {} }, val: (G, P, c) => (c.ctrl === P.i ? -pv(G, c) - 2 : pv(G, c) + 0.6), label: 'Destroy a creature', value: 4 })];
  d.role = 'removal';
  return d;
};
S['Black Widow, Deadly Hunter'] = (d) => { d.trig.push(T('hitPlayer', { you: true, cond: (G, src, ev) => has(ev.c, 'deathtouch'), run: (G, X) => { drawN(G, X.P, 1); loseLife(G, X.P, 1); } })); return d; };
S['White Widow, Yelena Belova'] = (d) => { d.trig.push(T('hitPlayer', { you: true, cond: (G, src, ev) => has(ev.c, 'deathtouch'), run: (G, X) => addCounters(G, X.ev.c, 1) })); return d; };
S['Origin of Black Widow'] = (d) => {
  d.saga = [
    { ch: [1], run: (G, X) => edictOf(G, X.O, (c) => isCreature(c)) },
    { ch: [2], run: (G, X) => { const cs = X.P.bf.filter(isCreature); cs.forEach((c) => { if (!c.tkw.includes('deathtouch')) c.tkw.push('deathtouch'); }); dirty(G); if (cs.length) emit(G, 'pump', `${X.P.name}'s creatures gain deathtouch until end of turn.`, { who: X.P.i, cards: cs.map((c) => c.id) }); } },
    { ch: [3], run: (G, X) => loseLife(G, X.O, creatureCards(X.O.gy).length, X.P.i) },
  ];
  return d;
};
S['Titanium Man'] = (d) => {
  d.trig.push(T('attack', { self: true, eff: [chooseOne([
    { label: 'Titanium Man gains flying until end of turn', eff: [fn((G, X) => grantKw(G, X.src, ['flying']), { score: (G, P, X) => (X && X.src && !has(X.src, 'flying') && other(G, P).bf.some((c) => isCreature(c) && !c.tapped && !has(c, 'flying') && !has(c, 'reach')) ? 1.2 : 0.2) })] },
    { label: 'Titanium Man deals 1 damage to any target', eff: [{ k: 'dmgX', nFn: () => 1, tgt: { what: 'any', f: {} } }] },
  ])] }));
  return d;
};
S['Venom, Evil Unleashed'] = (d) => {
  d.gyActs = [{ cost: { m: C('{2}{B}'), exileSelf: true }, sorcery: true, label: 'Two +1/+1 counters and deathtouch on a creature',
    eff: [{ k: 'ctrs', n: 2, tgt: tg(YOU) }, fn((G, X) => { const c = X.last && X.last.c; if (c && onBf(G, c)) grantKw(G, c, ['deathtouch']); }, { score: () => 0.4 })], when: ['main1'] }];
  return d;
};
S['Boomerang, Blade Flinger'] = (d) => { d.trig.push(T('attack', { self: true, run: (G, X) => { hitOpp(G, X, 1); gain(G, X.P, 1); } })); return d; };
S['Crimson Cowl, Master of Evil'] = (d) => { d.trig.push(T('attacks', { you: true, cond: (G, src, ev) => ev.cs.some((c) => !c.token && hasSub(c, 'Villain')), eff: [mkE(VILLAIN, 1)] })); return d; };
S['Radioactive Man'] = (d) => { d.hit = [fn((G, X) => loseLife(G, X.O, Math.ceil(Math.max(0, X.O.life) / 2), X.P.i), { score: () => 2 })]; return d; };
S['Villainous Syndication'] = (d) => {
  planOn(d, 4, [{ k: 'regrow', to: 'bf', tgt: { what: 'gy', mine: true, f: { types: ['Creature'] } } }], 'Return a creature card from your graveyard to the battlefield');
  d.acts.push({ cost: { tapCre: 1, tapCreF: (x) => hasSub(x, 'Villain') }, sorcery: true, label: 'Mill a card and add a plan counter', when: ['main2'],
    run: (G, X) => { mill(G, X.P, 1); plan(G, X, 1); }, ai: (G, P) => (P.library.length > 8 ? { score: 1.2 } : null) });
  return d;
};
S['Doombot Harbinger'] = (d) => {
  d.etb = [fn((G, X) => { if (yesNo(G, X.P, X.src, 'Mill four cards?', X.P.library.length > 16)) mill(G, X.P, 4); }, { score: () => 0.4 })];
  d.trig.push(T('die', { self: true, run: (G, X) => {
    const P = X.P, c = X.src, Q = G.players[c.owner];
    if (!Q.gy.includes(c) || !P.gy.some((x) => x !== c && x.def.types.includes('Creature'))) return;
    if (!yesNo(G, P, c, `Exile ${c.def.name} to return a creature card from your graveyard to your hand?`, true)) return;
    Q.gy.splice(Q.gy.indexOf(c), 1); Q.exile.push(c); dirty(G);
    emit(G, 'exile', `${P.name} exiles ${c.def.name} from their graveyard.`, { who: P.i, cards: [c.id] });
    if (G.pending) G.pending.unshift({ src: c, P, t: { eff: [{ k: 'regrow', tgt: { what: 'gy', mine: true, f: { types: ['Creature'] } } }], label: 'Return a creature card to your hand' }, ev: {} });
  } }));
  return d;
};
S['Eerie Gravestone'] = (d) => {
  d.etb = [{ k: 'draw', n: 1 }];
  d.acts.push({ cost: { m: C('{1}{B}'), sacSelf: true }, label: 'Mill four; you may put a creature card from among them into your hand', when: ['main2', 'end'],
    run: (G, X) => {
      const P = X.P, cs = creatureCards(mill(G, P, 4));
      const pick = cs.length ? (isHuman(G, P) ? pickSome(G, P, cs, 0, 1, 'You may put a creature card into your hand', (c) => c.def.value, 'graveyard')[0] : cs.slice().sort((a, b) => b.def.value - a.def.value)[0]) : null;
      if (pick && P.gy.includes(pick)) { P.gy.splice(P.gy.indexOf(pick), 1); P.hand.push(pick); dirty(G); emit(G, 'raise', `${P.name} puts ${pick.def.name} into their hand.`, { who: P.i, cards: [pick.id] }); }
    }, ai: (G, P) => (P.library.length > 10 && P.hand.length <= 2 ? { score: 1.3 } : null) });
  return d;
};
// "Whenever another artifact is put into your graveyard from the battlefield or an artifact card is put into your graveyard from anywhere else"
function artifactToGy(run) {
  return [T('leave', { cond: (G, src, ev, Q) => ev.to === 'gy' && ev.art && ev.c !== src && ev.c.owner === Q.i, run: (G, X) => run(G, X, 1) }),
    T('gyAdded', { you: true, cond: (G, src, ev) => ev.cards.some((c) => isArtCard(c) && !ev.fromBf.includes(c)), run: (G, X) => run(G, X, X.ev.cards.filter((c) => isArtCard(c) && !X.ev.fromBf.includes(c)).length) })];
}
S['Ultron the Annihilator'] = (d) => {
  d.etb = [mkE(ROBOT_VILLAIN, 1)];
  d.trig.push(T('attack', { self: true, eff: [mkE(ROBOT_VILLAIN, 1)] }), ...artifactToGy((G, X, n) => loseLife(G, X.O, n, X.P.i)));
  return d;
};
S["Ultron's Auxiliary"] = (d) => { d.trig.push(...artifactToGy((G, X, n) => addCounters(G, X.src, n))); return d; };
S['Citizen V, Helmut Zemo'] = (d) => { d.trig.push(T('gain', { you: true, run: (G, X) => ctrEach(G, X.P.bf.filter((c) => isCreature(c) && hasSub(c, 'Villain')), 1) })); return d; };
S['Fixer, Techno Terror'] = (d) => {
  d.acts.push({ cost: { tap: true, life: 2 }, label: 'Pay 2 life: draw a card', eff: [{ k: 'draw', n: 1 }], when: ['main2', 'end'],
    cond: (G, P) => enteredThisTurn(G, P).some((c) => isArtifact(c)), ai: (G, P) => (P.life > 8 ? { score: 1 } : null) });
  return d;
};
S['MACH-1, Swooping Scoundrel'] = (d) => {
  d.etb = [fn((G, X) => { if (onceATurn(G, X.src)) L.surveil(G, X.P, 1); }, { score: () => 0.3 })];
  d.trig.push(T('gain', { you: true, cond: (G, src) => src.mem.onceTurn !== G.turn, run: (G, X) => { if (onceATurn(G, X.src)) L.surveil(G, X.P, 1); } }));
  return d;
};
S['Valentina Allegra de Fontaine'] = (d) => {
  d.statics.push({ who: 'all', f: { side: 'you', other: true, sub: 'Villain' }, p: 0, t: 0, kw: [], addSub: ['Hero'] });
  d.acts.push({ cost: { tap: true }, sorcery: true, label: 'A Hero you control connives', when: ['main2'],
    eff: [fn((G, X, t) => { if (t && t.c && onBf(G, t.c)) connive(G, X.P, t.c, 1); }, { tgt: { f: { side: 'you', sub: 'Hero' } }, val: (G, P, c) => 1 + (c.attacking ? 0 : 0.1), label: 'Choose a Hero you control' })] });
  return d;
};
S['Dark Ritual'] = (d) => {
  // Worth casting when the extra mana lets a bigger spell from hand be cast now
  const enables = (G, P) => {
    const extra = Object.assign({}, P, { pool: Object.assign({}, P.pool || {}, { B: ((P.pool && P.pool.B) || 0) + 3 }) });
    return P.hand.filter((c) => c.def.name !== 'Dark Ritual' && !c.def.types.includes('Land') && !L.canPay(P, L.castCost(P, c)) && L.canPay(extra, Object.assign({}, L.castCost(P, c), { B: (L.castCost(P, c).B || 0) + 1 })))
      .reduce((m, c) => Math.max(m, c.def.value), 0);
  };
  d.spell = [fn((G, X) => { L.addPool(G, X.P, ['B', 'B', 'B']); say(G, X.P, `${X.P.name} adds {B}{B}{B}.`); }, { score: (G, P) => { const v = enables(G, P); return v > 0 ? 1 + v * 0.6 : -1; }, value: 1 })];
  return d;
};
S['Deadly Dispute'] = (d) => { d.addCost = { sac: { types: ['Artifact', 'Creature'] }, sacWord: 'an artifact or creature' }; d.spell = [{ k: 'draw', n: 2 }, { k: 'treasure', n: 1 }]; return d; };
S['Doctor Doom, Unrivaled'] = (d) => {
  d.acts.push({ cost: { tap: true }, label: 'Draw a card and lose 1 life; win with an empty library', when: ['end', 'main2'],
    run: (G, X) => {
      drawN(G, X.P, 1); loseLife(G, X.P, 1);
      if (!X.P.library.length && !X.P.decked) { X.O.loseNow = true; X.O.loseWhy = `${X.P.name}'s library is empty: Doctor Doom wins the game`; emit(G, 'info', `${X.P.name}'s library is empty: ${X.P.name} wins the game.`, { who: X.P.i }); }
    },
    ai: (G, P) => (P.library.length === 1 ? { score: 100 } : P.life > 8 && P.library.length > 8 ? { score: 0.9 } : null) });
  return d;
};
S['Doomfall'] = (d) => {
  d.modes = [
    { label: 'Your opponent exiles a creature they control', eff: [fn((G, X) => {
      const Q = X.O, cs = Q.bf.filter(isCreature);
      if (!cs.length) return;
      const c = L.sacrificeChoice(G, Q, cs);
      emit(G, 'exile', `${Q.name} exiles ${c.def.name}.`, { who: Q.i, cards: [c.id] });
      L.exilePermanent(G, Q, c);
    }, { score: (G, P) => { const cs = other(G, P).bf.filter(isCreature); return cs.length ? Math.min(...cs.map(cv)) + 0.4 : -1; } })] },
    { label: 'Look at their hand and exile a nonland card from it', eff: [fn((G, X) => {
      const Q = X.O, cs = Q.hand.filter((c) => !c.def.types.includes('Land'));
      emit(G, 'info', `${Q.name} reveals their hand${Q.hand.length ? `: ${nameList(Q.hand)}` : ''}.`, { who: X.P.i, cards: Q.hand.map((c) => c.id) });
      if (!cs.length) return;
      const c = isHuman(G, X.P) ? L.pickCards(G, { type: 'choose', reason: 'choose', n: 1, min: 1, max: 1, zone: 'hand', cards: cs.map((x) => x.id), label: 'Exile a nonland card from their hand' }, cs, 1)[0] : cs.slice().sort((a, b) => b.def.value - a.def.value)[0];
      Q.hand.splice(Q.hand.indexOf(c), 1); Q.exile.push(c); dirty(G);
      emit(G, 'exile', `${X.P.name} exiles ${c.def.name} from ${Q.name}'s hand.`, { who: X.P.i, cards: [c.id] });
    }, { score: (G, P) => (other(G, P).hand.some((c) => !c.def.types.includes('Land')) ? 1.8 : 0.2) })] },
  ];
  d.spell = null;
  return d;
};
S['Doomsday'] = (d) => {
  d.spell = [fn((G, X) => {
    const P = X.P, pool = P.library.concat(P.gy);
    const keep = isHuman(G, P) ? L.pickCards(G, { type: 'choose', reason: 'choose', n: 5, min: Math.min(5, pool.length), max: Math.min(5, pool.length), zone: 'library', cards: pool.map((c) => c.id), label: 'Doomsday: choose five cards to keep (the first you pick goes on top)' }, pool, Math.min(5, pool.length))
      : pool.slice().sort((a, b) => b.def.value - a.def.value || a.id - b.id).slice(0, 5);
    const rest = pool.filter((c) => !keep.includes(c));
    P.library = []; P.gy = [];
    P.exile.push(...rest);
    P.library.push(...keep.slice().reverse());
    dirty(G);
    emit(G, 'exile', `${P.name} keeps five cards and exiles the other ${rest.length}.`, { who: P.i });
    loseLife(G, P, Math.ceil(Math.max(0, P.life) / 2));
  }, { score: (G, P) => (P.bf.some((c) => c.def.name === 'Doctor Doom, Unrivaled') && P.life >= 10 ? 4 : -3), value: 0.5 })];
  return d;
};
S['Count Nefaria'] = (d) => { d.costMod = (G, P) => (P.sacTurn === G.turn ? 3 : 0); return d; };
S['Criminal Enterprise'] = (d) => {
  d.etb = [mkE(VILLAIN, 1)];
  d.trig.push(T('die', { you: true, cond: (G, src, ev) => (ev.sub || []).includes('Villain'), run: (G, X) => { hitOpp(G, X, 1); gain(G, X.P, 1); } }));
  return d;
};
S['Hammerhead, Maggia Boss'] = (d) => {
  d.acts.push({ cost: { sac: { f: { types: ['Creature', 'Artifact'] }, label: 'another creature or artifact' } }, label: 'Put a +1/+1 counter on Hammerhead', run: (G, X) => addCounters(G, X.src, 1), noAi: true });
  return d;
};
S['Kingpin, Wilson Fisk'] = (d) => { d.trig.push(T('sac', { you: true, once: true, cond: (G, src, ev) => isCreature(ev.c), eff: [{ k: 'treasure', n: 2 }] })); return d; };
S["The Spot's Portal"] = (d) => {
  d.spell = [fn((G, X, t) => {
    const c = t && t.c; if (!c || !onBf(G, c)) return;
    toLibrary(G, X, c, 'bottom');
    if (!X.P.bf.some((x) => isCreature(x) && hasSub(x, 'Villain'))) loseLife(G, X.P, 2);
  }, { tgt: { f: {} }, val: (G, P, c) => (c.ctrl === P.i ? -pv(G, c) - 2 : pv(G, c) + 0.6), label: "Put a creature on the bottom of its owner's library", value: 4 })];
  d.role = 'removal';
  return d;
};
S['Alien Symbiosis'] = (d) => {
  d.statics = d.statics.filter((x) => x.who !== 'enchanted');
  d.statics.push({ who: 'enchanted', p: 1, t: 1, kw: ['menace'], addSub: ['Symbiote'] });
  d.gyDiscard = true;
  return d;
};
S['Green Goblin, Back for More'] = (d) => {
  d.mayhem = C('{3}{B}{B}');
  d.trig.push(T('combatStart', { you: true, run: (G, X) => {
    const P = X.P;
    if (!P.hand.length || !X.O.hand.length) return;
    const ai = P.hand.some((c) => handValue(G, P, c) < 1);
    if (!yesNo(G, P, X.src, 'Discard a card to make your opponent discard a card?', ai)) return;
    discardE(G, P, 1, 'discard');
    discardE(G, X.O, 1, 'discard');
  } }));
  return d;
};
S['Inner Demons Gangsters'] = (d) => {
  d.acts.push({ cost: { discard: 1 }, sorcery: true, label: '+1/+0 and menace until end of turn', run: (G, X) => pump(G, X.src, 1, 0, ['menace']), when: ['main1'],
    ai: (G, P, c) => (!c.tapped && !c.sick && P.hand.some((x) => handValue(G, P, x) < 0.8) ? { score: 0.8 } : null) });
  return d;
};
S['Pumpkin Bombardment'] = (d) => { d.addCost = { discard: 1, orPay: C('{2}') }; d.spell = [{ k: 'dmgX', nFn: () => 3, tgt: { f: {} } }]; d.role = 'removal'; return d; };
S['Rocket-Powered Goblin Glider'] = (d) => {
  d.mayhem = C('{2}');
  d.etb = [Object.assign(attachE(), { if: (G, X) => !!X.item && ['mayhem', 'gycast', 'gydiscard', 'escape', 'flashback'].includes(X.item.zone) })];
  return d;
};
S['Sadistic Slash'] = (d) => { d.mayhem = C('{1}{B}'); d.spell = [{ k: 'pumpT', p: -5, t: -5, tgt: { f: {} } }]; d.role = 'removal'; return d; };
S['Swarm, Being of Bees'] = (d) => { d.mayhem = C('{B}'); return d; };
S['Undead Hand Ninja'] = (d) => { d.trig.push(T('gyLeft', { you: true, cond: creCardsLeft, run: (G, X) => drain(G, X, 1) })); return d; };

/* ============================================================ Red */
S['Masked Meower'] = (d) => {
  d.acts.push({ cost: { discard: 1, sacSelf: true }, label: 'Discard a card and sacrifice it: draw a card', eff: [{ k: 'draw', n: 1 }], when: ['end', 'main2'],
    ai: (G, P, c) => {
      const lands = P.hand.filter((x) => x.def.types.includes('Land')).length, mine = P.bf.filter((x) => x.def.types.includes('Land')).length;
      return lands >= 2 && mine >= 5 && pow(c) <= 1 ? { score: 0.9 } : null;
    } });
  return d;
};
S['Pick Up the Pace'] = (d) => {
  const permit = (G, P, x) => P.bf.some((y) => y.id === x.src) && attackedThisTurn(G, P).length > 0;
  d.trig.push(T('attack', { you: true, cond: (G, src, ev) => ev.c.inTurn === G.turn, run: (G, X) => {
    const P = X.P, c = P.library.pop();
    if (!c) return;
    P.exile.push(c);
    P.xcast.push({ card: c, until: Infinity, src: X.src.id, cond: permit });
    dirty(G);
    emit(G, 'exile', `${P.name} exiles ${c.def.name} from the top of their library with ${X.src.def.name}.`, { who: P.i, cards: [c.id] });
  } }));
  return d;
};
S['Whirlwind, Killer Cyclone'] = (d) => {
  d.trig.push(T('attacks', { you: true, cond: (G, src, ev) => ev.cs.some((c) => c.inTurn === G.turn), eff: [{ k: 'noBlock', f: {} }] }));
  return d;
};
S["Heroes' Hangout"] = (d) => {
  d.modes = [
    { label: 'Date Night: exile the top two cards; you may play one of them until the end of your next turn', eff: [fn((G, X) => {
      const P = X.P, top = P.library.splice(Math.max(0, P.library.length - 2)).reverse();
      if (!top.length) return;
      P.exile.push(...top); dirty(G);
      const c = pickOne(G, P, top, 'Choose a card you may play until the end of your next turn', (x) => x.def.value + (x.def.types.includes('Land') ? 0.5 : 0), 'look', 'exile');
      P.xcast.push({ card: c, until: untilMyNextEnd(G, P) });
      emit(G, 'exile', `${P.name} exiles ${nameList(top)} and may play ${c.def.name} until the end of their next turn.`, { who: P.i, cards: top.map((x) => x.id) });
    }, { score: () => 1.3, value: 1.3 })] },
    { label: 'Patrol Night: one or two creatures each get +1/+0 and first strike', eff: [{ k: 'pumpT', p: 1, t: 0, kw: ['first strike'], tgt: { f: {}, n: 2, min: 1 } }] },
  ];
  d.spell = null;
  return d;
};
S['Jack of Hearts, Volatile Hero'] = (d) => {
  d.trig.push(T('die', { self: true, run: (G, X) => {
    const n = X.ev.pow || 0; if (n <= 0) return;
    for (const c of allCreatures(G)) L.damageCreature(G, c, n, X.src);
    emit(G, 'damage', `${X.src.def.name} deals ${n} damage to each creature.`, { who: X.P.i });
  } }));
  return setPU(d, '{4}{R}{R}', { run: (G, X) => {
    const P = X.P;
    discardHand(G, P);
    drawN(G, P, 3);
    addCounters(G, X.src, 2);
  }, ai: puAi((G, P) => 3.2 - P.hand.reduce((t, c) => t + handValue(G, P, c), 0) * 0.5) });
};
S['Molly Hayes, Runaway'] = (d) => setPU(d, '{5}{R}', { run: (G, X) => { addCounters(G, X.src, 2); impulse(G, X.P, untilMyNextEnd(G, X.P)); }, ai: puAi(3) });
S['Quinjet Technician'] = (d) => { d.mana = null; d.manaAbs = [{ colors: ['R'] }, { colors: ['R'], amount: 2, only: (p) => !!p.pu }]; return d; };
S['Crossover Collaboration'] = (d) => twSpell(d, 2,
  { label: 'Exile the top two cards; you may play them until the end of your next turn', eff: [fn((G, X) => exileTopUntil(G, X.P, untilMyNextEnd(G, X.P), 2), { score: () => 1.8, value: 1.8 })] },
  { label: 'Exile the top two cards to play, and create a Treasure (teamwork)', eff: [fn((G, X) => exileTopUntil(G, X.P, untilMyNextEnd(G, X.P), 2), { score: () => 1.8 }), { k: 'treasure', n: 1 }] });
S['Hulkling, Young Avenger'] = (d) => {
  const self = d;
  const morph = T('cast', { you: true, cond: (G, s, ev) => !!ev.card && !ev.card.def.types.includes('Creature'), eff: [fn((G, X, t) => {
    const c = t && t.c, h = X.src; if (!c || !onBf(G, c) || !onBf(G, h)) return;
    becomeCopy(G, h, c.def, null, { untilEnd: true });
    // except his name is Hulkling, he's 4/4, and he has flying and this ability
    Object.assign(h.def, { name: self.name, power: 4, toughness: 4, kw: [...new Set(h.def.kw.concat('flying'))], trig: (h.def.trig || []).filter((x) => x !== morph).concat(morph) });
    dirty(G);
  }, { tgt: tg({ other: true }, { min: 0 }), val: (G, P, c) => c.def.value - (c.def.power + c.def.toughness) * 0.35 - 2, label: 'Up to one other creature for Hulkling to copy' })] });
  d.trig.push(morph);
  return d;
};
S['Patriot, Young Avenger'] = (d) => { d.statics.push({ who: 'all', f: { side: 'you', other: true }, cond: (G, src) => equipmentOn(G, src).length > 0, p: 1, t: 0, kw: [] }); return d; };
S['Wiccan, Young Avenger'] = (d) => { d.trig.push(castNC({ run: (G, X) => exileTopUntil(G, X.P, untilMyEndStep(G, X.P), 1) })); return d; };
S['Grapeshot'] = (d) => {
  d.spell = [{ k: 'dmgX', nFn: () => 1, tgt: { what: 'any', f: {} } }];
  d.onCast = (G, P, item) => { const n = Math.max(0, (P.cast || 1) - 1) + (other(G, P).cast || 0); if (n) say(G, P, `Storm: ${n} ${n === 1 ? 'copy' : 'copies'} of Grapeshot.`); for (let k = 0; k < n && !G.over; k++) L.copySpell(G, P, item); };
  return d;
};
S['Molten Lavamancer'] = (d) => { d.trig.push(T('dmgPlayer', { once: true, cond: (G, src, ev, Q) => ev.by === Q.i && ev.P !== Q && !ev.combat && G.active === Q.i, eff: [mkE(ELEMENTAL, 1)] })); return d; };
S['The Vision and Scarlet Witch'] = (d) => { d.trig.push(T('cast', { you: true, run: (G, X) => { L.addPool(G, X.P, ['R']); addCounters(G, X.src, 1); } })); return d; };
S["Wanda's Vision"] = (d) => { d.trig.push(T('cast', { you: true, cond: (G, s, ev) => ev.nth === 2, run: (G, X) => freeFromTop(G, X.P, X.src) })); return d; };
S['Alex Wilder, Runaway'] = (d) => {
  d.escape = { cost: C('{2}{R}'), exile: 3 };
  d.trig.push(T('enter', { you: true, cond: (G, src, ev) => isCreature(ev.c) && !!ev.cast && ev.cast !== 'hand', run: (G, X) => pump(G, X.ev.c, 2, 0, ['haste']) }));
  return d;
};
S['Chase Stein, Runaway'] = (d) => {
  d.acts.push({ cost: { tap: true, discard: 1 }, label: 'Discard a card: exile the top card; you may play it until the end of your next turn', when: ['main2', 'end'],
    run: (G, X) => exileTopUntil(G, X.P, untilMyNextEnd(G, X.P), 1),
    ai: (G, P) => (P.hand.some((c) => handValue(G, P, c) < 1) ? { score: 0.9 } : null) });
  return d;
};
S['Karolina Dean, Runaway'] = (d) => {
  d.trig.push(T('mainStart', { you: true, run: (G, X) => {
    const P = X.P;
    P.rpool = { m: { W: 1, U: 1, B: 1, R: 1, G: 1 }, ok: (Q, purpose) => !!purpose && (purpose.ability || (!!purpose.def && !!(purpose.card || (purpose.item && purpose.item.card)) && !Q.hand.includes(purpose.card || purpose.item.card))) };
    say(G, P, `${P.name} adds {W}{U}{B}{R}{G} (not for spells cast from their hand).`);
  } }));
  return d;
};
S['Nico Minoru, Runaway'] = (d) => {
  d.trig.push(T('cast', { you: true, cond: (G, s, ev) => ev.zone !== 'hand', run: (G, X) => hitOpp(G, X, 2) }));
  d.acts.push({ cost: { m: C('{2}{R}'), tap: true, discard: 1 }, label: 'Discard a card: cast the next nonland card from your library for free', when: ['main1', 'main2'],
    run: (G, X) => freeFromTop(G, X.P, X.src), ai: (G, P) => (P.hand.some((c) => handValue(G, P, c) < 1.2) ? { score: 2 } : null) });
  return d;
};
S['Asgardian Inspiration'] = (d) => {
  d.spell = [fn((G, X) => exileTopUntil(G, X.P, G.turn, 1), { score: () => 0.9, value: 0.9 })];
  d.gyTrig = [T('dmgPlayer', { cond: (G, src, ev, Q) => ev.by === Q.i && ev.P !== Q && !ev.combat && Q.gy.includes(src), run: (G, X) => {
    const P = X.P, c = X.src;
    if (!P.gy.includes(c) || !L.canPay(P, C('{2}')) || !yesNo(G, P, c, `Pay {2} to return ${c.def.name} to your hand?`, L.manaCount(P) >= 3)) return;
    if (!L.pay(P, C('{2}'))) return;
    P.gy.splice(P.gy.indexOf(c), 1); P.hand.push(c); dirty(G);
    emit(G, 'raise', `${P.name} returns ${c.def.name} to their hand.`, { who: P.i, cards: [c.id] });
  } })];
  return d;
};
S["Mjölnir's Might"] = (d) => { d.spell = [{ k: 'dmgX', nFn: () => 4, tgt: { what: 'player' } }, impulseE()]; return d; };
S['Origin of Thor'] = (d) => {
  d.saga = [
    { ch: [1], run: (G, X) => {
      const P = X.P;
      if (!P.hand.length || !yesNo(G, P, X.src, 'Discard a card to draw two?', P.hand.some((c) => handValue(G, P, c) < 1.5))) return;
      discardE(G, P, 1, 'discard'); drawN(G, P, 2);
    } },
    { ch: [2], run: (G, X) => { say(G, X.P, `Whenever ${X.P.name} casts a spell this turn, a creature they control gets a +1/+1 counter.`); turnTrig(G, X.P, X.src, T('cast', { you: true, eff: [{ k: 'ctrs', n: 1, tgt: tg(YOU) }] })); } },
    { ch: [3], eff: [fn((G, X, t) => { const c = t && t.c; if (c && onBf(G, c)) hit(G, X, { p: X.O.i }, Math.max(0, pow(c)), c); }, { tgt: tg(YOU), val: (G, P, c) => pow(c), label: 'Choose a creature you control' })] },
  ];
  return d;
};
S["Thor, Asgard's Avenger"] = (d) => { d.dmgPlusOne = true; return d; };
S['Big Score'] = (d) => { d.addCost = { discard: 1 }; d.spell = [{ k: 'draw', n: 2 }, { k: 'treasure', n: 2 }]; return d; };
S['Bionic Blow'] = (d) => {
  d.spell = [{ k: 'pumpT', pFn: (G, X) => X.x || 0, t: 0, tgt: tg(YOU) }, fn((G, X, t) => {
    const m = X.ts && X.ts[0] && X.ts[0].c, o = t && t.c;
    if (m && o && onBf(G, m) && onBf(G, o) && m !== o) hit(G, X, o, Math.max(0, pow(m)), m);
  }, { tgt: tg({}, { min: 0 }), val: (G, P, c) => (c.ctrl === P.i ? -cv(c) : cv(c) + 0.3), label: 'Up to one other creature takes the damage' })];
  d.aiX = (G, P, card, x) => x;
  return d;
};
S['Contract Hero'] = (d) => {
  d.etb = [{ k: 'treasure', n: 1 }];
  d.trig.push(T('attack', { self: true, run: (G, X) => {
    const P = X.P, arts = P.bf.filter((c) => isArtifact(c) && !L.isCreature(c));
    const junk = P.hand.filter((c) => handValue(G, P, c) < 0.8);
    const opts = [];
    if (arts.length) opts.push('Sacrifice an artifact');
    if (P.hand.length) opts.push('Discard a card');
    if (!opts.length) return;
    let k;
    if (isHuman(G, P)) { const all = opts.concat('Neither'); k = all[chooseMode(G, P, X.src, `${X.src.def.name}: sacrifice an artifact or discard a card for +2/+0?`, all, all.length - 1)]; }
    else k = junk.length ? 'Discard a card' : null;
    if (k === 'Sacrifice an artifact') { const a = pickOne(G, P, arts, 'Sacrifice an artifact', (c) => -pv(G, c)); emit(G, 'sac', `${P.name} sacrifices ${a.def.name}.`, { who: P.i, cards: [a.id] }); L.sacrifice(G, P, a, true); }
    else if (k === 'Discard a card') discardE(G, P, 1, 'discard');
    else return;
    pump(G, X.src, 2, 0);
  } }));
  return d;
};
S['Heroes for Hire'] = (d) => {
  d.etb = [{ k: 'treasure', n: 3 }];
  d.acts.push({ cost: { sac: { f: { types: ['Treasure'] }, label: 'a Treasure' } }, label: 'Sacrifice a Treasure: exile the top card; you may play it this turn', run: (G, X) => exileTopUntil(G, X.P, G.turn, 1), when: ['main2'],
    ai: (G, P) => (P.bf.filter((c) => isLand(c) && !c.tapped).length >= 3 ? { score: 1 } : null) });
  return d;
};
S['Iron Fist, Hero for Hire'] = (d) => setPU(d, '{7}{R}', { eff: [{ k: 'divided', n: 5, max: 5 }, fn((G, X) => addCounters(G, X.src, 5), { score: () => 4 })], ai: puAi(5) });
S['Luke Cage, Hero for Hire'] = (d) => { d.trig.push(T('combatStart', { you: true, eff: [{ k: 'treasure', n: 1 }] })); return d; };
S['Daredevil, Fearless Fighter'] = (d) => {
  d.trig.push(T('dmgPlayer', { cond: (G, src, ev, Q) => ev.P === Q && ev.by === Q.i && ev.n > 0, eff: [{ k: 'dmgX', nFn: (G, X) => X.ev.n, tgt: { what: 'player', f: { side: 'opp' } } }] }));
  d.trig.push(T('attack', { self: true, run: (G, X) => {
    const [c] = exileTopUntil(G, X.P, G.turn, 1);
    if (c && c.def.mv > 0) hit(G, X, { p: X.P.i }, c.def.mv);
  } }));
  return d;
};
S["Daredevil's Billy Club"] = (d) => {
  d.etb = [{ k: 'dmgX', nFn: () => 2, tgt: { what: 'any', f: {} } }, fn((G, X) => hit(G, X, { p: X.P.i }, 1), { score: (G, P) => -0.2 })];
  return d;
};
S['Elektra, Femme Fatale'] = (d) => {
  d.etb = [fn((G, X) => {
    const P = X.P, foes = X.O.bf.filter(isCreature);
    if (!foes.length || !yesNo(G, P, X.src, `${X.src.def.name}: take 2 damage to deal 4 damage to a creature?`, P.life > 6 && foes.some((c) => cv(c) >= 2.5))) return;
    hit(G, X, { p: P.i }, 2);
    if (G.pending) G.pending.unshift({ src: X.src, P, t: { eff: [{ k: 'dmgX', nFn: () => 4, tgt: { f: {} } }], label: '4 damage to a creature' }, ev: {} });
  }, { score: () => 1.5 })];
  return d;
};
S["Fogwell's Gym"] = (d) => {
  d.mana = ['R'];
  d.onManaTap = (G, P, c) => L.damagePlayer(G, P, 1, c, P);
  d.acts.push({ cost: { m: C('{2}{R}'), tap: true, discard: 1 }, label: 'Discard a card: draw a card', eff: [{ k: 'draw', n: 1 }], when: ['end'],
    ai: (G, P) => (P.hand.some((c) => handValue(G, P, c) < 0.6) ? { score: 0.8 } : null) });
  return d;
};
S['Stegron the Dinosaur Man'] = (d) => {
  d.handActs = [{ cost: { m: C('{1}{R}'), discardSelf: true }, label: 'Dinosaur Formula: +3/+1 and a Dinosaur until end of turn', when: ['blocks'],
    eff: [fn((G, X, t) => { const c = t && t.c; if (!c || !onBf(G, c)) return; pump(G, c, 3, 1); c.addSubs = (c.addSubs || []).concat('Dinosaur'); dirty(G); }, { tgt: tg(YOU), label: 'Choose a creature you control',
      val: (G, P, c) => (c.attacking || c.blocking ? 1.3 + (c.blocking || c.blockedBy.length ? 0.6 : 0) : -0.5) })] }];
  return d;
};
S['Stick, Fearless Mentor'] = (d) => { d.trig.push(T('dmgPlayer', { once: true, cond: (G, src, ev, Q) => ev.P === Q && ev.by === Q.i && ev.n > 0, run: (G, X) => exileTopUntil(G, X.P, untilMyNextEnd(G, X.P), 1) })); return d; };
S['Unlucky Witness'] = (d) => {
  d.dies = [fn((G, X) => {
    const P = X.P, top = P.library.splice(Math.max(0, P.library.length - 2)).reverse();
    if (!top.length) return;
    P.exile.push(...top); dirty(G);
    const c = pickOne(G, P, top, 'Choose a card you may play until your next end step', (x) => x.def.value + (x.def.types.includes('Land') ? 0.5 : 0), 'look', 'exile');
    P.xcast.push({ card: c, until: untilMyEndStep(G, P) });
    emit(G, 'exile', `${P.name} exiles ${nameList(top)} and may play ${c.def.name} until their next end step.`, { who: P.i, cards: top.map((x) => x.id) });
  }, { score: () => 0.8 })];
  return d;
};
S['Spider-Mobile'] = (d) => {
  const grow = (G, X) => { const n = X.P.bf.filter((c) => isCreature(c) && isSpider(c)).length; if (n) pump(G, X.src, n, n); };
  d.trig.push(T('attack', { self: true, run: grow }), T('blocks', { self: true, run: grow }));
  return d;
};
S['Hobgoblin, Mantled Marauder'] = (d) => { d.trig.push(T('discard', { you: true, run: (G, X) => pump(G, X.src, 2, 0) })); return d; };
S['Lady Spider, Maybelle Reilly'] = (d) => { d.trig.push(T('discard', { you: true, cond: (G, src, ev, Q) => Q.bf.some((c) => isCreature(c) && isSpider(c)), eff: [{ k: 'ctrs', n: 1, tgt: { f: { side: 'you', sub: 'Spider' } } }] })); return d; };
S['Romantic Rendezvous'] = (d) => { d.spell = [fn((G, X) => { discardE(G, X.P, 1, 'discard'); drawN(G, X.P, 2); }, { score: () => 1.6, value: 1.6 })]; return d; };
S['Spider-Gwen, Free Spirit'] = (d) => {
  d.trig.push(T('tapped', { cond: (G, src, ev) => ev.cs.includes(src), run: (G, X) => {
    const P = X.P;
    if (!P.hand.length || !yesNo(G, P, X.src, `${X.src.def.name}: discard a card to draw a card?`, P.hand.some((c) => handValue(G, P, c) < 0.8))) return;
    discardE(G, P, 1, 'loot'); drawN(G, P, 1);
  } }));
  return d;
};
S['Spider-Man, New Champion'] = (d) => { d.trig.push(discardBatch({ eff: [{ k: 'dmgX', nFn: (G, X) => X.ev.n || 1, tgt: { what: 'any', f: {} } }] })); return d; };
S['Wisecrack'] = (d) => {
  d.spell = [fn((G, X, t) => {
    const c = t && t.c; if (!c || !onBf(G, c)) return;
    const Q = ctrlOf(G, c), atk = !!c.attacking;
    L.damageCreature(G, c, Math.max(0, pow(c)), c);
    if (atk) hit(G, X, { p: Q.i }, 2);
  }, { tgt: { f: {} }, val: (G, P, c) => (c.ctrl === P.i ? -cv(c) : (pow(c) >= L.lethalTo(c) ? cv(c) + 0.5 : 0.1) + (c.attacking ? 0.5 : 0)), label: 'A creature deals damage equal to its power to itself', value: 2.5 })];
  d.role = 'removal';
  return d;
};
S["Captain America's Motorcycle"] = (d) => { d.etb = [{ k: 'pumpT', p: 2, t: 0, tgt: { f: { types: ['Creature', 'Vehicle'] } } }]; return d; };
S['Intrepid Ace'] = (d) => { d.statics.push({ who: 'self', cond: (G, src) => !src.attacking && !src.blocking, p: 2, t: 0, kw: [] }); return d; };
S['Sky Cycle'] = (d) => { d.etb = [{ k: 'dmgX', nFn: (G, X) => 2 * X.P.bf.filter(isVehicle).length, tgt: tg({}, { min: 0 }) }]; return d; };
S['The Thanos-Copter'] = (d) => {
  d.etb = [fn((G, X) => {
    const vs = X.P.bf.filter(isVehicle);
    vs.forEach((v) => { v.crewed = true; });
    dirty(G);
    if (vs.length) emit(G, 'ability', `${nameList(vs)} ${vs.length === 1 ? 'becomes an artifact creature' : 'become artifact creatures'} until end of turn.`, { who: X.P.i, cards: vs.map((v) => v.id) });
  }, { score: () => 1.5 })];
  d.trig.push(T('hitPlayer', { you: true, cond: (G, src, ev) => isVehicle(ev.c), eff: [{ k: 'draw', n: 1 }] }));
  return d;
};
S['Inspired Fire'] = (d) => { d.spell = [{ k: 'dmgX', nFn: () => 4, tgt: { f: {} } }]; d.costMod = (G, P) => P.drawn || 0; d.role = 'removal'; return d; };

/* ============================================================ Green */
S['Hulk, Strongest There Is'] = (d) => {
  d.etbCtr = () => ({ '+1/+1': 1 });
  d.trig.push(T('upkeep', { you: true, run: (G, X) => { for (const c of X.P.bf.filter((x) => isCreature(x) && hasSub(x, 'Gamma') && x.cnt > 0)) addCounters(G, c, c.cnt); } }));
  return d;
};
S["Hulk's Thunderclap"] = (d) => {
  const art = { types: ['Artifact', 'Enchantment'], fn: (G, c) => !isCreature(c) };
  d.modes = [{ label: 'Your creature deals damage equal to its power to another creature', eff: [{ k: 'bite' }] },
    { label: 'Damage, and destroy a noncreature artifact or enchantment (behold a Gamma creature)', eff: [{ k: 'bite' }, { k: 'destroyP', tgt: { f: art } }], addCost: { behold: 'Gamma' } }];
  d.spell = null;
  d.role = 'removal';
  return d;
};
S['Big Bertha'] = (d) => {
  d.etb = [fn((G, X) => addCounters(G, X.src, (X.item && X.item.x) || 0), { score: () => 0 })];
  d.acts.push({ cost: { m: C('{1}{G}'), tap: true }, label: 'Put a +1/+1 counter on Big Bertha', run: (G, X) => addCounters(G, X.src, 1), when: ['end', 'main2'], ai: () => ({ score: 0.9 }) });
  return d;
};
S['Doorman'] = (d) => {
  d.acts.push({ cost: { tap: true }, label: "A creature can't be blocked by creatures with power 2 or less or Walls this turn", when: ['main1'],
    eff: [{ k: 'grant', flags: { bigOnly: true }, say: "can't be blocked by creatures with power 2 or less or Walls this turn", tgt: { f: {} } }],
    ai: (G, P, c) => {
      const foes = other(G, P).bf.filter((x) => isCreature(x) && !x.tapped);
      if (!foes.length || foes.some((x) => pow(x) > 2 && !hasSub(x, 'Wall'))) return null;
      const a = P.bf.filter((x) => x !== c && isCreature(x) && !x.tapped && (!x.sick || has(x, 'haste')) && pow(x) > 0).sort((x, y) => pow(y) - pow(x))[0];
      return a ? { score: 0.6 + pow(a) * 0.4, targets: [{ c: a }] } : null;
    } });
  return d;
};
S['Flatman'] = (d) => {
  d.acts.push({ cost: { m: C('{2}{G}') }, label: "Origami-Fu: switch Flatman's power and toughness", when: ['blocks'],
    run: (G, X) => { const c = X.src; c.tf.swapPT = !c.tf.swapPT; dirty(G); emit(G, 'pump', `${c.def.name} switches its power and toughness (${pow(c)}/${tou(c)}).`, { who: X.P.i, cards: [c.id] }); },
    ai: (G, P, c) => (c.attacking && !c.blockedBy.length && !c.tf.swapPT && tou(c) > pow(c) + 2 ? { score: tou(c) - pow(c) } : null) });
  return d;
};
S['Mister Immortal'] = (d) => {
  const back = { cost: { m: C('{2}{G}') }, label: 'Return Mister Immortal to the battlefield tapped', when: ['main2', 'end'],
    run: (G, X) => { emit(G, 'raise', `${X.src.def.name} returns to the battlefield tapped.`, { who: X.P.i, cards: [X.src.id] }); putOntoBattlefield(G, X.P, X.src, { tapped: true }); }, ai: () => ({ score: 1.4 }) };
  d.gyActs = [back];
  d.exActs = [back];
  return d;
};
S['Giant-Man, Gargantuan Genius'] = (d) => {
  d.trig.push(T('mainStart', { you: true, run: (G, X) => {
    const n = X.P.bf.filter((c) => isCreature(c) && pow(c) >= 4).length;
    if (!n) return;
    L.addPool(G, X.P, Array(n).fill('G'));
    say(G, X.P, `${X.P.name} adds ${'{G}'.repeat(n)}.`);
  } }));
  return d;
};
S['Terrific Team-Up'] = (d) => {
  d.spell = [{ k: 'pumpT', p: 1, t: 0, tgt: { f: { side: 'you' }, n: 2, min: 1 } }, fn((G, X, t) => {
    const o = t && t.c; if (!o || !onBf(G, o)) return;
    for (const m of tcs(X.ts && X.ts[0]).filter((x) => onBf(G, x))) if (onBf(G, o)) hit(G, X, o, Math.max(0, pow(m)), m);
  }, { tgt: tg(OPP), val: (G, P, c) => (L.lethalTo(c) <= P.bf.filter(isCreature).map((x) => pow(x) + 1).sort((a, b) => b - a).slice(0, 2).reduce((a, b) => a + b, 0) ? cv(c) + 0.5 : 0.1), label: 'Choose a creature an opponent controls', value: 3 })];
  d.costMod = (G, P) => (P.bf.some((c) => !c.token && c.def.mv >= 4) ? 2 : 0);
  d.role = 'removal';
  return d;
};
S['Commune with Dinosaurs'] = (d) => {
  d.spell = [fn((G, X) => lookTake(G, X.P, 5, (c) => c.def.types.includes('Land') || c.def.sub.includes('Dinosaur'), 1, 'Put a Dinosaur or land card into your hand'), { score: () => 1, value: 1 })];
  return d;
};
S['Lurking Lizards'] = (d) => { d.trig.push(T('cast', { you: true, cond: (G, s, ev) => !!ev.card && ev.card.def.mv >= 4, run: (G, X) => addCounters(G, X.src, 1) })); return d; };
S['Moon-Boy, Dino Rider'] = (d) => {
  d.spellDiscount = (G, P, card) => (card.def.sub.includes('Dinosaur') ? 1 : 0);
  d.trig.push(T('attack', { self: true, cond: (G, src, ev, Q) => Q.bf.some((c) => isCreature(c) && hasSub(c, 'Dinosaur')), run: (G, X) => pump(G, X.src, 1, 1) }));
  return d;
};
S['Sauron, Dino Devotee'] = (d) => {
  const modes = chooseOne([
    { label: 'Cure Cancer: you gain 3 life', eff: [{ k: 'gain', n: 3 }] },
    { label: 'Turn People into Dinosaurs: a saurian counter on another creature', eff: [fn((G, X, t) => { if (t && t.c && onBf(G, t.c)) addCounters(G, t.c, 1, 'saurian'); }, { tgt: tg({ other: true }),
      val: (G, P, c) => { const b = L.basePow(c) + L.baseTou(c); return c.ctrl === P.i ? (10 - b) * 0.35 - (ctrCountSafe(c, 'saurian') ? 5 : 0) : (b - 10) * 0.35; }, label: 'Put a saurian counter on another creature' })] },
  ]);
  d.etb = [modes];
  d.trig.push(T('attack', { self: true, eff: [modes] }));
  return d;
};
S['Black Tom Cassidy'] = (d) => { d.mana = ['G']; d.onManaTap = (G, P, c) => { if (hasMutant(P, c)) gain(G, P, 1); }; return d; };
S['Colossus, Steel Stalwart'] = (d) => {
  d.statics.push({ who: 'self', cond: (G, src) => G.active === src.ctrl, p: 0, t: 0, kw: ['indestructible'] });
  d.statics.push({ who: 'all', f: { side: 'you', other: true, sub: 'Mutant' }, p: 1, t: 1, kw: [] });
  return d;
};
S['Darwin, Adaptive Mutant'] = (d) => {
  d.trig.push(T('enter', { you: true, other: true, cond: (G, src, ev) => isCreature(ev.c) && (pow(ev.c) > pow(src) || tou(ev.c) > tou(src)), run: (G, X) => addCounters(G, X.src, 1) }));
  d.acts.push({ cost: { ctr: { kind: '+1/+1', n: 2 } }, label: 'Remove two +1/+1 counters: indestructible until end of turn', run: (G, X) => grantKw(G, X.src, ['indestructible']), when: ['blocks'],
    ai: (G, P, c) => { const foes = c.blocking ? [L.byId(G, c.blocking)].filter(Boolean) : c.blockedBy; return !has(c, 'indestructible') && foes.some((f) => f && (pow(f) >= tou(c) - c.dmg - 2 || has(f, 'deathtouch'))) ? { score: 2 } : null; } });
  return d;
};
S['Storm, Shaker of Skies'] = (d) => { d.etb = [{ k: 'destroyP', tgt: { f: { types: ['Artifact', 'Enchantment', 'Creature'], fn: (G, c) => isArtifact(c) || L.isEnchantment(c) || has(c, 'flying') }, min: 0 } }]; return d; };
S['Wolverine, Claws Out'] = (d) => {
  d.asUnblocked = true;
  d.trig.push(T('attack', { you: true, cond: (G, src, ev) => hasSub(ev.c, 'Mutant'), run: (G, X) => { const c = X.ev.c; if (onBf(G, c) && pow(c) > 0) pump(G, c, pow(c), 0); } }));
  return d;
};
S['X-23, Deadly Weapon'] = (d) => { d.trig.push(T('enter', { you: true, other: true, cond: (G, src, ev) => isCreature(ev.c) && hasSub(ev.c, 'Mutant'), run: (G, X) => { addCounters(G, X.ev.c, 1); addCounters(G, X.src, 1); } })); return d; };
S['Advancing the Spirit'] = (d) => { d.etb = [{ k: 'draw', n: 1 }]; d.freePowerUp = true; return d; };
S['Colossal Collision'] = (d) => { d.spell = [{ k: 'bite', ctr: 1 }]; d.role = 'removal'; return d; };
S['Shang-Chi, Martial Mentor'] = (d) => { d.ctrDouble = true; return setPU(d, '{5}{G}{G}', { run: (G, X) => addCounters(G, X.src, 3), ai: puAi(3.8) }); };
S['Accelerated Evolution'] = (d) => {
  d.aura = { f: { side: 'you' } };
  d.etb = [fn((G, X) => { const h = X.src.att != null ? byId(G, X.src.att) : null; if (h) grantKw(G, h, ['hexproof']); }, { score: () => 0.3 })];
  return d;
};
S['White Tiger, Amulet Keeper'] = (d) => {
  d.gyActs = [{ cost: { m: C('{3}{G}'), exileSelf: true }, label: 'Draw a card; you may put a land card from your hand onto the battlefield', when: ['main2', 'end'],
    run: (G, X) => {
      const P = X.P;
      drawN(G, P, 1);
      const ls = P.hand.filter((c) => c.def.types.includes('Land'));
      if (!ls.length) return;
      const pick = isHuman(G, P) ? pickSome(G, P, ls, 0, 1, 'You may put a land card from your hand onto the battlefield', () => 1, 'hand')[0] : ls[0];
      if (!pick) return;
      emit(G, 'land', `${P.name} puts ${pick.def.name} onto the battlefield.`, { who: P.i, card: pick.id });
      putOntoBattlefield(G, P, pick, {});
    }, ai: (G, P) => ({ score: 1.4 + (P.hand.some((c) => c.def.types.includes('Land')) ? 0.6 : 0) }) }];
  return d;
};
S['Return of the Mole Man'] = (d) => {
  const n = (P) => P.gy.filter((c) => permCard(c.def)).length;
  d.trig.push(T('landfall', { you: true, may: true, mayAi: (G, X) => X.P.library.length > 14, mayLabel: 'Mill two cards?', eff: [{ k: 'mill', n: 2, who: 'self' }] }));
  d.acts.push({ cost: { m: C('{5}{G}'), sacSelf: true }, sorcery: true, label: 'Create a Moloid for each permanent card in your graveyard',
    run: (G, X) => mk(G, X.P, MOLOID, n(X.P)), ai: (G, P) => (n(P) >= 3 ? { score: n(P) * 1.1 - 0.8 } : null) });
  return d;
};
S['Scout the City'] = (d) => {
  d.modes = [
    { label: 'Look Around: mill three, keep a permanent card, gain 3 life', eff: [fn((G, X) => {
      const P = X.P, milled = mill(G, P, 3), perms = milled.filter((c) => permCard(c.def));
      const pick = perms.length ? (isHuman(G, P) ? pickSome(G, P, perms, 0, 1, 'You may put a permanent card into your hand', (c) => c.def.value, 'graveyard')[0] : perms.slice().sort((a, b) => b.def.value - a.def.value)[0]) : null;
      if (pick && P.gy.includes(pick)) { P.gy.splice(P.gy.indexOf(pick), 1); P.hand.push(pick); dirty(G); emit(G, 'raise', `${P.name} puts ${pick.def.name} into their hand.`, { who: P.i, cards: [pick.id] }); }
      gain(G, P, 3);
    }, { score: () => 1.8, value: 1.8 })] },
    { label: 'Bring Down: destroy a creature with flying', eff: [{ k: 'destroyP', tgt: { f: { flying: true } } }] },
  ];
  d.spell = null;
  return d;
};
S['Voracious Brood'] = (d) => {
  d.etbCtr = (G, P) => ({ '+1/+1': creatureCards(P.gy).length });
  d.trig.push(T('gyAdded', { you: true, cond: (G, src, ev) => creatureCards(ev.cards).length > 0, run: (G, X) => addCounters(G, X.src, creatureCards(X.ev.cards).length) }));
  return d;
};
S['Beast Mode'] = (d) => twSpell(d, 1,
  { label: '+2/+2 and trample', eff: [{ k: 'pumpT', p: 2, t: 2, kw: ['trample'], tgt: { f: {} } }] },
  { label: '+2/+2, trample and a +1/+1 counter (teamwork)', eff: [{ k: 'pumpT', p: 2, t: 2, kw: ['trample'], tgt: { f: {} } }, fn((G, X) => { const c = X.last && X.last.c; if (c && onBf(G, c)) addCounters(G, c, 1); }, { score: () => 0.9 })] });
S['Lucky the Pizza Dog'] = (d) => {
  d.trig.push(T('cast', { you: true, cond: (G, s, ev) => !!ev.card && ['Cat', 'Dog', 'Hero'].some((t) => ev.card.def.sub.includes(t)), eff: [{ k: 'food', n: 1 }] }));
  d.trig.push(T('endStep', { cond: (G, src, ev, Q) => (Q.gainedTurn || 0) > 0, run: (G, X) => addCounters(G, X.src, 1) }));
  return d;
};
S['Tippy-Toe, Terrific Partner'] = (d) => {
  d.tokenFood = true;
  d.trig.push(T('endStep', { you: true, cond: (G, src, ev, Q) => (Q.gainedTurn || 0) > 0, eff: [{ k: 'draw', n: 1 }] }));
  return d;
};
S['Farseek'] = (d) => { d.spell = [{ k: 'tutor', f: { types: ['Plains', 'Island', 'Swamp', 'Mountain'] }, to: 'bfTapped', why: 'a Plains, Island, Swamp or Mountain card' }]; return d; };
S['Terramorphic Expanse'] = (d) => {
  const basic = { types: ['Land'], fn: (dd) => dd.supertypes.includes('Basic') };
  d.acts.push({ cost: { tap: true, sacSelf: true }, eff: [{ k: 'tutor', f: basic, to: 'bfTapped', why: 'a basic land' }], label: 'Search for a basic land', when: ['end', 'main1', 'main2'],
    ai: (G, P, c, when) => (P.library.some((x) => isLand(x) && x.def.supertypes.includes('Basic')) ? { score: when === 'end' || G.active !== P.i ? 1.5 : 1 } : null) });
  d.role = 'land';
  return d;
};

/* ============================================================ Two colors */
S['She-Hulk, Attorney-at-Law'] = (d) => setPU(d, '{6}{G/W}', { run: (G, X) => {
  addCounters(G, X.src, 1);
  for (const c of X.P.bf.filter((x) => isCreature(x) && x.cnt > 0)) addCounters(G, c, c.cnt);
}, ai: puAi((G, P) => 2 + P.bf.filter((x) => isCreature(x) && x.cnt > 0).reduce((t, x) => t + x.cnt, 0) * 0.8) });
S['Wakandan Tusker'] = (d) => { d.trig.push(T('tapped', { cond: (G, src, ev) => ev.cs.includes(src), run: (G, X) => { gain(G, X.P, 1); scryChoice(G, X.P, 1); } })); return d; };
S['Gert and Old Lace, Runaways'] = (d) => {
  d.etb = [fn((G, X) => {
    const P = X.P;
    if (!P.hand.length || !P.library.some((c) => isLand(c) && c.def.supertypes.includes('Basic'))) return;
    const ai = P.bf.filter(isLand).length < 6 && P.hand.some((c) => handValue(G, P, c) < 1.5);
    if (!yesNo(G, P, X.src, 'Discard a card to search your library for a basic land?', ai)) return;
    discardE(G, P, 1, 'discard');
    const got = searchLibrary(G, P, (c) => isLand(c) && c.def.supertypes.includes('Basic'), 1, 'hand', 'a basic land');
    if (got.length) emit(G, 'search', `${P.name} searches their library for ${nameList(got)}.`, { who: P.i, cards: got.map((c) => c.id) });
  }, { score: () => 0.5 })];
  return d;
};
S['The Fantastic Four'] = (d) => {
  const pick = chooseFresh([
    { label: 'Create a 0/4 Wall token with defender', eff: [mkE(WALL, 1)] },
    { label: 'Deal 3 damage to each opponent', eff: [fn((G, X) => hitOpp(G, X, 3), { score: () => 1.7 })] },
    { label: 'Put two +1/+1 counters on a creature', eff: [{ k: 'ctrs', n: 2, tgt: { f: {} } }] },
    { label: 'Draw a card', eff: [{ k: 'draw', n: 1 }] },
  ]);
  d.etb = [pick];
  d.trig.push(T('cast', { you: true, cond: (G, s, ev) => { const x = ev.card && ev.card.def; return !!x && (x.mv === 4 || (x.types.includes('Creature') && (x.power === 4 || x.toughness === 4))); }, eff: [pick] }));
  return d;
};
S['Atlas, Sizable Stooge'] = (d) => {
  const run = (G, X) => gain(G, X.P, X.P.bf.filter((c) => isCreature(c) && pow(c) >= 4).length);
  d.trig.push(T('attack', { self: true, run }), T('blocks', { self: true, run }));
  return d;
};
S['Bushmaster, Coiled Henchman'] = (d) => { d.statics.push({ who: 'all', f: { side: 'you', other: true, fn: (G, c) => c.cnt > 0 }, p: 0, t: 0, kw: ['deathtouch'] }); return d; };
S['Rhino, Terrible Trampler'] = (d) => {
  d.etb = [{ k: 'destroyP', tgt: { f: { types: ['Artifact', 'Land'] } } }, fn((G, X, t) => {
    const cs = tcs(t).filter((c) => onBf(G, c));
    if (!cs.length) return;
    let shares = cs.length === 1 ? [3] : cs.length === 2 ? [2, 1] : [1, 1, 1];
    if (cs.length === 2 && isHuman(G, X.P) && chooseMode(G, X.P, X.src, 'Which creature gets two of the counters?', cs.map((c) => c.def.name), 0) === 1) shares = [1, 2];
    cs.forEach((c, k) => { addCounters(G, c, shares[k]); grantKw(G, c, ['trample']); });
  }, { tgt: { f: { other: true }, n: 3, min: 0 }, val: (G, P, c) => (c.ctrl === P.i ? 1 + pow(c) * 0.05 : -1), label: 'Up to three other creatures share three +1/+1 counters' })];
  return d;
};
S["Rhino's Rampage"] = (d) => {
  d.spell = [{ k: 'fight', pump: 1 }, { k: 'reflex', if: (G, X) => X.excess > 0, label: 'Destroy up to one noncreature artifact with mana value 3 or less',
    eff: [{ k: 'destroyP', tgt: { f: { types: ['Artifact'], fn: (G, c) => !isCreature(c) && c.def.mv <= 3 }, min: 0 } }] }];
  d.role = 'removal';
  return d;
};

S['Ms. Marvel, Elastic Ally'] = (d) => {
  d.etb = [{ k: 'pumpT', p: 2, t: 0, tgt: { f: {} } }];
  d.trig.push(T('hitPlayer', { you: true, once: true, cond: (G, src, ev) => pow(ev.c) > L.basePow(ev.c), eff: [{ k: 'draw', n: 1 }] }));
  return d;
};
S['Stature, Young Avenger'] = (d) => {
  d.trig.push(castNC({ run: (G, X) => { const c = X.src; if (!onBf(G, c)) return; c.base = { p: 4, t: 4, eot: true }; dirty(G); say(G, X.P, `${c.def.name} has base power and toughness 4/4 until end of turn.`, [c.id]); } }));
  return d;
};
S['Marvel Boy, Noh-Varr'] = (d) => {
  d.trig.push(T('enter', { you: true, other: true, cond: (G, src, ev) => isCreature(ev.c), run: (G, X) => addCounters(G, X.src, 1) }));
  d.trig.push(T('powerUp', { you: true, run: (G, X) => addCounters(G, X.src, 1) }));
  return d;
};
S['Tiger Shark, Abyssal Hunter'] = (d) => {
  d.etb = [fn((G, X) => connive(G, X.P, X.src, 1), { score: () => 1 })];
  d.trig.push(T('attack', { self: true, run: (G, X) => connive(G, X.P, X.src, 1) }));
  d.acts.push({ cost: { m: C('{4}{U/B}') }, label: "Tiger Shark can't be blocked this turn", when: ['main1'],
    run: (G, X) => { X.src.tf.unblockable = true; dirty(G); say(G, X.P, `${X.src.def.name} can't be blocked this turn.`, [X.src.id]); },
    ai: (G, P, c) => (!c.tf.unblockable && !c.tapped && (!c.sick || has(c, 'haste')) && pow(c) >= 3 && other(G, P).bf.some((x) => isCreature(x) && !x.tapped) ? { score: 0.4 + pow(c) * 0.3 } : null) });
  return d;
};

S['Iron Lad, Young Avenger'] = (d) => { d.spellDiscount = (G, P, card) => (card.def.types.includes('Creature') ? 0 : 1); return d; };
S['Mob Lookout'] = (d) => { d.etb = [fn((G, X, t) => { if (t && t.c && onBf(G, t.c)) connive(G, X.P, t.c, 1); }, { tgt: tg(YOU), val: () => 0.9, label: 'A creature you control connives' })]; return d; };
S['War Machine, James Rhodes'] = (d) => { d.trig.push(T('attack', { self: true, eff: [{ k: 'tapP', tgt: tg({}, { min: 0 }) }] })); return d; };

S['Astonishing Spider-Man'] = (d) => {
  d.trig.push(T('attack', { self: true, run: (G, X) => {
    const P = X.P;
    if (!P.hand.length || !yesNo(G, P, X.src, 'Discard your hand to draw a card for each card you discarded this turn?', P.hand.length <= 2)) return;
    discardHand(G, P);
    drawN(G, P, L.discardsThisTurn(G, P));
  } }));
  return d;
};
S['Iceman and Firestar'] = (d) => {
  d.trig.push(T('cast', { you: true, cond: (G, s, ev) => !!ev.card && ev.card.def.colors.includes('U'), eff: [{ k: 'tapP', tgt: tg(OPP, { min: 0 }) }] }));
  d.trig.push(T('cast', { you: true, cond: (G, s, ev) => !!ev.card && ev.card.def.colors.includes('R'), run: (G, X) => {
    const P = X.P;
    if (!P.hand.length || !yesNo(G, P, X.src, 'Discard a card to draw a card?', P.hand.some((c) => handValue(G, P, c) < 0.8))) return;
    discardE(G, P, 1, 'loot'); drawN(G, P, 1);
  } }));
  return d;
};

return S;
});
