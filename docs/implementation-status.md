# Tavern Cellar Foundry implementation status

## Phase 0 — baseline and trust boundary

Status: complete on 2026-07-21.

- **PRE-01:** Confirmed the development branch baseline was `codex/content-intelligence` at `1ae43b5`; created `codex/security-reliability-hardening` for this work. The app uses Node 20.19.0, npm 10.8.2, Next.js 16.2.4 at baseline, React 19.2.4, Prisma 6.19.3, and SQLite at the configured `DATABASE_URL` (the example uses `file:./prisma/dev.db`). There was no `proxy.ts` or `middleware.ts`.
- **PRE-02:** `npm ci`, Prisma validation/generation, 95 unit tests, `npx tsc --noEmit`, ESLint, and the production build passed before behavior changes. `npm audit --omit=dev` identified a direct high-severity Next.js advisory; the compatible patch update to Next.js and `eslint-config-next` 16.2.11 is included with PR 1. The remaining audit reports are the same transitive `next`/PostCSS moderate advisory, for which the audit suggests an unsafe major downgrade; they are recorded for dependency-policy review rather than force-fixed.
- **PRE-03:** Added [architecture-trust-boundary.md](architecture-trust-boundary.md) to map the browser, Next.js, SQLite, providers, filesystem, WordPress REST API, and plugin boundaries plus later recovery-sensitive operations.

## Phase 1 — application authentication boundary

Status: complete on 2026-07-21.

- **SEC-01:** Header-based localhost and token authorization has been removed. `Host`, `Origin`, and forwarded headers are never identity inputs.
- **SEC-02:** `/login` verifies the configured operator credential with a timing-safe comparison, then creates a versioned, HMAC-signed session with a finite expiration. The cookie is `HttpOnly`, `SameSite=Strict`, path-scoped to `/`, and marked `Secure` for HTTPS origins. Logout clears it.
- **SEC-03:** Every application page has a server-side guard before data reads. Next 16 `proxy.ts` provides the early redirect/structured API 401, while all Server Actions and API routes independently verify the session. Provider actions add session- and process-scoped throttles.
- **SEC-04:** State-changing Server Actions and API requests require the configured exact origin after session validation. Next Server Action `allowedOrigins` is configured from `APP_ORIGIN`.
- **SEC-05:** Failed login attempts are limited to five per 15 minutes; expensive provider actions have bounded per-session and global fixed windows. No proxy-derived IP header is trusted or used.
- **SEC-06:** The launcher remains bound to `127.0.0.1`; metadata and protected responses carry `noindex, nofollow`. The supported `npm run dev` and `npm run start` commands refuse a non-loopback launch without valid operator-session configuration, and a non-loopback configured `APP_ORIGIN` is also checked at server startup.
- **SEC-07:** Session secret strength and operator-token length are enforced. Non-local `WORDPRESS_URL` values must use HTTPS; HTTP is allowed only for loopback development endpoints. Documentation lists the new settings without exposing credentials.
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

## Deferred by design

- Publishing, sync, image, intelligence, and product-feature changes: Phases 4–9.
