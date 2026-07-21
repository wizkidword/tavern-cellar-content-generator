# WordPress Companion Plugin

This folder contains a small WordPress plugin that exposes these Yoast post meta fields to the REST API:

- `_yoast_wpseo_title`
- `_yoast_wpseo_metadesc`
- `_yoast_wpseo_focuskw`

Without it, Tavern Cellar Foundry can still create posts, set categories, upload featured images, and attach tags, but Yoast's editable SEO inputs stay empty because your current REST schema does not expose those meta keys.

Version 0.2.0 also stores a private Foundry publish-operation key on new placeholder drafts and provides an authenticated reconciliation endpoint. This lets Foundry find a post after a lost response instead of blindly creating a second post.

## Install

1. In WordPress admin, go to `Plugins > Add New > Upload Plugin`
2. Upload `tavern-cellar-foundry-yoast-rest-bridge.zip`
3. Activate the plugin (or replace the prior plugin ZIP, then reactivate it)

The plugin source also lives in `tavern-cellar-foundry-yoast-rest-bridge/` if you need to rebuild the zip later.

After activation, push the draft from Foundry again and the app will send:

- focus keyphrase from the article's primary keyword
- SEO title from the article's meta title
- meta description from the article's meta description

The plugin endpoint is private to authenticated WordPress users who can edit posts. It returns only a post ID, status, and link for a matching operation key; it never exposes Foundry credentials or article content.
