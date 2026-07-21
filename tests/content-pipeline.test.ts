import test from "node:test";
import assert from "node:assert/strict";

import {
  getArticleImageAltWarnings,
  getArticleImageRecoveryState,
  getForcedPublishTimestamp,
  resolveArticleStatusFromWordPress,
} from "@/lib/content-pipeline";

test("forces a publish timestamp when converting a scheduled WordPress post to publish now", () => {
  const now = new Date("2026-06-12T18:56:00.000Z");

  assert.equal(
    getForcedPublishTimestamp(
      "publish",
      {
        status: "SCHEDULED",
        wpStatus: "future",
        wpPostId: 1422,
      },
      now,
    ),
    now,
  );
});

test("does not override dates for ordinary draft publishes", () => {
  const now = new Date("2026-06-12T18:56:00.000Z");

  assert.equal(
    getForcedPublishTimestamp(
      "publish",
      {
        status: "READY_FOR_REVIEW",
        wpStatus: "draft",
        wpPostId: 1422,
      },
      now,
    ),
    null,
  );
});

test("keeps local state scheduled when WordPress still returns future", () => {
  assert.equal(resolveArticleStatusFromWordPress("publish", "future"), "SCHEDULED");
});

test("marks local state published only when WordPress confirms publish", () => {
  assert.equal(resolveArticleStatusFromWordPress("publish", "publish"), "PUBLISHED");
});

test("uses structured image state for retries without touching editorial notes", () => {
  const state = getArticleImageRecoveryState({
    featuredImagePath: null,
    bodyImageCount: 0,
    notes: "Keep this operator note exactly as written.",
    featuredImageState: "FAILED",
    bodyImagesState: "CLEANUP_WARNING",
  });

  assert.equal(state.featuredImage.canRetry, true);
  assert.equal(state.featuredImage.reason, "failed");
  assert.equal(state.bodyImages.canRetry, true);
  assert.equal(state.bodyImages.reason, "failed");
});

test("warns when generated-image alt text is empty or repeated", () => {
  assert.deepEqual(
    getArticleImageAltWarnings({
      featuredImageAlt: "",
      bodyImageAlts: ["A neon arcade cabinet", "A neon arcade cabinet"],
    }),
    [
      "Every generated image needs concise descriptive alt text.",
      "Some image alt text is repeated. Give each visual its own description.",
    ],
  );
});

test("shows a retry state for missing images even without a stored failure note", () => {
  const state = getArticleImageRecoveryState({
    featuredImagePath: null,
    bodyImageCount: 0,
    notes: null,
  });

  assert.equal(state.featuredImage.canRetry, true);
  assert.equal(state.featuredImage.reason, "missing");
  assert.equal(state.bodyImages.canRetry, true);
  assert.equal(state.bodyImages.reason, "missing");
});
