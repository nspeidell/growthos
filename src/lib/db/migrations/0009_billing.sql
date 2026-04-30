-- GrowthOS Phase 5: Billing
-- Migration: 0009_billing
-- Tables: subscriptions, usage_records

CREATE TABLE IF NOT EXISTS subscriptions (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  stripe_subscription_id TEXT NOT NULL UNIQUE,
  stripe_price_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('active', 'past_due', 'canceled', 'trialing', 'incomplete')),
  current_period_start INTEGER,
  current_period_end INTEGER,
  cancel_at_period_end INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS usage_records (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  metric TEXT NOT NULL CHECK(metric IN ('content_generated', 'media_generated', 'posts_published', 'api_calls')),
  count INTEGER NOT NULL DEFAULT 1,
  period_start INTEGER NOT NULL,
  period_end INTEGER NOT NULL
);

-- Subscriptions indexes
CREATE INDEX IF NOT EXISTS idx_subscriptions_workspace ON subscriptions(workspace_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe ON subscriptions(stripe_subscription_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);

-- Usage records indexes
CREATE INDEX IF NOT EXISTS idx_usage_records_workspace ON usage_records(workspace_id);
CREATE INDEX IF NOT EXISTS idx_usage_records_metric ON usage_records(metric);
CREATE INDEX IF NOT EXISTS idx_usage_records_period ON usage_records(period_start);
