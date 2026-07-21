import { marked } from "marked";

import {
  recommendInternalLinks,
  type InternalLinkCandidate,
} from "@/lib/intelligence/internal-links";
import { scoreTokenCoverage, tokenizeForSearch } from "@/lib/intelligence/text";

export type ArticleLinkTargetType = "SITE_POST" | "LOCAL_ARTICLE";

export type ArticleLinkTarget = InternalLinkCandidate & {
  targetKey: string;
  targetType: ArticleLinkTargetType;
  isPublished: boolean;
};

export type ArticleLinkSuggestion = {
  targetKey: string;
  targetType: ArticleLinkTargetType;
  title: string;
  url: string;
  anchor: string;
  reason: string;
  confidence: number;
  location: string;
  insertionLineIndex: number;
  isPublished: boolean;
  unpublishedWarning: string | null;
  alreadyLinked: boolean;
};

type ArticleLinkSuggestionInput = {
  contentMarkdown: string;
  primaryKeyword: string;
  angle: string;
  categoryId: number;
  targets: ArticleLinkTarget[];
};

type InsertionPoint = {
  lineIndex: number;
  location: string;
};

function normalizeDestination(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    return "";
  }

  try {
    const url = trimmed.startsWith("/")
      ? new URL(trimmed, "https://foundry.invalid")
      : new URL(trimmed);
    const pathname = url.pathname.replace(/\/+$/, "") || "/";
    return `${pathname}${url.search}`;
  } catch {
    return trimmed.replace(/\/+$/, "") || "/";
  }
}

function collectLinkDestinations(value: unknown, destinations: Set<string>, visited: Set<object>) {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectLinkDestinations(item, destinations, visited);
    }
    return;
  }

  if (!value || typeof value !== "object" || visited.has(value)) {
    return;
  }

  visited.add(value);
  const token = value as { type?: unknown; href?: unknown; tokens?: unknown; items?: unknown };

  if (token.type === "link" && typeof token.href === "string") {
    destinations.add(normalizeDestination(token.href));
  }

  collectLinkDestinations(token.tokens, destinations, visited);
  collectLinkDestinations(token.items, destinations, visited);
}

export function getExistingInternalLinkDestinations(markdown: string) {
  const destinations = new Set<string>();
  collectLinkDestinations(marked.lexer(markdown), destinations, new Set());
  return destinations;
}

function findInsertionPoint(markdown: string, target: ArticleLinkTarget): InsertionPoint {
  const lines = markdown.split("\n");
  const headings = lines
    .map((line, index) => {
      const match = /^(#{2,3})\s+(.+?)\s*#*\s*$/.exec(line.trim());
      return match ? { index, title: match[2].trim() } : null;
    })
    .filter((heading): heading is { index: number; title: string } => Boolean(heading));

  if (headings.length > 0) {
    const targetTokens = tokenizeForSearch(`${target.title} ${target.excerpt ?? ""}`);
    const bestHeading = headings
      .map((heading, position) => {
        const nextHeading = headings[position + 1];
        const sectionTokens = tokenizeForSearch(
          lines.slice(heading.index, nextHeading?.index ?? lines.length).join(" "),
        );
        return {
          ...heading,
          score: scoreTokenCoverage(sectionTokens, targetTokens),
        };
      })
      .sort((left, right) => right.score - left.score || left.index - right.index)[0];

    return {
      lineIndex: bestHeading.index + 1,
      location: `After “${bestHeading.title}”`,
    };
  }

  let lineIndex = 0;

  while (lineIndex < lines.length && !lines[lineIndex].trim()) {
    lineIndex += 1;
  }

  while (lineIndex < lines.length && lines[lineIndex].trim()) {
    lineIndex += 1;
  }

  return {
    lineIndex,
    location: "After the opening paragraph",
  };
}

function unpublishedWarning(target: ArticleLinkTarget) {
  if (target.isPublished) {
    return null;
  }

  if (target.targetType === "LOCAL_ARTICLE") {
    if (target.wpStatus === "future") {
      return "This target is a scheduled local article. Its public link will not work until its scheduled publish time.";
    }

    return "This target is an unpublished local draft. Its public link will not work until it is published.";
  }

  return "This WordPress target is not public yet. Confirm its publish state before publishing this article.";
}

export function createArticleLinkSuggestions(input: ArticleLinkSuggestionInput) {
  const byTargetKey = new Map(input.targets.map((target) => [target.targetKey, target]));
  const existingDestinations = getExistingInternalLinkDestinations(input.contentMarkdown);
  const recommendations = recommendInternalLinks({
    keyword: input.primaryKeyword,
    angle: input.angle,
    brief: input.contentMarkdown,
    categoryId: input.categoryId,
    candidates: input.targets.map((target) => ({
      id: target.targetKey,
      title: target.title,
      slug: target.slug,
      link: target.link,
      excerpt: target.excerpt,
      wpStatus: target.wpStatus,
      categoryName: target.categoryName,
      categoryIds: target.categoryIds,
      publishedAt: target.publishedAt,
    })),
    limit: 12,
  });

  return recommendations.flatMap((recommendation) => {
    const target = byTargetKey.get(recommendation.sitePostId);

    if (!target) {
      return [];
    }

    const insertionPoint = findInsertionPoint(input.contentMarkdown, target);

    return [{
      targetKey: target.targetKey,
      targetType: target.targetType,
      title: target.title,
      url: recommendation.url,
      anchor: target.title,
      reason: recommendation.reason,
      confidence: recommendation.confidence,
      location: insertionPoint.location,
      insertionLineIndex: insertionPoint.lineIndex,
      isPublished: target.isPublished,
      unpublishedWarning: unpublishedWarning(target),
      alreadyLinked: existingDestinations.has(normalizeDestination(recommendation.url)),
    } satisfies ArticleLinkSuggestion];
  });
}

function buildInsertedLink(anchor: string, url: string) {
  return `Further reading: [${anchor}](${url})`;
}

export function insertArticleLinkSuggestion(markdown: string, suggestion: ArticleLinkSuggestion) {
  const existingDestinations = getExistingInternalLinkDestinations(markdown);

  if (suggestion.alreadyLinked || existingDestinations.has(normalizeDestination(suggestion.url))) {
    throw new Error("This internal-link target is already present in the saved article.");
  }

  const lines = markdown.split("\n");
  const insertionLineIndex = Math.max(0, Math.min(suggestion.insertionLineIndex, lines.length));
  const before = lines.slice(0, insertionLineIndex);
  const after = lines.slice(insertionLineIndex);

  while (before.length > 0 && !before[before.length - 1].trim()) {
    before.pop();
  }

  while (after.length > 0 && !after[0].trim()) {
    after.shift();
  }

  return [...before, "", buildInsertedLink(suggestion.anchor, suggestion.url), "", ...after].join("\n");
}

function hasReferenceDestination(value: string, destination: string) {
  const expected = normalizeDestination(destination);
  const matches = value.match(/(?:https?:\/\/[^\s)]+|\/[A-Za-z0-9][^\s)]*)/g) ?? [];
  return matches.some((candidate) => normalizeDestination(candidate) === expected);
}

export function appendArticleLinkReference(existingReferences: string, suggestion: ArticleLinkSuggestion) {
  const lines = existingReferences
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.some((line) => hasReferenceDestination(line, suggestion.url))) {
    return lines.join("\n");
  }

  return [...lines, `${suggestion.title} - ${suggestion.url}`].join("\n");
}
