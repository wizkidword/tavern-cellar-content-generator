import { randomUUID } from "node:crypto";

import {
  ArticleStatus,
  PublishAttemptState,
  PublishOperationState,
  type PublishAttempt,
  type Prisma,
} from "@prisma/client";

import { prisma } from "@/lib/db";
import { AppError, toAppError } from "@/lib/errors/app-error";

type DatabaseTransaction = Prisma.TransactionClient;

export type PublishAttemptCheckpoint =
  | "POST_IDENTIFIED"
  | "MEDIA_COMPLETE"
  | "CONTENT_COMPLETE";

export type ClaimedPublishAttempt = PublishAttempt & {
  preventPlaceholderCreation: boolean;
};

function getReusableAttempt(transaction: DatabaseTransaction, articleId: string) {
  return transaction.publishAttempt.findFirst({
    where: {
      articleId,
      state: {
        in: [PublishAttemptState.FAILED, PublishAttemptState.UNCERTAIN],
      },
    },
    orderBy: { updatedAt: "desc" },
  });
}

export async function claimPublishAttempt(input: {
  articleId: string;
  desiredWpStatus: "draft" | "publish" | "future";
  allowInProgressRecovery?: boolean;
}) {
  return prisma.$transaction(async (transaction) => {
    const article = await transaction.article.findUnique({
      where: { id: input.articleId },
      select: { activePublishOperationKey: true, publishState: true },
    });

    if (!article) {
      throw new AppError("OPERATION_FAILED");
    }

    if (article.publishState === PublishOperationState.IN_PROGRESS) {
      if (!input.allowInProgressRecovery || !article.activePublishOperationKey) {
        throw new AppError("PUBLISH_STATE_CONFLICT");
      }

      const activeAttempt = await transaction.publishAttempt.findUnique({
        where: { operationKey: article.activePublishOperationKey },
      });

      if (!activeAttempt) {
        throw new AppError("PUBLISH_STATE_CONFLICT");
      }

      return {
        ...activeAttempt,
        preventPlaceholderCreation: true,
      } satisfies ClaimedPublishAttempt;
    }

    const reusableAttempt = await getReusableAttempt(transaction, input.articleId);
    const operationKey = reusableAttempt?.operationKey ?? randomUUID();
    const claim = await transaction.article.updateMany({
      where: {
        id: input.articleId,
        publishState: { not: PublishOperationState.IN_PROGRESS },
      },
      data: {
        publishState: PublishOperationState.IN_PROGRESS,
        activePublishOperationKey: operationKey,
      },
    });

    if (claim.count !== 1) {
      throw new AppError("PUBLISH_STATE_CONFLICT");
    }

    if (reusableAttempt) {
      const attempt = await transaction.publishAttempt.update({
        where: { id: reusableAttempt.id },
        data: {
          desiredWpStatus: input.desiredWpStatus,
          state: PublishAttemptState.STARTED,
          errorCode: null,
          errorCorrelationId: null,
          errorDetailInternal: null,
          warningCode: null,
        },
      });

      return {
        ...attempt,
        preventPlaceholderCreation: reusableAttempt.state === PublishAttemptState.UNCERTAIN,
      } satisfies ClaimedPublishAttempt;
    }

    const attempt = await transaction.publishAttempt.create({
      data: {
        articleId: input.articleId,
        operationKey,
        desiredWpStatus: input.desiredWpStatus,
      },
    });

    return {
      ...attempt,
      preventPlaceholderCreation: false,
    } satisfies ClaimedPublishAttempt;
  });
}

async function assertActiveClaim(
  transaction: DatabaseTransaction,
  articleId: string,
  operationKey: string,
) {
  const active = await transaction.article.findFirst({
    where: {
      id: articleId,
      publishState: PublishOperationState.IN_PROGRESS,
      activePublishOperationKey: operationKey,
    },
    select: { id: true },
  });

  if (!active) {
    throw new AppError("PUBLISH_STATE_CONFLICT");
  }
}

export async function recordPublishAttemptCheckpoint(input: {
  articleId: string;
  operationKey: string;
  checkpoint: PublishAttemptCheckpoint;
  wpPostId?: number;
}) {
  return prisma.$transaction(async (transaction) => {
    await assertActiveClaim(transaction, input.articleId, input.operationKey);

    const attempt = await transaction.publishAttempt.update({
      where: { operationKey: input.operationKey },
      data: {
        state: PublishAttemptState[input.checkpoint],
        lastCheckpoint: input.checkpoint,
        ...(input.wpPostId ? { wpPostId: input.wpPostId } : {}),
      },
    });

    if (input.checkpoint === "POST_IDENTIFIED" && input.wpPostId) {
      const article = await transaction.article.findUnique({
        where: { id: input.articleId },
        select: { wpPostId: true, wpStatus: true, status: true },
      });

      await transaction.article.update({
        where: { id: input.articleId },
        data: {
          wpPostId: input.wpPostId,
          wpStatus: article?.wpPostId ? article.wpStatus : "draft",
          status: article?.wpPostId ? article.status : ArticleStatus.WP_DRAFT,
        },
      });
    }

    return attempt;
  });
}

export async function completePublishAttempt(input: {
  articleId: string;
  operationKey: string;
  wpPostId: number;
  wpStatus: string;
  articleStatus: ArticleStatus;
  publishedAt: Date | null;
  notes?: string | null;
  warningCode?: string | null;
}) {
  return prisma.$transaction(async (transaction) => {
    await assertActiveClaim(transaction, input.articleId, input.operationKey);
    await transaction.publishAttempt.update({
      where: { operationKey: input.operationKey },
      data: {
        state: PublishAttemptState.SUCCEEDED,
        lastCheckpoint: "SUCCEEDED",
        wpPostId: input.wpPostId,
        errorCode: null,
        errorCorrelationId: null,
        errorDetailInternal: null,
        warningCode: input.warningCode ?? null,
      },
    });

    return transaction.article.update({
      where: { id: input.articleId },
      data: {
        publishState: PublishOperationState.SUCCEEDED,
        activePublishOperationKey: null,
        wpPostId: input.wpPostId,
        wpStatus: input.wpStatus,
        status: input.articleStatus,
        publishedAt: input.publishedAt,
        ...(input.notes === undefined ? {} : { notes: input.notes }),
      },
      include: {
        category: true,
        bodyImages: {
          orderBy: { sortOrder: "asc" },
        },
      },
    });
  });
}

export async function failPublishAttempt(input: {
  articleId: string;
  operationKey: string;
  error: unknown;
}) {
  const appError = toAppError(input.error);
  const uncertain = appError.code === "WP_WRITE_UNCERTAIN";

  await prisma.$transaction(async (transaction) => {
    await transaction.publishAttempt.update({
      where: { operationKey: input.operationKey },
      data: {
        state: uncertain ? PublishAttemptState.UNCERTAIN : PublishAttemptState.FAILED,
        errorCode: appError.code,
        errorCorrelationId: appError.correlationId,
        errorDetailInternal: null,
      },
    });
    await transaction.article.update({
      where: { id: input.articleId },
      data: {
        publishState: uncertain ? PublishOperationState.UNCERTAIN : PublishOperationState.FAILED,
        activePublishOperationKey: null,
      },
    });
  });

  return appError;
}

export async function getLatestPublishAttempt(articleId: string) {
  return prisma.publishAttempt.findFirst({
    where: { articleId },
    orderBy: { updatedAt: "desc" },
  });
}
