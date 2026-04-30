"use server";

import { z } from "zod";
import { eq, desc } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";
import { requirePermission } from "@/lib/auth/middleware";
import { getBindings } from "@/lib/cloudflare/bindings";
import { createDb } from "@/lib/db/client";
import { mediaJobs } from "@/lib/db/schema";
import { safeAction, type ActionResult } from "@/lib/utils/api";
import type { MediaJob } from "@/lib/db/schema";

// ─── Validation ───

const CreateMediaJobSchema = z.object({
  type: z.enum([
    "meme",
    "quote_card",
    "thumbnail",
    "promo",
    "carousel_slide",
    "ad_creative",
    "video_composite",
  ]),
  prompt: z.string().min(1).max(5000),
  provider: z.enum(["replicate", "together", "cloudflare", "elevenlabs"]),
  config: z.string().optional(), // JSON config
  voiceProfileId: z.string().optional(),
});

// ─── List Media Jobs ───

export async function listMediaJobs(): Promise<ActionResult<MediaJob[]>> {
  return safeAction(async () => {
    const session = await requirePermission("content:read");
    const { DB } = getBindings();
    const db = createDb(DB);

    const jobs = await db
      .select()
      .from(mediaJobs)
      .where(eq(mediaJobs.workspaceId, session.workspaceId))
      .orderBy(desc(mediaJobs.createdAt))
      .all();

    return jobs;
  });
}

// ─── Create Media Job ───

export async function createMediaJob(
  formData: FormData
): Promise<ActionResult<MediaJob>> {
  return safeAction(async () => {
    const session = await requirePermission("content:write");
    const { DB, MEDIA_QUEUE } = getBindings();
    const db = createDb(DB);

    const input = CreateMediaJobSchema.parse({
      type: formData.get("type"),
      prompt: formData.get("prompt"),
      provider: formData.get("provider"),
      config: formData.get("config") || undefined,
      voiceProfileId: formData.get("voiceProfileId") || undefined,
    });

    const id = createId();
    const now = new Date();

    const job = {
      id,
      workspaceId: session.workspaceId,
      type: input.type,
      prompt: input.prompt,
      provider: input.provider,
      config: input.config,
      voiceProfileId: input.voiceProfileId ?? null,
      status: "queued" as const,
      createdBy: session.userId,
      createdAt: now,
    };

    await db.insert(mediaJobs).values(job);

    // Send to media generation queue
    await MEDIA_QUEUE.send({
      jobId: id,
      type: input.type,
      prompt: input.prompt,
      provider: input.provider,
      config: input.config,
      workspaceId: session.workspaceId,
      voiceProfileId: input.voiceProfileId,
    });

    return job as MediaJob;
  });
}

// ─── Get Media Job ───

export async function getMediaJob(
  jobId: string
): Promise<ActionResult<MediaJob | null>> {
  return safeAction(async () => {
    await requirePermission("content:read");
    const { DB } = getBindings();
    const db = createDb(DB);

    const job = await db
      .select()
      .from(mediaJobs)
      .where(eq(mediaJobs.id, jobId))
      .get();

    return job ?? null;
  });
}
