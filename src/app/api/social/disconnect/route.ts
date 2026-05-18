/**
 * POST /api/social/disconnect
 *
 * Disconnects a social platform account.
 * Cancels any queued posts for that account and removes tokens.
 */

import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { getBindings } from "@/lib/cloudflare/bindings";
import { createDb } from "@/lib/db/client";
import { connectedAccounts, scheduledPosts } from "@/lib/db/schema";
import { getSession } from "@/lib/auth/session";
import { SESSION_COOKIE_NAME } from "@/lib/auth/session";

export const runtime = "edge";

export async function POST(request: NextRequest) {
  const sessionId = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!sessionId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const session = await getSession(sessionId);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { accountId } = (await request.json()) as { accountId: string };
  if (!accountId) {
    return NextResponse.json(
      { error: "accountId is required" },
      { status: 400 }
    );
  }

  const { DB } = getBindings();
  const db = createDb(DB);

  // Verify account belongs to user's workspace
  const account = await db
    .select()
    .from(connectedAccounts)
    .where(
      and(
        eq(connectedAccounts.id, accountId),
        eq(connectedAccounts.workspaceId, session.workspaceId)
      )
    )
    .get();

  if (!account) {
    return NextResponse.json(
      { error: "Account not found" },
      { status: 404 }
    );
  }

  // Mark the account as disconnected and clear tokens, but preserve the row.
  // This keeps the row ID intact so any scheduled_posts that reference this
  // account are NOT orphaned. When the user reconnects, the OAuth callback
  // upsert will find this row by (platform + workspaceId + platformAccountId)
  // and update it in-place — same ID, new tokens, status back to 'active'.
  await db
    .update(connectedAccounts)
    .set({
      accountStatus: "revoked",
      accessTokenEncrypted: "",
      refreshTokenEncrypted: null,
      tokenExpiresAt: null,
    })
    .where(eq(connectedAccounts.id, accountId));

  // Cancel only the queued/draft posts so the user doesn't have stale items
  // re-firing on reconnect. Published/failed posts are left untouched for history.
  await db
    .update(scheduledPosts)
    .set({ postStatus: "cancelled", updatedAt: new Date() })
    .where(
      and(
        eq(scheduledPosts.connectedAccountId, accountId),
        eq(scheduledPosts.postStatus, "queued")
      )
    );

  await db
    .update(scheduledPosts)
    .set({ postStatus: "cancelled", updatedAt: new Date() })
    .where(
      and(
        eq(scheduledPosts.connectedAccountId, accountId),
        eq(scheduledPosts.postStatus, "draft")
      )
    );

  return NextResponse.json({ success: true });
}
