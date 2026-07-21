-- Opportunity generation has an explicit, retryable ownership state.
ALTER TABLE "ContentOpportunity" ADD COLUMN "generationAttemptKey" TEXT;
ALTER TABLE "ContentOpportunity" ADD COLUMN "generationErrorCode" TEXT;
ALTER TABLE "ContentOpportunity" ADD COLUMN "generationLastAttemptAt" DATETIME;

-- Topic cluster ownership is additive, but SQLite must rebuild these tables to
-- retain their indexes while adding the new ownership fields.
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_TopicCluster" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "categoryId" INTEGER,
    "source" TEXT NOT NULL DEFAULT 'AUTO',
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TopicCluster_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_TopicCluster" ("categoryId", "createdAt", "description", "id", "name", "normalizedName", "updatedAt")
SELECT "categoryId", "createdAt", "description", "id", "name", "normalizedName", "updatedAt" FROM "TopicCluster";
DROP TABLE "TopicCluster";
ALTER TABLE "new_TopicCluster" RENAME TO "TopicCluster";

CREATE TABLE "new_TopicClusterItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "topicClusterId" TEXT NOT NULL,
    "itemType" TEXT NOT NULL,
    "sitePostId" TEXT,
    "articleId" TEXT,
    "opportunityId" TEXT,
    "label" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "source" TEXT NOT NULL DEFAULT 'AUTO',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TopicClusterItem_topicClusterId_fkey" FOREIGN KEY ("topicClusterId") REFERENCES "TopicCluster" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TopicClusterItem_sitePostId_fkey" FOREIGN KEY ("sitePostId") REFERENCES "SitePost" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TopicClusterItem_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TopicClusterItem_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "ContentOpportunity" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TopicClusterItem_valid_target" CHECK (
      (
        (CASE WHEN "sitePostId" IS NOT NULL THEN 1 ELSE 0 END) +
        (CASE WHEN "articleId" IS NOT NULL THEN 1 ELSE 0 END) +
        (CASE WHEN "opportunityId" IS NOT NULL THEN 1 ELSE 0 END)
      ) = 1
      AND (
        ("itemType" = 'SITE_POST' AND "sitePostId" IS NOT NULL) OR
        ("itemType" = 'ARTICLE' AND "articleId" IS NOT NULL) OR
        ("itemType" = 'OPPORTUNITY' AND "opportunityId" IS NOT NULL)
      )
    )
);
INSERT INTO "new_TopicClusterItem" ("articleId", "createdAt", "id", "itemType", "label", "opportunityId", "sitePostId", "sortOrder", "topicClusterId")
SELECT "articleId", "createdAt", "id", "itemType", "label", "opportunityId", "sitePostId", "sortOrder", "topicClusterId" FROM "TopicClusterItem";
DROP TABLE "TopicClusterItem";
ALTER TABLE "new_TopicClusterItem" RENAME TO "TopicClusterItem";

CREATE UNIQUE INDEX "TopicCluster_normalizedName_key" ON "TopicCluster"("normalizedName");
CREATE INDEX "TopicCluster_categoryId_idx" ON "TopicCluster"("categoryId");
CREATE INDEX "TopicCluster_source_isArchived_idx" ON "TopicCluster"("source", "isArchived");
CREATE INDEX "TopicClusterItem_topicClusterId_idx" ON "TopicClusterItem"("topicClusterId");
CREATE INDEX "TopicClusterItem_itemType_idx" ON "TopicClusterItem"("itemType");
CREATE INDEX "TopicClusterItem_sitePostId_idx" ON "TopicClusterItem"("sitePostId");
CREATE INDEX "TopicClusterItem_articleId_idx" ON "TopicClusterItem"("articleId");
CREATE INDEX "TopicClusterItem_opportunityId_idx" ON "TopicClusterItem"("opportunityId");
CREATE INDEX "TopicClusterItem_source_idx" ON "TopicClusterItem"("source");
CREATE UNIQUE INDEX "TopicClusterItem_topicClusterId_sitePostId_key" ON "TopicClusterItem"("topicClusterId", "sitePostId");
CREATE UNIQUE INDEX "TopicClusterItem_topicClusterId_articleId_key" ON "TopicClusterItem"("topicClusterId", "articleId");
CREATE UNIQUE INDEX "TopicClusterItem_topicClusterId_opportunityId_key" ON "TopicClusterItem"("topicClusterId", "opportunityId");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

CREATE UNIQUE INDEX "ContentOpportunity_generationAttemptKey_key" ON "ContentOpportunity"("generationAttemptKey");
CREATE INDEX "ContentOpportunity_generationAttemptKey_idx" ON "ContentOpportunity"("generationAttemptKey");
