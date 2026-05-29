"use server";

import { z } from "zod";
import { eq, and, desc } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";
import { requirePermission } from "@/lib/auth/middleware";
import { getBindings } from "@/lib/cloudflare/bindings";
import { createDb } from "@/lib/db/client";
import { communityCampaigns, communityPosts, communities } from "@/lib/db/schema";
import { safeAction, type ActionResult } from "@/lib/utils/api";
import { generateWithClaude } from "@/lib/ai/claude";
import type { CommunityCampaign, CommunityPost } from "@/lib/db/schema";

// ═══════════════════════════════════════════
// Validation
// ═══════════════════════════════════════════

const CampaignSchema = z.object({
  communityId: z.string().min(1),
  name: z.string().min(1).max(120),
  postsPerDay: z.number().int().min(1).max(3).default(1),
  generateAtUtcHour: z.number().int().min(0).max(23).default(12),
  doctrineMode: z.string().default("balanced"),
  contentPillars: z.array(z.string()).min(1),
  customInstructions: z.string().max(500).optional().nullable(),
  includeCurrentEvents: z.boolean().default(true),
});

// ═══════════════════════════════════════════
// Campaign CRUD
// ═══════════════════════════════════════════

export async function listCommunityCampaigns(
  communityId?: string
): Promise<ActionResult<CommunityCampaign[]>> {
  return safeAction(async () => {
    const session = await requirePermission("publish:queue");
    const { DB } = getBindings();
    const db = createDb(DB);

    const conditions = [eq(communityCampaigns.workspaceId, session.workspaceId)];
    if (communityId) {
      conditions.push(eq(communityCampaigns.communityId, communityId));
    }

    return db
      .select()
      .from(communityCampaigns)
      .where(and(...conditions))
      .orderBy(desc(communityCampaigns.createdAt))
      .all();
  });
}

export async function createCommunityCampaign(
  formData: FormData
): Promise<ActionResult<CommunityCampaign>> {
  return safeAction(async () => {
    const session = await requirePermission("publish:queue");
    const { DB } = getBindings();
    const db = createDb(DB);

    const pillarsRaw = formData.get("contentPillars") as string;
    const input = CampaignSchema.parse({
      communityId: formData.get("communityId"),
      name: formData.get("name"),
      postsPerDay: parseInt((formData.get("postsPerDay") as string) ?? "1"),
      generateAtUtcHour: parseInt((formData.get("generateAtUtcHour") as string) ?? "12"),
      doctrineMode: formData.get("doctrineMode") ?? "balanced",
      contentPillars: pillarsRaw ? JSON.parse(pillarsRaw) : ["family connection", "legacy", "current events", "engagement", "humor"],
      customInstructions: formData.get("customInstructions") || null,
      includeCurrentEvents: formData.get("includeCurrentEvents") !== "false",
    });

    // Verify community belongs to workspace
    const community = await db
      .select({ id: communities.id })
      .from(communities)
      .where(and(eq(communities.id, input.communityId), eq(communities.workspaceId, session.workspaceId)))
      .get();
    if (!community) throw new Error("Community not found");

    const now = new Date();
    const campaign: typeof communityCampaigns.$inferInsert = {
      id: createId(),
      workspaceId: session.workspaceId,
      communityId: input.communityId,
      name: input.name,
      isActive: true,
      postsPerDay: input.postsPerDay,
      generateAtUtcHour: input.generateAtUtcHour,
      doctrineMode: input.doctrineMode,
      contentPillars: JSON.stringify(input.contentPillars),
      customInstructions: input.customInstructions ?? null,
      includeCurrentEvents: input.includeCurrentEvents,
      lastGeneratedDate: null,
      createdAt: now,
      updatedAt: now,
    };

    await db.insert(communityCampaigns).values(campaign);
    return campaign as CommunityCampaign;
  });
}

export async function toggleCampaign(
  campaignId: string,
  isActive: boolean
): Promise<ActionResult<{ updated: boolean }>> {
  return safeAction(async () => {
    const session = await requirePermission("publish:queue");
    const { DB } = getBindings();
    const db = createDb(DB);

    await db
      .update(communityCampaigns)
      .set({ isActive, updatedAt: new Date() })
      .where(and(
        eq(communityCampaigns.id, campaignId),
        eq(communityCampaigns.workspaceId, session.workspaceId)
      ));

    return { updated: true };
  });
}

export async function deleteCampaign(
  campaignId: string
): Promise<ActionResult<{ deleted: boolean }>> {
  return safeAction(async () => {
    const session = await requirePermission("publish:queue");
    const { DB } = getBindings();
    const db = createDb(DB);

    await db
      .delete(communityCampaigns)
      .where(and(
        eq(communityCampaigns.id, campaignId),
        eq(communityCampaigns.workspaceId, session.workspaceId)
      ));

    return { deleted: true };
  });
}

// ─── Manual trigger (generate now without waiting for cron) ──────────────────

export async function generatePostsNow(
  campaignId: string
): Promise<ActionResult<{ postsCreated: number }>> {
  return safeAction(async () => {
    const session = await requirePermission("publish:queue");
    const { DB } = getBindings();
    const db = createDb(DB);

    const campaign = await db
      .select()
      .from(communityCampaigns)
      .where(and(
        eq(communityCampaigns.id, campaignId),
        eq(communityCampaigns.workspaceId, session.workspaceId)
      ))
      .get();

    if (!campaign) throw new Error("Campaign not found");

    const community = await db
      .select()
      .from(communities)
      .where(eq(communities.id, campaign.communityId))
      .get();

    if (!community) throw new Error("Community not found");

    const dayOfWeek = new Date().toLocaleDateString("en-US", { weekday: "long" });
    const PILLARS = ["family_connection", "legacy_memory", "current_events", "engagement_question", "humor"];
    const LABELS: Record<string, string> = {
      family_connection: "Family Connection & Activities",
      legacy_memory: "Legacy & Memory Keeping",
      current_events: "Current Events Through a Family Lens",
      engagement_question: "Community Engagement Question",
      humor: "Family Humor",
    };

    let pillars: string[] = PILLARS;
    try {
      const parsed: string[] = JSON.parse(campaign.contentPillars);
      if (parsed.length > 0) pillars = parsed;
    } catch { /* use defaults */ }

    const idx = new Date().getDay() % pillars.length;
    const rawPillar = pillars[idx] ?? "engagement_question";
    let pillarKey = "engagement_question";
    if (rawPillar.includes("connect")) pillarKey = "family_connection";
    else if (rawPillar.includes("legacy") || rawPillar.includes("memory")) pillarKey = "legacy_memory";
    else if (rawPillar.includes("current") || rawPillar.includes("event")) pillarKey = "current_events";
    else if (rawPillar.includes("humor") || rawPillar.includes("fun")) pillarKey = "humor";

    const pillarLabel = LABELS[pillarKey] ?? pillarKey;

    const isFacebook = community.platform === "facebook";
    const isReddit = community.platform === "reddit";

    let systemPrompt: string;
    let userPrompt: string;

    if (isFacebook) {
      systemPrompt = "You are a community content expert for family-focused Facebook Groups. Write posts that spark genuine conversation.";
      userPrompt = `Write a Facebook Group post for "${community.name}" (family community).
Pillar: ${pillarLabel} | Day: ${dayOfWeek}
${campaign.customInstructions ? `Brand notes: ${campaign.customInstructions}` : ""}

Keep it 50–150 words, warm and human. End with a question or call to action. No hashtags. Write ONLY the post text.`;
    } else {
      systemPrompt = "You write authentic Reddit posts that feel like real community members. Never brand-sounding.";
      userPrompt = `Write a Reddit post for a family connection community.
Pillar: ${pillarLabel} | Day: ${dayOfWeek}
${campaign.customInstructions ? `Context: ${campaign.customInstructions}` : ""}

First-person, conversational, 80–200 words. End with a question.
Format: TITLE: [short title]

[post body]`;
    }

    const generated = await generateWithClaude({ systemPrompt, userMessage: userPrompt, maxTokens: 500 });

    let title = `${pillarLabel} — ${dayOfWeek}`;
    let body = generated.trim();
    if (isReddit && body.startsWith("TITLE:")) {
      const lines = body.split("\n");
      title = lines[0]!.replace("TITLE:", "").trim();
      body = lines.slice(2).join("\n").trim();
    }

    const now = new Date();
    await db.insert(communityPosts).values({
      id: createId(),
      communityId: campaign.communityId,
      workspaceId: session.workspaceId,
      postType: "update",
      title,
      body,
      postStatus: "draft",
      createdAt: now,
      updatedAt: now,
    } as typeof communityPosts.$inferInsert);

    return { postsCreated: 1 };
  });
}

// ═══════════════════════════════════════════
// AI Comment Suggestions
// ═══════════════════════════════════════════

export async function generateCommentSuggestions(
  postId: string,
  commentContext: string // e.g. "Someone commented: 'We do this every Sunday!'"
): Promise<ActionResult<string[]>> {
  return safeAction(async () => {
    await requirePermission("publish:queue");

    const { DB } = getBindings();
    const db = createDb(DB);

    const post = await db
      .select()
      .from(communityPosts)
      .where(eq(communityPosts.id, postId))
      .get();

    if (!post) throw new Error("Post not found");

    const generated = await generateWithClaude({
      systemPrompt: "You generate warm, authentic reply suggestions for community managers responding to Facebook Group comments. Replies should feel personal and encourage further conversation.",
      userMessage: `Original post: "${post.body}"

${commentContext}

Generate 3 different reply options. Each should:
- Be 1–2 sentences max
- Feel warm and personal, like a real human response
- Ask a follow-up question or express genuine interest
- Vary in tone (enthusiastic, reflective, curious)

Format: Return exactly 3 replies, one per line, numbered 1. 2. 3.`,
      maxTokens: 300,
    });

    const replies = generated
      .split("\n")
      .filter(l => l.match(/^\d\./))
      .map(l => l.replace(/^\d\.\s*/, "").trim())
      .filter(Boolean)
      .slice(0, 3);

    return replies.length > 0 ? replies : [generated.trim()];
  });
}

// ═══════════════════════════════════════════
// Cross-Platform Adaptation
// ═══════════════════════════════════════════

export async function adaptPostForPlatform(
  postId: string,
  targetPlatform: "facebook" | "reddit" | "instagram" | "twitter"
): Promise<ActionResult<{ title?: string; body: string }>> {
  return safeAction(async () => {
    await requirePermission("publish:queue");

    const { DB } = getBindings();
    const db = createDb(DB);

    const post = await db
      .select()
      .from(communityPosts)
      .where(eq(communityPosts.id, postId))
      .get();

    if (!post) throw new Error("Post not found");

    const platformInstructions: Record<string, string> = {
      facebook: "Rewrite for a Facebook Group. Warm, 50–150 words, end with a question. No hashtags.",
      reddit: "Rewrite for Reddit. First-person, authentic, 80–200 words. Add 'TITLE: [short title]' on the first line, then a blank line, then the post.",
      instagram: "Rewrite for Instagram. Punchy opener, 100–200 words, 5–8 relevant hashtags at the end. Emojis are OK.",
      twitter: "Rewrite as a Twitter/X thread. Start with a hook tweet (under 280 chars). Add 2–3 follow-up tweets numbered 2/, 3/.",
    };

    const generated = await generateWithClaude({
      systemPrompt: "You adapt community posts for different social platforms while preserving the core message and emotional resonance.",
      userMessage: `Original post:\n"${post.title ? `${post.title}\n\n` : ""}${post.body}"

${platformInstructions[targetPlatform]}

Write ONLY the adapted content, no meta-commentary.`,
      maxTokens: 500,
    });

    let title: string | undefined;
    let body = generated.trim();

    if (targetPlatform === "reddit" && body.startsWith("TITLE:")) {
      const lines = body.split("\n");
      title = lines[0]!.replace("TITLE:", "").trim();
      body = lines.slice(2).join("\n").trim();
    }

    return { title, body };
  });
}

// ═══════════════════════════════════════════
// Repost Suggestions
// ═══════════════════════════════════════════

export async function getRepostSuggestions(
  communityId: string
): Promise<ActionResult<CommunityPost[]>> {
  return safeAction(async () => {
    const session = await requirePermission("publish:queue");
    const { DB } = getBindings();
    const db = createDb(DB);

    // Find published posts with highest engagement (likes + comments)
    // Older than 30 days = safe to repost without feeling repetitive
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const posts = await db
      .select()
      .from(communityPosts)
      .where(and(
        eq(communityPosts.communityId, communityId),
        eq(communityPosts.postStatus, "published")
      ))
      .orderBy(desc(communityPosts.createdAt))
      .limit(50)
      .all();

    // Score by engagement and age (older + high engagement = good repost candidate)
    const candidates = posts
      .filter(p => p.createdAt && new Date(p.createdAt) < thirtyDaysAgo)
      .map(p => ({
        ...p,
        engagementScore: ((p.likes ?? 0) * 2) + (p.comments ?? 0),
      }))
      .sort((a, b) => b.engagementScore - a.engagementScore)
      .slice(0, 5);

    return candidates;
  });
}
