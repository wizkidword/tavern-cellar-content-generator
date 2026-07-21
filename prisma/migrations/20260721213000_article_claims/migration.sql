-- Optional, operator-verified editorial claims for an article.
CREATE TABLE "ArticleClaim" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "articleId" TEXT NOT NULL,
    "claim" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "sourceUrl" TEXT,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ArticleClaim_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "ArticleClaim_articleId_status_idx" ON "ArticleClaim"("articleId", "status");
CREATE INDEX "ArticleClaim_status_updatedAt_idx" ON "ArticleClaim"("status", "updatedAt");
