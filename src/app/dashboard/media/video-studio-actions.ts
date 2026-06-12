"use server";

/**
 * Video Studio Server Actions
 *
 * Chains: Claude (script) → ElevenLabs (voice) → Replicate (backgrounds) → Creatomate (render)
 * All heavy lifting is async via MEDIA_QUEUE — the UI polls job status.
 */

import { z } from "zod";
import { eq, and, desc } from "drizzle-orm";
import { requirePermission } from "@/lib/auth/middleware";
import { getBindings } from "@/lib/cloudflare/bindings";
import { createDb } from "@/lib/db/client";
import { mediaJobs, contentAssets, contentProjects, scheduledPosts, connectedAccounts } from "@/lib/db/schema";
import { safeAction, type ActionResult } from "@/lib/utils/api";
import type { NewScheduledPost } from "@/lib/db/schema";
import { generateWithClaude } from "@/lib/ai/claude";
import { ElevenLabsClient, type VoiceInfo } from "@/lib/video/elevenlabs-client";
export type { VoiceInfo };
import { createId } from "@paralleldrive/cuid2";
import type { MediaJob } from "@/lib/db/schema";

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
    const { DB } = getBindings();
    const db = createDb(DB);

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

    const duration = Math.ceil((script.split(" ").length / 130) * 60) + 5;
    const config = { script, voiceId, voiceName, format, imagePrompts, duration };

    // Insert into D1 with status='queued'. The growthos-media-gen cron Worker
    // polls D1 every minute and picks this up — no queue binding needed in Pages.
    const id = createId();
    await db.insert(mediaJobs).values({
      id,
      workspaceId: session.workspaceId,
      type: "video_composite",
      prompt: title,
      provider: "elevenlabs",
      config: JSON.stringify(config),
      status: "queued",
      createdBy: session.userId,
      createdAt: new Date(),
    });

    return { jobId: id, status: "queued" };
  });
}

// ─── List Media Jobs ──────────────────────────────────────────────────────────

export async function listMediaJobs(
  typeFilter?: "video_composite" | "image" | "carousel" | "all"
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
    if (typeFilter === "carousel") {
      return jobs.filter(j => j.type === "carousel");
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

// ─── Schedule Video Post ──────────────────────────────────────────────────────

export interface ScheduleVideoResult {
  scheduled: number;
  skipped: string[];
}

// scheduleVideoPost is an alias for scheduleMediaPost — handles both video and image
export const scheduleVideoPost = async (fd: FormData) => scheduleMediaPost(fd, "video");
export const scheduleImagePost = async (fd: FormData) => scheduleMediaPost(fd, "image");

async function scheduleMediaPost(formData: FormData, mediaType: "video" | "image"): Promise<ActionResult<ScheduleVideoResult>> {
  return safeAction(async () => {
    const session = await requirePermission("publish:queue");
    const { DB } = getBindings();
    const db = createDb(DB);

    const jobId = formData.get("jobId") as string;
    const caption = formData.get("caption") as string;
    const scheduledFor = formData.get("scheduledFor") as string;
    const platformsRaw = formData.get("platforms") as string;
    const platforms: string[] = platformsRaw ? JSON.parse(platformsRaw) : [];

    if (!jobId) throw new Error("jobId is required");
    if (!platforms.length) throw new Error("Select at least one platform");
    if (!scheduledFor) throw new Error("Schedule time is required");

    // Get the completed media job
    const job = await db.select().from(mediaJobs)
      .where(and(eq(mediaJobs.id, jobId), eq(mediaJobs.workspaceId, session.workspaceId)))
      .get();

    if (!job) throw new Error("Media job not found");
    if (job.status !== "completed" || !job.resultR2Key) throw new Error("Media is not ready yet");

    // Public R2 URL — accessible by external services (Instagram, Facebook, etc.)
    const R2_PUBLIC_URL = "https://pub-fff12e42fe61481ea170c0c8c2e1e3bf.r2.dev";
    const mediaUrl = `${R2_PUBLIC_URL}/${job.resultR2Key}`;

    // Get active connected accounts for this workspace
    const accounts = await db.select().from(connectedAccounts)
      .where(eq(connectedAccounts.workspaceId, session.workspaceId))
      .all();
    const activeAccounts = accounts.filter(a => a.accountStatus === "active");

    // Create a shared content project + one asset per platform
    const projectId = createId();
    const now = new Date();
    type ContentAssetInsert = typeof contentAssets.$inferInsert;
    type ContentProjectInsert = typeof contentProjects.$inferInsert;

    const project: ContentProjectInsert = {
      id: projectId,
      workspaceId: session.workspaceId,
      title: job.prompt,
      brief: caption,
      doctrineMode: "balanced",
      createdBy: session.userId,
      createdAt: now,
    };
    await db.insert(contentProjects).values(project);

    let scheduled = 0;
    const skipped: string[] = [];

    for (const platform of platforms) {
      const account = activeAccounts.find(a => a.platform === platform);
      if (!account) { skipped.push(platform); continue; }

      const assetId = createId();
      const asset: ContentAssetInsert = {
        id: assetId,
        projectId,
        platform: platform as ContentAssetInsert["platform"],
        type: "reel_script" as ContentAssetInsert["type"],
        body: caption,
        version: 1,
        status: "approved",
        createdAt: now,
      };
      await db.insert(contentAssets).values(asset);

      const postId = createId();
      await db.insert(scheduledPosts).values({
        id: postId,
        workspaceId: session.workspaceId,
        contentAssetId: assetId,
        connectedAccountId: account.id,
        platform: platform as NewScheduledPost["platform"],
        scheduledFor: new Date(scheduledFor),
        approvalMode: "autonomous",
        postStatus: "queued",
        metadata: JSON.stringify({ mediaUrl, mediaType }),
        createdBy: session.userId,
        createdAt: now,
        updatedAt: now,
      });
      scheduled++;
    }

    return { scheduled, skipped };
  });
}

// ─── Carousel Generation ──────────────────────────────────────────────────────

export interface CarouselSlide {
  slideNumber: number;
  headline: string;
  body: string;
  imagePrompt: string;
}

export async function generateCarouselSlides(
  formData: FormData
): Promise<ActionResult<{ slides: CarouselSlide[]; title: string; caption: string }>> {
  return safeAction(async () => {
    await requirePermission("content:write");

    const topic = formData.get("topic") as string;
    const slideCount = parseInt((formData.get("slideCount") as string) ?? "5");
    const contentPillar = (formData.get("contentPillar") as string) ?? "family_connection";

    if (!topic?.trim()) throw new Error("Topic is required");

    const pillarContext: Record<string, string> = {
      family_connection: "a family activity, challenge, or ritual that brings people together",
      legacy_memory: "preserving family stories and honoring family history",
      engagement: "a thought-provoking question that gets families reflecting and sharing",
      humor: "a genuinely funny, relatable family moment",
      product_awareness: "how the Reunion app helps families stay connected",
    };

    const generated = await generateWithClaude({
      systemPrompt: `You are a social media carousel creator for Reunion — a family connection app.
You create scroll-stopping Instagram carousels. Each slide has a short punchy headline and 1-2 sentence body.
Slide 1 = hook (stop the scroll). Last slide = CTA. Middle slides = value/insight.
Keep everything warm, human, and family-focused.`,
      userMessage: `Create a ${slideCount}-slide Instagram carousel about: "${topic}"
Content focus: ${pillarContext[contentPillar] ?? "family connection"}

Return JSON with this exact structure:
{
  "title": "Short carousel title (5-7 words)",
  "caption": "Instagram caption for the post (150-200 chars, include relevant hashtags)",
  "slides": [
    {
      "slideNumber": 1,
      "headline": "Short punchy headline (max 8 words)",
      "body": "1-2 sentences of body copy",
      "imagePrompt": "Stable Diffusion prompt for warm family background photo (no text, no logos)"
    }
  ]
}`,
      maxTokens: 1500,
    });

    let parsed: { title: string; caption: string; slides: CarouselSlide[] };
    try {
      const jsonMatch = generated.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("No JSON in response");
      parsed = JSON.parse(jsonMatch[0]);
    } catch {
      throw new Error("Failed to parse carousel content from AI response");
    }

    return parsed;
  });
}

/**
 * Generate a social caption for a completed video/media job using its script.
 * Used to pre-fill the schedule modal so the user never starts from a blank box.
 */
export async function generateVideoCaption(
  jobId: string
): Promise<ActionResult<{ caption: string }>> {
  return safeAction(async () => {
    const session = await requirePermission("content:write");
    const { DB } = getBindings();
    const db = createDb(DB);

    const job = await db
      .select()
      .from(mediaJobs)
      .where(and(eq(mediaJobs.id, jobId), eq(mediaJobs.workspaceId, session.workspaceId)))
      .get();
    if (!job) throw new Error("Job not found");

    let script = "";
    try {
      const cfg = job.config ? (JSON.parse(job.config) as { script?: string }) : {};
      script = cfg.script ?? "";
    } catch { /* config may not be JSON */ }
    const basis = script.trim() || job.prompt;

    const caption = await generateWithClaude({
      systemPrompt: `You write warm, human social media captions for Reunion — a family connection app. Captions are scroll-stopping but never corporate. Output ONLY the caption text — no quotes, no preamble, no labels.`,
      userMessage: `Write a social media caption (120-200 characters) for a short video. Include a soft call to action and 2-4 relevant hashtags. Base it on this video content:\n\n${basis}`,
      maxTokens: 300,
    });

    return { caption: caption.trim().replace(/^["']+|["']+$/g, "") };
  });
}

export async function createCarouselJob(
  formData: FormData
): Promise<ActionResult<{ jobId: string; status: string }>> {
  return safeAction(async () => {
    const session = await requirePermission("content:write");
    const { DB } = getBindings();
    const db = createDb(DB);

    const slidesRaw = formData.get("slides") as string;
    const caption = (formData.get("caption") as string) || "Reunion Carousel";
    const title = (formData.get("title") as string) || caption;

    if (!slidesRaw) throw new Error("Slides data is required");

    const slides: CarouselSlide[] = JSON.parse(slidesRaw);
    if (!slides.length) throw new Error("At least one slide required");

    const config = { slides, caption };
    const id = createId();

    await db.insert(mediaJobs).values({
      id,
      workspaceId: session.workspaceId,
      type: "carousel",
      prompt: title,
      provider: "replicate",
      config: JSON.stringify(config),
      status: "queued",
      createdBy: session.userId,
      createdAt: new Date(),
    });

    return { jobId: id, status: "queued" };
  });
}

export async function scheduleCarouselPost(
  formData: FormData
): Promise<ActionResult<ScheduleVideoResult>> {
  return safeAction(async () => {
    const session = await requirePermission("publish:queue");
    const { DB } = getBindings();
    const db = createDb(DB);

    const jobId = formData.get("jobId") as string;
    const caption = formData.get("caption") as string;
    const scheduledFor = formData.get("scheduledFor") as string;
    const platformsRaw = formData.get("platforms") as string;
    const platforms: string[] = platformsRaw ? JSON.parse(platformsRaw) : [];

    if (!jobId || !platforms.length || !scheduledFor) throw new Error("Missing required fields");

    const job = await db.select().from(mediaJobs)
      .where(and(eq(mediaJobs.id, jobId), eq(mediaJobs.workspaceId, session.workspaceId)))
      .get();

    if (!job || job.status !== "completed" || !job.resultR2Key) throw new Error("Carousel is not ready yet");

    // resultR2Key for carousels is the manifest JSON key
    // The manifest contains all slide R2 keys
    const R2_PUBLIC_URL = "https://pub-fff12e42fe61481ea170c0c8c2e1e3bf.r2.dev";
    const manifestUrl = `${R2_PUBLIC_URL}/${job.resultR2Key}`;

    const accounts = await db.select().from(connectedAccounts)
      .where(eq(connectedAccounts.workspaceId, session.workspaceId))
      .all();
    const activeAccounts = accounts.filter(a => a.accountStatus === "active");

    const projectId = createId();
    const now = new Date();
    type ContentProjectInsert = typeof contentProjects.$inferInsert;
    type ContentAssetInsert = typeof contentAssets.$inferInsert;

    const project: ContentProjectInsert = {
      id: projectId,
      workspaceId: session.workspaceId,
      title: job.prompt,
      brief: caption,
      doctrineMode: "balanced",
      createdBy: session.userId,
      createdAt: now,
    };
    await db.insert(contentProjects).values(project);

    let scheduled = 0;
    const skipped: string[] = [];

    for (const platform of platforms) {
      const account = activeAccounts.find(a => a.platform === platform);
      if (!account) { skipped.push(platform); continue; }

      const assetId = createId();
      const asset: ContentAssetInsert = {
        id: assetId,
        projectId,
        platform: platform as ContentAssetInsert["platform"],
        type: "carousel_slide" as ContentAssetInsert["type"],
        body: caption,
        version: 1,
        status: "approved",
        createdAt: now,
      };
      await db.insert(contentAssets).values(asset);

      await db.insert(scheduledPosts).values({
        id: createId(),
        workspaceId: session.workspaceId,
        contentAssetId: assetId,
        connectedAccountId: account.id,
        platform: platform as NewScheduledPost["platform"],
        scheduledFor: new Date(scheduledFor),
        approvalMode: "autonomous",
        postStatus: "queued",
        metadata: JSON.stringify({ mediaUrl: manifestUrl, mediaType: "carousel", mediaJobId: jobId }),
        createdBy: session.userId,
        createdAt: now,
        updatedAt: now,
      });
      scheduled++;
    }

    return { scheduled, skipped };
  });
}

// ─── Avatar Video (D-ID) ──────────────────────────────────────────────────────

export async function createAvatarJob(
  formData: FormData
): Promise<ActionResult<{ jobId: string; status: string }>> {
  return safeAction(async () => {
    const session = await requirePermission("content:write");
    const { DB } = getBindings();
    const db = createDb(DB);

    const script = formData.get("script") as string;
    const presenterImageUrl = formData.get("presenterImageUrl") as string;
    const voiceId = (formData.get("voiceId") as string) || undefined;
    const title = (formData.get("title") as string) || "Avatar Video";

    if (!script?.trim()) throw new Error("Script is required");
    if (!presenterImageUrl?.trim()) throw new Error("Presenter image URL is required");

    const config = { script, presenterImageUrl, voiceId };
    const id = createId();

    await db.insert(mediaJobs).values({
      id,
      workspaceId: session.workspaceId,
      type: "avatar_video",
      prompt: title,
      provider: "did",
      config: JSON.stringify(config),
      status: "queued",
      createdBy: session.userId,
      createdAt: new Date(),
    });

    return { jobId: id, status: "queued" };
  });
}
