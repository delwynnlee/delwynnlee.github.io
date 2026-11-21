/* Arena engine: reads Oracle text into abilities, plays simplified-but-faithful Magic between two AI players.
   Works in the browser (window.Arena) and in Node (module.exports). No dependencies. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Arena = api;
})(typeof self !== 'undefined' ? self : this, function () {
'use strict';

/* ============================================================
   1. Oracle text -> card definition
   ============================================================ */
const KW = new Set(['flying', 'reach', 'trample', 'haste', 'vigilance', 'deathtouch', 'lifelink', 'first strike', 'double strike',
  'menace', 'defender', 'indestructible', 'hexproof', 'flash', 'prowess']);
const WORDNUM = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
const toNum = (s) => (s == null ? NaN : /^\d+$/.test(s) ? +s : (WORDNUM[String(s).toLowerCase()] ?? NaN));
const COLOR_WORD = { white: 'W', blue: 'U', black: 'B', red: 'R', green: 'G' };
const BASIC_COLOR = { plains: 'W', island: 'U', swamp: 'B', mountain: 'R', forest: 'G' };
const COLORS = ['W', 'U', 'B', 'R', 'G'];

function parseCost(cost) {
  const c = { g: 0, W: 0, U: 0, B: 0, R: 0, G: 0 };
  if (!cost) return c;
  for (const m of cost.matchAll(/\{([^}]+)\}/g)) {
    const s = m[1];
    if (/^\d+$/.test(s)) c.g += +s;
    else if (s.length === 1 && 'WUBRG'.includes(s)) c[s] += 1;
    else if (s === 'X') c.x = (c.x || 0) + 1;
    else if (s === 'C') c.C = (c.C || 0) + 1;
    else if (/^[WUBRG]\/[WUBRG]$/.test(s)) (c.hy = c.hy || []).push(s[0] + s[2]); // hybrid: either color pays
    else return null; // Phyrexian, {C}, snow: not supported
  }
  return c;
}
const costMV = (c) => c.g + c.W + c.U + c.B + c.R + c.G + (c.C || 0) + (c.hy ? c.hy.length : 0);

// "nonblack creature an opponent controls" -> filter object
function parseTarget(spec) {
  let s = spec.trim();
  const f = {};
  let m;
  s = s.replace(/ or planeswalker( an opponent controls| you don't control)?$/, (x, opp) => (opp ? ' an opponent controls' : ''));
  s = s.replace(/^attacking or blocking creature/, 'combat creature');
  if ((m = /^(.*) (an opponent controls|you don't control|your opponents control)$/.exec(s))) { f.side = 'opp'; s = m[1]; }
  else if ((m = /^(.*) you control$/.exec(s))) { f.side = 'you'; s = m[1]; }
  if ((m = /^(.*) with (flying|reach|trample|deathtouch|lifelink|vigilance|haste|defender|menace|first strike)$/.exec(s))) { f.hasKw = m[2]; s = m[1]; }
  if ((m = /^(.*) without flying$/.exec(s))) { f.noKw = 'flying'; s = m[1]; }
  if ((m = /^(.*) with power (\d+) or (greater|less)$/.exec(s))) { f[m[3] === 'greater' ? 'powGE' : 'powLE'] = +m[2]; s = m[1]; }
  if ((m = /^(.*) with toughness (\d+) or (greater|less)$/.exec(s))) { f[m[3] === 'greater' ? 'touGE' : 'touLE'] = +m[2]; s = m[1]; }
  if ((m = /^(.*) with mana value (\d+) or (greater|less)$/.exec(s))) { f[m[3] === 'greater' ? 'mvGE' : 'mvLE'] = +m[2]; s = m[1]; }
  s = s.replace(/^(non[a-z]+), (non[a-z]+) /, '$1 $2 ');
  // Only creatures and lands ever reach the battlefield in the Arena, so these all mean "creature" (lands are never chosen).
  if (/^(permanent|nonland permanent|artifact or creature|creature or enchantment|artifact, creature, or enchantment)$/.test(s)) s = 'creature';
  const words = s.split(' ');
  if (words.pop() !== 'creature') return null;
  for (const w of words) {
    if (w === 'tapped') f.tapped = true;
    else if (w === 'untapped') f.untapped = true;
    else if (w === 'attacking') f.attacking = true;
    else if (w === 'blocking') f.blocking = true;
    else if (w === 'combat') f.inCombat = true;
    else if (/^non(white|blue|black|red|green)$/.test(w)) f.notColor = COLOR_WORD[w.slice(3)];
    else if (w === 'nonartifact') f.notArtifact = true;
    else if (w === 'nonlegendary') f.notLegendary = true;
    else if (COLOR_WORD[w]) f.color = COLOR_WORD[w];
    else return null;
  }
  return f;
}
const IRREG = { elves: 'Elf', dwarves: 'Dwarf', wolves: 'Wolf' };
// "flying, first strike, protection from demons and from dragons" -> { kws, pro }
function parseKwLine(l) {
  let line = l.replace(/\.$/, '');
  let pro = null, ward = 0;
  const wm = /(?:^|, )ward \{(\d+)\}$/.exec(line);
  if (wm) { ward = +wm[1]; line = line.slice(0, wm.index); if (!line) return { kws: [], pro: null, ward }; }
  const pm = /(?:^|, )protection from (.+)$/.exec(line);
  if (pm) {
    pro = [];
    for (const q of pm[1].split(/ and from |, from /)) {
      if (COLOR_WORD[q]) pro.push({ color: COLOR_WORD[q] });
      else if (/^[a-z]+s$/.test(q) && !['creatures', 'artifacts', 'enchantments', 'everything', 'instants', 'sorceries', 'multicolored', 'monocolored'].includes(q)) {
        const sing = IRREG[q] || q.slice(0, -1);
        pro.push({ sub: sing[0].toUpperCase() + sing.slice(1) });
      } else return null;
    }
    line = line.slice(0, pm.index);
    if (!line) return { kws: [], pro, ward };
  }
  const kws = parseKwList(line);
  return kws ? { kws, pro, ward } : null;
}
function parseKwList(s) {
  const kws = s.split(/, and |, | and /).map((x) => x.trim());
  return kws.every((k) => KW.has(k)) ? kws : null;
}
function parseToken(n, p, t, desc, withKw) {
  // desc like "white Soldier", "colorless Thopter artifact", "green and white Elf Warrior"
  const words = desc.split(' ');
  const colors = [];
  const sub = [];
  let artifact = false;
  for (const w of words) {
    const lw = w.toLowerCase();
    if (COLOR_WORD[lw]) colors.push(COLOR_WORD[lw]);
    else if (lw === 'colorless' || lw === 'and') continue;
    else if (lw === 'artifact') artifact = true;
    else if (/^[A-Z][a-z'-]+$/.test(w)) sub.push(w);
    else return null;
  }
  const kw = withKw ? parseKwList(withKw.toLowerCase()) : [];
  if (!kw) return null;
  return { k: 'tokens', n, p, t, colors, sub, artifact, kw };
}
// One sentence of an effect, already normalized ("~" for the card's own name). `o` keeps original case.
function parseSentence(s, o) {
  let m;
  if (s === 'the ring tempts you') return { k: 'tempt' };
  if ((m = /^(?:you )?investigate(?: (twice|three times))?$/.exec(s))) return { k: 'investigate', n: m[1] === 'twice' ? 2 : m[1] ? 3 : 1 };
  if (s === '~ connives' || s === 'it connives' || s === 'this creature connives') return { k: 'connive' };
  if ((m = /^amass orcs (\d+)$/.exec(s))) return { k: 'amass', n: +m[1] };
  if ((m = /^create (a|an|one|two|three|four|\d+) (food|treasure) tokens?$/.exec(s))) return { k: m[2], n: toNum(m[1]) };
  if ((m = /^scry (\d+), then draw (a|two) cards?$/.exec(s))) return [{ k: 'scry', n: +m[1] }, { k: 'draw', n: toNum(m[2]) }];
  if ((m = /^surveil (\d+), then draw (a|two) cards?$/.exec(s))) return [{ k: 'surveil', n: +m[1] }, { k: 'draw', n: toNum(m[2]) }];
  if ((m = /^target player mills (a|one|two|three|four|five|\d+) cards?$/.exec(s))) return { k: 'mill', n: toNum(m[1]), tgt: { what: 'player' } };
  if ((m = /^(?:each opponent|target opponent) mills (a|one|two|three|four|five|\d+) cards?$/.exec(s))) return { k: 'mill', n: toNum(m[1]) };
  if ((m = /^mill (a|one|two|three|four|\d+) cards?$/.exec(s))) return { k: 'mill', who: 'self', n: toNum(m[1]) };
  if ((m = /^creatures your opponents control get -(\d+)\/-(\d+) until end of turn$/.exec(s))) return { k: 'pumpAll', side: 'opp', p: -m[1], t: -m[2] };
  if (/^untap (?:it|that creature)$/.test(s)) return { k: 'untapRef' };
  if ((m = /^destroy target (artifact|enchantment|artifact or enchantment|artifact, enchantment, or creature with flying|artifact or land|artifact or creature|creature or enchantment|nonland permanent|permanent)$/.exec(s))) {
    const T = { artifact: ['Artifact'], enchantment: ['Enchantment'], 'artifact or enchantment': ['Artifact', 'Enchantment'], 'artifact or land': ['Artifact', 'Land'], 'artifact or creature': ['Artifact', 'Creature'], 'creature or enchantment': ['Creature', 'Enchantment'], 'nonland permanent': ['nonland'], permanent: ['any'] }[m[1]];
    if (T) return { k: 'destroyP', tgt: { f: { types: T } } };
    return { k: 'destroyP', tgt: { f: { types: ['Artifact', 'Enchantment', 'Creature'], fn: (G, c) => !isCreature(c) || has(c, 'flying') } } };
  }
  if ((m = /^exile target (artifact|enchantment|artifact or enchantment|nonland permanent)$/.exec(s))) return { k: 'exileP', tgt: { f: { types: { artifact: ['Artifact'], enchantment: ['Enchantment'], 'artifact or enchantment': ['Artifact', 'Enchantment'], 'nonland permanent': ['nonland'] }[m[1]] } } };
  if ((m = /^return target (permanent|nonland permanent|artifact|enchantment) card from your graveyard to your hand$/.exec(s))) return { k: 'regrow', tgt: { what: 'gy', mine: true, f: { types: m[1] === 'permanent' || m[1] === 'nonland permanent' ? ['permanent'] : [cap1(m[1])], fn: m[1] === 'nonland permanent' ? (d) => !d.types.includes('Land') : null } } };
  if ((m = /^return up to (one|two) target creatures? to (?:its|their) owners'? hands?$/.exec(s))) return { k: 'bounceP', tgt: { f: {}, n: toNum(m[1]), min: 0 } };
  if (s === "put target creature into its owner's library second from the top") return { k: 'tuckN', pos: 2, tgt: { f: {} } };
  if ((m = /^up to two target creatures each get \+(\d+)\/\+(\d+) until end of turn$/.exec(s))) return { k: 'pumpT', p: +m[1], t: +m[2], tgt: { f: {}, n: 2, min: 0 } };
  if ((m = /^create (a|an|one|two|three|four|five|\d+) tapped (\d+)\/(\d+) (.+?) creature tokens?(?: with (.+))?$/i.exec(o))) { const t = parseToken(toNum(m[1]), +m[2], +m[3], m[4], m[5]); return t && Object.assign(t, { tapped: true }); }
  if ((m = /^you may (.+)$/.exec(s))) { const e = parseSentence(m[1], o.slice(o.length - m[1].length)); if (e) { (Array.isArray(e) ? e : [e]).forEach((x) => { x.may = true; }); } return e; }
  if ((m = /^(.+) and you gain (\d+) life$/.exec(s)) && !/loses \d+ life$/.test(m[1])) {
    const e = parseSentence(m[1], o.slice(0, m[1].length));
    return e && [].concat(e, { k: 'gain', n: +m[2] });
  }
  // Follow-ups that refer back to the creature the previous effect targeted
  if ((m = /^its controller gains life equal to its (power|toughness)$/.exec(s))) return { k: 'refGain', by: m[1] };
  if (s === 'its controller may search their library for a basic land card, put that card onto the battlefield tapped, then shuffle') return { k: 'refLand' };
  if ((m = /^its controller loses (\d+) life$/.exec(s))) return { k: 'refLose', n: +m[1] };
  if (s === "you lose life equal to that creature's toughness") return { k: 'loseRefTou' };
  if ((m = /^its controller creates (?:a|an) (\d+)\/(\d+) (.+?) creature token$/i.exec(o))) { const t = parseToken(1, +m[1], +m[2], m[3], null); return t && Object.assign(t, { k: 'refToken' }); }
  // Riders the engine treats exactly: the opponent never pays for Chain Lightning, nothing regenerates
  if (s === "then that player or that permanent's controller may pay {r}{r}" || /^if the player does, they may copy (?:this spell|~) and may choose a new target for that copy$/.test(s)) return { k: 'noop' };
  if (s === "a creature dealt damage this way can't be regenerated this turn") return { k: 'noop' };
  // Modifiers merged into the effect before them
  if (/^if (?:a creature dealt damage this way|that creature) would die this turn, exile it instead$/.test(s)) return { k: 'mark', set: 'exileDead' };
  if (s === 'tap those creatures') return { k: 'mark', set: 'tapAfter' };
  if (/^(?:those creatures don't|it doesn't|that creature doesn't) untap during (?:that player's|its controller's|their controller's) next untap step$/.test(s)) return { k: 'mark', set: 'stun' };
  if (s === "if the creature you control has trample, excess damage is dealt to that creature's controller instead") return { k: 'mark', set: 'trampleExcess' };
  if (s === "if it's a land card, that player puts it into their hand") return { k: 'mark', set: 'guideOk' };
  if (s === 'if you do, draw a card') return { k: 'mark', set: 'thenDraw' };
  if ((m = /^(?:you |target player )?draws? (a|an|one|two|three|\d+) cards? and (?:you )?loses? (\d+) life$/.exec(s))) return [{ k: 'draw', n: toNum(m[1]) }, { k: 'loseSelf', n: +m[2] }];
  if ((m = /^(?:target player|target opponent|each opponent) sacrifices (?:a|an) (.+?)(?: of their choice)?$/.exec(s))) { const f = parseTarget(m[1]); return f && { k: 'edict', f }; }
  if ((m = /^counter target spell unless its controller pays \{(\d+)\}$/.exec(s))) return { k: 'counter', what: 'spell', unless: +m[1] };
  if (/^tap all creatures (?:target player|target opponent) controls$/.test(s)) return { k: 'tapAll' };
  if (s === 'prevent all combat damage that would be dealt this turn') return { k: 'fog' };
  if (/^target creature you control fights target creature (?:you don't control|an opponent controls)$/.test(s)) return { k: 'fight' };
  if (/^target creature you control deals damage equal to its power to target creature (?:you don't control|an opponent controls)$/.test(s)) return { k: 'bite' };
  if (s === "target creature can't block this turn") return { k: 'noBlock', f: {} };
  if ((m = /^~ deals (\d+) damage divided as you choose among (one or two|one, two, or three) targets$/.exec(s))) return { k: 'divided', n: +m[1], max: m[2] === 'one or two' ? 2 : 3 };
  if (s === 'draw three cards, then put two cards from your hand on top of your library in any order') return { k: 'brainstorm' };
  if ((m = /^put target (.+) on the bottom of its owner's library$/.exec(s))) { const f = parseTarget(m[1]); return f && { k: 'tuck', f }; }
  if (s === 'defending player reveals the top card of their library') return { k: 'guide' };
  if (s === 'discard a card') return { k: 'discardSelf', n: 1 };
  if (s === "return a permanent you control to its owner's hand") return { k: 'returnOwn' };
  if ((m = /^create (?:a|an) (\d+)\/(\d+) (.+?) creature token with ([a-z ]+) and (?:a|an) (\d+)\/(\d+) (.+?) creature token with ([a-z ]+)$/i.exec(o))) {
    const a = parseToken(1, +m[1], +m[2], m[3], m[4]), b = parseToken(1, +m[5], +m[6], m[7], m[8]);
    return a && b ? [a, b] : null;
  }
  if ((m = /^~ deals (\d+) damage to (.+)$/.exec(s))) {
    const n = +m[1], t = m[2];
    let mm;
    if (t === 'any target' || t === 'target creature or player' || t === 'any one target') return { k: 'dmg', n, to: 'any' };
    if (/^(target player|target opponent|each opponent)( or planeswalker)?$/.test(t)) return { k: 'dmg', n, to: 'player' };
    if ((mm = /^each creature( with flying| without flying)?( your opponents control| you don't control)?$/.exec(t))) {
      const e = { k: 'dmgAll', n, side: mm[2] ? 'opp' : 'all' };
      if (mm[1] === ' with flying') e.hasKw = 'flying';
      if (mm[1] === ' without flying') e.noKw = 'flying';
      return e;
    }
    if (t === 'each creature and each player') return [{ k: 'dmgAll', n, side: 'all' }, { k: 'dmgPlayers', n }];
    if (t.startsWith('target ')) { const f = parseTarget(t.slice(7)); if (f) return { k: 'dmg', n, to: 'creature', f }; }
    return null;
  }
  if ((m = /^destroy target (.+)$/.exec(s))) { const f = parseTarget(m[1]); return f && { k: 'destroy', f }; }
  if (s === 'destroy all creatures') return { k: 'wrath' };
  if (/^(they|it|that creature) can't be regenerated$/.test(s)) return { k: 'noop' };
  if ((m = /^exile target (.+)$/.exec(s))) { const f = parseTarget(m[1]); return f && { k: 'exile', f }; }
  if ((m = /^return target (.+) to (?:its|their) owner's hand$/.exec(s))) { const f = parseTarget(m[1]); return f && { k: 'bounce', f }; }
  if ((m = /^tap target (.+)$/.exec(s))) { const f = parseTarget(m[1]); return f && { k: 'tap', f }; }
  if (s === 'return target creature card from your graveyard to your hand') return { k: 'raise' };
  if ((m = /^(?:you )?draw (a|an|one|two|three|four|\d+) cards?$/.exec(s))) return { k: 'draw', n: toNum(m[1]) };
  if ((m = /^target player draws (a|two|three|\d+) cards?$/.exec(s))) return { k: 'draw', n: toNum(m[1]) };
  if ((m = /^draw (a|two|three) cards?, then discard (a|two) cards?$/.exec(s))) return { k: 'loot', n: toNum(m[1]), d: toNum(m[2]) };
  if ((m = /^(?:you )?gain (\d+) life$/.exec(s))) return { k: 'gain', n: +m[1] };
  if ((m = /^(?:each opponent|target opponent|target player) loses (\d+) life$/.exec(s))) return { k: 'drain', n: +m[1] };
  if ((m = /^(?:each opponent|target opponent) loses (\d+) life and you gain (\d+) life$/.exec(s))) return [{ k: 'drain', n: +m[1] }, { k: 'gain', n: +m[2] }];
  if ((m = /^(?:each opponent|target opponent|target player|that player|that player or that planeswalker's controller) discards (a|two|three) cards?( at random)?$/.exec(s))) return { k: 'discard', n: toNum(m[1]), random: !!m[2] };
  if ((m = /^scry (\d+)$/.exec(s))) return { k: 'scry', n: +m[1] };
  if ((m = /^surveil (\d+)$/.exec(s))) return { k: 'surveil', n: +m[1] };
  if ((m = /^target (.+?) gets ([+-]\d+)\/([+-]\d+)(?: and gains (.+?))? until end of turn$/.exec(s))) {
    const f = parseTarget(m[1]);
    const kw = m[4] ? parseKwList(m[4]) : [];
    if (!f || !kw) return null;
    return { k: 'pump', f, p: +m[2], t: +m[3], kw };
  }
  if ((m = /^target (.+?) gains (.+?) until end of turn$/.exec(s))) {
    const f = parseTarget(m[1]); const kw = parseKwList(m[2]);
    return f && kw ? { k: 'pump', f, p: 0, t: 0, kw } : null;
  }
  if ((m = /^~ gets \+(\d+)\/\+(\d+) until end of turn$/.exec(s))) return { k: 'pumpSelf', p: +m[1], t: +m[2] };
  if ((m = /^creatures you control get \+(\d+)\/\+(\d+)(?: and gain (.+?))? until end of turn$/.exec(s))) {
    const kw = m[3] ? parseKwList(m[3]) : [];
    return kw ? { k: 'pumpTeam', p: +m[1], t: +m[2], kw } : null;
  }
  if ((m = /^put (a|an|one|two|three|\d+) \+1\/\+1 counters? on (target creature(?: you control)?|~|each creature you control)$/.exec(s))) {
    const n = toNum(m[1]);
    if (m[2] === '~') return { k: 'countersSelf', n };
    if (m[2] === 'each creature you control') return { k: 'countersTeam', n };
    return { k: 'counters', n, f: m[2].endsWith('you control') ? { side: 'you' } : {} };
  }
  if ((m = /^create (a|an|one|two|three|four|five|\d+) (\d+)\/(\d+) (.+?) creature tokens?(?: with (.+))?$/i.exec(o))) {
    return parseToken(toNum(m[1]), +m[2], +m[3], m[4], m[5]);
  }
  if ((m = /^counter target (spell|creature spell|noncreature spell|instant or sorcery spell)$/.exec(s))) return { k: 'counter', what: m[1] };
  return null;
}
function parseEffects(text, orig) {
  const sents = text.replace(/\.$/, '').split(/\. (?=[a-z~{])/);
  const osents = orig.replace(/\.$/, '').split(/\. (?=[A-Za-z~{])/);
  if (sents.length !== osents.length) return null;
  const out = [];
  const REF_OK = new Set(['destroy', 'exile', 'bounce', 'tuck', 'dmg', 'destroyP', 'exileP', 'bounceP']);
  for (let k = 0; k < sents.length; k++) {
    const e = parseSentence(sents[k].trim(), osents[k].trim());
    if (!e) return null;
    for (const x of Array.isArray(e) ? e : [e]) {
      const prev = out[out.length - 1];
      if (x.k === 'mark') {
        if (!prev) return null;
        if (x.set === 'exileDead' && (prev.k === 'dmg' || prev.k === 'dmgAll')) prev.exileDead = true;
        else if (x.set === 'tapAfter' && prev.k === 'dmgAll') prev.tapAfter = true;
        else if (x.set === 'stun' && (prev.k === 'tapAll' || prev.k === 'tap')) prev.stun = true;
        else if (x.set === 'trampleExcess' && prev.k === 'bite') prev.trampleExcess = true;
        else if (x.set === 'guideOk' && prev.k === 'guide') prev.ok = true;
        else if (x.set === 'thenDraw' && prev.k === 'discardSelf' && prev.may) prev.k = 'rummage';
        else return null;
        continue;
      }
      const anchor = out.filter((y) => y.k !== 'noop').pop();
      if (/^ref|^loseRefTou$/.test(x.k) && !(anchor && REF_OK.has(anchor.k) && (anchor.k !== 'dmg' || anchor.to === 'creature'))) return null;
      if (x.k === 'untapRef' && !(anchor && anchor.k === 'pump')) return null;
      out.push(x);
    }
  }
  if (out.some((x) => (x.k === 'guide' && !x.ok) || (x.k === 'discardSelf' && x.may))) return null;
  return out;
}
const KEEP_WORDS = new Set(['landfall', 'max speed', 'exhaust', 'boast', 'forecast', 'channel', 'grandeur', 'cohort', 'solved', 'to solve']);
function stripNames(line) {
  let m;
  if ((m = /^([IVX]+(?:, [IVX]+)*) — ([^—]+?) — (.+)$/.exec(line))) return `${m[1]} — ${m[3]}`;
  if (/^[•+]/.test(line)) return line;
  if ((m = /^([^—•{}:]{1,40}?) — (.+)$/.exec(line)) && !/^[IVX]+(?:, [IVX]+)*$/.test(m[1]) && !KEEP_WORDS.has(m[1].toLowerCase())
    && /^(When|Whenever|At |During|As long as|As |Equip|If |Prevent|This|Each|Creatures|Other|You |Target|All |Equipped|Enchanted|Damage|Spells|Lands|Legendary)/.test(m[2])) return m[2];
  return line;
}
function normalizeText(text, name) {
  let t = text.replace(/\s*\([^()]*\)/g, '').split('\n').map((l) => stripNames(l.trim())).join('\n');
  t = t.replace(/(^|, |\. )it (deals|gets)\b/g, '$1~ $2');
  const names = [name];
  if (name.includes(',')) names.push(name.split(',')[0]);
  for (const n of names) t = t.split(n).join('~');
  t = t.replace(/\bthis (creature|spell|land|card|artifact|enchantment|aura|equipment|vehicle|saga)\b/gi, '~');
  t = t.replace(/: It deals\b/g, ': ~ deals');
  return t.split('\n').map((l) => l.trim()).filter(Boolean);
}

/**
 * Turn a raw card ({name, manaCost, type, text, power, toughness}) into a definition the engine can play,
 * or return null when any part of the card is beyond the engine.
 */
const SCRIPTS = Object.create(null);
// Per-card rules for text the reader below doesn't cover. A script gets the card's skeleton (types, cost, keywords,
// equip, enchant, cycling lines already read) and fills in the rest; returning null keeps the card out of the game.
function registerScripts(map) { Object.assign(SCRIPTS, map); }
const TYPE_WORDS = ['Creature', 'Instant', 'Sorcery', 'Land', 'Artifact', 'Enchantment'];
const LAND_TYPES = ['Plains', 'Island', 'Swamp', 'Mountain', 'Forest'];
function cap1(s) { return s[0].toUpperCase() + s.slice(1); }
// Lines about the card's own shape, read the same way for scripted and plain cards. True when the line was used.
function parseStructural(def, l) {
  let m;
  if ((m = /^teamwork (\d+)$/.exec(l))) { def.teamwork = +m[1]; return true; }
  if (l === 'improvise') { def.improvise = true; return true; }
  if ((m = /^basic landcycling ((?:\{[\dwubrg]\})+)$/.exec(l))) { const c = parseCost(m[1].toUpperCase()); if (!c) return false; def.cycling = c; def.cycleFind = 'basic'; return true; }
  if ((m = /^power-up — ((?:\{[\dwubrgx]\})+): (.+)$/.exec(l))) {
    const c = parseCost(m[1].toUpperCase()); if (!c || c.x) return false;
    const eff = parseEffects(m[2].replace(/\.$/, ''), m[2]);
    if (!eff || eff.some((e) => e.k === 'counter' || e.k === 'fog' || e.k === 'guide')) return false;
    def.acts.push({ cost: { m: c }, eff, powerUp: true, label: 'Power-up' });
    return true;
  }
  if ((m = /^(plains|island|swamp|mountain|forest)cycling ((?:\{[\dwubrg]\})+)$/.exec(l))) { const c = parseCost(m[2].toUpperCase()); if (!c) return false; def.cycling = c; def.cycleFind = cap1(m[1]); return true; }
  if ((m = /^equip ((?:\{[\dwubrg]\})+)$/.exec(l))) { const c = parseCost(m[1].toUpperCase()); if (!c) return false; def.acts.push({ equip: true, cost: { m: c }, sorcery: true, label: `Equip ${costText(c)}` }); return true; }
  if ((m = /^equip ([a-z]+) ((?:\{[\dwubrg]\})+)$/.exec(l))) { const c = parseCost(m[2].toUpperCase()); if (!c) return false; def.acts.push({ equip: true, only: { sub: cap1(m[1]) }, cost: { m: c }, sorcery: true, label: `Equip ${cap1(m[1])} ${costText(c)}` }); return true; }
  if ((m = /^crew (\d+)$/.exec(l))) { def.crew = +m[1]; return true; }
  if (l === 'job select') { def.jobSelect = true; def.etb.unshift({ k: 'jobSelect' }); return true; }
  if ((m = /^flashback ((?:\{[\dwubrgx]\})+)$/.exec(l))) { const c = parseCost(m[1].toUpperCase()); if (!c) return false; def.flashback = c; return true; }
  if (l === "~ can't be countered.") { def.uncounterable = true; return true; }
  if (l === 'you may look at the top card of your library any time.') { def.peekTop = true; return true; }
  if (l === 'enchant creature') { def.aura = { f: {} }; return true; }
  return false;
}
// "Equipped creature gets +2/+1 and has vigilance." and friends
function parseStatic(def, l) {
  let m;
  const kwOf = (x) => (x ? parseKwList(x) : []);
  if ((m = /^(equipped|enchanted) creature gets ([+-]\d+)\/([+-]\d+)(?: and has (.+?))?\.$/.exec(l))) { const kw = kwOf(m[4]); if (!kw) return false; def.statics.push({ who: m[1], p: +m[2], t: +m[3], kw }); return true; }
  if ((m = /^equipped creature gets ([+-]\d+)\/([+-]\d+)(?:, has (.+?),)? and is an? ([a-z]+) in addition to its other types\.$/.exec(l))) { const kw = kwOf(m[3]); if (!kw) return false; def.statics.push({ who: 'equipped', p: +m[1], t: +m[2], kw, addSub: [cap1(m[4])] }); return true; }
  if ((m = /^(equipped|enchanted) creature has (.+?)\.$/.exec(l))) { const kw = kwOf(m[2]); if (!kw) return false; def.statics.push({ who: m[1], p: 0, t: 0, kw }); return true; }
  if (l === "enchanted creature can't attack or block.") { def.statics.push({ who: 'enchanted', p: 0, t: 0, kw: [], flags: { cantAttack: true, cantBlock: true } }); return true; }
  if (l === "enchanted creature can't block.") { def.statics.push({ who: 'enchanted', p: 0, t: 0, kw: [], flags: { cantBlock: true } }); return true; }
  if (l === "enchanted creature doesn't untap during its controller's untap step.") { def.statics.push({ who: 'enchanted', p: 0, t: 0, kw: [], flags: { noUntap: true } }); return true; }
  if ((m = /^(other )?(?:([a-z]+) )?creatures you control get \+(\d+)\/\+(\d+)(?: and have (.+?))?\.$/.exec(l))) {
    const kw = kwOf(m[5]); if (!kw) return false;
    const f = { side: 'you' }; if (m[1]) f.other = true;
    if (m[2]) { if (COLOR_WORD[m[2]]) f.color = COLOR_WORD[m[2]]; else if (m[2] === 'legendary') f.legendary = true; else if (m[2] === 'nonlegendary') f.nonlegendary = true; else if (m[2] === 'attacking') f.attacking = true; else return false; }
    def.statics.push({ who: 'all', f, p: +m[3], t: +m[4], kw }); return true;
  }
  if ((m = /^(other )?([a-z]+) you control get \+(\d+)\/\+(\d+)(?: and have (.+?))?\.$/.exec(l)) && /s$/.test(m[2]) && !['creatures', 'artifacts', 'tokens', 'lands', 'enchantments', 'permanents'].includes(m[2])) {
    const kw = kwOf(m[5]); if (!kw) return false;
    const sub = IRREG[m[2]] || cap1(m[2].replace(/s$/, ''));
    def.statics.push({ who: 'all', f: { side: 'you', other: !!m[1], sub }, p: +m[3], t: +m[4], kw }); return true;
  }
  if ((m = /^(other )?creatures you control have (.+?)\.$/.exec(l))) { const kw = kwOf(m[2]); if (!kw) return false; def.statics.push({ who: 'all', f: { side: 'you', other: !!m[1] }, p: 0, t: 0, kw }); return true; }
  return false;
}
// "{2}, {T}, Sacrifice ~: Draw a card." Mana, tap and sacrificing this permanent; the effect is any sentence the reader knows.
function parseActivated(def, l, ol) {
  const m = /^((?:\{[\dwubrgx]\})*)((?:, )?\{t\})?((?:, )?sacrifice ~)?: (.+?)(?:\. activate only as a sorcery)?\.$/.exec(l);
  if (!m || (!m[1] && !m[2] && !m[3])) return false;
  const cost = parseCost((m[1] || '').toUpperCase());
  if (!cost || cost.x) return false;
  const body = m[4];
  const oBody = ol.slice(ol.indexOf(': ') + 2).replace(/(?:\. Activate only as a sorcery)?\.$/, '');
  const eff = parseEffects(body, oBody);
  if (!eff || eff.some((e) => e.k === 'counter' || e.k === 'fog' || e.k === 'guide')) return false;
  def.acts.push({ cost: { m: cost, tap: !!m[2], sacSelf: !!m[3] }, eff, sorcery: /activate only as a sorcery\.$/.test(l) });
  return true;
}

/**
 * Turn a raw card ({name, manaCost, type, text, power, toughness}) into a definition the engine can play,
 * or return null when any part of the card is beyond the engine.
 */
function compileCard(raw) {
  const def = compileFace(raw);
  if (!def) return null;
  const face = (r, extra) => { const d = compileFace(Object.assign({}, r, extra)); return d; };
  if (raw.back) {
    const b = face(raw.back, { faceOf: raw.name });
    if (!b) return null;
    if (raw.mdfc) { def.mdfc = true; b.manaCost = raw.back.manaCost || ''; } else { b.mv = def.mv; b.manaCost = ''; }
    b.colors = raw.back.colors || def.colors; b.isBack = true;
    def.back = b; b.front = def;
  }
  if (raw.adventure) {
    const a = face(raw.adventure, { faceOf: raw.name });
    if (!a) return null;
    def.adv = a; a.advOf = def;
  }
  if (raw.meld) {
    const m = face(raw.meld, { faceOf: raw.name });
    if (!m) return null;
    m.colors = raw.meld.colors || m.colors; m.isBack = true;
    def.meldInto = m;
  }
  return def;
}
// Every face the game might show for a card
const facesOf = (def) => [def, def.back, def.adv, def.meldInto].filter(Boolean);
// The other face a card in hand can be cast as: an adventure, or the back of a modal double-faced card
const altFace = (def) => def.adv || (def.mdfc ? def.back : null);
function compileFace(raw) {
  const type = raw.type || '';
  const [main, subPart] = type.split(' — ');
  const mainWords = main.split(' ');
  const types = new Set(mainWords.filter((w) => TYPE_WORDS.includes(w)));
  const supertypes = mainWords.filter((w) => ['Legendary', 'Basic', 'Snow', 'World'].includes(w));
  if (mainWords.some((w) => !TYPE_WORDS.includes(w) && !['Legendary', 'Basic'].includes(w))) return null;
  const isCreature = types.has('Creature');
  const isSpell = types.has('Instant') || types.has('Sorcery');
  const isLand = types.has('Land');
  const isOther = types.has('Artifact') || types.has('Enchantment');
  if (!isCreature && !isSpell && !isLand && !isOther) return null;
  if (isLand && (isCreature || isSpell)) return null;
  if (isSpell && (isCreature || isOther)) return null;
  const cost = parseCost(raw.manaCost || '');
  if (!cost) return null;
  const script = SCRIPTS[raw.name];
  const sub = subPart ? subPart.split(' ') : [];
  const def = {
    name: raw.name, typeLine: type, text: raw.text || '', manaCost: raw.manaCost || '', cost, mv: costMV(cost),
    types: [...types], supertypes, sub,
    colors: COLORS.filter((c) => cost[c] > 0 || (cost.hy || []).some((h) => h.includes(c))),
    power: isCreature || raw.power != null && raw.power !== '' ? +raw.power : 0, toughness: isCreature || raw.toughness != null && raw.toughness !== '' ? +raw.toughness : 0,
    kw: [], spell: null, etb: [], dies: [], attack: [], hit: [], mana: null,
    cantBlock: false, unblockable: false, mustAttack: false, etbTapped: false, checkland: null,
    blockFlyersOnly: false, landwalk: null, pumpAbility: null, pinger: null, cycling: null, landfall: [],
    leaves: [], onGain: [], pro: null, selfHurt: false, rider: 0, sacAtEnd: false, noWallBlock: false, tapLoot: false, sacPing: null,
    trig: [], acts: [], statics: [], aura: null, saga: null, crew: 0, ward: 0,
  };
  if (isCreature && !script && (isNaN(def.power) || isNaN(def.toughness) || def.toughness <= 0)) return null;
  if (isCreature && (isNaN(+raw.power) || isNaN(+raw.toughness))) def.ptText = `${raw.power}/${raw.toughness}`; // "*/3"

  if (isNaN(def.power)) def.power = 0;
  if (isNaN(def.toughness)) def.toughness = 0;
  if (isLand) { const basic = def.sub.map((w) => BASIC_COLOR[w.toLowerCase()]).filter(Boolean); if (basic.length) def.mana = basic; }
  if (script) return applyScript(def, raw, script);
  if (types.has('Enchantment') && sub.includes('Saga')) def.saga = [];
  if (cost.x) return null; // X costs need a script that says what X does
  const kw = new Set();
  const lines = normalizeText(raw.text || '', raw.name);
  const origLines = (raw.text || '').replace(/\s*\([^()]*\)/g, '').split('\n').map((l) => stripNames(l.trim())).filter(Boolean);
  if (lines.length !== origLines.length) return null;
  const isPerm = !isSpell;
  for (let k = 0; k < lines.length; k++) {
    const line = lines[k];
    const l = line.toLowerCase();
    const ol = origLines[k];
    let m;
    const kl = isCreature || (isOther && !isLand) ? parseKwLine(l) : null;
    if (kl) { kl.kws.forEach((x) => kw.add(x)); if (kl.pro) def.pro = (def.pro || []).concat(kl.pro); if (kl.ward) def.ward = kl.ward; continue; }
    if ((isPerm || /cycling \{|^flashback \{|can't be countered|^teamwork \d+$|^improvise$/.test(l)) && parseStructural(def, l)) continue;
    if (isPerm && parseStatic(def, l)) continue;
    if (def.saga) {
      if ((m = /^([ivx]+(?:, [ivx]+)*) — (.+)$/.exec(l))) { const e = parseEffects(m[2], ol.slice(ol.indexOf('—') + 2)); if (!e) return null; def.saga.push({ ch: m[1].split(', ').map(roman), eff: e }); continue; }
      return null;
    }
    const trig = (re) => { const mm = re.exec(l); if (!mm) return undefined; return parseEffects(mm[1], ol.slice(ol.length - mm[1].length)); };
    let te;
    if ((te = trig(/^whenever ~ enters or attacks, (.+)$/)) !== undefined) { if (!te || !isCreature) return null; def.etb.push(...te); def.attack.push(...te); continue; }
    if ((te = trig(/^when ~ leaves the battlefield, (.+)$/)) !== undefined) { if (!te) return null; def.leaves.push(...te); continue; }
    if ((te = trig(/^whenever ~ deals (?:combat )?damage to an opponent, (.+)$/)) !== undefined) { if (!te || !isCreature) return null; def.hit.push(...te); continue; }
    if (isCreature && l === 'whenever you gain life, put a +1/+1 counter on ~.') { def.onGain.push({ k: 'countersSelf', n: 1 }); continue; }
    if (isCreature && l === 'whenever ~ is dealt damage, ~ deals that much damage to you.') { def.selfHurt = true; continue; }
    if (isCreature && (m = /^whenever a creature you control attacks, ~ deals (\d+) damage to the player or planeswalker it's attacking\.$/.exec(l))) { def.rider = +m[1]; continue; }
    if (isCreature && l === 'at the beginning of the end step, sacrifice ~.') { def.sacAtEnd = true; continue; }
    if (isCreature && l === "~ can't be blocked by walls.") { def.noWallBlock = true; continue; }
    if (isCreature && l === '{t}: draw a card, then discard a card.') { def.tapLoot = true; continue; }
    if (isCreature && (m = /^(?:((?:\{[\dwubrg]\})+), )?sacrifice ~: ~ deals (\d+) damage to (any target|target creature|target player|target opponent|each opponent)\.$/.exec(l))) {
      const c = parseCost((m[1] || '').toUpperCase()); if (!c) return null;
      def.sacPing = { cost: c, n: +m[2], to: m[3] === 'any target' ? 'any' : m[3] === 'target creature' ? 'creature' : 'player' }; continue;
    }
    if ((m = /^when ~ enters(?: the battlefield)?, (.+)$/.exec(l))) { const e = parseEffects(m[1], ol.slice(ol.length - m[1].length)); if (!e) return null; if (def.aura && e.some(needsTarget)) return null; def.etb.push(...e); continue; }
    if ((m = /^when ~ dies, (.+)$/.exec(l))) { if (!isCreature) return null; const e = parseEffects(m[1], ol.slice(ol.length - m[1].length)); if (!e) return null; def.dies.push(...e); continue; }
    if ((m = /^whenever ~ attacks, (.+)$/.exec(l))) { if (!isCreature) return null; const e = parseEffects(m[1], ol.slice(ol.length - m[1].length)); if (!e) return null; def.attack.push(...e); continue; }
    if ((m = /^whenever ~ deals combat damage to a player, (.+)$/.exec(l))) { if (!isCreature) return null; const e = parseEffects(m[1], ol.slice(ol.length - m[1].length)); if (!e) return null; def.hit.push(...e); continue; }
    if (isCreature && l === "~ can't block.") { def.cantBlock = true; continue; }
    if (isCreature && l === "~ can't be blocked.") { def.unblockable = true; continue; }
    if (isCreature && l === '~ attacks each combat if able.') { def.mustAttack = true; continue; }
    if (isCreature && l === '~ can block only creatures with flying.') { def.blockFlyersOnly = true; continue; }
    if (isPerm && !isLand && l === '~ enters tapped.') { def.etbTapped = true; continue; }
    if (isCreature && (m = /^(swamp|forest|island|mountain|plains)walk$/.exec(l))) { def.landwalk = m[1][0].toUpperCase() + m[1].slice(1); continue; }
    if ((m = /^((?:\{[\dwubrg]\})+): ~ gets ([+-]\d+)\/([+-]\d+) until end of turn\.( activate only once each turn\.| if this ability has been activated four or more times this turn, sacrifice ~ at the beginning of the next end step\.)?$/.exec(l))) {
      const c = parseCost(m[1].toUpperCase()); if (!c || !isCreature) return null;
      // Dragon Whelp: the AI simply never activates it a fourth time.
      def.pumpAbility = { cost: c, p: +m[2], t: +m[3], once: m[4] === ' activate only once each turn.', max: m[4] && m[4] !== ' activate only once each turn.' ? 3 : 0 }; continue;
    }
    if ((m = /^\{t\}: ~ deals (\d+) damage to (any target|target creature|target player|each opponent|target opponent)\.$/.exec(l)) && isCreature) {
      def.pinger = { n: +m[1], to: m[2] === 'any target' ? 'any' : m[2] === 'target creature' ? 'creature' : 'player' }; continue;
    }
    if ((m = /^cycling ((?:\{[\dwubrg]\})+)$/.exec(l))) { const c = parseCost(m[1].toUpperCase()); if (!c) return null; def.cycling = c; continue; }
    if (isCreature && (m = /^landfall — whenever a land you control enters, (.+)$/.exec(l))) { const e = parseEffects(m[1], ol.slice(ol.length - m[1].length)); if (!e) return null; def.landfall = e; continue; }
    if ((m = /^\{t\}: add \{c\}(\{c\})?\.$/.exec(l))) { def.mana = m[1] ? ['C', 'C'] : ['C']; continue; }
    if ((m = /^\{t\}: add \{([wubrg])\}(?: or \{([wubrg])\})?\.$/.exec(l))) { def.mana = [m[1], m[2]].filter(Boolean).map((x) => x.toUpperCase()); continue; }
    if ((m = /^\{t\}: add \{([wubrg])\}, \{([wubrg])\}, or \{([wubrg])\}\.$/.exec(l))) { def.mana = [m[1], m[2], m[3]].map((x) => x.toUpperCase()); continue; }
    if (l === '{t}: add one mana of any color.') { def.mana = COLORS.slice(); continue; }
    if (isLand && l === '~ enters tapped.') { def.etbTapped = true; continue; }
    if (isLand && (m = /^~ enters tapped unless you control an? (plains|island|swamp|mountain|forest) or an? (plains|island|swamp|mountain|forest)\.$/.exec(l))) { def.checkland = [m[1], m[2]].map((x) => x[0].toUpperCase() + x.slice(1)); continue; }
    if (isSpell) { const e = parseEffects(l, ol); if (!e) return null; (def.spell = def.spell || []).push(...e); continue; }
    if (isPerm && parseActivated(def, l, ol)) continue;
    return null;
  }
  if (isSpell && !(def.spell && def.spell.length)) return null;
  if (isLand && !def.mana) return null;
  if (isCreature && def.mana && def.mana.length && !lines.length) return null;
  if (def.aura && !def.statics.some((x) => x.who === 'enchanted') && !def.etb.length) return null;
  if (def.statics.some((x) => x.who === 'equipped') !== def.acts.some((a) => a.equip)) return null;
  if (def.statics.some((x) => x.who === 'enchanted') && !def.aura) return null;
  if (def.saga && !def.saga.length) return null;
  if (isOther && !isCreature && !def.mana && !def.etb.length && !def.statics.length && !def.acts.length && !def.leaves.length && !def.saga) return null;
  def.kw = [...kw];
  if (def.kw.includes('flash') && !isCreature && !isOther) return null;
  return finishDef(def);
}
const roman = (r) => ({ i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6 })[r] || 0;
function finishDef(def) {
  def.id = slug(def.name);
  if (def.value == null) def.value = cardValue(def);
  if (!def.role) def.role = roleOf(def);
  return def;
}
function applyScript(def, raw, script) {
  const lines = normalizeText(raw.text || '', raw.name).map((l) => l.toLowerCase());
  const kw = new Set();
  for (const l of lines) {
    const kl = !def.types.includes('Instant') && !def.types.includes('Sorcery') ? parseKwLine(l) : null;
    if (kl) { kl.kws.forEach((x) => kw.add(x)); if (kl.pro) def.pro = (def.pro || []).concat(kl.pro); if (kl.ward) def.ward = kl.ward; continue; }
    parseStructural(def, l);
    if (/^equipped creature gets [+-]\d+\/[+-]\d+(?: and has [a-z ,]+)?\.$/.test(l) || /^enchanted creature gets [+-]\d+\/[+-]\d+(?: and has [a-z ,]+)?\.$/.test(l)
      || /^equipped creature gets [+-]\d+\/[+-]\d+(?:, has [a-z ,]+,)? and is an? [a-z]+ in addition to its other types\.$/.test(l)) parseStatic(def, l);
  }
  def.kw = [...kw];
  if (def.types.includes('Enchantment') && def.sub.includes('Saga')) def.saga = [];
  const out = typeof script === 'function' ? script(def, raw) : Object.assign(def, script);
  if (!out) return null;
  return finishDef(out);
}
const slug = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/* ---------- How good is a card? (used by deck building and AI) ---------- */
const KW_VALUE = { flying: 1.5, reach: 0.3, trample: 0.6, haste: 0.6, vigilance: 0.4, deathtouch: 1.5, lifelink: 0.9, 'first strike': 1.0, 'double strike': 2.2,
  menace: 0.7, defender: -1, indestructible: 2.2, hexproof: 1.0, flash: 0.5, prowess: 0.8 };
// Keywords matter more on bigger bodies: flying on a 1-power creature is not flying on a dragon.
function kwValue(k, p) {
  switch (k) {
    case 'flying': return 0.4 + 0.55 * p;
    case 'first strike': return 0.3 + 0.35 * p;
    case 'double strike': return 0.3 + 1.0 * p;
    case 'lifelink': return 0.2 + 0.35 * p;
    case 'trample': return 0.1 + 0.15 * p;
    case 'haste': return 0.2 + 0.25 * p;
    case 'menace': return 0.2 + 0.2 * p;
    case 'defender': return -0.5 - 0.7 * p;
    default: return KW_VALUE[k] || 0;
  }
}
function effectValue(e) {
  switch (e.k) {
    case 'dmg': return e.to === 'player' ? e.n * 0.55 : e.to === 'any' ? 1 + e.n * 0.9 : 0.6 + e.n * 0.8;
    case 'dmgAll': return e.side === 'opp' ? 2 + e.n * 1.1 : 1 + e.n * 0.5;
    case 'dmgPlayers': return 0;
    case 'destroy': return 3.8 - (e.f.tapped ? 0.8 : 0) - (e.f.notColor ? 0.3 : 0) - (e.f.powGE ? 0.8 : 0) - (e.f.mvLE != null ? Math.max(0, 2 - e.f.mvLE * 0.5) : 0) - (e.f.attacking || e.f.inCombat ? 0.7 : 0) - (e.f.hasKw ? 1.2 : 0);
    case 'exile': return 4 - (e.f.tapped ? 0.8 : 0) - (e.f.powGE ? 0.8 : 0) - (e.f.attacking || e.f.inCombat ? 0.7 : 0) - (e.f.hasKw ? 1.2 : 0);
    case 'wrath': return 3.5;
    case 'bounce': return 1.6;
    case 'tap': return e.stun ? 1.0 : 0.6;
    case 'raise': return 1.6;
    case 'draw': return e.n * 1.25;
    case 'loot': return e.n * 0.8 - e.d * 0.3;
    case 'gain': return e.n * 0.22;
    case 'drain': return e.n * 0.55;
    case 'discard': return e.n * 0.9;
    case 'scry': return e.n * 0.25;
    case 'surveil': return e.n * 0.3;
    case 'pump': return e.p < 0 || e.t < 0 ? 0.4 + (-e.t) * 0.85 : 0.7 + (e.p + e.t) * 0.3 + e.kw.length * 0.3;
    case 'pumpSelf': return (e.p + e.t) * 0.4;
    case 'pumpTeam': return 1 + (e.p + e.t) * 0.9;
    case 'counters': case 'countersSelf': return e.n * 0.9;
    case 'countersTeam': return e.n * 2.2;
    case 'tokens': return e.n * (e.p + e.t * 0.8 + e.kw.reduce((s, k) => s + (KW_VALUE[k] || 0), 0)) * 0.85;
    case 'counter': return e.unless ? 2.0 : e.what === 'spell' ? 2.6 : 2.0;
    case 'refGain': return -0.4;
    case 'refLand': return -0.8;
    case 'refLose': return 0.2 * e.n;
    case 'loseRefTou': return -0.6;
    case 'refToken': return -(e.p + e.t * 0.7) * 0.5;
    case 'loseSelf': return -0.2 * e.n;
    case 'edict': return e.f.inCombat || e.f.attacking ? 2.2 : 2.8;
    case 'tapAll': return e.stun ? 3 : 1.5;
    case 'fog': return 0.8;
    case 'fight': return 2.0;
    case 'bite': return e.trampleExcess ? 2.9 : 2.6;
    case 'noBlock': return 0.5;
    case 'divided': return 1 + e.n * 0.9 + (e.max - 1) * 0.3;
    case 'brainstorm': return 1.6;
    case 'tuck': return 3.4 - (e.f.attacking || e.f.inCombat ? 0.7 : 0);
    case 'guide': return -0.3;
    case 'rummage': return 0.4;
    case 'discardSelf': return -0.8;
    case 'returnOwn': return -0.6;
    case 'noop': return 0;
    default: return EFF[e.k] && EFF[e.k].value ? EFF[e.k].value(e) : 0;
  }
}
const effsValue = (list, w = 1) => (list || []).reduce((s, e) => s + effectValue(e) * (e.may ? 0.95 : 1) * w, 0);
// What the abilities that aren't spells or enter-the-battlefield effects add: statics, triggers, activated abilities
function abilityValue(def) {
  let v = 0;
  for (const st of def.statics || []) {
    const kwv = (st.kw || []).reduce((s, k) => s + (KW_VALUE[k] || 0.4), 0);
    const each = (st.p || 0) * 0.9 + (st.t || 0) * 0.7 + kwv + (st.flags && (st.flags.cantAttack || st.flags.cantBlock) ? -3 : 0);
    v += st.who === 'all' ? (st.f && st.f.side === 'opp' ? -each * 2.5 : each * 2.6 * (st.f && (st.f.sub || st.f.legendary) ? 0.6 : 1)) : st.who === 'self' ? each : each * 0.9;
    if (st.v) v += st.v;
  }
  for (const t of def.trig || []) v += t.v != null ? t.v : effsValue(t.eff, t.w != null ? t.w : 0.7);
  for (const a of def.acts || []) {
    if (a.equip) continue;
    if (a.v != null) { v += a.v; continue; }
    const costPain = a.cost ? costMV(a.cost.m || genericCost(0)) * 0.25 + (a.cost.sacSelf ? 1.5 : 0) + (a.cost.tap ? 0.2 : 0) : 0;
    v += Math.max(0.2, effsValue(a.eff, a.cost && a.cost.sacSelf ? 0.9 : 0.75) - costPain) * (a.cost && a.cost.sacSelf ? 1 : 1.3);
  }
  if (def.ward) v += 0.6 + def.ward * 0.3;
  if (def.manaAbs) v += def.manaAbs.length * 0.6;
  return v;
}
function cardValue(def) {
  if (def.types.includes('Land')) return 0;
  let v = 0;
  if (!def.types.includes('Creature') && !def.types.includes('Instant') && !def.types.includes('Sorcery')) {
    // Artifacts and enchantments: what they do when they arrive, what they keep doing, and what an equip or aura gives
    v = effsValue(def.etb) + effsValue(def.leaves, 0.5) + abilityValue(def);
    if (def.mana) v += def.mana.length === 2 && def.mana[0] === 'C' ? 3.4 : 2.2;
    if (def.saga) v += def.saga.reduce((s, ch) => s + effsValue(ch.eff) * ch.ch.length * 0.9, 0);
    const eq = def.acts.find((a) => a.equip);
    if (eq) v += 0.8 - costMV(eq.cost.m) * 0.35;
    if (def.aura) v -= 0.6; // two-for-one risk
    if (def.cycling) v += 0.4;
    return Math.round(v * 100) / 100;
  }
  if (def.types.includes('Creature')) {
    v = def.power * 1.0 + def.toughness * 0.75;
    for (const k of def.kw) v += kwValue(k, Math.max(0, def.power));
    if (def.cantBlock) v -= 0.8;
    if (def.unblockable) v += 1.4;
    if (def.mana) v += def.mana.length === 2 && def.mana[0] === 'C' ? 2 : 1.2;
    if (def.blockFlyersOnly) v -= 0.6;
    if (def.landwalk) v += 0.7;
    if (def.pumpAbility) v += 0.9 + def.pumpAbility.p * 0.4;
    if (def.pinger) v += 2.2 * def.pinger.n;
    if (def.cycling) v += 0.4;
    if (def.pro) v += 0.6 * def.pro.length;
    if (def.selfHurt) v -= 0.8;
    if (def.rider) v += 1.5 * def.rider;
    if (def.noWallBlock) v += 0.1;
    if (def.tapLoot) v += 1.4;
    if (def.sacPing) v += 0.8 + def.sacPing.n * 0.9;
    if (def.onGain.length) v += 1.0;
    v += def.leaves.reduce((s, e) => s + effectValue(e) * 0.8, 0);
    if (def.sacAtEnd) v = def.power * 0.75 + def.kw.reduce((s, k) => s + (k === 'trample' ? 0.4 : k === 'haste' ? 0.6 : 0), 0);
    v += def.landfall.reduce((s, e) => s + effectValue(e) * 0.8, 0);
    v += def.etb.reduce((s, e) => s + effectValue(e) * (e.may ? 0.95 : 1), 0);
    v += def.dies.reduce((s, e) => s + effectValue(e) * 0.7, 0);
    v += def.attack.reduce((s, e) => s + effectValue(e) * 0.6, 0);
    v += def.hit.reduce((s, e) => s + effectValue(e) * 0.45, 0);
    v += abilityValue(def);
  } else {
    v = def.modes ? Math.max(...def.modes.map((md) => effsValue(md.eff))) + (def.modeN > 1 ? 1.5 : 0) : def.spell.reduce((s, e) => s + effectValue(e), 0);
    if ((def.spell || []).some((e) => (e.k === 'draw' && e.n === 1) || e.k === 'loot')) v -= 0.6;
    if (def.types.includes('Instant')) v += 0.5;
  }
  return Math.round(v * 100) / 100;
}
// Efficiency against mana value: what a card is worth per turn spent casting it.
function efficiency(def) {
  if (def.types.includes('Land')) return 0;
  const mv = def.effMv != null ? def.effMv : def.mv;
  const expected = [0, 2.6, 4.6, 6.4, 8.0, 9.4, 10.7, 11.8, 12.8][Math.min(8, mv)] || 13;
  return def.value / Math.max(2, expected);
}
function roleOf(def) {
  if (def.types.includes('Land')) return 'land';
  if (def.types.includes('Creature')) return 'creature';
  const spellish = def.spell || (def.modes ? def.modes.flatMap((md) => md.eff) : null);
  if (!spellish) {
    const all = def.etb.concat(def.saga ? def.saga.flatMap((ch) => ch.eff || []) : []);
    const ks = all.map((e) => e.k);
    if (ks.some((k) => ['destroy', 'exile', 'edict'].includes(k)) || (def.aura && def.statics.some((x) => x.flags && (x.flags.cantAttack || x.flags.cantBlock)))) return 'removal';
    if (def.aura || def.acts.some((a) => a.equip)) return 'aura';
    if (def.mana) return 'ramp';
    return 'other';
  }
  const ks = spellish.map((e) => e.k);
  if (ks.includes('counter')) return 'counter';
  if (ks.includes('wrath') || ks.includes('dmgAll')) return 'sweeper';
  if (ks.some((k) => ['destroy', 'exile', 'edict', 'fight', 'bite', 'divided', 'tuck', 'tuckN', 'dmgX', 'destroyAll'].includes(k)) || spellish.some((e) => (e.k === 'destroyP' || e.k === 'exileP') && (!e.tgt.f.types || e.tgt.f.types.some((t) => ['Creature', 'nonland', 'any'].includes(t)))) || spellish.some((e) => e.k === 'dmg' && e.to !== 'player') || spellish.some((e) => (e.k === 'pump' || e.k === 'pumpT') && e.t < 0)) return 'removal';
  if (ks.includes('draw') || ks.includes('loot') || ks.includes('brainstorm')) return 'draw';
  if (ks.includes('tokens')) return 'tokens';
  if (ks.includes('pump') || ks.includes('pumpTeam') || ks.includes('counters') || ks.includes('fog')) return 'trick';
  if (ks.includes('dmg') || ks.includes('drain')) return 'burn';
  if (spellish.some((e) => e.k === 'dmg' && e.to !== 'player') || ks.includes('pumpAll')) return 'removal';
  return 'other';
}

/* ============================================================
   2. Seeded randomness
   ============================================================ */
function makeRng(seed) {
  let s = (seed >>> 0) || 0x9e3779b9;
  const next = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  return { next, int: (n) => Math.floor(next() * n), pick: (a) => a[Math.floor(next() * a.length)], shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(next() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; } };
}

/* ============================================================
   3. The game
   ============================================================ */
const MAX_TURNS = 70;
// Commander: 40 life, 21 combat damage from one commander knocks a player out, {2} more per earlier cast from the command zone.
const CMD = { life: 40, lethal: 21, tax: 2 };
const PERSONAS = {
  aggro:    { attack: 0.85, faceBurn: 0.75, hold: 0.15, counterBar: 8,   chump: 0.25, label: 'Aggro' },
  midrange: { attack: 0.55, faceBurn: 0.3,  hold: 0.45, counterBar: 6.5, chump: 0.45, label: 'Midrange' },
  control:  { attack: 0.35, faceBurn: 0.1,  hold: 0.8,  counterBar: 5,   chump: 0.6,  label: 'Control' },
};
const clamp01 = (x) => Math.max(0, Math.min(1, x));
// Continuous effects are worked out lazily: anything that changes the board sets G.dirty, and the next read recomputes.
const fresh = (c) => { if (c.g && c.g.dirty) layers(c.g); };
const isCreature = (c) => { if (c.g && c.g.dirty) layers(c.g); return c.def.types.includes('Creature') || !!c.ani || !!c.crewed; };
const isLand = (c) => c.def.types.includes('Land');
const isInstantSpeed = (def) => def.types.includes('Instant') || def.kw.includes('flash');
// A card can work out its own base power as it goes (Namor: the number of Merfolk you control)
const basePow = (c) => { if (c.base) return c.base.p; if (c.sbase) return c.sbase.p; if (c.def.powFn && c.g) { const v = c.def.powFn(c.g, c); if (v != null) return v; } return c.def.power; };
const baseTou = (c) => (c.base ? c.base.t : c.sbase ? c.sbase.t : c.def.toughness);
const pow = (c) => { fresh(c); return basePow(c) + c.cnt + c.tp + (c.sp || 0); };
const tou = (c) => { fresh(c); return baseTou(c) + c.cnt + c.tt + (c.st || 0); };
const has = (c, k) => {
  fresh(c);
  if (c.tf && c.tf.noAbil) return c.tkw.includes(k) && !!c.tf.kwAfter;
  if (c.sfl && c.sfl.noAbil) return c.tkw.includes(k);
  if (k === 'indestructible' && c.tf && c.tf.loseInd) return false;
  if (c.timedKw && c.g && c.timedKw.some((x) => x.kw === k && c.g.turn < x.until)) return true;
  return c.def.kw.includes(k) || c.tkw.includes(k) || (!!c.skw && c.skw.includes(k)) || (!!c.ctr && c.ctr[k] > 0);
};
const other = (G, P) => G.players[1 - P.i];
const onBf = (G, c) => G.players.some((P) => P.bf.includes(c));
const ctrlOf = (G, c) => G.players[c.ctrl];
// Combat damage a creature deals: its power, or its toughness for Bill the Pony's friend
const combatPow = (c) => (c.tf && c.tf.toughDmg ? tou(c) : pow(c));
const dmgOut = (c) => Math.max(0, combatPow(c)) * (has(c, 'double strike') ? 2 : 1);
// How many creatures it takes to block this one
const minBlockers = (c) => Math.max(has(c, 'menace') ? 2 : 1, c.def.minBlock || 1);

function cv(c) {
  let v = Math.max(0, pow(c)) + Math.max(0, tou(c) - c.dmg) * 0.7;
  for (const k of new Set(c.def.kw.concat(c.tkw))) v += kwValue(k, Math.max(0, pow(c)));
  if (c.def.unblockable || c.def.landwalk) v += 1;
  if (c.def.pinger) v += 2 * c.def.pinger.n;
  if (c.def.pumpAbility) v += 0.8;
  if (c.def.mana) v += 0.6;
  if (c.token) v -= 0.4;
  return Math.max(0.4, v);
}

function newCard(G, def, owner) {
  return { id: G.nextId++, def, owner, ctrl: owner, tapped: false, sick: true, dmg: 0, dt: false, cnt: 0, tp: 0, tt: 0, tkw: [],
    token: false, attacking: false, blocked: false, blocking: 0, blockedBy: [], pumps: 0, stun: false,
    ctr: {}, att: null, tf: {}, base: null, sp: 0, st: 0, skw: [], g: G, mem: {} };
}
// `setup` starts a game from a fixed position instead of shuffled opening hands (the tutorial uses it):
// { turn, active, text, players: [{ life, library (top card first), hand, bf: [{ def, tapped, sick, cnt }], gy, cmdOnBf, cmdCasts, cmdDmg }] }
function createGame({ decks, seed, first = null, record = true, human = null, answers = [], setup = null, stopEmpty = true }) {
  const rng = makeRng(seed == null ? Date.now() : seed);
  const format = decks.every((d) => d.commander) ? 'commander' : 'standard';
  const G = { rng, seed, turn: 0, active: 0, first: 0, players: [], frames: [], record, over: false, winner: null, reason: '',
    stack: [], defs: {}, nextId: 1, phase: 'setup', human, answers, qi: 0, format, setup, stopEmpty,
    pending: [], delayed: [], depth: 0, dirty: true, combat: null, died: [], extraTurns: [] };
  decks.forEach((d, i) => {
    const P = { i, name: d.name, persona: PERSONAS[d.archetype] ? d.archetype : 'midrange', colors: d.colors || [], life: format === 'commander' ? CMD.life : 20,
      library: [], hand: [], bf: [], gy: [], exile: [], landsPlayed: 0, lost: false, decked: false, mulligans: 0, bottomed: 0,
      command: [], cmd: null, cmdCasts: 0, cmdDmg: {}, g: G, ring: { n: 0, bearer: null }, pool: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 },
      drawn: 0, cast: 0, died: 0, left: 0, attackedWith: 0, xcast: [],
      stats: { cast: 0, damage: 0, kills: 0, gained: 0, landsPlayed: 0 } };
    const mk = (def) => { for (const f of facesOf(def)) G.defs[f.id] = f; return newCard(G, def, i); };
    if (d.commander) { const c = mk(d.commander); c.cmdr = true; P.cmd = c; P.command.push(c); }
    const su = setup && setup.players && setup.players[i];
    if (su) {
      if (su.life != null) P.life = su.life;
      P.library = (su.library || []).map(mk).reverse();
      P.hand = (su.hand || []).map(mk);
      for (const b of su.bf || []) { const c = mk(b.def); c.tapped = !!b.tapped; c.sick = !!b.sick; c.cnt = b.cnt || 0; if (b.ctr) Object.assign(c.ctr, b.ctr); P.bf.push(c); }
      P.gy = (su.gy || []).map(mk);
      if (P.cmd && su.cmdOnBf) { P.command = []; P.cmd.sick = !!su.cmdSick; P.bf.push(P.cmd); }
      P.cmdCasts = su.cmdCasts || 0;
    } else for (const def of d.cards) P.library.push(mk(def));
    G.players.push(P);
  });
  if (setup) G.players.forEach((P, i) => { const su = setup.players && setup.players[i], O = G.players[1 - i]; if (su && su.cmdDmg && O.cmd) P.cmdDmg[O.cmd.id] = su.cmdDmg; });
  G.active = setup ? setup.active || 0 : first != null ? first : rng.int(2);
  G.first = G.active;
  if (setup) G.turn = (setup.turn || 1) - 1;
  return G;
}

/* ---------- Replay frames ---------- */
function snap(G) {
  return {
    turn: G.turn, active: G.active, phase: G.phase,
    p: G.players.map((P) => ({
      life: P.life, lib: P.library.length, mana: manaCount(P),
      hand: P.hand.map((c) => [c.id, c.def.id]),
      bf: P.bf.map((c) => {
        const o = { id: c.id, d: c.def.id };
        if (c.tapped) o.tap = 1;
        if (isCreature(c)) { o.p = pow(c); o.t = tou(c); if (c.sick && !has(c, 'haste')) o.sick = 1; }
        if (c.dmg) o.dmg = c.dmg;
        if (c.cnt) o.cnt = c.cnt;
        if (c.token) o.tok = 1;
        if (c.attacking) o.att = 1;
        if (c.blocking) o.blk = c.blocking;
        if (c.tp || c.tt) o.buff = c.tp + c.tt >= 0 ? 1 : -1;
        if (c.tkw.length) o.kw = c.tkw.slice();
        if (c.cmdr) o.cmdr = 1;
        if (isCreature(c) && !c.def.types.includes('Creature')) o.cre = 1;
        if (c.skw && c.skw.length) o.skw = c.skw.slice();
        const ks = c.ctr ? Object.keys(c.ctr).filter((k) => c.ctr[k] > 0) : [];
        if (ks.length) o.ctr = Object.fromEntries(ks.map((k) => [k, c.ctr[k]]));
        if (c.att != null) o.on = c.att;
        if (P.ring && P.ring.n && P.ring.bearer === c.id) o.rb = 1;
        if (c.ctrl !== c.owner) o.stolen = 1;
        if (c.mem && c.mem.harnessed) o.harn = 1;
        return o;
      }),
      gy: P.gy.slice(-6).map((c) => [c.id, c.def.id]), gyN: P.gy.length, ex: P.exile.length,
      ...(P.ring && P.ring.n ? { ring: P.ring.n } : null),
      ...(P.poison ? { poison: P.poison } : null),
      ...(P.pool && Object.values(P.pool).some((n) => n > 0) ? { pool: Object.assign({}, P.pool) } : null),
      ...(extraHand(G, P).length ? { xh: extraHand(G, P) } : null),
      ...(G.format === 'commander' ? { cmd: P.command.map((c) => [c.id, c.def.id]), tax: P.cmdCasts * CMD.tax, cd: Object.assign({}, P.cmdDmg) } : null),
    })),
    stack: G.stack.map((s) => ({ id: s.card.id, d: s.card.def.id, who: s.P.i })),
  };
}
// Cards outside the hand that a player can use right now: cast from exile, abilities in the graveyard, the top of the library (Elven Chorus)
function extraHand(G, P) {
  if (!P.g) return [];
  const out = [];
  for (const x of P.xcast || []) if (x.until >= G.turn && P.g && G.players.some((Q) => Q.exile.includes(x.card))) out.push([x.card.id, x.card.def.id, 'exile']);
  for (const x of P.xcast || []) if (x.until >= G.turn && G.players.some((Q) => Q.gy.includes(x.card)) && !out.some((o) => o[0] === x.card.id)) out.push([x.card.id, x.card.def.id, 'gy']);
  const gyOk = P.bf.some((c) => c.def.gyCast || c.def.gyLand);
  for (const c of P.gy) if ((c.def.gyActs || c.def.flashback || (gyOk && (castZone(G, P, c) || landChoices(G, P).some((x) => x.c === c)))) && !out.some((o) => o[0] === c.id)) out.push([c.id, c.def.id, 'gy']);
  const top = P.library[P.library.length - 1];
  if (top && P.bf.some((c) => c.def.chorus || c.def.peekTop || c.def.topCast)) out.push([top.id, top.def.id, 'top']);
  return out;
}
function emit(G, k, text, extra) {
  if (!G.record) return;
  G.frames.push(Object.assign({ k, text, turn: G.turn, who: G.active }, G.resolving ? { res: G.resolving } : null, extra || {}, { s: snap(G) }));
}
const sgn = (n) => (n < 0 || Object.is(n, -0) ? `-${Math.abs(n)}` : `+${n}`);
const nameList = (cs) => (cs.length <= 2 ? cs.map((c) => c.def.name).join(' and ') : `${cs.slice(0, -1).map((c) => c.def.name).join(', ')} and ${cs[cs.length - 1].def.name}`);

/* ---------- Zones ---------- */
function drawCards(G, P, n, step) {
  for (let k = 0; k < n; k++) {
    // Phial of Galadriel: drawing with an empty hand draws two instead
    const times = !P.hand.length && P.bf.some((c) => c.def.drawTwo) ? 2 : 1;
    for (let j = 0; j < times; j++) {
      if (!P.library.length) { P.decked = true; return; }
      P.hand.push(P.library.pop());
      P.drawn = (P.drawn || 0) + 1;
      if (G.pending) fire(G, 'draw', { P, nth: P.drawn, step: !!step && k === 0 && j === 0, oppTurn: G.active !== P.i });
    }
  }
}
function resetCard(c) {
  if (c.faceBase) { c.def = c.faceBase; c.faceBase = null; }
  if (!c.token && c.def) { if (c.def.front) c.def = c.def.front; else if (c.def.advOf) c.def = c.def.advOf; }
  c.tapped = false; c.sick = true; c.dmg = 0; c.dt = false; c.cnt = 0; c.tp = 0; c.tt = 0; c.tkw = []; c.attacking = false; c.blocked = false;
  c.blocking = 0; c.blockedBy = []; c.pumps = 0; c.stun = false; c.ctrl = c.owner; c.noBlock = false; c.exileDead = false;
  c.ctr = {}; c.att = null; c.tf = {}; c.base = null; c.crewed = false; c.ctrlFx = null; c.sp = 0; c.st = 0; c.skw = []; c.ani = false; c.leg = false; c.subX = null; c.orc = false;
  c.addSubs = null;
  c.onceT = null; c.resN = null; c.manaTurn = 0; c.goad = 0; c.phased = false; c.xtrig = null; c.mem = {}; c.timedKw = null; c.onceA = null;
}
function leaveBattlefield(G, c) {
  const P = ctrlOf(G, c);
  const k = P.bf.indexOf(c);
  if (k >= 0) P.bf.splice(k, 1);
  for (const Q of G.players) for (const x of Q.bf) {
    if (x.blocking === c.id) x.blocking = 0;
    if (x.blockedBy.length) x.blockedBy = x.blockedBy.filter((b) => b !== c);
    if (x.att === c.id && !x.def.aura) x.att = null; // equipment stays behind; auras go with state-based actions
  }
  if (k < 0) return;
  if (P.ring && P.ring.bearer === c.id) P.ring.bearer = null;
  P.leftTurn = G.turn;
  if (G.pending) { dirty(G); fire(G, 'leave', { c, P, ctrl: P.i, leg: c.def.supertypes.includes('Legendary'), art: isArtifact(c), mem: c.mem, lki: trigsOf(G, c) }); }
}
// "When this leaves the battlefield" triggers, once the creatures are gone
function leaves(G, list) {
  for (const { c, P, def } of list) { const d = def || c.def; if (d.leaves && d.leaves.length && !G.over) resolveEffects(G, P, d.leaves, c, null, 'dies'); }
}
function meldOut(G, c, zone) { if (!c.meldParts) return; for (const p of c.meldParts) G.players[p.owner][zone].push(p); c.meldParts = null; }
function toGraveyard(G, c) { leaveBattlefield(G, c); resetCard(c); if (!c.token) G.players[c.owner].gy.push(c); meldOut(G, c, 'gy'); }
function exileCard(G, c) { leaveBattlefield(G, c); resetCard(c); if (!c.token) G.players[c.owner].exile.push(c); meldOut(G, c, 'exile'); }
// An emblem: a player-level source of triggered abilities (Sephiroth, One-Winged Angel)
function addEmblem(G, P, name, trig) {
  const def = { id: `emblem-${slug(name)}`, name: `${name} emblem`, types: [], sub: [], supertypes: [], kw: [], colors: [], trig, etb: [], dies: [], acts: [], statics: [], mv: 0, value: 0 };
  const em = { id: -(G.nextId++), def, owner: P.i, ctrl: P.i, mem: {}, tkw: [], cnt: 0, tp: 0, tt: 0, ctr: {}, tf: {}, emblem: true };
  (P.emblems = P.emblems || []).push(em);
  emit(G, 'info', `${P.name} gets an emblem: ${name}.`, { who: P.i });
  return em;
}
// Turn a double-faced permanent over
function transform(G, c, quiet) {
  if (!onBf(G, c)) return false;
  const to = c.def.back || c.def.front;
  if (!to) return false;
  const from = c.def;
  c.def = to;
  dirty(G);
  if (!quiet) emit(G, 'transform', `${from.name} transforms into ${to.name}.`, { who: c.ctrl, cards: [c.id] });
  if (G.pending) fire(G, 'transform', { c, P: ctrlOf(G, c), from, to });
  return true;
}
// Exile a permanent, then return it to the battlefield under its owner's control (transformed, when asked)
function blink(G, c, opts = {}) {
  if (!onBf(G, c)) return null;
  const Q = G.players[c.owner];
  exilePermanent(G, ctrlOf(G, c), c);
  const k = Q.exile.indexOf(c);
  if (c.token || k < 0) return null;
  Q.exile.splice(k, 1);
  enterBattlefield(G, Q, c, null, { transformed: !!opts.transformed, tapped: !!opts.tapped, ctr: opts.ctr });
  if (opts.tapped) c.tapped = true;
  return c;
}
// Meld two permanents into one: the first card carries the melded face, the second rides along
function meld(G, P, a, b, into) {
  if (!onBf(G, a) || !onBf(G, b)) return null;
  exilePermanent(G, P, a); exilePermanent(G, P, b);
  for (const c of [a, b]) { const Q = G.players[c.owner]; const k = Q.exile.indexOf(c); if (k >= 0) Q.exile.splice(k, 1); }
  enterBattlefield(G, P, a, null, { face: into });
  a.meldParts = [b];
  return a;
}
function dieNow(G, list, why) {
  const dead = list.filter((c) => onBf(G, c));
  if (!dead.length) return;
  const owners = dead.map((c) => ctrlOf(G, c));
  // Stone of Erech: a creature its controller's opponent... would die is exiled instead
  for (const c of dead) if (isCreature(c) && G.players[1 - c.ctrl].bf.some((x) => x.def.exileFoes)) c.exileDead = true;
  // Finality counters; The Darkness Crystal exiles an opponent's nontoken creatures instead
  for (const c of dead) if (ctrCount(c, 'finality')) c.exileDead = true;
  for (const c of dead) if (isCreature(c) && !c.token && !c.exileDead) { const dc = G.players[1 - c.ctrl].bf.find((x) => x.def.darkCrystal); if (dc) { c.exileDead = true; c.darkBy = dc; } }
  const info = dead.map((c) => ({ c, def: c.def, cnt: c.cnt, ctr: Object.assign({}, c.ctr), eqs: equipmentOn(G, c), P: ctrlOf(G, c), cre: isCreature(c), pow: isCreature(c) ? pow(c) : 0, leg: isLegendary(c), sub: subOf(c).slice(), token: !!c.token, att: !!c.attacking, spider: c.spiderTurn === G.turn, spiderBy: c.spiderBy, mv: c.def.mv, lki: trigsOf(G, c) }));
  const exiled = new Set(dead.filter((c) => c.exileDead));
  const died = dead.filter((c) => !exiled.has(c));
  died.forEach((c) => toGraveyard(G, c));
  exiled.forEach((c) => exileCard(G, c));
  exiled.forEach((c) => { const dc = c.darkBy; c.darkBy = null; if (dc && onBf(G, dc)) { const Q = G.players[dc.ctrl]; (dc.mem.exiled = dc.mem.exiled || []).push(c.id); gainLife(G, Q, 2); emit(G, 'life', `${Q.name} gains 2 life (${dc.def.name}).`, { who: Q.i, target: `p${Q.i}`, amount: -2 }); } });
  if (died.length) emit(G, 'die', `${nameList(died)} ${died.length > 1 ? 'die' : 'dies'}${why ? ` ${why}` : ''}.`, { cards: died.map((c) => c.id) });
  if (exiled.size) emit(G, 'exile', `${nameList([...exiled])} ${exiled.size > 1 ? 'are' : 'is'} exiled instead of dying.`, { cards: [...exiled].map((c) => c.id) });
  for (const x of info) {
    if (!x.cre) { if (!exiled.has(x.c)) fire(G, 'toGy', { c: x.c, P: x.P, ctrl: x.P.i, lki: x.lki }); continue; }
    if (exiled.has(x.c)) continue;
    G.died.push({ turn: G.turn, ctrl: x.P.i, leg: x.leg, pow: x.pow, sub: x.sub, token: x.token, card: x.c });
    fire(G, 'die', { c: x.c, P: x.P, ctrl: x.P.i, pow: x.pow, leg: x.leg, sub: x.sub, token: x.token, att: x.att, spider: x.spider, spiderBy: x.spiderBy, lki: x.lki, cnt: x.cnt, ctr: x.ctr, eqs: x.eqs, def: x.def, mv: x.mv });
    fire(G, 'toGy', { c: x.c, P: x.P, ctrl: x.P.i, lki: x.lki });
  }
  died.forEach((c) => { const d = info[dead.indexOf(c)].def; if (d.dies.length && !G.over) { const P = owners[dead.indexOf(c)]; const n = gandalfTwice(G, P, c) ? 2 : 1; for (let i = 0; i < n && !G.over; i++) resolveEffects(G, P, d.dies, c, null, 'dies'); } });
  leaves(G, dead.map((c, k) => ({ c, P: owners[k], def: info[k].def })));
}
// Gandalf the White makes a legendary permanent's or an artifact's own enter and leave abilities happen twice
const gandalfTwice = (G, P, c) => (c.def.supertypes.includes('Legendary') || isArtifact(c)) && P.bf.some((x) => x.def.doubler);
const diedThisTurn = (G, P, f) => G.died.filter((d) => d.turn === G.turn && (!P || d.ctrl === P.i) && (!f || f(d))).length;
// A commander put into a graveyard, exile or a library goes to the command zone instead (its owner always takes that choice).
function cmdHome(G) {
  if (G.format !== 'commander') return;
  for (const P of G.players) {
    const c = P.cmd;
    if (!c) continue;
    for (const zone of [P.gy, P.exile, P.library]) {
      const k = zone.indexOf(c);
      if (k < 0) continue;
      zone.splice(k, 1);
      resetCard(c);
      P.command.push(c);
      emit(G, 'command', `${c.def.name} returns to the command zone. Casting it again costs {${CMD.tax * P.cmdCasts}} more.`, { who: P.i, card: c.id });
    }
  }
}
const cmdKO = (G, P) => G.format === 'commander' && Object.values(P.cmdDmg).some((n) => n >= CMD.lethal);
function sbaCore(G) {
  for (const P of G.players) { if (P.lifeSeen != null && P.life < P.lifeSeen && G.pending) fire(G, 'lostLife', { P, n: P.lifeSeen - P.life }); P.lifeSeen = P.life; }
  for (let guard = 0; guard < 25 && !G.over; guard++) {
    cmdHome(G);
    for (const P of G.players) {
      if (!P.bf.some((c) => c.def.gyToExile)) { P.gyKeep = null; continue; }
      if (!P.gyKeep) { P.gyKeep = new Set(P.gy.map((c) => c.id)); continue; }
      const moved = P.gy.filter((c) => !P.gyKeep.has(c.id));
      if (moved.length) { P.gy = P.gy.filter((c) => P.gyKeep.has(c.id)); P.exile.push(...moved); emit(G, 'exile', `${nameList(moved)} ${moved.length > 1 ? 'are' : 'is'} exiled instead of going to the graveyard.`, { who: P.i, cards: moved.map((c) => c.id) }); }
      P.gyKeep = new Set(P.gy.map((c) => c.id));
    }
    checkControl(G);
    const dying = [], legend = [], gone = [];
    for (const P of G.players) {
      const legends = new Map();
      for (const c of P.bf) {
        if (isCreature(c) && (tou(c) <= 0 || (!has(c, 'indestructible') && (c.dmg >= tou(c) || (c.dt && c.dmg > 0))))) dying.push(c);
        if (isLegendary(c)) { if (legends.has(c.def.name)) legend.push(legends.get(c.def.name)); legends.set(c.def.name, c); }
        if (c.def.aura && (c.att == null || !byId(G, c.att))) gone.push(c);
        if (c.att != null && !c.def.aura) { const h = byId(G, c.att); if (!h || !isCreature(h)) c.att = null; }
        if (c.def.saga && c.def.saga.length && ctrCount(c, 'lore') >= sagaFinal(c.def) && !c.chapterBusy && !G.pending.some((it) => it.src === c)) gone.push(c);
      }
    }
    for (const c of dying) G.players[1 - c.ctrl].stats.kills++;
    const all = [...new Set(dying.concat(legend))];
    if (all.length) { dieNow(G, all); cmdHome(G); }
    for (const c of gone) {
      if (!onBf(G, c)) continue;
      const P = ctrlOf(G, c);
      if (c.def.saga) { emit(G, 'sac', `${c.def.name} has told its tale and is sacrificed.`, { who: P.i, cards: [c.id] }); sacrifice(G, P, c, true); }
      else { emit(G, 'die', `${c.def.name} goes to the graveyard.`, { who: P.i, cards: [c.id] }); putInGraveyard(G, c); }
    }
    let lost = false;
    for (const P of G.players) if (!P.lost && (P.life <= 0 || P.decked || cmdKO(G, P) || P.loseNow || (P.poison || 0) >= 10)) { P.lost = true; lost = true; }
    if (lost || G.players.some((P) => P.lost)) { endGame(G); return; }
    if (!all.length && !gone.length) return;
  }
}
const sagaFinal = (d) => Math.max(...d.saga.flatMap((ch) => ch.ch));
function sba(G) {
  sbaCore(G);
  if (!G.over && !G.depth && !G.flushing && G.pending && G.pending.length) flush(G);
}
function endGame(G, why) {
  if (G.over) return;
  G.over = true;
  const alive = G.players.filter((P) => !P.lost);
  if (why === 'turns') { G.winner = null; G.reason = 'turns'; emit(G, 'end', `The game is a draw after ${G.turn} turns.`); return; }
  if (alive.length === 1) {
    const W = alive[0], L = other(G, W);
    G.winner = W.i;
    G.reason = L.loseNow && L.life > 0 ? 'ring' : L.life > 0 && cmdKO(G, L) ? 'commander' : L.decked && L.life > 0 ? 'decked' : 'life';
    const why = G.reason === 'ring' ? ': the Ring has claimed its prize' : G.reason === 'decked' ? `, as ${L.name} can't draw a card` : G.reason === 'commander' ? ` with ${CMD.lethal} commander damage from ${W.cmd ? W.cmd.def.name : 'their commander'}` : '';
    emit(G, 'end', `${W.name} wins on turn ${G.turn}${why}.`, { who: W.i });
  } else { G.winner = null; G.reason = 'both'; emit(G, 'end', 'Both players fall at once. The game is a draw.'); }
}

/* ---------- Targets ---------- */
// Protection from a color or a creature type: can't be blocked, targeted or damaged by sources with that quality.
function protectedFrom(c, src) {
  if (!src || !src.def) return false;
  if (c.tf && c.tf.proColors && c.tf.proColors.some((col) => src.def.colors.includes(col))) return true;
  if (c.tf && c.tf.proTypes && c.tf.proTypes.some((t) => src.def.types.includes(t))) return true;
  if (!c.def.pro) return false;
  return c.def.pro.some((q) => (q.color && src.def.colors.includes(q.color)) || (q.sub && src.def.sub.includes(q.sub)));
}
function targetOk(G, P, f, c, src) {
  if (!c || !onBf(G, c) || !isCreature(c)) return false;
  if (f.side === 'opp' && c.ctrl === P.i) return false;
  if (f.side === 'you' && c.ctrl !== P.i) return false;
  if (c.ctrl !== P.i && has(c, 'hexproof')) return false;
  if (src && protectedFrom(c, src)) return false;
  if (f.notColor && c.def.colors.includes(f.notColor)) return false;
  if (f.color && !c.def.colors.includes(f.color)) return false;
  if (f.notArtifact && c.def.types.includes('Artifact')) return false;
  if (f.notLegendary && c.def.supertypes.includes('Legendary')) return false;
  if (f.tapped && !c.tapped) return false;
  if (f.untapped && c.tapped) return false;
  if (f.attacking && !c.attacking) return false;
  if (f.blocking && !c.blocking) return false;
  if (f.inCombat && !c.attacking && !c.blocking) return false;
  if (f.hasKw && !has(c, f.hasKw)) return false;
  if (f.noKw && has(c, f.noKw)) return false;
  if (f.powGE != null && pow(c) < f.powGE) return false;
  if (f.powLE != null && pow(c) > f.powLE) return false;
  if (f.touGE != null && tou(c) < f.touGE) return false;
  if (f.touLE != null && tou(c) > f.touLE) return false;
  if (f.mvGE != null && c.def.mv < f.mvGE) return false;
  if (f.mvLE != null && c.def.mv > f.mvLE) return false;
  return true;
}
// Edicts don't target, so hexproof and protection don't matter: Q picks among their own creatures.
const edictOk = (G, Q, f, c) => targetOk(G, Q, Object.assign({}, f, { side: null }), c);
const allCreatures = (G) => G.players.flatMap((P) => P.bf.filter(isCreature));
const TARGETED = new Set(['dmg', 'destroy', 'exile', 'bounce', 'tap', 'pump', 'counters', 'tuck', 'fight', 'bite', 'noBlock', 'divided']);
const needsTarget = (e) => !!e.tgt || (TARGETED.has(e.k) && !(e.k === 'dmg' && e.to === 'player'));
// Every target in a list of target refs (one per effect)
const allTargets = (ts) => (ts || []).flatMap(targetList);
function targetList(t) {
  if (!t || t === 'skip') return [];
  if (t.plan) return t.plan;
  const out = [];
  if (t.c) out.push({ c: t.c });
  if (t.c2) out.push({ c: t.c2 });
  if (t.cs) t.cs.forEach((c) => out.push(c.p != null && !c.def ? { p: c.p } : { c }));
  if (t.p != null) out.push({ p: t.p });
  return out;
}
function stillLegal(G, P, e, t, src, X) {
  if (!t || t === 'skip') return false;
  if (e.tgt && e.tgt.pair) { const { ok } = pairCands(G, P, e, src, X); return ok(t.c, t.c2 || null); }
  if (e.tgt) { if (t.cs) return t.cs.some((x) => tgtOk(G, P, e, x, src, X)); return tgtOk(G, P, e, t.p != null ? { p: t.p } : t.c, src, X); }
  if (t.plan) return t.plan.some((x) => (x.p != null ? !G.players[x.p].lost : targetOk(G, P, {}, x.c, src)));
  if (e.k === 'fight' || e.k === 'bite') return targetOk(G, P, { side: 'you' }, t.c, src) && targetOk(G, P, { side: 'opp' }, t.c2, src);
  if (t.p != null) return !G.players[t.p].lost;
  return targetOk(G, P, e.f || {}, t.c, src);
}
// Split damage: kill the best creatures it can, send the rest at the opponent.
function dividePlan(G, P, e, source) {
  const O = other(G, P);
  let left = e.n, slots = e.max, score = 0;
  const plan = [];
  const prey = allCreatures(G).filter((c) => c.ctrl !== P.i && targetOk(G, P, {}, c, source)).sort((a, b) => cv(b) - cv(a));
  for (const c of prey) {
    if (!slots || !left) break;
    const need = lethalTo(c);
    if (need <= left) { plan.push({ c, n: need }); left -= need; slots--; score += cv(c); }
  }
  if (left > 0) {
    if (slots > 0) { plan.push({ p: O.i, n: left }); score += O.life <= left ? 100 : left * (O.life <= 10 ? 0.4 : 0.15); }
    else plan[plan.length - 1].n += left;
  }
  return { plan, score };
}

/* ---------- AI: how much is an effect worth right now, and on what? ---------- */
const lethalTo = (c) => (has(c, 'indestructible') ? Infinity : Math.max(0, tou(c) - c.dmg));
function evalEffect(G, P, e, ctx, source, lastT, X) {
  const O = other(G, P);
  const per = PERSONAS[P.persona];
  const trig = ctx === 'trigger' || ctx === 'etb';
  const oppTargets = (f) => allCreatures(G).filter((c) => c.ctrl !== P.i && targetOk(G, P, f || {}, c, source));
  const ownTargets = (f) => allCreatures(G).filter((c) => c.ctrl === P.i && targetOk(G, P, f || {}, c, source));
  const anyTargets = (f) => allCreatures(G).filter((c) => targetOk(G, P, f || {}, c, source));
  const best = (cs, score) => cs.reduce((b, c) => { const s = score(c); return s > b.score ? { score: s, target: { c } } : b; }, { score: -Infinity, target: null });
  switch (e.k) {
    case 'dmg': {
      if (e.to === 'player') return { score: O.life <= e.n ? 100 : e.n * (0.25 + per.faceBurn * 0.6), target: { p: O.i } };
      const killable = oppTargets(e.f).filter((c) => lethalTo(c) <= e.n);
      const b = best(killable, (c) => cv(c) + (c.attacking ? 0.5 : 0));
      let face = { score: -1 };
      if (e.to === 'any' && !hexP(G, O, P)) face = { score: O.life <= e.n ? 100 : e.n * per.faceBurn * (O.life <= 8 ? 1.2 : O.life <= 12 ? 0.6 : 0.12), target: { p: O.i } };
      if (b.target && b.score >= face.score) return b;
      if (face.score > 0) return face;
      if (trig) {
        const any = oppTargets(e.f);
        if (any.length) return best(any, (c) => cv(c) * 0.3);
        if (e.to === 'any' && !hexP(G, O, P)) return { score: 0.1, target: { p: O.i } };
        const own = ownTargets(e.f);
        return own.length ? best(own, (c) => -cv(c)) : null;
      }
      return null;
    }
    case 'dmgAll': {
      const hit = allCreatures(G).filter((c) => (e.side === 'all' || c.ctrl !== P.i) && (!e.noKw || !has(c, e.noKw)) && (!e.hasKw || has(c, e.hasKw)) && lethalTo(c) <= e.n);
      const net = hit.reduce((s, c) => s + (c.ctrl === P.i ? -cv(c) : cv(c)), 0);
      return { score: trig ? net : net - 1.5, target: null };
    }
    case 'dmgPlayers': return { score: O.life <= e.n && P.life > e.n ? 100 : 0, target: null };
    case 'destroy': case 'exile': case 'tuck': {
      const cs = oppTargets(e.f).filter((c) => e.k !== 'destroy' || !has(c, 'indestructible'));
      const b = best(cs, (c) => cv(c) + (c.attacking ? 0.5 : 0));
      if (b.target) return b;
      if (trig) { const own = ownTargets(e.f).filter((c) => c !== source); return own.length ? best(own, (c) => -cv(c) - 5) : null; }
      return null;
    }
    case 'wrath': {
      const mine = P.bf.filter(isCreature).reduce((s, c) => s + (has(c, 'indestructible') ? 0 : cv(c)), 0);
      const theirs = O.bf.filter(isCreature).reduce((s, c) => s + (has(c, 'indestructible') ? 0 : cv(c)), 0);
      return { score: theirs - mine - 3, target: null };
    }
    case 'bounce': {
      const b = best(oppTargets(e.f), (c) => (c.token ? cv(c) + 1 : c.def.mv * 0.6 + cv(c) * 0.25));
      if (b.target) return b;
      if (trig) { const own = ownTargets(e.f).filter((c) => c !== source); return own.length ? best(own, (c) => -cv(c) - 3) : null; }
      return null;
    }
    case 'tap': {
      const cs = oppTargets(e.f).filter((c) => !c.tapped);
      if (cs.length) return best(cs, (c) => (ctx === 'main1' ? cv(c) * (e.stun ? 0.6 : 0.4) : e.stun ? cv(c) * 0.3 : 0.2));
      if (trig) { const any = anyTargets(e.f); return any.length ? best(any, (c) => (c.ctrl === P.i ? -cv(c) * 0.2 : 0)) : null; }
      return null;
    }
    case 'tapAll': {
      const cs = O.bf.filter((c) => isCreature(c) && !c.tapped);
      if (!cs.length) return null;
      return { score: cs.reduce((s, c) => s + cv(c), 0) * (e.stun ? 0.45 : 0.25) * (ctx === 'main1' ? 1 : 0.5), target: null };
    }
    case 'raise': {
      const cs = P.gy.filter(isCreature);
      return cs.length ? { score: 1.2 + Math.max(...cs.map((c) => c.def.value)) * 0.3, target: null } : (trig ? { score: 0, target: null } : null);
    }
    case 'draw': return { score: e.n * 1.3 + (P.library.length <= e.n + 2 ? -20 : 0), target: null };
    case 'loot': return { score: 0.8, target: null };
    case 'brainstorm': return { score: 1.0 + (P.hand.filter(isLand).length >= 3 ? 0.6 : 0) + (P.library.length <= 5 ? -20 : 0), target: null };
    case 'gain': return { score: P.life <= 8 ? e.n * 0.45 : e.n * 0.12, target: null };
    case 'drain': return { score: O.life <= e.n ? 100 : e.n * 0.5, target: null };
    case 'loseSelf': return e.n >= P.life ? null : { score: -e.n * (P.life <= 6 ? 0.8 : 0.15), target: null };
    case 'discard': return O.hand.length ? { score: Math.min(O.hand.length, e.n) * 0.9, target: null } : (trig ? { score: 0, target: null } : null);
    case 'scry': return { score: 0.3, target: null };
    case 'surveil': return { score: 0.35 + e.n * 0.05, target: null };
    case 'edict': {
      const cs = O.bf.filter((c) => isCreature(c) && edictOk(G, O, e.f, c));
      if (!cs.length) return trig ? { score: 0, target: null } : null;
      return { score: Math.min(...cs.map(cv)) + 0.3, target: null };
    }
    case 'fight': case 'bite': {
      let bestF = null;
      for (const m of ownTargets({})) for (const o of oppTargets({})) {
        const killsIt = !has(o, 'indestructible') && !protectedFrom(o, m) && pow(m) > 0 && (has(m, 'deathtouch') || pow(m) * (e.mult || 1) >= lethalTo(o));
        const dies = e.k === 'fight' && !has(m, 'indestructible') && !protectedFrom(m, o) && pow(o) > 0 && (has(o, 'deathtouch') || pow(o) >= lethalTo(m));
        let sc = (killsIt ? cv(o) : 0) - (dies ? cv(m) : 0);
        if (e.trampleExcess && has(m, 'trample') && killsIt) sc += Math.max(0, pow(m) - lethalTo(o)) * 0.3;
        if (!bestF || sc > bestF.score) bestF = { score: sc, target: { c: m, c2: o } };
      }
      if (!bestF || (bestF.score <= 0.5 && !trig)) return null;
      return bestF;
    }
    case 'noBlock': {
      const cs = oppTargets({}).filter((c) => !c.tapped && !c.def.cantBlock);
      if (cs.length) return best(cs, (c) => cv(c) * 0.25);
      if (trig) { const any = anyTargets({}); return any.length ? best(any, () => 0) : null; }
      return null;
    }
    case 'divided': { const d = dividePlan(G, P, e, source); return d.plan.length ? { score: d.score, target: { plan: d.plan } } : null; }
    case 'pump': {
      if (e.p < 0 || e.t < 0) {
        const killable = oppTargets(e.f).filter((c) => tou(c) + e.t - c.dmg <= 0 || (tou(c) + e.t <= 0));
        const b = best(killable, (c) => cv(c));
        if (b.target) return b;
        if (trig) { const any = oppTargets(e.f); if (any.length) return best(any, (c) => cv(c) * 0.2); const own = ownTargets(e.f); return own.length ? best(own, (c) => -cv(c)) : null; }
        return null;
      }
      if (ctx === 'main1' && source && source.def.types.includes('Sorcery')) {
        const ready = ownTargets(e.f).filter((c) => !c.tapped && (!c.sick || has(c, 'haste')) && !has(c, 'defender'));
        if (!ready.length) return null;
        return best(ready, (c) => (e.p + e.t) * 0.35 + e.kw.filter((k) => !has(c, k)).reduce((x, k) => x + (KW_VALUE[k] || 0), 0) + pow(c) * 0.1);
      }
      if (trig || ctx === 'combat') {
        const own = ownTargets(e.f);
        if (own.length) return best(own, (c) => cv(c) + (c.attacking ? 2 : 0));
        const any = anyTargets(e.f);
        return any.length ? best(any, (c) => -cv(c)) : null;
      }
      return null;
    }
    case 'pumpSelf': return { score: 0.5, target: null };
    case 'pumpTeam': {
      if (ctx === 'combat') return { score: 1, target: null };
      if (ctx !== 'main1' || !source || !source.def.types.includes('Sorcery')) return null;
      const atk = P.bf.filter((c) => isCreature(c) && !c.tapped && (!c.sick || has(c, 'haste')) && !has(c, 'defender'));
      if (!atk.length) return null;
      atk.forEach((c) => { c.tp += e.p; c.tt += e.t; e.kw.forEach((k) => c.tkw.push(k)); });
      const dmg = unblockedDamage(G, atk, O);
      atk.forEach((c) => { c.tp -= e.p; c.tt -= e.t; c.tkw.splice(c.tkw.length - e.kw.length, e.kw.length); });
      if (dmg >= O.life) return { score: 100, target: null };
      return atk.length >= 3 ? { score: atk.length * (e.p + e.t) * 0.25, target: null } : null;
    }
    case 'counters': {
      const own = ownTargets(e.f);
      if (own.length) return best(own, (c) => cv(c) * 0.2 + e.n);
      if (trig) { const any = anyTargets(e.f); return any.length ? best(any, (c) => -cv(c)) : null; }
      return null;
    }
    case 'countersSelf': return { score: e.n * 0.8, target: null };
    case 'countersTeam': return { score: P.bf.filter(isCreature).length * e.n * 0.8, target: null };
    case 'tokens': return { score: e.n * (e.p + e.t * 0.6 + e.kw.length * 0.5) * 0.8 + 0.3, target: null };
    // Follow-ups to the previous target
    case 'refGain': { const c = lastT && lastT.c; if (!c) return { score: 0, target: null }; const n = Math.max(0, e.by === 'power' ? pow(c) : tou(c)); return { score: (c.ctrl === P.i ? 1 : -1) * n * 0.12, target: null }; }
    case 'refLand': return { score: lastT && lastT.c && lastT.c.ctrl !== P.i ? -1.0 : 0, target: null };
    case 'refLose': return { score: lastT && lastT.c && lastT.c.ctrl !== P.i ? e.n * 0.3 : -e.n * 0.3, target: null };
    case 'loseRefTou': { const n = lastT && lastT.c ? Math.max(0, tou(lastT.c)) : 0; return n >= P.life ? null : { score: -n * (P.life <= 8 ? 0.6 : 0.25), target: null }; }
    case 'refToken': return { score: lastT && lastT.c ? (lastT.c.ctrl === P.i ? 1 : -1) * (e.p + e.t * 0.7) : 0, target: null };
    case 'guide': return { score: -0.3, target: null };
    case 'rummage': { if (!P.hand.length) return { score: -1, target: null }; const worst = Math.min(...P.hand.map((c) => handValue(G, P, c))); return { score: worst < 2 ? 0.6 : -0.5, target: null }; }
    case 'discardSelf': return { score: -0.8, target: null };
    case 'returnOwn': return { score: -0.6, target: null };
    case 'fog': case 'counter': return null;
    case 'noop': return { score: 0, target: null };
    default: return evalGeneric(G, P, e, ctx, source, X);
  }
}
// Newer effects: score each legal target with the effect's own judgement, take the best (or best few)
function evalGeneric(G, P, e, ctx, source, X) {
  const H = EFF[e.k];
  if (!H) return null;
  if (!X || !X.P) X = Object.assign({ P, O: other(G, P), src: source, ev: {} }, X || {});
  if (e.tgt && e.tgt.pair) return evalPair(G, P, e, ctx, source, X);
  const trig = ctx === 'trigger' || ctx === 'etb' || ctx === 'dies';
  if (e.tgt) {
    const n = e.tgt.nFn ? e.tgt.nFn(G, X) : e.tgt.n || 1, min = e.tgt.min != null ? e.tgt.min : 1;
    if (n <= 0) return { score: 0, target: 'skip' };
    const scored = tgtCands(G, P, e, source, X).map((x) => ({ x, s: H.val ? H.val(G, P, e, x, X, ctx) : 0 })).sort((a, b) => b.s - a.s || (a.x.id || 0) - (b.x.id || 0));
    let picks = scored.filter((y) => y.s > 0).slice(0, n);
    if (picks.length < min) { if (!trig) return null; picks = scored.slice(0, min); }
    if (!picks.length) return min === 0 ? { score: 0, target: 'skip' } : null;
    const base = H.score ? H.score(G, P, e, X, ctx) || 0 : 0;
    return { score: picks.reduce((t, y) => t + y.s, 0) + base, target: n > 1 ? { cs: picks.map((y) => y.x) } : refFor(picks[0].x) };
  }
  const sc = H.score ? H.score(G, P, e, X, ctx) : 0.3;
  return sc == null ? null : { score: sc, target: null };
}
function chooseTargets(G, P, effects, ctx, source, X) {
  const targets = [];
  let score = 0, lastT = null;
  for (const e of effects) {
    if (X) X.prevT = lastT;
    const r = evalEffect(G, P, e, ctx, source, lastT, X);
    if (!r) {
      if (needsTarget(e)) { if (e.may || ctx === 'trigger' || ctx === 'etb' || ctx === 'dies') { targets.push(null); continue; } return null; }
      if (ctx === 'trigger' || ctx === 'etb' || ctx === 'dies') { targets.push(null); continue; }
      return null;
    }
    if ((e.may || (e.tgt && e.tgt.min === 0)) && r.score < 0) { targets.push('skip'); continue; }
    score += r.score;
    if (needsTarget(e)) { targets.push(r.target); if (r.target) lastT = r.target; }
    else targets.push(null);
  }
  return { score, targets };
}

/* ---------- Effects ---------- */
// Damage replacement: doubling (Lightning, Trance Kuja) and soaking (Ancient Adamantoise)
function dmgMod(G, src, victim, n) {
  if (n <= 0) return n;
  if (G.stagger && G.stagger.some((x) => x.p === victim && x.until > G.turn)) n *= 2;
  if (src && src.def && src.ctrl != null && (src.def.sub || []).length && hasSub(src, 'Wizard') && G.players[src.ctrl].bf.some((x) => x.def.wizardDouble)) n *= 2;
  if (src && src.def && src.tkw) {
    // Mjölnir: double all damage the equipped creature would deal
    if (onBf(G, src) && isCreature(src)) for (const e of equipmentOn(G, src)) if (e.def.dmgDouble) n *= 2;
    // Hawkeye, Young Avenger: noncombat damage to an opponent or their permanents gets +X (his power)
    const sc = src.ctrl != null ? src.ctrl : src.owner;
    if (!G.combatDmg && sc != null && victim !== sc && G.players[sc]) for (const h of G.players[sc].bf) if (h.def.noncombatPlus && isCreature(h)) n += Math.max(0, pow(h));
  }
  return n;
}
function damageCreature(G, c, n, src, opts) {
  if (!onBf(G, c) || n <= 0) return 0;
  if (src && protectedFrom(c, src) && !G.noPrevent) return 0;
  if (opts && opts.combat && c.def.noCombatDmg) return 0;
  if (G.players[c.ctrl].shieldTurn === G.turn && !G.noPrevent) return 0;
  if (c.ctr && c.ctr.shield) { shieldSave(G, c); return 0; }
  if (c.def.preventAll && !G.noPrevent) return 0;
  if (c.def.healOnHit && c.dmg > 0) { c.dmg = 0; c.dt = false; }
  if (!(opts && opts.soaked)) { const ad = ctrlOf(G, c).bf.find((x) => x.def.soak && x !== c && isCreature(x)); n = dmgMod(G, src, c.ctrl, n); if (ad) return damageCreature(G, ad, n, src, Object.assign({}, opts, { soaked: true })); }
  const lethalBefore = Math.max(0, tou(c) - c.dmg);
  c.dmg += n;
  c.dmgTurn = G.turn;
  if (src && src.def) src.dealtTurn = G.turn;
  if (src && src.def && src.tkw && has(src, 'deathtouch')) c.dt = true;
  if (src && src.def && src.def.sub && hasSub(src, 'Spider')) { c.spiderTurn = G.turn; c.spiderBy = src.ctrl; }
  if (G.pending) fire(G, 'dmgCreature', { src, c, n, ctrl: c.ctrl, noncombat: !(opts && opts.combat), excess: Math.max(0, n - lethalBefore) });
  if (c.def.selfHurt) { const Q = ctrlOf(G, c); Q.life -= n; emit(G, 'hit', `${c.def.name} deals ${n} damage to ${Q.name}.`, { who: Q.i, card: c.id, target: `p${Q.i}`, amount: n }); }
  return n;
}
function damagePlayer(G, Q, n, srcCard, from) {
  if (n <= 0) return;
  if (protectedPlayer(G, Q, from || (srcCard && G.players[srcCard.ctrl]))) return;
  n = dmgMod(G, srcCard, Q.i, n);
  const ad = Q.bf.find((x) => x.def.soak && isCreature(x));
  if (ad) { damageCreature(G, ad, n, srcCard, { soaked: true }); return; }
  if (srcCard && srcCard.def) srcCard.dealtTurn = G.turn;
  Q.life -= n;
  if (from && from !== Q) from.stats.damage += n;
}
function gainLife(G, P, n) {
  if (n <= 0) return;
  if (other(G, P).bf.some((c) => c.def.noOppGain)) return; // Gríma Wormtongue
  if (P.life <= 5 && P.bf.some((c) => c.def.doubleGain)) n *= 2; // Phial of Galadriel
  for (const c of P.bf) if (c.def.lifeDouble) n *= 2; // The Wind Crystal
  P.gainedTurn = (P.gainedTurn || 0) + n;
  P.life += n; P.stats.gained += n;
  if (G.pending) fire(G, 'gain', { P, n });
  for (const c of P.bf) if (c.def.onGain && c.def.onGain.length) { c.cnt += 1; emit(G, 'pump', `${c.def.name} gets a +1/+1 counter.`, { who: P.i, cards: [c.id] }); }
}
function makeToken(G, P, e) {
  return makeTokens(G, P, { p: e.p, t: e.t, colors: e.colors, sub: e.sub, kw: e.kw, artifact: e.artifact, name: e.name, legendary: e.legendary, dies: e.dies, trig: e.trig }, e.n, { quiet: true, tapped: e.tapped });
}
function makeTokenOld(G, P, e) {
  const sub = e.sub.length ? e.sub : ['Creature'];
  const id = `token-${e.p}-${e.t}-${e.colors.join('')}-${sub.join('-')}-${e.kw.join('-').replace(/ /g, '')}`.toLowerCase();
  if (!G.defs[id]) {
    const colorName = e.colors.length ? e.colors.map((c) => ({ W: 'white', U: 'blue', B: 'black', R: 'red', G: 'green' })[c]).join(' and ') : 'colorless';
    G.defs[id] = { id, name: sub.join(' '), token: true, typeLine: `Token ${e.artifact ? 'Artifact ' : ''}Creature — ${sub.join(' ')}`,
      text: e.kw.map((k) => k[0].toUpperCase() + k.slice(1)).join(', '), manaCost: '', cost: { g: 0, W: 0, U: 0, B: 0, R: 0, G: 0 }, mv: 0,
      types: e.artifact ? ['Artifact', 'Creature'] : ['Creature'], supertypes: [], sub, colors: e.colors.slice(), colorName,
      power: e.p, toughness: e.t, kw: e.kw.slice(), spell: null, etb: [], dies: [], attack: [], hit: [], landfall: [], leaves: [], onGain: [], mana: null,
      pro: null, cantBlock: false, unblockable: false, mustAttack: false, value: e.p + e.t * 0.7, role: 'creature' };
  }
  const made = [];
  for (let k = 0; k < e.n; k++) { const t = newCard(G, G.defs[id], P.i); t.token = true; P.bf.push(t); made.push(t); }
  return made;
}
function pickBasic(Q) {
  const basics = Q.library.filter((c) => isLand(c) && c.def.supertypes.includes('Basic'));
  if (!basics.length) return null;
  const want = {}, have = {};
  for (const c of Q.hand) if (!isLand(c)) for (const col of COLORS) want[col] = (want[col] || 0) + c.def.cost[col];
  for (const c of Q.bf) if (c.def.mana) for (const col of c.def.mana) have[col] = (have[col] || 0) + 1;
  let pick = null, ps = -Infinity;
  for (const c of basics) { const s = (c.def.mana || []).reduce((x, col) => x + (want[col] || 0) - (have[col] || 0) * 0.3, 0); if (s > ps) { ps = s; pick = c; } }
  return pick;
}
function putBack(G, P, n) {
  for (let k = 0; k < n && P.hand.length; k++) {
    const worst = P.hand.reduce((w, c) => (handValue(G, P, c) < handValue(G, P, w) ? c : w), P.hand[0]);
    P.hand.splice(P.hand.indexOf(worst), 1);
    P.library.push(worst);
  }
}
function discardRandom(G, P, n) {
  for (let k = 0; k < n && P.hand.length; k++) P.gy.push(P.hand.splice(G.rng.int(P.hand.length), 1)[0]);
}
function resolveEffects(G, P, effects, source, targets, ctx, X) {
  if (!effects || !effects.length || G.over) return;
  G.depth++;
  try { resolveInner(G, P, effects, source, targets, ctx, X || {}); } finally { G.depth--; }
  sba(G);
}
function resolveInner(G, P, effects, source, targets, ctx, X) {
  let tg = targets;
  if (!tg) { const ch = chooseTargets(G, P, effects, ctx, source, X); tg = ch ? ch.targets : effects.map(() => null); }
  const O = other(G, P);
  Object.assign(X, { P, O, src: source, ctx });
  const srcName = source ? source.def.name : 'It';
  const lifelinked = source && isCreature(source) && has(source, 'lifelink');
  if (ctx === 'spell') {
    const tk = effects.map((e, k) => (needsTarget(e) && tg[k] !== 'skip' ? k : -1)).filter((k) => k >= 0);
    if (tk.length && tk.every((k) => !stillLegal(G, P, effects[k], tg[k], source, X))) { emit(G, 'fizzle', `${srcName} has no legal target left and does nothing.`, { who: P.i }); X.fizzled = true; return; }
  }
  let ref = null;
  for (let k = 0; k < effects.length && !G.over; k++) {
    const e = effects[k];
    let t = tg[k];
    if (t === 'skip') { if (e.tgt) X.last = null; continue; }
    if (e.if && !e.if(G, X)) continue;
    if (needsTarget(e)) {
      if (!stillLegal(G, P, e, t, source, X)) { ref = null; X.last = null; continue; }
      if (t.cs) t = { cs: t.cs.filter((x) => (x.p != null && !x.def ? tgtOk(G, P, e, { p: x.p }, source, X) : tgtOk(G, P, e, x, source, X))) };
      if (t.c && onBf(G, t.c)) ref = { c: t.c, ctrl: t.c.ctrl, power: pow(t.c), toughness: tou(t.c) };
      X.last = t;
      (X.ts = X.ts || [])[k] = t;
      if ((ctx === 'trigger' || ctx === 'etb' || ctx === 'dies') && G.pending) for (const x of targetList(t)) fire(G, 'targeted', { c: x.c || null, p: x.c ? null : x.p, by: P, ability: true, trigger: true });
    }
    switch (e.k) {
      case 'dmg': {
        if (e.to === 'player' || (t && t.p != null)) {
          const Q = e.to === 'player' ? O : G.players[t.p];
          damagePlayer(G, Q, e.n, source, P);
          if (lifelinked) gainLife(G, P, e.n);
          emit(G, 'hit', `${srcName} deals ${e.n} damage to ${Q.name}.`, { who: P.i, card: source && source.id, target: `p${Q.i}`, amount: e.n });
        } else {
          const dealt = damageCreature(G, t.c, e.n, source);
          if (e.exileDead) t.c.exileDead = true;
          if (dealt && lifelinked) gainLife(G, P, dealt);
          emit(G, 'hit', `${srcName} deals ${e.n} damage to ${t.c.def.name}.`, { who: P.i, card: source && source.id, target: t.c.id, amount: e.n });
        }
        break;
      }
      case 'dmgAll': {
        const hit = allCreatures(G).filter((c) => (e.side === 'all' || c.ctrl !== P.i) && (!e.noKw || !has(c, e.noKw)) && (!e.hasKw || has(c, e.hasKw)));
        hit.forEach((c) => { damageCreature(G, c, e.n, source); if (e.exileDead) c.exileDead = true; if (e.tapAfter) c.tapped = true; });
        const what = !hit.length ? 'no creatures' : e.side === 'all' ? `each creature${e.hasKw ? ` with ${e.hasKw}` : e.noKw ? ` without ${e.noKw}` : ''}` : `each ${e.hasKw ? `${e.hasKw} ` : ''}creature ${O.name} controls`;
        emit(G, 'hit', `${srcName} deals ${e.n} damage to ${what}${e.tapAfter && hit.length ? ', tapping them' : ''}.`, { who: P.i, cards: hit.map((c) => c.id), amount: e.n });
        break;
      }
      case 'dmgPlayers': G.players.forEach((Q) => damagePlayer(G, Q, e.n, source, P)); emit(G, 'hit', `${srcName} deals ${e.n} damage to each player.`, { who: P.i }); break;
      case 'destroy': if (!has(t.c, 'indestructible') && !shieldSave(G, t.c)) { P.stats.kills++; dieNow(G, [t.c], 'to ' + srcName); } break;
      case 'wrath': { const all = allCreatures(G).filter((c) => !has(c, 'indestructible') && !shieldSave(G, c)); P.stats.kills += all.filter((c) => c.ctrl !== P.i).length; dieNow(G, all); if (!all.length) emit(G, 'info', 'No creatures were destroyed.', { who: P.i }); break; }
      case 'exile': { const c = t.c, Q = ctrlOf(G, c); exileCard(G, c); P.stats.kills++; emit(G, 'exile', `${c.def.name} is exiled.`, { who: P.i, cards: [c.id] }); leaves(G, [{ c, P: Q }]); break; }
      case 'tuck': { const c = t.c, Q = ctrlOf(G, c); leaveBattlefield(G, c); resetCard(c); if (!c.token) G.players[c.owner].library.unshift(c); P.stats.kills++; emit(G, 'exile', `${c.def.name} goes to the bottom of ${G.players[c.owner].name}'s library.`, { who: P.i, cards: [c.id] }); leaves(G, [{ c, P: Q }]); break; }
      case 'bounce': { const c = t.c, Q = ctrlOf(G, c); leaveBattlefield(G, c); resetCard(c); if (!c.token) G.players[c.owner].hand.push(c); emit(G, 'bounce', `${c.def.name} returns to ${G.players[c.owner].name}'s hand.`, { who: P.i, cards: [c.id] }); leaves(G, [{ c, P: Q }]); if (G.pending) fire(G, 'bounced', { c, P: Q, ctrl: Q.i, def: c.def, token: !!c.token }); break; }
      case 'tap': t.c.tapped = true; if (e.stun) t.c.stun = true; emit(G, 'tapfx', `${t.c.def.name} is tapped${e.stun ? " and won't untap next turn" : ''}.`, { who: P.i, cards: [t.c.id] }); break;
      case 'tapAll': { const cs = O.bf.filter(isCreature); cs.forEach((c) => { c.tapped = true; if (e.stun) c.stun = true; }); emit(G, 'tapfx', `${O.name}'s creatures are tapped${e.stun ? " and won't untap next turn" : ''}.`, { who: P.i, cards: cs.map((c) => c.id) }); break; }
      case 'noBlock': t.c.noBlock = true; emit(G, 'tapfx', `${t.c.def.name} can't block this turn.`, { who: P.i, cards: [t.c.id] }); break;
      case 'raise': {
        const cs = P.gy.filter(isCreature).sort((a, b) => b.def.value - a.def.value);
        if (cs.length) { const c = cs[0]; P.gy.splice(P.gy.indexOf(c), 1); P.hand.push(c); emit(G, 'raise', `${P.name} returns ${c.def.name} to hand.`, { who: P.i, cards: [c.id] }); }
        break;
      }
      case 'draw': drawCards(G, P, e.n); emit(G, 'draw', `${P.name} draws ${e.n === 1 ? 'a card' : `${e.n} cards`}.`, { who: P.i }); break;
      case 'loot': drawCards(G, P, e.n); discardChoice(G, P, e.d, 'loot'); emit(G, 'draw', `${P.name} draws ${e.n === 1 ? 'a card' : `${e.n} cards`}, then discards.`, { who: P.i }); break;
      case 'brainstorm': drawCards(G, P, 3); putBackChoice(G, P, 2); emit(G, 'draw', `${P.name} draws three cards and puts two back.`, { who: P.i }); break;
      case 'rummage': if (P.hand.length) { discardChoice(G, P, 1, 'rummage'); drawCards(G, P, 1); emit(G, 'draw', `${P.name} discards a card and draws a card.`, { who: P.i }); } break;
      case 'discardSelf': if (P.hand.length) { discardChoice(G, P, e.n, 'discard'); emit(G, 'discard', `${P.name} discards a card.`, { who: P.i }); } break;
      case 'gain': gainLife(G, P, e.n); emit(G, 'life', `${P.name} gains ${e.n} life.`, { who: P.i, target: `p${P.i}`, amount: -e.n }); break;
      case 'drain': damagePlayer(G, O, e.n, source, P); emit(G, 'life', `${O.name} loses ${e.n} life.`, { who: P.i, target: `p${O.i}`, amount: e.n }); break;
      case 'loseSelf': P.life -= e.n; emit(G, 'life', `${P.name} loses ${e.n} life.`, { who: P.i, target: `p${P.i}`, amount: e.n }); break;
      case 'discard': {
        const n = Math.min(e.n, O.hand.length);
        if (n) { if (e.random) discardRandom(G, O, n); else discardChoice(G, O, n, 'discard'); emit(G, 'discard', `${O.name} discards ${n === 1 ? 'a card' : `${n} cards`}${e.random ? ' at random' : ''}.`, { who: P.i }); }
        break;
      }
      case 'scry': scryChoice(G, P, e.n); break;
      case 'surveil': surveil(G, P, e.n); break;
      case 'edict': {
        const cs = O.bf.filter((c) => isCreature(c) && edictOk(G, O, e.f, c));
        if (cs.length) { const v = sacrificeChoice(G, O, cs); P.stats.kills++; emit(G, 'sac', `${O.name} sacrifices ${v.def.name}.`, { who: O.i, cards: [v.id] }); dieNow(G, [v]); }
        else emit(G, 'info', `${O.name} has nothing to sacrifice.`, { who: P.i });
        break;
      }
      case 'fog': G.fog = true; emit(G, 'fog', 'All combat damage this turn will be prevented.', { who: P.i }); break;
      case 'fight': case 'bite': {
        const m = t.c, o = t.c2, pm = Math.max(0, pow(m)) * (e.mult || 1), po = Math.max(0, pow(o));
        let toO = pm, excess = 0;
        if (e.trampleExcess && has(m, 'trample')) { const lethal = has(m, 'deathtouch') ? 1 : lethalTo(o); if (pm > lethal) { toO = lethal; excess = pm - lethal; } }
        const d1 = damageCreature(G, o, toO, m);
        if (d1 && has(m, 'lifelink')) gainLife(G, P, d1);
        if (excess) { damagePlayer(G, ctrlOf(G, o), excess, m, P); if (has(m, 'lifelink')) gainLife(G, P, excess); }
        if (e.k === 'fight') { const d2 = damageCreature(G, m, po, o); if (d2 && has(o, 'lifelink')) gainLife(G, O, d2); }
        emit(G, 'fight', e.k === 'fight' ? `${m.def.name} fights ${o.def.name}.` : `${m.def.name} deals ${toO} damage to ${o.def.name}${excess ? ` and ${excess} to ${O.name}` : ''}.`,
          { who: P.i, cards: [m.id, o.id], hits: [{ src: m.id, to: o.id, n: toO }].concat(e.k === 'fight' ? [{ src: o.id, to: m.id, n: po }] : []) });
        break;
      }
      case 'divided': {
        const parts = [];
        for (const x of t.plan) {
          if (x.p != null) { const Q = G.players[x.p]; damagePlayer(G, Q, x.n, source, P); if (lifelinked) gainLife(G, P, x.n); parts.push(`${x.n} to ${Q.name}`); }
          else if (targetOk(G, P, {}, x.c, source)) { const d = damageCreature(G, x.c, x.n, source); if (d && lifelinked) gainLife(G, P, d); parts.push(`${x.n} to ${x.c.def.name}`); }
        }
        emit(G, 'hit', `${srcName} deals ${parts.join(', ')}.`, { who: P.i, card: source && source.id, hits: t.plan.map((x) => ({ src: source && source.id, to: x.p != null ? `p${x.p}` : x.c.id, n: x.n })) });
        break;
      }
      case 'pump': {
        const c = t.c; c.tp += e.p; c.tt += e.t; e.kw.forEach((kk) => { if (!c.tkw.includes(kk)) c.tkw.push(kk); });
        const pt = e.p || e.t ? `${sgn(e.p)}/${sgn(e.t)}` : '';
        emit(G, 'pump', `${c.def.name} ${pt ? `gets ${pt}` : ''}${pt && e.kw.length ? ' and ' : ''}${e.kw.length ? `gains ${e.kw.join(' and ')}` : ''} until end of turn.`, { who: P.i, cards: [c.id] });
        break;
      }
      case 'pumpSelf': if (source && onBf(G, source)) { source.tp += e.p; source.tt += e.t; emit(G, 'pump', `${source.def.name} gets +${e.p}/+${e.t} until end of turn.`, { who: P.i, cards: [source.id] }); } break;
      case 'pumpTeam': { const cs = P.bf.filter(isCreature); cs.forEach((c) => { c.tp += e.p; c.tt += e.t; e.kw.forEach((kk) => { if (!c.tkw.includes(kk)) c.tkw.push(kk); }); }); emit(G, 'pump', `${P.name}'s creatures get +${e.p}/+${e.t}${e.kw.length ? ` and ${e.kw.join(' and ')}` : ''}.`, { who: P.i, cards: cs.map((c) => c.id) }); break; }
      case 'counters': t.c.cnt += e.n; emit(G, 'pump', `${t.c.def.name} gets ${e.n === 1 ? 'a +1/+1 counter' : `${e.n} +1/+1 counters`}.`, { who: P.i, cards: [t.c.id] }); break;
      case 'countersSelf': if (source && onBf(G, source)) { source.cnt += e.n; emit(G, 'pump', `${source.def.name} gets ${e.n === 1 ? 'a +1/+1 counter' : `${e.n} +1/+1 counters`}.`, { who: P.i, cards: [source.id] }); } break;
      case 'countersTeam': { const cs = P.bf.filter(isCreature); cs.forEach((c) => { c.cnt += e.n; }); emit(G, 'pump', `${P.name}'s creatures each get +1/+1 counters.`, { who: P.i, cards: cs.map((c) => c.id) }); break; }
      case 'tokens': {
        const n = e.nFn ? e.nFn(G, X) : e.n;
        if (n <= 0) break;
        const made = makeToken(G, P, Object.assign({}, e, { n }));
        const mine = made.filter((c) => c.def.types.includes('Creature'));
        if (e.attacking && G.combat) for (const c of mine) { c.attacking = true; c.tapped = true; G.combat.attackers.push(c); }
        emit(G, 'token', `${P.name} creates ${mine.length === 1 ? `a ${e.p}/${e.t} ${mine[0].def.name} token` : `${mine.length} ${e.p}/${e.t} ${mine[0].def.name} tokens`}${e.attacking && G.combat ? ' that are tapped and attacking' : e.tapped ? ', tapped' : ''}.`, { who: P.i, cards: made.map((c) => c.id) });
        X.made = made;
        break;
      }
      case 'refGain': if (ref) { const Q = G.players[ref.ctrl], n = Math.max(0, e.by === 'power' ? ref.power : ref.toughness); if (n) { gainLife(G, Q, n); emit(G, 'life', `${Q.name} gains ${n} life.`, { who: Q.i, target: `p${Q.i}`, amount: -n }); } } break;
      case 'refLand': if (ref) {
        const Q = G.players[ref.ctrl], land = pickBasic(Q);
        if (land) { Q.library.splice(Q.library.indexOf(land), 1); resetCard(land); land.sick = false; land.tapped = true; Q.bf.push(land); G.rng.shuffle(Q.library); emit(G, 'land', `${Q.name} puts ${land.def.name} onto the battlefield tapped.`, { who: Q.i, card: land.id }); }
      } break;
      case 'refLose': if (ref) { const Q = G.players[ref.ctrl]; Q.life -= e.n; emit(G, 'life', `${Q.name} loses ${e.n} life.`, { who: P.i, target: `p${Q.i}`, amount: e.n }); } break;
      case 'loseRefTou': if (ref) { const n = Math.max(0, ref.toughness); if (n) { P.life -= n; emit(G, 'life', `${P.name} loses ${n} life.`, { who: P.i, target: `p${P.i}`, amount: n }); } } break;
      case 'refToken': if (ref) { const Q = G.players[ref.ctrl], made = makeToken(G, Q, e); emit(G, 'token', `${Q.name} creates a ${e.p}/${e.t} ${made[0].def.name} token.`, { who: Q.i, cards: made.map((c) => c.id) }); } break;
      case 'guide': {
        const top = O.library[O.library.length - 1];
        if (top && isLand(top)) { O.library.pop(); O.hand.push(top); emit(G, 'reveal', `${O.name} reveals ${top.def.name} and puts it into their hand.`, { who: O.i, card: top.id }); }
        else if (top) emit(G, 'reveal', `${O.name} reveals ${top.def.name}.`, { who: O.i, card: top.id });
        break;
      }
      case 'returnOwn': {
        let pick = P.bf.filter((c) => isCreature(c) && c !== source && c.def.etb.length && c.def.value >= 5).sort((a, b) => b.def.value - a.def.value)[0];
        if (!pick) { const lands = P.bf.filter(isLand); pick = lands.find((c) => c.tapped && c.def.supertypes.includes('Basic')) || lands.find((c) => c.tapped) || lands[0] || source; }
        if (pick && onBf(G, pick)) { const Q = ctrlOf(G, pick); leaveBattlefield(G, pick); resetCard(pick); G.players[pick.owner].hand.push(pick); emit(G, 'bounce', `${P.name} returns ${pick.def.name} to hand.`, { who: P.i, cards: [pick.id] }); if (isCreature(pick)) leaves(G, [{ c: pick, P: Q }]); }
        break;
      }
      default: if (EFF[e.k]) EFF[e.k].res(G, X, e, t); break;
    }
    sba(G);
  }
}
function handValue(G, P, c) {
  const lands = P.bf.filter(isLand).length + P.hand.filter(isLand).length;
  if (isLand(c)) return lands <= 4 ? 4 : lands <= 6 ? 1.5 : 0.3;
  return c.def.value - (c.def.mv > P.bf.filter(isLand).length + 3 ? 2 : 0);
}
function discardWorst(G, P, n) {
  for (let k = 0; k < n && P.hand.length; k++) {
    const worst = P.hand.reduce((w, c) => (handValue(G, P, c) < handValue(G, P, w) ? c : w), P.hand[0]);
    P.hand.splice(P.hand.indexOf(worst), 1);
    P.gy.push(worst);
    noteDiscard(G, P, worst);
  }
}
function noteDiscard(G, P, c) {
  if (P.discT !== G.turn) { P.discT = G.turn; P.discN = 0; }
  P.discN++;
  if (G.pending) fire(G, 'discard', { P, card: c });
}
const discardsThisTurn = (G, P) => (P.discT === G.turn ? P.discN : 0);
function aiScry(G, P, n) {
  const top = P.library.splice(Math.max(0, P.library.length - n));
  const lands = P.bf.filter(isLand).length + P.hand.filter(isLand).length;
  const keep = [], bottom = [];
  for (const c of top) {
    if (isLand(c) ? lands < 5 : c.def.mv <= lands + 1) keep.push(c); else bottom.push(c);
  }
  P.library.unshift(...bottom);
  P.library.push(...keep);
  emit(G, 'scry', `${P.name} scries ${n}${bottom.length ? `, putting ${bottom.length === 1 ? 'one card' : `${bottom.length} cards`} on the bottom` : ''}.`, { who: P.i });
  if (G.pending && top.length) fire(G, 'scry', { P, n: top.length });
}

/* ============================================================
   3b. Permanents beyond creatures and lands
   Counters, attachments, continuous effects, mana abilities, triggered and activated abilities.
   ============================================================ */
const isLegendary = (c) => c.def.supertypes.includes('Legendary') || !!c.leg;
const isArtifact = (c) => c.def.types.includes('Artifact') || !!(c.tf && c.tf.artifact);
const isEnchantment = (c) => c.def.types.includes('Enchantment');
const subOf = (c) => { if (c.g && c.g.dirty) layers(c.g); return c.subX || c.def.sub; };
const NONCREATURE_SUBS = new Set(['Equipment', 'Aura', 'Saga', 'Plan', 'Vehicle', 'Treasure', 'Food', 'Clue', 'Infinity', 'Stone', 'Town', 'Forest', 'Island', 'Swamp', 'Mountain', 'Plains']);
const hasSub = (c, t) => subOf(c).includes(t) || (!!c.sfl && !!c.sfl.allTypes && !NONCREATURE_SUBS.has(t) && isCreature(c));
const orcish = (c) => hasSub(c, 'Goblin') || hasSub(c, 'Orc');
const historicDef = (d) => d.supertypes.includes('Legendary') || d.types.includes('Artifact') || d.sub.includes('Saga');
const allPerms = (G) => G.players.flatMap((P) => P.bf);
const byId = (G, id) => allPerms(G).find((c) => c.id === id) || null;
const ctrCount = (c, k) => (c.ctr && c.ctr[k]) || 0;
const dirty = (G) => { G.dirty = true; };
const ANY = ['W', 'U', 'B', 'R', 'G'];
const ringBearer = (G, P) => (P.ring && P.ring.bearer ? P.bf.find((c) => c.id === P.ring.bearer && isCreature(c)) || null : null);

// Does this permanent match a filter, seen from player P? Used by statics, triggers and counts.
// f: { types, side ('you'|'opp'), other (not src), sub, subs, legendary, nonlegendary, token, nontoken, color, attacking, powGE, tapped }
function matches(G, c, f, P, src) {
  if (!f) return true;
  const types = f.types || ['Creature'];
  if (!types.includes('any') && !types.some((t) => (t === 'Creature' ? isCreature(c) : t === 'nonland' ? !isLand(c) : t === 'nonartifact' ? !isArtifact(c) && isCreature(c) : c.def.types.includes(t) || hasSub(c, t)))) return false;
  if (f.side === 'you' && P && c.ctrl !== P.i) return false;
  if (f.side === 'opp' && P && c.ctrl === P.i) return false;
  if (f.other && c === src) return false;
  if (f.sub && !hasSub(c, f.sub)) return false;
  if (f.subs && !f.subs.some((t) => hasSub(c, t))) return false;
  if (f.legendary && !isLegendary(c)) return false;
  if (f.nonlegendary && isLegendary(c)) return false;
  if (f.token && !c.token) return false;
  if (f.nontoken && c.token) return false;
  if (f.color && !c.def.colors.includes(f.color)) return false;
  if (f.attacking && !c.attacking) return false;
  if (f.tapped && !c.tapped) return false;
  if (f.untapped && c.tapped) return false;
  if (f.powGE != null && pow(c) < f.powGE) return false;
  if (f.flying === false && has(c, 'flying')) return false;
  if (f.flying === true && !has(c, 'flying')) return false;
  if (f.fn && !f.fn(G, c, P, src)) return false;
  return true;
}
const countMine = (G, P, f, src) => P.bf.filter((c) => matches(G, c, f, P, src)).length;

// Continuous effects, recomputed whenever the board changes (G.dirty). Base power can come from the card
// (Old Man Willow), a timed effect (c.base) or the card itself; counters, statics and until-end-of-turn pumps add up.
function layers(G) {
  G.dirty = false;
  const perms = allPerms(G);
  for (const c of perms) { c.sp = 0; c.st = 0; c.skw = []; c.sfl = {}; c.sbase = null; c.ani = false; c.leg = false; c.subX = null; c.wardX = 0; }
  for (const c of perms) if ((c.def.animate && c.def.animate(G, c)) || (c.tf && c.tf.animated)) c.ani = true;
  for (const P of G.players) { const rb = P.ring && P.ring.n && P.ring.bearer ? P.bf.find((c) => c.id === P.ring.bearer) : null; if (rb) rb.leg = true; }
  for (const c of perms) if (c.def.subFn) c.subX = c.def.subFn(G, c);
  for (const src of perms) {
    if ((src.tf && src.tf.noAbil) || (src.sfl && src.sfl.noAbil)) continue;
    const P = G.players[src.ctrl];
    for (const st of src.def.statics || []) {
      if (st.cond && !st.cond(G, src, P)) continue;
      const apply = (c) => {
        c.sp += st.pFn ? st.pFn(G, src, c) : st.p || 0;
        c.st += st.tFn ? st.tFn(G, src, c) : st.t || 0;
        for (const k of st.kw || []) if (!c.skw.includes(k)) c.skw.push(k);
        if (st.flags) Object.assign(c.sfl, st.flags);
        if (st.sub) c.subX = st.sub.slice();
        if (st.addSub) { const b = c.subX || c.def.sub; c.subX = b.concat(st.addSub.filter((x) => !b.includes(x))); }
        if (st.legendary) c.leg = true;
        if (st.baseFn) { const v = st.baseFn(G, src, c); c.sbase = { p: v, t: v }; }
        if (st.ward) c.wardX = Math.max(c.wardX, st.ward);
      };
      if (st.who === 'self') { if (!st.f || matches(G, src, st.f, P, null)) apply(src); }
      else if (st.who === 'equipped' || st.who === 'enchanted') {
        const host = src.att != null ? perms.find((x) => x.id === src.att) : null;
        if (host && (!st.f || matches(G, host, st.f, P, src))) apply(host);
      } else if (st.who === 'all') { for (const c of perms) if (matches(G, c, st.f || {}, P, src)) apply(c); }
    }
  }
  for (const c of perms) if (c.def.ptFn) { const v = c.def.ptFn(G, c); c.sbase = { p: v, t: v }; }
  for (const c of perms) if (c.addSubs) { const b = c.subX || c.def.sub; c.subX = b.concat(c.addSubs.filter((x) => !b.includes(x))); }
}

/* ---------- Counters ---------- */
// +1/+1 counters live in c.cnt (as before); every other kind (stun, lore, burden, keyword counters...) in c.ctr.
function addCounters(G, c, n, kind = '+1/+1', quiet) {
  if (!c || n <= 0 || !onBf(G, c)) return 0;
  n += G.players[c.ctrl].bf.filter((x) => x.def.ctrPlus).length;
  if (kind === '+1/+1') {
    const P = G.players[c.ctrl];
    // Mauhúr: Armies, Goblins and Orcs you control get one more
    if (isCreature(c) && (hasSub(c, 'Army') || orcish(c))) n += P.bf.filter((x) => x.def.plusOne).length;
    if (isCreature(c)) for (const x of P.bf) if (x.def.ctrDouble) n *= 2; // The Earth Crystal
    c.cnt += n;
    c.plusTurn = G.turn;
  } else c.ctr[kind] = (c.ctr[kind] || 0) + n;
  dirty(G);
  if (!quiet) emit(G, 'pump', kind === '+1/+1' ? `${c.def.name} gets ${n === 1 ? 'a +1/+1 counter' : `${n} +1/+1 counters`}.` : `${c.def.name} gets ${n === 1 ? `a ${kind} counter` : `${n} ${kind} counters`}.`, { who: c.ctrl, cards: [c.id] });
  fire(G, 'counters', { c, kind, n });
  return n;
}
function removeCounters(G, c, kind, n) {
  const have = kind === '+1/+1' ? c.cnt : ctrCount(c, kind);
  const k = Math.min(have, n);
  if (k <= 0) return 0;
  if (kind === '+1/+1') c.cnt -= k; else { c.ctr[kind] -= k; if (!c.ctr[kind]) delete c.ctr[kind]; }
  dirty(G);
  return k;
}

/* ---------- Mana: lands and creatures with def.mana, plus mana abilities in def.manaAbs ----------
   A source: { c, colors, amount, conv (generic it costs to use), life, sac, once, pool, unc }.
   `purpose` says what the mana is for ({ def } for a spell, { ability } for an ability): some mana is only for some things. */
function manaSources(P, purpose) {
  const G = P.g;
  const out = [];
  if (P.pool) for (const col of ANY.concat('C')) if (P.pool[col] > 0) out.push({ pool: col, colors: [col], amount: P.pool[col] });
  const chorus = P.bf.some((x) => x.def.name === 'Elven Chorus');
  const impro = !!(purpose && purpose.def && !purpose.count && (purpose.def.improvise || P.bf.some((x) => x.def.improviseFor && x.def.improviseFor(purpose.def))));
  for (const c of P.bf) {
    const sick = isCreature(c) && c.sick && !has(c, 'haste') && !P.bf.some((x) => x.def.hasteAbilities);
    if (c.sfl && (c.sfl.noActs || c.sfl.noAbil)) continue;
    // A Realm Reborn: your other permanents tap for any color
    if (!c.tapped && !sick && P.bf.some((x) => x.def.realmReborn && x !== c) && !(isLand(c) && ctrCount(c, 'blight'))) { out.push({ c, colors: ANY, amount: 1, tap: true }); continue; }
    const boostC = isLand(c) ? P.bf.filter((x) => x.def.cBoost).length : 0;
    if (isLand(c) && ctrCount(c, 'blight')) { if (!c.tapped) out.push({ c, colors: ['C'], amount: 1 + boostC, tap: true }); continue; }
    if (c.def.mana && !c.tapped && !sick) {
      const two = c.def.mana.length === 2 && c.def.mana[0] === 'C' && c.def.mana[1] === 'C';
      const onlyC = two || (c.def.mana.length === 1 && c.def.mana[0] === 'C');
      out.push({ c, colors: two ? ['C'] : c.def.mana, amount: (two ? 2 : 1) + (onlyC ? boostC : 0), tap: true });
      continue;
    }
    if (c.def.manaAbs) {
      // One source per permanent: the best of its mana abilities for this purpose (they all tap it)
      let best = null;
      for (const ab of c.def.manaAbs) {
        if (ab.tap !== false && (c.tapped || sick)) continue;
        if (ab.once && c.manaTurn === (G ? G.turn : 0)) continue;
        if (ab.only && !(purpose && (purpose.count || ab.only(purpose)))) continue;
        if (ab.cond && !(G && ab.cond(G, c, P))) continue;
        const colors = ab.colorsFn ? ab.colorsFn(G, c, P) : ab.colors;
        if (!colors.length) continue;
        const amt = ab.amountFn ? ab.amountFn(G, c, P) : ab.amount || 1;
        if (amt <= 0) continue;
        const src = { c, colors, amount: amt, conv: ab.conv || 0, life: ab.life || 0, sac: !!ab.sac, once: !!ab.once, tap: ab.tap !== false, unc: !!ab.unc };
        const rank = (x) => x.colors.length * 2 + x.amount * 3 - x.conv * 3 - x.life - (x.sac ? 4 : 0);
        if (!best || rank(src) > rank(best)) best = src;
      }
      if (best) {
        // A converter (Surveillance Room: {1}, {T}: any color) can still just tap for its free mana ({T}: Add {C})
        if (best.conv) for (const ab of c.def.manaAbs) { if (ab.conv || ab.only || ab.life || ab.sac || ab.tap === false || ab.cond || ab.amountFn || ab.colorsFn) continue; best.free = { colors: ab.colors, amount: ab.amount || 1 }; break; }
        out.push(best); continue;
      }
    }
    if (impro && isArtifact(c) && !c.tapped) { out.push({ c, colors: ['C'], amount: 1, tap: true, impro: true }); continue; }
    if (chorus && isCreature(c) && !c.tapped && !sick && !c.def.mana) out.push({ c, colors: ANY, amount: 1, tap: true });
  }
  return out;
}
const srcRank = (x) => (x.pool ? 0 : x.sac ? 9 : x.conv ? 8 : x.life ? 7 : x.c && isLand(x.c) ? 1 : x.c && isCreature(x.c) ? 3 : 2);
function planPayment(sources, cost, purpose) {
  const anyType = purpose && purpose.anyType;
  const pips = [];
  let generic = cost.g || 0;
  if (anyType) generic += COLORS.reduce((s, col) => s + (cost[col] || 0), 0) + (cost.hy ? cost.hy.length : 0) + (cost.C || 0);
  else {
    for (const col of COLORS) for (let k = 0; k < (cost[col] || 0); k++) pips.push([col]);
    for (let k = 0; k < (cost.C || 0); k++) pips.push(['C']);
    for (const h of cost.hy || []) pips.push(h.split(''));
  }
  const avail = sources.map((s) => ({ s, left: s.amount }));
  const viaFree = (a, pip) => !pip.some((col) => a.s.colors.includes(col));
  const can = (a, pip) => pip.some((col) => a.s.colors.includes(col)) || (!!a.s.free && a.left === a.s.amount && pip.some((col) => a.s.free.colors.includes(col)));
  const able = (pip) => avail.filter((a) => can(a, pip)).length;
  pips.sort((a, b) => able(a) - able(b));
  let conv = 0;
  const assign = (i) => {
    if (i === pips.length) return true;
    const cands = avail.filter((a) => a.left > 0 && can(a, pips[i])).sort((x, y) => srcRank(x.s) - srcRank(y.s) || x.s.colors.length - y.s.colors.length);
    for (const a of cands) {
      const first = a.left === a.s.amount;
      if (viaFree(a, pips[i])) { const was = a.left; a.left = 0; if (assign(i + 1)) return true; a.left = was; continue; }
      a.left--; if (first) conv += a.s.conv || 0;
      if (assign(i + 1)) return true;
      a.left++; if (first) conv -= a.s.conv || 0;
    }
    return false;
  };
  if (!assign(0)) return null;
  // What converters consume comes from other sources; then the generic part from whatever is left, cheapest first.
  const order = (x, y) => (y.s.colors[0] === 'C') - (x.s.colors[0] === 'C') || srcRank(x.s) - srcRank(y.s) || x.s.colors.length - y.s.colors.length;
  let needConv = conv;
  for (const a of avail.filter((x) => x.left > 0 && !x.s.conv).sort(order)) { const take = Math.min(a.left, needConv); a.left -= take; needConv -= take; if (!needConv) break; }
  if (needConv > 0) return null;
  let need = generic;
  for (const a of avail.filter((x) => x.left > 0).sort(order)) {
    if (need <= 0) break;
    if (a.s.conv && a.left === a.s.amount) { if (a.s.free) { need -= Math.min(a.s.free.amount, need); a.left = 0; } continue; } // an unused converter adds only its free mana
    const take = Math.min(a.left, need); a.left -= take; need -= take;
  }
  if (need > 0) return null;
  return avail.filter((a) => a.left < a.s.amount).map((a) => ({ s: a.s, n: a.s.amount - a.left }));
}
const canPay = (P, cost, purpose) => !!planPayment(manaSources(P, purpose), cost, purpose);
function pay(P, cost, purpose) {
  const plan = planPayment(manaSources(P, purpose), cost, purpose);
  if (!plan) return false;
  const G = P.g;
  const sacs = [];
  for (const { s, n } of plan) {
    if (s.pool) { P.pool[s.pool] -= n; continue; }
    if (s.tap) s.c.tapped = true;
    if (s.once && G) s.c.manaTurn = G.turn;
    if (s.life) { P.life -= s.life; if (G) emit(G, 'life', `${P.name} pays ${s.life} life for mana.`, { who: P.i, target: `p${P.i}`, amount: s.life }); }
    if (s.unc && purpose && purpose.item) purpose.item.unc = true;
    if (s.sac) sacs.push(s.c);
  }
  if (sacs.length && G) for (const c of sacs) sacrifice(G, P, c, true);
  return true;
}
function canPayBoth(P, a, b) {
  const srcs = manaSources(P);
  const plan = planPayment(srcs, a);
  if (!plan) return false;
  const left = srcs.map((s) => { const u = plan.find((x) => x.s === s); return u ? Object.assign({}, s, { amount: s.amount - u.n }) : s; }).filter((s) => s.amount > 0);
  return !!planPayment(left, b);
}
const manaCount = (P) => manaSources(P, { count: true }).reduce((s, x) => s + Math.max(0, x.amount - (x.conv || 0)), 0);
// Mana added outside of a payment (The Bath Song, Fangorn) waits in the pool until the phase ends.
function addPool(G, P, cols) { for (const col of cols) P.pool[col] = (P.pool[col] || 0) + 1; }
function emptyPool(G, P) { const keepG = P.bf.some((c) => c.def.keepGreen); for (const col of Object.keys(P.pool)) if (!(keepG && col === 'G')) P.pool[col] = 0; }

/* ---------- Events and triggered abilities ----------
   fire() queues every ability that triggers; they resolve one at a time once whatever caused them has finished
   (flush() runs from sba() when nothing else is resolving). A trigger: { on, self, other, you, opp, f, cond, once, eff | run, may } */
function trigsOf(G, c) { return (c.tf && c.tf.noAbil) || (c.sfl && c.sfl.noAbil) ? [] : (c.def.trig || []).concat(c.xtrig || []); }
function fire(G, ev, data) {
  if (G.over || !G.pending) return;
  data = data || {};
  const order = [G.players[G.active], G.players[1 - G.active]];
  for (const Q of order) {
    for (const src of Q.bf.slice()) scanTriggers(G, Q, src, ev, data, trigsOf(G, src), 'bf');
    for (const src of Q.gy.slice()) if (src.def.gyTrig) scanTriggers(G, Q, src, ev, data, src.def.gyTrig, 'gy');
    for (const em of Q.emblems || []) scanTriggers(G, Q, em, ev, data, em.def.trig, 'emblem');
    ringTriggers(G, Q, ev, data);
  }
  // "Leaves" and "dies" abilities of the card that just left look back at it
  if ((ev === 'die' || ev === 'leave' || ev === 'toGy') && data.c && data.P && !data.P.bf.includes(data.c)) scanTriggers(G, data.P, data.c, ev, data, (data.lki || trigsOf(G, data.c)).filter((t) => t.self), 'lki');
}
function trigMatch(G, Q, src, t, d) {
  const c = d.c;
  if (t.self && c !== src) return false;
  if (t.other && c === src) return false;
  if (t.you && !(c ? (d.ctrl != null ? d.ctrl : c.ctrl) === Q.i : d.P === Q)) return false;
  if (t.opp && !(c ? (d.ctrl != null ? d.ctrl : c.ctrl) !== Q.i : d.P && d.P !== Q)) return false;
  if (t.hostOnly && !(c && src.att === c.id)) return false;
  if (t.f && !(c && matches(G, c, t.f, Q, src))) return false;
  if (t.cond && !t.cond(G, src, d, Q)) return false;
  return true;
}
function scanTriggers(G, Q, src, ev, data, list, zone) {
  list.forEach((t, k) => {
    if (t.on !== ev) return;
    if (zone === 'lki' && !t.self) return;
    if (zone === 'bf' && (ev === 'die' || ev === 'leave' || ev === 'toGy') && t.self && !Q.bf.includes(src)) return;
    if (!trigMatch(G, Q, src, t, data)) return;
    if (t.once) { src.onceT = src.onceT || {}; if (src.onceT[k] === G.turn) return; src.onceT[k] = G.turn; }
    const n = (doubles(G, Q, ev, data) ? 2 : 1) + (zone === 'bf' ? extraTrigs(G, Q, src, ev, data) : 0);
    for (let i = 0; i < n; i++) G.pending.push({ src, P: Q, t, k, ev: data });
  });
}
function extraTrigs(G, Q, src, ev, d) {
  let n = 0;
  const host = src.att != null ? byId(G, src.att) : null;
  const bearer = isCreature(src) ? src : host;
  if (bearer && bearer.def.cloudEcho && equipmentOn(G, bearer).length && (src === bearer || src.att === bearer.id)) n++;
  if (ev === 'die' && isCreature(src) && equipmentOn(G, src).some((x) => x.def.masamune)) n++;
  if ((ev === 'enter' || ev === 'landfall') && d.c && d.c.ctrl === Q.i && (isLand(d.c) || hasSub(d.c, 'Bird'))) n += Q.bf.filter((x) => x.def.chocoEcho).length;
  return n;
}
// Gandalf the White: legendary permanents and artifacts entering or leaving trigger your abilities twice
function doubles(G, Q, ev, d) {
  if (!['enter', 'leave', 'die'].includes(ev) || !d.c) return false;
  if (!(d.c.def.supertypes.includes('Legendary') || isArtifact(d.c))) return false;
  return Q.bf.some((x) => x.def.doubler);
}
function flush(G) {
  if (G.flushing || !G.pending.length) return;
  G.flushing = true;
  try {
    for (let guard = 0; G.pending.length && !G.over && guard < 300; guard++) {
      const it = G.pending.shift();
      resolveTrigger(G, it);
      sbaCore(G);
    }
    if (G.pending.length > 0 && !G.over) G.pending.length = 0; // a runaway loop: stop it
  } finally { G.flushing = false; }
}
function resolveTrigger(G, it) {
  const { src, P, t } = it;
  if (t.check && !t.check(G, src, it.ev, P)) return;
  const X = { P, O: other(G, P), src, ev: it.ev, trig: t, k: it.k };
  if (t.counted) { src.resN = src.resN || {}; const r = src.resN[it.k]; src.resN[it.k] = r && r.turn === G.turn ? { turn: G.turn, n: r.n + 1 } : { turn: G.turn, n: 1 }; X.nth = src.resN[it.k].n; }
  if (t.may && !yesNo(G, P, src, t.mayLabel || t.label || `Use ${src.def.name}'s ability?`, t.mayAi ? t.mayAi(G, X) : true)) return;
  G.resolving = src.id;
  const echo = t.chapter || !src.def ? 0 : takeEcho(G, P, src);
  if (t.chapter) src.chapterBusy = (src.chapterBusy || 0) + 1;
  try {
    for (let r = 0; r <= echo && !G.over; r++) {
      if (r) emit(G, 'copy', `${src.def.name}'s triggered ability is copied.`, { who: P.i, card: src.id });
      if (t.run) t.run(G, X);
      else resolveWithTargets(G, P, src, t.eff, X, 'trigger');
    }
  } finally { if (t.chapter) src.chapterBusy--; }
  G.resolving = 0;
  if (t.final) fire(G, 'sagaFinal', { P, c: src });
}
// Choose targets (the AI scores them, a human is asked) and resolve a list of effects.
function resolveWithTargets(G, P, src, eff, X, ctx, preset) {
  if (!eff || !eff.length) return;
  let tg = preset || null;
  if (!tg && isHuman(G, P) && eff.some(needsTarget)) tg = askTargets(G, P, src, eff, X);
  resolveEffects(G, P, eff, src, tg, ctx || 'trigger', X);
}

/* ---------- The Ring tempts you ----------
   Each time: choose a creature you control as your Ring-bearer (it becomes legendary), and the Ring gains its next ability. */
function tempt(G, P) {
  P.ring.n++;
  const cands = P.bf.filter(isCreature);
  let pick = null;
  if (cands.length) {
    if (isHuman(G, P)) pick = cands.length === 1 ? cands[0] : pickCards(G, { type: 'choose', reason: 'bearer', n: 1, min: 1, max: 1, zone: 'battlefield', cards: cands.map((c) => c.id), level: Math.min(4, P.ring.n) }, cands, 1)[0];
    else pick = aiBearer(G, P, cands);
  }
  const prev = P.ring.bearer;
  P.ring.bearer = pick ? pick.id : null;
  dirty(G);
  const lvl = Math.min(4, P.ring.n);
  emit(G, 'ring', `The Ring tempts ${P.name}${pick ? `: ${pick.def.name} is the Ring-bearer` : ''}. ${RING_TEXT[lvl - 1]}`, { who: P.i, card: pick ? pick.id : undefined, level: lvl, prev });
  fire(G, 'tempt', { P, c: pick });
  if (pick) fire(G, 'bearer', { P, c: pick });
}
const RING_TEXT = [
  "Its bearer is legendary and can't be blocked by creatures with greater power.",
  'Whenever its bearer attacks, draw a card, then discard a card.',
  'Whenever its bearer becomes blocked by a creature, that creature is sacrificed at end of combat.',
  'Whenever its bearer deals combat damage to a player, each opponent loses 3 life.',
];
function aiBearer(G, P, cands) {
  const O = other(G, P);
  const score = (c) => {
    let s = cv(c) * 0.3;
    const evasive = !O.bf.some((b) => isCreature(b) && canBlock(G, b, c) && pow(b) <= pow(c));
    if (evasive) s += 2.5;
    if (c.def.bearerBonus) s += c.def.bearerBonus;
    if (has(c, 'defender') || c.def.cantBlock) s -= 2;
    if (c.token && !hasSub(c, 'Army')) s -= 0.5;
    if (c.ctr && c.ctr.stun) s -= 1;
    return s;
  };
  return cands.slice().sort((a, b) => score(b) - score(a) || a.id - b.id)[0];
}
// The Ring's abilities work like triggered abilities of an emblem its owner has
function ringTriggers(G, Q, ev, d) {
  const n = Q.ring ? Q.ring.n : 0;
  if (!n) return;
  const rb = ringBearer(G, Q);
  if (!rb) return;
  if (ev === 'attack' && d.c === rb && n >= 2) G.pending.push({ src: rb, P: Q, t: RING_LOOT, ev: d });
  if (ev === 'blocked' && d.c === rb && n >= 3) for (const b of d.by) G.delayed.push({ when: 'combatEnd', run: (GG) => { if (onBf(GG, b)) { const BQ = GG.players[b.ctrl]; emit(GG, 'sac', `${BQ.name} sacrifices ${b.def.name}, which blocked the Ring-bearer.`, { who: BQ.i, cards: [b.id] }); sacrifice(GG, BQ, b); } } });
  if (ev === 'hitPlayer' && d.c === rb && n >= 4) G.pending.push({ src: rb, P: Q, t: RING_DRAIN, ev: d });
}
const RING_LOOT = { on: 'attack', label: 'The Ring', run: (G, X) => { drawCards(G, X.P, 1); discardChoice(G, X.P, 1, 'loot'); emit(G, 'draw', `The Ring: ${X.P.name} draws a card, then discards a card.`, { who: X.P.i }); } };
const RING_DRAIN = { on: 'hitPlayer', label: 'The Ring', run: (G, X) => { const O = X.O; O.life -= 3; emit(G, 'life', `The Ring: ${O.name} loses 3 life.`, { who: X.P.i, target: `p${O.i}`, amount: 3 }); } };

/* ---------- Amass Orcs N: put N +1/+1 counters on an Army you control, making a 0/0 Orc Army first if needed ---------- */
function amass(G, P, n) {
  let army = P.bf.filter((c) => isCreature(c) && hasSub(c, 'Army')).sort((a, b) => pow(b) - pow(a))[0];
  if (!army) {
    army = makeTokens(G, P, ORC_ARMY, 1, { quiet: true })[0];
    emit(G, 'token', `${P.name} creates a 0/0 Orc Army token.`, { who: P.i, cards: [army.id] });
  }
  if (!army.def.sub.includes('Orc')) army.orc = true;
  if (n > 0) addCounters(G, army, n, '+1/+1', true);
  emit(G, 'pump', `${P.name} amasses Orcs ${n}: the Army is ${pow(army)}/${tou(army)}.`, { who: P.i, cards: [army.id] });
  return army;
}
const ORC_ARMY = { p: 0, t: 0, colors: ['B'], sub: ['Orc', 'Army'], kw: [] };
const HERO_TOKEN = { id: 'fin-hero-1-1', name: 'Hero', p: 1, t: 1, colors: [], sub: ['Hero'], kw: [] };

/* ---------- Tokens ---------- */
const FOOD = { name: 'Food', art: true, sub: ['Food'], colors: [], text: '{2}, {T}, Sacrifice this token: You gain 3 life.',
  acts: [{ cost: { m: { g: 2, W: 0, U: 0, B: 0, R: 0, G: 0 }, tap: true, sacSelf: true }, eff: [{ k: 'gain', n: 3 }], label: 'Gain 3 life', food: true }] };
const TREASURE = { name: 'Treasure', art: true, sub: ['Treasure'], colors: [], text: '{T}, Sacrifice this token: Add one mana of any color.',
  manaAbs: [{ colors: ANY, sac: true }] };
const CLUE = { id: 'token-clue', name: 'Clue', art: true, sub: ['Clue'], colors: [], text: '{2}, Sacrifice this token: Draw a card.',
  acts: [{ cost: { m: { g: 2, W: 0, U: 0, B: 0, R: 0, G: 0 }, sacSelf: true }, eff: [{ k: 'draw', n: 1 }], label: 'Draw a card', food: true, when: ['main2', 'end'] }] };
// Investigate: create a Clue token
function investigate(G, P, n = 1) {
  if (n <= 0) return [];
  const made = makeTokens(G, P, CLUE, n, { quiet: true });
  emit(G, 'token', `${P.name} investigates${n > 1 ? ` ${n} times` : ''}.`, { who: P.i, cards: made.map((c) => c.id) });
  if (G.pending) fire(G, 'investigate', { P, n });
  return made;
}
// Connive: draw a card, then discard a card; a nonland card discarded puts a +1/+1 counter on the creature
function connive(G, P, c, n = 1) {
  if (!P || G.over) return 0;
  const extra = P.bf.filter((x) => x.def.conniveDraw).length; // Leader, Agent of Hydra: draw first
  const name = c && c.def ? c.def.name : 'It';
  if (extra) { drawCards(G, P, extra); emit(G, 'draw', `${P.name} draws ${extra === 1 ? 'a card' : `${extra} cards`} first.`, { who: P.i }); }
  drawCards(G, P, n);
  const before = new Set(P.gy);
  discardChoice(G, P, n, 'connive');
  const gone = P.gy.filter((x) => !before.has(x));
  const nonland = gone.filter((x) => !x.def.types.includes('Land')).length;
  emit(G, 'draw', `${name} connives: ${P.name} draws ${n === 1 ? 'a card' : `${n} cards`}${gone.length ? ` and discards ${gone.map((x) => x.def.name).join(', ')}` : ''}.`, { who: P.i, cards: gone.map((x) => x.id) });
  if (nonland && c && onBf(G, c)) addCounters(G, c, nonland);
  if (G.pending) fire(G, 'connive', { P, c, nonland });
  dirty(G);
  return nonland;
}
// Shield counters: if the permanent would be dealt damage or destroyed, remove a shield counter instead
function shieldSave(G, c) {
  if (!c || !c.ctr || !c.ctr.shield) return false;
  removeCounters(G, c, 'shield', 1);
  emit(G, 'info', `A shield counter is removed from ${c.def.name} instead.`, { who: c.ctrl, cards: [c.id] });
  return true;
}
// spec: { p, t, colors, sub, kw, name, art (non-creature artifact), legendary, text, acts, manaAbs, trig, statics }
function tokenDef(G, spec) {
  const creature = !spec.art;
  const sub = spec.sub && spec.sub.length ? spec.sub : ['Creature'];
  const id = spec.id || `token-${spec.name ? slug(spec.name) : ''}-${creature ? `${spec.p}-${spec.t}-` : ''}${(spec.colors || []).join('')}-${sub.join('-')}-${(spec.kw || []).join('-').replace(/ /g, '')}${spec.artifact ? '-art' : ''}`.toLowerCase();
  if (!G.defs[id]) {
    const colors = spec.colors || [];
    const colorName = colors.length ? colors.map((c) => ({ W: 'white', U: 'blue', B: 'black', R: 'red', G: 'green' })[c]).join(' and ') : 'colorless';
    const types = creature ? (spec.artifact ? ['Artifact', 'Creature'] : ['Creature']) : ['Artifact'];
    G.defs[id] = { id, name: spec.name || sub.join(' '), token: true, typeLine: `${spec.legendary ? 'Legendary ' : ''}Token ${types.join(' ')} — ${sub.join(' ')}`,
      text: spec.text != null ? spec.text : (spec.kw || []).map((k) => k[0].toUpperCase() + k.slice(1)).join(', '), manaCost: '', cost: genericCost(0), mv: 0,
      types, supertypes: spec.legendary ? ['Legendary'] : [], sub, colors: colors.slice(), colorName,
      power: creature ? spec.p : 0, toughness: creature ? spec.t : 0, kw: (spec.kw || []).slice(), spell: null, etb: [], dies: spec.dies || [], attack: [], hit: [], landfall: [], leaves: [], onGain: [], mana: null,
      pro: null, cantBlock: false, unblockable: false, mustAttack: false, trig: spec.trig || [], acts: spec.acts || [], statics: spec.statics || [], manaAbs: spec.manaAbs || null,
      value: creature ? spec.p + spec.t * 0.7 : spec.value || 1, role: creature ? 'creature' : 'other', ward: 0 };
    if (spec.defX) Object.assign(G.defs[id], spec.defX);
  }
  return G.defs[id];
}
// Create tokens; Peregrin Took adds a Food to any batch you create. Returns the new permanents.
// What entered the battlefield under each player's control this turn (Avengers Assemble!)
function noteEnter(G, P, c) { if (P.entTurn !== G.turn) { P.entTurn = G.turn; P.entered = []; } P.entered.push(c); }
const enteredThisTurn = (G, P) => (P.entTurn === G.turn ? P.entered : []);
const attackedThisTurn = (G, P) => (P.atkTurn === G.turn ? P.atkLog : []);
function makeTokens(G, P, spec, n, opts = {}) {
  const def = spec.id && G.defs[spec.id] && !spec.p && spec.p !== 0 ? G.defs[spec.id] : tokenDef(G, spec);
  const made = [];
  for (let k = 0; k < n; k++) {
    const t = newCard(G, def, P.i);
    t.token = true;
    t.inTurn = G.turn;
    if (opts.tapped) t.tapped = true;
    if (opts.copyOf) t.copyOf = opts.copyOf;
    P.bf.push(t);
    noteEnter(G, P, t);
    made.push(t);
  }
  if (!opts.noExtra && n > 0) {
    const took = P.bf.filter((c) => c.def.tokenFood).length;
    if (took) { const extra = makeTokens(G, P, FOOD, took, { noExtra: true, quiet: true }); made.push(...extra); if (!opts.quiet) emit(G, 'token', `${P.name} also creates ${took === 1 ? 'a Food token' : `${took} Food tokens`} (Peregrin Took).`, { who: P.i, cards: extra.map((c) => c.id) }); }
    for (const src of P.bf.slice()) if (src.def.tokenExtra && !made.includes(src)) { const extra = makeTokens(G, P, src.def.tokenExtra, 1, { noExtra: true, quiet: true }); made.push(...extra); emit(G, 'token', `${P.name} also creates a ${extra[0].def.name} token (${src.def.name}).`, { who: P.i, cards: extra.map((c) => c.id) }); }
  }
  dirty(G);
  for (const c of made) fire(G, 'enter', { c, P });
  for (const c of made) fire(G, 'token', { P, c });
  return made;
}

/* ---------- Leaving the battlefield in all the new ways ---------- */
// Sacrifice: a cost or an effect. Creatures die; anything else goes to its owner's graveyard (tokens vanish).
function sacrifice(G, P, c, quiet) {
  if (!onBf(G, c)) return;
  G.sacThisTurn = (G.sacThisTurn || 0) + 1;
  if (c.token) P.tokenSacs = (P.tokenSacs || 0) + 1;
  fire(G, 'sac', { P, c, token: c.token });
  if (isCreature(c)) dieNow(G, [c], quiet ? undefined : 'as a sacrifice');
  else putInGraveyard(G, c);
}
// A noncreature permanent put into the graveyard from the battlefield (destroyed or sacrificed)
function putInGraveyard(G, c) {
  const Q = ctrlOf(G, c);
  if (ctrCount(c, 'finality')) { exilePermanent(G, Q, c); return; }
  const lki = trigsOf(G, c);
  const d = c.def;
  toGraveyard(G, c);
  fire(G, 'toGy', { c, P: Q, ctrl: Q.i, lki });
  leaves(G, [{ c, P: Q, def: d }]);
}
function destroyPermanent(G, P, c, why) {
  if (!onBf(G, c) || has(c, 'indestructible')) return false;
  if (shieldSave(G, c)) return false;
  if (isCreature(c)) { if (c.ctrl !== P.i) P.stats.kills++; dieNow(G, [c], why); }
  else { emit(G, 'die', `${c.def.name} is destroyed.`, { who: P.i, cards: [c.id] }); putInGraveyard(G, c); }
  return true;
}
function bounceCard(G, P, c) {
  const Q = ctrlOf(G, c);
  const d = c.def;
  leaveBattlefield(G, c); resetCard(c);
  if (!c.token) G.players[c.owner].hand.push(c);
  meldOut(G, c, 'hand');
  emit(G, 'bounce', `${d.name} returns to ${G.players[c.owner].name}'s hand.`, { who: P.i, cards: [c.id] });
  leaves(G, [{ c, P: Q, def: d }]);
  if (G.pending) fire(G, 'bounced', { c, P: Q, ctrl: Q.i, def: d, token: !!c.token });
}
function exilePermanent(G, P, c) {
  const Q = ctrlOf(G, c);
  const d = c.def;
  exileCard(G, c);
  emit(G, 'exile', `${d.name} is exiled.`, { who: P.i, cards: [c.id] });
  leaves(G, [{ c, P: Q, def: d }]);
}
// Put a card from a graveyard, exile, hand or library onto the battlefield under P's control
function putOntoBattlefield(G, P, card, opts = {}) {
  for (const Q of G.players) for (const z of [Q.gy, Q.exile, Q.hand, Q.library]) { const k = z.indexOf(card); if (k >= 0) { z.splice(k, 1); if (z === Q.gy && G.pending) fire(G, 'leaveGy', { P: Q, card }); } }
  enterBattlefield(G, P, card, null, opts);
  if (opts.tapped && !(isLand(card) && P.bf.some((x) => x.def.landsUntapped))) card.tapped = true;
  if (opts.attacking && G.combat) { card.attacking = true; card.tapped = true; G.combat.attackers.push(card); }
}
function removeFromZones(G, card) { for (const Q of G.players) for (const z of [Q.gy, Q.exile, Q.hand, Q.library, Q.command]) { const k = z.indexOf(card); if (k >= 0) { z.splice(k, 1); if (z === Q.gy && G.pending) fire(G, 'leaveGy', { P: Q, card }); return true; } } return false; }

/* ---------- Control changes ---------- */
// dur: 'eot' (until end of turn), 'src' (while P controls src), or 'perm'
function gainControl(G, P, c, dur, src) {
  if (!onBf(G, c) || c.ctrl === P.i) { if (onBf(G, c) && dur !== 'perm') c.ctrlFx = { to: P.i, from: c.ctrl, dur, src: src ? src.id : null, srcCtrl: src ? src.ctrl : null }; return; }
  const from = ctrlOf(G, c);
  from.bf.splice(from.bf.indexOf(c), 1);
  c.ctrlFx = dur === 'perm' ? null : { to: P.i, from: from.i, dur, src: src ? src.id : null, srcCtrl: src ? src.ctrl : null };
  c.ctrl = P.i;
  c.sick = true;
  c.attacking = false; c.blocking = 0; c.blocked = false; c.blockedBy = [];
  P.bf.push(c);
  if (from.ring && from.ring.bearer === c.id) from.ring.bearer = null;
  dirty(G);
  emit(G, 'steal', `${P.name} gains control of ${c.def.name}${dur === 'eot' ? ' until end of turn' : ''}.`, { who: P.i, cards: [c.id] });
  if (G.pending) fire(G, 'ctrlChange', { c, from: from.i, to: P.i, P: from });
}
function returnControl(G, c) {
  const fx = c.ctrlFx;
  c.ctrlFx = null;
  if (!fx || !onBf(G, c) || c.ctrl === fx.from) return;
  const P = ctrlOf(G, c), Q = G.players[fx.from];
  P.bf.splice(P.bf.indexOf(c), 1);
  c.ctrl = Q.i; c.attacking = false; c.blocking = 0; c.blocked = false; c.blockedBy = [];
  Q.bf.push(c);
  if (P.ring && P.ring.bearer === c.id) P.ring.bearer = null;
  dirty(G);
  emit(G, 'steal', `${c.def.name} returns to ${Q.name}.`, { who: Q.i, cards: [c.id] });
  if (G.pending) fire(G, 'ctrlChange', { c, from: P.i, to: Q.i, P });
}
function checkControl(G) {
  for (const c of allPerms(G)) {
    const fx = c.ctrlFx;
    if (!fx || fx.dur !== 'src') continue;
    const s = byId(G, fx.src);
    if (!s || s.ctrl !== fx.srcCtrl) returnControl(G, c);
  }
}

/* ---------- Attachments ---------- */
function attach(G, eq, host, quiet) {
  if (!onBf(G, eq) || !host || !onBf(G, host) || !isCreature(host)) return false;
  eq.att = host.id;
  dirty(G);
  if (!quiet) emit(G, 'attach', `${eq.def.name} is attached to ${host.def.name}.`, { who: eq.ctrl, cards: [eq.id, host.id] });
  return true;
}
const attachedTo = (G, host) => allPerms(G).filter((x) => x.att === host.id);
const equipmentOn = (G, host) => attachedTo(G, host).filter((x) => x.def.acts.some((a) => a.equip));
const isEquipped = (G, host) => equipmentOn(G, host).length > 0;

/* ---------- Library and graveyard helpers ---------- */
function mill(G, Q, n) {
  if (n > 0) for (const c of other(G, Q).bf) if (c.def.millPlus) n += c.def.millPlus; // The Water Crystal
  const cards = [];
  for (let k = 0; k < n && Q.library.length; k++) { const c = Q.library.pop(); Q.gy.push(c); cards.push(c); }
  if (cards.length && G.pending) fire(G, 'milled', { P: Q, cards });
  if (cards.length) { dirty(G); emit(G, 'mill', `${Q.name} mills ${cards.length === 1 ? 'a card' : `${cards.length} cards`}${cards.length <= 4 ? `: ${cards.map((c) => c.def.name).join(', ')}` : ''}.`, { who: Q.i, cards: cards.map((c) => c.id) }); }
  return cards;
}
// Search P's library for up to n cards matching pred; to: 'hand' | 'bf' | 'bfTapped' | 'top'. Shuffles after.
function searchLibrary(G, P, pred, n, to, why) {
  const pool = P.library.filter((c) => pred(c));
  let chosen = [];
  if (pool.length) {
    if (isHuman(G, P)) {
      const shown = uniqueByName(pool);
      chosen = pickCards(G, { type: 'choose', reason: 'search', n, min: 0, max: Math.min(n, pool.length), zone: 'library', cards: shown.map((c) => c.id), label: why }, shown, null).slice(0, n);
      if (n > 1 && chosen.length < Math.min(n, pool.length)) { // more copies of the same name
        for (const c of pool) if (chosen.length < n && !chosen.includes(c) && chosen.some((x) => x.def.name === c.def.name)) chosen.push(c);
      }
    } else chosen = aiSearchPick(G, P, pool, n, to);
  }
  for (const c of chosen) {
    P.library.splice(P.library.indexOf(c), 1);
    if (to === 'hand') P.hand.push(c);
    else if (to === 'top') P.library.push(c);
    else putOntoBattlefield(G, P, c, { tapped: to === 'bfTapped' });
  }
  G.rng.shuffle(P.library);
  if (to === 'top' && chosen.length) { const c = chosen[0]; P.library.splice(P.library.indexOf(c), 1); P.library.push(c); }
  dirty(G);
  return chosen;
}
const uniqueByName = (cs) => { const seen = new Set(); return cs.filter((c) => (seen.has(c.def.name) ? false : seen.add(c.def.name))); };
function aiSearchPick(G, P, pool, n, to) {
  const lands = pool.filter(isLand);
  if (lands.length === pool.length) { const out = []; for (let k = 0; k < n; k++) { const pick = pickBasicFrom(P, lands.filter((c) => !out.includes(c))); if (pick) out.push(pick); } return out; }
  return pool.slice().sort((a, b) => b.def.value - a.def.value).slice(0, n);
}
function pickBasicFrom(Q, basics) {
  if (!basics.length) return null;
  const want = {}, have = {};
  for (const c of Q.hand) if (!isLand(c)) for (const col of COLORS) want[col] = (want[col] || 0) + c.def.cost[col];
  for (const c of Q.bf) if (c.def.mana) for (const col of c.def.mana) have[col] = (have[col] || 0) + 1;
  let pick = null, ps = -Infinity;
  for (const c of basics) { const s = (c.def.mana || []).reduce((x, col) => x + (want[col] || 0) - (have[col] || 0) * 0.3, 0); if (s > ps) { ps = s; pick = c; } }
  return pick;
}

/* ---------- Choices a player makes while something resolves ---------- */
function yesNo(G, P, src, label, aiAnswer) {
  if (!isHuman(G, P)) return !!aiAnswer;
  return !!ask(G, { type: 'yesno', src: src ? src.id : 0, label }).yes;
}
// Pick one of several labelled options. ai: index the AI would take.
function chooseMode(G, P, src, label, options, aiPick) {
  if (!isHuman(G, P)) return aiPick;
  const a = ask(G, { type: 'mode', src: src ? src.id : 0, label, options });
  const k = a.pick != null ? +a.pick : 0;
  return k >= 0 && k < options.length ? k : 0;
}
function chooseNumber(G, P, src, label, min, max, aiN) {
  if (max <= min) return min;
  if (!isHuman(G, P)) return Math.max(min, Math.min(max, aiN));
  const a = ask(G, { type: 'number', src: src ? src.id : 0, label, min, max });
  const n = Math.floor(+a.n);
  return isNaN(n) ? min : Math.max(min, Math.min(max, n));
}
// A human picks targets for a triggered or activated ability while it resolves
function askTargets(G, P, src, eff, X) {
  const specs = [];
  eff.forEach((e, k) => { if (!needsTarget(e) || e.k === 'divided') return; const sp = targetSpec(G, P, e, k, src, X); if (sp) specs.push(sp); });
  if (!specs.length) return null;
  const a = ask(G, { type: 'target', src: src ? src.id : 0, label: src ? src.def.name : '', specs });
  const out = eff.map(() => null);
  (a.t || []).forEach((r, k) => { if (k < out.length) out[k] = fromRef(G, r); });
  // anything missing or no longer legal: pick for them like the AI would (keeps replays in step)
  const auto = chooseTargets(G, P, eff, 'trigger', src, X);
  return eff.map((e, k) => (out[k] === 'skip' ? 'skip' : out[k] && stillLegal(G, P, e, out[k], src, X) ? out[k] : needsTarget(e) && (e.may || (e.tgt && e.tgt.min === 0)) && !out[k] ? 'skip' : auto ? auto.targets[k] : null));
}

/* ---------- Targets for the newer effects: e.tgt = { what: 'perm'|'player'|'gy', f, n, min, other, mine, theirs } ----------
   Old effects keep their own rules (creatures and players). A target ref is {c}, {cs: [...]}, {p} or 'skip'. */
function pv(G, c) {
  // What a permanent is worth to its controller, for removal and stealing decisions
  if (isCreature(c)) return cv(c);
  if (isLand(c)) return 1.2 + (c.def.acts.length ? 0.8 : 0) + (c.def.supertypes.includes('Legendary') ? 0.4 : 0);
  if (c.token) return hasSub(c, 'Food') ? 0.9 : hasSub(c, 'Treasure') ? 0.8 : hasSub(c, 'Clue') ? 0.9 : 1;
  const host = c.att != null ? byId(G, c.att) : null;
  if (c.def.aura && host) { const curse = host.ctrl !== c.ctrl; return curse ? 0.6 : 1.2 + c.def.value * 0.4; }
  return Math.max(1, (c.def.value || 2) * 0.7 + (c.ctr ? Object.values(c.ctr).reduce((s, n) => s + n, 0) * 0.3 : 0));
}
function tgtOk(G, P, e, x, src, X) {
  const T = e.tgt;
  if (!x) return false;
  if (x.p != null && !x.def) {
    if (T.what !== 'player' && T.what !== 'any') return false;
    const Q = G.players[x.p];
    if (!Q || Q.lost) return false;
    if (T.f && T.f.side === 'opp' && Q === P) return false;
    if (T.f && T.f.side === 'you' && Q !== P) return false;
    return !protectedPlayer(G, Q, P) && !hexP(G, Q, P);
  }
  if (T.what === 'player') return false;
  if (T.what === 'gy') {
    const zone = G.players.find((Q) => Q.gy.includes(x));
    if (!zone) return false;
    if (T.mine && zone !== P) return false;
    if (T.theirs && zone === P) return false;
    return (!T.f || defMatches(x.def, T.f, G, x)) && (!T.fn || T.fn(G, P, x, src, X));
  }
  if (T.what === 'spell') return G.stack.some((s) => s.card === x) && (!T.fn || T.fn(G, P, x));
  if (!onBf(G, x)) return false;
  if (T.other && x === src) return false;
  if (!matches(G, x, T.f || {}, P, src)) return false;
  if (x.ctrl !== P.i && (has(x, 'hexproof') || x.tf.hexproof)) return false;
  if (src && protectedFrom(x, src)) return false;
  if (T.fn && !T.fn(G, P, x, src, X)) return false;
  return true;
}
// Does a card definition (in a graveyard or library) fit a filter?
function defMatches(d, f, G, card) {
  if (f.types && !f.types.includes('any') && !f.types.some((t) => (t === 'permanent' ? !d.types.includes('Instant') && !d.types.includes('Sorcery') : t === 'historic' ? historicDef(d) : d.types.includes(t) || d.sub.includes(t)))) return false;
  if (f.legendary && !d.supertypes.includes('Legendary')) return false;
  if (f.mvLE != null && d.mv > f.mvLE) return false;
  if (f.fn && !f.fn(d, card, G)) return false;
  return true;
}
function tgtCands(G, P, e, src, X) {
  const T = e.tgt;
  const out = [];
  if (T.what === 'player' || T.what === 'any') for (const Q of G.players) { const x = { p: Q.i }; if (tgtOk(G, P, e, x, src, X)) out.push(x); }
  if (T.what === 'gy') for (const Q of G.players) for (const c of Q.gy) if (tgtOk(G, P, e, c, src, X)) out.push(c);
  if (T.what === 'spell') for (const s of G.stack) if (tgtOk(G, P, e, s.card, src, X)) out.push(s.card);
  if (!T.what || T.what === 'perm' || T.what === 'any') for (const c of allPerms(G)) if (tgtOk(G, P, e, c, src, X)) out.push(c);
  return out;
}
const refFor = (x) => (x.p != null && !x.def ? { p: x.p } : { c: x });
const hexP = (G, Q, P) => !!(Q && P && Q !== P && Q.bf.some((c) => c.def.playerHex && c.def.playerHex(G, c)));
function protectedPlayer(G, Q, by) { return !!(by && by !== Q && ((Q.protUntil && G.turn < Q.protUntil) || Q.bf.some((c) => c.def.playerPro))); }

/* ---------- New effect kinds ----------
   EFF[k] = { res(G, X, e, t), val(G, P, e, target, X, ctx) (per target, for the AI), score(G, P, e, X, ctx) (untargeted),
              value(e) (deck building), label(e) (what a human is asked to target) }
   X is the resolution context: { P, O, src, ev, x (X), last (previous target), army, ... } */
const lifeW = (P) => (P.life <= 6 ? 0.6 : P.life <= 12 ? 0.3 : 0.12);
const EFF = {
  tempt: { res: (G, X) => tempt(G, X.P), score: (G, P) => 1 + (P.ring.n < 4 ? 0.4 : 0), value: () => 1.1 },
  amass: {
    res: (G, X, e) => { X.army = amass(G, X.P, e.nFn ? e.nFn(G, X) : e.n); },
    score: (G, P, e, X) => (e.nFn ? e.nFn(G, X || { P }) : e.n) * 1.1 + (P.bf.some((c) => hasSub(c, 'Army')) ? 0 : 0.4),
    value: (e) => (e.n || 2) * 1.1 + 0.4,
  },
  food: { res: (G, X, e) => { const n = e.nFn ? e.nFn(G, X) : e.n; if (n > 0) { const m = makeTokens(G, e.forOpp ? X.O : X.P, FOOD, n, { quiet: true }); emit(G, 'token', `${(e.forOpp ? X.O : X.P).name} creates ${n === 1 ? 'a Food token' : `${n} Food tokens`}.`, { who: X.P.i, cards: m.map((c) => c.id) }); } }, score: (G, P, e) => (e.n || 1) * (0.6 + lifeW(P)), value: (e) => (e.n || 1) * 0.9 },
  investigate: { res: (G, X, e) => investigate(G, X.P, e.nFn ? e.nFn(G, X) : e.n || 1), score: (G, P, e) => (e.n || 1) * 0.9, value: (e) => (e.n || 1) * 0.9, label: () => 'Investigate' },
  connive: { res: (G, X) => connive(G, X.P, X.src, 1), score: () => 1.1, value: () => 1.1, label: () => 'Connive' },
  treasure: { res: (G, X, e) => { const n = e.nFn ? e.nFn(G, X) : e.n; if (n > 0) { const m = makeTokens(G, X.P, TREASURE, n, { quiet: true }); emit(G, 'token', `${X.P.name} creates ${n === 1 ? 'a Treasure token' : `${n} Treasure tokens`}.`, { who: X.P.i, cards: m.map((c) => c.id) }); } }, score: (G, P, e) => (e.n || 1) * 0.7, value: (e) => (e.n || 1) * 0.75 },
  mill: {
    res: (G, X, e, t) => { const Q = e.tgt ? G.players[t.p] : e.who === 'self' ? X.P : X.O; mill(G, Q, e.nFn ? e.nFn(G, X) : e.n); },
    val: (G, P, e, x) => (x.p === P.i ? -0.2 : 0.15 * (e.n || 2)), score: (G, P, e) => (e.who === 'self' ? 0 : 0.1), value: () => 0.2, label: () => 'Choose a player to mill',
  },
  destroyAll: {
    res: (G, X, e) => { const hit = allCreatures(G).filter((c) => matches(G, c, e.f, X.P, X.src) && !has(c, 'indestructible') && !shieldSave(G, c)); X.P.stats.kills += hit.filter((c) => c.ctrl !== X.P.i).length; dieNow(G, hit); if (!hit.length) emit(G, 'info', 'No creatures were destroyed.', { who: X.P.i }); X.n = hit.length; },
    score: (G, P, e) => allCreatures(G).filter((c) => matches(G, c, e.f, P, null) && !has(c, 'indestructible')).reduce((s, c) => s + (c.ctrl === P.i ? -cv(c) : cv(c)), 0) - 1.5, value: () => 3,
  },
  pumpAll: {
    res: (G, X, e) => { const cs = allCreatures(G).filter((c) => (e.side === 'opp' ? c.ctrl !== X.P.i : e.side === 'you' ? c.ctrl === X.P.i : true) && (!e.f || matches(G, c, e.f, X.P, X.src))); cs.forEach((c) => { c.tp += e.p; c.tt += e.t; (e.kw || []).forEach((k) => { if (!c.tkw.includes(k)) c.tkw.push(k); }); }); emit(G, 'pump', `${e.side === 'opp' ? `${X.O.name}'s creatures` : `${X.P.name}'s creatures`} get ${sgn(e.p)}/${sgn(e.t)}${(e.kw || []).length ? ` and gain ${e.kw.join(' and ')}` : ''} until end of turn.`, { who: X.P.i, cards: cs.map((c) => c.id) }); },
    score: (G, P, e, X, ctx) => {
      if (e.t < 0) return allCreatures(G).filter((c) => c.ctrl !== P.i && tou(c) + e.t - c.dmg <= 0 && !has(c, 'indestructible')).reduce((s, c) => s + cv(c), 0) - allCreatures(G).filter((c) => c.ctrl === P.i && e.side !== 'opp' && tou(c) + e.t - c.dmg <= 0).reduce((s, c) => s + cv(c), 0) + 0.2;
      const mine = P.bf.filter((c) => isCreature(c) && !c.tapped);
      return ctx === 'main1' || ctx === 'trigger' ? mine.length * (e.p + e.t + (e.kw || []).length) * 0.25 : 0.3;
    },
    value: (e) => (e.t < 0 ? 2.5 : 1 + (e.p + e.t) * 0.8),
  },
  destroyP: {
    res: (G, X, e, t) => { for (const c of tcards(t)) destroyPermanent(G, X.P, c, `to ${X.src ? X.src.def.name : 'an effect'}`); },
    val: (G, P, e, c) => (has(c, 'indestructible') ? -5 : c.ctrl === P.i ? -pv(G, c) - 2 : pv(G, c) + (c.attacking ? 0.5 : 0)), value: (e) => (e.tgt.f.types && !e.tgt.f.types.some((t) => ['Creature', 'nonland', 'any'].includes(t)) ? 1.6 : 3.8), label: (e) => `Destroy ${tgtNoun(e)}`,
  },
  exileP: {
    res: (G, X, e, t) => { for (const c of tcards(t)) { if (!onBf(G, c)) continue; if (c.ctrl !== X.P.i && isCreature(c)) X.P.stats.kills++; exilePermanent(G, X.P, c); } },
    val: (G, P, e, c) => (c.ctrl === P.i ? -pv(G, c) - 2 : pv(G, c) + 0.3), value: (e) => (e.tgt.f.types && !e.tgt.f.types.some((t) => ['Creature', 'nonland', 'any'].includes(t)) ? 1.6 : 4), label: (e) => `Exile ${tgtNoun(e)}`,
  },
  bounceP: {
    res: (G, X, e, t) => { for (const c of tcards(t)) if (onBf(G, c)) bounceCard(G, X.P, c); },
    val: (G, P, e, c) => (c.ctrl === P.i ? (e.ownOk ? 0.1 : -pv(G, c)) : c.token ? pv(G, c) + 1 : c.def.mv * 0.5 + pv(G, c) * 0.3), value: () => 1.6, label: (e) => `Return ${tgtNoun(e)} to its owner's hand`,
  },
  tuckN: {
    res: (G, X, e, t) => { const c = t.c; if (!c || !onBf(G, c)) return; const Q = ctrlOf(G, c); leaveBattlefield(G, c); resetCard(c); if (!c.token) { const L = G.players[c.owner].library; L.splice(Math.max(0, L.length - (e.pos - 1)), 0, c); } P_kill(X, c); emit(G, 'exile', `${c.def.name} goes into ${G.players[c.owner].name}'s library, ${['', 'on top', 'second', 'third', 'fourth'][e.pos]} from the top.`, { who: X.P.i, cards: [c.id] }); leaves(G, [{ c, P: Q }]); },
    val: (G, P, e, c) => (c.ctrl === P.i ? -pv(G, c) : pv(G, c) * 0.85 + (c.token ? 1 : 0)), value: () => 2.6, label: (e) => `Put ${tgtNoun(e)} into its owner's library`,
  },
  untapP: {
    res: (G, X, e, t) => {
      for (const c of targetList(t).map((x) => x.c).filter(Boolean)) {
        // A stun counter is removed instead of the permanent untapping
        if (c.tapped && ctrCount(c, 'stun')) { removeCounters(G, c, 'stun', 1); emit(G, 'tapfx', `${c.def.name} loses a stun counter instead of untapping.`, { who: X.P.i, cards: [c.id] }); continue; }
        c.tapped = false; emit(G, 'tapfx', `${c.def.name} untaps.`, { who: X.P.i, cards: [c.id] });
      }
    },
    val: (G, P, e, c) => (c.ctrl === P.i && c.tapped ? (ctrCount(c, 'stun') ? 0.15 : isCreature(c) ? 0.8 : isLand(c) || c.def.mana || c.def.manaAbs ? 0.9 : 0.4) : -0.1), value: () => 0.6, label: () => 'Untap a permanent',
  },
  tapP: {
    res: (G, X, e, t) => { for (const c of targetList(t).map((x) => x.c).filter(Boolean)) { c.tapped = true; if (e.stun) addCounters(G, c, 1, 'stun', true); emit(G, 'tapfx', `${c.def.name} is tapped${e.stun ? ' and gets a stun counter' : ''}.`, { who: X.P.i, cards: [c.id] }); } },
    val: (G, P, e, c) => (c.ctrl === P.i ? -0.5 : (c.tapped ? 0.1 : isCreature(c) ? cv(c) * 0.3 : 0.2) + (e.stun ? cv(c) * 0.2 : 0)), value: (e) => (e.stun ? 1.2 : 0.6), label: () => 'Tap a creature',
  },
  untapRef: { res: (G, X) => { const c = X.last && X.last.c; if (c && onBf(G, c)) { c.tapped = false; } }, score: () => 0.2, value: () => 0.2 },
  ctrs: {
    res: (G, X, e, t) => { for (const c of targetList(t).map((x) => x.c).filter(Boolean)) addCounters(G, c, e.n, e.kind || '+1/+1'); },
    val: (G, P, e, c) => { const s = e.kind === 'stun' ? -(isCreature(c) ? cv(c) * 0.35 : 0.4) * e.n : 0.9 * e.n + (c.ctrl === P.i ? cv(c) * 0.05 : 0); return c.ctrl === P.i ? s : -s; },
    value: (e) => e.n * 0.9, label: (e) => `Put ${e.n === 1 ? `a ${e.kind || '+1/+1'} counter` : `${e.n} ${e.kind || '+1/+1'} counters`} on ${e.kind === 'stun' ? 'a permanent' : 'a creature'}`,
  },
  pumpT: { // +X/+Y (and keywords) for one or more targets, X computed at resolution
    res: (G, X, e, t) => { for (const c of targetList(t).map((x) => x.c).filter(Boolean)) { const p = e.pFn ? e.pFn(G, X, c) : e.p, q = e.tFn ? e.tFn(G, X, c) : e.t; c.tp += p; c.tt += q; (e.kw || []).forEach((k) => { if (!c.tkw.includes(k)) c.tkw.push(k); }); emit(G, 'pump', `${c.def.name} gets ${sgn(p)}/${sgn(q)}${(e.kw || []).length ? ` and gains ${e.kw.join(' and ')}` : ''} until end of turn.`, { who: X.P.i, cards: [c.id] }); } },
    val: (G, P, e, c, X, ctx) => { const p = e.p || 1, q = e.t || 1; if (p < 0 || q < 0) return c.ctrl === P.i ? -cv(c) : tou(c) + q - c.dmg <= 0 ? cv(c) + 1 : 0.3; if (c.ctrl !== P.i) return -0.5; return (c.attacking || c.blocking ? 1.2 : ctx === 'main1' && !c.tapped && (!c.sick || has(c, 'haste')) ? 0.6 : 0.25) * (p + q) * 0.5 + (e.kw || []).filter((k) => !has(c, k)).length * 0.3; },
    value: (e) => 0.7 + ((e.p || 1) + (e.t || 1)) * 0.3, label: (e) => (e.pFn || e.tFn ? 'Give a creature a bonus until end of turn' : `Give a creature ${sgn(e.p || 0)}/${sgn(e.t || 0)}${(e.kw || []).length ? ` and ${e.kw.join(' and ')}` : ''}`),
  },
  grant: { // keywords or flags until end of turn: { kw: [...], flags: {...} }
    res: (G, X, e, t) => { for (const c of targetList(t).map((x) => x.c).filter(Boolean)) { (e.kw || []).forEach((k) => { if (!c.tkw.includes(k)) c.tkw.push(k); }); if (e.flags) Object.assign(c.tf, e.flags); emit(G, 'pump', `${c.def.name} ${e.say || `gains ${(e.kw || []).join(' and ')} until end of turn`}.`, { who: X.P.i, cards: [c.id] }); } },
    val: (G, P, e, c) => (e.bad ? (c.ctrl === P.i ? -1 : cv(c) * 0.3) : c.ctrl === P.i ? 0.4 + (e.kw || []).filter((k) => !has(c, k)).reduce((s, k) => s + (KW_VALUE[k] || 0.5), 0) * (c.attacking || c.blocking ? 1 : 0.4) : -0.3), value: () => 0.6, label: (e) => (e.kw ? `Give a creature ${e.kw.join(' and ')}` : 'Choose a creature'),
  },
  regrow: { // return a card from your graveyard: to 'hand' (default), 'bf' or 'bfTapped'
    res: (G, X, e, t) => { const card = t && t.c; if (!card) return; const Q = G.players.find((q) => q.gy.includes(card)); if (!Q) return; Q.gy.splice(Q.gy.indexOf(card), 1); if (!e.to || e.to === 'hand') { X.P.hand.push(card); emit(G, 'raise', `${X.P.name} returns ${card.def.name} to hand.`, { who: X.P.i, cards: [card.id] }); } else { emit(G, 'raise', `${card.def.name} returns to the battlefield.`, { who: X.P.i, cards: [card.id] }); enterBattlefield(G, X.P, card, null, { tapped: e.to === 'bfTapped' }); } },
    val: (G, P, e, c) => 0.8 + c.def.value * (e.to && e.to !== 'hand' ? 0.5 : 0.3), value: (e) => (e.to && e.to !== 'hand' ? 2.6 : 1.6), label: () => 'Choose a card in your graveyard',
  },
  tutor: { // search your library: { f (card filter), n, to }
    res: (G, X, e) => { const got = searchLibrary(G, X.P, (c) => defMatches(c.def, e.f, G, c), e.n || 1, e.to || 'hand', e.why); emit(G, 'search', got.length ? `${X.P.name} searches their library for ${e.to === 'hand' || !e.to ? nameList(got) : `${nameList(got)}, putting ${got.length > 1 ? 'them' : 'it'} onto the battlefield`}.` : `${X.P.name} searches their library and finds nothing.`, { who: X.P.i, cards: got.map((c) => c.id) }); },
    score: () => 1.2, value: (e) => (e.to === 'hand' || !e.to ? 1.4 : 1.8) * (e.n || 1),
  },
  lose: { // a player loses life: { who: 'opp'|'self'|'each'|'tgt', n | nFn }
    res: (G, X, e, t) => { const n = e.nFn ? e.nFn(G, X) : e.n; const Qs = e.tgt ? [G.players[t.p]] : e.who === 'self' ? [X.P] : e.who === 'each' ? G.players : [X.O]; for (const Q of Qs) { if (n <= 0) continue; Q.life -= n; if (Q !== X.P) X.P.stats.damage += 0; emit(G, 'life', `${Q.name} loses ${n} life.`, { who: X.P.i, target: `p${Q.i}`, amount: n }); } },
    val: (G, P, e, x) => (x.p === P.i ? -1 : (e.n || 1) * 0.5 + (G.players[x.p].life <= (e.n || 1) ? 100 : 0)), score: (G, P, e, X) => { const n = e.nFn ? e.nFn(G, X || { P, O: other(G, P) }) : e.n; return e.who === 'self' ? -n * lifeW(P) : other(G, P).life <= n ? 100 : n * 0.5; }, value: (e) => (e.who === 'self' ? -0.2 : 0.5) * (e.n || 1), label: () => 'Choose a player',
  },
  dmgX: { // damage where the amount is worked out when it resolves: { nFn, tgt, excess (to controller), noPrevent }
    res: (G, X, e, t) => { const n = e.nFn(G, X); for (const x of targetList(t)) dealDamage(G, X, x, n, e); },
    val: (G, P, e, x, X) => { const n = e.nFn(G, X || { P, O: other(G, P), src: null }); if (x.p != null && !x.def) return x.p === P.i ? -5 : G.players[x.p].life <= n ? 100 : n * 0.3; if (x.ctrl === P.i) return -cv(x); return lethalTo(x) <= n ? cv(x) + 0.5 + (e.excess ? Math.max(0, n - lethalTo(x)) * 0.3 : 0) : 0.1; },
    value: () => 2.5, label: () => 'Deal damage',
  },
  ward: { res: () => {}, score: () => 0 },
  // Job select: a 1/1 colorless Hero token, then this Equipment is attached to it
  jobSelect: {
    res: (G, X) => { const [h] = makeTokens(G, X.P, HERO_TOKEN, 1, { quiet: true }); if (!h) return; emit(G, 'token', `${X.P.name} creates a 1/1 Hero token.`, { who: X.P.i, cards: [h.id] }); if (onBf(G, X.src) && onBf(G, h)) attach(G, X.src, h); },
    score: () => 1.6, value: () => 1.4,
  },
  noop2: { res: () => {}, score: () => 0, value: () => 0 },
  fn: { // custom: { run(G, X, t), val, score, value }
    res: (G, X, e, t) => e.run(G, X, t),
    val: (G, P, e, c, X, ctx) => (e.val ? e.val(G, P, c, X, ctx) : 0.3), score: (G, P, e, X, ctx) => (e.score ? e.score(G, P, X, ctx) : 0.3), value: (e) => (e.value != null ? e.value : 0.5), label: (e) => e.label || 'Choose a target',
  },
  reflex: { // "When you do, ...": a new ability that resolves right after this one, choosing its targets then
    res: (G, X, e) => { if (e.if && !e.if(G, X)) return; G.pending.unshift({ src: X.src, P: X.P, t: { eff: e.eff, label: e.label }, ev: Object.assign({}, X.ev, { army: X.army, last: X.last, did: X.did, n: X.n, sac: X.sac }) }); },
    score: (G, P, e, X, ctx) => chooseTargets(G, P, e.eff, 'trigger', X && X.src, X) ? chooseTargets(G, P, e.eff, 'trigger', X && X.src, X).score : 0, value: (e) => effsValue(e.eff),
  },
};
const P_kill = (X, c) => { if (c.ctrl !== X.P.i && isCreature(c)) X.P.stats.kills++; };
const tcards = (t) => targetList(t).map((x) => x.c).filter(Boolean);
function tgtNoun(e) {
  const f = (e.tgt && e.tgt.f) || {};
  const types = f.types || ['Creature'];
  const noun = types.map((t) => (t === 'nonland' ? 'nonland permanent' : t === 'any' ? 'permanent' : t.toLowerCase())).join(' or ');
  return `${f.side === 'opp' ? "an opponent's " : f.side === 'you' ? 'your ' : 'a '}${noun}`;
}
// Damage from a resolving effect to a target ref (creature or player), with "excess goes to its controller"
function dealDamage(G, X, t, n, e = {}) {
  const src = X.src;
  if (!t || n <= 0) return;
  const lifelinked = src && isCreature(src) && has(src, 'lifelink');
  if (t.p != null) {
    const Q = G.players[t.p];
    if (protectedPlayer(G, Q, X.P)) return;
    damagePlayer(G, Q, n, src, X.P);
    if (lifelinked) gainLife(G, X.P, n);
    emit(G, 'hit', `${src ? src.def.name : 'It'} deals ${n} damage to ${Q.name}.`, { who: X.P.i, card: src && src.id, target: `p${Q.i}`, amount: n });
    return;
  }
  const c = t.c;
  if (!c || !onBf(G, c)) return;
  const lethal = Math.max(0, tou(c) - c.dmg);
  const dealt = damageCreature(G, c, n, src, { noncombat: true });
  if (dealt && lifelinked) gainLife(G, X.P, dealt);
  emit(G, 'hit', `${src ? src.def.name : 'It'} deals ${n} damage to ${c.def.name}.`, { who: X.P.i, card: src && src.id, target: c.id, amount: n });
  if (e.excess && n > lethal) { const Q = ctrlOf(G, c); const ex = n - lethal; damagePlayer(G, Q, ex, src, X.P); emit(G, 'hit', `${ex} excess damage goes to ${Q.name}.`, { who: X.P.i, target: `p${Q.i}`, amount: ex }); }
}

/* ---------- Helpers the card scripts share ---------- */
const isIS = (d) => d.types.includes('Instant') || d.types.includes('Sorcery');
const foodsOf = (P) => P.bf.filter((c) => hasSub(c, 'Food') && !isCreature(c));
const legendsOf = (P) => P.bf.filter((c) => isCreature(c) && isLegendary(c));
// Parse effect text in a script; a typo or unsupported sentence is a bug, so it throws
function fx(text, name) {
  const lines = normalizeText(text, name || '\u0000');
  const norm = lines.join(' ');
  const e = parseEffects(norm.toLowerCase(), norm);
  if (!e) throw new Error(`fx could not read: ${text}`);
  return e;
}
// Two related targets (Breaking of the Fellowship, Ent's Fury): e.tgt = { pair, fa, fb, same, optB, labels }, e.pairVal(G, P, a, b, X)
function pairCands(G, P, e, src, X) {
  const T = e.tgt;
  const ok = (c, f) => onBf(G, c) && matches(G, c, f || {}, P, src) && !(c.ctrl !== P.i && (has(c, 'hexproof') || c.tf.hexproof)) && !protectedFrom(c, src);
  const A = allPerms(G).filter((c) => ok(c, T.fa));
  const B = allPerms(G).filter((c) => ok(c, T.fb));
  return { A, B, ok: (a, b) => !!a && A.includes(a) && (b == null ? !!T.optB : B.includes(b) && b !== a && (!T.same || b.ctrl === a.ctrl)) };
}
function evalPair(G, P, e, ctx, source, X) {
  const { A, B, ok } = pairCands(G, P, e, source, X);
  let best = null;
  for (const a of A) for (const b of (e.tgt.optB ? [null] : []).concat(B)) {
    if (!ok(a, b)) continue;
    const s = e.pairVal(G, P, a, b, X, ctx);
    if (!best || s > best.score) best = { score: s, target: b ? { c: a, c2: b } : { c: a } };
  }
  if (!best) return null;
  if (best.score <= 0 && !(ctx === 'trigger' || ctx === 'etb' || ctx === 'dies')) return null;
  return best;
}
// What one creature does to another in a fight, as a score for P
function fightScore(G, P, m, o, extraP = 0, extraT = 0) {
  if (!o) return 0;
  const pm = Math.max(0, pow(m) + extraP), po = Math.max(0, pow(o));
  const killsIt = !has(o, 'indestructible') && !protectedFrom(o, m) && pm > 0 && (has(m, 'deathtouch') || pm >= lethalTo(o));
  const dies = !has(m, 'indestructible') && !protectedFrom(m, o) && po > 0 && (has(o, 'deathtouch') || po >= Math.max(0, tou(m) + extraT - m.dmg));
  return (killsIt ? cv(o) : 0) - (dies ? cv(m) : 0);
}
function fightCards(G, P, m, o) {
  if (!onBf(G, m) || !onBf(G, o)) return;
  const pm = Math.max(0, pow(m)), po = Math.max(0, pow(o));
  const d1 = damageCreature(G, o, pm, m);
  if (d1 && has(m, 'lifelink')) gainLife(G, G.players[m.ctrl], d1);
  const d2 = damageCreature(G, m, po, o);
  if (d2 && has(o, 'lifelink')) gainLife(G, G.players[o.ctrl], d2);
  emit(G, 'fight', `${m.def.name} fights ${o.def.name}.`, { who: P.i, cards: [m.id, o.id], hits: [{ src: m.id, to: o.id, n: pm }, { src: o.id, to: m.id, n: po }] });
}
// One creature deals damage equal to its power to another (bite)
function biteCards(G, P, m, o) {
  if (!onBf(G, m) || !onBf(G, o)) return;
  const pm = Math.max(0, pow(m));
  const d = damageCreature(G, o, pm, m);
  if (d && has(m, 'lifelink')) gainLife(G, G.players[m.ctrl], d);
  emit(G, 'fight', `${m.def.name} deals ${pm} damage to ${o.def.name}.`, { who: P.i, cards: [m.id, o.id], hits: [{ src: m.id, to: o.id, n: pm }] });
}
// Exile a permanent and return it under its owner's (or P's) control: a new object, with its enter abilities
function flicker(G, P, c, toP) {
  if (!onBf(G, c)) return;
  const Q = ctrlOf(G, c);
  exileCard(G, c);
  emit(G, 'exile', `${c.def.name} is exiled.`, { who: P.i, cards: [c.id] });
  leaves(G, [{ c, P: Q }]);
  if (c.token) return;
  const back = toP || G.players[c.owner];
  removeFromZones(G, c);
  enterBattlefield(G, back, c, null, {});
}
function flickerVal(G, P, c) {
  if (c.ctrl !== P.i) return -0.5;
  let v = effsValue(c.def.etb) * 0.5 + 0.1;
  if (attachedTo(G, c).some((a) => a.def.aura && a.ctrl !== P.i)) v += 1.5;
  if (c.token) v -= cv(c) + 2;
  if (c.tapped) v += 0.2;
  return v;
}
function goad(G, P, c) {
  c.goad = G.active === P.i ? G.turn + 1 : G.turn;
  emit(G, 'tapfx', `${c.def.name} is goaded: it attacks each combat if able until ${P.name}'s next turn.`, { who: P.i, cards: [c.id] });
}
// Put n cards from P's hand on the bottom of their library (P chooses)
function bottomFromHand(G, P, n) {
  n = Math.min(n, P.hand.length);
  if (!n) return;
  const chosen = isHuman(G, P) && n < P.hand.length ? pickCards(G, { type: 'choose', reason: 'tuck', n, min: n, max: n, zone: 'hand', cards: P.hand.map((c) => c.id) }, P.hand, n)
    : P.hand.slice().sort((a, b) => handValue(G, P, a) - handValue(G, P, b)).slice(0, n);
  for (const c of chosen) { P.hand.splice(P.hand.indexOf(c), 1); P.library.unshift(c); }
  emit(G, 'info', `${P.name} puts ${n === 1 ? 'a card' : `${n} cards`} from their hand on the bottom of their library.`, { who: P.i });
}
// Look at the top n cards; take up to `take` that fit pred into the hand (or onto the battlefield); the rest go to the bottom at random.
function lookAtTop(G, P, n, pred, take, label, to) {
  const top = P.library.splice(Math.max(0, P.library.length - n)).reverse();
  if (!top.length) return [];
  const ok = top.filter(pred);
  let got = [];
  if (ok.length) {
    if (isHuman(G, P)) got = pickCards(G, { type: 'choose', reason: 'reveal', n: Math.min(take, ok.length), min: 0, max: Math.min(take, ok.length), zone: 'library', cards: ok.map((c) => c.id), label, shown: top.map((c) => c.id) }, ok, null).slice(0, take);
    else got = ok.slice().sort((a, b) => b.def.value - a.def.value).slice(0, take);
  }
  const rest = top.filter((c) => !got.includes(c));
  G.rng.shuffle(rest);
  P.library.unshift(...rest);
  for (const c of got) { if (to === 'bf') enterBattlefield(G, P, c, null, {}); else P.hand.push(c); }
  emit(G, 'reveal', got.length ? `${P.name} looks at ${top.length} cards and takes ${nameList(got)}.` : `${P.name} looks at ${top.length} cards and takes none of them.`, { who: P.i, cards: got.map((c) => c.id) });
  dirty(G);
  return got;
}
// Reveal from the top until pred matches; returns { hit, rest } (the caller decides where they go)
function revealUntil(G, Q, pred, count = 1) {
  const rest = [], hits = [];
  while (Q.library.length && hits.length < count) { const c = Q.library.pop(); if (pred(c)) hits.push(c); else rest.push(c); }
  return { hits, rest };
}
// Cast a spell from your hand without paying its mana cost (Press the Enemy, Glamdring)
function freeCastFromHand(G, P, maxMv, label) {
  const cs = P.hand.filter((c) => isIS(c.def) && c.def.mv <= maxMv && !c.def.respondOnly && !(c.def.spell && c.def.spell.some((e) => e.k === 'counter')));
  if (!cs.length) return false;
  let pick = null, ev = null;
  if (isHuman(G, P)) {
    const ch = pickCards(G, { type: 'choose', reason: 'freecast', n: 1, min: 0, max: 1, zone: 'hand', cards: cs.map((c) => c.id), label }, cs, null);
    pick = ch[0] || null;
  } else {
    let best = null;
    for (const c of cs) { const r = evalFree(G, P, c); if (r && (!best || r.score > best.score)) best = { c, ...r }; }
    if (best && best.score > 0.5) { pick = best.c; ev = best; }
  }
  if (!pick) return false;
  const targets = isHuman(G, P) ? askSpellTargets(G, P, pick) : ev.targets;
  castSpell(G, P, pick, targets, null, { free: true, mode: ev ? ev.mode : null });
  return true;
}
function evalFree(G, P, card) {
  const d = card.def;
  const options = d.modes ? modeChoices(G, P, d) : [null];
  let best = null;
  for (const mode of options) { const ch = chooseTargets(G, P, spellEffects(d, mode), 'main2', card, { x: 0 }); if (ch && (!best || ch.score > best.score)) best = { score: ch.score, targets: ch.targets, mode }; }
  return best;
}
// A human picks the targets for a spell they get to cast in the middle of something else
function askSpellTargets(G, P, card) {
  const eff = spellEffects(card.def, null);
  if (!eff.some(needsTarget)) return eff.map(() => null);
  return askTargets(G, P, card, eff, {}) || eff.map(() => null);
}
// Cast a card right now, while something resolves (Vaan, Seifer, Triple Triad): the human is asked, the AI judges it
function castNow(G, P, card, opts = {}) {
  const d = card.def;
  if (isLand(card)) return false;
  const free = !!opts.free;
  if (!free && !canPay(P, castCost(P, card, [], 0), { def: d, anyType: !!opts.anyType })) return false;
  let mode = null, targets = [], x = 0;
  if (isHuman(G, P)) {
    if (opts.ask !== false && !yesNo(G, P, card, `Cast ${d.name}${free ? ' without paying its mana cost' : ''}?`, true)) return false;
    if (d.modes) { const ms = modeChoices(G, P, d).filter((m) => free || canPay(P, castCost(P, card, [], 0, m), { def: d, anyType: !!opts.anyType })); if (!ms.length) return false; mode = ms[chooseMode(G, P, card, `${d.name}: choose`, ms.map((m) => m.map((i) => d.modes[i].label).join(' and ')), 0)]; }
    if (isIS(d)) { const eff = spellEffects(d, mode); targets = eff.some(needsTarget) ? (askTargets(G, P, card, eff, {}) || eff.map(() => null)) : eff.map(() => null); }
  } else {
    if (isIS(d)) { const r = free ? evalFree(G, P, card) : evalCast(G, P, card, 'main2'); if (!r || r.score <= 0.3) return false; mode = r.mode; targets = r.targets; x = r.x || 0; }
    else if (!free && !evalCast(G, P, card, 'main2')) return false;
  }
  if (d.aura) { const h = auraHost(G, P, card); if (!h || h.s <= 0.2) return false; targets = [{ c: h.c }]; }
  return castSpell(G, P, card, targets, null, { free, mode, x });
}
// Cast a copy of a card (Saruman of Many Colors): permanents become tokens, spells resolve with new targets
function castCopyOfCard(G, P, def) {
  const fake = { card: { id: -(G.nextId++), def, owner: P.i }, P, targets: [], x: 0, mode: def.modes ? (isHuman(G, P) ? null : (evalFree(G, P, { def, id: 0, owner: P.i, tkw: [], cnt: 0, tp: 0, tt: 0, ctr: {}, tf: {} }) || {}).mode) : null };
  emit(G, 'cast', `${P.name} casts a copy of ${def.name} without paying its mana cost.`, { who: P.i });
  fire(G, 'cast', { P, card: fake.card, item: fake, nth: (P.cast = (P.cast || 0) + 1), free: true });
  copySpell(G, P, fake, {});
}
// Exile until this permanent leaves the battlefield (Shire Shirriff)
function exileUntil(G, P, src, c) {
  if (!onBf(G, src) || !onBf(G, c)) return;
  const Q = ctrlOf(G, c);
  exileCard(G, c);
  if (!c.token) { src.mem.held = (src.mem.held || []).concat(c); }
  emit(G, 'exile', `${c.def.name} is exiled until ${src.def.name} leaves the battlefield.`, { who: P.i, cards: [c.id] });
  leaves(G, [{ c, P: Q }]);
}
function returnHeld(G, mem) {
  for (const c of (mem && mem.held) || []) {
    const O = G.players[c.owner];
    if (!O.exile.includes(c)) continue;
    O.exile.splice(O.exile.indexOf(c), 1);
    emit(G, 'enter', `${c.def.name} returns to the battlefield.`, { who: O.i, card: c.id });
    enterBattlefield(G, O, c, null, {});
  }
  if (mem) mem.held = [];
}
// Display of Power on your own spell: copy it before it resolves
function offerSelfCopy(G, P, item) {
  const dop = P.hand.find((c) => c.def.copier && c !== item.card && canPay(P, castCost(P, c), { def: c.def }));
  if (!dop) return;
  const eff = spellEffects(item.card.def, item.mode);
  let want;
  if (isHuman(G, P)) want = yesNo(G, P, dop, `Cast ${dop.def.name} to copy ${item.card.def.name}?`, false);
  else { const ch = chooseTargets(G, P, eff, 'main2', item.card, { x: item.x }); want = !!ch && ch.score >= 3.2; }
  if (!want) return;
  pay(P, castCost(P, dop), { def: dop.def });
  P.hand.splice(P.hand.indexOf(dop), 1);
  P.stats.cast++;
  P.cast = (P.cast || 0) + 1;
  emit(G, 'cast', `${P.name} casts ${dop.def.name}, targeting ${item.card.def.name}.`, { who: P.i, card: dop.id, targets: [item.card.id] });
  P.gy.push(dop);
  copySpell(G, P, item);
}

/* ---------- Casting and the stack ---------- */
const targetIds = (targets) => (targets || []).flatMap(targetList).map((x) => (x.c ? x.c.id : `p${x.p}`));
function targetText(G, targets) {
  const named = (targets || []).flatMap(targetList).map((x) => (x.c ? x.c.def.name : G.players[x.p].name));
  return named.length ? `, targeting ${[...new Set(named)].join(' and ')}` : '';
}
const genericCost = (n) => ({ g: n, W: 0, U: 0, B: 0, R: 0, G: 0 });
function counterLegal(cs, item) {
  const what = cs.def.spell.find((e) => e.k === 'counter').what;
  const d = item.card.def;
  if (what === 'creature spell') return d.types.includes('Creature');
  if (what === 'small creature spell') return d.types.includes('Creature') && (d.power <= 2 || d.toughness <= 2);
  if (what === 'noncreature spell') return !d.types.includes('Creature');
  if (what === 'instant or sorcery spell') return d.types.includes('Instant') || d.types.includes('Sorcery');
  return true;
}
function threatOf(G, O, item) {
  const d = item.card.def;
  if (d.types.includes('Creature')) return d.value + d.mv * 0.4;
  if (isPermanentSpell(d)) return Math.max(0, d.value) + d.mv * 0.5;
  let s = 0;
  spellEffects(d, item.mode).forEach((e, k) => {
    const hits = targetList(item.targets[k]);
    for (const x of hits) {
      if (x.c && x.c.ctrl === O.i) s += e.k === 'pump' ? (e.p < 0 || e.t < 0 ? cv(x.c) * 0.6 : 0) : cv(x.c) + 1;
      else if (x.p === O.i) { const n = x.n || e.n || 0; s += O.life <= n ? 100 : n * 0.4; }
    }
    if (hits.length) return;
    if (e.k === 'dmg' && e.to === 'player') s += O.life <= e.n ? 100 : e.n * 0.4;
    else if (e.k === 'edict' || e.k === 'tapAll') s += 3.5;
    else if (e.k === 'discard') s += e.n * 0.9;
    else if (e.k === 'wrath') s += O.bf.filter(isCreature).reduce((x, c) => x + cv(c), 0) - item.P.bf.filter(isCreature).reduce((x, c) => x + cv(c), 0);
    else if (e.k === 'dmgAll') s += O.bf.filter((c) => isCreature(c) && lethalTo(c) <= e.n).reduce((x, c) => x + cv(c), 0);
    else if (e.k === 'draw') s += e.n * 1.1;
    else if (e.k === 'tokens') s += effectValue(e);
    else if (e.k === 'drain') s += O.life <= e.n ? 100 : 1;
  });
  return s;
}
// What a card costs to cast right now: a commander in the command zone pays {2} more for each earlier cast from there;
// X adds to the generic part; some spells cost less depending on the board or their targets.
function addCostInto(c, m) {
  c.g += m.g || 0;
  for (const k of COLORS) if (m[k]) c[k] = (c[k] || 0) + m[k];
  if (m.hy) c.hy = (c.hy || []).concat(m.hy);
  if (m.C) c.C = (c.C || 0) + m.C;
  if (m.x) c.x = (c.x || 0) + m.x;
  return c;
}
function castCost(P, card, targets, x, mode) {
  const d = card.def;
  const fb = d.flashback && P.gy.includes(card) && !P.xcast.some((y) => y.card === card);
  if (P.g && P.xcast.some((y) => y.card === card && y.free && y.until >= P.g.turn)) return genericCost(0); // Triple Triad
  if (P.g && P.freeNext && P.freeNext.turn === P.g.turn && P.freeNext.f(card.def)) return genericCost(0); // World War Hulk
  const c = Object.assign({}, fb ? d.flashback : d.cost);
  if (c.hy) c.hy = c.hy.slice();
  if (P.command.includes(card)) c.g += CMD.tax * P.cmdCasts;
  if (d.modes && mode) for (const k of mode) { const mc = d.modes[k] && d.modes[k].cost; if (mc) addCostInto(c, mc); }
  if (c.x) c.g += c.x * (x || 0);
  delete c.x;
  if (d.costMod && P.g) c.g = Math.max(0, c.g - d.costMod(P.g, P, card, targets || []));
  // Cost reductions from permanents (The Wind Crystal: white spells you cast cost {1} less)
  if (P.g) for (const src of P.bf) if (src.def.spellDiscount) c.g = Math.max(0, c.g - (src.def.spellDiscount(P.g, P, card, src) || 0));
  if (P.g && P.turnDiscounts) for (const td of P.turnDiscounts) if (td.turn === P.g.turn) c.g = Math.max(0, c.g - (td.f(card.def) || 0)); // Armor Wars
  return c;
}
// Where a castable card is: hand, command zone, or somewhere an effect lets you cast from
// Jennifer Walters: your opponents can't cast spells during your turn
const silenced = (G, P) => {
  if (!G) return false;
  if (G.slavedTurn === G.turn && G.slavedP === P.i) return true; // a controlled player casts nothing
  return G.active !== P.i && G.players[G.active].bf.some((c) => c.def.silenceOpp && (typeof c.def.silenceOpp !== 'function' || c.def.silenceOpp(G, c)));
};
function castZone(G, P, card) {
  if (silenced(G, P)) return null;
  if (P.hand.includes(card)) return 'hand';
  if (P.command.includes(card)) return 'command';
  if (P.xcast.some((x) => x.card === card && x.until >= G.turn)) return 'xcast';
  const top = P.library[P.library.length - 1] === card;
  if (top && card.def.types.includes('Creature') && P.bf.some((c) => c.def.chorus)) return 'top';
  if (top && P.bf.some((c) => c.def.topCast && c.def.topCast(G, P, card, c))) return 'top';
  if (P.gy.includes(card)) {
    if (card.def.flashback) return 'flashback';
    if (gyPermit(G, P, card)) return 'gycast';
  }
  return null;
}
// A permanent letting P cast this card from their graveyard (Noctis, Hades)
const gyPermit = (G, P, card) => P.bf.find((c) => c.def.gyCast && c.def.gyCast(G, P, card, c)) || null;
// The extra cost or kicker of a spell, which can depend on the modes chosen
function acOf(def, mode) {
  if (def.modes && mode) for (const k of mode) if (def.modes[k] && def.modes[k].addCost) return def.modes[k].addCost;
  return def.addCost;
}
const xcastOf = (G, P, card) => P.xcast.find((x) => x.card === card && x.until >= G.turn);
// Instant speed: instants, flash, and permissions (Gandalf the White, Gandalf, Friend of the Shire, Borne Upon a Wind)
function fastFor(G, P, def) {
  if (isInstantSpeed(def)) return true;
  if (P.flashAll === G.turn) return true;
  for (const c of P.bf) {
    const f = c.def.flashFor;
    if (f && f(def, G, P, c)) return true;
  }
  return false;
}
const spellEffects = (def, mode) => (def.modes ? (mode || [0]).flatMap((k) => (def.modes[k] ? def.modes[k].eff : [])) : def.spell || []);
const isPermanentSpell = (def) => !def.types.includes('Instant') && !def.types.includes('Sorcery');
// Extra costs some spells have (sacrifice a creature, discard a card): can P pay them, and what would the AI give up?
// Teamwork N: tap any number of untapped creatures you control with total power N or more
const twPower = (P) => P.bf.filter((c) => isCreature(c) && !c.tapped).reduce((s, c) => s + Math.max(0, pow(c)), 0);
function twPain(G, P, c) {
  if (c.def.twBonus) return -1.5;
  if (c.def.mana || c.def.manaAbs || isArtifact(c)) return 2.5 + twPainBase(G, P, c);
  return twPainBase(G, P, c);
}
function twPainBase(G, P, c) {
  if (G.active === P.i) {
    const pre = G.combatTurn !== G.turn; // no combat yet this turn: a tapped creature can't attack
    return (pre && (!c.sick || has(c, 'haste')) && !has(c, 'defender') ? 0.3 + 0.25 * Math.max(0, pow(c)) : 0) + 0.2 + 0.1 * tou(c);
  }
  if (c.blocking) return 0.05; // tapped blockers still deal combat damage
  const blocksLeft = G.combatTurn !== G.turn || (G.combat && !G.combat.blocksDone);
  return blocksLeft ? 0.25 + 0.12 * tou(c) : 0.05;
}
function twPick(G, P, n) {
  const cs = P.bf.filter((c) => isCreature(c) && !c.tapped && pow(c) > 0);
  if (cs.reduce((s, c) => s + pow(c), 0) < n) return null;
  const ranked = cs.map((c) => ({ c, pain: twPain(G, P, c) })).sort((a, b) => a.pain / pow(a.c) - b.pain / pow(b.c) || a.c.id - b.c.id);
  const pick = [];
  let tot = 0;
  for (const r of ranked) { if (tot >= n && r.pain >= 0) break; pick.push(r); tot += pow(r.c); }
  // drop creatures that turned out not to be needed
  for (const r of pick.slice().sort((a, b) => b.pain - a.pain)) if (r.pain > 0 && tot - pow(r.c) >= n) { pick.splice(pick.indexOf(r), 1); tot -= pow(r.c); }
  return { cs: pick.map((r) => r.c), pain: pick.reduce((s, r) => s + r.pain, 0) };
}
// Pay a teamwork cost: tap creatures with total power n or more (chosen by a human, or the AI's cheapest set)
function teamworkPay(G, P, card, n, chosen) {
  const cs = (chosen || (isHuman(G, P) ? humanTwPick(G, P, card, n) : (twPick(G, P, n) || {}).cs) || []).filter((c) => onBf(G, c) && !c.tapped && c.ctrl === P.i);
  if (cs.reduce((s, c) => s + Math.max(0, pow(c)), 0) < n) return false;
  cs.forEach((c) => { c.tapped = true; });
  emit(G, 'tapfx', `${P.name} taps ${cs.map((c) => c.def.name).join(', ')} for teamwork.`, { who: P.i, cards: cs.map((c) => c.id) });
  if (G.pending) { for (const c of cs) fire(G, 'teamworkTap', { c, P }); fire(G, 'tapped', { P, cs }); }
  return true;
}
function humanTwPick(G, P, card, n) {
  const cs = P.bf.filter((c) => isCreature(c) && !c.tapped);
  if (cs.reduce((t, c) => t + Math.max(0, pow(c)), 0) < n) return null;
  const pick = pickCards(G, { type: 'choose', reason: 'teamwork', n: cs.length, min: 1, max: cs.length, zone: 'battlefield', cards: cs.map((x) => x.id), need: n, label: card.def.name }, cs, null).slice();
  // Top up a short choice so the spell can still be cast (keeps replays in step)
  let total = pick.reduce((t, x) => t + Math.max(0, pow(x)), 0);
  for (const x of cs.slice().sort((a, b) => pow(b) - pow(a))) { if (total >= n) break; if (!pick.includes(x)) { pick.push(x); total += Math.max(0, pow(x)); } }
  return total >= n ? pick : null;
}
function addCostOptions(G, P, card, mode) {
  const a = acOf(card.def, mode);
  if (!a) return { ok: true, opts: [] };
  const out = [];
  if (a.bounceLand) for (const c of P.bf) if (isLand(c)) out.push({ bounce: c });
  if (a.sac) for (const c of P.bf) if (matches(G, c, a.sac, P, card)) out.push({ sac: c });
  if (a.discard) { if (P.hand.filter((c) => c !== card).length >= a.discard) out.push({ discard: a.discard }); }
  if (a.orPay) out.push({ pay: a.orPay });
  if (a.teamwork && twPower(P) >= a.teamwork) out.push({ teamwork: a.teamwork });
  return { ok: out.length > 0, opts: out };
}
function aiAddCost(G, P, card, mode) {
  const { ok, opts } = addCostOptions(G, P, card, mode);
  if (!ok) return null;
  const a = acOf(card.def, mode);
  if (!a) return {};
  let best = null, bs = Infinity;
  for (const o of opts) {
    let s;
    if (o.bounce) s = (o.bounce.tapped ? 0.9 : 1.6) + (o.bounce.def.mana && o.bounce.def.mana.length > 1 ? 0.3 : 0) - (o.bounce.def.etb.length ? 0.5 : 0);
    else if (o.sac) s = pv(G, o.sac) + (o.sac.token ? -0.6 : 0) + (isCreature(o.sac) && o.sac.attacking ? -0.2 : 0) - (a.legendBonus && isLegendary(o.sac) ? a.legendBonus : 0);
    else if (o.discard) s = Math.min(...P.hand.filter((c) => c !== card).map((c) => handValue(G, P, c))) * o.discard;
    else if (o.pay) s = canPayBoth(P, card.def.cost, o.pay) ? costMV(o.pay) * 0.45 : Infinity;
    else if (o.teamwork) { const tp = twPick(G, P, o.teamwork); if (tp) { o.tw = tp.cs; s = Math.max(0, tp.pain); } else s = Infinity; }
    if (s < bs) { bs = s; best = o; }
  }
  return bs === Infinity ? null : Object.assign({ pain: bs }, best);
}
function payAddCost(G, P, card, choice, item, mode) {
  if (!acOf(card.def, mode) || !choice) return true;
  if (choice.bounce) {
    if (!onBf(G, choice.bounce)) return false;
    item.kicked = true;
    bounceCard(G, P, choice.bounce);
  } else if (choice.sac) {
    item.kicked = true;
    if (!onBf(G, choice.sac)) return false;
    item.sac = { leg: isLegendary(choice.sac), pow: isCreature(choice.sac) ? pow(choice.sac) : 0, name: choice.sac.def.name, cre: isCreature(choice.sac) };
    emit(G, 'sac', `${P.name} sacrifices ${choice.sac.def.name} to cast ${card.def.name}.`, { who: P.i, cards: [choice.sac.id] });
    sacrifice(G, P, choice.sac, true);
  } else if (choice.discard) {
    discardChoice(G, P, choice.discard, 'discard-cost');
  } else if (choice.pay) {
    if (!pay(P, choice.pay)) return false;
  } else if (choice.teamwork) {
    if (!teamworkPay(G, P, card, choice.teamwork, choice.tw)) return false;
    item.teamwork = true;
  }
  return true;
}
// A human pays an extra cost: choose what to sacrifice or discard (asked after choosing the spell)
function humanAddCost(G, P, card, mode) {
  const { ok, opts } = addCostOptions(G, P, card, mode);
  if (!ok) return null;
  const bounces = opts.filter((o) => o.bounce);
  if (bounces.length) { const ls = bounces.map((o) => o.bounce); return { bounce: ls.length === 1 ? ls[0] : pickCards(G, { type: 'choose', reason: 'bounce-cost', n: 1, min: 1, max: 1, zone: 'battlefield', cards: ls.map((c) => c.id), label: card.def.name }, ls, 1)[0] }; }
  const sacs = opts.filter((o) => o.sac), pays = opts.filter((o) => o.pay), discards = opts.filter((o) => o.discard);
  const tws = opts.filter((o) => o.teamwork);
  if (tws.length) { const cs = humanTwPick(G, P, card, tws[0].teamwork); return cs ? { teamwork: tws[0].teamwork, tw: cs } : null; }
  if (discards.length) return discards[0];
  if (sacs.length && pays.length) {
    const k = chooseMode(G, P, card, `${card.def.name}: pay the extra cost`, ['Sacrifice a creature', `Pay ${costText(pays[0].pay)}`], 0);
    if (k === 1) return pays[0];
  }
  if (!sacs.length) return pays[0] || null;
  const cs = sacs.map((o) => o.sac);
  const pick = cs.length === 1 ? cs[0] : pickCards(G, { type: 'choose', reason: 'sacrifice-cost', n: 1, min: 1, max: 1, zone: 'battlefield', cards: cs.map((c) => c.id), label: card.def.name }, cs, 1)[0];
  return { sac: pick };
}

function castSpell(G, P, card, targets, etbTargets, opts = {}) {
  const def = card.def;
  const zone = castZone(G, P, card) || (opts.free ? 'free' : null);
  if (!zone) return false;
  const fromCmd = zone === 'command';
  const x = opts.x || 0;
  const mode = opts.mode || null;
  const item = { card, P, targets: targets || [], x, mode, free: !!opts.free, copyable: !def.noCopy, sneak: !!opts.sneak };
  // Extra costs come first so their choices (a sacrifice) can't be paid for with the same creature's mana
  const ac = acOf(def, mode);
  let add = opts.add;
  if (ac && add === undefined) add = isHuman(G, P) ? humanAddCost(G, P, card, mode) : aiAddCost(G, P, card, mode);
  if (ac && !add) return false;
  const xc = xcastOf(G, P, card);
  const purpose = { def, item, anyType: !!(xc && xc.anyType) };
  const gperm = zone === 'gycast' ? gyPermit(G, P, card) : null;
  if (gperm && gperm.def.gyCastLife && P.life < gperm.def.gyCastLife) return false;
  const cost = castCost(P, card, item.targets, x, mode);
  if (!opts.free && !canPay(P, cost, purpose)) return false;
  if (add && add.teamwork && add.tw && !opts.free) {
    const was = add.tw.map((c) => c.tapped);
    add.tw.forEach((c) => { c.tapped = true; });
    const ok = canPay(P, castCost(P, card, item.targets, x, mode), purpose);
    add.tw.forEach((c, k) => { c.tapped = was[k]; });
    if (!ok) return false;
  }
  if (ac && !payAddCost(G, P, card, add, item, mode)) return false;
  if (!opts.free && !pay(P, castCost(P, card, item.targets, x, mode), purpose)) return false;
  item.spent = opts.free ? 0 : costMV(cost) + (add && add.pay ? costMV(add.pay) : 0);
  item.fromGy = G.players.some((Q) => Q.gy.includes(card));
  if (gperm) {
    if (gperm.def.gyCastLife) { P.life -= gperm.def.gyCastLife; emit(G, 'life', `${P.name} pays ${gperm.def.gyCastLife} life (${gperm.def.name}).`, { who: P.i, target: `p${P.i}`, amount: gperm.def.gyCastLife }); }
    if (gperm.def.gyCastFinality && gperm.def.gyCastFinality(card)) item.finality = true;
  }
  if (zone === 'flashback' || (xc && xc.exileAfter)) card.fbExile = true;
  if (zone === 'flashback') item.flashback = true;
  if (!opts.free && P.freeNext && P.freeNext.turn === G.turn && P.freeNext.f(def)) { P.freeNext = null; item.free = true; }
  if (xc && xc.free) item.free = true;
  (P.castDefs = P.castDefs || []).push(def);
  // "When you next cast a creature spell this turn": haste (Summon: Brynhildr), an extra counter (Summon: Fenrir)
  if (def.types.includes('Creature')) {
    if (P.hasteNext === G.turn) { card.finHaste = G.turn; P.hasteNext = 0; }
    if (P.ctrNext && P.ctrNext.turn === G.turn) { card.finCtr = (card.finCtr || 0) + P.ctrNext.n; P.ctrNext = null; }
  }
  if (zone === 'command') { P.command.splice(P.command.indexOf(card), 1); P.cmdCasts++; }
  else if (zone === 'hand') P.hand.splice(P.hand.indexOf(card), 1);
  else if (zone === 'xcast') { P.xcast.splice(P.xcast.indexOf(xc), 1); removeFromZones(G, card); }
  else if (zone === 'top') P.library.pop();
  else removeFromZones(G, card);
  G.stack.push(item);
  P.stats.cast++;
  P.cast = (P.cast || 0) + 1;
  item.nth = P.cast;
  emit(G, 'cast', `${P.name} casts ${def.name}${fromCmd ? ' from the command zone' : zone === 'xcast' ? (item.fromGy ? ' from a graveyard' : ' from exile') : zone === 'top' ? ' from the top of their library' : zone === 'flashback' ? ' with flashback' : zone === 'gycast' ? ' from their graveyard' : ''}${modeText(def, mode)}${x ? ` with X = ${x}` : ''}${targetText(G, item.targets)}.`, { who: P.i, card: card.id, targets: targetIds(item.targets) });
  if (!def.types.includes('Creature')) for (const c of P.bf) if (isCreature(c) && has(c, 'prowess')) { c.tp++; c.tt++; }
  // Abilities that trigger on casting resolve before the spell does
  if (isIS(def) && item.copyable && !opts.noSelfCopy && !G.over) offerSelfCopy(G, P, item);
  if (def.onCast && !G.over) def.onCast(G, P, item);
  if (isIS(def) && P.copyNext && P.copyNext.turn === G.turn && (P.copyNext.maxMv == null || def.mv <= P.copyNext.maxMv) && !G.over) { const n = P.copyNext.n; P.copyNext = null; for (let k = 0; k < n && !G.over; k++) copySpell(G, P, item); }
  if (G.pending) {
    fire(G, 'cast', { P, card, item, nth: P.cast, free: item.free, spent: item.spent || 0, fromGy: item.fromGy, zone });
    for (const t of allTargets(item.targets)) if (t.c) fire(G, 'targeted', { c: t.c, by: P, item, spell: true });
    if (!G.depth && !G.flushing) flush(G);
    sbaCore(G);
  }
  if (G.over) return true;
  if (item.countered) { finishCountered(G, item); return true; }
  // Ward: pay for each warded target an opponent controls, or the spell is countered
  if (!payWard(G, P, item, def)) { G.stack.splice(G.stack.indexOf(item), 1); toOwnerGy(G, card); emit(G, 'countered', `${def.name} is countered by ward.`, { who: P.i, cards: [card.id] }); return true; }
  const O = other(G, P);
  if (respondTo(G, O, P, item)) return true;
  if (G.over) return true;
  G.stack.splice(G.stack.indexOf(item), 1);
  resolveSpell(G, P, item, etbTargets);
  sba(G);
  return true;
}
function toOwnerGy(G, card) {
  if (card.def.advOf) card.def = card.def.advOf;
  else if (card.def.front && card.def.isBack && !card.token) card.def = card.def.front;
  if (card.token || card.isCopy) return;
  if (card.fbExile) { card.fbExile = false; G.players[card.owner].exile.push(card); return; }
  G.players[card.owner].gy.push(card);
}
const modeText = (def, mode) => (def.modes && mode && def.modes.length > 1 ? ` (${mode.map((k) => (def.modes[k].label || '').replace(/ \(\+.*\)$/, '')).filter(Boolean).join(', ')})` : '');
// An adventurer card: cast the adventure from hand; when it resolves the card is exiled and its land can be played later
function castAdventure(G, P, card, targets, opts = {}) {
  const land = card.def;
  const alt = altFace(land);
  if (!alt || !P.hand.includes(card)) return false;
  card.def = alt;
  const ok = castSpell(G, P, card, targets, null, opts);
  if (!ok && card.def === alt) card.def = land;
  return ok;
}
function finishCountered(G, item) {
  const k = G.stack.indexOf(item);
  if (k >= 0) G.stack.splice(k, 1);
  toOwnerGy(G, item.card);
  emit(G, 'countered', `${item.card.def.name} is countered.`, { who: item.P.i, cards: [item.card.id] });
}
function payWard(G, P, item, def) {
  for (const t of allTargets(item.targets)) {
    const c = t.c;
    if (!c || !onBf(G, c) || c.ctrl === P.i) continue;
    const w = Math.max(c.def.ward || 0, c.wardX || 0);
    if (c.def.wardCost) { if (!c.def.wardCost(G, P, c)) return false; continue; }
    if (!w) continue;
    if (!canPay(P, genericCost(w)) || !yesNo(G, P, c, `Pay ${w} for ${c.def.name}'s ward?`, true)) return false;
    pay(P, genericCost(w));
    emit(G, 'info', `${P.name} pays ${w} for ward.`, { who: P.i });
  }
  return true;
}
// The spell leaves the stack and does its thing: permanents enter, instants and sorceries resolve.
function resolveSpell(G, P, item, etbTargets) {
  const card = item.card, def = card.def;
  if (isPermanentSpell(def)) {
    if (def.aura) {
      const host = allTargets(item.targets).map((t) => t.c).find(Boolean);
      if (!host || !onBf(G, host) || !targetOk(G, P, def.aura.f || {}, host, card)) { emit(G, 'fizzle', `${def.name} has nothing to enchant and goes to the graveyard.`, { who: P.i }); toOwnerGy(G, card); return; }
      enterBattlefield(G, P, card, etbTargets, { attachTo: host });
      return;
    }
    enterBattlefield(G, P, card, etbTargets, { item, transformed: !!(def.isBack && def.front), tapped: !!item.sneak });
    if (item.sneak && onBf(G, card) && G.combat && isCreature(card)) { card.attacking = true; card.blocked = false; card.blockedBy = []; G.combat.attackers.push(card); emit(G, 'attack', `${card.def.name} enters tapped and attacking.`, { who: P.i, cards: [card.id] }); }
    return;
  }
  if (def.advOf) {
    G.resolving = card.id;
    resolveEffects(G, P, spellEffects(def, item.mode), card, item.targets, 'spell', { x: item.x, item, sac: item.sac, mode: item.mode });
    G.resolving = 0;
    card.def = def.advOf;
    card.fbExile = false;
    const Q = G.players[card.owner];
    Q.exile.push(card);
    Q.xcast.push({ card, until: Infinity, adv: true });
    emit(G, 'exile', `${card.def.name} is exiled on an adventure; ${Q.name} can play it as a land later.`, { who: Q.i, cards: [card.id] });
    return;
  }
  toOwnerGy(G, card);
  G.resolving = card.id;
  resolveEffects(G, P, spellEffects(def, item.mode), card, item.targets, 'spell', { x: item.x, item, sac: item.sac, mode: item.mode });
  G.resolving = 0;
}
// A copy of a spell: same choices, new targets chosen by its controller. A permanent spell's copy becomes a token.
function copySpell(G, Q, item, opts = {}) {
  const def = item.card.def;
  if (isPermanentSpell(def)) {
    const cdef = Object.assign({}, def, { id: `${def.id}-copy`, token: true, supertypes: opts.nonLegendary ? def.supertypes.filter((x) => x !== 'Legendary') : def.supertypes });
    G.defs[cdef.id] = cdef;
    const t = newCard(G, cdef, Q.i);
    t.token = true;
    emit(G, 'copy', `${Q.name} copies ${def.name}.`, { who: Q.i, card: item.card.id });
    enterBattlefield(G, Q, t, null, {});
    return;
  }
  const eff = spellEffects(def, item.mode);
  emit(G, 'copy', `${Q.name} copies ${def.name}.`, { who: Q.i, card: item.card.id });
  const copy = { id: -item.card.id, def, owner: Q.i, ctrl: Q.i, isCopy: true, tkw: [], cnt: 0, tp: 0, tt: 0, ctr: {}, tf: {} };
  resolveWithTargets(G, Q, copy, eff, { x: item.x, item, sac: item.sac, mode: item.mode, copy: true }, 'spell');
}
// The other player may answer a spell: counter it, send it back to its owner's hand, or copy it.
function respondTo(G, O, P, item) {
  if (silenced(G, O)) return false;
  const card = item.card, def = card.def;
  const uncounterable = def.uncounterable || item.unc;
  const legal = (c) => {
    const r = c.def.respond;
    if (!r) { const ce = c.def.spell && c.def.spell.find((e) => e.k === 'counter'); return !!ce && !uncounterable && counterLegal(c, item); }
    if (r.counter && uncounterable) return false;
    return r.legal(G, O, item);
  };
  const opts = O.hand.filter((c) => legal(c) && canPay(O, castCost(O, c), { def: c.def }));
  if (!opts.length) return false;
  let cs = null;
  if (isHuman(G, O)) {
    const a = ask(G, { type: 'counter', spell: card.id, options: opts.map((c) => c.id) });
    cs = opts.find((c) => c.id === a.id) || null;
  } else {
    const bar = PERSONAS[O.persona].counterBar;
    const ranked = opts.map((c) => ({ c, s: c.def.respond ? c.def.respond.ai(G, O, item) : (() => { const ce = c.def.spell.find((e) => e.k === 'counter'); return ce.unless && canPay(P, genericCost(ce.unless)) ? -1 : threatOf(G, O, item); })() })).filter((o) => o.s >= bar).sort((a, b) => b.s - a.s || a.c.def.mv - b.c.def.mv);
    if (ranked.length && G.rng.next() < 0.9) cs = ranked[0].c;
  }
  if (!cs) return false;
  // The answer is cast like any spell (and can trigger things); then it does its job on this spell
  pay(O, castCost(O, cs), { def: cs.def });
  O.hand.splice(O.hand.indexOf(cs), 1);
  O.stats.cast++;
  O.cast = (O.cast || 0) + 1;
  const ritem = { card: cs, P: O, targets: [{ c: card }], x: 0 };
  G.stack.push(ritem);
  emit(G, 'cast', `${O.name} casts ${cs.def.name}, targeting ${def.name}.`, { who: O.i, card: cs.id, targets: [card.id] });
  if (G.pending) { fire(G, 'cast', { P: O, card: cs, item: ritem, nth: O.cast }); if (!G.depth && !G.flushing) flush(G); sbaCore(G); }
  G.stack.splice(G.stack.indexOf(ritem), 1);
  O.gy.push(cs);
  if (G.over) return true;
  if (cs.def.respond) {
    const done = cs.def.respond.res(G, O, item, cs);
    sba(G);
    return done;
  }
  const ce = cs.def.spell.find((e) => e.k === 'counter');
  if (ce.unless && canPay(P, genericCost(ce.unless))) {
    pay(P, genericCost(ce.unless));
    emit(G, 'info', `${P.name} pays ${ce.unless}, so ${def.name} resolves.`, { who: P.i });
    return false;
  }
  G.stack.splice(G.stack.indexOf(item), 1);
  toOwnerGy(G, card);
  emit(G, 'countered', `${ce.unless ? `${P.name} can't pay ${ce.unless}. ` : ''}${def.name} is countered.`, { who: O.i, cards: [card.id] });
  const rest = cs.def.spell.filter((e) => e.k !== 'counter');
  if (rest.length) { G.resolving = cs.id; resolveEffects(G, O, rest, cs, null, 'trigger', { countered: item }); G.resolving = 0; }
  cmdHome(G);
  sba(G);
  return true;
}
// Enter the battlefield: any permanent. opts: { tapped, attachTo, item }
function enterBattlefield(G, P, card, etbTargets, opts = {}) {
  resetCard(card);
  card.inTurn = G.turn;
  if (opts.transformed && card.def.back) card.def = card.def.back;
  else if (opts.face) { card.faceBase = card.def; card.def = opts.face; }
  card.ctrl = P.i;
  card.g = G;
  card.tapped = (!!card.def.etbTapped || !!opts.tapped) && !(isLand(card) && P.bf.some((x) => x.def.landsUntapped));
  P.bf.push(card);
  noteEnter(G, P, card);
  if (card.def.etbCtr) for (const [k, n] of Object.entries(card.def.etbCtr(G, P, card))) { if (n > 0) { if (k === '+1/+1') card.cnt += n; else card.ctr[k] = n; } }
  if (opts.item && opts.item.finality) card.ctr.finality = 1;
  if (card.finCtr) { card.cnt += card.finCtr; card.finCtr = 0; }
  if (card.finHaste === G.turn) { card.tkw.push('haste'); card.finHaste = 0; }
  if (opts.ctr) for (const [k, n] of Object.entries(opts.ctr)) { if (k === '+1/+1') card.cnt += n; else card.ctr[k] = (card.ctr[k] || 0) + n; }
  if (isCreature(card) && P.noteBonus) { const b = P.noteBonus.filter((nb) => nb.turn === G.turn && card.def.sub.includes(nb.type)); if (b.length) { card.cnt += b.length; P.noteBonus = P.noteBonus.filter((nb) => !b.includes(nb)); } }
  if (opts.attachTo) card.att = opts.attachTo.id;
  dirty(G);
  emit(G, 'enter', `${card.def.name} enters the battlefield${opts.transformed && card.def.isBack ? ' transformed' : ''}${opts.attachTo ? ` attached to ${opts.attachTo.def.name}` : ''}${card.tapped && !card.def.etbTapped ? ' tapped' : ''}${card.ctr.finality ? ' with a finality counter' : ''}.`, { who: P.i, card: card.id });
  sba(G);
  if (G.over) return;
  if (card.def.saga) addLore(G, P, card, 1);
  if (card.def.etb.length) {
    // A human picks enter-the-battlefield targets while casting; anything missing or no longer legal is chosen now.
    let tg = null;
    if (etbTargets && etbTargets.some((t) => t)) {
      const auto = chooseTargets(G, P, card.def.etb, 'etb', card);
      tg = card.def.etb.map((e, k) => (etbTargets[k] === 'skip' ? 'skip' : etbTargets[k] && stillLegal(G, P, e, etbTargets[k], card) ? etbTargets[k] : auto ? auto.targets[k] : null));
    } else if (isHuman(G, P) && card.def.etb.some(needsTarget) && card.def.etbAskLate) tg = askTargets(G, P, card, card.def.etb, {});
    const n = gandalfTwice(G, P, card) ? 2 : 1;
    for (let i = 0; i < n && !G.over; i++) resolveEffects(G, P, card.def.etb, card, i ? null : tg, 'etb', { item: opts.item });
  }
  if (isLand(card) && !G.over) for (const x of P.bf.slice()) if (isCreature(x) && x.def.landfall && x.def.landfall.length && !G.over) resolveEffects(G, P, x.def.landfall, x, null, 'trigger');
  if (G.pending) { fire(G, 'enter', { c: card, P }); if (isLand(card)) fire(G, 'landfall', { c: card, P }); sba(G); }
}
// Sagas: a lore counter as it enters and after your draw step; each new counter's chapter triggers.
function addLore(G, P, saga, n) {
  const before = ctrCount(saga, 'lore');
  saga.ctr.lore = before + n;
  dirty(G);
  for (const ch of saga.def.saga) for (const k of ch.ch) if (k > before && k <= before + n) G.pending.push({ src: saga, P, t: { eff: ch.eff, run: ch.run, label: `Chapter ${'I II III IV V VI'.split(' ')[k - 1]}`, chapter: k, final: k === sagaFinal(saga.def) }, ev: { chapter: k } });
  emit(G, 'lore', `${saga.def.name} gets a lore counter (chapter ${'I II III IV V VI'.split(' ')[before + n - 1] || before + n}).`, { who: P.i, cards: [saga.id] });
}
function playLand(G, P, c, fromZone) {
  if (fromZone) removeFromZones(G, c); else P.hand.splice(P.hand.indexOf(c), 1);
  resetCard(c);
  c.g = G;
  c.sick = false;
  P.bf.push(c);
  P.landsPlayed++;
  P.stats.landsPlayed++;
  let tapped = c.def.etbTapped;
  if (c.def.checkland) tapped = !P.bf.some((x) => x !== c && x.def.sub.some((s) => c.def.checkland.includes(s)));
  if (c.def.tappedUnless) tapped = !c.def.tappedUnless(G, P);
  c.tapped = !!tapped && !P.bf.some((x) => x.def.landsUntapped);
  tapped = c.tapped;
  dirty(G);
  emit(G, 'land', `${P.name} plays ${c.def.name}${tapped ? ', which enters tapped' : ''}.`, { who: P.i, card: c.id });
  if (c.def.etb.length) resolveEffects(G, P, c.def.etb, c, null, 'etb');
  for (const x of P.bf.slice()) if (isCreature(x) && x.def.landfall && x.def.landfall.length && !G.over) resolveEffects(G, P, x.def.landfall, x, null, 'trigger');
  if (G.pending) { fire(G, 'enter', { c, P }); fire(G, 'landfall', { c, P }); sba(G); }
}

/* ---------- Activated abilities ----------
   def.acts: [{ cost: { m, tap, sacSelf, sac: { f, n, other }, discard, life, ctr: { kind, n }, tapCre, exileGy, exileSelf },
                eff | run, sorcery, once, cond(G, P, c), label, ai(G, P, c, when) -> { score, targets, x } | null, equip, only }]
   def.gyActs: the same, usable while the card is in your graveyard. */
const CREW_AB = { crew: true, label: 'Crew', cost: {} };
function abilitiesOf(G, P, c, zone) {
  const out = [];
  if (zone === 'gy') { (c.def.gyActs || []).forEach((ab, k) => out.push({ c, ab, k: `g${k}`, zone })); return out; }
  if ((c.tf && c.tf.noAbil) || (c.sfl && c.sfl.noAbil)) return out;
  if (c.sfl && c.sfl.noActs) return out;
  (c.def.acts || []).forEach((ab, k) => out.push({ c, ab, k: `${k}`, zone: 'bf' }));
  if (c.def.crew) out.push({ c, ab: CREW_AB, k: 'crew', zone: 'bf' });
  // Sharkey borrows the activated abilities (not mana abilities) of the opponents' lands
  if (c.def.sharkey) for (const land of other(G, P).bf.filter(isLand)) (land.def.acts || []).forEach((ab, k) => { if (!ab.cost.sacSelf) out.push({ c, ab, k: `s${land.id}.${k}`, zone: 'bf', borrowed: land }); });
  return out;
}
// Reduce a cost by another cost (power-up): matching colored mana first, then the rest comes off the generic part
function reduceCost(m, by) {
  let left = by.g || 0;
  for (const k of COLORS) { const n = by[k] || 0; if (!n) continue; const take = Math.min(m[k] || 0, n); m[k] = (m[k] || 0) - take; left += n - take; }
  for (const h of by.hy || []) {
    const i = (m.hy || []).indexOf(h);
    if (i >= 0) { m.hy = m.hy.slice(); m.hy.splice(i, 1); continue; }
    const col = [...h].find((k) => (m[k] || 0) > 0);
    if (col) m[col]--; else left++;
  }
  m.g = Math.max(0, m.g - left);
  return m;
}
const puLimit = (G, P) => 1 + P.bf.filter((x) => x.def.puExtra).length;
const puUsed = (c, k) => (c.mem && c.mem.pu && c.mem.pu[k]) || 0;
function abilityCost(G, P, c, ab) {
  const m = Object.assign(genericCost(0), ab.cost.m || {});
  if (m.hy) m.hy = m.hy.slice();
  if (ab.equip) {
    m.g = Math.max(0, m.g - P.bf.filter((x) => x.def.equipDiscount).length);
    if (G.active === P.i && P.bf.some((x) => x.def.equipFree) && P.freeEquipTurn !== G.turn) return genericCost(0);
  }
  if (ab.costMod) m.g = Math.max(0, m.g - ab.costMod(G, P, c));
  if (ab.powerUp) {
    if (c.inTurn === G.turn && c.def.cost) reduceCost(m, c.def.cost);
    const off = P.bf.filter((x) => x !== c && x.def.puDiscount).reduce((t, x) => t + x.def.puDiscount, 0);
    if (off) m.g = Math.max(0, m.g - off);
  }
  if (ab.costFn) return ab.costFn(G, P, c, m) || m;
  return m;
}
const abilityPurpose = (G, P, c, e) => ({ ability: true, src: c, equip: !!(e && e.ab && e.ab.equip), anyType: !!(e && e.borrowed) });
// Is this ability usable right now? when: 'main1' | 'main2' | 'attackers' | 'blocks' | 'end' | 'any'
function canActivate(G, P, e, when) {
  const { c, ab } = e;
  if (e.zone === 'gy' ? !P.gy.includes(c) : !P.bf.includes(c)) return false;
  const sorceryTime = G.active === P.i && (when === 'main1' || when === 'main2') && !G.stack.length;
  if (ab.sorcery && !sorceryTime && !(ab.equip && G.active === P.i && P.bf.some((x) => x.def.equipFast))) return false;
  if (ab.crew && (c.crewed || c.ani)) return false;
  if (ab.once) { const used = c.onceA && c.onceA[e.k]; if (used === G.turn) return false; }
  if (ab.powerUp && (puUsed(c, e.k) >= puLimit(G, P) || (G.puLocks && G.puLocks.includes(G.turn)))) return false;
  // Sharkey: the opponents' lands can only use mana abilities
  if (isLand(c) && !e.borrowed && other(G, P).bf.some((x) => x.def.sharkey)) return false;
  const k = ab.cost;
  if (k.tap && (c.tapped || (isCreature(c) && c.sick && !has(c, 'haste') && !P.bf.some((x) => x.def.hasteAbilities)))) return false;
  if (k.life && P.life < k.life) return false;
  if (k.discard && P.hand.length < k.discard) return false;
  if (k.ctr && ctrCount(c, k.ctr.kind) < k.ctr.n) return false;
  if (k.sac && sacOptions(G, P, c, k.sac).length < (k.sac.n || 1)) return false;
  if (k.tapCre && P.bf.filter((x) => x !== c && isCreature(x) && !x.tapped).length < k.tapCre) return false;
  if (k.exileGy && P.gy.filter((x) => x !== c).length < k.exileGy) return false;
  if (ab.crew && P.bf.filter((x) => x !== c && isCreature(x) && !x.tapped).reduce((s, x) => s + Math.max(0, pow(x)), 0) < c.def.crew) return false;
  if (ab.cond && !ab.cond(G, P, c, e)) return false;
  if (ab.equip && !P.bf.some((x) => x !== c && isCreature(x) && x.id !== c.att && (!ab.only || matches(G, x, ab.only, P, c)))) return false;
  const m = abilityCost(G, P, c, ab);
  if (k.xMin != null) { if (!canPay(P, Object.assign({}, m, { g: m.g + k.xMin }), abilityPurpose(G, P, c, e))) return false; }
  else if (!canPay(P, m, abilityPurpose(G, P, c, e))) return false;
  return true;
}
const sacOptions = (G, P, c, f) => P.bf.filter((x) => (f.self || x !== c || f.selfOk) && matches(G, x, f.f || f, P, c) && (!f.other || x !== c));
// Pay everything but mana for an ability, choosing what to sacrifice, discard, tap or exile
function payOtherCosts(G, P, e, X) {
  const { c, ab } = e;
  const k = ab.cost;
  if (k.tap) c.tapped = true;
  if (k.life) { P.life -= k.life; emit(G, 'life', `${P.name} pays ${k.life} life.`, { who: P.i, target: `p${P.i}`, amount: k.life }); }
  if (k.ctr) removeCounters(G, c, k.ctr.kind, k.ctr.n);
  if (k.tapCre) {
    const cs = P.bf.filter((x) => x !== c && isCreature(x) && !x.tapped);
    const pick = isHuman(G, P) && cs.length > k.tapCre ? pickCards(G, { type: 'choose', reason: 'tap-cost', n: k.tapCre, min: k.tapCre, max: k.tapCre, zone: 'battlefield', cards: cs.map((x) => x.id), label: c.def.name }, cs, k.tapCre) : cs.sort((a, b) => (a.sick ? 0 : 1) - (b.sick ? 0 : 1) || cv(a) - cv(b)).slice(0, k.tapCre);
    pick.forEach((x) => { x.tapped = true; });
  }
  if (k.exileGy) {
    const cs = P.gy.filter((x) => x !== c);
    const pick = isHuman(G, P) && cs.length > k.exileGy ? pickCards(G, { type: 'choose', reason: 'exile-cost', n: k.exileGy, min: k.exileGy, max: k.exileGy, zone: 'graveyard', cards: cs.map((x) => x.id), label: c.def.name }, cs, k.exileGy) : cs.slice().sort((a, b) => a.def.value - b.def.value).slice(0, k.exileGy);
    pick.forEach((x) => { P.gy.splice(P.gy.indexOf(x), 1); P.exile.push(x); });
    dirty(G);
  }
  if (k.discard) { X.discarded = P.hand.slice(); discardChoice(G, P, k.discard, 'discard-cost'); X.discarded = X.discarded.filter((x) => P.gy.includes(x)); }
  if (k.exileSelf) { P.gy.splice(P.gy.indexOf(c), 1); P.exile.push(c); dirty(G); }
  if (k.exileSelfBf && onBf(G, c)) { X.selfCtr = Object.assign({}, c.ctr); exilePermanent(G, P, c); }
  if (k.sac) {
    const n = k.sac.n || 1;
    const opts = sacOptions(G, P, c, k.sac);
    let pick;
    if (isHuman(G, P) && opts.length > n) pick = pickCards(G, { type: 'choose', reason: 'sacrifice-cost', n, min: n, max: n, zone: 'battlefield', cards: opts.map((x) => x.id), label: c.def.name }, opts, n);
    else pick = opts.slice().sort((a, b) => (k.sac.prefer ? k.sac.prefer(G, b) - k.sac.prefer(G, a) : 0) || pv(G, a) - pv(G, b) || a.id - b.id).slice(0, n);
    X.sacd = pick.map((x) => ({ c: x, leg: isLegendary(x), pow: isCreature(x) ? pow(x) : 0, cre: isCreature(x), orc: isCreature(x) && orcish(x), name: x.def.name }));
    for (const x of pick) { emit(G, 'sac', `${P.name} sacrifices ${x.def.name}.`, { who: P.i, cards: [x.id] }); sacrifice(G, P, x, true); }
  }
  if (k.sacSelf) { emit(G, 'sac', `${P.name} sacrifices ${c.def.name}.`, { who: P.i, cards: [c.id] }); X.self = { leg: isLegendary(c), pow: isCreature(c) ? pow(c) : 0, cnt: c.cnt, ctr: Object.assign({}, c.ctr), eqs: equipmentOn(G, c), mv: c.def.mv }; sacrifice(G, P, c, true); }
}
function activate(G, P, e, targets, opts = {}) {
  const { c, ab } = e;
  if (ab.crew) return crew(G, P, c, opts.crewWith);
  const X = { x: 0, ab, entry: e };
  const m = abilityCost(G, P, c, ab);
  if (ab.cost.m && ab.cost.m.x) {
    const purpose = abilityPurpose(G, P, c, e);
    let max = 0;
    while (max < 20 && canPay(P, Object.assign({}, m, { g: m.g + (max + 1) * ab.cost.m.x }), purpose)) max++;
    const min = ab.cost.xMin || 0;
    X.x = opts.x != null ? Math.min(opts.x, max) : isHuman(G, P) ? chooseNumber(G, P, c, `${c.def.name}: choose X`, min, max, max) : Math.min(max, ab.aiX ? ab.aiX(G, P, c, max) : max);
    m.g += X.x * ab.cost.m.x;
  }
  if (!pay(P, m, abilityPurpose(G, P, c, e))) return false;
  if (ab.equip && G.active === P.i && P.bf.some((x) => x.def.equipFree) && P.freeEquipTurn !== G.turn) P.freeEquipTurn = G.turn;
  if (ab.once) { c.onceA = c.onceA || {}; c.onceA[e.k] = G.turn; }
  if (ab.powerUp) { c.mem = c.mem || {}; c.mem.pu = c.mem.pu || {}; c.mem.pu[e.k] = puUsed(c, e.k) + 1; }
  const here = onBf(G, c);
  const untappedBefore = P.bf.filter((x) => isCreature(x) && !x.tapped);
  payOtherCosts(G, P, e, X);
  { const tapped = untappedBefore.filter((x) => x.tapped); if (tapped.length && G.pending) fire(G, 'tapped', { P, cs: tapped }); }
  emit(G, 'ability', `${P.name} ${ab.equip ? `equips ${c.def.name}` : `activates ${e.borrowed ? `${e.borrowed.def.name}'s ability on ${c.def.name}` : c.def.name}${ab.label && !ab.equip ? `: ${ab.label}` : ''}`}${X.x ? ` (X = ${X.x})` : ''}${targetText(G, targets)}.`, { who: P.i, card: c.id, targets: targetIds(targets), here });
  for (const t of allTargets(targets)) { if (t.c && onBf(G, t.c)) fire(G, 'targeted', { c: t.c, by: P, ability: true }); else if (!t.c && t.p != null) fire(G, 'targeted', { c: null, p: t.p, by: P, ability: true }); }
  if (ab.equip) { const t = targets && targets[0] && targets[0].c; if (t && onBf(G, t) && t.ctrl === P.i && isCreature(t)) attach(G, c, t); sba(G); return true; }
  G.resolving = c.id;
  const echo = takeEcho(G, P, c);
  for (let r = 0; r <= echo && !G.over; r++) {
    if (r) emit(G, 'copy', `${c.def.name}'s ability is copied.`, { who: P.i, card: c.id });
    if (ab.run) { ab.run(G, Object.assign(X, { P, O: other(G, P), src: c }), targets); sba(G); }
    else resolveEffects(G, P, ab.eff, c, targets || null, 'ability', X);
  }
  G.resolving = 0;
  sba(G);
  return true;
}
function takeEcho(G, P, src) {
  const e = P.echoNext;
  if (!e || e.turn !== G.turn || e.src === src.id) return 0;
  if (e.creature && !(src.def && src.def.types.includes('Creature'))) return 0;
  if (e.artifact && !(src.def && src.def.types.includes('Artifact'))) return 0;
  P.echoNext = null;
  return e.n;
}
function crew(G, P, v, chosen) {
  const cs = P.bf.filter((x) => x !== v && isCreature(x) && !x.tapped);
  let pick;
  if (chosen) pick = chosen;
  else if (isHuman(G, P)) pick = pickCards(G, { type: 'choose', reason: 'crew', n: cs.length, min: 1, max: cs.length, zone: 'battlefield', cards: cs.map((x) => x.id), need: v.def.crew, label: v.def.name }, cs, null);
  else pick = crewTeam(G, P, v);
  // Top up a short crew so the vehicle still gets crewed (keeps replays in step)
  let total = pick.reduce((s, x) => s + Math.max(0, pow(x)), 0);
  for (const x of cs.slice().sort((a, b) => pow(b) - pow(a))) { if (total >= v.def.crew) break; if (!pick.includes(x)) { pick.push(x); total += Math.max(0, pow(x)); } }
  if (total < v.def.crew) return false;
  pick.forEach((x) => { x.tapped = true; });
  if (G.pending) fire(G, 'tapped', { P, cs: pick.slice() });
  v.crewed = true;
  v.crewBy = { turn: G.turn, ids: pick.map((x) => x.id) };
  dirty(G);
  emit(G, 'ability', `${P.name} crews ${v.def.name} with ${nameList(pick)}.`, { who: P.i, card: v.id, cards: pick.map((x) => x.id) });
  fire(G, 'crewed', { c: v, P });
  sba(G);
  return true;
}
function crewTeam(G, P, v) {
  const cs = P.bf.filter((x) => x !== v && isCreature(x) && !x.tapped).sort((a, b) => (a.sick ? 0 : 1) - (b.sick ? 0 : 1) || cv(a) - cv(b));
  const out = [];
  let total = 0;
  for (const x of cs) { if (total >= v.def.crew) break; out.push(x); total += Math.max(0, pow(x)); }
  return total >= v.def.crew ? out : [];
}
// AI: crew a vehicle before attacks when the crew is worth less on the attack than the vehicle
function aiCrew(G, A, D) {
  for (const v of A.bf.slice()) {
    if (!v.def.crew || v.crewed || v.ani || v.sick || v.tapped) continue;
    const team = crewTeam(G, A, v);
    if (!team.length) continue;
    const lost = team.reduce((s, x) => s + (x.sick || has(x, 'defender') ? 0 : cv(x) * 0.6), 0);
    const gain = v.def.power + v.def.toughness * 0.4 + (v.def.kw.includes('trample') ? 1 : 0);
    if (gain > lost + 1) crew(G, A, v, team);
  }
}
// All abilities P could activate now
function readyAbilities(G, P, when) {
  const out = [];
  for (const c of P.bf.slice()) for (const e of abilitiesOf(G, P, c, 'bf')) if (canActivate(G, P, e, when)) out.push(e);
  for (const c of P.gy.slice()) for (const e of abilitiesOf(G, P, c, 'gy')) if (canActivate(G, P, e, when)) out.push(e);
  return out;
}
// AI: what an ability costs it, beyond the mana
function costPain(G, P, e, when) {
  const { c, ab } = e;
  const k = ab.cost;
  let s = costMV(abilityCost(G, P, c, ab)) * (when === 'main1' ? 0.3 : when === 'main2' ? 0.12 : 0.04);
  if (k.tap && isCreature(c)) s += when === 'main1' && canAttackNow(G, c) ? 0.8 : G.active !== P.i ? 0.1 : 0.4;
  if (k.sacSelf) s += ab.food ? 0.2 : pv(G, c);
  if (k.sac) { const o = sacOptions(G, P, c, k.sac).sort((a, b) => pv(G, a) - pv(G, b)); s += o.slice(0, k.sac.n || 1).reduce((t, x) => t + (hasSub(x, 'Food') && !isCreature(x) ? 0.4 : hasSub(x, 'Treasure') ? 0.6 : pv(G, x)), 0); }
  if (k.life) s += k.life * lifeW(P) * 1.5;
  if (k.discard) s += Math.min(...P.hand.map((x) => handValue(G, P, x))) * 0.5 * k.discard;
  if (k.ctr) s += k.ctr.n * (k.ctr.kind === '+1/+1' ? 0.9 : 0.4);
  if (k.tapCre) s += 0.4;
  if (k.exileGy) s += 0.15 * k.exileGy;
  return s;
}
function aiAbilities(G, P, when) {
  for (let guard = 0; guard < 8 && !G.over; guard++) {
    let best = null;
    for (const e of readyAbilities(G, P, when)) {
      const { c, ab } = e;
      if (ab.crew || ab.equip || ab.noAi) continue;
      if (ab.when ? !ab.when.includes(when) : when === 'blocks') continue;
      let r;
      if (ab.ai) r = ab.ai(G, P, c, when, e);
      else {
        const ch = ab.eff ? chooseTargets(G, P, ab.eff, when === 'main1' ? 'main1' : when === 'end' ? 'main2' : 'combat', c, { x: 0 }) : null;
        r = ch ? { score: ch.score - costPain(G, P, e, when), targets: ch.targets } : null;
      }
      if (r && r.score > (ab.bar != null ? ab.bar : 0.6) && (!best || r.score > best.r.score)) best = { e, r };
    }
    if (!best) return;
    if (!activate(G, P, best.e, best.r.targets || null, { x: best.r.x })) return;
  }
}
// AI: put equipment on the creature that gains most from it (before attacks)
function aiEquip(G, P, when) {
  for (let guard = 0; guard < 4 && !G.over; guard++) {
    let best = null;
    for (const e of readyAbilities(G, P, when)) {
      if (!e.ab.equip) continue;
      const eq = e.c;
      const host = eq.att != null ? byId(G, eq.att) : null;
      for (const t of P.bf) {
        if (!isCreature(t) || t === host || (e.ab.only && !matches(G, t, e.ab.only, P, eq))) continue;
        let s = equipGain(G, P, eq, t) - (host ? equipGain(G, P, eq, host) : 0) - costMV(abilityCost(G, P, eq, e.ab)) * 0.25;
        if (when === 'main1' && !canAttackNow(G, t)) s -= 0.6;
        if (!best || s > best.s) best = { e, t, s };
      }
    }
    if (!best || best.s < 0.6) return;
    activate(G, P, best.e, [{ c: best.t }]);
  }
}
function equipGain(G, P, eq, t) {
  let s = 0;
  for (const st of eq.def.statics || []) if (st.who === 'equipped') { s += (st.p || 0) * 0.9 + (st.t || 0) * 0.5 + (st.kw || []).filter((k) => !has(t, k)).reduce((x, k) => x + kwValue(k, Math.max(0, pow(t))) * 0.8, 0); if (st.f && !matches(G, t, st.f, P, eq)) s -= (st.p || 0) * 0.9 + (st.t || 0) * 0.5; }
  if (eq.def.equipAi) s += eq.def.equipAi(G, P, t);
  if (has(t, 'flying') || t.def.unblockable) s *= 1.3;
  if (isLegendary(t)) s += 0.2;
  if (t.sick && !has(t, 'haste')) s *= 0.8;
  return s;
}

/* ---------- AI: main phase ---------- */
function chooseLand(G, P) {
  const choices = landChoices(G, P);
  const lands = choices.map((x) => x.c);
  if (!lands.length) return null;
  const produced = new Set(P.bf.filter((c) => c.def.mana).flatMap((c) => c.def.mana));
  const want = {};
  for (const c of P.hand) if (!isLand(c)) for (const col of COLORS) if (c.def.cost[col]) want[col] = (want[col] || 0) + c.def.cost[col];
  const curMana = P.bf.filter(isLand).length;
  const castableNow = P.hand.some((c) => !isLand(c) && c.def.mv === curMana + 1);
  let best = null, bestScore = -Infinity;
  for (const c of lands) {
    let s = 0;
    for (const col of c.def.mana || []) s += want[col] ? (produced.has(col) ? 1 : 3) : 0.2;
    const entersTapped = c.def.etbTapped || (c.def.checkland && !P.bf.some((x) => x.def.sub.some((t) => c.def.checkland.includes(t))));
    if (entersTapped) s += castableNow ? -3 : 1.2;
    const ch = choices.find((x) => x.c === c);
    if (ch.from !== 'hand') s += 2; // free value: a land from exile, the library or the graveyard
    if (c.def.adv && P.hand.includes(c) && lands.length > 1) s -= 2.5 + (P.bf.filter(isLand).length >= c.def.adv.mv - 1 ? 1.5 : 0); // keep it for its adventure
    if (c.def.landScore) s += c.def.landScore(G, P, c);
    if (s > bestScore) { bestScore = s; best = ch; }
  }
  return best;
}
function hasHeldTricks(P) {
  return P.hand.some((c) => c.def.spell && isInstantSpeed(c.def) && c.def.spell.some((e) => ['pump', 'pumpTeam', 'counter'].includes(e.k)));
}
// The most X a player can pay for a card right now
function maxX(G, P, card, purpose) {
  let x = 0;
  while (x < 20 && canPay(P, castCost(P, card, [], x + 1), purpose)) x++;
  return x;
}
function evalCast(G, P, card, ctx) {
  const def = card.def;
  const per = PERSONAS[P.persona];
  if (isLand(card)) return null;
  const zone = castZone(G, P, card);
  if (!zone || def.respondOnly) return null;
  const xc = zone === 'xcast' ? xcastOf(G, P, card) : null;
  const purpose = { def, anyType: !!(xc && xc.anyType) };
  let x = 0;
  if (def.cost.x) { x = maxX(G, P, card, purpose); if (def.aiX) x = def.aiX(G, P, card, x); if (x == null || x < (def.minX || 0)) return null; }
  if (!def.costMod && !canPay(P, castCost(P, card, [], x), purpose)) return null;
  if (def.castIf && !def.castIf(G, P, card)) return null;
  let addc = null;
  if (def.addCost) { addc = aiAddCost(G, P, card); if (!addc) return null; if (addc.pay && !canPayBoth(P, castCost(P, card, [], x), addc.pay)) return null; }
  const pain = addc ? addc.pain || 0 : 0;
  if (def.supertypes.includes('Legendary') && isPermanentSpell(def) && P.bf.some((c) => c.def.name === def.name)) return null;
  if (def.types.includes('Creature')) {
    if (def.costMod && !canPay(P, castCost(P, card, [], x), purpose)) return null;
    if (def.sacAtEnd && ctx !== 'main1') return null;
    let s = 2 + def.value * 0.6 + def.mv * 0.35;
    const ch = def.etb.length ? chooseTargets(G, P, def.etb, 'etb', card) : { score: 0, targets: [] };
    if (ch) s += Math.max(-4, ch.score * 0.5);
    if (ctx === 'main1' && !def.kw.includes('haste') && hasHeldTricks(P) && P.persona !== 'aggro') s -= 1;
    if (def.kw.includes('flash') && ctx !== 'end' && per.hold >= 0.6) s -= 1.5;
    if (P.command.includes(card)) s -= CMD.tax * P.cmdCasts * 0.3; // the tax makes a recast worse value than a fresh card
    if (def.castScore) s += def.castScore(G, P, card, ctx);
    return { score: s - pain, targets: [], x };
  }
  if (isPermanentSpell(def)) {
    if (def.costMod && !canPay(P, castCost(P, card, [], x), purpose)) return null;
    let s = 2 + def.value * 0.6 + def.mv * 0.2, targets = [];
    if (def.aura) {
      const best = auraHost(G, P, card);
      if (!best || best.s <= 0.4) return null;
      s = 1 + best.s; targets = [{ c: best.c }];
    } else if (def.acts.some((a) => a.equip) && !P.bf.some(isCreature)) s -= 2;
    if (def.etb.length) { const ch = chooseTargets(G, P, def.etb, 'etb', card); if (ch) s += Math.max(-4, ch.score * 0.5); }
    if (isInstantSpeed(def) && ctx !== 'end' && ctx !== 'combat' && per.hold >= 0.6 && !def.aura) s -= 1.5;
    if (def.castScore) s += def.castScore(G, P, card, ctx);
    return s - pain > 0.5 ? { score: s - pain, targets, x } : null;
  }
  // Instants and sorceries; a modal spell tries each choice of modes
  const options = def.modes ? modeChoices(G, P, def) : [null];
  let pick = null;
  for (const mode of options) {
    if (mode && def.modes.some((m) => m.cost) && !canPay(P, castCost(P, card, [], x, mode), purpose)) continue;
    let maddc = addc;
    if (mode && acOf(def, mode) !== def.addCost) {
      maddc = aiAddCost(G, P, card, mode); if (!maddc) continue;
      if (maddc.teamwork && maddc.tw) { const was = maddc.tw.map((c) => c.tapped); maddc.tw.forEach((c) => { c.tapped = true; }); const ok = canPay(P, castCost(P, card, [], x, mode), purpose); maddc.tw.forEach((c, k) => { c.tapped = was[k]; }); if (!ok) continue; }
    }
    const mpain = maddc ? maddc.pain || 0 : 0;
    const eff = spellEffects(def, mode);
    let ch = chooseTargets(G, P, eff, ctx, card, { x, mode, kicked: maddc !== addc, sac: maddc && maddc.sac ? { leg: isLegendary(maddc.sac) } : null });
    if (ch && def.costMod && !canPay(P, castCost(P, card, ch.targets, x, mode), purpose)) ch = chooseTargets(G, P, eff, ctx, card, { x, mode, cheapOnly: true });
    if (!ch || (def.costMod && !canPay(P, castCost(P, card, ch.targets, x, mode), purpose))) continue;
    const ms = ch.score - mpain - (mode ? mode.reduce((t, k) => t + (def.modes[k].cost ? costMV(def.modes[k].cost) * 0.12 : 0), 0) : 0);
    if (!pick || ms > pick.ms) pick = { ch, mode, eff, pain: mpain, ms };
  }
  if (!pick) return null;
  const ch = pick.ch;
  if (ch.score - pick.pain <= 0.2) return null;
  let s = ch.score - pick.pain;
  if (isInstantSpeed(def) && (ctx === 'main1' || ctx === 'main2') && s < 60) {
    s -= per.hold * 2.2;
    if (per.hold >= 0.6 && s < 4) return null; // control saves instants for the opponent's turn
  }
  if (pick.eff.some((e) => e.k === 'draw' || e.k === 'loot') && isInstantSpeed(def) && ctx !== 'end') s -= 1.5;
  if (def.castScore) s += def.castScore(G, P, card, ctx);
  return s > 0.3 ? { score: s + def.mv * 0.1, targets: ch.targets, x, mode: pick.mode } : null;
}
// Which sets of modes a modal spell could be cast with (choose one, or up to two with a Wizard for Flame of Anor)
function modeChoices(G, P, def) {
  const n = typeof def.modeN === 'function' ? def.modeN(G, P) : def.modeN || 1;
  const out = def.modes.map((m, k) => [k]);
  if (n >= 2) for (let i = 0; i < def.modes.length; i++) for (let j = i + 1; j < def.modes.length; j++) out.push([i, j]);
  return out;
}
// The best creature for an Aura: buffs go on your own, curses on theirs
function auraHost(G, P, card) {
  const d = card.def;
  let best = null;
  for (const c of allCreatures(G)) {
    if (!targetOk(G, P, d.aura.f || {}, c, card)) continue;
    let s;
    if (d.auraVal) s = d.auraVal(G, P, c);
    else {
      const st = d.statics.filter((x) => x.who === 'enchanted');
      const buff = st.reduce((t, x) => t + (x.p || 0) * 0.9 + (x.t || 0) * 0.6 + (x.kw || []).filter((k) => !has(c, k)).reduce((y, k) => y + kwValue(k, Math.max(0, pow(c))), 0), 0);
      const lock = st.some((x) => x.flags && (x.flags.cantAttack || x.flags.cantBlock || x.flags.noUntap));
      if (lock || buff < 0) s = c.ctrl === P.i ? -cv(c) : cv(c) * (lock ? 0.9 : 0.4) + (lock ? 0 : -buff * 0.3);
      else s = c.ctrl === P.i ? buff * (has(c, 'flying') || c.def.unblockable ? 1.3 : 1) + 0.3 : -buff;
    }
    if (!best || s > best.s) best = { c, s };
  }
  return best;
}
// Every card P could cast from somewhere: hand, command zone, exile (Shadow of the Enemy, Moria Marauder), the top of the library (Elven Chorus)
function castables(G, P) {
  const out = P.hand.concat(P.command);
  for (const x of P.xcast) if (x.until >= G.turn && !out.includes(x.card) && !isLand(x.card)) out.push(x.card);
  const top = P.library[P.library.length - 1];
  if (top && !isLand(top) && !out.includes(top) && castZone(G, P, top) === 'top') out.push(top);
  const anyGy = P.bf.some((c) => c.def.gyCast);
  for (const c of P.gy) if (!isLand(c) && (c.def.flashback || anyGy) && !out.includes(c) && castZone(G, P, c)) out.push(c);
  return out;
}
// How many lands P may play this turn (Zell Dincht: one more)
const landLimit = (G, P) => 1 + P.bf.filter((c) => c.def.extraLand).length;
// Every land P could play now: from hand, from exile (adventures, effects), the top of the library or the graveyard
function landChoices(G, P) {
  const out = P.hand.filter(isLand).map((c) => ({ c, from: 'hand' }));
  for (const x of P.xcast) if (x.until >= G.turn && isLand(x.card) && G.players.some((Q) => Q.exile.includes(x.card))) out.push({ c: x.card, from: 'exile', x });
  const top = P.library[P.library.length - 1];
  if (top && isLand(top) && P.bf.some((c) => c.def.topLand && c.def.topLand(G, P, top, c))) out.push({ c: top, from: 'top' });
  if (P.bf.some((c) => c.def.gyLand && c.def.gyLand(G, P, c))) for (const c of P.gy) if (isLand(c)) out.push({ c, from: 'gy' });
  return out;
}
function playLandChoice(G, P, ch) {
  if (ch.from === 'hand') return playLand(G, P, ch.c);
  if (ch.x) P.xcast.splice(P.xcast.indexOf(ch.x), 1);
  return playLand(G, P, ch.c, true);
}
function cheapestCounter(P) {
  return P.hand.filter((c) => c.def.spell && c.def.spell.some((e) => e.k === 'counter')).sort((a, b) => a.def.mv - b.def.mv)[0];
}
function aiMain(G, P, which) {
  const ctx = which === 1 ? 'main1' : 'main2';
  G.phase = ctx;
  for (let k = 0; k < 3 && P.landsPlayed < landLimit(G, P) && !G.endTurn && !G.over; k++) { const land = chooseLand(G, P); if (!land) break; playLandChoice(G, P, land); }
  for (let guard = 0; guard < 14 && !G.over; guard++) {
    let best = null;
    for (const c of castables(G, P)) {
      if (isLand(c)) continue;
      const r = evalCast(G, P, c, ctx);
      if (!r) continue;
      // Keep counterspell mana open on the opponent's turn while they still have cards to cast.
      const holdBar = P.persona === 'control' ? 7 : P.persona === 'midrange' && ctx === 'main2' ? 4.5 : 0;
      const cnt = holdBar && other(G, P).hand.length >= 2 ? cheapestCounter(P) : null;
      if (cnt && cnt !== c && r.score < holdBar && !canPayBoth(P, castCost(P, c), cnt.def.cost)) continue;
      if (!best || r.score > best.score) best = { c, ...r };
    }
    if (ctx === 'main2') {
      const ping = bestPing(G, P, ctx);
      if (ping && ping.score >= 3.5 && (!best || ping.score > best.score)) { firePing(G, P, ping); continue; }
    }
    // Adventures: a Town in hand can be cast as its adventure
    for (const c of P.hand) {
      if (!altFace(c.def)) continue;
      const land = c.def;
      c.def = altFace(land);
      let r = null;
      try { r = evalCast(G, P, c, ctx); } finally { c.def = land; }
      if (r && (!best || r.score > best.score)) best = Object.assign({ c, adv: true }, r);
    }
    if (!best) break;
    if (best.adv) castAdventure(G, P, best.c, best.targets, { x: best.x, mode: best.mode });
    else castSpell(G, P, best.c, best.targets, null, { x: best.x, mode: best.mode });
    if (G.endTurn) break;
  }
  if (!G.over) { aiEquip(G, P, ctx); aiAbilities(G, P, ctx); }
}

/* ---------- AI: combat ---------- */
function canBlock(G, b, a) {
  if (!isCreature(b) || b.tapped || b.def.cantBlock || b.noBlock) return false;
  if (a.def.unblockable) return false;
  if ((b.sfl && b.sfl.cantBlock) || (b.tf && b.tf.cantBlock)) return false;
  if (b.def.blockIf && !b.def.blockIf(G, b)) return false;
  if (G.noBlockNoFly === G.turn && !has(b, 'flying')) return false;
  if ((a.tf && a.tf.unblockable) || (a.sfl && a.sfl.unblockable)) return false;
  if (a.tf && a.tf.hasteOnly && !has(b, 'haste')) return false;
  if (has(b, 'flying') && G.players[a.ctrl] && G.players[a.ctrl].bf.some((x) => x.def.noFlyers)) return false;
  if (a.def.blockOnlyBy && !a.def.blockOnlyBy(G, b, a)) return false;
  const AP = G.players[a.ctrl];
  if (AP && AP.ring && AP.ring.n >= 1 && AP.ring.bearer === a.id && pow(b) > pow(a)) return false;
  if (a.tf && a.tf.proTypes && a.tf.proTypes.includes('Creature')) return false;
  if (a.def.noWallBlock && b.def.sub.includes('Wall')) return false;
  if (protectedFrom(a, b)) return false;
  const D = ctrlOf(G, b);
  if (a.def.landwalk && D.bf.some((x) => isLand(x) && x.def.sub.includes(a.def.landwalk))) return false;
  if (has(a, 'flying') && !has(b, 'flying') && !has(b, 'reach')) return false;
  if (b.def.blockFlyersOnly && !has(a, 'flying')) return false;
  return true;
}
function kills(src, dst) {
  if (pow(src) <= 0 || has(dst, 'indestructible') || protectedFrom(dst, src)) return false;
  return has(src, 'deathtouch') || dmgOut(src) >= tou(dst) - dst.dmg;
}
function fight(a, b) {
  const aFirst = has(a, 'first strike') || has(a, 'double strike');
  const bFirst = has(b, 'first strike') || has(b, 'double strike');
  let aDies = kills(b, a), bDies = kills(a, b);
  if (aFirst && !bFirst && (has(a, 'deathtouch') || pow(a) >= tou(b) - b.dmg) && !has(b, 'indestructible')) aDies = false;
  if (bFirst && !aFirst && (has(b, 'deathtouch') || pow(b) >= tou(a) - a.dmg) && !has(a, 'indestructible')) bDies = false;
  return { aDies, bDies };
}
function blockersFor(G, D, a) {
  const bs = D.bf.filter((b) => canBlock(G, b, a));
  return bs.length < minBlockers(a) ? [] : bs;
}
function unblockedDamage(G, attackers, D) {
  const free = D.bf.filter((b) => isCreature(b) && !b.tapped && !b.def.cantBlock);
  const used = new Set();
  let total = 0;
  for (const a of attackers.slice().sort((x, y) => dmgOut(y) - dmgOut(x))) {
    const need = minBlockers(a);
    const bs = free.filter((b) => !used.has(b) && canBlock(G, b, a));
    if (bs.length >= need) {
      bs.sort((x, y) => cv(x) - cv(y)).slice(0, need).forEach((b) => used.add(b));
      if (has(a, 'trample')) total += Math.max(0, dmgOut(a) - bs.slice(0, need).reduce((s, b) => s + tou(b) - b.dmg, 0));
    } else total += dmgOut(a);
  }
  return total;
}
function aiAttackers(G, A, D) {
  const per = PERSONAS[A.persona];
  // Long games break stalls: from turn 24 on, players get steadily more willing to trade.
  const late = clamp01((G.turn - 24) / 20);
  const cands = A.bf.filter((c) => canAttackNow(G, c) && (pow(c) > 0 || c.def.mustAttack || mustAttackNow(G, c)));
  if (!cands.length) return [];
  const reachable = cands.filter((c) => pow(c) > 0);
  const burnInHand = A.hand.filter((c) => c.def.spell && c.def.spell.some((e) => e.k === 'dmg' && e.to !== 'creature') && canPay(A, c.def.cost))
    .reduce((s, c) => s + c.def.spell.filter((e) => e.k === 'dmg').reduce((x, e) => x + e.n, 0), 0);
  if (unblockedDamage(G, reachable, D) + burnInHand >= D.life) return cands;
  if (G.format === 'commander' && reachable.some((c) => c.cmdr && !blockersFor(G, D, c).length && dmgOut(c) >= CMD.lethal - (D.cmdDmg[c.id] || 0))) return cands;
  const chosen = [];
  for (const c of cands) {
    if (c.def.mustAttack || c.def.sacAtEnd || mustAttackNow(G, c)) { chosen.push(c); continue; }
    const bs = blockersFor(G, D, c);
    if (!bs.length) { chosen.push(c); continue; }
    const outs = bs.map((b) => ({ b, ...fight(c, b) }));
    if (!outs.some((o) => o.aDies)) {
      const dbl = bs.length >= 2 && bestDoubleBlock(G, c, bs);
      if (!dbl || G.rng.next() < per.attack - 0.35 + late) chosen.push(c);
      continue;
    }
    const eaten = outs.some((o) => o.aDies && !o.bDies);
    if (eaten) { if (per.attack >= 0.8 && D.life <= 5 && G.rng.next() < 0.5) chosen.push(c); continue; }
    const trades = outs.filter((o) => o.aDies && o.bDies);
    const bestTrade = trades.length ? Math.max(...trades.map((o) => cv(o.b))) : 0;
    if (cv(c) <= bestTrade + 0.4 + late * 3 || G.rng.next() < per.attack - 0.25 + late * 0.5) chosen.push(c);
  }
  // Keep enough blockers home if the crack-back could be lethal.
  const threats = D.bf.filter((c) => isCreature(c) && !has(c, 'defender') && pow(c) > 0);
  const crack = threats.reduce((s, c) => s + dmgOut(c), 0);
  if (crack >= A.life) {
    const prevented = () => {
      const home = A.bf.filter((c) => isCreature(c) && !c.def.cantBlock && (!chosen.includes(c) || has(c, 'vigilance')));
      const used = new Set();
      let saved = 0;
      for (const t of threats.slice().sort((x, y) => dmgOut(y) - dmgOut(x))) {
        const b = home.filter((h) => !used.has(h) && (!has(t, 'flying') || has(h, 'flying') || has(h, 'reach'))).sort((x, y) => tou(y) - tou(x))[0];
        if (b) { used.add(b); saved += has(t, 'trample') ? Math.min(dmgOut(t), tou(b)) : dmgOut(t); }
      }
      return saved;
    };
    let guard = 0;
    while (crack - prevented() >= A.life && chosen.some((c) => !has(c, 'vigilance') && !c.def.mustAttack && !mustAttackNow(G, c)) && guard++ < 10) {
      const keep = chosen.filter((c) => !has(c, 'vigilance') && !c.def.mustAttack && !mustAttackNow(G, c)).sort((x, y) => tou(y) - tou(x))[0];
      chosen.splice(chosen.indexOf(keep), 1);
    }
  }
  return chosen;
}
function bestDoubleBlock(G, a, cands) {
  let best = null;
  for (let i = 0; i < cands.length; i++) for (let j = i + 1; j < cands.length; j++) {
    const x = cands[i], y = cands[j];
    const dmg = (has(x, 'deathtouch') || has(y, 'deathtouch')) ? Infinity : dmgOut(x) + dmgOut(y);
    if (dmg < tou(a) - a.dmg || has(a, 'indestructible')) continue;
    const victim = [x, y].filter((b) => kills(a, b)).sort((p, q) => cv(p) - cv(q))[0];
    const cost = victim ? cv(victim) : 0;
    if (cost < cv(a) && (!best || cost < best.cost)) best = { pair: [x, y], cost };
  }
  return best && best.pair;
}
function aiBlocks(G, D, A, attackers) {
  const per = PERSONAS[D.persona];
  const map = new Map();
  const used = new Set();
  let incoming = attackers.reduce((s, a) => s + dmgOut(a), 0);
  const order = attackers.slice().sort((x, y) => dmgOut(y) - dmgOut(x) || cv(y) - cv(x));
  for (const a of order) {
    const cands = D.bf.filter((b) => !used.has(b) && canBlock(G, b, a));
    const need = minBlockers(a);
    const needTwo = need >= 2;
    if (!cands.length || cands.length < need) continue;
    const scored = cands.map((b) => ({ b, ...fight(a, b) }));
    let pick = null;
    if (!needTwo) {
      const good = scored.filter((o) => o.aDies && !o.bDies).sort((x, y) => cv(x.b) - cv(y.b));
      const wall = scored.filter((o) => !o.aDies && !o.bDies).sort((x, y) => cv(x.b) - cv(y.b));
      const pressed = incoming >= D.life * 0.6;
      const trade = scored.filter((o) => o.aDies && o.bDies && (pressed || cv(a) >= cv(o.b) - 0.3)).sort((x, y) => cv(x.b) - cv(y.b));
      if (good.length) pick = [good[0].b];
      else if (wall.length && !has(a, 'trample')) pick = [wall[0].b];
      else if (trade.length) pick = [trade[0].b];
    }
    if (!pick && cands.length >= 2 && need <= 2 && !(a.tf && a.tf.maxOne) && !a.def.maxOne && (needTwo || cv(a) >= 4.5)) pick = bestDoubleBlock(G, a, cands);
    if (!pick && need >= 3 && cands.length >= need) { const team = cands.slice().sort((x, y) => dmgOut(y) - dmgOut(x)).slice(0, need); if (team.reduce((t, b) => t + dmgOut(b), 0) >= tou(a) - a.dmg && !has(a, 'indestructible')) pick = team; }
    const cmdLethal = G.format === 'commander' && a.cmdr && dmgOut(a) >= CMD.lethal - (D.cmdDmg[a.id] || 0);
    if (!pick && !needTwo && (incoming >= D.life || cmdLethal || (incoming >= D.life - 3 && G.rng.next() < per.chump))) {
      const chumps = scored.slice().sort((x, y) => cv(x.b) - cv(y.b));
      if (chumps.length && !has(a, 'trample')) pick = [chumps[0].b];
    }
    if (!pick && mustBeBlocked(G, a) && cands.length >= need) pick = cands.slice().sort((x, y) => cv(x) - cv(y)).slice(0, need);
    if (pick) {
      map.set(a.id, pick);
      pick.forEach((b) => used.add(b));
      const soak = pick.reduce((s, b) => s + Math.max(0, tou(b) - b.dmg), 0);
      incoming -= has(a, 'trample') ? Math.min(dmgOut(a), soak) : dmgOut(a);
    }
  }
  return map;
}
const strikesIn = (step) => (c) => (step === 'all' ? true : step === 'first' ? has(c, 'first strike') || has(c, 'double strike') : !has(c, 'first strike') || has(c, 'double strike'));
// Who deals how much to whom in one damage step. `alive` and `dmgOf` let the forecaster run this on a what-if board.
function planDamage(G, D, attackers, step, alive, dmgOf) {
  const strikes = strikesIn(step);
  const events = [];
  for (const a of attackers) {
    if (!alive(a) || !a.attacking) continue;
    const blockers = a.blockedBy.filter(alive);
    if (strikes(a) && combatPow(a) > 0) {
      if (!a.blocked) events.push({ src: a, to: D, n: combatPow(a) });
      else if (!blockers.length) { if (has(a, 'trample')) events.push({ src: a, to: D, n: combatPow(a) }); }
      else {
        let left = combatPow(a);
        const ordered = blockers.slice().sort((x, y) => (tou(x) - dmgOf(x)) - (tou(y) - dmgOf(y)));
        ordered.forEach((b, k) => {
          if (left <= 0) return;
          const lethal = has(a, 'deathtouch') ? 1 : Math.max(1, tou(b) - dmgOf(b));
          const amt = k === ordered.length - 1 && !has(a, 'trample') ? left : Math.min(left, lethal);
          events.push({ src: a, toC: b, n: amt });
          left -= amt;
        });
        if (left > 0 && has(a, 'trample')) events.push({ src: a, to: D, n: left });
      }
    }
    for (const b of blockers) if (strikes(b) && combatPow(b) > 0) events.push({ src: b, toC: a, n: combatPow(b) });
  }
  return events;
}
const hasFirstStep = (G, attackers) => attackers.concat(attackers.flatMap((a) => a.blockedBy)).some((c) => onBf(G, c) && (has(c, 'first strike') || has(c, 'double strike')));
function combatDamage(G, A, D, attackers, step) {
  if (G.fog) return;
  const events = planDamage(G, D, attackers, step, (c) => onBf(G, c), (c) => c.dmg).filter((e) => !(e.toC && protectedFrom(e.toC, e.src)));
  if (!events.length) return;
  const lines = [];
  const hitPlayer = new Map();
  G.combatDmg = true;
  for (const ev of events) {
    const P = ctrlOf(G, ev.src);
    let dealt = ev.n;
    if (ev.toC) dealt = damageCreature(G, ev.toC, ev.n, ev.src, { combat: true });
    else {
      damagePlayer(G, ev.to, ev.n, ev.src, P); hitPlayer.set(ev.src, (hitPlayer.get(ev.src) || 0) + ev.n);
      if (ev.src.cmdr) ev.to.cmdDmg[ev.src.id] = (ev.to.cmdDmg[ev.src.id] || 0) + ev.n;
    }
    if (dealt && has(ev.src, 'lifelink')) gainLife(G, P, dealt);
  }
  G.combatDmg = false;
  const toPlayer = events.filter((e) => e.to);
  if (toPlayer.length) {
    const total = toPlayer.reduce((x, e) => x + e.n, 0);
    lines.push(`${D.name} takes ${total} from ${nameList([...new Set(toPlayer.map((e) => e.src))])}`);
  }
  for (const e of events.filter((x) => x.toC)) lines.push(`${e.src.def.name} deals ${e.n} to ${e.toC.def.name}`);
  emit(G, 'damage', `${step === 'first' ? 'First strike. ' : ''}${lines.join('. ')}.`, { who: A.i, cards: events.map((e) => e.src.id), hits: events.map((e) => ({ src: e.src.id, to: e.toC ? e.toC.id : `p${e.to.i}`, n: e.n })) });
  for (const [src] of hitPlayer) if (src.def.hit.length && onBf(G, src)) resolveEffects(G, ctrlOf(G, src), src.def.hit, src, null, 'trigger');
  if (G.pending && hitPlayer.size && !G.over) {
    for (const [src, n] of hitPlayer) fire(G, 'hitPlayer', { c: src, Q: D, n, ctrl: src.ctrl, P: G.players[src.ctrl] });
    fire(G, 'combatDamagedYou', { P: D, cs: [...hitPlayer.keys()] });
  }
}
// Play the rest of this combat out on paper: which creatures die, how much gets through.
function forecast(G, D, attackers, gone, pre, fog) {
  const vd = new Map(pre || []), vdt = new Set(), dead = new Set();
  if (G.fog || fog) return { dead, toD: 0, gainA: 0, gainD: 0 };
  const alive = (c) => onBf(G, c) && !dead.has(c) && !gone.has(c);
  const dmgOf = (c) => c.dmg + (vd.get(c) || 0);
  const involved = attackers.concat(attackers.flatMap((a) => a.blockedBy));
  let toD = 0, gainA = 0, gainD = 0;
  for (const step of hasFirstStep(G, attackers) ? ['first', 'regular'] : ['all']) {
    for (const e of planDamage(G, D, attackers, step, alive, dmgOf)) {
      if (e.toC && protectedFrom(e.toC, e.src)) continue;
      if (e.toC) { vd.set(e.toC, (vd.get(e.toC) || 0) + e.n); if (has(e.src, 'deathtouch')) vdt.add(e.toC); }
      else toD += e.n;
      if (has(e.src, 'lifelink')) { if (e.src.ctrl === D.i) gainD += e.n; else gainA += e.n; }
    }
    for (const c of involved) if (alive(c) && !has(c, 'indestructible') && (dmgOf(c) >= tou(c) || ((vdt.has(c) || c.dt) && dmgOf(c) > 0))) dead.add(c);
  }
  for (const [c, n] of vd) if (alive(c) && !involved.includes(c) && !has(c, 'indestructible') && c.dmg + n >= tou(c)) dead.add(c);
  return { dead, toD, gainA, gainD };
}
// How good the rest of this combat looks for P.
function combatValue(G, P, D, attackers, gone, pre, fog) {
  const fc = forecast(G, D, attackers, gone, pre, fog);
  let v = 0;
  for (const c of fc.dead) v += c.ctrl === P.i ? -cv(c) : cv(c);
  for (const c of gone) v += c.ctrl === P.i ? -cv(c) : cv(c);
  const sign = P === D ? -1 : 1;
  const lifeAfter = D.life - fc.toD + fc.gainD;
  v += sign * (fc.toD * (D.life <= 10 ? 0.45 : 0.2) + (lifeAfter <= 0 ? 100 : 0));
  return v;
}
// Try one spell against one target on paper and score the resulting combat.
function trickValue(G, P, D, attackers, spell, idx, tgt, card) {
  const gone = new Set(), pre = new Map(), undo = [];
  const pumpOn = (c, e) => { c.tp += e.p; c.tt += e.t; const add = (e.kw || []).filter((k) => !has(c, k)); c.tkw.push(...add); undo.push(() => { c.tp -= e.p; c.tt -= e.t; c.tkw.splice(c.tkw.length - add.length, add.length); }); };
  const X = { P, O: other(G, P), src: card || null, ev: {} };
  spell.forEach((e, k) => {
    const t = k === idx ? tgt : null;
    if (e.k === 'pump' && t) pumpOn(t, e);
    else if (e.k === 'pumpT' && t) pumpOn(t, { p: e.pFn ? e.pFn(G, X, t) : e.p || 0, t: e.tFn ? e.tFn(G, X, t) : e.t || 0, kw: e.kw || [] });
    else if (e.k === 'grant' && t && e.kw) pumpOn(t, { p: 0, t: 0, kw: e.kw });
    else if ((e.k === 'destroyP' || e.k === 'exileP' || e.k === 'bounceP') && t && !(e.k === 'destroyP' && has(t, 'indestructible'))) gone.add(t);
    else if (e.k === 'dmgX' && t) { const n = e.nFn(G, X); if (!has(t, 'indestructible') && t.dmg + n >= tou(t)) gone.add(t); else pre.set(t, n); }
    else if (e.k === 'pumpTeam') P.bf.filter(isCreature).forEach((c) => pumpOn(c, e));
    else if ((e.k === 'destroy' && t && !has(t, 'indestructible')) || ((e.k === 'exile' || e.k === 'bounce' || e.k === 'tuck') && t)) gone.add(t);
    else if (e.k === 'edict') { const Q = other(G, P), cs = Q.bf.filter((c) => isCreature(c) && edictOk(G, Q, e.f, c)); if (cs.length) gone.add(cs.reduce((w, c) => (cv(c) < cv(w) ? c : w), cs[0])); }
    else if (e.k === 'dmg' && t) { if (!has(t, 'indestructible') && t.dmg + e.n >= tou(t)) gone.add(t); else pre.set(t, e.n); }
  });
  for (const c of [...pre.keys()]) if (tou(c) <= c.dmg + pre.get(c) || tou(c) <= 0) { gone.add(c); pre.delete(c); }
  for (const c of allCreatures(G)) if (tou(c) <= 0 && !gone.has(c)) gone.add(c);
  const v = combatValue(G, P, D, attackers, gone, pre);
  undo.reverse().forEach((f) => f());
  return v;
}
function aiTricks(G, P, role, attackers) {
  const A = G.players[G.active], D = other(G, A);
  let cast = 0;
  for (let guard = 0; guard < 3 && !G.over; guard++) {
    const live = attackers.filter((a) => onBf(G, a) && a.attacking);
    if (!live.length) return cast;
    const base = combatValue(G, P, D, live, new Set(), null);
    let best = null;
    for (const card of P.hand) for (const mode of (card.def.modes && !acOf(card.def, null) ? modeChoices(G, P, card.def) : [null])) {
      const d = card.def;
      const spellOf = mode ? spellEffects(d, mode) : d.spell;
      if (mode && acOf(d, mode)) continue;
      if (!spellOf || !isInstantSpeed(d) || d.types.includes('Creature') || !canPay(P, castCost(P, card, [], 0, mode), { def: d }) || d.respondOnly) continue;
      if (spellOf.some((e) => e.k === 'counter' || e.k === 'wrath' || e.k === 'dmgAll' || e.k === 'fn' || e.k === 'noop2')) continue;
      if (d.castIf && !d.castIf(G, P, card)) continue;
      const dd = { spell: spellOf };
      if (dd.spell.some((e) => e.k === 'fog')) {
        // Fog: only the defender, only when it saves a lot
        if (P !== D || G.fog) continue;
        const delta = combatValue(G, P, D, live, new Set(), null, true) - base;
        if (delta > 2.5 && (!best || delta > best.score)) best = { card, idx: -1, tgt: null, score: delta };
        continue;
      }
      const idx = dd.spell.findIndex((e) => needsTarget(e) && ['pump', 'destroy', 'exile', 'bounce', 'dmg', 'tuck', 'pumpT', 'grant', 'destroyP', 'exileP', 'bounceP', 'dmgX'].includes(e.k));
      const special = dd.spell.some((e) => e.k === 'pumpTeam' || e.k === 'edict');
      if (idx < 0 && !special) continue;
      if (idx >= 0 && dd.spell.some((e, k) => k !== idx && needsTarget(e))) continue; // one target only
      const te = idx >= 0 ? dd.spell[idx] : null;
      const cands = idx < 0 ? [null] : allCreatures(G).filter((c) => (c.attacking || c.blocking) && (te.tgt ? tgtOk(G, P, te, c, card, {}) : targetOk(G, P, te.f || {}, c, card)));
      const extra = mode ? mode.reduce((t, k) => t + (d.modes[k].cost ? costMV(d.modes[k].cost) * 0.15 : 0), 0) : 0;
      for (const tgt of cands) {
        const delta = trickValue(G, P, D, live, dd.spell, idx, tgt, card) - base;
        const bar = ['destroy', 'exile', 'dmg', 'tuck', 'destroyP', 'exileP', 'dmgX'].includes(te ? te.k : '') || dd.spell.some((e) => e.k === 'edict') ? 3 : 1.4;
        if (delta > bar && (!best || delta - d.mv * 0.1 - extra > best.score)) best = { card, idx, tgt, score: delta - d.mv * 0.1 - extra, mode, spell: dd.spell };
      }
    }
    if (!best) break;
    const sp = best.spell || best.card.def.spell;
    const ch = chooseTargets(G, P, sp, 'combat', best.card);
    const targets = sp.map((e, k) => (k === best.idx ? { c: best.tgt } : needsTarget(e) ? (ch ? ch.targets[k] : null) : null));
    if (targets.some((t, k) => needsTarget(sp[k]) && !t)) break;
    if (!castSpell(G, P, best.card, targets, null, { mode: best.mode })) break;
    cast++;
  }
  return cast;
}
function aiFirebreathing(G, P, role, attackers) {
  const O = other(G, P);
  for (const c of P.bf) {
    if (!c.def.pumpAbility || !(c.attacking || c.blocking) || !onBf(G, c)) continue;
    const ab = c.def.pumpAbility;
    let n = 0;
    for (let guard = 0; guard < 8; guard++) {
      if ((ab.once && c.pumps > 0) || (ab.max && c.pumps >= ab.max)) break;
      if (!canPay(P, ab.cost)) break;
      let useful = false;
      if (tou(c) + ab.t - c.dmg <= 0) break;
      if (c.attacking && !c.blocked && ab.p > 0) useful = true;
      else {
        const foe = c.attacking ? c.blockedBy.filter((b) => onBf(G, b))[0] : allCreatures(G).find((x) => x.id === c.blocking);
        if (foe) {
          const f0 = c.attacking ? fight(c, foe) : fight(foe, c);
          c.tp += ab.p; c.tt += ab.t;
          const f1 = c.attacking ? fight(c, foe) : fight(foe, c);
          c.tp -= ab.p; c.tt -= ab.t;
          const me0 = c.attacking ? f0.aDies : f0.bDies, me1 = c.attacking ? f1.aDies : f1.bDies;
          const them0 = c.attacking ? f0.bDies : f0.aDies, them1 = c.attacking ? f1.bDies : f1.aDies;
          useful = (me0 && !me1) || (!them0 && them1) || (ab.p > 0 && !them0 && tou(foe) - foe.dmg > pow(c) && tou(foe) - foe.dmg <= pow(c) + ab.p * (8 - guard));
        }
      }
      if (!useful) break;
      pay(P, ab.cost); c.tp += ab.p; c.tt += ab.t; c.pumps++; n++;
    }
    if (n) emit(G, 'pump', `${c.def.name} pumps itself${n > 1 ? ` ${n} times` : ''}, now ${pow(c)}/${tou(c)}.`, { who: P.i, cards: [c.id] });
  }
}
function combat(G) {
  const A = G.players[G.active], D = other(G, A);
  G.phase = 'combat';
  G.combat = { attackers: [] };
  G.combatN = G.combatTurn === G.turn ? (G.combatN || 0) + 1 : 1;
  G.combatTurn = G.turn;
  fire(G, 'combatStart', { P: A });
  sba(G);
  if (G.over) { G.combat = null; return; }
  if (!isHuman(G, A)) aiCrew(G, A, D);
  const attackers = isHuman(G, A) ? humanAttackers(G, A) : aiAttackers(G, A, D);
  if (!attackers.length) { endCombat(G); return; }
  G.combat.attackers = attackers.slice();
  for (const c of attackers) { c.attacking = true; if (!has(c, 'vigilance')) c.tapped = true; }
  A.attackedWith = (A.attackedWith || 0) + attackers.length;
  if (A.atkTurn !== G.turn) { A.atkTurn = G.turn; A.atkLog = []; }
  A.atkLog.push(...attackers);
  { const tapped = attackers.filter((c) => c.tapped); if (tapped.length) fire(G, 'tapped', { P: A, cs: tapped, attack: true }); }
  emit(G, 'attack', `${A.name} attacks with ${nameList(attackers)}.`, { who: A.i, cards: attackers.map((c) => c.id) });
  for (const r of A.bf.filter((c) => c.def.rider)) {
    const n = r.def.rider * attackers.length;
    damagePlayer(G, D, n, r, A);
    emit(G, 'hit', `${r.def.name} deals ${n} damage to ${D.name}.`, { who: A.i, card: r.id, target: `p${D.i}`, amount: n });
  }
  sba(G);
  if (G.over) return;
  for (const c of attackers) if (c.def.attack.length && onBf(G, c) && !G.over) resolveEffects(G, A, c.def.attack, c, null, 'trigger');
  if (G.over) return;
  for (const c of attackers) fire(G, 'attack', { c, P: A });
  fire(G, 'attacks', { P: A, cs: attackers.slice() });
  sba(G);
  if (G.over) return;
  if (isHuman(G, D)) humanWindow(G, D, 'attackers'); else aiInstantWindow(G, D, 'attackers');
  if (G.over) return;
  const live = G.combat.attackers.filter((c) => onBf(G, c) && c.attacking);
  if (live.length) {
    const blocks = isHuman(G, D) ? humanBlocks(G, D, A, live) : aiBlocks(G, D, A, live);
    for (const [aid, bs] of blocks) { const a = live.find((x) => x.id === aid); a.blocked = true; a.blockedBy = bs.slice(); bs.forEach((b) => { b.blocking = aid; }); }
    G.combat.blocksDone = true;
    if (blocks.size) {
      const parts = [...blocks].map(([aid, bs]) => `${live.find((x) => x.id === aid).def.name} with ${nameList(bs)}`);
      emit(G, 'block', `${D.name} blocks ${parts.join('; ')}.`, { who: D.i, cards: [...blocks.values()].flat().map((c) => c.id) });
    } else emit(G, 'noblock', `${D.name} doesn't block.`, { who: D.i });
    dirty(G);
    for (const [aid, bs] of blocks) { const a = live.find((x) => x.id === aid); if (isLegendary(a)) bs.forEach((b) => { b.ylp = G.turn; }); if (bs.some(isLegendary)) a.ylp = G.turn; }
    for (const [aid, bs] of blocks) { const a = live.find((x) => x.id === aid); fire(G, 'blocked', { c: a, by: bs.slice(), P: A }); for (const b of bs) fire(G, 'blocks', { c: b, a, P: D }); }
    sba(G);
    if (G.over) return;
    sneakWindow(G, A);
    if (G.over) return;
    // Tricks: the attacker acts first. When a human acts, the AI gets one more chance to answer, and vice versa.
    if (isHuman(G, A)) {
      if (humanWindow(G, A, 'blocks') >= 0 && !G.over && aiTricks(G, D, 'block', live) && !G.over) humanWindow(G, A, 'blocks');
    } else if (isHuman(G, D)) {
      aiTricks(G, A, 'attack', live);
      if (!G.over && humanWindow(G, D, 'blocks') && !G.over) aiTricks(G, A, 'attack', live);
    } else {
      aiTricks(G, A, 'attack', live);
      if (!G.over) aiTricks(G, D, 'block', live);
    }
    if (!G.over) { if (!isHuman(G, A)) aiFirebreathing(G, A, 'attack', live); if (!isHuman(G, D)) aiFirebreathing(G, D, 'block', live); }
    if (!G.over) { if (!isHuman(G, A)) aiAbilities(G, A, 'blocks'); if (!G.over && !isHuman(G, D)) aiAbilities(G, D, 'blocks'); }
    if (!G.over) aiCombatSacs(G, live);
    if (!G.over && G.fog) emit(G, 'fog', 'All combat damage is prevented.', { who: D.i });
    else if (!G.over) {
      const fighters = live.filter((c) => onBf(G, c) && c.attacking);
      const firstStep = hasFirstStep(G, fighters);
      if (firstStep) { combatDamage(G, A, D, fighters, 'first'); sba(G); }
      if (!G.over) { combatDamage(G, A, D, fighters, firstStep ? 'regular' : 'all'); sba(G); }
    }
  }
  endCombat(G);
}
// Sneak (Elektra): during the declare blockers step, cast it for its sneak cost by returning an unblocked attacker to hand;
// it enters tapped and attacking
function sneakWindow(G, A) {
  if (silenced(G, A)) return;
  for (const card of A.hand.filter((c) => c.def.sneak)) {
    const ub = (G.combat ? G.combat.attackers : []).filter((c) => onBf(G, c) && c.attacking && !c.blocked && c.ctrl === A.i);
    if (!ub.length || !A.hand.includes(card) || !canPay(A, card.def.sneak, { def: card.def })) continue;
    let back;
    if (isHuman(G, A)) {
      if (!yesNo(G, A, card, `Sneak ${card.def.name} for ${costText(card.def.sneak)}? Return an unblocked attacker to your hand; it enters tapped and attacking.`, false)) continue;
      back = ub.length === 1 ? ub[0] : pickCards(G, { type: 'choose', reason: 'choose', n: 1, min: 1, max: 1, zone: 'battlefield', cards: ub.map((c) => c.id), label: 'Return an unblocked attacker to your hand' }, ub, 1)[0];
    } else {
      const keep = ub.filter((c) => !c.token).sort((a, b) => cv(a) - cv(b));
      back = keep[0];
      if (!back || cv(back) > card.def.value + (card.def.sneakAi ? card.def.sneakAi(G, A) : 0)) continue;
    }
    if (!back || !pay(A, card.def.sneak, { def: card.def })) continue;
    bounceCard(G, A, back);
    emit(G, 'info', `${A.name} sneaks ${card.def.name} in for ${costText(card.def.sneak)}.`, { who: A.i, card: card.id });
    castSpell(G, A, card, [], null, { free: true, sneak: true });
    sba(G);
    if (G.over) return;
  }
}
// End of combat: delayed "at end of combat" effects, then everyone leaves combat
function endCombat(G) {
  const A = G.players[G.active];
  if (!G.over && G.delayed.length) {
    const due = G.delayed.filter((d) => d.when === 'combatEnd');
    G.delayed = G.delayed.filter((d) => d.when !== 'combatEnd');
    for (const d of due) if (!G.over) { d.run(G); sba(G); }
  }
  if (!G.over && G.pending) { fire(G, 'combatEnd', { P: A }); sba(G); }
  for (const P of G.players) for (const c of P.bf) { c.attacking = false; c.blocked = false; c.blocking = 0; c.blockedBy = []; }
  G.combat = null;
}

/* ---------- AI: instant-speed windows ---------- */
function bestPing(G, P, ctx) {
  const O = other(G, P);
  let best = null;
  for (const c of P.bf) {
    if (!c.def.pinger || c.tapped || (c.sick && !has(c, 'haste'))) continue;
    const n = c.def.pinger.n;
    let target = null, score = 0;
    if (c.def.pinger.to !== 'player') {
      const prey = O.bf.filter((x) => isCreature(x) && targetOk(G, P, {}, x, c) && lethalTo(x) <= n).sort((x, y) => cv(y) - cv(x))[0];
      if (prey) { target = { c: prey }; score = cv(prey) + 1; }
    }
    if (!target && c.def.pinger.to !== 'creature') { target = { p: O.i }; score = O.life <= n ? 100 : n * 0.6; }
    if (target && (!best || score > best.score)) best = { src: c, target, score };
  }
  return best;
}
function firePing(G, P, ping) {
  ping.src.tapped = true;
  const n = ping.src.def.pinger.n;
  if (ping.target.c) { damageCreature(G, ping.target.c, n, ping.src); emit(G, 'hit', `${ping.src.def.name} pings ${ping.target.c.def.name} for ${n}.`, { who: P.i, card: ping.src.id, target: ping.target.c.id, amount: n }); }
  else { const Q = G.players[ping.target.p]; damagePlayer(G, Q, n, ping.src, P); emit(G, 'hit', `${ping.src.def.name} pings ${Q.name} for ${n}.`, { who: P.i, card: ping.src.id, target: `p${Q.i}`, amount: n }); }
  sba(G);
}
function sacPingTarget(G, P, src) {
  const O = other(G, P), sp = src.def.sacPing;
  let best = null;
  if (sp.to !== 'player') for (const c of O.bf) if (isCreature(c) && targetOk(G, P, {}, c, src) && lethalTo(c) <= sp.n) { const s = cv(c) + 0.5; if (!best || s > best.score) best = { target: { c }, score: s }; }
  if (sp.to !== 'creature') { const s = O.life <= sp.n ? 100 : sp.n * 0.3; if (!best || s > best.score) best = { target: { p: O.i }, score: s }; }
  return best;
}
function fireSacPing(G, P, src, tgt) {
  pay(P, src.def.sacPing.cost);
  const n = src.def.sacPing.n;
  emit(G, 'sac', `${P.name} sacrifices ${src.def.name}.`, { who: P.i, cards: [src.id] });
  dieNow(G, [src]);
  if (G.over) return;
  if (tgt.c) { if (onBf(G, tgt.c)) { damageCreature(G, tgt.c, n, src); emit(G, 'hit', `${src.def.name} deals ${n} damage to ${tgt.c.def.name}.`, { who: P.i, card: src.id, target: tgt.c.id, amount: n }); } }
  else { const Q = G.players[tgt.p]; damagePlayer(G, Q, n, src, P); emit(G, 'hit', `${src.def.name} deals ${n} damage to ${Q.name}.`, { who: P.i, card: src.id, target: `p${Q.i}`, amount: n }); }
  sba(G);
}
// Creatures that can sacrifice themselves get used before they would die in combat anyway.
function aiCombatSacs(G, live) {
  const D = other(G, G.players[G.active]);
  for (const P of G.players) for (const c of P.bf.slice()) {
    if (G.over || isHuman(G, P) || !c.def.sacPing || !(c.attacking || c.blocking) || !canPay(P, c.def.sacPing.cost)) continue;
    if (!forecast(G, D, live.filter((a) => onBf(G, a)), new Set(), null).dead.has(c)) continue;
    const t = sacPingTarget(G, P, c);
    if (t && t.score > 0) fireSacPing(G, P, c, t.target);
  }
}
function aiUtility(G, P) {
  for (const c of P.bf.slice()) {
    if (G.over || !onBf(G, c)) continue;
    if (c.def.tapLoot && !c.tapped && !c.sick && P.library.length > 3) {
      c.tapped = true; drawCards(G, P, 1); discardWorst(G, P, 1);
      emit(G, 'draw', `${c.def.name} loots: ${P.name} draws a card, then discards a card.`, { who: P.i, card: c.id });
    }
    if (c.def.sacPing && canPay(P, c.def.sacPing.cost)) {
      const t = sacPingTarget(G, P, c);
      if (t && (t.score >= 100 || (t.target.c && t.score >= cv(c) + 1.5))) fireSacPing(G, P, c, t.target);
    }
  }
}
function aiCycle(G, P) {
  const lands = P.bf.filter(isLand).length;
  for (const c of P.hand.slice()) {
    if (!c.def.cycling || P.library.length <= 3 || !canPay(P, c.def.cycling)) continue;
    const dead = c.def.cycleAi ? c.def.cycleAi(G, P, c) : c.def.cycleSearch ? c.def.mv > lands + 2 && P.library.some((x) => c.def.cycleSearch(x.def)) : c.def.cycleFind ? (lands + P.hand.filter(isLand).length < 5 && !P.hand.some(isLand)) || c.def.mv > lands + 3 : isLand(c) ? lands + P.hand.filter(isLand).length >= 7 : c.def.mv > lands + 3;
    if (!dead) continue;
    cycleCard(G, P, c);
  }
}
function aiInstantWindow(G, P, when) {
  if (when === 'end') { aiCycle(G, P); aiUtility(G, P); aiAbilities(G, P, 'end'); }
  for (let guard = 0; guard < 4 && !G.over; guard++) {
    let best = null;
    for (const card of castables(G, P)) {
      const d = card.def;
      if (!fastFor(G, P, d) || !castZone(G, P, card) || !canPay(P, castCost(P, card), { def: d })) continue;
      if (d.spell && d.spell.some((e) => e.k === 'counter')) continue;
      let r = null;
      if (!d.types.includes('Creature') && isPermanentSpell(d)) {
        if (when === 'end' || (when === 'attackers' && d.aura)) { const ev = evalCast(G, P, card, 'end'); if (ev) r = ev; }
      } else if (d.types.includes('Creature')) {
        if (when === 'end') r = { score: 2 + d.value * 0.6, targets: [] };
        else if (when === 'attackers') {
          const atk = allCreatures(G).filter((c) => c.attacking);
          const canEat = atk.some((a) => { const x = { def: d, cnt: 0, tp: 0, tt: 0, tkw: [], dmg: 0 }; return canBlock(G, Object.assign({ tapped: false, ctrl: P.i }, x), a) && kills(x, a) && !kills(a, x); });
          if (canEat) r = { score: 3 + d.value * 0.5, targets: [] };
        }
      } else {
        if (d.modes || d.cost.x || d.addCost || d.costMod) { const ev = evalCast(G, P, card, when === 'end' ? 'end' : 'combat'); if (ev && ev.score > 0.6 && (when === 'end' || ev.targets.some((t) => t && t.c && t.c.attacking))) r = ev; if (r && (!best || r.score > best.score)) best = { card, ...r }; continue; }
        const ch = chooseTargets(G, P, d.spell, when === 'end' ? 'main2' : 'combat', card);
        if (ch && ch.score > 0.3) {
          let s = ch.score;
          if (when === 'attackers') {
            const hitsAttacker = ch.targets.some((t) => t && t.c && t.c.attacking);
            const pure = d.spell.every((e) => ['destroy', 'exile', 'dmg', 'pump', 'tap', 'bounce', 'tuck', 'noop', 'scry', 'draw', 'gain', 'refGain', 'refLand', 'refLose', 'loseRefTou', 'refToken'].includes(e.k));
            if (d.spell.some((e) => e.k === 'edict')) { /* the attacker will have to give something up */ }
            else if (!hitsAttacker || !pure) s = 0;
            else if (d.spell.some((e) => e.k === 'pump' && e.p >= 0)) s = 0;
          }
          if (when === 'end' && d.spell.some((e) => e.k === 'pump' && e.p >= 0)) s = 0;
          if (when === 'end' && d.spell.some((e) => e.k === 'dmg' && e.to !== 'creature') && ch.targets.some((t) => t && t.p != null) && s < 60 && PERSONAS[P.persona].faceBurn < 0.5) s = 0;
          if (s > 0.6) r = { score: s, targets: ch.targets };
        }
      }
      if (r && (!best || r.score > best.score)) best = { card, ...r };
    }
    if (when === 'end') {
      const ping = bestPing(G, P, 'end');
      if (ping && (!best || ping.score > best.score)) { firePing(G, P, ping); continue; }
    }
    if (!best) break;
    castSpell(G, P, best.card, best.targets, null, { x: best.x, mode: best.mode });
  }
}

/* ---------- A human at the table ----------
   The engine stays synchronous. When a human player has a decision to make, ask() takes the next stored
   answer; when there isn't one it throws NeedInput carrying the question and a snapshot of the table.
   The caller replays the game from its seed with the answers so far (a game takes a few milliseconds),
   which keeps every AI decision identical and makes undo free. */
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
const costText = (c) => `${c.g ? `{${c.g}}` : ''}${'{C}'.repeat(c.C || 0)}${(c.hy || []).map((h) => `{${h[0]}/${h[1]}}`).join('')}${COLORS.map((k) => `{${k}}`.repeat(c[k] || 0)).join('')}` || '{0}';
// Pick cards from a pool; answers that are short or stale are topped up the same way every replay.
function pickCards(G, req, pool, n) {
  req.defs = Object.fromEntries(pool.map((c) => [c.id, c.def.id]));
  const a = ask(G, req);
  const chosen = [];
  for (const id of a.ids || []) { const c = pool.find((x) => x.id === id); if (c && !chosen.includes(c)) chosen.push(c); }
  if (n != null) { for (const c of pool) if (chosen.length < n && !chosen.includes(c)) chosen.push(c); return chosen.slice(0, n); }
  return chosen;
}
function discardChoice(G, P, n, reason) {
  n = Math.min(n, P.hand.length);
  if (!n) return 0;
  if (!isHuman(G, P)) { discardWorst(G, P, n); return n; }
  const chosen = n === P.hand.length ? P.hand.slice() : pickCards(G, { type: 'choose', reason, n, min: n, max: n, zone: 'hand', cards: P.hand.map((c) => c.id) }, P.hand, n);
  for (const c of chosen) { P.hand.splice(P.hand.indexOf(c), 1); P.gy.push(c); }
  for (const c of chosen) noteDiscard(G, P, c);
  return n;
}
function scryChoice(G, P, n) {
  if (!isHuman(G, P)) return aiScry(G, P, n);
  const top = P.library.slice(Math.max(0, P.library.length - n)).reverse(); // top card first
  if (!top.length) return;
  const bottom = pickCards(G, { type: 'choose', reason: 'scry', n: top.length, min: 0, max: top.length, zone: 'library', cards: top.map((c) => c.id) }, top, null);
  const keep = top.filter((c) => !bottom.includes(c));
  P.library.splice(Math.max(0, P.library.length - n));
  P.library.unshift(...bottom);
  P.library.push(...keep.slice().reverse());
  emit(G, 'scry', `${P.name} scries ${n}${bottom.length ? `, putting ${bottom.length === 1 ? 'one card' : `${bottom.length} cards`} on the bottom` : ''}.`, { who: P.i });
  if (G.pending) fire(G, 'scry', { P, n: top.length });
}
// Surveil: look at the top n, put any of them into your graveyard and the rest back in any order
function surveil(G, P, n) {
  const top = P.library.slice(Math.max(0, P.library.length - n)).reverse(); // top card first
  if (!top.length) return [];
  let gy;
  if (isHuman(G, P)) gy = pickCards(G, { type: 'choose', reason: 'surveil', n: top.length, min: 0, max: top.length, zone: 'library', cards: top.map((c) => c.id) }, top, null);
  else {
    const lands = P.bf.filter(isLand).length + P.hand.filter(isLand).length;
    const wantGy = (c) => !!(c.def.flashback || c.def.gyActs || c.def.gyTrig) || (P.bf.some((x) => x.def.gyFuel) && c.def.types.includes('Creature'));
    gy = top.filter((c) => wantGy(c) || !(isLand(c) ? lands < 6 : c.def.mv <= lands + 2));
  }
  const keep = top.filter((c) => !gy.includes(c));
  P.library.splice(Math.max(0, P.library.length - top.length));
  P.library.push(...keep.slice().reverse());
  for (const c of gy) P.gy.push(c);
  if (gy.length) dirty(G);
  emit(G, 'scry', `${P.name} surveils ${top.length}${gy.length ? `, putting ${gy.map((c) => c.def.name).join(', ')} into their graveyard` : ''}.`, { who: P.i, cards: gy.map((c) => c.id) });
  if (G.pending) fire(G, 'scry', { P, n: top.length, surveil: true, gy });
  return gy;
}
function putBackChoice(G, P, n) {
  if (!isHuman(G, P)) return putBack(G, P, n);
  n = Math.min(n, P.hand.length);
  if (!n) return;
  const chosen = n === P.hand.length ? P.hand.slice() : pickCards(G, { type: 'choose', reason: 'putback', n, min: n, max: n, zone: 'hand', cards: P.hand.map((c) => c.id) }, P.hand, n);
  for (const c of chosen.slice().reverse()) { P.hand.splice(P.hand.indexOf(c), 1); P.library.push(c); } // first chosen ends on top
}
function sacrificeChoice(G, Q, cs) {
  if (!isHuman(G, Q)) return cs.reduce((w, c) => (cv(c) < cv(w) ? c : w), cs[0]);
  if (cs.length === 1) return cs[0];
  return pickCards(G, { type: 'choose', reason: 'sacrifice', n: 1, min: 1, max: 1, zone: 'battlefield', cards: cs.map((c) => c.id) }, cs, 1)[0];
}
const freeMulls = (G) => (G.format === 'commander' ? 1 : 0);
const toBottom = (G, m) => Math.max(0, m - freeMulls(G));
function humanOpeningHand(G, P) {
  for (let m = 0; m <= 3; m++) {
    P.library.push(...P.hand); P.hand = [];
    G.rng.shuffle(P.library);
    drawCards(G, P, 7);
    P.mulligans = m;
    if (m === 3) break;
    const req = { type: 'mulligan', mulligans: m, cards: P.hand.map((c) => c.id) };
    if (freeMulls(G)) Object.assign(req, { bottom: toBottom(G, m), free: toBottom(G, m + 1) === 0 });
    if (ask(G, req).keep) break;
  }
  P.bottomed = toBottom(G, P.mulligans);
  if (P.bottomed) {
    const n = P.bottomed;
    const chosen = pickCards(G, { type: 'choose', reason: 'bottom', n, min: n, max: n, zone: 'hand', cards: P.hand.map((c) => c.id) }, P.hand, n);
    for (const c of chosen) { P.hand.splice(P.hand.indexOf(c), 1); P.library.unshift(c); }
  }
}
// Targets travel as plain data so answers can be stored: {c}, {c, c2}, {p} or 'skip'
function refOf(t) {
  if (!t || t === 'skip') return t || null;
  const r = {};
  if (t.c) r.c = t.c.id;
  if (t.c2) r.c2 = t.c2.id;
  if (t.cs) r.cs = t.cs.map((x) => (x.p != null && !x.def ? `p${x.p}` : x.id));
  if (t.p != null) r.p = t.p;
  return r;
}
// Any card the game knows about, wherever it is
function findCard(G, id) {
  for (const P of G.players) for (const z of [P.bf, P.gy, P.exile, P.hand, P.command]) { const c = z.find((x) => x.id === id); if (c) return c; }
  const s = G.stack.find((x) => x.card.id === id);
  return s ? s.card : null;
}
function fromRef(G, r) {
  if (r === 'skip') return 'skip';
  if (!r) return null;
  const find = (id) => findCard(G, id);
  const t = {};
  if (r.c != null) { t.c = find(r.c); if (!t.c) return null; }
  if (r.c2 != null) { t.c2 = find(r.c2); if (!t.c2) return null; }
  if (r.cs) { t.cs = r.cs.map((v) => (typeof v === 'string' ? (G.players[+v.slice(1)] ? { p: +v.slice(1) } : null) : find(v))).filter(Boolean); if (!t.cs.length) return 'skip'; }
  if (r.p != null) { if (!G.players[r.p]) return null; t.p = r.p; }
  return t;
}
function specLabel(e) {
  switch (e.k) {
    case 'dmg': return `${e.n} damage to ${e.to === 'any' ? 'any target' : 'a creature'}`;
    case 'destroy': return 'Destroy a creature';
    case 'exile': return 'Exile a creature';
    case 'bounce': return "Return a creature to its owner's hand";
    case 'tuck': return "Put an attacking creature on the bottom of its owner's library";
    case 'tap': return e.stun ? "Tap a creature; it won't untap next turn" : 'Tap a creature';
    case 'pump': { const pt = e.p || e.t ? `${sgn(e.p)}/${sgn(e.t)}` : ''; return `Give a creature ${pt}${pt && e.kw.length ? ' and ' : ''}${e.kw.join(' and ')}`; }
    case 'counters': return `Put ${e.n === 1 ? 'a +1/+1 counter' : `${e.n} +1/+1 counters`} on a creature`;
    case 'noBlock': return "Stop a creature from blocking this turn";
    case 'fight': return 'Your creature fights one of theirs';
    case 'bite': return 'Your creature deals damage equal to its power to one of theirs';
    default: return EFF[e.k] && EFF[e.k].label ? EFF[e.k].label(e) : 'Choose a target';
  }
}
function targetSpec(G, P, e, k, source, X) {
  if (e.tgt && e.tgt.pair) {
    const { A, B } = pairCands(G, P, e, source, X);
    return A.length && (B.length || e.tgt.optB) ? { k, pair: true, mine: A.map((c) => c.id), theirs: B.map((c) => c.id), optB: !!e.tgt.optB, labels: e.tgt.labels || null, label: e.label || specLabel(e) } : null;
  }
  if (e.tgt) {
    const n = e.tgt.nFn ? e.tgt.nFn(G, Object.assign({ P, O: other(G, P), src: source, ev: {} }, X || {})) : e.tgt.n || 1;
    const min = e.tgt.min != null ? e.tgt.min : 1;
    if (n <= 0) return null;
    const cands = tgtCands(G, P, e, source, X).map((x) => (x.p != null && !x.def ? `p${x.p}` : x.id));
    if (!cands.length) return null;
    const sp = { k, cands, may: min === 0 || !!e.may, label: e.label || specLabel(e) };
    if (n > 1) { sp.n = n; sp.min = min; }
    if (e.tgt.what === 'gy') { sp.zone = 'gy'; sp.defs = Object.fromEntries(cands.map((id) => [id, findCard(G, id).def.id])); }
    return sp;
  }
  const creatures = (f) => allCreatures(G).filter((c) => targetOk(G, P, f || {}, c, source)).map((c) => c.id);
  if (e.k === 'fight' || e.k === 'bite') {
    const mine = creatures({ side: 'you' }), theirs = creatures({ side: 'opp' });
    return mine.length && theirs.length ? { k, pair: true, mine, theirs, label: specLabel(e) } : null;
  }
  const cands = creatures(e.f);
  if (e.k === 'dmg' && e.to === 'any') cands.push(...G.players.filter((Q) => !Q.lost && !hexP(G, Q, P)).map((Q) => `p${Q.i}`));
  return cands.length ? { k, cands, may: !!e.may, label: specLabel(e) } : null;
}
const canAttackNow = (G, c) => isCreature(c) && !c.tapped && (!c.sick || has(c, 'haste')) && !has(c, 'defender') && !(c.sfl && c.sfl.cantAttack) && !(c.tf && c.tf.cantAttack) && !(has(c, 'flying') && G.players.some((Q) => Q.i !== c.ctrl && Q.bf.some((x) => x.def.noFlyers)));
const mustAttackNow = (G, c) => !!(c.goad && c.goad >= G.turn);
const mustBeBlocked = (G, a) => !!(a.tf && a.tf.lure) || (!!a.def.lureBearer && G.players[a.ctrl].ring.bearer === a.id);
const attackCandidates = (G, P) => P.bf.filter((c) => canAttackNow(G, c));
// Everything a human could do right now, with the legal targets for each choice.
function humanActions(G, P, when) {
  const acts = [];
  const sorcery = G.active === P.i && (when === 'main1' || when === 'main2') && !G.stack.length;
  if (sorcery && P.landsPlayed < landLimit(G, P)) {
    for (const ch of landChoices(G, P)) acts.push(Object.assign({ act: `land:${ch.c.id}`, kind: 'land', card: ch.c.id, label: ch.from === 'hand' ? 'Play this land' : `Play this land from ${ch.from === 'exile' ? 'exile' : ch.from === 'top' ? 'the top of your library' : 'your graveyard'}` }, ch.from !== 'hand' ? { zone: ch.from } : null));
  }
  // Adventures: a Town in hand can be cast as its adventure (its face is swapped while the choices are worked out)
  const advs = sorcery || P.hand.some((c) => c.def.adv && isInstantSpeed(c.def.adv)) ? P.hand.filter((c) => c.def.adv) : [];
  advs.forEach((c) => { c.advLand = c.def; c.def = c.def.adv; });
  const nAct = acts.length;
  const castLoop = (cards) => { for (const c of cards) {
    const d = c.def;
    if (isLand(c) || (!sorcery && !fastFor(G, P, d))) continue;
    if (d.respondOnly || (d.spell && d.spell.some((e) => e.k === 'counter'))) continue; // answers to spells are offered when a spell is cast
    if (d.castIf && !d.castIf(G, P, c)) continue;
    const zone = castZone(G, P, c);
    const xc = zone === 'xcast' ? xcastOf(G, P, c) : null;
    const purpose = { def: d, anyType: !!(xc && xc.anyType) };
    if (d.addCost && !addCostOptions(G, P, c).ok) continue;
    const full = canPay(P, castCost(P, c), purpose);
    const fromGyZone = zone === 'flashback' || zone === 'gycast';
    // Cheaper with the right target (Banish from Edoras): only those targets are offered when the full cost is too much
    // (only when the reduction depends on the targets: costMod(G, P, card, targets))
    if (!full && !(d.costMod && d.costMod.length >= 4 && canPay(P, Object.assign({}, castCost(P, c), { g: Math.max(0, castCost(P, c).g - 3) }), purpose))) continue;
    if (d.addCost && d.addCost.orPay && !addCostOptions(G, P, c).opts.some((o) => o.sac) && !canPayBoth(P, castCost(P, c), d.addCost.orPay)) continue;
    const perm = isPermanentSpell(d);
    const cre = d.types.includes('Creature');
    const fromCmd = zone === 'command';
    const where = fromCmd ? ' from the command zone' : zone === 'xcast' ? (P.gy.includes(c) ? ' from your graveyard' : ' from exile') : zone === 'top' ? ' from the top of your library' : zone === 'flashback' ? ` with flashback (${costText(castCost(P, c))})` : zone === 'gycast' ? ' from your graveyard' : '';
    const modes = d.modes ? modeChoices(G, P, d) : [null];
    for (const mode of modes) {
      if (mode && d.modes.some((m) => m.cost || m.addCost)) {
        if (!canPay(P, castCost(P, c, [], 0, mode), purpose)) continue;
        if (acOf(d, mode) && !addCostOptions(G, P, c, mode).ok) continue;
      }
      const specs = [];
      let ok = true;
      const X = { cheapOnly: !full };
      const list = d.aura ? [{ k: 'aura', f: d.aura.f || {} }] : perm ? d.etb : spellEffects(d, mode);
      list.forEach((e, k) => {
        if (e.k === 'aura') {
          const cands = allCreatures(G).filter((x) => targetOk(G, P, e.f, x, c)).map((x) => x.id);
          if (cands.length) specs.push({ k, cands, label: `Choose a creature for ${d.name}` }); else ok = false;
          return;
        }
        if (!needsTarget(e) || e.k === 'divided') return; // split damage is planned automatically
        const sp = targetSpec(G, P, e, k, c, X);
        if (sp) specs.push(sp);
        else if (!perm && !e.may && !(e.tgt && e.tgt.min === 0)) ok = false;
      });
      if (!ok) continue;
      const label = `Cast ${d.name}${where}${mode ? `: ${mode.map((k) => d.modes[k].label).join(' and ')}` : ''}`;
      acts.push(Object.assign({ act: `cast:${c.id}${mode ? `:${mode.join('.')}` : ''}`, kind: 'cast', card: c.id, label, specs, etb: perm && !d.aura },
        fromCmd ? { cmd: true, cost: costText(castCost(P, c)), tax: CMD.tax * P.cmdCasts } : (fromGyZone || zone === 'xcast' || (mode && d.modes.some((m) => m.cost)) || costMV(castCost(P, c, [], 0, mode)) !== costMV(Object.assign({}, d.cost, { x: 0 })) || d.advOf) && !d.cost.x ? { cost: costText(castCost(P, c, [], 0, mode)) } : null,
        d.cost.x ? { x: true } : null, zone !== 'hand' && zone !== 'command' ? { zone: fromGyZone || P.gy.includes(c) ? 'gy' : zone === 'xcast' ? 'exile' : zone } : null));
    }
  }
  };
  castLoop(castables(G, P));
  advs.forEach((c) => { c.def = c.advLand; c.advLand = null; });
  for (const a of acts.slice(nAct)) { const ac = advs.find((c) => c.id === a.card); if (ac && a.kind === 'cast') { a.act = a.act.replace(/^cast:/, 'adv:'); a.label = a.label.replace(/^Cast /, 'Cast the adventure '); } }
  // Modal double-faced cards: the back face can be cast from hand too
  const mdfcs = P.hand.filter((c) => c.def.mdfc && c.def.back && (sorcery || isInstantSpeed(c.def.back)));
  if (mdfcs.length) {
    const n2 = acts.length;
    mdfcs.forEach((c) => { c.advLand = c.def; c.def = c.def.back; });
    try { castLoop(mdfcs); } finally { mdfcs.forEach((c) => { c.def = c.advLand; c.advLand = null; }); }
    for (const a of acts.slice(n2)) if (a.kind === 'cast') a.act = a.act.replace(/^cast:/, 'adv:');
  }
  for (const c of P.bf) {
    if (!isCreature(c)) continue;
    const ready = !c.tapped && (!c.sick || has(c, 'haste'));
    const dmgCands = (to) => {
      const out = to === 'player' ? [] : allCreatures(G).filter((x) => targetOk(G, P, {}, x, c)).map((x) => x.id);
      if (to === 'player') out.push(`p${other(G, P).i}`);
      else if (to === 'any') out.push(...G.players.filter((Q) => !Q.lost).map((Q) => `p${Q.i}`));
      return out;
    };
    const where = (to) => (to === 'any' ? 'any target' : to === 'creature' ? 'a creature' : 'your opponent');
    if (c.def.pinger && ready) {
      const { n, to } = c.def.pinger;
      const cands = dmgCands(to);
      if (cands.length) acts.push({ act: `ping:${c.id}`, kind: 'ping', card: c.id, label: `Tap: ${n} damage to ${where(to)}`, specs: [{ k: 0, cands, label: `${n} damage to ${where(to)}` }] });
    }
    const ab = c.def.pumpAbility;
    if (ab && canPay(P, ab.cost) && !(ab.once && c.pumps > 0) && !(ab.max && c.pumps >= ab.max) && tou(c) + ab.t - c.dmg > 0) {
      acts.push({ act: `pump:${c.id}`, kind: 'pump', card: c.id, label: `${costText(ab.cost)}: ${sgn(ab.p)}/${sgn(ab.t)} until end of turn` });
    }
    if (c.def.tapLoot && ready && P.library.length) acts.push({ act: `loot:${c.id}`, kind: 'loot', card: c.id, label: 'Tap: draw a card, then discard a card' });
    if (c.def.sacPing && canPay(P, c.def.sacPing.cost)) {
      const { n, to } = c.def.sacPing;
      const cands = dmgCands(to).filter((x) => x !== c.id);
      if (cands.length) acts.push({ act: `sac:${c.id}`, kind: 'sac', card: c.id, label: `${c.def.sacPing.cost.g || COLORS.some((k) => c.def.sacPing.cost[k]) ? `${costText(c.def.sacPing.cost)}, sacrifice` : 'Sacrifice'}: ${n} damage to ${where(to)}`, specs: [{ k: 0, cands, label: `${n} damage to ${where(to)}` }] });
    }
  }
  // Activated abilities of permanents (and of cards in your graveyard), equip and crew
  for (const e of readyAbilities(G, P, when === 'main1' || when === 'main2' ? when : 'any')) {
    const { c, ab } = e;
    const specs = [];
    let ok = true;
    if (ab.equip) {
      const cands = P.bf.filter((x) => x !== c && isCreature(x) && x.id !== c.att && (!ab.only || matches(G, x, ab.only, P, c))).map((x) => x.id);
      if (!cands.length) continue;
      specs.push({ k: 0, cands, label: `Equip ${c.def.name} to a creature you control` });
    } else if (ab.eff) {
      ab.eff.forEach((ef, k) => {
        if (!needsTarget(ef) || ef.k === 'divided') return;
        const sp = targetSpec(G, P, ef, k, c, { x: 0 });
        if (sp) specs.push(sp);
        else if (!ef.may && !(ef.tgt && ef.tgt.min === 0)) ok = false;
      });
    }
    if (!ok) continue;
    const cost = abilityCost(G, P, c, ab);
    const k = ab.cost;
    const parts = [];
    if (costMV(cost) || cost.x) parts.push(costText(cost) + (ab.cost.m && ab.cost.m.x ? '{X}'.repeat(ab.cost.m.x) : ''));
    if (k.tap) parts.push('Tap');
    if (k.sacSelf) parts.push('sacrifice it');
    if (k.sac && k.sac.label) parts.push(`sacrifice ${k.sac.label}`);
    else if (k.sac) parts.push(`sacrifice ${k.sac.n > 1 ? `${k.sac.n} ` : 'a '}${k.sac.sub ? `${k.sac.sub}${k.sac.n > 1 ? 's' : ''}` : k.sac.other ? 'another creature' : 'a permanent'}`);
    if (k.discard) parts.push('discard a card');
    if (k.life) parts.push(`pay ${k.life} life`);
    if (k.exileSelf) parts.push('exile it from your graveyard');
    if (k.exileSelfBf) parts.push('exile it');
    if (k.exileGy) parts.push(`exile ${k.exileGy} cards from your graveyard`);
    if (k.tapCre) parts.push('tap a creature');
    if (k.ctr) parts.push(`remove a ${k.ctr.kind} counter`);
    const label = ab.crew ? `Crew ${c.def.crew}: tap creatures with total power ${c.def.crew}` : ab.equip ? `Equip${ab.only ? ` ${ab.only.sub}` : ''} ${costText(cost)}` : `${parts.length ? `${parts.join(', ')}: ` : ''}${ab.label || 'Activate'}`;
    acts.push(Object.assign({ act: `ab:${c.id}:${e.k}`, kind: 'ab', card: c.id, label: label.charAt(0).toUpperCase() + label.slice(1), specs }, e.zone === 'gy' ? { zone: 'gy' } : null, ab.cost.m && ab.cost.m.x ? { x: true } : null));
  }
  for (const c of P.hand) if (c.def.cycling && canPay(P, c.def.cycling) && P.library.length) acts.push({ act: `cycle:${c.id}`, kind: 'cycle', card: c.id, label: `${c.def.cycleLabel ? c.def.cycleLabel : c.def.cycleFind === 'basic' ? 'Basic landcycling' : c.def.cycleFind ? `${c.def.cycleFind}cycling` : 'Cycle'} for ${costText(c.def.cycling)}` });
  return acts;
}
// Cycling: draw a card, or for landcycling search for a land of that type
function cycleCard(G, P, c) {
  if (!pay(P, c.def.cycling)) return false;
  P.hand.splice(P.hand.indexOf(c), 1);
  P.gy.push(c);
  noteDiscard(G, P, c);
  if (c.def.cycleRun) {
    emit(G, 'cycle', `${P.name} discards ${c.def.name} to use its ability.`, { who: P.i, card: c.id });
    c.def.cycleRun(G, P, c);
  } else if (c.def.cycleSearch) {
    const got = searchLibrary(G, P, (x) => c.def.cycleSearch(x.def), 1, 'hand', c.def.cycleWhat || 'a card');
    emit(G, 'cycle', `${P.name} discards ${c.def.name}${got.length ? ` and finds ${got[0].def.name}` : ' and finds nothing'}.`, { who: P.i, card: c.id });
  } else if (c.def.cycleFind) {
    const basic = c.def.cycleFind === 'basic';
    const got = searchLibrary(G, P, (x) => isLand(x) && (basic ? x.def.supertypes.includes('Basic') : x.def.sub.includes(c.def.cycleFind)), 1, 'hand', basic ? 'a basic land' : `a ${c.def.cycleFind}`);
    emit(G, 'cycle', `${P.name} cycles ${c.def.name}${got.length ? ` for ${got[0].def.name}` : ''}.`, { who: P.i, card: c.id });
  } else {
    drawCards(G, P, 1);
    emit(G, 'cycle', `${P.name} cycles ${c.def.name}.`, { who: P.i, card: c.id });
  }
  dirty(G);
  return true;
}
function applyAction(G, P, a) {
  const [kind, idStr, extra] = String(a.act).split(':');
  const id = +idStr;
  const inHand = P.hand.find((c) => c.id === id);
  const toCast = castables(G, P).find((c) => c.id === id);
  const mine = P.bf.find((c) => c.id === id);
  const t0 = (a.t || []).map((r) => fromRef(G, r));
  switch (kind) {
    case 'land': {
      if (P.landsPlayed >= landLimit(G, P)) break;
      const ch = landChoices(G, P).find((y) => y.c.id === id);
      if (ch) playLandChoice(G, P, ch);
      break;
    }
    case 'adv': case 'cast': {
      if (!toCast) break;
      let land = null;
      if (kind === 'adv') { if (!altFace(toCast.def) || !P.hand.includes(toCast)) break; land = toCast.def; toCast.def = altFace(land); }
      const d = toCast.def;
      const mode = extra ? extra.split('.').map(Number) : null;
      let x = 0;
      if (d.cost.x) { const purpose = { def: d }; x = chooseNumber(G, P, toCast, `${d.name}: choose X`, d.minX || 0, Math.max(d.minX || 0, maxX(G, P, toCast, purpose)), 0); }
      if (d.aura) castSpell(G, P, toCast, [t0[0] || null], null, { x });
      else if (isPermanentSpell(d)) castSpell(G, P, toCast, [], d.etb.map((e, k) => fromRef(G, (a.etb || [])[k])), { x });
      else castSpell(G, P, toCast, spellEffects(d, mode).map((e, k) => (e.k === 'divided' ? { plan: dividePlan(G, P, e, toCast).plan } : t0[k] || null)), null, { x, mode });
      if (land && toCast.def === altFace(land) && P.hand.includes(toCast)) toCast.def = land;
      break;
    }
    case 'ab': {
      const src = P.bf.find((c) => c.id === id) || P.gy.find((c) => c.id === id);
      if (!src) break;
      const e = abilitiesOf(G, P, src, P.gy.includes(src) ? 'gy' : 'bf').find((y) => y.k === extra);
      if (!e || !canActivate(G, P, e, G.phase === 'main1' || G.phase === 'main2' ? G.phase : 'any')) break;
      const targets = e.ab.equip ? [t0[0] || null] : (e.ab.eff || []).map((ef, k) => t0[k] || null);
      activate(G, P, e, targets);
      break;
    }
    case 'ping': if (mine && t0[0] && t0[0] !== 'skip') firePing(G, P, { src: mine, target: t0[0] }); break;
    case 'pump': {
      const ab = mine && mine.def.pumpAbility;
      if (!ab || !pay(P, ab.cost)) break;
      mine.tp += ab.p; mine.tt += ab.t; mine.pumps++;
      emit(G, 'pump', `${mine.def.name} gets ${sgn(ab.p)}/${sgn(ab.t)}, now ${pow(mine)}/${tou(mine)}.`, { who: P.i, cards: [mine.id] });
      break;
    }
    case 'loot':
      if (!mine) break;
      mine.tapped = true;
      drawCards(G, P, 1);
      discardChoice(G, P, 1, 'loot');
      emit(G, 'draw', `${mine.def.name} loots: ${P.name} draws a card, then discards a card.`, { who: P.i, card: mine.id });
      break;
    case 'sac': if (mine && t0[0] && t0[0] !== 'skip') fireSacPing(G, P, mine, t0[0]); break;
    case 'cycle':
      if (!inHand) break;
      cycleCard(G, P, inHand);
      break;
    default: break;
  }
  sba(G);
}
function humanMain(G, P, which) {
  const ctx = which === 1 ? 'main1' : 'main2';
  G.phase = ctx;
  for (let guard = 0; guard < 80 && !G.over; guard++) {
    const acts = humanActions(G, P, ctx);
    const ready = ctx === 'main1' ? attackCandidates(G, P).map((c) => c.id) : [];
    const canAttack = ready.length > 0;
    if (!acts.length && canAttack) return 'combat';
    // With nothing to play and nothing able to attack, the first main phase still waits for you to end the turn,
    // so it never slips past (older saved games ended it for you, and keep doing so)
    if (!acts.length && (ctx !== 'main1' || !G.stopEmpty)) return 'end';
    const a = ask(G, { type: 'act', when: ctx, actions: acts, canAttack, ready });
    if (a.pass) return a.pass === 'combat' && canAttack ? 'combat' : 'end';
    if (!acts.some((x) => x.act === a.act)) return 'end';
    applyAction(G, P, a);
    if (G.endTurn) return 'end';
  }
  return 'end';
}
function humanWindow(G, P, when) {
  let acted = 0;
  for (let guard = 0; guard < 30 && !G.over; guard++) {
    const acts = humanActions(G, P, when);
    if (!acts.length) break;
    const a = ask(G, { type: 'act', when, actions: acts });
    if (a.pass || !acts.some((x) => x.act === a.act)) break;
    applyAction(G, P, a);
    acted++;
  }
  return acted;
}
function humanAttackers(G, A) {
  const cands = attackCandidates(G, A);
  if (!cands.length) return [];
  const must = cands.filter((c) => c.def.mustAttack);
  const a = ask(G, { type: 'attack', cands: cands.map((c) => c.id), must: must.map((c) => c.id) });
  const ids = new Set((a.ids || []).concat(must.map((c) => c.id)));
  return cands.filter((c) => ids.has(c.id));
}
function humanBlocks(G, D, A, attackers) {
  const blockers = D.bf.filter((b) => isCreature(b) && !b.tapped && !b.def.cantBlock && !b.noBlock && !(b.sfl && b.sfl.cantBlock) && !(b.tf && b.tf.cantBlock));
  const opts = attackers.map((a) => Object.assign({ id: a.id, menace: has(a, 'menace'), by: blockers.filter((b) => canBlock(G, b, a)).map((b) => b.id) },
    minBlockers(a) > 2 ? { need: minBlockers(a) } : null, (a.tf && a.tf.maxOne) || a.def.maxOne ? { max: 1 } : null, mustBeBlocked(G, a) ? { lure: true } : null)).filter((o) => o.by.length);
  const map = new Map();
  if (!opts.length) return map;
  const ans = ask(G, { type: 'block', attackers: opts });
  const used = new Set();
  for (const [aid, bids] of ans.blocks || []) {
    const a = attackers.find((x) => x.id === aid);
    if (!a || map.has(aid)) continue;
    let bs = (bids || []).map((id) => blockers.find((b) => b.id === id)).filter((b, k, arr) => b && arr.indexOf(b) === k && !used.has(b) && canBlock(G, b, a));
    if ((a.tf && a.tf.maxOne) || a.def.maxOne) bs = bs.slice(0, 1);
    if (!bs.length || bs.length < minBlockers(a)) continue;
    map.set(aid, bs);
    bs.forEach((b) => used.add(b));
  }
  // A creature that must be blocked gets a blocker if any creature is still free to block it
  for (const a of attackers) {
    if (!mustBeBlocked(G, a) || map.has(a.id) || minBlockers(a) > 1) continue;
    const free = blockers.filter((b) => !used.has(b) && canBlock(G, b, a)).sort((x, y) => cv(x) - cv(y))[0];
    if (free) { map.set(a.id, [free]); used.add(free); }
  }
  return map;
}
function runInteractive({ decks, seed, human = 0, answers = [], setup = null, stopEmpty = true }) {
  const G = createGame({ decks, seed, record: true, human, answers, setup, stopEmpty });
  try {
    playGame(G);
    return { G, done: true, req: null };
  } catch (err) {
    if (err instanceof NeedInput) return { G, done: false, req: err.req };
    throw err;
  }
}

/* ---------- Turns ---------- */
function openingHand(G, P) {
  if (isHuman(G, P)) return humanOpeningHand(G, P);
  for (let m = 0; m <= 2; m++) {
    P.library.push(...P.hand); P.hand = [];
    G.rng.shuffle(P.library);
    drawCards(G, P, 7);
    const lands = P.hand.filter(isLand).length;
    P.mulligans = m;
    if (m === 2 || (lands >= 2 && lands <= 5)) break;
  }
  P.bottomed = toBottom(G, P.mulligans);
  for (let k = 0; k < P.bottomed; k++) {
    const lands = P.hand.filter(isLand);
    const pick = lands.length > 3 ? lands[0] : P.hand.filter((c) => !isLand(c)).sort((a, b) => b.def.mv - a.def.mv)[0] || P.hand[0];
    P.hand.splice(P.hand.indexOf(pick), 1);
    P.library.unshift(pick);
  }
}
function takeTurn(G) {
  G.turn++;
  const P = G.players[G.active];
  G.phase = 'begin';
  for (const Q of G.players) { Q.gyStart = Q.gy.map((c) => c.id); Q.drawn = 0; Q.cast = 0; Q.attackedWith = 0; Q.castDefs = []; Q.gainedTurn = 0; }
  G.endTurn = false; G.endSteps = 0;
  G.sacThisTurn = 0;
  phaseIn(G, P);
  // Untap step: stun counters, "doesn't untap" auras and Bewitching Leechcraft keep things tapped
  for (const c of P.bf) {
    c.sick = false;
    if (c.stun) { c.stun = false; continue; }
    if (!c.tapped) continue;
    if (c.sfl && c.sfl.noUntap) continue;
    if (ctrCount(c, 'stun')) { removeCounters(G, c, 'stun', 1); continue; }
    if (c.sfl && c.sfl.leech) { if (c.cnt > 0) { c.cnt--; dirty(G); c.tapped = false; } continue; }
    c.tapped = false;
  }
  P.landsPlayed = 0;
  // "Until your next turn" copies end (Absorbing Man)
  for (const c of P.bf) if (c.def.untilNextTurn && c.faceBase) { c.def = c.faceBase; c.faceBase = null; c.copyBy = null; dirty(G); }
  emit(G, 'turn', `Turn ${G.turn}: ${P.name}.`, { who: P.i });
  const slaved = P.slaved > 0;
  if (slaved) { P.slaved--; G.slavedTurn = G.turn; G.slavedP = P.i; emit(G, 'info', `${other(G, P).name} controls ${P.name} this turn: ${P.name} plays no lands, casts no spells and doesn't attack.`, { who: other(G, P).i }); }
  if (G.pending) { fire(G, 'upkeep', { P }); sba(G); if (G.over) return; }
  if (!(G.turn === 1)) { drawCards(G, P, 1, true); sba(G); if (G.over) return; }
  G.phase = 'main1';
  // Sagas get a lore counter at the start of your first main phase
  for (const c of P.bf.slice()) if (c.def.saga && c.def.saga.length && !G.over) addLore(G, P, c, 1);
  sba(G);
  if (G.over) return;
  if (G.pending) { fire(G, 'mainStart', { P }); sba(G); if (G.over) return; }
  if (G.endTurn || slaved) { /* Ultima: straight to cleanup; a controlled turn does nothing */ } else if (isHuman(G, P)) {
    const next = humanMain(G, P, 1); if (G.over) return;
    if (G.endTurn) { /* ended */ } else if (next === 'combat') {
      combat(G); if (G.over) return;
      while (G.extraCombat && !G.over && !G.endTurn) { G.extraCombat = false; combat(G); }
      if (G.over) return;
      if (!G.endTurn) humanMain(G, P, 2); if (G.over) return;
    } else if (G.pending) { fire(G, 'combatStart', { P }); sba(G); if (G.over) return; }
  } else {
    aiMain(G, P, 1); if (G.over) return;
    if (!G.endTurn) { combat(G); if (G.over) return; }
    while (G.extraCombat && !G.over && !G.endTurn) { G.extraCombat = false; combat(G); }
    if (G.over) return;
    if (!G.endTurn) aiMain(G, P, 2); if (G.over) return;
  }
  G.extraCombat = false;
  emptyPool(G, P);
  G.phase = 'end';
  // End step (Y'shtola Rhul can add another one after the first)
  for (let n = 0; n < 2 && G.pending && !G.endTurn; n++) {
    G.endSteps = n + 1;
    G.extraEnd = false;
    fire(G, 'endStep', { P, nth: n + 1 });
    const due = G.delayed.filter((d) => d.when === 'end' && (d.at == null || d.at === G.turn));
    G.delayed = G.delayed.filter((d) => !due.includes(d));
    for (const d of due) if (!G.over) { d.run(G); sba(G); }
    sba(G);
    if (G.over) return;
    if (!G.extraEnd) break;
    emit(G, 'info', 'There is an additional end step.', { who: P.i });
  }
  const oneTurn = allCreatures(G).filter((c) => c.def.sacAtEnd);
  if (oneTurn.length) { emit(G, 'sac', `${nameList(oneTurn)} ${oneTurn.length > 1 ? 'are' : 'is'} sacrificed at the end step.`, { who: P.i, cards: oneTurn.map((c) => c.id) }); dieNow(G, oneTurn); sba(G); if (G.over) return; }
  if (!G.endTurn) { if (isHuman(G, other(G, P))) humanWindow(G, other(G, P), 'end'); else aiInstantWindow(G, other(G, P), 'end'); }
  if (G.over) return;
  const handMax = P.bf.some((c) => c.def.noMaxHand) ? Infinity : Math.max(7, ...P.bf.map((c) => c.def.maxHand || 0));
  if (P.hand.length > handMax) { const n = P.hand.length - handMax; discardChoice(G, P, n, 'hand'); emit(G, 'discard', `${P.name} discards ${n === 1 ? 'a card' : `${n} cards`} to hand size.`, { who: P.i }); cmdHome(G); }
  // Cleanup: damage wears off, and so does everything "until end of turn"
  for (const Q of G.players) for (const c of Q.bf) {
    if (!c.def.keepDmg) { c.dmg = 0; c.dt = false; } c.tp = 0; c.tt = 0; c.tkw = []; c.pumps = 0; c.noBlock = false; c.exileDead = false;
    if (c.tf && Object.keys(c.tf).length) c.tf = {};
    if (c.xtrig) { c.xtrig = c.xtrig.filter((t) => !t.eot); if (!c.xtrig.length) c.xtrig = null; }
    if (c.base && c.base.eot) c.base = null;
    if (c.crewed) c.crewed = false;
  }
  for (const c of allPerms(G)) if (c.ctrlFx && (c.ctrlFx.dur === 'eot' || (c.ctrlFx.dur === 'until' && G.turn >= c.ctrlFx.until))) returnControl(G, c);
  for (const Q of G.players) emptyPool(G, Q);
  dirty(G);
  G.fog = false;
  G.noPrevent = false;
  sba(G);
  if (G.over) return;
  const k = G.extraTurns.indexOf(P.i);
  if (k >= 0) { G.extraTurns.splice(k, 1); emit(G, 'info', `${P.name} takes an extra turn.`, { who: P.i }); return; }
  G.active = 1 - G.active;
}
// Phasing (King of the Oathbreakers): phased-out permanents come back during their controller's untap step
function phaseOut(G, c) {
  if (!onBf(G, c)) return;
  const P = ctrlOf(G, c);
  const group = [c].concat(attachedTo(G, c));
  for (const x of group) { const k = P.bf.indexOf(x); if (k >= 0) P.bf.splice(k, 1); else { const Q = ctrlOf(G, x); Q.bf.splice(Q.bf.indexOf(x), 1); } x.phased = true; x.attacking = false; x.blocking = 0; x.blockedBy = []; }
  for (const Q of G.players) for (const x of Q.bf) { if (x.blocking === c.id) x.blocking = 0; x.blockedBy = x.blockedBy.filter((b) => b !== c); }
  (P.phasedOut = P.phasedOut || []).push(...group);
  dirty(G);
  emit(G, 'phase', `${c.def.name} phases out.`, { who: P.i, cards: [c.id] });
}
function phaseIn(G, P) {
  if (!P.phasedOut || !P.phasedOut.length) return;
  const back = P.phasedOut.splice(0);
  for (const x of back) { x.phased = false; G.players[x.ctrl].bf.push(x); }
  dirty(G);
  emit(G, 'phase', `${nameList(back)} phase${back.length > 1 ? '' : 's'} in.`, { who: P.i, cards: back.map((x) => x.id) });
  for (const x of back) fire(G, 'phaseIn', { c: x, P });
}
// "If this card is in your opening hand, you may begin the game with it on the battlefield"
function beginOnBattlefield(G) {
  for (const P of [G.players[G.first], G.players[1 - G.first]]) for (const c of P.hand.filter((x) => x.def.leyline)) {
    if (isHuman(G, P) && !yesNo(G, P, c, `Begin the game with ${c.def.name} on the battlefield?`, true)) continue;
    P.hand.splice(P.hand.indexOf(c), 1);
    emit(G, 'enter', `${P.name} begins the game with ${c.def.name} on the battlefield.`, { who: P.i, card: c.id });
    enterBattlefield(G, P, c, null, {});
  }
}
function playGame(G) {
  if (G.setup) emit(G, 'start', G.setup.text || `${G.players[0].name} vs ${G.players[1].name}.`, { who: G.first });
  else {
    for (const P of G.players) openingHand(G, P);
    emit(G, 'start', `${G.players[0].name} vs ${G.players[1].name}. ${G.players[G.first].name} goes first.`, { who: G.first });
    beginOnBattlefield(G);
    for (const P of G.players) if (P.mulligans) emit(G, 'mulligan', G.format === 'commander' ? `${P.name} mulligans${P.mulligans === 1 ? ' for free' : ''} and keeps ${7 - P.bottomed}.` : `${P.name} mulligans to ${7 - P.mulligans}.`, { who: P.i });
  }
  while (!G.over && G.turn < MAX_TURNS) takeTurn(G);
  if (!G.over) endGame(G, 'turns');
  return G;
}
function runMatch(decks, seed, record = true) {
  const G = createGame({ decks, seed, record });
  playGame(G);
  return G;
}
function replayOf(G) {
  const used = {};
  for (const id of Object.keys(G.defs)) used[id] = G.defs[id];
  return {
    seed: G.seed, first: G.first, winner: G.winner, reason: G.reason, turns: G.turn, format: G.format,
    players: G.players.map((P) => ({ name: P.name, persona: P.persona, colors: P.colors, life: P.life, stats: P.stats, mulligans: P.mulligans, kept: 7 - P.bottomed,
      cmd: P.cmd ? { id: P.cmd.id, d: P.cmd.def.id } : null, cmdDmg: Object.values(P.cmdDmg).reduce((s, n) => Math.max(s, n), 0) })),
    defs: used, frames: G.frames,
  };
}

/* ============================================================
   4. Deck building
   ============================================================ */
const ARCH = {
  aggro:    { lands: 22, curve: { 1: 6, 2: 10, 3: 7, 4: 3, 5: 1 }, roles: { removal: 8, burn: 2, trick: 3, draw: 0, counter: 0, sweeper: 0, tokens: 1 } },
  midrange: { lands: 24, curve: { 1: 2, 2: 6, 3: 7, 4: 5, 5: 3, 6: 2 }, roles: { removal: 9, burn: 0, trick: 2, draw: 2, counter: 1, sweeper: 0, tokens: 2 } },
  control:  { lands: 24, curve: { 2: 4, 3: 5, 4: 4, 5: 3, 6: 2 }, roles: { removal: 8, burn: 0, trick: 0, draw: 3, counter: 4, sweeper: 2, tokens: 1 } },
};
const RESTRICTED = new Set(['Ancestral Recall', 'Time Walk', 'Timetwister', 'Wheel of Fortune', 'Channel', 'Balance']);
const GUILD = { WU: 'Azorius', UB: 'Dimir', BR: 'Rakdos', RG: 'Gruul', GW: 'Selesnya', WB: 'Orzhov', UR: 'Izzet', BG: 'Golgari', RW: 'Boros', GU: 'Simic' };
const MONO = { W: 'White', U: 'Blue', B: 'Black', R: 'Red', G: 'Green' };
const NOUNS = { aggro: ['Blitz', 'Rush', 'Onslaught', 'Stampede', 'Raiders', 'Charge'], midrange: ['Vanguard', 'Legion', 'Company', 'Warband', 'Host', 'Pack'], control: ['Bastion', 'Conclave', 'Archive', 'Citadel', 'Wardens', 'Tower'] };
function guildName(colors) {
  if (colors.length === 1) return MONO[colors[0]];
  const a = colors.join(''), b = colors.slice().reverse().join('');
  return GUILD[a] || GUILD[b] || colors.join('');
}
function buildDeck(pool, { colors, archetype = 'midrange', seed, name, include = [], exclude = [], bonus = null }) {
  const rng = makeRng(seed == null ? Date.now() : seed);
  const cfg = ARCH[archetype] || ARCH.midrange;
  const colorOk = (d) => d.colors.every((c) => colors.includes(c));
  const usesAll = (d) => colors.length > 1 && colors.every((c) => d.colors.includes(c));
  const skip = new Set(exclude);
  const nonland = pool.filter((d) => !d.types.includes('Land') && colorOk(d) && d.mv <= 7 && !skip.has(d.name));
  const scoreCache = new Map();
  const score = (d) => { if (!scoreCache.has(d)) scoreCache.set(d, baseScore(d)); return scoreCache.get(d); };
  const baseScore = (d) => {
    let s = efficiency(d) * 10;
    const creature = d.types.includes('Creature');
    if (archetype === 'aggro' && creature) s += (d.kw.includes('haste') ? 1.5 : 0) + d.power * 0.35 + (d.power / Math.max(1, d.mv)) * 2.5 - (d.kw.includes('defender') ? 6 : 0) - Math.max(0, d.toughness - d.power) * 0.3 - (d.power < 2 ? 1.5 : 0);
    if (archetype === 'control' && creature) s += (d.kw.includes('flying') ? 1 : 0) + d.etb.length * 1.2 + d.toughness * 0.15 + (d.kw.includes('defender') ? -2 : 0);
    if (archetype === 'midrange' && creature) s += d.etb.length * 0.6 + (d.kw.includes('defender') ? -3 : 0);
    if (usesAll(d)) s += 0.8;
    if (!d.colors.length) s -= 1.2;
    if (d.supertypes.includes('Legendary')) s -= 0.5;
    if (!creature && archetype === 'aggro' && (d.spell || []).some((e) => e.k === 'dmg' && e.to !== 'creature')) s += 1.2;
    if (bonus) s += bonus(d);
    return s + rng.next() * 2.6;
  };
  const picks = new Map();
  const total = () => [...picks.values()].reduce((s, n) => s + n, 0);
  const addCopies = (d, want) => {
    const cap = d.maxCopies || (RESTRICTED.has(d.name) ? 1 : d.supertypes.includes('Legendary') ? 2 : 4);
    const have = picks.get(d) || 0;
    const n = Math.min(cap - have, want);
    if (n > 0) picks.set(d, have + n);
    return Math.max(0, n);
  };
  const fill = (cands, need) => {
    const sorted = cands.map((d) => ({ d, s: score(d) })).sort((a, b) => b.s - a.s);
    let k = 0;
    while (need > 0 && k < sorted.length) {
      const copies = k === 0 ? 4 : k < 3 ? 3 + (rng.next() < 0.5 ? 1 : 0) : 2 + (rng.next() < 0.5 ? 1 : 0);
      need -= addCopies(sorted[k].d, Math.min(copies, need));
      k++;
    }
    return need;
  };
  const spellsTotal = 60 - cfg.lands;
  for (const [n, want] of include) { const d = nonland.find((x) => x.name === n) || pool.find((x) => x.name === n && !x.types.includes('Land')); if (d) addCopies(d, want); }
  let leftover = 0;
  for (const [mv, n] of Object.entries(cfg.curve)) leftover += fill(nonland.filter((d) => d.types.includes('Creature') && d.mv === +mv), n);
  const byRole = (r) => nonland.filter((d) => d.role === r && !picks.has(d) && efficiency(d) >= 0.35);
  for (const [role, n] of Object.entries(cfg.roles)) {
    if (!n) continue;
    if (role === 'removal') leftover += fill(byRole('removal').concat(archetype === 'aggro' ? byRole('burn') : []), n);
    else leftover += fill(byRole(role), n);
  }
  let guard = 0;
  while (total() < spellsTotal && guard++ < 40) {
    const extra = nonland.filter((d) => (picks.get(d) || 0) < (d.maxCopies || (RESTRICTED.has(d.name) ? 1 : d.supertypes.includes('Legendary') ? 2 : 4)) && (d.types.includes('Creature') ? d.mv <= (archetype === 'aggro' ? 3 : 5) : ['removal', 'draw', 'tokens', 'other', 'aura'].includes(d.role) && efficiency(d) >= 0.4));
    if (!extra.length) break;
    fill(extra, Math.min(4, spellsTotal - total()));
  }
  // A small pool (one set, one color): take whatever still fits, and make up any shortfall with lands
  if (total() < spellsTotal) fill(nonland.filter((d) => (picks.get(d) || 0) < (d.maxCopies || (RESTRICTED.has(d.name) ? 1 : d.supertypes.includes('Legendary') ? 2 : 4))), spellsTotal - total());
  const landCount = cfg.lands + Math.max(0, spellsTotal - total());
  const forced = new Set(include.map(([n]) => n));
  while (total() > spellsTotal) { const [d, n] = [...picks].filter(([x]) => !forced.has(x.name)).sort((a, b) => score(a[0]) - score(b[0]))[0]; if (n > 1) picks.set(d, n - 1); else picks.delete(d); }
  // Lands: duals for the pair, then basics split by colored pips.
  const lands = new Map();
  if (colors.length === 2) {
    const duals = pool.filter((d) => d.types.includes('Land') && d.mana && d.mana.length === 2 && colors.every((c) => d.mana.includes(c)) && !d.supertypes.includes('Basic'))
      .sort((a, b) => (a.etbTapped ? 1 : 0) - (b.etbTapped ? 1 : 0) || (b.etb.length - a.etb.length) || (rng.next() - 0.5));
    if (duals[0]) lands.set(duals[0], 4);
    if (duals[1] && archetype !== 'aggro') lands.set(duals[1], 2);
  }
  const pips = Object.fromEntries(colors.map((c) => [c, 0]));
  for (const [d, n] of picks) for (const c of colors) pips[c] += d.cost[c] * n;
  const basicsLeft = landCount - [...lands.values()].reduce((s, n) => s + n, 0);
  const pipTotal = Object.values(pips).reduce((s, n) => s + n, 0) || 1;
  const BASIC = { W: 'Plains', U: 'Island', B: 'Swamp', R: 'Mountain', G: 'Forest' };
  let assigned = 0;
  colors.forEach((c, k) => {
    const n = k === colors.length - 1 ? basicsLeft - assigned : Math.round((basicsLeft * pips[c]) / pipTotal);
    const basic = pool.find((d) => d.name === BASIC[c]);
    if (basic && n > 0) { lands.set(basic, n); assigned += n; }
  });
  const list = [...picks].map(([def, n]) => ({ def, n })).concat([...lands].map(([def, n]) => ({ def, n })));
  const creatures = [...picks].filter(([d]) => d.types.includes('Creature'));
  const tribeCount = {};
  creatures.forEach(([d, n]) => d.sub.forEach((t) => { tribeCount[t] = (tribeCount[t] || 0) + n; }));
  const tribe = Object.entries(tribeCount).sort((a, b) => b[1] - a[1])[0];
  const noun = rng.pick(NOUNS[archetype] || NOUNS.midrange);
  const deckName = name || (tribe && tribe[1] >= 8 ? `${guildName(colors)} ${tribe[0]} ${noun}` : `${guildName(colors)} ${noun}`);
  return deckFromList(deckName, colors, archetype, list);
}
/* ---------- Commander decks: 99 different cards (basic lands aside) in the commander's colors ---------- */
const CMDR_ARCH = {
  aggro:    { lands: 35, curve: { 1: 7, 2: 12, 3: 10, 4: 7, 5: 4, 6: 2 }, roles: { removal: 10, burn: 4, trick: 4, draw: 2, counter: 0, sweeper: 0, tokens: 2 } },
  midrange: { lands: 37, curve: { 1: 3, 2: 9, 3: 9, 4: 8, 5: 6, 6: 4, 7: 2 }, roles: { removal: 11, burn: 0, trick: 2, draw: 4, counter: 1, sweeper: 1, tokens: 2 } },
  control:  { lands: 38, curve: { 2: 5, 3: 6, 4: 6, 5: 5, 6: 4, 7: 2 }, roles: { removal: 12, burn: 0, trick: 2, draw: 7, counter: 7, sweeper: 3, tokens: 2 } },
};
const CMD_BANNED = new Set(['Ancestral Recall', 'Balance', 'Biorhythm', 'Channel', 'Coalition Victory', 'Emrakul, the Aeons Torn', 'Erayo, Soratami Ascendant', 'Falling Star', 'Flash', 'Gifts Ungiven', 'Griselbrand',
  'Hullbreacher', 'Iona, Shield of Emeria', 'Karakas', 'Leovold, Emissary of Trest', 'Library of Alexandria', 'Limited Resources', 'Lutri, the Spellchaser', 'Nadu, Winged Wisdom', 'Primeval Titan', 'Prophet of Kruphix',
  'Rofellos, Llanowar Emissary', 'Sundering Titan', 'Sway of the Stars', 'Sylvan Primordial', 'Time Walk', 'Tolarian Academy', 'Trade Secrets', 'Upheaval', 'Worldfire', 'Timetwister', 'Wheel of Fortune']);
// Colors in the mana cost and rules text (not reminder text). A deck may only use cards inside its commander's identity.
function colorIdentity(def) {
  // Every face counts: the back of a double-faced card, an adventure, a melded card
  const s = new Set();
  for (const f of facesOf(def)) faceIdentity(f).forEach((c) => s.add(c));
  return COLORS.filter((c) => s.has(c));
}
function faceIdentity(def) {
  const s = new Set(def.colors);
  // Basic lands carry their color in the type line; "one mana of any color" adds nothing to identity
  if (def.types.includes('Land') && def.mana && def.mana.length < 5) def.mana.forEach((c) => { if (COLORS.includes(c)) s.add(c); });
  const text = `${def.manaCost || ''} ${(def.text || '').replace(/\([^()]*\)/g, '')}`;
  for (const m of text.matchAll(/\{([^}]+)\}/g)) for (const c of COLORS) if (m[1].toUpperCase().split('/').includes(c)) s.add(c);
  return COLORS.filter((c) => s.has(c));
}
const canCommand = (def) => def.supertypes.includes('Legendary') && def.types.includes('Creature');
function commanderArchetype(def) {
  const id = colorIdentity(def);
  if (def.mv <= 3 || (def.kw.includes('haste') && def.mv <= 4)) return 'aggro';
  if (id.includes('U') && !id.includes('R') && !id.includes('G')) return 'control';
  return 'midrange';
}
const shortName = (name) => name.split(',')[0].replace(/^The /, '');
function buildCommanderDeck(pool, { commander, archetype, seed, name, include = [], exclude = [] }) {
  const rng = makeRng(seed == null ? 1 : seed);
  archetype = archetype || commanderArchetype(commander);
  const cfg = CMDR_ARCH[archetype] || CMDR_ARCH.midrange;
  const ident = colorIdentity(commander);
  const inId = (d) => colorIdentity(d).every((c) => ident.includes(c));
  const skip = new Set(exclude);
  const nonland = pool.filter((d) => !d.types.includes('Land') && d.name !== commander.name && !CMD_BANNED.has(d.name) && !skip.has(d.name) && inId(d) && d.mv <= 8);
  const tribes = new Set(commander.sub);
  const ramp = commander.mv >= 5 || archetype !== 'aggro';
  const spellsMatter = commander.kw.includes('prowess');
  const lifeMatters = commander.onGain && commander.onGain.length;
  const scoreCache = new Map();
  const baseScore = (d) => {
    let s = efficiency(d) * 10;
    const creature = d.types.includes('Creature');
    if (archetype === 'aggro' && creature) s += (d.kw.includes('haste') ? 1.5 : 0) + d.power * 0.35 + (d.power / Math.max(1, d.mv)) * 2.2 - (d.kw.includes('defender') ? 6 : 0) - Math.max(0, d.toughness - d.power) * 0.3 - (d.power < 2 ? 1.2 : 0);
    if (archetype === 'control' && creature) s += (d.kw.includes('flying') ? 1 : 0) + d.etb.length * 1.2 + d.toughness * 0.15 + (d.kw.includes('defender') ? -2 : 0);
    if (archetype === 'midrange' && creature) s += d.etb.length * 0.6 + (d.kw.includes('defender') ? -3 : 0);
    // Forty life and a long game: bigger threats and card flow matter more than in a 20-life game
    if (archetype !== 'aggro') s += Math.min(d.mv, 6) * 0.22;
    if (creature && d.mana) s += ramp ? 2.2 : 0.8;
    if (creature && d.sub.some((t) => tribes.has(t))) s += 1.1;
    if (spellsMatter && !creature) s += 0.9;
    if (lifeMatters && (d.kw.includes('lifelink') || (d.spell || d.etb).some((e) => e.k === 'gain'))) s += 1.2;
    if (ident.length > 1 && d.colors.length > 1) s += 0.8;
    if (!d.colors.length && !d.mana) s -= 1.2;
    if (!creature && (d.spell || []).some((e) => e.k === 'draw' || e.k === 'brainstorm')) s += archetype === 'aggro' ? 0 : 0.8;
    return s + rng.next() * 2.6;
  };
  const score = (d) => { if (!scoreCache.has(d)) scoreCache.set(d, baseScore(d)); return scoreCache.get(d); };
  const picks = new Set();
  for (const n of include) { const d = nonland.find((x) => x.name === n); if (d) picks.add(d); }
  const fill = (cands, need) => {
    const sorted = cands.filter((d) => !picks.has(d)).sort((a, b) => score(b) - score(a));
    for (let k = 0; k < sorted.length && need > 0; k++, need--) picks.add(sorted[k]);
    return need;
  };
  const spellsTotal = 99 - cfg.lands;
  const curveMv = (d, mv) => (+mv === 7 ? d.mv >= 7 : d.mv === +mv);
  for (const [mv, n] of Object.entries(cfg.curve)) {
    const have = [...picks].filter((d) => d.types.includes('Creature') && curveMv(d, mv)).length;
    fill(nonland.filter((d) => d.types.includes('Creature') && curveMv(d, mv)), n - have);
  }
  const byRole = (r) => nonland.filter((d) => d.role === r && efficiency(d) >= 0.3);
  for (const [role, n] of Object.entries(cfg.roles)) {
    if (!n) continue;
    const have = [...picks].filter((d) => d.role === role).length;
    if (role === 'removal') fill(byRole('removal').concat(archetype === 'aggro' ? byRole('burn') : []), n - have);
    else fill(byRole(role), n - have);
  }
  if (picks.size < spellsTotal) fill(nonland.filter((d) => (d.types.includes('Creature') ? d.mv <= 6 : ['removal', 'draw', 'tokens', 'burn'].includes(d.role))), spellsTotal - picks.size);
  if (picks.size < spellsTotal) fill(nonland, spellsTotal - picks.size);
  const keep = new Set(include);
  while (picks.size > spellsTotal) { const worst = [...picks].filter((d) => !keep.has(d.name)).sort((a, b) => score(a) - score(b))[0]; picks.delete(worst); }
  // Lands: every land must stay inside the identity. Untapped duals first, then the ones that gain life or scry.
  const lands = new Map();
  const landOk = (d) => d.types.includes('Land') && !d.supertypes.includes('Basic') && d.mana && d.mana.every((c) => c === 'C' || ident.includes(c)) && !CMD_BANNED.has(d.name);
  const landScore = (d) => {
    const colorsMade = d.mana.filter((c) => ident.includes(c)).length;
    let v = colorsMade * 2 - (d.etbTapped ? 1.6 : 0) + (d.checkland ? 0.8 : 0) + d.etb.reduce((x, e) => x + Math.max(0, effectValue(e)), 0) + (d.cycling ? 0.6 : 0);
    if (d.etb.some((e) => effectValue(e) < 0)) v -= 2;
    return v + rng.next() * 0.3;
  };
  const nonbasics = pool.filter(landOk).sort((a, b) => landScore(b) - landScore(a));
  const wantNon = ident.length >= 2 ? Math.min(10, 3 + ident.length * 3) : 2;
  for (const d of nonbasics) {
    if (lands.size >= wantNon) break;
    if (ident.length >= 2 && d.mana.filter((c) => ident.includes(c)).length < 2) continue;
    if (ident.length < 2 && !(d.cycling || d.etb.some((e) => effectValue(e) > 0))) continue;
    lands.set(d, 1);
  }
  const pips = Object.fromEntries(ident.map((c) => [c, 0]));
  for (const d of picks) for (const c of ident) pips[c] += d.cost[c];
  for (const c of ident) pips[c] += commander.cost[c] * 3;
  // One set can run out of cards in the commander's colors: the rest of the 99 is basic lands
  const basicsLeft = cfg.lands - lands.size + Math.max(0, spellsTotal - picks.size);
  const pipTotal = Object.values(pips).reduce((x, n) => x + n, 0) || 1;
  const BASIC = { W: 'Plains', U: 'Island', B: 'Swamp', R: 'Mountain', G: 'Forest' };
  let assigned = 0;
  const idOrBasic = ident.length ? ident : [];
  idOrBasic.forEach((c, k) => {
    const n = k === idOrBasic.length - 1 ? basicsLeft - assigned : Math.round((basicsLeft * pips[c]) / pipTotal);
    const basic = pool.find((d) => d.name === BASIC[c]);
    if (basic && n > 0) { lands.set(basic, n); assigned += n; }
  });
  const list = [...picks].map((def) => ({ def, n: 1 })).concat([...lands].map(([def, n]) => ({ def, n })));
  const noun = rng.pick({ aggro: ['Charge', 'Onslaught', 'Raiders', 'Blitz'], midrange: ['Host', 'Legion', 'Court', 'Vanguard'], control: ['Archive', 'Conclave', 'Tower', 'Wardens'] }[archetype] || ['Host']);
  return deckFromList(name || `${shortName(commander.name)}'s ${noun}`, ident, archetype, list, { commander, format: 'commander' });
}
function deckFromList(name, colors, archetype, list, extra) {
  const cards = [];
  list.forEach(({ def, n }) => { for (let k = 0; k < n; k++) cards.push(def); });
  return Object.assign({ name, colors, archetype, list, cards }, extra || {});
}

return {
  compileCard, parseCost, parseTarget, parseSentence, cardValue, efficiency, makeRng, KW, COLORS, slug,
  PERSONAS, ARCH, MAX_TURNS, createGame, playGame, runMatch, replayOf, buildDeck, deckFromList, guildName,
  runInteractive, NeedInput, humanActions, attackCandidates, costText,
  CMD, CMDR_ARCH, CMD_BANNED, colorIdentity, canCommand, commanderArchetype, buildCommanderDeck,
  _internal: { cv, fight, kills, canBlock, planPayment, manaSources, evalEffect, chooseTargets, aiAttackers, aiBlocks, sba, snap, newCard, castSpell, resolveEffects, combat, takeTurn, enterBattlefield, forecast, protectedFrom, targetOk, pow, tou, applyAction, returnControl, damageCreature },
  registerScripts, SCRIPTS,
  lib: { fx, tempt, amass, makeTokens, FOOD, TREASURE, ORC_ARMY, tokenDef, addCounters, removeCounters, matches, countMine, isCreature, isLand, isArtifact, isEnchantment,
    isLegendary, pow, tou, has, hasSub, orcish, subOf, ctrCount, isEquipped, equipmentOn, attachedTo, attach, ringBearer, other, emit, fire, dirty, dealDamage, damageCreature,
    damagePlayer, gainLife, drawCards, discardChoice, scryChoice, mill, searchLibrary, sacrifice, sacrificeChoice, destroyPermanent, exilePermanent, bounceCard, gainControl,
    putOntoBattlefield, enterBattlefield, removeFromZones, pickCards, chooseMode, yesNo, chooseNumber, ask, isHuman, cv, pv, onBf, byId, allPerms, allCreatures, diedThisTurn,
    addLore, copySpell, phaseOut, castSpell, resolveWithTargets, chooseTargets, tgtCands, dieNow, leaveBattlefield, resetCard, toGraveyard, exileCard, nameList, sgn, genericCost,
    parseCost, costMV, costText, lethalTo, kwValue, KW_VALUE, handValue, lifeW, canPay, pay, canAttackNow, forecast, combatValue, threatOf, isIS, foodsOf, legendsOf, fightScore,
    fightCards, biteCards, flicker, flickerVal, goad, bottomFromHand, lookAtTop, revealUntil, freeCastFromHand, castCopyOfCard, exileUntil, returnHeld, addPool, ANY, needsTarget,
    targetList, allTargets, findCard, protectedFrom, historicDef, isPermanentSpell, spellEffects, effsValue, effectValue, castZone, aiScry, pickBasicFrom, putInGraveyard, defMatches, lethalTo,
    canBlock, kills, dmgOut, combatPow, minBlockers, phaseIn, ctrlOf, onBfC: onBf, equipGain, uniqueByName, discardWorst, emptyPool, refFor, tgtOk, castCost, maxX,
    EFF, abilitiesOf, readyAbilities, activate, aiAbilities, parseEffects, parseKwLine, parseStructural, parseStatic, parseActivated, normalizeText,
    surveil, transform, blink, meld, castAdventure, addEmblem, castNow, evalCast, modeChoices, auraHost, abilityCost, sneakWindow, teamworkPay, discardsThisTurn, noteDiscard, finishCountered, enteredThisTurn, attackedThisTurn, investigate, connive, shieldSave, CLUE, altFace, reduceCost, twPick, twPower, hexP, landChoices, landLimit, gyPermit, acOf, addCostInto, facesOf, sagaFinal, dmgMod, isInstantSpeed, playLandChoice },
};
});
