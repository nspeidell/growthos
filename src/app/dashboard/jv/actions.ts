"use server";

/**
 * JV Marketing & Referral Tracking — Server Actions
 *
 * Covers:
 *  - Partner CRUD (CRM)
 *  - Campaign CRUD
 *  - Tracking link generation (short_code, UTM params)
 *  - Analytics aggregation (clicks, conversions, revenue)
 *  - Partner Quality Score computation
 *  - Commission rules management
 *  - Payout tracking
 */

import { z } from "zod";
import { eq, and, desc, sql, gte, lte } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";
import { requirePermission } from "@/lib/auth/middleware";
import { getBindings } from "@/lib/cloudflare/bindings";
import { createDb } from "@/lib/db/client";
import {
  partners,
  partnerCampaigns,
  trackingLinks,
  referralVisits,
  attributedConversions,
  commissionRules,
  partnerPayouts,
  partnerQualitySnapshots,
} from "@/lib/db/schema";
import { safeAction, type ActionResult } from "@/lib/utils/api";
import type {
  Partner,
  PartnerCampaign,
  TrackingLink,
  AttributedConversion,
  CommissionRule,
  PartnerPayout,
} from "@/lib/db/schema";

// ═══════════════════════════════════════════
// Validation Schemas
// ═══════════════════════════════════════════

const PartnerSchema = z.object({
  name: z.string().min(1).max(120),
  email: z.string().email().optional().nullable(),
  companyName: z.string().max(120).optional().nullable(),
  partnerType: z.enum([
    "influencer",
    "podcast",
    "creator",
    "affiliate",
    "family_org",
    "church",
    "community",
    "media",
  ]),
  notes: z.string().max(2000).optional().nullable(),
  websiteUrl: z.string().url().optional().nullable(),
  socialHandle: z.string().max(100).optional().nullable(),
});

const CampaignSchema = z.object({
  partnerId: z.string().min(1),
  campaignName: z.string().min(1).max(120),
  campaignSlug: z
    .string()
    .regex(/^[a-z0-9-]+$/, "Only lowercase letters, numbers, and hyphens")
    .max(60)
    .optional()
    .nullable(),
  landingPageUrl: z.string().url(),
  expiresAt: z.string().datetime().optional().nullable(),
});

const TrackingLinkSchema = z.object({
  partnerId: z.string().min(1),
  campaignId: z.string().optional().nullable(),
  destinationUrl: z.string().url(),
  utmSource: z.string().max(100).optional().nullable(),
  utmMedium: z.string().max(100).optional().nullable(),
  utmCampaign: z.string().max(100).optional().nullable(),
  utmContent: z.string().max(100).optional().nullable(),
  attributionWindowDays: z.number().int().min(1).max(365).default(30),
});

const CommissionRuleSchema = z.object({
  partnerId: z.string().optional().nullable(),
  ruleType: z.enum(["flat_fee", "percentage", "tiered"]),
  value: z.number().min(0),
  conversionType: z.string().optional().nullable(),
  milestones: z.string().optional().nullable(), // JSON string
});

const PayoutSchema = z.object({
  partnerId: z.string().min(1),
  amount: z.number().positive(),
  payoutMethod: z
    .enum(["paypal", "bank", "stripe", "check", "crypto", "other"])
    .optional()
    .nullable(),
  payoutReference: z.string().max(200).optional().nullable(),
  note: z.string().max(500).optional().nullable(),
});

// ═══════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════

/**
 * Generate a unique 8-character alphanumeric short code.
 * Checks D1 for collision — retries up to 5 times.
 */
async function generateShortCode(db: ReturnType<typeof createDb>): Promise<string> {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  for (let attempt = 0; attempt < 5; attempt++) {
    const bytes = new Uint8Array(8);
    crypto.getRandomValues(bytes);
    const code = Array.from(bytes)
      .map((b) => chars[b % chars.length])
      .join("");
    const existing = await db
      .select({ id: trackingLinks.id })
      .from(trackingLinks)
      .where(eq(trackingLinks.shortCode, code))
      .get();
    if (!existing) return code;
  }
  throw new Error("Failed to generate unique short code — please try again");
}

// ═══════════════════════════════════════════
// Partner CRUD
// ═══════════════════════════════════════════

export async function listPartners(
  statusFilter?: "active" | "paused" | "archived"
): Promise<ActionResult<Partner[]>> {
  return safeAction(async () => {
    const session = await requirePermission("publish:queue");
    const { DB } = getBindings();
    const db = createDb(DB);

    const conditions = [eq(partners.workspaceId, session.workspaceId)];
    if (statusFilter) {
      conditions.push(eq(partners.status, statusFilter));
    }

    return db
      .select()
      .from(partners)
      .where(and(...conditions))
      .orderBy(desc(partners.createdAt))
      .all();
  });
}

export async function getPartner(
  partnerId: string
): Promise<ActionResult<Partner>> {
  return safeAction(async () => {
    const session = await requirePermission("publish:queue");
    const { DB } = getBindings();
    const db = createDb(DB);

    const partner = await db
      .select()
      .from(partners)
      .where(
        and(
          eq(partners.id, partnerId),
          eq(partners.workspaceId, session.workspaceId)
        )
      )
      .get();

    if (!partner) throw new Error("Partner not found");
    return partner;
  });
}

export async function createPartner(
  formData: FormData
): Promise<ActionResult<Partner>> {
  return safeAction(async () => {
    const session = await requirePermission("publish:queue");
    const { DB } = getBindings();
    const db = createDb(DB);

    const input = PartnerSchema.parse({
      name: formData.get("name"),
      email: formData.get("email") || null,
      companyName: formData.get("companyName") || null,
      partnerType: formData.get("partnerType") ?? "affiliate",
      notes: formData.get("notes") || null,
      websiteUrl: formData.get("websiteUrl") || null,
      socialHandle: formData.get("socialHandle") || null,
    });

    const now = new Date();
    const partner: typeof partners.$inferInsert = {
      id: createId(),
      workspaceId: session.workspaceId,
      ...input,
      qualityScore: 0,
      totalClicks: 0,
      totalSignups: 0,
      totalRevenue: 0,
      payoutOwed: 0,
      payoutPaid: 0,
      createdAt: now,
      updatedAt: now,
    };

    await db.insert(partners).values(partner);
    return partner as Partner;
  });
}

export async function updatePartner(
  partnerId: string,
  formData: FormData
): Promise<ActionResult<{ updated: boolean }>> {
  return safeAction(async () => {
    const session = await requirePermission("publish:queue");
    const { DB } = getBindings();
    const db = createDb(DB);

    const existing = await db
      .select({ id: partners.id })
      .from(partners)
      .where(
        and(
          eq(partners.id, partnerId),
          eq(partners.workspaceId, session.workspaceId)
        )
      )
      .get();

    if (!existing) throw new Error("Partner not found");

    const input = PartnerSchema.partial().parse({
      name: formData.get("name") || undefined,
      email: formData.get("email") || null,
      companyName: formData.get("companyName") || null,
      partnerType: formData.get("partnerType") || undefined,
      notes: formData.get("notes") || null,
      websiteUrl: formData.get("websiteUrl") || null,
      socialHandle: formData.get("socialHandle") || null,
      status: formData.get("status") || undefined,
    });

    await db
      .update(partners)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(partners.id, partnerId));

    return { updated: true };
  });
}

export async function archivePartner(
  partnerId: string
): Promise<ActionResult<{ archived: boolean }>> {
  return safeAction(async () => {
    const session = await requirePermission("publish:queue");
    const { DB } = getBindings();
    const db = createDb(DB);

    const existing = await db
      .select({ id: partners.id })
      .from(partners)
      .where(
        and(
          eq(partners.id, partnerId),
          eq(partners.workspaceId, session.workspaceId)
        )
      )
      .get();

    if (!existing) throw new Error("Partner not found");

    await db
      .update(partners)
      .set({ status: "archived", updatedAt: new Date() })
      .where(eq(partners.id, partnerId));

    return { archived: true };
  });
}

// ═══════════════════════════════════════════
// Campaign CRUD
// ═══════════════════════════════════════════

export async function listCampaigns(
  partnerId?: string
): Promise<ActionResult<PartnerCampaign[]>> {
  return safeAction(async () => {
    const session = await requirePermission("publish:queue");
    const { DB } = getBindings();
    const db = createDb(DB);

    const conditions = [eq(partnerCampaigns.workspaceId, session.workspaceId)];
    if (partnerId) {
      conditions.push(eq(partnerCampaigns.partnerId, partnerId));
    }

    return db
      .select()
      .from(partnerCampaigns)
      .where(and(...conditions))
      .orderBy(desc(partnerCampaigns.createdAt))
      .all();
  });
}

export async function createCampaign(
  formData: FormData
): Promise<ActionResult<PartnerCampaign>> {
  return safeAction(async () => {
    const session = await requirePermission("publish:queue");
    const { DB } = getBindings();
    const db = createDb(DB);

    const input = CampaignSchema.parse({
      partnerId: formData.get("partnerId"),
      campaignName: formData.get("campaignName"),
      campaignSlug: formData.get("campaignSlug") || null,
      landingPageUrl: formData.get("landingPageUrl"),
      expiresAt: formData.get("expiresAt") || null,
    });

    // Verify partner belongs to this workspace
    const partner = await db
      .select({ id: partners.id })
      .from(partners)
      .where(
        and(
          eq(partners.id, input.partnerId),
          eq(partners.workspaceId, session.workspaceId)
        )
      )
      .get();

    if (!partner) throw new Error("Partner not found");

    const campaign: typeof partnerCampaigns.$inferInsert = {
      id: createId(),
      workspaceId: session.workspaceId,
      partnerId: input.partnerId,
      campaignName: input.campaignName,
      campaignSlug: input.campaignSlug ?? null,
      landingPageUrl: input.landingPageUrl,
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
      status: "active",
      createdAt: new Date(),
    };

    await db.insert(partnerCampaigns).values(campaign);
    return campaign as PartnerCampaign;
  });
}

// ═══════════════════════════════════════════
// Tracking Links
// ═══════════════════════════════════════════

export async function listTrackingLinks(
  partnerId?: string
): Promise<ActionResult<TrackingLink[]>> {
  return safeAction(async () => {
    const session = await requirePermission("publish:queue");
    const { DB } = getBindings();
    const db = createDb(DB);

    const conditions = [eq(trackingLinks.workspaceId, session.workspaceId)];
    if (partnerId) {
      conditions.push(eq(trackingLinks.partnerId, partnerId));
    }

    return db
      .select()
      .from(trackingLinks)
      .where(and(...conditions))
      .orderBy(desc(trackingLinks.createdAt))
      .all();
  });
}

export async function createTrackingLink(
  formData: FormData
): Promise<ActionResult<TrackingLink & { shortUrl: string }>> {
  return safeAction(async () => {
    const session = await requirePermission("publish:queue");
    const { DB, APP_URL } = getBindings();
    const db = createDb(DB);

    const input = TrackingLinkSchema.parse({
      partnerId: formData.get("partnerId"),
      campaignId: formData.get("campaignId") || null,
      destinationUrl: formData.get("destinationUrl"),
      utmSource: formData.get("utmSource") || null,
      utmMedium: formData.get("utmMedium") || null,
      utmCampaign: formData.get("utmCampaign") || null,
      utmContent: formData.get("utmContent") || null,
      attributionWindowDays: parseInt(
        (formData.get("attributionWindowDays") as string) ?? "30"
      ),
    });

    // Verify partner belongs to this workspace
    const partner = await db
      .select({ id: partners.id })
      .from(partners)
      .where(
        and(
          eq(partners.id, input.partnerId),
          eq(partners.workspaceId, session.workspaceId)
        )
      )
      .get();

    if (!partner) throw new Error("Partner not found");

    const shortCode = await generateShortCode(db);

    const link: typeof trackingLinks.$inferInsert = {
      id: createId(),
      workspaceId: session.workspaceId,
      partnerId: input.partnerId,
      campaignId: input.campaignId ?? null,
      shortCode,
      destinationUrl: input.destinationUrl,
      utmSource: input.utmSource ?? null,
      utmMedium: input.utmMedium ?? null,
      utmCampaign: input.utmCampaign ?? null,
      utmContent: input.utmContent ?? null,
      attributionWindowDays: input.attributionWindowDays,
      clickCount: 0,
      uniqueClickCount: 0,
      createdAt: new Date(),
    };

    await db.insert(trackingLinks).values(link);

    const baseUrl = APP_URL ?? "https://growthos.pages.dev";
    const shortUrl = `${baseUrl}/r/${shortCode}`;

    return { ...(link as TrackingLink), shortUrl };
  });
}

// ═══════════════════════════════════════════
// Analytics
// ═══════════════════════════════════════════

export interface PartnerAnalyticsSummary {
  partner: Partner;
  clicks30d: number;
  conversions30d: number;
  revenue30d: number;
  pendingPayout: number;
  conversionRate: number; // percent, 2 decimal
  topLinks: Array<{
    id: string;
    shortCode: string;
    destinationUrl: string;
    clickCount: number | null;
    uniqueClickCount: number | null;
  }>;
}

export async function getPartnerAnalytics(
  partnerId: string
): Promise<ActionResult<PartnerAnalyticsSummary>> {
  return safeAction(async () => {
    const session = await requirePermission("publish:queue");
    const { DB } = getBindings();
    const db = createDb(DB);

    const partner = await db
      .select()
      .from(partners)
      .where(
        and(
          eq(partners.id, partnerId),
          eq(partners.workspaceId, session.workspaceId)
        )
      )
      .get();

    if (!partner) throw new Error("Partner not found");

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    // Clicks in last 30 days
    const clicksResult = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(referralVisits)
      .where(
        and(
          eq(referralVisits.partnerId, partnerId),
          gte(referralVisits.createdAt, thirtyDaysAgo)
        )
      )
      .get();

    // Conversions in last 30 days
    const conversionsResult = await db
      .select({
        count: sql<number>`COUNT(*)`,
        revenue: sql<number>`COALESCE(SUM(conversion_value), 0)`,
      })
      .from(attributedConversions)
      .where(
        and(
          eq(attributedConversions.partnerId, partnerId),
          eq(attributedConversions.workspaceId, session.workspaceId),
          gte(attributedConversions.createdAt, thirtyDaysAgo)
        )
      )
      .get();

    const clicks30d = clicksResult?.count ?? 0;
    const conversions30d = conversionsResult?.count ?? 0;
    const revenue30d = conversionsResult?.revenue ?? 0;
    const conversionRate =
      clicks30d > 0 ? parseFloat(((conversions30d / clicks30d) * 100).toFixed(2)) : 0;

    // Top 5 links by click count
    const topLinks = await db
      .select({
        id: trackingLinks.id,
        shortCode: trackingLinks.shortCode,
        destinationUrl: trackingLinks.destinationUrl,
        clickCount: trackingLinks.clickCount,
        uniqueClickCount: trackingLinks.uniqueClickCount,
      })
      .from(trackingLinks)
      .where(
        and(
          eq(trackingLinks.partnerId, partnerId),
          eq(trackingLinks.workspaceId, session.workspaceId)
        )
      )
      .orderBy(desc(trackingLinks.clickCount))
      .limit(5)
      .all();

    return {
      partner,
      clicks30d,
      conversions30d,
      revenue30d,
      pendingPayout: partner.payoutOwed ?? 0,
      conversionRate,
      topLinks,
    };
  });
}

export interface WorkspaceJvSummary {
  totalPartners: number;
  activePartners: number;
  totalClicks30d: number;
  totalConversions30d: number;
  totalRevenue30d: number;
  totalPayoutOwed: number;
  topPartners: Partner[];
}

export async function getWorkspaceJvSummary(): Promise<
  ActionResult<WorkspaceJvSummary>
> {
  return safeAction(async () => {
    const session = await requirePermission("publish:queue");
    const { DB } = getBindings();
    const db = createDb(DB);

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [totalRes, activeRes, clicksRes, convsRes, payoutRes] =
      await Promise.all([
        db
          .select({ count: sql<number>`COUNT(*)` })
          .from(partners)
          .where(eq(partners.workspaceId, session.workspaceId))
          .get(),
        db
          .select({ count: sql<number>`COUNT(*)` })
          .from(partners)
          .where(
            and(
              eq(partners.workspaceId, session.workspaceId),
              eq(partners.status, "active")
            )
          )
          .get(),
        db
          .select({ count: sql<number>`COUNT(*)` })
          .from(referralVisits)
          .innerJoin(
            trackingLinks,
            eq(referralVisits.trackingLinkId, trackingLinks.id)
          )
          .where(
            and(
              eq(trackingLinks.workspaceId, session.workspaceId),
              gte(referralVisits.createdAt, thirtyDaysAgo)
            )
          )
          .get(),
        db
          .select({
            count: sql<number>`COUNT(*)`,
            revenue: sql<number>`COALESCE(SUM(conversion_value), 0)`,
          })
          .from(attributedConversions)
          .where(
            and(
              eq(attributedConversions.workspaceId, session.workspaceId),
              gte(attributedConversions.createdAt, thirtyDaysAgo)
            )
          )
          .get(),
        db
          .select({ total: sql<number>`COALESCE(SUM(payout_owed), 0)` })
          .from(partners)
          .where(eq(partners.workspaceId, session.workspaceId))
          .get(),
      ]);

    const topPartners = await db
      .select()
      .from(partners)
      .where(
        and(
          eq(partners.workspaceId, session.workspaceId),
          eq(partners.status, "active")
        )
      )
      .orderBy(desc(partners.totalRevenue))
      .limit(5)
      .all();

    return {
      totalPartners: totalRes?.count ?? 0,
      activePartners: activeRes?.count ?? 0,
      totalClicks30d: clicksRes?.count ?? 0,
      totalConversions30d: convsRes?.count ?? 0,
      totalRevenue30d: convsRes?.revenue ?? 0,
      totalPayoutOwed: payoutRes?.total ?? 0,
      topPartners,
    };
  });
}

// ═══════════════════════════════════════════
// Partner Quality Score
// ═══════════════════════════════════════════

/**
 * Compute and store a quality score snapshot for a partner.
 *
 * Scoring formula (all components 0–100, weighted):
 *   - Retention (30-day user retention):       30%
 *   - Activation depth (family members/signup): 25%
 *   - Referral propagation (downstream referrals): 20%
 *   - Conversion rate (click → signup):        15%
 *   - Inverse churn (1 - churn_rate):          10%
 *
 * The composite score is stored in partner_quality_snapshots AND
 * denormalized to partners.quality_score for fast queries.
 */
export async function computePartnerQualityScore(
  partnerId: string
): Promise<ActionResult<{ qualityScore: number }>> {
  return safeAction(async () => {
    const session = await requirePermission("publish:queue");
    const { DB } = getBindings();
    const db = createDb(DB);

    const partner = await db
      .select()
      .from(partners)
      .where(
        and(
          eq(partners.id, partnerId),
          eq(partners.workspaceId, session.workspaceId)
        )
      )
      .get();

    if (!partner) throw new Error("Partner not found");

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    // Signups in last 30d from this partner
    const signupsRes = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(attributedConversions)
      .where(
        and(
          eq(attributedConversions.partnerId, partnerId),
          eq(attributedConversions.workspaceId, session.workspaceId),
          eq(attributedConversions.conversionType, "signup"),
          gte(attributedConversions.createdAt, thirtyDaysAgo)
        )
      )
      .get();

    // Family activations (proxy for activation depth)
    const activationsRes = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(attributedConversions)
      .where(
        and(
          eq(attributedConversions.partnerId, partnerId),
          eq(attributedConversions.workspaceId, session.workspaceId),
          eq(attributedConversions.conversionType, "family_activation"),
          gte(attributedConversions.createdAt, thirtyDaysAgo)
        )
      )
      .get();

    // Downstream referrals (family_invite conversions)
    const referralsRes = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(attributedConversions)
      .where(
        and(
          eq(attributedConversions.partnerId, partnerId),
          eq(attributedConversions.workspaceId, session.workspaceId),
          eq(attributedConversions.conversionType, "family_invite"),
          gte(attributedConversions.createdAt, thirtyDaysAgo)
        )
      )
      .get();

    // Clicks in last 30d (for conversion rate)
    const clicksRes = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(referralVisits)
      .where(
        and(
          eq(referralVisits.partnerId, partnerId),
          gte(referralVisits.createdAt, thirtyDaysAgo)
        )
      )
      .get();

    const signups30d = signupsRes?.count ?? 0;
    const activations30d = activationsRes?.count ?? 0;
    const referrals30d = referralsRes?.count ?? 0;
    const clicks30d = clicksRes?.count ?? 0;

    // Score components (normalize to 0–100)
    // Retention: confirmed conversions / total signups (capped at 100)
    const retentionScore = signups30d > 0
      ? Math.min((activations30d / signups30d) * 100, 100)
      : 0;

    // Activation depth: avg activations per signup (target: 3 = 100)
    const activationScore = signups30d > 0
      ? Math.min((activations30d / signups30d / 3) * 100, 100)
      : 0;

    // Referral propagation: avg referrals per signup (target: 1 = 100)
    const referralScore = signups30d > 0
      ? Math.min((referrals30d / signups30d) * 100, 100)
      : 0;

    // Conversion rate: signups / clicks (target: 5% = 100)
    const conversionRateScore = clicks30d > 0
      ? Math.min((signups30d / clicks30d / 0.05) * 100, 100)
      : 0;

    // Churn: use confirmed vs total (lower churn = higher score)
    const confirmedRes = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(attributedConversions)
      .where(
        and(
          eq(attributedConversions.partnerId, partnerId),
          eq(attributedConversions.workspaceId, session.workspaceId),
          eq(attributedConversions.status, "confirmed"),
          gte(attributedConversions.createdAt, thirtyDaysAgo)
        )
      )
      .get();

    const confirmed30d = confirmedRes?.count ?? 0;
    const churnScore = signups30d > 0
      ? Math.min((confirmed30d / signups30d) * 100, 100)
      : 50; // No data → neutral

    // Weighted composite
    const qualityScore =
      retentionScore * 0.3 +
      activationScore * 0.25 +
      referralScore * 0.2 +
      conversionRateScore * 0.15 +
      churnScore * 0.1;

    const roundedScore = parseFloat(qualityScore.toFixed(1));
    const now = new Date();

    // Store snapshot
    await db.insert(partnerQualitySnapshots).values({
      id: createId(),
      partnerId,
      workspaceId: session.workspaceId,
      retentionScore: parseFloat(retentionScore.toFixed(1)),
      activationScore: parseFloat(activationScore.toFixed(1)),
      referralScore: parseFloat(referralScore.toFixed(1)),
      conversionRateScore: parseFloat(conversionRateScore.toFixed(1)),
      churnScore: parseFloat(churnScore.toFixed(1)),
      qualityScore: roundedScore,
      signups30d,
      activeUsers30d: activations30d,
      snapshotAt: now,
    });

    // Denormalize to partners table
    await db
      .update(partners)
      .set({ qualityScore: roundedScore, updatedAt: now })
      .where(eq(partners.id, partnerId));

    return { qualityScore: roundedScore };
  });
}

// ═══════════════════════════════════════════
// Commission Rules
// ═══════════════════════════════════════════

export async function listCommissionRules(
  partnerId?: string
): Promise<ActionResult<CommissionRule[]>> {
  return safeAction(async () => {
    const session = await requirePermission("publish:queue");
    const { DB } = getBindings();
    const db = createDb(DB);

    const conditions = [eq(commissionRules.workspaceId, session.workspaceId)];
    if (partnerId !== undefined) {
      // null = workspace default rules, string = partner-specific
      if (partnerId === null || partnerId === "default") {
        conditions.push(sql`${commissionRules.partnerId} IS NULL`);
      } else {
        conditions.push(eq(commissionRules.partnerId, partnerId));
      }
    }

    return db
      .select()
      .from(commissionRules)
      .where(and(...conditions))
      .orderBy(desc(commissionRules.createdAt))
      .all();
  });
}

export async function createCommissionRule(
  formData: FormData
): Promise<ActionResult<CommissionRule>> {
  return safeAction(async () => {
    const session = await requirePermission("publish:queue");
    const { DB } = getBindings();
    const db = createDb(DB);

    const input = CommissionRuleSchema.parse({
      partnerId: formData.get("partnerId") || null,
      ruleType: formData.get("ruleType"),
      value: parseFloat(formData.get("value") as string),
      conversionType: formData.get("conversionType") || null,
      milestones: formData.get("milestones") || null,
    });

    const rule: typeof commissionRules.$inferInsert = {
      id: createId(),
      workspaceId: session.workspaceId,
      partnerId: input.partnerId ?? null,
      ruleType: input.ruleType,
      value: input.value,
      conversionType: input.conversionType ?? null,
      milestones: input.milestones ?? null,
      isActive: true,
      createdAt: new Date(),
    };

    await db.insert(commissionRules).values(rule);
    return rule as CommissionRule;
  });
}

// ═══════════════════════════════════════════
// Payouts
// ═══════════════════════════════════════════

export async function listPayouts(
  partnerId?: string,
  status?: "pending" | "paid" | "failed"
): Promise<ActionResult<PartnerPayout[]>> {
  return safeAction(async () => {
    const session = await requirePermission("publish:queue");
    const { DB } = getBindings();
    const db = createDb(DB);

    const conditions = [eq(partnerPayouts.workspaceId, session.workspaceId)];
    if (partnerId) conditions.push(eq(partnerPayouts.partnerId, partnerId));
    if (status) conditions.push(eq(partnerPayouts.status, status));

    return db
      .select()
      .from(partnerPayouts)
      .where(and(...conditions))
      .orderBy(desc(partnerPayouts.createdAt))
      .all();
  });
}

export async function createPayout(
  formData: FormData
): Promise<ActionResult<PartnerPayout>> {
  return safeAction(async () => {
    const session = await requirePermission("publish:queue");
    const { DB } = getBindings();
    const db = createDb(DB);

    const input = PayoutSchema.parse({
      partnerId: formData.get("partnerId"),
      amount: parseFloat(formData.get("amount") as string),
      payoutMethod: formData.get("payoutMethod") || null,
      payoutReference: formData.get("payoutReference") || null,
      note: formData.get("note") || null,
    });

    // Verify partner belongs to this workspace
    const partner = await db
      .select({ id: partners.id, payoutOwed: partners.payoutOwed })
      .from(partners)
      .where(
        and(
          eq(partners.id, input.partnerId),
          eq(partners.workspaceId, session.workspaceId)
        )
      )
      .get();

    if (!partner) throw new Error("Partner not found");

    const now = new Date();
    const payout: typeof partnerPayouts.$inferInsert = {
      id: createId(),
      workspaceId: session.workspaceId,
      partnerId: input.partnerId,
      amount: input.amount,
      payoutMethod: input.payoutMethod ?? null,
      payoutReference: input.payoutReference ?? null,
      status: "pending",
      note: input.note ?? null,
      paidAt: null,
      createdAt: now,
    };

    await db.insert(partnerPayouts).values(payout);

    return payout as PartnerPayout;
  });
}

export async function markPayoutPaid(
  payoutId: string,
  reference?: string
): Promise<ActionResult<{ paid: boolean }>> {
  return safeAction(async () => {
    const session = await requirePermission("publish:queue");
    const { DB } = getBindings();
    const db = createDb(DB);

    const payout = await db
      .select()
      .from(partnerPayouts)
      .where(
        and(
          eq(partnerPayouts.id, payoutId),
          eq(partnerPayouts.workspaceId, session.workspaceId)
        )
      )
      .get();

    if (!payout) throw new Error("Payout not found");
    if (payout.status === "paid") throw new Error("Payout already marked as paid");

    const now = new Date();

    await Promise.all([
      db
        .update(partnerPayouts)
        .set({
          status: "paid",
          paidAt: now,
          payoutReference: reference ?? payout.payoutReference,
        })
        .where(eq(partnerPayouts.id, payoutId)),

      // Decrement payout_owed and increment payout_paid on the partner
      db
        .update(partners)
        .set({
          payoutOwed: sql`MAX(0, payout_owed - ${payout.amount})`,
          payoutPaid: sql`payout_paid + ${payout.amount}`,
          updatedAt: now,
        })
        .where(eq(partners.id, payout.partnerId)),
    ]);

    return { paid: true };
  });
}

// ═══════════════════════════════════════════
// Conversion Attribution (for use by Reunion webhook / signup flow)
// ═══════════════════════════════════════════

/**
 * Record a conversion event attributed to a partner via the attribution cookie.
 * Called by the Reunion webhook when a new user signs up.
 *
 * @param cookieValue - Raw JSON string from the gos_attr cookie
 * @param conversionType - Type of conversion event
 * @param conversionValue - Revenue in USD (optional)
 * @param userId - GrowthOS user ID (optional)
 */
export async function recordConversion(
  cookieValue: string,
  conversionType: AttributedConversion["conversionType"],
  conversionValue: number = 0,
  userId?: string
): Promise<ActionResult<AttributedConversion>> {
  return safeAction(async () => {
    // Parse cookie
    let cookie: {
      partner_id: string;
      tracking_link_id: string;
      workspace_id: string;
      campaign_id?: string | null;
      timestamp: number;
      first_touch?: { partner_id: string; tracking_link_id: string; timestamp: number } | null;
    };
    try {
      cookie = JSON.parse(cookieValue);
    } catch {
      throw new Error("Invalid attribution cookie");
    }

    if (!cookie.partner_id || !cookie.tracking_link_id || !cookie.workspace_id) {
      throw new Error("Malformed attribution cookie — missing required fields");
    }

    const { DB } = getBindings();
    const db = createDb(DB);

    // Verify the tracking link + partner exist
    const link = await db
      .select({ id: trackingLinks.id })
      .from(trackingLinks)
      .where(eq(trackingLinks.id, cookie.tracking_link_id))
      .get();

    if (!link) throw new Error("Attribution link not found");

    // Look up the applicable commission rule
    const rule = await db
      .select()
      .from(commissionRules)
      .where(
        and(
          eq(commissionRules.workspaceId, cookie.workspace_id),
          eq(commissionRules.isActive, true)
        )
      )
      .get();

    let commissionAmount = 0;
    if (rule) {
      if (rule.ruleType === "flat_fee") {
        commissionAmount = rule.value;
      } else if (rule.ruleType === "percentage") {
        commissionAmount = conversionValue * rule.value;
      }
    }

    // Build attribution chain: include first_touch if different from last_touch
    const attributionChain =
      cookie.first_touch &&
      cookie.first_touch.tracking_link_id !== cookie.tracking_link_id
        ? JSON.stringify([
            {
              source: "first_touch",
              tracking_link_id: cookie.first_touch.tracking_link_id,
              partner_id: cookie.first_touch.partner_id,
              timestamp: cookie.first_touch.timestamp,
            },
            {
              source: "last_touch",
              tracking_link_id: cookie.tracking_link_id,
              partner_id: cookie.partner_id,
              timestamp: cookie.timestamp,
            },
          ])
        : null;

    const now = new Date();
    const conversion: typeof attributedConversions.$inferInsert = {
      id: createId(),
      trackingLinkId: cookie.tracking_link_id,
      partnerId: cookie.partner_id,
      workspaceId: cookie.workspace_id,
      conversionType,
      conversionValue,
      userId: userId ?? null,
      attributionChain,
      status: "pending",
      confirmationDays: 14,
      confirmedAt: null,
      commissionAmount,
      createdAt: now,
    };

    await db.insert(attributedConversions).values(conversion);

    // Update partner aggregate totals
    await db
      .update(partners)
      .set({
        totalSignups: sql`total_signups + 1`,
        totalRevenue: sql`total_revenue + ${conversionValue}`,
        payoutOwed: sql`payout_owed + ${commissionAmount}`,
        updatedAt: now,
      })
      .where(eq(partners.id, cookie.partner_id));

    return conversion as AttributedConversion;
  });
}
