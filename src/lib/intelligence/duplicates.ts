import {
  normalizeSearchText,
  scoreTokenCoverage,
  scoreTokenOverlap,
  tokenizeForSearch,
} from "@/lib/intelligence/text";
import { filterLowInformationDuplicateTerms } from "@/lib/intelligence/duplicate-config";

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
  explanation: string;
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

function explainSimilarity(input: {
  similarity: number;
  source: DuplicateSource;
  desiredTokens: string[];
  candidateTokens: string[];
}) {
  const matchedTokens = input.desiredTokens.filter((token) => input.candidateTokens.includes(token));
  const evidence = matchedTokens.length > 0
    ? `Shared terms: ${matchedTokens.slice(0, 6).join(", ")}.`
    : "Similarity came from the requested angle rather than a shared title term.";

  if (input.similarity >= 85) {
    return {
      reason: `Strong overlap with existing ${input.source === "app" ? "local" : "WordPress"} coverage.`,
      explanation: `${evidence} Exact title matches always block drafting.`,
    };
  }

  if (input.similarity >= 65) {
    return {
      reason: "High topic overlap; revise the angle before drafting.",
      explanation: `${evidence} Broad terms such as “review” and “retro” are ignored unless no better evidence exists.`,
    };
  }

  return {
    reason: "Some overlap, but the angle may still be distinct.",
    explanation: evidence,
  };
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
    return {
      similarity: 100,
      desiredTitleTokens: filterLowInformationDuplicateTerms(tokenizeForSearch(input.title || input.keyword)),
      candidateTitleTokens: filterLowInformationDuplicateTerms(tokenizeForSearch(input.candidate.title)),
    };
  }

  const desiredTitleTokens = filterLowInformationDuplicateTerms(
    tokenizeForSearch(input.title || input.keyword),
  );
  const candidateTitleTokens = filterLowInformationDuplicateTerms(
    tokenizeForSearch(input.candidate.title),
  );
  const desiredAngleTokens = filterLowInformationDuplicateTerms(tokenizeForSearch(input.angle));
  const candidateAngleTokens = filterLowInformationDuplicateTerms(tokenizeForSearch(input.candidate.angle));
  const keywordTokens = filterLowInformationDuplicateTerms(tokenizeForSearch(input.keyword));
  const titleScore = scoreTokenOverlap(desiredTitleTokens, candidateTitleTokens);
  const angleScore = scoreTokenOverlap(desiredAngleTokens, candidateAngleTokens);
  const keywordCoverage = Math.max(
    scoreTokenCoverage(candidateTitleTokens, keywordTokens),
    scoreTokenCoverage(candidateAngleTokens, keywordTokens),
  );

  return {
    similarity: Math.max(titleScore, angleScore, Math.round(keywordCoverage * 0.75)),
    desiredTitleTokens,
    candidateTitleTokens,
  };
}

export function assessDuplicateRisk(input: AssessDuplicateRiskInput): DuplicateRiskAssessment {
  const matches = [...input.localArticles, ...input.sitePosts]
    .filter((candidate) => candidate.categoryId === input.categoryId)
    .map((candidate) => {
      const comparison = calculateSimilarity({
        keyword: input.keyword,
        title: input.title ?? input.keyword,
        angle: input.angle,
        candidate,
      });

      const explanation = explainSimilarity({
        similarity: comparison.similarity,
        source: candidate.source,
        desiredTokens: comparison.desiredTitleTokens,
        candidateTokens: comparison.candidateTitleTokens,
      });

      return {
        ...candidate,
        similarity: comparison.similarity,
        reason: explanation.reason,
        explanation: explanation.explanation,
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
