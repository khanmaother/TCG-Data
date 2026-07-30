#!/usr/bin/env node
/**
 * Fetch Palworld TCG set JSON + card images from palworldtcg.gg
 *
 * Usage:
 *   node database/palworld/fetch.mjs TD01
 *   node database/palworld/fetch.mjs TD01 BP01
 *   node database/palworld/fetch.mjs          # all sets
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
const DATA_DIR = path.join(__dirname, "data");
const IMAGES_DIR = path.join(__dirname, "images");

function resolveSetCode(input) {
  const raw = String(input || "").trim().toUpperCase();
  return SET_ALIASES[raw] || raw;
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

async function listSetCodes() {
  const body = await fetchJson(API);
  const sets = body.data ?? body;
  if (!Array.isArray(sets)) {
    throw new Error("Unexpected /sets response shape");
  }
  return sets.map((s) => s.code).filter(Boolean);
}

async function fetchSet(code) {
  console.log(`\n=== ${code} ===`);
  const body = await fetchJson(`${API}/${encodeURIComponent(code)}`);
  const setData = body.data ?? body;
  const cards = setData.cards ?? [];

  const jsonPath = path.join(DATA_DIR, `${code}.json`);
  const jsonText = JSON.stringify(body, null, 2);
  await fs.promises.writeFile(jsonPath, jsonText, "utf8");
  console.log(`Saved ${jsonPath} (${jsonText.length} bytes, ${cards.length} cards)`);

  const fullDir = path.join(IMAGES_DIR, code, "full");
  const thumbsDir = path.join(IMAGES_DIR, code, "thumbs");
  await fs.promises.mkdir(fullDir, { recursive: true });
  await fs.promises.mkdir(thumbsDir, { recursive: true });

  let fullDl = 0;
  let fullSkip = 0;
  let thumbDl = 0;
  let thumbSkip = 0;
  let errors = 0;

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
    `Images: full +${fullDl} / skip ${fullSkip}; thumbs +${thumbDl} / skip ${thumbSkip}; errors ${errors}`
  );

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

async function main() {
  await ensureDirs();
  let codes = process.argv.slice(2).filter(Boolean);
  if (codes.length === 0) {
    console.log("No set codes given; fetching all sets...");
    codes = await listSetCodes();
    console.log(`Sets: ${codes.join(", ")}`);
  }

  const results = [];
  for (const input of codes) {
    const code = resolveSetCode(input);
    if (code !== input.toUpperCase()) {
      console.log(`Alias ${input.toUpperCase()} → ${code}`);
    }
    results.push(await fetchSet(code));
  }

  console.log("\nDone.");
  for (const r of results) {
    console.log(
      `  ${r.code}: ${r.cards} cards, json ${r.jsonBytes} B, full ${r.fullDl}+${r.fullSkip}skip, thumbs ${r.thumbDl}+${r.thumbSkip}skip`
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});