-- Append-only, non-sensitive telemetry for model-backed generation operations.
CREATE TABLE "GenerationRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "operation" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'RUNNING',
    "articleId" TEXT,
    "opportunityId" TEXT,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    "latencyMs" INTEGER,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "totalTokens" INTEGER,
    "estimatedCostCents" INTEGER,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "errorCode" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GenerationRun_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "GenerationRun_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "ContentOpportunity" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "GenerationRun_operation_startedAt_idx" ON "GenerationRun"("operation", "startedAt");
CREATE INDEX "GenerationRun_state_startedAt_idx" ON "GenerationRun"("state", "startedAt");
CREATE INDEX "GenerationRun_articleId_idx" ON "GenerationRun"("articleId");
CREATE INDEX "GenerationRun_opportunityId_idx" ON "GenerationRun"("opportunityId");

-- Model comparisons are editorial evidence, so retain every generated run
-- rather than overwriting the previous result for a model.
DROP INDEX "ArticleModelComparison_sourceArticleId_openAiTextModel_key";
CREATE INDEX "ArticleModelComparison_sourceArticleId_openAiTextModel_idx" ON "ArticleModelComparison"("sourceArticleId", "openAiTextModel");
