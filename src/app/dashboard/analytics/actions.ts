"use server";

import { eq, desc, and, gte, sql } from "drizzle-orm";
import { requirePermission } from "@/lib/auth/middleware";
import { getBindings } from "@/lib/cloudflare/bindings";
import { createDb } from "@/lib/db/client";
import { postMetrics, scheduledPosts, subscribers } from "@/lib/db/schema";
import { kvGet } from "@/lib/cloudflare/kv";
import { safeAction, type ActionResult } from "@/lib/utils/api";
import type { PostMetric, ScheduledPost } from "@/lib/db/schema";

// ─── Types ───

export interface KPISummary {
  totalImpressions: number;
  totalReach: number;
  totalLikes: number;
  totalComments: number;
  totalShares: number;
  totalClicks: number;
  totalConversions: number;
  postCount: number;
  avgEngagementRate: number;
  platformBreakdown: Record<
    string,
    {
      impressions: number;
      reach: number;
      likes: number;
      comments: number;
      shares: number;
      saves: number;
      clicks: number;
    }
  >;
  updatedAt: number;
}

export interface PostWithMetrics {
  post: ScheduledPost;
  metrics: PostMetric | null;
}

// ─── Get KPI Summary (from KV cache or compute) ───

export async function getKPISummary(): Promise<ActionResult<KPISummary>> {
  return safeAction(async () => {
    const session = await requirePermission("analytics:read");

    // Try KV cache first
    const cached = await kvGet<KPISummary>(`kpi:${session.workspaceId}`);
    if (cached) return cached;

    // Fall back to computing from D1
    const { DB } = getBindings();
    const db = createDb(DB);

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const publishedPosts = await db
      .select()
      .from(scheduledPosts)
      .where(
        and(
          eq(scheduledPosts.workspaceId, session.workspaceId),
          eq(scheduledPosts.postStatus, "published"),
          gte(scheduledPosts.publishedAt, thirtyDaysAgo)
        )
      )
      .all();

    const summary: KPISummary = {
      totalImpressions: 0,
      totalReach: 0,
      totalLikes: 0,
      totalComments: 0,
      totalShares: 0,
      totalClicks: 0,
      totalConversions: 0,
      postCount: publishedPosts.length,
      avgEngagementRate: 0,
      platformBreakdown: {},
      updatedAt: Date.now(),
    };

    let totalEngRate = 0;
    let metricsCount = 0;

    for (const post of publishedPosts) {
      const metric = await db
        .select()
        .from(postMetrics)
        .where(eq(postMetrics.postId, post.id))
        .get();

      if (metric) {
        summary.totalImpressions += metric.impressions ?? 0;
        summary.totalReach += metric.reach ?? 0;
        summary.totalLikes += metric.likes ?? 0;
        summary.totalComments += metric.comments ?? 0;
        summary.totalShares += metric.shares ?? 0;
        summary.totalClicks += metric.clicks ?? 0;
        summary.totalConversions += metric.conversions ?? 0;

        if (metric.engagementRate) {
          totalEngRate += parseFloat(metric.engagementRate);
          metricsCount++;
        }

        // Platform breakdown
        if (!summary.platformBreakdown[post.platform]) {
          summary.platformBreakdown[post.platform] = {
            impressions: 0,
            reach: 0,
            likes: 0,
            comments: 0,
            shares: 0,
            saves: 0,
            clicks: 0,
          };
        }
        const pb = summary.platformBreakdown[post.platform]!;
        pb.impressions += metric.impressions ?? 0;
        pb.reach += metric.reach ?? 0;
        pb.likes += metric.likes ?? 0;
        pb.comments += metric.comments ?? 0;
        pb.shares += metric.shares ?? 0;
        pb.saves += metric.saves ?? 0;
        pb.clicks += metric.clicks ?? 0;
      }
    }

    summary.avgEngagementRate =
      metricsCount > 0 ? totalEngRate / metricsCount : 0;

    return summary;
  });
}

// ─── Get Post Metrics (individual posts with their metrics) ───

export async function getPostsWithMetrics(
  limit = 20
): Promise<ActionResult<PostWithMetrics[]>> {
  return safeAction(async () => {
    const session = await requirePermission("analytics:read");
    const { DB } = getBindings();
    const db = createDb(DB);

    const posts = await db
      .select()
      .from(scheduledPosts)
      .where(
        and(
          eq(scheduledPosts.workspaceId, session.workspaceId),
          eq(scheduledPosts.postStatus, "published")
        )
      )
      .orderBy(desc(scheduledPosts.publishedAt))
      .limit(limit)
      .all();

    const result: PostWithMetrics[] = [];

    for (const post of posts) {
      const metric = await db
        .select()
        .from(postMetrics)
        .where(eq(postMetrics.postId, post.id))
        .get();

      result.push({ post, metrics: metric ?? null });
    }

    return result;
  });
}

// ─── Get Platform Comparison ───

export async function getPlatformComparison(): Promise<
  ActionResult<
    Array<{
      platform: string;
      posts: number;
      totalEngagement: number;
      avgEngagementRate: number;
    }>
  >
> {
  return safeAction(async () => {
    const session = await requirePermission("analytics:read");

    const kpis = await kvGet<KPISummary>(`kpi:${session.workspaceId}`);
    if (!kpis || !kpis.platformBreakdown) return [];

    return Object.entries(kpis.platformBreakdown).map(
      ([platform, metrics]) => {
        const totalEng =
          metrics.likes + metrics.comments + metrics.shares;
        const avgRate =
          metrics.reach > 0 ? (totalEng / metrics.reach) * 100 : 0;

        return {
          platform,
          posts: 0, // Would need separate query to count
          totalEngagement: totalEng,
          avgEngagementRate: parseFloat(avgRate.toFixed(2)),
        };
      }
    );
  });
}

// ─── Get Subscriber Stats ───

export interface SubscriberStats {
  total: number;
  active: number;
  unsubscribed: number;
  newThisPeriod: number;
  bySource: Record<string, number>;
}

export async function getSubscriberStats(
  days = 30
): Promise<ActionResult<SubscriberStats>> {
  return safeAction(async () => {
    const session = await requirePermission("analytics:read");
    const { DB } = getBindings();
    const db = createDb(DB);

    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const allSubs = await db
      .select()
      .from(subscribers)
      .where(eq(subscribers.workspaceId, session.workspaceId))
      .all();

    const bySource: Record<string, number> = {};
    let active = 0;
    let unsubscribed = 0;
    let newThisPeriod = 0;

    for (const sub of allSubs) {
      if (sub.subscriberStatus === "active") active++;
      if (sub.subscriberStatus === "unsubscribed") unsubscribed++;

      const src = sub.source ?? "manual";
      bySource[src] = (bySource[src] ?? 0) + 1;

      if (sub.subscribedAt && new Date(sub.subscribedAt) >= cutoff) {
        newThisPeriod++;
      }
    }

    return {
      total: allSubs.length,
      active,
      unsubscribed,
      newThisPeriod,
      bySource,
    };
  });
}

// ─── Get Top Posts (by engagement rate) ───

export async function getTopPosts(
  days = 30,
  limit = 10
): Promise<ActionResult<PostWithMetrics[]>> {
  return safeAction(async () => {
    const session = await requirePermission("analytics:read");
    const { DB } = getBindings();
    const db = createDb(DB);

    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const posts = await db
      .select()
      .from(scheduledPosts)
      .where(
        and(
          eq(scheduledPosts.workspaceId, session.workspaceId),
          eq(scheduledPosts.postStatus, "published"),
          gte(scheduledPosts.publishedAt, cutoff)
        )
      )
      .orderBy(desc(scheduledPosts.publishedAt))
      .all();

    const withMetrics: PostWithMetrics[] = [];

    for (const post of posts) {
      const metric = await db
        .select()
        .from(postMetrics)
        .where(eq(postMetrics.postId, post.id))
        .get();
      withMetrics.push({ post, metrics: metric ?? null });
    }

    // Sort by engagement rate descending (posts with metrics first)
    withMetrics.sort((a, b) => {
      const rateA = a.metrics?.engagementRate
        ? parseFloat(a.metrics.engagementRate)
        : -1;
      const rateB = b.metrics?.engagementRate
        ? parseFloat(b.metrics.engagementRate)
        : -1;
      return rateB - rateA;
    });

    return withMetrics.slice(0, limit);
  });
}
