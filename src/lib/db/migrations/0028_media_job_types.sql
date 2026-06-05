-- Migration 0028: Add carousel, avatar_video to media_jobs type enum + did to provider enum
-- Uses explicit column list to handle any pre-existing column differences.

CREATE TABLE IF NOT EXISTS media_jobs_new (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK(type IN (
    'meme','quote_card','thumbnail','promo',
    'carousel_slide','carousel','ad_creative',
    'video_composite','avatar_video'
  )),
  prompt TEXT NOT NULL,
  provider TEXT NOT NULL CHECK(provider IN (
    'replicate','together','cloudflare','elevenlabs','did'
  )),
  voice_profile_id TEXT REFERENCES voice_profiles(id),
  config TEXT,
  job_status TEXT NOT NULL DEFAULT 'queued' CHECK(job_status IN (
    'queued','processing','completed','failed'
  )),
  result_r2_key TEXT,
  error_message TEXT,
  replicate_prediction_id TEXT,
  created_by TEXT REFERENCES users(id),
  created_at INTEGER,
  completed_at INTEGER
);

-- Copy existing rows using explicit columns (safe even if replicate_prediction_id didn't exist before)
INSERT INTO media_jobs_new
  (id, workspace_id, type, prompt, provider, voice_profile_id, config,
   job_status, result_r2_key, error_message, created_by, created_at, completed_at)
SELECT
  id, workspace_id, type, prompt, provider, voice_profile_id, config,
  job_status, result_r2_key, error_message, created_by, created_at, completed_at
FROM media_jobs;

DROP TABLE media_jobs;
ALTER TABLE media_jobs_new RENAME TO media_jobs;

CREATE INDEX IF NOT EXISTS idx_media_jobs_workspace ON media_jobs(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_media_jobs_status ON media_jobs(job_status, created_at ASC);
