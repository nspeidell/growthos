/**
 * Social Platform OAuth Configuration
 *
 * Manages OAuth flows for connecting social media accounts.
 * Each platform has its own auth URL, token endpoint, and scopes.
 * Tokens are encrypted via AES-256-GCM before D1 storage.
 */

import { createId } from "@paralleldrive/cuid2";
import { encrypt, decrypt } from "@/lib/utils/crypto";
import { kvSet, kvGet, kvDelete } from "@/lib/cloudflare/kv";

// ─── Platform OAuth Configs ───

export interface PlatformOAuthConfig {
  platform: string;
  authUrl: string;
  tokenUrl: string;
  scopes: string[];
  clientIdEnvKey: string;
  clientSecretEnvKey: string;
}

export const PLATFORM_OAUTH_CONFIGS: Record<string, PlatformOAuthConfig> = {
  instagram: {
    platform: "instagram",
    // Instagram Business Login (2024+) uses instagram.com OAuth, not facebook.com
    authUrl: "https://www.instagram.com/oauth/authorize",
    tokenUrl: "https://api.instagram.com/oauth/access_token",
    scopes: [
      "instagram_business_basic",
      "instagram_manage_comments",
      "instagram_business_manage_messages",
    ],
    clientIdEnvKey: "INSTAGRAM_APP_ID",
    clientSecretEnvKey: "INSTAGRAM_APP_SECRET",
  },
  facebook: {
    platform: "facebook",
    authUrl: "https://www.facebook.com/v21.0/dialog/oauth",
    tokenUrl: "https://graph.facebook.com/v21.0/oauth/access_token",
    scopes: [
      "public_profile",
      "pages_show_list",
      "pages_manage_posts",
      "pages_read_engagement",
    ],
    clientIdEnvKey: "META_APP_ID",
    clientSecretEnvKey: "META_APP_SECRET",
  },
  youtube: {
    platform: "youtube",
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    scopes: [
      "https://www.googleapis.com/auth/youtube.upload",
      "https://www.googleapis.com/auth/youtube.readonly",
      "https://www.googleapis.com/auth/yt-analytics.readonly",
    ],
    clientIdEnvKey: "GOOGLE_CLIENT_ID",
    clientSecretEnvKey: "GOOGLE_CLIENT_SECRET",
  },
  x: {
    platform: "x",
    authUrl: "https://twitter.com/i/oauth2/authorize",
    tokenUrl: "https://api.x.com/2/oauth2/token",
    scopes: [
      "tweet.read",
      "tweet.write",
      "users.read",
      "offline.access",
    ],
    clientIdEnvKey: "X_CLIENT_ID",
    clientSecretEnvKey: "X_CLIENT_SECRET",
  },
  reddit: {
    platform: "reddit",
    authUrl: "https://www.reddit.com/api/v1/authorize",
    tokenUrl: "https://www.reddit.com/api/v1/access_token",
    scopes: ["identity", "submit", "read"],
    clientIdEnvKey: "REDDIT_CLIENT_ID",
    clientSecretEnvKey: "REDDIT_CLIENT_SECRET",
  },
  pinterest: {
    platform: "pinterest",
    authUrl: "https://www.pinterest.com/oauth/",
    tokenUrl: "https://api.pinterest.com/v5/oauth/token",
    scopes: [
      "boards:read",
      "pins:read",
      "pins:write",
      "user_accounts:read",
    ],
    clientIdEnvKey: "PINTEREST_CLIENT_ID",
    clientSecretEnvKey: "PINTEREST_CLIENT_SECRET",
  },
  linkedin: {
    platform: "linkedin",
    authUrl: "https://www.linkedin.com/oauth/v2/authorization",
    tokenUrl: "https://www.linkedin.com/oauth/v2/accessToken",
    scopes: [
      "openid",
      "profile",
      "w_member_social",
    ],
    clientIdEnvKey: "LINKEDIN_CLIENT_ID",
    clientSecretEnvKey: "LINKEDIN_CLIENT_SECRET",
  },
  tiktok: {
    platform: "tiktok",
    authUrl: "https://www.tiktok.com/v2/auth/authorize/",
    tokenUrl: "https://open.tiktokapis.com/v2/oauth/token/",
    scopes: [
      "user.info.basic",
      "video.publish",
      "video.upload",
    ],
    clientIdEnvKey: "TIKTOK_CLIENT_ID",
    clientSecretEnvKey: "TIKTOK_CLIENT_SECRET",
  },
  google_business: {
    platform: "google_business",
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    scopes: [
      "https://www.googleapis.com/auth/business.manage",
    ],
    clientIdEnvKey: "GOOGLE_CLIENT_ID",
    clientSecretEnvKey: "GOOGLE_CLIENT_SECRET",
  },
  threads: {
    platform: "threads",
    authUrl: "https://threads.net/oauth/authorize",
    tokenUrl: "https://graph.threads.net/oauth/access_token",
    scopes: [
      "threads_basic",
      "threads_content_publish",
      "threads_manage_insights",
    ],
    clientIdEnvKey: "META_APP_ID",
    clientSecretEnvKey: "META_APP_SECRET",
  },
  wordpress: {
    platform: "wordpress",
    authUrl: "https://public-api.wordpress.com/oauth2/authorize",
    tokenUrl: "https://public-api.wordpress.com/oauth2/token",
    scopes: ["global"],
    clientIdEnvKey: "WORDPRESS_CLIENT_ID",
    clientSecretEnvKey: "WORDPRESS_CLIENT_SECRET",
  },
  medium: {
    platform: "medium",
    authUrl: "https://medium.com/m/oauth/authorize",
    tokenUrl: "https://api.medium.com/v1/tokens",
    scopes: ["basicProfile", "publishPost"],
    clientIdEnvKey: "MEDIUM_CLIENT_ID",
    clientSecretEnvKey: "MEDIUM_CLIENT_SECRET",
  },
  ghost: {
    platform: "ghost",
    authUrl: "", // Ghost uses Admin API keys, not OAuth — handled separately
    tokenUrl: "",
    scopes: [],
    clientIdEnvKey: "GHOST_API_URL",
    clientSecretEnvKey: "GHOST_ADMIN_API_KEY",
  },
  substack: {
    platform: "substack",
    authUrl: "", // Substack has no public API — uses email/API integration
    tokenUrl: "",
    scopes: [],
    clientIdEnvKey: "SUBSTACK_EMAIL",
    clientSecretEnvKey: "SUBSTACK_API_KEY",
  },
};

// ─── OAuth State Management (KV) ───

interface OAuthState {
  platform: string;
  workspaceId: string;
  userId: string;
  codeVerifier?: string;
  returnUrl: string;
}

const OAUTH_STATE_PREFIX = "social_oauth_state:";
const OAUTH_STATE_TTL = 60 * 10; // 10 minutes

export async function createOAuthState(data: OAuthState): Promise<string> {
  const stateId = createId();
  await kvSet(`${OAUTH_STATE_PREFIX}${stateId}`, data, OAUTH_STATE_TTL);
  return stateId;
}

export async function getOAuthState(
  stateId: string
): Promise<OAuthState | null> {
  return kvGet<OAuthState>(`${OAUTH_STATE_PREFIX}${stateId}`);
}

export async function deleteOAuthState(stateId: string): Promise<void> {
  await kvDelete(`${OAUTH_STATE_PREFIX}${stateId}`);
}

// ─── Build Authorization URL ───

export function buildAuthUrl(
  config: PlatformOAuthConfig,
  state: string,
  redirectUri: string,
  codeChallenge?: string
): string {
  const params = new URLSearchParams({
    client_id: "", // filled at runtime from env
    redirect_uri: redirectUri,
    response_type: "code",
    scope: config.scopes.join(" "),
    state,
  });

  // PKCE support (X/Twitter uses it)
  if (codeChallenge) {
    params.set("code_challenge", codeChallenge);
    params.set("code_challenge_method", "S256");
  }

  // Reddit requires duration=permanent for refresh tokens
  if (config.platform === "reddit") {
    params.set("duration", "permanent");
  }

  return `${config.authUrl}?${params.toString()}`;
}

// ─── Token Exchange ───

export interface TokenResponse {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
  scope?: string;
}

export async function exchangeCodeForTokens(
  config: PlatformOAuthConfig,
  code: string,
  redirectUri: string,
  clientId: string,
  clientSecret: string,
  codeVerifier?: string
): Promise<TokenResponse> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    client_id: clientId,
    client_secret: clientSecret,
  });

  if (codeVerifier) {
    body.set("code_verifier", codeVerifier);
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
  };

  // X (Twitter) and Reddit and Pinterest use Basic auth (confidential clients)
  // X OAuth 2.0 is a confidential client — credentials go in the Authorization header
  if (config.platform === "x" || config.platform === "reddit" || config.platform === "pinterest") {
    headers["Authorization"] =
      "Basic " + btoa(`${clientId}:${clientSecret}`);
    body.delete("client_id");
    body.delete("client_secret");
  }

  const response = await fetch(config.tokenUrl, {
    method: "POST",
    headers,
    body,
  });

  if (!response.ok) {
    const errorText = await response.text();
    const diag = [
      `redirect_uri=${redirectUri}`,
      `code_verifier_present=${!!codeVerifier}`,
      `body_keys=${[...body.keys()].join(",")}`,
      `auth_header_present=${!!headers["Authorization"]}`,
      `client_id_length=${clientId.length}`,
      `client_secret_length=${clientSecret.length}`,
    ].join(" | ");
    throw new Error(
      `Token exchange failed for ${config.platform}: ${response.status} ${errorText} | DIAG: ${diag}`
    );
  }

  const data = await response.json() as Record<string, unknown>;

  return {
    accessToken: data.access_token as string,
    refreshToken: data.refresh_token as string | undefined,
    expiresIn: data.expires_in as number | undefined,
    scope: data.scope as string | undefined,
  };
}

// ─── Token Refresh ───

export async function refreshAccessToken(
  config: PlatformOAuthConfig,
  refreshToken: string,
  clientId: string,
  clientSecret: string
): Promise<TokenResponse> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
  });

  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
  };

  if (config.platform === "reddit" || config.platform === "x") {
    headers["Authorization"] =
      "Basic " + btoa(`${clientId}:${clientSecret}`);
    body.delete("client_id");
    body.delete("client_secret");
  }

  const response = await fetch(config.tokenUrl, {
    method: "POST",
    headers,
    body,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(
      `Token refresh failed for ${config.platform}: ${response.status} ${error}`
    );
  }

  const data = await response.json() as Record<string, unknown>;

  return {
    accessToken: data.access_token as string,
    refreshToken: data.refresh_token as string | undefined,
    expiresIn: data.expires_in as number | undefined,
  };
}

// ─── Token Encryption Helpers ───

export async function encryptToken(
  token: string,
  encryptionKey: string
): Promise<string> {
  return encrypt(token, encryptionKey);
}

export async function decryptToken(
  encryptedToken: string,
  encryptionKey: string
): Promise<string> {
  return decrypt(encryptedToken, encryptionKey);
}

// ─── Platform Profile Fetchers ───

export interface PlatformProfile {
  platformAccountId: string;
  username: string;
  avatarUrl?: string;
}

export async function fetchPlatformProfile(
  platform: string,
  accessToken: string
): Promise<PlatformProfile> {
  switch (platform) {
    case "instagram":
      return fetchInstagramProfile(accessToken);
    case "facebook":
      return fetchFacebookProfile(accessToken);
    case "youtube":
      return fetchYouTubeProfile(accessToken);
    case "x":
      return fetchXProfile(accessToken);
    case "reddit":
      return fetchRedditProfile(accessToken);
    case "pinterest":
      return fetchPinterestProfile(accessToken);
    case "linkedin":
      return fetchLinkedInProfile(accessToken);
    case "tiktok":
      return fetchTikTokProfile(accessToken);
    case "google_business":
      return fetchGoogleBusinessProfile(accessToken);
    case "threads":
      return fetchThreadsProfile(accessToken);
    case "wordpress":
      return fetchWordPressProfile(accessToken);
    case "medium":
      return fetchMediumProfile(accessToken);
    case "ghost":
      return fetchGhostProfile(accessToken);
    case "substack":
      return fetchSubstackProfile(accessToken);
    default:
      throw new Error(`Unknown platform: ${platform}`);
  }
}

async function fetchInstagramProfile(
  accessToken: string
): Promise<PlatformProfile> {
  // Instagram Business Login (2024+): token is scoped to the IG account directly
  const profileRes = await fetch(
    `https://graph.instagram.com/v21.0/me?fields=id,username,profile_picture_url&access_token=${accessToken}`
  );
  const profile = await profileRes.json() as {
    id?: string;
    username?: string;
    profile_picture_url?: string;
  };

  if (!profile.id) throw new Error("Failed to fetch Instagram profile");

  return {
    platformAccountId: profile.id,
    username: profile.username ?? "instagram_user",
    avatarUrl: profile.profile_picture_url,
  };
}

async function fetchFacebookProfile(
  accessToken: string
): Promise<PlatformProfile> {
  const res = await fetch(
    `https://graph.facebook.com/v21.0/me?fields=id,name,picture&access_token=${accessToken}`
  );
  const data = await res.json() as {
    id: string;
    name: string;
    picture?: { data?: { url?: string } };
  };

  return {
    platformAccountId: data.id,
    username: data.name,
    avatarUrl: data.picture?.data?.url,
  };
}

async function fetchYouTubeProfile(
  accessToken: string
): Promise<PlatformProfile> {
  const res = await fetch(
    "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true",
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const data = await res.json() as {
    items?: Array<{
      id: string;
      snippet?: { title?: string; thumbnails?: { default?: { url?: string } } };
    }>;
  };

  const channel = data.items?.[0];
  if (!channel) throw new Error("No YouTube channel found");

  return {
    platformAccountId: channel.id,
    username: channel.snippet?.title ?? "youtube_user",
    avatarUrl: channel.snippet?.thumbnails?.default?.url,
  };
}

async function fetchXProfile(
  accessToken: string
): Promise<PlatformProfile> {
  const res = await fetch("https://api.x.com/2/users/me?user.fields=profile_image_url", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await res.json() as {
    data?: { id: string; username: string; profile_image_url?: string };
  };

  if (!data.data) throw new Error("Failed to fetch X profile");

  return {
    platformAccountId: data.data.id,
    username: data.data.username,
    avatarUrl: data.data.profile_image_url,
  };
}

async function fetchRedditProfile(
  accessToken: string
): Promise<PlatformProfile> {
  const res = await fetch("https://oauth.reddit.com/api/v1/me", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "User-Agent": "GrowthOS/1.0",
    },
  });
  const data = await res.json() as {
    id: string;
    name: string;
    icon_img?: string;
  };

  return {
    platformAccountId: data.id,
    username: data.name,
    avatarUrl: data.icon_img,
  };
}

async function fetchPinterestProfile(
  accessToken: string
): Promise<PlatformProfile> {
  const res = await fetch("https://api.pinterest.com/v5/user_account", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await res.json() as {
    username?: string;
    profile_image?: string;
  };

  return {
    platformAccountId: data.username ?? "pinterest_user",
    username: data.username ?? "pinterest_user",
    avatarUrl: data.profile_image,
  };
}

async function fetchLinkedInProfile(
  accessToken: string
): Promise<PlatformProfile> {
  const res = await fetch("https://api.linkedin.com/v2/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await res.json() as {
    sub: string;
    name: string;
    picture?: string;
  };

  return {
    platformAccountId: data.sub,
    username: data.name,
    avatarUrl: data.picture,
  };
}

async function fetchTikTokProfile(
  accessToken: string
): Promise<PlatformProfile> {
  const res = await fetch(
    "https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name,avatar_url",
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const data = await res.json() as {
    data?: { user?: { open_id: string; display_name: string; avatar_url?: string } };
  };

  if (!data.data?.user) throw new Error("Failed to fetch TikTok profile");

  return {
    platformAccountId: data.data.user.open_id,
    username: data.data.user.display_name,
    avatarUrl: data.data.user.avatar_url,
  };
}

async function fetchGoogleBusinessProfile(
  accessToken: string
): Promise<PlatformProfile> {
  const res = await fetch(
    "https://mybusinessaccountmanagement.googleapis.com/v1/accounts",
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const data = await res.json() as {
    accounts?: Array<{ name: string; accountName: string }>;
  };

  const account = data.accounts?.[0];
  if (!account) throw new Error("No Google Business Profile found");

  return {
    platformAccountId: account.name,
    username: account.accountName,
  };
}

async function fetchThreadsProfile(
  accessToken: string
): Promise<PlatformProfile> {
  const res = await fetch(
    `https://graph.threads.net/v1.0/me?fields=id,username,threads_profile_picture_url&access_token=${accessToken}`
  );
  const data = await res.json() as {
    id: string;
    username: string;
    threads_profile_picture_url?: string;
  };

  return {
    platformAccountId: data.id,
    username: data.username ?? "threads_user",
    avatarUrl: data.threads_profile_picture_url,
  };
}

async function fetchWordPressProfile(
  accessToken: string
): Promise<PlatformProfile> {
  const res = await fetch("https://public-api.wordpress.com/rest/v1.1/me", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await res.json() as {
    ID: number;
    display_name: string;
    avatar_URL?: string;
  };

  return {
    platformAccountId: String(data.ID),
    username: data.display_name,
    avatarUrl: data.avatar_URL,
  };
}

async function fetchMediumProfile(
  accessToken: string
): Promise<PlatformProfile> {
  const res = await fetch("https://api.medium.com/v1/me", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
  });
  const data = await res.json() as {
    data?: { id: string; username: string; imageUrl?: string };
  };

  if (!data.data) throw new Error("Failed to fetch Medium profile");

  return {
    platformAccountId: data.data.id,
    username: data.data.username,
    avatarUrl: data.data.imageUrl,
  };
}

async function fetchGhostProfile(
  accessToken: string
): Promise<PlatformProfile> {
  // Ghost uses Admin API keys — accessToken here is the JWT built from the key
  // The "clientId" env var holds the Ghost site URL
  // For now, return a placeholder profile; actual Ghost integration
  // will use the Admin API key to sign JWTs at publish time
  return {
    platformAccountId: "ghost_site",
    username: "Ghost Blog",
  };
}

async function fetchSubstackProfile(
  accessToken: string
): Promise<PlatformProfile> {
  // Substack has no public API — integration works via email-based publishing
  // The credentials store the Substack publication email for posting
  return {
    platformAccountId: "substack_pub",
    username: "Substack Newsletter",
  };
}
