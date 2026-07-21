-- SQLite cannot add CHECK constraints to an existing table. Rebuild the two
-- polymorphic-link tables after the pre-migration validation in Phase 3.
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_OpportunitySimilarPost" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "opportunityId" TEXT NOT NULL,
    "sitePostId" TEXT,
    "articleId" TEXT,
    "source" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "similarity" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OpportunitySimilarPost_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "ContentOpportunity" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "OpportunitySimilarPost_sitePostId_fkey" FOREIGN KEY ("sitePostId") REFERENCES "SitePost" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "OpportunitySimilarPost_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "OpportunitySimilarPost_exactly_one_source" CHECK (
      (CASE WHEN "sitePostId" IS NOT NULL THEN 1 ELSE 0 END) +
      (CASE WHEN "articleId" IS NOT NULL THEN 1 ELSE 0 END) = 1
    )
);

INSERT INTO "new_OpportunitySimilarPost" (
  "id", "opportunityId", "sitePostId", "articleId", "source", "title", "status", "similarity", "reason", "createdAt"
)
SELECT
  "id", "opportunityId", "sitePostId", "articleId", "source", "title", "status", "similarity", "reason", "createdAt"
FROM "OpportunitySimilarPost";

DROP TABLE "OpportunitySimilarPost";
ALTER TABLE "new_OpportunitySimilarPost" RENAME TO "OpportunitySimilarPost";

CREATE INDEX "OpportunitySimilarPost_opportunityId_idx" ON "OpportunitySimilarPost"("opportunityId");
CREATE INDEX "OpportunitySimilarPost_sitePostId_idx" ON "OpportunitySimilarPost"("sitePostId");
CREATE INDEX "OpportunitySimilarPost_articleId_idx" ON "OpportunitySimilarPost"("articleId");
CREATE INDEX "OpportunitySimilarPost_similarity_idx" ON "OpportunitySimilarPost"("similarity");
CREATE UNIQUE INDEX "OpportunitySimilarPost_opportunityId_sitePostId_key" ON "OpportunitySimilarPost"("opportunityId", "sitePostId");
CREATE UNIQUE INDEX "OpportunitySimilarPost_opportunityId_articleId_key" ON "OpportunitySimilarPost"("opportunityId", "articleId");

CREATE TABLE "new_TopicClusterItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "topicClusterId" TEXT NOT NULL,
    "itemType" TEXT NOT NULL,
    "sitePostId" TEXT,
    "articleId" TEXT,
    "opportunityId" TEXT,
    "label" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
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

INSERT INTO "new_TopicClusterItem" (
  "id", "topicClusterId", "itemType", "sitePostId", "articleId", "opportunityId", "label", "sortOrder", "createdAt"
)
SELECT
  "id", "topicClusterId", "itemType", "sitePostId", "articleId", "opportunityId", "label", "sortOrder", "createdAt"
FROM "TopicClusterItem";

DROP TABLE "TopicClusterItem";
ALTER TABLE "new_TopicClusterItem" RENAME TO "TopicClusterItem";

CREATE INDEX "TopicClusterItem_topicClusterId_idx" ON "TopicClusterItem"("topicClusterId");
CREATE INDEX "TopicClusterItem_itemType_idx" ON "TopicClusterItem"("itemType");
CREATE INDEX "TopicClusterItem_sitePostId_idx" ON "TopicClusterItem"("sitePostId");
CREATE INDEX "TopicClusterItem_articleId_idx" ON "TopicClusterItem"("articleId");
CREATE INDEX "TopicClusterItem_opportunityId_idx" ON "TopicClusterItem"("opportunityId");
CREATE UNIQUE INDEX "TopicClusterItem_topicClusterId_sitePostId_key" ON "TopicClusterItem"("topicClusterId", "sitePostId");
CREATE UNIQUE INDEX "TopicClusterItem_topicClusterId_articleId_key" ON "TopicClusterItem"("topicClusterId", "articleId");
CREATE UNIQUE INDEX "TopicClusterItem_topicClusterId_opportunityId_key" ON "TopicClusterItem"("topicClusterId", "opportunityId");

PRAGMA foreign_keys=ON;
