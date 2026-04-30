-- ═══════════════════════════════════════════
-- Migration 0016: Expand platform support
-- Add Pinterest, LinkedIn, TikTok, Google Business, Threads, WordPress, Medium, Ghost, Substack
-- ═══════════════════════════════════════════

-- SQLite doesn't support ALTER TABLE to modify CHECK constraints.
-- We need to recreate the tables with expanded constraints.

-- 1. Expand connected_accounts
CREATE TABLE IF NOT EXISTS connected_accounts_new (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK(platform IN (
    'instagram', 'facebook', 'youtube', 'x', 'reddit',
    'pinterest', 'linkedin', 'tiktok', 'google_business', 'threads', 'wordpress',
    'medium', 'ghost', 'substack'
  )),
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

INSERT OR IGNORE INTO connected_accounts_new SELECT * FROM connected_accounts;
DROP TABLE IF EXISTS connected_accounts;
ALTER TABLE connected_accounts_new RENAME TO connected_accounts;

CREATE INDEX IF NOT EXISTS idx_connected_accounts_workspace ON connected_accounts(workspace_id, platform);
CREATE INDEX IF NOT EXISTS idx_connected_accounts_status ON connected_accounts(account_status);

-- 2. Expand scheduled_posts platform constraint
CREATE TABLE IF NOT EXISTS scheduled_posts_new (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  content_asset_id TEXT NOT NULL REFERENCES content_assets(id) ON DELETE CASCADE,
  connected_account_id TEXT NOT NULL REFERENCES connected_accounts(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK(platform IN (
    'instagram', 'facebook', 'youtube', 'x', 'reddit',
    'pinterest', 'linkedin', 'tiktok', 'google_business', 'threads', 'wordpress',
    'medium', 'ghost', 'substack'
  )),
  scheduled_for INTEGER NOT NULL,
  post_status TEXT NOT NULL DEFAULT 'draft' CHECK(post_status IN (
    'draft', 'queued', 'approved', 'publishing', 'published', 'failed', 'cancelled'
  )),
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

INSERT OR IGNORE INTO scheduled_posts_new SELECT * FROM scheduled_posts;
DROP TABLE IF EXISTS scheduled_posts;
ALTER TABLE scheduled_posts_new RENAME TO scheduled_posts;

CREATE INDEX IF NOT EXISTS idx_scheduled_posts_workspace ON scheduled_posts(workspace_id, post_status);
CREATE INDEX IF NOT EXISTS idx_scheduled_posts_schedule ON scheduled_posts(scheduled_for, post_status);
