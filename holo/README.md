# Holo

Search every English Pokémon TCG card: names, types, attacks, rarities, sets and formats, with Scryfall-style search syntax. Live at `/holo/` on this site.

## Files

| File | What it is |
| --- | --- |
| `index.html` | The whole app: markup, styles and script. Edit this directly. |
| `cards.json` | Every card and set, packed small (field list at the top of `tools/build_data.py`). |
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

| File | What it is |
| --- | --- |
| `arena/index.html` | Markup and styles. |
| `arena/app.js` | The page: lobby, replays, playing, lessons. Draws what the engine records. |
| `arena/engine.js` | The rules and the AI. Seeded and synchronous; runs the same in the browser and in Node. |
| `arena/compile.js` | Reads each card's text into effects the engine can run. Cards it can't read are left out of the pool. |
| `arena/decks.js` | Eleven 60-card decks designed by Claude. |
| `arena/tutorial.js` | The lessons: fixed boards and the moves the coach asks for. |
| `arena/cards.json` | The playable pool (Scarlet & Violet and Mega Evolution), one representative print per card. |

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
