import test from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import sharp from "sharp";

import {
  DEFAULT_FAL_IMAGE_MODEL,
  DEFAULT_FAL_IMAGE_QUALITY,
  DEFAULT_OPENAI_IMAGE_MODEL,
  FAL_IMAGE_MODEL_OPTIONS,
  FEATURED_IMAGE_HEIGHT,
  FEATURED_IMAGE_WIDTH,
  OPENAI_IMAGE_MODEL_OPTIONS,
  buildOpenAIImageGenerationRequest,
  buildFalFeaturedImageInput,
  buildFeaturedImagePrompt,
  getOpenAIFeaturedImageRequestSize,
  normalizeFeaturedImageBuffer,
  promoteStagedGeneratedImage,
  resolveFalImageModel,
  resolveOpenAIImageModel,
  resolveFeaturedImageProvider,
} from "@/lib/featured-image";

test("uses fal as the default lower-cost featured image provider", () => {
  assert.equal(resolveFeaturedImageProvider(undefined), "fal");
  assert.equal(resolveFeaturedImageProvider("fal"), "fal");
  assert.equal(resolveFeaturedImageProvider("openai"), "openai");
});

test("builds fal image input for the standard 1280 by 720 hero size", () => {
  const input = buildFalFeaturedImageInput("A cinematic retro TV in a dark room.");

  assert.equal(input.image_size.width, FEATURED_IMAGE_WIDTH);
  assert.equal(input.image_size.height, FEATURED_IMAGE_HEIGHT);
  assert.equal(input.num_images, 1);
  assert.equal(input.output_format, "png");
});

test("uses enhanced fal quality controls by default", () => {
  const input = buildFalFeaturedImageInput("A cinematic retro TV in a dark room.", {
    modelId: DEFAULT_FAL_IMAGE_MODEL,
    quality: DEFAULT_FAL_IMAGE_QUALITY,
  });

  assert.equal(DEFAULT_FAL_IMAGE_MODEL, "fal-ai/flux-2");
  assert.equal(DEFAULT_FAL_IMAGE_QUALITY, "quality");
  assert.equal(input.num_inference_steps, 36);
  assert.equal(input.guidance_scale, 3);
  assert.equal(input.acceleration, "none");
  assert.equal(input.enable_prompt_expansion, true);
});

test("offers fal flux 2 dev, pro, and flex image model choices", () => {
  assert.equal(resolveFalImageModel(undefined), DEFAULT_FAL_IMAGE_MODEL);
  assert.equal(resolveFalImageModel("fal-ai/flux-2-pro"), "fal-ai/flux-2-pro");
  assert.equal(resolveFalImageModel("fal-ai/flux-2-flex"), "fal-ai/flux-2-flex");
  assert.equal(resolveFalImageModel("not-a-real-model"), DEFAULT_FAL_IMAGE_MODEL);
  assert.deepEqual(
    FAL_IMAGE_MODEL_OPTIONS.map((option) => option.id),
    ["fal-ai/flux-2", "fal-ai/flux-2-pro", "fal-ai/flux-2-flex"],
  );
});

test("offers GPT Image model choices for OpenAI image generation", () => {
  assert.equal(resolveOpenAIImageModel(undefined), DEFAULT_OPENAI_IMAGE_MODEL);
  assert.equal(resolveOpenAIImageModel("gpt-image-1-mini"), "gpt-image-1-mini");
  assert.equal(resolveOpenAIImageModel("not-a-real-model"), DEFAULT_OPENAI_IMAGE_MODEL);
  assert.deepEqual(
    OPENAI_IMAGE_MODEL_OPTIONS.map((option) => option.id),
    ["gpt-image-2", "gpt-image-1.5", "gpt-image-1", "gpt-image-1-mini"],
  );
});

test("omits dev tuning controls for fal flux 2 pro", () => {
  const input = buildFalFeaturedImageInput("A cinematic retro TV in a dark room.", {
    modelId: "fal-ai/flux-2-pro",
    quality: "quality",
  });

  assert.equal(input.image_size.width, FEATURED_IMAGE_WIDTH);
  assert.equal(input.image_size.height, FEATURED_IMAGE_HEIGHT);
  assert.equal("num_inference_steps" in input, false);
  assert.equal("guidance_scale" in input, false);
  assert.equal("acceleration" in input, false);
  assert.equal("enable_prompt_expansion" in input, false);
});

test("uses final-deliverable controls for fal flux 2 flex quality", () => {
  const input = buildFalFeaturedImageInput("A cinematic retro TV in a dark room.", {
    modelId: "fal-ai/flux-2-flex",
    quality: "quality",
  });

  assert.equal(input.num_inference_steps, 44);
  assert.equal(input.guidance_scale, 3.25);
  assert.equal(input.acceleration, "none");
  assert.equal(input.enable_prompt_expansion, true);
});

test("neutralizes named franchise terms in fal image prompts for stricter models", () => {
  const input = buildFalFeaturedImageInput(
    "A cinematic medieval throne-room interior in ruined Harrenhal, with Arya Stark standing in the foreground near a torchlit stone corridor while Jaqen H'ghar remains partially in shadow behind her; cracked walls, heavy iron braziers, and a sense of ominous scale.",
    {
      modelId: "fal-ai/flux-2-flex",
      quality: "quality",
    },
  );

  assert.doesNotMatch(input.prompt, /Arya Stark|Jaqen H'ghar|Harrenhal/i);
  assert.doesNotMatch(input.prompt, /ruined a ruined/i);
  assert.match(input.prompt, /disguised young noble fugitive/i);
  assert.match(input.prompt, /fire-scarred riverlands fortress/i);
  assert.match(input.prompt, /mysterious prisoner-assassin/i);
  assert.match(input.prompt, /torchlit stone corridor/i);
});

test("keeps enhanced schnell controls within fal.ai limits", () => {
  const input = buildFalFeaturedImageInput("A cinematic retro TV in a dark room.", {
    modelId: "fal-ai/flux/schnell",
    quality: "quality",
  });

  assert.equal(input.num_inference_steps, 12);
  assert.equal(input.guidance_scale, 4);
  assert.equal(input.acceleration, "none");
  assert.equal("enable_prompt_expansion" in input, false);
});

test("uses the closest supported OpenAI landscape size before local normalization", () => {
  assert.equal(getOpenAIFeaturedImageRequestSize(), "1536x1024");
});

test("builds OpenAI image requests with the selected GPT Image model", () => {
  const request = buildOpenAIImageGenerationRequest(
    "A cinematic fantasy throne room.",
    "gpt-image-1-mini",
  );

  assert.equal(request.model, "gpt-image-1-mini");
  assert.equal(request.size, getOpenAIFeaturedImageRequestSize());
  assert.match(request.prompt, /No visible text/);
});

test("featured image prompts request a clean 16:9 editorial hero", () => {
  const prompt = buildFeaturedImagePrompt("A VHS tape beside a glowing television.");

  assert.match(prompt, /16:9/);
  assert.match(prompt, /1280x720/);
  assert.match(prompt, /No visible text/);
});

test("promotes a staged image only after it has a complete staged file", async () => {
  const operationKey = `featured-image-test-${process.pid}-${Date.now()}`;
  const filename = `${operationKey}.png`;
  const stagedPath = path.join(
    process.cwd(),
    "public",
    "generated",
    ".staging",
    operationKey,
    filename,
  );
  const finalPath = path.join(process.cwd(), "public", "generated", filename);
  await fs.mkdir(path.dirname(stagedPath), { recursive: true });
  await fs.writeFile(stagedPath, Buffer.from("validated test image"));

  try {
    const promoted = await promoteStagedGeneratedImage({
      imageModel: "test-image-model",
      mimeType: "image/png",
      filename,
      stagedPath,
    });

    assert.equal(promoted.publicPath, `/generated/${filename}`);
    assert.equal(await fs.readFile(finalPath, "utf8"), "validated test image");
    await assert.rejects(() => fs.access(stagedPath));
  } finally {
    await fs.rm(path.dirname(stagedPath), { force: true, recursive: true });
    await fs.rm(finalPath, { force: true });
  }
});

test("normalizes provider output to exactly 1280 by 720 png", async () => {
  const source = await sharp({
    create: {
      width: 64,
      height: 64,
      channels: 3,
      background: "#3c2f2f",
    },
  })
    .png()
    .toBuffer();

  const normalized = await normalizeFeaturedImageBuffer(source);
  const metadata = await sharp(normalized).metadata();

  assert.equal(metadata.width, FEATURED_IMAGE_WIDTH);
  assert.equal(metadata.height, FEATURED_IMAGE_HEIGHT);
  assert.equal(metadata.format, "png");
});

test("keeps normalized pngs small enough for WordPress media upload", async () => {
  const pixels = Buffer.alloc(FEATURED_IMAGE_WIDTH * FEATURED_IMAGE_HEIGHT * 3);
  let state = 0x12345678;

  for (let index = 0; index < pixels.length; index += 1) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    pixels[index] = state >>> 24;
  }

  const source = await sharp(pixels, {
    raw: {
      width: FEATURED_IMAGE_WIDTH,
      height: FEATURED_IMAGE_HEIGHT,
      channels: 3,
    },
  })
    .png()
    .toBuffer();

  const normalized = await normalizeFeaturedImageBuffer(source);
  const metadata = await sharp(normalized).metadata();

  assert.equal(metadata.width, FEATURED_IMAGE_WIDTH);
  assert.equal(metadata.height, FEATURED_IMAGE_HEIGHT);
  assert.equal(metadata.format, "png");
  assert.ok(
    normalized.length < 1_500_000,
    `expected optimized png under 1.5 MB, got ${normalized.length} bytes`,
  );
});
