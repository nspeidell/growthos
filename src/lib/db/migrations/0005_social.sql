-- GrowthOS Phase 3: Publisher
-- Migration: 0005_social
-- Tables: connected_accounts, scheduled_posts

CREATE TABLE IF NOT EXISTS connected_accounts (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK(platform IN ('instagram', 'facebook', 'youtube', 'x', 'reddit')),
  platform_account_id TEXT NOT NULL,
  platform_username TEXT,
  platform_avatar_url TEXT,
  access_token_encrypted TEXT NOT NULL,
  refresh_token_encrypted TEXT,
  token_expires_at INTEGER,
  scopes TEXT,
  account_status TEXT NOT NULL DEFAULT 'active' CHECK(account_status IN ('active', 'expired', 'revoked', 'error')),
  last_used_at INTEGER,
  connected_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS scheduled_posts (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  content_asset_id TEXT NOT NULL REFERENCES content_assets(id) ON DELETE CASCADE,
  connected_account_id TEXT NOT NULL REFERENCES connected_accounts(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK(platform IN ('instagram', 'facebook', 'youtube', 'x', 'reddit')),
  scheduled_for INTEGER NOT NULL,
  post_status TEXT NOT NULL DEFAULT 'draft' CHECK(post_status IN ('draft', 'queued', 'approved', 'publishing', 'published', 'failed', 'cancelled')),
  approval_mode TEXT NOT NULL DEFAULT 'manual' CHECK(approval_mode IN ('manual', 'autonomous')),
  approved_by TEXT REFERENCES users(id),
  approved_at INTEGER,
  published_at INTEGER,
  platform_post_id TEXT,
  platform_post_url TEXT,
  error_message TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  metadata TEXT,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Connected accounts indexes
CREATE INDEX IF NOT EXISTS idx_connected_accounts_workspace ON connected_accounts(workspace_id);
CREATE INDEX IF NOT EXISTS idx_connected_accounts_platform ON connected_accounts(platform);
CREATE INDEX IF NOT EXISTS idx_connected_accounts_status ON connected_accounts(account_status);
CREATE INDEX IF NOT EXISTS idx_connected_accounts_expiry ON connected_accounts(token_expires_at);

-- Scheduled posts indexes
CREATE INDEX IF NOT EXISTS idx_scheduled_posts_workspace ON scheduled_posts(workspace_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_posts_status ON scheduled_posts(post_status);
CREATE INDEX IF NOT EXISTS idx_scheduled_posts_scheduled ON scheduled_posts(scheduled_for);
CREATE INDEX IF NOT EXISTS idx_scheduled_posts_account ON scheduled_posts(connected_account_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_posts_asset ON scheduled_posts(content_asset_id);
