import { randomUUID } from "node:crypto";

import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

function buildReviewForm(runId: string, timestamp: string, slug: string, categoryId: number) {
  const formData = new FormData();
  const title = `Foundry Release Smoke Draft ${runId}`;

  for (const [key, value] of Object.entries({
    categoryId: String(categoryId),
    title,
    primaryKeyword: `Tavern Cellar Foundry release smoke test ${runId}`,
    slug,
    angle: `Verify that Foundry creates and then updates one recoverable WordPress draft ${runId}.`,
    contentMarkdown: [
      "## Release smoke test",
      "",
      "This clearly labeled draft verifies Foundry's authenticated WordPress publish, operation-key lookup, durable checkpoint, repeat update, and full private sync paths. It is not editorial content and must remain a draft.",
      "",
      "## Verification boundary",
      "",
      "The test uses no AI generation and no image generation. It records the same WordPress draft twice so the second request must update the known post instead of creating another one.",
    ].join("\n"),
    scheduledFor: "",
    metaTitle: `Foundry smoke ${runId}`,
    metaDescription: "A labeled draft created only to verify Tavern Cellar Foundry's release path.",
    excerpt: "A labeled, non-editorial draft used for a Tavern Cellar Foundry release smoke test.",
    tags: "",
    internalLinks: "",
    featuredImagePrompt: "No image is generated for this release smoke test.",
    featuredImageAlt: "No image generated",
    notes: `Release smoke test ${timestamp}. Keep this WordPress post as a draft until it is manually removed.`,
    bodyImageCount: "0",
    imageProvider: "fal",
    falImageModel: "fal-ai/flux-2",
    openAiImageModel: "gpt-image-2",
  })) {
    formData.set(key, value);
  }

  return formData;
}

async function main() {
  const confirmation = process.env.FOUNDRY_RELEASE_SMOKE_CONFIRM;
  if (confirmation !== "publish-draft") {
    throw new Error(
      "Refusing to contact WordPress. Set FOUNDRY_RELEASE_SMOKE_CONFIRM=publish-draft to run the live draft-only smoke test.",
    );
  }

  const { prisma } = await import("@/lib/db");
  const { publishArticle } = await import("@/lib/content-pipeline");
  const { findWordPressPostByOperationKey, syncWordPressCatalog } = await import("@/lib/wordpress");

  const runId = randomUUID().slice(0, 8);
  const timestamp = new Date().toISOString();
  const slug = `foundry-release-smoke-${Date.now()}`;

  try {
    const initialSync = await syncWordPressCatalog({ mode: "FULL_PRIVATE" });
    const category = await prisma.category.findFirst({
      where: { isStale: false },
      orderBy: [{ postCount: "desc" }, { name: "asc" }],
    });

    if (!category) {
      throw new Error("The full private sync returned no active WordPress category for the smoke draft.");
    }

    const title = `Foundry Release Smoke Draft ${runId}`;
    const article = await prisma.article.create({
      data: {
        categoryId: category.id,
        title,
        normalizedTitle: title.toLowerCase(),
        angle: "Verify a recoverable WordPress draft publish.",
        normalizedAngle: "verify a recoverable wordpress draft publish",
        primaryKeyword: "Tavern Cellar Foundry release smoke test",
        normalizedKeyword: "tavern cellar foundry release smoke test",
        canonicalTopicKey: `release-smoke-${runId}`,
        slug,
        contentMarkdown: "Release smoke draft pending WordPress verification.",
        metaTitle: `Foundry smoke ${runId}`,
        metaDescription: "A labeled draft created only to verify Tavern Cellar Foundry's release path.",
        excerpt: "A labeled, non-editorial draft used for a Tavern Cellar Foundry release smoke test.",
        tags: "",
        internalLinks: "",
        featuredImagePrompt: "No image is generated for this release smoke test.",
        featuredImageAlt: "No image generated",
        openAiTextModel: "gpt-5-mini",
        notes: `Release smoke test ${timestamp}. Keep this WordPress post as a draft until it is manually removed.`,
      },
    });
    const firstPublish = await publishArticle(
      article.id,
      buildReviewForm(runId, timestamp, slug, category.id),
      "draft",
    );

    if (!firstPublish.wpPostId || firstPublish.wpStatus !== "draft") {
      throw new Error("WordPress did not confirm the release smoke post as a draft.");
    }

    const firstAttempt = await prisma.publishAttempt.findFirstOrThrow({
      where: { articleId: article.id },
      orderBy: { createdAt: "desc" },
    });
    const reconciledPost = await findWordPressPostByOperationKey(firstAttempt.operationKey);

    if (reconciledPost && reconciledPost.id !== firstPublish.wpPostId) {
      throw new Error("The WordPress operation-key lookup did not return the created smoke draft.");
    }

    if (!reconciledPost && firstAttempt.wpPostId !== firstPublish.wpPostId) {
      throw new Error("Foundry did not save the created smoke draft ID for a future update.");
    }

    const secondPublish = await publishArticle(
      article.id,
      buildReviewForm(runId, timestamp, slug, category.id),
      "draft",
    );

    if (secondPublish.wpPostId !== firstPublish.wpPostId || secondPublish.wpStatus !== "draft") {
      throw new Error("The second smoke publish did not update the original WordPress draft.");
    }

    const finalSync = await syncWordPressCatalog({ mode: "FULL_PRIVATE" });
    const syncedPost = await prisma.sitePost.findUnique({
      where: { wpPostId: firstPublish.wpPostId },
    });

    if (!syncedPost || syncedPost.wpStatus !== "draft") {
      throw new Error("The final full private sync did not record the WordPress smoke draft.");
    }

    const attemptCount = await prisma.publishAttempt.count({
      where: { articleId: article.id },
    });

    console.log(JSON.stringify({
      result: "passed",
      localArticleId: article.id,
      wordpressDraftId: firstPublish.wpPostId,
      wordpressStatus: firstPublish.wpStatus,
      publishAttempts: attemptCount,
      operationKeyRecoveryEndpoint: reconciledPost ? "available" : "not-installed",
      initialSync: {
        categories: initialSync.categoryCount,
        posts: initialSync.postCount,
      },
      finalSync: {
        categories: finalSync.categoryCount,
        posts: finalSync.postCount,
      },
    }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
