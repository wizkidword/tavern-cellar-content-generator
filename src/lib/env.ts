import { z } from "zod";

import {
  DEFAULT_OPENAI_TEXT_MODEL,
  OPENAI_TEXT_MODEL_IDS,
} from "@/lib/openai-models";
import {
  DEFAULT_FAL_IMAGE_MODEL,
  DEFAULT_FAL_IMAGE_QUALITY,
  DEFAULT_FEATURED_IMAGE_PROVIDER,
  DEFAULT_OPENAI_IMAGE_MODEL,
  FAL_IMAGE_MODEL_IDS,
  FAL_IMAGE_QUALITY_IDS,
  FEATURED_IMAGE_PROVIDER_IDS,
  OPENAI_IMAGE_MODEL_IDS,
} from "@/lib/featured-image-models";

const serverEnvSchema = z.object({
  DATABASE_URL: z.string().min(1),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_TEXT_MODEL: z.enum(OPENAI_TEXT_MODEL_IDS).default(DEFAULT_OPENAI_TEXT_MODEL),
  OPENAI_IMAGE_MODEL: z.enum(OPENAI_IMAGE_MODEL_IDS).default(DEFAULT_OPENAI_IMAGE_MODEL),
  FEATURED_IMAGE_PROVIDER: z
    .enum(FEATURED_IMAGE_PROVIDER_IDS)
    .default(DEFAULT_FEATURED_IMAGE_PROVIDER),
  FAL_KEY: z.string().optional(),
  FAL_IMAGE_MODEL: z.enum(FAL_IMAGE_MODEL_IDS).default(DEFAULT_FAL_IMAGE_MODEL),
  FAL_IMAGE_QUALITY: z.enum(FAL_IMAGE_QUALITY_IDS).default(DEFAULT_FAL_IMAGE_QUALITY),
  WORDPRESS_URL: z.string().url().default("https://taverncellar.com"),
  WORDPRESS_USERNAME: z.string().optional(),
  WORDPRESS_APP_PASSWORD: z.string().optional(),
  FOUNDRY_OPERATOR_TOKEN: z.string().optional(),
});

export function getServerEnv() {
  return serverEnvSchema.parse({
    DATABASE_URL: process.env.DATABASE_URL ?? "file:./dev.db",
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    OPENAI_TEXT_MODEL: process.env.OPENAI_TEXT_MODEL,
    OPENAI_IMAGE_MODEL: process.env.OPENAI_IMAGE_MODEL,
    FEATURED_IMAGE_PROVIDER: process.env.FEATURED_IMAGE_PROVIDER,
    FAL_KEY: process.env.FAL_KEY,
    FAL_IMAGE_MODEL: process.env.FAL_IMAGE_MODEL,
    FAL_IMAGE_QUALITY: process.env.FAL_IMAGE_QUALITY,
    WORDPRESS_URL: process.env.WORDPRESS_URL,
    WORDPRESS_USERNAME: process.env.WORDPRESS_USERNAME,
    WORDPRESS_APP_PASSWORD: process.env.WORDPRESS_APP_PASSWORD,
    FOUNDRY_OPERATOR_TOKEN: process.env.FOUNDRY_OPERATOR_TOKEN,
  });
}

export function requireOpenAIEnv() {
  const env = getServerEnv();

  if (!env.OPENAI_API_KEY) {
    throw new Error(
      "Add OPENAI_API_KEY to .env before generating articles or featured images.",
    );
  }

  return {
    ...env,
    OPENAI_API_KEY: env.OPENAI_API_KEY,
  };
}

export function requireFalEnv() {
  const env = getServerEnv();

  if (!env.FAL_KEY) {
    throw new Error("Add FAL_KEY to .env before generating featured images with fal.ai.");
  }

  return {
    ...env,
    FAL_KEY: env.FAL_KEY,
  };
}

export function requireWordPressAuthEnv() {
  const env = getServerEnv();

  if (!env.WORDPRESS_USERNAME || !env.WORDPRESS_APP_PASSWORD) {
    throw new Error(
      "Add WORDPRESS_USERNAME and WORDPRESS_APP_PASSWORD to .env before publishing or scheduling posts.",
    );
  }

  return {
    ...env,
    WORDPRESS_USERNAME: env.WORDPRESS_USERNAME,
    WORDPRESS_APP_PASSWORD: env.WORDPRESS_APP_PASSWORD,
  };
}
