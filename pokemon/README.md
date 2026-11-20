# Pokémon Browser

Browse all 1,025 Pokémon by type, region and base stats. Live at `/pokemon/` on this site.

## Files

| File | What it is |
| --- | --- |
| `index.html` | The whole app: markup, styles and script. Edit this directly. |
| `pokemon.json` | One Pokémon per line: stats, types, abilities, profile and evolution method. |
| `icon.png` | Home-screen icon. |
| `sw.js` | Service worker, scoped to `/pokemon/`. Saves artwork and fonts after their first view, and keeps the app working offline. |
| `tools/` | Script that regenerates `pokemon.json`. |

## Where things come from

- **Data:** [Pokémon Showdown](https://github.com/smogon/pokemon-showdown)'s species data, read with its npm package.
- **Artwork:** loaded live from [PokéAPI's sprite collection](https://github.com/PokeAPI/sprites), using the official artwork for each National Dex number. If an image fails to load, the card falls back to a stat emblem drawn from that Pokémon's base stats.
- **Type matchups:** the Gen 9 type chart, built into `index.html`.

## Refreshing the data

```sh
cd pokemon/tools
npm install
npm run build
```

To include Pokémon added after #1025, raise `LAST` in `tools/build-data.js` and update the "1,025" text in `index.html`.

Unofficial fan project. Pokémon and Pokémon character names are trademarks of Nintendo, Creatures and GAME FREAK.
