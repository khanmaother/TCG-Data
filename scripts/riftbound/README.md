# Riftbound TCG data scraper

Fetches set JSON, market prices, and card images for **Riftbound** (League of Legends TCG) from [tcgcsv.com](https://tcgcsv.com/) (TCGplayer category `89`).

API docs: [tcgcsv.com/docs](https://tcgcsv.com/docs)  
Groups list: [tcgcsv.com/tcgplayer/89/groups](https://tcgcsv.com/tcgplayer/89/groups)

## Layout

```
database/
  scripts/riftbound/
    fetch.mjs           # scraper (Node 18+, no deps)
    config.mjs          # category id + SETS list
    card-template.mjs   # normalized card shape + product mapping
  riftbound/
    data/{ABBR}.json    # normalized set + cards (+ prices)
    data/groups.json    # raw groups snapshot (after --sync-config)
    images/{ABBR}/
      full/             # downloaded product images
```

## Requirements

- Node.js 18+ (built-in `fetch`)
- Outbound HTTPS to `tcgcsv.com` and `tcgplayer-cdn.tcgplayer.com`
- A `User-Agent` is required by tcgcsv ([usage guidelines](https://tcgcsv.com/docs#usage-guidelines)); the scraper sets `TCG-Project/1.0.0 (Riftbound fetcher)`

## Usage

From the **TCG-Project** repo root:

```bash
# Refresh SETS in config.mjs from the live groups API
node database/scripts/riftbound/fetch.mjs --sync-config

# One or more sets (abbreviation, groupId, or name)
node database/scripts/riftbound/fetch.mjs OGN
node database/scripts/riftbound/fetch.mjs OGN PR
node database/scripts/riftbound/fetch.mjs 24344

# All sets listed in config.mjs
node database/scripts/riftbound/fetch.mjs

# JSON + prices only (skip image downloads)
node database/scripts/riftbound/fetch.mjs --no-images OGN
```

Existing image files are skipped on re-run. Some TCGplayer CDN URLs return `403` (tokens / missing art); those products are still saved in JSON.

## Config sets

`database/scripts/riftbound/config.mjs` holds the known sets (`VEN`, `UNL`, `SFD`, `OGN`, …). Prefer `--sync-config` when new Riftbound expansions appear on tcgcsv instead of editing by hand.

## Output JSON shape

Each `data/{ABBR}.json` file looks like:

```json
{
  "data": {
    "code": "OGN",
    "name": "Origins",
    "groupId": 24344,
    "release_date": "2025-10-31",
    "card_count": 365,
    "source": "tcgcsv",
    "categoryId": 89,
    "cards": [ /* normalized cards */ ]
  }
}
```

Card fields include `productId`, `card_number`, `name`, `card_type`, `rarity`, `domain`, `tags`, costs/might, `description`, image URLs, and `prices` keyed by print subtype (`Normal`, `Foil`, …).
