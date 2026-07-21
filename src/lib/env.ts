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
import { hasStrongSessionSecret } from "@/lib/auth/session";
import type { OperatorAuthConfig } from "@/lib/auth/guards";

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
  SESSION_SECRET: z.string().optional(),
  SESSION_MAX_AGE_HOURS: z.coerce.number().int().min(1).max(168).default(12),
  APP_ORIGIN: z.string().url().default("http://127.0.0.1:3000"),
  TRUST_PROXY: z.enum(["true", "false"]).default("false"),
});

function isLocalHostname(hostname: string) {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname === "[::1]"
  );
}

export function validateWordPressUrl(value: string) {
  const url = new URL(value);

  if (url.protocol === "https:" || (url.protocol === "http:" && isLocalHostname(url.hostname))) {
    return url;
  }

  throw new Error("WORDPRESS_URL must use HTTPS unless it targets localhost for development.");
}

export function getServerEnv() {
  const env = serverEnvSchema.parse({
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
    SESSION_SECRET: process.env.SESSION_SECRET,
    SESSION_MAX_AGE_HOURS: process.env.SESSION_MAX_AGE_HOURS,
    APP_ORIGIN: process.env.APP_ORIGIN,
    TRUST_PROXY: process.env.TRUST_PROXY,
  });

  validateWordPressUrl(env.WORDPRESS_URL);
  return env;
}

export function getOperatorAuthConfig(): OperatorAuthConfig & {
  operatorToken: string;
  maxAgeSeconds: number;
  secureCookie: boolean;
} {
  const env = getServerEnv();
  const operatorToken = env.FOUNDRY_OPERATOR_TOKEN?.trim();
  const sessionSecret = env.SESSION_SECRET?.trim();

  if (!operatorToken || operatorToken.length < 16) {
    throw new Error("FOUNDRY_OPERATOR_TOKEN must be at least 16 characters before Foundry can start.");
  }

  if (!sessionSecret || !hasStrongSessionSecret(sessionSecret)) {
    throw new Error("SESSION_SECRET must contain at least 32 random bytes before Foundry can start.");
  }

  const parsedAppOrigin = new URL(env.APP_ORIGIN);

  if (parsedAppOrigin.protocol !== "http:" && parsedAppOrigin.protocol !== "https:") {
    throw new Error("APP_ORIGIN must use HTTP or HTTPS.");
  }

  const appOrigin = parsedAppOrigin.origin;

  return {
    appOrigin,
    maxAgeSeconds: env.SESSION_MAX_AGE_HOURS * 60 * 60,
    operatorToken,
    sessionSecret,
    secureCookie: appOrigin.startsWith("https://"),
  };
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
