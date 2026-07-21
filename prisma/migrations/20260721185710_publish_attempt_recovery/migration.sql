-- CreateTable
CREATE TABLE "PublishAttempt" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "articleId" TEXT NOT NULL,
    "operationKey" TEXT NOT NULL,
    "desiredWpStatus" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'STARTED',
    "wpPostId" INTEGER,
    "lastCheckpoint" TEXT,
    "errorCode" TEXT,
    "errorDetailInternal" TEXT,
    "warningCode" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PublishAttempt_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

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
INSERT INTO "new_Article" ("angle", "canonicalTopicKey", "categoryId", "contentMarkdown", "createdAt", "excerpt", "featuredImageAlt", "featuredImageMimeType", "featuredImagePath", "featuredImagePrompt", "id", "internalLinks", "metaDescription", "metaTitle", "normalizedAngle", "normalizedKeyword", "normalizedTitle", "notes", "openAiImageModel", "openAiTextModel", "primaryKeyword", "publishedAt", "qualityFocusKeyphraseInMetaDescription", "qualityFocusKeyphraseInOpening", "qualityFocusKeyphraseInTitle", "qualityHeadingCount", "qualityInternalLinkCount", "qualityMetaDescriptionLength", "qualityMetaTitleLength", "qualityWarnings", "qualityWordCount", "scheduledFor", "scheduledForLocal", "slug", "status", "tags", "title", "updatedAt", "wpMediaId", "wpPostId", "wpStatus") SELECT "angle", "canonicalTopicKey", "categoryId", "contentMarkdown", "createdAt", "excerpt", "featuredImageAlt", "featuredImageMimeType", "featuredImagePath", "featuredImagePrompt", "id", "internalLinks", "metaDescription", "metaTitle", "normalizedAngle", "normalizedKeyword", "normalizedTitle", "notes", "openAiImageModel", "openAiTextModel", "primaryKeyword", "publishedAt", "qualityFocusKeyphraseInMetaDescription", "qualityFocusKeyphraseInOpening", "qualityFocusKeyphraseInTitle", "qualityHeadingCount", "qualityInternalLinkCount", "qualityMetaDescriptionLength", "qualityMetaTitleLength", "qualityWarnings", "qualityWordCount", "scheduledFor", "scheduledForLocal", "slug", "status", "tags", "title", "updatedAt", "wpMediaId", "wpPostId", "wpStatus" FROM "Article";
DROP TABLE "Article";
ALTER TABLE "new_Article" RENAME TO "Article";
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
CREATE UNIQUE INDEX "PublishAttempt_operationKey_key" ON "PublishAttempt"("operationKey");

-- CreateIndex
CREATE INDEX "PublishAttempt_articleId_updatedAt_idx" ON "PublishAttempt"("articleId", "updatedAt");

-- CreateIndex
CREATE INDEX "PublishAttempt_state_idx" ON "PublishAttempt"("state");
