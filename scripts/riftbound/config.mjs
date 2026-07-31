/**
 * Riftbound (League of Legends TCG) — TCGplayer category via tcgcsv.com
 *
 * Groups:   https://tcgcsv.com/tcgplayer/89/groups
 * Products: https://tcgcsv.com/tcgplayer/89/{groupId}/products
 * Prices:   https://tcgcsv.com/tcgplayer/89/{groupId}/prices
 *
 * Required: User-Agent per https://tcgcsv.com/docs#usage-guidelines
 */

export const CATEGORY_ID = 89;
export const CATEGORY_NAME = "Riftbound";

export const USER_AGENT = "TCG-Project/1.0.0 (Riftbound fetcher)";

export const TCGCSV_BASE = "https://tcgcsv.com/tcgplayer";

export const groupsUrl = () => `${TCGCSV_BASE}/${CATEGORY_ID}/groups`;
export const productsUrl = (groupId) =>
  `${TCGCSV_BASE}/${CATEGORY_ID}/${groupId}/products`;
export const pricesUrl = (groupId) =>
  `${TCGCSV_BASE}/${CATEGORY_ID}/${groupId}/prices`;

/**
 * Known Riftbound sets (from tcgcsv groups).
 * Refresh with: node scripts/riftbound/fetch.mjs --sync-config
 *
 * @typedef {{ groupId: number, abbreviation: string, name: string, publishedOn: string, isSupplemental?: boolean }} RiftboundSetConfig
 */

/** @type {RiftboundSetConfig[]} */
export const SETS = [
  {
    groupId: 24698,
    abbreviation: "VEN",
    name: "Vendetta",
    publishedOn: "2026-07-31",
  },
  {
    groupId: 24560,
    abbreviation: "UNL",
    name: "Unleashed",
    publishedOn: "2026-05-08",
  },
  {
    groupId: 24519,
    abbreviation: "SFD",
    name: "Spiritforged",
    publishedOn: "2026-02-13",
  },
  {
    groupId: 24552,
    abbreviation: "JDG",
    name: "Riftbound Judge Promotional Cards",
    publishedOn: "2025-12-01",
  },
  {
    groupId: 24344,
    abbreviation: "OGN",
    name: "Origins",
    publishedOn: "2025-10-31",
  },
  {
    groupId: 24439,
    abbreviation: "OGS",
    name: "Origins: Proving Grounds",
    publishedOn: "2025-10-31",
  },
  {
    groupId: 24528,
    abbreviation: "OPP",
    name: "Riftbound Organized Play Promotional Cards",
    publishedOn: "2025-10-31",
  },
  {
    groupId: 24343,
    abbreviation: "PR",
    name: "Riftbound Promotional Cards",
    publishedOn: "2025-10-31",
  },
  {
    groupId: 24502,
    abbreviation: "RWB",
    name: "Riftbound Worlds Bundle 2025",
    publishedOn: "2025-10-28",
  },
];

/**
 * Resolve a CLI set argument (abbreviation or groupId) to a set config.
 * @param {string} input
 * @param {RiftboundSetConfig[]} [sets]
 */
export function resolveSet(input, sets = SETS) {
  const raw = String(input || "").trim();
  if (!raw) return null;

  const byAbbr = sets.find(
    (s) => s.abbreviation.toUpperCase() === raw.toUpperCase(),
  );
  if (byAbbr) return byAbbr;

  const id = Number(raw);
  if (!Number.isNaN(id)) {
    return sets.find((s) => s.groupId === id) ?? null;
  }

  return (
    sets.find((s) => s.name.toLowerCase() === raw.toLowerCase()) ?? null
  );
}
