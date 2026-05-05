import { ArticleStatus } from "@prisma/client";

import { isAllowedAppCategorySlug, sortCategoriesForApp } from "@/lib/category-config";
import { prisma } from "@/lib/db";
import {
  deleteGeneratedImageAsset,
  generateAngleIdeas,
  generateArticleDraft,
  generateFeaturedImageAsset,
  generatePrimaryKeywordIdeas,
} from "@/lib/openai";
import {
  buildCanonicalTopicKey,
  normalizeTopicValue,
  similarityScore,
  slugify,
  splitListInput,
} from "@/lib/topic-utils";
import { pushArticleToWordPress, syncWordPressCatalog } from "@/lib/wordpress";

type GenerateArticleRequest = {
  categoryId: number;
  primaryKeyword: string;
  angle: string;
  notes?: string;
  generateImage: boolean;
};

type DuplicateCandidate = {
  source: "app" | "site";
  title: string;
  angle: string;
  similarity: number;
};

type CategoryCoverage = {
  id: number;
  wpCategoryId: number;
};

function summarizeDuplicateMatches(matches: DuplicateCandidate[]) {
  return matches
    .slice(0, 4)
    .map((match) => `${match.title} (${match.source}, ${Math.round(match.similarity * 100)}% match)`)
    .join("; ");
}

function mergeNotes(currentNotes: string | null, extraNote: string) {
  if (!currentNotes) {
    return extraNote;
  }

  if (currentNotes.includes(extraNote)) {
    return currentNotes;
  }

  return `${currentNotes}\n\n${extraNote}`;
}

async function ensureLiveHistory() {
  const [categoryCount, sitePostCount] = await Promise.all([
    prisma.category.count(),
    prisma.sitePost.count(),
  ]);

  if (categoryCount === 0 || sitePostCount === 0) {
    await syncWordPressCatalog();
  }
}

async function getPlanningCategory(categoryId: number) {
  await ensureLiveHistory();

  const category = await prisma.category.findUnique({
    where: { id: categoryId },
  });

  if (!category) {
    throw new Error("Select a valid category first.");
  }

  if (!isAllowedAppCategorySlug(category.slug)) {
    throw new Error("Select one of the active Foundry categories first.");
  }

  return category;
}

function rawCategoryIdsInclude(rawCategoryIds: string, wpCategoryId: number) {
  try {
    const parsed = JSON.parse(rawCategoryIds) as unknown;

    return Array.isArray(parsed) && parsed.includes(wpCategoryId);
  } catch {
    return false;
  }
}

function sitePostBelongsToCategory(
  post: { primaryCategoryId: number | null; rawCategoryIds: string },
  category: CategoryCoverage,
) {
  return (
    post.primaryCategoryId === category.id ||
    rawCategoryIdsInclude(post.rawCategoryIds, category.wpCategoryId)
  );
}

async function getRecentTitlesForCategory(category: CategoryCoverage) {
  const sitePosts = (
    await prisma.sitePost.findMany({
      select: { title: true, primaryCategoryId: true, rawCategoryIds: true },
      orderBy: { publishedAt: "desc" },
      take: 300,
    })
  )
    .filter((post) => sitePostBelongsToCategory(post, category))
    .slice(0, 20)
    .map((post) => post.title);

  return [
    ...sitePosts,
    ...(
      await prisma.article.findMany({
        where: { categoryId: category.id },
        select: { title: true },
        orderBy: { createdAt: "desc" },
        take: 10,
      })
    ).map((article) => article.title),
  ].slice(0, 24);
}

async function findDuplicateCandidates(input: {
  categoryId: number;
  wpCategoryId: number;
  title: string;
  angle: string;
}) {
  const [existingArticles, sitePosts] = await Promise.all([
    prisma.article.findMany({
      where: { categoryId: input.categoryId },
      select: {
        title: true,
        angle: true,
      },
      orderBy: { createdAt: "desc" },
      take: 60,
    }),
    prisma.sitePost.findMany({
      select: {
        title: true,
        primaryCategoryId: true,
        rawCategoryIds: true,
      },
      orderBy: { publishedAt: "desc" },
      take: 500,
    }),
  ]);

  const articleMatches = existingArticles
    .map((article) => ({
      source: "app" as const,
      title: article.title,
      angle: article.angle,
      similarity: Math.max(
        similarityScore(input.title, article.title),
        similarityScore(input.angle, article.angle),
      ),
    }))
    .filter((match) => match.similarity >= 0.58);

  const siteMatches = sitePosts
    .filter((post) =>
      sitePostBelongsToCategory(post, {
        id: input.categoryId,
        wpCategoryId: input.wpCategoryId,
      }),
    )
    .map((post) => ({
      source: "site" as const,
      title: post.title,
      angle: post.title,
      similarity: Math.max(
        similarityScore(input.title, post.title),
        similarityScore(input.angle, post.title),
      ),
    }))
    .filter((match) => match.similarity >= 0.62);

  return [...articleMatches, ...siteMatches].sort((left, right) => right.similarity - left.similarity);
}

export async function createArticle(request: GenerateArticleRequest) {
  const category = await getPlanningCategory(request.categoryId);

  const exactMatches = await findDuplicateCandidates({
    categoryId: category.id,
    wpCategoryId: category.wpCategoryId,
    title: request.primaryKeyword,
    angle: request.angle,
  });

  if (exactMatches.some((match) => match.similarity >= 0.82)) {
    throw new Error(
      `This request looks too close to existing coverage: ${summarizeDuplicateMatches(exactMatches)}`,
    );
  }

  const recentTitles = await getRecentTitlesForCategory(category);

  const generated = await generateArticleDraft({
    categoryName: category.name,
    categorySlug: category.slug,
    primaryKeyword: request.primaryKeyword,
    angle: request.angle,
    notes: request.notes,
    recentTitles,
  });

  const canonicalTopicKey = buildCanonicalTopicKey(
    category.slug,
    generated.title,
    generated.angle,
    generated.primaryKeyword,
  );

  const duplicateMatches = await findDuplicateCandidates({
    categoryId: category.id,
    wpCategoryId: category.wpCategoryId,
    title: generated.title,
    angle: generated.angle,
  });

  if (duplicateMatches.some((match) => match.similarity >= 0.7)) {
    throw new Error(
      `The generated article still overlaps with existing coverage: ${summarizeDuplicateMatches(
        duplicateMatches,
      )}`,
    );
  }

  const article = await prisma.article.create({
    data: {
      categoryId: category.id,
      title: generated.title,
      normalizedTitle: normalizeTopicValue(generated.title),
      angle: generated.angle,
      normalizedAngle: normalizeTopicValue(generated.angle),
      primaryKeyword: generated.primaryKeyword,
      normalizedKeyword: normalizeTopicValue(generated.primaryKeyword),
      canonicalTopicKey,
      slug: slugify(generated.slug || generated.title),
      notes: request.notes?.trim() || null,
      contentMarkdown: generated.contentMarkdown.trim(),
      metaTitle: generated.metaTitle.trim(),
      metaDescription: generated.metaDescription.trim(),
      excerpt: generated.excerpt.trim(),
      tags: generated.tagsText,
      internalLinks: generated.internalLinksText,
      featuredImagePrompt: generated.featuredImagePrompt.trim(),
      featuredImageAlt: generated.featuredImageAlt.trim(),
      openAiTextModel: generated.textModel,
    },
    include: {
      category: true,
    },
  });

  if (!request.generateImage) {
    return article;
  }

  try {
    const image = await generateFeaturedImageAsset(article.id, article.featuredImagePrompt);

    return prisma.article.update({
      where: { id: article.id },
      data: {
        featuredImagePath: image.publicPath,
        featuredImageMimeType: image.mimeType,
        openAiImageModel: image.imageModel,
      },
      include: {
        category: true,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Featured image generation did not complete.";
    const isVerificationBlock = message.toLowerCase().includes("organization must be verified");

    if (!isVerificationBlock) {
      throw error;
    }

    return prisma.article.update({
      where: { id: article.id },
      data: {
        notes: mergeNotes(
          article.notes,
          "Featured image not generated yet: verify the OpenAI organization for GPT Image access, then retry from the review page.",
        ),
      },
      include: {
        category: true,
      },
    });
  }
}

export async function suggestPrimaryKeywords(input: { categoryId: number; notes?: string }) {
  const category = await getPlanningCategory(input.categoryId);
  const recentTitles = await getRecentTitlesForCategory(category);

  return generatePrimaryKeywordIdeas({
    categoryName: category.name,
    categorySlug: category.slug,
    notes: input.notes,
    recentTitles,
  });
}

export async function suggestAngles(input: {
  categoryId: number;
  primaryKeyword: string;
  notes?: string;
}) {
  const category = await getPlanningCategory(input.categoryId);
  const primaryKeyword = input.primaryKeyword.trim();

  if (!primaryKeyword) {
    throw new Error("Add or generate a primary keyword first.");
  }

  const recentTitles = await getRecentTitlesForCategory(category);

  return generateAngleIdeas({
    categoryName: category.name,
    categorySlug: category.slug,
    primaryKeyword,
    notes: input.notes,
    recentTitles,
  });
}

function readString(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function readOptionalSchedule(formData: FormData, key: string) {
  const value = readString(formData, key);

  if (!value) {
    return {
      date: null,
      localValue: null,
    };
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);

  if (!match) {
    throw new Error("Use a valid schedule date and time.");
  }

  const [, year, month, day, hour, minute] = match.map(Number);
  const date = new Date(year, month - 1, day, hour, minute, 0, 0);

  if (
    Number.isNaN(date.getTime()) ||
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day ||
    date.getHours() !== hour ||
    date.getMinutes() !== minute
  ) {
    throw new Error("Use a valid schedule date and time.");
  }

  return {
    date,
    localValue: value,
  };
}

function ensureFutureSchedule<T extends {
  scheduledFor: Date | null;
  scheduledForLocal: string | null;
}>(article: T): asserts article is T & {
  scheduledFor: Date;
  scheduledForLocal: string;
} {
  if (!article.scheduledFor || !article.scheduledForLocal) {
    throw new Error("Add a schedule date before using the schedule action.");
  }

  if (article.scheduledFor.getTime() <= Date.now()) {
    throw new Error("Choose a future schedule date and time before scheduling.");
  }
}

export async function saveArticleReview(articleId: string, formData: FormData) {
  const categoryId = Number(readString(formData, "categoryId"));
  const title = readString(formData, "title");
  const angle = readString(formData, "angle");
  const primaryKeyword = readString(formData, "primaryKeyword");
  const slug = slugify(readString(formData, "slug") || title);
  const tags = splitListInput(readString(formData, "tags")).join(", ");
  const internalLinks = splitListInput(readString(formData, "internalLinks")).join("\n");
  const notes = readString(formData, "notes");
  const schedule = readOptionalSchedule(formData, "scheduledFor");

  const category = await prisma.category.findUnique({
    where: { id: categoryId },
  });

  if (!category) {
    throw new Error("Pick a valid category before saving the article.");
  }

  return prisma.article.update({
    where: { id: articleId },
    data: {
      categoryId,
      title,
      normalizedTitle: normalizeTopicValue(title),
      angle,
      normalizedAngle: normalizeTopicValue(angle),
      primaryKeyword,
      normalizedKeyword: normalizeTopicValue(primaryKeyword),
      canonicalTopicKey: buildCanonicalTopicKey(category.slug, title, angle, primaryKeyword),
      slug,
      notes: notes || null,
      metaTitle: readString(formData, "metaTitle"),
      metaDescription: readString(formData, "metaDescription"),
      excerpt: readString(formData, "excerpt"),
      tags,
      internalLinks,
      featuredImagePrompt: readString(formData, "featuredImagePrompt"),
      featuredImageAlt: readString(formData, "featuredImageAlt"),
      contentMarkdown: readString(formData, "contentMarkdown"),
      scheduledFor: schedule.date,
      scheduledForLocal: schedule.localValue,
      status: ArticleStatus.READY_FOR_REVIEW,
    },
    include: {
      category: true,
    },
  });
}

export async function regenerateFeaturedImage(articleId: string, formData: FormData) {
  const article = await saveArticleReview(articleId, formData);
  const image = await generateFeaturedImageAsset(article.id, article.featuredImagePrompt);

  const updated = await prisma.article.update({
    where: { id: article.id },
    data: {
      featuredImagePath: image.publicPath,
      featuredImageMimeType: image.mimeType,
      openAiImageModel: image.imageModel,
      wpMediaId: null,
    },
    include: {
      category: true,
    },
  });

  if (article.featuredImagePath && article.featuredImagePath !== image.publicPath) {
    await deleteGeneratedImageAsset(article.featuredImagePath);
  }

  return updated;
}

export async function publishArticle(
  articleId: string,
  formData: FormData,
  mode: "draft" | "publish" | "future",
) {
  const article = await saveArticleReview(articleId, formData);
  let schedule: { localDateTime: string } | null = null;

  if (mode === "future") {
    ensureFutureSchedule(article);
    schedule = {
      localDateTime: article.scheduledForLocal,
    };
  }

  const payload = await pushArticleToWordPress(article, mode, schedule);
  const notes = payload.yoastMetaApplied
    ? article.notes
    : mergeNotes(
        article.notes,
        "Yoast SEO REST bridge not detected on WordPress. Install the companion plugin from this repo to sync focus keyphrase, SEO title, and meta description automatically.",
      );

  let status: ArticleStatus = ArticleStatus.WP_DRAFT;
  if (mode === "publish") {
    status = ArticleStatus.PUBLISHED;
  }
  if (mode === "future") {
    status = ArticleStatus.SCHEDULED;
  }

  return prisma.article.update({
    where: { id: article.id },
    data: {
      wpPostId: payload.id,
      wpStatus: payload.status,
      status,
      notes,
      publishedAt: mode === "publish" ? new Date() : article.publishedAt,
    },
    include: {
      category: true,
    },
  });
}

export async function getArticleById(articleId: string) {
  return prisma.article.findUnique({
    where: { id: articleId },
    include: {
      category: true,
    },
  });
}

export async function getDashboardData() {
  const [allCategories, articles, sitePostCount, articleCount] = await Promise.all([
    prisma.category.findMany({
      include: {
        _count: {
          select: {
            articles: true,
          },
        },
      },
      orderBy: [{ postCount: "desc" }, { name: "asc" }],
    }),
    prisma.article.findMany({
      include: {
        category: true,
      },
      orderBy: { updatedAt: "desc" },
      take: 8,
    }),
    prisma.sitePost.count(),
    prisma.article.count(),
  ]);

  const categories = sortCategoriesForApp(
    allCategories.filter((category) => isAllowedAppCategorySlug(category.slug)),
  );

  return {
    categories,
    articles,
    sitePostCount,
    articleCount,
  };
}
