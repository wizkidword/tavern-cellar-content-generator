import test from "node:test";
import assert from "node:assert/strict";

import { scoreOpportunity } from "@/lib/intelligence/opportunity-scoring";

test("scores a Tavern-specific opportunity highly when it fills coverage and has real links", () => {
  const score = scoreOpportunity({
    categoryName: "Retro Advertising",
    keyword: "1950s cereal ads",
    angle:
      "Use cereal ads to unpack sweetness, convenience foods, and scientific nutrition in postwar kitchens.",
    brief: "A Tavern Cellar piece about mascots, package design, pantry anxiety, and breakfast branding.",
    coverageLabel: "quiet",
    duplicateRiskLabel: "fresh",
    internalLinks: [
      { confidence: 92 },
      { confidence: 74 },
    ],
  });

  assert.ok(score.overallScore >= 80);
  assert.ok(score.tavernFitScore >= 85);
  assert.ok(score.coverageScore >= 85);
  assert.ok(score.reasons.some((reason) => /Tavern/i.test(reason)));
  assert.equal(score.duplicateRiskScore, 100);
});

test("scores generic crowded ideas lower and explains why", () => {
  const score = scoreOpportunity({
    categoryName: "Movies",
    keyword: "best movies",
    angle: "A list of movies everyone should watch.",
    brief: "Rank popular movies.",
    coverageLabel: "overloaded",
    duplicateRiskLabel: "too_similar",
    internalLinks: [],
  });

  assert.ok(score.overallScore < 55);
  assert.ok(score.seoScore < 60);
  assert.equal(score.duplicateRiskScore, 10);
  assert.ok(score.reasons.some((reason) => /generic/i.test(reason)));
  assert.ok(score.reasons.some((reason) => /duplicate/i.test(reason)));
});
