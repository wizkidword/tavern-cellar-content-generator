import {
  type Article,
  type ArticleBodyImage,
  ArticleStatus,
  type Category,
} from "@prisma/client";

import {
  buildArticleBodyImageRequests,
  insertArticleBodyImageMarkdown,
  removeArticleBodyImageMarkdown,
  resolveArticleBodyImageCount,
} from "@/lib/article-body-images";
import { isActiveAppCategory, sortCategoriesForApp } from "@/lib/category-config";
import { prisma } from "@/lib/db";
import { getServerEnv } from "@/lib/env";
import {
  deleteGeneratedImageAsset,
  generateFeaturedImageAsset,
  type FalImageModel,
  type FeaturedImageProvider,
  type OpenAIImageModel,
  resolveFalImageModel,
  resolveFeaturedImageProvider,
  resolveOpenAIImageModel,
} from "@/lib/featured-image";
import { analyzeArticleQuality } from "@/lib/intelligence/article-quality";
import { assessDuplicateRisk } from "@/lib/intelligence/duplicates";
import {
  resolveGeneratedInternalLinks,
  type InternalLinkCandidate,
} from "@/lib/intelligence/internal-links";
import {
  generateAngleIdeas,
  generateArticleDraft,
  generatePrimaryKeywordIdeas,
} from "@/lib/openai";
import {
  buildCanonicalTopicKey,
  normalizeTopicValue,
  slugify,
  splitListInput,
} from "@/lib/topic-utils";
import {
  type OpenAITextModel,
  getComparisonCandidateOpenAITextModels,
  getComparisonTargetOpenAITextModel,
  resolveOpenAITextModel,
} from "@/lib/openai-models";
import {
  fetchScheduledWordPressPostTimes,
  pushArticleToWordPress,
  syncWordPressCatalog,
} from "@/lib/wordpress";
import {
  formatDateTimeLocal,
  pickRandomWordPressScheduleSlot,
} from "@/lib/random-schedule";

type GenerateArticleRequest = {
  categoryId: number;
  primaryKeyword: string;
  angle: string;
  notes?: string;
  generateImage: boolean;
  textModel: OpenAITextModel;
  imageProvider: FeaturedImageProvider;
  falImageModel?: FalImageModel;
  openAiImageModel?: OpenAIImageModel;
  bodyImageCount?: number;
};

type WordPressPublishMode = "draft" | "publish" | "future";

type ArticleWithCategory = Article & {
  category: Category;
};

type ArticleWithCategoryAndBodyImages = ArticleWithCategory & {
  bodyImages: ArticleBodyImage[];
};

type DuplicateCandidate = {
  source: "app" | "site";
  title: string;
  angle: string;
  similarity: number;
  status: string;
  reason: string;
};

type CategoryCoverage = {
  id: number;
  wpCategoryId: number;
};

type ArticleLinkCategory = CategoryCoverage & {
  name: string;
  slug: string;
};

function summarizeDuplicateMatches(matches: DuplicateCandidate[]) {
  return matches
    .slice(0, 4)
    .map((match) => `${match.title} (${match.source}, ${match.status}, ${match.similarity}% match)`)
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

function imageProviderLabel(provider: FeaturedImageProvider) {
  return provider === "fal" ? "fal.ai" : "OpenAI";
}

function errorDetail(error: unknown) {
  if (!(error instanceof Error)) {
    return "Unknown image generation error.";
  }

  const status =
    "status" in error && typeof error.status === "number"
      ? `${error.status} `
      : "";
  const structuredError = getStructuredFalErrorDetail(error);

  return `${status}${error.message}${structuredError ? `: ${structuredError}` : ""}`.trim();
}

function getStructuredFalErrorDetail(error: Error) {
  if (!("body" in error) || !error.body || typeof error.body !== "object") {
    return null;
  }

  const detail = "detail" in error.body ? error.body.detail : null;

  if (!Array.isArray(detail) || detail.length === 0) {
    return null;
  }

  const firstDetail = detail[0] as {
    msg?: unknown;
    type?: unknown;
  };
  const message = typeof firstDetail.msg === "string" ? firstDetail.msg : null;
  const type = typeof firstDetail.type === "string" ? firstDetail.type : null;

  if (message && type) {
    return `${message} (${type})`;
  }

  return message ?? type;
}

export function buildImageGenerationFailureNote(input: {
  imageType: "Featured image" | "Article body images";
  provider: FeaturedImageProvider;
  model?: string | null;
  error: unknown;
}) {
  const model = input.model ? ` using ${input.model}` : "";

  return `${input.imageType} not generated: ${imageProviderLabel(input.provider)}${model} returned ${errorDetail(input.error)}. Draft text was saved; retry image generation from the review page.`;
}

type ImageRecoveryReason = "failed" | "missing" | "ready";

function imageRecoveryReason(input: {
  notes?: string | null;
  hasImage: boolean;
  failureNeedle: string;
}): ImageRecoveryReason {
  if (input.notes?.toLowerCase().includes(input.failureNeedle.toLowerCase())) {
    return "failed";
  }

  if (!input.hasImage) {
    return "missing";
  }

  return "ready";
}

export function getArticleImageRecoveryState(input: {
  featuredImagePath?: string | null;
  bodyImageCount: number;
  notes?: string | null;
}) {
  const featuredReason = imageRecoveryReason({
    notes: input.notes,
    hasImage: Boolean(input.featuredImagePath),
    failureNeedle: "Featured image not generated:",
  });
  const bodyReason = imageRecoveryReason({
    notes: input.notes,
    hasImage: input.bodyImageCount > 0,
    failureNeedle: "Article body images not generated:",
  });

  return {
    featuredImage: {
      canRetry: featuredReason !== "ready",
      reason: featuredReason,
    },
    bodyImages: {
      canRetry: bodyReason !== "ready",
      reason: bodyReason,
    },
  };
}

export function getForcedPublishTimestamp(
  mode: WordPressPublishMode,
  previousArticle: {
    status: ArticleStatus | string;
    wpStatus: string | null;
    wpPostId: number | null;
  } | null,
  now = new Date(),
) {
  if (mode !== "publish" || !previousArticle?.wpPostId) {
    return null;
  }

  if (previousArticle.status === ArticleStatus.SCHEDULED || previousArticle.wpStatus === "future") {
    return now;
  }

  return null;
}

export function resolveArticleStatusFromWordPress(
  requestedMode: WordPressPublishMode,
  wpStatus: string | null,
) {
  if (wpStatus === "publish" || wpStatus === "published") {
    return ArticleStatus.PUBLISHED;
  }

  if (wpStatus === "future" || requestedMode === "future") {
    return ArticleStatus.SCHEDULED;
  }

  if (requestedMode === "publish") {
    return ArticleStatus.WP_DRAFT;
  }

  return ArticleStatus.WP_DRAFT;
}

function articleWithBodyImagesInclude() {
  return {
    category: true,
    bodyImages: {
      orderBy: {
        sortOrder: "asc" as const,
      },
    },
  };
}

async function deleteExistingBodyImages(images: ArticleBodyImage[]) {
  if (images.length === 0) {
    return;
  }

  await prisma.articleBodyImage.deleteMany({
    where: {
      id: {
        in: images.map((image) => image.id),
      },
    },
  });

  await Promise.all(images.map((image) => deleteGeneratedImageAsset(image.publicPath)));
}

async function generateBodyImagesForArticle(input: {
  article: ArticleWithCategoryAndBodyImages;
  count: unknown;
  imageProvider: FeaturedImageProvider;
  falImageModel?: unknown;
  openAiImageModel?: unknown;
  replaceExisting: boolean;
}) {
  const count = resolveArticleBodyImageCount(input.count);
  let article = input.article;

  if (input.replaceExisting && article.bodyImages.length > 0) {
    const contentMarkdown = removeArticleBodyImageMarkdown(
      article.contentMarkdown,
      article.bodyImages,
    );

    await deleteExistingBodyImages(article.bodyImages);

    article = await prisma.article.update({
      where: { id: article.id },
      data: { contentMarkdown },
      include: articleWithBodyImagesInclude(),
    });
  }

  if (count === 0) {
    return article;
  }

  const requests = buildArticleBodyImageRequests({
    title: article.title,
    angle: article.angle,
    primaryKeyword: article.primaryKeyword,
    contentMarkdown: article.contentMarkdown,
    count,
  });
  const images: ArticleBodyImage[] = [];

  for (const request of requests) {
    const image = await generateFeaturedImageAsset(
      article.id,
      request.prompt,
      input.imageProvider,
      input.falImageModel,
      input.openAiImageModel,
    );

    images.push(
      await prisma.articleBodyImage.create({
        data: {
          articleId: article.id,
          prompt: request.prompt,
          altText: request.altText,
          sectionHeading: request.sectionHeading,
          sortOrder: request.sortOrder,
          publicPath: image.publicPath,
          mimeType: image.mimeType,
          imageModel: image.imageModel,
        },
      }),
    );
  }

  const contentMarkdown = insertArticleBodyImageMarkdown(
    article.contentMarkdown,
    images.map((image) => ({
      altText: image.altText,
      publicPath: image.publicPath,
      sectionHeading: image.sectionHeading,
    })),
  );

  return prisma.article.update({
    where: { id: article.id },
    data: { contentMarkdown },
    include: articleWithBodyImagesInclude(),
  });
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

  if (!isActiveAppCategory(category)) {
    throw new Error("Select one of the active Foundry categories first.");
  }

  return category;
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

function rawCategoryIdsInclude(rawCategoryIds: string, wpCategoryId: number) {
  return parseRawCategoryIds(rawCategoryIds).includes(wpCategoryId);
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

function categoryRootUrl(categorySlug: string) {
  const env = getServerEnv();
  const slug = categorySlug.trim().replace(/^\/+|\/+$/g, "");

  return new URL(`/category/${slug}/`, env.WORDPRESS_URL).toString();
}

async function getInternalLinkCandidates(): Promise<InternalLinkCandidate[]> {
  const [categories, sitePosts] = await Promise.all([
    prisma.category.findMany({
      select: {
        id: true,
        wpCategoryId: true,
      },
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
  const wpCategoryMap = new Map(categories.map((category) => [category.wpCategoryId, category.id]));

  return sitePosts.map((post) => ({
    id: post.id,
    title: post.title,
    slug: post.slug,
    link: post.link,
    excerpt: post.excerpt,
    wpStatus: post.wpStatus,
    categoryName: post.primaryCategory?.name ?? null,
    categoryIds: localCategoryIdsForSitePost(post, wpCategoryMap),
    publishedAt: post.publishedAt,
  }));
}

async function resolveArticleInternalLinks(input: {
  category: ArticleLinkCategory;
  primaryKeyword: string;
  angle: string;
  brief: string;
  generatedLinksText: string;
}) {
  return resolveGeneratedInternalLinks({
    keyword: input.primaryKeyword,
    angle: input.angle,
    brief: input.brief,
    generatedLinksText: input.generatedLinksText,
    categoryId: input.category.id,
    candidates: await getInternalLinkCandidates(),
    categoryFallback: {
      title: input.category.name,
      url: categoryRootUrl(input.category.slug),
    },
  });
}

async function getRecentTitlesForCategory(
  category: CategoryCoverage,
  options: { excludeArticleId?: string } = {},
) {
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
        where: {
          categoryId: category.id,
          ...(options.excludeArticleId
            ? { id: { not: options.excludeArticleId } }
            : {}),
        },
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
        id: true,
        title: true,
        angle: true,
        categoryId: true,
        status: true,
      },
      orderBy: { createdAt: "desc" },
      take: 60,
    }),
    prisma.sitePost.findMany({
      select: {
        id: true,
        title: true,
        wpStatus: true,
        primaryCategoryId: true,
        rawCategoryIds: true,
      },
      orderBy: { publishedAt: "desc" },
      take: 500,
    }),
  ]);

  const sitePostCandidates = sitePosts
    .filter((post) =>
      sitePostBelongsToCategory(post, {
        id: input.categoryId,
        wpCategoryId: input.wpCategoryId,
      }),
    )
    .map((post) => ({
      id: post.id,
      source: "site" as const,
      categoryId: input.categoryId,
      title: post.title,
      angle: post.title,
      status: post.wpStatus,
    }));

  const assessment = assessDuplicateRisk({
    keyword: input.title,
    title: input.title,
    angle: input.angle,
    categoryId: input.categoryId,
    localArticles: existingArticles.map((article) => ({
      id: article.id,
      source: "app" as const,
      categoryId: article.categoryId,
      title: article.title,
      angle: article.angle,
      status: article.status,
    })),
    sitePosts: sitePostCandidates,
  });

  return assessment.matches.map((match) => ({
    source: match.source,
    title: match.title,
    angle: match.angle,
    similarity: match.similarity,
    status: match.status,
    reason: match.reason,
  }));
}

export async function createArticle(request: GenerateArticleRequest) {
  const category = await getPlanningCategory(request.categoryId);
  const textModel = resolveOpenAITextModel(request.textModel);
  const imageProvider = resolveFeaturedImageProvider(request.imageProvider);
  const falImageModel = resolveFalImageModel(request.falImageModel);
  const env = getServerEnv();
  const openAiImageModel = resolveOpenAIImageModel(
    request.openAiImageModel ?? env.OPENAI_IMAGE_MODEL,
  );

  const exactMatches = await findDuplicateCandidates({
    categoryId: category.id,
    wpCategoryId: category.wpCategoryId,
    title: request.primaryKeyword,
    angle: request.angle,
  });

  if (exactMatches.some((match) => match.similarity >= 82)) {
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
    textModel,
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

  if (duplicateMatches.some((match) => match.similarity >= 70)) {
    throw new Error(
      `The generated article still overlaps with existing coverage: ${summarizeDuplicateMatches(
        duplicateMatches,
      )}`,
    );
  }

  const internalLinks = await resolveArticleInternalLinks({
    category,
    primaryKeyword: generated.primaryKeyword,
    angle: generated.angle,
    brief: [request.notes, generated.excerpt].filter(Boolean).join("\n"),
    generatedLinksText: generated.internalLinksText,
  });
  const quality = analyzeArticleQuality({
    title: generated.title,
    primaryKeyword: generated.primaryKeyword,
    contentMarkdown: generated.contentMarkdown,
    metaTitle: generated.metaTitle,
    metaDescription: generated.metaDescription,
    internalLinks,
  });

  let article = await prisma.article.create({
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
      internalLinks,
      featuredImagePrompt: generated.featuredImagePrompt.trim(),
      featuredImageAlt: generated.featuredImageAlt.trim(),
      openAiTextModel: generated.textModel,
      qualityWordCount: quality.wordCount,
      qualityHeadingCount: quality.headingCount,
      qualityMetaTitleLength: quality.metaTitleLength,
      qualityMetaDescriptionLength: quality.metaDescriptionLength,
      qualityInternalLinkCount: quality.internalLinkCount,
      qualityFocusKeyphraseInTitle: quality.focusKeyphraseInTitle,
      qualityFocusKeyphraseInOpening: quality.focusKeyphraseInOpening,
      qualityFocusKeyphraseInMetaDescription: quality.focusKeyphraseInMetaDescription,
      qualityWarnings: JSON.stringify(quality.warnings),
    },
    include: articleWithBodyImagesInclude(),
  });

  if (request.generateImage) {
    try {
      const image = await generateFeaturedImageAsset(
        article.id,
        article.featuredImagePrompt,
        imageProvider,
        falImageModel,
        openAiImageModel,
      );

      article = await prisma.article.update({
        where: { id: article.id },
        data: {
          featuredImagePath: image.publicPath,
          featuredImageMimeType: image.mimeType,
          openAiImageModel: image.imageModel,
        },
        include: articleWithBodyImagesInclude(),
      });
    } catch (error) {
      article = await prisma.article.update({
        where: { id: article.id },
        data: {
          notes: mergeNotes(
            article.notes,
            buildImageGenerationFailureNote({
              imageType: "Featured image",
              provider: imageProvider,
              model: imageProvider === "fal" ? falImageModel : openAiImageModel,
              error,
            }),
          ),
        },
        include: articleWithBodyImagesInclude(),
      });
    }
  }

  if (resolveArticleBodyImageCount(request.bodyImageCount) > 0) {
    try {
      article = await generateBodyImagesForArticle({
        article,
        count: request.bodyImageCount,
        imageProvider,
        falImageModel,
        openAiImageModel,
        replaceExisting: false,
      });
    } catch (error) {
      article = await prisma.article.update({
        where: { id: article.id },
        data: {
          notes: mergeNotes(
            article.notes,
            buildImageGenerationFailureNote({
              imageType: "Article body images",
              provider: imageProvider,
              model: imageProvider === "fal" ? falImageModel : openAiImageModel,
              error,
            }),
          ),
        },
        include: articleWithBodyImagesInclude(),
      });
    }
  }

  return article;
}

export async function generateArticleModelComparison(
  sourceArticleId: string,
  requestedTextModel?: unknown,
) {
  const sourceArticle = await prisma.article.findUnique({
    where: { id: sourceArticleId },
    include: {
      category: true,
    },
  });

  if (!sourceArticle) {
    throw new Error("Article not found.");
  }

  const textModel = requestedTextModel
    ? resolveOpenAITextModel(requestedTextModel)
    : getComparisonTargetOpenAITextModel(sourceArticle.openAiTextModel);

  if (textModel === sourceArticle.openAiTextModel) {
    throw new Error("Choose a different model for the comparison draft.");
  }

  const recentTitles = await getRecentTitlesForCategory(sourceArticle.category, {
    excludeArticleId: sourceArticle.id,
  });
  const generated = await generateArticleDraft({
    categoryName: sourceArticle.category.name,
    categorySlug: sourceArticle.category.slug,
    primaryKeyword: sourceArticle.primaryKeyword,
    angle: sourceArticle.angle,
    notes: sourceArticle.notes ?? undefined,
    recentTitles,
    textModel,
  });
  const internalLinks = await resolveArticleInternalLinks({
    category: sourceArticle.category,
    primaryKeyword: generated.primaryKeyword,
    angle: generated.angle,
    brief: [sourceArticle.notes, generated.excerpt].filter(Boolean).join("\n"),
    generatedLinksText: generated.internalLinksText,
  });
  const quality = analyzeArticleQuality({
    title: generated.title,
    primaryKeyword: generated.primaryKeyword,
    contentMarkdown: generated.contentMarkdown,
    metaTitle: generated.metaTitle,
    metaDescription: generated.metaDescription,
    internalLinks,
  });

  return prisma.articleModelComparison.upsert({
    where: {
      sourceArticleId_openAiTextModel: {
        sourceArticleId: sourceArticle.id,
        openAiTextModel: generated.textModel,
      },
    },
    create: {
      sourceArticleId: sourceArticle.id,
      openAiTextModel: generated.textModel,
      title: generated.title,
      angle: generated.angle,
      primaryKeyword: generated.primaryKeyword,
      slug: slugify(generated.slug || generated.title),
      contentMarkdown: generated.contentMarkdown.trim(),
      metaTitle: generated.metaTitle.trim(),
      metaDescription: generated.metaDescription.trim(),
      excerpt: generated.excerpt.trim(),
      tags: generated.tagsText,
      internalLinks,
      featuredImagePrompt: generated.featuredImagePrompt.trim(),
      featuredImageAlt: generated.featuredImageAlt.trim(),
      qualityWordCount: quality.wordCount,
      qualityHeadingCount: quality.headingCount,
      qualityMetaTitleLength: quality.metaTitleLength,
      qualityMetaDescriptionLength: quality.metaDescriptionLength,
      qualityInternalLinkCount: quality.internalLinkCount,
      qualityFocusKeyphraseInTitle: quality.focusKeyphraseInTitle,
      qualityFocusKeyphraseInOpening: quality.focusKeyphraseInOpening,
      qualityFocusKeyphraseInMetaDescription: quality.focusKeyphraseInMetaDescription,
      qualityWarnings: JSON.stringify(quality.warnings),
    },
    update: {
      title: generated.title,
      angle: generated.angle,
      primaryKeyword: generated.primaryKeyword,
      slug: slugify(generated.slug || generated.title),
      contentMarkdown: generated.contentMarkdown.trim(),
      metaTitle: generated.metaTitle.trim(),
      metaDescription: generated.metaDescription.trim(),
      excerpt: generated.excerpt.trim(),
      tags: generated.tagsText,
      internalLinks,
      featuredImagePrompt: generated.featuredImagePrompt.trim(),
      featuredImageAlt: generated.featuredImageAlt.trim(),
      qualityWordCount: quality.wordCount,
      qualityHeadingCount: quality.headingCount,
      qualityMetaTitleLength: quality.metaTitleLength,
      qualityMetaDescriptionLength: quality.metaDescriptionLength,
      qualityInternalLinkCount: quality.internalLinkCount,
      qualityFocusKeyphraseInTitle: quality.focusKeyphraseInTitle,
      qualityFocusKeyphraseInOpening: quality.focusKeyphraseInOpening,
      qualityFocusKeyphraseInMetaDescription: quality.focusKeyphraseInMetaDescription,
      qualityWarnings: JSON.stringify(quality.warnings),
    },
  });
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
  const metaTitle = readString(formData, "metaTitle");
  const metaDescription = readString(formData, "metaDescription");
  const excerpt = readString(formData, "excerpt");
  const featuredImagePrompt = readString(formData, "featuredImagePrompt");
  const featuredImageAlt = readString(formData, "featuredImageAlt");
  const contentMarkdown = readString(formData, "contentMarkdown");
  const schedule = readOptionalSchedule(formData, "scheduledFor");
  const quality = analyzeArticleQuality({
    title,
    primaryKeyword,
    contentMarkdown,
    metaTitle,
    metaDescription,
    internalLinks,
  });

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
      metaTitle,
      metaDescription,
      excerpt,
      tags,
      internalLinks,
      featuredImagePrompt,
      featuredImageAlt,
      contentMarkdown,
      scheduledFor: schedule.date,
      scheduledForLocal: schedule.localValue,
      status: ArticleStatus.READY_FOR_REVIEW,
      qualityWordCount: quality.wordCount,
      qualityHeadingCount: quality.headingCount,
      qualityMetaTitleLength: quality.metaTitleLength,
      qualityMetaDescriptionLength: quality.metaDescriptionLength,
      qualityInternalLinkCount: quality.internalLinkCount,
      qualityFocusKeyphraseInTitle: quality.focusKeyphraseInTitle,
      qualityFocusKeyphraseInOpening: quality.focusKeyphraseInOpening,
      qualityFocusKeyphraseInMetaDescription: quality.focusKeyphraseInMetaDescription,
      qualityWarnings: JSON.stringify(quality.warnings),
    },
    include: articleWithBodyImagesInclude(),
  });
}

export async function regenerateFeaturedImage(articleId: string, formData: FormData) {
  const article = await saveArticleReview(articleId, formData);
  const image = await generateFeaturedImageAsset(
    article.id,
    article.featuredImagePrompt,
    formData.get("imageProvider"),
    formData.get("falImageModel"),
    formData.get("openAiImageModel"),
  );

  const updated = await prisma.article.update({
    where: { id: article.id },
    data: {
      featuredImagePath: image.publicPath,
      featuredImageMimeType: image.mimeType,
      openAiImageModel: image.imageModel,
      wpMediaId: null,
    },
    include: articleWithBodyImagesInclude(),
  });

  if (article.featuredImagePath && article.featuredImagePath !== image.publicPath) {
    await deleteGeneratedImageAsset(article.featuredImagePath);
  }

  return updated;
}

export async function regenerateArticleBodyImages(articleId: string, formData: FormData) {
  const article = await saveArticleReview(articleId, formData);

  return generateBodyImagesForArticle({
    article,
    count: formData.get("bodyImageCount"),
    imageProvider: resolveFeaturedImageProvider(
      formData.get("bodyImageProvider") ?? formData.get("imageProvider"),
    ),
    falImageModel: formData.get("bodyImageFalModel") ?? formData.get("falImageModel"),
    openAiImageModel: formData.get("bodyOpenAiImageModel") ?? formData.get("openAiImageModel"),
    replaceExisting: true,
  });
}

export async function publishArticle(
  articleId: string,
  formData: FormData,
  mode: WordPressPublishMode,
) {
  const previousArticle = await prisma.article.findUnique({
    where: { id: articleId },
    select: {
      status: true,
      wpStatus: true,
      wpPostId: true,
    },
  });
  const article = await saveArticleReview(articleId, formData);
  let schedule: { localDateTime: string; utcDateTime: Date } | null = null;

  if (mode === "future") {
    ensureFutureSchedule(article);
    schedule = {
      localDateTime: article.scheduledForLocal,
      utcDateTime: article.scheduledFor,
    };
  }

  const publishAt = getForcedPublishTimestamp(mode, previousArticle);
  const payload = await pushArticleToWordPress(article, mode, schedule, { publishAt });
  const notes = payload.yoastMetaApplied
    ? article.notes
    : mergeNotes(
        article.notes,
        "Yoast SEO REST bridge not detected on WordPress. Install the companion plugin from this repo to sync focus keyphrase, SEO title, and meta description automatically.",
      );

  const status = resolveArticleStatusFromWordPress(mode, payload.status);

  return prisma.article.update({
    where: { id: article.id },
    data: {
      wpPostId: payload.id,
      wpStatus: payload.status,
      status,
      notes,
      publishedAt: status === ArticleStatus.PUBLISHED ? new Date() : article.publishedAt,
    },
    include: {
      category: true,
      bodyImages: {
        orderBy: { sortOrder: "asc" },
      },
    },
  });
}

export async function scheduleArticleRandomly(articleId: string, formData: FormData) {
  const article = await prisma.article.findUnique({
    where: { id: articleId },
    select: {
      wpPostId: true,
    },
  });

  if (!article) {
    throw new Error("Article not found.");
  }

  const scheduledPosts = await fetchScheduledWordPressPostTimes({
    excludeWpPostId: article.wpPostId,
  });
  const scheduledFor = pickRandomWordPressScheduleSlot({
    scheduledTimes: scheduledPosts.map((post) => post.date),
  });

  formData.set("scheduledFor", formatDateTimeLocal(scheduledFor));

  return publishArticle(articleId, formData, "future");
}

export async function getArticleById(articleId: string) {
  return prisma.article.findUnique({
    where: { id: articleId },
    include: {
      category: true,
      contentOpportunities: {
        orderBy: { updatedAt: "desc" },
        take: 1,
      },
      modelComparisons: {
        orderBy: { updatedAt: "desc" },
      },
      bodyImages: {
        orderBy: { sortOrder: "asc" },
      },
    },
  });
}

export async function getArticleComparisonData(articleId: string) {
  const article = await prisma.article.findUnique({
    where: { id: articleId },
    include: {
      category: true,
      modelComparisons: {
        orderBy: { updatedAt: "desc" },
      },
    },
  });

  if (!article) {
    return null;
  }

  const comparisonModels = getComparisonCandidateOpenAITextModels(article.openAiTextModel);
  const targetModel = getComparisonTargetOpenAITextModel(article.openAiTextModel);

  return {
    article,
    comparisonModels,
    targetModel,
    targetComparison:
      article.modelComparisons.find(
        (comparison) => comparison.openAiTextModel === targetModel,
      ) ?? null,
  };
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
    allCategories.filter(isActiveAppCategory),
  );

  return {
    categories,
    articles,
    sitePostCount,
    articleCount,
  };
}
