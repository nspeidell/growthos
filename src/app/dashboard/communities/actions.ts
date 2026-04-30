"use server";

import { z } from "zod";
import { eq, and, desc } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";
import { requirePermission } from "@/lib/auth/middleware";
import { getBindings } from "@/lib/cloudflare/bindings";
import { createDb } from "@/lib/db/client";
import { communities, communityPosts, communityMembers } from "@/lib/db/schema";
import { safeAction, type ActionResult } from "@/lib/utils/api";
import type { Community, CommunityPost } from "@/lib/db/schema";

// ─── Validation ───

const CreateCommunitySchema = z.object({
  name: z.string().min(1).max(200),
  platform: z.enum(["facebook", "discord", "reddit", "custom"]),
  platformGroupId: z.string().optional(),
  description: z.string().optional(),
});

const CreateCommunityPostSchema = z.object({
  communityId: z.string().min(1),
  type: z.enum(["discussion", "poll", "announcement", "engagement_prompt", "event"]),
  title: z.string().optional(),
  body: z.string().min(1).max(5000),
  pollOptions: z.string().optional(), // JSON array
  scheduledFor: z.string().optional(),
});

// ─── Types ───

export interface CommunityWithStats extends Community {
  posts: CommunityPost[];
  recentEngagement: number;
}

// ─── List Communities ───

export async function listCommunities(): Promise<
  ActionResult<CommunityWithStats[]>
> {
  return safeAction(async () => {
    const session = await requirePermission("content:write");
    const { DB } = getBindings();
    const db = createDb(DB);

    const comms = await db
      .select()
      .from(communities)
      .where(eq(communities.workspaceId, session.workspaceId))
      .orderBy(desc(communities.createdAt))
      .all();

    const result: CommunityWithStats[] = [];

    for (const comm of comms) {
      const posts = await db
        .select()
        .from(communityPosts)
        .where(eq(communityPosts.communityId, comm.id))
        .orderBy(desc(communityPosts.createdAt))
        .limit(10)
        .all();

      const recentEngagement = posts.reduce(
        (sum, p) => sum + (p.reactions ?? 0) + (p.comments ?? 0),
        0
      );

      result.push({ ...comm, posts, recentEngagement });
    }

    return result;
  });
}

// ─── Create Community ───

export async function createCommunity(
  formData: FormData
): Promise<ActionResult<Community>> {
  return safeAction(async () => {
    const session = await requirePermission("content:write");
    const { DB } = getBindings();
    const db = createDb(DB);

    const input = CreateCommunitySchema.parse({
      name: formData.get("name"),
      platform: formData.get("platform"),
      platformGroupId: formData.get("platformGroupId") || undefined,
      description: formData.get("description") || undefined,
    });

    const id = createId();

    await db.insert(communities).values({
      id,
      workspaceId: session.workspaceId,
      platform: input.platform,
      name: input.name,
      description: input.description ?? null,
      platformGroupId: input.platformGroupId ?? null,
      communityStatus: "active",
      createdAt: new Date(),
    });

    const community = await db
      .select()
      .from(communities)
      .where(eq(communities.id, id))
      .get();

    return community!;
  });
}

// ─── Create Community Post ───

export async function createCommunityPost(
  formData: FormData
): Promise<ActionResult<CommunityPost>> {
  return safeAction(async () => {
    await requirePermission("content:write");
    const { DB } = getBindings();
    const db = createDb(DB);

    const input = CreateCommunityPostSchema.parse({
      communityId: formData.get("communityId"),
      type: formData.get("type"),
      title: formData.get("title") || undefined,
      body: formData.get("body"),
      pollOptions: formData.get("pollOptions") || undefined,
      scheduledFor: formData.get("scheduledFor") || undefined,
    });

    const id = createId();
    const status = input.scheduledFor ? "scheduled" : "draft";

    await db.insert(communityPosts).values({
      id,
      communityId: input.communityId,
      type: input.type,
      title: input.title ?? null,
      body: input.body,
      pollOptions: input.pollOptions ?? null,
      postStatus: status,
      scheduledFor: input.scheduledFor ? new Date(input.scheduledFor) : null,
      createdAt: new Date(),
    });

    const post = await db
      .select()
      .from(communityPosts)
      .where(eq(communityPosts.id, id))
      .get();

    return post!;
  });
}

// ─── Publish Community Post ───

export async function publishCommunityPost(
  postId: string
): Promise<ActionResult<{ published: boolean }>> {
  return safeAction(async () => {
    await requirePermission("content:write");
    const { DB } = getBindings();
    const db = createDb(DB);

    const post = await db
      .select()
      .from(communityPosts)
      .where(eq(communityPosts.id, postId))
      .get();

    if (!post) throw new Error("Post not found");

    // In production, this would call the Facebook Groups API / platform adapter
    // For now, mark as published
    await db
      .update(communityPosts)
      .set({
        postStatus: "published",
        publishedAt: new Date(),
      })
      .where(eq(communityPosts.id, postId));

    return { published: true };
  });
}

// ─── Delete Community ───

export async function deleteCommunity(
  communityId: string
): Promise<ActionResult<{ deleted: boolean }>> {
  return safeAction(async () => {
    const session = await requirePermission("content:write");
    const { DB } = getBindings();
    const db = createDb(DB);

    const community = await db
      .select()
      .from(communities)
      .where(
        and(
          eq(communities.id, communityId),
          eq(communities.workspaceId, session.workspaceId)
        )
      )
      .get();

    if (!community) throw new Error("Community not found");

    await db.delete(communities).where(eq(communities.id, communityId));
    return { deleted: true };
  });
}
