export const FEATURED_IMAGE_WIDTH = 1280;
export const FEATURED_IMAGE_HEIGHT = 720;

export const DEFAULT_FAL_IMAGE_MODEL = "fal-ai/flux-2";

export const DEFAULT_OPENAI_IMAGE_MODEL = "gpt-image-2";

export const OPENAI_IMAGE_MODEL_IDS = [
  "gpt-image-2",
  "gpt-image-1.5",
  "gpt-image-1",
  "gpt-image-1-mini",
] as const;
export type OpenAIImageModel = (typeof OPENAI_IMAGE_MODEL_IDS)[number];

export const OPENAI_IMAGE_MODEL_OPTIONS = [
  {
    id: "gpt-image-2",
    label: "GPT Image 2",
    description: "Latest GPT Image model and the default OpenAI image generator.",
  },
  {
    id: "gpt-image-1.5",
    label: "GPT Image 1.5",
    description: "Previous GPT Image model for quality and prompt-adherence comparisons.",
  },
  {
    id: "gpt-image-1",
    label: "GPT Image 1",
    description: "Original GPT Image generation model.",
  },
  {
    id: "gpt-image-1-mini",
    label: "GPT Image 1 Mini",
    description: "Lower-cost GPT Image 1 variant for cheaper visual experiments.",
  },
] satisfies Array<{
  id: OpenAIImageModel;
  label: string;
  description: string;
}>;

export const FAL_IMAGE_MODEL_IDS = [
  "fal-ai/flux-2",
  "fal-ai/flux-2-pro",
  "fal-ai/flux-2-flex",
] as const;
export type FalImageModel = (typeof FAL_IMAGE_MODEL_IDS)[number];

export const FAL_IMAGE_MODEL_OPTIONS = [
  {
    id: "fal-ai/flux-2",
    label: "fal.ai FLUX.2",
    description: "Current lower-cost Fal model with app-managed quality controls.",
  },
  {
    id: "fal-ai/flux-2-pro",
    label: "fal.ai FLUX.2 Pro",
    description: "Higher-quality production image generation with fewer tuning controls.",
  },
  {
    id: "fal-ai/flux-2-flex",
    label: "fal.ai FLUX.2 Flex",
    description: "Higher-control Fal model for stronger prompt adherence and final-detail tuning.",
  },
] satisfies Array<{
  id: FalImageModel;
  label: string;
  description: string;
}>;

export const FAL_IMAGE_QUALITY_IDS = ["fast", "balanced", "quality"] as const;
export type FalImageQuality = (typeof FAL_IMAGE_QUALITY_IDS)[number];

export const DEFAULT_FAL_IMAGE_QUALITY: FalImageQuality = "quality";

export const FEATURED_IMAGE_PROVIDER_IDS = ["fal", "openai"] as const;
export type FeaturedImageProvider = (typeof FEATURED_IMAGE_PROVIDER_IDS)[number];

export const DEFAULT_FEATURED_IMAGE_PROVIDER: FeaturedImageProvider = "fal";

export const FEATURED_IMAGE_PROVIDER_OPTIONS = [
  {
    id: "fal",
    label: "fal.ai FLUX.2 Quality",
    description: "Lower-cost 1280x720 images with enhanced fal quality settings.",
  },
  {
    id: "openai",
    label: "OpenAI GPT Image",
    description: "OpenAI GPT Image generation, normalized to 1280x720.",
  },
] satisfies Array<{
  id: FeaturedImageProvider;
  label: string;
  description: string;
}>;

export function resolveFeaturedImageProvider(value: unknown): FeaturedImageProvider {
  return FEATURED_IMAGE_PROVIDER_IDS.find((provider) => provider === value) ?? DEFAULT_FEATURED_IMAGE_PROVIDER;
}

export function resolveFalImageModel(value: unknown): FalImageModel {
  return FAL_IMAGE_MODEL_IDS.find((model) => model === value) ?? DEFAULT_FAL_IMAGE_MODEL;
}

export function resolveOpenAIImageModel(value: unknown): OpenAIImageModel {
  return OPENAI_IMAGE_MODEL_IDS.find((model) => model === value) ?? DEFAULT_OPENAI_IMAGE_MODEL;
}

export function resolveFalImageQuality(value: unknown): FalImageQuality {
  return FAL_IMAGE_QUALITY_IDS.find((quality) => quality === value) ?? DEFAULT_FAL_IMAGE_QUALITY;
}
