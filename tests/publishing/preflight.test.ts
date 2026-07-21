import assert from "node:assert/strict";
import test from "node:test";

import { buildPublishPreflight } from "@/lib/publishing/preflight";

test("builds a sanitized publish preflight from the saved article payload", async () => {
  const preflight = await buildPublishPreflight(
    {
      title: "A Tavern Guide",
      slug: "tavern-guide",
      excerpt: "A practical guide.",
      primaryKeyword: "tavern guide",
      metaTitle: "A Tavern Guide for Game Night",
      metaDescription: "A complete guide to hosting a tavern-themed game night with friends and snacks.",
      tags: "games, tabletop",
      internalLinks: "Game Night Guide - /game-night-guide",
      contentMarkdown: [
        "## Opening",
        "",
        "Read our [Game Night Guide](/game-night-guide) and [source](https://example.com/source).",
        "",
        '<script>alert("unsafe")</script>',
        "",
        "![Shelf](/generated/body_image.png)",
      ].join("\n"),
      category: { name: "Games", wpCategoryId: 12 },
      featuredImagePath: "/generated/featured_image.png",
      featuredImageAlt: "A friendly tavern table",
      featuredImageState: "SUCCEEDED",
      bodyImagesState: "SUCCEEDED",
      bodyImages: [{ publicPath: "/generated/body_image.png", altText: "A glowing shelf" }],
      scheduledFor: null,
      scheduledForLocal: null,
      scheduledForTimezone: null,
      qualityBlockingWarnings: [],
      qualitySuggestions: [],
    },
    "draft",
  );

  assert.match(preflight.html, /src="\/generated\/featured_image\.png"/);
  assert.match(preflight.html, /src="\/generated\/body_image\.png"/);
  assert.doesNotMatch(preflight.html, /<script|alert\("unsafe"\)/i);
  assert.deepEqual(preflight.tags, ["games", "tabletop"]);
  assert.deepEqual(preflight.links, [
    {
      href: "/game-night-guide",
      label: "Game Night Guide",
      type: "internal",
    },
    {
      href: "https://example.com/source",
      label: "source",
      type: "external",
    },
  ]);
  assert.deepEqual(preflight.verifiedInternalLinks, [
    { label: "Game Night Guide", href: "/game-night-guide" },
  ]);
});

test("blocks an unsaved schedule and in-progress image payload", async () => {
  const preflight = await buildPublishPreflight(
    {
      title: "A Tavern Guide",
      slug: "tavern-guide",
      excerpt: "",
      primaryKeyword: "tavern guide",
      metaTitle: "A Tavern Guide for Game Night",
      metaDescription: "A complete guide to hosting a tavern-themed game night with friends and snacks.",
      tags: "",
      internalLinks: "",
      contentMarkdown: "## Opening\n\nBody copy.",
      category: { name: "Games", wpCategoryId: 12 },
      featuredImagePath: null,
      featuredImageAlt: "",
      featuredImageState: "GENERATING",
      bodyImagesState: "SUCCEEDED",
      bodyImages: [],
      scheduledFor: null,
      scheduledForLocal: null,
      scheduledForTimezone: null,
      qualityBlockingWarnings: ["Focus keyphrase is missing from the title."],
      qualitySuggestions: [],
    },
    "future",
  );

  assert.deepEqual(preflight.blocking, [
    "Focus keyphrase is missing from the title.",
    "Choose and save a schedule before asking WordPress to schedule this article.",
    "An image is still generating, so the outgoing media payload can still change.",
  ]);
});
