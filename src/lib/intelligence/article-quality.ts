import { normalizeSearchText } from "@/lib/intelligence/text";

export type ArticleQualityInput = {
  title: string;
  primaryKeyword: string;
  contentMarkdown: string;
  metaTitle: string;
  metaDescription: string;
  internalLinks: string;
};

export type ArticleQualityAnalysis = {
  wordCount: number;
  headingCount: number;
  metaTitleLength: number;
  metaDescriptionLength: number;
  internalLinkCount: number;
  focusKeyphraseInTitle: boolean;
  focusKeyphraseInOpening: boolean;
  focusKeyphraseInMetaDescription: boolean;
  warnings: string[];
};

function markdownToPlainText(markdown: string) {
  return markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/\[[^\]]+\]\([^)]+\)/g, " ")
    .replace(/[#>*_\-[\]()!]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function countWords(markdown: string) {
  const text = markdownToPlainText(markdown);

  return text.match(/[A-Za-z0-9][A-Za-z0-9'-]*/g)?.length ?? 0;
}

function countHeadings(markdown: string) {
  return markdown.split(/\r?\n/).filter((line) => /^#{2,3}\s+\S/.test(line.trim())).length;
}

function countInternalLinks(value: string) {
  return value
    .split(/[\n,]+/)
    .map((item) => item.trim())
    .filter(Boolean).length;
}

function openingText(markdown: string) {
  return markdownToPlainText(markdown).split(/\s+/).slice(0, 120).join(" ");
}

function containsFocusKeyphrase(value: string, primaryKeyword: string) {
  const focus = normalizeSearchText(primaryKeyword);

  if (!focus) {
    return false;
  }

  return normalizeSearchText(value).includes(focus);
}

function buildWarnings(input: ArticleQualityAnalysis) {
  const warnings: string[] = [];

  if (input.wordCount < 900) {
    warnings.push("Draft is under 900 words; expand before publishing.");
  }

  if (input.headingCount < 3) {
    warnings.push("Add more H2/H3 structure before publishing.");
  }

  if (input.metaTitleLength < 35 || input.metaTitleLength > 70) {
    warnings.push("Meta title should stay between 35 and 70 characters.");
  }

  if (input.metaDescriptionLength < 120 || input.metaDescriptionLength > 170) {
    warnings.push("Meta description should stay between 120 and 170 characters.");
  }

  if (input.internalLinkCount === 0) {
    warnings.push("Add at least one real internal link suggestion.");
  }

  if (!input.focusKeyphraseInTitle) {
    warnings.push("Focus keyphrase is missing from the title.");
  }

  if (!input.focusKeyphraseInOpening) {
    warnings.push("Focus keyphrase is missing from the opening paragraph.");
  }

  return warnings;
}

export function analyzeArticleQuality(input: ArticleQualityInput): ArticleQualityAnalysis {
  const wordCount = countWords(input.contentMarkdown);
  const headingCount = countHeadings(input.contentMarkdown);
  const metaTitleLength = input.metaTitle.trim().length;
  const metaDescriptionLength = input.metaDescription.trim().length;
  const internalLinkCount = countInternalLinks(input.internalLinks);
  const analysis = {
    wordCount,
    headingCount,
    metaTitleLength,
    metaDescriptionLength,
    internalLinkCount,
    focusKeyphraseInTitle: containsFocusKeyphrase(input.title, input.primaryKeyword),
    focusKeyphraseInOpening: containsFocusKeyphrase(
      openingText(input.contentMarkdown),
      input.primaryKeyword,
    ),
    focusKeyphraseInMetaDescription: containsFocusKeyphrase(
      input.metaDescription,
      input.primaryKeyword,
    ),
    warnings: [],
  };

  return {
    ...analysis,
    warnings: buildWarnings(analysis),
  };
}

export function parseArticleQualityWarnings(value: string | null | undefined) {
  try {
    const parsed = JSON.parse(value ?? "[]") as unknown;

    if (Array.isArray(parsed)) {
      return parsed.filter((item): item is string => typeof item === "string");
    }
  } catch {
    return [];
  }

  return [];
}
