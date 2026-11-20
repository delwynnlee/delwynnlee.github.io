/* The Lord of the Rings: Tales of Middle-earth (LTR): rules for the cards whose text the engine's reader can't
   handle on its own. Each entry gets the card's skeleton (types, cost, keywords, equip/enchant/cycling lines already
   read) and fills in the rest from the engine's shared vocabulary of effects and triggers. */
(function (root, factory) {
  const A = typeof module === 'object' && module.exports ? require('./engine.js') : root.Arena;
  const S = factory(A);
  A.registerScripts(S);
  if (typeof module === 'object' && module.exports) module.exports = S;
})(typeof self !== 'undefined' ? self : this, function (A) {
'use strict';
const L = A.lib;
const { fx, isCreature, isLand, isArtifact, isLegendary, pow, tou, has, hasSub, orcish, ctrCount, isEquipped, emit, dirty, onBf, byId, cv, pv,
  allCreatures, allPerms, other, diedThisTurn, isIS, foodsOf, legendsOf, makeTokens, FOOD, TREASURE, addCounters, removeCounters, sacrifice,
  drawCards, gainLife, chooseMode, yesNo, pickCards, isHuman, tempt, amass, mill, scryChoice, lifeW, handValue, canPay, pay, matches } = L;

/* ---------- Shorthand ---------- */
const C = (s) => L.parseCost(s);
const food = (n = 1) => ({ k: 'food', n });
const TEMPT = { k: 'tempt' };
const am = (n) => ({ k: 'amass', n });
const T = (on, o) => Object.assign({ on }, o);
const fn = (run, o) => Object.assign({ k: 'fn', run }, o);
const tg = (f, o) => Object.assign({ f: f || {} }, o);
const YOU = { side: 'you' }, OPP = { side: 'opp' };
const soldiers = (n = 1) => ({ k: 'tokens', n, p: 1, t: 1, colors: ['W'], sub: ['Human', 'Soldier'], artifact: false, kw: [] });
const FOODF = { types: ['any'], sub: 'Food' };
const TREASUREF = { types: ['any'], sub: 'Treasure' };
const ISF = { types: ['Instant', 'Sorcery'] };
const nFoods = (P) => foodsOf(P).length;
const otherBearer = (G, src, d) => !!d.c && d.c !== src;
const grantKw = (G, c, kws, say) => { kws.forEach((k) => { if (!c.tkw.includes(k)) c.tkw.push(k); }); dirty(G); emit(G, 'pump', `${c.def.name} ${say || `gains ${kws.join(' and ')} until end of turn`}.`, { who: c.ctrl, cards: [c.id] }); };
const pump = (G, c, p, t, kws = []) => { c.tp += p; c.tt += t; kws.forEach((k) => { if (!c.tkw.includes(k)) c.tkw.push(k); }); emit(G, 'pump', `${c.def.name} gets ${L.sgn(p)}/${L.sgn(t)}${kws.length ? ` and gains ${kws.join(' and ')}` : ''} until end of turn.`, { who: c.ctrl, cards: [c.id] }); };
const drawN = (G, P, n) => { if (n <= 0) return; drawCards(G, P, n); emit(G, 'draw', `${P.name} draws ${n === 1 ? 'a card' : `${n} cards`}.`, { who: P.i }); };
const loseLife = (G, Q, n, who) => { if (n <= 0) return; Q.life -= n; emit(G, 'life', `${Q.name} loses ${n} life.`, { who: who != null ? who : Q.i, target: `p${Q.i}`, amount: n }); };
const pickFood = (G, P) => foodsOf(P).sort((a, b) => (a.token ? 0 : 1) - (b.token ? 0 : 1) || a.id - b.id)[0];
// The creatures of P that the combat as it stands would kill
function dyingInCombat(G, P) {
  if (!G.combat) return [];
  const At = G.players[G.active], D = other(G, At);
  const live = G.combat.attackers.filter((c) => onBf(G, c) && c.attacking);
  if (!live.length) return [];
  const fc = L.forecast(G, D, live, new Set(), null);
  return [...fc.dead].filter((c) => c.ctrl === P.i);
}
const inCombat = (c) => c.attacking || c.blocking;
// One-shot "for as long as you control this" grants live on the source: statics that read its memory
const heldBy = (key) => ({ fn: (G, c, P, src) => !!(src.mem[key] && src.mem[key].includes(c.id)) });
const remember = (src, key, c) => { src.mem[key] = (src.mem[key] || []).concat(c.id); };

const S = {};

/* ============================ White ============================ */
const cheapIf = (test) => (G, P, c, src, X) => !(X && X.cheapOnly) || test(G, c);
S['Banish from Edoras'] = (d) => {
  d.spell = [{ k: 'exileP', tgt: { f: {}, fn: cheapIf((G, c) => c.tapped) } }];
  d.costMod = (G, P, card, tgs) => (tgs.some((t) => t && t.c && t.c.tapped) ? 2 : 0);
  return d;
};
S['The Battle of Bywater'] = (d) => {
  d.spell = [{ k: 'destroyAll', f: { powGE: 3 } }, { k: 'food', nFn: (G, X) => X.P.bf.filter(isCreature).length }];
  return d;
};
function billAi(G, P, c, when) {
  let best = null;
  for (const m of P.bf) {
    if (!isCreature(m) || !inCombat(m) || m.tf.toughDmg || tou(m) <= pow(m)) continue;
    let s = 0;
    if (m.attacking && !m.blocked) s = (tou(m) - pow(m)) * (other(G, P).life <= tou(m) ? 100 : 0.4);
    const foe = m.attacking ? m.blockedBy.filter((b) => onBf(G, b))[0] : byId(G, m.blocking);
    if (foe && pow(m) < L.lethalTo(foe) && tou(m) >= L.lethalTo(foe)) s = cv(foe);
    if (s > 0 && (!best || s > best.score)) best = { score: s - 0.4, targets: [{ c: m }] };
  }
  return best;
}
S['Bill the Pony'] = (d) => {
  d.etb = [food(2)];
  d.acts.push({ cost: { sac: FOODF }, eff: [{ k: 'grant', tgt: { f: YOU }, flags: { toughDmg: true }, say: 'deals combat damage equal to its toughness this turn' }], label: 'Damage equal to toughness', when: ['blocks'], ai: billAi });
  return d;
};
S['Boromir, Warden of the Tower'] = (d) => {
  d.trig.push(T('cast', { opp: true, cond: (G, src, ev) => ev.free, run: (G, X) => { X.ev.item.countered = true; emit(G, 'info', `${X.src.def.name} counters ${X.ev.card.def.name}: no mana was spent to cast it.`, { who: X.P.i }); } }));
  d.acts.push({ cost: { sacSelf: true }, eff: [{ k: 'pumpAll', side: 'you', p: 0, t: 0, kw: ['indestructible'] }, TEMPT], label: 'Creatures you control gain indestructible', when: ['blocks'],
    ai: (G, P, c) => { const saved = dyingInCombat(G, P).filter((x) => x !== c); const v = saved.reduce((s, x) => s + cv(x), 0); return v > cv(c) + 1 ? { score: v - cv(c) } : null; } });
  return d;
};
S['Dawn of a New Age'] = (d) => {
  d.etbCtr = (G, P) => ({ hope: P.bf.filter(isCreature).length });
  d.trig.push(T('endStep', { you: true, run: (G, X) => {
    const c = X.src;
    if (!onBf(G, c)) return;
    if (removeCounters(G, c, 'hope', 1)) drawN(G, X.P, 1);
    if (!ctrCount(c, 'hope')) { emit(G, 'sac', `${c.def.name} has no hope counters left and is sacrificed.`, { who: X.P.i, cards: [c.id] }); sacrifice(G, X.P, c, true); gainLife(G, X.P, 4); emit(G, 'life', `${X.P.name} gains 4 life.`, { who: X.P.i, target: `p${X.P.i}`, amount: -4 }); }
  } }));
  d.castIf = (G, P) => P.bf.filter(isCreature).length >= 2;
  d.castScore = (G, P) => P.bf.filter(isCreature).length * 1.1 - 2;
  d.value = 3.2;
  return d;
};
S['Eastfarthing Farmer'] = (d) => {
  d.etb = [food(1), { k: 'reflex', eff: [{ k: 'pumpT', tgt: { f: YOU }, pFn: (G, X) => nFoods(X.P), tFn: (G, X) => nFoods(X.P), label: 'Give a creature you control +1/+1 for each Food you control' }] }];
  return d;
};
S['East-Mark Cavalier'] = (d) => {
  d.trig.push(T('dmgCreature', { cond: (G, src, ev) => ev.src === src && orcish(ev.c), run: (G, X) => { if (onBf(G, X.ev.c)) L.destroyPermanent(G, X.P, X.ev.c, `to ${X.src.def.name}`); } }));
  return d;
};
S['Éowyn, Lady of Rohan'] = (d) => {
  d.trig.push(T('combatStart', { you: true, eff: [fn((G, X, t) => {
    const c = t.c;
    if (isEquipped(G, c)) { grantKw(G, c, ['first strike', 'vigilance']); return; }
    const k = chooseMode(G, X.P, X.src, `${X.src.def.name}: give ${c.def.name}`, ['First strike', 'Vigilance'], pow(c) > 0 ? 0 : 1);
    grantKw(G, c, [k ? 'vigilance' : 'first strike']);
  }, { tgt: tg({}), val: (G, P, c) => (c.ctrl === P.i ? (L.canAttackNow(G, c) ? 0.3 + cv(c) * 0.1 : 0.1) : -0.2), label: 'First strike or vigilance' })] }));
  d.equipDiscount = true;
  return d;
};
S['Errand-Rider of Gondor'] = (d) => {
  d.etb = [{ k: 'draw', n: 1 }, fn((G, X) => { if (!legendsOf(X.P).length) L.bottomFromHand(G, X.P, 1); }, { score: () => -0.3, value: -0.3 })];
  return d;
};
S['Esquire of the King'] = (d) => {
  d.acts.push({ cost: { m: C('{4}{W}'), tap: true }, costMod: (G, P) => (legendsOf(P).length ? 2 : 0), eff: [{ k: 'pumpTeam', p: 1, t: 1, kw: [] }], label: 'Creatures you control get +1/+1', when: ['main1'],
    ai: (G, P, c) => { const n = P.bf.filter((x) => x !== c && L.canAttackNow(G, x)).length; return n >= 2 ? { score: n * 0.45 } : null; } });
  return d;
};
S['Faramir, Field Commander'] = (d) => {
  d.trig.push(T('endStep', { you: true, cond: (G, src, ev, Q) => diedThisTurn(G, Q) > 0, check: (G, src, ev, Q) => diedThisTurn(G, Q) > 0, eff: [{ k: 'draw', n: 1 }] }));
  d.trig.push(T('tempt', { you: true, cond: otherBearer, eff: [soldiers(1)] }));
  return d;
};
S['Flowering of the White Tree'] = (d) => {
  d.statics.push({ who: 'all', f: { side: 'you', legendary: true }, p: 2, t: 1, kw: [], ward: 1 }, { who: 'all', f: { side: 'you', nonlegendary: true }, p: 1, t: 1, kw: [] });
  return d;
};
S['Fog on the Barrow-Downs'] = (d) => {
  d.statics.push({ who: 'enchanted', p: 0, t: 0, kw: [], sub: ['Spirit'], flags: { cantAttack: true, cantBlock: true } });
  d.value = 3.4;
  d.role = 'removal';
  return d;
};
S['Forge Anew'] = (d) => {
  d.etb = [{ k: 'regrow', to: 'bf', tgt: { what: 'gy', mine: true, f: { types: ['Equipment'] } } }];
  d.equipFast = true;
  d.equipFree = true;
  d.value = 2.4;
  return d;
};
S["Frodo, Sauron's Bane"] = (d) => {
  d.subFn = (G, c) => (c.mem.form === 'scout' ? ['Halfling', 'Scout'] : c.mem.form === 'rogue' ? ['Halfling', 'Rogue'] : null);
  d.statics.push({ who: 'self', f: { fn: (G, c) => c.mem.form === 'scout' || c.mem.form === 'rogue' }, p: 0, t: 0, kw: ['lifelink'] });
  d.acts.push({ cost: { m: C('{W/B}{W/B}') }, cond: (G, P, c) => !c.mem.form, label: 'Become a 2/3 Halfling Scout with lifelink',
    run: (G, X) => { const c = X.src; if (!onBf(G, c) || c.mem.form) return; c.mem.form = 'scout'; c.base = { p: 2, t: 3 }; dirty(G); emit(G, 'pump', `${c.def.name} becomes a 2/3 Halfling Scout with lifelink.`, { who: X.P.i, cards: [c.id] }); },
    ai: (G, P) => ({ score: 2.4 }) });
  d.acts.push({ cost: { m: C('{B}{B}{B}') }, cond: (G, P, c) => c.mem.form === 'scout', label: 'Become a Halfling Rogue',
    run: (G, X) => { const c = X.src; if (!onBf(G, c) || c.mem.form !== 'scout') return; c.mem.form = 'rogue'; dirty(G); emit(G, 'pump', `${c.def.name} becomes a Halfling Rogue. If it hits a player once the Ring has tempted ${X.P.name} four times, that player loses.`, { who: X.P.i, cards: [c.id] }); },
    ai: (G, P) => ({ score: 2.2 + P.ring.n * 0.4 }) });
  d.trig.push(T('hitPlayer', { self: true, cond: (G, src) => src.mem.form === 'rogue', run: (G, X) => {
    if (X.P.ring.n >= 4) { X.ev.Q.loseNow = true; emit(G, 'info', `${X.ev.Q.name} has been found by Frodo with the Ring: they lose the game.`, { who: X.P.i }); }
    else tempt(G, X.P);
  } }));
  d.bearerBonus = 1;
  d.value = 3.6;
  return d;
};
S['Gandalf the White'] = (d) => {
  d.flashFor = (def) => def.supertypes.includes('Legendary') || def.types.includes('Artifact');
  d.doubler = true;
  return d;
};
S["Hobbit's Sting"] = (d) => {
  d.spell = [{ k: 'dmgX', tgt: { f: {} }, nFn: (G, X) => X.P.bf.filter(isCreature).length + nFoods(X.P) }];
  return d;
};
S['Landroval, Horizon Witness'] = (d) => {
  d.trig.push(T('attacks', { you: true, cond: (G, src, ev) => ev.cs.length >= 2, eff: [{ k: 'grant', kw: ['flying'], tgt: { f: { side: 'you', attacking: true, flying: false } } }] }));
  return d;
};
S['Lost to Legend'] = (d) => {
  d.spell = [{ k: 'tuckN', pos: 4, tgt: { f: { types: ['nonland'], fn: (G, c) => isLegendary(c) || isArtifact(c) || hasSub(c, 'Saga') } } }];
  return d;
};
S['Nimble Hobbit'] = (d) => {
  d.trig.push(T('attack', { self: true, run: (G, X) => {
    const P = X.P, cost = C('{2}{W}');
    const opts = [];
    if (nFoods(P)) opts.push('food');
    if (canPay(P, cost)) opts.push('mana');
    if (!opts.length) return;
    const prey = other(G, P).bf.filter((b) => isCreature(b) && !b.tapped).sort((a, b) => cv(b) - cv(a))[0];
    const labels = opts.map((o) => (o === 'food' ? 'Sacrifice a Food' : 'Pay {2}{W}')).concat("Don't");
    const k = chooseMode(G, P, X.src, `${X.src.def.name} attacks: tap a creature?`, labels, prey && cv(prey) > 1.5 ? 0 : labels.length - 1);
    if (k >= opts.length) return;
    if (opts[k] === 'food') { const f = pickFood(G, P); emit(G, 'sac', `${P.name} sacrifices ${f.def.name}.`, { who: P.i, cards: [f.id] }); sacrifice(G, P, f, true); }
    else pay(P, cost);
    G.pending.unshift({ src: X.src, P, t: { eff: [{ k: 'tapP', tgt: { f: OPP } }] }, ev: X.ev });
  } }));
  return d;
};
S['Now for Wrath, Now for Ruin!'] = (d) => {
  d.spell = [{ k: 'countersTeam', n: 1 }, { k: 'pumpAll', side: 'you', p: 0, t: 0, kw: ['vigilance'] }, TEMPT];
  return d;
};
S['Reprieve'] = (d) => {
  d.spell = [{ k: 'noop2' }];
  d.respondOnly = true;
  d.respond = {
    legal: (G, O, item) => item.P !== O,
    ai: (G, O, item) => L.threatOf(G, O, item) * 0.75 + (item.card.def.mv >= 4 ? 1 : 0),
    res: (G, O, item) => {
      const k = G.stack.indexOf(item);
      if (k >= 0) G.stack.splice(k, 1);
      G.players[item.card.owner].hand.push(item.card);
      emit(G, 'bounce', `${item.card.def.name} returns to ${G.players[item.card.owner].name}'s hand.`, { who: O.i, cards: [item.card.id] });
      drawN(G, O, 1);
      return true;
    },
  };
  d.value = 2.6;
  d.role = 'counter';
  return d;
};
S['Rosie Cotton of South Lane'] = (d) => {
  d.etb = [food(1)];
  d.trig.push(T('token', { you: true, eff: [{ k: 'ctrs', n: 1, tgt: { f: YOU, other: true } }] }));
  return d;
};
S['Samwise the Stouthearted'] = (d) => {
  d.etb = [{ k: 'regrow', tgt: { what: 'gy', mine: true, min: 0, f: { types: ['permanent'], fn: (dd, card, G) => card.fromBfTurn === G.turn } } }, TEMPT];
  return d;
};
S['Shire Shirriff'] = (d) => {
  d.etb = [fn((G, X) => {
    const P = X.P;
    const toks = P.bf.filter((c) => c.token);
    const prey = other(G, P).bf.filter((c) => isCreature(c) && L.tgtOk(G, P, { tgt: { f: OPP } }, c, X.src)).sort((a, b) => cv(b) - cv(a))[0];
    if (!toks.length || !prey) return;
    const worst = toks.slice().sort((a, b) => pv(G, a) - pv(G, b))[0];
    let tok;
    if (isHuman(G, P)) { if (!yesNo(G, P, X.src, 'Sacrifice a token to exile a creature until Shire Shirriff leaves?', true)) return; tok = toks.length === 1 ? toks[0] : pickCards(G, { type: 'choose', reason: 'sacrifice-cost', n: 1, min: 1, max: 1, zone: 'battlefield', cards: toks.map((c) => c.id), label: X.src.def.name }, toks, 1)[0]; }
    else { if (cv(prey) < pv(G, worst) + 1) return; tok = worst; }
    emit(G, 'sac', `${P.name} sacrifices ${tok.def.name}.`, { who: P.i, cards: [tok.id] });
    sacrifice(G, P, tok, true);
    G.pending.unshift({ src: X.src, P, t: { eff: [fn((GG, XX, t) => L.exileUntil(GG, XX.P, XX.src, t.c), { tgt: tg(OPP), val: (GG, PP, c) => cv(c), label: 'Exile a creature an opponent controls until Shire Shirriff leaves' })] }, ev: {} });
  }, { score: (G, P) => (P.bf.some((c) => c.token) && other(G, P).bf.some(isCreature) ? 2 : 0), value: 2 })];
  d.trig.push(T('leave', { self: true, run: (G, X) => L.returnHeld(G, X.ev.mem) }));
  return d;
};
S['Slip On the Ring'] = (d) => {
  d.spell = [fn((G, X, t) => L.flicker(G, X.P, t.c, X.P), { tgt: tg({ side: 'you', fn: (G, c, P) => c.owner === P.i }), val: (G, P, c) => L.flickerVal(G, P, c), label: 'Exile and return a creature you own' }), TEMPT];
  return d;
};
S['Stalwarts of Osgiliath'] = (d) => {
  d.etb = [TEMPT];
  d.trig.push(T('draw', { you: true, cond: (G, src, ev) => ev.nth === 2, eff: [{ k: 'countersSelf', n: 1 }] }));
  return d;
};
S['Tale of Tinúviel'] = (d) => {
  d.statics.push({ who: 'all', f: heldBy('ind'), p: 0, t: 0, kw: ['indestructible'] });
  d.saga = [
    { ch: [1], eff: [fn((G, X, t) => { remember(X.src, 'ind', t.c); dirty(G); emit(G, 'pump', `${t.c.def.name} is indestructible for as long as ${X.P.name} controls ${X.src.def.name}.`, { who: X.P.i, cards: [t.c.id] }); }, { tgt: tg(YOU), val: (G, P, c) => cv(c) * 0.4, label: 'Make a creature indestructible' })] },
    { ch: [2], eff: [{ k: 'regrow', to: 'bf', tgt: { what: 'gy', mine: true, f: { types: ['Creature'] } } }] },
    { ch: [3], eff: [{ k: 'grant', kw: ['lifelink'], tgt: { f: YOU, n: 2, min: 0 } }] },
  ];
  return d;
};
S['War of the Last Alliance'] = (d) => {
  d.saga = [
    { ch: [1, 2], eff: [{ k: 'tutor', f: { types: ['Creature'], legendary: true }, to: 'hand' }] },
    { ch: [3], eff: [{ k: 'pumpAll', side: 'you', p: 0, t: 0, kw: ['double strike'] }, TEMPT] },
  ];
  return d;
};
S['You Cannot Pass!'] = (d) => {
  d.spell = [{ k: 'destroyP', tgt: { f: { fn: (G, c) => c.ylp === G.turn } } }];
  d.value = 1.6;
  return d;
};

/* ============================ Blue ============================ */
S["Arwen's Gift"] = (d) => {
  d.spell = fx('Scry 2, then draw two cards.');
  d.costMod = (G, P) => (legendsOf(P).length >= 2 ? 1 : 0);
  return d;
};
S['The Bath Song'] = (d) => {
  d.saga = [
    { ch: [1, 2], eff: [{ k: 'loot', n: 2, d: 1 }] },
    { ch: [3], eff: [fn((G, X) => {
      const P = X.P;
      let pick = [];
      if (P.gy.length) {
        if (isHuman(G, P)) pick = pickCards(G, { type: 'choose', reason: 'shuffle', n: P.gy.length, min: 0, max: P.gy.length, zone: 'graveyard', cards: P.gy.map((c) => c.id), label: X.src.def.name }, P.gy.slice(), null);
        else pick = P.library.length < 12 ? P.gy.slice() : P.gy.filter((c) => c.def.value >= 4);
      }
      for (const c of pick) { P.gy.splice(P.gy.indexOf(c), 1); P.library.push(c); }
      if (pick.length) { G.rng.shuffle(P.library); emit(G, 'info', `${P.name} shuffles ${pick.length === 1 ? 'a card' : `${pick.length} cards`} from their graveyard into their library.`, { who: P.i }); }
      L.addPool(G, P, ['U', 'U']);
      emit(G, 'info', `${P.name} adds {U}{U}.`, { who: P.i });
    }, { score: () => 0.8 })] },
  ];
  return d;
};
S['Bewitching Leechcraft'] = (d) => {
  d.etb = [fn((G, X) => { const h = byId(G, X.src.att); if (h) { h.tapped = true; emit(G, 'tapfx', `${h.def.name} is tapped.`, { who: X.P.i, cards: [h.id] }); } }, { score: () => 0.5 })];
  d.statics.push({ who: 'enchanted', p: 0, t: 0, kw: [], flags: { leech: true } });
  d.auraVal = (G, P, c) => (c.ctrl === P.i ? -cv(c) : cv(c) * (c.cnt > 0 ? 0.25 : 0.85));
  d.value = 2.6;
  d.role = 'removal';
  return d;
};
S['Bill Ferny, Bree Swindler'] = (d) => {
  d.trig.push(T('blocked', { self: true, run: (G, X) => {
    const P = X.P, me = X.src;
    const horses = P.bf.filter((c) => isCreature(c) && hasSub(c, 'Horse'));
    const labels = ['Create a Treasure token'];
    if (horses.length) labels.push('Give a Horse to your opponent for three Treasures');
    const horse = horses.slice().sort((a, b) => cv(a) - cv(b))[0];
    const k = chooseMode(G, P, me, `${me.def.name} is blocked`, labels, horse && cv(horse) < 3.5 ? 1 : 0);
    if (k === 0) { makeTokens(G, P, TREASURE, 1); emit(G, 'token', `${P.name} creates a Treasure token.`, { who: P.i }); return; }
    let h = horse;
    if (isHuman(G, P) && horses.length > 1) h = pickCards(G, { type: 'choose', reason: 'give', n: 1, min: 1, max: 1, zone: 'battlefield', cards: horses.map((c) => c.id), label: me.def.name }, horses, 1)[0];
    L.gainControl(G, X.O, h, 'perm');
    if (onBf(G, me)) { me.attacking = false; me.blocked = false; for (const b of me.blockedBy) if (b.blocking === me.id) b.blocking = 0; me.blockedBy = []; emit(G, 'info', `${me.def.name} is removed from combat.`, { who: P.i, cards: [me.id] }); }
    makeTokens(G, P, TREASURE, 3);
    emit(G, 'token', `${P.name} creates three Treasure tokens.`, { who: P.i });
  } }));
  return d;
};
S['Borne Upon a Wind'] = (d) => {
  d.spell = [fn((G, X) => { X.P.flashAll = G.turn; emit(G, 'info', `${X.P.name} may cast spells this turn as though they had flash.`, { who: X.P.i }); }, { score: () => 0.1, value: 0.3 }), { k: 'draw', n: 1 }];
  return d;
};
S["Council's Deliberation"] = (d) => {
  d.spell = [{ k: 'draw', n: 1 }];
  d.gyTrig = [T('scry', { you: true, cond: (G, src, ev, Q) => Q.bf.some((c) => hasSub(c, 'Island')), may: true, mayLabel: "Exile Council's Deliberation from your graveyard to draw a card?",
    run: (G, X) => { const P = X.P; if (!P.gy.includes(X.src)) return; P.gy.splice(P.gy.indexOf(X.src), 1); P.exile.push(X.src); emit(G, 'exile', `${P.name} exiles ${X.src.def.name} from their graveyard.`, { who: P.i, cards: [X.src.id] }); drawN(G, P, 1); } })];
  d.value = 2.2;
  return d;
};
S['Dreadful as the Storm'] = (d) => {
  d.spell = [fn((G, X, t) => { t.c.base = { p: 5, t: 5, eot: true }; dirty(G); emit(G, 'pump', `${t.c.def.name} has base power and toughness 5/5 until end of turn.`, { who: X.P.i, cards: [t.c.id] }); },
    { tgt: tg({}), val: (G, P, c) => (c.ctrl === P.i ? Math.max(0, 5 - c.def.power) * 0.35 + Math.max(0, 5 - c.def.toughness) * 0.25 + (inCombat(c) ? 1 : 0) : c.def.power > 5 ? (c.def.power - 5) * 0.4 : -1), label: 'Make a creature 5/5' }), TEMPT];
  return d;
};
S['Elrond, Lord of Rivendell'] = (d) => {
  d.trig.push(T('enter', { you: true, f: {}, counted: true, run: (G, X) => { scryChoice(G, X.P, 1); if (X.nth === 2) tempt(G, X.P); } }));
  return d;
};
S['Gandalf, Friend of the Shire'] = (d) => {
  d.flashFor = (def) => def.types.includes('Sorcery');
  d.trig.push(T('tempt', { you: true, cond: otherBearer, eff: [{ k: 'draw', n: 1 }] }));
  return d;
};
S['Glorious Gale'] = (d) => {
  d.spell = [{ k: 'counter', what: 'creature spell' }, Object.assign({}, TEMPT, { if: (G, X) => !!(X.countered && X.countered.card.def.supertypes.includes('Legendary')) })];
  return d;
};
S['Goldberry, River-Daughter'] = (d) => {
  const kinds = (c) => Object.keys(c.ctr).filter((k) => c.ctr[k] > 0).concat(c.cnt > 0 ? ['+1/+1'] : []);
  d.acts.push({ cost: { tap: true }, label: 'Take a counter of each kind', eff: [fn((G, X, t) => {
    const g = X.src, c = t.c;
    if (!onBf(G, g)) return;
    for (const k of kinds(c)) { if (kinds(g).includes(k)) continue; if (removeCounters(G, c, k, 1)) addCounters(G, g, 1, k, true); }
    emit(G, 'pump', `${g.def.name} takes counters from ${c.def.name}.`, { who: X.P.i, cards: [g.id, c.id] });
  }, { tgt: tg({ side: 'you', types: ['any'], fn: (G, c) => kinds(c).length > 0 }, { other: true }), val: () => -1, label: 'Choose another permanent of yours with counters' })], noAi: true });
  d.acts.push({ cost: { m: C('{U}'), tap: true }, label: 'Move counters and draw a card', cond: (G, P, c) => kinds(c).length > 0, eff: [fn((G, X, t) => {
    const g = X.src, c = t.c;
    let moved = 0;
    for (const k of kinds(g)) { const n = k === '+1/+1' ? g.cnt : g.ctr[k]; removeCounters(G, g, k, n); addCounters(G, c, n, k, true); moved += n; }
    if (moved) { emit(G, 'pump', `${g.def.name} moves ${moved === 1 ? 'a counter' : `${moved} counters`} onto ${c.def.name}.`, { who: X.P.i, cards: [c.id] }); drawN(G, X.P, 1); }
  }, { tgt: tg({ side: 'you', types: ['any'] }, { other: true }), val: (G, P, c) => (isCreature(c) ? 1.5 + cv(c) * 0.1 : 0.2), label: 'Choose another permanent of yours to get the counters' })] });
  return d;
};
S['Ioreth of the Healing House'] = (d) => {
  d.acts.push({ cost: { tap: true }, eff: [{ k: 'untapP', tgt: { f: { types: ['any'] }, other: true } }], label: 'Untap another permanent', when: ['main2'],
    ai: (G, P, c) => { const t = P.bf.filter((x) => x !== c && isCreature(x) && x.tapped).sort((a, b) => cv(b) - cv(a))[0]; return t && cv(t) > 2 ? { score: cv(t) * 0.3, targets: [{ c: t }] } : null; } });
  d.acts.push({ cost: { tap: true }, eff: [{ k: 'untapP', tgt: { f: { legendary: true }, other: true, n: 2, min: 2 } }], label: 'Untap two other legendary creatures', noAi: true });
  return d;
};
S['Knights of Dol Amroth'] = (d) => {
  d.trig.push(T('draw', { you: true, cond: (G, src, ev) => ev.nth === 2, eff: [{ k: 'countersSelf', n: 1 }] }));
  return d;
};
S['Lórien Revealed'] = (d) => { d.spell = [{ k: 'draw', n: 3 }]; return d; };
S['Lost Isle Calling'] = (d) => {
  d.trig.push(T('scry', { you: true, run: (G, X) => { if (onBf(G, X.src)) addCounters(G, X.src, 1, 'verse'); } }));
  d.acts.push({ cost: { m: C('{4}{U}{U}'), exileSelfBf: true }, sorcery: true, label: 'Draw a card for each verse counter',
    run: (G, X) => { const n = (X.selfCtr && X.selfCtr.verse) || 0; drawN(G, X.P, n); if (n >= 7) { G.extraTurns.push(X.P.i); emit(G, 'info', `${X.P.name} will take an extra turn after this one.`, { who: X.P.i }); } },
    ai: (G, P, c) => { const n = ctrCount(c, 'verse'); return n >= 7 ? { score: 20 } : n >= 4 && P.hand.length <= 2 ? { score: n * 1.1 - 2.5 } : null; } });
  d.value = 2.4;
  return d;
};
S['Meneldor, Swift Savior'] = (d) => {
  d.trig.push(T('hitPlayer', { self: true, eff: [fn((G, X, t) => L.flicker(G, X.P, t.c, X.P), { tgt: tg({ fn: (G, c, P) => c.owner === P.i }, { min: 0 }), val: (G, P, c) => L.flickerVal(G, P, c), label: 'Exile and return a creature you own' })] }));
  return d;
};
S['Nimrodel Watcher'] = (d) => {
  d.trig.push(T('scry', { you: true, once: true, run: (G, X) => { const c = X.src; if (!onBf(G, c)) return; c.tp += 1; c.tf.unblockable = true; emit(G, 'pump', `${c.def.name} gets +1/+0 and can't be blocked this turn.`, { who: X.P.i, cards: [c.id] }); } }));
  return d;
};
S['Pelargir Survivor'] = (d) => {
  d.manaAbs = [{ colors: L.ANY, only: (pu) => !!pu.def && isIS(pu.def) }];
  d.acts.push({ cost: { m: C('{5}{U}'), tap: true }, eff: [{ k: 'mill', n: 3, tgt: { what: 'player' } }], label: 'Target player mills three cards', noAi: true });
  return d;
};
S['Press the Enemy'] = (d) => {
  const freeCast = fn((G, X) => { const c = X.last && X.last.c; const mv = c ? c.def.mv : 0; L.freeCastFromHand(G, X.P, mv, `Cast a spell with mana value ${mv} or less for free`); }, { score: () => 0.6 });
  d.spell = [{ k: 'bounceP', tgt: { f: { types: ['nonland'], side: 'opp' } } }, freeCast];
  d.respond = {
    legal: (G, O, item) => item.P !== O,
    ai: (G, O, item) => L.threatOf(G, O, item) * 0.85,
    res: (G, O, item) => {
      const k = G.stack.indexOf(item);
      if (k >= 0) G.stack.splice(k, 1);
      G.players[item.card.owner].hand.push(item.card);
      emit(G, 'bounce', `${item.card.def.name} returns to ${G.players[item.card.owner].name}'s hand.`, { who: O.i, cards: [item.card.id] });
      L.freeCastFromHand(G, O, item.card.def.mv, `Cast a spell with mana value ${item.card.def.mv} or less for free`);
      return true;
    },
  };
  return d;
};
S['Rangers of Ithilien'] = (d) => {
  d.etb = [fn((G, X, t) => L.gainControl(G, X.P, t.c, 'src', X.src), { tgt: tg({ fn: (G, c, P, src) => pow(c) < pow(src) }, { min: 0 }), val: (G, P, c) => (c.ctrl !== P.i ? cv(c) * 1.6 : -1), label: 'Gain control of a creature with lesser power' }), TEMPT];
  d.value = 7.5;
  return d;
};
S['Saruman the White'] = (d) => {
  d.trig.push(T('cast', { you: true, cond: (G, src, ev) => ev.nth === 2, eff: [am(2)] }));
  return d;
};
S['Scroll of Isildur'] = (d) => {
  d.saga = [
    { ch: [1], eff: [fn((G, X, t) => L.gainControl(G, X.P, t.c, 'src', X.src), { tgt: tg({ types: ['Artifact'] }, { min: 0 }), val: (G, P, c) => (c.ctrl !== P.i ? pv(G, c) * 1.2 : -1), label: 'Gain control of an artifact' }), TEMPT] },
    { ch: [2], eff: [{ k: 'tapP', stun: true, tgt: { f: {}, n: 2, min: 0 } }] },
    { ch: [3], eff: [fn((G, X, t) => { const Q = G.players[t.p]; drawN(G, X.P, Q.bf.filter((c) => isCreature(c) && c.tapped).length); }, { tgt: { what: 'player', f: OPP }, val: (G, P, x) => (x.p !== P.i ? 1 : -1), label: 'Choose an opponent' })] },
  ];
  return d;
};
S['Soothing of Sméagol'] = (d) => { d.spell = [{ k: 'bounceP', tgt: { f: { nontoken: true } } }, TEMPT]; return d; };
S['Stern Scolding'] = (d) => { d.spell = [{ k: 'counter', what: 'small creature spell' }]; return d; };
S['Storm of Saruman'] = (d) => {
  d.trig.push(T('cast', { you: true, cond: (G, src, ev) => ev.nth === 2 && ev.item.copyable !== false, run: (G, X) => L.copySpell(G, X.P, X.ev.item, { nonLegendary: true }) }));
  d.value = 6;
  return d;
};
S['Surrounded by Orcs'] = (d) => {
  d.spell = [am(3), { k: 'mill', tgt: { what: 'player' }, nFn: (G, X) => (X.army && onBf(G, X.army) ? Math.max(0, pow(X.army)) : 0) }];
  return d;
};
S['Treason of Isengard'] = (d) => {
  d.spell = [fn((G, X, t) => { const c = t.c, P = X.P; if (!P.gy.includes(c)) return; P.gy.splice(P.gy.indexOf(c), 1); P.library.push(c); emit(G, 'info', `${P.name} puts ${c.def.name} on top of their library.`, { who: P.i, cards: [c.id] }); },
    { tgt: { what: 'gy', mine: true, min: 0, f: ISF }, val: (G, P, c) => c.def.value * 0.25, label: 'Put an instant or sorcery on top of your library' }), am(2)];
  return d;
};
S['The Watcher in the Water'] = (d) => {
  d.etbTapped = true;
  d.etbCtr = () => ({ stun: 9 });
  d.trig.push(T('draw', { you: true, cond: (G, src, ev) => ev.oppTurn, eff: fx('Create a 1/1 blue Tentacle creature token.') }));
  d.trig.push(T('die', { you: true, f: { sub: 'Tentacle' }, eff: [{ k: 'untapP', tgt: { f: { sub: 'Kraken' }, min: 0 } }, { k: 'ctrs', kind: 'stun', n: 1, tgt: { f: { types: ['nonland'] }, min: 0 } }] }));
  d.value = 5;
  return d;
};

/* ============================ Black ============================ */
S['Bitter Downfall'] = (d) => {
  d.spell = [{ k: 'destroyP', tgt: { f: {}, fn: cheapIf((G, c) => c.dmgTurn === G.turn) } }, { k: 'refLose', n: 2 }];
  d.costMod = (G, P, card, tgs) => (tgs.some((t) => t && t.c && t.c.dmgTurn === G.turn) ? 3 : 0);
  return d;
};
S['Call of the Ring'] = (d) => {
  d.trig.push(T('upkeep', { you: true, eff: [TEMPT] }));
  d.trig.push(T('bearer', { you: true, run: (G, X) => { const P = X.P; if (P.life > 2 && yesNo(G, P, X.src, 'Pay 2 life to draw a card?', P.life >= 9)) { loseLife(G, P, 2); drawN(G, P, 1); } } }));
  d.value = 4;
  return d;
};
S['Cirith Ungol Patrol'] = (d) => {
  d.acts.push({ cost: { m: C('{1}'), tap: true, sac: { other: true } }, eff: [{ k: 'draw', n: 1 }, food(1)], label: 'Draw a card and create a Food' });
  return d;
};
S['Gollum, Patient Plotter'] = (d) => {
  d.trig.push(T('leave', { self: true, eff: [TEMPT] }));
  d.gyActs = [{ cost: { m: C('{B}'), sac: { types: ['Creature'] } }, sorcery: true, label: 'Return Gollum to your hand',
    run: (G, X) => { const P = X.P, c = X.src; if (!P.gy.includes(c)) return; P.gy.splice(P.gy.indexOf(c), 1); P.hand.push(c); emit(G, 'raise', `${P.name} returns ${c.def.name} to hand.`, { who: P.i, cards: [c.id] }); },
    ai: (G, P) => { const cheap = P.bf.filter((c) => isCreature(c)).sort((a, b) => pv(G, a) - pv(G, b))[0]; return cheap && pv(G, cheap) < 1.6 ? { score: 1.4 - pv(G, cheap) * 0.5 } : null; } }];
  return d;
};
S["Gollum's Bite"] = (d) => {
  d.spell = fx('Target creature gets -2/-2 until end of turn.');
  d.gyActs = [{ cost: { m: C('{3}{B}'), exileSelf: true }, sorcery: true, eff: [TEMPT], label: 'The Ring tempts you', ai: (G, P) => ({ score: 1.5 }) }];
  return d;
};
S['Gorbag of Minas Morgul'] = (d) => {
  d.trig.push(T('hitPlayer', { you: true, cond: (G, src, ev) => orcish(ev.c), run: (G, X) => {
    const c = X.ev.c, P = X.P;
    if (!onBf(G, c)) return;
    if (!yesNo(G, P, X.src, `Sacrifice ${c.def.name} to draw a card or make a Treasure?`, pv(G, c) < 1.6)) return;
    emit(G, 'sac', `${P.name} sacrifices ${c.def.name}.`, { who: P.i, cards: [c.id] });
    sacrifice(G, P, c, true);
    const k = chooseMode(G, P, X.src, X.src.def.name, ['Draw a card', 'Create a Treasure token'], 0);
    if (k === 0) drawN(G, P, 1); else { makeTokens(G, P, TREASURE, 1); emit(G, 'token', `${P.name} creates a Treasure token.`, { who: P.i }); }
  } }));
  return d;
};
S['Gothmog, Morgul Lieutenant'] = (d) => {
  d.etb = [am(1)];
  d.statics.push({ who: 'all', f: { side: 'you', token: true }, p: 0, t: 0, kw: ['deathtouch'] });
  return d;
};
S['Gríma Wormtongue'] = (d) => {
  d.noOppGain = true;
  d.acts.push({ cost: { tap: true, sac: { other: true } }, eff: [{ k: 'lose', n: 1, tgt: { what: 'player' } }, Object.assign(am(2), { if: (G, X) => !!(X.sacd && X.sacd[0] && X.sacd[0].leg) })], label: 'Target player loses 1 life' });
  return d;
};
S['Grond, the Gatebreaker'] = (d) => {
  d.animate = (G, c) => G.active === c.ctrl && G.players[c.ctrl].bf.some((x) => x !== c && x.def.types.includes('Creature') && (x.subX || x.def.sub).includes('Army'));
  d.value = 5;
  return d;
};
S['Haunt of the Dead Marshes'] = (d) => {
  d.etb = [{ k: 'scry', n: 1 }];
  d.gyActs = [{ cost: { m: C('{2}{B}') }, cond: (G, P) => legendsOf(P).length > 0, label: 'Return to the battlefield tapped',
    run: (G, X) => { const P = X.P, c = X.src; if (!P.gy.includes(c)) return; P.gy.splice(P.gy.indexOf(c), 1); emit(G, 'raise', `${c.def.name} returns to the battlefield.`, { who: P.i, cards: [c.id] }); L.enterBattlefield(G, P, c, null, { tapped: true }); },
    ai: () => ({ score: 1.2 }) }];
  return d;
};
S["Isildur's Fateful Strike"] = (d) => {
  d.castIf = (G, P) => legendsOf(P).length > 0;
  d.spell = [{ k: 'destroy', f: {} }, fn((G, X) => {
    const c = X.last && X.last.c;
    if (!c) return;
    const Q = G.players[c.owner];
    const n = Q.hand.length - 4;
    if (n <= 0) return;
    const pick = isHuman(G, Q) ? pickCards(G, { type: 'choose', reason: 'exile-hand', n, min: n, max: n, zone: 'hand', cards: Q.hand.map((x) => x.id) }, Q.hand.slice(), n) : Q.hand.slice().sort((a, b) => handValue(G, Q, a) - handValue(G, Q, b)).slice(0, n);
    for (const x of pick) { Q.hand.splice(Q.hand.indexOf(x), 1); Q.exile.push(x); }
    emit(G, 'exile', `${Q.name} exiles ${n === 1 ? 'a card' : `${n} cards`} from their hand.`, { who: X.P.i });
  }, { score: (G, P) => Math.max(0, other(G, P).hand.length - 4) * 0.6 })];
  return d;
};
S['Lash of the Balrog'] = (d) => {
  d.addCost = { sac: { types: ['Creature'] }, orPay: L.genericCost(4) };
  d.spell = [{ k: 'destroy', f: {} }];
  d.effMv = 4;
  return d;
};
S['Lobelia Sackville-Baggins'] = (d) => {
  d.etb = [fn((G, X, t) => {
    const c = t.c, Q = G.players.find((q) => q.gy.includes(c));
    if (!Q) return;
    Q.gy.splice(Q.gy.indexOf(c), 1); Q.exile.push(c);
    const n = Math.max(0, c.def.power);
    emit(G, 'exile', `${X.P.name} exiles ${c.def.name} from ${Q.name}'s graveyard.`, { who: X.P.i, cards: [c.id] });
    if (n) { makeTokens(G, X.P, TREASURE, n); emit(G, 'token', `${X.P.name} creates ${n === 1 ? 'a Treasure token' : `${n} Treasure tokens`}.`, { who: X.P.i }); }
  }, { tgt: { what: 'gy', theirs: true, f: { types: ['Creature'], fn: (dd, card, G) => card.fromBfTurn === G.turn } }, val: (G, P, c) => 0.5 + Math.max(0, c.def.power) * 0.7, label: "Exile a creature card that died this turn" })];
  return d;
};
S['March from the Black Gate'] = (d) => {
  d.etb = [am(1)];
  d.trig.push(T('attack', { you: true, f: { sub: 'Army' }, eff: [am(1)] }));
  d.value = 3;
  return d;
};
S['Mirkwood Bats'] = (d) => {
  d.trig.push(T('token', { you: true, eff: [{ k: 'drain', n: 1 }] }));
  d.trig.push(T('sac', { you: true, cond: (G, src, ev) => ev.token, eff: [{ k: 'drain', n: 1 }] }));
  return d;
};
const BOULDER = { name: 'Ballistic Boulder', p: 2, t: 1, colors: [], sub: ['Construct'], kw: ['flying'], artifact: true };
S['Mordor Trebuchet'] = (d) => {
  d.trig.push(T('attacks', { you: true, cond: (G, src, ev) => ev.cs.some(orcish), run: (G, X) => {
    if (!G.combat) return;
    const t = makeTokens(G, X.P, BOULDER, 1)[0];
    t.tapped = true; t.attacking = true; G.combat.attackers.push(t);
    emit(G, 'token', `${X.P.name} creates Ballistic Boulder, a 2/1 flier that is tapped and attacking.`, { who: X.P.i, cards: [t.id] });
    G.delayed.push({ when: 'combatEnd', run: (GG) => { if (onBf(GG, t)) { emit(GG, 'sac', 'Ballistic Boulder is sacrificed at end of combat.', { who: t.ctrl, cards: [t.id] }); sacrifice(GG, GG.players[t.ctrl], t, true); } } });
  } }));
  return d;
};
S['Morgul-Knife Wound'] = (d) => {
  d.statics.push({ who: 'enchanted', p: -3, t: 0, kw: [] });
  d.trig.push(T('upkeep', { cond: (G, src, ev) => { const h = byId(G, src.att); return !!h && ev.P.i === h.ctrl; }, run: (G, X) => {
    const h = byId(G, X.src.att);
    if (!h) return;
    const Q = G.players[h.ctrl];
    if (Q.life > 2 && yesNo(G, Q, X.src, `Pay 2 life to keep ${h.def.name}?`, Q.life > 8 && cv(h) > 2.5)) { loseLife(G, Q, 2); return; }
    L.exilePermanent(G, X.P, h);
  } }));
  d.auraVal = (G, P, c) => (c.ctrl === P.i ? -cv(c) : Math.min(3, Math.max(0, pow(c))) * 0.8 + cv(c) * 0.3);
  d.role = 'removal';
  d.value = 2.8;
  return d;
};
S['Nasty End'] = (d) => {
  d.effMv = 3;
  d.addCost = { sac: { types: ['Creature'] }, legendBonus: 1.2 };
  d.spell = [fn((G, X) => drawN(G, X.P, X.sac && X.sac.leg ? 3 : 2), { score: (G, P, X) => (X && X.sac && X.sac.leg ? 3 : 2) * 1.25, value: 2.3 })];
  return d;
};
S['Nazgûl'] = (d) => {
  d.etb = [TEMPT];
  d.trig.push(T('tempt', { you: true, run: (G, X) => { const ws = X.P.bf.filter((c) => isCreature(c) && hasSub(c, 'Wraith')); for (const w of ws) addCounters(G, w, 1, '+1/+1', true); if (ws.length) emit(G, 'pump', `Each Wraith ${X.P.name} controls gets a +1/+1 counter.`, { who: X.P.i, cards: ws.map((c) => c.id) }); } }));
  d.maxCopies = 9;
  return d;
};
S['Oath of the Grey Host'] = (d) => {
  d.saga = [
    { ch: [1], eff: [food(1), { k: 'food', n: 1, forOpp: true }] },
    { ch: [2], eff: [{ k: 'drain', n: 3 }, { k: 'treasure', n: 1 }] },
    { ch: [3], eff: fx('Create three tapped 1/1 white Spirit creature tokens with flying.') },
  ];
  d.value = 8;
  return d;
};
S['One Ring to Rule Them All'] = (d) => {
  d.saga = [
    { ch: [1], eff: [TEMPT, fn((G, X) => { const rb = L.ringBearer(G, X.P); const n = rb ? Math.max(0, pow(rb)) : 0; if (n) for (const Q of G.players) mill(G, Q, n); }, { score: () => 0.2 })] },
    { ch: [2], eff: [{ k: 'destroyAll', f: { nonlegendary: true } }] },
    { ch: [3], eff: [fn((G, X) => { const n = X.O.gy.filter((c) => c.def.types.includes('Creature')).length; loseLife(G, X.O, n, X.P.i); }, { score: (G, P) => other(G, P).gy.filter((c) => c.def.types.includes('Creature')).length * 0.5 })] },
  ];
  d.value = 5;
  d.role = 'sweeper';
  return d;
};
S['Orcish Bowmasters'] = (d) => {
  d.etb = [{ k: 'dmg', n: 1, to: 'any' }, am(1)];
  d.trig.push(T('draw', { opp: true, cond: (G, src, ev) => !ev.step, eff: [{ k: 'dmg', n: 1, to: 'any' }, am(1)] }));
  d.value = 5.5;
  return d;
};
S['Orcish Medicine'] = (d) => {
  d.spell = [fn((G, X, t) => {
    const c = t.c;
    const threatened = dyingInCombat(G, G.players[c.ctrl]).includes(c);
    const k = chooseMode(G, X.P, X.src, `${X.src.def.name}: give ${c.def.name}`, ['Lifelink', 'Indestructible'], threatened ? 1 : 0);
    grantKw(G, c, [k ? 'indestructible' : 'lifelink']);
  }, { tgt: tg({}), val: (G, P, c) => (c.ctrl === P.i ? 0.5 + (inCombat(c) ? cv(c) * 0.3 : 0) : -0.3), label: 'Lifelink or indestructible' }), am(1)];
  return d;
};
S['Sauron, the Necromancer'] = (d) => {
  d.trig.push(T('attack', { self: true, eff: [fn((G, X, t) => {
    const card = t.c, P = X.P;
    if (!P.gy.includes(card)) return;
    P.gy.splice(P.gy.indexOf(card), 1); P.exile.push(card);
    const id = `${card.def.id}-wraith`;
    if (!G.defs[id]) G.defs[id] = Object.assign({}, card.def, { id, token: true, power: 3, toughness: 3, colors: ['B'], sub: ['Wraith'], kw: card.def.kw.filter((k) => k !== 'menace').concat('menace'), typeLine: `Token Creature — Wraith` });
    const t2 = A._internal.newCard(G, G.defs[id], P.i);
    t2.token = true;
    L.enterBattlefield(G, P, t2, null, {});
    if (onBf(G, t2) && G.combat) { t2.tapped = true; t2.attacking = true; G.combat.attackers.push(t2); }
    emit(G, 'token', `${P.name} creates a 3/3 Wraith copy of ${card.def.name}, tapped and attacking.`, { who: P.i, cards: [t2.id] });
    const sauron = X.src;
    G.delayed.push({ when: 'end', run: (GG) => { if (!onBf(GG, t2)) return; const rb = L.ringBearer(GG, GG.players[sauron.ctrl]); if (rb === sauron) return; emit(GG, 'exile', `The Wraith copy of ${card.def.name} is exiled.`, { who: t2.ctrl, cards: [t2.id] }); L.exilePermanent(GG, GG.players[t2.ctrl], t2); } });
  }, { tgt: { what: 'gy', mine: true, f: { types: ['Creature'] } }, val: (G, P, c) => 1 + c.def.value * 0.2, label: 'Choose a creature card in your graveyard' })] }));
  d.value = 9;
  return d;
};
S['Shadow of the Enemy'] = (d) => {
  d.spell = [fn((G, X, t) => {
    const Q = G.players[t.p];
    const cs = Q.gy.filter((c) => c.def.types.includes('Creature'));
    for (const c of cs) { Q.gy.splice(Q.gy.indexOf(c), 1); Q.exile.push(c); X.P.xcast.push({ card: c, until: Infinity, anyType: true }); }
    dirty(G);
    emit(G, 'exile', `${X.P.name} exiles ${cs.length === 1 ? 'a creature card' : `${cs.length} creature cards`} from ${Q.name}'s graveyard and may cast ${cs.length === 1 ? 'it' : 'them'}.`, { who: X.P.i, cards: cs.map((c) => c.id) });
  }, { tgt: { what: 'player' }, val: (G, P, x) => G.players[x.p].gy.filter((c) => c.def.types.includes('Creature')).reduce((s, c) => s + c.def.value * 0.5, 0) - 2, label: "Choose a player's graveyard" })];
  d.value = 4;
  return d;
};
S['Snarling Warg'] = (d) => {
  d.statics.push({ who: 'self', cond: (G, src, P) => P.bf.some((c) => c !== src && isCreature(c) && orcish(c)), p: 1, t: 0, kw: [] });
  return d;
};
S['The Torment of Gollum'] = (d) => {
  d.spell = [fn((G, X) => {
    const O = X.O;
    const cs = O.hand.filter((c) => !isLand(c));
    emit(G, 'reveal', `${O.name} reveals their hand.`, { who: X.P.i });
    if (!cs.length) return;
    const pick = isHuman(G, X.P) ? pickCards(G, { type: 'choose', reason: 'take', n: 1, min: 1, max: 1, zone: 'hand', cards: cs.map((c) => c.id), label: 'Choose a card they discard' }, cs, 1)[0] : cs.slice().sort((a, b) => b.def.value - a.def.value)[0];
    O.hand.splice(O.hand.indexOf(pick), 1); O.gy.push(pick);
    emit(G, 'discard', `${O.name} discards ${pick.def.name}.`, { who: X.P.i, cards: [pick.id] });
  }, { score: (G, P) => (other(G, P).hand.some((c) => !isLand(c)) ? 1.6 : 0.1), value: 1.6 }), am(2)];
  return d;
};
S['Troll of Khazad-dûm'] = (d) => { d.minBlock = 3; return d; };
S['Voracious Fell Beast'] = (d) => {
  d.etb = [fn((G, X) => {
    const O = X.O, cs = O.bf.filter(isCreature);
    if (!cs.length) { emit(G, 'info', `${O.name} has nothing to sacrifice.`, { who: X.P.i }); return; }
    const v = L.sacrificeChoice(G, O, cs);
    emit(G, 'sac', `${O.name} sacrifices ${v.def.name}.`, { who: O.i, cards: [v.id] });
    X.P.stats.kills++;
    sacrifice(G, O, v, true);
    makeTokens(G, X.P, FOOD, 1);
    emit(G, 'token', `${X.P.name} creates a Food token.`, { who: X.P.i });
  }, { score: (G, P) => { const cs = other(G, P).bf.filter(isCreature); return cs.length ? Math.min(...cs.map(cv)) + 1 : 0.2; }, value: 3.5 })];
  return d;
};
S['Witch-king of Angmar'] = (d) => {
  d.trig.push(T('combatDamagedYou', { you: true, run: (G, X) => {
    const O = X.O, cs = X.ev.cs.filter((c) => onBf(G, c) && c.ctrl === O.i && isCreature(c));
    if (cs.length) { const v = L.sacrificeChoice(G, O, cs); emit(G, 'sac', `${O.name} sacrifices ${v.def.name}.`, { who: O.i, cards: [v.id] }); sacrifice(G, O, v, true); }
    tempt(G, X.P);
  } }));
  d.acts.push({ cost: { discard: 1 }, label: 'Gain indestructible, then tap', when: ['blocks'], run: (G, X) => { const c = X.src; if (!onBf(G, c)) return; c.tkw.push('indestructible'); c.tapped = true; dirty(G); emit(G, 'pump', `${c.def.name} gains indestructible until end of turn and taps.`, { who: X.P.i, cards: [c.id] }); },
    ai: (G, P, c) => (!c.tkw.includes('indestructible') && dyingInCombat(G, P).includes(c) && P.hand.length ? { score: cv(c) - Math.min(...P.hand.map((x) => handValue(G, P, x))) * 0.5 } : null) });
  return d;
};


/* ============================ Red ============================ */
S['Battle-Scarred Goblin'] = (d) => {
  d.trig.push(T('blocked', { self: true, run: (G, X) => { const bs = X.ev.by.filter((b) => onBf(G, b)); for (const b of bs) L.damageCreature(G, b, 1, X.src); if (bs.length) emit(G, 'hit', `${X.src.def.name} deals 1 damage to each creature blocking it.`, { who: X.P.i, cards: bs.map((b) => b.id) }); } }));
  return d;
};
S['Breaking of the Fellowship'] = (d) => {
  d.spell = [fn((G, X, t) => L.biteCards(G, X.P, t.c, t.c2), {
    tgt: { pair: true, fa: OPP, fb: OPP, same: true, labels: ['Choose the creature that deals the damage', 'Choose the creature it damages'] },
    pairVal: (G, P, a, b) => (L.kills(a, b) ? cv(b) + 0.3 : 0.1), label: 'One of their creatures damages another' }), TEMPT];
  d.role = 'removal';
  d.value = 3.2;
  return d;
};
S['Cast into the Fire'] = (d) => {
  d.modes = [
    { label: '1 damage to each of up to two creatures', eff: [{ k: 'dmgX', nFn: () => 1, tgt: { f: {}, n: 2, min: 0 } }] },
    { label: 'Exile an artifact', eff: [{ k: 'exileP', tgt: { f: { types: ['Artifact'] } } }] },
  ];
  d.spell = null;
  return d;
};
S['Display of Power'] = (d) => {
  d.spell = [{ k: 'noop2' }];
  d.respondOnly = true;
  d.noCopy = true;
  d.copier = true;
  d.respond = {
    legal: (G, O, item) => isIS(item.card.def) && item.copyable !== false,
    ai: (G, O, item) => { const ch = L.chooseTargets(G, O, L.spellEffects(item.card.def, item.mode), 'main2', item.card, { x: item.x }); return ch ? ch.score * 1.1 : -1; },
    res: (G, O, item) => { L.copySpell(G, O, item); return false; },
  };
  d.value = 2.4;
  return d;
};
S['Éomer, Marshal of Rohan'] = (d) => {
  d.trig.push(T('die', { you: true, once: true, cond: (G, src, ev) => ev.c !== src && ev.att && ev.leg, run: (G, X) => {
    for (const c of X.P.bf) if (isCreature(c)) c.tapped = false;
    G.extraCombat = true;
    emit(G, 'info', `${X.P.name} untaps all creatures they control. There will be another combat phase.`, { who: X.P.i });
  } }));
  return d;
};
const greatestPower = (G, Q) => { const all = allCreatures(G); if (!all.length) return false; const mx = Math.max(...all.map(pow)); return Q.bf.some((c) => isCreature(c) && pow(c) === mx); };
S['Éomer of the Riddermark'] = (d) => {
  d.trig.push(T('attack', { self: true, cond: (G, src, ev, Q) => greatestPower(G, Q), check: (G, src, ev, Q) => greatestPower(G, Q), eff: [soldiers(1)] }));
  return d;
};
S['Erebor Flamesmith'] = (d) => { d.trig.push(T('cast', { you: true, cond: (G, src, ev) => isIS(ev.card.def), eff: [{ k: 'dmg', n: 1, to: 'player' }] })); return d; };
S['Erkenbrand, Lord of Westfold'] = (d) => { d.trig.push(T('enter', { you: true, f: { sub: 'Human' }, eff: [{ k: 'pumpTeam', p: 1, t: 0, kw: [] }] })); return d; };
S['Fall of Cair Andros'] = (d) => {
  d.trig.push(T('dmgCreature', { cond: (G, src, ev, Q) => ev.ctrl !== Q.i && ev.noncombat && ev.excess > 0, eff: [{ k: 'amass', nFn: (G, X) => (X.ev ? X.ev.excess || 0 : 1) }] }));
  d.acts.push({ cost: { m: C('{7}{R}') }, eff: [{ k: 'dmg', n: 7, to: 'creature', f: {} }], label: '7 damage to a creature' });
  d.value = 3;
  return d;
};
S['Fear, Fire, Foes!'] = (d) => {
  d.spell = [fn((G) => { G.noPrevent = true; }, { score: () => 0 }), fn((G, X, t) => {
    const c = t.c, Q = G.players[c.ctrl];
    L.dealDamage(G, X, { c }, X.x || 0, {});
    const rest = Q.bf.filter((o) => o !== c && isCreature(o));
    for (const o of rest) L.damageCreature(G, o, 1, X.src);
    if (rest.length) emit(G, 'hit', `${X.src.def.name} deals 1 damage to each other creature ${Q.name} controls.`, { who: X.P.i, cards: rest.map((o) => o.id) });
  }, { tgt: tg({}), val: (G, P, c, X) => { if (c.ctrl === P.i) return -5; const n = (X && X.x) || 0; const others = G.players[c.ctrl].bf.filter((o) => o !== c && isCreature(o) && L.lethalTo(o) <= 1).reduce((s, o) => s + cv(o), 0); return (L.lethalTo(c) <= n ? cv(c) : 0) + others; }, label: 'X damage to a creature' })];
  d.minX = 1;
  d.aiX = (G, P, card, max) => { const prey = other(G, P).bf.filter(isCreature).sort((a, b) => cv(b) - cv(a)); for (const c of prey) if (L.lethalTo(c) <= max) return Math.max(1, L.lethalTo(c)); return max; };
  d.value = 3.4;
  d.role = 'removal';
  return d;
};
S['Fiery Inscription'] = (d) => {
  d.etb = [TEMPT];
  d.trig.push(T('cast', { you: true, cond: (G, src, ev) => isIS(ev.card.def), eff: [{ k: 'dmg', n: 2, to: 'player' }] }));
  d.value = 3;
  return d;
};
S['Fire of Orthanc'] = (d) => {
  d.spell = [{ k: 'destroyP', tgt: { f: { types: ['Artifact', 'Land'] } } }, fn((G, X) => { G.noBlockNoFly = G.turn; emit(G, 'info', "Creatures without flying can't block this turn.", { who: X.P.i }); }, { score: (G, P) => { const blockers = other(G, P).bf.filter((c) => isCreature(c) && !c.tapped && !has(c, 'flying')); return blockers.length ? P.bf.filter((c) => L.canAttackNow(G, c)).reduce((s, c) => s + Math.max(0, pow(c)), 0) * 0.25 : 0; } })];
  return d;
};
const armyPow = (G, X) => { const a = (X.ev && X.ev.army) || (X.army) || (X.P && X.P.bf.find((c) => isCreature(c) && hasSub(c, 'Army'))); const live = a && onBf(G, a) ? Math.max(0, pow(a)) : 0; return X.ev && X.ev.army ? live : live + 2; };
S['Foray of Orcs'] = (d) => {
  d.spell = [am(2), { k: 'reflex', eff: [{ k: 'dmgX', tgt: { f: OPP }, nFn: armyPow }] }];
  return d;
};
S['Gimli, Counter of Kills'] = (d) => { d.trig.push(T('die', { opp: true, eff: [{ k: 'dmg', n: 1, to: 'player' }] })); return d; };
S["Gimli's Axe"] = (d) => { d.statics.push({ who: 'equipped', f: { legendary: true }, p: 0, t: 0, kw: ['menace'] }); return d; };
S["Gimli's Fury"] = (d) => {
  d.spell = [{ k: 'pump', f: {}, p: 3, t: 2, kw: [] }, fn((G, X) => { const c = X.last && X.last.c; if (c && onBf(G, c) && isLegendary(c)) grantKw(G, c, ['trample']); }, { score: () => 0 })];
  return d;
};
S['Glóin, Dwarf Emissary'] = (d) => {
  d.trig.push(T('cast', { you: true, once: true, cond: (G, src, ev) => L.historicDef(ev.card.def), eff: [{ k: 'treasure', n: 1 }] }));
  d.acts.push({ cost: { tap: true, sac: TREASUREF }, eff: [fn((G, X, t) => L.goad(G, X.P, t.c), { tgt: tg({}), val: (G, P, c) => (c.ctrl !== P.i ? 0.3 : -1), label: 'Goad a creature' })], label: 'Goad target creature', noAi: true });
  return d;
};
S['Goblin Fireleaper'] = (d) => {
  d.pumpAbility = { cost: C('{1}{R}'), p: 1, t: 0, once: false, max: 0 };
  d.trig.push(T('die', { self: true, eff: [{ k: 'dmgX', tgt: { f: OPP }, nFn: (G, X) => (X.ev && X.ev.pow != null ? Math.max(0, X.ev.pow) : 1) }] }));
  return d;
};
S['Grishnákh, Brash Instigator'] = (d) => {
  d.etb = [am(2), { k: 'reflex', eff: [fn((G, X, t) => { const c = t.c; L.gainControl(G, X.P, c, 'eot', X.src); c.tapped = false; grantKw(G, c, ['haste']); }, {
    tgt: { f: { side: 'opp', nonlegendary: true }, fn: (G, P, c, src, X) => pow(c) <= armyPow(G, X || { P }) }, val: (G, P, c) => cv(c) * 0.9 + 1, label: 'Gain control of a creature until end of turn' })] }];
  return d;
};
S['Haradrim Spearmaster'] = (d) => { d.trig.push(T('combatStart', { you: true, eff: [{ k: 'pumpT', p: 1, t: 0, tgt: { f: YOU, other: true } }] })); return d; };
S['Hew the Entwood'] = (d) => {
  d.spell = [fn((G, X) => {
    const P = X.P, lands = P.bf.filter(isLand);
    const n = L.chooseNumber(G, P, X.src, 'Sacrifice how many lands?', 0, lands.length, 0);
    if (!n) return;
    const pick = isHuman(G, P) && n < lands.length ? pickCards(G, { type: 'choose', reason: 'sacrifice-cost', n, min: n, max: n, zone: 'battlefield', cards: lands.map((c) => c.id) }, lands, n) : lands.slice().sort((a, b) => (b.tapped ? 1 : 0) - (a.tapped ? 1 : 0)).slice(0, n);
    for (const c of pick) sacrifice(G, P, c, true);
    emit(G, 'sac', `${P.name} sacrifices ${n === 1 ? 'a land' : `${n} lands`}.`, { who: P.i });
    const top = P.library.splice(Math.max(0, P.library.length - n)).reverse();
    const ok = top.filter((c) => isArtifact(c) || isLand(c));
    const take = isHuman(G, P) ? pickCards(G, { type: 'choose', reason: 'reveal', n: ok.length, min: 0, max: ok.length, zone: 'library', cards: ok.map((c) => c.id), shown: top.map((c) => c.id) }, ok, null) : ok;
    for (const c of take.filter((x) => !isLand(x))) L.enterBattlefield(G, P, c, null, {});
    for (const c of take.filter(isLand)) L.enterBattlefield(G, P, c, null, { tapped: true });
    const rest = top.filter((c) => !take.includes(c));
    G.rng.shuffle(rest); P.library.unshift(...rest);
    emit(G, 'reveal', `${P.name} puts ${take.length} of the ${top.length} revealed cards onto the battlefield.`, { who: P.i, cards: take.map((c) => c.id) });
  }, { score: () => -1, value: 0.2 })];
  return d;
};
S['Improvised Club'] = (d) => { d.addCost = { sac: { types: ['Artifact', 'Creature'] } }; d.spell = [{ k: 'dmg', n: 4, to: 'any' }]; d.effMv = 3; return d; };
S['Moria Marauder'] = (d) => {
  d.trig.push(T('hitPlayer', { you: true, cond: (G, src, ev) => orcish(ev.c), run: (G, X) => {
    const P = X.P, c = P.library.pop();
    if (!c) return;
    P.exile.push(c);
    P.xcast.push({ card: c, until: G.turn });
    emit(G, 'exile', `${P.name} exiles ${c.def.name} from the top of their library and may play it this turn.`, { who: P.i, cards: [c.id] });
  } }));
  return d;
};
S['Oliphaunt'] = (d) => { d.trig.push(T('attack', { self: true, eff: [{ k: 'pumpT', p: 2, t: 0, kw: ['trample'], tgt: { f: YOU, other: true } }] })); return d; };
S['Olog-hai Crusher'] = (d) => { d.blockIf = (G, b) => G.players[b.ctrl].bf.some((c) => c !== b && isCreature(c) && orcish(c)); return d; };
S["Quarrel's End"] = (d) => { d.addCost = { discard: 1 }; d.spell = [{ k: 'draw', n: 2 }, soldiers(1)]; return d; };
S['Rally at the Hornburg'] = (d) => { d.spell = [soldiers(2), { k: 'pumpAll', side: 'you', f: { sub: 'Human' }, p: 0, t: 0, kw: ['haste'] }]; return d; };
S['Rush the Room'] = (d) => {
  d.spell = [{ k: 'pump', f: {}, p: 1, t: 0, kw: ['first strike'] }, fn((G, X) => { const c = X.last && X.last.c; if (c && onBf(G, c) && orcish(c)) grantKw(G, c, ['haste']); }, { score: () => 0 })];
  return d;
};
S['Smite the Deathless'] = (d) => {
  d.spell = [fn((G, X, t) => { const c = t.c; c.tf.loseInd = true; c.exileDead = true; dirty(G); L.dealDamage(G, X, { c }, 3, {}); }, {
    tgt: tg({}), val: (G, P, c) => (c.ctrl === P.i ? -5 : Math.max(0, tou(c) - c.dmg) <= 3 ? cv(c) + 0.5 : 0.1), label: '3 damage to a creature' })];
  d.role = 'removal';
  d.value = 3.6;
  return d;
};
S['Spiteful Banditry'] = (d) => {
  const sweep = (G, P, n) => allCreatures(G).filter((c) => !has(c, 'indestructible') && L.lethalTo(c) <= n).reduce((s, c) => s + (c.ctrl === P.i ? -cv(c) : cv(c)), 0);
  d.etb = [fn((G, X) => {
    const n = X.item ? X.item.x || 0 : 0;
    if (!n) return;
    const cs = allCreatures(G);
    for (const c of cs) L.damageCreature(G, c, n, X.src);
    emit(G, 'hit', `${X.src.def.name} deals ${n} damage to each creature.`, { who: X.P.i, cards: cs.map((c) => c.id) });
  }, { score: () => 0 })];
  d.trig.push(T('die', { opp: true, once: true, eff: [{ k: 'treasure', n: 1 }] }));
  d.aiX = (G, P, card, max) => { let best = 0, bs = 0.5; for (let x = 0; x <= max; x++) { const s = sweep(G, P, x); if (s > bs) { bs = s; best = x; } } return best; };
  d.castScore = (G, P, card) => { const x = d.aiX(G, P, card, L.maxX(G, P, card)); return sweep(G, P, x); };
  d.value = 4;
  d.role = 'sweeper';
  return d;
};
const SMAUG = { name: 'Smaug', p: 6, t: 6, colors: ['R'], sub: ['Dragon'], kw: ['flying', 'haste'], legendary: true, text: 'Flying, haste. When Smaug dies, create fourteen Treasure tokens.', trig: [T('die', { self: true, eff: [{ k: 'treasure', n: 14 }] })] };
S['There and Back Again'] = (d) => {
  d.statics.push({ who: 'all', f: heldBy('noBlock'), p: 0, t: 0, kw: [], flags: { cantBlock: true } });
  d.saga = [
    { ch: [1], eff: [fn((G, X, t) => { remember(X.src, 'noBlock', t.c); dirty(G); emit(G, 'tapfx', `${t.c.def.name} can't block while ${X.P.name} controls ${X.src.def.name}.`, { who: X.P.i, cards: [t.c.id] }); }, { tgt: tg({}, { min: 0 }), val: (G, P, c) => (c.ctrl !== P.i ? cv(c) * 0.3 : -0.5), label: "Choose a creature that can't block" }), TEMPT] },
    { ch: [2], eff: [{ k: 'tutor', f: { types: ['Mountain'] }, to: 'bf' }] },
    { ch: [3], eff: [fn((G, X) => { const t = makeTokens(G, X.P, SMAUG, 1); emit(G, 'token', `${X.P.name} creates Smaug, a legendary 6/6 Dragon with flying and haste.`, { who: X.P.i, cards: t.map((c) => c.id) }); }, { score: () => 8 })] },
  ];
  d.value = 7;
  return d;
};
S['Warbeast of Gorgoroth'] = (d) => { d.trig.push(T('die', { you: true, cond: (G, src, ev) => ev.c === src || ev.pow >= 4, eff: [am(2)] })); return d; };

/* ============================ Green ============================ */
S['Bag End Porter'] = (d) => {
  d.trig.push(T('attack', { self: true, run: (G, X) => { const c = X.src, n = legendsOf(X.P).length; if (n && onBf(G, c)) pump(G, c, n, n); } }));
  return d;
};
S['Brandywine Farmer'] = (d) => { d.etb = [food(1)]; d.trig.push(T('leave', { self: true, eff: [food(1)] })); return d; };
S['Celeborn the Wise'] = (d) => {
  d.trig.push(T('attacks', { you: true, cond: (G, src, ev) => ev.cs.some((c) => hasSub(c, 'Elf')), eff: [{ k: 'scry', n: 1 }] }));
  d.trig.push(T('scry', { you: true, run: (G, X) => { const n = X.ev.n || 0; if (n && onBf(G, X.src)) pump(G, X.src, n, n); } }));
  return d;
};
S['Chance-Met Elves'] = (d) => { d.trig.push(T('scry', { you: true, once: true, eff: [{ k: 'countersSelf', n: 1 }] })); return d; };
S['Delighted Halfling'] = (d) => {
  d.manaAbs = [{ colors: ['C'] }, { colors: L.ANY, only: (pu) => !!pu.def && pu.def.supertypes.includes('Legendary'), unc: true }];
  d.value = 2.6;
  return d;
};
S['Dúnedain Rangers'] = (d) => {
  const noBearer = (G, src, ev, Q) => !L.ringBearer(G, Q);
  d.trig.push(T('landfall', { you: true, cond: noBearer, check: noBearer, eff: [TEMPT] }));
  return d;
};
S['Elven Chorus'] = (d) => { d.chorus = true; d.value = 4; return d; };
S['Elven Farsight'] = (d) => {
  d.spell = [{ k: 'scry', n: 3 }, fn((G, X) => { const top = X.P.library[X.P.library.length - 1]; if (top && top.def.types.includes('Creature')) { emit(G, 'reveal', `${X.P.name} reveals ${top.def.name}.`, { who: X.P.i, card: top.id }); drawN(G, X.P, 1); } }, { score: () => 0.5 })];
  return d;
};
S['Entish Restoration'] = (d) => {
  d.castIf = (G, P) => P.bf.some(isLand) && P.library.filter((c) => isLand(c) && c.def.supertypes.includes('Basic')).length >= 2;
  d.spell = [fn((G, X) => {
    const P = X.P, lands = P.bf.filter(isLand);
    if (!lands.length) return;
    const land = isHuman(G, P) && lands.length > 1 ? pickCards(G, { type: 'choose', reason: 'sacrifice-cost', n: 1, min: 1, max: 1, zone: 'battlefield', cards: lands.map((c) => c.id), label: X.src.def.name }, lands, 1)[0] : lands.slice().sort((a, b) => (b.tapped ? 1 : 0) - (a.tapped ? 1 : 0) || (a.def.supertypes.includes('Basic') ? 0 : 1) - (b.def.supertypes.includes('Basic') ? 0 : 1))[0];
    emit(G, 'sac', `${P.name} sacrifices ${land.def.name}.`, { who: P.i, cards: [land.id] });
    sacrifice(G, P, land, true);
    const n = P.bf.some((c) => isCreature(c) && pow(c) >= 4) ? 3 : 2;
    const got = L.searchLibrary(G, P, (c) => isLand(c) && c.def.supertypes.includes('Basic'), n, 'bfTapped', 'basic lands');
    emit(G, 'land', `${P.name} puts ${got.length ? nameListOf(got) : 'no lands'} onto the battlefield tapped.`, { who: P.i, cards: got.map((c) => c.id) });
  }, { score: (G, P) => 1.2 + (P.bf.some((c) => isCreature(c) && pow(c) >= 4) ? 0.9 : 0), value: 2.2 })];
  d.role = 'ramp';
  return d;
};
const nameListOf = (cs) => L.nameList(cs);
const entsFuryVal = (G, P, a, b) => { const boost = pow(a) >= 4 ? 2 : 1; return L.fightScore(G, P, a, b, boost, boost); };
S["Ent's Fury"] = (d) => {
  d.spell = [fn((G, X, t) => {
    const a = t.c, b = t.c2;
    if (!onBf(G, a)) return;
    if (pow(a) >= 4) addCounters(G, a, 1);
    pump(G, a, 1, 1);
    if (b && onBf(G, b)) L.fightCards(G, X.P, a, b);
  }, { tgt: { pair: true, fa: YOU, fb: OPP, labels: ['Choose your creature', 'Choose the creature it fights'] }, pairVal: entsFuryVal, label: 'Your creature fights one you don\'t control' })];
  d.role = 'removal';
  d.value = 3.2;
  return d;
};
S['Fall of Gil-galad'] = (d) => {
  d.saga = [
    { ch: [1], eff: [{ k: 'scry', n: 2 }] },
    { ch: [2], eff: [{ k: 'counters', n: 2, f: { side: 'you' } }] },
    { ch: [3], eff: [fn((G, X, t) => {
      const a = t.c, b = t.c2;
      if (!onBf(G, a)) return;
      a.xtrig = (a.xtrig || []).concat(T('die', { self: true, eot: true, eff: [{ k: 'draw', n: 2 }] }));
      emit(G, 'pump', `${a.def.name} gains "When this creature dies, draw two cards" until end of turn.`, { who: X.P.i, cards: [a.id] });
      if (b && onBf(G, b)) L.fightCards(G, X.P, a, b);
    }, { tgt: { pair: true, fa: YOU, fb: {}, optB: true, labels: ['Choose your creature', 'Choose a creature it fights (optional)'] }, pairVal: (G, P, a, b) => (b ? L.fightScore(G, P, a, b) + (b.ctrl === P.i ? -cv(b) : 0) : 0.1) + 1, label: 'Your creature fights up to one other creature' })] },
  ];
  d.value = 4;
  return d;
};
S['Fangorn, Tree Shepherd'] = (d) => {
  d.statics.push({ who: 'all', f: { side: 'you', sub: 'Treefolk' }, p: 0, t: 0, kw: ['vigilance'] });
  d.trig.push(T('attacks', { you: true, cond: (G, src, ev) => ev.cs.some((c) => hasSub(c, 'Treefolk')), run: (G, X) => { const n = X.ev.cs.filter((c) => hasSub(c, 'Treefolk')).length * 2; L.addPool(G, X.P, Array(n).fill('G')); emit(G, 'info', `${X.P.name} adds ${'{G}'.repeat(n)}.`, { who: X.P.i }); } }));
  d.keepGreen = true;
  return d;
};
S['Galadhrim Bow'] = (d) => {
  d.etb = [fn((G, X, t) => { if (L.attach(G, X.src, t.c)) { t.c.tapped = false; emit(G, 'tapfx', `${t.c.def.name} untaps.`, { who: X.P.i, cards: [t.c.id] }); } }, { tgt: tg(YOU), val: (G, P, c) => L.equipGain(G, P, { def: d, ctrl: P.i }, c) + (c.tapped ? 0.5 : 0) + 0.2, label: 'Attach it to a creature you control' })];
  return d;
};
S['Gift of Strands'] = (d) => { d.etb = [{ k: 'scry', n: 2 }]; return d; };
S['Glorfindel, Dauntless Rescuer'] = (d) => {
  d.trig.push(T('scry', { you: true, run: (G, X) => {
    const c = X.src;
    if (!onBf(G, c)) return;
    const O = X.O;
    const blockers = O.bf.filter((b) => isCreature(b) && !b.tapped).length;
    const k = chooseMode(G, X.P, c, `${c.def.name}: choose one`, ['It must be blocked this turn if able', "It can't be blocked by more than one creature"], blockers >= 2 ? 1 : 0);
    if (k === 0) c.tf.lure = true; else c.tf.maxOne = true;
    pump(G, c, 1, 1);
  } }));
  return d;
};
S['Last March of the Ents'] = (d) => {
  d.uncounterable = true;
  d.spell = [fn((G, X) => {
    const P = X.P;
    const n = Math.max(0, ...P.bf.filter(isCreature).map(tou));
    drawN(G, P, n);
    const cs = P.hand.filter((c) => c.def.types.includes('Creature'));
    const put = isHuman(G, P) ? pickCards(G, { type: 'choose', reason: 'put', n: cs.length, min: 0, max: cs.length, zone: 'hand', cards: cs.map((c) => c.id) }, cs, null) : cs;
    for (const c of put) { P.hand.splice(P.hand.indexOf(c), 1); L.enterBattlefield(G, P, c, null, {}); }
  }, { score: (G, P) => Math.max(0, ...P.bf.filter(isCreature).map(tou)) * 1.2 + P.hand.filter((c) => c.def.types.includes('Creature')).reduce((s, c) => s + c.def.value * 0.6, 0), value: 7 })];
  return d;
};
const targetsOf = (ev) => L.allTargets(ev.item.targets).map((t) => t.c).filter(Boolean);
S['Legolas, Master Archer'] = (d) => {
  d.trig.push(T('cast', { you: true, cond: (G, src, ev) => targetsOf(ev).includes(src), eff: [{ k: 'countersSelf', n: 1 }] }));
  d.trig.push(T('cast', { you: true, cond: (G, src, ev, Q) => targetsOf(ev).some((c) => isCreature(c) && c.ctrl !== Q.i), eff: [{ k: 'dmgX', nFn: (G, X) => Math.max(0, pow(X.src)), tgt: { f: {}, min: 0 } }] }));
  return d;
};
S['Long List of the Ents'] = (d) => {
  d.saga = [{ ch: [1, 2, 3, 4, 5, 6], eff: [fn((G, X) => {
    const P = X.P, noted = X.src.mem.noted || (X.src.mem.noted = []);
    const count = {};
    for (const c of P.hand.concat(P.library.slice(-3))) if (c.def.types.includes('Creature')) for (const t of c.def.sub) if (!noted.includes(t)) count[t] = (count[t] || 0) + (P.hand.includes(c) ? 2 : 1);
    const type = Object.entries(count).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
    const pick = type ? type[0] : ['Elf', 'Treefolk', 'Halfling', 'Human', 'Dwarf', 'Wizard'].find((t) => !noted.includes(t));
    if (!pick) return;
    noted.push(pick);
    (P.noteBonus = P.noteBonus || []).push({ type: pick, turn: G.turn });
    emit(G, 'info', `${P.name} notes ${pick}: the next ${pick} they cast this turn enters with an extra +1/+1 counter.`, { who: P.i });
  }, { score: () => 0.4 })] }];
  d.value = 2.4;
  return d;
};
S['Many Partings'] = (d) => { d.spell = [{ k: 'tutor', f: { types: ['Land'], fn: (dd) => dd.supertypes.includes('Basic') }, to: 'hand' }, food(1)]; return d; };
S['Meriadoc Brandybuck'] = (d) => { d.trig.push(T('attacks', { you: true, cond: (G, src, ev) => ev.cs.some((c) => hasSub(c, 'Halfling')), eff: [food(1)] })); return d; };
S['Mirkwood Spider'] = (d) => { d.trig.push(T('attack', { self: true, eff: [{ k: 'grant', kw: ['deathtouch'], tgt: { f: { side: 'you', legendary: true } } }] })); return d; };
S['Mushroom Watchdogs'] = (d) => {
  d.acts.push({ cost: { sac: FOODF }, sorcery: true, label: '+1/+1 counter and vigilance', run: (G, X) => { const c = X.src; if (!onBf(G, c)) return; addCounters(G, c, 1); grantKw(G, c, ['vigilance']); }, ai: (G, P) => ({ score: 1.1 + (P.life >= 12 ? 0.3 : -0.4) }) });
  return d;
};
S['Peregrin Took'] = (d) => {
  d.tokenFood = true;
  d.acts.push({ cost: { sac: Object.assign({ n: 3 }, FOODF) }, eff: [{ k: 'draw', n: 1 }], label: 'Draw a card', ai: (G, P) => (nFoods(P) >= 3 && P.life >= 10 ? { score: 1 } : null) });
  return d;
};
S["Pippin's Bravery"] = (d) => {
  d.spell = [{ k: 'pump', f: {}, p: 2, t: 2, kw: [] }, fn((G, X) => {
    const c = X.last && X.last.c, P = X.P;
    if (!c || !onBf(G, c) || !nFoods(P)) return;
    if (!yesNo(G, P, X.src, 'Sacrifice a Food to give it +4/+4 instead?', inCombat(c))) return;
    const f = pickFood(G, P);
    emit(G, 'sac', `${P.name} sacrifices ${f.def.name}.`, { who: P.i, cards: [f.id] });
    sacrifice(G, P, f, true);
    pump(G, c, 2, 2);
  }, { score: () => 0 })];
  return d;
};
S['Quickbeam, Upstart Ent'] = (d) => { d.trig.push(T('enter', { you: true, f: { sub: 'Treefolk' }, eff: [{ k: 'pumpT', p: 2, t: 2, kw: ['trample'], tgt: { f: {}, n: 2, min: 0 } }] })); return d; };
S['Radagast the Brown'] = (d) => {
  d.trig.push(T('enter', { you: true, f: { nontoken: true }, run: (G, X) => {
    const P = X.P, n = X.ev.c.def.mv;
    if (!n) return;
    const types = new Set(P.bf.filter(isCreature).flatMap((c) => L.subOf(c)));
    L.lookAtTop(G, P, n, (c) => c.def.types.includes('Creature') && !c.def.sub.some((t) => types.has(t)), 1, 'A creature that shares no type with yours');
  } }));
  d.value = 6;
  return d;
};
S['The Ring Goes South'] = (d) => {
  d.spell = [TEMPT, fn((G, X) => {
    const P = X.P, n = legendsOf(P).length;
    if (!n) return;
    const { hits, rest } = L.revealUntil(G, P, isLand, n);
    for (const c of hits) L.enterBattlefield(G, P, c, null, { tapped: true });
    G.rng.shuffle(rest); P.library.unshift(...rest);
    emit(G, 'land', `${P.name} reveals cards until ${n === 1 ? 'a land' : `${n} lands`} and puts ${hits.length === 1 ? 'it' : 'them'} onto the battlefield tapped.`, { who: P.i, cards: hits.map((c) => c.id) });
  }, { score: (G, P) => legendsOf(P).length + 0.5 })];
  return d;
};
S['Shortcut to Mushrooms'] = (d) => {
  d.etb = [TEMPT];
  d.trig.push(T('endStep', { you: true, cond: (G, src, ev, Q) => Q.leftTurn === G.turn, eff: [{ k: 'counters', n: 1, f: { side: 'you' } }] }));
  d.value = 2.6;
  return d;
};
S['Wose Pathfinder'] = (d) => {
  d.manaAbs = [{ colors: L.ANY }];
  d.acts.push({ cost: { m: C('{6}{G}'), tap: true }, eff: [{ k: 'pumpT', p: 3, t: 3, kw: ['trample'], tgt: { f: {}, other: true } }], label: '+3/+3 and trample', when: ['blocks'],
    ai: (G, P, c) => { const t = P.bf.filter((x) => x !== c && isCreature(x) && x.attacking && !x.blocked).sort((a, b) => pow(b) - pow(a))[0]; return t ? { score: 1.5 + (other(G, P).life <= pow(t) + 3 ? 100 : 0), targets: [{ c: t }] } : null; } });
  return d;
};

/* ============================ Multicolor ============================ */
const KCTR = ['first strike', 'vigilance', 'deathtouch', 'lifelink'];
S['Aragorn, Company Leader'] = (d) => {
  d.trig.push(T('tempt', { you: true, cond: otherBearer, run: (G, X) => {
    const c = X.src;
    if (!onBf(G, c)) return;
    const lacking = KCTR.findIndex((k) => !has(c, k));
    const k = chooseMode(G, X.P, c, `${c.def.name}: choose a counter`, KCTR.map((x) => `A ${x} counter`), lacking >= 0 ? lacking : 0);
    addCounters(G, c, 1, KCTR[k]);
  } }));
  d.trig.push(T('counters', { cond: (G, src, ev) => ev.c === src, eff: [fn((G, X, t) => addCounters(G, t.c, X.ev.n > 1 ? 1 : 1, X.ev.kind), { tgt: tg({}, { other: true, min: 0 }), val: (G, P, c) => (c.ctrl === P.i ? 0.8 + cv(c) * 0.05 : -1), label: 'Give another creature the same kind of counter' })] }));
  return d;
};
S['Aragorn, the Uniter'] = (d) => {
  const col = (k) => (G, src, ev) => ev.card.def.colors.includes(k);
  d.trig.push(T('cast', { you: true, cond: col('W'), eff: [soldiers(1)] }));
  d.trig.push(T('cast', { you: true, cond: col('U'), eff: [{ k: 'scry', n: 2 }] }));
  d.trig.push(T('cast', { you: true, cond: col('R'), eff: [{ k: 'dmg', n: 3, to: 'player' }] }));
  d.trig.push(T('cast', { you: true, cond: col('G'), eff: [{ k: 'pumpT', p: 4, t: 4, tgt: { f: {} } }] }));
  return d;
};
S['Arwen, Mortal Queen'] = (d) => {
  d.etbCtr = () => ({ indestructible: 1 });
  d.acts.push({ cost: { m: C('{1}'), ctr: { kind: 'indestructible', n: 1 } }, label: 'Protect another creature', when: ['blocks'],
    eff: [fn((G, X, t) => { const c = t.c, me = X.src; grantKw(G, c, ['indestructible']); addCounters(G, c, 1); addCounters(G, c, 1, 'lifelink'); if (onBf(G, me)) { addCounters(G, me, 1); addCounters(G, me, 1, 'lifelink'); } }, { tgt: tg({}, { other: true }), val: (G, P, c) => (c.ctrl === P.i ? cv(c) * 0.2 : -2), label: 'Give another creature indestructible' })],
    ai: (G, P, c) => { const t = dyingInCombat(G, P).filter((x) => x !== c).sort((a, b) => cv(b) - cv(a))[0]; return t ? { score: cv(t) - 1, targets: [{ c: t }] } : null; } });
  return d;
};
S['Arwen Undómiel'] = (d) => {
  d.trig.push(T('scry', { you: true, eff: [{ k: 'counters', n: 1, f: {} }] }));
  d.acts.push({ cost: { m: C('{4}{G}{U}') }, eff: [{ k: 'scry', n: 2 }], label: 'Scry 2', when: ['end', 'main2'], ai: (G, P) => ({ score: 1.6 }) });
  return d;
};
S["The Balrog, Durin's Bane"] = (d) => {
  d.costMod = (G) => G.sacThisTurn || 0;
  d.blockOnlyBy = (G, b) => isLegendary(b);
  d.trig.push(T('die', { self: true, eff: [{ k: 'destroyP', tgt: { f: { types: ['Artifact', 'Creature'], side: 'opp' } } }] }));
  return d;
};
S['Bilbo, Retired Burglar'] = (d) => {
  d.etb = [TEMPT];
  d.trig.push(T('leave', { self: true, eff: [TEMPT] }));
  d.hit = [{ k: 'treasure', n: 1 }];
  return d;
};
S['Butterbur, Bree Innkeeper'] = (d) => {
  const none = (G, src, ev, Q) => !nFoods(Q);
  d.trig.push(T('endStep', { you: true, cond: none, check: none, eff: [food(1)] }));
  return d;
};
S['Denethor, Ruling Steward'] = (d) => {
  const died = (G, src, ev, Q) => diedThisTurn(G, Q) > 0;
  d.trig.push(T('endStep', { you: true, cond: died, check: died, eff: [soldiers(1)] }));
  d.acts.push({ cost: { m: C('{2}'), sac: { other: true } }, eff: [{ k: 'drain', n: 1 }, { k: 'gain', n: 1 }], label: 'Drain 1' });
  return d;
};
S['Doors of Durin'] = (d) => {
  d.trig.push(T('attacks', { you: true, run: (G, X) => {
    const P = X.P;
    scryChoice(G, P, 2);
    const top = P.library[P.library.length - 1];
    if (!top || !top.def.types.includes('Creature')) { if (top) emit(G, 'reveal', `${P.name} reveals ${top.def.name}.`, { who: P.i, card: top.id }); return; }
    P.library.pop();
    emit(G, 'reveal', `${P.name} reveals ${top.def.name} and puts it onto the battlefield tapped and attacking.`, { who: P.i, card: top.id });
    L.enterBattlefield(G, P, top, null, { tapped: true });
    if (onBf(G, top) && G.combat) { top.attacking = true; G.combat.attackers.push(top); }
    const until = G.turn + 2;
    const kws = [];
    if (P.bf.some((c) => isCreature(c) && hasSub(c, 'Dwarf'))) kws.push('trample');
    if (P.bf.some((c) => isCreature(c) && hasSub(c, 'Elf'))) kws.push('hexproof');
    if (kws.length) top.timedKw = kws.map((kw) => ({ kw, until }));
  } }));
  d.value = 5;
  return d;
};
S['Elrond, Master of Healing'] = (d) => {
  d.trig.push(T('scry', { you: true, eff: [{ k: 'ctrs', n: 1, tgt: { f: {}, min: 0, nFn: (G, X) => (X.ev && X.ev.n) || 1 } }] }));
  d.trig.push(T('targeted', { cond: (G, src, ev, Q) => ev.c.ctrl === Q.i && isCreature(ev.c) && ev.c.cnt > 0 && ev.by !== Q, may: true, mayLabel: 'Draw a card (Elrond)?', eff: [{ k: 'draw', n: 1 }] }));
  return d;
};
S['Éowyn, Fearless Knight'] = (d) => {
  d.etb = [fn((G, X, t) => {
    const cols = t.c.def.colors.slice();
    L.exilePermanent(G, X.P, t.c);
    if (cols.length) for (const c of legendsOf(X.P)) c.tf.proColors = (c.tf.proColors || []).concat(cols);
    if (cols.length) emit(G, 'pump', `${X.P.name}'s legendary creatures gain protection from ${cols.map((x) => ({ W: 'white', U: 'blue', B: 'black', R: 'red', G: 'green' })[x]).join(' and ')} until end of turn.`, { who: X.P.i });
  }, { tgt: tg({ side: 'opp', fn: (G, c, P, src) => pow(c) > pow(src) }), val: (G, P, c) => pv(G, c) + 0.5, label: 'Exile a creature with greater power' })];
  return d;
};
S['Faramir, Prince of Ithilien'] = (d) => {
  d.trig.push(T('endStep', { you: true, run: (G, X) => {
    const P = X.P, O = X.O, at = G.turn + 1;
    emit(G, 'info', `${X.src.def.name} watches ${O.name}: ${P.name} draws a card at their end step unless they attack, and gets three soldiers if they do.`, { who: P.i });
    G.delayed.push({ when: 'end', at, run: (GG) => {
      if (O.attackedWith > 0) { const m = makeTokens(GG, P, { p: 1, t: 1, colors: ['W'], sub: ['Human', 'Soldier'], kw: [] }, 3); emit(GG, 'token', `${P.name} creates three 1/1 Human Soldier tokens.`, { who: P.i, cards: m.map((c) => c.id) }); }
      else drawN(GG, P, 1);
    } });
  } }));
  return d;
};
S['Flame of Anor'] = (d) => {
  d.modes = [
    { label: 'Target player draws two cards', eff: [fn((G, X, t) => drawN(G, G.players[t.p], 2), { tgt: { what: 'player' }, val: (G, P, x) => (x.p === P.i ? 2.6 : -2.5), label: 'Choose a player to draw two cards' })] },
    { label: 'Destroy target artifact', eff: [{ k: 'destroyP', tgt: { f: { types: ['Artifact'] } } }] },
    { label: '5 damage to target creature', eff: [{ k: 'dmg', n: 5, to: 'creature', f: {} }] },
  ];
  d.modeN = (G, P) => (P.bf.some((c) => isCreature(c) && hasSub(c, 'Wizard')) ? 2 : 1);
  d.spell = null;
  return d;
};
S['Friendly Rivalry'] = (d) => {
  d.spell = [
    fn(() => {}, { tgt: tg(YOU), val: (G, P, c) => Math.max(0, pow(c)) * 0.3 + 0.1, label: 'Choose your creature' }),
    fn(() => {}, { tgt: { f: { side: 'you', legendary: true }, min: 0, fn: (G, P, c, src, X) => !(X && X.prevT && X.prevT.c === c) && !(X && X.ts && X.ts[0] && X.ts[0].c === c) }, val: (G, P, c) => Math.max(0, pow(c)) * 0.3, label: 'Choose another legendary creature you control (optional)' }),
    fn((G, X, t) => {
      const victim = t.c;
      for (const k of [0, 1]) { const s = X.ts && X.ts[k] && X.ts[k].c; if (s && onBf(G, s) && s.ctrl === X.P.i && onBf(G, victim)) L.biteCards(G, X.P, s, victim); }
    }, { tgt: tg(OPP), val: (G, P, c, X) => { const a = X && X.ts ? X.ts.map((t) => t && t.c).filter(Boolean) : []; const dmg = (a.length ? a : P.bf.filter(isCreature)).reduce((s, x) => s + Math.max(0, pow(x)), 0); return L.lethalTo(c) <= dmg ? cv(c) + 0.5 : 0.1; }, label: 'Choose the creature they damage' }),
  ];
  d.role = 'removal';
  d.value = 3;
  return d;
};
S['Frodo Baggins'] = (d) => {
  d.trig.push(T('enter', { you: true, f: { legendary: true }, eff: [TEMPT] }));
  d.lureBearer = true;
  return d;
};
S['Galadriel of Lothlórien'] = (d) => {
  d.trig.push(T('tempt', { you: true, cond: otherBearer, eff: [{ k: 'scry', n: 3 }] }));
  d.trig.push(T('scry', { you: true, run: (G, X) => { const P = X.P, top = P.library[P.library.length - 1]; if (top && isLand(top)) { P.library.pop(); emit(G, 'reveal', `${P.name} reveals ${top.def.name} and puts it onto the battlefield tapped.`, { who: P.i, card: top.id }); L.enterBattlefield(G, P, top, null, { tapped: true }); } } }));
  return d;
};
S['Gandalf the Grey'] = (d) => {
  const MODES = ['Tap or untap a permanent', '3 damage to each opponent', 'Copy that spell', 'Put Gandalf on top of your library'];
  d.trig.push(T('cast', { you: true, cond: (G, src, ev) => isIS(ev.card.def) && (src.mem.used || []).length < 4, run: (G, X) => {
    const g = X.src, P = X.P, used = g.mem.used || (g.mem.used = []);
    const left = [0, 1, 2, 3].filter((k) => !used.includes(k));
    if (!left.length) return;
    const item = X.ev.item;
    let aiK = left.includes(1) ? 1 : left[0];
    if (left.includes(2) && item.copyable !== false) { const ch = L.chooseTargets(G, P, L.spellEffects(item.card.def, item.mode), 'main2', item.card, { x: item.x }); if (ch && ch.score >= 3) aiK = 2; }
    if (aiK === 3 && left.length === 1) aiK = 3;
    const pick = left[chooseMode(G, P, g, `${g.def.name}: choose one that hasn't been chosen`, left.map((k) => MODES[k]), left.indexOf(aiK))];
    used.push(pick);
    if (pick === 0) G.pending.unshift({ src: g, P, t: { eff: [fn((GG, XX, t) => { const c = t.c; const tap = isHuman(GG, P) ? chooseMode(GG, P, g, `Tap or untap ${c.def.name}?`, ['Tap it', 'Untap it'], c.tapped ? 1 : 0) === 0 : !c.tapped; c.tapped = tap; emit(GG, 'tapfx', `${c.def.name} is ${tap ? 'tapped' : 'untapped'}.`, { who: P.i, cards: [c.id] }); }, { tgt: { f: { types: ['any'] } }, val: (GG, PP, c) => (c.ctrl !== PP.i ? (isCreature(c) && !c.tapped ? cv(c) * 0.3 : 0.1) : c.tapped ? 0.4 : -0.2), label: 'Tap or untap a permanent' })] }, ev: X.ev });
    else if (pick === 1) { L.damagePlayer(G, X.O, 3, g, P); emit(G, 'hit', `${g.def.name} deals 3 damage to ${X.O.name}.`, { who: P.i, card: g.id, target: `p${X.O.i}`, amount: 3 }); }
    else if (pick === 2) { if (item.copyable !== false) L.copySpell(G, P, item); }
    else if (onBf(G, g)) { const Q = G.players[g.owner]; L.leaveBattlefield(G, g); L.resetCard(g); Q.library.push(g); emit(G, 'bounce', `${g.def.name} goes to the top of ${Q.name}'s library.`, { who: P.i, cards: [g.id] }); }
  } }));
  d.value = 6;
  return d;
};
S["Gandalf's Sanction"] = (d) => {
  d.spell = [{ k: 'dmgX', tgt: { f: {} }, excess: true, nFn: (G, X) => X.P.gy.filter((c) => c !== X.src && isIS(c.def)).length }];
  return d;
};
S['Gimli, Mournful Avenger'] = (d) => {
  d.statics.push({ who: 'self', cond: (G, src, P) => diedThisTurn(G, P) >= 2, p: 0, t: 0, kw: ['indestructible'] });
  d.trig.push(T('die', { you: true, other: true, counted: true, run: (G, X) => {
    const g = X.src;
    if (onBf(G, g)) addCounters(G, g, 1);
    if (X.nth === 3 && onBf(G, g)) G.pending.unshift({ src: g, P: X.P, t: { eff: [fn((GG, XX, t) => L.fightCards(GG, XX.P, g, t.c), { tgt: tg(OPP, { min: 0 }), val: (GG, PP, c) => L.fightScore(GG, PP, g, c), label: 'Gimli fights a creature' })] }, ev: {} });
  } }));
  return d;
};
S['Gwaihir the Windlord'] = (d) => {
  d.costMod = (G, P) => ((P.drawn || 0) >= 2 ? 2 : 0);
  d.statics.push({ who: 'all', f: { side: 'you', other: true, sub: 'Bird' }, p: 0, t: 0, kw: ['vigilance'] });
  return d;
};
const spiritOf = (G, src, c, Q) => c.ctrl === Q.i && isCreature(c) && (c === src || hasSub(c, 'Spirit'));
S['King of the Oathbreakers'] = (d) => {
  d.trig.push(T('targeted', { cond: (G, src, ev, Q) => ev.spell && onBf(G, ev.c) && spiritOf(G, src, ev.c, Q), run: (G, X) => L.phaseOut(G, X.ev.c) }));
  d.trig.push(T('phaseIn', { cond: (G, src, ev, Q) => spiritOf(G, src, ev.c, Q), eff: fx('Create a tapped 1/1 white Spirit creature token with flying.') }));
  return d;
};
S['Legolas, Counter of Kills'] = (d) => {
  d.trig.push(T('scry', { you: true, once: true, cond: (G, src) => src.tapped, run: (G, X) => { if (X.src.tapped && yesNo(G, X.P, X.src, 'Untap Legolas?', true)) { X.src.tapped = false; emit(G, 'tapfx', `${X.src.def.name} untaps.`, { who: X.P.i, cards: [X.src.id] }); } } }));
  d.trig.push(T('die', { opp: true, eff: [{ k: 'countersSelf', n: 1 }] }));
  return d;
};
S['Lotho, Corrupt Shirriff'] = (d) => { d.trig.push(T('cast', { cond: (G, src, ev) => ev.nth === 2, eff: [{ k: 'loseSelf', n: 1 }, { k: 'treasure', n: 1 }] })); return d; };
S['Mauhúr, Uruk-hai Captain'] = (d) => { d.plusOne = true; return d; };
S['Merry, Esquire of Rohan'] = (d) => {
  d.statics.push({ who: 'self', cond: (G, src) => isEquipped(G, src), p: 0, t: 0, kw: ['first strike'] });
  d.trig.push(T('attacks', { you: true, cond: (G, src, ev) => ev.cs.includes(src) && ev.cs.some((c) => c !== src && isLegendary(c)), eff: [{ k: 'draw', n: 1 }] }));
  return d;
};
S['The Mouth of Sauron'] = (d) => {
  d.etb = [{ k: 'mill', n: 3, tgt: { what: 'player' } }, { k: 'amass', nFn: (G, X) => { const p = X.last && X.last.p != null ? G.players[X.last.p] : X.O || other(G, X.P); return p.gy.filter((c) => isIS(c.def)).length; } }];
  return d;
};
S['Old Man Willow'] = (d) => {
  d.ptFn = (G, c) => G.players[c.ctrl].bf.filter(isLand).length;
  d.power = 0; d.toughness = 0;
  d.trig.push(T('attack', { self: true, run: (G, X) => {
    const P = X.P, me = X.src;
    const opts = P.bf.filter((x) => x !== me && (isCreature(x) || x.token));
    if (!opts.length) return;
    const prey = X.O.bf.filter((c) => isCreature(c) && tou(c) - c.dmg <= 2 && !has(c, 'indestructible')).sort((a, b) => cv(b) - cv(a))[0];
    const fodder = opts.slice().sort((a, b) => pv(G, a) - pv(G, b))[0];
    let pick;
    if (isHuman(G, P)) { if (!yesNo(G, P, me, 'Sacrifice another creature or a token to give an opposing creature -2/-2?', false)) return; pick = opts.length === 1 ? opts[0] : pickCards(G, { type: 'choose', reason: 'sacrifice-cost', n: 1, min: 1, max: 1, zone: 'battlefield', cards: opts.map((c) => c.id), label: me.def.name }, opts, 1)[0]; }
    else { if (!prey || cv(prey) <= pv(G, fodder) + 0.5) return; pick = fodder; }
    emit(G, 'sac', `${P.name} sacrifices ${pick.def.name}.`, { who: P.i, cards: [pick.id] });
    sacrifice(G, P, pick, true);
    G.pending.unshift({ src: me, P, t: { eff: [{ k: 'pumpT', p: -2, t: -2, tgt: { f: OPP } }] }, ev: {} });
  } }));
  d.value = 5;
  return d;
};
const CARD_TYPES = ['Creature', 'Instant', 'Sorcery', 'Artifact', 'Enchantment'];
S['Pippin, Guard of the Citadel'] = (d) => {
  d.acts.push({ cost: { tap: true }, label: 'Protection from a card type', when: ['blocks'],
    eff: [fn((G, X, t) => { const c = t.c; const k = chooseMode(G, X.P, X.src, `Protect ${c.def.name} from which card type?`, CARD_TYPES, 0); c.tf.proTypes = (c.tf.proTypes || []).concat(CARD_TYPES[k]); dirty(G); emit(G, 'pump', `${c.def.name} gains protection from ${CARD_TYPES[k].toLowerCase()}s until end of turn.`, { who: X.P.i, cards: [c.id] }); }, { tgt: tg(YOU, { other: true }), val: (G, P, c) => (inCombat(c) ? cv(c) * 0.5 : 0.1), label: 'Protect another creature you control' })],
    ai: (G, P, c) => { const t = dyingInCombat(G, P).filter((x) => x !== c && (x.attacking || x.blocking)).sort((a, b) => cv(b) - cv(a))[0]; return t ? { score: cv(t), targets: [{ c: t }] } : null; } });
  return d;
};
S['Prince Imrahil the Fair'] = (d) => { d.trig.push(T('draw', { you: true, cond: (G, src, ev) => ev.nth === 2, eff: [soldiers(1)] })); return d; };
S['Ringsight'] = (d) => {
  d.spell = [TEMPT, { k: 'tutor', f: { types: ['any'], fn: (dd, card, G) => G.players[card.owner].bf.some((c) => isCreature(c) && isLegendary(c) && c.def.colors.some((col) => dd.colors.includes(col))) }, to: 'hand' }];
  return d;
};
S['Rise of the Witch-king'] = (d) => {
  d.spell = [fn((G, X) => {
    const P = X.P;
    let mine = null;
    for (const Q of [P, X.O]) {
      const cs = Q.bf.filter(isCreature);
      if (!cs.length) continue;
      const v = L.sacrificeChoice(G, Q, cs);
      emit(G, 'sac', `${Q.name} sacrifices ${v.def.name}.`, { who: Q.i, cards: [v.id] });
      sacrifice(G, Q, v, true);
      if (Q === P) mine = v;
    }
    if (!mine) return;
    const back = P.gy.filter((c) => c !== mine && !isIS(c.def));
    if (!back.length) return;
    let pick;
    if (isHuman(G, P)) pick = pickCards(G, { type: 'choose', reason: 'return', n: 1, min: 0, max: 1, zone: 'graveyard', cards: back.map((c) => c.id) }, back, null)[0];
    else pick = back.slice().sort((a, b) => b.def.value - a.def.value)[0];
    if (!pick) return;
    P.gy.splice(P.gy.indexOf(pick), 1);
    emit(G, 'raise', `${pick.def.name} returns to the battlefield.`, { who: P.i, cards: [pick.id] });
    L.enterBattlefield(G, P, pick, null, {});
  }, { score: (G, P) => { const mineC = P.bf.filter(isCreature), theirs = other(G, P).bf.filter(isCreature); if (!mineC.length || !theirs.length) return -1; const back = P.gy.filter((c) => !isIS(c.def)); return Math.min(...theirs.map(cv)) - Math.min(...mineC.map(cv)) + (back.length ? Math.max(...back.map((c) => c.def.value)) * 0.4 : 0); }, value: 4 })];
  return d;
};
S['Samwise Gamgee'] = (d) => {
  d.trig.push(T('enter', { you: true, other: true, f: { nontoken: true }, eff: [food(1)] }));
  d.acts.push({ cost: { sac: Object.assign({ n: 3 }, FOODF) }, eff: [{ k: 'regrow', tgt: { what: 'gy', mine: true, f: { types: ['historic'] } } }], label: 'Return a historic card to your hand' });
  return d;
};
S['Saruman of Many Colors'] = (d) => {
  d.wardCost = (G, P) => {
    const cs = P.hand.filter((c) => isIS(c.def) || c.def.types.includes('Enchantment'));
    if (!cs.length) return false;
    const pick = isHuman(G, P) ? pickCards(G, { type: 'choose', reason: 'discard-cost', n: 1, min: 1, max: 1, zone: 'hand', cards: cs.map((c) => c.id), label: 'Ward' }, cs, 1)[0] : cs.slice().sort((a, b) => handValue(G, P, a) - handValue(G, P, b))[0];
    P.hand.splice(P.hand.indexOf(pick), 1); P.gy.push(pick);
    emit(G, 'discard', `${P.name} discards ${pick.def.name} to pay for ward.`, { who: P.i, cards: [pick.id] });
    return true;
  };
  d.trig.push(T('cast', { you: true, cond: (G, src, ev) => ev.nth === 2, run: (G, X) => {
    const P = X.P, O = X.O, mv = X.ev.card.def.mv;
    const milled = mill(G, O, 2);
    if (!milled.length) return;
    const pool = O.gy.filter((c) => (isIS(c.def) || c.def.types.includes('Enchantment')) && c.def.mv <= mv);
    if (!pool.length) return;
    let pick;
    if (isHuman(G, P)) pick = pickCards(G, { type: 'choose', reason: 'copy', n: 1, min: 1, max: 1, zone: 'graveyard', cards: pool.map((c) => c.id) }, pool, 1)[0];
    else pick = pool.slice().sort((a, b) => b.def.value - a.def.value)[0];
    O.gy.splice(O.gy.indexOf(pick), 1); O.exile.push(pick);
    emit(G, 'exile', `${P.name} exiles ${pick.def.name} from ${O.name}'s graveyard.`, { who: P.i, cards: [pick.id] });
    if (yesNo(G, P, X.src, `Cast a copy of ${pick.def.name} without paying its mana cost?`, true)) L.castCopyOfCard(G, P, pick.def);
  } }));
  d.value = 8;
  return d;
};
S['Sauron, the Dark Lord'] = (d) => {
  d.wardCost = (G, P) => {
    const cs = P.bf.filter((c) => isLegendary(c) && (isCreature(c) || isArtifact(c)));
    if (!cs.length) return false;
    const pick = isHuman(G, P) && cs.length > 1 ? pickCards(G, { type: 'choose', reason: 'sacrifice-cost', n: 1, min: 1, max: 1, zone: 'battlefield', cards: cs.map((c) => c.id), label: 'Ward' }, cs, 1)[0] : cs.slice().sort((a, b) => pv(G, a) - pv(G, b))[0];
    emit(G, 'sac', `${P.name} sacrifices ${pick.def.name} to pay for ward.`, { who: P.i, cards: [pick.id] });
    sacrifice(G, P, pick, true);
    return true;
  };
  d.trig.push(T('cast', { opp: true, eff: [am(1)] }));
  d.trig.push(T('hitPlayer', { you: true, cond: (G, src, ev) => hasSub(ev.c, 'Army'), eff: [TEMPT] }));
  d.trig.push(T('tempt', { you: true, run: (G, X) => {
    const P = X.P;
    const worth = P.hand.reduce((s, c) => s + handValue(G, P, c), 0);
    if (!yesNo(G, P, X.src, 'Discard your hand and draw four cards?', P.hand.length <= 2 || worth < 8)) return;
    const n = P.hand.length;
    P.gy.push(...P.hand.splice(0));
    emit(G, 'discard', `${P.name} discards ${n === 1 ? 'a card' : `${n} cards`}.`, { who: P.i });
    drawN(G, P, 4);
  } }));
  d.value = 12;
  return d;
};
S["Sauron's Ransom"] = (d) => {
  d.spell = [fn((G, X) => {
    const P = X.P, O = X.O;
    const top = P.library.splice(Math.max(0, P.library.length - 4)).reverse();
    if (!top.length) return;
    // The opponent splits the cards; the caster sees the face-up pile and picks one pile
    let down;
    if (isHuman(G, O)) down = pickCards(G, { type: 'choose', reason: 'pile', n: top.length, min: 0, max: top.length, zone: 'library', cards: top.map((c) => c.id), label: 'Choose the face-down pile' }, top, null);
    else { const best = top.slice().sort((a, b) => b.def.value - a.def.value); down = best.slice(1); }
    const up = top.filter((c) => !down.includes(c));
    emit(G, 'reveal', `${O.name} splits the cards: face up ${up.length ? L.nameList(up) : 'nothing'}, and ${down.length === 1 ? 'one card' : `${down.length} cards`} face down.`, { who: O.i, cards: up.map((c) => c.id) });
    const upV = up.reduce((s, c) => s + c.def.value, 0), downV = down.length * 3.2;
    const k = chooseMode(G, P, X.src, `${X.src.def.name}: which pile goes to your hand?`, [`The face-up pile (${up.length ? L.nameList(up) : 'empty'})`, `The face-down pile (${down.length} card${down.length === 1 ? '' : 's'})`], upV >= downV ? 0 : 1);
    const hand = k === 0 ? up : down, gy = k === 0 ? down : up;
    P.hand.push(...hand); P.gy.push(...gy);
    emit(G, 'draw', `${P.name} puts ${hand.length === 1 ? 'a card' : `${hand.length} cards`} into their hand and the rest into their graveyard.`, { who: P.i });
  }, { score: () => 2.5, value: 2.5 }), TEMPT];
  return d;
};
S['Shadowfax, Lord of Horses'] = (d) => {
  d.statics.push({ who: 'all', f: { side: 'you', sub: 'Horse' }, p: 0, t: 0, kw: ['haste'] });
  d.trig.push(T('attack', { self: true, run: (G, X) => {
    const P = X.P, me = X.src;
    const cs = P.hand.filter((c) => c.def.types.includes('Creature') && c.def.power < pow(me));
    if (!cs.length) return;
    const pick = isHuman(G, P) ? pickCards(G, { type: 'choose', reason: 'put', n: 1, min: 0, max: 1, zone: 'hand', cards: cs.map((c) => c.id), label: 'Put it onto the battlefield tapped and attacking' }, cs, null)[0] : cs.slice().sort((a, b) => b.def.value - a.def.value)[0];
    if (!pick) return;
    P.hand.splice(P.hand.indexOf(pick), 1);
    L.enterBattlefield(G, P, pick, null, { tapped: true });
    if (onBf(G, pick) && G.combat) { pick.attacking = true; G.combat.attackers.push(pick); emit(G, 'attack', `${pick.def.name} enters tapped and attacking.`, { who: P.i, cards: [pick.id] }); }
  } }));
  return d;
};
S['Shagrat, Loot Bearer'] = (d) => {
  d.trig.push(T('attack', { self: true, eff: [
    fn((G, X, t) => L.attach(G, t.c, X.src), { tgt: tg({ types: ['Equipment'] }, { min: 0 }), val: (G, P, c, X) => (X && X.src && c.att === X.src.id ? -0.1 : 0.6 + (c.ctrl !== P.i ? 0.6 : 0)), label: 'Attach an Equipment to Shagrat' }),
    { k: 'amass', nFn: (G, X) => L.equipmentOn(G, X.src).length },
  ] }));
  return d;
};
S['Sharkey, Tyrant of the Shire'] = (d) => { d.sharkey = true; return d; };
const SHELOB_FOOD = (orig) => Object.assign({}, orig, { id: `${orig.id}-food`, token: true, types: ['Artifact'], sub: ['Food'], power: 0, toughness: 0, typeLine: 'Token Artifact — Food', acts: (orig.acts || []).concat(FOOD.acts), kw: orig.kw.slice() });
S['Shelob, Child of Ungoliant'] = (d) => {
  d.statics.push({ who: 'all', f: { side: 'you', other: true, sub: 'Spider' }, p: 0, t: 0, kw: ['deathtouch'], ward: 2 });
  d.trig.push(T('die', { cond: (G, src, ev, Q) => ev.c !== src && ev.spider && ev.spiderBy === Q.i, run: (G, X) => {
    const orig = X.ev.c.def;
    const id = `${orig.id}-food`;
    if (!G.defs[id]) G.defs[id] = SHELOB_FOOD(orig);
    const t = A._internal.newCard(G, G.defs[id], X.P.i);
    t.token = true;
    emit(G, 'token', `${X.P.name} creates a Food copy of ${orig.name}.`, { who: X.P.i });
    L.enterBattlefield(G, X.P, t, null, {});
  } }));
  d.value = 14;
  return d;
};
S['Sméagol, Helpful Guide'] = (d) => {
  const died = (G, src, ev, Q) => diedThisTurn(G, Q) > 0;
  d.trig.push(T('endStep', { you: true, cond: died, check: died, eff: [TEMPT] }));
  d.trig.push(T('tempt', { you: true, run: (G, X) => {
    const O = X.O;
    const { hits, rest } = L.revealUntil(G, O, isLand, 1);
    O.gy.push(...rest);
    if (rest.length) emit(G, 'mill', `${O.name} reveals ${rest.length} nonland card${rest.length === 1 ? '' : 's'}, which go to the graveyard.`, { who: O.i, cards: rest.map((c) => c.id) });
    for (const c of hits) { emit(G, 'land', `${X.P.name} puts ${c.def.name} onto the battlefield tapped under their control.`, { who: X.P.i, card: c.id }); L.enterBattlefield(G, X.P, c, null, { tapped: true }); }
  } }));
  return d;
};
S['Strider, Ranger of the North'] = (d) => {
  d.trig.push(T('landfall', { you: true, eff: [{ k: 'pumpT', p: 1, t: 1, tgt: { f: {} } }, fn((G, X) => { const c = X.last && X.last.c; if (c && onBf(G, c) && pow(c) >= 4) grantKw(G, c, ['first strike']); }, { score: () => 0 })] }));
  return d;
};
S['Théoden, King of Rohan'] = (d) => { d.trig.push(T('enter', { you: true, f: { sub: 'Human' }, eff: [{ k: 'grant', kw: ['double strike'], tgt: { f: {} } }] })); return d; };
S['Tom Bombadil'] = (d) => {
  d.statics.push({ who: 'self', cond: (G, src, P) => P.bf.filter((c) => c.def.saga).reduce((s, c) => s + ctrCount(c, 'lore'), 0) >= 4, p: 0, t: 0, kw: ['hexproof', 'indestructible'] });
  d.trig.push(T('sagaFinal', { you: true, once: true, run: (G, X) => {
    const P = X.P;
    const { hits, rest } = L.revealUntil(G, P, (c) => !!c.def.saga, 1);
    G.rng.shuffle(rest); P.library.unshift(...rest);
    for (const c of hits) { emit(G, 'reveal', `${P.name} reveals ${c.def.name} and puts it onto the battlefield.`, { who: P.i, card: c.id }); L.enterBattlefield(G, P, c, null, {}); }
  } }));
  return d;
};
S['Uglúk of the White Hand'] = (d) => {
  d.trig.push(T('die', { you: true, other: true, run: (G, X) => { if (onBf(G, X.src)) addCounters(G, X.src, X.ev.sub.includes('Goblin') || X.ev.sub.includes('Orc') ? 2 : 1); } }));
  return d;
};

/* ============================ Artifacts ============================ */
const SPIRIT = { p: 1, t: 1, colors: ['W'], sub: ['Spirit'], kw: ['flying'] };
S['Andúril, Flame of the West'] = (d) => {
  d.trig.push(T('attack', { hostOnly: true, run: (G, X) => {
    const host = X.ev.c, leg = isLegendary(host);
    const ts = makeTokens(G, X.P, SPIRIT, 2, { tapped: true });
    if (leg && G.combat) for (const t of ts) if (isCreature(t)) { t.attacking = true; G.combat.attackers.push(t); }
    emit(G, 'token', `${X.P.name} creates two tapped 1/1 Spirit tokens with flying${leg ? ' that are attacking' : ''}.`, { who: X.P.i, cards: ts.map((c) => c.id) });
  } }));
  d.equipAi = (G, P, t) => (isLegendary(t) ? 2.5 : 1.2);
  d.value = 7;
  return d;
};
S['Barrow-Blade'] = (d) => {
  const strip = (G, c) => { if (!onBf(G, c)) return; c.tf.noAbil = true; dirty(G); emit(G, 'tapfx', `${c.def.name} loses all abilities until end of turn.`, { who: c.ctrl, cards: [c.id] }); };
  d.trig.push(T('blocked', { hostOnly: true, run: (G, X) => X.ev.by.forEach((b) => strip(G, b)) }));
  d.trig.push(T('blocks', { hostOnly: true, run: (G, X) => strip(G, X.ev.a) }));
  return d;
};
S['Ent-Draught Basin'] = (d) => {
  d.acts.push({ cost: { tap: true }, sorcery: true, label: 'A +1/+1 counter on a creature with power X', eff: [fn((G, X, t) => {
    const c = t.c, n = Math.max(0, pow(c));
    if (!pay(X.P, L.genericCost(n))) return;
    emit(G, 'info', `${X.P.name} pays ${n} (X = ${n}).`, { who: X.P.i });
    addCounters(G, c, 1);
  }, { tgt: tg({}, { fn: (G, P, c) => canPay(P, L.genericCost(Math.max(0, pow(c)))) }), val: (G, P, c) => (c.ctrl === P.i ? 1 + cv(c) * 0.05 : -1), label: 'Choose a creature (X is its power)' })] });
  d.value = 1.5;
  return d;
};
S['Glamdring'] = (d) => {
  d.statics.push({ who: 'equipped', p: 0, t: 0, kw: ['first strike'], pFn: (G, src) => G.players[src.ctrl].gy.filter((c) => isIS(c.def)).length });
  d.trig.push(T('hitPlayer', { hostOnly: true, run: (G, X) => L.freeCastFromHand(G, X.P, X.ev.n, `Cast an instant or sorcery with mana value ${X.ev.n} or less for free`) }));
  d.equipAi = (G, P) => 1 + P.gy.filter((c) => isIS(c.def)).length * 0.8;
  d.value = 5;
  return d;
};
S['Horn of Gondor'] = (d) => {
  d.etb = [soldiers(1)];
  d.acts.push({ cost: { m: C('{3}'), tap: true }, eff: [Object.assign(soldiers(0), { nFn: (G, X) => X.P.bf.filter((c) => isCreature(c) && hasSub(c, 'Human')).length })], label: 'A Human Soldier for each Human',
    ai: (G, P, c, when) => { const n = P.bf.filter((x) => isCreature(x) && hasSub(x, 'Human')).length; return n ? { score: n * 1.3 - (when === 'end' ? 0.1 : 0.9) } : null; } });
  d.value = 4.5;
  return d;
};
S['Horn of the Mark'] = (d) => {
  d.trig.push(T('attacks', { you: true, cond: (G, src, ev) => ev.cs.length >= 2, run: (G, X) => L.lookAtTop(G, X.P, 5, (c) => c.def.types.includes('Creature'), 1, 'A creature card') }));
  d.value = 3;
  return d;
};
S['Inherited Envelope'] = (d) => { d.etb = [TEMPT]; d.manaAbs = [{ colors: L.ANY }]; d.value = 3; d.role = 'ramp'; return d; };
S['Lembas'] = (d) => {
  d.etb = fx('Scry 1, then draw a card.');
  d.acts.push(Object.assign({}, FOOD.acts[0]));
  d.trig.push(T('toGy', { self: true, run: (G, X) => { const Q = G.players[X.src.owner]; const k = Q.gy.indexOf(X.src); if (k < 0) return; Q.gy.splice(k, 1); Q.library.push(X.src); G.rng.shuffle(Q.library); emit(G, 'info', `${Q.name} shuffles Lembas into their library.`, { who: Q.i }); } }));
  return d;
};
S['Mirror of Galadriel'] = (d) => {
  d.acts.push({ cost: { m: C('{5}'), tap: true }, costMod: (G, P) => legendsOf(P).length, eff: fx('Scry 1, then draw a card.'), label: 'Scry 1, then draw a card' });
  d.value = 2.4;
  return d;
};
S['Mithril Coat'] = (d) => {
  d.statics.push({ who: 'equipped', p: 0, t: 0, kw: ['indestructible'] });
  d.etb = [fn((G, X, t) => L.attach(G, X.src, t.c), { tgt: tg({ side: 'you', legendary: true }), val: (G, P, c) => cv(c) * 0.3 + 1, label: 'Attach it to a legendary creature you control' })];
  d.equipAi = () => 2;
  d.value = 4;
  return d;
};
S['The One Ring'] = (d) => {
  d.etb = [fn((G, X) => { if (!X.item) return; const P = X.P; P.protUntil = G.active === P.i ? G.turn + 2 : G.turn + 1; emit(G, 'info', `${P.name} gains protection from everything until their next turn.`, { who: P.i }); }, { score: () => 1.5 })];
  d.trig.push(T('upkeep', { you: true, run: (G, X) => loseLife(G, X.P, ctrCount(X.src, 'burden')) }));
  d.acts.push({ cost: { tap: true }, label: 'Burden counter, then draw', when: ['end', 'main2'], run: (G, X) => { const c = X.src; addCounters(G, c, 1, 'burden', true); drawN(G, X.P, ctrCount(c, 'burden')); },
    ai: (G, P, c) => { const b = ctrCount(c, 'burden') + 1; return P.life > b * 3 + 4 && P.library.length > b + 3 ? { score: b * 1.2 } : null; } });
  d.value = 9;
  return d;
};
S['Palantír of Orthanc'] = (d) => {
  d.trig.push(T('endStep', { you: true, run: (G, X) => {
    const P = X.P, O = X.O, c = X.src;
    if (onBf(G, c)) addCounters(G, c, 1, 'influence', true);
    scryChoice(G, P, 2);
    const n = ctrCount(c, 'influence') || 1;
    const giveCard = yesNo(G, O, c, `Let ${P.name} draw a card? If not, they mill ${n} and you lose life equal to the milled cards' total mana value.`, O.life <= n * 3 + 4);
    if (giveCard) { drawN(G, P, 1); return; }
    const milled = mill(G, P, n);
    loseLife(G, O, milled.reduce((s, x) => s + x.def.mv, 0), P.i);
  } }));
  d.value = 5;
  return d;
};
S['Phial of Galadriel'] = (d) => { d.drawTwo = true; d.doubleGain = true; d.manaAbs = [{ colors: L.ANY }]; d.value = 3; return d; };
S['Shire Scarecrow'] = (d) => { d.manaAbs = [{ colors: L.ANY, conv: 1, tap: false, once: true }]; return d; };
S['Sting, the Glinting Dagger'] = (d) => {
  d.statics.push({ who: 'equipped', f: { fn: (G, c) => { const b = c.blocking ? byId(G, c.blocking) : null; return !!(b && orcish(b)) || (c.blockedBy || []).some((x) => onBf(G, x) && orcish(x)); } }, p: 0, t: 0, kw: ['first strike'] });
  d.trig.push(T('combatStart', { run: (G, X) => { const h = byId(G, X.src.att); if (h && h.tapped) { h.tapped = false; emit(G, 'tapfx', `${h.def.name} untaps.`, { who: X.P.i, cards: [h.id] }); } } }));
  d.value = 3.5;
  return d;
};
S['Stone of Erech'] = (d) => {
  d.exileFoes = true;
  d.acts.push({ cost: { m: C('{2}'), tap: true, sacSelf: true }, label: "Exile a player's graveyard and draw", eff: [fn((G, X, t) => { const Q = G.players[t.p]; const n = Q.gy.length; Q.exile.push(...Q.gy.splice(0)); dirty(G); emit(G, 'exile', `${Q.name}'s graveyard is exiled (${n} card${n === 1 ? '' : 's'}).`, { who: X.P.i }); }, { tgt: { what: 'player' }, val: (G, P, x) => (x.p !== P.i ? 0.3 + G.players[x.p].gy.filter((c) => c.def.types.includes('Creature')).length * 0.1 : -1), label: "Choose a player's graveyard" }), { k: 'draw', n: 1 }],
    ai: (G, P, c, when) => (when === 'end' && P.library.length > 4 ? { score: 0.7 } : null) });
  d.value = 2;
  return d;
};
S["Wizard's Rockets"] = (d) => {
  d.etbTapped = true;
  d.manaAbs = [{ colors: L.ANY, conv: 1, sac: true }];
  d.trig.push(T('toGy', { self: true, eff: [{ k: 'draw', n: 1 }] }));
  d.acts.push({ cost: { tap: true, sacSelf: true }, eff: [], run: () => {}, label: 'Sacrifice it (X = 0) to draw a card', ai: (G, P, c, when) => (when === 'end' || (when === 'main2' && P.hand.length < 2) ? { score: 0.9 } : null) });
  d.value = 1.6;
  return d;
};

/* ============================ Lands ============================ */
const unlessLegend = (G, P) => legendsOf(P).length > 0;
const legendLand = (d, col) => { d.mana = [col]; d.tappedUnless = unlessLegend; return d; };
S['Barad-dûr'] = (d) => {
  legendLand(d, 'B');
  d.acts.push({ cost: { m: { g: 0, W: 0, U: 0, B: 1, R: 0, G: 0, x: 2 }, tap: true, xMin: 1 }, cond: (G) => G.died.some((x) => x.turn === G.turn), eff: [{ k: 'amass', nFn: (G, X) => X.x || 0 }], label: 'Amass Orcs X', ai: (G, P, c, when) => (when === 'end' || when === 'main2' ? { score: 1.5 } : null) });
  return d;
};
S['Great Hall of the Citadel'] = (d) => { d.manaAbs = [{ colors: ['C'] }, { colors: L.ANY, amount: 2, conv: 1, only: (pu) => !!pu.def && pu.def.supertypes.includes('Legendary') }]; return d; };
S['The Grey Havens'] = (d) => {
  d.etb = [{ k: 'scry', n: 1 }];
  d.manaAbs = [{ colors: ['C'] }, { colorsFn: (G, c, P) => [...new Set(P.gy.filter((x) => x.def.types.includes('Creature') && x.def.supertypes.includes('Legendary')).flatMap((x) => x.def.colors))] }];
  return d;
};
S['Minas Tirith'] = (d) => { legendLand(d, 'W'); d.acts.push({ cost: { m: C('{1}{W}'), tap: true }, cond: (G, P) => (P.attackedWith || 0) >= 2, eff: [{ k: 'draw', n: 1 }], label: 'Draw a card' }); return d; };
S['Mines of Moria'] = (d) => { legendLand(d, 'R'); d.acts.push({ cost: { m: C('{3}{R}'), tap: true, exileGy: 3 }, eff: [{ k: 'treasure', n: 2 }], label: 'Create two Treasure tokens' }); return d; };
S['Mount Doom'] = (d) => {
  d.manaAbs = [{ colors: ['B', 'R'], life: 1 }];
  d.acts.push({ cost: { m: C('{1}{B}{R}'), tap: true }, eff: [{ k: 'dmg', n: 1, to: 'player' }], label: '1 damage to each opponent' });
  d.acts.push({ cost: { m: C('{5}{B}{R}'), tap: true, sacSelf: true, sac: { types: ['Artifact'], legendary: true } }, sorcery: true, label: 'Choose up to two creatures, destroy the rest',
    run: (G, X) => {
      const P = X.P, all = allCreatures(G);
      let keep;
      if (isHuman(G, P)) keep = pickCards(G, { type: 'choose', reason: 'keep', n: 2, min: 0, max: Math.min(2, all.length), zone: 'battlefield', cards: all.map((c) => c.id) }, all, null).slice(0, 2);
      else keep = all.filter((c) => c.ctrl === P.i).sort((a, b) => cv(b) - cv(a)).slice(0, 2);
      const doomed = all.filter((c) => !keep.includes(c) && !has(c, 'indestructible'));
      L.dieNow(G, doomed);
    },
    ai: (G, P) => { const mine = P.bf.filter(isCreature).sort((a, b) => cv(b) - cv(a)); const lose = mine.slice(2).reduce((s, c) => s + cv(c), 0); const win = other(G, P).bf.filter(isCreature).reduce((s, c) => s + cv(c), 0); return win - lose > 6 ? { score: win - lose - 4 } : null; } });
  return d;
};
S['Rivendell'] = (d) => { legendLand(d, 'U'); d.acts.push({ cost: { m: C('{1}{U}'), tap: true }, cond: (G, P) => unlessLegend(G, P), eff: [{ k: 'scry', n: 2 }], label: 'Scry 2', when: ['end', 'main2'] }); return d; };
S['The Shire'] = (d) => { legendLand(d, 'G'); d.acts.push({ cost: { m: C('{1}{G}'), tap: true, tapCre: 1 }, eff: [food(1)], label: 'Create a Food token', when: ['end', 'main2'] }); return d; };
S['Shire Terrace'] = (d) => {
  d.mana = ['C'];
  d.acts.push({ cost: { m: C('{1}'), tap: true, sacSelf: true }, eff: [{ k: 'tutor', f: { types: ['Land'], fn: (dd) => dd.supertypes.includes('Basic') }, to: 'bfTapped', why: 'a basic land' }], label: 'Fetch a basic land', when: ['end', 'main2'],
    ai: (G, P) => (P.library.some((c) => isLand(c) && c.def.supertypes.includes('Basic')) ? { score: 1 } : null) });
  return d;
};

return S;
});
