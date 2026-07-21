import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { format } from "date-fns";

import {
  generateArticleComparisonAction,
  publishNowAction,
  randomScheduleArticleAction,
  reconcileArticlePublishAction,
  regenerateArticleBodyImagesAction,
  regenerateFeaturedImageAction,
  saveArticleReviewAction,
  scheduleArticleAction,
  sendWordPressDraftAction,
} from "@/app/actions";
import { PublishActionButton } from "@/app/publish-action-button";
import { MAX_ARTICLE_BODY_IMAGE_COUNT } from "@/lib/article-body-images";
import {
  getArticleById,
  getArticleImageRecoveryState,
  getDashboardData,
} from "@/lib/content-pipeline";
import { getErrorFeedback } from "@/lib/errors/app-error";
import {
  DEFAULT_FAL_IMAGE_MODEL,
  DEFAULT_FEATURED_IMAGE_PROVIDER,
  DEFAULT_OPENAI_IMAGE_MODEL,
  FAL_IMAGE_MODEL_OPTIONS,
  FEATURED_IMAGE_HEIGHT,
  FEATURED_IMAGE_PROVIDER_OPTIONS,
  FEATURED_IMAGE_WIDTH,
  OPENAI_IMAGE_MODEL_OPTIONS,
  resolveOpenAIImageModel,
} from "@/lib/featured-image-models";
import { parseArticleQualityWarnings } from "@/lib/intelligence/article-quality";
import { requireOperatorPage } from "@/lib/operator-auth";
import {
  getComparisonCandidateOpenAITextModels,
  getOpenAITextModelLabel,
} from "@/lib/openai-models";

export const dynamic = "force-dynamic";

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

function qualitySignal(value: boolean) {
  return value ? "Yes" : "Needs work";
}

export default async function ArticlePage({ params, searchParams }: ArticlePageProps) {
  await requireOperatorPage();
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
  const errorMessage = getErrorFeedback(error, firstValue(query?.ref));
  const sourceOpportunity = article.contentOpportunities[0];
  const qualityWarnings = parseArticleQualityWarnings(article.qualityWarnings);
  const comparisonModels = getComparisonCandidateOpenAITextModels(article.openAiTextModel);
  const hasComparisons = article.modelComparisons.length > 0;
  const bodyImageDefaultCount = String(article.bodyImages.length || 2);
  const imageRecovery = getArticleImageRecoveryState({
    featuredImagePath: article.featuredImagePath,
    bodyImageCount: article.bodyImages.length,
    notes: article.notes,
  });
  const openAiImageModelDefault = article.openAiImageModel
    ? resolveOpenAIImageModel(article.openAiImageModel)
    : DEFAULT_OPENAI_IMAGE_MODEL;
  const latestPublishAttempt = article.publishAttempts[0] ?? null;
  const canReconcilePublish =
    article.publishState === "IN_PROGRESS" ||
    latestPublishAttempt?.state === "FAILED" ||
    latestPublishAttempt?.state === "UNCERTAIN";

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
            <span className="rounded-full border border-[var(--line)] px-4 py-2 text-sm text-[var(--muted)]">
              {getOpenAITextModelLabel(article.openAiTextModel)}
            </span>
          </div>
        </div>

        {message ? <p className="message message-success mb-4">{message}</p> : null}
        {error ? <p className="message message-error mb-4">{errorMessage}</p> : null}

        <section className="panel mb-6 rounded-[1.5rem] p-4 md:p-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="eyebrow mb-2">Model Comparison</p>
              <p className="text-sm leading-6 text-[var(--muted)]">
                Current draft: {getOpenAITextModelLabel(article.openAiTextModel)}. Generate saved
                comparison drafts with the same keyword and angle.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              {hasComparisons ? (
                <Link className="action-secondary text-center" href={`/articles/${article.id}/compare`}>
                  Open Side-by-Side
                </Link>
              ) : null}
              {comparisonModels.map((model) => (
                <form action={generateArticleComparisonAction.bind(null, article.id)} key={model}>
                  <input name="comparisonModel" type="hidden" value={model} />
                  <button className="action-primary" type="submit">
                    Generate / Refresh {getOpenAITextModelLabel(model)}
                  </button>
                </form>
              ))}
            </div>
          </div>
        </section>

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
                  <PublishActionButton
                    className="action-secondary"
                    formAction={sendWordPressDraftAction.bind(null, article.id)}
                    pendingLabel="Saving WordPress Draft..."
                    type="submit"
                  >
                    Push WordPress Draft
                  </PublishActionButton>
                  <PublishActionButton
                    className="action-secondary"
                    formAction={publishNowAction.bind(null, article.id)}
                    pendingLabel="Publishing..."
                    type="submit"
                  >
                    Publish Now
                  </PublishActionButton>
                  <PublishActionButton
                    className="action-secondary"
                    formAction={scheduleArticleAction.bind(null, article.id)}
                    pendingLabel="Scheduling..."
                    type="submit"
                  >
                    Schedule in WordPress
                  </PublishActionButton>
                  <PublishActionButton
                    className="action-secondary"
                    formAction={randomScheduleArticleAction.bind(null, article.id)}
                    pendingLabel="Finding a schedule..."
                    type="submit"
                  >
                    Random Schedule (Up to 60 Days)
                  </PublishActionButton>
                </div>

                <div className="rounded-[1.3rem] border border-[var(--line)] bg-black/10 px-4 py-4 text-sm text-[var(--muted)]">
                  WordPress post ID: {article.wpPostId ?? "Not created yet"}
                  <br />
                  WordPress status: {article.wpStatus ?? "Local only"}
                  <br />
                  Publish recovery state: {article.publishState.replaceAll("_", " ")}
                  {latestPublishAttempt ? (
                    <>
                      <br />
                      Latest publish checkpoint: {latestPublishAttempt.lastCheckpoint ?? latestPublishAttempt.state}
                      {latestPublishAttempt.wpPostId ? (
                        <>
                          <br />
                          Recovered WordPress post ID: {latestPublishAttempt.wpPostId}
                        </>
                      ) : null}
                      {latestPublishAttempt.errorCode ? (
                        <p className="mt-3 text-[#ffd2c7]">
                          {getErrorFeedback(
                            latestPublishAttempt.errorCode,
                            latestPublishAttempt.errorCorrelationId ?? undefined,
                          )}
                        </p>
                      ) : null}
                      {latestPublishAttempt.warningCode ? (
                        <p className="mt-3 text-[#ffe7aa]">
                          WordPress accepted the core post update, but the optional Yoast metadata could not be confirmed.
                        </p>
                      ) : null}
                      {canReconcilePublish ? (
                        <PublishActionButton
                          className="action-primary mt-3 w-full"
                          formAction={reconcileArticlePublishAction.bind(null, article.id)}
                          pendingLabel="Reconciling publish..."
                          type="submit"
                        >
                          Reconcile and Retry Publish
                        </PublishActionButton>
                      ) : null}
                    </>
                  ) : null}
                </div>
              </div>
            </section>

            <section className="panel rounded-[2rem] p-6">
              <div className="mb-5">
                <p className="eyebrow mb-3">Quality Signals</p>
                <h2 className="display text-3xl font-semibold text-[#fff1d7]">
                  Draft health
                </h2>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="mini-stat">
                  <span>Words</span>
                  <strong>{article.qualityWordCount}</strong>
                </div>
                <div className="mini-stat">
                  <span>Headings</span>
                  <strong>{article.qualityHeadingCount}</strong>
                </div>
                <div className="mini-stat">
                  <span>Meta title</span>
                  <strong>{article.qualityMetaTitleLength}</strong>
                </div>
                <div className="mini-stat">
                  <span>Meta desc</span>
                  <strong>{article.qualityMetaDescriptionLength}</strong>
                </div>
                <div className="mini-stat">
                  <span>Links</span>
                  <strong>{article.qualityInternalLinkCount}</strong>
                </div>
                <div className="mini-stat">
                  <span>Focus title</span>
                  <strong className="text-base">{qualitySignal(article.qualityFocusKeyphraseInTitle)}</strong>
                </div>
                <div className="mini-stat">
                  <span>Focus open</span>
                  <strong className="text-base">{qualitySignal(article.qualityFocusKeyphraseInOpening)}</strong>
                </div>
                <div className="mini-stat">
                  <span>Focus meta</span>
                  <strong className="text-base">
                    {qualitySignal(article.qualityFocusKeyphraseInMetaDescription)}
                  </strong>
                </div>
              </div>

              {qualityWarnings.length > 0 ? (
                <div className="mt-4 space-y-2 text-sm leading-6 text-[#ffd2c7]">
                  {qualityWarnings.map((warning) => (
                    <p key={warning}>{warning}</p>
                  ))}
                </div>
              ) : (
                <p className="mt-4 text-sm leading-6 text-[#ccefdc]">
                  No deterministic quality warnings on the saved draft.
                </p>
              )}
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
                    width={FEATURED_IMAGE_WIDTH}
                    height={FEATURED_IMAGE_HEIGHT}
                  />
                ) : (
                  <div className="rounded-[1.4rem] border border-dashed border-[var(--line)] px-4 py-12 text-center text-[var(--muted)]">
                    No featured image generated yet.
                  </div>
                )}

                {imageRecovery.featuredImage.canRetry ? (
                  <div className="message message-error">
                    <p className="font-semibold text-[#fff4e1]">
                      {imageRecovery.featuredImage.reason === "failed"
                        ? "Featured image generation failed."
                        : "Featured image is missing."}
                    </p>
                    <p className="mt-1 text-sm leading-6">
                      Review the prompt and selected generator, then retry without regenerating the article.
                    </p>
                    <button
                      className="action-primary mt-3 w-full"
                      formAction={regenerateFeaturedImageAction.bind(null, article.id)}
                      type="submit"
                    >
                      {imageRecovery.featuredImage.reason === "failed"
                        ? "Retry Featured Image"
                        : "Generate Featured Image"}
                    </button>
                  </div>
                ) : null}

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

                <div>
                  <label className="label" htmlFor="imageProvider">
                    Featured Image Generator
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
                    defaultValue={openAiImageModelDefault}
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

                <button
                  className="action-secondary w-full"
                  formAction={regenerateFeaturedImageAction.bind(null, article.id)}
                  type="submit"
                >
                  Generate / Refresh Featured Image
                </button>
              </div>
            </section>

            <section className="panel rounded-[2rem] p-6">
              <div className="mb-5">
                <p className="eyebrow mb-3">Article Body Images</p>
                <h2 className="display text-3xl font-semibold text-[#fff1d7]">In-post visuals</h2>
              </div>

              <div className="space-y-4">
                {article.bodyImages.length > 0 ? (
                  <div className="grid gap-3">
                    {article.bodyImages.map((bodyImage) => (
                      <div className="rounded-[1.2rem] border border-[var(--line)] bg-black/10 p-3" key={bodyImage.id}>
                        <Image
                          alt={bodyImage.altText}
                          className="aspect-video w-full rounded-[0.9rem] object-cover"
                          src={bodyImage.publicPath}
                          width={FEATURED_IMAGE_WIDTH}
                          height={FEATURED_IMAGE_HEIGHT}
                        />
                        <p className="mt-3 text-sm font-semibold text-[#fff4e1]">
                          {bodyImage.sectionHeading}
                        </p>
                        <p className="mt-1 text-xs leading-5 text-[var(--muted)]">{bodyImage.altText}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-[1.4rem] border border-dashed border-[var(--line)] px-4 py-10 text-center text-[var(--muted)]">
                    No article body images generated yet.
                  </div>
                )}

                {imageRecovery.bodyImages.reason === "failed" ? (
                  <div className="message message-error">
                    <p className="font-semibold text-[#fff4e1]">
                      Article body image generation failed.
                    </p>
                    <p className="mt-1 text-sm leading-6">
                      Pick how many in-post images you want and retry with the selected generator.
                    </p>
                    <button
                      className="action-primary mt-3 w-full"
                      formAction={regenerateArticleBodyImagesAction.bind(null, article.id)}
                      type="submit"
                    >
                      Retry Body Images
                    </button>
                  </div>
                ) : null}

                <div>
                  <label className="label" htmlFor="bodyImageCount">
                    Images Inside Article
                  </label>
                  <select
                    className="field"
                    defaultValue={bodyImageDefaultCount}
                    id="bodyImageCount"
                    name="bodyImageCount"
                  >
                    {Array.from({ length: MAX_ARTICLE_BODY_IMAGE_COUNT + 1 }, (_, count) => (
                      <option key={count} value={count}>
                        {count}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="label" htmlFor="bodyImageProvider">
                    Body Image Generator
                  </label>
                  <select
                    className="field"
                    defaultValue={DEFAULT_FEATURED_IMAGE_PROVIDER}
                    id="bodyImageProvider"
                    name="bodyImageProvider"
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
                  <label className="label" htmlFor="bodyImageFalModel">
                    Body fal.ai Model
                  </label>
                  <select
                    className="field"
                    defaultValue={DEFAULT_FAL_IMAGE_MODEL}
                    id="bodyImageFalModel"
                    name="bodyImageFalModel"
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
                  <label className="label" htmlFor="bodyOpenAiImageModel">
                    Body GPT Image Model
                  </label>
                  <select
                    className="field"
                    defaultValue={openAiImageModelDefault}
                    id="bodyOpenAiImageModel"
                    name="bodyOpenAiImageModel"
                    required
                  >
                    {OPENAI_IMAGE_MODEL_OPTIONS.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                <button
                  className="action-secondary w-full"
                  formAction={regenerateArticleBodyImagesAction.bind(null, article.id)}
                  type="submit"
                >
                  Generate / Refresh Body Images
                </button>
              </div>
            </section>
          </aside>
        </form>
      </div>
    </main>
  );
}
