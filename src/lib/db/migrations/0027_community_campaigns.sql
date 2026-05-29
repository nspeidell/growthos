-- Migration 0027: Community Auto-Post Campaigns
-- Daily AI-generated post scheduling for Facebook Groups and Reddit

CREATE TABLE IF NOT EXISTS community_campaigns (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  community_id TEXT NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1, -- boolean
  posts_per_day INTEGER NOT NULL DEFAULT 1,
  -- UTC hour to generate posts (0–23). Default 12 = 5am MT / 7am ET
  generate_at_utc_hour INTEGER NOT NULL DEFAULT 12,
  -- AI doctrine mode for content generation
  doctrine_mode TEXT NOT NULL DEFAULT 'balanced',
  -- JSON array of content pillar strings
  -- e.g. ["family connection","legacy","humor","current events","engagement"]
  content_pillars TEXT NOT NULL DEFAULT '["family connection","legacy","current events","engagement","humor"]',
  -- Extra instructions injected into the generation prompt
  custom_instructions TEXT,
  -- Whether to pull from signals table for current events context
  include_current_events INTEGER NOT NULL DEFAULT 1,
  -- Tracks last generation date (YYYY-MM-DD UTC) to prevent duplicate runs
  last_generated_date TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_community_campaigns_workspace
  ON community_campaigns(workspace_id, is_active);

CREATE INDEX IF NOT EXISTS idx_community_campaigns_community
  ON community_campaigns(community_id);
