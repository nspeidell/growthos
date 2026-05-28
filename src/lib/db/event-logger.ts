/**
 * Unified Event Logger
 *
 * Writes structured events to the event_log table.
 * Every meaningful system action — publishing, content generation, token refresh,
 * automation triggers, errors — should produce an event here.
 *
 * This is the foundation of the Observability Layer (Cross-cutting System 1).
 * Use trace_id to correlate events across services for full request replay.
 *
 * Migration: 0025_event_log.sql
 */

import { nanoid } from "nanoid";

// ─────────────────────────────────────────────
// Event Type Enum
// ─────────────────────────────────────────────

export type EventType =
  | "signal.detected"
  | "signal.scored"
  | "content.generated"
  | "content.variant_created"
  | "post.scheduled"
  | "post.published"
  | "post.failed"
  | "post.retried"
  | "post.dead_lettered"
  | "token.refreshed"
  | "token.refresh_failed"
  | "token.expired"
  | "automation.triggered"
  | "automation.enrolled"
  | "automation.completed"
  | "swarm.task_created"
  | "swarm.task_completed"
  | "swarm.task_failed"
  | "kill_switch.activated"
  | "kill_switch.deactivated"
  | "budget.limit_reached"
  | "error.unhandled";

export type EventSeverity = "info" | "warn" | "error" | "critical";

export type EventSource =
  | "system"
  | "user"
  | "reddit"
  | "x"
  | "instagram"
  | "facebook"
  | "threads"
  | "linkedin"
  | "pinterest"
  | "youtube"
  | "publisher"
  | "automation-processor"
  | "token-refresher"
  | "swarm"
  | "signals-worker"
  | "cron";

export type EventResourceType =
  | "post"
  | "signal"
  | "campaign"
  | "automation"
  | "token"
  | "swarm_task"
  | "content_asset"
  | "influencer"
  | "subscriber";

export interface LogEventParams {
  db: D1Database;
  workspaceId: string;
  type: EventType;
  source: EventSource;
  traceId?: string;
  actorId?: string;
  resourceType?: EventResourceType;
  resourceId?: string;
  payload?: Record<string, unknown>;
  severity?: EventSeverity;
}

/**
 * Write a single event to event_log.
 * Non-throwing — logs to console on error so it never breaks the caller.
 */
export async function logEvent(params: LogEventParams): Promise<string> {
  const {
    db,
    workspaceId,
    type,
    source,
    traceId,
    actorId,
    resourceType,
    resourceId,
    payload = {},
    severity = "info",
  } = params;

  const id = nanoid();
  const now = Math.floor(Date.now() / 1000);

  try {
    await db
      .prepare(
        `INSERT INTO event_log
           (id, workspace_id, trace_id, type, source, actor_id,
            resource_type, resource_id, payload, severity, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        id,
        workspaceId,
        traceId ?? null,
        type,
        source,
        actorId ?? null,
        resourceType ?? null,
        resourceId ?? null,
        JSON.stringify(payload),
        severity,
        now
      )
      .run();
  } catch (err) {
    // Never let logging break the calling code
    console.error("[event-logger] Failed to write event:", err, { type, workspaceId });
  }

  return id;
}

/**
 * Create a trace context for correlating a group of related events.
 * Pass the returned traceId to every logEvent() call in the same operation.
 *
 * Example:
 *   const { traceId, trace } = createTrace(db, workspaceId);
 *   await trace("post.scheduled", "publisher", { postId });
 *   await trace("post.published", "publisher", { postId, platformPostId });
 */
export function createTrace(db: D1Database, workspaceId: string) {
  const traceId = nanoid();

  const trace = (
    type: EventType,
    source: EventSource,
    payload: Record<string, unknown> = {},
    overrides: Partial<Omit<LogEventParams, "db" | "workspaceId" | "type" | "source" | "traceId" | "payload">> = {}
  ) =>
    logEvent({ db, workspaceId, traceId, type, source, payload, ...overrides });

  return { traceId, trace };
}

// ─────────────────────────────────────────────
// Convenience helpers for the most common events
// ─────────────────────────────────────────────

export async function logPostPublished(
  db: D1Database,
  workspaceId: string,
  postId: string,
  platform: string,
  platformPostId: string,
  traceId?: string
) {
  return logEvent({
    db,
    workspaceId,
    traceId,
    type: "post.published",
    source: platform as EventSource,
    resourceType: "post",
    resourceId: postId,
    payload: { platformPostId, platform },
    severity: "info",
  });
}

export async function logPostFailed(
  db: D1Database,
  workspaceId: string,
  postId: string,
  platform: string,
  error: string,
  traceId?: string
) {
  return logEvent({
    db,
    workspaceId,
    traceId,
    type: "post.failed",
    source: platform as EventSource,
    resourceType: "post",
    resourceId: postId,
    payload: { error, platform },
    severity: "error",
  });
}

export async function logContentGenerated(
  db: D1Database,
  workspaceId: string,
  assetId: string,
  platform: string,
  doctrineMode: string,
  pillar?: string,
  traceId?: string
) {
  return logEvent({
    db,
    workspaceId,
    traceId,
    type: "content.generated",
    source: "system",
    resourceType: "content_asset",
    resourceId: assetId,
    payload: { platform, doctrineMode, pillar },
    severity: "info",
  });
}

export async function logTokenRefreshed(
  db: D1Database,
  workspaceId: string,
  platform: string,
  accountId: string
) {
  return logEvent({
    db,
    workspaceId,
    type: "token.refreshed",
    source: "token-refresher",
    resourceType: "token",
    resourceId: accountId,
    payload: { platform },
    severity: "info",
  });
}

export async function logTokenRefreshFailed(
  db: D1Database,
  workspaceId: string,
  platform: string,
  accountId: string,
  error: string
) {
  return logEvent({
    db,
    workspaceId,
    type: "token.refresh_failed",
    source: "token-refresher",
    resourceType: "token",
    resourceId: accountId,
    payload: { platform, error },
    severity: "error",
  });
}
