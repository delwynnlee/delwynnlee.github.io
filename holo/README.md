# Holo

Search every English Pokémon TCG card: names, types, attacks, rarities, sets and formats, with Scryfall-style search syntax. Live at `/holo/` on this site.

## Files

| File | What it is |
| --- | --- |
| `index.html` | The card browser: markup, styles and script. Edit this directly. |
| `cards.json` | Every card and set, packed small (field list at the top of `tools/build_data.py`). |
| `theme.css` | Shared by every Holo page: the dark and light themes, the header and tabs, the painted art, the glossary. |
| `ui.js` | Shared behaviour: the theme menu, keyboard shortcuts (`?`), swipe and trackpad paging, Back closing what's open. |
| `glossary.js` | Plain-English meanings of game terms (Special Conditions, damage counters, Rule Box, ACE SPEC...), underlined in card text on every page. |
| `img/` | Painted art: page heroes for both themes, the playmat, the card back, medals and empty states. Made with OpenAI's image model through OpenRouter. |
| `fonts/` | Anybody (headings, numbers) and Cabin (text), self-hosted. Both under the SIL Open Font License. |
| `icon.svg`, `icon.png` | Browser and home-screen icons. |
| `tools/build_data.py` | Rebuilds `cards.json`. |
| `arena/` | Holo Arena: battles with real cards (see below). |
| `tools/build_arena.js` | Rebuilds `arena/cards.json` from `cards.json`. |

## Where things come from

- **Card data:** [pokemon-tcg-data](https://github.com/PokemonTCG/pokemon-tcg-data), the open dataset behind pokemontcg.io. Search runs in the browser on this snapshot, so it's instant and needs no API key.
- **Pictures:** loaded live from [TCGdex](https://tcgdex.dev) (small WebP files), falling back to pokemontcg.io, then Scrydex. Each TCGdex picture is matched to its card by set, number and name at build time. If none loads, the card is drawn as a text card.
- **Prices:** fetched live from TCGdex when a card opens, with the Pokémon TCG API as a fallback.
- **Legality:** worked out at build time. Standard is regulation marks H and later (the 2026–27 format); Expanded is Black & White onwards minus the ban list. Reprints count, so an older print of a card that's been reprinted with a legal mark is legal too.

The Pokémon TCG API is scheduled to shut down on 1 March 2027 and its dataset is no longer updated for new apps. Holo keeps working after that because the card data is bundled here and pictures fall back to TCGdex. To add sets released later, the build script would need to read TCGdex's database instead.

## Arena

`/holo/arena/` plays the Pokémon TCG with today's rules: watch two AI players, play against the AI yourself (with undo, and a game in progress is saved), simulate 100 games, or take seven short lessons.

- **Cards:** build both decks from every playable card, from Standard (regulation mark H and later), or from one Scarlet & Violet or Mega Evolution set, each with ready-made decks and the generator.
- **AI:** Normal plays by rules of thumb. Hard plays its turn out on copies of the game against shuffles of the cards it can't see, tries the other choices it could make, and keeps a change only when it wins clearly more often.
- **Decks** (`#decks`): every deck with its strategy and key cards, the type and Trainer mix, and the list to copy into Pokémon TCG Live.
- **Career** (`#career`): Victory Road, eight battles from the first Gym to your rival, with a pack of new cards after each win.
- **Famous finals** (`#finals`): the 2025 and 2026 World Championship finals with both finalists' decks as registered.
- **Journal** (`#journal`): every game against the AI, with win rates, streaks, your best decks and records.

| File | What it is |
| --- | --- |
| `arena/index.html` | Markup and styles. |
| `arena/app.js` | The page: lobby, replays, playing, lessons. Draws what the engine records. |
| `arena/engine.js` | The rules and the AI. Seeded and synchronous; runs the same in the browser and in Node. |
| `arena/compile.js` | Reads each card's text into effects the engine can run. Cards it can't read are left out of the pool. |
| `arena/decks.js` | Eleven 60-card decks designed by Claude, with their plans and key cards. |
| `arena/tutorial.js` | The lessons: fixed boards and the moves the coach asks for. |
| `arena/career.js` | Victory Road: the stages, the partners and the reward packs. |
| `arena/finals.js` | Famous finals: the events, the stories and both finalists' decks, card for card. |
| `arena/journal.js` | The journal's records and statistics, from the games you've finished. |
| `arena/cards.json` | The playable pool (Scarlet & Violet and Mega Evolution), one representative print per card, with Standard legality and the cards of each set. |

A human's choices are stored as a list of answers; the page replays the game from its seed with those answers whenever one is added, which keeps the AI's decisions identical and makes undo free.

```sh
node holo/tools/build_arena.js            # rebuild arena/cards.json
node holo/tools/build_arena.js --report   # also list the card text the compiler can't read yet
```

## Refreshing the data

```sh
python3 holo/tools/build_data.py
```

This downloads the dataset (cached in `/tmp/holo-src`; delete that folder for a fresh copy), writes `cards.json`, and bumps the `cards.json?v=` version in `index.html` so browsers fetch the new file.

Unofficial fan project. Pokémon and all card images are © Nintendo, Creatures, GAME FREAK and The Pokémon Company.
