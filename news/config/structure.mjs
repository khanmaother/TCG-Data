/**
 * Shared news data shape (any site).
 *
 * Feed:  { source, fetchedAt, service, count, items }
 * Item:  { title, date, category, href, image? }
 *
 * `image` is a path under news/ (e.g. "img/palworld/post-1.jpg"), not a remote URL.
 */

export const sampleItem = {
  title: "",
  date: "",
  category: "",
  href: "",
  image: "",
};

export const sampleFeed = {
  source: "",
  fetchedAt: "",
  service: "",
  count: 0,
  items: [sampleItem],
};
