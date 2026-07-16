export const OPENAI_TEXT_MODEL_IDS = [
  "gpt-5.4-nano",
  "gpt-5.4-mini",
  "gpt-5.5",
] as const;

export type OpenAITextModel = (typeof OPENAI_TEXT_MODEL_IDS)[number];

export const DEFAULT_OPENAI_TEXT_MODEL: OpenAITextModel = "gpt-5.4-mini";

export const OPENAI_TEXT_MODEL_OPTIONS: ReadonlyArray<{
  id: OpenAITextModel;
  label: string;
}> = [
  { id: "gpt-5.4-nano", label: "GPT-5.4 Nano" },
  { id: "gpt-5.4-mini", label: "GPT-5.4 Mini" },
  { id: "gpt-5.5", label: "GPT-5.5" },
];

export function isOpenAITextModel(value: unknown): value is OpenAITextModel {
  return (
    typeof value === "string" &&
    OPENAI_TEXT_MODEL_IDS.includes(value as OpenAITextModel)
  );
}

export function resolveOpenAITextModel(value: unknown): OpenAITextModel {
  if (value === undefined || value === null || value === "") {
    return DEFAULT_OPENAI_TEXT_MODEL;
  }

  if (isOpenAITextModel(value)) {
    return value;
  }

  throw new Error("Choose GPT-5.4 Nano, GPT-5.4 Mini, or GPT-5.5 before generating content.");
}

export function getOpenAITextModelLabel(value: string) {
  return (
    OPENAI_TEXT_MODEL_OPTIONS.find((option) => option.id === value)?.label ?? value
  );
}

export function getComparisonTargetOpenAITextModel(
  sourceModel: string,
): OpenAITextModel {
  if (sourceModel === "gpt-5.4-mini") {
    return "gpt-5.4-nano";
  }

  return "gpt-5.4-mini";
}

export function getComparisonCandidateOpenAITextModels(sourceModel: string) {
  return OPENAI_TEXT_MODEL_IDS.filter((model) => model !== sourceModel);
}
