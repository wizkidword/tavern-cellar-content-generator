import assert from "node:assert/strict";
import test from "node:test";

import { AppError } from "@/lib/errors/app-error";
import { fetchAllWordPressPosts } from "@/lib/wordpress";
import { formatDateTimeInWordPressTimeZone } from "@/lib/wordpress-timezone";

type EnvironmentSnapshot = Record<string, string | undefined>;

function saveEnvironment(names: string[]): EnvironmentSnapshot {
  return Object.fromEntries(names.map((name) => [name, process.env[name]]));
}

function restoreEnvironment(snapshot: EnvironmentSnapshot) {
  for (const [name, value] of Object.entries(snapshot)) {
    if (value === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = value;
    }
  }
}

function post(id: number) {
  return {
    id,
    date: "2026-07-21T12:00:00",
    slug: `post-${id}`,
    link: `https://taverncellar.test/post-${id}`,
    status: "publish",
    categories: [12],
    title: { rendered: `Post ${id}` },
    excerpt: { rendered: `Excerpt ${id}` },
  };
}

function jsonResponse(body: unknown, totalPages = 1, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "X-WP-TotalPages": String(totalPages) },
  });
}

test("fully paginates private WordPress posts with one authenticated scope", async () => {
  const originalFetch = global.fetch;
  const environment = saveEnvironment(["WORDPRESS_URL"]);
  const calls: Array<{ url: string; authorization: string | null }> = [];
  process.env.WORDPRESS_URL = "https://taverncellar.test";
  global.fetch = (async (url, init) => {
    const requestUrl = String(url);
    const headers = new Headers(init?.headers);
    calls.push({ url: requestUrl, authorization: headers.get("Authorization") });
    const page = new URL(requestUrl).searchParams.get("page");

    return jsonResponse([post(Number(page))], 2);
  }) as typeof fetch;

  try {
    const result = await fetchAllWordPressPosts({
      mode: "FULL_PRIVATE",
      headers: { Authorization: "Basic integration-test" },
    });

    assert.deepEqual(result.posts.map((record) => record.id), [1, 2]);
    assert.equal(result.pageCount, 2);
    assert.equal(calls.length, 2);
    assert.ok(calls.every((call) => /status=publish.*private/.test(call.url)));
    assert.ok(calls.every((call) => call.authorization === "Basic integration-test"));
  } finally {
    global.fetch = originalFetch;
    restoreEnvironment(environment);
  }
});

test("does not fall back to public posts when private authentication fails on the first page", async () => {
  const originalFetch = global.fetch;
  const environment = saveEnvironment(["WORDPRESS_URL"]);
  const calls: string[] = [];
  process.env.WORDPRESS_URL = "https://taverncellar.test";
  global.fetch = (async (url) => {
    calls.push(String(url));
    return new Response(JSON.stringify({ code: "rest_not_logged_in" }), { status: 401 });
  }) as typeof fetch;

  try {
    await assert.rejects(
      () => fetchAllWordPressPosts({ mode: "FULL_PRIVATE", headers: { Authorization: "Basic test" } }),
      (error) => error instanceof AppError && error.code === "WP_AUTH_FAILED",
    );
    assert.equal(calls.length, 1);
    assert.match(calls[0] ?? "", /status=publish.*private/);
  } finally {
    global.fetch = originalFetch;
    restoreEnvironment(environment);
  }
});

test("records a private-auth failure after an earlier page without switching scope", async () => {
  const originalFetch = global.fetch;
  const environment = saveEnvironment(["WORDPRESS_URL"]);
  const calls: string[] = [];
  process.env.WORDPRESS_URL = "https://taverncellar.test";
  global.fetch = (async (url) => {
    const requestUrl = String(url);
    calls.push(requestUrl);

    return new URL(requestUrl).searchParams.get("page") === "1"
      ? jsonResponse([post(1)], 2)
      : new Response(JSON.stringify({ code: "rest_not_logged_in" }), { status: 401 });
  }) as typeof fetch;

  try {
    await assert.rejects(
      () => fetchAllWordPressPosts({ mode: "FULL_PRIVATE", headers: { Authorization: "Basic test" } }),
      (error) => error instanceof AppError && error.code === "WP_AUTH_FAILED",
    );
    assert.equal(calls.length, 2);
    assert.ok(calls.every((url) => /status=publish.*private/.test(url)));
  } finally {
    global.fetch = originalFetch;
    restoreEnvironment(environment);
  }
});

test("starts public-only synchronization at page one instead of mixing it with private pages", async () => {
  const originalFetch = global.fetch;
  const environment = saveEnvironment(["WORDPRESS_URL"]);
  const calls: string[] = [];
  process.env.WORDPRESS_URL = "https://taverncellar.test";
  global.fetch = (async (url) => {
    const requestUrl = String(url);
    calls.push(requestUrl);
    const query = new URL(requestUrl).searchParams;
    const isPrivate = query.has("status");
    const page = query.get("page");

    return jsonResponse([post(isPrivate ? Number(page) : 99)], isPrivate ? 2 : 1);
  }) as typeof fetch;

  try {
    await fetchAllWordPressPosts({ mode: "FULL_PRIVATE", headers: { Authorization: "Basic test" } });
    const publicResult = await fetchAllWordPressPosts({ mode: "PUBLIC_ONLY" });

    assert.equal(publicResult.posts[0]?.id, 99);
    assert.equal(calls.length, 3);
    assert.match(calls[0] ?? "", /page=1/);
    assert.match(calls[1] ?? "", /page=2/);
    assert.match(calls[2] ?? "", /page=1/);
    assert.doesNotMatch(calls[2] ?? "", /status=/);
  } finally {
    global.fetch = originalFetch;
    restoreEnvironment(environment);
  }
});

test("converts one stored UTC instant to the exact WordPress local schedule target", () => {
  const instant = new Date("2026-07-21T18:30:00.000Z");

  assert.equal(formatDateTimeInWordPressTimeZone(instant, "America/New_York"), "2026-07-21T14:30");
  assert.equal(formatDateTimeInWordPressTimeZone(instant, "UTC+05:30"), "2026-07-22T00:00");
  assert.equal(formatDateTimeInWordPressTimeZone(instant, "not-a-time-zone"), null);
});
