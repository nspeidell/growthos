/**
 * GET /api/social/callback/[platform]
 *
 * OAuth callback for social platform connections.
 * Exchanges auth code for tokens, encrypts them, stores in D1.
 */

import { NextRequest, NextResponse } from "next/server";
import { createId } from "@paralleldrive/cuid2";
import { getBindings } from "@/lib/cloudflare/bindings";
import { createDb } from "@/lib/db/client";
import { connectedAccounts } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import {
  PLATFORM_OAUTH_CONFIGS,
  getOAuthState,
  deleteOAuthState,
  exchangeCodeForTokens,
  upgradeInstagramToken,
  encryptToken,
  fetchPlatformProfile,
} from "@/lib/auth/social-oauth";
import { kvSet } from "@/lib/cloudflare/kv";

export const runtime = "edge";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ platform: string }> }
) {
  const { platform } = await params;
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  // Handle platform-side errors
  if (error) {
    const errorDesc =
      searchParams.get("error_description") ?? "Unknown error";
    return NextResponse.redirect(
      new URL(
        `/dashboard/settings?error=${encodeURIComponent(errorDesc)}`,
        request.url
      )
    );
  }

  if (!code || !state) {
    return NextResponse.redirect(
      new URL("/dashboard/settings?error=Missing+code+or+state", request.url)
    );
  }

  // Validate config
  const config = PLATFORM_OAUTH_CONFIGS[platform];
  if (!config) {
    return NextResponse.redirect(
      new URL(`/dashboard/settings?error=Unknown+platform:+${platform}`, request.url)
    );
  }

  // Retrieve and validate state from KV
  const oauthState = await getOAuthState(state);
  if (!oauthState || oauthState.platform !== platform) {
    return NextResponse.redirect(
      new URL("/dashboard/settings?error=Invalid+or+expired+state", request.url)
    );
  }

  // Clean up state
  await deleteOAuthState(state);

  const env = getBindings();
  const clientId = (env as unknown as Record<string, string>)[
    config.clientIdEnvKey
  ];
  const clientSecret = (env as unknown as Record<string, string>)[
    config.clientSecretEnvKey
  ];

  if (!clientId || !clientSecret) {
    return NextResponse.redirect(
      new URL(
        `/dashboard/settings?error=Missing+OAuth+credentials+for+${platform}`,
        request.url
      )
    );
  }

  try {
    const redirectUri = `${env.APP_URL}/api/social/callback/${platform}`;

    // Exchange code for tokens
    let tokens = await exchangeCodeForTokens(
      config,
      code,
      redirectUri,
      clientId,
      clientSecret,
      oauthState.codeVerifier
    );

    // DEBUG: log raw token info for Instagram diagnostics
    if (platform === "instagram") {
      await kvSet("oauth_token_debug", {
        tokenPrefix: tokens.accessToken?.slice(0, 40),
        tokenLength: tokens.accessToken?.length,
        expiresIn: tokens.expiresIn,
        scope: tokens.scope,
        userId: tokens.userId,
      }, 3600);
      // IGAA tokens from Instagram Business Login are already valid — no upgrade needed
    }

    // Fetch platform profile
    const profile = await fetchPlatformProfile(platform, tokens.accessToken, tokens.userId);

    // Encrypt tokens
    const accessTokenEncrypted = await encryptToken(
      tokens.accessToken,
      env.ENCRYPTION_KEY
    );
    const refreshTokenEncrypted = tokens.refreshToken
      ? await encryptToken(tokens.refreshToken, env.ENCRYPTION_KEY)
      : null;

    // Calculate token expiry
    const tokenExpiresAt = tokens.expiresIn
      ? new Date(Date.now() + tokens.expiresIn * 1000)
      : null;

    // Upsert connected account
    const db = createDb(env.DB);

    // Check if this platform account is already connected
    const existing = await db
      .select()
      .from(connectedAccounts)
      .where(
        and(
          eq(connectedAccounts.workspaceId, oauthState.workspaceId),
          eq(connectedAccounts.platform, platform as "instagram" | "facebook" | "youtube" | "x" | "reddit" | "pinterest" | "linkedin" | "tiktok" | "google_business" | "threads" | "wordpress" | "medium" | "ghost" | "substack"),
          eq(connectedAccounts.platformAccountId, profile.platformAccountId)
        )
      )
      .get();

    if (existing) {
      // Update existing connection
      await db
        .update(connectedAccounts)
        .set({
          accessTokenEncrypted,
          refreshTokenEncrypted,
          tokenExpiresAt,
          platformUsername: profile.username,
          platformAvatarUrl: profile.avatarUrl ?? null,
          scopes: tokens.scope ?? config.scopes.join(" "),
          accountStatus: "active",
        })
        .where(eq(connectedAccounts.id, existing.id));
    } else {
      // Insert new connection
      await db.insert(connectedAccounts).values({
        id: createId(),
        workspaceId: oauthState.workspaceId,
        userId: oauthState.userId,
        platform: platform as "instagram" | "facebook" | "youtube" | "x" | "reddit" | "pinterest" | "linkedin" | "tiktok" | "google_business" | "threads" | "wordpress" | "medium" | "ghost" | "substack",
        platformAccountId: profile.platformAccountId,
        platformUsername: profile.username,
        platformAvatarUrl: profile.avatarUrl ?? null,
        accessTokenEncrypted,
        refreshTokenEncrypted,
        tokenExpiresAt,
        scopes: tokens.scope ?? config.scopes.join(" "),
        accountStatus: "active",
        connectedAt: new Date(),
      });
    }

    return NextResponse.redirect(
      new URL(
        `/dashboard/settings?connected=${platform}&username=${encodeURIComponent(profile.username)}`,
        request.url
      )
    );
  } catch (err) {
    const errorMessage =
      err instanceof Error ? err.message : "Connection failed";
    console.error(`Social OAuth error (${platform}):`, errorMessage);

    // TEMP DEBUG: store last error in KV so it can be read via /api/debug-oauth
    try {
      await kvSet("oauth_last_error", { platform, error: errorMessage, ts: Date.now() }, 3600);
    } catch { /* ignore KV write failure */ }

    return NextResponse.redirect(
      new URL(
        `/dashboard/settings?error=${encodeURIComponent(errorMessage)}`,
        request.url
      )
    );
  }
}
