import {
  type Article,
  type ArticleBodyImage,
  ArticleStatus,
  type Category,
  type Prisma,
} from "@prisma/client";
import { randomUUID } from "node:crypto";

import {
  buildArticleBodyImageRequests,
  insertArticleBodyImageMarkdown,
  removeArticleBodyImageMarkdown,
  resolveArticleBodyImageCount,
} from "@/lib/article-body-images";
import { isActiveAppCategory, sortCategoriesForApp } from "@/lib/category-config";
import { prisma } from "@/lib/db";
import { getServerEnv } from "@/lib/env";
import { AppError, toAppError } from "@/lib/errors/app-error";
import {
  deleteGeneratedImageAsset,
  discardStagedGeneratedImages,
  generateStagedFeaturedImageAsset,
  promoteStagedGeneratedImage,
  type GeneratedImageAsset,
  type StagedGeneratedImageAsset,
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
  resolveVerifiedInternalLinks,
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
  claimPublishAttempt,
  completePublishAttempt,
  failPublishAttempt,
  getLatestPublishAttempt,
  recordPublishAttemptCheckpoint,
} from "@/lib/publishing/publish-attempts";
import {
  formatDateTimeLocal,
  pickRandomWordPressScheduleSlot,
} from "@/lib/random-schedule";
import { formatDateTimeInWordPressTimeZone } from "@/lib/wordpress-timezone";
import {
  parseWordPressCategoryIds,
  serializeStringArray,
} from "@/lib/serialized-values";
import { articleReviewFormSchema, parseFormData } from "@/lib/validation/schemas";

export type GenerateArticleRequest = {
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
  generationTelemetry?: {
    articleId?: string;
    opportunityId?: string;
  };
};

export type PreparedArticleDraft = {
  data: Prisma.ArticleUncheckedCreateInput;
  generateImage: boolean;
  imageProvider: FeaturedImageProvider;
  falImageModel: FalImageModel;
  openAiImageModel: OpenAIImageModel;
  bodyImageCount: number;
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

type ImageRecoveryReason = "failed" | "missing" | "ready";

function imageRecoveryReason(input: {
  notes?: string | null;
  hasImage: boolean;
  failureNeedle: string;
  state?: string | null;
}): ImageRecoveryReason {
  if (input.state === "FAILED" || input.state === "CLEANUP_WARNING") {
    return "failed";
  }

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
  featuredImageState?: string | null;
  bodyImagesState?: string | null;
}) {
  const featuredReason = imageRecoveryReason({
    notes: input.notes,
    hasImage: Boolean(input.featuredImagePath),
    failureNeedle: "Featured image not generated:",
    state: input.featuredImageState,
  });
  const bodyReason = imageRecoveryReason({
    notes: input.notes,
    hasImage: input.bodyImageCount > 0,
    failureNeedle: "Article body images not generated:",
    state: input.bodyImagesState,
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

export function getArticleImageAltWarnings(input: {
  featuredImageAlt: string;
  bodyImageAlts: string[];
}) {
  const values = [input.featuredImageAlt, ...input.bodyImageAlts].map((value) => value.trim());
  const warnings: string[] = [];

  if (values.some((value) => !value)) {
    warnings.push("Every generated image needs concise descriptive alt text.");
  }

  const nonEmptyValues = values.filter(Boolean).map((value) => value.toLowerCase());

  if (new Set(nonEmptyValues).size !== nonEmptyValues.length) {
    warnings.push("Some image alt text is repeated. Give each visual its own description.");
  }

  return warnings;
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

async function cleanupGeneratedImagePaths(paths: string[]) {
  let cleanupError: unknown = null;

  for (const publicPath of paths) {
    try {
      await deleteGeneratedImageAsset(publicPath);
    } catch (error) {
      cleanupError ??= error;
    }
  }

  return cleanupError;
}

async function recordFeaturedImageFailure(articleId: string, error: unknown) {
  await prisma.article.update({
    where: { id: articleId },
    data: {
      featuredImageState: "FAILED",
      featuredImageErrorCode: toAppError(error).code,
      featuredImageLastAttemptAt: new Date(),
    },
  });
}

async function recordBodyImageFailure(articleId: string, error: unknown) {
  await prisma.article.update({
    where: { id: articleId },
    data: {
      bodyImagesState: "FAILED",
      bodyImagesErrorCode: toAppError(error).code,
      bodyImagesLastAttemptAt: new Date(),
    },
  });
}

async function replaceFeaturedImageForArticle(input: {
  article: ArticleWithCategoryAndBodyImages;
  provider: FeaturedImageProvider;
  falImageModel?: unknown;
  openAiImageModel?: unknown;
}) {
  const operationKey = randomUUID();
  let staged: StagedGeneratedImageAsset | null = null;
  let promoted: GeneratedImageAsset | null = null;

  await prisma.article.update({
    where: { id: input.article.id },
    data: {
      featuredImageState: "GENERATING",
      featuredImageErrorCode: null,
      featuredImageLastAttemptAt: new Date(),
    },
  });

  try {
    staged = await generateStagedFeaturedImageAsset(
      input.article.id,
      input.article.featuredImagePrompt,
      operationKey,
      input.provider,
      input.falImageModel,
      input.openAiImageModel,
    );
    const finalizedImage = await promoteStagedGeneratedImage(staged);
    promoted = finalizedImage;
    const updated = await prisma.$transaction(async (transaction) =>
      transaction.article.update({
        where: { id: input.article.id },
        data: {
          featuredImagePath: finalizedImage.publicPath,
          featuredImageMimeType: finalizedImage.mimeType,
          featuredImageState: "SUCCEEDED",
          featuredImageErrorCode: null,
          featuredImageLastAttemptAt: new Date(),
          openAiImageModel: finalizedImage.imageModel,
          wpMediaId: null,
        },
        include: articleWithBodyImagesInclude(),
      }),
    );
    const cleanupError =
      input.article.featuredImagePath && input.article.featuredImagePath !== finalizedImage.publicPath
        ? await cleanupGeneratedImagePaths([input.article.featuredImagePath])
        : null;

    if (cleanupError) {
      return prisma.article.update({
        where: { id: input.article.id },
        data: {
          featuredImageState: "CLEANUP_WARNING",
          featuredImageErrorCode: toAppError(cleanupError).code,
        },
        include: articleWithBodyImagesInclude(),
      });
    }

    return updated;
  } catch (error) {
    if (promoted) {
      await cleanupGeneratedImagePaths([promoted.publicPath]);
    }

    if (staged) {
      try {
        await discardStagedGeneratedImages([staged]);
      } catch {
        // The database still records the provider/filesystem failure for recovery.
      }
    }

    await recordFeaturedImageFailure(input.article.id, error);
    throw error;
  }
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
  const operationKey = randomUUID();
  const oldImages = input.replaceExisting ? input.article.bodyImages : [];
  const baseMarkdown = input.replaceExisting
    ? removeArticleBodyImageMarkdown(input.article.contentMarkdown, oldImages)
    : input.article.contentMarkdown;
  const stagedImages: Array<StagedGeneratedImageAsset & {
    assetKey: string;
    altText: string;
    prompt: string;
    sectionHeading: string;
    sortOrder: number;
  }> = [];
  const promotedImages: Array<GeneratedImageAsset & {
    assetKey: string;
    altText: string;
    prompt: string;
    sectionHeading: string;
    sortOrder: number;
  }> = [];

  await prisma.article.update({
    where: { id: input.article.id },
    data: {
      bodyImagesState: "GENERATING",
      bodyImagesErrorCode: null,
      bodyImagesLastAttemptAt: new Date(),
      bodyImagesOperationKey: operationKey,
    },
  });

  if (count === 0) {
    const updated = await prisma.$transaction(async (transaction) => {
      if (oldImages.length > 0) {
        await transaction.articleBodyImage.deleteMany({
          where: { id: { in: oldImages.map((image) => image.id) } },
        });
      }

      return transaction.article.update({
        where: { id: input.article.id },
        data: {
          contentMarkdown: baseMarkdown,
          bodyImagesState: "SUCCEEDED",
          bodyImagesErrorCode: null,
          bodyImagesLastAttemptAt: new Date(),
        },
        include: articleWithBodyImagesInclude(),
      });
    });
    const cleanupError = await cleanupGeneratedImagePaths(oldImages.map((image) => image.publicPath));

    if (cleanupError) {
      return prisma.article.update({
        where: { id: input.article.id },
        data: {
          bodyImagesState: "CLEANUP_WARNING",
          bodyImagesErrorCode: toAppError(cleanupError).code,
        },
        include: articleWithBodyImagesInclude(),
      });
    }

    return updated;
  }

  const requests = buildArticleBodyImageRequests({
    title: input.article.title,
    angle: input.article.angle,
    primaryKeyword: input.article.primaryKeyword,
    contentMarkdown: baseMarkdown,
    count,
  });

  try {
    for (const request of requests) {
      const staged = await generateStagedFeaturedImageAsset(
        input.article.id,
        request.prompt,
        operationKey,
        input.imageProvider,
        input.falImageModel,
        input.openAiImageModel,
      );
      stagedImages.push({ ...staged, ...request, assetKey: randomUUID() });
    }

    for (const staged of stagedImages) {
      const promoted = await promoteStagedGeneratedImage(staged);
      promotedImages.push({ ...promoted, ...staged });
    }

    const contentMarkdown = insertArticleBodyImageMarkdown(
      baseMarkdown,
      promotedImages.map((image) => ({
        assetKey: image.assetKey,
        altText: image.altText,
        publicPath: image.publicPath,
        sectionHeading: image.sectionHeading,
      })),
    );
    const updated = await prisma.$transaction(async (transaction) => {
      if (oldImages.length > 0) {
        await transaction.articleBodyImage.deleteMany({
          where: { id: { in: oldImages.map((image) => image.id) } },
        });
      }
      await transaction.articleBodyImage.createMany({
        data: promotedImages.map((image) => ({
          articleId: input.article.id,
          assetKey: image.assetKey,
          prompt: image.prompt,
          altText: image.altText,
          sectionHeading: image.sectionHeading,
          sortOrder: image.sortOrder,
          publicPath: image.publicPath,
          mimeType: image.mimeType,
          imageModel: image.imageModel,
        })),
      });

      return transaction.article.update({
        where: { id: input.article.id },
        data: {
          contentMarkdown,
          bodyImagesState: "SUCCEEDED",
          bodyImagesErrorCode: null,
          bodyImagesLastAttemptAt: new Date(),
        },
        include: articleWithBodyImagesInclude(),
      });
    });
    const cleanupError = await cleanupGeneratedImagePaths(oldImages.map((image) => image.publicPath));

    if (cleanupError) {
      return prisma.article.update({
        where: { id: input.article.id },
        data: {
          bodyImagesState: "CLEANUP_WARNING",
          bodyImagesErrorCode: toAppError(cleanupError).code,
        },
        include: articleWithBodyImagesInclude(),
      });
    }

    return updated;
  } catch (error) {
    await cleanupGeneratedImagePaths(promotedImages.map((image) => image.publicPath));
    try {
      await discardStagedGeneratedImages(stagedImages);
    } catch {
      // The operation failure remains the actionable error even if staging cleanup also fails.
    }
    await recordBodyImageFailure(input.article.id, error);
    throw error;
  }
}

async function ensureLiveHistory() {
  const [categoryCount, sitePostCount, lastSuccessfulFullSync] = await Promise.all([
    prisma.category.count(),
    prisma.sitePost.count(),
    prisma.wordPressSyncRun.findFirst({
      where: {
        mode: "FULL_PRIVATE",
        state: "SUCCEEDED",
      },
      orderBy: { completedAt: "desc" },
      select: { completedAt: true },
    }),
  ]);
  const staleAfterMs = getServerEnv().WORDPRESS_SYNC_STALE_HOURS * 60 * 60 * 1000;
  const hasFreshFullSync =
    lastSuccessfulFullSync?.completedAt &&
    Date.now() - lastSuccessfulFullSync.completedAt.getTime() < staleAfterMs;

  if (categoryCount === 0 || sitePostCount === 0 || !hasFreshFullSync) {
    await syncWordPressCatalog({ mode: "FULL_PRIVATE" });
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

function rawCategoryIdsInclude(rawCategoryIds: string, wpCategoryId: number) {
  return parseWordPressCategoryIds(rawCategoryIds).includes(wpCategoryId);
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

  for (const wpCategoryId of parseWordPressCategoryIds(post.rawCategoryIds)) {
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
}) {
  return resolveVerifiedInternalLinks({
    keyword: input.primaryKeyword,
    angle: input.angle,
    brief: input.brief,
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

export async function prepareArticleDraft(
  request: GenerateArticleRequest,
): Promise<PreparedArticleDraft> {
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
    telemetry: request.generationTelemetry,
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
  });
  const quality = analyzeArticleQuality({
    title: generated.title,
    primaryKeyword: generated.primaryKeyword,
    contentMarkdown: generated.contentMarkdown,
    metaTitle: generated.metaTitle,
    metaDescription: generated.metaDescription,
    internalLinks,
    categorySlug: category.slug,
  });

  return {
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
      qualityWarnings: serializeStringArray(quality.warnings),
    },
    generateImage: request.generateImage,
    imageProvider,
    falImageModel,
    openAiImageModel,
    bodyImageCount: resolveArticleBodyImageCount(request.bodyImageCount),
  };
}

export async function createArticleRecordFromPreparedDraft(
  transaction: Prisma.TransactionClient,
  prepared: PreparedArticleDraft,
): Promise<ArticleWithCategoryAndBodyImages> {
  return transaction.article.create({
    data: prepared.data,
    include: articleWithBodyImagesInclude(),
  });
}

export async function finishPreparedArticleDraft(
  article: ArticleWithCategoryAndBodyImages,
  prepared: PreparedArticleDraft,
) {
  let completedArticle = article;

  if (prepared.generateImage) {
    try {
      completedArticle = await replaceFeaturedImageForArticle({
        article: completedArticle,
        provider: prepared.imageProvider,
        falImageModel: prepared.falImageModel,
        openAiImageModel: prepared.openAiImageModel,
      });
    } catch {
      // The structured failure state is already persisted for the review screen.
    }
  }

  if (prepared.bodyImageCount > 0) {
    try {
      completedArticle = await generateBodyImagesForArticle({
        article: completedArticle,
        count: prepared.bodyImageCount,
        imageProvider: prepared.imageProvider,
        falImageModel: prepared.falImageModel,
        openAiImageModel: prepared.openAiImageModel,
        replaceExisting: false,
      });
    } catch {
      // The structured failure state is already persisted for the review screen.
    }
  }

  return completedArticle;
}

export async function createArticle(request: GenerateArticleRequest) {
  const prepared = await prepareArticleDraft(request);
  const article = await prisma.article.create({
    data: prepared.data,
    include: articleWithBodyImagesInclude(),
  });

  return finishPreparedArticleDraft(article, prepared);
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
    telemetry: { articleId: sourceArticle.id },
  });
  const internalLinks = await resolveArticleInternalLinks({
    category: sourceArticle.category,
    primaryKeyword: generated.primaryKeyword,
    angle: generated.angle,
    brief: [sourceArticle.notes, generated.excerpt].filter(Boolean).join("\n"),
  });
  const quality = analyzeArticleQuality({
    title: generated.title,
    primaryKeyword: generated.primaryKeyword,
    contentMarkdown: generated.contentMarkdown,
    metaTitle: generated.metaTitle,
    metaDescription: generated.metaDescription,
    internalLinks,
    categorySlug: sourceArticle.category.slug,
  });

  return prisma.articleModelComparison.create({
    data: {
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
      qualityWarnings: serializeStringArray(quality.warnings),
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

function readOptionalSchedule(value: string) {
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

async function getLatestWordPressSiteTimezone() {
  const syncRun = await prisma.wordPressSyncRun.findFirst({
    where: {
      mode: "FULL_PRIVATE",
      state: "SUCCEEDED",
      siteTimezone: { not: null },
    },
    orderBy: { completedAt: "desc" },
    select: { siteTimezone: true },
  });

  return syncRun?.siteTimezone ?? null;
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
  const input = parseFormData(articleReviewFormSchema, formData);
  const { categoryId, title, angle, primaryKeyword, notes, metaTitle, metaDescription, excerpt } = input;
  const slug = slugify(input.slug || title);
  const tags = splitListInput(input.tags).join(", ");
  const internalLinks = splitListInput(input.internalLinks).join("\n");
  const featuredImagePrompt = input.featuredImagePrompt;
  const featuredImageAlt = input.featuredImageAlt;
  const contentMarkdown = input.contentMarkdown;
  const schedule = readOptionalSchedule(input.scheduledFor);
  const wordPressTimezone = schedule.date ? await getLatestWordPressSiteTimezone() : null;
  const wordPressScheduleTarget = schedule.date
    ? formatDateTimeInWordPressTimeZone(schedule.date, wordPressTimezone) ?? schedule.localValue
    : null;
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
      scheduledForLocal: wordPressScheduleTarget,
      scheduledForTimezone: schedule.date ? wordPressTimezone : null,
      status: ArticleStatus.READY_FOR_REVIEW,
      qualityWordCount: quality.wordCount,
      qualityHeadingCount: quality.headingCount,
      qualityMetaTitleLength: quality.metaTitleLength,
      qualityMetaDescriptionLength: quality.metaDescriptionLength,
      qualityInternalLinkCount: quality.internalLinkCount,
      qualityFocusKeyphraseInTitle: quality.focusKeyphraseInTitle,
      qualityFocusKeyphraseInOpening: quality.focusKeyphraseInOpening,
      qualityFocusKeyphraseInMetaDescription: quality.focusKeyphraseInMetaDescription,
      qualityWarnings: serializeStringArray(quality.warnings),
    },
    include: articleWithBodyImagesInclude(),
  });
}

export async function regenerateFeaturedImage(articleId: string, formData: FormData) {
  const input = parseFormData(articleReviewFormSchema, formData);
  const article = await saveArticleReview(articleId, formData);
  return replaceFeaturedImageForArticle({
    article,
    provider: resolveFeaturedImageProvider(input.imageProvider),
    falImageModel: input.falImageModel,
    openAiImageModel: input.openAiImageModel,
  });
}

export async function regenerateArticleBodyImages(articleId: string, formData: FormData) {
  const input = parseFormData(articleReviewFormSchema, formData);
  const article = await saveArticleReview(articleId, formData);

  return generateBodyImagesForArticle({
    article,
    count: input.bodyImageCount,
    imageProvider: resolveFeaturedImageProvider(input.bodyImageProvider ?? input.imageProvider),
    falImageModel: input.bodyImageFalModel ?? input.falImageModel,
    openAiImageModel: input.bodyOpenAiImageModel ?? input.openAiImageModel,
    replaceExisting: true,
  });
}

async function publishSavedArticle(
  article: ArticleWithCategory & { bodyImages: ArticleBodyImage[] },
  mode: WordPressPublishMode,
  previousArticle: {
    status: ArticleStatus;
    wpStatus: string | null;
    wpPostId: number | null;
  } | null,
  options: { allowInProgressRecovery?: boolean } = {},
) {
  let schedule: { localDateTime: string; utcDateTime: Date } | null = null;

  if (mode === "future") {
    ensureFutureSchedule(article);
    schedule = {
      localDateTime: article.scheduledForLocal,
      utcDateTime: article.scheduledFor,
    };
  }

  const publishAt = getForcedPublishTimestamp(mode, previousArticle);
  const attempt = await claimPublishAttempt({
    articleId: article.id,
    desiredWpStatus: mode,
    allowInProgressRecovery: options.allowInProgressRecovery,
  });

  try {
    const payload = await pushArticleToWordPress(article, mode, schedule, {
      publishAt,
      operationKey: attempt.operationKey,
      allowPlaceholderCreation: !attempt.preventPlaceholderCreation,
      progress: {
        onPostIdentified: async (post) => {
          await recordPublishAttemptCheckpoint({
            articleId: article.id,
            operationKey: attempt.operationKey,
            checkpoint: "POST_IDENTIFIED",
            wpPostId: post.id,
          });
        },
        onMediaComplete: async (post) => {
          await recordPublishAttemptCheckpoint({
            articleId: article.id,
            operationKey: attempt.operationKey,
            checkpoint: "MEDIA_COMPLETE",
            wpPostId: post.id,
          });
        },
        onContentComplete: async (post) => {
          await recordPublishAttemptCheckpoint({
            articleId: article.id,
            operationKey: attempt.operationKey,
            checkpoint: "CONTENT_COMPLETE",
            wpPostId: post.id,
          });
        },
      },
    });
    const notes = payload.yoastMetaApplied
      ? article.notes
      : mergeNotes(
          article.notes,
          "Yoast SEO REST bridge not detected on WordPress. Install the companion plugin from this repo to sync focus keyphrase, SEO title, and meta description automatically.",
        );
    const status = resolveArticleStatusFromWordPress(mode, payload.status);

    return completePublishAttempt({
      articleId: article.id,
      operationKey: attempt.operationKey,
      wpPostId: payload.id,
      wpStatus: payload.status,
      articleStatus: status,
      publishedAt: status === ArticleStatus.PUBLISHED ? new Date() : article.publishedAt,
      notes,
      warningCode: payload.yoastMetaApplied ? null : "WP_YOAST_NOT_APPLIED",
    });
  } catch (error) {
    throw await failPublishAttempt({
      articleId: article.id,
      operationKey: attempt.operationKey,
      error,
    });
  }
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

  return publishSavedArticle(article, mode, previousArticle);
}

export async function reconcileArticlePublish(articleId: string) {
  const latestAttempt = await getLatestPublishAttempt(articleId);

  if (!latestAttempt) {
    throw new AppError("PUBLISH_STATE_CONFLICT");
  }

  if (!["draft", "publish", "future"].includes(latestAttempt.desiredWpStatus)) {
    throw new AppError("PUBLISH_STATE_CONFLICT");
  }

  const article = await prisma.article.findUnique({
    where: { id: articleId },
    include: articleWithBodyImagesInclude(),
  });

  if (!article) {
    throw new AppError("OPERATION_FAILED");
  }

  const recoverableState = ["FAILED", "UNCERTAIN"].includes(latestAttempt.state);
  const interruptedInProgressOperation = article.publishState === "IN_PROGRESS";

  if (!recoverableState && !interruptedInProgressOperation) {
    throw new AppError("PUBLISH_STATE_CONFLICT");
  }

  return publishSavedArticle(
    article,
    latestAttempt.desiredWpStatus as WordPressPublishMode,
    {
      status: article.status,
      wpStatus: article.wpStatus,
      wpPostId: article.wpPostId,
    },
    { allowInProgressRecovery: interruptedInProgressOperation },
  );
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
      publishAttempts: {
        orderBy: { updatedAt: "desc" },
        take: 1,
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
  const [
    allCategories,
    articles,
    sitePostCount,
    articleCount,
    latestSyncRun,
    lastPrivateSync,
    lastSuccessfulFullSync,
    lastPublicOnlySync,
    lastFailedSync,
    stalePostCount,
    staleCategoryCount,
  ] = await Promise.all([
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
    prisma.wordPressSyncRun.findFirst({
      orderBy: { startedAt: "desc" },
    }),
    prisma.wordPressSyncRun.findFirst({
      where: { mode: "FULL_PRIVATE" },
      orderBy: { startedAt: "desc" },
    }),
    prisma.wordPressSyncRun.findFirst({
      where: {
        mode: "FULL_PRIVATE",
        state: "SUCCEEDED",
      },
      orderBy: { completedAt: "desc" },
    }),
    prisma.wordPressSyncRun.findFirst({
      where: { mode: "PUBLIC_ONLY" },
      orderBy: { completedAt: "desc" },
    }),
    prisma.wordPressSyncRun.findFirst({
      where: { state: "FAILED" },
      orderBy: { completedAt: "desc" },
    }),
    prisma.sitePost.count({ where: { isStale: true } }),
    prisma.category.count({ where: { isStale: true } }),
  ]);

  const categories = sortCategoriesForApp(
    allCategories.filter(isActiveAppCategory),
  );

  return {
    categories,
    articles,
    sitePostCount,
    articleCount,
    syncHealth: {
      latestRun: latestSyncRun,
      lastPrivateSync,
      lastSuccessfulFullSync,
      lastPublicOnlySync,
      lastFailedSync,
      stalePostCount,
      staleCategoryCount,
    },
  };
}
