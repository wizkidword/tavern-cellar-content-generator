import test from "node:test";
import assert from "node:assert/strict";

import {
  buildArticleBodyImageRequests,
  insertArticleBodyImageMarkdown,
  removeArticleBodyImageMarkdown,
  resolveArticleBodyImageCount,
} from "@/lib/article-body-images";

test("clamps optional article body image counts to a modest range", () => {
  assert.equal(resolveArticleBodyImageCount(undefined), 0);
  assert.equal(resolveArticleBodyImageCount(""), 0);
  assert.equal(resolveArticleBodyImageCount("2"), 2);
  assert.equal(resolveArticleBodyImageCount(6), 4);
  assert.equal(resolveArticleBodyImageCount(-1), 0);
});

test("builds section-aware image requests from article headings", () => {
  const requests = buildArticleBodyImageRequests({
    title: "Why 1980s Toy Commercials Still Feel Electric",
    angle: "Connect the pacing of retro toy ads to modern collector nostalgia.",
    primaryKeyword: "1980s toy commercials",
    contentMarkdown: [
      "Opening paragraph.",
      "",
      "## Saturday Morning Energy",
      "",
      "A section.",
      "",
      "## Collector Shelf Memory",
      "",
      "Another section.",
    ].join("\n"),
    count: 2,
  });

  assert.equal(requests.length, 2);
  assert.equal(requests[0]?.sortOrder, 1);
  assert.equal(requests[0]?.sectionHeading, "Saturday Morning Energy");
  assert.match(requests[0]?.prompt ?? "", /Saturday Morning Energy/);
  assert.match(requests[0]?.prompt ?? "", /1980s toy commercials/);
  assert.match(requests[0]?.altText ?? "", /1980s toy commercials/i);
  assert.equal(requests[1]?.sectionHeading, "Collector Shelf Memory");
});

test("places a single requested body image deeper than the opening section", () => {
  const requests = buildArticleBodyImageRequests({
    title: "Why 1980s Toy Commercials Still Feel Electric",
    angle: "Connect the pacing of retro toy ads to modern collector nostalgia.",
    primaryKeyword: "1980s toy commercials",
    contentMarkdown: [
      "Opening paragraph with the featured image already above it.",
      "",
      "## Saturday Morning Energy",
      "",
      "A section about pacing and color.",
      "",
      "## Collector Shelf Memory",
      "",
      "A section about objects and display shelves.",
      "",
      "## Toy Aisle Tension",
      "",
      "A section about parent and kid expectations.",
      "",
      "## Commercial Break Glow",
      "",
      "A section about light, screens, and room atmosphere.",
    ].join("\n"),
    count: 1,
  });

  assert.equal(requests.length, 1);
  assert.equal(requests[0]?.sectionHeading, "Toy Aisle Tension");
});

test("spreads multiple requested body images across longer articles", () => {
  const requests = buildArticleBodyImageRequests({
    title: "Why 1980s Toy Commercials Still Feel Electric",
    angle: "Connect the pacing of retro toy ads to modern collector nostalgia.",
    primaryKeyword: "1980s toy commercials",
    contentMarkdown: [
      "Opening paragraph.",
      "",
      "## Saturday Morning Energy",
      "",
      "A section about pacing and color.",
      "",
      "## Collector Shelf Memory",
      "",
      "A section about objects and display shelves.",
      "",
      "## Toy Aisle Tension",
      "",
      "A section about parent and kid expectations.",
      "",
      "## Commercial Break Glow",
      "",
      "A section about light, screens, and room atmosphere.",
    ].join("\n"),
    count: 2,
  });

  assert.deepEqual(
    requests.map((request) => request.sectionHeading),
    ["Collector Shelf Memory", "Toy Aisle Tension"],
  );
});

test("gives each requested body image a distinct visual assignment", () => {
  const requests = buildArticleBodyImageRequests({
    title: "Why 1980s Toy Commercials Still Feel Electric",
    angle: "Connect the pacing of retro toy ads to modern collector nostalgia.",
    primaryKeyword: "1980s toy commercials",
    contentMarkdown: [
      "Opening paragraph.",
      "",
      "## Saturday Morning Energy",
      "",
      "A section about pacing and color.",
      "",
      "## Collector Shelf Memory",
      "",
      "A section about objects and display shelves.",
      "",
      "## Toy Aisle Tension",
      "",
      "A section about parent and kid expectations.",
      "",
      "## Commercial Break Glow",
      "",
      "A section about light, screens, and room atmosphere.",
    ].join("\n"),
    count: 4,
  });
  const assignments = requests.map((request) =>
    /Visual assignment: ([^.]+)/.exec(request.prompt)?.[1],
  );

  assert.equal(requests.length, 4);
  assert.equal(new Set(assignments).size, 4);
  assert.match(requests[0]?.prompt ?? "", /wide establishing scene/i);
  assert.match(requests[1]?.prompt ?? "", /close editorial detail/i);
  assert.match(requests[2]?.prompt ?? "", /human-scale moment/i);
  assert.match(requests[3]?.prompt ?? "", /atmospheric texture/i);
});

test("keeps fallback body image prompts distinct when there are fewer headings than images", () => {
  const requests = buildArticleBodyImageRequests({
    title: "Retro Cereal Mascot Rivalries",
    angle: "Show how character conflict helped sell breakfast cereal nostalgia.",
    primaryKeyword: "retro cereal mascot rivalries",
    contentMarkdown: "Opening paragraph with no subheadings yet.",
    count: 3,
  });
  const prompts = requests.map((request) => request.prompt);

  assert.equal(requests.length, 3);
  assert.equal(new Set(prompts).size, 3);
  assert.equal(requests[0]?.sectionHeading, "Retro Cereal Mascot Rivalries");
  assert.equal(requests[1]?.sectionHeading, "Retro Cereal Mascot Rivalries visual 2");
  assert.equal(requests[2]?.sectionHeading, "Retro Cereal Mascot Rivalries visual 3");
});

test("inserts generated body image markdown after matching headings once", () => {
  const contentMarkdown = [
    "Intro paragraph.",
    "",
    "## Saturday Morning Energy",
    "",
    "A section.",
    "",
    "## Collector Shelf Memory",
    "",
    "Another section.",
  ].join("\n");
  const withImages = insertArticleBodyImageMarkdown(contentMarkdown, [
    {
      altText: "1980s toy commercials body image for Saturday Morning Energy",
      publicPath: "/generated/article-body-1.png",
      sectionHeading: "Saturday Morning Energy",
    },
    {
      altText: "1980s toy commercials body image for Collector Shelf Memory",
      publicPath: "/generated/article-body-2.png",
      sectionHeading: "Collector Shelf Memory",
    },
  ]);

  assert.match(withImages, /## Saturday Morning Energy\n\n!\[1980s toy commercials body image/);
  assert.match(withImages, /!\[1980s toy commercials body image for Collector Shelf Memory\]\(\/generated\/article-body-2\.png\)/);
  assert.equal(
    insertArticleBodyImageMarkdown(withImages, [
      {
        altText: "1980s toy commercials body image for Saturday Morning Energy",
        publicPath: "/generated/article-body-1.png",
        sectionHeading: "Saturday Morning Energy",
      },
    ]),
    withImages,
  );
});

test("removes generated body image markdown without disturbing nearby copy", () => {
  const contentMarkdown = [
    "Intro paragraph.",
    "",
    "## Saturday Morning Energy",
    "",
    "![1980s toy commercials body image](/generated/article-body-1.png)",
    "",
    "A section.",
    "",
    "![External reference](https://example.com/reference.png)",
  ].join("\n");

  const withoutGeneratedImage = removeArticleBodyImageMarkdown(contentMarkdown, [
    { publicPath: "/generated/article-body-1.png" },
  ]);

  assert.doesNotMatch(withoutGeneratedImage, /article-body-1/);
  assert.match(withoutGeneratedImage, /A section/);
  assert.match(withoutGeneratedImage, /https:\/\/example\.com\/reference\.png/);
});
