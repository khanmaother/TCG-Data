/**
 * Normalized Riftbound card / product shape (from tcgcsv TCGplayer products).
 *
 * Set file shape:
 * {
 *   data: {
 *     code, name, groupId, release_date, card_count,
 *     source: "tcgcsv",
 *     cards: RiftboundCard[]
 *   }
 * }
 *
 * @typedef {Object} RiftboundCard
 * @property {number} productId
 * @property {string} slug
 * @property {string} card_number - e.g. "001/298" or ""
 * @property {string} name
 * @property {string} clean_name
 * @property {string} card_type - e.g. "Unit", "Champion Unit", "Battlefield"
 * @property {string} rarity
 * @property {string[]} domain - e.g. ["Fury"], ["Calm","Chaos"]
 * @property {string[]} tags
 * @property {number|null} energy_cost
 * @property {number|null} power_cost
 * @property {number|null} might
 * @property {string} description - HTML allowed from source
 * @property {string|null} flavor_text
 * @property {string|null} image_url
 * @property {string|null} thumbnail_url
 * @property {string|null} tcgplayer_url
 * @property {Object|null} prices - keyed by subTypeName (Normal, Foil, …)
 */

/** @type {RiftboundCard} */
export const cardTemplate = {
  productId: 0,
  slug: "",
  card_number: "",
  name: "",
  clean_name: "",
  card_type: "",
  rarity: "",
  domain: [],
  tags: [],
  energy_cost: null,
  power_cost: null,
  might: null,
  description: "",
  flavor_text: null,
  image_url: null,
  thumbnail_url: null,
  tcgplayer_url: null,
  prices: null,
};

/**
 * @param {Partial<RiftboundCard>} [overrides]
 * @returns {RiftboundCard}
 */
export function createCard(overrides = {}) {
  return {
    ...cardTemplate,
    domain: [...(overrides.domain ?? cardTemplate.domain)],
    tags: [...(overrides.tags ?? cardTemplate.tags)],
    prices: overrides.prices ? { ...overrides.prices } : null,
    ...overrides,
    domain: [...(overrides.domain ?? cardTemplate.domain)],
    tags: [...(overrides.tags ?? cardTemplate.tags)],
  };
}

/**
 * Pull a named field from TCGplayer extendedData.
 * @param {Array<{ name: string, value: string }>|undefined} extendedData
 * @param {string} fieldName
 */
export function extendedValue(extendedData, fieldName) {
  if (!Array.isArray(extendedData)) return null;
  const entry = extendedData.find((item) => item.name === fieldName);
  return entry?.value ?? null;
}

function parseNullableInt(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number.parseInt(String(value), 10);
  return Number.isNaN(n) ? null : n;
}

function splitList(value) {
  if (!value) return [];
  return String(value)
    .split(/[;,]/)
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => part.toLowerCase() !== "none");
}

function slugify(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

/**
 * Prefer a larger TCGplayer CDN image when only `_200w` is provided.
 * @param {string|null|undefined} url
 */
export function upgradeImageUrl(url) {
  if (!url) return null;
  return url.replace(/_200w(\.\w+)$/i, "_400w$1");
}

/**
 * Map a raw tcgcsv product (+ optional price rows) into a RiftboundCard.
 * @param {object} product
 * @param {Array<object>} [priceRows]
 */
export function productToCard(product, priceRows = []) {
  const extended = product.extendedData ?? [];
  const cardNumber = extendedValue(extended, "Number") ?? "";
  const name = product.name ?? "";
  const cleanName = product.cleanName ?? name;
  const thumb = product.imageUrl ?? null;
  const image = upgradeImageUrl(thumb);

  /** @type {Record<string, object>|null} */
  let prices = null;
  if (priceRows.length > 0) {
    prices = {};
    for (const row of priceRows) {
      const key = row.subTypeName || "Normal";
      prices[key] = {
        lowPrice: row.lowPrice ?? null,
        midPrice: row.midPrice ?? null,
        highPrice: row.highPrice ?? null,
        marketPrice: row.marketPrice ?? null,
        directLowPrice: row.directLowPrice ?? null,
      };
    }
  }

  const numberSlug = cardNumber
    ? cardNumber.replace(/[^\w.-]+/g, "-").toLowerCase()
    : String(product.productId);

  return createCard({
    productId: product.productId,
    slug: `${numberSlug}-${slugify(cleanName)}`,
    card_number: cardNumber,
    name,
    clean_name: cleanName,
    card_type: extendedValue(extended, "Card Type") ?? "",
    rarity: extendedValue(extended, "Rarity") ?? "",
    domain: splitList(extendedValue(extended, "Domain")),
    tags: splitList(extendedValue(extended, "Tag")),
    energy_cost: parseNullableInt(extendedValue(extended, "Energy Cost")),
    power_cost: parseNullableInt(extendedValue(extended, "Power Cost")),
    might: parseNullableInt(extendedValue(extended, "Might")),
    description: extendedValue(extended, "Description") ?? "",
    flavor_text: extendedValue(extended, "Flavor Text"),
    image_url: image,
    thumbnail_url: thumb,
    tcgplayer_url: product.url ?? null,
    prices,
  });
}
