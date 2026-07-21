import { Prisma } from "@prisma/client";

import { isActiveAppCategory } from "@/lib/category-config";
import { createArticle } from "@/lib/content-pipeline";
import { prisma } from "@/lib/db";
import {
  buildGameOfThronesEpisodeGuideOpportunities,
  buildGameOfThronesFanoutGuidance,
  isGameOfThronesUniverseCategory,
} from "@/lib/franchise-episode-guides";
import {
  buildRetroGamesStrategyGuidance,
  isRetroGamesCategory,
} from "@/lib/retro-games";
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
import {
  type FalImageModel,
  type FeaturedImageProvider,
  type OpenAIImageModel,
} from "@/lib/featured-image";
import { generateContentOpportunityIdeas } from "@/lib/openai";
import { type OpenAITextModel } from "@/lib/openai-models";
import {
  parseWordPressCategoryIds,
  serializeStringArray,
} from "@/lib/serialized-values";
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

const deletableOpportunityStatuses = new Set([
  "IDEA",
  "APPROVED",
  "GENERATED",
  "REJECTED",
  "ARCHIVED",
]);

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

function localCategoryIdsForSitePost(
  post: { primaryCategoryId: number | null; rawCategoryIds: string },
  wpCategoryMap: Map<number, number>,
) {
  const ids = new Set<number>();

  if (post.primaryCategoryId) {
    ids.add(post.primaryCategoryId);
  }

  for (const wpCategoryId of parseWordPressCategoryIds(post.rawCategoryIds)) {
    const localId = wpCategoryMap.get(wpCategoryId);

    if (localId) {
      ids.add(localId);
    }
  }

  return Array.from(ids);
}

function sitePostUrl(post: { link: string | null; slug: string }) {
  if (post.link?.trim()) {
    return post.link.trim();
  }

  if (post.slug.trim()) {
    return `/${post.slug.trim().replace(/^\/+/, "")}`;
  }

  return null;
}

function coverageSummary(lane: ReturnType<typeof buildCoverageMap>[number] | undefined) {
  if (!lane) {
    return ["No local coverage lane was found for this category yet."];
  }

  return [
    `Coverage balance: ${lane.balanceLabel}`,
    `Live posts: ${lane.counts.live}`,
    `Generated drafts: ${lane.counts.generated}`,
    `Scheduled posts: ${lane.counts.scheduled}`,
    `Draft posts: ${lane.counts.draft}`,
    ...(lane.evidence.length > 0 ? lane.evidence : ["No immediate sync warnings in this lane."]),
  ];
}

function duplicateEvidenceSummary(input: {
  sitePosts: Array<{ title: string; wpStatus: string }>;
  articles: Array<{ title: string; status: string }>;
  opportunities: Array<{ primaryKeyword: string; angle: string; status: string }>;
}) {
  const lines = [
    ...input.sitePosts.slice(0, 8).map((post) => `${post.title} (${post.wpStatus})`),
    ...input.articles.slice(0, 8).map((article) => `${article.title} (${article.status})`),
    ...input.opportunities
      .slice(0, 8)
      .map((opportunity) => `${opportunity.primaryKeyword}: ${opportunity.angle} (${opportunity.status})`),
  ];

  return lines.length > 0
    ? lines
    : ["No same-category duplicate evidence was found in the local catalog."];
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

export function canDeleteOpportunity(status: string) {
  return deletableOpportunityStatuses.has(status);
}

export function getOpportunityWorkflowState(input: {
  status: string;
  generatedArticleId?: string | null;
}) {
  if (input.status === "GENERATED" && input.generatedArticleId) {
    return {
      mode: "open_generated_draft" as const,
      message: "This opportunity already has a generated draft.",
      canGenerateDraft: false,
    };
  }

  if (canGenerateOpportunityDraft(input.status)) {
    return {
      mode: "generate_draft" as const,
      message: "This opportunity is ready to generate a draft.",
      canGenerateDraft: true,
    };
  }

  return {
    mode: "locked" as const,
    message: "Change this opportunity back to idea or approved before generating a draft.",
    canGenerateDraft: false,
  };
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

export async function deleteOpportunity(opportunityId: string) {
  const opportunity = await prisma.contentOpportunity.findUnique({
    where: { id: opportunityId },
    select: {
      id: true,
      primaryKeyword: true,
      status: true,
      generatedArticleId: true,
    },
  });

  if (!opportunity) {
    throw new Error("Opportunity not found.");
  }

  if (!canDeleteOpportunity(opportunity.status)) {
    throw new Error("This opportunity status cannot be deleted yet.");
  }

  await prisma.contentOpportunity.delete({
    where: { id: opportunityId },
  });

  return opportunity;
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

  if (!category || !isActiveAppCategory(category)) {
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
          scoreReasons: serializeStringArray(insight.score.reasons),
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

export async function generateOpportunitiesForCategory(categoryIdInput: number) {
  const categoryId = Number(categoryIdInput);

  if (!Number.isInteger(categoryId) || categoryId <= 0) {
    throw new Error("Pick a valid category before generating opportunity ideas.");
  }

  const [category, categories, articles, sitePosts, existingOpportunities] = await Promise.all([
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
    prisma.contentOpportunity.findMany({
      select: {
        primaryKeyword: true,
        angle: true,
        status: true,
        categoryId: true,
      },
      orderBy: { updatedAt: "desc" },
      take: 500,
    }),
  ]);

  if (!category || !isActiveAppCategory(category)) {
    throw new Error("Pick one of the active Foundry categories before generating opportunity ideas.");
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
  const sameCategoryArticles = articles.filter((article) => article.categoryId === category.id);
  const sameCategoryOpportunities = existingOpportunities.filter(
    (opportunity) => opportunity.categoryId === category.id,
  );
  const realLinkCandidates = sitePostsWithLocalCategories
    .map((post) => {
      const url = sitePostUrl(post);

      if (!url) {
        return null;
      }

      return {
        title: post.title,
        url,
        excerpt: post.excerpt,
        categoryName: post.primaryCategory?.name ?? null,
        sameCategory: post.localCategoryIds.includes(category.id),
      };
    })
    .filter(
      (candidate): candidate is {
        title: string;
        url: string;
        excerpt: string | null;
        categoryName: string | null;
        sameCategory: boolean;
      } => Boolean(candidate),
    )
    .sort((left, right) => Number(right.sameCategory) - Number(left.sameCategory))
    .slice(0, 16)
    .map((candidate) => ({
      title: candidate.title,
      url: candidate.url,
      excerpt: candidate.excerpt,
      categoryName: candidate.categoryName,
    }));
  const gameOfThronesEpisodeGuideIdeas = isGameOfThronesUniverseCategory(category)
    ? buildGameOfThronesEpisodeGuideOpportunities({
        existingCoverage: [
          ...matchingSitePosts.map((post) => `${post.title} ${post.slug}`),
          ...sameCategoryArticles.map((article) => `${article.title} ${article.angle}`),
          ...sameCategoryOpportunities.map(
            (opportunity) => `${opportunity.primaryKeyword} ${opportunity.angle}`,
          ),
        ],
      })
    : [];

  if (gameOfThronesEpisodeGuideIdeas.length > 0) {
    const opportunities = [];

    for (const idea of gameOfThronesEpisodeGuideIdeas) {
      opportunities.push(
        await createOpportunityFromInput({
          categoryId: category.id,
          primaryKeyword: idea.primaryKeyword,
          angle: idea.angle,
          brief: idea.brief,
        }),
      );
    }

    return {
      opportunities,
      textModel: "local-game-of-thrones-episode-checklist",
    };
  }

  const ideas = await generateContentOpportunityIdeas({
    categoryName: category.name,
    categorySlug: category.slug,
    coverageSummary: coverageSummary(coverageLane),
    strategyGuidance: isGameOfThronesUniverseCategory(category)
      ? buildGameOfThronesFanoutGuidance()
      : isRetroGamesCategory(category)
        ? buildRetroGamesStrategyGuidance()
        : undefined,
    duplicateEvidenceSummaries: duplicateEvidenceSummary({
      sitePosts: matchingSitePosts,
      articles: sameCategoryArticles,
      opportunities: sameCategoryOpportunities,
    }),
    internalLinkCandidates: realLinkCandidates,
  });
  const opportunities = [];

  for (const idea of ideas.opportunities) {
    opportunities.push(
      await createOpportunityFromInput({
        categoryId: category.id,
        primaryKeyword: idea.primaryKeyword,
        angle: idea.angle,
        brief: idea.brief,
      }),
    );
  }

  return {
    opportunities,
    textModel: ideas.textModel,
  };
}

export async function createArticleFromOpportunity(
  opportunityId: string,
  options: {
    generateImage: boolean;
    textModel: OpenAITextModel;
    imageProvider: FeaturedImageProvider;
    falImageModel?: FalImageModel;
    openAiImageModel?: OpenAIImageModel;
    bodyImageCount?: number;
  },
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
    textModel: options.textModel,
    imageProvider: options.imageProvider,
    falImageModel: options.falImageModel,
    openAiImageModel: options.openAiImageModel,
    bodyImageCount: options.bodyImageCount,
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
