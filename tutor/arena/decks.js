/* Decks designed by Claude for the Arena. Each list is 60 cards from the supported pool. */
(function (root) {
  const DECKS = [
    {
      id: 'red-deck-wins', name: 'Red Deck Wins', colors: ['R'], archetype: 'aggro', face: 'Goblin Guide',
      blurb: 'Hasty goblins and a fistful of burn. It hits hard early, then points every spell at your face.',
      cards: [[4, 'Goblin Guide'], [4, 'Monastery Swiftspear'], [4, 'Jackal Pup'], [4, 'Mogg Fanatic'], [2, 'Plated Geopede'], [2, 'Keldon Raider'],
        [2, 'Hellrider'], [2, 'Ball Lightning'], [4, 'Lightning Bolt'], [4, 'Chain Lightning'], [4, 'Searing Spear'], [3, 'Lava Spike'], [21, 'Mountain']],
    },
    {
      id: 'white-weenie', name: 'White Weenie', colors: ['W'], archetype: 'aggro', face: 'Savannah Lions',
      blurb: 'A wall of cheap lions and knights, lifelink angels to pump the Pridemates, and Swords to Plowshares to clear the road.',
      cards: [[4, 'Savannah Lions'], [4, 'Elite Vanguard'], [4, 'Youthful Knight'], [4, "Ajani's Pridemate"], [4, 'White Knight'], [2, 'Attended Knight'],
        [2, 'Seraph of Dawn'], [2, 'Baneslayer Angel'], [4, 'Swords to Plowshares'], [3, 'Raise the Alarm'], [2, 'Celestial Flare'], [2, 'Condemn'],
        [1, 'Righteousness'], [22, 'Plains']],
    },
    {
      id: 'draw-go', name: 'Draw-Go', colors: ['U'], archetype: 'control', face: 'Counterspell',
      blurb: 'Counter what matters, then flash in a flyer at the end of your turn with the mana it saved.',
      cards: [[4, 'Vexing Gull'], [4, 'Cloaked Siren'], [4, "Man-o'-War"], [2, 'Stormrider Spirit'], [2, 'Serra Sphinx'], [2, 'Riddlemaster Sphinx'],
        [4, 'Counterspell'], [3, 'Mana Leak'], [3, 'Essence Scatter'], [2, 'Brainstorm'], [2, 'Opt'], [3, 'Vapor Snag'], [1, 'Sleep'], [24, 'Island']],
    },
    {
      id: 'graveyard-shift', name: 'Graveyard Shift', colors: ['B'], archetype: 'control', face: 'Gravedigger',
      blurb: 'Nearly every creature kills one of yours on arrival, and Gravedigger brings them back to do it again.',
      cards: [[4, 'Typhoid Rats'], [4, 'Vampire Nighthawk'], [4, 'Gravedigger'], [3, 'Nekrataal'], [4, 'Ravenous Chupacabra'], [2, 'Phyrexian Rager'],
        [2, 'Grave Titan'], [3, 'Hymn to Tourach'], [4, 'Doom Blade'], [3, 'Murder'], [2, 'Diabolic Edict'], [1, 'Sign in Blood'], [24, 'Swamp']],
    },
    {
      id: 'elvish-stampede', name: 'Elvish Stampede', colors: ['G'], archetype: 'midrange', face: 'Llanowar Elves',
      blurb: 'Mana elves into big green bodies, fight spells for removal, and an Overrun to end it.',
      cards: [[4, 'Llanowar Elves'], [4, 'Elvish Mystic'], [2, 'Elvish Visionary'], [2, 'Centaur Courser'], [4, 'Kalonian Tusker'], [4, 'Leatherback Baloth'],
        [4, 'Thragtusk'], [2, 'Colossal Dreadmaw'], [3, 'Giant Growth'], [3, 'Prey Upon'], [3, 'Rabid Bite'], [2, 'Overrun'], [1, 'Beast Within'], [22, 'Forest']],
    },
    {
      id: 'boros-charge', name: 'Boros Charge', colors: ['R', 'W'], archetype: 'aggro', face: 'Lightning Helix',
      blurb: 'Two-drops, Hellriders and Lightning Helix. It wants the game over by turn six.',
      cards: [[4, 'Goblin Guide'], [4, 'Monastery Swiftspear'], [4, 'Savannah Lions'], [3, 'Youthful Knight'], [4, 'Hellrider'], [2, 'Fervent Cathar'],
        [4, 'Lightning Bolt'], [4, 'Lightning Helix'], [3, 'Chain Lightning'], [3, 'Swords to Plowshares'], [2, 'Searing Spear'], [2, 'Raise the Alarm'],
        [4, 'Plateau'], [4, 'Clifftop Retreat'], [7, 'Mountain'], [6, 'Plains']],
    },
    {
      id: 'izzet-laboratory', name: 'Izzet Laboratory', colors: ['U', 'R'], archetype: 'control', face: 'Prodigal Sorcerer',
      blurb: 'Pingers, counterspells and Electrolyze. It trades one card for two and outlasts you.',
      cards: [[4, 'Prodigal Sorcerer'], [3, 'Vexing Gull'], [3, "Man-o'-War"], [4, 'Flametongue Kavu'], [2, 'Cloaked Siren'], [2, 'Inferno Titan'],
        [4, 'Lightning Bolt'], [3, 'Electrolyze'], [4, 'Counterspell'], [2, 'Mana Leak'], [2, 'Brainstorm'], [3, 'Magma Jet'],
        [4, 'Volcanic Island'], [4, 'Sulfur Falls'], [8, 'Island'], [8, 'Mountain']],
    },
    {
      id: 'golgari-rock', name: 'Golgari Rock', colors: ['B', 'G'], archetype: 'midrange', face: 'Thragtusk',
      blurb: 'Discard, removal and creatures that are two cards in one. It grinds until you run out of threats.',
      cards: [[4, 'Llanowar Elves'], [2, 'Typhoid Rats'], [3, 'Vampire Nighthawk'], [2, 'Gravedigger'], [4, 'Ravenous Chupacabra'], [4, 'Thragtusk'],
        [3, 'Leatherback Baloth'], [2, 'Grave Titan'], [4, 'Putrefy'], [3, 'Doom Blade'], [3, 'Hymn to Tourach'], [2, 'Prey Upon'],
        [4, 'Bayou'], [4, 'Woodland Cemetery'], [2, 'Jungle Hollow'], [7, 'Swamp'], [7, 'Forest']],
    },
    {
      id: 'dragons-hoard', name: "Dragon's Hoard", colors: ['R'], archetype: 'midrange', face: 'Shivan Dragon',
      blurb: 'Hold the ground with burn and pingers, then land a dragon every turn from turn four.',
      cards: [[3, 'Prodigal Pyromancer'], [2, 'Ember Hauler'], [4, 'Dragon Whelp'], [4, 'Flametongue Kavu'], [3, 'Shivan Dragon'], [3, 'Thundermaw Hellkite'],
        [2, 'Inferno Titan'], [4, 'Lightning Bolt'], [3, 'Lightning Strike'], [2, 'Searing Spear'], [2, 'Magma Jet'], [2, 'Anger of the Gods'], [1, 'Pyroclasm'],
        [25, 'Mountain']],
    },
    {
      id: 'azorius-fortress', name: 'Azorius Fortress', colors: ['W', 'U'], archetype: 'control', face: 'Wrath of God',
      blurb: 'Walls, wraths and counterspells, then Serra Angel and Baneslayer to close the door.',
      cards: [[4, 'Wall of Omens'], [2, "Man-o'-War"], [3, 'Seraph of Dawn'], [3, 'Serra Angel'], [2, 'Baneslayer Angel'], [2, 'Mahamoti Djinn'],
        [3, 'Wrath of God'], [1, 'Day of Judgment'], [4, 'Counterspell'], [2, 'Mana Leak'], [4, 'Swords to Plowshares'], [2, 'Condemn'], [2, 'Brainstorm'],
        [1, 'Divination'], [4, 'Tundra'], [4, 'Glacial Fortress'], [1, 'Azorius Guildgate'], [8, 'Plains'], [8, 'Island']],
    },
    {
      id: 'rakdos-rampage', name: 'Rakdos Rampage', colors: ['B', 'R'], archetype: 'aggro', face: 'Hypnotic Specter',
      blurb: 'Hypnotic Specter and Blightning empty their hand while burn and haste close it out.',
      cards: [[4, 'Jackal Pup'], [3, 'Typhoid Rats'], [3, 'Dusk Legion Zealot'], [4, 'Hypnotic Specter'], [3, 'Keldon Raider'], [3, 'Hellrider'],
        [3, 'Vampire Nighthawk'], [4, 'Lightning Bolt'], [4, 'Terminate'], [3, 'Blightning'], [3, 'Chain Lightning'],
        [4, 'Badlands'], [4, 'Dragonskull Summit'], [8, 'Mountain'], [7, 'Swamp']],
    },
  ];
  if (typeof module === 'object' && module.exports) module.exports = DECKS;
  else root.ARENA_DECKS = DECKS;
})(typeof self !== 'undefined' ? self : this);
