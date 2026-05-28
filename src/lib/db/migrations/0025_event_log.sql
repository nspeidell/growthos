-- Migration 0025: Unified Event Log
-- Foundation of the Observability Layer.
-- Every meaningful system event (content generated, post published, signal detected,
-- automation triggered, error, kill switch fired) writes a row here.
-- trace_id correlates events across services for full request replay.
-- Replaces ad-hoc error strings scattered across tables with a single queryable stream.

CREATE TABLE IF NOT EXISTS event_log (
  id             TEXT    NOT NULL PRIMARY KEY,
  workspace_id   TEXT    NOT NULL,
  trace_id       TEXT,                             -- cross-service correlation ID
  type           TEXT    NOT NULL,                 -- event type (see enum below)
  source         TEXT    NOT NULL,                 -- origin service or platform
  actor_id       TEXT,                             -- user_id if human-initiated, NULL if system
  resource_type  TEXT,                             -- post | signal | campaign | automation | token | swarm_task
  resource_id    TEXT,                             -- ID of the affected resource
  payload        TEXT    NOT NULL DEFAULT '{}',    -- JSON — event-specific data
  severity       TEXT    NOT NULL DEFAULT 'info',  -- info | warn | error | critical
  created_at     INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Primary query pattern: workspace timeline (most recent first)
CREATE INDEX IF NOT EXISTS idx_event_log_workspace
  ON event_log(workspace_id, created_at DESC);

-- Cross-service trace correlation
CREATE INDEX IF NOT EXISTS idx_event_log_trace
  ON event_log(trace_id)
  WHERE trace_id IS NOT NULL;

-- Type-based queries (e.g. "all errors in last 24h")
CREATE INDEX IF NOT EXISTS idx_event_log_type
  ON event_log(type, created_at DESC);

-- Resource-level history (e.g. "all events for post X")
CREATE INDEX IF NOT EXISTS idx_event_log_resource
  ON event_log(resource_type, resource_id, created_at DESC)
  WHERE resource_type IS NOT NULL;

-- ─────────────────────────────────────────────
-- Event type enum (enforced in application code)
-- ─────────────────────────────────────────────
-- signal.detected          — new signal ingested from Reddit/X/RSS
-- signal.scored            — signal scored and ranked
-- content.generated        — AI produced a content asset
-- content.variant_created  — A/B variant spawned
-- post.scheduled           — post added to publish queue
-- post.published           — platform confirmed publish success
-- post.failed              — platform returned error
-- post.retried             — retry attempt dispatched
-- post.dead_lettered       — moved to DLQ after max retries
-- token.refreshed          — OAuth token refreshed successfully
-- token.refresh_failed     — token refresh attempt failed
-- token.expired            — token confirmed expired, needs reconnect
-- automation.triggered     — automation rule matched and fired
-- automation.enrolled      — subscriber enrolled in sequence
-- automation.completed     — subscriber completed sequence
-- swarm.task_created       — Swarm task added to board
-- swarm.task_completed     — Swarm task finished
-- swarm.task_failed        — Swarm task errored
-- kill_switch.activated    — kill switch engaged
-- kill_switch.deactivated  — kill switch lifted
-- budget.limit_reached     — workspace hit a configured limit
-- error.unhandled          — uncaught exception logged
