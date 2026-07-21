-- CreateTable
CREATE TABLE "WordPressSyncRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "mode" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'RUNNING',
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    "postCount" INTEGER NOT NULL DEFAULT 0,
    "categoryCount" INTEGER NOT NULL DEFAULT 0,
    "pageCount" INTEGER NOT NULL DEFAULT 0,
    "errorCode" TEXT,
    "errorCorrelationId" TEXT,
    "siteTimezone" TEXT,
    "siteUrl" TEXT NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Category" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "wpCategoryId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "postCount" INTEGER NOT NULL DEFAULT 0,
    "lastSeenSyncRunId" TEXT,
    "lastSeenAt" DATETIME,
    "isStale" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Category" ("createdAt", "description", "id", "isActive", "name", "postCount", "slug", "updatedAt", "wpCategoryId") SELECT "createdAt", "description", "id", "isActive", "name", "postCount", "slug", "updatedAt", "wpCategoryId" FROM "Category";
DROP TABLE "Category";
ALTER TABLE "new_Category" RENAME TO "Category";
CREATE UNIQUE INDEX "Category_wpCategoryId_key" ON "Category"("wpCategoryId");
CREATE UNIQUE INDEX "Category_slug_key" ON "Category"("slug");
CREATE TABLE "new_SitePost" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "wpPostId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "normalizedTitle" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "excerpt" TEXT,
    "canonicalTopicKey" TEXT NOT NULL,
    "wpStatus" TEXT NOT NULL DEFAULT 'publish',
    "publishedAt" DATETIME,
    "link" TEXT,
    "primaryCategoryId" INTEGER,
    "rawCategoryIds" TEXT NOT NULL,
    "lastSyncedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenSyncRunId" TEXT,
    "lastSeenAt" DATETIME,
    "isStale" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SitePost_primaryCategoryId_fkey" FOREIGN KEY ("primaryCategoryId") REFERENCES "Category" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_SitePost" ("canonicalTopicKey", "createdAt", "excerpt", "id", "lastSyncedAt", "link", "normalizedTitle", "primaryCategoryId", "publishedAt", "rawCategoryIds", "slug", "title", "updatedAt", "wpPostId", "wpStatus") SELECT "canonicalTopicKey", "createdAt", "excerpt", "id", "lastSyncedAt", "link", "normalizedTitle", "primaryCategoryId", "publishedAt", "rawCategoryIds", "slug", "title", "updatedAt", "wpPostId", "wpStatus" FROM "SitePost";
DROP TABLE "SitePost";
ALTER TABLE "new_SitePost" RENAME TO "SitePost";
CREATE UNIQUE INDEX "SitePost_wpPostId_key" ON "SitePost"("wpPostId");
CREATE UNIQUE INDEX "SitePost_slug_key" ON "SitePost"("slug");
CREATE INDEX "SitePost_primaryCategoryId_idx" ON "SitePost"("primaryCategoryId");
CREATE INDEX "SitePost_canonicalTopicKey_idx" ON "SitePost"("canonicalTopicKey");
CREATE INDEX "SitePost_normalizedTitle_idx" ON "SitePost"("normalizedTitle");
CREATE INDEX "SitePost_isStale_idx" ON "SitePost"("isStale");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "WordPressSyncRun_state_startedAt_idx" ON "WordPressSyncRun"("state", "startedAt");

-- CreateIndex
CREATE INDEX "WordPressSyncRun_mode_completedAt_idx" ON "WordPressSyncRun"("mode", "completedAt");
