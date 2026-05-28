-- Fix media_jobs CHECK constraint to include video_composite.
-- SQLite can't ALTER a CHECK constraint, so we recreate the table.
-- Exact column set matches what's live in D1 (13 columns).

CREATE TABLE media_jobs_new (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK(type IN ('meme', 'quote_card', 'thumbnail', 'promo', 'carousel_slide', 'ad_creative', 'video_composite')),
  prompt TEXT NOT NULL,
  provider TEXT NOT NULL CHECK(provider IN ('replicate', 'together', 'cloudflare', 'elevenlabs')),
  voice_profile_id TEXT REFERENCES voice_profiles(id),
  config TEXT,
  job_status TEXT NOT NULL DEFAULT 'queued' CHECK(job_status IN ('queued', 'processing', 'completed', 'failed')),
  result_r2_key TEXT,
  error_message TEXT,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL,
  completed_at INTEGER
);

INSERT INTO media_jobs_new
  SELECT id, workspace_id, type, prompt, provider, voice_profile_id, config,
         job_status, result_r2_key, error_message, created_by, created_at, completed_at
  FROM media_jobs;

DROP TABLE media_jobs;
ALTER TABLE media_jobs_new RENAME TO media_jobs;

CREATE INDEX IF NOT EXISTS idx_media_jobs_workspace ON media_jobs(workspace_id);
CREATE INDEX IF NOT EXISTS idx_media_jobs_status ON media_jobs(job_status);
CREATE INDEX IF NOT EXISTS idx_media_jobs_created ON media_jobs(created_at);
