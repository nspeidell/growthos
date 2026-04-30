/**
 * POST /api/unsubscribe
 *
 * Handles newsletter unsubscribe requests.
 * Accepts email + workspace_id (from signed token in URL) and marks subscriber as unsubscribed.
 */

import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { getBindings } from "@/lib/cloudflare/bindings";
import { createDb } from "@/lib/db/client";
import { subscribers } from "@/lib/db/schema";

export const runtime = "edge";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      email?: string;
      workspaceId?: string;
    };

    const { email, workspaceId } = body;

    if (!email || !workspaceId) {
      return NextResponse.json(
        { error: "Missing email or workspace" },
        { status: 400 }
      );
    }

    const { DB } = getBindings();
    const db = createDb(DB);

    const subscriber = await db
      .select()
      .from(subscribers)
      .where(
        and(
          eq(subscribers.email, email),
          eq(subscribers.workspaceId, workspaceId)
        )
      )
      .get();

    if (!subscriber) {
      // Don't reveal whether the email exists
      return NextResponse.json({ success: true });
    }

    if (subscriber.subscriberStatus === "unsubscribed") {
      return NextResponse.json({ success: true, alreadyUnsubscribed: true });
    }

    await db
      .update(subscribers)
      .set({
        subscriberStatus: "unsubscribed",
        unsubscribedAt: new Date(),
      })
      .where(eq(subscribers.id, subscriber.id));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Unsubscribe error:", error);
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 }
    );
  }
}
