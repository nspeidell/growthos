# GrowthOS — Deploy Guide

Everything runs on **Cloudflare Pages** (Next.js app) + standalone **Cloudflare Workers** (cron jobs). No Vercel. No Supabase.

---

## Quick Reference

| Command | What it does |
|---------|-------------|
| `npm run deploy` | Build Next.js → Cloudflare Pages (production) |
| `npm run ship` | git commit + push + `npm run deploy` |
| `npm run deploy:publisher` | Deploy growthos-publisher Worker |
| `npm run deploy:automation-processor` | Deploy growthos-automation-processor Worker |

---

## 1. Prerequisites

```bash
# Node.js 22 (required — check: node --version)
# npm (comes with Node)
# Wrangler CLI
npm install -g wrangler

# Authenticate with Cloudflare
wrangler login
wrangler whoami  # should show your account name + ID
```

---

## 2. Infrastructure Setup (one-time)

### 2.1 Create D1 Database

```bash
wrangler d1 create growthos-prod
# Copy the database_id from output → paste into wrangler.toml
```

### 2.2 Create R2 Bucket

```bash
wrangler r2 bucket create growthos-media
```

### 2.3 Create KV Namespace

```bash
wrangler kv namespace create GROWTHOS_KV
# Copy the id from output → paste into wrangler.toml
```

### 2.4 Create Queues

```bash
wrangler queues create growthos-publish
wrangler queues create growthos-publish-dlq
wrangler queues create growthos-media
wrangler queues create growthos-media-dlq
wrangler queues create growthos-swarm
wrangler queues create growthos-swarm-dlq
wrangler queues create growthos-signals
wrangler queues create growthos-signals-dlq
```

### 2.5 Update wrangler.toml

Fill in the IDs from steps above:

```toml
[[d1_databases]]
database_id = "<YOUR_D1_ID>"

[[kv_namespaces]]
id = "<YOUR_KV_ID>"

[vars]
APP_URL = "https://growthos.pages.dev"
```

---

## 3. Database Migrations

Apply all 21 migrations in order. Run each file individually:

```bash
for i in $(ls src/lib/db/migrations/*.sql | sort); do
  echo "Applying $i..."
  wrangler d1 execute growthos-prod --remote --file="$i"
done
```

Or apply a single migration:

```bash
wrangler d1 execute growthos-prod --remote --file=./src/lib/db/migrations/0020_automations_engine.sql
```

**CRITICAL:** Any schema change requires BOTH:
1. A new SQL migration file in `src/lib/db/migrations/`
2. The corresponding change in `src/lib/db/schema.ts`

Column names must match exactly (e.g. `platformId: text("platform_id")` ↔ `platform_id TEXT`).

---

## 4. Secrets

### Pages app secrets (set via Cloudflare Dashboard or CLI)

```bash
# Required — must be set before first deploy
wrangler pages secret put SESSION_SECRET --project-name=growthos
# Value: openssl rand -hex 32

wrangler pages secret put ENCRYPTION_KEY --project-name=growthos
# Value: openssl rand -hex 32

wrangler pages secret put GOOGLE_CLIENT_SECRET --project-name=growthos
wrangler pages secret put ANTHROPIC_API_KEY --project-name=growthos

# Feature-gated (add when enabling each feature)
wrangler pages secret put STRIPE_SECRET_KEY --project-name=growthos
wrangler pages secret put STRIPE_WEBHOOK_SECRET --project-name=growthos
wrangler pages secret put META_APP_ID --project-name=growthos
wrangler pages secret put META_APP_SECRET --project-name=growthos
wrangler pages secret put X_CLIENT_ID --project-name=growthos
wrangler pages secret put X_CLIENT_SECRET --project-name=growthos
wrangler pages secret put REDDIT_CLIENT_ID --project-name=growthos
wrangler pages secret put REDDIT_CLIENT_SECRET --project-name=growthos
wrangler pages secret put RESEND_API_KEY --project-name=growthos
wrangler pages secret put ELEVEN_LABS_API_KEY --project-name=growthos
wrangler pages secret put REPLICATE_API_TOKEN --project-name=growthos
wrangler pages secret put CREATOMATE_API_KEY --project-name=growthos
wrangler pages secret put REUNION_API_KEY --project-name=growthos
wrangler pages secret put REUNION_WEBHOOK_SECRET --project-name=growthos
```

### Publisher Worker secrets

```bash
# MUST match the Pages ENCRYPTION_KEY exactly
wrangler secret put ENCRYPTION_KEY --config wrangler.publisher.toml
```

### Automation Processor Worker secrets

```bash
# MUST match the Pages RESEND_API_KEY exactly
wrangler secret put RESEND_API_KEY --config wrangler.automation-processor.toml
```

---

## 5. First Deploy

### 5.1 Deploy the Pages app

```bash
npm run deploy
```

This runs: `next build` → `node scripts/fix-manifests.js` → `@cloudflare/next-on-pages` → `wrangler pages deploy .vercel/output/static --project-name=growthos --branch=production`

**Important:** The `--branch=production` flag is required. Without it, Cloudflare treats the deploy as a Preview and the live URL stays stale.

### 5.2 Deploy the Publisher Worker

```bash
npm run deploy:publisher
```

### 5.3 Deploy the Automation Processor Worker

```bash
npm run deploy:automation-processor
```

---

## 6. Google OAuth Setup

1. Go to https://console.cloud.google.com → create project "GrowthOS"
2. APIs & Services → Credentials → Create OAuth 2.0 Client ID (Web application)
3. Authorized redirect URIs:
   ```
   https://growthos.pages.dev/api/auth/callback/google
   http://localhost:3000/api/auth/callback/google
   ```
4. Copy Client ID → set as `GOOGLE_CLIENT_ID` in Pages vars (not a secret — goes in `[vars]`)
5. Copy Client Secret → set as `GOOGLE_CLIENT_SECRET` Pages secret

---

## 7. Post-Deploy Smoke Test

| URL | Expected result |
|-----|----------------|
| `https://growthos.pages.dev/` | Redirects to `/login` |
| `https://growthos.pages.dev/login` | Google sign-in button |
| `https://growthos.pages.dev/waitlist` | Public waitlist form |
| `https://growthos.pages.dev/api/cron/publish` | `{"published":0,"message":"No posts due"}` |
| `https://growthos.pages.dev/api/cron/automations` | `{"processed":0}` |

---

## 8. Workers Reference

### growthos-publisher

| Property | Value |
|----------|-------|
| Config | `wrangler.publisher.toml` |
| Deploy | `npm run deploy:publisher` |
| Cron | Every minute |
| Bindings | DB (growthos-prod), PUBLISH_QUEUE |
| Secrets | ENCRYPTION_KEY |
| Purpose | Scans `scheduled_posts` for due posts, publishes to social platforms, handles retry with exponential backoff |

### growthos-automation-processor

| Property | Value |
|----------|-------|
| Config | `wrangler.automation-processor.toml` |
| Deploy | `npm run deploy:automation-processor` |
| Cron | Every minute |
| Bindings | DB (growthos-prod) |
| Secrets | RESEND_API_KEY |
| Purpose | Processes `automation_enrollments` — executes send_email / wait / add_tag steps, advances step counter, marks completed |

---

## 9. Ongoing Operations

### Adding a new D1 migration

```bash
# 1. Create the SQL file
touch src/lib/db/migrations/0021_feature_name.sql

# 2. Apply to production
wrangler d1 execute growthos-prod --remote --file=./src/lib/db/migrations/0021_feature_name.sql

# 3. Redeploy
npm run ship
```

### Running tests

```bash
npm test           # Run all 291 tests (Vitest)
npm run test:watch # Watch mode
npm run type-check # TypeScript check (must be zero errors)
```

### Local development

```bash
cp .env.example .env.local   # Fill in dev values
npm install
npm run dev                  # http://localhost:3000
```

### Rollback

Cloudflare Pages keeps a full deployment history. To roll back:
- Dashboard → Workers & Pages → growthos → Deployments → click any past deploy → "Set as Production Deployment"

D1 has no auto-rollback — write a reverse migration SQL manually.

---

## 10. Cloudflare Resource IDs

| Resource | Name | ID |
|----------|------|----|
| D1 Database | growthos-prod | 2b46db77-e682-45de-8205-b223246b7334 |
| R2 Bucket | growthos-media | — |
| KV Namespace | — | 80d4197d04d144429f836a614acaca50 |
| Queue | growthos-publish | — |
| Queue | growthos-media | — |
| Queue | growthos-swarm | — |
| Queue | growthos-signals | — |

---

## 11. Creatomate Template IDs (pending)

Once templates are created in the Creatomate dashboard, add these to `wrangler.toml` and `wrangler.publisher.toml` under `[vars]`:

```toml
CREATOMATE_TPL_VIDEO_H  = "..."   # Horizontal video
CREATOMATE_TPL_VIDEO_V  = "..."   # Vertical video
CREATOMATE_TPL_VIDEO_SQ = "..."   # Square video
CREATOMATE_TPL_MEME     = "..."   # Meme layout
CREATOMATE_TPL_QUOTE    = "..."   # Quote card
```
