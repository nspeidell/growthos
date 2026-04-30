/**
 * POST /api/media/generate
 *
 * Public-facing API for media generation (image + video composite).
 * Requires authentication via session.
 * Supports:
 * - Standard image jobs (meme, quote_card, thumbnail, etc.)
 * - Video composite jobs with cloned voice narration
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";
import { getBindings } from "@/lib/cloudflare/bindings";
import { createDb } from "@/lib/db/client";
import { mediaJobs, voiceProfiles } from "@/lib/db/schema";
import { requirePermission } from "@/lib/auth/middleware";

export const runtime = "edge";

const GenerateSchema = z.object({
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
  provider: z.enum(["replicate", "together", "cloudflare", "elevenlabs"]).optional(),
  voiceProfileId: z.string().optional(),
  config: z
    .object({
      emotionalVibe: z.string().optional(),
      subjectTags: z.array(z.string()).optional(),
      script: z.string().optional(),
      duration: z.number().min(5).max(120).optional(),
      resolution: z
        .object({
          width: z.number(),
          height: z.number(),
        })
        .optional(),
    })
    .optional(),
});

export async function POST(request: NextRequest) {
  const session = await requirePermission("content:write");
  const env = getBindings();
  const db = createDb(env.DB);

  let input: z.infer<typeof GenerateSchema>;
  try {
    const body = await request.json();
    input = GenerateSchema.parse(body);
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }

  // Validate voice profile if specified
  if (input.voiceProfileId) {
    const profile = await db
      .select()
      .from(voiceProfiles)
      .where(eq(voiceProfiles.id, input.voiceProfileId))
      .get();

    if (!profile || profile.workspaceId !== session.workspaceId) {
      return NextResponse.json(
        { error: "Voice profile not found" },
        { status: 404 }
      );
    }
  }

  // Determine provider
  const provider =
    input.provider ??
    (input.type === "video_composite" ? "elevenlabs" : "replicate");

  // For video_composite, ensure script is present
  if (input.type === "video_composite") {
    const script = input.config?.script ?? input.prompt;
    if (!script || script.trim().length === 0) {
      return NextResponse.json(
        { error: "Video composite requires a script (narration text)" },
        { status: 400 }
      );
    }
  }

  // Create the job
  const id = createId();
  const now = new Date();

  await db.insert(mediaJobs).values({
    id,
    workspaceId: session.workspaceId,
    type: input.type,
    prompt: input.prompt,
    provider,
    voiceProfileId: input.voiceProfileId ?? null,
    config: input.config ? JSON.stringify(input.config) : null,
    status: "queued",
    createdBy: session.userId,
    createdAt: now,
  });

  // Send to media generation queue
  await env.MEDIA_QUEUE.send({
    jobId: id,
    type: input.type,
    prompt: input.prompt,
    provider,
    config: input.config ? JSON.stringify(input.config) : undefined,
    workspaceId: session.workspaceId,
    voiceProfileId: input.voiceProfileId,
  });

  return NextResponse.json({
    success: true,
    jobId: id,
    status: "queued",
    type: input.type,
  });
}
