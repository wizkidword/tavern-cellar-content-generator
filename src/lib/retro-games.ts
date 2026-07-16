import { normalizeTopicValue } from "@/lib/topic-utils";

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
