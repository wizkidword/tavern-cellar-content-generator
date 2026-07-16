import test from "node:test";
import assert from "node:assert/strict";

import {
  buildImageGenerationFailureNote,
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

test("builds an actionable note when optional image generation fails", () => {
  const error = new Error("Unprocessable Entity");
  Object.assign(error, {
    status: 422,
    code: "unprocessable_entity",
  });

  const note = buildImageGenerationFailureNote({
    imageType: "Featured image",
    provider: "fal",
    model: "fal-ai/flux-2",
    error,
  });

  assert.match(note, /Featured image not generated/i);
  assert.match(note, /fal\.ai/i);
  assert.match(note, /fal-ai\/flux-2/i);
  assert.match(note, /422 Unprocessable Entity/i);
  assert.match(note, /Draft text was saved/i);
});

test("includes structured fal content policy details in image failure notes", () => {
  const error = new Error("Unprocessable Entity");
  Object.assign(error, {
    status: 422,
    body: {
      detail: [
        {
          loc: ["body", "prompt"],
          msg: "The content could not be processed because it contained material flagged by a content checker.",
          type: "content_policy_violation",
        },
      ],
    },
  });

  const note = buildImageGenerationFailureNote({
    imageType: "Featured image",
    provider: "fal",
    model: "fal-ai/flux-2-flex",
    error,
  });

  assert.match(note, /content_policy_violation/);
  assert.match(note, /content checker/);
  assert.match(note, /422/);
});

test("detects missing generated images that can be retried from review", () => {
  const state = getArticleImageRecoveryState({
    featuredImagePath: null,
    bodyImageCount: 0,
    notes: [
      "Featured image not generated: fal.ai using fal-ai/flux-2 returned 422 Unprocessable Entity.",
      "Article body images not generated: fal.ai using fal-ai/flux-2 returned 422 Unprocessable Entity.",
    ].join("\n\n"),
  });

  assert.equal(state.featuredImage.canRetry, true);
  assert.equal(state.featuredImage.reason, "failed");
  assert.equal(state.bodyImages.canRetry, true);
  assert.equal(state.bodyImages.reason, "failed");
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
