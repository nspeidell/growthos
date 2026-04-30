-- GrowthOS Migration: 0017_content_assets_types
-- Expand content_assets platform and type CHECK constraints to include
-- all 16 platforms and 15 content types.

-- Step 1: Create new table with expanded constraints
CREATE TABLE content_assets_new (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES content_projects(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK(platform IN (
    'instagram', 'facebook', 'reddit', 'youtube', 'x', 'website', 'email',
    'linkedin', 'pinterest', 'tiktok', 'threads', 'google_business',
    'wordpress', 'medium', 'ghost', 'substack'
  )),
  type TEXT NOT NULL CHECK(type IN (
    'caption', 'thread', 'post', 'script', 'blog', 'carousel', 'hook',
    'meme_copy', 'quote_card', 'landing_copy', 'email', 'newsletter',
    'pin', 'story', 'reel_script'
  )),
  body TEXT NOT NULL,
  metadata TEXT,
  score TEXT,
  r2_key TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  asset_status TEXT NOT NULL DEFAULT 'draft' CHECK(asset_status IN ('draft', 'review', 'approved', 'rejected')),
  created_at INTEGER NOT NULL,
  subject_tags TEXT,
  emotional_vibe TEXT,
  is_ugc INTEGER DEFAULT 0
);

-- Step 2: Copy existing data
INSERT INTO content_assets_new
  SELECT id, project_id, platform, type, body, metadata, score, r2_key,
         version, asset_status, created_at, subject_tags, emotional_vibe, is_ugc
  FROM content_assets;

-- Step 3: Drop old table and rename
DROP TABLE content_assets;
ALTER TABLE content_assets_new RENAME TO content_assets;

-- Step 4: Recreate indexes
CREATE INDEX IF NOT EXISTS idx_content_assets_project ON content_assets(project_id);
CREATE INDEX IF NOT EXISTS idx_content_assets_status ON content_assets(asset_status);
