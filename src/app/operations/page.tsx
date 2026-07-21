import { format, formatDistanceToNow } from "date-fns";
import Link from "next/link";

import {
  reconcileArticlePublishFromOperationsAction,
  syncWordPressCatalogFromOperationsAction,
} from "@/app/actions";
import { FoundryNav } from "@/app/foundry-nav";
import { getErrorFeedback } from "@/lib/errors/app-error";
import { getOperationsData } from "@/lib/intelligence/read-models";
import { requireOperatorPage } from "@/lib/operator-auth";

export const dynamic = "force-dynamic";

type OperationsPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function statusClassName(status: string) {
  return `status-pill status-${status.toLowerCase()}`;
}

function label(value: string) {
  return value.toLowerCase().replaceAll("_", " ");
}

function timestamp(value: Date | null) {
  if (!value) {
    return "Not finished yet";
  }

  return `${formatDistanceToNow(value, { addSuffix: true })} (${format(value, "PPp")})`;
}

function OperationCard({
  eyebrow,
  title,
  state,
  children,
}: {
  eyebrow: string;
  title: React.ReactNode;
  state: string;
  children: React.ReactNode;
}) {
  return (
    <article className="operation-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="eyebrow mb-2">{eyebrow}</p>
          <div className="text-base font-semibold leading-6 text-[#fff4e1]">{title}</div>
        </div>
        <span className={statusClassName(state)}>{label(state)}</span>
      </div>
      <div className="mt-4 text-sm leading-6 text-[var(--muted)]">{children}</div>
    </article>
  );
}

export default async function OperationsPage({ searchParams }: OperationsPageProps) {
  await requireOperatorPage();
  const query = searchParams ? await searchParams : undefined;
  const message = firstValue(query?.message);
  const error = firstValue(query?.error);
  const errorMessage = getErrorFeedback(error, firstValue(query?.ref));
  const operations = await getOperationsData();

  return (
    <main className="app-shell">
      <div className="mx-auto flex min-h-screen w-full max-w-[1600px] flex-col px-5 py-6 md:px-8 xl:px-10">
        <FoundryNav />

        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="eyebrow mb-3">Recovery center</p>
            <h1 className="display text-4xl leading-none font-semibold text-[#fff1d7] md:text-5xl">
              Operations that need attention
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-[var(--muted)]">
              One place for publishing, WordPress sync, image, and AI generation history. Open the
              linked item for editing; retry only when the recorded state says it is safe.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <form action={syncWordPressCatalogFromOperationsAction.bind(null, "FULL_PRIVATE")}>
              <button className="action-primary" type="submit">
                Run Full Private Sync
              </button>
            </form>
            <form action={syncWordPressCatalogFromOperationsAction.bind(null, "PUBLIC_ONLY")}>
              <button className="action-secondary" type="submit">
                Run Public-Only Sync
              </button>
            </form>
          </div>
        </div>

        {message ? <p className="message message-success mb-5">{message}</p> : null}
        {error ? <p className="message message-error mb-5">{errorMessage}</p> : null}

        <section className="grid gap-6 xl:grid-cols-2">
          <div className="panel rounded-[2rem] p-5 md:p-6">
            <div className="mb-5">
              <p className="eyebrow mb-2">WordPress publishing</p>
              <h2 className="display text-3xl font-semibold text-[#fff1d7]">Publish attempts</h2>
            </div>
            <div className="space-y-4">
              {operations.publishAttempts.length > 0 ? (
                operations.publishAttempts.map((attempt) => {
                  const canReconcile = attempt.state === "FAILED" || attempt.state === "UNCERTAIN";

                  return (
                    <OperationCard
                      eyebrow={`Desired: ${attempt.desiredWpStatus}`}
                      key={attempt.id}
                      state={attempt.state}
                      title={<Link href={`/articles/${attempt.article.id}`}>{attempt.article.title}</Link>}
                    >
                      <p>Started {timestamp(attempt.createdAt)}. Updated {timestamp(attempt.updatedAt)}.</p>
                      <p>Checkpoint: {attempt.lastCheckpoint ?? attempt.state}.</p>
                      {attempt.wpPostId ? <p>Recovered WordPress post ID: {attempt.wpPostId}.</p> : null}
                      {attempt.errorCode ? (
                        <p className="mt-2 text-[#ffd2c7]">
                          {getErrorFeedback(attempt.errorCode, attempt.errorCorrelationId ?? undefined)}
                        </p>
                      ) : null}
                      {attempt.warningCode ? (
                        <p className="mt-2 text-[#ffe7aa]">
                          The core post finished, but optional Yoast metadata could not be confirmed.
                        </p>
                      ) : null}
                      {canReconcile ? (
                        <form action={reconcileArticlePublishFromOperationsAction.bind(null, attempt.article.id)}>
                          <button className="action-primary mt-4" type="submit">
                            Reconcile and Retry
                          </button>
                        </form>
                      ) : null}
                    </OperationCard>
                  );
                })
              ) : (
                <p className="empty-operation-state">No publishing attempts have been recorded yet.</p>
              )}
            </div>
          </div>

          <div className="panel rounded-[2rem] p-5 md:p-6">
            <div className="mb-5">
              <p className="eyebrow mb-2">WordPress catalog</p>
              <h2 className="display text-3xl font-semibold text-[#fff1d7]">Sync runs</h2>
            </div>
            <div className="space-y-4">
              {operations.syncRuns.length > 0 ? (
                operations.syncRuns.map((run) => (
                  <OperationCard
                    eyebrow={run.mode === "FULL_PRIVATE" ? "Full private access" : "Public-only access"}
                    key={run.id}
                    state={run.state}
                    title={`WordPress catalog sync`}
                  >
                    <p>Started {timestamp(run.startedAt)}. Finished {timestamp(run.completedAt)}.</p>
                    <p>
                      Checkpoint: {run.pageCount} pages, {run.postCount} posts, and {run.categoryCount} categories.
                    </p>
                    <p>Site timezone: {run.siteTimezone ?? "not reported"}.</p>
                    {run.errorCode ? (
                      <p className="mt-2 text-[#ffd2c7]">
                        {getErrorFeedback(run.errorCode, run.errorCorrelationId ?? undefined)}
                      </p>
                    ) : null}
                    {run.state === "FAILED" || run.state === "DEGRADED" ? (
                      <form action={syncWordPressCatalogFromOperationsAction.bind(null, "FULL_PRIVATE")}>
                        <button className="action-secondary mt-4" type="submit">
                          Retry Full Private Sync
                        </button>
                      </form>
                    ) : null}
                  </OperationCard>
                ))
              ) : (
                <p className="empty-operation-state">No WordPress sync run has been recorded yet.</p>
              )}
            </div>
          </div>

          <div className="panel rounded-[2rem] p-5 md:p-6">
            <div className="mb-5">
              <p className="eyebrow mb-2">Image work</p>
              <h2 className="display text-3xl font-semibold text-[#fff1d7]">Image operations</h2>
            </div>
            <div className="space-y-4">
              {operations.imageOperations.length > 0 ? (
                operations.imageOperations.map((article) => {
                  const featuredNeedsAttention = article.featuredImageState !== "IDLE" && article.featuredImageState !== "SUCCEEDED";
                  const bodyNeedsAttention = article.bodyImagesState !== "IDLE" && article.bodyImagesState !== "SUCCEEDED";
                  const state = featuredNeedsAttention ? article.featuredImageState : article.bodyImagesState;

                  return (
                    <OperationCard
                      eyebrow="Open article to retry"
                      key={article.id}
                      state={state}
                      title={<Link href={`/articles/${article.id}`}>{article.title}</Link>}
                    >
                      {featuredNeedsAttention ? (
                        <p>
                          Featured image: {label(article.featuredImageState)}
                          {article.featuredImageLastAttemptAt
                            ? `; last attempted ${timestamp(article.featuredImageLastAttemptAt)}`
                            : ""}.
                          {article.featuredImageErrorCode
                            ? ` ${getErrorFeedback(article.featuredImageErrorCode)}`
                            : ""}
                        </p>
                      ) : null}
                      {bodyNeedsAttention ? (
                        <p className={featuredNeedsAttention ? "mt-2" : ""}>
                          In-post images: {label(article.bodyImagesState)}
                          {article.bodyImagesLastAttemptAt
                            ? `; last attempted ${timestamp(article.bodyImagesLastAttemptAt)}`
                            : ""}.
                          {article.bodyImagesErrorCode
                            ? ` ${getErrorFeedback(article.bodyImagesErrorCode)}`
                            : ""}
                        </p>
                      ) : null}
                      <Link className="action-secondary mt-4 inline-block" href={`/articles/${article.id}`}>
                        Open Image Recovery
                      </Link>
                    </OperationCard>
                  );
                })
              ) : (
                <p className="empty-operation-state">No image generation needs attention right now.</p>
              )}
            </div>
          </div>

          <div className="panel rounded-[2rem] p-5 md:p-6">
            <div className="mb-5">
              <p className="eyebrow mb-2">AI work</p>
              <h2 className="display text-3xl font-semibold text-[#fff1d7]">Generation runs</h2>
            </div>
            <div className="space-y-4">
              {operations.generationRuns.length > 0 ? (
                operations.generationRuns.map((run) => {
                  const relatedItem = run.article ? (
                    <Link href={`/articles/${run.article.id}`}>{run.article.title}</Link>
                  ) : run.opportunity ? (
                    <Link href={`/opportunities/${run.opportunity.id}`}>
                      {run.opportunity.primaryKeyword}: {run.opportunity.angle}
                    </Link>
                  ) : (
                    "No saved item"
                  );

                  return (
                    <OperationCard
                      eyebrow={`${label(run.operation)} · ${run.provider} / ${run.model}`}
                      key={run.id}
                      state={run.state}
                      title={relatedItem}
                    >
                      <p>Started {timestamp(run.startedAt)}. Finished {timestamp(run.completedAt)}.</p>
                      <p>
                        Checkpoint: {run.promptVersion}
                        {run.latencyMs !== null ? `; ${run.latencyMs} ms` : ""}
                        {run.totalTokens !== null ? `; ${run.totalTokens} tokens` : ""}.
                      </p>
                      {run.errorCode ? <p className="mt-2 text-[#ffd2c7]">{getErrorFeedback(run.errorCode)}</p> : null}
                      {run.state === "FAILED" && (run.article || run.opportunity) ? (
                        <p className="mt-2 text-xs text-[var(--muted)]">Open the linked item to retry with its normal guarded action.</p>
                      ) : null}
                    </OperationCard>
                  );
                })
              ) : (
                <p className="empty-operation-state">No AI generation runs have been recorded yet.</p>
              )}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
