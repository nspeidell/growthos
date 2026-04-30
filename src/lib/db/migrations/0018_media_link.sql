-- Migration: 0018_media_link
-- Adds media_job_id to content_assets for linking generated media
-- Updates media_jobs provider/type constraints for new providers

ALTER TABLE content_assets ADD COLUMN media_job_id TEXT;

CREATE INDEX IF NOT EXISTS idx_content_assets_media_job ON content_assets(media_job_id);
