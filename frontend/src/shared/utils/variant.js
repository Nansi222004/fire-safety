const normalizeVariantPart = (value) => String(value || "").trim().toLowerCase();
const normalizeAxisName = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");

export const getVariantSignature = (variant = {}) =>
  Object.entries(variant || {})
    .map(([axis, value]) => [normalizeAxisName(axis), normalizeVariantPart(value)])
    .filter(([axis, value]) => axis && value)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([axis, value]) => `${axis}=${value}`)
    .join("|");

export const formatVariantLabel = (variant = {}) => {
  const entries = Object.entries(variant || {})
    .map(([axis, value]) => [String(axis || "").trim(), String(value || "").trim()])
    .filter(([axis, value]) => axis && value);
  if (!entries.length) return "";
  return entries
    .map(([axis, value]) => {
      const axisLabel = axis
        .replace(/[_-]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      return `${axisLabel.charAt(0).toUpperCase()}${axisLabel.slice(1)}: ${value}`;
    })
    .join(" | ");
};

const toEntries = (value) => {
  if (!value) return [];
  if (value instanceof Map) return Array.from(value.entries());
  if (typeof value === "object") return Object.entries(value);
  return [];
};

export const getVariantStockValue = (stockMap, selection = {}, defaultStock = null) => {
  const entries = toEntries(stockMap);
  if (!entries.length) return defaultStock;

  const key = getVariantSignature(selection);
  if (key) {
    const exact = entries.find(([rawKey]) => String(rawKey).trim() === key);
    if (exact) {
      const parsed = Number(exact[1]);
      if (Number.isFinite(parsed)) return parsed;
    }
    const normalized = entries.find(
      ([rawKey]) => String(rawKey).trim().toLowerCase() === key.toLowerCase()
    );
    if (normalized) {
      const parsed = Number(normalized[1]);
      if (Number.isFinite(parsed)) return parsed;
    }
  }

  const size = String(selection.size || selection.Size || "").trim().toLowerCase();
  const color = String(selection.color || selection.Color || "").trim().toLowerCase();

  const candidates = [
    `${size}|${color}`,
    `${size}-${color}`,
    `${size}_${color}`,
    `${size}:${color}`,
    size && !color ? size : null,
    color && !size ? color : null,
  ].filter(Boolean);

  for (const candidate of candidates) {
    const exactCandidate = entries.find(([rawKey]) => String(rawKey).trim() === candidate);
    if (exactCandidate) {
      const parsed = Number(exactCandidate[1]);
      if (Number.isFinite(parsed)) return parsed;
    }
    const normalizedCandidate = entries.find(
      ([rawKey]) => String(rawKey).trim().toLowerCase() === candidate
    );
    if (normalizedCandidate) {
      const parsed = Number(normalizedCandidate[1]);
      if (Number.isFinite(parsed)) return parsed;
    }
  }

  return defaultStock;
};

export const getVariantPriceValue = (pricesMap, selection = {}, basePrice = 0) => {
  const base = Number(basePrice) || 0;
  const entries = toEntries(pricesMap);
  if (!entries.length) return base;

  const key = getVariantSignature(selection);
  if (key) {
    const exact = entries.find(([rawKey]) => String(rawKey).trim() === key);
    if (exact) {
      const parsed = Number(exact[1]);
      if (Number.isFinite(parsed) && parsed >= 0) return parsed;
    }
    const normalized = entries.find(
      ([rawKey]) => String(rawKey).trim().toLowerCase() === key.toLowerCase()
    );
    if (normalized) {
      const parsed = Number(normalized[1]);
      if (Number.isFinite(parsed) && parsed >= 0) return parsed;
    }
  }

  const size = String(selection.size || selection.Size || "").trim().toLowerCase();
  const color = String(selection.color || selection.Color || "").trim().toLowerCase();

  const candidates = [
    `${size}|${color}`,
    `${size}-${color}`,
    `${size}_${color}`,
    `${size}:${color}`,
    size && !color ? size : null,
    color && !size ? color : null,
  ].filter(Boolean);

  for (const candidate of candidates) {
    const exactCandidate = entries.find(([rawKey]) => String(rawKey).trim() === candidate);
    if (exactCandidate) {
      const parsed = Number(exactCandidate[1]);
      if (Number.isFinite(parsed) && parsed >= 0) return parsed;
    }
    const normalizedCandidate = entries.find(
      ([rawKey]) => String(rawKey).trim().toLowerCase() === candidate
    );
    if (normalizedCandidate) {
      const parsed = Number(normalizedCandidate[1]);
      if (Number.isFinite(parsed) && parsed >= 0) return parsed;
    }
  }

  return base;
};

