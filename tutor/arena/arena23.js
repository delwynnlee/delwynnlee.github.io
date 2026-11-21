/* The 2023 MTG Arena starter decks (Arcane Aggression, Charging Ahead, Grave Secrets, Growing Hope, High-Flying Valor,
   Legions of Phyrexia, Rebel Armory, Savage Salvagers, Scrapyard Sacrifice, Sylvan Wisdom): rules for the cards the engine's
   reader can't handle on its own. They bring Phyrexia: All Will Be One, The Brothers' War and March of the Machine
   (incubate, For Mirrodin!, oil counters, unearth, kicker, meld) and Arena's own Alchemy cards (perpetual changes,
   conjure, seek, spellbooks, boons). Built from msh.js's and core.js's shared helpers, so it loads after core.js. */
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
  addCounters, removeCounters, ctrCount, chooseMode, isHuman, yesNo, bounceCard, destroyPermanent, exilePermanent, putOntoBattlefield, enterBattlefield,
  scryChoice, targetList, allTargets, emit, mill, searchLibrary, nameList, gainControl, sacrifice, makeTokens, discardChoice, damageCreature, canPay, pay,
  lethalTo, pickCards, isIS, castNow, exileUntil, handValue, surveil, equipmentOn, conjure, draft, seek, incubate, proliferate, addBoon, transform } = L;
const { C, T, fn, tg, YOU, OPP, drawN, edictOf, gain, grantKw, hit, hitOpp, loseLife, mk, mkE, pickOne, pickSome, pump, say, ctx0, holdUntilLeaves, copyToken,
  untap, castNC, chooseOne, discardE, drain, impulse, untilMyNextEnd, ctrEach, permCard, lookTake } = L.mshKit;
const { tok, kicker, lookFor, sacCost, dieGrant } = L.coreKit;
const S = {};

/* ---------- Shared pieces ---------- */
const SOLDIER_A = tok('Soldier', 1, 1, [], ['Soldier'], [], { artifact: true });
const ZOMBIE_A = tok('Zombie', 3, 3, [], ['Zombie'], [], { artifact: true });
const CAT = tok('Cat', 2, 2, ['W'], ['Cat']);
const BEAR = tok('Bear', 2, 2, ['G'], ['Bear']);
const PHYREXIAN_GOBLIN = tok('Phyrexian Goblin', 1, 1, ['R'], ['Phyrexian', 'Goblin']);
const RAGAVAN = tok('First Mate Ragavan', 2, 1, ['R'], ['Monkey', 'Pirate'], [], { legendary: true });
const castIS = (o) => T('cast', Object.assign({ you: true, cond: (G, src, ev) => !!ev.card && isIS(ev.card.def) }, o));
const kicked = (X) => !!(X.item && X.item.mode && X.item.mode.includes(1));
// Kicker on a permanent: cast it plain or kicked; ai: the AI's bonus for kicking (null: don't)
function kickerPerm(d, cost, label, ai) {
  d.modes = [{ label: 'Without kicker' }, { label: `Kicked: ${label}`, cost: typeof cost === 'string' ? C(cost) : undefined, addCost: typeof cost === 'string' ? undefined : cost, ai: ai || (() => 1) }];
  return d;
}
const phyrexian = (c) => hasSub(c, 'Phyrexian');
const soldier = (c) => hasSub(c, 'Soldier');
const count = (P, pred) => P.bf.filter(pred).length;
const isGyIS = (c) => isIS(c.def);
// Painlands ({T}: {C}; {T}: one of two colors, and 1 damage to you) and fastlands (tapped unless you control two or fewer other lands)
const painland = (a, b) => (d) => { d.mana = null; d.manaAbs = [{ colors: ['C', a, b], painOnColor: true, life: 1 }]; d.role = 'land'; return d; };
const fastland = (a, b) => (d) => { d.mana = [a, b]; d.tappedUnless = (G, P) => P.bf.filter(isLand).length - 1 <= 2; d.role = 'land'; return d; };
// "Mill three cards. You may put a ___ card from among them into your hand. If you don't, put a +1/+1 counter on this creature."
const millTake = (pred, why) => fn((G, X) => {
  const P = X.P, got = mill(G, P, 3).filter(pred);
  const pick = got.length ? (isHuman(G, P) ? pickSome(G, P, got, 0, 1, why, () => 1, 'graveyard')[0] : got.slice().sort((a, b) => b.def.value - a.def.value)[0]) : null;
  if (pick && P.gy.includes(pick)) { P.gy.splice(P.gy.indexOf(pick), 1); P.hand.push(pick); dirty(G); emit(G, 'raise', `${P.name} puts ${pick.def.name} into their hand.`, { who: P.i, cards: [pick.id] }); }
  else if (onBf(G, X.src)) addCounters(G, X.src, 1);
}, { score: () => 1.2 });
// "Exile ___ until this leaves the battlefield" on entering
const exileHold = (d, f, label) => {
  d.etb = [fn((G, X, t) => { if (t && t.c) exileUntil(G, X.P, X.src, t.c); }, { tgt: { f }, val: (G, P, c) => (c.ctrl === P.i ? -pv(G, c) - 2 : pv(G, c) + 0.5), label })];
  d.role = 'removal';
  return holdUntilLeaves(d);
};
// Return a card from a graveyard to hand (or the battlefield)
function fromGy(G, P, c, to = 'hand', opts = {}) {
  const Q = G.players.find((q) => q.gy.includes(c));
  if (!Q) return false;
  Q.gy.splice(Q.gy.indexOf(c), 1);
  if (to === 'hand') { P.hand.push(c); dirty(G); emit(G, 'raise', `${P.name} returns ${c.def.name} to hand.`, { who: P.i, cards: [c.id] }); }
  else { emit(G, 'raise', `${c.def.name} returns to the battlefield.`, { who: P.i, cards: [c.id] }); enterBattlefield(G, P, c, null, Object.assign({ from: 'gy' }, opts)); if (opts.tapped) c.tapped = true; }
  return true;
}
// A graveyard ability: "{cost}, Exile this card from your graveyard: ..."
const gyExile = (cost, label, run, ai, sorcery = true) => ({ cost: { m: C(cost), exileSelf: true }, sorcery, label, run, when: ['main1', 'main2', 'end'], ai: ai || (() => ({ score: 1 })) });
// Perpetual changes (Alchemy): they follow the card from zone to zone
const perp = (c) => (c.perp = c.perp || {});
function perpPump(G, c, p, t, kws = [], why) {
  const x = perp(c);
  x.p = (x.p || 0) + p; x.t = (x.t || 0) + t;
  if (kws.length) x.kw = [...new Set((x.kw || []).concat(kws))];
  dirty(G);
  emit(G, 'pump', `${c.def.name} perpetually gets ${p >= 0 ? '+' : ''}${p}/${t >= 0 ? '+' : ''}${t}${kws.length ? ` and gains ${kws.join(' and ')}` : ''}${why ? ` (${why})` : ''}.`, { who: c.ctrl != null ? c.ctrl : c.owner, cards: [c.id] });
}
// A card exiled that its controller may play until a given turn ends
function playable(G, P, c, until, free) {
  P.xcast.push(Object.assign({ card: c, until }, free ? { free: true } : null));
  dirty(G);
}
// The equipment on a creature
const gearOf = (G, c) => equipmentOn(G, c);
const equipped = (G, c) => gearOf(G, c).length > 0;
// "Attach target Equipment you control to that creature"
const attachE = (G, eq, c) => { if (eq && c && onBf(G, eq) && onBf(G, c)) attach(G, eq, c); };
// Spellbooks (Alchemy): the fifteen cards a draft chooses three from
const SPELLBOOK = {
  cleaver: ['Accorder Paladin', 'Ardent Recruit', 'Auriok Sunchaser', 'Blade-Tribe Berserkers', 'Goblin Gaveleer', 'Hero of Bladehold', 'Hero of Oxid Ridge', 'Jor Kadeen, the Prevailer',
    'Mirran Crusader', 'Oxidda Scrapmelter', 'Sunspear Shikari', 'Oxidda Finisher', 'Barbed Batterfist', 'Bladehold War-Whip', 'Dragonwing Glider'],
  march: ['Entomber Exarch', 'Phyrexian Fleshgorger', 'Phyrexian Gargantua', 'Phyrexian Obliterator', 'Phyrexian Rager', 'Phyrexian Revoker', 'Toxic Abomination', 'Vault Skirge',
    'Scrapwork Rager', 'Bilious Skulldweller', 'Archfiend of the Dross', 'Myr Convert', 'Zenith Chronicler', 'Soulless Jailer', 'Diminished Returner'],
};

/* ============================================================ Lands */
S['Battlefield Forge'] = painland('R', 'W');
S['Caves of Koilos'] = painland('W', 'B');
S['Llanowar Wastes'] = painland('B', 'G');
S['Shivan Reef'] = painland('U', 'R');
S['Sulfurous Springs'] = painland('B', 'R');
S['Yavimaya Coast'] = painland('G', 'U');
S['Copperline Gorge'] = fastland('R', 'G');
S['Darkslick Shores'] = fastland('U', 'B');
S['Razorverge Thicket'] = fastland('G', 'W');
S['Fortified Beachhead'] = (d) => {
  d.mana = ['W', 'U'];
  d.tappedUnless = (G, P) => P.bf.some((c) => isCreature(c) && soldier(c)) || P.hand.some((c) => c.def.sub.includes('Soldier'));
  d.acts.push({ cost: { m: C('{5}'), tap: true }, label: 'Soldiers you control get +1/+1 until end of turn', when: ['blocks'],
    run: (G, X) => { const cs = X.P.bf.filter((c) => isCreature(c) && soldier(c)); cs.forEach((c) => { c.tp++; c.tt++; }); dirty(G); emit(G, 'pump', `${X.P.name}'s Soldiers get +1/+1 until end of turn.`, { who: X.P.i, cards: cs.map((c) => c.id) }); },
    ai: (G, P) => (P.bf.filter((c) => isCreature(c) && soldier(c) && (c.attacking || c.blocking)).length >= 2 ? { score: 1.5 } : null) });
  d.role = 'land';
  return d;
};

/* ============================================================ White */
S['Aeronaut Cavalry'] = (d) => { d.etb = [{ k: 'ctrs', n: 1, tgt: { f: { side: 'you', other: true, sub: 'Soldier' }, min: 0 } }]; return d; };
S['Alabaster Host Intercessor'] = (d) => exileHold(d, { side: 'opp' }, 'Exile a creature an opponent controls');
S['Citizen\'s Arrest'] = (d) => exileHold(d, { side: 'opp', types: ['Creature', 'Planeswalker'] }, 'Exile a creature or planeswalker an opponent controls');
S['Benalish Knight-Counselor'] = (d) => {
  // Enlist: tap a creature that isn't attacking to add its power; doing so gives a boon
  d.trig.push(T('attack', { self: true, run: (G, X) => {
    const P = X.P, cs = P.bf.filter((c) => c !== X.src && isCreature(c) && !c.tapped && !c.attacking && (!c.sick || has(c, 'haste')));
    if (!cs.length) return;
    const best = cs.slice().sort((a, b) => pow(b) - pow(a))[0];
    const want = isHuman(G, P) ? yesNo(G, P, X.src, 'Enlist: tap a creature that isn\'t attacking to add its power?', true) : pow(best) >= 2 && cv(best) < 4;
    if (!want) return;
    const c = isHuman(G, P) ? pickOne(G, P, cs, 'Enlist which creature?', (x) => pow(x)) : best;
    c.tapped = true;
    pump(G, X.src, Math.max(0, pow(c)), 0);
    addBoon(G, P, 'the next creature you cast enters with a +1/+1 counter', T('cast', { you: true, cond: (GG, s, ev) => !!ev.card && ev.card.def.types.includes('Creature'), run: (GG, XX) => { XX.ev.card.finCtr = (XX.ev.card.finCtr || 0) + 1; } }));
  } }));
  return d;
};
S['Benalish Sleeper'] = (d) => {
  kickerPerm(d, '{B}', 'each player sacrifices a creature', (G, P) => { const O = other(G, P); const mine = P.bf.filter(isCreature), theirs = O.bf.filter(isCreature); return theirs.length && (!mine.length || Math.min(...mine.map((c) => pv(G, c))) < Math.max(...theirs.map((c) => cv(c)))) ? 2 : null; });
  d.etb = [fn((G, X) => { if (!kicked(X)) return; for (const Q of [X.P, X.O]) edictOf(G, Q, null, X.src.def.name); }, { score: () => 0 })];
  return d;
};
S['By Elspeth\'s Command'] = (d) => {
  const MODES = ['Up to one Soldier perpetually gets +1/+1 and flying', 'A Soldier card in your hand perpetually gets +1/+1 and vigilance', 'Create a 1/1 Soldier artifact creature token'];
  d.trig.push(T('combatStart', { you: true, run: (G, X) => {
    const P = X.P, src = X.src;
    const ok = [0, 1, 2].filter((k) => k !== src.mem.lastMode);
    const soldiers = P.bf.filter((c) => isCreature(c) && soldier(c)), inHand = P.hand.filter((c) => c.def.sub.includes('Soldier'));
    const score = (k) => (k === 0 ? (soldiers.length ? 2 : -1) : k === 1 ? (inHand.length ? 1.5 : -1) : 1.2);
    const k = isHuman(G, P) ? ok[chooseMode(G, P, src, 'By Elspeth\'s Command: choose one that wasn\'t chosen last combat', ok.map((j) => MODES[j]), 0)] : ok.slice().sort((a, b) => score(b) - score(a))[0];
    src.mem.lastMode = k;
    if (k === 0) { const c = pickOne(G, P, soldiers, 'Choose a Soldier', (x) => cv(x) + (has(x, 'flying') ? -1 : 1)); if (c) perpPump(G, c, 1, 1, ['flying']); }
    else if (k === 1) { const c = pickOne(G, P, inHand, 'Choose a Soldier card in your hand', (x) => x.def.value, 'choose', 'hand'); if (c) perpPump(G, c, 1, 1, ['vigilance']); }
    else mk(G, P, SOLDIER_A, 1);
  } }));
  return d;
};
S['Dusk Legion Duelist'] = (d) => { d.trig.push(T('counters', { self: true, once: true, cond: (G, src, ev) => ev.kind === '+1/+1', eff: [{ k: 'draw', n: 1 }] })); return d; };
S['Essence of Orthodoxy'] = (d) => {
  d.trig.push(T('enter', { you: true, cond: (G, src, ev) => ev.c === src || (isCreature(ev.c) && phyrexian(ev.c)), eff: [{ k: 'incubate', n: 2 }] }));
  return d;
};
S['Harbin, Vanguard Aviator'] = (d) => {
  d.trig.push(T('attacks', { you: true, cond: (G, src, ev) => ev.cs.filter(soldier).length >= 5, eff: [{ k: 'pumpAll', side: 'you', p: 1, t: 1, kw: ['flying'] }] }));
  return d;
};
S['Infected Defector'] = (d) => { d.dies = [{ k: 'incubate', n: 3 }]; return d; };
S['Juniper Order Rootweaver'] = (d) => {
  kickerPerm(d, '{G}', 'a +1/+1 counter on a creature you control', () => 1);
  d.etb = [Object.assign({ k: 'ctrs', n: 1, tgt: { f: { side: 'you' }, min: 0 } }, { if: (G, X) => kicked(X) })];
  return d;
};
S['Kemba, Kha Enduring'] = (d) => {
  d.trig.push(T('enter', { you: true, cond: (G, src, ev) => ev.c === src || (isCreature(ev.c) && hasSub(ev.c, 'Cat')), run: (G, X) => {
    const P = X.P, c = X.ev.c, gear = P.bf.filter((x) => hasSub(x, 'Equipment'));
    if (!gear.length || !onBf(G, c)) return;
    const eq = isHuman(G, P) ? pickSome(G, P, gear, 0, 1, `Attach an Equipment to ${c.def.name}?`, () => 1)[0] : gear.find((x) => x.att == null) || null;
    if (eq) attachE(G, eq, c);
  } }));
  d.statics.push({ who: 'all', f: { side: 'you', fn: (G, c) => equipped(G, c) }, p: 1, t: 1, kw: [] });
  d.acts.push({ cost: { m: C('{3}{W}{W}') }, label: 'Create a 2/2 Cat', eff: [mkE(CAT, 1)], when: ['end', 'main2'], ai: () => ({ score: 1.4 }) });
  return d;
};
S['Kemba\'s Outfitter'] = (d) => {
  d.etb = [fn((G, X) => {
    const P = X.P, inHand = P.hand.filter((c) => c.def.sub.includes('Equipment')), onField = P.bf.filter((c) => hasSub(c, 'Equipment'));
    const opts = [];
    if (inHand.length) opts.push(['An Equipment card in your hand perpetually gains equip {1}', inHand, 'hand']);
    if (onField.length) opts.push(['An Equipment you control perpetually gains equip {1}', onField, 'battlefield']);
    if (!opts.length) return;
    const k = isHuman(G, P) && opts.length > 1 ? chooseMode(G, P, X.src, 'Kemba\'s Outfitter: choose one', opts.map((o) => o[0]), 0) : 0;
    const [, cs, zone] = opts[k];
    const c = pickOne(G, P, cs, 'Choose an Equipment', (x) => x.def.value, 'choose', zone);
    if (!c) return;
    perp(c).equip = C('{1}');
    emit(G, 'pump', `${c.def.name} perpetually gains equip {1}.`, { who: P.i, cards: [c.id] });
  }, { score: () => 0.6 })];
  return d;
};
S['Lay Down Arms'] = (d) => {
  d.spell = [fn((G, X, t) => { const c = t && t.c; if (!c || !onBf(G, c)) return; const Q = G.players[c.ctrl]; exilePermanent(G, X.P, c); gain(G, Q, 3); },
    { tgt: { f: { fn: (G, c, P) => c.def.mv <= count(P, (x) => isLand(x) && x.def.sub.includes('Plains')) } }, val: (G, P, c) => (c.ctrl === P.i ? -5 : cv(c) + 0.5), label: 'Exile a creature' })];
  d.role = 'removal';
  return d;
};
S['Myrel, Shield of Argive'] = (d) => {
  d.silenceOpp = true;
  d.trig.push(T('attack', { self: true, run: (G, X) => mk(G, X.P, SOLDIER_A, count(X.P, (c) => isCreature(c) && soldier(c))) }));
  return d;
};
S['Norn\'s Inquisitor'] = (d) => {
  d.etb = [{ k: 'incubate', n: 2 }];
  d.trig.push(T('transform', { you: true, cond: (G, src, ev) => !!ev.to && (ev.to.sub || []).includes('Phyrexian'), run: (G, X) => addCounters(G, X.ev.c, 1) }));
  return d;
};
S['Ossification'] = (d) => {
  d.aura = { f: { types: ['Land'], side: 'you', fn: (G, c) => c.def.supertypes.includes('Basic') }, perm: true };
  d.auraVal = (G, P, c) => (c.ctrl === P.i ? 1 + (c.tapped ? 0.2 : 0) + (other(G, P).bf.some(isCreature) ? 2 : -3) : -5);
  return exileHold(d, { side: 'opp', types: ['Creature', 'Planeswalker'] }, 'Exile a creature or planeswalker an opponent controls');
};
S['Patchplate Resolute'] = (d) => {
  const boon = (G, X) => addBoon(G, X.P, 'the next creature you cast enters with an additional +1/+1 counter', T('cast', { you: true, cond: (GG, s, ev) => !!ev.card && ev.card.def.types.includes('Creature'), run: (GG, XX) => { XX.ev.card.finCtr = (XX.ev.card.finCtr || 0) + 1; } }));
  d.etb = [fn(boon, { score: () => 0.6 })];
  d.trig.push(T('leave', { self: true, run: boon }));
  return d;
};
S['Phyrexian Awakening'] = (d) => { d.etb = [{ k: 'incubate', n: 4 }]; d.statics.push({ who: 'all', f: { side: 'you', sub: 'Phyrexian' }, p: 0, t: 0, kw: ['vigilance'] }); return d; };
S['Phyrexian Missionary'] = (d) => {
  kickerPerm(d, '{1}{B}', 'return a creature card from your graveyard to your hand', (G, P) => (P.gy.some((c) => c.def.types.includes('Creature')) ? 1.5 : null));
  d.etb = [Object.assign({ k: 'regrow', tgt: { what: 'gy', mine: true, f: { types: ['Creature'] }, min: 0 } }, { if: (G, X) => kicked(X) })];
  return d;
};
// Pacifism-style Auras that also stop activated abilities
const lockAura = (d) => {
  d.statics = d.statics.filter((x) => x.who !== 'enchanted');
  d.statics.push({ who: 'enchanted', p: 0, t: 0, kw: [], flags: { cantAttack: true, cantBlock: true, noActs: true } });
  d.auraVal = (G, P, c) => (c.ctrl === P.i ? -pv(G, c) - 2 : pv(G, c) * 0.9 + 0.3);
  d.role = 'removal';
  return d;
};
S['Planar Disruption'] = (d) => { d.aura = { f: { types: ['Artifact', 'Creature', 'Planeswalker'] }, perm: true }; return lockAura(d); };
S['Prison Sentence'] = (d) => { d.etb = [{ k: 'scry', n: 2 }]; return lockAura(d); };
S['Progenitor Exarch'] = (d) => {
  d.etb = [fn((G, X) => { const n = (X.item && X.item.x) || 0; for (let k = 0; k < n; k++) incubate(G, X.P, 3); }, { score: () => 1 })];
  d.aiX = (G, P, card, max) => (max >= 1 ? max : null);
  d.acts.push({ cost: { tap: true }, label: 'Transform an Incubator token you control', when: ['main1', 'end'],
    eff: [fn((G, X, t) => { if (t && t.c) transform(G, t.c); }, { tgt: { f: { types: ['Artifact'], side: 'you', sub: 'Incubator' } }, val: (G, P, c) => (isCreature(c) ? -1 : c.cnt * 0.7), label: 'Choose an Incubator' })] });
  return d;
};
S['Recruitment Officer'] = (d) => {
  d.acts.push({ cost: { m: C('{3}{W}') }, label: 'Look at the top four cards for a creature card with mana value 3 or less', when: ['end'], eff: [lookFor(4, (c) => c.def.types.includes('Creature') && c.def.mv <= 3, 'Put a creature card with mana value 3 or less into your hand')], ai: () => ({ score: 1.2 }) });
  return d;
};
S['Rescue Retriever'] = (d) => {
  d.etb = [fn((G, X) => ctrEach(G, X.P.bf.filter((c) => c !== X.src && isCreature(c) && soldier(c)), 1), { score: (G, P) => P.bf.filter((c) => isCreature(c) && soldier(c)).length * 0.8 })];
  d.statics.push({ who: 'all', f: { side: 'you', other: true, sub: 'Soldier', attacking: true }, p: 0, t: 0, kw: [], flags: { noDamage: true } });
  return d;
};
S['Sculpted Perfection'] = (d) => { d.etb = [{ k: 'incubate', n: 2 }]; d.statics.push({ who: 'all', f: { side: 'you', sub: 'Phyrexian' }, p: 1, t: 1, kw: [] }); return d; };
S['Seedpod Caretaker'] = (d) => {
  d.etb = [chooseOne([
    { label: 'Put a +1/+1 counter on an artifact or creature you control', eff: [{ k: 'ctrs', n: 1, tgt: { f: { types: ['Artifact', 'Creature'], side: 'you' } } }] },
    { label: 'Transform an Incubator token you control', eff: [fn((G, X, t) => { if (t && t.c) transform(G, t.c); }, { tgt: { f: { types: ['Artifact'], side: 'you', sub: 'Incubator', fn: (G, c) => !isCreature(c) } }, val: (G, P, c) => 0.5 + c.cnt * 0.8, label: 'Choose an Incubator' })] },
  ])];
  return d;
};
S['Serra Redeemer'] = (d) => { d.trig.push(T('enter', { you: true, other: true, cond: (G, src, ev) => isCreature(ev.c) && pow(ev.c) <= 2, run: (G, X) => addCounters(G, X.ev.c, 2) })); return d; };
S['Shalai\'s Acolyte'] = (d) => { kickerPerm(d, '{1}{G}', 'it enters with two +1/+1 counters', () => 1.5); d.etbCtr = (G, P, card, opts) => ({ '+1/+1': opts && opts.item && opts.item.mode && opts.item.mode.includes(1) ? 2 : 0 }); return d; };
S['Siege Veteran'] = (d) => {
  d.trig.push(T('combatStart', { you: true, eff: [{ k: 'ctrs', n: 1, tgt: { f: { side: 'you' } } }] }));
  d.trig.push(T('die', { you: true, other: true, cond: (G, src, ev) => !ev.token && (ev.sub || []).includes('Soldier'), eff: [mkE(SOLDIER_A, 1)] }));
  return d;
};
S['Skystrike Officer'] = (d) => {
  d.trig.push(T('attack', { self: true, eff: [mkE(SOLDIER_A, 1)] }));
  d.acts.push({ cost: { tapCre: 3, tapCreF: soldier }, label: 'Draw a card', eff: [{ k: 'draw', n: 1 }], when: ['end'], ai: () => ({ score: 1.3 }) });
  return d;
};
S['Strength of the Coalition'] = (d) => kicker(d, '{2}{W}', { label: 'A creature you control gets +2/+2', eff: [{ k: 'pumpT', p: 2, t: 2, tgt: { f: { side: 'you' } } }] },
  { label: '+2/+2, and a +1/+1 counter on each creature you control', eff: [{ k: 'pumpT', p: 2, t: 2, tgt: { f: { side: 'you' } } }, fn((G, X) => ctrEach(G, X.P.bf.filter(isCreature), 1), { score: (G, P) => P.bf.filter(isCreature).length * 0.9 })] });
S['Survivor of Korlis'] = (d) => { d.gyActs = [gyExile('{1}{W}', 'Scry 2', (G, X) => scryChoice(G, X.P, 2), () => ({ score: 0.7 }), false)]; return d; };
S['Valiant Veteran'] = (d) => {
  d.statics.push({ who: 'all', f: { side: 'you', other: true, sub: 'Soldier' }, p: 1, t: 1, kw: [] });
  d.gyActs = [gyExile('{3}{W}{W}', 'A +1/+1 counter on each Soldier you control', (G, X) => ctrEach(G, X.P.bf.filter((c) => isCreature(c) && soldier(c)), 1), (G, P) => (P.bf.filter((c) => isCreature(c) && soldier(c)).length >= 2 ? { score: 1.5 } : null), false)];
  return d;
};

/* ============================================================ Blue */
S['Academy Wall'] = (d) => {
  d.trig.push(castIS({ once: true, run: (G, X) => { const P = X.P; if (isHuman(G, P) && !yesNo(G, P, X.src, 'Academy Wall: draw a card, then discard a card?', true)) return; drawN(G, P, 1); discardE(G, P, 1); } }));
  return d;
};
S['Chrome Host Seedshark'] = (d) => { d.trig.push(castNC({ run: (G, X) => incubate(G, X.P, X.ev.card.def.mv || 0) })); return d; };
S['Desynchronize'] = (d) => {
  d.spell = [fn((G, X, t) => {
    const c = t && t.c; if (!c || !onBf(G, c)) return;
    const Q = G.players[c.owner];
    const top = isHuman(G, Q) ? chooseMode(G, Q, c, `Put ${c.def.name} on top or on the bottom of your library?`, ['On top', 'On the bottom'], 0) === 0 : !c.token && c.def.value >= 2.5;
    L.mshKit.toLibrary(G, X, c, top ? 'top' : 'bottom');
    emit(G, 'exile', `${c.def.name} goes ${top ? 'on top of' : 'to the bottom of'} ${Q.name}'s library.`, { who: X.P.i, cards: [c.id] });
  }, { tgt: { f: { types: ['nonland'] } }, val: (G, P, c) => (c.ctrl === P.i ? -pv(G, c) : pv(G, c) * 0.8 + (c.token ? 1 : 0)), label: 'Choose a nonland permanent' }), { k: 'scry', n: 2 }];
  d.role = 'removal';
  return d;
};
S['Eyes of Gitaxias'] = (d) => { d.spell = [{ k: 'incubate', n: 3 }, { k: 'draw', n: 1 }]; return d; };
S['Ghitu Amplifier'] = (d) => {
  kickerPerm(d, '{2}{U}', 'return a creature an opponent controls to its owner\'s hand', (G, P) => (other(G, P).bf.some(isCreature) ? 1.5 : null));
  d.etb = [Object.assign({ k: 'bounceP', tgt: { f: { side: 'opp' } } }, { if: (G, X) => kicked(X) })];
  d.trig.push(castIS({ run: (G, X) => pump(G, X.src, 2, 0) }));
  return d;
};
S['Halo-Charged Skaab'] = (d) => {
  d.etb = [fn((G, X) => {
    for (const Q of G.players) mill(G, Q, 2);
    const P = X.P, cs = P.gy.filter((c) => isIS(c.def) || c.def.types.includes('Battle'));
    if (!cs.length) return;
    const c = isHuman(G, P) ? pickSome(G, P, cs, 0, 1, 'You may put an instant, sorcery, or battle card on top of your library', () => 1, 'graveyard')[0] : cs.slice().sort((a, b) => b.def.value - a.def.value)[0];
    if (!c) return;
    P.gy.splice(P.gy.indexOf(c), 1); P.library.push(c); dirty(G);
    emit(G, 'info', `${P.name} puts ${c.def.name} on top of their library.`, { who: P.i, cards: [c.id] });
  }, { score: () => 1 })];
  return d;
};
S['Haughty Djinn'] = (d) => {
  d.powFn = (G, c) => G.players[c.ctrl].gy.filter(isGyIS).length;
  d.spellDiscount = (G, P, card) => (isIS(card.def) ? 1 : 0);
  return d;
};
S['Impede Momentum'] = (d) => {
  d.spell = [fn((G, X, t) => { const c = t && t.c; if (!c || !onBf(G, c)) return; c.tapped = true; addCounters(G, c, 3, 'stun'); }, { tgt: { f: {} }, val: (G, P, c) => (c.ctrl === P.i ? -2 : cv(c) * 0.6), label: 'Tap a creature and stun it' }), { k: 'scry', n: 1 }];
  return d;
};
S['Meeting of Minds'] = (d) => { d.convoke = true; d.spell = [{ k: 'draw', n: 2 }]; return d; };
S['Meldweb Curator'] = (d) => {
  d.etb = [fn((G, X, t) => { const c = t && t.c; const P = X.P; if (!c || !P.gy.includes(c)) return; P.gy.splice(P.gy.indexOf(c), 1); P.library.push(c); dirty(G); emit(G, 'info', `${P.name} puts ${c.def.name} on top of their library.`, { who: P.i, cards: [c.id] }); },
    { tgt: { what: 'gy', mine: true, f: { types: ['Instant', 'Sorcery'] }, min: 0 }, val: (G, P, c) => 0.3 + c.def.value * 0.2, label: 'Put an instant or sorcery card on top of your library' })];
  return d;
};
S['Mercurial Spelldancer'] = (d) => {
  d.unblockable = true;
  d.trig.push(castNC({ run: (G, X) => addCounters(G, X.src, 1, 'oil') }));
  d.trig.push(T('hitPlayer', { self: true, cond: (G, src) => ctrCount(src, 'oil') >= 2, run: (G, X) => {
    const P = X.P;
    if (!P.hand.some(isGyIS) || (isHuman(G, P) && !yesNo(G, P, X.src, 'Remove two oil counters to copy your next instant or sorcery this turn?', true))) return;
    removeCounters(G, X.src, 'oil', 2);
    P.copyNext = { turn: G.turn, n: 1 };
    say(G, P, `${P.name}'s next instant or sorcery spell this turn will be copied.`, [X.src.id]);
  } }));
  return d;
};
S['Tolarian Terror'] = (d) => { d.costMod = (G, P) => P.gy.filter(isGyIS).length; return d; };
S['Trawler Drake'] = (d) => {
  d.etbCtr = () => ({ oil: 1 });
  d.statics.push({ who: 'self', pFn: (G, src) => ctrCount(src, 'oil'), tFn: (G, src) => ctrCount(src, 'oil'), kw: [] });
  d.trig.push(castNC({ run: (G, X) => addCounters(G, X.src, 1, 'oil') }));
  return d;
};
S['Zephyr Sentinel'] = (d) => {
  d.etb = [fn((G, X, t) => { const c = t && t.c; if (!c || !onBf(G, c)) return; const sold = soldier(c); bounceCard(G, X.P, c); if (sold && onBf(G, X.src)) addCounters(G, X.src, 1); },
    { tgt: { f: { side: 'you', other: true }, min: 0 }, val: (G, P, c) => (c.def.etb.length ? c.def.mv * 0.3 : -1) + (soldier(c) ? 0.8 : 0), label: 'Return another creature you control to hand' })];
  return d;
};
S['Rona\'s Vortex'] = (d) => kicker(d, '{2}{B}', { label: 'Return a creature you don\'t control to its owner\'s hand', eff: [{ k: 'bounceP', tgt: { f: { side: 'opp', types: ['Creature', 'Planeswalker'] } } }] },
  { label: 'Put it on the bottom of its owner\'s library instead', eff: [fn((G, X, t) => { if (t && t.c) L.mshKit.toLibrary(G, X, t.c, 'bottom'); }, { tgt: { f: { side: 'opp', types: ['Creature', 'Planeswalker'] } }, val: (G, P, c) => pv(G, c) + 0.5, label: 'Put a creature on the bottom of its owner\'s library' })] });
S['Vesuvan Mist'] = (d) => kicker(d, '{1}{B}', { label: 'Return a nontoken, nonland permanent to its owner\'s hand', eff: [{ k: 'bounceP', tgt: { f: { types: ['nonland'], fn: (G, c) => !c.token } } }] },
  { label: 'Return it, and conjure a duplicate of it into your hand', eff: [fn((G, X, t) => { const c = t && t.c; if (!c || !onBf(G, c)) return; const base = c.faceBase || c.def; bounceCard(G, X.P, c); conjure(G, X.P, base.front || base, 'hand'); },
    { tgt: { f: { types: ['nonland'], fn: (G, c) => !c.token } }, val: (G, P, c) => (c.ctrl === P.i ? c.def.value * 0.6 : pv(G, c) * 0.5 + c.def.value * 0.4), label: 'Return a nontoken, nonland permanent' })] });

/* ============================================================ Black */
S['Ashnod, Flesh Mechanist'] = (d) => {
  d.trig.push(T('attack', { self: true, run: (G, X) => {
    const P = X.P, cs = P.bf.filter((c) => c !== X.src && isCreature(c) && !c.attacking);
    if (!cs.length) return;
    const fodder = cs.slice().sort((a, b) => pv(G, a) - pv(G, b))[0];
    if (isHuman(G, P) ? !yesNo(G, P, X.src, 'Sacrifice another creature to create a tapped Powerstone?', false) : !(fodder.token && pv(G, fodder) < 1.6)) return;
    const c = isHuman(G, P) ? pickOne(G, P, cs, 'Sacrifice a creature', (x) => -pv(G, x)) : fodder;
    emit(G, 'sac', `${P.name} sacrifices ${c.def.name}.`, { who: P.i, cards: [c.id] });
    sacrifice(G, P, c, true);
    mk(G, P, L.POWERSTONE, 1, { tapped: true });
  } }));
  d.acts.push({ cost: { m: C('{5}') }, label: 'Exile a creature card from your graveyard: create a tapped 3/3 Zombie artifact', cond: (G, P) => P.gy.some((c) => c.def.types.includes('Creature')), when: ['end', 'main2'],
    run: (G, X) => { const P = X.P, cs = P.gy.filter((c) => c.def.types.includes('Creature')); const c = pickOne(G, P, cs, 'Exile a creature card from your graveyard', (x) => -x.def.value, 'choose', 'graveyard'); if (!c) return; P.gy.splice(P.gy.indexOf(c), 1); P.exile.push(c); dirty(G); mk(G, P, ZOMBIE_A, 1, { tapped: true }); },
    ai: () => ({ score: 1.6 }) });
  return d;
};
S['Ashnod\'s Intervention'] = (d) => {
  d.spell = [{ k: 'pumpT', p: 2, t: 0, tgt: { f: {} } }, fn((G, X) => { const c = X.last && X.last.c; if (c) dieGrant(G, c, (G2, X2) => { const card = X2.src, Q = G2.players[card.owner]; for (const z of [Q.gy, Q.exile]) if (z.includes(card)) { z.splice(z.indexOf(card), 1); Q.hand.push(card); dirty(G2); emit(G2, 'raise', `${card.def.name} returns to ${Q.name}'s hand.`, { who: Q.i, cards: [card.id] }); return; } }, 'When this creature dies, return it to its owner\'s hand'); }, { score: () => 0.4 })];
  return d;
};
S['Black Sun\'s Twilight'] = (d) => {
  d.spell = [{ k: 'pumpT', pFn: (G, X) => -(X.x || 0), tFn: (G, X) => -(X.x || 0), tgt: { f: {}, min: 0 } }, fn((G, X) => {
    const x = X.x || 0; if (x < 5) return;
    const P = X.P, cs = P.gy.filter((c) => c.def.types.includes('Creature') && c.def.mv <= x);
    const c = pickOne(G, P, cs, 'Return a creature card to the battlefield tapped', (y) => y.def.value, 'choose', 'graveyard');
    if (c) fromGy(G, P, c, 'bf', { tapped: true });
  }, { score: (G, P, X) => ((X && X.x) >= 5 ? 2 : 0) })];
  d.aiX = (G, P, card, max) => { const t = other(G, P).bf.filter((c) => isCreature(c) && tou(c) <= max).sort((a, b) => cv(b) - cv(a))[0]; return t ? Math.max(tou(t) - t.dmg, max >= 5 && P.gy.some((c) => c.def.types.includes('Creature') && c.def.mv <= max) ? max : 0) : null; };
  d.role = 'removal';
  return d;
};
S['Bloated Processor'] = (d) => {
  d.acts.push({ cost: { sac: { f: { sub: 'Phyrexian' }, label: 'another Phyrexian', prefer: (G, x) => (x.token ? 5 : 0) - pv(G, x) } }, label: 'A +1/+1 counter on it', run: (G, X) => addCounters(G, X.src, 1), when: ['blocks'],
    ai: (G, P, c) => { const fc = L.combatDoom(G); return fc && P.bf.some((x) => x !== c && phyrexian(x) && fc.dead.has(x)) ? { score: 1.2 } : null; } });
  d.dies = [{ k: 'incubate', nFn: (G, X) => Math.max(0, (X.ev && X.ev.pow) || 0) }];
  return d;
};
S['Breach the Multiverse'] = (d) => {
  d.spell = [fn((G, X) => {
    const P = X.P;
    for (const Q of G.players) mill(G, Q, 10);
    for (const Q of G.players) {
      const cs = Q.gy.filter((c) => c.def.types.includes('Creature') || c.def.types.includes('Planeswalker'));
      const c = pickOne(G, P, cs, `Choose a creature or planeswalker card in ${Q.name}'s graveyard`, (y) => y.def.value, 'choose', 'graveyard');
      if (c) fromGy(G, P, c, 'bf');
    }
    for (const c of P.bf.filter(isCreature)) c.addSubs = [...new Set((c.addSubs || []).concat('Phyrexian'))];
    dirty(G);
    say(G, P, `Each creature ${P.name} controls becomes a Phyrexian.`);
  }, { score: () => 5, value: 4 })];
  return d;
};
S['Corrupted Conviction'] = (d) => { sacCost(d); d.spell = [{ k: 'draw', n: 2 }]; return d; };
S['Cult Conscript'] = (d) => {
  d.etbTapped = true;
  d.gyActs = [{ cost: { m: C('{1}{B}') }, label: 'Return it to the battlefield', cond: (G, P) => L.diedThisTurn(G, P, (x) => !(x.sub || []).includes('Skeleton')) > 0, when: ['main2', 'end'],
    run: (G, X) => fromGy(G, X.P, X.src, 'bf'), ai: () => ({ score: 1.2 }) }];
  return d;
};
S['Diminished Returner'] = (d) => {
  d.etbTapped = true;
  d.gyActs = [{ cost: { m: C('{B}{B}') }, label: 'Perpetually -1/-1, then return it to the battlefield', cond: (G, P, c) => tou(c) >= 2, when: ['main2', 'end'],
    run: (G, X) => { perpPump(G, X.src, -1, -1); fromGy(G, X.P, X.src, 'bf'); }, ai: (G, P, c) => (tou(c) >= 2 ? { score: 1 + tou(c) * 0.2 } : null) }];
  return d;
};
S['Final Flourish'] = (d) => kicker(d, { sac: { types: ['Artifact', 'Creature'] }, sacWord: 'an artifact or creature' }, { label: 'A creature gets -2/-2', eff: [{ k: 'pumpT', p: -2, t: -2, tgt: { f: {} } }] }, { label: 'A creature gets -6/-6', eff: [{ k: 'pumpT', p: -6, t: -6, tgt: { f: {} } }] });
S['Gix, Yawgmoth Praetor'] = (d) => {
  d.trig.push(T('hitPlayer', { cond: (G, src, ev) => ev.Q && ev.Q.i !== src.ctrl, run: (G, X) => {
    const Q = G.players[X.ev.ctrl];
    if (Q.life <= 3 || (isHuman(G, Q) && !yesNo(G, Q, X.src, `${X.src.def.name}: pay 1 life to draw a card?`, true))) return;
    loseLife(G, Q, 1); drawN(G, Q, 1);
  } }));
  return d;
};
S['Gix\'s Command'] = (d) => {
  d.modeN = 2;
  d.modes = [
    { label: 'Two +1/+1 counters on up to one creature; it gains lifelink', eff: [fn((G, X, t) => { const c = t && t.c; if (!c) return; addCounters(G, c, 2); grantKw(G, c, ['lifelink']); }, { tgt: { f: {}, min: 0 }, val: (G, P, c) => (c.ctrl === P.i ? 2 + cv(c) * 0.1 : -1), label: 'Choose a creature' })] },
    { label: 'Destroy each creature with power 2 or less', eff: [{ k: 'destroyAll', f: { fn: (G, c) => pow(c) <= 2 } }] },
    { label: 'Return up to two creature cards from your graveyard to your hand', eff: [fn((G, X) => { const P = X.P; for (const c of pickSome(G, P, P.gy.filter((x) => x.def.types.includes('Creature')), 0, 2, 'Return up to two creature cards', (x) => x.def.value + 1, 'graveyard')) fromGy(G, P, c); }, { score: (G, P) => Math.min(2, P.gy.filter((c) => c.def.types.includes('Creature')).length) * 1.4 })] },
    { label: 'Each opponent sacrifices a creature with the greatest power', eff: [fn((G, X) => { const O = X.O, cs = O.bf.filter(isCreature); if (!cs.length) return; const m = Math.max(...cs.map((c) => pow(c))); edictOf(G, O, (c) => isCreature(c) && pow(c) === m, X.src.def.name); }, { score: (G, P) => { const cs = other(G, P).bf.filter(isCreature); return cs.length ? Math.max(...cs.map((c) => cv(c))) : 0; } })] },
  ];
  d.spell = null;
  return d;
};
S['Gixian Infiltrator'] = (d) => { d.trig.push(T('sac', { you: true, other: true, run: (G, X) => addCounters(G, X.src, 1) })); return d; };
S['Gixian Recycler'] = (d) => {
  const again = (G, X) => conjure(G, X.P, 'Gixian Recycler', 'gy');
  d.trig.push(T('die', { self: true, run: again }));
  d.gyTrig = [T('discard', { cond: (G, src, ev) => ev.card === src, run: again }), T('milled', { cond: (G, src, ev) => (ev.cards || []).includes(src), run: again })];
  return d;
};
S['Grafted Butcher'] = (d) => {
  d.etb = [fn((G, X) => { for (const c of X.P.bf.filter((x) => isCreature(x) && phyrexian(x))) grantKw(G, c, ['menace']); }, { score: () => 0.5 })];
  d.statics.push({ who: 'all', f: { side: 'you', other: true, sub: 'Phyrexian' }, p: 1, t: 1, kw: [] });
  d.gyActs = [{ cost: { m: C('{3}{B}'), sac: { f: { types: ['Artifact', 'Creature'] }, label: 'an artifact or creature', prefer: (G, x) => (x.token ? 3 : 0) - pv(G, x) } }, sorcery: true, label: 'Return it to the battlefield', when: ['main2'],
    run: (G, X) => fromGy(G, X.P, X.src, 'bf'), ai: (G, P) => (P.bf.some((c) => c.token && (isArtifact(c) || isCreature(c)) && pv(G, c) < 1.5) ? { score: 1.3 } : null) }];
  return d;
};
S['Ichor Drinker'] = (d) => { d.gyActs = [gyExile('{B}', 'Incubate 2', (G, X) => incubate(G, X.P, 2), () => ({ score: 1.4 }))]; return d; };
S['March Toward Perfection'] = (d) => {
  d.spell = [fn((G, X) => {
    addBoon(G, X.P, 'the next Phyrexian creature you cast enters with a +1/+1 counter and a deathtouch counter', T('cast', { you: true, cond: (GG, s, ev) => !!ev.card && ev.card.def.types.includes('Creature') && ev.card.def.sub.includes('Phyrexian'), run: (GG, XX) => { const c = XX.ev.card; c.etbAdd = Object.assign({}, c.etbAdd); c.etbAdd['+1/+1'] = (c.etbAdd['+1/+1'] || 0) + 1; c.etbAdd.deathtouch = (c.etbAdd.deathtouch || 0) + 1; } }));
    draft(G, X.P, X.src, SPELLBOOK.march);
  }, { score: () => 1.5, value: 1.5 })];
  return d;
};
S['Phyrexian Arena'] = (d) => { d.trig.push(T('upkeep', { you: true, run: (G, X) => { drawN(G, X.P, 1); loseLife(G, X.P, 1); } })); return d; };
S['Phyrexian Espionage'] = (d) => kicker(d, '{1}{B}', { label: 'Draw two cards', eff: [{ k: 'draw', n: 2 }] }, { label: 'Draw two cards; each opponent discards a card', eff: [{ k: 'draw', n: 2 }, { k: 'discard', n: 1 }] });
S['Pile On'] = (d) => { d.convoke = true; d.spell = [{ k: 'destroyP', tgt: { f: { types: ['Creature', 'Planeswalker'] } } }, { k: 'surveil', n: 2 }]; d.role = 'removal'; return d; };
S['Powerstone Fracture'] = (d) => { sacCost(d, ['Artifact', 'Creature']); d.spell = [{ k: 'destroyP', tgt: { f: { types: ['Creature', 'Planeswalker'] } } }]; d.role = 'removal'; return d; };
S['Reezug, the Bonecobbler'] = (d) => {
  d.acts.push({ cost: { tap: true }, label: 'A creature card in your graveyard perpetually becomes an artifact; you may cast it this turn', when: ['main1'],
    eff: [fn((G, X, t) => { const c = t && t.c; if (!c || !X.P.gy.includes(c)) return; perp(c).artifact = true; playable(G, X.P, c, G.turn); emit(G, 'info', `${c.def.name} perpetually becomes an artifact; ${X.P.name} may cast it this turn.`, { who: X.P.i, cards: [c.id] }); },
      { tgt: { what: 'gy', mine: true, f: { types: ['Creature'] } }, val: (G, P, c) => (canPay(P, c.def.cost) ? c.def.value : -1), label: 'Choose a creature card in your graveyard' })] });
  return d;
};
S['Rona, Sheoldred\'s Faithful'] = (d) => { d.gyDiscard = 2; d.trig.push(castIS({ run: (G, X) => loseLife(G, X.O, 1, X.P.i) })); return d; };
S['Rusko, Clockmaker'] = (d) => {
  d.etb = [fn((G, X) => conjure(G, X.P, 'Midnight Clock', 'bf'), { score: () => 1 })];
  d.trig.push(castNC({ run: (G, X) => { for (const c of X.P.bf.filter((x) => x.def.name === 'Midnight Clock')) addCounters(G, c, 1, 'hour'); drain(G, X, 1); } }));
  return d;
};
S['Midnight Clock'] = (d) => {
  d.mana = ['U'];
  d.acts.push({ cost: { m: C('{2}{U}') }, label: 'Put an hour counter on it', run: (G, X) => addCounters(G, X.src, 1, 'hour'), when: ['end'], ai: (G, P) => (P.hand.length <= 2 ? { score: 0.7 } : null) });
  d.trig.push(T('upkeep', { run: (G, X) => addCounters(G, X.src, 1, 'hour') }));
  d.trig.push(T('counters', { self: true, cond: (G, src, ev) => ev.kind === 'hour' && ctrCount(src, 'hour') >= 12 && !src.mem.struck, run: (G, X) => {
    const P = X.P;
    X.src.mem.struck = true;
    P.library.push(...P.hand.splice(0), ...P.gy.splice(0));
    G.rng.shuffle(P.library); dirty(G);
    say(G, P, `Midnight strikes: ${P.name} shuffles their hand and graveyard into their library and draws seven cards.`);
    drawN(G, P, 7);
    if (onBf(G, X.src)) exilePermanent(G, P, X.src);
  } }));
  return d;
};
S['Sanitarium Skeleton'] = (d) => { d.gyActs = [{ cost: { m: C('{2}{B}') }, label: 'Return it to your hand', when: ['end'], run: (G, X) => fromGy(G, X.P, X.src), ai: () => ({ score: 0.9 }) }]; return d; };
S['Sengir Connoisseur'] = (d) => { d.trig.push(T('die', { other: true, once: true, cond: (G, src, ev) => !!ev.def && ev.def.types.includes('Creature'), run: (G, X) => addCounters(G, X.src, 1) })); return d; };
S['Terror of Towashi'] = (d) => {
  d.trig.push(T('attack', { self: true, run: (G, X) => {
    const P = X.P, cs = P.gy.filter((c) => c.def.types.includes('Creature'));
    if (!cs.length || !canPay(P, C('{3}{B}'))) return;
    const best = cs.slice().sort((a, b) => b.def.value - a.def.value)[0];
    if (isHuman(G, P) ? !yesNo(G, P, X.src, 'Pay {3}{B} to return a creature card from your graveyard to the battlefield?', true) : best.def.value < 2.5) return;
    if (!pay(P, C('{3}{B}'))) return;
    const c = isHuman(G, P) ? pickOne(G, P, cs, 'Return a creature card to the battlefield', (y) => y.def.value, 'choose', 'graveyard') : best;
    if (c && fromGy(G, P, c, 'bf') && onBf(G, c)) { c.addSubs = [...new Set((c.addSubs || []).concat('Phyrexian'))]; dirty(G); }
  } }));
  return d;
};
S['Testament Bearer'] = (d) => {
  d.dies = [fn((G, X) => {
    const P = X.P, top = P.library.splice(Math.max(0, P.library.length - 3)).reverse();
    if (!top.length) return;
    const c = pickOne(G, P, top, 'Put one into your hand (the rest go to your graveyard)', (x) => handValue(G, P, x), 'look', 'library');
    P.hand.push(c); P.gy.push(...top.filter((x) => x !== c)); dirty(G);
    emit(G, 'draw', `${P.name} puts a card into their hand and the rest into their graveyard.`, { who: P.i });
  }, { score: () => 1 })];
  return d;
};
S['Tribute to Urborg'] = (d) => kicker(d, '{1}{U}', { label: 'A creature gets -2/-2', eff: [{ k: 'pumpT', p: -2, t: -2, tgt: { f: {} } }] },
  { label: 'It gets an extra -1/-1 for each instant and sorcery card in your graveyard', eff: [{ k: 'pumpT', pFn: (G, X) => -2 - X.P.gy.filter(isGyIS).length, tFn: (G, X) => -2 - X.P.gy.filter(isGyIS).length, p: -3, t: -3, tgt: { f: {} } }] });
S['Unseal the Necropolis'] = (d) => {
  d.spell = [fn((G, X) => { for (const Q of G.players) mill(G, Q, 3); const P = X.P; for (const c of pickSome(G, P, P.gy.filter((x) => x.def.types.includes('Creature')), 0, 2, 'Return up to two creature cards', (x) => x.def.value + 1, 'graveyard')) fromGy(G, P, c); }, { score: (G, P) => 1.5 + Math.min(2, P.gy.filter((c) => c.def.types.includes('Creature')).length) * 0.6, value: 2 })];
  return d;
};
S['Urborg Repossession'] = (d) => {
  const back = (G, X, f, n) => { const P = X.P; for (const c of pickSome(G, P, P.gy.filter(f), Math.min(1, n), n, 'Return cards to your hand', (x) => x.def.value + 1, 'graveyard')) fromGy(G, P, c); };
  d.modes = [{ label: 'Return a creature card; gain 2 life', eff: [fn((G, X) => { back(G, X, (c) => c.def.types.includes('Creature'), 1); gain(G, X.P, 2); }, { score: (G, P) => (P.gy.some((c) => c.def.types.includes('Creature')) ? 1.8 : 0.3) })] },
    { label: 'Kicked: also return another permanent card', cost: C('{1}{G}'), eff: [fn((G, X) => { back(G, X, (c) => c.def.types.includes('Creature'), 1); back(G, X, (c) => permCard(c.def), 1); gain(G, X.P, 2); }, { score: (G, P) => (P.gy.filter((c) => permCard(c.def)).length >= 2 ? 2.8 : 0.5) })] }];
  d.spell = null;
  return d;
};
S['Vohar, Vodalian Desecrator'] = (d) => {
  d.acts.push({ cost: { tap: true }, label: 'Draw a card, then discard a card', when: ['end'], run: (G, X) => {
    const P = X.P;
    drawN(G, P, 1);
    const before = P.gy.length;
    discardE(G, P, 1);
    const c = P.gy.length > before ? P.gy[P.gy.length - 1] : null;
    if (c && isIS(c.def)) drain(G, X, 1);
  }, ai: () => ({ score: 1 }) });
  d.acts.push({ cost: { m: C('{2}'), sacSelf: true }, sorcery: true, label: 'You may cast an instant or sorcery card from your graveyard this turn', when: ['main1'],
    eff: [fn((G, X, t) => { const c = t && t.c; if (!c) return; X.P.xcast.push({ card: c, until: G.turn, exileAfter: true }); dirty(G); say(G, X.P, `${X.P.name} may cast ${c.def.name} from their graveyard this turn.`, [c.id]); },
      { tgt: { what: 'gy', mine: true, f: { types: ['Instant', 'Sorcery'] } }, val: (G, P, c) => (canPay(P, C('{2}')) ? c.def.value - 2.5 : -1), label: 'Choose an instant or sorcery card' })] });
  return d;
};
S['Vraan, Executioner Thane'] = (d) => { d.trig.push(T('die', { you: true, other: true, once: true, cond: (G, src, ev) => !!ev.def && ev.def.types.includes('Creature'), run: (G, X) => drain(G, X, 2) })); return d; };
S['Hidetsugu and Kairi'] = (d) => {
  d.etb = [{ k: 'brainstorm' }];
  d.dies = [fn((G, X) => {
    const P = X.P, c = P.library.pop();
    if (!c) return;
    P.exile.push(c); dirty(G);
    emit(G, 'exile', `${P.name} exiles ${c.def.name} from the top of their library.`, { who: P.i, cards: [c.id] });
    loseLife(G, X.O, c.def.mv || 0, P.i);
    if (isIS(c.def)) castNow(G, P, c, { free: true });
  }, { score: () => 2 })];
  return d;
};

/* ============================================================ Red */
S['Bladegraft Aspirant'] = (d) => { d.spellDiscount = (G, P, card) => (card.def.sub.includes('Equipment') ? 1 : 0); d.equipCheaper = 1; return d; };
S['Electrostatic Infantry'] = (d) => { d.trig.push(castIS({ run: (G, X) => addCounters(G, X.src, 1) })); return d; };
S['Fallaji Antiquarian'] = (d) => {
  d.etb = [fn((G, X, t) => { const c = t && t.c; if (!c) return; const base = c.faceBase || c.def; const dup = conjure(G, X.P, base.front || base, 'gy', { perp: Object.assign({}, c.perp, { unearth: C('{1}{R}') }) }); if (dup) emit(G, 'info', `The duplicate of ${base.name} perpetually gains unearth {1}{R}.`, { who: X.P.i, cards: [dup.id] }); },
    { tgt: { f: { types: ['Artifact', 'Creature'], side: 'you', other: true, fn: (G, c) => !c.token } }, val: (G, P, c) => 0.5 + c.def.value * 0.3, label: 'Choose another nontoken creature or artifact you control' })];
  return d;
};
S['Feldon, Ronom Excavator'] = (d) => {
  d.cantBlock = true;
  d.trig.push(T('dmgCreature', { self: true, cond: (G, src, ev) => ev.n > 0, run: (G, X) => {
    const P = X.P, top = P.library.splice(Math.max(0, P.library.length - X.ev.n)).reverse();
    if (!top.length) return;
    P.exile.push(...top); dirty(G);
    const c = pickOne(G, P, top, 'Choose a card you may play until the end of your next turn', (x) => handValue(G, P, x), 'look', 'library');
    emit(G, 'exile', `${P.name} exiles ${nameList(top)} and may play ${c.def.name} until the end of their next turn.`, { who: P.i, cards: top.map((x) => x.id) });
    playable(G, P, c, untilMyNextEnd(G, P));
  } }));
  return d;
};
S['Furnace Gremlin'] = (d) => { d.pumpAbility = { cost: C('{1}{R}'), p: 1, t: 0, max: 3 }; d.dies = [{ k: 'incubate', nFn: (G, X) => Math.max(0, (X.ev && X.ev.pow) || 0) }]; return d; };
S['Furnace Strider'] = (d) => {
  d.etbCtr = () => ({ oil: 2 });
  d.acts.push({ cost: { ctr: { kind: 'oil', n: 1 } }, label: 'A creature you control gains haste until end of turn', when: ['main1'],
    eff: [{ k: 'grant', kw: ['haste'], tgt: { f: { side: 'you', fn: (G, c) => c.sick && !has(c, 'haste') } } }],
    ai: (G, P) => { const t = P.bf.find((c) => isCreature(c) && c.sick && !has(c, 'haste') && !c.tapped && pow(c) >= 2); return t ? { score: 0.6 + pow(t) * 0.3, targets: [{ c: t }] } : null; } });
  return d;
};
S['Ghitu Embercoiler'] = (d) => {
  d.trig.push(T('mainStart', { you: true, cond: (G, src, ev, Q) => (Q.mainN || 0) <= 1, run: (G, X) => {
    const P = X.P; if (!P.hand.length) return;
    const worst = P.hand.slice().sort((a, b) => handValue(G, P, a) - handValue(G, P, b))[0];
    if (isHuman(G, P) ? !yesNo(G, P, X.src, 'Discard a card to seek a card with greater mana value?', false) : !(isLand(worst) && P.bf.filter(isLand).length >= 5)) return;
    const before = P.gy.length;
    discardE(G, P, 1);
    const gone = P.gy.length > before ? P.gy[P.gy.length - 1] : worst;
    const c = seek(G, P, (x) => x.def.mv > (gone.def.mv || 0), 'exile');
    if (c) playable(G, P, c, untilMyNextEnd(G, P));
  } }));
  return d;
};
S['Kolaghan Warmonger'] = (d) => { d.trig.push(T('attack', { self: true, eff: [lookFor(6, (c) => c.def.sub.includes('Dragon'), 'Put a Dragon card into your hand')] })); return d; };
S['Ogre Battledriver'] = (d) => { d.trig.push(T('enter', { you: true, other: true, cond: (G, src, ev) => isCreature(ev.c), run: (G, X) => pump(G, X.ev.c, 2, 0, ['haste']) })); return d; };
S['Rampaging Raptor'] = (d) => { d.pumpAbility = { cost: C('{2}{R}'), p: 2, t: 0, max: 3 }; return d; };
S['Rebel Salvo'] = (d) => {
  d.spell = [{ k: 'dmgX', nFn: () => 5, tgt: { f: { types: ['Creature', 'Planeswalker'] } } }, fn((G, X) => { const c = X.last && X.last.c; if (c && onBf(G, c)) c.tf.loseInd = true; }, { score: () => 0 })];
  d.role = 'removal';
  return d;
};
S['Rhuk, Hexgold Nabber'] = (d) => {
  const grab = (G, X, gear) => { const P = X.P, me = X.src; if (!gear.length || !onBf(G, me)) return; if (isHuman(G, P) && !yesNo(G, P, me, `Attach ${nameList(gear)} to ${me.def.name}?`, true)) return; for (const eq of gear) if (onBf(G, eq)) attach(G, eq, me); };
  d.trig.push(T('attack', { you: true, other: true, cond: (G, src, ev) => equipped(G, ev.c), run: (G, X) => { const P = X.P, me = X.src; if (!isHuman(G, P) && (me.attacking || me.sick)) return; grab(G, X, gearOf(G, X.ev.c)); } }));
  d.trig.push(T('die', { you: true, other: true, cond: (G, src, ev) => (ev.eqs || []).length > 0, run: (G, X) => grab(G, X, (X.ev.eqs || []).filter((e) => onBf(G, e))) }));
  return d;
};
S['Sprouting Goblin'] = (d) => {
  kickerPerm(d, '{G}', 'search for a land card with a basic land type', () => 1);
  d.etb = [Object.assign({ k: 'tutor', f: { types: ['Plains', 'Island', 'Swamp', 'Mountain', 'Forest'] }, to: 'hand', why: 'a land card with a basic land type' }, { if: (G, X) => kicked(X) })];
  d.acts.push({ cost: { m: C('{R}'), tap: true, sac: { f: { types: ['Land'] }, label: 'a land' } }, label: 'Draw a card', when: ['end'], ai: (G, P) => (P.bf.filter(isLand).length >= 7 ? { score: 1 } : null), eff: [{ k: 'draw', n: 1 }] });
  return d;
};
S['Unleash Shell'] = (d) => {
  d.spell = [{ k: 'dmgX', nFn: () => 5, tgt: { f: { types: ['Creature', 'Planeswalker'] } } }, fn((G, X) => { const c = X.last && X.last.c; if (c) hit(G, X, { p: c.ctrl }, 2); }, { score: () => 0.6 })];
  d.role = 'removal';
  return d;
};
S['Viashino Branchrider'] = (d) => {
  kickerPerm(d, '{2}{G}', 'it enters with two +1/+1 counters', () => 1.5);
  d.etbCtr = (G, P, card, opts) => ({ '+1/+1': opts && opts.item && opts.item.mode && opts.item.mode.includes(1) ? 2 : 0 });
  d.pumpAbility = { cost: C('{2}{R}'), p: 2, t: 0, max: 3 };
  return d;
};
S['Volcanic Spite'] = (d) => {
  d.spell = [{ k: 'dmgX', nFn: () => 3, tgt: { f: { types: ['Creature', 'Planeswalker'] } } }, fn((G, X) => {
    const P = X.P; if (!P.hand.length) return;
    const worst = P.hand.slice().sort((a, b) => handValue(G, P, a) - handValue(G, P, b))[0];
    const c = isHuman(G, P) ? pickSome(G, P, P.hand, 0, 1, 'You may put a card from your hand on the bottom of your library to draw a card', () => 1, 'hand')[0] : handValue(G, P, worst) < 1 ? worst : null;
    if (!c) return;
    P.hand.splice(P.hand.indexOf(c), 1); P.library.unshift(c); dirty(G);
    drawN(G, P, 1);
  }, { score: () => 0.3 })];
  d.role = 'removal';
  return d;
};
S['Urabrask\'s Forge'] = (d) => {
  d.trig.push(T('combatStart', { you: true, run: (G, X) => {
    addCounters(G, X.src, 1, 'oil');
    const n = ctrCount(X.src, 'oil');
    const [t] = mk(G, X.P, tok('Phyrexian Horror', n, 1, ['R'], ['Phyrexian', 'Horror'], ['trample', 'haste']), 1);
    if (t) G.delayed.push({ when: 'end', run: (GG) => { if (onBf(GG, t)) sacrifice(GG, GG.players[t.ctrl], t, true); } });
  } }));
  return d;
};
S['Charforger'] = (d) => {
  d.etb = [mkE(PHYREXIAN_GOBLIN, 1)];
  d.trig.push(T('toGy', { you: true, other: true, cond: (G, src, ev) => !!ev.c && (ev.c.def.types.includes('Creature') || ev.c.def.types.includes('Artifact')), run: (G, X) => addCounters(G, X.src, 1, 'oil') }));
  d.acts.push({ cost: { ctr: { kind: 'oil', n: 3 } }, label: 'Exile the top card; you may play it this turn', when: ['main1'], run: (G, X) => impulse(G, X.P, G.turn), ai: () => ({ score: 1.5 }) });
  return d;
};
S['Stormclaw Rager'] = (d) => {
  d.acts.push({ cost: { m: C('{1}'), sac: { f: { types: ['Artifact', 'Creature'] }, label: 'another creature or artifact', prefer: (G, x) => (x.token ? 3 : 0) - pv(G, x) } }, sorcery: true, label: 'A +1/+1 counter and draw a card', when: ['main2'],
    run: (G, X) => { addCounters(G, X.src, 1); drawN(G, X.P, 1); }, ai: (G, P, c) => (P.bf.some((x) => x !== c && x.token && (isArtifact(x) || isCreature(x)) && pv(G, x) < 1.6) ? { score: 1.5 } : null) });
  return d;
};
S['Rankle and Torbran'] = (d) => {
  d.trig.push(T('hitPlayer', { self: true, run: (G, X) => {
    const P = X.P, O = X.O;
    const opts = [['Each player creates a Treasure token', 0.4], ['Each player sacrifices a creature', (P.bf.filter(isCreature).length <= 1 || other(G, P).bf.filter(isCreature).length >= 1) ? 1 : -1], ['Damage to players gets +2 this turn', G.combat ? 0.8 : 0.3]];
    let picks;
    if (isHuman(G, P)) picks = opts.map((o, k) => k).filter((k) => yesNo(G, P, X.src, `Rankle and Torbran: ${opts[k][0]}?`, opts[k][1] > 0));
    else picks = opts.map((o, k) => k).filter((k) => opts[k][1] > 0.5);
    for (const k of picks) {
      if (k === 0) for (const Q of G.players) makeTokens(G, Q, L.TREASURE, 1);
      if (k === 1) for (const Q of G.players) edictOf(G, Q, (c) => isCreature(c) && c !== X.src, X.src.def.name);
      if (k === 2) { G.dmgBonus = { turn: G.turn, n: 2 }; say(G, P, 'This turn, each source deals 2 more damage to players.'); }
    }
  } }));
  return d;
};

/* ============================================================ Green */
S['Bite Down'] = (d) => { d.spell = [{ k: 'bite' }]; d.role = 'removal'; return d; };
S['Cosmic Hunger'] = (d) => { d.spell = [{ k: 'bite' }]; d.role = 'removal'; return d; };
S['Epic Confrontation'] = (d) => { d.spell = [{ k: 'fight', pt: [1, 2] }]; d.role = 'removal'; return d; };
S['Sylvan Smite'] = (d) => { d.spell = [{ k: 'bite', ctr: (G, P) => (G.first !== P.i ? 1 : 0) }]; d.role = 'removal'; return d; };
S['Blanchwood Prowler'] = (d) => { d.etb = [millTake(isLand, 'You may put a land card into your hand')]; return d; };
S['Fallaji Archaeologist'] = (d) => { d.etb = [millTake((c) => !isLand(c) && !c.def.types.includes('Creature'), 'You may put a noncreature, nonland card into your hand')]; return d; };
S['Ravenous Gigamole'] = (d) => { d.etb = [millTake((c) => c.def.types.includes('Creature'), 'You may put a creature card into your hand')]; return d; };
S['Botanical Brawler'] = (d) => {
  d.etbCtr = () => ({ '+1/+1': 2 });
  d.trig.push(T('counters', { you: true, other: true, cond: (G, src, ev) => ev.kind === '+1/+1' && ev.first, run: (G, X) => addCounters(G, X.src, 1) }));
  return d;
};
S['Bushwhack'] = (d) => {
  d.modes = [{ label: 'Search for a basic land card', eff: [{ k: 'tutor', f: { types: ['Land'], fn: (dd) => dd.supertypes.includes('Basic') }, to: 'hand', why: 'a basic land card' }] }, { label: 'A creature you control fights a creature you don\'t control', eff: [{ k: 'fight' }] }];
  d.spell = null;
  return d;
};
S['Colossal Growth'] = (d) => kicker(d, '{R}', { label: 'A creature gets +3/+3', eff: [{ k: 'pumpT', p: 3, t: 3, tgt: { f: {} } }] }, { label: 'It gets +4/+4, trample and haste', eff: [{ k: 'pumpT', p: 4, t: 4, kw: ['trample', 'haste'], tgt: { f: {} } }] });
S['Conduit of Worlds'] = (d) => {
  d.gyLand = () => true;
  d.acts.push({ cost: { tap: true }, sorcery: true, label: 'You may cast a nonland permanent card from your graveyard (if you haven\'t cast a spell this turn)', cond: (G, P) => !P.cast, when: ['main1'],
    eff: [fn((G, X, t) => { const c = t && t.c; if (!c) return; playable(G, X.P, c, G.turn); say(G, X.P, `${X.P.name} may cast ${c.def.name} this turn; then no more spells this turn.`, [c.id]); X.P.oneSpell = G.turn; },
      { tgt: { what: 'gy', mine: true, f: { types: ['permanent'], fn: (G, c) => !isLand(c) } }, val: (G, P, c) => (canPay(P, c.def.cost) ? c.def.value : -1), label: 'Choose a nonland permanent card in your graveyard' })] });
  return d;
};
S['Deathbloom Ritualist'] = (d) => { d.manaAbs = [{ colors: ['W', 'U', 'B', 'R', 'G'], amountFn: (G, c, P) => P.gy.filter((x) => x.def.types.includes('Creature')).length }]; return d; };
S['Fairgrounds Trumpeter'] = (d) => { d.trig.push(T('endStep', { cond: (G, src, ev, Q) => Q.plusCtrTurn === G.turn, run: (G, X) => addCounters(G, X.src, 1) })); return d; };
S['Gaea\'s Courser'] = (d) => { d.trig.push(T('attack', { self: true, cond: (G, src, ev, Q) => Q.gy.filter((c) => c.def.types.includes('Creature')).length >= 3, eff: [{ k: 'draw', n: 1 }] })); return d; };
S['Ilysian Caryatid'] = (d) => { d.manaAbs = [{ colors: ['W', 'U', 'B', 'R', 'G'], amountFn: (G, c, P) => (P.bf.some((x) => isCreature(x) && pow(x) >= 4) ? 2 : 1) }]; return d; };
S['Kami of Whispered Hopes'] = (d) => { d.plusOnePlus = (G, x, c) => true; d.manaAbs = [{ colors: ['W', 'U', 'B', 'R', 'G'], amountFn: (G, c) => Math.max(0, pow(c)) }]; return d; };
S['Ozolith, the Shattered Spire'] = (d) => {
  d.plusOnePlus = (G, x, c) => isArtifact(c) || isCreature(c);
  d.acts.push({ cost: { m: C('{1}{G}'), tap: true }, sorcery: true, label: 'A +1/+1 counter on an artifact or creature you control', when: ['main1', 'main2'], eff: [{ k: 'ctrs', n: 1, tgt: { f: { types: ['Artifact', 'Creature'], side: 'you' } } }] });
  return d;
};
S['Llanowar Loamspeaker'] = (d) => {
  d.manaAbs = [{ colors: ['W', 'U', 'B', 'R', 'G'] }];
  d.acts.push({ cost: { tap: true }, sorcery: true, label: 'A land you control becomes a 3/3 Elemental with haste until end of turn', when: ['main1'],
    eff: [fn((G, X, t) => { const c = t && t.c; if (!c || !onBf(G, c)) return; c.mem.anim = { until: G.turn + 1, p: 3, t: 3 }; grantKw(G, c, ['haste'], 'becomes a 3/3 Elemental creature with haste until end of turn'); dirty(G); },
      { tgt: { f: { types: ['Land'], side: 'you', fn: (G, c) => !isCreature(c) } }, val: (G, P, c) => (c.tapped ? 0.2 : 0.9), label: 'Choose a land you control' })],
    ai: (G, P, c) => { const land = P.bf.find((x) => isLand(x) && !x.tapped && !isCreature(x)); return land && P.bf.filter(isLand).length >= 4 && !other(G, P).bf.some((b) => isCreature(b) && !b.tapped && pow(b) >= 3) ? { score: 0.9, targets: [{ c: land }] } : null; } });
  return d;
};
S['Marwyn\'s Kindred'] = (d) => {
  d.spell = [fn((G, X) => { conjure(G, X.P, 'Marwyn, the Nurturer', 'bf'); for (let k = 0; k < (X.x || 0); k++) conjure(G, X.P, 'Llanowar Elves', 'bf'); }, { score: (G, P, X) => 2 + ((X && X.x) || 0) * 1.2, value: 3 })];
  d.aiX = (G, P, card, max) => max;
  return d;
};
S['Marwyn, the Nurturer'] = (d) => {
  d.trig.push(T('enter', { you: true, other: true, cond: (G, src, ev) => isCreature(ev.c) && hasSub(ev.c, 'Elf'), run: (G, X) => addCounters(G, X.src, 1) }));
  d.manaAbs = [{ colors: ['G'], amountFn: (G, c) => Math.max(0, pow(c)) }];
  return d;
};
S['Nissa, Resurgent Animist'] = (d) => {
  d.trig.push(T('landfall', { you: true, counted: true, run: (G, X) => {
    const P = X.P, col = L.ANY.slice().sort((a, b) => P.hand.reduce((s, c) => s + (c.def.cost[b] || 0) - (c.def.cost[a] || 0), 0))[0];
    L.addPool(G, P, [col]);
    say(G, P, `${X.src.def.name} adds {${col}}.`);
    if (X.nth !== 2) return;
    const { hits, rest } = L.revealUntil(G, P, (c) => c.def.sub.includes('Elf') || c.def.sub.includes('Elemental'));
    P.hand.push(...hits); G.rng.shuffle(rest); P.library.unshift(...rest); dirty(G);
    emit(G, 'reveal', hits.length ? `${P.name} reveals cards until ${hits[0].def.name} and puts it into their hand.` : `${P.name} reveals their library and finds no Elf or Elemental.`, { who: P.i, cards: hits.map((c) => c.id) });
  } }));
  return d;
};
S['Placid Rottentail'] = (d) => {
  d.gyActs = [{ cost: { m: C('{2}{G}'), exileSelf: true }, sorcery: true, label: 'Two +1/+1 counters on a creature', when: ['main1', 'main2'], eff: [{ k: 'ctrs', n: 2, tgt: { f: {} } }] }];
  return d;
};
S['Quirion Beastcaller'] = (d) => {
  d.trig.push(T('cast', { you: true, cond: (G, src, ev) => !!ev.card && ev.card.def.types.includes('Creature'), run: (G, X) => addCounters(G, X.src, 1) }));
  d.trig.push(T('die', { self: true, run: (G, X) => {
    let n = X.ev.cnt || 0; const P = X.P, cs = P.bf.filter(isCreature);
    if (!n || !cs.length) return;
    const ts = isHuman(G, P) ? pickSome(G, P, cs, 1, Math.min(n, cs.length), `Distribute ${n} +1/+1 counters among creatures you control`, () => 1) : cs.slice().sort((a, b) => cv(b) - cv(a)).slice(0, Math.min(n, 2));
    for (let k = 0; n > 0 && ts.length; k++, n--) addCounters(G, ts[k % ts.length], 1);
  } }));
  return d;
};
S['Ravenous Sailback'] = (d) => {
  d.etb = [chooseOne([{ label: 'It gains haste until end of turn', eff: [fn((G, X) => grantKw(G, X.src, ['haste']), { score: () => 0.8 })] }, { label: 'Destroy an artifact or enchantment', eff: [{ k: 'destroyP', tgt: { f: { types: ['Artifact', 'Enchantment'] } } }] }])];
  return d;
};
S['Skyfisher Spider'] = (d) => {
  d.etb = [fn((G, X) => {
    const P = X.P, cs = P.bf.filter((c) => c !== X.src && isCreature(c));
    const targets = allPerms(G).filter((c) => !isLand(c) && c.ctrl !== P.i);
    if (!cs.length || !targets.length) return;
    const fodder = cs.slice().sort((a, b) => pv(G, a) - pv(G, b))[0], prize = targets.slice().sort((a, b) => pv(G, b) - pv(G, a))[0];
    if (isHuman(G, P) ? !yesNo(G, P, X.src, 'Sacrifice another creature to destroy a nonland permanent?', false) : pv(G, prize) < pv(G, fodder) + 1.5) return;
    const c = isHuman(G, P) ? pickOne(G, P, cs, 'Sacrifice a creature', (x) => -pv(G, x)) : fodder;
    emit(G, 'sac', `${P.name} sacrifices ${c.def.name}.`, { who: P.i, cards: [c.id] });
    sacrifice(G, P, c, true);
    L.resolveWithTargets(G, P, X.src, [{ k: 'destroyP', tgt: { f: { types: ['nonland'] } } }], X, 'trigger');
  }, { score: () => 0.5 })];
  d.trig.push(T('die', { self: true, run: (G, X) => {
    const P = X.P, n = P.gy.filter((c) => c.def.types.includes('Creature')).length, me = X.src;
    if (!n || !P.gy.includes(me) || (isHuman(G, P) && !yesNo(G, P, me, `Gain ${n} life and exile Skyfisher Spider?`, true))) return;
    gain(G, P, n); P.gy.splice(P.gy.indexOf(me), 1); P.exile.push(me); dirty(G);
  } }));
  return d;
};
S['Storm the Seedcore'] = (d) => {
  d.spell = [fn((G, X) => {
    const P = X.P, cs = P.bf.filter(isCreature);
    const ts = isHuman(G, P) ? pickSome(G, P, cs, Math.min(1, cs.length), Math.min(4, cs.length), 'Distribute four +1/+1 counters among up to four creatures you control', () => 1) : cs.slice().sort((a, b) => cv(b) - cv(a)).slice(0, 4);
    for (let k = 0; k < 4 && ts.length; k++) addCounters(G, ts[k % ts.length], 1);
    for (const c of cs) grantKw(G, c, ['vigilance', 'trample'], 'gains vigilance and trample until end of turn');
  }, { score: (G, P, X, ctx) => (P.bf.some(isCreature) ? 3.6 + (ctx === 'main1' ? 1 : 0) : -1), value: 3 })];
  return d;
};
S['Surrak and Goreclaw'] = (d) => {
  d.statics.push({ who: 'all', f: { side: 'you', other: true }, p: 0, t: 0, kw: ['trample'] });
  d.trig.push(T('enter', { you: true, other: true, cond: (G, src, ev) => isCreature(ev.c) && !ev.c.token, run: (G, X) => { addCounters(G, X.ev.c, 1); grantKw(G, X.ev.c, ['haste']); } }));
  return d;
};
S['Titania\'s Command'] = (d) => {
  d.modeN = 2;
  d.modes = [
    { label: 'Exile a player\'s graveyard; gain 1 life per card', eff: [fn((G, X, t) => { const Q = G.players[t ? t.p : X.O.i]; const n = Q.gy.length; Q.exile.push(...Q.gy.splice(0)); dirty(G); gain(G, X.P, n); emit(G, 'exile', `${Q.name}'s graveyard is exiled.`, { who: X.P.i }); }, { tgt: { what: 'player' }, val: (G, P, x) => G.players[x.p].gy.length * 0.25 + (x.p !== P.i ? 0.3 : 0), label: 'Choose a player' })] },
    { label: 'Search for up to two land cards, onto the battlefield tapped', eff: [{ k: 'tutor', f: { types: ['Land'] }, n: 2, to: 'bfTapped', why: 'up to two land cards' }] },
    { label: 'Create two 2/2 Bears', eff: [mkE(BEAR, 2)] },
    { label: 'Two +1/+1 counters on each creature you control', eff: [fn((G, X) => ctrEach(G, X.P.bf.filter(isCreature), 2), { score: (G, P) => P.bf.filter(isCreature).length * 1.6 })] },
  ];
  d.spell = null;
  return d;
};
S['Tribute to the World Tree'] = (d) => {
  d.trig.push(T('enter', { you: true, cond: (G, src, ev) => isCreature(ev.c), run: (G, X) => { if (pow(X.ev.c) >= 3) drawN(G, X.P, 1); else addCounters(G, X.ev.c, 2); } }));
  return d;
};
S['Wary Thespian'] = (d) => { d.etb = [{ k: 'surveil', n: 1 }]; d.dies = [{ k: 'surveil', n: 1 }]; return d; };

/* ============================================================ Multicolored */
S['Astor, Bearer of Blades'] = (d) => {
  d.etb = [lookFor(7, (c) => c.def.sub.includes('Equipment') || c.def.sub.includes('Vehicle'), 'Put an Equipment or Vehicle card into your hand')];
  d.equipOne = true;
  return d;
};
S['Baral and Kari Zev'] = (d) => {
  d.trig.push(castIS({ cond: (G, src, ev, Q) => !!ev.card && isIS(ev.card.def) && (Q.castDefs || []).filter(isIS).length === 1, run: (G, X) => {
    const P = X.P, mv = X.ev.card.def.mv;
    const types = X.ev.card.def.types.filter((t) => t === 'Instant' || t === 'Sorcery');
    const cs = P.hand.filter((c) => c.def.mv < mv && c.def.types.some((t) => types.includes(t)) && !c.def.respondOnly && !(c.def.spell || []).some((e) => e.k === 'counter'));
    let cast = false;
    if (cs.length) {
      const c = isHuman(G, P) ? pickSome(G, P, cs, 0, 1, 'You may cast a spell with lesser mana value from your hand for free', () => 1, 'hand')[0] : cs.slice().sort((a, b) => b.def.value - a.def.value)[0];
      if (c) cast = castNow(G, P, c, { free: true, ask: false });
    }
    if (!cast) { const [t] = mk(G, P, RAGAVAN, 1); if (t) grantKw(G, t, ['haste']); }
  } }));
  return d;
};
S['Clay Champion'] = (d) => {
  d.aiX = (G, P, card, max) => max;
  d.etbCtr = (G, P, card, opts) => { const sc = (opts && opts.item && opts.item.spentCols) || {}; return { '+1/+1': 3 * Math.floor((sc.G || 0) / 2) }; };
  d.etb = [fn((G, X) => {
    const sc = (X.item && X.item.spentCols) || {}, n = Math.floor((sc.W || 0) / 2);
    if (!n) return;
    const P = X.P, cs = P.bf.filter((c) => c !== X.src && isCreature(c));
    const ts = isHuman(G, P) ? pickSome(G, P, cs, 0, 2, `Choose up to two other creatures: ${n} +1/+1 counter${n > 1 ? 's' : ''} on each`, () => 1) : cs.slice().sort((a, b) => cv(b) - cv(a)).slice(0, 2);
    for (const c of ts) addCounters(G, c, n);
  }, { score: () => 0.5 })];
  return d;
};
S['Danitha, Benalia\'s Hope'] = (d) => {
  d.etb = [fn((G, X) => {
    const P = X.P, cs = P.hand.concat(P.gy).filter((c) => c.def.sub.includes('Aura') && c.def.aura && !c.def.aura.perm || c.def.sub.includes('Equipment'));
    if (!cs.length || !onBf(G, X.src)) return;
    const c = isHuman(G, P) ? pickSome(G, P, cs, 0, 1, 'You may put an Aura or Equipment onto the battlefield attached to Danitha', () => 1, P.hand.includes(cs[0]) ? 'hand' : 'graveyard')[0] : cs.slice().sort((a, b) => b.def.value - a.def.value)[0];
    if (!c) return;
    for (const z of [P.hand, P.gy]) if (z.includes(c)) z.splice(z.indexOf(c), 1);
    emit(G, 'enter', `${P.name} puts ${c.def.name} onto the battlefield attached to ${X.src.def.name}.`, { who: P.i, cards: [c.id] });
    enterBattlefield(G, P, c, null, { attachTo: X.src });
  }, { score: (G, P) => (P.hand.concat(P.gy).some((c) => c.def.sub.includes('Equipment') || c.def.sub.includes('Aura')) ? 2 : 0) })];
  return d;
};
S['Ezuri, Stalker of Spheres'] = (d) => {
  d.etb = [fn((G, X) => { const P = X.P; if (!canPay(P, C('{3}')) || (isHuman(G, P) ? !yesNo(G, P, X.src, 'Pay {3} to proliferate twice?', true) : !P.bf.some((c) => c.cnt > 0 || Object.keys(c.ctr).length))) return; if (!pay(P, C('{3}'))) return; proliferate(G, P); proliferate(G, P); }, { score: () => 1 })];
  d.trig.push(T('proliferate', { you: true, eff: [{ k: 'draw', n: 1 }] }));
  return d;
};
S['Glissa Sunslayer'] = (d) => {
  d.trig.push(T('hitPlayer', { self: true, eff: [chooseOne([
    { label: 'You draw a card and lose 1 life', eff: [fn((G, X) => { drawN(G, X.P, 1); loseLife(G, X.P, 1); }, { score: (G, P) => (P.life > 4 ? 1.2 : -1) })] },
    { label: 'Destroy an enchantment', eff: [{ k: 'destroyP', tgt: { f: { types: ['Enchantment'] } } }] },
    { label: 'Remove up to three counters from a permanent', eff: [fn((G, X, t) => { const c = t && t.c; if (!c) return; let n = 3; if (c.def.loyalty) { removeCounters(G, c, 'loyalty', n); return; } const k = Math.min(n, c.cnt); c.cnt -= k; n -= k; for (const kind of Object.keys(c.ctr)) { if (n <= 0) break; n -= removeCounters(G, c, kind, n); } dirty(G); emit(G, 'info', `Counters are removed from ${c.def.name}.`, { who: X.P.i, cards: [c.id] }); },
      { tgt: { f: { types: ['any'], fn: (G, c) => c.cnt > 0 || Object.keys(c.ctr).some((k) => c.ctr[k] > 0) } }, val: (G, P, c) => (c.ctrl === P.i ? -1 : c.def.loyalty ? 3 : Math.min(3, c.cnt) * 0.7), label: 'Choose a permanent with counters' })] },
  ])] }));
  return d;
};
S['Migloz, Maze Crusher'] = (d) => {
  d.etbCtr = () => ({ oil: 5 });
  d.acts.push({ cost: { m: C('{1}'), ctr: { kind: 'oil', n: 1 } }, label: 'Vigilance and menace until end of turn', when: ['main1'], run: (G, X) => grantKw(G, X.src, ['vigilance', 'menace']), ai: (G, P, c) => (L.canAttackNow(G, c) && !has(c, 'menace') ? { score: 0.7 } : null) });
  d.acts.push({ cost: { m: C('{2}'), ctr: { kind: 'oil', n: 2 } }, label: '+2/+2 until end of turn', when: ['blocks'], run: (G, X) => pump(G, X.src, 2, 2), ai: (G, P, c) => ((c.attacking || c.blocking) && L.combatDoom(G) && L.combatDoom(G).dead.has(c) ? { score: 2 } : c.attacking && !c.blocked ? { score: 0.8 } : null) });
  d.acts.push({ cost: { m: C('{3}'), ctr: { kind: 'oil', n: 3 } }, label: 'Destroy an artifact or enchantment', when: ['main1', 'end'], eff: [{ k: 'destroyP', tgt: { f: { types: ['Artifact', 'Enchantment'] } } }] });
  return d;
};
S['Nahiri, Forged in Fury'] = (d) => {
  d.trig.push(T('attack', { you: true, cond: (G, src, ev) => isCreature(ev.c) && equipped(G, ev.c), run: (G, X) => {
    const P = X.P, c = impulse(G, P, G.turn, X.src.def.name);
    if (c && c.def.sub.includes('Equipment')) { const x = P.xcast.find((y) => y.card === c); if (x) x.free = true; }
  } }));
  return d;
};
S['Najal, the Storm Runner'] = (d) => {
  d.flashFor = (def) => def.types.includes('Sorcery');
  d.trig.push(T('attack', { self: true, run: (G, X) => {
    const P = X.P;
    if (!canPay(P, C('{2}')) || !P.hand.some(isGyIS) || (isHuman(G, P) && !yesNo(G, P, X.src, 'Pay {2} to copy your next instant or sorcery this turn?', true))) return;
    if (!pay(P, C('{2}'))) return;
    P.copyNext = { turn: G.turn, n: 1 };
    say(G, P, `${P.name}'s next instant or sorcery spell this turn will be copied.`, [X.src.id]);
  } }));
  return d;
};
S['Samut, Vizier of Naktamun'] = (d) => { d.trig.push(T('hitPlayer', { you: true, cond: (G, src, ev) => !!ev.c && ev.c.inTurn === G.turn, eff: [{ k: 'draw', n: 1 }] })); return d; };
S['Shivan Branch-Burner'] = (d) => { d.convoke = true; return d; };
S['Third Path Iconoclast'] = (d) => { d.trig.push(castNC({ eff: [mkE(SOLDIER_A, 1)] })); return d; };
S['Tomakul Phoenix'] = (d) => {
  d.trig.push(T('die', { self: true, run: (G, X) => perpPump(G, X.src, 2, 2) }));
  d.gyTrig = [T('combatStart', { you: true, run: (G, X) => {
    const P = X.P, me = X.src;
    if (!P.gy.includes(me)) return;
    const cost = Object.assign(C('{R}'), { g: Math.max(0, pow(me)) });
    if (!canPay(P, cost) || (isHuman(G, P) ? !yesNo(G, P, me, `Pay {${Math.max(0, pow(me))}}{R} to return Tomakul Phoenix?`, true) : false)) return;
    if (!pay(P, cost)) return;
    fromGy(G, P, me, 'bf');
  } })];
  return d;
};
S['Urabrask'] = (d) => {
  d.trig.push(castIS({ run: (G, X) => { hitOpp(G, X, 1); L.addPool(G, X.P, ['R']); say(G, X.P, `${X.src.def.name} adds {R}.`); } }));
  d.acts.push({ cost: { m: C('{R}') }, sorcery: true, label: 'Exile Urabrask, then return it transformed', cond: (G, P) => (P.castDefs || []).filter(isIS).length >= 3, when: ['main2'],
    run: (G, X) => L.blink(G, X.src, { transformed: true }), ai: () => ({ score: 3 }) });
  return d;
};
S['The Great Work'] = (d) => {
  d.saga = [
    { ch: [1], run: (G, X) => { hitOpp(G, X, 3); for (const c of X.O.bf.filter(isCreature)) hit(G, X, c, 3); } },
    { ch: [2], run: (G, X) => makeTokens(G, X.P, L.TREASURE, 3) },
    { ch: [3], run: (G, X) => {
      const P = X.P;
      for (const Q of G.players) for (const c of Q.gy.filter((x) => isIS(x.def))) P.xcast.push({ card: c, until: G.turn, exileAfter: true, fromGy: true });
      dirty(G);
      say(G, P, `Until end of turn, ${P.name} may cast instant and sorcery spells from any graveyard.`);
      if (onBf(G, X.src)) L.blink(G, X.src, {});
    } },
  ];
  return d;
};
S['Mishra, Claimed by Gix'] = (d) => {
  d.trig.push(T('attacks', { you: true, run: (G, X) => {
    const n = X.ev.cs.length;
    loseLife(G, X.O, n, X.P.i); gain(G, X.P, n);
    const me = X.src, eng = X.ev.cs.find((c) => c.def.name === 'Phyrexian Dragon Engine' && c.owner === X.P.i);
    if (me.attacking && eng && me.owner === X.P.i && me.def.meldInto) {
      L.meld(G, X.P, me, eng, me.def.meldInto);
      if (onBf(G, me)) { me.tapped = true; me.attacking = true; if (G.combat && !G.combat.attackers.includes(me)) G.combat.attackers.push(me); G.combat.attackers = G.combat.attackers.filter((c) => c !== eng); }
    }
  } }));
  return d;
};
S['Mishra, Lost to Phyrexia'] = (d) => {
  const MODES = [
    { label: 'An opponent discards two cards', eff: [{ k: 'discard', n: 2 }] },
    { label: '3 damage to any target', eff: [{ k: 'dmgX', nFn: () => 3, tgt: { what: 'any', f: {} } }] },
    { label: 'Destroy an artifact or planeswalker', eff: [{ k: 'destroyP', tgt: { f: { types: ['Artifact', 'Planeswalker'] } } }] },
    { label: 'Creatures you control gain menace and trample', eff: [{ k: 'pumpAll', side: 'you', p: 0, t: 0, kw: ['menace', 'trample'] }] },
    { label: 'Creatures you don\'t control get -1/-1', eff: [{ k: 'pumpAll', side: 'opp', p: -1, t: -1 }] },
    { label: 'Create two tapped Powerstones', eff: [mkE(L.POWERSTONE, 2, { tapped: true })] },
  ];
  const three = fn((G, X) => {
    const P = X.P;
    const scored = MODES.map((m, k) => ({ k, s: (L.chooseTargets(G, P, m.eff, 'trigger', X.src, X) || { score: -1 }).score }));
    const picks = isHuman(G, P) ? (() => { const out = []; for (let n = 0; n < 3; n++) { const left = MODES.map((m, k) => k).filter((k) => !out.includes(k)); out.push(left[chooseMode(G, P, X.src, `Mishra: choose a mode (${n + 1} of 3)`, left.map((k) => MODES[k].label), 0)]); } return out; })()
      : scored.sort((a, b) => b.s - a.s).slice(0, 3).map((x) => x.k);
    for (const k of picks) L.resolveWithTargets(G, P, X.src, MODES[k].eff, X, 'trigger');
  }, { score: () => 4 });
  d.etb = [three];
  d.trig.push(T('attack', { self: true, eff: [three] }));
  return d;
};

/* ============================================================ Equipment and other artifacts */
S['Bladehold Cleaver'] = (d) => { d.trig.push(T('die', { cond: (G, src, ev) => (ev.eqs || []).includes(src), run: (G, X) => draft(G, X.P, X.src, SPELLBOOK.cleaver) })); return d; };
S['Bladehold War-Whip'] = (d) => {
  d.equipDiscount = true;
  d.statics.push({ who: 'equipped', p: 0, t: 0, kw: ['double strike'] });
  return d;
};
S['Hexgold Halberd'] = (d) => { d.statics.push({ who: 'equipped', cond: (G, src) => G.active === src.ctrl, p: 0, t: 0, kw: ['first strike', 'trample'] }); return d; };
S['Hexgold Hoverwings'] = (d) => {
  d.statics.push({ who: 'equipped', p: 0, t: 0, kw: ['flying'] });
  d.statics.push({ who: 'all', f: { side: 'you', fn: (G, c) => equipped(G, c) }, p: 1, t: 0, kw: [] });
  return d;
};
S['Hexgold Sledge'] = (d) => { d.etb.push(fn((G, X) => conjure(G, X.P, 'Goblin Gaveleer', 'bf'), { score: () => 1 })); return d; };
S['Goblin Gaveleer'] = (d) => { d.statics.push({ who: 'self', pFn: (G, src) => 2 * equipmentOn(G, src).length, p: 0, t: 0, kw: [] }); return d; };
S['Phyrexian Dragon Engine'] = (d) => {
  d.trig.push(T('enter', { self: true, cond: (G, src, ev) => ev.from === 'gy', run: (G, X) => {
    const P = X.P;
    if (isHuman(G, P) ? !yesNo(G, P, X.src, 'Discard your hand and draw three cards?', P.hand.length <= 2) : P.hand.length > 2) return;
    const n = P.hand.length;
    if (n) { const cs = P.hand.splice(0); P.gy.push(...cs); for (const c of cs) L.noteDiscard(G, P, c); emit(G, 'discard', `${P.name} discards their hand.`, { who: P.i }); }
    drawN(G, P, 3);
  } }));
  return d;
};

return S;
});
