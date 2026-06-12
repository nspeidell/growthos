/**
 * Cloudflare Cron Worker: Media Generation
 *
 * Runs every minute. Polls D1 for jobs with status='queued', processes up to 3 per tick.
 * No queue binding required on the Pages side — Pages just inserts into D1.
 *
 * Job types:
 * - meme         → Replicate Flux background + SVG text overlay
 * - quote_card   → Replicate Flux styled background
 * - thumbnail    → Replicate Flux platform-optimized thumbnail
 * - promo        → Replicate Flux promotional image
 * - carousel_slide → Replicate Flux multi-slide generation
 * - ad_creative  → Replicate Flux ad-optimized image
 * - video_composite → ElevenLabs TTS + Creatomate video render
 */

import type { CloudflareEnv } from "@/lib/cloudflare/bindings";
import { ReplicateClient, buildImagePrompt } from "@/lib/media/replicate";
import { generateMeme, parseMemeText } from "@/lib/media/meme-generator";
import { generateCarousel, parseCarouselContent, type CarouselManifest } from "@/lib/media/carousel-generator";
import { CreatomateClient } from "@/lib/media/creatomate";
import { ElevenLabsClient } from "@/lib/video/elevenlabs-client";
import { DidClient } from "@/lib/video/did-client";

interface MediaJobMessage {
  jobId: string;
  type: string;
  prompt: string;
  provider: string;
  config?: string;
  workspaceId: string;
  voiceProfileId?: string;
  platform?: string;
  contentAssetId?: string;
}

interface VideoCompositeConfig {
  emotionalVibe?: string;
  subjectTags?: string[];
  script: string;
  duration?: number;
  resolution?: { width: number; height: number };
  platform?: string;
  // Video Studio UI fields
  voiceId?: string;
  voiceName?: string;
  format?: "vertical" | "square" | "horizontal";
  imagePrompts?: string[];
}

interface MemeJobConfig {
  topText?: string;
  bottomText?: string;
  imagePrompt?: string;
  format?: "square" | "story" | "landscape";
  style?: "classic" | "modern" | "minimal";
}

interface CarouselSlideJobConfig {
  slides?: Array<{
    slideNumber: number;
    title?: string;
    body: string;
    imagePrompt: string;
  }>;
  platform?: string;
  brandKeywords?: string[];
  style?: "clean" | "bold" | "editorial" | "playful";
}

export default {
  // No-op queue handler — required by Cloudflare since this worker was originally
  // registered as a queue consumer. Real work happens in the scheduled handler below.
  async queue(batch: MessageBatch<unknown>): Promise<void> {
    for (const msg of batch.messages) msg.ack();
  },

  async scheduled(
    _event: ScheduledEvent,
    env: CloudflareEnv
  ): Promise<void> {
    // ── Recover stuck 'processing' jobs: poll Creatomate for render status ──
    // If the webhook didn't fire, this catches it on the next cron tick.
    const stuckRows = await env.DB.prepare(
      `SELECT id, config, workspace_id
       FROM media_jobs
       WHERE job_status = 'processing'
         AND type = 'video_composite'
         AND created_at < ?
       LIMIT 5`
    ).bind(Math.floor(Date.now() / 1000) - 120) // jobs processing for 2+ minutes
    .all<{ id: string; config: string | null; workspace_id: string }>();

    for (const row of stuckRows.results) {
      try {
        const config = row.config ? JSON.parse(row.config) as { creatomateRenderId?: string } : {};
        if (!config.creatomateRenderId || !env.CREATOMATE_API_KEY) continue;

        const resp = await fetch(
          `https://api.creatomate.com/v1/renders/${config.creatomateRenderId}`,
          { headers: { Authorization: `Bearer ${env.CREATOMATE_API_KEY}` } }
        );
        if (!resp.ok) continue;

        const render = await resp.json() as { status: string; url: string | null; error_message: string | null };

        if (render.status === "succeeded" && render.url) {
          const videoResp = await fetch(render.url);
          if (!videoResp.ok) continue;
          const buffer = await videoResp.arrayBuffer();
          const r2Key = `media/${row.workspace_id}/${row.id}.mp4`;
          await env.BUCKET.put(r2Key, buffer, { httpMetadata: { contentType: "video/mp4" } });
          await env.DB.prepare(
            `UPDATE media_jobs SET job_status = 'completed', result_r2_key = ?, completed_at = ? WHERE id = ?`
          ).bind(r2Key, Math.floor(Date.now() / 1000), row.id).run();
          console.log(`[media-gen] Recovered stuck job ${row.id} → ${r2Key}`);
        } else if (render.status === "failed") {
          await env.DB.prepare(
            `UPDATE media_jobs SET job_status = 'failed', error_message = ? WHERE id = ?`
          ).bind(render.error_message ?? "Creatomate render failed", row.id).run();
        }
      } catch (e) {
        console.error(`[media-gen] Recovery check failed for ${row.id}:`, e);
      }
    }

    // ── Pick up to 3 queued jobs per tick ──
    const rows = await env.DB.prepare(
      `SELECT id, type, prompt, provider, config, workspace_id, voice_profile_id
       FROM media_jobs
       WHERE job_status = 'queued'
       ORDER BY created_at ASC
       LIMIT 3`
    ).all<{
      id: string;
      type: string;
      prompt: string;
      provider: string;
      config: string | null;
      workspace_id: string;
      voice_profile_id: string | null;
    }>();

    for (const row of rows.results) {
      const job: MediaJobMessage = {
        jobId: row.id,
        type: row.type,
        prompt: row.prompt,
        provider: row.provider,
        config: row.config ?? undefined,
        workspaceId: row.workspace_id,
        voiceProfileId: row.voice_profile_id ?? undefined,
      };

      try {
        await env.DB.prepare(
          `UPDATE media_jobs SET job_status = 'processing' WHERE id = ?`
        ).bind(job.jobId).run();

        let resultKey: string;

        switch (job.type) {
          case "video_composite":
            resultKey = await processVideoComposite(job, env);
            break;
          case "meme":
            resultKey = await processMeme(job, env);
            break;
          case "carousel":
            resultKey = await processFullCarousel(job, env);
            break;
          case "avatar_video":
            resultKey = await processAvatarVideo(job, env);
            break;
          case "carousel_slide":
            resultKey = await processCarousel(job, env);
            break;
          default:
            resultKey = await processImage(job, env);
            break;
        }

        await env.DB.prepare(
          `UPDATE media_jobs
           SET job_status = 'completed', result_r2_key = ?, completed_at = ?
           WHERE id = ?`
        ).bind(resultKey, Date.now(), job.jobId).run();

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        console.error(`[media-gen] Job ${job.jobId} failed:`, errorMessage);

        await env.DB.prepare(
          `UPDATE media_jobs SET job_status = 'failed', error_message = ? WHERE id = ?`
        ).bind(errorMessage, job.jobId).run();
      }
    }
  },
};

// ═══════════════════════════════════════════
// IMAGE GENERATION (thumbnail, promo, quote_card, ad_creative)
// ═══════════════════════════════════════════

async function processImage(
  job: MediaJobMessage,
  env: CloudflareEnv
): Promise<string> {
  const client = new ReplicateClient(env.REPLICATE_API_TOKEN);
  const platform = job.platform ?? "instagram";

  // Build platform-optimized prompt
  const { prompt, aspectRatio } = buildImagePrompt(job.prompt, platform, job.type);

  // Generate image via Replicate Flux
  const imageBuffer = await client.generateImage({
    prompt,
    model: "schnell",
    aspectRatio,
    outputFormat: "png",
  });

  // Upload to R2
  const r2Key = `media/${job.workspaceId}/${job.jobId}.png`;
  await env.BUCKET.put(r2Key, imageBuffer, {
    httpMetadata: { contentType: "image/png" },
  });

  return r2Key;
}

// ═══════════════════════════════════════════
// MEME GENERATION
// ═══════════════════════════════════════════

async function processMeme(
  job: MediaJobMessage,
  env: CloudflareEnv
): Promise<string> {
  // Parse config or extract from prompt
  let memeConfig: MemeJobConfig = {};
  if (job.config) {
    try {
      memeConfig = JSON.parse(job.config) as MemeJobConfig;
    } catch { console.warn("[media-gen] Invalid meme config JSON for job", job.jobId); }
  }

  // If no structured config, parse the prompt text
  if (!memeConfig.topText && !memeConfig.bottomText) {
    const parsed = parseMemeText(job.prompt);
    memeConfig.topText = parsed.topText;
    memeConfig.bottomText = parsed.bottomText;
    if (!memeConfig.imagePrompt) {
      memeConfig.imagePrompt = parsed.imagePrompt;
    }
  }

  const result = await generateMeme(
    {
      topText: memeConfig.topText,
      bottomText: memeConfig.bottomText,
      imagePrompt: memeConfig.imagePrompt ?? job.prompt,
      format: memeConfig.format,
      style: memeConfig.style,
    },
    env.REPLICATE_API_TOKEN
  );

  // Upload to R2
  const r2Key = `media/${job.workspaceId}/${job.jobId}_meme.png`;
  await env.BUCKET.put(r2Key, result.imageBuffer, {
    httpMetadata: { contentType: result.contentType },
  });

  return r2Key;
}

// ═══════════════════════════════════════════
// CAROUSEL GENERATION
// ═══════════════════════════════════════════

async function processCarousel(
  job: MediaJobMessage,
  env: CloudflareEnv
): Promise<string> {
  let carouselConfig: CarouselSlideJobConfig = {};
  if (job.config) {
    try {
      carouselConfig = JSON.parse(job.config) as CarouselSlideJobConfig;
    } catch { console.warn("[media-gen] Invalid carousel config JSON for job", job.jobId); }
  }

  // Parse slides from prompt if not in config
  const slides = carouselConfig.slides ?? parseCarouselContent(job.prompt);
  const platform = (carouselConfig.platform ?? job.platform ?? "instagram") as "instagram" | "linkedin" | "facebook";

  const result = await generateCarousel(
    {
      slides,
      platform,
      brandKeywords: carouselConfig.brandKeywords,
      style: carouselConfig.style,
    },
    env.REPLICATE_API_TOKEN
  );

  // Upload each slide image to R2
  for (let i = 0; i < result.images.length; i++) {
    const slideKey = `media/${job.workspaceId}/${job.jobId}_slide_${i + 1}.png`;
    const imgData = result.images[i];
    if (!imgData) continue;
    await env.BUCKET.put(slideKey, imgData, {
      httpMetadata: { contentType: "image/png" },
    });
    const slide = result.manifest.slides[i];
    if (slide) slide.r2Key = slideKey;
  }

  // Upload manifest
  const manifestKey = `media/${job.workspaceId}/${job.jobId}_carousel.json`;
  await env.BUCKET.put(manifestKey, JSON.stringify(result.manifest, null, 2), {
    httpMetadata: { contentType: "application/json" },
  });

  return manifestKey;
}

// ═══════════════════════════════════════════
// VIDEO COMPOSITE
// ═══════════════════════════════════════════

async function processVideoComposite(
  job: MediaJobMessage,
  env: CloudflareEnv
): Promise<string> {
  const config = job.config
    ? (JSON.parse(job.config) as VideoCompositeConfig)
    : { script: job.prompt };

  // Resolve format: prefer explicit format field, fall back to resolution, then platform
  const platform = config.platform ?? job.platform ?? "instagram";
  const format: "vertical" | "square" | "horizontal" =
    config.format ??
    (config.resolution
      ? config.resolution.height > config.resolution.width
        ? "vertical"
        : config.resolution.width === config.resolution.height
        ? "square"
        : "horizontal"
      : platform === "tiktok" || platform === "instagram" || platform === "facebook"
      ? "vertical"
      : platform === "linkedin" || platform === "youtube"
      ? "horizontal"
      : "vertical");

  // ─── Step 1: Generate voiceover via ElevenLabs ───
  // Use voiceId from config if provided (from Video Studio UI), else fall back to voice profile lookup
  const audioBuffer = await generateNarration(env, job, config.script, config.voiceId);

  // Upload audio to R2
  const audioKey = `media/${job.workspaceId}/${job.jobId}_narration.mp3`;
  await env.BUCKET.put(audioKey, audioBuffer, {
    httpMetadata: { contentType: "audio/mpeg" },
  });

  // ─── Step 2: Generate B-roll visuals (Workers Paid plan — 1000 subrequest limit) ───
  // Replicate Flux generates 3-5 cinematic scene images from the script; Creatomate
  // cycles through them behind the voiceover for complementary changing visuals.
  let bRollKeys: string[] = [];
  try {
    bRollKeys = await generateBRollImages(job, env, config);
  } catch (err) {
    // B-roll is enhancement-only: on failure, fall back to a solid background
    // rather than failing the entire render.
    console.error(`B-roll generation failed for job ${job.jobId}, using solid background:`, err);
    bRollKeys = [];
  }

  // ─── Step 3: Submit video render to Creatomate (source-based — no templates needed) ───
  if (env.CREATOMATE_API_KEY) {
    const creatomate = new CreatomateClient(env.CREATOMATE_API_KEY);
    const appUrl = env.APP_URL;
    // Use R2 public URL so Creatomate can fetch the audio + B-roll images without auth
    const r2Base = env.R2_PUBLIC_URL ?? `${appUrl}/api/media/serve`;
    const audioUrl = `${r2Base}/${audioKey}`;
    const bRollUrls: string[] = bRollKeys.map((k) => `${r2Base}/${k}`);
    const webhookUrl = `${appUrl}/api/webhooks/creatomate`;

    const renderId = await creatomate.submitVoiceoverRender({
      format,
      audioUrl,
      script: config.script,
      title: job.prompt,
      backgroundImageUrls: bRollUrls,
      durationSeconds: config.duration,
      webhookUrl,
      metadata: JSON.stringify({ jobId: job.jobId, workspaceId: job.workspaceId }),
    });

    // Store render ID in config for tracking
    await env.DB.prepare(
      `UPDATE media_jobs SET config = ? WHERE id = ?`
    )
      .bind(
        JSON.stringify({ ...config, creatomateRenderId: renderId }),
        job.jobId
      )
      .run();

    // Return manifest key — the Creatomate webhook will update the job when render completes
    const manifestKey = `media/${job.workspaceId}/${job.jobId}_manifest.json`;
    const manifest = {
      version: "2.0",
      jobId: job.jobId,
      format,
      audioKey,
      bRollKeys,
      creatomateRenderId: renderId,
      status: "rendering",
    };
    await env.BUCKET.put(manifestKey, JSON.stringify(manifest, null, 2), {
      httpMetadata: { contentType: "application/json" },
    });

    // Keep status as 'processing' — webhook fires when Creatomate is done
    await env.DB.prepare(
      `UPDATE media_jobs SET job_status = 'processing' WHERE id = ?`
    ).bind(job.jobId).run();

    return manifestKey;
  }

  // Fallback: no Creatomate API key — store audio + images as partial result
  const manifestKey = `media/${job.workspaceId}/${job.jobId}_manifest.json`;
  const manifest = {
    version: "2.0",
    jobId: job.jobId,
    format,
    audioKey,
    bRollKeys,
    script: config.script,
    status: "audio_only",
  };
  await env.BUCKET.put(manifestKey, JSON.stringify(manifest, null, 2), {
    httpMetadata: { contentType: "application/json" },
  });

  return manifestKey;
}

/**
 * Generate B-roll images for video backgrounds using Replicate.
 */
async function generateBRollImages(
  job: MediaJobMessage,
  env: CloudflareEnv,
  config: VideoCompositeConfig
): Promise<string[]> {
  const client = new ReplicateClient(env.REPLICATE_API_TOKEN);
  const vibe = config.emotionalVibe ?? "warm cinematic";

  // Prefer Claude's purpose-built visual prompts — they're generated alongside the
  // script to match its mood and topic. Only fall back to naive sentence extraction
  // if the job has none. (Using raw narration sentences produced random, off-topic images.)
  const claudePrompts = (config.imagePrompts ?? []).filter((p) => p && p.trim().length > 0);
  const baseScenes = claudePrompts.length > 0
    ? claudePrompts
    : extractScenes(config.script, config.subjectTags ?? []);
  const selectedScenes = baseScenes.slice(0, 5);

  const platform = config.platform ?? job.platform ?? "youtube";
  const ratio = platform === "tiktok" || platform === "instagram" ? "9:16" : "16:9";

  // Shared style suffix keeps the images visually cohesive so they feel like one video.
  const styleSuffix = `${vibe} mood, cinematic B-roll footage, consistent warm film color grading, shallow depth of field, natural lighting, photorealistic, no text, no watermarks, no logos`;
  const prompts = selectedScenes.map((scene) => ({
    prompt: `${scene}, ${styleSuffix}`,
    aspectRatio: ratio as "9:16" | "16:9",
  }));

  const images = await client.generateMultipleImages(prompts, "schnell");

  // Upload each to R2
  const keys: string[] = [];
  for (let i = 0; i < images.length; i++) {
    const imgData = images[i];
    if (!imgData) continue;
    const key = `media/${job.workspaceId}/${job.jobId}_broll_${i + 1}.png`;
    await env.BUCKET.put(key, imgData, {
      httpMetadata: { contentType: "image/png" },
    });
    keys.push(key);
  }

  return keys;
}

/**
 * Extract visual scene descriptions from a script for B-roll generation.
 */
function extractScenes(script: string, tags: string[]): string[] {
  // Split script into sentences and pick key ones for visuals
  const sentences = script
    .split(/[.!?]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 10);

  // Pick every 2nd-3rd sentence as a scene prompt
  const scenes: string[] = [];
  for (let i = 0; i < sentences.length; i += 2) {
    const sentence = sentences[i];
    if (sentence) scenes.push(sentence);
  }

  // Add tag-based scenes if we need more
  if (scenes.length < 3 && tags.length > 0) {
    for (const tag of tags.slice(0, 3 - scenes.length)) {
      scenes.push(tag);
    }
  }

  // Ensure at least 3 scenes
  while (scenes.length < 3) {
    scenes.push("professional business environment, modern office");
  }

  return scenes;
}

/**
 * Generate narration audio using ElevenLabs voice.
 * Priority: overrideVoiceId (from UI) > voiceProfileId > workspace founder voice > default Rachel
 */
async function generateNarration(
  env: CloudflareEnv,
  job: MediaJobMessage,
  script: string,
  overrideVoiceId?: string
): Promise<ArrayBuffer> {
  const elevenLabs = new ElevenLabsClient(env.ELEVEN_LABS_API_KEY);

  // Get voice profile
  let voiceId: string;
  let stability = 0.5;
  let similarityBoost = 0.75;

  // Direct voice ID from Video Studio UI takes highest priority
  if (overrideVoiceId) {
    voiceId = overrideVoiceId;
  } else if (job.voiceProfileId) {
    const profile = await env.DB.prepare(
      `SELECT eleven_labs_voice_id, stability, similarity_boost
       FROM voice_profiles WHERE id = ?`
    )
      .bind(job.voiceProfileId)
      .first<{
        eleven_labs_voice_id: string;
        stability: number;
        similarity_boost: number;
      }>();

    if (!profile) throw new Error("Voice profile not found");
    voiceId = profile.eleven_labs_voice_id;
    stability = profile.stability;
    similarityBoost = profile.similarity_boost;
  } else {
    // Fetch workspace founder voice
    const founderVoice = await env.DB.prepare(
      `SELECT eleven_labs_voice_id, stability, similarity_boost
       FROM voice_profiles
       WHERE workspace_id = ? AND is_founder_voice = 1
       LIMIT 1`
    )
      .bind(job.workspaceId)
      .first<{
        eleven_labs_voice_id: string;
        stability: number;
        similarity_boost: number;
      }>();

    if (!founderVoice) {
      // Use ElevenLabs default voice if no founder voice configured
      voiceId = "21m00Tcm4TlvDq8ikWAM"; // Rachel (default ElevenLabs voice)
    } else {
      voiceId = founderVoice.eleven_labs_voice_id;
      stability = founderVoice.stability;
      similarityBoost = founderVoice.similarity_boost;
    }
  }

  return elevenLabs.textToSpeech({
    voiceId,
    text: script,
    modelId: "eleven_multilingual_v2",
    voiceSettings: {
      stability,
      similarity_boost: similarityBoost,
      style: 0.0,
      use_speaker_boost: true,
    },
    outputFormat: "mp3_44100_128",
  });
}

// ═══════════════════════════════════════════
// FULL CAROUSEL (multi-slide, Creatomate per slide)
// ═══════════════════════════════════════════

interface CarouselSlide {
  slideNumber: number;
  headline: string;
  body: string;
  imagePrompt: string;
}

interface CarouselJobConfig {
  slides: CarouselSlide[];
  caption: string;
}

async function processFullCarousel(
  job: MediaJobMessage,
  env: CloudflareEnv
): Promise<string> {
  if (!env.CREATOMATE_API_KEY) throw new Error("CREATOMATE_API_KEY not set");

  const config = job.config
    ? (JSON.parse(job.config) as CarouselJobConfig)
    : null;

  if (!config?.slides?.length) throw new Error("No slides in carousel config");

  const creatomate = new CreatomateClient(env.CREATOMATE_API_KEY);
  const slideUrls: string[] = [];

  // Render each slide sequentially (stay within subrequest limits)
  for (const slide of config.slides) {
    try {
      const result = await creatomate.renderCarouselSlide({
        slideNumber: slide.slideNumber,
        totalSlides: config.slides.length,
        headline: slide.headline,
        bodyText: slide.body,
      });

      // Download rendered slide image
      const imgResp = await fetch(result.url);
      if (!imgResp.ok) throw new Error(`Failed to download slide ${slide.slideNumber}`);
      const buffer = await imgResp.arrayBuffer();

      const r2Key = `media/${job.workspaceId}/${job.jobId}_slide_${slide.slideNumber}.jpg`;
      await env.BUCKET.put(r2Key, buffer, { httpMetadata: { contentType: "image/jpeg" } });

      const R2_PUBLIC_URL = "https://pub-fff12e42fe61481ea170c0c8c2e1e3bf.r2.dev";
      slideUrls.push(`${R2_PUBLIC_URL}/${r2Key}`);
    } catch (e) {
      console.error(`[media-gen] Carousel slide ${slide.slideNumber} failed:`, e);
      throw e;
    }
  }

  // Store manifest with all slide URLs
  const manifest = {
    version: "1.0",
    jobId: job.jobId,
    caption: config.caption,
    slideCount: config.slides.length,
    slideUrls,
    slides: config.slides.map((s, i) => ({ ...s, url: slideUrls[i] })),
  };

  const manifestKey = `media/${job.workspaceId}/${job.jobId}_carousel.json`;
  await env.BUCKET.put(manifestKey, JSON.stringify(manifest, null, 2), {
    httpMetadata: { contentType: "application/json" },
  });

  return manifestKey;
}

// ═══════════════════════════════════════════
// AVATAR VIDEO (D-ID)
// ═══════════════════════════════════════════

interface AvatarVideoConfig {
  script: string;
  presenterImageUrl: string;
  voiceId?: string;
}

async function processAvatarVideo(
  job: MediaJobMessage,
  env: CloudflareEnv
): Promise<string> {
  if (!env.DID_API_KEY) throw new Error("DID_API_KEY not set in media-gen worker secrets");

  const config = job.config
    ? (JSON.parse(job.config) as AvatarVideoConfig)
    : null;

  if (!config?.script || !config?.presenterImageUrl) {
    throw new Error("Avatar video requires script and presenterImageUrl in config");
  }

  const did = new DidClient(env.DID_API_KEY);

  // Submit the talk
  const talkId = await did.createTalk({
    sourceUrl: config.presenterImageUrl,
    script: config.script,
    voiceId: config.voiceId,
    elevenLabsKey: config.voiceId ? env.ELEVEN_LABS_API_KEY : undefined,
  });

  // Poll until done
  const result = await did.pollTalk(talkId);

  if (result.status === "error" || !result.result_url) {
    throw new Error(`D-ID render failed: ${result.error?.description ?? "unknown error"}`);
  }

  // Download the MP4
  const videoResp = await fetch(result.result_url);
  if (!videoResp.ok) throw new Error(`Failed to download D-ID video: ${videoResp.status}`);
  const buffer = await videoResp.arrayBuffer();

  const r2Key = `media/${job.workspaceId}/${job.jobId}_avatar.mp4`;
  await env.BUCKET.put(r2Key, buffer, { httpMetadata: { contentType: "video/mp4" } });

  console.log(`[media-gen] Avatar video complete: ${r2Key}`);
  return r2Key;
}
