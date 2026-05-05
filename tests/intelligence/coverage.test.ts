import test from "node:test";
import assert from "node:assert/strict";

import { buildCoverageMap } from "@/lib/intelligence/coverage";

const now = new Date("2026-05-05T18:00:00.000Z");

test("builds category coverage counts from synced posts and local articles", () => {
  const lanes = buildCoverageMap({
    now,
    categories: [
      { id: 5, wpCategoryId: 105, name: "Retro Advertising", slug: "retro-advertising" },
      { id: 1, wpCategoryId: 101, name: "Horror", slug: "horror" },
    ],
    sitePosts: [
      {
        id: "wp-1",
        primaryCategoryId: 5,
        rawCategoryIds: "105",
        wpStatus: "publish",
        publishedAt: new Date("2026-05-01T12:00:00.000Z"),
        lastSyncedAt: new Date("2026-05-05T17:30:00.000Z"),
      },
      {
        id: "wp-2",
        primaryCategoryId: 5,
        rawCategoryIds: "105",
        wpStatus: "future",
        publishedAt: new Date("2026-05-07T12:00:00.000Z"),
        lastSyncedAt: new Date("2026-05-05T17:30:00.000Z"),
      },
      {
        id: "wp-3",
        primaryCategoryId: 1,
        rawCategoryIds: "101",
        wpStatus: "draft",
        publishedAt: null,
        lastSyncedAt: new Date("2026-05-03T12:00:00.000Z"),
      },
    ],
    articles: [
      { id: "article-1", categoryId: 5, status: "GENERATED", createdAt: now },
      { id: "article-2", categoryId: 5, status: "SCHEDULED", createdAt: now },
    ],
  });

  const retro = lanes.find((lane) => lane.slug === "retro-advertising");
  const horror = lanes.find((lane) => lane.slug === "horror");

  assert.equal(retro?.counts.live, 1);
  assert.equal(retro?.counts.scheduled, 2);
  assert.equal(retro?.counts.generated, 1);
  assert.equal(retro?.syncIsStale, false);
  assert.equal(horror?.counts.draft, 1);
  assert.equal(horror?.syncIsStale, true);
});

test("labels quiet and healthy lanes with evidence", () => {
  const lanes = buildCoverageMap({
    now,
    categories: [
      { id: 5, wpCategoryId: 105, name: "Retro Advertising", slug: "retro-advertising" },
      { id: 2, wpCategoryId: 102, name: "Movies", slug: "movies" },
    ],
    sitePosts: Array.from({ length: 12 }, (_, index) => ({
      id: `wp-${index}`,
      primaryCategoryId: 2,
      rawCategoryIds: "102",
      wpStatus: "publish",
      publishedAt: new Date("2026-05-01T12:00:00.000Z"),
      lastSyncedAt: now,
    })),
    articles: [],
  });

  const retro = lanes.find((lane) => lane.slug === "retro-advertising");
  const movies = lanes.find((lane) => lane.slug === "movies");

  assert.equal(retro?.balanceLabel, "quiet");
  assert.ok(retro?.evidence.some((line) => /No live posts/i.test(line)));
  assert.equal(movies?.balanceLabel, "healthy");
});
