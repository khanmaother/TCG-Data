#!/usr/bin/env node
/**
 * Fetch Riftbound TCG set JSON + product images from tcgcsv.com (TCGplayer mirror).
 *
 * Files are keyed by TCGplayer IDs (not set abbreviations):
 *   riftbound/data/{groupId}.json
 *   riftbound/images/{groupId}/{productId}.jpg
 *
 * Usage (from TCG-Data repo root):
 *   node scripts/riftbound/fetch.mjs 24344
 *   node scripts/riftbound/fetch.mjs OGN PR
 *   node scripts/riftbound/fetch.mjs              # all sets in config
 *   node scripts/riftbound/fetch.mjs --sync-config
 *   node scripts/riftbound/fetch.mjs --no-images OGN
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
const CONFIG_PATH = path.join(__dirname, "config.mjs");

async function ensureDirs() {
  await fs.promises.mkdir(DATA_DIR, { recursive: true });
  await fs.promises.mkdir(IMAGES_DIR, { recursive: true });
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
    console.log(`  ${String(s.groupId).padEnd(6)} ${s.abbreviation.padEnd(4)}  ${s.name}`);
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

async function fetchSet(setConfig, { downloadImages }) {
  const groupId = setConfig.groupId;
  const code = setConfig.abbreviation;
  console.log(`\n=== ${groupId} (${code} · ${setConfig.name}) ===`);

  const [productsBody, pricesBody] = await Promise.all([
    fetchJson(productsUrl(groupId)),
    fetchJson(pricesUrl(groupId)).catch((err) => {
      console.warn(`  prices unavailable: ${err.message}`);
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

  const jsonPath = path.join(DATA_DIR, `${groupId}.json`);
  const jsonText = JSON.stringify(payload, null, 2);
  await fs.promises.writeFile(jsonPath, jsonText, "utf8");
  console.log(
    `Saved ${jsonPath} (${jsonText.length} bytes, ${cards.length} products)`,
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

    console.log(`Images: +${imageDl} / skip ${imageSkip}; errors ${errors}`);
  } else {
    console.log("Images: skipped (--no-images)");
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

Options:
  --sync-config   Refresh SETS in config.mjs from tcgcsv groups API
  --no-images     Skip image downloads
  --help          Show this help

SET may be an abbreviation (OGN), groupId (24344), or set name.
With no SET args, all sets in config are fetched.

Output layout (TCGplayer IDs):
  riftbound/data/{groupId}.json
  riftbound/images/{groupId}/{productId}.jpg
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
  const downloadImages = !args.includes("--no-images");
  const setArgs = args.filter((a) => !a.startsWith("--"));

  let sets = SETS;
  if (syncConfigFlag) {
    sets = await syncConfig();
    if (setArgs.length === 0) {
      console.log("\nDone (config only). Pass groupIds or abbreviations to fetch data.");
      return;
    }
  }

  let targets;
  if (setArgs.length === 0) {
    console.log("No sets given; fetching all sets from config…");
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

  console.log(
    `Sets: ${targets.map((s) => `${s.groupId}/${s.abbreviation}`).join(", ")}`,
  );

  const results = [];
  for (const setConfig of targets) {
    results.push(await fetchSet(setConfig, { downloadImages }));
  }

  console.log("\nDone.");
  for (const r of results) {
    console.log(
      `  ${r.groupId} (${r.code}): ${r.cards} products, json ${r.jsonBytes} B, images ${r.imageDl}+${r.imageSkip}skip, errors ${r.errors}`,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
