// Commander decks designed by Claude: a commander, a plan, and a fixed build seed (the builder fills the 99).
// Balanced in AI vs AI round robins: every deck wins between roughly 40% and 60%.
(function (root, factory) {
  const list = factory();
  if (typeof module === 'object' && module.exports) module.exports = list;
  else root.ARENA_COMMANDERS = list;
})(typeof self !== 'undefined' ? self : this, function () {
  return [
    { id: 'rorix', name: "Rorix's Roost", commander: 'Rorix Bladewing', archetype: 'midrange', seed: 111,
      blurb: 'A hasty 6/5 dragon that flies over blockers. Four hits from Rorix is 24 commander damage.', include: [] },
    { id: 'akroma', name: "Akroma's Host", commander: 'Akroma, Angel of Wrath', archetype: 'midrange', seed: 102,
      blurb: 'Angels and knights hold the ground until Akroma arrives: eight mana of everything at once.',
      include: ['Swords to Plowshares', 'Path to Exile', 'Serra Angel', 'Baneslayer Angel', 'Day of Judgment', 'Emeria Angel'] },
    { id: 'grendel', name: "Grendel's Venom", commander: 'Grendel, Spawn of Knull', archetype: 'midrange', seed: 903,
      blurb: 'A flying deathtouch commander backed by Grave Titan, Vampire Nighthawk and the best removal in black.',
      include: ['Grave Titan', 'Vampire Nighthawk', 'Gifted Aetherborn', 'Wurmcoil Engine', 'Noxious Dragon', 'Vampire Sovereign', 'Go for the Throat', 'Doom Blade', 'Cast Down', 'Terror', 'Grasp of Darkness', "Night's Whisper", 'Sign in Blood'] },
    { id: 'leatherhead', name: "Leatherhead's Bayou", commander: 'Leatherhead, Iron Gator', archetype: 'aggro', seed: 104,
      blurb: 'Green beasts swarm early, then every Leatherhead attack puts two counters on your whole team.', include: [] },
    { id: 'locke', name: "Locke's Heist", commander: 'Locke Cole', archetype: 'control', seed: 106,
      blurb: 'A deathtouch, lifelink thief who loots every time he connects, with counterspells and kill spells behind him.', include: [] },
    { id: 'sylvan', name: 'Sylvan Monastery', commander: 'Rasaad, Sylvan Monk', archetype: 'midrange', seed: 507,
      blurb: 'Green and white creatures that keep coming: even when Rasaad falls, two boars take his place.', include: [] },
    { id: 'skies', name: "Dragon Monk's Skies", commander: 'Rasaad, Dragon Monk', archetype: 'midrange', seed: 109,
      blurb: 'White and blue flyers. When the monk falls he leaves two faerie dragons behind.', include: [] },
    { id: 'cyclops', name: 'Cyclops Stampede', commander: 'Borborygmos', archetype: 'midrange', seed: 108,
      blurb: 'Ramp into a trampling cyclops whose every hit grows your whole team.', include: [] },
  ];
});
