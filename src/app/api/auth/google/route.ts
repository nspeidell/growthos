export const runtime = 'edge';

import { NextResponse } from "next/server";
import { generateState, generateCodeVerifier } from "arctic";
import { createGoogleClient } from "@/lib/auth/google";
import { kvSet } from "@/lib/cloudflare/kv";

/**
 * GET /api/auth/google
 * Initiates Google OAuth flow.
 * Generates state + code verifier, stores in KV, redirects to Google.
 */
export async function GET() {
  const google = createGoogleClient();
  const state = generateState();
  const codeVerifier = generateCodeVerifier();

  // Store state + verifier in KV (5 min TTL)
  await kvSet(
    `oauth:state:${state}`,
    { codeVerifier },
    300 // 5 minutes
  );

  const scopes = ["openid", "profile", "email"];
  const url = google.createAuthorizationURL(state, codeVerifier, scopes);

  return NextResponse.redirect(url.toString());
}
