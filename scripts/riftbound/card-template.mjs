/**
 * Helpers for Riftbound / tcgcsv TCGplayer products.
 *
 * Set files store each product **exactly as returned** by:
 *   https://tcgcsv.com/tcgplayer/89/{groupId}/products
 * including `extendedData`, `presaleInfo`, etc. — do not flatten or drop fields.
 *
 * Set file shape:
 * {
 *   data: {
 *     code, name, groupId, release_date, card_count,
 *     source: "tcgcsv",
 *     categoryId: 89,
 *     sourceUrl,
 *     cards: TcgcsvProduct[]   // raw results[] items
 *   }
 * }
 */

/**
 * Pull a named field from TCGplayer extendedData.
 * @param {Array<{ name: string, value: string }>|undefined|null} extendedData
 * @param {string} fieldName
 * @returns {string|null}
 */
export function extendedValue(extendedData, fieldName) {
  if (!Array.isArray(extendedData)) return null;
  const entry = extendedData.find((item) => item?.name === fieldName);
  if (entry?.value === null || entry?.value === undefined) return null;
  return String(entry.value);
}

/**
 * Prefer a larger TCGplayer CDN image when only `_200w` is provided.
 * @param {string|null|undefined} url
 */
export function upgradeImageUrl(url) {
  if (!url) return null;
  return url.replace(/_200w(\.\w+)$/i, "_400w$1");
}

const TCGPLAYER_PRODUCT_CDN = "https://tcgplayer-cdn.tcgplayer.com/product";

/**
 * Candidate product-image URLs for a TCGplayer productId.
 * Prefers `_in_1000x1000` / `_in_200x200` packaging shots, then listing URLs.
 *
 * @param {number|string} productId
 * @param {{ imageUrl?: string|null, thumbnailUrl?: string|null }} [fallback]
 * @returns {string[]}
 */
export function productImageUrls(productId, fallback = {}) {
  if (productId === null || productId === undefined || productId === "") {
    return [];
  }
  const id = String(productId);
  const candidates = [
    `${TCGPLAYER_PRODUCT_CDN}/${id}_in_1000x1000.jpg`,
    `${TCGPLAYER_PRODUCT_CDN}/${id}_in_200x200.jpg`,
    upgradeImageUrl(fallback.imageUrl),
    fallback.imageUrl ?? null,
    fallback.thumbnailUrl ?? null,
  ];
  return candidates.filter(
    (url, index, list) => Boolean(url) && list.indexOf(url) === index,
  );
}

/**
 * Deep-clone a raw tcgcsv product for storage (no field mapping).
 * @param {object} product
 * @returns {object}
 */
export function asStoredProduct(product) {
  return structuredClone(product);
}
