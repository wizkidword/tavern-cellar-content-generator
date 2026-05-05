import { type CoverageBalanceLabel } from "@/lib/intelligence/coverage";
import { type DuplicateRiskLabel } from "@/lib/intelligence/duplicates";
import { tokenizeForSearch } from "@/lib/intelligence/text";

type InternalLinkSignal = {
  confidence: number;
};

export type OpportunityScoreInput = {
  categoryName: string;
  keyword: string;
  angle: string;
  brief: string;
  coverageLabel: CoverageBalanceLabel;
  duplicateRiskLabel: DuplicateRiskLabel;
  internalLinks: InternalLinkSignal[];
};

export type OpportunityScoreBreakdown = {
  overallScore: number;
  tavernFitScore: number;
  coverageScore: number;
  seoScore: number;
  duplicateRiskScore: number;
  internalLinkScore: number;
  publishabilityScore: number;
  categoryBalanceScore: number;
  reasons: string[];
};

const TAVERN_TERMS = new Set([
  "advertising",
  "ads",
  "brand",
  "branding",
  "breakfast",
  "cereal",
  "cellar",
  "commercial",
  "dead",
  "game",
  "gaming",
  "horror",
  "mascot",
  "movie",
  "pantry",
  "package",
  "postwar",
  "retro",
  "slasher",
  "tavern",
  "vintage",
  "walking",
]);

const GENERIC_PHRASES = ["best", "everyone should", "popular", "rank", "top 10", "ultimate list"];

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function hasGenericPhrase(value: string) {
  const normalized = value.toLowerCase();

  return GENERIC_PHRASES.some((phrase) => normalized.includes(phrase));
}

function scoreTavernFit(input: OpportunityScoreInput) {
  const text = `${input.categoryName} ${input.keyword} ${input.angle} ${input.brief}`;
  const tokens = tokenizeForSearch(text);
  const tavernTermCount = tokens.filter((token) => TAVERN_TERMS.has(token)).length;
  const isGeneric = hasGenericPhrase(text);
  const specificityBonus = tokenizeForSearch(input.angle).length >= 8 ? 15 : 0;

  return clampScore(45 + Math.min(35, tavernTermCount * 5) + specificityBonus - (isGeneric ? 30 : 0));
}

function scoreCoverage(label: CoverageBalanceLabel) {
  switch (label) {
    case "quiet":
      return 95;
    case "developing":
      return 82;
    case "healthy":
      return 65;
    case "overloaded":
      return 40;
  }
}

function scoreDuplicateRisk(label: DuplicateRiskLabel) {
  switch (label) {
    case "fresh":
      return 100;
    case "adjacent":
      return 75;
    case "crowded":
      return 45;
    case "too_similar":
      return 10;
  }
}

function scoreSeo(input: OpportunityScoreInput) {
  const keywordTokens = tokenizeForSearch(input.keyword);
  const angleTokens = tokenizeForSearch(input.angle);
  const genericPenalty = hasGenericPhrase(`${input.keyword} ${input.angle}`) ? 40 : 0;
  const keywordClarity = keywordTokens.length >= 2 && keywordTokens.length <= 6 ? 35 : 18;
  const angleFocus = keywordTokens.some((token) => angleTokens.includes(token)) ? 25 : 10;
  const specificity = angleTokens.length >= 7 ? 25 : 10;

  return clampScore(20 + keywordClarity + angleFocus + specificity - genericPenalty);
}

function scoreInternalLinks(links: InternalLinkSignal[]) {
  if (links.length === 0) {
    return 20;
  }

  const averageConfidence =
    links.reduce((total, link) => total + link.confidence, 0) / Math.max(1, links.length);

  return clampScore(35 + Math.min(30, links.length * 12) + averageConfidence * 0.35);
}

function scorePublishability(input: OpportunityScoreInput) {
  const briefTokens = tokenizeForSearch(input.brief);
  const angleTokens = tokenizeForSearch(input.angle);
  const isGeneric = hasGenericPhrase(`${input.angle} ${input.brief}`);

  return clampScore(
    30 +
      Math.min(30, briefTokens.length * 2) +
      (angleTokens.length >= 7 ? 25 : 8) -
      (isGeneric ? 30 : 0),
  );
}

function buildReasons(input: OpportunityScoreInput, scores: Omit<OpportunityScoreBreakdown, "reasons">) {
  const reasons: string[] = [];

  if (scores.tavernFitScore >= 80) {
    reasons.push("Strong Tavern brand fit from specific lane vocabulary.");
  }

  if (hasGenericPhrase(`${input.keyword} ${input.angle} ${input.brief}`)) {
    reasons.push("The topic reads generic and needs a more Tavern-specific hook.");
  }

  if (input.duplicateRiskLabel === "too_similar" || input.duplicateRiskLabel === "crowded") {
    reasons.push("Duplicate risk is elevated; revise the angle before drafting.");
  }

  if (input.internalLinks.length === 0) {
    reasons.push("No real internal-link matches found yet.");
  }

  if (input.coverageLabel === "quiet" || input.coverageLabel === "developing") {
    reasons.push("Coverage value is strong because this lane needs more support.");
  }

  return reasons;
}

export function scoreOpportunity(input: OpportunityScoreInput): OpportunityScoreBreakdown {
  const tavernFitScore = scoreTavernFit(input);
  const coverageScore = scoreCoverage(input.coverageLabel);
  const seoScore = scoreSeo(input);
  const duplicateRiskScore = scoreDuplicateRisk(input.duplicateRiskLabel);
  const internalLinkScore = scoreInternalLinks(input.internalLinks);
  const publishabilityScore = scorePublishability(input);
  const categoryBalanceScore = coverageScore;
  const overallScore = clampScore(
    tavernFitScore * 0.22 +
      coverageScore * 0.18 +
      seoScore * 0.15 +
      duplicateRiskScore * 0.2 +
      internalLinkScore * 0.13 +
      publishabilityScore * 0.08 +
      categoryBalanceScore * 0.04,
  );
  const scores = {
    overallScore,
    tavernFitScore,
    coverageScore,
    seoScore,
    duplicateRiskScore,
    internalLinkScore,
    publishabilityScore,
    categoryBalanceScore,
  };

  return {
    ...scores,
    reasons: buildReasons(input, scores),
  };
}
