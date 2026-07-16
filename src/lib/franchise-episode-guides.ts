import { normalizeTopicValue } from "@/lib/topic-utils";

export type EpisodeGuideOpportunity = {
  primaryKeyword: string;
  angle: string;
  brief: string;
};

export type FranchiseEpisode = {
  season: number;
  episode: number;
  title: string;
};

export const GAME_OF_THRONES_EPISODES = [
  { season: 1, episode: 1, title: "Winter Is Coming" },
  { season: 1, episode: 2, title: "The Kingsroad" },
  { season: 1, episode: 3, title: "Lord Snow" },
  { season: 1, episode: 4, title: "Cripples, Bastards, and Broken Things" },
  { season: 1, episode: 5, title: "The Wolf and the Lion" },
  { season: 1, episode: 6, title: "A Golden Crown" },
  { season: 1, episode: 7, title: "You Win or You Die" },
  { season: 1, episode: 8, title: "The Pointy End" },
  { season: 1, episode: 9, title: "Baelor" },
  { season: 1, episode: 10, title: "Fire and Blood" },
  { season: 2, episode: 1, title: "The North Remembers" },
  { season: 2, episode: 2, title: "The Night Lands" },
  { season: 2, episode: 3, title: "What Is Dead May Never Die" },
  { season: 2, episode: 4, title: "Garden of Bones" },
  { season: 2, episode: 5, title: "The Ghost of Harrenhal" },
  { season: 2, episode: 6, title: "The Old Gods and the New" },
  { season: 2, episode: 7, title: "A Man Without Honor" },
  { season: 2, episode: 8, title: "The Prince of Winterfell" },
  { season: 2, episode: 9, title: "Blackwater" },
  { season: 2, episode: 10, title: "Valar Morghulis" },
  { season: 3, episode: 1, title: "Valar Dohaeris" },
  { season: 3, episode: 2, title: "Dark Wings, Dark Words" },
  { season: 3, episode: 3, title: "Walk of Punishment" },
  { season: 3, episode: 4, title: "And Now His Watch Is Ended" },
  { season: 3, episode: 5, title: "Kissed by Fire" },
  { season: 3, episode: 6, title: "The Climb" },
  { season: 3, episode: 7, title: "The Bear and the Maiden Fair" },
  { season: 3, episode: 8, title: "Second Sons" },
  { season: 3, episode: 9, title: "The Rains of Castamere" },
  { season: 3, episode: 10, title: "Mhysa" },
  { season: 4, episode: 1, title: "Two Swords" },
  { season: 4, episode: 2, title: "The Lion and the Rose" },
  { season: 4, episode: 3, title: "Breaker of Chains" },
  { season: 4, episode: 4, title: "Oathkeeper" },
  { season: 4, episode: 5, title: "First of His Name" },
  { season: 4, episode: 6, title: "The Laws of Gods and Men" },
  { season: 4, episode: 7, title: "Mockingbird" },
  { season: 4, episode: 8, title: "The Mountain and the Viper" },
  { season: 4, episode: 9, title: "The Watchers on the Wall" },
  { season: 4, episode: 10, title: "The Children" },
  { season: 5, episode: 1, title: "The Wars to Come" },
  { season: 5, episode: 2, title: "The House of Black and White" },
  { season: 5, episode: 3, title: "High Sparrow" },
  { season: 5, episode: 4, title: "Sons of the Harpy" },
  { season: 5, episode: 5, title: "Kill the Boy" },
  { season: 5, episode: 6, title: "Unbowed, Unbent, Unbroken" },
  { season: 5, episode: 7, title: "The Gift" },
  { season: 5, episode: 8, title: "Hardhome" },
  { season: 5, episode: 9, title: "The Dance of Dragons" },
  { season: 5, episode: 10, title: "Mother's Mercy" },
  { season: 6, episode: 1, title: "The Red Woman" },
  { season: 6, episode: 2, title: "Home" },
  { season: 6, episode: 3, title: "Oathbreaker" },
  { season: 6, episode: 4, title: "Book of the Stranger" },
  { season: 6, episode: 5, title: "The Door" },
  { season: 6, episode: 6, title: "Blood of My Blood" },
  { season: 6, episode: 7, title: "The Broken Man" },
  { season: 6, episode: 8, title: "No One" },
  { season: 6, episode: 9, title: "Battle of the Bastards" },
  { season: 6, episode: 10, title: "The Winds of Winter" },
  { season: 7, episode: 1, title: "Dragonstone" },
  { season: 7, episode: 2, title: "Stormborn" },
  { season: 7, episode: 3, title: "The Queen's Justice" },
  { season: 7, episode: 4, title: "The Spoils of War" },
  { season: 7, episode: 5, title: "Eastwatch" },
  { season: 7, episode: 6, title: "Beyond the Wall" },
  { season: 7, episode: 7, title: "The Dragon and the Wolf" },
  { season: 8, episode: 1, title: "Winterfell" },
  { season: 8, episode: 2, title: "A Knight of the Seven Kingdoms" },
  { season: 8, episode: 3, title: "The Long Night" },
  { season: 8, episode: 4, title: "The Last of the Starks" },
  { season: 8, episode: 5, title: "The Bells" },
  { season: 8, episode: 6, title: "The Iron Throne" },
] satisfies FranchiseEpisode[];

export function isGameOfThronesUniverseCategory(category: { name: string; slug: string }) {
  const normalized = normalizeTopicValue(`${category.name} ${category.slug}`);

  return normalized.includes("game of thrones") && normalized.includes("universe");
}

function episodeCode(episode: FranchiseEpisode) {
  return `S${episode.season}E${episode.episode}`;
}

function paddedEpisodeCode(episode: FranchiseEpisode) {
  return `S${String(episode.season).padStart(2, "0")}E${String(episode.episode).padStart(2, "0")}`;
}

function isEpisodeCovered(episode: FranchiseEpisode, normalizedCoverage: string[]) {
  const title = normalizeTopicValue(episode.title);
  const aliases = [
    normalizeTopicValue(episodeCode(episode)),
    normalizeTopicValue(paddedEpisodeCode(episode)),
    normalizeTopicValue(`season ${episode.season} episode ${episode.episode}`),
    normalizeTopicValue(`season ${episode.season} ep ${episode.episode}`),
  ];
  const titleNeedsContext = title.length <= 8;

  return normalizedCoverage.some((coverage) => {
    if (aliases.some((alias) => coverage.includes(alias))) {
      return true;
    }

    if (!coverage.includes(title)) {
      return false;
    }

    return (
      !titleNeedsContext ||
      coverage.includes("game of thrones") ||
      coverage.includes("episode guide") ||
      coverage.includes("recap") ||
      coverage.includes("explained")
    );
  });
}

function buildEpisodeGuideOpportunity(episode: FranchiseEpisode): EpisodeGuideOpportunity {
  const code = episodeCode(episode);

  return {
    primaryKeyword: `Game of Thrones ${code} "${episode.title}" episode guide`,
    angle: `Create a definitive Tavern Cellar episode guide for Game of Thrones Season ${episode.season} Episode ${episode.episode}, "${episode.title}", covering the plot, key character moves, lore implications, ending, and why it matters to the larger series.`,
    brief: [
      `Episode guide priority: Game of Thrones ${code}, "${episode.title}".`,
      "Write for readers building or using a full Game of Thrones compendium.",
      "Cover the episode recap, major character turns, political fallout, lore connections, standout scenes, and what new viewers should remember next.",
      "Do not branch into rankings, character retrospectives, or culture pieces until the main-series episode guide checklist is complete.",
    ].join(" "),
  };
}

export function buildGameOfThronesEpisodeGuideOpportunities(input: {
  existingCoverage: string[];
  take?: number;
}) {
  const normalizedCoverage = input.existingCoverage.map(normalizeTopicValue);
  const take = input.take ?? 5;

  return GAME_OF_THRONES_EPISODES.filter(
    (episode) => !isEpisodeCovered(episode, normalizedCoverage),
  )
    .slice(0, take)
    .map(buildEpisodeGuideOpportunity);
}

export function buildGameOfThronesFanoutGuidance() {
  return [
    "Game of Thrones Universe coverage rule: the main Game of Thrones episode-guide checklist is already represented in local coverage.",
    "Now suggest broader Game of Thrones Universe opportunities: character arcs, house and lore explainers, political themes, infamous fan debates, adaptation choices, franchise culture, House of the Dragon context, and rewatch guides.",
    "Do not suggest another main-series episode guide unless there is clear evidence that an existing guide is weak or needs a fresh angle.",
  ];
}
