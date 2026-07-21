import assert from "node:assert/strict";
import test from "node:test";

import { AppError } from "@/lib/errors/app-error";
import { generateArticleFormSchema, parseFormData } from "@/lib/validation/schemas";

function generationFormData() {
  const formData = new FormData();
  const values = {
    categoryId: "12",
    primaryKeyword: "arcade cabinets",
    angle: "Why basement arcades endure",
    notes: "Use a nostalgic tone.",
    generateImage: "on",
    textModel: "gpt-5.4-mini",
    bodyImageCount: "1",
    imageProvider: "fal",
    falImageModel: "fal-ai/flux-2",
    openAiImageModel: "gpt-image-1.5",
  };

  for (const [key, value] of Object.entries(values)) {
    formData.set(key, value);
  }

  return formData;
}

test("parses bounded article generation input at the form boundary", () => {
  const parsed = parseFormData(generateArticleFormSchema, generationFormData());

  assert.equal(parsed.categoryId, 12);
  assert.equal(parsed.generateImage, true);
  assert.equal(parsed.bodyImageCount, 1);
});

test("accepts the licensed web-image plan while retaining the legacy AI checkbox", () => {
  const formData = generationFormData();
  formData.set("featuredImageMode", "licensed");

  const parsed = parseFormData(generateArticleFormSchema, formData);

  assert.equal(parsed.featuredImageMode, "licensed");
  assert.equal(parsed.generateImage, true);
});

test("rejects oversized article generation input with a stable error code", () => {
  const formData = generationFormData();
  formData.set("primaryKeyword", "x".repeat(161));

  assert.throws(
    () => parseFormData(generateArticleFormSchema, formData),
    (error) => error instanceof AppError && error.code === "VALIDATION_FAILED",
  );
});
