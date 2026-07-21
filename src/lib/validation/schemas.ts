import { z } from "zod";

import {
  FAL_IMAGE_MODEL_IDS,
  FEATURED_IMAGE_PROVIDER_IDS,
  OPENAI_IMAGE_MODEL_IDS,
} from "@/lib/featured-image-models";
import { OPENAI_TEXT_MODEL_IDS } from "@/lib/openai-models";
import { AppError } from "@/lib/errors/app-error";

const categoryId = z.coerce.number().int().positive();
const text = (maximum: number) => z.string().trim().max(maximum);
const requiredText = (maximum: number) => text(maximum).min(1);
const optionalText = (maximum: number) => text(maximum).default("");
const bodyImageCount = z.coerce.number().int().min(0).max(4).default(0);
const enabledCheckbox = z.preprocess((value) => value === "on" || value === "true" || value === true, z.boolean());

function isOptionalHttpUrl(value: string) {
  if (!value) {
    return true;
  }

  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

const imageSettings = {
  imageProvider: z.enum(FEATURED_IMAGE_PROVIDER_IDS),
  falImageModel: z.enum(FAL_IMAGE_MODEL_IDS),
  openAiImageModel: z.enum(OPENAI_IMAGE_MODEL_IDS),
};

export const generateArticleFormSchema = z.object({
  categoryId,
  primaryKeyword: requiredText(160),
  angle: requiredText(1_000),
  notes: optionalText(4_000),
  generateImage: enabledCheckbox,
  textModel: z.enum(OPENAI_TEXT_MODEL_IDS),
  bodyImageCount,
  ...imageSettings,
});

export const opportunityFormSchema = z.object({
  categoryId,
  primaryKeyword: requiredText(160),
  angle: requiredText(1_000),
  brief: requiredText(6_000),
});

export const wordpressCategoryFormSchema = z.object({
  categoryName: requiredText(100),
  categorySlug: text(100)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$|^$/, "Use lowercase letters, numbers, and hyphens for a slug.")
    .default(""),
  categoryDescription: optionalText(1_000),
});

export const categoryOnlyFormSchema = z.object({ categoryId });

export const articleGenerationSettingsSchema = z.object({
  generateImage: enabledCheckbox,
  textModel: z.enum(OPENAI_TEXT_MODEL_IDS),
  bodyImageCount,
  ...imageSettings,
});

export const articleReviewFormSchema = z.object({
  categoryId,
  title: requiredText(180),
  primaryKeyword: requiredText(160),
  slug: text(160).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers, and hyphens for a slug."),
  angle: requiredText(1_000),
  contentMarkdown: requiredText(120_000),
  scheduledFor: text(32).default(""),
  metaTitle: requiredText(70),
  metaDescription: requiredText(170),
  excerpt: requiredText(400),
  tags: text(1_000).default(""),
  internalLinks: text(4_000).default(""),
  featuredImagePrompt: requiredText(2_000),
  featuredImageAlt: requiredText(300),
  notes: optionalText(4_000),
  bodyImageCount,
  ...imageSettings,
  bodyImageProvider: z.enum(FEATURED_IMAGE_PROVIDER_IDS).optional(),
  bodyImageFalModel: z.enum(FAL_IMAGE_MODEL_IDS).optional(),
  bodyOpenAiImageModel: z.enum(OPENAI_IMAGE_MODEL_IDS).optional(),
});

export const comparisonFormSchema = z.object({
  comparisonModel: z.enum(OPENAI_TEXT_MODEL_IDS),
});

const articleClaimFields = {
  claim: requiredText(800).min(12),
  sourceUrl: text(2_048).refine(isOptionalHttpUrl, "Use a full http or https source URL.").default(""),
  note: optionalText(2_000),
};

export const articleClaimCreateFormSchema = z.object(articleClaimFields);

export const articleClaimUpdateFormSchema = z.object({
  ...articleClaimFields,
  status: z.enum(["OPEN", "VERIFIED", "DISMISSED"]),
});

export const keywordAssistSchema = z.object({
  categoryId,
  notes: optionalText(4_000),
});

export const angleAssistSchema = keywordAssistSchema.extend({
  primaryKeyword: requiredText(160),
});

function formDataRecord(formData: FormData) {
  return Object.fromEntries(
    Array.from(formData.entries()).map(([key, value]) => [key, typeof value === "string" ? value : ""]),
  );
}

export function parseFormData<T>(schema: z.ZodType<T>, formData: FormData): T {
  const parsed = schema.safeParse(formDataRecord(formData));

  if (!parsed.success) {
    throw new AppError("VALIDATION_FAILED", { cause: parsed.error });
  }

  return parsed.data;
}

export function parseRequestBody<T>(schema: z.ZodType<T>, body: unknown): T {
  const parsed = schema.safeParse(body);

  if (!parsed.success) {
    throw new AppError("VALIDATION_FAILED", { cause: parsed.error });
  }

  return parsed.data;
}
