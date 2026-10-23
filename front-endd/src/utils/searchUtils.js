/**
 * Shared, order-independent search helpers.
 * - Case-insensitive and punctuation-insensitive (CTO-2 = CTO 2)
 * - Every meaningful query token must be present, in any order
 * - Supports searching nested objects/arrays without throwing
 */
const SEARCH_LABELS = new Set([
  "the", "a", "an", "for", "by", "in", "on", "to", "of", "and", "or",
  "search", "find", "show", "all", "any", "with", "where", "is", "are",
  "reactor", "reactors", "id", "site", "block", "area", "status", "capacity",
  "client", "customer", "project", "product", "stage", "code", "moc", "agitator",
  "equipment", "record", "records"
]);

export const normalizeSearchText = value => String(value ?? "")
  .normalize("NFKD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .replace(/([a-z])([0-9])/g, "$1 $2")
  .replace(/([0-9])([a-z])/g, "$1 $2")
  .replace(/[^a-z0-9]+/g, " ")
  .trim();

export const flattenSearchValues = value => {
  if (value == null) return "";
  if (Array.isArray(value)) return value.map(flattenSearchValues).filter(Boolean).join(" ");
  if (typeof value === "object") return Object.values(value).map(flattenSearchValues).filter(Boolean).join(" ");
  return String(value);
};

export const matchesSearch = (haystack, query) => {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return true;
  const normalizedHaystack = normalizeSearchText(flattenSearchValues(haystack));
  if (!normalizedHaystack) return false;

  // Exact phrase remains a fast path; token matching enables arbitrary word order.
  if (normalizedHaystack.includes(normalizedQuery)) return true;
  let tokens = normalizedQuery.split(/\s+/).filter(Boolean);
  if (tokens.length > 1) {
    const meaningful = tokens.filter(token => !SEARCH_LABELS.has(token));
    if (meaningful.length) tokens = meaningful;
  }
  return tokens.every(token => normalizedHaystack.includes(token));
};

export const uniqueSearchValues = values => [...new Set((values || [])
  .map(value => String(value ?? "").trim())
  .filter(value => value && value !== "Unknown" && value !== "-"))]
  .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));
