/**
 * POST /api/social/deauth/[platform]
 *
 * Deauthorization callback — called by Meta/Threads when a user
 * removes the app from their account. Marks the connected account
 * as inactive in D1.
 */

import { NextRequest, NextResponse } from "next/server";
import { getBindings } from "@/lib/cloudflare/bindings";
import { createDb } from "@/lib/db/client";
import { connectedAccounts } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

export const runtime = "edge";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ platform: string }> }
) {
  const { platform } = await params;

  try {
    const body = await request.json().catch(() => ({}));
    const userId = (body as Record<string, string>).user_id ?? (body as Record<string, string>).userId;

    if (userId) {
      const env = getBindings();
      const db = createDb(env.DB);
      await db
        .update(connectedAccounts)
        .set({ accountStatus: "revoked" })
        .where(
          and(
            eq(connectedAccounts.platform, platform as "instagram" | "facebook" | "youtube" | "x" | "reddit" | "pinterest" | "linkedin" | "tiktok" | "google_business" | "threads" | "wordpress" | "medium" | "ghost" | "substack"),
            eq(connectedAccounts.platformAccountId, userId)
          )
        );
    }
  } catch {
    // Best-effort — always return 200 so Meta doesn't retry
  }

  return NextResponse.json({ success: true });
}

// Some platforms send GET pings to verify the endpoint
export async function GET() {
  return NextResponse.json({ success: true });
}
