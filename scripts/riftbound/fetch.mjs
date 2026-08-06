#!/usr/bin/env node
/**
 * Fetch Riftbound TCG set JSON + product images from tcgcsv.com (TCGplayer mirror).
 *
 * Data / images — only for **new** groups (no existing `data/{groupId}.json`):
 *   riftbound/data/groups.json            # always refreshed from /89/groups
 *   riftbound/data/{groupId}.json         # raw tcgcsv products (extendedData intact)
 *   riftbound/images/{groupId}/{productId}.jpg
 *
 * Prices — **always** refreshed for every group into a dated snapshot folder,
 * a rolling “latest” copy, and a chronological pull-date index:
 *   riftbound/prices/{YYYYMMDD}/{groupId}.json
 *   riftbound/prices/latest/{groupId}.json
 *   riftbound/prices/dates.json
 *
 * Sources:
 *   https://tcgcsv.com/tcgplayer/89/groups
 *   https://tcgcsv.com/tcgplayer/89/{groupId}/products
 *   https://tcgcsv.com/tcgplayer/89/{groupId}/prices
 *
 * Product items are saved exactly as returned by tcgcsv (no flatten / drop).
 *
 * Usage (from TCG-Data repo root):
 *   node scripts/riftbound/fetch.mjs
 *   node scripts/riftbound/fetch.mjs --sync-config
 *   node scripts/riftbound/fetch.mjs --force OGN          # re-fetch data/images
 *   node scripts/riftbound/fetch.mjs --prices-only
 *   node scripts/riftbound/fetch.mjs --no-images
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { extendedValue, productImageUrls, upgradeImageUrl, asStoredProduct } from "./card-template.mjs";
import {
  SETS,
  USER_AGENT,
  groupsUrl,
  pricesUrl,
  productsUrl,
  resolveSet,
} from "./config.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../..");
const DATA_ROOT = path.join(REPO_ROOT, "riftbound");
const DATA_DIR = path.join(DATA_ROOT, "data");
const IMAGES_DIR = path.join(DATA_ROOT, "images");
const PRICES_DIR = path.join(DATA_ROOT, "prices");
const PRICES_LATEST_DIR = path.join(PRICES_DIR, "latest");
const PRICES_DATES_PATH = path.join(PRICES_DIR, "dates.json");
const CONFIG_PATH = path.join(__dirname, "config.mjs");

async function ensureDirs() {
  await fs.promises.mkdir(DATA_DIR, { recursive: true });
  await fs.promises.mkdir(IMAGES_DIR, { recursive: true });
  await fs.promises.mkdir(PRICES_DIR, { recursive: true });
  await fs.promises.mkdir(PRICES_LATEST_DIR, { recursive: true });
}

function todayStamp(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

function setDataPath(groupId) {
  return path.join(DATA_DIR, `${groupId}.json`);
}

function hasExistingSetData(groupId) {
  return fs.existsSync(setDataPath(groupId));
}

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "application/json",
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `GET ${url} -> ${res.status} ${res.statusText}${text ? `: ${text.slice(0, 200)}` : ""}`,
    );
  }
  return res.json();
}

function extFromUrl(url, fallback = ".jpg") {
  try {
    const pathname = new URL(url).pathname;
    const ext = path.extname(pathname);
    return ext || fallback;
  } catch {
    return fallback;
  }
}

async function downloadFile(url, destPath) {
  if (fs.existsSync(destPath)) return "skipped";
  await fs.promises.mkdir(path.dirname(destPath), { recursive: true });
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
  });
  if (!res.ok) {
    throw new Error(`GET ${url} -> ${res.status} ${res.statusText}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  await fs.promises.writeFile(destPath, buf);
  return "downloaded";
}

function publishedDate(iso) {
  if (!iso) return "";
  return String(iso).slice(0, 10);
}

/**
 * Pull the live groups list and write riftbound/data/groups.json.
 * Source: https://tcgcsv.com/tcgplayer/89/groups
 * @returns {Promise<{ body: object, sets: import("./config.mjs").RiftboundSetConfig[] }>}
 */
async function fetchGroupsFile() {
  const url = groupsUrl();
  console.log(`Fetching groups… ${url}`);
  const body = await fetchJson(url);
  const results = body.results ?? [];
  if (!Array.isArray(results) || results.length === 0) {
    throw new Error("No groups returned from tcgcsv");
  }

  const groupsPath = path.join(DATA_DIR, "groups.json");
  await fs.promises.mkdir(DATA_DIR, { recursive: true });
  await fs.promises.writeFile(
    groupsPath,
    JSON.stringify(body, null, 2),
    "utf8",
  );
  console.log(
    `Saved ${path.relative(REPO_ROOT, groupsPath)} (${results.length} groups)`,
  );

  const sets = results.map((g) => ({
    groupId: g.groupId,
    abbreviation: g.abbreviation || String(g.groupId),
    name: g.name,
    publishedOn: publishedDate(g.publishedOn),
    isSupplemental: Boolean(g.isSupplemental),
  }));

  return { body, sets };
}

/**
 * Rewrite SETS in config.mjs from the live groups API (also refreshes groups.json).
 * @returns {Promise<import("./config.mjs").RiftboundSetConfig[]>}
 */
async function syncConfig() {
  const { sets } = await fetchGroupsFile();

  const setsLiteral = sets
    .map((s) => {
      const lines = [
        `  {`,
        `    groupId: ${s.groupId},`,
        `    abbreviation: ${JSON.stringify(s.abbreviation)},`,
        `    name: ${JSON.stringify(s.name)},`,
        `    publishedOn: ${JSON.stringify(s.publishedOn)},`,
      ];
      if (s.isSupplemental) {
        lines.push(`    isSupplemental: true,`);
      }
      lines.push(`  },`);
      return lines.join("\n");
    })
    .join("\n");

  let configText = await fs.promises.readFile(CONFIG_PATH, "utf8");
  const next = configText.replace(
    /export const SETS = \[[\s\S]*?\];/,
    `export const SETS = [\n${setsLiteral}\n];`,
  );
  if (next === configText) {
    throw new Error("Could not locate SETS array in config.mjs to rewrite");
  }
  await fs.promises.writeFile(CONFIG_PATH, next, "utf8");
  console.log(`Updated ${CONFIG_PATH} (${sets.length} sets)`);
  for (const s of sets) {
    const existing = hasExistingSetData(s.groupId) ? "have" : "NEW ";
    console.log(
      `  [${existing}] ${String(s.groupId).padEnd(6)} ${s.abbreviation.padEnd(4)}  ${s.name}`,
    );
  }
  return sets;
}

/**
 * Candidate URLs for a product image.
 * Cards (have Number in extendedData) prefer face art; sealed SKUs prefer packaging (_in_) shots.
 * @param {object} product - raw tcgcsv product
 */
function imageCandidatesForProduct(product) {
  const cardNumber = extendedValue(product.extendedData, "Number");
  const thumb = product.imageUrl ?? null;
  const image = upgradeImageUrl(thumb);

  if (cardNumber) {
    return [image, thumb, ...productImageUrls(product.productId)].filter(
      (url, index, list) => Boolean(url) && list.indexOf(url) === index,
    );
  }
  return productImageUrls(product.productId, {
    imageUrl: thumb,
    thumbnailUrl: thumb,
  });
}

/**
 * List existing YYYYMMDD snapshot folders under prices/ (sorted ascending).
 * @returns {Promise<string[]>}
 */
async function listPriceDateFolders() {
  let entries = [];
  try {
    entries = await fs.promises.readdir(PRICES_DIR, { withFileTypes: true });
  } catch (err) {
    if (err && err.code === "ENOENT") return [];
    throw err;
  }

  return entries
    .filter((entry) => entry.isDirectory() && /^\d{8}$/.test(entry.name))
    .map((entry) => entry.name)
    .sort();
}

/**
 * Write / update prices/dates.json — pull dates in chronological order,
 * always reflecting the newest snapshot folder.
 * @param {string} day - YYYYMMDD just written (or scanned)
 * @param {{ groups?: number, rows?: number }} [meta]
 */
async function updatePricesDatesIndex(day, meta = {}) {
  const fromDisk = await listPriceDateFolders();
  const dates = Array.from(new Set([...fromDisk, day].filter(Boolean))).sort();
  const latest = dates[dates.length - 1] ?? day ?? null;

  const payload = {
    updatedAt: new Date().toISOString(),
    latest,
    count: dates.length,
    dates,
    ...(typeof meta.groups === "number" ? { lastPullGroups: meta.groups } : {}),
    ...(typeof meta.rows === "number" ? { lastPullRows: meta.rows } : {}),
  };

  await fs.promises.mkdir(PRICES_DIR, { recursive: true });
  await fs.promises.writeFile(
    PRICES_DATES_PATH,
    JSON.stringify(payload, null, 2),
    "utf8",
  );
  console.log(
    `Price dates index → ${path.relative(REPO_ROOT, PRICES_DATES_PATH)} (${dates.length} days, latest ${latest})`,
  );
  return payload;
}

/**
 * Always write today's price snapshot for a group, plus overwrite latest/.
 * Paths:
 *   riftbound/prices/{YYYYMMDD}/{groupId}.json
 *   riftbound/prices/latest/{groupId}.json
 */
async function fetchPrices(setConfig, pricesDayDir, day) {
  const groupId = setConfig.groupId;
  const dest = path.join(pricesDayDir, `${groupId}.json`);
  const latestDest = path.join(PRICES_LATEST_DIR, `${groupId}.json`);

  const pricesBody = await fetchJson(pricesUrl(groupId));
  const results = pricesBody.results ?? [];

  const payload = {
    success: pricesBody.success ?? true,
    errors: pricesBody.errors ?? [],
    fetchedAt: new Date().toISOString(),
    day,
    groupId,
    abbreviation: setConfig.abbreviation,
    name: setConfig.name,
    source: pricesUrl(groupId),
    results,
  };

  const jsonText = JSON.stringify(payload, null, 2);
  await fs.promises.mkdir(PRICES_LATEST_DIR, { recursive: true });
  await fs.promises.writeFile(dest, jsonText, "utf8");
  await fs.promises.writeFile(latestDest, jsonText, "utf8");
  console.log(
    `  prices → ${path.relative(REPO_ROOT, dest)} (+ latest) (${results.length} rows)`,
  );
  return {
    groupId,
    file: dest,
    latestFile: latestDest,
    day,
    rows: results.length,
    priceRows: results,
  };
}

/**
 * Fetch products (+ images) for a group that does not yet have local data.
 * Products are stored as returned by tcgcsv — extendedData and all other fields intact.
 */
async function fetchSetData(setConfig, { downloadImages }) {
  const groupId = setConfig.groupId;
  const code = setConfig.abbreviation;
  const source = productsUrl(groupId);
  console.log(`  data/images for NEW group ${groupId} (${code})…`);

  const productsBody = await fetchJson(source);
  const products = productsBody.results ?? [];
  const cards = products.map((product) => asStoredProduct(product));

  const payload = {
    data: {
      code,
      name: setConfig.name,
      groupId,
      release_date: setConfig.publishedOn,
      card_count: cards.length,
      source: "tcgcsv",
      categoryId: 89,
      sourceUrl: source,
      // Raw tcgcsv envelope fields (kept for fidelity; items themselves are untouched).
      success: productsBody.success ?? true,
      errors: productsBody.errors ?? [],
      totalItems: productsBody.totalItems ?? cards.length,
      cards,
    },
  };

  const jsonPath = setDataPath(groupId);
  const jsonText = JSON.stringify(payload, null, 2);
  await fs.promises.writeFile(jsonPath, jsonText, "utf8");
  console.log(
    `  saved ${path.relative(REPO_ROOT, jsonPath)} (${cards.length} products, raw tcgcsv shape)`,
  );

  let imageDl = 0;
  let imageSkip = 0;
  let errors = 0;

  if (downloadImages) {
    const groupImageDir = path.join(IMAGES_DIR, String(groupId));
    await fs.promises.mkdir(groupImageDir, { recursive: true });

    for (const product of cards) {
      if (!product.productId) continue;

      const candidates = imageCandidatesForProduct(product);
      if (candidates.length === 0) continue;

      let saved = false;
      let lastError = null;
      for (const imageUrl of candidates) {
        const dest = path.join(
          groupImageDir,
          `${product.productId}${extFromUrl(imageUrl)}`,
        );
        try {
          const status = await downloadFile(imageUrl, dest);
          if (status === "downloaded") imageDl++;
          else imageSkip++;
          saved = true;
          break;
        } catch (err) {
          lastError = err;
        }
      }

      if (!saved) {
        errors++;
        console.error(
          `  image fail ${product.productId}: ${lastError?.message ?? "unknown"}`,
        );
      }
    }

    console.log(`  images: +${imageDl} / skip ${imageSkip}; errors ${errors}`);
  } else {
    console.log("  images: skipped (--no-images)");
  }

  return {
    groupId,
    code,
    cards: cards.length,
    jsonBytes: jsonText.length,
    imageDl,
    imageSkip,
    errors,
  };
}

function printUsage() {
  console.log(`Usage:
  node scripts/riftbound/fetch.mjs [options] [SET...]

Default behaviour:
  • Always refresh riftbound/data/groups.json from tcgcsv /89/groups
  • Process every group returned by that API (not only stale config SETS)
  • Sync-aware: data + images only for NEW groups (no data/{groupId}.json yet)
  • Prices always fetched for every target group into:
      riftbound/prices/{YYYYMMDD}/{groupId}.json
      riftbound/prices/latest/{groupId}.json   (always newest)
      riftbound/prices/dates.json              (pull dates, oldest → newest)

Options:
  --sync-config   Also rewrite SETS in config.mjs from tcgcsv groups API
  --force         Re-fetch data/images even when set JSON already exists
  --prices-only   Skip data/images; only write today's price snapshots
  --no-images     Skip image downloads when fetching new/forced sets
  --help          Show this help

SET may be an abbreviation (OGN), groupId (24344), or set name.
With no SET args, all live groups from tcgcsv are processed.

Layout:
  riftbound/data/groups.json
  riftbound/data/{groupId}.json
  riftbound/images/{groupId}/{productId}.jpg
  riftbound/prices/{YYYYMMDD}/{groupId}.json
  riftbound/prices/latest/{groupId}.json
  riftbound/prices/dates.json
`);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    printUsage();
    return;
  }

  await ensureDirs();

  const syncConfigFlag = args.includes("--sync-config");
  const forceData = args.includes("--force");
  const pricesOnly = args.includes("--prices-only");
  const downloadImages = !args.includes("--no-images");
  const setArgs = args.filter((a) => !a.startsWith("--"));

  // Live groups from tcgcsv are the source of truth for what to process.
  // Stale SETS in config.mjs alone would miss new groups (e.g. SGN / 24797)
  // even though groups.json already listed them.
  let sets;
  if (syncConfigFlag) {
    sets = await syncConfig();
  } else {
    const { sets: liveSets } = await fetchGroupsFile();
    sets = liveSets;
  }

  let targets;
  if (setArgs.length === 0) {
    console.log(
      `No sets given; processing all ${sets.length} groups from tcgcsv…`,
    );
    targets = sets;
  } else {
    targets = [];
    // Prefer live groups; fall back to config SETS for resolve helpers.
    const resolveFrom = sets.length > 0 ? sets : SETS;
    for (const input of setArgs) {
      const resolved = resolveSet(input, resolveFrom);
      if (!resolved) {
        throw new Error(
          `Unknown set "${input}". Known: ${resolveFrom
            .map((s) => `${s.groupId} (${s.abbreviation})`)
            .join(", ")}`,
        );
      }
      targets.push(resolved);
    }
  }

  const day = todayStamp();
  const pricesDayDir = path.join(PRICES_DIR, day);
  await fs.promises.mkdir(pricesDayDir, { recursive: true });

  console.log(
    `Sets: ${targets.map((s) => `${s.groupId}/${s.abbreviation}`).join(", ")}`,
  );
  console.log(`Price snapshot folder: riftbound/prices/${day}/`);
  if (pricesOnly) {
    console.log("Mode: prices only");
  } else if (forceData) {
    console.log("Mode: force data/images + prices");
  } else {
    console.log("Mode: new groups only for data/images; prices always");
  }

  const dataResults = [];
  const priceResults = [];
  const skippedData = [];

  for (const setConfig of targets) {
    console.log(`\n=== ${setConfig.groupId} (${setConfig.abbreviation} · ${setConfig.name}) ===`);

    // Prices always (dated snapshot + latest overwrite)
    try {
      priceResults.push(await fetchPrices(setConfig, pricesDayDir, day));
    } catch (err) {
      console.error(`  prices FAIL: ${err.message}`);
      priceResults.push({
        groupId: setConfig.groupId,
        file: null,
        rows: 0,
        error: err.message,
      });
    }

    if (pricesOnly) continue;

    const exists = hasExistingSetData(setConfig.groupId);
    if (exists && !forceData) {
      console.log(
        `  data/images: skip (already have ${path.relative(REPO_ROOT, setDataPath(setConfig.groupId))})`,
      );
      skippedData.push(setConfig.groupId);
      continue;
    }

    dataResults.push(await fetchSetData(setConfig, { downloadImages }));
  }

  const writtenPrices = priceResults.filter((r) => r.file);
  await updatePricesDatesIndex(day, {
    groups: writtenPrices.length,
    rows: writtenPrices.reduce((sum, r) => sum + (r.rows ?? 0), 0),
  });

  console.log("\nDone.");
  console.log(
    `Prices: ${writtenPrices.length}/${targets.length} written under prices/${day}/ and prices/latest/`,
  );
  if (!pricesOnly) {
    console.log(
      `Data/images: ${dataResults.length} fetched, ${skippedData.length} skipped (already present)`,
    );
    for (const r of dataResults) {
      console.log(
        `  ${r.groupId} (${r.code}): ${r.cards} products, json ${r.jsonBytes} B, images ${r.imageDl}+${r.imageSkip}skip, errors ${r.errors}`,
      );
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
