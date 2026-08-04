#!/usr/bin/env node
/**
 * Fetch Palworld TCG set JSON + card images from palworldtcg.gg
 *
 * Always refreshes the groups/sets snapshot:
 *   palworld/data/groups.json   # from GET /api/v1/sets
 *
 * Data / images — only for **new** sets (no existing `data/{code}.json`):
 *   palworld/data/{code}.json
 *   palworld/images/{code}/full/
 *   palworld/images/{code}/thumbs/
 *
 * Sources:
 *   https://palworldtcg.gg/api/v1/sets
 *   https://palworldtcg.gg/api/v1/sets/{code}
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
const API = `${BASE}/api/v1/sets`;

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

/**
 * A set counts as pulled only when local JSON exists and has at least one card.
 * Empty stubs (API listed set, cards not published yet) are re-fetched on later runs.
 */
function hasExistingSetData(code) {
  const filePath = setDataPath(code);
  if (!fs.existsSync(filePath)) return false;
  try {
    const body = JSON.parse(fs.readFileSync(filePath, "utf8"));
    const cards = body?.data?.cards ?? body?.cards ?? [];
    return Array.isArray(cards) && cards.length > 0;
  } catch {
    return false;
  }
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
  console.log(`Fetching groups… ${API}`);
  const body = await fetchJson(API);
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

async function fetchSet(code, { downloadImages }) {
  console.log(`  data/images for NEW set ${code}…`);
  const body = await fetchJson(`${API}/${encodeURIComponent(code)}`);
  const setData = body.data ?? body;
  const cards = setData.cards ?? [];

  const jsonPath = setDataPath(code);
  const jsonText = JSON.stringify(body, null, 2);
  await fs.promises.writeFile(jsonPath, jsonText, "utf8");
  console.log(
    `  saved ${path.relative(REPO_ROOT, jsonPath)} (${jsonText.length} bytes, ${cards.length} cards)`,
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
  • Data + images only for NEW sets (no data/{code}.json with cards yet)
    Empty stubs (0 cards) are treated as not-yet-pulled and re-tried.

Options:
  --force       Re-fetch data/images even when set JSON already exists
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
    console.log("Mode: new sets only for data/images");
  }

  const results = [];
  const skipped = [];

  for (const code of targets) {
    console.log(`\n=== ${code} ===`);
    if (!forceData && hasExistingSetData(code)) {
      console.log(
        `  skip data/images (already have ${path.relative(REPO_ROOT, setDataPath(code))})`,
      );
      skipped.push(code);
      continue;
    }
    results.push(await fetchSet(code, { downloadImages }));
  }

  console.log("\nDone.");
  if (skipped.length) {
    console.log(`Skipped (already present): ${skipped.join(", ")}`);
  }
  for (const r of results) {
    console.log(
      `  ${r.code}: ${r.cards} cards, json ${r.jsonBytes} B, full ${r.fullDl}+${r.fullSkip}skip, thumbs ${r.thumbDl}+${r.thumbSkip}skip`,
    );
  }
  if (results.length === 0 && skipped.length > 0) {
    console.log("No new sets to pull.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
