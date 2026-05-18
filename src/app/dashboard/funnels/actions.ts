"use server";

import { z } from "zod";
import { eq, desc } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";
import { requirePermission } from "@/lib/auth/middleware";
import { getBindings } from "@/lib/cloudflare/bindings";
import { createDb } from "@/lib/db/client";
import { leadMagnets } from "@/lib/db/schema";
import { safeAction, type ActionResult } from "@/lib/utils/api";
import { generateWithClaude } from "@/lib/ai/claude";
import type { LeadMagnet } from "@/lib/db/schema";

// ─── Validation ───

const CreateLeadMagnetSchema = z.object({
  title: z.string().min(1).max(200),
  slug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/),
  description: z.string().max(500).optional(),
  fileUrl: z.string().min(1),
  fileType: z.string().optional(),
  coverUrl: z.string().url().optional(),
});

const UpdateLeadMagnetSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(500).optional(),
  fileUrl: z.string().min(1).optional(),
  fileType: z.string().optional(),
  coverUrl: z.string().url().optional(),
});

// ─── List Lead Magnets ───

export async function listLeadMagnets(): Promise<ActionResult<LeadMagnet[]>> {
  return safeAction(async () => {
    const session = await requirePermission("content:write");
    const { DB } = getBindings();
    const db = createDb(DB);

    return db
      .select()
      .from(leadMagnets)
      .where(eq(leadMagnets.workspaceId, session.workspaceId))
      .orderBy(desc(leadMagnets.createdAt))
      .all();
  });
}

// ─── Create Lead Magnet ───

export async function createLeadMagnet(
  formData: FormData
): Promise<ActionResult<LeadMagnet>> {
  return safeAction(async () => {
    const session = await requirePermission("content:write");
    const { DB } = getBindings();
    const db = createDb(DB);

    const input = CreateLeadMagnetSchema.parse({
      title: formData.get("title"),
      slug: formData.get("slug"),
      description: formData.get("description") || undefined,
      fileUrl: formData.get("fileUrl"),
      fileType: formData.get("fileType") || undefined,
      coverUrl: formData.get("coverUrl") || undefined,
    });

    const id = createId();

    await db.insert(leadMagnets).values({
      id,
      workspaceId: session.workspaceId,
      title: input.title,
      slug: input.slug,
      description: input.description ?? null,
      fileUrl: input.fileUrl,
      fileType: input.fileType ?? null,
      coverUrl: input.coverUrl ?? null,
      downloads: 0,
      createdAt: new Date(),
    });

    const magnet = await db
      .select()
      .from(leadMagnets)
      .where(eq(leadMagnets.id, id))
      .get();

    return magnet!;
  });
}

// ─── Update Lead Magnet ───

export async function updateLeadMagnet(
  formData: FormData
): Promise<ActionResult<LeadMagnet>> {
  return safeAction(async () => {
    const session = await requirePermission("content:write");
    const { DB } = getBindings();
    const db = createDb(DB);

    const input = UpdateLeadMagnetSchema.parse({
      id: formData.get("id"),
      title: formData.get("title") || undefined,
      description: formData.get("description") || undefined,
      fileUrl: formData.get("fileUrl") || undefined,
      fileType: formData.get("fileType") || undefined,
      coverUrl: formData.get("coverUrl") || undefined,
    });

    const existing = await db
      .select()
      .from(leadMagnets)
      .where(eq(leadMagnets.id, input.id))
      .get();

    if (!existing || existing.workspaceId !== session.workspaceId) {
      throw new Error("Lead magnet not found");
    }

    const updates: Record<string, unknown> = {};
    if (input.title !== undefined) updates.title = input.title;
    if (input.description !== undefined) updates.description = input.description;
    if (input.fileUrl !== undefined) updates.fileUrl = input.fileUrl;
    if (input.fileType !== undefined) updates.fileType = input.fileType;
    if (input.coverUrl !== undefined) updates.coverUrl = input.coverUrl;

    await db
      .update(leadMagnets)
      .set(updates)
      .where(eq(leadMagnets.id, input.id));

    const updated = await db
      .select()
      .from(leadMagnets)
      .where(eq(leadMagnets.id, input.id))
      .get();

    return updated!;
  });
}

// ─── Delete Lead Magnet ───

export async function deleteLeadMagnet(
  id: string
): Promise<ActionResult<{ deleted: boolean }>> {
  return safeAction(async () => {
    const session = await requirePermission("content:write");
    const { DB } = getBindings();
    const db = createDb(DB);

    const existing = await db
      .select()
      .from(leadMagnets)
      .where(eq(leadMagnets.id, id))
      .get();

    if (!existing || existing.workspaceId !== session.workspaceId) {
      throw new Error("Lead magnet not found");
    }

    await db.delete(leadMagnets).where(eq(leadMagnets.id, id));
    return { deleted: true };
  });
}

// ─── AI Generate Lead Magnet ───

export interface GeneratedLeadMagnet {
  title: string;
  description: string;
  slug: string;
}

export async function generateLeadMagnetWithAI(
  topic: string
): Promise<ActionResult<GeneratedLeadMagnet>> {
  return safeAction(async () => {
    await requirePermission("content:write");

    const raw = await generateWithClaude({
      systemPrompt: `You are an expert growth marketer. Generate lead magnet metadata in JSON format.
Return ONLY valid JSON with this exact structure, no markdown, no code blocks:
{
  "title": "compelling lead magnet title, 5-10 words",
  "description": "1-2 sentence description of what they get and why it's valuable, under 200 characters",
  "slug": "url-safe-slug-with-hyphens-lowercase-no-spaces"
}`,
      userMessage: `Create a lead magnet for: ${topic}`,
      maxTokens: 300,
    });

    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("AI did not return valid JSON");
    const parsed = JSON.parse(jsonMatch[0]) as GeneratedLeadMagnet;
    if (!parsed.title || !parsed.slug) throw new Error("AI response missing required fields");
    // Sanitize slug just in case
    parsed.slug = parsed.slug.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
    return parsed;
  });
}
