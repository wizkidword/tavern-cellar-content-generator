import assert from "node:assert/strict";
import test from "node:test";

import {
  appendArticleLinkReference,
  createArticleLinkSuggestions,
  insertArticleLinkSuggestion,
  type ArticleLinkTarget,
} from "@/lib/intelligence/article-link-insertion";

const publishedTarget: ArticleLinkTarget = {
  id: "site-post:wp-1950s",
  targetKey: "site-post:wp-1950s",
  targetType: "SITE_POST",
  title: "1950s Cereal Ads Made Breakfast a Family Stage",
  slug: "1950s-cereal-ads-breakfast-family-stage",
  link: "https://taverncellar.test/1950s-cereal-ads-breakfast-family-stage/",
  excerpt: "Mascots and scientific nutrition promises reshaped the postwar pantry.",
  wpStatus: "publish",
  categoryName: "Retro Advertising",
  categoryIds: [5],
  publishedAt: new Date("2026-01-10T12:00:00.000Z"),
  isPublished: true,
};

test("builds an exact, deterministic article-link insertion from a known target", () => {
  const markdown = [
    "# Postwar Breakfast",
    "",
    "## The changing pantry",
    "",
    "Cereal mascots and nutrition promises made the breakfast table a stage for postwar optimism.",
    "",
    "## Lasting influence",
    "",
    "The campaign style stayed visible long after the first ads aired.",
  ].join("\n");
  const suggestions = createArticleLinkSuggestions({
    contentMarkdown: markdown,
    primaryKeyword: "1950s cereal ads",
    angle: "Explain how cereal mascots and scientific nutrition shaped postwar kitchens.",
    categoryId: 5,
    targets: [publishedTarget],
  });
  const suggestion = suggestions[0];

  assert.equal(suggestion?.title, publishedTarget.title);
  assert.equal(suggestion?.anchor, publishedTarget.title);
  assert.equal(suggestion?.location, "After “The changing pantry”");
  assert.equal(suggestion?.alreadyLinked, false);
  assert.match(suggestion?.reason ?? "", /title|excerpt/i);

  const inserted = insertArticleLinkSuggestion(markdown, suggestion!);

  assert.match(
    inserted,
    /## The changing pantry\n\nFurther reading: \[1950s Cereal Ads Made Breakfast a Family Stage\]\(https:\/\/taverncellar\.test\/1950s-cereal-ads-breakfast-family-stage\/\)/,
  );
  assert.equal(
    appendArticleLinkReference("", suggestion!),
    "1950s Cereal Ads Made Breakfast a Family Stage - https://taverncellar.test/1950s-cereal-ads-breakfast-family-stage/",
  );
});

test("prevents duplicate target insertion after an article already links to that destination", () => {
  const markdown = [
    "## The changing pantry",
    "",
    "Further reading: [Existing guide](https://taverncellar.test/1950s-cereal-ads-breakfast-family-stage/)",
  ].join("\n");
  const suggestion = createArticleLinkSuggestions({
    contentMarkdown: markdown,
    primaryKeyword: "1950s cereal ads",
    angle: "Explain the breakfast advertising shift.",
    categoryId: 5,
    targets: [publishedTarget],
  })[0];

  assert.equal(suggestion?.alreadyLinked, true);
  assert.throws(() => insertArticleLinkSuggestion(markdown, suggestion!), /already present/i);
});

test("warns when a suggestion targets an unpublished local article", () => {
  const localDraft: ArticleLinkTarget = {
    ...publishedTarget,
    id: "local-article:draft-1",
    targetKey: "local-article:draft-1",
    targetType: "LOCAL_ARTICLE",
    title: "Cereal Mascots Before Saturday Morning Television",
    slug: "cereal-mascots-before-saturday-morning-television",
    link: null,
    wpStatus: "draft",
    isPublished: false,
  };
  const suggestion = createArticleLinkSuggestions({
    contentMarkdown: "## Breakfast brands\n\nMascots carried advertising into the family kitchen.",
    primaryKeyword: "cereal mascots",
    angle: "Trace early television-era cereal advertising.",
    categoryId: 5,
    targets: [localDraft],
  })[0];

  assert.equal(suggestion?.url, "/cereal-mascots-before-saturday-morning-television");
  assert.match(suggestion?.unpublishedWarning ?? "", /unpublished local draft/i);
});
