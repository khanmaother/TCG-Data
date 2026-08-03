# Riftbound TCG data scraper

Fetches set JSON, market prices, and product images for **Riftbound** from [tcgcsv.com](https://tcgcsv.com/) (TCGplayer category `89`).

## Layout

```
riftbound/
  data/{groupId}.json
  images/{groupId}/{productId}.jpg
  prices/{YYYYMMDD}/{groupId}.json
```

No separate `product/` folder — every SKU image lives under its set’s `groupId` directory, named by `productId`.

## Behaviour

| Asset | When it updates |
| --- | --- |
| `data/` + `images/` | Only for **new** groups (no `data/{groupId}.json` yet), unless `--force` |
| `prices/{today}/` | **Every** run, for every target group |

Groups list: [tcgcsv.com/tcgplayer/89/groups](https://tcgcsv.com/tcgplayer/89/groups)  
Prices example: [tcgcsv.com/tcgplayer/89/24343/prices](https://tcgcsv.com/tcgplayer/89/24343/prices)

Price files are named by **groupId** (e.g. `24343.json`, `24439.json`) inside a folder named with today’s date (`20260803`).

## Usage

```bash
# Typical daily run: prices for all sets; data/images only if a new group appeared
node scripts/riftbound/fetch.mjs --sync-config
node scripts/riftbound/fetch.mjs

# Prices only
node scripts/riftbound/fetch.mjs --prices-only

# Force re-download data/images for a set
node scripts/riftbound/fetch.mjs --force OGN

node scripts/riftbound/fetch.mjs --no-images
node scripts/riftbound/fetch.mjs 24344
```
