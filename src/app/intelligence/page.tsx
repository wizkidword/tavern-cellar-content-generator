import { formatDistanceToNow } from "date-fns";

import { syncWordPressCatalogAction } from "@/app/actions";
import { FoundryNav } from "@/app/foundry-nav";
import { getIntelligenceData } from "@/lib/intelligence/read-models";

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

export default async function IntelligencePage({ searchParams }: IntelligencePageProps) {
  const params = searchParams ? await searchParams : undefined;
  const message = firstValue(params?.message);
  const error = firstValue(params?.error);
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
            <form action={syncWordPressCatalogAction}>
              <button className="action-secondary" type="submit">
                Sync WordPress History
              </button>
            </form>
          </div>

          {message ? <p className="message message-success mt-5">{message}</p> : null}
          {error ? <p className="message message-error mt-5">{error}</p> : null}

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
              <p className="eyebrow mb-2">Latest Sync</p>
              <p className="text-xl font-semibold text-[#fff4e1]">
                {formatSyncTime(intelligence.linkIndex.latestSyncAt)}
              </p>
              {intelligence.linkIndex.stale ? (
                <p className="mt-2 text-sm text-[#ffd2c7]">Sync data is older than 24 hours.</p>
              ) : null}
            </div>
          </div>
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
