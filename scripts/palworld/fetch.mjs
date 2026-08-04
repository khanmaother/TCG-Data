#!/usr/bin/env node
/**
 * Fetch Palworld TCG set JSON + card images from palworldtcg.gg
 *
 * Always refreshes the groups/sets snapshot:
 *   palworld/data/groups.json   # from GET /api/v1/sets
 *
 * Data / images — only for **new** or incomplete sets:
 *   palworld/data/{code}.json   # set payload with per-card detail from /cards/{slug}
 *   palworld/images/{code}/full/
 *   palworld/images/{code}/thumbs/
 *
 * Sources:
 *   https://palworldtcg.gg/api/v1/sets
 *   https://palworldtcg.gg/api/v1/sets/{code}
 *   https://palworldtcg.gg/api/v1/cards/{slug}
 *
 * Usage (from TCG-Data repo root):
 *   node scripts/palworld/fetch.mjs
 *   node scripts/palworld/fetch.mjs TD01 BP01
 *   node scripts/palworld/fetch.mjs --force BP01
 *   node scripts/palworld/fetch.mjs --no-images
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BASE = "https://palworldtcg.gg";
const SETS_API = `${BASE}/api/v1/sets`;
const CARDS_API = `${BASE}/api/v1/cards`;
/** Parallel detail fetches per set (keep polite to the public API). */
const DETAIL_CONCURRENCY = 8;

/** Official English product codes → palworldtcg.gg set codes */
const SET_ALIASES = {
  ETD01: "TD01",
  ETD02: "TD02",
  EBP01: "BP01",
  EBP02: "BP02",
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../..");
const DATA_ROOT = path.join(REPO_ROOT, "palworld");
const DATA_DIR = path.join(DATA_ROOT, "data");
const IMAGES_DIR = path.join(DATA_ROOT, "images");
const GROUPS_PATH = path.join(DATA_DIR, "groups.json");

function resolveSetCode(input) {
  const raw = String(input || "").trim().toUpperCase();
  return SET_ALIASES[raw] || raw;
}

function setDataPath(code) {
  return path.join(DATA_DIR, `${code}.json`);
}

/** Detail endpoint adds fields like effect_text / set_code beyond the set listing. */
function isDetailedCard(card) {
  return Boolean(card && typeof card === "object" && ("effect_text" in card || "set_code" in card));
}

/**
 * A set counts as pulled when local JSON has cards and each card is the detailed
 * /cards/{slug} shape. Empty stubs and summary-only files are re-fetched.
 */
function hasExistingSetData(code) {
  const filePath = setDataPath(code);
  if (!fs.existsSync(filePath)) return false;
  try {
    const body = JSON.parse(fs.readFileSync(filePath, "utf8"));
    const cards = body?.data?.cards ?? body?.cards ?? [];
    return Array.isArray(cards) && cards.length > 0 && cards.every(isDetailedCard);
  } catch {
    return false;
  }
}

/**
 * Run `fn` over items with a fixed concurrency limit; preserves order.
 * @template T, R
 * @param {T[]} items
 * @param {number} concurrency
 * @param {(item: T, index: number) => Promise<R>} fn
 * @returns {Promise<R[]>}
 */
async function mapPool(items, concurrency, fn) {
  const results = new Array(items.length);
  let next = 0;

  async function worker() {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index], index);
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    () => worker(),
  );
  await Promise.all(workers);
  return results;
}

function resolveUrl(url) {
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  return `${BASE}${url.startsWith("/") ? "" : "/"}${url}`;
}

function extFromUrl(url, fallback = ".png") {
  try {
    const pathname = new URL(url).pathname;
    const ext = path.extname(pathname);
    return ext || fallback;
  } catch {
    return fallback;
  }
}

function safeFilename(card, url, fallbackExt) {
  const base = (card.card_number || card.slug || "unknown")
    .replace(/[<>:"/\\|?*]/g, "_")
    .trim();
  return `${base}${extFromUrl(url, fallbackExt)}`;
}

async function ensureDirs() {
  await fs.promises.mkdir(DATA_DIR, { recursive: true });
  await fs.promises.mkdir(IMAGES_DIR, { recursive: true });
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`GET ${url} -> ${res.status} ${res.statusText}`);
  }
  return res.json();
}

async function downloadFile(url, destPath) {
  if (fs.existsSync(destPath)) {
    return "skipped";
  }
  await fs.promises.mkdir(path.dirname(destPath), { recursive: true });
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`GET ${url} -> ${res.status} ${res.statusText}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  await fs.promises.writeFile(destPath, buf);
  return "downloaded";
}

/**
 * Pull the live sets list and write palworld/data/groups.json.
 * Source: https://palworldtcg.gg/api/v1/sets
 */
async function fetchGroupsFile() {
  console.log(`Fetching groups… ${SETS_API}`);
  const body = await fetchJson(SETS_API);
  const sets = body.data ?? body;
  if (!Array.isArray(sets) || sets.length === 0) {
    throw new Error("No sets returned from palworldtcg.gg /api/v1/sets");
  }

  await fs.promises.writeFile(
    GROUPS_PATH,
    JSON.stringify(body, null, 2),
    "utf8",
  );
  console.log(
    `Saved ${path.relative(REPO_ROOT, GROUPS_PATH)} (${sets.length} sets)`,
  );

  for (const s of sets) {
    const code = s.code || "?";
    const existing = hasExistingSetData(code) ? "have" : "NEW ";
    console.log(
      `  [${existing}] ${String(code).padEnd(6)}  ${s.name ?? ""}`,
    );
  }

  return { body, sets };
}

/**
 * Replace each set-listing card with GET /api/v1/cards/{slug} detail.
 * Falls back to the listing object if a detail fetch fails.
 */
async function enrichCardsWithDetails(cards) {
  let enriched = 0;
  let failed = 0;
  let skipped = 0;

  const detailed = await mapPool(cards, DETAIL_CONCURRENCY, async (card) => {
    const slug = card?.slug;
    if (!slug) {
      skipped++;
      return card;
    }
    try {
      const body = await fetchJson(`${CARDS_API}/${encodeURIComponent(slug)}`);
      const detail = body.data ?? body;
      if (!detail || typeof detail !== "object") {
        throw new Error("unexpected card detail shape");
      }
      enriched++;
      return detail;
    } catch (err) {
      failed++;
      console.error(`  detail fail ${slug}: ${err.message}`);
      return card;
    }
  });

  return { cards: detailed, enriched, failed, skipped };
}

async function fetchSet(code, { downloadImages }) {
  console.log(`  data/images for set ${code}…`);
  const body = await fetchJson(`${SETS_API}/${encodeURIComponent(code)}`);
  const setData = body.data ?? body;
  const listingCards = setData.cards ?? [];

  console.log(
    `  enriching ${listingCards.length} cards via /api/v1/cards/{slug}…`,
  );
  const {
    cards,
    enriched,
    failed: detailFailed,
    skipped: detailSkipped,
  } = await enrichCardsWithDetails(listingCards);

  if (body.data) {
    body.data.cards = cards;
  } else {
    body.cards = cards;
  }

  const jsonPath = setDataPath(code);
  const jsonText = JSON.stringify(body, null, 2);
  await fs.promises.writeFile(jsonPath, jsonText, "utf8");
  console.log(
    `  saved ${path.relative(REPO_ROOT, jsonPath)} (${jsonText.length} bytes, ${cards.length} cards; detail +${enriched} / fail ${detailFailed} / no-slug ${detailSkipped})`,
  );
  if (cards.length === 0) {
    console.log(
      `  note: 0 cards — will re-try on next run until the API publishes card data`,
    );
  }

  let fullDl = 0;
  let fullSkip = 0;
  let thumbDl = 0;
  let thumbSkip = 0;
  let errors = 0;

  if (downloadImages) {
    const fullDir = path.join(IMAGES_DIR, code, "full");
    const thumbsDir = path.join(IMAGES_DIR, code, "thumbs");
    await fs.promises.mkdir(fullDir, { recursive: true });
    await fs.promises.mkdir(thumbsDir, { recursive: true });

    for (const card of cards) {
      const imageUrl = resolveUrl(card.image_url);
      const thumbUrl = resolveUrl(card.thumbnail_url);

      if (imageUrl) {
        const dest = path.join(fullDir, safeFilename(card, imageUrl, ".png"));
        try {
          const status = await downloadFile(imageUrl, dest);
          if (status === "downloaded") fullDl++;
          else fullSkip++;
        } catch (err) {
          errors++;
          console.error(`  full fail ${card.card_number || card.slug}: ${err.message}`);
        }
      }

      if (thumbUrl) {
        const dest = path.join(thumbsDir, safeFilename(card, thumbUrl, ".webp"));
        try {
          const status = await downloadFile(thumbUrl, dest);
          if (status === "downloaded") thumbDl++;
          else thumbSkip++;
        } catch (err) {
          errors++;
          console.error(`  thumb fail ${card.card_number || card.slug}: ${err.message}`);
        }
      }
    }

    console.log(
      `  images: full +${fullDl} / skip ${fullSkip}; thumbs +${thumbDl} / skip ${thumbSkip}; errors ${errors}`,
    );
  } else {
    console.log("  images: skipped (--no-images)");
  }

  return {
    code,
    cards: cards.length,
    jsonBytes: jsonText.length,
    enriched,
    detailFailed,
    fullDl,
    fullSkip,
    thumbDl,
    thumbSkip,
    errors,
  };
}

function printUsage() {
  console.log(`Usage:
  node scripts/palworld/fetch.mjs [options] [SET...]

Default behaviour:
  • Always refresh palworld/data/groups.json from /api/v1/sets
  • Data + images for sets that are missing, empty, or still summary-only
    (each card is replaced with GET /api/v1/cards/{slug} detail)

Options:
  --force       Re-fetch data/images even when detailed set JSON already exists
  --no-images   Skip image downloads when fetching new/forced sets
  --help        Show this help

SET may be an API code (TD01, BP01) or English product alias (ETD01 → TD01).
With no SET args, all sets from the groups API are considered.

Layout:
  palworld/data/groups.json
  palworld/data/{code}.json
  palworld/images/{code}/full/
  palworld/images/{code}/thumbs/
`);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    printUsage();
    return;
  }

  await ensureDirs();

  const forceData = args.includes("--force");
  const downloadImages = !args.includes("--no-images");
  const setArgs = args.filter((a) => !a.startsWith("--"));

  const { sets: apiSets } = await fetchGroupsFile();
  const allCodes = apiSets.map((s) => s.code).filter(Boolean);

  let targets;
  if (setArgs.length === 0) {
    console.log("No set codes given; considering all sets from groups API…");
    targets = allCodes;
  } else {
    targets = [];
    for (const input of setArgs) {
      const code = resolveSetCode(input);
      if (code !== String(input).trim().toUpperCase()) {
        console.log(`Alias ${String(input).trim().toUpperCase()} → ${code}`);
      }
      if (!allCodes.includes(code)) {
        console.warn(
          `Warning: ${code} not in groups API (known: ${allCodes.join(", ")}); will still try to fetch`,
        );
      }
      targets.push(code);
    }
  }

  console.log(`Sets: ${targets.join(", ")}`);
  if (forceData) {
    console.log("Mode: force data/images");
  } else {
    console.log("Mode: missing / empty / summary-only sets for data/images");
  }

  const results = [];
  const skipped = [];

  for (const code of targets) {
    console.log(`\n=== ${code} ===`);
    if (!forceData && hasExistingSetData(code)) {
      console.log(
        `  skip data/images (already have detailed ${path.relative(REPO_ROOT, setDataPath(code))})`,
      );
      skipped.push(code);
      continue;
    }
    results.push(await fetchSet(code, { downloadImages }));
  }

  console.log("\nDone.");
  if (skipped.length) {
    console.log(`Skipped (already detailed): ${skipped.join(", ")}`);
  }
  for (const r of results) {
    console.log(
      `  ${r.code}: ${r.cards} cards (detail ${r.enriched}, fail ${r.detailFailed}), json ${r.jsonBytes} B, full ${r.fullDl}+${r.fullSkip}skip, thumbs ${r.thumbDl}+${r.thumbSkip}skip`,
    );
  }
  if (results.length === 0 && skipped.length > 0) {
    console.log("No sets needed pulling.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
