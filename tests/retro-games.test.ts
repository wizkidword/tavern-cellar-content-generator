import assert from "node:assert/strict";
import test from "node:test";

import {
  buildRetroGamesArticleGuidance,
  buildRetroGamesStrategyGuidance,
  getRetroGameCutoffYear,
  isRetroGamesCategory,
  screenRetroGameOpportunities,
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
  assert.match(guidance, /different wording alone/i);
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

test("rejects a rewritten Games opportunity that repeats an existing game", () => {
  const [decision] = screenRetroGameOpportunities({
    opportunities: [
      {
        primaryKeyword: "Deus Ex on PC",
        angle: "Why Deus Ex on PC still makes player choice feel disruptive in the best way",
        brief: "Reassess its systems, pacing, and player choice for modern retro players.",
      },
    ],
    existingCoverage: [
      {
        source: "app",
        title: "Why Deus Ex on PC Still Feels More Open Than Most Modern Games",
        primaryKeyword: "Deus Ex on PC",
        angle: "A modern retrospective on why Deus Ex still feels uniquely flexible, showing how its systems, pacing, and player choice hold up.",
      },
    ],
  });

  assert.equal(decision?.allowed, false);
  assert.match(decision?.reason ?? "", /already covered/i);
});

test("recognizes a shortened game title as repeat coverage", () => {
  const [decision] = screenRetroGameOpportunities({
    opportunities: [
      {
        primaryKeyword: "Majora's Mask on Nintendo 64",
        angle: "How Majora's Mask on Nintendo 64 makes a repeating three-day cycle feel anxious",
        brief: "Reassess the time loop, side quests, and pressure for modern players.",
      },
    ],
    existingCoverage: [
      {
        source: "app",
        title: "Three Days, One Town, Endless Pressure: Rethinking The Legend of Zelda: Majora's Mask on Nintendo 64",
        primaryKeyword: "The Legend of Zelda: Majora's Mask on Nintendo 64",
        angle: "A cultural and design reassessment of how repetition, pressure, and side quests became the game's defining identity.",
      },
    ],
  });

  assert.equal(decision?.allowed, false);
});

test("allows the same game only when its editorial format and focus are completely different", () => {
  const [decision] = screenRetroGameOpportunities({
    opportunities: [
      {
        primaryKeyword: "Deus Ex on PC",
        angle: "A production-history feature about the development decisions behind Deus Ex on PC",
        brief: "Trace Ion Storm's production timeline, the team's archived planning material, and the decisions that shaped the finished game.",
      },
    ],
    existingCoverage: [
      {
        source: "app",
        title: "Why Deus Ex on PC Still Feels More Open Than Most Modern Games",
        primaryKeyword: "Deus Ex on PC",
        angle: "A design breakdown of how player choice, missions, and systems still hold up.",
      },
    ],
  });

  assert.equal(decision?.allowed, true);
});

test("blocks Games repeats when WordPress is the only available coverage record", () => {
  const [decision] = screenRetroGameOpportunities({
    opportunities: [
      {
        primaryKeyword: "Chrono Trigger on Super Nintendo",
        angle: "Why Chrono Trigger on Super Nintendo still feels brisk and modern",
        brief: "Reassess the RPG's pacing and party design for modern players.",
      },
    ],
    existingCoverage: [
      {
        source: "site",
        title: "A Super Nintendo Classic That Never Wastes Your Time: Chrono Trigger",
        angle: "A Super Nintendo Classic That Never Wastes Your Time: Chrono Trigger",
      },
    ],
  });

  assert.equal(decision?.allowed, false);
});

test("prevents repeats within the same newly generated Games batch", () => {
  const decisions = screenRetroGameOpportunities({
    opportunities: [
      {
        primaryKeyword: "Mister Mosquito on PlayStation 2",
        angle: "A weird-history feature about a tiny premise becoming tense stealth comedy",
        brief: "Explore its strange household setting and the early PlayStation 2 era's appetite for odd experiments.",
      },
      {
        primaryKeyword: "Mister Mosquito on PlayStation 2",
        angle: "Why Mister Mosquito on PlayStation 2 remains a bizarre cult classic",
        brief: "Reassess the weird stealth game for modern players.",
      },
    ],
    existingCoverage: [],
  });

  assert.equal(decisions[0]?.allowed, true);
  assert.equal(decisions[1]?.allowed, false);
});
