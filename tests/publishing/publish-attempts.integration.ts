import assert from "node:assert/strict";
import { after, test } from "node:test";

import { ArticleStatus } from "@prisma/client";

import { AppError } from "@/lib/errors/app-error";
import {
  claimPublishAttempt,
  failPublishAttempt,
  recordPublishAttemptCheckpoint,
} from "@/lib/publishing/publish-attempts";
import { prisma } from "@/lib/db";

after(async () => {
  await prisma.$disconnect();
});

test("allows one active publish claim and reuses its operation key after an uncertain write", async () => {
  const category = await prisma.category.create({
    data: {
      wpCategoryId: 80801,
      name: "Publish Recovery",
      slug: "publish-recovery",
      postCount: 0,
    },
  });
  const article = await prisma.article.create({
    data: {
      categoryId: category.id,
      title: "Recovery Test Article",
      normalizedTitle: "recovery test article",
      angle: "Exercise a recoverable publish attempt.",
      normalizedAngle: "exercise a recoverable publish attempt",
      primaryKeyword: "publish recovery",
      normalizedKeyword: "publish recovery",
      canonicalTopicKey: "publish-recovery-test",
      slug: "publish-recovery-test",
      contentMarkdown: "## Opening\n\nTest content.",
      metaTitle: "Recovery Test Article",
      metaDescription: "A publish recovery integration test.",
      excerpt: "A publish recovery integration test.",
      tags: "",
      internalLinks: "",
      featuredImagePrompt: "Test image",
      featuredImageAlt: "Test image",
      openAiTextModel: "gpt-5-mini",
    },
  });

  const claims = await Promise.allSettled([
    claimPublishAttempt({ articleId: article.id, desiredWpStatus: "draft" }),
    claimPublishAttempt({ articleId: article.id, desiredWpStatus: "draft" }),
  ]);
  const successfulClaims = claims.filter(
    (result): result is PromiseFulfilledResult<Awaited<ReturnType<typeof claimPublishAttempt>>> =>
      result.status === "fulfilled",
  );
  const rejectedClaims = claims.filter(
    (result): result is PromiseRejectedResult => result.status === "rejected",
  );

  assert.equal(successfulClaims.length, 1);
  assert.equal(rejectedClaims.length, 1);
  assert.ok(rejectedClaims[0]?.reason instanceof AppError);
  assert.equal((rejectedClaims[0]?.reason as AppError).code, "PUBLISH_STATE_CONFLICT");

  const firstAttempt = successfulClaims[0]?.value;
  assert.ok(firstAttempt);
  await recordPublishAttemptCheckpoint({
    articleId: article.id,
    operationKey: firstAttempt.operationKey,
    checkpoint: "POST_IDENTIFIED",
    wpPostId: 991,
  });
  await failPublishAttempt({
    articleId: article.id,
    operationKey: firstAttempt.operationKey,
    error: new AppError("WP_WRITE_UNCERTAIN"),
  });

  const failedArticle = await prisma.article.findUniqueOrThrow({ where: { id: article.id } });
  assert.equal(failedArticle.wpPostId, 991);
  assert.equal(failedArticle.publishState, "UNCERTAIN");
  assert.equal(failedArticle.status, ArticleStatus.WP_DRAFT);

  const retryAttempt = await claimPublishAttempt({
    articleId: article.id,
    desiredWpStatus: "draft",
  });
  assert.equal(retryAttempt.operationKey, firstAttempt.operationKey);
  assert.equal(retryAttempt.state, "STARTED");

  const attempts = await prisma.publishAttempt.findMany({ where: { articleId: article.id } });
  assert.equal(attempts.length, 1);
});
