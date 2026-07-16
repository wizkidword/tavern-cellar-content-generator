import assert from "node:assert/strict";
import test from "node:test";

import {
  GAME_OF_THRONES_EPISODES,
  buildGameOfThronesFanoutGuidance,
  buildGameOfThronesEpisodeGuideOpportunities,
  isGameOfThronesUniverseCategory,
} from "@/lib/franchise-episode-guides";

test("recognizes the Game of Thrones universe category by name or slug", () => {
  assert.equal(
    isGameOfThronesUniverseCategory({
      name: "The Game of Thrones Universe",
      slug: "the-game-of-thrones-universe",
    }),
    true,
  );
  assert.equal(
    isGameOfThronesUniverseCategory({
      name: "Horror",
      slug: "horror",
    }),
    false,
  );
});

test("builds the first missing Game of Thrones episode guide opportunities", () => {
  const opportunities = buildGameOfThronesEpisodeGuideOpportunities({
    existingCoverage: [],
    take: 3,
  });

  assert.deepEqual(
    opportunities.map((opportunity) => opportunity.primaryKeyword),
    [
      'Game of Thrones S1E1 "Winter Is Coming" episode guide',
      'Game of Thrones S1E2 "The Kingsroad" episode guide',
      'Game of Thrones S1E3 "Lord Snow" episode guide',
    ],
  );
  assert.match(opportunities[0]?.angle ?? "", /Season 1 Episode 1/i);
  assert.match(opportunities[0]?.brief ?? "", /episode guide/i);
});

test("skips Game of Thrones episodes already covered by posts, articles, or opportunities", () => {
  const opportunities = buildGameOfThronesEpisodeGuideOpportunities({
    existingCoverage: [
      'Game of Thrones S1E1 "Winter Is Coming" episode guide',
      "Game of Thrones Season 1 Episode 2 recap: The Kingsroad",
      "Lord Snow explained for new Game of Thrones viewers",
    ],
    take: 2,
  });

  assert.deepEqual(
    opportunities.map((opportunity) => opportunity.primaryKeyword),
    [
      'Game of Thrones S1E4 "Cripples, Bastards, and Broken Things" episode guide',
      'Game of Thrones S1E5 "The Wolf and the Lion" episode guide',
    ],
  );
});

test("returns no Game of Thrones episode guide opportunities after all episodes are covered", () => {
  const opportunities = buildGameOfThronesEpisodeGuideOpportunities({
    existingCoverage: GAME_OF_THRONES_EPISODES.map(
      (episode) => `Game of Thrones S${episode.season}E${episode.episode} "${episode.title}" episode guide`,
    ),
  });

  assert.equal(opportunities.length, 0);
});

test("builds Game of Thrones fanout guidance for after the episode guide checklist", () => {
  const guidance = buildGameOfThronesFanoutGuidance().join("\n");

  assert.match(guidance, /episode-guide checklist is already represented/i);
  assert.match(guidance, /character arcs/i);
  assert.match(guidance, /franchise culture/i);
  assert.match(guidance, /do not suggest another main-series episode guide/i);
});
