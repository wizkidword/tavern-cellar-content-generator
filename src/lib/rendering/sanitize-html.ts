import { marked } from "marked";
import sanitizeHtml from "sanitize-html";

const generatedImagePath = /^\/generated\/[a-zA-Z0-9_-]+\.png$/;

function isSafeLink(value: string | undefined) {
  if (!value) {
    return false;
  }

  if (value.startsWith("/") || value.startsWith("#")) {
    return true;
  }

  try {
    const url = new URL(value);
    return ["http:", "https:", "mailto:"].includes(url.protocol);
  } catch {
    return false;
  }
}

function isApprovedImage(value: string | undefined, approvedImageUrls: Set<string>) {
  if (!value) {
    return false;
  }

  return generatedImagePath.test(value) || approvedImageUrls.has(value);
}

export async function renderSanitizedArticleHtml(input: {
  markdown: string;
  approvedImageUrls?: Iterable<string>;
}) {
  const rendered = await marked.parse(input.markdown);
  const approvedImageUrls = new Set(
    Array.from(input.approvedImageUrls ?? []).map((url) => url.trim()).filter(Boolean),
  );

  return sanitizeHtml(rendered, {
    allowedTags: [
      "a",
      "blockquote",
      "br",
      "code",
      "em",
      "figcaption",
      "figure",
      "h1",
      "h2",
      "h3",
      "h4",
      "hr",
      "img",
      "li",
      "ol",
      "p",
      "pre",
      "strong",
      "table",
      "tbody",
      "td",
      "th",
      "thead",
      "tr",
      "ul",
    ],
    allowedAttributes: {
      a: ["href", "rel", "target", "title"],
      figure: ["class"],
      img: ["alt", "class", "height", "src", "title", "width"],
      th: ["colspan", "rowspan"],
      td: ["colspan", "rowspan"],
    },
    allowedClasses: {
      figure: ["wp-block-image", "size-full"],
      img: [/^wp-image-\d+$/],
    },
    allowedSchemes: ["http", "https", "mailto"],
    allowedSchemesByTag: {
      img: ["http", "https"],
    },
    allowProtocolRelative: false,
    disallowedTagsMode: "discard",
    transformTags: {
      a: (tagName, attribs) => {
        if (!isSafeLink(attribs.href)) {
          return { tagName: "span", attribs: {} };
        }

        const isExternal = /^https?:\/\//i.test(attribs.href);

        return {
          tagName,
          attribs: {
            href: attribs.href,
            ...(attribs.title ? { title: attribs.title } : {}),
            ...(attribs.target === "_blank" ? { target: "_blank" } : {}),
            ...(isExternal ? { rel: "noopener noreferrer" } : {}),
          },
        };
      },
      img: (tagName, attribs) => {
        if (!isApprovedImage(attribs.src, approvedImageUrls)) {
          return { tagName: "span", attribs: {} };
        }

        return {
          tagName,
          attribs: {
            src: attribs.src,
            alt: attribs.alt ?? "",
            ...(attribs.class ? { class: attribs.class } : {}),
            ...(attribs.width ? { width: attribs.width } : {}),
            ...(attribs.height ? { height: attribs.height } : {}),
          },
        };
      },
    },
  });
}
