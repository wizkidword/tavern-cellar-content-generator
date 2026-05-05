import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { format } from "date-fns";

import {
  publishNowAction,
  regenerateFeaturedImageAction,
  saveArticleReviewAction,
  scheduleArticleAction,
  sendWordPressDraftAction,
} from "@/app/actions";
import { getArticleById, getDashboardData } from "@/lib/content-pipeline";

type ArticlePageProps = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function formatDateInput(value: Date | null) {
  if (!value) {
    return "";
  }

  return format(value, "yyyy-MM-dd'T'HH:mm");
}

function statusClassName(status: string) {
  return `status-pill status-${status.toLowerCase()}`;
}

export default async function ArticlePage({ params, searchParams }: ArticlePageProps) {
  const { id } = await params;
  const article = await getArticleById(id);

  if (!article) {
    notFound();
  }

  const dashboard = await getDashboardData();
  const categoryOptions = dashboard.categories.some((category) => category.id === article.categoryId)
    ? dashboard.categories
    : [
        {
          ...article.category,
          _count: {
            articles: 0,
          },
        },
        ...dashboard.categories,
      ];
  const query = searchParams ? await searchParams : undefined;
  const message = firstValue(query?.message);
  const error = firstValue(query?.error);
  const sourceOpportunity = article.contentOpportunities[0];

  return (
    <main className="app-shell">
      <div className="mx-auto flex min-h-screen w-full max-w-[1700px] flex-col px-5 py-6 md:px-8 xl:px-10">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <Link href="/" className="eyebrow mb-3 inline-block">
              Back to dashboard
            </Link>
            <h1 className="display max-w-4xl text-4xl leading-none font-semibold text-[#fff1d7] md:text-5xl">
              {article.title}
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className={statusClassName(article.status)}>{article.status.replaceAll("_", " ")}</span>
            <span className="rounded-full border border-[var(--line)] px-4 py-2 text-sm text-[var(--muted)]">
              {article.category.name}
            </span>
          </div>
        </div>

        {message ? <p className="message message-success mb-4">{message}</p> : null}
        {error ? <p className="message message-error mb-4">{error}</p> : null}

        <form action={saveArticleReviewAction.bind(null, article.id)} className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
          <section className="panel rounded-[2rem] p-6 md:p-8">
            <div className="grid gap-5 md:grid-cols-2">
              <div className="md:col-span-2">
                <label className="label" htmlFor="title">
                  Title
                </label>
                <input className="field" id="title" name="title" defaultValue={article.title} required />
              </div>

              <div>
                <label className="label" htmlFor="primaryKeyword">
                  Primary Keyword
                </label>
                <input
                  className="field"
                  id="primaryKeyword"
                  name="primaryKeyword"
                  defaultValue={article.primaryKeyword}
                  required
                />
              </div>

              <div>
                <label className="label" htmlFor="slug">
                  Slug
                </label>
                <input className="field" id="slug" name="slug" defaultValue={article.slug} required />
              </div>

              <div className="md:col-span-2">
                <label className="label" htmlFor="angle">
                  Angle
                </label>
                <textarea className="field min-h-28" id="angle" name="angle" defaultValue={article.angle} required />
              </div>

              <div className="md:col-span-2">
                <label className="label" htmlFor="contentMarkdown">
                  Article Body
                </label>
                <textarea
                  className="field min-h-[34rem]"
                  id="contentMarkdown"
                  name="contentMarkdown"
                  defaultValue={article.contentMarkdown}
                  required
                />
              </div>
            </div>
          </section>

          <aside className="space-y-6">
            <section className="panel rounded-[2rem] p-6">
              <div className="mb-5">
                <p className="eyebrow mb-3">Publishing Controls</p>
                <h2 className="display text-3xl font-semibold text-[#fff1d7]">Review and ship</h2>
              </div>

              <div className="grid gap-4">
                <div>
                  <label className="label" htmlFor="categoryId">
                    Category
                  </label>
                  <select className="field" id="categoryId" name="categoryId" defaultValue={article.categoryId}>
                    {categoryOptions.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="label" htmlFor="scheduledFor">
                    Schedule For
                  </label>
                  <input
                    className="field"
                    id="scheduledFor"
                    name="scheduledFor"
                    type="datetime-local"
                    defaultValue={article.scheduledForLocal ?? formatDateInput(article.scheduledFor)}
                  />
                  {article.scheduledForLocal ? (
                    <p className="mt-2 text-xs leading-5 text-[var(--muted)]">
                      WordPress local schedule target: {article.scheduledForLocal.replace("T", " ")}
                    </p>
                  ) : null}
                </div>

                <div className="grid gap-3">
                  <button className="action-primary" type="submit">
                    Save Review Changes
                  </button>
                  <button
                    className="action-secondary"
                    formAction={sendWordPressDraftAction.bind(null, article.id)}
                    type="submit"
                  >
                    Push WordPress Draft
                  </button>
                  <button
                    className="action-secondary"
                    formAction={publishNowAction.bind(null, article.id)}
                    type="submit"
                  >
                    Publish Now
                  </button>
                  <button
                    className="action-secondary"
                    formAction={scheduleArticleAction.bind(null, article.id)}
                    type="submit"
                  >
                    Schedule in WordPress
                  </button>
                </div>

                <div className="rounded-[1.3rem] border border-[var(--line)] bg-black/10 px-4 py-4 text-sm text-[var(--muted)]">
                  WordPress post ID: {article.wpPostId ?? "Not created yet"}
                  <br />
                  WordPress status: {article.wpStatus ?? "Local only"}
                </div>
              </div>
            </section>

            {sourceOpportunity ? (
              <section className="panel rounded-[2rem] p-6">
                <div className="mb-5">
                  <p className="eyebrow mb-3">Source Opportunity</p>
                  <h2 className="display text-3xl font-semibold text-[#fff1d7]">
                    {sourceOpportunity.primaryKeyword}
                  </h2>
                </div>
                <p className="text-sm leading-6 text-[var(--muted)]">{sourceOpportunity.angle}</p>
                <Link className="action-secondary mt-4 inline-flex" href={`/opportunities/${sourceOpportunity.id}`}>
                  Open Opportunity
                </Link>
              </section>
            ) : null}

            <section className="panel rounded-[2rem] p-6">
              <div className="mb-5">
                <p className="eyebrow mb-3">SEO Pack</p>
                <h2 className="display text-3xl font-semibold text-[#fff1d7]">Metadata and links</h2>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="label" htmlFor="metaTitle">
                    Meta Title
                  </label>
                  <input className="field" id="metaTitle" name="metaTitle" defaultValue={article.metaTitle} required />
                </div>

                <div>
                  <label className="label" htmlFor="metaDescription">
                    Meta Description
                  </label>
                  <textarea
                    className="field min-h-28"
                    id="metaDescription"
                    name="metaDescription"
                    defaultValue={article.metaDescription}
                    required
                  />
                </div>

                <div>
                  <label className="label" htmlFor="excerpt">
                    Excerpt
                  </label>
                  <textarea className="field min-h-28" id="excerpt" name="excerpt" defaultValue={article.excerpt} required />
                </div>

                <div>
                  <label className="label" htmlFor="tags">
                    Tags
                  </label>
                  <textarea
                    className="field min-h-24"
                    id="tags"
                    name="tags"
                    defaultValue={article.tags}
                    placeholder="Comma separated"
                  />
                </div>

                <div>
                  <label className="label" htmlFor="internalLinks">
                    Internal Link Suggestions
                  </label>
                  <textarea
                    className="field min-h-28"
                    id="internalLinks"
                    name="internalLinks"
                    defaultValue={article.internalLinks}
                  />
                </div>
              </div>
            </section>

            <section className="panel rounded-[2rem] p-6">
              <div className="mb-5">
                <p className="eyebrow mb-3">Featured Image</p>
                <h2 className="display text-3xl font-semibold text-[#fff1d7]">Visual direction</h2>
              </div>

              <div className="space-y-4">
                {article.featuredImagePath ? (
                  <Image
                    alt={article.featuredImageAlt}
                    className="w-full rounded-[1.4rem] border border-[var(--line)] object-cover"
                    src={article.featuredImagePath}
                    width={1536}
                    height={1024}
                  />
                ) : (
                  <div className="rounded-[1.4rem] border border-dashed border-[var(--line)] px-4 py-12 text-center text-[var(--muted)]">
                    No featured image generated yet.
                  </div>
                )}

                <div>
                  <label className="label" htmlFor="featuredImagePrompt">
                    Image Prompt
                  </label>
                  <textarea
                    className="field min-h-32"
                    id="featuredImagePrompt"
                    name="featuredImagePrompt"
                    defaultValue={article.featuredImagePrompt}
                    required
                  />
                </div>

                <div>
                  <label className="label" htmlFor="featuredImageAlt">
                    Alt Text
                  </label>
                  <input
                    className="field"
                    id="featuredImageAlt"
                    name="featuredImageAlt"
                    defaultValue={article.featuredImageAlt}
                    required
                  />
                </div>

                <div>
                  <label className="label" htmlFor="notes">
                    Editorial Notes
                  </label>
                  <textarea className="field min-h-28" id="notes" name="notes" defaultValue={article.notes ?? ""} />
                </div>

                <button
                  className="action-secondary w-full"
                  formAction={regenerateFeaturedImageAction.bind(null, article.id)}
                  type="submit"
                >
                  Generate / Refresh Featured Image
                </button>
              </div>
            </section>
          </aside>
        </form>
      </div>
    </main>
  );
}
