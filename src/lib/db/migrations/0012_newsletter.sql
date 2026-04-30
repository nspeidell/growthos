-- Phase 7C: Newsletter, Subscribers, Lead Magnets, Automations

-- Subscribers

CREATE TABLE IF NOT EXISTS subscribers (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  name TEXT,
  tags TEXT, -- JSON array of tags
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('waitlist', 'newsletter', 'lead_magnet', 'manual', 'import')),
  lead_magnet_slug TEXT,
  subscriber_status TEXT NOT NULL DEFAULT 'active' CHECK (subscriber_status IN ('active', 'unsubscribed', 'bounced')),
  subscribed_at INTEGER NOT NULL,
  unsubscribed_at INTEGER
);

CREATE INDEX idx_subscribers_workspace ON subscribers(workspace_id);
CREATE UNIQUE INDEX idx_subscribers_email_workspace ON subscribers(workspace_id, email);
CREATE INDEX idx_subscribers_status ON subscribers(workspace_id, subscriber_status);
CREATE INDEX idx_subscribers_source ON subscribers(workspace_id, source);

-- Newsletters

CREATE TABLE IF NOT EXISTS newsletters (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  preview_text TEXT,
  html_content TEXT,
  text_content TEXT,
  from_name TEXT,
  from_email TEXT,
  target_tags TEXT, -- JSON array: send only to subscribers with these tags
  newsletter_status TEXT NOT NULL DEFAULT 'draft' CHECK (newsletter_status IN ('draft', 'sending', 'sent', 'failed')),
  sent_at INTEGER,
  sent_count INTEGER DEFAULT 0,
  opened_count INTEGER DEFAULT 0,
  clicked_count INTEGER DEFAULT 0,
  bounced_count INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE INDEX idx_newsletters_workspace ON newsletters(workspace_id);
CREATE INDEX idx_newsletters_status ON newsletters(workspace_id, newsletter_status);

-- Lead Magnets

CREATE TABLE IF NOT EXISTS lead_magnets (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  file_url TEXT NOT NULL,
  file_type TEXT,
  cover_url TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  downloads INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE INDEX idx_lead_magnets_workspace ON lead_magnets(workspace_id);
CREATE UNIQUE INDEX idx_lead_magnets_slug ON lead_magnets(workspace_id, slug);

-- Automations (email sequences, drip campaigns)

CREATE TABLE IF NOT EXISTS automations (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  trigger_type TEXT NOT NULL CHECK (trigger_type IN ('subscribe', 'tag_added', 'lead_magnet', 'manual')),
  trigger_config TEXT, -- JSON: conditions for trigger
  steps TEXT NOT NULL, -- JSON array of automation steps
  automation_status TEXT NOT NULL DEFAULT 'draft' CHECK (automation_status IN ('draft', 'active', 'paused')),
  enrolled_count INTEGER DEFAULT 0,
  completed_count INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX idx_automations_workspace ON automations(workspace_id);
CREATE INDEX idx_automations_status ON automations(workspace_id, automation_status);
