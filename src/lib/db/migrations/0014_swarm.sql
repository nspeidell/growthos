-- ═══════════════════════════════════════════
-- Migration 0014: Growth Swarm Engine
-- Phase 11: Autonomous AI agent coordination
-- ═══════════════════════════════════════════

-- Agent registry per workspace
CREATE TABLE IF NOT EXISTS swarm_agents (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN (
    'strategist', 'content', 'video', 'ads',
    'outreach', 'analytics', 'competitor', 'founder_voice'
  )),
  model_provider TEXT NOT NULL DEFAULT 'anthropic' CHECK (model_provider IN (
    'anthropic', 'openai', 'together', 'cloudflare'
  )),
  system_prompt TEXT,
  temperature REAL NOT NULL DEFAULT 0.7,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- High-level missions (user objectives)
CREATE TABLE IF NOT EXISTS swarm_missions (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  objective TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'planning' CHECK (status IN (
    'planning', 'active', 'paused', 'completed', 'failed', 'cancelled'
  )),
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN (
    'critical', 'high', 'medium', 'low'
  )),
  target_metric TEXT,
  target_value REAL,
  current_value REAL DEFAULT 0,
  overnight_eligible INTEGER NOT NULL DEFAULT 0,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  completed_at INTEGER
);

-- Individual tasks delegated to agents
CREATE TABLE IF NOT EXISTS swarm_tasks (
  id TEXT PRIMARY KEY,
  mission_id TEXT NOT NULL REFERENCES swarm_missions(id) ON DELETE CASCADE,
  agent_id TEXT NOT NULL REFERENCES swarm_agents(id) ON DELETE CASCADE,
  task_type TEXT NOT NULL CHECK (task_type IN (
    'generate_content', 'analyze_metrics', 'create_campaign',
    'optimize_ads', 'research_competitors', 'send_outreach',
    'generate_video', 'plan_strategy', 'review_brand_voice',
    'schedule_post', 'summarize', 'recommend'
  )),
  input_json TEXT NOT NULL DEFAULT '{}',
  output_json TEXT,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN (
    'queued', 'running', 'completed', 'failed', 'skipped'
  )),
  score REAL,
  tokens_used INTEGER DEFAULT 0,
  cost_cents INTEGER DEFAULT 0,
  retry_count INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  started_at INTEGER,
  completed_at INTEGER
);

-- Execution logs for observability
CREATE TABLE IF NOT EXISTS swarm_logs (
  id TEXT PRIMARY KEY,
  mission_id TEXT REFERENCES swarm_missions(id) ON DELETE CASCADE,
  agent_id TEXT REFERENCES swarm_agents(id) ON DELETE SET NULL,
  task_id TEXT REFERENCES swarm_tasks(id) ON DELETE SET NULL,
  message TEXT NOT NULL,
  level TEXT NOT NULL DEFAULT 'info' CHECK (level IN (
    'debug', 'info', 'warn', 'error'
  )),
  metadata_json TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_swarm_missions_workspace ON swarm_missions(workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_swarm_tasks_mission ON swarm_tasks(mission_id, status);
CREATE INDEX IF NOT EXISTS idx_swarm_tasks_agent ON swarm_tasks(agent_id, status);
CREATE INDEX IF NOT EXISTS idx_swarm_logs_mission ON swarm_logs(mission_id, created_at);
CREATE INDEX IF NOT EXISTS idx_swarm_agents_workspace ON swarm_agents(workspace_id, is_active);
