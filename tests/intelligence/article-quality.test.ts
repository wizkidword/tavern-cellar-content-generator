import test from "node:test";
import assert from "node:assert/strict";

import {
  analyzeArticleQuality,
  parseArticleQualityWarnings,
} from "@/lib/intelligence/article-quality";

function repeatedWords(count: number) {
  return Array.from({ length: count }, (_, index) => `memory${index}`).join(" ");
}

test("scores article quality signals from deterministic article fields", () => {
  const quality = analyzeArticleQuality({
    title: "1950s cereal ads and the postwar breakfast pitch",
    primaryKeyword: "1950s cereal ads",
    contentMarkdown: [
      "1950s cereal ads turned breakfast into a bright promise for busy families.",
      "",
      "## Mascots made the pantry feel friendly",
      repeatedWords(450),
      "",
      "## Nutrition claims gave sweetness a scientific costume",
      repeatedWords(450),
      "",
      "## Package design sold the modern morning",
      repeatedWords(260),
      "",
      "Which cereal mascot or commercial still sticks with you? Share your thoughts in the comments.",
    ].join("\n"),
    metaTitle: "1950s Cereal Ads And The Postwar Breakfast Pitch",
    metaDescription:
      "Explore how 1950s cereal ads used mascots, sweetness, convenience, and nutrition claims to sell postwar breakfast culture.",
    internalLinks: [
      "https://taverncellar.test/vintage-mascot-advertising/",
      "https://taverncellar.test/retro-breakfast-commercials/",
    ].join("\n"),
  });

  assert.ok(quality.wordCount >= 900);
  assert.equal(quality.headingCount, 3);
  assert.equal(quality.internalLinkCount, 2);
  assert.equal(quality.focusKeyphraseInTitle, true);
  assert.equal(quality.focusKeyphraseInOpening, true);
  assert.equal(quality.warnings.length, 0);
});

test("warns when drafts are thin, unlinked, and missing the focus phrase", () => {
  const quality = analyzeArticleQuality({
    title: "Breakfast Commercials And Family Habits",
    primaryKeyword: "1950s cereal ads",
    contentMarkdown: "A short draft about television breakfast nostalgia.",
    metaTitle: "Breakfast",
    metaDescription: "Too short.",
    internalLinks: "",
  });

  assert.ok(quality.warnings.some((warning) => /under 900 words/i.test(warning)));
  assert.ok(quality.warnings.some((warning) => /internal link/i.test(warning)));
  assert.ok(quality.warnings.some((warning) => /focus keyphrase/i.test(warning)));
  assert.deepEqual(parseArticleQualityWarnings(JSON.stringify(quality.warnings)), quality.warnings);
  assert.deepEqual(parseArticleQualityWarnings("not json"), []);
});

test("warns when drafts do not end with a reader engagement call to action", () => {
  const quality = analyzeArticleQuality({
    title: "1950s cereal ads and the postwar breakfast pitch",
    primaryKeyword: "1950s cereal ads",
    contentMarkdown: [
      "1950s cereal ads turned breakfast into a bright promise for busy families.",
      "",
      "## Mascots made the pantry feel friendly",
      repeatedWords(450),
      "",
      "## Nutrition claims gave sweetness a scientific costume",
      repeatedWords(450),
      "",
      "## Package design sold the modern morning",
      repeatedWords(260),
      "",
      "That legacy still explains why old cereal commercials remain such durable pop-culture artifacts.",
    ].join("\n"),
    metaTitle: "1950s Cereal Ads And The Postwar Breakfast Pitch",
    metaDescription:
      "Explore how 1950s cereal ads used mascots, sweetness, convenience, and nutrition claims to sell postwar breakfast culture.",
    internalLinks: [
      "https://taverncellar.test/vintage-mascot-advertising/",
      "https://taverncellar.test/retro-breakfast-commercials/",
    ].join("\n"),
  });

  assert.ok(quality.warnings.some((warning) => /share their thoughts/i.test(warning)));
});

test("accepts drafts that close by asking readers to share their thoughts", () => {
  const quality = analyzeArticleQuality({
    title: "1950s cereal ads and the postwar breakfast pitch",
    primaryKeyword: "1950s cereal ads",
    contentMarkdown: [
      "1950s cereal ads turned breakfast into a bright promise for busy families.",
      "",
      "## Mascots made the pantry feel friendly",
      repeatedWords(450),
      "",
      "## Nutrition claims gave sweetness a scientific costume",
      repeatedWords(450),
      "",
      "## Package design sold the modern morning",
      repeatedWords(260),
      "",
      "Which cereal mascot or commercial still sticks with you? Share your thoughts in the comments.",
    ].join("\n"),
    metaTitle: "1950s Cereal Ads And The Postwar Breakfast Pitch",
    metaDescription:
      "Explore how 1950s cereal ads used mascots, sweetness, convenience, and nutrition claims to sell postwar breakfast culture.",
    internalLinks: [
      "https://taverncellar.test/vintage-mascot-advertising/",
      "https://taverncellar.test/retro-breakfast-commercials/",
    ].join("\n"),
  });

  assert.equal(
    quality.warnings.some((warning) => /share their thoughts/i.test(warning)),
    false,
  );
});
