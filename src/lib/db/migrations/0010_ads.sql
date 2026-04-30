-- GrowthOS Phase 6: Ads + Reunion
-- Migration: 0010_ads
-- Tables: ad_campaigns, ad_variants, reunion_campaigns

CREATE TABLE IF NOT EXISTS ad_campaigns (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK(platform IN ('meta', 'google', 'x')),
  name TEXT NOT NULL,
  objective TEXT NOT NULL CHECK(objective IN ('awareness', 'traffic', 'engagement', 'conversions', 'app_installs')),
  campaign_status TEXT NOT NULL DEFAULT 'draft' CHECK(campaign_status IN ('draft', 'active', 'paused', 'completed', 'archived')),
  budget_daily REAL,
  budget_total REAL,
  spend REAL DEFAULT 0,
  impressions INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  conversions INTEGER DEFAULT 0,
  start_date INTEGER,
  end_date INTEGER,
  targeting TEXT,
  creative_asset_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS ad_variants (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES ad_campaigns(id) ON DELETE CASCADE,
  headline TEXT NOT NULL,
  body TEXT NOT NULL,
  cta_text TEXT,
  landing_url TEXT,
  image_r2_key TEXT,
  is_winner INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS reunion_campaigns (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK(type IN ('push', 'invite_reminder', 'reactivation', 'announcement', 'onboarding')),
  name TEXT NOT NULL,
  segment TEXT,
  content TEXT,
  campaign_status TEXT NOT NULL DEFAULT 'draft' CHECK(campaign_status IN ('draft', 'scheduled', 'active', 'paused', 'completed')),
  scheduled_for INTEGER,
  sent_count INTEGER DEFAULT 0,
  opened_count INTEGER DEFAULT 0,
  clicked_count INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL
);

-- Ad campaigns indexes
CREATE INDEX IF NOT EXISTS idx_ad_campaigns_workspace ON ad_campaigns(workspace_id);
CREATE INDEX IF NOT EXISTS idx_ad_campaigns_status ON ad_campaigns(campaign_status);
CREATE INDEX IF NOT EXISTS idx_ad_campaigns_platform ON ad_campaigns(platform);

-- Ad variants indexes
CREATE INDEX IF NOT EXISTS idx_ad_variants_campaign ON ad_variants(campaign_id);

-- Reunion campaigns indexes
CREATE INDEX IF NOT EXISTS idx_reunion_campaigns_workspace ON reunion_campaigns(workspace_id);
CREATE INDEX IF NOT EXISTS idx_reunion_campaigns_status ON reunion_campaigns(campaign_status);
CREATE INDEX IF NOT EXISTS idx_reunion_campaigns_type ON reunion_campaigns(type);
