/* Classic core sets (7th Edition to Magic 2012): the theme decks, intro packs and event decks. Rules for the cards the
   engine's reader can't handle on its own. Same shape as msh.js and built from its shared helpers, so it loads after msh.js. */
(function (root, factory) {
  const A = typeof module === 'object' && module.exports ? require('./engine.js') : root.Arena;
  if (typeof module === 'object' && module.exports) require('./msh.js');
  const S = factory(A);
  A.registerScripts(S);
  if (typeof module === 'object' && module.exports) module.exports = S;
})(typeof self !== 'undefined' ? self : this, function (A) {
'use strict';
const L = A.lib;
const { isCreature, isArtifact, isLand, isEnchantment, pow, tou, has, hasSub, attach, dirty, onBf, byId, cv, pv, other, allCreatures, allPerms,
  addCounters, removeCounters, ctrCount, chooseMode, isHuman, yesNo, bounceCard, destroyPermanent, exilePermanent, putOntoBattlefield, enterBattlefield,
  scryChoice, targetList, allTargets, emit, mill, searchLibrary, nameList, gainControl, sacrifice, makeTokens, discardChoice, drawCards, damageCreature,
  canPay, pay, lethalTo, pickCards, isIS, castNow, exileUntil, handValue } = L;
const { C, T, fn, tg, YOU, OPP, drawN, edictOf, gain, grantKw, hit, hitOpp, loseLife, mk, mkE, pickOne, pickSome, pump, say, ctx0, holdUntilLeaves, copyToken, untap } = L.mshKit;
const S = {};

/* ---------- Shared pieces ---------- */
const tok = (name, p, t, colors, sub, kw = [], extra = {}) => Object.assign({ id: `classic-${name.toLowerCase().replace(/[^a-z]+/g, '-')}-${p}-${t}-${kw.join('-').replace(/ /g, '')}`, name, p, t, colors, sub, kw }, extra);
const ZOMBIE = tok('Zombie', 2, 2, ['B'], ['Zombie']);
const SOLDIER = tok('Soldier', 1, 1, ['W'], ['Soldier']);
const SPAWN = tok('Eldrazi Spawn', 0, 1, [], ['Eldrazi', 'Spawn'], [], { text: 'Sacrifice this creature: Add {C}.', manaAbs: [{ colors: ['C'], sac: true, tap: false }] });
const GOLEM = tok('Golem', 3, 3, [], ['Golem'], [], { artifact: true });
const BASIC = { types: ['Land'], fn: (dd) => dd.supertypes.includes('Basic') };
const basicToHand = { k: 'tutor', f: BASIC, to: 'hand', why: 'a basic land card' };
const colorOf = (col) => (c) => c.def.colors.includes(col);
const nonColor = (col) => (c) => !c.def.colors.includes(col);
const landsOf = (P, sub) => P.bf.filter((c) => isLand(c) && (c.def.sub.includes(sub) || (sub === 'Island' && L.allIslands(P.g || { players: [] }))));
const count = (P, sub) => P.bf.filter((c) => isLand(c) && c.def.sub.includes(sub)).length;
const controls = (P, pred) => P.bf.some(pred);
const named = (P, name) => P.bf.some((c) => c.def.name === name);
const inCombat = (G, c) => !!c.attacking || !!c.blocking;
// Will this creature die in the combat that's happening (after blockers)?
const doomed = (G, c) => { const fc = L.combatDoom(G); return !!fc && fc.dead.has(c); };
// The most X an ability's {X} can be with the mana P has (base: the rest of its cost; xc: 'g' or a color for "spend only black mana on X")
function maxAbX(P, base, xc = 'g') {
  let x = 0;
  while (x < 20 && canPay(P, Object.assign({}, base, { [xc]: (base[xc] || 0) + x + 1 }), { ability: true })) x++;
  return x;
}
const sayTap = (G, c, P, text) => emit(G, 'tapfx', `${c.def.name} ${text}.`, { who: P.i, cards: [c.id] });
// "Doesn't untap during its controller's next untap step"
const freeze = (G, c, P) => { if (!c || !onBf(G, c)) return; c.stun = true; sayTap(G, c, P, "doesn't untap during its controller's next untap step"); };
// Look at the top n cards and put them back in any order (Sage Owl, Ponder): a human orders them, the AI puts what it needs on top
function reorderTop(G, P, n) {
  const top = P.library.splice(Math.max(0, P.library.length - n)).reverse();
  if (!top.length) return;
  let order;
  if (isHuman(G, P) && top.length > 1) {
    order = [];
    const left = top.slice();
    while (left.length > 1) {
      const c = pickOne(G, P, left, order.length ? 'Choose the next card from the top' : 'Choose the card to put on top', () => 0, 'look', 'library');
      order.push(c); left.splice(left.indexOf(c), 1);
    }
    order.push(left[0]);
  } else {
    const landsOk = P.bf.filter(isLand).length + P.hand.filter(isLand).length >= 5;
    order = top.slice().sort((a, b) => (isLand(a) === isLand(b) ? b.def.value - a.def.value : (isLand(a) ? 1 : -1) * (landsOk ? 1 : -1)));
  }
  P.library.push(...order.slice().reverse());
  dirty(G);
  emit(G, 'search', `${P.name} looks at the top ${top.length === 1 ? 'card' : `${top.length} cards`} of their library and puts them back in an order of their choice.`, { who: P.i });
}
// "Target player reveals their hand. You choose a ___ card from it. That player discards that card."
function handDiscard(G, X, Q, pred, label) {
  emit(G, 'reveal', `${Q.name} reveals their hand${Q.hand.length ? `: ${nameList(Q.hand)}` : ' (empty)'}.`, { who: Q.i, cards: Q.hand.map((c) => c.id) });
  const cs = Q.hand.filter(pred);
  if (!cs.length) return;
  const c = isHuman(G, X.P) ? pickCards(G, { type: 'choose', reason: 'choose', n: 1, min: 1, max: 1, zone: 'hand', cards: cs.map((x) => x.id), label }, cs, 1)[0] : cs.slice().sort((a, b) => b.def.value - a.def.value)[0];
  Q.hand.splice(Q.hand.indexOf(c), 1); Q.gy.push(c); dirty(G);
  emit(G, 'discard', `${Q.name} discards ${c.def.name}.`, { who: X.P.i, cards: [c.id] });
  G.discCause = X.P.i;
  try { L.noteDiscard(G, Q, c); } finally { G.discCause = null; }
}
const hasCards = (pred) => (G, P) => (other(G, P).hand.some(pred) ? 1.2 : 0.2);
// Regeneration: a shield that lasts the turn; the next time the creature would be destroyed it taps and leaves combat instead
function shieldRegen(G, c) {
  if (!c || !onBf(G, c)) return;
  c.tf.regen = (c.tf.regen || 0) + 1;
  emit(G, 'info', `${c.def.name} gets a regeneration shield.`, { who: c.ctrl, cards: [c.id] });
}
// A spell that would destroy c: destroy or damage aimed at it, or a sweeper
const KILLS = ['destroy', 'destroyP', 'dmg', 'dmgX', 'divided', 'bite', 'fight'];
const SWEEPS = ['wrath', 'destroyAll', 'dmgAll'];
function threatens(G, item, c) {
  const eff = (L.spellEffects(item.card.def, item.mode) || []).filter(Boolean);
  if (eff.some((e) => SWEEPS.includes(e.k))) return true;
  return eff.some((e) => KILLS.includes(e.k) || (e.k === 'fn' && item.card.def.role === 'removal')) && allTargets(item.targets).some((t) => t.c === c);
}
// "{cost}: Regenerate this creature" (or the enchanted creature): used when it would die in combat, or in answer to removal
function regenerate(d, cost, onHost) {
  const who = (G, c) => (onHost ? (c.att != null ? byId(G, c.att) : null) : c);
  d.acts.push({ cost: { m: C(cost) }, label: onHost ? 'Regenerate enchanted creature' : 'Regenerate', when: ['blocks'],
    run: (G, X) => shieldRegen(G, who(G, X.src)),
    ai: (G, P, c) => { const h = who(G, c); return h && onBf(G, h) && h.ctrl === P.i && !(h.tf.regen > 0) && doomed(G, h) ? { score: 2 + cv(h) * 0.4 } : null; } });
  d.respondAb = { cost: C(cost), counter: false, label: 'Regenerate',
    legal: (G, O, item, c) => { const h = who(G, c); return !!h && onBf(G, h) && h.ctrl === O.i && !(h.tf.regen > 0) && !h.tf.noRegen && threatens(G, item, h); },
    res: (G, O, item, c) => { shieldRegen(G, who(G, c)); return false; },
    ai: (G, O, item, c) => cv(who(G, c)) + 2 };
  d.value = (d.value || 0) + 0.8;
  return d;
}
// "Prevent the next N damage that would be dealt to any target this turn"
const preventE = (n) => ({ k: 'prevent', n, tgt: { what: 'any', f: {} } });
const preventAb = (n, cost) => ({ cost: Object.assign({ tap: true }, cost ? { m: C(cost) } : {}), label: `Prevent the next ${n} damage to any target this turn`, eff: [preventE(n)], when: ['blocks'] });
// Sacrifice outlets: the AI feeds them creatures that are about to die in combat anyway
const doomedFirst = (f) => ({ f: f || {}, label: 'a creature', prefer: (G, x) => (doomed(G, x) ? 10 : 0) - pv(G, x) });
const sacAi = (score) => (G, P, c, when) => (when === 'blocks' && P.bf.some((x) => x !== c && isCreature(x) && doomed(G, x)) ? { score: score || 1.5 } : null);
// "Whenever a player casts a (color) spell, you may gain 1 life."
const colorCup = (col) => (d) => { d.trig.push(T('cast', { cond: (G, src, ev) => !!ev.card && ev.card.def.colors.includes(col), run: (G, X) => gain(G, X.P, 1) })); return d; };
// "{T}: Add ..." for a scripted land
const tapsFor = (d, cols) => { d.mana = cols; return d; };
// Pump-by-sacrifice ("Sacrifice a creature: This creature gets +2/+2 until end of turn")
const sacPump = (p, t) => (d) => {
  d.acts.push({ cost: { sac: doomedFirst() }, label: `${p >= 0 ? '+' : ''}${p}/+${t} until end of turn`, run: (G, X) => pump(G, X.src, p, t), when: ['blocks'],
    ai: (G, P, c, when) => (when === 'blocks' && inCombat(G, c) && P.bf.some((x) => x !== c && isCreature(x) && doomed(G, x)) ? { score: 1.6 } : null) });
  return d;
};
// Damage to "each creature (with/without flying) and each player" (Earthquake, Hurricane): the AI picks X by what it kills and costs
function sweepScore(G, P, x, f, players) {
  let s = 0;
  for (const c of allCreatures(G)) if (f(c) && !has(c, 'indestructible') && lethalTo(c) <= x) s += c.ctrl === P.i ? -cv(c) : cv(c);
  if (players) { const O = other(G, P); if (O.life <= x && P.life > x) return 100; if (P.life <= x) return -100; s += x * 0.35 - x * L.lifeW(P) * 1.2; }
  return s;
}
function sweepX(f, players) {
  return (G, P, card, max) => {
    let best = null;
    for (let x = 1; x <= max; x++) { const s = sweepScore(G, P, x, f, players); if (!best || s > best.s) best = { x, s }; }
    return best && best.s > 1.5 ? best.x : null;
  };
}
const sweepRun = (f, players) => (G, X) => {
  const n = X.x || 0;
  if (n <= 0) return;
  for (const c of allCreatures(G).filter(f)) hit(G, X, c, n);
  if (players) for (const Q of G.players) hit(G, X, { p: Q.i }, n);
};

/* ============================================================ White */
S["Angel's Feather"] = colorCup('W');
S['Armored Ascension'] = (d) => {
  const plains = (G, src) => count(G.players[src.ctrl], 'Plains');
  d.statics.push({ who: 'enchanted', pFn: plains, tFn: plains, kw: ['flying'] });
  d.auraVal = (G, P, c) => (c.ctrl === P.i ? count(P, 'Plains') * 0.9 + (has(c, 'flying') ? 0 : 1.2) : -5);
  return d;
};
S['Ballista Squad'] = (d) => {
  d.acts.push({ cost: { m: C('{X}{W}'), tap: true }, label: 'X damage to an attacking or blocking creature', when: ['blocks'],
    eff: [{ k: 'dmgX', nFn: (G, X) => X.x || 0, tgt: { f: { fn: (G, c) => inCombat(G, c) } } }],
    ai: (G, P, c) => {
      const max = maxAbX(P, C('{W}'));
      const t = allCreatures(G).filter((x) => x.ctrl !== P.i && inCombat(G, x) && !has(x, 'indestructible') && lethalTo(x) <= max && L.tgtOk(G, P, { k: 'dmgX', tgt: { f: {} } }, x, c, {})).sort((a, b) => cv(b) - cv(a))[0];
      return t ? { score: cv(t) + 0.5, targets: [{ c: t }], x: lethalTo(t) } : null;
    } });
  return d;
};
S['Blessed Reversal'] = (d) => {
  const atk = (G, P) => (G.combat && G.active !== P.i ? G.combat.attackers.filter((a) => onBf(G, a) && a.attacking).length : 0);
  d.castIf = (G, P) => atk(G, P) > 0;
  d.spell = [fn((G, X) => gain(G, X.P, 3 * atk(G, X.P)), { score: (G, P) => atk(G, P) * 3 * (0.15 + L.lifeW(P)), value: 1.2 })];
  return d;
};
S['Chastise'] = (d) => {
  d.castIf = (G, P) => !!G.combat && G.combat.attackers.some((a) => onBf(G, a) && a.attacking && a.ctrl !== P.i);
  d.spell = [fn((G, X, t) => {
    const c = t && t.c; if (!c || !onBf(G, c)) return;
    const p = Math.max(0, pow(c));
    destroyPermanent(G, X.P, c, `to ${X.src.def.name}`);
    gain(G, X.P, p);
  }, { tgt: { f: { attacking: true } }, val: (G, P, c) => (c.ctrl === P.i ? -5 : cv(c) + pow(c) * 0.15), label: 'Destroy an attacking creature' })];
  d.role = 'removal';
  return d;
};
S['Cho-Manno, Revolutionary'] = (d) => { d.preventAll = true; d.value = (d.value || 0) + 2; return d; };
S["Harm's Way"] = (d) => { d.spell = [{ k: 'prevent', n: 2, redirect: true, tgt: { what: 'any', f: { side: 'you' } } }]; return d; };
S['Healing Salve'] = (d) => {
  d.modes = [{ label: 'You gain 3 life', eff: [fn((G, X) => gain(G, X.P, 3), { score: (G, P) => 3 * L.lifeW(P) })] }, { label: 'Prevent the next 3 damage to any target this turn', eff: [preventE(3)] }];
  d.spell = null;
  return d;
};
S['Lightwielder Paladin'] = (d) => {
  d.trig.push(T('hitPlayer', { self: true, eff: [{ k: 'exileP', tgt: { f: { types: ['any'], side: 'opp', fn: (G, c) => c.def.colors.includes('B') || c.def.colors.includes('R') }, min: 0 } }] }));
  return d;
};
S['Master Healer'] = (d) => { d.acts.push(preventAb(4)); return d; };
S['Mending Hands'] = (d) => { d.spell = [preventE(4)]; return d; };
S['Mesa Enchantress'] = (d) => { d.trig.push(T('cast', { you: true, cond: (G, src, ev) => !!ev.card && ev.card.def.types.includes('Enchantment'), eff: [{ k: 'draw', n: 1 }] })); return d; };
S['Palace Guard'] = (d) => { d.blockAny = true; d.value = (d.value || 0) + 0.8; return d; };
S['Pariah'] = (d) => {
  d.pariah = true;
  d.auraVal = (G, P, c) => (c.ctrl === P.i ? tou(c) * 0.5 - cv(c) * 0.3 + (has(c, 'indestructible') ? 3 : 0) : cv(c) * 0.3 + 0.2);
  return d;
};
S['Safe Passage'] = (d) => { d.spell = [{ k: 'fog', mine: true }]; return d; };
S['Samite Healer'] = (d) => { d.acts.push(preventAb(1)); return d; };
S['Soul Warden'] = (d) => { d.trig.push(T('enter', { other: true, cond: (G, src, ev) => isCreature(ev.c), run: (G, X) => gain(G, X.P, 1) })); return d; };
S['Spirit Link'] = (d) => {
  const hostDealt = (G, src, ev) => !!ev.src && src.att != null && ev.src.id === src.att && ev.n > 0;
  d.trig.push(T('dmgPlayer', { cond: hostDealt, run: (G, X) => gain(G, X.P, X.ev.n) }));
  d.trig.push(T('dmgCreature', { cond: hostDealt, run: (G, X) => gain(G, X.P, X.ev.n) }));
  d.auraVal = (G, P, c) => (c.ctrl === P.i ? Math.max(0, pow(c)) * 0.7 + (c.def.kw.includes('lifelink') ? -1 : 0.3) : Math.max(0, pow(c)) * 0.2 - 1);
  return d;
};
S['Spirit Mantle'] = (d) => {
  d.statics = d.statics.filter((x) => x.who !== 'enchanted');
  d.statics.push({ who: 'enchanted', p: 1, t: 1, kw: [], flags: { proTypes: ['Creature'] } });
  d.auraVal = (G, P, c) => (c.ctrl === P.i ? 2 + Math.max(0, pow(c)) * 0.5 : -3);
  return d;
};
S['Undead Slayer'] = (d) => {
  d.acts.push({ cost: { m: C('{W}'), tap: true }, label: 'Exile a Skeleton, Vampire, or Zombie', eff: [{ k: 'exileP', tgt: { f: { subs: ['Skeleton', 'Vampire', 'Zombie'] } } }], when: ['main1', 'end'] });
  return d;
};
S['Vengeful Archon'] = (d) => {
  d.acts.push({ cost: { m: C('{X}') }, label: 'Prevent the next X damage to you; the Archon deals that much to a player', when: ['blocks'],
    eff: [fn((G, X, t) => { const Q = t && t.p != null ? G.players[t.p] : X.O; L.shieldFor(G, X.P, { p: X.P.i }, X.x || 0, { p: Q.i, src: X.src, by: X.P.i }); },
      { tgt: { what: 'player' }, val: (G, P, x) => (x.p === P.i ? -1 : 1), label: 'Choose the player who takes the damage' })],
    ai: (G, P, c) => {
      const fc = L.combatDoom(G);
      if (!fc || G.active === P.i || fc.toD <= 0) return null;
      const x = Math.min(fc.toD, maxAbX(P, C('{0}')));
      return x > 0 ? { score: x * 0.9 + (P.life <= fc.toD ? 50 : 0), targets: [{ p: other(G, P).i }], x } : null;
    } });
  return d;
};
S['Aegis Angel'] = (d) => {
  d.etb = [fn((G, X, t) => { if (t && t.c) { X.src.mem.aegis = t.c.id; dirty(G); say(G, X.P, `${t.c.def.name} gains indestructible for as long as ${X.P.name} controls ${X.src.def.name}.`, [t.c.id]); } },
    { tgt: { f: { types: ['any'], other: true } }, val: (G, P, c) => (c.ctrl === P.i ? pv(G, c) * 0.5 + 0.5 : -1), label: 'Choose another permanent' })];
  d.statics.push({ who: 'all', f: { types: ['any'], fn: (G, c, P, src) => src.mem.aegis === c.id }, p: 0, t: 0, kw: ['indestructible'] });
  return d;
};
S["Ajani's Mantra"] = (d) => { d.trig.push(T('upkeep', { you: true, run: (G, X) => gain(G, X.P, 1) })); return d; };
S["Ancestor's Chosen"] = (d) => { d.etb = [fn((G, X) => gain(G, X.P, X.P.gy.length), { score: (G, P) => P.gy.length * 0.3 })]; return d; };
S['Angelic Arbiter'] = (d) => {
  d.arbiter = true;
  d.attackBan = (G, src, c) => c.ctrl !== src.ctrl && (G.players[c.ctrl].cast || 0) > 0;
  return d;
};
S['Arbalest Elite'] = (d) => {
  d.acts.push({ cost: { m: C('{2}{W}'), tap: true }, label: '3 damage to an attacking or blocking creature', when: ['blocks'],
    eff: [{ k: 'dmgX', nFn: () => 3, tgt: { f: { fn: (G, c) => inCombat(G, c) } } }, fn((G, X) => freeze(G, X.src, X.P), { score: () => -0.3 })] });
  return d;
};
S['Griffin Rider'] = (d) => { d.statics.push({ who: 'self', cond: (G, src) => controls(G.players[src.ctrl], (c) => isCreature(c) && hasSub(c, 'Griffin')), p: 3, t: 3, kw: ['flying'] }); return d; };
S['Oblivion Ring'] = (d) => {
  d.etb = [fn((G, X, t) => { if (t && t.c) exileUntil(G, X.P, X.src, t.c); }, { tgt: { f: { types: ['nonland'], other: true } }, val: (G, P, c) => (c.ctrl === P.i ? -pv(G, c) - 2 : pv(G, c) + 0.5), label: 'Exile another nonland permanent' })];
  d.role = 'removal';
  return holdUntilLeaves(d);
};
S['Ivory Cup'] = (d) => {
  d.trig.push(T('cast', { cond: (G, src, ev) => !!ev.card && ev.card.def.colors.includes('W'), run: (G, X) => {
    const P = X.P;
    if (!canPay(P, C('{1}')) || (isHuman(G, P) && !yesNo(G, P, X.src, 'Ivory Cup: pay {1} to gain 1 life?', true))) return;
    if (pay(P, C('{1}'))) gain(G, P, 1);
  } }));
  return d;
};

/* ============================================================ Blue */
S["Kraken's Eye"] = colorCup('U');
S['Sage Owl'] = (d) => { d.etb = [fn((G, X) => reorderTop(G, X.P, 4), { score: () => 0.5 })]; return d; };
S['Ponder'] = (d) => {
  d.spell = [fn((G, X) => {
    const P = X.P;
    reorderTop(G, P, 3);
    const top = P.library.slice(-3);
    const shuffle = isHuman(G, P) ? yesNo(G, P, X.src, 'Shuffle your library?', false) : top.length && top.every((c) => c.def.value < 2.5) && !(P.bf.filter(isLand).length < 4 && top.some(isLand));
    if (shuffle) { G.rng.shuffle(P.library); say(G, P, `${P.name} shuffles their library.`); }
    drawN(G, P, 1);
  }, { score: () => 1.1, value: 1.2 })];
  return d;
};
// Mind Control, Confiscate: the Aura takes control of what it enchants for as long as it's on the battlefield
const stealAura = (d) => {
  d.etb = [fn((G, X) => { const h = X.src.att != null ? byId(G, X.src.att) : null; if (h && onBf(G, h)) gainControl(G, X.P, h, 'src', X.src); }, { score: () => 0 })];
  d.auraVal = (G, P, c) => (c.ctrl === P.i ? -pv(G, c) - 3 : pv(G, c) * 1.2 + 1);
  d.role = 'removal';
  return d;
};
S['Mind Control'] = stealAura;
S['Confiscate'] = stealAura;
// "When this creature becomes the target of a spell or ability, sacrifice it."
const illusionTrig = () => T('targeted', { cond: (G, src, ev) => ev.c === src, run: (G, X) => { if (!onBf(G, X.src)) return; emit(G, 'sac', `${X.src.def.name} is sacrificed (it was targeted).`, { who: X.P.i, cards: [X.src.id] }); sacrifice(G, X.P, X.src, true); } });
S['Phantasmal Bear'] = (d) => { d.trig.push(illusionTrig()); return d; };
S['Phantasmal Dragon'] = (d) => { d.trig.push(illusionTrig()); return d; };
S['Puppeteer'] = (d) => {
  d.acts.push({ cost: { m: C('{U}'), tap: true }, label: 'Tap or untap a creature', when: ['main1', 'end'],
    eff: [fn((G, X, t) => {
      const c = t && t.c; if (!c || !onBf(G, c)) return;
      const untapIt = c.tapped && (!isHuman(G, X.P) || yesNo(G, X.P, X.src, `Untap ${c.def.name}? (Otherwise nothing happens to it.)`, c.ctrl === X.P.i));
      if (untapIt) untap(G, c, X.P);
      else if (!c.tapped) { c.tapped = true; sayTap(G, c, X.P, 'is tapped'); }
    }, { tgt: { f: {} }, label: 'Choose a creature to tap or untap',
      val: (G, P, c, X, ctx) => (c.ctrl !== P.i ? (c.tapped ? -1 : cv(c) * 0.3) : c.tapped && (G.active !== P.i || ctx === 'main1') ? cv(c) * 0.2 : -1) })] });
  return d;
};
S['Lord of the Unreal'] = (d) => { d.statics.push({ who: 'all', f: { side: 'you', sub: 'Illusion' }, p: 1, t: 1, kw: ['hexproof'] }); return d; };
S['Wall of Frost'] = (d) => { d.trig.push(T('blocks', { self: true, run: (G, X) => freeze(G, X.ev.a, X.P) })); return d; };
S['Spiketail Hatchling'] = (d) => {
  d.respondAb = { cost: C('{0}'), unless: 1, legal: () => true, ai: (G, O, item) => (canPay(item.P, C('{1}')) ? -1 : L.threatOf(G, O, item)) };
  return d;
};
S['Daring Apprentice'] = (d) => { d.respondAb = { cost: C('{0}'), tap: true, legal: () => true, ai: (G, O, item) => L.threatOf(G, O, item) }; return d; };
S['Sphinx of Uthuun'] = (d) => {
  d.etb = [fn((G, X) => {
    const P = X.P, O = X.O;
    const top = P.library.splice(Math.max(0, P.library.length - 5)).reverse();
    if (!top.length) return;
    emit(G, 'reveal', `${P.name} reveals ${nameList(top)}.`, { who: P.i, cards: top.map((c) => c.id) });
    // The opponent splits them: a human picks one pile, the AI puts the best card alone
    let pile1;
    if (isHuman(G, O)) pile1 = pickSome(G, O, top, 0, top.length, 'Separate the cards into two piles: choose the first pile', () => 0, 'library');
    else { const best = top.slice().sort((a, b) => b.def.value - a.def.value)[0]; pile1 = [best]; }
    const pile2 = top.filter((c) => !pile1.includes(c));
    const worth = (cs) => cs.reduce((s, c) => s + handValue(G, P, c) + 1, 0);
    let take;
    if (isHuman(G, P)) take = chooseMode(G, P, X.src, 'Sphinx of Uthuun: put which pile into your hand?', [`${pile1.length ? nameList(pile1) : 'Nothing'}`, `${pile2.length ? nameList(pile2) : 'Nothing'}`], 0) === 0 ? pile1 : pile2;
    else take = worth(pile1) >= worth(pile2) ? pile1 : pile2;
    const rest = take === pile1 ? pile2 : pile1;
    P.hand.push(...take); P.gy.push(...rest); dirty(G);
    emit(G, 'draw', `${P.name} puts ${take.length ? nameList(take) : 'nothing'} into their hand${rest.length ? ` and ${nameList(rest)} into their graveyard` : ''}.`, { who: P.i, cards: take.map((c) => c.id) });
  }, { score: () => 2.5 })];
  return d;
};
S['Telling Time'] = (d) => {
  d.spell = [fn((G, X) => {
    const P = X.P, top = P.library.splice(Math.max(0, P.library.length - 3)).reverse();
    if (!top.length) return;
    const rank = (c) => handValue(G, P, c);
    const hand = pickOne(G, P, top, 'Put a card into your hand', rank, 'look', 'library');
    const left = top.filter((c) => c !== hand);
    const onTop = left.length ? pickOne(G, P, left, 'Put a card on top of your library', rank, 'look', 'library') : null;
    const bottom = left.filter((c) => c !== onTop);
    P.hand.push(hand);
    if (bottom.length) P.library.unshift(...bottom);
    if (onTop) P.library.push(onTop);
    dirty(G);
    emit(G, 'draw', `${P.name} puts a card into their hand, one on top of their library and one on the bottom.`, { who: P.i });
  }, { score: () => 1.2, value: 1.3 })];
  return d;
};
S['Ancestral Memories'] = (d) => {
  d.spell = [fn((G, X) => {
    const P = X.P, top = P.library.splice(Math.max(0, P.library.length - 7)).reverse();
    const take = pickSome(G, P, top, Math.min(2, top.length), 2, 'Put two cards into your hand', (c) => handValue(G, P, c) + 5, 'library', 'look');
    const rest = top.filter((c) => !take.includes(c));
    P.hand.push(...take); P.gy.push(...rest); dirty(G);
    emit(G, 'draw', `${P.name} puts ${take.length ? nameList(take) : 'nothing'} into their hand and the rest into their graveyard.`, { who: P.i, cards: take.map((c) => c.id) });
  }, { score: () => 2, value: 2 })];
  return d;
};
S['Arcanis the Omnipotent'] = (d) => {
  d.acts.push({ cost: { tap: true }, label: 'Draw three cards', eff: [{ k: 'draw', n: 3 }], when: ['end', 'main2'], ai: () => ({ score: 3 }) });
  d.acts.push({ cost: { m: C('{2}{U}{U}') }, label: 'Return Arcanis to its owner\'s hand', noAi: true, run: (G, X) => bounceCard(G, X.P, X.src) });
  d.respondAb = { cost: C('{2}{U}{U}'), counter: false, label: 'Return Arcanis to hand', legal: (G, O, item, c) => threatens(G, item, c),
    res: (G, O, item, c) => { bounceCard(G, O, c); return false; }, ai: (G, O, item, c) => cv(c) + 2 };
  return d;
};
S['Aven Windreader'] = (d) => {
  d.acts.push({ cost: { m: C('{1}{U}') }, label: 'A player reveals the top card of their library', noAi: true,
    eff: [fn((G, X, t) => { const Q = G.players[t ? t.p : X.O.i]; const c = Q.library[Q.library.length - 1]; if (c) emit(G, 'reveal', `${Q.name} reveals ${c.def.name} from the top of their library.`, { who: X.P.i, cards: [c.id] }); }, { tgt: { what: 'player' }, val: () => 0.1, label: 'Choose a player' })] });
  return d;
};
S['Belltower Sphinx'] = (d) => {
  d.trig.push(T('dmgCreature', { self: true, cond: (G, src, ev) => ev.n > 0 && !!ev.src, run: (G, X) => { const Q = G.players[X.ev.src.ctrl != null ? X.ev.src.ctrl : X.ev.src.owner]; if (Q) mill(G, Q, X.ev.n); } }));
  return d;
};
S['Call to Mind'] = (d) => { d.spell = [{ k: 'regrow', tgt: { what: 'gy', mine: true, f: { types: ['Instant', 'Sorcery'] } } }]; return d; };
// "You may have this creature enter as a copy of any creature on the battlefield"
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
S['Clone'] = (d) => { d.enterAs = cloneAs(); d.value = 3.5; d.castScore = (G) => (allCreatures(G).length ? 0 : -10); return d; };
S['Phantasmal Image'] = (d) => { d.enterAs = cloneAs((b) => ({ sub: b.sub.includes('Illusion') ? b.sub : b.sub.concat('Illusion'), trig: (b.trig || []).concat(illusionTrig()) })); d.value = 3.5; d.castScore = (G) => (allCreatures(G).length ? 0 : -10); return d; };
S['Coastal Hornclaw'] = (d) => {
  d.acts.push({ cost: { sac: { f: { types: ['Land'] }, label: 'a land' } }, label: 'Gains flying until end of turn', noAi: true, run: (G, X) => grantKw(G, X.src, ['flying']) });
  return d;
};
S['Conundrum Sphinx'] = (d) => {
  d.trig.push(T('attack', { self: true, run: (G, X) => {
    for (const Q of [X.P, X.O]) {
      const all = Q.library.concat(Q.hand, Q.gy, Q.bf, Q.exile).filter((c) => c.owner === Q.i);
      const names = [...new Set(all.map((c) => c.def.name))].sort();
      let name;
      if (isHuman(G, Q)) { const cs = names.map((nm) => all.find((c) => c.def.name === nm)); name = pickOne(G, Q, cs, 'Name a card', () => 0, 'choose', 'library').def.name; }
      else { const tally = new Map(); for (const c of Q.library) tally.set(c.def.name, (tally.get(c.def.name) || 0) + 1); name = [...tally].sort((a, b) => b[1] - a[1])[0]?.[0] || names[0]; }
      const top = Q.library.pop();
      if (!top) continue;
      if (top.def.name === name) { Q.hand.push(top); emit(G, 'reveal', `${Q.name} names ${name} and reveals it: it goes into their hand.`, { who: Q.i, cards: [top.id] }); }
      else { Q.library.unshift(top); emit(G, 'reveal', `${Q.name} names ${name} and reveals ${top.def.name}: it goes to the bottom.`, { who: Q.i, cards: [top.id] }); }
      dirty(G);
    }
  } }));
  return d;
};
S['Denizen of the Deep'] = (d) => {
  d.etb = [fn((G, X) => { const cs = X.P.bf.filter((c) => c !== X.src && isCreature(c)); for (const c of cs) bounceCard(G, X.P, c); }, { score: (G, P) => -P.bf.filter(isCreature).reduce((s, c) => s + c.def.mv * 0.3, 0) })];
  return d;
};
S['Djinn of Wishes'] = (d) => {
  d.etbCtr = () => ({ wish: 3 });
  d.acts.push({ cost: { m: C('{2}{U}{U}'), ctr: { kind: 'wish', n: 1 } }, label: 'Reveal the top card; you may play it free, or exile it', when: ['end', 'main1'],
    run: (G, X) => {
      const P = X.P, c = P.library[P.library.length - 1];
      if (!c) return;
      emit(G, 'reveal', `${P.name} reveals ${c.def.name}.`, { who: P.i, cards: [c.id] });
      let played = false;
      if (isLand(c)) {
        const canLand = G.active === P.i && (G.phase === 'main1' || G.phase === 'main2') && P.landsPlayed < L.landLimit(G, P);
        if (canLand && (!isHuman(G, P) || yesNo(G, P, c, `Play ${c.def.name}?`, true))) { P.library.pop(); P.landsPlayed++; emit(G, 'land', `${P.name} plays ${c.def.name}.`, { who: P.i, card: c.id }); enterBattlefield(G, P, c, null, {}); played = true; }
      } else played = castNow(G, P, c, { free: true });
      if (!played && P.library[P.library.length - 1] === c) { P.library.pop(); P.exile.push(c); dirty(G); emit(G, 'exile', `${c.def.name} is exiled.`, { who: P.i, cards: [c.id] }); }
    }, ai: () => ({ score: 2 }) });
  return d;
};
S['Fleeting Image'] = (d) => {
  d.acts.push({ cost: { m: C('{1}{U}') }, label: 'Return it to its owner\'s hand', noAi: true, run: (G, X) => bounceCard(G, X.P, X.src) });
  d.respondAb = { cost: C('{1}{U}'), counter: false, label: 'Return it to hand', legal: (G, O, item, c) => threatens(G, item, c), res: (G, O, item, c) => { bounceCard(G, O, c); return false; }, ai: (G, O, item, c) => cv(c) + 1.5 };
  return d;
};
S['Frost Breath'] = (d) => {
  d.spell = [fn((G, X, t) => { for (const c of targetList(t).map((x) => x.c).filter(Boolean)) { if (!onBf(G, c)) continue; c.tapped = true; freeze(G, c, X.P); } },
    { tgt: { f: {}, n: 2, min: 0 }, val: (G, P, c) => (c.ctrl === P.i ? -1 : cv(c) * 0.45 + (c.tapped ? -0.2 : 0)), label: 'Tap up to two creatures' })];
  return d;
};
S['Grand Architect'] = (d) => {
  const blue = (c) => c.def.colors.includes('U') || (c.tf && c.tf.blue);
  d.archMana = true;
  d.statics.push({ who: 'all', f: { side: 'you', other: true, fn: (G, c) => blue(c) }, p: 1, t: 1, kw: [] });
  d.acts.push({ cost: { m: C('{U}') }, label: 'An artifact creature becomes blue until end of turn', when: ['main1'],
    eff: [{ k: 'grant', flags: { blue: true }, say: 'becomes blue until end of turn', tgt: { f: { types: ['Artifact'], fn: (G, c) => isCreature(c) && !blue(c) } } }],
    ai: (G, P, c) => { const t = P.bf.find((x) => isCreature(x) && isArtifact(x) && !blue(x)); return t ? { score: 0.7, targets: [{ c: t }] } : null; } });
  return d;
};
S['Harbor Serpent'] = (d) => {
  d.landwalk = 'Island';
  d.attackIf = (G) => G.players.reduce((s, Q) => s + Q.bf.filter((c) => L.isIsland(G, c)).length, 0) >= 5;
  return d;
};
S['Stormtide Leviathan'] = (d) => {
  d.landwalk = 'Island';
  d.allIslands = true;
  d.attackBan = (G, src, c) => !has(c, 'flying') && (c.def.landwalk || (c.sfl && c.sfl.landwalk)) !== 'Island';
  return d;
};

/* ============================================================ Black */
S['Diabolic Tutor'] = (d) => { d.spell = [{ k: 'tutor', f: { types: ['any'] }, to: 'hand', why: 'any card' }]; return d; };
S['Rune-Scarred Demon'] = (d) => { d.etb = [{ k: 'tutor', f: { types: ['any'] }, to: 'hand', why: 'any card' }]; return d; };
S['Drudge Skeletons'] = (d) => regenerate(d, '{B}');
S['Wall of Bone'] = (d) => regenerate(d, '{B}');
S['Mortivore'] = (d) => {
  d.ptFn = (G) => G.players.reduce((s, Q) => s + Q.gy.filter((c) => c.def.types.includes('Creature')).length, 0);
  return regenerate(d, '{B}');
};
S['Nightmare'] = (d) => { d.ptFn = (G, c) => count(G.players[c.ctrl], 'Swamp'); return d; };
S['Consume Spirit'] = (d) => {
  d.xColor = 'B';
  d.spell = [{ k: 'dmgX', nFn: (G, X) => X.x || 0, tgt: { what: 'any', f: {} } }, fn((G, X) => gain(G, X.P, X.x || 0), { score: (G, P, X) => (X && X.x ? X.x * 0.3 : 0) })];
  d.aiX = (G, P, card, max) => (max >= 2 ? max : null);
  return d;
};
S['Abyssal Specter'] = (d) => {
  d.trig.push(T('dmgPlayer', { cond: (G, src, ev) => ev.src === src && ev.n > 0, run: (G, X) => { const Q = X.ev.P; if (!Q.hand.length) return; G.discCause = X.P.i; try { discardChoice(G, Q, 1, 'discard'); } finally { G.discCause = null; } emit(G, 'discard', `${Q.name} discards a card.`, { who: X.P.i }); } }));
  return d;
};
S['Bloodthrone Vampire'] = sacPump(2, 2);
S['Fallen Angel'] = sacPump(2, 1);
S['Devouring Swarm'] = sacPump(1, 1);
S['Corrupt'] = (d) => {
  const n = (G, X) => count(X.P, 'Swamp');
  d.spell = [{ k: 'dmgX', nFn: n, tgt: { what: 'any', f: {} } }, fn((G, X) => gain(G, X.P, n(G, X)), { score: (G, P) => count(P, 'Swamp') * 0.3 })];
  return d;
};
S['Deathgazer'] = (d) => {
  const doom = (G, X, c) => { if (!c || c.def.colors.includes('B')) return; G.delayed.push({ when: 'combatEnd', run: (GG) => { if (onBf(GG, c)) destroyPermanent(GG, X.P, c, `to ${X.src.def.name}`); } }); };
  d.trig.push(T('blocks', { self: true, run: (G, X) => doom(G, X, X.ev.a) }));
  d.trig.push(T('blocked', { self: true, run: (G, X) => { for (const b of X.ev.by || []) doom(G, X, b); } }));
  return d;
};
S["Demon's Horn"] = colorCup('B');
S['Duress'] = (d) => {
  d.spell = [fn((G, X) => handDiscard(G, X, X.O, (c) => !isLand(c) && !c.def.types.includes('Creature'), 'Choose a noncreature, nonland card to discard'), { score: hasCards((c) => !isLand(c) && !c.def.types.includes('Creature')), value: 1 })];
  return d;
};
S['Ostracize'] = (d) => {
  d.spell = [fn((G, X) => handDiscard(G, X, X.O, (c) => c.def.types.includes('Creature'), 'Choose a creature card to discard'), { score: hasCards((c) => c.def.types.includes('Creature')), value: 1 })];
  return d;
};
S['Thrull Surgeon'] = (d) => {
  d.acts.push({ cost: { m: C('{1}{B}'), sacSelf: true }, sorcery: true, label: "Look at a player's hand and choose a card for them to discard",
    run: (G, X) => handDiscard(G, X, X.O, () => true, 'Choose a card to discard'), ai: (G, P) => (other(G, P).hand.length >= 2 ? { score: 1.2 } : null) });
  return d;
};
S['Foul Imp'] = (d) => { d.etb = [{ k: 'lose', who: 'self', n: 2 }]; return d; };
S['Howling Banshee'] = (d) => { d.etb = [{ k: 'lose', who: 'each', n: 3 }]; return d; };
S['Maggot Carrier'] = (d) => { d.etb = [{ k: 'lose', who: 'each', n: 1 }]; return d; };
S['Viscera Seer'] = (d) => { d.acts.push({ cost: { sac: doomedFirst() }, label: 'Scry 1', run: (G, X) => scryChoice(G, X.P, 1), when: ['blocks'], ai: sacAi(1.2) }); return d; };
S['Ascendant Evincar'] = (d) => {
  d.statics.push({ who: 'all', f: { other: true, color: 'B' }, p: 1, t: 1, kw: [] });
  d.statics.push({ who: 'all', f: { fn: (G, c) => !c.def.colors.includes('B') }, p: -1, t: -1, kw: [] });
  return d;
};
S['Befoul'] = (d) => {
  d.spell = [fn((G, X, t) => { const c = t && t.c; if (!c || !onBf(G, c)) return; c.tf.noRegen = true; destroyPermanent(G, X.P, c, `to ${X.src.def.name}`); },
    { tgt: { f: { types: ['Creature', 'Land'], fn: (G, c) => !isCreature(c) || !c.def.colors.includes('B') } }, val: (G, P, c) => (c.ctrl === P.i ? -pv(G, c) - 2 : isCreature(c) ? cv(c) + 0.5 : 0.8), label: 'Destroy a land or nonblack creature' })];
  d.role = 'removal';
  return d;
};
S['Sever Soul'] = (d) => {
  d.spell = [fn((G, X, t) => { const c = t && t.c; if (!c || !onBf(G, c)) return; const n = Math.max(0, tou(c)); c.tf.noRegen = true; destroyPermanent(G, X.P, c, `to ${X.src.def.name}`); gain(G, X.P, n); },
    { tgt: { f: { fn: (G, c) => !c.def.colors.includes('B') } }, val: (G, P, c) => (c.ctrl === P.i ? -5 : cv(c) + tou(c) * 0.1), label: 'Destroy a nonblack creature' })];
  d.role = 'removal';
  return d;
};
S['Blood Pet'] = (d) => { d.manaAbs = [{ colors: ['B'], sac: true, tap: false }]; return d; };
S['Bloodghast'] = (d) => {
  d.cantBlock = true;
  d.statics.push({ who: 'self', cond: (G, src) => G.players.some((Q) => Q.i !== src.ctrl && Q.life <= 10), p: 0, t: 0, kw: ['haste'] });
  d.gyTrig = [T('landfall', { you: true, run: (G, X) => {
    const P = X.P, c = X.src;
    if (!P.gy.includes(c) || (isHuman(G, P) && !yesNo(G, P, c, `Return ${c.def.name} to the battlefield?`, true))) return;
    P.gy.splice(P.gy.indexOf(c), 1);
    emit(G, 'raise', `${c.def.name} returns to the battlefield.`, { who: P.i, cards: [c.id] });
    enterBattlefield(G, P, c, null, {});
  } })];
  return d;
};
S['Brink of Disaster'] = (d) => {
  d.watchMana = true;
  const doom = (G, X) => { const h = X.src.att != null ? byId(G, X.src.att) : null; if (h && onBf(G, h)) destroyPermanent(G, X.P, h, `to ${X.src.def.name}`); };
  d.trig.push(T('tapped', { cond: (G, src, ev) => src.att != null && (ev.cs || []).some((c) => c.id === src.att), run: doom }));
  d.trig.push(T('manaTap', { cond: (G, src, ev) => !!ev.c && ev.c.id === src.att, run: doom }));
  d.auraVal = (G, P, c) => (c.ctrl === P.i ? -pv(G, c) - 2 : isCreature(c) ? cv(c) * 0.6 + 0.5 : 1);
  d.role = 'removal';
  return d;
};
S['Captivating Vampire'] = (d) => {
  const vamp = (c) => hasSub(c, 'Vampire');
  d.statics.push({ who: 'all', f: { side: 'you', other: true, sub: 'Vampire' }, p: 1, t: 1, kw: [] });
  d.acts.push({ cost: { tap: true, tapCre: 4, tapCreF: vamp }, label: 'Gain control of a creature; it becomes a Vampire', when: ['main1', 'end'],
    eff: [fn((G, X, t) => { const c = t && t.c; if (!c || !onBf(G, c)) return; gainControl(G, X.P, c, 'perm'); c.addSubs = (c.addSubs || []).concat('Vampire'); dirty(G); },
      { tgt: { f: { side: 'opp' } }, val: (G, P, c) => cv(c) + 1, label: 'Gain control of a creature' })] });
  return d;
};
S['Cemetery Reaper'] = (d) => {
  d.statics.push({ who: 'all', f: { side: 'you', other: true, sub: 'Zombie' }, p: 1, t: 1, kw: [] });
  d.acts.push({ cost: { m: C('{2}{B}'), tap: true }, label: 'Exile a creature card from a graveyard; create a 2/2 Zombie', when: ['end', 'main2'],
    eff: [fn((G, X, t) => { const c = t && t.c; if (!c) return; const Q = G.players.find((q) => q.gy.includes(c)); if (!Q) return; Q.gy.splice(Q.gy.indexOf(c), 1); Q.exile.push(c); dirty(G); emit(G, 'exile', `${c.def.name} is exiled from ${Q.name}'s graveyard.`, { who: X.P.i, cards: [c.id] }); },
      { tgt: { what: 'gy', f: { types: ['Creature'] } }, val: (G, P, c) => 1 + (c.owner !== P.i ? c.def.value * 0.1 : 0), label: 'Exile a creature card from a graveyard' }), mkE(ZOMBIE, 1)] });
  return d;
};
S['Contaminated Bond'] = (d) => {
  const hostLoses = (G, X) => { const h = X.src.att != null ? byId(G, X.src.att) : null; if (h) loseLife(G, G.players[h.ctrl], 3, X.P.i); };
  d.trig.push(T('attack', { cond: (G, src, ev) => ev.c && ev.c.id === src.att, run: hostLoses }));
  d.trig.push(T('blocks', { cond: (G, src, ev) => ev.c && ev.c.id === src.att, run: hostLoses }));
  d.auraVal = (G, P, c) => (c.ctrl === P.i ? -3 : 1 + (c.def.kw.includes('defender') ? -0.6 : 0.4));
  return d;
};
S['Crypt Rats'] = (d) => {
  d.acts.push({ cost: { m: C('{X}'), xColor: 'B' }, label: 'X damage to each creature and each player', when: ['main1', 'main2', 'end'],
    run: (G, X) => sweepRun(() => true, true)(G, X),
    ai: (G, P, c, when) => {
      const max = maxAbX(P, C('{0}'), 'B');
      let best = null;
      for (let x = 1; x <= max; x++) { const s = sweepScore(G, P, x, (y) => y !== c, true) - (x >= tou(c) ? cv(c) : 0); if (!best || s > best.s) best = { x, s }; }
      return best && best.s > 2 ? { score: best.s, x: best.x } : null;
    } });
  return d;
};
S['Gatekeeper of Malakir'] = (d) => {
  d.modes = [{ label: 'Without kicker' }, { label: 'Kicked: a player sacrifices a creature', cost: C('{B}'), ai: (G, P) => (other(G, P).bf.some(isCreature) ? 2.5 : null) }];
  d.etb = [fn((G, X) => { if (X.item && X.item.mode && X.item.mode.includes(1)) edictOf(G, X.O, null, X.src.def.name); }, { score: () => 0 })];
  return d;
};
S['Greed'] = (d) => {
  d.acts.push({ cost: { m: C('{B}'), life: 2 }, label: 'Draw a card', eff: [{ k: 'draw', n: 1 }], when: ['end'], ai: (G, P) => (P.life >= 10 && P.hand.length <= 5 ? { score: 1.2 } : null) });
  return d;
};
S['Hideous Visage'] = (d) => { d.spell = [{ k: 'pumpAll', side: 'you', p: 0, t: 0, kw: ['intimidate'] }]; return d; };
S['Kalastria Highborn'] = (d) => {
  const run = (G, X) => {
    const P = X.P;
    if (!canPay(P, C('{B}')) || (isHuman(G, P) && !yesNo(G, P, X.src, 'Kalastria Highborn: pay {B} so a player loses 2 life and you gain 2 life?', true))) return;
    if (pay(P, C('{B}'))) { loseLife(G, X.O, 2, P.i); gain(G, P, 2); }
  };
  d.trig.push(T('die', { self: true, run }));
  d.trig.push(T('die', { you: true, other: true, cond: (G, src, ev) => (ev.sub || []).includes('Vampire'), run }));
  return d;
};
S['Larceny'] = (d) => {
  d.trig.push(T('hitPlayer', { you: true, run: (G, X) => { const Q = X.ev.Q; if (!Q || !Q.hand.length) return; G.discCause = X.P.i; try { discardChoice(G, Q, 1, 'discard'); } finally { G.discCause = null; } emit(G, 'discard', `${Q.name} discards a card.`, { who: X.P.i }); } }));
  return d;
};
S['Megrim'] = (d) => { d.trig.push(T('discard', { opp: true, run: (G, X) => hit(G, X, { p: X.ev.P.i }, 2) })); return d; };
S['Pawn of Ulamog'] = (d) => {
  d.trig.push(T('die', { self: true, run: (G, X) => mk(G, X.P, SPAWN, 1) }));
  d.trig.push(T('die', { you: true, other: true, cond: (G, src, ev) => !ev.token && !!ev.def && ev.def.types.includes('Creature'), run: (G, X) => mk(G, X.P, SPAWN, 1) }));
  return d;
};
S['Quag Sickness'] = (d) => {
  const n = (G, src) => -count(G.players[src.ctrl], 'Swamp');
  d.statics.push({ who: 'enchanted', pFn: n, tFn: n, kw: [] });
  d.auraVal = (G, P, c) => (c.ctrl === P.i ? -5 : tou(c) - c.dmg <= count(P, 'Swamp') ? cv(c) + 1 : cv(c) * 0.3);
  d.role = 'removal';
  return d;
};
S['Stabbing Pain'] = (d) => {
  d.spell = [{ k: 'pumpT', p: -1, t: -1, tgt: { f: {} } }, fn((G, X) => { const c = X.last && X.last.c; if (c && onBf(G, c) && !c.tapped) { c.tapped = true; sayTap(G, c, X.P, 'is tapped'); } }, { score: () => 0.2 })];
  return d;
};
S['Tendrils of Corruption'] = (d) => {
  const n = (G, X) => count(X.P, 'Swamp');
  d.spell = [{ k: 'dmgX', nFn: n, tgt: { f: {} } }, fn((G, X) => gain(G, X.P, n(G, X)), { score: (G, P) => count(P, 'Swamp') * 0.3 })];
  d.role = 'removal';
  return d;
};
S['Tormented Soul'] = (d) => { d.cantBlock = true; d.unblockable = true; return d; };
S['Underworld Dreams'] = (d) => { d.trig.push(T('draw', { opp: true, run: (G, X) => hit(G, X, { p: X.ev.P.i }, 1) })); return d; };
S['Vampire Bats'] = (d) => { d.pumpAbility = { cost: C('{B}'), p: 1, t: 0, max: 2 }; return d; };
S['Vampire Hexmage'] = (d) => {
  d.acts.push({ cost: { sacSelf: true }, label: 'Remove all counters from a permanent', when: ['main1', 'end'],
    eff: [fn((G, X, t) => { const c = t && t.c; if (!c || !onBf(G, c)) return; c.cnt = 0; c.ctr = {}; dirty(G); emit(G, 'info', `All counters are removed from ${c.def.name}.`, { who: X.P.i, cards: [c.id] }); },
      { tgt: { f: { types: ['any'], fn: (G, c) => c.cnt > 0 || Object.keys(c.ctr).length > 0 } }, val: (G, P, c) => (c.ctrl === P.i ? -1 : c.def.loyalty ? pv(G, c) + 2 : c.cnt * 0.8), label: 'Choose a permanent with counters' })],
    ai: (G, P) => { const t = other(G, P).bf.find((x) => x.def.loyalty || x.cnt >= 3); return t ? { score: t.def.loyalty ? 6 : t.cnt * 0.9, targets: [{ c: t }] } : null; } });
  return d;
};
S['Vampire Lacerator'] = (d) => { d.trig.push(T('upkeep', { you: true, cond: (G, src, ev, Q) => !G.players.some((O) => O !== Q && O.life <= 10), run: (G, X) => loseLife(G, X.P, 1) })); return d; };

/* ============================================================ Red */
S['Fireball'] = (d) => {
  const split = (k) => ({ label: k === 1 ? 'X damage to one target' : `X damage divided evenly among ${k} targets ({${k - 1}} more)`, cost: k > 1 ? C(`{${k - 1}}`) : undefined,
    eff: [{ k: 'dmgX', nFn: (G, X) => Math.floor((X.x || 0) / k), tgt: { what: 'any', f: {}, n: k, min: k } }] });
  d.modes = [split(1), split(2), split(3)];
  d.spell = null;
  d.aiX = (G, P, card, max) => (max >= 1 ? max : null);
  d.role = 'removal';
  return d;
};
S["Chandra's Outrage"] = (d) => {
  d.spell = [{ k: 'dmgX', nFn: () => 4, tgt: { f: {} } }, fn((G, X) => { const c = X.last && X.last.c; if (c) hit(G, X, { p: c.ctrl }, 2); }, { score: () => 0.6 })];
  d.role = 'removal';
  return d;
};
S["Dragon's Claw"] = colorCup('R');
S['Fling'] = (d) => {
  d.addCost = { sac: { types: ['Creature'] }, sacWord: 'a creature' };
  const guess = (G, P) => { const cs = P.bf.filter(isCreature).sort((a, b) => pv(G, a) - pv(G, b)); return cs.length ? Math.max(0, pow(cs[0])) : 0; };
  d.spell = [{ k: 'dmgX', nFn: (G, X) => (X.sac ? Math.max(0, X.sac.pow) : guess(G, X.P)), tgt: { what: 'any', f: {} } }];
  return d;
};
S['Goblin King'] = (d) => { d.statics.push({ who: 'all', f: { other: true, sub: 'Goblin' }, p: 1, t: 1, kw: [], flags: { landwalk: 'Mountain' } }); return d; };
S['Goblin Tunneler'] = (d) => {
  d.acts.push({ cost: { tap: true }, label: "A creature with power 2 or less can't be blocked this turn", when: ['main1'],
    eff: [{ k: 'grant', flags: { unblockable: true }, say: "can't be blocked this turn", tgt: { f: { fn: (G, c) => pow(c) <= 2 } } }],
    ai: (G, P, c) => { const t = P.bf.filter((x) => x !== c && L.canAttackNow(G, x) && pow(x) > 0 && pow(x) <= 2 && !x.def.unblockable && !(x.tf && x.tf.unblockable)).sort((a, b) => pow(b) - pow(a))[0]; return t && other(G, P).bf.some((b) => isCreature(b) && !b.tapped) ? { score: 0.7 + pow(t) * 0.2, targets: [{ c: t }] } : null; } });
  return d;
};
S['Ancient Hellkite'] = (d) => {
  d.acts.push({ cost: { m: C('{R}') }, label: '1 damage to a creature the defending player controls', cond: (G, P, c) => !!c.attacking, when: ['blocks'],
    eff: [{ k: 'dmgX', nFn: () => 1, tgt: { f: { side: 'opp' } } }] });
  return d;
};
S['Anarchist'] = (d) => { d.etb = [{ k: 'regrow', tgt: { what: 'gy', mine: true, f: { types: ['Sorcery'] }, min: 0 } }]; return d; };
S['Beacon of Destruction'] = (d) => {
  d.spell = [{ k: 'dmgX', nFn: () => 5, tgt: { what: 'any', f: {} } }, fn((G, X) => {
    const c = X.src, Q = G.players[c.owner];
    if (!Q || !Q.gy.includes(c)) return;
    Q.gy.splice(Q.gy.indexOf(c), 1); Q.library.push(c); G.rng.shuffle(Q.library); dirty(G);
    emit(G, 'info', `${c.def.name} is shuffled into ${Q.name}'s library.`, { who: Q.i });
  }, { score: () => 0.3 })];
  d.role = 'removal';
  return d;
};
S["Chandra's Spitfire"] = (d) => { d.trig.push(T('dmgPlayer', { opp: true, cond: (G, src, ev) => !ev.combat && ev.n > 0, run: (G, X) => pump(G, X.src, 3, 0) })); return d; };
S['Crumbling Colossus'] = (d) => {
  d.trig.push(T('attack', { self: true, run: (G, X) => { const c = X.src; G.delayed.push({ when: 'combatEnd', run: (GG) => { if (onBf(GG, c)) { emit(GG, 'sac', `${c.def.name} is sacrificed.`, { who: c.ctrl, cards: [c.id] }); sacrifice(GG, GG.players[c.ctrl], c, true); } } }); } }));
  return d;
};
S['Cyclops Gladiator'] = (d) => {
  d.trig.push(T('attack', { self: true, eff: [fn((G, X, t) => {
    const me = X.src, c = t && t.c;
    if (!c || !onBf(G, c) || !onBf(G, me)) return;
    const a = Math.max(0, pow(me)), b = Math.max(0, pow(c));
    damageCreature(G, c, a, me, { noncombat: true });
    damageCreature(G, me, b, c, { noncombat: true });
    emit(G, 'fight', `${me.def.name} deals ${a} damage to ${c.def.name}, and ${c.def.name} deals ${b} damage to it.`, { who: X.P.i, cards: [me.id, c.id], hits: [{ src: me.id, to: c.id, n: a }, { src: c.id, to: me.id, n: b }] });
  }, { tgt: { f: { side: 'opp' }, min: 0 }, label: 'Choose a creature for Cyclops Gladiator to fight',
    val: (G, P, c, X) => { const me = X && X.src; if (!me) return -1; const kill = lethalTo(c) <= pow(me) && !has(c, 'indestructible'), die = lethalTo(me) <= pow(c) && !has(me, 'indestructible'); return (kill ? cv(c) : 0) - (die ? cv(me) : 0) - (kill ? 0 : 0.5); } })] }));
  return d;
};
S['Earth Servant'] = (d) => { d.statics.push({ who: 'self', tFn: (G, src) => count(G.players[src.ctrl], 'Mountain'), p: 0, kw: [] }); return d; };
S['Earthquake'] = (d) => { const f = (c) => !has(c, 'flying'); d.spell = [fn(sweepRun(f, true), { score: (G, P, X) => sweepScore(G, P, (X && X.x) || 0, f, true), value: 2.5 })]; d.aiX = sweepX(f, true); d.role = 'removal'; return d; };
S['Enrage'] = (d) => { d.spell = [{ k: 'pumpT', pFn: (G, X) => X.x || 0, t: 0, tgt: { f: {} } }]; d.aiX = (G, P, card, max) => (max >= 2 ? max : null); return d; };
S['Fire Servant'] = (d) => { d.redDouble = true; return d; };
S['Flameblast Dragon'] = (d) => {
  d.trig.push(T('attack', { self: true, run: (G, X) => {
    const P = X.P, base = C('{R}');
    if (!canPay(P, base)) return;
    const max = maxAbX(P, base);
    if (max < 1) return;
    const x = isHuman(G, P) ? L.chooseNumber(G, P, X.src, 'Flameblast Dragon: pay {X}{R} to deal X damage (0 to skip)', 0, max, max) : max;
    if (!x) return;
    const eff = [{ k: 'dmgX', nFn: () => x, tgt: { what: 'any', f: {} } }];
    let tg = null;
    if (!isHuman(G, P)) { const ch = L.chooseTargets(G, P, eff, 'trigger', X.src, X); if (!ch || ch.score < 1) return; tg = ch.targets; }
    if (!pay(P, Object.assign({}, base, { g: x }))) return;
    say(G, P, `${P.name} pays {${x}}{R}.`);
    L.resolveWithTargets(G, P, X.src, eff, X, 'trigger', tg);
  } }));
  return d;
};
S['Goblin Arsonist'] = (d) => { d.dies = [{ k: 'dmgX', nFn: () => 1, tgt: { what: 'any', f: {}, min: 0 } }]; return d; };
S['Goblin Artillery'] = (d) => {
  const eff = [{ k: 'dmgX', nFn: () => 2, tgt: { what: 'any', f: {} } }, fn((G, X) => hit(G, X, { p: X.P.i }, 3), { score: () => -1 })];
  d.acts.push({ cost: { tap: true }, label: '2 damage to any target and 3 damage to you', eff, when: ['main1', 'end', 'blocks'],
    ai: (G, P, c) => { if (P.life <= 6) return null; const ch = L.chooseTargets(G, P, eff.slice(0, 1), 'combat', c, { x: 0 }); return ch && ch.score >= 3 ? { score: ch.score - 1.5, targets: ch.targets.concat([null]) } : null; } });
  return d;
};
S['Goblin Bangchuckers'] = (d) => {
  d.acts.push({ cost: { tap: true }, label: 'Flip a coin: 2 damage to any target, or 2 damage to itself', when: ['main1', 'end', 'blocks'],
    eff: [fn((G, X, t) => {
      const win = G.rng.next() < 0.5;
      emit(G, 'info', `${X.P.name} flips a coin and ${win ? 'wins' : 'loses'}.`, { who: X.P.i });
      if (win) { if (t) hit(G, X, t.c ? t.c : { p: t.p }, 2); } else hit(G, X, X.src, 2);
    }, { tgt: { what: 'any', f: {} }, label: 'Choose a target for 2 damage', val: (G, P, x, X) => (x.p != null && !x.def ? (x.p === P.i ? -5 : G.players[x.p].life <= 2 ? 50 : 0.4) : x.ctrl === P.i ? -5 : lethalTo(x) <= 2 ? cv(x) * 0.5 : 0) })],
    ai: (G, P, c) => { const t = other(G, P).bf.filter((x) => isCreature(x) && lethalTo(x) <= 2 && !has(x, 'indestructible')).sort((a, b) => cv(b) - cv(a))[0]; const risk = lethalTo(c) <= 2 ? cv(c) * 0.5 : 0; return t && cv(t) * 0.5 - risk > 0.6 ? { score: cv(t) * 0.5 - risk, targets: [{ c: t }] } : null; } });
  return d;
};
S['Goblin Digging Team'] = (d) => { d.acts.push({ cost: { tap: true, sacSelf: true }, label: 'Destroy a Wall', eff: [{ k: 'destroyP', tgt: { f: { sub: 'Wall' } } }], when: ['main1'] }); return d; };
S['Goblin Gardener'] = (d) => { d.dies = [{ k: 'destroyP', tgt: { f: { types: ['Land'] } } }]; return d; };
S['Goblin Matron'] = (d) => { d.etb = [{ k: 'tutor', f: { types: ['Goblin'] }, to: 'hand', why: 'a Goblin card' }]; return d; };
S['Guerrilla Tactics'] = (d) => {
  d.spell = [{ k: 'dmgX', nFn: () => 2, tgt: { what: 'any', f: {} } }];
  d.gyTrig = [T('discard', { cond: (G, src, ev, Q) => ev.card === src && ev.cause != null && ev.cause !== Q.i, eff: [{ k: 'dmgX', nFn: () => 4, tgt: { what: 'any', f: {} } }] })];
  return d;
};
S['Magnivore'] = (d) => { d.ptFn = (G) => G.players.reduce((s, Q) => s + Q.gy.filter((c) => c.def.types.includes('Sorcery')).length, 0); return d; };
S['Mogg Sentry'] = (d) => { d.trig.push(T('cast', { opp: true, run: (G, X) => pump(G, X.src, 2, 2) })); return d; };
S['Panic Attack'] = (d) => { d.spell = [{ k: 'grant', bad: true, flags: { cantBlock: true }, say: "can't block this turn", tgt: { f: {}, n: 3, min: 0 } }]; return d; };
S['Seismic Strike'] = (d) => { d.spell = [{ k: 'dmgX', nFn: (G, X) => count(X.P, 'Mountain'), tgt: { f: {} } }]; d.role = 'removal'; return d; };
S["Shiv's Embrace"] = (d) => {
  d.acts.push({ cost: { m: C('{R}') }, label: 'Enchanted creature gets +1/+0 until end of turn', when: ['blocks'],
    run: (G, X) => { const h = X.src.att != null ? byId(G, X.src.att) : null; if (h) pump(G, h, 1, 0); },
    ai: (G, P, c) => { const h = c.att != null ? byId(G, c.att) : null; return h && h.ctrl === P.i && h.attacking && !h.blocked ? { score: 0.9 } : null; } });
  return d;
};
S['Tectonic Rift'] = (d) => {
  d.spell = [{ k: 'destroyP', tgt: { f: { types: ['Land'] } } }, fn((G, X) => { const cs = allCreatures(G).filter((c) => !has(c, 'flying')); cs.forEach((c) => { c.tf.cantBlock = true; }); emit(G, 'tapfx', "Creatures without flying can't block this turn.", { who: X.P.i, cards: cs.map((c) => c.id) }); },
    { score: (G, P) => (G.active === P.i ? other(G, P).bf.filter((c) => isCreature(c) && !has(c, 'flying') && !c.tapped).length * 0.6 : 0) })];
  return d;
};
S['Threaten'] = (d) => {
  d.spell = [fn((G, X, t) => {
    const c = t && t.c; if (!c || !onBf(G, c)) return;
    gainControl(G, X.P, c, 'eot', X.src);
    c.tapped = false;
    if (!c.tkw.includes('haste')) c.tkw.push('haste');
    dirty(G);
    emit(G, 'control', `${X.P.name} gains control of ${c.def.name} until end of turn; it untaps and gains haste.`, { who: X.P.i, cards: [c.id] });
  }, { tgt: { f: {} }, val: (G, P, c) => (c.ctrl === P.i ? -1 : cv(c) + Math.max(0, pow(c)) * 0.4), label: 'Gain control of a creature until end of turn' })];
  d.castScore = (G, P, card, ctx) => (ctx === 'main1' ? 0 : -3);
  return d;
};
S['Viashino Sandscout'] = (d) => { d.trig.push(T('endStep', { run: (G, X) => { if (onBf(G, X.src)) bounceCard(G, X.P, X.src); } })); return d; };
S['Warstorm Surge'] = (d) => {
  d.trig.push(T('enter', { you: true, cond: (G, src, ev) => isCreature(ev.c), eff: [fn((G, X, t) => {
    const c = X.ev.c; if (!c || !onBf(G, c) || !t) return;
    hit(G, X, t.c ? t.c : { p: t.p }, Math.max(0, pow(c)), c);
  }, { tgt: { what: 'any', f: {} }, label: 'Choose a target for the new creature\'s damage',
    val: (G, P, x, X) => { const n = X && X.ev && X.ev.c ? Math.max(0, pow(X.ev.c)) : 0; if (x.p != null && !x.def) return x.p === P.i ? -5 : G.players[x.p].life <= n ? 100 : n * 0.3; return x.ctrl === P.i ? -cv(x) : lethalTo(x) <= n ? cv(x) + 0.5 : 0.1; } })] }));
  return d;
};
S['Wildfire'] = (d) => {
  d.spell = [fn((G, X) => {
    for (const Q of G.players) for (let k = 0; k < 4; k++) edictOf(G, Q, isLand, X.src.def.name);
    for (const c of allCreatures(G)) hit(G, X, c, 4);
  }, { score: (G, P) => { const mine = P.bf.filter(isLand).length, theirs = other(G, P).bf.filter(isLand).length; return sweepScore(G, P, 4, () => true, false) + (Math.min(4, theirs) - Math.min(4, mine)) * 0.8 + (mine >= 8 ? 1 : -1); }, value: 1.5 })];
  return d;
};

/* ============================================================ Green */
S['Lure'] = (d) => {
  d.statics.push({ who: 'enchanted', p: 0, t: 0, kw: [], flags: { lureAll: true } });
  d.auraVal = (G, P, c) => (c.ctrl === P.i ? 0.5 + tou(c) * 0.25 + (has(c, 'deathtouch') ? 3 : 0) + (has(c, 'first strike') ? 1 : 0) + (P.bf.filter(isCreature).length >= 3 ? 1 : 0) : -2);
  return d;
};
S['Prized Unicorn'] = (d) => { d.lureAll = true; return d; };
S['Awakener Druid'] = (d) => {
  d.etb = [fn((G, X, t) => { if (t && t.c) { X.src.mem.awaken = t.c.id; dirty(G); emit(G, 'pump', `${t.c.def.name} becomes a 4/5 green Treefolk creature for as long as ${X.src.def.name} remains on the battlefield.`, { who: X.P.i, cards: [t.c.id] }); } },
    { tgt: { f: { types: ['Land'], sub: 'Forest' } }, val: (G, P, c) => (c.ctrl === P.i ? 3 : -3), label: 'Choose a Forest' })];
  d.statics.push({ who: 'all', f: { types: ['Land'], fn: (G, c, P, src) => src.mem.awaken === c.id }, baseFn: () => 4, p: 0, t: 1, kw: [], flags: { animated: true }, addSub: ['Treefolk'] });
  return d;
};
S['Cultivate'] = (d) => {
  d.spell = [fn((G, X) => {
    const P = X.P;
    const got = searchLibrary(G, P, (c) => isLand(c) && c.def.supertypes.includes('Basic'), 2, 'hand', 'up to two basic land cards');
    if (!got.length) { emit(G, 'search', `${P.name} searches their library and finds nothing.`, { who: P.i }); return; }
    const toBf = got.length === 1 ? got[0] : pickOne(G, P, got, 'Put which land onto the battlefield tapped?', (c) => 1, 'choose', 'hand');
    P.hand.splice(P.hand.indexOf(toBf), 1);
    emit(G, 'search', `${P.name} puts ${toBf.def.name} onto the battlefield tapped${got.length > 1 ? ` and ${got.find((c) => c !== toBf).def.name} into their hand` : ''}.`, { who: P.i, cards: got.map((c) => c.id) });
    putOntoBattlefield(G, P, toBf, { tapped: true });
  }, { score: (G, P) => (P.bf.filter(isLand).length < 7 ? 1.8 : 0.6), value: 1.8 })];
  return d;
};
S['Fyndhorn Elder'] = (d) => { d.manaAbs = [{ colors: ['G'], amount: 2 }]; return d; };
S['Regeneration'] = (d) => {
  d.auraVal = (G, P, c) => (c.ctrl === P.i ? cv(c) * 0.3 + 0.5 : -2);
  return regenerate(d, '{G}', true);
};
S['Wood Elves'] = (d) => { d.etb = [{ k: 'tutor', f: { types: ['Forest'] }, to: 'bf', why: 'a Forest card' }]; return d; };
S["Wurm's Tooth"] = colorCup('G');
S['Acidic Slime'] = (d) => { d.etb = [{ k: 'destroyP', tgt: { f: { types: ['Artifact', 'Enchantment', 'Land'] } } }]; return d; };
S['Ancient Silverback'] = (d) => regenerate(d, '{G}');
S['Cudgel Troll'] = (d) => regenerate(d, '{G}');
S['Gorilla Chieftain'] = (d) => regenerate(d, '{1}{G}');
S['Rhox'] = (d) => { d.asUnblocked = true; return regenerate(d, '{2}{G}'); };
S['Arachnus Web'] = (d) => {
  d.statics.push({ who: 'enchanted', p: 0, t: 0, kw: [], flags: { cantAttack: true, cantBlock: true, noActs: true } });
  d.trig.push(T('endStep', { cond: (G, src) => { const h = src.att != null ? byId(G, src.att) : null; return !!h && pow(h) >= 4; }, run: (G, X) => { if (onBf(G, X.src)) destroyPermanent(G, X.P, X.src, 'its creature has power 4 or greater'); } }));
  d.auraVal = (G, P, c) => (c.ctrl === P.i ? -5 : pow(c) >= 4 ? 0.2 : cv(c) * 0.9);
  d.role = 'removal';
  return d;
};
S['Arachnus Spinner'] = (d) => {
  d.acts.push({ cost: { tap: true }, label: 'Put Arachnus Web from your graveyard or library onto the battlefield attached to a creature', when: ['main1', 'end'],
    eff: [fn((G, X, t) => {
      const P = X.P, h = t && t.c; if (!h || !onBf(G, h)) return;
      let web = P.gy.find((c) => c.def.name === 'Arachnus Web'), from = 'gy';
      if (!web) { web = P.library.find((c) => c.def.name === 'Arachnus Web'); from = 'library'; }
      if (from === 'library') { if (web) P.library.splice(P.library.indexOf(web), 1); G.rng.shuffle(P.library); } else if (web) P.gy.splice(P.gy.indexOf(web), 1);
      if (!web) { emit(G, 'search', `${P.name} finds no Arachnus Web.`, { who: P.i }); return; }
      emit(G, 'search', `${P.name} puts Arachnus Web onto the battlefield attached to ${h.def.name}.`, { who: P.i, cards: [web.id, h.id] });
      enterBattlefield(G, P, web, null, { attachTo: h });
    }, { tgt: { f: {} }, val: (G, P, c) => (c.ctrl === P.i ? -5 : pow(c) >= 4 ? 0.1 : cv(c) * 0.8), label: 'Choose a creature for Arachnus Web' })],
    cond: (G, P) => P.gy.concat(P.library).some((c) => c.def.name === 'Arachnus Web') });
  return d;
};
S['Back to Nature'] = (d) => {
  d.spell = [fn((G, X) => { const cs = allPerms(G).filter((c) => isEnchantment(c)); for (const c of cs) destroyPermanent(G, X.P, c, `to ${X.src.def.name}`); if (!cs.length) say(G, X.P, 'There are no enchantments to destroy.'); },
    { score: (G, P) => allPerms(G).filter(isEnchantment).reduce((s, c) => s + (c.ctrl === P.i ? -pv(G, c) : pv(G, c)), 0), value: 1.2 })];
  return d;
};
S['Borderland Ranger'] = (d) => { d.etb = [basicToHand]; return d; };
S['Civic Wayfinder'] = (d) => { d.etb = [basicToHand]; return d; };
S['Sylvan Ranger'] = (d) => { d.etb = [basicToHand]; return d; };
S['Commune with Nature'] = (d) => { d.spell = [fn((G, X) => L.mshKit.lookTake(G, X.P, 5, (c) => c.def.types.includes('Creature'), 1, 'Put a creature card into your hand'), { score: () => 1, value: 1.1 })]; return d; };
S['Creeping Mold'] = (d) => { d.spell = [{ k: 'destroyP', tgt: { f: { types: ['Artifact', 'Enchantment', 'Land'] } } }]; return d; };
S['Elvish Pioneer'] = (d) => {
  d.etb = [fn((G, X) => {
    const P = X.P, cs = P.hand.filter((c) => isLand(c) && c.def.supertypes.includes('Basic'));
    if (!cs.length) return;
    const pick = isHuman(G, P) ? pickSome(G, P, cs, 0, 1, 'You may put a basic land onto the battlefield tapped', () => 1, 'hand')[0] : L.pickBasicFrom(P, cs);
    if (!pick) return;
    P.hand.splice(P.hand.indexOf(pick), 1);
    emit(G, 'land', `${P.name} puts ${pick.def.name} onto the battlefield tapped.`, { who: P.i, card: pick.id });
    putOntoBattlefield(G, P, pick, { tapped: true });
  }, { score: (G, P) => (P.hand.some((c) => isLand(c) && c.def.supertypes.includes('Basic')) ? 1.2 : 0) })];
  return d;
};
S['Emperor Crocodile'] = (d) => {
  const lonely = (G, src) => onBf(G, src) && !G.players[src.ctrl].bf.some((c) => c !== src && isCreature(c));
  const sac = (G, X) => { if (lonely(G, X.src)) { emit(G, 'sac', `${X.src.def.name} is sacrificed (no other creatures).`, { who: X.P.i, cards: [X.src.id] }); sacrifice(G, X.P, X.src, true); } };
  d.trig.push(T('leave', { you: true, cond: (G, src) => lonely(G, src), run: sac }));
  d.trig.push(T('enter', { self: true, cond: (G, src) => lonely(G, src), run: sac }));
  d.trig.push(T('ctrlChange', { cond: (G, src) => lonely(G, src), run: sac }));
  d.castScore = (G, P) => (P.bf.some(isCreature) ? 0 : -10);
  return d;
};
S["Garruk's Horde"] = (d) => { d.chorus = true; return d; };
S["Garruk's Packleader"] = (d) => { d.trig.push(T('enter', { you: true, other: true, cond: (G, src, ev) => isCreature(ev.c) && pow(ev.c) >= 3, eff: [{ k: 'draw', n: 1 }] })); return d; };
S['Hunted Wumpus'] = (d) => {
  d.etb = [fn((G, X) => {
    const Q = X.O, cs = Q.hand.filter((c) => c.def.types.includes('Creature'));
    if (!cs.length) return;
    const pick = isHuman(G, Q) ? pickSome(G, Q, cs, 0, 1, 'You may put a creature card from your hand onto the battlefield', () => 1, 'hand')[0] : cs.slice().sort((a, b) => b.def.value - a.def.value)[0];
    if (!pick) return;
    Q.hand.splice(Q.hand.indexOf(pick), 1);
    emit(G, 'enter', `${Q.name} puts ${pick.def.name} onto the battlefield.`, { who: Q.i, card: pick.id });
    putOntoBattlefield(G, Q, pick, {});
  }, { score: (G, P) => -1 - other(G, P).hand.length * 0.3 })];
  return d;
};
S["Hunter's Insight"] = (d) => {
  d.spell = [fn((G, X, t) => {
    const c = t && t.c; if (!c) return;
    const id = c.id;
    X.P.turnTrigs = (X.P.turnTrigs || []).filter((tt) => tt.turn === G.turn).concat({ turn: G.turn, src: X.src, t: T('hitPlayer', { cond: (GG, src, ev) => !!ev.c && ev.c.id === id && ev.n > 0, run: (GG, XX) => drawN(GG, XX.P, XX.ev.n) }) });
    say(G, X.P, `Whenever ${c.def.name} deals combat damage to a player this turn, ${X.P.name} draws that many cards.`, [c.id]);
  }, { tgt: { f: { side: 'you' } }, label: 'Choose a creature you control',
    val: (G, P, c, X, ctx) => { const free = has(c, 'flying') || c.def.unblockable || !other(G, P).bf.some((b) => isCreature(b) && !b.tapped); return (c.attacking && !c.blocked) || (ctx === 'main1' && L.canAttackNow(G, c) && free) ? Math.max(0, pow(c)) * 0.9 : 0.05; } })];
  return d;
};
S['Hurricane'] = (d) => { const f = (c) => has(c, 'flying'); d.spell = [fn(sweepRun(f, true), { score: (G, P, X) => sweepScore(G, P, (X && X.x) || 0, f, true), value: 2 })]; d.aiX = sweepX(f, true); return d; };
S['Windstorm'] = (d) => { const f = (c) => has(c, 'flying'); d.spell = [fn(sweepRun(f, false), { score: (G, P, X) => sweepScore(G, P, (X && X.x) || 0, f, false), value: 1.5 })]; d.aiX = sweepX(f, false); return d; };
S['Llanowar Behemoth'] = (d) => {
  d.acts.push({ cost: { tapCre: 1 }, label: '+1/+1 until end of turn', run: (G, X) => pump(G, X.src, 1, 1), when: ['blocks'],
    ai: (G, P, c) => (inCombat(G, c) && P.bf.some((x) => x !== c && isCreature(x) && !x.tapped && !x.blocking && !x.attacking) ? { score: 0.9 } : null) });
  return d;
};
S['Molimo, Maro-Sorcerer'] = (d) => { d.ptFn = (G, c) => G.players[c.ctrl].bf.filter(isLand).length; return d; };
// Wild Growth, Overgrowth: the enchanted land makes more mana when tapped
const growth = (n) => (d) => {
  d.landMana = { n, col: 'G' };
  d.auraVal = (G, P, c) => (c.ctrl === P.i ? 1 + n + (c.def.mana && c.def.mana.includes('G') ? 0.3 : 0) : -2);
  return d;
};
S['Wild Growth'] = growth(1);
S['Overgrowth'] = growth(2);
S['Overwhelming Stampede'] = (d) => {
  d.spell = [fn((G, X) => {
    const cs = X.P.bf.filter(isCreature), n = Math.max(0, ...cs.map((c) => pow(c)));
    cs.forEach((c) => { c.tp += n; c.tt += n; if (!c.tkw.includes('trample')) c.tkw.push('trample'); });
    dirty(G);
    emit(G, 'pump', `${X.P.name}'s creatures get +${n}/+${n} and gain trample until end of turn.`, { who: X.P.i, cards: cs.map((c) => c.id) });
  }, { score: (G, P, X, ctx) => { const cs = P.bf.filter(isCreature); const n = Math.max(0, ...cs.map((c) => pow(c))); return ctx === 'main1' ? cs.filter((c) => L.canAttackNow(G, c)).length * n * 0.5 : 0.2; }, value: 2.5 })];
  return d;
};
S['Primeval Force'] = (d) => {
  d.etb = [fn((G, X) => {
    const P = X.P, forests = P.bf.filter((c) => isLand(c) && c.def.sub.includes('Forest'));
    let keep = forests.length >= 3 && (isHuman(G, P) ? yesNo(G, P, X.src, 'Sacrifice three Forests to keep Primeval Force?', true) : P.bf.filter(isLand).length >= 6);
    if (keep) {
      const pick = isHuman(G, P) && forests.length > 3 ? pickCards(G, { type: 'choose', reason: 'sacrifice-cost', n: 3, min: 3, max: 3, zone: 'battlefield', cards: forests.map((c) => c.id), label: 'Sacrifice three Forests' }, forests, 3) : forests.slice().sort((a, b) => (a.tapped ? 0 : 1) - (b.tapped ? 0 : 1)).slice(0, 3);
      emit(G, 'sac', `${P.name} sacrifices ${nameList(pick)}.`, { who: P.i, cards: pick.map((c) => c.id) });
      for (const c of pick) sacrifice(G, P, c, true);
    } else if (onBf(G, X.src)) { emit(G, 'sac', `${P.name} sacrifices ${X.src.def.name}.`, { who: P.i, cards: [X.src.id] }); sacrifice(G, P, X.src, true); }
  }, { score: () => 0 })];
  d.castScore = (G, P) => (P.bf.filter(isLand).length >= 7 && count(P, 'Forest') >= 3 ? 0 : -10);
  return d;
};
S['Protean Hydra'] = (d) => {
  d.etbCtr = (G, P, card, opts) => ({ '+1/+1': (opts && opts.item && opts.item.x) || 0 });
  d.aiX = (G, P, card, max) => (max >= 2 ? max : null);
  d.preventAll = (G, c, n) => {
    const k = removeCounters(G, c, '+1/+1', n || 0);
    if (k > 0) {
      emit(G, 'info', `Damage to ${c.def.name} is prevented; it loses ${k} +1/+1 counter${k > 1 ? 's' : ''}.`, { who: c.ctrl, cards: [c.id] });
      G.delayed.push({ when: 'end', run: (GG) => { if (onBf(GG, c)) addCounters(GG, c, 2 * k); } });
    }
    return true;
  };
  return d;
};
S['Stampeding Wildebeests'] = (d) => {
  d.trig.push(T('upkeep', { you: true, run: (G, X) => {
    const P = X.P, cs = P.bf.filter((c) => isCreature(c) && c.def.colors.includes('G'));
    if (!cs.length) return;
    const c = pickOne(G, P, cs, 'Return a green creature you control to its owner\'s hand', (x) => (x.def.etb.length ? 2 : 0) - x.def.mv * 0.3 - (x === X.src ? 3 : 0), 'choose', 'battlefield');
    bounceCard(G, P, c);
  } }));
  return d;
};
S['Stream of Life'] = (d) => { d.spell = [fn((G, X) => gain(G, X.P, X.x || 0), { score: (G, P, X) => ((X && X.x) || 0) * L.lifeW(P) })]; d.aiX = (G, P, card, max) => (P.life <= 10 && max >= 3 ? max : null); return d; };
S['Treetop Bracers'] = (d) => {
  d.statics = d.statics.filter((x) => x.who !== 'enchanted');
  d.statics.push({ who: 'enchanted', p: 1, t: 1, kw: [], flags: { onlyFlyers: true } });
  d.auraVal = (G, P, c) => (c.ctrl === P.i ? 1.5 + Math.max(0, pow(c)) * 0.5 - (has(c, 'flying') ? 1.5 : 0) : -2);
  return d;
};
S['Trollhide'] = (d) => {
  d.statics = d.statics.filter((x) => x.who !== 'enchanted');
  d.statics.push({ who: 'enchanted', p: 2, t: 2, kw: [] });
  d.auraVal = (G, P, c) => (c.ctrl === P.i ? 2.5 + cv(c) * 0.2 : -3);
  return regenerate(d, '{1}{G}', true);
};
S['Verdant Catacombs'] = (d) => {
  d.acts.push({ cost: { tap: true, sacSelf: true, life: 1 }, eff: [{ k: 'tutor', f: { types: ['Swamp', 'Forest'], fn: (dd) => dd.types.includes('Land') }, to: 'bf', why: 'a Swamp or Forest card' }], label: 'Search for a Swamp or Forest card', when: ['end', 'main1', 'main2'],
    ai: (G, P, c, when) => (P.library.some((x) => isLand(x) && (x.def.sub.includes('Swamp') || x.def.sub.includes('Forest'))) ? { score: when === 'end' || G.active !== P.i ? 1.5 : 1 } : null) });
  d.role = 'land';
  return d;
};
S['Verduran Enchantress'] = (d) => { d.trig.push(T('cast', { you: true, cond: (G, src, ev) => !!ev.card && ev.card.def.types.includes('Enchantment'), eff: [{ k: 'draw', n: 1 }] })); return d; };
S['Yavimaya Enchantress'] = (d) => { const n = (G) => allPerms(G).filter(isEnchantment).length; d.statics.push({ who: 'self', pFn: n, tFn: n, kw: [] }); return d; };

/* ============================================================ Artifacts and lands */
S['Blade of the Bloodchief'] = (d) => {
  d.trig.push(T('die', { cond: (G, src, ev) => !!ev.def && ev.def.types.includes('Creature') && src.att != null && !!byId(G, src.att), run: (G, X) => { const h = byId(G, X.src.att); if (h) addCounters(G, h, hasSub(h, 'Vampire') ? 2 : 1); } }));
  return d;
};
const empires = (P, a, b) => named(P, a) && named(P, b);
S['Crown of Empires'] = (d) => {
  d.acts.push({ cost: { m: C('{3}'), tap: true }, label: 'Tap a creature (gain control of it with Scepter and Throne of Empires)', when: ['main1', 'end'],
    eff: [fn((G, X, t) => { const c = t && t.c; if (!c || !onBf(G, c)) return; if (empires(X.P, 'Scepter of Empires', 'Throne of Empires')) gainControl(G, X.P, c, 'perm'); else if (!c.tapped) { c.tapped = true; sayTap(G, c, X.P, 'is tapped'); } },
      { tgt: { f: {} }, val: (G, P, c) => (c.ctrl === P.i ? -1 : empires(P, 'Scepter of Empires', 'Throne of Empires') ? cv(c) + 1 : c.tapped ? -1 : cv(c) * 0.3), label: 'Choose a creature' })] });
  return d;
};
S['Scepter of Empires'] = (d) => {
  d.acts.push({ cost: { tap: true }, label: '1 damage to a player (3 with Crown and Throne of Empires)', when: ['end', 'main2'],
    eff: [fn((G, X, t) => hit(G, X, { p: t ? t.p : X.O.i }, empires(X.P, 'Crown of Empires', 'Throne of Empires') ? 3 : 1), { tgt: { what: 'player' }, val: (G, P, x) => (x.p === P.i ? -5 : 1), label: 'Choose a player' })] });
  return d;
};
S['Throne of Empires'] = (d) => {
  d.acts.push({ cost: { m: C('{1}'), tap: true }, label: 'Create a 1/1 Soldier (five with Crown and Scepter of Empires)', when: ['end', 'main2'],
    eff: [mkE(SOLDIER, (G, X) => (empires(X.P, 'Crown of Empires', 'Scepter of Empires') ? 5 : 1))] });
  return d;
};
S['Disrupting Scepter'] = (d) => {
  d.acts.push({ cost: { m: C('{3}'), tap: true }, label: 'A player discards a card', cond: (G, P) => G.active === P.i, when: ['main1', 'main2'],
    eff: [fn((G, X, t) => { const Q = G.players[t ? t.p : X.O.i]; if (!Q.hand.length) return; G.discCause = X.P.i; try { discardChoice(G, Q, 1, 'discard'); } finally { G.discCause = null; } emit(G, 'discard', `${Q.name} discards a card.`, { who: X.P.i }); },
      { tgt: { what: 'player' }, val: (G, P, x) => (x.p === P.i ? -5 : G.players[x.p].hand.length ? 1 : -1), label: 'Choose a player' })] });
  return d;
};
S['Elixir of Immortality'] = (d) => {
  d.acts.push({ cost: { m: C('{2}'), tap: true }, label: 'Gain 5 life; shuffle it and your graveyard into your library', when: ['end'],
    run: (G, X) => {
      const P = X.P;
      gain(G, P, 5);
      if (onBf(G, X.src)) { L.leaveBattlefield(G, X.src); L.resetCard(X.src); P.library.push(X.src); }
      P.library.push(...P.gy.splice(0));
      G.rng.shuffle(P.library); dirty(G);
      emit(G, 'info', `${P.name} shuffles ${X.src.def.name} and their graveyard into their library.`, { who: P.i });
    }, ai: (G, P) => (P.life <= 10 || P.library.length <= 8 ? { score: 2 } : null) });
  return d;
};
S['Fodder Cannon'] = (d) => {
  d.acts.push({ cost: { m: C('{4}'), tap: true, sac: doomedFirst() }, label: '4 damage to a creature', when: ['blocks', 'main1', 'end'],
    eff: [{ k: 'dmgX', nFn: () => 4, tgt: { f: {} } }],
    ai: (G, P, c, when) => {
      const fodder = P.bf.filter((x) => isCreature(x)).sort((a, b) => (doomed(G, b) ? 10 : 0) - (doomed(G, a) ? 10 : 0) || pv(G, a) - pv(G, b))[0];
      if (!fodder) return null;
      const t = other(G, P).bf.filter((x) => isCreature(x) && lethalTo(x) <= 4 && !has(x, 'indestructible')).sort((a, b) => cv(b) - cv(a))[0];
      const cost = doomed(G, fodder) ? 0 : pv(G, fodder);
      return t && cv(t) - cost > 1 ? { score: cv(t) - cost, targets: [{ c: t }] } : null;
    } });
  return d;
};
S['Icy Manipulator'] = (d) => {
  d.acts.push({ cost: { m: C('{1}'), tap: true }, label: 'Tap an artifact, creature, or land', when: ['main1', 'end'], eff: [{ k: 'tapP', tgt: { f: { types: ['Artifact', 'Creature', 'Land'] } } }],
    ai: (G, P, c, when) => {
      const O = other(G, P);
      const t = O.bf.filter((x) => isCreature(x) && !x.tapped).sort((a, b) => cv(b) - cv(a))[0];
      if (!t) return null;
      if (when === 'main1' && !P.bf.some((x) => L.canAttackNow(G, x) && pow(x) > 0)) return null;
      return { score: 0.6 + cv(t) * 0.25, targets: [{ c: t }] };
    } });
  return d;
};
S['Mantis Engine'] = (d) => {
  d.acts.push({ cost: { m: C('{2}') }, label: 'Gains flying until end of turn', when: ['main1'], run: (G, X) => grantKw(G, X.src, ['flying']),
    ai: (G, P, c) => (L.canAttackNow(G, c) && !has(c, 'flying') && other(G, P).bf.some((b) => isCreature(b) && !b.tapped && !has(b, 'flying') && !has(b, 'reach')) && !other(G, P).bf.some((b) => isCreature(b) && !b.tapped && (has(b, 'flying') || has(b, 'reach'))) ? { score: 0.8 } : null) });
  d.acts.push({ cost: { m: C('{2}') }, label: 'Gains first strike until end of turn', when: ['blocks'], run: (G, X) => grantKw(G, X.src, ['first strike']),
    ai: (G, P, c) => {
      if (!inCombat(G, c) || has(c, 'first strike')) return null;
      const foe = c.attacking ? c.blockedBy.find((b) => onBf(G, b)) : allCreatures(G).find((x) => x.id === c.blocking);
      if (!foe) return null;
      const f0 = c.attacking ? A._internal.fight(c, foe) : A._internal.fight(foe, c);
      c.tkw.push('first strike');
      const f1 = c.attacking ? A._internal.fight(c, foe) : A._internal.fight(foe, c);
      c.tkw.pop();
      const me0 = c.attacking ? f0.aDies : f0.bDies, me1 = c.attacking ? f1.aDies : f1.bDies;
      return me0 && !me1 ? { score: 2 } : null;
    } });
  return d;
};
S['Mimic Vat'] = (d) => {
  const held = (G, src) => { const id = src.mem.vat; if (id == null) return null; for (const Q of G.players) { const c = Q.exile.find((x) => x.id === id); if (c) return c; } return null; };
  d.trig.push(T('die', { cond: (G, src, ev) => !ev.token && !!ev.def && ev.def.types.includes('Creature'), run: (G, X) => {
    const card = X.ev.c, Q = card ? G.players[card.owner] : null;
    if (!Q || !Q.gy.includes(card)) return;
    const old = held(G, X.src);
    const want = isHuman(G, X.P) ? yesNo(G, X.P, X.src, `Mimic Vat: exile ${card.def.name}${old ? ` (${old.def.name} goes back to its graveyard)` : ''}?`, true) : !old || card.def.value > old.def.value;
    if (!want) return;
    Q.gy.splice(Q.gy.indexOf(card), 1); Q.exile.push(card);
    X.src.mem.vat = card.id;
    if (old) { const O = G.players[old.owner]; O.exile.splice(O.exile.indexOf(old), 1); O.gy.push(old); }
    dirty(G);
    emit(G, 'exile', `${card.def.name} is imprinted on ${X.src.def.name}${old ? `; ${old.def.name} goes to the graveyard` : ''}.`, { who: X.P.i, cards: [card.id] });
  } }));
  d.acts.push({ cost: { m: C('{3}'), tap: true }, label: 'Create a hasty token copy of the imprinted card (exiled at end of turn)', when: ['main1'], cond: (G, P, c) => !!held(G, c),
    run: (G, X) => {
      const card = held(G, X.src); if (!card) return;
      const t = copyToken(G, X.P, card, {}, { haste: true });
      emit(G, 'token', `${X.P.name} creates a token copy of ${card.def.name}.`, { who: X.P.i, cards: [t.id] });
      G.delayed.push({ when: 'end', run: (GG) => { if (onBf(GG, t)) exilePermanent(GG, GG.players[t.ctrl], t); } });
    }, ai: (G, P, c) => { const card = held(G, c); return card && card.def.types.includes('Creature') ? { score: 0.6 + card.def.value * 0.3 } : null; } });
  return d;
};
S['Phyrexian Vault'] = (d) => { d.acts.push({ cost: { m: C('{2}'), tap: true, sac: doomedFirst() }, label: 'Draw a card', eff: [{ k: 'draw', n: 1 }], when: ['blocks'], ai: sacAi(1.5) }); return d; };
S['Precursor Golem'] = (d) => {
  d.etb = [mkE(GOLEM, 2)];
  d.trig.push(T('cast', { cond: (G, src, ev) => {
    if (!ev.item || !isIS(ev.card.def)) return false;
    const ts = allTargets(ev.item.targets);
    return ts.length === 1 && !!ts[0].c && onBf(G, ts[0].c) && isCreature(ts[0].c) && hasSub(ts[0].c, 'Golem');
  }, run: (G, X) => {
    const item = X.ev.item, P = X.ev.P, golem = allTargets(item.targets)[0].c;
    const eff = L.spellEffects(item.card.def, item.mode);
    const k = eff.findIndex((e, i) => item.targets[i] && (item.targets[i].c === golem || (item.targets[i].cs || []).includes(golem)));
    if (k < 0) return;
    for (const g of allCreatures(G).filter((c) => c !== golem && hasSub(c, 'Golem'))) {
      if (!L.tgtOk(G, P, eff[k].tgt ? eff[k] : { k: 'dmgX', tgt: { f: {} } }, g, item.card, {}) && eff[k].tgt) continue;
      const preset = eff.map((e, i) => (i === k ? { c: g } : item.targets[i] || null));
      emit(G, 'copy', `${P.name} copies ${item.card.def.name}, targeting ${g.def.name}.`, { who: P.i, card: item.card.id });
      const copy = { id: -item.card.id, def: item.card.def, owner: P.i, ctrl: P.i, isCopy: true, tkw: [], cnt: 0, tp: 0, tt: 0, ctr: {}, tf: {} };
      L.resolveWithTargets(G, P, copy, eff, { x: item.x, item, mode: item.mode, copy: true }, 'spell', preset);
    }
  } }));
  return d;
};
S["Sorcerer's Strongbox"] = (d) => {
  d.acts.push({ cost: { m: C('{2}'), tap: true }, label: 'Flip a coin: if you win, sacrifice it and draw three cards', when: ['end'],
    run: (G, X) => { const win = G.rng.next() < 0.5; emit(G, 'info', `${X.P.name} flips a coin and ${win ? 'wins' : 'loses'}.`, { who: X.P.i }); if (win && onBf(G, X.src)) { sacrifice(G, X.P, X.src, true); drawN(G, X.P, 3); } }, ai: () => ({ score: 1.2 }) });
  return d;
};
S['Steel Hellkite'] = (d) => {
  d.pumpAbility = { cost: C('{2}'), p: 1, t: 0, max: 3 };
  d.trig.push(T('hitPlayer', { self: true, run: (G, X) => { X.src.mem.hit = (X.src.mem.hit || []).filter((h) => h.turn === G.turn).concat({ turn: G.turn, p: X.ev.Q.i }); } }));
  d.acts.push({ cost: { m: C('{X}') }, label: 'Destroy each nonland permanent with mana value X whose controller it dealt combat damage to this turn', once: true, when: ['main2'],
    run: (G, X) => {
      const hitP = (X.src.mem.hit || []).filter((h) => h.turn === G.turn).map((h) => h.p);
      const cs = allPerms(G).filter((c) => !isLand(c) && c.def.mv === (X.x || 0) && hitP.includes(c.ctrl));
      for (const c of cs) destroyPermanent(G, X.P, c, `to ${X.src.def.name}`);
      if (!cs.length) say(G, X.P, 'Nothing is destroyed.');
    },
    ai: (G, P, c) => {
      const hitP = (c.mem.hit || []).filter((h) => h.turn === G.turn).map((h) => h.p);
      if (!hitP.length) return null;
      const max = maxAbX(P, C('{0}'));
      let best = null;
      for (let x = 0; x <= max; x++) { const s = allPerms(G).filter((y) => !isLand(y) && y.def.mv === x && hitP.includes(y.ctrl)).reduce((t, y) => t + (y.ctrl === P.i ? -pv(G, y) : pv(G, y)), 0); if (!best || s > best.s) best = { x, s }; }
      return best && best.s > 1 ? { score: best.s, x: best.x } : null;
    } });
  return d;
};
S['Thran Golem'] = (d) => { d.statics.push({ who: 'self', cond: (G, src) => allPerms(G).some((x) => x.def.aura && x.att === src.id), p: 2, t: 2, kw: ['flying', 'first strike', 'trample'] }); return d; };
S['Urza\'s Armor'] = (d) => { d.armor = 1; return d; };
S['Whispersilk Cloak'] = (d) => {
  d.statics = d.statics.filter((x) => x.who !== 'equipped');
  d.statics.push({ who: 'equipped', p: 0, t: 0, kw: ['shroud'], flags: { unblockable: true } });
  return d;
};
S['Glimmerpost'] = (d) => {
  tapsFor(d, ['C']);
  d.etb = [fn((G, X) => gain(G, X.P, allPerms(G).filter((c) => hasSub(c, 'Locus')).length), { score: () => 0.5 })];
  d.role = 'land';
  return d;
};

return S;
});
