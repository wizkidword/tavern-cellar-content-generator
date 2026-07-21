import { AppError } from "@/lib/errors/app-error";
import { fetchWithPolicy } from "@/lib/http/fetch-policy";
import { readSafeRemoteImage } from "@/lib/images/validate-image";

const COMMONS_API_URL = "https://commons.wikimedia.org/w/api.php";
const COMMONS_HOSTNAME = "commons.wikimedia.org";
const UPLOAD_HOSTNAME = "upload.wikimedia.org";
const ACCEPTED_IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

type WikimediaMetadata = {
  value?: string;
};

type WikimediaImageInfo = {
  descriptionurl?: string;
  extmetadata?: Record<string, WikimediaMetadata | undefined>;
  height?: number;
  mime?: string;
  thumbheight?: number;
  thumburl?: string;
  thumbwidth?: number;
  url?: string;
  width?: number;
};

type WikimediaPage = {
  imageinfo?: WikimediaImageInfo[];
  title?: string;
};

type WikimediaSearchResponse = {
  query?: {
    search?: Array<{
      title?: string;
    }>;
  };
};

type WikimediaImageInfoResponse = {
  query?: {
    pages?: Record<string, WikimediaPage | undefined>;
  };
};

type WikimediaImageRecord = WikimediaImageCandidate & {
  originalUrl: string;
};

export type WikimediaImageCandidate = {
  attribution: string;
  descriptionUrl: string;
  fileTitle: string;
  height: number;
  license: string;
  licenseUrl: string | null;
  thumbnailHeight: number;
  thumbnailUrl: string;
  thumbnailWidth: number;
  title: string;
  width: number;
};

function normalizeText(value: string | undefined) {
  return (value ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function urlForHost(value: string | undefined, hostname: string) {
  if (!value) {
    return null;
  }

  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === hostname ? url.toString() : null;
  } catch {
    return null;
  }
}

function safeExternalUrl(value: string | undefined) {
  if (!value) {
    return null;
  }

  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function isReusableLicense(value: string) {
  const normalized = value.toLowerCase().replace(/[-_]/g, " ").replace(/\s+/g, " ");

  if (
    !normalized ||
    normalized.includes("noncommercial") ||
    normalized.includes("no derivatives") ||
    /\bcc by (?:nc|nd)\b/.test(normalized)
  ) {
    return false;
  }

  return (
    normalized.includes("public domain") ||
    normalized.includes("cc0") ||
    normalized.includes("cc by") ||
    normalized.includes("creative commons attribution")
  );
}

function toCandidate(record: WikimediaImageRecord): WikimediaImageCandidate {
  return {
    attribution: record.attribution,
    descriptionUrl: record.descriptionUrl,
    fileTitle: record.fileTitle,
    height: record.height,
    license: record.license,
    licenseUrl: record.licenseUrl,
    thumbnailHeight: record.thumbnailHeight,
    thumbnailUrl: record.thumbnailUrl,
    thumbnailWidth: record.thumbnailWidth,
    title: record.title,
    width: record.width,
  };
}

function displayTitle(fileTitle: string) {
  return fileTitle
    .replace(/^File:/i, "")
    .replace(/\.[a-z0-9]{2,5}$/i, "")
    .replace(/[_-]+/g, " ")
    .trim();
}

function recordFromPage(page: WikimediaPage | undefined): WikimediaImageRecord | null {
  const fileTitle = page?.title?.trim() ?? "";
  const info = page?.imageinfo?.[0];

  if (!fileTitle.startsWith("File:") || !info || !ACCEPTED_IMAGE_MIME_TYPES.has(info.mime ?? "")) {
    return null;
  }

  const descriptionUrl = urlForHost(info.descriptionurl, COMMONS_HOSTNAME);
  const originalUrl = urlForHost(info.url, UPLOAD_HOSTNAME);
  const thumbnailUrl = urlForHost(info.thumburl, UPLOAD_HOSTNAME);
  const metadata = info.extmetadata ?? {};
  const license = normalizeText(metadata.LicenseShortName?.value || metadata.UsageTerms?.value);

  if (!descriptionUrl || !originalUrl || !thumbnailUrl || !isReusableLicense(license)) {
    return null;
  }

  const author = normalizeText(metadata.Artist?.value || metadata.Credit?.value) || "Wikimedia Commons contributor";
  const width = Math.floor(info.width ?? 0);
  const height = Math.floor(info.height ?? 0);
  const thumbnailWidth = Math.floor(info.thumbwidth ?? width);
  const thumbnailHeight = Math.floor(info.thumbheight ?? height);

  if (width < 320 || height < 180 || thumbnailWidth <= 0 || thumbnailHeight <= 0) {
    return null;
  }

  return {
    attribution: `${author} via Wikimedia Commons · ${license}`,
    descriptionUrl,
    fileTitle,
    height,
    license,
    licenseUrl: safeExternalUrl(metadata.LicenseUrl?.value),
    originalUrl,
    thumbnailHeight,
    thumbnailUrl,
    thumbnailWidth,
    title: displayTitle(fileTitle),
    width,
  };
}

async function fetchCommonsJson<T>(parameters: Record<string, string>) {
  const url = new URL(COMMONS_API_URL);

  for (const [key, value] of Object.entries({
    action: "query",
    format: "json",
    origin: "*",
    ...parameters,
  })) {
    url.searchParams.set(key, value);
  }

  const response = await fetchWithPolicy(
    url,
    {
      cache: "no-store",
      headers: {
        Accept: "application/json",
        "User-Agent": "TavernCellarFoundry/0.1 (licensed-image search; https://taverncellar.com)",
      },
    },
    { service: "image", timeoutMs: 12_000, retries: 1 },
  );

  if (!response.ok) {
    throw new AppError("IMAGE_OPERATION_FAILED", { retryable: response.status >= 500 });
  }

  try {
    return (await response.json()) as T;
  } catch (error) {
    throw new AppError("IMAGE_OPERATION_FAILED", { cause: error });
  }
}

async function findImageRecords(fileTitles: string[]) {
  if (fileTitles.length === 0) {
    return [];
  }

  const response = await fetchCommonsJson<WikimediaImageInfoResponse>({
    iiextmetadatafilter: "Artist|Credit|LicenseShortName|LicenseUrl|UsageTerms",
    iiprop: "url|mime|size|extmetadata",
    iiurlwidth: "640",
    prop: "imageinfo",
    redirects: "1",
    titles: fileTitles.join("|"),
  });

  return Object.values(response.query?.pages ?? {})
    .map(recordFromPage)
    .filter((record): record is WikimediaImageRecord => Boolean(record));
}

export async function searchLicensedWikimediaImages(query: string) {
  const normalizedQuery = query.trim();

  if (normalizedQuery.length < 3 || normalizedQuery.length > 180) {
    throw new AppError("VALIDATION_FAILED");
  }

  const search = await fetchCommonsJson<WikimediaSearchResponse>({
    list: "search",
    srlimit: "12",
    srnamespace: "6",
    srsearch: normalizedQuery,
  });
  const titles = (search.query?.search ?? [])
    .map((result) => result.title?.trim() ?? "")
    .filter((title) => title.startsWith("File:"));
  const records = await findImageRecords(titles);
  const recordsByTitle = new Map(records.map((record) => [record.fileTitle, record]));

  return titles
    .map((title) => recordsByTitle.get(title))
    .filter((record): record is WikimediaImageRecord => Boolean(record))
    .map(toCandidate);
}

export async function downloadLicensedWikimediaImage(fileTitle: string) {
  const normalizedTitle = fileTitle.trim();

  if (
    normalizedTitle.length < 6 ||
    normalizedTitle.length > 300 ||
    !normalizedTitle.startsWith("File:") ||
    /[\r\n]/.test(normalizedTitle)
  ) {
    throw new AppError("VALIDATION_FAILED");
  }

  const record = (await findImageRecords([normalizedTitle]))[0];

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
