import test from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";

import { AppError } from "@/lib/errors/app-error";
import {
  buildWordPressPostContentHtml,
  buildWordPressPostTimingFields,
  createWordPressCategory,
  parseWordPressScheduledDate,
  pushArticleToWordPress,
} from "@/lib/wordpress";

test("places the uploaded featured image at the top of the WordPress post content", async () => {
  const html = await buildWordPressPostContentHtml({
    contentMarkdown: "## Opening\n\nBody copy follows the image.",
    featuredImage: {
      mediaId: 42,
      sourceUrl: "https://taverncellar.test/wp-content/uploads/hero.png",
      altText: 'A neon tavern sign & "cellar" doorway',
    },
  });

  assert.ok(html.trimStart().startsWith('<figure class="wp-block-image size-full">'));
  assert.match(html, /class="wp-image-42"/);
  assert.match(html, /src="https:\/\/taverncellar\.test\/wp-content\/uploads\/hero\.png"/);
  assert.match(html, /alt="A neon tavern sign &amp; &quot;cellar&quot; doorway"/);
  assert.ok(html.indexOf("wp-image-42") < html.indexOf("<h2>Opening</h2>"));
});

test("leaves WordPress post content unchanged when there is no featured image URL", async () => {
  const html = await buildWordPressPostContentHtml({
    contentMarkdown: "## Opening\n\nBody copy follows.",
    featuredImage: null,
  });

  assert.doesNotMatch(html, /wp:image/);
  assert.match(html, /^<h2>Opening<\/h2>/);
});

test("replaces generated body image markdown with uploaded WordPress media blocks", async () => {
  const html = await buildWordPressPostContentHtml({
    contentMarkdown: [
      "## Opening",
      "",
      "Body copy follows.",
      "",
      "![A glowing VHS shelf](/generated/body-image.png)",
      "",
      "## Next Section",
      "",
      "More body copy.",
    ].join("\n"),
    featuredImage: null,
    bodyImages: [
      {
        publicPath: "/generated/body-image.png",
        mediaId: 77,
        sourceUrl: "https://taverncellar.test/wp-content/uploads/body-image.png",
        altText: "A glowing VHS shelf",
      },
    ],
  });

  assert.match(html, /class="wp-image-77"/);
  assert.match(html, /src="https:\/\/taverncellar\.test\/wp-content\/uploads\/body-image\.png"/);
  assert.doesNotMatch(html, /src="\/generated\/body-image\.png"/);
  assert.ok(html.indexOf("<h2>Opening</h2>") < html.indexOf("wp-image-77"));
  assert.ok(html.indexOf("wp-image-77") < html.indexOf("<h2>Next Section</h2>"));
});

test("sends explicit local and GMT schedule fields to WordPress", () => {
  const fields = buildWordPressPostTimingFields({
    mode: "future",
    schedule: {
      localDateTime: "2026-06-12T14:00",
      utcDateTime: new Date("2026-06-12T18:00:00.000Z"),
    },
  });

  assert.deepEqual(fields, {
    date: "2026-06-12T14:00:00",
    date_gmt: "2026-06-12T18:00:00",
  });
});

test("can clear a scheduled future timestamp when forcing publish now", () => {
  const fields = buildWordPressPostTimingFields({
    mode: "publish",
    publishAt: new Date("2026-06-12T18:56:00.000Z"),
  });

  assert.deepEqual(fields, {
    date_gmt: "2026-06-12T18:56:00",
  });
});

test("prefers WordPress GMT dates when reading scheduled post times", () => {
  const parsed = parseWordPressScheduledDate({
    date: "2026-06-12T14:00:00",
    date_gmt: "2026-06-12T18:00:00",
  });

  assert.equal(parsed?.toISOString(), "2026-06-12T18:00:00.000Z");
});

test("ignores invalid WordPress scheduled date values", () => {
  assert.equal(
    parseWordPressScheduledDate({
      date: "not-a-date",
      date_gmt: "",
    }),
    null,
  );
});

test("maps HTML media upload failures to a stable error without leaking the response", async () => {
  const originalFetch = global.fetch;
  const originalWordPressUrl = process.env.WORDPRESS_URL;
  const originalWordPressUsername = process.env.WORDPRESS_USERNAME;
  const originalWordPressPassword = process.env.WORDPRESS_APP_PASSWORD;
  const imagePath = path.join(process.cwd(), "public", "generated", "test-upload-error.png");
  const htmlError = [
    "<!DOCTYPE html>",
    "<html>",
    "<head><title>403 Forbidden</title></head>",
    "<body>",
    "<h1>Forbidden</h1>",
    "<p>",
    "Security plugin response ".repeat(120),
    "</p>",
    "</body>",
    "</html>",
  ].join("");

  process.env.WORDPRESS_URL = "https://taverncellar.test";
  process.env.WORDPRESS_USERNAME = "editor";
  process.env.WORDPRESS_APP_PASSWORD = "app password";
  await fs.mkdir(path.dirname(imagePath), { recursive: true });
  await fs.writeFile(imagePath, Buffer.from("fake image bytes"));

  global.fetch = (async () =>
    new Response(htmlError, {
      status: 403,
      statusText: "Forbidden",
      headers: { "Content-Type": "text/html; charset=UTF-8" },
    })) as typeof fetch;

  try {
    await assert.rejects(
      () =>
        pushArticleToWordPress(
          {
            id: "article-with-blocked-media",
            title: "Blocked media upload article",
            slug: "blocked-media-upload-article",
            contentMarkdown: "## Opening\n\nBody copy.",
            excerpt: "Body copy.",
            tags: "",
            metaTitle: "Blocked media upload article",
            metaDescription: "Body copy.",
            primaryKeyword: "blocked media upload",
            featuredImagePath: "/generated/test-upload-error.png",
            featuredImageMimeType: "image/png",
            featuredImageAlt: "Blocked media upload image",
            wpMediaId: null,
            wpPostId: null,
            category: {
              wpCategoryId: 12,
            },
            bodyImages: [],
          } as never,
          "future",
          {
            localDateTime: "2026-06-13T15:30",
            utcDateTime: new Date("2026-06-13T19:30:00.000Z"),
          },
        ),
      (error) => {
        assert.ok(error instanceof AppError);
        assert.equal(error.code, "WP_RESPONSE_INVALID");
        assert.doesNotMatch(error.message, /<!DOCTYPE|<html|Security plugin response/i);
        assert.equal(error.message, "WordPress could not complete that request.");
        return true;
      },
    );
  } finally {
    global.fetch = originalFetch;
    process.env.WORDPRESS_URL = originalWordPressUrl;
    process.env.WORDPRESS_USERNAME = originalWordPressUsername;
    process.env.WORDPRESS_APP_PASSWORD = originalWordPressPassword;
    await fs.rm(imagePath, { force: true });
  }
});

test("creates WordPress categories with authenticated REST requests", async () => {
  const originalFetch = global.fetch;
  const originalWordPressUrl = process.env.WORDPRESS_URL;
  const originalWordPressUsername = process.env.WORDPRESS_USERNAME;
  const originalWordPressPassword = process.env.WORDPRESS_APP_PASSWORD;
  let capturedUrl = "";
  let capturedInit: RequestInit | undefined;

  process.env.WORDPRESS_URL = "https://taverncellar.test";
  process.env.WORDPRESS_USERNAME = "editor";
  process.env.WORDPRESS_APP_PASSWORD = "app password";
  global.fetch = (async (url, init) => {
    capturedUrl = String(url);
    capturedInit = init;

    return new Response(
      JSON.stringify({
        id: 321,
        count: 0,
        description: "Board game coverage.",
        name: "Tabletop Games",
        slug: "tabletop-games",
      }),
      {
        status: 201,
        headers: { "Content-Type": "application/json" },
      },
    );
  }) as typeof fetch;

  try {
    const category = await createWordPressCategory({
      name: " Tabletop Games ",
      slug: " tabletop-games ",
      description: " Board game coverage. ",
    });

    assert.equal(capturedUrl, "https://taverncellar.test/wp-json/wp/v2/categories");
    assert.equal(capturedInit?.method, "POST");
    assert.match(
      String((capturedInit?.headers as Record<string, string>)?.Authorization),
      /^Basic /,
    );
    assert.deepEqual(JSON.parse(String(capturedInit?.body)), {
      name: "Tabletop Games",
      slug: "tabletop-games",
      description: "Board game coverage.",
    });
    assert.equal(category.id, 321);
    assert.equal(category.slug, "tabletop-games");
  } finally {
    global.fetch = originalFetch;
    process.env.WORDPRESS_URL = originalWordPressUrl;
    process.env.WORDPRESS_USERNAME = originalWordPressUsername;
    process.env.WORDPRESS_APP_PASSWORD = originalWordPressPassword;
  }
});
