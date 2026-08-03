#!/usr/bin/env node
/**
 * Fetch Riftbound TCG set JSON + product images from tcgcsv.com (TCGplayer mirror).
 *
 * Data / images — only for **new** groups (no existing `data/{groupId}.json`):
 *   riftbound/data/{groupId}.json
 *   riftbound/images/{groupId}/{productId}.jpg
 *
 * Prices — **always** refreshed for every group into a dated snapshot folder:
 *   riftbound/prices/{YYYYMMDD}/{groupId}.json
 *
 * Sources:
 *   https://tcgcsv.com/tcgplayer/89/groups
 *   https://tcgcsv.com/tcgplayer/89/{groupId}/products
 *   https://tcgcsv.com/tcgplayer/89/{groupId}/prices
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

import { productImageUrls, productToCard } from "./card-template.mjs";
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
const CONFIG_PATH = path.join(__dirname, "config.mjs");

async function ensureDirs() {
  await fs.promises.mkdir(DATA_DIR, { recursive: true });
  await fs.promises.mkdir(IMAGES_DIR, { recursive: true });
  await fs.promises.mkdir(PRICES_DIR, { recursive: true });
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
 * Rewrite SETS in config.mjs from the live groups API.
 * @returns {Promise<import("./config.mjs").RiftboundSetConfig[]>}
 */
async function syncConfig() {
  console.log("Fetching groups…");
  const body = await fetchJson(groupsUrl());
  const results = body.results ?? [];
  if (!Array.isArray(results) || results.length === 0) {
    throw new Error("No groups returned from tcgcsv");
  }

  const sets = results.map((g) => ({
    groupId: g.groupId,
    abbreviation: g.abbreviation || String(g.groupId),
    name: g.name,
    publishedOn: publishedDate(g.publishedOn),
    isSupplemental: Boolean(g.isSupplemental),
  }));

  const groupsPath = path.join(DATA_DIR, "groups.json");
  await fs.promises.mkdir(DATA_DIR, { recursive: true });
  await fs.promises.writeFile(
    groupsPath,
    JSON.stringify({ totalItems: sets.length, results }, null, 2),
    "utf8",
  );
  console.log(`Saved ${groupsPath}`);

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
 * Cards prefer face art; sealed SKUs prefer packaging (_in_) shots.
 */
function imageCandidatesForProduct(card) {
  if (card.card_number) {
    return [card.image_url, card.thumbnail_url, ...productImageUrls(card.productId)].filter(
      (url, index, list) => Boolean(url) && list.indexOf(url) === index,
    );
  }
  return productImageUrls(card.productId, {
    imageUrl: card.image_url,
    thumbnailUrl: card.thumbnail_url,
  });
}

/**
 * Always write today's price snapshot for a group.
 * Path: riftbound/prices/{YYYYMMDD}/{groupId}.json
 */
async function fetchPrices(setConfig, pricesDayDir) {
  const groupId = setConfig.groupId;
  const dest = path.join(pricesDayDir, `${groupId}.json`);

  const pricesBody = await fetchJson(pricesUrl(groupId));
  const results = pricesBody.results ?? [];

  const payload = {
    success: pricesBody.success ?? true,
    errors: pricesBody.errors ?? [],
    fetchedAt: new Date().toISOString(),
    groupId,
    abbreviation: setConfig.abbreviation,
    name: setConfig.name,
    source: pricesUrl(groupId),
    results,
  };

  await fs.promises.writeFile(dest, JSON.stringify(payload, null, 2), "utf8");
  console.log(
    `  prices → ${path.relative(REPO_ROOT, dest)} (${results.length} rows)`,
  );
  return { groupId, file: dest, rows: results.length, priceRows: results };
}

/**
 * Fetch products (+ images) for a group that does not yet have local data.
 */
async function fetchSetData(setConfig, { downloadImages }) {
  const groupId = setConfig.groupId;
  const code = setConfig.abbreviation;
  console.log(`  data/images for NEW group ${groupId} (${code})…`);

  const [productsBody, pricesBody] = await Promise.all([
    fetchJson(productsUrl(groupId)),
    fetchJson(pricesUrl(groupId)).catch((err) => {
      console.warn(`  prices unavailable while building set JSON: ${err.message}`);
      return { results: [] };
    }),
  ]);

  const products = productsBody.results ?? [];
  const priceRows = pricesBody.results ?? [];
  const pricesByProduct = new Map();
  for (const row of priceRows) {
    const list = pricesByProduct.get(row.productId) ?? [];
    list.push(row);
    pricesByProduct.set(row.productId, list);
  }

  const cards = products.map((product) =>
    productToCard(product, pricesByProduct.get(product.productId) ?? []),
  );

  const payload = {
    data: {
      code,
      name: setConfig.name,
      groupId,
      release_date: setConfig.publishedOn,
      card_count: cards.length,
      source: "tcgcsv",
      categoryId: 89,
      cards,
    },
  };

  const jsonPath = setDataPath(groupId);
  const jsonText = JSON.stringify(payload, null, 2);
  await fs.promises.writeFile(jsonPath, jsonText, "utf8");
  console.log(
    `  saved ${path.relative(REPO_ROOT, jsonPath)} (${cards.length} products)`,
  );

  let imageDl = 0;
  let imageSkip = 0;
  let errors = 0;

  if (downloadImages) {
    const groupImageDir = path.join(IMAGES_DIR, String(groupId));
    await fs.promises.mkdir(groupImageDir, { recursive: true });

    for (const card of cards) {
      if (!card.productId) continue;

      const candidates = imageCandidatesForProduct(card);
      if (candidates.length === 0) continue;

      let saved = false;
      let lastError = null;
      for (const imageUrl of candidates) {
        const dest = path.join(
          groupImageDir,
          `${card.productId}${extFromUrl(imageUrl)}`,
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
          `  image fail ${card.productId}: ${lastError?.message ?? "unknown"}`,
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
  • Sync-aware: data + images only for NEW groups (no data/{groupId}.json yet)
  • Prices always fetched for every target group into:
      riftbound/prices/{YYYYMMDD}/{groupId}.json

Options:
  --sync-config   Refresh SETS in config.mjs from tcgcsv groups API
  --force         Re-fetch data/images even when set JSON already exists
  --prices-only   Skip data/images; only write today's price snapshots
  --no-images     Skip image downloads when fetching new/forced sets
  --help          Show this help

SET may be an abbreviation (OGN), groupId (24344), or set name.
With no SET args, all sets in config are processed.

Layout:
  riftbound/data/{groupId}.json
  riftbound/images/{groupId}/{productId}.jpg
  riftbound/prices/{YYYYMMDD}/{groupId}.json
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

  let sets = SETS;
  if (syncConfigFlag) {
    sets = await syncConfig();
  }

  let targets;
  if (setArgs.length === 0) {
    console.log("No sets given; processing all sets from config…");
    targets = sets;
  } else {
    targets = [];
    for (const input of setArgs) {
      const resolved = resolveSet(input, sets);
      if (!resolved) {
        throw new Error(
          `Unknown set "${input}". Known: ${sets
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

    // Prices always
    try {
      priceResults.push(await fetchPrices(setConfig, pricesDayDir));
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

  console.log("\nDone.");
  console.log(
    `Prices: ${priceResults.filter((r) => r.file).length}/${targets.length} written under prices/${day}/`,
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
