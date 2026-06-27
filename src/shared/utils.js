/**
 * Pure utility functions for Job Fish. No side effects, no Chrome API calls, no DOM access.
 * Used by engine.js, exporter.js, llm.js, and sidebar.js.
 *
 * - cleanJSON(raw: string) -> object: strips markdown fences then parses JSON; throws on failure.
 * - sanitizeInput(str: string) -> string: trims and collapses excess whitespace runs.
 * - normalizeForMatch(str: string) -> string: lowercases, strips bullets/punctuation, collapses spaces.
 * - fuzzyLineMatch(lines: string[], target: string) -> string | null: Jaccard similarity line finder.
 * - replaceBulletChars(text: string) -> string: replaces Unicode bullet characters with '- '.
 * - removeTrailingWhitespace(text: string) -> string: strips trailing spaces from each line.
 * - buildTimestamp() -> string: ISO-derived filename-safe timestamp string.
 * - _jaccardSimilarity(a: string, b: string) -> number: internal token-set Jaccard score [0, 1].
 */

export function cleanJSON(raw) {
  if (typeof raw !== 'string') {
    throw new TypeError('cleanJSON: input must be a string');
  }
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();
  return JSON.parse(cleaned);
}

export function sanitizeInput(str) {
  if (!str || typeof str !== 'string') return '';
  return str.trim().replace(/\s{3,}/g, '\n\n');
}

export function normalizeForMatch(str) {
  if (!str || typeof str !== 'string') return '';
  return str
    .toLowerCase()
    .trim()
    .replace(/[\u2022\u25aa\u25e6\u2013\u2014]/g, '') // Unicode bullets and dashes
    .replace(/^[-\s]+/, '')                             // Leading dashes/spaces
    .replace(/[^\w\s]/g, ' ')                           // Punctuation → space
    .replace(/\s+/g, ' ')
    .trim();
}

export function fuzzyLineMatch(lines, target) {
  if (!Array.isArray(lines) || !target) return null;
  const normalTarget = normalizeForMatch(target);
  let bestScore = 0;
  let bestLine = null;

  for (const line of lines) {
    const normalLine = normalizeForMatch(line);
    const score = _jaccardSimilarity(normalLine, normalTarget);
    if (score > bestScore) {
      bestScore = score;
      bestLine = line;
    }
  }

  return bestScore > 0.45 ? bestLine : null;
}

export function replaceBulletChars(text) {
  if (!text) return text;
  return text.replace(/^[ \t]*[•▪◦▸▹▾▿➤➢➣]\s*/gm, '- ');
}

export function removeTrailingWhitespace(text) {
  if (!text) return text;
  return text.split('\n').map(line => line.trimEnd()).join('\n');
}

export function buildTimestamp() {
  return new Date()
    .toISOString()
    .replace('T', '_')
    .replace(/[:.]/g, '-')
    .slice(0, 19);
}

// --- Internal ---

function _jaccardSimilarity(a, b) {
  const tokensA = new Set(a.split(' ').filter(Boolean));
  const tokensB = new Set(b.split(' ').filter(Boolean));
  if (tokensA.size === 0 && tokensB.size === 0) return 1;
  if (tokensA.size === 0 || tokensB.size === 0) return 0;
  let intersectionCount = 0;
  for (const t of tokensA) {
    if (tokensB.has(t)) intersectionCount++;
  }
  const unionSize = tokensA.size + tokensB.size - intersectionCount;
  return intersectionCount / unionSize;
}
