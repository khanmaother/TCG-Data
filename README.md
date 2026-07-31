# TCG-Data

Local card data and image assets for TCG-Frontend. Each game lives under its own folder (`palworld/`, `riftbound/`, …) with a matching scraper in `scripts/`.

## Layout

```
TCG-Data/
  scripts/
    palworld/fetch.mjs
    riftbound/fetch.mjs
  palworld/
    data/{setCode}.json
    images/{setCode}/full|thumbs/
  riftbound/
    data/{groupId}.json
    images/{groupId}/{productId}.jpg
```

---

## Palworld (set codes)

**Source:** [palworldtcg.gg](https://palworldtcg.gg) public API (`/api/v1/sets`).

| Concern | Palworld |
| --- | --- |
| Identity | Official set codes (`BP01`, `TD01`) |
| Data files | `palworld/data/{setCode}.json` |
| Card images | `palworld/images/{setCode}/full/` and `thumbs/` |
| CLI | `node scripts/palworld/fetch.mjs TD01` |

```bash
node scripts/palworld/fetch.mjs TD01 BP01
node scripts/palworld/fetch.mjs
```

Details: [scripts/palworld/README.md](scripts/palworld/README.md)

---

## Riftbound (groupId + productId)

**Source:** [tcgcsv.com](https://tcgcsv.com/) mirror of TCGplayer category `89`.

| Concern | Riftbound |
| --- | --- |
| Identity | TCGplayer `groupId` (set) + `productId` (card/SKU) |
| Data files | `riftbound/data/{groupId}.json` |
| Images | `riftbound/images/{groupId}/{productId}.jpg` |
| CLI | `node scripts/riftbound/fetch.mjs 24344` or `OGN` |

There is **no** `images/product/` folder. Cards and sealed products share the same `{groupId}/{productId}.jpg` layout.

```bash
node scripts/riftbound/fetch.mjs --sync-config
node scripts/riftbound/fetch.mjs 24344
node scripts/riftbound/fetch.mjs OGN VEN
```

Details: [scripts/riftbound/README.md](scripts/riftbound/README.md)

---

## Why the difference?

| | Palworld | Riftbound |
| --- | --- | --- |
| Upstream | Fan / official-style set API | TCGplayer catalog via tcgcsv |
| Stable ID | Set code string | Numeric group + product IDs |
| File naming | Matches API codes | Matches TCGplayer IDs |
