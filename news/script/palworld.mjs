#!/usr/bin/env node
/**
 * Fetch Palworld Official Card Game news listings + images.
 *
 *   node news/script/index.mjs palworld
 *   node news/script/palworld.mjs
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sites } from "../config/sites.mjs";

const SITE = sites.palworld;
const SERVICE = "palworld";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const NEWS_ROOT = path.resolve(__dirname, "..");
const REPO_ROOT = path.resolve(NEWS_ROOT, "..");
const OUT_PATH = path.join(NEWS_ROOT, "data", `${SERVICE}.json`);
const IMG_DIR = path.join(NEWS_ROOT, "img", SERVICE);

const DEFAULT_IMAGE_MARKERS = [
  "/assets/images/common/img_default.png",
  "/assets/webp/common/img_default.webp",
];

const CATEGORIES = new Set([
  "JOURNALS",
  "PRODUCTS",
  "CAMPAIGNS",
  "EVENTS",
  "OTHERS",
]);

function newsPageUrl(page) {
  const index = `${SITE.baseUrl}${SITE.newsPath}`;
  return page <= 1 ? index : `${index}/page/${page}`;
}

function decodeHtmlEntities(text) {
  return String(text || "")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) =>
      String.fromCodePoint(parseInt(h, 16)),
    )
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .trim();
}

function stripTags(html) {
  return decodeHtmlEntities(String(html || "").replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function match1(html, re) {
  const m = re.exec(html);
  return m ? m[1] : null;
}

function isDefaultImage(url) {
  if (!url) return true;
  return DEFAULT_IMAGE_MARKERS.some((marker) => url.includes(marker));
}

function slugFromHref(href) {
  try {
    const pathname = new URL(href).pathname.replace(/\/+$/, "");
    const last = pathname.split("/").pop() || "item";
    return last.replace(/[<>:"/\\|?*]/g, "_");
  } catch {
    return "item";
  }
}

function extFromUrl(url) {
  try {
    const ext = path.extname(new URL(url).pathname).toLowerCase();
    if (ext && ext.length <= 5) return ext;
  } catch {
    /* ignore */
  }
  return ".jpg";
}

function parseNewsPage(html) {
  const items = [];
  const blockRe =
    /<a\s+class="c-archive-item"\s+href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
  let match;

  while ((match = blockRe.exec(html)) !== null) {
    const href = decodeHtmlEntities(match[1]).trim();
    const body = match[2];

    const title = stripTags(
      match1(body, /<div class="archive-title">([\s\S]*?)<\/div>/i) || "",
    );
    const date = stripTags(
      match1(body, /<div class="archive-date">([\s\S]*?)<\/div>/i) || "",
    );
    const categoryRaw = stripTags(
      match1(
        body,
        /<div class="c-archive-category[^"]*">([\s\S]*?)<\/div>/i,
      ) || "",
    ).toUpperCase();
    const category = CATEGORIES.has(categoryRaw) ? categoryRaw : "OTHERS";

    const img =
      match1(body, /<img[^>]+src="([^"]+)"/i) ||
      match1(body, /<source[^>]+srcset="([^"]+)"/i);
    const imageUrl =
      img && !isDefaultImage(img) ? decodeHtmlEntities(img) : null;

    if (!title || !href) continue;

    items.push({
      title,
      date,
      category,
      href,
      imageUrl,
    });
  }

  return items;
}

function detectMaxPage(html) {
  let max = 1;
  const escaped = `${SITE.baseUrl}${SITE.newsPath}`.replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&",
  );
  const re = new RegExp(`href="${escaped}(?:\\/page\\/(\\d+))?"`, "gi");
  let m;
  while ((m = re.exec(html)) !== null) {
    const n = m[1] ? Number(m[1]) : 1;
    if (Number.isFinite(n) && n > max) max = n;
  }
  const current = match1(html, /aria-current=['"]page['"][^>]*>\s*(\d+)\s*</i);
  if (current) max = Math.max(max, Number(current));
  return max;
}

async function fetchHtml(url) {
  const res = await fetch(url, {
    headers: { accept: "text/html,application/xhtml+xml" },
  });
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status} ${res.statusText}`);
  return res.text();
}

/**
 * Download remote image into news/img/palworld and return path relative to news/.
 * @param {string} imageUrl
 * @param {string} href
 */
async function downloadImage(imageUrl, href) {
  const filename = `${slugFromHref(href)}${extFromUrl(imageUrl)}`;
  const destPath = path.join(IMG_DIR, filename);
  const relPath = path.posix.join("img", SERVICE, filename);

  if (fs.existsSync(destPath)) return { path: relPath, status: "skipped" };

  await fs.promises.mkdir(IMG_DIR, { recursive: true });
  const res = await fetch(imageUrl);
  if (!res.ok) {
    throw new Error(`GET ${imageUrl} -> ${res.status} ${res.statusText}`);
  }
  await fs.promises.writeFile(destPath, Buffer.from(await res.arrayBuffer()));
  return { path: relPath, status: "downloaded" };
}

/**
 * @param {{ maxPages?: number }} [options]
 */
export async function fetchPalworldNews(options = {}) {
  const maxPages = Math.max(1, Math.floor(options.maxPages ?? 50));
  const newsIndex = newsPageUrl(1);

  await fs.promises.mkdir(path.dirname(OUT_PATH), { recursive: true });
  await fs.promises.mkdir(IMG_DIR, { recursive: true });

  /** @type {Map<string, object>} */
  const byHref = new Map();
  let page = 1;
  let knownMax = maxPages;

  while (page <= Math.min(knownMax, maxPages)) {
    const url = newsPageUrl(page);
    console.log(`Fetching ${url} …`);
    const html = await fetchHtml(url);
    const items = parseNewsPage(html);

    if (page === 1) {
      knownMax = Math.min(maxPages, Math.max(detectMaxPage(html), 1));
      console.log(`  pager suggests ${knownMax} page(s)`);
    }

    if (items.length === 0) {
      console.log(`  no items — stopping`);
      break;
    }

    let added = 0;
    for (const item of items) {
      if (byHref.has(item.href)) continue;
      byHref.set(item.href, item);
      added++;
    }
    console.log(`  ${items.length} item(s), +${added} new`);

    if (page >= knownMax) break;
    page += 1;
  }

  let imgDl = 0;
  let imgSkip = 0;
  let imgFail = 0;
  const items = [];

  for (const raw of byHref.values()) {
    const item = {
      title: raw.title,
      date: raw.date,
      category: raw.category,
      href: raw.href,
    };

    if (raw.imageUrl) {
      try {
        const result = await downloadImage(raw.imageUrl, raw.href);
        item.image = result.path;
        if (result.status === "downloaded") imgDl++;
        else imgSkip++;
      } catch (err) {
        imgFail++;
        console.error(`  image fail ${raw.href}: ${err.message}`);
      }
    }

    items.push(item);
  }

  const feed = {
    source: newsIndex,
    fetchedAt: new Date().toISOString(),
    service: SERVICE,
    count: items.length,
    items,
  };

  await fs.promises.writeFile(
    OUT_PATH,
    `${JSON.stringify(feed, null, 2)}\n`,
    "utf8",
  );

  console.log(
    `\nSaved ${path.relative(REPO_ROOT, OUT_PATH)} (${feed.count} items)`,
  );
  console.log(
    `Images: +${imgDl} downloaded / ${imgSkip} skipped / ${imgFail} failed → ${path.relative(REPO_ROOT, IMG_DIR)}`,
  );
  for (const item of items) {
    console.log(
      `  [${item.category.padEnd(9)}] ${item.date.padEnd(14)}  ${item.title}`,
    );
  }

  return feed;
}

function printUsage() {
  console.log(`Usage:
  node news/script/palworld.mjs [options]
  node news/script/index.mjs palworld [options]

Writes data/${SERVICE}.json and downloads images to img/${SERVICE}/

Options:
  --max-pages N   Safety cap on pages walked (default 50)
  --help          Show this help
`);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    printUsage();
    return;
  }

  let maxPages = 50;
  const maxIdx = args.indexOf("--max-pages");
  if (maxIdx !== -1) {
    const n = Number(args[maxIdx + 1]);
    if (!Number.isFinite(n) || n < 1) {
      throw new Error("--max-pages requires a positive number");
    }
    maxPages = Math.floor(n);
  }

  await fetchPalworldNews({ maxPages });
}

const isDirectRun =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
