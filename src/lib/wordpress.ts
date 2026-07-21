import {
  type Article,
  type ArticleBodyImage,
  type Category,
  type Prisma,
  WordPressSyncMode,
  WordPressSyncState,
} from "@prisma/client";
import { promises as fs } from "node:fs";
import path from "node:path";

import { prisma } from "@/lib/db";
import { AppError, toAppError } from "@/lib/errors/app-error";
import { getServerEnv, requireWordPressAuthEnv } from "@/lib/env";
import { fetchWithPolicy } from "@/lib/http/fetch-policy";
import { withWordPressOriginTransport } from "@/lib/http/wordpress-origin";
import { renderSanitizedArticleHtml } from "@/lib/rendering/sanitize-html";
import { serializeWordPressCategoryIds } from "@/lib/serialized-values";
import { isAllowedAppCategorySlug } from "@/lib/category-config";
import {
  buildCanonicalTopicKey,
  normalizeTopicValue,
  slugify,
  splitListInput,
} from "@/lib/topic-utils";

type WordPressCategoryRecord = {
  id: number;
  count: number;
  description: string;
  name: string;
  slug: string;
};

type WordPressPostRecord = {
  id: number;
  date: string;
  date_gmt?: string;
  slug: string;
  link: string;
  status?: string;
  categories: number[];
  title: { rendered: string };
  excerpt: { rendered: string };
};

export type WordPressSyncModeInput = "FULL_PRIVATE" | "PUBLIC_ONLY";

type WordPressSiteSettings = {
  timezone_string?: string;
  gmt_offset?: number;
};

function formatWordPressGmtOffset(offset: number) {
  const sign = offset >= 0 ? "+" : "-";
  const absoluteMinutes = Math.round(Math.abs(offset) * 60);
  const hours = Math.floor(absoluteMinutes / 60);
  const minutes = absoluteMinutes % 60;

  return `UTC${sign}${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

type WordPressPostEditRecord = {
  id: number;
  meta?: Record<string, unknown>;
  yoast_head?: string;
};

type WordPressPublishRecord = {
  id: number;
  status: string;
  date_gmt?: string;
  link?: string;
};

type WordPressMediaRecord = {
  id: number;
  source_url?: string;
};

type FeaturedMediaInfo = {
  id: number;
  sourceUrl: string | null;
};

type BodyMediaInfo = {
  publicPath: string;
  mediaId: number;
  sourceUrl: string;
  altText: string;
};

export type WordPressScheduledPostTime = {
  wpPostId: number;
  date: Date;
};

function wordpressApiUrl(pathname: string) {
  const env = getServerEnv();
  return new URL(`/wp-json/wp/v2${pathname}`, env.WORDPRESS_URL).toString();
}

function wordpressFoundryApiUrl(pathname: string) {
  const env = getServerEnv();
  return new URL(`/wp-json/tavern-cellar/v1${pathname}`, env.WORDPRESS_URL).toString();
}

function stripHtml(value: string) {
  return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function clampText(value: string, maxLength: number) {
  const normalized = value.replace(/\s+/g, " ").trim();

  if (normalized.length <= maxLength) {
    return normalized;
  }

  const sliced = normalized.slice(0, maxLength + 1);
  const lastSpace = sliced.lastIndexOf(" ");

  if (lastSpace > Math.floor(maxLength * 0.6)) {
    return sliced.slice(0, lastSpace).trim();
  }

  return normalized.slice(0, maxLength).trim();
}

function escapeHtmlAttribute(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function sourceUrlFromMedia(media: WordPressMediaRecord) {
  const sourceUrl = media.source_url?.trim();

  return sourceUrl || null;
}

function safeHttpsUrl(value: string | null | undefined) {
  if (!value?.trim()) {
    return null;
  }

  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

type ImageCredit = {
  sourceUrl: string;
  attribution: string;
  licenseUrl?: string | null;
};

function buildImageCreditHtml(credit: ImageCredit | null | undefined) {
  const sourceUrl = safeHttpsUrl(credit?.sourceUrl);
  const licenseUrl = safeHttpsUrl(credit?.licenseUrl);
  const attribution = credit?.attribution.trim();

  if (!sourceUrl || !attribution) {
    return "";
  }

  const licenseLink = licenseUrl
    ? ` · <a href="${escapeHtmlAttribute(licenseUrl)}" rel="noreferrer noopener" target="_blank">License</a>`
    : "";

  return `<p><em>Image credit: <a href="${escapeHtmlAttribute(
    sourceUrl,
  )}" rel="noreferrer noopener" target="_blank">${escapeHtmlAttribute(attribution)}</a>${licenseLink}</em></p>`;
}

function buildFeaturedImageBlockHtml(input: {
  mediaId: number;
  sourceUrl: string;
  altText: string;
  credit?: ImageCredit | null;
}) {
  const sourceUrl = input.sourceUrl.trim();

  if (!sourceUrl) {
    return "";
  }

  const blockAttributes = JSON.stringify({
    id: input.mediaId,
    sizeSlug: "full",
    linkDestination: "none",
  });

  return [
    `<!-- wp:image ${blockAttributes} -->`,
    `<figure class="wp-block-image size-full"><img src="${escapeHtmlAttribute(
      sourceUrl,
    )}" alt="${escapeHtmlAttribute(input.altText.trim())}" class="wp-image-${input.mediaId}"/></figure>`,
    "<!-- /wp:image -->",
    buildImageCreditHtml(input.credit),
  ].join("\n");
}

function replaceBodyImageMarkdownWithBlocks(
  contentMarkdown: string,
  bodyImages: Array<{
    publicPath: string;
    mediaId: number;
    sourceUrl: string;
    altText: string;
    credit?: ImageCredit | null;
  }>,
) {
  if (bodyImages.length === 0) {
    return contentMarkdown;
  }

  const imagesByPath = new Map(
    bodyImages
      .filter((image) => image.publicPath.trim() && image.sourceUrl.trim())
      .map((image) => [image.publicPath.trim(), image]),
  );

  if (imagesByPath.size === 0) {
    return contentMarkdown;
  }

  return contentMarkdown
    .split(/\r?\n/)
    .map((line) => {
      const match = /^!\[[^\]]*\]\(([^)]+)\)\s*$/.exec(line.trim());
      const image = match ? imagesByPath.get(match[1].trim()) : null;

      if (!image) {
        return line;
      }

      return buildFeaturedImageBlockHtml({
        mediaId: image.mediaId,
        sourceUrl: image.sourceUrl,
        altText: image.altText,
        credit: image.credit,
      });
    })
    .join("\n");
}

export async function buildWordPressPostContentHtml(input: {
  contentMarkdown: string;
  featuredImage: {
    mediaId: number;
    sourceUrl: string;
    altText: string;
    credit?: ImageCredit | null;
  } | null;
  bodyImages?: Array<{
    publicPath: string;
    mediaId: number;
    sourceUrl: string;
    altText: string;
  }>;
}) {
  const contentWithBodyImages = replaceBodyImageMarkdownWithBlocks(
    input.contentMarkdown,
    input.bodyImages ?? [],
  );
  const imageBlock = input.featuredImage?.sourceUrl.trim()
    ? buildFeaturedImageBlockHtml(input.featuredImage)
    : "";
  const approvedImageUrls = [
    input.featuredImage?.sourceUrl,
    ...(input.bodyImages ?? []).map((image) => image.sourceUrl),
  ].filter((url): url is string => Boolean(url?.trim()));

  return renderSanitizedArticleHtml({
    markdown: imageBlock ? `${imageBlock}\n\n${contentWithBodyImages}` : contentWithBodyImages,
    approvedImageUrls,
  });
}

function buildPreflightImageHtml(input: {
  sourceUrl: string;
  altText: string;
  credit?: ImageCredit | null;
}) {
  const sourceUrl = input.sourceUrl.trim();

  if (!sourceUrl) {
    return "";
  }

  return [
    `<figure class="wp-block-image size-full"><img src="${escapeHtmlAttribute(
      sourceUrl,
    )}" alt="${escapeHtmlAttribute(input.altText.trim())}"/></figure>`,
    buildImageCreditHtml(input.credit),
  ].join("\n");
}

/**
 * Renders the saved article through the same Markdown renderer and HTML sanitizer
 * used for publishing. Generated image paths stay local in this preflight because
 * WordPress only assigns their final media URLs during the upload itself.
 */
export async function buildWordPressPreflightContentHtml(input: {
  contentMarkdown: string;
  featuredImage: {
    publicPath: string;
    altText: string;
    credit?: ImageCredit | null;
  } | null;
  bodyImages?: Array<{
    publicPath: string;
    altText: string;
  }>;
}) {
  const imageBlock = input.featuredImage?.publicPath.trim()
    ? buildPreflightImageHtml({
        sourceUrl: input.featuredImage.publicPath,
        altText: input.featuredImage.altText,
        credit: input.featuredImage.credit,
      })
    : "";
  const approvedImageUrls = [
    input.featuredImage?.publicPath,
    ...(input.bodyImages ?? []).map((image) => image.publicPath),
  ].filter((url): url is string => Boolean(url?.trim()));

  return renderSanitizedArticleHtml({
    markdown: imageBlock ? `${imageBlock}\n\n${input.contentMarkdown}` : input.contentMarkdown,
    approvedImageUrls,
  });
}

type WordPressErrorPayload = {
  code?: string;
};

async function buildWordPressError(response: Response) {
  const rawBody = await response.text();

  let payload: WordPressErrorPayload | null = null;

  try {
    payload = JSON.parse(rawBody) as WordPressErrorPayload;
  } catch {
    payload = null;
  }

  const code = payload?.code;
  if (code === "rest_not_logged_in") {
    return new AppError("WP_AUTH_FAILED");
  }

  return new AppError("WP_RESPONSE_INVALID", { retryable: response.status >= 500 });
}

async function fetchWordPressRead(url: string, init: RequestInit = {}) {
  return fetchWithPolicy(
    url,
    withWordPressOriginTransport(url, { ...init, cache: "no-store" }),
    { service: "wordpress", timeoutMs: 12_000, retries: 2 },
  );
}

async function fetchWordPressWrite(url: string, init: RequestInit) {
  return fetchWithPolicy(
    url,
    withWordPressOriginTransport(url, { ...init, cache: "no-store" }),
    { service: "wordpress", timeoutMs: 20_000, retries: 0, uncertainWrite: true },
  );
}

function readWordPressTotalPages(response: Response) {
  const totalPages = Number(response.headers.get("X-WP-TotalPages") ?? "1");

  if (!Number.isInteger(totalPages) || totalPages < 1 || totalPages > 10_000) {
    throw new AppError("WP_RESPONSE_INVALID");
  }

  return totalPages;
}

function assertWordPressCategoryRecords(value: unknown): asserts value is WordPressCategoryRecord[] {
  if (
    !Array.isArray(value) ||
    value.some(
      (category) =>
        !category ||
        typeof category !== "object" ||
        !Number.isInteger((category as WordPressCategoryRecord).id) ||
        (category as WordPressCategoryRecord).id < 1 ||
        !Number.isInteger((category as WordPressCategoryRecord).count) ||
        (category as WordPressCategoryRecord).count < 0 ||
        typeof (category as WordPressCategoryRecord).description !== "string" ||
        typeof (category as WordPressCategoryRecord).name !== "string" ||
        typeof (category as WordPressCategoryRecord).slug !== "string",
    )
  ) {
    throw new AppError("WP_RESPONSE_INVALID");
  }
}

function assertWordPressPostRecords(value: unknown): asserts value is WordPressPostRecord[] {
  if (
    !Array.isArray(value) ||
    value.some(
      (post) =>
        !post ||
        typeof post !== "object" ||
        !Number.isInteger((post as WordPressPostRecord).id) ||
        (post as WordPressPostRecord).id < 1 ||
        typeof (post as WordPressPostRecord).date !== "string" ||
        typeof (post as WordPressPostRecord).slug !== "string" ||
        typeof (post as WordPressPostRecord).link !== "string" ||
        !Array.isArray((post as WordPressPostRecord).categories) ||
        (post as WordPressPostRecord).categories.some((categoryId) => !Number.isInteger(categoryId)) ||
        typeof (post as WordPressPostRecord).title?.rendered !== "string" ||
        typeof (post as WordPressPostRecord).excerpt?.rendered !== "string",
    )
  ) {
    throw new AppError("WP_RESPONSE_INVALID");
  }
}

async function fetchAllWordPressCategories(input: {
  headers?: HeadersInit;
}) {
  const categories: WordPressCategoryRecord[] = [];
  let page = 1;
  let totalPages = 1;

  while (page <= totalPages) {
    const response = await fetchWordPressRead(
      wordpressApiUrl(`/categories?per_page=100&page=${page}&_fields=id,count,description,name,slug`),
      { headers: input.headers },
    );

    if (!response.ok) {
      throw await buildWordPressError(response);
    }

    const reportedTotalPages = readWordPressTotalPages(response);

    if (page === 1) {
      totalPages = reportedTotalPages;
    } else if (reportedTotalPages !== totalPages) {
      throw new AppError("WP_RESPONSE_INVALID");
    }

    const batch: unknown = await response.json();
    assertWordPressCategoryRecords(batch);
    categories.push(...batch);
    page += 1;
  }

  return { categories, pageCount: totalPages };
}

function assertUniqueWordPressIds(records: Array<{ id: number }>) {
  if (new Set(records.map((record) => record.id)).size !== records.length) {
    throw new AppError("WP_RESPONSE_INVALID");
  }
}

function inBatches<T>(items: T[], batchSize: number) {
  const batches: T[][] = [];

  for (let index = 0; index < items.length; index += batchSize) {
    batches.push(items.slice(index, index + batchSize));
  }

  return batches;
}

function buildWordPressCategoryPayload(input: {
  name: string;
  slug?: string | null;
  description?: string | null;
}) {
  const name = input.name.trim();
  const slug = input.slug?.trim();
  const description = input.description?.trim();

  if (!name) {
    throw new Error("Category name is required.");
  }

  return {
    name,
    ...(slug ? { slug } : {}),
    ...(description ? { description } : {}),
  };
}

function buildBasicAuthHeaders(
  username: string,
  appPassword: string,
  contentType = "application/json",
) {
  const encoded = Buffer.from(`${username}:${appPassword.replace(/\s+/g, "")}`).toString(
    "base64",
  );

  return {
    Authorization: `Basic ${encoded}`,
    "Content-Type": contentType,
  };
}

function createOptionalAuthHeaders() {
  const env = getServerEnv();

  if (!env.WORDPRESS_USERNAME || !env.WORDPRESS_APP_PASSWORD) {
    return null;
  }

  return buildBasicAuthHeaders(env.WORDPRESS_USERNAME, env.WORDPRESS_APP_PASSWORD);
}

async function fetchPostsPage(input: {
  page: number;
  includePrivateStatuses: boolean;
  authHeaders: HeadersInit | null;
}) {
  const statusParam = input.includePrivateStatuses
    ? "&status=publish,future,draft,pending,private"
    : "";
  const response = await fetchWordPressRead(
    wordpressApiUrl(
      `/posts?per_page=100&page=${input.page}${statusParam}&_fields=id,date,date_gmt,slug,link,categories,title,excerpt,status`,
    ),
    {
      cache: "no-store",
      headers: input.authHeaders ?? undefined,
    },
  );

  return response;
}

export function parseWordPressScheduledDate(input: {
  date?: string | null;
  date_gmt?: string | null;
}) {
  const dateGmt = input.date_gmt?.trim();

  if (dateGmt) {
    const normalized = dateGmt.endsWith("Z") ? dateGmt : `${dateGmt}Z`;
    const parsedGmt = new Date(normalized);

    if (!Number.isNaN(parsedGmt.getTime())) {
      return parsedGmt;
    }
  }

  const date = input.date?.trim();

  if (!date) {
    return null;
  }

  const parsedDate = new Date(date);

  return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
}

export async function fetchAllWordPressPosts(input: {
  mode: WordPressSyncModeInput;
  headers?: HeadersInit;
}) {
  const allPosts: WordPressPostRecord[] = [];
  let page = 1;
  let totalPages = 1;

  while (page <= totalPages) {
    const response = await fetchPostsPage({
      page,
      includePrivateStatuses: input.mode === "FULL_PRIVATE",
      authHeaders: input.headers ?? null,
    });

    if (!response.ok) {
      throw await buildWordPressError(response);
    }

    const reportedTotalPages = readWordPressTotalPages(response);

    if (page === 1) {
      totalPages = reportedTotalPages;
    } else if (reportedTotalPages !== totalPages) {
      throw new AppError("WP_RESPONSE_INVALID");
    }

    const batch: unknown = await response.json();
    assertWordPressPostRecords(batch);
    allPosts.push(...batch);
    page += 1;
  }

  assertUniqueWordPressIds(allPosts);

  return { posts: allPosts, pageCount: totalPages };
}

export async function fetchScheduledWordPressPostTimes(
  options: {
    excludeWpPostId?: number | null;
    now?: Date;
  } = {},
) {
  const authHeaders = createOptionalAuthHeaders();

  if (!authHeaders) {
    throw new Error(
      "Add WordPress credentials before random scheduling so existing scheduled posts can be checked.",
    );
  }

  const scheduledTimes: WordPressScheduledPostTime[] = [];
  const now = options.now ?? new Date();
  let page = 1;
  let totalPages = 1;

  while (page <= totalPages) {
    const response = await fetchPostsPage({
      page,
      includePrivateStatuses: true,
      authHeaders,
    });

    if (!response.ok) {
      throw new Error(`WordPress scheduled posts check failed on page ${page}.`);
    }

    totalPages = Number(response.headers.get("X-WP-TotalPages") ?? "1");
    const batch = (await response.json()) as WordPressPostRecord[];

    for (const post of batch) {
      if (post.status !== "future" || post.id === options.excludeWpPostId) {
        continue;
      }

      const scheduledDate = parseWordPressScheduledDate(post);

      if (scheduledDate && scheduledDate.getTime() > now.getTime()) {
        scheduledTimes.push({
          wpPostId: post.id,
          date: scheduledDate,
        });
      }
    }

    page += 1;
  }

  return scheduledTimes;
}

async function fetchWordPressSiteTimezone(headers: HeadersInit) {
  try {
    const response = await fetchWordPressRead(wordpressApiUrl("/settings"), { headers });

    if (!response.ok) {
      return null;
    }

    const settings = (await response.json()) as WordPressSiteSettings;

    if (typeof settings.timezone_string === "string" && settings.timezone_string.trim()) {
      return settings.timezone_string.trim();
    }

    return typeof settings.gmt_offset === "number"
      ? formatWordPressGmtOffset(settings.gmt_offset)
      : null;
  } catch {
    return null;
  }
}

export async function syncWordPressCatalog(input: {
  mode: WordPressSyncModeInput;
}) {
  if (input.mode !== "FULL_PRIVATE" && input.mode !== "PUBLIC_ONLY") {
    throw new AppError("VALIDATION_FAILED");
  }

  const mode = input.mode;
  const syncRun = await prisma.wordPressSyncRun.create({
    data: {
      mode: mode === "FULL_PRIVATE" ? WordPressSyncMode.FULL_PRIVATE : WordPressSyncMode.PUBLIC_ONLY,
      siteUrl: getServerEnv().WORDPRESS_URL,
    },
  });

  try {
    const authHeaders = mode === "FULL_PRIVATE" ? createAuthHeaders() : null;
    const categoryResult = await fetchAllWordPressCategories({
      headers: authHeaders ?? undefined,
    });
    const postResult = await fetchAllWordPressPosts({
      mode,
      headers: authHeaders ?? undefined,
    });
    assertUniqueWordPressIds(categoryResult.categories);
    const siteTimezone = authHeaders ? await fetchWordPressSiteTimezone(authHeaders) : null;
    const syncedAt = new Date();

    for (const categoryBatch of inBatches(categoryResult.categories, 50)) {
      await prisma.$transaction(
        categoryBatch.map((category) =>
          upsertWordPressCategoryRecord(category, {
            lastSeenAt: syncedAt,
            lastSeenSyncRunId: syncRun.id,
          }),
        ),
      );
    }

    const storedCategories = await prisma.category.findMany();
    const categoryMap = new Map(storedCategories.map((category) => [category.wpCategoryId, category]));

    for (const postBatch of inBatches(postResult.posts, 50)) {
      await prisma.$transaction(
        postBatch.map((post) => {
          const primaryCategory = categoryMap.get(post.categories[0]);
          const title = stripHtml(post.title.rendered);
          const data = {
            title,
            normalizedTitle: normalizeTopicValue(title),
            slug: post.slug || slugify(title),
            excerpt: stripHtml(post.excerpt.rendered) || null,
            canonicalTopicKey: buildCanonicalTopicKey(
              primaryCategory?.slug ?? "tavern-cellar",
              title,
              title,
              title,
            ),
            wpStatus: post.status ?? "publish",
            publishedAt: post.date ? new Date(post.date) : null,
            link: post.link,
            primaryCategoryId: primaryCategory?.id ?? null,
            rawCategoryIds: serializeWordPressCategoryIds(post.categories),
            lastSyncedAt: syncedAt,
            lastSeenSyncRunId: syncRun.id,
            lastSeenAt: syncedAt,
            isStale: false,
          };

          return prisma.sitePost.upsert({
            where: { wpPostId: post.id },
            create: {
              wpPostId: post.id,
              ...data,
            },
            update: data,
          });
        }),
      );
    }

    let stalePostCount = 0;
    let staleCategoryCount = 0;

    if (mode === "FULL_PRIVATE") {
      const [stalePosts, staleCategories] = await Promise.all([
        prisma.sitePost.updateMany({
          where: {
            OR: [
              { lastSeenSyncRunId: null },
              { lastSeenSyncRunId: { not: syncRun.id } },
            ],
          },
          data: { isStale: true },
        }),
        prisma.category.updateMany({
          where: {
            OR: [
              { lastSeenSyncRunId: null },
              { lastSeenSyncRunId: { not: syncRun.id } },
            ],
          },
          data: { isStale: true },
        }),
      ]);
      stalePostCount = stalePosts.count;
      staleCategoryCount = staleCategories.count;
    }

    const state = mode === "FULL_PRIVATE" ? WordPressSyncState.SUCCEEDED : WordPressSyncState.DEGRADED;
    await prisma.wordPressSyncRun.update({
      where: { id: syncRun.id },
      data: {
        state,
        completedAt: new Date(),
        categoryCount: categoryResult.categories.length,
        postCount: postResult.posts.length,
        pageCount: categoryResult.pageCount + postResult.pageCount,
        siteTimezone,
      },
    });

    return {
      categoryCount: categoryResult.categories.length,
      mode,
      postCount: postResult.posts.length,
      siteTimezone,
      staleCategoryCount,
      stalePostCount,
      state,
    };
  } catch (error) {
    const appError = toAppError(error);
    await prisma.wordPressSyncRun.update({
      where: { id: syncRun.id },
      data: {
        state: WordPressSyncState.FAILED,
        completedAt: new Date(),
        errorCode: appError.code,
        errorCorrelationId: appError.correlationId,
      },
    });
    throw appError;
  }
}

function createAuthHeaders(contentType = "application/json") {
  const env = requireWordPressAuthEnv();
  return buildBasicAuthHeaders(env.WORDPRESS_USERNAME, env.WORDPRESS_APP_PASSWORD, contentType);
}

export async function findWordPressPostByOperationKey(operationKey: string) {
  const response = await fetchWordPressRead(
    wordpressFoundryApiUrl(`/publish-attempt/${encodeURIComponent(operationKey)}`),
    {
      headers: createAuthHeaders(),
    },
  );

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw await buildWordPressError(response);
  }

  const payload = (await response.json()) as WordPressPublishRecord;

  if (!Number.isInteger(payload.id) || payload.id <= 0 || !payload.status) {
    throw new AppError("WP_RESPONSE_INVALID");
  }

  return payload;
}

async function createWordPressDraftPlaceholder(article: Article, operationKey: string) {
  const response = await fetchWordPressWrite(wordpressApiUrl("/posts"), {
    method: "POST",
    headers: createAuthHeaders(),
    body: JSON.stringify({
      title: article.title,
      slug: article.slug,
      status: "draft",
      meta: {
        _tavern_cellar_publish_operation_key: operationKey,
      },
    }),
  });

  if (!response.ok) {
    throw await buildWordPressError(response);
  }

  const payload = (await response.json()) as WordPressPublishRecord;

  if (!Number.isInteger(payload.id) || payload.id <= 0) {
    throw new AppError("WP_RESPONSE_INVALID");
  }

  return payload;
}

function upsertWordPressCategoryRecord(
  category: WordPressCategoryRecord,
  options: {
    isActive?: boolean;
    lastSeenAt?: Date;
    lastSeenSyncRunId?: string;
  } = {},
) {
  const isActive = options.isActive ?? isAllowedAppCategorySlug(category.slug);

  return prisma.category.upsert({
    where: { wpCategoryId: category.id },
    create: {
      wpCategoryId: category.id,
      name: category.name,
      slug: category.slug,
      description: category.description || null,
      postCount: category.count,
      isActive,
      ...(options.lastSeenAt
        ? {
            isStale: false,
            lastSeenAt: options.lastSeenAt,
            lastSeenSyncRunId: options.lastSeenSyncRunId,
          }
        : {}),
    },
    update: {
      name: category.name,
      slug: category.slug,
      description: category.description || null,
      postCount: category.count,
      ...(options.isActive === undefined ? {} : { isActive }),
      ...(options.lastSeenAt
        ? {
            isStale: false,
            lastSeenAt: options.lastSeenAt,
            lastSeenSyncRunId: options.lastSeenSyncRunId,
          }
        : {}),
    },
  });
}

export async function createWordPressCategory(input: {
  name: string;
  slug?: string | null;
  description?: string | null;
}) {
  const response = await fetchWordPressWrite(wordpressApiUrl("/categories"), {
    method: "POST",
    headers: createAuthHeaders(),
    body: JSON.stringify(buildWordPressCategoryPayload(input)),
  });

  if (!response.ok) {
    throw await buildWordPressError(response);
  }

  return (await response.json()) as WordPressCategoryRecord;
}

export async function createWordPressCategoryAndSync(input: {
  name: string;
  slug?: string | null;
  description?: string | null;
}) {
  const category = await createWordPressCategory(input);

  return upsertWordPressCategoryRecord(category, { isActive: true });
}

async function getOrCreateTagIds(tagsValue: string) {
  const tagNames = Array.from(new Set(splitListInput(tagsValue).map((tag) => tag.trim()).filter(Boolean)));
  const tagIds: number[] = [];

  for (const tagName of tagNames) {
    const response = await fetchWordPressWrite(wordpressApiUrl("/tags"), {
      method: "POST",
      headers: createAuthHeaders(),
      body: JSON.stringify({ name: tagName }),
    });

    if (response.ok) {
      const payload = (await response.json()) as { id: number };
      tagIds.push(payload.id);
      continue;
    }

    const rawBody = await response.text();

    let payload: { code?: string; data?: { term_id?: number } } | null = null;
    try {
      payload = JSON.parse(rawBody) as { code?: string; data?: { term_id?: number } };
    } catch {
      payload = null;
    }

    if (payload?.code === "term_exists" && payload.data?.term_id) {
      tagIds.push(payload.data.term_id);
      continue;
    }

    void rawBody;
    throw new AppError("WP_RESPONSE_INVALID", { retryable: response.status >= 500 });
  }

  return tagIds;
}

async function detectYoastMetaSupport(postId: number, expectedMetaDescription: string) {
  const response = await fetchWordPressRead(wordpressApiUrl(`/posts/${postId}?context=edit`), {
    headers: createAuthHeaders(),
    cache: "no-store",
  });

  if (!response.ok) {
    return false;
  }

  const payload = (await response.json()) as WordPressPostEditRecord;
  const meta = payload.meta ?? {};

  return (
    "_yoast_wpseo_metadesc" in meta ||
    "_yoast_wpseo_title" in meta ||
    "_yoast_wpseo_focuskw" in meta ||
    String(payload.yoast_head ?? "").includes(expectedMetaDescription)
  );
}

function buildMediaMetadata(article: Article) {
  const safeTitle = clampText(stripHtml(article.title), 120);
  const safeAltText = clampText(
    stripHtml(
      article.featuredImageAlt ||
        `Featured image for ${article.primaryKeyword || article.title}`,
    ),
    220,
  );
  const safeAttribution = clampText(stripHtml(article.featuredImageAttribution ?? ""), 220);
  const sourceUrl = safeHttpsUrl(article.featuredImageSourceUrl);
  const safeCaption = safeAttribution
    ? clampText(`Image credit: ${safeAttribution}.`, 220)
    : clampText(`Featured image for "${stripHtml(article.title)}".`, 220);
  const description = stripHtml(
    article.metaDescription || article.excerpt || `Featured image for ${article.title}.`,
  );
  const sourceCredit = safeAttribution
    ? ` Image credit: ${safeAttribution}.${sourceUrl ? ` Source: ${sourceUrl}` : ""}`
    : "";
  const safeDescription = clampText(`${description}${sourceCredit}`, 320);

  return {
    alt_text: safeAltText,
    title: safeTitle,
    caption: safeCaption,
    description: safeDescription,
  };
}

async function syncFeaturedMediaMetadata(mediaId: number, article: Article): Promise<FeaturedMediaInfo> {
  const response = await fetchWordPressWrite(wordpressApiUrl(`/media/${mediaId}`), {
    method: "POST",
    headers: createAuthHeaders(),
    body: JSON.stringify(buildMediaMetadata(article)),
  });

  if (!response.ok) {
    throw await buildWordPressError(response);
  }

  const media = (await response.json()) as WordPressMediaRecord;

  return {
    id: media.id,
    sourceUrl: sourceUrlFromMedia(media),
  };
}

async function uploadFeaturedMedia(article: Article): Promise<FeaturedMediaInfo | null> {
  if (!article.featuredImagePath || article.wpMediaId) {
    return article.wpMediaId ? { id: article.wpMediaId, sourceUrl: null } : null;
  }

  const filePath = path.join(process.cwd(), "public", article.featuredImagePath.replace(/^\//, ""));
  const fileBuffer = await fs.readFile(filePath);
  const filename = path.basename(filePath);
  const response = await fetchWordPressWrite(wordpressApiUrl("/media"), {
    method: "POST",
    headers: {
      ...createAuthHeaders(article.featuredImageMimeType ?? "image/png"),
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
    body: fileBuffer,
  });

  if (!response.ok) {
    throw await buildWordPressError(response);
  }

  const media = (await response.json()) as WordPressMediaRecord;
  await prisma.article.update({
    where: { id: article.id },
    data: { wpMediaId: media.id },
  });

  return {
    id: media.id,
    sourceUrl: sourceUrlFromMedia(media),
  };
}

function buildBodyMediaMetadata(article: Article, image: ArticleBodyImage) {
  const safeTitle = clampText(stripHtml(`${article.title} - ${image.sectionHeading}`), 120);
  const safeAltText = clampText(stripHtml(image.altText), 220);
  const safeCaption = clampText(stripHtml(`Image for "${image.sectionHeading}".`), 220);
  const safeDescription = clampText(
    stripHtml(`Supporting image for "${article.title}" in the section "${image.sectionHeading}".`),
    320,
  );

  return {
    alt_text: safeAltText,
    title: safeTitle,
    caption: safeCaption,
    description: safeDescription,
  };
}

async function syncBodyMediaMetadata(
  mediaId: number,
  article: Article,
  image: ArticleBodyImage,
): Promise<FeaturedMediaInfo> {
  const response = await fetchWordPressWrite(wordpressApiUrl(`/media/${mediaId}`), {
    method: "POST",
    headers: createAuthHeaders(),
    body: JSON.stringify(buildBodyMediaMetadata(article, image)),
  });

  if (!response.ok) {
    throw await buildWordPressError(response);
  }

  const media = (await response.json()) as WordPressMediaRecord;

  return {
    id: media.id,
    sourceUrl: sourceUrlFromMedia(media),
  };
}

async function uploadBodyMedia(article: Article, image: ArticleBodyImage): Promise<BodyMediaInfo | null> {
  let mediaId = image.wpMediaId;

  if (!mediaId) {
    const filePath = path.join(process.cwd(), "public", image.publicPath.replace(/^\//, ""));
    const fileBuffer = await fs.readFile(filePath);
    const filename = path.basename(filePath);
    const response = await fetchWordPressWrite(wordpressApiUrl("/media"), {
      method: "POST",
      headers: {
        ...createAuthHeaders(image.mimeType),
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
      body: fileBuffer,
    });

    if (!response.ok) {
      throw await buildWordPressError(response);
    }

    const media = (await response.json()) as WordPressMediaRecord;
    mediaId = media.id;
    await prisma.articleBodyImage.update({
      where: { id: image.id },
      data: { wpMediaId: media.id },
    });
  }

  const syncedMedia = await syncBodyMediaMetadata(mediaId, article, image);

  if (!syncedMedia.sourceUrl) {
    return null;
  }

  return {
    publicPath: image.publicPath,
    mediaId,
    sourceUrl: syncedMedia.sourceUrl,
    altText: image.altText,
  };
}

async function uploadBodyMediaImages(
  article: Article & { bodyImages?: ArticleBodyImage[] },
) {
  const images = article.bodyImages ?? [];
  const uploaded: BodyMediaInfo[] = [];

  for (const image of images) {
    const media = await uploadBodyMedia(article, image);

    if (media) {
      uploaded.push(media);
    }
  }

  return uploaded;
}

type PublishMode = "draft" | "publish" | "future";

type WordPressSchedule = {
  localDateTime: string;
  utcDateTime: Date;
};

type PublishProgressCallbacks = {
  onPostIdentified?: (post: WordPressPublishRecord) => Promise<void>;
  onMediaComplete?: (post: WordPressPublishRecord) => Promise<void>;
  onContentComplete?: (post: WordPressPublishRecord) => Promise<void>;
};

function toWordPressLocalDateTime(value: string) {
  return value.length === 16 ? `${value}:00` : value;
}

function toWordPressUtcDateTime(value: Date) {
  return [
    value.getUTCFullYear(),
    String(value.getUTCMonth() + 1).padStart(2, "0"),
    String(value.getUTCDate()).padStart(2, "0"),
  ].join("-") + `T${[
    String(value.getUTCHours()).padStart(2, "0"),
    String(value.getUTCMinutes()).padStart(2, "0"),
    String(value.getUTCSeconds()).padStart(2, "0"),
  ].join(":")}`;
}

export function buildWordPressPostTimingFields(input: {
  mode: PublishMode;
  schedule?: WordPressSchedule | null;
  publishAt?: Date | null;
}) {
  const fields: Record<string, string> = {};

  if (input.mode === "future" && input.schedule) {
    fields.date = toWordPressLocalDateTime(input.schedule.localDateTime);
    fields.date_gmt = toWordPressUtcDateTime(input.schedule.utcDateTime);
  }

  if (input.mode === "publish" && input.publishAt) {
    fields.date_gmt = toWordPressUtcDateTime(input.publishAt);
  }

  return fields;
}

async function identifyWordPressPost(input: {
  article: Article;
  operationKey?: string;
  allowPlaceholderCreation?: boolean;
  onPostIdentified?: (post: WordPressPublishRecord) => Promise<void>;
}) {
  if (input.article.wpPostId) {
    const knownPost = {
      id: input.article.wpPostId,
      status: input.article.wpStatus ?? "draft",
    };
    await input.onPostIdentified?.(knownPost);
    return knownPost;
  }

  if (!input.operationKey) {
    return null;
  }

  const reconciledPost = await findWordPressPostByOperationKey(input.operationKey);

  if (reconciledPost) {
    await input.onPostIdentified?.(reconciledPost);
    return reconciledPost;
  }

  if (input.allowPlaceholderCreation === false) {
    throw new AppError("WP_WRITE_UNCERTAIN");
  }

  try {
    const createdPost = await createWordPressDraftPlaceholder(input.article, input.operationKey);
    await input.onPostIdentified?.(createdPost);
    return createdPost;
  } catch (error) {
    const appError = toAppError(error);

    if (appError.code !== "WP_WRITE_UNCERTAIN") {
      throw appError;
    }

    const reconciledAfterUncertainWrite = await findWordPressPostByOperationKey(input.operationKey);

    if (!reconciledAfterUncertainWrite) {
      throw appError;
    }

    await input.onPostIdentified?.(reconciledAfterUncertainWrite);
    return reconciledAfterUncertainWrite;
  }
}

export async function pushArticleToWordPress(
  article: Article & { category: Category; bodyImages?: ArticleBodyImage[] },
  mode: PublishMode,
  schedule?: WordPressSchedule | null,
  options: {
    publishAt?: Date | null;
    operationKey?: string;
    allowPlaceholderCreation?: boolean;
    progress?: PublishProgressCallbacks;
  } = {},
) {
  const identifiedPost = await identifyWordPressPost({
    article,
    operationKey: options.operationKey,
    allowPlaceholderCreation: options.allowPlaceholderCreation,
    onPostIdentified: options.progress?.onPostIdentified,
  });
  const uploadedMedia = await uploadFeaturedMedia(article);
  const bodyImages = await uploadBodyMediaImages(article);
  let featuredMedia = uploadedMedia;

  if (uploadedMedia) {
    const syncedMedia = await syncFeaturedMediaMetadata(uploadedMedia.id, article);
    featuredMedia = {
      id: uploadedMedia.id,
      sourceUrl: syncedMedia.sourceUrl ?? uploadedMedia.sourceUrl,
    };
  }

  const htmlContent = await buildWordPressPostContentHtml({
    contentMarkdown: article.contentMarkdown,
    featuredImage:
      featuredMedia?.sourceUrl
        ? {
            mediaId: featuredMedia.id,
            sourceUrl: featuredMedia.sourceUrl,
            altText: article.featuredImageAlt,
            credit:
              article.featuredImageSourceUrl && article.featuredImageAttribution
                ? {
                    sourceUrl: article.featuredImageSourceUrl,
                    attribution: article.featuredImageAttribution,
                    licenseUrl: article.featuredImageLicenseUrl,
                  }
                : null,
          }
        : null,
    bodyImages,
  });
  const tagIds = await getOrCreateTagIds(article.tags);
  const knownPostId = identifiedPost?.id ?? article.wpPostId;

  const body: Record<string, Prisma.JsonValue | string | number | number[] | null> = {
    title: article.title,
    slug: article.slug,
    content: htmlContent,
    excerpt: article.excerpt,
    categories: [article.category.wpCategoryId],
    tags: tagIds,
    status: mode,
    featured_media: featuredMedia?.id ?? null,
    meta: {
      _yoast_wpseo_title: article.metaTitle,
      _yoast_wpseo_metadesc: article.metaDescription,
      _yoast_wpseo_focuskw: article.primaryKeyword,
      ...(options.operationKey
        ? { _tavern_cellar_publish_operation_key: options.operationKey }
        : {}),
    },
  };
  Object.assign(
    body,
    buildWordPressPostTimingFields({
      mode,
      schedule,
      publishAt: options.publishAt,
    }),
  );

  if (knownPostId) {
    await options.progress?.onMediaComplete?.({
      id: knownPostId,
      status: identifiedPost?.status ?? article.wpStatus ?? "draft",
    });
  }

  const endpoint = knownPostId
    ? wordpressApiUrl(`/posts/${knownPostId}`)
    : wordpressApiUrl("/posts");

  const response = await fetchWordPressWrite(endpoint, {
    method: "POST",
    headers: createAuthHeaders(),
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw await buildWordPressError(response);
  }

  const payload = (await response.json()) as WordPressPublishRecord;

  if (!Number.isInteger(payload.id) || payload.id <= 0 || !payload.status) {
    throw new AppError("WP_RESPONSE_INVALID");
  }

  await options.progress?.onContentComplete?.(payload);

  let yoastMetaApplied = false;

  try {
    yoastMetaApplied = await detectYoastMetaSupport(payload.id, article.metaDescription);
  } catch {
    yoastMetaApplied = false;
  }

  return {
    ...payload,
    tagCount: tagIds.length,
    yoastMetaApplied,
  };
}
