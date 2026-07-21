import { prisma } from "@/lib/db";
import { analyzeArticleQuality } from "@/lib/intelligence/article-quality";
import {
  appendArticleLinkReference,
  createArticleLinkSuggestions,
  insertArticleLinkSuggestion,
  type ArticleLinkTarget,
} from "@/lib/intelligence/article-link-insertion";
import { parseWordPressCategoryIds, serializeStringArray } from "@/lib/serialized-values";

function isPublishedStatus(value: string | null) {
  const status = value?.trim().toLowerCase();
  return status === "publish" || status === "published";
}

function assertTargetKey(targetKey: string) {
  if (!/^(site-post|local-article):[a-z0-9]+$/i.test(targetKey)) {
    throw new Error("Choose a valid internal-link target.");
  }
}

async function getArticleLinkTargets(excludeArticleId: string): Promise<ArticleLinkTarget[]> {
  const [categories, sitePosts, localArticles] = await Promise.all([
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
          select: { name: true },
        },
      },
      orderBy: { publishedAt: "desc" },
      take: 500,
    }),
    prisma.article.findMany({
      where: {
        id: { not: excludeArticleId },
      },
      select: {
        id: true,
        title: true,
        slug: true,
        excerpt: true,
        status: true,
        wpStatus: true,
        publishedAt: true,
        categoryId: true,
        category: {
          select: { name: true },
        },
      },
      orderBy: { updatedAt: "desc" },
      take: 250,
    }),
  ]);
  const categoryIdsByWordPressId = new Map(
    categories.map((category) => [category.wpCategoryId, category.id]),
  );

  const sitePostTargets = sitePosts.map((post) => {
    const categoryIds = new Set<number>();

    if (post.primaryCategoryId) {
      categoryIds.add(post.primaryCategoryId);
    }

    for (const wordPressCategoryId of parseWordPressCategoryIds(post.rawCategoryIds)) {
      const categoryId = categoryIdsByWordPressId.get(wordPressCategoryId);

      if (categoryId) {
        categoryIds.add(categoryId);
      }
    }

    return {
      id: `site-post:${post.id}`,
      targetKey: `site-post:${post.id}`,
      targetType: "SITE_POST" as const,
      title: post.title,
      slug: post.slug,
      link: post.link,
      excerpt: post.excerpt,
      wpStatus: post.wpStatus,
      categoryName: post.primaryCategory?.name ?? null,
      categoryIds: Array.from(categoryIds),
      publishedAt: post.publishedAt,
      isPublished: isPublishedStatus(post.wpStatus),
    } satisfies ArticleLinkTarget;
  });
  const localArticleTargets = localArticles.map((article) => {
    const isPublished = isPublishedStatus(article.wpStatus) || article.status === "PUBLISHED";

    return {
      id: `local-article:${article.id}`,
      targetKey: `local-article:${article.id}`,
      targetType: "LOCAL_ARTICLE" as const,
      title: article.title,
      slug: article.slug,
      link: null,
      excerpt: article.excerpt,
      wpStatus: isPublished ? "publish" : article.status === "SCHEDULED" ? "future" : "draft",
      categoryName: article.category.name,
      categoryIds: [article.categoryId],
      publishedAt: article.publishedAt,
      isPublished,
    } satisfies ArticleLinkTarget;
  });

  return [...sitePostTargets, ...localArticleTargets];
}

async function getArticleWithLinkContext(articleId: string) {
  return prisma.article.findUnique({
    where: { id: articleId },
    include: {
      category: {
        select: { slug: true },
      },
    },
  });
}

function buildSuggestions(
  article: NonNullable<Awaited<ReturnType<typeof getArticleWithLinkContext>>>,
  targets: ArticleLinkTarget[],
) {
  return createArticleLinkSuggestions({
    contentMarkdown: article.contentMarkdown,
    primaryKeyword: article.primaryKeyword,
    angle: article.angle,
    categoryId: article.categoryId,
    targets,
  });
}

export async function getArticleInternalLinkSuggestions(articleId: string) {
  const article = await getArticleWithLinkContext(articleId);

  if (!article) {
    return null;
  }

  return buildSuggestions(article, await getArticleLinkTargets(article.id));
}

export async function insertArticleInternalLink(articleId: string, targetKey: string) {
  assertTargetKey(targetKey);
  const article = await getArticleWithLinkContext(articleId);

  if (!article) {
    throw new Error("Article not found.");
  }

  const suggestion = buildSuggestions(article, await getArticleLinkTargets(article.id)).find(
    (candidate) => candidate.targetKey === targetKey,
  );

  if (!suggestion) {
    throw new Error("This internal-link suggestion is no longer available.");
  }

  if (suggestion.alreadyLinked) {
    throw new Error("This internal-link target is already present in the saved article.");
  }

  const contentMarkdown = insertArticleLinkSuggestion(article.contentMarkdown, suggestion);
  const internalLinks = appendArticleLinkReference(article.internalLinks, suggestion);
  const quality = analyzeArticleQuality({
    title: article.title,
    primaryKeyword: article.primaryKeyword,
    contentMarkdown,
    metaTitle: article.metaTitle,
    metaDescription: article.metaDescription,
    internalLinks,
    categorySlug: article.category.slug,
  });

  return prisma.article.update({
    where: { id: article.id },
    data: {
      contentMarkdown,
      internalLinks,
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
