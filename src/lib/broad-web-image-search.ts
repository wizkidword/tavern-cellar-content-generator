import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

import { AppError } from "@/lib/errors/app-error";
import { fetchWithPolicy } from "@/lib/http/fetch-policy";
import { readSafeRemoteImage } from "@/lib/images/validate-image";

const DUCKDUCKGO_SEARCH_URL = "https://duckduckgo.com/";
const DUCKDUCKGO_IMAGE_SEARCH_URL = "https://duckduckgo.com/i.js";
const MAX_SELECTION_TOKEN_LENGTH = 4_096;
const TRUSTED_EDITORIAL_HOSTS = [
  "avclub.com",
  "comingsoon.net",
  "deadline.com",
  "ew.com",
  "fandom.com",
  "hbo.com",
  "imdb.com",
  "max.com",
  "primevideo.com",
  "rottentomatoes.com",
  "screenrant.com",
  "thewrap.com",
  "tvguide.com",
  "variety.com",
  "vulture.com",
];
const LOW_QUALITY_HOST_FRAGMENTS = [
  "blogspot.",
  "displate.",
  "googleusercontent.",
  "storage.googleapis.com",
  "weebly.com",
];
const NUMBER_WORDS: Record<string, string> = {
  eight: "8",
  eighteen: "18",
  eleven: "11",
  fifteen: "15",
  five: "5",
  four: "4",
  fourteen: "14",
  nine: "9",
  nineteen: "19",
  one: "1",
  seven: "7",
  seventeen: "17",
  sixteen: "16",
  six: "6",
  ten: "10",
  thirteen: "13",
  three: "3",
  twelve: "12",
  twenty: "20",
  two: "2",
};
const EPISODE_NUMBER_PATTERN = "(?:\\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)";

type DuckDuckGoImageResult = {
  height?: number | string;
  image?: string;
  thumbnail?: string;
  title?: string;
  url?: string;
  width?: number | string;
};

type DuckDuckGoImageSearchResponse = {
  results?: DuckDuckGoImageResult[];
};

type BroadWebImageSelection = {
  descriptionUrl: string;
  height: number;
  imageUrl: string;
  thumbnailUrl: string;
  title: string;
  width: number;
};

export type BroadWebImageCandidate = {
  assetId: string;
  attribution: string;
  descriptionUrl: string;
  height: number;
  providerLabel: string;
  thumbnailHeight: number;
  thumbnailUrl: string;
  thumbnailWidth: number;
  title: string;
  width: number;
};

function normalizedText(value: string | undefined) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function numberValue(value: number | string | undefined) {
  const number = Number(value);

  return Number.isFinite(number) ? Math.floor(number) : 0;
}

function safeHttpsUrl(value: string | undefined) {
  if (!value?.trim()) {
    return null;
  }

  try {
    const url = new URL(value);

    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      (url.port && url.port !== "443") ||
      !url.hostname
    ) {
      return null;
    }

    return url.toString();
  } catch {
    return null;
  }
}

function isPublicIpv4(value: string) {
  const octets = value.split(".").map(Number);

  if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) {
    return false;
  }

  const [first, second] = octets;

  return !(
    first === 0 ||
    first === 10 ||
    first === 127 ||
    first >= 224 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 0) ||
    (first === 192 && second === 168) ||
    (first === 198 && (second === 18 || second === 19)) ||
    (first === 198 && second === 51) ||
    (first === 203 && second === 0)
  );
}

function isPublicIp(value: string) {
  if (isIP(value) === 4) {
    return isPublicIpv4(value);
  }

  const normalized = value.toLowerCase();

  return !(
    normalized === "::" ||
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe8") ||
    normalized.startsWith("fe9") ||
    normalized.startsWith("fea") ||
    normalized.startsWith("feb") ||
    normalized.startsWith("2001:db8") ||
    normalized.startsWith("::ffff:127.") ||
    normalized.startsWith("::ffff:10.") ||
    normalized.startsWith("::ffff:192.168.")
  );
}

async function assertPublicImageUrl(value: string) {
  const url = safeHttpsUrl(value);

  if (!url) {
    throw new AppError("IMAGE_DOWNLOAD_INVALID");
  }

  const parsed = new URL(url);
  const hostname = parsed.hostname.toLowerCase();

  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal") ||
    isIP(hostname) !== 0
  ) {
    throw new AppError("IMAGE_DOWNLOAD_INVALID");
  }

  try {
    const addresses = await lookup(hostname, { all: true, verbatim: true });

    if (addresses.length === 0 || addresses.some((address) => !isPublicIp(address.address))) {
      throw new AppError("IMAGE_DOWNLOAD_INVALID");
    }
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    throw new AppError("IMAGE_DOWNLOAD_INVALID", { cause: error });
  }

  return url;
}

function encodeSelection(selection: BroadWebImageSelection) {
  return Buffer.from(JSON.stringify(selection)).toString("base64url");
}

function decodeSelection(value: string): BroadWebImageSelection {
  if (!value || value.length > MAX_SELECTION_TOKEN_LENGTH) {
    throw new AppError("VALIDATION_FAILED");
  }

  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as BroadWebImageSelection;
    const imageUrl = safeHttpsUrl(parsed.imageUrl);
    const descriptionUrl = safeHttpsUrl(parsed.descriptionUrl);
    const thumbnailUrl = safeHttpsUrl(parsed.thumbnailUrl);
    const title = normalizedText(parsed.title);
    const width = numberValue(parsed.width);
    const height = numberValue(parsed.height);

    if (!imageUrl || !descriptionUrl || !thumbnailUrl || !title || width < 1 || height < 1) {
      throw new AppError("VALIDATION_FAILED");
    }

    return { descriptionUrl, height, imageUrl, thumbnailUrl, title, width };
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    throw new AppError("VALIDATION_FAILED", { cause: error });
  }
}

function hostMatches(hostname: string, domain: string) {
  return hostname === domain || hostname.endsWith(`.${domain}`);
}

function queryWords(query: string) {
  return Array.from(
    new Set(
      query
        .toLowerCase()
        .match(/[a-z0-9]+/g)
        ?.filter((word) => word.length > 1) ?? [],
    ),
  ).slice(0, 12);
}

function episodePair(text: string) {
  const compact = /\bs(\d{1,2})e(\d{1,2})\b/i.exec(text);

  if (compact) {
    return { episode: compact[2], season: compact[1] };
  }

  const season = new RegExp(`\\b(?:season|s)\\s*#?(${EPISODE_NUMBER_PATTERN})\\b`, "i").exec(text)?.[1];
  const episode = new RegExp(`\\b(?:episode|ep|e)\\s*#?(${EPISODE_NUMBER_PATTERN})\\b`, "i").exec(text)?.[1];

  return season && episode
    ? {
        episode: NUMBER_WORDS[episode.toLowerCase()] ?? episode,
        season: NUMBER_WORDS[season.toLowerCase()] ?? season,
      }
    : null;
}

function providerQuery(query: string) {
  const episode = episodePair(query);

  return episode ? `${query} "Season ${episode.season}" "Episode ${episode.episode}"` : query;
}

function matchesQualityAndRelevance(result: DuckDuckGoImageResult, query: string) {
  const title = normalizedText(result.title).toLowerCase();
  const descriptionUrl = safeHttpsUrl(result.url);
  const hostname = descriptionUrl ? new URL(descriptionUrl).hostname.toLowerCase().replace(/^www\./, "") : "";
  const words = queryWords(query);
  const matchingWords = words.filter((word) => new RegExp(`\\b${word}\\b`, "i").test(title)).length;
  const requestedEpisode = episodePair(query);
  const resultEpisode = episodePair(title);
  const hasMismatchedEpisode =
    requestedEpisode &&
    resultEpisode &&
    (requestedEpisode.season !== resultEpisode.season || requestedEpisode.episode !== resultEpisode.episode);
  const trustedSource = TRUSTED_EDITORIAL_HOSTS.some((domain) => hostMatches(hostname, domain));
  const lowQualityHost = LOW_QUALITY_HOST_FRAGMENTS.some((fragment) => hostname.includes(fragment));
  const suspiciousText = /\b(?:free download|stream free|watch online|burning series)\b/i.test(title);

  if (lowQualityHost || suspiciousText || hasMismatchedEpisode) {
    return false;
  }

  if (trustedSource && requestedEpisode) {
    return Boolean(resultEpisode) || matchingWords >= Math.max(4, Math.ceil(words.length * 0.75));
  }

  if (trustedSource) {
    return matchingWords >= Math.min(2, words.length);
  }

  if (requestedEpisode && resultEpisode) {
    return true;
  }

  return matchingWords >= Math.max(2, Math.ceil(words.length * 0.6));
}

function qualityScore(result: DuckDuckGoImageResult, query: string) {
  const title = normalizedText(result.title).toLowerCase();
  const descriptionUrl = safeHttpsUrl(result.url);
  const hostname = descriptionUrl ? new URL(descriptionUrl).hostname.toLowerCase().replace(/^www\./, "") : "";
  const words = queryWords(query);
  const matchingWords = words.filter((word) => new RegExp(`\\b${word}\\b`, "i").test(title)).length;
  const requestedEpisode = episodePair(query);
  const resultEpisode = episodePair(title);
  const hasMismatchedEpisode =
    requestedEpisode &&
    resultEpisode &&
    (requestedEpisode.season !== resultEpisode.season || requestedEpisode.episode !== resultEpisode.episode);
  const trustedSource = TRUSTED_EDITORIAL_HOSTS.some((domain) => hostMatches(hostname, domain));
  const lowQualityHost = LOW_QUALITY_HOST_FRAGMENTS.some((fragment) => hostname.includes(fragment));
  const suspiciousText = /\b(?:free download|stream free|watch online|burning series)\b/i.test(title);
  const resolution = numberValue(result.width) * numberValue(result.height);

  return (
    matchingWords * 20_000_000 +
    (requestedEpisode && resultEpisode && !hasMismatchedEpisode ? 200_000_000 : 0) +
    (hasMismatchedEpisode ? -200_000_000 : 0) +
    (trustedSource ? 25_000_000 : 0) +
    (lowQualityHost ? -100_000_000 : 0) +
    (suspiciousText ? -75_000_000 : 0) +
    resolution
  );
}

function createCandidate(result: DuckDuckGoImageResult): BroadWebImageCandidate | null {
  const imageUrl = safeHttpsUrl(result.image);
  const descriptionUrl = safeHttpsUrl(result.url);
  const thumbnailUrl = safeHttpsUrl(result.thumbnail);
  const title = normalizedText(result.title);
  const width = numberValue(result.width);
  const height = numberValue(result.height);
  const aspectRatio = width / height;

  if (
    !imageUrl ||
    !descriptionUrl ||
    !thumbnailUrl ||
    !title ||
    width < 1_000 ||
    height < 560 ||
    aspectRatio < 1.2 ||
    aspectRatio > 2.5
  ) {
    return null;
  }

  const sourceHost = new URL(descriptionUrl).hostname.replace(/^www\./, "");
  const selection = { descriptionUrl, height, imageUrl, thumbnailUrl, title, width };

  return {
    assetId: encodeSelection(selection),
    attribution: `Draft web reference from ${sourceHost}`,
    descriptionUrl,
    height,
    providerLabel: "Broad web (testing)",
    thumbnailHeight: height,
    thumbnailUrl,
    thumbnailWidth: width,
    title,
    width,
  };
}

function orderForFeaturedImage(query: string) {
  return (left: DuckDuckGoImageResult, right: DuckDuckGoImageResult) => qualityScore(right, query) - qualityScore(left, query);
}

async function fetchDuckDuckGoToken(query: string) {
  const url = new URL(DUCKDUCKGO_SEARCH_URL);
  url.searchParams.set("ia", "images");
  url.searchParams.set("iax", "images");
  url.searchParams.set("q", query);
  const response = await fetchWithPolicy(
    url,
    {
      cache: "no-store",
      headers: {
        Accept: "text/html",
        "User-Agent": "Mozilla/5.0 (compatible; TavernCellarFoundry/0.1; draft-image testing)",
      },
    },
    { service: "image", timeoutMs: 12_000, retries: 1 },
  );

  if (!response.ok) {
    throw new AppError("IMAGE_OPERATION_FAILED", { retryable: response.status >= 500 || response.status === 429 });
  }

  const html = await response.text();
  const token = /vqd=["']([^"']+)/i.exec(html)?.[1]?.trim();

  if (!token) {
    throw new AppError("IMAGE_OPERATION_FAILED");
  }

  return token;
}

export async function searchBroadWebImages(query: string) {
  const normalizedQuery = query.trim();

  if (normalizedQuery.length < 3 || normalizedQuery.length > 180) {
    throw new AppError("VALIDATION_FAILED");
  }

  const searchQuery = providerQuery(normalizedQuery);
  const token = await fetchDuckDuckGoToken(searchQuery);
  const url = new URL(DUCKDUCKGO_IMAGE_SEARCH_URL);
  url.searchParams.set("l", "us-en");
  url.searchParams.set("o", "json");
  url.searchParams.set("p", "1");
  url.searchParams.set("q", searchQuery);
  url.searchParams.set("vqd", token);
  const response = await fetchWithPolicy(
    url,
    {
      cache: "no-store",
      headers: {
        Accept: "application/json",
        "User-Agent": "Mozilla/5.0 (compatible; TavernCellarFoundry/0.1; draft-image testing)",
      },
    },
    { service: "image", timeoutMs: 12_000, retries: 1 },
  );

  if (!response.ok) {
    throw new AppError("IMAGE_OPERATION_FAILED", { retryable: response.status >= 500 || response.status === 429 });
  }

  try {
    const payload = (await response.json()) as DuckDuckGoImageSearchResponse;

    const seenDescriptions = new Set<string>();

    const candidates = (payload.results ?? [])
      .sort(orderForFeaturedImage(normalizedQuery))
      .filter((result) => matchesQualityAndRelevance(result, normalizedQuery))
      .map(createCandidate)
      .filter((candidate): candidate is BroadWebImageCandidate => Boolean(candidate));

    return candidates
      .filter((candidate) => {
        if (seenDescriptions.has(candidate.descriptionUrl)) {
          return false;
        }

        seenDescriptions.add(candidate.descriptionUrl);
        return true;
      })
      .slice(0, 30);
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    throw new AppError("IMAGE_OPERATION_FAILED", { cause: error });
  }
}

export async function downloadBroadWebImage(assetId: string) {
  const selection = decodeSelection(assetId);
  const imageUrl = await assertPublicImageUrl(selection.imageUrl);
  const response = await fetchWithPolicy(
    imageUrl,
    {
      cache: "no-store",
      headers: { Accept: "image/avif,image/webp,image/png,image/jpeg" },
      redirect: "error",
    },
    { service: "image", timeoutMs: 20_000, retries: 1 },
  );

  if (!response.ok) {
    throw new AppError("IMAGE_DOWNLOAD_INVALID", { retryable: response.status >= 500 });
  }

  return {
    buffer: await readSafeRemoteImage(response),
    candidate: {
      assetId,
      attribution: `Draft web reference from ${new URL(selection.descriptionUrl).hostname.replace(/^www\./, "")}`,
      descriptionUrl: selection.descriptionUrl,
      height: selection.height,
      providerLabel: "Broad web (testing)",
      thumbnailHeight: selection.height,
      thumbnailUrl: selection.thumbnailUrl,
      thumbnailWidth: selection.width,
      title: selection.title,
      width: selection.width,
    },
  };
}
