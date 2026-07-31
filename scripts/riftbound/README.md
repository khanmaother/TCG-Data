# Riftbound TCG data scraper

Fetches set JSON, market prices, and card/product images for **Riftbound** (League of Legends TCG) from [tcgcsv.com](https://tcgcsv.com/) (TCGplayer category `89`).

API docs: [tcgcsv.com/docs](https://tcgcsv.com/docs)  
Groups list: [tcgcsv.com/tcgplayer/89/groups](https://tcgcsv.com/tcgplayer/89/groups)

## Layout

Files are keyed by **TCGplayer IDs**, not set abbreviations:

```
TCG-Data/
  scripts/riftbound/
    fetch.mjs
    config.mjs          # category id + SETS (groupId + abbreviation labels)
    card-template.mjs
  riftbound/
    data/{groupId}.json           # e.g. 24344.json (Origins / OGN)
    data/groups.json              # raw groups snapshot (--sync-config)
    images/{groupId}/full/{productId}.jpg
    images/product/{productId}.jpg
```

Abbreviations (`OGN`, `VEN`, …) remain in the JSON payload `data.code` and in `config.mjs` for human-friendly CLI args only.

## Requirements

- Node.js 18+ (built-in `fetch`)
- Outbound HTTPS to `tcgcsv.com` and `tcgplayer-cdn.tcgplayer.com`
- A `User-Agent` is required by tcgcsv ([usage guidelines](https://tcgcsv.com/docs#usage-guidelines)); the scraper sets `TCG-Project/1.0.0 (Riftbound fetcher)`

## Usage

From the **TCG-Data** repo root:

```bash
# Refresh SETS in config.mjs from the live groups API
node scripts/riftbound/fetch.mjs --sync-config

# By groupId or abbreviation
node scripts/riftbound/fetch.mjs 24344
node scripts/riftbound/fetch.mjs OGN PR
node scripts/riftbound/fetch.mjs

# JSON + prices only
node scripts/riftbound/fetch.mjs --no-images 24344
```

Existing image files are skipped on re-run. Some CDN URLs return `403`; those products are still saved in JSON.

Product packaging images prefer:

```
https://tcgplayer-cdn.tcgplayer.com/product/{productId}_in_1000x1000.jpg
```

## Output JSON shape

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
    "cards": [ /* includes productId, card_number, prices, image URLs */ ]
  }
}
```
