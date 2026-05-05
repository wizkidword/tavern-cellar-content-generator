import Link from "next/link";

import {
  syncWordPressCatalogAction,
} from "@/app/actions";
import { NewArticleForm } from "@/app/new-article-form";
import { getDashboardData } from "@/lib/content-pipeline";

type HomePageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function statusClassName(status: string) {
  return `status-pill status-${status.toLowerCase()}`;
}

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function HomePage({ searchParams }: HomePageProps) {
  const params = searchParams ? await searchParams : undefined;
  const message = firstValue(params?.message);
  const error = firstValue(params?.error);
  const dashboard = await getDashboardData();

  return (
    <main className="app-shell">
      <div className="mx-auto flex min-h-screen w-full max-w-[1600px] flex-col px-5 py-6 md:px-8 xl:px-10">
        <section className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
          <div className="panel panel-strong relative overflow-hidden rounded-[2rem] px-6 py-8 md:px-8 md:py-10">
            <div className="mb-10 flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="eyebrow mb-3">Tavern Cellar Foundry</p>
                <h1 className="display max-w-3xl text-4xl leading-none font-semibold text-[#fff1d7] md:text-6xl">
                  Generate search-friendly stories without re-treading old ground.
                </h1>
              </div>
              <form action={syncWordPressCatalogAction}>
                <button className="action-secondary" type="submit">
                  Sync Live WordPress History
                </button>
              </form>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="panel rounded-[1.4rem] p-5">
                <p className="eyebrow mb-3">Tracked Posts</p>
                <p className="text-4xl font-semibold text-[#fff4e1]">{dashboard.sitePostCount}</p>
                <p className="mt-2 text-sm text-[var(--muted)]">
                  Imported from taverncellar.com to keep new ideas clear of existing coverage.
                </p>
              </div>
              <div className="panel rounded-[1.4rem] p-5">
                <p className="eyebrow mb-3">Generated Locally</p>
                <p className="text-4xl font-semibold text-[#fff4e1]">{dashboard.articleCount}</p>
                <p className="mt-2 text-sm text-[var(--muted)]">
                  Articles in this app across draft, review, scheduled, and published states.
                </p>
              </div>
              <div className="panel rounded-[1.4rem] p-5">
                <p className="eyebrow mb-3">Coverage Map</p>
                <p className="text-4xl font-semibold text-[#fff4e1]">{dashboard.categories.length}</p>
                <p className="mt-2 text-sm text-[var(--muted)]">
                  Live Tavern Cellar categories ready for angle generation and publishing.
                </p>
              </div>
            </div>
          </div>

          <div className="panel rounded-[2rem] p-6 md:p-8">
            <div className="mb-6">
              <p className="eyebrow mb-3">New Article</p>
              <h2 className="display text-3xl font-semibold text-[#fff1d7]">
                Pick a category, shape the topic, and let AI help with the angle.
              </h2>
            </div>

            {message ? <p className="message message-success mb-4">{message}</p> : null}
            {error ? <p className="message message-error mb-4">{error}</p> : null}

            <NewArticleForm categories={dashboard.categories} />
          </div>
        </section>

        <section className="mt-6 grid gap-6 xl:grid-cols-[0.85fr_1.15fr]">
          <div className="panel rounded-[2rem] p-6 md:p-8">
            <div className="mb-6 flex items-center justify-between gap-4">
              <div>
                <p className="eyebrow mb-3">Coverage Matrix</p>
                <h2 className="display text-3xl font-semibold text-[#fff1d7]">
                  Category readiness
                </h2>
              </div>
            </div>

            <div className="space-y-3">
              {dashboard.categories.map((category) => (
                <div
                  key={category.id}
                  className="rounded-[1.3rem] border border-[var(--line)] bg-black/10 px-4 py-4"
                >
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="font-semibold text-[#fff4e1]">{category.name}</p>
                      <p className="mt-1 text-sm text-[var(--muted)]">
                        {category.postCount} live posts, {category._count.articles} generated in Foundry
                      </p>
                    </div>
                    <span className="rounded-full bg-white/5 px-3 py-1 text-xs tracking-[0.16em] text-[#d6c39e] uppercase">
                      {category.slug}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="panel rounded-[2rem] p-6 md:p-8">
            <div className="mb-6">
              <p className="eyebrow mb-3">Review Queue</p>
              <h2 className="display text-3xl font-semibold text-[#fff1d7]">
                Recent drafts and publishing activity
              </h2>
            </div>

            <div className="space-y-4">
              {dashboard.articles.length === 0 ? (
                <div className="rounded-[1.4rem] border border-dashed border-[var(--line)] px-5 py-8 text-[var(--muted)]">
                  No drafts yet. Generate the first article to open the review editor.
                </div>
              ) : null}

              {dashboard.articles.map((article) => (
                <Link
                  key={article.id}
                  href={`/articles/${article.id}`}
                  className="block rounded-[1.5rem] border border-[var(--line)] bg-black/10 px-5 py-5 transition-transform duration-150 hover:-translate-y-0.5"
                >
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                    <span className={statusClassName(article.status)}>{article.status.replaceAll("_", " ")}</span>
                    <span className="text-xs tracking-[0.14em] text-[var(--muted)] uppercase">
                      {article.category.name}
                    </span>
                  </div>
                  <h3 className="text-xl font-semibold text-[#fff4e1]">{article.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{article.angle}</p>
                  <div className="mt-4 flex flex-wrap items-center gap-3 text-xs tracking-[0.12em] text-[#d7bf95] uppercase">
                    <span>{article.primaryKeyword}</span>
                    <span>{article.slug}</span>
                    {article.wpStatus ? <span>WP: {article.wpStatus}</span> : null}
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
