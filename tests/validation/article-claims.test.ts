import assert from "node:assert/strict";
import test from "node:test";

import { AppError } from "@/lib/errors/app-error";
import {
  articleClaimCreateFormSchema,
  articleClaimUpdateFormSchema,
  parseFormData,
} from "@/lib/validation/schemas";

function formData(values: Record<string, string>) {
  const result = new FormData();

  for (const [key, value] of Object.entries(values)) {
    result.set(key, value);
  }

  return result;
}

test("accepts optional https claim sources and explicit editorial states", () => {
  const input = parseFormData(
    articleClaimUpdateFormSchema,
    formData({
      claim: "The original broadcast aired in 1994 and changed the show's public profile.",
      sourceUrl: "https://example.com/archive",
      note: "Check the exact air date before publishing.",
      status: "VERIFIED",
    }),
  );

  assert.deepEqual(input, {
    claim: "The original broadcast aired in 1994 and changed the show's public profile.",
    sourceUrl: "https://example.com/archive",
    note: "Check the exact air date before publishing.",
    status: "VERIFIED",
  });
});

test("rejects unsafe claim source URLs and keeps a newly added claim open", () => {
  assert.throws(
    () =>
      parseFormData(
        articleClaimCreateFormSchema,
        formData({
          claim: "A claim that needs a source before it can be published.",
          sourceUrl: "javascript:alert(1)",
          note: "",
        }),
      ),
    (error) => error instanceof AppError && error.code === "VALIDATION_FAILED",
  );

  const input = parseFormData(
    articleClaimCreateFormSchema,
    formData({
      claim: "A claim that needs a source before it can be published.",
      sourceUrl: "",
      note: "",
    }),
  );

  assert.deepEqual(input, {
    claim: "A claim that needs a source before it can be published.",
    sourceUrl: "",
    note: "",
  });
});
