import {
  normalizeSearchText,
  scoreTokenCoverage,
  scoreTokenOverlap,
  tokenizeForSearch,
} from "@/lib/intelligence/text";

export type DuplicateSource = "app" | "site";
export type DuplicateRiskLabel = "fresh" | "adjacent" | "crowded" | "too_similar";

export type DuplicateCandidate = {
  id: string;
  source: DuplicateSource;
  categoryId: number | null;
  title: string;
  angle: string;
  status: string;
};

export type DuplicateRiskMatch = DuplicateCandidate & {
  similarity: number;
  reason: string;
};

export type DuplicateRiskAssessment = {
  label: DuplicateRiskLabel;
  blockingSimilarity: boolean;
  highestSimilarity: number;
  matches: DuplicateRiskMatch[];
};

type AssessDuplicateRiskInput = {
  keyword: string;
  angle: string;
  title?: string;
  categoryId: number;
  localArticles: DuplicateCandidate[];
  sitePosts: DuplicateCandidate[];
};

function labelFromSimilarity(similarity: number): DuplicateRiskLabel {
  if (similarity >= 85) {
    return "too_similar";
  }

  if (similarity >= 65) {
    return "crowded";
  }

  if (similarity >= 40) {
    return "adjacent";
  }

  return "fresh";
}

function explainSimilarity(similarity: number, source: DuplicateSource) {
  if (similarity >= 85) {
    return `Strong overlap with existing ${source === "app" ? "local" : "WordPress"} coverage.`;
  }

  if (similarity >= 65) {
    return "High topic overlap; revise the angle before drafting.";
  }

  return "Some overlap, but the angle may still be distinct.";
}

function calculateSimilarity(input: {
  keyword: string;
  title: string;
  angle: string;
  candidate: DuplicateCandidate;
}) {
  const desiredTitle = normalizeSearchText(input.title || input.keyword);
  const existingTitle = normalizeSearchText(input.candidate.title);

  if (desiredTitle && desiredTitle === existingTitle) {
    return 100;
  }

  const titleScore = scoreTokenOverlap(
    tokenizeForSearch(input.title || input.keyword),
    tokenizeForSearch(input.candidate.title),
  );
  const angleScore = scoreTokenOverlap(tokenizeForSearch(input.angle), tokenizeForSearch(input.candidate.angle));
  const keywordCoverage = Math.max(
    scoreTokenCoverage(tokenizeForSearch(input.candidate.title), tokenizeForSearch(input.keyword)),
    scoreTokenCoverage(tokenizeForSearch(input.candidate.angle), tokenizeForSearch(input.keyword)),
  );

  return Math.max(titleScore, angleScore, Math.round(keywordCoverage * 0.75));
}

export function assessDuplicateRisk(input: AssessDuplicateRiskInput): DuplicateRiskAssessment {
  const matches = [...input.localArticles, ...input.sitePosts]
    .filter((candidate) => candidate.categoryId === input.categoryId)
    .map((candidate) => {
      const similarity = calculateSimilarity({
        keyword: input.keyword,
        title: input.title ?? input.keyword,
        angle: input.angle,
        candidate,
      });

      return {
        ...candidate,
        similarity,
        reason: explainSimilarity(similarity, candidate.source),
      };
    })
    .filter((candidate) => candidate.similarity >= 40)
    .sort((left, right) => right.similarity - left.similarity || left.title.localeCompare(right.title));

  const highestSimilarity = matches[0]?.similarity ?? 0;
  const label = labelFromSimilarity(highestSimilarity);

  return {
    label,
    blockingSimilarity: label === "too_similar",
    highestSimilarity,
    matches,
  };
}
