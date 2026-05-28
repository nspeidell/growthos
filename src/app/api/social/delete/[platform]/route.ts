/**
 * POST /api/social/delete/[platform]
 *
 * Data deletion callback — called by Meta/Threads when a user requests
 * their data be deleted. Removes all connected account records for
 * that platform user from D1.
 *
 * Meta requires this endpoint to return a status_url or confirmation_code.
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
        .delete(connectedAccounts)
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

  // Meta expects a confirmation code in the response
  return NextResponse.json({
    url: `${new URL(request.url).origin}/privacy`,
    confirmation_code: `growthos_del_${Date.now()}`,
  });
}

// Verification ping
export async function GET() {
  return NextResponse.json({ success: true });
}
