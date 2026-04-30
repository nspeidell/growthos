-- GrowthOS Phase 4: Competitor Intelligence
-- Migration: 0007_competitors
-- Tables: competitors, competitor_posts

CREATE TABLE IF NOT EXISTS competitors (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  platform TEXT NOT NULL,
  handle TEXT,
  url TEXT,
  niche TEXT,
  notes TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS competitor_posts (
  id TEXT PRIMARY KEY,
  competitor_id TEXT NOT NULL REFERENCES competitors(id) ON DELETE CASCADE,
  post_url TEXT,
  post_date INTEGER,
  content TEXT,
  metrics TEXT,
  ai_analysis TEXT,
  tags TEXT,
  scraped_at INTEGER NOT NULL
);

-- Competitors indexes
CREATE INDEX IF NOT EXISTS idx_competitors_workspace ON competitors(workspace_id);
CREATE INDEX IF NOT EXISTS idx_competitors_active ON competitors(is_active);
CREATE INDEX IF NOT EXISTS idx_competitors_platform ON competitors(platform);

-- Competitor posts indexes
CREATE INDEX IF NOT EXISTS idx_competitor_posts_competitor ON competitor_posts(competitor_id);
CREATE INDEX IF NOT EXISTS idx_competitor_posts_date ON competitor_posts(post_date);
CREATE INDEX IF NOT EXISTS idx_competitor_posts_scraped ON competitor_posts(scraped_at);
