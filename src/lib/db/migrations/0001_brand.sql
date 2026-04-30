-- GrowthOS Phase 2: Brand Vault
-- Migration: 0001_brand
-- Tables: brand_profiles, brand_colors, brand_assets

CREATE TABLE IF NOT EXISTS brand_profiles (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  brand_name TEXT NOT NULL,
  tagline TEXT,
  mission TEXT NOT NULL,
  vision TEXT,
  tone TEXT NOT NULL,
  audience TEXT NOT NULL,
  keywords TEXT,
  guidelines TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS brand_colors (
  id TEXT PRIMARY KEY,
  brand_id TEXT NOT NULL REFERENCES brand_profiles(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  hex TEXT NOT NULL,
  usage TEXT
);

CREATE TABLE IF NOT EXISTS brand_assets (
  id TEXT PRIMARY KEY,
  brand_id TEXT NOT NULL REFERENCES brand_profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK(type IN ('logo', 'icon', 'font', 'template', 'photo')),
  name TEXT NOT NULL,
  r2_key TEXT NOT NULL,
  mime_type TEXT,
  size_bytes INTEGER,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_brand_profiles_workspace ON brand_profiles(workspace_id);
CREATE INDEX IF NOT EXISTS idx_brand_colors_brand ON brand_colors(brand_id);
CREATE INDEX IF NOT EXISTS idx_brand_assets_brand ON brand_assets(brand_id);
