-- Automation enrollment tracking
-- Each row = one subscriber enrolled in one automation, tracking their progress

CREATE TABLE IF NOT EXISTS automation_enrollments (
  id TEXT PRIMARY KEY,
  automation_id TEXT NOT NULL REFERENCES automations(id) ON DELETE CASCADE,
  subscriber_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  current_step INTEGER NOT NULL DEFAULT 0,
  enrollment_status TEXT NOT NULL DEFAULT 'active',  -- active | completed | failed | cancelled
  next_step_at INTEGER,                               -- unix ms; null = run immediately
  enrolled_at INTEGER NOT NULL,
  completed_at INTEGER,
  error_message TEXT,
  UNIQUE(automation_id, subscriber_id)               -- never enroll same person twice
);

CREATE INDEX IF NOT EXISTS idx_ae_workspace   ON automation_enrollments(workspace_id);
CREATE INDEX IF NOT EXISTS idx_ae_next_step   ON automation_enrollments(next_step_at, enrollment_status);
CREATE INDEX IF NOT EXISTS idx_ae_automation  ON automation_enrollments(automation_id);
