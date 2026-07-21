"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  createArticle,
  generateArticleModelComparison,
  publishArticle,
  reconcileArticlePublish,
  regenerateArticleBodyImages,
  regenerateFeaturedImage,
  saveArticleReview,
  scheduleArticleRandomly,
  sourceFeaturedImageFromWeb,
} from "@/lib/content-pipeline";
import { createArticleClaim, updateArticleClaim } from "@/lib/article-claims";
import { insertArticleInternalLink } from "@/lib/article-internal-links";
import {
  createArticleFromOpportunity,
  createOpportunityFromInput,
  deleteOpportunity,
  generateOpportunitiesForCategory,
  updateOpportunityStatus,
} from "@/lib/intelligence/opportunities";
import { upsertTopicClustersFromCurrentCatalog } from "@/lib/intelligence/clusters";
import {
  assertOperatorActionAccess,
  assertProviderActionAllowed,
} from "@/lib/operator-auth";
import { AppError, reportAppError } from "@/lib/errors/app-error";
import {
  articleGenerationSettingsSchema,
  articleClaimCreateFormSchema,
  articleClaimUpdateFormSchema,
  articleReviewFormSchema,
  categoryOnlyFormSchema,
  comparisonFormSchema,
  generateArticleFormSchema,
  opportunityFormSchema,
  parseFormData,
  webImageSelectionSchema,
  wordpressCategoryFormSchema,
} from "@/lib/validation/schemas";
import { createWordPressCategoryAndSync, syncWordPressCatalog } from "@/lib/wordpress";

function buildRedirect(pathname: string, params: Record<string, string | AppError>) {
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value instanceof AppError) {
      searchParams.set(key, value.code);
      searchParams.set("ref", value.correlationId);
      continue;
    }

    searchParams.set(key, value);
  }

  return `${pathname}?${searchParams.toString()}`;
}

function getErrorMessage(error: unknown) {
  return reportAppError(error, "server_action");
}

function resolveFeaturedImageMode(input: {
  generateImage: boolean;
  featuredImageMode?: "none" | "ai" | "licensed";
}) {
  return input.featuredImageMode ?? (input.generateImage ? "ai" : "none");
}

function articleDraftRedirect(articleId: string, imageMode: "none" | "ai" | "licensed", message: string) {
  const target = buildRedirect(`/articles/${articleId}`, {
    message:
      imageMode === "licensed"
        ? "Draft ready. Licensed image results are loading below."
        : message,
    ...(imageMode === "licensed" ? { imageSource: "licensed" } : {}),
  });

  return imageMode === "licensed" ? `${target}#featured-image` : target;
}

async function runWordPressCatalogSync(
  mode: "FULL_PRIVATE" | "PUBLIC_ONLY",
  targetPage: "/" | "/operations",
) {
  let targetPath: string = targetPage;

  try {
    await assertOperatorActionAccess();
    const result = await syncWordPressCatalog({ mode });
    revalidatePath("/");
    revalidatePath("/intelligence");
    revalidatePath("/opportunities");
    revalidatePath("/operations");
    targetPath = buildRedirect(targetPage, {
      message:
        mode === "FULL_PRIVATE"
          ? `Completed a full private sync: ${result.categoryCount} categories and ${result.postCount} posts.`
          : `Completed a public-only sync: ${result.categoryCount} categories and ${result.postCount} visible posts. Private coverage may be missing.`,
    });
  } catch (error) {
    revalidatePath("/");
    revalidatePath("/intelligence");
    revalidatePath("/operations");
    targetPath = buildRedirect(targetPage, {
      error: getErrorMessage(error),
    });
  }

  redirect(targetPath);
}

export async function syncWordPressCatalogAction(
  mode: "FULL_PRIVATE" | "PUBLIC_ONLY" = "FULL_PRIVATE",
  _formData?: FormData,
) {
  void _formData;
  await runWordPressCatalogSync(mode, "/");
}

export async function syncWordPressCatalogFromOperationsAction(
  mode: "FULL_PRIVATE" | "PUBLIC_ONLY",
  _formData?: FormData,
) {
  void _formData;
  await runWordPressCatalogSync(mode, "/operations");
}

export async function refreshTopicClustersAction() {
  let targetPath = "/intelligence";

  try {
    await assertOperatorActionAccess();
    const clusters = await upsertTopicClustersFromCurrentCatalog();
    revalidatePath("/intelligence");
    revalidatePath("/opportunities");
    targetPath = buildRedirect("/intelligence", {
      message: `Refreshed ${clusters.length} topic clusters from synced coverage.`,
    });
  } catch (error) {
    targetPath = buildRedirect("/intelligence", {
      error: getErrorMessage(error),
    });
  }

  redirect(targetPath);
}

export async function generateArticleAction(formData: FormData) {
  let targetPath = "/";

  try {
    const session = await assertOperatorActionAccess();
    const input = parseFormData(generateArticleFormSchema, formData);
    assertProviderActionAllowed(session.sid);
    const imageMode = resolveFeaturedImageMode(input);
    const articleInput = { ...input };
    delete articleInput.featuredImageMode;
    const article = await createArticle({
      ...articleInput,
      generateImage: imageMode === "ai",
    });

    revalidatePath("/");
    revalidatePath(`/articles/${article.id}`);
    targetPath = articleDraftRedirect(
      article.id,
      imageMode,
      "Article generated and saved to the review queue.",
    );
  } catch (error) {
    targetPath = buildRedirect("/", {
      error: getErrorMessage(error),
    });
  }

  redirect(targetPath);
}

export async function createOpportunityAction(formData: FormData) {
  let targetPath = "/opportunities";

  try {
    await assertOperatorActionAccess();
    const opportunity = await createOpportunityFromInput(
      parseFormData(opportunityFormSchema, formData),
    );

    revalidatePath("/intelligence");
    revalidatePath("/opportunities");
    revalidatePath(`/opportunities/${opportunity.id}`);
    targetPath = buildRedirect(`/opportunities/${opportunity.id}`, {
      message: "Opportunity scored and saved.",
    });
  } catch (error) {
    targetPath = buildRedirect("/opportunities", {
      error: getErrorMessage(error),
    });
  }

  redirect(targetPath);
}

export async function generateOpportunityIdeasAction(formData: FormData) {
  let targetPath = "/opportunities";

  try {
    const session = await assertOperatorActionAccess();
    const { categoryId } = parseFormData(categoryOnlyFormSchema, formData);
    assertProviderActionAllowed(session.sid);
    const result = await generateOpportunitiesForCategory(categoryId);
    revalidatePath("/intelligence");
    revalidatePath("/opportunities");
    targetPath = buildRedirect("/opportunities", {
      categoryId: String(categoryId),
      message: `Generated ${result.opportunities.length} AI-assisted opportunities and re-scored them locally.`,
    });
  } catch (error) {
    targetPath = buildRedirect("/opportunities", {
      error: getErrorMessage(error),
    });
  }

  redirect(targetPath);
}

export async function createWordPressCategoryAction(formData: FormData) {
  let targetPath = "/opportunities";

  try {
    await assertOperatorActionAccess();
    const category = await createWordPressCategoryAndSync(
      (() => {
        const input = parseFormData(wordpressCategoryFormSchema, formData);
        return {
          name: input.categoryName,
          slug: input.categorySlug,
          description: input.categoryDescription,
        };
      })(),
    );
    revalidatePath("/");
    revalidatePath("/intelligence");
    revalidatePath("/opportunities");
    targetPath = buildRedirect("/opportunities", {
      categoryId: String(category.id),
      message: `Created WordPress category: ${category.name}.`,
    });
  } catch (error) {
    targetPath = buildRedirect("/opportunities", {
      error: getErrorMessage(error),
    });
  }

  redirect(targetPath);
}

export async function deleteOpportunityAction(opportunityId: string) {
  let targetPath = "/opportunities";

  try {
    await assertOperatorActionAccess();
    const opportunity = await deleteOpportunity(opportunityId);
    revalidatePath("/intelligence");
    revalidatePath("/opportunities");
    revalidatePath(`/opportunities/${opportunityId}`);

    if (opportunity.generatedArticleId) {
      revalidatePath(`/articles/${opportunity.generatedArticleId}`);
    }

    targetPath = buildRedirect("/opportunities", {
      message: `Deleted opportunity idea: ${opportunity.primaryKeyword}.`,
    });
  } catch (error) {
    targetPath = buildRedirect("/opportunities", {
      error: getErrorMessage(error),
    });
  }

  redirect(targetPath);
}

async function setOpportunityStatusAction(
  opportunityId: string,
  status: "APPROVED" | "REJECTED" | "ARCHIVED",
  message: string,
) {
  let targetPath = `/opportunities/${opportunityId}`;

  try {
    await assertOperatorActionAccess();
    await updateOpportunityStatus(opportunityId, status);
    revalidatePath("/opportunities");
    revalidatePath(`/opportunities/${opportunityId}`);
    targetPath = buildRedirect(`/opportunities/${opportunityId}`, {
      message,
    });
  } catch (error) {
    targetPath = buildRedirect(`/opportunities/${opportunityId}`, {
      error: getErrorMessage(error),
    });
  }

  redirect(targetPath);
}

export async function approveOpportunityAction(opportunityId: string) {
  await setOpportunityStatusAction(
    opportunityId,
    "APPROVED",
    "Opportunity approved.",
  );
}

export async function rejectOpportunityAction(opportunityId: string) {
  await setOpportunityStatusAction(
    opportunityId,
    "REJECTED",
    "Opportunity rejected.",
  );
}

export async function archiveOpportunityAction(opportunityId: string) {
  await setOpportunityStatusAction(
    opportunityId,
    "ARCHIVED",
    "Opportunity archived.",
  );
}

export async function generateOpportunityDraftAction(opportunityId: string, formData: FormData) {
  let targetPath = `/opportunities/${opportunityId}`;

  try {
    const session = await assertOperatorActionAccess();
    const input = parseFormData(articleGenerationSettingsSchema, formData);
    assertProviderActionAllowed(session.sid);
    const imageMode = resolveFeaturedImageMode(input);
    const opportunityInput = { ...input };
    delete opportunityInput.featuredImageMode;
    const article = await createArticleFromOpportunity(
      opportunityId,
      {
        ...opportunityInput,
        generateImage: imageMode === "ai",
      },
    );
    revalidatePath("/opportunities");
    revalidatePath(`/opportunities/${opportunityId}`);
    revalidatePath(`/articles/${article.id}`);
    revalidatePath("/");
    targetPath = articleDraftRedirect(
      article.id,
      imageMode,
      "Draft generated from the approved opportunity.",
    );
  } catch (error) {
    targetPath = buildRedirect(`/opportunities/${opportunityId}`, {
      error: getErrorMessage(error),
    });
  }

  redirect(targetPath);
}

export async function saveArticleReviewAction(articleId: string, formData: FormData) {
  let targetPath = `/articles/${articleId}`;

  try {
    await assertOperatorActionAccess();
    await saveArticleReview(articleId, formData);
    revalidatePath(`/articles/${articleId}`);
    revalidatePath("/");
    targetPath = buildRedirect(`/articles/${articleId}`, {
      message: "Local review changes saved.",
    });
  } catch (error) {
    targetPath = buildRedirect(`/articles/${articleId}`, {
      error: getErrorMessage(error),
    });
  }

  redirect(targetPath);
}

export async function createArticleClaimAction(articleId: string, formData: FormData) {
  const targetPage = `/articles/${articleId}`;
  let targetPath = targetPage;

  try {
    await assertOperatorActionAccess();
    const input = parseFormData(articleClaimCreateFormSchema, formData);
    await createArticleClaim(articleId, input);
    revalidatePath(targetPage);
    targetPath = buildRedirect(targetPage, { message: "Claim added for verification." });
  } catch (error) {
    targetPath = buildRedirect(targetPage, { error: getErrorMessage(error) });
  }

  redirect(targetPath);
}

export async function saveArticleClaimAction(
  articleId: string,
  claimId: string,
  formData: FormData,
) {
  const targetPage = `/articles/${articleId}`;
  let targetPath = targetPage;

  try {
    await assertOperatorActionAccess();
    const input = parseFormData(articleClaimUpdateFormSchema, formData);
    await updateArticleClaim(articleId, claimId, input);
    revalidatePath(targetPage);
    targetPath = buildRedirect(targetPage, { message: "Claim saved." });
  } catch (error) {
    targetPath = buildRedirect(targetPage, { error: getErrorMessage(error) });
  }

  redirect(targetPath);
}

export async function insertArticleInternalLinkAction(
  articleId: string,
  targetKey: string,
  _formData?: FormData,
) {
  void _formData;
  const targetPage = `/articles/${articleId}`;
  let targetPath = targetPage;

  try {
    await assertOperatorActionAccess();
    const article = await insertArticleInternalLink(articleId, targetKey);
    revalidatePath(targetPage);
    revalidatePath("/");
    targetPath = buildRedirect(targetPage, {
      message: `Inserted an internal link to ${article.internalLinks.split("\n").at(-1) ?? "the selected target"}.`,
    });
  } catch (error) {
    targetPath = buildRedirect(targetPage, { error: getErrorMessage(error) });
  }

  redirect(targetPath);
}

export async function generateArticleComparisonAction(articleId: string, formData?: FormData) {
  let targetPath = `/articles/${articleId}/compare`;

  try {
    const session = await assertOperatorActionAccess();
    const comparisonModel = formData
      ? parseFormData(comparisonFormSchema, formData).comparisonModel
      : undefined;
    assertProviderActionAllowed(session.sid);
    const comparison = await generateArticleModelComparison(
      articleId,
      comparisonModel,
    );
    revalidatePath(`/articles/${articleId}`);
    revalidatePath(`/articles/${articleId}/compare`);
    targetPath = buildRedirect(`/articles/${articleId}/compare`, {
      message: `Generated ${comparison.openAiTextModel} comparison draft.`,
    });
  } catch (error) {
    targetPath = buildRedirect(`/articles/${articleId}`, {
      error: getErrorMessage(error),
    });
  }

  redirect(targetPath);
}

export async function regenerateFeaturedImageAction(articleId: string, formData: FormData) {
  let targetPath = `/articles/${articleId}`;

  try {
    const session = await assertOperatorActionAccess();
    parseFormData(articleReviewFormSchema, formData);
    assertProviderActionAllowed(session.sid);
    await regenerateFeaturedImage(articleId, formData);
    revalidatePath(`/articles/${articleId}`);
    targetPath = buildRedirect(`/articles/${articleId}`, {
      message: "Featured image regenerated.",
    });
  } catch (error) {
    targetPath = buildRedirect(`/articles/${articleId}`, {
      error: getErrorMessage(error),
    });
  }

  redirect(targetPath);
}

export async function sourceFeaturedImageFromWebAction(
  articleId: string,
  source: "wikimedia" | "openverse",
  assetId: string,
) {
  let targetPath = `/articles/${articleId}`;

  try {
    await assertOperatorActionAccess();
    const article = await sourceFeaturedImageFromWeb(
      articleId,
      webImageSelectionSchema.parse({ assetId, source }),
    );
    revalidatePath(`/articles/${article.id}`);
    revalidatePath(`/articles/${article.id}/preflight`);
    targetPath = buildRedirect(`/articles/${article.id}`, {
      message: "Web image saved to the draft with its source and license details.",
    });
  } catch (error) {
    targetPath = buildRedirect(`/articles/${articleId}`, {
      error: getErrorMessage(error),
    });
  }

  redirect(targetPath);
}

export async function regenerateArticleBodyImagesAction(articleId: string, formData: FormData) {
  let targetPath = `/articles/${articleId}`;

  try {
    const session = await assertOperatorActionAccess();
    parseFormData(articleReviewFormSchema, formData);
    assertProviderActionAllowed(session.sid);
    const article = await regenerateArticleBodyImages(articleId, formData);
    revalidatePath(`/articles/${article.id}`);
    targetPath = buildRedirect(`/articles/${article.id}`, {
      message: `Generated ${article.bodyImages.length} article body image${article.bodyImages.length === 1 ? "" : "s"}.`,
    });
  } catch (error) {
    targetPath = buildRedirect(`/articles/${articleId}`, {
      error: getErrorMessage(error),
    });
  }

  redirect(targetPath);
}

export async function sendWordPressDraftAction(articleId: string, formData: FormData) {
  let targetPath = `/articles/${articleId}`;

  try {
    await assertOperatorActionAccess();
    const article = await publishArticle(articleId, formData, "draft");
    revalidatePath(`/articles/${articleId}`);
    revalidatePath("/");
    targetPath = buildRedirect(`/articles/${articleId}`, {
      message:
        article.notes?.includes("Yoast SEO REST bridge")
          ? "Draft pushed to WordPress. Tags were synced. Yoast fields still need the companion bridge plugin installed on WordPress."
          : "Draft pushed to WordPress. Tags were synced.",
    });
  } catch (error) {
    targetPath = buildRedirect(`/articles/${articleId}`, {
      error: getErrorMessage(error),
    });
  }

  redirect(targetPath);
}

export async function publishNowAction(articleId: string, formData: FormData) {
  let targetPath = `/articles/${articleId}`;

  try {
    await assertOperatorActionAccess();
    const article = await publishArticle(articleId, formData, "publish");
    revalidatePath(`/articles/${articleId}`);
    revalidatePath("/");
    targetPath = buildRedirect(`/articles/${articleId}`, {
      message:
        article.notes?.includes("Yoast SEO REST bridge")
          ? "Article published to WordPress. Tags were synced. Yoast fields still need the companion bridge plugin installed on WordPress."
          : "Article published to WordPress. Tags were synced.",
    });
  } catch (error) {
    targetPath = buildRedirect(`/articles/${articleId}`, {
      error: getErrorMessage(error),
    });
  }

  redirect(targetPath);
}

async function runArticlePublishReconciliation(
  articleId: string,
  targetPage: string,
) {
  let targetPath: string = targetPage;

  try {
    await assertOperatorActionAccess();
    await reconcileArticlePublish(articleId);
    revalidatePath(`/articles/${articleId}`);
    revalidatePath("/");
    revalidatePath("/operations");
    targetPath = buildRedirect(targetPage, {
      message: "Publish recovery completed. The existing WordPress post was reconciled before retrying.",
    });
  } catch (error) {
    targetPath = buildRedirect(targetPage, {
      error: getErrorMessage(error),
    });
  }

  redirect(targetPath);
}

export async function reconcileArticlePublishAction(articleId: string, _formData?: FormData) {
  void _formData;
  await runArticlePublishReconciliation(articleId, `/articles/${articleId}`);
}

export async function reconcileArticlePublishFromOperationsAction(
  articleId: string,
  _formData?: FormData,
) {
  void _formData;
  await runArticlePublishReconciliation(articleId, "/operations");
}

export async function scheduleArticleAction(articleId: string, formData: FormData) {
  let targetPath = `/articles/${articleId}`;

  try {
    await assertOperatorActionAccess();
    const article = await publishArticle(articleId, formData, "future");
    revalidatePath(`/articles/${articleId}`);
    revalidatePath("/");
    revalidatePath("/calendar");
    targetPath = buildRedirect(`/articles/${articleId}`, {
      message:
        article.notes?.includes("Yoast SEO REST bridge")
          ? "Article scheduled in WordPress. Tags were synced. Yoast fields still need the companion bridge plugin installed on WordPress."
          : "Article scheduled in WordPress. Tags were synced.",
    });
  } catch (error) {
    targetPath = buildRedirect(`/articles/${articleId}`, {
      error: getErrorMessage(error),
    });
  }

  redirect(targetPath);
}

export async function randomScheduleArticleAction(articleId: string, formData: FormData) {
  let targetPath = `/articles/${articleId}`;

  try {
    await assertOperatorActionAccess();
    const article = await scheduleArticleRandomly(articleId, formData);
    const scheduleLabel = article.scheduledForLocal?.replace("T", " ") ?? "the selected random slot";
    revalidatePath(`/articles/${articleId}`);
    revalidatePath("/");
    revalidatePath("/calendar");
    targetPath = buildRedirect(`/articles/${articleId}`, {
      message:
        article.notes?.includes("Yoast SEO REST bridge")
          ? `Article randomly scheduled in WordPress for ${scheduleLabel}. Tags were synced. Yoast fields still need the companion bridge plugin installed on WordPress.`
          : `Article randomly scheduled in WordPress for ${scheduleLabel}. Tags were synced.`,
    });
  } catch (error) {
    targetPath = buildRedirect(`/articles/${articleId}`, {
      error: getErrorMessage(error),
    });
  }

  redirect(targetPath);
}
