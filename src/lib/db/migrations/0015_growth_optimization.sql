-- Phase 12: Growth Optimization Engine
-- 5 tables for the autonomous experimentation system

-- ─── Experiments ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS growth_experiments (
  id                   TEXT PRIMARY KEY,
  workspace_id         TEXT NOT NULL,
  name                 TEXT NOT NULL,
  module_source        TEXT NOT NULL CHECK (module_source IN ('content', 'publisher', 'ads', 'newsletter', 'swarm', 'funnel')),
  campaign_id          TEXT,
  experiment_type      TEXT NOT NULL CHECK (experiment_type IN ('ab', 'multivariate', 'bandit', 'sequential')),
  status               TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused', 'won', 'archived')),
  objective_metric     TEXT NOT NULL CHECK (objective_metric IN ('clicks', 'conversions', 'revenue', 'opens', 'replies', 'engagement', 'ctr', 'roas', 'cpl', 'cac')),
  confidence_threshold REAL NOT NULL DEFAULT 0.95,
  auto_promote_winner  INTEGER NOT NULL DEFAULT 0,
  auto_kill_losers     INTEGER NOT NULL DEFAULT 0,
  traffic_strategy     TEXT NOT NULL DEFAULT 'equal' CHECK (traffic_strategy IN ('equal', 'weighted', 'bandit', 'sequential')),
  min_sample_size      INTEGER NOT NULL DEFAULT 100,
  budget_cap_cents     INTEGER,
  start_date           TEXT,
  end_date             TEXT,
  created_by           TEXT NOT NULL,
  created_at           TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at           TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_growth_experiments_workspace ON growth_experiments(workspace_id);
CREATE INDEX idx_growth_experiments_status ON growth_experiments(status);
CREATE INDEX idx_growth_experiments_module ON growth_experiments(module_source);

-- ─── Variants ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS growth_variants (
  id                   TEXT PRIMARY KEY,
  experiment_id        TEXT NOT NULL REFERENCES growth_experiments(id) ON DELETE CASCADE,
  label                TEXT NOT NULL,
  allocation_percent   REAL NOT NULL DEFAULT 50.0,
  content_json         TEXT NOT NULL DEFAULT '{}',
  is_control           INTEGER NOT NULL DEFAULT 0,
  ai_generated         INTEGER NOT NULL DEFAULT 0,
  active               INTEGER NOT NULL DEFAULT 1,
  impressions          INTEGER NOT NULL DEFAULT 0,
  conversions          INTEGER NOT NULL DEFAULT 0,
  revenue_cents        INTEGER NOT NULL DEFAULT 0,
  created_at           TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_growth_variants_experiment ON growth_variants(experiment_id);

-- ─── Events (high-volume impression/conversion tracking) ──────────────────────

CREATE TABLE IF NOT EXISTS growth_events (
  id                   TEXT PRIMARY KEY,
  experiment_id        TEXT NOT NULL REFERENCES growth_experiments(id) ON DELETE CASCADE,
  variant_id           TEXT NOT NULL REFERENCES growth_variants(id) ON DELETE CASCADE,
  event_type           TEXT NOT NULL CHECK (event_type IN ('impression', 'click', 'lead', 'purchase', 'open', 'reply', 'engagement', 'bounce')),
  revenue_value_cents  INTEGER DEFAULT 0,
  user_hash            TEXT NOT NULL,
  metadata_json        TEXT DEFAULT '{}',
  created_at           TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_growth_events_experiment ON growth_events(experiment_id);
CREATE INDEX idx_growth_events_variant ON growth_events(variant_id);
CREATE INDEX idx_growth_events_type ON growth_events(event_type);
CREATE INDEX idx_growth_events_time ON growth_events(created_at);

-- ─── Results (computed outcomes per experiment) ───────────────────────────────

CREATE TABLE IF NOT EXISTS growth_results (
  id                   TEXT PRIMARY KEY,
  experiment_id        TEXT NOT NULL REFERENCES growth_experiments(id) ON DELETE CASCADE,
  winning_variant_id   TEXT REFERENCES growth_variants(id),
  confidence_score     REAL NOT NULL DEFAULT 0.0,
  lift_percent         REAL NOT NULL DEFAULT 0.0,
  estimated_revenue_gain_cents INTEGER NOT NULL DEFAULT 0,
  test_method          TEXT NOT NULL DEFAULT 'z_test' CHECK (test_method IN ('z_test', 'chi_square', 'bayesian', 'sequential')),
  sample_size_control  INTEGER NOT NULL DEFAULT 0,
  sample_size_variant  INTEGER NOT NULL DEFAULT 0,
  p_value              REAL,
  effect_size          REAL,
  power                REAL,
  auto_resolved        INTEGER NOT NULL DEFAULT 0,
  resolved_at          TEXT,
  created_at           TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at           TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_growth_results_experiment ON growth_results(experiment_id);

-- ─── Insights (learning memory / compounding intelligence) ────────────────────

CREATE TABLE IF NOT EXISTS growth_insights (
  id                        TEXT PRIMARY KEY,
  workspace_id              TEXT NOT NULL,
  category                  TEXT NOT NULL CHECK (category IN ('headline', 'cta', 'subject_line', 'send_time', 'audience', 'creative', 'pricing', 'channel', 'general')),
  finding                   TEXT NOT NULL,
  confidence_score          REAL NOT NULL DEFAULT 0.0,
  lift_percent              REAL,
  sample_size               INTEGER,
  source_experiment_ids     TEXT NOT NULL DEFAULT '[]',
  module_source             TEXT,
  applicable_industries     TEXT DEFAULT '[]',
  times_validated           INTEGER NOT NULL DEFAULT 1,
  last_validated_at         TEXT,
  created_at                TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at                TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_growth_insights_workspace ON growth_insights(workspace_id);
CREATE INDEX idx_growth_insights_category ON growth_insights(category);
CREATE INDEX idx_growth_insights_confidence ON growth_insights(confidence_score);

-- ─── Audit Log (enterprise safety) ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS growth_audit_log (
  id                   TEXT PRIMARY KEY,
  workspace_id         TEXT NOT NULL,
  experiment_id        TEXT REFERENCES growth_experiments(id),
  action               TEXT NOT NULL CHECK (action IN ('created', 'started', 'paused', 'resumed', 'winner_promoted', 'loser_killed', 'traffic_rebalanced', 'rollback', 'manual_override', 'auto_resolved', 'budget_exceeded', 'anomaly_detected')),
  actor                TEXT NOT NULL DEFAULT 'system',
  details_json         TEXT DEFAULT '{}',
  created_at           TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_growth_audit_workspace ON growth_audit_log(workspace_id);
CREATE INDEX idx_growth_audit_experiment ON growth_audit_log(experiment_id);
CREATE INDEX idx_growth_audit_action ON growth_audit_log(action);
