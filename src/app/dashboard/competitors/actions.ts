"use server";

import { z } from "zod";
import { eq, and, desc } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";
import { requirePermission } from "@/lib/auth/middleware";
import { getBindings } from "@/lib/cloudflare/bindings";
import { createDb } from "@/lib/db/client";
import { competitors, competitorPosts } from "@/lib/db/schema";
import { safeAction, type ActionResult } from "@/lib/utils/api";
import { generateWithClaude } from "@/lib/ai/claude";
import type { Competitor, CompetitorPost } from "@/lib/db/schema";

// ─── Validation ───

const CreateCompetitorSchema = z.object({
  name: z.string().min(1).max(200),
  platform: z.string().min(1),
  handle: z.string().max(200).optional(),
  url: z.string().url().optional().or(z.literal("")),
  niche: z.string().max(200).optional(),
  notes: z.string().max(2000).optional(),
});

const AddPostSchema = z.object({
  competitorId: z.string().min(1),
  postUrl: z.string().url().optional().or(z.literal("")),
  content: z.string().min(1),
  postDate: z.string().optional(),
  metrics: z.string().optional(), // JSON
});

// ─── Types ───

export interface CompetitorWithPosts extends Competitor {
  posts: CompetitorPost[];
  postCount: number;
}

// ─── List Competitors ───

export async function listCompetitors(): Promise<
  ActionResult<CompetitorWithPosts[]>
> {
  return safeAction(async () => {
    const session = await requirePermission("analytics:read");
    const { DB } = getBindings();
    const db = createDb(DB);

    const comps = await db
      .select()
      .from(competitors)
      .where(eq(competitors.workspaceId, session.workspaceId))
      .orderBy(desc(competitors.createdAt))
      .all();

    const result: CompetitorWithPosts[] = [];

    for (const comp of comps) {
      const posts = await db
        .select()
        .from(competitorPosts)
        .where(eq(competitorPosts.competitorId, comp.id))
        .orderBy(desc(competitorPosts.scrapedAt))
        .limit(10)
        .all();

      result.push({
        ...comp,
        posts,
        postCount: posts.length,
      });
    }

    return result;
  });
}

// ─── Create Competitor ───

export async function createCompetitor(
  formData: FormData
): Promise<ActionResult<Competitor>> {
  return safeAction(async () => {
    const session = await requirePermission("analytics:write");
    const { DB } = getBindings();
    const db = createDb(DB);

    const input = CreateCompetitorSchema.parse({
      name: formData.get("name"),
      platform: formData.get("platform"),
      handle: formData.get("handle") || undefined,
      url: formData.get("url") || undefined,
      niche: formData.get("niche") || undefined,
      notes: formData.get("notes") || undefined,
    });

    const id = createId();
    await db.insert(competitors).values({
      id,
      workspaceId: session.workspaceId,
      name: input.name,
      platform: input.platform,
      handle: input.handle ?? null,
      url: input.url || null,
      niche: input.niche ?? null,
      notes: input.notes ?? null,
      isActive: true,
      createdAt: new Date(),
    });

    const comp = await db
      .select()
      .from(competitors)
      .where(eq(competitors.id, id))
      .get();

    return comp!;
  });
}

// ─── Delete Competitor ───

export async function deleteCompetitor(
  competitorId: string
): Promise<ActionResult<{ deleted: boolean }>> {
  return safeAction(async () => {
    const session = await requirePermission("analytics:write");
    const { DB } = getBindings();
    const db = createDb(DB);

    const existing = await db
      .select()
      .from(competitors)
      .where(
        and(
          eq(competitors.id, competitorId),
          eq(competitors.workspaceId, session.workspaceId)
        )
      )
      .get();

    if (!existing) throw new Error("Competitor not found");

    await db.delete(competitors).where(eq(competitors.id, competitorId));
    return { deleted: true };
  });
}

// ─── Add Competitor Post (manual import) ───

export async function addCompetitorPost(
  formData: FormData
): Promise<ActionResult<CompetitorPost>> {
  return safeAction(async () => {
    await requirePermission("analytics:write");
    const { DB } = getBindings();
    const db = createDb(DB);

    const input = AddPostSchema.parse({
      competitorId: formData.get("competitorId"),
      postUrl: formData.get("postUrl") || undefined,
      content: formData.get("content"),
      postDate: formData.get("postDate") || undefined,
      metrics: formData.get("metrics") || undefined,
    });

    const id = createId();
    const now = new Date();

    await db.insert(competitorPosts).values({
      id,
      competitorId: input.competitorId,
      postUrl: input.postUrl || null,
      content: input.content,
      postDate: input.postDate ? new Date(input.postDate) : null,
      metrics: input.metrics ?? null,
      scrapedAt: now,
    });

    const post = await db
      .select()
      .from(competitorPosts)
      .where(eq(competitorPosts.id, id))
      .get();

    return post!;
  });
}

// ─── AI Analyze Competitor Post ───

export async function analyzeCompetitorPost(
  postId: string
): Promise<ActionResult<{ analysis: string }>> {
  return safeAction(async () => {
    await requirePermission("analytics:write");
    const { DB } = getBindings();
    const db = createDb(DB);

    const post = await db
      .select()
      .from(competitorPosts)
      .where(eq(competitorPosts.id, postId))
      .get();

    if (!post) throw new Error("Post not found");

    // Get the competitor for context
    const comp = await db
      .select()
      .from(competitors)
      .where(eq(competitors.id, post.competitorId))
      .get();

    const analysis = await generateWithClaude({
      systemPrompt: `You are a competitive intelligence analyst for a social media marketing platform. Analyze the following competitor post and provide insights on:

1. **Content Strategy** — What format, hook, and structure are they using?
2. **Engagement Drivers** — Why would this content perform well (or poorly)?
3. **Content Gaps** — What topics or angles are they missing that we could capitalize on?
4. **Winning Patterns** — Any repeatable patterns we should adopt?
5. **Actionable Takeaway** — One specific piece of content we should create in response.

Keep the analysis concise and actionable — under 300 words.`,
      userMessage: `Competitor: ${comp?.name ?? "Unknown"} (${comp?.platform ?? "unknown platform"})
Niche: ${comp?.niche ?? "N/A"}

Post content:
${post.content}

${post.metrics ? `Metrics: ${post.metrics}` : ""}`,
      maxTokens: 1024,
      temperature: 0.5,
    });

    // Save analysis
    await db
      .update(competitorPosts)
      .set({ aiAnalysis: analysis })
      .where(eq(competitorPosts.id, postId));

    return { analysis };
  });
}

// ─── Generate Content Opportunity ───

export async function generateContentOpportunity(
  postId: string
): Promise<ActionResult<{ opportunity: string }>> {
  return safeAction(async () => {
    await requirePermission("analytics:write");
    const { DB } = getBindings();
    const db = createDb(DB);

    const post = await db
      .select()
      .from(competitorPosts)
      .where(eq(competitorPosts.id, postId))
      .get();

    if (!post) throw new Error("Post not found");

    const comp = await db
      .select()
      .from(competitors)
      .where(eq(competitors.id, post.competitorId))
      .get();

    const raw = await generateWithClaude({
      systemPrompt: `You are a content strategist for a growing brand. Given a competitor's post, generate a specific, actionable content brief that outperforms it. Return ONLY valid JSON (no markdown) with this structure:
{
  "hook": "Opening line or hook (max 15 words)",
  "angle": "The unique angle or perspective we take",
  "format": "Content format (e.g. carousel, short-form video, long-form article)",
  "outline": ["Point 1", "Point 2", "Point 3"],
  "cta": "Call to action",
  "differentiator": "How this beats the competitor's version in one sentence"
}`,
      userMessage: `Competitor: ${comp?.name ?? "Unknown"} on ${comp?.platform ?? "unknown"}
Niche: ${comp?.niche ?? "N/A"}

Their post:
${post.content}

${post.aiAnalysis ? `Previous analysis:\n${post.aiAnalysis}` : ""}`,
      maxTokens: 1024,
      temperature: 0.7,
    });

    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("AI did not return valid JSON");

    return { opportunity: jsonMatch[0] };
  });
}

// ─── Gap Analysis (batch) ───

export async function runGapAnalysis(): Promise<
  ActionResult<{ insights: string }>
> {
  return safeAction(async () => {
    const session = await requirePermission("analytics:read");
    const { DB } = getBindings();
    const db = createDb(DB);

    // Get all competitor posts with analyses
    const comps = await db
      .select()
      .from(competitors)
      .where(eq(competitors.workspaceId, session.workspaceId))
      .all();

    const allPosts: Array<{ competitor: string; content: string; analysis: string | null }> = [];

    for (const comp of comps) {
      const posts = await db
        .select()
        .from(competitorPosts)
        .where(eq(competitorPosts.competitorId, comp.id))
        .orderBy(desc(competitorPosts.scrapedAt))
        .limit(5)
        .all();

      for (const p of posts) {
        allPosts.push({
          competitor: comp.name,
          content: p.content?.substring(0, 300) ?? "",
          analysis: p.aiAnalysis,
        });
      }
    }

    if (allPosts.length === 0) {
      return { insights: "No competitor posts to analyze. Add some competitor content first." };
    }

    const insights = await generateWithClaude({
      systemPrompt: `You are a competitive strategy analyst. Given a set of competitor posts and their individual analyses, synthesize a gap analysis that identifies:

1. **Common Themes** — What topics are ALL competitors covering?
2. **Underserved Topics** — What are they NOT talking about that matters?
3. **Format Gaps** — What content formats are missing from their strategy?
4. **Timing Patterns** — Any posting frequency or timing insights?
5. **Our Opportunity** — Top 3 content ideas we should create NOW to differentiate.

Be specific and actionable. Under 400 words.`,
      userMessage: JSON.stringify(allPosts),
      maxTokens: 2048,
      temperature: 0.5,
    });

    return { insights };
  });
}
