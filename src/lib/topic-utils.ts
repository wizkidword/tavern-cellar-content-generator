const STOP_WORDS = new Set([
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
  "why",
  "with",
]);

export function normalizeTopicValue(value: string) {
  return value
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function slugify(value: string) {
  return normalizeTopicValue(value).replace(/\s+/g, "-");
}

function keywordTokens(value: string) {
  return normalizeTopicValue(value)
    .split(" ")
    .filter((token) => token.length > 2 && !STOP_WORDS.has(token));
}

export function buildCanonicalTopicKey(
  categorySlug: string,
  title: string,
  angle: string,
  primaryKeyword: string,
) {
  const tokens = Array.from(
    new Set(
      [...keywordTokens(primaryKeyword), ...keywordTokens(title), ...keywordTokens(angle)].slice(
        0,
        10,
      ),
    ),
  );

  return slugify([categorySlug, ...tokens].join(" "));
}

export function similarityScore(left: string, right: string) {
  const leftTokens = new Set(keywordTokens(left));
  const rightTokens = new Set(keywordTokens(right));

  if (leftTokens.size === 0 || rightTokens.size === 0) {
    return 0;
  }

  let overlap = 0;

  for (const token of leftTokens) {
    if (rightTokens.has(token)) {
      overlap += 1;
    }
  }

  return overlap / Math.max(leftTokens.size, rightTokens.size);
}

export function splitListInput(value: string, delimiter = /\r?\n|,/g) {
  return value
    .split(delimiter)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function listToMultiline(items: string[]) {
  return items.filter(Boolean).join("\n");
}

export function listToCommaSeparated(items: string[]) {
  return items.filter(Boolean).join(", ");
}
