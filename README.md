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
WORDPRESS_USERNAME="your-wordpress-username"
WORDPRESS_APP_PASSWORD="your-wordpress-application-password"
FOUNDRY_OPERATOR_TOKEN=""
```

Important:

- ChatGPT subscriptions and the OpenAI API are separate products, so this app uses the API path rather than a ChatGPT web login.
- Article draft generation lets you choose `gpt-5.4-nano`, `gpt-5.4-mini`, or `gpt-5.5` before each draft. `OPENAI_TEXT_MODEL` is only the default for helper calls that do not expose a model picker.
- From an article review page, generate other text models as saved comparison drafts, then open the side-by-side comparison view.
- OpenAI image generation lets you choose `gpt-image-2`, `gpt-image-1.5`, `gpt-image-1`, or `gpt-image-1-mini` from the form. `OPENAI_IMAGE_MODEL` is only the environment default.
- fal.ai image generation can use `fal-ai/flux-2`, `fal-ai/flux-2-pro`, or `fal-ai/flux-2-flex`. `FAL_IMAGE_MODEL` is the default when a screen does not send an explicit model choice.
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

On Windows, you can also double-click `Launch-Tavern-Cellar-Foundry.bat` from the project folder. It opens the existing local server if one is already running, or prepares the database, starts the server, and opens `http://127.0.0.1:3000`.

## Workflow

1. Click `Sync Live WordPress History` to pull categories and current post history.
2. Generate a new article draft from the dashboard.
3. Review and edit the article on its detail page.
4. Optionally generate the other text model for a side-by-side comparison.
5. Optionally regenerate the featured image.
6. Push a WordPress draft, publish immediately, or schedule it.

Scheduling stores the local wall-clock time you choose and sends that local time to WordPress, so verify the scheduled post in WordPress after scheduling if your server and WordPress timezone settings ever diverge.

## Notes

- The duplicate guard compares new ideas against both the app ledger and the live WordPress post catalog.
- Tags are created and attached in WordPress automatically during publish and draft sync.
- Your current WordPress REST schema does not expose Yoast's editable SEO fields by default. A companion plugin is included in [wordpress-plugin](C:\Users\jrock\Documents\CODERSCORNER\CODEX\tavern-cellar-content-generator\wordpress-plugin\README.md) so Foundry can write focus keyphrase, SEO title, and meta description directly into Yoast.
- Browser automation was used in this session to verify the local UI. Next dev is configured with `allowedDevOrigins` for `127.0.0.1` so local browser automation works cleanly.
