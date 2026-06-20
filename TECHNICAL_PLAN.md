# GrowthOS — Technical Plan

**Last updated:** June 11, 2026
**Status:** Original 14 build phases complete + new modules (Influencers, Pinterest, JV Marketing, D-ID Avatar Video, Instagram Carousel). Video pipeline now fully live end-to-end with B-roll, synced captions, and cinematic motion. Operating under revised council-reviewed architecture: 6 master phases + 3 cross-cutting systems. Autonomy is earned, not assumed.

**Infrastructure note:** Cloudflare **Workers Paid** plan is now active (subrequest limit 50 → 1,000), which unblocks multi-image B-roll generation in the media-gen worker.

---

## 📋 Recent Changes — June 2026 Session

Video pipeline hardening + multi-format publishing. All deployed to production.

**Media / Video pipeline:**
- **B-roll enabled** — `media-gen` worker now generates 3–5 cinematic Flux images per video (was stubbed out on free tier). Uses Claude's purpose-built `imagePrompts` from the script (not naive sentence-chopping) for on-topic, cohesive visuals. Wrapped in try/catch → degrades to solid background on failure.
- **Replicate rate-limit handling** — image creates are now sequential with 429 retry (respects `retry_after`). Accounts under $5 credit are throttled to 6 req/min, burst 1.
- **Captions fixed** — caption element's `transcript_source: "audio"` now resolves because the audio element has `name: "audio"`. Synced word captions render; previously text was static.
- **Cinematic motion** — alternating Ken Burns (zoom in/out, off-center anchors) + crossfades between shots; heavy 55% green overlay reduced to 22% + caption band only.
- **Inline video player** — Play button opens an in-page `<video>` modal instead of navigating to the raw `/api/media/serve` endpoint (which returned JSON on any 404/auth hiccup).
- **HTTP Range support** in `/api/media/serve/[...key]` — returns 206 partial content so `<video>` plays on first click (no refresh needed).
- **14 ElevenLabs voice presets** (was 6) — added current default-library voices.
- **AI caption** — `generateVideoCaption` server action pre-fills the schedule modal caption via Claude.
- **datetime picker visibility** — `color-scheme: dark` so the native calendar icon shows on dark UI.

**Publishing / OAuth:**
- **Facebook New Pages Experience fix** — added `business_management` scope so NPE pages appear in `/me/accounts`. Symptom was a personal profile ID being stored instead of the Page ID. Data hygiene: reconnects can leave duplicate `connected_accounts` rows; the Settings UI lists all rows, so prune revoked duplicates (repoint `scheduled_posts` + `communities` FKs first — see Schema notes).
- **Instagram Carousel** publishing (`CAROUSEL_ALBUM`) via `publishInstagramCarousel` in adapters.
- **D-ID avatar video** client (`src/lib/video/did-client.ts`) — talking-head videos; `avatar_video` job type.
- **Migration 0028** — added `carousel`, `avatar_video` to media_jobs type enum and `did` to provider enum.

---

## ⚠️ Core Engineering Principle

> **"Build a controlled, observable, progressively autonomous growth system."**
>
> Every phase increases autonomy **only after stability is proven**. The system that works in demos but fails in production is the system built backwards. Follow the phase order.

---

## Table of Contents

1. [System Architecture — Final Target State](#1-system-architecture--final-target-state)
2. [Master Build Phases](#2-master-build-phases)
3. [Cross-Cutting Systems](#3-cross-cutting-systems)
4. [Phase vs. Original Build Mapping](#4-phase-vs-original-build-mapping)
5. [Database Schema](#5-database-schema)
6. [Cloudflare Workers](#6-cloudflare-workers)
7. [API Surface](#7-api-surface)
8. [Cron Jobs](#8-cron-jobs)
9. [Key Libraries & Patterns](#9-key-libraries--patterns)
10. [RBAC Permission Matrix](#10-rbac-permission-matrix)
11. [Automation Enrollment Flow](#11-automation-enrollment-flow)
12. [Known Gaps & Next Build Targets](#12-known-gaps--next-build-targets)

---

## 1. System Architecture — Final Target State

GrowthOS becomes **6 interconnected systems** plus **3 cross-cutting systems**:

### Core Systems
| # | System | Role |
|---|--------|------|
| 1 | **Signal Intelligence** | Discover where audiences live and what they care about |
| 2 | **Content Intelligence** | Generate platform-native, doctrine-driven content with performance feedback |
| 3 | **Distribution** | Publish + Influencers — get the content in front of the right people |
| 4 | **Conversion** | Capture + Funnels — turn attention into leads and revenue |
| 5 | **Learning** | A/B testing + Insight Moat — make every cycle smarter |
| 6 | **Swarm Orchestration** | Autonomy layer — tie all 5 systems into a self-running loop |

### Cross-Cutting Systems
| System | Purpose |
|--------|---------|
| **Identity & Trust Layer** | Prevent platform bans, simulate human-like behavior patterns |
| **Observability Layer** | Trace every event, enable full system replay, debug "why did this happen?" |
| **Risk & Control Layer** | Budget enforcement, kill switches, risk scoring, approval gates |

### Infrastructure

```
┌─────────────────────────────────────────────────────────────┐
│  Cloudflare Pages (growthos-eo1.pages.dev)                  │
│  Next.js 15 App Router · TypeScript strict                  │
│  TailwindCSS 3 · shadcn/ui · Framer Motion                  │
│                                                              │
│  ├── /app/(auth)/           Google OAuth login               │
│  ├── /app/(public)/         Waitlist, subscribe, etc.        │
│  ├── /app/api/              REST + cron endpoints            │
│  └── /app/dashboard/        20 feature modules              │
└──────────────┬──────────────────────────────────────────────┘
               │ D1 / KV / R2 / Queue bindings
┌──────────────▼──────────────────────────────────────────────┐
│  Cloudflare Infrastructure                                   │
│  ├── D1 (growthos-prod)    SQLite — 27 migrations            │
│  ├── R2 (growthos-media)   Object storage for media          │
│  ├── KV (sessions + cache) Auth sessions, counters, state    │
│  └── Queues                publish · media · swarm · signals │
└──────────────┬──────────────────────────────────────────────┘
               │
┌──────────────▼──────────────────────────────────────────────┐
│  Standalone Cloudflare Workers                               │
│  ├── growthos-publisher            (cron + queue consumer)   │
│  ├── growthos-automation-processor (cron)                    │
│  └── growthos-token-refresher      (cron hourly)             │
└─────────────────────────────────────────────────────────────┘

External services:
  Anthropic Claude     — content gen, signals, SEO, swarm AI
  Resend               — transactional email + newsletters
  Stripe               — billing / subscriptions
  Replicate (Flux)     — AI image generation (schnell + 1.1-pro)
  ElevenLabs           — TTS voice narration
  Creatomate           — video assembly + rendering
  Meta Graph API       — Facebook / Instagram / Threads publishing
  X API v2             — X (Twitter) publishing
  LinkedIn API v2      — LinkedIn publishing
  Reddit API           — Reddit signals + manual publishing (Reunion only; brand posting manual by strategy)
  Pinterest API v5     — Pinterest publishing (Trial access active ✅; PINTEREST_CLIENT_ID/SECRET set)
  Social Cat           — Influencer discovery (manual import, no API)
  Reunion API          — Internal family platform bridge
```

---

## 2. Master Build Phases

### Phase 1 — Foundation & Control Plane ✅ COMPLETE (with gaps)
**Goal:** Non-autonomous but fully instrumented. Everything traceable.

| Component | Status | Notes |
|-----------|--------|-------|
| Cloudflare Workers (modular) | ✅ | Publisher, automation-processor, token-refresher |
| D1 schema (normalized) | ✅ | 27 migrations |
| Queue system | ✅ | publish + media + swarm + signals queues |
| KV store (state + OAuth + session) | ✅ | |
| OAuth + Token Vault (AES-256-GCM) | ✅ | All platforms implemented |
| Token refresh simulation mode | ❌ | **GAP** — needs dev mode flag |
| Platform adapter interface (standardized) | ⚠️ | Adapters exist; `validate/transform/publish/handleResponse` interface not yet formalized |
| `event_log` table (unified event schema) | ❌ | **CRITICAL GAP** — `audit_logs` exists but not the full unified event schema |
| Manual-mode-only publisher | ✅ | Approval gates enforced |

**Phase 1 Exit Criteria:**
- ✅ Every token is traceable
- ✅ Every post is manually triggered
- ❌ Every event logged with unified schema (pending `event_log` migration)
- ❌ Full system replay possible from logs (pending Observability Layer)

**Required next work:**
```sql
-- Migration 0025 (pending)
CREATE TABLE IF NOT EXISTS event_log (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  trace_id TEXT,                    -- cross-service correlation
  type TEXT NOT NULL,               -- signal.detected | content.generated | post.scheduled | post.published | error
  source TEXT NOT NULL,             -- reddit | x | linkedin | system | user
  actor_id TEXT,                    -- user_id if human-initiated
  resource_type TEXT,               -- post | signal | campaign | automation
  resource_id TEXT,
  payload TEXT NOT NULL DEFAULT '{}', -- JSON
  severity TEXT NOT NULL DEFAULT 'info', -- info | warn | error | critical
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX idx_event_log_workspace ON event_log(workspace_id, created_at DESC);
CREATE INDEX idx_event_log_trace ON event_log(trace_id);
CREATE INDEX idx_event_log_type ON event_log(type, created_at DESC);
```

---

### Phase 2 — Intelligence Layer ✅ COMPLETE (with gaps)
**Goal:** Decision-making assistant, not an autopilot.

| Component | Status | Notes |
|-----------|--------|-------|
| Reddit/X/RSS ingestion workers | ✅ | Signal scan cron live |
| Scoring engine (relevance + intent + engagement + recency) | ✅ | `priority_score` in signals table |
| Ranked opportunity feed | ✅ | Signals dashboard with filters |
| Brand Identity Vault (Layer 1) | ✅ | `brand_profiles` + Brand Vault UI |
| Doctrine Mode Engine (Layer 2) | ✅ | 7 modes: GaryVee, MrBeast, Hormozi, Brunson, Godin, Kennedy, Balanced |
| Platform Constraint Engine (Layer 3) | ✅ | Full per-platform constraint blocks in `doctrine.ts` |
| Content Type Formatter (Layer 4) | ✅ | 16 content types |
| **Performance Feedback Injection Layer** | ❌ | **GAP** — content generation doesn't yet include past performance embeddings or historical CTR signals |
| Content versioning (`content_id` + `variant_id` + `prompt_hash`) | ⚠️ | `content_assets` tracks `ai_generated` + `doctrine_mode` but no formal `variant_id` or `prompt_hash` |

**Phase 2 Exit Criteria:**
- ✅ System generates platform-native content
- ✅ Signals produce ranked opportunities
- ⚠️ Content is versioned (partial — needs `variant_id` + `prompt_hash` columns)
- ❌ Performance feedback injection into generation prompts (pending)

---

### Phase 3 — Distribution Engine ✅ COMPLETE (with gaps)
**Goal:** Multi-platform publishing machine.

| Component | Status | Notes |
|-----------|--------|-------|
| Queue-based publishing worker | ✅ | `growthos-publisher` Worker |
| Platform adapters (X, LinkedIn, Instagram, Threads, Facebook) | ✅ | All 5 implemented |
| Pinterest adapter (v5 API) | ✅ | `src/lib/publishers/pinterest.ts` — createPin, createBoard, listBoards, analytics |
| Pinterest Board Picker | ✅ | Publisher dashboard shows boards by name; boardId injected into metadata |
| Pinterest "Create All 12 Boards" | ✅ | One-click action creates Reunion's full 12-board content strategy |
| Facebook Groups publishing | ✅ | Communities dashboard wired to real Graph API; `publish_to_groups` scope |
| Scheduling system (`scheduled_posts` table) | ✅ | 1-minute cron resolution |
| Retry + DLQ logic | ✅ | 3 retries, dead-letter queue |
| Influencer distribution layer | ✅ | Influencer CRM + campaign management (migration 0024) |
| JV Marketing / Partner Attribution | ✅ | 8-table schema, edge redirect, quality scoring (migration 0026) |
| Failure classification (auth / rate limit / payload / outage) | ⚠️ | Error stored as text; **needs structured classification enum** |
| Formal platform adapter interface | ❌ | **GAP** — implement `validate()`, `transform()`, `publish()`, `handleResponse()` interface formally |

**Token refresh status per platform:**
| Platform | Token Lifespan | Refresh Method | Status |
|----------|---------------|----------------|--------|
| X | 2 hours | OAuth 2.0 refresh | ✅ |
| Facebook | ~60 days | fb_exchange_token | ✅ |
| Instagram | ~60 days | ig_refresh_token | ✅ |
| Threads | ~60 days | th_refresh_token | ✅ |
| LinkedIn | 60 days | OAuth 2.0 refresh | ✅ |
| Pinterest | Long-lived | Manual re-auth | ✅ |

**Phase 3 Exit Criteria:**
- ✅ Reliable multi-platform publishing
- ✅ Scheduling stable
- ✅ Pinterest live (Trial access approved, secrets set)
- ✅ Facebook Groups publishing live
- ⚠️ Failures classified (text errors exist; structured enum pending)

---

### Phase 4 — Learning System ✅ COMPLETE (with gaps)
**Goal:** Self-improving system.

| Component | Status | Notes |
|-----------|--------|-------|
| A/B testing framework (GOE) | ✅ | z-test, chi-square, Bayesian, Thompson Sampling |
| Multi-armed bandit (Thompson Sampling) | ✅ | Implemented as optional upgrade |
| Hook performance tracking | ✅ | Via `growth_variants` + `growth_events` |
| Platform performance tracking | ✅ | |
| Doctrine performance tracking | ✅ | |
| Insight Moat (`growth_insights` table) | ✅ | `insight`, `confidence`, `source_campaign`, `lift_score`, `tags` |
| Auto-optimization suggestions | ✅ | System recommends winners |
| Auto-promotion (safe mode — suggest only) | ✅ | `auto_promote` flag, requires human confirmation at Phase 4 |

**Phase 4 Exit Criteria:**
- ✅ System learns from campaigns
- ✅ Insights accumulate in Insight Moat
- ✅ Recommendations generated
- ✅ Does NOT auto-promote without human approval (correct for Phase 4)

---

### Phase 5 — Swarm Orchestration (Controlled Autonomy) ⚠️ PARTIAL
**Goal:** Autonomy with strict guardrails.

| Component | Status | Notes |
|-----------|--------|-------|
| Swarm controller (task dispatcher) | ✅ | 8 agent types, mission management |
| Signal → content → publish chain | ✅ | Swarm agents can execute this chain |
| Budget check before action | ❌ | **CRITICAL GAP** |
| Risk scoring per action | ❌ | **CRITICAL GAP** |
| Approval threshold system | ⚠️ | `post_status = 'approved'` exists; no formal risk-gated flow |
| **Risk Engine** | ❌ | **NOT BUILT** |
| **Budget Engine** | ❌ | **NOT BUILT** |
| Posts-per-day hard limits | ❌ | **NOT BUILT** |
| API calls per platform caps | ❌ | **NOT BUILT** |
| Influencer outreach caps | ❌ | **NOT BUILT** |

**Risk Engine (to be built):**
```
risk_score =
  platform_sensitivity_weight    // reddit=10, x=7, linkedin=5, instagram=4
  + automation_level_weight      // swarm-initiated=8, scheduled=4, manual=0
  + historical_fail_rate_weight  // from event_log failure rate last 7d
  + account_trust_level_weight   // new=10, <30d=7, >90d=3

Rules:
  risk_score >= 15 → requires human approval before execution
  risk_score 8-14  → delayed execution (4h hold) + notification
  risk_score < 8   → auto-allowed
```

**Budget Engine (to be built):**
```sql
-- Migration 0026 (pending)
CREATE TABLE IF NOT EXISTS workspace_limits (
  workspace_id TEXT PRIMARY KEY,
  posts_per_day_max INTEGER DEFAULT 20,
  posts_today INTEGER DEFAULT 0,
  posts_reset_at INTEGER,           -- midnight UTC unix seconds
  api_calls_per_platform TEXT DEFAULT '{}', -- JSON: {x: 100, instagram: 50}
  influencer_outreach_per_day INTEGER DEFAULT 10,
  swarm_tasks_per_day INTEGER DEFAULT 50,
  budget_hard_cap_cents INTEGER DEFAULT 0,  -- 0 = no cap
  updated_at INTEGER
);
```

**Phase 5 Exit Criteria:**
- ❌ Risk Engine built and gating Swarm actions
- ❌ Budget Engine enforcing hard limits
- ⚠️ Partial autonomy via Swarm (unguarded — unsafe for production autonomous mode)
- ❌ High-impact actions require human approval via risk gate

---

### Phase 6 — Full Autonomous Growth Loop ❌ NOT YET
**Goal:** Only after Phase 5 is hardened.

The full loop:
```
Signals → Content → Publish → Measure → Learn → Optimize → Signals
```

| Component | Status |
|-----------|--------|
| Closed-loop signal-to-publish chain | ❌ |
| Auto-generate campaigns from signals | ❌ |
| Auto-publish low-risk content | ❌ |
| Doctrine self-selection (learns when GaryVee vs Hormozi works) | ❌ |
| Cross-brand portfolio intelligence sharing | ❌ |

**Autonomy boundaries (permanent — even in Phase 6):**
- ✅ CAN: generate campaigns, publish low-risk content, adjust strategy suggestions, run A/B tests
- 🚫 CANNOT: override budget caps, spam communities, bypass approval gates, auto-spend beyond hard caps

**Phase 6 Exit Criteria:**
- All Phase 5 guardrails proven stable for 30+ days
- Closed-loop operational
- Autonomous but constrained
- Continuous learning active

---

## 3. Cross-Cutting Systems

These are built progressively across all phases, not in one sprint.

### 3.1 Observability Layer — ⚠️ PARTIAL

| Feature | Status |
|---------|--------|
| `swarm_logs` table | ✅ |
| `audit_logs` table | ✅ |
| `growth_audit_log` table | ✅ |
| `event_log` unified schema | ❌ **Not yet built** |
| `trace_id` propagated across services | ❌ |
| Replayable event history UI | ❌ |
| Debug UI ("why did this post happen?") | ❌ |

**Target state:** Every Worker, every server action, every cron job emits an event to `event_log` with a `trace_id`. A debugging panel in the dashboard shows the full causal chain for any post: signal detected → content generated → post scheduled → post published. Answer "why did this happen?" in under 10 seconds.

### 3.2 Identity & Trust Layer — ❌ NOT BUILT

Prevents platform bans and spam detection. Critical before Phase 6 autonomous publishing.

**Required additions:**
```ts
interface PostingBehaviorConfig {
  // Randomize exact posting time within a window
  scheduleJitter: { minMinutes: number; maxMinutes: number }; // e.g. ±15min
  // Vary post frequency so it doesn't look like a bot pattern
  dailyVariance: number; // % variance in post count day-to-day
  // Platform-specific cadence limits
  minHoursBetweenPosts: Record<Platform, number>;
  // Human-like delays before consecutive actions
  actionDelayMs: { min: number; max: number };
  // Avoid posting at exactly :00 or :30 — too robotic
  avoidRoundMinutes: boolean;
}
```

Per-platform safety limits (never exceed):
| Platform | Max posts/day | Min gap between posts |
|----------|--------------|----------------------|
| X | 10 | 2 hours |
| Instagram | 3 | 4 hours |
| Facebook | 2 | 6 hours |
| LinkedIn | 1 | 24 hours |
| Threads | 5 | 2 hours |
| Reddit | 2 | 8 hours (Reunion only, manual approval) |

### 3.3 Risk & Control Layer (Kill Switches) — ❌ NOT BUILT

Global controls required:
```
KILL SWITCH HIERARCHY:
  🔴 Pause Swarm (all autonomous actions halted)
  🔴 Pause Platform (e.g., pause all X publishing)
  🟡 Pause Campaign (specific campaign suspended)
  🟡 Pause Workspace (emergency stop for one tenant)
  🟢 Rollback last N actions (revert recent auto-publishes)
```

```sql
-- Migration 0027 (pending)
CREATE TABLE IF NOT EXISTS kill_switches (
  id TEXT PRIMARY KEY,
  workspace_id TEXT,          -- NULL = global kill
  scope TEXT NOT NULL,        -- 'global' | 'swarm' | 'platform' | 'campaign' | 'workspace'
  scope_id TEXT,              -- platform name, campaign_id, etc.
  reason TEXT,
  activated_by TEXT,          -- user_id
  activated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  deactivated_at INTEGER
);
```

---

## 4. Phase vs. Original Build Mapping

The original 14-phase build maps to the council-reviewed 6-phase framework as follows:

| Original Phase | Description | Master Phase |
|---------------|-------------|--------------|
| 1 | Foundation — Auth, schema, shell | Phase 1 |
| 2 | Content + Media — Brand Vault, Doctrine Engine | Phase 2 |
| 3 | Publisher — OAuth, scheduling, adapters | Phase 3 |
| 4 | SEO + Competitors | Phase 2 (intelligence) |
| 5 | Analytics + Billing | Phase 4 (learning) |
| 6 | Ads + Reunion | Phase 3 (distribution) |
| 7 | Community + Newsletter + Funnels | Phase 4 (conversion) |
| 8 | Video + Voice | Phase 2/3 (content + distribution) |
| 9 | Automations + Calendar + Team | Phase 4 |
| 10 | Testing + Deploy | Phase 1 (control plane) |
| 11 | Growth Swarm | Phase 5 (partial — no guardrails yet) |
| 12 | Growth Optimization Engine | Phase 4 |
| 13 | Media Pipeline | Phase 2/3 |
| 14 | Social Listening | Phase 2 (intelligence) |
| New: Influencer Module | Influencer CRM + campaigns | Phase 3 (distribution) |

**Summary:** Phases 1–4 of the council framework are substantially complete. Phase 5 (controlled autonomy) is partially built (Swarm exists) but **missing the guardrails that make it safe** (Risk Engine, Budget Engine, Kill Switches). Phase 6 has not started.

---

## 5. Database Schema

**Database:** Cloudflare D1 (SQLite) · **ORM:** Drizzle (SQLite dialect)
**Schema file:** `src/lib/db/schema.ts`
**Migrations:** `src/lib/db/migrations/` — 27 files (0000–0026)

### Critical rules
- Every schema change requires **both** a new migration SQL file AND a matching update to `schema.ts`
- Column names must map exactly: `fieldName: text("field_name")` ↔ `field_name TEXT`
- Never rename or drop a column without a compensating migration
- Apply: `wrangler d1 execute growthos-prod --remote --file=./src/lib/db/migrations/XXXX_name.sql`

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

**brand_assets** — logos, fonts, templates stored in R2

**doctrine_profiles** — 7 AI strategy modes (garyvee, mrbeast, hormozi, brunson, sethgodin, dankennedy, balanced)

**content_projects** — groups content assets

**content_assets** — individual pieces of content
| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | |
| workspace_id | TEXT | |
| project_id | TEXT FK→content_projects | |
| asset_type | TEXT | post\|reel\|story\|thread\|article\|newsletter |
| body | TEXT | content text |
| platform | TEXT | |
| asset_status | TEXT | draft\|review\|approved\|published |
| ai_generated | INTEGER (bool) | |
| doctrine_mode | TEXT | |
| metadata | TEXT (JSON) | hashtags, alt text, etc. |

> **Pending addition (Phase 2 gap):** `variant_id TEXT`, `prompt_hash TEXT` columns to enable content versioning for A/B learning.

**voice_profiles** — ElevenLabs voice configurations

**media_jobs** — async media generation queue tracking
| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | |
| workspace_id | TEXT | |
| job_type | TEXT | image\|video\|meme\|carousel\|voice\|video_composite |
| job_status | TEXT | pending\|processing\|completed\|failed |
| input_params | TEXT (JSON) | |
| output_url | TEXT | R2 URL when done |
| error_message | TEXT | |
| replicate_prediction_id | TEXT | for polling |

---

### Phase 3 — Publisher (migration 0005)

**connected_accounts** — OAuth tokens per platform per workspace
| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | |
| workspace_id | TEXT | |
| platform | TEXT | facebook\|instagram\|threads\|x\|youtube\|reddit\|linkedin\|pinterest |
| platform_account_id | TEXT | native platform user/page ID (critical for publishing) |
| account_name | TEXT | display name |
| access_token_encrypted | TEXT | AES-256-GCM encrypted |
| refresh_token_encrypted | TEXT | nullable |
| token_expires_at | INTEGER | unix seconds; monitored by token-refresher Worker |
| account_status | TEXT | active\|expired\|revoked\|error |
| scopes | TEXT (JSON) | granted OAuth scopes |

**scheduled_posts**
| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | |
| workspace_id | TEXT | |
| content_asset_id | TEXT FK→content_assets | |
| connected_account_id | TEXT FK→connected_accounts | |
| platform | TEXT | |
| scheduled_for | INTEGER | unix ms |
| post_status | TEXT | draft\|queued\|approved\|publishing\|published\|failed |
| platform_post_id | TEXT | returned by platform after publish |
| platform_post_url | TEXT | |
| published_at | INTEGER | |
| retry_count | INTEGER | |
| error_message | TEXT | |
| metadata | TEXT (JSON) | _platformAccountId + platform-specific options |

---

### Phase 4 — SEO + Competitors (migrations 0006–0007)

**keywords**, **pages** (AEO/SEO page builder), **competitors**, **competitor_posts** — full schema in schema.ts

---

### Phase 5 — Analytics + Billing (migrations 0008–0009)

**post_metrics**, **subscriptions** (Stripe), **usage_records** — full schema in schema.ts

---

### Phase 6 — Ads + Reunion (migrations 0010, 0016)

**ad_campaigns**, **ad_variants**, **reunion_campaigns** — full schema in schema.ts

---

### Phase 7 — Community + Newsletter + Funnels (migrations 0011–0012)

**communities**, **community_posts**, **community_members**, **subscribers**, **newsletters**, **lead_magnets**, **automations**, **automation_enrollments** (migration 0020) — full schema in schema.ts

---

### Phase 11 — Growth Swarm (migration 0014)

**swarm_agents** — 8 predefined agent types (strategist, content, video, ads, outreach, analytics, competitor, founder_voice)

**swarm_missions** — autonomous multi-agent runs

**swarm_tasks** — individual agent tasks within a mission

**swarm_logs** — per-task execution logs

---

### Phase 12 — Growth Optimization Engine (migration 0015)

**growth_experiments** — A/B tests with statistical method config

**growth_variants** — variants within an experiment (control + challengers)

**growth_events** — individual conversion events

**growth_results** — statistical analysis snapshots (p-value, confidence interval, effect size)

**growth_insights** — Insight Moat
| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | |
| workspace_id | TEXT | |
| insight_type | TEXT | |
| insight | TEXT | natural language learning |
| confidence | REAL | |
| lift_score | REAL | measured performance lift |
| source | TEXT | experiment\|signal\|manual |
| tags | TEXT (JSON) | |
| applies_to | TEXT (JSON) | platforms/modules this applies to |
| source_campaign | TEXT | originating campaign |

---

### Phase 14 — Social Listening (migration 0019)

**listening_sources**, **tracked_keywords**, **signals** (10 signal types), **engagement_actions**, **signal_alerts** — full schema in schema.ts

---

### Influencer Module (migration 0024)

**influencers** — CRM for influencer discovery and relationship management
| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | |
| workspace_id | TEXT | |
| name, handle, platform | TEXT | |
| follower_count | INTEGER | |
| avg_engagement_rate | REAL | decimal (0.045 = 4.5%) |
| tier | TEXT | nano\|micro\|mid\|macro\|mega |
| status | TEXT | prospecting\|outreach\|negotiating\|active\|completed\|rejected\|blacklisted |
| source | TEXT | manual\|social_cat\|signal\|referral |
| social_cat_url | TEXT | link to Social Cat profile |
| ai_summary | TEXT | AI-generated fit brief |
| tags | TEXT (JSON) | |

**influencer_campaigns** — campaign groupings with budget/ROI tracking

**influencer_campaign_members** — influencer ↔ campaign join with per-member deal terms

**influencer_content** — logged posts with full engagement metrics and revenue attribution

---

### Event Log (migration 0025) ✅ COMPLETE

**event_log** — unified event schema for full system observability
| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | |
| workspace_id | TEXT | |
| trace_id | TEXT | cross-service correlation |
| type | TEXT | signal.detected \| content.generated \| post.scheduled \| post.published \| error |
| source | TEXT | reddit \| x \| linkedin \| system \| user |
| actor_id | TEXT | user_id if human-initiated |
| resource_type | TEXT | post \| signal \| campaign \| automation |
| resource_id | TEXT | |
| payload | TEXT (JSON) | |
| severity | TEXT | info \| warn \| error \| critical |
| created_at | INTEGER | unixepoch() |

---

### JV Marketing & Referral Tracking (migration 0026) ✅ COMPLETE

**partners** — Partner CRM with denormalized aggregate stats
| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | cuid2 |
| workspace_id | TEXT | |
| name, email, company_name | TEXT | |
| partner_type | TEXT | influencer \| podcast \| creator \| affiliate \| family_org \| church \| community \| media |
| status | TEXT | active \| paused \| archived |
| quality_score | REAL | 0–100, denormalized composite |
| total_clicks, total_signups | INTEGER | lifetime denormalized totals |
| total_revenue, payout_owed, payout_paid | REAL | USD |

**partner_campaigns** — Campaign groupings per partner with optional expiry

**tracking_links** — 8-char alphanumeric short codes (`/r/[code]`) with UTM params and attribution window
| Column | Type | Notes |
|--------|------|-------|
| short_code | TEXT UNIQUE | 8-char alphanumeric, globally unique |
| destination_url | TEXT | |
| utm_source/medium/campaign/content | TEXT | injected on redirect |
| attribution_window_days | INTEGER | default 30 |
| click_count, unique_click_count | INTEGER | |

**referral_visits** — Privacy-safe click log
| Column | Type | Notes |
|--------|------|-------|
| ip_hash | TEXT | SHA-256 salted with workspace_id |
| user_agent_hash | TEXT | SHA-256 salted |
| device_type | TEXT | desktop \| mobile \| tablet \| bot \| unknown |
| is_suspicious | BOOLEAN | rapid-click fraud flag (same IP within 60s) |
| fraud_reason | TEXT | `rapid_click` or null |

**attributed_conversions** — Conversion events with multi-touch attribution chain
| Column | Type | Notes |
|--------|------|-------|
| conversion_type | TEXT | signup \| subscription \| purchase \| family_invite \| family_activation |
| conversion_value | REAL | USD |
| attribution_chain | TEXT (JSON) | `[{source, tracking_link_id, timestamp}]` first + last touch |
| status | TEXT | pending \| confirmed \| rejected |
| commission_amount | REAL | computed from commission_rules |

**commission_rules** — Flat fee / percentage / tiered commission configs per partner or workspace default

**partner_payouts** — Payout lifecycle (pending → paid)

**partner_quality_snapshots** — Periodic snapshots of the 5-factor quality score for trend analysis

**Quality Score Formula:**
```
quality_score =
  retention_score       × 0.30   // 30-day user retention from this partner
  + activation_score    × 0.25   // Avg family members activated per signup (target: 3)
  + referral_score      × 0.20   // Downstream referral propagation (target: 1 per signup)
  + conversion_rate_score × 0.15 // Click-to-signup rate (target: 5%)
  + churn_score         × 0.10   // Inverse churn (confirmed / total signups)
```

**Edge redirect route:** `src/app/r/[code]/route.ts` — runs at Cloudflare edge
- Lookup → fraud check → log visit → increment counters → set `gos_attr` cookie → 301

**Attribution cookie (`gos_attr`):**
```json
{
  "partner_id": "...",
  "tracking_link_id": "...",
  "workspace_id": "...",
  "session_id": "...",
  "timestamp": 1234567890000,
  "first_touch": { "partner_id": "...", "tracking_link_id": "...", "timestamp": ... }
}
```
Cookie TTL = `attribution_window_days` (default 30). First-touch preserved across last-touch overwrites.

---

### Recent Migrations (0021–0028) — APPLIED

| Migration | Purpose |
|-----------|---------|
| 0021 | `fix_next_step_at_sentinel` — automation enrollment timing fix |
| 0022 | `connected_accounts_index` |
| 0023 | `media_jobs_type_constraint` |
| 0024 | `influencers` module |
| 0025 | `event_log` |
| 0026 | `jv_partners` — JV marketing & referral tracking |
| 0027 | `community_campaigns` — community auto-post campaigns |
| 0028 | `media_job_types` — adds `carousel`, `avatar_video` types + `did` provider; rebuilds `media_jobs` (preserves rows) |

> **Note:** Migration numbers 0027/0028 were used for community_campaigns and media_job_types respectively (earlier drafts of this doc reserved them for kill_switches/workspace_limits — those are now unimplemented and will take the next free numbers).

### Pending Migrations (Phase 5)

| Migration | Purpose | Phase |
|-----------|---------|-------|
| (next) | `kill_switches` — global + scoped pause controls | Phase 5 / Cross-cutting |
| (next) | `workspace_limits` — budget engine hard caps | Phase 5 |

---

## 6. Cloudflare Workers

### growthos-publisher
- **Config:** `wrangler.publisher.toml`
- **Entry:** `src/workers/publisher.ts`
- **Deploy:** `npm run deploy:publisher`
- **Bindings:** DB, PUBLISH_QUEUE
- **Secrets:** ENCRYPTION_KEY (must match Pages value)
- **Cron:** `* * * * *`
- **Logic:** Scans `scheduled_posts` WHERE `post_status IN ('queued', 'approved') AND scheduled_for <= now`. Enqueues publish jobs with `_platformAccountId` injected into metadata.
- **Queue consumer:** decrypts token, calls platform adapter, marks published/failed
- **Retry:** 3 attempts, dead-letter queue on exhaustion

### growthos-automation-processor
- **Config:** `wrangler.automation-processor.toml`
- **Entry:** `src/workers/automation-processor.ts`
- **Deploy:** `npm run deploy:automation-processor`
- **Bindings:** DB
- **Secrets:** RESEND_API_KEY
- **Cron:** `* * * * *`
- **Logic:** Processes `automation_enrollments` WHERE `enrollment_status = 'active' AND (next_step_at IS NULL OR next_step_at <= now)`. Batch of 50.
- **Steps:** `send_email` → Resend API | `wait` → sets `next_step_at` | `add_tag` → appends to subscriber tags JSON

### growthos-token-refresher
- **Config:** `wrangler.token-refresher.toml`
- **Entry:** `src/workers/token-refresher.ts`
- **Deploy:** `npm run deploy:token-refresher`
- **Bindings:** DB
- **Secrets:** ENCRYPTION_KEY, META_APP_ID, META_APP_SECRET, X_CLIENT_ID, X_CLIENT_SECRET, LINKEDIN_CLIENT_ID, LINKEDIN_CLIENT_SECRET
- **Cron:** `0 * * * *` (every hour)
- **Logic:** Finds accounts with `token_expires_at <= now + 24h`. Refreshes via platform-specific flow. On failure: marks `account_status = 'error'`.

### growthos-media-gen
- **Config:** `wrangler.media-gen.toml`
- **Entry:** `src/workers/media-gen.ts`
- **Deploy:** `npm run deploy:media-gen`
- **Bindings:** DB, BUCKET (R2), KV
- **Secrets:** ELEVEN_LABS_API_KEY, REPLICATE_API_TOKEN, CREATOMATE_API_KEY, DID_API_KEY, MEDIA_SERVE_TOKEN
- **Cron:** `* * * * *`
- **Logic:** Polls `media_jobs` WHERE `job_status = 'queued'` (Pages Functions can't use Queue producers, so D1 is the handoff). Routes by job `type`:
  - Image types (`meme`, `quote_card`, `thumbnail`, `promo`, `carousel_slide`, `ad_creative`) → Replicate Flux → R2.
  - `carousel` → multi-slide Flux → R2 + manifest.
  - `video_composite` → ElevenLabs TTS → Replicate B-roll (sequential, 429-retry) → Creatomate source render (Ken Burns + synced captions). Marks `processing`; the Creatomate webhook finalizes.
  - `avatar_video` → D-ID talking-head (`did-client.ts`).
- **Recovery:** also re-polls Creatomate for `processing` video jobs to recover from missed webhooks.
- **Requires:** Workers Paid plan (B-roll exceeds the free 50-subrequest cap).

---

## 7. API Surface

### Public endpoints (no auth)
| Route | Method | Purpose |
|-------|--------|---------|
| `/api/subscribe` | POST | Email capture |
| `/api/auth/login` | GET | Initiate Google OAuth |
| `/api/auth/callback/google` | GET | Google OAuth callback |
| `/api/social/callback/[platform]` | GET | Social OAuth callback |
| `/api/social/deauth/[platform]` | POST/GET | Meta deauth callback |
| `/api/social/delete/[platform]` | POST | Meta data deletion callback |
| `/api/webhooks/stripe` | POST | Stripe billing webhooks |
| `/api/webhooks/reunion` | POST | Reunion API webhooks — call `recordConversion()` here with `gos_attr` cookie |
| `/r/[code]` | GET | **Edge** attribution redirect — fraud check, visit log, cookie set, 301 |

### Auth-gated API routes
| Route | Method | Purpose |
|-------|--------|---------|
| `/api/media/upload` | POST | Upload to R2 |
| `/api/media/generate` | POST | Trigger Replicate/Creatomate |
| `/api/media/status/[jobId]` | GET | Poll media job status |
| `/api/social/connect/[platform]` | GET | Begin platform OAuth |
| `/api/social/disconnect/[platform]` | POST | Revoke + delete account |

### Cron endpoints
| Route | Schedule | Purpose |
|-------|----------|---------|
| `growthos-publisher` Worker | `* * * * *` | Publish due posts |
| `growthos-automation-processor` Worker | `* * * * *` | Process automation steps |
| `growthos-token-refresher` Worker | `0 * * * *` | Refresh expiring tokens |
| `/api/cron/metrics-sync` | Hourly | Sync post metrics |
| `/api/cron/ad-metrics-sync` | Every 2h | Sync ad metrics |
| `/api/cron/signal-scan` | Hourly | Scan for new signals |
| `/api/cron/swarm-overnight` | Daily 2am UTC | Overnight swarm missions |
| `/api/cron/optimize-check` | Daily 3am UTC | Auto-promote A/B winners |

### Server Actions by Module
| Module | Key actions |
|--------|-------------|
| content | `generateContent`, `saveContent`, `listAssets` |
| publisher | `schedulePost`, `listScheduledPosts`, `updatePostStatus`, `approvePost` |
| calendar | `getPostsByDateRange`, `reschedulePost`, `approvePost`, `deleteScheduledPost` |
| newsletter | `addSubscriber`, `sendNewsletter`, `listSubscribers` |
| automations | `createAutomation`, `updateAutomation`, `listAutomations` |
| analytics | `getPostMetrics`, `getSubscriberStats`, `getTopPosts` |
| ads | `createAdCampaign`, `generateAdCopy`, `markVariantWinner` |
| seo | `createKeyword`, `analyzePage`, `generateAEOContent` |
| competitors | `addCompetitor`, `analyzeCompetitor`, `generateContentOpportunity` |
| signals | `getSignals`, `dismissSignal`, `createEngagementAction` |
| experiments | `createExperiment`, `recordEvent`, `computeResults`, `promoteWinner` |
| swarm | `launchMission`, `getMissionStatus`, `listAgents` |
| influencers | `listInfluencers`, `addInfluencer`, `createCampaign`, `logInfluencerContent`, `getInfluencerStats` |
| publisher | `listPinterestBoards`, `createReunionPinterestBoards`, `schedulePost`, `approvePost`, `cancelPost` |
| communities | `createCommunity`, `publishCommunityPost`, `listConnectedAccountsByPlatform` |
| jv | `listPartners`, `createPartner`, `createTrackingLink`, `getPartnerAnalytics`, `getWorkspaceJvSummary`, `computePartnerQualityScore`, `createCommissionRule`, `createPayout`, `markPayoutPaid`, `recordConversion` |
| team | `inviteMember`, `updateMemberRole`, `removeMember` |
| billing | `createCheckoutSession`, `createPortalSession`, `getSubscription` |

---

## 8. Cron Jobs

| Trigger | Frequency | Handler | Purpose |
|---------|-----------|---------|---------|
| publisher Worker | every minute | `src/workers/publisher.ts` | Publish due social posts |
| automation-processor Worker | every minute | `src/workers/automation-processor.ts` | Execute automation steps |
| token-refresher Worker | every hour | `src/workers/token-refresher.ts` | Refresh expiring OAuth tokens |
| `/api/cron/metrics-sync` | hourly | Next.js route | Fetch post metrics from platforms |
| `/api/cron/ad-metrics-sync` | every 2h | Next.js route | Fetch ad campaign metrics |
| `/api/cron/signal-scan` | hourly | Next.js route | Scan Reddit/X/RSS for signals |
| `/api/cron/swarm-overnight` | daily 2am | Next.js route | Autonomous overnight swarm run |
| `/api/cron/optimize-check` | daily 3am | Next.js route | Auto-promote winning A/B variants |

---

## 9. Key Libraries & Patterns

### `safeAction` wrapper
All server actions return a discriminated union:
```ts
type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; code: "VALIDATION" | "AUTH" | "FORBIDDEN" | "INTERNAL" }
```

### `createDb`
```ts
import { createDb } from "@/lib/db/client";
const db = createDb(env.DB);
```
Drizzle instance. Used in Next.js server actions only. **Workers use raw D1 SQL.**

### Auth middleware
`requireAuth()` — session. `requirePermission(action)` — RBAC check. Every server action calls one at the top.

### Doctrine Engine
`src/lib/ai/doctrine.ts` — `buildSystemPrompt(ctx)` stacks 4 layers: Brand Identity → Doctrine Mode → Platform Constraints → Content Type Instructions.

Platform constraints encode demographic reality, character limits, algorithm behaviors, compliance norms, and what actually works — not just formatting rules.

### `generateWithClaude`
`src/lib/ai/claude.ts` — raw Claude wrapper. **Always mock in Vitest** with `vi.mock("@/lib/ai/claude")`.

```ts
await generateWithClaude({
  systemPrompt: string,
  userMessage: string,
  maxTokens?: number,
});
```

### Encryption
`src/lib/utils/crypto.ts` — `encrypt(plaintext, key)` / `decrypt(ciphertext, key)`. AES-256-GCM. `ENCRYPTION_KEY` must be identical across Pages + publisher Worker + token-refresher Worker.

### Workers pattern (raw D1 only)
```ts
const { results } = await env.DB.prepare(`SELECT ... WHERE x = ?`).bind(value).all<RowType>();
await env.DB.prepare(`UPDATE ... SET col = ? WHERE id = ?`).bind(val, id).run();
```

### Image Generation (Replicate / Flux)
`src/lib/media/replicate.ts` — `ReplicateClient.generateImage(options)`. Two models: `schnell` (~2-5s) and `pro` (~10-30s). `buildImagePrompt(brief, platform, jobType)` selects aspect ratio and visual style per platform automatically.

### Video Pipeline
**Flow:** Script + `imagePrompts` (Claude) → Voiceover (ElevenLabs) → B-roll images (Replicate Flux, from Claude's `imagePrompts`) → Composition (Creatomate, source-based) → Storage (R2) → Creatomate webhook marks complete.

- **Async handoff:** Pages Function inserts a `media_jobs` row with `job_status='queued'`; `growthos-media-gen` (cron) polls and processes. No queue producer on the Pages side.
- **Composition** (`src/lib/media/creatomate.ts → buildVoiceoverVideoSource`): background images on track 1 with alternating Ken Burns + crossfades; brand tint (22%) + caption band; title (track 3); **audio element named `"audio"`** so the caption text element's `transcript_source: "audio"` auto-transcribes into synced word captions; gold brand strip + optional logo.
- **Playback:** `/api/media/serve/[...key]` supports HTTP Range (206) for reliable `<video>` streaming; UI plays inline via a modal.
- **Voices:** 14 ElevenLabs presets in `media-studio.tsx` (`REUNION_VOICE_PRESETS`), plus founder/custom voices via `voice_profiles`.
- **Avatar variant:** `avatar_video` jobs use D-ID (`src/lib/video/did-client.ts`) for talking-head presenters.
- **Status** tracked in `media_jobs` (`queued → processing → completed/failed`), `result_r2_key` set by webhook.

---

## 10. RBAC Permission Matrix

6 roles: `owner`, `admin`, `marketer`, `analyst`, `content_manager`, `viewer`

| Permission | owner | admin | marketer | analyst | content_manager | viewer |
|------------|-------|-------|----------|---------|-----------------|--------|
| content:read | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| content:write | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ |
| publish:write | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| publish:approve | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| analytics:read | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| analytics:write | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| team:write | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| billing:write | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| settings:write | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| swarm:launch | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| swarm:admin | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| experiments:write | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| signals:write | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |

> **Pending for Phase 5:** Add `swarm:autonomous` permission (owner/admin only) that gates the Risk Engine's auto-approval path.

---

## 11. Automation Enrollment Flow

```
User submits form → POST /api/subscribe
  ├─ Validate, find workspace, check duplicate
  ├─ INSERT into subscribers
  └─ enrollSubscriber() — fire-and-forget

enrollSubscriber() → src/lib/automations/enroll.ts
  ├─ Query active automations matching trigger_type
  ├─ For lead_magnet: filter by triggerConfig.slug
  └─ INSERT automation_enrollments (current_step=0, next_step_at=NULL)
     UNIQUE(automation_id, subscriber_id) prevents double-enrollment

growthos-automation-processor Worker (every minute)
  ├─ SELECT enrollments WHERE status='active' AND (next_step_at IS NULL OR <= now)
  ├─ send_email → Resend API ({{name}} merge tag) → advance step
  ├─ wait → set next_step_at = now + delayHours*3600000 → advance step
  ├─ add_tag → parse + append to subscriber.tags JSON → advance step
  ├─ Last step → status='completed', automations.completed_count++
  └─ Exception → status='failed', error_message saved
```

---

## 12. Known Gaps & Next Build Targets

### Critical (Phase 5 blockers — system is unsafe for autonomous mode without these)
| Item | Description | Migration | Status |
|------|-------------|-----------|--------|
| Risk Engine | Per-action risk scoring gates Swarm execution | — | ❌ Not built |
| Budget Engine | Hard limits on posts/day, API calls/platform, outreach caps | 0028 | ❌ Not built |
| Kill Switches | Global + scoped pause controls, rollback | 0027 | ❌ Not built |

### Important (Phase 2–3 quality gaps)
| Item | Description | Status |
|------|-------------|--------|
| JV Conversion wiring | `recordConversion()` in `/api/webhooks/reunion` needs to pass `gos_attr` cookie from Reunion signup flow | ❌ Pending |
| Performance Feedback Injection | Past performance embeddings + CTR signals fed back into content generation prompts | ❌ Not built |
| Content versioning | `variant_id` + `prompt_hash` columns on `content_assets` | ❌ Not built |
| Platform adapter interface | Formalize `validate/transform/publish/handleResponse` contract | ❌ Not built |
| Failure classification enum | Structured `failure_type` column on `scheduled_posts` instead of free-text error | ❌ Not built |
| Threads publishing | Blocked by Meta app review / tester access required | ❌ External blocker |
| Identity & Trust Layer | Human-like posting patterns, cadence variance, jitter | ❌ Not built |
| Pinterest OAuth flow | Full OAuth callback for connecting Pinterest accounts (currently manual token) | ❌ Not built |

### Pending external dependencies
| Item | Blocker | Status |
|------|---------|--------|
| Reddit publishing (Reunion) | API access resubmitted | ❌ Awaiting approval |
| Pinterest publishing | ✅ Trial access approved; secrets set | ✅ Live |
| TikTok publishing | App review + demo video required | ❌ Not started |
| Creatomate video | Template IDs not created | ❌ Build templates in Creatomate dashboard |

### Technical debt
| Item | Risk | Notes |
|------|------|-------|
| No CI/CD | Low | Manual deploys only |
| `fix-manifests.js` | Low | Patches Next.js manifests for Cloudflare Pages compat. Works reliably |
| Automation emails: no unsubscribe footer | Medium | Fine for early testing; add before scaling |
| Swarm: no guardrails | **High** | Swarm is fully coded and can run missions, but without Risk Engine it operates unconstrained — do not enable autonomous mode until Phase 5 guardrails are built |
| Social Listening: untested vs live data | Medium | Needs a live signal scan run to validate |
| Mobile real-device testing | Medium | Design is mobile-first; no real-device testing done |
| JV Quality Score: no live data yet | Low | Score computation works but needs real Reunion signups attributed to partners to produce meaningful scores |
| Pinterest: long-lived token only | Low | No automatic token refresh for Pinterest — will need manual reconnect when token expires; OAuth flow not yet built |
