"use server";

import { eq, and, gte, lte, desc } from "drizzle-orm";
import { requirePermission } from "@/lib/auth/middleware";
import { getBindings } from "@/lib/cloudflare/bindings";
import { createDb } from "@/lib/db/client";
import { scheduledPosts, contentAssets } from "@/lib/db/schema";
import { safeAction, type ActionResult } from "@/lib/utils/api";

// ─── Types ───

export interface CalendarPost {
  id: string;
  platform: string;
  postStatus: string;
  scheduledFor: Date;
  body: string; // truncated preview
  connectedAccountId: string;
}

// ─── Get Posts by Date Range ───

export async function getPostsByDateRange(
  startMs: number,
  endMs: number
): Promise<ActionResult<CalendarPost[]>> {
  return safeAction(async () => {
    const session = await requirePermission("content:read");
    const { DB } = getBindings();
    const db = createDb(DB);

    const startDate = new Date(startMs);
    const endDate = new Date(endMs);

    const posts = await db
      .select({
        id: scheduledPosts.id,
        platform: scheduledPosts.platform,
        postStatus: scheduledPosts.postStatus,
        scheduledFor: scheduledPosts.scheduledFor,
        body: contentAssets.body,
        connectedAccountId: scheduledPosts.connectedAccountId,
      })
      .from(scheduledPosts)
      .leftJoin(contentAssets, eq(scheduledPosts.contentAssetId, contentAssets.id))
      .where(
        and(
          eq(scheduledPosts.workspaceId, session.workspaceId),
          gte(scheduledPosts.scheduledFor, startDate),
          lte(scheduledPosts.scheduledFor, endDate)
        )
      )
      .orderBy(desc(scheduledPosts.scheduledFor))
      .all();

    return posts.map((p) => ({
      id: p.id,
      platform: p.platform,
      postStatus: p.postStatus,
      scheduledFor: p.scheduledFor,
      body: (p.body ?? "").slice(0, 120),
      connectedAccountId: p.connectedAccountId,
    }));
  });
}

// ─── Reschedule Post ───

export async function reschedulePost(
  postId: string,
  newDateMs: number
): Promise<ActionResult<{ success: boolean }>> {
  return safeAction(async () => {
    const session = await requirePermission("content:write");
    const { DB } = getBindings();
    const db = createDb(DB);

    const post = await db
      .select()
      .from(scheduledPosts)
      .where(eq(scheduledPosts.id, postId))
      .get();

    if (!post || post.workspaceId !== session.workspaceId) {
      throw new Error("Post not found");
    }

    if (post.postStatus === "published" || post.postStatus === "publishing") {
      throw new Error("Cannot reschedule a published post");
    }

    await db
      .update(scheduledPosts)
      .set({
        scheduledFor: new Date(newDateMs),
        updatedAt: new Date(),
      })
      .where(eq(scheduledPosts.id, postId));

    return { success: true };
  });
}
