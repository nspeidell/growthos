-- GrowthOS Phase 4: SEO & AEO Engine
-- Migration: 0006_seo
-- Tables: keywords, pages, internal_links

CREATE TABLE IF NOT EXISTS keywords (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  phrase TEXT NOT NULL,
  volume INTEGER,
  difficulty INTEGER,
  intent TEXT CHECK(intent IN ('informational', 'navigational', 'transactional', 'commercial')),
  cluster TEXT,
  priority TEXT NOT NULL DEFAULT 'medium' CHECK(priority IN ('high', 'medium', 'low')),
  status TEXT NOT NULL DEFAULT 'research' CHECK(status IN ('research', 'targeting', 'ranking', 'archived')),
  current_rank INTEGER,
  target_url TEXT,
  last_checked INTEGER,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS pages (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  meta_title TEXT,
  meta_desc TEXT,
  h1 TEXT,
  body TEXT,
  schema_type TEXT CHECK(schema_type IN ('Article', 'FAQPage', 'HowTo', 'Product', 'Organization')),
  schema_json TEXT,
  og_image TEXT,
  canonical_url TEXT,
  page_status TEXT NOT NULL DEFAULT 'draft' CHECK(page_status IN ('draft', 'published', 'archived')),
  published_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS internal_links (
  id TEXT PRIMARY KEY,
  from_page_id TEXT NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  to_page_id TEXT NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  anchor_text TEXT NOT NULL,
  position TEXT
);

-- Keywords indexes
CREATE INDEX IF NOT EXISTS idx_keywords_workspace ON keywords(workspace_id);
CREATE INDEX IF NOT EXISTS idx_keywords_status ON keywords(status);
CREATE INDEX IF NOT EXISTS idx_keywords_priority ON keywords(priority);
CREATE INDEX IF NOT EXISTS idx_keywords_cluster ON keywords(cluster);

-- Pages indexes
CREATE INDEX IF NOT EXISTS idx_pages_workspace ON pages(workspace_id);
CREATE INDEX IF NOT EXISTS idx_pages_slug ON pages(slug);
CREATE INDEX IF NOT EXISTS idx_pages_status ON pages(page_status);

-- Internal links indexes
CREATE INDEX IF NOT EXISTS idx_internal_links_from ON internal_links(from_page_id);
CREATE INDEX IF NOT EXISTS idx_internal_links_to ON internal_links(to_page_id);
