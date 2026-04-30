/**
 * Replicate API client for AI image generation.
 *
 * Uses Flux (Black Forest Labs) models for high-quality image generation.
 * Handles the async prediction polling loop required by Replicate's API.
 *
 * Docs: https://replicate.com/docs/reference/http
 */

const REPLICATE_API_URL = "https://api.replicate.com/v1";

// Flux models on Replicate
export const FLUX_MODELS = {
  schnell: "black-forest-labs/flux-schnell", // Fast, ~2-5s
  pro: "black-forest-labs/flux-1.1-pro",     // High quality, ~10-30s
} as const;

export type FluxModel = keyof typeof FLUX_MODELS;

export interface ImageGenOptions {
  prompt: string;
  model?: FluxModel;
  aspectRatio?: "1:1" | "16:9" | "9:16" | "4:5" | "3:4" | "4:3";
  numOutputs?: number;
  outputFormat?: "png" | "jpg" | "webp";
  seed?: number;
}

interface ReplicatePrediction {
  id: string;
  status: "starting" | "processing" | "succeeded" | "failed" | "canceled";
  output: string[] | null;
  error: string | null;
  urls: { get: string; cancel: string };
}

export class ReplicateClient {
  private apiToken: string;

  constructor(apiToken: string) {
    this.apiToken = apiToken;
  }

  /**
   * Generate an image using Flux and return the image as an ArrayBuffer.
   * Handles the full prediction lifecycle: create → poll → download.
   */
  async generateImage(options: ImageGenOptions): Promise<ArrayBuffer> {
    const {
      prompt,
      model = "schnell",
      aspectRatio = "1:1",
      numOutputs = 1,
      outputFormat = "png",
      seed,
    } = options;

    const modelId = FLUX_MODELS[model] ?? FLUX_MODELS.schnell;

    // Create prediction
    const prediction = await this.createPrediction(modelId, {
      prompt,
      aspect_ratio: aspectRatio,
      num_outputs: numOutputs,
      output_format: outputFormat,
      ...(seed !== undefined && { seed }),
    });

    // Poll until complete (max 120 seconds)
    const result = await this.pollPrediction(prediction.urls.get, 120_000);

    if (result.status === "failed") {
      throw new Error(`Replicate prediction failed: ${result.error ?? "Unknown error"}`);
    }

    if (!result.output || result.output.length === 0) {
      throw new Error("Replicate returned no output");
    }

    // Download the generated image
    const imageUrl = result.output[0] as string;
    if (!imageUrl) throw new Error("Replicate output URL is empty");
    return this.downloadImage(imageUrl);
  }

  /**
   * Generate multiple images (e.g., for carousels).
   * Makes parallel requests for efficiency.
   */
  async generateMultipleImages(
    prompts: Array<{ prompt: string; aspectRatio?: ImageGenOptions["aspectRatio"] }>,
    model: FluxModel = "schnell"
  ): Promise<ArrayBuffer[]> {
    // Create all predictions concurrently
    const predictions = await Promise.all(
      prompts.map((p) =>
        this.createPrediction(FLUX_MODELS[model] ?? FLUX_MODELS.schnell, {
          prompt: p.prompt,
          aspect_ratio: p.aspectRatio ?? "1:1",
          num_outputs: 1,
          output_format: "png",
        })
      )
    );

    // Poll all concurrently
    const results = await Promise.all(
      predictions.map((pred) => this.pollPrediction(pred.urls.get, 120_000))
    );

    // Download all images concurrently
    const images = await Promise.all(
      results.map((result, i) => {
        if (result.status !== "succeeded" || !result.output?.length) {
          throw new Error(`Image ${i + 1} failed: ${result.error ?? "No output"}`);
        }
        const url = result.output[0] as string;
        if (!url) throw new Error(`Image ${i + 1}: no output URL`);
        return this.downloadImage(url);
      })
    );

    return images;
  }

  /**
   * Create a prediction on Replicate.
   */
  private async createPrediction(
    model: string,
    input: Record<string, unknown>
  ): Promise<ReplicatePrediction> {
    const response = await fetch(`${REPLICATE_API_URL}/models/${model}/predictions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiToken}`,
        "Content-Type": "application/json",
        Prefer: "respond-async",
      },
      body: JSON.stringify({ input }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Replicate create failed (${response.status}): ${errText}`);
    }

    return response.json() as Promise<ReplicatePrediction>;
  }

  /**
   * Poll a prediction until it completes or fails.
   */
  private async pollPrediction(
    url: string,
    timeoutMs: number
  ): Promise<ReplicatePrediction> {
    const start = Date.now();

    while (Date.now() - start < timeoutMs) {
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${this.apiToken}` },
      });

      if (!response.ok) {
        throw new Error(`Replicate poll failed: ${response.status}`);
      }

      const prediction = (await response.json()) as ReplicatePrediction;

      if (prediction.status === "succeeded" || prediction.status === "failed" || prediction.status === "canceled") {
        return prediction;
      }

      // Wait before polling again (Replicate recommends 1-2s intervals)
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }

    throw new Error("Replicate prediction timed out");
  }

  /**
   * Download an image from a URL and return as ArrayBuffer.
   */
  private async downloadImage(url: string): Promise<ArrayBuffer> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to download image: ${response.status}`);
    }
    return response.arrayBuffer();
  }
}

// ═══════════════════════════════════════════
// Prompt Builders
// ═══════════════════════════════════════════

/**
 * Build an image generation prompt optimized for a specific platform.
 */
export function buildImagePrompt(
  contentBrief: string,
  platform: string,
  jobType: string
): { prompt: string; aspectRatio: ImageGenOptions["aspectRatio"] } {
  const platformStyles: Record<string, { style: string; ratio: ImageGenOptions["aspectRatio"] }> = {
    instagram: {
      style: "vibrant, high-contrast, eye-catching social media image, professional photography style",
      ratio: "4:5",
    },
    pinterest: {
      style: "aspirational, warm lighting, lifestyle aesthetic, clean composition, pin-worthy",
      ratio: "3:4",
    },
    facebook: {
      style: "friendly, warm, approachable, community-focused image",
      ratio: "16:9",
    },
    youtube: {
      style: "bold, high-energy YouTube thumbnail, dramatic lighting, attention-grabbing",
      ratio: "16:9",
    },
    tiktok: {
      style: "trendy, dynamic, mobile-optimized vertical image, bold colors",
      ratio: "9:16",
    },
    linkedin: {
      style: "professional, clean, corporate but modern, business imagery",
      ratio: "16:9",
    },
    x: {
      style: "bold, shareable, modern graphic design, clean typography-friendly",
      ratio: "16:9",
    },
  };

  const jobStyles: Record<string, string> = {
    meme: "meme template style, bold solid background, space for large text overlay",
    quote_card: "minimal elegant background, soft gradients, space for quote text overlay",
    thumbnail: "YouTube thumbnail style, bold dramatic, attention-grabbing composition",
    promo: "promotional marketing image, product-focused, clean and professional",
    carousel_slide: "clean minimal slide design, consistent visual style, space for text",
    ad_creative: "advertising creative, high production value, compelling visual",
  };

  const pStyle = platformStyles[platform] ?? { style: "professional, high quality", ratio: "1:1" as const };
  const jStyle = jobStyles[jobType] ?? "";

  const prompt = [
    contentBrief,
    pStyle.style,
    jStyle,
    "no text, no words, no letters, no watermarks",
  ]
    .filter(Boolean)
    .join(". ");

  return { prompt, aspectRatio: pStyle.ratio };
}
