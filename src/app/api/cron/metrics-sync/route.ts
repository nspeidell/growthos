/**
 * GET /api/cron/metrics-sync
 *
 * Vercel Cron handler — runs hourly.
 * Syncs post metrics from platform APIs and caches KPIs in KV.
 *
 * Protected by CRON_SECRET header to prevent unauthorized invocations.
 * In production, Vercel sends the Authorization header automatically for cron jobs.
 */

import { NextRequest, NextResponse } from "next/server";
import { getBindings } from "@/lib/cloudflare/bindings";
import { decrypt } from "@/lib/utils/crypto";

export const runtime = "edge";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

interface PublishedPostRow {
  id: string;
  platform: string;
  platform_post_id: string | null;
  connected_account_id: string;
  workspace_id: string;
}

interface PlatformMetrics {
  impressions: number;
  reach: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  clicks: number;
}

export async function GET(request: NextRequest) {
  // Verify cron secret
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const env = getBindings();
  const cutoff = Date.now() - THIRTY_DAYS_MS;

  const { results: posts } = await env.DB.prepare(
    `SELECT sp.id, sp.platform, sp.platform_post_id, sp.connected_account_id, sp.workspace_id
     FROM scheduled_posts sp
     WHERE sp.post_status = 'published'
       AND sp.published_at > ?
       AND sp.platform_post_id IS NOT NULL
     ORDER BY sp.published_at DESC
     LIMIT 200`
  )
    .bind(cutoff)
    .all<PublishedPostRow>();

  if (!posts || posts.length === 0) {
    return NextResponse.json({ synced: 0 });
  }

  const workspaceKPIs: Record<string, {
    totalImpressions: number;
    totalReach: number;
    totalLikes: number;
    totalComments: number;
    totalShares: number;
    totalClicks: number;
    postCount: number;
  }> = {};

  let synced = 0;

  for (const post of posts) {
    try {
      const account = await env.DB.prepare(
        `SELECT access_token_encrypted, account_status
         FROM connected_accounts WHERE id = ?`
      )
        .bind(post.connected_account_id)
        .first<{ access_token_encrypted: string; account_status: string }>();

      if (!account || account.account_status !== "active") continue;

      const accessToken = await decrypt(
        account.access_token_encrypted,
        env.ENCRYPTION_KEY
      );

      const metrics = await fetchPlatformMetrics(
        post.platform,
        post.platform_post_id!,
        accessToken
      );

      if (!metrics) continue;

      const engagementRate =
        metrics.reach > 0
          ? (((metrics.likes + metrics.comments + metrics.shares) / metrics.reach) * 100).toFixed(2)
          : "0";

      const now = Date.now();

      const existing = await env.DB.prepare(
        `SELECT id FROM post_metrics WHERE post_id = ?`
      )
        .bind(post.id)
        .first();

      if (existing) {
        await env.DB.prepare(
          `UPDATE post_metrics
           SET impressions = ?, reach = ?, likes = ?, comments = ?,
               shares = ?, saves = ?, clicks = ?, engagement_rate = ?, fetched_at = ?
           WHERE post_id = ?`
        )
          .bind(metrics.impressions, metrics.reach, metrics.likes, metrics.comments, metrics.shares, metrics.saves, metrics.clicks, engagementRate, now, post.id)
          .run();
      } else {
        await env.DB.prepare(
          `INSERT INTO post_metrics (id, post_id, impressions, reach, likes, comments, shares, saves, clicks, engagement_rate, fetched_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
          .bind(crypto.randomUUID(), post.id, metrics.impressions, metrics.reach, metrics.likes, metrics.comments, metrics.shares, metrics.saves, metrics.clicks, engagementRate, now)
          .run();
      }

      // Accumulate
      if (!workspaceKPIs[post.workspace_id]) {
        workspaceKPIs[post.workspace_id] = {
          totalImpressions: 0, totalReach: 0, totalLikes: 0,
          totalComments: 0, totalShares: 0, totalClicks: 0, postCount: 0,
        };
      }
      const ws = workspaceKPIs[post.workspace_id]!;
      ws.totalImpressions += metrics.impressions;
      ws.totalReach += metrics.reach;
      ws.totalLikes += metrics.likes;
      ws.totalComments += metrics.comments;
      ws.totalShares += metrics.shares;
      ws.totalClicks += metrics.clicks;
      ws.postCount += 1;
      synced++;
    } catch (error) {
      console.error(`Metrics sync failed for post ${post.id}:`, error);
    }
  }

  // Cache KPIs
  for (const [workspaceId, kpis] of Object.entries(workspaceKPIs)) {
    await env.KV.put(
      `kpi:${workspaceId}`,
      JSON.stringify({ ...kpis, updatedAt: Date.now() }),
      { expirationTtl: 7200 }
    );
  }

  return NextResponse.json({ synced, workspaces: Object.keys(workspaceKPIs).length });
}

// ─── Platform Fetchers (simplified) ───

async function fetchPlatformMetrics(
  platform: string,
  postId: string,
  accessToken: string
): Promise<PlatformMetrics | null> {
  switch (platform) {
    case "instagram":
    case "facebook":
      return fetchMetaMetrics(postId, accessToken);
    case "x":
      return fetchXMetrics(postId, accessToken);
    case "reddit":
      return fetchRedditMetrics(postId, accessToken);
    default:
      return null;
  }
}

async function fetchMetaMetrics(postId: string, accessToken: string): Promise<PlatformMetrics | null> {
  try {
    const res = await fetch(
      `https://graph.facebook.com/v21.0/${postId}/insights?metric=impressions,reach,likes,comments,shares,saved&access_token=${accessToken}`
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { data: Array<{ name: string; values: Array<{ value: number }> }> };
    const getValue = (name: string) => data.data.find((m) => m.name === name)?.values[0]?.value ?? 0;
    return { impressions: getValue("impressions"), reach: getValue("reach"), likes: getValue("likes"), comments: getValue("comments"), shares: getValue("shares"), saves: getValue("saved"), clicks: 0 };
  } catch { return null; }
}

async function fetchXMetrics(tweetId: string, accessToken: string): Promise<PlatformMetrics | null> {
  try {
    const res = await fetch(`https://api.x.com/2/tweets/${tweetId}?tweet.fields=public_metrics`, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) return null;
    const data = (await res.json()) as { data: { public_metrics: { impression_count: number; like_count: number; reply_count: number; retweet_count: number; bookmark_count: number } } };
    const m = data.data.public_metrics;
    return { impressions: m.impression_count, reach: m.impression_count, likes: m.like_count, comments: m.reply_count, shares: m.retweet_count, saves: m.bookmark_count, clicks: 0 };
  } catch { return null; }
}

async function fetchRedditMetrics(postName: string, accessToken: string): Promise<PlatformMetrics | null> {
  try {
    const res = await fetch(`https://oauth.reddit.com/api/info?id=${postName}`, { headers: { Authorization: `Bearer ${accessToken}`, "User-Agent": "GrowthOS/1.0" } });
    if (!res.ok) return null;
    const data = (await res.json()) as { data: { children: Array<{ data: { score: number; num_comments: number; ups: number } }> } };
    const post = data.data.children[0]?.data;
    if (!post) return null;
    return { impressions: 0, reach: 0, likes: post.ups, comments: post.num_comments, shares: 0, saves: 0, clicks: 0 };
  } catch { return null; }
}
