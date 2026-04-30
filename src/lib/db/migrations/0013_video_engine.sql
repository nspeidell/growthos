-- Phase 8: High-Realism Video Engine
-- Voice profiles, content asset tagging, and trust analytics

-- Voice Profiles (ElevenLabs cloned voices)
CREATE TABLE IF NOT EXISTS voice_profiles (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  eleven_labs_voice_id TEXT NOT NULL,
  voice_sample_url TEXT,
  stability REAL DEFAULT 0.5,
  similarity_boost REAL DEFAULT 0.75,
  is_founder_voice INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE INDEX idx_voice_profiles_workspace ON voice_profiles(workspace_id);
CREATE INDEX idx_voice_profiles_founder ON voice_profiles(workspace_id, is_founder_voice);

-- Extend content_assets with video B-roll tagging
ALTER TABLE content_assets ADD COLUMN subject_tags TEXT;
ALTER TABLE content_assets ADD COLUMN emotional_vibe TEXT;
ALTER TABLE content_assets ADD COLUMN is_ugc INTEGER DEFAULT 0;

-- Extend media_jobs with voice profile reference
ALTER TABLE media_jobs ADD COLUMN voice_profile_id TEXT REFERENCES voice_profiles(id);

-- Extend post_metrics with trust analytics
ALTER TABLE post_metrics ADD COLUMN sentiment_score REAL;
ALTER TABLE post_metrics ADD COLUMN trust_flag TEXT CHECK (trust_flag IN ('trusted', 'suspect', 'flagged'));
