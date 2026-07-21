import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import { findTopicClusterCatalogName } from "@/lib/intelligence/cluster-catalog";
import { normalizeSearchText } from "@/lib/intelligence/text";

type ClusterItemType = "SITE_POST" | "ARTICLE" | "OPPORTUNITY";
type ClusterTransaction = Prisma.TransactionClient;

export type ClusterSitePostInput = {
  id: string;
  categoryId: number | null;
  title: string;
  excerpt: string | null;
  status: string;
};

export type ClusterArticleInput = {
  id: string;
  categoryId: number;
  title: string;
  angle: string;
  status: string;
};

export type ClusterOpportunityInput = {
  id: string;
  categoryId: number;
  primaryKeyword: string;
  angle: string;
  status: string;
};

export type TopicClusterCatalogInput = {
  sitePosts: ClusterSitePostInput[];
  articles: ClusterArticleInput[];
  opportunities: ClusterOpportunityInput[];
};

export type TopicClusterDraftItem = {
  itemType: ClusterItemType;
  sitePostId?: string;
  articleId?: string;
  opportunityId?: string;
  categoryId: number | null;
  label: string;
  status: string;
  sortOrder: number;
};

export type TopicClusterDraft = {
  name: string;
  normalizedName: string;
  description: string;
  categoryId: number | null;
  missingSupportHints: string[];
  items: TopicClusterDraftItem[];
};

type NormalizedCatalogItem = TopicClusterDraftItem & {
  clusterName: string | null;
};

function pickClusterName(value: string) {
  return findTopicClusterCatalogName(value);
}

function normalizedClusterName(name: string) {
  return normalizeSearchText(name).replace(/\s+/g, "-");
}

function mostLikelyCategory(items: TopicClusterDraftItem[]) {
  const counts = new Map<number, number>();

  for (const item of items) {
    if (item.categoryId) {
      counts.set(item.categoryId, (counts.get(item.categoryId) ?? 0) + 1);
    }
  }

  return [...counts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ?? null;
}

function missingSupportHints(items: TopicClusterDraftItem[]) {
  const hints: string[] = [];
  const hasSitePost = items.some((item) => item.itemType === "SITE_POST");
  const hasArticle = items.some((item) => item.itemType === "ARTICLE");
  const hasOpportunity = items.some((item) => item.itemType === "OPPORTUNITY");

  if (items.length < 4) {
    hints.push("Add a supporting article to strengthen this cluster.");
  }

  if (hasSitePost && !hasOpportunity) {
    hints.push("Create a fresh opportunity that links back to the existing post.");
  }

  if (hasOpportunity && !hasArticle) {
    hints.push("Generate or schedule the approved opportunity to turn this cluster into coverage.");
  }

  return hints;
}

function normalizeItems(input: TopicClusterCatalogInput): NormalizedCatalogItem[] {
  return [
    ...input.sitePosts.map((post, index) => ({
      itemType: "SITE_POST" as const,
      sitePostId: post.id,
      categoryId: post.categoryId,
      label: post.title,
      status: post.status,
      sortOrder: index,
      clusterName: pickClusterName(post.title),
    })),
    ...input.articles.map((article, index) => ({
      itemType: "ARTICLE" as const,
      articleId: article.id,
      categoryId: article.categoryId,
      label: article.title,
      status: article.status,
      sortOrder: index,
      clusterName: pickClusterName(`${article.title} ${article.angle}`),
    })),
    ...input.opportunities.map((opportunity, index) => ({
      itemType: "OPPORTUNITY" as const,
      opportunityId: opportunity.id,
      categoryId: opportunity.categoryId,
      label: opportunity.primaryKeyword,
      status: opportunity.status,
      sortOrder: index,
      clusterName: pickClusterName(`${opportunity.primaryKeyword} ${opportunity.angle}`),
    })),
  ];
}

export function buildTopicClusterDrafts(input: TopicClusterCatalogInput): TopicClusterDraft[] {
  const grouped = new Map<string, TopicClusterDraftItem[]>();

  for (const item of normalizeItems(input)) {
    if (!item.clusterName) {
      continue;
    }

    const normalizedName = normalizedClusterName(item.clusterName);
    const current = grouped.get(normalizedName) ?? [];
    const draftItem: TopicClusterDraftItem = {
      itemType: item.itemType,
      sitePostId: item.sitePostId,
      articleId: item.articleId,
      opportunityId: item.opportunityId,
      categoryId: item.categoryId,
      label: item.label,
      status: item.status,
      sortOrder: item.sortOrder,
    };

    current.push(draftItem);
    grouped.set(normalizedName, current);
  }

  return [...grouped.entries()]
    .map(([normalizedName, items]) => {
      const readableName = normalizedName.replace(/-/g, " ");
      const categoryId = mostLikelyCategory(items);

      return {
        name: readableName,
        normalizedName,
        description: `Coverage cluster for ${readableName}.`,
        categoryId,
        missingSupportHints: missingSupportHints(items),
        items: items.sort((left, right) => {
          const typeWeight = { SITE_POST: 0, ARTICLE: 1, OPPORTUNITY: 2 };

          return typeWeight[left.itemType] - typeWeight[right.itemType] || left.sortOrder - right.sortOrder;
        }),
      };
    })
    .filter((cluster) => cluster.items.length >= 2 || cluster.name === "slasher iconography")
    .sort((left, right) => right.items.length - left.items.length || left.name.localeCompare(right.name));
}

function clusterItemTargetKey(item: {
  itemType: ClusterItemType;
  sitePostId?: string | null;
  articleId?: string | null;
  opportunityId?: string | null;
}) {
  const targetId = item.sitePostId ?? item.articleId ?? item.opportunityId;

  if (!targetId) {
    throw new Error("A topic cluster item must have exactly one target.");
  }

  return `${item.itemType}:${targetId}`;
}

async function clearAutomaticOpportunityAssignment(
  transaction: ClusterTransaction,
  topicClusterId: string,
  opportunityId: string | null,
) {
  if (!opportunityId) {
    return;
  }

  await transaction.contentOpportunity.updateMany({
    where: {
      id: opportunityId,
      topicClusterId,
    },
    data: {
      topicClusterId: null,
    },
  });
}

export async function upsertTopicClustersFromCatalog(input: TopicClusterCatalogInput) {
  const drafts = buildTopicClusterDrafts(input);

  await prisma.$transaction(async (transaction) => {
    const existingClusters = await transaction.topicCluster.findMany({
      include: {
        items: true,
      },
    });
    const existingByNormalizedName = new Map(
      existingClusters.map((cluster) => [cluster.normalizedName, cluster]),
    );
    const desiredAutomaticClusters = new Set(drafts.map((draft) => draft.normalizedName));

    for (const draft of drafts) {
      const existing = existingByNormalizedName.get(draft.normalizedName);

      // A manually curated cluster owns its title and membership. Automation may
      // recognize the same topic, but it must never rewrite that editorial work.
      if (existing?.source === "MANUAL") {
        continue;
      }

      const cluster = existing
        ? await transaction.topicCluster.update({
            where: { id: existing.id },
            data: {
              name: draft.name,
              description: draft.description,
              categoryId: draft.categoryId,
              isArchived: false,
            },
          })
        : await transaction.topicCluster.create({
            data: {
              name: draft.name,
              normalizedName: draft.normalizedName,
              description: draft.description,
              categoryId: draft.categoryId,
              source: "AUTO",
              isArchived: false,
            },
          });
      const existingItems = existing?.items ?? [];
      const existingItemsByTarget = new Map(
        existingItems.map((item) => [clusterItemTargetKey(item), item]),
      );
      const desiredTargets = new Set(draft.items.map((item) => clusterItemTargetKey(item)));

      for (const item of draft.items) {
        const itemKey = clusterItemTargetKey(item);
        const matchingItem = existingItemsByTarget.get(itemKey);

        if (matchingItem?.source === "MANUAL") {
          continue;
        }

        if (matchingItem) {
          await transaction.topicClusterItem.update({
            where: { id: matchingItem.id },
            data: {
              label: item.label,
              sortOrder: item.sortOrder,
            },
          });
        } else {
          await transaction.topicClusterItem.create({
            data: {
              topicClusterId: cluster.id,
              itemType: item.itemType,
              sitePostId: item.sitePostId,
              articleId: item.articleId,
              opportunityId: item.opportunityId,
              label: item.label,
              sortOrder: item.sortOrder,
              source: "AUTO",
            },
          });
        }

        if (item.opportunityId) {
          await transaction.contentOpportunity.updateMany({
            where: {
              id: item.opportunityId,
              OR: [{ topicClusterId: null }, { topicClusterId: cluster.id }],
            },
            data: { topicClusterId: cluster.id },
          });
        }
      }

      const staleAutomaticItems = existingItems.filter(
        (item) => item.source === "AUTO" && !desiredTargets.has(clusterItemTargetKey(item)),
      );

      for (const item of staleAutomaticItems) {
        await clearAutomaticOpportunityAssignment(transaction, cluster.id, item.opportunityId);
      }

      if (staleAutomaticItems.length > 0) {
        await transaction.topicClusterItem.deleteMany({
          where: { id: { in: staleAutomaticItems.map((item) => item.id) } },
        });
      }
    }

    for (const cluster of existingClusters) {
      if (cluster.source === "MANUAL" || desiredAutomaticClusters.has(cluster.normalizedName)) {
        continue;
      }

      const staleAutomaticItems = cluster.items.filter((item) => item.source === "AUTO");

      for (const item of staleAutomaticItems) {
        await clearAutomaticOpportunityAssignment(transaction, cluster.id, item.opportunityId);
      }

      if (staleAutomaticItems.length > 0) {
        await transaction.topicClusterItem.deleteMany({
          where: { id: { in: staleAutomaticItems.map((item) => item.id) } },
        });
      }

      const hasManualItems = cluster.items.some((item) => item.source === "MANUAL");
      await transaction.topicCluster.update({
        where: { id: cluster.id },
        data: { isArchived: !hasManualItems },
      });
    }
  });

  return drafts;
}

export async function upsertTopicClustersFromCurrentCatalog() {
  const [sitePosts, articles, opportunities] = await Promise.all([
    prisma.sitePost.findMany({
      select: {
        id: true,
        primaryCategoryId: true,
        title: true,
        excerpt: true,
        wpStatus: true,
      },
      orderBy: { publishedAt: "desc" },
      take: 500,
    }),
    prisma.article.findMany({
      select: {
        id: true,
        categoryId: true,
        title: true,
        angle: true,
        status: true,
      },
      orderBy: { createdAt: "desc" },
      take: 300,
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

  return upsertTopicClustersFromCatalog({
    sitePosts: sitePosts.map((post) => ({
      id: post.id,
      categoryId: post.primaryCategoryId,
      title: post.title,
      excerpt: post.excerpt,
      status: post.wpStatus,
    })),
    articles,
    opportunities,
  });
}
