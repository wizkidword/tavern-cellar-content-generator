import assert from "node:assert/strict";
import test from "node:test";

import {
  getComparisonCandidateOpenAITextModels,
  getComparisonTargetOpenAITextModel,
  getOpenAITextModelLabel,
  resolveOpenAITextModel,
} from "@/lib/openai-models";

test("picks nano as the comparison target for a mini source draft", () => {
  assert.equal(getComparisonTargetOpenAITextModel("gpt-5.4-mini"), "gpt-5.4-nano");
});

test("picks mini as the comparison target for a nano source draft", () => {
  assert.equal(getComparisonTargetOpenAITextModel("gpt-5.4-nano"), "gpt-5.4-mini");
});

test("uses a readable model label for comparison UI", () => {
  assert.equal(getOpenAITextModelLabel("gpt-5.4-nano"), "GPT-5.4 Nano");
});

test("uses mini as the comparison target for older source models", () => {
  assert.equal(getComparisonTargetOpenAITextModel("gpt-4.1"), "gpt-5.4-mini");
});

test("allows GPT-5.5 as a text generation model", () => {
  assert.equal(resolveOpenAITextModel("gpt-5.5"), "gpt-5.5");
  assert.equal(getOpenAITextModelLabel("gpt-5.5"), "GPT-5.5");
});

test("offers every non-source model as a comparison candidate", () => {
  assert.deepEqual(getComparisonCandidateOpenAITextModels("gpt-5.4-mini"), [
    "gpt-5.4-nano",
    "gpt-5.5",
  ]);
  assert.deepEqual(getComparisonCandidateOpenAITextModels("gpt-5.5"), [
    "gpt-5.4-nano",
    "gpt-5.4-mini",
  ]);
});
