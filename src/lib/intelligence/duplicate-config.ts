// These broad labels add little evidence on their own. Keep this list small and
// reviewed: it adjusts fuzzy similarity only, never exact-title protection.
export const lowInformationDuplicateTerms = new Set([
  "article",
  "best",
  "classic",
  "film",
  "films",
  "game",
  "games",
  "guide",
  "movie",
  "movies",
  "review",
  "retro",
]);

export function filterLowInformationDuplicateTerms(tokens: string[]) {
  const informative = tokens.filter((token) => !lowInformationDuplicateTerms.has(token));

  return informative.length > 0 ? informative : tokens;
}
