/**
 * Cloudflare Queue Consumer: Media Generation
 *
 * Processes media generation jobs from the MEDIA_QUEUE.
 * Routes to the appropriate generator based on job type:
 *
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
import { CreatomateClient, getCreatomateTemplates } from "@/lib/media/creatomate";
import { ElevenLabsClient } from "@/lib/video/elevenlabs-client";
import { REUNION_VIDEO_BRAND } from "@/lib/video/brand-style";

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
}

interface MemeJobConfig {
  topText?: string;
  bottomText?: string;
  imagePrompt?: string;
  format?: "square" | "story" | "landscape";
  style?: "classic" | "modern" | "minimal";
}

interface CarouselJobConfig {
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
  async queue(
    batch: MessageBatch<MediaJobMessage>,
    env: CloudflareEnv
  ): Promise<void> {
    for (const msg of batch.messages) {
      const job = msg.body;

      try {
        // Update status to 'processing'
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
          case "carousel_slide":
            resultKey = await processCarousel(job, env);
            break;
          default:
            // All other image types: thumbnail, promo, quote_card, ad_creative
            resultKey = await processImage(job, env);
            break;
        }

        // Update job as completed
        await env.DB.prepare(
          `UPDATE media_jobs
           SET job_status = 'completed', result_r2_key = ?, completed_at = ?
           WHERE id = ?`
        )
          .bind(resultKey, Date.now(), job.jobId)
          .run();

        msg.ack();
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";

        await env.DB.prepare(
          `UPDATE media_jobs
           SET job_status = 'failed', error_message = ?
           WHERE id = ?`
        )
          .bind(errorMessage, job.jobId)
          .run();

        // Retry with backoff (max 3 retries configured in wrangler.toml)
        msg.retry({ delaySeconds: 30 });
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
  let carouselConfig: CarouselJobConfig = {};
  if (job.config) {
    try {
      carouselConfig = JSON.parse(job.config) as CarouselJobConfig;
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

  // ─── Step 1: Generate voiceover via ElevenLabs ───
  const audioBuffer = await generateNarration(env, job, config.script);

  // Upload audio to R2
  const audioKey = `media/${job.workspaceId}/${job.jobId}_narration.mp3`;
  await env.BUCKET.put(audioKey, audioBuffer, {
    httpMetadata: { contentType: "audio/mpeg" },
  });

  // ─── Step 2: Generate B-roll images via Replicate ───
  const bRollKeys = await generateBRollImages(job, env, config);

  // ─── Step 3: Submit video render to Creatomate ───
  if (env.CREATOMATE_API_KEY) {
    const creatomate = new CreatomateClient(env.CREATOMATE_API_KEY);

    // Determine template based on platform/format
    const templates = getCreatomateTemplates(env);
    const platform = config.platform ?? job.platform ?? "youtube";
    const templateId = platform === "tiktok" || platform === "instagram"
      ? templates.VIDEO_VERTICAL
      : templates.VIDEO_HORIZONTAL;

    if (templateId) {
      // Build public URLs for assets (requires R2 custom domain or public bucket)
      const appUrl = env.APP_URL;
      const audioUrl = `${appUrl}/api/media/serve/${audioKey}`;
      const bRollUrls = bRollKeys.map((k) => `${appUrl}/api/media/serve/${k}`);

      const webhookUrl = `${appUrl}/api/webhooks/creatomate`;

      const renderId = await creatomate.submitVideoRender(
        {
          templateId,
          audioUrl,
          script: config.script,
          bRollImageUrls: bRollUrls,
          format: platform === "tiktok" ? "vertical" : "horizontal",
        },
        webhookUrl,
        JSON.stringify({ jobId: job.jobId, workspaceId: job.workspaceId })
      );

      // Store render ID in config for tracking
      await env.DB.prepare(
        `UPDATE media_jobs SET config = ? WHERE id = ?`
      )
        .bind(
          JSON.stringify({ ...config, creatomateRenderId: renderId }),
          job.jobId
        )
        .run();

      // Return manifest key — the webhook will update with final video
      const manifestKey = `media/${job.workspaceId}/${job.jobId}_manifest.json`;
      const manifest = {
        version: "2.0",
        jobId: job.jobId,
        audioKey,
        bRollKeys,
        creatomateRenderId: renderId,
        status: "rendering",
      };
      await env.BUCKET.put(manifestKey, JSON.stringify(manifest, null, 2), {
        httpMetadata: { contentType: "application/json" },
      });

      // Set status back to processing (webhook will complete it)
      await env.DB.prepare(
        `UPDATE media_jobs SET job_status = 'processing' WHERE id = ?`
      ).bind(job.jobId).run();

      return manifestKey;
    }
  }

  // Fallback: no Creatomate — store manifest with audio + images
  const manifestKey = `media/${job.workspaceId}/${job.jobId}_manifest.json`;
  const manifest = {
    version: "2.0",
    jobId: job.jobId,
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
  const tags = config.subjectTags ?? [];
  const vibe = config.emotionalVibe ?? "professional";

  // Generate 3-5 B-roll images based on script content
  const scenes = extractScenes(config.script, tags);
  const maxImages = Math.min(scenes.length, 5);
  const selectedScenes = scenes.slice(0, maxImages);

  const platform = config.platform ?? job.platform ?? "youtube";
  const ratio = platform === "tiktok" || platform === "instagram" ? "9:16" : "16:9";

  const prompts = selectedScenes.map((scene) => ({
    prompt: `${scene}, ${vibe} mood, cinematic B-roll footage style, high quality, no text, no watermarks`,
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
 * Generate narration audio using ElevenLabs cloned voice.
 */
async function generateNarration(
  env: CloudflareEnv,
  job: MediaJobMessage,
  script: string
): Promise<ArrayBuffer> {
  const elevenLabs = new ElevenLabsClient(env.ELEVEN_LABS_API_KEY);

  // Get voice profile
  let voiceId: string;
  let stability = 0.5;
  let similarityBoost = 0.75;

  if (job.voiceProfileId) {
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
