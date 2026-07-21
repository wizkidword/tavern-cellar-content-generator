import assert from "node:assert/strict";
import test from "node:test";

import { AppError } from "@/lib/errors/app-error";
import { fetchWithPolicy } from "@/lib/http/fetch-policy";

test("retries a bounded WordPress read after a transient response", async () => {
  const originalFetch = global.fetch;
  let calls = 0;
  global.fetch = (async () => {
    calls += 1;
    return new Response("", { status: calls === 1 ? 503 : 200 });
  }) as typeof fetch;

  try {
    const response = await fetchWithPolicy(
      "https://taverncellar.test/wp-json/wp/v2/categories",
      { method: "GET" },
      { service: "wordpress", timeoutMs: 500, retries: 1 },
    );

    assert.equal(response.status, 200);
    assert.equal(calls, 2);
  } finally {
    global.fetch = originalFetch;
  }
});

test("does not retry a WordPress write when its caller sets no retries", async () => {
  const originalFetch = global.fetch;
  let calls = 0;
  global.fetch = (async () => {
    calls += 1;
    return new Response("", { status: 503 });
  }) as typeof fetch;

  try {
    const response = await fetchWithPolicy(
      "https://taverncellar.test/wp-json/wp/v2/posts",
      { method: "POST" },
      { service: "wordpress", timeoutMs: 500, retries: 0 },
    );

    assert.equal(response.status, 503);
    assert.equal(calls, 1);
  } finally {
    global.fetch = originalFetch;
  }
});

test("maps a timed out WordPress request to a stable retryable error", async () => {
  const originalFetch = global.fetch;
  global.fetch = ((_, init) =>
    new Promise((_, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
    })) as typeof fetch;

  try {
    await assert.rejects(
      () =>
        fetchWithPolicy(
          "https://taverncellar.test/wp-json/wp/v2/categories",
          { method: "GET" },
          { service: "wordpress", timeoutMs: 20, retries: 0 },
        ),
      (error) => error instanceof AppError && error.code === "WP_TIMEOUT" && error.retryable === false,
    );
  } finally {
    global.fetch = originalFetch;
  }
});

test("marks a timed out WordPress write as uncertain without retrying it", async () => {
  const originalFetch = global.fetch;
  global.fetch = ((_, init) =>
    new Promise((_, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
    })) as typeof fetch;

  try {
    await assert.rejects(
      () =>
        fetchWithPolicy(
          "https://taverncellar.test/wp-json/wp/v2/posts",
          { method: "POST" },
          { service: "wordpress", timeoutMs: 20, retries: 0, uncertainWrite: true },
        ),
      (error) => error instanceof AppError && error.code === "WP_WRITE_UNCERTAIN" && !error.retryable,
    );
  } finally {
    global.fetch = originalFetch;
  }
});
