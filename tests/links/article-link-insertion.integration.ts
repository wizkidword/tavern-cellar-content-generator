import assert from "node:assert/strict";
import { after, test } from "node:test";

import {
  getArticleInternalLinkSuggestions,
  insertArticleInternalLink,
} from "@/lib/article-internal-links";
import { prisma } from "@/lib/db";

after(async () => {
  await prisma.$disconnect();
});

test("inserts a server-resolved WordPress target once and records the matching reference", async () => {
  const category = await prisma.category.create({
    data: {
      wpCategoryId: 80903,
      name: "Link Insertion",
      slug: "link-insertion",
      postCount: 0,
    },
  });
  const target = await prisma.sitePost.create({
    data: {
      wpPostId: 80903,
      title: "Cereal Mascots Made Breakfast Advertising Feel Like Family",
      normalizedTitle: "cereal mascots made breakfast advertising feel like family",
      slug: "cereal-mascots-breakfast-advertising",
      excerpt: "Mascots and package design shaped the changing breakfast table.",
      canonicalTopicKey: "cereal-mascots-breakfast-advertising",
      wpStatus: "publish",
      link: "https://taverncellar.test/cereal-mascots-breakfast-advertising/",
      primaryCategoryId: category.id,
      rawCategoryIds: JSON.stringify([80903]),
    },
  });
  const article = await prisma.article.create({
    data: {
      categoryId: category.id,
      title: "How Cereal Mascots Changed the Postwar Pantry",
      normalizedTitle: "how cereal mascots changed the postwar pantry",
      angle: "Explain the connection between breakfast advertising and family ritual.",
      normalizedAngle: "explain the connection between breakfast advertising and family ritual",
      primaryKeyword: "cereal mascots",
      normalizedKeyword: "cereal mascots",
      canonicalTopicKey: "how-cereal-mascots-changed-postwar-pantry",
      slug: "how-cereal-mascots-changed-postwar-pantry",
      contentMarkdown: "## Breakfast brands\n\nMascots carried advertising into the family kitchen.",
      metaTitle: "How Cereal Mascots Changed the Postwar Pantry",
      metaDescription: "How cereal mascots changed family breakfast advertising after the war.",
      excerpt: "A review article for deterministic internal link insertion.",
      tags: "",
      internalLinks: "",
      featuredImagePrompt: "A breakfast table with vintage cereal package design.",
      featuredImageAlt: "Vintage breakfast cereal packaging on a family table",
      openAiTextModel: "gpt-5-mini",
    },
  });
  const suggestion = (await getArticleInternalLinkSuggestions(article.id))?.find(
    (candidate) => candidate.targetKey === `site-post:${target.id}`,
  );

  assert.ok(suggestion);
  assert.equal(suggestion.alreadyLinked, false);

  const updated = await insertArticleInternalLink(article.id, suggestion.targetKey);

  assert.match(
    updated.contentMarkdown,
    /\[Cereal Mascots Made Breakfast Advertising Feel Like Family\]\(https:\/\/taverncellar\.test\/cereal-mascots-breakfast-advertising\/\)/,
  );
  assert.match(updated.internalLinks, /https:\/\/taverncellar\.test\/cereal-mascots-breakfast-advertising\//);
  await assert.rejects(
    () => insertArticleInternalLink(article.id, suggestion.targetKey),
    /already present/i,
  );
});
