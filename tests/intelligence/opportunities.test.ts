import test from "node:test";
import assert from "node:assert/strict";

import { buildOpportunityInsight } from "@/lib/intelligence/opportunities";

test("builds an opportunity insight from coverage, duplicate, and link signals", () => {
  const insight = buildOpportunityInsight({
    categoryId: 5,
    categoryName: "Retro Advertising",
    keyword: "1950s cereal ads",
    angle:
      "Use the ads to unpack sweetness, convenience foods, and scientific nutrition in the decade.",
    brief: "A Tavern Cellar article about mascots, package design, and modern pantry anxiety.",
    coverageLabel: "quiet",
    localArticles: [],
    sitePostDuplicateCandidates: [
      {
        id: "wp-1",
        source: "site",
        categoryId: 5,
        title: "1950s Cereal Ads Made Breakfast a Family Stage",
        angle: "Mascots and sweetness promises reshaped morning routines.",
        status: "publish",
      },
    ],
    internalLinkCandidates: [
      {
        id: "wp-1",
        title: "1950s Cereal Ads Made Breakfast a Family Stage",
        slug: "1950s-cereal-ads-breakfast-family-stage",
        link: "https://taverncellar.test/1950s-cereal-ads-breakfast-family-stage/",
        excerpt: "Mascots, sweetness, convenience foods, and scientific nutrition promises.",
        wpStatus: "publish",
        categoryName: "Retro Advertising",
        categoryIds: [5],
        publishedAt: new Date("2026-01-10T12:00:00.000Z"),
      },
    ],
  });

  assert.equal(insight.duplicateAssessment.label, "crowded");
  assert.equal(insight.internalLinks[0]?.sitePostId, "wp-1");
  assert.ok(insight.score.overallScore >= 70);
  assert.ok(insight.score.reasons.length > 0);
});

test("keeps weak opportunities visibly low when duplicate risk is high and links are absent", () => {
  const insight = buildOpportunityInsight({
    categoryId: 2,
    categoryName: "Movies",
    keyword: "best movies",
    angle: "A list of movies everyone should watch.",
    brief: "Rank popular movies.",
    coverageLabel: "overloaded",
    localArticles: [
      {
        id: "article-1",
        source: "app",
        categoryId: 2,
        title: "Best Movies Everyone Should Watch",
        angle: "A list of movies everyone should watch.",
        status: "GENERATED",
      },
    ],
    sitePostDuplicateCandidates: [],
    internalLinkCandidates: [],
  });

  assert.equal(insight.duplicateAssessment.label, "too_similar");
  assert.equal(insight.internalLinks.length, 0);
  assert.ok(insight.score.overallScore < 55);
  assert.ok(insight.score.reasons.some((reason) => /generic/i.test(reason)));
});
