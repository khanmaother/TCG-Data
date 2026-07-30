/**
 * Palworld TCG card object shape (from palworldtcg.gg set JSON).
 * Each set file is: { data: { code, name, release_date, card_count, key_art_url, cards: Card[] } }
 *
 * @typedef {Object} PalworldCard
 * @property {string} slug
 * @property {string} card_number
 * @property {string} name
 * @property {string|null} pal_name
 * @property {string} card_type - e.g. "Pal", "Soul", "Trainer"
 * @property {string|null} subtype - e.g. "Normal", "Lucky"
 * @property {string[]} color - e.g. ["Red"], ["Blue"]
 * @property {number|null} cost
 * @property {number|null} power
 * @property {number|null} strike
 * @property {string} rarity - e.g. "TD", "TSP", "TSR", "C", "U", "R"
 * @property {string[]} keywords
 * @property {boolean} is_lucky
 * @property {string|null} image_url
 * @property {string|null} thumbnail_url
 * @property {string} status - e.g. "revealed"
 */

/** @type {PalworldCard} */
export const cardTemplate = {
  slug: "",
  card_number: "",
  name: "",
  pal_name: null,
  card_type: "",
  subtype: null,
  color: [],
  cost: null,
  power: null,
  strike: null,
  rarity: "",
  keywords: [],
  is_lucky: false,
  image_url: null,
  thumbnail_url: null,
  status: "revealed",
};

/**
 * @param {Partial<PalworldCard>} [overrides]
 * @returns {PalworldCard}
 */
export function createCard(overrides = {}) {
  return {
    ...cardTemplate,
    color: [...(overrides.color ?? cardTemplate.color)],
    keywords: [...(overrides.keywords ?? cardTemplate.keywords)],
    ...overrides,
  };
}
