/* Magic: The Gathering Marvel Super Heroes (MSH): rules for the cards whose text the engine's reader can't handle on its own.
   Each entry gets the card's skeleton (types, cost, keywords, equip, cycling, teamwork, improvise and simple power-up lines
   already read) and fills in the rest from the engine's shared vocabulary of effects and triggers. Modal double-faced cards
   have an entry for each face; either face can be cast, and the front can also be turned over by its ability. */
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
  enterBattlefield, searchLibrary, dealDamage, damageCreature, legendsOf, sgn, nameList, discardChoice, ctrlOf, costMV, targetList, isIS, chooseNumber,
  investigate, connive, scryChoice, enteredThisTurn, attackedThisTurn, exileUntil, returnHeld, allTargets, fire } = L;

/* ---------- Shorthand ---------- */
const C = (s) => L.parseCost(s);
const T = (on, o) => Object.assign({ on }, o);
const fn = (run, o) => Object.assign({ k: 'fn', run }, o);
const tg = (f, o) => Object.assign({ f: f || {} }, o);
const YOU = { side: 'you' }, OPP = { side: 'opp' };
const myTurn = (G, src) => G.active === src.ctrl;
const nonCre = (ev) => !ev.card.def.types.includes('Creature');
const tcs = (t) => targetList(t).map((x) => x.c).filter(Boolean);
const isEquip = (c) => hasSub(c, 'Equipment');
const nArt = (P) => P.bf.filter(isArtifact).length;
const nCre = (P) => P.bf.filter(isCreature).length;
const heroes = (P, src) => P.bf.filter((c) => isCreature(c) && hasSub(c, 'Hero') && c !== src);
const villains = (P, src) => P.bf.filter((c) => isCreature(c) && hasSub(c, 'Villain') && c !== src);
const permCard = (d) => !d.types.includes('Instant') && !d.types.includes('Sorcery');
const say = (G, P, text, cards) => emit(G, 'info', text, { who: P.i, cards });
const drawN = (G, P, n) => { if (n <= 0) return; drawCards(G, P, n); emit(G, 'draw', `${P.name} draws ${n === 1 ? 'a card' : `${n} cards`}.`, { who: P.i }); };
const loseLife = (G, Q, n, who) => { if (n <= 0) return; Q.life -= n; L.noteLoss(G, Q, n); emit(G, 'life', `${Q.name} loses ${n} life.`, { who: who != null ? who : Q.i, target: `p${Q.i}`, amount: n }); };
const gain = (G, P, n) => { if (n <= 0) return; const b = P.life; gainLife(G, P, n); const got = P.life - b; if (got > 0) emit(G, 'life', `${P.name} gains ${got} life.`, { who: P.i, target: `p${P.i}`, amount: -got }); };
const pump = (G, c, p, t, kws = []) => { if (!onBf(G, c)) return; c.tp += p; c.tt += t; kws.forEach((k) => { if (!c.tkw.includes(k)) c.tkw.push(k); }); dirty(G); emit(G, 'pump', `${c.def.name} gets ${sgn(p)}/${sgn(t)}${kws.length ? ` and gains ${kws.join(' and ')}` : ''} until end of turn.`, { who: c.ctrl, cards: [c.id] }); };
const grantKw = (G, c, kws, text) => { if (!onBf(G, c)) return; kws.forEach((k) => { if (!c.tkw.includes(k)) c.tkw.push(k); }); dirty(G); emit(G, 'pump', `${c.def.name} ${text || `gains ${kws.join(' and ')} until end of turn`}.`, { who: c.ctrl, cards: [c.id] }); };
const ctrEach = (G, cs, n = 1, kind = '+1/+1') => { for (const c of cs) addCounters(G, c, n, kind); };
// Damage from a source to a player or creature (lifelink, protection and the damage modifiers apply)
const hit = (G, X, to, n, src) => dealDamage(G, Object.assign({}, X, { src: src || X.src }), to.def ? { c: to } : to, n);
const hitOpp = (G, X, n, src) => hit(G, X, { p: X.O.i }, n, src);
const ctx0 = (G, P) => ({ P, O: other(G, P), src: null, ev: {} });
const drain = (G, X, n) => { loseLife(G, X.O, n, X.P.i); gain(G, X.P, n); };
// Pick one card: a human chooses, the AI takes the best by `score`
function pickOne(G, P, cards, label, score, reason = 'choose', zone) {
  if (!cards.length) return null;
  if (cards.length === 1 && reason !== 'look') return cards[0];
  if (isHuman(G, P)) return pickCards(G, { type: 'choose', reason, n: 1, min: 1, max: 1, zone: zone || (onBf(G, cards[0]) ? 'battlefield' : 'graveyard'), cards: cards.map((c) => c.id), label }, cards, 1)[0];
  return cards.slice().sort((a, b) => score(b) - score(a) || a.id - b.id)[0];
}
function pickSome(G, P, cards, min, max, label, score, zone, reason = 'choose') {
  max = Math.min(max, cards.length);
  if (max <= 0) return [];
  if (isHuman(G, P)) return pickCards(G, { type: 'choose', reason, n: max, min: Math.min(min, max), max, zone: zone || 'battlefield', cards: cards.map((c) => c.id), label }, cards, null).slice(0, max);
  const ranked = cards.slice().sort((a, b) => score(b) - score(a) || a.id - b.id);
  return ranked.filter((c, k) => k < min || (k < max && score(c) > 0));
}
// Look at the top n cards; up to k that match go to hand (or `to`); the rest go to the bottom in a random order (or the graveyard)
function lookTake(G, P, n, pred, k, why, rest = 'bottom', score) {
  const top = P.library.splice(Math.max(0, P.library.length - n)).reverse();
  if (!top.length) return [];
  const ok = top.filter(pred);
  const take = pickSome(G, P, ok, 0, k, why, score || ((c) => c.def.value + 1), 'library', 'look');
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
  const nm = made.length ? made[0].def.name : spec.name; // a replaced token (Divine Visitation) shows what was made
  emit(G, 'token', `${P.name} creates ${n === 1 ? `${/^[AEIOU]/.test(nm) ? 'an' : 'a'} ${nm} token` : `${n} ${nm} tokens`}${o.tapped ? ', tapped' : ''}.`, { who: P.i, cards: made.map((c) => c.id) });
  return made;
}
const tokVal = (s) => (s.p != null ? s.p + s.t * 0.6 + 0.3 + (s.kw || []).length * 0.4 + (s.trig ? 0.8 : 0) : 1);
const mkE = (spec, n = 1, o = {}) => fn((G, X) => mk(G, X.P, spec, typeof n === 'function' ? n(G, X) : n, o), {
  score: (G, P, X) => (typeof n === 'function' ? n(G, X || ctx0(G, P)) : n) * tokVal(spec) * (o.tapped ? 0.8 : 1), value: (typeof n === 'number' ? n : 2) * tokVal(spec) });
const tokSpec = (name, p, t, colors, sub, kw = [], extra = {}) => Object.assign({ id: `msh-${name.toLowerCase().replace(/[^a-z]+/g, '-')}-${p}-${t}`, name, p, t, colors, sub, kw }, extra);
const VILLAIN = tokSpec('Villain', 2, 1, ['B'], ['Villain'], ['menace']);
const SOLDIER = tokSpec('Soldier', 1, 1, ['W'], ['Soldier']);
const HERO = tokSpec('Hero', 3, 2, ['W'], ['Hero'], ['vigilance']);
const WALL = tokSpec('Wall', 0, 4, [], ['Wall'], ['defender']);
const VOID = tokSpec('The Void', 5, 5, ['B'], ['Horror', 'Villain'], ['flying', 'indestructible'], { legendary: true, text: 'Flying, indestructible\nThe Void attacks each combat if able.', defX: { mustAttack: true } });
const REDWING = tokSpec('Redwing', 1, 1, ['U'], ['Bird', 'Scout'], ['flying'], { legendary: true, text: 'Flying\nWhenever Redwing attacks, surveil 1.',
  trig: [T('attack', { self: true, run: (G, X) => surveil(G, X.P, 1) })] });
const LEVIATHAN = tokSpec('Leviathan', 6, 5, ['U'], ['Leviathan'], ['hexproof']);
const MERFOLK = tokSpec('Merfolk', 1, 1, ['U'], ['Merfolk']);
const SQUIRREL = tokSpec('Squirrel', 1, 1, ['G'], ['Squirrel']);
const ZABU = tokSpec('Zabu', 2, 2, ['G'], ['Cat'], [], { legendary: true, text: 'Landfall — Whenever a land you control enters, put a +1/+1 counter on Zabu.',
  trig: [T('landfall', { you: true, run: (G, X) => addCounters(G, X.src, 1) })] });
const MOLOID = tokSpec('Moloid', 1, 1, ['G'], ['Minion'], [], { text: 'Whenever this token attacks, you may mill a card.',
  trig: [T('attack', { self: true, may: true, mayAi: (G, X) => X.P.library.length > 10, mayLabel: 'Mill a card?', run: (G, X) => mill(G, X.P, 1) })] });
const TIGER_GOD = tokSpec('The Tiger God', 4, 4, ['G'], ['Cat', 'God'], [], { legendary: true, text: "The Tiger God can't be blocked by more than one creature.", defX: { maxOne: true } });
const INSECT = tokSpec('Insect', 1, 1, ['G'], ['Insect']);
const ALIEN = tokSpec('Alien', 1, 1, ['R'], ['Alien'], ['haste'], { text: 'Haste\nThis token attacks each combat if able.', defX: { mustAttack: true } });
const GALACTUS = tokSpec('Galactus', 16, 16, ['B'], ['Elder', 'Alien'], ['flying', 'trample'], { legendary: true, text: 'Flying, trample\nWhenever Galactus attacks, destroy target land.',
  trig: [T('attack', { self: true, eff: [{ k: 'destroyP', tgt: { f: { types: ['Land'] } } }] })] });
const STURDY_SHIELD = { id: 'msh-sturdy-shield', name: 'Sturdy Shield', art: true, sub: ['Equipment'], colors: [], text: 'Equipped creature gets +1/+2.\nEquip {2}', value: 1.5,
  statics: [{ who: 'equipped', p: 1, t: 2, kw: [] }], acts: [{ equip: true, cost: { m: { g: 2, W: 0, U: 0, B: 0, R: 0, G: 0 } }, sorcery: true, label: 'Equip {2}' }] };
const DOOMBOT = tokSpec('Doombot', 3, 3, [], ['Robot', 'Villain'], [], { artifact: true });
const ROBOT_VILLAIN = tokSpec('Robot Villain', 2, 2, [], ['Robot', 'Villain'], [], { artifact: true });
const CLUE = L.CLUE;
// Shared abilities
const castNC = (o) => T('cast', Object.assign({ you: true, cond: (G, src, ev) => nonCre(ev) }, o));
// "Whenever a creature you control attacks alone"
const alone = (o) => T('attacks', Object.assign({ you: true, cond: (G, s, ev) => ev.cs.length === 1 }, o));
const aloneSelf = (o) => T('attacks', Object.assign({ you: true, cond: (G, s, ev) => ev.cs.length === 1 && ev.cs[0] === s }, o));
const lone = (X) => X.ev.cs[0];
const attackingAlone = (G, c) => c.attacking && !!G.combat && G.combat.attackers.filter((x) => onBf(G, x) && x.attacking).length === 1;
// "Whenever you cast a spell that targets a creature you control"
const targetsMine = (G, P, item) => !!item && allTargets(item.targets).some((t) => t.c && isCreature(t.c) && t.c.ctrl === P.i);
const castAtMine = (o) => T('cast', Object.assign({ you: true, cond: (G, s, ev) => targetsMine(G, ev.P, ev.item) }, o));
// "Whenever you draw your second card each turn"
const draw2 = (o) => T('draw', Object.assign({ you: true, cond: (G, s, ev) => ev.nth === 2 }, o));
// One trigger for a batch of events ("one or more"): skip if this ability is already waiting to resolve
const batchOnce = (cond) => (G, src, ev, Q) => cond(G, src, ev, Q) && !(G.pending || []).some((p) => p.src === src && p.t && p.t.on === ev.__on);
// Power-up: once per object, cheaper by the card's own mana cost the turn it entered
const pu = (cost, o) => Object.assign({ cost: { m: C(cost) }, powerUp: true, label: 'Power-up' }, o);
const setPU = (d, cost, o) => { d.acts = d.acts.filter((a) => !a.powerUp); d.acts.push(pu(cost, o)); return d; };
// AI score for a power-up: better when it entered this turn (cheaper) and before combat
const puAi = (score) => (G, P, c, when) => { const s = typeof score === 'function' ? score(G, P, c, when) : score; return s > 0 ? { score: s + (c.inTurn === G.turn ? 0.8 : 0) - (when === 'blocks' ? 1 : 0) } : null; };
// Teamwork: the plain spell, and the spell cast using teamwork (an extra cost: tap creatures with total power N)
function twSpell(d, n, base, withTw) { d.modes = [base, Object.assign({}, withTw, { addCost: { teamwork: n } })]; d.spell = null; d.teamwork = n; return d; }
function twBoth(d, n, a, b) { d.modes = [a, b, { label: `Both (teamwork ${n})`, eff: a.eff.concat(b.eff), addCost: { teamwork: n } }]; d.spell = null; d.teamwork = n; return d; }
// Plan enchantments: plan counters; when the Nth is put on it, it's sacrificed and the plan pays off
function planOn(d, at, eff, label) { d.plan = { at, eff, label: label || 'The plan comes together' }; d.role = d.role || 'value'; return d; }
function plan(G, X, n = 1) {
  const src = X.src;
  if (!src || !onBf(G, src) || n <= 0) return;
  const before = ctrCount(src, 'plan');
  addCounters(G, src, n, 'plan');
  const p = src.def.plan;
  if (!p || before >= p.at || before + n < p.at) return;
  emit(G, 'sac', `${src.def.name}'s plan comes together: ${X.P.name} sacrifices it.`, { who: X.P.i, cards: [src.id] });
  sacrifice(G, X.P, src, true);
  if (G.pending) G.pending.unshift({ src, P: X.P, t: { eff: p.eff, label: p.label }, ev: {} });
}
// Infinity Stones: harness it (an activated ability); its ∞ ability works only once it's harnessed
const harnessed = (c) => !!(c && c.mem && c.mem.harnessed);
const harness = (cost, score = 3) => ({ cost: { m: C(cost), tap: true }, label: 'Harness', cond: (G, P, c) => !harnessed(c),
  run: (G, X) => { X.src.mem.harnessed = true; emit(G, 'ability', `${X.src.def.name} is harnessed: its ∞ ability is active.`, { who: X.P.i, card: X.src.id }); if (G.pending) fire(G, 'harness', { c: X.src, P: X.P }); },
  ai: (G, P, c, when) => (when === 'blocks' ? null : { score: typeof score === 'function' ? score(G, P, c) : score }) });
// Modal double-faced cards: "{cost}: Transform ~. Activate only as a sorcery."
const turnOver = (cost, score = 3) => ({ cost: { m: C(cost) }, sorcery: true, label: 'Transform', run: (G, X) => transform(G, X.src), ai: (G, P, c) => ({ score: typeof score === 'function' ? score(G, P, c) : score }) });
const backScore = (G, P, c) => (c.def.back ? 2 + c.def.back.value * 0.6 - c.def.value * 0.6 : 0);
// Exile something until this permanent leaves the battlefield
const holdUntilLeaves = (d) => { d.trig.push(T('leave', { self: true, run: (G, X) => returnHeld(G, X.ev.mem) })); return d; };
// Choose a player's creature to sacrifice (their choice: the AI gives up its least valuable)
function edictOf(G, Q, f, why) {
  const cs = Q.bf.filter((c) => (f ? f(c) : isCreature(c)));
  if (!cs.length) return null;
  const c = L.sacrificeChoice(G, Q, cs);
  emit(G, 'sac', `${Q.name} sacrifices ${c.def.name}${why ? ` (${why})` : ''}.`, { who: Q.i, cards: [c.id] });
  sacrifice(G, Q, c, true);
  return c;
}
// A card put into its owner's graveyard this turn (Night Nurse)
const gyThisTurn = (P, c) => !(P.gyStart || []).includes(c.id);
// "Choose one —" on a triggered ability: the mode is picked as it resolves, then that mode's targets are chosen
function chooseOne(modes, o = {}) {
  const legal = (G, P, X, m) => m.eff.every((e) => !L.needsTarget(e) || (e.tgt && e.tgt.min === 0)) || !!L.chooseTargets(G, P, m.eff, 'trigger', X.src, X);
  const best = (G, P, X) => modes.map((m, k) => ({ k, s: legal(G, P, X, m) ? ((L.chooseTargets(G, P, m.eff, 'trigger', X.src, X) || { score: -1 }).score) : -Infinity })).sort((a, b) => b.s - a.s)[0];
  return fn((G, X) => {
    const P = X.P;
    const ok = modes.map((m, k) => k).filter((k) => legal(G, P, X, modes[k]));
    if (!ok.length) return;
    let k;
    if (isHuman(G, P)) k = ok.length === 1 ? ok[0] : ok[chooseMode(G, P, X.src, `${X.src ? X.src.def.name : 'Choose'}: choose one`, ok.map((j) => modes[j].label), 0)];
    else { const b = best(G, P, X); k = b && b.s > -Infinity ? b.k : ok[0]; }
    emit(G, 'info', `${X.src ? X.src.def.name : P.name}: ${modes[k].label}.`, { who: P.i });
    if (G.pending) G.pending.unshift({ src: X.src, P, t: { eff: modes[k].eff, run: modes[k].run, label: modes[k].label }, ev: X.ev || {} });
  }, Object.assign({ score: (G, P, X) => { const b = best(G, P, X || ctx0(G, P)); return b && b.s > 0 ? b.s : 0.2; }, value: 1.5 }, o));
}
// A token that's a copy of a permanent (or of a card's definition)
function copyToken(G, P, src, mods = {}, o = {}) {
  const base = src.def || src;
  const def = Object.assign({}, base, { id: `${base.id}-copy-${G.nextId}`, token: true, front: null, back: null, adv: null, advOf: null, meldInto: null, isBack: false, mdfc: false }, mods.def || {});
  if (mods.nonLegendary) def.supertypes = def.supertypes.filter((x) => x !== 'Legendary');
  G.defs[def.id] = def;
  const t = A._internal.newCard(G, def, P.i);
  t.token = true;
  enterBattlefield(G, P, t, null, { tapped: !!o.tapped });
  if (o.tapped) t.tapped = true;
  if (o.haste) grantKw(G, t, ['haste']);
  return t;
}
// A permanent becomes a copy of something (until `by` leaves, or until end of turn); undone by unCopy or when it leaves
function becomeCopy(G, c, def, by, o = {}) {
  if (!onBf(G, c)) return;
  const cdef = Object.assign({}, def, { id: `${def.id}-as-${c.id}-${G.nextId++}`, token: !!c.token, front: null, back: null, adv: null, advOf: null, meldInto: null, isBack: false, mdfc: false });
  if (o.nonLegendary) cdef.supertypes = cdef.supertypes.filter((x) => x !== 'Legendary');
  G.defs[cdef.id] = cdef;
  if (!c.faceBase) c.faceBase = c.def;
  c.def = cdef;
  c.copyBy = by ? by.id : -1;
  dirty(G);
  emit(G, 'copy', `${c.faceBase.name} becomes a copy of ${def.name}.`, { who: c.ctrl, cards: [c.id] });
  if (o.untilEnd) G.delayed.push({ when: 'end', run: (GG) => unCopy(GG, c) });
}
function unCopy(G, c) {
  if (!c || !c.faceBase || !onBf(G, c)) return;
  c.def = c.faceBase; c.faceBase = null; c.copyBy = null;
  dirty(G);
  emit(G, 'copy', `${c.def.name} is itself again.`, { who: c.ctrl, cards: [c.id] });
}
// Exile a permanent; it returns under its owner's control at the beginning of the next end step
function exileTilEnd(G, X, c) {
  if (!c || !onBf(G, c)) return;
  const owner = G.players[c.owner];
  exilePermanent(G, X.P, c);
  if (c.token) return;
  G.delayed.push({ when: 'end', run: (GG) => {
    if (!owner.exile.includes(c)) return;
    owner.exile.splice(owner.exile.indexOf(c), 1);
    emit(GG, 'enter', `${c.def.name} returns to the battlefield.`, { who: owner.i, card: c.id });
    enterBattlefield(GG, owner, c, null, {});
  } });
}
// Put a permanent into its owner's library: 'top', 'second' (from the top) or 'bottom'
function toLibrary(G, X, c, where) {
  if (!c || !onBf(G, c)) return;
  const Q = ctrlOf(G, c);
  L.leaveBattlefield(G, c); L.resetCard(c);
  if (!c.token) { const lib = G.players[c.owner].library; if (where === 'bottom') lib.unshift(c); else if (where === 'second' && lib.length) lib.splice(lib.length - 1, 0, c); else lib.push(c); }
  if (Q !== X.P && isCreature(c)) X.P.stats.kills++;
  dirty(G);
  emit(G, 'exile', `${c.def.name} goes into ${G.players[c.owner].name}'s library${where === 'bottom' ? ' on the bottom' : where === 'second' ? ', second from the top' : ' on top'}.`, { who: X.P.i, cards: [c.id] });
}
// "When this Equipment enters, attach it to target creature you control."
const attachE = (after) => fn((G, X, t) => { const c = t && t.c; if (c && onBf(G, c) && onBf(G, X.src)) { attach(G, X.src, c); if (after) after(G, X, c); } },
  { tgt: { f: { side: 'you' } }, val: (G, P, c) => 0.5 + cv(c) * 0.2 + (has(c, 'flying') ? 0 : 0.3), label: 'Attach it to a creature you control' });
const untap = (G, c, P) => { if (c && onBf(G, c) && c.tapped) { c.tapped = false; emit(G, 'tapfx', `${c.def.name} untaps.`, { who: P ? P.i : c.ctrl, cards: [c.id] }); } };
const discardE = (G, P, n, reason = 'loot') => { const before = P.hand.length; discardChoice(G, P, n, reason); const k = before - P.hand.length; if (k) emit(G, 'discard', `${P.name} discards ${k === 1 ? 'a card' : `${k} cards`}.`, { who: P.i }); };
// Blue mana symbols in a mana cost (hybrid symbols count)
const blueSymbols = (def) => (def.cost.U || 0) + (def.cost.hy || []).filter((h) => h.includes('U')).length;
const S = {};

/* ============================ White ============================ */
S['Agent 13, Sharon Carter'] = (d) => { d.trig.push(alone({ eff: [{ k: 'investigate', n: 1 }] })); return d; };
S['Agent Maria Hill'] = (d) => {
  d.twBonus = true;
  d.trig.push(T('teamworkTap', { self: true, run: (G, X) => { addCounters(G, X.src, 1); drawN(G, X.P, 1); } }));
  return d;
};
S['Agent Phil Coulson'] = (d) => {
  d.acts.push({ cost: { tap: true }, label: 'Put a +1/+1 counter on each other Hero you control', when: ['main2', 'end'],
    run: (G, X) => ctrEach(G, heroes(X.P, X.src)), ai: (G, P, c, when) => { const n = heroes(P, c).length; return n ? { score: n * 0.9 - (when === 'main2' ? 0.6 : 0) } : null; } });
  return d;
};
S['Agents of S.H.I.E.L.D.'] = (d) => { d.trig.push(alone({ run: (G, X) => pump(G, lone(X), 1, 1) })); return d; };
S['Avengers Assemble!'] = (d) => {
  d.statics.push({ who: 'all', f: { side: 'you', sub: 'Hero' }, p: 2, t: 2, kw: [] });
  const ok = (G, Q) => attackedThisTurn(G, Q).some((c) => hasSub(c, 'Hero')) || enteredThisTurn(G, Q).some((c) => c.def.types.includes('Creature') && hasSub(c, 'Hero'));
  d.trig.push(T('endStep', { cond: (G, s, ev, Q) => ok(G, Q), run: (G, X) => drawN(G, X.P, 1) }));
  d.role = 'anthem';
  return d;
};
S['Captain America, Super-Soldier'] = (d) => {
  d.etbCtr = () => ({ shield: 1 });
  const on = (G, src) => ctrCount(src, 'shield') > 0;
  d.statics.push({ who: 'all', f: { side: 'you', sub: 'Hero', other: true }, cond: on, p: 0, t: 0, kw: ['hexproof'] });
  d.playerHex = on;
  return d;
};
S['Captain America, Wings of Freedom'] = (d) => {
  d.trig.push(T('attack', { self: true, run: (G, X) => { const n = tou(X.src); for (const c of heroes(X.P, X.src)) pump(G, c, n, n); } }));
  return d;
};
S['Captain Marvel, Earth\'s Protector'] = (d) => setPU(d, '{5}{W}{W}', { run: (G, X) => { addCounters(G, X.src, 1); addCounters(G, X.src, 1, 'indestructible'); }, ai: puAi(3.2) });
S['Captain Mar-Vell, Space-Born'] = (d) => { d.flashFor = (def, G, P) => !!G && !!P && other(G, P).cast > 0; return d; };
S['Colleen Wing, Street Samurai'] = (d) => { d.trig.push(castAtMine({ run: (G, X) => { addCounters(G, X.src, 1); scryChoice(G, X.P, 1); } })); return d; };
S['Crowd of True Believers'] = (d) => {
  d.acts.push({ cost: { tap: true }, label: 'An attacking-alone creature gets +1/+0; gain 1 life', when: ['blocks'],
    eff: [{ k: 'pumpT', p: 1, t: 0, tgt: { f: { side: 'you', fn: (G, c) => attackingAlone(G, c) } } }, { k: 'gain', n: 1 }] });
  return d;
};
S['Helicarrier Strike'] = (d) => twSpell(d, 2,
  { label: '2 damage to an attacking or blocking creature', eff: [{ k: 'dmgX', nFn: () => 2, tgt: { f: { fn: (G, c) => c.attacking || !!c.blocking } } }] },
  { label: '4 damage (teamwork)', eff: [{ k: 'dmgX', nFn: () => 4, tgt: { f: { fn: (G, c) => c.attacking || !!c.blocking } } }] });
S['Hero in Training'] = (d) => {
  d.etb = [{ k: 'draw', n: 1 }, fn((G, X) => { if (heroes(X.P, X.src).length) gain(G, X.P, 2); }, { score: (G, P) => (heroes(P).length ? 0.6 : 0) })];
  return d;
};
S['Invisible Woman, Sue Storm'] = (d) => {
  const cond = (G, src, ev, Q) => ev.kind === '+1/+1' && ev.c !== src && ev.c.ctrl === Q.i && isCreature(ev.c) && hasSub(ev.c, 'Hero') && !(G.pending || []).some((p) => p.src === src && p.t && p.t.on === 'counters');
  d.trig.push(T('counters', { cond, may: true, mayAi: () => true, mayLabel: 'Create a 0/4 Wall token?', eff: [mkE(WALL, 1)] }));
  return d;
};
S['Jennifer Walters'] = (d) => { d.silenceOpp = true; d.acts.push(turnOver('{3}{G}{W}{W}', backScore)); return d; };
S['The Sensational She-Hulk'] = (d) => {
  d.silenceOpp = true;
  d.trig.push(T('dmgCreature', { cond: (G, src, ev, Q) => ev.ctrl === Q.i && ev.n > 0, once: true,
    eff: [{ k: 'dmgX', nFn: (G, X) => X.ev.n || 0, tgt: { what: 'any', f: {} } }] }));
  return d;
};
S['Luke Cage, Power Man'] = (d) => { d.trig.push(aloneSelf({ run: (G, X) => pump(G, X.src, 2, 0, ['indestructible']) })); return d; };
S['The Mind Stone'] = (d) => {
  d.mana = ['W'];
  d.acts.push(harness('{5}{W}', 2.5));
  d.trig.push(T('endStep', { you: true, cond: (G, src) => harnessed(src), eff: [fn((G, X, t) => { const c = t && t.c; if (c && onBf(G, c)) blink(G, c, {}); },
    { tgt: { f: { types: ['nonland'], side: 'you' }, other: true, min: 0 }, val: (G, P, c) => (c.token ? -2 : L.flickerVal ? L.flickerVal(G, P, c) : c.def.etb.length ? 1.2 : -0.2), label: 'Exile up to one other nonland permanent you control, then return it' })] }));
  return d;
};
S['Mockingbird, Ace Agent'] = (d) => { d.trig.push(castAtMine({ run: (G, X) => addCounters(G, X.src, 1) })); return d; };
S['Monica Rambeau'] = (d) => { d.acts.push(turnOver('{2}{R}{W}{W}', backScore)); return d; };
S['Photon, Living Light'] = (d) => { d.trig.push(castNC({ run: (G, X) => ctrEach(G, X.P.bf.filter((c) => isCreature(c) && c !== X.src)) })); return d; };
S['Murdock\'s Crusade'] = (d) => twBoth(d, 4,
  { label: 'Street Justice: exile a creature with toughness 4 or greater', eff: [{ k: 'exileP', tgt: { f: {}, fn: (G, P, c) => tou(c) >= 4 } }] },
  { label: 'Legal Justice: exile an enchantment with mana value 4 or greater', eff: [{ k: 'exileP', tgt: { f: { types: ['Enchantment'] }, fn: (G, P, c) => c.def.mv >= 4 } }] });
S['Nick Fury, Agent of S.H.I.E.L.D.'] = (d) => setPU(d, '{W}{U}{B}{R}{G}', { ai: puAi(4), run: (G, X) => {
  addCounters(G, X.src, 2);
  const P = X.P;
  const top = P.library.splice(Math.max(0, P.library.length - 7)).reverse();
  const ok = top.filter((c) => (c.def.types.includes('Creature') && c.def.sub.includes('Hero')) || c.def.sub.includes('Equipment') || c.def.sub.includes('Vehicle'));
  const take = pickSome(G, P, ok, 0, 1, 'Put a Hero, Equipment or Vehicle onto the battlefield', (c) => c.def.value + c.def.mv * 0.3 + 1, 'library', 'look')[0];
  const rest = top.filter((c) => c !== take);
  G.rng.shuffle(rest); P.library.unshift(...rest);
  dirty(G);
  if (!take) { emit(G, 'search', `${P.name} looks at the top ${top.length} cards and puts them on the bottom.`, { who: P.i }); return; }
  let flip = false;
  if (take.def.back) flip = isHuman(G, P) ? yesNo(G, P, take, `Put ${take.def.name} onto the battlefield transformed (${take.def.back.name})?`, false) : take.def.back.value > take.def.value;
  emit(G, 'search', `${P.name} puts ${flip ? take.def.back.name : take.def.name} onto the battlefield.`, { who: P.i, cards: [take.id] });
  enterBattlefield(G, P, take, null, { transformed: flip });
} });
S['Night Nurse, Healer of Heroes'] = (d) => {
  d.etb = [{ k: 'regrow', to: 'hand', tgt: { what: 'gy', mine: true, f: { types: ['permanent'] }, fn: (G, P, c) => gyThisTurn(P, c) } }];
  return d;
};
S['Okoye, Dora Milaje Leader'] = (d) => {
  d.etb = [mkE(SOLDIER, 2)];
  d.statics.push({ who: 'all', f: { side: 'you', token: true, attacking: true }, p: 0, t: 0, kw: ['first strike'] });
  return d;
};
S['Origin of the Avengers'] = (d) => {
  d.saga = [
    { ch: [1], run: (G, X) => scryChoice(G, X.P, 2) },
    { ch: [2], run: (G, X) => {
      const P = X.P;
      const cs = P.hand.filter((c) => c.def.types.includes('Creature') && c.def.sub.includes('Hero') && c.def.mv <= 3);
      const pick = cs.length ? (isHuman(G, P) ? pickSome(G, P, cs, 0, 1, 'Put a Hero with mana value 3 or less onto the battlefield', (c) => c.def.value, 'hand')[0] : cs.sort((a, b) => b.def.value - a.def.value)[0]) : null;
      if (pick) { P.hand.splice(P.hand.indexOf(pick), 1); emit(G, 'enter', `${P.name} puts ${pick.def.name} onto the battlefield.`, { who: P.i, card: pick.id }); enterBattlefield(G, P, pick, null, {}); }
      else drawN(G, P, 1);
    } },
    { ch: [3], run: (G, X) => ctrEach(G, X.P.bf.filter(isCreature)) },
  ];
  return d;
};
S['Panther Pounce'] = (d) => {
  d.spell = [
    fn((G, X, t) => { const Q = t && t.p != null ? G.players[t.p] : X.P; investigate(G, Q, 1); }, { tgt: { what: 'player', f: {} }, val: (G, P, x) => (x.p === P.i ? 0.9 : -0.9), label: 'Choose a player to investigate' }),
    fn((G, X, t) => { const c = t && t.c; if (!c || !onBf(G, c)) return; pump(G, c, 1, 0, ['flying']); if (c.tapped) { c.tapped = false; emit(G, 'tapfx', `${c.def.name} untaps.`, { who: X.P.i, cards: [c.id] }); } },
      { tgt: { f: {} }, val: (G, P, c, X, ctx) => (c.ctrl !== P.i ? -0.5 : (c.attacking ? 1.6 : 0.4) + (c.tapped ? 0.7 : 0) + (has(c, 'flying') ? 0 : 0.3)), label: 'A creature gets +1/+0 and flying, and untaps' }),
  ];
  return d;
};
S['Patriot, Shield Wielder'] = (d) => {
  d.acts.push({ cost: { m: C('{2}'), tap: true }, label: 'Another creature gets +2/+0 and hexproof', when: ['blocks'],
    eff: [{ k: 'pumpT', p: 2, t: 0, kw: ['hexproof'], tgt: { f: { side: 'you' }, other: true } }] });
  return d;
};
S['Political Triumph'] = (d) => {
  planOn(d, 4, [fn((G, X) => { drawN(G, X.P, 1); ctrEach(G, X.P.bf.filter(isCreature)); }, { score: (G, P) => 1 + nCre(P) * 0.9 })]);
  d.trig.push(T('enter', { you: true, f: {}, run: (G, X) => { scryChoice(G, X.P, 1); plan(G, X); } }));
  return d;
};
S['Quake, Agent of S.H.I.E.L.D.'] = (d) => { d.trig.push(castNC({ eff: [{ k: 'tapP', tgt: { f: { types: ['Creature', 'Land'] } } }] })); return d; };
S['Raft Security Officer'] = (d) => {
  d.acts.push({ cost: { m: C('{1}'), tap: true }, label: 'Tap a creature with power 3 or less', when: ['main1', 'end', 'blocks'], eff: [{ k: 'tapP', tgt: { f: { powLE: 3 } } }] });
  d.acts.push({ cost: { m: C('{2}'), tap: true }, label: 'Tap a creature', when: ['main1', 'end', 'blocks'], eff: [{ k: 'tapP', tgt: { f: { fn: (G, c) => pow(c) > 3 } } }] });
  return d;
};
S['Red Guardian, Super-Soldier'] = (d) => { d.etb = [{ k: 'destroyP', tgt: { f: { side: 'opp', fn: (G, c) => c.dealtTurn === G.turn } } }]; return d; };
S['The Sentry, Golden Guardian'] = (d) => {
  d.etb = [fn((G, X) => mk(G, X.O, VOID, 1), { score: () => -3.5 })];
  d.castScore = (G, P) => (other(G, P).bf.some((c) => c.def.name === 'The Void') ? 0 : -1);
  return d;
};
S['S.H.I.E.L.D. Spy Kit'] = (d) => {
  d.trig.push(T('attacks', { cond: (G, src, ev) => ev.cs.length === 1 && src.att === ev.cs[0].id, run: (G, X) => { const c = lone(X); if (onBf(G, c)) { c.tapped = false; emit(G, 'tapfx', `${c.def.name} untaps.`, { who: X.P.i, cards: [c.id] }); } scryChoice(G, X.P, 1); } }));
  return d;
};
S['Super Villain Lockup'] = (d) => {
  d.etb = [fn((G, X, t) => { if (t && t.c) exileUntil(G, X.P, X.src, t.c); }, { tgt: { f: { side: 'opp', tapped: true } }, val: (G, P, c) => pv(G, c) + 0.5, label: 'Exile a tapped creature an opponent controls' })];
  d.role = 'removal';
  return holdUntilLeaves(d);
};
S['Super-Soldier Serum'] = (d) => {
  d.statics = d.statics.filter((s) => s.who !== 'enchanted');
  d.statics.push({ who: 'enchanted', p: 2, t: 2, kw: ['first strike', 'vigilance'], addSub: ['Soldier'], legendary: true });
  const eqs = (G, P, host) => P.bf.filter((c) => isEquip(c) && c.att !== host.id);
  const run = (G, X, host) => { const cs = eqs(G, X.P, host); const pick = pickSome(G, X.P, cs, 0, cs.length, `Attach Equipment to ${host.def.name}`, () => 1); for (const e of pick) if (onBf(G, host)) attach(G, e, host); };
  d.trig.push(T('attack', { cond: (G, src, ev) => src.att === ev.c.id, run: (G, X) => run(G, X, X.ev.c) }));
  d.trig.push(T('blocks', { cond: (G, src, ev) => src.att === ev.c.id, run: (G, X) => run(G, X, X.ev.c) }));
  return d;
};
S['Take Up the Shield'] = (d) => {
  d.spell = [fn((G, X, t) => { const c = t && t.c; if (!c || !onBf(G, c)) return; addCounters(G, c, 1); grantKw(G, c, ['lifelink', 'indestructible']); },
    { tgt: { f: {} }, val: (G, P, c, X, ctx) => (c.ctrl !== P.i ? -1 : 0.9 + (c.attacking || c.blocking ? cv(c) * 0.5 : 0.2)), label: 'A creature gets a +1/+1 counter, lifelink and indestructible' })];
  return d;
};
S['Web Up'] = (d) => {
  d.etb = [fn((G, X, t) => { if (t && t.c) exileUntil(G, X.P, X.src, t.c); }, { tgt: { f: { types: ['nonland'], side: 'opp' } }, val: (G, P, c) => pv(G, c) + 0.5, label: 'Exile a nonland permanent an opponent controls' })];
  d.role = 'removal';
  return holdUntilLeaves(d);
};
S['White Widow, Free Agent'] = (d) => {
  d.etb = [chooseOne([
    { label: 'Put a +1/+1 counter on each of up to two creatures', eff: [{ k: 'ctrs', n: 1, tgt: { f: {}, n: 2, min: 0 } }] },
    { label: 'Return an artifact or enchantment card from your graveyard to your hand', eff: [{ k: 'regrow', to: 'hand', tgt: { what: 'gy', mine: true, f: { types: ['Artifact', 'Enchantment'] } } }] },
  ])];
  return d;
};

/* ============================ Blue ============================ */
S['Atlantean Cavalry'] = (d) => { d.trig.push(draw2({ run: (G, X) => addCounters(G, X.src, 1) })); return d; };
S['Atlantis Attacks'] = (d) => twBoth(d, 4,
  { label: 'A player creates a 6/5 Leviathan with hexproof', eff: [fn((G, X, t) => mk(G, t && t.p != null ? G.players[t.p] : X.P, LEVIATHAN, 1),
    { tgt: { what: 'player', f: {} }, val: (G, P, x) => (x.p === P.i ? 6 : -6), label: 'Choose a player to create a 6/5 Leviathan' })] },
  { label: "Return one or two nonland permanents to their owners' hands", eff: [fn((G, X, t) => { for (const c of tcs(t)) if (onBf(G, c)) bounceCard(G, X.P, c); },
    { tgt: { f: { types: ['nonland'] }, n: 2, min: 1 }, val: (G, P, c) => (c.ctrl === P.i ? -pv(G, c) : c.token ? pv(G, c) + 1 : c.def.mv * 0.5 + pv(G, c) * 0.3), label: 'Return one or two nonland permanents' })] });
S['Attuma, Atlantean Warlord'] = (d) => {
  d.statics.push({ who: 'all', f: { side: 'you', sub: 'Merfolk', other: true }, p: 1, t: 1, kw: [] });
  d.trig.push(T('attacks', { you: true, cond: (G, s, ev) => ev.cs.some((c) => hasSub(c, 'Merfolk')), run: (G, X) => drawN(G, X.P, 1) }));
  return d;
};
S['Bold Biochemist'] = (d) => setPU(d, '{5}{U}', { run: (G, X) => { addCounters(G, X.src, 1); drawN(G, X.P, 2); }, ai: puAi(2.8) });
S['Bruce Banner'] = (d) => {
  d.acts.push({ cost: { m: Object.assign(C('{0}'), { x: 2 }), tap: true, xMin: 1 }, sorcery: true, label: 'Draw X cards',
    run: (G, X) => drawN(G, X.P, X.x || 0), ai: (G, P, c, when) => (when === 'main2' ? { score: 1.6 } : null) });
  d.acts.push(turnOver('{2}{R}{R}{G}{G}', backScore));
  return d;
};
S['The Incredible Hulk'] = (d) => {
  d.trig.push(T('dmgCreature', { cond: (G, src, ev) => ev.c === src, run: (G, X) => {
    addCounters(G, X.src, 1);
    if (X.src.attacking && onBf(G, X.src)) { untap(G, X.src, X.P); G.extraCombat = true; say(G, X.P, `${X.src.def.name} is enraged: there is an additional combat phase after this one.`, [X.src.id]); }
  } }));
  return d;
};
S['Depower'] = (d) => {
  d.costMod = (G, P, card, tgs) => (tgs && tgs[0] && tgs[0].c && tgs[0].c.attacking ? 2 : 0);
  d.spell = [fn((G, X, t) => { const c = t && t.c; if (c && onBf(G, c)) { c.tp -= 4; dirty(G); emit(G, 'pump', `${c.def.name} gets -4/-0 until end of turn.`, { who: X.P.i, cards: [c.id] }); } },
    { tgt: { f: {} }, val: (G, P, c) => (c.ctrl === P.i ? -0.5 : c.attacking || c.blocking ? 0.6 + Math.min(4, Math.max(0, pow(c))) * 0.45 : 0.15), label: 'A creature gets -4/-0' }), { k: 'draw', n: 1 }];
  return d;
};
S['Echo, Perceptive Prodigy'] = (d) => {
  // The engine resolves abilities at once, so Echo copies the next ability of a creature you control that resolves this turn
  d.acts.push({ cost: { m: C('{1}'), tap: true }, label: 'Copy the next ability of a creature you control this turn', noAi: true,
    run: (G, X) => { X.P.echoNext = { turn: G.turn, n: 1, src: X.src.id, creature: true }; say(G, X.P, `The next ability of a creature ${X.P.name} controls that resolves this turn is copied.`); } });
  return d;
};
S['Falcon, Winged Wonder'] = (d) => { d.etb = [mkE(REDWING, 1)]; return d; };
S["Falcon's Wing Harness"] = (d) => {
  d.statics = d.statics.filter((s) => s.who !== 'equipped');
  d.statics.push({ who: 'equipped', p: 1, t: 1, kw: ['flying'], ward: 1 });
  d.etb = [attachE()];
  return d;
};
S['Frozen in Ice'] = (d) => {
  d.etb = [fn((G, X) => { const h = X.src.att != null && byId(G, X.src.att); if (h && onBf(G, h)) { h.tapped = true; emit(G, 'tapfx', `${h.def.name} is tapped.`, { who: X.P.i, cards: [h.id] }); } }, { score: () => 0.5 })];
  d.statics.push({ who: 'enchanted', p: 0, t: 0, kw: [], flags: { noAbil: true, noUntap: true } });
  d.role = 'removal';
  return d;
};
S['Giant-Sized Flying Ant'] = (d) => {
  d.etb = [chooseOne([
    { label: 'Tap a nonland permanent', eff: [{ k: 'tapP', tgt: { f: { types: ['nonland'] } } }] },
    { label: 'Untap a nonland permanent', eff: [{ k: 'untapP', tgt: { f: { types: ['nonland'] } } }] },
  ])];
  return d;
};
S['Hydraulic Helper'] = (d) => {
  d.mana = null;
  d.manaAbs = [{ colors: ['U'], only: (p) => !p.def || p.def.types.includes('Artifact') }];
  return d;
};
S['I Am Iron Man'] = (d) => {
  d.spell = [fn((G, X, t) => {
    const c = t && t.c; if (!c || !onBf(G, c)) return;
    c.base = { p: 4, t: 4, eot: true };
    c.tf.animated = true; c.tf.artifact = true;
    if (!c.tkw.includes('flying')) c.tkw.push('flying');
    dirty(G);
    emit(G, 'pump', `${c.def.name} becomes a 4/4 artifact creature with flying until end of turn.`, { who: X.P.i, cards: [c.id] });
  }, { tgt: { f: { types: ['Artifact', 'Creature'] } }, val: (G, P, c) => (c.ctrl !== P.i ? -1 : isCreature(c) ? Math.max(0, 4 - pow(c)) * 0.5 + (has(c, 'flying') ? 0 : 1) * (c.attacking ? 1.2 : 0.5) + 0.2 : 1.5), label: 'An artifact or creature becomes a 4/4 artifact creature with flying' }),
  { k: 'draw', n: 1 }];
  return d;
};
S['Iron Lad, Diverging Destiny'] = (d) => {
  d.acts.push({ cost: { tap: true }, label: 'Reveal the top card; draw it if it is an artifact', when: ['main2', 'end'],
    run: (G, X) => { const top = X.P.library[X.P.library.length - 1]; if (!top) return; emit(G, 'reveal', `${X.P.name} reveals ${top.def.name}.`, { who: X.P.i, cards: [top.id] }); if (top.def.types.includes('Artifact')) drawN(G, X.P, 1); },
    ai: (G, P) => { const top = P.library[P.library.length - 1]; return top && top.def.types.includes('Artifact') ? { score: 1.5 } : null; } });
  return d;
};
S['Ironheart, Clever Champion'] = (d) => { d.improvise = true; d.improviseFor = (def) => !def.types.includes('Creature'); return d; };
S['Justice, Vance Astrovik'] = (d) => {
  d.etb = [{ k: 'bounceP', tgt: { f: { types: ['nonland'], nontoken: true }, min: 0 } }];
  d.trig.push(T('bounced', { cond: (G, src, ev, Q) => ev.c !== src && ev.ctrl === Q.i && !ev.def.types.includes('Land'), run: (G, X) => addCounters(G, X.src, 1) }));
  return d;
};
S['Kang the Conqueror'] = (d) => setPU(d, '{5}{U}{U}{U}', { ai: puAi(6), run: (G, X) => {
  addCounters(G, X.src, 1);
  G.extraTurns.push(X.P.i);
  (G.puLocks = G.puLocks || []).push(G.turn + 1);
  say(G, X.P, `${X.P.name} will take an extra turn after this one. Power-up abilities can't be activated during it.`);
} });
S['Kid Loki'] = (d) => {
  d.statics.push({ who: 'all', f: { side: 'you', fn: (G, c) => c.plusTurn === G.turn }, p: 0, t: 0, kw: ['hexproof'] });
  d.trig.push(draw2({ run: (G, X) => addCounters(G, X.src, 1) }));
  return d;
};
S['Leader, Super-Genius'] = (d) => {
  d.conniveDraw = true;
  d.trig.push(T('combatStart', { you: true, eff: [fn((G, X, t) => { const c = t && t.c; if (c && onBf(G, c)) connive(G, X.P, c); }, { tgt: { f: { side: 'you' } }, val: (G, P, c) => 1 + cv(c) * 0.05, label: 'A creature you control connives' })] }));
  return d;
};
S['Loki, God of Mischief'] = (d) => { d.trig.push(T('targeted', { once: true, cond: (G, src, ev, Q) => !!ev.ability && ev.by === Q, run: (G, X) => drawN(G, X.P, 1) })); return d; };
S['Mister Fantastic, Reed Richards'] = (d) => {
  d.trig.push(T('enter', { you: true, cond: (G, src, ev) => !!ev.c.token && !(G.pending || []).some((p) => p.src === src && p.t && p.t.on === 'enter'),
    may: true, mayAi: () => true, mayLabel: 'Draw a card?', run: (G, X) => drawN(G, X.P, 1) }));
  return d;
};
S['Ms. Marvel, Kamala Khan'] = (d) => {
  d.noMaxHand = true;
  d.powFn = (G, c) => (c.mem && c.mem.embiggen === G.turn ? G.players[c.ctrl].hand.length : null);
  d.trig.push(castAtMine({ run: (G, X) => { drawN(G, X.P, 1); X.src.mem.embiggen = G.turn; dirty(G); } }));
  return d;
};
S['Multiversal Incursion'] = (d) => {
  d.spell = [fn((G, X) => { for (const c of X.P.bf.filter((x) => isCreature(x) && !x.token)) copyToken(G, X.P, c, { nonLegendary: true }); },
    { score: (G, P) => P.bf.filter((x) => isCreature(x) && !x.token).reduce((s, c) => s + cv(c), 0) * 0.9 - 2 })];
  return d;
};
S['Namor the Sub-Mariner'] = (d) => {
  d.power = 1;
  d.powFn = (G, c) => G.players[c.ctrl].bf.filter((x) => isCreature(x) && hasSub(x, 'Merfolk')).length;
  d.trig.push(castNC({ cond: (G, s, ev) => nonCre(ev) && blueSymbols(ev.card.def) > 0, run: (G, X) => mk(G, X.P, MERFOLK, blueSymbols(X.ev.card.def)) }));
  return d;
};
S['Pym Particles'] = (d) => {
  d.spell = [fn((G, X, t) => { const c = t && t.c; if (!c || !onBf(G, c)) return; if (!c.tkw.includes('vigilance')) c.tkw.push('vigilance'); c.tf.unblockable = true; dirty(G); emit(G, 'pump', `${c.def.name} gains vigilance and can't be blocked this turn.`, { who: X.P.i, cards: [c.id] }); },
    { tgt: { f: {} }, val: (G, P, c, X, ctx) => (c.ctrl !== P.i ? -0.3 : (ctx === 'main1' || ctx === 'main') && L.canAttackNow(G, c) ? 0.5 + Math.max(0, pow(c)) * 0.5 : 0.2), label: "A creature gains vigilance and can't be blocked this turn" }),
    { k: 'draw', n: 1 }];
  return d;
};
S['Rewrite History'] = (d) => {
  planOn(d, 4, [fn((G, X, t) => { for (const c of tcs(t)) { const Q = G.players.find((q) => q.gy.includes(c)); if (!Q) continue; Q.gy.splice(Q.gy.indexOf(c), 1); X.P.hand.push(c); emit(G, 'raise', `${X.P.name} returns ${c.def.name} to hand.`, { who: X.P.i, cards: [c.id] }); } },
    { tgt: { what: 'gy', mine: true, f: { types: ['Instant', 'Sorcery'] }, n: 2, min: 0 }, val: (G, P, c) => 0.8 + c.def.value * 0.3, label: 'Return up to two instant and/or sorcery cards' })]);
  d.trig.push(T('tapped', { you: true, cond: (G, src, ev) => ev.cs.some((c) => c.def.types.includes('Creature') || isCreature(c)) && !(G.pending || []).some((p) => p.src === src && p.t && p.t.on === 'tapped'),
    run: (G, X) => { drawN(G, X.P, 1); discardE(G, X.P, 1); plan(G, X); } }));
  return d;
};
S['Secret Invasion'] = (d) => {
  d.aura = { f: { side: 'you' } };
  d.statics.push({ who: 'enchanted', p: 0, t: 0, kw: [], ward: 2 });
  d.etb = [fn((G, X, t) => {
    const c = t && t.c, host = X.src.att != null ? byId(G, X.src.att) : null;
    if (!c || !onBf(G, c) || c === host) return;
    const cdef = c.def;
    exileUntil(G, X.P, X.src, c);
    if (host && onBf(G, host) && onBf(G, X.src)) becomeCopy(G, host, cdef, X.src);
  }, { tgt: { f: {}, min: 0, fn: (G, P, c, src) => !src || c.id !== src.att }, val: (G, P, c) => (c.ctrl === P.i ? -cv(c) : cv(c) + 1), label: 'Exile up to one other creature; the enchanted creature becomes a copy of it' })];
  d.trig.push(T('leave', { self: true, run: (G, X) => { const host = G.players.flatMap((Q) => Q.bf).find((c) => c.copyBy === X.src.id); unCopy(G, host); returnHeld(G, X.ev.mem); } }));
  d.auraVal = (G, P, c) => (c.ctrl === P.i ? 3 - cv(c) * 0.3 : -5);
  d.castIf = (G, P) => other(G, P).bf.some(isCreature);
  d.role = 'removal';
  return d;
};
S['S.H.I.E.L.D. Flying Car'] = (d) => {
  d.etb = [fn((G, X, t) => exileTilEnd(G, X, t && t.c), { tgt: { f: { side: 'you' }, min: 0 }, val: (G, P, c) => L.flickerVal(G, P, c) - 0.3, label: 'Exile up to one creature you control until the next end step' })];
  return d;
};
S['Shuri, Wakandan Inventor'] = (d) => {
  d.spellDiscount = (G, P, card) => (card.def.types.includes('Artifact') ? 1 : 0);
  d.acts.push({ cost: { m: C('{1}'), tap: true }, sorcery: true, label: 'An artifact you control becomes a copy of another until end of turn', noAi: true,
    cond: (G, P) => P.bf.filter(isArtifact).length >= 2,
    run: (G, X) => {
      const arts = X.P.bf.filter(isArtifact);
      const a = pickOne(G, X.P, arts, 'Choose the artifact that becomes a copy', (c) => -pv(G, c));
      const b = a && pickOne(G, X.P, arts.filter((c) => c !== a), 'Choose the artifact to copy', (c) => pv(G, c));
      if (a && b) becomeCopy(G, a, b.def, X.src, { nonLegendary: true, untilEnd: true });
    } });
  return d;
};
S['Stature, Size Shifter'] = (d) => {
  d.blockOnlyBy = (G, b, a) => pow(a) > 1;
  setPU(d, '{X}{U}{U}', { run: (G, X) => addCounters(G, X.src, X.x || 0),
    ai: (G, P, c, when) => { if (when === 'blocks') return null; const base = c.inTurn === G.turn ? { U: 1 } : { U: 2 }; let x = 0; while (x < 12 && canPay(P, Object.assign(L.genericCost(x + 1), base))) x++; return x >= 3 ? { score: x * 0.9 } : null; } });
  d.acts[d.acts.length - 1].cost.xMin = 1;
  return d;
};
S['Super Intelligence'] = (d) => {
  d.trig.push(T('upkeep', { cond: (G, src, ev) => { const h = src.att != null && byId(G, src.att); return !!h && !!ev.P && h.ctrl === ev.P.i; }, run: (G, X) => drawN(G, X.ev.P, 1) }));
  d.auraVal = (G, P, c) => (c.ctrl === P.i ? 1.5 + (has(c, 'hexproof') ? 0.5 : 0) - (c.token ? 0.5 : 0) : -2);
  return d;
};
S['Super Suit'] = (d) => { d.etb = [attachE((G, X, c) => untap(G, c, X.P))]; return d; };
S['Thirst for Knowledge'] = (d) => {
  d.spell = [fn((G, X) => {
    const P = X.P;
    drawN(G, P, 3);
    const arts = P.hand.filter((c) => c.def.types.includes('Artifact'));
    let useArt = false;
    if (arts.length) {
      if (isHuman(G, P)) useArt = chooseMode(G, P, X.src, 'Thirst for Knowledge: discard', ['An artifact card', 'Two cards'], 0) === 0;
      else { const worstArt = Math.min(...arts.map((c) => handValue(G, P, c))); const two = P.hand.map((c) => handValue(G, P, c)).sort((a, b) => a - b).slice(0, 2).reduce((s, v) => s + v, 0); useArt = worstArt <= two; }
    }
    if (useArt) { const c = pickOne(G, P, arts, 'Discard an artifact card', (x) => -handValue(G, P, x), 'choose', 'hand'); P.hand.splice(P.hand.indexOf(c), 1); P.gy.push(c); dirty(G); emit(G, 'discard', `${P.name} discards ${c.def.name}.`, { who: P.i, cards: [c.id] }); }
    else discardE(G, P, 2);
  }, { score: () => 2.2 })];
  return d;
};
S['Tony Stark'] = (d) => {
  d.acts.push({ cost: { m: C('{1}'), tap: true }, label: 'Look at the top four cards; take an artifact', when: ['main2', 'end'],
    run: (G, X) => lookTake(G, X.P, 4, (c) => c.def.types.includes('Artifact'), 1, 'Put an artifact card into your hand'), ai: () => ({ score: 1.2 }) });
  d.acts.push(turnOver('{4}{U}{R}', backScore));
  return d;
};
S['The Invincible Iron Man'] = (d) => {
  d.trig.push(T('combatStart', { you: true, run: (G, X) => {
    const P = X.P;
    const arts = P.hand.filter((c) => c.def.types.includes('Artifact'));
    if (!arts.length) return;
    const pick = isHuman(G, P) ? pickSome(G, P, arts, 0, 1, 'Put an artifact card from your hand onto the battlefield', (c) => c.def.value, 'hand')[0] : arts.slice().sort((a, b) => b.def.value + b.def.mv * 0.3 - a.def.value - a.def.mv * 0.3)[0];
    if (!pick) return;
    P.hand.splice(P.hand.indexOf(pick), 1);
    emit(G, 'enter', `${P.name} puts ${pick.def.name} onto the battlefield.`, { who: P.i, card: pick.id });
    enterBattlefield(G, P, pick, null, {});
    if (pick.def.sub.includes('Equipment') && onBf(G, pick) && onBf(G, X.src)) attach(G, pick, X.src);
  } }));
  return d;
};
S["Trickster's Stratagem"] = (d) => {
  d.spell = [
    fn((G, X, t) => {
      const c = t && t.c; if (!c || !onBf(G, c)) return;
      const O = G.players[c.owner];
      const second = isHuman(G, O) ? chooseMode(G, O, c, `${c.def.name}: put it second from the top or on the bottom of your library?`, ['Second from the top', 'Bottom'], 0) === 0 : true;
      toLibrary(G, X, c, second ? 'second' : 'bottom');
    }, { tgt: { f: { side: 'opp' } }, val: (G, P, c) => pv(G, c) * 0.8 + (c.token ? 1 : 0), label: "Put a creature an opponent controls into its owner's library" }),
    fn((G, X, t) => { const c = t && t.c; if (c && onBf(G, c)) connive(G, X.P, c); }, { tgt: { f: { side: 'you' }, min: 0 }, val: () => 1, label: 'Up to one creature you control connives' }),
  ];
  return d;
};
S['We Say Thee Nay!'] = (d) => {
  d.respondOnly = true;
  d.spell = [{ k: 'counter', unless: 2 }];
  const twOk = (G, O) => { const p = L.twPick(G, O, 2); return p && p.pain < 1.6 ? p : null; };
  d.respond = { counter: true,
    legal: (G, O, item) => item.P !== O,
    ai: (G, O, item) => { const n = twOk(G, O) ? 4 : 2; return canPay(item.P, L.genericCost(n)) ? -1 : L.threatOf(G, O, item); },
    res: (G, O, item, cs) => {
      const P = item.P;
      let tw = false;
      if (L.twPower(O) >= 2) {
        tw = isHuman(G, O) ? yesNo(G, O, cs, `${cs.def.name}: use teamwork (tap creatures with total power 2 or more) to make it {4}?`, true) : !!twOk(G, O) || (!canPay(P, L.genericCost(4)) && canPay(P, L.genericCost(2)));
        if (tw) tw = L.teamworkPay(G, O, cs, 2);
      }
      const n = tw ? 4 : 2;
      if (canPay(P, L.genericCost(n)) && (!isHuman(G, P) || yesNo(G, P, item.card, `Pay {${n}} so ${item.card.def.name} isn't countered?`, true))) {
        pay(P, L.genericCost(n));
        emit(G, 'info', `${P.name} pays ${n}, so ${item.card.def.name} resolves.`, { who: P.i });
        return false;
      }
      L.finishCountered(G, item);
      return true;
    } };
  d.role = 'counter';
  return d;
};
S['Wiccan, Rising Magician'] = (d) => {
  d.trig.push(castNC({ eff: [fn((G, X, t) => exileTilEnd(G, X, t && t.c), { tgt: { f: { types: ['nonland'], nontoken: true }, other: true },
    val: (G, P, c) => (c.ctrl === P.i ? L.flickerVal(G, P, c) : isCreature(c) ? cv(c) * 0.35 + (c.attacking || c.blocking ? 1 : 0) : 0.3), label: 'Exile another nonland, nontoken permanent until the next end step' })] }));
  return d;
};
S['The Wondrous Wasp'] = (d) => {
  d.etb = [fn((G, X, t) => {
    const c = t && t.c; if (!c || !onBf(G, c)) return;
    c.tapped = true;
    X.src.mem.stung = (X.src.mem.stung || []).concat(c.id);
    dirty(G);
    emit(G, 'tapfx', `${c.def.name} is tapped and loses all abilities while ${X.src.def.name} remains.`, { who: X.P.i, cards: [c.id] });
  }, { tgt: { f: {}, min: 0 }, val: (G, P, c) => (c.ctrl === P.i ? -1 : cv(c) * 0.4 + (c.def.trig.length + c.def.acts.length + c.def.kw.length) * 0.4), label: 'Tap up to one creature; it loses all abilities' })];
  d.statics.push({ who: 'all', f: { types: ['any'], fn: (G, c, P, src) => !!(src.mem && src.mem.stung && src.mem.stung.includes(c.id)) }, p: 0, t: 0, kw: [], flags: { noAbil: true } });
  return d;
};

/* ============================ Black ============================ */
const blackSymbols = (def) => (def.cost.B || 0) + (def.cost.hy || []).filter((h) => h.includes('B')).length;
const creGy = (P) => P.gy.filter((c) => c.def.types.includes('Creature')).length;
const villainEnters = (o) => T('enter', Object.assign({ you: true, cond: (G, src, ev) => ev.c !== src && isCreature(ev.c) && hasSub(ev.c, 'Villain') }, o));
S['Arnim Zola, Bio-Fanatic'] = (d) => {
  d.acts.push({ cost: { m: C('{3}'), tap: true }, label: 'Create a tapped 2/1 Villain with menace', when: ['main2', 'end'], cond: (G, P) => creGy(P) >= 2,
    run: (G, X) => mk(G, X.P, VILLAIN, 1, { tapped: true }), ai: () => ({ score: 2 }) });
  return d;
};
S['Baron Helmut Zemo'] = (d) => {
  d.trig.push(T('cast', { you: true, cond: (G, src, ev) => ev.zone === 'hand' && ev.card.def.colors.includes('B'), run: (G, X) => connive(G, X.P, X.src) }));
  // Boast: exile black cards from your graveyard with 15+ black mana symbols; copy them and cast up to three copies for free
  d.acts.push({ cost: {}, once: true, label: 'Boast: exile black cards with 15 black mana symbols; cast up to three copies free',
    cond: (G, P, c) => attackedThisTurn(G, P).includes(c) && P.gy.filter((x) => x.def.colors.includes('B')).reduce((s, x) => s + blackSymbols(x.def), 0) >= 15,
    run: (G, X) => {
      const P = X.P;
      const blacks = P.gy.filter((x) => x.def.colors.includes('B'));
      let pick;
      if (isHuman(G, P)) pick = pickSome(G, P, blacks, 1, blacks.length, 'Exile black cards with 15 or more black mana symbols', () => 1, 'graveyard');
      else { pick = []; let n = 0; for (const c of blacks.slice().sort((a, b) => b.def.value - a.def.value)) { if (n >= 15) break; pick.push(c); n += blackSymbols(c.def); } }
      if (pick.reduce((s, c) => s + blackSymbols(c.def), 0) < 15) { say(G, P, 'Not enough black mana symbols: nothing happens.'); return; }
      for (const c of pick) { P.gy.splice(P.gy.indexOf(c), 1); P.exile.push(c); }
      emit(G, 'exile', `${P.name} exiles ${nameList(pick)} for ${X.src.def.name}'s boast.`, { who: P.i, cards: pick.map((c) => c.id) });
      const casts = pickSome(G, P, pick.filter((c) => !c.def.types.includes('Land')), 0, 3, 'Cast up to three copies without paying their mana costs', (c) => c.def.value + c.def.mv * 0.3, 'exile');
      for (const c of casts) if (!G.over) L.castCopyOfCard(G, P, c.def);
    }, ai: (G, P, c) => ({ score: 6 }) });
  return d;
};
S['Baron Strucker, HYDRA Overlord'] = (d) => {
  d.spellDiscount = (G, P, card) => (card.def.sub.includes('Villain') ? 1 : 0);
  d.trig.push(villainEnters({ cond: (G, src, ev) => ev.c !== src && isCreature(ev.c) && hasSub(ev.c, 'Villain') && src.mem.struck !== G.turn, may: true, mayAi: () => true, mayLabel: 'Have it connive?',
    run: (G, X) => { X.src.mem.struck = G.turn; connive(G, X.P, X.ev.c); } }));
  return d;
};
S['Black Widow, Super Spy'] = (d) => {
  d.trig.push(T('hitPlayer', { self: true, run: (G, X) => {
    const P = X.P, Q = X.ev.Q || X.O;
    const out = [];
    let hit = null;
    while (Q.library.length) { const c = Q.library.pop(); Q.exile.push(c); out.push(c); if (!c.def.types.includes('Land')) { hit = c; break; } }
    dirty(G);
    if (!out.length) return;
    emit(G, 'exile', `${Q.name} exiles ${nameList(out)} from the top of their library.`, { who: P.i, cards: out.map((c) => c.id) });
    const counter = isHuman(G, P) ? yesNo(G, P, X.src, `Put a +1/+1 counter on ${X.src.def.name}? If you don't, you may cast ${hit ? hit.def.name : 'the exiled card'} this turn.`, !hit)
      : !hit || hit.def.value + hit.def.mv * 0.3 < 2.2;
    if (counter) { addCounters(G, X.src, 1); return; }
    if (hit) { P.xcast.push({ card: hit, until: G.turn, anyType: true }); say(G, P, `${P.name} may cast ${hit.def.name} this turn, spending mana as though it were any type.`, [hit.id]); }
  } }));
  return d;
};
S['Construct a Cosmic Cube'] = (d) => {
  planOn(d, 7, [fn((G, X, t) => { const Q = t && t.p != null ? G.players[t.p] : X.O; Q.slaved = (Q.slaved || 0) + 1; say(G, X.P, `${X.P.name} will control ${Q.name} during their next turn.`); },
    { tgt: { what: 'player', f: OPP }, val: (G, P, x) => (x.p === P.i ? -5 : 8), label: 'Choose an opponent to control during their next turn' })]);
  d.trig.push(draw2({ run: (G, X) => { mk(G, X.P, VILLAIN, 1); plan(G, X); } }));
  return d;
};
S['Crossbones, Malicious Mercenary'] = (d) => {
  d.trig.push(villainEnters({ once: true, run: (G, X) => { addCounters(G, X.src, 1); hitOpp(G, X, 2); } }));
  return d;
};
S['Cruel Alliance'] = (d) => twSpell(d, 2,
  { label: 'Exile a creature with mana value 3 or less', eff: [{ k: 'exileP', tgt: { f: {}, fn: (G, P, c) => c.def.mv <= 3 } }] },
  { label: 'Exile any creature and gain 3 life (teamwork)', eff: [{ k: 'exileP', tgt: { f: {} } }, { k: 'gain', n: 3 }] });
S['Decoy Ploy'] = (d) => {
  d.modes = [
    { label: 'Return a Villain card from your graveyard to your hand', eff: [{ k: 'regrow', to: 'hand', tgt: { what: 'gy', mine: true, f: { types: ['Villain'] } } }] },
    { label: 'Return a Hero card from your graveyard to your hand', eff: [{ k: 'regrow', to: 'hand', tgt: { what: 'gy', mine: true, f: { types: ['Hero'] } } }] },
  ];
  d.modeN = 2;
  d.spell = null;
  return d;
};
S['Doctor Doom'] = (d) => {
  d.etb = [mkE(DOOMBOT, 2)];
  d.statics.push({ who: 'self', cond: (G, src, P) => P.bf.some((c) => (isArtifact(c) && isCreature(c)) || hasSub(c, 'Plan')), p: 0, t: 0, kw: ['indestructible'] });
  d.trig.push(T('endStep', { you: true, run: (G, X) => { drawN(G, X.P, 1); loseLife(G, X.P, 1); } }));
  return d;
};
S['Doom Reigns Supreme'] = (d) => {
  planOn(d, 5, [fn((G, X, t) => {
    const Q = t && t.p != null ? G.players[t.p] : X.O, P = X.P;
    const top = Q.library.splice(Math.max(0, Q.library.length - 5)).reverse();
    Q.exile.push(...top);
    dirty(G);
    if (!top.length) return;
    emit(G, 'exile', `${Q.name} exiles ${nameList(top)} from the top of their library.`, { who: P.i, cards: top.map((c) => c.id) });
    const spells = top.filter((c) => !c.def.types.includes('Land'));
    const pick = pickSome(G, P, spells, 0, 2, 'Cast up to two of them without paying their mana costs', (c) => c.def.value + c.def.mv * 0.4, 'exile');
    for (const c of pick) if (!G.over && Q.exile.includes(c)) L.castNow(G, P, c, { free: true, ask: false });
  }, { tgt: { what: 'player', f: OPP }, val: (G, P, x) => (x.p === P.i ? -2 : 6), label: 'Choose an opponent to exile the top five cards of their library' })]);
  d.trig.push(villainEnters({ run: (G, X) => { drain(G, X, 1); plan(G, X); } }));
  return d;
};
S['Elektra, Daughter of the Hand'] = (d) => {
  d.sneak = C('{1}{B}{B}');
  d.etbAskLate = true;
  d.etb = [{ k: 'destroyP', tgt: { f: { side: 'opp', powLE: 3 } } }];
  d.sneakAi = (G, P) => (other(G, P).bf.some((c) => isCreature(c) && pow(c) <= 3) ? 2.5 : 0.5);
  return d;
};
S['Grim Reaper, Lethal Legionnaire'] = (d) => {
  d.trig.push(T('attack', { self: true, run: (G, X) => {
    const P = X.P, cost = C('{3}{B}');
    const cands = P.gy.filter((c) => c.def.types.includes('Creature'));
    if (!cands.length || !canPay(P, cost)) return;
    const want = isHuman(G, P) ? yesNo(G, P, X.src, `Pay {3}{B} to return a creature card from your graveyard tapped and attacking?`, true) : cands.some((c) => c.def.value >= 2);
    if (!want || !pay(P, cost)) return;
    G.pending.unshift({ src: X.src, P, t: { label: 'Return a creature card tapped and attacking', eff: [fn((GG, XX, t) => {
      const c = t && t.c; if (!c || !P.gy.includes(c)) return;
      P.gy.splice(P.gy.indexOf(c), 1);
      emit(GG, 'raise', `${c.def.name} returns to the battlefield tapped and attacking.`, { who: P.i, cards: [c.id] });
      enterBattlefield(GG, P, c, null, { tapped: true, ctr: { finality: 1 } });
      if (onBf(GG, c) && GG.combat && isCreature(c)) { c.attacking = true; GG.combat.attackers.push(c); }
    }, { tgt: { what: 'gy', mine: true, f: { types: ['Creature'] } }, val: (GG, PP, c) => 0.5 + c.def.value, label: 'Return a creature card tapped and attacking' })] }, ev: {} });
  } }));
  return d;
};
S['HYDRA Infiltration'] = (d) => {
  d.etb = fx('Target opponent discards two cards.');
  d.trig.push(alone({ run: (G, X) => drain(G, X, 1) }));
  return d;
};
S['HYDRA Troopers'] = (d) => {
  d.etb = [fn((G, X) => { if (creGy(X.P) >= 2) mk(G, X.P, VILLAIN, 1, { tapped: true }); else mill(G, X.P, 2); }, { score: (G, P) => (creGy(P) >= 2 ? 2 : 0.3) })];
  return d;
};
S["Kingpin's Enforcers"] = (d) => {
  d.acts.push({ cost: { m: C('{2}{B}'), sac: { f: { types: ['Artifact', 'Creature'] }, label: 'an artifact or creature' } }, label: 'Draw a card', eff: [{ k: 'draw', n: 1 }], when: ['main2', 'end', 'blocks'] });
  return d;
};
S['Klaw, Sonic Subjugator'] = (d) => {
  d.etb = [fn((G, X, t) => {
    const Q = t && t.p != null ? G.players[t.p] : X.O, P = X.P;
    const n = Math.min(Q.hand.length, 1 + creGy(P));
    if (!n) return;
    // The revealing player chooses which cards to show; then Klaw's controller picks one to discard
    const shown = n >= Q.hand.length ? Q.hand.slice() : isHuman(G, Q) ? pickCards(G, { type: 'choose', reason: 'choose', n, min: n, max: n, zone: 'hand', cards: Q.hand.map((c) => c.id), label: `Reveal ${n} card${n > 1 ? 's' : ''} from your hand` }, Q.hand, n)
      : Q.hand.slice().sort((a, b) => handValue(G, Q, a) - handValue(G, Q, b)).slice(0, n);
    emit(G, 'reveal', `${Q.name} reveals ${nameList(shown)}.`, { who: Q.i, cards: shown.map((c) => c.id) });
    const c = isHuman(G, P) ? pickCards(G, { type: 'choose', reason: 'hand-discard', n: 1, min: 1, max: 1, zone: 'hand', cards: shown.map((x) => x.id), label: 'Choose a card for them to discard' }, shown, 1)[0] : shown.slice().sort((a, b) => b.def.value - a.def.value)[0];
    if (!c || !Q.hand.includes(c)) return;
    Q.hand.splice(Q.hand.indexOf(c), 1); Q.gy.push(c); dirty(G);
    emit(G, 'discard', `${Q.name} discards ${c.def.name}.`, { who: Q.i, cards: [c.id] });
    if (G.pending) fire(G, 'discard', { P: Q, card: c });
  }, { tgt: { what: 'player', f: {} }, val: (G, P, x) => (x.p === P.i ? -2 : 1.5), label: 'Choose a player to reveal cards' })];
  return d;
};
S['Madame Masque'] = (d) => {
  d.etb = [{ k: 'connive' }];
  d.trig.push(draw2({ eff: [mkE(VILLAIN, 1)] }));
  return d;
};
S['The Masters of Evil'] = (d) => {
  d.statics.push({ who: 'all', f: { side: 'you', sub: 'Villain', other: true }, p: 2, t: 1, kw: [] });
  d.cycling = C('{1}{B}');
  d.cycleSearch = (def) => def.sub.includes('Plan');
  d.cycleWhat = 'a Plan card';
  d.cycleLabel = 'Discard to search for a Plan';
  return d;
};
S['M.O.D.O.K.'] = (d) => {
  d.acts.push({ cost: { life: 3 }, label: 'Pay 3 life: connive', cond: (G, P) => G.active === P.i, when: ['main1', 'main2'],
    run: (G, X) => { X.src.mem.modok = (X.src.mem.modokT === G.turn ? X.src.mem.modok : 0) + 1; X.src.mem.modokT = G.turn; connive(G, X.P, X.src); },
    ai: (G, P, c) => (P.life >= 13 && (c.mem.modokT !== G.turn || c.mem.modok < 2) && P.library.length > 5 ? { score: 1.5 } : null) });
  d.statics.push({ who: 'all', f: { side: 'opp' }, p: -1, t: -1, kw: [] });
  return d;
};
S['Moonstone, Harsh Mistress'] = (d) => {
  d.trig.push(T('discard', { you: true, cond: (G, src, ev) => ev.P.gy.includes(ev.card), may: true, mayAi: (G, X) => X.ev.card.def.value >= 1.5 || X.ev.card.def.types.includes('Land'),
    mayLabel: 'Exile that card? You may play it until the end of your next turn.',
    run: (G, X) => {
      const P = X.P, c = X.ev.card;
      if (!P.gy.includes(c)) return;
      P.gy.splice(P.gy.indexOf(c), 1); P.exile.push(c); dirty(G);
      P.xcast.push({ card: c, until: G.active === P.i ? G.turn + 2 : G.turn + 1 });
      emit(G, 'exile', `${P.name} exiles ${c.def.name}; they may play it until the end of their next turn.`, { who: P.i, cards: [c.id] });
    } }));
  return d;
};
S['Ninja of the Hand'] = (d) => setPU(d, '{4}{B}', { run: (G, X) => { discardE(G, X.O, 1, 'discard'); addCounters(G, X.src, 1); }, ai: puAi(2.2) });
S['Project Deathlok Soldier'] = (d) => {
  d.gyActs = [{ cost: { m: C('{2}{B}') }, label: 'Return this card to your hand', when: ['main2', 'end'],
    run: (G, X) => { const P = X.P, c = X.src; if (!P.gy.includes(c)) return; P.gy.splice(P.gy.indexOf(c), 1); P.hand.push(c); dirty(G); emit(G, 'raise', `${P.name} returns ${c.def.name} to hand.`, { who: P.i, cards: [c.id] }); },
    ai: () => ({ score: 1.1 }) }];
  return d;
};
S['Robot Domination'] = (d) => {
  planOn(d, 3, [mkE(ROBOT_VILLAIN, 3)]);
  const dedupe = (G, src) => !(G.pending || []).some((p) => p.src === src && p.t && p.t.robo);
  const go = (G, X) => { drawN(G, X.P, 1); loseLife(G, X.P, 1); plan(G, X); };
  d.trig.push(T('toGy', { robo: true, cond: (G, src, ev, Q) => !!ev.c && ev.c.owner === Q.i && !ev.c.token && ev.c.def.types.includes('Creature') && dedupe(G, src), run: go }));
  d.trig.push(T('discard', { you: true, robo: true, cond: (G, src, ev) => ev.card.def.types.includes('Creature') && dedupe(G, src), run: go }));
  d.trig.push(T('milled', { you: true, robo: true, cond: (G, src, ev) => ev.cards.some((c) => c.def.types.includes('Creature')) && dedupe(G, src), run: go }));
  return d;
};
S['Ronin, Shadow Stalker'] = (d) => {
  d.manaAbs = [{ colors: ['W', 'U', 'B', 'R', 'G'], amount: 2, life: 2, tap: false, once: true, only: (p) => (!!p.def && p.def.sub.includes('Equipment')) || !!p.equip }];
  d.acts.push({ cost: { tap: true, sac: { f: { types: ['any'], sub: 'Equipment', fn: (G, x, P, src) => x.att === src.id }, label: 'an Equipment attached to Ronin' } }, sorcery: true, label: 'Target creature gets -4/-4',
    eff: [{ k: 'pumpT', p: -4, t: -4, tgt: { f: {} } }] });
  return d;
};
S['Roxxon Brutes'] = (d) => { d.trig.push(draw2({ eff: [{ k: 'ctrs', n: 1, tgt: { f: {} } }] })); return d; };
S['Stolen Stark Tech'] = (d) => { d.etb = [attachE((G, X, c) => grantKw(G, c, ['indestructible']))]; return d; };
S['Super-Skrull'] = (d) => {
  d.acts.push({ cost: { m: C('{2}{W}') }, label: 'Create a 0/4 Wall token', eff: [mkE(WALL, 1)], when: ['main2', 'end'] });
  d.acts.push({ cost: { m: C('{3}{G}') }, label: '+4/+4 until end of turn', when: ['blocks'], run: (G, X) => pump(G, X.src, 4, 4),
    ai: (G, P, c) => (c.attacking || c.blocking ? { score: 3 } : null) });
  d.acts.push({ cost: { m: C('{4}{R}') }, label: '4 damage to a creature', eff: [{ k: 'dmgX', nFn: () => 4, tgt: { f: {} } }], when: ['main1', 'main2', 'end', 'blocks'] });
  d.acts.push({ cost: { m: C('{5}{U}') }, label: 'A player draws four cards', when: ['end', 'main2'],
    eff: [fn((G, X, t) => drawN(G, t && t.p != null ? G.players[t.p] : X.P, 4), { tgt: { what: 'player', f: {} }, val: (G, P, x) => (x.p === P.i ? 4 : -4), label: 'Choose a player to draw four cards' })] });
  return d;
};
S['Swordsman, Sharp Scoundrel'] = (d) => {
  d.trig.push(villainEnters({ eff: [fn((G, X, t) => {
    const c = t && t.c; if (!c || !onBf(G, c)) return;
    const eqs = X.P.bf.filter((e) => isEquip(e) && e.att !== c.id);
    const e = pickSome(G, X.P, eqs, 0, 1, `Attach up to one Equipment to ${c.def.name}`, () => 1)[0];
    if (e) attach(G, e, c);
  }, { tgt: { f: { side: 'you' } }, val: (G, P, c) => cv(c) * 0.2 + 0.3, label: 'Attach up to one Equipment you control to a creature you control' })] }));
  d.trig.push(T('attack', { you: true, cond: (G, src, ev) => equipmentOn(G, ev.c).length > 0, run: (G, X) => connive(G, X.P, X.ev.c) }));
  return d;
};
S['Thunderbolts Conspiracy'] = (d) => {
  d.trig.push(T('die', { you: true, cond: (G, src, ev) => !ev.token && (ev.sub || ev.c.def.sub || []).includes('Villain'), run: (G, X) => {
    const c = X.ev.c, O = G.players[c.owner];
    if (!O.gy.includes(c)) return;
    O.gy.splice(O.gy.indexOf(c), 1);
    emit(G, 'raise', `${c.def.name} returns to the battlefield with a finality counter, now a Hero too.`, { who: X.P.i, cards: [c.id] });
    enterBattlefield(G, O, c, null, { ctr: { finality: 1 } });
    if (onBf(G, c)) { c.addSubs = ['Hero']; dirty(G); }
  } }));
  d.role = 'value';
  return d;
};
S['Too Evil to Stay Dead'] = (d) => twSpell(d, 4,
  { label: 'Return a creature card with mana value 4 or less to the battlefield', eff: [{ k: 'regrow', to: 'bf', tgt: { what: 'gy', mine: true, f: { types: ['Creature'] }, fn: (G, P, c) => c.def.mv <= 4 } }] },
  { label: 'Return any creature card to the battlefield (teamwork)', eff: [{ k: 'regrow', to: 'bf', tgt: { what: 'gy', mine: true, f: { types: ['Creature'] } } }] });
S['Unliving Legionnaire'] = (d) => setPU(d, '{5}{B}{B}', { ai: puAi((G, P) => 2.4 + (creGy(P) ? 1 : 0)),
  eff: [{ k: 'regrow', to: 'hand', tgt: { what: 'gy', mine: true, f: { types: ['Creature'] }, min: 0 } }, fn((G, X) => addCounters(G, X.src, 2), { score: () => 1.8 })] });
S['Visions of Villainy'] = (d) => {
  d.costMod = (G, P) => (villains(P).length ? 1 : 0);
  d.spell = [{ k: 'draw', n: 2 }, fn((G, X) => loseLife(G, X.P, 2), { score: (G, P) => -2 * lifeW(P) })];
  return d;
};
S['Whiplash, Vengeful Engineer'] = (d) => {
  d.etbTapped = true;
  d.trig.push(T('attack', { self: true, cond: (G, src) => equipmentOn(G, src).length > 0, run: (G, X) => drain(G, X, equipmentOn(G, X.src).length) }));
  return d;
};
S["Widow's Bite"] = (d) => twBoth(d, 3,
  { label: 'A creature gains deathtouch', eff: [{ k: 'grant', kw: ['deathtouch'], tgt: { f: {} } }] },
  { label: 'A creature gets -2/-2', eff: [{ k: 'pumpT', p: -2, t: -2, tgt: { f: {} } }] });
S['Yellowjacket, Heartless Marauder'] = (d) => { d.trig.push(villainEnters({ run: (G, X) => pump(G, X.src, 1, 0, ['lifelink']) })); return d; };

/* ============================ Red ============================ */
// Exile the top card of your library; you may play it until the end of your next turn
const untilMyNextEnd = (G, P) => G.turn + (G.active === P.i ? 2 : 1);
function impulse(G, P, until, label) {
  const c = P.library.pop();
  if (!c) return null;
  P.exile.push(c);
  P.xcast.push({ card: c, until });
  emit(G, 'exile', `${P.name} exiles ${c.def.name} from the top of their library${label ? ` (${label})` : ''} and may play it.`, { who: P.i, cards: [c.id] });
  dirty(G);
  return c;
}
const impulseE = () => fn((G, X) => impulse(G, X.P, untilMyNextEnd(G, X.P)), { score: () => 0.9 });
// "You may sacrifice an artifact or discard a card. If you do, draw (n) cards."
function sacOrDiscardDraw(G, P, src, n) {
  const arts = P.bf.filter(isArtifact);
  const opts = [];
  if (arts.length) opts.push('Sacrifice an artifact');
  if (P.hand.length) opts.push('Discard a card');
  if (!opts.length) return;
  let k;
  if (isHuman(G, P)) { const all = opts.concat('Neither'); k = all[chooseMode(G, P, src, `${src.def.name}: sacrifice an artifact or discard a card to draw ${n === 1 ? 'a card' : `${n} cards`}?`, all, 0)]; }
  else {
    const cheapArt = arts.filter((c) => c.token || pv(G, c) < 1.2).sort((a, b) => pv(G, a) - pv(G, b))[0];
    const worst = P.hand.slice().sort((a, b) => handValue(G, P, a) - handValue(G, P, b))[0];
    k = cheapArt ? 'Sacrifice an artifact' : worst && handValue(G, P, worst) < 1.2 * n ? 'Discard a card' : 'Neither';
  }
  if (k === 'Sacrifice an artifact') {
    const c = pickOne(G, P, arts, 'Sacrifice an artifact', (x) => -pv(G, x));
    if (!c) return;
    emit(G, 'sac', `${P.name} sacrifices ${c.def.name}.`, { who: P.i, cards: [c.id] });
    sacrifice(G, P, c, true);
  } else if (k === 'Discard a card') discardE(G, P, 1);
  else return;
  drawN(G, P, n);
}
S['Avengers Disassembled'] = (d) => {
  d.modes = [
    { label: '3 damage to each creature', eff: [{ k: 'dmgAll', n: 3, side: 'all' }] },
    { label: 'Destroy a land (its controller may search for a basic land)', eff: [fn((G, X, t) => {
      const c = t && t.c; if (!c || !onBf(G, c)) return;
      const Q = ctrlOf(G, c);
      destroyPermanent(G, X.P, c);
      if (!Q.library.some((x) => x.def.supertypes.includes('Basic') && isLand(x))) return;
      if (isHuman(G, Q) && !yesNo(G, Q, c, 'Search your library for a basic land and put it onto the battlefield tapped?', true)) return;
      const got = searchLibrary(G, Q, (x) => isLand(x) && x.def.supertypes.includes('Basic'), 1, 'bfTapped', 'a basic land');
      if (got.length) emit(G, 'search', `${Q.name} puts ${got[0].def.name} onto the battlefield tapped.`, { who: Q.i, cards: got.map((x) => x.id) });
    }, { tgt: { f: { types: ['Land'] } }, val: (G, P, c) => (c.ctrl === P.i ? -2 : c.def.supertypes.includes('Basic') ? 0.1 : 0.9), label: 'Destroy a land' })] },
  ];
  d.modeN = 2;
  d.spell = null;
  return d;
};
S['Blazing Crescendo'] = (d) => { d.spell = [{ k: 'pumpT', p: 3, t: 1, tgt: { f: {} } }, impulseE()]; return d; };
S['Crimson Operative'] = (d) => { d.etb = [impulseE()]; return d; };
S['Death to Our Enemies'] = (d) => {
  planOn(d, 4, [{ k: 'divided', n: 7, max: 2 }]);
  d.trig.push(castNC({ run: (G, X) => { mk(G, X.P, TREASURE, 1, { tapped: true }); plan(G, X); } }));
  return d;
};
S["Evil's Thrall"] = (d) => {
  d.spell = [fn((G, X, t) => {
    const c = t && t.c; if (!c || !onBf(G, c)) return;
    const long = villains(X.P).some((v) => v.def.mv > c.def.mv);
    gainControl(G, X.P, c, long ? 'until' : 'eot', X.src);
    if (long && c.ctrlFx) c.ctrlFx.until = untilMyNextEnd(G, X.P);
    untap(G, c, X.P);
    grantKw(G, c, ['haste']);
  }, { tgt: { f: { side: 'opp' } }, val: (G, P, c) => cv(c) * 0.8 + (villains(P).some((v) => v.def.mv > c.def.mv) ? cv(c) * 0.4 : 0), label: 'Gain control of a creature' })];
  d.castIf = (G, P) => G.active === P.i;
  return d;
};
S['Fin Fang Foom'] = (d) => {
  d.trig.push(T('cast', { you: true, cond: (G, src, ev) => isIS(ev.card.def) && !!ev.item && allTargets(ev.item.targets).some((t) => t.c && (isArtifact(t.c) || isLand(t.c))),
    run: (G, X) => { L.copySpell(G, X.P, X.ev.item); addCounters(G, X.src, 2); } }));
  return d;
};
S['Hawkeye, Master Marksman'] = (d) => {
  const arrows = [
    { label: "Net: a creature can't block this turn", eff: [{ k: 'grant', flags: { cantBlock: true }, say: "can't block this turn", bad: true, tgt: { f: {} } }],
      ai: (G, P) => (G.active === P.i && G.combat && !G.combat.blocksDone && other(G, P).bf.some((c) => isCreature(c) && !c.tapped) ? 1.4 : 0) },
    { label: 'Explosive: 2 damage to a player', eff: [{ k: 'dmgX', nFn: () => 2, tgt: { what: 'player', f: {} } }], ai: () => 1.1 },
    { label: 'Boomerang: discard a card, then draw a card', eff: [fn((G, X) => { discardE(G, X.P, 1); drawN(G, X.P, 1); }, { score: () => 0.4 })],
      ai: (G, P) => (P.hand.some((c) => handValue(G, P, c) < 0.8) ? 0.8 : 0) },
  ];
  d.trig.push(T('tapped', { cond: (G, src, ev) => ev.cs.includes(src), run: (G, X) => {
    const P = X.P, one = C('{1}');
    const chosen = [];
    for (const a of arrows) {
      if (!canPay(P, Object.assign(L.genericCost(chosen.length + 1)))) break;
      const want = isHuman(G, P) ? yesNo(G, P, X.src, `Trick Arrows: pay {1} for ${a.label}?`, false) : a.ai(G, P) >= 0.7;
      if (want) chosen.push(a);
    }
    if (!chosen.length || !pay(P, L.genericCost(chosen.length))) return;
    emit(G, 'info', `${P.name} pays ${chosen.length} for Trick Arrows: ${chosen.map((a) => a.label.split(':')[0]).join(', ')}.`, { who: P.i, card: X.src.id });
    G.pending.unshift({ src: X.src, P, t: { label: 'Trick Arrows', eff: chosen.flatMap((a) => a.eff) }, ev: {} });
  } }));
  return d;
};
S['Hawkeye, Young Avenger'] = (d) => { d.noncombatPlus = true; return d; };
S["Hawkeye's Bow"] = (d) => {
  d.trig.push(T('tapped', { cond: (G, src, ev) => src.att != null && ev.cs.some((c) => c.id === src.att), run: (G, X) => { const h = byId(G, X.src.att); if (h) hitOpp(G, X, 1, h); } }));
  return d;
};
S['Hex Magic'] = (d) => {
  d.spell = [fn((G, X) => {
    const P = X.P, cs = P.hand.slice();
    if (!cs.length) return;
    P.hand.length = 0;
    P.exile.push(...cs);
    const until = untilMyNextEnd(G, P);
    for (const c of cs) P.xcast.push({ card: c, until });
    dirty(G);
    emit(G, 'exile', `${P.name} exiles ${cs.length === 1 ? 'a card' : `${cs.length} cards`} from their hand and may play them until the end of their next turn.`, { who: P.i, cards: cs.map((c) => c.id) });
    drawN(G, P, cs.length);
  }, { score: (G, P) => Math.max(0, P.hand.length - 1) * 0.9 })];
  return d;
};
S['Hire a Crew'] = (d) => { d.spell = [mkE(VILLAIN, 1), { k: 'pumpAll', side: 'you', p: 1, t: 0, kw: [] }]; return d; };
S['HULK SMASH!'] = (d) => twBoth(d, 4,
  { label: 'Destroy a noncreature artifact', eff: [{ k: 'destroyP', tgt: { f: { types: ['Artifact'], fn: (G, c) => !isCreature(c) } } }] },
  { label: 'A creature you control deals damage equal to its power to a creature an opponent controls', eff: fx('Target creature you control deals damage equal to its power to target creature an opponent controls.') });
S['Human Torch, Johnny Storm'] = (d) => {
  d.trig.push(T('draw', { you: true, cond: (G, src, ev, Q) => heroes(Q, src).length > 0, run: (G, X) => hitOpp(G, X, 1) }));
  return d;
};
S['HYDRA Assault Robot'] = (d) => {
  d.trig.push(T('enter', { you: true, cond: (G, src, ev) => ev.c !== src && (isArtifact(ev.c) || hasSub(ev.c, 'Villain')), run: (G, X) => hitOpp(G, X, 1) }));
  return d;
};
S['Iron Fist, Living Weapon'] = (d) => {
  d.trig.push(castAtMine({ run: (G, X) => { X.src.mem.fist = G.turn; say(G, X.P, `${X.src.def.name} gains "{T}: deal damage equal to his power to any other target" until end of turn.`, [X.src.id]); } }));
  d.acts.push({ cost: { tap: true }, label: 'Deal damage equal to his power to any other target', cond: (G, P, c) => c.mem.fist === G.turn, when: ['main1', 'main2', 'end', 'blocks'],
    eff: [{ k: 'dmgX', nFn: (G, X) => Math.max(0, pow(X.src)), tgt: { what: 'any', f: {}, other: true } }] });
  return d;
};
S['Jessica Jones, Private Eye'] = (d) => {
  d.acts.push({ cost: { tap: true }, label: 'Stun her: exile the top X cards; play them this turn', when: ['main1'],
    run: (G, X) => {
      const P = X.P, n = Math.max(0, pow(X.src));
      addCounters(G, X.src, 1, 'stun');
      const top = P.library.splice(Math.max(0, P.library.length - n)).reverse();
      P.exile.push(...top);
      for (const c of top) P.xcast.push({ card: c, until: G.turn });
      dirty(G);
      if (top.length) emit(G, 'exile', `${P.name} exiles ${nameList(top)} and may play them this turn.`, { who: P.i, cards: top.map((c) => c.id) });
    }, ai: (G, P, c) => (pow(c) >= 2 && P.bf.filter((x) => isLand(x) && !x.tapped).length >= 2 ? { score: 1.2 + pow(c) * 0.3 } : null) });
  return d;
};
S["K'un-Lun Warrior"] = (d) => { d.etb = [fn((G, X) => sacOrDiscardDraw(G, X.P, X.src, 1), { score: () => 0.5 })]; return d; };
S['Loki Laufeyson'] = (d) => {
  setPU(d, '{4}{R}', { run: (G, X) => addCounters(G, X.src, 2), ai: puAi(2) });
  d.acts.push({ cost: { m: C('{1}'), tap: true }, label: 'Copy your next instant or sorcery this turn (mana value up to his power)', noAi: true,
    run: (G, X) => { X.P.copyNext = { turn: G.turn, n: 1, maxMv: Math.max(0, pow(X.src)) }; say(G, X.P, `${X.P.name}'s next instant or sorcery with mana value ${Math.max(0, pow(X.src))} or less this turn will be copied.`); } });
  return d;
};
S['Machinesmith Automaton'] = (d) => { d.trig.push(T('enter', { you: true, cond: (G, src, ev) => ev.c !== src && isArtifact(ev.c), run: (G, X) => addCounters(G, X.src, 1) })); return d; };
S['Misty Knight, Hero for Hire'] = (d) => {
  d.acts.push({ cost: { m: C('{2}'), tap: true, discard: 1 }, label: "Draw a card for each card you've discarded this turn", when: ['main2', 'end'],
    run: (G, X) => drawN(G, X.P, L.discardsThisTurn(G, X.P)),
    ai: (G, P) => (P.hand.length && P.hand.some((c) => handValue(G, P, c) < 1) ? { score: 0.8 + L.discardsThisTurn(G, P) * 0.9 } : null) });
  return d;
};
S['Mjölnir, Hammer of Thor'] = (d) => {
  d.dmgDouble = true;
  d.acts = d.acts.filter((a) => !a.equip);
  d.acts.push({ equip: true, only: { legendary: true, fn: (G, x) => !hasSub(x, 'Villain') && (x.def.colors.includes('R') || x.def.colors.includes('W')) }, cost: { m: C('{1}') }, sorcery: true, label: 'Equip worthy {1}' });
  d.etb = [{ k: 'dmgX', nFn: () => 4, tgt: { f: {}, min: 0 } }];
  d.cycling = C('{2}{R}');
  d.cycleLabel = 'Discard: 2 damage to each creature';
  d.cycleRun = (G, P, c) => { for (const x of allCreatures(G)) damageCreature(G, x, 2, c); emit(G, 'hit', `${c.def.name} deals 2 damage to each creature.`, { who: P.i }); };
  d.cycleAi = (G, P) => { const O = other(G, P); const kill = (Q) => Q.bf.filter((x) => isCreature(x) && L.lethalTo(x) <= 2).reduce((s, x) => s + cv(x), 0); return kill(O) - kill(P) >= 4; };
  d.equipAi = (G, P, t) => Math.max(0, pow(t)) * 0.9;
  return d;
};
S['Photon Blast Barrage'] = (d) => {
  d.spell = [{ k: 'dmgX', nFn: () => 1, tgt: { f: {} } }];
  d.aiX = (G, P, card, x) => Math.min(x, Math.max(1, other(G, P).bf.filter(isCreature).reduce((s, c) => s + Math.max(1, L.lethalTo(c) === Infinity ? 0 : L.lethalTo(c)), 0)));
  d.onCast = (G, P, item) => { for (let k = 0; k < (item.x || 0) && !G.over; k++) L.copySpell(G, P, item); };
  d.castScore = (G, P) => other(G, P).bf.filter((c) => isCreature(c) && L.lethalTo(c) <= 2).length * 0.8;
  return d;
};
S['Quicksilver, Brash Blur'] = (d) => { d.leyline = true; return setPU(d, '{4}{R}', { run: (G, X) => { addCounters(G, X.src, 1); addCounters(G, X.src, 1, 'double strike'); }, ai: puAi(2.6) }); };
S['Red Hulk'] = (d) => {
  d.trig.push(T('dmgCreature', { cond: (G, src, ev) => ev.c === src, run: (G, X) => {
    addCounters(G, X.src, 1);
    G.pending.unshift({ src: X.src, P: X.P, t: { label: 'Enrage', eff: [{ k: 'dmgX', nFn: (GG, XX) => XX.src.cnt || 0, tgt: { what: 'any', f: {}, other: true } }] }, ev: {} });
  } }));
  return d;
};
S['Repulsor Blast'] = (d) => twSpell(d, 2,
  { label: '5 damage to a creature', eff: [{ k: 'dmgX', nFn: () => 5, tgt: { f: {} } }] },
  { label: "5 damage to a creature and 2 to its controller (teamwork)", eff: [{ k: 'dmgX', nFn: () => 5, tgt: { f: {} } },
    fn((G, X) => { const r = X.ts && X.ts[0] && X.ts[0].c; const Q = r ? G.players[r.ctrl] : X.O; if (Q !== X.P) hit(G, X, { p: Q.i }, 2); }, { score: () => 0.8 })] });
S['The Scarlet Witch'] = (d) => { d.spellDiscount = (G, P, card, src) => (isIS(card.def) && card.def.mv >= 4 ? Math.max(0, pow(src)) : 0); return d; };
S['Speed, Young Avenger'] = (d) => {
  d.trig.push(castNC({ run: (G, X) => {
    const P = X.P;
    const fast = P.bf.filter((c) => isCreature(c) && has(c, 'haste'));
    if (!fast.length || !canPay(P, L.genericCost(1))) return;
    const want = isHuman(G, P) ? yesNo(G, P, X.src, "Pay {1} so a creature with haste can't be blocked this turn except by creatures with haste?", true)
      : G.active === P.i && G.combatTurn !== G.turn && fast.some((c) => L.canAttackNow(G, c) || c.attacking);
    if (!want || !pay(P, L.genericCost(1))) return;
    G.pending.unshift({ src: X.src, P, t: { label: 'Speed', eff: [{ k: 'grant', flags: { hasteOnly: true }, say: "can't be blocked this turn except by creatures with haste", tgt: { f: { hasKw: 'haste' } } }] }, ev: {} });
  } }));
  return d;
};
S['Super Speed'] = (d) => {
  d.etb = [fn((G, X) => { const h = X.src.att != null && byId(G, X.src.att); if (h) grantKw(G, h, ['first strike']); }, { score: () => 0.4 })];
  return d;
};
S['Team Tactics'] = (d) => twSpell(d, 1,
  { label: 'A creature gains double strike', eff: [{ k: 'grant', kw: ['double strike'], tgt: { f: {} } }] },
  { label: 'Double strike and trample (teamwork)', eff: [{ k: 'grant', kw: ['double strike', 'trample'], tgt: { f: {} } }] });
S['Thor, God of Thunder'] = (d) => {
  d.etb = [fn((G, X, t) => {
    const c = t && t.c; const P = X.P;
    if (!c || !P.gy.includes(c)) return;
    P.gy.splice(P.gy.indexOf(c), 1); P.exile.push(c); P.xcast.push({ card: c, until: untilMyNextEnd(G, P) }); dirty(G);
    emit(G, 'exile', `${P.name} exiles ${c.def.name} and may play it until the end of their next turn.`, { who: P.i, cards: [c.id] });
  }, { tgt: { what: 'gy', mine: true, f: { types: ['Equipment', 'Instant', 'Sorcery'] } }, val: (G, P, c) => 0.6 + c.def.value * 0.4, label: 'Exile an Equipment, instant or sorcery card to play it later' })];
  d.trig.push(castNC({ eff: [{ k: 'dmgX', nFn: (G, X) => (X.ev.card ? X.ev.card.def.mv + ((X.ev.item && X.ev.item.x) || 0) * (X.ev.card.def.cost.x || 0) : 0), tgt: { what: 'any', f: {} } }] }));
  return d;
};
S['Truck Toss'] = (d) => { d.spell = [{ k: 'dmgX', nFn: () => 4, tgt: { what: 'any', f: {} } }]; d.costMod = (G, P) => (P.bf.some((c) => hasSub(c, 'Vehicle')) ? 2 : 0); return d; };
S['Vision of Love'] = (d) => { d.spell = [fn((G, X) => sacOrDiscardDraw(G, X.P, X.src, 2), { score: (G, P) => (P.hand.length || P.bf.some(isArtifact) ? 1.8 : 0) })]; return d; };
S['Wonder Man, Hollywood Hero'] = (d) => { d.puExtra = true; return d; };

/* ============================ Green ============================ */
S["Ant-Man's Army"] = (d) => {
  d.etb = [fn((G, X) => {
    const P = X.P;
    const food = isHuman(G, P) ? chooseMode(G, P, X.src, `${X.src.def.name}: create a Food or a Treasure?`, ['Food', 'Treasure'], 1) === 0 : P.life <= 8;
    mk(G, P, food ? FOOD : TREASURE, 1);
  }, { score: () => 0.9 })];
  return d;
};
S['Call Damage Control'] = (d) => {
  const back = (type) => ({ label: `Return a${type === 'Artifact' || type === 'Enchantment' ? 'n' : ''} ${type.toLowerCase()} card`, eff: [{ k: 'regrow', to: 'hand', tgt: { what: 'gy', mine: true, f: { types: [type] } } }] });
  d.modes = [back('Artifact'), back('Creature'), back('Enchantment'), back('Land')];
  d.modeN = 2;
  d.spell = null;
  return d;
};
S['Claim the Kingdom'] = (d) => {
  planOn(d, 4, [{ k: 'ctrs', n: 1, kind: 'indestructible', tgt: { f: { side: 'you' } } }]);
  d.trig.push(T('landfall', { you: true, eff: [{ k: 'ctrs', n: 1, tgt: { f: { side: 'you' } } }, fn((G, X) => plan(G, X), { score: () => 0.5 })] }));
  return d;
};
S['Doc Samson, Super Psychiatrist'] = (d) => {
  d.ctrPlus = true;
  d.mana = null;
  d.manaAbs = [{ colors: ['W', 'U', 'B', 'R', 'G'], amountFn: (G, c) => Math.max(0, pow(c)) }];
  return d;
};
S["Earth's Mightiest Heroes"] = (d) => {
  const run = (all) => (G, X) => {
    const P = X.P;
    const top = P.library.splice(Math.max(0, P.library.length - 8)).reverse();
    if (!top.length) return;
    emit(G, 'reveal', `${P.name} reveals ${nameList(top)}.`, { who: P.i, cards: top.map((c) => c.id) });
    const cres = top.filter((c) => c.def.types.includes('Creature'));
    const put = pickSome(G, P, cres, 0, all ? cres.length : 1, all ? 'Put any number of creature cards onto the battlefield' : 'Put a creature card onto the battlefield', (c) => c.def.value + c.def.mv * 0.3 + 1, 'library', 'look');
    P.gy.push(...top.filter((c) => !put.includes(c)));
    dirty(G);
    for (const c of put) { emit(G, 'enter', `${P.name} puts ${c.def.name} onto the battlefield.`, { who: P.i, card: c.id }); enterBattlefield(G, P, c, null, {}); }
  };
  return twSpell(d, 5, { label: 'Put a creature card from the top eight onto the battlefield', eff: [fn(run(false), { score: () => 4 })] },
    { label: 'Put any number of them onto the battlefield (teamwork)', eff: [fn(run(true), { score: () => 7.5 })] });
};
S['Epic Fight'] = (d) => {
  d.modes = [
    { label: "Double a creature's power and toughness", eff: [fn((G, X, t) => { const c = t && t.c; if (c && onBf(G, c)) pump(G, c, Math.max(0, pow(c)), Math.max(0, tou(c))); },
      { tgt: { f: {} }, val: (G, P, c, X, ctx) => (c.ctrl !== P.i ? -1 : (c.attacking || c.blocking ? 1.2 : ctx === 'main1' ? 0.7 : 0.3) * Math.max(0, pow(c)) * 0.5 + 0.2), label: "Double a creature's power and toughness" })] },
    { label: 'A creature you control fights a creature an opponent controls', eff: fx('Target creature you control fights target creature an opponent controls.') },
  ];
  d.modeN = 2;
  d.spell = null;
  return d;
};
S['Go Nuts!'] = (d) => twBoth(d, 3,
  { label: 'Put a +1/+1 counter on a creature', eff: [{ k: 'ctrs', n: 1, tgt: { f: {} } }] },
  { label: 'A creature you control fights a creature an opponent controls', eff: fx('Target creature you control fights target creature an opponent controls.') });
S['Guerrilla Gorilla'] = (d) => {
  d.acts.push({ cost: { sacSelf: true }, sorcery: true, label: 'Destroy a noncreature artifact or enchantment',
    eff: [{ k: 'destroyP', tgt: { f: { types: ['Artifact', 'Enchantment'], fn: (G, c) => !isCreature(c) } } }] });
  return d;
};
// Strip a permanent of its abilities (keeping some keywords): it stays that way until it leaves the battlefield
function stripAbilities(G, c, kws = []) {
  if (!onBf(G, c)) return;
  const base = c.def;
  const sdef = Object.assign({}, base, { id: `${base.id}-bare-${G.nextId++}`, kw: kws.slice(), trig: [], acts: [], statics: [], etb: [], dies: [], attack: [], hit: [], landfall: [], leaves: [], manaAbs: null, mana: null, front: null, back: null, mdfc: false, text: kws.map((k) => k[0].toUpperCase() + k.slice(1)).join(', ') });
  for (const k of ['leyline', 'powerUp', 'twBonus', 'silenceOpp', 'playerHex', 'noMaxHand', 'powFn', 'ctrPlus', 'hasteAbilities', 'puExtra', 'puDiscount', 'noncombatPlus', 'dmgDouble', 'improviseFor', 'conniveDraw', 'spellDiscount', 'flashFor', 'blockOnlyBy']) delete sdef[k];
  G.defs[sdef.id] = sdef;
  if (!c.faceBase) c.faceBase = base;
  c.def = sdef;
  dirty(G);
}
S['Hellcat, Undying Vigilante'] = (d) => {
  d.trig.push(T('die', { self: true, run: (G, X) => {
    const c = X.ev.c, O = G.players[c.owner];
    if (!O.gy.includes(c)) return;
    O.gy.splice(O.gy.indexOf(c), 1);
    emit(G, 'raise', `${c.def.name} returns to the battlefield with a +1/+1 counter, without her abilities but with haste.`, { who: O.i, cards: [c.id] });
    enterBattlefield(G, O, c, null, { ctr: { '+1/+1': 1 } });
    stripAbilities(G, c, ['haste']);
  } }));
  return d;
};
S['Hercules, Prince of Power'] = (d) => setPU(d, '{4}{G}', { run: (G, X) => { addCounters(G, X.src, 1); grantKw(G, X.src, ['vigilance', 'indestructible', 'haste']); },
  ai: puAi((G, P, c, when) => (when === 'main1' ? 3 : 2)) });
S['Heroic Feast'] = (d) => {
  d.etb = [mkE(FOOD, 1)];
  d.trig.push(T('gain', { you: true, run: (G, X) => {
    const cs = X.P.bf.filter(isCreature);
    const pick = pickSome(G, X.P, cs, 0, X.ev.n || 0, `Put a +1/+1 counter on up to ${X.ev.n} creatures you control`, (c) => cv(c) + 1);
    ctrEach(G, pick);
  } }));
  return d;
};
S['Hulkling, Burgeoning Bruiser'] = (d) => {
  d.trig.push(T('enter', { you: true, cond: (G, src, ev) => ev.c !== src && isCreature(ev.c) && (pow(ev.c) > pow(src) || tou(ev.c) > tou(src)), check: (G, src, ev) => onBf(G, ev.c) && (pow(ev.c) > pow(src) || tou(ev.c) > tou(src)),
    run: (G, X) => addCounters(G, X.src, 1) }));
  return d;
};
S['Ka-Zar of the Savage Land'] = (d) => {
  d.peekTop = true;
  d.topLand = (G, P, card) => isLand(card);
  d.etb = [mkE(ZABU, 1)];
  return d;
};
S['Knight of Wundagore'] = (d) => {
  d.trig.push(T('counters', { once: true, cond: (G, src, ev, Q) => ev.kind === '+1/+1' && ev.c !== src && isCreature(ev.c) && ev.c.ctrl === Q.i, run: (G, X) => addCounters(G, X.src, 1) }));
  return d;
};
S['Mister Hyde, Monster Within'] = (d) => {
  d.trig.push(T('upkeep', { you: true, eff: [chooseOne([
    { label: 'Put a +1/+1 counter on Mister Hyde', eff: [fn((G, X) => addCounters(G, X.src, 1), { score: () => 1 })] },
    { label: 'Remove a counter from a creature you control to draw a card', eff: [fn((G, X) => {
      const P = X.P;
      const cs = P.bf.filter((c) => isCreature(c) && (c.cnt > 0 || Object.keys(c.ctr).some((k) => c.ctr[k] > 0)));
      const c = pickOne(G, P, cs, 'Remove a counter from a creature you control', (x) => (ctrCount(x, 'stun') ? 5 : x.cnt > 2 ? 1 : 0));
      if (!c) return;
      const kinds = Object.keys(c.ctr).filter((k) => c.ctr[k] > 0).concat(c.cnt > 0 ? ['+1/+1'] : []);
      const kind = kinds.includes('stun') ? 'stun' : isHuman(G, P) && kinds.length > 1 ? kinds[chooseMode(G, P, c, 'Remove which counter?', kinds, 0)] : kinds[0];
      removeCounters(G, c, kind, 1);
      emit(G, 'info', `${P.name} removes a ${kind} counter from ${c.def.name}.`, { who: P.i, cards: [c.id] });
      drawN(G, P, 1);
    }, { score: (G, P) => (P.bf.some((c) => isCreature(c) && ctrCount(c, 'stun')) ? 2.5 : P.bf.some((c) => isCreature(c) && c.cnt > 2) ? 1.2 : P.bf.some((c) => isCreature(c) && (c.cnt > 0 || Object.keys(c.ctr).length)) ? 0.6 : -1) })] },
  ])] }));
  return d;
};
S['Mole Man, Moloid Master'] = (d) => {
  d.gyLand = () => true;
  d.trig.push(T('landfall', { you: true, eff: [mkE(MOLOID, 1)] }));
  return d;
};
S['Pet Avengers'] = (d) => setPU(d, '{6}{G}', { run: (G, X) => { addCounters(G, X.src, 1); mk(G, X.P, HERO, 1); }, ai: puAi(3) });
S['Powerful Broker'] = (d) => {
  d.acts.push({ cost: { tap: true }, sorcery: true, label: 'Give a permanent another counter of each kind it has',
    eff: [fn((G, X, t) => {
      const c = t && t.c; if (!c || !onBf(G, c)) return;
      const kinds = Object.keys(c.ctr).filter((k) => c.ctr[k] > 0);
      if (c.cnt > 0) kinds.push('+1/+1');
      for (const k of kinds) addCounters(G, c, 1, k);
    }, { tgt: { f: { types: ['any'], fn: (G, c) => c.cnt > 0 || Object.keys(c.ctr).some((k) => c.ctr[k] > 0) } },
      val: (G, P, c) => { const good = (c.cnt > 0 ? 1 : 0) + ['indestructible', 'shield', 'double strike', 'flying', 'plan'].filter((k) => ctrCount(c, k)).length; const bad = ctrCount(c, 'stun') ? 1.2 : 0; return c.ctrl === P.i ? good - bad : bad - good; }, label: 'Choose a permanent with counters' })] });
  return d;
};
S['Punishing Punch'] = (d) => {
  d.costMod = (G, P) => (creGy(P) >= 2 ? 2 : 0);
  d.spell = [{ k: 'bite', mult: 2 }];
  return d;
};
S['Rapid Rescue'] = (d) => {
  d.spell = [fn((G, X) => {
    const P = X.P;
    const got = mill(G, P, 2).filter((c) => permCard(c.def) && P.gy.includes(c));
    const take = pickSome(G, P, got, 0, 1, 'Put a permanent card from among them into your hand', (c) => c.def.value + 0.5, 'graveyard');
    for (const c of take) { P.gy.splice(P.gy.indexOf(c), 1); P.hand.push(c); emit(G, 'raise', `${P.name} puts ${c.def.name} into their hand.`, { who: P.i, cards: [c.id] }); }
    gain(G, P, 2);
  }, { score: () => 1.4 })];
  return d;
};
S['Reptil, Dinomorpher'] = (d) => {
  const become = (p, t, kws) => (G, X) => { const c = X.src; c.base = { p, t, eot: true }; for (const k of kws) if (!c.tkw.includes(k)) c.tkw.push(k); dirty(G); emit(G, 'pump', `${c.def.name} becomes a ${p}/${t} Dinosaur Hero with ${kws.join(' and ')} until end of turn.`, { who: X.P.i, cards: [c.id] }); };
  d.acts.push({ cost: { m: C('{3}') }, label: 'Become a 3/5 Dinosaur with vigilance and reach', when: ['blocks', 'main1'], run: become(3, 5, ['vigilance', 'reach']),
    ai: (G, P, c, when) => ((when === 'blocks' && (c.attacking || c.blocking) && pow(c) < 3) || (when === 'main1' && L.canAttackNow(G, c) && !c.base) ? { score: 1.6 } : null) });
  d.acts.push({ cost: { m: C('{6}') }, label: 'Become a 6/6 Dinosaur with trample', when: ['blocks', 'main1'], run: become(6, 6, ['trample']),
    ai: (G, P, c, when) => ((when === 'blocks' && (c.attacking || c.blocking) && pow(c) < 6) || (when === 'main1' && L.canAttackNow(G, c) && (!c.base || c.base.p < 6)) ? { score: 2.4 } : null) });
  return d;
};
S['Restorative Technique'] = (d) => {
  d.spell = [
    fn((G, X, t) => {
      const Q = t && t.p != null ? G.players[t.p] : X.P;
      gain(G, Q, 2);
      const got = searchLibrary(G, Q, (x) => isLand(x) && x.def.supertypes.includes('Basic'), 1, 'bfTapped', 'a basic land');
      if (got.length) emit(G, 'search', `${Q.name} puts ${got[0].def.name} onto the battlefield tapped.`, { who: Q.i, cards: got.map((x) => x.id) });
    }, { tgt: { what: 'player', f: {} }, val: (G, P, x) => (x.p === P.i ? 2 : -2), label: 'Choose a player to gain 2 life and get a basic land' }),
    { k: 'ctrs', n: 1, tgt: { f: {}, min: 0 } },
  ];
  return d;
};
S['Rick Jones, Destined Sidekick'] = (d) => {
  d.acts.push({ cost: { m: C('{3}'), tap: true }, label: 'Mill four; take a Hero or enchantment card', when: ['main2', 'end'],
    run: (G, X) => {
      const P = X.P;
      const got = mill(G, P, 4).filter((c) => (c.def.sub.includes('Hero') || c.def.types.includes('Enchantment')) && P.gy.includes(c));
      const take = pickSome(G, P, got, 0, 1, 'Put a Hero or enchantment card into your hand', (c) => c.def.value + 0.5, 'graveyard');
      for (const c of take) { P.gy.splice(P.gy.indexOf(c), 1); P.hand.push(c); emit(G, 'raise', `${P.name} puts ${c.def.name} into their hand.`, { who: P.i, cards: [c.id] }); }
    }, ai: (G, P) => (P.library.length > 12 ? { score: 1.2 } : null) });
  return d;
};
S['Shang-Chi, Master of Kung Fu'] = (d) => {
  d.hasteAbilities = true;
  d.mana = null;
  d.manaAbs = [{ colors: ['W', 'U', 'B', 'R', 'G'], amount: 2, only: (p) => !!p.ability && !!p.src && isCreature(p.src) }];
  return d;
};
S['She-Hulk, Jade Defender'] = (d) => setPU(d, '{4}{G}{G}', { ai: puAi(2.6),
  eff: [{ k: 'destroyP', tgt: { f: { types: ['Artifact', 'Enchantment'] }, min: 0 } }, fn((G, X) => addCounters(G, X.src, 1), { score: () => 1 })] });
S['Super Strength'] = (d) => {
  d.statics = d.statics.filter((s) => s.who !== 'enchanted');
  d.statics.push({ who: 'enchanted', p: 4, t: 4, kw: ['trample'], ward: 1 });
  return d;
};
S['The Thing, Ben Grimm'] = (d) => {
  d.trig.push(T('hitPlayer', { cond: (G, src, ev, Q) => ev.ctrl === Q.i && hasSub(ev.c, 'Hero') && !(G.pending || []).some((p) => p.src === src && p.t && p.t.on === 'hitPlayer'), run: (G, X) => addCounters(G, X.src, 2) }));
  return d;
};
S['Tigra, Feline Fury'] = (d) => { d.trig.push(T('gain', { you: true, run: (G, X) => addCounters(G, X.src, 1) })); return d; };
S['Training Regimen'] = (d) => {
  d.statics.push({ who: 'all', f: { side: 'you', fn: (G, c) => c.cnt > 0 }, p: 0, t: 0, kw: ['trample'] });
  d.trig.push(T('combatStart', { you: true, eff: [{ k: 'ctrs', n: 1, tgt: { f: { side: 'you' } } }] }));
  return d;
};
S['The Unbeatable Squirrel Girl'] = (d) => {
  d.etb = [mkE(SQUIRREL, 1)];
  d.trig.push(T('attack', { self: true, eff: [mkE(SQUIRREL, 1)] }));
  const nSq = (P) => P.bf.filter((c) => isCreature(c) && hasSub(c, 'Squirrel')).length;
  d.acts.push({ cost: { m: C('{1}{G}{G}{G}') }, label: 'Create a Squirrel for each Squirrel you control', when: ['main2', 'end'], run: (G, X) => mk(G, X.P, SQUIRREL, nSq(X.P)), ai: (G, P) => ({ score: nSq(P) * 1.2 }) });
  return d;
};
S['Undercover Skrull'] = (d) => {
  d.statics.push({ who: 'self', cond: (G, src, P) => creGy(P) >= 2, p: 2, t: 2, kw: [], flags: { allTypes: true } });
  return d;
};
S['Wakandan Royal Guard'] = (d) => {
  d.etb = [fn((G, X, t) => { const c = t && t.c; if (c && onBf(G, c)) addCounters(G, c, c !== X.src && hasSub(c, 'Hero') ? 2 : 1); },
    { tgt: { f: {} }, val: (G, P, c, X) => (c.ctrl !== P.i ? -1 : (X && c === X.src ? 0.8 : hasSub(c, 'Hero') ? 2 : 1) + cv(c) * 0.05), label: 'Put a +1/+1 counter on a creature (two on another Hero)' })];
  return d;
};
S['White Tiger, Ava Ayala'] = (d) => setPU(d, '{5}{G}', { run: (G, X) => { addCounters(G, X.src, 1); mk(G, X.P, TIGER_GOD, 1); }, ai: puAi(4) });
S['World War Hulk'] = (d) => {
  d.saga = [
    { ch: [1], run: (G, X) => { X.P.freeNext = { turn: G.turn, f: (def) => def.types.includes('Creature') && (def.colors.includes('R') || def.colors.includes('G')) }; say(G, X.P, `${X.P.name}'s next red or green creature spell this turn can be cast without paying its mana cost.`); } },
    { ch: [2], eff: [{ k: 'ctrs', n: 3, tgt: { f: { side: 'you' } } }] },
    { ch: [3], eff: [fn((G, X, t) => { const c = t && t.c; if (c && onBf(G, c)) pump(G, c, Math.max(0, pow(c)), Math.max(0, tou(c)), ['trample']); },
      { tgt: { f: { side: 'you' } }, val: (G, P, c) => Math.max(0, pow(c)) * 0.6 + (L.canAttackNow(G, c) ? 1 : 0), label: 'Double a creature\'s power and toughness; it gains trample' })] },
  ];
  return d;
};

/* ============================ Multicolored ============================ */
// "Becomes a copy ... until your next turn, except ...": Absorbing Man, Taskmaster
function copyUntilNextTurn(G, c, def, over) {
  if (!onBf(G, c)) return;
  if (c.faceBase) { c.def = c.faceBase; c.faceBase = null; }
  const base = c.def;
  const cdef = Object.assign({}, def, { id: `${def.id}-as-${c.id}-${G.nextId++}`, token: !!c.token, front: null, back: null, adv: null, advOf: null, meldInto: null, isBack: false, mdfc: false, untilNextTurn: true }, over(def, base));
  G.defs[cdef.id] = cdef;
  c.faceBase = base;
  c.def = cdef;
  dirty(G);
  emit(G, 'copy', `${base.name} becomes a copy of ${def.name} until ${G.players[c.ctrl].name}'s next turn.`, { who: c.ctrl, cards: [c.id] });
}
// Legality of a new target for a spell's effect (Speedball)
const legalFor = (G, P, e, c, src) => (e.tgt ? L.tgtOk(G, P, e, c, src) : A._internal.targetOk(G, P, e.f || {}, c, src));
const HARMFUL = new Set(['destroy', 'exile', 'dmg', 'dmgX', 'destroyP', 'exileP', 'bounce', 'bounceP', 'tuck', 'tuckN', 'tapP', 'fight', 'bite']);
S['Abomination, Terrifying Titan'] = (d) => setPU(d, '{5}{R/G}{R/G}', { ai: puAi(2.6),
  eff: [fn((G, X) => addCounters(G, X.src, 1), { score: () => 1 }), fn((G, X, t) => { const c = t && t.c; if (c && onBf(G, c) && onBf(G, X.src)) L.fightCards(G, X.P, X.src, c); },
    { tgt: { f: { side: 'opp' }, min: 0 }, val: (G, P, c, X) => { const me = X && X.src; if (!me) return 0; const kills = pow(me) + 1 >= L.lethalTo(c) || has(me, 'deathtouch'); const dies = pow(c) >= L.lethalTo(me) + 1 && !has(me, 'indestructible'); return (kills ? cv(c) : 0) - (dies ? cv(me) : 0); }, label: 'Fight up to one creature an opponent controls' })] });
S['Absorbing Man'] = (d) => {
  d.trig.push(T('mainStart', { you: true, eff: [fn((G, X, t) => {
    const c = t && t.c; if (!c || !onBf(G, c) || !onBf(G, X.src)) return;
    copyUntilNextTurn(G, X.src, c.def, (def, base) => ({ name: base.name, types: [...new Set(def.types.concat('Creature'))], supertypes: [...new Set(def.supertypes.concat('Legendary'))],
      sub: [...new Set(def.sub.concat(['Human', 'Villain']))], power: 4, toughness: 4, kw: [...new Set(def.kw.concat('vigilance'))], value: Math.max(def.value, 4) }));
  }, { tgt: { f: { types: ['Artifact', 'Enchantment', 'Land'], fn: (G, c) => !c.def.aura }, min: 0 }, val: (G, P, c) => (c.def.types.includes('Land') ? (c.def.mana && c.def.mana.length > 1 ? 0.4 : -0.2) : c.def.value * 0.6 - 0.5), label: 'Become a copy of an artifact, non-Aura enchantment or land' })] }));
  return d;
};
S['Alien Invasion'] = (d) => {
  d.trig.push(T('combatStart', { you: true, run: (G, X) => {
    const t = mk(G, X.P, ALIEN, 1)[0];
    const n = ctrCount(X.src, 'invasion');
    if (t && n) addCounters(G, t, n);
    if (onBf(G, X.src)) addCounters(G, X.src, 1, 'invasion');
  } }));
  return d;
};
S['Ant-Man, Colony Commander'] = (d) => {
  d.trig.push(T('attack', { self: true, run: (G, X) => {
    const P = X.P;
    if (!canPay(P, L.genericCost(1))) return;
    if (isHuman(G, P) ? !yesNo(G, P, X.src, 'Pay {1} to put a +1/+1 counter on a creature?', true) : false) return;
    if (!pay(P, L.genericCost(1))) return;
    G.pending.unshift({ src: X.src, P, t: { label: 'Put a +1/+1 counter on a creature', eff: [{ k: 'ctrs', n: 1, tgt: { f: {} } }] }, ev: {} });
  } }));
  d.trig.push(T('counters', { once: true, cond: (G, src, ev, Q) => ev.kind === '+1/+1' && isCreature(ev.c) && ev.c.ctrl === Q.i, eff: [mkE(INSECT, 1)] }));
  return d;
};
S['Ares, God of War'] = (d) => {
  d.mustAttack = true;
  d.trig.push(T('die', { you: true, cond: (G, src, ev) => !!ev.att && !ev.token, run: (G, X) => {
    const c = X.ev.c, O = G.players[c.owner];
    if (!O.gy.includes(c)) return;
    O.gy.splice(O.gy.indexOf(c), 1); O.hand.push(c); dirty(G);
    emit(G, 'raise', `${c.def.name} returns to ${O.name}'s hand.`, { who: X.P.i, cards: [c.id] });
  } }));
  return d;
};
S['Armor Wars'] = (d) => {
  d.saga = [
    { ch: [1], run: (G, X) => {
      const P = X.P, n = nArt(P);
      if (!n) return;
      if (isHuman(G, P) ? !yesNo(G, P, X.src, `Draw ${n} card${n > 1 ? 's' : ''}? Each opponent draws a card.`, true) : n < 2) return;
      drawN(G, P, n);
      drawN(G, X.O, 1);
    } },
    { ch: [2], run: (G, X) => { (X.P.turnDiscounts = X.P.turnDiscounts || []).push({ turn: G.turn, f: (def) => (def.types.includes('Artifact') ? 1 : 0) }); say(G, X.P, `Artifact spells ${X.P.name} casts this turn cost {1} less.`); } },
    { ch: [3], eff: [fn((G, X, t) => { const Q = t && t.p != null ? G.players[t.p] : X.O; const n = Math.max(0, ...X.P.bf.filter(isArtifact).map((c) => c.def.mv)); if (n) hit(G, X, { p: Q.i }, n); },
      { tgt: { what: 'player', f: OPP }, val: (G, P, x) => (x.p === P.i ? -5 : Math.max(0, ...P.bf.filter(isArtifact).map((c) => c.def.mv)) * 0.5 + 0.1), label: 'Choose an opponent' })] },
  ];
  return d;
};
S['The Astonishing Ant-Man'] = (d) => {
  d.trig.push(T('draw', { you: true, run: (G, X) => addCounters(G, X.src, 1) }));
  d.acts.push({ cost: { m: C('{2}{G}'), tap: true }, label: 'Remove +1/+1 counters: create that many Insects', when: ['main2', 'end'], cond: (G, P, c) => c.cnt > 0,
    run: (G, X) => {
      const c = X.src, P = X.P;
      const n = isHuman(G, P) ? chooseNumber(G, P, c, 'Remove how many +1/+1 counters?', 0, c.cnt, c.cnt) : c.cnt;
      if (n <= 0) return;
      removeCounters(G, c, '+1/+1', n);
      mk(G, P, INSECT, n);
    }, ai: (G, P, c, when) => (c.cnt >= 3 && when === 'end' ? { score: c.cnt * 0.6 } : null) });
  return d;
};
S['Avengers: Under Siege'] = (d) => {
  d.saga = [
    { ch: [1], eff: [mkE(VILLAIN, 2)] },
    { ch: [2], run: (G, X) => {
      const hitC = allCreatures(G).filter((c) => !hasSub(c, 'Villain'));
      for (const c of hitC) damageCreature(G, c, 2, X.src);
      emit(G, 'hit', `${X.src.def.name} deals 2 damage to each non-Villain creature${hitC.length ? '' : ' (there are none)'} and to ${X.O.name}.`, { who: X.P.i, cards: hitC.map((c) => c.id) });
      L.damagePlayer(G, X.O, 2, X.src, X.P);
    } },
    { ch: [3], run: (G, X) => mk(G, X.P, TREASURE, villains(X.P).length) },
  ];
  return d;
};
S['Beast, Erudite Aerialist'] = (d) => {
  d.statics.push({ who: 'self', cond: (G, src) => src.plusTurn === G.turn, p: 0, t: 0, kw: ['flying'] });
  d.trig.push(T('hitPlayer', { self: true, run: (G, X) => drawN(G, X.P, 1) }));
  return d;
};
S['Black Panther, Vanguard'] = (d) => {
  d.trig.push(T('enter', { you: true, cond: (G, src, ev) => ev.c !== src && !ev.c.token && isCreature(ev.c) && hasSub(ev.c, 'Hero'), eff: [chooseOne([
    { label: 'Create a 1/1 Soldier token', eff: [mkE(SOLDIER, 1)] },
    { label: 'Creatures you control get +1/+1 until end of turn', eff: [fn((G, X) => { for (const c of X.P.bf.filter(isCreature)) { c.tp++; c.tt++; } dirty(G); emit(G, 'pump', `Creatures ${X.P.name} controls get +1/+1 until end of turn.`, { who: X.P.i }); },
      { score: (G, P) => (G.active === P.i && G.combatTurn !== G.turn ? nCre(P) * 0.6 : 0.3) })] },
  ])] }));
  return d;
};
S['Black Widow, Double Agent'] = (d) => { d.trig.push(alone({ run: (G, X) => grantKw(G, lone(X), ['first strike', 'menace']) })); return d; };
S['Bullseye, Death Dealer'] = (d) => {
  // The extra cost: sacrifice an artifact or discard a nonland card
  const payIt = (G, P, src, optional) => {
    const arts = P.bf.filter(isArtifact), cards = P.hand.filter((c) => !c.def.types.includes('Land'));
    if (!arts.length && !cards.length) return false;
    const opts = (arts.length ? ['Sacrifice an artifact'] : []).concat(cards.length ? ['Discard a nonland card'] : []).concat(optional ? ['Neither'] : []);
    let k;
    if (isHuman(G, P)) k = opts[chooseMode(G, P, src, `${src.def.name}: pay the extra cost`, opts, 0)];
    else { const art = arts.filter((c) => c.token || pv(G, c) < 1.2).sort((a, b) => pv(G, a) - pv(G, b))[0]; const card = cards.slice().sort((a, b) => handValue(G, P, a) - handValue(G, P, b))[0]; k = art ? 'Sacrifice an artifact' : card && handValue(G, P, card) < 2 ? 'Discard a nonland card' : optional ? 'Neither' : arts.length ? 'Sacrifice an artifact' : 'Discard a nonland card'; }
    if (k === 'Sacrifice an artifact') { const c = pickOne(G, P, arts, 'Sacrifice an artifact', (x) => -pv(G, x)); emit(G, 'sac', `${P.name} sacrifices ${c.def.name}.`, { who: P.i, cards: [c.id] }); sacrifice(G, P, c, true); return true; }
    if (k === 'Discard a nonland card') { const c = pickOne(G, P, cards, 'Discard a nonland card', (x) => -handValue(G, P, x), 'choose', 'hand'); P.hand.splice(P.hand.indexOf(c), 1); P.gy.push(c); dirty(G); emit(G, 'discard', `${P.name} discards ${c.def.name}.`, { who: P.i, cards: [c.id] }); L.noteDiscard(G, P, c); return true; }
    return false;
  };
  const bolt = { k: 'dmgX', nFn: () => 2, tgt: { what: 'any', f: {} } };
  d.etb = [fn((G, X) => { if (payIt(G, X.P, X.src, true)) G.pending.unshift({ src: X.src, P: X.P, t: { label: '2 damage to any target', eff: [bolt] }, ev: {} }); }, { score: () => 1 })];
  d.acts.push({ cost: { m: C('{3}'), tap: true }, label: 'Sacrifice an artifact or discard a nonland card: 2 damage to any target', when: ['main2', 'end', 'blocks'],
    cond: (G, P) => P.bf.some(isArtifact) || P.hand.some((c) => !c.def.types.includes('Land')),
    eff: [fn((G, X) => { X.paid = payIt(G, X.P, X.src, false); }, { score: () => -0.6 }), Object.assign({ if: (G, X) => !!X.paid }, bolt)] });
  return d;
};
S['Captain America, Living Legend'] = (d) => {
  d.trig.push(T('tapped', { you: true, cond: (G, src, ev, Q) => G.active === Q.i && ev.cs.some((c) => isCreature(c) && c.firstTap !== G.turn), run: (G, X) => {
    for (const c of X.ev.cs) { if (!isCreature(c) || c.firstTap === G.turn) continue; c.firstTap = G.turn; untap(G, c, X.P); }
  } }));
  return d;
};
S['Cloak and Dagger, Entwined'] = (d) => {
  d.etb = [fn((G, X, t) => {
    const P = X.P, Q = X.O;
    const cre = t && t.c && onBf(G, t.c) ? t.c : null;
    emit(G, 'reveal', `${Q.name} reveals their hand${Q.hand.length ? `: ${nameList(Q.hand)}` : ' (empty)'}.`, { who: Q.i, cards: Q.hand.map((c) => c.id) });
    const cards = Q.hand.filter((c) => !c.def.types.includes('Land'));
    const pool = cards.concat(cre ? [cre] : []);
    if (!pool.length) return;
    const pick = isHuman(G, P) ? pickSome(G, P, pool, 0, 1, 'Exile a nonland card from their hand or the chosen creature', () => 1, 'hand')[0]
      : pool.slice().sort((a, b) => (onBf(G, b) ? pv(G, b) : b.def.value * 0.8) - (onBf(G, a) ? pv(G, a) : a.def.value * 0.8))[0];
    if (!pick) return;
    if (onBf(G, pick)) { exileUntil(G, P, X.src, pick); return; }
    Q.hand.splice(Q.hand.indexOf(pick), 1); Q.exile.push(pick); dirty(G);
    X.src.mem.heldHand = (X.src.mem.heldHand || []).concat(pick);
    emit(G, 'exile', `${pick.def.name} is exiled from ${Q.name}'s hand until ${X.src.def.name} leaves the battlefield.`, { who: P.i, cards: [pick.id] });
  }, { tgt: { f: { side: 'opp' }, min: 0 }, val: (G, P, c) => pv(G, c), label: 'Choose up to one creature they control' })];
  d.trig.push(T('leave', { self: true, run: (G, X) => {
    returnHeld(G, X.ev.mem);
    for (const c of (X.ev.mem && X.ev.mem.heldHand) || []) { const O = G.players[c.owner]; if (!O.exile.includes(c)) continue; O.exile.splice(O.exile.indexOf(c), 1); O.hand.push(c); emit(G, 'raise', `${c.def.name} returns to ${O.name}'s hand.`, { who: O.i, cards: [c.id] }); }
  } }));
  return d;
};
S['The Coming of Galactus'] = (d) => {
  d.saga = [
    { ch: [1], eff: [{ k: 'destroyP', tgt: { f: { types: ['nonland'] }, min: 0 } }] },
    { ch: [2, 3], run: (G, X) => loseLife(G, X.O, 2, X.P.i) },
    { ch: [4], eff: [mkE(GALACTUS, 1)] },
  ];
  return d;
};
S['Daredevil, Man Without Fear'] = (d) => {
  d.trig.push(T('attacks', { you: true, may: true, mayAi: () => true, mayLabel: 'Exile the top card of your library? You may play it this turn.', run: (G, X) => {
    const c = impulse(G, X.P, G.turn);
    if (c && c.def.sub.includes('Hero') && onBf(G, X.src)) pump(G, X.src, 2, 1);
  } }));
  return d;
};
S['Ghost, Spectral Saboteur'] = (d) => { d.unblockable = true; return d; };
S['Hulk, Gamma Goliath'] = (d) => { d.puDiscount = 3; return setPU(d, '{6}{R}{G}', { run: (G, X) => addCounters(G, X.src, 5), ai: puAi(4.5) }); };
S['Iron Man, Master of Machines'] = (d) => {
  d.statics.push({ who: 'self', p: 0, t: 0, kw: [], pFn: (G, src) => G.players[src.ctrl].bf.filter((c) => c !== src && isArtifact(c)).length });
  d.trig.push(T('attack', { self: true, cond: (G, src, ev, Q) => enteredThisTurn(G, Q).some((c) => c.def.types.includes('Artifact')), run: (G, X) => drawN(G, X.P, 1) }));
  return d;
};
S['Kang, Temporal Tyrant'] = (d) => {
  d.trig.push(T('attack', { self: true, run: (G, X) => connive(G, X.P, X.src) }));
  d.trig.push(draw2({ run: (G, X) => drain(G, X, 1) }));
  return d;
};
S['Killmonger, Scourge of Wakanda'] = (d) => {
  d.etb = [fn((G, X) => {
    const P = X.P;
    const cs = P.bf.filter((c) => isCreature(c) && c !== X.src);
    const prey = X.O.bf.filter((c) => !isLand(c));
    if (!cs.length || !prey.length) return;
    const worst = cs.slice().sort((a, b) => pv(G, a) - pv(G, b))[0];
    const want = isHuman(G, P) ? yesNo(G, P, X.src, 'Sacrifice another creature to destroy a nonland permanent an opponent controls?', true) : Math.max(...prey.map((c) => pv(G, c))) > pv(G, worst) + 0.8;
    if (!want) return;
    const c = pickOne(G, P, cs, 'Sacrifice another creature', (x) => -pv(G, x));
    emit(G, 'sac', `${P.name} sacrifices ${c.def.name}.`, { who: P.i, cards: [c.id] });
    sacrifice(G, P, c, true);
    G.pending.unshift({ src: X.src, P, t: { label: 'Destroy a nonland permanent an opponent controls', eff: [{ k: 'destroyP', tgt: { f: { types: ['nonland'], side: 'opp' } } }] }, ev: {} });
  }, { score: () => 1.5 })];
  d.statics.push({ who: 'self', cond: (G, src, P) => creGy(P) >= 2, p: 2, t: 1, kw: [] });
  return d;
};
S["King T'Challa"] = (d) => {
  d.trig.push(T('draw', { cond: (G, src, ev) => ev.nth === 2, run: (G, X) => drawN(G, X.P, 1) }));
  d.acts.push(turnOver('{4}{W}{U}', backScore));
  return d;
};
S['Black Panther, Hope Enduring'] = (d) => {
  d.preventAll = true;
  d.trig.push(T('hitPlayer', { self: true, run: (G, X) => drawN(G, X.P, 1) }));
  return d;
};
S['The Kingpin of Crime'] = (d) => {
  const extort = C('{W/B}');
  d.trig.push(T('cast', { you: true, run: (G, X) => {
    const P = X.P;
    if (!canPay(P, extort)) return;
    if (isHuman(G, P) ? !yesNo(G, P, X.src, 'Extort: pay {W/B} to drain each opponent for 1?', true) : false) return;
    if (pay(P, extort)) drain(G, X, 1);
  } }));
  d.trig.push(T('attacks', { you: true, run: (G, X) => {
    const P = X.P;
    const big = P.bf.filter((c) => isCreature(c) && tou(c) > pow(c));
    if (!big.length || P.life <= 2) return;
    const gainDmg = big.filter((c) => c.attacking || !c.tapped).reduce((s, c) => s + tou(c) - Math.max(0, pow(c)), 0);
    if (isHuman(G, P) ? !yesNo(G, P, X.src, 'Pay 2 life so your creatures with toughness greater than power deal combat damage equal to their toughness this turn?', true) : !(gainDmg >= 3 && P.life > 8)) return;
    loseLife(G, P, 2);
    for (const c of big) c.tf.toughDmg = true;
    say(G, P, `Until end of turn, ${P.name}'s creatures with toughness greater than their power assign combat damage equal to their toughness.`);
  } }));
  return d;
};
S['Madame Hydra'] = (d) => { d.trig.push(T('cast', { you: true, cond: (G, src, ev) => ev.card.def.sub.includes('Villain'), eff: [mkE(VILLAIN, 1)] })); return d; };
S['The Mighty Thor, Jane Foster'] = (d) => {
  d.trig.push(T('attack', { self: true, eff: [fn((G, X, t) => { const c = t && t.c; if (c && onBf(G, c)) blink(G, c, { tapped: true }); },
    { tgt: { f: { types: ['Artifact', 'Creature'], nontoken: true }, min: 0 }, val: (G, P, c) => (c.ctrl === P.i ? L.flickerVal(G, P, c) - 0.3 : isCreature(c) && !c.tapped ? cv(c) * 0.5 + 0.3 : 0.2), label: 'Exile up to one nontoken artifact or creature, then return it tapped' })] }));
  d.trig.push(T('enter', { you: true, cond: (G, src, ev) => isEquip(ev.c), run: (G, X) => drawN(G, X.P, 1) }));
  return d;
};
S['Moon Girl and Devil Dinosaur'] = (d) => {
  d.trig.push(draw2({ run: (G, X) => { const c = X.src; c.base = { p: 6, t: 6, eot: true }; if (!c.tkw.includes('trample')) c.tkw.push('trample'); dirty(G); emit(G, 'pump', `${c.def.name} become 6/6 with trample until end of turn.`, { who: X.P.i, cards: [c.id] }); } }));
  d.trig.push(T('enter', { you: true, once: true, cond: (G, src, ev) => isArtifact(ev.c), run: (G, X) => drawN(G, X.P, 1) }));
  return d;
};
S['The Ruinous Wrecking Crew'] = (d) => {
  const modes = [
    { label: 'Discard a card, then draw a card', eff: [fn((G, X) => { discardE(G, X.P, 1); drawN(G, X.P, 1); }, { score: () => 0.5 })], ai: (G, P) => (P.hand.some((c) => handValue(G, P, c) < 0.8) ? 0.8 : 0.2) },
    { label: 'An opponent loses 2 life', eff: [fn((G, X) => loseLife(G, X.O, 2, X.P.i), { score: () => 1 })], ai: () => 1 },
    { label: 'Destroy a token', eff: [{ k: 'destroyP', tgt: { f: { types: ['any'], token: true } } }], ai: (G, P) => (other(G, P).bf.some((c) => c.token) ? 1.5 : 0) },
    { label: 'Each player sacrifices a creature', eff: [fn((G, X) => { for (const Q of [X.P, X.O]) edictOf(G, Q, (c) => isCreature(c)); }, { score: () => 0.5 })],
      ai: (G, P) => { const mine = P.bf.filter(isCreature).length, theirs = other(G, P).bf.filter(isCreature).length; return theirs && mine >= 2 ? 1.3 : 0; } },
  ];
  d.etb = [fn((G, X) => {
    const P = X.P, n = (X.item && X.item.x) || 0;
    if (n > 0) addCounters(G, X.src, n);
    const k = Math.min(n, modes.length);
    if (!k) return;
    let pick;
    if (isHuman(G, P)) { pick = []; for (let i = 0; i < k; i++) { const left = modes.filter((md) => !pick.includes(md)); const all = left.map((md) => md.label).concat('Done'); const j = chooseMode(G, P, X.src, `${X.src.def.name}: choose up to ${k - pick.length} more`, all, all.length - 1); if (j >= left.length) break; pick.push(left[j]); } }
    else pick = modes.filter((md) => md.ai(G, P) >= 0.8).sort((a, b) => b.ai(G, P) - a.ai(G, P)).slice(0, k);
    if (!pick.length) return;
    pick.sort((a, b) => modes.indexOf(a) - modes.indexOf(b));
    emit(G, 'info', `${X.src.def.name}: ${pick.map((md) => md.label).join('; ')}.`, { who: P.i });
    G.pending.unshift({ src: X.src, P, t: { label: X.src.def.name, eff: pick.flatMap((md) => md.eff) }, ev: {} });
  }, { score: () => 1 })];
  d.aiX = (G, P, card, x) => Math.min(x, 6);
  return d;
};
S['Scientist Supreme of A.I.M.'] = (d) => {
  d.acts.push({ cost: { life: 2 }, once: true, label: 'Copy the next ability of an artifact you control this turn', cond: (G, P) => G.active === P.i, noAi: true,
    run: (G, X) => { X.P.echoNext = { turn: G.turn, n: 1, src: X.src.id, artifact: true }; say(G, X.P, `The next ability of an artifact ${X.P.name} controls that resolves this turn is copied.`); } });
  return d;
};
S['The Serpent Society'] = (d) => {
  d.wardCost = (G, P, c) => {
    const ok = isHuman(G, P) ? yesNo(G, P, c, `Ward: get five poison counters, or your spell or ability targeting ${c.def.name} is countered?`, false) : (P.poison || 0) + 5 < 10 && cv(c) >= 3;
    if (!ok) return false;
    P.poison = (P.poison || 0) + 5;
    emit(G, 'life', `${P.name} gets five poison counters (${P.poison} total).`, { who: P.i, target: `p${P.i}` });
    return true;
  };
  d.trig.push(T('die', { you: true, cond: (G, src, ev) => ev.c !== src && (ev.def || ev.c.def).kw.includes('deathtouch'), run: (G, X) => edictOf(G, X.O, (c) => isCreature(c) && !c.token, X.src.def.name) }));
  return d;
};
S['Speedball, New Warrior'] = (d) => {
  d.trig.push(T('targeted', { cond: (G, src, ev) => ev.c === src && !!ev.spell && !!ev.item, run: (G, X) => {
    const src = X.src, item = X.ev.item, P = X.P;
    pump(G, src, 2, 2);
    if (!G.stack.includes(item)) return;
    const effs = L.spellEffects(item.card.def, item.mode);
    effs.forEach((e, k) => {
      const t = item.targets[k];
      if (!t || t.c !== src) return;
      const cands = allCreatures(G).filter((c) => c !== src && legalFor(G, item.P, e, c, item.card));
      if (!cands.length) return;
      let to = null;
      if (isHuman(G, P)) { if (yesNo(G, P, src, `Choose a new target for ${item.card.def.name}?`, false)) to = pickOne(G, P, cands, `New target for ${item.card.def.name}`, () => 0); }
      else if (item.P !== P && HARMFUL.has(e.k)) to = cands.filter((c) => c.ctrl !== P.i).sort((a, b) => cv(b) - cv(a))[0] || null;
      if (to) { item.targets[k] = { c: to }; emit(G, 'info', `${item.card.def.name} now targets ${to.def.name}.`, { who: P.i, cards: [to.id] }); }
    });
  } }));
  return d;
};
S['Spider-Man, To the Rescue'] = (d) => {
  d.etb = [fn((G, X) => {
    const P = X.P;
    const others = P.bf.filter((c) => isCreature(c) && c !== X.src && !c.attacking);
    if (!others.length || X.src.tapped) return;
    const danger = others.filter((c) => c.blocking || c.dmg > 0);
    if (isHuman(G, P) ? !yesNo(G, P, X.src, 'Tap Spider-Man to give another creature indestructible until end of turn?', true) : !danger.length) return;
    X.src.tapped = true;
    emit(G, 'tapfx', `${X.src.def.name} taps.`, { who: P.i, cards: [X.src.id] });
    G.pending.unshift({ src: X.src, P, t: { label: 'Indestructible', eff: [{ k: 'grant', kw: ['indestructible'], tgt: { f: { side: 'you', fn: (GG, c) => !c.attacking }, other: true } }] }, ev: {} });
  }, { score: () => 0.6 })];
  return d;
};
S['Spider-Woman, Secret Agent'] = (d) => {
  d.etb = [fn((G, X, t) => { const c = t && t.c; if (!c || !onBf(G, c)) return; c.tapped = true; X.src.mem.webbed = (X.src.mem.webbed || []).concat(c.id); dirty(G); emit(G, 'tapfx', `${c.def.name} is tapped and can't untap while ${X.P.name} controls ${X.src.def.name}.`, { who: X.P.i, cards: [c.id] }); },
    { tgt: { f: { side: 'opp' } }, val: (G, P, c) => cv(c) * 0.6 + (c.tapped ? 0 : 0.4), label: 'Tap a creature an opponent controls' })];
  d.statics.push({ who: 'all', f: { types: ['any'], fn: (G, c, P, src) => !!(src.mem && src.mem.webbed && src.mem.webbed.includes(c.id)) }, p: 0, t: 0, kw: [], flags: { noUntap: true } });
  return d;
};
S['Storm, Windrider'] = (d) => {
  d.noFlyers = true;
  d.trig.push(T('cast', { you: true, cond: (G, src, ev) => !!ev.item && allTargets(ev.item.targets).some((t) => t.c && isCreature(t.c)), run: (G, X) => {
    for (const t of allTargets(X.ev.item.targets)) if (t.c && onBf(G, t.c) && isCreature(t.c)) grantKw(G, t.c, ['flying']);
  } }));
  return d;
};
S['The Super Hero Civil War'] = (d) => {
  d.saga = [
    { ch: [1], run: (G, X) => {
      const P = X.P;
      const cs = X.O.bf.filter((c) => isCreature(c) && A._internal.targetOk(G, P, {}, c, X.src));
      let pick;
      if (isHuman(G, P)) { pick = pickSome(G, P, cs, 0, 2, 'Gain control of up to two creatures with total mana value 6 or less', () => 1); if (pick.reduce((s, c) => s + c.def.mv, 0) > 6) pick = pick.slice(0, 1); if (pick.length && pick[0].def.mv > 6) pick = []; }
      else {
        let best = [], bs = 0;
        for (let i = 0; i < cs.length; i++) { if (cs[i].def.mv <= 6 && cv(cs[i]) > bs) { best = [cs[i]]; bs = cv(cs[i]); } for (let j = i + 1; j < cs.length; j++) if (cs[i].def.mv + cs[j].def.mv <= 6 && cv(cs[i]) + cv(cs[j]) > bs) { best = [cs[i], cs[j]]; bs = cv(cs[i]) + cv(cs[j]); } }
        pick = best;
      }
      for (const c of pick) if (onBf(G, c) && onBf(G, X.src)) gainControl(G, P, c, 'src', X.src);
    } },
    { ch: [2], run: (G, X) => { for (const c of X.P.bf.filter(isCreature)) { c.tp++; c.tt++; if (!c.tkw.includes('vigilance')) c.tkw.push('vigilance'); } dirty(G); emit(G, 'pump', `Creatures ${X.P.name} controls get +1/+1 and gain vigilance until end of turn.`, { who: X.P.i }); } },
    { ch: [3], eff: [{ k: 'fight', tgtFight: true }] },
  ];
  // III: fight up to one other target creature (any creature)
  d.saga[2] = { ch: [3], eff: [fn((G, X, t) => {
    const cs = tcs(t); const m = cs[0], o = cs[1];
    if (m && o && onBf(G, m) && onBf(G, o)) L.fightCards(G, X.P, m, o);
  }, { tgt: { f: {}, n: 2, min: 1 }, val: (G, P, c) => (c.ctrl === P.i ? pow(c) * 0.3 : cv(c) * 0.5), label: 'A creature you control fights up to one other creature (pick yours first)' })] };
  return d;
};
S['Taskmaster, Mercenary Mimic'] = (d) => {
  const become = (G, X, def) => copyUntilNextTurn(G, X.src, def, (cd, base) => ({ name: base.name, types: ['Creature'], supertypes: ['Legendary'], sub: ['Human', 'Mercenary', 'Villain'] }));
  d.trig.push(T('mainStart', { you: true, run: (G, X) => {
    const P = X.P;
    const bf = allCreatures(G).filter((c) => c !== X.src);
    const gy = G.players.flatMap((Q) => Q.gy).filter((c) => c.def.types.includes('Creature'));
    const score = (c) => c.def.value + c.def.mv * 0.3;
    let pick = null;
    if (isHuman(G, P)) {
      const opts = (bf.length ? ['Copy a creature on the battlefield'] : []).concat(gy.length ? ['Copy a creature card in a graveyard'] : []).concat('Stay as he is');
      const k = opts[chooseMode(G, P, X.src, `${X.src.def.name}: become a copy until your next turn?`, opts, 0)];
      if (k === 'Copy a creature on the battlefield') pick = pickOne(G, P, bf, 'Choose a creature to copy', score);
      else if (k === 'Copy a creature card in a graveyard') pick = pickOne(G, P, gy, 'Choose a creature card to copy', score, 'gypick', 'graveyard');
    } else pick = bf.concat(gy).filter((c) => !c.def.token).sort((a, b) => score(b) - score(a))[0] || null;
    if (pick && score(pick) > X.src.def.value) become(G, X, pick.def);
  } }));
  return d;
};
S['Thanos, the Mad Titan'] = (d) => setPU(d, '{C}{W}{U}{B}{R}{G}', { ai: puAi(5), run: (G, X) => {
  addCounters(G, X.src, 2);
  const P = X.P;
  const swing = (odd) => allCreatures(G).filter((c) => c !== X.src && (c.def.mv % 2 === 1) === odd).reduce((s, c) => s + (c.ctrl === P.i ? -cv(c) : cv(c)), 0);
  const odd = isHuman(G, P) ? chooseMode(G, P, X.src, 'Choose odd or even', ['Odd', 'Even'], 0) === 0 : swing(true) >= swing(false);
  const hitC = allCreatures(G).filter((c) => c !== X.src && (c.def.mv % 2 === 1) === odd && !has(c, 'indestructible') && !L.shieldSave(G, c));
  emit(G, 'die', `${P.name} chooses ${odd ? 'odd' : 'even'}.`, { who: P.i });
  P.stats.kills += hitC.filter((c) => c.ctrl !== P.i).length;
  L.dieNow(G, hitC);
} });
S['Thor Odinson'] = (d) => { d.trig.push(castNC({ run: (G, X) => pump(G, X.src, 1, 1) })); return d; };
S['Titania, Rugged Rumbler'] = (d) => {
  d.addCost = { discard: 1, orPay: C('{2}') };
  d.wardCost = (G, P, c) => {
    const pay2 = canPay(P, L.genericCost(2)), canDisc = P.hand.length > 0;
    if (!pay2 && !canDisc) return false;
    let k;
    if (isHuman(G, P)) { const opts = (pay2 ? ['Pay {2}'] : []).concat(canDisc ? ['Discard a card'] : []).concat('Let it be countered'); k = opts[chooseMode(G, P, c, `Ward on ${c.def.name}: discard a card or pay {2}`, opts, 0)]; }
    else k = pay2 ? 'Pay {2}' : P.hand.some((x) => handValue(G, P, x) < 1.2) ? 'Discard a card' : 'Let it be countered';
    if (k === 'Pay {2}') return pay(P, L.genericCost(2));
    if (k === 'Discard a card') { discardE(G, P, 1); return true; }
    return false;
  };
  return d;
};
S['U.S.Agent, John Walker'] = (d) => {
  d.etb = [fn((G, X) => { const s = mk(G, X.P, STURDY_SHIELD, 1)[0]; if (s && onBf(G, X.src)) attach(G, s, X.src); }, { score: () => 1.5 })];
  return d;
};
S['Vision Quest'] = (d) => {
  d.spell = [fn((G, X) => {
    const P = X.P, x = X.x || 0;
    const ok = (c) => c.def.types.includes('Artifact') && c.def.types.includes('Creature') && c.def.mv <= x;
    const cands = P.library.filter(ok).concat(P.gy.filter(ok));
    const pick = pickSome(G, P, cands, 0, 1, `Put an artifact creature card with mana value ${x} or less onto the battlefield`, (c) => c.def.value + c.def.mv * 0.3, 'library', 'search')[0];
    if (P.library.length) G.rng.shuffle(P.library);
    if (!pick) { emit(G, 'search', `${P.name} searches and finds nothing.`, { who: P.i }); return; }
    L.removeFromZones(G, pick);
    emit(G, 'search', `${P.name} puts ${pick.def.name} onto the battlefield with ${x} additional +1/+1 counters.`, { who: P.i, cards: [pick.id] });
    enterBattlefield(G, P, pick, null, { ctr: { '+1/+1': x } });
    if (x >= 4 && onBf(G, pick)) grantKw(G, pick, ['haste']);
  }, { score: (G, P, X) => (P.library.concat(P.gy).some((c) => c.def.types.includes('Artifact') && c.def.types.includes('Creature')) ? 2 + ((X && X.x) || 0) : -2) })];
  d.castIf = (G, P) => P.library.concat(P.gy).some((c) => c.def.types.includes('Artifact') && c.def.types.includes('Creature'));
  return d;
};
S['War Machine, Legacy of Iron'] = (d) => {
  d.trig.push(T('combatStart', { you: true, eff: [{ k: 'pumpT', pFn: (G, X) => Math.max(0, pow(X.src)), p: 1, t: 0, tFn: () => 0, tgt: { f: { side: 'you' }, other: true } }] }));
  return d;
};
S['Winter Soldier, Icy Assassin'] = (d) => {
  d.statics.push({ who: 'self', p: 0, t: 0, kw: [], pFn: (G, src) => 2 * equipmentOn(G, src).length });
  d.gyActs = [{ cost: { m: C('{3}{W}{B}') }, label: 'Return with a finality counter', when: ['main2', 'end'],
    run: (G, X) => {
      const P = X.P, c = X.src;
      if (!P.gy.includes(c)) return;
      P.gy.splice(P.gy.indexOf(c), 1);
      emit(G, 'raise', `${c.def.name} returns to the battlefield with a finality counter.`, { who: P.i, cards: [c.id] });
      enterBattlefield(G, P, c, null, { ctr: { finality: 1 } });
      const eqs = P.bf.filter(isEquip);
      const e = pickSome(G, P, eqs, 0, 1, `Attach an Equipment to ${c.def.name}?`, () => 1)[0];
      if (e && onBf(G, c)) attach(G, e, c);
    }, ai: () => ({ score: 2.5 }) }];
  return d;
};
S['Wolverine, Fierce Fighter'] = (d) => {
  d.healOnHit = true;
  d.etb = [fn((G, X, t) => { const c = t && t.c; if (c && onBf(G, c) && onBf(G, X.src)) L.fightCards(G, X.P, X.src, c); },
    { tgt: { f: {}, min: 0, other: true }, val: (G, P, c, X) => { if (c.ctrl === P.i) return -2; const me = X && X.src; const kills = me ? pow(me) >= L.lethalTo(c) : false; const dies = me ? pow(c) >= tou(me) : false; return (kills ? cv(c) : 0) - (dies ? 3 : 0); }, label: 'Fight up to one other creature' })];
  return d;
};
S['Worlds Within Worlds'] = (d) => {
  d.spell = [fn((G, X) => {
    const gone = [];
    for (const c of allCreatures(G)) { if (!c.token) gone.push(c); exilePermanent(G, X.P, c); }
    for (const Q of [X.P, X.O]) {
      const cs = Q.hand.filter((c) => c.def.types.includes('Creature'));
      const put = isHuman(G, Q) ? pickSome(G, Q, cs, 0, cs.length, 'Put any number of creature cards from your hand onto the battlefield', () => 1, 'hand') : cs;
      for (const c of put) { Q.hand.splice(Q.hand.indexOf(c), 1); emit(G, 'enter', `${Q.name} puts ${c.def.name} onto the battlefield.`, { who: Q.i, card: c.id }); enterBattlefield(G, Q, c, null, {}); }
    }
    for (const c of gone) { const O = G.players[c.owner]; if (!O.exile.includes(c)) continue; O.exile.splice(O.exile.indexOf(c), 1); O.hand.push(c); }
    if (gone.length) emit(G, 'bounce', `${nameList(gone)} return${gone.length === 1 ? 's' : ''} to ${gone.length === 1 ? 'its' : 'their'} owner's hand.`, { who: X.P.i, cards: gone.map((c) => c.id) });
    const me = X.src, P = X.P;
    if (P.gy.includes(me)) { P.gy.splice(P.gy.indexOf(me), 1); P.exile.push(me); }
    dirty(G);
  }, { score: (G, P) => other(G, P).bf.filter(isCreature).reduce((s, c) => s + cv(c) * (c.token ? 1 : 0.5), 0) - P.bf.filter(isCreature).reduce((s, c) => s + (c.token ? cv(c) : 0.3), 0) + P.hand.filter((c) => c.def.types.includes('Creature')).reduce((s, c) => s + c.def.mv * 0.4, 0) })];
  return d;
};

/* ============================ Artifacts ============================ */
S['Arc Reactor'] = (d) => { d.improvise = true; d.etbTapped = true; d.mana = null; d.manaAbs = [{ colors: ['C'], amount: 3 }]; return d; };
S["Captain America's Shield"] = (d) => {
  d.trig.push(T('attack', { cond: (G, src, ev) => src.att === ev.c.id, eff: [{ k: 'tapP', tgt: { f: { side: 'opp' } } }] }));
  return d;
};
S['Cosmic Cube'] = (d) => {
  d.trig.push(T('attacks', { you: true, run: (G, X) => {
    const P = X.P;
    const top = P.library.splice(Math.max(0, P.library.length - 6)).reverse();
    if (!top.length) return;
    const maxP = Math.max(0, ...X.ev.cs.filter((c) => onBf(G, c)).map((c) => pow(c)));
    const ok = top.filter((c) => !c.def.types.includes('Land') && c.def.mv <= maxP);
    emit(G, 'search', `${P.name} looks at the top ${top.length} cards of their library.`, { who: P.i });
    const pick = pickSome(G, P, ok, 0, 1, `Cast a spell with mana value ${maxP} or less without paying its mana cost`, (c) => c.def.value + c.def.mv * 0.4, 'library', 'look')[0];
    const rest = top.filter((c) => c !== pick);
    G.rng.shuffle(rest); P.library.unshift(...rest); dirty(G);
    if (pick) { P.exile.push(pick); if (!L.castNow(G, P, pick, { free: true, ask: false })) { P.exile.splice(P.exile.indexOf(pick), 1); P.library.unshift(pick); } }
  } }));
  return d;
};
S['H.E.R.B.I.E. Scout Unit'] = (d) => {
  d.etb = [{ k: 'draw', n: 1 }, fn((G, X) => {
    const P = X.P, lands = P.hand.filter(isLand);
    const c = pickSome(G, P, lands, 0, 1, 'Put a land card from your hand onto the battlefield tapped', () => 1, 'hand')[0];
    if (!c) return;
    P.hand.splice(P.hand.indexOf(c), 1);
    emit(G, 'land', `${P.name} puts ${c.def.name} onto the battlefield tapped.`, { who: P.i, card: c.id });
    enterBattlefield(G, P, c, null, { tapped: true });
  }, { score: (G, P) => (P.hand.some(isLand) ? 1.2 : 0.2) })];
  return d;
};
S['Iron Man Armor'] = (d) => {
  d.etb = [attachE()];
  d.acts.push({ cost: { m: C('{2}') }, label: 'Become a 0/0 Construct Hero with flying (+1/+1 for each artifact) until end of turn', when: ['main1', 'blocks'],
    cond: (G, P, c) => !isCreature(c),
    run: (G, X) => { const c = X.src, n = nArt(X.P); c.att = null; c.tf.animated = true; c.base = { p: n, t: n, eot: true }; if (!c.tkw.includes('flying')) c.tkw.push('flying'); dirty(G); emit(G, 'pump', `${c.def.name} becomes a ${n}/${n} Construct Hero artifact creature with flying until end of turn.`, { who: X.P.i, cards: [c.id] }); },
    ai: (G, P, c, when) => (when === 'main1' && c.att == null && nArt(P) >= 3 && !c.sick ? { score: nArt(P) * 0.6 } : null) });
  return d;
};
S['Super-Adaptoid'] = (d) => {
  d.power = 1;
  d.powFn = (G, c) => G.players[c.ctrl].bf.filter((x) => isCreature(x) && isLegendary(x)).length;
  const KW = ['haste', 'flying', 'first strike', 'double strike', 'deathtouch', 'indestructible', 'lifelink', 'menace', 'reach', 'trample', 'vigilance'];
  const adapt = fn((G, X, t) => { const c = t && t.c, me = X.src; if (!c || !onBf(G, me)) return; for (const k of KW) if (has(c, k) && !has(me, k)) addCounters(G, me, 1, k); },
    { tgt: { f: {}, other: true }, val: (G, P, c, X) => KW.filter((k) => has(c, k) && !(X && X.src && has(X.src, k))).reduce((s, k) => s + (L.KW_VALUE[k] || 0.5), 0) + 0.05, label: 'Choose another creature to adapt to' });
  d.etb = [adapt];
  d.trig.push(T('attack', { self: true, eff: [adapt] }));
  return d;
};
S['The Ten Rings'] = (d) => {
  d.maxHand = 10;
  d.trig.push(T('endStep', { you: true, cond: (G, src, ev, Q) => Q.hand.length < 10, run: (G, X) => drawN(G, X.P, 10 - X.P.hand.length) }));
  return d;
};
S['Ultron, Artificial Malevolence'] = (d) => {
  d.trig.push(T('enter', { you: true, cond: (G, src, ev) => ev.c !== src && !ev.c.token && isArtifact(ev.c), run: (G, X) => {
    const P = X.P, c = X.ev.c;
    if (!canPay(P, L.genericCost(2))) return;
    if (isHuman(G, P) ? !yesNo(G, P, X.src, `Pay {2} to create a token copy of ${c.def.name}?`, true) : false) return;
    if (!pay(P, L.genericCost(2))) return;
    const base = c.def;
    const over = base.types.includes('Creature') ? {} : { types: [...new Set(base.types.concat('Creature'))], sub: [...new Set(base.sub.concat(['Robot', 'Villain']))], power: 2, toughness: 2 };
    copyToken(G, P, base, { def: over });
    emit(G, 'token', `${P.name} creates a token copy of ${base.name}.`, { who: P.i });
  } }));
  return d;
};
S['Ultron Drone'] = (d) => setPU(d, '{6}', { run: (G, X) => { addCounters(G, X.src, 2); mk(G, X.P, ROBOT_VILLAIN, 1); }, ai: puAi(3) });
S['The Vision'] = (d) => {
  const choices = [
    { label: 'Solar Beam: double strike', run: (G, X) => grantKw(G, X.src, ['double strike']), ai: (G, X) => (X.src.attacking || X.src.blocking ? 2 : G.active === X.P.i && G.combatTurn !== G.turn ? 0.9 : 0.1) },
    { label: 'Density Control: indestructible', run: (G, X) => grantKw(G, X.src, ['indestructible']), ai: (G, X) => (X.src.blocking || X.src.attacking ? 1.5 : 0.2) },
    { label: 'Technopathy: draw a card', run: (G, X) => drawN(G, X.P, 1), ai: () => 1.2 },
  ];
  d.trig.push(castNC({ run: (G, X) => {
    const mem = X.src.mem;
    if (mem.visT !== G.turn) { mem.visT = G.turn; mem.vis = []; }
    const left = choices.filter((c) => !mem.vis.includes(c.label));
    if (!left.length) return;
    const pick = isHuman(G, X.P) ? left[chooseMode(G, X.P, X.src, `${X.src.def.name}: choose one`, left.map((c) => c.label), 0)] : left.slice().sort((a, b) => b.ai(G, X) - a.ai(G, X))[0];
    mem.vis.push(pick.label);
    emit(G, 'info', `${X.src.def.name}: ${pick.label}.`, { who: X.P.i, card: X.src.id });
    pick.run(G, X);
  } }));
  return d;
};
S['Viv Vision, Teen Synthezoid'] = (d) => {
  d.trig.push(T('attack', { self: true, cond: (G, src) => pow(src) >= 4, run: (G, X) => drawN(G, X.P, 1) }));
  return setPU(d, '{7}', { run: (G, X) => addCounters(G, X.src, 2), ai: puAi(2.8) });
};

/* ============================ Lands ============================ */
const basicHere = (G, c, P) => c.inTurn === G.turn || P.bf.some((x) => isLand(x) && x.def.supertypes.includes('Basic'));
const painless = (a, b) => (d) => { d.mana = null; d.manaAbs = [{ colors: ['C'] }, { colors: [a, b], cond: basicHere }]; return d; };
S['Dark Fortress'] = painless('B', 'R');
S['Gathering Place'] = painless('G', 'W');
S['Gleaming Bastion'] = painless('W', 'U');
S['Hidden Lair'] = painless('U', 'B');
S['Training Compound'] = painless('R', 'G');
const ANYC = ['W', 'U', 'B', 'R', 'G'];
S['Avengers Tower'] = (d) => {
  d.mana = null;
  d.manaAbs = [{ colors: ['C'] }, { colors: ANYC, only: (p) => (!!p.def && p.def.sub.includes('Hero')) || (!!p.ability && !!p.src && hasSub(p.src, 'Hero')) }];
  d.acts.push({ cost: { m: C('{4}'), tap: true }, label: 'Look at the top three cards; take a Hero', when: ['end', 'main2'],
    run: (G, X) => lookTake(G, X.P, 3, (c) => c.def.sub.includes('Hero'), 1, 'Put a Hero card into your hand'), ai: () => ({ score: 1.1 }) });
  return d;
};
S['Baxter Building'] = (d) => {
  d.mana = null;
  d.manaAbs = [{ colors: ['C'] }, { colors: ANYC, amount: 4, conv: 4 }];
  d.acts.push({ cost: { m: C('{4}'), tap: true }, label: 'Draw a card', when: ['end', 'main2'], cond: (G, P) => P.bf.some((c) => isCreature(c) && tou(c) >= 4),
    eff: [{ k: 'draw', n: 1 }] });
  return d;
};
S['Castle Doom'] = (d) => {
  d.mana = null;
  d.manaAbs = [{ colors: ['C'] }, { colors: ANYC, only: (p) => !!p.def && p.def.types.includes('Artifact') }];
  d.acts.push({ cost: { m: C('{3}'), tap: true, sac: { f: { types: ['Artifact'] }, label: 'an artifact' } }, sorcery: true, label: 'Create a 3/3 Doombot', eff: [mkE(DOOMBOT, 1)] });
  return d;
};
S['Surveillance Room'] = (d) => {
  d.etb = [{ k: 'surveil', n: 1 }];
  d.mana = null;
  d.manaAbs = [{ colors: ['C'] }, { colors: ANYC, conv: 1 }];
  return d;
};
S['Villainous Hideout'] = (d) => {
  d.mana = null;
  d.manaAbs = [{ colors: ['C'] }, { colors: ANYC, only: (p) => (!!p.def && p.def.sub.includes('Villain')) || (!!p.ability && !!p.src && hasSub(p.src, 'Villain')) }];
  d.acts.push({ cost: { m: C('{3}'), tap: true }, sorcery: true, label: 'A Villain you control connives', when: ['main2'],
    eff: [fn((G, X, t) => { const c = t && t.c; if (c && onBf(G, c)) connive(G, X.P, c); }, { tgt: { f: { side: 'you', sub: 'Villain' } }, val: () => 1.1, label: 'A Villain you control connives' })] });
  return d;
};

/* @@MORE@@ */
// The vocabulary above, shared with the Marvel Super Heroes Jumpstart cards (mshjmp.js)
A.lib.mshKit = { ALIEN, ANYC, C, CLUE, DOOMBOT, GALACTUS, HARMFUL, HERO, INSECT, LEVIATHAN, MERFOLK, MOLOID, REDWING, ROBOT_VILLAIN, SOLDIER, SQUIRREL, STURDY_SHIELD, T, TIGER_GOD, VILLAIN, VOID, WALL, YOU, OPP, ZABU, alone, aloneSelf, attachE, attackingAlone, backScore, basicHere, batchOnce, becomeCopy, blackSymbols, blueSymbols, castAtMine, castNC, chooseOne, copyToken, copyUntilNextTurn, creGy, ctrEach, ctx0, discardE, drain, draw2, drawN, edictOf, exileTilEnd, fn, gain, grantKw, gyThisTurn, harness, harnessed, heroes, hit, hitOpp, holdUntilLeaves, impulse, impulseE, isEquip, legalFor, lone, lookTake, loseLife, mk, mkE, myTurn, nArt, nCre, nonCre, painless, permCard, pickOne, pickSome, plan, planOn, pu, puAi, pump, sacOrDiscardDraw, say, setPU, stripAbilities, targetsMine, tcs, tg, toLibrary, tokSpec, tokVal, turnOver, twBoth, twSpell, unCopy, untap, untilMyNextEnd, villainEnters, villains };
return S;
});
