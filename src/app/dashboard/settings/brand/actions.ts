"use server";

import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";
import { requirePermission } from "@/lib/auth/middleware";
import { getBindings } from "@/lib/cloudflare/bindings";
import { createDb } from "@/lib/db/client";
import { brandProfiles, brandColors, brandAssets } from "@/lib/db/schema";
import { safeAction, type ActionResult } from "@/lib/utils/api";
import type { BrandProfile, BrandColor } from "@/lib/db/schema";

// ─── Validation Schemas ───

const BrandProfileSchema = z.object({
  brandName: z.string().min(1).max(100),
  tagline: z.string().max(200).optional(),
  mission: z.string().min(1).max(1000),
  vision: z.string().max(1000).optional(),
  tone: z.string().min(1).max(500),
  audience: z.string().min(1), // JSON string
  keywords: z.string().optional(), // JSON string
  guidelines: z.string().max(5000).optional(),
});

const BrandColorSchema = z.object({
  label: z.string().min(1).max(50),
  hex: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Must be a valid hex color"),
  usage: z.string().max(200).optional(),
});

// ─── Brand Profile Actions ───

export async function getBrandProfile(): Promise<
  ActionResult<BrandProfile | null>
> {
  return safeAction(async () => {
    const session = await requirePermission("content:read");
    const { DB } = getBindings();
    const db = createDb(DB);

    const profile = await db
      .select()
      .from(brandProfiles)
      .where(eq(brandProfiles.workspaceId, session.workspaceId))
      .get();

    return profile ?? null;
  });
}

export async function upsertBrandProfile(
  formData: FormData
): Promise<ActionResult<BrandProfile>> {
  return safeAction(async () => {
    const session = await requirePermission("content:write");
    const { DB } = getBindings();
    const db = createDb(DB);

    const input = BrandProfileSchema.parse({
      brandName: formData.get("brandName"),
      tagline: formData.get("tagline") || undefined,
      mission: formData.get("mission"),
      vision: formData.get("vision") || undefined,
      tone: formData.get("tone"),
      audience: formData.get("audience"),
      keywords: formData.get("keywords") || undefined,
      guidelines: formData.get("guidelines") || undefined,
    });

    // Check if profile exists
    const existing = await db
      .select()
      .from(brandProfiles)
      .where(eq(brandProfiles.workspaceId, session.workspaceId))
      .get();

    if (existing) {
      await db
        .update(brandProfiles)
        .set({ ...input, updatedAt: new Date() })
        .where(eq(brandProfiles.id, existing.id));

      return { ...existing, ...input, updatedAt: new Date() };
    }

    const id = createId();
    const now = new Date();
    const newProfile = {
      id,
      workspaceId: session.workspaceId,
      ...input,
      createdAt: now,
      updatedAt: now,
    };

    await db.insert(brandProfiles).values(newProfile);
    return newProfile as BrandProfile;
  });
}

// ─── Brand Color Actions ───

export async function getBrandColors(): Promise<ActionResult<BrandColor[]>> {
  return safeAction(async () => {
    const session = await requirePermission("content:read");
    const { DB } = getBindings();
    const db = createDb(DB);

    const profile = await db
      .select()
      .from(brandProfiles)
      .where(eq(brandProfiles.workspaceId, session.workspaceId))
      .get();

    if (!profile) return [];

    const colors = await db
      .select()
      .from(brandColors)
      .where(eq(brandColors.brandId, profile.id))
      .all();

    return colors;
  });
}

export async function addBrandColor(
  formData: FormData
): Promise<ActionResult<BrandColor>> {
  return safeAction(async () => {
    const session = await requirePermission("content:write");
    const { DB } = getBindings();
    const db = createDb(DB);

    const input = BrandColorSchema.parse({
      label: formData.get("label"),
      hex: formData.get("hex"),
      usage: formData.get("usage") || undefined,
    });

    const profile = await db
      .select()
      .from(brandProfiles)
      .where(eq(brandProfiles.workspaceId, session.workspaceId))
      .get();

    if (!profile) {
      throw new Error("Create a brand profile first");
    }

    const id = createId();
    const newColor = { id, brandId: profile.id, ...input };
    await db.insert(brandColors).values(newColor);

    return newColor as BrandColor;
  });
}

export async function deleteBrandColor(
  colorId: string
): Promise<ActionResult<{ deleted: boolean }>> {
  return safeAction(async () => {
    await requirePermission("content:write");
    const { DB } = getBindings();
    const db = createDb(DB);

    await db.delete(brandColors).where(eq(brandColors.id, colorId));
    return { deleted: true };
  });
}
