# Tavern Cellar Foundry

Private SEO content generator for `taverncellar.com`.

## What it does

- Syncs Tavern Cellar categories and published-post history from WordPress
- Tracks every locally generated article so duplicate titles and angles are blocked
- Generates full article drafts with SEO metadata, tags, internal-link suggestions, and a featured image prompt
- Optionally generates a featured image asset through OpenAI
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
WORDPRESS_USERNAME="your-wordpress-username"
WORDPRESS_APP_PASSWORD="your-wordpress-application-password"
FOUNDRY_OPERATOR_TOKEN=""
```

Important:

- ChatGPT subscriptions and the OpenAI API are separate products, so this app uses the API path rather than a ChatGPT web login.
- For WordPress publishing, use an application password for the account that should create posts.
- Leaving spaces in the WordPress application password inside `.env` is fine; the app strips them before authenticating.
- Foundry allows local `localhost` / `127.0.0.1` use by default. If you expose it remotely, set `FOUNDRY_OPERATOR_TOKEN` and send that value as `x-foundry-operator-token` or a `foundry_operator_token` cookie.

## Local setup

```bash
npm install
npm run db:generate
npm run db:push
npm run dev
```

Then open `http://localhost:3000`.

## Workflow

1. Click `Sync Live WordPress History` to pull categories and current post history.
2. Generate a new article draft from the dashboard.
3. Review and edit the article on its detail page.
4. Optionally regenerate the featured image.
5. Push a WordPress draft, publish immediately, or schedule it.

Scheduling stores the local wall-clock time you choose and sends that local time to WordPress, so verify the scheduled post in WordPress after scheduling if your server and WordPress timezone settings ever diverge.

## Notes

- The duplicate guard compares new ideas against both the app ledger and the live WordPress post catalog.
- Tags are created and attached in WordPress automatically during publish and draft sync.
- Your current WordPress REST schema does not expose Yoast's editable SEO fields by default. A companion plugin is included in [wordpress-plugin](C:\Users\jrock\Documents\CODERSCORNER\CODEX\tavern-cellar-content-generator\wordpress-plugin\README.md) so Foundry can write focus keyphrase, SEO title, and meta description directly into Yoast.
- Browser automation was used in this session to verify the local UI. Next dev is configured with `allowedDevOrigins` for `127.0.0.1` so local browser automation works cleanly.
