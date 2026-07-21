# Tavern Cellar Foundry implementation status

## Phase 0 — baseline and trust boundary

Status: complete on 2026-07-21.

- **PRE-01:** Confirmed the development branch baseline was `codex/content-intelligence` at `1ae43b5`; created `codex/security-reliability-hardening` for this work. The app uses Node 20.19.0, npm 10.8.2, Next.js 16.2.4 at baseline, React 19.2.4, Prisma 6.19.3, and SQLite at the configured `DATABASE_URL` (the example uses `file:./prisma/dev.db`). There was no `proxy.ts` or `middleware.ts`.
- **PRE-02:** `npm ci`, Prisma validation/generation, 95 unit tests, `npx tsc --noEmit`, ESLint, and the production build passed before behavior changes. `npm audit --omit=dev` identified a direct high-severity Next.js advisory; the compatible patch update to Next.js and `eslint-config-next` 16.2.11 is included with PR 1. The remaining audit reports are the same transitive `next`/PostCSS moderate advisory, for which the audit suggests an unsafe major downgrade; they are recorded for dependency-policy review rather than force-fixed.
- **PRE-03:** Added [architecture-trust-boundary.md](architecture-trust-boundary.md) to map the browser, Next.js, SQLite, providers, filesystem, WordPress REST API, and plugin boundaries plus later recovery-sensitive operations.

## Phase 1 — application authentication boundary

Status: complete on 2026-07-21.

- **SEC-01:** Header-based localhost and token authorization has been removed. `Host`, `Origin`, and forwarded headers are never identity inputs.
- **SEC-02:** With the default `FOUNDRY_AUTH_REQUIRED=true`, `/login` verifies the configured operator credential with a timing-safe comparison, then creates a versioned, HMAC-signed session with a finite expiration. The cookie is `HttpOnly`, `SameSite=Strict`, path-scoped to `/`, and marked `Secure` for HTTPS origins. A trusted loopback-only workspace can opt out with `FOUNDRY_AUTH_REQUIRED=false` and opens directly to the dashboard.
- **SEC-03:** Every application page has a server-side guard before data reads. Next 16 `proxy.ts` provides the early redirect/structured API 401, while all Server Actions and API routes independently verify the session. Provider actions add session- and process-scoped throttles.
- **SEC-04:** State-changing Server Actions and API requests require the configured exact origin after session validation. Next Server Action `allowedOrigins` is configured from `APP_ORIGIN`.
- **SEC-05:** Failed login attempts are limited to five per 15 minutes; expensive provider actions have bounded per-session and global fixed windows. No proxy-derived IP header is trusted or used.
- **SEC-06:** The launcher remains bound to `127.0.0.1`; metadata and protected responses carry `noindex, nofollow`. The supported `npm run dev` and `npm run start` commands refuse a non-loopback launch without valid operator-session configuration, and a non-loopback configured `APP_ORIGIN` is also checked at server startup.
- **SEC-07:** Session secret strength and operator-token length are enforced. Non-local `WORDPRESS_URL` values must use HTTPS; HTTP is allowed only for loopback development endpoints. When a public proxy challenges Foundry, an optional validated `WORDPRESS_ORIGIN_IP` routes only WordPress requests directly while retaining the public HTTPS hostname. Documentation lists the new settings without exposing credentials.
- **Verification:** 11 focused auth/security tests cover signed and expired/tampered sessions, spoofed `Host`/`X-Forwarded-Host`/`Origin` headers, CSRF rejection, proxy behavior, rate limiting, and WordPress endpoint validation. Production-browser smoke testing also confirmed signed-out redirect, invalid login, successful login, and logout.

## Phase 2 — safe errors, input validation, HTML sanitization, and HTTP policies

Status: complete on 2026-07-21.

- **APP-01:** Added shared Zod schemas for article generation and review, publishing/scheduling through the review payload, opportunity creation and generation, WordPress category creation, model comparison, and the keyword/angle API handlers. They enforce bounded strings, valid models/providers, slug rules, category and body-image ranges, and a 120,000-character article-body limit before provider work begins.
- **APP-02:** Added typed `AppError` handling with stable public codes, retryability, and a correlation ID. Server Action redirects now carry only the code and reference ID; API errors use the same safe structure. Structured server failure events omit raw exception messages, secrets, and full content.
- **APP-03:** Markdown is now rendered and then passed through a strict HTML allowlist. Script tags, event handlers, unsafe links, inline styles, unknown attributes, and unapproved image URLs are removed. WordPress publishing receives that sanitized output; uploaded WordPress media remains allowed by exact URL.
- **APP-04:** Added a shared timeout/retry policy: WordPress reads use a 12-second timeout and two jittered retries; WordPress writes use a 20-second timeout with no blind retry and report `WP_WRITE_UNCERTAIN` after timeout. OpenAI calls use 45-second timeouts, no library retries, and bounded output tokens. Image subscriptions/downloads are time-bounded. Browser AI helpers cancel on unmount/category changes and disable duplicate clicks while active.
- **APP-05:** Image downloads are streamed with a 10 MiB limit, inspected with Sharp for an actual supported image signature and reasonable dimensions, and only saved under server-generated PNG filenames. Provider-supplied filenames are never used.
- **Schema and migration notes:** No Prisma schema or migration change was needed in this phase; existing records and WordPress identifiers are preserved.
- **Verification:** Added focused tests for sanitizer behavior, form validation, image byte/signature checks, and HTTP timeout/retry behavior. The suite now has 117 passing tests. Lint, TypeScript, Prisma validation/generation, production build, and production-only dependency audit are run for the final phase check.

## Phase 3 — safe Prisma migrations and database invariants

Status: complete on 2026-07-21.

- **DB-01:** Replaced the normal `prisma db push` workflow with checked-in migrations. The existing SQLite database was compared against the baseline before it was marked as applied; a fresh database now receives the same migration history through `npm run db:migrate`. `npm run start` performs this safe migration check before launching the production server, and the Windows launcher uses it too.
- **DB-02:** Added `npm run db:backup`, which creates a consistent SQLite snapshot with `VACUUM INTO` and never overwrites the source. Migration runs make a backup before baselining or applying pending work. Backups live in ignored `prisma/backups/`; the restore steps are documented in the README.
- **DB-03:** Added database-level checks requiring `OpportunitySimilarPost` to point to exactly one source and `TopicClusterItem` to point to exactly one target that matches its type. Added unique indexes so the same post, article, or opportunity cannot be added twice to one relevant relationship set. The migration rebuilds only these two tables, copies existing rows through the checks, and aborts if the data is invalid.
- **DB-04:** Centralized serialized string-array and WordPress category-ID parsing/writing. Corrupt JSON now fails safely, while non-JSON legacy category lists remain readable and are normalized on the next WordPress sync.
- **Schema and migration notes:** Added `20260721143000_initial_baseline` and `20260721150000_relational_invariants`. The existing local database was validated before each migration and automatically backed up three times during the transition. No generated content or WordPress identifiers were changed.
- **Verification:** The dedicated `npm run test:db` command passed for both fresh and legacy SQLite databases and demonstrated that invalid or duplicate polymorphic links are rejected at the database level. The normal test suite, lint, TypeScript, Prisma validation/generation, migration diff, production build, and dependency audit are run for the final phase check.

## Phase 4 — recoverable WordPress publishing

Status: complete on 2026-07-21.

- **PUB-01 / PUB-02:** Added `PublishAttempt` and an article-level publish state. Every publish receives a durable operation key before WordPress is contacted. A short SQLite transaction claims the article, so a second request receives `PUBLISH_STATE_CONFLICT` instead of performing another remote write.
- **PUB-03:** Updated the companion WordPress plugin to version 0.2.0. It stores a private operation key, exposes a minimal authenticated lookup endpoint, validates the key format, and checks the caller can edit the specific matched post.
- **PUB-04 / PUB-06:** New posts are created as WordPress draft placeholders first. Foundry records the post ID immediately, checkpoints media and content, then transitions to the requested final status. A retry looks up the operation key before any create. If a previously uncertain operation cannot be found, Foundry leaves it uncertain rather than blindly creating a second post.
- **PUB-05:** Optional Yoast verification is recorded as a warning on an otherwise successful publish; it no longer misreports a successful core post write as a full failure.
- **PUB-07:** The article page shows publish recovery state, the latest safe checkpoint, known WordPress post ID, safe error/reference, optional Yoast warning, and a reconcile/retry action. Publish buttons disable while the form is pending.
- **Schema and migration notes:** Added `20260721185710_publish_attempt_recovery` and `20260721185747_publish_attempt_error_reference`. The local database was backed up before each development migration. The safe legacy migrator now recognizes a former `db push` database that already matches the full checked-in history and records that history instead of reapplying tables.
- **Known bounded risk:** Post creation is reconciled by a private operation key. A lost response during an individual media upload can still leave an unattached duplicate media asset because WordPress has no media-operation-key endpoint yet; the local post ID and already-persisted media IDs still prevent a duplicate post.
- **Verification:** WordPress contract tests cover placeholder creation, reconciliation before retry, and refusal to create after an unreconciled uncertain write. A temporary SQLite test covers concurrent claim rejection, durable post-ID checkpointing, uncertain state, and operation-key reuse. `npm run test:db` also verifies fresh and legacy migration paths. PHP was not available on this workstation, so the plugin syntax check is deferred to CI or the WordPress host.

## Phase 5 — complete and honest WordPress synchronization

Status: complete on 2026-07-21.

- **SYNC-01 / SYNC-04:** Added `WordPressSyncRun` with explicit mode, state, timestamps, counts, error/reference, timezone, and site URL. Posts and categories now record their last successful observation and whether a successful full-private run considers them stale. Full syncs mark records not seen in that run as stale; public-only syncs never do.
- **SYNC-02:** The old authenticated-to-public fallback has been removed. Full private sync either completes as full coverage or records a failed run with a safe error code/reference. Public-only sync is a separate, deliberately labeled dashboard action and starts a new request sequence at page one.
- **SYNC-03:** Posts and categories are fully paginated with a checked `X-WP-TotalPages` value, strict payload validation, stable bounded GET timeout/retry policy, duplicate remote-ID rejection, and 50-record SQLite write batches. Pagination cannot silently change scope.
- **SYNC-05 / SYNC-06:** Full private freshness is tracked independently from the existence of local rows. `WORDPRESS_SYNC_STALE_HOURS` defaults to 24 (allowed range 1–168). The dashboard now shows last full/private and public-only runs, current mode, credential state, counts, stale records, WordPress timezone, and the latest safe failure reference. Intelligence and opportunity screens visibly warn when full private coverage is absent or the latest run is public-only.
- **SYNC-07:** A full private sync captures the WordPress timezone from authenticated settings. Scheduling keeps the unambiguous UTC instant, derives the WordPress-local timestamp to send, stores the timezone used, and displays workstation time, WordPress target time, and UTC in the review screen.
- **Schema and migration notes:** Added `20260721191042_wordpress_sync_health` and `20260721191811_schedule_timezone_context`. The local SQLite database was backed up before the schedule-context migration; existing articles keep their existing schedule values and gain an optional timezone field.
- **Verification:** Unit tests cover private pagination, first- and later-page auth failures without fallback, a public-only page-one restart, existing GET retry behavior, and timezone conversion. The SQLite rehearsal covers fully paginated posts and categories, full/private stale marking, public-only non-staling, stored timezone, and a failed run with a correlation reference. `npm test` now has 127 passing tests; `npm run test:db`, TypeScript, ESLint, Prisma validation/generation, migration status/diff, and a production build are run for the final phase check.

## Phase 6 — recoverable image generation and replacement

Status: complete on 2026-07-21.

- **IMG-01:** Replaced machine-generated image warnings in editorial notes with structured featured/body image state, error code, and attempt time fields. New failures never overwrite operator notes. The migration safely extracts only standalone, recognizable legacy image warnings; ambiguous mixed notes are preserved unchanged.
- **IMG-02 / IMG-03:** Image generation now writes to an operation-specific staging directory and validates before a file is promoted. Body-image replacement stages every new image first, then performs a short SQLite transaction to swap body rows and Markdown. Existing rows/files remain intact if generation, file promotion, or the database transaction fails. Featured-image replacement follows the same generate, promote, swap, then cleanup order.
- **IMG-04:** New body images receive a stable asset key and an invisible local Markdown marker. Replacement can remove the correct generated image even if the operator edits the surrounding alt text or image URL; rendered publishing output remains clean.
- **IMG-05:** Generated body alt text is concise and based on the intended visual and section, not the focus keyword. The review screen warns about empty or repeated alt text and exposes current image state, safe error code, and latest attempt time.
- **Schema and migration notes:** Added `20260721193600_recoverable_image_assets`. The local database was backed up before the migration applied. Existing featured/body assets are marked as succeeded; legacy asset keys remain optional and new assets always get one.
- **Verification:** Tests cover staged-file promotion, stable-marker removal after Markdown edits, structured retry state without mutating editorial notes, alt-text warnings, validation of generated image bytes, and existing bounded provider/download behavior. `npm test` has 128 passing tests; the SQLite migration rehearsal, TypeScript, ESLint, Prisma validation/diff, and production build are run for the final phase check.

## Phase 7 — safe opportunity generation and durable topic clusters

Status: complete on 2026-07-21.

- **OPP-01 / OPP-02:** Opportunity draft generation now uses the explicit lifecycle `IDEA -> APPROVED -> GENERATING -> GENERATED`, with `GENERATION_FAILED` as the recoverable failure state. Only an approved opportunity can claim a generation slot. The claim is a conditional database update, so a concurrent request is rejected before it can create another draft. A saved `generatedArticleId` is always returned instead of regenerated, including legacy records.
- **OPP-02:** AI draft preparation happens outside the SQLite transaction. The final article insert and opportunity link run in one short transaction; if the link cannot be saved, the article insert is rolled back too. Provider or persistence failures become a structured, retryable `GENERATION_FAILED` state with a safe error code and attempt time. Re-approval clears the safe failure code before a retry.
- **OPP-03:** Opportunity scoring now has a shared `loadOpportunityContext` path. An AI planning pass loads the category, coverage, article, and WordPress post context once, then persists each scored idea against that same snapshot instead of repeatedly re-reading the full catalog.
- **CLU-01 / CLU-02:** Topic clusters and their items now record whether they are `AUTO` or `MANUAL`. One transaction reconciles automatic clusters: it updates expected automatic items, removes stale automatic items, clears only their matching automatic opportunity assignment, and archives empty automatic clusters. Manual clusters/items are skipped entirely, so automation cannot rewrite editorial work.
- **CLU-03:** The reviewed alias and strategy matching rules for automatic clusters now live in `src/lib/intelligence/cluster-catalog.ts`, rather than being embedded in reconciliation code.
- **Interface:** Opportunity list filters show generating and failed states. The detail screen makes an active run, safe failure/retry path, and valid workflow actions clear without exposing provider details.
- **Schema and migration notes:** Added `20260721201500_opportunity_lifecycle_and_cluster_ownership`. The local SQLite database was automatically backed up before it applied. Existing opportunities retain their state; existing clusters/items are treated as `AUTO` so the next reconcile can clean stale machine-generated membership without changing manual records.
- **Verification:** `npm test` has 130 passing tests, including lifecycle transition and retry-state coverage. ESLint, TypeScript, Prisma validation, migration status/diff, the fresh-and-legacy SQLite migration rehearsal, and a Next.js production build passed.

## Phase 8 — efficient AI use and clearer editorial intelligence

Status: complete on 2026-07-21.

- **AI-01:** Article-generation JSON no longer asks the model to invent internal-link titles, slugs, or URLs. The content pipeline now selects final links exclusively from verified, synced records using the deterministic keyword/angle/brief resolver. Model-written prose remains unchanged.
- **AI-02:** Added durable `GenerationRun` telemetry for article drafts, comparison drafts, opportunity ideas, keyword ideas, and angle ideas. Each run records operation, provider/model, prompt version, start/end time, latency, returned token counts, optional article/opportunity reference, retry count, final state, and a safe error code. It deliberately stores no API keys, prompt bodies, or provider responses. Comparison generations now retain history rather than overwriting a prior result for the same model.
- **AI-03:** Prompt/schema versions are explicit. Article, opportunity, keyword, and angle prompts use clear untrusted-data boundaries and instruct the model not to follow instructions embedded in editorial notes, titles, WordPress evidence, or other supplied reference text. Existing structured-output schemas and bounded token limits remain enforced.
- **INT-01:** Deterministic duplicate scoring now filters a small reviewed set of low-information terms for fuzzy comparisons while preserving exact-title blocking. Stored duplicate evidence explains the shared terms and rule behind a warning so operators can understand why it appeared.
- **QUAL-01:** Quality analysis tokenizes Markdown with the editor’s Markdown parser, preserves link anchor text when counting words, recognizes setext plus H2/H3 headings, surfaces the previously calculated missing-meta-keyphrase warning, supports category/content-type word-count bands, and separates blocking warnings from editorial suggestions. CTA guidance can be disabled for reference-style content.
- **Schema and migration notes:** Added `20260721210000_generation_telemetry`. The local SQLite database was backed up before applying it. The same migration removes the one-comparison-per-model uniqueness restriction so historical comparison runs are preserved.
- **Verification:** `npm test` has 133 passing tests, including deterministic-link, duplicate-calibration, Markdown-quality, and lifecycle coverage. TypeScript, ESLint, Prisma validation, migration status/diff, the fresh-and-legacy SQLite rehearsal, and a Next.js production build passed.

## Phase 9 — operator usability and recovery tools

Status: complete on 2026-07-21.

- **UX-01 (complete):** Added an authenticated, saved-data publish preflight at `/articles/[id]/preflight`. Operators can select draft, publish-now, or scheduled intent and inspect the exact saved title, slug, excerpt, focus phrase, Yoast fields, category, tags, desired status, schedule/timezone, media plan, resolved links, warnings, and blockers before invoking WordPress.
- **UX-01 (complete):** The preflight uses the same Markdown renderer and HTML sanitizer as WordPress publishing, then shows both the rendered result and the exact sanitized HTML. It clearly distinguishes local generated image paths from WordPress-assigned media URLs, which cannot exist until WordPress uploads the files.
- **UX-02 (complete):** Added the authenticated `/operations` recovery center and navigation entry. It reads the durable publish attempts, WordPress sync runs, image-operation state, and AI generation telemetry already stored by Foundry, with the related item, state, start/finish time, checkpoint/progress, safe error/reference, and appropriate recovery route.
- **UX-02 (complete):** Failed or uncertain publishes can reconcile/retry from the center; failed/degraded syncs can start a full private retry there. Both actions return to the center with a result message. Image and AI records link to the source article/opportunity, where their existing guarded retry controls remain authoritative.
- **UX-03 (complete):** Added durable `ArticleClaim` records with an initial `OPEN` state plus explicit `VERIFIED` and `DISMISSED` states. Claims are scoped to an article, retain optional source and editorial-note fields, and are deleted with their article.
- **UX-03 (complete):** AI article generation can suggest a small, bounded list of factual claims for review; it never marks them verified or provides a source. The article review page lets an operator add, edit, verify, dismiss, and document each claim without leaving the article.
- **UX-04 (complete):** The article review screen now offers deterministic internal-link suggestions from saved WordPress catalog records and known local articles. Every card names the target, anchor, reason, confidence, and exact section boundary where the link will be inserted.
- **UX-04 (complete):** One click adds a `Further reading` Markdown link to the saved draft and records the target in the existing internal-link reference list. The server re-derives the target from the database instead of accepting a browser-provided URL, blocks duplicate destinations, and warns before linking to unpublished local drafts or non-public WordPress posts.
- **Schema and migration notes:** No schema or migration change was needed. The link insertion test is included in the fresh-and-legacy SQLite rehearsal because it verifies the server-side target lookup and write.
- **Verification:** `npm test` has 140 passing tests. TypeScript, ESLint, Prisma validation, migration status/diff, the fresh-and-legacy SQLite rehearsal, and the Next.js production build pass.

## Release automation and live verification

- **CI:** Added GitHub Actions checks for application validation, WordPress plugin PHP syntax, secret scanning, and production dependency auditing. The workflow runs on pull requests, pushes, and manual dispatch.
- **Live smoke test:** Added a confirmation-gated `npm run release:smoke` command and [release-smoke.md](release-smoke.md). It creates one clearly labeled WordPress draft, verifies operation-key lookup and repeat-update behavior, and confirms that a full private sync records the draft. It never publishes public content, generates AI text, or creates images.

## Deferred by design

- Product-feature changes: later phases after Phase 9.
