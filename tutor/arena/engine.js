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
    else return null; // X, hybrid, Phyrexian, {C}, snow: not supported
  }
  return c;
}
const costMV = (c) => c.g + c.W + c.U + c.B + c.R + c.G;

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
  let pro = null;
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
    if (!line) return { kws: [], pro };
  }
  const kws = parseKwList(line);
  return kws ? { kws, pro } : null;
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
  const REF_OK = new Set(['destroy', 'exile', 'bounce', 'tuck', 'dmg']);
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
      out.push(x);
    }
  }
  if (out.some((x) => (x.k === 'guide' && !x.ok) || (x.k === 'discardSelf' && x.may))) return null;
  return out;
}
function normalizeText(text, name) {
  let t = text.replace(/\s*\([^()]*\)/g, '');
  t = t.replace(/(^|, |\. )it (deals|gets)\b/g, '$1~ $2');
  const names = [name];
  if (name.includes(',')) names.push(name.split(',')[0]);
  for (const n of names) t = t.split(n).join('~');
  t = t.replace(/\bthis (creature|spell|land|card)\b/gi, '~');
  t = t.replace(/: It deals\b/g, ': ~ deals');
  return t.split('\n').map((l) => l.trim()).filter(Boolean);
}

/**
 * Turn a raw card ({name, manaCost, type, text, power, toughness}) into a definition the engine can play,
 * or return null when any part of the card is beyond the engine.
 */
function compileCard(raw) {
  const type = raw.type || '';
  const [main, subPart] = type.split(' — ');
  const mainWords = main.split(' ');
  const types = new Set(mainWords.filter((w) => ['Creature', 'Instant', 'Sorcery', 'Land', 'Artifact', 'Enchantment'].includes(w)));
  const supertypes = mainWords.filter((w) => ['Legendary', 'Basic', 'Snow', 'World'].includes(w));
  if (mainWords.some((w) => !['Creature', 'Instant', 'Sorcery', 'Land', 'Artifact', 'Enchantment', 'Legendary', 'Basic'].includes(w))) return null;
  const isCreature = types.has('Creature');
  const isSpell = types.has('Instant') || types.has('Sorcery');
  const isLand = types.has('Land');
  if (!isCreature && !isSpell && !isLand) return null;
  if (types.has('Enchantment') && !isCreature) return null;
  if (types.has('Artifact') && !isCreature) return null;
  if (isLand && (isCreature || isSpell)) return null;
  const cost = parseCost(raw.manaCost || '');
  if (!cost) return null;
  const def = {
    name: raw.name, typeLine: type, text: raw.text || '', manaCost: raw.manaCost || '', cost, mv: costMV(cost),
    types: [...types], supertypes, sub: subPart ? subPart.split(' ') : [],
    colors: COLORS.filter((c) => cost[c] > 0),
    power: isCreature ? +raw.power : 0, toughness: isCreature ? +raw.toughness : 0,
    kw: [], spell: null, etb: [], dies: [], attack: [], hit: [], mana: null,
    cantBlock: false, unblockable: false, mustAttack: false, etbTapped: false, checkland: null,
    blockFlyersOnly: false, landwalk: null, pumpAbility: null, pinger: null, cycling: null, landfall: [],
    leaves: [], onGain: [], pro: null, selfHurt: false, rider: 0, sacAtEnd: false, noWallBlock: false, tapLoot: false, sacPing: null,
  };
  if (isCreature && (isNaN(def.power) || isNaN(def.toughness) || def.toughness <= 0)) return null;
  const kw = new Set();
  const lines = normalizeText(raw.text || '', raw.name);
  const origLines = (raw.text || '').replace(/\s*\([^()]*\)/g, '').split('\n').map((l) => l.trim()).filter(Boolean);
  if (lines.length !== origLines.length) return null;
  if (isLand) {
    const basic = def.sub.map((w) => BASIC_COLOR[w.toLowerCase()]).filter(Boolean);
    if (basic.length) def.mana = basic;
  }
  for (let k = 0; k < lines.length; k++) {
    const line = lines[k];
    const l = line.toLowerCase();
    const ol = origLines[k];
    let m;
    const kl = isCreature ? parseKwLine(l) : null;
    if (kl) { kl.kws.forEach((x) => kw.add(x)); if (kl.pro) def.pro = (def.pro || []).concat(kl.pro); continue; }
    const trig = (re) => { const mm = re.exec(l); if (!mm) return undefined; return parseEffects(mm[1], ol.slice(ol.length - mm[1].length)); };
    let te;
    if ((te = trig(/^whenever ~ enters or attacks, (.+)$/)) !== undefined) { if (!te) return null; def.etb.push(...te); def.attack.push(...te); continue; }
    if ((te = trig(/^when ~ leaves the battlefield, (.+)$/)) !== undefined) { if (!te) return null; def.leaves.push(...te); continue; }
    if ((te = trig(/^whenever ~ deals (?:combat )?damage to an opponent, (.+)$/)) !== undefined) { if (!te) return null; def.hit.push(...te); continue; }
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
    if ((m = /^when ~ enters(?: the battlefield)?, (.+)$/.exec(l))) { const e = parseEffects(m[1], ol.slice(ol.length - m[1].length)); if (!e) return null; def.etb.push(...e); continue; }
    if ((m = /^when ~ dies, (.+)$/.exec(l))) { const e = parseEffects(m[1], ol.slice(ol.length - m[1].length)); if (!e) return null; def.dies.push(...e); continue; }
    if ((m = /^whenever ~ attacks, (.+)$/.exec(l))) { const e = parseEffects(m[1], ol.slice(ol.length - m[1].length)); if (!e) return null; def.attack.push(...e); continue; }
    if ((m = /^whenever ~ deals combat damage to a player, (.+)$/.exec(l))) { const e = parseEffects(m[1], ol.slice(ol.length - m[1].length)); if (!e) return null; def.hit.push(...e); continue; }
    if (isCreature && l === "~ can't block.") { def.cantBlock = true; continue; }
    if (isCreature && l === "~ can't be blocked.") { def.unblockable = true; continue; }
    if (isCreature && l === '~ attacks each combat if able.') { def.mustAttack = true; continue; }
    if (isCreature && l === '~ can block only creatures with flying.') { def.blockFlyersOnly = true; continue; }
    if (isCreature && l === '~ enters tapped.') { def.etbTapped = true; continue; }
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
    if (isCreature && (m = /^landfall \u2014 whenever a land you control enters, (.+)$/.exec(l))) { const e = parseEffects(m[1], ol.slice(ol.length - m[1].length)); if (!e) return null; def.landfall = e; continue; }
    if ((m = /^\{t\}: add \{c\}(\{c\})?\.$/.exec(l))) { def.mana = m[1] ? ['C', 'C'] : ['C']; continue; }
    if ((m = /^\{t\}: add \{([wubrg])\}(?: or \{([wubrg])\})?\.$/.exec(l))) { def.mana = [m[1], m[2]].filter(Boolean).map((x) => x.toUpperCase()); continue; }
    if ((m = /^\{t\}: add \{([wubrg])\}, \{([wubrg])\}, or \{([wubrg])\}\.$/.exec(l))) { def.mana = [m[1], m[2], m[3]].map((x) => x.toUpperCase()); continue; }
    if (l === '{t}: add one mana of any color.') { def.mana = COLORS.slice(); continue; }
    if (isLand && l === '~ enters tapped.') { def.etbTapped = true; continue; }
    if (isLand && (m = /^~ enters tapped unless you control an? (plains|island|swamp|mountain|forest) or an? (plains|island|swamp|mountain|forest)\.$/.exec(l))) { def.checkland = [m[1], m[2]].map((x) => x[0].toUpperCase() + x.slice(1)); continue; }
    if (isSpell) { const e = parseEffects(l, ol); if (!e) return null; (def.spell = def.spell || []).push(...e); continue; }
    return null;
  }
  if (isSpell && !(def.spell && def.spell.length)) return null;
  if (isLand && !def.mana) return null;
  if (isCreature && def.mana && def.mana.length && !lines.length) return null;
  def.kw = [...kw];
  if (def.kw.includes('flash') && !isCreature) return null;
  def.id = slug(raw.name);
  def.value = cardValue(def);
  def.role = roleOf(def);
  return def;
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
    default: return 0;
  }
}
function cardValue(def) {
  if (def.types.includes('Land')) return 0;
  let v = 0;
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
  } else {
    v = def.spell.reduce((s, e) => s + effectValue(e), 0);
    if (def.spell.some((e) => (e.k === 'draw' && e.n === 1) || e.k === 'loot')) v -= 0.6;
    if (def.types.includes('Instant')) v += 0.5;
  }
  return Math.round(v * 100) / 100;
}
// Efficiency against mana value: what a card is worth per turn spent casting it.
function efficiency(def) {
  if (def.types.includes('Land')) return 0;
  const expected = [0, 2.6, 4.6, 6.4, 8.0, 9.4, 10.7, 11.8, 12.8][Math.min(8, def.mv)] || 13;
  return def.value / Math.max(2, expected);
}
function roleOf(def) {
  if (def.types.includes('Land')) return 'land';
  if (def.types.includes('Creature')) return 'creature';
  const ks = def.spell.map((e) => e.k);
  if (ks.includes('counter')) return 'counter';
  if (ks.includes('wrath') || ks.includes('dmgAll')) return 'sweeper';
  if (ks.some((k) => ['destroy', 'exile', 'edict', 'fight', 'bite', 'divided', 'tuck'].includes(k)) || def.spell.some((e) => e.k === 'dmg' && e.to !== 'player') || def.spell.some((e) => e.k === 'pump' && e.t < 0)) return 'removal';
  if (ks.includes('draw') || ks.includes('loot') || ks.includes('brainstorm')) return 'draw';
  if (ks.includes('tokens')) return 'tokens';
  if (ks.includes('pump') || ks.includes('pumpTeam') || ks.includes('counters') || ks.includes('fog')) return 'trick';
  if (ks.includes('dmg') || ks.includes('drain')) return 'burn';
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
const isCreature = (c) => c.def.types.includes('Creature');
const isLand = (c) => c.def.types.includes('Land');
const isInstantSpeed = (def) => def.types.includes('Instant') || def.kw.includes('flash');
const pow = (c) => c.def.power + c.cnt + c.tp;
const tou = (c) => c.def.toughness + c.cnt + c.tt;
const has = (c, k) => c.def.kw.includes(k) || c.tkw.includes(k);
const other = (G, P) => G.players[1 - P.i];
const onBf = (G, c) => G.players.some((P) => P.bf.includes(c));
const ctrlOf = (G, c) => G.players[c.ctrl];
const dmgOut = (c) => Math.max(0, pow(c)) * (has(c, 'double strike') ? 2 : 1);

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
    token: false, attacking: false, blocked: false, blocking: 0, blockedBy: [], pumps: 0, stun: false };
}
// `setup` starts a game from a fixed position instead of shuffled opening hands (the tutorial uses it):
// { turn, active, text, players: [{ life, library (top card first), hand, bf: [{ def, tapped, sick, cnt }], gy, cmdOnBf, cmdCasts, cmdDmg }] }
function createGame({ decks, seed, first = null, record = true, human = null, answers = [], setup = null }) {
  const rng = makeRng(seed == null ? Date.now() : seed);
  const format = decks.every((d) => d.commander) ? 'commander' : 'standard';
  const G = { rng, seed, turn: 0, active: 0, first: 0, players: [], frames: [], record, over: false, winner: null, reason: '',
    stack: [], defs: {}, nextId: 1, phase: 'setup', human, answers, qi: 0, format, setup };
  decks.forEach((d, i) => {
    const P = { i, name: d.name, persona: PERSONAS[d.archetype] ? d.archetype : 'midrange', colors: d.colors || [], life: format === 'commander' ? CMD.life : 20,
      library: [], hand: [], bf: [], gy: [], exile: [], landsPlayed: 0, lost: false, decked: false, mulligans: 0, bottomed: 0,
      command: [], cmd: null, cmdCasts: 0, cmdDmg: {},
      stats: { cast: 0, damage: 0, kills: 0, gained: 0, landsPlayed: 0 } };
    const mk = (def) => { G.defs[def.id] = def; return newCard(G, def, i); };
    if (d.commander) { const c = mk(d.commander); c.cmdr = true; P.cmd = c; P.command.push(c); }
    const su = setup && setup.players && setup.players[i];
    if (su) {
      if (su.life != null) P.life = su.life;
      P.library = (su.library || []).map(mk).reverse();
      P.hand = (su.hand || []).map(mk);
      for (const b of su.bf || []) { const c = mk(b.def); c.tapped = !!b.tapped; c.sick = !!b.sick; c.cnt = b.cnt || 0; P.bf.push(c); }
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
        return o;
      }),
      gy: P.gy.slice(-6).map((c) => [c.id, c.def.id]), gyN: P.gy.length, ex: P.exile.length,
      ...(G.format === 'commander' ? { cmd: P.command.map((c) => [c.id, c.def.id]), tax: P.cmdCasts * CMD.tax, cd: Object.assign({}, P.cmdDmg) } : null),
    })),
    stack: G.stack.map((s) => ({ id: s.card.id, d: s.card.def.id, who: s.P.i })),
  };
}
function emit(G, k, text, extra) {
  if (!G.record) return;
  G.frames.push(Object.assign({ k, text, turn: G.turn, who: G.active }, G.resolving ? { res: G.resolving } : null, extra || {}, { s: snap(G) }));
}
const sgn = (n) => (n < 0 || Object.is(n, -0) ? `-${Math.abs(n)}` : `+${n}`);
const nameList = (cs) => (cs.length <= 2 ? cs.map((c) => c.def.name).join(' and ') : `${cs.slice(0, -1).map((c) => c.def.name).join(', ')} and ${cs[cs.length - 1].def.name}`);

/* ---------- Zones ---------- */
function drawCards(G, P, n) {
  for (let k = 0; k < n; k++) {
    if (!P.library.length) { P.decked = true; return; }
    P.hand.push(P.library.pop());
  }
}
function resetCard(c) {
  c.tapped = false; c.sick = true; c.dmg = 0; c.dt = false; c.cnt = 0; c.tp = 0; c.tt = 0; c.tkw = []; c.attacking = false; c.blocked = false;
  c.blocking = 0; c.blockedBy = []; c.pumps = 0; c.stun = false; c.ctrl = c.owner; c.noBlock = false; c.exileDead = false;
}
function leaveBattlefield(G, c) {
  const P = ctrlOf(G, c);
  const k = P.bf.indexOf(c);
  if (k >= 0) P.bf.splice(k, 1);
  for (const Q of G.players) for (const x of Q.bf) {
    if (x.blocking === c.id) x.blocking = 0;
    if (x.blockedBy.length) x.blockedBy = x.blockedBy.filter((b) => b !== c);
  }
}
// "When this leaves the battlefield" triggers, once the creatures are gone
function leaves(G, list) {
  for (const { c, P } of list) if (c.def.leaves && c.def.leaves.length && !G.over) resolveEffects(G, P, c.def.leaves, c, null, 'dies');
}
function toGraveyard(G, c) { leaveBattlefield(G, c); resetCard(c); if (!c.token) G.players[c.owner].gy.push(c); }
function exileCard(G, c) { leaveBattlefield(G, c); resetCard(c); if (!c.token) G.players[c.owner].exile.push(c); }
function dieNow(G, list, why) {
  const dead = list.filter((c) => onBf(G, c));
  if (!dead.length) return;
  const owners = dead.map((c) => ctrlOf(G, c));
  const exiled = new Set(dead.filter((c) => c.exileDead));
  const died = dead.filter((c) => !exiled.has(c));
  died.forEach((c) => toGraveyard(G, c));
  exiled.forEach((c) => exileCard(G, c));
  if (died.length) emit(G, 'die', `${nameList(died)} ${died.length > 1 ? 'die' : 'dies'}${why ? ` ${why}` : ''}.`, { cards: died.map((c) => c.id) });
  if (exiled.size) emit(G, 'exile', `${nameList([...exiled])} ${exiled.size > 1 ? 'are' : 'is'} exiled instead of dying.`, { cards: [...exiled].map((c) => c.id) });
  died.forEach((c) => { if (c.def.dies.length && !G.over) resolveEffects(G, owners[dead.indexOf(c)], c.def.dies, c, null, 'dies'); });
  leaves(G, dead.map((c, k) => ({ c, P: owners[k] })));
}
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
function sba(G) {
  for (let guard = 0; guard < 25 && !G.over; guard++) {
    cmdHome(G);
    const dying = [], legend = [];
    for (const P of G.players) {
      const legends = new Map();
      for (const c of P.bf) {
        if (isCreature(c) && (tou(c) <= 0 || (!has(c, 'indestructible') && (c.dmg >= tou(c) || (c.dt && c.dmg > 0))))) dying.push(c);
        if (c.def.supertypes.includes('Legendary')) { if (legends.has(c.def.name)) legend.push(legends.get(c.def.name)); legends.set(c.def.name, c); }
      }
    }
    for (const c of dying) G.players[1 - c.ctrl].stats.kills++;
    const all = [...new Set(dying.concat(legend))];
    if (all.length) { dieNow(G, all); cmdHome(G); }
    let lost = false;
    for (const P of G.players) if (!P.lost && (P.life <= 0 || P.decked || cmdKO(G, P))) { P.lost = true; lost = true; }
    if (lost || G.players.some((P) => P.lost)) { endGame(G); return; }
    if (!all.length) return;
  }
}
function endGame(G, why) {
  if (G.over) return;
  G.over = true;
  const alive = G.players.filter((P) => !P.lost);
  if (why === 'turns') { G.winner = null; G.reason = 'turns'; emit(G, 'end', `The game is a draw after ${G.turn} turns.`); return; }
  if (alive.length === 1) {
    const W = alive[0], L = other(G, W);
    G.winner = W.i;
    G.reason = L.life > 0 && cmdKO(G, L) ? 'commander' : L.decked && L.life > 0 ? 'decked' : 'life';
    const why = G.reason === 'decked' ? `, as ${L.name} can't draw a card` : G.reason === 'commander' ? ` with ${CMD.lethal} commander damage from ${W.cmd ? W.cmd.def.name : 'their commander'}` : '';
    emit(G, 'end', `${W.name} wins on turn ${G.turn}${why}.`, { who: W.i });
  } else { G.winner = null; G.reason = 'both'; emit(G, 'end', 'Both players fall at once. The game is a draw.'); }
}

/* ---------- Mana ---------- */
function manaSources(P) {
  const out = [];
  for (const c of P.bf) {
    if (c.tapped || !c.def.mana) continue;
    if (isCreature(c) && c.sick && !has(c, 'haste')) continue;
    const two = c.def.mana.length === 2 && c.def.mana[0] === 'C' && c.def.mana[1] === 'C';
    out.push({ c, colors: two ? ['C'] : c.def.mana, amount: two ? 2 : 1 });
  }
  return out;
}
function planPayment(sources, cost) {
  const pips = [];
  for (const col of COLORS) for (let k = 0; k < cost[col]; k++) pips.push(col);
  const avail = sources.map((s) => ({ c: s.c, colors: s.colors, left: s.amount }));
  const able = (col) => avail.filter((s) => s.colors.includes(col)).length;
  pips.sort((a, b) => able(a) - able(b));
  const used = [];
  const assign = (i) => {
    if (i === pips.length) return true;
    const col = pips[i];
    const cands = avail.filter((s) => s.left > 0 && s.colors.includes(col))
      .sort((x, y) => x.colors.length - y.colors.length || (isLand(x.c) ? 0 : 1) - (isLand(y.c) ? 0 : 1));
    for (const s of cands) { s.left--; used.push(s); if (assign(i + 1)) return true; s.left++; used.pop(); }
    return false;
  };
  if (!assign(0)) return null;
  let g = cost.g;
  const rest = avail.filter((s) => s.left > 0)
    .sort((x, y) => (y.colors[0] === 'C') - (x.colors[0] === 'C') || (isLand(y.c) ? 1 : 0) - (isLand(x.c) ? 1 : 0) || x.colors.length - y.colors.length);
  for (const s of rest) while (s.left > 0 && g > 0) { s.left--; g--; used.push(s); }
  if (g > 0) return null;
  return [...new Set(used.map((s) => s.c))];
}
const canPay = (P, cost) => !!planPayment(manaSources(P), cost);
function pay(P, cost) {
  const plan = planPayment(manaSources(P), cost);
  if (!plan) return false;
  plan.forEach((c) => { c.tapped = true; });
  return true;
}
function canPayBoth(P, a, b) {
  const plan = planPayment(manaSources(P), a);
  if (!plan) return false;
  return !!planPayment(manaSources(P).filter((s) => !plan.includes(s.c)), b);
}
const manaCount = (P) => manaSources(P).reduce((s, x) => s + x.amount, 0);

/* ---------- Targets ---------- */
// Protection from a color or a creature type: can't be blocked, targeted or damaged by sources with that quality.
function protectedFrom(c, src) {
  if (!c.def.pro || !src || !src.def) return false;
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
const needsTarget = (e) => TARGETED.has(e.k) && !(e.k === 'dmg' && e.to === 'player');
function targetList(t) {
  if (!t || t === 'skip') return [];
  if (t.plan) return t.plan;
  const out = [];
  if (t.c) out.push({ c: t.c });
  if (t.c2) out.push({ c: t.c2 });
  if (t.p != null) out.push({ p: t.p });
  return out;
}
function stillLegal(G, P, e, t, src) {
  if (!t || t === 'skip') return false;
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
function evalEffect(G, P, e, ctx, source, lastT) {
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
      if (e.to === 'any') face = { score: O.life <= e.n ? 100 : e.n * per.faceBurn * (O.life <= 8 ? 1.2 : O.life <= 12 ? 0.6 : 0.12), target: { p: O.i } };
      if (b.target && b.score >= face.score) return b;
      if (face.score > 0) return face;
      if (trig) {
        const any = oppTargets(e.f);
        if (any.length) return best(any, (c) => cv(c) * 0.3);
        if (e.to === 'any') return { score: 0.1, target: { p: O.i } };
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
    case 'edict': {
      const cs = O.bf.filter((c) => isCreature(c) && edictOk(G, O, e.f, c));
      if (!cs.length) return trig ? { score: 0, target: null } : null;
      return { score: Math.min(...cs.map(cv)) + 0.3, target: null };
    }
    case 'fight': case 'bite': {
      let bestF = null;
      for (const m of ownTargets({})) for (const o of oppTargets({})) {
        const killsIt = !has(o, 'indestructible') && !protectedFrom(o, m) && pow(m) > 0 && (has(m, 'deathtouch') || pow(m) >= lethalTo(o));
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
    default: return null;
  }
}
function chooseTargets(G, P, effects, ctx, source) {
  const targets = [];
  let score = 0, lastT = null;
  for (const e of effects) {
    const r = evalEffect(G, P, e, ctx, source, lastT);
    if (!r) {
      if (needsTarget(e)) { if (e.may || ctx === 'trigger' || ctx === 'etb' || ctx === 'dies') { targets.push(null); continue; } return null; }
      if (ctx === 'trigger' || ctx === 'etb' || ctx === 'dies') { targets.push(null); continue; }
      return null;
    }
    if (e.may && r.score < 0) { targets.push('skip'); continue; }
    score += r.score;
    if (needsTarget(e)) { targets.push(r.target); if (r.target) lastT = r.target; }
    else targets.push(null);
  }
  return { score, targets };
}

/* ---------- Effects ---------- */
function damageCreature(G, c, n, src) {
  if (!onBf(G, c) || n <= 0) return 0;
  if (src && protectedFrom(c, src)) return 0;
  c.dmg += n;
  if (src && src.def && src.tkw && has(src, 'deathtouch')) c.dt = true;
  if (c.def.selfHurt) { const Q = ctrlOf(G, c); Q.life -= n; emit(G, 'hit', `${c.def.name} deals ${n} damage to ${Q.name}.`, { who: Q.i, card: c.id, target: `p${Q.i}`, amount: n }); }
  return n;
}
function damagePlayer(G, Q, n, srcCard, from) {
  if (n <= 0) return;
  Q.life -= n;
  if (from && from !== Q) from.stats.damage += n;
}
function gainLife(G, P, n) {
  if (n <= 0) return;
  P.life += n; P.stats.gained += n;
  for (const c of P.bf) if (c.def.onGain && c.def.onGain.length) { c.cnt += 1; emit(G, 'pump', `${c.def.name} gets a +1/+1 counter.`, { who: P.i, cards: [c.id] }); }
}
function makeToken(G, P, e) {
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
function resolveEffects(G, P, effects, source, targets, ctx) {
  if (!effects || !effects.length || G.over) return;
  let tg = targets;
  if (!tg) { const ch = chooseTargets(G, P, effects, ctx, source); tg = ch ? ch.targets : effects.map(() => null); }
  const O = other(G, P);
  const srcName = source ? source.def.name : 'It';
  const lifelinked = source && isCreature(source) && has(source, 'lifelink');
  if (ctx === 'spell') {
    const tk = effects.map((e, k) => (needsTarget(e) && tg[k] !== 'skip' ? k : -1)).filter((k) => k >= 0);
    if (tk.length && tk.every((k) => !stillLegal(G, P, effects[k], tg[k], source))) { emit(G, 'fizzle', `${srcName} has no legal target left and does nothing.`, { who: P.i }); return; }
  }
  let ref = null;
  for (let k = 0; k < effects.length && !G.over; k++) {
    const e = effects[k];
    const t = tg[k];
    if (t === 'skip') continue;
    if (needsTarget(e)) {
      if (!stillLegal(G, P, e, t, source)) { ref = null; continue; }
      if (t.c) ref = { c: t.c, ctrl: t.c.ctrl, power: pow(t.c), toughness: tou(t.c) };
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
      case 'destroy': if (!has(t.c, 'indestructible')) { P.stats.kills++; dieNow(G, [t.c], 'to ' + srcName); } break;
      case 'wrath': { const all = allCreatures(G).filter((c) => !has(c, 'indestructible')); P.stats.kills += all.filter((c) => c.ctrl !== P.i).length; dieNow(G, all); if (!all.length) emit(G, 'info', 'No creatures were destroyed.', { who: P.i }); break; }
      case 'exile': { const c = t.c, Q = ctrlOf(G, c); exileCard(G, c); P.stats.kills++; emit(G, 'exile', `${c.def.name} is exiled.`, { who: P.i, cards: [c.id] }); leaves(G, [{ c, P: Q }]); break; }
      case 'tuck': { const c = t.c, Q = ctrlOf(G, c); leaveBattlefield(G, c); resetCard(c); if (!c.token) G.players[c.owner].library.unshift(c); P.stats.kills++; emit(G, 'exile', `${c.def.name} goes to the bottom of ${G.players[c.owner].name}'s library.`, { who: P.i, cards: [c.id] }); leaves(G, [{ c, P: Q }]); break; }
      case 'bounce': { const c = t.c, Q = ctrlOf(G, c); leaveBattlefield(G, c); resetCard(c); if (!c.token) G.players[c.owner].hand.push(c); emit(G, 'bounce', `${c.def.name} returns to ${G.players[c.owner].name}'s hand.`, { who: P.i, cards: [c.id] }); leaves(G, [{ c, P: Q }]); break; }
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
      case 'edict': {
        const cs = O.bf.filter((c) => isCreature(c) && edictOk(G, O, e.f, c));
        if (cs.length) { const v = sacrificeChoice(G, O, cs); P.stats.kills++; emit(G, 'sac', `${O.name} sacrifices ${v.def.name}.`, { who: O.i, cards: [v.id] }); dieNow(G, [v]); }
        else emit(G, 'info', `${O.name} has nothing to sacrifice.`, { who: P.i });
        break;
      }
      case 'fog': G.fog = true; emit(G, 'fog', 'All combat damage this turn will be prevented.', { who: P.i }); break;
      case 'fight': case 'bite': {
        const m = t.c, o = t.c2, pm = Math.max(0, pow(m)), po = Math.max(0, pow(o));
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
      case 'tokens': { const made = makeToken(G, P, e); emit(G, 'token', `${P.name} creates ${made.length === 1 ? `a ${e.p}/${e.t} ${made[0].def.name} token` : `${made.length} ${e.p}/${e.t} ${made[0].def.name} tokens`}.`, { who: P.i, cards: made.map((c) => c.id) }); break; }
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
      default: break;
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
  }
}
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
  if (what === 'noncreature spell') return !d.types.includes('Creature');
  if (what === 'instant or sorcery spell') return d.types.includes('Instant') || d.types.includes('Sorcery');
  return true;
}
function threatOf(G, O, item) {
  const d = item.card.def;
  if (d.types.includes('Creature')) return d.value + d.mv * 0.4;
  let s = 0;
  d.spell.forEach((e, k) => {
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
// What a card costs to cast right now: a commander in the command zone pays {2} more for each earlier cast from there.
function castCost(P, card) {
  if (!P.command.includes(card)) return card.def.cost;
  return Object.assign({}, card.def.cost, { g: card.def.cost.g + CMD.tax * P.cmdCasts });
}
function castSpell(G, P, card, targets, etbTargets) {
  const fromCmd = P.command.includes(card);
  if (!pay(P, castCost(P, card))) return false;
  if (fromCmd) { P.command.splice(P.command.indexOf(card), 1); P.cmdCasts++; }
  else P.hand.splice(P.hand.indexOf(card), 1);
  const item = { card, P, targets: targets || [] };
  G.stack.push(item);
  P.stats.cast++;
  emit(G, 'cast', `${P.name} casts ${card.def.name}${fromCmd ? ' from the command zone' : ''}${targetText(G, item.targets)}.`, { who: P.i, card: card.id, targets: targetIds(item.targets) });
  if (!card.def.types.includes('Creature')) for (const x of P.bf) if (isCreature(x) && has(x, 'prowess')) { x.tp++; x.tt++; }
  const O = other(G, P);
  let cs = null;
  if (isHuman(G, O)) {
    const opts = O.hand.filter((c) => { const ce = c.def.spell && c.def.spell.find((e) => e.k === 'counter'); return ce && counterLegal(c, item) && canPay(O, c.def.cost); });
    if (opts.length) {
      const a = ask(G, { type: 'counter', spell: card.id, options: opts.map((c) => c.id) });
      cs = opts.find((c) => c.id === a.id) || null;
    }
  } else {
    // Mana Leak-style counters only get cast when the caster can't pay; the AI always pays when it can.
    const pick = O.hand.filter((c) => {
      const ce = c.def.spell && c.def.spell.find((e) => e.k === 'counter');
      return ce && counterLegal(c, item) && canPay(O, c.def.cost) && (!ce.unless || !canPay(P, genericCost(ce.unless)));
    }).sort((a, b) => a.def.mv - b.def.mv)[0];
    if (pick && threatOf(G, O, item) >= PERSONAS[O.persona].counterBar && G.rng.next() < 0.9) cs = pick;
  }
  const paidOff = cs && cs.def.spell.find((e) => e.k === 'counter').unless && canPay(P, genericCost(cs.def.spell.find((e) => e.k === 'counter').unless));
  if (cs && paidOff) {
    const u = cs.def.spell.find((e) => e.k === 'counter').unless;
    pay(O, cs.def.cost);
    O.hand.splice(O.hand.indexOf(cs), 1);
    O.stats.cast++;
    emit(G, 'cast', `${O.name} casts ${cs.def.name}, targeting ${card.def.name}.`, { who: O.i, card: cs.id, targets: [card.id] });
    O.gy.push(cs);
    pay(P, genericCost(u));
    emit(G, 'info', `${P.name} pays ${u}, so ${card.def.name} resolves.`, { who: P.i });
    cs = null;
  }
  if (cs) {
    pay(O, cs.def.cost);
    O.hand.splice(O.hand.indexOf(cs), 1);
    O.stats.cast++;
    G.stack.push({ card: cs, P: O, targets: [] });
    emit(G, 'cast', `${O.name} casts ${cs.def.name}, targeting ${card.def.name}.`, { who: O.i, card: cs.id, targets: [card.id] });
    G.stack.pop();
    G.stack.pop();
    O.gy.push(cs);
    P.gy.push(card);
    const unless = cs.def.spell.find((e) => e.k === 'counter').unless;
    emit(G, 'countered', `${unless ? `${P.name} can't pay ${unless}. ` : ''}${card.def.name} is countered.`, { who: O.i, cards: [card.id] });
    const rest = cs.def.spell.filter((e) => e.k !== 'counter');
    if (rest.length) { G.resolving = cs.id; resolveEffects(G, O, rest, cs, null, 'trigger'); G.resolving = 0; }
    cmdHome(G);
    return true;
  }
  G.stack.pop();
  if (card.def.types.includes('Creature')) enterBattlefield(G, P, card, etbTargets);
  else {
    P.gy.push(card);
    G.resolving = card.id;
    resolveEffects(G, P, card.def.spell, card, item.targets, 'spell');
    G.resolving = 0;
  }
  sba(G);
  return true;
}
function enterBattlefield(G, P, card, etbTargets) {
  resetCard(card);
  card.ctrl = P.i;
  card.tapped = !!card.def.etbTapped;
  P.bf.push(card);
  emit(G, 'enter', `${card.def.name} enters the battlefield.`, { who: P.i, card: card.id });
  sba(G);
  if (card.def.etb.length && !G.over) {
    // A human picks enter-the-battlefield targets while casting; anything missing or no longer legal is chosen now.
    let tg = null;
    if (etbTargets && etbTargets.some((t) => t)) {
      const auto = chooseTargets(G, P, card.def.etb, 'etb', card);
      tg = card.def.etb.map((e, k) => (etbTargets[k] === 'skip' ? 'skip' : etbTargets[k] && stillLegal(G, P, e, etbTargets[k], card) ? etbTargets[k] : auto ? auto.targets[k] : null));
    }
    resolveEffects(G, P, card.def.etb, card, tg, 'etb');
  }
}
function playLand(G, P, c) {
  P.hand.splice(P.hand.indexOf(c), 1);
  resetCard(c);
  c.sick = false;
  P.bf.push(c);
  P.landsPlayed++;
  P.stats.landsPlayed++;
  let tapped = c.def.etbTapped;
  if (c.def.checkland) tapped = !P.bf.some((x) => x !== c && x.def.sub.some((s) => c.def.checkland.includes(s)));
  c.tapped = !!tapped;
  emit(G, 'land', `${P.name} plays ${c.def.name}${tapped ? ', which enters tapped' : ''}.`, { who: P.i, card: c.id });
  if (c.def.etb.length) resolveEffects(G, P, c.def.etb, c, null, 'etb');
  for (const x of P.bf.slice()) if (isCreature(x) && x.def.landfall && x.def.landfall.length && !G.over) resolveEffects(G, P, x.def.landfall, x, null, 'trigger');
}

/* ---------- AI: main phase ---------- */
function chooseLand(G, P) {
  const lands = P.hand.filter(isLand);
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
    if (s > bestScore) { bestScore = s; best = c; }
  }
  return best;
}
function hasHeldTricks(P) {
  return P.hand.some((c) => c.def.spell && isInstantSpeed(c.def) && c.def.spell.some((e) => ['pump', 'pumpTeam', 'counter'].includes(e.k)));
}
function evalCast(G, P, card, ctx) {
  const def = card.def;
  const per = PERSONAS[P.persona];
  if (isLand(card) || !canPay(P, castCost(P, card))) return null;
  if (def.types.includes('Creature')) {
    if (def.sacAtEnd && ctx !== 'main1') return null;
    let s = 2 + def.value * 0.6 + def.mv * 0.35;
    const ch = def.etb.length ? chooseTargets(G, P, def.etb, 'etb', card) : { score: 0, targets: [] };
    if (ch) s += Math.max(-4, ch.score * 0.5);
    if (ctx === 'main1' && !def.kw.includes('haste') && hasHeldTricks(P) && P.persona !== 'aggro') s -= 1;
    if (def.kw.includes('flash') && ctx !== 'end' && per.hold >= 0.6) s -= 1.5;
    if (def.supertypes.includes('Legendary') && P.bf.some((c) => c.def.name === def.name)) return null;
    if (P.command.includes(card)) s -= CMD.tax * P.cmdCasts * 0.3; // the tax makes a recast worse value than a fresh card
    return { score: s, targets: [] };
  }
  const ch = chooseTargets(G, P, def.spell, ctx, card);
  if (!ch || ch.score <= 0.2) return null;
  let s = ch.score;
  if (isInstantSpeed(def) && (ctx === 'main1' || ctx === 'main2') && s < 60) {
    s -= per.hold * 2.2;
    if (per.hold >= 0.6 && s < 4) return null; // control saves instants for the opponent's turn
  }
  if (def.spell.some((e) => e.k === 'draw' || e.k === 'loot') && isInstantSpeed(def) && ctx !== 'end') s -= 1.5;
  return s > 0.3 ? { score: s + def.mv * 0.1, targets: ch.targets } : null;
}
function cheapestCounter(P) {
  return P.hand.filter((c) => c.def.spell && c.def.spell.some((e) => e.k === 'counter')).sort((a, b) => a.def.mv - b.def.mv)[0];
}
function aiMain(G, P, which) {
  const ctx = which === 1 ? 'main1' : 'main2';
  G.phase = ctx;
  if (P.landsPlayed === 0) { const land = chooseLand(G, P); if (land) playLand(G, P, land); }
  for (let guard = 0; guard < 14 && !G.over; guard++) {
    let best = null;
    for (const c of P.hand.concat(P.command)) {
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
    if (!best) break;
    castSpell(G, P, best.c, best.targets);
  }
}

/* ---------- AI: combat ---------- */
function canBlock(G, b, a) {
  if (!isCreature(b) || b.tapped || b.def.cantBlock || b.noBlock) return false;
  if (a.def.unblockable) return false;
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
  return has(a, 'menace') && bs.length < 2 ? [] : bs;
}
function unblockedDamage(G, attackers, D) {
  const free = D.bf.filter((b) => isCreature(b) && !b.tapped && !b.def.cantBlock);
  const used = new Set();
  let total = 0;
  for (const a of attackers.slice().sort((x, y) => dmgOut(y) - dmgOut(x))) {
    const need = has(a, 'menace') ? 2 : 1;
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
  const cands = A.bf.filter((c) => isCreature(c) && !c.tapped && (!c.sick || has(c, 'haste')) && !has(c, 'defender') && (pow(c) > 0 || c.def.mustAttack));
  if (!cands.length) return [];
  const reachable = cands.filter((c) => pow(c) > 0);
  const burnInHand = A.hand.filter((c) => c.def.spell && c.def.spell.some((e) => e.k === 'dmg' && e.to !== 'creature') && canPay(A, c.def.cost))
    .reduce((s, c) => s + c.def.spell.filter((e) => e.k === 'dmg').reduce((x, e) => x + e.n, 0), 0);
  if (unblockedDamage(G, reachable, D) + burnInHand >= D.life) return cands;
  if (G.format === 'commander' && reachable.some((c) => c.cmdr && !blockersFor(G, D, c).length && dmgOut(c) >= CMD.lethal - (D.cmdDmg[c.id] || 0))) return cands;
  const chosen = [];
  for (const c of cands) {
    if (c.def.mustAttack || c.def.sacAtEnd) { chosen.push(c); continue; }
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
    while (crack - prevented() >= A.life && chosen.some((c) => !has(c, 'vigilance') && !c.def.mustAttack) && guard++ < 10) {
      const keep = chosen.filter((c) => !has(c, 'vigilance') && !c.def.mustAttack).sort((x, y) => tou(y) - tou(x))[0];
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
    const needTwo = has(a, 'menace');
    if (!cands.length || (needTwo && cands.length < 2)) continue;
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
    if (!pick && cands.length >= 2 && (needTwo || cv(a) >= 4.5)) pick = bestDoubleBlock(G, a, cands);
    const cmdLethal = G.format === 'commander' && a.cmdr && dmgOut(a) >= CMD.lethal - (D.cmdDmg[a.id] || 0);
    if (!pick && !needTwo && (incoming >= D.life || cmdLethal || (incoming >= D.life - 3 && G.rng.next() < per.chump))) {
      const chumps = scored.slice().sort((x, y) => cv(x.b) - cv(y.b));
      if (chumps.length && !has(a, 'trample')) pick = [chumps[0].b];
    }
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
    if (strikes(a) && pow(a) > 0) {
      if (!a.blocked) events.push({ src: a, to: D, n: pow(a) });
      else if (!blockers.length) { if (has(a, 'trample')) events.push({ src: a, to: D, n: pow(a) }); }
      else {
        let left = pow(a);
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
    for (const b of blockers) if (strikes(b) && pow(b) > 0) events.push({ src: b, toC: a, n: pow(b) });
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
  for (const ev of events) {
    const P = ctrlOf(G, ev.src);
    let dealt = ev.n;
    if (ev.toC) dealt = damageCreature(G, ev.toC, ev.n, ev.src);
    else {
      damagePlayer(G, ev.to, ev.n, ev.src, P); hitPlayer.set(ev.src, (hitPlayer.get(ev.src) || 0) + ev.n);
      if (ev.src.cmdr) ev.to.cmdDmg[ev.src.id] = (ev.to.cmdDmg[ev.src.id] || 0) + ev.n;
    }
    if (dealt && has(ev.src, 'lifelink')) gainLife(G, P, dealt);
  }
  const toPlayer = events.filter((e) => e.to);
  if (toPlayer.length) {
    const total = toPlayer.reduce((x, e) => x + e.n, 0);
    lines.push(`${D.name} takes ${total} from ${nameList([...new Set(toPlayer.map((e) => e.src))])}`);
  }
  for (const e of events.filter((x) => x.toC)) lines.push(`${e.src.def.name} deals ${e.n} to ${e.toC.def.name}`);
  emit(G, 'damage', `${step === 'first' ? 'First strike. ' : ''}${lines.join('. ')}.`, { who: A.i, cards: events.map((e) => e.src.id), hits: events.map((e) => ({ src: e.src.id, to: e.toC ? e.toC.id : `p${e.to.i}`, n: e.n })) });
  for (const [src] of hitPlayer) if (src.def.hit.length && onBf(G, src)) resolveEffects(G, ctrlOf(G, src), src.def.hit, src, null, 'trigger');
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
function trickValue(G, P, D, attackers, spell, idx, tgt) {
  const gone = new Set(), pre = new Map(), undo = [];
  const pumpOn = (c, e) => { c.tp += e.p; c.tt += e.t; const add = e.kw.filter((k) => !has(c, k)); c.tkw.push(...add); undo.push(() => { c.tp -= e.p; c.tt -= e.t; c.tkw.splice(c.tkw.length - add.length, add.length); }); };
  spell.forEach((e, k) => {
    const t = k === idx ? tgt : null;
    if (e.k === 'pump' && t) pumpOn(t, e);
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
    for (const card of P.hand) {
      const d = card.def;
      if (!d.spell || !isInstantSpeed(d) || d.types.includes('Creature') || !canPay(P, d.cost)) continue;
      if (d.spell.some((e) => e.k === 'counter' || e.k === 'wrath' || e.k === 'dmgAll')) continue;
      if (d.spell.some((e) => e.k === 'fog')) {
        // Fog: only the defender, only when it saves a lot
        if (P !== D || G.fog) continue;
        const delta = combatValue(G, P, D, live, new Set(), null, true) - base;
        if (delta > 2.5 && (!best || delta > best.score)) best = { card, idx: -1, tgt: null, score: delta };
        continue;
      }
      const idx = d.spell.findIndex((e) => needsTarget(e) && ['pump', 'destroy', 'exile', 'bounce', 'dmg', 'tuck'].includes(e.k));
      const special = d.spell.some((e) => e.k === 'pumpTeam' || e.k === 'edict');
      if (idx < 0 && !special) continue;
      const cands = idx < 0 ? [null] : allCreatures(G).filter((c) => (c.attacking || c.blocking) && targetOk(G, P, d.spell[idx].f || {}, c, card));
      for (const tgt of cands) {
        const delta = trickValue(G, P, D, live, d.spell, idx, tgt) - base;
        const bar = ['destroy', 'exile', 'dmg', 'tuck'].includes(idx >= 0 ? d.spell[idx].k : '') || d.spell.some((e) => e.k === 'edict') ? 3 : 1.4;
        if (delta > bar && (!best || delta - d.mv * 0.1 > best.score)) best = { card, idx, tgt, score: delta - d.mv * 0.1 };
      }
    }
    if (!best) break;
    const ch = chooseTargets(G, P, best.card.def.spell, 'combat', best.card);
    const targets = best.card.def.spell.map((e, k) => (k === best.idx ? { c: best.tgt } : needsTarget(e) ? (ch ? ch.targets[k] : null) : null));
    if (targets.some((t, k) => needsTarget(best.card.def.spell[k]) && !t)) break;
    castSpell(G, P, best.card, targets);
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
  const attackers = isHuman(G, A) ? humanAttackers(G, A) : aiAttackers(G, A, D);
  if (!attackers.length) return;
  for (const c of attackers) { c.attacking = true; if (!has(c, 'vigilance')) c.tapped = true; }
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
  if (isHuman(G, D)) humanWindow(G, D, 'attackers'); else aiInstantWindow(G, D, 'attackers');
  if (G.over) return;
  const live = attackers.filter((c) => onBf(G, c) && c.attacking);
  if (live.length) {
    const blocks = isHuman(G, D) ? humanBlocks(G, D, A, live) : aiBlocks(G, D, A, live);
    for (const [aid, bs] of blocks) { const a = live.find((x) => x.id === aid); a.blocked = true; a.blockedBy = bs.slice(); bs.forEach((b) => { b.blocking = aid; }); }
    if (blocks.size) {
      const parts = [...blocks].map(([aid, bs]) => `${live.find((x) => x.id === aid).def.name} with ${nameList(bs)}`);
      emit(G, 'block', `${D.name} blocks ${parts.join('; ')}.`, { who: D.i, cards: [...blocks.values()].flat().map((c) => c.id) });
    } else emit(G, 'noblock', `${D.name} doesn't block.`, { who: D.i });
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
    if (!G.over) aiCombatSacs(G, live);
    if (!G.over && G.fog) emit(G, 'fog', 'All combat damage is prevented.', { who: D.i });
    else if (!G.over) {
      const firstStep = hasFirstStep(G, live);
      if (firstStep) { combatDamage(G, A, D, live, 'first'); sba(G); }
      if (!G.over) { combatDamage(G, A, D, live, firstStep ? 'regular' : 'all'); sba(G); }
    }
  }
  for (const P of G.players) for (const c of P.bf) { c.attacking = false; c.blocked = false; c.blocking = 0; c.blockedBy = []; }
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
    const dead = isLand(c) ? lands + P.hand.filter(isLand).length >= 7 : c.def.mv > lands + 3;
    if (!dead) continue;
    pay(P, c.def.cycling);
    P.hand.splice(P.hand.indexOf(c), 1);
    P.gy.push(c);
    drawCards(G, P, 1);
    emit(G, 'cycle', `${P.name} cycles ${c.def.name}.`, { who: P.i, card: c.id });
  }
}
function aiInstantWindow(G, P, when) {
  if (when === 'end') { aiCycle(G, P); aiUtility(G, P); }
  for (let guard = 0; guard < 4 && !G.over; guard++) {
    let best = null;
    for (const card of P.hand.concat(P.command)) {
      const d = card.def;
      if (!isInstantSpeed(d) || !canPay(P, castCost(P, card))) continue;
      if (d.spell && d.spell.some((e) => e.k === 'counter')) continue;
      let r = null;
      if (d.types.includes('Creature')) {
        if (when === 'end') r = { score: 2 + d.value * 0.6, targets: [] };
        else if (when === 'attackers') {
          const atk = allCreatures(G).filter((c) => c.attacking);
          const canEat = atk.some((a) => { const x = { def: d, cnt: 0, tp: 0, tt: 0, tkw: [], dmg: 0 }; return canBlock(G, Object.assign({ tapped: false, ctrl: P.i }, x), a) && kills(x, a) && !kills(a, x); });
          if (canEat) r = { score: 3 + d.value * 0.5, targets: [] };
        }
      } else {
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
    castSpell(G, P, best.card, best.targets);
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
const costText = (c) => `${c.g ? `{${c.g}}` : ''}${COLORS.map((k) => `{${k}}`.repeat(c[k])).join('')}` || '{0}';
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
  if (t.p != null) r.p = t.p;
  return r;
}
function fromRef(G, r) {
  if (r === 'skip') return 'skip';
  if (!r) return null;
  const find = (id) => allCreatures(G).find((c) => c.id === id);
  const t = {};
  if (r.c != null) { t.c = find(r.c); if (!t.c) return null; }
  if (r.c2 != null) { t.c2 = find(r.c2); if (!t.c2) return null; }
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
    default: return 'Choose a target';
  }
}
function targetSpec(G, P, e, k, source) {
  const creatures = (f) => allCreatures(G).filter((c) => targetOk(G, P, f || {}, c, source)).map((c) => c.id);
  if (e.k === 'fight' || e.k === 'bite') {
    const mine = creatures({ side: 'you' }), theirs = creatures({ side: 'opp' });
    return mine.length && theirs.length ? { k, pair: true, mine, theirs, label: specLabel(e) } : null;
  }
  const cands = creatures(e.f);
  if (e.k === 'dmg' && e.to === 'any') cands.push(...G.players.filter((Q) => !Q.lost).map((Q) => `p${Q.i}`));
  return cands.length ? { k, cands, may: !!e.may, label: specLabel(e) } : null;
}
const attackCandidates = (G, P) => P.bf.filter((c) => isCreature(c) && !c.tapped && (!c.sick || has(c, 'haste')) && !has(c, 'defender'));
// Everything a human could do right now, with the legal targets for each choice.
function humanActions(G, P, when) {
  const acts = [];
  const sorcery = G.active === P.i && (when === 'main1' || when === 'main2') && !G.stack.length;
  if (sorcery && P.landsPlayed === 0) for (const c of P.hand) if (isLand(c)) acts.push({ act: `land:${c.id}`, kind: 'land', card: c.id, label: 'Play this land' });
  for (const c of P.hand.concat(P.command)) {
    const d = c.def;
    if (isLand(c) || (!sorcery && !isInstantSpeed(d))) continue;
    if (d.spell && d.spell.some((e) => e.k === 'counter')) continue; // counterspells are offered when a spell is cast
    if (!canPay(P, castCost(P, c))) continue;
    const cre = d.types.includes('Creature');
    const specs = [];
    let ok = true;
    (cre ? d.etb : d.spell).forEach((e, k) => {
      if (!needsTarget(e) || e.k === 'divided') return; // split damage is planned automatically
      const sp = targetSpec(G, P, e, k, c);
      if (sp) specs.push(sp);
      else if (!cre && !e.may) ok = false;
    });
    const fromCmd = P.command.includes(c);
    if (ok) acts.push(Object.assign({ act: `cast:${c.id}`, kind: 'cast', card: c.id, label: `Cast ${d.name}${fromCmd ? ' from the command zone' : ''}`, specs, etb: cre },
      fromCmd ? { cmd: true, cost: costText(castCost(P, c)), tax: CMD.tax * P.cmdCasts } : null));
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
  for (const c of P.hand) if (c.def.cycling && canPay(P, c.def.cycling) && P.library.length) acts.push({ act: `cycle:${c.id}`, kind: 'cycle', card: c.id, label: `Cycle for ${costText(c.def.cycling)}` });
  return acts;
}
function applyAction(G, P, a) {
  const [kind, idStr] = String(a.act).split(':');
  const id = +idStr;
  const inHand = P.hand.find((c) => c.id === id);
  const toCast = inHand || P.command.find((c) => c.id === id);
  const mine = P.bf.find((c) => c.id === id);
  const t0 = (a.t || []).map((r) => fromRef(G, r));
  switch (kind) {
    case 'land': if (inHand) playLand(G, P, inHand); break;
    case 'cast':
      if (!toCast) break;
      if (toCast.def.types.includes('Creature')) castSpell(G, P, toCast, [], toCast.def.etb.map((e, k) => fromRef(G, (a.etb || [])[k])));
      else castSpell(G, P, toCast, toCast.def.spell.map((e, k) => (e.k === 'divided' ? { plan: dividePlan(G, P, e, toCast).plan } : t0[k] || null)));
      break;
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
      if (!inHand || !pay(P, inHand.def.cycling)) break;
      P.hand.splice(P.hand.indexOf(inHand), 1);
      P.gy.push(inHand);
      drawCards(G, P, 1);
      emit(G, 'cycle', `${P.name} cycles ${inHand.def.name}.`, { who: P.i, card: inHand.id });
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
    const canAttack = ctx === 'main1' && attackCandidates(G, P).length > 0;
    if (!acts.length) return canAttack ? 'combat' : 'end';
    const a = ask(G, { type: 'act', when: ctx, actions: acts, canAttack });
    if (a.pass) return a.pass === 'combat' && canAttack ? 'combat' : 'end';
    if (!acts.some((x) => x.act === a.act)) return 'end';
    applyAction(G, P, a);
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
  const blockers = D.bf.filter((b) => isCreature(b) && !b.tapped && !b.def.cantBlock && !b.noBlock);
  const opts = attackers.map((a) => ({ id: a.id, menace: has(a, 'menace'), by: blockers.filter((b) => canBlock(G, b, a)).map((b) => b.id) })).filter((o) => o.by.length);
  const map = new Map();
  if (!opts.length) return map;
  const ans = ask(G, { type: 'block', attackers: opts });
  const used = new Set();
  for (const [aid, bids] of ans.blocks || []) {
    const a = attackers.find((x) => x.id === aid);
    if (!a || map.has(aid)) continue;
    const bs = (bids || []).map((id) => blockers.find((b) => b.id === id)).filter((b, k, arr) => b && arr.indexOf(b) === k && !used.has(b) && canBlock(G, b, a));
    if (!bs.length || (has(a, 'menace') && bs.length < 2)) continue;
    map.set(aid, bs);
    bs.forEach((b) => used.add(b));
  }
  return map;
}
function runInteractive({ decks, seed, human = 0, answers = [], setup = null }) {
  const G = createGame({ decks, seed, record: true, human, answers, setup });
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
  for (const c of P.bf) { if (c.stun) c.stun = false; else c.tapped = false; c.sick = false; }
  P.landsPlayed = 0;
  emit(G, 'turn', `Turn ${G.turn}: ${P.name}.`, { who: P.i });
  if (!(G.turn === 1)) { drawCards(G, P, 1); sba(G); if (G.over) return; }
  if (isHuman(G, P)) {
    const next = humanMain(G, P, 1); if (G.over) return;
    if (next === 'combat') { combat(G); if (G.over) return; humanMain(G, P, 2); if (G.over) return; }
  } else {
    aiMain(G, P, 1); if (G.over) return;
    combat(G); if (G.over) return;
    aiMain(G, P, 2); if (G.over) return;
  }
  G.phase = 'end';
  const oneTurn = allCreatures(G).filter((c) => c.def.sacAtEnd);
  if (oneTurn.length) { emit(G, 'sac', `${nameList(oneTurn)} ${oneTurn.length > 1 ? 'are' : 'is'} sacrificed at the end step.`, { who: P.i, cards: oneTurn.map((c) => c.id) }); dieNow(G, oneTurn); sba(G); if (G.over) return; }
  if (isHuman(G, other(G, P))) humanWindow(G, other(G, P), 'end'); else aiInstantWindow(G, other(G, P), 'end');
  if (G.over) return;
  if (P.hand.length > 7) { const n = P.hand.length - 7; discardChoice(G, P, n, 'hand'); emit(G, 'discard', `${P.name} discards ${n === 1 ? 'a card' : `${n} cards`} to hand size.`, { who: P.i }); cmdHome(G); }
  for (const Q of G.players) for (const c of Q.bf) { c.dmg = 0; c.dt = false; c.tp = 0; c.tt = 0; c.tkw = []; c.pumps = 0; c.noBlock = false; c.exileDead = false; }
  G.fog = false;
  G.active = 1 - G.active;
}
function playGame(G) {
  if (G.setup) emit(G, 'start', G.setup.text || `${G.players[0].name} vs ${G.players[1].name}.`, { who: G.first });
  else {
    for (const P of G.players) openingHand(G, P);
    emit(G, 'start', `${G.players[0].name} vs ${G.players[1].name}. ${G.players[G.first].name} goes first.`, { who: G.first });
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
function buildDeck(pool, { colors, archetype = 'midrange', seed, name }) {
  const rng = makeRng(seed == null ? Date.now() : seed);
  const cfg = ARCH[archetype] || ARCH.midrange;
  const colorOk = (d) => d.colors.every((c) => colors.includes(c));
  const usesAll = (d) => colors.length > 1 && colors.every((c) => d.colors.includes(c));
  const nonland = pool.filter((d) => !d.types.includes('Land') && colorOk(d) && d.mv <= 7);
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
    if (!creature && archetype === 'aggro' && d.spell.some((e) => e.k === 'dmg' && e.to !== 'creature')) s += 1.2;
    return s + rng.next() * 2.6;
  };
  const picks = new Map();
  const total = () => [...picks.values()].reduce((s, n) => s + n, 0);
  const addCopies = (d, want) => {
    const cap = RESTRICTED.has(d.name) ? 1 : d.supertypes.includes('Legendary') ? 2 : 4;
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
    const extra = nonland.filter((d) => (picks.get(d) || 0) < (RESTRICTED.has(d.name) ? 1 : d.supertypes.includes('Legendary') ? 2 : 4) && (d.types.includes('Creature') ? d.mv <= (archetype === 'aggro' ? 3 : 5) : ['removal', 'draw', 'tokens'].includes(d.role)));
    if (!extra.length) break;
    fill(extra, Math.min(4, spellsTotal - total()));
  }
  while (total() > spellsTotal) { const [d, n] = [...picks].sort((a, b) => score(a[0]) - score(b[0]))[0]; if (n > 1) picks.set(d, n - 1); else picks.delete(d); }
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
  const basicsLeft = cfg.lands - [...lands.values()].reduce((s, n) => s + n, 0);
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
    if (!creature && d.spell.some((e) => e.k === 'draw' || e.k === 'brainstorm')) s += archetype === 'aggro' ? 0 : 0.8;
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
  const basicsLeft = cfg.lands - lands.size;
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
  _internal: { cv, fight, kills, canBlock, planPayment, manaSources, evalEffect, chooseTargets, aiAttackers, aiBlocks, sba, snap, newCard, castSpell, resolveEffects, combat, takeTurn, enterBattlefield, forecast, protectedFrom, targetOk, pow, tou },
};
});
