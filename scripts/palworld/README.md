# Palworld TCG data scraper

Fetches set JSON and card images from [palworldtcg.gg](https://palworldtcg.gg).

## Layout

```
database/palworld/
  fetch.mjs          # scraper (Node 18+, no deps)
  data/{CODE}.json   # full API response per set
  images/{CODE}/
    full/            # image_url
    thumbs/          # thumbnail_url
```

## Requirements

- Node.js 18+ (built-in `fetch`)

## Usage

From the **TCG-Project** repo root:

```bash
# One or more sets
node database/palworld/fetch.mjs TD01
node database/palworld/fetch.mjs TD01 BP01

# Official English product codes also work (ETD01→TD01, EBP01→BP01, …)
node database/palworld/fetch.mjs ETD01 EBP01

# All sets (GET /api/v1/sets)
node database/palworld/fetch.mjs
```

Files are saved under the API set code (`TD01`, `BP01`, …). Existing image files are skipped. Relative image URLs are resolved against `https://palworldtcg.gg`.