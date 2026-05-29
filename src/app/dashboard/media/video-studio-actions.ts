"use server";

/**
 * Video Studio Server Actions
 *
 * Chains: Claude (script) → ElevenLabs (voice) → Replicate (backgrounds) → Creatomate (render)
 * All heavy lifting is async via MEDIA_QUEUE — the UI polls job status.
 */

import { z } from "zod";
import { eq, and, desc, inArray } from "drizzle-orm";
import { requirePermission } from "@/lib/auth/middleware";
import { getBindings } from "@/lib/cloudflare/bindings";
import { createDb } from "@/lib/db/client";
import { mediaJobs } from "@/lib/db/schema";
import { safeAction, type ActionResult } from "@/lib/utils/api";
import { generateWithClaude } from "@/lib/ai/claude";
import { ElevenLabsClient, type VoiceInfo } from "@/lib/video/elevenlabs-client";
import type { MediaJob } from "@/lib/db/schema";

// ─── Curated voice presets for Reunion's warm/family brand ───────────────────
// These are ElevenLabs pre-built voices — no custom voice needed.

export const REUNION_VOICE_PRESETS = [
  {
    id: "21m00Tcm4TlvDq8ikWAM",
    name: "Rachel",
    description: "Calm, clear, warm — perfect for family storytelling",
    gender: "female",
    recommended: true,
  },
  {
    id: "ErXwobaYiN019PkySvjV",
    name: "Antoni",
    description: "Well-rounded, natural, trustworthy — great for advice content",
    gender: "male",
    recommended: true,
  },
  {
    id: "TxGEqnHWrfWFTfGW9XjX",
    name: "Josh",
    description: "Deep, confident, warm — strong for motivational content",
    gender: "male",
    recommended: false,
  },
  {
    id: "AZnzlk1XvdvUeBnXmlld",
    name: "Domi",
    description: "Strong, engaging, energetic — good for challenge/activity posts",
    gender: "female",
    recommended: false,
  },
  {
    id: "MF3mGyEYCl7XYWbV9V6O",
    name: "Elli",
    description: "Young, bright, approachable — great for humor and relatable content",
    gender: "female",
    recommended: false,
  },
  {
    id: "pNInz6obpgDQGcFmaJgB",
    name: "Adam",
    description: "Neutral, professional, clear — versatile for any content",
    gender: "male",
    recommended: false,
  },
] as const;

// ─── Types ────────────────────────────────────────────────────────────────────

export type VideoFormat = "vertical" | "square" | "horizontal";

export interface VideoJobConfig {
  script: string;
  voiceId: string;
  voiceName: string;
  format: VideoFormat;
  title?: string;
  contentPillar?: string;
  targetPlatforms?: string[];
}

// ─── List ElevenLabs Voices ───────────────────────────────────────────────────

export async function listElevenLabsVoices(): Promise<ActionResult<VoiceInfo[]>> {
  return safeAction(async () => {
    await requirePermission("content:read");
    const { ELEVEN_LABS_API_KEY } = getBindings();

    if (!ELEVEN_LABS_API_KEY) {
      throw new Error("ElevenLabs API key not configured. Add ELEVEN_LABS_API_KEY as a Pages secret.");
    }

    const client = new ElevenLabsClient(ELEVEN_LABS_API_KEY);
    return client.listVoices();
  });
}

// ─── Generate Video Script with Claude ────────────────────────────────────────

const ScriptSchema = z.object({
  topic: z.string().min(1).max(300),
  format: z.enum(["vertical", "square", "horizontal"]),
  contentPillar: z.enum([
    "family_connection",
    "legacy_memory",
    "current_events",
    "engagement",
    "humor",
    "product_awareness",
  ]).default("family_connection"),
  targetDurationSeconds: z.number().min(15).max(90).default(45),
  doctrineMode: z.string().default("balanced"),
});

export async function generateVideoScript(
  formData: FormData
): Promise<ActionResult<{ script: string; title: string; imagePrompts: string[] }>> {
  return safeAction(async () => {
    await requirePermission("content:write");

    const input = ScriptSchema.parse({
      topic: formData.get("topic"),
      format: formData.get("format") ?? "vertical",
      contentPillar: formData.get("contentPillar") ?? "family_connection",
      targetDurationSeconds: parseInt((formData.get("targetDurationSeconds") as string) ?? "45"),
      doctrineMode: formData.get("doctrineMode") ?? "balanced",
    });

    // Words per minute for natural speech ≈ 130 wpm
    const targetWordCount = Math.round((input.targetDurationSeconds / 60) * 130);

    const pillarContext: Record<string, string> = {
      family_connection: "a family activity, challenge, or ritual that brings people together",
      legacy_memory: "preserving family stories, interviewing grandparents, or honoring family history",
      current_events: "a current event or cultural moment reframed through a family connection lens",
      engagement: "a thought-provoking question that gets families reflecting and sharing",
      humor: "a genuinely funny, relatable family moment or generational experience",
      product_awareness: "how the Reunion app helps families stay connected — warm, not salesy",
    };

    const formatNote = input.format === "vertical"
      ? "This is for a vertical Instagram/Facebook Reel. Keep energy up. Hook in the first 3 words."
      : input.format === "square"
      ? "This is for a square social media post. Balanced, clear, engaging."
      : "This is for a horizontal LinkedIn/YouTube video. More depth, slightly longer."

    const generated = await generateWithClaude({
      systemPrompt: `You are a video script writer for Reunion — a family connection app.
Your scripts are warm, human, never corporate. You specialize in ${pillarContext[input.contentPillar]}.
${formatNote}
Scripts should feel like a trusted friend talking, not an ad.`,
      userMessage: `Write a video script for: "${input.topic}"

Target: ~${targetWordCount} words (${input.targetDurationSeconds} seconds of speech)

Format your response as JSON with these exact keys:
{
  "title": "Short punchy title for the video (5-8 words)",
  "script": "The full narration script — just the words spoken, no stage directions",
  "imagePrompts": ["prompt1", "prompt2", "prompt3"]
}

The imagePrompts should be 3 Stable Diffusion prompts for warm, cinematic family photography backgrounds that match the video's mood. Think: golden hour, natural settings, authentic family moments. No text, no logos.`,
      maxTokens: 1000,
    });

    // Parse JSON response
    let parsed: { title: string; script: string; imagePrompts: string[] };
    try {
      // Extract JSON from the response (handle markdown code blocks)
      const jsonMatch = generated.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("No JSON found in response");
      parsed = JSON.parse(jsonMatch[0]);
    } catch {
      // Fallback: treat entire response as script
      parsed = {
        title: input.topic,
        script: generated.trim(),
        imagePrompts: [
          "warm family gathering golden hour, cinematic photography, authentic moment",
          "grandparent and grandchild laughing together, soft natural light, film photography",
          "family dinner table, candles, cozy home, warm tones, documentary style",
        ],
      };
    }

    return parsed;
  });
}

// ─── Create Voiceover Video Job ───────────────────────────────────────────────

export async function createVoiceoverVideoJob(
  formData: FormData
): Promise<ActionResult<{ jobId: string; status: string }>> {
  return safeAction(async () => {
    const session = await requirePermission("content:write");
    const { APP_URL } = getBindings();

    const script = formData.get("script") as string;
    const voiceId = formData.get("voiceId") as string;
    const voiceName = formData.get("voiceName") as string;
    const format = (formData.get("format") as VideoFormat) ?? "vertical";
    const title = (formData.get("title") as string) || "Reunion Video";
    const imagePromptsRaw = formData.get("imagePrompts") as string;

    if (!script?.trim()) throw new Error("Script is required");
    if (!voiceId?.trim()) throw new Error("Voice selection is required");

    let imagePrompts: string[] = [];
    try {
      imagePrompts = imagePromptsRaw ? JSON.parse(imagePromptsRaw) : [];
    } catch { /* use empty */ }

    // Submit to media generation API
    // This queues a video_composite job through MEDIA_QUEUE
    const response = await fetch(`${APP_URL}/api/media/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "video_composite",
        prompt: title,
        provider: "elevenlabs",
        config: {
          script,
          voiceId,
          voiceName,
          format,
          imagePrompts,
          duration: Math.ceil((script.split(" ").length / 130) * 60) + 5, // estimated duration
          resolution: format === "vertical"
            ? { width: 1080, height: 1920 }
            : format === "square"
            ? { width: 1080, height: 1080 }
            : { width: 1920, height: 1080 },
        },
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Failed to queue video job: ${err}`);
    }

    const result = (await response.json()) as { jobId: string; status: string };
    return { jobId: result.jobId, status: result.status };
  });
}

// ─── List Media Jobs ──────────────────────────────────────────────────────────

export async function listMediaJobs(
  typeFilter?: "video_composite" | "image" | "all"
): Promise<ActionResult<MediaJob[]>> {
  return safeAction(async () => {
    const session = await requirePermission("content:read");
    const { DB } = getBindings();
    const db = createDb(DB);

    const videoTypes = ["video_composite"];
    const imageTypes = ["meme", "quote_card", "thumbnail", "promo", "carousel_slide", "ad_creative"];

    const jobs = await db
      .select()
      .from(mediaJobs)
      .where(eq(mediaJobs.workspaceId, session.workspaceId))
      .orderBy(desc(mediaJobs.createdAt))
      .limit(50)
      .all();

    if (typeFilter === "video_composite") {
      return jobs.filter(j => videoTypes.includes(j.type));
    }
    if (typeFilter === "image") {
      return jobs.filter(j => imageTypes.includes(j.type));
    }
    return jobs;
  });
}

export async function getMediaJob(jobId: string): Promise<ActionResult<MediaJob>> {
  return safeAction(async () => {
    const session = await requirePermission("content:read");
    const { DB } = getBindings();
    const db = createDb(DB);

    const job = await db
      .select()
      .from(mediaJobs)
      .where(and(eq(mediaJobs.id, jobId), eq(mediaJobs.workspaceId, session.workspaceId)))
      .get();

    if (!job) throw new Error("Job not found");
    return job;
  });
}
