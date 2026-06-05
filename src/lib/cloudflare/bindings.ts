import { getRequestContext } from "@cloudflare/next-on-pages";

/**
 * Cloudflare environment bindings.
 * Access D1, R2, KV, and Queues from Next.js server components and route handlers.
 */
export interface CloudflareEnv {
  // Storage
  DB: D1Database;
  BUCKET: R2Bucket;
  KV: KVNamespace;

  // Queues
  PUBLISH_QUEUE: Queue;
  MEDIA_QUEUE: Queue;
  SWARM_QUEUE: Queue;
  SIGNAL_QUEUE: Queue;

  // Secrets (set via `wrangler secret put`)
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  SESSION_SECRET: string;
  ENCRYPTION_KEY: string;
  ANTHROPIC_API_KEY: string;
  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
  STRIPE_PRICE_PRO: string;
  STRIPE_PRICE_ENTERPRISE: string;

  // Phase 3: Social OAuth secrets
  META_APP_ID: string;
  META_APP_SECRET: string;
  INSTAGRAM_APP_ID: string;
  INSTAGRAM_APP_SECRET: string;
  THREADS_APP_ID: string;
  THREADS_APP_SECRET: string;
  X_CLIENT_ID: string;
  X_CLIENT_SECRET: string;
  REDDIT_CLIENT_ID: string;
  REDDIT_CLIENT_SECRET: string;
  PINTEREST_CLIENT_ID: string;
  PINTEREST_CLIENT_SECRET: string;

  // Phase 6: Reunion API
  REUNION_API_URL: string;
  REUNION_API_KEY: string;
  REUNION_WEBHOOK_SECRET: string;

  // Phase 7: Email
  RESEND_API_KEY: string;

  // Phase 8: Video Engine
  ELEVEN_LABS_API_KEY: string;
  DID_API_KEY?: string;

  // Phase 13: Media Generation
  REPLICATE_API_TOKEN: string;
  CREATOMATE_API_KEY: string;

  // Creatomate template IDs (set in wrangler.toml [vars])
  CREATOMATE_TPL_VIDEO_H?: string;
  CREATOMATE_TPL_VIDEO_V?: string;
  CREATOMATE_TPL_VIDEO_SQ?: string;
  CREATOMATE_TPL_MEME?: string;
  CREATOMATE_TPL_QUOTE?: string;

  // Vars
  ENVIRONMENT: string;
  APP_URL: string;
  CRON_SECRET?: string;
  MEDIA_SERVE_TOKEN?: string;
  R2_PUBLIC_URL?: string;
}

export function getBindings(): CloudflareEnv {
  const ctx = getRequestContext();
  return ctx.env as CloudflareEnv;
}

/**
 * Get a specific binding by name.
 * Useful when you only need one service.
 */
export function getDb(): D1Database {
  return getBindings().DB;
}

export function getBucket(): R2Bucket {
  return getBindings().BUCKET;
}

export function getKv(): KVNamespace {
  return getBindings().KV;
}
