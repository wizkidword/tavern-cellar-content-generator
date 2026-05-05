# Tavern Cellar Foundry Content Intelligence Design

## Goal

Turn Tavern Cellar Foundry from a draft generator into a private content strategist that helps decide what Tavern Cellar should publish next.

The system should optimize for a mix of Tavern brand fit, SEO usefulness, and content coverage. It should not chase generic keywords, flood the site with random AI articles, or prioritize speed over quality. The purpose is to build stronger Tavern Cellar coverage over time.

## Product Principles

- Tavern brand fit comes first. Every opportunity should feel like it belongs on Tavern Cellar.
- SEO matters, but only when it supports useful editorial coverage.
- The app should reduce duplicate or thin articles before API time is spent.
- Real site history should drive recommendations.
- Internal links should point to actual Tavern Cellar posts, not guessed topics.
- The workflow should stay local, private, and operator-controlled.

## Current Context

Foundry already has:

- a local Prisma/SQLite ledger of categories, live posts, drafts, scheduled posts, and published articles
- WordPress REST sync for published, draft, and scheduled posts
- duplicate checks against local and WordPress history
- OpenAI draft, keyword, angle, and featured image generation
- local review and WordPress draft/publish/schedule actions
- a Windows launcher for local operation

Content Intelligence should build on these pieces instead of replacing the current publishing flow.

## Phase 1: Tavern Coverage Map

Add a strategy view that summarizes each active Tavern Cellar content lane:

- Horror
- The Walking Dead Universe
- Movies
- Retro Gaming
- Retro Advertising

For each lane, show:

- live published post count
- draft and scheduled post count
- local generated article count
- recent publishing activity
- stale or quiet areas
- obvious coverage gaps
- categories that may be overloaded or underdeveloped

The first version can use simple heuristics from the local WordPress catalog. It does not need external SEO APIs.

## Phase 2: Real Internal Link Index

Create a searchable internal-link index from synced WordPress posts.

For each synced post, store or derive:

- title
- slug
- link
- category memberships
- normalized title tokens
- excerpt tokens
- published date
- WordPress status

Use this index to recommend real internal link targets during article planning and review.

Each recommendation should include:

- linked post title
- URL or slug
- reason for the match
- category
- confidence level

The app should avoid showing fake links or vague topic suggestions as if they were real links.

## Phase 3: Opportunity Engine

Add an opportunity model that represents a possible article before it becomes a draft.

Each opportunity should include:

- category
- primary keyword or topic phrase
- editorial angle
- short Tavern-style brief
- suggested internal links
- similar existing posts
- score breakdown
- status: idea, approved, generated, rejected, archived

Score each opportunity across:

- Tavern brand fit
- content coverage value
- SEO usefulness
- duplicate risk
- internal link potential
- publishability
- category balance

Use a simple visible score first. The score should be explainable, not a black box.

## Phase 4: Duplicate And Saturation Radar

Before generating a draft, show whether an opportunity is:

- fresh
- adjacent but safe
- crowded
- too similar to existing coverage

Use existing duplicate logic, but make the evidence visible:

- matching post title
- source: local app or WordPress
- status: draft, future, publish, local generated, local published
- similarity percentage or qualitative label
- why it matters

The app should encourage revising the angle instead of simply blocking the user.

## Phase 5: Topic Cluster Builder

Group opportunities and existing posts into topic clusters.

Example clusters:

- 1950s cereal advertising
- slasher iconography
- retro game commercial nostalgia
- Walking Dead character retrospectives
- horror branding and nostalgia

Each cluster should show:

- existing posts
- drafted or scheduled posts
- suggested next opportunities
- missing supporting articles
- internal linking opportunities inside the cluster

Clusters should help Tavern Cellar build authority instead of publishing disconnected one-off posts.

## Phase 6: Strategy-To-Draft Workflow

Change the preferred workflow to:

1. Sync WordPress history.
2. Review the coverage map.
3. Inspect recommended opportunities.
4. Open an opportunity detail view.
5. Check similar coverage and internal link suggestions.
6. Approve or revise the brief.
7. Generate the draft.
8. Review quality signals.
9. Publish, draft, or schedule in WordPress.

The existing quick article generator can remain available, but the strategy workflow should become the primary path.

## User Experience

Add a new top-level intelligence area instead of overloading the current dashboard.

Recommended navigation:

- Dashboard
- Intelligence
- Opportunities
- Review Queue
- Calendar

The first version can keep this as simple links or tabs. The app does not need a full redesign before the intelligence layer is useful.

Key UI surfaces:

- Coverage Map: category-level health and gaps
- Opportunity List: scored article ideas
- Opportunity Detail: brief, similar coverage, internal links, scoring
- Cluster View: grouped articles and missing support pieces
- Review Queue: existing draft/publish workflow

## Data Model Additions

Likely new models:

- `ContentOpportunity`
- `OpportunityInternalLink`
- `OpportunitySimilarPost`
- `TopicCluster`
- `TopicClusterItem`

Likely additions to existing models:

- richer `SitePost` token/search fields
- optional cluster membership
- opportunity status references from generated articles

Keep the data model local and SQLite-friendly.

## AI Usage

AI should assist with:

- opportunity generation
- Tavern-style brief writing
- brand-fit scoring
- angle revision
- cluster naming
- quality review

AI should not be trusted blindly for:

- whether a link exists
- whether a topic has already been published
- WordPress state
- final duplicate decisions

Those checks should come from the local synced catalog first.

## Error Handling

The app should handle:

- stale WordPress sync data
- missing credentials
- OpenAI failures
- empty categories
- no internal link matches
- duplicate-heavy categories
- rejected opportunities

When data is stale, the UI should say so and offer a sync action.

When an opportunity is weak, the app should explain why and offer revision paths.

## Testing And Verification

Add tests for:

- scoring calculations
- duplicate/saturation labels
- internal link matching
- cluster grouping helpers
- opportunity lifecycle transitions
- WordPress catalog sync assumptions

Verification should include:

- `npm run lint`
- `npm run build`
- local sync smoke test
- UI smoke test for Coverage Map, Opportunity Detail, and draft generation from an approved opportunity

## Phased Build Order

### Phase 1

Build Coverage Map and real internal-link index.

This gives immediate visibility into what Tavern Cellar already has and where a new article could help.

### Phase 2

Build Opportunity Engine and Duplicate Radar.

This makes Foundry recommend ideas and explain whether they are worth writing.

### Phase 3

Build Topic Clusters and Opportunity Detail.

This turns one-off ideas into a strategic content map.

### Phase 4

Connect approved opportunities to draft generation.

This makes the strategy layer feed the existing generation and publishing flow.

### Phase 5

Add post-generation quality scoring and revise tools.

This improves each draft before it reaches WordPress.

## Non-Goals For The First Version

- No external SEO API dependency.
- No multi-user workflow.
- No public SaaS framing.
- No automatic publishing without operator review.
- No major visual redesign before the intelligence workflow exists.
- No replacing the existing WordPress publishing path.

## Open Decision

The first implementation plan should start with Phase 1 and Phase 2 together only if the data model changes are small enough to keep the work coherent. If not, Phase 1 should ship first as a useful standalone intelligence dashboard.
