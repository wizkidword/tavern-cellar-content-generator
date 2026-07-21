import { formatDistanceToNow } from "date-fns";

import { refreshTopicClustersAction, syncWordPressCatalogAction } from "@/app/actions";
import { FoundryNav } from "@/app/foundry-nav";
import { getErrorFeedback } from "@/lib/errors/app-error";
import { getIntelligenceData } from "@/lib/intelligence/read-models";
import { requireOperatorPage } from "@/lib/operator-auth";

export const dynamic = "force-dynamic";

type IntelligencePageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function formatSyncTime(value: Date | null) {
  if (!value) {
    return "Never synced";
  }

  return `${formatDistanceToNow(value, { addSuffix: true })}`;
}

function formatClusterItemType(value: string) {
  return value.toLowerCase().replace("_", " ");
}

export default async function IntelligencePage({ searchParams }: IntelligencePageProps) {
  await requireOperatorPage();
  const params = searchParams ? await searchParams : undefined;
  const message = firstValue(params?.message);
  const error = firstValue(params?.error);
  const errorMessage = getErrorFeedback(error, firstValue(params?.ref));
  const intelligence = await getIntelligenceData();

  return (
    <main className="app-shell">
      <div className="mx-auto flex min-h-screen w-full max-w-[1600px] flex-col px-5 py-6 md:px-8 xl:px-10">
        <FoundryNav />

        <section className="panel panel-strong rounded-[2rem] p-6 md:p-8">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div>
              <p className="eyebrow mb-3">Tavern Coverage Map</p>
              <h1 className="display max-w-4xl text-4xl leading-none font-semibold text-[#fff1d7] md:text-5xl">
                Find the lanes that need the next useful Tavern Cellar article.
              </h1>
            </div>
            <div className="flex flex-wrap gap-3">
              <form action={refreshTopicClustersAction}>
                <button className="action-secondary" type="submit">
                  Refresh Topic Clusters
                </button>
              </form>
              <form action={syncWordPressCatalogAction.bind(null, "FULL_PRIVATE")}>
                <button className="action-secondary" type="submit">
                  Full private sync
                </button>
              </form>
              <form action={syncWordPressCatalogAction.bind(null, "PUBLIC_ONLY")}>
                <button className="action-secondary" type="submit">
                  Public-only sync
                </button>
              </form>
            </div>
          </div>

          {message ? <p className="message message-success mt-5">{message}</p> : null}
          {error ? <p className="message message-error mt-5">{errorMessage}</p> : null}

          <div className="metric-grid mt-8">
            <div className="metric-card">
              <p className="eyebrow mb-2">Synced Posts</p>
              <p className="metric-number">{intelligence.linkIndex.totalPosts}</p>
            </div>
            <div className="metric-card">
              <p className="eyebrow mb-2">Real Links</p>
              <p className="metric-number">{intelligence.linkIndex.postsWithLinks}</p>
            </div>
            <div className="metric-card">
              <p className="eyebrow mb-2">Full Private Sync</p>
              <p className="text-xl font-semibold text-[#fff4e1]">
                {formatSyncTime(intelligence.linkIndex.lastSuccessfulFullSyncAt)}
              </p>
              {intelligence.linkIndex.stale ? (
                <p className="mt-2 text-sm text-[#ffd2c7]">No recent successful full private sync.</p>
              ) : null}
              {intelligence.linkIndex.latestSyncRun?.mode === "PUBLIC_ONLY" ? (
                <p className="mt-2 text-sm text-[#ffd2c7]">
                  The latest run was public-only; it did not confirm missing private content.
                </p>
              ) : null}
            </div>
          </div>
        </section>

        <section className="panel mt-6 rounded-[2rem] p-6 md:p-8">
          <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="eyebrow mb-3">Topic Clusters</p>
              <h2 className="display text-3xl font-semibold text-[#fff1d7]">
                Coverage groups that can become stronger internal-link lanes.
              </h2>
            </div>
            <span className="status-pill status-healthy">
              {intelligence.topicClusters.length} visible
            </span>
          </div>

          {intelligence.topicClusters.length === 0 ? (
            <div className="rounded-[1.4rem] border border-dashed border-[var(--line)] px-5 py-8 text-[var(--muted)]">
              No high-confidence clusters yet. Sync WordPress history or add a few scored opportunities to give the map enough signal.
            </div>
          ) : (
            <div className="grid gap-5 xl:grid-cols-2">
              {intelligence.topicClusters.map((cluster) => (
                <article className="cluster-card" key={cluster.normalizedName}>
                  <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="eyebrow mb-2">{cluster.items.length} linked items</p>
                      <h3 className="text-2xl font-semibold text-[#fff4e1]">{cluster.name}</h3>
                    </div>
                    <span className="status-pill status-developing">
                      {cluster.categoryId ? `Lane ${cluster.categoryId}` : "Mixed lane"}
                    </span>
                  </div>

                  <div className="space-y-2">
                    {cluster.items.slice(0, 4).map((item) => (
                      <div
                        className="cluster-item"
                        key={`${cluster.normalizedName}-${item.itemType}-${item.sitePostId ?? item.articleId ?? item.opportunityId}`}
                      >
                        <span>{formatClusterItemType(item.itemType)}</span>
                        <strong>{item.label}</strong>
                        <em>{item.status.toLowerCase()}</em>
                      </div>
                    ))}
                  </div>

                  {cluster.missingSupportHints.length > 0 ? (
                    <div className="mt-4 space-y-2 text-sm leading-6 text-[#d7bf95]">
                      {cluster.missingSupportHints.map((hint) => (
                        <p key={hint}>{hint}</p>
                      ))}
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="mt-6 grid gap-5 lg:grid-cols-2">
          {intelligence.lanes.map((lane) => (
            <article className="panel rounded-[1.6rem] p-5" key={lane.categoryId}>
              <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="eyebrow mb-2">{lane.balanceLabel}</p>
                  <h2 className="display text-3xl font-semibold text-[#fff1d7]">{lane.name}</h2>
                </div>
                <span className={`status-pill status-${lane.balanceLabel}`}>{lane.slug}</span>
              </div>

              <div className="grid gap-3 sm:grid-cols-4">
                <div className="mini-stat">
                  <span>Live</span>
                  <strong>{lane.counts.live}</strong>
                </div>
                <div className="mini-stat">
                  <span>Draft</span>
                  <strong>{lane.counts.draft}</strong>
                </div>
                <div className="mini-stat">
                  <span>Scheduled</span>
                  <strong>{lane.counts.scheduled}</strong>
                </div>
                <div className="mini-stat">
                  <span>Generated</span>
                  <strong>{lane.counts.generated}</strong>
                </div>
              </div>

              <div className="mt-5 space-y-2 text-sm leading-6 text-[var(--muted)]">
                {lane.evidence.length === 0 ? (
                  <p>This lane has usable coverage and no immediate sync warnings.</p>
                ) : (
                  lane.evidence.map((line) => <p key={line}>{line}</p>)
                )}
              </div>
            </article>
          ))}
        </section>
      </div>
    </main>
  );
}
