"use server";

import { z } from "zod";
import { eq, desc, and } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";
import { requirePermission } from "@/lib/auth/middleware";
import { getBindings } from "@/lib/cloudflare/bindings";
import { createDb } from "@/lib/db/client";
import { keywords, pages, internalLinks } from "@/lib/db/schema";
import { safeAction, type ActionResult } from "@/lib/utils/api";
import { generateWithClaude } from "@/lib/ai/claude";
import type { Keyword, Page, InternalLink } from "@/lib/db/schema";

// ═══════════════════════════════════════════
// Keyword Actions
// ═══════════════════════════════════════════

const CreateKeywordSchema = z.object({
  phrase: z.string().min(1).max(200),
  volume: z.coerce.number().int().min(0).optional(),
  difficulty: z.coerce.number().int().min(0).max(100).optional(),
  intent: z
    .enum(["informational", "navigational", "transactional", "commercial"])
    .optional(),
  cluster: z.string().max(100).optional(),
  priority: z.enum(["high", "medium", "low"]).default("medium"),
  targetUrl: z.string().url().optional().or(z.literal("")),
});

const UpdateKeywordSchema = CreateKeywordSchema.partial().extend({
  id: z.string().min(1),
  status: z
    .enum(["research", "targeting", "ranking", "archived"])
    .optional(),
  currentRank: z.coerce.number().int().min(0).optional(),
});

// ─── List Keywords ───

export async function listKeywords(): Promise<ActionResult<Keyword[]>> {
  return safeAction(async () => {
    const session = await requirePermission("content:read");
    const { DB } = getBindings();
    const db = createDb(DB);

    return db
      .select()
      .from(keywords)
      .where(eq(keywords.workspaceId, session.workspaceId))
      .orderBy(desc(keywords.createdAt))
      .all();
  });
}

// ─── Create Keyword ───

export async function createKeyword(
  formData: FormData
): Promise<ActionResult<Keyword>> {
  return safeAction(async () => {
    const session = await requirePermission("content:write");
    const { DB } = getBindings();
    const db = createDb(DB);

    const input = CreateKeywordSchema.parse({
      phrase: formData.get("phrase"),
      volume: formData.get("volume") || undefined,
      difficulty: formData.get("difficulty") || undefined,
      intent: formData.get("intent") || undefined,
      cluster: formData.get("cluster") || undefined,
      priority: formData.get("priority") || "medium",
      targetUrl: formData.get("targetUrl") || undefined,
    });

    const id = createId();
    const now = new Date();

    await db.insert(keywords).values({
      id,
      workspaceId: session.workspaceId,
      phrase: input.phrase,
      volume: input.volume ?? null,
      difficulty: input.difficulty ?? null,
      intent: input.intent ?? null,
      cluster: input.cluster ?? null,
      priority: input.priority,
      status: "research",
      targetUrl: input.targetUrl || null,
      createdAt: now,
    });

    const keyword = await db
      .select()
      .from(keywords)
      .where(eq(keywords.id, id))
      .get();

    return keyword!;
  });
}

// ─── Update Keyword ───

export async function updateKeyword(
  data: Record<string, unknown>
): Promise<ActionResult<{ updated: boolean }>> {
  return safeAction(async () => {
    const session = await requirePermission("content:write");
    const { DB } = getBindings();
    const db = createDb(DB);

    const input = UpdateKeywordSchema.parse(data);
    const { id, ...updates } = input;

    // Verify ownership
    const existing = await db
      .select()
      .from(keywords)
      .where(
        and(
          eq(keywords.id, id),
          eq(keywords.workspaceId, session.workspaceId)
        )
      )
      .get();

    if (!existing) throw new Error("Keyword not found");

    const setValues: Record<string, unknown> = {};
    if (updates.phrase !== undefined) setValues.phrase = updates.phrase;
    if (updates.volume !== undefined) setValues.volume = updates.volume;
    if (updates.difficulty !== undefined) setValues.difficulty = updates.difficulty;
    if (updates.intent !== undefined) setValues.intent = updates.intent;
    if (updates.cluster !== undefined) setValues.cluster = updates.cluster;
    if (updates.priority !== undefined) setValues.priority = updates.priority;
    if (updates.status !== undefined) setValues.status = updates.status;
    if (updates.currentRank !== undefined) setValues.currentRank = updates.currentRank;
    if (updates.targetUrl !== undefined) setValues.targetUrl = updates.targetUrl || null;

    await db
      .update(keywords)
      .set(setValues)
      .where(eq(keywords.id, id));

    return { updated: true };
  });
}

// ─── Delete Keyword ───

export async function deleteKeyword(
  keywordId: string
): Promise<ActionResult<{ deleted: boolean }>> {
  return safeAction(async () => {
    const session = await requirePermission("content:write");
    const { DB } = getBindings();
    const db = createDb(DB);

    const existing = await db
      .select()
      .from(keywords)
      .where(
        and(
          eq(keywords.id, keywordId),
          eq(keywords.workspaceId, session.workspaceId)
        )
      )
      .get();

    if (!existing) throw new Error("Keyword not found");

    await db.delete(keywords).where(eq(keywords.id, keywordId));
    return { deleted: true };
  });
}

// ─── AI Keyword Suggestions ───

export async function suggestKeywords(
  topic: string
): Promise<ActionResult<Array<{ phrase: string; intent: string; difficulty: string }>>> {
  return safeAction(async () => {
    await requirePermission("content:write");

    const result = await generateWithClaude({
      systemPrompt: `You are an SEO keyword research expert. Given a topic, suggest 10-15 keyword phrases with their likely search intent and estimated difficulty level. Return a JSON array with objects containing: "phrase" (the keyword), "intent" (informational|navigational|transactional|commercial), "difficulty" (low|medium|high). Focus on a mix of head terms and long-tail keywords. Return ONLY the JSON array, no other text.`,
      userMessage: `Suggest SEO keywords for the topic: "${topic}"`,
      maxTokens: 2048,
      temperature: 0.7,
    });

    try {
      const parsed = JSON.parse(result) as Array<{
        phrase: string;
        intent: string;
        difficulty: string;
      }>;
      return parsed;
    } catch {
      throw new Error("Failed to parse AI keyword suggestions");
    }
  });
}

// ═══════════════════════════════════════════
// Page Actions
// ═══════════════════════════════════════════

const CreatePageSchema = z.object({
  slug: z.string().min(1).max(200).regex(/^[a-z0-9-]+$/),
  title: z.string().min(1).max(200),
  metaTitle: z.string().max(60).optional(),
  metaDesc: z.string().max(155).optional(),
  h1: z.string().max(200).optional(),
  body: z.string().optional(),
  schemaType: z
    .enum(["Article", "FAQPage", "HowTo", "Product", "Organization"])
    .optional(),
  canonicalUrl: z.string().url().optional().or(z.literal("")),
});

// ─── List Pages ───

export async function listPages(): Promise<ActionResult<Page[]>> {
  return safeAction(async () => {
    const session = await requirePermission("content:read");
    const { DB } = getBindings();
    const db = createDb(DB);

    return db
      .select()
      .from(pages)
      .where(eq(pages.workspaceId, session.workspaceId))
      .orderBy(desc(pages.updatedAt))
      .all();
  });
}

// ─── Create Page ───

export async function createPage(
  formData: FormData
): Promise<ActionResult<Page>> {
  return safeAction(async () => {
    const session = await requirePermission("content:write");
    const { DB } = getBindings();
    const db = createDb(DB);

    const input = CreatePageSchema.parse({
      slug: formData.get("slug"),
      title: formData.get("title"),
      metaTitle: formData.get("metaTitle") || undefined,
      metaDesc: formData.get("metaDesc") || undefined,
      h1: formData.get("h1") || undefined,
      body: formData.get("body") || undefined,
      schemaType: formData.get("schemaType") || undefined,
      canonicalUrl: formData.get("canonicalUrl") || undefined,
    });

    const id = createId();
    const now = new Date();

    // Auto-generate JSON-LD if schema type provided
    let schemaJson: string | null = null;
    if (input.schemaType) {
      schemaJson = generateSchemaJson(input.schemaType, {
        title: input.title,
        description: input.metaDesc,
        slug: input.slug,
      });
    }

    await db.insert(pages).values({
      id,
      workspaceId: session.workspaceId,
      slug: input.slug,
      title: input.title,
      metaTitle: input.metaTitle ?? null,
      metaDesc: input.metaDesc ?? null,
      h1: input.h1 ?? null,
      body: input.body ?? null,
      schemaType: input.schemaType ?? null,
      schemaJson,
      canonicalUrl: input.canonicalUrl || null,
      pageStatus: "draft",
      createdAt: now,
      updatedAt: now,
    });

    const page = await db
      .select()
      .from(pages)
      .where(eq(pages.id, id))
      .get();

    return page!;
  });
}

// ─── Update Page ───

export async function updatePage(
  pageId: string,
  data: Record<string, unknown>
): Promise<ActionResult<{ updated: boolean }>> {
  return safeAction(async () => {
    const session = await requirePermission("content:write");
    const { DB } = getBindings();
    const db = createDb(DB);

    const existing = await db
      .select()
      .from(pages)
      .where(
        and(
          eq(pages.id, pageId),
          eq(pages.workspaceId, session.workspaceId)
        )
      )
      .get();

    if (!existing) throw new Error("Page not found");

    await db
      .update(pages)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(pages.id, pageId));

    return { updated: true };
  });
}

// ─── Publish Page ───

export async function publishPage(
  pageId: string
): Promise<ActionResult<{ published: boolean }>> {
  return safeAction(async () => {
    const session = await requirePermission("content:write");
    const { DB } = getBindings();
    const db = createDb(DB);

    const existing = await db
      .select()
      .from(pages)
      .where(
        and(
          eq(pages.id, pageId),
          eq(pages.workspaceId, session.workspaceId)
        )
      )
      .get();

    if (!existing) throw new Error("Page not found");

    await db
      .update(pages)
      .set({
        pageStatus: "published",
        publishedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(pages.id, pageId));

    return { published: true };
  });
}

// ─── Delete Page ───

export async function deletePage(
  pageId: string
): Promise<ActionResult<{ deleted: boolean }>> {
  return safeAction(async () => {
    const session = await requirePermission("content:write");
    const { DB } = getBindings();
    const db = createDb(DB);

    const existing = await db
      .select()
      .from(pages)
      .where(and(eq(pages.id, pageId), eq(pages.workspaceId, session.workspaceId)))
      .get();

    if (!existing) throw new Error("Page not found");
    await db.delete(pages).where(eq(pages.id, pageId));
    return { deleted: true };
  });
}

// ─── AI Page Generation ───

interface GeneratedPage {
  title: string;
  metaTitle: string;
  metaDesc: string;
  h1: string;
  body: string;
  schemaType: string;
}

export async function generatePageWithAI(
  topic: string
): Promise<ActionResult<GeneratedPage>> {
  return safeAction(async () => {
    await requirePermission("content:write");

    const raw = await generateWithClaude({
      systemPrompt: `You are an SEO content strategist. Generate a complete SEO-optimized page for the given topic.
Return ONLY valid JSON (no markdown, no code blocks) with this exact structure:
{
  "title": "Page title (50-60 chars)",
  "metaTitle": "Meta title (50-60 chars, include primary keyword)",
  "metaDesc": "Meta description (140-155 chars, compelling, with CTA)",
  "h1": "H1 heading (keyword-rich, engaging)",
  "body": "Full page body in clean HTML using <h2>, <p>, <ul>, <li> tags. Minimum 400 words. Include FAQ section at end.",
  "schemaType": "Article|FAQPage|HowTo|Product|Organization"
}`,
      userMessage: `Generate a complete SEO page for: "${topic}"`,
      maxTokens: 3000,
      temperature: 0.5,
    });

    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("AI did not return valid JSON");
    return JSON.parse(jsonMatch[0]) as GeneratedPage;
  });
}

// ─── Create Keyword From AI Suggestion ───

export async function createKeywordFromSuggestion(opts: {
  phrase: string;
  intent: string;
  difficulty: string;
}): Promise<ActionResult<Keyword>> {
  return safeAction(async () => {
    const session = await requirePermission("content:write");
    const { DB } = getBindings();
    const db = createDb(DB);

    const difficultyMap: Record<string, number> = { low: 20, medium: 55, high: 80 };
    const numericDifficulty = difficultyMap[opts.difficulty] ?? 50;

    const validIntents = ["informational", "navigational", "transactional", "commercial"];
    const intent = validIntents.includes(opts.intent)
      ? (opts.intent as "informational" | "navigational" | "transactional" | "commercial")
      : undefined;

    const id = createId();
    const now = new Date();

    await db.insert(keywords).values({
      id,
      workspaceId: session.workspaceId,
      phrase: opts.phrase,
      volume: null,
      difficulty: numericDifficulty,
      intent: intent ?? null,
      cluster: null,
      priority: "medium",
      status: "research",
      targetUrl: null,
      createdAt: now,
    });

    const keyword = await db.select().from(keywords).where(eq(keywords.id, id)).get();
    return keyword!;
  });
}

// ─── Schema JSON Generator ───

function generateSchemaJson(
  schemaType: string,
  data: { title: string; description?: string; slug: string }
): string {
  const base = {
    "@context": "https://schema.org",
    "@type": schemaType,
    name: data.title,
    description: data.description ?? "",
    url: `{{APP_URL}}/${data.slug}`,
  };

  switch (schemaType) {
    case "Article":
      return JSON.stringify({
        ...base,
        "@type": "Article",
        headline: data.title,
        datePublished: new Date().toISOString(),
        dateModified: new Date().toISOString(),
      });
    case "FAQPage":
      return JSON.stringify({
        ...base,
        "@type": "FAQPage",
        mainEntity: [],
      });
    case "HowTo":
      return JSON.stringify({
        ...base,
        "@type": "HowTo",
        step: [],
      });
    case "Product":
      return JSON.stringify({
        ...base,
        "@type": "Product",
        offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      });
    case "Organization":
      return JSON.stringify({
        ...base,
        "@type": "Organization",
        logo: "",
        contactPoint: [],
      });
    default:
      return JSON.stringify(base);
  }
}
