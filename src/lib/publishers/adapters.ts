/**
 * Platform Publishing Adapters
 *
 * Each adapter handles the specifics of publishing content to its platform.
 * Returns the platform post ID and URL on success.
 */

import { PinterestClient } from "./pinterest";

export interface PublishResult {
  platformPostId: string;
  platformPostUrl: string;
}

export interface PublishPayload {
  body: string;
  accessToken: string;
  metadata?: Record<string, unknown>;
}

/**
 * Route to the correct platform adapter.
 */
export async function publishToplatform(
  platform: string,
  payload: PublishPayload
): Promise<PublishResult> {
  switch (platform) {
    case "instagram":
      return publishToInstagram(payload);
    case "facebook":
      return publishToFacebook(payload);
    case "youtube":
      return publishToYouTube(payload);
    case "x":
      return publishToX(payload);
    case "reddit":
      return publishToReddit(payload);
    case "threads":
      return publishToThreads(payload);
    case "linkedin":
      return publishToLinkedIn(payload);
    case "pinterest":
      return publishToPinterest(payload);
    default:
      throw new Error(`Unsupported platform: ${platform}`);
  }
}

// ─── Instagram (via Instagram Business Login — graph.instagram.com) ───

async function publishToInstagram(
  payload: PublishPayload
): Promise<PublishResult> {
  const { body, accessToken, metadata } = payload;
  const imageUrl = metadata?.imageUrl as string | undefined;
  // Stored during OAuth connect via Instagram Business Login (graph.instagram.com/me)
  const igUserId = metadata?._platformAccountId as string | undefined;

  if (!igUserId) {
    throw new Error(
      "Instagram publish requires platform_account_id — reconnect the Instagram account"
    );
  }

  if (!imageUrl) {
    throw new Error(
      "Instagram requires an image — attach media to this content"
    );
  }

  // Step 1: Create media container (Instagram Business Login uses graph.instagram.com)
  const containerRes = await fetch(
    `https://graph.instagram.com/v21.0/${igUserId}/media`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        image_url: imageUrl,
        caption: body,
        access_token: accessToken,
      }),
    }
  );

  if (!containerRes.ok) {
    const err = await containerRes.text();
    throw new Error(
      `Instagram media container creation failed (${containerRes.status}): ${err}`
    );
  }

  const container = await containerRes.json() as { id?: string; error?: { message: string } };
  if (!container.id) {
    throw new Error(
      `Instagram container missing id: ${JSON.stringify(container)}`
    );
  }

  // Step 2: Publish the container
  const publishRes = await fetch(
    `https://graph.instagram.com/v21.0/${igUserId}/media_publish`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        creation_id: container.id,
        access_token: accessToken,
      }),
    }
  );

  if (!publishRes.ok) {
    const err = await publishRes.text();
    throw new Error(`Instagram publish failed (${publishRes.status}): ${err}`);
  }

  const published = await publishRes.json() as { id?: string };

  return {
    platformPostId: published.id ?? container.id,
    platformPostUrl: `https://www.instagram.com/p/${published.id ?? container.id}/`,
  };
}

// ─── Facebook (Page Posts via Graph API) ───

async function publishToFacebook(
  payload: PublishPayload
): Promise<PublishResult> {
  const { body, accessToken, metadata } = payload;

  // Get managed pages via /me/accounts
  const pagesRes = await fetch(
    `https://graph.facebook.com/v21.0/me/accounts?fields=id,name,access_token&access_token=${accessToken}`
  );
  const pagesBody = await pagesRes.text();
  let pages: { data?: Array<{ id: string; name: string; access_token: string }>; error?: { message: string; code: number } };
  try { pages = JSON.parse(pagesBody); } catch { pages = {}; }

  if (pages.error) {
    throw new Error(`Facebook Pages API error: ${pages.error.message} (code ${pages.error.code}) — check that pages_show_list permission was granted`);
  }

  let page = pages.data?.[0];

  // Fallback for New Pages Experience: /me/accounts returns empty for NPE pages.
  // Try fetching the page token directly using the stored platform_account_id.
  if (!page && metadata?._platformAccountId) {
    const pageId = metadata._platformAccountId as string;
    const directRes = await fetch(
      `https://graph.facebook.com/v21.0/${pageId}?fields=id,name,access_token&access_token=${accessToken}`
    );
    const directData = await directRes.json() as {
      id?: string;
      name?: string;
      access_token?: string;
      error?: { message: string; code: number };
    };
    if (directData.access_token) {
      page = { id: directData.id!, name: directData.name ?? pageId, access_token: directData.access_token };
    } else if (directData.error) {
      throw new Error(
        `Facebook Page direct access failed for page ${pageId}: ${directData.error.message} (code ${directData.error.code})`
      );
    }
  }

  if (!page) {
    throw new Error(
      `No Facebook Page found — /me/accounts returned empty and no fallback page ID is configured. Raw: ${pagesBody.substring(0, 300)}`
    );
  }

  const res = await fetch(
    `https://graph.facebook.com/v21.0/${page.id}/feed`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: body,
        access_token: page.access_token,
      }),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Facebook publish failed: ${err}`);
  }

  const data = await res.json() as { id: string };

  return {
    platformPostId: data.id,
    platformPostUrl: `https://www.facebook.com/${data.id}`,
  };
}

// ─── YouTube (Community Posts — text only; video uploads need separate flow) ───

async function publishToYouTube(
  payload: PublishPayload
): Promise<PublishResult> {
  // YouTube Data API v3 doesn't support community posts via API.
  // Video uploads require multipart upload with resumable protocol.
  // For Phase 3, we support text-based community posts via an alternative approach,
  // or throw an informative error for video content.

  throw new Error(
    "YouTube publishing requires video upload — use the YouTube Studio for now. " +
    "Video upload API integration coming in a future update."
  );
}

// ─── X / Twitter (v2 API) ───

/**
 * Extract the first publishable tweet from AI-generated content.
 *
 * The AI often generates a full thread as one body. For X we post only
 * the first tweet (hook) to stay within the 280-character limit.
 * Strategy:
 *   1. If content fits in 280 chars, post as-is.
 *   2. If it looks like a numbered thread (1/N, **1/N**, etc.), extract tweet 1.
 *   3. Otherwise, take the first paragraph that fits.
 *   4. Hard-truncate to 277 chars + "…" as a last resort.
 */
function extractFirstTweet(body: string): string {
  const MAX = 280;
  const cleaned = body.replace(/\*\*/g, "").trim();
  if (cleaned.length <= MAX) return cleaned;

  // Match numbered thread patterns: "1/N ...", "Tweet 1: ..."
  const threadMatch = cleaned.match(/^(?:tweet\s*)?1\/\d+[:\s]*([\s\S]*?)(?=\n\s*\n|\n(?:tweet\s*)?\d+\/\d+|$)/im);
  if (threadMatch) {
    const tweet = threadMatch[1]?.trim() ?? "";
    if (tweet.length > 0 && tweet.length <= MAX) return tweet;
    if (tweet.length > MAX) return tweet.substring(0, 277) + "…";
  }

  // Take the first non-empty paragraph
  const paragraphs = cleaned.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  for (const para of paragraphs) {
    return para.length <= MAX ? para : para.substring(0, 277) + "…";
  }

  return cleaned.substring(0, 277) + "…";
}

async function publishToX(payload: PublishPayload): Promise<PublishResult> {
  const { body, accessToken } = payload;

  const tweetText = extractFirstTweet(body);

  const res = await fetch("https://api.x.com/2/tweets", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ text: tweetText }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`X publish failed: ${err}`);
  }

  const data = await res.json() as { data: { id: string } };

  // Need to get the username for the URL
  const userRes = await fetch("https://api.x.com/2/users/me", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const userData = await userRes.json() as { data: { username: string } };

  return {
    platformPostId: data.data.id,
    platformPostUrl: `https://x.com/${userData.data.username}/status/${data.data.id}`,
  };
}

// ─── Reddit ───

async function publishToReddit(
  payload: PublishPayload
): Promise<PublishResult> {
  const { body, accessToken, metadata } = payload;
  const subreddit = (metadata?.subreddit as string) ?? "test";
  const title = (metadata?.title as string) ?? body.substring(0, 200);

  const res = await fetch("https://oauth.reddit.com/api/submit", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "GrowthOS/1.0",
    },
    body: new URLSearchParams({
      kind: "self",
      sr: subreddit,
      title,
      text: body,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Reddit publish failed: ${err}`);
  }

  const data = await res.json() as {
    json: { data: { id: string; url: string; name: string } };
  };

  return {
    platformPostId: data.json.data.name,
    platformPostUrl: data.json.data.url,
  };
}

// ─── Threads ───

async function publishToThreads(payload: PublishPayload): Promise<PublishResult> {
  const { body, accessToken, metadata } = payload;
  const userId = (metadata?._platformAccountId as string | undefined);

  if (!userId) {
    throw new Error("Threads publish requires platform_account_id — reconnect the Threads account");
  }

  // Step 1: Create a text-only media container
  const containerRes = await fetch(
    `https://graph.threads.net/v1.0/${userId}/threads`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        media_type: "TEXT",
        text: body.substring(0, 500), // Threads limit
        access_token: accessToken,
      }),
    }
  );

  if (!containerRes.ok) {
    const err = await containerRes.text();
    throw new Error(`Threads container creation failed (${containerRes.status}): ${err}`);
  }

  const container = await containerRes.json() as { id?: string; error?: { message: string } };
  if (!container.id) {
    throw new Error(`Threads container missing id: ${JSON.stringify(container)}`);
  }

  // Step 2: Publish the container
  const publishRes = await fetch(
    `https://graph.threads.net/v1.0/${userId}/threads_publish`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        creation_id: container.id,
        access_token: accessToken,
      }),
    }
  );

  if (!publishRes.ok) {
    const err = await publishRes.text();
    throw new Error(`Threads publish failed (${publishRes.status}): ${err}`);
  }

  const published = await publishRes.json() as { id?: string };

  return {
    platformPostId: published.id ?? container.id,
    platformPostUrl: `https://www.threads.net/t/${published.id ?? container.id}`,
  };
}

// ─── Pinterest ───

/**
 * Publish a Pin to Pinterest.
 *
 * Required metadata fields (set in scheduled_posts.metadata JSON):
 *   - boardId:   Pinterest Board ID to pin to (get from listBoards)
 *   - imageUrl:  Publicly accessible image URL for the pin
 *
 * Optional metadata fields:
 *   - title:     Pin title (falls back to first 100 chars of body)
 *   - link:      Destination URL when user clicks pin
 *   - altText:   Image alt text for accessibility
 *   - boardSectionId: Board section to file pin under
 *   - hashtags:  Array of hashtag strings appended to description
 */
async function publishToPinterest(payload: PublishPayload): Promise<PublishResult> {
  const { body, accessToken, metadata } = payload;

  const boardId = metadata?.boardId as string | undefined;
  const imageUrl = metadata?.imageUrl as string | undefined;

  if (!boardId) {
    throw new Error(
      "Pinterest publish requires a boardId in metadata. " +
      "Set it when scheduling the post, or connect a default board in Pinterest settings."
    );
  }

  if (!imageUrl) {
    throw new Error(
      "Pinterest requires an image URL — attach media to this content before scheduling."
    );
  }

  const title = (metadata?.title as string | undefined) ?? body.substring(0, 100);
  const link = metadata?.link as string | undefined;
  const altText = metadata?.altText as string | undefined;
  const boardSectionId = metadata?.boardSectionId as string | undefined;
  const hashtags = (metadata?.hashtags as string[] | undefined) ?? [];

  const description = PinterestClient.formatDescription(body, hashtags);

  const client = new PinterestClient(accessToken);

  const pin = await client.createPin({
    boardId,
    title,
    description,
    imageUrl,
    link,
    altText,
    boardSectionId,
  });

  return {
    platformPostId: pin.id,
    platformPostUrl: `https://www.pinterest.com/pin/${pin.id}/`,
  };
}

// ─── LinkedIn ───

async function publishToLinkedIn(payload: PublishPayload): Promise<PublishResult> {
  const { body, accessToken, metadata } = payload;
  const personId = (metadata?._platformAccountId as string | undefined);

  if (!personId) {
    throw new Error("LinkedIn publish requires platform_account_id — reconnect the LinkedIn account");
  }

  const authorUrn = `urn:li:person:${personId}`;

  const res = await fetch("https://api.linkedin.com/v2/ugcPosts", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "X-Restli-Protocol-Version": "2.0.0",
    },
    body: JSON.stringify({
      author: authorUrn,
      lifecycleState: "PUBLISHED",
      specificContent: {
        "com.linkedin.ugc.ShareContent": {
          shareCommentary: { text: body.substring(0, 3000) },
          shareMediaCategory: "NONE",
        },
      },
      visibility: {
        "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC",
      },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`LinkedIn publish failed (${res.status}): ${err}`);
  }

  const postId = res.headers.get("x-restli-id") ?? "unknown";

  return {
    platformPostId: postId,
    platformPostUrl: `https://www.linkedin.com/feed/update/${postId}/`,
  };
}
