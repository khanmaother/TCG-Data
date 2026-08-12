# News scripts

Fetch official TCG news listings (and images) into `news/data/` and `news/img/`.

Run all commands from the **TCG-Data** repo root.

## Commands

```bash
# All services (palworld + riftbound)
node news/script/index.mjs
node news/script/index.mjs --all

# One service
node news/script/index.mjs palworld
node news/script/index.mjs riftbound

# Same via flag
node news/script/index.mjs --service palworld
node news/script/index.mjs --service riftbound

# Palworld only: limit archive pages walked (default 50)
node news/script/index.mjs palworld --max-pages 5

# Help
node news/script/index.mjs --help
```

You can also run a service script directly:

```bash
node news/script/palworld.mjs
node news/script/riftbound.mjs
```

## Output

| Service   | Data                         | Images                |
| --------- | ---------------------------- | --------------------- |
| palworld  | `news/data/palworld.json`    | `news/img/palworld/`  |
| riftbound | `news/data/riftbound.json`   | `news/img/riftbound/` |

Existing image files are skipped on re-run.
