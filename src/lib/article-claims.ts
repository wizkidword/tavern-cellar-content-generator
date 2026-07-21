import { prisma } from "@/lib/db";

type ArticleClaimInput = {
  claim: string;
  sourceUrl: string;
  note: string;
};

type ArticleClaimUpdateInput = ArticleClaimInput & {
  status: "OPEN" | "VERIFIED" | "DISMISSED";
};

function cleanOptionalText(value: string) {
  const trimmed = value.trim();
  return trimmed || null;
}

export async function createArticleClaim(articleId: string, input: ArticleClaimInput) {
  return prisma.articleClaim.create({
    data: {
      articleId,
      claim: input.claim.trim(),
      sourceUrl: cleanOptionalText(input.sourceUrl),
      note: cleanOptionalText(input.note),
    },
  });
}

export async function updateArticleClaim(
  articleId: string,
  claimId: string,
  input: ArticleClaimUpdateInput,
) {
  const updated = await prisma.articleClaim.updateMany({
    where: {
      id: claimId,
      articleId,
    },
    data: {
      claim: input.claim.trim(),
      status: input.status,
      sourceUrl: cleanOptionalText(input.sourceUrl),
      note: cleanOptionalText(input.note),
    },
  });

  if (updated.count !== 1) {
    throw new Error("Claim not found for this article.");
  }
}
