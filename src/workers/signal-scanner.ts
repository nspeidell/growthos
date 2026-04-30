/**
 * Cloudflare Queue Consumer: Signal Scanner
 *
 * Processes signal scan jobs from the SIGNAL_QUEUE:
 * 1. Fetches content from the configured source (Reddit, Google News, RSS, etc.)
 * 2. Pre-filters for keyword relevance
 * 3. Sends relevant content to Claude for AI analysis
 * 4. Stores classified signals in D1
 * 5. Triggers alerts for high-priority signals
 */

import type { CloudflareEnv } from "@/lib/cloudflare/bindings";
import type {
  SignalScanMessage,
  RawSignalContent,
  SourcePlatform,
  SourceConfig,
} from "@/lib/signals/types";
import { fetchFromSource } from "@/lib/signals/adapters";
import {
  analyzeSignal,
  quickRelevanceCheck,
  calculateEngagementScore,
} from "@/lib/signals/analyzer";
import { createId } from "@paralleldrive/cuid2";

export default {
  async queue(
    batch: MessageBatch<SignalScanMessage>,
    env: CloudflareEnv
  ): Promise<void> {
    for (const msg of batch.messages) {
      const job = msg.body;

      try {
        await processSignalScan(job, env);
        msg.ack();
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";

        // Update source error tracking
        await env.DB.prepare(
          `UPDATE listening_sources
           SET error_count = error_count + 1, last_error = ?
           WHERE id = ?`
        )
          .bind(errorMessage, job.sourceId)
          .run();

        // Retry with backoff (max 3 retries)
        msg.retry({ delaySeconds: 60 });
      }
    }
  },
};

// ═══════════════════════════════════════════
// Core Processing Pipeline
// ═══════════════════════════════════════════

async function processSignalScan(
  job: SignalScanMessage,
  env: CloudflareEnv
): Promise<void> {
  // Parse source config
  let sourceConfig: SourceConfig;
  try {
    sourceConfig = JSON.parse(job.config) as SourceConfig;
  } catch {
    throw new Error("Invalid source config JSON");
  }

  // Step 1: Fetch content from platform
  const rawContent = await fetchFromSource(
    job.sourceType as SourcePlatform,
    sourceConfig
  );

  if (rawContent.length === 0) {
    // Update last scanned timestamp even if no content
    await env.DB.prepare(
      `UPDATE listening_sources SET last_scanned_at = ?, error_count = 0 WHERE id = ?`
    )
      .bind(Date.now(), job.sourceId)
      .run();
    return;
  }

  // Step 2: Pre-filter for keyword relevance
  const relevant = rawContent.filter((item) => {
    if (job.keywords.length === 0) return true; // No keywords = scan everything
    const check = quickRelevanceCheck(item.content, job.keywords);
    return check.relevant;
  });

  // Step 3: Check for duplicates (by URL)
  const newItems = await filterExistingSignals(relevant, job.workspaceId, env);

  if (newItems.length === 0) {
    await env.DB.prepare(
      `UPDATE listening_sources SET last_scanned_at = ?, error_count = 0 WHERE id = ?`
    )
      .bind(Date.now(), job.sourceId)
      .run();
    return;
  }

  // Step 4: Get brand context for AI analysis
  const brandContext = await getBrandContext(job.workspaceId, env);

  // Step 5: Analyze each item with Claude (limit to 10 per scan to manage costs)
  const toAnalyze = newItems.slice(0, 10);

  for (const item of toAnalyze) {
    try {
      const analysis = await analyzeSignal(env, item, brandContext, job.keywords);

      // Step 6: Store signal in D1
      const signalId = createId();
      const matchedKeyword = quickRelevanceCheck(item.content, job.keywords);
      const keywordId = matchedKeyword.matchedKeywords.length > 0
        ? await findKeywordId(job.workspaceId, matchedKeyword.matchedKeywords[0] ?? "", env)
        : null;

      const engagementScore = calculateEngagementScore(
        item.engagementLikes ?? 0,
        item.engagementComments ?? 0,
        item.engagementShares ?? 0,
        item.authorFollowers
      );

      await env.DB.prepare(
        `INSERT INTO signals (
          id, workspace_id, source_id, keyword_id,
          signal_type, priority_score, intent,
          source_platform, source_url, source_author, source_author_followers,
          title, content_snippet, original_content,
          ai_summary, ai_suggested_response, ai_sentiment, ai_relevance_score, ai_tags,
          status, engagement_likes, engagement_comments, engagement_shares, engagement_score,
          detected_at, source_published_at, created_at, updated_at
        ) VALUES (
          ?, ?, ?, ?,
          ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?,
          ?, ?, ?, ?, ?,
          'new', ?, ?, ?, ?,
          ?, ?, ?, ?
        )`
      )
        .bind(
          signalId,
          job.workspaceId,
          job.sourceId,
          keywordId,
          analysis.signalType,
          analysis.priorityScore,
          analysis.intent,
          item.platform,
          item.url ?? null,
          item.author ?? null,
          item.authorFollowers ?? null,
          item.title ?? null,
          item.content.slice(0, 500), // Snippet
          item.content,
          analysis.summary,
          analysis.suggestedResponse,
          analysis.sentiment,
          analysis.relevanceScore,
          JSON.stringify(analysis.tags),
          item.engagementLikes ?? 0,
          item.engagementComments ?? 0,
          item.engagementShares ?? 0,
          engagementScore,
          Date.now(),
          item.publishedAt ? item.publishedAt * 1000 : null,
          Date.now(),
          Date.now()
        )
        .run();

      // Update keyword match count
      if (keywordId) {
        await env.DB.prepare(
          `UPDATE tracked_keywords SET match_count = match_count + 1, last_matched_at = ? WHERE id = ?`
        )
          .bind(Date.now(), keywordId)
          .run();
      }

      // Step 7: Check alerts for high-priority signals
      if (analysis.priorityScore >= 70) {
        await checkAndTriggerAlerts(signalId, analysis, job.workspaceId, env);
      }
    } catch (error) {
      // Log but don't fail the whole batch for one item
      console.error("[signal-scanner] Failed to analyze signal item", item.url ?? "unknown URL", error);
      continue;
    }
  }

  // Update source status
  await env.DB.prepare(
    `UPDATE listening_sources SET last_scanned_at = ?, error_count = 0 WHERE id = ?`
  )
    .bind(Date.now(), job.sourceId)
    .run();
}

// ═══════════════════════════════════════════
// Helper Functions
// ═══════════════════════════════════════════

async function filterExistingSignals(
  items: RawSignalContent[],
  workspaceId: string,
  env: CloudflareEnv
): Promise<RawSignalContent[]> {
  // Get recent signal URLs to avoid duplicates
  const result = await env.DB.prepare(
    `SELECT source_url FROM signals
     WHERE workspace_id = ? AND source_url IS NOT NULL
     AND detected_at > ?
     LIMIT 1000`
  )
    .bind(workspaceId, Date.now() - 7 * 24 * 60 * 60 * 1000) // Last 7 days
    .all<{ source_url: string }>();

  const existingUrls = new Set(result.results.map((r) => r.source_url));

  return items.filter((item) => {
    if (!item.url) return true; // Keep items without URLs
    return !existingUrls.has(item.url);
  });
}

async function getBrandContext(
  workspaceId: string,
  env: CloudflareEnv
): Promise<string> {
  const workspace = await env.DB.prepare(
    `SELECT w.name, bv.brand_name, bv.description, bv.industry, bv.target_audience
     FROM workspaces w
     LEFT JOIN brand_vaults bv ON bv.workspace_id = w.id
     WHERE w.id = ?`
  )
    .bind(workspaceId)
    .first<{
      name: string;
      brand_name: string | null;
      description: string | null;
      industry: string | null;
      target_audience: string | null;
    }>();

  if (!workspace) return "Unknown brand";

  return [
    `Brand: ${workspace.brand_name ?? workspace.name}`,
    workspace.description ? `Description: ${workspace.description}` : "",
    workspace.industry ? `Industry: ${workspace.industry}` : "",
    workspace.target_audience ? `Target Audience: ${workspace.target_audience}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

async function findKeywordId(
  workspaceId: string,
  keyword: string,
  env: CloudflareEnv
): Promise<string | null> {
  const result = await env.DB.prepare(
    `SELECT id FROM tracked_keywords
     WHERE workspace_id = ? AND LOWER(keyword) = LOWER(?)
     LIMIT 1`
  )
    .bind(workspaceId, keyword)
    .first<{ id: string }>();

  return result?.id ?? null;
}

async function checkAndTriggerAlerts(
  signalId: string,
  analysis: { signalType: string; priorityScore: number; sentiment: number },
  workspaceId: string,
  env: CloudflareEnv
): Promise<void> {
  const alerts = await env.DB.prepare(
    `SELECT id, alert_type, conditions, notify_method, notify_target
     FROM signal_alerts
     WHERE workspace_id = ? AND is_active = 1`
  )
    .bind(workspaceId)
    .all<{
      id: string;
      alert_type: string;
      conditions: string;
      notify_method: string;
      notify_target: string | null;
    }>();

  for (const alert of alerts.results) {
    let conditions: Record<string, unknown> = {};
    try {
      conditions = JSON.parse(alert.conditions) as Record<string, unknown>;
    } catch {
      console.warn("[signal-scanner] Invalid alert conditions JSON for alert", alert.id);
      continue;
    }

    let shouldTrigger = false;

    switch (alert.alert_type) {
      case "high_priority":
        shouldTrigger = analysis.priorityScore >= (typeof conditions.minPriority === "number" ? conditions.minPriority : 80);
        break;
      case "negative_sentiment":
        shouldTrigger = analysis.sentiment < -0.5;
        break;
      case "brand_mention":
        shouldTrigger = analysis.signalType === "brand_mention";
        break;
      case "viral_trend":
        shouldTrigger = analysis.signalType === "viral_trend";
        break;
      case "competitor_alert":
        shouldTrigger = analysis.signalType === "competitor_mention";
        break;
      case "lead_detected":
        shouldTrigger = analysis.signalType === "lead_opportunity";
        break;
    }

    if (shouldTrigger) {
      await env.DB.prepare(
        `UPDATE signal_alerts SET last_triggered_at = ?, trigger_count = trigger_count + 1 WHERE id = ?`
      )
        .bind(Date.now(), alert.id)
        .run();

      // TODO: Implement notify_method dispatch (email via Resend, webhook, etc.)
    }
  }
}
