import { ArticleStatus, ImageOperationState } from "@prisma/client";

import { isActiveAppCategory, sortCategoriesForApp } from "@/lib/category-config";
import { prisma } from "@/lib/db";
import { getServerEnv } from "@/lib/env";
import { buildTopicClusterDrafts } from "@/lib/intelligence/clusters";
import { buildCoverageMap } from "@/lib/intelligence/coverage";
import { parseStringArray } from "@/lib/serialized-values";

export function parseScoreReasons(value: string) {
  return parseStringArray(value);
}

export async function getIntelligenceData() {
  const [allCategories, articles, sitePosts, opportunities, latestSyncRun, lastSuccessfulFullSync] = await Promise.all([
    prisma.category.findMany({
      orderBy: [{ postCount: "desc" }, { name: "asc" }],
    }),
    prisma.article.findMany({
      select: {
        id: true,
        categoryId: true,
        title: true,
        angle: true,
        status: true,
        createdAt: true,
      },
    }),
    prisma.sitePost.findMany({
      select: {
        id: true,
        title: true,
        excerpt: true,
        primaryCategoryId: true,
        rawCategoryIds: true,
        wpStatus: true,
        publishedAt: true,
        lastSyncedAt: true,
        link: true,
      },
    }),
    prisma.contentOpportunity.findMany({
      select: {
        id: true,
        categoryId: true,
        primaryKeyword: true,
        angle: true,
        status: true,
      },
      orderBy: { updatedAt: "desc" },
      take: 300,
    }),
    prisma.wordPressSyncRun.findFirst({
      orderBy: { startedAt: "desc" },
    }),
    prisma.wordPressSyncRun.findFirst({
      where: {
        mode: "FULL_PRIVATE",
        state: "SUCCEEDED",
      },
      orderBy: { completedAt: "desc" },
    }),
  ]);
  const categories = sortCategoriesForApp(
    allCategories.filter(isActiveAppCategory),
  );
  const lanes = buildCoverageMap({
    categories,
    articles,
    sitePosts,
  });
  const latestSyncAt = sitePosts.reduce<Date | null>((latest, post) => {
    if (!latest || post.lastSyncedAt > latest) {
      return post.lastSyncedAt;
    }

    return latest;
  }, null);

  return {
    categories,
    lanes,
    linkIndex: {
      totalPosts: sitePosts.length,
      postsWithLinks: sitePosts.filter((post) => Boolean(post.link)).length,
      latestSyncAt,
      latestSyncRun,
      lastSuccessfulFullSyncAt: lastSuccessfulFullSync?.completedAt ?? null,
      stale:
        !lastSuccessfulFullSync?.completedAt ||
        Date.now() - lastSuccessfulFullSync.completedAt.getTime() >
          getServerEnv().WORDPRESS_SYNC_STALE_HOURS * 60 * 60 * 1000,
    },
    topicClusters: buildTopicClusterDrafts({
      sitePosts: sitePosts.map((post) => ({
        id: post.id,
        categoryId: post.primaryCategoryId,
        title: post.title,
        excerpt: post.excerpt,
        status: post.wpStatus,
      })),
      articles: articles.map((article) => ({
        id: article.id,
        categoryId: article.categoryId,
        title: article.title,
        angle: article.angle,
        status: article.status,
      })),
      opportunities,
    }).slice(0, 5),
  };
}

export async function getOpportunityListData() {
  const [allCategories, opportunities, liveWordPressPosts, latestSyncRun, lastSuccessfulFullSync] = await Promise.all([
    prisma.category.findMany({
      orderBy: [{ postCount: "desc" }, { name: "asc" }],
    }),
    prisma.contentOpportunity.findMany({
      include: {
        category: true,
        internalLinks: true,
        similarPosts: true,
        generatedArticle: {
          select: {
            id: true,
            status: true,
            wpPostId: true,
            wpStatus: true,
            publishedAt: true,
          },
        },
      },
      orderBy: [{ status: "asc" }, { overallScore: "desc" }, { updatedAt: "desc" }],
    }),
    prisma.sitePost.findMany({
      where: {
        isStale: false,
        wpStatus: "publish",
      },
      select: {
        wpPostId: true,
        link: true,
      },
    }),
    prisma.wordPressSyncRun.findFirst({
      orderBy: { startedAt: "desc" },
    }),
    prisma.wordPressSyncRun.findFirst({
      where: {
        mode: "FULL_PRIVATE",
        state: "SUCCEEDED",
      },
      orderBy: { completedAt: "desc" },
    }),
  ]);

  const livePostLinks = new Map(
    liveWordPressPosts.map((post) => [post.wpPostId, post.link]).filter(
      (entry): entry is [number, string] => Boolean(entry[1]),
    ),
  );

  return {
    categories: sortCategoriesForApp(
      allCategories.filter(isActiveAppCategory),
    ),
    opportunities: opportunities.map((opportunity) => ({
      ...opportunity,
      generatedArticle: opportunity.generatedArticle
        ? {
            ...opportunity.generatedArticle,
            livePostLink: opportunity.generatedArticle.wpPostId
              ? livePostLinks.get(opportunity.generatedArticle.wpPostId) ?? null
              : null,
          }
        : null,
    })),
    syncHealth: {
      latestRun: latestSyncRun,
      lastSuccessfulFullSync,
    },
  };
}

export async function getOpportunityById(opportunityId: string) {
  return prisma.contentOpportunity.findUnique({
    where: { id: opportunityId },
    include: {
      category: true,
      generatedArticle: true,
      internalLinks: {
        include: {
          sitePost: true,
        },
        orderBy: { confidence: "desc" },
      },
      similarPosts: {
        include: {
          article: true,
          sitePost: true,
        },
        orderBy: { similarity: "desc" },
      },
    },
  });
}

export async function getCalendarData() {
  return prisma.article.findMany({
    where: {
      OR: [{ status: ArticleStatus.SCHEDULED }, { scheduledFor: { not: null } }],
    },
    include: {
      category: true,
    },
    orderBy: [{ scheduledFor: "asc" }, { updatedAt: "desc" }],
  });
}

export async function getOperationsData() {
  const [publishAttempts, syncRuns, generationRuns, imageOperations] = await Promise.all([
    prisma.publishAttempt.findMany({
      include: {
        article: {
          select: {
            id: true,
            title: true,
            publishState: true,
          },
        },
      },
      orderBy: { updatedAt: "desc" },
      take: 24,
    }),
    prisma.wordPressSyncRun.findMany({
      orderBy: { startedAt: "desc" },
      take: 16,
    }),
    prisma.generationRun.findMany({
      include: {
        article: {
          select: {
            id: true,
            title: true,
          },
        },
        opportunity: {
          select: {
            id: true,
            primaryKeyword: true,
            angle: true,
          },
        },
      },
      orderBy: { startedAt: "desc" },
      take: 24,
    }),
    prisma.article.findMany({
      where: {
        OR: [
          {
            featuredImageState: {
              in: [
                ImageOperationState.GENERATING,
                ImageOperationState.FAILED,
                ImageOperationState.CLEANUP_WARNING,
              ],
            },
          },
          {
            bodyImagesState: {
              in: [
                ImageOperationState.GENERATING,
                ImageOperationState.FAILED,
                ImageOperationState.CLEANUP_WARNING,
              ],
            },
          },
        ],
      },
      select: {
        id: true,
        title: true,
        featuredImageState: true,
        featuredImageErrorCode: true,
        featuredImageLastAttemptAt: true,
        bodyImagesState: true,
        bodyImagesErrorCode: true,
        bodyImagesLastAttemptAt: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: "desc" },
      take: 24,
    }),
  ]);

  return {
    publishAttempts,
    syncRuns,
    generationRuns,
    imageOperations,
  };
}
