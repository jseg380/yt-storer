/**
 * Normalizes text for searching by making it lowercase, removing punctuation,
 * and standardizing whitespace.
 * e.g., "  You're a mean one, Mr. Grinch " -> "youre a mean one mr grinch"
 * @param {string} text The text to normalize.
 * @returns {string} The normalized text.
 */
export function normalizeText(text) {
  if (!text) return "";
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, "") // Removes punctuation (keeps letters, numbers, whitespace)
    .replace(/\s+/g, " ") // Collapses multiple spaces into one
    .trim();
}

/**
 * Creates a compact timestamp string for filenames.
 * e.g., "20231027_153000"
 * @param {Date} date The date object to format.
 * @returns {string} The formatted timestamp.
 */
export function formatCompactTimestamp(date) {
  const pad = (n, w = 2) => String(n).padStart(w, "0");
  const YYYY = date.getFullYear();
  const MM = pad(date.getMonth() + 1);
  const DD = pad(date.getDate());
  const HH = pad(date.getHours());
  const mm = pad(date.getMinutes());
  const ss = pad(date.getSeconds());
  return `${YYYY}${MM}${DD}_${HH}${mm}${ss}`;
}
