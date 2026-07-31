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
    images/{groupId}/full/{productId}.jpg
    images/product/{productId}.jpg
```

---

## Palworld (set codes)

**Source:** [palworldtcg.gg](https://palworldtcg.gg) public API (`/api/v1/sets`).

**How it works:** The scraper requests set list / set detail endpoints and writes each response under the site’s set code (`BP01`, `TD01`, …). Card images come from `image_url` / `thumbnail_url` on each card and are saved under matching set-code folders.

| Concern | Palworld |
| --- | --- |
| Identity | Official set codes (`BP01`, `TD01`) |
| Data files | `palworld/data/{setCode}.json` |
| Card images | `palworld/images/{setCode}/full/` and `thumbs/` (named by card number) |
| CLI | `node scripts/palworld/fetch.mjs TD01` |
| Prices | Not included (site catalog only) |

Abbreviations *are* the filesystem keys because the upstream API is already organized that way.

```bash
node scripts/palworld/fetch.mjs TD01 BP01
node scripts/palworld/fetch.mjs          # all sets
```

Details: [scripts/palworld/README.md](scripts/palworld/README.md)

---

## Riftbound (groupId + productId)

**Source:** [tcgcsv.com](https://tcgcsv.com/) mirror of TCGplayer category `89` (Riftbound).

**How it works:** TCGplayer identifies expansions as **groups** (`groupId`) and each SKU/card as a **product** (`productId`). The scraper:

1. Loads groups (`/tcgplayer/89/groups`) — optional `--sync-config` rewrites `scripts/riftbound/config.mjs`
2. Fetches products + prices per group
3. Normalizes into our card JSON shape (keeps `code` abbreviation inside the payload for display)
4. Downloads card art and packaging images from `tcgplayer-cdn.tcgplayer.com`

| Concern | Riftbound |
| --- | --- |
| Identity | TCGplayer `groupId` (set) + `productId` (card/SKU) |
| Data files | `riftbound/data/{groupId}.json` (e.g. `24344.json` = Origins / OGN) |
| Card images | `riftbound/images/{groupId}/full/{productId}.jpg` |
| Product / box art | `riftbound/images/product/{productId}.jpg` |
| CLI | `node scripts/riftbound/fetch.mjs 24344` or `OGN` (abbr still works as a label) |
| Prices | Included from tcgcsv price feed |

Abbreviations (`OGN`, `VEN`, …) are **labels only** — useful in CLI and inside JSON `data.code` — not folder or filename keys.

```bash
node scripts/riftbound/fetch.mjs --sync-config
node scripts/riftbound/fetch.mjs 24344
node scripts/riftbound/fetch.mjs OGN VEN
node scripts/riftbound/fetch.mjs --no-images
```

Details: [scripts/riftbound/README.md](scripts/riftbound/README.md)

---

## Why the difference?

| | Palworld | Riftbound |
| --- | --- | --- |
| Upstream | Fan / official-style set API | TCGplayer catalog via tcgcsv |
| Stable ID | Set code string | Numeric group + product IDs |
| File naming | Matches API codes | Matches TCGplayer IDs so renames / region codes don’t break paths |

Frontend config maps human set codes (e.g. `OGN`) to the Riftbound `dataFile` (`24344.json`) while still showing abbreviations in the UI.
