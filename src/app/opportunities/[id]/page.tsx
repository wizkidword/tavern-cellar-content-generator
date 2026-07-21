import Link from "next/link";
import { notFound } from "next/navigation";

import {
  approveOpportunityAction,
  archiveOpportunityAction,
  deleteOpportunityAction,
  generateOpportunityDraftAction,
  rejectOpportunityAction,
} from "@/app/actions";
import { DeleteOpportunityButton } from "@/app/opportunities/delete-opportunity-button";
import { FoundryNav } from "@/app/foundry-nav";
import { MAX_ARTICLE_BODY_IMAGE_COUNT } from "@/lib/article-body-images";
import { getErrorFeedback } from "@/lib/errors/app-error";
import {
  DEFAULT_FAL_IMAGE_MODEL,
  DEFAULT_FEATURED_IMAGE_PROVIDER,
  DEFAULT_OPENAI_IMAGE_MODEL,
  FAL_IMAGE_MODEL_OPTIONS,
  FEATURED_IMAGE_PROVIDER_OPTIONS,
  OPENAI_IMAGE_MODEL_OPTIONS,
} from "@/lib/featured-image-models";
import {
  canDeleteOpportunity,
  getOpportunityWorkflowState,
} from "@/lib/intelligence/opportunities";
import { getOpportunityById, parseScoreReasons } from "@/lib/intelligence/read-models";
import { requireOperatorPage } from "@/lib/operator-auth";
import {
  DEFAULT_OPENAI_TEXT_MODEL,
  OPENAI_TEXT_MODEL_OPTIONS,
} from "@/lib/openai-models";

export const dynamic = "force-dynamic";

type OpportunityPageProps = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function statusClassName(status: string) {
  return `status-pill status-${status.toLowerCase()}`;
}

export default async function OpportunityPage({ params, searchParams }: OpportunityPageProps) {
  await requireOperatorPage();
  const { id } = await params;
  const opportunity = await getOpportunityById(id);

  if (!opportunity) {
    notFound();
  }

  const query = searchParams ? await searchParams : undefined;
  const message = firstValue(query?.message);
  const error = firstValue(query?.error);
  const errorMessage = getErrorFeedback(error, firstValue(query?.ref));
  const reasons = parseScoreReasons(opportunity.scoreReasons);
  const workflowState = getOpportunityWorkflowState({
    status: opportunity.status,
    generatedArticleId: opportunity.generatedArticleId,
  });
  const canDelete = canDeleteOpportunity(opportunity.status);
  const canApprove = ["IDEA", "GENERATION_FAILED", "REJECTED", "ARCHIVED"].includes(
    opportunity.status,
  );
  const canReject = ["IDEA", "APPROVED", "GENERATION_FAILED"].includes(opportunity.status);
  const canArchive = opportunity.status !== "GENERATING" && opportunity.status !== "ARCHIVED";
  const scoreItems = [
    ["Overall", opportunity.overallScore],
    ["Brand", opportunity.tavernFitScore],
    ["Coverage", opportunity.coverageScore],
    ["SEO", opportunity.seoScore],
    ["Duplicate", opportunity.duplicateRiskScore],
    ["Links", opportunity.internalLinkScore],
    ["Publish", opportunity.publishabilityScore],
    ["Balance", opportunity.categoryBalanceScore],
  ];

  return (
    <main className="app-shell">
      <div className="mx-auto flex min-h-screen w-full max-w-[1600px] flex-col px-5 py-6 md:px-8 xl:px-10">
        <FoundryNav />

        <section className="panel panel-strong rounded-[2rem] p-6 md:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="eyebrow mb-3">{opportunity.category.name}</p>
              <h1 className="display max-w-4xl text-4xl leading-none font-semibold text-[#fff1d7] md:text-5xl">
                {opportunity.primaryKeyword}
              </h1>
              <p className="mt-4 max-w-4xl text-lg leading-8 text-[var(--muted)]">{opportunity.angle}</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <span className={statusClassName(opportunity.status)}>
                {opportunity.status.toLowerCase()}
              </span>
              <span className={`status-pill status-${opportunity.duplicateRiskLabel}`}>
                {opportunity.duplicateRiskLabel.replace("_", " ")}
              </span>
            </div>
          </div>

          {message ? <p className="message message-success mt-5">{message}</p> : null}
          {error ? <p className="message message-error mt-5">{errorMessage}</p> : null}
          {opportunity.duplicateRiskLabel === "too_similar" ? (
            <p className="message message-error mt-5">
              This opportunity is very close to existing coverage. Revise the angle before generating unless
              you intentionally want a follow-up.
            </p>
          ) : null}
        </section>

        <section className="mt-6 grid gap-6 xl:grid-cols-[1fr_0.85fr]">
          <div className="space-y-6">
            <section className="panel rounded-[2rem] p-6 md:p-8">
              <p className="eyebrow mb-3">Tavern Brief</p>
              <p className="text-lg leading-8 text-[#fff4e1]">{opportunity.brief}</p>

              <div className="score-grid mt-6">
                {scoreItems.map(([label, value]) => (
                  <div className="score-card" key={label}>
                    <span>{label}</span>
                    <strong>{value}</strong>
                  </div>
                ))}
              </div>

              <div className="mt-6 space-y-2 text-sm leading-6 text-[var(--muted)]">
                {reasons.map((reason) => (
                  <p key={reason}>{reason}</p>
                ))}
              </div>
            </section>

            <section className="panel rounded-[2rem] p-6 md:p-8">
              <p className="eyebrow mb-3">Duplicate Radar</p>
              <h2 className="display mb-5 text-3xl font-semibold text-[#fff1d7]">
                Similar coverage
              </h2>

              {opportunity.similarPosts.length === 0 ? (
                <div className="rounded-[1.4rem] border border-dashed border-[var(--line)] px-5 py-8 text-[var(--muted)]">
                  No similar local or WordPress coverage was flagged.
                </div>
              ) : null}

              <div className="space-y-3">
                {opportunity.similarPosts.map((match) => (
                  <div className="evidence-row" key={match.id}>
                    <div>
                      <p className="font-semibold text-[#fff4e1]">{match.title}</p>
                      <p className="mt-1 text-sm text-[var(--muted)]">{match.reason}</p>
                    </div>
                    <div className="text-right text-sm text-[#d7bf95]">
                      <p>{match.similarity}%</p>
                      <p>{match.source} / {match.status}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>

          <aside className="space-y-6">
            <section className="panel rounded-[2rem] p-6">
              <p className="eyebrow mb-3">Internal Links</p>
              <h2 className="display mb-5 text-3xl font-semibold text-[#fff1d7]">Real targets</h2>

              {opportunity.internalLinks.length === 0 ? (
                <div className="rounded-[1.4rem] border border-dashed border-[var(--line)] px-5 py-8 text-[var(--muted)]">
                  No real link candidates were found for this opportunity.
                </div>
              ) : null}

              <div className="space-y-3">
                {opportunity.internalLinks.map((link) => (
                  <a
                    className="link-card"
                    href={link.sitePost.link ?? `/${link.sitePost.slug}`}
                    key={link.id}
                    rel="noreferrer"
                    target="_blank"
                  >
                    <span>{link.confidence}%</span>
                    <strong>{link.sitePost.title}</strong>
                    <em>{link.reason}</em>
                  </a>
                ))}
              </div>
            </section>

            <section className="panel rounded-[2rem] p-6">
              <p className="eyebrow mb-3">Workflow</p>
              <div className="grid gap-3">
                {canApprove ? (
                  <form action={approveOpportunityAction.bind(null, opportunity.id)}>
                    <button className="action-primary w-full" type="submit">
                      {opportunity.status === "GENERATION_FAILED" ? "Approve Retry" : "Approve Opportunity"}
                    </button>
                  </form>
                ) : null}

                {workflowState.mode === "open_generated_draft" && opportunity.generatedArticle ? (
                  <div className="rounded-[1.3rem] border border-[var(--line)] bg-black/10 p-4">
                    <p className="text-sm leading-6 text-[var(--muted)]">{workflowState.message}</p>
                    <Link
                      className="action-primary mt-3 block text-center"
                      href={`/articles/${opportunity.generatedArticle.id}`}
                    >
                      Open Generated Draft
                    </Link>
                  </div>
                ) : null}

                {workflowState.mode === "generate_draft" ? (
                  <form action={generateOpportunityDraftAction.bind(null, opportunity.id)} className="grid gap-3">
                    <p className="text-sm leading-6 text-[var(--muted)]">{workflowState.message}</p>
                    <div>
                      <label className="label" htmlFor="textModel">
                        AI Draft Model
                      </label>
                      <select
                        className="field"
                        defaultValue={DEFAULT_OPENAI_TEXT_MODEL}
                        id="textModel"
                        name="textModel"
                        required
                      >
                        {OPENAI_TEXT_MODEL_OPTIONS.map((option) => (
                          <option key={option.id} value={option.id}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <fieldset>
                      <legend className="label">Featured Image Plan</legend>
                      <div className="grid gap-2">
                        <label className="flex items-center gap-3 rounded-[1rem] border border-[var(--line)] bg-black/10 px-4 py-3 text-sm text-[#f2e7cf]">
                          <input defaultChecked name="featuredImageMode" type="radio" value="none" />
                          No image yet
                        </label>
                        <label className="flex items-center gap-3 rounded-[1rem] border border-[var(--line)] bg-black/10 px-4 py-3 text-sm text-[#f2e7cf]">
                          <input name="featuredImageMode" type="radio" value="ai" />
                          Generate an AI featured image
                        </label>
                        <label className="flex items-center gap-3 rounded-[1rem] border border-[#c99a54]/50 bg-[#2b2116] px-4 py-3 text-sm text-[#f2dfbd]">
                          <input name="featuredImageMode" type="radio" value="licensed" />
                          Find a real licensed image after the draft is ready
                        </label>
                      </div>
                    </fieldset>
                    <div>
                      <label className="label" htmlFor="bodyImageCount">
                        Images Inside Article
                      </label>
                      <select className="field" defaultValue="0" id="bodyImageCount" name="bodyImageCount">
                        {Array.from({ length: MAX_ARTICLE_BODY_IMAGE_COUNT + 1 }, (_, count) => (
                          <option key={count} value={count}>
                            {count}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="label" htmlFor="imageProvider">
                        Image Generator
                      </label>
                      <select
                        className="field"
                        defaultValue={DEFAULT_FEATURED_IMAGE_PROVIDER}
                        id="imageProvider"
                        name="imageProvider"
                        required
                      >
                        {FEATURED_IMAGE_PROVIDER_OPTIONS.map((option) => (
                          <option key={option.id} value={option.id}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="label" htmlFor="falImageModel">
                        fal.ai Model
                      </label>
                      <select
                        className="field"
                        defaultValue={DEFAULT_FAL_IMAGE_MODEL}
                        id="falImageModel"
                        name="falImageModel"
                        required
                      >
                        {FAL_IMAGE_MODEL_OPTIONS.map((option) => (
                          <option key={option.id} value={option.id}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="label" htmlFor="openAiImageModel">
                        GPT Image Model
                      </label>
                      <select
                        className="field"
                        defaultValue={DEFAULT_OPENAI_IMAGE_MODEL}
                        id="openAiImageModel"
                        name="openAiImageModel"
                        required
                      >
                        {OPENAI_IMAGE_MODEL_OPTIONS.map((option) => (
                          <option key={option.id} value={option.id}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <button className="action-primary w-full" type="submit">
                      Generate Draft From Opportunity
                    </button>
                  </form>
                ) : null}

                {workflowState.mode === "locked" ? (
                  <p className="message message-error">{workflowState.message}</p>
                ) : null}
                {workflowState.mode === "generating" || workflowState.mode === "retry_required" ? (
                  <p className="message message-error">
                    {workflowState.message}
                    {opportunity.generationErrorCode
                      ? ` Last error: ${opportunity.generationErrorCode.replaceAll("_", " ").toLowerCase()}.`
                      : ""}
                  </p>
                ) : null}

                <Link className="action-secondary text-center" href="/opportunities">
                  Back to Opportunities
                </Link>
                {workflowState.mode === "open_generated_draft" && !opportunity.generatedArticle ? (
                  <p className="message message-error">
                    This opportunity is marked generated, but the saved draft could not be found.
                  </p>
                ) : null}
                <Link className="action-secondary text-center" href="/intelligence">
                  View Coverage Map
                </Link>

                {canReject || canArchive ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {canReject ? (
                      <form action={rejectOpportunityAction.bind(null, opportunity.id)}>
                        <button className="action-secondary w-full" type="submit">
                          Reject
                        </button>
                      </form>
                    ) : null}
                    {canArchive ? (
                      <form action={archiveOpportunityAction.bind(null, opportunity.id)}>
                        <button className="action-secondary w-full" type="submit">
                          Archive
                        </button>
                      </form>
                    ) : null}
                  </div>
                ) : null}
                {canDelete ? (
                  <DeleteOpportunityButton
                    deleteAction={deleteOpportunityAction.bind(null, opportunity.id)}
                    opportunityName={opportunity.primaryKeyword}
                  />
                ) : null}
              </div>
            </section>
          </aside>
        </section>
      </div>
    </main>
  );
}
