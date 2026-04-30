-- GrowthOS Phase 5: Analytics
-- Migration: 0008_analytics
-- Tables: post_metrics

CREATE TABLE IF NOT EXISTS post_metrics (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL REFERENCES scheduled_posts(id) ON DELETE CASCADE,
  impressions INTEGER DEFAULT 0,
  reach INTEGER DEFAULT 0,
  likes INTEGER DEFAULT 0,
  comments INTEGER DEFAULT 0,
  shares INTEGER DEFAULT 0,
  saves INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  conversions INTEGER DEFAULT 0,
  engagement_rate TEXT,
  fetched_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_post_metrics_post ON post_metrics(post_id);
CREATE INDEX IF NOT EXISTS idx_post_metrics_fetched ON post_metrics(fetched_at);
