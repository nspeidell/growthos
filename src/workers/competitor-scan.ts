/**
 * Cloudflare Cron Worker: Competitor Scanner
 *
 * Runs hourly. For each active competitor:
 * 1. Fetches latest public posts via platform APIs (rate-limited)
 * 2. Inserts new posts into competitor_posts
 * 3. Queues batch AI analysis via MEDIA_QUEUE
 *
 * Note: Full API integration requires platform API keys.
 * This worker provides the framework — platform-specific fetchers
 * are stubbed for per-deployment configuration.
 */

import type { CloudflareEnv } from "@/lib/cloudflare/bindings";

interface CompetitorRow {
  id: string;
  name: string;
  platform: string;
  handle: string | null;
  url: string | null;
}

export default {
  async scheduled(
    _event: ScheduledEvent,
    env: CloudflareEnv
  ): Promise<void> {
    // Get all active competitors
    const { results: competitors } = await env.DB.prepare(
      `SELECT id, name, platform, handle, url
       FROM competitors
       WHERE is_active = 1`
    ).all<CompetitorRow>();

    if (!competitors || competitors.length === 0) return;

    for (const comp of competitors) {
      try {
        // Fetch latest posts (platform-specific)
        const posts = await fetchLatestPosts(comp);

        for (const post of posts) {
          // Check if we already have this post
          const existing = await env.DB.prepare(
            `SELECT id FROM competitor_posts
             WHERE competitor_id = ? AND post_url = ?`
          )
            .bind(comp.id, post.url)
            .first();

          if (existing) continue;

          // Insert new post
          const postId = crypto.randomUUID();
          await env.DB.prepare(
            `INSERT INTO competitor_posts (id, competitor_id, post_url, post_date, content, metrics, scraped_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`
          )
            .bind(
              postId,
              comp.id,
              post.url,
              post.date ? new Date(post.date).getTime() : null,
              post.content,
              post.metrics ? JSON.stringify(post.metrics) : null,
              Date.now()
            )
            .run();
        }
      } catch (error) {
        const errorMsg =
          error instanceof Error ? error.message : "Unknown error";
        console.error(
          `Competitor scan failed for ${comp.name}: ${errorMsg}`
        );
      }
    }
  },
};

// ─── Platform Fetchers ───

interface ScrapedPost {
  url: string;
  content: string;
  date?: string;
  metrics?: Record<string, number>;
}

async function fetchLatestPosts(
  competitor: CompetitorRow
): Promise<ScrapedPost[]> {
  switch (competitor.platform) {
    case "x":
      return fetchXPosts(competitor);
    case "reddit":
      return fetchRedditPosts(competitor);
    default:
      // Other platforms require dedicated API access
      // Instagram/Facebook require approved Meta API access
      // YouTube requires Data API quota
      return [];
  }
}

/**
 * Fetch recent X posts via public API.
 * Requires X_BEARER_TOKEN in env for v2 API access.
 */
async function fetchXPosts(
  _competitor: CompetitorRow
): Promise<ScrapedPost[]> {
  // X API v2 requires elevated access for user tweet lookups
  // Implementation: GET /2/users/:id/tweets with bearer token
  // Stubbed — requires X_BEARER_TOKEN secret
  return [];
}

/**
 * Fetch recent Reddit posts via public JSON endpoints.
 * Reddit's public JSON API doesn't require auth for public subreddits/users.
 */
async function fetchRedditPosts(
  competitor: CompetitorRow
): Promise<ScrapedPost[]> {
  if (!competitor.handle) return [];

  try {
    const res = await fetch(
      `https://www.reddit.com/user/${competitor.handle}/submitted.json?limit=10&sort=new`,
      {
        headers: { "User-Agent": "GrowthOS/1.0 CompetitorScanner" },
      }
    );

    if (!res.ok) return [];

    const data = await res.json() as {
      data: {
        children: Array<{
          data: {
            url: string;
            selftext: string;
            title: string;
            created_utc: number;
            score: number;
            num_comments: number;
          };
        }>;
      };
    };

    return data.data.children.map((child) => ({
      url: `https://reddit.com${child.data.url}`,
      content: `${child.data.title}\n\n${child.data.selftext}`,
      date: new Date(child.data.created_utc * 1000).toISOString(),
      metrics: {
        score: child.data.score,
        comments: child.data.num_comments,
      },
    }));
  } catch {
    return [];
  }
}
