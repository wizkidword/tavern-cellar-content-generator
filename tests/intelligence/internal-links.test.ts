import test from "node:test";
import assert from "node:assert/strict";

import {
  recommendInternalLinks,
  type InternalLinkCandidate,
} from "@/lib/intelligence/internal-links";
import { normalizeSearchText, scoreTokenOverlap, tokenizeForSearch } from "@/lib/intelligence/text";

const candidates: InternalLinkCandidate[] = [
  {
    id: "wp-1",
    title: "1950s Cereal Ads Made Breakfast a Family Stage",
    slug: "1950s-cereal-ads-breakfast-family-stage",
    link: "https://taverncellar.test/1950s-cereal-ads-breakfast-family-stage/",
    excerpt:
      "Mascots, sweetness, convenience foods, and scientific nutrition promises shaped the modern pantry.",
    wpStatus: "publish",
    categoryName: "Retro Advertising",
    categoryIds: [5],
    publishedAt: new Date("2026-01-10T12:00:00.000Z"),
  },
  {
    id: "wp-2",
    title: "Slasher Posters And The Shape Of 1980s Horror",
    slug: "slasher-posters-1980s-horror",
    link: "https://taverncellar.test/slasher-posters-1980s-horror/",
    excerpt: "A look at horror art direction, masks, knives, shadow, and video store memory.",
    wpStatus: "publish",
    categoryName: "Horror",
    categoryIds: [1],
    publishedAt: new Date("2026-01-08T12:00:00.000Z"),
  },
  {
    id: "wp-3",
    title: "Vintage Mascot Advertising Before Saturday Morning TV",
    slug: "vintage-mascot-advertising-before-tv",
    link: null,
    excerpt: "Commercial mascots and package characters helped cereal brands feel familiar.",
    wpStatus: "draft",
    categoryName: "Retro Advertising",
    categoryIds: [5],
    publishedAt: null,
  },
];

test("normalizes searchable text without losing decade and topic terms", () => {
  assert.equal(
    normalizeSearchText("What 1950s Cereal Ads Reveal About America’s Pantry!"),
    "what 1950s cereal ads reveal about americas pantry",
  );

  assert.deepEqual(tokenizeForSearch("How 1950s cereal ads sold sweet scientific nutrition"), [
    "1950s",
    "cereal",
    "ads",
    "sold",
    "sweet",
    "scientific",
    "nutrition",
  ]);
});

test("scores token overlap as a symmetric 0 to 100 score", () => {
  const left = tokenizeForSearch("1950s cereal ads and mascot advertising");
  const right = tokenizeForSearch("cereal mascot packaging in 1950s advertising");

  assert.equal(scoreTokenOverlap(left, right), 80);
  assert.equal(scoreTokenOverlap(right, left), 80);
});

test("recommends real synced links using keyword, angle, brief, and category fit", () => {
  const recommendations = recommendInternalLinks({
    keyword: "1950s cereal ads",
    angle:
      "Use the ads to unpack sweetness, convenience foods, and scientific nutrition in postwar kitchens.",
    brief: "Focus on package mascots and the changing American pantry.",
    categoryId: 5,
    candidates,
  });

  assert.equal(recommendations[0]?.sitePostId, "wp-1");
  assert.equal(
    recommendations[0]?.url,
    "https://taverncellar.test/1950s-cereal-ads-breakfast-family-stage/",
  );
  assert.ok(recommendations[0]?.confidence >= 80);
  assert.match(recommendations[0]?.reason ?? "", /title/i);
  assert.equal(recommendations.some((item) => item.sitePostId === "wp-2"), false);
});

test("uses a synced slug when a matching post has no link", () => {
  const recommendations = recommendInternalLinks({
    keyword: "vintage mascot advertising",
    angle: "Show how cereal package characters became trusted commercial hosts.",
    brief: "Connect mascots, package design, and early breakfast branding.",
    categoryId: 5,
    candidates,
  });

  const draftRecommendation = recommendations.find((item) => item.sitePostId === "wp-3");

  assert.equal(draftRecommendation?.url, "/vintage-mascot-advertising-before-tv");
  assert.ok((draftRecommendation?.confidence ?? 100) < recommendations[0].confidence);
  assert.match(draftRecommendation?.reason ?? "", /draft/i);
});
