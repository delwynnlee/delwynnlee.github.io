#!/usr/bin/env python3
"""Build holo/cards.json, the card data Holo searches.

Each card is a positional array (trailing empty fields are dropped):
  0 set index  1 number  2 name  3 kind (0 Pokémon, 1 Trainer, 2 Energy)  4 subtypes [S]  5 HP  6 types (letters)
  7 evolves from  8 abilities [[name T, text T, kind]]  9 attacks [[name T, cost letters, damage, text T]]
  10 weaknesses  11 resistances  12 retreat  13 rules [T]  14 artist A  15 rarity R  16 flavour T  17 dex numbers
  18 legality bits (1 Standard, 2 Expanded, 4 banned in Expanded)  19 regulation mark  20 printing group
  21 TCGdex local id ('' = same as number, null = none)  22 overrides {i: id suffix, k: image key}  23 level  24 ancient trait
Type letters: G grass, R fire, W water, L lightning, P psychic, F fighting, D darkness, M metal, Y fairy, N dragon, C colorless.

Sources
  - Card text, sets and image links: PokemonTCG/pokemon-tcg-data (the JSON behind pokemontcg.io).
  - Backup image paths: tcgdex/cards-database (only set definitions and card file names are read).
  - Pokédex links into the site's Pokémon Browser: ../pokemon/pokemon.json, if present.

Run from anywhere:  python3 holo/tools/build_data.py
Downloads are cached in /tmp/holo-src (delete it to fetch fresh data).
"""
import collections, concurrent.futures as cf, datetime, difflib, json, os, re, subprocess, unicodedata, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
HOLO = os.path.dirname(HERE)
SITE = os.path.dirname(HOLO)
CACHE = os.environ.get('HOLO_SRC', '/tmp/holo-src')
RAW = 'https://raw.githubusercontent.com/PokemonTCG/pokemon-tcg-data/master'

# Standard: regulation marks from H on (2026-27 format, from 10 April 2026). Basic Energy is always legal.
STANDARD_FROM = 'H'
EXPANDED_FROM = '2011-04-25'                     # Black & White onwards
EXTRA_EXPANDED_BANS = {'Medicham V'}             # banned from 10 April 2026, not yet marked in the source data
TYPE = {'Grass': 'G', 'Fire': 'R', 'Water': 'W', 'Lightning': 'L', 'Psychic': 'P', 'Fighting': 'F',
        'Darkness': 'D', 'Metal': 'M', 'Fairy': 'Y', 'Dragon': 'N', 'Colorless': 'C', 'Free': ''}
ABILITY_KIND = {'Ability': 0, 'Poké-Power': 1, 'Poké-POWER': 1, 'Poké-Body': 2, 'Poké-BODY': 2, 'Pokémon Power': 3}
KIND = {'Pokémon': 0, 'Trainer': 1, 'Energy': 2}
RARITY_FIX = {'MEGA_ATTACK_RARE': 'Mega Attack Rare', 'Rare Holo ex': 'Rare Holo EX', 'Holo Rare V': 'Rare Holo V',
              'Holo Rare VMAX': 'Rare Holo VMAX', 'Holo Rare VSTAR': 'Rare Holo VSTAR'}
TCGDEX_NAME = {'svp': 'SVP Black Star Promos', 'me55c': '30th Classic Collection'}


def get(url, path):
    if not os.path.exists(path):
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with urllib.request.urlopen(url, timeout=60) as r, open(path + '.part', 'wb') as f:
            f.write(r.read())
        os.replace(path + '.part', path)
    with open(path, encoding='utf-8') as f:
        return json.load(f)


def norm(s):
    s = unicodedata.normalize('NFKD', s).encode('ascii', 'ignore').decode().lower()
    return re.sub(r'[^a-z0-9]', '', s.replace('&', 'and').replace('pokemon', ''))


def tcgdex_sets():
    """Set id -> {path, locals} for TCGdex, read from a blobless sparse clone of cards-database."""
    repo = os.path.join(CACHE, 'tcgdex')
    if not os.path.isdir(os.path.join(repo, '.git')):
        subprocess.run(['git', 'clone', '--filter=blob:none', '--no-checkout', '--depth', '1',
                        'https://github.com/tcgdex/cards-database.git', repo], check=True)
        subprocess.run(['git', '-C', repo, 'sparse-checkout', 'set', '--no-cone', '/data/*.ts', '/data/*/*.ts', '/data/*/*/*.ts'], check=True)
        subprocess.run(['git', '-C', repo, 'checkout', '-q'], check=True)
    files = subprocess.run(['git', '-C', repo, '-c', 'core.quotePath=false', 'ls-tree', '-r', '--name-only', 'HEAD'],
                           check=True, capture_output=True, text=True).stdout.splitlines()

    def field(text, key):
        m = re.search(r'\b' + key + r''':\s*(?:"([^"]+)"|'([^']+)')''', text)
        return (m.group(1) or m.group(2)) if m else None

    series, sets, local, paths = {}, [], collections.defaultdict(set), {}
    for f in files:
        p = f.split('/')
        if p[0] != 'data' or not f.endswith('.ts'):
            continue
        if len(p) == 2:
            series[p[1][:-3]] = field(open(os.path.join(repo, f), encoding='utf-8').read(), 'id')
        elif len(p) == 3:
            sets.append((p[1], p[2][:-3], open(os.path.join(repo, f), encoding='utf-8').read()))
        elif len(p) == 4:
            local[(p[1], p[2])].add(p[3][:-3])
            paths[(p[1], p[2], p[3][:-3])] = os.path.join(repo, f)
    out = []
    for serie, name, text in sets:
        out.append(dict(serie=series.get(serie), id=field(text, 'id'), en=field(text, 'en') or name,
                        date=field(text, 'releaseDate'), code=field(text, 'official'), tcgo=field(text, 'tcgOnline'),
                        locals=local[(serie, name)], files={l: paths[(serie, name, l)] for l in local[(serie, name)]}))
    return out


CARD_NAME = re.compile(r'''^([ \t]*)name:\s*\{[^}]*?\ben:\s*(?:"([^"]+)"|'([^']+)')''', re.M | re.S)


def tcgdex_name(path):
    """English card name from a TCGdex card file (the least-indented `name`, so not an attack's)."""
    try:
        found = [(len(m.group(1).expandtabs(4)), m.group(2) or m.group(3)) for m in CARD_NAME.finditer(open(path, encoding='utf-8').read())]
    except OSError:
        return None
    return min(found)[1] if found else None


def same_card(a, b):
    a, b = norm(a), norm(b or '')
    return bool(b) and (a == b or a in b or b in a or difflib.SequenceMatcher(None, a, b).ratio() >= .8)


def match_local(num, locals_):
    if num in locals_:
        return num
    if num.isdigit():
        for w in (2, 3):
            if num.zfill(w) in locals_:
                return num.zfill(w)
    m = re.match(r'^([A-Za-z]+)(\d+)([a-z]?)$', num)
    if m:
        for w in (2, 3):
            z = m.group(1) + m.group(2).zfill(w) + m.group(3)
            if z in locals_:
                return z
    return {x.lower(): x for x in locals_}.get(num.lower())


def main():
    sets = get(f'{RAW}/sets/en.json', f'{CACHE}/sets/en.json')
    sets.sort(key=lambda s: (s['releaseDate'], s['id']))
    with cf.ThreadPoolExecutor(12) as ex:
        per_set = list(ex.map(lambda s: get(f"{RAW}/cards/en/{s['id']}.json", f"{CACHE}/cards/{s['id']}.json"), sets))

    # TCGdex backup image paths
    td = tcgdex_sets()
    by_name = collections.defaultdict(list)
    for s in td:
        by_name[norm(s['en'])].append(s)
    td_for = {}
    for s in sets:
        if s['id'] in TCGDEX_NAME:
            c = [t for t in td if t['en'] == TCGDEX_NAME[s['id']]]
        else:
            c = by_name.get(norm(s['name'])) or [t for t in td if s.get('ptcgoCode') and s['ptcgoCode'] in (t['code'], t['tcgo'])]
        if c:
            year = int(s['releaseDate'][:4])
            td_for[s['id']] = min(c, key=lambda t: abs(int((t['date'] or '0')[:4]) - year))

    # string tables
    tables = {k: {} for k in 'TSRA'}
    lists = {k: [] for k in 'TSRA'}

    def ix(k, s):
        if s is None or s == '':
            return -1
        t = tables[k]
        if s not in t:
            t[s] = len(lists[k])
            lists[k].append(s)
        return t[s]

    set_rows, cards = [], []
    for si, (s, cs) in enumerate(zip(sets, per_set)):
        scry = 'scrydex.com' in s['images'].get('logo', '') + s['images'].get('symbol', '')
        t = td_for.get(s['id'])
        set_rows.append(dict(id=s['id'], name=s['name'], series=s['series'], printed=s.get('printedTotal'),
                             total=s.get('total'), code=s.get('ptcgoCode', ''), date=s['releaseDate'].replace('/', '-'),
                             img='s' if scry else 'p', td=f"en/{t['serie']}/{t['id']}" if t else None,
                             exp=s.get('legalities', {}).get('expanded') == 'Legal'))
        for c in cs:
            c['_si'], c['_set'], c['_td'] = si, s, t
            cards.append(c)

    # functional groups: printings of the same card (drives "other printings" and legality by reprint)
    def gkey(c):
        if c['supertype'] != 'Pokémon':
            return (c['supertype'], norm(c['name']))
        return ('P', norm(c['name']), c.get('hp', ''), tuple(norm(a['name']) for a in c.get('abilities', [])),
                tuple((norm(a['name']), a.get('damage', '')) for a in c.get('attacks', [])))
    groups = collections.defaultdict(list)
    for c in cards:
        groups[gkey(c)].append(c)
    gid = {}
    for n, (k, members) in enumerate(groups.items()):
        basic_energy = members[0]['supertype'] == 'Energy' and 'Basic' in (members[0].get('subtypes') or [])
        std = basic_energy or any((m.get('regulationMark') or 'A') >= STANDARD_FROM for m in members)
        exp = basic_energy or any(m['_set']['releaseDate'].replace('/', '-') >= EXPANDED_FROM and
                                  (set_rows[m['_si']]['exp'] or m.get('regulationMark')) for m in members)
        banned = any(m.get('legalities', {}).get('expanded') == 'Banned' or m['name'] in EXTRA_EXPANDED_BANS for m in members)
        for m in members:
            gid[m['id']] = (n, (1 if std else 0) | (2 if exp and not banned else 0) | (4 if banned else 0))

    dex_ids = {}
    sp = os.path.join(SITE, 'pokemon', 'pokemon.json')
    if os.path.exists(sp):
        for p in json.load(open(sp, encoding='utf-8')):
            dex_ids[p['num']] = p['id']

    rows, used_dex, misses = [], set(), 0
    for c in cards:
        s, t = c['_set'], c['_td']
        num = c['number']
        imgkey = c['images']['small'].rsplit('/', 1)[-1][:-4] if 'pokemontcg.io' in c['images']['small'] else num
        over = {}
        if c['id'] != f"{s['id']}-{num}":
            over['i'] = c['id'][len(s['id']) + 1:]
        if imgkey != num:
            over['k'] = imgkey
        local = match_local(num, t['locals']) if t else None
        if local is not None and not same_card(c['name'], tcgdex_name(t['files'][local])):
            local = None                      # numbered differently there: never show another card's picture
        if local is None:
            misses += 1
        g, legal = gid[c['id']]
        dex = c.get('nationalPokedexNumbers') or []
        used_dex.update(dex)
        rarity = RARITY_FIX.get(c.get('rarity'), c.get('rarity'))
        trait = c.get('ancientTrait')
        row = [
            c['_si'], num, c['name'], KIND[c['supertype']],
            [ix('S', x) for x in c.get('subtypes') or []],
            int(c['hp']) if str(c.get('hp', '')).isdigit() else 0,
            ''.join(TYPE[x] for x in c.get('types') or []),
            c.get('evolvesFrom', ''),
            [[ix('T', a['name']), ix('T', a.get('text', '')), ABILITY_KIND.get(a.get('type'), 0)] for a in c.get('abilities') or []],
            [[ix('T', a['name']), ''.join(TYPE[x] for x in a.get('cost') or []), a.get('damage', ''), ix('T', a.get('text', ''))]
             for a in c.get('attacks') or []],
            [TYPE[w['type']] + w['value'] for w in c.get('weaknesses') or []],
            [TYPE[w['type']] + w['value'] for w in c.get('resistances') or []],
            c.get('convertedRetreatCost', 0),
            [ix('T', r) for r in c.get('rules') or []],
            ix('A', c.get('artist')), ix('R', rarity), ix('T', c.get('flavorText')),
            dex, legal, c.get('regulationMark', ''), g,
            None if local is None else ('' if local == num else local),
            over or 0, c.get('level', ''),
            [trait['name'], trait['text']] if trait else 0,
        ]
        while row and row[-1] in ('', 0, [], -1) and len(row) > 4:   # trim empty trailing fields
            row.pop()
        rows.append(row)

    out = dict(v=1, built=datetime.date.today().isoformat(), source='pokemon-tcg-data', sets=set_rows,
               S=lists['S'], R=lists['R'], A=lists['A'], T=lists['T'],
               dex={str(n): dex_ids[n] for n in sorted(used_dex) if n in dex_ids}, c=rows)
    for r in out['sets']:
        r.pop('exp')
    dest = os.path.join(HOLO, 'cards.json')
    with open(dest, 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, separators=(',', ':'))
    # bump the data version in index.html so browsers fetch the new file
    page = os.path.join(HOLO, 'index.html')
    if os.path.exists(page):
        html = open(page, encoding='utf-8').read()
        html = re.sub(r'cards\.json\?v=[0-9-]+', f"cards.json?v={out['built']}", html)
        open(page, 'w', encoding='utf-8').write(html)
    print(f'{len(rows)} cards, {len(set_rows)} sets, {len(groups)} distinct cards, '
          f'{misses} without a verified TCGdex picture -> {dest} ({os.path.getsize(dest) // 1024} KB)')


if __name__ == '__main__':
    main()
