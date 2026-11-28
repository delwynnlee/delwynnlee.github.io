// Holo Arena rules engine: the Pokémon TCG as played today (Scarlet & Violet and Mega Evolution rules).
// Synchronous and seeded. A human's decisions arrive as stored answers; when one is missing the engine throws
// NeedInput and the page replays the game from its seed with the answers so far (a game takes milliseconds),
// which keeps every AI decision identical and makes undo free. Same file in the page and in Node.
(function (root, factory) {
  const isNode = typeof module === 'object' && module.exports;
  const lib = factory(isNode ? require('./compile.js') : root.ARENA_COMPILE);
  if (isNode) module.exports = lib;
  else root.ARENA = lib;
})(typeof self !== 'undefined' ? self : this, function (COMPILE) {
  'use strict';
  const { compileCard, TYPES } = COMPILE;

  /* ============================================================
     1. The card pool
     ============================================================ */
  function loadPool(json) {
    const defs = new Map(), byName = new Map();
    for (const raw of json.cards) {
      const def = compileCard(raw);
      if (!def.ok) continue;
      if (raw.std) def.std = true;
      Object.defineProperty(def, '__d', { value: true });
      defs.set(def.id, def);
      if (!byName.has(def.name)) byName.set(def.name, []);
      byName.get(def.name).push(def);
    }
    const alias = json.alias || {};
    const sets = (json.sets || []).map((x) => Object.assign({}, x, { ids: new Set(x.ids) }));
    return { defs, byName, alias, built: json.built, sets, get: (id) => defs.get(id) || defs.get(alias[id]), list: [...defs.values()] };
  }

  /* ============================================================
     2. Seeded randomness
     ============================================================ */
  function makeRng(seed) {
    const r = { s: (seed >>> 0) || 0x9e3779b9 };
    r.next = () => { let s = r.s; s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; r.s = s; return s / 4294967296; };
    r.int = (k) => Math.floor(r.next() * k);
    r.shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r.next() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
    return r;
  }

  /* ============================================================
     3. The game
     ============================================================ */
  const MAX_TURNS = 60;
  const BENCH = 5;
  const PERSONAS = {
    aggro:    { label: 'Aggro',    bench: 4, first: true,  hold: 0.2, gust: 1.25 },
    midrange: { label: 'Midrange', bench: 5, first: true,  hold: 0.5, gust: 1 },
    control:  { label: 'Control',  bench: 5, first: false, hold: 0.8, gust: 0.9 },
  };
  const CONDS = ['asleep', 'burned', 'confused', 'paralyzed', 'poisoned'];
  const COND_WORD = { asleep: 'Asleep', burned: 'Burned', confused: 'Confused', paralyzed: 'Paralyzed', poisoned: 'Poisoned' };

  const opp = (G, P) => G.players[1 - P.i];
  const top = (m) => m.stack[m.stack.length - 1].def;
  const mons = (P) => (P.active ? [P.active] : []).concat(P.bench);
  const allMons = (G) => G.players.flatMap(mons);
  const findMon = (G, id) => allMons(G).find((m) => m.id === id) || null;
  const nm = (m) => top(m).name;
  const isActive = (G, m) => G.players[m.owner].active === m;
  // What a Pokémon's Energy provides: a type letter each, '*' for an Energy of every type (Luminous Energy alone, or Neo
  // Upper Energy twice on a Stage 2), 'C' otherwise
  const energyOf = (m) => m.energy.flatMap((c) => {
    const sp = c.def.special;
    if (!sp) return [c.def.provides];
    if (sp === 'luminous') return [m.energy.some((x) => x !== c && x.def.special) ? 'C' : '*'];
    if (sp === 'neoUpper') return top(m).stage === 2 ? ['*', '*'] : ['C'];
    return [c.def.provides || 'C'];
  });
  const isPokemon = (d) => d.kind === 0;
  const isBasic = (d) => d.kind === 0 && d.stage === 0;
  const isEnergy = (d) => d.kind === 2;
  const ruleBox = (d) => d.kind === 0 && (d.ex || d.mega);
  const plural = (k, one, many) => `${k} ${k === 1 ? one : many || one + 's'}`;
  const list = (xs) => (xs.length <= 2 ? xs.join(' and ') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

  function newCard(G, def, owner) { return { id: G.nextId++, def, owner }; }
  function newMon(G, P, card) {
    return { id: card.id, owner: P.i, stack: [card], energy: [], tool: null, dmg: 0, cond: { p: 0, b: false, r: null, until: 0 }, since: G.turn, evolvedAt: -1, fx: [], used: {} };
  }

  // setup (lessons): { turn, active, players: [{ deck (top first), hand, active: {d, energy, dmg, tool, cond}, bench, prizes (defs or a count), discard, taken }] }
  // ai: 'normal' or 'hard' for both seats, or one per seat. aiCache: the hard AI's decisions from earlier replays of this game.
  function createGame({ decks, seed, pool, human = null, answers = [], record = true, setup = null, first = null, ai = 'normal', aiCache = null }) {
    const rng = makeRng(seed == null ? Date.now() : seed);
    const G = { rng, seed, pool, turn: 0, active: 0, first: 0, players: [], frames: [], record, over: false, winner: null, reason: '',
      nextId: 1, human, answers, qi: 0, setup, stadium: null, stadiumOwner: null, phase: 'setup', forcedFirst: first, aiCache, plan: null };
    decks.forEach((d, i) => {
      const level = Array.isArray(ai) ? ai[i] : d.ai || ai;
      const P = { i, name: d.name, persona: PERSONAS[d.archetype] ? d.archetype : 'midrange', deck: [], hand: [], discard: [], prizes: [], active: null, bench: [],
        ai: level === 'hard' ? 'hard' : 'normal', prizeCount: d.prizes || 6,
        taken: 0, turns: 0, mulligans: 0, flags: {}, boosts: [], koTurn: -9, stats: { damage: 0, kos: 0, trainers: 0, energy: 0, abilities: 0, best: 0 } };
      G.players.push(P);
      const su = setup && setup.players && setup.players[i];
      const mk = (def) => newCard(G, typeof def === 'string' ? pool.get(def) : def, i);
      if (su) {
        P.deck = (su.deck || []).map(mk).reverse();
        P.hand = (su.hand || []).map(mk);
        P.discard = (su.discard || []).map(mk);
        const prizes = su.prizes == null ? 6 : su.prizes;
        P.prizes = Array.isArray(prizes) ? prizes.map(mk) : Array.from({ length: prizes }, () => P.deck.length ? P.deck.shift() : mk(d.cards[0]));
        P.taken = su.taken || 6 - P.prizes.length;
        const place = (s) => {
          const m = newMon(G, P, mk(s.d));
          for (const e of s.st || []) m.stack.unshift(mk(e));
          m.energy = (s.energy || []).map(mk);
          if (s.tool) m.tool = mk(s.tool);
          m.dmg = s.dmg || 0;
          if (s.cond) for (const c of s.cond) setCond(G, m, c, true);
          m.since = s.fresh ? (setup.turn || 1) : -1;
          return m;
        };
        if (su.active) P.active = place(su.active);
        P.bench = (su.bench || []).map(place);
        P.turns = su.turns || 0;
      } else for (const def of d.cards) P.deck.push(mk(def));
    });
    return G;
  }

  /* ---------- Replay frames ---------- */
  function monSnap(G, m) {
    const d = top(m);
    const o = { id: m.id, d: d.id, hp: maxHp(G, m), dmg: m.dmg, e: energyOf(m).join('') };
    if (m.stack.length > 1) o.st = m.stack.slice(0, -1).map((c) => c.def.id);
    if (m.tool) o.t = m.tool.def.id;
    const c = condList(m);
    if (c.length) o.c = c;
    const fx = [...new Set(m.fx.filter((f) => f.until >= G.turn).map((f) => f.k))];
    if (fx.length) o.fx = fx;
    if (m.since === G.turn) o.fresh = 1;
    return o;
  }
  function snap(G) {
    return {
      turn: G.turn, active: G.active, phase: G.phase,
      stadium: G.stadium ? [G.stadium.id, G.stadium.def.id, G.stadiumOwner] : null,
      p: G.players.map((P) => ({
        deck: P.deck.length, hand: P.hand.map((c) => [c.id, c.def.id]), prizes: P.prizes.length, taken: P.taken,
        discard: P.discard.length, dtop: P.discard.slice(-4).map((c) => [c.id, c.def.id]), dl: P.discard.map((c) => c.def.id),
        active: P.active ? monSnap(G, P.active) : null, bench: P.bench.map((m) => monSnap(G, m)),
        energyUsed: P.flags.energy === G.turn ? 1 : 0, supporterUsed: P.flags.supporter === G.turn ? 1 : 0,
      })),
    };
  }
  function emit(G, k, text, extra) {
    if (!G.record) return;
    G.frames.push(Object.assign({ k, text, turn: G.turn, who: G.active }, extra || {}, { s: snap(G) }));
  }

  /* ---------- A human at the table ---------- */
  function NeedInput(req) { this.req = req; }
  const isHuman = (G, P) => G.human != null && P.i === G.human;
  function ask(G, req) {
    if (G.qi < G.answers.length) {
      const a = G.answers[G.qi++];
      if (!a || a.type !== req.type) throw new Error(`Replay out of step at answer ${G.qi - 1}: expected ${req.type}, got ${a && a.type}`);
      return a;
    }
    req.s = snap(G);
    req.turn = G.turn; req.active = G.active; req.phase = G.phase; req.qi = G.qi;
    throw new NeedInput(req);
  }
  // choose cards from a list (search, discard, pick prizes...). Humans answer with ids; short answers are topped up the same way every replay.
  function pickCards(G, P, cards, min, max, reason, aiOrder, extra) {
    max = Math.min(max, cards.length); min = Math.min(min, max);
    if (!cards.length || max <= 0) return [];
    if (!isHuman(G, P)) return aiOrder(cards.slice()).slice(0, max).filter((c, i) => i < min || c.keep !== false);
    const req = Object.assign({ type: 'pick', reason, min, max, cards: cards.map((c) => c.id), defs: Object.fromEntries(cards.map((c) => [c.id, c.def.id])) }, extra || {});
    const a = ask(G, req);
    const chosen = [];
    for (const id of a.ids || []) { const c = cards.find((x) => x.id === id); if (c && !chosen.includes(c) && chosen.length < max) chosen.push(c); }
    for (const c of cards) if (chosen.length < min && !chosen.includes(c)) chosen.push(c);
    return chosen;
  }
  function pickMon(G, P, cands, reason, aiScore, may = false, extra) {
    if (!cands.length) return null;
    if (!isHuman(G, P)) {
      let best = null, bv = -Infinity;
      for (const m of cands) { const v = aiScore(m); if (v > bv) { bv = v; best = m; } }
      return may && bv <= 0 ? null : best;
    }
    if (cands.length === 1 && !may) return cands[0];
    const a = ask(G, Object.assign({ type: 'target', reason, ids: cands.map((m) => m.id), may }, extra || {}));
    if (a.id == null) return may ? null : cands[0];
    return cands.find((m) => m.id === a.id) || (may ? null : cands[0]);
  }
  function yes(G, P, reason, aiYes, extra) {
    if (!isHuman(G, P)) return !!aiYes;
    return !!ask(G, Object.assign({ type: 'yes', reason }, extra || {})).yes;
  }

  /* ---------- Coins ---------- */
  function flip(G, P, why) {
    const h = G.rng.next() < 0.5;
    emit(G, 'coin', `${why ? why + ': ' : ''}${h ? 'heads' : 'tails'}.`, { coin: h ? 'heads' : 'tails', who: P.i });
    return h;
  }
  function flipMany(G, P, n, why) {
    let heads = 0;
    const res = [];
    if (n === 'tails') { while (heads < 30) { const h = G.rng.next() < 0.5; res.push(h); if (!h) break; heads++; } }
    else for (let i = 0; i < n; i++) { const h = G.rng.next() < 0.5; res.push(h); if (h) heads++; }
    emit(G, 'coin', `${why ? why + ': ' : ''}${res.map((h) => (h ? 'heads' : 'tails')).join(', ')}.`, { coins: res.map((h) => (h ? 'heads' : 'tails')), who: P.i });
    return heads;
  }

  /* ============================================================
     4. State helpers
     ============================================================ */
  function toolFx(G, m) {
    if (!m.tool) return null;
    if (G.stadium && G.stadium.def.stadium && G.stadium.def.stadium.k === 'noTools') return null;
    return m.tool.def.tool || null;
  }
  function maxHp(G, m) {
    const d = top(m);
    let h = d.hp;
    const t = toolFx(G, m);
    if (t && t.k === 'hp' && (!t.basic || d.stage === 0)) h += t.n;
    return h;
  }
  const hpLeft = (G, m) => maxHp(G, m) - m.dmg;
  function condList(m) {
    const c = [];
    if (m.cond.p) c.push('poisoned');
    if (m.cond.b) c.push('burned');
    if (m.cond.r) c.push(m.cond.r);
    return c;
  }
  function setCond(G, m, c, quiet) {
    if (top(m).abil.some((a) => a.k === 'noEffects' && a.conds)) return false;
    if (c === 'poisoned') m.cond.p = Math.max(m.cond.p, 1);
    else if (c === 'burned') m.cond.b = true;
    else { m.cond.r = c; if (c === 'paralyzed') m.cond.until = G.turn + 1; }
    if (!quiet) emit(G, 'cond', `${nm(m)} is now ${COND_WORD[c]}.`, { hl: [m.id] });
    return true;
  }
  function clearOnMove(m) { m.cond = { p: 0, b: false, r: null, until: 0 }; m.fx = []; }
  function canPay(energies, cost) {
    const pool = {};
    let wild = 0;
    for (const e of energies) if (e === '*') wild++; else pool[e] = (pool[e] || 0) + 1;
    let colorless = 0;
    for (const ch of cost) {
      if (ch === 'C') { colorless++; continue; }
      if (pool[ch]) pool[ch]--; else if (wild) wild--; else return false;
    }
    let rest = wild;
    for (const k in pool) rest += pool[k];
    return rest >= colorless;
  }
  // how many more Energy (and of which types) a Pokémon needs for an attack
  function shortfall(energies, cost) {
    const pool = {};
    let wild = 0;
    for (const e of energies) if (e === '*') wild++; else pool[e] = (pool[e] || 0) + 1;
    const need = [];
    let colorless = 0;
    for (const ch of cost) {
      if (ch === 'C') { colorless++; continue; }
      if (pool[ch]) pool[ch]--; else if (wild) wild--; else need.push(ch);
    }
    let rest = wild;
    for (const k in pool) rest += pool[k];
    for (let i = rest; i < colorless; i++) need.push('C');
    return need;
  }
  function retreatCost(G, m) {
    const d = top(m);
    for (const a of d.abil) if (a.k === 'freeRetreat' && (a.always || (a.withType ? energyOf(m).includes(a.withType) : m.energy.length === 0))) return 0;
    const P = G.players[m.owner];
    if (d.stage === 0 && mons(P).some((x) => top(x).abil.some((a) => a.k === 'teamFreeRetreat'))) return 0;
    let c = d.retreat;
    const t = toolFx(G, m);
    if (t && t.k === 'retreat' && (!t.stage || t.stage === d.stage)) { c = Math.max(0, c - t.n); if (t.freeAt && hpLeft(G, m) <= t.freeAt) c = 0; }
    return c;
  }
  const activeFx = (G, m, k) => m.fx.filter((f) => f.k === k && f.until >= G.turn);
  // A Pokémon's attacks: its own, then the attack on a Technical Machine attached to it
  function atksOf(G, m) {
    const t = toolFx(G, m);
    return t && t.k === 'tm' && m.tool.def.tmAtks ? top(m).atks.concat(m.tool.def.tmAtks) : top(m).atks;
  }
  // What an attack costs this Pokémon right now (Bloodmoon Ursaluna ex's Blood Moon costs less as the opponent takes Prize cards)
  function costOf(G, m, a) {
    let cost = a.cost;
    const cl = abilOf(G, m).find((x) => x.k === 'costLess' && x.atk === a.name.toLowerCase());
    if (cl) { let k = G.players[1 - m.owner].taken || 0; while (k-- > 0 && cost.includes('C')) cost = cost.replace('C', ''); }
    return cost;
  }
  // The Abilities a Pokémon has right now: an Active Pokémon facing Flutter Mane has none (but that one)
  function abilOf(G, m) {
    const d = top(m);
    if (!d.abil.length || !G.players[m.owner] || G.players[m.owner].active !== m) return d.abil;
    const F = G.players[1 - m.owner].active;
    if (F && top(F).abil.some((a) => a.k === 'lockAbilities')) return d.abil.filter((a) => a.k === 'lockAbilities');
    return d.abil;
  }
  function canAttackWith(G, P, m, i) {
    if (P.active !== m || G.turn <= 1 && P.i === G.first && P.turns <= 1) return false;
    if (m.cond.r === 'asleep' || m.cond.r === 'paralyzed') return false;
    if (activeFx(G, m, 'noAttack').length) return false;
    const a = atksOf(G, m)[i];
    if (!a) return false;
    if (activeFx(G, m, 'lockSelf').some((f) => !f.atk || f.atk === a.name.toLowerCase())) return false;
    if (P.i !== G.first && P.turns === 1 && a.fx.some((f) => f.k === 'notFirst')) return false;
    return canPay(energyOf(m), costOf(G, m, a));
  }
  function canRetreat(G, P) {
    const m = P.active;
    if (!m || !P.bench.length || P.flags.retreated === G.turn) return false;
    if (m.cond.r === 'asleep' || m.cond.r === 'paralyzed') return false;
    if (activeFx(G, m, 'noRetreat').length) return false;
    return energyOf(m).length >= retreatCost(G, m);
  }
  function canEvolve(G, P, m, d) {
    return d.kind === 0 && d.stage > 0 && d.from === nm(m) && P.turns > 1 && m.since < G.turn && m.evolvedAt !== G.turn;
  }
  function stage1For(G, stage2, basicName) {
    return (G.pool.byName.get(stage2.from) || []).some((s1) => s1.stage === 1 && s1.from === basicName);
  }
  function candyPairs(G, P) {
    if (P.turns <= 1) return [];
    const out = [];
    for (const c of P.hand) {
      if (!isPokemon(c.def) || c.def.stage !== 2) continue;
      for (const m of mons(P)) if (top(m).stage === 0 && m.since < G.turn && m.evolvedAt !== G.turn && stage1For(G, c.def, nm(m))) out.push([c, m]);
    }
    return out;
  }

  /* ---------- Moving cards ---------- */
  function draw(G, P, k) {
    let got = 0;
    for (let i = 0; i < k; i++) { if (!P.deck.length) break; P.hand.push(P.deck.pop()); got++; }
    return got;
  }
  function shuffleDeck(G, P) { G.rng.shuffle(P.deck); }
  function discardCards(G, P, cards) {
    for (const c of cards) {
      const i = P.hand.indexOf(c);
      if (i >= 0) P.hand.splice(i, 1);
      P.discard.push(c);
    }
  }
  function takeFrom(arr, c) { const i = arr.indexOf(c); if (i >= 0) arr.splice(i, 1); return c; }
  function toBench(G, P, card, why) {
    takeFrom(P.hand, card); takeFrom(P.deck, card); takeFrom(P.discard, card);
    const m = newMon(G, P, card);
    P.bench.push(m);
    return m;
  }
  // Risky Ruins: Basic Pokémon (not Darkness) put onto the Bench during their owner's turn take damage counters
  function benchHurt(G, P, m) {
    const s = G.stadium && G.stadium.def.stadium, d = top(m);
    if (!s || s.k !== 'benchHurt' || G.active !== P.i || d.stage !== 0 || d.types.includes(s.notType)) return;
    m.dmg += s.n * 10;
    emit(G, 'damage', `${G.stadium.def.name}: ${plural(s.n, 'damage counter')} on ${d.name}.`, { hl: [m.id], hits: [[m.id, s.n * 10]] });
  }
  // Battle Cage: no damage counters on Benched Pokémon from the effects of the other player's attacks and Abilities
  function caged(G, ctx, m) {
    const s = G.stadium && G.stadium.def.stadium;
    return !!(s && s.k === 'cage' && ctx.src && m.owner !== ctx.P.i && !isActive(G, m));
  }
  // Genesect's ACE Nullifier: with a Tool attached, the other player can't play ACE SPEC cards
  const aceLocked = (G, P) => mons(opp(G, P)).some((m) => m.tool && abilOf(G, m).some((a) => a.k === 'aceLock'));
  function attachEnergy(G, P, m, card) {
    takeFrom(P.hand, card); takeFrom(P.deck, card); takeFrom(P.discard, card);
    m.energy.push(card);
  }
  function removeEnergy(G, P, m, cards) {
    for (const c of cards) { takeFrom(m.energy, c); G.players[c.owner].discard.push(c); }
  }
  function leavePlay(G, m) {
    const P = G.players[m.owner];
    if (P.active === m) P.active = null;
    takeFrom(P.bench, m);
    P.discard.push(...m.stack, ...m.energy);
    if (m.tool) P.discard.push(m.tool);
    m.stack = [m.stack[0]]; m.energy = []; m.tool = null;
  }
  function switchActive(G, P, b, why) {
    const old = P.active;
    takeFrom(P.bench, b);
    if (old) { clearOnMove(old); P.bench.push(old); }
    clearOnMove(b);
    P.active = b;
    b.movedUp = G.turn;
    if (why !== false) emit(G, 'switch', `${b ? nm(b) : ''} is now ${P.name}'s Active Pokémon.`, { who: P.i, hl: [b.id] });
  }

  /* ============================================================
     5. AI judgement: what a card or a Pokémon is worth right now
     ============================================================ */
  function attackPower(d) {
    let best = 0;
    for (const a of d.atks || []) {
      let dm = a.base;
      for (const f of a.fx) {
        if (f.k === 'coins') dm = f.coins === 'tails' ? f.n : (f.n * f.coins) / 2 + (f.more ? a.base : 0);
        if (f.k === 'plus') dm += f.n / 2;
        if (f.k === 'scale' && f.how !== 'less') dm += f.n * 1.5;
        if (f.k === 'bonus') dm += f.n * 0.35;
        if (f.k === 'snipe' || f.k === 'spread') dm += f.n;
        if (f.k === 'bench') dm += f.n * (f.count === 'all' ? 2 : f.count) * 0.5;
        if (f.k === 'counters' || f.k === 'countersSpread') dm += f.n * 10 * (f.count === 'all' ? 2 : f.count || 1) * 0.8;
        if (f.k === 'perFuel') dm += f.n * 1.5;
        if (f.k === 'ko') dm += 200;
      }
      const cost = Math.max(1, a.cost.length);
      best = Math.max(best, dm / Math.pow(cost, 0.65));
    }
    return best;
  }
  // a rough card quality score used by the deck builder and the AI
  function pokemonScore(d) {
    if (!isPokemon(d)) return 0;
    let v = d.hp / 25 + attackPower(d) / 18;
    for (const a of d.abil) v += a.k === 'once' || a.k === 'evolve' || a.k === 'often' || a.k === 'embrace' ? 2 : 1;
    if (d.prizes > 1) v -= 0.6 * (d.prizes - 1);
    v -= d.retreat * 0.25;
    return v;
  }
  // energy still missing for this Pokémon's best attack
  function mainAttack(m) {
    const d = top(m);
    let best = null, bv = -1;
    for (let i = 0; i < d.atks.length; i++) {
      const a = d.atks[i];
      const v = a.base + a.fx.reduce((s, f) => s + (f.n && /plus|scale|bonus|snipe|spread|bench/.test(f.k) ? f.n : 0), 0) + (a.fx.some((f) => f.k === 'ko') ? 250 : 0) + a.cost.length * 3;
      if (v > bv) { bv = v; best = i; }
    }
    return best;
  }
  // 'hand': discards Energy from hand for damage; 'board': hits harder with more Energy in play; null: just pays its cost
  function energyAppetite(d) {
    let k = null;
    for (const a of d.atks || []) for (const f of a.fx) {
      if (f.k === 'fuel') k = f.from === 'hand' ? 'hand' : k || 'board';
      if (f.k === 'scale' && /selfEnergy|myEnergy|bothActiveEnergy/.test(f.per) && f.how !== 'less') k = k || 'board';
      if (f.k === 'allIn') k = k || 'board';
    }
    return k;
  }
  // draws we can afford before the deck runs out, given how many turns the game might still need
  function drawBudget(G, P) { return P.deck.length - 2 * P.prizes.length - 3; }
  function needs(m) {
    const i = mainAttack(m);
    if (i == null) return [];
    return shortfall(energyOf(m), top(m).atks[i].cost);
  }
  function monWorth(G, m) {
    const d = top(m);
    let v = pokemonScore(d) + m.energy.length * 1.5 + d.stage * 1.5 + (m.tool ? 1 : 0);
    v += d.prizes * 2;
    return v;
  }
  // how much P would like to get card c from somewhere
  function cardNeed(G, P, d) {
    const inPlay = mons(P);
    const names = inPlay.map(nm);
    const handNames = P.hand.map((c) => c.def.name);
    if (isPokemon(d)) {
      if (d.stage === 0) {
        if (P.bench.length >= BENCH) return 0.1;
        const evo = P.deck.concat(P.hand).some((c) => isPokemon(c.def) && c.def.from === d.name);
        const attackers = inPlay.filter((m) => attackPower(top(m)) > 25).length;
        return 3 + (evo ? 2.5 : 0) + (attackers < 2 ? 1.5 : 0) + pokemonScore(d) / 8 - (names.includes(d.name) ? 1.2 : 0) - (handNames.includes(d.name) ? 1.5 : 0);
      }
      if (names.includes(d.from)) return 6 + d.stage + pokemonScore(d) / 8 - (handNames.includes(d.name) ? 3 : 0);
      if (d.stage === 2 && P.hand.some((c) => c.def.name === 'Rare Candy') && inPlay.some((m) => stage1For(G, d, nm(m)))) return 7 - (handNames.includes(d.name) ? 3 : 0);
      if (handNames.includes(d.from)) return 3;
      return 1;
    }
    if (isEnergy(d)) {
      const want = inPlay.flatMap(needs);
      const inHand = P.hand.filter((c) => isEnergy(c.def)).length;
      if (inPlay.some((m) => energyAppetite(top(m)) === 'hand' && [...top(m).types].includes(d.provides))) return 5.5 - inHand * 0.15;
      return (want.includes(d.provides) ? 4 : want.length ? 2.5 : 1) - inHand * 0.8;
    }
    if (d.name === 'Rare Candy') return P.hand.some((c) => isPokemon(c.def) && c.def.stage === 2) && inPlay.some((m) => top(m).stage === 0) ? 6 : 2.2;
    if (d.trainer === 'supporter') return P.flags.supporter === G.turn ? 1.2 : 3.2 - P.hand.filter((c) => c.def.trainer === 'supporter').length * 0.8;
    if (d.trainer === 'tool') return inPlay.some((m) => !m.tool) ? 2 : 0.5;
    if (d.trainer === 'stadium') return 1.2;
    return 2.4;
  }
  const byNeed = (G, P) => (cards) => cards.sort((a, b) => cardNeed(G, P, b.def) - cardNeed(G, P, a.def));
  const byWaste = (G, P) => (cards) => cards.sort((a, b) => cardNeed(G, P, a.def) - cardNeed(G, P, b.def));

  /* ============================================================
     6. Damage
     ============================================================ */
  function weaknessOf(G, target) {
    const t = toolFx(G, target);
    if (t && t.k === 'noWeak' && (!t.basic || top(target).stage === 0)) return [];
    const td = top(target), O = G.players[1 - target.owner];
    if (O) for (const x of mons(O)) for (const a of abilOf(G, x)) if (a.k === 'weakOverride' && td.types.includes(a.on)) return [{ t: a.to, v: '×2' }];
    return td.weak;
  }
  function protectedFromEffects(G, ctx, m) {
    if (!ctx.isAttack || m.owner === ctx.P.i) return false;
    if (abilOf(G, m).some((a) => a.k === 'noEffects' && !a.conds)) return true;
    if (!isActive(G, m) && top(m).abil.some((a) => a.k === 'benchShield')) return true;
    return m.fx.some((f) => f.k === 'protect' && f.fx && f.until >= G.turn);
  }
  // damage an attack would do to target, after every modifier
  function attackDamage(G, ctx, target, base, mainTarget) {
    const A = ctx.src, P = ctx.P, d = top(A), td = top(target);
    if (base <= 0) return 0;
    const active = isActive(G, target);
    let dmg = base;
    if (active) {
      const t = toolFx(G, A);
      if (t && t.k === 'dmg' && (!t.vsEx || td.ex) && (!t.behind || P.prizes.length > opp(G, P).prizes.length)) dmg += t.n;
      for (const b of P.boosts) if (!b.vsEx || td.ex) dmg += b.n;
      for (const f of activeFx(G, A, 'weakened')) dmg -= f.n;
      const aura = abilOf(G, target).find((a) => a.k === 'aura');
      if (aura) dmg -= aura.n;
      dmg = Math.max(0, dmg);
      if (!ctx.noWR) {
        for (const w of weaknessOf(G, target)) if (d.types.includes(w.t)) dmg = w.v[0] === '+' ? dmg + (parseInt(w.v.slice(1), 10) || 0) : dmg * (parseInt(w.v.replace(/[^0-9]/g, ''), 10) || 2);
        if (!ctx.noRes) for (const r of td.res) if (d.types.includes(r.t)) dmg += r.v;
      }
      dmg = Math.max(0, dmg);
    } else if (td.tera || td.abil.some((a) => a.k === 'benchShield')) return 0;
    else if (!ruleBox(td) && target.owner !== P.i && mons(G.players[target.owner]).some((x) => abilOf(G, x).some((a) => a.k === 'flowerCurtain'))) return 0;
    if (!ctx.pierce) {
      for (const f of target.fx) {
        if (f.until < G.turn) continue;
        if (f.k === 'shield') dmg -= f.n;
        if (f.k === 'vulnerable') dmg += f.n;
        if (f.k === 'protect' && (!f.from || (f.from === 'basic' && d.stage === 0) || (f.from === 'basicNonC' && d.stage === 0 && !d.types.includes('C')) || (f.from === 'ex' && d.ex))) dmg = 0;
      }
      const tt = toolFx(G, target);
      if (tt && tt.k === 'shield' && (!tt.type || td.types.includes(tt.type)) && (!tt.stage || tt.stage === td.stage)) dmg -= tt.n;
    }
    for (const a of abilOf(G, target)) {
      if (a.k === 'shield' && (!a.full || target.dmg === 0)) dmg -= a.n;
      if (a.k === 'exShield' && d.ex) dmg = 0;
    }
    return Math.max(0, dmg);
  }
  function putDamage(G, ctx, target, amount, label) {
    if (amount <= 0) return 0;
    const td = top(target);
    if (ctx.isAttack && target.owner !== ctx.P.i && abilOf(G, target).some((a) => a.k === 'dodge')) {
      if (flip(G, G.players[target.owner], `${td.name} tries to dodge`)) { emit(G, 'prevent', `${td.name} takes no damage.`, { hl: [target.id] }); return 0; }
    }
    const st = abilOf(G, target).find((a) => a.k === 'sturdy');
    if (ctx.isAttack && st && target.dmg + amount >= maxHp(G, target) && (st.flip ? flip(G, G.players[target.owner], `${td.name}'s ${st.name}`) : target.dmg === 0)) {
      amount = Math.max(0, maxHp(G, target) - st.hp - target.dmg);
      target.dmg += amount;
      emit(G, 'damage', `${td.name} hangs on with ${st.hp} HP.`, { hl: [target.id], hits: [[target.id, amount]] });
      return amount;
    }
    target.dmg += amount;
    if (ctx.P && target.owner !== ctx.P.i) { ctx.P.stats.damage += amount; if (amount > ctx.P.stats.best) ctx.P.stats.best = amount; }
    emit(G, 'damage', `${label || ''}${amount} damage to ${td.name}.`, { hl: [target.id], hits: [[target.id, amount]] });
    if (ctx.isAttack && isActive(G, target) && target.owner !== ctx.P.i) afterHit(G, ctx, target);
    return amount;
  }
  function afterHit(G, ctx, target) {
    const A = ctx.src, O = G.players[target.owner];
    for (const a of abilOf(G, target)) {
      if (a.k === 'retaliate' && A) { A.dmg += a.n * 10; emit(G, 'damage', `${a.name}: ${a.n * 10} damage to ${nm(A)}.`, { hl: [A.id], hits: [[A.id, a.n * 10]] }); }
      if (a.k === 'retaliateCond' && A && !protectedSelf(A)) setCond(G, A, a.c);
    }
    const t = toolFx(G, target);
    if (t && t.k === 'retaliate' && A) { A.dmg += t.n * 10; emit(G, 'damage', `${target.tool.def.name}: ${t.n * 10} damage to ${nm(A)}.`, { hl: [A.id], hits: [[A.id, t.n * 10]] }); }
    if (t && t.k === 'helmet') { const got = draw(G, O, t.n); if (got) emit(G, 'draw', `${O.name} draws ${plural(got, 'card')} from ${target.tool.def.name}.`, { who: O.i }); }
  }
  const protectedSelf = (m) => top(m).abil.some((a) => a.k === 'noEffects');

  /* ============================================================
     7. Effects
     ============================================================ */
  function countFor(G, ctx, per, type) {
    const P = ctx.P, O = ctx.O, A = ctx.src, D = O.active;
    const en = (m, t) => (m ? energyOf(m).filter((e) => !t || e === t).length : 0);
    switch (per) {
      case 'selfEnergy': return en(A, type);
      case 'oppEnergy': return en(D, type);
      case 'myEnergy': return mons(P).reduce((s, m) => s + en(m, type), 0);
      case 'oppAllEnergy': return mons(O).reduce((s, m) => s + en(m), 0);
      case 'bothActiveEnergy': return en(A) + en(D);
      case 'selfCounters': return A ? A.dmg / 10 : 0;
      case 'oppCounters': return D ? D.dmg / 10 : 0;
      case 'myCounters': return mons(P).reduce((s, m) => s + m.dmg / 10, 0);
      case 'myBench': return P.bench.length;
      case 'oppBench': return O.bench.length;
      case 'allBench': return P.bench.length + O.bench.length;
      case 'myInPlay': return mons(P).length;
      case 'oppTaken': return O.taken;
      case 'myTaken': return P.taken;
      case 'oppHand': return O.hand.length;
      case 'myHand': return P.hand.length;
      case 'myDiscardEnergy': return P.discard.filter((c) => isEnergy(c.def)).length;
      case 'myDiscardPokemon': return P.discard.filter((c) => isPokemon(c.def)).length;
      case 'oppRetreat': return D ? retreatCost(G, D) : 0;
      default: return 0;
    }
  }
  function bonusApplies(G, ctx, f) {
    const P = ctx.P, O = ctx.O, A = ctx.src, D = O.active;
    const dd = D ? top(D) : null;
    switch (f.when) {
      case 'oppDamaged': return !!D && D.dmg > 0;
      case 'selfDamaged': return !!A && A.dmg > 0;
      case 'oppEx': return !!dd && dd.ex;
      case 'oppMega': return !!dd && dd.mega;
      case 'oppEvolved': return !!dd && dd.stage > 0;
      case 'oppBasic': return !!dd && dd.stage === 0;
      case 'oppCond': return !!D && condList(D).includes(f.c);
      case 'oppAnyCond': return !!D && condList(D).length > 0;
      case 'revenge': return P.koTurn === G.turn - 1;
      case 'behind': return P.prizes.length > O.prizes.length;
      case 'oppPrizesLE': return O.prizes.length <= f.v;
      case 'myPrizesLE': return P.prizes.length <= f.v;
      case 'selfEnergyGE': return !!A && A.energy.length >= f.v;
      case 'extraEnergy': return !!A && A.energy.length - ctx.atk.cost.length >= f.v;
      case 'oppAbility': return !!dd && dd.abil.length > 0;
      case 'playedSupporter': return P.flags.supporter === G.turn;
      case 'stadium': return !!G.stadium;
      case 'evolvedThisTurn': return !!A && A.evolvedAt === G.turn;
      case 'myBenchDamaged': return P.bench.some((m) => m.dmg > 0);
      case 'selfTool': return !!A && !!A.tool;
      case 'moreCards': return P.hand.length > O.hand.length;
      case 'oppHandLE': return O.hand.length <= f.v;
      default: return false;
    }
  }
  const PRE = new Set(['coins', 'flip', 'flipAll', 'flipAny', 'scale', 'perHeads', 'bonus', 'plus', 'noWR', 'noRes', 'pierce', 'gust', 'toolsOff', 'hitNew', 'snipe', 'fuel', 'perFuel', 'nothing', 'stadiumBonus', 'allIn', 'notFirst']);
  function preFx(G, ctx, f) {
    const P = ctx.P;
    switch (f.k) {
      case 'coins': {
        const heads = flipMany(G, P, f.coins, ctx.atk.name);
        if (f.more) ctx.plus += f.n * heads; else ctx.times = f.n * heads;
        break;
      }
      case 'flip': case 'flipAll': case 'flipAny': {
        let fxs;
        if (f.k === 'flip') fxs = flip(G, P, ctx.atk ? ctx.atk.name : ctx.label) ? f.heads : f.tails;
        else { const coins = f.coins; const h = flipMany(G, P, coins, ctx.atk ? ctx.atk.name : ctx.label); fxs = f.k === 'flipAll' ? (h === coins ? f.fx : []) : (h < coins ? f.fx : []); }
        for (const g of fxs) { if (PRE.has(g.k)) preFx(G, ctx, g); else ctx.post.push(g); }
        break;
      }
      case 'nothing': ctx.nothing = true; break;
      case 'scale': {
        const k = countFor(G, ctx, f.per, f.type);
        if (f.how === 'times') ctx.times = f.n * k; else if (f.how === 'less') ctx.plus -= f.n * k; else ctx.plus += f.n * k;
        break;
      }
      case 'bonus': if (bonusApplies(G, ctx, f)) ctx.plus += f.n; break;
      case 'plus': ctx.plus += f.n; break;
      case 'noWR': ctx.noWR = true; break;
      case 'noRes': ctx.noRes = true; break;
      case 'pierce': ctx.pierce = true; break;
      case 'hitNew': ctx.times = f.n; break;
      case 'toolsOff': { const D = ctx.O.active; if (D && D.tool && !protectedFromEffects(G, ctx, D)) { ctx.O.discard.push(D.tool); emit(G, 'tool', `${D.tool.def.name} is discarded from ${nm(D)}.`); D.tool = null; } break; }
      case 'gust': {
        const O = ctx.O;
        const b = pickMon(G, P, O.bench, 'gust', (m) => gustValue(G, P, m, ctx));
        if (b) switchActive(G, O, b);
        break;
      }
      case 'snipe': {
        const cands = mons(ctx.O);
        const amt = f.perSelf ? f.perSelf * Math.floor(ctx.src.dmg / 10) : f.n;
        const t = pickMon(G, P, cands, 'snipe', (m) => koValue(G, P, m, amt, ctx));
        if (t) { ctx.snipe = t; ctx.times = amt; }
        break;
      }
      case 'fuel': {
        if (f.from === 'hand') {
          const hand = P.hand.filter((c) => isEnergy(c.def) && (!f.basic || c.def.basicEnergy));
          const keepH = aiFuelCount(G, ctx, f, hand.length);
          const chosenH = pickCards(G, P, hand, 0, Math.min(f.max, hand.length), 'fuelHand', (x) => x.slice(0, keepH), { attack: ctx.atk.name });
          discardCards(G, P, chosenH);
          ctx.fuel = chosenH.length;
          if (chosenH.length) emit(G, 'discard', `${P.name} discards ${plural(chosenH.length, 'Energy card')} from their hand for ${ctx.atk.name}.`);
          break;
        }
        const pool = (f.from === 'self' ? [ctx.src] : mons(P)).flatMap((m) => m.energy.map((c) => [m, c])).filter(([, c]) => !f.type || c.def.provides === f.type);
        // spend Benched Energy first, and the attacker's own last, so it can still attack next turn
        const costLeft = ctx.atk.cost.length;
        pool.sort(([ma], [mb]) => (ma === ctx.src ? 1 : 0) - (mb === ctx.src ? 1 : 0));
        if (pool.filter(([m]) => m === ctx.src).length > costLeft) {
          const own = pool.filter(([m]) => m === ctx.src);
          const spare = own.slice(0, own.length - costLeft);
          const keep = own.slice(own.length - costLeft);
          pool.splice(pool.length - own.length, own.length, ...spare, ...keep);
        }
        const cards = pool.map(([, c]) => c);
        const keep = aiFuelCount(G, ctx, f, cards.length);
        let chosen;
        if (f.exact) chosen = cards.length >= f.exact && yes(G, P, 'fuel', keep >= f.exact, { n: f.exact, attack: ctx.atk.name }) ? (isHuman(G, P) ? pickCards(G, P, cards, f.exact, f.exact, 'fuel', (x) => x) : cards.slice(-f.exact)) : [];
        else chosen = pickCards(G, P, cards, 0, Math.min(f.max, cards.length), 'fuel', (x) => x.slice(0, keep), { attack: ctx.atk.name });
        for (const c of chosen) { const m = pool.find(([, x]) => x === c)[0]; removeEnergy(G, P, m, [c]); }
        ctx.fuel = chosen.length;
        if (chosen.length) emit(G, 'discard', `${P.name} discards ${plural(chosen.length, 'Energy', 'Energy')} for ${ctx.atk.name}.`);
        break;
      }
      case 'perFuel': if (f.more) ctx.plus += f.n * ctx.fuel; else ctx.times = f.n * ctx.fuel; break;
      case 'perHeads': case 'notFirst': break;
      case 'stadiumBonus': {
        if (G.stadium && yes(G, P, 'stadiumBonus', G.stadiumOwner !== P.i || bestAttack(G, P).dmg + f.n >= (ctx.O.active ? hpLeft(G, ctx.O.active) : 999), { n: f.n, stadium: G.stadium.def.name })) {
          G.players[G.stadiumOwner].discard.push(G.stadium);
          emit(G, 'stadium', `${G.stadium.def.name} is discarded.`);
          G.stadium = null; G.stadiumOwner = null;
          ctx.plus += f.n;
        }
        break;
      }
      case 'allIn': {
        const A = ctx.src;
        if (A && A.energy.length && yes(G, P, 'allIn', !isHuman(G, P) && ctx.O.active && bestAttack(G, P).dmg < hpLeft(G, ctx.O.active) && bestAttack(G, P).dmg + f.n >= hpLeft(G, ctx.O.active), { n: f.n, mon: A.id })) {
          const k = A.energy.length;
          removeEnergy(G, P, A, A.energy.slice());
          emit(G, 'discard', `${nm(A)} discards ${plural(k, 'Energy', 'Energy')}.`, { hl: [A.id] });
          ctx.plus += f.n;
        }
        break;
      }
      default: break;
    }
  }
  function aiFuelCount(G, ctx, f, have) {
    if (isHuman(G, ctx.P)) return 0;
    const D = ctx.snipe || ctx.O.active;
    if (!D) return 0;
    const per = (ctx.atk.fx.find((x) => x.k === 'perFuel') || { n: 0 }).n || 1;
    let k = 0;
    // the smallest number of cards that knocks the target out, counting every modifier
    for (k = 1; k <= Math.min(have, f.max); k++) {
      const dmg = attackDamage(G, ctx, D, Math.max(0, per * k + (ctx.times != null && !ctx.atk.fx.some((x) => x.k === 'perFuel' && !x.more) ? ctx.times : 0) + ctx.plus), true);
      if (dmg >= hpLeft(G, D)) return k;
    }
    // no knock out: hand fuel goes all in, board fuel keeps something for next turn
    return f.from === 'hand' ? Math.min(have, f.max) : Math.min(have, f.max, 3);
  }

  // the effect list of attacks, trainers and abilities
  function runFx(G, ctx, fx) {
    for (const f of fx) {
      if (G.over) return;
      doFx(G, ctx, f);
    }
  }
  function doFx(G, ctx, f) {
    const P = ctx.P, O = ctx.O, A = ctx.src;
    const D = O.active;
    const who = (m) => nm(m);
    switch (f.k) {
      case 'cond': {
        if (f.who === 'self') { if (A) for (const c of f.c) setCond(G, A, c); break; }
        if (D && !protectedFromEffects(G, ctx, D)) for (const c of f.c) setCond(G, D, c);
        break;
      }
      case 'poisonN': if (D && D.cond.p) D.cond.p = Math.max(D.cond.p, f.n); break;
      case 'selfDmg': if (A && (!f.ifKo || ctx.koDone)) { A.dmg += f.n; emit(G, 'damage', `${who(A)} does ${f.n} damage to itself.`, { hl: [A.id], hits: [[A.id, f.n]] }); } break;
      case 'heal': {
        const heal = (m, k) => { const h = Math.min(m.dmg, k); if (h > 0) { m.dmg -= h; emit(G, 'heal', `${who(m)} heals ${h} damage.`, { hl: [m.id], heals: [[m.id, h]] }); } if (f.stripAll && m.energy.length) removeEnergy(G, P, m, m.energy.slice()); };
        if (f.who === 'self') { if (A) heal(A, f.n); }
        else if (f.who === 'all') mons(P).forEach((m) => heal(m, f.n));
        else if (f.who === 'active') { if (P.active) heal(P.active, f.n); }
        else {
          const cands = (f.who === 'bench' ? P.bench : mons(P)).filter((m) => m.dmg > 0);
          for (let k = 0; k < (f.count || 1); k++) {
            const t = pickMon(G, P, cands, 'heal', (m) => Math.min(m.dmg, f.n) + monWorth(G, m) + (isActive(G, m) ? 5 : 0), (f.count || 1) > 1 && k > 0, { n: f.n });
            if (!t) break;
            heal(t, f.n);
            takeFrom(cands, t);
          }
        }
        break;
      }
      case 'drain': if (A && ctx.dealt) { const h = Math.min(A.dmg, ctx.dealt); if (h) { A.dmg -= h; emit(G, 'heal', `${who(A)} heals ${h} damage.`, { hl: [A.id], heals: [[A.id, h]] }); } } break;
      case 'discardSelfEnergy': {
        if (!A || !A.energy.length) break;
        const pool = A.energy.filter((c) => !f.type || c.def.provides === f.type);
        const k = f.n === 'all' ? pool.length : Math.min(f.n, pool.length);
        const chosen = f.n === 'all' ? pool : pickCards(G, P, pool, k, k, 'discardEnergy', (x) => x.sort((a, b) => (needs(A).includes(a.def.provides) ? 1 : 0) - (needs(A).includes(b.def.provides) ? 1 : 0)), { mon: A.id });
        removeEnergy(G, P, A, chosen);
        if (chosen.length) emit(G, 'discard', `${who(A)} discards ${plural(chosen.length, 'Energy', 'Energy')}.`, { hl: [A.id] });
        break;
      }
      case 'returnEnergy': {
        if (!A || !A.energy.length) break;
        const chosen = pickCards(G, P, A.energy.slice(), f.n, f.n, 'returnEnergy', (x) => x, { mon: A.id });
        for (const c of chosen) { takeFrom(A.energy, c); P.hand.push(c); }
        emit(G, 'move', `${P.name} returns ${plural(chosen.length, 'Energy', 'Energy')} to their hand.`);
        break;
      }
      case 'lockSelf': if (A) A.fx.push({ k: 'lockSelf', until: G.turn + 2, atk: f.atk || null }); break;
      case 'shield': if (A) { A.fx.push({ k: 'shield', n: f.n, until: G.turn + 1 }); emit(G, 'effect', `${who(A)} will take ${f.n} less damage next turn.`, { hl: [A.id] }); } break;
      case 'protect': if (A) { A.fx.push({ k: 'protect', from: f.from || null, fx: !!f.fx, until: G.turn + 1 }); emit(G, 'effect', `${who(A)} is protected next turn.`, { hl: [A.id] }); } break;
      case 'vulnerable': if (D && !protectedFromEffects(G, ctx, D)) D.fx.push({ k: 'vulnerable', n: f.n, until: G.turn + 2 }); break;
      case 'noRetreat': if (D && !protectedFromEffects(G, ctx, D)) { D.fx.push({ k: 'noRetreat', until: G.turn + 1 }); emit(G, 'effect', `${who(D)} can't retreat next turn.`, { hl: [D.id] }); } break;
      case 'noAttack': if (D && !protectedFromEffects(G, ctx, D)) { D.fx.push({ k: 'noAttack', until: G.turn + 1 }); emit(G, 'effect', `${who(D)} can't attack next turn.`, { hl: [D.id] }); } break;
      case 'weaken': if (D && !protectedFromEffects(G, ctx, D)) { D.fx.push({ k: 'weakened', n: f.n, until: G.turn + 1 }); emit(G, 'effect', `${who(D)}'s attacks do ${f.n} less damage next turn.`, { hl: [D.id] }); } break;
      case 'switchSelf': {
        if (!A || !P.bench.length || P.active !== A) break;
        if (f.may && !yes(G, P, 'switchSelf', aiWantsSwitch(G, P), { mon: A.id })) break;
        const b = pickMon(G, P, P.bench, 'switchIn', (m) => promoteScore(G, P, m));
        if (b) switchActive(G, P, b);
        break;
      }
      case 'switch': {
        if (!P.active || !P.bench.length) break;
        const b = pickMon(G, P, P.bench, 'switchIn', (m) => (P.flags.switchTo === m.id ? 1000 : 0) + promoteScore(G, P, m));
        if (b) switchActive(G, P, b);
        break;
      }
      case 'moveEnergy': {
        if (!A || !A.energy.length || !P.bench.length) break;
        const t = pickMon(G, P, P.bench, 'moveEnergyTo', (m) => needs(m).length * 2 + monWorth(G, m));
        if (!t) break;
        const k = f.n === 'all' ? A.energy.length : Math.min(f.n, A.energy.length);
        const chosen = pickCards(G, P, A.energy.slice(), k, k, 'moveEnergy', (x) => x, { mon: A.id });
        for (const c of chosen) { takeFrom(A.energy, c); t.energy.push(c); }
        emit(G, 'energy', `${P.name} moves ${plural(chosen.length, 'Energy', 'Energy')} to ${who(t)}.`, { hl: [t.id] });
        break;
      }
      case 'shiftEnergy': {
        const eOk = (c) => !f.type || c.def.provides === f.type;
        const from = pickMon(G, P, mons(P).filter((m) => m.energy.some(eOk)), 'shiftFrom', (m) => (isActive(G, m) ? -1 : 1) * m.energy.length);
        if (!from) break;
        const to = pickMon(G, P, mons(P).filter((m) => m !== from), 'shiftTo', (m) => needs(m).length * 3 + (isActive(G, m) ? 4 : 0));
        if (!to) break;
        const k = Math.min(f.n || 1, from.energy.length);
        const chosen = pickCards(G, P, from.energy.filter(eOk), 1, k, 'shiftEnergy', (x) => x, { mon: from.id });
        for (const c of chosen) { takeFrom(from.energy, c); to.energy.push(c); }
        emit(G, 'energy', `${P.name} moves ${plural(chosen.length, 'Energy', 'Energy')} from ${who(from)} to ${who(to)}.`, { hl: [to.id] });
        break;
      }
      case 'attachDiscard': case 'attachDeck': {
        const src = f.k === 'attachDeck' ? P.deck : P.discard;
        const pool = src.filter((c) => isEnergy(c.def) && c.def.basicEnergy && (!f.type || c.def.provides === f.type));
        const k = Math.min(f.n || 1, pool.length);
        const chosen = pickCards(G, P, pool, f.k === 'attachDeck' ? 0 : Math.min(1, k), k, 'attachEnergy', byNeed(G, P), { from: f.k === 'attachDeck' ? 'deck' : 'discard' });
        let one = null;
        for (const c of chosen) {
          const targets = one ? [one] : f.to === 'self' && A ? [A] : f.to === 'bench' ? P.bench : f.to === 'stage2' ? mons(P).filter((m) => top(m).stage === 2) : mons(P);
          const t = pickMon(G, P, targets, 'attachTo', (m) => energyTargetScore(G, P, m, c.def), false, { card: c.id, def: c.def.id });
          if (!t) continue;
          if (f.one) one = t;
          attachEnergy(G, P, t, c);
          emit(G, 'energy', `${P.name} attaches ${c.def.name} to ${who(t)}.`, { hl: [t.id] });
        }
        if (f.k === 'attachDeck') shuffleDeck(G, P);
        break;
      }
      case 'attachHand': {
        const pool = P.hand.filter((c) => isEnergy(c.def) && c.def.basicEnergy && (!f.type || c.def.provides === f.type));
        if (!pool.length) break;
        const c = pickCards(G, P, pool, 1, 1, 'attachEnergy', byNeed(G, P), { from: 'hand' })[0];
        const targets = f.to === 'self' && A ? [A] : f.to === 'bench' ? P.bench : mons(P);
        const t = pickMon(G, P, targets, 'attachTo', (m) => energyTargetScore(G, P, m, c.def), false, { card: c.id, def: c.def.id });
        if (!t) break;
        attachEnergy(G, P, t, c);
        emit(G, 'energy', `${P.name} attaches ${c.def.name} to ${who(t)}.`, { hl: [t.id] });
        if (f.draw) { const got = draw(G, P, f.draw); if (got) emit(G, 'draw', `${P.name} draws ${plural(got, 'card')}.`); }
        break;
      }
      case 'strip': case 'stripAny': {
        const ok = (e) => !f.special || e.def.special;
        const t = f.k === 'strip' ? D : pickMon(G, P, mons(O).filter((m) => m.energy.some(ok)), 'strip', (m) => m.energy.filter(ok).length * 2 + monWorth(G, m) + (isActive(G, m) ? 4 : 0));
        if (!t || !t.energy.some(ok) || protectedFromEffects(G, ctx, t)) break;
        const k = f.n === 'all' ? t.energy.length : Math.min(f.n || 1, t.energy.filter(ok).length);
        const chosen = pickCards(G, P, t.energy.filter(ok), k, k, 'stripEnergy', (x) => x.sort((a, b) => (needs(t).includes(b.def.provides) ? 1 : 0) - (needs(t).includes(a.def.provides) ? 1 : 0)).reverse(), { mon: t.id });
        removeEnergy(G, O, t, chosen);
        emit(G, 'discard', `${O.name} discards ${plural(chosen.length, 'Energy', 'Energy')} from ${who(t)}.`, { hl: [t.id] });
        break;
      }
      case 'millOpp': { const k = Math.min(f.n, O.deck.length); for (let i = 0; i < k; i++) O.discard.push(O.deck.pop()); if (k) emit(G, 'discard', `${O.name} discards the top ${plural(k, 'card')} of their deck.`); break; }
      case 'millSelf': { const k = Math.min(f.n, P.deck.length); for (let i = 0; i < k; i++) P.discard.push(P.deck.pop()); if (k) emit(G, 'discard', `${P.name} discards the top ${plural(k, 'card')} of their deck.`); break; }
      case 'discardRandom': { for (let i = 0; i < (f.n || 1) && O.hand.length; i++) { const c = O.hand.splice(G.rng.int(O.hand.length), 1)[0]; O.discard.push(c); emit(G, 'discard', `${O.name} discards ${c.def.name} from their hand.`); } break; }
      case 'oppDiscards': case 'trimOpp': {
        const k = f.k === 'trimOpp' ? Math.max(0, O.hand.length - f.n) : Math.min(f.n, O.hand.length);
        const chosen = pickCards(G, O, O.hand.slice(), k, k, 'discardHand', byWaste(G, O));
        discardCards(G, O, chosen);
        if (chosen.length) emit(G, 'discard', `${O.name} discards ${list(chosen.map((c) => c.def.name))}.`);
        break;
      }
      case 'discardStadium': if (G.stadium) { G.players[G.stadiumOwner].discard.push(G.stadium); emit(G, 'stadium', `${G.stadium.def.name} is discarded.`); G.stadium = null; G.stadiumOwner = null; } break;
      case 'switchOutOpp': {
        if (!D || !O.bench.length || protectedFromEffects(G, ctx, D)) break;
        const b = pickMon(G, O, O.bench, 'promote', (m) => promoteScore(G, O, m));
        if (b) switchActive(G, O, b);
        break;
      }
      case 'gust': {
        if (!O.bench.length) break;
        const b = pickMon(G, P, O.bench, 'gust', (m) => gustValue(G, P, m, null));
        if (b) switchActive(G, O, b);
        break;
      }
      case 'ko': {
        if (!D || protectedFromEffects(G, ctx, D)) break;
        D.dmg = Math.max(D.dmg, maxHp(G, D));
        ctx.koDone = true;
        emit(G, 'damage', `${who(D)} is Knocked Out by ${ctx.atk ? ctx.atk.name : 'an effect'}.`, { hl: [D.id] });
        break;
      }
      case 'bench': {
        const side = f.side === 'own' ? P : O;
        const cands = side.bench.slice();
        const targets = f.count === 'all' ? cands : [];
        if (f.count !== 'all') {
          for (let k = 0; k < f.count && cands.length; k++) {
            const t = pickMon(G, P, cands, f.side === 'own' ? 'benchOwn' : 'bench', (m) => (f.side === 'own' ? -monWorth(G, m) : koValue(G, P, m, f.n, ctx)), false, { n: f.n });
            if (!t) break;
            targets.push(t); takeFrom(cands, t);
          }
        }
        for (const t of targets) { if (protectedFromEffects(G, ctx, t) && f.side !== 'own') continue; putDamage(G, ctx, t, attackDamage(G, ctx, t, f.n, false)); }
        break;
      }
      case 'spread': for (const t of mons(O)) if (t !== ctx.snipe) putDamage(G, ctx, t, attackDamage(G, ctx, t, f.n, false)); break;
      case 'itemLock': ctx.O.flags.itemLock = G.turn + 1; emit(G, 'effect', `${ctx.O.name} can't play Item cards during their next turn.`); break;
      case 'shuffleSelf': case 'scoopSelf': {
        // Run Away Draw (only if it drew), Tuck Tail: this Pokémon and everything on it leave play
        if (!A || !mons(P).includes(A) || (f.k === 'shuffleSelf' && !ctx.drew)) break;
        const wasActive = P.active === A, name = top(A).name;
        takeFrom(P.bench, A); if (wasActive) P.active = null;
        const cards = [...A.stack, ...A.energy].concat(A.tool ? [A.tool] : []);
        if (f.k === 'shuffleSelf') { P.deck.push(...cards); shuffleDeck(G, P); emit(G, 'shuffle', `${P.name} shuffles ${name} and its cards into their deck.`); }
        else { P.hand.push(...cards); emit(G, 'move', `${P.name} picks up ${name} and every card attached to it.`); }
        if (wasActive && !ctx.isAttack) promote(G, P);
        break;
      }
      case 'handCounters': {
        // Powerful Hand: damage counters, not damage, so Weakness and Resistance don't apply
        if (!D || protectedFromEffects(G, ctx, D)) break;
        const k = f.n * P.hand.length;
        if (!k) { emit(G, 'miss', `${ctx.atk ? ctx.atk.name : 'The attack'} places no damage counters.`); break; }
        D.dmg += k * 10;
        P.stats.damage += k * 10; if (k * 10 > P.stats.best) P.stats.best = k * 10;
        emit(G, 'damage', `${plural(k, 'damage counter')} on ${who(D)}.`, { hl: [D.id], hits: [[D.id, k * 10]] });
        break;
      }
      case 'crispin': {
        // two Basic Energy of different types: one to the hand, the other attached
        const pool = P.deck.filter((c) => isEnergy(c.def) && c.def.basicEnergy);
        const pair = (list) => { const s = byNeed(G, P)(list); const a = s[0], b = s.find((c) => c.def.provides !== a.def.provides); return [a, b].filter(Boolean).concat(s.filter((c) => c !== a && c !== b)); };
        let chosen = pickCards(G, P, pool, 0, 2, 'crispin', pair, { from: 'deck' });
        if (chosen.length === 2 && chosen[0].def.provides === chosen[1].def.provides) chosen = [chosen[0]];
        for (const c of chosen) takeFrom(P.deck, c);
        shuffleDeck(G, P);
        if (!chosen.length) { emit(G, 'search', `${P.name} searches their deck but takes nothing.`); break; }
        const att = chosen.length === 2 ? pickCards(G, P, chosen, 1, 1, 'crispinAttach', (x) => x.sort((a, b) => Math.max(...mons(P).map((m) => energyTargetScore(G, P, m, b.def))) - Math.max(...mons(P).map((m) => energyTargetScore(G, P, m, a.def)))), { from: 'deck' })[0] : chosen[0];
        const hand = chosen.find((c) => c !== att);
        if (hand) P.hand.push(hand);
        emit(G, 'search', `${P.name} searches their deck for ${list(chosen.map((c) => c.def.name))}.`, { cards: chosen.map((c) => [c.id, c.def.id]) });
        const t = pickMon(G, P, mons(P), 'attachTo', (m) => energyTargetScore(G, P, m, att.def), false, { card: att.id, def: att.def.id });
        if (t) { attachEnergy(G, P, t, att); emit(G, 'energy', `${P.name} attaches ${att.def.name} to ${who(t)}.`, { hl: [t.id] }); } else P.hand.push(att);
        break;
      }
      case 'redCard': {
        // Special Red Card: their hand goes to the bottom of their deck, then they draw 3
        if (!O.hand.length) break;
        const h = G.rng.shuffle(O.hand.slice()); O.hand = []; O.deck.unshift(...h);
        const got = draw(G, O, f.n);
        emit(G, 'draw', `${O.name} puts their hand on the bottom of their deck and draws ${plural(got, 'card')}.`);
        break;
      }
      case 'eri': {
        // Eri: look at their hand and discard up to n Item cards from it
        const items = O.hand.filter((c) => c.def.trainer === 'item');
        emit(G, 'reveal', `${O.name} reveals their hand.`, { cards: O.hand.map((c) => [c.id, c.def.id]) });
        const chosen = pickCards(G, P, items, 0, f.n, 'discardOppHand', (x) => x.sort((a, b) => cardNeed(G, O, b.def) - cardNeed(G, O, a.def)), { from: 'opp' });
        discardCards(G, O, chosen);
        emit(G, 'discard', chosen.length ? `${P.name} discards ${list(chosen.map((c) => c.def.name))} from ${O.name}'s hand.` : `${O.name} has no Item cards to discard.`);
        break;
      }
      case 'moveCounters': {
        // Adrena-Brain: up to n damage counters from one of your Pokémon to one of theirs
        const from = pickMon(G, P, mons(P).filter((x) => x.dmg > 0), 'moveFrom', (x) => x.dmg + (isActive(G, x) ? 5 : 0));
        if (!from) break;
        const k = Math.min(f.n, Math.floor(from.dmg / 10));
        const to = pickMon(G, P, mons(O), 'moveTo', (x) => (caged(G, ctx, x) ? -1 : counterValue(G, P, x, k)), false, { n: k });
        if (!to) break;
        from.dmg -= k * 10;
        // under Battle Cage, counters moved to a Benched Pokémon leave the source and are never placed
        if (caged(G, ctx, to)) { emit(G, 'damage', `${plural(k, 'damage counter')} leave ${nm(from)}; ${G.stadium.def.name} keeps them off ${who(to)}.`, { hl: [from.id], heals: [[from.id, k * 10]] }); break; }
        to.dmg += k * 10;
        emit(G, 'damage', `${plural(k, 'damage counter')} move from ${nm(from)} to ${who(to)}.`, { hl: [to.id], hits: [[to.id, k * 10]], heals: [[from.id, k * 10]] });
        break;
      }
      case 'tmEvolve': {
        // Technical Machine: Evolution: up to n Benched Pokémon evolve straight from the deck
        const evos = (x) => P.deck.filter((c) => isPokemon(c.def) && c.def.stage > 0 && c.def.from === nm(x));
        let cands = P.bench.filter((x) => evos(x).length);
        for (let k = 0; k < f.n && cands.length; k++) {
          const x = pickMon(G, P, cands, 'tmEvolve', (y) => Math.max(...evos(y).map((c) => pokemonScore(c.def))), true);
          if (!x) break;
          const card = pickCards(G, P, evos(x), 1, 1, 'evolveFromDeck', (list) => list.sort((p, q) => pokemonScore(q.def) - pokemonScore(p.def)), { mon: x.id })[0];
          if (card) evolveInto(G, P, x, card, true);
          takeFrom(cands, x);
        }
        shuffleDeck(G, P);
        break;
      }
      case 'devolveAll': {
        // Technical Machine: Devolution: each evolved Pokémon of theirs goes back a stage, the top card to their hand
        for (const x of mons(O)) {
          if (x.stack.length < 2 || protectedFromEffects(G, ctx, x)) continue;
          const card = x.stack.pop();
          O.hand.push(card);
          clearOnMove(x);
          emit(G, 'evolve', `${card.def.name} goes back to ${O.name}'s hand; ${nm(x)} is left.`, { hl: [x.id] });
        }
        break;
      }
      case 'counters': case 'countersSpread': {
        const all = f.active ? (D ? [D] : []) : f.bench ? O.bench.slice() : mons(O);
        let cands = all.filter((m) => !protectedFromEffects(G, ctx, m) && !caged(G, ctx, m));
        if (all.some((m) => caged(G, ctx, m))) emit(G, 'prevent', `${G.stadium.def.name} keeps damage counters off the Bench.`);
        if (f.k === 'countersSpread') {
          let left = f.n;
          while (left > 0 && cands.length) {
            const t = pickMon(G, P, cands, 'counters', (m) => counterValue(G, P, m, left), false, { n: left, spread: true });
            if (!t) break;
            const k = isHuman(G, P) ? 1 : Math.min(left, Math.max(1, Math.ceil(hpLeft(G, t) / 10)));
            t.dmg += k * 10; left -= k;
            emit(G, 'damage', `${plural(k, 'damage counter')} on ${who(t)}.`, { hl: [t.id], hits: [[t.id, k * 10]] });
            if (hpLeft(G, t) <= 0) takeFrom(cands, t);
          }
          break;
        }
        const targets = f.count === 'all' ? cands : [];
        if (f.count !== 'all') for (let k = 0; k < f.count && cands.length; k++) { const t = pickMon(G, P, cands, 'counters', (m) => counterValue(G, P, m, f.n), false, { n: f.n }); if (!t) break; targets.push(t); takeFrom(cands, t); }
        for (const t of targets) { t.dmg += f.n * 10; emit(G, 'damage', `${plural(f.n, 'damage counter')} on ${who(t)}.`, { hl: [t.id], hits: [[t.id, f.n * 10]] }); }
        break;
      }
      case 'draw': {
        let k = f.n + (f.activeBonus && A && isActive(G, A) ? f.activeBonus : 0);
        if (f.extra && O.prizes.length <= f.when) k += f.extra;
        if (f.ifPrizes && P.prizes.length === f.ifPrizes) k = f.instead;
        const got = draw(G, P, k);
        ctx.drew = got;
        emit(G, 'draw', `${P.name} draws ${plural(got, 'card')}.`);
        break;
      }
      case 'drawTo': { const got = draw(G, P, Math.max(0, f.n - P.hand.length)); if (got) emit(G, 'draw', `${P.name} draws ${plural(got, 'card')}.`); break; }
      case 'discardHand': { const k = P.hand.length; discardCards(G, P, P.hand.slice()); if (k) emit(G, 'discard', `${P.name} discards their hand (${plural(k, 'card')}).`); break; }
      case 'shuffleHand': { const k = P.hand.length; P.deck.push(...P.hand); P.hand = []; shuffleDeck(G, P); if (k) emit(G, 'shuffle', `${P.name} shuffles their hand into their deck.`); break; }
      case 'judge': {
        for (const Q of [P, O]) { Q.deck.push(...Q.hand); Q.hand = []; shuffleDeck(G, Q); }
        draw(G, P, f.n); draw(G, O, f.opp != null ? f.opp : f.n);
        emit(G, 'draw', `Both players shuffle their hands away and draw new ones.`);
        break;
      }
      case 'iono': {
        let any = false;
        for (const Q of [P, O]) { if (Q.hand.length) any = true; const h = G.rng.shuffle(Q.hand.slice()); Q.hand = []; Q.deck.unshift(...h); }
        if (any) for (const Q of [P, O]) draw(G, Q, Q.prizes.length);
        emit(G, 'draw', `Both players put their hands on the bottom of their decks and draw a card for each of their remaining Prize cards.`);
        break;
      }
      case 'benchSearch': {
        const space = BENCH - P.bench.length;
        const pool = P.deck.filter((c) => isBasic(c.def) && (!f.type || c.def.types.includes(f.type)) && (!f.maxHp || c.def.hp <= f.maxHp) && (!f.noRuleBox || !ruleBox(c.def)));
        const chosen = pickCards(G, P, pool, 0, Math.min(f.n, space), 'benchSearch', byNeed(G, P), { from: 'deck' });
        const put = chosen.map((c) => { const m = toBench(G, P, c); m.since = G.turn; return m; });
        shuffleDeck(G, P);
        emit(G, 'bench', chosen.length ? `${P.name} puts ${list(chosen.map((c) => c.def.name))} onto the Bench.` : `${P.name} searches their deck and finds nothing to bench.`);
        for (const m of put) benchHurt(G, P, m);
        break;
      }
      case 'pokeSearch': case 'energySearch': case 'cardSearch': case 'tutor': {
        let chosen = [];
        const fits = (d, w) => {
          switch (w) {
            case 'item': return d.trainer === 'item';
            case 'tool': return d.trainer === 'tool';
            case 'supporter': return d.trainer === 'supporter';
            case 'stadium': return d.trainer === 'stadium';
            case 'evolution': return isPokemon(d) && d.stage > 0;
            case 'energy': return isEnergy(d);
            case 'basicPokemon': return isBasic(d);
            case 'stage1': return isPokemon(d) && d.stage === 1;
            case 'stage2': return isPokemon(d) && d.stage === 2;
            default: {
              if (w && w.startsWith('basicEnergyOrPokemon:')) { const t = w.split(':')[1]; return (isEnergy(d) && d.provides === t) || (isBasic(d) && d.types.includes(t)); }
              return false;
            }
          }
        };
        if (f.k === 'cardSearch') {
          for (const w of f.what) {
            const pool = P.deck.filter((c) => fits(c.def, w) && !chosen.includes(c));
            chosen.push(...pickCards(G, P, pool, 0, 1, 'search', byNeed(G, P), { from: 'deck', want: w }));
          }
        } else {
          const pool = P.deck.filter((c) => {
            const d = c.def;
            if (f.k === 'energySearch') return isEnergy(d) && d.basicEnergy && (!f.type || d.provides === f.type);
            if (f.k === 'tutor') return true;
            if (!isPokemon(d)) return false;
            if (f.filter === 'basic' && d.stage !== 0) return false;
            if (f.filter === 'evolution' && d.stage === 0) return false;
            if (f.filter === 'stage1' && d.stage !== 1) return false;
            if (f.maxHp && d.hp > f.maxHp) return false;
            if (f.noRuleBox && ruleBox(d)) return false;
            return true;
          });
          chosen = pickCards(G, P, pool, 0, f.n, 'search', byNeed(G, P), { from: 'deck' });
        }
        for (const c of chosen) { takeFrom(P.deck, c); P.hand.push(c); }
        shuffleDeck(G, P);
        emit(G, 'search', chosen.length ? `${P.name} searches their deck for ${list(chosen.map((c) => c.def.name))}.` : `${P.name} searches their deck but takes nothing.`, { cards: chosen.map((c) => [c.id, c.def.id]) });
        break;
      }
      case 'look': {
        const topN = P.deck.slice(-f.n).reverse();
        const pool = topN.filter((c) => (f.what === 'supporter' ? c.def.trainer === 'supporter' : isPokemon(c.def)));
        const chosen = pickCards(G, P, pool, 0, f.any ? pool.length : 1, 'look', byNeed(G, P), { from: 'deck', seen: topN.map((c) => c.id) });
        for (const c of chosen) { takeFrom(P.deck, c); P.hand.push(c); }
        shuffleDeck(G, P);
        emit(G, 'search', chosen.length ? `${P.name} finds ${list(chosen.map((c) => c.def.name))}.` : `${P.name} finds nothing they want.`);
        break;
      }
      case 'evolveSelf': {
        if (!A) break;
        const pool = P.deck.filter((c) => isPokemon(c.def) && c.def.stage > 0 && c.def.from === nm(A));
        const c = pickCards(G, P, pool, 0, 1, 'evolve', byNeed(G, P), { from: 'deck' })[0];
        shuffleDeck(G, P);
        if (c) { takeFrom(P.deck, c); evolveInto(G, P, A, c, true); }
        break;
      }
      case 'recoverEnergy': case 'recover': case 'rod': {
        const pool = P.discard.filter((c) => {
          const d = c.def;
          if (f.k === 'recoverEnergy') return isEnergy(d) && d.basicEnergy && (!f.type || d.provides === f.type);
          if (f.what === 'pokemon') return isPokemon(d);
          if (f.what === 'supporter') return d.trainer === 'supporter';
          if (f.what === 'item') return d.trainer === 'item';
          if (f.what === 'trainer') return d.kind === 1;
          return (isPokemon(d) && (!f.noRuleBox || !ruleBox(d))) || (isEnergy(d) && d.basicEnergy);
        });
        const chosen = pickCards(G, P, pool, 0, f.n, f.k === 'rod' ? 'rod' : 'recover', byNeed(G, P), { from: 'discard' });
        for (const c of chosen) { takeFrom(P.discard, c); (f.k === 'rod' ? P.deck : P.hand).push(c); }
        if (f.k === 'rod') shuffleDeck(G, P);
        if (chosen.length) emit(G, 'search', `${P.name} ${f.k === 'rod' ? 'shuffles' : 'takes'} ${list(chosen.map((c) => c.def.name))} ${f.k === 'rod' ? 'back into their deck' : 'back from the discard pile'}.`);
        break;
      }
      case 'toolScrap': {
        const tooled = allMons(G).filter((m) => m.tool);
        for (let k = 0; k < f.n && tooled.length; k++) {
          const t = pickMon(G, P, tooled, 'toolScrap', (m) => (m.owner === P.i ? -5 : 3 + monWorth(G, m)), true);
          if (!t) break;
          G.players[t.owner].discard.push(t.tool); emit(G, 'tool', `${t.tool.def.name} is discarded from ${nm(t)}.`); t.tool = null; takeFrom(tooled, t);
        }
        break;
      }
      case 'scoop': {
        const cands = mons(P).filter((m) => !f.basic || top(m).stage === 0);
        if (cands.length < 2) break;
        const t = pickMon(G, P, cands, 'scoop', (m) => m.dmg * 2 + (isActive(G, m) && m.dmg > hpLeft(G, m) ? 50 : 0) - m.energy.length * 6, false);
        if (!t) break;
        const wasActive = isActive(G, t);
        const P2 = P;
        takeFrom(P2.bench, t); if (P2.active === t) P2.active = null;
        P2.hand.push(...t.stack);
        if (f.keepAttached) { P2.hand.push(...t.energy); if (t.tool) P2.hand.push(t.tool); } else { P2.discard.push(...t.energy); if (t.tool) P2.discard.push(t.tool); }
        emit(G, 'move', `${P.name} picks up ${top(t).name}.`);
        if (wasActive) promote(G, P);
        break;
      }
      case 'rareCandy': {
        const pairs = candyPairs(G, P);
        if (!pairs.length) break;
        const stage2s = [...new Set(pairs.map(([c]) => c))];
        const c = pickCards(G, P, stage2s, 1, 1, 'candyStage2', byNeed(G, P), { from: 'hand' })[0];
        const bases = pairs.filter(([x]) => x === c).map(([, m]) => m);
        const m = pickMon(G, P, bases, 'candyBasic', (x) => (isActive(G, x) ? 3 : 0) + x.energy.length, false, { card: c.id, def: c.def.id });
        evolveInto(G, P, m, c);
        break;
      }
      case 'choose': {
        const i = isHuman(G, P) ? (ask(G, { type: 'option', reason: 'choose', options: f.options.map(optionLabel) }).i || 0) : aiChooseOption(G, P, f.options);
        runFx(G, ctx, f.options[i] || f.options[0]);
        break;
      }
      case 'boost': P.boosts.push({ n: f.n, vsEx: !!f.vsEx }); emit(G, 'effect', `${P.name}'s attacks do ${f.n} more damage this turn${f.vsEx ? ' to Pokémon ex' : ''}.`); break;
      case 'shuffleOppActive': {
        if (!D || protectedFromEffects(G, ctx, D)) break;
        const cards = [...D.stack, ...D.energy].concat(D.tool ? [D.tool] : []);
        O.active = null; O.deck.push(...cards); shuffleDeck(G, O);
        emit(G, 'move', `${O.name} shuffles ${top(D).name} into their deck.`);
        promote(G, O);
        break;
      }
      case 'flip': case 'flipAll': case 'flipAny': {
        const sub = { ...ctx, post: [] };
        preFx(G, sub, f);
        runFx(G, ctx, sub.post);
        break;
      }
      case 'cureSelf': if (A && condList(A).length) { A.cond = { p: 0, b: false, r: null, until: 0 }; emit(G, 'effect', `${who(A)} recovers from its Special Conditions.`, { hl: [A.id] }); } break;
      case 'extraPrize': ctx.extraPrize = (ctx.extraPrize || 0) + f.n; G.extraPrize = { turn: G.turn, n: ctx.extraPrize, target: D ? D.id : null }; break;
      case 'attachEachBench': {
        for (const b of P.bench) {
          const e = P.deck.find((c) => isEnergy(c.def) && c.def.basicEnergy && c.def.provides === f.type);
          if (!e) break;
          attachEnergy(G, P, b, e);
          emit(G, 'energy', `${P.name} attaches ${e.def.name} to ${who(b)}.`, { hl: [b.id] });
        }
        shuffleDeck(G, P);
        break;
      }
      case 'koIfCounters': if (D && D.dmg === f.n * 10 && !protectedFromEffects(G, ctx, D)) { D.dmg = Math.max(D.dmg, maxHp(G, D)); emit(G, 'damage', `${who(D)} is Knocked Out by ${ctx.atk.name}.`, { hl: [D.id] }); } break;
      case 'discardFromOppHand': {
        if (!O.hand.length) break;
        const chosen = pickCards(G, P, O.hand.slice(), 1, f.n || 1, 'discardOppHand', byNeed(G, O), { seen: O.hand.map((c) => c.id) });
        discardCards(G, O, chosen);
        emit(G, 'discard', `${P.name} looks at ${O.name}'s hand and discards ${list(chosen.map((c) => c.def.name))}.`);
        break;
      }
      case 'reviveName': {
        const pool = P.discard.filter((c) => c.def.name.toLowerCase() === f.name && isBasic(c.def));
        const chosen = pickCards(G, P, pool, 0, Math.min(f.n, BENCH - P.bench.length), 'revive', (x) => x, { from: 'discard' });
        const put = chosen.map((c) => { const m = toBench(G, P, c); m.since = G.turn; return m; });
        if (chosen.length) emit(G, 'bench', `${P.name} puts ${list(chosen.map((c) => c.def.name))} onto the Bench from the discard pile.`);
        for (const m of put) benchHurt(G, P, m);
        break;
      }
      case 'peek': {
        const topN = P.deck.slice(-f.n).reverse();
        if (!topN.length) break;
        const keep = pickCards(G, P, topN, 1, 1, 'peek', byNeed(G, P), { from: 'deck' })[0];
        for (const c of topN) takeFrom(P.deck, c);
        P.hand.push(keep);
        P.deck.unshift(...topN.filter((c) => c !== keep));
        emit(G, 'search', `${P.name} looks at the top ${plural(topN.length, 'card')} of their deck and takes 1.`);
        break;
      }
      case 'nothing': case 'noWR': case 'noRes': case 'pierce': case 'plus': case 'bonus': case 'scale': break;
      default: break;
    }
  }
  function optionLabel(fx) {
    const f = fx[0];
    if (f.k === 'switch') return 'Switch your Active Pokémon with 1 of your Benched Pokémon';
    if (f.k === 'boost') return `Your attacks do ${f.n} more damage this turn${f.vsEx ? ' to Pokémon ex' : ''}`;
    return f.k;
  }
  function aiChooseOption(G, P, options) {
    const O = opp(G, P);
    for (let i = 0; i < options.length; i++) {
      const f = options[i][0];
      if (f.k === 'boost' && O.active && P.active && (!f.vsEx || top(O.active).ex) && bestAttack(G, P, f.n).score > 0) return i;
    }
    return 0;
  }

  /* ---------- AI scoring helpers for targets ---------- */
  function koValue(G, P, m, dmg, ctx) {
    const left = hpLeft(G, m);
    const real = ctx && ctx.src ? attackDamage(G, ctx, m, dmg, false) : dmg;
    return (real >= left ? 100 * top(m).prizes : (real / Math.max(10, left)) * 30 * top(m).prizes) + (isActive(G, m) ? 1 : 0);
  }
  function counterValue(G, P, m, k) {
    const left = hpLeft(G, m);
    return (k * 10 >= left ? 100 * top(m).prizes - left : (k * 10 / Math.max(10, left)) * 20 * top(m).prizes) + top(m).prizes;
  }
  function gustValue(G, P, m, ctx) {
    const O = G.players[m.owner];
    const atkr = P.active;
    if (!atkr) return monWorth(G, m);
    const best = bestAttackOn(G, P, atkr, m);
    let v = best.ko ? 100 * top(m).prizes : (best.dmg / Math.max(10, hpLeft(G, m))) * 20 * top(m).prizes;
    v += retreatCost(G, m) * 3 + (needs(m).length ? 5 : 0);
    return v + (O.active === m ? 0 : 1);
  }
  function promoteScore(G, P, m) {
    const d = top(m);
    let v = hpLeft(G, m) / 30;
    for (let i = 0; i < d.atks.length; i++) if (canPay(energyOf(m), d.atks[i].cost)) v += 8 + attackPower(d) / 10;
    v -= needs(m).length * 2;
    v += m.energy.length;
    if (d.prizes > 1 && !d.atks.some((a) => canPay(energyOf(m), a.cost))) v -= 6;
    if (d.abil.some((a) => a.k === 'once' && a.bench)) v -= 4;
    // a Pokémon that still has an Evolution to come is better kept safe on the Bench than knocked out up front
    if (d.stage < 2 && P.deck.concat(P.hand).some((c) => isPokemon(c.def) && c.def.from === d.name) && threatened(G, P, m)) v -= 6;
    return v;
  }
  function energyTargetScore(G, P, m, ed) {
    const need = needs(m);
    const d = top(m);
    if (!d.atks.length) return -5;
    const appetite = energyAppetite(d);
    let v = 0;
    if (need.length) {
      v += need.includes(ed.provides) ? 6 : need.includes('C') ? 4 : 0.5;
      v += 5 - need.length;
      if (need.length === 1 && (need[0] === ed.provides || need[0] === 'C')) v += isActive(G, m) ? 8 : 4;
    } else v += appetite === 'board' ? 3 : -6;
    v += attackPower(d) / 15 + (isActive(G, m) ? 2 : 0) + d.stage;
    if (P.hand.some((c) => isPokemon(c.def) && c.def.from === d.name)) v += 1.5;
    return v;
  }
  function aiWantsSwitch(G, P) {
    const A = P.active;
    if (!A) return false;
    const best = Math.max(...P.bench.map((m) => promoteScore(G, P, m)), -99);
    return best > promoteScore(G, P, A) + 3 || hpLeft(G, A) <= 30 && A.energy.length;
  }

  /* ---------- Evolving ---------- */
  function evolveInto(G, P, m, card, fromDeck) {
    const prev = nm(m);
    takeFrom(P.hand, card); takeFrom(P.deck, card);
    m.stack.push(card);
    m.evolvedAt = G.turn;
    clearOnMove(m);
    emit(G, 'evolve', `${P.name} evolves ${prev} into ${card.def.name}.`, { hl: [m.id], who: P.i });
    for (const a of card.def.abil) if (a.k === 'evolve' && !fromDeck) {
      if (yes(G, P, 'abilityTrigger', true, { mon: m.id, ability: a.name })) {
        emit(G, 'ability', `${card.def.name}'s ${a.name}.`, { hl: [m.id] });
        P.stats.abilities++;
        runFx(G, { P, O: opp(G, P), src: m, label: a.name }, a.fx);
      }
    }
  }

  /* ============================================================
     8. Trainers, abilities, attacks
     ============================================================ */
  function trainerPlayable(G, P, c) {
    const d = c.def, O = opp(G, P);
    if (d.trainer === 'item' && P.flags.itemLock === G.turn) return false;
    if (d.ace && aceLocked(G, P)) return false;
    if (d.trainer === 'supporter') {
      if (P.flags.supporter === G.turn) return false;
      if (G.turn === 1 && P.i === G.first && !(d.req && d.req.req === 'firstTurnOk')) return false;
    }
    if (d.trainer === 'stadium') return P.flags.stadium !== G.turn && !(G.stadium && G.stadium.def.name === d.name);
    if (d.trainer === 'tool') return mons(P).some((m) => !m.tool);
    if (d.req) {
      if (d.req.req === 'discard' && P.hand.length - 1 < d.req.n) return false;
      if (d.req.req === 'behind' && !(P.prizes.length > O.prizes.length)) return false;
      if (d.req.req === 'revenge' && P.koTurn !== G.turn - 1) return false;
      if (d.req.req === 'oppPrizes' && O.prizes.length > d.req.n) return false;
    }
    const fx = d.fx || [];
    for (const f of fx) {
      if (f.k === 'rareCandy' && !candyPairs(G, P).length) return false;
      if (f.k === 'gust' && !O.bench.length) return false;
      if (f.k === 'switch' && !P.bench.length && fx.length === 1) return false;
      if (f.k === 'benchSearch' && P.bench.length >= BENCH) return false;
      if (f.k === 'heal' && !mons(P).some((m) => m.dmg > 0)) return false;
      if (f.k === 'scoop' && mons(P).length < 2) return false;
      if ((f.k === 'recoverEnergy' || f.k === 'recover' || f.k === 'rod') && !P.discard.some((x) => isPokemon(x.def) || isEnergy(x.def) || x.def.trainer === f.what)) return false;
      if (f.k === 'shiftEnergy' && !mons(P).some((m) => m.energy.length)) return false;
      if (f.k === 'strip' && !(O.active && O.active.energy.length)) return false;
      if (f.k === 'toolScrap' && !allMons(G).some((m) => m.tool)) return false;
      if (f.k === 'stripAny' && f.special && !mons(O).some((m) => m.energy.some((e) => e.def.special))) return false;
      if (f.k === 'attachDiscard' && f.to === 'stage2' && !(mons(P).some((m) => top(m).stage === 2) && P.discard.some((x) => isEnergy(x.def) && x.def.basicEnergy))) return false;
      if (f.k === 'crispin' && !P.deck.some((x) => isEnergy(x.def) && x.def.basicEnergy)) return false;
    }
    return true;
  }
  function playTrainer(G, P, c, toolTarget) {
    const d = c.def, O = opp(G, P);
    takeFrom(P.hand, c);
    P.stats.trainers++;
    if (d.trainer === 'tool') {
      toolTarget.tool = c;
      emit(G, 'tool', `${P.name} attaches ${d.name} to ${nm(toolTarget)}.`, { hl: [toolTarget.id], card: [c.id, d.id] });
      return;
    }
    if (d.trainer === 'stadium') {
      if (G.stadium) G.players[G.stadiumOwner].discard.push(G.stadium);
      G.stadium = c; G.stadiumOwner = P.i; P.flags.stadium = G.turn;
      emit(G, 'stadium', `${P.name} plays the Stadium ${d.name}.`, { card: [c.id, d.id] });
      return;
    }
    if (d.trainer === 'supporter') P.flags.supporter = G.turn;
    emit(G, 'trainer', `${P.name} plays ${d.name}.`, { card: [c.id, d.id] });
    if (d.req && d.req.req === 'discard') {
      const chosen = pickCards(G, P, P.hand.slice(), d.req.n, d.req.n, 'cost', byWaste(G, P), { card: c.id });
      discardCards(G, P, chosen);
      emit(G, 'discard', `${P.name} discards ${list(chosen.map((x) => x.def.name))}.`);
    }
    runFx(G, { P, O, src: null, label: d.name, card: d }, d.fx || []);
    P.discard.push(c);
  }
  function abilityUsable(G, P, m, a) {
    if (!abilOf(G, m).includes(a)) return false;
    if (a.needE && !energyOf(m).some((e) => e === a.needE || e === '*')) return false;
    if (a.k === 'once') {
      if (m.used[a.name] === G.turn) return false;
      if (a.unique && P.flags['u:' + a.name] === G.turn) return false;
      if (a.active && P.active !== m) return false;
      if (a.bench && P.active === m) return false;
      if (a.firstTurn && P.turns !== 1) return false;
      if (a.revenge && P.koTurn !== G.turn - 1) return false;
      if (a.cost === 'discard' && !P.hand.length) return false;
      if (a.cost === 'discardEnergy' && !P.hand.some((c) => isEnergy(c.def))) return false;
      return a.fx.every((f) => fxPossible(G, P, m, f));
    }
    if (a.k === 'often') return a.fx.every((f) => fxPossible(G, P, m, f));
    if (a.k === 'embrace') return P.discard.some((c) => isEnergy(c.def) && c.def.provides === a.type) && mons(P).some((x) => top(x).types.includes(a.onType) && hpLeft(G, x) > a.counters * 10);
    return false;
  }
  function fxPossible(G, P, m, f) {
    const O = opp(G, P);
    switch (f.k) {
      case 'draw': case 'drawTo': return P.deck.length > 0 && (f.k !== 'drawTo' || P.hand.length < f.n);
      case 'tutor': case 'pokeSearch': case 'energySearch': return P.deck.length > 0;
      case 'benchSearch': return P.bench.length < BENCH && P.deck.some((c) => isBasic(c.def) && (!f.type || c.def.types.includes(f.type)));
      case 'attachHand': return P.hand.some((c) => isEnergy(c.def) && c.def.basicEnergy && (!f.type || c.def.provides === f.type));
      case 'attachDiscard': return P.discard.some((c) => isEnergy(c.def) && c.def.basicEnergy && (!f.type || c.def.provides === f.type));
      case 'attachDeck': return P.deck.some((c) => isEnergy(c.def) && c.def.basicEnergy && (!f.type || c.def.provides === f.type));
      case 'counters': return f.bench ? O.bench.length > 0 : mons(O).length > 0;
      case 'moveCounters': return mons(P).some((x) => x.dmg > 0) && mons(O).length > 0;
      case 'shuffleSelf': return mons(P).length > 1;
      case 'heal': return mons(P).some((x) => x.dmg > 0);
      case 'gust': return O.bench.length > 0;
      case 'switch': return P.bench.length > 0;
      case 'shiftEnergy': return mons(P).filter((x) => x.energy.some((c) => !f.type || c.def.provides === f.type)).length > 0 && mons(P).length > 1;
      case 'peek': return P.deck.length > 0;
      case 'discardHand': return true;
      default: return true;
    }
  }
  function useAbility(G, P, m, a) {
    const O = opp(G, P);
    P.stats.abilities++;
    if (a.k === 'embrace') {
      const e = pickCards(G, P, P.discard.filter((c) => isEnergy(c.def) && c.def.provides === a.type), 1, 1, 'attachEnergy', (x) => x, { from: 'discard' })[0];
      const t = pickMon(G, P, mons(P).filter((x) => top(x).types.includes(a.onType) && hpLeft(G, x) > a.counters * 10), 'attachTo', (x) => energyTargetScore(G, P, x, e.def) - (x.dmg + a.counters * 10 >= maxHp(G, x) - 30 ? 6 : 0), false, { card: e.id, def: e.def.id });
      attachEnergy(G, P, t, e);
      t.dmg += a.counters * 10;
      emit(G, 'ability', `${a.name}: ${P.name} attaches ${e.def.name} to ${nm(t)} and puts ${plural(a.counters, 'damage counter')} on it.`, { hl: [t.id], hits: [[t.id, a.counters * 10]] });
      return;
    }
    m.used[a.name] = G.turn;
    if (a.unique) P.flags['u:' + a.name] = G.turn;
    emit(G, 'ability', `${P.name} uses ${nm(m)}'s ${a.name}.`, { hl: [m.id] });
    if (a.cost === 'discard' || a.cost === 'discardEnergy') {
      const pool = a.cost === 'discard' ? P.hand.slice() : P.hand.filter((c) => isEnergy(c.def));
      const chosen = pickCards(G, P, pool, 1, 1, 'cost', byWaste(G, P));
      discardCards(G, P, chosen);
      emit(G, 'discard', `${P.name} discards ${list(chosen.map((x) => x.def.name))}.`);
    }
    runFx(G, { P, O, src: m, label: a.name }, a.fx);
    if (a.sacrifice) { m.dmg = Math.max(m.dmg, maxHp(G, m)); emit(G, 'damage', `${nm(m)} is Knocked Out by its own Ability.`, { hl: [m.id] }); }
  }
  function stadiumUsable(G, P) {
    if (!G.stadium || P.flags.stadiumUsed === G.turn) return false;
    const s = G.stadium.def.stadium;
    if (!s) return false;
    if (s.k === 'benchSearch') return P.bench.length < BENCH && P.deck.some((c) => isBasic(c.def) && !ruleBox(c.def));
    if (s.k === 'draw' || s.k === 'flipPokeSearch' || s.k === 'toolSearch') return P.deck.length > 0;
    if (s.k === 'energyRecover') return P.discard.some((c) => isEnergy(c.def) && c.def.provides === s.type);
    return false;
  }
  function useStadium(G, P) {
    const s = G.stadium.def.stadium;
    P.flags.stadiumUsed = G.turn;
    emit(G, 'stadium', `${P.name} uses ${G.stadium.def.name}.`);
    const ctx = { P, O: opp(G, P), src: null, label: G.stadium.def.name };
    if (s.k === 'benchSearch') doFx(G, ctx, { k: 'benchSearch', n: 1, noRuleBox: true });
    else if (s.k === 'draw') doFx(G, ctx, { k: 'draw', n: 1 });
    else if (s.k === 'flipPokeSearch') { if (flip(G, P, G.stadium.def.name)) doFx(G, ctx, { k: 'pokeSearch', n: 1 }); }
    else if (s.k === 'toolSearch') doFx(G, ctx, { k: 'cardSearch', what: ['tool'] });
    else if (s.k === 'energyRecover') doFx(G, ctx, { k: 'recoverEnergy', n: s.n, type: s.type });
  }

  // The copy-an-attack effect of an attack, if it has one: { flip } when it needs heads first
  function copyOf(a) {
    if (a.fx.some((f) => f.k === 'copyAttack')) return { flip: false };
    if (a.fx.length === 1 && a.fx[0].k === 'flip' && (a.fx[0].heads || []).some((f) => f.k === 'copyAttack')) return { flip: true };
    return null;
  }
  function useAttack(G, P, m, i) {
    const O = opp(G, P);
    let a = atksOf(G, m)[i];
    G.phase = 'attack';
    emit(G, 'attack', `${nm(m)} uses ${a.name}.`, { hl: [m.id], atk: a.name, who: P.i });
    if (m.cond.r === 'confused' && !flip(G, P, `${nm(m)} is Confused`)) {
      m.dmg += 30;
      emit(G, 'damage', `${nm(m)} hurts itself in its confusion for 30 damage.`, { hl: [m.id], hits: [[m.id, 30]] });
      return;
    }
    // Genome Hacking, Metronome, Foul Play: one of the opponent's Active Pokémon's attacks, used as this attack
    const copy = copyOf(a);
    if (copy) {
      if (copy.flip && !flip(G, P, a.name)) { emit(G, 'miss', `${a.name} does nothing.`); return; }
      const opts = O.active ? top(O.active).atks.filter((x) => !copyOf(x)) : [];
      if (!opts.length) { emit(G, 'miss', `${a.name} has nothing to copy.`); return; }
      const k = isHuman(G, P) ? (ask(G, { type: 'option', reason: 'copyAttack', options: opts.map((x) => `${x.name}${x.base ? ` (${x.base}${x.mod === 'x' ? '×' : x.mod})` : ''}`) }).i || 0)
        : opts.map((x, j) => [j, estimateWith(G, P, m, x, O.active).dmg]).sort((p, q) => q[1] - p[1])[0][0];
      const orig = a.name;
      a = opts[Math.max(0, Math.min(opts.length - 1, k))];
      emit(G, 'attack', `${orig} copies ${a.name}.`, { hl: [m.id], atk: a.name, who: P.i });
    }
    const ctx = { P, O, src: m, atk: a, isAttack: true, fuel: 0, plus: 0, times: null, nothing: false, noWR: false, noRes: false, pierce: false, snipe: null, post: [], dealt: 0 };
    for (const f of a.fx) { if (G.over) return; if (PRE.has(f.k)) preFx(G, ctx, f); else ctx.post.push(f); }
    if (ctx.nothing) { emit(G, 'miss', `${a.name} does nothing.`); return; }
    let base = (ctx.times != null ? ctx.times : a.base) + ctx.plus;
    base = Math.max(0, base);
    const target = ctx.snipe || O.active;
    if (base > 0 && target) {
      const amt = attackDamage(G, ctx, target, base, true);
      ctx.dealt = putDamage(G, ctx, target, amt);
      if (!amt) emit(G, 'damage', `${nm(target)} takes no damage.`, { hl: [target.id] });
    }
    runFx(G, ctx, ctx.post);
  }

  /* ============================================================
     9. Knock Outs, prizes and winning
     ============================================================ */
  function checkKOs(G, byAttackOf) {
    const kod = allMons(G).filter((m) => hpLeft(G, m) <= 0);
    if (!kod.length) return;
    const gains = [0, 0];
    for (const m of kod) {
      const owner = G.players[m.owner], taker = opp(G, owner);
      const prizes = top(m).prizes;
      emit(G, 'ko', `${nm(m)} is Knocked Out!`, { hl: [m.id], ko: m.id });
      leavePlay(G, m);
      const xp = G.extraPrize && G.extraPrize.turn === G.turn && G.extraPrize.target === m.id && byAttackOf === taker.i ? G.extraPrize.n : 0;
      gains[taker.i] += prizes + xp;
      taker.stats.kos++;
      if (byAttackOf != null && byAttackOf !== owner.i) owner.koTurn = G.turn;
    }
    for (const P of G.players) {
      const k = Math.min(gains[P.i], P.prizes.length);
      if (!k) continue;
      const got = pickPrizes(G, P, k);
      emit(G, 'prize', `${P.name} takes ${plural(k, 'Prize card')}.`, { who: P.i, cards: got.map((c) => [c.id, c.def.id]) });
    }
    const won = G.players.map((P) => P.prizes.length === 0);
    const out = G.players.map((P) => !P.active && !P.bench.length);
    if (won[0] || won[1] || out[0] || out[1]) {
      const w0 = won[0] || out[1], w1 = won[1] || out[0];
      if (w0 && w1) return endGame(G, null, 'Both players won at once: a draw.', 'both');
      const W = G.players[w0 ? 0 : 1], L = opp(G, W);
      return endGame(G, W.i, won[W.i] ? `${W.name} takes their last Prize card.` : `${L.name} has no Pokémon left in play.`, won[W.i] ? 'prizes' : 'bench');
    }
    // the player whose turn it isn't promotes first
    const order = [1 - G.active, G.active].map((i) => G.players[i]);
    for (const P of order) if (!P.active) promote(G, P);
  }
  function pickPrizes(G, P, k) {
    const got = P.prizes.splice(P.prizes.length - k, k);
    P.hand.push(...got);
    P.taken += k;
    return got;
  }
  function promote(G, P) {
    if (P.active || !P.bench.length) return;
    const b = pickMon(G, P, P.bench, 'promote', (m) => promoteScore(G, P, m));
    takeFrom(P.bench, b);
    clearOnMove(b);
    P.active = b;
    emit(G, 'promote', `${P.name} sends out ${nm(b)}.`, { who: P.i, hl: [b.id] });
  }
  // why: how it ended, for the journal ('prizes', 'bench', 'deck', 'turns' or 'both')
  function endGame(G, winner, reason, why) {
    if (G.over) return;
    G.over = true; G.winner = winner; G.reason = reason; G.why = why || '';
    G.phase = 'over';
    emit(G, 'end', winner == null ? `Draw. ${reason}` : `${G.players[winner].name} wins. ${reason}`);
  }

  /* ============================================================
     10. Setting up and taking turns
     ============================================================ */
  function aiSetup(G, P) {
    const basics = P.hand.filter((c) => isBasic(c.def));
    const startScore = (d) => {
      let v = d.hp / 30 - d.retreat * 0.8;
      for (const a of d.atks) if (a.cost.length <= 1) v += 2 + a.base / 30;
      if (d.ex) v -= 1.5;
      if (P.hand.concat(P.deck).some((c) => isPokemon(c.def) && c.def.from === d.name && c.def.stage === 1)) v -= 1;
      if (d.abil.some((a) => a.k === 'once' && a.bench)) v -= 3;
      return v;
    };
    const active = basics.slice().sort((a, b) => startScore(b.def) - startScore(a.def))[0];
    const rest = basics.filter((c) => c !== active).sort((a, b) => pokemonScore(b.def) - pokemonScore(a.def));
    return { active, bench: rest.slice(0, PERSONAS[P.persona].bench) };
  }
  function setupPlayer(G, P) {
    for (let m = 0; m < 20; m++) {
      P.deck.push(...P.hand); P.hand = [];
      shuffleDeck(G, P);
      draw(G, P, 7);
      if (P.hand.some((c) => isBasic(c.def))) break;
      P.mulligans++;
      emit(G, 'mulligan', `${P.name} has no Basic Pokémon and takes a mulligan.`, { who: P.i, cards: P.hand.map((c) => [c.id, c.def.id]) });
    }
  }
  function placeStart(G, P) {
    let choice;
    if (isHuman(G, P)) {
      const basics = P.hand.filter((c) => isBasic(c.def));
      const a = ask(G, { type: 'setup', cards: basics.map((c) => c.id), defs: Object.fromEntries(basics.map((c) => [c.id, c.def.id])), max: BENCH });
      const active = basics.find((c) => c.id === a.active) || basics[0];
      const bench = (a.bench || []).map((id) => basics.find((c) => c.id === id && c !== active)).filter(Boolean).slice(0, BENCH);
      choice = { active, bench: [...new Set(bench)] };
    } else choice = aiSetup(G, P);
    takeFrom(P.hand, choice.active);
    P.active = newMon(G, P, choice.active); P.active.since = -1;
    for (const c of choice.bench) { const m = toBench(G, P, c); m.since = -1; }
    for (let i = 0; i < P.prizeCount && P.deck.length; i++) P.prizes.push(P.deck.pop());
  }
  function setupGame(G) {
    const [A, B] = G.players;
    setupPlayer(G, A); setupPlayer(G, B);
    // each player may draw a card for each of the opponent's extra mulligans
    for (const P of G.players) { const extra = opp(G, P).mulligans; if (extra) { const got = draw(G, P, extra); if (got) emit(G, 'draw', `${P.name} draws ${plural(got, 'extra card')} for the mulligans.`, { who: P.i }); } }
    let first;
    if (G.forcedFirst != null) first = G.forcedFirst;
    else {
      const winner = G.rng.int(2);
      const W = G.players[winner];
      const goFirst = isHuman(G, W) ? !!ask(G, { type: 'first', reason: 'coin' }).first : W.ai === 'hard' || PERSONAS[W.persona].first;
      first = goFirst ? winner : 1 - winner;
      emit(G, 'coin', `${W.name} wins the coin flip and chooses to go ${goFirst ? 'first' : 'second'}.`, { who: W.i });
    }
    G.first = first; G.active = first;
    for (const P of [G.players[first], G.players[1 - first]]) placeStart(G, P);
    emit(G, 'start', `${G.players[0].name} vs ${G.players[1].name}. ${G.players[first].name} goes first.`);
  }

  function startTurn(G) {
    G.turn++;
    G.phase = 'draw';
    const P = G.players[G.active];
    P.turns++;
    P.boosts = [];
    for (const m of allMons(G)) m.fx = m.fx.filter((f) => f.until >= G.turn);
    emit(G, 'turn', `Turn ${G.turn}: ${P.name}.`, { who: P.i });
    if (!P.deck.length) return endGame(G, 1 - P.i, `${P.name} can't draw a card.`, 'deck');
    draw(G, P, 1);
    emit(G, 'draw', `${P.name} draws a card.`, { who: P.i, drew: P.hand[P.hand.length - 1].id });
    G.phase = 'main';
  }
  function endTurn(G) {
    const P = G.players[G.active];
    G.phase = 'checkup';
    for (const m of mons(P)) if (m.tool && m.tool.def.tool && m.tool.def.tool.k === 'tm') { P.discard.push(m.tool); emit(G, 'tool', `${m.tool.def.name} is discarded from ${nm(m)}.`, { hl: [m.id] }); m.tool = null; }
    const t = P.active && toolFx(G, P.active);
    if (t && t.k === 'leftovers' && P.active.dmg) { const h = Math.min(t.n, P.active.dmg); P.active.dmg -= h; emit(G, 'heal', `${P.active.tool.def.name} heals ${h} damage from ${nm(P.active)}.`, { heals: [[P.active.id, h]] }); }
    checkKOs(G, G.active);
    if (G.over) return;
    // Pokémon Checkup
    for (const Q of [P, opp(G, P)]) {
      const m = Q.active;
      if (!m) continue;
      if (m.cond.p) { m.dmg += 10 * m.cond.p; emit(G, 'checkup', `${nm(m)} takes ${10 * m.cond.p} damage from Poison.`, { hl: [m.id], hits: [[m.id, 10 * m.cond.p]] }); }
      if (m.cond.b) {
        m.dmg += 20; emit(G, 'checkup', `${nm(m)} takes 20 damage from its Burn.`, { hl: [m.id], hits: [[m.id, 20]] });
        if (flip(G, Q, `${nm(m)}'s Burn`)) { m.cond.b = false; emit(G, 'checkup', `${nm(m)} is no longer Burned.`, { hl: [m.id] }); }
      }
      if (m.cond.r === 'asleep' && flip(G, Q, `${nm(m)} tries to wake up`)) { m.cond.r = null; emit(G, 'checkup', `${nm(m)} wakes up.`, { hl: [m.id] }); }
      if (m.cond.r === 'paralyzed' && G.turn >= m.cond.until) { m.cond.r = null; emit(G, 'checkup', `${nm(m)} is no longer Paralyzed.`, { hl: [m.id] }); }
    }
    checkKOs(G, null);
    if (G.over) return;
    G.active = 1 - G.active;
    if (G.turn >= MAX_TURNS) endGame(G, null, 'The game reached the turn limit.', 'turns');
  }

  /* ---------- What can be done right now ---------- */
  function actions(G, P) {
    const out = [];
    const O = opp(G, P);
    for (const c of P.hand) {
      const d = c.def;
      if (isPokemon(d)) {
        if (d.stage === 0 && P.bench.length < BENCH) out.push({ k: 'bench', c: c.id });
        if (d.stage > 0) for (const m of mons(P)) if (canEvolve(G, P, m, d)) out.push({ k: 'evolve', c: c.id, m: m.id });
      } else if (isEnergy(d)) {
        if (P.flags.energy !== G.turn && !(d.ace && aceLocked(G, P))) for (const m of mons(P)) out.push({ k: 'energy', c: c.id, m: m.id });
      } else if (d.trainer === 'tool') {
        if (trainerPlayable(G, P, c)) for (const m of mons(P)) if (!m.tool) out.push({ k: 'tool', c: c.id, m: m.id });
      } else if (trainerPlayable(G, P, c)) out.push({ k: 'play', c: c.id });
    }
    for (const m of mons(P)) top(m).abil.forEach((a, i) => { if (abilityUsable(G, P, m, a)) out.push({ k: 'ability', m: m.id, i }); });
    if (stadiumUsable(G, P)) out.push({ k: 'stadium' });
    if (canRetreat(G, P)) out.push({ k: 'retreat' });
    if (P.active) atksOf(G, P.active).forEach((a, i) => { if (canAttackWith(G, P, P.active, i)) out.push({ k: 'attack', i }); });
    out.push({ k: 'end' });
    return out;
  }
  function doAction(G, P, a) {
    const card = a.c != null ? P.hand.find((c) => c.id === a.c) : null;
    const m = a.m != null ? findMon(G, a.m) : null;
    switch (a.k) {
      case 'bench': {
        const mon = toBench(G, P, card);
        mon.since = G.turn;
        emit(G, 'bench', `${P.name} puts ${card.def.name} on the Bench.`, { who: P.i, hl: [mon.id] });
        benchHurt(G, P, mon);
        for (const ab of card.def.abil) {
          // Last-Ditch Abilities: one a turn
          if (ab.k !== 'bench' || (ab.lastDitch && P.flags.lastDitch === G.turn) || !ab.fx.every((f) => fxPossible(G, P, mon, f))) continue;
          if (!yes(G, P, 'abilityTrigger', true, { mon: mon.id, ability: ab.name })) continue;
          if (ab.lastDitch) P.flags.lastDitch = G.turn;
          emit(G, 'ability', `${card.def.name}'s ${ab.name}.`, { hl: [mon.id] });
          runFx(G, { P, O: opp(G, P), src: mon, label: ab.name }, ab.fx);
        }
        return;
      }
      case 'evolve': evolveInto(G, P, m, card); return;
      case 'energy':
        attachEnergy(G, P, m, card);
        P.flags.energy = G.turn;
        P.stats.energy++;
        emit(G, 'energy', `${P.name} attaches ${card.def.name} to ${nm(m)}.`, { who: P.i, hl: [m.id] });
        // Telepathic Psychic Energy, Enriching Energy
        if (card.def.onAttach && (!card.def.onAttach.onType || top(m).types.includes(card.def.onAttach.onType))) runFx(G, { P, O: opp(G, P), src: m, label: card.def.name }, card.def.onAttach.fx);
        return;
      case 'tool': playTrainer(G, P, card, m); return;
      case 'play': playTrainer(G, P, card); return;
      case 'ability': useAbility(G, P, m, top(m).abil[a.i]); return;
      case 'stadium': useStadium(G, P); return;
      case 'retreat': {
        const old = P.active;
        const b = pickMon(G, P, P.bench, 'retreatTo', (x) => (P.flags.switchTo === x.id ? 1000 : 0) + promoteScore(G, P, x));
        const cost = retreatCost(G, old);
        if (cost) {
          const chosen = pickCards(G, P, old.energy.slice(), cost, cost, 'retreatCost', (x) => x.sort((p, q) => (needs(old).includes(p.def.provides) ? 1 : 0) - (needs(old).includes(q.def.provides) ? 1 : 0)), { mon: old.id });
          removeEnergy(G, P, old, chosen);
        }
        P.flags.retreated = G.turn;
        switchActive(G, P, b, false);
        emit(G, 'retreat', `${P.name} retreats ${nm(old)}${cost ? `, discarding ${plural(cost, 'Energy', 'Energy')}` : ''}. ${nm(b)} is now Active.`, { who: P.i, hl: [b.id] });
        return;
      }
      case 'attack': useAttack(G, P, P.active, a.i); return;
      default: return;
    }
  }

  /* ---------- AI: a whole turn ---------- */
  // estimated damage of attack i by attacker m against target t, coin flips averaged
  function estimate(G, P, m, i, t) { return estimateWith(G, P, m, atksOf(G, m)[i], t); }
  function estimateWith(G, P, m, a, t) {
    const O = G.players[t.owner];
    const ctx = { P, O, src: m, atk: a, isAttack: true, fuel: 0, plus: 0, times: null, noWR: false, noRes: false, pierce: false };
    let mult = 1, ko = false, counters = 0;
    for (const f of a.fx) {
      switch (f.k) {
        case 'handCounters': counters += protectedFromEffects(G, ctx, t) ? 0 : f.n * 10 * P.hand.length; break;
        case 'coins': if (f.more) ctx.plus += f.n * (f.coins === 'tails' ? 1 : f.coins / 2); else ctx.times = f.n * (f.coins === 'tails' ? 1 : f.coins / 2); break;
        case 'flip': {
          if (f.tails.some((x) => x.k === 'nothing')) mult *= 0.5;
          for (const g of f.heads) if (g.k === 'plus') ctx.plus += g.n / 2;
          if (f.heads.some((g) => g.k === 'copyAttack')) { const D = O.active; ctx.times = D ? Math.max(0, ...top(D).atks.filter((x) => !copyOf(x)).map((x) => x.base)) : 0; mult *= 0.5; }
          break;
        }
        case 'flipAll': mult *= 1; break;
        case 'flipAny': mult *= Math.pow(0.5, f.coins); break;
        case 'scale': { const k = countFor(G, ctx, f.per, f.type); if (f.how === 'times') ctx.times = f.n * k; else if (f.how === 'less') ctx.plus -= f.n * k; else ctx.plus += f.n * k; break; }
        case 'bonus': if (bonusApplies(G, ctx, f)) ctx.plus += f.n; break;
        case 'plus': ctx.plus += f.n; break;
        case 'noWR': ctx.noWR = true; break;
        case 'noRes': ctx.noRes = true; break;
        case 'pierce': ctx.pierce = true; break;
        case 'hitNew': ctx.times = f.n; break;
        case 'snipe': ctx.times = f.perSelf ? f.perSelf * Math.floor(m.dmg / 10) : f.n; break;
        case 'copyAttack': { const D = O.active; ctx.times = D ? Math.max(0, ...top(D).atks.filter((x) => !copyOf(x)).map((x) => x.base)) : 0; break; }
        case 'fuel': ctx.fuel = Math.min(f.max, f.from === 'hand'
          ? P.hand.filter((c) => isEnergy(c.def) && (!f.basic || c.def.basicEnergy) && (!f.type || c.def.provides === f.type)).length
          : (f.from === 'self' ? energyOf(m) : mons(P).flatMap(energyOf)).filter((e) => !f.type || e === f.type).length); break;
        case 'perFuel': if (f.more) ctx.plus += f.n * ctx.fuel; else ctx.times = f.n * ctx.fuel; break;
        case 'ko': ko = !protectedFromEffects(G, ctx, t); break;
        default: break;
      }
    }
    const base = Math.max(0, (ctx.times != null ? ctx.times : a.base) + ctx.plus);
    const dmg = (attackDamage(G, ctx, t, base, true) + counters) * mult;
    return { dmg, ko: ko || dmg >= hpLeft(G, t), sure: mult === 1 && !a.fx.some((f) => f.k === 'coins') };
  }
  function sideValue(G, P, m, a) {
    let v = 0;
    for (const f of a.fx) {
      switch (f.k) {
        case 'cond': v += f.who === 'opp' ? 8 * f.c.length : -6; break;
        case 'flip': v += 3; break;
        case 'bench': v += f.n / 10 * (f.side === 'own' ? -1.2 : 1) * (f.count === 'all' ? opp(G, P).bench.length || 1 : f.count); break;
        case 'spread': v += f.n / 10 * opp(G, P).bench.length; break;
        case 'counters': case 'countersSpread': v += f.n * (f.count === 'all' ? opp(G, P).bench.length + 1 : f.count || 1); break;
        case 'heal': v += Math.min(m.dmg, f.n) / 10; break;
        case 'draw': v += f.n > drawBudget(G, P) ? -8 : f.n * 1.5; break;
        case 'drawTo': v += Math.max(0, f.n - P.hand.length) > drawBudget(G, P) ? -8 : Math.max(0, f.n - P.hand.length); break;
        case 'discardHand': v -= P.hand.length * 1.2; break;
        case 'benchSearch': v += P.bench.length < BENCH ? 6 : 0; break;
        case 'energySearch': case 'pokeSearch': case 'tutor': case 'cardSearch': v += 4; break;
        case 'attachDeck': case 'attachDiscard': v += 7 * (f.n || 1); break;
        case 'selfDmg': v -= f.ifKo ? 4 : f.n / 10 * 1.5; break;
        case 'discardSelfEnergy': v -= (f.n === 'all' ? m.energy.length : f.n) * 5; break;
        case 'fuel': v -= 4; break;
        case 'lockSelf': v -= 8; break;
        case 'shield': case 'protect': v += 7; break;
        case 'weaken': case 'noRetreat': case 'noAttack': case 'vulnerable': v += 5; break;
        case 'strip': v += 8; break;
        case 'itemLock': v += 6; break;
        case 'scoopSelf': v += m.dmg > 0 && threatened(G, P, m) ? 6 * top(m).prizes : -4; break;
        case 'tmEvolve': v += 14 * Math.min(f.n, P.bench.filter((x) => P.deck.some((c) => isPokemon(c.def) && c.def.from === nm(x))).length); break;
        case 'devolveAll': for (const x of mons(opp(G, P))) if (x.stack.length > 1) { const prev = x.stack[x.stack.length - 2].def; v += x.dmg >= prev.hp ? 100 * prev.prizes : 6 + 4 * (top(x).stage); } break;
        case 'switchSelf': v += f.may ? 2 : -2; break;
        case 'switchOutOpp': v += 3; break;
        case 'millOpp': v += f.n; break;
        case 'discardRandom': case 'oppDiscards': v += 4; break;
        default: break;
      }
    }
    return v;
  }
  function bestAttackOn(G, P, m, t) {
    let best = { i: -1, dmg: 0, ko: false, score: -Infinity };
    atksOf(G, m).forEach((a, i) => {
      if (!canPay(energyOf(m), costOf(G, m, a))) return;
      const e = estimate(G, P, m, i, t);
      const score = (e.ko ? 100 * top(t).prizes + (e.sure ? 20 : 0) : (e.dmg / Math.max(10, hpLeft(G, t))) * 40 * top(t).prizes) + sideValue(G, P, m, a);
      if (score > best.score) best = { i, dmg: e.dmg, ko: e.ko, score };
    });
    return best;
  }
  function bestAttack(G, P, bonusDmg) {
    const m = P.active, t = opp(G, P).active;
    if (!m || !t) return { i: -1, score: -Infinity };
    let best = { i: -1, score: -Infinity, ko: false, dmg: 0 };
    atksOf(G, m).forEach((a, i) => {
      if (!canAttackWith(G, P, m, i)) return;
      const e = estimate(G, P, m, i, t);
      const dmg = e.dmg + (bonusDmg || 0);
      const ko = e.ko || dmg >= hpLeft(G, t);
      let score = (ko ? 100 * top(t).prizes + (e.sure ? 20 : 0) : (dmg / Math.max(10, hpLeft(G, t))) * 40 * top(t).prizes) + sideValue(G, P, m, a) + 1;
      if (m.cond.r === 'confused') score *= 0.5;
      if (score > best.score) best = { i, score, ko, dmg };
    });
    return best;
  }
  // a short look ahead: would the opponent knock out this Pokémon next turn?
  function threatened(G, P, m) {
    const O = opp(G, P);
    if (!O.active) return false;
    let worst = 0;
    top(O.active).atks.forEach((a, i) => {
      const e = shortfall(energyOf(O.active), a.cost);
      if (e.length > 1) return;
      const est = estimate(G, O, O.active, i, m);
      worst = Math.max(worst, est.dmg);
    });
    return worst >= hpLeft(G, m);
  }
  /* ---------- The hard AI: plan the turn on copies of the game ----------
     The normal AI makes each choice by rules of thumb. The hard AI first plays its turn out on copies of the game: the
     normal turn, and turns that differ in one choice (another Supporter, another Energy target, switching or staying,
     another gust target or attack), each followed by the opponent's reply. It can't see hidden cards: in every copy the
     opponent's hand, both decks and both sets of Prize cards are reshuffled from what it doesn't know. It then plays the
     line that left it best placed on average. */
  // A choice among options listed best first. Options are named (a card, a Pokémon, a target), so a plan means the same
  // choice in every copy of the game; skip adds "none". Without a plan, or when the planned option isn't there, the first.
  function optKey(P, x) {
    if (x == null) return '-';
    if (typeof x !== 'object') return String(x);
    if (x.def) return x.def.name;
    if (x.stack) return 'm' + x.id;
    if (x.k) { const c = x.c != null ? P.hand.find((h) => h.id === x.c) : null; return `${x.k}:${c ? c.def.name : ''}>${x.m != null ? x.m : ''}`; }
    return '?';
  }
  function planPick(G, P, tag, list, skip) {
    if (!list.length) return null;
    if (G.planFor !== P.i) return list[0];
    const occ = G.planUse[tag] || 0;
    G.planUse[tag] = occ + 1;
    if (G.planLog) G.planLog.push({ tag, occ, keys: list.map((x) => optKey(P, x)).concat(skip ? ['-'] : []) });
    const want = G.plan && G.plan[tag] && G.plan[tag][occ];
    if (want == null) return list[0];
    if (want === '-') return skip ? null : list[0];
    const hit = list.find((x) => optKey(P, x) === want);
    return hit !== undefined ? hit : list[0];
  }
  // A copy of the game to try things on. Card definitions and the pool are shared; nothing is recorded.
  function cloneGame(G) {
    const seen = new Map();
    const cp = (x, key) => {
      if (x === null || typeof x !== 'object') return x;
      if (key === 'pool' || key === 'setup' || key === 'answers' || key === 'aiCache' || x.__d) return x;
      if (key === 'frames') return [];
      if (seen.has(x)) return seen.get(x);
      if (Array.isArray(x)) { const a = new Array(x.length); seen.set(x, a); for (let i = 0; i < x.length; i++) a[i] = cp(x[i]); return a; }
      if (x instanceof Map || x instanceof Set) { const y = new x.constructor(x); seen.set(x, y); return y; }
      if (typeof x.next === 'function' && typeof x.s === 'number') { const r = makeRng(1); r.s = x.s; seen.set(x, r); return r; }
      const o = {};
      seen.set(x, o);
      for (const k in x) o[k] = cp(x[k], k);
      return o;
    };
    const C = cp(G);
    C.record = false; C.human = null; C.sim = true; C.plan = null; C.planLog = null; C.planUse = {};
    return C;
  }
  // Reshuffles what player i can't see: the opponent's hand, deck and Prize cards together, and its own deck and Prize cards.
  function determinize(C, i, seed) {
    const r = makeRng(seed);
    const me = C.players[i], O = C.players[1 - i];
    const theirs = r.shuffle(O.hand.concat(O.deck, O.prizes));
    const h = O.hand.length, z = O.prizes.length;
    O.hand = theirs.slice(0, h); O.prizes = theirs.slice(h, h + z); O.deck = theirs.slice(h + z);
    const mine = r.shuffle(me.deck.concat(me.prizes));
    const z2 = me.prizes.length;
    me.prizes = mine.slice(0, z2); me.deck = mine.slice(z2);
    C.rng = simRng(C, seed);
  }
  // In a copy, chance (coins, shuffles) starts afresh each turn from the copy's seed, so lines that differ in one choice
  // still meet the same luck on later turns and can be compared fairly
  const mix32 = (x) => { x ^= x >>> 16; x = Math.imul(x, 0x85ebca6b); x ^= x >>> 13; x = Math.imul(x, 0xc2b2ae35); x ^= x >>> 16; return x >>> 0; };
  function simRng(C, seed) {
    const r = makeRng(seed), step = r.next;
    let at = null;
    r.next = () => { if (C.turn !== at) { at = C.turn; r.s = mix32((seed ^ Math.imul(C.turn + 1, 0x9e3779b1)) >>> 0) || 1; } return step(); };
    return r;
  }
  // How good a position is for player i: Prize cards above all, then the board, then who threatens a Knock Out.
  function evalPos(G, i) {
    if (G.over) return G.winner === i ? 100000 : G.winner == null ? 0 : -100000;
    const P = G.players[i], O = G.players[1 - i];
    let v = 150 * (O.prizes.length - P.prizes.length);
    const side = (Q) => mons(Q).reduce((s2, m) => {
      const d = top(m), hp = maxHp(G, m) || 1, left = Math.max(0, hp - m.dmg);
      return s2 + 24 * (left / hp) * d.prizes + 7 * m.energy.length + 6 * d.stage + (m.tool ? 3 : 0);
    }, 0);
    v += side(P) - side(O);
    if (P.active && O.active) {
      const mine = bestAttackOn(G, P, P.active, O.active);
      if (mine.ko) v += 45 * top(O.active).prizes; else if (mine.i >= 0) v += 8;
      const theirs = bestAttackOn(G, O, O.active, P.active);
      if (theirs.ko) v -= 45 * top(P.active).prizes;
    }
    if (!P.bench.length) v -= 40;
    if (!O.bench.length) v += 25;
    v += 2.5 * Math.min(P.hand.length, 8) - 2 * Math.min(O.hand.length, 8);
    if (P.deck.length < 5) v -= 12 * (5 - P.deck.length);
    return v;
  }
  function hashStr(str) { let h = 2166136261; for (let k = 0; k < str.length; k++) { h ^= str.charCodeAt(k); h = Math.imul(h, 16777619); } return h >>> 0; }
  // screen: every line is first tried briefly; the most promising ones are then played out in full against more shuffles
  const HARD = { samples: 16, alts: 3, cands: 10, depth: 40, z: 1, win: 1000, pairs: 2, screen: { samples: 6, depth: 2, keep: 3 } };
  // Only choices that can't all be made in the same turn are worth trying another way
  const VARY = { supporter: 1, energy: 1, gust: 1, attack: 1, switch: 1, switchTo: 1, bench: 1 };
  function searchPlan(G, P) {
    const base = hashStr(`${G.seed}:${G.turn}:${P.i}:${G.qi}`);
    // its turn, then the opponent's reply, its own next turn and so on, up to `depth` turns on
    const turnOut = (C, depth) => {
      aiTurn(C, C.players[P.i]);
      for (let t = 0; t < depth && !C.over; t++) {
        endTurn(C);
        if (C.over) return;
        startTurn(C);
        if (C.over) return;
        aiTurn(C, C.players[C.active]);
      }
      if (!C.over) endTurn(C);
    };
    const value = (C) => C.over ? (C.winner === P.i ? 1 : C.winner == null ? 0 : -1) * HARD.win : evalPos(C, P.i);
    // The normal line, to see which choices this turn has
    const probe = cloneGame(G);
    determinize(probe, P.i, base);
    probe.planFor = P.i; probe.planLog = []; probe.planUse = {}; probe.plan = {};
    aiTurn(probe, probe.players[P.i]);
    let plans = [null];
    for (const d of probe.planLog) {
      if (d.keys.length < 2 || !VARY[d.tag]) continue;
      // benching another Basic first changes little; not benching at all might
      const alts = d.tag === 'bench' ? d.keys.slice(-1) : d.keys.slice(1, 1 + HARD.alts);
      for (const key of alts) {
        if (plans.length >= HARD.cands) break;
        plans.push({ [d.tag]: { [d.occ]: key } });
      }
    }
    if (HARD.trace) HARD.trace.plans += plans.length;
    if (plans.length === 1) return {};
    // every line meets the same shuffles of the unknown cards
    const tryAll = (list, samples, depth, salt) => {
      const vals = list.map(() => []);
      for (let sN = 0; sN < samples; sN++) {
        const seed = mix32((base + sN * 7919 + salt) >>> 0);
        list.forEach((plan, k) => {
          const C = cloneGame(G);
          determinize(C, P.i, seed);
          C.planFor = P.i; C.plan = plan || {}; C.planUse = {};
          try { turnOut(C, depth); } catch (e) { if (!(e instanceof NeedInput)) throw e; }
          vals[k].push(value(C));
        });
      }
      // each line against the normal one, shuffle by shuffle
      return vals.map((v) => {
        const d = v.map((x, i) => x - vals[0][i]);
        const n = d.length, mean = d.reduce((a, b) => a + b, 0) / n;
        const sd = Math.sqrt(d.reduce((a, b) => a + (b - mean) * (b - mean), 0) / Math.max(1, n - 1));
        return { mean, lower: mean - HARD.z * sd / Math.sqrt(n) };
      });
    };
    if (HARD.screen && plans.length > HARD.screen.keep + 1) {
      const quick = tryAll(plans, HARD.screen.samples, HARD.screen.depth, 0);
      const order = plans.map((p, k) => k).slice(1).sort((a, b) => quick[b].mean - quick[a].mean).slice(0, HARD.screen.keep);
      const top3 = order.map((k) => plans[k]);
      // two changes together, when they are about different choices (an Energy for the Pokémon it switches to, say)
      const pairs = [];
      if (HARD.pairs) for (let a = 0; a < top3.length; a++) for (let b = a + 1; b < top3.length; b++) {
        const ta = Object.keys(top3[a])[0], tb = Object.keys(top3[b])[0];
        if (ta !== tb && quick[order[a]].mean > 0 && quick[order[b]].mean > 0) pairs.push({ ...top3[a], ...top3[b] });
      }
      plans = [null].concat(top3, pairs.slice(0, HARD.pairs || 0));
    }
    // a line replaces the normal one only when it does better by more than the luck of the shuffles could explain
    const res = tryAll(plans, HARD.samples, HARD.depth, 104729);
    let best = {}, bv = 0;
    for (let k = 1; k < plans.length; k++) if (res[k].mean > 0 && res[k].lower > bv) { bv = res[k].lower; best = plans[k]; }
    if (HARD.trace) { const t = Object.keys(best)[0] || 'normal'; HARD.trace[t] = (HARD.trace[t] || 0) + 1; }
    if (HARD.log && Object.keys(best).length) {
      const tag = Object.keys(best)[0], occ = Object.keys(best[tag])[0], d = probe.planLog.find((x) => x.tag === tag && String(x.occ) === occ);
      HARD.log.push({ turn: G.turn, me: P.name, vs: opp(G, P).name, tag, normal: d && d.keys[0], chosen: best[tag][occ], gain: Math.round(bv), keys: d && d.keys });
    }
    return best;
  }
  function hardTurn(G, P) {
    const key = `${G.turn}:${P.i}:${G.qi}:${hashStr(JSON.stringify(G.answers.slice(0, G.qi)))}`;
    let plan = G.aiCache ? G.aiCache[key] : null;
    if (!plan) { plan = searchPlan(G, P); if (G.aiCache) G.aiCache[key] = plan; }
    G.plan = plan; G.planFor = P.i; G.planUse = {};
    try { aiTurn(G, P); } finally { G.plan = null; G.planFor = null; }
  }

  function aiTurn(G, P) {
    const O = opp(G, P);
    const persona = PERSONAS[P.persona];
    const act = (a) => { doAction(G, P, a); return !G.over; };
    const has = (k, pred) => actions(G, P).filter((a) => a.k === k && (!pred || pred(a)));
    const card = (id) => P.hand.find((c) => c.id === id);
    const deckLow = () => P.deck.length <= 6;
    for (let guard = 0; guard < 60 && !G.over; guard++) {
      if (P.active == null) break;
      let did = false;
      // 1. Basic Pokémon onto the Bench
      const benches = has('bench');
      if (benches.length && P.bench.length < persona.bench) {
        const best = planPick(G, P, 'bench', benches.map((a) => card(a.c)).sort((a, b) => cardNeed(G, P, b.def) - cardNeed(G, P, a.def)), true);
        if (best && act({ k: 'bench', c: best.id })) { did = true; continue; }
      }
      // 2. Evolve (Rare Candy first when it skips a Stage)
      const candy = has('play', (a) => card(a.c).def.fx && card(a.c).def.fx[0] && card(a.c).def.fx[0].k === 'rareCandy');
      if (candy.length) { act(candy[0]); did = true; continue; }
      const evos = has('evolve');
      if (evos.length) {
        const pick = evos.sort((a, b) => (isActive(G, findMon(G, b.m)) ? 1 : 0) - (isActive(G, findMon(G, a.m)) ? 1 : 0) || findMon(G, b.m).energy.length - findMon(G, a.m).energy.length)[0];
        act(pick); did = true; continue;
      }
      // 3. Abilities that draw, search or attach
      const abil = has('ability').filter((a) => {
        const m = findMon(G, a.m), ab = top(m).abil[a.i];
        if (ab.k === 'embrace' || !ab.fx) return false;
        if (ab.sacrifice) return aiSacrificeWorth(G, P, m, ab);
        const drawn = ab.fx.reduce((s2, f) => s2 + (f.k === 'draw' ? f.n + (f.activeBonus || 0) : f.k === 'drawTo' ? Math.max(0, f.n - P.hand.length) : f.k === 'tutor' ? 1 : 0), 0);
        if (drawn && drawn > drawBudget(G, P) && P.hand.length > 1) return false;
        if (ab.fx.some((f) => f.k === 'draw' || f.k === 'drawTo') && P.hand.length >= 8 && !handAttacker(G, P)) return false;
        if (ab.fx.some((f) => f.k === 'discardHand') && P.hand.length > 3) return false;
        if (ab.fx.some((f) => f.k === 'counters')) return mons(O).some((x) => hpLeft(G, x) <= ab.fx[0].n * 10);
        if (ab.fx.some((f) => f.k === 'heal')) return mons(P).some((x) => x.dmg >= 30);
        if (ab.fx.some((f) => f.k === 'gust')) return O.bench.some((x) => gustValue(G, P, x, null) >= 100);
        if (ab.fx.some((f) => f.k === 'switch')) return aiWantsSwitch(G, P);
        if (ab.k === 'often' && ab.fx.some((f) => f.k === 'shiftEnergy')) return aiShiftWorth(G, P, ab.fx[0].type);
        return true;
      });
      if (abil.length) { act(abil[0]); did = true; continue; }
      if (has('ability').some((a) => top(findMon(G, a.m)).abil[a.i].k === 'embrace')) {
        const a = has('ability').find((x) => top(findMon(G, x.m)).abil[x.i].k === 'embrace');
        const targets = mons(P).filter((x) => top(x).types.includes(top(findMon(G, a.m)).abil[a.i].onType) && needs(x).length && hpLeft(G, x) > 50);
        if (targets.length) { act(a); did = true; continue; }
      }
      // 4. Items that find things
      const items = has('play', (a) => card(a.c).def.trainer === 'item');
      const useful = items.map((a) => [a, itemValue(G, P, card(a.c))]).filter(([a, v]) => v > 0 && !(handAttacker(G, P) && handNet(G, P, card(a.c)) < 0 && v < 6)).sort((x, y) => y[1] - x[1]);
      if (useful.length) { const it = planPick(G, P, 'item', useful.map((x) => x[0]), false); act(it); did = true; continue; }
      // 5. A Supporter that draws or searches (gusts wait for the attack)
      if (P.flags.supporter !== G.turn && P.flags.skipSup !== G.turn) {
        const sups = has('play', (a) => card(a.c).def.trainer === 'supporter').map((a) => [a, supporterValue(G, P, card(a.c))]).filter(([a, v]) => v > 0 && !(handAttacker(G, P) && handNet(G, P, card(a.c)) < 0 && v < 6)).sort((x, y) => y[1] - x[1]);
        if (sups.length) {
          const sp = planPick(G, P, 'supporter', sups.map((x) => x[0]), true);
          if (sp) { act(sp); did = true; continue; }
          P.flags.skipSup = G.turn;
        }
      }
      // 6. Stadium
      const st = has('play', (a) => card(a.c).def.trainer === 'stadium');
      if (st.length && (!G.stadium || G.stadiumOwner !== P.i)) { act(st[0]); did = true; continue; }
      if (has('stadium').length) { act({ k: 'stadium' }); did = true; continue; }
      // 7. Tools on the Pokémon that gain most
      const tools = has('tool');
      if (tools.length) {
        const scored = tools.map((a) => [a, toolValue(G, P, card(a.c), findMon(G, a.m))]).filter(([, v]) => v > 0).sort((x, y) => y[1] - x[1]);
        if (scored.length) { act(scored[0][0]); did = true; continue; }
      }
      if (!did) break;
    }
    if (G.over || !P.active) return;
    // 8. Energy
    const ens = actions(G, P).filter((a) => a.k === 'energy');
    if (ens.length) {
      const scored = ens.map((a, k) => [a, energyTargetScore(G, P, findMon(G, a.m), card(a.c).def) + cardNeed(G, P, card(a.c).def) * 0.05, k]).sort((x, y) => y[1] - x[1] || x[2] - y[2]);
      const handFuel = mons(P).some((x) => energyAppetite(top(x)) === 'hand');
      const ok = scored.filter(([, v]) => v > (handFuel ? 2 : -1)).map((x) => x[0]);
      const pick = ok.length ? planPick(G, P, 'energy', ok, true) : null;
      if (pick) act(pick);
    }
    if (G.over) return;
    // second pass for things the energy unlocked (abilities, items)
    for (let guard = 0; guard < 10 && !G.over; guard++) {
      const items = actions(G, P).filter((a) => a.k === 'play' && card(a.c).def.trainer === 'item').map((a) => [a, itemValue(G, P, card(a.c))]).filter(([, v]) => v > 0).sort((x, y) => y[1] - x[1]);
      if (!items.length) break;
      act(items[0][0]);
    }
    if (G.over || !P.active) return;
    // 9. Retreat or Switch to a better attacker
    aiPosition(G, P);
    if (G.over || !P.active) return;
    // 10. Gust a better target, then attack
    aiGustAndAttack(G, P);
  }
  // move energy only when it lets the Active attack (or hit harder) right now
  function aiShiftWorth(G, P, type) {
    const A = P.active;
    if (!A) return false;
    const need = needs(A);
    if (!need.length) return false;
    return mons(P).some((m) => m !== A && m.energy.some((c) => (!type || c.def.provides === type) && (need.includes(c.def.provides) || need.includes('C'))) && (!isActive(G, m)));
  }
  function aiSacrificeWorth(G, P, m, ab) {
    const O = opp(G, P);
    const n = ab.fx[0].n * 10;
    return mons(O).some((x) => hpLeft(G, x) <= n && top(x).prizes > top(m).prizes) && P.prizes.length > top(m).prizes;
  }
  function itemValue(G, P, c) {
    const d = c.def, O = opp(G, P);
    const fx = d.fx || [];
    const f = fx[0] || {};
    const deckLow = P.deck.length <= 6;
    switch (f.k) {
      case 'benchSearch': return P.bench.length < PERSONAS[P.persona].bench && P.deck.some((x) => isBasic(x.def) && (!f.maxHp || x.def.hp <= f.maxHp)) ? 6 : 0;
      case 'pokeSearch': { const want = P.deck.filter((x) => isPokemon(x.def)).map((x) => cardNeed(G, P, x.def)); const best = Math.max(0, ...want); return best >= 5 ? (d.req ? best - 1 : best) : 0; }
      case 'energySearch': {
        if (!P.deck.some((x) => isEnergy(x.def))) return 0;
        if (mons(P).some((m) => energyAppetite(top(m)) === 'hand')) return 5;
        return !P.hand.some((x) => isEnergy(x.def)) && P.flags.energy !== G.turn ? 4 : 0;
      }
      case 'cardSearch': return f.what.some((w) => w === 'item' || w === 'tool') ? 3 : 4;
      case 'look': return P.flags.supporter !== G.turn && !P.hand.some((x) => x.def.trainer === 'supporter') ? 3.5 : 0;
      case 'tutor': return 3;
      case 'draw': case 'drawTo': return deckLow || (f.n || 1) > drawBudget(G, P) ? 0 : 3;
      case 'switch': return aiWantsSwitch(G, P) && (P.active.cond.r === 'asleep' || P.active.cond.r === 'paralyzed' || !canRetreat(G, P) || retreatCost(G, P.active) >= 2) ? 5 : 0;
      case 'heal': return P.active && P.active.dmg >= Math.min(60, (f.n || 30)) && hpLeft(G, P.active) > 0 && !threatenedAfterHeal(G, P, f.n) ? 3 : 0;
      case 'recoverEnergy': {
        const inDiscard = P.discard.filter((x) => isEnergy(x.def)).length;
        if (inDiscard >= 2 && mons(P).some((m) => energyAppetite(top(m)) === 'hand')) return 4.5;
        return inDiscard >= 2 && P.hand.filter((x) => isEnergy(x.def)).length <= 1 ? 3 : 0;
      }
      case 'recover': case 'rod': return P.discard.filter((x) => isPokemon(x.def)).length >= 2 && (f.k === 'recover' || deckLow) ? 2.5 : 0;
      case 'gust': return 0; // saved for the attack step
      case 'flip': return f.heads && f.heads[0] && f.heads[0].k === 'stripAny' ? (mons(O).some((m) => m.energy.length) ? 3 : 0) : f.heads && f.heads[0] && f.heads[0].k === 'gust' ? 0 : 2;
      case 'strip': case 'stripAny': return f.special ? (mons(O).some((m) => m.energy.some((e) => e.def.special)) ? 4 : 0) : O.active && O.active.energy.length ? 3 : 0;
      case 'redCard': return O.hand.length >= 5 ? (O.hand.length - 3) * 1.3 : 0;
      case 'shiftEnergy': return 0;
      case 'toolScrap': return mons(O).some((m) => m.tool) ? 2 : 0;
      case 'cond': return 4;
      case 'boost': return 0;
      default: return 1;
    }
  }
  function threatenedAfterHeal(G, P, n) { return false; }
  // How a Trainer changes the size of the hand (playing it counts as one card gone)
  function handNet(G, P, c) {
    const d = c.def;
    let n = -1 - (d.req && d.req.req === 'discard' ? d.req.n : 0);
    for (const f of d.fx || []) {
      if (f.k === 'draw') n += f.n;
      else if (f.k === 'drawTo') n += Math.max(0, f.n - (P.hand.length - 1));
      else if (f.k === 'pokeSearch' || f.k === 'energySearch' || f.k === 'tutor' || f.k === 'recover' || f.k === 'recoverEnergy') n += f.n || 1;
      else if (f.k === 'cardSearch') n += f.what.length;
      else if (f.k === 'crispin') n += 1;
      else if (f.k === 'rareCandy') n -= 1;
      else if (f.k === 'shuffleHand' || f.k === 'discardHand' || f.k === 'iono' || f.k === 'judge') n -= P.hand.length - 1;
    }
    return n;
  }
  const handAttacker = (G, P) => !!P.active && atksOf(G, P.active).some((a) => a.fx.some((f) => f.k === 'handCounters'));
  function supporterValue(G, P, c) {
    const d = c.def, O = opp(G, P);
    const f = (d.fx || [])[0] || {};
    const hand = P.hand.length - 1;
    const deckLow = P.deck.length <= 8;
    const budget = drawBudget(G, P);
    switch (f.k) {
      case 'draw': return deckLow || f.n > budget ? 0 : 6 - hand * 0.5 + f.n * 0.4;
      case 'discardHand': { const k = ((d.fx || [])[1] || {}).n || 7; return deckLow || k > budget ? 0 : 7 - hand * 0.9; }
      case 'shuffleHand': { const k = ((d.fx || [])[1] || {}).n || 6; return k - hand > budget || deckLow && hand > 3 ? 0 : 6.5 - hand * 0.6; }
      case 'drawTo': return f.n - hand > budget ? 0 : Math.max(0, (f.n - hand) * 1.2);
      case 'judge': return O.hand.length >= 5 && hand <= 4 ? 5 : 1;
      case 'iono': return (P.prizes.length - hand) * 1.1 - (O.prizes.length - O.hand.length) * 0.9 + (O.prizes.length <= 2 ? 2 : 0);
      case 'pokeSearch': case 'cardSearch': case 'energySearch': { const v = itemValue(G, P, c); return v > 0 ? v + 0.5 : 2.5; }
      case 'benchSearch': return itemValue(G, P, c);
      case 'gust': return 0; // played only to set up a knock out
      case 'switch': return aiWantsSwitch(G, P) ? 4 : 0;
      case 'heal': return P.active && P.active.dmg >= 60 ? 3 : 0;
      case 'scoop': return P.active && P.active.dmg >= hpLeft(G, P.active) && P.bench.length ? 4 : 0;
      case 'recover': case 'recoverEnergy': case 'rod': return P.discard.length >= 4 ? 2.5 : 0;
      case 'choose': return 0;
      case 'boost': return 0;
      case 'crispin': return P.deck.some((x) => isEnergy(x.def) && x.def.basicEnergy) ? 4.5 + (mons(P).some((m) => needs(m).length) ? 1.5 : 0) : 0;
      case 'attachDiscard': return f.to === 'stage2' && mons(P).some((m) => top(m).stage === 2 && needs(m).length) ? 6 : 0;
      case 'eri': return O.hand.length >= 4 ? 3.5 : 1;
      default: return 1.5;
    }
  }
  function toolValue(G, P, c, m) {
    const t = c.def.tool;
    if (!t) return 0;
    const d = top(m);
    switch (t.k) {
      case 'hp': return t.basic && d.stage !== 0 ? 0 : (isActive(G, m) ? 4 : 2) + d.prizes;
      case 'dmg': return d.atks.length ? (isActive(G, m) ? 4 : 2.5) + attackPower(d) / 30 : 0;
      case 'retreat': return retreatCost(G, m) >= 1 && (!t.stage || t.stage === d.stage) ? (isActive(G, m) ? 3 : 1.5) : 0;
      case 'shield': return (!t.type || d.types.includes(t.type)) && (!t.stage || t.stage === d.stage) ? (isActive(G, m) ? 3.5 : 1.5) : 0;
      case 'noWeak': return d.stage === 0 && d.weak.length ? 2 : 0;
      case 'tm': {
        if (!isActive(G, m) || !c.def.tmAtks || !c.def.tmAtks.length) return 0;
        const a = c.def.tmAtks[0];
        const payable = canPay(energyOf(m), a.cost) || (P.flags.energy !== G.turn && P.hand.some((x) => isEnergy(x.def)) && shortfall(energyOf(m), a.cost).length <= 1);
        if (!payable || (G.turn <= 1 && P.i === G.first)) return 0;
        const v = sideValue(G, P, m, a);
        const own = bestAttack(G, P);
        return v > 10 && v > (own.score || 0) ? v / 4 : 0;
      }
      default: return isActive(G, m) ? 2 : 1;
    }
  }
  function aiPosition(G, P) {
    const A = P.active;
    if (!A || !P.bench.length) return;
    const O = opp(G, P);
    if (!O.active) return;
    const here = bestAttack(G, P);
    const stuck = here.i < 0 || A.cond.r === 'asleep' || A.cond.r === 'paralyzed';
    const ranked = P.bench.map((b) => { const e = bestAttackOn(G, P, b, O.active); return [b, e.i >= 0 ? e.score : -50 + promoteScore(G, P, b)]; }).sort((x, y) => y[1] - x[1]);
    const bv = ranked[0][1];
    const gain = bv - (stuck ? -40 : here.score);
    const doomed = threatened(G, P, A) && top(A).prizes >= 2 && P.bench.some((b) => top(b).prizes < top(A).prizes);
    const better = gain > 25 * PERSONAS[P.persona].hold || (stuck && bv > -20);
    // moving only to save Prize cards means bringing in something worth fewer of them
    const cheaper = ranked.filter(([b]) => top(b).prizes < top(A).prizes);
    const want = better || (doomed && here.score < 100 && cheaper.length > 0);
    // the hard AI may also try staying put when it would move, or moving when it would stay
    const moveIt = planPick(G, P, 'switch', want ? ['move', 'stay'] : ['stay', 'move'], false) === 'move';
    if (!moveIt || !(canRetreat(G, P) || P.hand.some((c) => c.def.trainer === 'item' && c.def.fx && c.def.fx.length === 1 && c.def.fx[0].k === 'switch'))) return;
    // and bring in another Pokémon than the one that hits hardest
    const cands = (!better && doomed && cheaper.length ? cheaper : ranked).map((x) => x[0]);
    const to = planPick(G, P, 'switchTo', cands, false);
    P.flags.switchTo = to.id;
    const sw = P.hand.find((c) => c.def.trainer === 'item' && c.def.fx && c.def.fx.length === 1 && c.def.fx[0].k === 'switch' && trainerPlayable(G, P, c));
    if (sw && (!canRetreat(G, P) || retreatCost(G, A) >= 1)) doAction(G, P, { k: 'play', c: sw.id });
    else if (canRetreat(G, P) && (retreatCost(G, A) <= 1 || stuck || gain > 60 || (G.plan && !want))) doAction(G, P, { k: 'retreat' });
    P.flags.switchTo = null;
  }
  function aiGustAndAttack(G, P) {
    const O = opp(G, P);
    if (!P.active || !O.active) { doAction(G, P, { k: 'end' }); return; }
    const card = (id) => P.hand.find((c) => c.id === id);
    const here = bestAttack(G, P);
    const gusts = actions(G, P).filter((a) => a.k === 'play' && card(a.c).def.fx && card(a.c).def.fx.some((f) => f.k === 'gust' || (f.k === 'flip' && f.heads.some((g) => g.k === 'gust'))));
    if (gusts.length && O.bench.length && P.active && here.i >= 0) {
      let target = null, tv = here.ko ? 100 * top(O.active).prizes : 0;
      const ko = [];
      for (const b of O.bench) {
        const e = bestAttackOn(G, P, P.active, b);
        if (e.ko) ko.push([b, 100 * top(b).prizes * PERSONAS[P.persona].gust]);
        if (e.ko && 100 * top(b).prizes * PERSONAS[P.persona].gust > tv) { tv = 100 * top(b).prizes * PERSONAS[P.persona].gust; target = b; }
      }
      // the hard AI can weigh every Knock Out a gust would set up, or not gusting at all
      if (ko.length) {
        const order = ko.sort((x, y) => y[1] - x[1]).map((x) => x[0]);
        const list = target ? [target].concat(order.filter((b) => b !== target), ['none']) : ['none'].concat(order);
        const g = planPick(G, P, 'gust', list, false);
        target = g === 'none' ? null : g;
      }
      if (target) {
        const g = gusts.sort((a, b) => (card(a.c).def.trainer === 'item' ? 0 : 1) - (card(b.c).def.trainer === 'item' ? 0 : 1))[0];
        doAction(G, P, g);
        if (G.over) return;
      }
    }
    // the Supporter might still help (Kieran's boost, a late draw)
    const choose = actions(G, P).find((a) => a.k === 'play' && card(a.c).def.trainer === 'supporter' && card(a.c).def.fx && card(a.c).def.fx[0].k === 'choose');
    if (choose && O.active && top(O.active).ex && bestAttack(G, P).i >= 0) { doAction(G, P, choose); if (G.over) return; }
    const now = bestAttack(G, P);
    if (now.i >= 0 && now.score > -5) {
      // the hard AI can also try its other attacks
      const others = G.plan ? top(P.active).atks.map((a, i) => i).filter((i) => i !== now.i && canAttackWith(G, P, P.active, i)) : [];
      const i = others.length ? planPick(G, P, 'attack', [now.i].concat(others), false) : now.i;
      doAction(G, P, { k: 'attack', i });
      return;
    }
  }

  /* ---------- Human turns ---------- */
  function humanTurn(G, P) {
    for (let guard = 0; guard < 400 && !G.over; guard++) {
      if (!P.active) return;
      const opts = actions(G, P);
      const a = ask(G, { type: 'act', options: opts });
      const pick = a.a || { k: 'end' };
      const ok = opts.some((o) => o.k === pick.k && o.c === pick.c && o.m === pick.m && o.i === pick.i);
      if (!ok || pick.k === 'end') return;
      doAction(G, P, pick);
      if (pick.k === 'attack') return;
    }
  }

  /* ---------- A whole game ---------- */
  function runGame(G) {
    if (!G.setup) setupGame(G);
    else {
      G.first = G.setup.first != null ? G.setup.first : G.setup.active || 0;
      G.active = G.setup.active || 0;
      G.turn = (G.setup.turn || 1) - 1;
      emit(G, 'start', G.setup.text || `${G.players[0].name} vs ${G.players[1].name}.`);
    }
    while (!G.over) {
      startTurn(G);
      if (G.over) break;
      const P = G.players[G.active];
      if (isHuman(G, P)) humanTurn(G, P); else if (P.ai === 'hard' && !G.sim) hardTurn(G, P); else aiTurn(G, P);
      if (G.over) break;
      if (G.stopAfter != null && G.turn >= G.stopAfter) break;
      endTurn(G);
    }
    return G;
  }
  // Play a game from scratch. With a human seat, stops with { need } at the first decision without an answer.
  function play(opts) {
    const G = createGame(opts);
    try { runGame(G); } catch (e) { if (e instanceof NeedInput) return { G, need: e.req }; throw e; }
    return { G, need: null };
  }

  /* ============================================================
     11. Decks
     ============================================================ */
  function resolveDeck(pool, deck) {
    const cards = [];
    const missing = [];
    for (const [k, id] of deck.cards) {
      const d = pool.get(id) || (pool.byName.get(id) || [])[0];
      if (!d) { missing.push(id); continue; }
      for (let i = 0; i < k; i++) cards.push(d);
    }
    return { ...deck, cards, missing };
  }
  function checkDeck(cards) {
    const problems = [];
    if (cards.length !== 60) problems.push(`${cards.length} cards, not 60`);
    const byName = {};
    for (const d of cards) if (!(d.kind === 2 && d.basicEnergy)) byName[d.name] = (byName[d.name] || 0) + 1;
    for (const [n, k] of Object.entries(byName)) if (k > 4) problems.push(`${k} copies of ${n}`);
    if (cards.filter((d) => d.ace).length > 1) problems.push('more than 1 ACE SPEC');
    if (!cards.some(isBasic)) problems.push('no Basic Pokémon');
    return problems;
  }
  // Build a 60-card deck around one or two types from the playable pool.
  // How much a Trainer helps a deck it's added to, for filling a deck from a smaller set of cards
  function trainerRank(d) {
    const f = (d.fx || [])[0] || {};
    if (d.trainer === 'supporter') return ['draw', 'drawTo', 'shuffleHand', 'discardHand', 'iono', 'judge'].includes(f.k) ? 10 : f.k === 'gust' ? 8 : ['pokeSearch', 'cardSearch', 'benchSearch', 'energySearch', 'crispin'].includes(f.k) ? 7 : 3;
    if (d.trainer === 'item') return ['pokeSearch', 'benchSearch', 'cardSearch'].includes(f.k) ? 8 : f.k === 'switch' ? 6 : ['energySearch', 'recover', 'recoverEnergy', 'rod'].includes(f.k) ? 5 : f.k === 'gust' || f.k === 'flip' ? 4 : f.k === 'heal' ? 3 : f.k === 'rareCandy' ? 0 : 2;
    if (d.trainer === 'tool') return d.tool && d.tool.k === 'tm' ? 1 : 3;
    return d.trainer === 'stadium' ? 2 : 1;
  }
  // allow: only cards it accepts go in (Standard, or one set's cards); Basic Energy always can
  function buildDeck(pool, { types, archetype = 'midrange', seed = 1, name, allow } = {}) {
    const rng = makeRng(seed);
    const ok = (d) => !allow || (d.kind === 2 && d.basicEnergy) || allow(d);
    const T = types && types.length ? types : [Object.keys(TYPES)[rng.int(8)]];
    const fits = (d) => !!d.types && [...d.types].some((t) => T.includes(t) || t === 'C') && [...d.types].every((t) => T.includes(t) || t === 'C');
    const pkmn = pool.list.filter((d) => d.kind === 0 && ok(d) && fits(d) && d.atks.every((a) => [...a.cost].every((ch) => ch === 'C' || T.includes(ch))));
    const byName = new Map();
    for (const d of pkmn) { if (!byName.has(d.name) || pokemonScore(d) > pokemonScore(byName.get(d.name))) byName.set(d.name, d); }
    const basics = [...byName.values()].filter((d) => d.stage === 0);
    const evoOf = (d) => [...byName.values()].filter((e) => e.from === d.name);
    // lines: Basic -> Stage 1 -> Stage 2, scored by their top stage
    const lines = [];
    for (const b of basics) {
      const s1s = evoOf(b);
      if (!s1s.length) lines.push({ cards: [b], score: pokemonScore(b) + (archetype === 'aggro' ? 3 : 0) + rng.next() });
      for (const s1 of s1s) {
        const s2s = evoOf(s1);
        if (!s2s.length) lines.push({ cards: [b, s1], score: pokemonScore(s1) + 1.5 + rng.next() * 2 });
        for (const s2 of s2s) lines.push({ cards: [b, s1, s2], score: pokemonScore(s2) + (archetype === 'control' ? 3 : archetype === 'aggro' ? -3 : 1.5) + rng.next() * 2 });
      }
    }
    lines.sort((a, b) => b.score - a.score);
    const picked = [];
    const used = new Set();
    let pokeCount = 0;
    const want = archetype === 'aggro' ? 16 : 18;
    for (const l of lines) {
      if (pokeCount >= want) break;
      if (l.cards.some((c) => used.has(c.name))) continue;
      const counts = l.cards.length === 3 ? [4, 2, 3] : l.cards.length === 2 ? [4, 3] : [archetype === 'aggro' ? 4 : 3];
      const k = counts.reduce((s, x) => s + x, 0);
      if (pokeCount + k > want + 2) continue;
      l.cards.forEach((c, i) => { picked.push([counts[i], c]); used.add(c.name); });
      pokeCount += k;
    }
    const hasStage2 = picked.some(([, d]) => d.stage === 2);
    const T1 = (name) => (pool.byName.get(name) || []).find(ok);
    const trainers = [];
    const add = (k, n) => {
      const d = T1(n);
      if (!d || (d.ace && trainers.some(([, x]) => x.ace))) return;
      if (60 - pokeCount - trainers.reduce((s, [x]) => s + x, 0) > 12) trainers.push([d.ace ? 1 : k, d]);
    };
    add(4, "Professor's Research"); add(3, 'Iono'); add(2, "Boss's Orders");
    add(4, 'Nest Ball'); add(3, 'Ultra Ball');
    if (hasStage2) add(3, 'Rare Candy');
    add(2, 'Switch'); add(2, 'Energy Retrieval'); add(1, 'Super Rod');
    if (archetype === 'control') { add(2, 'Crushing Hammer'); add(1, 'Judge'); }
    if (archetype === 'aggro') { add(2, 'Maximum Belt'); }
    add(1, "Hero's Cape"); add(2, 'Nemona'); add(2, 'Earthen Vessel');
    // From a smaller set of cards the staples may be missing: fill with the most useful Trainers there are, then more Pokémon
    if (allow) {
      const left = () => 60 - pokeCount - trainers.reduce((s, [x]) => s + x, 0);
      const have = new Set(trainers.map(([, d]) => d.name));
      const extra = pool.list.filter((d) => d.kind === 1 && ok(d) && !have.has(d.name) && trainerRank(d) >= 2 && !(d.fx && d.fx[0] && d.fx[0].k === 'rareCandy' && !hasStage2))
        .map((d) => [trainerRank(d) + rng.next(), d]).sort((a, b) => b[0] - a[0]);
      for (const [r, d] of extra) {
        if (left() <= 14) break;
        if (d.ace && trainers.some(([, x]) => x.ace)) continue;
        have.add(d.name);
        trainers.push([d.ace ? 1 : Math.min(r >= 7 ? 4 : r >= 5 ? 3 : 2, left() - 14), d]);
      }
      for (const l of lines) {
        if (left() <= 16) break;
        if (l.cards.some((c) => used.has(c.name))) continue;
        const counts = l.cards.length === 3 ? [3, 2, 2] : l.cards.length === 2 ? [3, 2] : [2];
        l.cards.forEach((c, i) => { picked.push([counts[i], c]); used.add(c.name); });
        pokeCount += counts.reduce((s, x) => s + x, 0);
      }
      for (const pk of picked) { if (left() <= 16) break; const more = Math.min(4 - pk[0], left() - 16); if (more > 0) { pk[0] += more; pokeCount += more; } }
    }
    const nonEnergy = pokeCount + trainers.reduce((s, [x]) => s + x, 0);
    const energyCount = 60 - nonEnergy;
    const energyTypes = T.filter((t) => t !== 'C' && t !== 'Y' && t !== 'N');
    const basicsE = energyTypes.map((t) => pool.list.find((d) => d.kind === 2 && d.basicEnergy && d.provides === t)).filter(Boolean);
    const energy = [];
    basicsE.forEach((d, i) => energy.push([Math.floor(energyCount / basicsE.length) + (i < energyCount % basicsE.length ? 1 : 0), d]));
    const cards = [];
    for (const [k, d] of picked.concat(trainers, energy)) for (let i = 0; i < k; i++) cards.push(d);
    const face = picked.slice().sort((a, b) => pokemonScore(b[1]) - pokemonScore(a[1]))[0];
    return { id: 'built-' + seed, name: name || `${T.map((t) => TYPES[t]).join('/')} ${PERSONAS[archetype].label}`, archetype, types: T, cards, face: face && face[1].id, built: true };
  }

  return {
    loadPool, createGame, runGame, play, actions, doAction, NeedInput, snap, makeRng, resolveDeck, checkDeck, buildDeck, trainerRank,
    pokemonScore, canPay, shortfall, retreatCost, maxHp, top, mons, PERSONAS, TYPES, MAX_TURNS, BENCH, COND_WORD,
    HARD, cloneGame, evalPos,
  };
});
