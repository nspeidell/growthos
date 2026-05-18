# GrowthOS — Model Handoff Document

**Date:** April 30, 2026
**Owner:** Nick Speidell (reunionfamilychallenge@gmail.com)
**Repo:** https://github.com/nspeidell/growthos.git (branch: master)
**Live URL:** https://growthos.pages.dev

---

## What Is GrowthOS

GrowthOS is an AI-powered marketing command center built to launch and scale **Reunion** — a multi-generational family platform (think "digital family living room" for seniors, parents, and kids). GrowthOS is Nick's internal growth engine right now, but it's architected for future SaaS conversion.

Every feature decision should pass one test: **"Does this help real families discover and join Reunion?"**

Nick is the sole founder — he wears the developer, marketer, and strategic lead hats simultaneously. He works on macOS, uses Claude for development, and designs mobile-first (founder on phone is the primary use case).

---

## Tech Stack

**Frontend:** Next.js 15+ (App Router), TypeScript (strict mode, noUncheckedIndexedAccess), TailwindCSS 3, shadcn/ui components, Framer Motion, dark mode support.

**Backend:** 100% Cloudflare-native — Pages (hosting), D1 (SQLite database), R2 (object storage), KV (sessions), Queues (async jobs). **Never suggest Supabase, Vercel, or any non-Cloudflare backend services.** This is a hard constraint Nick has enforced repeatedly.

**ORM:** Drizzle ORM with SQLite dialect. Schema lives in `src/lib/db/schema.ts` (1834 lines, covers all tables). 20 D1 migrations (0000–0019).

**AI:** Anthropic Claude for content generation, SEO analysis, signal classification, and the Growth Swarm multi-agent system.

**Media Pipeline:** Replicate Flux (images), ElevenLabs (TTS/voice), Creatomate (video assembly). Assets stored in R2.

**Email:** Resend for transactional email and newsletters.

**Auth:** Google OAuth via Arctic library, sessions stored in KV.

**Billing:** Stripe (subscriptions, webhooks, checkout).

**Testing:** Vitest for unit tests. Tests exist for auth middleware, team actions, automations, calendar, swarm agents/orchestrator, growth engine stats/decisions/insights.

---

## Project Structure

```
growthos/
├── src/
│   ├── app/
│   │   ├── (auth)/           # Login, Google OAuth callback
│   │   ├── (public)/         # Waitlist, subscribe, unsubscribe, lead magnets
│   │   ├── api/              # REST endpoints (auth, cron, media, webhooks, etc.)
│   │   ├── dashboard/        # All dashboard modules (19 route groups)
│   │   │   ├── ads/          # Ad campaign management
│   │   │   ├── analytics/    # KPI dashboard
│   │   │   ├── automations/  # Drip campaign builder
│   │   │   ├── billing/      # Stripe subscription management
│   │   │   ├── calendar/     # Content scheduling calendar
│   │   │   ├── communities/  # Facebook Groups, Reddit, Discord, Slack
│   │   │   ├── competitors/  # Competitor tracking + AI analysis
│   │   │   ├── content/      # Content Studio (generation, library, media)
│   │   │   ├── experiments/  # A/B testing + growth optimization
│   │   │   ├── funnels/      # Lead magnets + conversion funnels
│   │   │   ├── media/        # Media Studio (memes, carousels, video)
│   │   │   ├── newsletter/   # Email newsletter composition + sending
│   │   │   ├── opportunities/# (placeholder)
│   │   │   ├── publisher/    # Social post scheduling + publishing
│   │   │   ├── reunion/      # Reunion app integration campaigns
│   │   │   ├── seo/          # SEO/AEO keyword + page management
│   │   │   ├── settings/     # Brand Vault, connected accounts, voices
│   │   │   ├── signals/      # Social listening intelligence
│   │   │   ├── swarm/        # AI agent swarm missions
│   │   │   ├── team/         # Team member management + RBAC
│   │   │   └── workspaces/   # Multi-workspace management
│   │   └── layout.tsx        # Root layout
│   ├── components/
│   │   ├── layout/           # Sidebar, header, bottom-nav
│   │   ├── ui/               # Theme toggle, workspace switcher
│   │   └── theme-provider.tsx
│   ├── lib/
│   │   ├── ads/              # Reddit Ads adapter
│   │   ├── ai/               # Claude client + doctrine engine
│   │   ├── auth/             # OAuth, sessions, RBAC middleware
│   │   ├── cloudflare/       # D1/R2/KV bindings
│   │   ├── communities/      # Facebook Groups API client
│   │   ├── db/               # Drizzle schema + 20 migrations
│   │   ├── email/            # Resend client
│   │   ├── growth-engine/    # A/B testing stats, decisions, insights, safety
│   │   ├── media/            # Replicate, Creatomate, meme/carousel generators
│   │   ├── publishers/       # Platform publishing adapters
│   │   ├── reunion/          # Reunion API client
│   │   ├── signals/          # Social listening analyzer + adapters
│   │   ├── swarm/            # Multi-agent orchestrator + 8 agent types
│   │   ├── utils/            # API helpers, cn, crypto, validation
│   │   └── video/            # ElevenLabs, brand style, trust analysis
│   ├── types/                # Shared TypeScript types
│   └── workers/              # 8 Cloudflare Workers
│       ├── ad-metrics-sync.ts
│       ├── competitor-scan.ts
│       ├── media-gen.ts
│       ├── metrics-sync.ts
│       ├── publisher.ts
│       ├── signal-scanner.ts
│       ├── swarm.ts
│       └── token-refresh.ts
├── wrangler.toml             # Cloudflare config (D1, R2, KV, Queues, crons)
├── package.json              # Scripts, deps
├── next.config.ts
├── drizzle.config.ts
├── tsconfig.json
└── vitest.config.ts
```

**Total:** 201 source files (.ts/.tsx/.sql)

---

## Build Phases Completed (1–14)

All 14 planned phases have been coded. Here's what each covers:

1. **Foundation** — Auth (Google OAuth), users/workspaces/sessions schema, dashboard shell, mobile-first layout (bottom nav + sidebar)
2. **Content + Media** — Brand Vault, Doctrine Engine (7 AI strategy modes: garyvee, mrbeast, hormozi, brunson, sethgodin, dankennedy, balanced), Content Studio, AI media generation
3. **Publisher** — Social platform OAuth, scheduling queue, approval workflow, platform-specific adapters
4. **SEO + Competitors** — Keyword research, page builder with JSON-LD schema markup, AEO analyzer, competitor tracking with AI analysis
5. **Analytics + Billing** — Post metrics sync, KPI dashboard, Stripe subscriptions/webhooks/checkout
6. **Ads + Reunion** — Ad campaign manager (Meta/Google/X), Reunion API bridge (push campaigns, webhooks)
7. **UI Upgrade + Community + Newsletter + Funnels** — Dark mode, workspace switcher, community engine (Facebook Groups/Reddit/Discord/Slack), newsletter system (Resend), lead magnets, automations/drip campaigns
8. **Video + Voice** — ElevenLabs TTS, Creatomate video assembly, voice profiles, brand video style config, video trust analysis
9. **Automations + Calendar + Team** — Drip campaign builder, content calendar (month/week/day views), team management with RBAC (6 roles)
10. **Testing + Deploy** — Vitest setup, unit tests across modules, deploy checklist, env validation
11. **Growth Swarm** — 8-agent AI orchestration system (strategist, content, video, ads, outreach, analytics, competitor, founder_voice), mission management, overnight autonomous mode
12. **Growth Optimization Engine** — A/B testing with statistical rigor (z-test, chi-square, Bayesian, Thompson Sampling), auto-promote winners, enterprise safety gates, cross-module integrations
13. **Media Generation Pipeline** — Replicate Flux image gen, meme generator, carousel generator, Creatomate video pipeline, R2 storage, media job processing queue
14. **Social Listening** — Signal intelligence across Reddit/X/Google News/RSS/YouTube/forums, AI-powered signal classification (10 signal types), tracked keywords, engagement actions, alert system

---

## Database Schema

D1 (SQLite) with Drizzle ORM. 20 migrations covering ~40 tables organized by phase:

**Phase 1:** users, workspaces, workspace_members, sessions, audit_logs
**Phase 2:** brand_profiles, brand_colors, brand_assets, doctrine_profiles, content_projects, content_assets, voice_profiles, media_jobs
**Phase 3:** connected_accounts, scheduled_posts
**Phase 4:** keywords, pages, internal_links, competitors, competitor_posts
**Phase 5:** post_metrics, subscriptions, usage_records
**Phase 6:** ad_campaigns, ad_variants, reunion_campaigns
**Phase 7:** communities, community_posts, community_members, subscribers, newsletters, lead_magnets, automations
**Phase 11:** swarm_agents, swarm_missions, swarm_tasks, swarm_logs
**Phase 12:** growth_experiments, growth_variants, growth_events, growth_results, growth_insights, growth_audit_log
**Phase 14:** listening_sources, tracked_keywords, signals, engagement_actions, signal_alerts

### CRITICAL: Schema/Migration Alignment

A major cleanup was just completed (April 2026) to align the Drizzle schema (`src/lib/db/schema.ts`) with the actual D1 migration SQL files. 28+ mismatches were fixed across 6 tables. The schema is now aligned, but **any future schema changes must be made in BOTH the Drizzle schema AND a new migration SQL file.** The Drizzle schema column names must map exactly to the SQL column names (e.g., `platformId: text("platform_id")` matches SQL `platform_id TEXT`).

Tables that were recently fixed: communities, community_posts, community_members, newsletters, ad_campaigns, ad_variants, lead_magnets, automations.

---

## Deployment

**Platform:** Cloudflare Pages (Direct Upload — NOT connected to Git)

**Deploy command:**
```bash
npm run deploy
```

This runs: `next build` → `fix-manifests.js` → `@cloudflare/next-on-pages` → `wrangler pages deploy .vercel/output/static --project-name=growthos`

**Ship command (git + deploy):**
```bash
npm run ship
```

This runs: `git add -A && git commit -m "update" && git push && npm run deploy`

**Important:** The Cloudflare Pages project "growthos" is a Direct Upload project. It CANNOT be connected to GitHub for auto-deploy — this is a Cloudflare platform limitation for Direct Upload projects. Deploys must be done via CLI.

**D1 migrations** must be applied manually per-migration:
```bash
wrangler d1 execute growthos-prod --remote --file=./src/lib/db/migrations/XXXX_name.sql
```

**Cloudflare Resources:**
- D1 database: `growthos-prod` (ID: 2b46db77-e682-45de-8205-b223246b7334)
- R2 bucket: `growthos-media`
- KV namespace: ID `80d4197d04d144429f836a614acaca50`
- Queues: growthos-publish, growthos-media, growthos-swarm, growthos-signals

**Required secrets** (set via `wrangler secret put`):
SESSION_SECRET, ENCRYPTION_KEY, GOOGLE_CLIENT_SECRET, ANTHROPIC_API_KEY

**Optional secrets:** STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, META_APP_ID, META_APP_SECRET, X_CLIENT_SECRET, REDDIT_CLIENT_ID, REDDIT_CLIENT_SECRET, REUNION_API_KEY, REUNION_WEBHOOK_SECRET, RESEND_API_KEY, ELEVEN_LABS_API_KEY, REPLICATE_API_TOKEN, CREATOMATE_API_KEY

---

## Current State & Pending Work

### Completed — Session 1 (April 28–29, 2026, Opus)
- Fixed 28+ Drizzle schema vs D1 migration mismatches across 6 tables
- Fixed deploy script (was missing `@cloudflare/next-on-pages` step)
- Code quality cleanup: zero `as any` casts, zero debug console.log, zero empty catch blocks
- GitHub repo initialized and pushed to github.com/nspeidell/growthos.git

### Completed — Session 2 (April 30, 2026, Sonnet)
- **Fixed production deploy** — All prior deploys were landing as Preview. Root cause: `wrangler pages deploy` without `--branch=production` defaults to preview. Fixed by adding `--branch=production` to the deploy script in `package.json`.
- **Resolved D1 `platform_group_id` error** — Communities tab was throwing column-not-found errors because the live site was serving stale preview code, not the schema-fixed production build. Fixed by correcting the deploy script and redeploying.
- **Deployed publisher worker** — `growthos-publisher` Cloudflare Worker is live at `growthos-publisher.nickspeidell.workers.dev`. Handles cron (every minute) scanning for due posts and queue consumer processing. Config: `wrangler.publisher.toml`. Deploy: `npm run deploy:publisher`.
- **All required secrets set** in Cloudflare Pages dashboard: ANTHROPIC_API_KEY, ENCRYPTION_KEY, SESSION_SECRET, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, META_APP_ID, META_APP_SECRET, X_CLIENT_ID, X_CLIENT_SECRET, CRON_SECRET, ELEVEN_LABS_API_KEY, REPLICATE_API_TOKEN, CREATOMATE_API_KEY.
- **ENCRYPTION_KEY** also set as secret on publisher worker (`wrangler secret put ENCRYPTION_KEY --config wrangler.publisher.toml`) — must match Pages value so token decryption works.
- **Social accounts connected** in GrowthOS Settings: Facebook, YouTube, X. OAuth tokens encrypted and stored in D1. Reddit pending platform app approval.
- **Redirect URIs confirmed** in Google Cloud Console, Meta App Dashboard, X Developer Portal — all pointing to `https://growthos-eo1.pages.dev/api/social/callback/[platform]`.

### Live URL
**https://growthos-eo1.pages.dev** (note: NOT growthos.pages.dev — the APP_URL var in Pages dashboard is set correctly)

### Deploy Commands
```bash
# Deploy Pages app (Next.js frontend + server actions)
npm run deploy

# Deploy publisher worker (cron + queue consumer)
npm run deploy:publisher

# Deploy everything + push to git
npm run ship
```

### Publisher Worker Details
- **Name:** `growthos-publisher`
- **Config:** `wrangler.publisher.toml`
- **Bindings:** DB (growthos-prod), PUBLISH_QUEUE (growthos-publish)
- **Secret needed:** ENCRYPTION_KEY (same value as Pages project)
- **Cron:** every minute — scans `scheduled_posts` for status=queued AND scheduled_for <= now
- **Queue:** consumes growthos-publish, calls platform adapters, marks posts published/failed
- **Retries:** up to 3 with exponential backoff (30s, 60s, 120s)

### Platform Publishing Status
| Platform | Adapter | Secrets | Account Connected | Notes |
|----------|---------|---------|-------------------|-------|
| Facebook | ✅ Built | ✅ Set | ✅ Connected | Posts to Page feed via Graph API v21.0 |
| X | ✅ Built | ✅ Set | ✅ Connected | Posts via v2 API with PKCE OAuth |
| Instagram | ✅ Built | ✅ Set (shares Meta) | ⚠️ Pending Meta review | Requires linked Instagram Business account |
| Reddit | ✅ Built | ❌ Pending | ❌ Pending | App in review — add secrets when approved |
| YouTube | ⚠️ Blocked | ✅ Set (shares Google) | ✅ Connected | Text posts not supported by YouTube API. Video upload is a separate future build. |

### Media Pipeline Status
| Service | Secret | Purpose |
|---------|--------|---------|
| Replicate | ✅ Set | AI image generation (Flux model) |
| ElevenLabs | ✅ Set | TTS voice narration |
| Creatomate | ✅ Set | Video assembly — template IDs still needed in wrangler.toml vars |

**Creatomate template IDs still needed** — Add to `wrangler.toml` and `wrangler.publisher.toml` under `[vars]` once templates are created in the Creatomate dashboard:
```toml
CREATOMATE_TPL_VIDEO_H = "..."   # Horizontal video
CREATOMATE_TPL_VIDEO_V = "..."   # Vertical video
CREATOMATE_TPL_VIDEO_SQ = "..."  # Square video
CREATOMATE_TPL_MEME = "..."      # Meme layout
CREATOMATE_TPL_QUOTE = "..."     # Quote card
```

### Known Issues / Technical Debt
- The `build` script runs `next build && node scripts/fix-manifests.js` — `fix-manifests.js` patches Next.js manifest output for Cloudflare Pages compatibility. Purpose is understood but not formally documented.
- No CI/CD pipeline — deploys are manual CLI commands. `.github/workflows/` was removed because the GitHub PAT lacked the `workflow` scope.
- Test suite exists but not verified end-to-end in current state.
- Community post publishing (Facebook Groups) marks posts as published in DB but does not call the Facebook Groups API — pending Meta App review for `publish_to_groups` permission.
- Growth Swarm and Social Listening are fully coded but untested against live data.
- `growthos-v2` duplicate Pages project still exists in Cloudflare dashboard — safe to delete.

### What Needs to Happen Next
- **End-to-end publish test** — Schedule a post to X, approve it, verify it fires within 60 seconds
- **Creatomate templates** — Create templates in Creatomate dashboard, add IDs to wrangler.toml vars, redeploy
- **Reddit** — Add `REDDIT_CLIENT_ID` and `REDDIT_CLIENT_SECRET` secrets once app is approved
- **Instagram** — Will activate automatically once Meta App review approves publishing permissions
- **Reunion app** — The companion family platform GrowthOS is designed to market. Reunion API bridge exists but the Reunion app itself is a separate project.
- **Mobile testing** — Layout is mobile-first in design but hasn't been tested on real devices

---

## Working Preferences (From Nick)

- **Cloudflare-native only** — Never suggest Supabase, Firebase, Vercel hosting, or similar. Everything runs on Cloudflare.
- **Exact instructions** — When giving steps for external dashboards (Cloudflare, Stripe, etc.), provide precise click-by-click navigation, never vague directions like "go to settings."
- **Be direct** — Nick moves fast and prefers concise, actionable guidance over lengthy explanations.

---

## Key Files to Read First

If you're picking up this project, start with these:

1. `src/lib/db/schema.ts` — The complete database schema (1834 lines). This is the source of truth for all data models.
2. `wrangler.toml` — Cloudflare infrastructure config (D1, R2, KV, Queues, cron schedules)
3. `package.json` — Scripts, dependencies, Node version
4. `src/app/dashboard/layout.tsx` — Dashboard layout wrapper
5. `src/components/layout/sidebar.tsx` — Navigation structure shows all modules
6. `src/lib/auth/middleware.ts` — RBAC permission system
7. `src/lib/ai/doctrine.ts` — The 7 AI strategy modes that drive content generation
