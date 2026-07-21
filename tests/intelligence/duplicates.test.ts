import test from "node:test";
import assert from "node:assert/strict";

import { assessDuplicateRisk, type DuplicateCandidate } from "@/lib/intelligence/duplicates";

const localArticles: DuplicateCandidate[] = [
  {
    id: "article-1",
    source: "app",
    categoryId: 5,
    title: "How 1950s Cereal Ads Sold Breakfast To Parents",
    angle: "Nutrition promises, family harmony, and mascot-driven convenience in postwar kitchens.",
    status: "GENERATED",
  },
];

const sitePosts: DuplicateCandidate[] = [
  {
    id: "wp-1",
    source: "site",
    categoryId: 5,
    title: "1950s Cereal Ads Made Breakfast a Family Stage",
    angle: "Mascots and sweetness promises reshaped morning routines.",
    status: "publish",
  },
  {
    id: "wp-2",
    source: "site",
    categoryId: 1,
    title: "Slasher Posters And The Shape Of 1980s Horror",
    angle: "Poster art and horror iconography in the video store era.",
    status: "publish",
  },
];

test("marks exact same-category coverage as too similar", () => {
  const assessment = assessDuplicateRisk({
    keyword: "1950s cereal ads",
    title: "How 1950s Cereal Ads Sold Breakfast To Parents",
    angle: "Nutrition promises, family harmony, and mascot-driven convenience in postwar kitchens.",
    categoryId: 5,
    localArticles,
    sitePosts,
  });

  assert.equal(assessment.label, "too_similar");
  assert.equal(assessment.blockingSimilarity, true);
  assert.equal(assessment.matches[0]?.source, "app");
  assert.equal(assessment.matches[0]?.similarity, 100);
  assert.match(assessment.matches[0]?.explanation ?? "", /exact title/i);
});

test("marks adjacent coverage without blocking fresh angles", () => {
  const assessment = assessDuplicateRisk({
    keyword: "1950s cereal ads",
    title: "What 1950s Cereal Ads Reveal About Postwar Taste",
    angle: "Sweetness, scientific nutrition, and modern pantry anxiety in advertising language.",
    categoryId: 5,
    localArticles: [],
    sitePosts,
  });

  assert.equal(assessment.label, "crowded");
  assert.equal(assessment.blockingSimilarity, false);
  assert.ok(assessment.matches[0]?.similarity >= 65);
  assert.match(assessment.matches[0]?.reason ?? "", /overlap/i);
  assert.match(assessment.matches[0]?.explanation ?? "", /shared terms/i);
});

test("does not treat broad franchise and format terms as enough duplicate evidence", () => {
  const assessment = assessDuplicateRisk({
    keyword: "retro games",
    title: "Retro Games Review",
    angle: "Platform controls, home computing, and why old game design remains distinctive.",
    categoryId: 5,
    localArticles: [
      {
        id: "article-broad",
        source: "app",
        categoryId: 5,
        title: "Classic Movie Review",
        angle: "Cinematic lighting, romantic drama, and the changing language of film performance.",
        status: "GENERATED",
      },
    ],
    sitePosts: [],
  });

  assert.equal(assessment.label, "fresh");
});

test("ignores unrelated categories when assessing topic saturation", () => {
  const assessment = assessDuplicateRisk({
    keyword: "slasher poster art",
    title: "Slasher Posters And The Shape Of 1980s Horror",
    angle: "Poster art and horror iconography in the video store era.",
    categoryId: 5,
    localArticles: [],
    sitePosts,
  });

  assert.equal(assessment.label, "fresh");
  assert.equal(assessment.matches.length, 0);
});
