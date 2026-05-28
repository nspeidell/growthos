/**
 * Performance Feedback Injection Layer
 *
 * Queries historical post performance and injects it into content generation
 * prompts so the AI learns from what has actually worked.
 *
 * This is Phase 2 Gap #1: "Performance Feedback Injection Layer"
 * Every content generation cycle now has access to:
 *  - Top performing posts per platform (highest engagement rate)
 *  - Worst performing posts (what to avoid)
 *  - Platform-specific performance patterns
 *  - Content type preferences per platform
 *
 * The result is injected as an additional context layer in buildSystemPrompt().
 */

import type { Platform } from "@/types/api";

export interface PostPerformanceSummary {
  platform: string;
  contentSnippet: string;       // First 120 chars of the body
  engagementRate: number;       // decimal (e.g. 0.045 = 4.5%)
  likes: number;
  shares: number;
  comments: number;
  saves: number;
  impressions: number;
  contentType?: string;
  publishedAt?: Date | null;
}

export interface PerformanceContext {
  topPosts: PostPerformanceSummary[];
  worstPosts: PostPerformanceSummary[];
  platformInsights: string;     // Human-readable summary injected into prompt
  hasData: boolean;
}

/**
 * Build a performance context block for content generation.
 * Queries D1 directly (bypasses Drizzle for Worker compatibility).
 *
 * @param db - D1Database binding
 * @param workspaceId - workspace to query
 * @param platform - filter to this platform
 * @param limit - number of top/worst posts to fetch (default 5 each)
 */
export async function buildPerformanceContext(
  db: D1Database,
  workspaceId: string,
  platform: Platform,
  limit = 5
): Promise<PerformanceContext> {
  const cutoffSeconds = Math.floor(Date.now() / 1000) - 90 * 24 * 60 * 60; // 90 days

  try {
    // Top performers: published posts with metrics, sorted by engagement rate desc
    const { results: topRows } = await db
      .prepare(
        `SELECT
           sp.platform,
           SUBSTR(cas.body, 1, 120) as content_snippet,
           CAST(pm.engagement_rate AS REAL) as engagement_rate,
           pm.likes,
           pm.shares,
           pm.comments,
           pm.saves,
           pm.impressions,
           sp.published_at
         FROM scheduled_posts sp
         JOIN content_assets cas ON sp.content_asset_id = cas.id
         JOIN post_metrics pm ON pm.post_id = sp.id
         WHERE sp.workspace_id = ?
           AND sp.platform = ?
           AND sp.post_status = 'published'
           AND sp.published_at IS NOT NULL
           AND CAST(strftime('%s', sp.published_at) AS INTEGER) >= ?
           AND pm.engagement_rate IS NOT NULL
           AND CAST(pm.engagement_rate AS REAL) > 0
         ORDER BY CAST(pm.engagement_rate AS REAL) DESC
         LIMIT ?`
      )
      .bind(workspaceId, platform, cutoffSeconds, limit)
      .all<{
        platform: string;
        content_snippet: string;
        engagement_rate: number;
        likes: number;
        shares: number;
        comments: number;
        saves: number;
        impressions: number;
        published_at: string | null;
      }>();

    // Worst performers (for avoidance patterns)
    const { results: worstRows } = await db
      .prepare(
        `SELECT
           sp.platform,
           SUBSTR(cas.body, 1, 120) as content_snippet,
           CAST(pm.engagement_rate AS REAL) as engagement_rate,
           pm.likes,
           pm.shares,
           pm.comments,
           pm.saves,
           pm.impressions,
           sp.published_at
         FROM scheduled_posts sp
         JOIN content_assets cas ON sp.content_asset_id = cas.id
         JOIN post_metrics pm ON pm.post_id = sp.id
         WHERE sp.workspace_id = ?
           AND sp.platform = ?
           AND sp.post_status = 'published'
           AND sp.published_at IS NOT NULL
           AND CAST(strftime('%s', sp.published_at) AS INTEGER) >= ?
           AND pm.engagement_rate IS NOT NULL
         ORDER BY CAST(pm.engagement_rate AS REAL) ASC
         LIMIT ?`
      )
      .bind(workspaceId, platform, cutoffSeconds, limit)
      .all<{
        platform: string;
        content_snippet: string;
        engagement_rate: number;
        likes: number;
        shares: number;
        comments: number;
        saves: number;
        impressions: number;
        published_at: string | null;
      }>();

    const top = (topRows ?? []).map((r) => ({
      platform: r.platform,
      contentSnippet: r.content_snippet,
      engagementRate: r.engagement_rate,
      likes: r.likes ?? 0,
      shares: r.shares ?? 0,
      comments: r.comments ?? 0,
      saves: r.saves ?? 0,
      impressions: r.impressions ?? 0,
      publishedAt: r.published_at ? new Date(r.published_at) : null,
    }));

    const worst = (worstRows ?? []).map((r) => ({
      platform: r.platform,
      contentSnippet: r.content_snippet,
      engagementRate: r.engagement_rate,
      likes: r.likes ?? 0,
      shares: r.shares ?? 0,
      comments: r.comments ?? 0,
      saves: r.saves ?? 0,
      impressions: r.impressions ?? 0,
      publishedAt: r.published_at ? new Date(r.published_at) : null,
    }));

    if (top.length === 0 && worst.length === 0) {
      return { topPosts: [], worstPosts: [], platformInsights: "", hasData: false };
    }

    const platformInsights = buildInsightBlock(platform, top, worst);

    return { topPosts: top, worstPosts: worst, platformInsights, hasData: true };
  } catch {
    // Non-throwing — performance context is additive, never blocking
    return { topPosts: [], worstPosts: [], platformInsights: "", hasData: false };
  }
}

/**
 * Format the performance data as a human-readable insight block
 * suitable for injection into a system prompt.
 */
function buildInsightBlock(
  platform: string,
  top: PostPerformanceSummary[],
  worst: PostPerformanceSummary[]
): string {
  const lines: string[] = [
    `PERFORMANCE INTELLIGENCE (${platform.toUpperCase()} — last 90 days):`,
    "Use this historical data to inform the content you generate. Write more like the top performers. Avoid patterns from the low performers.",
    "",
  ];

  if (top.length > 0) {
    lines.push("TOP PERFORMING CONTENT (highest engagement rate):");
    top.forEach((p, i) => {
      const rate = (p.engagementRate * 100).toFixed(2);
      lines.push(
        `${i + 1}. [${rate}% engagement | ${p.likes} likes | ${p.shares} shares | ${p.saves} saves]`
      );
      lines.push(`   "${p.contentSnippet.trim()}..."`);
    });
    lines.push("");
  }

  if (worst.length > 0) {
    lines.push("LOWEST PERFORMING CONTENT (patterns to avoid):");
    worst.forEach((p, i) => {
      const rate = (p.engagementRate * 100).toFixed(2);
      lines.push(
        `${i + 1}. [${rate}% engagement | ${p.likes} likes | ${p.shares} shares]`
      );
      lines.push(`   "${p.contentSnippet.trim()}..."`);
    });
    lines.push("");
  }

  // Derive pattern observations
  const avgTopEngagement =
    top.length > 0
      ? top.reduce((s, p) => s + p.engagementRate, 0) / top.length
      : 0;
  const avgTopShares =
    top.length > 0 ? top.reduce((s, p) => s + p.shares, 0) / top.length : 0;
  const avgTopSaves =
    top.length > 0 ? top.reduce((s, p) => s + p.saves, 0) / top.length : 0;

  lines.push("PATTERN OBSERVATIONS:");
  if (avgTopEngagement > 0) {
    lines.push(
      `- Average engagement on top posts: ${(avgTopEngagement * 100).toFixed(2)}%`
    );
  }
  if (avgTopShares > 1) {
    lines.push(
      `- Top posts average ${avgTopShares.toFixed(1)} shares — prioritize shareability`
    );
  }
  if (avgTopSaves > 1) {
    lines.push(
      `- Top posts average ${avgTopSaves.toFixed(1)} saves — create save-worthy content`
    );
  }

  return lines.join("\n");
}

/**
 * Server action wrapper — safe to call from Next.js server components / actions.
 * Returns the performance context string ready for prompt injection.
 * Returns empty string if no data or on error (non-blocking).
 */
export async function getPerformanceContextForPrompt(
  db: D1Database,
  workspaceId: string,
  platform: Platform
): Promise<string> {
  const ctx = await buildPerformanceContext(db, workspaceId, platform);
  return ctx.hasData ? ctx.platformInsights : "";
}
