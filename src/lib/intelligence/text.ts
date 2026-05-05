const SEARCH_STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "but",
  "by",
  "for",
  "from",
  "how",
  "in",
  "into",
  "is",
  "it",
  "its",
  "of",
  "on",
  "or",
  "that",
  "the",
  "their",
  "this",
  "to",
  "what",
  "why",
  "with",
]);

const PRESERVED_SHORT_TERMS = new Set(["ad", "ads", "ai", "tv"]);

export function normalizeSearchText(value: string) {
  return value
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function normalizeSearchToken(token: string) {
  if (/^\d/.test(token)) {
    return token;
  }

  if (token.length > 4 && token.endsWith("ies")) {
    return `${token.slice(0, -3)}y`;
  }

  if (token.length > 4 && token.endsWith("s")) {
    return token.slice(0, -1);
  }

  return token;
}

export function tokenizeForSearch(value: string) {
  if (!value.trim()) {
    return [];
  }

  return Array.from(
    new Set(
      normalizeSearchText(value)
        .split(" ")
        .map(normalizeSearchToken)
        .filter(
          (token) =>
            token &&
            !SEARCH_STOP_WORDS.has(token) &&
            (token.length > 1 || PRESERVED_SHORT_TERMS.has(token)),
        ),
    ),
  );
}

export function scoreTokenOverlap(sourceTokens: string[], targetTokens: string[]) {
  const source = new Set(sourceTokens);
  const target = new Set(targetTokens);

  if (source.size === 0 || target.size === 0) {
    return 0;
  }

  let overlap = 0;

  for (const token of source) {
    if (target.has(token)) {
      overlap += 1;
    }
  }

  return Math.round((overlap / Math.max(source.size, target.size)) * 100);
}

export function scoreTokenCoverage(sourceTokens: string[], targetTokens: string[]) {
  const source = new Set(sourceTokens);
  const target = new Set(targetTokens);

  if (source.size === 0 || target.size === 0) {
    return 0;
  }

  let overlap = 0;

  for (const token of target) {
    if (source.has(token)) {
      overlap += 1;
    }
  }

  return Math.round((overlap / target.size) * 100);
}
