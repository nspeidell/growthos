-- Migration 0024: Influencer Marketing Module
-- Social Cat-compatible influencer CRM, campaign management, content tracking, and ROI

-- ─── Core Influencer CRM ───

CREATE TABLE IF NOT EXISTS influencers (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),

  -- Identity
  name TEXT NOT NULL,
  handle TEXT NOT NULL,                     -- @username (without @)
  platform TEXT NOT NULL,                   -- 'instagram' | 'tiktok' | 'youtube' | 'x' | 'pinterest' | 'other'
  profile_url TEXT,
  avatar_url TEXT,
  email TEXT,
  location TEXT,

  -- Audience metrics (manually entered or auto-refreshed)
  follower_count INTEGER NOT NULL DEFAULT 0,
  following_count INTEGER NOT NULL DEFAULT 0,
  post_count INTEGER NOT NULL DEFAULT 0,
  avg_engagement_rate REAL,                 -- e.g. 0.045 = 4.5%
  avg_likes INTEGER,
  avg_comments INTEGER,
  avg_views INTEGER,                        -- for video platforms

  -- Classification
  niche TEXT,                               -- 'fitness' | 'food' | 'travel' | etc.
  tier TEXT NOT NULL DEFAULT 'micro'        -- 'nano' (<5K) | 'micro' (5K-50K) | 'mid' (50K-500K) | 'macro' (500K+) | 'mega' (1M+)
    CHECK (tier IN ('nano', 'micro', 'mid', 'macro', 'mega')),
  audience_age_range TEXT,                  -- e.g. '18-34'
  audience_gender TEXT,                     -- e.g. 'mostly female'
  audience_location TEXT,                   -- e.g. 'USA 60%, UK 20%'
  content_style TEXT,                       -- AI or manual: 'educational' | 'entertaining' | 'lifestyle' etc.

  -- Relationship
  status TEXT NOT NULL DEFAULT 'prospecting'
    CHECK (status IN ('prospecting', 'outreach', 'negotiating', 'active', 'completed', 'rejected', 'blacklisted')),
  source TEXT NOT NULL DEFAULT 'manual'     -- 'manual' | 'social_cat' | 'signal' | 'referral'
    CHECK (source IN ('manual', 'social_cat', 'signal', 'referral')),
  social_cat_url TEXT,                      -- link to their Social Cat profile if applicable
  discovered_via_signal_id TEXT REFERENCES signals(id),

  -- Notes
  notes TEXT,
  tags TEXT NOT NULL DEFAULT '[]',          -- JSON array of custom tags
  ai_summary TEXT,                          -- AI-generated brief on why this influencer fits

  -- Metrics refresh
  metrics_refreshed_at INTEGER,

  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_influencers_workspace ON influencers(workspace_id);
CREATE INDEX IF NOT EXISTS idx_influencers_platform ON influencers(workspace_id, platform);
CREATE INDEX IF NOT EXISTS idx_influencers_status ON influencers(workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_influencers_tier ON influencers(workspace_id, tier);

-- ─── Influencer Campaigns ───

CREATE TABLE IF NOT EXISTS influencer_campaigns (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),

  name TEXT NOT NULL,
  description TEXT,
  goal TEXT,                                -- campaign objective / brief

  -- Campaign type and terms
  campaign_type TEXT NOT NULL DEFAULT 'gifted'
    CHECK (campaign_type IN ('gifted', 'paid', 'affiliate', 'ugc', 'ambassador')),
  budget_cents INTEGER NOT NULL DEFAULT 0,  -- total budget in cents
  spent_cents INTEGER NOT NULL DEFAULT 0,

  -- Dates
  start_date INTEGER,                       -- Unix seconds
  end_date INTEGER,

  -- Performance targets
  target_reach INTEGER,
  target_engagements INTEGER,
  target_conversions INTEGER,

  -- Tracking
  promo_code TEXT,                          -- campaign-level default promo code
  utm_params TEXT,                          -- JSON: utm_source, utm_medium, utm_campaign, utm_content
  conversions INTEGER NOT NULL DEFAULT 0,
  revenue_cents INTEGER NOT NULL DEFAULT 0, -- attributed revenue

  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'active', 'paused', 'completed', 'cancelled')),

  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_influencer_campaigns_workspace ON influencer_campaigns(workspace_id);
CREATE INDEX IF NOT EXISTS idx_influencer_campaigns_status ON influencer_campaigns(workspace_id, status);

-- ─── Campaign Members (influencer ↔ campaign join) ───

CREATE TABLE IF NOT EXISTS influencer_campaign_members (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  campaign_id TEXT NOT NULL REFERENCES influencer_campaigns(id) ON DELETE CASCADE,
  influencer_id TEXT NOT NULL REFERENCES influencers(id) ON DELETE CASCADE,

  -- Member-specific terms
  status TEXT NOT NULL DEFAULT 'invited'
    CHECK (status IN ('invited', 'accepted', 'declined', 'content_due', 'content_submitted', 'content_live', 'completed', 'dropped')),
  deal_type TEXT NOT NULL DEFAULT 'gifted'
    CHECK (deal_type IN ('gifted', 'paid', 'affiliate', 'ugc', 'ambassador')),
  fee_cents INTEGER NOT NULL DEFAULT 0,     -- agreed payment to influencer
  promo_code TEXT,                          -- member-specific promo code
  deliverables TEXT,                        -- e.g. "2 feed posts + 3 stories"
  content_due_at INTEGER,                   -- deadline Unix seconds
  brief_sent_at INTEGER,
  agreed_at INTEGER,

  -- Notes
  notes TEXT,

  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),

  UNIQUE(campaign_id, influencer_id)
);

CREATE INDEX IF NOT EXISTS idx_icm_campaign ON influencer_campaign_members(campaign_id);
CREATE INDEX IF NOT EXISTS idx_icm_influencer ON influencer_campaign_members(influencer_id);
CREATE INDEX IF NOT EXISTS idx_icm_status ON influencer_campaign_members(workspace_id, status);

-- ─── Influencer Content Posts ───

CREATE TABLE IF NOT EXISTS influencer_content (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  campaign_id TEXT REFERENCES influencer_campaigns(id) ON DELETE SET NULL,
  member_id TEXT REFERENCES influencer_campaign_members(id) ON DELETE SET NULL,
  influencer_id TEXT NOT NULL REFERENCES influencers(id) ON DELETE CASCADE,

  -- Content details
  platform TEXT NOT NULL,
  post_url TEXT,
  post_type TEXT NOT NULL DEFAULT 'post'
    CHECK (post_type IN ('post', 'reel', 'story', 'video', 'short', 'thread', 'pin')),
  caption TEXT,
  published_at INTEGER,

  -- Performance (manually entered or refreshed via platform API)
  reach INTEGER NOT NULL DEFAULT 0,
  impressions INTEGER NOT NULL DEFAULT 0,
  likes INTEGER NOT NULL DEFAULT 0,
  comments INTEGER NOT NULL DEFAULT 0,
  shares INTEGER NOT NULL DEFAULT 0,
  saves INTEGER NOT NULL DEFAULT 0,
  views INTEGER NOT NULL DEFAULT 0,
  clicks INTEGER NOT NULL DEFAULT 0,
  engagement_rate REAL,

  -- Attribution
  promo_code_uses INTEGER NOT NULL DEFAULT 0,
  conversions INTEGER NOT NULL DEFAULT 0,
  revenue_cents INTEGER NOT NULL DEFAULT 0,

  -- Refresh tracking
  metrics_refreshed_at INTEGER,

  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_influencer_content_workspace ON influencer_content(workspace_id);
CREATE INDEX IF NOT EXISTS idx_influencer_content_campaign ON influencer_content(campaign_id);
CREATE INDEX IF NOT EXISTS idx_influencer_content_influencer ON influencer_content(influencer_id);
