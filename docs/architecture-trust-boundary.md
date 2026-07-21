# Tavern Cellar Foundry trust boundary

Updated for Phase 0 / PR 1 on 2026-07-21.

```text
Browser / single operator
  -> signed HttpOnly session cookie
  -> Next.js proxy, pages, Server Actions, and API routes
  -> Prisma / local SQLite
  -> OpenAI and fal.ai image provider
  -> generated local image files
  -> WordPress REST API
  -> WordPress Yoast REST bridge plugin
```

## Boundary rules

- The launcher binds Next.js to `127.0.0.1` by default. Loopback binding is defense in depth, not authorization.
- The `FOUNDRY_OPERATOR_TOKEN` is only compared during login. It is never placed in a cookie, URL, browser storage, or client JavaScript.
- A signed, versioned, expiring `foundry_session` cookie is the only authorization credential accepted by the application.
- `Host`, `Origin`, `X-Forwarded-Host`, and `X-Forwarded-For` never establish operator identity. `Origin` is checked only as a same-origin CSRF control for mutations.
- `src/proxy.ts` is an early redirect/401 gate. Each page, Server Action, and API route also validates the session directly, so proxy bypasses cannot expose data or execute work.
- The application emits `noindex, nofollow` metadata and protected-response headers.

## Cross-system operations needing recovery state

The following workflows cross a local database boundary and one or more remote/filesystem boundaries. They are intentionally deferred to later plan phases, where each must gain explicit checkpoints and reconciliation behavior:

- WordPress catalog synchronization and category creation.
- Draft creation, publish, scheduling, tags, Yoast metadata, and media upload.
- OpenAI draft/model-comparison generation and fal/OpenAI image generation.
- Generated image replacement, local writes, WordPress media attachment, and cleanup.
- Opportunity generation, article creation, and topic-cluster reconciliation.
