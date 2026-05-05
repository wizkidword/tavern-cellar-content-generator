import OpenAI from "openai";
import { promises as fs } from "node:fs";
import path from "node:path";
import { z } from "zod";

import { requireOpenAIEnv } from "@/lib/env";
import { listToCommaSeparated, listToMultiline, slugify } from "@/lib/topic-utils";

const articlePayloadSchema = z.object({
  title: z.string().min(12),
  angle: z.string().min(12),
  primaryKeyword: z.string().min(3),
  slug: z.string().min(5),
  metaTitle: z.string().min(20).max(70),
  metaDescription: z.string().min(70).max(170),
  excerpt: z.string().min(70).max(240),
  tags: z.array(z.string().min(2)).min(3).max(8),
  internalLinks: z.array(z.string().min(6)).min(3).max(8),
  featuredImagePrompt: z.string().min(40),
  featuredImageAlt: z.string().min(10),
  contentMarkdown: z.string().min(1200),
});

const keywordIdeasSchema = z.object({
  suggestions: z.array(z.string().min(2)).min(4).max(8),
});

const angleIdeasSchema = z.object({
  suggestions: z.array(z.string().min(12)).min(3).max(6),
});

const articleResponseSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    title: { type: "string" },
    angle: { type: "string" },
    primaryKeyword: { type: "string" },
    slug: { type: "string" },
    metaTitle: { type: "string" },
    metaDescription: { type: "string" },
    excerpt: { type: "string" },
    tags: {
      type: "array",
      items: { type: "string" },
      minItems: 3,
      maxItems: 8,
    },
    internalLinks: {
      type: "array",
      items: { type: "string" },
      minItems: 3,
      maxItems: 8,
    },
    featuredImagePrompt: { type: "string" },
    featuredImageAlt: { type: "string" },
    contentMarkdown: { type: "string" },
  },
  required: [
    "title",
    "angle",
    "primaryKeyword",
    "slug",
    "metaTitle",
    "metaDescription",
    "excerpt",
    "tags",
    "internalLinks",
    "featuredImagePrompt",
    "featuredImageAlt",
    "contentMarkdown",
  ],
} as const;

type GenerateArticleInput = {
  categoryName: string;
  categorySlug: string;
  primaryKeyword: string;
  angle: string;
  notes?: string;
  recentTitles: string[];
};

export type GeneratedArticleDraft = z.infer<typeof articlePayloadSchema> & {
  tagsText: string;
  internalLinksText: string;
  textModel: string;
};

export type SuggestedKeywordIdeas = {
  suggestions: string[];
  textModel: string;
};

export type SuggestedAngleIdeas = {
  suggestions: string[];
  textModel: string;
};

function clampText(value: string, maxLength: number) {
  const normalized = value.replace(/\s+/g, " ").trim();

  if (normalized.length <= maxLength) {
    return normalized;
  }

  const sliced = normalized.slice(0, maxLength + 1);
  const lastSpace = sliced.lastIndexOf(" ");

  if (lastSpace > Math.floor(maxLength * 0.6)) {
    return sliced.slice(0, lastSpace).trim();
  }

  return normalized.slice(0, maxLength).trim();
}

function getClient() {
  const env = requireOpenAIEnv();

  return {
    client: new OpenAI({ apiKey: env.OPENAI_API_KEY }),
    textModel: env.OPENAI_TEXT_MODEL,
    imageModel: env.OPENAI_IMAGE_MODEL,
  };
}

export async function generateArticleDraft(input: GenerateArticleInput): Promise<GeneratedArticleDraft> {
  const { client, textModel } = getClient();

  const response = await client.responses.create({
    model: textModel,
    instructions: [
      "You are Tavern Cellar's editorial SEO engine.",
      "Write original, search-intent-aware long-form content with a strong human voice.",
      "Avoid generic AI phrasing, filler intros, and duplicate angles.",
      "Favor specific observations, crisp subheads, and a clear editorial throughline.",
      "Return valid JSON that matches the schema exactly.",
    ].join(" "),
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: [
              `Site category: ${input.categoryName} (${input.categorySlug})`,
              `Primary keyword: ${input.primaryKeyword}`,
              `Requested angle: ${input.angle}`,
              input.notes ? `Additional notes: ${input.notes}` : null,
              "Write a full SEO-friendly blog article for taverncellar.com.",
              "The article should feel publishable without sounding robotic.",
              "Treat the primary keyword as the focus keyphrase and make sure the title, meta title, and meta description align with it naturally.",
              "Optimize for practical on-page SEO first, not generic readability scoring.",
              "Include the exact focus keyphrase in the opening paragraph, in at least one H2, in the SEO title, in the meta description, in the slug, and in the featured image alt text.",
              "Use the exact focus keyphrase naturally throughout the article without stuffing it. Aim for clear topical reinforcement rather than awkward repetition.",
              "Keep the SEO title compelling and under 70 characters. Keep the meta description persuasive and under 170 characters.",
              "Make the excerpt search-friendly and make the tag list specific enough to be useful in WordPress.",
              "Use markdown with clear H2/H3 hierarchy, concise paragraphs, and at least one bullet list where helpful.",
              "Do not include frontmatter, disclaimers, or placeholder citations.",
              "Suggested length: 1,300 to 1,900 words.",
              "For tags, return only concise WordPress-ready tag names, not hashtags.",
              "For internal links, return likely Tavern Cellar article topics or slugs that would make sense to link to from this post.",
              "For the featured image prompt, describe a clean editorial hero image with one dominant focal scene.",
              "For featured image alt text, describe the actual visible scene plainly and specifically, avoid vague labels like collage unless the image is truly a collage, and include the focus keyphrase naturally when it fits.",
              "Explicitly avoid visible text, letters, logos, labels, watermarks, interface copy, book covers with readable titles, or busy repeated collage layouts.",
              "Avoid duplicating or closely mirroring these existing titles:",
              ...input.recentTitles.map((title, index) => `${index + 1}. ${title}`),
            ]
              .filter(Boolean)
              .join("\n"),
          },
        ],
      },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "tavern_cellar_article",
        strict: true,
        schema: articleResponseSchema,
      },
    },
  });

  const raw = JSON.parse(response.output_text) as Record<string, unknown>;
  const normalized = {
    ...raw,
    metaTitle:
      typeof raw.metaTitle === "string" ? clampText(raw.metaTitle, 70) : raw.metaTitle,
    metaDescription:
      typeof raw.metaDescription === "string"
        ? clampText(raw.metaDescription, 170)
        : raw.metaDescription,
    excerpt:
      typeof raw.excerpt === "string" ? clampText(raw.excerpt, 240) : raw.excerpt,
  };
  const parsed = articlePayloadSchema.parse(normalized);

  return {
    ...parsed,
    slug: slugify(parsed.slug || parsed.title),
    tagsText: listToCommaSeparated(parsed.tags),
    internalLinksText: listToMultiline(parsed.internalLinks),
    textModel,
  };
}

export async function generatePrimaryKeywordIdeas(input: {
  categoryName: string;
  categorySlug: string;
  notes?: string;
  recentTitles: string[];
}): Promise<SuggestedKeywordIdeas> {
  const { client, textModel } = getClient();

  const response = await client.responses.create({
    model: textModel,
    instructions: [
      "You are Tavern Cellar's content planning assistant.",
      "Generate concise, search-friendly primary keyword ideas for a blog article.",
      "Favor topics that can support a full article and feel natural for the chosen category.",
      "Avoid duplicate or near-duplicate coverage.",
      "Return valid JSON that matches the schema exactly.",
    ].join(" "),
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: [
              `Site category: ${input.categoryName} (${input.categorySlug})`,
              input.notes ? `Editorial notes: ${input.notes}` : null,
              "Return 5 primary keyword ideas.",
              "Keywords can be exact franchise names, film titles, topic phrases, or search phrases that fit Tavern Cellar.",
              "Do not return article titles or long headlines.",
              "Avoid duplicating or closely mirroring these existing titles:",
              ...input.recentTitles.map((title, index) => `${index + 1}. ${title}`),
            ]
              .filter(Boolean)
              .join("\n"),
          },
        ],
      },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "tavern_cellar_keyword_ideas",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            suggestions: {
              type: "array",
              items: { type: "string" },
              minItems: 4,
              maxItems: 8,
            },
          },
          required: ["suggestions"],
        },
      },
    },
  });

  const parsed = keywordIdeasSchema.parse(JSON.parse(response.output_text) as Record<string, unknown>);

  return {
    suggestions: parsed.suggestions.map((suggestion) => suggestion.trim()).filter(Boolean),
    textModel,
  };
}

export async function generateAngleIdeas(input: {
  categoryName: string;
  categorySlug: string;
  primaryKeyword: string;
  notes?: string;
  recentTitles: string[];
}): Promise<SuggestedAngleIdeas> {
  const { client, textModel } = getClient();

  const response = await client.responses.create({
    model: textModel,
    instructions: [
      "You are Tavern Cellar's editorial angle assistant.",
      "Generate strong article angles that can lead to a full SEO-friendly draft.",
      "Favor angles with a clear hook, direction, and editorial payoff.",
      "Avoid generic summaries and avoid duplicate coverage.",
      "Return valid JSON that matches the schema exactly.",
    ].join(" "),
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: [
              `Site category: ${input.categoryName} (${input.categorySlug})`,
              `Primary keyword: ${input.primaryKeyword}`,
              input.notes ? `Editorial notes: ${input.notes}` : null,
              "Return 4 article angle ideas.",
              "Each suggestion should be one or two sentences and specific enough to guide a full article draft.",
              "Use the primary keyword naturally in the angle where it helps.",
              "Avoid duplicating or closely mirroring these existing titles:",
              ...input.recentTitles.map((title, index) => `${index + 1}. ${title}`),
            ]
              .filter(Boolean)
              .join("\n"),
          },
        ],
      },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "tavern_cellar_angle_ideas",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            suggestions: {
              type: "array",
              items: { type: "string" },
              minItems: 3,
              maxItems: 6,
            },
          },
          required: ["suggestions"],
        },
      },
    },
  });

  const parsed = angleIdeasSchema.parse(JSON.parse(response.output_text) as Record<string, unknown>);

  return {
    suggestions: parsed.suggestions.map((suggestion) => suggestion.trim()).filter(Boolean),
    textModel,
  };
}

export async function generateFeaturedImageAsset(articleId: string, prompt: string) {
  const { client, imageModel } = getClient();
  const imageResponse = await client.images.generate({
    model: imageModel,
    prompt: [
      prompt,
      "Create a single clean editorial hero image.",
      "No visible text, lettering, typography, logos, labels, captions, watermarks, or interface words.",
      "Avoid repeated tiles, crowded collage compositions, book-cover grids, and cluttered poster walls.",
      "Prefer one strong focal subject, restrained supporting details, and cinematic lighting.",
    ].join(" "),
    size: "1536x1024",
  });

  const image = imageResponse.data?.[0];

  if (!image?.b64_json) {
    throw new Error("The image model did not return base64 image data.");
  }

  const outputDirectory = path.join(process.cwd(), "public", "generated");
  const filename = `${articleId}-${Date.now()}.png`;
  const fullPath = path.join(outputDirectory, filename);

  await fs.mkdir(outputDirectory, { recursive: true });
  await fs.writeFile(fullPath, Buffer.from(image.b64_json, "base64"));

  return {
    imageModel,
    publicPath: `/generated/${filename}`,
    mimeType: "image/png",
  };
}

export async function deleteGeneratedImageAsset(publicPath?: string | null) {
  if (!publicPath?.startsWith("/generated/")) {
    return;
  }

  const generatedDirectory = path.resolve(process.cwd(), "public", "generated");
  const fullPath = path.resolve(process.cwd(), "public", publicPath.replace(/^\//, ""));

  if (!fullPath.startsWith(`${generatedDirectory}${path.sep}`)) {
    return;
  }

  try {
    await fs.unlink(fullPath);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return;
    }

    throw error;
  }
}
