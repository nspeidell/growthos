# GrowthOS — First Deploy Guide

Complete walkthrough: zero accounts → live app on a `.vercel.app` URL.

---

## 0. Prerequisites

Install these tools locally:

```bash
# Node.js 20+ (check: node --version)
# npm (comes with Node)

# Wrangler CLI (Cloudflare)
npm install -g wrangler

# Vercel CLI
npm install -g vercel
```

---

## 1. Create Cloudflare Account

1. Go to https://dash.cloudflare.com/sign-up
2. Verify your email
3. From the dashboard, copy your **Account ID** (right sidebar on the main page)
4. Create an API Token:
   - Go to: My Profile → API Tokens → Create Token
   - Use template: **"Edit Cloudflare Workers"**
   - Add permissions: D1 (Edit), R2 (Edit), Workers KV (Edit), Queues (Edit)
   - Save the token — you'll need it as `CF_API_TOKEN`

### 1.1 Authenticate Wrangler

```bash
wrangler login
# Opens browser for OAuth — approve access
wrangler whoami
# Should show your account name + ID
```

### 1.2 Create D1 Database

```bash
wrangler d1 create growthos-prod
```

Output will include a `database_id` — copy it.

### 1.3 Create R2 Bucket

```bash
wrangler r2 bucket create growthos-media
```

Used for: media uploads, generated images/video, lead magnet files.

### 1.4 Create KV Namespace

```bash
wrangler kv namespace create GROWTHOS_KV
```

Copy the `id` from the output.

### 1.5 Create Queues

```bash
wrangler queues create growthos-publish
wrangler queues create growthos-media
wrangler queues create growthos-swarm
wrangler queues create growthos-swarm-dlq
```

### 1.6 Update wrangler.toml

Open `wrangler.toml` and fill in:

```toml
[[d1_databases]]
binding = "DB"
database_name = "growthos-prod"
database_id = "<YOUR_D1_DATABASE_ID>"

[[kv_namespaces]]
binding = "KV"
id = "<YOUR_KV_NAMESPACE_ID>"
```

Also update the `[vars]` section:

```toml
[vars]
ENVIRONMENT = "production"
APP_URL = "https://growthos-<your-vercel-username>.vercel.app"
```

### 1.7 Apply All Migrations

```bash
./scripts/apply-migrations.sh --remote
```

This applies all 16 migrations (0000–0015) in order. You should see:

```
  Applied: 16/16
  ✅ All migrations applied successfully.
```

### 1.8 Set Cloudflare Secrets

Only set the ones you need to get started (auth + core):

```bash
# Required for first deploy
wrangler secret put SESSION_SECRET
# Paste: output of `openssl rand -hex 32`

wrangler secret put ENCRYPTION_KEY
# Paste: output of `openssl rand -hex 32`

wrangler secret put GOOGLE_CLIENT_SECRET
# From Google Cloud Console (see section 3 below)

wrangler secret put ANTHROPIC_API_KEY
# From console.anthropic.com
```

Optional (add when you enable each feature):
```bash
wrangler secret put STRIPE_SECRET_KEY
wrangler secret put STRIPE_WEBHOOK_SECRET
wrangler secret put META_APP_SECRET
wrangler secret put X_CLIENT_SECRET
wrangler secret put REDDIT_CLIENT_SECRET
wrangler secret put RESEND_API_KEY
wrangler secret put ELEVEN_LABS_API_KEY
wrangler secret put REUNION_API_KEY
wrangler secret put REUNION_WEBHOOK_SECRET
```

### 1.9 Deploy Worker

```bash
wrangler deploy
```

---

## 2. Create Vercel Account + Deploy

### 2.1 Sign Up & Link

1. Go to https://vercel.com/signup (sign up with GitHub recommended)
2. Authenticate the Vercel CLI:

```bash
vercel login
# Opens browser — approve
```

### 2.2 Initialize Project

From the `growthos/` directory:

```bash
vercel
```

Answer the prompts:
- Set up and deploy? **Y**
- Which scope? (select your account)
- Link to existing project? **N** (creates new)
- Project name? **growthos**
- Directory with source code? **./**
- Override settings? **N**

This deploys a preview. Note the URL (e.g. `growthos-abc123.vercel.app`).

### 2.3 Set Environment Variables

```bash
# Required — generate secrets first:
# SESSION_SECRET=$(openssl rand -hex 32)
# ENCRYPTION_KEY=$(openssl rand -hex 32)
# CRON_SECRET=$(openssl rand -hex 32)

vercel env add NEXT_PUBLIC_APP_URL        # Value: https://growthos-<you>.vercel.app
vercel env add ENVIRONMENT                 # Value: production
vercel env add CF_ACCOUNT_ID               # Value: your Cloudflare account ID
vercel env add CF_API_TOKEN                # Value: your Cloudflare API token
vercel env add CF_D1_DATABASE_ID           # Value: from step 1.2
vercel env add GOOGLE_CLIENT_ID            # Value: from Google Cloud Console
vercel env add GOOGLE_CLIENT_SECRET        # Value: from Google Cloud Console
vercel env add SESSION_SECRET              # Value: 32-byte hex
vercel env add ENCRYPTION_KEY              # Value: 32-byte hex
vercel env add CRON_SECRET                 # Value: 32-byte hex
vercel env add ANTHROPIC_API_KEY           # Value: from console.anthropic.com
```

When prompted for environment, select: **Production**, **Preview**, and **Development**.

### 2.4 Deploy to Production

```bash
vercel --prod
```

Your app is now live at: `https://growthos-<you>.vercel.app`

---

## 3. Google OAuth Setup

1. Go to https://console.cloud.google.com
2. Create a new project (name: "GrowthOS")
3. Navigate: APIs & Services → Credentials → Create Credentials → OAuth 2.0 Client ID
4. Application type: **Web application**
5. Authorized redirect URIs — add:
   ```
   https://growthos-<you>.vercel.app/api/auth/callback/google
   http://localhost:3000/api/auth/callback/google
   ```
6. Copy the **Client ID** and **Client Secret**
7. Set these in both Vercel env vars and Cloudflare secrets (already done above)

Also enable the Google+ API / People API in the APIs & Services → Library section.

---

## 4. Post-Deploy Verification

### 4.1 Smoke Test

Visit these URLs and confirm they work:

| URL | Expected |
|-----|----------|
| `https://your-app.vercel.app/` | Redirects to `/login` |
| `https://your-app.vercel.app/login` | Google OAuth button |
| `https://your-app.vercel.app/waitlist` | Public waitlist page |
| `https://your-app.vercel.app/newsletter` | Public newsletter signup |
| `https://your-app.vercel.app/api/cron/metrics-sync` | 401 (no auth header) |

### 4.2 First Login

1. Click "Sign in with Google"
2. Authorize the app
3. You'll land on `/dashboard` — the executive dashboard
4. First user automatically gets `owner` role

### 4.3 Verify Cron Jobs

In Vercel Dashboard → Settings → Cron Jobs, confirm 4 crons are registered:

| Cron | Schedule | Purpose |
|------|----------|---------|
| `/api/cron/metrics-sync` | Hourly | Social post metrics |
| `/api/cron/ad-metrics-sync` | Every 2h | Ad campaign metrics |
| `/api/cron/swarm-overnight` | Daily 2am UTC | AI Swarm overnight mode |
| `/api/cron/optimize-check` | Daily 3am UTC | Growth experiment auto-optimize |

---

## 5. Environment Variables Reference

### Must-Have for Launch

| Variable | How to Get |
|----------|------------|
| `CF_ACCOUNT_ID` | Cloudflare Dashboard → right sidebar |
| `CF_API_TOKEN` | Cloudflare → My Profile → API Tokens |
| `CF_D1_DATABASE_ID` | Output of `wrangler d1 create` |
| `GOOGLE_CLIENT_ID` | Google Cloud Console → Credentials |
| `GOOGLE_CLIENT_SECRET` | Google Cloud Console → Credentials |
| `SESSION_SECRET` | `openssl rand -hex 32` |
| `ENCRYPTION_KEY` | `openssl rand -hex 32` |
| `CRON_SECRET` | `openssl rand -hex 32` |
| `ANTHROPIC_API_KEY` | console.anthropic.com → API Keys |

### Add Later (per feature)

| Variable | Feature | Source |
|----------|---------|--------|
| `META_APP_ID` / `SECRET` | Instagram/Facebook publishing | developers.facebook.com |
| `X_CLIENT_ID` / `SECRET` | X/Twitter publishing | developer.x.com |
| `REDDIT_CLIENT_ID` / `SECRET` | Reddit publishing | reddit.com/prefs/apps |
| `STRIPE_SECRET_KEY` | Billing | dashboard.stripe.com |
| `STRIPE_WEBHOOK_SECRET` | Billing webhooks | Stripe CLI or dashboard |
| `STRIPE_PRICE_PRO` | Pro plan price ID | Stripe Products |
| `STRIPE_PRICE_ENTERPRISE` | Enterprise price ID | Stripe Products |
| `RESEND_API_KEY` | Newsletter emails | resend.com |
| `ELEVEN_LABS_API_KEY` | AI voice/video | elevenlabs.io |
| `REUNION_API_URL` | Reunion integration | Your Reunion instance |
| `REUNION_API_KEY` | Reunion integration | Reunion admin panel |
| `REUNION_WEBHOOK_SECRET` | Reunion webhooks | Reunion admin panel |

---

## 6. Ongoing Operations

### Adding New Migrations

```bash
# 1. Create the SQL file
touch src/lib/db/migrations/0016_feature_name.sql

# 2. Apply to production
./scripts/apply-migrations.sh --remote

# 3. Redeploy
vercel --prod
```

### Monitoring

- **Vercel**: Functions → Logs (filter by 5xx for errors)
- **Cloudflare**: Workers & Pages → your worker → Logs
- **Cron health**: Check that KV keys update each cycle

### Rollback

```bash
# App rollback (instant)
vercel rollback

# Database: D1 has no auto-rollback — write reverse migrations manually
```

### Updating

```bash
# Pull latest, deploy
git pull origin main
vercel --prod
```

---

## 7. Local Development

```bash
cp .env.example .env.local
# Fill in values (use dev D1 database)

npm install
./scripts/apply-migrations.sh --local
npm run dev
```

Open http://localhost:3000

---

## Quick Reference — Full Deploy in 5 Commands

Once accounts are set up and env vars configured:

```bash
wrangler d1 create growthos-prod         # 1. Create database
./scripts/apply-migrations.sh --remote    # 2. Run migrations
wrangler deploy                           # 3. Deploy worker
vercel                                    # 4. First deploy (sets up project)
vercel --prod                             # 5. Production deploy
```
