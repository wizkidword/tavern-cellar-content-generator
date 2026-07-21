import assert from "node:assert/strict";
import test from "node:test";

import { renderSanitizedArticleHtml } from "@/lib/rendering/sanitize-html";

test("keeps approved article markup and removes unsafe HTML, links, and images", async () => {
  const html = await renderSanitizedArticleHtml({
    markdown: [
      "## A safe heading",
      "",
      "**Important** copy with an [unsafe link](javascript:alert(1)).",
      "",
      '<script>alert("do not run")</script>',
      "",
      '<a href="https://example.com" target="_blank" onclick="alert(1)">Safe link</a>',
      "",
      '<img src="https://unapproved.example/image.png" onerror="alert(1)" alt="bad">',
      "",
      "![Approved image](https://taverncellar.test/wp-content/uploads/approved.png)",
    ].join("\n"),
    approvedImageUrls: ["https://taverncellar.test/wp-content/uploads/approved.png"],
  });

  assert.match(html, /<h2>A safe heading<\/h2>/);
  assert.match(html, /<strong>Important<\/strong>/);
  assert.match(html, /href="https:\/\/example\.com"/);
  assert.match(html, /rel="noopener noreferrer"/);
  assert.match(html, /src="https:\/\/taverncellar\.test\/wp-content\/uploads\/approved\.png"/);
  assert.doesNotMatch(html, /<script|onclick=|onerror=|javascript:|unapproved\.example/i);
});

test("only accepts generated image paths that use the server filename convention", async () => {
  const html = await renderSanitizedArticleHtml({
    markdown: "![Allowed](/generated/article_123.png)\n\n![Rejected](/generated/../../secrets.png)",
  });

  assert.match(html, /src="\/generated\/article_123\.png"/);
  assert.doesNotMatch(html, /secrets\.png/);
});
