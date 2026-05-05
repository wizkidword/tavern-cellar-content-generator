# Tavern Cellar Foundry Next-Level Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Tavern Cellar Foundry safer for same-night publishing, stronger at duplicate avoidance, and easier to operate as a private editorial workstation.

**Architecture:** Keep the current Next.js 16 App Router, Prisma/SQLite ledger, OpenAI generation layer, and WordPress REST publishing path. Improve the existing modules in place before introducing new services.

**Tech Stack:** Next.js 16.2.4, React 19, TypeScript, Prisma 6, SQLite, OpenAI Responses API, WordPress REST API, Yoast companion plugin.

---

### Task 1: Fix Server Action Redirect Handling

**Files:**
- Modify: `src/app/actions.ts`

- [ ] Move success `redirect(...)` calls outside `try/catch`, or rethrow Next redirect errors before converting exceptions into `error=` query strings.
- [ ] Verify generating, saving, pushing draft, publishing, and scheduling no longer produce `?error=NEXT_REDIRECT`.
- [ ] Run `npm run lint` and `npm run build`.

### Task 2: Harden Publishing Authorization

**Files:**
- Modify: `src/app/actions.ts`
- Modify: `src/app/api/assist/keywords/route.ts`
- Modify: `src/app/api/assist/angles/route.ts`
- Create: `src/lib/operator-auth.ts`

- [ ] Add a private operator token or local-only guard for every Server Action and AI helper route.
- [ ] Return `401` for unauthorized route handler calls and a clear error for unauthorized form actions.
- [ ] Keep WordPress and OpenAI secrets server-only.

### Task 3: Make Scheduling Timezone-Safe

**Files:**
- Modify: `src/app/articles/[id]/page.tsx`
- Modify: `src/lib/content-pipeline.ts`
- Modify: `src/lib/wordpress.ts`

- [ ] Validate that scheduled dates are real dates and are in the future.
- [ ] Capture the intended WordPress-local schedule time explicitly.
- [ ] Send WordPress a schedule payload that cannot shift because of host timezone differences.
- [ ] Add UI copy showing the resolved schedule time before the post is sent.

### Task 4: Improve Catalog Sync and Duplicate Protection

**Files:**
- Modify: `src/lib/wordpress.ts`
- Modify: `src/lib/content-pipeline.ts`
- Modify: `prisma/schema.prisma`

- [ ] Sync draft and scheduled WordPress posts when credentials are available.
- [ ] Treat all post category IDs as coverage, not only `post.categories[0]`.
- [ ] Record remote status and last sync time for each `SitePost`.
- [ ] Add stale-post cleanup or mark deleted/hidden posts instead of leaving old coverage forever.

### Task 5: Add Tests Around the Publishing Pipeline

**Files:**
- Modify: `package.json`
- Create: `tests/topic-utils.test.ts`
- Create: `tests/content-pipeline.test.ts`
- Create: `tests/wordpress.test.ts`

- [ ] Add a test runner.
- [ ] Unit test duplicate matching, slug generation, tag splitting, date parsing, and redirect-safe action helpers.
- [ ] Mock WordPress fetch calls for draft, publish, schedule, media upload, and tag creation.
- [ ] Run tests in the normal verification path with lint and build.

### Task 6: Add Editorial QA for Generated Articles

**Files:**
- Modify: `src/lib/openai.ts`
- Modify: `src/app/articles/[id]/page.tsx`
- Modify: `prisma/schema.prisma`

- [ ] Store generation quality signals: word count, H2 count, focus keyphrase locations, title length, meta length, and internal-link count.
- [ ] Show a review checklist beside the editor before WordPress actions.
- [ ] Add an optional "revise draft" action that fixes weak metadata, thin sections, or missing focus keyphrase placement.

### Task 7: Manage Generated Media Like Assets

**Files:**
- Modify: `.gitignore`
- Modify: `src/lib/openai.ts`
- Modify: `src/lib/content-pipeline.ts`

- [ ] Ignore `public/generated/` unless a specific asset needs to be committed.
- [ ] Delete or archive replaced image files when regenerating.
- [ ] Add a media status surface: local image path, WordPress media ID, upload date, and metadata-sync result.

### Task 8: Upgrade Dependencies Safely

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] Upgrade Prisma within v6 first to clear the current `effect` audit finding.
- [ ] Upgrade OpenAI, Zod, Marked, Lucide, React patch versions, and rerun generation/publishing smoke checks.
- [ ] Track the Next/PostCSS advisory separately; do not use `npm audit fix --force` if it proposes a downgrade.

### Task 9: Add a Tonight Batch Workflow

**Files:**
- Modify: `src/app/page.tsx`
- Create: `src/app/batches/page.tsx`
- Create: `src/lib/batch-planner.ts`

- [ ] Add a batch queue for 3-7 planned articles with category, keyword, angle, target publish time, and image toggle.
- [ ] Generate drafts first, then require explicit review before scheduling.
- [ ] Add a "schedule all reviewed" action that skips anything missing title, body, metadata, or future schedule time.
