import assert from "node:assert/strict";
import { after, test } from "node:test";

import { createArticleClaim, updateArticleClaim } from "@/lib/article-claims";
import { createArticleRecordFromPreparedDraft, type PreparedArticleDraft } from "@/lib/content-pipeline";
import { prisma } from "@/lib/db";

after(async () => {
  await prisma.$disconnect();
});

test("persists proposed claims as open and lets the operator verify a scoped claim", async () => {
  const category = await prisma.category.create({
    data: {
      wpCategoryId: 80902,
      name: "Claim Verification",
      slug: "claim-verification",
      postCount: 0,
    },
  });
  const prepared = {
    data: {
      categoryId: category.id,
      title: "Claim Verification Test Article",
      normalizedTitle: "claim verification test article",
      angle: "Exercise the claims-to-verify checklist.",
      normalizedAngle: "exercise the claims to verify checklist",
      primaryKeyword: "claim verification",
      normalizedKeyword: "claim verification",
      canonicalTopicKey: "claim-verification-test",
      slug: "claim-verification-test",
      contentMarkdown: "## Opening\n\nTest content.",
      metaTitle: "Claim Verification Test Article",
      metaDescription: "A test article for structured editorial claims.",
      excerpt: "A test article for structured editorial claims.",
      tags: "",
      internalLinks: "",
      featuredImagePrompt: "Test image prompt for a claims checklist.",
      featuredImageAlt: "Test image for a claims checklist",
      openAiTextModel: "gpt-5-mini",
    },
    proposedClaims: ["The original release date should be checked against a primary archive."],
    generateImage: false,
    imageProvider: "fal",
    falImageModel: "fal-ai/flux-2",
    openAiImageModel: "gpt-image-1-mini",
    bodyImageCount: 0,
  } satisfies PreparedArticleDraft;

  const article = await prisma.$transaction((transaction) =>
    createArticleRecordFromPreparedDraft(transaction, prepared),
  );
  const proposedClaim = await prisma.articleClaim.findFirstOrThrow({ where: { articleId: article.id } });

  assert.equal(proposedClaim.status, "OPEN");
  assert.equal(proposedClaim.sourceUrl, null);

  await updateArticleClaim(article.id, proposedClaim.id, {
    claim: proposedClaim.claim,
    sourceUrl: "https://example.com/archive",
    note: "Primary archive checked.",
    status: "VERIFIED",
  });

  const manuallyAdded = await createArticleClaim(article.id, {
    claim: "A separate claim is open until an editor reviews it.",
    sourceUrl: "",
    note: "",
  });
  const claims = await prisma.articleClaim.findMany({
    where: { articleId: article.id },
    orderBy: { createdAt: "asc" },
  });

  assert.equal(claims.length, 2);
  assert.equal(claims[0]?.status, "VERIFIED");
  assert.equal(claims[0]?.sourceUrl, "https://example.com/archive");
  assert.equal(manuallyAdded.status, "OPEN");
});
