// A lone dash is used as a missing-value marker in some source records.
// Keep source fields separate from presentation, but render/export those markers as "Unknown".
export const isDashPlaceholder = value =>
  typeof value === "string" && /^\s*[-‐‑‒–—−]\s*$/u.test(value);

export const toUnknownDisplay = (value, fallback = "Unknown") => {
  if (value === null || value === undefined || value === "") return fallback;
  if (isDashPlaceholder(value)) return "Unknown";
  return value;
};

export const normalizeDashMarkers = value => {
  if (typeof value === "string") return isDashPlaceholder(value) ? "Unknown" : value;
  if (Array.isArray(value)) return value.map(normalizeDashMarkers);
  if (value && typeof value === "object") {
    const prototype = Object.getPrototypeOf(value);
    // Preserve Date, File, ArrayBuffer and other non-plain data objects used by workbook imports.
    if (prototype !== Object.prototype && prototype !== null) return value;
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, normalizeDashMarkers(item)]));
  }
  return value;
};

// Logic should not mistake a display sentinel for a real category, project or mapping.
export const cleanKnownText = value => {
  const text = String(value ?? "").trim();
  return !text || /^\s*[-‐‑‒–—−]\s*$/u.test(text) || /^unknown$/i.test(text) ? "" : text;
};

// A single user-facing Stage Code field can be sourced from any legacy workbook field.
// Dash markers and the display sentinel "Unknown" are treated as missing during resolution.
export const resolveStageCode = record => {
  const candidates = [
    record?.productCode,
    record?.projectCode,
    ...(Array.isArray(record?.productCodes) ? [record.productCodes.join(", ")] : []),
    ...(Array.isArray(record?.projectCodes) ? [record.projectCodes.join(", ")] : []),
    record?.stageCode,
    ...(Array.isArray(record?.stages) ? [record.stages.join(", ")] : []),
    record?.stage,
  ];
  for (const candidate of candidates) {
    const value = cleanKnownText(candidate);
    if (value) return value;
  }
  return "Unknown";
};
