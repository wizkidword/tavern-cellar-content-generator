# Content Intelligence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local Tavern Cellar content intelligence layer that recommends stronger article opportunities from real Tavern coverage, visible duplicate risk, internal-link potential, and Tavern brand fit before spending API time on full drafts.

**Architecture:** Keep the existing Next.js 16 App Router, Server Actions, Prisma/SQLite ledger, OpenAI generation helpers, and WordPress REST sync. Add a focused intelligence domain under `src/lib/intelligence/`, new SQLite-friendly Prisma models, and new top-level strategy routes that feed the existing article generation and WordPress review flow.

**Tech Stack:** Next.js 16.2.4, React 19, TypeScript, Prisma 6.19.3, SQLite, OpenAI, WordPress REST API, Zod, Node 20, `tsx` for lightweight TypeScript test execution.

---

## Implementation Rules

- Keep this a private operator workstation. Do not add public SaaS, multi-user workflow, or automatic publishing.
- Use synced WordPress history as the source of truth for existing posts and internal links.
- Make every score explainable in the UI with short evidence lines.
- Treat AI as an assistant for idea shaping, not as the authority on links, duplicates, or WordPress state.
- Preserve the current quick draft generator while making the strategy workflow the preferred path.
- Read the relevant `node_modules/next/dist/docs/` guide before changing App Router forms, Server Actions, route handlers, or caching behavior.

---

## Target File Layout

```text
src/lib/intelligence/
  coverage.ts
  duplicates.ts
  internal-links.ts
  opportunity-scoring.ts
  opportunities.ts
  clusters.ts
  text.ts

src/app/intelligence/
  page.tsx

src/app/opportunities/
  page.tsx
  [id]/page.tsx

tests/
  intelligence/
    coverage.test.ts
    duplicates.test.ts
    internal-links.test.ts
    opportunity-scoring.test.ts
    clusters.test.ts
```

---

## Data Model

Add local models that connect strategic planning to the existing `Article`, `Category`, and `SitePost` tables without changing the current WordPress publishing contract.

```prisma
enum ContentOpportunityStatus {
  IDEA
  APPROVED
  GENERATED
  REJECTED
  ARCHIVED
}

enum TopicClusterItemType {
  SITE_POST
  ARTICLE
  OPPORTUNITY
}

model ContentOpportunity {
  id                    String                   @id @default(cuid())
  categoryId            Int
  primaryKeyword        String
  normalizedKeyword     String
  angle                 String
  normalizedAngle       String
  brief                 String
  status                ContentOpportunityStatus @default(IDEA)
  tavernFitScore        Int
  coverageScore         Int
  seoScore              Int
  duplicateRiskScore    Int
  internalLinkScore     Int
  publishabilityScore   Int
  categoryBalanceScore  Int
  overallScore          Int
  scoreReasons          String
  duplicateRiskLabel    String
  generatedArticleId    String?
  topicClusterId        String?
  createdAt             DateTime                 @default(now())
  updatedAt             DateTime                 @updatedAt

  category              Category                 @relation(fields: [categoryId], references: [id], onDelete: Restrict)
  generatedArticle      Article?                 @relation(fields: [generatedArticleId], references: [id], onDelete: SetNull)
  topicCluster          TopicCluster?            @relation(fields: [topicClusterId], references: [id], onDelete: SetNull)
  internalLinks         OpportunityInternalLink[]
  similarPosts          OpportunitySimilarPost[]

  @@index([categoryId])
  @@index([status])
  @@index([overallScore])
  @@unique([categoryId, normalizedKeyword, normalizedAngle])
}

model OpportunityInternalLink {
  id            String             @id @default(cuid())
  opportunityId String
  sitePostId    String
  reason        String
  confidence    Int
  createdAt     DateTime           @default(now())

  opportunity   ContentOpportunity @relation(fields: [opportunityId], references: [id], onDelete: Cascade)
  sitePost      SitePost           @relation(fields: [sitePostId], references: [id], onDelete: Cascade)

  @@unique([opportunityId, sitePostId])
  @@index([sitePostId])
}

model OpportunitySimilarPost {
  id            String             @id @default(cuid())
  opportunityId String
  sitePostId    String?
  articleId     String?
  source        String
  title         String
  status        String
  similarity    Int
  reason        String
  createdAt     DateTime           @default(now())

  opportunity   ContentOpportunity @relation(fields: [opportunityId], references: [id], onDelete: Cascade)
  sitePost      SitePost?          @relation(fields: [sitePostId], references: [id], onDelete: SetNull)
  article       Article?           @relation(fields: [articleId], references: [id], onDelete: SetNull)

  @@index([opportunityId])
  @@index([similarity])
}

model TopicCluster {
  id             String                  @id @default(cuid())
  name           String
  normalizedName String                  @unique
  description    String
  categoryId     Int?
  createdAt      DateTime                @default(now())
  updatedAt      DateTime                @updatedAt

  category       Category?               @relation(fields: [categoryId], references: [id], onDelete: SetNull)
  opportunities  ContentOpportunity[]
  items          TopicClusterItem[]

  @@index([categoryId])
}

model TopicClusterItem {
  id             String               @id @default(cuid())
  topicClusterId String
  itemType       TopicClusterItemType
  sitePostId     String?
  articleId      String?
  opportunityId  String?
  label          String
  sortOrder      Int                  @default(0)
  createdAt      DateTime             @default(now())

  topicCluster   TopicCluster         @relation(fields: [topicClusterId], references: [id], onDelete: Cascade)
  sitePost       SitePost?            @relation(fields: [sitePostId], references: [id], onDelete: Cascade)
  article        Article?             @relation(fields: [articleId], references: [id], onDelete: Cascade)
  opportunity    ContentOpportunity?  @relation(fields: [opportunityId], references: [id], onDelete: Cascade)

  @@index([topicClusterId])
  @@index([itemType])
}
```

Also add lightweight relations to existing models:

```prisma
model Category {
  contentOpportunities ContentOpportunity[]
  topicClusters        TopicCluster[]
}

model SitePost {
  opportunityInternalLinks OpportunityInternalLink[]
  opportunitySimilarPosts  OpportunitySimilarPost[]
  topicClusterItems        TopicClusterItem[]
}

model Article {
  contentOpportunities     ContentOpportunity[]
  opportunitySimilarPosts  OpportunitySimilarPost[]
  topicClusterItems        TopicClusterItem[]
}
```

---

## Task 1: Add Deterministic Intelligence Tests

**Files:**
- Modify: `package.json`
- Create: `tests/intelligence/internal-links.test.ts`
- Create: `tests/intelligence/opportunity-scoring.test.ts`
- Create: `tests/intelligence/duplicates.test.ts`
- Create: `tests/intelligence/coverage.test.ts`

- [x] Add a `test` script using the existing `tsx` dependency and Node's built-in test runner:

```json
"test": "node scripts/run-tests.mjs"
```

- [x] Add failing tests for tokenization, internal-link matching, score weighting, duplicate labels, and category coverage buckets.
- [x] Keep tests pure and database-free for the first slice so scoring rules can move quickly.
- [x] Run `npm run test` and confirm the initial failures describe the missing intelligence helpers.

---

## Task 2: Build Shared Intelligence Text Helpers

**Files:**
- Create: `src/lib/intelligence/text.ts`
- Modify: `tests/intelligence/internal-links.test.ts`
- Modify: `tests/intelligence/opportunity-scoring.test.ts`
- Modify: `tests/intelligence/duplicates.test.ts`

- [x] Implement `normalizeSearchText(value: string): string`.
- [x] Implement `tokenizeForSearch(value: string): string[]`.
- [x] Implement `scoreTokenOverlap(sourceTokens: string[], targetTokens: string[]): number`.
- [x] Remove short stop words while preserving Tavern-relevant terms such as `ads`, `horror`, `retro`, `dead`, `game`, `movie`, `cereal`, `slasher`, and `walking`.
- [x] Verify tests cover punctuation, apostrophes, decade phrases, duplicate words, and empty strings.

Expected helper shape:

```ts
export function tokenizeForSearch(value: string): string[] {
  return Array.from(new Set(
    normalizeSearchText(value)
      .split(" ")
      .filter((token) => token.length > 1 && !SEARCH_STOP_WORDS.has(token)),
  ));
}
```

---

## Task 3: Build Real Internal Link Matching

**Files:**
- Create: `src/lib/intelligence/internal-links.ts`
- Modify: `tests/intelligence/internal-links.test.ts`

- [x] Define `InternalLinkCandidate` from the synced `SitePost` fields: `id`, `title`, `slug`, `link`, `excerpt`, `wpStatus`, `categoryName`, `categoryIds`, `publishedAt`.
- [x] Define `InternalLinkRecommendation` with `sitePostId`, `title`, `url`, `reason`, `confidence`, `categoryName`, and `wpStatus`.
- [x] Match opportunity keyword, angle, and brief tokens against title and excerpt tokens.
- [x] Boost matches in the same category and reduce confidence for draft/future posts.
- [x] Return only real synced posts with a `link` or usable slug.
- [x] Cap results to a default of 5, sorted by confidence.

Expected public API:

```ts
export function recommendInternalLinks(input: {
  keyword: string;
  angle: string;
  brief: string;
  categoryId: number;
  candidates: InternalLinkCandidate[];
  limit?: number;
}): InternalLinkRecommendation[] {
  // Pure helper. No database reads.
}
```

---

## Task 4: Extract Duplicate And Saturation Radar

**Files:**
- Create: `src/lib/intelligence/duplicates.ts`
- Modify: `src/lib/content-pipeline.ts`
- Modify: `tests/intelligence/duplicates.test.ts`

- [x] Move duplicate comparison rules out of the private content-pipeline helper into a reusable pure function.
- [x] Preserve the existing article-generation duplicate guard behavior.
- [x] Return visible evidence for opportunities: title, source, status, similarity, and reason.
- [x] Label risk as `fresh`, `adjacent`, `crowded`, or `too_similar`.
- [x] Treat local articles, WordPress published posts, WordPress drafts, and WordPress future posts as separate evidence sources.
- [x] Test exact title collisions, canonical topic collisions, high token overlap, same-keyword/different-angle, and genuinely fresh topics.

Expected public API:

```ts
export function assessDuplicateRisk(input: {
  keyword: string;
  angle: string;
  title?: string;
  categoryId: number;
  localArticles: DuplicateCandidate[];
  sitePosts: DuplicateCandidate[];
}): DuplicateRiskAssessment {
  // Pure helper. No database writes.
}
```

---

## Task 5: Build Coverage Map Heuristics

**Files:**
- Create: `src/lib/intelligence/coverage.ts`
- Modify: `tests/intelligence/coverage.test.ts`

- [x] Define coverage input from `Category`, `Article`, and `SitePost` fields without requiring Prisma types in the pure helper.
- [x] Count published, draft, scheduled, generated, and stale synced posts per lane.
- [x] Calculate a category balance label: `quiet`, `developing`, `healthy`, or `overloaded`.
- [x] Mark stale sync data when the latest `lastSyncedAt` is older than 24 hours.
- [x] Generate short evidence lines such as "No scheduled posts in this lane" or "Live coverage is high but draft pipeline is empty."
- [x] Keep thresholds centralized and easy to tune.

Expected public API:

```ts
export function buildCoverageMap(input: CoverageInput): CoverageLane[] {
  // Pure helper. No database reads.
}
```

---

## Task 6: Build Explainable Opportunity Scoring

**Files:**
- Create: `src/lib/intelligence/opportunity-scoring.ts`
- Modify: `tests/intelligence/opportunity-scoring.test.ts`

- [x] Score Tavern brand fit from category match, Tavern vocabulary, angle specificity, and non-generic phrasing.
- [x] Score coverage value from category balance and stale/quiet lane signals.
- [x] Score SEO usefulness from keyword clarity, search-friendly phrasing, and title/angle focus.
- [x] Score duplicate risk from `DuplicateRiskAssessment`.
- [x] Score internal-link potential from recommendation count and confidence.
- [x] Score publishability from brief completeness and absence of weak-topic flags.
- [x] Score category balance from the current coverage lane label.
- [x] Return `overallScore` as a weighted score from 0-100 plus short reasons.

Expected public API:

```ts
export function scoreOpportunity(input: OpportunityScoreInput): OpportunityScoreBreakdown {
  return {
    overallScore,
    tavernFitScore,
    coverageScore,
    seoScore,
    duplicateRiskScore,
    internalLinkScore,
    publishabilityScore,
    categoryBalanceScore,
    reasons,
  };
}
```

---

## Task 7: Add Prisma Intelligence Models

**Files:**
- Modify: `prisma/schema.prisma`
- Modify: `package-lock.json` only if Prisma generation changes it

- [x] Add `ContentOpportunityStatus` and `TopicClusterItemType` enums.
- [x] Add the five intelligence models from the Data Model section.
- [x] Add relation arrays to `Category`, `SitePost`, and `Article`.
- [x] Run `npm run db:push`.
- [x] Run `npm run db:generate`.
- [x] Inspect Prisma output for relation errors before moving to UI work.

---

## Task 8: Build Opportunity Persistence Service

**Files:**
- Create: `src/lib/intelligence/opportunities.ts`
- Modify: `src/app/actions.ts`

- [x] Add `createOpportunityFromInput` that accepts category, keyword, angle, and brief.
- [x] Load category coverage, similar posts, and internal-link candidates from Prisma.
- [x] Use the pure helpers to calculate duplicate risk, internal links, and scores.
- [x] Persist `ContentOpportunity`, `OpportunityInternalLink`, and `OpportunitySimilarPost` in one Prisma transaction.
- [x] Reject duplicate opportunity rows by reusing the `@@unique([categoryId, normalizedKeyword, normalizedAngle])` constraint and returning the existing opportunity.
- [x] Add an operator-gated Server Action for creating a manual opportunity.

---

## Task 9: Add Intelligence Navigation

**Files:**
- Modify: `src/app/page.tsx`
- Modify: `src/app/layout.tsx` if shared navigation belongs there
- Modify: `src/app/globals.css`

- [x] Add top-level navigation links: Dashboard, Intelligence, Opportunities, Review Queue, Calendar.
- [x] Keep the current dashboard and quick article generator visible.
- [x] Use existing visual language and hover states.
- [x] Avoid a major redesign while the intelligence workflow is still being built.

---

## Task 10: Build Coverage Map Page

**Files:**
- Create: `src/app/intelligence/page.tsx`
- Modify: `src/app/globals.css`

- [x] Load categories, articles, and site posts from Prisma.
- [x] Render coverage lanes with counts for live, draft, scheduled, generated, and stale data.
- [x] Show quiet, developing, healthy, and overloaded labels.
- [x] Show link-index health: total synced posts, posts with links, latest sync time, and stale warning.
- [x] Add a sync-history action entry point by reusing the existing WordPress sync Server Action.
- [x] Include a clear empty state when WordPress has not been synced.

---

## Task 11: Build Opportunity List Page

**Files:**
- Create: `src/app/opportunities/page.tsx`
- Modify: `src/app/actions.ts`
- Modify: `src/app/globals.css`

- [x] Show persisted opportunities ordered by status and score.
- [x] Add filters for category, status, and duplicate-risk label.
- [x] Add a manual opportunity form for category, keyword, angle, and brief.
- [x] After submit, redirect to the opportunity detail page.
- [x] Show score chips for Tavern fit, coverage, SEO, duplicate risk, and links.
- [x] Keep rejection/archive actions visible but secondary.

---

## Task 12: Build Opportunity Detail Page

**Files:**
- Create: `src/app/opportunities/[id]/page.tsx`
- Modify: `src/app/actions.ts`
- Modify: `src/app/globals.css`

- [x] Show keyword, category, angle, brief, status, and score breakdown.
- [x] Show duplicate radar evidence with source and status.
- [x] Show real internal-link recommendations with post title, URL, reason, and confidence.
- [x] Add actions for approve, reject, archive, and generate draft.
- [x] Disable generate draft unless the opportunity is `IDEA` or `APPROVED`.
- [x] Show a clear warning when duplicate risk is `too_similar` while still allowing the operator to revise instead of blocking completely.

---

## Task 13: Connect Approved Opportunities To Draft Generation

**Files:**
- Modify: `src/lib/content-pipeline.ts`
- Modify: `src/lib/intelligence/opportunities.ts`
- Modify: `src/app/actions.ts`
- Modify: `src/app/articles/[id]/page.tsx`
- Modify: `src/app/opportunities/[id]/page.tsx`

- [x] Add `createArticleFromOpportunity(opportunityId, options)` that calls the existing article generator with the opportunity's category, keyword, angle, and brief.
- [x] Include recommended internal links in the generation prompt as real URLs.
- [x] Update the opportunity to `GENERATED` and set `generatedArticleId` after success.
- [x] Redirect to the generated article review page.
- [x] Preserve the existing quick generator path for manual one-off drafts.
- [x] Show the source opportunity on the article review page when present.

---

## Task 14: Build Topic Cluster Foundation

**Files:**
- Create: `src/lib/intelligence/clusters.ts`
- Create: `tests/intelligence/clusters.test.ts`
- Modify: `src/app/intelligence/page.tsx`

- [x] Group posts, local articles, and opportunities by normalized topical tokens.
- [x] Seed cluster names from high-confidence topic phrases such as "1950s cereal advertising" or "Walking Dead character retrospectives."
- [x] Add `upsertTopicClustersFromCatalog` that stores clusters and their items without deleting operator-curated clusters.
- [x] Show the first cluster section on the Intelligence page with existing posts, opportunities, and missing-support hints.
- [x] Keep automatic cluster changes conservative so the operator can trust the map.

---

## Task 15: Add AI-Assisted Opportunity Generation

**Files:**
- Modify: `src/lib/openai.ts`
- Modify: `src/lib/intelligence/opportunities.ts`
- Modify: `src/app/actions.ts`
- Modify: `src/app/opportunities/page.tsx`

- [x] Add an OpenAI helper that receives coverage gaps, duplicate evidence summaries, and real internal-link candidates.
- [x] Ask for 3-5 Tavern-style opportunities per selected category.
- [x] Validate model output with Zod before persisting.
- [x] Re-score every AI idea with local deterministic helpers before showing it.
- [x] Never let the model invent internal links; model-suggested links must be matched back to synced `SitePost` rows.

---

## Task 16: Add Quality Review Signals After Draft Generation

**Files:**
- Modify: `prisma/schema.prisma`
- Modify: `src/lib/content-pipeline.ts`
- Modify: `src/app/articles/[id]/page.tsx`
- Create: `src/lib/intelligence/article-quality.ts`

- [x] Store word count, heading count, meta title length, meta description length, internal-link count, and focus-keyphrase placement.
- [x] Show a compact quality panel beside WordPress actions.
- [x] Add warnings for thin drafts, missing internal links, weak metadata, or absent focus phrase.
- [x] Keep quality checks deterministic before adding AI revise tools.

---

## Task 17: Verification Pass

**Files:**
- No new files unless fixes are needed.

- [x] Run `npm run test`.
- [x] Run `npm run lint`.
- [x] Run `npm run build`.
- [x] Run `npm run db:push` against the local SQLite database.
- [x] Start the app with `Launch-Tavern-Cellar-Foundry.bat` or `npm run dev`.
- [x] Smoke-test `/`, `/intelligence`, `/opportunities`, and one `/opportunities/[id]` route.
- [x] Create one opportunity in Retro Advertising and confirm it shows real internal-link candidates.
- [x] Generate one draft from an approved opportunity and confirm the article review page opens.
- [x] Confirm no WordPress publish or schedule action runs without explicit operator action.

---

## Execution Order

1. Ship pure helpers and tests first: Tasks 1-6.
2. Add persistence and database changes: Tasks 7-8.
3. Add strategy UI: Tasks 9-12.
4. Connect strategy to generation: Task 13.
5. Add clusters and AI opportunity generation: Tasks 14-15.
6. Add post-generation quality signals: Task 16.
7. Run the full verification pass: Task 17.

This order keeps each layer useful on its own and avoids tying the whole upgrade to one giant all-or-nothing change.
