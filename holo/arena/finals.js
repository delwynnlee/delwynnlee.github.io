/* Famous Finals: the Pokémon TCG World Championship finals, with both finalists' decks exactly as registered.
   Play either side against the other: the goal is to win the way the champion did, or win the game the runner-up couldn't.
   Lists from Limitless TCG; the stories from the events' coverage. Card ids are the printings in Holo's card data. */
(function (root, factory) {
  const F = factory();
  if (typeof module === 'object' && module.exports) module.exports = F;
  else root.ARENA_FINALS = F;
})(typeof self !== 'undefined' ? self : this, function () {
  const FINALS = [
    {
      id: 'w26', event: '2026 Pokémon World Championships', short: 'Worlds 2026', where: 'San Francisco', when: 'August 2026', score: '2–0',
      story: "Dragapult ex was everywhere in 2026, and Alakazam was meant to be its bad matchup. Diego Cassiraga, the 2017 World Champion, rode Alakazam all the way to the final, nine years after his first title. Andrew Hedrick took the first game when his Risky Ruins replaced Cassiraga's Battle Cage, which had been keeping Phantom Dive's damage counters off the Bench. In the second he drew Special Red Card and ran Cassiraga's deck out of cards, a rare way to end a World Championship.",
      link: { url: 'https://www.levelup.com/en/news/pokemon-world-championships-2026-argentinas-diego-cassiraga-loses-pokemon-tcg-final-to-andrew-hedrick/', label: 'LevelUp' },
      decks: [
        { id: 'w26-hedrick', player: 'Andrew Hedrick', from: 'United States', archetype: 'Dragapult ex', arch: 'midrange', types: ['N', 'P'], won: true, face: 'sv6-130',
          goal: 'Win as Hedrick did. He took the final 2–0.',
          plan: "Phantom Dive does 200 damage to the Active Pokémon and puts six damage counters on the Bench, so every attack sets up the next Knock Out. Munkidori moves damage onto the other side, Crushing Hammer knocks off Energy, Special Red Card cuts the opponent's hand to three cards, and Risky Ruins puts two damage counters on every Basic Pokémon that isn't Darkness as it goes onto the Bench.",
          keys: ['Dragapult ex', 'Munkidori', 'Risky Ruins', 'Special Red Card'],
          cards: [[4, 'sv6-128'], [4, 'sv6-129'], [3, 'sv6-130'], [2, 'sv6-95'], [2, 'me2pt5-16'], [1, 'sv9-120'], [1, 'sv5-129'], [1, 'me3-62'], [1, 'me2pt5-142'],
            [4, 'me1-119'], [3, 'me1-114'], [2, 'sv7-133'], [1, 'me3-84'], [4, 'me3-81'], [4, 'me3-71'], [4, 'sv5-144'], [3, 'me2pt5-196'], [3, 'me1-131'], [1, 'sv6-165'], [1, 'me4-82'], [2, 'me1-127'],
            [3, 'sve-2'], [3, 'sve-7'], [3, 'sve-5']] },
        { id: 'w26-cassiraga', player: 'Diego Cassiraga', from: 'Argentina', archetype: 'Alakazam Dudunsparce', arch: 'control', types: ['P'], won: false, face: 'me1-56',
          goal: 'Win a game for Cassiraga. He lost the final 0–2.',
          plan: "Alakazam's Powerful Hand puts two damage counters on the Active Pokémon for each card in your hand, so the whole deck is about drawing: Kadabra and Alakazam draw as they evolve, Dudunsparce's Run Away Draw draws three, and Telepathic Psychic Energy fills the Bench with Abra. Battle Cage keeps damage counters off the Bench, and Shaymin stops attacks from damaging Benched Pokémon without a Rule Box.",
          keys: ['Alakazam', 'Dudunsparce', 'Battle Cage', 'Telepathic Psychic Energy'],
          cards: [[4, 'me1-54'], [4, 'me1-55'], [3, 'me1-56'], [3, 'sv9-120'], [3, 'sv5-129'], [2, 'sv6pt5-40'], [1, 'sv8-87'], [1, 'me2pt5-142'], [1, 'sv10-10'],
            [4, 'me2-87'], [3, 'rsv10pt5-84'], [2, 'me1-114'], [1, 'sv6-155'], [1, 'sv5-146'], [4, 'sv5-144'], [4, 'me3-81'], [3, 'me1-125'], [2, 'sv6-148'], [1, 'sv10-168'], [2, 'me2pt5-181'], [1, 'sv6-158'], [4, 'me2-85'],
            [4, 'me3-88'], [1, 'sve-5'], [1, 'sv8-191']] },
      ],
    },
    {
      id: 'w25', event: '2025 Pokémon World Championships', short: 'Worlds 2025', where: 'Anaheim, California', when: 'August 2025', score: '2–0',
      story: "Riley McKay's Gardevoir ex carried a surprise: Lillie's Clefairy ex, whose Fairy Zone makes every Dragon Pokémon weak to Psychic. Against Justin Newdorf's Dragapult ex that turned Gardevoir's Miracle Force into a one-hit Knock Out. McKay won the first game without giving up a Prize card, and Newdorf conceded the second. McKay became the second Canadian to win the Masters title, after Andrew Estrada in 2014.",
      link: { url: 'https://bulbapedia.bulbagarden.net/wiki/2025_Pok%C3%A9mon_World_Championships', label: 'Bulbapedia' },
      decks: [
        { id: 'w25-mckay', player: 'Riley McKay', from: 'Canada', archetype: 'Gardevoir ex', arch: 'control', types: ['P'], won: true, face: 'sv1-86',
          goal: 'Win as McKay did. He took the final 2–0.',
          plan: "Gardevoir ex sits on the Bench and attaches Psychic Energy from the discard pile as often as you like, two damage counters each time. Munkidori moves those counters onto the other side, and Lillie's Clefairy ex makes every Dragon Pokémon weak to Psychic, so Miracle Force knocks out a Dragapult ex in one hit. Technical Machine: Evolution grows two Ralts at once.",
          keys: ['Gardevoir ex', "Lillie's Clefairy ex", 'Munkidori', 'Technical Machine: Evolution'],
          cards: [[4, 'sv6-95'], [3, 'sv1-84'], [2, 'sv1-85'], [2, 'sv1-86'], [1, 'sv4-86'], [1, 'sv6pt5-38'], [1, 'sv5-78'], [1, 'sv9-56'], [1, 'sv3pt5-151'],
            [4, 'sv9-155'], [4, 'sv2-185'], [2, 'sv3-186'], [4, 'sv1-196'], [3, 'sv4-163'], [2, 'sv1-191'], [2, 'sv4-160'], [2, 'sv6pt5-61'], [2, 'sv1-181'], [1, 'sv2-188'], [1, 'sv6-163'],
            [2, 'sv4-178'], [1, 'sv4-177'], [1, 'sv2-173'], [2, 'sv2-171'], [7, 'sve-5'], [4, 'sve-7']] },
        { id: 'w25-newdorf', player: 'Justin Newdorf', from: 'United States', archetype: 'Dragapult Dusknoir', arch: 'midrange', types: ['N', 'P'], won: false, face: 'sv8pt5-37',
          goal: 'Win a game for Newdorf. He lost the final 0–2.',
          plan: "Phantom Dive does 200 damage to the Active Pokémon and spreads six damage counters across the Bench. Dusknoir knocks itself out to put thirteen more where they're needed, Budew's Itchy Pollen stops Item cards for a turn, and Bloodmoon Ursaluna ex's Blood Moon costs less for every Prize card the opponent has taken.",
          keys: ['Dragapult ex', 'Dusknoir', 'Budew', 'Bloodmoon Ursaluna ex'],
          cards: [[4, 'sv6-128'], [4, 'sv6-129'], [3, 'sv6-130'], [2, 'sv8pt5-35'], [2, 'sv8pt5-36'], [1, 'sv8pt5-37'], [2, 'sv8pt5-4'], [1, 'sv8-76'], [1, 'sv1-118'], [1, 'sv6pt5-38'], [1, 'sv6-141'], [1, 'sv6-95'],
            [4, 'sv9-155'], [4, 'sv2-185'], [2, 'sv2-172'], [2, 'rsv10pt5-84'], [4, 'sv5-144'], [4, 'sv6pt5-61'], [4, 'sv1-196'], [3, 'sv4-160'], [1, 'sv1-181'], [2, 'sv6-153'],
            [3, 'sv2-191'], [2, 'sve-5'], [1, 'sve-2'], [1, 'sv5-162']] },
      ],
    },
  ];
  const byId = new Map(FINALS.flatMap((f) => f.decks.map((d) => [d.id, { f, d }])));
  // The deck's name in the Arena: "McKay's Gardevoir ex"
  const surname = (p) => p.split(' ').slice(-1)[0];
  const deckName = (d) => `${surname(d.player)}'s ${d.archetype}`;
  const rival = (id) => { const x = byId.get(id); return x ? x.f.decks.find((y) => y.id !== id) : null; };
  return { FINALS, byId, deckName, rival, surname };
});
