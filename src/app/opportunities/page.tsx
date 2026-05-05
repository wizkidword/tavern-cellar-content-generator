import Link from "next/link";

import { createOpportunityAction, generateOpportunityIdeasAction } from "@/app/actions";
import { FoundryNav } from "@/app/foundry-nav";
import { getOpportunityListData, parseScoreReasons } from "@/lib/intelligence/read-models";

type OpportunitiesPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function statusClassName(status: string) {
  return `status-pill status-${status.toLowerCase()}`;
}

export default async function OpportunitiesPage({ searchParams }: OpportunitiesPageProps) {
  const params = searchParams ? await searchParams : undefined;
  const message = firstValue(params?.message);
  const error = firstValue(params?.error);
  const selectedCategoryId = firstValue(params?.categoryId) ?? "";
  const selectedStatus = firstValue(params?.status) ?? "";
  const selectedRisk = firstValue(params?.risk) ?? "";
  const data = await getOpportunityListData();
  const opportunities = data.opportunities.filter((opportunity) => {
    const categoryMatches = !selectedCategoryId || String(opportunity.categoryId) === selectedCategoryId;
    const statusMatches = !selectedStatus || opportunity.status === selectedStatus;
    const riskMatches = !selectedRisk || opportunity.duplicateRiskLabel === selectedRisk;

    return categoryMatches && statusMatches && riskMatches;
  });

  return (
    <main className="app-shell">
      <div className="mx-auto flex min-h-screen w-full max-w-[1600px] flex-col px-5 py-6 md:px-8 xl:px-10">
        <FoundryNav />

        <section className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
          <aside className="panel rounded-[2rem] p-6 md:p-8">
            <p className="eyebrow mb-3">New Opportunity</p>
            <h1 className="display mb-6 text-4xl leading-none font-semibold text-[#fff1d7]">
              Score an idea before it becomes a draft.
            </h1>

            {message ? <p className="message message-success mb-4">{message}</p> : null}
            {error ? <p className="message message-error mb-4">{error}</p> : null}

            <form action={generateOpportunityIdeasAction} className="mb-6 rounded-[1.4rem] border border-[var(--line)] bg-black/10 p-4">
              <p className="eyebrow mb-3">AI Planning Pass</p>
              <label className="label" htmlFor="aiCategoryId">
                Category
              </label>
              <select
                className="field mb-4"
                id="aiCategoryId"
                name="categoryId"
                defaultValue={selectedCategoryId}
                required
              >
                {data.categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
              <button className="action-secondary w-full" type="submit">
                Generate AI Opportunity Ideas
              </button>
            </form>

            <form action={createOpportunityAction} className="space-y-4">
              <div>
                <label className="label" htmlFor="categoryId">
                  Category
                </label>
                <select className="field" id="categoryId" name="categoryId" required>
                  {data.categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="label" htmlFor="primaryKeyword">
                  Primary Keyword
                </label>
                <input className="field" id="primaryKeyword" name="primaryKeyword" required />
              </div>

              <div>
                <label className="label" htmlFor="angle">
                  Angle
                </label>
                <textarea className="field min-h-28" id="angle" name="angle" required />
              </div>

              <div>
                <label className="label" htmlFor="brief">
                  Tavern Brief
                </label>
                <textarea className="field min-h-32" id="brief" name="brief" required />
              </div>

              <button className="action-primary w-full" type="submit">
                Score Opportunity
              </button>
            </form>
          </aside>

          <section className="panel rounded-[2rem] p-6 md:p-8">
            <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="eyebrow mb-3">Opportunity Queue</p>
                <h2 className="display text-3xl font-semibold text-[#fff1d7]">
                  Scored Tavern Cellar ideas
                </h2>
              </div>

              <form className="filter-bar" method="get">
                <select className="field field-compact" name="categoryId" defaultValue={selectedCategoryId}>
                  <option value="">All categories</option>
                  {data.categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
                <select className="field field-compact" name="status" defaultValue={selectedStatus}>
                  <option value="">All statuses</option>
                  <option value="IDEA">Idea</option>
                  <option value="APPROVED">Approved</option>
                  <option value="GENERATED">Generated</option>
                  <option value="REJECTED">Rejected</option>
                  <option value="ARCHIVED">Archived</option>
                </select>
                <select className="field field-compact" name="risk" defaultValue={selectedRisk}>
                  <option value="">All risks</option>
                  <option value="fresh">Fresh</option>
                  <option value="adjacent">Adjacent</option>
                  <option value="crowded">Crowded</option>
                  <option value="too_similar">Too similar</option>
                </select>
                <button className="action-secondary" type="submit">
                  Filter
                </button>
              </form>
            </div>

            <div className="space-y-4">
              {opportunities.length === 0 ? (
                <div className="rounded-[1.4rem] border border-dashed border-[var(--line)] px-5 py-8 text-[var(--muted)]">
                  No opportunities match this view.
                </div>
              ) : null}

              {opportunities.map((opportunity) => {
                const reasons = parseScoreReasons(opportunity.scoreReasons);

                return (
                  <Link
                    className="opportunity-row"
                    href={`/opportunities/${opportunity.id}`}
                    key={opportunity.id}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <span className={statusClassName(opportunity.status)}>
                        {opportunity.status.toLowerCase()}
                      </span>
                      <span className={`status-pill status-${opportunity.duplicateRiskLabel}`}>
                        {opportunity.duplicateRiskLabel.replace("_", " ")}
                      </span>
                    </div>

                    <h3 className="mt-4 text-2xl font-semibold text-[#fff4e1]">
                      {opportunity.primaryKeyword}
                    </h3>
                    <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{opportunity.angle}</p>

                    <div className="score-strip mt-4">
                      <span>Overall {opportunity.overallScore}</span>
                      <span>Brand {opportunity.tavernFitScore}</span>
                      <span>Coverage {opportunity.coverageScore}</span>
                      <span>SEO {opportunity.seoScore}</span>
                      <span>Links {opportunity.internalLinks.length}</span>
                    </div>

                    {reasons[0] ? <p className="mt-3 text-sm text-[#d7bf95]">{reasons[0]}</p> : null}
                  </Link>
                );
              })}
            </div>
          </section>
        </section>
      </div>
    </main>
  );
}
