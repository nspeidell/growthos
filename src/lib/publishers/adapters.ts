/**
 * Platform Publishing Adapters
 *
 * Each adapter handles the specifics of publishing content to its platform.
 * Returns the platform post ID and URL on success.
 */

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
    default:
      throw new Error(`Unsupported platform: ${platform}`);
  }
}

// ─── Instagram (via Graph API) ───

async function publishToInstagram(
  payload: PublishPayload
): Promise<PublishResult> {
  const { body, accessToken, metadata } = payload;
  const imageUrl = metadata?.imageUrl as string | undefined;

  // Get pages to find Instagram account
  const pagesRes = await fetch(
    `https://graph.facebook.com/v21.0/me/accounts?access_token=${accessToken}`
  );
  const pages = await pagesRes.json() as { data: Array<{ id: string; access_token: string }> };
  const page = pages.data?.[0];

  if (!page) throw new Error("No Facebook Page found for Instagram publishing");

  // Get Instagram business account ID
  const igRes = await fetch(
    `https://graph.facebook.com/v21.0/${page.id}?fields=instagram_business_account&access_token=${page.access_token}`
  );
  const igData = await igRes.json() as { instagram_business_account?: { id: string } };

  if (!igData.instagram_business_account) {
    throw new Error("No Instagram Business account linked");
  }

  const igId = igData.instagram_business_account.id;

  if (imageUrl) {
    // Image post: create media container, then publish
    const containerRes = await fetch(
      `https://graph.facebook.com/v21.0/${igId}/media`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image_url: imageUrl,
          caption: body,
          access_token: page.access_token,
        }),
      }
    );
    const container = await containerRes.json() as { id: string };

    const publishRes = await fetch(
      `https://graph.facebook.com/v21.0/${igId}/media_publish`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          creation_id: container.id,
          access_token: page.access_token,
        }),
      }
    );
    const published = await publishRes.json() as { id: string };

    return {
      platformPostId: published.id,
      platformPostUrl: `https://www.instagram.com/p/${published.id}/`,
    };
  }

  // Text-only not supported on Instagram — require an image
  throw new Error("Instagram requires an image — attach media to this content");
}

// ─── Facebook (Page Posts via Graph API) ───

async function publishToFacebook(
  payload: PublishPayload
): Promise<PublishResult> {
  const { body, accessToken } = payload;

  // Get managed pages
  const pagesRes = await fetch(
    `https://graph.facebook.com/v21.0/me/accounts?access_token=${accessToken}`
  );
  const pages = await pagesRes.json() as { data: Array<{ id: string; access_token: string }> };
  const page = pages.data?.[0];

  if (!page) throw new Error("No Facebook Page found");

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

async function publishToX(payload: PublishPayload): Promise<PublishResult> {
  const { body, accessToken } = payload;

  const res = await fetch("https://api.x.com/2/tweets", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ text: body }),
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
