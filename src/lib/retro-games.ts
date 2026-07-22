import { normalizeTopicValue } from "@/lib/topic-utils";

export type RetroGameCoverageRecord = {
  title: string;
  primaryKeyword?: string | null;
  angle: string;
  brief?: string | null;
  source: "app" | "opportunity" | "site";
};

export type RetroGameOpportunity = {
  primaryKeyword: string;
  angle: string;
  brief: string;
};

export type RetroGameCoverageDecision = {
  opportunity: RetroGameOpportunity;
  allowed: boolean;
  reason?: string;
};

const platformNames = [
  "playstation 5",
  "playstation 4",
  "playstation 3",
  "playstation 2",
  "playstation",
  "sega saturn",
  "sega genesis",
  "mega drive",
  "nintendo 64",
  "super nintendo",
  "game boy advance",
  "game boy color",
  "gamecube",
  "dreamcast",
  "xbox 360",
  "xbox one",
  "ms dos",
  "windows",
  "arcade",
  "genesis",
  "game boy",
  "gamegear",
  "game gear",
  "atari",
  "amiga",
  "commodore",
  "mac",
  "nes",
  "snes",
  "n64",
  "ps5",
  "ps4",
  "ps3",
  "ps2",
  "ps1",
  "xbox",
  "wii",
  "pc",
  "dos",
] as const;

const angleLensTerms = {
  culture: ["cultural", "culture", "legacy", "influence", "fandom", "afterlife", "adaptation"],
  design: ["design", "mechanic", "system", "controls", "combat", "level", "puzzle", "gameplay", "player choice"],
  guide: ["guide", "walkthrough", "tips", "strategy", "build", "route", "boss"],
  history: ["development", "production", "making of", "behind the scenes", "release history", "creator", "studio"],
  narrative: ["story", "narrative", "character", "ending", "plot", "lore"],
  ports: ["port", "version", "conversion", "remaster", "hardware"],
  challenge: ["difficulty", "challenge", "speedrun", "mastery"],
  retrospective: ["retrospective", "reassessment", "looking back", "first time", "first-time", "review", "still works", "holds up"],
} as const;

const focusNoise = new Set([
  "a",
  "an",
  "and",
  "about",
  "after",
  "also",
  "are",
  "as",
  "at",
  "be",
  "because",
  "been",
  "being",
  "best",
  "but",
  "by",
  "classic",
  "can",
  "could",
  "does",
  "even",
  "feel",
  "feels",
  "from",
  "game",
  "games",
  "have",
  "how",
  "in",
  "into",
  "is",
  "its",
  "just",
  "make",
  "makes",
  "more",
  "most",
  "much",
  "never",
  "only",
  "of",
  "on",
  "or",
  "over",
  "piece",
  "player",
  "players",
  "still",
  "that",
  "the",
  "their",
  "them",
  "they",
  "this",
  "today",
  "very",
  "what",
  "when",
  "which",
  "while",
  "with",
  "without",
  "why",
  "works",
]);

function words(value: string) {
  return normalizeTopicValue(value).split(" ").filter(Boolean);
}

function phraseStart(wordsToSearch: string[], phrase: string[]) {
  for (let index = 0; index <= wordsToSearch.length - phrase.length; index += 1) {
    if (phrase.every((word, offset) => wordsToSearch[index + offset] === word)) {
      return index;
    }
  }

  return -1;
}

function gameTitleFromKeyword(primaryKeyword: string) {
  const keywordWords = words(primaryKeyword);
  const platformStart = platformNames
    .map((platform) => phraseStart(keywordWords, words(platform)))
    .filter((index) => index > 0)
    .sort((left, right) => left - right)[0];
  const titleWords = keywordWords.slice(0, platformStart ?? keywordWords.length);

  while (titleWords.at(-1) === "on" || titleWords.at(-1) === "for") {
    titleWords.pop();
  }

  return titleWords.join(" ");
}

function recordMatchesGame(record: RetroGameCoverageRecord, gameTitle: string) {
  const candidateGameTitle = record.primaryKeyword
    ? gameTitleFromKeyword(record.primaryKeyword)
    : "";

  if (candidateGameTitle) {
    return (
      candidateGameTitle === gameTitle ||
      candidateGameTitle.endsWith(` ${gameTitle}`) ||
      gameTitle.endsWith(` ${candidateGameTitle}`)
    );
  }

  const titleWords = words(record.title);
  const gameWords = words(gameTitle);

  return gameWords.length > 0 && phraseStart(titleWords, gameWords) >= 0;
}

function hasPhrase(value: string, phrase: string) {
  return phraseStart(words(value), words(phrase)) >= 0;
}

function angleLenses(value: string) {
  return Object.entries(angleLensTerms)
    .filter(([, phrases]) => phrases.some((phrase) => hasPhrase(value, phrase)))
    .map(([lens]) => lens);
}

function editorialFocus(value: string, gameTitle: string) {
  const gameWords = new Set(words(gameTitle));

  return new Set(
    words(value).filter(
      (word) => word.length > 2 && !gameWords.has(word) && !focusNoise.has(word),
    ),
  );
}

function sharesFocus(left: Set<string>, right: Set<string>) {
  for (const word of left) {
    if (right.has(word)) {
      return true;
    }
  }

  return false;
}

function hasClearlyDifferentAngle(input: {
  opportunity: RetroGameOpportunity;
  coverage: RetroGameCoverageRecord;
  gameTitle: string;
}) {
  // A site-only record has no reliable editorial angle. Be conservative rather
  // than accidentally allowing a rewritten version of an existing article.
  if (input.coverage.source === "site") {
    return false;
  }

  const proposedText = `${input.opportunity.angle} ${input.opportunity.brief}`;
  const existingText = `${input.coverage.angle} ${input.coverage.brief ?? ""}`;
  const proposedLenses = angleLenses(proposedText);
  const existingLenses = angleLenses(existingText);

  if (proposedLenses.length === 0 || existingLenses.length === 0) {
    return false;
  }

  if (proposedLenses.some((lens) => existingLenses.includes(lens))) {
    return false;
  }

  return !sharesFocus(
    editorialFocus(proposedText, input.gameTitle),
    editorialFocus(existingText, input.gameTitle),
  );
}

export function screenRetroGameOpportunities(input: {
  opportunities: RetroGameOpportunity[];
  existingCoverage: RetroGameCoverageRecord[];
}) {
  const decisions: RetroGameCoverageDecision[] = [];
  const acceptedCoverage = [...input.existingCoverage];

  for (const opportunity of input.opportunities) {
    const gameTitle = gameTitleFromKeyword(opportunity.primaryKeyword);
    const matchingCoverage = acceptedCoverage.filter((record) => recordMatchesGame(record, gameTitle));
    const isClearlyDifferent =
      matchingCoverage.length > 0 &&
      matchingCoverage.every((coverage) =>
        hasClearlyDifferentAngle({ opportunity, coverage, gameTitle }),
      );

    if (matchingCoverage.length > 0 && !isClearlyDifferent) {
      decisions.push({
        opportunity,
        allowed: false,
        reason: `Already covered: ${opportunity.primaryKeyword}. A repeat must use a completely different editorial focus and format.`,
      });
      continue;
    }

    decisions.push({ opportunity, allowed: true });
    acceptedCoverage.push({
      title: opportunity.primaryKeyword,
      primaryKeyword: opportunity.primaryKeyword,
      angle: opportunity.angle,
      brief: opportunity.brief,
      source: "opportunity",
    });
  }

  return decisions;
}

export function isRetroGamesCategory(category: { name: string; slug: string }) {
  return category.slug === "games" || normalizeTopicValue(category.name) === "games";
}

export function getRetroGameCutoffYear(now = new Date()) {
  return now.getFullYear() - 20;
}

export function buildRetroGamesStrategyGuidance(now = new Date()) {
  const cutoffYear = getRetroGameCutoffYear(now);

  return [
    "Games category rule: every opportunity must cover one specific video game, not a console, franchise, publisher, genre, or broad list.",
    "Coverage rule: do not suggest a game already covered in Tavern Cellar unless the new piece has a completely different editorial format and focus. Different wording alone is never enough.",
    `Eligibility rule: only suggest games that are 20 years old or older. Prefer games released in ${cutoffYear} or earlier; if an exact release date is known, it must already be at least 20 years old.`,
    "All platforms qualify: arcade, console, handheld, computer, MS-DOS, Windows, Mac, imports, oddities, licensed games, cult classics, and mainstream hits.",
    "Vary the angle mix across looking back pieces, first-time player reviews, recap-style retrospectives, design breakdowns, difficulty/control reassessments, cultural afterlife, weird-history oddities, forgotten ports, and why-it-still-works-or-does-not pieces.",
    "Angles must be complete editorial directions, not short labels like review, recap, looking back, or first play.",
    "Primary keywords should usually include the exact game title plus the original platform, release year, or defining version when that helps search intent.",
    "Example eligible scopes: Sonic the Hedgehog on Sega Genesis, Super Mario Bros. on NES, Redneck Rampage on MS-DOS, an arcade cabinet, a PlayStation launch game, or a forgotten Game Boy release.",
    "Avoid broad lists, modern games, hardware-only topics, industry news, esports, rumors, and franchise-wide overviews unless the article is anchored to one qualifying retro game.",
  ];
}

export function buildRetroGamesArticleGuidance(now = new Date()) {
  const cutoffYear = getRetroGameCutoffYear(now);

  return [
    "Games category article rule: keep the draft centered on a single specific game.",
    `The game must be retro: released in ${cutoffYear} or earlier, or otherwise clearly 20 years old or older by exact release date.`,
    "This is not a franchise-wide overview, console history, broad ranking, or modern-game comparison unless those details support the one qualifying game.",
    "Use the chosen angle clearly: looking back, first-time player review, recap-style retrospective, design breakdown, cultural afterlife, port comparison, or why-it-still-works-or-does-not.",
  ];
}
