import test from "node:test";
import assert from "node:assert/strict";

import {
  buildOpportunityGenerationNotes,
  buildOpportunityInsight,
  canDeleteOpportunity,
  canGenerateOpportunityDraft,
  getOpportunityWorkflowState,
} from "@/lib/intelligence/opportunities";
import { parseContentOpportunityIdeasPayload } from "@/lib/openai";

test("builds an opportunity insight from coverage, duplicate, and link signals", () => {
  const insight = buildOpportunityInsight({
    categoryId: 5,
    categoryName: "Retro Advertising",
    keyword: "1950s cereal ads",
    angle:
      "Use the ads to unpack sweetness, convenience foods, and scientific nutrition in the decade.",
    brief: "A Tavern Cellar article about mascots, package design, and modern pantry anxiety.",
    coverageLabel: "quiet",
    localArticles: [],
    sitePostDuplicateCandidates: [
      {
        id: "wp-1",
        source: "site",
        categoryId: 5,
        title: "1950s Cereal Ads Made Breakfast a Family Stage",
        angle: "Mascots and sweetness promises reshaped morning routines.",
        status: "publish",
      },
    ],
    internalLinkCandidates: [
      {
        id: "wp-1",
        title: "1950s Cereal Ads Made Breakfast a Family Stage",
        slug: "1950s-cereal-ads-breakfast-family-stage",
        link: "https://taverncellar.test/1950s-cereal-ads-breakfast-family-stage/",
        excerpt: "Mascots, sweetness, convenience foods, and scientific nutrition promises.",
        wpStatus: "publish",
        categoryName: "Retro Advertising",
        categoryIds: [5],
        publishedAt: new Date("2026-01-10T12:00:00.000Z"),
      },
    ],
  });

  assert.equal(insight.duplicateAssessment.label, "crowded");
  assert.equal(insight.internalLinks[0]?.sitePostId, "wp-1");
  assert.ok(insight.score.overallScore >= 70);
  assert.ok(insight.score.reasons.length > 0);
});

test("keeps weak opportunities visibly low when duplicate risk is high and links are absent", () => {
  const insight = buildOpportunityInsight({
    categoryId: 2,
    categoryName: "Movies",
    keyword: "best movies",
    angle: "A list of movies everyone should watch.",
    brief: "Rank popular movies.",
    coverageLabel: "overloaded",
    localArticles: [
      {
        id: "article-1",
        source: "app",
        categoryId: 2,
        title: "Best Movies Everyone Should Watch",
        angle: "A list of movies everyone should watch.",
        status: "GENERATED",
      },
    ],
    sitePostDuplicateCandidates: [],
    internalLinkCandidates: [],
  });

  assert.equal(insight.duplicateAssessment.label, "too_similar");
  assert.equal(insight.internalLinks.length, 0);
  assert.ok(insight.score.overallScore < 55);
  assert.ok(insight.score.reasons.some((reason) => /generic/i.test(reason)));
});

test("builds generation notes with the opportunity brief and real internal links", () => {
  const notes = buildOpportunityGenerationNotes({
    brief: "Focus on Saturday morning toy ad pacing and collecting nostalgia.",
    overallScore: 82,
    internalLinks: [
      {
        title: "Vintage Mascot Advertising Before Saturday Morning TV",
        url: "https://taverncellar.test/vintage-mascot-advertising-before-tv/",
        reason: "title overlap; same category",
        confidence: 88,
      },
    ],
  });

  assert.match(notes, /Opportunity brief:/);
  assert.match(notes, /Content intelligence score: 82/);
  assert.match(notes, /Vintage Mascot Advertising/);
  assert.match(notes, /https:\/\/taverncellar\.test/);
  assert.match(notes, /88% confidence/);
});

test("allows draft generation only from idea or approved opportunities", () => {
  assert.equal(canGenerateOpportunityDraft("IDEA"), true);
  assert.equal(canGenerateOpportunityDraft("APPROVED"), true);
  assert.equal(canGenerateOpportunityDraft("GENERATED"), false);
  assert.equal(canGenerateOpportunityDraft("REJECTED"), false);
  assert.equal(canGenerateOpportunityDraft("ARCHIVED"), false);
});

test("allows deleting known opportunity records from the queue", () => {
  assert.equal(canDeleteOpportunity("IDEA"), true);
  assert.equal(canDeleteOpportunity("APPROVED"), true);
  assert.equal(canDeleteOpportunity("GENERATED"), true);
  assert.equal(canDeleteOpportunity("REJECTED"), true);
  assert.equal(canDeleteOpportunity("ARCHIVED"), true);
  assert.equal(canDeleteOpportunity("MIGRATING"), false);
});

test("shows generated opportunities as openable drafts instead of disabled generation work", () => {
  assert.deepEqual(
    getOpportunityWorkflowState({
      status: "GENERATED",
      generatedArticleId: "article-123",
    }),
    {
      mode: "open_generated_draft",
      message: "This opportunity already has a generated draft.",
      canGenerateDraft: false,
    },
  );
});

test("keeps idea and approved opportunities ready for draft generation", () => {
  assert.deepEqual(
    getOpportunityWorkflowState({
      status: "IDEA",
      generatedArticleId: null,
    }),
    {
      mode: "generate_draft",
      message: "This opportunity is ready to generate a draft.",
      canGenerateDraft: true,
    },
  );
});

test("validates AI opportunity ideas without accepting invented links", () => {
  const opportunities = parseContentOpportunityIdeasPayload({
    opportunities: [
      {
        primaryKeyword: "1950s cereal ads",
        angle: "Use 1950s cereal ads to unpack sweetness, convenience, and scientific nutrition.",
        brief: "Focus on package design, mascot warmth, and the postwar pantry as a Tavern Cellar nostalgia lane.",
      },
      {
        primaryKeyword: "vintage mascot advertising",
        angle: "Trace how vintage mascot advertising made brands feel like familiar household characters.",
        brief: "Connect cereal, toy, and snack mascots to repeat viewing, kid appeal, and collectible memory.",
      },
      {
        primaryKeyword: "retro breakfast commercials",
        angle: "Show how retro breakfast commercials sold speed, comfort, and a brighter family morning.",
        brief: "Use real ad language and visual cues to build a stronger Retro Advertising content lane.",
      },
    ],
  });

  assert.equal(opportunities.length, 3);
  assert.equal(opportunities[0]?.primaryKeyword, "1950s cereal ads");
  assert.throws(
    () =>
      parseContentOpportunityIdeasPayload({
        opportunities: [
          {
            primaryKeyword: "1950s cereal ads",
            angle: "Use 1950s cereal ads to unpack sweetness, convenience, and scientific nutrition.",
            brief: "Focus on package design, mascot warmth, and the postwar pantry as a nostalgia lane.",
            internalLinks: ["https://made-up.example/fake-link"],
          },
          {
            primaryKeyword: "vintage mascot advertising",
            angle: "Trace how vintage mascot advertising made brands feel like familiar household characters.",
            brief: "Connect cereal, toy, and snack mascots to repeat viewing, kid appeal, and collectible memory.",
          },
          {
            primaryKeyword: "retro breakfast commercials",
            angle: "Show how retro breakfast commercials sold speed, comfort, and a brighter family morning.",
            brief: "Use real ad language and visual cues to build a stronger Retro Advertising content lane.",
          },
        ],
      }),
    /invalid opportunity ideas/i,
  );
});

test("expands short AI opportunity angle labels from the brief", () => {
  const opportunities = parseContentOpportunityIdeasPayload({
    opportunities: [
      {
        primaryKeyword: "Sonic the Hedgehog Sega Genesis",
        angle: "First play",
        brief:
          "Frame Sonic the Hedgehog as a first-time player review of speed, level flow, Green Hill Zone readability, and why the Genesis mascot still works for modern retro-curious readers.",
      },
      {
        primaryKeyword: "Redneck Rampage MS-DOS",
        angle: "Looking back",
        brief:
          "Use Redneck Rampage on MS-DOS as a looking-back piece about crude humor, Build engine design, late-1990s PC shooter culture, and what feels charming or rough today.",
      },
      {
        primaryKeyword: "Super Mario Bros NES",
        angle: "1985 review",
        brief:
          "Revisit Super Mario Bros. on NES as a design breakdown of movement, stage rhythm, secrets, and why its first-world lessons still define platformers.",
      },
    ],
  });

  assert.equal(opportunities.length, 3);
  assert.ok(opportunities[0]);
  assert.ok(opportunities[1]);
  assert.ok(opportunities[2]);
  assert.ok(opportunities[0].angle.length >= 20);
  assert.ok(opportunities[1].angle.length >= 20);
  assert.ok(opportunities[2].angle.length >= 20);
  assert.match(opportunities[0].angle, /Sonic the Hedgehog|first-time player/i);
  assert.match(opportunities[1].angle, /Redneck Rampage|looking-back/i);
  assert.match(opportunities[2].angle, /Super Mario Bros|design breakdown/i);
});
