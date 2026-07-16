import { ArticleStatus } from "@prisma/client";

import { isActiveAppCategory, sortCategoriesForApp } from "@/lib/category-config";
import { prisma } from "@/lib/db";
import { buildTopicClusterDrafts } from "@/lib/intelligence/clusters";
import { buildCoverageMap } from "@/lib/intelligence/coverage";

export function parseScoreReasons(value: string) {
  try {
    const parsed = JSON.parse(value) as unknown;

    if (Array.isArray(parsed)) {
      return parsed.filter((item): item is string => typeof item === "string");
    }
  } catch {
    return [];
  }

  return [];
}

export async function getIntelligenceData() {
  const [allCategories, articles, sitePosts, opportunities] = await Promise.all([
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
      stale: !latestSyncAt || Date.now() - latestSyncAt.getTime() > 24 * 60 * 60 * 1000,
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
  const [allCategories, opportunities] = await Promise.all([
    prisma.category.findMany({
      orderBy: [{ postCount: "desc" }, { name: "asc" }],
    }),
    prisma.contentOpportunity.findMany({
      include: {
        category: true,
        internalLinks: true,
        similarPosts: true,
      },
      orderBy: [{ status: "asc" }, { overallScore: "desc" }, { updatedAt: "desc" }],
    }),
  ]);

  return {
    categories: sortCategoriesForApp(
      allCategories.filter(isActiveAppCategory),
    ),
    opportunities,
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
