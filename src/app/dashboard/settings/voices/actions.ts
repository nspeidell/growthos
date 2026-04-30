"use server";

import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";
import { requirePermission } from "@/lib/auth/middleware";
import { getBindings } from "@/lib/cloudflare/bindings";
import { createDb } from "@/lib/db/client";
import { voiceProfiles } from "@/lib/db/schema";
import { safeAction, type ActionResult } from "@/lib/utils/api";
import type { VoiceProfile } from "@/lib/db/schema";

// ─── Validation ───

const CreateVoiceProfileSchema = z.object({
  name: z.string().min(1).max(100),
  elevenLabsVoiceId: z.string().min(1),
  voiceSampleUrl: z.string().url().optional(),
  stability: z.coerce.number().min(0).max(1).default(0.5),
  similarityBoost: z.coerce.number().min(0).max(1).default(0.75),
  isFounderVoice: z.boolean().default(false),
});

// ─── List Voice Profiles ───

export async function listVoiceProfilesFull(): Promise<ActionResult<VoiceProfile[]>> {
  return safeAction(async () => {
    const session = await requirePermission("content:write");
    const { DB } = getBindings();
    const db = createDb(DB);

    return db
      .select()
      .from(voiceProfiles)
      .where(eq(voiceProfiles.workspaceId, session.workspaceId))
      .all();
  });
}

// ─── Create Voice Profile ───

export async function createVoiceProfile(
  formData: FormData
): Promise<ActionResult<VoiceProfile>> {
  return safeAction(async () => {
    const session = await requirePermission("content:write");
    const { DB } = getBindings();
    const db = createDb(DB);

    const input = CreateVoiceProfileSchema.parse({
      name: formData.get("name"),
      elevenLabsVoiceId: formData.get("elevenLabsVoiceId"),
      voiceSampleUrl: formData.get("voiceSampleUrl") || undefined,
      stability: formData.get("stability") || 0.5,
      similarityBoost: formData.get("similarityBoost") || 0.75,
      isFounderVoice: formData.get("isFounderVoice") === "true",
    });

    // If setting as founder voice, clear existing founder flag
    if (input.isFounderVoice) {
      await db
        .update(voiceProfiles)
        .set({ isFounderVoice: false })
        .where(
          and(
            eq(voiceProfiles.workspaceId, session.workspaceId),
            eq(voiceProfiles.isFounderVoice, true)
          )
        );
    }

    const id = createId();
    await db.insert(voiceProfiles).values({
      id,
      workspaceId: session.workspaceId,
      name: input.name,
      elevenLabsVoiceId: input.elevenLabsVoiceId,
      voiceSampleUrl: input.voiceSampleUrl ?? null,
      stability: input.stability,
      similarityBoost: input.similarityBoost,
      isFounderVoice: input.isFounderVoice,
      createdAt: new Date(),
    });

    const profile = await db
      .select()
      .from(voiceProfiles)
      .where(eq(voiceProfiles.id, id))
      .get();

    return profile!;
  });
}

// ─── Set Founder Voice ───

export async function setFounderVoice(
  profileId: string
): Promise<ActionResult<{ success: boolean }>> {
  return safeAction(async () => {
    const session = await requirePermission("content:write");
    const { DB } = getBindings();
    const db = createDb(DB);

    // Clear existing
    await db
      .update(voiceProfiles)
      .set({ isFounderVoice: false })
      .where(
        and(
          eq(voiceProfiles.workspaceId, session.workspaceId),
          eq(voiceProfiles.isFounderVoice, true)
        )
      );

    // Set new
    await db
      .update(voiceProfiles)
      .set({ isFounderVoice: true })
      .where(eq(voiceProfiles.id, profileId));

    return { success: true };
  });
}

// ─── Delete Voice Profile ───

export async function deleteVoiceProfile(
  profileId: string
): Promise<ActionResult<{ deleted: boolean }>> {
  return safeAction(async () => {
    const session = await requirePermission("content:write");
    const { DB } = getBindings();
    const db = createDb(DB);

    const existing = await db
      .select()
      .from(voiceProfiles)
      .where(eq(voiceProfiles.id, profileId))
      .get();

    if (!existing || existing.workspaceId !== session.workspaceId) {
      throw new Error("Voice profile not found");
    }

    await db.delete(voiceProfiles).where(eq(voiceProfiles.id, profileId));
    return { deleted: true };
  });
}
