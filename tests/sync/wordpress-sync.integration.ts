import assert from "node:assert/strict";
import { after, test } from "node:test";

import { prisma } from "@/lib/db";
import { syncWordPressCatalog } from "@/lib/wordpress";

const originalFetch = global.fetch;
const originalWordPressUrl = process.env.WORDPRESS_URL;
const originalWordPressUsername = process.env.WORDPRESS_USERNAME;
const originalWordPressPassword = process.env.WORDPRESS_APP_PASSWORD;

function restoreEnvironment(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

function response(body: unknown, totalPages = 1) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "X-WP-TotalPages": String(totalPages) },
  });
}

function category(id: number) {
  return {
    id,
    count: 1,
    description: `Category ${id}`,
    name: `Category ${id}`,
    slug: `category-${id}`,
  };
}

function post(id: number, categoryId: number) {
  return {
    id,
    date: "2026-07-21T12:00:00",
    slug: `post-${id}`,
    link: `https://taverncellar.test/post-${id}`,
    status: "publish",
    categories: [categoryId],
    title: { rendered: `Post ${id}` },
    excerpt: { rendered: `Excerpt ${id}` },
  };
}

after(async () => {
  global.fetch = originalFetch;
  restoreEnvironment("WORDPRESS_URL", originalWordPressUrl);
  restoreEnvironment("WORDPRESS_USERNAME", originalWordPressUsername);
  restoreEnvironment("WORDPRESS_APP_PASSWORD", originalWordPressPassword);
  await prisma.$disconnect();
});

test("records full and public-only sync health without treating public coverage as complete", async () => {
  process.env.WORDPRESS_URL = "https://taverncellar.test";
  process.env.WORDPRESS_USERNAME = "editor";
  process.env.WORDPRESS_APP_PASSWORD = "app password";

  const oldCategory = await prisma.category.create({
    data: {
      wpCategoryId: 900,
      name: "Old Category",
      slug: "old-category",
      postCount: 1,
    },
  });
  await prisma.sitePost.create({
    data: {
      wpPostId: 900,
      title: "Old Post",
      normalizedTitle: "old post",
      slug: "old-post",
      canonicalTopicKey: "old-category-old-post",
      wpStatus: "private",
      primaryCategoryId: oldCategory.id,
      rawCategoryIds: "[900]",
    },
  });

  const privateCalls: string[] = [];
  global.fetch = (async (url, init) => {
    const requestUrl = String(url);
    privateCalls.push(requestUrl);
    assert.equal(new Headers(init?.headers).get("Authorization")?.startsWith("Basic "), true);
    const parsedUrl = new URL(requestUrl);
    const page = parsedUrl.searchParams.get("page");

    if (parsedUrl.pathname.endsWith("/categories")) {
      return response([category(Number(page) + 10)], 2);
    }

    if (parsedUrl.pathname.endsWith("/posts")) {
      return response([post(Number(page) + 100, Number(page) + 10)], 2);
    }

    if (parsedUrl.pathname.endsWith("/settings")) {
      return response({ timezone_string: "America/New_York" });
    }

    throw new Error(`Unexpected private request: ${requestUrl}`);
  }) as typeof fetch;

  const privateResult = await syncWordPressCatalog({ mode: "FULL_PRIVATE" });
  const completedPrivateRun = await prisma.wordPressSyncRun.findFirstOrThrow({ orderBy: { startedAt: "desc" } });
  const stalePost = await prisma.sitePost.findUniqueOrThrow({ where: { wpPostId: 900 } });
  const staleCategory = await prisma.category.findUniqueOrThrow({ where: { wpCategoryId: 900 } });

  assert.equal(privateResult.state, "SUCCEEDED");
  assert.equal(privateResult.siteTimezone, "America/New_York");
  assert.equal(privateCalls.length, 5);
  assert.equal(completedPrivateRun.categoryCount, 2);
  assert.equal(completedPrivateRun.postCount, 2);
  assert.equal(completedPrivateRun.pageCount, 4);
  assert.equal(completedPrivateRun.siteTimezone, "America/New_York");
  assert.equal(stalePost.isStale, true);
  assert.equal(staleCategory.isStale, true);

  const publicCalls: string[] = [];
  global.fetch = (async (url, init) => {
    const requestUrl = String(url);
    publicCalls.push(requestUrl);
    assert.equal(new Headers(init?.headers).get("Authorization"), null);
    const parsedUrl = new URL(requestUrl);

    if (parsedUrl.pathname.endsWith("/categories")) {
      return response([category(11)]);
    }

    if (parsedUrl.pathname.endsWith("/posts")) {
      return response([post(101, 11)]);
    }

    throw new Error(`Unexpected public request: ${requestUrl}`);
  }) as typeof fetch;

  const publicResult = await syncWordPressCatalog({ mode: "PUBLIC_ONLY" });
  const publicRun = await prisma.wordPressSyncRun.findFirstOrThrow({ orderBy: { startedAt: "desc" } });
  const fullOnlyPost = await prisma.sitePost.findUniqueOrThrow({ where: { wpPostId: 102 } });
  const retainedStalePost = await prisma.sitePost.findUniqueOrThrow({ where: { wpPostId: 900 } });

  assert.equal(publicResult.state, "DEGRADED");
  assert.equal(publicCalls.length, 2);
  assert.ok(publicCalls.every((url) => !url.includes("status=")));
  assert.equal(publicRun.mode, "PUBLIC_ONLY");
  assert.equal(publicRun.state, "DEGRADED");
  assert.equal(fullOnlyPost.isStale, false);
  assert.equal(retainedStalePost.isStale, true);

  global.fetch = (async (url) => {
    const requestUrl = String(url);
    const page = new URL(requestUrl).searchParams.get("page");

    return page === "1"
      ? response([category(11)], 2)
      : new Response(JSON.stringify({ code: "rest_not_logged_in" }), { status: 401 });
  }) as typeof fetch;

  await assert.rejects(() => syncWordPressCatalog({ mode: "FULL_PRIVATE" }));
  const failedRun = await prisma.wordPressSyncRun.findFirstOrThrow({ orderBy: { startedAt: "desc" } });
  assert.equal(failedRun.mode, "FULL_PRIVATE");
  assert.equal(failedRun.state, "FAILED");
  assert.equal(failedRun.errorCode, "WP_AUTH_FAILED");
  assert.ok(failedRun.errorCorrelationId);
});
