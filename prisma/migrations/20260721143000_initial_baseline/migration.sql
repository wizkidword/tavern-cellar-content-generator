-- CreateTable
CREATE TABLE "Category" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "wpCategoryId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "postCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "SitePost" (
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SitePost_primaryCategoryId_fkey" FOREIGN KEY ("primaryCategoryId") REFERENCES "Category" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Article" (
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

-- CreateTable
CREATE TABLE "ArticleBodyImage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "articleId" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "altText" TEXT NOT NULL,
    "sectionHeading" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "publicPath" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL DEFAULT 'image/png',
    "imageModel" TEXT NOT NULL,
    "wpMediaId" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ArticleBodyImage_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ArticleModelComparison" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sourceArticleId" TEXT NOT NULL,
    "openAiTextModel" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "angle" TEXT NOT NULL,
    "primaryKeyword" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "contentMarkdown" TEXT NOT NULL,
    "metaTitle" TEXT NOT NULL,
    "metaDescription" TEXT NOT NULL,
    "excerpt" TEXT NOT NULL,
    "tags" TEXT NOT NULL,
    "internalLinks" TEXT NOT NULL,
    "featuredImagePrompt" TEXT NOT NULL,
    "featuredImageAlt" TEXT NOT NULL,
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
    CONSTRAINT "ArticleModelComparison_sourceArticleId_fkey" FOREIGN KEY ("sourceArticleId") REFERENCES "Article" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ContentOpportunity" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "categoryId" INTEGER NOT NULL,
    "primaryKeyword" TEXT NOT NULL,
    "normalizedKeyword" TEXT NOT NULL,
    "angle" TEXT NOT NULL,
    "normalizedAngle" TEXT NOT NULL,
    "brief" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'IDEA',
    "tavernFitScore" INTEGER NOT NULL,
    "coverageScore" INTEGER NOT NULL,
    "seoScore" INTEGER NOT NULL,
    "duplicateRiskScore" INTEGER NOT NULL,
    "internalLinkScore" INTEGER NOT NULL,
    "publishabilityScore" INTEGER NOT NULL,
    "categoryBalanceScore" INTEGER NOT NULL,
    "overallScore" INTEGER NOT NULL,
    "scoreReasons" TEXT NOT NULL,
    "duplicateRiskLabel" TEXT NOT NULL,
    "generatedArticleId" TEXT,
    "topicClusterId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ContentOpportunity_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ContentOpportunity_generatedArticleId_fkey" FOREIGN KEY ("generatedArticleId") REFERENCES "Article" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ContentOpportunity_topicClusterId_fkey" FOREIGN KEY ("topicClusterId") REFERENCES "TopicCluster" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OpportunityInternalLink" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "opportunityId" TEXT NOT NULL,
    "sitePostId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "confidence" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OpportunityInternalLink_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "ContentOpportunity" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "OpportunityInternalLink_sitePostId_fkey" FOREIGN KEY ("sitePostId") REFERENCES "SitePost" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OpportunitySimilarPost" (
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
    CONSTRAINT "OpportunitySimilarPost_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TopicCluster" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "categoryId" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TopicCluster_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TopicClusterItem" (
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
    CONSTRAINT "TopicClusterItem_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "ContentOpportunity" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Category_wpCategoryId_key" ON "Category"("wpCategoryId");

-- CreateIndex
CREATE UNIQUE INDEX "Category_slug_key" ON "Category"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "SitePost_wpPostId_key" ON "SitePost"("wpPostId");

-- CreateIndex
CREATE UNIQUE INDEX "SitePost_slug_key" ON "SitePost"("slug");

-- CreateIndex
CREATE INDEX "SitePost_primaryCategoryId_idx" ON "SitePost"("primaryCategoryId");

-- CreateIndex
CREATE INDEX "SitePost_canonicalTopicKey_idx" ON "SitePost"("canonicalTopicKey");

-- CreateIndex
CREATE INDEX "SitePost_normalizedTitle_idx" ON "SitePost"("normalizedTitle");

-- CreateIndex
CREATE UNIQUE INDEX "Article_wpPostId_key" ON "Article"("wpPostId");

-- CreateIndex
CREATE INDEX "Article_status_idx" ON "Article"("status");

-- CreateIndex
CREATE INDEX "Article_normalizedTitle_idx" ON "Article"("normalizedTitle");

-- CreateIndex
CREATE INDEX "Article_normalizedKeyword_idx" ON "Article"("normalizedKeyword");

-- CreateIndex
CREATE UNIQUE INDEX "Article_categoryId_canonicalTopicKey_key" ON "Article"("categoryId", "canonicalTopicKey");

-- CreateIndex
CREATE UNIQUE INDEX "Article_categoryId_slug_key" ON "Article"("categoryId", "slug");

-- CreateIndex
CREATE INDEX "ArticleBodyImage_articleId_idx" ON "ArticleBodyImage"("articleId");

-- CreateIndex
CREATE UNIQUE INDEX "ArticleBodyImage_articleId_sortOrder_key" ON "ArticleBodyImage"("articleId", "sortOrder");

-- CreateIndex
CREATE INDEX "ArticleModelComparison_sourceArticleId_idx" ON "ArticleModelComparison"("sourceArticleId");

-- CreateIndex
CREATE INDEX "ArticleModelComparison_openAiTextModel_idx" ON "ArticleModelComparison"("openAiTextModel");

-- CreateIndex
CREATE UNIQUE INDEX "ArticleModelComparison_sourceArticleId_openAiTextModel_key" ON "ArticleModelComparison"("sourceArticleId", "openAiTextModel");

-- CreateIndex
CREATE INDEX "ContentOpportunity_categoryId_idx" ON "ContentOpportunity"("categoryId");

-- CreateIndex
CREATE INDEX "ContentOpportunity_status_idx" ON "ContentOpportunity"("status");

-- CreateIndex
CREATE INDEX "ContentOpportunity_overallScore_idx" ON "ContentOpportunity"("overallScore");

-- CreateIndex
CREATE UNIQUE INDEX "ContentOpportunity_categoryId_normalizedKeyword_normalizedAngle_key" ON "ContentOpportunity"("categoryId", "normalizedKeyword", "normalizedAngle");

-- CreateIndex
CREATE INDEX "OpportunityInternalLink_sitePostId_idx" ON "OpportunityInternalLink"("sitePostId");

-- CreateIndex
CREATE UNIQUE INDEX "OpportunityInternalLink_opportunityId_sitePostId_key" ON "OpportunityInternalLink"("opportunityId", "sitePostId");

-- CreateIndex
CREATE INDEX "OpportunitySimilarPost_opportunityId_idx" ON "OpportunitySimilarPost"("opportunityId");

-- CreateIndex
CREATE INDEX "OpportunitySimilarPost_sitePostId_idx" ON "OpportunitySimilarPost"("sitePostId");

-- CreateIndex
CREATE INDEX "OpportunitySimilarPost_articleId_idx" ON "OpportunitySimilarPost"("articleId");

-- CreateIndex
CREATE INDEX "OpportunitySimilarPost_similarity_idx" ON "OpportunitySimilarPost"("similarity");

-- CreateIndex
CREATE UNIQUE INDEX "TopicCluster_normalizedName_key" ON "TopicCluster"("normalizedName");

-- CreateIndex
CREATE INDEX "TopicCluster_categoryId_idx" ON "TopicCluster"("categoryId");

-- CreateIndex
CREATE INDEX "TopicClusterItem_topicClusterId_idx" ON "TopicClusterItem"("topicClusterId");

-- CreateIndex
CREATE INDEX "TopicClusterItem_itemType_idx" ON "TopicClusterItem"("itemType");

-- CreateIndex
CREATE INDEX "TopicClusterItem_sitePostId_idx" ON "TopicClusterItem"("sitePostId");

-- CreateIndex
CREATE INDEX "TopicClusterItem_articleId_idx" ON "TopicClusterItem"("articleId");

-- CreateIndex
CREATE INDEX "TopicClusterItem_opportunityId_idx" ON "TopicClusterItem"("opportunityId");

