"use server";

import { eq, and, gte, lte, desc } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";
import { requirePermission } from "@/lib/auth/middleware";
import { getBindings } from "@/lib/cloudflare/bindings";
import { createDb } from "@/lib/db/client";
import {
  scheduledPosts,
  contentAssets,
  contentProjects,
  connectedAccounts,
} from "@/lib/db/schema";
import { safeAction, type ActionResult } from "@/lib/utils/api";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CalendarPost {
  id: string;
  platform: string;
  postStatus: string;
  scheduledFor: Date;
  body: string;
  connectedAccountId: string;
}

export interface ConnectedAccountOption {
  id: string;
  platform: string;
  username: string | null;
}

// ─── Get Posts by Date Range ──────────────────────────────────────────────────

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

// ─── Reschedule Post ──────────────────────────────────────────────────────────

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
      .set({ scheduledFor: new Date(newDateMs), updatedAt: new Date() })
      .where(eq(scheduledPosts.id, postId));

    return { success: true };
  });
}

// ─── Delete / Cancel Post ─────────────────────────────────────────────────────

export async function deleteScheduledPost(
  postId: string
): Promise<ActionResult<{ deleted: boolean }>> {
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
      throw new Error("Cannot delete a post that is publishing or already published");
    }

    await db.delete(scheduledPosts).where(eq(scheduledPosts.id, postId));
    return { deleted: true };
  });
}

// ─── Approve Post ─────────────────────────────────────────────────────────────

export async function approvePost(
  postId: string
): Promise<ActionResult<{ approved: boolean }>> {
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

    if (post.postStatus !== "draft" && post.postStatus !== "queued") {
      throw new Error("Post cannot be approved in its current state");
    }

    await db
      .update(scheduledPosts)
      .set({
        postStatus: "approved",
        approvedBy: session.userId,
        approvedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(scheduledPosts.id, postId));

    return { approved: true };
  });
}

// ─── Get Connected Accounts ────────────────────────────────────────────────────

export async function getConnectedAccountsForCalendar(): Promise<
  ActionResult<ConnectedAccountOption[]>
> {
  return safeAction(async () => {
    const session = await requirePermission("content:read");
    const { DB } = getBindings();
    const db = createDb(DB);

    const accounts = await db
      .select({
        id: connectedAccounts.id,
        platform: connectedAccounts.platform,
        username: connectedAccounts.platformUsername,
      })
      .from(connectedAccounts)
      .where(
        and(
          eq(connectedAccounts.workspaceId, session.workspaceId),
          eq(connectedAccounts.accountStatus, "active")
        )
      )
      .orderBy(connectedAccounts.platform)
      .all();

    return accounts;
  });
}

// ─── Schedule Post From Calendar ──────────────────────────────────────────────

/**
 * Creates a content_asset + scheduled_post directly from the calendar.
 * Uses a workspace-level "Quick Posts" project (auto-created on first use).
 */
export async function schedulePostFromCalendar(
  formData: FormData
): Promise<ActionResult<{ id: string }>> {
  return safeAction(async () => {
    const session = await requirePermission("content:write");
    const { DB } = getBindings();
    const db = createDb(DB);

    const connectedAccountId = formData.get("connectedAccountId") as string;
    const body = formData.get("body") as string;
    const scheduledForMs = parseInt(formData.get("scheduledForMs") as string);

    if (!connectedAccountId || !body?.trim()) {
      throw new Error("Account and content are required");
    }
    if (isNaN(scheduledForMs) || scheduledForMs < Date.now() - 60_000) {
      throw new Error("Please choose a time in the future");
    }

    // Verify the connected account belongs to this workspace
    const account = await db
      .select()
      .from(connectedAccounts)
      .where(
        and(
          eq(connectedAccounts.id, connectedAccountId),
          eq(connectedAccounts.workspaceId, session.workspaceId),
          eq(connectedAccounts.accountStatus, "active")
        )
      )
      .get();

    if (!account) throw new Error("Connected account not found");

    // Upsert a "Quick Posts" project for this workspace
    let project = await db
      .select()
      .from(contentProjects)
      .where(
        and(
          eq(contentProjects.workspaceId, session.workspaceId),
          eq(contentProjects.title, "Quick Posts")
        )
      )
      .get();

    if (!project) {
      const projectId = createId();
      const now = new Date();
      await db.insert(contentProjects).values({
        id: projectId,
        workspaceId: session.workspaceId,
        title: "Quick Posts",
        brief: "Auto-created for posts scheduled directly from the calendar.",
        doctrineMode: "auto",
        status: "approved",
        createdBy: session.userId,
        createdAt: now,
        updatedAt: now,
      });
      project = await db
        .select()
        .from(contentProjects)
        .where(eq(contentProjects.id, projectId))
        .get();
    }

    if (!project) throw new Error("Failed to create project");

    // Create the content asset
    const assetId = createId();
    const now = new Date();
    await db.insert(contentAssets).values({
      id: assetId,
      projectId: project.id,
      platform: account.platform,
      type: "caption",
      body: body.trim(),
      status: "approved",
      createdAt: now,
    });

    // Create the scheduled post
    const postId = createId();
    await db.insert(scheduledPosts).values({
      id: postId,
      workspaceId: session.workspaceId,
      contentAssetId: assetId,
      connectedAccountId,
      platform: account.platform,
      scheduledFor: new Date(scheduledForMs),
      postStatus: "queued",
      approvalMode: "manual",
      createdBy: session.userId,
      createdAt: now,
      updatedAt: now,
    });

    return { id: postId };
  });
}
