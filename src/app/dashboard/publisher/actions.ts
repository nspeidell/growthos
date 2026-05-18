"use server";

import { z } from "zod";
import { eq, and, desc, lte, inArray } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";
import { requirePermission } from "@/lib/auth/middleware";
import { getBindings } from "@/lib/cloudflare/bindings";
import { createDb } from "@/lib/db/client";
import {
  scheduledPosts,
  connectedAccounts,
  contentAssets,
} from "@/lib/db/schema";
import { safeAction, type ActionResult } from "@/lib/utils/api";
import type {
  ScheduledPost,
  ConnectedAccount,
  ContentAsset,
} from "@/lib/db/schema";

// ─── Validation ───

const SchedulePostSchema = z.object({
  contentAssetId: z.string().min(1),
  connectedAccountId: z.string().min(1),
  scheduledFor: z.string().datetime(),
  approvalMode: z.enum(["manual", "autonomous"]).default("manual"),
  metadata: z.string().optional(), // JSON string for platform-specific options
});

const UpdatePostStatusSchema = z.object({
  postId: z.string().min(1),
  status: z.enum([
    "draft",
    "queued",
    "approved",
    "publishing",
    "published",
    "failed",
    "cancelled",
  ]),
});

// ─── Types ───

export interface ScheduledPostWithDetails extends ScheduledPost {
  contentAsset?: ContentAsset;
  account?: ConnectedAccount;
}

// ─── List Connected Accounts ───

export async function listConnectedAccounts(): Promise<
  ActionResult<ConnectedAccount[]>
> {
  return safeAction(async () => {
    const session = await requirePermission("publish:queue");
    const { DB } = getBindings();
    const db = createDb(DB);

    return db
      .select()
      .from(connectedAccounts)
      .where(eq(connectedAccounts.workspaceId, session.workspaceId))
      .all();
  });
}

// ─── List Scheduled Posts ───

export async function listScheduledPosts(
  statusFilter?: string
): Promise<ActionResult<ScheduledPostWithDetails[]>> {
  return safeAction(async () => {
    const session = await requirePermission("publish:queue");
    const { DB } = getBindings();
    const db = createDb(DB);

    const posts = await db
      .select()
      .from(scheduledPosts)
      .where(eq(scheduledPosts.workspaceId, session.workspaceId))
      .orderBy(desc(scheduledPosts.scheduledFor))
      .all();

    const filtered = statusFilter
      ? posts.filter((p) => p.postStatus === statusFilter)
      : posts;

    // Enrich with content asset + account details
    const enriched: ScheduledPostWithDetails[] = [];

    for (const post of filtered) {
      const asset = await db
        .select()
        .from(contentAssets)
        .where(eq(contentAssets.id, post.contentAssetId))
        .get();

      const account = await db
        .select()
        .from(connectedAccounts)
        .where(eq(connectedAccounts.id, post.connectedAccountId))
        .get();

      enriched.push({
        ...post,
        contentAsset: asset ?? undefined,
        account: account ?? undefined,
      });
    }

    return enriched;
  });
}

// ─── Schedule a Post ───

export async function schedulePost(
  formData: FormData
): Promise<ActionResult<ScheduledPost>> {
  return safeAction(async () => {
    const session = await requirePermission("publish:queue");
    const { DB } = getBindings();
    const db = createDb(DB);

    const input = SchedulePostSchema.parse({
      contentAssetId: formData.get("contentAssetId"),
      connectedAccountId: formData.get("connectedAccountId"),
      scheduledFor: formData.get("scheduledFor"),
      approvalMode: formData.get("approvalMode") ?? "manual",
      metadata: formData.get("metadata") ?? undefined,
    });

    // Verify content asset exists and is approved
    const asset = await db
      .select()
      .from(contentAssets)
      .where(eq(contentAssets.id, input.contentAssetId))
      .get();

    if (!asset) throw new Error("Content asset not found");

    // Verify connected account exists and is active
    const account = await db
      .select()
      .from(connectedAccounts)
      .where(
        and(
          eq(connectedAccounts.id, input.connectedAccountId),
          eq(connectedAccounts.workspaceId, session.workspaceId)
        )
      )
      .get();

    if (!account) throw new Error("Connected account not found");
    if (account.accountStatus !== "active") {
      throw new Error(
        `Account is ${account.accountStatus} — reconnect before scheduling`
      );
    }

    const now = new Date();
    const scheduledFor = new Date(input.scheduledFor);

    // Determine initial status based on approval mode
    const initialStatus =
      input.approvalMode === "autonomous" ? "queued" : "draft";

    const postId = createId();
    const post: typeof scheduledPosts.$inferInsert = {
      id: postId,
      workspaceId: session.workspaceId,
      contentAssetId: input.contentAssetId,
      connectedAccountId: input.connectedAccountId,
      platform: account.platform,
      scheduledFor,
      postStatus: initialStatus,
      approvalMode: input.approvalMode,
      metadata: input.metadata ?? null,
      retryCount: 0,
      createdBy: session.userId,
      createdAt: now,
      updatedAt: now,
    };

    await db.insert(scheduledPosts).values(post);

    return post as ScheduledPost;
  });
}

// ─── Approve a Post ───

export async function approvePost(
  postId: string
): Promise<ActionResult<{ approved: boolean }>> {
  return safeAction(async () => {
    const session = await requirePermission("publish:approve");
    const { DB } = getBindings();
    const db = createDb(DB);

    const post = await db
      .select()
      .from(scheduledPosts)
      .where(
        and(
          eq(scheduledPosts.id, postId),
          eq(scheduledPosts.workspaceId, session.workspaceId)
        )
      )
      .get();

    if (!post) throw new Error("Post not found");
    if (post.postStatus !== "draft") {
      throw new Error(`Cannot approve post with status: ${post.postStatus}`);
    }

    await db
      .update(scheduledPosts)
      .set({
        postStatus: "queued",
        approvedBy: session.userId,
        approvedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(scheduledPosts.id, postId));

    return { approved: true };
  });
}

// ─── Cancel a Post ───

export async function cancelPost(
  postId: string
): Promise<ActionResult<{ cancelled: boolean }>> {
  return safeAction(async () => {
    const session = await requirePermission("publish:queue");
    const { DB } = getBindings();
    const db = createDb(DB);

    const post = await db
      .select()
      .from(scheduledPosts)
      .where(
        and(
          eq(scheduledPosts.id, postId),
          eq(scheduledPosts.workspaceId, session.workspaceId)
        )
      )
      .get();

    if (!post) throw new Error("Post not found");
    if (post.postStatus === "published") {
      throw new Error("Cannot cancel an already published post");
    }
    if (post.postStatus === "publishing") {
      throw new Error("Cannot cancel a post that is currently publishing");
    }

    await db
      .update(scheduledPosts)
      .set({
        postStatus: "cancelled",
        updatedAt: new Date(),
      })
      .where(eq(scheduledPosts.id, postId));

    return { cancelled: true };
  });
}

// ─── Reschedule a Post ───

export async function reschedulePost(
  postId: string,
  newScheduledFor: string
): Promise<ActionResult<{ rescheduled: boolean }>> {
  return safeAction(async () => {
    const session = await requirePermission("publish:queue");
    const { DB } = getBindings();
    const db = createDb(DB);

    const post = await db
      .select()
      .from(scheduledPosts)
      .where(
        and(
          eq(scheduledPosts.id, postId),
          eq(scheduledPosts.workspaceId, session.workspaceId)
        )
      )
      .get();

    if (!post) throw new Error("Post not found");
    if (post.postStatus === "published" || post.postStatus === "publishing") {
      throw new Error("Cannot reschedule a published or publishing post");
    }

    await db
      .update(scheduledPosts)
      .set({
        scheduledFor: new Date(newScheduledFor),
        updatedAt: new Date(),
      })
      .where(eq(scheduledPosts.id, postId));

    return { rescheduled: true };
  });
}
