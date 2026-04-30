"use server";

import { z } from "zod";
import { eq, desc } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";
import { requirePermission } from "@/lib/auth/middleware";
import { getBindings } from "@/lib/cloudflare/bindings";
import { createDb } from "@/lib/db/client";
import { leadMagnets } from "@/lib/db/schema";
import { safeAction, type ActionResult } from "@/lib/utils/api";
import type { LeadMagnet } from "@/lib/db/schema";

// ─── Validation ───

const CreateLeadMagnetSchema = z.object({
  title: z.string().min(1).max(200),
  slug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/),
  description: z.string().max(500).optional(),
  type: z.enum(["ebook", "checklist", "template", "course", "webinar", "other"]),
  fileR2Key: z.string().optional(),
  redirectUrl: z.string().url().optional(),
});

const UpdateLeadMagnetSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(500).optional(),
  type: z.enum(["ebook", "checklist", "template", "course", "webinar", "other"]).optional(),
  fileR2Key: z.string().optional(),
  redirectUrl: z.string().url().optional(),
  isActive: z.boolean().optional(),
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
      type: formData.get("type") || "other",
      fileR2Key: formData.get("fileR2Key") || undefined,
      redirectUrl: formData.get("redirectUrl") || undefined,
    });

    const id = createId();

    await db.insert(leadMagnets).values({
      id,
      workspaceId: session.workspaceId,
      title: input.title,
      slug: input.slug,
      description: input.description ?? null,
      type: input.type,
      fileR2Key: input.fileR2Key ?? null,
      redirectUrl: input.redirectUrl ?? null,
      isActive: true,
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
      type: formData.get("type") || undefined,
      fileR2Key: formData.get("fileR2Key") || undefined,
      redirectUrl: formData.get("redirectUrl") || undefined,
      isActive: formData.get("isActive") === "true" ? true : formData.get("isActive") === "false" ? false : undefined,
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
    if (input.type !== undefined) updates.type = input.type;
    if (input.fileR2Key !== undefined) updates.fileR2Key = input.fileR2Key;
    if (input.redirectUrl !== undefined) updates.redirectUrl = input.redirectUrl;
    if (input.isActive !== undefined) updates.isActive = input.isActive;

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

// ─── Toggle Active Status ───

export async function toggleLeadMagnetActive(
  id: string
): Promise<ActionResult<{ isActive: boolean }>> {
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

    const newStatus = !existing.isActive;
    await db
      .update(leadMagnets)
      .set({ isActive: newStatus })
      .where(eq(leadMagnets.id, id));

    return { isActive: newStatus };
  });
}
