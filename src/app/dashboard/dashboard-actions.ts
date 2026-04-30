"use server";

import { eq, and, gte, sql } from "drizzle-orm";
import { requireAuth } from "@/lib/auth/middleware";
import { getBindings } from "@/lib/cloudflare/bindings";
import { createDb } from "@/lib/db/client";
import {
  contentAssets,
  contentProjects,
  scheduledPosts,
  postMetrics,
  adCampaigns,
  connectedAccounts,
} from "@/lib/db/schema";
import { safeAction, type ActionResult } from "@/lib/utils/api";

// ─── Types ───

export interface DashboardKPIs {
  contentCreated: number;
  postsPublished: number;
  totalImpressions: number;
  totalClicks: number;
  totalConversions: number;
  engagementRate: number;
  adSpend: number;
  subscriberCount: number;
  postsScheduled: number;
  connectedPlatforms: number;
  growthScore: number;
}

export interface TopChannel {
  platform: string;
  impressions: number;
  engagement: number;
  posts: number;
}

export interface RecentActivity {
  type: "published" | "created" | "scheduled";
  title: string;
  platform?: string;
  timestamp: Date;
}

// ─── Growth Score Algorithm ───

function calculateGrowthScore(kpis: Omit<DashboardKPIs, "growthScore">): number {
  // Weighted scoring (0-100):
  // - Content velocity: 20% (posts published this period)
  // - Reach: 25% (impressions growth)
  // - Engagement: 25% (engagement rate)
  // - Conversion: 20% (clicks + conversions)
  // - Platform diversity: 10% (connected platforms)

  const contentScore = Math.min(kpis.postsPublished * 5, 100);
  const reachScore = Math.min(kpis.totalImpressions / 100, 100);
  const engagementScore = Math.min(kpis.engagementRate * 20, 100);
  const conversionScore = Math.min((kpis.totalClicks + kpis.totalConversions * 10) / 5, 100);
  const diversityScore = Math.min(kpis.connectedPlatforms * 20, 100);

  const score = Math.round(
    contentScore * 0.2 +
      reachScore * 0.25 +
      engagementScore * 0.25 +
      conversionScore * 0.2 +
      diversityScore * 0.1
  );

  return Math.min(score, 100);
}

// ─── Get Dashboard KPIs ───

export async function getDashboardKPIs(): Promise<ActionResult<DashboardKPIs>> {
  return safeAction(async () => {
    const session = await requireAuth();
    const env = getBindings();
    const db = createDb(env.DB);

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    // Content created (last 30d) — contentAssets relate through contentProjects
    const contentResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(contentAssets)
      .innerJoin(
        contentProjects,
        eq(contentAssets.projectId, contentProjects.id)
      )
      .where(
        and(
          eq(contentProjects.workspaceId, session.workspaceId),
          gte(contentAssets.createdAt, thirtyDaysAgo)
        )
      )
      .get();

    // Posts published (last 30d)
    const publishedResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(scheduledPosts)
      .where(
        and(
          eq(scheduledPosts.workspaceId, session.workspaceId),
          eq(scheduledPosts.postStatus, "published")
        )
      )
      .get();

    // Posts scheduled (upcoming)
    const scheduledResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(scheduledPosts)
      .where(
        and(
          eq(scheduledPosts.workspaceId, session.workspaceId),
          eq(scheduledPosts.postStatus, "queued")
        )
      )
      .get();

    // Connected platforms
    const platformsResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(connectedAccounts)
      .where(
        and(
          eq(connectedAccounts.workspaceId, session.workspaceId),
          eq(connectedAccounts.accountStatus, "active")
        )
      )
      .get();

    // Metrics aggregation from KV cache
    let totalImpressions = 0;
    let totalClicks = 0;
    let totalConversions = 0;
    let engagementRate = 0;

    const cachedKPIs = await env.KV.get(`analytics_kpis:${session.workspaceId}`);
    if (cachedKPIs) {
      const parsed = JSON.parse(cachedKPIs) as {
        impressions?: number;
        clicks?: number;
        engagementRate?: number;
      };
      totalImpressions = parsed.impressions ?? 0;
      totalClicks = parsed.clicks ?? 0;
      engagementRate = parsed.engagementRate ?? 0;
    }

    // Ad spend
    const adResult = await db
      .select({ totalSpend: sql<number>`COALESCE(SUM(spend), 0)` })
      .from(adCampaigns)
      .where(eq(adCampaigns.workspaceId, session.workspaceId))
      .get();

    // Subscriber count from KV
    const subCount = await env.KV.get(`subscribers_count:${session.workspaceId}`);

    const kpis: Omit<DashboardKPIs, "growthScore"> = {
      contentCreated: contentResult?.count ?? 0,
      postsPublished: publishedResult?.count ?? 0,
      totalImpressions,
      totalClicks,
      totalConversions,
      engagementRate,
      adSpend: adResult?.totalSpend ?? 0,
      subscriberCount: subCount ? parseInt(subCount) : 0,
      postsScheduled: scheduledResult?.count ?? 0,
      connectedPlatforms: platformsResult?.count ?? 0,
    };

    return {
      ...kpis,
      growthScore: calculateGrowthScore(kpis),
    };
  });
}

// ─── Get Top Channels ───

export async function getTopChannels(): Promise<ActionResult<TopChannel[]>> {
  return safeAction(async () => {
    const session = await requireAuth();
    const env = getBindings();

    // Try KV cache first
    const cached = await env.KV.get(`platform_comparison:${session.workspaceId}`);
    if (cached) {
      return JSON.parse(cached) as TopChannel[];
    }

    // Fallback: compute from published posts
    const db = createDb(env.DB);
    const platforms = await db
      .select({
        platform: scheduledPosts.platform,
        posts: sql<number>`count(*)`,
      })
      .from(scheduledPosts)
      .where(
        and(
          eq(scheduledPosts.workspaceId, session.workspaceId),
          eq(scheduledPosts.postStatus, "published")
        )
      )
      .groupBy(scheduledPosts.platform)
      .all();

    return platforms.map((p) => ({
      platform: p.platform,
      impressions: 0,
      engagement: 0,
      posts: p.posts,
    }));
  });
}
