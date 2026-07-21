# Tavern Cellar Foundry

Private SEO content generator for `taverncellar.com`.

## What it does

- Syncs Tavern Cellar categories and published-post history from WordPress
- Tracks every locally generated article so duplicate titles and angles are blocked
- Generates full article drafts with SEO metadata, tags, internal-link suggestions, and a featured image prompt
- Optionally generates featured and in-article image assets through fal.ai or OpenAI
- Supports local review before sending a draft, publishing immediately, or scheduling in WordPress
- Syncs WordPress tags automatically when pushing drafts or publishing

## Stack

- Next.js 16
- TypeScript
- SQLite
- Prisma
- OpenAI API
- WordPress REST API

## Required credentials

Add these to `.env`:

```env
DATABASE_URL="file:./prisma/dev.db"
OPENAI_API_KEY="your-openai-api-key"
OPENAI_TEXT_MODEL="gpt-5.4-mini"
OPENAI_IMAGE_MODEL="gpt-image-2"
WORDPRESS_URL="https://taverncellar.com"
# Optional: direct WordPress origin IP when the public proxy challenges Foundry.
WORDPRESS_ORIGIN_IP=""
WORDPRESS_USERNAME="your-wordpress-username"
WORDPRESS_APP_PASSWORD="your-wordpress-application-password"
WORDPRESS_SYNC_STALE_HOURS="24"
FOUNDRY_AUTH_REQUIRED="true"
FOUNDRY_OPERATOR_TOKEN="replace-with-a-strong-operator-credential"
SESSION_SECRET="replace-with-at-least-32-random-bytes"
SESSION_MAX_AGE_HOURS="12"
APP_ORIGIN="http://127.0.0.1:3000"
```

Important:

- ChatGPT subscriptions and the OpenAI API are separate products, so this app uses the API path rather than a ChatGPT web login.
- Article draft generation lets you choose `gpt-5.4-nano`, `gpt-5.4-mini`, or `gpt-5.5` before each draft. `OPENAI_TEXT_MODEL` is only the default for helper calls that do not expose a model picker.
- From an article review page, generate other text models as saved comparison drafts, then open the side-by-side comparison view.
- OpenAI image generation lets you choose `gpt-image-2`, `gpt-image-1.5`, `gpt-image-1`, or `gpt-image-1-mini` from the form. `OPENAI_IMAGE_MODEL` is only the environment default.
- fal.ai image generation can use `fal-ai/flux-2`, `fal-ai/flux-2-pro`, or `fal-ai/flux-2-flex`. `FAL_IMAGE_MODEL` is the default when a screen does not send an explicit model choice.
- For WordPress publishing, use an application password for the account that should create posts.
- If a public proxy blocks the Foundry server with a browser challenge, set `WORDPRESS_ORIGIN_IP` to the confirmed WordPress origin IP. Foundry will still use `WORDPRESS_URL` for the secure hostname and WordPress host checks; normal site visitors are unaffected.
- Leaving spaces in the WordPress application password inside `.env` is fine; the app strips them before authenticating.
- Set `FOUNDRY_AUTH_REQUIRED="false"` only for a trusted Foundry workspace on this computer. It removes the sign-in screen while the included launcher remains bound to `127.0.0.1`.
- Set `FOUNDRY_OPERATOR_TOKEN` to a unique credential of at least 16 characters. Foundry uses it only on the login page and never stores it in browser-visible state.
- Set `SESSION_SECRET` to at least 32 random bytes. You can generate one with `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`.
- `APP_ORIGIN` must match the URL used to open Foundry. The included launcher binds to `127.0.0.1` by default and opens the matching origin.
- The supported `npm run dev` and `npm run start` commands refuse a non-loopback launch without valid operator-session configuration; a non-loopback `APP_ORIGIN` is also checked at server startup. Direct remote binding is unsupported for this local-first app.
- Foundry never treats `Host`, `Origin`, `X-Forwarded-Host`, `X-Forwarded-For`, or a custom header as proof of operator identity. Every page, Server Action, and API route requires the signed session created at login.

## Local setup

```bash
npm install
npm run db:generate
npm run db:migrate
npm run dev
```

Then open `http://127.0.0.1:3000`.

When `FOUNDRY_AUTH_REQUIRED` is `true`, sign in at `/login` with `FOUNDRY_OPERATOR_TOKEN` after the server starts. When it is `false`, Foundry opens directly to the dashboard.

On Windows, you can also double-click `Launch-Tavern-Cellar-Foundry.bat` from the project folder. It opens the existing local server if one is already running, or prepares the database, starts the server, and opens `http://127.0.0.1:3000`.

See [docs/implementation-status.md](docs/implementation-status.md) for the active security and reliability implementation plan.

## Database safety

- `npm run db:migrate` creates a timestamped SQLite backup before it baselines an existing database or applies a pending migration.
- `npm run db:backup` creates an additional manual backup. Backups are stored in `prisma/backups/` and are intentionally ignored by Git.
- `npm run start` runs the same safe migration check before starting the production server. For local schema development, use `npm run db:migrate:dev` instead of `prisma db push`.
- To restore a backup: stop Foundry, make a copy of the current database, then replace `prisma/prisma/dev.db` with the chosen file from `prisma/backups/`. Restart Foundry with `npm run db:migrate` so Prisma can confirm the migration history.

## Workflow

1. Run a **Full private sync** to pull all categories plus public, draft, scheduled, pending, and private post history. The dashboard records its health, WordPress timezone, and any stale local records.
2. Use **Public-only sync** only as a clearly marked visibility check when private access is unavailable; it never marks local history missing or stale and does not replace a full sync.
3. Generate a new article draft from the dashboard.
4. Review and edit the article on its detail page.
5. Optionally generate the other text model for a side-by-side comparison.
6. Optionally regenerate the featured image.
7. Install or update the companion plugin to version 0.2.0 before the first publish, then push a WordPress draft, publish immediately, or schedule it. Foundry creates a private draft placeholder first and can reconcile that same post after an interrupted write.

Scheduling stores the intended UTC instant, converts it to the last confirmed WordPress site timezone, and shows workstation time, WordPress target time, and UTC on the article page. If the site timezone is unknown, run a full private sync before scheduling.

## Notes

- The duplicate guard compares new ideas against both the app ledger and the live WordPress post catalog.
- Tags are created and attached in WordPress automatically during publish and draft sync.
- Your current WordPress REST schema does not expose Yoast's editable SEO fields or Foundry's private publish-operation key by default. The version 0.2.0 companion plugin in [wordpress-plugin](C:\Users\jrock\Documents\CODERSCORNER\CODEX\tavern-cellar-content-generator\wordpress-plugin\README.md) lets Foundry write Yoast fields and safely reconcile interrupted first-publish attempts without exposing post content or credentials.
- Browser automation was used in this session to verify the local UI. Next dev is configured with `allowedDevOrigins` for `127.0.0.1` so local browser automation works cleanly.
