import { type Article, type Category, type Prisma } from "@prisma/client";
import { marked } from "marked";
import { promises as fs } from "node:fs";
import path from "node:path";

import { prisma } from "@/lib/db";
import { getServerEnv, requireWordPressAuthEnv } from "@/lib/env";
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
  slug: string;
  link: string;
  status?: string;
  categories: number[];
  title: { rendered: string };
  excerpt: { rendered: string };
};

type WordPressPostEditRecord = {
  id: number;
  meta?: Record<string, unknown>;
  yoast_head?: string;
};

function wordpressApiUrl(pathname: string) {
  const env = getServerEnv();
  return new URL(`/wp-json/wp/v2${pathname}`, env.WORDPRESS_URL).toString();
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

function stripRawMarkdownHtml(value: string) {
  return value
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<\/?[a-z][a-z0-9:-]*(?:\s+[^<>]*)?>/gi, "")
    .trim();
}

type WordPressErrorPayload = {
  code?: string;
  message?: string;
  data?: {
    status?: number;
  };
};

async function buildWordPressError(prefix: string, response: Response) {
  const fallback = `${prefix}: ${response.status} ${response.statusText}`;
  const rawBody = await response.text();

  let payload: WordPressErrorPayload | null = null;

  try {
    payload = JSON.parse(rawBody) as WordPressErrorPayload;
  } catch {
    payload = null;
  }

  const code = payload?.code;
  const message = payload?.message;

  if (code === "rest_not_logged_in") {
    return new Error(
      `${prefix}: WordPress did not accept the current credentials. Check WORDPRESS_USERNAME and WORDPRESS_APP_PASSWORD, then create a fresh application password if needed.`,
    );
  }

  if (code === "rest_cannot_create") {
    return new Error(
      `${prefix}: WordPress authenticated the request, but this user cannot create content or upload media. Use an Administrator, Editor, or Author account with post and media permissions. Original message: ${message ?? "rest_cannot_create"}`,
    );
  }

  if (message) {
    return new Error(`${prefix}: ${response.status} ${message}`);
  }

  if (rawBody) {
    return new Error(`${fallback} ${rawBody}`);
  }

  return new Error(fallback);
}

async function fetchJson<T>(url: string, init?: RequestInit) {
  const response = await fetch(url, {
    ...init,
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`WordPress request failed: ${response.status} ${response.statusText}`);
  }

  return response.json() as Promise<T>;
}

export async function fetchWordPressCategories() {
  return fetchJson<WordPressCategoryRecord[]>(
    wordpressApiUrl("/categories?per_page=100&_fields=id,count,description,name,slug"),
  );
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
  authHeaders: ReturnType<typeof createOptionalAuthHeaders>;
}) {
  const statusParam = input.includePrivateStatuses
    ? "&status=publish,future,draft,pending,private"
    : "";
  const response = await fetch(
    wordpressApiUrl(
      `/posts?per_page=100&page=${input.page}${statusParam}&_fields=id,date,slug,link,categories,title,excerpt,status`,
    ),
    {
      cache: "no-store",
      headers: input.authHeaders ?? undefined,
    },
  );

  return response;
}

export async function fetchAllWordPressPosts() {
  const allPosts: WordPressPostRecord[] = [];
  let page = 1;
  let totalPages = 1;
  const authHeaders = createOptionalAuthHeaders();
  let includePrivateStatuses = Boolean(authHeaders);

  while (page <= totalPages) {
    let response = await fetchPostsPage({
      page,
      includePrivateStatuses,
      authHeaders,
    });

    if (!response.ok && includePrivateStatuses) {
      includePrivateStatuses = false;
      response = await fetchPostsPage({
        page,
        includePrivateStatuses,
        authHeaders: null,
      });
    }

    if (!response.ok) {
      throw new Error(`WordPress posts sync failed on page ${page}.`);
    }

    totalPages = Number(response.headers.get("X-WP-TotalPages") ?? "1");
    const batch = (await response.json()) as WordPressPostRecord[];
    allPosts.push(...batch);
    page += 1;
  }

  return allPosts;
}

export async function syncWordPressCatalog() {
  const categories = await fetchWordPressCategories();
  const syncedAt = new Date();

  for (const category of categories) {
    await prisma.category.upsert({
      where: { wpCategoryId: category.id },
      create: {
        wpCategoryId: category.id,
        name: category.name,
        slug: category.slug,
        description: category.description || null,
        postCount: category.count,
      },
      update: {
        name: category.name,
        slug: category.slug,
        description: category.description || null,
        postCount: category.count,
      },
    });
  }

  const storedCategories = await prisma.category.findMany();
  const categoryMap = new Map(storedCategories.map((category) => [category.wpCategoryId, category]));
  const posts = await fetchAllWordPressPosts();

  for (const post of posts) {
    const primaryCategory = categoryMap.get(post.categories[0]);
    const title = stripHtml(post.title.rendered);

    await prisma.sitePost.upsert({
      where: { wpPostId: post.id },
      create: {
        wpPostId: post.id,
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
        rawCategoryIds: JSON.stringify(post.categories),
        lastSyncedAt: syncedAt,
      },
      update: {
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
        rawCategoryIds: JSON.stringify(post.categories),
        lastSyncedAt: syncedAt,
      },
    });
  }

  return {
    categoryCount: categories.length,
    postCount: posts.length,
  };
}

function createAuthHeaders(contentType = "application/json") {
  const env = requireWordPressAuthEnv();
  return buildBasicAuthHeaders(env.WORDPRESS_USERNAME, env.WORDPRESS_APP_PASSWORD, contentType);
}

async function getOrCreateTagIds(tagsValue: string) {
  const tagNames = Array.from(new Set(splitListInput(tagsValue).map((tag) => tag.trim()).filter(Boolean)));
  const tagIds: number[] = [];

  for (const tagName of tagNames) {
    const response = await fetch(wordpressApiUrl("/tags"), {
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

    throw new Error(`Tag sync failed for "${tagName}": ${response.status} ${rawBody}`);
  }

  return tagIds;
}

async function detectYoastMetaSupport(postId: number, expectedMetaDescription: string) {
  const response = await fetch(wordpressApiUrl(`/posts/${postId}?context=edit`), {
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
  const safeCaption = clampText(`Featured image for "${stripHtml(article.title)}".`, 220);
  const safeDescription = clampText(
    stripHtml(
      article.metaDescription ||
        article.excerpt ||
        `Featured image for ${article.title}.`,
    ),
    320,
  );

  return {
    alt_text: safeAltText,
    title: safeTitle,
    caption: safeCaption,
    description: safeDescription,
  };
}

async function syncFeaturedMediaMetadata(mediaId: number, article: Article) {
  const response = await fetch(wordpressApiUrl(`/media/${mediaId}`), {
    method: "POST",
    headers: createAuthHeaders(),
    body: JSON.stringify(buildMediaMetadata(article)),
  });

  if (!response.ok) {
    throw await buildWordPressError("Media metadata sync failed", response);
  }
}

async function uploadFeaturedMedia(article: Article) {
  if (!article.featuredImagePath || article.wpMediaId) {
    return article.wpMediaId ?? null;
  }

  const filePath = path.join(process.cwd(), "public", article.featuredImagePath.replace(/^\//, ""));
  const fileBuffer = await fs.readFile(filePath);
  const filename = path.basename(filePath);
  const response = await fetch(wordpressApiUrl("/media"), {
    method: "POST",
    headers: {
      ...createAuthHeaders(article.featuredImageMimeType ?? "image/png"),
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
    body: fileBuffer,
  });

  if (!response.ok) {
    throw await buildWordPressError("Media upload failed", response);
  }

  const media = (await response.json()) as { id: number };
  await prisma.article.update({
    where: { id: article.id },
    data: { wpMediaId: media.id },
  });

  return media.id;
}

type PublishMode = "draft" | "publish" | "future";

type WordPressSchedule = {
  localDateTime: string;
};

function toWordPressLocalDateTime(value: string) {
  return value.length === 16 ? `${value}:00` : value;
}

export async function pushArticleToWordPress(
  article: Article & { category: Category },
  mode: PublishMode,
  schedule?: WordPressSchedule | null,
) {
  const mediaId = await uploadFeaturedMedia(article);

  if (mediaId) {
    await syncFeaturedMediaMetadata(mediaId, article);
  }

  const htmlContent = await marked.parse(stripRawMarkdownHtml(article.contentMarkdown));
  const tagIds = await getOrCreateTagIds(article.tags);

  const body: Record<string, Prisma.JsonValue | string | number | number[] | null> = {
    title: article.title,
    slug: article.slug,
    content: htmlContent,
    excerpt: article.excerpt,
    categories: [article.category.wpCategoryId],
    tags: tagIds,
    status: mode,
    featured_media: mediaId,
    meta: {
      _yoast_wpseo_title: article.metaTitle,
      _yoast_wpseo_metadesc: article.metaDescription,
      _yoast_wpseo_focuskw: article.primaryKeyword,
    },
  };

  if (mode === "future" && schedule) {
    body.date = toWordPressLocalDateTime(schedule.localDateTime);
  }

  const endpoint = article.wpPostId
    ? wordpressApiUrl(`/posts/${article.wpPostId}`)
    : wordpressApiUrl("/posts");

  const response = await fetch(endpoint, {
    method: "POST",
    headers: createAuthHeaders(),
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw await buildWordPressError("WordPress post sync failed", response);
  }

  const payload = (await response.json()) as {
    id: number;
    status: string;
    date_gmt?: string;
    link?: string;
  };

  const yoastMetaApplied = await detectYoastMetaSupport(payload.id, article.metaDescription);

  return {
    ...payload,
    tagCount: tagIds.length,
    yoastMetaApplied,
  };
}
