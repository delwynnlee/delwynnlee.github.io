/* Journal: a record of every game played against the AI, and the numbers drawn from it.
   An entry is written when a game ends (see the page's settle()); this file only shapes entries and adds them up,
   so it can be tested on its own. Entries are kept oldest first. */
(function (root, factory) {
  const J = factory();
  if (typeof module === 'object' && module.exports) module.exports = J;
  else root.ARENA_JOURNAL = J;
})(typeof self !== 'undefined' ? self : this, function () {
  const MAX = 1000;
  // How a game ended, in a few words
  const HOW = { prizes: 'Took every Prize card', bench: 'No Pokémon left in play', deck: 'Ran out of cards', turns: 'Turn limit', both: 'Both won at once' };
  const TYPE_ORDER = 'GRWLPFDMNYC';

  // One entry from a finished game's summary (the page's replay header) and what the page knows about it
  function entryOf(r, ctx) {
    const res = r.winner == null ? 'draw' : r.winner === 0 ? 'win' : 'loss';
    const side = (st, d) => ({
      n: d.name, t: (d.types || []).join(''),
      taken: st.taken || 0, left: st.left, dmg: st.damage || 0, kos: st.kos || 0, best: st.best || 0, tr: st.trainers || 0, en: st.energy || 0,
    });
    return {
      id: ctx.id, at: ctx.at || Date.now(), ai: ctx.ai || 'normal', mode: ctx.mode || 'free', res,
      why: r.why || (r.winner == null ? 'turns' : 'prizes'), turns: r.turns, first: r.first === 0,
      me: side(r.stats[0], ctx.decks[0]), op: side(r.stats[1], ctx.decks[1]),
      career: ctx.career != null ? ctx.career : undefined, fin: ctx.fin || undefined, secs: ctx.secs || undefined,
    };
  }
  // Adds an entry unless the same game is already there; the oldest go once there are too many
  function add(list, e) {
    if (list.some((x) => x.id === e.id)) return list;
    const out = list.concat([e]);
    return out.length > MAX ? out.slice(out.length - MAX) : out;
  }
  const tally = () => ({ n: 0, w: 0, l: 0, d: 0 });
  const count = (t, e) => { t.n++; if (e.res === 'win') t.w++; else if (e.res === 'loss') t.l++; else t.d++; return t; };
  const rate = (t) => (t.n ? t.w / t.n : 0);

  function stats(all, filter) {
    const list = filter ? all.filter(filter) : all.slice();
    const s = { n: list.length, all: tally(), byMode: {}, byAi: {}, byDeck: {}, byOpp: {}, byType: {}, byFirst: { first: tally(), second: tally() }, winHow: {}, lossHow: {}, trend: [], last: [],
      totals: { dmg: 0, kos: 0, taken: 0, tr: 0, turns: 0, secs: 0 }, rec: {} };
    let run = 0, best = 0, wins = 0;
    list.forEach((e, k) => {
      count(s.all, e);
      count(s.byMode[e.mode] = s.byMode[e.mode] || tally(), e);
      count(s.byAi[e.ai] = s.byAi[e.ai] || tally(), e);
      count(s.byFirst[e.first ? 'first' : 'second'], e);
      count(s.byDeck[e.me.n] = s.byDeck[e.me.n] || Object.assign(tally(), { t: e.me.t }), e);
      count(s.byOpp[e.op.n] = s.byOpp[e.op.n] || Object.assign(tally(), { t: e.op.t }), e);
      for (const t of new Set(e.me.t.split('').filter(Boolean))) count(s.byType[t] = s.byType[t] || tally(), e);
      if (e.res === 'win') s.winHow[e.why] = (s.winHow[e.why] || 0) + 1;
      if (e.res === 'loss') s.lossHow[e.why] = (s.lossHow[e.why] || 0) + 1;
      if (e.res === 'win') { wins++; run = run > 0 ? run + 1 : 1; best = Math.max(best, run); } else run = e.res === 'loss' ? (run < 0 ? run - 1 : -1) : 0;
      s.trend.push({ k: k + 1, rate: wins / (k + 1), e });
      const t = s.totals;
      t.dmg += e.me.dmg; t.kos += e.me.kos; t.taken += e.me.taken; t.tr += e.me.tr; t.turns += e.turns || 0; t.secs += e.secs || 0;
      const rec = s.rec;
      if (e.res === 'win' && (!rec.fastest || e.turns < rec.fastest.turns)) rec.fastest = e;
      if (!rec.longest || e.turns > rec.longest.turns) rec.longest = e;
      if (!rec.damage || e.me.best > rec.damage.me.best) rec.damage = e;
      // The closest call: a win when the other side was nearest to winning (the fewest Prize cards left to take)
      if (e.res === 'win' && e.op.left != null && (!rec.closest || e.op.left <= rec.closest.op.left)) rec.closest = e;
    });
    s.rate = rate(s.all);
    s.streak = run; // > 0: wins in a row, < 0: losses in a row
    s.bestStreak = best;
    const wonTurns = list.filter((e) => e.res === 'win').map((e) => e.turns);
    s.avgWinTurns = wonTurns.length ? wonTurns.reduce((a, b) => a + b, 0) / wonTurns.length : 0;
    s.last = list.slice(-30);
    const rows = (o) => Object.entries(o).map(([name, t]) => Object.assign({ name, rate: rate(t) }, t));
    s.decks = rows(s.byDeck).sort((a, b) => b.n - a.n || b.rate - a.rate);
    s.opps = rows(s.byOpp).filter((t) => t.n >= 2).sort((a, b) => a.rate - b.rate || b.n - a.n);
    s.types = rows(s.byType).sort((a, b) => TYPE_ORDER.indexOf(a.name) - TYPE_ORDER.indexOf(b.name));
    return s;
  }
  return { MAX, HOW, entryOf, add, stats, rate };
});
