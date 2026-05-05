import { z } from "zod";

const serverEnvSchema = z.object({
  DATABASE_URL: z.string().min(1),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_TEXT_MODEL: z.string().default("gpt-5.4-mini"),
  OPENAI_IMAGE_MODEL: z.string().default("gpt-image-2"),
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
