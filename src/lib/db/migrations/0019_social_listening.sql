-- Migration 0019: Social Listening & Opportunity Intelligence Engine
-- Phase 14: Real-time signal detection across social platforms

-- Listening data sources (Reddit, X, Google News, RSS, YouTube, forums)
CREATE TABLE IF NOT EXISTS listening_sources (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  source_type TEXT NOT NULL, -- 'reddit' | 'x' | 'google_news' | 'rss' | 'youtube' | 'forum'
  name TEXT NOT NULL,
  config TEXT NOT NULL DEFAULT '{}', -- JSON: subreddits, search queries, feed URLs, etc.
  is_active INTEGER NOT NULL DEFAULT 1,
  last_scanned_at INTEGER,
  scan_frequency_minutes INTEGER NOT NULL DEFAULT 60,
  error_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Tracked keywords for monitoring
CREATE TABLE IF NOT EXISTS tracked_keywords (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  keyword TEXT NOT NULL,
  keyword_type TEXT NOT NULL DEFAULT 'brand', -- 'brand' | 'competitor' | 'industry' | 'opportunity' | 'local'
  is_active INTEGER NOT NULL DEFAULT 1,
  match_count INTEGER NOT NULL DEFAULT 0,
  last_matched_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Detected signals (opportunities, threats, mentions, leads)
CREATE TABLE IF NOT EXISTS signals (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  source_id TEXT REFERENCES listening_sources(id),
  keyword_id TEXT REFERENCES tracked_keywords(id),

  -- Signal classification
  signal_type TEXT NOT NULL, -- 'lead_opportunity' | 'viral_trend' | 'competitor_mention' | 'negative_sentiment' | 'brand_mention' | 'community_question' | 'partnership_opportunity' | 'influencer_opportunity' | 'content_idea' | 'reputation_risk'
  priority_score INTEGER NOT NULL DEFAULT 50, -- 1-100, AI-scored
  intent TEXT, -- AI-classified: 'buying' | 'researching' | 'complaining' | 'praising' | 'asking' | 'comparing' | 'neutral'

  -- Source content
  source_platform TEXT NOT NULL, -- 'reddit' | 'x' | 'google_news' | 'youtube' | 'forum' | 'rss'
  source_url TEXT,
  source_author TEXT,
  source_author_followers INTEGER,
  title TEXT,
  content_snippet TEXT NOT NULL,
  original_content TEXT, -- Full text for AI analysis

  -- AI analysis
  ai_summary TEXT,
  ai_suggested_response TEXT,
  ai_sentiment REAL, -- -1.0 to 1.0
  ai_relevance_score REAL, -- 0.0 to 1.0
  ai_tags TEXT, -- JSON array of detected tags

  -- Status tracking
  status TEXT NOT NULL DEFAULT 'new', -- 'new' | 'reviewed' | 'actioned' | 'dismissed' | 'converted'
  actioned_type TEXT, -- 'reply' | 'content' | 'outreach' | 'swarm' | 'ignored'
  actioned_at INTEGER,
  actioned_by TEXT REFERENCES users(id),
  converted_content_id TEXT, -- Reference to content created from this signal
  converted_swarm_mission_id TEXT, -- Reference to swarm mission launched

  -- Engagement metrics (for the source post)
  engagement_likes INTEGER DEFAULT 0,
  engagement_comments INTEGER DEFAULT 0,
  engagement_shares INTEGER DEFAULT 0,
  engagement_score REAL DEFAULT 0, -- Normalized engagement metric

  -- Timestamps
  detected_at INTEGER NOT NULL DEFAULT (unixepoch()),
  source_published_at INTEGER,
  expires_at INTEGER, -- For time-sensitive opportunities
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Engagement actions taken on signals
CREATE TABLE IF NOT EXISTS engagement_actions (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  signal_id TEXT NOT NULL REFERENCES signals(id),
  action_type TEXT NOT NULL, -- 'reply' | 'dm' | 'follow' | 'like' | 'repost' | 'draft_content' | 'launch_swarm'
  platform TEXT NOT NULL,
  content TEXT, -- The reply/DM/content text
  ai_drafted INTEGER NOT NULL DEFAULT 0, -- Was this AI-generated?
  status TEXT NOT NULL DEFAULT 'draft', -- 'draft' | 'sent' | 'failed'
  sent_at INTEGER,
  response_received INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Signal alerts configuration
CREATE TABLE IF NOT EXISTS signal_alerts (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  name TEXT NOT NULL,
  alert_type TEXT NOT NULL, -- 'brand_mention' | 'high_priority' | 'negative_sentiment' | 'viral_trend' | 'competitor_alert' | 'lead_detected'
  conditions TEXT NOT NULL DEFAULT '{}', -- JSON: min_priority, signal_types[], platforms[], keywords[]
  notify_method TEXT NOT NULL DEFAULT 'in_app', -- 'in_app' | 'email' | 'slack' | 'webhook'
  notify_target TEXT, -- Email, Slack channel, webhook URL
  is_active INTEGER NOT NULL DEFAULT 1,
  last_triggered_at INTEGER,
  trigger_count INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_listening_sources_workspace ON listening_sources(workspace_id);
CREATE INDEX IF NOT EXISTS idx_tracked_keywords_workspace ON tracked_keywords(workspace_id);
CREATE INDEX IF NOT EXISTS idx_signals_workspace ON signals(workspace_id);
CREATE INDEX IF NOT EXISTS idx_signals_type ON signals(signal_type);
CREATE INDEX IF NOT EXISTS idx_signals_priority ON signals(priority_score DESC);
CREATE INDEX IF NOT EXISTS idx_signals_status ON signals(status);
CREATE INDEX IF NOT EXISTS idx_signals_platform ON signals(source_platform);
CREATE INDEX IF NOT EXISTS idx_signals_detected ON signals(detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_signals_workspace_status ON signals(workspace_id, status, priority_score DESC);
CREATE INDEX IF NOT EXISTS idx_engagement_actions_signal ON engagement_actions(signal_id);
CREATE INDEX IF NOT EXISTS idx_signal_alerts_workspace ON signal_alerts(workspace_id);
