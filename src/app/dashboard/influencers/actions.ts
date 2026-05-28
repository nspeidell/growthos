"use server";

import { z } from "zod";
import { eq, and, desc, sql } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";
import { requirePermission } from "@/lib/auth/middleware";
import { getBindings } from "@/lib/cloudflare/bindings";
import { createDb } from "@/lib/db/client";
import { safeAction, type ActionResult } from "@/lib/utils/api";
import { generateWithClaude } from "@/lib/ai/claude";

// ─── Raw D1 helpers (tables not yet in drizzle schema) ───

function db() {
  const { DB } = getBindings();
  return createDb(DB);
}

function rawDb() {
  const { DB } = getBindings();
  return DB;
}

// ─── Types ───

export interface Influencer {
  id: string;
  workspaceId: string;
  name: string;
  handle: string;
  platform: string;
  profileUrl: string | null;
  avatarUrl: string | null;
  email: string | null;
  location: string | null;
  followerCount: number;
  followingCount: number;
  postCount: number;
  avgEngagementRate: number | null;
  avgLikes: number | null;
  avgComments: number | null;
  avgViews: number | null;
  niche: string | null;
  tier: string;
  audienceAgeRange: string | null;
  audienceGender: string | null;
  audienceLocation: string | null;
  contentStyle: string | null;
  status: string;
  source: string;
  socialCatUrl: string | null;
  notes: string | null;
  tags: string[];
  aiSummary: string | null;
  metricsRefreshedAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface InfluencerCampaign {
  id: string;
  workspaceId: string;
  name: string;
  description: string | null;
  goal: string | null;
  campaignType: string;
  budgetCents: number;
  spentCents: number;
  startDate: number | null;
  endDate: number | null;
  targetReach: number | null;
  targetEngagements: number | null;
  targetConversions: number | null;
  promoCode: string | null;
  utmParams: string | null;
  conversions: number;
  revenueCents: number;
  status: string;
  memberCount: number;
  createdAt: number;
  updatedAt: number;
}

export interface CampaignMember {
  id: string;
  campaignId: string;
  influencerId: string;
  influencerName: string;
  influencerHandle: string;
  platform: string;
  followerCount: number;
  status: string;
  dealType: string;
  feeCents: number;
  promoCode: string | null;
  deliverables: string | null;
  contentDueAt: number | null;
  notes: string | null;
  createdAt: number;
}

export interface InfluencerContent {
  id: string;
  influencerId: string;
  influencerName: string;
  influencerHandle: string;
  campaignId: string | null;
  campaignName: string | null;
  platform: string;
  postUrl: string | null;
  postType: string;
  caption: string | null;
  publishedAt: number | null;
  reach: number;
  impressions: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  views: number;
  clicks: number;
  engagementRate: number | null;
  conversions: number;
  revenueCents: number;
  createdAt: number;
}

export interface InfluencerStats {
  totalInfluencers: number;
  activeInfluencers: number;
  totalCampaigns: number;
  activeCampaigns: number;
  totalReach: number;
  totalEngagements: number;
  totalRevenueCents: number;
  totalSpentCents: number;
}

// ─── Validation Schemas ───

const AddInfluencerSchema = z.object({
  name: z.string().min(1).max(200),
  handle: z.string().min(1).max(200),
  platform: z.enum(["instagram", "tiktok", "youtube", "x", "pinterest", "other"]),
  profileUrl: z.string().url().optional().or(z.literal("")),
  avatarUrl: z.string().url().optional().or(z.literal("")),
  email: z.string().email().optional().or(z.literal("")),
  location: z.string().max(200).optional(),
  followerCount: z.number().int().min(0).default(0),
  avgEngagementRate: z.number().min(0).max(100).optional(),
  niche: z.string().max(200).optional(),
  tier: z.enum(["nano", "micro", "mid", "macro", "mega"]).default("micro"),
  contentStyle: z.string().max(200).optional(),
  status: z.enum(["prospecting", "outreach", "negotiating", "active", "completed", "rejected", "blacklisted"]).default("prospecting"),
  source: z.enum(["manual", "social_cat", "signal", "referral"]).default("manual"),
  socialCatUrl: z.string().url().optional().or(z.literal("")),
  notes: z.string().max(5000).optional(),
  tags: z.array(z.string()).default([]),
});

const UpdateInfluencerSchema = AddInfluencerSchema.partial().extend({
  id: z.string().min(1),
});

const CreateCampaignSchema = z.object({
  name: z.string().min(1).max(300),
  description: z.string().max(2000).optional(),
  goal: z.string().max(2000).optional(),
  campaignType: z.enum(["gifted", "paid", "affiliate", "ugc", "ambassador"]).default("gifted"),
  budgetCents: z.number().int().min(0).default(0),
  startDate: z.number().optional(),
  endDate: z.number().optional(),
  targetReach: z.number().int().optional(),
  targetEngagements: z.number().int().optional(),
  targetConversions: z.number().int().optional(),
  promoCode: z.string().max(100).optional(),
  status: z.enum(["draft", "active", "paused", "completed", "cancelled"]).default("draft"),
});

const AddCampaignMemberSchema = z.object({
  campaignId: z.string().min(1),
  influencerId: z.string().min(1),
  dealType: z.enum(["gifted", "paid", "affiliate", "ugc", "ambassador"]).default("gifted"),
  feeCents: z.number().int().min(0).default(0),
  promoCode: z.string().max(100).optional(),
  deliverables: z.string().max(1000).optional(),
  contentDueAt: z.number().optional(),
  notes: z.string().max(2000).optional(),
});

const UpdateMemberStatusSchema = z.object({
  memberId: z.string().min(1),
  status: z.enum(["invited", "accepted", "declined", "content_due", "content_submitted", "content_live", "completed", "dropped"]),
});

const LogContentSchema = z.object({
  influencerId: z.string().min(1),
  campaignId: z.string().optional(),
  memberId: z.string().optional(),
  platform: z.string().min(1),
  postUrl: z.string().url().optional().or(z.literal("")),
  postType: z.enum(["post", "reel", "story", "video", "short", "thread", "pin"]).default("post"),
  caption: z.string().max(5000).optional(),
  publishedAt: z.number().optional(),
  reach: z.number().int().min(0).default(0),
  impressions: z.number().int().min(0).default(0),
  likes: z.number().int().min(0).default(0),
  comments: z.number().int().min(0).default(0),
  shares: z.number().int().min(0).default(0),
  saves: z.number().int().min(0).default(0),
  views: z.number().int().min(0).default(0),
  clicks: z.number().int().min(0).default(0),
  conversions: z.number().int().min(0).default(0),
  revenueCents: z.number().int().min(0).default(0),
});

// ─── Influencer CRUD ───

export async function listInfluencers(filters?: {
  status?: string;
  platform?: string;
  tier?: string;
}): Promise<ActionResult<Influencer[]>> {
  return safeAction(async () => {
    const session = await requirePermission("analytics:read");
    const raw = rawDb();

    let query = `SELECT * FROM influencers WHERE workspace_id = ?`;
    const params: unknown[] = [session.workspaceId];

    if (filters?.status) { query += ` AND status = ?`; params.push(filters.status); }
    if (filters?.platform) { query += ` AND platform = ?`; params.push(filters.platform); }
    if (filters?.tier) { query += ` AND tier = ?`; params.push(filters.tier); }

    query += ` ORDER BY created_at DESC LIMIT 200`;

    const { results } = await raw.prepare(query).bind(...params).all<Record<string, unknown>>();
    return (results ?? []).map(mapInfluencer);
  });
}

export async function addInfluencer(
  input: z.infer<typeof AddInfluencerSchema>
): Promise<ActionResult<Influencer>> {
  return safeAction(async () => {
    const session = await requirePermission("content:write");
    const data = AddInfluencerSchema.parse(input);
    const raw = rawDb();
    const id = createId();
    const now = Math.floor(Date.now() / 1000);

    await raw
      .prepare(
        `INSERT INTO influencers
         (id, workspace_id, name, handle, platform, profile_url, avatar_url, email,
          location, follower_count, avg_engagement_rate, niche, tier, content_style,
          status, source, social_cat_url, notes, tags, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
      )
      .bind(
        id, session.workspaceId, data.name, data.handle, data.platform,
        data.profileUrl || null, data.avatarUrl || null, data.email || null,
        data.location || null, data.followerCount,
        data.avgEngagementRate ?? null, data.niche || null, data.tier,
        data.contentStyle || null, data.status, data.source,
        data.socialCatUrl || null, data.notes || null,
        JSON.stringify(data.tags), now, now
      )
      .run();

    const { results } = await raw
      .prepare(`SELECT * FROM influencers WHERE id = ?`)
      .bind(id)
      .all<Record<string, unknown>>();

    if (!results?.[0]) throw new Error("Influencer not found after insert");
    return mapInfluencer(results[0]);
  });
}

export async function updateInfluencer(
  input: z.infer<typeof UpdateInfluencerSchema>
): Promise<ActionResult<Influencer>> {
  return safeAction(async () => {
    const session = await requirePermission("content:write");
    const { id, ...data } = UpdateInfluencerSchema.parse(input);
    const raw = rawDb();
    const now = Math.floor(Date.now() / 1000);

    const fields: string[] = [];
    const vals: unknown[] = [];

    if (data.name !== undefined) { fields.push("name = ?"); vals.push(data.name); }
    if (data.handle !== undefined) { fields.push("handle = ?"); vals.push(data.handle); }
    if (data.platform !== undefined) { fields.push("platform = ?"); vals.push(data.platform); }
    if (data.profileUrl !== undefined) { fields.push("profile_url = ?"); vals.push(data.profileUrl || null); }
    if (data.avatarUrl !== undefined) { fields.push("avatar_url = ?"); vals.push(data.avatarUrl || null); }
    if (data.email !== undefined) { fields.push("email = ?"); vals.push(data.email || null); }
    if (data.location !== undefined) { fields.push("location = ?"); vals.push(data.location || null); }
    if (data.followerCount !== undefined) { fields.push("follower_count = ?"); vals.push(data.followerCount); }
    if (data.avgEngagementRate !== undefined) { fields.push("avg_engagement_rate = ?"); vals.push(data.avgEngagementRate ?? null); }
    if (data.niche !== undefined) { fields.push("niche = ?"); vals.push(data.niche || null); }
    if (data.tier !== undefined) { fields.push("tier = ?"); vals.push(data.tier); }
    if (data.contentStyle !== undefined) { fields.push("content_style = ?"); vals.push(data.contentStyle || null); }
    if (data.status !== undefined) { fields.push("status = ?"); vals.push(data.status); }
    if (data.socialCatUrl !== undefined) { fields.push("social_cat_url = ?"); vals.push(data.socialCatUrl || null); }
    if (data.notes !== undefined) { fields.push("notes = ?"); vals.push(data.notes || null); }
    if (data.tags !== undefined) { fields.push("tags = ?"); vals.push(JSON.stringify(data.tags)); }

    if (fields.length === 0) throw new Error("No fields to update");
    fields.push("updated_at = ?");
    vals.push(now);

    await raw
      .prepare(`UPDATE influencers SET ${fields.join(", ")} WHERE id = ? AND workspace_id = ?`)
      .bind(...vals, id, session.workspaceId)
      .run();

    const { results } = await raw
      .prepare(`SELECT * FROM influencers WHERE id = ?`)
      .bind(id)
      .all<Record<string, unknown>>();

    if (!results?.[0]) throw new Error("Record not found");
    return mapInfluencer(results[0]);
  });
}

export async function deleteInfluencer(id: string): Promise<ActionResult<void>> {
  return safeAction(async () => {
    const session = await requirePermission("content:write");
    const raw = rawDb();
    await raw
      .prepare(`DELETE FROM influencers WHERE id = ? AND workspace_id = ?`)
      .bind(id, session.workspaceId)
      .run();
  });
}

// ─── AI: Summarize Influencer Fit ───

export async function generateInfluencerFitSummary(influencerId: string): Promise<ActionResult<string>> {
  return safeAction(async () => {
    const session = await requirePermission("content:write");
    const raw = rawDb();

    const { results } = await raw
      .prepare(`SELECT * FROM influencers WHERE id = ? AND workspace_id = ?`)
      .bind(influencerId, session.workspaceId)
      .all<Record<string, unknown>>();

    if (!results?.[0]) throw new Error("Influencer not found");
    const inf = mapInfluencer(results[0]);

    const prompt = `You are a marketing strategist. Analyze this influencer and write a 2-3 sentence brief explaining why they may (or may not) be a strong partner:

Name: ${inf.name} (@${inf.handle})
Platform: ${inf.platform}
Followers: ${inf.followerCount.toLocaleString()}
Tier: ${inf.tier}
Avg engagement rate: ${inf.avgEngagementRate ? `${(inf.avgEngagementRate * 100).toFixed(1)}%` : "unknown"}
Niche: ${inf.niche ?? "not specified"}
Content style: ${inf.contentStyle ?? "not specified"}
Notes: ${inf.notes ?? "none"}

Be specific, punchy, and focused on fit for a growing brand.`;

    const summary = await generateWithClaude({
      systemPrompt: "You are a concise marketing strategist. Write 2-3 sentence influencer fit briefs.",
      userMessage: prompt,
      maxTokens: 200,
    });

    await raw
      .prepare(`UPDATE influencers SET ai_summary = ?, updated_at = ? WHERE id = ?`)
      .bind(summary, Math.floor(Date.now() / 1000), influencerId)
      .run();

    return summary;
  });
}

// ─── Campaign CRUD ───

export async function listCampaigns(): Promise<ActionResult<InfluencerCampaign[]>> {
  return safeAction(async () => {
    const session = await requirePermission("analytics:read");
    const raw = rawDb();

    const { results } = await raw
      .prepare(
        `SELECT c.*,
           (SELECT COUNT(*) FROM influencer_campaign_members m WHERE m.campaign_id = c.id) AS member_count
         FROM influencer_campaigns c
         WHERE c.workspace_id = ?
         ORDER BY c.created_at DESC
         LIMIT 100`
      )
      .bind(session.workspaceId)
      .all<Record<string, unknown>>();

    return (results ?? []).map(mapCampaign);
  });
}

export async function createCampaign(
  input: z.infer<typeof CreateCampaignSchema>
): Promise<ActionResult<InfluencerCampaign>> {
  return safeAction(async () => {
    const session = await requirePermission("content:write");
    const data = CreateCampaignSchema.parse(input);
    const raw = rawDb();
    const id = createId();
    const now = Math.floor(Date.now() / 1000);

    await raw
      .prepare(
        `INSERT INTO influencer_campaigns
         (id, workspace_id, name, description, goal, campaign_type, budget_cents,
          start_date, end_date, target_reach, target_engagements, target_conversions,
          promo_code, status, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
      )
      .bind(
        id, session.workspaceId, data.name, data.description || null, data.goal || null,
        data.campaignType, data.budgetCents,
        data.startDate ?? null, data.endDate ?? null,
        data.targetReach ?? null, data.targetEngagements ?? null, data.targetConversions ?? null,
        data.promoCode || null, data.status, now, now
      )
      .run();

    const { results } = await raw
      .prepare(`SELECT c.*, 0 AS member_count FROM influencer_campaigns c WHERE c.id = ?`)
      .bind(id)
      .all<Record<string, unknown>>();

    if (!results?.[0]) throw new Error("Record not found");
    return mapCampaign(results[0]);
  });
}

export async function updateCampaignStatus(
  campaignId: string,
  status: string
): Promise<ActionResult<void>> {
  return safeAction(async () => {
    const session = await requirePermission("content:write");
    const raw = rawDb();
    await raw
      .prepare(`UPDATE influencer_campaigns SET status = ?, updated_at = ? WHERE id = ? AND workspace_id = ?`)
      .bind(status, Math.floor(Date.now() / 1000), campaignId, session.workspaceId)
      .run();
  });
}

// ─── Campaign Members ───

export async function listCampaignMembers(campaignId: string): Promise<ActionResult<CampaignMember[]>> {
  return safeAction(async () => {
    const session = await requirePermission("analytics:read");
    const raw = rawDb();

    const { results } = await raw
      .prepare(
        `SELECT m.*, i.name AS influencer_name, i.handle AS influencer_handle,
                i.platform, i.follower_count
         FROM influencer_campaign_members m
         JOIN influencers i ON i.id = m.influencer_id
         WHERE m.campaign_id = ? AND m.workspace_id = ?
         ORDER BY m.created_at ASC`
      )
      .bind(campaignId, session.workspaceId)
      .all<Record<string, unknown>>();

    return (results ?? []).map(mapMember);
  });
}

export async function addCampaignMember(
  input: z.infer<typeof AddCampaignMemberSchema>
): Promise<ActionResult<CampaignMember>> {
  return safeAction(async () => {
    const session = await requirePermission("content:write");
    const data = AddCampaignMemberSchema.parse(input);
    const raw = rawDb();
    const id = createId();
    const now = Math.floor(Date.now() / 1000);

    await raw
      .prepare(
        `INSERT INTO influencer_campaign_members
         (id, workspace_id, campaign_id, influencer_id, deal_type, fee_cents,
          promo_code, deliverables, content_due_at, notes, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`
      )
      .bind(
        id, session.workspaceId, data.campaignId, data.influencerId,
        data.dealType, data.feeCents, data.promoCode || null,
        data.deliverables || null, data.contentDueAt ?? null,
        data.notes || null, now, now
      )
      .run();

    const { results } = await raw
      .prepare(
        `SELECT m.*, i.name AS influencer_name, i.handle AS influencer_handle,
                i.platform, i.follower_count
         FROM influencer_campaign_members m
         JOIN influencers i ON i.id = m.influencer_id
         WHERE m.id = ?`
      )
      .bind(id)
      .all<Record<string, unknown>>();

    if (!results?.[0]) throw new Error("Record not found");
    return mapMember(results[0]);
  });
}

export async function updateMemberStatus(
  input: z.infer<typeof UpdateMemberStatusSchema>
): Promise<ActionResult<void>> {
  return safeAction(async () => {
    const session = await requirePermission("content:write");
    const { memberId, status } = UpdateMemberStatusSchema.parse(input);
    const raw = rawDb();
    await raw
      .prepare(`UPDATE influencer_campaign_members SET status = ?, updated_at = ? WHERE id = ? AND workspace_id = ?`)
      .bind(status, Math.floor(Date.now() / 1000), memberId, session.workspaceId)
      .run();
  });
}

// ─── Content Tracking ───

export async function listInfluencerContent(filters?: {
  influencerId?: string;
  campaignId?: string;
}): Promise<ActionResult<InfluencerContent[]>> {
  return safeAction(async () => {
    const session = await requirePermission("analytics:read");
    const raw = rawDb();

    let query = `
      SELECT ic.*, i.name AS influencer_name, i.handle AS influencer_handle,
             c.name AS campaign_name
      FROM influencer_content ic
      JOIN influencers i ON i.id = ic.influencer_id
      LEFT JOIN influencer_campaigns c ON c.id = ic.campaign_id
      WHERE ic.workspace_id = ?`;
    const params: unknown[] = [session.workspaceId];

    if (filters?.influencerId) { query += ` AND ic.influencer_id = ?`; params.push(filters.influencerId); }
    if (filters?.campaignId) { query += ` AND ic.campaign_id = ?`; params.push(filters.campaignId); }

    query += ` ORDER BY ic.published_at DESC NULLS LAST, ic.created_at DESC LIMIT 200`;

    const { results } = await raw.prepare(query).bind(...params).all<Record<string, unknown>>();
    return (results ?? []).map(mapContent);
  });
}

export async function logInfluencerContent(
  input: z.infer<typeof LogContentSchema>
): Promise<ActionResult<InfluencerContent>> {
  return safeAction(async () => {
    const session = await requirePermission("content:write");
    const data = LogContentSchema.parse(input);
    const raw = rawDb();
    const id = createId();
    const now = Math.floor(Date.now() / 1000);

    const totalEngagements = data.likes + data.comments + data.shares + data.saves;
    const engRate = data.reach > 0 ? totalEngagements / data.reach : null;

    await raw
      .prepare(
        `INSERT INTO influencer_content
         (id, workspace_id, campaign_id, member_id, influencer_id, platform,
          post_url, post_type, caption, published_at, reach, impressions,
          likes, comments, shares, saves, views, clicks, engagement_rate,
          conversions, revenue_cents, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
      )
      .bind(
        id, session.workspaceId, data.campaignId || null, data.memberId || null,
        data.influencerId, data.platform, data.postUrl || null, data.postType,
        data.caption || null, data.publishedAt ?? null,
        data.reach, data.impressions, data.likes, data.comments,
        data.shares, data.saves, data.views, data.clicks,
        engRate, data.conversions, data.revenueCents, now, now
      )
      .run();

    // Update campaign revenue if applicable
    if (data.campaignId && data.revenueCents > 0) {
      await raw
        .prepare(`UPDATE influencer_campaigns SET revenue_cents = revenue_cents + ?, conversions = conversions + ?, updated_at = ? WHERE id = ?`)
        .bind(data.revenueCents, data.conversions, now, data.campaignId)
        .run();
    }

    const { results } = await raw
      .prepare(
        `SELECT ic.*, i.name AS influencer_name, i.handle AS influencer_handle,
                c.name AS campaign_name
         FROM influencer_content ic
         JOIN influencers i ON i.id = ic.influencer_id
         LEFT JOIN influencer_campaigns c ON c.id = ic.campaign_id
         WHERE ic.id = ?`
      )
      .bind(id)
      .all<Record<string, unknown>>();

    if (!results?.[0]) throw new Error("Content record not found");
    return mapContent(results[0]);
  });
}

// ─── Stats ───

export async function getInfluencerStats(): Promise<ActionResult<InfluencerStats>> {
  return safeAction(async () => {
    const session = await requirePermission("analytics:read");
    const raw = rawDb();

    const [iStats, cStats, contentStats] = await Promise.all([
      raw.prepare(
        `SELECT
           COUNT(*) AS total,
           SUM(CASE WHEN status IN ('outreach','negotiating','active') THEN 1 ELSE 0 END) AS active
         FROM influencers WHERE workspace_id = ?`
      ).bind(session.workspaceId).first<{ total: number; active: number }>(),

      raw.prepare(
        `SELECT
           COUNT(*) AS total,
           SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active,
           SUM(spent_cents) AS spent,
           SUM(revenue_cents) AS revenue
         FROM influencer_campaigns WHERE workspace_id = ?`
      ).bind(session.workspaceId).first<{ total: number; active: number; spent: number; revenue: number }>(),

      raw.prepare(
        `SELECT
           COALESCE(SUM(reach), 0) AS total_reach,
           COALESCE(SUM(likes + comments + shares + saves), 0) AS total_engagements
         FROM influencer_content WHERE workspace_id = ?`
      ).bind(session.workspaceId).first<{ total_reach: number; total_engagements: number }>(),
    ]);

    return {
      totalInfluencers: iStats?.total ?? 0,
      activeInfluencers: iStats?.active ?? 0,
      totalCampaigns: cStats?.total ?? 0,
      activeCampaigns: cStats?.active ?? 0,
      totalReach: contentStats?.total_reach ?? 0,
      totalEngagements: contentStats?.total_engagements ?? 0,
      totalRevenueCents: cStats?.revenue ?? 0,
      totalSpentCents: cStats?.spent ?? 0,
    };
  });
}

// ─── Row Mappers ───

function mapInfluencer(row: Record<string, unknown>): Influencer {
  return {
    id: row.id as string,
    workspaceId: row.workspace_id as string,
    name: row.name as string,
    handle: row.handle as string,
    platform: row.platform as string,
    profileUrl: row.profile_url as string | null,
    avatarUrl: row.avatar_url as string | null,
    email: row.email as string | null,
    location: row.location as string | null,
    followerCount: (row.follower_count as number) ?? 0,
    followingCount: (row.following_count as number) ?? 0,
    postCount: (row.post_count as number) ?? 0,
    avgEngagementRate: row.avg_engagement_rate as number | null,
    avgLikes: row.avg_likes as number | null,
    avgComments: row.avg_comments as number | null,
    avgViews: row.avg_views as number | null,
    niche: row.niche as string | null,
    tier: row.tier as string,
    audienceAgeRange: row.audience_age_range as string | null,
    audienceGender: row.audience_gender as string | null,
    audienceLocation: row.audience_location as string | null,
    contentStyle: row.content_style as string | null,
    status: row.status as string,
    source: row.source as string,
    socialCatUrl: row.social_cat_url as string | null,
    notes: row.notes as string | null,
    tags: row.tags ? (JSON.parse(row.tags as string) as string[]) : [],
    aiSummary: row.ai_summary as string | null,
    metricsRefreshedAt: row.metrics_refreshed_at as number | null,
    createdAt: row.created_at as number,
    updatedAt: row.updated_at as number,
  };
}

function mapCampaign(row: Record<string, unknown>): InfluencerCampaign {
  return {
    id: row.id as string,
    workspaceId: row.workspace_id as string,
    name: row.name as string,
    description: row.description as string | null,
    goal: row.goal as string | null,
    campaignType: row.campaign_type as string,
    budgetCents: (row.budget_cents as number) ?? 0,
    spentCents: (row.spent_cents as number) ?? 0,
    startDate: row.start_date as number | null,
    endDate: row.end_date as number | null,
    targetReach: row.target_reach as number | null,
    targetEngagements: row.target_engagements as number | null,
    targetConversions: row.target_conversions as number | null,
    promoCode: row.promo_code as string | null,
    utmParams: row.utm_params as string | null,
    conversions: (row.conversions as number) ?? 0,
    revenueCents: (row.revenue_cents as number) ?? 0,
    status: row.status as string,
    memberCount: (row.member_count as number) ?? 0,
    createdAt: row.created_at as number,
    updatedAt: row.updated_at as number,
  };
}

function mapMember(row: Record<string, unknown>): CampaignMember {
  return {
    id: row.id as string,
    campaignId: row.campaign_id as string,
    influencerId: row.influencer_id as string,
    influencerName: row.influencer_name as string,
    influencerHandle: row.influencer_handle as string,
    platform: row.platform as string,
    followerCount: (row.follower_count as number) ?? 0,
    status: row.status as string,
    dealType: row.deal_type as string,
    feeCents: (row.fee_cents as number) ?? 0,
    promoCode: row.promo_code as string | null,
    deliverables: row.deliverables as string | null,
    contentDueAt: row.content_due_at as number | null,
    notes: row.notes as string | null,
    createdAt: row.created_at as number,
  };
}

function mapContent(row: Record<string, unknown>): InfluencerContent {
  return {
    id: row.id as string,
    influencerId: row.influencer_id as string,
    influencerName: row.influencer_name as string,
    influencerHandle: row.influencer_handle as string,
    campaignId: row.campaign_id as string | null,
    campaignName: row.campaign_name as string | null,
    platform: row.platform as string,
    postUrl: row.post_url as string | null,
    postType: row.post_type as string,
    caption: row.caption as string | null,
    publishedAt: row.published_at as number | null,
    reach: (row.reach as number) ?? 0,
    impressions: (row.impressions as number) ?? 0,
    likes: (row.likes as number) ?? 0,
    comments: (row.comments as number) ?? 0,
    shares: (row.shares as number) ?? 0,
    saves: (row.saves as number) ?? 0,
    views: (row.views as number) ?? 0,
    clicks: (row.clicks as number) ?? 0,
    engagementRate: row.engagement_rate as number | null,
    conversions: (row.conversions as number) ?? 0,
    revenueCents: (row.revenue_cents as number) ?? 0,
    createdAt: row.created_at as number,
  };
}
