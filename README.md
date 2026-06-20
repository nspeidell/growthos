# GrowthOS

A standalone, multi-brand AI Marketing Operating System — a "Bloomberg Terminal for Growth." GrowthOS handles content creation, distribution, analytics, and revenue optimization across multiple brand workspaces, turning marketing into an autonomous, self-improving engine.

**Live:** https://growthos-eo1.pages.dev
**Status:** 14 core build phases complete + Video pipeline (B-roll, synced captions, avatar video), multi-format publishing, and new modules (Influencers, Pinterest, JV Marketing). See [`TECHNICAL_PLAN.md`](./TECHNICAL_PLAN.md) for the full architecture, schema, and roadmap.

---

## The Sovereign Stack

100% Cloudflare-native — no Supabase, Vercel hosting, or Firebase.

| Layer | Tech |
|-------|------|
| **Frontend** | Next.js 15 (App Router), TypeScript (strict), TailwindCSS 3, shadcn/ui, Framer Motion |
| **Hosting** | Cloudflare Pages (Direct Upload via `@cloudflare/next-on-pages`) |
| **Database** | Cloudflare D1 (SQLite) + Drizzle ORM |
| **Storage** | Cloudflare R2 (`growthos-media`) |
| **Sessions / cache** | Cloudflare KV |
| **Async jobs** | D1 polling + cron Workers (Pages Functions can't produce to Queues) |
| **AI** | Anthropic Claude (`claude-sonnet-4-6`) |
| **Media** | Replicate Flux (images/B-roll), ElevenLabs (TTS), Creatomate (video), D-ID (avatar video) |
| **Billing / Email** | Stripe, Resend |
| **Auth** | Google OAuth (Arctic) + social OAuth (Meta, X, LinkedIn, YouTube, Threads) |
| **Testing** | Vitest |

---

## Repository Layout

```
src/
  app/                  Next.js App Router (dashboard, API routes, server actions)
    dashboard/          Operator console (content, media, publisher, analytics, …)
    api/                Public + auth-gated routes, webhooks, cron, media serve
  lib/
    db/                 schema.ts (source of truth) + migrations/
    ai/                 Claude client, Doctrine Engine
    media/              replicate.ts, creatomate.ts, elevenlabs
    video/              did-client.ts, analyze-trust
    publishers/         platform adapters (IG, FB, X, LinkedIn, Threads, carousel)
    auth/               social-oauth.ts, middleware (RBAC)
  workers/              publisher, automation-processor, token-refresher, media-gen
TECHNICAL_PLAN.md       Architecture, schema, build phases, known gaps
```

---

## Deploy

The Pages app uses **Direct Upload** (not GitHub auto-deploy). Workers deploy via their own configs.

```bash
npm run deploy                        # Pages app (build → next-on-pages → wrangler pages deploy)
npm run deploy:publisher              # growthos-publisher worker
npm run deploy:automation-processor   # growthos-automation-processor worker
npm run deploy:token-refresher        # growthos-token-refresher worker
npm run deploy:media-gen              # growthos-media-gen worker (image/video/B-roll/avatar)
npm run ship                          # git add+commit+push, then deploy Pages
```

**Verify (every deploy):** Pages prints a `growthos-eo1.pages.dev` URL; each worker prints a new `Current Version ID`.

### Database migrations (applied manually to remote D1)

```bash
wrangler d1 execute growthos-prod --remote --file=./src/lib/db/migrations/XXXX_name.sql
```

> **Rule:** every schema change updates BOTH `src/lib/db/schema.ts` AND a new migration SQL file. Column names must match exactly (`platformId: text("platform_id")` ↔ `platform_id TEXT`).

---

## Cloudflare Resources

| Resource | Name / ID |
|----------|-----------|
| D1 | `growthos-prod` (`2b46db77-e682-45de-8205-b223246b7334`) |
| R2 | `growthos-media` (public: `pub-fff12e42fe61481ea170c0c8c2e1e3bf.r2.dev`) |
| KV | `80d4197d04d144429f836a614acaca50` |
| Pages project | `growthos` (branch `production`) |
| Plan | **Workers Paid** (required — B-roll exceeds the free 50-subrequest cap) |

### Secrets (Pages + workers)
`SESSION_SECRET`, `ENCRYPTION_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_CLIENT_ID/SECRET`, `META_APP_ID/SECRET`, `X_CLIENT_ID/SECRET`, `LINKEDIN_CLIENT_ID/SECRET`, `CRON_SECRET`, `ELEVEN_LABS_API_KEY`, `REPLICATE_API_TOKEN`, `CREATOMATE_API_KEY`, `RESEND_API_KEY`, `DID_API_KEY`, `MEDIA_SERVE_TOKEN`.

Media-gen worker secrets are set separately:
```bash
wrangler secret put REPLICATE_API_TOKEN --config wrangler.media-gen.toml
```

---

## Local Development

```bash
npm install
npm run dev          # Next.js dev server
npm run type-check   # tsc --noEmit  (the standard pre-deploy gate)
npm run test         # Vitest
```

---

## Key Architecture Notes

- **Multi-tenant isolation:** every row carries `workspace_id`; all queries scope to the session workspace.
- **Pages → Worker handoff:** Pages Functions insert a `media_jobs` row; the `media-gen` cron worker polls D1 and processes (Pages can't produce to Queues).
- **Video pipeline:** Claude script + image prompts → ElevenLabs voiceover → Replicate B-roll → Creatomate render (Ken Burns motion + auto-synced captions) → R2. Playback supports HTTP Range for reliable streaming.
- **Social publishing:** Facebook Page posting requires the `business_management` scope (New Pages Experience). Instagram publishes directly via the Instagram Login API; carousel uses `CAROUSEL_ALBUM`.
- **`"use server"` rule:** only export async functions from server-action files — exported constants/objects are silently dropped on the client.

See [`TECHNICAL_PLAN.md`](./TECHNICAL_PLAN.md) for the complete schema, worker logic, RBAC matrix, and roadmap.
