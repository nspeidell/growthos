/**
 * Cloudflare Cron Worker: Metrics Sync
 *
 * Runs hourly. For each published post from the last 30 days:
 * 1. Pulls latest metrics from platform APIs
 * 2. Upserts into post_metrics table
 * 3. Calculates engagement rates
 * 4. Caches aggregated KPIs in KV for fast dashboard reads
 */

import type { CloudflareEnv } from "@/lib/cloudflare/bindings";
import { decrypt } from "@/lib/utils/crypto";

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

export default {
  async scheduled(
    _event: ScheduledEvent,
    env: CloudflareEnv
  ): Promise<void> {
    const cutoff = Date.now() - THIRTY_DAYS_MS;

    // Get all published posts from last 30 days
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

    if (!posts || posts.length === 0) return;

    // Group by workspace for KPI aggregation
    const workspaceKPIs: Record<
      string,
      {
        totalImpressions: number;
        totalReach: number;
        totalLikes: number;
        totalComments: number;
        totalShares: number;
        totalClicks: number;
        totalConversions: number;
        postCount: number;
        platformBreakdown: Record<string, PlatformMetrics>;
      }
    > = {};

    for (const post of posts) {
      try {
        // Get the connected account's access token
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

        // Fetch metrics from platform API
        const metrics = await fetchPlatformMetrics(
          post.platform,
          post.platform_post_id!,
          accessToken
        );

        if (!metrics) continue;

        // Calculate engagement rate
        const engagementRate =
          metrics.reach > 0
            ? (
                ((metrics.likes + metrics.comments + metrics.shares) /
                  metrics.reach) *
                100
              ).toFixed(2)
            : "0";

        const now = Date.now();

        // Upsert post_metrics
        const existing = await env.DB.prepare(
          `SELECT id FROM post_metrics WHERE post_id = ?`
        )
          .bind(post.id)
          .first();

        if (existing) {
          await env.DB.prepare(
            `UPDATE post_metrics
             SET impressions = ?, reach = ?, likes = ?, comments = ?,
                 shares = ?, saves = ?, clicks = ?, engagement_rate = ?,
                 fetched_at = ?
             WHERE post_id = ?`
          )
            .bind(
              metrics.impressions,
              metrics.reach,
              metrics.likes,
              metrics.comments,
              metrics.shares,
              metrics.saves,
              metrics.clicks,
              engagementRate,
              now,
              post.id
            )
            .run();
        } else {
          await env.DB.prepare(
            `INSERT INTO post_metrics
             (id, post_id, impressions, reach, likes, comments, shares, saves, clicks, engagement_rate, fetched_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          )
            .bind(
              crypto.randomUUID(),
              post.id,
              metrics.impressions,
              metrics.reach,
              metrics.likes,
              metrics.comments,
              metrics.shares,
              metrics.saves,
              metrics.clicks,
              engagementRate,
              now
            )
            .run();
        }

        // Accumulate workspace KPIs
        if (!workspaceKPIs[post.workspace_id]) {
          workspaceKPIs[post.workspace_id] = {
            totalImpressions: 0,
            totalReach: 0,
            totalLikes: 0,
            totalComments: 0,
            totalShares: 0,
            totalClicks: 0,
            totalConversions: 0,
            postCount: 0,
            platformBreakdown: {},
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

        // Platform breakdown
        if (!ws.platformBreakdown[post.platform]) {
          ws.platformBreakdown[post.platform] = {
            impressions: 0,
            reach: 0,
            likes: 0,
            comments: 0,
            shares: 0,
            saves: 0,
            clicks: 0,
          };
        }
        const pb = ws.platformBreakdown[post.platform]!;
        pb.impressions += metrics.impressions;
        pb.reach += metrics.reach;
        pb.likes += metrics.likes;
        pb.comments += metrics.comments;
        pb.shares += metrics.shares;
        pb.saves += metrics.saves;
        pb.clicks += metrics.clicks;
      } catch (error) {
        console.error(
          `Metrics sync failed for post ${post.id}: ${
            error instanceof Error ? error.message : "Unknown"
          }`
        );
      }
    }

    // Cache aggregated KPIs in KV
    for (const [workspaceId, kpis] of Object.entries(workspaceKPIs)) {
      await env.KV.put(
        `kpi:${workspaceId}`,
        JSON.stringify({
          ...kpis,
          updatedAt: Date.now(),
        }),
        { expirationTtl: 7200 } // 2 hour TTL, refreshed hourly
      );
    }
  },
};

// ─── Platform Metrics Fetchers ───

async function fetchPlatformMetrics(
  platform: string,
  postId: string,
  accessToken: string
): Promise<PlatformMetrics | null> {
  switch (platform) {
    case "instagram":
      return fetchInstagramMetrics(postId, accessToken);
    case "facebook":
      return fetchFacebookMetrics(postId, accessToken);
    case "x":
      return fetchXMetrics(postId, accessToken);
    case "reddit":
      return fetchRedditMetrics(postId, accessToken);
    default:
      return null;
  }
}

async function fetchInstagramMetrics(
  mediaId: string,
  accessToken: string
): Promise<PlatformMetrics | null> {
  try {
    const res = await fetch(
      `https://graph.facebook.com/v21.0/${mediaId}/insights?metric=impressions,reach,likes,comments,shares,saved&access_token=${accessToken}`
    );
    if (!res.ok) return null;

    const data = await res.json() as {
      data: Array<{ name: string; values: Array<{ value: number }> }>;
    };

    const getValue = (name: string) =>
      data.data.find((m) => m.name === name)?.values[0]?.value ?? 0;

    return {
      impressions: getValue("impressions"),
      reach: getValue("reach"),
      likes: getValue("likes"),
      comments: getValue("comments"),
      shares: getValue("shares"),
      saves: getValue("saved"),
      clicks: 0, // IG doesn't expose clicks via insights
    };
  } catch {
    return null;
  }
}

async function fetchFacebookMetrics(
  postId: string,
  accessToken: string
): Promise<PlatformMetrics | null> {
  try {
    const res = await fetch(
      `https://graph.facebook.com/v21.0/${postId}?fields=insights.metric(post_impressions,post_engaged_users,post_clicks)&access_token=${accessToken}`
    );
    if (!res.ok) return null;

    const data = await res.json() as {
      insights?: {
        data: Array<{ name: string; values: Array<{ value: number }> }>;
      };
    };

    const getValue = (name: string) =>
      data.insights?.data.find((m) => m.name === name)?.values[0]?.value ?? 0;

    return {
      impressions: getValue("post_impressions"),
      reach: getValue("post_engaged_users"),
      likes: 0,
      comments: 0,
      shares: 0,
      saves: 0,
      clicks: getValue("post_clicks"),
    };
  } catch {
    return null;
  }
}

async function fetchXMetrics(
  tweetId: string,
  accessToken: string
): Promise<PlatformMetrics | null> {
  try {
    const res = await fetch(
      `https://api.x.com/2/tweets/${tweetId}?tweet.fields=public_metrics`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!res.ok) return null;

    const data = await res.json() as {
      data: {
        public_metrics: {
          impression_count: number;
          like_count: number;
          reply_count: number;
          retweet_count: number;
          bookmark_count: number;
        };
      };
    };

    const m = data.data.public_metrics;
    return {
      impressions: m.impression_count,
      reach: m.impression_count, // X doesn't distinguish reach
      likes: m.like_count,
      comments: m.reply_count,
      shares: m.retweet_count,
      saves: m.bookmark_count,
      clicks: 0,
    };
  } catch {
    return null;
  }
}

async function fetchRedditMetrics(
  postName: string,
  accessToken: string
): Promise<PlatformMetrics | null> {
  try {
    const res = await fetch(
      `https://oauth.reddit.com/api/info?id=${postName}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "User-Agent": "GrowthOS/1.0",
        },
      }
    );
    if (!res.ok) return null;

    const data = await res.json() as {
      data: {
        children: Array<{
          data: {
            score: number;
            num_comments: number;
            ups: number;
            upvote_ratio: number;
          };
        }>;
      };
    };

    const post = data.data.children[0]?.data;
    if (!post) return null;

    return {
      impressions: 0, // Reddit doesn't expose impressions via API
      reach: 0,
      likes: post.ups,
      comments: post.num_comments,
      shares: 0,
      saves: 0,
      clicks: 0,
    };
  } catch {
    return null;
  }
}
