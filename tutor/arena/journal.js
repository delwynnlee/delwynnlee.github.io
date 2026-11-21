/* Journal: a record of every game played against the AI, and the statistics drawn from it.
   An entry is written when a game ends (see the page's settle()); this file only shapes entries and adds them up,
   so it can be tested on its own. Entries are kept oldest first. */
(function (root, factory) {
  const J = factory();
  if (typeof module === 'object' && module.exports) module.exports = J;
  else root.ARENA_JOURNAL = J;
})(typeof self !== 'undefined' ? self : this, function () {
  const MAX = 1000;
  // How a game ended, in a few words, from the side of the person playing
  const HOW = { life: 'Life to zero', commander: 'Commander damage', decked: 'Ran out of cards', ring: 'The Ring', poison: 'Poison', turns: 'Turn limit', both: 'Both fell' };

  // One entry from a finished game's summary (the engine's replay header) and what the page knows about it
  function entryOf(r, ctx) {
    const res = r.winner == null ? 'draw' : r.winner === 0 ? 'win' : 'loss';
    const side = (p, d) => ({
      n: d.name, c: (d.colors || p.colors || []).join(''), cmd: p.cmd && r.defs[p.cmd.d] ? r.defs[p.cmd.d].name : undefined,
      life: p.life, dmg: p.stats.damage, cast: p.stats.cast, kills: p.stats.kills, gained: p.stats.gained, cd: p.cmdDmg || 0, mull: p.mulligans || 0,
    });
    return {
      id: ctx.id, at: ctx.at || Date.now(), fmt: r.format || 'standard', ai: ctx.ai || 'normal', res,
      why: r.winner == null ? (r.reason === 'turns' ? 'turns' : 'both') : r.reason || 'life',
      turns: r.turns, first: r.first === 0, me: side(r.players[0], ctx.decks[0]), op: side(r.players[1], ctx.decks[1]),
      career: ctx.career != null ? ctx.career : undefined, secs: ctx.secs || undefined,
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
    const s = { n: list.length, all: tally(), byFmt: {}, byAi: {}, byDeck: {}, byOpp: {}, byColor: {}, winHow: {}, lossHow: {}, trend: [], last: [], totals: { dmg: 0, cast: 0, kills: 0, gained: 0, turns: 0, secs: 0 }, rec: {} };
    let run = 0, best = 0, wins = 0;
    list.forEach((e, k) => {
      count(s.all, e);
      count(s.byFmt[e.fmt] = s.byFmt[e.fmt] || tally(), e);
      count(s.byAi[e.ai] = s.byAi[e.ai] || tally(), e);
      const dk = s.byDeck[e.me.n] = s.byDeck[e.me.n] || Object.assign(tally(), { c: e.me.c });
      count(dk, e);
      const ok = s.byOpp[e.op.n] = s.byOpp[e.op.n] || Object.assign(tally(), { c: e.op.c });
      count(ok, e);
      for (const c of new Set(e.me.c.split('').filter(Boolean))) count(s.byColor[c] = s.byColor[c] || tally(), e);
      if (e.res === 'win') s.winHow[e.why] = (s.winHow[e.why] || 0) + 1;
      if (e.res === 'loss') s.lossHow[e.why] = (s.lossHow[e.why] || 0) + 1;
      if (e.res === 'win') { wins++; run = run > 0 ? run + 1 : 1; best = Math.max(best, run); } else run = e.res === 'loss' ? (run < 0 ? run - 1 : -1) : 0;
      s.trend.push({ k: k + 1, rate: wins / (k + 1), e });
      const t = s.totals;
      t.dmg += e.me.dmg || 0; t.cast += e.me.cast || 0; t.kills += e.me.kills || 0; t.gained += e.me.gained || 0; t.turns += e.turns || 0; t.secs += e.secs || 0;
      const rec = s.rec;
      if (e.res === 'win' && (!rec.fastest || e.turns < rec.fastest.turns)) rec.fastest = e;
      if (!rec.longest || e.turns > rec.longest.turns) rec.longest = e;
      if (!rec.damage || (e.me.dmg || 0) > (rec.damage.me.dmg || 0)) rec.damage = e;
      if (e.res === 'win' && (!rec.closest || e.me.life < rec.closest.me.life)) rec.closest = e;
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
    s.colors = rows(s.byColor).sort((a, b) => 'WUBRG'.indexOf(a.name) - 'WUBRG'.indexOf(b.name));
    return s;
  }
  return { MAX, HOW, entryOf, add, stats, rate };
});
