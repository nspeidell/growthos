-- GrowthOS Phase 2: AI Media Studio
-- Migration: 0004_media
-- Tables: media_jobs

CREATE TABLE IF NOT EXISTS media_jobs (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK(type IN ('meme', 'quote_card', 'thumbnail', 'promo', 'carousel_slide', 'ad_creative', 'video_composite')),
  prompt TEXT NOT NULL,
  provider TEXT NOT NULL CHECK(provider IN ('replicate', 'together', 'cloudflare', 'elevenlabs')),
  config TEXT,
  job_status TEXT NOT NULL DEFAULT 'queued' CHECK(job_status IN ('queued', 'processing', 'completed', 'failed')),
  result_r2_key TEXT,
  error_message TEXT,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL,
  completed_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_media_jobs_workspace ON media_jobs(workspace_id);
CREATE INDEX IF NOT EXISTS idx_media_jobs_status ON media_jobs(job_status);
CREATE INDEX IF NOT EXISTS idx_media_jobs_created ON media_jobs(created_at);
