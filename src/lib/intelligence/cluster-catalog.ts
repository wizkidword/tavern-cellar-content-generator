import { tokenizeForSearch } from "@/lib/intelligence/text";

type TopicClusterCatalogRule = {
  name: string;
  matches: (tokens: string[]) => boolean;
};

function hasAll(tokens: string[], required: string[]) {
  return required.every((token) => tokens.includes(token));
}

function hasAny(tokens: string[], choices: string[]) {
  return choices.some((token) => tokens.includes(token));
}

// This is the deliberately small, editorially-reviewed cluster catalog. Add a
// rule here instead of spreading implicit topic aliases across rebuild logic.
export const topicClusterCatalogRules: TopicClusterCatalogRule[] = [
  {
    name: "1950s cereal advertising",
    matches: (tokens) =>
      hasAll(tokens, ["1950s", "cereal"]) && hasAny(tokens, ["ad", "ads", "advertising"]),
  },
  {
    name: "Walking Dead character retrospectives",
    matches: (tokens) =>
      hasAll(tokens, ["walking", "dead"]) && hasAny(tokens, ["character", "retrospective"]),
  },
  {
    name: "slasher iconography",
    matches: (tokens) => tokens.includes("slasher"),
  },
  {
    name: "retro game commercial nostalgia",
    matches: (tokens) =>
      tokens.includes("retro") &&
      hasAny(tokens, ["game", "gaming"]) &&
      hasAny(tokens, ["ad", "ads", "advertising", "commercial"]),
  },
  {
    name: "horror branding and nostalgia",
    matches: (tokens) =>
      tokens.includes("horror") && hasAny(tokens, ["brand", "branding", "nostalgia"]),
  },
  {
    name: "mascot advertising",
    matches: (tokens) =>
      tokens.includes("mascot") && hasAny(tokens, ["ad", "ads", "advertising"]),
  },
];

export function findTopicClusterCatalogName(value: string) {
  const tokens = tokenizeForSearch(value);

  return topicClusterCatalogRules.find((rule) => rule.matches(tokens))?.name ?? null;
}
