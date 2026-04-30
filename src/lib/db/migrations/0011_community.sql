-- Phase 7B: Community Engine tables
-- Communities (Facebook Groups, Reddit communities, etc.)

CREATE TABLE IF NOT EXISTS communities (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('facebook', 'reddit', 'discord', 'slack')),
  platform_id TEXT,
  name TEXT NOT NULL,
  description TEXT,
  member_count INTEGER DEFAULT 0,
  post_count INTEGER DEFAULT 0,
  connected_account_id TEXT REFERENCES connected_accounts(id),
  community_status TEXT NOT NULL DEFAULT 'active' CHECK (community_status IN ('active', 'paused', 'archived')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX idx_communities_workspace ON communities(workspace_id);
CREATE INDEX idx_communities_platform ON communities(workspace_id, platform);

-- Community Posts

CREATE TABLE IF NOT EXISTS community_posts (
  id TEXT PRIMARY KEY,
  community_id TEXT NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  title TEXT,
  body TEXT NOT NULL,
  post_type TEXT NOT NULL DEFAULT 'text' CHECK (post_type IN ('text', 'image', 'link', 'poll', 'video')),
  platform_post_id TEXT,
  post_status TEXT NOT NULL DEFAULT 'draft' CHECK (post_status IN ('draft', 'scheduled', 'published', 'failed')),
  scheduled_for INTEGER,
  published_at INTEGER,
  likes INTEGER DEFAULT 0,
  comments INTEGER DEFAULT 0,
  shares INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE INDEX idx_community_posts_community ON community_posts(community_id);
CREATE INDEX idx_community_posts_workspace ON community_posts(workspace_id);
CREATE INDEX idx_community_posts_status ON community_posts(workspace_id, post_status);

-- Community Members (tracked for engagement scoring)

CREATE TABLE IF NOT EXISTS community_members (
  id TEXT PRIMARY KEY,
  community_id TEXT NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  platform_user_id TEXT NOT NULL,
  display_name TEXT,
  role TEXT DEFAULT 'member' CHECK (role IN ('member', 'moderator', 'admin')),
  engagement_score INTEGER DEFAULT 0,
  joined_at INTEGER NOT NULL
);

CREATE INDEX idx_community_members_community ON community_members(community_id);
CREATE UNIQUE INDEX idx_community_members_unique ON community_members(community_id, platform_user_id);
