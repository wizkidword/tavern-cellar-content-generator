import { AppError } from "@/lib/errors/app-error";
import { fetchWithPolicy } from "@/lib/http/fetch-policy";
import { readSafeRemoteImage } from "@/lib/images/validate-image";

const OPENVERSE_API_URL = "https://api.openverse.org";
const OPENVERSE_API_HOSTNAME = "api.openverse.org";
const FLICKR_IMAGE_HOSTNAME = "live.staticflickr.com";
const ACCEPTED_LICENSES = new Set(["by", "by-sa", "cc0", "pdm"]);

type OpenverseImageRecord = {
  creator?: string | null;
  foreign_landing_url?: string | null;
  height?: number | null;
  id?: string | null;
  license?: string | null;
  license_url?: string | null;
  license_version?: string | null;
  mature?: boolean | null;
  source?: string | null;
  thumbnail?: string | null;
  title?: string | null;
  url?: string | null;
  width?: number | null;
};

type OpenverseSearchResponse = {
  results?: OpenverseImageRecord[];
};

export type OpenverseImageCandidate = {
  attribution: string;
  descriptionUrl: string;
  id: string;
  height: number;
  license: string;
  licenseUrl: string | null;
  providerLabel: string;
  thumbnailHeight: number;
  thumbnailUrl: string;
  thumbnailWidth: number;
  title: string;
  width: number;
};

type OpenverseImageRecordWithOriginal = OpenverseImageCandidate & {
  originalUrl: string;
};

function safeHttpsUrl(value: string | null | undefined, hostname?: string) {
  if (!value?.trim()) {
    return null;
  }

  try {
    const url = new URL(value);

    if (url.protocol !== "https:" || (hostname && url.hostname !== hostname)) {
      return null;
    }

    return url.toString();
  } catch {
    return null;
  }
}

function safeFlickrImageUrl(value: string | null | undefined) {
  return safeHttpsUrl(value, FLICKR_IMAGE_HOSTNAME);
}

function text(value: string | null | undefined) {
  return value?.replace(/\s+/g, " ").trim() ?? "";
}

function licenseLabel(license: string, version: string) {
  const licenseName =
    license === "pdm"
      ? "Public Domain Mark"
      : license === "cc0"
        ? "CC0"
        : license === "by-sa"
          ? "CC BY-SA"
          : "CC BY";

  return version ? `${licenseName} ${version}` : licenseName;
}

function recordFromOpenverse(record: OpenverseImageRecord): OpenverseImageRecordWithOriginal | null {
  const id = text(record.id);
  const source = text(record.source).toLowerCase();
  const license = text(record.license).toLowerCase();
  const originalUrl = safeFlickrImageUrl(record.url);
  const descriptionUrl = safeHttpsUrl(record.foreign_landing_url);
  const thumbnailUrl = safeHttpsUrl(record.thumbnail, OPENVERSE_API_HOSTNAME);
  const width = Math.floor(record.width ?? 0);
  const height = Math.floor(record.height ?? 0);

  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) ||
    source !== "flickr" ||
    !ACCEPTED_LICENSES.has(license) ||
    record.mature === true ||
    !originalUrl ||
    !descriptionUrl ||
    !thumbnailUrl ||
    width < 640 ||
    height < 360
  ) {
    return null;
  }

  const creator = text(record.creator) || "Flickr contributor";
  const readableLicense = licenseLabel(license, text(record.license_version));

  return {
    attribution: `${creator} via Openverse / Flickr · ${readableLicense}`,
    descriptionUrl,
    height,
    id,
    license: readableLicense,
    licenseUrl: safeHttpsUrl(record.license_url),
    originalUrl,
    providerLabel: "Openverse / Flickr",
    thumbnailHeight: height,
    thumbnailUrl,
    thumbnailWidth: width,
    title: text(record.title) || "Openverse image",
    width,
  };
}

function toCandidate(record: OpenverseImageRecordWithOriginal): OpenverseImageCandidate {
  return {
    attribution: record.attribution,
    descriptionUrl: record.descriptionUrl,
    height: record.height,
    id: record.id,
    license: record.license,
    licenseUrl: record.licenseUrl,
    providerLabel: record.providerLabel,
    thumbnailHeight: record.thumbnailHeight,
    thumbnailUrl: record.thumbnailUrl,
    thumbnailWidth: record.thumbnailWidth,
    title: record.title,
    width: record.width,
  };
}

function openverseUrl(pathname: string, query: Record<string, string> = {}) {
  const url = new URL(pathname, OPENVERSE_API_URL);

  for (const [key, value] of Object.entries(query)) {
    url.searchParams.set(key, value);
  }

  return url;
}

async function fetchOpenverseJson<T>(url: URL) {
  const response = await fetchWithPolicy(
    url,
    {
      cache: "no-store",
      headers: {
        Accept: "application/json",
        "User-Agent": "TavernCellarFoundry/0.1 (draft-image search; https://taverncellar.com)",
      },
    },
    { service: "image", timeoutMs: 12_000, retries: 1 },
  );

  if (!response.ok) {
    throw new AppError("IMAGE_OPERATION_FAILED", { retryable: response.status >= 500 || response.status === 429 });
  }

  try {
    return (await response.json()) as T;
  } catch (error) {
    throw new AppError("IMAGE_OPERATION_FAILED", { cause: error });
  }
}

function orderForFeaturedImage(left: OpenverseImageCandidate, right: OpenverseImageCandidate) {
  const score = (image: OpenverseImageCandidate) => {
    const aspectRatio = image.width / image.height;
    const landscapeBonus = aspectRatio >= 1.2 && aspectRatio <= 2.2 ? 10_000_000 : 0;

    return landscapeBonus + image.width * image.height;
  };

  return score(right) - score(left);
}

export async function searchLicensedOpenverseImages(query: string) {
  const normalizedQuery = query.trim();

  if (normalizedQuery.length < 3 || normalizedQuery.length > 180) {
    throw new AppError("VALIDATION_FAILED");
  }

  const response = await fetchOpenverseJson<OpenverseSearchResponse>(
    openverseUrl("/v1/images/", {
      license: "by,by-sa,cc0,pdm",
      page_size: "18",
      q: normalizedQuery,
      source: "flickr",
    }),
  );

  return (response.results ?? [])
    .map(recordFromOpenverse)
    .filter((record): record is OpenverseImageRecordWithOriginal => Boolean(record))
    .map(toCandidate)
    .sort(orderForFeaturedImage);
}

export async function downloadLicensedOpenverseImage(id: string) {
  const normalizedId = id.trim();

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(normalizedId)) {
    throw new AppError("VALIDATION_FAILED");
  }

  const detail = await fetchOpenverseJson<OpenverseImageRecord>(
    openverseUrl(`/v1/images/${encodeURIComponent(normalizedId)}/`),
  );
  const record = recordFromOpenverse(detail);

  if (!record) {
    throw new AppError("IMAGE_DOWNLOAD_INVALID");
  }

  const response = await fetchWithPolicy(
    record.originalUrl,
    { cache: "no-store" },
    { service: "image", timeoutMs: 20_000, retries: 1 },
  );

  if (!response.ok) {
    throw new AppError("IMAGE_DOWNLOAD_INVALID", { retryable: response.status >= 500 });
  }

  return {
    candidate: toCandidate(record),
    buffer: await readSafeRemoteImage(response),
  };
}
