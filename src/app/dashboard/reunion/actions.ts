"use server";

import { z } from "zod";
import { eq, desc } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";
import { requirePermission } from "@/lib/auth/middleware";
import { getBindings } from "@/lib/cloudflare/bindings";
import { createDb } from "@/lib/db/client";
import { reunionCampaigns } from "@/lib/db/schema";
import { safeAction, type ActionResult } from "@/lib/utils/api";
import { ReunionClient } from "@/lib/reunion/client";
import type { ReunionCampaign } from "@/lib/db/schema";
import type { ReunionUserStats } from "@/lib/reunion/client";

// ─── Validation ───

const CreateReunionCampaignSchema = z.object({
  name: z.string().min(1).max(200),
  type: z.enum([
    "push",
    "invite_reminder",
    "reactivation",
    "announcement",
    "onboarding",
  ]),
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(2000),
  cta: z.string().max(50).optional(),
  deeplink: z.string().optional(),
  segmentType: z.enum(["all", "active", "inactive", "new", "custom"]).default("all"),
  inactiveDays: z.coerce.number().min(1).optional(),
  scheduledFor: z.string().optional(),
});

// ─── List Campaigns ───

export async function listReunionCampaigns(): Promise<
  ActionResult<ReunionCampaign[]>
> {
  return safeAction(async () => {
    const session = await requirePermission("content:write");
    const { DB } = getBindings();
    const db = createDb(DB);

    return db
      .select()
      .from(reunionCampaigns)
      .where(eq(reunionCampaigns.workspaceId, session.workspaceId))
      .orderBy(desc(reunionCampaigns.createdAt))
      .all();
  });
}

// ─── Create Campaign ───

export async function createReunionCampaign(
  formData: FormData
): Promise<ActionResult<ReunionCampaign>> {
  return safeAction(async () => {
    const session = await requirePermission("content:write");
    const { DB } = getBindings();
    const db = createDb(DB);

    const input = CreateReunionCampaignSchema.parse({
      name: formData.get("name"),
      type: formData.get("type"),
      title: formData.get("title"),
      body: formData.get("body"),
      cta: formData.get("cta") || undefined,
      deeplink: formData.get("deeplink") || undefined,
      segmentType: formData.get("segmentType") || "all",
      inactiveDays: formData.get("inactiveDays") || undefined,
      scheduledFor: formData.get("scheduledFor") || undefined,
    });

    const id = createId();

    const content = JSON.stringify({
      title: input.title,
      body: input.body,
      cta: input.cta,
      deeplink: input.deeplink,
    });

    const segment = JSON.stringify({
      type: input.segmentType,
      inactiveDays: input.inactiveDays,
    });

    await db.insert(reunionCampaigns).values({
      id,
      workspaceId: session.workspaceId,
      type: input.type,
      name: input.name,
      segment,
      content,
      campaignStatus: "draft",
      scheduledFor: input.scheduledFor
        ? new Date(input.scheduledFor)
        : null,
      createdAt: new Date(),
    });

    const campaign = await db
      .select()
      .from(reunionCampaigns)
      .where(eq(reunionCampaigns.id, id))
      .get();

    return campaign!;
  });
}

// ─── Send Campaign ───

export async function sendReunionCampaign(
  campaignId: string
): Promise<ActionResult<{ sent: boolean; sentCount: number }>> {
  return safeAction(async () => {
    const session = await requirePermission("content:write");
    const env = getBindings();
    const db = createDb(env.DB);

    const campaign = await db
      .select()
      .from(reunionCampaigns)
      .where(eq(reunionCampaigns.id, campaignId))
      .get();

    if (!campaign) throw new Error("Campaign not found");
    if (campaign.workspaceId !== session.workspaceId) {
      throw new Error("Campaign not found");
    }
    if (campaign.campaignStatus !== "draft") {
      throw new Error("Campaign is not in draft status");
    }

    const content = JSON.parse(campaign.content ?? "{}") as {
      title?: string;
      body?: string;
      cta?: string;
      deeplink?: string;
    };

    const segment = JSON.parse(campaign.segment ?? "{}") as {
      type?: string;
      inactiveDays?: number;
    };

    const client = new ReunionClient(env.REUNION_API_URL, env.REUNION_API_KEY);

    let result;

    switch (campaign.type) {
      case "invite_reminder":
        result = await client.sendInviteReminders({
          campaignId: campaign.id,
          title: content.title ?? campaign.name,
          body: content.body ?? "",
        });
        break;

      case "reactivation":
        result = await client.sendReactivation({
          campaignId: campaign.id,
          title: content.title ?? campaign.name,
          body: content.body ?? "",
          inactiveDays: segment.inactiveDays ?? 30,
          deeplink: content.deeplink,
        });
        break;

      default:
        result = await client.sendPushCampaign({
          campaignId: campaign.id,
          title: content.title ?? campaign.name,
          body: content.body ?? "",
          cta: content.cta,
          deeplink: content.deeplink,
          segment: {
            type: (segment.type as "all" | "active" | "inactive" | "new" | "custom") ?? "all",
            inactiveDays: segment.inactiveDays,
          },
        });
        break;
    }

    // Update campaign status
    await db
      .update(reunionCampaigns)
      .set({
        campaignStatus: "active",
        sentCount: result.sentCount,
      })
      .where(eq(reunionCampaigns.id, campaignId));

    return { sent: true, sentCount: result.sentCount };
  });
}

// ─── Sync Stats ───

export async function syncReunionCampaignStats(
  campaignId: string
): Promise<ActionResult<{ synced: boolean }>> {
  return safeAction(async () => {
    const session = await requirePermission("content:write");
    const env = getBindings();
    const db = createDb(env.DB);

    const campaign = await db
      .select()
      .from(reunionCampaigns)
      .where(eq(reunionCampaigns.id, campaignId))
      .get();

    if (!campaign) throw new Error("Campaign not found");
    if (campaign.workspaceId !== session.workspaceId) {
      throw new Error("Campaign not found");
    }

    const client = new ReunionClient(env.REUNION_API_URL, env.REUNION_API_KEY);
    const stats = await client.getCampaignStats(campaignId);

    await db
      .update(reunionCampaigns)
      .set({
        sentCount: stats.sentCount,
        openedCount: stats.openedCount,
        clickedCount: stats.clickedCount,
      })
      .where(eq(reunionCampaigns.id, campaignId));

    return { synced: true };
  });
}

// ─── Get Reunion User Stats ───

export async function getReunionUserStats(): Promise<
  ActionResult<ReunionUserStats>
> {
  return safeAction(async () => {
    await requirePermission("content:write");
    const env = getBindings();

    const client = new ReunionClient(env.REUNION_API_URL, env.REUNION_API_KEY);
    return client.getUserStats();
  });
}

// ─── Delete Campaign ───

export async function deleteReunionCampaign(
  campaignId: string
): Promise<ActionResult<{ deleted: boolean }>> {
  return safeAction(async () => {
    const session = await requirePermission("content:write");
    const { DB } = getBindings();
    const db = createDb(DB);

    const campaign = await db
      .select()
      .from(reunionCampaigns)
      .where(eq(reunionCampaigns.id, campaignId))
      .get();

    if (!campaign) throw new Error("Campaign not found");
    if (campaign.workspaceId !== session.workspaceId) {
      throw new Error("Campaign not found");
    }

    await db
      .delete(reunionCampaigns)
      .where(eq(reunionCampaigns.id, campaignId));

    return { deleted: true };
  });
}
