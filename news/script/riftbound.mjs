#!/usr/bin/env node
/**
 * Fetch Riftbound news listings + images from playriftbound.com.
 *
 *   node news/script/index.mjs riftbound
 *   node news/script/riftbound.mjs
 *
 * Source: https://playriftbound.com/en-us/news/
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sites } from "../config/sites.mjs";

const SITE = sites.riftbound;
const SERVICE = "riftbound";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const NEWS_ROOT = path.resolve(__dirname, "..");
const REPO_ROOT = path.resolve(NEWS_ROOT, "..");
const OUT_PATH = path.join(NEWS_ROOT, "data", `${SERVICE}.json`);
const IMG_DIR = path.join(NEWS_ROOT, "img", SERVICE);

const NEWS_INDEX = `${SITE.baseUrl}${SITE.newsPath}`;

function formatDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function resolveHref(url) {
  if (!url) return "";
  try {
    return new URL(url, SITE.baseUrl).href;
  } catch {
    return url;
  }
}

function slugFromHref(href) {
  try {
    const parts = new URL(href).pathname.replace(/\/+$/, "").split("/");
    const last = parts.pop() || "item";
    const parent = parts.pop() || "";
    const base = parent ? `${parent}-${last}` : last;
    return base.replace(/[<>:"/\\|?*]/g, "_") || "item";
  } catch {
    return "item";
  }
}

function extFromUrl(url) {
  try {
    const clean = new URL(url);
    const ext = path.extname(clean.pathname).toLowerCase();
    if (ext && ext.length <= 5) return ext;
  } catch {
    /* ignore */
  }
  return ".jpg";
}

function parseNewsFromNextData(html) {
  const m = html.match(
    /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/,
  );
  if (!m) throw new Error("No __NEXT_DATA__ found on news page");

  const data = JSON.parse(m[1]);
  const blades = data?.props?.pageProps?.page?.blades;
  if (!Array.isArray(blades)) {
    throw new Error("Unexpected page shape (missing blades)");
  }

  const grid = blades.find((b) => b?.type === "articleCardGrid");
  const rawItems = grid?.items;
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    throw new Error("No articleCardGrid items found");
  }

  return rawItems.map((raw) => {
    const href = resolveHref(raw?.action?.payload?.url || "");
    const imageUrl =
      raw?.media?.url || raw?.imageMedia?.url || raw?.media?.src || null;
    return {
      title: String(raw?.title || "").trim(),
      date: formatDate(raw?.publishedAt || raw?.analytics?.publishDate),
      category: String(raw?.category?.title || raw?.category?.machineName || "OTHERS").trim(),
      href,
      imageUrl: imageUrl ? String(imageUrl) : null,
    };
  }).filter((item) => item.title && item.href);
}

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
export async function fetchRiftboundNews(options = {}) {
  // maxPages is unused here — the news index embeds the full list in SSR.
  void options.maxPages;

  console.log(`Fetching ${NEWS_INDEX} …`);
  const res = await fetch(NEWS_INDEX, {
    headers: { accept: "text/html,application/xhtml+xml" },
  });
  if (!res.ok) {
    throw new Error(`GET ${NEWS_INDEX} -> ${res.status} ${res.statusText}`);
  }
  const html = await res.text();
  const parsed = parseNewsFromNextData(html);
  console.log(`  ${parsed.length} item(s)`);

  await fs.promises.mkdir(path.dirname(OUT_PATH), { recursive: true });
  await fs.promises.mkdir(IMG_DIR, { recursive: true });

  let imgDl = 0;
  let imgSkip = 0;
  let imgFail = 0;
  const items = [];

  for (const raw of parsed) {
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
    source: NEWS_INDEX,
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
  for (const item of items.slice(0, 15)) {
    console.log(
      `  [${item.category.padEnd(16)}] ${item.date.padEnd(14)}  ${item.title}`,
    );
  }
  if (items.length > 15) {
    console.log(`  … and ${items.length - 15} more`);
  }

  return feed;
}

function printUsage() {
  console.log(`Usage:
  node news/script/riftbound.mjs
  node news/script/index.mjs riftbound

Writes data/${SERVICE}.json and downloads images to img/${SERVICE}/

Source: ${NEWS_INDEX}
`);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    printUsage();
    return;
  }
  await fetchRiftboundNews();
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
