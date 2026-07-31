# Riftbound TCG data scraper

Fetches set JSON, market prices, and product images for **Riftbound** from [tcgcsv.com](https://tcgcsv.com/) (TCGplayer category `89`).

## Layout

```
riftbound/
  data/{groupId}.json
  images/{groupId}/{productId}.jpg
```

No separate `product/` folder — every SKU image lives under its set’s `groupId` directory, named by `productId`.

## Usage

```bash
node scripts/riftbound/fetch.mjs --sync-config
node scripts/riftbound/fetch.mjs 24344
node scripts/riftbound/fetch.mjs OGN VEN
node scripts/riftbound/fetch.mjs --no-images
```
