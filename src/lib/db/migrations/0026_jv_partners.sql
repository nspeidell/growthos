-- Migration 0026: JV Marketing & Referral Tracking System
-- Partnership Attribution & Relationship Intelligence Infrastructure

-- ─── Partners (CRM) ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS partners (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  name TEXT NOT NULL,
  email TEXT,
  company_name TEXT,
  -- influencer | podcast | creator | affiliate | family_org | church | community | media
  partner_type TEXT NOT NULL DEFAULT 'affiliate',
  status TEXT NOT NULL DEFAULT 'active', -- active | paused | archived
  notes TEXT,
  -- Social / contact links
  website_url TEXT,
  social_handle TEXT,
  -- Aggregate quality signal (0–100), recomputed on each conversion event
  quality_score REAL DEFAULT 0,
  -- Lifetime totals (denormalised for fast dashboard queries)
  total_clicks INTEGER DEFAULT 0,
  total_signups INTEGER DEFAULT 0,
  total_revenue REAL DEFAULT 0,
  payout_owed REAL DEFAULT 0,
  payout_paid REAL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_partners_workspace ON partners(workspace_id);
CREATE INDEX IF NOT EXISTS idx_partners_status    ON partners(workspace_id, status);

-- ─── Partner Campaigns ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS partner_campaigns (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  partner_id TEXT NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  campaign_name TEXT NOT NULL,
  -- URL-safe slug used in short links, e.g. "summer-launch"
  campaign_slug TEXT,
  landing_page_url TEXT NOT NULL,
  -- Optional expiry (Unix ms); NULL = no expiry
  expires_at INTEGER,
  status TEXT NOT NULL DEFAULT 'active',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_pcampaigns_partner    ON partner_campaigns(partner_id);
CREATE INDEX IF NOT EXISTS idx_pcampaigns_workspace  ON partner_campaigns(workspace_id);

-- ─── Tracking Links ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tracking_links (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  partner_id TEXT NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  campaign_id TEXT REFERENCES partner_campaigns(id) ON DELETE SET NULL,
  -- 8-char alphanumeric short code — globally unique
  short_code TEXT NOT NULL UNIQUE,
  destination_url TEXT NOT NULL,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  utm_content TEXT,
  -- Attribution window in days (default 30)
  attribution_window_days INTEGER NOT NULL DEFAULT 30,
  click_count INTEGER DEFAULT 0,
  unique_click_count INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tlinks_short_code  ON tracking_links(short_code);
CREATE INDEX IF NOT EXISTS idx_tlinks_partner     ON tracking_links(partner_id);
CREATE INDEX IF NOT EXISTS idx_tlinks_workspace   ON tracking_links(workspace_id);

-- ─── Referral Visits ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS referral_visits (
  id TEXT PRIMARY KEY,
  tracking_link_id TEXT NOT NULL REFERENCES tracking_links(id) ON DELETE CASCADE,
  partner_id TEXT NOT NULL,
  -- Privacy-safe SHA-256 hashes (salted with workspace_id)
  ip_hash TEXT,
  user_agent_hash TEXT,
  referrer TEXT,
  country TEXT,
  -- desktop | mobile | tablet | bot
  device_type TEXT,
  -- Browser session identifier (random, set by redirect handler)
  session_id TEXT,
  -- Fraud flags
  is_suspicious INTEGER DEFAULT 0, -- boolean
  fraud_reason TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rvisits_link      ON referral_visits(tracking_link_id);
CREATE INDEX IF NOT EXISTS idx_rvisits_ip_hash   ON referral_visits(ip_hash, tracking_link_id);
CREATE INDEX IF NOT EXISTS idx_rvisits_created   ON referral_visits(created_at);

-- ─── Attributed Conversions ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS attributed_conversions (
  id TEXT PRIMARY KEY,
  tracking_link_id TEXT NOT NULL REFERENCES tracking_links(id) ON DELETE CASCADE,
  partner_id TEXT NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL,
  -- signup | subscription | purchase | family_invite | family_activation
  conversion_type TEXT NOT NULL DEFAULT 'signup',
  -- Revenue in USD
  conversion_value REAL DEFAULT 0,
  -- GrowthOS user who converted
  user_id TEXT,
  -- Attribution chain (JSON array of source touchpoints before this one)
  attribution_chain TEXT, -- JSON: [{source, medium, campaign, timestamp}]
  -- pending | confirmed | rejected (fraud)
  status TEXT NOT NULL DEFAULT 'pending',
  -- Days after which pending → confirmed (from commission_rules)
  confirmation_days INTEGER DEFAULT 14,
  confirmed_at INTEGER,
  -- Commission owed to partner for this conversion
  commission_amount REAL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_aconv_partner    ON attributed_conversions(partner_id);
CREATE INDEX IF NOT EXISTS idx_aconv_link       ON attributed_conversions(tracking_link_id);
CREATE INDEX IF NOT EXISTS idx_aconv_user       ON attributed_conversions(user_id);
CREATE INDEX IF NOT EXISTS idx_aconv_workspace  ON attributed_conversions(workspace_id, status);

-- ─── Commission Rules ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS commission_rules (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  -- NULL = applies to all partners; set to partner_id to override for specific partner
  partner_id TEXT REFERENCES partners(id) ON DELETE CASCADE,
  -- flat_fee | percentage | tiered
  rule_type TEXT NOT NULL DEFAULT 'flat_fee',
  -- For flat_fee: USD amount per conversion
  -- For percentage: decimal (0.10 = 10%)
  value REAL NOT NULL DEFAULT 0,
  -- Which conversion type this rule applies to (NULL = all)
  conversion_type TEXT,
  -- Milestone bonuses: JSON array [{min_conversions, bonus_amount}]
  milestones TEXT,
  is_active INTEGER DEFAULT 1,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_commrules_workspace ON commission_rules(workspace_id);
CREATE INDEX IF NOT EXISTS idx_commrules_partner   ON commission_rules(partner_id);

-- ─── Partner Payouts ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS partner_payouts (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  partner_id TEXT NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  amount REAL NOT NULL,
  -- paypal | bank | stripe | check | crypto | other
  payout_method TEXT,
  payout_reference TEXT, -- transaction ID / check number / etc.
  -- pending | paid | failed
  status TEXT NOT NULL DEFAULT 'pending',
  note TEXT,
  paid_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_payouts_partner   ON partner_payouts(partner_id);
CREATE INDEX IF NOT EXISTS idx_payouts_workspace ON partner_payouts(workspace_id, status);

-- ─── Partner Quality Snapshots ────────────────────────────────────────────────
-- Periodic snapshots of quality score components for trend analysis
CREATE TABLE IF NOT EXISTS partner_quality_snapshots (
  id TEXT PRIMARY KEY,
  partner_id TEXT NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL,
  -- Score components (0–100 each)
  retention_score REAL DEFAULT 0,       -- 30-day user retention from this partner
  activation_score REAL DEFAULT 0,      -- Avg family members activated per signup
  referral_score REAL DEFAULT 0,        -- Downstream referral propagation rate
  conversion_rate_score REAL DEFAULT 0, -- Click-to-signup rate
  churn_score REAL DEFAULT 0,           -- Inverse churn (higher = less churn)
  -- Weighted composite (see actions.ts for formula)
  quality_score REAL DEFAULT 0,
  -- Raw counts at time of snapshot
  signups_30d INTEGER DEFAULT 0,
  active_users_30d INTEGER DEFAULT 0,
  snapshot_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_pqsnap_partner ON partner_quality_snapshots(partner_id, snapshot_at);
