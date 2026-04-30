/**
 * Carousel Generator
 *
 * Generates multi-slide image sets for Instagram/LinkedIn carousels.
 * Each slide gets its own AI-generated image via Replicate Flux.
 * Stores a manifest JSON in R2 referencing all slides.
 */

import { ReplicateClient, type FluxModel, type ImageGenOptions } from "./replicate";

export interface CarouselSlide {
  slideNumber: number;
  title?: string;
  body: string;
  imagePrompt: string;
}

export interface CarouselConfig {
  slides: CarouselSlide[];
  platform: "instagram" | "linkedin" | "facebook";
  brandKeywords?: string[];
  style?: "clean" | "bold" | "editorial" | "playful";
}

export interface CarouselManifest {
  type: "carousel";
  platform: string;
  slideCount: number;
  slides: Array<{
    slideNumber: number;
    r2Key: string;
    title?: string;
    body: string;
  }>;
  createdAt: string;
}

export interface CarouselResult {
  manifest: CarouselManifest;
  images: ArrayBuffer[];
}

// Platform-specific carousel dimensions
const CAROUSEL_FORMATS: Record<string, { ratio: ImageGenOptions["aspectRatio"]; style: string }> = {
  instagram: {
    ratio: "1:1",
    style: "Instagram carousel slide, clean modern design, consistent visual branding",
  },
  linkedin: {
    ratio: "1:1",
    style: "LinkedIn carousel slide, professional design, corporate but modern aesthetic",
  },
  facebook: {
    ratio: "1:1",
    style: "Facebook carousel slide, friendly approachable design, community-focused",
  },
};

const STYLE_MODIFIERS: Record<string, string> = {
  clean: "minimal white space, clean lines, subtle colors, modern sans-serif feel",
  bold: "high contrast, saturated colors, dramatic composition, attention-grabbing",
  editorial: "magazine-quality, sophisticated layout, elegant composition, muted tones",
  playful: "fun vibrant colors, dynamic shapes, energetic composition, young trendy",
};

/**
 * Generate a full carousel set of images.
 */
export async function generateCarousel(
  config: CarouselConfig,
  replicateToken: string,
  model: FluxModel = "schnell"
): Promise<CarouselResult> {
  const client = new ReplicateClient(replicateToken);
  const defaultFormat = { ratio: "1:1" as ImageGenOptions["aspectRatio"], style: "carousel slide, clean modern design" };
  const format = CAROUSEL_FORMATS[config.platform] ?? defaultFormat;
  const styleModifier = STYLE_MODIFIERS[config.style ?? "clean"] ?? "";

  // Build prompts for each slide
  const prompts = config.slides.map((slide) => {
    const brandContext = config.brandKeywords?.length
      ? `related to ${config.brandKeywords.join(", ")}`
      : "";

    return {
      prompt: [
        slide.imagePrompt,
        format.style,
        styleModifier,
        brandContext,
        "no text, no words, no letters, no watermarks",
        `slide ${slide.slideNumber} of ${config.slides.length}, consistent visual theme`,
      ]
        .filter(Boolean)
        .join(". "),
      aspectRatio: format.ratio,
    };
  });

  // Generate all slide images concurrently
  const images = await client.generateMultipleImages(prompts, model);

  // Build manifest
  const manifest: CarouselManifest = {
    type: "carousel",
    platform: config.platform,
    slideCount: config.slides.length,
    slides: config.slides.map((slide, i) => ({
      slideNumber: slide.slideNumber,
      r2Key: "", // Filled in by the caller after R2 upload
      title: slide.title,
      body: slide.body,
    })),
    createdAt: new Date().toISOString(),
  };

  return { manifest, images };
}

/**
 * Parse AI-generated carousel content into structured slides.
 * Expects text formatted with slide markers like:
 *   SLIDE 1: Title
 *   Body text...
 *   IMAGE: description of visual
 */
export function parseCarouselContent(rawText: string): CarouselSlide[] {
  const slides: CarouselSlide[] = [];
  const slideBlocks = rawText.split(/(?=SLIDE\s+\d+)/i).filter(Boolean);

  for (const block of slideBlocks) {
    const lines: string[] = block.trim().split("\n").filter(Boolean);
    if (lines.length === 0) continue;

    // Extract slide number from header
    const firstLine = String(lines[0] ?? "");
    const headerMatch = firstLine.match(/SLIDE\s+(\d+)(?:\s*[:—-]\s*(.+))?/i);
    const slideNumber = headerMatch ? parseInt(String(headerMatch[1] ?? "1")) : slides.length + 1;
    const title = headerMatch?.[2]?.trim();

    let body = "";
    let imagePrompt = "";

    for (const line of lines.slice(1)) {
      const trimmed = String(line).trim();
      if (trimmed.toLowerCase().startsWith("image:") || trimmed.toLowerCase().startsWith("visual:")) {
        imagePrompt = trimmed.replace(/^(image|visual):\s*/i, "").trim();
      } else {
        body += (body ? " " : "") + trimmed;
      }
    }

    // Default image prompt from body content
    if (!imagePrompt) {
      imagePrompt = body.slice(0, 100);
    }

    slides.push({ slideNumber, title, body, imagePrompt });
  }

  // Fallback: if parsing fails, create a single slide
  if (slides.length === 0) {
    slides.push({
      slideNumber: 1,
      body: rawText.trim(),
      imagePrompt: rawText.trim().slice(0, 100),
    });
  }

  return slides;
}
