# Palworld TCG data scraper

Fetches set JSON and card images from [palworldtcg.gg](https://palworldtcg.gg).

## Layout

```
TCG-Data/palworld/
  data/groups.json   # always refreshed from GET /api/v1/sets
  data/{CODE}.json   # full API response per set (new sets only)
  images/{CODE}/
    full/            # image_url
    thumbs/          # thumbnail_url
```

## Requirements

- Node.js 18+ (built-in `fetch`)

## Usage

From the **TCG-Data** repo root:

```bash
# Refresh groups.json; pull data + images only for sets not yet on disk
node scripts/palworld/fetch.mjs

# Specific sets (still refreshes groups.json; skips if data/{code}.json exists)
node scripts/palworld/fetch.mjs TD01 BP01

# Official English product codes also work (ETD01→TD01, EBP01→BP01, …)
node scripts/palworld/fetch.mjs ETD01 EBP01

# Re-fetch data/images even when set JSON already exists
node scripts/palworld/fetch.mjs --force BP01

# Skip image downloads
node scripts/palworld/fetch.mjs --no-images
```

Groups source: [https://palworldtcg.gg/api/v1/sets](https://palworldtcg.gg/api/v1/sets).

Each card in a set file is replaced with the detailed payload from
[`/api/v1/cards/{slug}`](https://palworldtcg.gg/api/v1/cards/td01-soul)
(effect text, Japanese name, durability, etc.). Summary-only local files are
re-fetched automatically.

Files are saved under the API set code (`TD01`, `BP01`, …). Existing image files are skipped on download. Relative image URLs are resolved against `https://palworldtcg.gg`.

News lives under `news/` — run `node news/script/index.mjs` (or `node news/script/index.mjs palworld`).
