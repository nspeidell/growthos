/**
 * Social Listening — Data Source Adapters
 *
 * Each adapter fetches content from a platform and normalizes it
 * into RawSignalContent for AI analysis.
 *
 * Supported sources:
 * - Reddit (public JSON API)
 * - Google News (RSS scraping)
 * - RSS feeds (standard RSS/Atom parsing)
 * - YouTube (Data API v3 — search + comments)
 * - X/Twitter (API v2 — requires bearer token)
 * - Forums (generic HTML scraping via selectors)
 */

import type {
  RawSignalContent,
  SourcePlatform,
  RedditSourceConfig,
  XSourceConfig,
  GoogleNewsSourceConfig,
  RssSourceConfig,
  YouTubeSourceConfig,
  ForumSourceConfig,
  SourceConfig,
} from "./types";

// ═══════════════════════════════════════════
// Adapter Interface
// ═══════════════════════════════════════════

export interface SourceAdapter {
  platform: SourcePlatform;
  fetch(config: SourceConfig): Promise<RawSignalContent[]>;
}

/**
 * Route to the correct adapter based on platform type.
 */
export async function fetchFromSource(
  platform: SourcePlatform,
  config: SourceConfig
): Promise<RawSignalContent[]> {
  switch (platform) {
    case "reddit":
      return fetchReddit(config as RedditSourceConfig);
    case "google_news":
      return fetchGoogleNews(config as GoogleNewsSourceConfig);
    case "rss":
      return fetchRss(config as RssSourceConfig);
    case "youtube":
      return fetchYouTube(config as YouTubeSourceConfig);
    case "x":
      return fetchX(config as XSourceConfig);
    case "forum":
      return fetchForum(config as ForumSourceConfig);
    default:
      return [];
  }
}

// ═══════════════════════════════════════════
// Reddit Adapter (Public JSON API — no auth required)
// ═══════════════════════════════════════════

async function fetchReddit(config: RedditSourceConfig): Promise<RawSignalContent[]> {
  const results: RawSignalContent[] = [];
  const headers = {
    "User-Agent": "GrowthOS/1.0 (Social Listening Bot)",
  };

  // Fetch from each subreddit
  for (const sub of config.subreddits) {
    try {
      const url = `https://www.reddit.com/r/${encodeURIComponent(sub)}/new.json?limit=25`;
      const response = await fetch(url, { headers });

      if (!response.ok) continue;

      const data = (await response.json()) as {
        data?: {
          children?: Array<{
            data?: {
              title?: string;
              selftext?: string;
              author?: string;
              url?: string;
              permalink?: string;
              ups?: number;
              num_comments?: number;
              created_utc?: number;
            };
          }>;
        };
      };

      const children = data.data?.children;
      if (!children) continue;

      for (const child of children) {
        const post = child.data;
        if (!post) continue;

        const upvotes = post.ups ?? 0;
        if (config.minUpvotes && upvotes < config.minUpvotes) continue;

        results.push({
          platform: "reddit",
          url: post.permalink
            ? `https://www.reddit.com${post.permalink}`
            : post.url ?? undefined,
          author: post.author ?? undefined,
          title: post.title ?? undefined,
          content: `${post.title ?? ""}\n\n${post.selftext ?? ""}`.trim(),
          publishedAt: post.created_utc ? Math.floor(post.created_utc) : undefined,
          engagementLikes: upvotes,
          engagementComments: post.num_comments ?? 0,
        });
      }
    } catch (error) {
      console.warn("[adapters] Failed to fetch Reddit r/" + sub, error);
    }
  }

  // Also run search queries
  if (config.searchQueries) {
    for (const query of config.searchQueries) {
      try {
        const url = `https://www.reddit.com/search.json?q=${encodeURIComponent(query)}&sort=new&limit=25`;
        const response = await fetch(url, { headers });

        if (!response.ok) continue;

        const data = (await response.json()) as {
          data?: {
            children?: Array<{
              data?: {
                title?: string;
                selftext?: string;
                author?: string;
                permalink?: string;
                ups?: number;
                num_comments?: number;
                created_utc?: number;
              };
            }>;
          };
        };

        const children = data.data?.children;
        if (!children) continue;

        for (const child of children) {
          const post = child.data;
          if (!post) continue;

          results.push({
            platform: "reddit",
            url: post.permalink
              ? `https://www.reddit.com${post.permalink}`
              : undefined,
            author: post.author ?? undefined,
            title: post.title ?? undefined,
            content: `${post.title ?? ""}\n\n${post.selftext ?? ""}`.trim(),
            publishedAt: post.created_utc ? Math.floor(post.created_utc) : undefined,
            engagementLikes: post.ups ?? 0,
            engagementComments: post.num_comments ?? 0,
          });
        }
      } catch (error) {
        console.warn("[adapters] Failed Reddit search query:", query, error);
      }
    }
  }

  return deduplicateByUrl(results);
}

// ═══════════════════════════════════════════
// Google News Adapter (via RSS feed)
// ═══════════════════════════════════════════

async function fetchGoogleNews(config: GoogleNewsSourceConfig): Promise<RawSignalContent[]> {
  const results: RawSignalContent[] = [];

  for (const query of config.searchQueries) {
    try {
      const region = config.regions?.[0] ?? "US";
      const lang = config.language ?? "en";
      const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=${lang}&gl=${region}&ceid=${region}:${lang}`;

      const response = await fetch(url);
      if (!response.ok) continue;

      const xml = await response.text();
      const items = parseRssItems(xml);

      for (const item of items) {
        results.push({
          platform: "google_news",
          url: item.link ?? undefined,
          author: item.source ?? undefined,
          title: item.title ?? undefined,
          content: `${item.title ?? ""}\n\n${item.description ?? ""}`.trim(),
          publishedAt: item.pubDate ? Math.floor(new Date(item.pubDate).getTime() / 1000) : undefined,
        });
      }
    } catch (error) {
      console.warn("[adapters] Failed Google News query:", query, error);
    }
  }

  return results;
}

// ═══════════════════════════════════════════
// RSS Feed Adapter
// ═══════════════════════════════════════════

async function fetchRss(config: RssSourceConfig): Promise<RawSignalContent[]> {
  const results: RawSignalContent[] = [];

  for (const feedUrl of config.feedUrls) {
    try {
      const response = await fetch(feedUrl);
      if (!response.ok) continue;

      const xml = await response.text();
      const items = parseRssItems(xml);

      for (const item of items) {
        results.push({
          platform: "rss",
          url: item.link ?? undefined,
          author: item.author ?? item.source ?? undefined,
          title: item.title ?? undefined,
          content: `${item.title ?? ""}\n\n${item.description ?? ""}`.trim(),
          publishedAt: item.pubDate ? Math.floor(new Date(item.pubDate).getTime() / 1000) : undefined,
        });
      }
    } catch (error) {
      console.warn("[adapters] Failed to fetch RSS feed:", feedUrl, error);
    }
  }

  return results;
}

// ═══════════════════════════════════════════
// YouTube Adapter (Data API v3)
// ═══════════════════════════════════════════

async function fetchYouTube(config: YouTubeSourceConfig): Promise<RawSignalContent[]> {
  const results: RawSignalContent[] = [];

  // YouTube API requires an API key — check if available
  // For now, use the RSS feed approach (no auth needed)
  if (config.channelIds) {
    for (const channelId of config.channelIds) {
      try {
        const url = `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`;
        const response = await fetch(url);
        if (!response.ok) continue;

        const xml = await response.text();
        const items = parseAtomItems(xml);

        for (const item of items) {
          results.push({
            platform: "youtube",
            url: item.link ?? undefined,
            author: item.author ?? undefined,
            title: item.title ?? undefined,
            content: `${item.title ?? ""}\n\n${item.description ?? ""}`.trim(),
            publishedAt: item.pubDate ? Math.floor(new Date(item.pubDate).getTime() / 1000) : undefined,
          });
        }
      } catch (error) {
        console.warn("[adapters] Failed to fetch YouTube channel:", channelId, error);
      }
    }
  }

  // Search via RSS (limited but auth-free)
  if (config.searchQueries) {
    for (const query of config.searchQueries) {
      try {
        // YouTube search RSS isn't available; use Google News with site filter
        const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query + " site:youtube.com")}&hl=en&gl=US`;
        const response = await fetch(url);
        if (!response.ok) continue;

        const xml = await response.text();
        const items = parseRssItems(xml);

        for (const item of items) {
          results.push({
            platform: "youtube",
            url: item.link ?? undefined,
            title: item.title ?? undefined,
            content: `${item.title ?? ""}\n\n${item.description ?? ""}`.trim(),
            publishedAt: item.pubDate ? Math.floor(new Date(item.pubDate).getTime() / 1000) : undefined,
          });
        }
      } catch (error) {
        console.warn("[adapters] Failed YouTube search query:", query, error);
      }
    }
  }

  return results;
}

// ═══════════════════════════════════════════
// X/Twitter Adapter (API v2 — stub, requires bearer token)
// ═══════════════════════════════════════════

async function fetchX(_config: XSourceConfig): Promise<RawSignalContent[]> {
  // X API v2 requires OAuth 2.0 bearer token
  // TODO: Implement when X_BEARER_TOKEN is added to env bindings
  // For now, return empty — X integration will be a future enhancement
  // The search endpoint is: GET https://api.twitter.com/2/tweets/search/recent
  return [];
}

// ═══════════════════════════════════════════
// Forum Adapter (generic HTML scraping — stub)
// ═══════════════════════════════════════════

async function fetchForum(_config: ForumSourceConfig): Promise<RawSignalContent[]> {
  // Generic forum scraping requires custom selectors per site
  // TODO: Implement basic HTML parsing with configurable CSS selectors
  return [];
}

// ═══════════════════════════════════════════
// XML/RSS Parsing Helpers
// ═══════════════════════════════════════════

interface RssItem {
  title?: string;
  link?: string;
  description?: string;
  pubDate?: string;
  author?: string;
  source?: string;
}

/**
 * Simple RSS XML parser (no external deps — works in Workers).
 */
function parseRssItems(xml: string): RssItem[] {
  const items: RssItem[] = [];
  const itemMatches = xml.match(/<item[\s>][\s\S]*?<\/item>/gi);
  if (!itemMatches) return items;

  for (const itemXml of itemMatches) {
    items.push({
      title: extractTag(itemXml, "title"),
      link: extractTag(itemXml, "link"),
      description: stripHtml(extractTag(itemXml, "description") ?? ""),
      pubDate: extractTag(itemXml, "pubDate"),
      author: extractTag(itemXml, "author") ?? extractTag(itemXml, "dc:creator"),
      source: extractTag(itemXml, "source"),
    });
  }

  return items;
}

/**
 * Simple Atom XML parser for YouTube feeds.
 */
function parseAtomItems(xml: string): RssItem[] {
  const items: RssItem[] = [];
  const entryMatches = xml.match(/<entry[\s>][\s\S]*?<\/entry>/gi);
  if (!entryMatches) return items;

  for (const entryXml of entryMatches) {
    const linkMatch = entryXml.match(/<link[^>]+href="([^"]*)"[^>]*\/>/i);
    const authorMatch = entryXml.match(/<author>\s*<name>([^<]*)<\/name>/i);

    items.push({
      title: extractTag(entryXml, "title"),
      link: linkMatch?.[1] ?? undefined,
      description: extractTag(entryXml, "media:description") ?? extractTag(entryXml, "summary"),
      pubDate: extractTag(entryXml, "published") ?? extractTag(entryXml, "updated"),
      author: authorMatch?.[1] ?? undefined,
    });
  }

  return items;
}

function extractTag(xml: string, tag: string): string | undefined {
  // Handle CDATA
  const cdataPattern = new RegExp(`<${tag}[^>]*>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*<\\/${tag}>`, "i");
  const cdataMatch = xml.match(cdataPattern);
  if (cdataMatch?.[1]) return cdataMatch[1].trim();

  // Handle regular content
  const pattern = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  const match = xml.match(pattern);
  return match?.[1]?.trim() ?? undefined;
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function deduplicateByUrl(items: RawSignalContent[]): RawSignalContent[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (!item.url) return true; // Keep items without URLs
    if (seen.has(item.url)) return false;
    seen.add(item.url);
    return true;
  });
}
