# Riftbound TCG data scraper

Fetches set JSON, market prices, and product images for **Riftbound** from [tcgcsv.com](https://tcgcsv.com/) (TCGplayer category `89`).

## Layout

```
riftbound/
  data/groups.json              # from https://tcgcsv.com/tcgplayer/89/groups
  data/{groupId}.json
  images/{groupId}/{productId}.jpg
  prices/{YYYYMMDD}/{groupId}.json   # dated snapshot
  prices/latest/{groupId}.json       # always newest pull
  prices/dates.json                  # pull dates oldest → newest
```

No separate `product/` folder — every SKU image lives under its set’s `groupId` directory, named by `productId`.

## Behaviour

| Asset | When it updates |
| --- | --- |
| `data/groups.json` | **Every** run (from [tcgcsv /89/groups](https://tcgcsv.com/tcgplayer/89/groups)) |
| Targets | **Every** run uses the live groups list (so new sets like SGN are not skipped just because `config.mjs` is stale) |
| `data/` + `images/` | Only for **new** groups (no `data/{groupId}.json` yet), unless `--force` |
| `prices/{today}/` | **Every** run, for every target group |
| `prices/latest/` | **Every** successful price pull (overwritten with newest) |
| `prices/dates.json` | **Every** run — chronological list of pull dates + `latest` |

Each `data/{groupId}.json` stores products **as returned** by tcgcsv
([`/89/{groupId}/products`](https://tcgcsv.com/tcgplayer/89/24344/products)) —
including `extendedData`, `presaleInfo`, etc. Nothing is flattened or dropped.
Market prices live only under `prices/` (separate endpoint).

`--sync-config` also rewrites `scripts/riftbound/config.mjs` SETS from that groups response.

Price files are named by **groupId** (e.g. `24343.json`, `24439.json`) inside a folder named with today’s date (`20260803`). `prices/latest/` always mirrors the newest successful pull. `prices/dates.json` lists every snapshot day in order.

## Usage

```bash
# Typical daily run: live groups → prices for all; data/images for new groups only
node scripts/riftbound/fetch.mjs

# Also rewrite scripts/riftbound/config.mjs SETS from the groups API
node scripts/riftbound/fetch.mjs --sync-config

# Prices only
node scripts/riftbound/fetch.mjs --prices-only

# Force re-download data/images for a set
node scripts/riftbound/fetch.mjs --force OGN

node scripts/riftbound/fetch.mjs --no-images
node scripts/riftbound/fetch.mjs 24344
node scripts/riftbound/fetch.mjs 24797
```
