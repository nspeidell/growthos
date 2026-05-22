"use server";

import { z } from "zod";
import { eq, and, desc } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";
import { requirePermission } from "@/lib/auth/middleware";
import { getBindings } from "@/lib/cloudflare/bindings";
import { createDb } from "@/lib/db/client";
import { communities, communityPosts, communityMembers, connectedAccounts } from "@/lib/db/schema";
import { safeAction, type ActionResult } from "@/lib/utils/api";
import { decrypt } from "@/lib/utils/crypto";
import { FacebookGroupsClient } from "@/lib/communities/facebook-groups";
import type { Community, CommunityPost, ConnectedAccount } from "@/lib/db/schema";

// ─── Validation ───

const CreateCommunitySchema = z.object({
  name: z.string().min(1).max(200),
  platform: z.enum(["facebook", "reddit", "discord", "slack"]),
  platformId: z.string().optional(),
  description: z.string().optional(),
  connectedAccountId: z.string().optional(),
});

const CreateCommunityPostSchema = z.object({
  communityId: z.string().min(1),
  postType: z.enum(["text", "image", "link", "poll", "video"]),
  title: z.string().optional(),
  body: z.string().min(1).max(5000),
  scheduledFor: z.string().optional(),
});

// ─── Types ───

export interface CommunityWithStats extends Community {
  posts: CommunityPost[];
  recentEngagement: number;
}

export interface ConnectedAccountSummary {
  id: string;
  platform: string;
  platformAccountId: string;
  platformUsername: string | null;
  platformAvatarUrl: string | null;
  accountStatus: string;
}

// ─── List Connected Accounts ───

export async function listConnectedAccountsByPlatform(
  platform: string
): Promise<ActionResult<ConnectedAccountSummary[]>> {
  return safeAction(async () => {
    const session = await requirePermission("content:write");
    const { DB } = getBindings();
    const db = createDb(DB);

    const accounts = await db
      .select({
        id: connectedAccounts.id,
        platform: connectedAccounts.platform,
        platformAccountId: connectedAccounts.platformAccountId,
        platformUsername: connectedAccounts.platformUsername,
        platformAvatarUrl: connectedAccounts.platformAvatarUrl,
        accountStatus: connectedAccounts.accountStatus,
      })
      .from(connectedAccounts)
      .where(
        and(
          eq(connectedAccounts.workspaceId, session.workspaceId),
          eq(connectedAccounts.platform, platform as ConnectedAccount["platform"]),
          eq(connectedAccounts.accountStatus, "active")
        )
      )
      .all();

    return accounts;
  });
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
        (sum, p) => sum + (p.likes ?? 0) + (p.comments ?? 0),
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
      platformId: formData.get("platformId") || undefined,
      description: formData.get("description") || undefined,
      connectedAccountId: formData.get("connectedAccountId") || undefined,
    });

    const id = createId();

    await db.insert(communities).values({
      id,
      workspaceId: session.workspaceId,
      platform: input.platform,
      name: input.name,
      description: input.description ?? null,
      platformId: input.platformId ?? null,
      connectedAccountId: input.connectedAccountId ?? null,
      communityStatus: "active",
      createdAt: new Date(),
      updatedAt: new Date(),
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
    const session = await requirePermission("content:write");
    const { DB } = getBindings();
    const db = createDb(DB);

    const input = CreateCommunityPostSchema.parse({
      communityId: formData.get("communityId"),
      postType: formData.get("postType"),
      title: formData.get("title") || undefined,
      body: formData.get("body"),
      scheduledFor: formData.get("scheduledFor") || undefined,
    });

    const id = createId();
    const status = input.scheduledFor ? "scheduled" : "draft";

    await db.insert(communityPosts).values({
      id,
      communityId: input.communityId,
      workspaceId: session.workspaceId,
      postType: input.postType,
      title: input.title ?? null,
      body: input.body,
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
): Promise<ActionResult<{ published: boolean; platformPostId?: string }>> {
  return safeAction(async () => {
    const session = await requirePermission("content:write");
    const { DB, ENCRYPTION_KEY } = getBindings();
    const db = createDb(DB);

    // Load post + its community (for platform, platformId, connectedAccountId)
    const post = await db
      .select()
      .from(communityPosts)
      .where(eq(communityPosts.id, postId))
      .get();

    if (!post) throw new Error("Post not found");

    const community = await db
      .select()
      .from(communities)
      .where(eq(communities.id, post.communityId))
      .get();

    if (!community) throw new Error("Community not found");

    let platformPostId: string | undefined;

    // ── Facebook Group publishing ──
    if (community.platform === "facebook" && community.platformId) {
      if (!community.connectedAccountId) {
        throw new Error(
          "No Facebook account linked to this community. Edit the community and select a connected account."
        );
      }

      const account = await db
        .select()
        .from(connectedAccounts)
        .where(
          and(
            eq(connectedAccounts.id, community.connectedAccountId),
            eq(connectedAccounts.workspaceId, session.workspaceId)
          )
        )
        .get();

      if (!account) throw new Error("Connected Facebook account not found");
      if (account.accountStatus !== "active")
        throw new Error("Facebook account token is expired. Please reconnect.");

      const accessToken = await decrypt(
        account.accessTokenEncrypted,
        ENCRYPTION_KEY
      );

      const client = new FacebookGroupsClient(accessToken);

      const message = post.title
        ? `${post.title}\n\n${post.body}`
        : post.body;

      platformPostId = await client.postToGroup({
        groupId: community.platformId,
        message,
        accessToken,
      });
    }

    // ── Reddit (read-only strategy — log but don't publish via API) ──
    if (community.platform === "reddit") {
      // Per Reunion strategy: Reddit is community intelligence only.
      // We store the post locally as a draft reference; manual posting required.
      await db
        .update(communityPosts)
        .set({ postStatus: "draft" })
        .where(eq(communityPosts.id, postId));

      throw new Error(
        "Reddit posts must be submitted manually to preserve authenticity. Post saved as draft for reference."
      );
    }

    await db
      .update(communityPosts)
      .set({
        postStatus: "published",
        publishedAt: new Date(),
        platformPostId: platformPostId ?? null,
      })
      .where(eq(communityPosts.id, postId));

    // Increment community post count
    await db
      .update(communities)
      .set({
        postCount: (community.postCount ?? 0) + 1,
        updatedAt: new Date(),
      })
      .where(eq(communities.id, community.id));

    return { published: true, platformPostId };
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
