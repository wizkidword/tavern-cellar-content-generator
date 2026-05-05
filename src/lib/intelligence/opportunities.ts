import { Prisma } from "@prisma/client";

import { isAllowedAppCategorySlug } from "@/lib/category-config";
import { createArticle } from "@/lib/content-pipeline";
import { prisma } from "@/lib/db";
import { buildCoverageMap, type CoverageBalanceLabel } from "@/lib/intelligence/coverage";
import {
  assessDuplicateRisk,
  type DuplicateCandidate,
  type DuplicateRiskAssessment,
} from "@/lib/intelligence/duplicates";
import {
  recommendInternalLinks,
  type InternalLinkCandidate,
  type InternalLinkRecommendation,
} from "@/lib/intelligence/internal-links";
import {
  scoreOpportunity,
  type OpportunityScoreBreakdown,
} from "@/lib/intelligence/opportunity-scoring";
import { normalizeTopicValue } from "@/lib/topic-utils";

type BuildOpportunityInsightInput = {
  categoryId: number;
  categoryName: string;
  keyword: string;
  angle: string;
  brief: string;
  coverageLabel: CoverageBalanceLabel;
  localArticles: DuplicateCandidate[];
  sitePostDuplicateCandidates: DuplicateCandidate[];
  internalLinkCandidates: InternalLinkCandidate[];
};

export type OpportunityInsight = {
  duplicateAssessment: DuplicateRiskAssessment;
  internalLinks: InternalLinkRecommendation[];
  score: OpportunityScoreBreakdown;
};

export type CreateOpportunityInput = {
  categoryId: number;
  primaryKeyword: string;
  angle: string;
  brief: string;
};

type OpportunityGenerationLink = {
  title: string;
  url: string;
  reason: string;
  confidence: number;
};

type MutableOpportunityStatus = "APPROVED" | "REJECTED" | "ARCHIVED";

const opportunityInclude = {
  category: true,
  internalLinks: {
    include: {
      sitePost: true,
    },
  },
  similarPosts: true,
} satisfies Prisma.ContentOpportunityInclude;

function requireTrimmed(value: string, fieldName: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    throw new Error(`${fieldName} is required.`);
  }

  return trimmed;
}

function parseRawCategoryIds(rawCategoryIds: string) {
  try {
    const parsed = JSON.parse(rawCategoryIds) as unknown;

    if (Array.isArray(parsed)) {
      return parsed.filter((item): item is number => typeof item === "number");
    }
  } catch {
    // Older rows can be plain comma-separated strings.
  }

  return rawCategoryIds
    .split(/[^0-9]+/)
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));
}

function localCategoryIdsForSitePost(
  post: { primaryCategoryId: number | null; rawCategoryIds: string },
  wpCategoryMap: Map<number, number>,
) {
  const ids = new Set<number>();

  if (post.primaryCategoryId) {
    ids.add(post.primaryCategoryId);
  }

  for (const wpCategoryId of parseRawCategoryIds(post.rawCategoryIds)) {
    const localId = wpCategoryMap.get(wpCategoryId);

    if (localId) {
      ids.add(localId);
    }
  }

  return Array.from(ids);
}

export function buildOpportunityInsight(input: BuildOpportunityInsightInput): OpportunityInsight {
  const duplicateAssessment = assessDuplicateRisk({
    keyword: input.keyword,
    title: input.keyword,
    angle: input.angle,
    categoryId: input.categoryId,
    localArticles: input.localArticles,
    sitePosts: input.sitePostDuplicateCandidates,
  });
  const internalLinks = recommendInternalLinks({
    keyword: input.keyword,
    angle: input.angle,
    brief: input.brief,
    categoryId: input.categoryId,
    candidates: input.internalLinkCandidates,
  });
  const score = scoreOpportunity({
    categoryName: input.categoryName,
    keyword: input.keyword,
    angle: input.angle,
    brief: input.brief,
    coverageLabel: input.coverageLabel,
    duplicateRiskLabel: duplicateAssessment.label,
    internalLinks,
  });

  return {
    duplicateAssessment,
    internalLinks,
    score,
  };
}

export function canGenerateOpportunityDraft(status: string) {
  return status === "IDEA" || status === "APPROVED";
}

export function buildOpportunityGenerationNotes(input: {
  brief: string;
  overallScore: number;
  internalLinks: OpportunityGenerationLink[];
}) {
  const linkLines = input.internalLinks.map(
    (link) =>
      `- ${link.title}: ${link.url} (${link.reason}; ${link.confidence}% confidence)`,
  );

  return [
    `Opportunity brief:\n${input.brief}`,
    `Content intelligence score: ${input.overallScore}`,
    linkLines.length > 0
      ? `Recommended real internal links:\n${linkLines.join("\n")}`
      : "Recommended real internal links:\nNo real link candidates were found for this opportunity.",
  ].join("\n\n");
}

export async function updateOpportunityStatus(
  opportunityId: string,
  status: MutableOpportunityStatus,
) {
  return prisma.contentOpportunity.update({
    where: { id: opportunityId },
    data: { status },
    include: opportunityInclude,
  });
}

async function findExistingOpportunity(input: {
  categoryId: number;
  normalizedKeyword: string;
  normalizedAngle: string;
}) {
  return prisma.contentOpportunity.findFirst({
    where: {
      categoryId: input.categoryId,
      normalizedKeyword: input.normalizedKeyword,
      normalizedAngle: input.normalizedAngle,
    },
    include: opportunityInclude,
  });
}

export async function createOpportunityFromInput(input: CreateOpportunityInput) {
  const categoryId = Number(input.categoryId);
  const primaryKeyword = requireTrimmed(input.primaryKeyword, "Primary keyword");
  const angle = requireTrimmed(input.angle, "Angle");
  const brief = requireTrimmed(input.brief, "Brief");
  const normalizedKeyword = normalizeTopicValue(primaryKeyword);
  const normalizedAngle = normalizeTopicValue(angle);

  if (!Number.isInteger(categoryId) || categoryId <= 0) {
    throw new Error("Pick a valid category before creating an opportunity.");
  }

  const [category, categories, articles, sitePosts] = await Promise.all([
    prisma.category.findUnique({
      where: { id: categoryId },
    }),
    prisma.category.findMany(),
    prisma.article.findMany({
      select: {
        id: true,
        categoryId: true,
        title: true,
        angle: true,
        status: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: 300,
    }),
    prisma.sitePost.findMany({
      select: {
        id: true,
        title: true,
        slug: true,
        link: true,
        excerpt: true,
        wpStatus: true,
        publishedAt: true,
        primaryCategoryId: true,
        rawCategoryIds: true,
        lastSyncedAt: true,
        primaryCategory: {
          select: {
            name: true,
          },
        },
      },
      orderBy: { publishedAt: "desc" },
      take: 500,
    }),
  ]);

  if (!category || !isAllowedAppCategorySlug(category.slug)) {
    throw new Error("Pick one of the active Foundry categories before creating an opportunity.");
  }

  const wpCategoryMap = new Map(categories.map((item) => [item.wpCategoryId, item.id]));
  const coverageLane = buildCoverageMap({
    categories,
    sitePosts: sitePosts.map((post) => ({
      id: post.id,
      primaryCategoryId: post.primaryCategoryId,
      rawCategoryIds: post.rawCategoryIds,
      wpStatus: post.wpStatus,
      publishedAt: post.publishedAt,
      lastSyncedAt: post.lastSyncedAt,
    })),
    articles: articles.map((article) => ({
      id: article.id,
      categoryId: article.categoryId,
      status: article.status,
      createdAt: article.createdAt,
    })),
  }).find((lane) => lane.categoryId === category.id);
  const sitePostsWithLocalCategories = sitePosts.map((post) => ({
    ...post,
    localCategoryIds: localCategoryIdsForSitePost(post, wpCategoryMap),
  }));
  const matchingSitePosts = sitePostsWithLocalCategories.filter((post) =>
    post.localCategoryIds.includes(category.id),
  );
  const insight = buildOpportunityInsight({
    categoryId: category.id,
    categoryName: category.name,
    keyword: primaryKeyword,
    angle,
    brief,
    coverageLabel: coverageLane?.balanceLabel ?? "quiet",
    localArticles: articles
      .filter((article) => article.categoryId === category.id)
      .map((article) => ({
        id: article.id,
        source: "app" as const,
        categoryId: article.categoryId,
        title: article.title,
        angle: article.angle,
        status: article.status,
      })),
    sitePostDuplicateCandidates: matchingSitePosts.map((post) => ({
      id: post.id,
      source: "site" as const,
      categoryId: category.id,
      title: post.title,
      angle: post.title,
      status: post.wpStatus,
    })),
    internalLinkCandidates: sitePostsWithLocalCategories.map((post) => ({
      id: post.id,
      title: post.title,
      slug: post.slug,
      link: post.link,
      excerpt: post.excerpt,
      wpStatus: post.wpStatus,
      categoryName: post.primaryCategory?.name ?? null,
      categoryIds: post.localCategoryIds,
      publishedAt: post.publishedAt,
    })),
  });

  try {
    return await prisma.$transaction(async (transaction) => {
      const opportunity = await transaction.contentOpportunity.create({
        data: {
          categoryId: category.id,
          primaryKeyword,
          normalizedKeyword,
          angle,
          normalizedAngle,
          brief,
          tavernFitScore: insight.score.tavernFitScore,
          coverageScore: insight.score.coverageScore,
          seoScore: insight.score.seoScore,
          duplicateRiskScore: insight.score.duplicateRiskScore,
          internalLinkScore: insight.score.internalLinkScore,
          publishabilityScore: insight.score.publishabilityScore,
          categoryBalanceScore: insight.score.categoryBalanceScore,
          overallScore: insight.score.overallScore,
          scoreReasons: JSON.stringify(insight.score.reasons),
          duplicateRiskLabel: insight.duplicateAssessment.label,
        },
      });

      if (insight.internalLinks.length > 0) {
        await transaction.opportunityInternalLink.createMany({
          data: insight.internalLinks.map((link) => ({
            opportunityId: opportunity.id,
            sitePostId: link.sitePostId,
            reason: link.reason,
            confidence: link.confidence,
          })),
        });
      }

      if (insight.duplicateAssessment.matches.length > 0) {
        await transaction.opportunitySimilarPost.createMany({
          data: insight.duplicateAssessment.matches.map((match) => ({
            opportunityId: opportunity.id,
            sitePostId: match.source === "site" ? match.id : null,
            articleId: match.source === "app" ? match.id : null,
            source: match.source,
            title: match.title,
            status: match.status,
            similarity: match.similarity,
            reason: match.reason,
          })),
        });
      }

      return transaction.contentOpportunity.findUniqueOrThrow({
        where: { id: opportunity.id },
        include: opportunityInclude,
      });
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const existing = await findExistingOpportunity({
        categoryId: category.id,
        normalizedKeyword,
        normalizedAngle,
      });

      if (existing) {
        return existing;
      }
    }

    throw error;
  }
}

export async function createArticleFromOpportunity(
  opportunityId: string,
  options: { generateImage: boolean },
) {
  const opportunity = await prisma.contentOpportunity.findUnique({
    where: { id: opportunityId },
    include: {
      internalLinks: {
        include: {
          sitePost: true,
        },
        orderBy: { confidence: "desc" },
      },
    },
  });

  if (!opportunity) {
    throw new Error("Opportunity not found.");
  }

  if (!canGenerateOpportunityDraft(opportunity.status)) {
    throw new Error("Only idea or approved opportunities can generate a new draft.");
  }

  const article = await createArticle({
    categoryId: opportunity.categoryId,
    primaryKeyword: opportunity.primaryKeyword,
    angle: opportunity.angle,
    notes: buildOpportunityGenerationNotes({
      brief: opportunity.brief,
      overallScore: opportunity.overallScore,
      internalLinks: opportunity.internalLinks.map((link) => ({
        title: link.sitePost.title,
        url: link.sitePost.link ?? `/${link.sitePost.slug}`,
        reason: link.reason,
        confidence: link.confidence,
      })),
    }),
    generateImage: options.generateImage,
  });

  await prisma.contentOpportunity.update({
    where: { id: opportunity.id },
    data: {
      status: "GENERATED",
      generatedArticleId: article.id,
    },
  });

  return article;
}
