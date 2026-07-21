import {
  downloadLicensedOpenverseImage,
  searchLicensedOpenverseImages,
  type OpenverseImageCandidate,
} from "@/lib/openverse";
import {
  downloadLicensedWikimediaImage,
  searchLicensedWikimediaImages,
  type WikimediaImageCandidate,
} from "@/lib/wikimedia-commons";

export type WebImageSource = "wikimedia" | "openverse";

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

/**
 * Searches two independent, openly licensed catalogs. A temporary failure in
 * one catalog does not hide good results from the other.
 */
export async function searchLicensedWebImages(query: string) {
  const [openverse, wikimedia] = await Promise.allSettled([
    searchLicensedOpenverseImages(query),
    searchLicensedWikimediaImages(query),
  ]);
  const images: WebImageCandidate[] = [];

  if (openverse.status === "fulfilled") {
    images.push(...openverse.value.map(fromOpenverse));
  }

  if (wikimedia.status === "fulfilled") {
    images.push(...wikimedia.value.map(fromWikimedia));
  }

  if (images.length === 0 && openverse.status === "rejected" && wikimedia.status === "rejected") {
    throw openverse.reason;
  }

  return images.sort(orderForFeaturedImage).slice(0, 20);
}

export async function downloadLicensedWebImage(input: {
  assetId: string;
  source: WebImageSource;
}) {
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
