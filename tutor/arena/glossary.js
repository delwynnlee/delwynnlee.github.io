/* Plain-English meanings of Magic keywords and game terms, for the Arena and the Tutor card browser.
   Each term has: id, k (its name), re (how it shows up in rules text), d (what it means) and, for the common
   keywords, s (a one-line version for tight spots). `more` marks basic game words: they're explained on request
   rather than listed under every card. */
(function (root) {
  const T = [
    // Keywords
    { id: 'flying', k: 'Flying', re: /\bflying\b/i, d: "Can't be blocked except by creatures with flying or reach.", s: 'Only creatures with flying or reach can block it.' },
    { id: 'reach', k: 'Reach', re: /\breach\b/i, d: 'Can block creatures with flying.', s: 'Can block creatures with flying.' },
    { id: 'trample', k: 'Trample', re: /\btrample\b/i, d: "When it's blocked, any damage beyond what it takes to destroy its blockers is dealt to the player instead.", s: 'Damage beyond what kills its blockers hits the player.' },
    { id: 'haste', k: 'Haste', re: /\bhaste\b/i, d: 'Can attack, and use abilities with {T} in the cost, the turn it comes into play.', s: 'Can attack the turn it comes into play.' },
    { id: 'vigilance', k: 'Vigilance', re: /\bvigilance\b/i, d: "Attacking doesn't tap it, so it's still free to block on the next turn.", s: "Attacking doesn't tap it." },
    { id: 'deathtouch', k: 'Deathtouch', re: /\bdeathtouch\b/i, d: 'Any amount of damage it deals to a creature is enough to destroy that creature.', s: 'Any damage it deals destroys a creature.' },
    { id: 'lifelink', k: 'Lifelink', re: /\blifelink\b/i, d: 'Damage it deals also gains its controller that much life.', s: 'Its damage also gains its controller life.' },
    { id: 'first strike', k: 'First strike', re: /\bfirst strike\b/i, d: "Deals its combat damage before creatures without first strike, so it can destroy them before they hit back.", s: 'Deals combat damage before other creatures.' },
    { id: 'double strike', k: 'Double strike', re: /\bdouble strike\b/i, d: 'Deals combat damage twice: once along with first strikers, then again with everything else.', s: 'Deals combat damage twice.' },
    { id: 'menace', k: 'Menace', re: /\bmenace\b/i, d: "Can't be blocked except by two or more creatures.", s: 'Needs two or more creatures to block it.' },
    { id: 'defender', k: 'Defender', re: /\bdefender\b/i, d: "Can't attack. It can still block.", s: "Can't attack." },
    { id: 'indestructible', k: 'Indestructible', re: /\bindestructible\b/i, d: "Damage and “destroy” effects don't put it in the graveyard. It can still be exiled, sacrificed, or shrunk to 0 toughness.", s: "Damage and destroy effects don't kill it." },
    { id: 'hexproof', k: 'Hexproof', re: /\bhexproof\b/i, d: "Its controller's opponents can't target it with spells or abilities.", s: "Opponents can't target it." },
    { id: 'shroud', k: 'Shroud', re: /\bshroud\b/i, d: "No spells or abilities can target it, not even its controller's.", s: 'Nothing can target it.' },
    { id: 'flash', k: 'Flash', re: /\bflash\b/i, d: "Can be cast any time you could cast an instant, even during your opponent's turn or in combat.", s: 'Can be cast at instant speed, on any turn.' },
    { id: 'prowess', k: 'Prowess', re: /\bprowess\b/i, d: 'Whenever its controller casts a noncreature spell, it gets +1/+1 until end of turn.', s: 'Gets +1/+1 when its controller casts a noncreature spell.' },
    { id: 'ward', k: 'Ward', re: /\bward\b/i, d: 'Whenever it becomes the target of a spell or ability an opponent controls, that spell or ability is countered unless they pay the ward cost.', s: 'Targeting it costs opponents extra.' },
    { id: 'protection', k: 'Protection', re: /\bprotection from\b/i, d: "Protection from a quality (a color, say) means it can't be blocked, targeted, dealt damage, enchanted or equipped by anything with that quality." },
    { id: 'equip', k: 'Equip', re: /\bequip\b/i, d: 'Pay the equip cost to attach this Equipment to a creature you control, any time you could cast a sorcery. If the creature leaves, the Equipment stays.' },
    { id: 'enchant', k: 'Enchant', re: /\bEnchant\b/, d: "This Aura is cast targeting what it enchants and stays attached to it. If that goes away, the Aura goes to the graveyard." },
    { id: 'crew', k: 'Crew', re: /\bcrew(?:s|ed)?\b/i, d: 'Tap any of your untapped creatures with total power equal to the crew number or more: this Vehicle becomes an artifact creature until end of turn.' },
    { id: 'cycling', k: 'Cycling', re: /\bcycl(?:ing|e|ed)\b/i, d: 'Pay the cycling cost and discard this card from your hand to draw a card.' },
    { id: 'landcycling', k: 'Landcycling', re: /\b(?:basic )?[a-z]+cycling\b/i, d: 'Pay the cost and discard this card from your hand to search your library for a land of that type, put it into your hand, then shuffle.' },
    { id: 'flashback', k: 'Flashback', re: /\bflashback\b/i, d: 'You can cast this card from your graveyard by paying its flashback cost. Then it’s exiled.' },
    { id: 'kicker', k: 'Kicker', re: /\bkick(?:er|ed)\b/i, d: 'An optional extra cost you can pay as you cast it, for a stronger effect.' },
    { id: 'scry', k: 'Scry', re: /\bscry\b/i, d: 'Look at that many cards from the top of your library. Put any of them on the bottom and the rest back on top in any order.' },
    { id: 'surveil', k: 'Surveil', re: /\bsurveil\b/i, d: 'Look at that many cards from the top of your library. Put any of them into your graveyard and the rest back on top in any order.' },
    { id: 'mill', k: 'Mill', re: /\bmill(?:s|ed)?\b/i, d: 'Put that many cards from the top of a library into its owner’s graveyard.' },
    { id: 'fight', k: 'Fight', re: /\bfights?\b/i, d: 'Each of the two creatures deals damage equal to its power to the other.' },
    { id: 'food', k: 'Food', re: /\bFood\b/, d: 'An artifact token. {2}, {T}, sacrifice it: gain 3 life.' },
    { id: 'treasure', k: 'Treasure', re: /\bTreasures?\b/, d: 'An artifact token. {T}, sacrifice it: add one mana of any color.' },
    { id: 'clue', k: 'Clue', re: /\bClues?\b/, d: 'An artifact token. {2}, sacrifice it: draw a card.' },
    { id: 'amass', k: 'Amass', re: /\bamass(?:es)?\b/i, d: 'Put that many +1/+1 counters on an Army you control. If you don’t have one, first create a 0/0 black Army creature token of the named type, such as an Orc Army.' },
    { id: 'ring', k: 'The Ring tempts you', re: /\bthe Ring tempts you\b/i, d: 'Choose a creature you control as your Ring-bearer. Each time the Ring tempts you, your Ring-bearer gains the next of four abilities: it becomes legendary and can’t be blocked by creatures with greater power; it loots when it attacks; blockers are sacrificed after combat; and its combat damage makes each opponent lose 3 life.' },
    { id: 'ring-bearer', k: 'Ring-bearer', re: /\bRing-bearer\b/i, d: 'The creature you chose when the Ring last tempted you. It gets more abilities the more times the Ring has tempted you.' },
    { id: 'landfall', k: 'Landfall', re: /\bLandfall\b/, d: 'Happens each time a land comes into play under your control.' },
    { id: 'power-up', k: 'Power-up', re: /\bPower-up\b/i, d: 'You can use each power-up ability only once. If the creature came into play this turn, the cost goes down by its mana cost.' },
    { id: 'job select', k: 'Job select', re: /\bJob select\b/i, d: 'When this Equipment comes into play, create a 1/1 Hero creature token and attach the Equipment to it.' },
    { id: 'tiered', k: 'Tiered', re: /\bTiered\b/, d: 'As you cast it, choose one of its tiers and pay that tier’s extra cost.' },
    { id: 'jump', k: 'Jump', re: /\bJump\b(?= —)/, d: 'During your turn, it has flying.' },
    { id: 'sneak', k: 'Sneak', re: /\bSneak\b/, d: 'You can cast it for its sneak cost during combat by returning an unblocked attacker of yours to your hand. It comes into play tapped and attacking.' },
    { id: 'improvise', k: 'Improvise', re: /\bImprovise\b/i, d: 'Your artifacts can help pay for it: each artifact you tap pays for {1}.' },
    { id: 'convoke', k: 'Convoke', re: /\bConvoke\b/i, d: 'Your creatures can help pay for it: each creature you tap pays for {1} or one mana of its color.' },
    { id: 'affinity', k: 'Affinity', re: /\bAffinity for\b/i, d: 'It costs {1} less to cast for each of the named things you control.' },
    { id: 'connive', k: 'Connive', re: /\bconniv(?:e|es|ed)\b/i, d: 'Draw a card, then discard a card. If you discarded a nonland card, put a +1/+1 counter on this creature.' },
    { id: 'landwalk', k: 'Landwalk', re: /\b(?:plains|island|swamp|mountain|forest)walk\b/i, d: 'Can’t be blocked as long as the defending player controls a land of that type.' },
    { id: 'saga', k: 'Saga', re: /\b(?:Saga|lore counters?)\b/, d: 'An enchantment told in chapters. It gets a lore counter as it comes into play and after your draw step; each chapter happens when the count reaches its number, and the Saga is sacrificed after the last one.' },
    { id: 'transform', k: 'Transform', re: /\btransform(?:s|ed)?\b/i, d: 'Turn this double-faced card over to its other face.' },
    { id: 'stun', k: 'Stun counter', re: /\bstun counters?\b/i, d: 'If a permanent with a stun counter would untap, remove a stun counter from it instead.' },
    { id: 'commander', k: 'Commander', re: /\bcommanders?\b/i, d: 'The legendary creature leading a Commander deck. It starts in the command zone and can be cast from there; each cast after the first costs {2} more (commander tax). If it would go to the graveyard or exile, its owner can put it back in the command zone. A player dealt 21 combat damage by the same commander loses.' },
    // Game words, explained when asked
    { id: 'exile', k: 'Exile', re: /\bexiled?\b|\bexiles\b/i, more: true, d: 'Removed from the game and set aside. Unlike the graveyard, nothing comes back from exile unless a card says so.' },
    { id: 'sacrifice', k: 'Sacrifice', re: /\bsacrific(?:e|es|ed)\b/i, more: true, d: 'Put a permanent you control into its owner’s graveyard. Indestructible doesn’t stop it, and it can’t be answered.' },
    { id: 'token', k: 'Token', re: /\btokens?\b/i, more: true, d: 'A permanent made by an effect instead of a card. It ceases to exist if it leaves the battlefield.' },
    { id: 'counter', k: 'Counter a spell', re: /\bcounter target\b|\bcounter that spell\b|\bcounter it\b/i, more: true, d: 'Cancel a spell while it’s being cast: it does nothing and goes to its owner’s graveyard.' },
    { id: 'plus counter', k: '+1/+1 counter', re: /\+1\/\+1 counters?/, more: true, d: 'A marker that gives a creature +1/+1 for as long as it stays on it.' },
    { id: 'minus counter', k: '−1/−1 counter', re: /-1\/-1 counters?/, more: true, d: 'A marker that gives a creature −1/−1 for as long as it stays on it. A +1/+1 and a −1/−1 counter cancel out.' },
    { id: 'mana value', k: 'Mana value', re: /\bmana value\b/i, more: true, d: 'The total amount of mana in its cost. {2}{R}{R} has mana value 4.' },
    { id: 'legendary', k: 'Legendary', re: /\blegendary\b/i, more: true, d: 'You can only have one permanent with the same name at a time. If you get a second, you choose one to keep and the other goes to the graveyard.' },
    { id: 'equipment', k: 'Equipment', re: /\bEquipment\b/, more: true, d: 'An artifact you attach to your creatures with its equip ability. It stays on the battlefield when the creature leaves.' },
    { id: 'aura', k: 'Aura', re: /\bAuras?\b/, more: true, d: 'An enchantment that attaches to a permanent (or player) and changes it.' },
    { id: 'vehicle', k: 'Vehicle', re: /\bVehicles?\b/, more: true, d: 'An artifact that turns into a creature only when you crew it.' },
    { id: 'dies', k: 'Dies', re: /\bdies\b/i, more: true, d: 'Goes from the battlefield to its owner’s graveyard.' },
    { id: 'leaves', k: 'Leaves the battlefield', re: /\bleaves? the battlefield\b/i, more: true, d: 'Goes from the battlefield to any other zone: graveyard, hand, library or exile.' },
    { id: 'upkeep', k: 'Upkeep', re: /\bupkeep\b/i, more: true, d: 'The start of a turn, after untapping and before the draw.' },
    { id: 'end step', k: 'End step', re: /\bend step\b/i, more: true, d: 'The last part of a turn, after combat and the second main phase.' },
    { id: 'combat damage', k: 'Combat damage', re: /\bcombat damage\b/i, more: true, d: 'Damage dealt by attacking and blocking creatures in combat, as opposed to damage from spells and abilities.' },
  ];
  const byId = new Map(T.map((t) => [t.id, t]));
  const global = (re) => new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`);
  // Terms in a card's text and type line, keywords it has (ids), in the order they appear; reminder text in
  // parentheses and the card's own name don't count
  function find(text, typeLine, extra, name) {
    let src = `${typeLine || ''}\n${text || ''}`.replace(/\([^()]*\)/g, ' ');
    if (name) src = src.split(name).join(' ');
    const hits = [];
    for (const t of T) {
      const m = global(t.re).exec(src);
      if (m) hits.push({ t, at: m.index });
    }
    for (const id of extra || []) { const t = byId.get(id); if (t && !hits.some((h) => h.t === t)) hits.push({ t, at: -1 }); }
    // A longer term that covers a shorter one wins (landcycling over cycling)
    const out = hits.filter((h) => !(h.t.id === 'cycling' && hits.some((x) => x.t.id === 'landcycling')));
    return out.sort((a, b) => a.at - b.at).map((h) => h.t);
  }
  // Escaped rules text with the first appearance of each found term wrapped in a button; `used` carries over
  // between lines so a term is marked once per card
  function mark(html, found, used) {
    let out = html;
    for (const t of found) {
      if (used.has(t.id)) continue;
      let done = false;
      out = out.replace(global(t.re), (m, ...rest) => {
        const at = rest[rest.length - 2], whole = rest[rest.length - 1];
        // never inside a tag we already added
        if (done || /<[^>]*$/.test(whole.slice(0, at))) return m;
        done = true;
        return `<button type="button" class="kwt" data-gl="${t.id}">${m}</button>`;
      });
      if (done) used.add(t.id);
    }
    return out;
  }
  root.Gloss = { terms: T, byId, find, mark };
  if (typeof module === 'object' && module.exports) module.exports = root.Gloss;
})(typeof self !== 'undefined' ? self : this);
