-- GrowthOS Phase 2: Content Studio
-- Migration: 0003_content
-- Tables: content_projects, content_assets

CREATE TABLE IF NOT EXISTS content_projects (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  brief TEXT,
  doctrine_mode TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft', 'generating', 'review', 'approved', 'published', 'archived')),
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS content_assets (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES content_projects(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK(platform IN ('instagram', 'facebook', 'reddit', 'youtube', 'x', 'website', 'email', 'linkedin')),
  type TEXT NOT NULL CHECK(type IN ('caption', 'thread', 'post', 'script', 'blog', 'carousel', 'hook', 'meme_copy', 'quote_card', 'landing_copy', 'email')),
  body TEXT NOT NULL,
  metadata TEXT,
  score TEXT,
  r2_key TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  asset_status TEXT NOT NULL DEFAULT 'draft' CHECK(asset_status IN ('draft', 'review', 'approved', 'rejected')),
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_content_projects_workspace ON content_projects(workspace_id);
CREATE INDEX IF NOT EXISTS idx_content_projects_status ON content_projects(status);
CREATE INDEX IF NOT EXISTS idx_content_projects_created ON content_projects(created_at);
CREATE INDEX IF NOT EXISTS idx_content_assets_project ON content_assets(project_id);
CREATE INDEX IF NOT EXISTS idx_content_assets_status ON content_assets(asset_status);
