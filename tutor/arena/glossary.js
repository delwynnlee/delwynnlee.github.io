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
    { id: 'incubate', k: 'Incubate', re: /\bincubat(?:e|es|ed|or)\b/i, d: 'Create an Incubator token with that many +1/+1 counters. It\u2019s an artifact with “{2}: Transform this artifact”: it becomes a 0/0 Phyrexian artifact creature, so its counters make it that big.' },
    { id: 'for mirrodin', k: 'For Mirrodin!', re: /\bFor Mirrodin!/, d: 'When this Equipment comes into play, create a 2/2 red Rebel creature token and attach the Equipment to it.' },
    { id: 'oil', k: 'Oil counter', re: /\boil counters?\b/i, d: 'A counter with no rules of its own: the card that uses oil counters says what they do.' },
    { id: 'powerstone', k: 'Powerstone', re: /\bPowerstone\b/, d: 'An artifact token with “{T}: Add {C}. This mana can\u2019t be spent to cast a nonartifact spell.”' },
    { id: 'perpetually', k: 'Perpetually', re: /\bperpetually\b/i, d: 'An Arena-only change that stays with the card wherever it goes for the rest of the game: hand, graveyard, back into play.' },
    { id: 'conjure', k: 'Conjure', re: /\bconjures?\b/i, d: 'An Arena-only action: put a brand-new copy of the named card into the zone, from outside the game.' },
    { id: 'seek', k: 'Seek', re: /\bseeks?\b/i, d: 'An Arena-only action: put a random card that fits from your library into your hand (or wherever the card says).' },
    { id: 'draft', k: 'Draft (spellbook)', re: /\bdraft a card\b/i, d: 'An Arena-only action: see three random cards from this card\u2019s fixed list of fifteen (its spellbook) and conjure the one you pick into your hand.' },
    { id: 'boon', k: 'Boon', re: /\bboon\b/i, d: 'An Arena-only one-time effect you keep until it happens: when its condition is met, it does its thing and goes away.' },
    { id: 'enlist', k: 'Enlist', re: /\benlist(?:s|ed)?\b/i, d: 'As this creature attacks, you may tap a creature you control that isn\u2019t attacking (and could attack) to add its power to this one\u2019s until end of turn.' },
    { id: 'meld', k: 'Meld', re: /\bmeld\b/i, d: 'Two specific cards that are both in play get exiled and come back together as one huge card, made of both their backs.' },
    { id: 'fear', k: 'Fear', re: /\bfear\b/i, d: "Can't be blocked except by artifact creatures and black creatures.", s: 'Only black or artifact creatures can block it.' },
    { id: 'intimidate', k: 'Intimidate', re: /\bintimidate\b/i, d: "Can't be blocked except by artifact creatures and creatures that share a color with it.", s: 'Only artifact creatures or ones sharing its color can block it.' },
    { id: 'imprint', k: 'Imprint', re: /\bimprint\b/i, d: 'An ability word: the card exiles another card and remembers it, and its other abilities use the exiled card.' },
    { id: 'loyalty', k: 'Loyalty', re: /\bloyalty\b/i, d: "A planeswalker enters with loyalty counters. Once each turn, any time you could cast a sorcery, you may use one of its loyalty abilities: “+” abilities add counters, “−” abilities remove them. Damage dealt to it removes loyalty, and at 0 it's put into the graveyard." },
    { id: 'landwalk', k: 'Landwalk', re: /\b(?:plains|island|swamp|mountain|forest)walk\b/i, d: 'Can’t be blocked as long as the defending player controls a land of that type.' },
    { id: 'saga', k: 'Saga', re: /\b(?:Saga|lore counters?)\b/, d: 'An enchantment told in chapters. It gets a lore counter as it comes into play and after your draw step; each chapter happens when the count reaches its number, and the Saga is sacrificed after the last one.' },
    { id: 'transform', k: 'Transform', re: /\btransform(?:s|ed)?\b/i, d: 'Turn this double-faced card over to its other face.' },
    { id: 'stun', k: 'Stun counter', re: /\bstun counters?\b/i, d: 'If a permanent with a stun counter would untap, remove a stun counter from it instead.' },
    { id: 'commander', k: 'Commander', re: /\bcommanders?\b/i, d: 'The legendary creature leading a Commander deck. It starts in the command zone and can be cast from there; each cast after the first costs {2} more (commander tax). If it would go to the graveyard or exile, its owner can put it back in the command zone. A player dealt 21 combat damage by the same commander loses.' },
    // More keywords from across Magic, for the card browser
    { id: 'cascade', k: 'Cascade', re: /\bcascade\b/i, d: 'When you cast it, exile cards from the top of your library until you hit a nonland card that costs less. You may cast that card for free; the rest go to the bottom in a random order.' },
    { id: 'storm', k: 'Storm', re: /\bStorm\b(?! Crow)/, d: 'When you cast it, copy it once for each other spell cast before it this turn.' },
    { id: 'delve', k: 'Delve', re: /\bdelve\b/i, d: 'Each card you exile from your graveyard while casting it pays for {1}.' },
    { id: 'dredge', k: 'Dredge', re: /\bdredge\b/i, d: 'If you would draw a card, you can instead mill that many cards and return this card from your graveyard to your hand.' },
    { id: 'madness', k: 'Madness', re: /\bmadness\b/i, d: 'If you discard it, you can cast it right away for its madness cost.' },
    { id: 'morph', k: 'Morph', re: /\b(?:mega)?morph\b/i, d: 'You can cast it face down as a nameless 2/2 creature for {3}, then turn it face up any time by paying its morph cost. Megamorph adds a +1/+1 counter when it turns up.' },
    { id: 'manifest', k: 'Manifest', re: /\bmanifest(?:s|ed)?\b/i, d: 'Put the top card of your library onto the battlefield face down as a 2/2 creature. If it’s a creature card, you can turn it face up for its mana cost.' },
    { id: 'persist', k: 'Persist', re: /\bpersist\b/i, d: 'When it dies, if it had no −1/−1 counters, it comes back with a −1/−1 counter.' },
    { id: 'undying', k: 'Undying', re: /\bundying\b/i, d: 'When it dies, if it had no +1/+1 counters, it comes back with a +1/+1 counter.' },
    { id: 'evolve', k: 'Evolve', re: /\bevolves?\b/i, d: 'Whenever a creature with greater power or toughness comes into play under your control, put a +1/+1 counter on this one.' },
    { id: 'exalted', k: 'Exalted', re: /\bexalted\b/i, d: 'Whenever a creature you control attacks alone, it gets +1/+1 until end of turn for each instance of exalted you have.' },
    { id: 'rebound', k: 'Rebound', re: /\brebound\b/i, d: 'If you cast it from your hand, it’s exiled as it resolves, and you can cast it again for free at the start of your next turn.' },
    { id: 'suspend', k: 'Suspend', re: /\bsuspend(?:ed)?\b/i, d: 'Instead of casting it, pay the suspend cost and exile it with that many time counters. One comes off at the start of each of your turns; when the last one does, you cast it for free.' },
    { id: 'annihilator', k: 'Annihilator', re: /\bannihilator\b/i, d: 'Whenever it attacks, the defending player sacrifices that many permanents.' },
    { id: 'infect', k: 'Infect', re: /\binfect\b/i, d: 'It deals damage to creatures as −1/−1 counters and to players as poison counters.' },
    { id: 'toxic', k: 'Toxic', re: /\btoxic\b/i, d: 'A player it deals combat damage to also gets that many poison counters.' },
    { id: 'poison', k: 'Poison counters', re: /\bpoison counters?\b/i, d: 'A player with ten or more poison counters loses the game.' },
    { id: 'proliferate', k: 'Proliferate', re: /\bproliferate\b/i, d: 'Choose any number of permanents and players that have counters, then give each one more of each kind it already has.' },
    { id: 'populate', k: 'Populate', re: /\bpopulate\b/i, d: 'Create a copy of a creature token you control.' },
    { id: 'explore', k: 'Explore', re: /\bexplores?\b/i, d: 'Reveal the top card of your library. If it’s a land, put it into your hand. If not, put a +1/+1 counter on this creature, and you can put the card into your graveyard.' },
    { id: 'investigate', k: 'Investigate', re: /\binvestigates?\b/i, d: 'Create a Clue token: an artifact you can pay {2} and sacrifice to draw a card.' },
    { id: 'adapt', k: 'Adapt', re: /\badapts?\b/i, d: 'If it has no +1/+1 counters, put that many +1/+1 counters on it.' },
    { id: 'monstrosity', k: 'Monstrosity', re: /\bmonstrosity\b|\bmonstrous\b/i, d: 'If it isn’t monstrous yet, put that many +1/+1 counters on it and it becomes monstrous.' },
    { id: 'mentor', k: 'Mentor', re: /\bmentor\b/i, d: 'Whenever it attacks, put a +1/+1 counter on another attacking creature with less power.' },
    { id: 'training', k: 'Training', re: /\btraining\b|\btrains\b/i, d: 'Whenever it attacks alongside a creature with greater power, put a +1/+1 counter on it.' },
    { id: 'riot', k: 'Riot', re: /\briot\b/i, d: 'It comes into play with your choice of a +1/+1 counter or haste.' },
    { id: 'spectacle', k: 'Spectacle', re: /\bspectacle\b/i, d: 'You can cast it for its spectacle cost if an opponent lost life this turn.' },
    { id: 'escape', k: 'Escape', re: /\bescapes?\b/i, d: 'You can cast it from your graveyard for its escape cost, which includes exiling other cards from your graveyard.' },
    { id: 'unearth', k: 'Unearth', re: /\bunearth\b/i, d: 'Pay its unearth cost to return it from your graveyard to the battlefield with haste. It’s exiled at the end of the turn.' },
    { id: 'mutate', k: 'Mutate', re: /\bmutat(?:e|es|ed|ing)\b/i, d: 'Cast it for its mutate cost onto a non-Human creature you own; the two merge into one creature with the top card’s name and stats and the abilities of both.' },
    { id: 'foretell', k: 'Foretell', re: /\bforetold\b|\bforetell\b/i, d: 'During your turn, you can pay {2} to exile it face down. On a later turn, cast it for its foretell cost.' },
    { id: 'disturb', k: 'Disturb', re: /\bdisturb\b/i, d: 'You can cast it from your graveyard, transformed to its back face, for its disturb cost.' },
    { id: 'blitz', k: 'Blitz', re: /\bblitz\b/i, d: 'Cast it for its blitz cost and it gets haste and “when this dies, draw a card,” but you sacrifice it at the end of the turn.' },
    { id: 'casualty', k: 'Casualty', re: /\bcasualty\b/i, d: 'As you cast it, you can sacrifice a creature with at least that much power to copy the spell.' },
    { id: 'backup', k: 'Backup', re: /\bbackup\b/i, d: 'When it comes into play, put that many +1/+1 counters on a creature. If that’s another creature, it also gets this one’s other abilities until end of turn.' },
    { id: 'bargain', k: 'Bargain', re: /\bbargain(?:ed)?\b/i, d: 'As you cast it, you can sacrifice an artifact, enchantment or token for an extra effect.' },
    { id: 'discover', k: 'Discover', re: /\bdiscover\b/i, d: 'Exile cards from the top of your library until you hit a nonland card with that mana value or less. Cast it for free or put it into your hand; the rest go to the bottom.' },
    { id: 'offspring', k: 'Offspring', re: /\boffspring\b/i, d: 'You can pay the offspring cost as you cast it. If you do, a 1/1 token copy of it comes along when it comes into play.' },
    { id: 'plot', k: 'Plot', re: /\bplot(?:ted)?\b/i, d: 'Pay the plot cost to exile it from your hand. On a later turn you can cast it for free, at the speed of a sorcery.' },
    { id: 'saddle', k: 'Saddle', re: /\bsaddled?\b/i, d: 'Tap your other creatures with that much total power: this Mount becomes saddled until end of turn. Only when you could cast a sorcery.' },
    { id: 'gift', k: 'Gift', re: /\bgift\b/i, d: 'As you cast it, you can promise an opponent a gift. If you do, they get the gift and the spell does something extra.' },
    { id: 'exhaust', k: 'Exhaust', re: /\bexhaust\b/i, d: 'An ability you can use only once.' },
    { id: 'echo', k: 'Echo', re: /\becho\b/i, d: 'At the start of your next turn after it comes into play, sacrifice it unless you pay its echo cost.' },
    { id: 'ninjutsu', k: 'Ninjutsu', re: /\bninjutsu\b/i, d: 'Return one of your unblocked attackers to your hand to put this card from your hand into play tapped and attacking.' },
    { id: 'bushido', k: 'Bushido', re: /\bbushido\b/i, d: 'Whenever it blocks or becomes blocked, it gets +N/+N until end of turn.' },
    { id: 'bloodthirst', k: 'Bloodthirst', re: /\bbloodthirst\b/i, d: 'If an opponent was dealt damage this turn, it comes into play with that many +1/+1 counters.' },
    { id: 'emerge', k: 'Emerge', re: /\bemerge\b/i, d: 'You can cast it by sacrificing a creature and paying the emerge cost, reduced by that creature’s mana value.' },
    { id: 'bestow', k: 'Bestow', re: /\bbestow(?:ed)?\b/i, d: 'You can cast it as an Aura on a creature for its bestow cost. If that creature leaves, it becomes a creature again.' },
    { id: 'afterlife', k: 'Afterlife', re: /\bafterlife\b/i, d: 'When it dies, create that many 1/1 white and black Spirit tokens with flying.' },
    { id: 'fabricate', k: 'Fabricate', re: /\bfabricate\b/i, d: 'When it comes into play, put that many +1/+1 counters on it, or create that many 1/1 Servo artifact creature tokens.' },
    { id: 'embalm', k: 'Embalm', re: /\bembalm\b|\beternalize\b/i, d: 'Exile it from your graveyard and pay the cost to create a token copy of it (a white Zombie for embalm, a 4/4 black Zombie for eternalize). Only as a sorcery.' },
    { id: 'entwine', k: 'Entwine', re: /\bentwine\b/i, d: 'Pay the entwine cost to get all of its modes instead of one.' },
    { id: 'overload', k: 'Overload', re: /\boverload(?:ed)?\b/i, d: 'Cast it for its overload cost and every “target” in its text becomes “each”.' },
    { id: 'buyback', k: 'Buyback', re: /\bbuyback\b/i, d: 'Pay the buyback cost as you cast it and it returns to your hand instead of the graveyard.' },
    { id: 'jump-start', k: 'Jump-start', re: /\bjump-start\b/i, d: 'You can cast it from your graveyard by also discarding a card. Then it’s exiled.' },
    { id: 'regenerate', k: 'Regenerate', re: /\bregenerat(?:e|es|ed)\b/i, d: 'The next time it would be destroyed this turn, instead tap it, remove all damage from it and take it out of combat.' },
    { id: 'changeling', k: 'Changeling', re: /\bchangeling\b/i, d: 'It has every creature type.' },
    { id: 'devoid', k: 'Devoid', re: /\bdevoid\b/i, d: 'It’s colorless, whatever its mana cost.' },
    { id: 'split second', k: 'Split second', re: /\bsplit second\b/i, d: 'While it’s being cast, nobody can cast spells or use abilities, apart from mana abilities.' },
    { id: 'partner', k: 'Partner', re: /\bpartner\b/i, d: 'Two commanders with partner can lead a Commander deck together.' },
    { id: 'monarch', k: 'Monarch', re: /\bmonarch\b/i, d: 'The monarch draws an extra card at the end of their turn. Deal combat damage to the monarch to become the monarch yourself.' },
    { id: 'incubate', k: 'Incubate', re: /\bincubate\b/i, d: 'Create an Incubator artifact token with that many +1/+1 counters. Pay {2} to turn it into a 0/0 Phyrexian artifact creature.' },
    { id: 'blood', k: 'Blood', re: /\bBlood token\b/, d: 'An artifact token. {1}, {T}, discard a card, sacrifice it: draw a card.' },
    { id: 'map', k: 'Map', re: /\bMap tokens?\b/, d: 'An artifact token. {1}, {T}, sacrifice it: target creature you control explores.' },
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
  // Terms in a card's text and type line, plus keywords it has (ids), in the order they appear; reminder text in
  // parentheses and the card's own name (or names, one per face) don't count
  function find(text, typeLine, extra, names) {
    let src = `${typeLine || ''}\n${text || ''}`.replace(/\([^()]*\)/g, ' ');
    for (const n of [].concat(names || [])) if (n) src = src.split(n).join(' ');
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
