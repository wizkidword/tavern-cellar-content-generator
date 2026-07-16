import assert from "node:assert/strict";
import test from "node:test";

import {
  buildArticleTitleVarietyGuidance,
  diversifyArticleTitleOpening,
} from "@/lib/openai";

test("builds title guidance that discourages retro as a repeated opener", () => {
  const guidance = buildArticleTitleVarietyGuidance({
    categoryName: "Retro Advertising",
    categorySlug: "retro-advertising",
    primaryKeyword: "retro breakfast commercials",
    recentTitles: [
      "Retro Mascot Rivalries That Sold Saturday Morning Cereal",
      "Retro Toy Commercials And The Art Of The Hard Sell",
    ],
  }).join("\n");

  assert.match(guidance, /title variety/i);
  assert.match(guidance, /retro/i);
  assert.match(guidance, /do not start/i);
  assert.match(guidance, /focus keyphrase can appear later/i);
});

test("moves an overused retro opener behind a varied title starter", () => {
  const title = diversifyArticleTitleOpening({
    title: "Retro Breakfast Commercials Sold Parents A Faster Morning",
    categoryName: "Retro Advertising",
    categorySlug: "retro-advertising",
    primaryKeyword: "retro breakfast commercials",
    recentTitles: [
      "Retro Mascot Rivalries That Sold Saturday Morning Cereal",
      "Retro Toy Commercials And The Art Of The Hard Sell",
    ],
  });

  assert.doesNotMatch(title, /^retro\b/i);
  assert.match(title, /retro breakfast commercials/i);
});

test("removes repeated title phrases before drafts are saved", () => {
  const title = diversifyArticleTitleOpening({
    title:
      "A Super Nintendo Classic That Never Wastes Your Time: Chrono Trigger on Super Nintendo",
    categoryName: "Games",
    categorySlug: "games",
    primaryKeyword: "Chrono Trigger on Super Nintendo",
    recentTitles: [],
  });

  assert.equal(
    title,
    "A Classic That Never Wastes Your Time: Chrono Trigger on Super Nintendo",
  );
  assert.equal(title.match(/super nintendo/gi)?.length, 1);
});

test("removes repeated platform phrases even without a title separator", () => {
  const title = diversifyArticleTitleOpening({
    title: "Chrono Trigger on Super Nintendo Is the Super Nintendo Classic Worth Revisiting",
    categoryName: "Games",
    categorySlug: "games",
    primaryKeyword: "Chrono Trigger on Super Nintendo",
    recentTitles: [],
  });

  assert.equal(
    title,
    "Chrono Trigger on Super Nintendo Is the Classic Worth Revisiting",
  );
  assert.equal(title.match(/super nintendo/gi)?.length, 1);
});
