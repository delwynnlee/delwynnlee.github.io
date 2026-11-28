/* Famous Finals: four real pro finals, with both finalists' main decks exactly as registered.
   Play either side against the other; the goal is to do what the winner did, or what the runner-up couldn't.
   Lists from the events' official coverage (magic.gg) and Star City Games; games are single games with main decks. */
(function (root, factory) {
  const F = factory();
  if (typeof module === 'object' && module.exports) module.exports = F;
  else root.ARENA_FINALS = F;
})(typeof self !== 'undefined' ? self : this, function () {
  const L = (s) => s.trim().split('\n').map((l) => { const m = /^(\d+)\s+(.+)$/.exec(l.trim()); return [+m[1], m[2]]; });
  const FINALS = [
    {
      id: 'w32', event: 'Magic World Championship 32', short: 'Worlds 32', where: 'Atlanta', when: 'November 2026', score: '3–0',
      story: 'Stefan Schütz brought an Izzet deck almost nobody saw coming, built around a brand-new Star Trek card, Anthropological Mission. He didn’t drop a Constructed match all weekend and swept Eduardo Sajgalik’s Selesnya +1/+1 counters deck 3–0 in the final. Sajgalik’s deck had no new cards in it at all.',
      link: { url: 'https://articles.starcitygames.com/magic-the-gathering/schutz-izzet-mission-wins-magic-world-championship-32/', label: 'Star City Games' },
      decks: [
        { id: 'w32-schutz', player: 'Stefan Schütz', from: 'Austria', archetype: 'Izzet Mission', arch: 'control', won: true, face: 'Anthropological Mission',
          goal: 'Win as Schütz did. He swept the final 3–0.',
          plan: 'A pile of one-mana spells. Anthropological Mission draws a card for each one, and Ral, Crackling Wit gains loyalty from them. Counters and burn keep the board clear until the spells run the opponent out of answers.',
          main: L(`3 Ral, Crackling Wit
1 Engineered Explosives
4 Anthropological Mission
1 Impractical Joke
4 Sleight of Hand
1 Burst Lightning
2 Consult the Star Charts
1 Fire Magic
4 Flashback
3 Into the Flood Maw
2 Long River's Pull
4 Opt
1 Sear
2 Spell Pierce
2 Spell Snare
2 Torch the Tower
1 Traumatic Critique
2 Great Hall of the Biblioplex
6 Island
1 Multiversal Passage
4 Riverpyre Verge
4 Spirebluff Canal
4 Steam Vents
1 Stormcarved Coast`) },
        { id: 'w32-sajgalik', player: 'Eduardo Sajgalik', from: 'Canada', archetype: 'Selesnya Michelangelo', arch: 'aggro', won: false, face: 'Michelangelo, Weirdness to 11',
          goal: 'Win a game for Sajgalik. He lost the final 0–3.',
          plan: '+1/+1 counters, with Michelangelo adding one more each time. Ouroboroid and Guiding Hydra spread counters across the whole team, and Practiced Offense hands one creature double strike.',
          main: L(`4 Bejeweled Warg
2 Brightglass Gearhulk
4 Gene Pollinator
1 Guiding Hydra
4 Llanowar Elves
4 Michelangelo, Weirdness to 11
4 Ouroboroid
4 Pawpatch Recruit
2 Surrak, Elusive Hunter
2 Meltstrider's Resolve
2 Seam Rip
4 Practiced Offense
2 Abandoned Air Temple
6 Forest
4 Hushwood Verge
2 Multiversal Passage
2 Plains
3 Starting Town
4 Temple Garden`) },
      ],
    },
    {
      id: 'sos', event: 'Pro Tour Secrets of Strixhaven', short: 'Pro Tour Strixhaven', where: 'Las Vegas', when: 'May 2026', score: null,
      story: 'Two teammates in the final, with the same deck. Their team found Selesnya Landfall in the Magic Online queues and brought it to the Pro Tour, where it put both of them in the last match. Nathan Steuer narrowly beat Christoffer Larsen, who had won the Pro Tour before this one.',
      link: { url: 'https://magic.gg/news/pro-tour-secrets-of-strixhaven-finals', label: 'magic.gg' },
      decks: [
        { id: 'sos-steuer', player: 'Nathan Steuer', from: 'United States', archetype: 'Selesnya Landfall', arch: 'aggro', won: true, face: 'Mightform Harmonizer',
          goal: 'Win the mirror match as Steuer did.',
          plan: 'Every land drop counts. Mightform Harmonizer doubles a creature’s power, Badgermole Cub and Earthbender Ascension turn lands into attackers, and Escape Tunnel and Fabled Passage give extra landfall.',
          main: L(`4 Erode
1 Surrak, Elusive Hunter
2 Lumbering Worldwagon
2 Bushwhack
4 Earthbender Ascension
2 Temple Garden
7 Forest
4 Sazh's Chocobo
2 Icetill Explorer
1 Keen-Eyed Curator
4 Llanowar Elves
4 Badgermole Cub
4 Fabled Passage
2 Dyadrine, Synthesis Amalgam
4 Hushwood Verge
4 Mightform Harmonizer
3 Escape Tunnel
2 Plains
3 Ba Sing Se
1 Mossborn Hydra`) },
        { id: 'sos-larsen', player: 'Christoffer Larsen', from: 'Denmark', archetype: 'Selesnya Landfall', arch: 'aggro', won: false, face: 'Earthbender Ascension',
          goal: 'Win the mirror for Larsen, who lost it narrowly.',
          plan: 'The same Selesnya Landfall deck with two more Surraks and one more Mossborn Hydra. Make every land drop count.',
          main: L(`2 Surrak, Elusive Hunter
2 Plains
4 Earthbender Ascension
4 Mightform Harmonizer
2 Temple Garden
3 Escape Tunnel
2 Lumbering Worldwagon
4 Sazh's Chocobo
3 Ba Sing Se
4 Llanowar Elves
1 Keen-Eyed Curator
4 Badgermole Cub
4 Fabled Passage
7 Forest
2 Bushwhack
4 Erode
4 Hushwood Verge
2 Dyadrine, Synthesis Amalgam
1 Mossborn Hydra
1 Icetill Explorer`) },
      ],
    },
    {
      id: 'le', event: 'Pro Tour Lorwyn Eclipsed', short: 'Pro Tour Lorwyn Eclipsed', where: 'Richmond, Virginia', when: 'February 2026', score: '3–2',
      story: 'The first Pro Tour of 2026. Christoffer Larsen squeaked into the Top 8 in eighth place, then went to a fifth game in every match on Sunday. In the final his Dimir Excruciator beat Toni Portolan’s Temur Harmonizer 3–2, a matchup nobody had predicted.',
      link: { url: 'https://magic.gg/news/the-finals-of-pro-tour-lorwyn-eclipsed', label: 'magic.gg' },
      decks: [
        { id: 'le-larsen', player: 'Christoffer Larsen', from: 'Denmark', archetype: 'Dimir Excruciator', arch: 'control', won: true, face: 'Doomsday Excruciator',
          goal: 'Win as Larsen did. He took the final 3–2.',
          plan: 'Removal and card draw, then something huge. Superior Spider-Man can enter as a copy of Doomsday Excruciator from a graveyard, which cuts both libraries down to six cards, so the opponent runs out of cards first.',
          main: L(`4 Deceit
3 Doomsday Excruciator
3 Harvester of Misery
4 Superior Spider-Man
2 Deadly Cover-Up
3 Insatiable Avarice
2 Intimidation Tactics
3 Stock Up
2 Winternight Stories
1 Archenemy's Charm
3 Bitter Triumph
4 Requiting Hex
4 Gloomlake Verge
2 Multiversal Passage
4 Restless Reef
11 Swamp
1 Undercity Sewers
4 Watery Grave`) },
        { id: 'le-portolan', player: 'Toni Portolan', from: 'Croatia', archetype: 'Temur Harmonizer', arch: 'midrange', won: false, face: 'Icetill Explorer',
          goal: 'Win for Portolan, who lost 2–3.',
          plan: 'Cheap counters and burn, plus a landfall engine. Icetill Explorer plays extra lands from the graveyard, and Mightform Harmonizer turns each land drop into double power for an attacker.',
          main: L(`1 Willowrush Verge
2 Earthbender Ascension
1 Thunder Magic
2 Forest
2 Spider-Sense
3 Burst Lightning
3 Starting Town
4 Consult the Star Charts
1 Wistfulness
1 Analyze the Pollen
3 Icetill Explorer
4 Fabled Passage
3 Island
3 Mountain
2 Spell Snare
2 Thornspire Verge
1 Into the Flood Maw
3 Sear
2 Ba Sing Se
4 Mightform Harmonizer
4 Stock Up
3 Escape Tunnel
2 Steam Vents
4 Full Bore`) },
      ],
    },
    {
      id: 'w31', event: 'Magic World Championship 31', short: 'Worlds 31', where: 'Bellevue, Washington', when: 'December 2025', score: '3–0',
      story: 'Izzet Lessons was the most-played deck at the event and one of the best, and it took both seats in the final. Seth Manfield had started the weekend 0–2, but he didn’t lose a single game in the Top 8. His 3–0 win over Akira Shibata made him only the third player to win two World Championships.',
      link: { url: 'https://magic.gg/news/finals-of-magic-world-championship-31', label: 'magic.gg' },
      decks: [
        { id: 'w31-manfield', player: 'Seth Manfield', from: 'United States', archetype: 'Izzet Lessons', arch: 'control', won: true, face: 'Gran-Gran',
          goal: 'Win the mirror as Manfield did. He swept it 3–0.',
          plan: 'Lessons fill the graveyard and power up Combustion Technique, Accumulate Wisdom and Gran-Gran. Monument to Endurance and Artist’s Talent turn every discarded card into a card, a Treasure or 3 life lost for the opponent.',
          main: L(`7 Island
4 Gran-Gran
4 Stormchaser's Talent
3 Boomerang Basics
1 Agna Qel'a
4 Combustion Technique
2 Mountain
3 Iroh's Demonstration
4 Multiversal Passage
4 Firebending Lesson
4 Monument to Endurance
4 Accumulate Wisdom
3 Abandon Attachments
4 Riverpyre Verge
1 It'll Quench Ya!
4 Artist's Talent
4 Spirebluff Canal`) },
        { id: 'w31-shibata', player: 'Akira Shibata', from: 'Japan', archetype: 'Izzet Lessons', arch: 'control', won: false, face: "Stormchaser's Talent",
          goal: 'Win the mirror for Shibata. He lost 0–3.',
          plan: 'Izzet Lessons with an extra Boomerang Basics, two Opts, Torch the Tower and a Roaring Furnace in place of some Lessons.',
          main: L(`2 Opt
6 Island
4 Stormchaser's Talent
1 Torch the Tower
4 Boomerang Basics
1 Agna Qel'a
1 Roaring Furnace // Steaming Sauna
4 Combustion Technique
2 Mountain
1 Iroh's Demonstration
3 Firebending Lesson
4 Multiversal Passage
4 Monument to Endurance
2 Abandon Attachments
4 Accumulate Wisdom
2 It'll Quench Ya!
4 Riverpyre Verge
4 Artist's Talent
4 Spirebluff Canal
3 Gran-Gran`) },
      ],
    },
  ];
  const byId = new Map(FINALS.flatMap((f) => f.decks.map((d) => [d.id, { f, d }])));
  // The deck's name in the Arena: "Schütz’s Izzet Mission"
  const surname = (p) => p.split(' ').slice(-1)[0];
  const deckName = (d) => `${surname(d.player)}’s ${d.archetype}`;
  const rival = (id) => { const x = byId.get(id); return x ? x.f.decks.find((y) => y.id !== id) : null; };
  return { FINALS, byId, deckName, rival, surname };
});
