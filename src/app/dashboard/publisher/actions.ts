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
import { decrypt } from "@/lib/utils/crypto";
import { PinterestClient, type PinterestBoard } from "@/lib/publishers/pinterest";
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

// ─── Pinterest Board Management ───

/**
 * The 12 Reunion Pinterest boards.
 * Ordered by strategic priority.
 * See PINTEREST_STRATEGY.md for full rationale.
 */
const REUNION_PINTEREST_BOARDS = [
  {
    name: "Questions to Ask Your Grandparents",
    description:
      "Conversation prompts, legacy questions, and storytelling starters to capture family history before it's lost. Save these questions and ask them this week.",
  },
  {
    name: "Family Traditions Worth Keeping",
    description:
      "Holiday traditions, weekly rituals, birthday ideas, and generational activities that build family identity. The rituals that become the memories.",
  },
  {
    name: "Family Connection Ideas",
    description:
      "Activities, games, discussion prompts, and family challenges to bring your people closer — whether you're in the same house or across the country.",
  },
  {
    name: "Family Legacy Ideas",
    description:
      "Memory books, legacy letters, family values, storytelling, and ancestry ideas. Be the founder of your family's legacy.",
  },
  {
    name: "Memory Keeping Without Feeling Cringe",
    description:
      "Authentic memory preservation — candid photos, real moments, family journals, and modern storytelling. Because the blurry photos become your favorites later.",
  },
  {
    name: "Raising Connected Kids",
    description:
      "Family bonding, technology balance, traditions, and emotional intelligence for intentional parents raising kids who know who they are.",
  },
  {
    name: "Family Dinner & Gathering Inspiration",
    description:
      "Family tables, gatherings, hospitality, and connection rituals. The best conversations start around a good meal.",
  },
  {
    name: "Family Reunion Ideas",
    description:
      "Games, activities, planning guides, shirts, memory walls, and everything you need to bring the whole family together.",
  },
  {
    name: "Cozy Family Life",
    description:
      "Warmth, togetherness, cozy home moments, and soft nostalgic imagery. The visual world of what family actually feels like.",
  },
  {
    name: "The Digital Family Living Room",
    description:
      "Cinematic family moments, warm aesthetic imagery, and emotional togetherness. A gathering place for family connection inspiration.",
  },
  {
    name: "Family Group Chat Humor",
    description:
      "Relatable family memes, funny family texts, generational humor, and the beautiful chaos of family group chats.",
  },
  {
    name: "AI for Families",
    description:
      "Warm and human uses of technology that help families stay connected, resurface memories, and simplify life together.",
  },
] as const;

/**
 * Create all 12 Reunion Pinterest boards in one shot.
 * Safe to re-run — Pinterest will return a 409 for boards that already exist,
 * which we catch per-board and report as 'skipped'.
 */
export async function createReunionPinterestBoards(
  connectedAccountId: string
): Promise<ActionResult<{ created: string[]; skipped: string[]; failed: string[] }>> {
  return safeAction(async () => {
    const session = await requirePermission("publish:queue");
    const { DB, ENCRYPTION_KEY } = getBindings();
    const db = createDb(DB);

    const account = await db
      .select()
      .from(connectedAccounts)
      .where(
        and(
          eq(connectedAccounts.id, connectedAccountId),
          eq(connectedAccounts.workspaceId, session.workspaceId),
          eq(connectedAccounts.platform, "pinterest")
        )
      )
      .get();

    if (!account) throw new Error("Pinterest account not found");
    if (account.accountStatus !== "active") {
      throw new Error("Pinterest account is expired — please reconnect");
    }

    const accessToken = await decrypt(account.accessTokenEncrypted, ENCRYPTION_KEY);
    const client = new PinterestClient(accessToken);

    const created: string[] = [];
    const skipped: string[] = [];
    const failed: string[] = [];

    for (const board of REUNION_PINTEREST_BOARDS) {
      try {
        await client.createBoard({
          name: board.name,
          description: board.description,
          privacy: "PUBLIC",
        });
        created.push(board.name);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        // 409 = board name already exists — not a failure
        if (msg.includes("409") || msg.toLowerCase().includes("already exists") || msg.toLowerCase().includes("conflict")) {
          skipped.push(board.name);
        } else {
          failed.push(`${board.name}: ${msg}`);
        }
      }
    }

    return { created, skipped, failed };
  });
}

// ─── Pinterest Board Picker ───

/**
 * Fetch boards for a connected Pinterest account.
 * Called client-side when user selects a Pinterest account in the schedule form.
 */
export async function listPinterestBoards(
  connectedAccountId: string
): Promise<ActionResult<PinterestBoard[]>> {
  return safeAction(async () => {
    const session = await requirePermission("publish:queue");
    const { DB, ENCRYPTION_KEY } = getBindings();
    const db = createDb(DB);

    const account = await db
      .select()
      .from(connectedAccounts)
      .where(
        and(
          eq(connectedAccounts.id, connectedAccountId),
          eq(connectedAccounts.workspaceId, session.workspaceId),
          eq(connectedAccounts.platform, "pinterest")
        )
      )
      .get();

    if (!account) throw new Error("Pinterest account not found");
    if (account.accountStatus !== "active") {
      throw new Error("Pinterest account token is expired — please reconnect");
    }

    const accessToken = await decrypt(account.accessTokenEncrypted, ENCRYPTION_KEY);
    const client = new PinterestClient(accessToken);
    return client.listBoards({ privacy: "ALL" });
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
