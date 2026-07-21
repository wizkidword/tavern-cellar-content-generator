import { scoreTokenCoverage, tokenizeForSearch } from "@/lib/intelligence/text";

export type InternalLinkCandidate = {
  id: string;
  title: string;
  slug: string;
  link: string | null;
  excerpt: string | null;
  wpStatus: string;
  categoryName: string | null;
  categoryIds: number[];
  publishedAt: Date | null;
};

export type InternalLinkRecommendation = {
  sitePostId: string;
  title: string;
  url: string;
  reason: string;
  confidence: number;
  categoryName: string | null;
  wpStatus: string;
};

type RecommendInternalLinksInput = {
  keyword: string;
  angle: string;
  brief: string;
  categoryId: number;
  candidates: InternalLinkCandidate[];
  limit?: number;
};

type ResolveVerifiedInternalLinksInput = RecommendInternalLinksInput & {
  categoryFallback: {
    title: string;
    url: string;
  };
};

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function candidateUrl(candidate: InternalLinkCandidate) {
  if (candidate.link?.trim()) {
    return candidate.link.trim();
  }

  if (candidate.slug.trim()) {
    return `/${candidate.slug.trim().replace(/^\/+/, "")}`;
  }

  return null;
}

function statusPenalty(status: string) {
  const normalized = status.toLowerCase();

  if (normalized === "publish" || normalized === "published") {
    return 0;
  }

  if (normalized === "draft") {
    return 40;
  }

  if (normalized === "future" || normalized === "scheduled") {
    return 25;
  }

  return 10;
}

function isPublicPostStatus(status: string) {
  const normalized = status.trim().toLowerCase();

  return normalized === "publish" || normalized === "published";
}

function buildReason(input: {
  titleScore: number;
  excerptScore: number;
  sameCategory: boolean;
  status: string;
}) {
  const parts: string[] = [];

  if (input.titleScore > 0) {
    parts.push("title overlap");
  }

  if (input.excerptScore > 0) {
    parts.push("excerpt overlap");
  }

  if (input.sameCategory) {
    parts.push("same category");
  }

  if (input.status.toLowerCase() !== "publish") {
    parts.push(`${input.status} post, lower confidence`);
  }

  return parts.join("; ") || "topic overlap";
}

export function recommendInternalLinks(input: RecommendInternalLinksInput) {
  const queryTokens = tokenizeForSearch([input.keyword, input.angle, input.brief].join(" "));
  const keywordTokens = tokenizeForSearch(input.keyword);
  const limit = input.limit ?? 5;

  return input.candidates
    .map((candidate) => {
      const url = candidateUrl(candidate);

      if (!url) {
        return null;
      }

      const titleTokens = tokenizeForSearch(candidate.title);
      const excerptTokens = tokenizeForSearch(candidate.excerpt ?? "");
      const titleScore = Math.max(
        scoreTokenCoverage(queryTokens, titleTokens),
        scoreTokenCoverage(keywordTokens, titleTokens),
      );
      const excerptScore = Math.max(
        scoreTokenCoverage(queryTokens, excerptTokens),
        scoreTokenCoverage(keywordTokens, excerptTokens),
      );
      const sameCategory = candidate.categoryIds.includes(input.categoryId);
      const baseScore = Math.max(titleScore, excerptScore);
      const confidence = clampScore(
        baseScore + (sameCategory ? 15 : 0) - statusPenalty(candidate.wpStatus),
      );

      if (confidence < 15) {
        return null;
      }

      return {
        sitePostId: candidate.id,
        title: candidate.title,
        url,
        reason: buildReason({
          titleScore,
          excerptScore,
          sameCategory,
          status: candidate.wpStatus,
        }),
        confidence,
        categoryName: candidate.categoryName,
        wpStatus: candidate.wpStatus,
      } satisfies InternalLinkRecommendation;
    })
    .filter((recommendation): recommendation is InternalLinkRecommendation => Boolean(recommendation))
    .sort((left, right) => right.confidence - left.confidence || left.title.localeCompare(right.title))
    .slice(0, limit);
}

export function resolveVerifiedInternalLinks(input: ResolveVerifiedInternalLinksInput) {
  const recommendations = recommendInternalLinks({
    keyword: input.keyword,
    angle: input.angle,
    brief: input.brief,
    categoryId: input.categoryId,
    candidates: input.candidates.filter((candidate) => isPublicPostStatus(candidate.wpStatus)),
    limit: input.limit,
  });

  if (recommendations.length === 0) {
    return `${input.categoryFallback.title.trim()} - ${input.categoryFallback.url.trim()}`;
  }

  return recommendations
    .map((recommendation) => `${recommendation.title} - ${recommendation.url}`)
    .join("\n");
}
