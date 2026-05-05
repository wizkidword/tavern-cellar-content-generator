"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  createArticle,
  publishArticle,
  regenerateFeaturedImage,
  saveArticleReview,
} from "@/lib/content-pipeline";
import {
  createArticleFromOpportunity,
  createOpportunityFromInput,
  updateOpportunityStatus,
} from "@/lib/intelligence/opportunities";
import { upsertTopicClustersFromCurrentCatalog } from "@/lib/intelligence/clusters";
import { assertOperatorAccessFromHeaders } from "@/lib/operator-auth";
import { syncWordPressCatalog } from "@/lib/wordpress";

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
