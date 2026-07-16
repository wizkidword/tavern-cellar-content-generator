import Link from "next/link";
import { notFound } from "next/navigation";

import { generateArticleComparisonAction } from "@/app/actions";
import { getArticleComparisonData } from "@/lib/content-pipeline";
import { parseArticleQualityWarnings } from "@/lib/intelligence/article-quality";
import { getOpenAITextModelLabel } from "@/lib/openai-models";

type ComparePageProps = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type ComparableDraft = {
  title: string;
  angle: string;
  primaryKeyword: string;
  slug: string;
  contentMarkdown: string;
  metaTitle: string;
  metaDescription: string;
  excerpt: string;
  tags: string;
  internalLinks: string;
  openAiTextModel: string;
  qualityWordCount: number;
  qualityHeadingCount: number;
  qualityMetaTitleLength: number;
  qualityMetaDescriptionLength: number;
  qualityInternalLinkCount: number;
  qualityFocusKeyphraseInTitle: boolean;
  qualityFocusKeyphraseInOpening: boolean;
  qualityFocusKeyphraseInMetaDescription: boolean;
  qualityWarnings: string;
};

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function qualitySignal(value: boolean) {
  return value ? "Yes" : "Needs work";
}

function DraftColumn({
  draft,
  eyebrow,
}: {
  draft: ComparableDraft;
  eyebrow: string;
}) {
  const warnings = parseArticleQualityWarnings(draft.qualityWarnings);

  return (
    <article className="panel rounded-[2rem] p-5 md:p-6">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="eyebrow mb-2">{eyebrow}</p>
          <h2 className="display text-3xl leading-none font-semibold text-[#fff1d7]">
            {getOpenAITextModelLabel(draft.openAiTextModel)}
          </h2>
        </div>
        <span className="rounded-full border border-[var(--line)] px-3 py-1 text-xs tracking-[0.14em] text-[var(--muted)] uppercase">
          {draft.slug}
        </span>
      </div>

      <div className="space-y-4">
        <div>
          <p className="label">Title</p>
          <p className="text-xl font-semibold leading-7 text-[#fff4e1]">{draft.title}</p>
        </div>
        <div>
          <p className="label">Angle</p>
          <p className="text-sm leading-6 text-[var(--muted)]">{draft.angle}</p>
        </div>
        <div>
          <p className="label">Meta Description</p>
          <p className="text-sm leading-6 text-[#eadbbe]">{draft.metaDescription}</p>
        </div>
        <div>
          <p className="label">Excerpt</p>
          <p className="text-sm leading-6 text-[var(--muted)]">{draft.excerpt}</p>
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <div className="mini-stat">
          <span>Words</span>
          <strong>{draft.qualityWordCount}</strong>
        </div>
        <div className="mini-stat">
          <span>Headings</span>
          <strong>{draft.qualityHeadingCount}</strong>
        </div>
        <div className="mini-stat">
          <span>Meta title</span>
          <strong>{draft.qualityMetaTitleLength}</strong>
        </div>
        <div className="mini-stat">
          <span>Meta desc</span>
          <strong>{draft.qualityMetaDescriptionLength}</strong>
        </div>
        <div className="mini-stat">
          <span>Focus title</span>
          <strong className="text-base">{qualitySignal(draft.qualityFocusKeyphraseInTitle)}</strong>
        </div>
        <div className="mini-stat">
          <span>Focus open</span>
          <strong className="text-base">{qualitySignal(draft.qualityFocusKeyphraseInOpening)}</strong>
        </div>
      </div>

      {warnings.length > 0 ? (
        <div className="mt-5 space-y-2 text-sm leading-6 text-[#ffd2c7]">
          {warnings.map((warning) => (
            <p key={warning}>{warning}</p>
          ))}
        </div>
      ) : null}

      <div className="mt-5 grid gap-4">
        <div>
          <p className="label">Tags</p>
          <p className="text-sm leading-6 text-[var(--muted)]">{draft.tags}</p>
        </div>
        <div>
          <p className="label">Internal Links</p>
          <p className="whitespace-pre-wrap text-sm leading-6 text-[var(--muted)]">
            {draft.internalLinks}
          </p>
        </div>
        <div>
          <p className="label">Article Body</p>
          <div className="max-h-[52rem] overflow-auto rounded-[1.4rem] border border-[var(--line)] bg-black/20 p-4 text-sm leading-7 whitespace-pre-wrap text-[#f7ebd2]">
            {draft.contentMarkdown}
          </div>
        </div>
      </div>
    </article>
  );
}

export default async function ArticleComparePage({ params, searchParams }: ComparePageProps) {
  const { id } = await params;
  const data = await getArticleComparisonData(id);

  if (!data) {
    notFound();
  }

  const query = searchParams ? await searchParams : undefined;
  const message = firstValue(query?.message);
  const error = firstValue(query?.error);
  const comparisonDrafts = data.comparisonModels
    .map((model) =>
      data.article.modelComparisons.find(
        (comparison) => comparison.openAiTextModel === model,
      ),
    )
    .filter(
      (comparison): comparison is (typeof data.article.modelComparisons)[number] =>
        Boolean(comparison),
    );

  return (
    <main className="app-shell">
      <div className="mx-auto flex min-h-screen w-full max-w-[1800px] flex-col px-5 py-6 md:px-8 xl:px-10">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <Link href={`/articles/${data.article.id}`} className="eyebrow mb-3 inline-block">
              Back to article
            </Link>
            <h1 className="display max-w-5xl text-4xl leading-none font-semibold text-[#fff1d7] md:text-5xl">
              Model comparison
            </h1>
            <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
              {data.article.primaryKeyword} / {data.article.category.name}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            {data.comparisonModels.map((model) => (
              <form action={generateArticleComparisonAction.bind(null, data.article.id)} key={model}>
                <input name="comparisonModel" type="hidden" value={model} />
                <button className="action-primary" type="submit">
                  Generate / Refresh {getOpenAITextModelLabel(model)}
                </button>
              </form>
            ))}
          </div>
        </div>

        {message ? <p className="message message-success mb-4">{message}</p> : null}
        {error ? <p className="message message-error mb-4">{error}</p> : null}

        {comparisonDrafts.length > 0 ? (
          <section className="grid gap-6 xl:grid-cols-2">
            <DraftColumn draft={data.article} eyebrow="Source Draft" />
            {comparisonDrafts.map((draft) => (
              <DraftColumn draft={draft} eyebrow="Comparison Draft" key={draft.id} />
            ))}
          </section>
        ) : (
          <section className="panel rounded-[2rem] p-6 md:p-8">
            <p className="eyebrow mb-3">Comparison Draft</p>
            <h2 className="display text-3xl font-semibold text-[#fff1d7]">
              No comparison drafts saved yet.
            </h2>
            <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
              Generate Nano, Mini, or GPT-5.5 drafts to compare them beside the current article.
            </p>
          </section>
        )}
      </div>
    </main>
  );
}
