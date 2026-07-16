import assert from "node:assert/strict";
import test from "node:test";

import {
  buildRetroGamesArticleGuidance,
  buildRetroGamesStrategyGuidance,
  getRetroGameCutoffYear,
  isRetroGamesCategory,
} from "@/lib/retro-games";

test("recognizes only the Games category as retro single-game coverage", () => {
  assert.equal(isRetroGamesCategory({ name: "Games", slug: "games" }), true);
  assert.equal(isRetroGamesCategory({ name: "Retro Gaming", slug: "retro-gaming" }), false);
  assert.equal(isRetroGamesCategory({ name: "Tabletop Games", slug: "tabletop-games" }), false);
});

test("uses a twenty-year retro cutoff for games coverage", () => {
  assert.equal(getRetroGameCutoffYear(new Date("2026-06-13T12:00:00.000Z")), 2006);
});

test("builds Games opportunity guidance for varied single-game retro angles", () => {
  const guidance = buildRetroGamesStrategyGuidance(
    new Date("2026-06-13T12:00:00.000Z"),
  ).join("\n");

  assert.match(guidance, /one specific video game/i);
  assert.match(guidance, /20 years old or older/i);
  assert.match(guidance, /2006 or earlier/i);
  assert.match(guidance, /Sonic the Hedgehog/i);
  assert.match(guidance, /Redneck Rampage/i);
  assert.match(guidance, /first-time player/i);
  assert.match(guidance, /looking back/i);
  assert.match(guidance, /complete editorial directions/i);
  assert.match(guidance, /avoid broad lists/i);
});

test("builds article guidance that keeps Games drafts scoped to one qualifying game", () => {
  const guidance = buildRetroGamesArticleGuidance(
    new Date("2026-06-13T12:00:00.000Z"),
  ).join("\n");

  assert.match(guidance, /single specific game/i);
  assert.match(guidance, /released in 2006 or earlier/i);
  assert.match(guidance, /not a franchise-wide overview/i);
});
