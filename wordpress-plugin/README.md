# WordPress Companion Plugin

This folder contains a tiny WordPress plugin that exposes these Yoast post meta fields to the REST API:

- `_yoast_wpseo_title`
- `_yoast_wpseo_metadesc`
- `_yoast_wpseo_focuskw`

Without it, Tavern Cellar Foundry can still create posts, set categories, upload featured images, and attach tags, but Yoast's editable SEO inputs stay empty because your current REST schema does not expose those meta keys.

## Install

1. In WordPress admin, go to `Plugins > Add New > Upload Plugin`
2. Upload `tavern-cellar-foundry-yoast-rest-bridge.zip`
3. Activate the plugin

The plugin source also lives in `tavern-cellar-foundry-yoast-rest-bridge/` if you need to rebuild the zip later.

After activation, push the draft from Foundry again and the app will send:

- focus keyphrase from the article's primary keyword
- SEO title from the article's meta title
- meta description from the article's meta description
