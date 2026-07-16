"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  createArticle,
  generateArticleModelComparison,
  publishArticle,
  regenerateArticleBodyImages,
  regenerateFeaturedImage,
  saveArticleReview,
  scheduleArticleRandomly,
} from "@/lib/content-pipeline";
import {
  createArticleFromOpportunity,
  createOpportunityFromInput,
  deleteOpportunity,
  generateOpportunitiesForCategory,
  updateOpportunityStatus,
} from "@/lib/intelligence/opportunities";
import { upsertTopicClustersFromCurrentCatalog } from "@/lib/intelligence/clusters";
import { assertOperatorAccessFromHeaders } from "@/lib/operator-auth";
import {
  resolveFalImageModel,
  resolveFeaturedImageProvider,
  resolveOpenAIImageModel,
} from "@/lib/featured-image";
import { resolveOpenAITextModel } from "@/lib/openai-models";
import { createWordPressCategoryAndSync, syncWordPressCatalog } from "@/lib/wordpress";

function buildRedirect(pathname: string, params: Record<string, string>) {
  const searchParams = new URLSearchParams(params);
  return `${pathname}?${searchParams.toString()}`;
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Something went wrong.";
}

export async function syncWordPressCatalogAction() {
  let targetPath = "/";

  try {
    await assertOperatorAccessFromHeaders();
    const result = await syncWordPressCatalog();
    revalidatePath("/");
    targetPath = buildRedirect("/", {
      message: `Synced ${result.categoryCount} categories and ${result.postCount} live posts from WordPress.`,
    });
  } catch (error) {
    targetPath = buildRedirect("/", {
      error: getErrorMessage(error),
    });
  }

  redirect(targetPath);
}

export async function refreshTopicClustersAction() {
  let targetPath = "/intelligence";

  try {
    await assertOperatorAccessFromHeaders();
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
    await assertOperatorAccessFromHeaders();
    const article = await createArticle({
      categoryId: Number(String(formData.get("categoryId") ?? "0")),
      primaryKeyword: String(formData.get("primaryKeyword") ?? ""),
      angle: String(formData.get("angle") ?? ""),
      notes: String(formData.get("notes") ?? ""),
      generateImage: formData.get("generateImage") === "on",
      textModel: resolveOpenAITextModel(formData.get("textModel")),
      imageProvider: resolveFeaturedImageProvider(formData.get("imageProvider")),
      falImageModel: resolveFalImageModel(formData.get("falImageModel")),
      openAiImageModel: resolveOpenAIImageModel(formData.get("openAiImageModel")),
      bodyImageCount: Number(String(formData.get("bodyImageCount") ?? "0")),
    });

    revalidatePath("/");
    revalidatePath(`/articles/${article.id}`);
    targetPath = buildRedirect(`/articles/${article.id}`, {
      message: "Article generated and saved to the review queue.",
    });
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
    await assertOperatorAccessFromHeaders();
    const opportunity = await createOpportunityFromInput({
      categoryId: Number(String(formData.get("categoryId") ?? "0")),
      primaryKeyword: String(formData.get("primaryKeyword") ?? ""),
      angle: String(formData.get("angle") ?? ""),
      brief: String(formData.get("brief") ?? ""),
    });

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
    await assertOperatorAccessFromHeaders();
    const categoryId = Number(String(formData.get("categoryId") ?? "0"));
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
    await assertOperatorAccessFromHeaders();
    const category = await createWordPressCategoryAndSync({
      name: String(formData.get("categoryName") ?? ""),
      slug: String(formData.get("categorySlug") ?? ""),
      description: String(formData.get("categoryDescription") ?? ""),
    });
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
    await assertOperatorAccessFromHeaders();
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
    await assertOperatorAccessFromHeaders();
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
    await assertOperatorAccessFromHeaders();
    const article = await createArticleFromOpportunity(opportunityId, {
      generateImage: formData.get("generateImage") === "on",
      textModel: resolveOpenAITextModel(formData.get("textModel")),
      imageProvider: resolveFeaturedImageProvider(formData.get("imageProvider")),
      falImageModel: resolveFalImageModel(formData.get("falImageModel")),
      openAiImageModel: resolveOpenAIImageModel(formData.get("openAiImageModel")),
      bodyImageCount: Number(String(formData.get("bodyImageCount") ?? "0")),
    });
    revalidatePath("/opportunities");
    revalidatePath(`/opportunities/${opportunityId}`);
    revalidatePath(`/articles/${article.id}`);
    revalidatePath("/");
    targetPath = buildRedirect(`/articles/${article.id}`, {
      message: "Draft generated from the approved opportunity.",
    });
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
    await assertOperatorAccessFromHeaders();
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

export async function generateArticleComparisonAction(articleId: string, formData?: FormData) {
  let targetPath = `/articles/${articleId}/compare`;

  try {
    await assertOperatorAccessFromHeaders();
    const comparison = await generateArticleModelComparison(
      articleId,
      formData?.get("comparisonModel"),
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
    await assertOperatorAccessFromHeaders();
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

export async function regenerateArticleBodyImagesAction(articleId: string, formData: FormData) {
  let targetPath = `/articles/${articleId}`;

  try {
    await assertOperatorAccessFromHeaders();
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
    await assertOperatorAccessFromHeaders();
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
    await assertOperatorAccessFromHeaders();
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

export async function scheduleArticleAction(articleId: string, formData: FormData) {
  let targetPath = `/articles/${articleId}`;

  try {
    await assertOperatorAccessFromHeaders();
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
    await assertOperatorAccessFromHeaders();
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
