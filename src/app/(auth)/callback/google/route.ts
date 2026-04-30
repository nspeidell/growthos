export const runtime = 'edge';

import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { createGoogleClient, fetchGoogleProfile } from "@/lib/auth/google";
import { getBindings } from "@/lib/cloudflare/bindings";
import { createDb } from "@/lib/db/client";
import { users, workspaces, workspaceMembers } from "@/lib/db/schema";
import {
  createSession,
  SESSION_COOKIE_NAME,
  SESSION_COOKIE_OPTIONS,
} from "@/lib/auth/session";
import { kvGet, kvDelete } from "@/lib/cloudflare/kv";
import { createId } from "@paralleldrive/cuid2";

/**
 * GET /callback/google
 * Handles the OAuth callback from Google.
 * Exchanges code for tokens, upserts user, creates session.
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  // Handle OAuth errors
  if (error) {
    console.error("Google OAuth error:", error);
    return NextResponse.redirect(new URL("/login?error=oauth", request.url));
  }

  if (!code || !state) {
    return NextResponse.redirect(new URL("/login?error=missing_params", request.url));
  }

  // Validate state and get code verifier
  const storedState = await kvGet<{ codeVerifier: string }>(
    `oauth:state:${state}`
  );

  if (!storedState) {
    return NextResponse.redirect(new URL("/login?error=invalid_state", request.url));
  }

  // Clean up state from KV
  await kvDelete(`oauth:state:${state}`);

  try {
    // Exchange code for tokens
    const google = createGoogleClient();
    const tokens = await google.validateAuthorizationCode(
      code,
      storedState.codeVerifier
    );

    // Fetch user profile from Google
    const profile = await fetchGoogleProfile(tokens.accessToken());

    // Set up database
    const env = getBindings();
    const db = createDb(env.DB);

    // Upsert user
    let user = await db
      .select()
      .from(users)
      .where(eq(users.googleId, profile.sub))
      .get();

    if (!user) {
      // Check if user exists by email (might have been invited)
      user = await db
        .select()
        .from(users)
        .where(eq(users.email, profile.email))
        .get();

      if (user) {
        // Link Google account to existing user
        await db
          .update(users)
          .set({
            googleId: profile.sub,
            avatarUrl: profile.picture,
            updatedAt: new Date(),
          })
          .where(eq(users.id, user.id));
      } else {
        // Create new user
        const userId = createId();
        const now = new Date();

        await db.insert(users).values({
          id: userId,
          email: profile.email,
          name: profile.name,
          avatarUrl: profile.picture,
          googleId: profile.sub,
          createdAt: now,
          updatedAt: now,
        });

        // Create default workspace
        const workspaceId = createId();
        const slug = profile.email
          .split("@")[0]!
          .replace(/[^a-z0-9]/gi, "-")
          .toLowerCase();

        await db.insert(workspaces).values({
          id: workspaceId,
          name: `${profile.given_name}'s Workspace`,
          slug,
          ownerId: userId,
          plan: "free",
          createdAt: now,
        });

        // Add user as workspace owner
        await db.insert(workspaceMembers).values({
          id: createId(),
          workspaceId,
          userId,
          role: "owner",
          joinedAt: now,
        });

        user = {
          id: userId,
          email: profile.email,
          name: profile.name,
          avatarUrl: profile.picture,
          googleId: profile.sub,
          createdAt: now,
          updatedAt: now,
        };
      }
    }

    // Get user's workspace membership
    const membership = await db
      .select({
        workspaceId: workspaceMembers.workspaceId,
        role: workspaceMembers.role,
        workspaceName: workspaces.name,
      })
      .from(workspaceMembers)
      .innerJoin(workspaces, eq(workspaceMembers.workspaceId, workspaces.id))
      .where(eq(workspaceMembers.userId, user.id))
      .get();

    if (!membership) {
      return NextResponse.redirect(
        new URL("/login?error=no_workspace", request.url)
      );
    }

    // Create session
    const sessionId = await createSession({
      userId: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
      workspaceId: membership.workspaceId,
      workspaceName: membership.workspaceName,
      role: membership.role,
    });

    // Set session cookie and redirect to dashboard
    const response = NextResponse.redirect(
      new URL("/dashboard", request.url)
    );

    response.cookies.set(SESSION_COOKIE_NAME, sessionId, SESSION_COOKIE_OPTIONS);

    return response;
  } catch (err) {
    console.error("OAuth callback error:", err);
    return NextResponse.redirect(new URL("/login?error=callback", request.url));
  }
}
