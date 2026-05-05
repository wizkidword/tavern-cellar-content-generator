export type CoverageBalanceLabel = "quiet" | "developing" | "healthy" | "overloaded";

export type CoverageCategory = {
  id: number;
  wpCategoryId: number;
  name: string;
  slug: string;
};

export type CoverageSitePost = {
  id: string;
  primaryCategoryId: number | null;
  rawCategoryIds: string;
  wpStatus: string;
  publishedAt: Date | null;
  lastSyncedAt: Date;
};

export type CoverageArticle = {
  id: string;
  categoryId: number;
  status: string;
  createdAt: Date;
};

export type CoverageInput = {
  now?: Date;
  categories: CoverageCategory[];
  sitePosts: CoverageSitePost[];
  articles: CoverageArticle[];
};

export type CoverageLane = {
  categoryId: number;
  wpCategoryId: number;
  name: string;
  slug: string;
  counts: {
    live: number;
    draft: number;
    scheduled: number;
    generated: number;
    localArticles: number;
    staleSyncedPosts: number;
  };
  latestSyncAt: Date | null;
  syncIsStale: boolean;
  balanceLabel: CoverageBalanceLabel;
  evidence: string[];
};

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function parseRawCategoryIds(rawCategoryIds: string) {
  try {
    const parsed = JSON.parse(rawCategoryIds) as unknown;

    if (Array.isArray(parsed)) {
      return parsed.filter((item): item is number => typeof item === "number");
    }
  } catch {
    // Fall through to plain string parsing for older or hand-authored rows.
  }

  return rawCategoryIds
    .split(/[^0-9]+/)
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));
}

function sitePostBelongsToCategory(post: CoverageSitePost, category: CoverageCategory) {
  return (
    post.primaryCategoryId === category.id ||
    parseRawCategoryIds(post.rawCategoryIds).includes(category.wpCategoryId)
  );
}

function isStatus(status: string, values: string[]) {
  return values.includes(status.toLowerCase());
}

function coverageLabel(counts: CoverageLane["counts"]): CoverageBalanceLabel {
  if (counts.live === 0) {
    return "quiet";
  }

  if (counts.live < 5) {
    return "developing";
  }

  if (counts.live > 25 || (counts.live > 15 && counts.localArticles > 8)) {
    return "overloaded";
  }

  return "healthy";
}

function buildEvidence(counts: CoverageLane["counts"], syncIsStale: boolean) {
  const evidence: string[] = [];

  if (counts.live === 0) {
    evidence.push("No live posts in this lane yet.");
  }

  if (counts.scheduled === 0) {
    evidence.push("No scheduled posts in this lane.");
  }

  if (counts.live >= 10 && counts.generated === 0 && counts.scheduled === 0) {
    evidence.push("Live coverage is healthy but the draft pipeline is empty.");
  }

  if (counts.live > 25) {
    evidence.push("This lane has heavy live coverage; new ideas need a sharper angle.");
  }

  if (syncIsStale) {
    evidence.push("WordPress sync data is older than 24 hours.");
  }

  return evidence;
}

export function buildCoverageMap(input: CoverageInput): CoverageLane[] {
  const now = input.now ?? new Date();

  return input.categories.map((category) => {
    const sitePosts = input.sitePosts.filter((post) => sitePostBelongsToCategory(post, category));
    const articles = input.articles.filter((article) => article.categoryId === category.id);
    const latestSyncAt = sitePosts.reduce<Date | null>((latest, post) => {
      if (!latest || post.lastSyncedAt > latest) {
        return post.lastSyncedAt;
      }

      return latest;
    }, null);
    const syncIsStale = !latestSyncAt || now.getTime() - latestSyncAt.getTime() > ONE_DAY_MS;
    const counts = {
      live: sitePosts.filter((post) => isStatus(post.wpStatus, ["publish", "published"])).length,
      draft:
        sitePosts.filter((post) => isStatus(post.wpStatus, ["draft"])).length +
        articles.filter((article) => isStatus(article.status, ["wp_draft"])).length,
      scheduled:
        sitePosts.filter((post) => isStatus(post.wpStatus, ["future", "scheduled"])).length +
        articles.filter((article) => isStatus(article.status, ["scheduled"])).length,
      generated: articles.filter((article) =>
        isStatus(article.status, ["generated", "ready_for_review"]),
      ).length,
      localArticles: articles.length,
      staleSyncedPosts: sitePosts.filter((post) => now.getTime() - post.lastSyncedAt.getTime() > ONE_DAY_MS)
        .length,
    };
    const balanceLabel = coverageLabel(counts);

    return {
      categoryId: category.id,
      wpCategoryId: category.wpCategoryId,
      name: category.name,
      slug: category.slug,
      counts,
      latestSyncAt,
      syncIsStale,
      balanceLabel,
      evidence: buildEvidence(counts, syncIsStale),
    };
  });
}
