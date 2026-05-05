import test from "node:test";
import assert from "node:assert/strict";

import { buildTopicClusterDrafts } from "@/lib/intelligence/clusters";

test("groups catalog items into stable topic clusters", () => {
  const clusters = buildTopicClusterDrafts({
    sitePosts: [
      {
        id: "wp-1",
        categoryId: 5,
        title: "1950s Cereal Ads Made Breakfast a Family Stage",
        excerpt: "Mascots, cereal boxes, sweetness, and scientific nutrition promises.",
        status: "publish",
      },
      {
        id: "wp-2",
        categoryId: 5,
        title: "Vintage Mascot Advertising Before Saturday Morning TV",
        excerpt: "Cereal mascots and toy commercials helped brands feel familiar.",
        status: "publish",
      },
      {
        id: "wp-3",
        categoryId: 1,
        title: "Slasher Posters And The Shape Of 1980s Horror",
        excerpt: "Masks, knives, poster art, and video store memory.",
        status: "publish",
      },
    ],
    articles: [
      {
        id: "article-1",
        categoryId: 5,
        title: "How 1950s Cereal Ads Sold Breakfast To Parents",
        angle: "Nutrition promises and mascot-driven convenience in postwar kitchens.",
        status: "GENERATED",
      },
    ],
    opportunities: [
      {
        id: "opp-1",
        categoryId: 5,
        primaryKeyword: "1950s cereal ads",
        angle: "Postwar taste, sweetness, convenience, and scientific nutrition in cereal ads.",
        status: "IDEA",
      },
    ],
  });

  const cerealCluster = clusters.find(
    (cluster) => cluster.normalizedName === "1950s-cereal-advertising",
  );
  const slasherCluster = clusters.find((cluster) => cluster.normalizedName === "slasher-iconography");

  assert.equal(cerealCluster?.name, "1950s cereal advertising");
  assert.equal(cerealCluster?.categoryId, 5);
  assert.equal(cerealCluster?.items.length, 3);
  assert.ok(cerealCluster?.missingSupportHints.some((hint) => /supporting/i.test(hint)));
  assert.equal(slasherCluster?.name, "slasher iconography");
  assert.equal(slasherCluster?.items[0]?.itemType, "SITE_POST");
});

test("drops one-off clusters so the map stays conservative", () => {
  const clusters = buildTopicClusterDrafts({
    sitePosts: [
      {
        id: "wp-1",
        categoryId: 2,
        title: "A Single Oddball Movie Review",
        excerpt: "One isolated title with no supporting coverage.",
        status: "publish",
      },
    ],
    articles: [],
    opportunities: [],
  });

  assert.equal(clusters.length, 0);
});
