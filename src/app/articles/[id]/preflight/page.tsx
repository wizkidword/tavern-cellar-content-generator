import Link from "next/link";
import { notFound } from "next/navigation";

import { getArticleById } from "@/lib/content-pipeline";
import { analyzeArticleQuality } from "@/lib/intelligence/article-quality";
import {
  buildPublishPreflight,
  type PublishPreflightMode,
} from "@/lib/publishing/preflight";
import { requireOperatorPage } from "@/lib/operator-auth";

export const dynamic = "force-dynamic";

type PreflightPageProps = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function resolveMode(value: string | undefined): PublishPreflightMode {
  return value === "publish" || value === "future" ? value : "draft";
}

function modeLabel(mode: PublishPreflightMode) {
  if (mode === "future") {
    return "Schedule in WordPress";
  }

  return mode === "publish" ? "Publish now" : "Save as WordPress draft";
}

export default async function ArticlePreflightPage({ params, searchParams }: PreflightPageProps) {
  await requireOperatorPage();
  const { id } = await params;
  const article = await getArticleById(id);

  if (!article) {
    notFound();
  }

  const query = searchParams ? await searchParams : undefined;
  const mode = resolveMode(firstValue(query?.mode));
  const quality = analyzeArticleQuality({
    title: article.title,
    primaryKeyword: article.primaryKeyword,
    contentMarkdown: article.contentMarkdown,
    metaTitle: article.metaTitle,
    metaDescription: article.metaDescription,
    internalLinks: article.internalLinks,
    categorySlug: article.category.slug,
  });
  const preflight = await buildPublishPreflight(
    {
      title: article.title,
      slug: article.slug,
      excerpt: article.excerpt,
      primaryKeyword: article.primaryKeyword,
      metaTitle: article.metaTitle,
      metaDescription: article.metaDescription,
      tags: article.tags,
      internalLinks: article.internalLinks,
      contentMarkdown: article.contentMarkdown,
      category: article.category,
      featuredImagePath: article.featuredImagePath,
      featuredImageAlt: article.featuredImageAlt,
      featuredImageState: article.featuredImageState,
      bodyImagesState: article.bodyImagesState,
      bodyImages: article.bodyImages,
      scheduledFor: article.scheduledFor,
      scheduledForLocal: article.scheduledForLocal,
      scheduledForTimezone: article.scheduledForTimezone,
      qualityBlockingWarnings: quality.blockingWarnings,
      qualitySuggestions: quality.suggestions,
    },
    mode,
  );

  return (
    <main className="app-shell">
      <div className="mx-auto flex min-h-screen w-full max-w-[1700px] flex-col px-5 py-6 md:px-8 xl:px-10">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <Link href={`/articles/${article.id}`} className="eyebrow mb-3 inline-block">
              Back to article
            </Link>
            <h1 className="display max-w-5xl text-4xl leading-none font-semibold text-[#fff1d7] md:text-5xl">
              Publish preflight
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-[var(--muted)]">
              This is the saved article exactly as Foundry will render and sanitize it before the
              WordPress request. Save edits on the article page, then reopen this screen.
            </p>
          </div>
          <span className="rounded-full border border-[var(--line)] px-4 py-2 text-sm text-[var(--muted)]">
            Target: {modeLabel(preflight.mode)}
          </span>
        </div>

        <section className="panel mb-6 rounded-[2rem] p-5 md:p-6">
          <p className="eyebrow mb-3">Choose the planned action</p>
          <div className="flex flex-wrap gap-3">
            {(["draft", "publish", "future"] as const).map((option) => (
              <Link
                className={option === mode ? "action-primary" : "action-secondary"}
                href={`/articles/${article.id}/preflight?mode=${option}`}
                key={option}
              >
                {modeLabel(option)}
              </Link>
            ))}
          </div>
        </section>

        {preflight.blocking.length > 0 ? (
          <section className="message message-error mb-6 rounded-[1.5rem] p-5">
            <p className="font-semibold text-[#fff4e1]">Fix these before publishing</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6">
              {preflight.blocking.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </section>
        ) : (
          <section className="message message-success mb-6 rounded-[1.5rem] p-5">
            <p className="font-semibold text-[#fff4e1]">No blocking issues found in the saved article.</p>
          </section>
        )}

        {preflight.warnings.length > 0 ? (
          <section className="mb-6 rounded-[1.5rem] border border-[#d58b33]/35 bg-[#d58b33]/10 p-5 text-[#ffe7aa]">
            <p className="font-semibold text-[#fff4e1]">Worth checking</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6">
              {preflight.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
          <div className="space-y-6">
            <article className="panel rounded-[2rem] p-5 md:p-6">
              <p className="eyebrow mb-4">WordPress fields</p>
              <dl className="grid gap-4 text-sm">
                <div>
                  <dt className="label">Title</dt>
                  <dd className="text-[#fff4e1]">{preflight.title}</dd>
                </div>
                <div>
                  <dt className="label">Slug</dt>
                  <dd className="font-mono text-[#fff4e1]">{preflight.slug}</dd>
                </div>
                <div>
                  <dt className="label">Excerpt</dt>
                  <dd className="leading-6 text-[var(--muted)]">{preflight.excerpt || "None"}</dd>
                </div>
                <div>
                  <dt className="label">Focus phrase</dt>
                  <dd className="text-[#fff4e1]">{preflight.focusPhrase}</dd>
                </div>
                <div>
                  <dt className="label">Meta title</dt>
                  <dd className="text-[#fff4e1]">{preflight.metaTitle}</dd>
                </div>
                <div>
                  <dt className="label">Meta description</dt>
                  <dd className="leading-6 text-[var(--muted)]">{preflight.metaDescription}</dd>
                </div>
                <div>
                  <dt className="label">Category</dt>
                  <dd className="text-[#fff4e1]">
                    {preflight.category.name} (WordPress ID {preflight.category.wpCategoryId})
                  </dd>
                </div>
                <div>
                  <dt className="label">Tags</dt>
                  <dd className="flex flex-wrap gap-2">
                    {preflight.tags.length > 0 ? (
                      preflight.tags.map((tag) => (
                        <span className="score-strip" key={tag}>
                          <span>{tag}</span>
                        </span>
                      ))
                    ) : (
                      <span className="text-[var(--muted)]">None</span>
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="label">Desired status and schedule</dt>
                  <dd className="leading-6 text-[var(--muted)]">
                    {modeLabel(preflight.mode)}
                    {preflight.scheduledFor ? (
                      <>
                        <br />
                        WordPress local time: {preflight.scheduledForLocal?.replace("T", " ") ?? "not set"}
                        {preflight.scheduledForTimezone ? ` (${preflight.scheduledForTimezone})` : ""}
                        <br />
                        UTC: {preflight.scheduledFor.toISOString()}
                      </>
                    ) : mode === "future" ? (
                      <>
                        <br />No saved schedule yet.
                      </>
                    ) : null}
                  </dd>
                </div>
              </dl>
            </article>

            <article className="panel rounded-[2rem] p-5 md:p-6">
              <p className="eyebrow mb-4">Media plan</p>
              <div className="space-y-4 text-sm leading-6">
                {preflight.featuredImage ? (
                  <div className="rounded-[1.2rem] border border-[var(--line)] bg-black/10 p-4">
                    <p className="font-semibold text-[#fff4e1]">Featured image</p>
                    <p className="mt-1 break-all text-[var(--muted)]">{preflight.featuredImage.path}</p>
                    <p className="mt-2 text-[var(--muted)]">Alt text: {preflight.featuredImage.altText || "None"}</p>
                  </div>
                ) : (
                  <p className="text-[var(--muted)]">No featured image will be uploaded.</p>
                )}
                {preflight.bodyImages.length > 0 ? (
                  preflight.bodyImages.map((image) => (
                    <div className="rounded-[1.2rem] border border-[var(--line)] bg-black/10 p-4" key={image.path}>
                      <p className="font-semibold text-[#fff4e1]">In-post image</p>
                      <p className="mt-1 break-all text-[var(--muted)]">{image.path}</p>
                      <p className="mt-2 text-[var(--muted)]">Alt text: {image.altText || "None"}</p>
                    </div>
                  ))
                ) : null}
                {(preflight.featuredImage || preflight.bodyImages.length > 0) ? (
                  <p className="text-xs text-[var(--muted)]">
                    These local paths are rendered safely here. WordPress returns the final media URLs during upload,
                    and Foundry replaces the matching body-image paths in the outgoing request.
                  </p>
                ) : null}
              </div>
            </article>

            <article className="panel rounded-[2rem] p-5 md:p-6">
              <p className="eyebrow mb-4">Links in the outgoing HTML</p>
              <div className="space-y-3 text-sm leading-6">
                {preflight.links.length > 0 ? (
                  preflight.links.map((link) => (
                    <div className="rounded-[1.1rem] border border-[var(--line)] bg-black/10 p-3" key={`${link.href}-${link.label}`}>
                      <span className="status-pill status-succeeded">{link.type}</span>
                      <p className="mt-2 font-semibold text-[#fff4e1]">{link.label}</p>
                      <p className="mt-1 break-all text-[var(--muted)]">{link.href}</p>
                    </div>
                  ))
                ) : (
                  <p className="text-[var(--muted)]">No links are present in the saved rendered article.</p>
                )}
              </div>
              {preflight.verifiedInternalLinks.length > 0 ? (
                <div className="mt-5 border-t border-[var(--line)] pt-5">
                  <p className="label">Verified internal-link suggestions</p>
                  <div className="space-y-2 text-sm leading-6 text-[var(--muted)]">
                    {preflight.verifiedInternalLinks.map((link) => (
                      <p key={`${link.label}-${link.href}`}>
                        {link.label}{link.href ? ` — ${link.href}` : ""}
                      </p>
                    ))}
                  </div>
                </div>
              ) : null}
            </article>
          </div>

          <div className="space-y-6">
            <article className="panel rounded-[2rem] p-5 md:p-6">
              <p className="eyebrow mb-4">Sanitized article preview</p>
              <div
                className="publish-preflight-content rounded-[1.4rem] border border-[var(--line)] bg-black/20 p-5 md:p-7"
                dangerouslySetInnerHTML={{ __html: preflight.html }}
              />
            </article>

            <article className="panel rounded-[2rem] p-5 md:p-6">
              <p className="eyebrow mb-4">Exact sanitized HTML</p>
              <pre className="max-h-[42rem] overflow-auto rounded-[1.4rem] border border-[var(--line)] bg-black/30 p-4 font-mono text-xs leading-6 whitespace-pre-wrap text-[#f7ebd2]">
                <code>{preflight.html}</code>
              </pre>
            </article>
          </div>
        </section>
      </div>
    </main>
  );
}
