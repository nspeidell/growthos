"use server";

import { z } from "zod";
import { eq, and, desc } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";
import { requirePermission } from "@/lib/auth/middleware";
import { getBindings } from "@/lib/cloudflare/bindings";
import { createDb } from "@/lib/db/client";
import { adCampaigns, adVariants } from "@/lib/db/schema";
import { safeAction, type ActionResult } from "@/lib/utils/api";
import { generateWithClaude } from "@/lib/ai/claude";
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

// ─── Mark Variant Winner ───

export async function markVariantWinner(
  variantId: string,
  campaignId: string
): Promise<ActionResult<{ updated: boolean }>> {
  return safeAction(async () => {
    const session = await requirePermission("content:write");
    const { DB } = getBindings();
    const db = createDb(DB);

    // Verify campaign ownership
    const campaign = await db
      .select()
      .from(adCampaigns)
      .where(
        and(
          eq(adCampaigns.id, campaignId),
          eq(adCampaigns.workspaceId, session.workspaceId)
        )
      )
      .get();

    if (!campaign) throw new Error("Campaign not found");

    // Clear all winners for this campaign first
    await db
      .update(adVariants)
      .set({ isWinner: false })
      .where(eq(adVariants.campaignId, campaignId));

    // Mark the selected variant as winner
    await db
      .update(adVariants)
      .set({ isWinner: true })
      .where(eq(adVariants.id, variantId));

    return { updated: true };
  });
}

// ─── Generate Ad Copy (AI) ───

export interface GeneratedAdCopy {
  headline: string;
  body: string;
  ctaText: string;
}

export async function generateAdCopy(
  campaignId: string
): Promise<ActionResult<GeneratedAdCopy[]>> {
  return safeAction(async () => {
    const session = await requirePermission("content:write");
    const { DB } = getBindings();
    const db = createDb(DB);

    const campaign = await db
      .select()
      .from(adCampaigns)
      .where(
        and(
          eq(adCampaigns.id, campaignId),
          eq(adCampaigns.workspaceId, session.workspaceId)
        )
      )
      .get();

    if (!campaign) throw new Error("Campaign not found");

    const platformMap: Record<string, string> = {
      meta: "Meta (Facebook/Instagram)",
      google: "Google Ads",
      x: "X (Twitter)",
    };

    const objectiveMap: Record<string, string> = {
      awareness: "brand awareness",
      traffic: "driving website traffic",
      engagement: "social media engagement",
      conversions: "conversions and sales",
      app_installs: "app installs",
    };

    const raw = await generateWithClaude({
      systemPrompt: `You are a direct-response advertising copywriter. Generate 3 distinct ad variants for the given platform and objective. Return ONLY valid JSON (no markdown) — an array of exactly 3 objects, each with:
{
  "headline": "Headline (max 40 chars for Meta/X, 30 for Google)",
  "body": "Body copy (1-3 sentences, conversational, benefit-driven)",
  "ctaText": "CTA button text (2-4 words)"
}

Rules:
- Each variant must use a different angle (emotional, logical, social proof)
- Be specific, not generic
- Match the platform's tone (Meta: casual/visual, Google: intent-driven/direct, X: punchy/conversational)`,
      userMessage: `Platform: ${platformMap[campaign.platform] ?? campaign.platform}
Objective: ${objectiveMap[campaign.objective] ?? campaign.objective}
Campaign: "${campaign.name}"
${campaign.targeting ? `Targeting context: ${campaign.targeting}` : ""}`,
      maxTokens: 1024,
      temperature: 0.8,
    });

    const jsonMatch = raw.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error("AI did not return valid JSON array");

    const variants = JSON.parse(jsonMatch[0]) as GeneratedAdCopy[];
    return variants.slice(0, 3);
  });
}
