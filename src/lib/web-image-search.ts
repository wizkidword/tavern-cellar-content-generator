import {
  downloadLicensedOpenverseImage,
  searchLicensedOpenverseImages,
  type OpenverseImageCandidate,
} from "@/lib/openverse";
import {
  downloadBroadWebImage,
  searchBroadWebImages,
  type BroadWebImageCandidate,
} from "@/lib/broad-web-image-search";
import {
  downloadLicensedWikimediaImage,
  searchLicensedWikimediaImages,
  type WikimediaImageCandidate,
} from "@/lib/wikimedia-commons";

export type WebImageSource = "wikimedia" | "openverse" | "web";
export type WebImageSearchScope = "licensed" | "broad";

export type WebImageCandidate = {
  assetId: string;
  attribution: string;
  descriptionUrl: string;
  height: number;
  license: string;
  licenseUrl: string | null;
  providerLabel: string;
  source: WebImageSource;
  thumbnailHeight: number;
  thumbnailUrl: string;
  thumbnailWidth: number;
  title: string;
  width: number;
};

function fromWikimedia(image: WikimediaImageCandidate): WebImageCandidate {
  return {
    assetId: image.fileTitle,
    attribution: image.attribution,
    descriptionUrl: image.descriptionUrl,
    height: image.height,
    license: image.license,
    licenseUrl: image.licenseUrl,
    providerLabel: "Wikimedia Commons",
    source: "wikimedia",
    thumbnailHeight: image.thumbnailHeight,
    thumbnailUrl: image.thumbnailUrl,
    thumbnailWidth: image.thumbnailWidth,
    title: image.title,
    width: image.width,
  };
}

function fromBroadWeb(image: BroadWebImageCandidate): WebImageCandidate {
  return {
    assetId: image.assetId,
    attribution: image.attribution,
    descriptionUrl: image.descriptionUrl,
    height: image.height,
    license: "Draft-testing reference",
    licenseUrl: null,
    providerLabel: image.providerLabel,
    source: "web",
    thumbnailHeight: image.thumbnailHeight,
    thumbnailUrl: image.thumbnailUrl,
    thumbnailWidth: image.thumbnailWidth,
    title: image.title,
    width: image.width,
  };
}

function fromOpenverse(image: OpenverseImageCandidate): WebImageCandidate {
  return {
    assetId: image.id,
    attribution: image.attribution,
    descriptionUrl: image.descriptionUrl,
    height: image.height,
    license: image.license,
    licenseUrl: image.licenseUrl,
    providerLabel: image.providerLabel,
    source: "openverse",
    thumbnailHeight: image.thumbnailHeight,
    thumbnailUrl: image.thumbnailUrl,
    thumbnailWidth: image.thumbnailWidth,
    title: image.title,
    width: image.width,
  };
}

function orderForFeaturedImage(left: WebImageCandidate, right: WebImageCandidate) {
  const score = (image: WebImageCandidate) => {
    const aspectRatio = image.width / image.height;
    const landscapeBonus = aspectRatio >= 1.2 && aspectRatio <= 2.2 ? 10_000_000 : 0;

    return landscapeBonus + image.width * image.height;
  };

  return score(right) - score(left);
}

export async function searchWebImages(
  query: string,
  scope: WebImageSearchScope = "broad",
) {
  const [broadResult, openverseResult, wikimediaResult] = await Promise.allSettled([
    scope === "broad" ? searchBroadWebImages(query) : Promise.resolve(null),
    searchLicensedOpenverseImages(query),
    searchLicensedWikimediaImages(query),
  ] as const);
  const images: WebImageCandidate[] = [];

  if (broadResult.status === "fulfilled" && broadResult.value) {
    images.push(...broadResult.value.map(fromBroadWeb));
  }

  if (openverseResult.status === "fulfilled") {
    images.push(...openverseResult.value.map(fromOpenverse));
  }

  if (wikimediaResult.status === "fulfilled") {
    images.push(...wikimediaResult.value.map(fromWikimedia));
  }

  const failures = [broadResult, openverseResult, wikimediaResult].filter(
    (result): result is PromiseRejectedResult => result.status === "rejected",
  );

  if (images.length === 0 && failures.length === (scope === "broad" ? 3 : 2)) {
    throw failures[0]?.reason;
  }

  return scope === "broad" ? images.slice(0, 30) : images.sort(orderForFeaturedImage).slice(0, 20);
}

export async function downloadWebImage(input: {
  assetId: string;
  source: WebImageSource;
}) {
  if (input.source === "web") {
    const downloaded = await downloadBroadWebImage(input.assetId);

    return {
      buffer: downloaded.buffer,
      candidate: fromBroadWeb(downloaded.candidate),
    };
  }

  if (input.source === "openverse") {
    const downloaded = await downloadLicensedOpenverseImage(input.assetId);

    return {
      buffer: downloaded.buffer,
      candidate: fromOpenverse(downloaded.candidate),
    };
  }

  const downloaded = await downloadLicensedWikimediaImage(input.assetId);

  return {
    buffer: downloaded.buffer,
    candidate: fromWikimedia(downloaded.candidate),
  };
}
