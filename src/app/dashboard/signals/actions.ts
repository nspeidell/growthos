"use server";

import { getBindings } from "@/lib/cloudflare/bindings";
import { requireAuth, requirePermission } from "@/lib/auth/middleware";
import { createId } from "@paralleldrive/cuid2";
import {
  validateCreateSource,
  validateCreateKeyword,
  validateCreateAlert,
  validateSignalStatus,
  validateActionType,
} from "@/lib/signals/validation";
import { generateReplyDraft } from "@/lib/signals/analyzer";
import type {
  SignalFeedItem,
  SignalStats,
  SignalType,
  SignalStatus,
  SourcePlatform,
  TrendingTopic,
} from "@/lib/signals/types";
import { SIGNAL_TYPES } from "@/lib/signals/types";

// ═══════════════════════════════════════════
// Signals Feed
// ═══════════════════════════════════════════

export async function getSignalsFeed(filters?: {
  status?: SignalStatus;
  signalType?: SignalType;
  platform?: SourcePlatform;
  minPriority?: number;
  limit?: number;
  offset?: number;
}): Promise<{ signals: SignalFeedItem[]; total: number }> {
  const session = await requirePermission("signals:read" as never);
  const env = getBindings();

  const conditions: string[] = ["s.workspace_id = ?"];
  const params: (string | number)[] = [session.workspaceId];

  if (filters?.status) {
    conditions.push("s.status = ?");
    params.push(filters.status);
  }

  if (filters?.signalType) {
    conditions.push("s.signal_type = ?");
    params.push(filters.signalType);
  }

  if (filters?.platform) {
    conditions.push("s.source_platform = ?");
    params.push(filters.platform);
  }

  if (filters?.minPriority) {
    conditions.push("s.priority_score >= ?");
    params.push(filters.minPriority);
  }

  const where = conditions.join(" AND ");
  const limit = filters?.limit ?? 50;
  const offset = filters?.offset ?? 0;

  // Get total count
  const countResult = await env.DB.prepare(
    `SELECT COUNT(*) as count FROM signals s WHERE ${where}`
  )
    .bind(...params)
    .first<{ count: number }>();

  // Get paginated results
  const result = await env.DB.prepare(
    `SELECT s.*, tk.keyword as keyword_matched
     FROM signals s
     LEFT JOIN tracked_keywords tk ON s.keyword_id = tk.id
     WHERE ${where}
     ORDER BY s.priority_score DESC, s.detected_at DESC
     LIMIT ? OFFSET ?`
  )
    .bind(...params, limit, offset)
    .all<{
      id: string;
      signal_type: string;
      priority_score: number;
      intent: string | null;
      source_platform: string;
      source_url: string | null;
      source_author: string | null;
      source_author_followers: number | null;
      title: string | null;
      content_snippet: string;
      ai_summary: string | null;
      ai_suggested_response: string | null;
      ai_sentiment: number | null;
      status: string;
      detected_at: number;
      engagement_score: number | null;
      keyword_matched: string | null;
    }>();

  const signals: SignalFeedItem[] = result.results.map((row) => ({
    id: row.id,
    signalType: row.signal_type as SignalType,
    priorityScore: row.priority_score,
    intent: row.intent as SignalFeedItem["intent"],
    sourcePlatform: row.source_platform as SourcePlatform,
    sourceUrl: row.source_url,
    sourceAuthor: row.source_author,
    sourceAuthorFollowers: row.source_author_followers,
    title: row.title,
    contentSnippet: row.content_snippet,
    aiSummary: row.ai_summary,
    aiSuggestedResponse: row.ai_suggested_response,
    aiSentiment: row.ai_sentiment,
    status: row.status as SignalStatus,
    detectedAt: new Date(row.detected_at),
    engagementScore: row.engagement_score,
    keywordMatched: row.keyword_matched ?? undefined,
  }));

  return { signals, total: countResult?.count ?? 0 };
}

// ═══════════════════════════════════════════
// Signal Stats
// ═══════════════════════════════════════════

export async function getSignalStats(): Promise<SignalStats> {
  const session = await requirePermission("signals:read" as never);
  const env = getBindings();
  const wsId = session.workspaceId;

  // Total and new counts
  const counts = await env.DB.prepare(
    `SELECT
       COUNT(*) as total,
       SUM(CASE WHEN status = 'new' THEN 1 ELSE 0 END) as new_count,
       SUM(CASE WHEN priority_score >= 70 THEN 1 ELSE 0 END) as high_priority,
       AVG(ai_sentiment) as avg_sentiment
     FROM signals WHERE workspace_id = ?`
  )
    .bind(wsId)
    .first<{
      total: number;
      new_count: number;
      high_priority: number;
      avg_sentiment: number | null;
    }>();

  // By type
  const byType = await env.DB.prepare(
    `SELECT signal_type, COUNT(*) as count
     FROM signals WHERE workspace_id = ?
     GROUP BY signal_type`
  )
    .bind(wsId)
    .all<{ signal_type: string; count: number }>();

  const signalsByType = {} as Record<SignalType, number>;
  for (const st of SIGNAL_TYPES) {
    signalsByType[st] = 0;
  }
  for (const row of byType.results) {
    const key = row.signal_type as SignalType;
    if (key in signalsByType) {
      signalsByType[key] = row.count;
    }
  }

  // By platform
  const byPlatform = await env.DB.prepare(
    `SELECT source_platform, COUNT(*) as count
     FROM signals WHERE workspace_id = ?
     GROUP BY source_platform`
  )
    .bind(wsId)
    .all<{ source_platform: string; count: number }>();

  const signalsByPlatform = {} as Record<SourcePlatform, number>;
  for (const row of byPlatform.results) {
    signalsByPlatform[row.source_platform as SourcePlatform] = row.count;
  }

  // Trend (last 7 days)
  const trend = await env.DB.prepare(
    `SELECT DATE(detected_at / 1000, 'unixepoch') as date, COUNT(*) as count
     FROM signals
     WHERE workspace_id = ? AND detected_at > ?
     GROUP BY date ORDER BY date`
  )
    .bind(wsId, Date.now() - 7 * 24 * 60 * 60 * 1000)
    .all<{ date: string; count: number }>();

  // Top signal type
  let topSignalType: SignalType | null = null;
  let maxCount = 0;
  for (const [type, count] of Object.entries(signalsByType)) {
    if (count > maxCount) {
      maxCount = count;
      topSignalType = type as SignalType;
    }
  }

  return {
    totalSignals: counts?.total ?? 0,
    newSignals: counts?.new_count ?? 0,
    highPriorityCount: counts?.high_priority ?? 0,
    avgSentiment: counts?.avg_sentiment ?? 0,
    topSignalType,
    signalsByType,
    signalsByPlatform,
    signalsTrend: trend.results,
  };
}

// ═══════════════════════════════════════════
// Signal Actions
// ═══════════════════════════════════════════

export async function updateSignalStatus(
  signalId: string,
  status: string,
  actionedType?: string
): Promise<{ success: boolean; error?: string }> {
  const session = await requirePermission("signals:write" as never);
  const env = getBindings();

  if (!validateSignalStatus(status)) {
    return { success: false, error: "Invalid status" };
  }

  const updates: string[] = ["status = ?", "updated_at = ?"];
  const params: (string | number | null)[] = [status, Date.now()];

  if (status === "actioned" || status === "dismissed") {
    updates.push("actioned_at = ?", "actioned_by = ?");
    params.push(Date.now(), session.userId);
  }

  if (actionedType) {
    updates.push("actioned_type = ?");
    params.push(actionedType);
  }

  params.push(signalId, session.workspaceId);

  await env.DB.prepare(
    `UPDATE signals SET ${updates.join(", ")} WHERE id = ? AND workspace_id = ?`
  )
    .bind(...params)
    .run();

  return { success: true };
}

export async function dismissSignal(
  signalId: string
): Promise<{ success: boolean }> {
  return updateSignalStatus(signalId, "dismissed", "ignored");
}

export async function generateReply(
  signalId: string
): Promise<{ success: boolean; draft?: string; error?: string }> {
  const session = await requirePermission("signals:write" as never);
  const env = getBindings();

  const signal = await env.DB.prepare(
    `SELECT original_content, signal_type, source_platform, workspace_id
     FROM signals WHERE id = ? AND workspace_id = ?`
  )
    .bind(signalId, session.workspaceId)
    .first<{
      original_content: string | null;
      signal_type: string;
      source_platform: string;
      workspace_id: string;
    }>();

  if (!signal) {
    return { success: false, error: "Signal not found" };
  }

  // Get brand context
  const workspace = await env.DB.prepare(
    `SELECT w.name, bv.brand_name, bv.description
     FROM workspaces w
     LEFT JOIN brand_vaults bv ON bv.workspace_id = w.id
     WHERE w.id = ?`
  )
    .bind(session.workspaceId)
    .first<{ name: string; brand_name: string | null; description: string | null }>();

  const brandContext = `Brand: ${workspace?.brand_name ?? workspace?.name ?? "Unknown"}\n${workspace?.description ?? ""}`;

  const draft = await generateReplyDraft(
    env,
    signal.original_content ?? "",
    signal.signal_type as SignalType,
    brandContext,
    signal.source_platform
  );

  return { success: true, draft };
}

export async function convertToContent(
  signalId: string
): Promise<{ success: boolean; contentId?: string; error?: string }> {
  const session = await requirePermission("signals:write" as never);
  const env = getBindings();

  const signal = await env.DB.prepare(
    `SELECT ai_summary, ai_suggested_response, signal_type, content_snippet
     FROM signals WHERE id = ? AND workspace_id = ?`
  )
    .bind(signalId, session.workspaceId)
    .first<{
      ai_summary: string | null;
      ai_suggested_response: string | null;
      signal_type: string;
      content_snippet: string;
    }>();

  if (!signal) {
    return { success: false, error: "Signal not found" };
  }

  // Create a content asset from the signal
  const contentId = createId();
  await env.DB.prepare(
    `INSERT INTO content_assets (id, workspace_id, content_type, title, body, status, created_at, updated_at)
     VALUES (?, ?, 'post', ?, ?, 'draft', ?, ?)`
  )
    .bind(
      contentId,
      session.workspaceId,
      `[Signal] ${signal.ai_summary ?? signal.signal_type}`,
      signal.ai_suggested_response ?? signal.content_snippet,
      Date.now(),
      Date.now()
    )
    .run();

  // Update signal as converted
  await env.DB.prepare(
    `UPDATE signals SET status = 'converted', actioned_type = 'content',
     converted_content_id = ?, actioned_at = ?, actioned_by = ?, updated_at = ?
     WHERE id = ?`
  )
    .bind(contentId, Date.now(), session.userId, Date.now(), signalId)
    .run();

  return { success: true, contentId };
}

// ═══════════════════════════════════════════
// Listening Sources CRUD
// ═══════════════════════════════════════════

export async function getListeningSources() {
  const session = await requirePermission("signals:read" as never);
  const env = getBindings();

  const result = await env.DB.prepare(
    `SELECT * FROM listening_sources WHERE workspace_id = ? ORDER BY created_at DESC`
  )
    .bind(session.workspaceId)
    .all<{
      id: string;
      source_type: string;
      name: string;
      config: string;
      is_active: number;
      last_scanned_at: number | null;
      scan_frequency_minutes: number;
      error_count: number;
      last_error: string | null;
      created_at: number;
    }>();

  return result.results;
}

export async function createListeningSource(input: unknown): Promise<{
  success: boolean;
  id?: string;
  error?: string;
}> {
  const session = await requirePermission("signals:write" as never);
  const env = getBindings();

  const validation = validateCreateSource(input);
  if (!validation.ok) {
    return { success: false, error: validation.error };
  }

  const id = createId();
  await env.DB.prepare(
    `INSERT INTO listening_sources (id, workspace_id, source_type, name, config, scan_frequency_minutes, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      id,
      session.workspaceId,
      validation.data.sourceType,
      validation.data.name,
      JSON.stringify(validation.data.config),
      validation.data.scanFrequencyMinutes ?? 60,
      Date.now(),
      Date.now()
    )
    .run();

  return { success: true, id };
}

export async function toggleSource(
  sourceId: string,
  isActive: boolean
): Promise<{ success: boolean }> {
  const session = await requirePermission("signals:write" as never);
  const env = getBindings();

  await env.DB.prepare(
    `UPDATE listening_sources SET is_active = ?, updated_at = ? WHERE id = ? AND workspace_id = ?`
  )
    .bind(isActive ? 1 : 0, Date.now(), sourceId, session.workspaceId)
    .run();

  return { success: true };
}

export async function deleteSource(
  sourceId: string
): Promise<{ success: boolean }> {
  const session = await requirePermission("signals:admin" as never);
  const env = getBindings();

  await env.DB.prepare(
    `DELETE FROM listening_sources WHERE id = ? AND workspace_id = ?`
  )
    .bind(sourceId, session.workspaceId)
    .run();

  return { success: true };
}

// ═══════════════════════════════════════════
// Tracked Keywords CRUD
// ═══════════════════════════════════════════

export async function getTrackedKeywords() {
  const session = await requirePermission("signals:read" as never);
  const env = getBindings();

  const result = await env.DB.prepare(
    `SELECT * FROM tracked_keywords WHERE workspace_id = ? ORDER BY match_count DESC`
  )
    .bind(session.workspaceId)
    .all<{
      id: string;
      keyword: string;
      keyword_type: string;
      is_active: number;
      match_count: number;
      last_matched_at: number | null;
      created_at: number;
    }>();

  return result.results;
}

export async function createTrackedKeyword(input: unknown): Promise<{
  success: boolean;
  id?: string;
  error?: string;
}> {
  const session = await requirePermission("signals:write" as never);
  const env = getBindings();

  const validation = validateCreateKeyword(input);
  if (!validation.ok) {
    return { success: false, error: validation.error };
  }

  const id = createId();
  await env.DB.prepare(
    `INSERT INTO tracked_keywords (id, workspace_id, keyword, keyword_type, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  )
    .bind(
      id,
      session.workspaceId,
      validation.data.keyword,
      validation.data.keywordType,
      Date.now(),
      Date.now()
    )
    .run();

  return { success: true, id };
}

export async function deleteKeyword(
  keywordId: string
): Promise<{ success: boolean }> {
  const session = await requirePermission("signals:write" as never);
  const env = getBindings();

  await env.DB.prepare(
    `DELETE FROM tracked_keywords WHERE id = ? AND workspace_id = ?`
  )
    .bind(keywordId, session.workspaceId)
    .run();

  return { success: true };
}

// ═══════════════════════════════════════════
// Signal Alerts CRUD
// ═══════════════════════════════════════════

export async function getSignalAlerts() {
  const session = await requirePermission("signals:read" as never);
  const env = getBindings();

  const result = await env.DB.prepare(
    `SELECT * FROM signal_alerts WHERE workspace_id = ? ORDER BY created_at DESC`
  )
    .bind(session.workspaceId)
    .all<{
      id: string;
      name: string;
      alert_type: string;
      conditions: string;
      notify_method: string;
      notify_target: string | null;
      is_active: number;
      last_triggered_at: number | null;
      trigger_count: number;
      created_at: number;
    }>();

  return result.results;
}

export async function createSignalAlert(input: unknown): Promise<{
  success: boolean;
  id?: string;
  error?: string;
}> {
  const session = await requirePermission("signals:write" as never);
  const env = getBindings();

  const validation = validateCreateAlert(input);
  if (!validation.ok) {
    return { success: false, error: validation.error };
  }

  const id = createId();
  await env.DB.prepare(
    `INSERT INTO signal_alerts (id, workspace_id, name, alert_type, conditions, notify_method, notify_target, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      id,
      session.workspaceId,
      validation.data.name,
      validation.data.alertType,
      JSON.stringify(validation.data.conditions),
      validation.data.notifyMethod,
      validation.data.notifyTarget ?? null,
      Date.now(),
      Date.now()
    )
    .run();

  return { success: true, id };
}

export async function toggleAlert(
  alertId: string,
  isActive: boolean
): Promise<{ success: boolean }> {
  const session = await requirePermission("signals:write" as never);
  const env = getBindings();

  await env.DB.prepare(
    `UPDATE signal_alerts SET is_active = ?, updated_at = ? WHERE id = ? AND workspace_id = ?`
  )
    .bind(isActive ? 1 : 0, Date.now(), alertId, session.workspaceId)
    .run();

  return { success: true };
}

export async function deleteAlert(
  alertId: string
): Promise<{ success: boolean }> {
  const session = await requirePermission("signals:admin" as never);
  const env = getBindings();

  await env.DB.prepare(
    `DELETE FROM signal_alerts WHERE id = ? AND workspace_id = ?`
  )
    .bind(alertId, session.workspaceId)
    .run();

  return { success: true };
}

// ═══════════════════════════════════════════
// Trending Topics
// ═══════════════════════════════════════════

export async function getTrendingTopics(): Promise<TrendingTopic[]> {
  const session = await requirePermission("signals:read" as never);
  const env = getBindings();

  // Get AI tags from recent signals and aggregate
  const result = await env.DB.prepare(
    `SELECT ai_tags, ai_sentiment, source_platform
     FROM signals
     WHERE workspace_id = ? AND detected_at > ? AND ai_tags IS NOT NULL
     ORDER BY detected_at DESC
     LIMIT 200`
  )
    .bind(session.workspaceId, Date.now() - 48 * 60 * 60 * 1000) // Last 48 hours
    .all<{
      ai_tags: string;
      ai_sentiment: number | null;
      source_platform: string;
    }>();

  // Aggregate tags
  const tagMap = new Map<
    string,
    { count: number; sentiments: number[]; platforms: Set<string> }
  >();

  for (const row of result.results) {
    let tags: string[] = [];
    try {
      tags = JSON.parse(row.ai_tags) as string[];
    } catch {
      continue;
    }

    for (const tag of tags) {
      const lower = tag.toLowerCase();
      const existing = tagMap.get(lower);
      if (existing) {
        existing.count++;
        if (row.ai_sentiment !== null) existing.sentiments.push(row.ai_sentiment);
        existing.platforms.add(row.source_platform);
      } else {
        tagMap.set(lower, {
          count: 1,
          sentiments: row.ai_sentiment !== null ? [row.ai_sentiment] : [],
          platforms: new Set([row.source_platform]),
        });
      }
    }
  }

  // Convert to array and sort by count
  const topics: TrendingTopic[] = Array.from(tagMap.entries())
    .map(([topic, data]) => ({
      topic,
      count: data.count,
      avgSentiment:
        data.sentiments.length > 0
          ? data.sentiments.reduce((a, b) => a + b, 0) / data.sentiments.length
          : 0,
      platforms: Array.from(data.platforms) as SourcePlatform[],
      velocity: data.count, // Simple velocity = count in window
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);

  return topics;
}

// ═══════════════════════════════════════════
// Engagement Actions
// ═══════════════════════════════════════════

export async function createEngagementAction(
  signalId: string,
  actionType: string,
  platform: string,
  content?: string,
  aiDrafted = false
): Promise<{ success: boolean; id?: string; error?: string }> {
  const session = await requirePermission("signals:write" as never);
  const env = getBindings();

  if (!validateActionType(actionType)) {
    return { success: false, error: "Invalid action type" };
  }

  const id = createId();
  await env.DB.prepare(
    `INSERT INTO engagement_actions (id, workspace_id, signal_id, action_type, platform, content, ai_drafted, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?)`
  )
    .bind(
      id,
      session.workspaceId,
      signalId,
      actionType,
      platform,
      content ?? null,
      aiDrafted ? 1 : 0,
      Date.now(),
      Date.now()
    )
    .run();

  // Update signal status
  await updateSignalStatus(signalId, "actioned", actionType);

  return { success: true, id };
}
