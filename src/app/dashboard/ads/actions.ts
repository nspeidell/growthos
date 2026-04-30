"use server";

import { z } from "zod";
import { eq, and, desc } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";
import { requirePermission } from "@/lib/auth/middleware";
import { getBindings } from "@/lib/cloudflare/bindings";
import { createDb } from "@/lib/db/client";
import { adCampaigns, adVariants } from "@/lib/db/schema";
import { safeAction, type ActionResult } from "@/lib/utils/api";
import type { AdCampaign, AdVariant } from "@/lib/db/schema";

// ─── Validation ───

const CreateCampaignSchema = z.object({
  name: z.string().min(1).max(200),
  platform: z.enum(["meta", "google", "x"]),
  objective: z.enum([
    "awareness",
    "traffic",
    "engagement",
    "conversions",
    "app_installs",
  ]),
  budgetDaily: z.coerce.number().min(0).optional(),
  budgetTotal: z.coerce.number().min(0).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  targeting: z.string().optional(), // JSON
  creativeAssetId: z.string().optional(),
});

const CreateVariantSchema = z.object({
  campaignId: z.string().min(1),
  headline: z.string().min(1).max(200),
  body: z.string().min(1).max(2000),
  ctaText: z.string().max(50).optional(),
  landingUrl: z.string().url().optional().or(z.literal("")),
  imageR2Key: z.string().optional(),
});

// ─── Types ───

export interface CampaignWithVariants extends AdCampaign {
  variants: AdVariant[];
}

// ─── List Campaigns ───

export async function listCampaigns(): Promise<
  ActionResult<CampaignWithVariants[]>
> {
  return safeAction(async () => {
    const session = await requirePermission("content:write");
    const { DB } = getBindings();
    const db = createDb(DB);

    const campaigns = await db
      .select()
      .from(adCampaigns)
      .where(eq(adCampaigns.workspaceId, session.workspaceId))
      .orderBy(desc(adCampaigns.createdAt))
      .all();

    const result: CampaignWithVariants[] = [];

    for (const campaign of campaigns) {
      const variants = await db
        .select()
        .from(adVariants)
        .where(eq(adVariants.campaignId, campaign.id))
        .all();

      result.push({ ...campaign, variants });
    }

    return result;
  });
}

// ─── Create Campaign ───

export async function createCampaign(
  formData: FormData
): Promise<ActionResult<AdCampaign>> {
  return safeAction(async () => {
    const session = await requirePermission("content:write");
    const { DB } = getBindings();
    const db = createDb(DB);

    const input = CreateCampaignSchema.parse({
      name: formData.get("name"),
      platform: formData.get("platform"),
      objective: formData.get("objective"),
      budgetDaily: formData.get("budgetDaily") || undefined,
      budgetTotal: formData.get("budgetTotal") || undefined,
      startDate: formData.get("startDate") || undefined,
      endDate: formData.get("endDate") || undefined,
      targeting: formData.get("targeting") || undefined,
      creativeAssetId: formData.get("creativeAssetId") || undefined,
    });

    const id = createId();
    const now = new Date();

    await db.insert(adCampaigns).values({
      id,
      workspaceId: session.workspaceId,
      platform: input.platform,
      name: input.name,
      objective: input.objective,
      campaignStatus: "draft",
      budgetDaily: input.budgetDaily ?? null,
      budgetTotal: input.budgetTotal ?? null,
      startDate: input.startDate ? new Date(input.startDate) : null,
      endDate: input.endDate ? new Date(input.endDate) : null,
      targeting: input.targeting ?? null,
      creativeAssetId: input.creativeAssetId ?? null,
      createdAt: now,
      updatedAt: now,
    });

    const campaign = await db
      .select()
      .from(adCampaigns)
      .where(eq(adCampaigns.id, id))
      .get();

    return campaign!;
  });
}

// ─── Update Campaign Status ───

export async function updateCampaignStatus(
  campaignId: string,
  status: "draft" | "active" | "paused" | "completed" | "archived"
): Promise<ActionResult<{ updated: boolean }>> {
  return safeAction(async () => {
    const session = await requirePermission("content:write");
    const { DB } = getBindings();
    const db = createDb(DB);

    const existing = await db
      .select()
      .from(adCampaigns)
      .where(
        and(
          eq(adCampaigns.id, campaignId),
          eq(adCampaigns.workspaceId, session.workspaceId)
        )
      )
      .get();

    if (!existing) throw new Error("Campaign not found");

    await db
      .update(adCampaigns)
      .set({ campaignStatus: status, updatedAt: new Date() })
      .where(eq(adCampaigns.id, campaignId));

    return { updated: true };
  });
}

// ─── Create Ad Variant ───

export async function createVariant(
  formData: FormData
): Promise<ActionResult<AdVariant>> {
  return safeAction(async () => {
    await requirePermission("content:write");
    const { DB } = getBindings();
    const db = createDb(DB);

    const input = CreateVariantSchema.parse({
      campaignId: formData.get("campaignId"),
      headline: formData.get("headline"),
      body: formData.get("body"),
      ctaText: formData.get("ctaText") || undefined,
      landingUrl: formData.get("landingUrl") || undefined,
      imageR2Key: formData.get("imageR2Key") || undefined,
    });

    const id = createId();
    await db.insert(adVariants).values({
      id,
      campaignId: input.campaignId,
      headline: input.headline,
      body: input.body,
      ctaText: input.ctaText ?? null,
      landingUrl: input.landingUrl || null,
      imageR2Key: input.imageR2Key ?? null,
      isWinner: false,
    });

    const variant = await db
      .select()
      .from(adVariants)
      .where(eq(adVariants.id, id))
      .get();

    return variant!;
  });
}

// ─── Delete Campaign ───

export async function deleteCampaign(
  campaignId: string
): Promise<ActionResult<{ deleted: boolean }>> {
  return safeAction(async () => {
    const session = await requirePermission("content:write");
    const { DB } = getBindings();
    const db = createDb(DB);

    const existing = await db
      .select()
      .from(adCampaigns)
      .where(
        and(
          eq(adCampaigns.id, campaignId),
          eq(adCampaigns.workspaceId, session.workspaceId)
        )
      )
      .get();

    if (!existing) throw new Error("Campaign not found");

    await db.delete(adCampaigns).where(eq(adCampaigns.id, campaignId));
    return { deleted: true };
  });
}
