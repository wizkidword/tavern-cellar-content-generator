import { buildWordPressPreflightContentHtml } from "@/lib/wordpress";
import { splitListInput } from "@/lib/topic-utils";

export type PublishPreflightMode = "draft" | "publish" | "future";

export type PublishPreflightInput = {
  title: string;
  slug: string;
  excerpt: string;
  primaryKeyword: string;
  metaTitle: string;
  metaDescription: string;
  tags: string;
  internalLinks: string;
  contentMarkdown: string;
  category: {
    name: string;
    wpCategoryId: number;
  };
  featuredImagePath: string | null;
  featuredImageAlt: string;
  featuredImageState: string;
  bodyImagesState: string;
  bodyImages: Array<{
    publicPath: string;
    altText: string;
  }>;
  scheduledFor: Date | null;
  scheduledForLocal: string | null;
  scheduledForTimezone: string | null;
  qualityBlockingWarnings: string[];
  qualitySuggestions: string[];
};

export type PreflightLink = {
  href: string;
  label: string;
  type: "internal" | "external";
};

function decodeHtmlAttribute(value: string) {
  return value.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

function stripHtml(value: string) {
  return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function normalizedHref(value: string) {
  return value.replace(/\/$/, "");
}

function getLinksInRenderedHtml(html: string, verifiedInternalHrefs: Set<string>): PreflightLink[] {
  const links = new Map<string, PreflightLink>();
  const anchorPattern = /<a\s+([^>]*)>([\s\S]*?)<\/a>/gi;

  for (const match of html.matchAll(anchorPattern)) {
    const hrefMatch = /\bhref="([^"]+)"/i.exec(match[1] ?? "");
    const href = hrefMatch ? decodeHtmlAttribute(hrefMatch[1]) : "";

    if (!href) {
      continue;
    }

    const isExternal =
      /^https?:\/\//i.test(href) && !verifiedInternalHrefs.has(normalizedHref(href));
    const key = `${href}|${stripHtml(match[2] ?? "")}`;
    links.set(key, {
      href,
      label: stripHtml(match[2] ?? "") || href,
      type: isExternal ? "external" : "internal",
    });
  }

  return [...links.values()];
}

function parseVerifiedInternalLinks(value: string) {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const separator = line.lastIndexOf(" - ");

      if (separator <= 0) {
        return { label: line, href: "" };
      }

      return {
        label: line.slice(0, separator).trim(),
        href: line.slice(separator + 3).trim(),
      };
    });
}

function collectWarnings(input: PublishPreflightInput, mode: PublishPreflightMode) {
  const blocking = [...input.qualityBlockingWarnings];
  const warnings = [...input.qualitySuggestions];

  if (!input.category.wpCategoryId) {
    blocking.push("This category is not mapped to WordPress yet.");
  }

  if (mode === "future" && !input.scheduledFor) {
    blocking.push("Choose and save a schedule before asking WordPress to schedule this article.");
  }

  if (input.featuredImageState === "GENERATING" || input.bodyImagesState === "GENERATING") {
    blocking.push("An image is still generating, so the outgoing media payload can still change.");
  }

  if (input.featuredImageState === "FAILED") {
    warnings.push("The featured image failed to generate and will not be uploaded.");
  }

  if (input.bodyImagesState === "FAILED") {
    warnings.push("Some in-post images failed to generate and will not be uploaded.");
  }

  if (input.featuredImagePath && !input.featuredImageAlt.trim()) {
    warnings.push("The featured image has no alt text.");
  }

  return { blocking, warnings };
}

export async function buildPublishPreflight(
  input: PublishPreflightInput,
  mode: PublishPreflightMode,
) {
  const html = await buildWordPressPreflightContentHtml({
    contentMarkdown: input.contentMarkdown,
    featuredImage: input.featuredImagePath
      ? {
          publicPath: input.featuredImagePath,
          altText: input.featuredImageAlt,
        }
      : null,
    bodyImages: input.bodyImages,
  });
  const verifiedInternalLinks = parseVerifiedInternalLinks(input.internalLinks);
  const links = getLinksInRenderedHtml(
    html,
    new Set(verifiedInternalLinks.map((link) => normalizedHref(link.href)).filter(Boolean)),
  );
  const warnings = collectWarnings(input, mode);

  return {
    mode,
    title: input.title,
    slug: input.slug,
    excerpt: input.excerpt,
    focusPhrase: input.primaryKeyword,
    metaTitle: input.metaTitle,
    metaDescription: input.metaDescription,
    category: input.category,
    tags: splitListInput(input.tags),
    html,
    featuredImage: input.featuredImagePath
      ? {
          path: input.featuredImagePath,
          altText: input.featuredImageAlt,
          willReceiveWordPressUrl: true,
        }
      : null,
    bodyImages: input.bodyImages.map((image) => ({
      path: image.publicPath,
      altText: image.altText,
      willReceiveWordPressUrl: true,
    })),
    links,
    verifiedInternalLinks,
    scheduledFor: input.scheduledFor,
    scheduledForLocal: input.scheduledForLocal,
    scheduledForTimezone: input.scheduledForTimezone,
    ...warnings,
  };
}
