# TCG-Data

Local card data and image assets for TCG-Frontend. Each game lives under its own folder (`palworld/`, `riftbound/`, …) with a matching scraper in `scripts/`.

## Layout

```
TCG-Data/
  scripts/
    palworld/fetch.mjs
    riftbound/fetch.mjs
  palworld/
    data/groups.json
    data/{setCode}.json
    images/{setCode}/full|thumbs/
  riftbound/
    data/groups.json
    data/{groupId}.json
    images/{groupId}/{productId}.jpg
    prices/{YYYYMMDD}/{groupId}.json
```

---

## Palworld (set codes)

**Source:** [palworldtcg.gg](https://palworldtcg.gg) public API (`/api/v1/sets`).

| Concern | Palworld |
| --- | --- |
| Identity | Official set codes (`BP01`, `TD01`) |
| Groups | `palworld/data/groups.json` — **every** run from [/api/v1/sets](https://palworldtcg.gg/api/v1/sets) |
| Data files | `palworld/data/{setCode}.json` — new/summary-only sets; cards enriched via `/cards/{slug}` |
| Card images | `palworld/images/{setCode}/full/` and `thumbs/` — with new sets |
| CLI | `node scripts/palworld/fetch.mjs` |

```bash
node scripts/palworld/fetch.mjs
node scripts/palworld/fetch.mjs TD01 BP01
node scripts/palworld/fetch.mjs --force BP01
```

Details: [scripts/palworld/README.md](scripts/palworld/README.md)

---

## Riftbound (groupId + productId)

**Source:** [tcgcsv.com](https://tcgcsv.com/) mirror of TCGplayer category `89`.

| Concern | Riftbound |
| --- | --- |
| Identity | TCGplayer `groupId` (set) + `productId` (card/SKU) |
| Data files | `riftbound/data/{groupId}.json` — raw tcgcsv products (extendedData intact); **new** groups only |
| Groups | `riftbound/data/groups.json` — **every** run from [/89/groups](https://tcgcsv.com/tcgplayer/89/groups) |
| Images | `riftbound/images/{groupId}/{productId}.jpg` — with new groups |
| Prices | `riftbound/prices/{YYYYMMDD}/{groupId}.json` — **every** run |
| CLI | `node scripts/riftbound/fetch.mjs` |

There is **no** `images/product/` folder. Cards and sealed products share the same `{groupId}/{productId}.jpg` layout.

```bash
# Refresh group list, then pull prices for all sets; data/images only for new groups
node scripts/riftbound/fetch.mjs --sync-config
node scripts/riftbound/fetch.mjs

node scripts/riftbound/fetch.mjs --prices-only
node scripts/riftbound/fetch.mjs --force OGN
```

Groups: [tcgcsv.com/tcgplayer/89/groups](https://tcgcsv.com/tcgplayer/89/groups) · Prices: […/89/{groupId}/prices](https://tcgcsv.com/tcgplayer/89/24343/prices)

---

## Why the difference?

| | Palworld | Riftbound |
| --- | --- | --- |
| Upstream | Fan / official-style set API | TCGplayer catalog via tcgcsv |
| Stable ID | Set code string | Numeric group + product IDs |
| File naming | Matches API codes | Matches TCGplayer IDs |
