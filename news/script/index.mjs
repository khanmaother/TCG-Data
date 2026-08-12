#!/usr/bin/env node
/**
 * News fetch runner — run all services or one.
 *
 * Usage (from TCG-Data repo root):
 *   node news/script/index.mjs
 *   node news/script/index.mjs --all
 *   node news/script/index.mjs palworld
 *   node news/script/index.mjs --service palworld
 *   node news/script/index.mjs palworld --max-pages 5
 */

import { serviceIds } from "../config/sites.mjs";
import { fetchPalworldNews } from "./palworld.mjs";
import { fetchRiftboundNews } from "./riftbound.mjs";

/** @type {Record<string, (opts: { maxPages?: number }) => Promise<unknown>>} */
const runners = {
  palworld: fetchPalworldNews,
  riftbound: fetchRiftboundNews,
};

function printUsage() {
  console.log(`Usage:
  node news/script/index.mjs [service...] [options]
  node news/script/index.mjs --all [options]
  node news/script/index.mjs --service <id> [options]

With no service args (or --all), every registered news script runs.

Services:
  ${serviceIds.join("\n  ") || "(none)"}

Options:
  --all             Run every service (default when no service is named)
  --service <id>    Run one service (repeatable)
  --max-pages N     Passed through to each fetcher (default 50)
  --help            Show this help
`);
}

/**
 * @param {string[]} args
 */
function parseArgs(args) {
  if (args.includes("--help") || args.includes("-h")) {
    return { help: true };
  }

  /** @type {string[]} */
  const services = [];
  let all = false;
  let maxPages = 50;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--all") {
      all = true;
      continue;
    }
    if (arg === "--service") {
      const id = args[++i];
      if (!id || id.startsWith("--")) {
        throw new Error("--service requires a service id");
      }
      services.push(id.toLowerCase());
      continue;
    }
    if (arg === "--max-pages") {
      const n = Number(args[++i]);
      if (!Number.isFinite(n) || n < 1) {
        throw new Error("--max-pages requires a positive number");
      }
      maxPages = Math.floor(n);
      continue;
    }
    if (arg.startsWith("--")) {
      throw new Error(`Unknown option: ${arg}`);
    }
    services.push(arg.toLowerCase());
  }

  const targets =
    all || services.length === 0 ? [...serviceIds] : [...new Set(services)];

  for (const id of targets) {
    if (!runners[id]) {
      throw new Error(
        `No news script registered for "${id}". Known: ${Object.keys(runners).join(", ")}`,
      );
    }
  }

  return { help: false, targets, maxPages };
}

async function main() {
  const parsed = parseArgs(process.argv.slice(2));
  if (parsed.help) {
    printUsage();
    return;
  }

  const { targets, maxPages } = parsed;
  console.log(
    `News fetch: ${targets.join(", ")} (max-pages=${maxPages})\n`,
  );

  for (const id of targets) {
    console.log(`=== ${id} ===`);
    await runners[id]({ maxPages });
    console.log("");
  }

  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
