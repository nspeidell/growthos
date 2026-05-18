/**
 * GET /api/social/connect?platform=instagram
 *
 * Initiates OAuth flow for a social platform.
 * Stores state in KV and redirects to platform's auth page.
 */

import { NextRequest, NextResponse } from "next/server";
import { generateCodeVerifier, generateState } from "arctic";
import { getSession } from "@/lib/auth/session";
import { getBindings } from "@/lib/cloudflare/bindings";
import {
  PLATFORM_OAUTH_CONFIGS,
  createOAuthState,
} from "@/lib/auth/social-oauth";
import { SESSION_COOKIE_NAME } from "@/lib/auth/session";

export const runtime = "edge";

export async function GET(request: NextRequest) {
  const platform = request.nextUrl.searchParams.get("platform");

  if (!platform || !(platform in PLATFORM_OAUTH_CONFIGS)) {
    return NextResponse.json(
      { error: `Invalid platform: ${platform}` },
      { status: 400 }
    );
  }

  // Verify user is authenticated
  const sessionId = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!sessionId) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const session = await getSession(sessionId);
  if (!session) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const config = PLATFORM_OAUTH_CONFIGS[platform]!;
  const env = getBindings();

  // Get client ID from environment
  const clientId = (env as unknown as Record<string, string>)[
    config.clientIdEnvKey
  ];
  if (!clientId) {
    return NextResponse.json(
      { error: `Missing ${config.clientIdEnvKey} environment variable` },
      { status: 500 }
    );
  }

  // Generate PKCE code verifier for platforms that support it
  const codeVerifier =
    platform === "x" ? generateCodeVerifier() : undefined;

  // Store state in KV
  const state = await createOAuthState({
    platform,
    workspaceId: session.workspaceId,
    userId: session.userId,
    codeVerifier,
    returnUrl: "/dashboard/settings",
  });

  const redirectUri = `${env.APP_URL}/api/social/callback/${platform}`;

  // Build auth URL
  const scopeSep = config.scopeSeparator ?? " ";
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: config.scopes.join(scopeSep),
    state,
    ...(config.extraParams ?? {}),
  });

  // PKCE for X/Twitter
  if (codeVerifier && platform === "x") {
    const encoder = new TextEncoder();
    const data = encoder.encode(codeVerifier);
    const digest = await crypto.subtle.digest("SHA-256", data);
    const codeChallenge = btoa(String.fromCharCode(...new Uint8Array(digest)))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    params.set("code_challenge", codeChallenge);
    params.set("code_challenge_method", "S256");
  }

  // Reddit needs duration=permanent
  if (platform === "reddit") {
    params.set("duration", "permanent");
  }

  const authUrl = `${config.authUrl}?${params.toString()}`;

  return NextResponse.redirect(authUrl);
}
