export const MAX_ARTICLE_BODY_IMAGE_COUNT = 4;

type ArticleBodyImageRequestInput = {
  title: string;
  angle: string;
  primaryKeyword: string;
  contentMarkdown: string;
  count: number;
};

export type ArticleBodyImageRequest = {
  prompt: string;
  altText: string;
  sectionHeading: string;
  sortOrder: number;
};

export type ArticleBodyImagePlacement = {
  assetKey?: string | null;
  altText: string;
  publicPath: string;
  sectionHeading: string;
};

export type ArticleBodyImageReference = {
  assetKey?: string | null;
  publicPath: string;
};

function assetMarker(assetKey: string) {
  return `<!-- foundry-image:${assetKey} -->`;
}

const visualAssignments = [
  {
    name: "wide establishing scene",
    direction:
      "show the surrounding environment, era cues, and spatial context with a clear foreground-middle-background composition",
    shot:
      "wide editorial shot, balanced negative space, cinematic room or location context",
  },
  {
    name: "close editorial detail",
    direction:
      "focus on one tactile object, prop, surface, or collectible detail that represents the section without repeating the hero image",
    shot:
      "tight close-up, shallow depth of field, crisp texture, strong single focal point",
  },
  {
    name: "human-scale moment",
    direction:
      "capture a believable human-scale scene, gesture, or implied viewer experience connected to the section",
    shot:
      "medium editorial composition, natural posture or interaction, no distorted faces or hands",
  },
  {
    name: "atmospheric texture",
    direction:
      "create a mood-setting transitional visual built around light, shadow, color, and material detail",
    shot:
      "low-angle or overhead composition, layered lighting, atmospheric but concrete details",
  },
];

function cleanInlineMarkdown(value: string) {
  return value
    .replace(/[`*_#[\]()]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractHeadings(contentMarkdown: string) {
  return contentMarkdown
    .split(/\r?\n/)
    .map((line) => /^#{2,3}\s+(.+)$/.exec(line.trim())?.[1])
    .filter((heading): heading is string => Boolean(heading))
    .map(cleanInlineMarkdown)
    .filter(Boolean);
}

function fallbackSectionHeading(title: string, index: number) {
  const titleText = cleanInlineMarkdown(title) || "Article";
  return index === 0 ? titleText : `${titleText} visual ${index + 1}`;
}

function selectSectionHeading(headings: string[], title: string, index: number, count: number) {
  if (headings.length === 0) {
    return fallbackSectionHeading(title, index);
  }

  if (count >= headings.length) {
    return headings[index] ?? fallbackSectionHeading(title, index);
  }

  const headingIndex = Math.min(
    headings.length - 1,
    Math.floor(((index + 1) * headings.length) / (count + 1)),
  );

  return headings[headingIndex] ?? fallbackSectionHeading(title, index);
}

export function resolveArticleBodyImageCount(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return 0;
  }

  const count = Math.trunc(Number(value));

  if (!Number.isFinite(count)) {
    return 0;
  }

  return Math.min(Math.max(count, 0), MAX_ARTICLE_BODY_IMAGE_COUNT);
}

export function buildArticleBodyImageRequests(input: ArticleBodyImageRequestInput) {
  const count = resolveArticleBodyImageCount(input.count);
  const headings = extractHeadings(input.contentMarkdown);
  const requests: ArticleBodyImageRequest[] = [];

  for (let index = 0; index < count; index += 1) {
    const sectionHeading = selectSectionHeading(headings, input.title, index, count);
    const sortOrder = index + 1;
    const assignment = visualAssignments[index % visualAssignments.length];

    requests.push({
      sortOrder,
      sectionHeading,
      altText: `${assignment.name} supporting ${sectionHeading}`,
      prompt: [
        `Editorial article body image ${sortOrder} for "${input.title}".`,
        `Focus keyphrase: ${input.primaryKeyword}.`,
        `Article angle: ${input.angle}.`,
        `Section to support: "${sectionHeading}".`,
        `Visual assignment: ${assignment.name}.`,
        `Creative direction: ${assignment.direction}.`,
        `Shot and composition: ${assignment.shot}.`,
        "Use a natural editorial scene that complements the article body, not a hero banner.",
        "Do not create a variation of another generated image for this article; choose a different subject focus, camera distance, composition, and mood.",
        "No visible text, lettering, logos, captions, watermarks, or interface words.",
      ].join(" "),
    });
  }

  return requests;
}

export function insertArticleBodyImageMarkdown(
  contentMarkdown: string,
  images: ArticleBodyImagePlacement[],
) {
  if (images.length === 0) {
    return contentMarkdown;
  }

  let updated = contentMarkdown.trimEnd();

  for (const image of images) {
    const marker = image.assetKey ? assetMarker(image.assetKey) : null;

    if ((marker && updated.includes(marker)) || updated.includes(`](${image.publicPath})`)) {
      continue;
    }

    const imageMarkdown = `![${image.altText}](${image.publicPath})`;
    const imageBlock = marker ? `${marker}\n${imageMarkdown}` : imageMarkdown;
    const lines = updated.split(/\r?\n/);
    const headingIndex = lines.findIndex(
      (line) => cleanInlineMarkdown(line.replace(/^#{2,3}\s+/, "")) === image.sectionHeading,
    );

    if (headingIndex >= 0 && /^#{2,3}\s+/.test(lines[headingIndex]?.trim() ?? "")) {
      const insertIndex = headingIndex + 1;

      while (lines[insertIndex]?.trim() === "") {
        lines.splice(insertIndex, 1);
      }

      lines.splice(insertIndex, 0, "", imageBlock, "");
      updated = lines.join("\n").trimEnd();
      continue;
    }

    updated = `${updated}\n\n${imageBlock}`;
  }

  return `${updated}\n`;
}

export function removeArticleBodyImageMarkdown(
  contentMarkdown: string,
  images: ArticleBodyImageReference[],
) {
  const paths = new Set(images.map((image) => image.publicPath.trim()).filter(Boolean));
  const markers = new Set(
    images
      .map((image) => image.assetKey?.trim())
      .filter((assetKey): assetKey is string => Boolean(assetKey))
      .map(assetMarker),
  );

  if (paths.size === 0 && markers.size === 0) {
    return contentMarkdown;
  }

  const lines = contentMarkdown.split(/\r?\n/);
  const kept: string[] = [];
  let skipNextImage = false;

  for (const line of lines) {
    if (markers.has(line.trim())) {
      skipNextImage = true;
      continue;
    }

    if (skipNextImage && /^!\[[^\]]*\]\([^)]+\)\s*$/.test(line.trim())) {
      skipNextImage = false;
      continue;
    }

    if (line.trim() !== "") {
      skipNextImage = false;
    }

    const match = /^!\[[^\]]*\]\(([^)]+)\)\s*$/.exec(line.trim());

    if (match && paths.has(match[1].trim())) {
      continue;
    }

    kept.push(line);
  }

  return kept
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trimEnd()
    .concat("\n");
}
