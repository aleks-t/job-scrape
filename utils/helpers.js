// ================================
// SHARED UTILITIES
// ================================

export function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function stripHtml(html) {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function getRawValue(obj, key) {
  const val = obj?.[key];
  if (!val) return null;
  if (typeof val === "object" && "raw" in val) return val.raw;
  return val;
}

