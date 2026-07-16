import { fal } from "@fal-ai/client";
import OpenAI from "openai";
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import sharp from "sharp";

import { getServerEnv, requireFalEnv, requireOpenAIEnv } from "@/lib/env";
import {
  DEFAULT_FAL_IMAGE_MODEL,
  DEFAULT_FAL_IMAGE_QUALITY,
  DEFAULT_FEATURED_IMAGE_PROVIDER,
  DEFAULT_OPENAI_IMAGE_MODEL,
  FAL_IMAGE_MODEL_IDS,
  FAL_IMAGE_MODEL_OPTIONS,
  type FalImageQuality,
  type FalImageModel,
  FEATURED_IMAGE_HEIGHT,
  FEATURED_IMAGE_PROVIDER_IDS,
  FEATURED_IMAGE_PROVIDER_OPTIONS,
  FEATURED_IMAGE_WIDTH,
  type FeaturedImageProvider,
  OPENAI_IMAGE_MODEL_IDS,
  OPENAI_IMAGE_MODEL_OPTIONS,
  type OpenAIImageModel,
  resolveFalImageModel,
  resolveFalImageQuality,
  resolveFeaturedImageProvider,
  resolveOpenAIImageModel,
} from "@/lib/featured-image-models";

export {
  DEFAULT_FAL_IMAGE_MODEL,
  DEFAULT_FAL_IMAGE_QUALITY,
  DEFAULT_FEATURED_IMAGE_PROVIDER,
  DEFAULT_OPENAI_IMAGE_MODEL,
  FAL_IMAGE_MODEL_IDS,
  FAL_IMAGE_MODEL_OPTIONS,
  type FalImageQuality,
  type FalImageModel,
  FEATURED_IMAGE_HEIGHT,
  FEATURED_IMAGE_PROVIDER_IDS,
  FEATURED_IMAGE_PROVIDER_OPTIONS,
  FEATURED_IMAGE_WIDTH,
  type FeaturedImageProvider,
  OPENAI_IMAGE_MODEL_IDS,
  OPENAI_IMAGE_MODEL_OPTIONS,
  type OpenAIImageModel,
  resolveFalImageModel,
  resolveFalImageQuality,
  resolveFeaturedImageProvider,
  resolveOpenAIImageModel,
};

type FalImageResponse = {
  images?: Array<{
    url?: string;
    content_type?: string;
  }>;
};

export function buildFeaturedImagePrompt(prompt: string) {
  return [
    prompt,
    `Create a single clean 16:9 editorial hero image composed for ${FEATURED_IMAGE_WIDTH}x${FEATURED_IMAGE_HEIGHT}.`,
    "Use a polished magazine-editorial look with believable materials, natural lens depth, detailed lighting, and crisp focal detail.",
    "Avoid muddy textures, warped anatomy, smeared faces, overprocessed AI gloss, plastic skin, distorted objects, and awkward framing.",
    "No visible text, lettering, typography, logos, labels, captions, watermarks, or interface words.",
    "Avoid repeated tiles, crowded collage compositions, book-cover grids, and cluttered poster walls.",
    "Prefer one strong focal subject, restrained supporting details, and cinematic lighting.",
  ].join(" ");
}

const falPromptReplacements: Array<[RegExp, string]> = [
  [/\bGame of Thrones\b/gi, "a dark medieval fantasy saga"],
  [/\bHouse of the Dragon\b/gi, "a royal dragon fantasy saga"],
  [/\bWesteros\b/gi, "a divided medieval fantasy kingdom"],
  [/\bruined Harrenhal\b/gi, "a fire-scarred riverlands fortress"],
  [/\bHarrenhal\b/gi, "a fire-scarred riverlands fortress"],
  [/\bWinterfell\b/gi, "an ancestral northern stone castle"],
  [/\bKing'?s Landing\b/gi, "a crowded walled royal capital"],
  [/\bArya Stark\b/gi, "a disguised young noble fugitive"],
  [/\bJaqen H['’]ghar\b/gi, "a mysterious prisoner-assassin"],
  [/\bJon Snow\b/gi, "a conflicted northern sworn brother"],
  [/\bDaenerys Targaryen\b/gi, "an exiled silver-haired dragon queen"],
  [/\bTyrion Lannister\b/gi, "a sharp-tongued noble strategist"],
  [/\bCersei Lannister\b/gi, "a calculating queen in a hostile court"],
  [/\bJaime Lannister\b/gi, "a golden-armored knight with divided loyalties"],
  [/\bNed Stark\b/gi, "an honorable northern lord trapped in court intrigue"],
  [/\bSansa Stark\b/gi, "a young northern noblewoman learning court survival"],
  [/\bBran Stark\b/gi, "a watchful noble heir marked by strange visions"],
  [/\bRobb Stark\b/gi, "a young northern commander leading a war camp"],
  [/\bThe Walking Dead\b/gi, "a post-apocalyptic survivor drama"],
  [/\bRick Grimes\b/gi, "a weary survivor leader"],
  [/\bDaryl Dixon\b/gi, "a rugged survivalist"],
  [/\bMichonne\b/gi, "a guarded sword-carrying survivor"],
];

function buildFalSafeFeaturedImagePrompt(prompt: string) {
  let safePrompt = buildFeaturedImagePrompt(prompt);

  for (const [pattern, replacement] of falPromptReplacements) {
    safePrompt = safePrompt.replace(pattern, replacement);
  }

  return [
    safePrompt,
    "Preserve the article subject through the same setting type, episode conflict, character roles, props, atmosphere, and visual stakes.",
    "Use genre-inspired archetypes only; do not depict or name specific copyrighted characters, actors, franchise marks, studio logos, or exact protected likenesses.",
  ].join(" ");
}

function falQualitySettings(modelId: string, qualityInput?: unknown) {
  const quality = resolveFalImageQuality(qualityInput);

  if (modelId === "fal-ai/flux-2-pro") {
    return {};
  }

  if (modelId === "fal-ai/flux-2-flex") {
    if (quality === "fast") {
      return {
        num_inference_steps: 30,
        guidance_scale: 2.75,
        acceleration: "regular" as const,
        enable_prompt_expansion: true,
      };
    }

    if (quality === "balanced") {
      return {
        num_inference_steps: 38,
        guidance_scale: 3,
        acceleration: "regular" as const,
        enable_prompt_expansion: true,
      };
    }

    return {
      num_inference_steps: 44,
      guidance_scale: 3.25,
      acceleration: "none" as const,
      enable_prompt_expansion: true,
    };
  }

  if (modelId.includes("schnell")) {
    if (quality === "fast") {
      return {
        num_inference_steps: 4,
        guidance_scale: 3,
        acceleration: "regular" as const,
      };
    }

    if (quality === "balanced") {
      return {
        num_inference_steps: 8,
        guidance_scale: 3.5,
        acceleration: "regular" as const,
      };
    }

    return {
      num_inference_steps: 12,
      guidance_scale: 4,
      acceleration: "none" as const,
    };
  }

  if (quality === "fast") {
    return {
      num_inference_steps: 24,
      guidance_scale: 2.5,
      acceleration: "regular" as const,
      enable_prompt_expansion: true,
    };
  }

  if (quality === "balanced") {
    return {
      num_inference_steps: 30,
      guidance_scale: 2.75,
      acceleration: "regular" as const,
      enable_prompt_expansion: true,
    };
  }

  return {
    num_inference_steps: 36,
    guidance_scale: 3,
    acceleration: "none" as const,
    enable_prompt_expansion: true,
  };
}

export function buildFalFeaturedImageInput(
  prompt: string,
  options: {
    modelId?: string;
    quality?: unknown;
  } = {},
) {
  const modelId = options.modelId ?? DEFAULT_FAL_IMAGE_MODEL;

  return {
    prompt: buildFalSafeFeaturedImagePrompt(prompt),
    image_size: {
      width: FEATURED_IMAGE_WIDTH,
      height: FEATURED_IMAGE_HEIGHT,
    },
    num_images: 1,
    ...falQualitySettings(modelId, options.quality),
    enable_safety_checker: true,
    output_format: "png" as const,
  };
}

export function getOpenAIFeaturedImageRequestSize() {
  return "1536x1024" as const;
}

export function buildOpenAIImageGenerationRequest(prompt: string, modelInput?: unknown) {
  return {
    model: resolveOpenAIImageModel(modelInput),
    prompt: buildFeaturedImagePrompt(prompt),
    size: getOpenAIFeaturedImageRequestSize(),
  };
}

export async function normalizeFeaturedImageBuffer(buffer: Buffer) {
  return sharp(buffer)
    .resize(FEATURED_IMAGE_WIDTH, FEATURED_IMAGE_HEIGHT, {
      fit: "cover",
      position: "attention",
    })
    .png({
      palette: true,
      quality: 90,
      compressionLevel: 9,
    })
    .toBuffer();
}

async function writeGeneratedFeaturedImage(input: {
  articleId: string;
  buffer: Buffer;
  imageModel: string;
}) {
  const outputDirectory = path.join(process.cwd(), "public", "generated");
  const filename = `${input.articleId}-${Date.now()}-${randomUUID()}.png`;
  const fullPath = path.join(outputDirectory, filename);
  const normalized = await normalizeFeaturedImageBuffer(input.buffer);

  await fs.mkdir(outputDirectory, { recursive: true });
  await fs.writeFile(fullPath, normalized);

  return {
    imageModel: input.imageModel,
    publicPath: `/generated/${filename}`,
    mimeType: "image/png",
  };
}

async function generateOpenAIFeaturedImage(
  articleId: string,
  prompt: string,
  modelInput?: unknown,
) {
  const env = requireOpenAIEnv();
  const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  const imageRequest = buildOpenAIImageGenerationRequest(
    prompt,
    modelInput ?? env.OPENAI_IMAGE_MODEL,
  );
  const imageResponse = await client.images.generate(imageRequest);
  const image = imageResponse.data?.[0];

  if (!image?.b64_json) {
    throw new Error("The OpenAI image model did not return base64 image data.");
  }

  return writeGeneratedFeaturedImage({
    articleId,
    buffer: Buffer.from(image.b64_json, "base64"),
    imageModel: imageRequest.model,
  });
}

async function generateFalFeaturedImage(
  articleId: string,
  prompt: string,
  modelInput?: unknown,
) {
  const env = requireFalEnv();
  const modelId = resolveFalImageModel(modelInput ?? env.FAL_IMAGE_MODEL);
  fal.config({
    credentials: env.FAL_KEY,
  });

  const result = await fal.subscribe(modelId, {
    input: buildFalFeaturedImageInput(prompt, {
      modelId,
      quality: env.FAL_IMAGE_QUALITY,
    }),
  });
  const data = result.data as FalImageResponse;
  const image = data.images?.[0];

  if (!image?.url) {
    throw new Error("fal.ai did not return an image URL.");
  }

  const imageResponse = await fetch(image.url, {
    cache: "no-store",
  });

  if (!imageResponse.ok) {
    throw new Error(`fal.ai image download failed: ${imageResponse.status} ${imageResponse.statusText}`);
  }

  return writeGeneratedFeaturedImage({
    articleId,
    buffer: Buffer.from(await imageResponse.arrayBuffer()),
    imageModel: modelId,
  });
}

export async function generateFeaturedImageAsset(
  articleId: string,
  prompt: string,
  providerInput?: unknown,
  falModelInput?: unknown,
  openAiModelInput?: unknown,
) {
  const env = getServerEnv();
  const provider = resolveFeaturedImageProvider(providerInput ?? env.FEATURED_IMAGE_PROVIDER);

  if (provider === "openai") {
    return generateOpenAIFeaturedImage(
      articleId,
      prompt,
      openAiModelInput ?? env.OPENAI_IMAGE_MODEL,
    );
  }

  return generateFalFeaturedImage(articleId, prompt, falModelInput);
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
