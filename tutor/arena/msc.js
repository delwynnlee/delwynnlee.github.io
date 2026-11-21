/* Marvel Commander decks (Avengers Assemble, Doom Prevails, The Fantastic Four, Wakanda Forever): rules for the cards the
   engine's reader can't handle on its own. Built from cmdr.js's kit and msh.js's Marvel pieces, so this file loads last.
   New here: Vibranium tokens, suspend and time counters, cascade, discover, miracle {0} (Molecule Man), the villainous
   choice, melee, and "the legend rule doesn't apply". Four-player text reads as a duel: "each opponent" and "for each
   opponent" mean the one opponent, and what only matters with a second opponent does nothing. */
(function (root, factory) {
  const A = typeof module === 'object' && module.exports ? require('./engine.js') : root.Arena;
  if (typeof module === 'object' && module.exports) { require('./msh.js'); require('./core.js'); require('./cmdr.js'); require('./fic.js'); }
  const S = factory(A);
  A.registerScripts(S);
  if (typeof module === 'object' && module.exports) module.exports = S;
})(typeof self !== 'undefined' ? self : this, function (A) {
'use strict';
const L = A.lib;
const { isCreature, isArtifact, isLand, isEnchantment, isLegendary, pow, tou, has, hasSub, attach, dirty, onBf, byId, cv, pv, other, allCreatures, allPerms,
  addCounters, removeCounters, ctrCount, chooseMode, isHuman, yesNo, bounceCard, destroyPermanent, exilePermanent, putOntoBattlefield, emit, mill, searchLibrary,
  nameList, gainControl, sacrifice, canPay, pay, pickCards, isIS, scryChoice, surveil, equipmentOn, attachedTo, becomeMonarch, monarchVal, isCommander, goad,
  copySpell, dealDamage, connive, castNow, phaseOut, combatDoom, ANY } = L;
const { C, T, fn, YOU, OPP, VILLAIN, ROBOT_VILLAIN, SOLDIER, MERFOLK, drawN, edictOf, gain, grantKw, hitOpp, loseLife, mk, mkE, pickOne, pickSome, pump, say, ctx0,
  untap, discardE, chooseOne, copyToken, becomeCopy, heroes, villains, villainEnters, planOn, plan, untilMyNextEnd, tokVal } = L.mshKit;
const { tok } = L.coreKit;
const { count, crowdLand, tangoLand, monarchE, noMonarch, chooseTypeAs, defOfType, cmdEnters, reanimate, destroyEach, sweepVal, basicLand, fetchBasic, rampVal,
  atMyUpkeep } = L.cmdKit;
const { rebound, hasCtrs, modified, gyToHand } = L.ficKit;
const S = {};

/* ============================================================ The kit */
// Vibranium: an indestructible artifact whose {C} can't be spent on a nonartifact spell (abilities are fine)
const VIBRANIUM = { id: 'msc-vibranium', name: 'Vibranium', art: true, sub: ['Vibranium'], colors: [], kw: ['indestructible'], value: 1.1,
  text: "Indestructible\n{T}: Add {C}. This mana can't be spent to cast a nonartifact spell.",
  manaAbs: [{ colors: ['C'], only: (p) => !p.def || p.def.types.includes('Artifact') }] };
const vibranium = (G, P, n = 1) => mk(G, P, VIBRANIUM, n, { tapped: true });
const vibE = (n = 1) => fn((G, X) => vibranium(G, X.P, n), { score: () => n * 1.1, value: n * 1.1 });
const WALL_R = tok('Wall', 0, 3, [], ['Wall'], ['defender', 'reach'], { id: 'msc-wall-0-3' });
const APE = tok('Ape Villain', 3, 3, ['R'], ['Ape', 'Villain'], ['haste'], { id: 'msc-ape-villain-3-3' });
const RHINO = tok('Rhino', 4, 4, ['G'], ['Rhino'], ['trample'], { id: 'msc-rhino-4-4' });
const BIRD_W = tok('Bird', 1, 1, ['W'], ['Bird'], ['flying'], { id: 'msc-bird-w-1-1' });
const CONSTRUCT = tok('Construct', 4, 4, [], ['Construct'], ['flying', 'haste'], { id: 'msc-construct-4-4', artifact: true });
const ROGUE = tok('Rogue', 2, 2, ['B'], ['Rogue'], [], { id: 'msc-rogue-2-2' });
const ANGEL = tok('Angel', 4, 4, ['W'], ['Angel'], ['flying', 'vigilance'], { id: 'msc-angel-4-4' });
// Changeling: every creature type
const SHAPESHIFTER = tok('Shapeshifter', 3, 2, [], ['Shapeshifter'], [], { id: 'msc-shapeshifter-3-2', text: 'Changeling', statics: [{ who: 'self', p: 0, t: 0, kw: [], flags: { allTypes: true } }] });
const treasure = (G, P, n = 1) => mk(G, P, L.TREASURE, n);
const isCreCard = (c) => c.def.types.includes('Creature');
const nArts = (P) => P.bf.filter(isArtifact).length;
const hasCmdr = (P) => P.bf.some(isCommander);
const isHero = (c) => hasSub(c, 'Hero');
const heroDef = (d) => d.sub.includes('Hero');
const villainDef = (d) => d.sub.includes('Villain');
const nonCreDef = (d) => !d.types.includes('Creature');
const creTypes = (c) => (isCreature(c) ? L.subOf(c) : c.def.sub);
// "If you've cast a noncreature spell this turn" (the Fantastic Four's beginning-of-combat abilities)
const castNC = (P) => (P.castDefs || []).some(nonCreDef);
const ncCombat = (o) => T('combatStart', Object.assign({ you: true, cond: (G, src, ev, Q) => castNC(Q) }, o));
const turnTrig = (G, P, src, t, turn = G.turn) => { (P.turnTrigs = (P.turnTrigs || []).filter((x) => x.turn >= G.turn)).push({ turn, src, t }); };
const attackingNow = (G, P) => (G.combat && G.active === P.i ? G.combat.attackers.filter((c) => onBf(G, c) && c.attacking) : []);
const beingAttacked = (G, P) => !!G.combat && G.active !== P.i && G.combat.attackers.some((c) => onBf(G, c) && c.attacking);
// "You may pay {cost}": a human is asked; the AI pays when it's worth `worth` and it can
function mayPay(G, P, src, cost, label, worth) {
  const m = C(cost);
  if (!canPay(P, m, { ability: true, src })) return false;
  if (isHuman(G, P) ? !yesNo(G, P, src, label, true) : !worth) return false;
  return pay(P, m, { ability: true, src });
}
// Exile cards from the top until one fits; cast it without paying its mana cost (or, for discover, put it into your hand).
// Everything else goes to the bottom in a random order (cascade: the card you didn't cast too).
function revealCast(G, P, pred, label, toHand) {
  const shown = [];
  let hit = null;
  while (P.library.length) { const c = P.library.pop(); shown.push(c); if (!isLand(c) && pred(c.def)) { hit = c; break; } }
  if (!shown.length) return null;
  P.exile.push(...shown);
  dirty(G);
  emit(G, 'exile', `${P.name} exiles ${nameList(shown)} from the top of their library (${label}).`, { who: P.i, cards: shown.map((c) => c.id) });
  let cast = false;
  if (hit) {
    P.xcast.push({ card: hit, until: G.turn, free: true });
    cast = castNow(G, P, hit, { free: true });
    P.xcast = P.xcast.filter((x) => x.card !== hit);
    if (!cast && toHand && P.exile.includes(hit)) { P.exile.splice(P.exile.indexOf(hit), 1); P.hand.push(hit); emit(G, 'raise', `${P.name} puts ${hit.def.name} into their hand.`, { who: P.i, cards: [hit.id] }); }
  }
  const rest = shown.filter((c) => P.exile.includes(c));
  for (const c of rest) P.exile.splice(P.exile.indexOf(c), 1);
  G.rng.shuffle(rest);
  P.library.unshift(...rest);
  dirty(G);
  return cast ? hit : null;
}
const discover = (G, P, n) => revealCast(G, P, (d) => d.mv <= n, `discover ${n}`, true);
// Cascade: as the spell is cast, a cheaper card from the top is cast free
const cascade = (d) => { const before = d.onCast; d.onCast = (G, P, item) => { if (before) before(G, P, item); revealCast(G, P, (x) => x.mv < item.card.def.mv, 'cascade'); }; return d; };
// Suspend: the card waits in exile with time counters; at its owner's upkeep one comes off, and when the last one does
// it may be cast without paying its mana cost (a creature cast this way has haste). One hidden clock per card.
const SUSPEND = { id: 'msc-suspend', name: 'Suspend', types: [], sub: [], supertypes: [], kw: [], colors: [], etb: [], dies: [], acts: [], statics: [], mv: 0, value: 0,
  trig: [T('upkeep', { you: true, run: (G, X) => {
    const em = X.src, P = X.P, c = em.mem.card;
    const drop = () => { const k = (P.emblems || []).indexOf(em); if (k >= 0) P.emblems.splice(k, 1); };
    if (!c || !P.exile.includes(c)) { drop(); return; }
    em.mem.time--;
    if (em.mem.time > 0) { say(G, P, `${c.def.name} loses a time counter (${em.mem.time} left).`, [c.id]); return; }
    drop();
    say(G, P, `The last time counter comes off ${c.def.name}.`, [c.id]);
    if (isCreCard(c)) c.finHaste = G.turn;
    P.xcast.push({ card: c, until: G.turn, free: true });
    if (!castNow(G, P, c, { free: true })) { P.xcast = P.xcast.filter((x) => x.card !== c); c.finHaste = 0; }
  } })] };
function suspend(G, P, c, n) {
  if (!c) return;
  for (const Q of G.players) for (const z of [Q.gy, Q.library, Q.hand]) { const k = z.indexOf(c); if (k >= 0) z.splice(k, 1); }
  if (!P.exile.includes(c)) P.exile.push(c);
  (P.emblems = P.emblems || []).push({ id: -(G.nextId++), def: SUSPEND, owner: P.i, ctrl: P.i, mem: { card: c, time: n }, tkw: [], cnt: 0, tp: 0, tt: 0, ctr: {}, tf: {}, emblem: true, boon: true });
  dirty(G);
  emit(G, 'exile', `${c.def.name} is exiled with ${n} time counters on it (suspend).`, { who: P.i, cards: [c.id] });
}
const suspended = (P) => (P.emblems || []).filter((e) => e.def === SUSPEND);
// A villainous choice: the player takes the lesser evil (the AI weighs what each costs it)
function villainous(G, Q, src, opts) {
  const ok = opts.filter((o) => !o.can || o.can(G, Q));
  const pick = !ok.length ? null : isHuman(G, Q) && ok.length > 1 ? ok[chooseMode(G, Q, src, `${src.def.name}: a villainous choice`, ok.map((o) => o.label), 0)]
    : ok.slice().sort((a, b) => a.cost(G, Q) - b.cost(G, Q))[0];
  if (!pick) return;
  say(G, Q, `${Q.name} faces a villainous choice: ${pick.label.replace(/^./, (x) => x.toLowerCase())}.`);
  pick.run(G, Q);
}
// Enter as a copy of a creature you control (Chameleon, Spark Double)
function cloneMine(extra) {
  return (G, P, card) => {
    const cs = P.bf.filter((c) => isCreature(c) && c !== card);
    if (!cs.length) return;
    let pick;
    if (isHuman(G, P)) { if (!yesNo(G, P, card, `Have ${card.def.name} enter as a copy of a creature you control?`, true)) return; pick = pickOne(G, P, cs, 'Choose a creature to copy', (c) => cv(c), 'choose', 'battlefield'); }
    else pick = cs.slice().sort((a, b) => b.def.value - a.def.value || cv(b) - cv(a))[0];
    if (!pick) return;
    const base = pick.def;
    const cdef = Object.assign({}, base, { id: `${base.id}-clone-${card.id}-${G.nextId++}`, token: !!card.token, front: null, back: null, adv: null, advOf: null, meldInto: null, isBack: false, mdfc: false }, extra ? extra(base, card) : null);
    G.defs[cdef.id] = cdef;
    card.faceBase = card.def;
    card.def = cdef;
    emit(G, 'copy', `${card.faceBase.name} enters as a copy of ${base.name}.`, { who: P.i, cards: [card.id, pick.id] });
  };
}
const kwOnce = (G, c, kws) => grantKw(G, c, kws.filter((k) => !has(c, k)));
// Melee in a duel: +1/+1 when it attacks
const meleeOf = (G, c) => { if (onBf(G, c)) pump(G, c, 1, 1); };

/* ============================================================ Lands */
S['Bountiful Promenade'] = crowdLand('G', 'W');
S['Luxury Suite'] = crowdLand('B', 'R');
S['Spectator Seating'] = crowdLand('R', 'W');
S['Radiant Summit'] = tangoLand('R', 'W');
S['Scorched Geyser'] = tangoLand('U', 'R');
S['Sodden Verdure'] = tangoLand('G', 'U');
S['Fabled Passage'] = (d) => {
  d.acts.push({ cost: { tap: true, sacSelf: true }, label: 'Search for a basic land (untapped once you control four lands)', when: ['end', 'main1', 'main2'],
    run: (G, X) => { const got = fetchBasic(G, X.P, true); if (got[0] && X.P.bf.filter(isLand).length >= 4) untap(G, got[0], X.P); },
    ai: (G, P, c, when) => (P.library.some(basicLand) ? { score: when === 'end' || G.active !== P.i ? 1.5 : 1 } : null) });
  d.role = 'land';
  return d;
};
S['Plaza of Heroes'] = (d) => {
  d.mana = null;
  const legendColors = (G, c, P) => { if (!G) return []; const s = new Set(); for (const x of P.bf) if (x !== c && isLegendary(x)) for (const col of x.def.colors) s.add(col); return ANY.filter((col) => s.has(col)); };
  d.manaAbs = [{ colors: ['C'] }, { colors: ANY, only: (p) => !!p.def && p.def.supertypes.includes('Legendary') }, { colorsFn: legendColors }];
  d.acts.push({ cost: { m: C('{3}'), tap: true, exileSelfBf: true }, label: 'Exile Plaza of Heroes: a legendary creature gains hexproof and indestructible until end of turn', when: ['blocks'],
    eff: [{ k: 'grant', kw: ['hexproof', 'indestructible'], tgt: { f: { legendary: true } } }],
    ai: (G, P, c, when) => {
      const fc = combatDoom(G);
      const save = fc && P.bf.filter((x) => isCreature(x) && isLegendary(x) && fc.dead.has(x) && !has(x, 'indestructible')).sort((a, b) => cv(b) - cv(a))[0];
      return save ? { score: 1.5 + cv(save) * 0.5, targets: [{ c: save }] } : null;
    } });
  d.role = 'land';
  return d;
};
S['The Great Mound'] = (d) => {
  d.mana = ['C'];
  d.acts.push({ cost: { m: C('{3}'), tap: true }, label: 'Create a tapped Vibranium token', when: ['end', 'main2'], run: (G, X) => vibranium(G, X.P, 1), ai: () => ({ score: 1.1 }) });
  d.acts.push({ cost: { m: C('{6}'), tap: true }, label: 'Draw a card', when: ['end', 'main2'], eff: [{ k: 'draw', n: 1 }], ai: () => ({ score: 1.3 }) });
  d.role = 'land';
  return d;
};
S['Unclaimed Territory'] = (d) => {
  chooseTypeAs(d);
  d.mana = null;
  d.manaAbs = [{ colors: ['C'] }, { colors: ANY, only: (p, c) => !!p.def && p.def.types.includes('Creature') && !!c && defOfType(p.def, c) }];
  d.role = 'land';
  return d;
};

/* ============================================================ Artifacts */
S['Fellwar Stone'] = (d) => {
  d.mana = null;
  d.manaAbs = [{ colorsFn: (G, c, P) => { if (!G) return []; const s = new Set(); for (const x of other(G, P).bf) if (isLand(x)) for (const col of (x.def.mana || []).concat(...(x.def.manaAbs || []).map((ab) => ab.colors || []))) if (ANY.includes(col)) s.add(col); return ANY.filter((col) => s.has(col)); } }];
  d.role = 'ramp';
  return d;
};
S['Gilded Lotus'] = (d) => { d.mana = null; d.manaAbs = [{ colors: ANY, amount: 3, one: true }]; d.role = 'ramp'; return d; };
S['Thran Dynamo'] = (d) => { d.mana = null; d.manaAbs = [{ colors: ['C'], amount: 3 }]; d.role = 'ramp'; return d; };
S['H.E.R.B.I.E., Lovable Robot'] = (d) => {
  d.mana = null;
  d.manaAbs = [{ colors: ['C'] }, { colors: ANY, conv: 1 }];
  d.trig.push(ncCombat({ run: (G, X) => surveil(G, X.P, 1) }));
  return d;
};
S['Hammer of Nazahn'] = (d) => {
  d.trig.push(T('enter', { you: true, cond: (G, src, ev) => hasSub(ev.c, 'Equipment') && ev.c.att == null, eff: [fn((G, X, t) => { const c = t && t.c, eq = X.ev.c; if (c && onBf(G, c) && onBf(G, eq)) attach(G, eq, c); },
    { tgt: { f: YOU, min: 0 }, val: (G, P, c) => 0.5 + cv(c) * 0.2, label: 'You may attach that Equipment to a creature you control' })] }));
  return d;
};
S['Heart-Shaped Herb'] = (d) => {
  d.armorOpp = 1;
  const want = (G, P) => {
    const cs = P.bf.filter((x) => isCreature(x) && !x.token);
    const fc = combatDoom(G);
    return (fc && cs.find((x) => fc.dead.has(x))) || cs.slice().sort((a, b) => (b.def.etb.length - a.def.etb.length) || (a.cnt - b.cnt) || cv(b) - cv(a))[0] || null;
  };
  d.acts.push({ cost: { m: C('{2}'), tap: true, sacSelf: true }, label: 'Sacrifice a creature: it returns with three +1/+1 counters, and you become the monarch', when: ['main1', 'blocks'],
    run: (G, X) => {
      const P = X.P, cs = P.bf.filter(isCreature);
      let c = null;
      if (cs.length) c = isHuman(G, P) ? (yesNo(G, P, X.src, 'Sacrifice a creature? It returns with three +1/+1 counters.', true) ? pickOne(G, P, cs, 'Choose a creature to sacrifice', (x) => cv(x), 'sacrifice', 'battlefield') : null) : want(G, P);
      if (!c) return;
      say(G, P, `${P.name} sacrifices ${c.def.name}.`, [c.id]);
      sacrifice(G, P, c, true);
      const O = G.players[c.owner];
      if (!c.token && O.gy.includes(c)) { emit(G, 'raise', `${c.def.name} returns to the battlefield with three +1/+1 counters.`, { who: P.i, cards: [c.id] }); putOntoBattlefield(G, O, c, { ctr: { '+1/+1': 3 } }); }
      becomeMonarch(G, P);
    },
    ai: (G, P, c, when) => {
      const fc = when === 'blocks' ? combatDoom(G) : null;
      const doomed = fc && P.bf.find((x) => isCreature(x) && !x.token && fc.dead.has(x));
      if (doomed) return { score: 2.5 + cv(doomed) * 0.5 };
      return when === 'main1' && G.monarch !== P.i && want(G, P) ? { score: 0.9 + monarchVal(G, P) * 0.4 } : null;
    } });
  return d;
};
S['Helm of the Host'] = (d) => {
  d.trig.push(T('combatStart', { you: true, cond: (G, src) => src.att != null && !!byId(G, src.att), run: (G, X) => {
    const host = byId(G, X.src.att);
    if (!host || !isCreature(host)) return;
    const t = copyToken(G, X.P, host, { nonLegendary: true }, { haste: true });
    emit(G, 'token', `${X.P.name} creates a token copy of ${host.def.name} (it isn't legendary and has haste).`, { who: X.P.i, cards: [t.id] });
  } }));
  d.equipAi = (G, P, t) => 1 + cv(t) * 0.5;
  return d;
};
S['Hulkbuster Armor'] = (d) => {
  d.statics.push({ who: 'equipped', p: 0, t: 0, kw: ['flying'], base: [9, 9] });
  d.equipAi = (G, P, t) => Math.max(0, 9 - pow(t)) * 0.9 + Math.max(0, 9 - tou(t)) * 0.4 + (has(t, 'flying') ? 0 : 1);
  return d;
};
S['Jocasta, Automaton Avenger'] = (d) => {
  d.trig.push(T('hitPlayer', { you: true, cond: (G, src, ev) => isCommander(ev.c), run: (G, X) => addCounters(G, X.src, 1) }));
  d.gyTrig = [T('attacks', { you: true, cond: (G, src, ev, Q) => ev.cs.some(isCommander) && Q.gy.includes(src), may: true, mayLabel: 'Return Jocasta to the battlefield tapped and attacking?', run: (G, X) => {
    if (!X.P.gy.includes(X.src)) return;
    emit(G, 'raise', `${X.src.def.name} returns, tapped and attacking.`, { who: X.P.i, cards: [X.src.id] });
    putOntoBattlefield(G, X.P, X.src, { tapped: true, attacking: true });
  } })];
  return d;
};
S['Kimoyo Beads'] = (d) => {
  const BEADS = [
    { label: 'AV Bead: draw a card', run: (G, X) => drawN(G, X.P, 1) },
    { label: 'Communication Bead: create two 1/1 white Soldier tokens', run: (G, X) => mk(G, X.P, SOLDIER, 2) },
    { label: 'Prime Bead: gain 3 life, then exile Kimoyo Beads and return it', run: (G, X) => { gain(G, X.P, 3); if (onBf(G, X.src)) L.flicker(G, X.P, X.src); } },
  ];
  d.trig.push(T('endStep', { you: true, cond: (G, src, ev) => ev.nth === 1 && (src.mem.beads || []).length < 3, run: (G, X) => {
    const used = X.src.mem.beads || [];
    const ok = [0, 1, 2].filter((k) => !used.includes(k));
    if (!ok.length) return;
    const k = isHuman(G, X.P) && ok.length > 1 ? ok[chooseMode(G, X.P, X.src, 'Kimoyo Beads: choose one that hasn\'t been chosen', ok.map((j) => BEADS[j].label), 0)] : ok[0];
    X.src.mem.beads = used.concat(k);
    say(G, X.P, `Kimoyo Beads: ${BEADS[k].label}.`, [X.src.id]);
    BEADS[k].run(G, X);
  } }));
  d.role = 'value';
  return d;
};
S['Metallic Mimic'] = (d) => {
  chooseTypeAs(d);
  d.subFn = (G, c) => (c.mem.ctype && !c.def.sub.includes(c.mem.ctype) ? c.def.sub.concat(c.mem.ctype) : null);
  d.enterBonus = (G, src, card) => (card !== src && defOfType(card.def, src) ? 1 : 0);
  return d;
};
S['Metalwork Colossus'] = (d) => {
  d.costMod = (G, P) => P.bf.filter((x) => isArtifact(x) && !isCreature(x)).reduce((s, x) => s + x.def.mv, 0);
  d.gyActs = [{ cost: { sac: { f: { types: ['Artifact'] }, n: 2, label: 'Sacrifice two artifacts', prefer: (G, c) => (c.token ? 2 : 0) - c.def.mv } }, label: 'Return Metalwork Colossus to your hand', when: ['main2', 'end'],
    run: (G, X) => gyToHand(G, X.P, X.src),
    ai: (G, P) => (P.bf.filter((x) => isArtifact(x) && !isCreature(x) && x.token && !hasSub(x, 'Vibranium')).length >= 2 ? { score: 1.5 } : null) }];
  return d;
};
S["Mind's Eye"] = (d) => {
  d.trig.push(T('draw', { opp: true, run: (G, X) => { if (mayPay(G, X.P, X.src, '{1}', "Pay {1} to draw a card (Mind's Eye)?", L.manaCount(X.P) >= 1)) drawN(G, X.P, 1); } }));
  d.role = 'draw';
  return d;
};
S['Mirage Mirror'] = (d) => {
  d.acts.push({ cost: { m: C('{2}') }, label: 'Become a copy of an artifact, creature, enchantment or land until end of turn', when: ['main1'],
    eff: [fn((G, X, t) => { const c = t && t.c; if (c && onBf(G, c) && onBf(G, X.src)) becomeCopy(G, X.src, c.def, null, { untilEnd: true }); },
      { tgt: { f: { types: ['Artifact', 'Creature', 'Enchantment', 'Land'] }, other: true }, val: (G, P, c) => (isCreature(c) ? (c.def.power || 0) + (has(c, 'haste') ? 1 : -2) : -1), label: 'Choose what to copy' })],
    noAi: true });
  return d;
};
S["N'Yami-Class Mother Ship"] = (d) => {
  d.trig.push(T('hitPlayer', { self: true, run: (G, X) => {
    const P = X.P, top = P.library[P.library.length - 1];
    if (!top) return;
    const perm = !isIS(top.def) && !isLand(top);
    if (perm && (isHuman(G, P) ? yesNo(G, P, X.src, `Put ${top.def.name} onto the battlefield?`, true) : true)) { emit(G, 'enter', `${P.name} puts ${top.def.name} from the top of their library onto the battlefield.`, { who: P.i, cards: [top.id] }); putOntoBattlefield(G, P, top); }
    else { P.library.pop(); P.hand.push(top); dirty(G); emit(G, 'draw', `${P.name} puts the top card of their library into their hand.`, { who: P.i }); }
  } }));
  return d;
};
S['Negative Zone Portal'] = (d) => {
  d.acts.push({ cost: { m: C('{2}'), tap: true }, label: "Exile a card from an opponent's graveyard (a creature card draws you a card)", when: ['end', 'main2'],
    eff: [fn((G, X, t) => {
      const c = t && t.c; const Q = c && G.players.find((q) => q.gy.includes(c)); if (!Q) return;
      Q.gy.splice(Q.gy.indexOf(c), 1); Q.exile.push(c); (X.src.mem.zone = X.src.mem.zone || []).push(c); dirty(G);
      emit(G, 'exile', `${X.P.name} exiles ${c.def.name} from ${Q.name}'s graveyard.`, { who: X.P.i, cards: [c.id] });
      if (isCreCard(c)) drawN(G, X.P, 1);
    }, { tgt: { what: 'gy', theirs: true }, val: (G, P, c) => (isCreCard(c) ? 1 + c.def.value * 0.2 : 0.2), label: "Choose a card in an opponent's graveyard" })],
    ai: (G, P, c) => (other(G, P).gy.some(isCreCard) ? { score: 1.2 } : null) });
  d.trig.push(T('upkeep', { you: true, cond: (G, src) => (src.mem.zone || []).filter((c) => isCreCard(c) && G.players[c.owner].exile.includes(c)).length >= 4, run: (G, X) => {
    if (G.rng.int(2) === 0) { say(G, X.P, 'Negative Zone Portal: the coin flip is won.', [X.src.id]); return; }
    const held = (X.src.mem.zone || []).filter((c) => G.players[c.owner].exile.includes(c));
    emit(G, 'sac', `${X.P.name} loses the flip and sacrifices Negative Zone Portal.`, { who: X.P.i, cards: [X.src.id] });
    sacrifice(G, X.P, X.src, true);
    const c = held[G.rng.int(held.length)];
    if (c) { const O = G.players[c.owner]; O.exile.splice(O.exile.indexOf(c), 1); O.hand.push(c); dirty(G); emit(G, 'raise', `${c.def.name} returns to ${O.name}'s hand.`, { who: O.i, cards: [c.id] }); }
  } }));
  d.role = 'value';
  return d;
};
S['Panther Habit'] = (d) => {
  d.statics.push({ who: 'equipped', p: 0, t: 0, kw: [], flags: { dmgToCtr: true } });
  d.equipAi = (G, P, t) => 1.2 + (t.attacking || t.blocking ? 1 : 0);
  return d;
};
S['Patchwork Banner'] = (d) => {
  chooseTypeAs(d);
  d.statics.push({ who: 'all', f: { side: 'you', fn: (G, c, P, src) => !!src && !!src.mem.ctype && hasSub(c, src.mem.ctype) }, p: 1, t: 1, kw: [] });
  d.mana = null;
  d.manaAbs = [{ colors: ANY }];
  d.role = 'ramp';
  return d;
};
S["Progenitor's Icon"] = (d) => {
  chooseTypeAs(d);
  d.mana = null;
  d.manaAbs = [{ colors: ANY }];
  d.acts.push({ cost: { tap: true }, label: 'The next spell of the chosen type you cast this turn can be cast as though it had flash', noAi: true,
    run: (G, X) => { X.src.mem.flashTurn = G.turn; say(G, X.P, `${X.P.name}'s next ${X.src.mem.ctype || 'chosen-type'} spell this turn can be cast as though it had flash.`, [X.src.id]); } });
  d.flashFor = (def, G, P, c) => c.mem.flashTurn === G.turn && !!c.mem.ctype && def.sub.includes(c.mem.ctype);
  d.trig.push(T('cast', { you: true, cond: (G, src, ev) => src.mem.flashTurn === G.turn && !!ev.card && ev.card.def.sub.includes(src.mem.ctype), run: (G, X) => { X.src.mem.flashTurn = 0; } }));
  d.role = 'ramp';
  return d;
};
S['Scourglass'] = (d) => {
  // "{T}, Sacrifice: ... Activate only during your upkeep": offered as your upkeep begins
  d.trig.push(T('upkeep', { you: true, cond: (G, src) => !src.tapped, may: true, mayLabel: 'Sacrifice Scourglass to destroy all permanents except artifacts and lands?',
    mayAi: (G, X) => sweepVal(G, X.P, (c) => !isArtifact(c) && !isLand(c)) >= 6, run: (G, X) => {
    if (!onBf(G, X.src)) return;
    emit(G, 'sac', `${X.P.name} sacrifices Scourglass.`, { who: X.P.i, cards: [X.src.id] });
    sacrifice(G, X.P, X.src, true);
    destroyEach(G, X.P, allPerms(G).filter((c) => !isArtifact(c) && !isLand(c)), 'to Scourglass');
  } }));
  d.role = 'removal';
  return d;
};
S["Shuri's Fabricator"] = (d) => {
  d.etb = [vibE(2)];
  d.acts.push({ cost: { m: C('{6}'), tap: true }, sorcery: true, label: 'Return an artifact card from your graveyard to the battlefield with a finality counter', when: ['main1', 'main2'],
    eff: [fn((G, X, t) => { const c = t && t.c; if (c && X.P.gy.includes(c)) { emit(G, 'raise', `${c.def.name} returns to the battlefield with a finality counter.`, { who: X.P.i, cards: [c.id] }); putOntoBattlefield(G, X.P, c, { ctr: { finality: 1 } }); } },
      { tgt: { what: 'gy', mine: true, f: { types: ['Artifact'] } }, val: (G, P, c) => c.def.value, label: 'Choose an artifact card in your graveyard' })],
    ai: (G, P) => (P.gy.some((c) => c.def.types.includes('Artifact') && c.def.value >= 2.5) ? { score: 1.6 } : null) });
  d.role = 'value';
  return d;
};
S['Galactus, Devourer of Worlds'] = (d) => {
  d.etb = [{ k: 'exileP', tgt: { f: { types: ['any'], side: 'opp' } } }];
  d.statics.push({ who: 'self', cond: (G, src, P) => !P.bf.some((x) => x.def.name === "Silver Surfer, Galactus's Herald"), p: 0, t: 0, kw: [], flags: { mustAttack: true } });
  return d;
};
S["Silver Surfer, Galactus's Herald"] = (d) => {
  d.etb = [fn((G, X) => {
    const P = X.P;
    if (!P.library.some((c) => c.def.name === 'Galactus, Devourer of Worlds')) return;
    if (isHuman(G, P) && !yesNo(G, P, X.src, 'Search your library for Galactus, Devourer of Worlds?', true)) return;
    const got = searchLibrary(G, P, (c) => c.def.name === 'Galactus, Devourer of Worlds', 1, 'hand', 'Galactus, Devourer of Worlds');
    if (got.length) emit(G, 'search', `${P.name} reveals Galactus, Devourer of Worlds and puts it into their hand.`, { who: P.i, cards: got.map((c) => c.id) });
  }, { score: (G, P) => (P.library.some((c) => c.def.name === 'Galactus, Devourer of Worlds') ? 2 : 0) })];
  // "Target creature attacks that player each combat": in a duel only a creature of yours could, and you'd rather it chose
  return d;
};
S['Tri-Sentinel, Act of Vengeance'] = (d) => {
  d.etb = [{ k: 'dmgX', nFn: () => 3, tgt: { f: OPP, min: 0 } }];
  return d;
};
S['Vibranium Mining Mech'] = (d) => {
  d.etb = [vibE(1)];
  d.trig.push(T('attack', { self: true, run: (G, X) => vibranium(G, X.P, 1) }));
  d.acts.push({ cost: { m: C('{2}') }, label: '+1/+0 until end of turn', when: ['blocks'], run: (G, X) => pump(G, X.src, 1, 0),
    ai: (G, P, c, when) => (isCreature(c) && c.attacking && when === 'blocks' ? { score: 0.7 } : null) });
  return d;
};
S['Vibranium Strike Gauntlets'] = (d) => {
  d.statics = d.statics.filter((s) => s.who !== 'equipped');
  d.statics.push({ who: 'equipped', p: 3, t: 0, kw: ['trample'] });
  d.etb = [{ k: 'fn', run: (G, X, t) => { const c = t && t.c; if (c && onBf(G, c) && onBf(G, X.src)) attach(G, X.src, c); }, tgt: { f: YOU }, val: (G, P, c) => 0.5 + cv(c) * 0.2, label: 'Attach it to a creature you control' }];
  // The equipped creature's "deals combat damage to a player: draw a card"
  d.trig.push(T('hitPlayer', { cond: (G, src, ev) => !!ev.c && src.att === ev.c.id, run: (G, X) => drawN(G, X.P, 1) }));
  d.equipAi = (G, P, t) => 1.5;
  return d;
};
S['Vision, Synthezoid Avenger'] = (d) => {
  d.trig.push(T('cast', { cond: (G, src, ev) => G.active !== ev.P.i, run: (G, X) => {
    const P = X.P, c = X.src;
    const threat = !!X.ev.item && L.allTargets(X.ev.item.targets).some((t) => t.c === c) && X.ev.P !== P;
    const k = isHuman(G, P) ? chooseMode(G, P, c, 'Vision: choose one', ['Put a +1/+1 counter on Vision', 'Vision phases out'], threat ? 1 : 0) : threat ? 1 : 0;
    if (k === 1) phaseOut(G, c); else addCounters(G, c, 1);
  } }));
  return d;
};
S['The Fantasticar'] = (d) => {
  d.trig.push(T('cast', { you: true, cond: (G, src, ev) => nonCreDef(ev.card.def) && !src.tf.animated, may: true, mayLabel: 'Have The Fantasticar become an artifact creature until end of turn?',
    mayAi: (G, X) => G.active === X.P.i && (G.phase === 'main1' || !G.combat), run: (G, X) => { X.src.tf.animated = true; dirty(G); say(G, X.P, 'The Fantasticar becomes an artifact creature until end of turn.', [X.src.id]); } }));
  d.trig.push(T('cast', { you: true, cond: (G, src, ev, Q) => nonCreDef(ev.card.def) && (Q.castDefs || []).filter(nonCreDef).length === 4, may: true, mayLabel: 'Sacrifice The Fantasticar to create four 4/4 Constructs with flying and haste?', run: (G, X) => {
    if (!onBf(G, X.src)) return;
    emit(G, 'sac', `${X.P.name} sacrifices The Fantasticar.`, { who: X.P.i, cards: [X.src.id] });
    sacrifice(G, X.P, X.src, true);
    mk(G, X.P, CONSTRUCT, 4);
  } }));
  return d;
};
S['Molecule Man'] = (d) => {
  // Miracle {0}: the first card you draw each turn, if it's a nonland card, may be cast for free as you draw it
  d.trig.push(T('draw', { you: true, cond: (G, src, ev, Q) => ev.nth === 1 && !!ev.card && !isLand(ev.card) && Q.hand.includes(ev.card), run: (G, X) => {
    const c = X.ev.card;
    if (!X.P.hand.includes(c)) return;
    say(G, X.P, `${X.P.name} reveals ${c.def.name} (miracle {0}).`, [c.id]);
    castNow(G, X.P, c, { free: true });
  } }));
  return d;
};

/* ============================================================ More of the kit */
const fightE = (label, after) => fn((G, X, t) => { const a = t && t.c, b = t && t.c2; if (a && b && onBf(G, a) && onBf(G, b)) { if (after) after(G, X, a, b, 'before'); L.fightCards(G, X.P, a, b); if (after) after(G, X, a, b, 'after'); } },
  { tgt: { pair: true, fa: YOU, fb: OPP, labels: ['Choose your creature', 'Choose the creature it fights'] }, pairVal: (G, P, a, b) => L.fightScore(G, P, a, b), label: label || 'Your creature fights one you don\'t control' });
const biteE = (label) => fn((G, X, t) => { const a = t && t.c, b = t && t.c2; if (a && b && onBf(G, a) && onBf(G, b)) L.biteCards(G, X.P, a, b); },
  { tgt: { pair: true, fa: YOU, fb: OPP, labels: ['Choose your creature', 'Choose the creature it damages'] }, pairVal: (G, P, a, b) => (L.kills(a, b) ? cv(b) + 0.5 : 0.1), label: label || 'Your creature deals damage equal to its power to one you don\'t control' });
// The resolving spell goes to exile instead of the graveyard (Genesis Ultimatum)
const exileSelf = (G, X) => { const P = G.players[X.src.owner]; const k = P.gy.indexOf(X.src); if (k >= 0) { P.gy.splice(k, 1); P.exile.push(X.src); dirty(G); } };
// "Until end of turn" for a lasting change: undone at the next end step (clone-safe: the entry carries what it needs)
const atEnd = (G, data, run) => G.delayed.push(Object.assign({ when: 'end', run }, data));
const giveType = (G, c, t) => { c.addSubs = (c.addSubs || []).concat(t); dirty(G); atEnd(G, { c, t }, function (GG) { const x = this.c; if (x.addSubs) { x.addSubs = x.addSubs.filter((s) => s !== this.t); if (!x.addSubs.length) x.addSubs = null; dirty(GG); } }); };
const unblock = (G, c) => { if (c && onBf(G, c)) { c.tf.unblockable = true; grantKw(G, c, [], "can't be blocked this turn"); } };
const hasArtMv = (P, n) => P.bf.some((c) => isArtifact(c) && c.def.mv >= n);
const artSpell = (ev, n) => !!ev.card && ev.card.def.types.includes('Artifact') && ev.card.def.mv >= n;

/* ============================================================ White */
S['Avenge'] = (d) => {
  d.costMod = (G, P) => { const O = other(G, P); return O.atkTurn === G.turn - 1 && (O.atkLog || []).length ? 2 : 0; };
  d.spell = [{ k: 'destroyAll', f: {} }, fn((G, X) => gain(G, X.P, X.n || 0), { score: () => 0 })];
  d.role = 'sweeper';
  return d;
};
S['Dismantling Wave'] = (d) => {
  d.spell = [{ k: 'destroyP', tgt: { f: { types: ['Artifact', 'Enchantment'], side: 'opp' }, min: 0 } }];
  d.cycling = C('{6}{W}{W}');
  d.cycleRun = (G, P) => { drawN(G, P, 1); destroyEach(G, P, allPerms(G).filter((c) => isArtifact(c) || isEnchantment(c)), 'to Dismantling Wave'); };
  d.cycleAi = (G, P) => sweepVal(G, P, (c) => isArtifact(c) || isEnchantment(c)) >= 4;
  d.role = 'removal';
  return d;
};
S['Divine Visitation'] = (d) => { d.tokenAs = ANGEL; d.role = 'value'; return d; };
S['Dora Milaje Elite'] = (d) => {
  d.etb = [fn((G, X) => { if (count(other(G, X.P), isLand) > count(X.P, isLand)) vibranium(G, X.P, 1); }, { score: (G, P) => (count(other(G, P), isLand) > count(P, isLand) ? 1 : 0) })];
  d.acts.push({ cost: { sacSelf: true }, label: 'Legendary permanents you control gain indestructible until end of turn', when: ['blocks'],
    run: (G, X) => { for (const c of X.P.bf.filter(isLegendary)) kwOnce(G, c, ['indestructible']); },
    ai: (G, P, c) => { const fc = combatDoom(G); const save = fc ? P.bf.filter((x) => x !== c && isLegendary(x) && fc.dead.has(x)) : []; return save.length ? { score: save.reduce((s, x) => s + cv(x), 0) - cv(c) } : null; } });
  return d;
};
S['Everett K. Ross, Hapless Attaché'] = (d) => {
  d.statics.push({ who: 'all', f: { side: 'you', fn: (G, c) => isCommander(c) }, p: 1, t: 1, kw: ['lifelink'] });
  d.trig.push(T('attacks', { opp: true, cond: (G, src, ev) => ev.cs.length >= 2, eff: [{ k: 'draw', n: 1 }] }));
  return d;
};
S['Falcon and Redwing'] = (d) => {
  d.trig.push(T('hitPlayer', { self: true, run: (G, X) => { mk(G, X.P, BIRD_W, X.ev.n); if (onBf(G, X.src)) addCounters(G, X.src, 1); } }));
  return d;
};
S['Folk Hero'] = (d) => {
  // Your commander's ability: a spell that shares a creature type with it draws a card, once each turn
  d.trig.push(T('cast', { you: true, once: true, cond: (G, src, ev, Q) => !!ev.card && ev.card.def.sub.length > 0 && Q.bf.some((c) => isCommander(c) && isCreature(c) && creTypes(c).some((t) => ev.card.def.sub.includes(t))), eff: [{ k: 'draw', n: 1 }] }));
  d.role = 'draw';
  return d;
};
S['Hatut Zeraze Strike Force'] = (d) => {
  d.etb = [{ k: 'destroyP', tgt: { f: { types: ['Artifact', 'Enchantment'] }, min: 0 } }];
  d.onCast = (G, P, item) => { for (let k = 0; k < (P.cmdCasts || 0) && !G.over; k++) copySpell(G, P, item); };
  d.castScore = (G, P) => (P.cmdCasts || 0) * 2;
  return d;
};
S['Hercules, Olympian Hero'] = (d) => {
  d.trig.push(T('attack', { self: true, run: (G, X) => { addCounters(G, X.src, 1); kwOnce(G, X.src, ['indestructible']); } }));
  d.trig.push(T('dmgCreature', { once: true, cond: (G, src, ev) => ev.c === src, run: (G, X) => { if (onBf(G, X.src)) addCounters(G, X.src, X.ev.n); } }));
  return d;
};
S['Heroic Return'] = (d) => {
  d.costMod = (G, P) => (beingAttacked(G, P) ? 2 : 0);
  d.spell = [fn((G, X, t) => { const c = t && t.c; if (c && X.P.gy.includes(c)) reanimate(G, X.P, c, heroDef(c.def) ? { ctr: { '+1/+1': 2 } } : {}); },
    { tgt: { what: 'gy', mine: true, f: { types: ['Creature'] } }, val: (G, P, c) => c.def.value + (heroDef(c.def) ? 1.8 : 0), label: 'Choose a creature card in your graveyard' })];
  d.role = 'value';
  return d;
};
S['Heroic Sacrifice'] = (d) => {
  d.spell = [fn((G, X, t) => {
    const c = t && t.c;
    if (!c || !onBf(G, c)) return;
    c.tf.soak = true;
    X.src.mem.soakId = c.id;
    dirty(G);
    say(G, X.P, `Until end of turn, damage that would be dealt to ${X.P.name} and their creatures is dealt to ${c.def.name} instead.`, [c.id]);
    turnTrig(G, X.P, X.src, T('die', { cond: (GG, src, ev) => !!ev.c && ev.c.id === src.mem.soakId, run: (GG, XX) => {
      XX.src.mem.soakId = 0;
      const ctr = Object.assign({}, XX.ev.ctr || {}), n = XX.ev.cnt || 0;
      const to = pickOne(GG, XX.P, XX.P.bf.filter(isCreature), 'Put its counters on a creature you control', (x) => cv(x), 'choose', 'battlefield');
      if (to) { if (n > 0) addCounters(GG, to, n); for (const [k, m] of Object.entries(ctr)) if (m > 0 && k !== 'finality') addCounters(GG, to, m, k); }
      drawN(GG, XX.P, 1);
    } }));
  }, { tgt: { f: YOU }, val: (G, P, c) => (has(c, 'indestructible') ? 3 : 0) + tou(c) * 0.3 - cv(c) * 0.2,
    score: (G, P) => { if (!beingAttacked(G, P)) return -1; const fc = combatDoom(G); return fc ? P.bf.filter((c) => fc.dead.has(c)).reduce((s, c) => s + cv(c), 0) : 0; }, label: 'Choose a creature you control' })];
  d.role = 'trick';
  return d;
};
S['Ingenious Smith'] = (d) => {
  d.etb = [fn((G, X) => L.lookAtTop(G, X.P, 4, (c) => c.def.types.includes('Artifact'), 1, 'Reveal an artifact card'), { score: () => 1 })];
  d.trig.push(T('enter', { you: true, once: true, cond: (G, src, ev) => isArtifact(ev.c), run: (G, X) => addCounters(G, X.src, 1) }));
  return d;
};
S['Invisible Force Field'] = (d) => {
  d.spell = [{ k: 'grant', kw: ['indestructible'], tgt: { f: { types: ['any'], side: 'you' }, n: 4, min: 0 } }, rebound()];
  d.castScore = (G, P) => { const fc = combatDoom(G); return fc ? P.bf.filter((c) => fc.dead.has(c)).reduce((s, c) => s + cv(c), 0) : -1; };
  d.role = 'trick';
  return d;
};
S['Invisible Woman'] = (d) => {
  d.trig.push(ncCombat({ eff: [mkE(WALL_R, 1)] }));
  d.trig.push(T('attacks', { you: true, cond: (G, src, ev, Q) => canPay(Q, C('{R}{G}{W}{U}'), { ability: true, src }), eff: [
    fn((G, X) => { X.did = mayPay(G, X.P, X.src, '{R}{G}{W}{U}', 'Pay {R}{G}{W}{U}: a creature gets +1/+0 for each creature you control and can\'t be blocked?', X.ev.cs.length > 0 && X.P.bf.filter(isCreature).length >= 3); }, { score: () => 0.5 }),
    { k: 'reflex', if: (G, X) => !!X.did, eff: [fn((G, X, t) => { const c = t && t.c; if (!c || !onBf(G, c)) return; pump(G, c, count(X.P, isCreature), 0); unblock(G, c); },
      { tgt: { f: {} }, val: (G, P, c) => (c.ctrl !== P.i ? -1 : (c.attacking ? 2 + pow(c) * 0.3 : 0.2)), label: 'Choose a creature: +1/+0 for each creature you control, and it can\'t be blocked' })] }] }));
  return d;
};
S["King Solomon's Frogs"] = (d) => {
  d.etb = [fn((G, X, t) => { if (!X.item) return; const c = t && t.c; if (!c || !onBf(G, c)) return; const Q = G.players[c.ctrl]; exilePermanent(G, X.P, c); drawN(G, Q, 1); },
    { tgt: { f: { types: ['any'], side: 'opp', fn: (G, c) => c.def.mv >= 3 }, min: 0 }, val: (G, P, c) => pv(G, c) - 1.2, label: 'Exile a permanent an opponent controls with mana value 3 or greater (they draw a card)' })];
  d.acts.push({ cost: { m: C('{3}'), tap: true, exileSelfBf: true }, label: "Exile King Solomon's Frogs: you become the monarch", when: ['end', 'main2'], eff: [monarchE()],
    ai: (G, P) => (G.monarch !== P.i ? { score: 0.8 + monarchVal(G, P) } : null) });
  return d;
};
S['Loyal Retainers'] = (d) => {
  d.acts.push({ cost: { sacSelf: true }, label: 'Return a legendary creature card from your graveyard to the battlefield', when: ['main1'], cond: (G, P) => G.active === P.i && P.atkTurn !== G.turn,
    eff: [{ k: 'regrow', to: 'bf', tgt: { what: 'gy', mine: true, f: { types: ['Creature'], legendary: true } } }],
    ai: (G, P, c) => { const best = P.gy.filter((x) => isCreCard(x) && x.def.supertypes.includes('Legendary')).sort((a, b) => b.def.value - a.def.value)[0]; return best && best.def.value > cv(c) + 1 ? { score: best.def.value - cv(c) } : null; } });
  return d;
};
S['Make Your Move'] = (d) => {
  d.spell = [{ k: 'destroyP', tgt: { f: { types: ['any'], fn: (G, c) => isArtifact(c) || isEnchantment(c) || (isCreature(c) && pow(c) >= 4) } } }];
  d.role = 'removal';
  return d;
};
S['Martial Coup'] = (d) => {
  d.spell = [fn((G, X) => {
    const x = X.x || 0;
    const made = mk(G, X.P, SOLDIER, x);
    if (x >= 5) destroyEach(G, X.P, allCreatures(G).filter((c) => !made.includes(c)), 'to Martial Coup');
  }, { score: (G, P, X) => { const x = (X && X.x) || 0; return x * 1.1 + (x >= 5 ? sweepVal(G, P, isCreature) : 0); } })];
  d.aiX = (G, P, card, max) => (max >= 5 && sweepVal(G, P, isCreature) > -2 ? max : max >= 5 ? 4 : max >= 2 ? max : null);
  d.role = 'sweeper';
  return d;
};
S['Methods of the Mighty'] = (d) => {
  d.modes = [
    { label: 'Destroy target artifact', eff: [{ k: 'destroyP', tgt: { f: { types: ['Artifact'] } } }] },
    { label: 'Destroy target tapped creature', eff: [{ k: 'destroyP', tgt: { f: { tapped: true } } }] },
    { label: 'Put a +1/+1 counter on each creature you control', eff: [fn((G, X) => L.mshKit.ctrEach(G, X.P.bf.filter(isCreature), 1), { score: (G, P) => count(P, isCreature) * 0.9 })] },
  ];
  d.modeN = 3;
  d.spell = null;
  d.role = 'removal';
  return d;
};
S['Midnight Angel Armor'] = (d) => {
  d.etb = [fn((G, X) => { const [t] = mk(G, X.P, SOLDIER, 1); if (t && onBf(G, X.src)) attach(G, X.src, t); }, { score: () => 4 })];
  return d;
};
S['Monologue Tax'] = (d) => { d.trig.push(T('cast', { opp: true, cond: (G, src, ev) => ev.nth === 2, run: (G, X) => treasure(G, X.P, 1) })); d.role = 'ramp'; return d; };
S['Queen Mother Ramonda'] = (d) => {
  d.etb = [monarchE()];
  d.attackBan = (G, src, c) => c.ctrl !== src.ctrl && G.monarch === src.ctrl && pow(c) <= 2;
  return d;
};
S['Royal Talon Fighter Jet'] = (d) => {
  d.etbCtr = (G, P, card, opts) => ({ '+1/+1': (opts && opts.item && opts.item.x) || 0 });
  const soldiers = (G, X) => mk(G, X.P, SOLDIER, Math.max(0, X.src.cnt));
  d.etb = [fn(soldiers, { score: (G, P, X) => ((X && X.x) || 1) * 1.2 })];
  d.trig.push(T('attack', { self: true, run: soldiers }));
  d.aiX = (G, P, card, max) => (max >= 1 ? max : null);
  return d;
};
S['The Spear of Bashenga'] = (d) => {
  d.etb = [fn((G, X) => { if (noMonarch(G)) becomeMonarch(G, X.P); }, { score: (G, P) => (noMonarch(G) ? monarchVal(G, P) : 0) })];
  d.trig.push(T('attack', { hostOnly: true, cond: (G, src, ev) => G.monarch === other(G, G.players[ev.c.ctrl]).i, eff: [{ k: 'destroyP', tgt: { f: { types: ['nonland'], tapped: true, side: 'opp' } } }] }));
  return d;
};
S['Ultimate Nullification'] = (d) => {
  d.addCost = { sac: { types: ['Creature'], legendary: true }, sacWord: 'a legendary creature' };
  d.spell = [fn((G, X) => {
    const me = G.players[X.src.owner], k = me.gy.indexOf(X.src);
    if (k >= 0) me.gy.splice(k, 1);
    const cs = allCreatures(G);
    for (const c of cs) { if (c.ctrl !== X.P.i) X.P.stats.kills++; exilePermanent(G, X.P, c); }
    for (const Q of G.players) { const gy = Q.gy.splice(0); Q.exile.push(...gy); if (gy.length) emit(G, 'exile', `${Q.name}'s graveyard is exiled.`, { who: X.P.i, cards: gy.map((c) => c.id) }); }
    if (!X.src.isCopy) { me.library.unshift(X.src); emit(G, 'info', 'Ultimate Nullification goes to the bottom of its owner\'s library.', { who: X.P.i }); }
    dirty(G);
  }, { score: (G, P) => allCreatures(G).reduce((s, c) => s + (c.ctrl === P.i ? -cv(c) : cv(c)), 0) - 1 })];
  d.role = 'sweeper';
  return d;
};
S['Valorous Stance'] = (d) => {
  d.modes = [
    { label: 'Target creature gains indestructible until end of turn', eff: [{ k: 'grant', kw: ['indestructible'], tgt: { f: YOU } }] },
    { label: 'Destroy target creature with toughness 4 or greater', eff: [{ k: 'destroyP', tgt: { f: { fn: (G, c) => tou(c) >= 4 } } }] },
  ];
  d.spell = null;
  d.role = 'removal';
  return d;
};
S['Winter Soldier, Reborn Avenger'] = (d) => {
  d.trig.push(T('attack', { self: true, eff: [fn((G, X, t) => { const c = t && t.c; if (c && X.P.gy.includes(c)) reanimate(G, X.P, c, heroDef(c.def) ? { ctr: { '+1/+1': 1 } } : {}); },
    { tgt: { what: 'gy', mine: true, f: { types: ['Creature'] }, fn: (G, P, x, src) => !!src && x.def.mv <= pow(src) }, val: (G, P, c) => c.def.value, label: 'Return a creature card from your graveyard to the battlefield' })] }));
  return d;
};
S['Gift of Immortality'] = (d) => {
  d.auraVal = (G, P, c) => (c.ctrl === P.i ? 0.6 + cv(c) * 0.4 : -5);
  d.trig.push(T('die', { hostOnly: true, run: (G, X) => {
    const c = X.ev.c, O = G.players[c.owner];
    if (!c.token && O.gy.includes(c)) { emit(G, 'raise', `${c.def.name} returns to the battlefield (Gift of Immortality).`, { who: O.i, cards: [c.id] }); putOntoBattlefield(G, O, c); }
    atEnd(G, { aura: X.src, host: c }, function (GG) {
      const a = this.aura, h = this.host, A0 = GG.players[a.owner];
      if (!A0.gy.includes(a) || !onBf(GG, h)) return;
      emit(GG, 'enter', `${a.def.name} returns to the battlefield attached to ${h.def.name}.`, { who: A0.i, cards: [a.id, h.id] });
      putOntoBattlefield(GG, A0, a, { attachTo: h });
    });
  } }));
  return d;
};

/* ============================================================ Blue */
S['Chameleon, Master of Disguise'] = (d) => {
  d.enterAs = cloneMine(() => ({ name: 'Chameleon, Master of Disguise' }));
  d.mayhem = C('{2}{U}');
  return d;
};
S['Council of Reeds'] = (d) => {
  d.noLegendRule = true;
  d.trig.push(ncCombat({ run: (G, X) => { const t = copyToken(G, X.P, X.src); emit(G, 'token', `${X.P.name} creates a token copy of Council of Reeds.`, { who: X.P.i, cards: [t.id] }); } }));
  return d;
};
S['Extract Power'] = (d) => {
  d.spell = [fn((G, X) => {
    const got = [];
    for (const Q of G.players) { const c = Q.library.pop(); if (!c) continue; Q.exile.push(c); X.P.xcast.push({ card: c, until: 1e9, free: true }); got.push(c); }
    dirty(G);
    emit(G, 'exile', `${X.P.name} exiles the top card of each library face down: ${nameList(got)}. They may play them without paying their mana costs.`, { who: X.P.i, cards: got.map((c) => c.id) });
  }, { score: () => 4 })];
  d.role = 'draw';
  return d;
};
S['Fantastic Elasticity'] = (d) => {
  d.modes = [
    { label: 'Return target nonland permanent to its owner\'s hand', eff: [{ k: 'bounceP', tgt: { f: { types: ['nonland'] } } }, rebound()] },
    { label: 'Return target instant or sorcery card from your graveyard to your hand', eff: [{ k: 'regrow', tgt: { what: 'gy', mine: true, f: { types: ['Instant', 'Sorcery'] } } }, rebound()] },
  ];
  d.spell = null;
  d.role = 'value';
  return d;
};
// The plan: exile the top four, cast any of them free, the rest go to your hand
const GP_PLAN = fn((G, X) => {
  const P = X.P, top = P.library.splice(Math.max(0, P.library.length - 4)).reverse();
  if (!top.length) return;
  P.exile.push(...top);
  dirty(G);
  emit(G, 'exile', `${P.name} exiles ${nameList(top)} from the top of their library.`, { who: P.i, cards: top.map((c) => c.id) });
  for (const c of top.filter((x) => !isLand(x)).sort((a, b) => b.def.mv - a.def.mv)) {
    if (!P.exile.includes(c)) continue;
    P.xcast.push({ card: c, until: G.turn, free: true });
    castNow(G, P, c, { free: true });
    P.xcast = P.xcast.filter((x) => x.card !== c);
  }
  const rest = top.filter((c) => P.exile.includes(c));
  for (const c of rest) { P.exile.splice(P.exile.indexOf(c), 1); P.hand.push(c); }
  if (rest.length) emit(G, 'raise', `${P.name} puts ${nameList(rest)} into their hand.`, { who: P.i, cards: rest.map((c) => c.id) });
  dirty(G);
}, { score: () => 5 });
S['Glorious Purpose'] = (d) => {
  planOn(d, 6, [GP_PLAN], 'The plan comes together: spells from the top four cards, free');
  d.trig.push(T('connive', { you: true, run: (G, X) => { const c = X.ev.c; if (c && onBf(G, c) && isCreature(c)) addCounters(G, c, 1); plan(G, X, 1); } }));
  return d;
};
S['Helmut Zemo, Mastermind'] = (d) => {
  d.trig.push(T('attack', { self: true, eff: [fn((G, X, t) => {
    const c = t && t.c, P = X.P;
    if (!c || !P.gy.includes(c)) return;
    P.xcast.push({ card: c, until: G.turn, exileAfter: true });
    const ok = castNow(G, P, c, {});
    P.xcast = P.xcast.filter((x) => x.card !== c);
    if (ok && onBf(G, X.src)) addCounters(G, X.src, 1);
  }, { tgt: { what: 'gy', mine: true, f: { types: ['Instant', 'Sorcery'] }, fn: (G, P, x, src) => !!src && x.def.mv <= pow(src), min: 0 }, val: (G, P, c) => c.def.value, label: 'You may cast an instant or sorcery card from your graveyard' })] }));
  return d;
};
S['Iron Man, Armored Avenger'] = (d) => {
  d.trig.push(T('draw', { you: true, eff: [{ k: 'ctrs', n: 1, tgt: { f: {} } }] }));
  d.trig.push(T('attack', { self: true, run: (G, X) => { for (const c of attackingNow(G, X.P)) if (c !== X.src && modified(G, c)) kwOnce(G, c, ['flying']); } }));
  return d;
};
S['Jarvis, Earth\'s Mightiest Butler'] = (d) => { d.trig.push(T('cast', { you: true, cond: (G, src, ev) => heroDef(ev.card.def), eff: [{ k: 'draw', n: 1 }] })); d.role = 'draw'; return d; };
S['Kang Dynasty'] = (d) => {
  const tapGoad = fn((G, X, t) => {
    const c = t && t.c;
    if (!c || !onBf(G, c)) return;
    c.tapped = true;
    goad(G, X.P, c);
    c.mem.kangBy = X.P.i;
    dirty(G);
    turnTrig(G, X.P, X.src, T('hitPlayer', { cond: (GG, src, ev, Q) => !!ev.c && ev.c.mem.kangBy === Q.i, run: (GG, XX) => drawN(GG, XX.P, 1) }), G.turn + 1);
  }, { tgt: { f: OPP, min: 0 }, val: (G, P, c) => 0.5 + cv(c) * 0.2, label: 'Tap and goad a creature an opponent controls' });
  d.saga = [
    { ch: [1, 2], eff: [tapGoad] },
    { ch: [3], eff: [fn((G, X, t) => { const c = t && t.c; if (!c || !onBf(G, c)) return; pump(G, c, X.P.hand.length, X.P.hand.length); unblock(G, c); },
      { tgt: { f: YOU }, val: (G, P, c) => 0.5 + pow(c) * 0.2, label: 'Choose a creature you control: +1/+1 for each card in your hand, and it can\'t be blocked' })] },
  ];
  return d;
};
S['Kindred Discovery'] = (d) => {
  chooseTypeAs(d);
  const mine = (src, c) => !!src.mem.ctype && isCreature(c) && hasSub(c, src.mem.ctype);
  d.trig.push(T('enter', { you: true, cond: (G, src, ev) => mine(src, ev.c), eff: [{ k: 'draw', n: 1 }] }));
  d.trig.push(T('attack', { you: true, cond: (G, src, ev) => mine(src, ev.c), eff: [{ k: 'draw', n: 1 }] }));
  d.role = 'draw';
  return d;
};
S['Lockjaw, Slobbering Teleporter'] = (d) => {
  d.trig.push(ncCombat({ eff: [fn((G, X) => { addCounters(G, X.src, 1); unblock(G, X.src); }, { score: () => 1.5 }),
    { k: 'reflex', eff: [fn((G, X, t) => unblock(G, t && t.c), { tgt: { f: { side: 'you', other: true }, min: 0 }, val: (G, P, c) => (c.tapped ? 0 : 0.5 + pow(c) * 0.3), label: 'Another creature you control can\'t be blocked this turn' })] }] }));
  return d;
};
S["Mind's Dilation"] = (d) => {
  d.trig.push(T('cast', { opp: true, cond: (G, src, ev) => ev.nth === 1, run: (G, X) => {
    const Q = X.ev.P, c = Q.library.pop();
    if (!c) return;
    Q.exile.push(c);
    dirty(G);
    emit(G, 'exile', `${Q.name} exiles ${c.def.name} from the top of their library (Mind's Dilation).`, { who: X.P.i, cards: [c.id] });
    if (isLand(c)) return;
    X.P.xcast.push({ card: c, until: G.turn, free: true });
    castNow(G, X.P, c, { free: true });
    X.P.xcast = X.P.xcast.filter((x) => x.card !== c);
  } }));
  d.role = 'value';
  return d;
};
S['Mister Fantastic'] = (d) => {
  d.trig.push(ncCombat({ eff: [{ k: 'draw', n: 1 }] }));
  // "Copy target triggered ability you control twice": the next ability of yours that triggers this turn happens three times
  d.acts.push({ cost: { m: C('{R}{G}{W}{U}'), tap: true }, label: 'The next ability you control that triggers this turn is copied twice', noAi: true,
    run: (G, X) => { X.P.echoNext = { turn: G.turn, n: 2, src: X.src.id }; say(G, X.P, `The next ability ${X.P.name} controls that triggers this turn is copied twice.`, [X.src.id]); } });
  return d;
};
S['Professor Hulk'] = (d) => { d.trig.push(T('hitPlayer', { self: true, run: (G, X) => drawN(G, X.P, X.ev.n) })); return d; };
S['Quantum Misalignment'] = (d) => {
  d.spell = [fn((G, X, t) => { const c = t && t.c; if (!c || !onBf(G, c)) return; const k = copyToken(G, X.P, c, { nonLegendary: true }); emit(G, 'token', `${X.P.name} creates a token copy of ${c.def.name}.`, { who: X.P.i, cards: [k.id] }); },
    { tgt: { f: YOU }, val: (G, P, c) => c.def.value + (c.def.etb.length ? 1 : 0), label: 'Choose a creature you control to copy' }), rebound()];
  d.role = 'value';
  return d;
};
S['Recurring Insight'] = (d) => { d.spell = [fn((G, X) => drawN(G, X.P, X.O.hand.length), { score: (G, P) => other(G, P).hand.length * 1.1 }), rebound()]; d.role = 'draw'; return d; };
S['Reconnaissance Mission'] = (d) => {
  d.trig.push(T('hitPlayer', { you: true, may: true, mayLabel: 'Draw a card (Reconnaissance Mission)?', eff: [{ k: 'draw', n: 1 }] }));
  d.cycling = C('{2}');
  d.role = 'draw';
  return d;
};
S['Spark Double'] = (d) => {
  d.enterAs = (G, P, card, opts) => { cloneMine((base) => ({ supertypes: base.supertypes.filter((x) => x !== 'Legendary') }))(G, P, card, opts); if (card.faceBase) card.etbAdd = { '+1/+1': 1 }; };
  d.castScore = (G, P) => (P.bf.some(isCreature) ? 0 : -10);
  return d;
};
S['Titan of Littjara'] = (d) => {
  chooseTypeAs(d);
  d.subFn = (G, c) => (c.mem.ctype && !c.def.sub.includes(c.mem.ctype) ? c.def.sub.concat(c.mem.ctype) : null);
  const go = (G, X) => {
    const P = X.P, mineT = creTypes(X.src);
    const n = P.bf.filter((c) => c !== X.src && isCreature(c) && creTypes(c).some((t) => mineT.includes(t))).length;
    if (!n || (isHuman(G, P) ? !yesNo(G, P, X.src, `Draw ${n} card${n > 1 ? 's' : ''}, then discard a card?`, true) : false)) return;
    drawN(G, P, n);
    discardE(G, P, 1);
  };
  d.etb = [fn(go, { score: () => 1 })];
  d.trig.push(T('attack', { self: true, run: go }));
  return d;
};
S['Valeria Richards, Precocious'] = (d) => {
  d.spellDiscount = (G, P, card) => (nonCreDef(card.def) ? 1 : 0);
  d.trig.push(T('cast', { you: true, cond: (G, src, ev, Q) => nonCreDef(ev.card.def) && (Q.castDefs || []).filter(nonCreDef).length === 1, eff: [{ k: 'draw', n: 1 }] }));
  return d;
};
S['West Coast Expansion'] = (d) => {
  d.spell = [fn((G, X) => {
    const x = X.x || 0;
    drawN(G, X.P, x);
    if (x < 5) return;
    const hs = X.P.hand.filter((c) => heroDef(c.def) && !isLand(c));
    const c = isHuman(G, X.P) ? pickSome(G, X.P, hs, 0, 1, 'You may cast a Hero spell from your hand without paying its mana cost', (y) => y.def.value, 'hand')[0] : hs.slice().sort((a, b) => b.def.mv - a.def.mv)[0];
    if (c) castNow(G, X.P, c, { free: true, ask: false });
  }, { score: (G, P, X) => ((X && X.x) || 0) * 1.1 + ((X && X.x) >= 5 && P.hand.some((c) => heroDef(c.def)) ? 2 : 0) })];
  d.aiX = (G, P, card, max) => (max >= 2 ? max : null);
  d.role = 'draw';
  return d;
};
S['The Wasp, Winsome Avenger'] = (d) => {
  d.etb = [{ k: 'grant', kw: ['hexproof'], tgt: { f: { sub: 'Hero' } } }];
  d.trig.push(T('attack', { self: true, eff: [{ k: 'tapP', tgt: { f: OPP } }] }));
  return d;
};

/* ============================================================ More artifacts */
S['Talisman of Creativity'] = L.cmdKit.painland('U', 'R');
S['Avengers Quinjet'] = (d) => {
  const modes = [
    { label: 'Put a Hero creature card from your hand onto the battlefield', eff: [fn((G, X) => {
      const hs = X.P.hand.filter((c) => isCreCard(c) && heroDef(c.def));
      const c = isHuman(G, X.P) ? pickSome(G, X.P, hs, 0, 1, 'You may put a Hero creature card onto the battlefield', (y) => y.def.value, 'hand')[0] : hs.slice().sort((a, b) => b.def.value - a.def.value)[0];
      if (!c) return;
      emit(G, 'enter', `${X.P.name} puts ${c.def.name} onto the battlefield.`, { who: X.P.i, cards: [c.id] });
      putOntoBattlefield(G, X.P, c);
    }, { score: (G, P) => Math.max(0, ...P.hand.filter((c) => isCreCard(c) && heroDef(c.def)).map((c) => c.def.value)) })] },
    { label: 'Return target Hero creature card from your graveyard to your hand', eff: [{ k: 'regrow', tgt: { what: 'gy', mine: true, f: { types: ['Creature'], fn: (dd) => dd.sub.includes('Hero') } } }] },
  ];
  d.etb = [chooseOne(modes)];
  d.trig.push(T('attack', { self: true, eff: [chooseOne(modes)] }));
  return d;
};
// "Whenever you discard a card, you may exile that card from your graveyard": worth it unless the card does something there
const gyUse = (c) => !!(c.def.mayhem || c.def.flashback || c.def.gyActs || c.def.gyTrig || c.def.gyDiscard || c.def.escape || c.def.unearth);
S['Containment Construct'] = (d) => {
  d.trig.push(T('discard', { you: true, cond: (G, src, ev, Q) => !!ev.card && Q.gy.includes(ev.card), run: (G, X) => {
    const P = X.P, c = X.ev.card;
    if (!P.gy.includes(c)) return;
    const playable = isLand(c) ? P.landsPlayed < L.landLimit(G, P) && G.active === P.i : canPay(P, L.castCost(P, c), { def: c.def });
    if (isHuman(G, P) ? !yesNo(G, P, X.src, `Exile ${c.def.name}? You may play it this turn.`, true) : !(playable && !gyUse(c))) return;
    P.gy.splice(P.gy.indexOf(c), 1); P.exile.push(c); P.xcast.push({ card: c, until: G.turn }); dirty(G);
    emit(G, 'exile', `${P.name} exiles ${c.def.name}; they may play it this turn.`, { who: P.i, cards: [c.id] });
  } }));
  return d;
};
S['Currency Converter'] = (d) => {
  d.trig.push(T('discard', { you: true, cond: (G, src, ev, Q) => !!ev.card && Q.gy.includes(ev.card), run: (G, X) => {
    const P = X.P, c = X.ev.card;
    if (!P.gy.includes(c) || (isHuman(G, P) ? !yesNo(G, P, X.src, `Exile ${c.def.name} with Currency Converter?`, true) : gyUse(c))) return;
    P.gy.splice(P.gy.indexOf(c), 1); P.exile.push(c); (X.src.mem.held = X.src.mem.held || []).push(c); dirty(G);
    emit(G, 'exile', `${P.name} exiles ${c.def.name} with Currency Converter.`, { who: P.i, cards: [c.id] });
  } }));
  const held = (G, c) => (c.mem.held || []).filter((x) => G.players[x.owner].exile.includes(x));
  d.acts.push({ cost: { m: C('{2}'), tap: true }, label: 'Draw a card, then discard a card', when: ['end'], run: (G, X) => { drawN(G, X.P, 1); discardE(G, X.P, 1); }, ai: (G, P) => ({ score: 0.9 }) });
  d.acts.push({ cost: { tap: true }, label: 'Put a card exiled with it into its owner\'s graveyard: a land makes a Treasure, anything else a 2/2 Rogue', when: ['end', 'main1'], cond: (G, P, c) => held(G, c).length > 0,
    run: (G, X) => {
      const hs = held(G, X.src);
      if (!hs.length) return;
      const c = pickOne(G, X.P, hs, 'Choose a card exiled with Currency Converter', (x) => (isLand(x) ? 0 : 1), 'choose', 'exile');
      const O = G.players[c.owner];
      O.exile.splice(O.exile.indexOf(c), 1); O.gy.push(c);
      X.src.mem.held = (X.src.mem.held || []).filter((x) => x !== c);
      dirty(G);
      emit(G, 'info', `${c.def.name} goes to ${O.name}'s graveyard.`, { who: X.P.i, cards: [c.id] });
      if (isLand(c)) treasure(G, X.P, 1); else mk(G, X.P, ROGUE, 1);
    },
    ai: (G, P, c, when) => (held(G, c).some((x) => !isLand(x)) ? { score: 2 } : held(G, c).length ? { score: 1 } : null) });
  d.role = 'value';
  return d;
};
S["Doom's Time Platform"] = (d) => {
  d.trig.push(T('attacks', { you: true, eff: [fn((G, X, t) => { const c = t && t.c; if (c && X.P.gy.includes(c)) suspend(G, X.P, c, 2); },
    { tgt: { what: 'gy', mine: true, f: { types: ['any'], fn: (dd) => !dd.types.includes('Land') } }, val: (G, P, c) => c.def.value, label: 'Exile a nonland card from your graveyard with two time counters (suspend)' })] }));
  d.role = 'value';
  return d;
};
S['War Machine, Avenging Arsenal'] = (d) => {
  d.trig.push(T('attack', { self: true, run: (G, X) => { for (const c of attackingNow(G, X.P)) if (modified(G, c)) kwOnce(G, c, ['double strike']); } }));
  return d;
};

/* ============================================================ Black */
S['Age of Ultron'] = (d) => {
  d.saga = [
    { ch: [1], eff: [{ k: 'destroyP', tgt: { f: { side: 'opp', fn: (G, c) => !isArtifact(c) }, min: 0 } }] },
    { ch: [2], eff: [mkE(ROBOT_VILLAIN, 1)] },
    { ch: [3], eff: [fn((G, X) => { for (const c of X.P.bf.filter((x) => isCreature(x) && isArtifact(x))) { kwOnce(G, c, ['deathtouch']); addCounters(G, c, 1); } }, { score: (G, P) => P.bf.filter((x) => isCreature(x) && isArtifact(x)).length * 1.2 })] },
  ];
  return d;
};
S['Black Market Connections'] = (d) => {
  const OPTS = [[0], [1], [2], [0, 1], [0, 2], [1, 2], [0, 1, 2]];
  const NAMES = ['a Treasure (lose 1 life)', 'draw a card (lose 2 life)', 'a 3/2 Shapeshifter (lose 3 life)'];
  d.trig.push(T('mainStart', { you: true, run: (G, X) => {
    const P = X.P, life = P.life, cost = (o) => o.reduce((s, k) => s + k + 1, 0);
    let pick;
    if (isHuman(G, P)) pick = OPTS[chooseMode(G, P, X.src, 'Black Market Connections: choose one or more', OPTS.map((o) => o.map((k) => NAMES[k]).join(' + ')), 3)];
    else pick = life >= 25 ? [0, 1, 2] : life >= 15 ? [1, 2] : life >= 9 ? [0, 1] : [0];
    for (const k of pick) {
      if (k === 0) { treasure(G, P, 1); loseLife(G, P, 1); }
      if (k === 1) { drawN(G, P, 1); loseLife(G, P, 2); }
      if (k === 2) { mk(G, P, SHAPESHIFTER, 1); loseLife(G, P, 3); }
    }
    void cost;
  } }));
  d.role = 'value';
  return d;
};
S['Damocles Base, Sword of Kang'] = (d) => {
  d.trig.push(T('hitPlayer', { self: true, run: (G, X) => {
    const Q = X.ev.Q, P = X.P;
    villainous(G, Q, X.src, [
      { label: 'Sacrifice a nontoken creature', cost: (GG, q) => { const cs = q.bf.filter((c) => isCreature(c) && !c.token); return cs.length ? Math.min(...cs.map((c) => cv(c))) : 0; }, run: (GG, q) => edictOf(GG, q, (c) => isCreature(c) && !c.token, 'Damocles Base') },
      { label: `Lose 2 life, and ${P.name} draws two cards`, cost: (GG, q) => 2 * L.lifeW(q) + 2.4, run: (GG, q) => { loseLife(GG, q, 2, P.i); drawN(GG, P, 2); } },
    ]);
  } }));
  return d;
};
S['Endless Ranks of HYDRA'] = (d) => {
  d.spell = [mkE(VILLAIN, 1)];
  const back = (G, X) => { if (X.P.gy.includes(X.src) && mayPay(G, X.P, X.src, '{1}{B}', 'Pay {1}{B} to return Endless Ranks of HYDRA to your hand?', true)) gyToHand(G, X.P, X.src); };
  d.gyTrig = [cmdEnters({ run: back }), T('attack', { you: true, cond: (G, src, ev) => isCommander(ev.c), run: back })];
  return d;
};
S['Iron Monger, Sadistic Tycoon'] = (d) => {
  d.trig.push(T('connive', { you: true, run: (G, X) => L.mshKit.ctrEach(G, X.P.bf.filter((c) => isCreature(c) && hasSub(c, 'Villain')), 1) }));
  return d;
};
S['Kindred Dominance'] = (d) => {
  d.spell = [fn((G, X) => {
    const P = X.P;
    const keep = (t) => allCreatures(G).filter((c) => !hasSub(c, t)).reduce((s, c) => s + (c.ctrl === P.i ? -cv(c) : cv(c)), 0);
    const t = L.chooseCreatureType(G, P, X.src, keep);
    destroyEach(G, P, allCreatures(G).filter((c) => !hasSub(c, t)), 'to Kindred Dominance');
  }, { score: (G, P) => Math.max(0, ...L.creatureTypesOf(G, P).slice(0, 8).map((t) => allCreatures(G).filter((c) => !hasSub(c, t)).reduce((s, c) => s + (c.ctrl === P.i ? -cv(c) : cv(c)), 0))) - 1 })];
  d.role = 'sweeper';
  return d;
};
S['Klaw, Master of Sound'] = (d) => {
  d.trig.push(T('cast', { you: true, cond: (G, src, ev) => ev.zone === 'xcast' && !ev.fromGy, run: (G, X) => kwOnce(G, X.src, ['indestructible']) }));
  d.trig.push(T('hitPlayer', { self: true, run: (G, X) => {
    const Q = X.ev.Q, c = Q.library.pop();
    if (!c) return;
    Q.exile.push(c);
    X.P.xcast.push({ card: c, until: 1e9, anyType: true });
    dirty(G);
    emit(G, 'exile', `${X.P.name} exiles the top card of ${Q.name}'s library face down; they may play it.`, { who: X.P.i, cards: [c.id] });
  } }));
  return d;
};
S['The Frightful Four'] = (d) => {
  d.trig.push(T('cast', { opp: true, cond: (G, src, ev) => nonCreDef(ev.card.def) && (ev.P.castDefs || []).filter(nonCreDef).length === 1 && ev.card.def.mv > 0,
    run: (G, X) => loseLife(G, X.ev.P, X.ev.card.def.mv, X.P.i) }));
  return d;
};
S['Withering Torment'] = (d) => { d.spell = [{ k: 'destroyP', tgt: { f: { types: ['Creature', 'Enchantment'] } } }, { k: 'lose', who: 'self', n: 2 }]; d.role = 'removal'; return d; };

/* ============================================================ Red */
S['Abomination, World Ravager'] = (d) => { d.mayhem = C('{4}{R}'); return d; };
S['Alicia Masters, Skilled Sculptor'] = (d) => {
  d.trig.push(ncCombat({ run: (G, X) => treasure(G, X.P, 1) }));
  d.trig.push(T('endStep', { you: true, cond: (G, src, ev) => ev.nth === 1 && allPerms(G).some((c) => isCreature(c) && c.ctrl !== c.owner), run: (G, X) => {
    for (const c of allPerms(G).filter((x) => isCreature(x) && x.ctrl !== x.owner)) gainControl(G, G.players[c.owner], c, 'perm');
  } }));
  return d;
};
S['Batroc the Leaper'] = (d) => {
  d.modes = [0, 1, 2, 3, 4].map((k) => ({ label: k ? `Kicked ${k === 1 ? 'once' : `${k} times`}` : 'Not kicked', cost: k ? C(`{${2 * k}}`) : undefined, ai: () => (k ? k * 1.6 : 0) }));
  d.spell = null;
  d.etbCtr = (G, P, card, opts) => ({ '+1/+1': (opts && opts.item && opts.item.mode ? opts.item.mode[0] : 0) });
  d.etb = [fn((G, X) => {
    const k = X.item && X.item.mode ? X.item.mode[0] : 0;
    if (!k || !onBf(G, X.src)) return;
    const n = Math.max(0, pow(X.src)), P = X.P, O = X.O;
    const ok = (c) => A._internal.targetOk(G, P, {}, c, X.src);
    const foes = allCreatures(G).filter((c) => c.ctrl !== P.i && ok(c));
    let cs, face;
    if (isHuman(G, P)) { cs = pickSome(G, P, allCreatures(G).filter(ok), 0, k, `Batroc deals ${n} damage to each of up to ${k} targets: choose creatures`, (c) => (c.ctrl === P.i ? -1 : cv(c)), 'battlefield'); face = cs.length < k && yesNo(G, P, X.src, `Batroc also deals ${n} damage to ${O.name}?`, true); }
    else { cs = foes.filter((c) => L.lethalTo(c) <= n && !has(c, 'indestructible')).sort((a, b) => cv(b) - cv(a)).slice(0, k); face = cs.length < k; }
    for (const c of cs) dealDamage(G, X, { c }, n);
    if (face) dealDamage(G, X, { p: O.i }, n);
  }, { score: () => 1 })];
  return d;
};
S['Firebird, Blazing Ranger'] = (d) => {
  d.trig.push(T('attack', { self: true, run: (G, X) => { const n = Math.max(0, pow(X.src)); if (n) for (const c of attackingNow(G, X.P)) if (c !== X.src) pump(G, c, n, 0); } }));
  return d;
};
S['Franklin Richards, Ascendant'] = (d) => { d.trig.push(ncCombat({ run: (G, X) => discover(G, X.P, 6) })); return d; };
S['Human Torch'] = (d) => {
  d.trig.push(ncCombat({ run: (G, X) => kwOnce(G, X.src, ['flying', 'double strike', 'haste']) }));
  // Paying {R}{G}{W}{U} copies his damage to each other opponent: there's no other opponent in a duel
  return d;
};
S['Into the Time Vortex'] = (d) => { d.spell = [rebound()]; cascade(d); d.castScore = () => 3; d.role = 'value'; return d; };
S['Killmonger, Ruthless Usurper'] = (d) => {
  d.trig.push(T('attack', { self: true, run: (G, X) => { const n = nArts(X.O); if (n) pump(G, X.src, n, 0); } }));
  d.trig.push(T('hitPlayer', { self: true, run: (G, X) => { edictOf(G, X.ev.Q, isArtifact, 'Killmonger'); treasure(G, X.P, 1); } }));
  return d;
};
S['Lady Loki, Agent of Chaos'] = (d) => {
  d.trig.push(T('cast', { you: true, cond: (G, src, ev, Q) => (isIS(ev.card.def) || villainDef(ev.card.def)) && (Q.castDefs || []).filter((x) => isIS(x) || villainDef(x)).length === 1, run: (G, X) => {
    const P = X.P, item = X.ev.item, spell = X.ev.card;
    if (item && G.stack.includes(item) && !item.countered) { item.countered = true; if (!spell.isCopy && spell.id > 0) spell.fbExile = true; say(G, P, `Lady Loki exiles ${spell.def.name}.`, [spell.id]); }
    const shown = [];
    let hit = null;
    while (P.library.length) { const c = P.library.pop(); shown.push(c); if (!isLand(c)) { hit = c; break; } }
    if (!shown.length) return;
    P.exile.push(...shown);
    dirty(G);
    emit(G, 'exile', `${P.name} exiles ${nameList(shown)} from the top of their library.`, { who: P.i, cards: shown.map((c) => c.id) });
    if (!hit) return;
    const n = Math.abs(spell.def.mv - hit.def.mv);
    if (n) for (const Q of G.players) if (Q !== P) { const got = L.damagePlayer(G, Q, n, X.src, P); if (got) emit(G, 'hit', `Lady Loki deals ${got} damage to ${Q.name}.`, { who: P.i, card: X.src.id, target: `p${Q.i}`, amount: got }); }
    P.xcast.push({ card: hit, until: G.turn, free: true });
    castNow(G, P, hit, { free: true });
    P.xcast = P.xcast.filter((x) => x.card !== hit);
  } }));
  return d;
};
S['Living Laser'] = (d) => {
  d.trig.push(T('attack', { self: true, run: (G, X) => {
    const n = L.discardsThisTurn(G, X.P);
    for (let k = 0; k < n && G.combat; k++) {
      const t = copyToken(G, X.P, X.src, { nonLegendary: true }, { tapped: true });
      t.attacking = true;
      G.combat.attackers.push(t);
      atEnd(G, { tok: t }, function (GG) { if (onBf(GG, this.tok)) exilePermanent(GG, GG.players[this.tok.ctrl], this.tok); });
    }
    if (n) say(G, X.P, `${X.P.name} creates ${n} token cop${n === 1 ? 'y' : 'ies'} of Living Laser, tapped and attacking.`);
  } }));
  return d;
};
S["Loki's Scepter"] = (d) => {
  d.etb = [fn((G, X, t) => { const c = t && t.c; if (!c || !onBf(G, c)) return; L.coreKit.borrow(G, X, c); if (onBf(G, c) && !hasSub(c, 'Villain')) giveType(G, c, 'Villain'); },
    { tgt: { f: {} }, val: L.coreKit.borrowVal, label: 'Gain control of a creature until end of turn' })];
  d.mana = ANY.slice();
  d.castScore = (G, P) => (G.active === P.i ? 0 : -3);
  return d;
};
S['Nova Flame'] = (d) => {
  const hurt = (G, P, c, n) => allCreatures(G).filter((o) => o !== c && !has(o, 'indestructible') && L.lethalTo(o) <= n).reduce((s, o) => s + (o.ctrl === P.i ? -cv(o) : cv(o)), 0);
  d.spell = [fn((G, X, t) => {
    const c = t && t.c;
    if (!c || !onBf(G, c)) return;
    addCounters(G, c, X.x || 0);
    const n = Math.max(0, pow(c));
    for (const o of allCreatures(G).filter((x) => x !== c)) dealDamage(G, Object.assign({}, X, { src: c }), { c: o }, n);
  }, { tgt: { f: YOU }, val: (G, P, c, X) => hurt(G, P, c, Math.max(0, pow(c)) + ((X && X.x) || 0)) + ((X && X.x) || 0) * 0.5, label: 'Choose a creature you control' })];
  d.aiX = (G, P, card, max) => (max >= 1 ? max : null);
  d.role = 'sweeper';
  return d;
};
S['Photon, Mighty Marvel'] = (d) => {
  d.trig.push(T('hitPlayer', { self: true, run: (G, X) => {
    const P = X.P, n = X.ev.n;
    if (n <= 0) return;
    const want = {};
    for (const c of P.hand) for (const col of ANY) want[col] = (want[col] || 0) + (c.def.cost[col] || 0);
    const best = ANY.slice().sort((a, b) => (want[b] || 0) - (want[a] || 0))[0];
    const col = isHuman(G, P) ? ANY[chooseMode(G, P, X.src, `Photon: add ${n} mana of which color?`, ['White', 'Blue', 'Black', 'Red', 'Green'], ANY.indexOf(best))] : best;
    L.addPool(G, P, Array(n).fill(col));
    say(G, P, `${P.name} adds ${n} ${({ W: 'white', U: 'blue', B: 'black', R: 'red', G: 'green' })[col]} mana; it stays until end of turn.`, [X.src.id]);
  } }));
  return d;
};
S['Puppet Master, String Puller'] = (d) => {
  d.trig.push(T('attacks', { you: true, eff: [fn((G, X, t) => { const c = t && t.c; if (!c || !onBf(G, c)) return; goad(G, X.P, c); c.tf.cantBlock = true; dirty(G); },
    { tgt: { f: OPP }, val: (G, P, c) => 0.5 + cv(c) * 0.3 + (c.tapped ? -0.4 : 0), label: 'Goad a creature an opponent controls; it can\'t block this turn' })] }));
  // Its Treasure comes from goaded creatures hitting another opponent: none in a duel
  return d;
};
S['Seize the Day'] = (d) => {
  d.spell = [{ k: 'untapP', tgt: { f: YOU } }, fn((G, X) => { G.extraMain = true; say(G, X.P, 'There is an additional combat phase and main phase after this one.'); },
    { score: (G, P, X, ctx) => { if (ctx !== 'main2' || G.active !== P.i) return -1; const ready = P.bf.filter((c) => isCreature(c) && !c.tapped && L.canAttackNow(G, c)); return ready.reduce((s, c) => s + Math.max(0, pow(c)), 0) * 0.4 + 0.5; } })];
  d.role = 'value';
  return d;
};
S['She-Hulk, Wallbreaker'] = (d) => {
  d.statics.push({ who: 'all', f: { side: 'you', sub: 'Hero', other: true }, p: 0, t: 0, kw: ['trample'] });
  d.trig.push(T('blocked', { you: true, cond: (G, src, ev) => isHero(ev.c), run: (G, X) => addCounters(G, X.ev.c, X.ev.by.length) }));
  return d;
};
S['Superior Foes of Spider-Man'] = (d) => {
  d.trig.push(T('cast', { you: true, cond: (G, src, ev) => ev.card.def.mv >= 4, may: true, mayLabel: 'Exile the top card of your library? You may play it until you exile another with Superior Foes.', run: (G, X) => {
    const P = X.P, c = P.library.pop();
    if (!c) return;
    P.exile.push(c);
    P.xcast = P.xcast.filter((x) => x.foes !== X.src.id);
    P.xcast.push({ card: c, until: 1e9, foes: X.src.id });
    dirty(G);
    emit(G, 'exile', `${P.name} exiles ${c.def.name} from the top of their library; they may play it.`, { who: P.i, cards: [c.id] });
  } }));
  return d;
};
S['Titania, Proud Pummeler'] = (d) => { d.trig.push(T('attack', { you: true, run: (G, X) => meleeOf(G, X.ev.c) })); return d; };
S['Stilt-Man, Towering Terror'] = (d) => {
  d.trig.push(T('combatDamagedYou', { cond: (G, src, ev, Q) => ev.P !== Q && ev.cs.some((c) => c.ctrl === Q.i && hasSub(c, 'Villain')), eff: [fn((G, X, t) => {
    const c = t && t.c;
    if (!c || !onBf(G, c)) return;
    gainControl(G, X.P, c, 'until', X.src);
    if (c.ctrlFx) c.ctrlFx.until = untilMyNextEnd(G, X.P);
  }, { tgt: { f: { types: ['any'], side: 'opp', fn: (G, c) => !isCreature(c) && !isLand(c) } }, val: (G, P, c) => pv(G, c), label: 'Gain control of a noncreature, nonland permanent until the end of your next turn' })] }));
  return d;
};

/* ============================================================ Green */
S['Ancestral Communion'] = (d) => {
  d.spell = [{ k: 'regrow', tgt: { what: 'gy', mine: true, f: { types: ['permanent'] } } }];
  d.onCast = (G, P, item) => { if (hasCmdr(P) && !item.card.isCopy) copySpell(G, P, item); };
  d.role = 'value';
  return d;
};
S['Fight for the Throne'] = (d) => {
  d.spell = [fightE('Put a +1/+1 counter on your creature; it fights one you don\'t control', (G, X, a, b, when) => {
    if (when === 'before') { addCounters(G, a, 1); X.src.mem.throneId = b.id; turnTrig(G, X.P, X.src, T('die', { cond: (GG, src, ev, Q) => !!ev.c && ev.c.id === src.mem.throneId && hasCmdr(Q), run: (GG, XX) => { XX.src.mem.throneId = 0; becomeMonarch(GG, XX.P); } })); }
  })];
  d.role = 'removal';
  return d;
};
S['Greater Good'] = (d) => {
  const doom = (G, c) => { const fc = combatDoom(G); return !!fc && fc.dead.has(c); };
  d.acts.push({ cost: { sac: { f: { types: ['Creature'] }, label: 'Sacrifice a creature', prefer: (G, c) => (doom(G, c) ? 100 : 0) + pow(c) - cv(c) * 0.5 } }, label: 'Draw cards equal to its power, then discard three cards', when: ['blocks', 'end'],
    run: (G, X) => { const s = (X.sacd || [])[0]; drawN(G, X.P, s ? Math.max(0, s.pow) : 0); discardE(G, X.P, 3); },
    ai: (G, P, c, when) => { if (when !== 'blocks') return null; const fc = combatDoom(G); const x = fc && P.bf.filter((y) => isCreature(y) && fc.dead.has(y) && pow(y) >= 4)[0]; return x ? { score: pow(x) - 3 + 0.5 } : null; } });
  d.role = 'draw';
  return d;
};
S['Loyal Guardian'] = (d) => {
  d.trig.push(T('combatStart', { you: true, cond: (G, src, ev, Q) => hasCmdr(Q), run: (G, X) => L.mshKit.ctrEach(G, X.P.bf.filter(isCreature), 1) }));
  return d;
};
S["M'Baku, Jabari Chieftain"] = (d) => {
  d.trig.push(T('endStep', { you: true, cond: (G, src, ev) => ev.nth === 1 && noMonarch(G), run: (G, X) => becomeMonarch(G, X.O) }));
  d.trig.push(T('attack', { you: true, cond: (G, src, ev, Q) => G.monarch === other(G, Q).i, run: (G, X) => pump(G, X.ev.c, 1, 1, ['trample']) }));
  return d;
};
S['Medusa, Inhuman Queen'] = (d) => { d.trig.push(T('cast', { cond: (G, src, ev) => nonCreDef(ev.card.def), run: (G, X) => addCounters(G, X.src, 1) })); return d; };
S['Nakia, Wakandan Operative'] = (d) => {
  d.trig.push(cmdEnters({ eff: [monarchE()] }));
  d.acts.push({ cost: { m: C('{2}'), tap: true }, sorcery: true, label: 'Put two +1/+1 counters on a creature or Vehicle', when: ['main1', 'main2'],
    eff: [{ k: 'ctrs', n: 2, tgt: { f: { types: ['Creature', 'Vehicle'], side: 'you' } } }], ai: (G, P, c, when) => (when === 'main2' || !P.bf.some((x) => isCreature(x) && x !== c && L.canAttackNow(G, x)) ? { score: 1.6 } : null) });
  return d;
};
S['Terramorph'] = (d) => { d.spell = [fn((G, X) => fetchBasic(G, X.P, false), { score: rampVal }), rebound()]; d.role = 'ramp'; return d; };
S['Wakanda Forever!'] = (d) => {
  d.spell = [fn((G, X) => {
    const P = X.P, top = P.library.splice(Math.max(0, P.library.length - 6)).reverse();
    if (!top.length) return;
    emit(G, 'reveal', `${P.name} reveals ${nameList(top)}.`, { who: P.i, cards: top.map((c) => c.id) });
    const perms = () => top.filter((c) => !isIS(c.def) && !rest.has(c));
    const rest = new Set();
    const a = isHuman(G, P) ? pickSome(G, P, perms(), 0, 1, 'Put a permanent card onto the battlefield with an indestructible counter', (c) => c.def.value, 'library')[0] : perms().filter((c) => !isLand(c)).sort((x, y) => y.def.value - x.def.value)[0] || perms()[0];
    if (a) { rest.add(a); emit(G, 'enter', `${P.name} puts ${a.def.name} onto the battlefield with an indestructible counter.`, { who: P.i, cards: [a.id] }); putOntoBattlefield(G, P, a, { ctr: { indestructible: 1 } }); }
    const b = isHuman(G, P) ? pickSome(G, P, perms(), 0, 1, 'Put a permanent card into your hand', (c) => c.def.value, 'library')[0] : perms().sort((x, y) => y.def.value - x.def.value)[0];
    if (b) { rest.add(b); P.hand.push(b); emit(G, 'raise', `${P.name} puts ${b.def.name} into their hand.`, { who: P.i, cards: [b.id] }); }
    const gy = top.filter((c) => !rest.has(c));
    P.gy.push(...gy);
    dirty(G);
    if (gy.length) emit(G, 'mill', `${nameList(gy)} go${gy.length === 1 ? 'es' : ''} to the graveyard.`, { who: P.i, cards: gy.map((c) => c.id) });
  }, { score: () => 5 })];
  d.role = 'value';
  return d;
};
S["W'Kabi, Shield of the Nation"] = (d) => {
  d.trig.push(T('attacks', { you: true, cond: (G, src, ev, Q) => ev.cs.some(isCommander) && hasArtMv(Q, 4), eff: [mkE(RHINO, 1)] }));
  return d;
};
S['Zuri, Warrior of Wakanda'] = (d) => {
  d.trig.push(T('cast', { you: true, cond: (G, src, ev) => artSpell(ev, 4), run: (G, X) => L.mshKit.ctrEach(G, X.P.bf.filter(isCreature), 1) }));
  return d;
};
S["It's Clobberin' Time!"] = (d) => {
  d.modes = [
    { label: 'Your creature deals damage equal to its power to one an opponent controls', eff: [biteE(), rebound()] },
    { label: 'Destroy target artifact or enchantment', eff: [{ k: 'destroyP', tgt: { f: { types: ['Artifact', 'Enchantment'] } } }, rebound()] },
  ];
  d.spell = null;
  d.role = 'removal';
  return d;
};
S['The Thing'] = (d) => {
  d.trig.push(ncCombat({ run: (G, X) => addCounters(G, X.src, 4) }));
  d.trig.push(T('attack', { self: true, cond: (G, src, ev, Q) => canPay(Q, C('{R}{G}{W}{U}'), { ability: true, src }), run: (G, X) => {
    const P = X.P, cs = P.bf.filter((c) => hasCtrs(c) && (c.cnt > 0 || Object.keys(c.ctr || {}).some((k) => c.ctr[k] > 0 && !['stun', 'finality', 'lore'].includes(k))));
    if (!cs.length || !mayPay(G, P, X.src, '{R}{G}{W}{U}', 'Pay {R}{G}{W}{U} to double the counters on your permanents?', cs.reduce((s, c) => s + Math.max(0, c.cnt), 0) >= 3)) return;
    const pick = isHuman(G, P) ? pickSome(G, P, cs, 0, cs.length, 'Double the counters on any number of permanents you control', (c) => c.cnt, 'battlefield') : cs.filter((c) => c.cnt > 0);
    for (const c of pick) {
      if (!onBf(G, c)) continue;
      if (c.cnt > 0) addCounters(G, c, c.cnt);
      for (const [k, n] of Object.entries(Object.assign({}, c.ctr))) if (n > 0 && !['stun', 'finality', 'lore'].includes(k)) addCounters(G, c, n, k);
    }
  } }));
  return d;
};
S['Fleecemane Lion'] = (d) => {
  d.acts.push({ cost: { m: C('{3}{G}{W}') }, label: 'Monstrosity 1', when: ['end', 'main1'], cond: (G, P, c) => !c.mem.monstrous,
    run: (G, X) => { if (X.src.mem.monstrous) return; X.src.mem.monstrous = true; addCounters(G, X.src, 1); say(G, X.P, 'Fleecemane Lion becomes monstrous: hexproof and indestructible.', [X.src.id]); },
    ai: () => ({ score: 2.2 }) });
  d.statics.push({ who: 'self', cond: (G, src) => !!src.mem.monstrous, p: 0, t: 0, kw: ['hexproof', 'indestructible'] });
  return d;
};
S['Flame On!'] = (d) => {
  const n = (P, self) => P.gy.filter((c) => c !== self && !isCreCard(c) && !isLand(c)).length;
  d.spell = [fn((G, X, t) => { const c = t && t.c; if (!c || !onBf(G, c)) return; addCounters(G, c, n(X.P, X.src)); kwOnce(G, c, ['flying']); },
    { tgt: { f: {} }, val: (G, P, c) => (c.ctrl === P.i ? 0.5 + n(P, null) * 0.9 : -2), score: (G, P) => n(P, null) * 0.9, label: 'Choose a creature' }), rebound()];
  return d;
};

/* ============================================================ Multicolor */
S['Annie Joins Up'] = (d) => {
  d.etb = [{ k: 'dmgX', nFn: () => 5, tgt: { f: { side: 'opp', types: ['Creature', 'Planeswalker'] } } }];
  d.legendEcho = true;
  d.role = 'value';
  return d;
};
S['Ant-Man, Elusive Avenger'] = (d) => {
  d.blockOnlyBy = (G, b, a) => pow(b) <= pow(a);
  d.trig.push(T('hitPlayer', { self: true, run: (G, X) => treasure(G, X.P, X.ev.n) }));
  return d;
};
S['Archnemesis'] = (d) => {
  // Enchant opponent: in a duel it's always on the one opponent, so it's played as an enchantment
  d.aura = null;
  d.trig.push(T('attacks', { you: true, run: (G, X) => { loseLife(G, X.O, 2, X.P.i); drawN(G, X.P, 1); gain(G, X.P, 2); } }));
  d.role = 'value';
  return d;
};
S['Bast, Panther Goddess'] = (d) => {
  d.statics.push({ who: 'self', cond: (G, src, P) => count(P, isCreature) < 3, p: 0, t: 0, kw: [], flags: { cantAttack: true, cantBlock: true } });
  d.trig.push(T('attacks', { you: true, eff: [{ k: 'pumpT', pFn: (G, X) => count(X.P, isCreature), tFn: (G, X) => count(X.P, isCreature), tgt: { f: { side: 'you', attacking: true } } }] }));
  return d;
};
S['Black Bolt, Inhuman King'] = (d) => {
  d.trig.push(T('cast', { you: true, cond: (G, src, ev) => nonCreDef(ev.card.def), run: (G, X) => pump(G, X.src, 2, 2) }));
  d.trig.push(T('targeted', { cond: (G, src, ev, Q) => ev.c === src && !!ev.by && ev.by !== Q, eff: [{ k: 'destroyP', tgt: { f: { types: ['nonland'], side: 'opp' } } }] }));
  return d;
};
S['Black Widow, Agile Avenger'] = (d) => {
  d.trig.push(T('draw', { opp: true, cond: (G, src, ev) => ev.nth === 2, run: (G, X) => { addCounters(G, X.src, 1); drawN(G, X.P, 1); } }));
  return d;
};
S['Captain America, Team Leader'] = (d) => {
  d.trig.push(T('enter', { you: true, other: true, cond: (G, src, ev) => isCreature(ev.c) && isHero(ev.c), run: (G, X) => {
    const c = X.ev.c;
    if (onBf(G, c)) { kwOnce(G, c, ['vigilance', 'haste']); addCounters(G, c, 1); }
    if (onBf(G, X.src)) addCounters(G, X.src, 1);
  } }));
  return d;
};
S['Captain Marvel, Apex Avenger'] = (d) => {
  d.trig.push(T('counters', { you: true, cond: (G, src, ev) => ev.c !== src && isCreature(ev.c) && !hasSub(ev.c, 'Kree') && !['-1/-1', 'stun', 'finality', 'lore', 'plan'].includes(ev.kind) && ev.n > 0,
    may: true, mayLabel: 'Put the same counters on Captain Marvel?', run: (G, X) => { if (onBf(G, X.src)) addCounters(G, X.src, X.ev.n, X.ev.kind); } }));
  return d;
};
S['Cosmic Crucible'] = (d) => {
  d.trig.push(T('mainStart', { you: true, run: (G, X) => {
    const P = X.P, want = {};
    for (const c of P.hand) for (const col of ANY) want[col] = (want[col] || 0) + (c.def.cost[col] || 0);
    const order = ANY.slice().sort((a, b) => (want[b] || 0) - (want[a] || 0));
    let cols;
    if (isHuman(G, P)) {
      const k = chooseMode(G, P, X.src, 'Cosmic Crucible: add four mana', ['One each of the colors your hand needs most', 'Four white', 'Four blue', 'Four black', 'Four red', 'Four green'], 0);
      cols = k ? Array(4).fill(ANY[k - 1]) : [0, 1, 2, 3].map((i) => order[i % Math.max(1, order.filter((c) => want[c] > 0).length || 1)]);
    } else cols = [0, 1, 2, 3].map((i) => order[i % Math.max(1, order.filter((c) => want[c] > 0).length || 1)]);
    L.addPool(G, P, cols);
    say(G, P, `${P.name} adds four mana (Cosmic Crucible).`, [X.src.id]);
  } }));
  d.trig.push(T('cast', { you: true, cond: (G, src, ev) => nonCreDef(ev.card.def) && src.mem.copyTurn !== G.turn && !ev.card.isCopy && ev.card.id > 0, may: true, mayLabel: 'Copy that spell (Cosmic Crucible)?',
    mayAi: (G, X) => !X.ev.card.def.supertypes.includes('Legendary') && !(X.ev.card.def.spell || []).some((e) => e.k === 'counter'),
    run: (G, X) => { if (X.src.mem.copyTurn === G.turn || !X.ev.item) return; X.src.mem.copyTurn = G.turn; copySpell(G, X.P, X.ev.item); } }));
  d.role = 'ramp';
  return d;
};
S['Crystal, Inhuman Princess'] = (d) => {
  d.mana = ['R', 'G', 'W', 'U'];
  d.trig.push(T('cast', { you: true, cond: (G, src, ev) => nonCreDef(ev.card.def) && ev.card.def.colors.length > 0, run: (G, X) => hitOpp(G, X, X.ev.card.def.colors.length) }));
  return d;
};
S['Director Nick Fury'] = (d) => {
  d.spellDiscount = (G, P, card) => (heroDef(card.def) ? 1 : 0);
  d.trig.push(T('attacks', { you: true, run: (G, X) => L.lookAtTop(G, X.P, 4, (c) => heroDef(c.def), 1, 'Reveal a Hero card') }));
  return d;
};
S['Doctor Doom, King of Latveria'] = (d) => {
  // "Whenever you discard one or more land cards": once for each batch of discards
  d.trig.push(T('discard', { you: true, doomLands: true, cond: (G, src, ev) => !!ev.card && isLand(ev.card) && !(G.pending || []).some((p) => p.src === src && p.t && p.t.doomLands),
    run: (G, X) => { for (const Q of G.players) if (Q !== X.P) loseLife(G, Q, 2, X.P.i); } }));
  d.trig.push(T('combatStart', { you: true, eff: [fn((G, X, t) => { const c = t && t.c; if (!c || !onBf(G, c)) return; kwOnce(G, c, ['menace']); connive(G, X.P, c); },
    { tgt: { f: { side: 'you', sub: 'Villain' } }, val: (G, P, c) => 1 + (has(c, 'menace') ? 0 : 0.4) + (c.tapped ? 0 : 0.3), label: 'Choose a Villain you control: it gains menace and connives' })] }));
  return d;
};
S['Dragon Man, Reformed Robot'] = (d) => {
  d.powFn = (G, c) => { const P = G.players[c.ctrl]; return Math.max(0, ...P.bf.filter((x) => !isCreature(x)).map((x) => x.def.mv), ...P.gy.filter((x) => !isCreCard(x)).map((x) => x.def.mv)); };
  d.gyDiscard = true;
  return d;
};
S['Expressive Iteration'] = (d) => {
  d.spell = [fn((G, X) => {
    const P = X.P, top = P.library.splice(Math.max(0, P.library.length - 3)).reverse();
    if (!top.length) return;
    const lands = P.bf.filter(isLand).length + P.hand.filter(isLand).length;
    const rank = (c) => (isLand(c) ? (lands < 5 ? 3 : 0.5) : c.def.value);
    let hand, ex;
    if (isHuman(G, P)) {
      hand = pickOne(G, P, top, 'Put one into your hand', rank, 'choose', 'library');
      const left = top.filter((c) => c !== hand);
      ex = left.length > 1 ? pickOne(G, P, left, 'Exile one (you may play it this turn)', rank, 'choose', 'library') : left[0];
    } else {
      const s = top.slice().sort((a, b) => rank(b) - rank(a));
      hand = s[0];
      ex = s.slice(1).find((c) => (isLand(c) ? P.landsPlayed < L.landLimit(G, P) : canPay(P, L.castCost(P, c), { def: c.def }))) || s[1];
    }
    const bottom = top.filter((c) => c !== hand && c !== ex);
    if (hand) P.hand.push(hand);
    if (ex) { P.exile.push(ex); P.xcast.push({ card: ex, until: G.turn }); }
    P.library.unshift(...bottom);
    dirty(G);
    emit(G, 'search', `${P.name} looks at the top three cards: one to hand${ex ? `, ${ex.def.name} exiled (playable this turn)` : ''}${bottom.length ? ', one to the bottom' : ''}.`, { who: P.i, cards: ex ? [ex.id] : [] });
  }, { score: () => 1.6 })];
  d.role = 'draw';
  return d;
};
S['First Family'] = (d) => {
  const nCol = (P) => { const s = new Set(); for (const c of P.bf) for (const col of c.def.colors) s.add(col); for (const x of P.castDefs || []) for (const col of x.colors) s.add(col); return s.size; };
  d.spell = [fn((G, X) => { const n = nCol(X.P); drawN(G, X.P, n); gain(G, X.P, n); }, { score: (G, P) => Math.max(2, nCol(P)) * 1.2 })];
  d.role = 'draw';
  return d;
};
S['Galvanic Iteration'] = (d) => {
  d.spell = [fn((G, X) => { X.P.copyNext = { turn: G.turn, n: 1 }; say(G, X.P, `The next instant or sorcery spell ${X.P.name} casts this turn will be copied.`); },
    { score: (G, P) => (P.hand.some((c) => isIS(c.def) && c.def.name !== 'Galvanic Iteration' && canPay(P, L.castCost(P, c), { def: c.def })) ? 1.5 : -1) })];
  d.castIf = (G, P) => G.active === P.i;
  d.role = 'value';
  return d;
};
S['Genesis Ultimatum'] = (d) => {
  d.spell = [fn((G, X) => {
    const P = X.P, top = P.library.splice(Math.max(0, P.library.length - 5)).reverse();
    if (!top.length) { exileSelf(G, X); return; }
    const perms = top.filter((c) => !isIS(c.def));
    const put = isHuman(G, P) ? pickSome(G, P, perms, 0, perms.length, 'Put any number of permanent cards onto the battlefield (the rest go to your hand)', (c) => c.def.value, 'library') : perms;
    for (const c of put) { emit(G, 'enter', `${P.name} puts ${c.def.name} onto the battlefield.`, { who: P.i, cards: [c.id] }); putOntoBattlefield(G, P, c); }
    const rest = top.filter((c) => !put.includes(c));
    P.hand.push(...rest);
    if (rest.length) emit(G, 'raise', `${P.name} puts ${nameList(rest)} into their hand.`, { who: P.i, cards: rest.map((c) => c.id) });
    dirty(G);
    exileSelf(G, X);
  }, { score: () => 8 })];
  d.role = 'value';
  return d;
};
S['Hawkeye, Avenging Archer'] = (d) => {
  d.pinger = { n: 1, to: 'any' };
  // Remember what Hawkeye damaged this turn (noted as it happens, so the death that follows can check it)
  d.trig.push(T('dmgCreature', { cond: (G, src, ev) => { if (ev.src === src && ev.c) { const h = src.mem.hurt && src.mem.hurt.turn === G.turn ? src.mem.hurt : (src.mem.hurt = { turn: G.turn, ids: [] }); h.ids.push(ev.c.id); } return false; } }));
  d.trig.push(T('die', { opp: true, cond: (G, src, ev) => !!src.mem.hurt && src.mem.hurt.turn === G.turn && src.mem.hurt.ids.includes(ev.c.id), eff: [{ k: 'draw', n: 1 }] }));
  return d;
};
S['Hull Breach'] = (d) => {
  d.modes = [
    { label: 'Destroy target artifact', eff: [{ k: 'destroyP', tgt: { f: { types: ['Artifact'] } } }] },
    { label: 'Destroy target enchantment', eff: [{ k: 'destroyP', tgt: { f: { types: ['Enchantment'] } } }] },
    { label: 'Destroy target artifact and target enchantment', eff: [{ k: 'destroyP', tgt: { f: { types: ['Artifact'] } } }, { k: 'destroyP', tgt: { f: { types: ['Enchantment'] } } }] },
  ];
  d.spell = null;
  d.role = 'removal';
  return d;
};
S['Kang Prime'] = (d) => {
  const kang = (G, X) => {
    const P = X.P, shown = [];
    let hit = null;
    while (P.library.length) { const c = P.library.pop(); shown.push(c); if (!isLand(c)) { hit = c; break; } }
    if (!shown.length) return;
    P.exile.push(...shown);
    dirty(G);
    emit(G, 'exile', `${P.name} exiles ${nameList(shown)} from the top of their library.`, { who: P.i, cards: shown.map((c) => c.id) });
    if (hit) suspend(G, P, hit, 2);
  };
  d.etb = [fn(kang, { score: () => 2 })];
  d.trig.push(T('attack', { self: true, run: kang }));
  return d;
};
S['Loki, the Deceiver'] = (d) => {
  d.trig.push(T('attack', { self: true, eff: [fn((G, X, t) => {
    const c = t && t.c;
    if (!c || !onBf(G, c) || !G.combat) return;
    const k = copyToken(G, X.P, c, { nonLegendary: true, def: { sub: c.def.sub.includes('Illusion') ? c.def.sub : c.def.sub.concat('Illusion') } }, { tapped: true });
    k.attacking = true;
    G.combat.attackers.push(k);
    emit(G, 'token', `${X.P.name} creates a token copy of ${c.def.name}, tapped and attacking.`, { who: X.P.i, cards: [k.id] });
    atEnd(G, { tok: k }, function (GG) { if (onBf(GG, this.tok)) { const Q = GG.players[this.tok.ctrl]; emit(GG, 'sac', `${Q.name} sacrifices ${this.tok.def.name}.`, { who: Q.i, cards: [this.tok.id] }); sacrifice(GG, Q, this.tok, true); } });
  }, { tgt: { f: { side: 'you', sub: 'Villain', other: true } }, val: (G, P, c) => c.def.value + Math.max(0, pow(c)) * 0.3, label: 'Copy another Villain you control' })] }));
  d.trig.push(T('combatDamagedYou', { cond: (G, src, ev, Q) => ev.P !== Q && ev.cs.some((c) => c.ctrl === Q.i && hasSub(c, 'Villain')), eff: [{ k: 'draw', n: 1 }] }));
  return d;
};
S['Love on the Battlefield'] = (d) => {
  d.trig.push(T('attacks', { you: true, cond: (G, src, ev) => ev.cs.length === 2, run: (G, X) => {
    for (const c of X.ev.cs) if (onBf(G, c)) { c.mem.loveTurn = G.turn; c.mem.loveBy = X.src.id; kwOnce(G, c, ['first strike']); }
    drawN(G, X.P, 1);
  } }));
  d.trig.push(T('hitPlayer', { you: true, cond: (G, src, ev) => !!ev.c && ev.c.mem.loveTurn === G.turn && ev.c.mem.loveBy === src.id, run: (G, X) => addCounters(G, X.ev.c, 1) }));
  d.role = 'value';
  return d;
};
S['Namor, Atlantean King'] = (d) => {
  d.trig.push(T('cast', { you: true, cond: (G, src, ev) => nonCreDef(ev.card.def), eff: [mkE(MERFOLK, 1)] }));
  d.trig.push(T('attack', { self: true, cond: (G, src, ev, Q) => other(G, Q).life > Q.life, run: (G, X) => { for (const c of attackingNow(G, X.P)) if (c !== X.src) pump(G, c, 2, 0); } }));
  return d;
};
S['Okoye, Mighty and Adored'] = (d) => {
  d.etb = [monarchE()];
  d.trig.push(T('combatStart', { you: true, eff: [fn((G, X, t) => { const c = t && t.c; if (!c || !onBf(G, c)) return; addCounters(G, c, 1); c.mem.okoyeTurn = G.turn; },
    { tgt: { f: {} }, val: (G, P, c) => (c.ctrl === P.i ? 0.9 + (L.canAttackNow(G, c) ? 0.5 : 0) : -1), label: 'Put a +1/+1 counter on a creature' })] }));
  d.trig.push(T('attack', { you: true, cond: (G, src, ev, Q) => ev.c.mem.okoyeTurn === G.turn && G.monarch === other(G, Q).i, run: (G, X) => kwOnce(G, X.ev.c, ['double strike', 'trample']) }));
  return d;
};
S['Power Pack'] = (d) => {
  d.trig.push(T('hitPlayer', { self: true, cond: (G, src, ev, Q) => Q.gy.some((c) => isIS(c.def)), run: (G, X) => {
    const P = X.P, cs = P.gy.filter((c) => isIS(c.def));
    if (!cs.length) return;
    const c = cs[G.rng.int(cs.length)];
    P.gy.splice(P.gy.indexOf(c), 1); P.exile.push(c); dirty(G);
    emit(G, 'exile', `${P.name} exiles ${c.def.name} from their graveyard at random; they may cast it at their next upkeep.`, { who: P.i, cards: [c.id] });
    atMyUpkeep(G, P, c, (GG, XX, card) => {
      const Q = XX.P;
      if (!card || !Q.exile.includes(card)) return;
      Q.xcast.push({ card, until: GG.turn, free: true, exileAfter: true });
      if (!castNow(GG, Q, card, { free: true })) Q.xcast = Q.xcast.filter((x) => x.card !== card);
    });
  } }));
  return d;
};
S['Prowler, Clawed Thief'] = (d) => { d.trig.push(villainEnters({ run: (G, X) => connive(G, X.P, X.src) })); return d; };
S['Quicksilver, Speedster'] = (d) => { d.flashFor = (def, G, P, c) => c.tapped; return d; };
S['Red Ghost, Intangible Genius'] = (d) => {
  d.unblockable = true;
  d.trig.push(T('draw', { you: true, cond: (G, src, ev) => ev.nth === 2, eff: [mkE(APE, 1)] }));
  return d;
};
S['Rip Apart'] = (d) => {
  d.modes = [
    { label: 'Rip Apart deals 3 damage to target creature or planeswalker', eff: [{ k: 'dmgX', nFn: () => 3, tgt: { f: { types: ['Creature', 'Planeswalker'] } } }] },
    { label: 'Destroy target artifact or enchantment', eff: [{ k: 'destroyP', tgt: { f: { types: ['Artifact', 'Enchantment'] } } }] },
  ];
  d.spell = null;
  d.role = 'removal';
  return d;
};
S['Scarlet Witch, Chaotic Avenger'] = (d) => {
  d.trig.push(T('hitPlayer', { self: true, run: (G, X) => {
    const P = X.P, top = P.library.splice(Math.max(0, P.library.length - 2)).reverse();
    if (top.length) { P.exile.push(...top); (X.src.mem.held = X.src.mem.held || []).push(...top); dirty(G); emit(G, 'exile', `${P.name} exiles the top ${top.length === 1 ? 'card' : 'two cards'} of their library face down.`, { who: P.i }); }
    const cs = (X.src.mem.held || []).filter((c) => P.exile.includes(c) && !isLand(c) && (heroDef(c.def) || nonCreDef(c.def)));
    const c = isHuman(G, P) ? pickSome(G, P, cs, 0, 1, 'You may cast a Hero or noncreature spell exiled with Scarlet Witch without paying its mana cost', (y) => y.def.value, 'exile')[0] : cs.slice().sort((a, b) => b.def.mv - a.def.mv)[0];
    if (!c) return;
    P.xcast.push({ card: c, until: G.turn, free: true });
    if (castNow(G, P, c, { free: true, ask: false })) X.src.mem.held = (X.src.mem.held || []).filter((x) => x !== c);
    P.xcast = P.xcast.filter((x) => x.card !== c);
  } }));
  return d;
};
S['Shang-Chi and the Ten Rings'] = (d) => {
  d.trig.push(T('draw', { you: true, run: (G, X) => addCounters(G, X.src, 1) }));
  d.trig.push(T('counters', { cond: (G, src, ev) => ev.c === src && ev.kind === '+1/+1' && src.cnt >= 10 && src.cnt - ev.n < 10, run: (G, X) => { drawN(G, X.P, 5); gain(G, X.P, 5); } }));
  return d;
};
S['Shuri, the Black Panther'] = (d) => {
  d.trig.push(T('attack', { self: true, run: (G, X) => {
    if (nArts(X.P) >= 3) drawN(G, X.P, 1);
    if (nArts(X.P) >= 6) for (const c of X.P.bf.filter(isCreature)) pump(G, c, 2, 2);
  } }));
  return d;
};
S['Storm, Queen of Wakanda'] = (d) => {
  d.trig.push(T('attack', { self: true, eff: [fn((G, X, t) => { const c = t && t.c; if (!c || !onBf(G, c)) return; pump(G, c, Math.max(0, pow(X.src)), 0, ['flying']); },
    { tgt: { f: { side: 'you', attacking: true, other: true } }, val: (G, P, c) => 1 + (has(c, 'flying') ? 0 : 1), label: 'Another attacking creature gains flying and +X/+0' })] }));
  d.trig.push(T('attack', { opp: true, cond: (G, src, ev) => has(ev.c, 'flying'), run: (G, X) => { if (onBf(G, X.src) && onBf(G, X.ev.c)) dealDamage(G, X, { c: X.ev.c }, Math.max(0, pow(X.src))); } }));
  return d;
};
S["T'Chaka, Venerable King"] = (d) => {
  d.etb = [fn((G, X) => {
    const got = mill(G, X.P, 3).filter((c) => (c.def.types.includes('Artifact') || isLand(c)) && X.P.gy.includes(c));
    const c = isHuman(G, X.P) ? pickSome(G, X.P, got, 0, 1, 'You may put an artifact or land card from among them into your hand', (y) => y.def.value, 'graveyard')[0] : got.slice().sort((a, b) => b.def.value - a.def.value)[0];
    if (c) gyToHand(G, X.P, c);
  }, { score: () => 1 })];
  d.gyActs = [{ cost: { m: C('{3}'), exileSelf: true }, label: "Exile T'Chaka from your graveyard: you become the monarch", when: ['end', 'main2'], cond: (G, P) => hasCmdr(P),
    eff: [monarchE()], ai: (G, P) => (G.monarch !== P.i ? { score: 1 + monarchVal(G, P) } : null) }];
  return d;
};
S["T'Challa, the Black Panther"] = (d) => {
  d.etb = [vibE(1)];
  d.trig.push(T('attack', { self: true, run: (G, X) => vibranium(G, X.P, 1) }));
  d.trig.push(T('cast', { you: true, cond: (G, src, ev) => artSpell(ev, 4), run: (G, X) => addCounters(G, X.src, 2) }));
  return d;
};
S['Typhoid Mary, Fractured'] = (d) => {
  const MODES = ['Mary: create a Treasure token', 'Typhoid Mary: draw a card', 'Bloody Mary: each opponent loses 2 life and you gain 2 life'];
  d.trig.push(T('attack', { self: true, run: (G, X) => {
    const P = X.P, chosen = L.discardsThisTurn(G, P) > 0;
    const k = !chosen ? G.rng.int(3) : isHuman(G, P) ? chooseMode(G, P, X.src, 'Typhoid Mary: choose one', MODES, 1) : X.O.life <= 2 ? 2 : P.hand.length < 2 ? 1 : 2;
    say(G, P, `Typhoid Mary${chosen ? '' : ' (at random)'}: ${MODES[k]}.`, [X.src.id]);
    if (k === 0) treasure(G, P, 1); else if (k === 1) drawN(G, P, 1); else { for (const Q of G.players) if (Q !== P) loseLife(G, Q, 2, P.i); gain(G, P, 2); }
  } }));
  return d;
};
S['Ultron, Unlimited'] = (d) => {
  d.trig.push(T('attack', { self: true, run: (G, X) => connive(G, X.P, X.src) }));
  d.trig.push(T('connive', { you: true, run: (G, X) => { if (mayPay(G, X.P, X.src, '{1}', 'Pay {1} to create a 2/2 Robot Villain artifact creature token?', true)) mk(G, X.P, ROBOT_VILLAIN, 1); } }));
  return d;
};
S['Whirlwind of Thought'] = (d) => { d.trig.push(T('cast', { you: true, cond: (G, src, ev) => nonCreDef(ev.card.def), eff: [{ k: 'draw', n: 1 }] })); d.role = 'draw'; return d; };
S['Willie Lumpkin, Postman'] = (d) => {
  d.unblockable = true;
  d.trig.push(T('hitPlayer', { self: true, run: (G, X) => {
    const P = X.P, Q = X.ev.Q;
    drawN(G, P, 1);
    const atk = Q.bf.filter(isCreature).reduce((s, c) => s + Math.max(0, pow(c)), 0);
    const take = isHuman(G, Q) ? yesNo(G, Q, X.src, `Draw a card? If you do, you can't attack ${P.name} during your next turn.`, false) : atk < 3 || Q.hand.length <= 1;
    if (!take) return;
    drawN(G, Q, 1);
    Q.noAttack = G.active === Q.i ? G.turn : G.turn + 1;
    say(G, Q, `${Q.name} can't attack during their next turn.`);
  } }));
  return d;
};
S['The Squadron Sinister'] = (d) => {
  d.statics.push({ who: 'all', f: { side: 'you', sub: 'Villain', other: true }, p: 2, t: 2, kw: ['flying', 'haste'] });
  d.mayhem = C('{3}{U}{R}');
  return d;
};

return S;
});
