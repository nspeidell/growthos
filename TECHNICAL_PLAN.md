# GrowthOS — Technical Plan

**Last updated:** May 18, 2026
**Status:** All 14 build phases complete and deployed.

This document is the living technical reference for GrowthOS. It covers the full database schema, architecture, API surface, Workers, and remaining work. Update it whenever schemas change, workers are added, or major features ship.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Database Schema](#2-database-schema)
3. [API Surface](#3-api-surface)
4. [Cloudflare Workers](#4-cloudflare-workers)
5. [Cron Jobs](#5-cron-jobs)
6. [Build Phases — Completion Status](#6-build-phases--completion-status)
7. [Key Libraries & Patterns](#7-key-libraries--patterns)
8. [RBAC Permission Matrix](#8-rbac-permission-matrix)
9. [Automation Enrollment Flow](#9-automation-enrollment-flow)
10. [Known Debt & Next Steps](#10-known-debt--next-steps)

---

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│  Cloudflare Pages (growthos-eo1.pages.dev)              │
│  Next.js 15 App Router · TypeScript strict              │
│  TailwindCSS 3 · shadcn/ui · Framer Motion              │
│                                                          │
│  ├── /app/(auth)/           Google OAuth login          │
│  ├── /app/(public)/         Waitlist, subscribe, etc.   │
│  ├── /app/api/              REST + cron endpoints        │
│  └── /app/dashboard/        19 feature modules          │
└──────────────┬──────────────────────────────────────────┘
               │ D1 / KV / R2 bindings
┌──────────────▼──────────────────────────────────────────┐
│  Cloudflare Infrastructure                               │
│  ├── D1 (growthos-prod)    SQLite — 21 migrations        │
│  ├── R2 (growthos-media)   Object storage for media      │
│  ├── KV (sessions + cache) Auth sessions, counters       │
│  └── Queues                publish, media, swarm, signals│
└──────────────┬──────────────────────────────────────────┘
               │
┌──────────────▼──────────────────────────────────────────┐
│  Standalone Cloudflare Workers                           │
│  ├── growthos-publisher           (cron + queue consumer)│
│  └── growthos-automation-processor(cron)                 │
└─────────────────────────────────────────────────────────┘

External services:
  Anthropic Claude    — content gen, SEO, signals, swarm
  Resend              — transactional email + newsletters
  Stripe              — billing / subscriptions
  Replicate (Flux)    — AI image generation
  ElevenLabs          — TTS voice narration
  Creatomate          — video assembly
  Meta Graph API      — Facebook / Instagram publishing
  X API v2            — X (Twitter) publishing
  Reddit API          — Reddit publishing (pending)
  Reunion API         — Internal family platform bridge
```

---

## 2. Database Schema

**Database:** Cloudflare D1 (SQLite) · **ORM:** Drizzle (SQLite dialect)
**Schema file:** `src/lib/db/schema.ts` (1834 lines)
**Migrations:** `src/lib/db/migrations/` — 21 files (0000–0020)

### CRITICAL rules
- Every schema change requires **both** a new migration SQL file AND a matching update to `schema.ts`
- Column names must map exactly: `fieldName: text("field_name")` ↔ `field_name TEXT`
- Never rename or drop a column in prod without a compensating migration
- Apply migrations manually: `wrangler d1 execute growthos-prod --remote --file=./src/lib/db/migrations/XXXX_name.sql`

---

### Phase 1 — Foundation (migration 0000)

**users**
| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | cuid2 |
| email | TEXT UNIQUE NOT NULL | |
| name | TEXT NOT NULL | |
| avatar_url | TEXT | |
| google_id | TEXT UNIQUE | |
| created_at | INTEGER | timestamp |
| updated_at | INTEGER | timestamp |

**workspaces**
| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | cuid2 |
| name | TEXT NOT NULL | |
| slug | TEXT UNIQUE NOT NULL | used in public subscribe URLs |
| owner_id | TEXT FK→users | |
| stripe_customer_id | TEXT | |
| plan | TEXT | free \| pro \| enterprise |
| created_at | INTEGER | |

**workspace_members**
| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | |
| workspace_id | TEXT FK→workspaces CASCADE | |
| user_id | TEXT FK→users CASCADE | |
| role | TEXT | owner\|admin\|marketer\|analyst\|content_manager\|viewer |
| joined_at | INTEGER | |

**sessions** — audit/backup only; live sessions stored in KV
| Column | Type |
|--------|------|
| id | TEXT PK |
| user_id | TEXT FK→users |
| expires_at | INTEGER |
| created_at | INTEGER |

**audit_logs**
| Column | Type |
|--------|------|
| id | TEXT PK |
| workspace_id | TEXT |
| user_id | TEXT |
| action | TEXT |
| resource | TEXT |
| resource_id | TEXT |
| metadata | TEXT (JSON) |
| ip_address | TEXT |
| user_agent | TEXT |
| created_at | INTEGER |

---

### Phase 2 — Content + Media (migrations 0001–0004)

**brand_profiles** — one per workspace
| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | |
| workspace_id | TEXT FK→workspaces | |
| brand_name | TEXT NOT NULL | |
| tagline | TEXT | |
| mission | TEXT NOT NULL | |
| vision | TEXT | |
| tone | TEXT NOT NULL | |
| audience | TEXT (JSON) | audience segments |
| keywords | TEXT (JSON) | brand keywords |
| guidelines | TEXT | |

**brand_colors** — many per brand_profile
| Column | Type |
|--------|------|
| id | TEXT PK |
| brand_id | TEXT FK→brand_profiles |
| label | TEXT |
| hex | TEXT |
| usage | TEXT |

**brand_assets** — logos, fonts, templates stored in R2
| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | |
| brand_id | TEXT FK→brand_profiles | |
| type | TEXT | logo\|icon\|font\|template\|photo |
| name | TEXT | |
| r2_key | TEXT | R2 object key |
| mime_type | TEXT | |
| size_bytes | INTEGER | |

**doctrine_profiles** — 7 AI strategy modes (seeded, not per-workspace)
| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | |
| mode_key | TEXT UNIQUE | garyvee\|mrbeast\|hormozi\|brunson\|sethgodin\|dankennedy\|balanced |
| display_name | TEXT | |
| description | TEXT | |
| system_prompt | TEXT | injected into all AI generation calls |
| rules | TEXT (JSON) | content rules |
| platforms | TEXT (JSON) | platform-specific overrides |
| is_default | INTEGER (bool) | |

**content_projects** — groups content assets
| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | |
| workspace_id | TEXT FK | |
| title | TEXT | |
| description | TEXT | |
| platform | TEXT | facebook\|instagram\|x\|youtube\|reddit\|linkedin\|tiktok |
| project_status | TEXT | draft\|active\|archived |
| doctrine_mode | TEXT | which AI strategy mode to use |

**content_assets** — individual pieces of content
| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | |
| workspace_id | TEXT | |
| project_id | TEXT FK→content_projects | |
| asset_type | TEXT | post\|reel\|story\|thread\|article\|newsletter |
| title | TEXT | |
| body | TEXT | the content text |
| platform | TEXT | |
| media_url | TEXT | |
| media_r2_key | TEXT | |
| asset_status | TEXT | draft\|review\|approved\|published |
| ai_generated | INTEGER (bool) | |
| doctrine_mode | TEXT | |
| metadata | TEXT (JSON) | hashtags, alt text, etc. |

**voice_profiles** — ElevenLabs voice configurations
| Column | Type |
|--------|------|
| id | TEXT PK |
| workspace_id | TEXT |
| name | TEXT |
| eleven_labs_voice_id | TEXT |
| style | TEXT (JSON) |
| is_default | INTEGER (bool) |

**media_jobs** — async media generation queue tracking
| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | |
| workspace_id | TEXT | |
| job_type | TEXT | image\|video\|meme\|carousel\|voice |
| job_status | TEXT | pending\|processing\|completed\|failed |
| input_params | TEXT (JSON) | generation parameters |
| output_url | TEXT | R2 URL when done |
| error_message | TEXT | |
| replicate_prediction_id | TEXT | for polling |
| created_at | INTEGER | |
| completed_at | INTEGER | |

---

### Phase 3 — Publisher (migration 0005)

**connected_accounts** — OAuth tokens per platform per workspace
| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | |
| workspace_id | TEXT | |
| platform | TEXT | facebook\|instagram\|x\|youtube\|reddit |
| platform_account_id | TEXT | native platform user/page ID |
| account_name | TEXT | display name |
| access_token_encrypted | TEXT | AES-256 encrypted |
| refresh_token_encrypted | TEXT | |
| token_expires_at | INTEGER | unix seconds |
| account_status | TEXT | active\|expired\|revoked |
| scopes | TEXT (JSON) | granted OAuth scopes |
| metadata | TEXT (JSON) | page IDs, etc. |

**scheduled_posts**
| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | |
| workspace_id | TEXT | |
| content_asset_id | TEXT FK→content_assets | |
| connected_account_id | TEXT FK→connected_accounts | |
| platform | TEXT | |
| scheduled_for | INTEGER | unix ms |
| post_status | TEXT | draft\|queued\|publishing\|published\|failed |
| platform_post_id | TEXT | returned by platform after publish |
| platform_post_url | TEXT | |
| published_at | INTEGER | |
| retry_count | INTEGER | |
| error_message | TEXT | |
| metadata | TEXT (JSON) | platform-specific options |

---

### Phase 4 — SEO + Competitors (migrations 0006–0007)

**keywords**
| Column | Type |
|--------|------|
| id | TEXT PK |
| workspace_id | TEXT |
| keyword | TEXT |
| search_volume | INTEGER |
| difficulty | REAL |
| cpc | REAL |
| intent | TEXT (JSON) |
| is_tracked | INTEGER (bool) |
| position | INTEGER |
| aeo_optimized | INTEGER (bool) |

**pages** — AEO/SEO page builder
| Column | Type |
|--------|------|
| id | TEXT PK |
| workspace_id | TEXT |
| title | TEXT |
| slug | TEXT |
| meta_description | TEXT |
| content | TEXT |
| schema_markup | TEXT (JSON) |
| page_status | TEXT |
| target_keywords | TEXT (JSON) |

**competitors**
| Column | Type |
|--------|------|
| id | TEXT PK |
| workspace_id | TEXT |
| name | TEXT |
| domain | TEXT |
| description | TEXT |
| strengths | TEXT (JSON) |
| weaknesses | TEXT (JSON) |
| last_analyzed_at | INTEGER |

**competitor_posts**
| Column | Type |
|--------|------|
| id | TEXT PK |
| competitor_id | TEXT FK→competitors |
| platform | TEXT |
| content | TEXT |
| engagement | INTEGER |
| published_at | INTEGER |
| post_url | TEXT |

---

### Phase 5 — Analytics + Billing (migrations 0008–0009)

**post_metrics**
| Column | Type |
|--------|------|
| id | TEXT PK |
| workspace_id | TEXT |
| post_id | TEXT FK→scheduled_posts |
| platform | TEXT |
| impressions | INTEGER |
| reach | INTEGER |
| likes | INTEGER |
| comments | INTEGER |
| shares | INTEGER |
| clicks | INTEGER |
| recorded_at | INTEGER |

**subscriptions** — Stripe billing
| Column | Type |
|--------|------|
| id | TEXT PK |
| workspace_id | TEXT |
| stripe_subscription_id | TEXT UNIQUE |
| stripe_customer_id | TEXT |
| plan | TEXT |
| billing_status | TEXT |
| current_period_start | INTEGER |
| current_period_end | INTEGER |
| cancel_at_period_end | INTEGER (bool) |

**usage_records**
| Column | Type |
|--------|------|
| id | TEXT PK |
| workspace_id | TEXT |
| metric | TEXT |
| value | INTEGER |
| recorded_at | INTEGER |

---

### Phase 6 — Ads + Reunion (migrations 0010, 0016)

**ad_campaigns**
| Column | Type |
|--------|------|
| id | TEXT PK |
| workspace_id | TEXT |
| name | TEXT |
| platform | TEXT (facebook\|google\|x) |
| objective | TEXT |
| campaign_status | TEXT |
| budget | REAL |
| budget_type | TEXT (daily\|lifetime) |
| start_date | INTEGER |
| end_date | INTEGER |
| platform_campaign_id | TEXT |
| impressions | INTEGER |
| clicks | INTEGER |
| spend | REAL |
| conversions | INTEGER |

**ad_variants** — A/B copy variants per campaign
| Column | Type |
|--------|------|
| id | TEXT PK |
| campaign_id | TEXT FK→ad_campaigns |
| headline | TEXT |
| body | TEXT |
| cta | TEXT |
| is_winner | INTEGER (bool) |
| impressions | INTEGER |
| clicks | INTEGER |
| conversions | INTEGER |

**reunion_campaigns** — push campaigns to the Reunion family platform
| Column | Type |
|--------|------|
| id | TEXT PK |
| workspace_id | TEXT |
| title | TEXT |
| campaign_type | TEXT |
| target_audience | TEXT (JSON) |
| message | TEXT |
| campaign_status | TEXT |
| reunion_campaign_id | TEXT |
| sent_count | INTEGER |
| opened_count | INTEGER |

---

### Phase 7 — Community + Newsletter + Funnels (migrations 0011–0012)

**communities**
| Column | Type |
|--------|------|
| id | TEXT PK |
| workspace_id | TEXT |
| platform | TEXT |
| community_name | TEXT |
| community_url | TEXT |
| platform_group_id | TEXT |
| member_count | INTEGER |
| community_status | TEXT |
| last_synced_at | INTEGER |

**community_posts**
| Column | Type |
|--------|------|
| id | TEXT PK |
| community_id | TEXT FK→communities |
| workspace_id | TEXT |
| content | TEXT |
| platform_post_id | TEXT |
| post_status | TEXT |
| scheduled_for | INTEGER |
| published_at | INTEGER |
| likes | INTEGER |
| comments | INTEGER |

**community_members**
| Column | Type |
|--------|------|
| id | TEXT PK |
| community_id | TEXT FK→communities |
| workspace_id | TEXT |
| platform_member_id | TEXT |
| member_name | TEXT |
| joined_at | INTEGER |

**subscribers** — email list
| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | |
| workspace_id | TEXT | |
| email | TEXT | UNIQUE per workspace |
| name | TEXT | |
| tags | TEXT (JSON) | string array |
| source | TEXT | waitlist\|newsletter\|lead_magnet |
| subscriber_status | TEXT | active\|unsubscribed |
| lead_magnet_slug | TEXT | if acquired via lead magnet |
| subscribed_at | INTEGER | |
| unsubscribed_at | INTEGER | |

**newsletters**
| Column | Type |
|--------|------|
| id | TEXT PK |
| workspace_id | TEXT |
| subject | TEXT |
| body | TEXT (HTML) |
| newsletter_status | TEXT |
| sent_count | INTEGER |
| open_count | INTEGER |
| click_count | INTEGER |
| scheduled_for | INTEGER |
| sent_at | INTEGER |

**lead_magnets**
| Column | Type |
|--------|------|
| id | TEXT PK |
| workspace_id | TEXT |
| title | TEXT |
| slug | TEXT UNIQUE per workspace |
| description | TEXT |
| file_url | TEXT |
| file_r2_key | TEXT |
| downloads | INTEGER |
| is_active | INTEGER (bool) |

**automations** — drip campaign definitions
| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | |
| workspace_id | TEXT | |
| name | TEXT | |
| trigger_type | TEXT | subscribe\|lead_magnet\|tag_added\|manual |
| trigger_config | TEXT (JSON) | e.g. `{"slug":"my-guide"}` for lead_magnet |
| steps | TEXT (JSON) | array of AutomationStep objects |
| automation_status | TEXT | draft\|active\|paused |
| enrolled_count | INTEGER | |
| completed_count | INTEGER | |

**automation_enrollments** — per-subscriber progress tracker (migration 0020)
| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | |
| automation_id | TEXT FK→automations CASCADE | |
| subscriber_id | TEXT | |
| workspace_id | TEXT | |
| current_step | INTEGER | index into steps array |
| enrollment_status | TEXT | active\|completed\|failed\|cancelled |
| next_step_at | INTEGER (unix ms) | NULL = run immediately on next tick |
| enrolled_at | INTEGER | |
| completed_at | INTEGER | |
| error_message | TEXT | set on failure |
| UNIQUE | (automation_id, subscriber_id) | prevents double-enrollment |

**AutomationStep type union:**
```ts
{ type: "send_email"; subject: string; body: string; fromName?: string; fromEmail?: string }
{ type: "wait"; delayHours: number }
{ type: "add_tag"; tag: string }
```

---

### Phase 11 — Growth Swarm (migration 0014)

**swarm_agents** — 8 predefined agent types
| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | |
| workspace_id | TEXT | |
| agent_type | TEXT | strategist\|content\|video\|ads\|outreach\|analytics\|competitor\|founder_voice |
| agent_name | TEXT | |
| system_prompt | TEXT | |
| capabilities | TEXT (JSON) | |
| is_active | INTEGER (bool) | |

**swarm_missions** — autonomous multi-agent runs
| Column | Type |
|--------|------|
| id | TEXT PK |
| workspace_id | TEXT |
| title | TEXT |
| objective | TEXT |
| mission_status | TEXT |
| agent_results | TEXT (JSON) |
| artifacts | TEXT (JSON) |
| created_at | INTEGER |
| completed_at | INTEGER |

**swarm_tasks** — individual agent tasks within a mission
| Column | Type |
|--------|------|
| id | TEXT PK |
| mission_id | TEXT FK→swarm_missions |
| agent_id | TEXT FK→swarm_agents |
| task_type | TEXT |
| input_data | TEXT (JSON) |
| output_data | TEXT (JSON) |
| task_status | TEXT |
| started_at | INTEGER |
| completed_at | INTEGER |
| error_message | TEXT |

**swarm_logs**
| Column | Type |
|--------|------|
| id | TEXT PK |
| mission_id | TEXT FK→swarm_missions |
| agent_id | TEXT |
| log_level | TEXT |
| message | TEXT |
| metadata | TEXT (JSON) |
| logged_at | INTEGER |

---

### Phase 12 — Growth Optimization Engine (migration 0015)

**growth_experiments** — A/B tests
| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | |
| workspace_id | TEXT | |
| name | TEXT | |
| hypothesis | TEXT | |
| experiment_status | TEXT | draft\|running\|paused\|completed |
| statistical_method | TEXT | z_test\|chi_square\|bayesian\|thompson |
| min_sample_size | INTEGER | |
| confidence_threshold | REAL | e.g. 0.95 |
| auto_promote | INTEGER (bool) | |
| started_at | INTEGER | |
| ended_at | INTEGER | |

**growth_variants** — variants within an experiment
| Column | Type |
|--------|------|
| id | TEXT PK |
| experiment_id | TEXT FK→growth_experiments |
| name | TEXT |
| description | TEXT |
| traffic_weight | REAL |
| impressions | INTEGER |
| conversions | INTEGER |
| is_control | INTEGER (bool) |
| is_winner | INTEGER (bool) |

**growth_events** — individual conversion events
| Column | Type |
|--------|------|
| id | TEXT PK |
| experiment_id | TEXT |
| variant_id | TEXT |
| workspace_id | TEXT |
| event_type | TEXT |
| converted | INTEGER (bool) |
| session_id | TEXT |
| recorded_at | INTEGER |

**growth_results** — statistical analysis snapshots
| Column | Type |
|--------|------|
| id | TEXT PK |
| experiment_id | TEXT |
| variant_id | TEXT |
| p_value | REAL |
| confidence_interval_lower | REAL |
| confidence_interval_upper | REAL |
| effect_size | REAL |
| is_significant | INTEGER (bool) |
| computed_at | INTEGER |

**growth_insights** — compounding intelligence store
| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | |
| workspace_id | TEXT | |
| insight_type | TEXT | |
| insight | TEXT | natural language learning |
| confidence | REAL | |
| source | TEXT | experiment\|signal\|manual |
| tags | TEXT (JSON) | |
| applies_to | TEXT (JSON) | platforms/modules this applies to |
| created_at | INTEGER | |

**growth_audit_log**
| Column | Type |
|--------|------|
| id | TEXT PK |
| experiment_id | TEXT |
| action | TEXT |
| actor | TEXT |
| details | TEXT (JSON) |
| created_at | INTEGER |

---

### Phase 14 — Social Listening (migration 0019)

**listening_sources**
| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | |
| workspace_id | TEXT | |
| source_type | TEXT | reddit\|x\|google_news\|rss\|youtube\|forum |
| source_name | TEXT | |
| source_url | TEXT | |
| is_active | INTEGER (bool) | |
| last_scraped_at | INTEGER | |

**tracked_keywords**
| Column | Type |
|--------|------|
| id | TEXT PK |
| workspace_id | TEXT |
| keyword | TEXT |
| is_active | INTEGER (bool) |
| signal_count | INTEGER |
| last_seen_at | INTEGER |

**signals** — classified social listening hits
| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | |
| workspace_id | TEXT | |
| source_id | TEXT FK→listening_sources | |
| keyword_id | TEXT FK→tracked_keywords | |
| signal_type | TEXT | pain_point\|competitor_mention\|buying_intent\|feature_request\|... (10 types) |
| title | TEXT | |
| content | TEXT | |
| source_url | TEXT | |
| author | TEXT | |
| platform | TEXT | |
| sentiment | TEXT | positive\|neutral\|negative |
| relevance_score | REAL | AI-scored |
| engagement_score | INTEGER | |
| signal_status | TEXT | new\|reviewed\|actioned\|dismissed |
| ai_summary | TEXT | |
| ai_opportunities | TEXT (JSON) | |
| published_at | INTEGER | |
| discovered_at | INTEGER | |

**engagement_actions** — responses taken on signals
| Column | Type |
|--------|------|
| id | TEXT PK |
| signal_id | TEXT FK→signals |
| workspace_id | TEXT |
| action_type | TEXT |
| content | TEXT |
| action_status | TEXT |
| performed_at | INTEGER |

**signal_alerts**
| Column | Type |
|--------|------|
| id | TEXT PK |
| workspace_id | TEXT |
| keyword_id | TEXT |
| signal_id | TEXT |
| alert_type | TEXT |
| message | TEXT |
| is_read | INTEGER (bool) |
| created_at | INTEGER |

---

## 3. API Surface

### Public endpoints (no auth)
| Route | Method | Purpose |
|-------|--------|---------|
| `/api/subscribe` | POST | Email capture (waitlist, newsletter, lead magnet) |
| `/api/auth/login` | GET | Initiate Google OAuth |
| `/api/auth/callback/google` | GET | Google OAuth callback |
| `/api/social/callback/[platform]` | GET | Social platform OAuth callback |
| `/api/webhooks/stripe` | POST | Stripe billing webhooks |
| `/api/webhooks/reunion` | POST | Reunion API webhooks |

### Auth-gated API routes
| Route | Method | Purpose |
|-------|--------|---------|
| `/api/media/upload` | POST | Upload to R2, create media_jobs row |
| `/api/media/generate` | POST | Trigger Replicate/Creatomate generation |
| `/api/media/status/[jobId]` | GET | Poll media job status |
| `/api/social/connect/[platform]` | GET | Begin platform OAuth |
| `/api/social/disconnect/[platform]` | POST | Revoke token + delete account |

### Cron endpoints (invokable manually for testing)
| Route | Schedule | Purpose |
|-------|----------|---------|
| `/api/cron/publish` | Every minute (via publisher Worker) | Publish due scheduled posts |
| `/api/cron/automations` | Every minute (via automation-processor Worker) | Process automation enrollment steps |
| `/api/cron/metrics-sync` | Hourly | Sync post metrics from platforms |
| `/api/cron/ad-metrics-sync` | Every 2h | Sync ad campaign metrics |
| `/api/cron/swarm-overnight` | Daily 2am UTC | Run overnight AI swarm missions |
| `/api/cron/optimize-check` | Daily 3am UTC | Auto-promote winning A/B variants |
| `/api/cron/signal-scan` | Hourly | Scan listening sources for new signals |

### Server Actions (Next.js `"use server"`)
Each dashboard module has an `actions.ts` file. Key actions by module:

| Module | Key actions |
|--------|-------------|
| content | `generateContent`, `saveContent`, `listAssets` |
| publisher | `schedulePost`, `listScheduledPosts`, `updatePostStatus` |
| calendar | `getPostsByDateRange`, `reschedulePost`, `approvePost`, `deleteScheduledPost` |
| newsletter | `addSubscriber`, `sendNewsletter`, `listSubscribers` |
| automations | `createAutomation`, `updateAutomation`, `deleteAutomation`, `listAutomations` |
| analytics | `getPostMetrics`, `getSubscriberStats`, `getTopPosts` |
| ads | `createAdCampaign`, `generateAdCopy`, `markVariantWinner` |
| seo | `createKeyword`, `analyzePage`, `generateAEOContent` |
| competitors | `addCompetitor`, `analyzeCompetitor`, `generateContentOpportunity` |
| signals | `getSignals`, `dismissSignal`, `createEngagementAction` |
| experiments | `createExperiment`, `recordEvent`, `computeResults`, `promoteWinner` |
| swarm | `launchMission`, `getMissionStatus`, `listAgents` |
| team | `inviteMember`, `updateMemberRole`, `removeMember` |
| billing | `createCheckoutSession`, `createPortalSession`, `getSubscription` |

---

## 4. Cloudflare Workers

### growthos-publisher
- **Config:** `wrangler.publisher.toml`
- **Entry:** `src/workers/publisher.ts`
- **Deploy:** `npm run deploy:publisher`
- **Bindings:** DB, PUBLISH_QUEUE
- **Secrets:** ENCRYPTION_KEY (must match Pages value)
- **Cron:** `* * * * *` — scans `scheduled_posts` WHERE `post_status = 'queued' AND scheduled_for <= now`
- **Queue consumer:** `growthos-publish` — decrypts token, calls platform adapter, marks published/failed
- **Retry:** up to 3 attempts with exponential backoff (2m, 4m, 8m)
- **Token refresh:** X (Twitter) tokens auto-refreshed if expiring within 5 minutes

### growthos-automation-processor
- **Config:** `wrangler.automation-processor.toml`
- **Entry:** `src/workers/automation-processor.ts`
- **Deploy:** `npm run deploy:automation-processor`
- **Bindings:** DB
- **Secrets:** RESEND_API_KEY (must match Pages value)
- **Cron:** `* * * * *` — processes `automation_enrollments` WHERE `enrollment_status = 'active' AND (next_step_at IS NULL OR next_step_at <= now)`
- **Batch:** 50 enrollments per tick (JOIN with automations + subscribers in one query)
- **Step execution:**
  - `send_email` → Resend API, supports `{{name}}` merge tag
  - `wait` → sets `next_step_at = now + delayHours * 3600000`, advances `current_step`
  - `add_tag` → parses subscriber `tags` JSON, appends if not present
- **Completion:** last step → `enrollment_status = 'completed'`, `automations.completed_count++`
- **Error handling:** any exception → `enrollment_status = 'failed'`, `error_message` saved

---

## 5. Cron Jobs

| Trigger | Frequency | Handler | What it does |
|---------|-----------|---------|--------------|
| publisher Worker | every minute | `src/workers/publisher.ts` | Publishes due social posts |
| automation-processor Worker | every minute | `src/workers/automation-processor.ts` | Executes automation steps |
| `/api/cron/metrics-sync` | hourly | Next.js route | Fetches post metrics from platforms |
| `/api/cron/ad-metrics-sync` | every 2h | Next.js route | Fetches ad campaign metrics |
| `/api/cron/signal-scan` | hourly | Next.js route | Scans Reddit/X/RSS for signals |
| `/api/cron/swarm-overnight` | daily 2am | Next.js route | Autonomous AI swarm overnight run |
| `/api/cron/optimize-check` | daily 3am | Next.js route | Auto-promotes winning A/B variants |

---

## 6. Build Phases — Completion Status

| Phase | Description | Status |
|-------|-------------|--------|
| 1 | Foundation — Auth, schema, dashboard shell, mobile layout | ✅ Complete |
| 2 | Content + Media — Brand Vault, Doctrine Engine (7 modes), Content Studio | ✅ Complete |
| 3 | Publisher — Social OAuth, scheduling queue, platform adapters | ✅ Complete |
| 4 | SEO + Competitors — Keywords, AEO page builder, competitor tracking + AI | ✅ Complete |
| 5 | Analytics + Billing — Metrics sync, KPI dashboard, Stripe | ✅ Complete |
| 6 | Ads + Reunion — Ad campaign manager (Meta/Google/X), Reunion API bridge | ✅ Complete |
| 7 | Community + Newsletter + Funnels — Facebook Groups/Reddit/Discord, Resend, lead magnets, automations | ✅ Complete |
| 8 | Video + Voice — ElevenLabs TTS, Creatomate video, voice profiles | ✅ Complete |
| 9 | Automations + Calendar + Team — Drip campaign builder + cron processor, calendar views, RBAC | ✅ Complete |
| 10 | Testing + Deploy — Vitest (291 tests, 17 files), deploy checklist | ✅ Complete |
| 11 | Growth Swarm — 8-agent orchestration, mission management, overnight mode | ✅ Complete |
| 12 | Growth Optimization Engine — A/B testing (z-test, chi-square, Bayesian, Thompson Sampling), auto-promote | ✅ Complete |
| 13 | Media Pipeline — Replicate Flux, meme/carousel generators, Creatomate video, R2 | ✅ Complete |
| 14 | Social Listening — Reddit/X/RSS/YouTube/forums, AI signal classification (10 types), alerts | ✅ Complete |

**Post-phase work completed (May 2026):**
- Dashboard module rewrites — all 19 modules rebuilt with shadcn/ui design system
- Visual step builder for automations (replaces raw JSON textarea)
- Full automation enrollment pipeline wired end-to-end
- 291-test Vitest suite verified and all passing
- DEPLOY.md + HANDOFF.md brought up to date

---

## 7. Key Libraries & Patterns

### `safeAction` wrapper
All server actions use `safeAction()` from `src/lib/utils/safe-action.ts`. Returns a discriminated union:
```ts
type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; code: "VALIDATION" | "AUTH" | "FORBIDDEN" | "INTERNAL" }
```
Zod errors → `VALIDATION`, `AuthError` → `AUTH`, `PermissionError` → `FORBIDDEN`, generic → `INTERNAL`.

### `createDb`
```ts
import { createDb } from "@/lib/db/client";
const db = createDb(env.DB);
```
Returns a Drizzle instance. Used in all Next.js server actions and route handlers. **Never use in standalone Workers** — use raw D1 SQL (`env.DB.prepare().bind().all()`) instead.

### Auth middleware
`src/lib/auth/middleware.ts` — `requireAuth()` gets the current session, `requirePermission(action)` checks RBAC. All server actions call one of these at the top.

### Doctrine Engine
`src/lib/ai/doctrine.ts` — `generateWithDoctrine(mode, prompt)` wraps Claude with the selected strategy persona's system prompt. Used by all content generation actions.

### `generateWithClaude`
`src/lib/ai/claude.ts` — raw Claude wrapper. **Always mock this in Vitest tests** with `vi.mock("@/lib/ai/claude")` — it makes real API calls with real latency.

### Encryption
`src/lib/utils/crypto.ts` — `encrypt(plaintext, key)` / `decrypt(ciphertext, key)`. AES-256-GCM. Used for OAuth tokens. `ENCRYPTION_KEY` must be identical across Pages and publisher Worker.

### Workers pattern
Standalone Workers use raw D1 SQL only (no Drizzle, no Next.js imports):
```ts
const { results } = await env.DB.prepare(`SELECT ... WHERE x = ?`).bind(value).all<RowType>();
await env.DB.prepare(`UPDATE ... SET col = ? WHERE id = ?`).bind(val, id).run();
```

---

## 8. RBAC Permission Matrix

6 roles: `owner`, `admin`, `marketer`, `analyst`, `content_manager`, `viewer`

| Permission | owner | admin | marketer | analyst | content_manager | viewer |
|------------|-------|-------|----------|---------|-----------------|--------|
| content:read | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| content:write | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ |
| publish:write | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| publish:queue | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| publish:approve | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| analytics:read | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| analytics:write | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| team:read | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| team:write | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| billing:read | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| billing:write | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| settings:write | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| swarm:read | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| swarm:launch | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| swarm:admin | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| experiments:read | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| experiments:write | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| experiments:admin | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| signals:read | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| signals:write | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| signals:admin | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |

**Owner total:** 21 permissions. **Viewer total:** 5 permissions (all `:read` variants).

---

## 9. Automation Enrollment Flow

```
User submits form on /waitlist, /subscribe, or /lead-magnet/[slug]
        │
        ▼
POST /api/subscribe
  ├─ Validate with Zod
  ├─ Find workspace by slug
  ├─ Check duplicate (reactivate if unsubscribed)
  ├─ Resolve lead magnet → get fileUrl for download
  ├─ INSERT into subscribers (tags: [source, "lm:slug"])
  ├─ KV: increment subscribers_count:{workspaceId}
  └─ enrollSubscriber() — fire-and-forget, never blocks response
        │
        ▼
src/lib/automations/enroll.ts
  ├─ Query automations WHERE workspace_id = ? AND status = 'active' AND trigger_type = ?
  ├─ For lead_magnet: filter by triggerConfig.slug if set
  └─ For each match:
       ├─ INSERT automation_enrollments (current_step=0, next_step_at=NULL)
       ├─ UNIQUE constraint silently prevents double-enrollment
       └─ UPDATE automations SET enrolled_count++
        │
        ▼ (within 60 seconds)
growthos-automation-processor Worker (cron * * * * *)
  ├─ SELECT ae.*, a.steps, s.email, s.name, s.tags
  │    FROM automation_enrollments ae
  │    JOIN automations a ON ae.automation_id = a.id
  │    JOIN subscribers s ON ae.subscriber_id = s.id
  │    WHERE enrollment_status='active' AND (next_step_at IS NULL OR next_step_at <= now)
  │    LIMIT 50
  │
  ├─ For each enrollment:
  │    ├─ Parse a.steps JSON → AutomationStep[]
  │    ├─ Get step at current_step index
  │    │
  │    ├─ send_email → Resend API ({{name}} merge tag, fromEmail fallback)
  │    │    └─ advance current_step, next_step_at = NULL
  │    │
  │    ├─ wait → next_step_at = now + delayHours * 3600000
  │    │    └─ advance current_step (points to step after the wait)
  │    │
  │    ├─ add_tag → parse subscriber.tags JSON, append if missing
  │    │    └─ advance current_step, next_step_at = NULL
  │    │
  │    ├─ Last step → enrollment_status='completed', completed_at=now
  │    │              automations.completed_count++
  │    │
  │    └─ Any exception → enrollment_status='failed', error_message saved
  │
  └─ (repeat every minute)
```

---

## 10. Known Debt & Next Steps

### Immediate priorities
1. **End-to-end automation test** — create automation, subscribe a test email, verify Resend delivers within 60s
2. **End-to-end publish test** — schedule a post to X, approve it, verify it publishes within 60s
3. **Creatomate templates** — create in Creatomate dashboard, add IDs to `wrangler.toml [vars]`, redeploy

### Pending external dependencies
| Item | Blocker | Action needed |
|------|---------|---------------|
| Reddit publishing | App under review | Add `REDDIT_CLIENT_ID` + `REDDIT_CLIENT_SECRET` when approved |
| Instagram publishing | Meta App review | Auto-activates when `publish_to_groups` permission is granted |
| Facebook Groups publishing | Meta App review | DB marks published but API call skipped until permission granted |
| Creatomate video | Template IDs missing | Create templates in Creatomate dashboard |

### Technical debt
| Item | Risk | Notes |
|------|------|-------|
| No CI/CD | Low | Manual deploys only. `.github/workflows/` removed (PAT missing `workflow` scope) |
| `fix-manifests.js` | Low | Purpose: patches Next.js manifest for Cloudflare Pages compat. Works reliably |
| Automation emails: no unsubscribe footer | Medium | Fine for early testing; add footer injection before scaling |
| Growth Swarm untested vs live data | Medium | Fully coded; needs a live mission run to validate |
| Social Listening untested vs live data | Medium | Fully coded; needs live signal scan to validate |
| `growthos-v2` duplicate Pages project | Low | Safe to delete in Cloudflare dashboard |
| Mobile device testing | Medium | Design is mobile-first but no real-device testing done |
