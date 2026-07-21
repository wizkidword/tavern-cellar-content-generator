-- AlterTable
ALTER TABLE "ArticleBodyImage" ADD COLUMN "assetKey" TEXT;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Article" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "normalizedTitle" TEXT NOT NULL,
    "angle" TEXT NOT NULL,
    "normalizedAngle" TEXT NOT NULL,
    "primaryKeyword" TEXT NOT NULL,
    "normalizedKeyword" TEXT NOT NULL,
    "canonicalTopicKey" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "notes" TEXT,
    "contentMarkdown" TEXT NOT NULL,
    "metaTitle" TEXT NOT NULL,
    "metaDescription" TEXT NOT NULL,
    "excerpt" TEXT NOT NULL,
    "tags" TEXT NOT NULL,
    "internalLinks" TEXT NOT NULL,
    "featuredImagePrompt" TEXT NOT NULL,
    "featuredImageAlt" TEXT NOT NULL,
    "featuredImagePath" TEXT,
    "featuredImageMimeType" TEXT,
    "featuredImageState" TEXT NOT NULL DEFAULT 'IDLE',
    "featuredImageErrorCode" TEXT,
    "featuredImageLastAttemptAt" DATETIME,
    "bodyImagesState" TEXT NOT NULL DEFAULT 'IDLE',
    "bodyImagesErrorCode" TEXT,
    "bodyImagesLastAttemptAt" DATETIME,
    "bodyImagesOperationKey" TEXT,
    "wpMediaId" INTEGER,
    "openAiTextModel" TEXT NOT NULL,
    "openAiImageModel" TEXT,
    "categoryId" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'GENERATED',
    "publishState" TEXT NOT NULL DEFAULT 'IDLE',
    "activePublishOperationKey" TEXT,
    "wpPostId" INTEGER,
    "wpStatus" TEXT,
    "scheduledFor" DATETIME,
    "scheduledForLocal" TEXT,
    "scheduledForTimezone" TEXT,
    "publishedAt" DATETIME,
    "qualityWordCount" INTEGER NOT NULL DEFAULT 0,
    "qualityHeadingCount" INTEGER NOT NULL DEFAULT 0,
    "qualityMetaTitleLength" INTEGER NOT NULL DEFAULT 0,
    "qualityMetaDescriptionLength" INTEGER NOT NULL DEFAULT 0,
    "qualityInternalLinkCount" INTEGER NOT NULL DEFAULT 0,
    "qualityFocusKeyphraseInTitle" BOOLEAN NOT NULL DEFAULT false,
    "qualityFocusKeyphraseInOpening" BOOLEAN NOT NULL DEFAULT false,
    "qualityFocusKeyphraseInMetaDescription" BOOLEAN NOT NULL DEFAULT false,
    "qualityWarnings" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Article_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Article" ("activePublishOperationKey", "angle", "canonicalTopicKey", "categoryId", "contentMarkdown", "createdAt", "excerpt", "featuredImageAlt", "featuredImageMimeType", "featuredImagePath", "featuredImagePrompt", "id", "internalLinks", "metaDescription", "metaTitle", "normalizedAngle", "normalizedKeyword", "normalizedTitle", "notes", "openAiImageModel", "openAiTextModel", "primaryKeyword", "publishState", "publishedAt", "qualityFocusKeyphraseInMetaDescription", "qualityFocusKeyphraseInOpening", "qualityFocusKeyphraseInTitle", "qualityHeadingCount", "qualityInternalLinkCount", "qualityMetaDescriptionLength", "qualityMetaTitleLength", "qualityWarnings", "qualityWordCount", "scheduledFor", "scheduledForLocal", "scheduledForTimezone", "slug", "status", "tags", "title", "updatedAt", "wpMediaId", "wpPostId", "wpStatus") SELECT "activePublishOperationKey", "angle", "canonicalTopicKey", "categoryId", "contentMarkdown", "createdAt", "excerpt", "featuredImageAlt", "featuredImageMimeType", "featuredImagePath", "featuredImagePrompt", "id", "internalLinks", "metaDescription", "metaTitle", "normalizedAngle", "normalizedKeyword", "normalizedTitle", "notes", "openAiImageModel", "openAiTextModel", "primaryKeyword", "publishState", "publishedAt", "qualityFocusKeyphraseInMetaDescription", "qualityFocusKeyphraseInOpening", "qualityFocusKeyphraseInTitle", "qualityHeadingCount", "qualityInternalLinkCount", "qualityMetaDescriptionLength", "qualityMetaTitleLength", "qualityWarnings", "qualityWordCount", "scheduledFor", "scheduledForLocal", "scheduledForTimezone", "slug", "status", "tags", "title", "updatedAt", "wpMediaId", "wpPostId", "wpStatus" FROM "Article";
DROP TABLE "Article";
ALTER TABLE "new_Article" RENAME TO "Article";

-- Preserve editorial notes. Only extract a recognizable, standalone legacy machine warning.
UPDATE "Article"
SET "featuredImageState" = 'SUCCEEDED'
WHERE "featuredImagePath" IS NOT NULL;
UPDATE "Article"
SET "bodyImagesState" = 'SUCCEEDED'
WHERE EXISTS (SELECT 1 FROM "ArticleBodyImage" WHERE "ArticleBodyImage"."articleId" = "Article"."id");
UPDATE "Article"
SET "featuredImageState" = 'FAILED',
    "featuredImageErrorCode" = 'IMAGE_OPERATION_FAILED',
    "notes" = NULL
WHERE "notes" LIKE 'Featured image not generated:%Draft text was saved; retry image generation from the review page.'
  AND instr("notes", char(10)) = 0;
UPDATE "Article"
SET "bodyImagesState" = 'FAILED',
    "bodyImagesErrorCode" = 'IMAGE_OPERATION_FAILED',
    "notes" = NULL
WHERE "notes" LIKE 'Article body images not generated:%Draft text was saved; retry image generation from the review page.'
  AND instr("notes", char(10)) = 0;

CREATE UNIQUE INDEX "Article_activePublishOperationKey_key" ON "Article"("activePublishOperationKey");
CREATE UNIQUE INDEX "Article_wpPostId_key" ON "Article"("wpPostId");
CREATE INDEX "Article_status_idx" ON "Article"("status");
CREATE INDEX "Article_normalizedTitle_idx" ON "Article"("normalizedTitle");
CREATE INDEX "Article_normalizedKeyword_idx" ON "Article"("normalizedKeyword");
CREATE INDEX "Article_publishState_idx" ON "Article"("publishState");
CREATE UNIQUE INDEX "Article_categoryId_canonicalTopicKey_key" ON "Article"("categoryId", "canonicalTopicKey");
CREATE UNIQUE INDEX "Article_categoryId_slug_key" ON "Article"("categoryId", "slug");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "ArticleBodyImage_assetKey_key" ON "ArticleBodyImage"("assetKey");
