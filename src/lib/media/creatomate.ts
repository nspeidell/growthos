/**
 * Creatomate API client — source-based rendering.
 *
 * Uses Creatomate's dynamic source API so NO dashboard templates are needed.
 * We define the entire video layout in code as JSON.
 *
 * Formats supported:
 *   - Vertical Reel (1080×1920) — Instagram Reels, Facebook Reels
 *   - Square (1080×1080)        — Instagram feed, Facebook feed
 *   - Horizontal (1920×1080)    — LinkedIn, YouTube
 *   - Carousel (multi-image)    — Instagram, LinkedIn
 *
 * Docs: https://creatomate.com/docs/api/rest-api/renders
 */

const CREATOMATE_API_URL = "https://api.creatomate.com/v1";

// ─── Reunion Brand Defaults ────────────────────────────────────────────────

const BRAND = {
  primary: "#35664F",      // Reunion forest green — harmony, safety, growth
  secondary: "#AAC69D",    // sage green — balance, encourage
  accent: "#E2AC54",       // warm gold — happiness, optimism, positivity
  teal: "#B4D8C2",         // mint teal — generosity, hope
  cream: "#FFF5E6",        // warm cream — innocence, balance
  textLight: "#FFFFFF",
  textDark: "#1A1A2E",
  fontFamily: "Montserrat",
  fontFamilyBody: "Open Sans",
} as const;

// ─── Types ─────────────────────────────────────────────────────────────────

export interface RenderResult {
  id: string;
  status: "planned" | "rendering" | "succeeded" | "failed";
  url: string | null;
  errorMessage: string | null;
  snapshotUrl: string | null;
}

export type VideoFormat = "vertical" | "square" | "horizontal";

const FORMAT_DIMENSIONS: Record<VideoFormat, { width: number; height: number }> = {
  vertical:   { width: 1080, height: 1920 },
  square:     { width: 1080, height: 1080 },
  horizontal: { width: 1920, height: 1080 },
};

// ─── Source Builders ───────────────────────────────────────────────────────

/**
 * Build a voiceover video source.
 * Layout: background images cycling behind an audio track + animated captions.
 * No template needed — fully defined in JSON.
 */
export function buildVoiceoverVideoSource(options: {
  format: VideoFormat;
  audioUrl: string;
  script: string;
  title?: string;
  backgroundImageUrls?: string[];
  brandColors?: { primary: string; accent: string };
  logoUrl?: string;
  durationSeconds?: number;
}): object {
  const { width, height } = FORMAT_DIMENSIONS[options.format];
  const primary = options.brandColors?.primary ?? BRAND.primary;
  const accent = options.brandColors?.accent ?? BRAND.accent; // eslint-disable-line @typescript-eslint/no-unused-vars
  const duration = options.durationSeconds ?? 30;
  const bgImages = options.backgroundImageUrls ?? [];

  const elements: object[] = [];

  // Background images — cycle through them evenly
  if (bgImages.length > 0) {
    const segDuration = duration / bgImages.length;
    bgImages.forEach((url, i) => {
      elements.push({
        type: "image",
        track: 1,
        time: i * segDuration,
        duration: segDuration + 0.5, // slight overlap for smooth transition
        source: url,
        fit: "cover",
        x: "50%",
        y: "50%",
        width: "100%",
        height: "100%",
        animations: [
          {
            type: "scale",
            easing: "linear",
            start_scale: "100%",
            end_scale: "110%",
          },
        ],
      });
    });
  } else {
    // Solid brand gradient background
    elements.push({
      type: "shape",
      track: 1,
      shape: "rectangle",
      x: "50%",
      y: "50%",
      width: "100%",
      height: "100%",
      fill_color: primary,
    });
  }

  // Dark forest-green overlay for text readability (on-brand, not generic black)
  elements.push({
    type: "shape",
    track: 2,
    shape: "rectangle",
    x: "50%",
    y: "50%",
    width: "100%",
    height: "100%",
    fill_color: "rgba(53,100,79,0.55)",  // #35664F at 55% opacity
  });

  // Title text (top third)
  if (options.title) {
    elements.push({
      type: "text",
      track: 3,
      text: options.title,
      x: "50%",
      y: options.format === "vertical" ? "20%" : "15%",
      width: "85%",
      height: "auto",
      x_alignment: "50%",
      y_alignment: "50%",
      font_family: BRAND.fontFamily,
      font_weight: "700",
      font_size: options.format === "vertical" ? 64 : 52,
      fill_color: BRAND.textLight,
      animations: [
        { type: "fade", easing: "quadratic-out", duration: 0.6 },
      ],
    });
  }

  // Voiceover audio
  elements.push({
    type: "audio",
    track: 4,
    source: options.audioUrl,
    volume: "100%",
  });

  // Animated captions / subtitles (center bottom area)
  elements.push({
    type: "text",
    track: 5,
    transcript_source: "audio",          // Creatomate auto-syncs captions to audio
    transcript_maximum_length: 12,
    x: "50%",
    y: options.format === "vertical" ? "78%" : "80%",
    width: "88%",
    height: "auto",
    x_alignment: "50%",
    y_alignment: "50%",
    font_family: BRAND.fontFamily,
    font_weight: "700",
    font_size: options.format === "vertical" ? 56 : 44,
    fill_color: BRAND.textLight,
    stroke_color: "rgba(0,0,0,0.9)",
    stroke_width: 3,
    background_color: "rgba(0,0,0,0.0)",
    animations: [
      { type: "text-appear", scope: "word", easing: "linear" },
    ],
  });

  // Branding bar (bottom strip) — gold accent on green
  elements.push({
    type: "shape",
    track: 6,
    shape: "rectangle",
    x: "50%",
    y: "97%",
    width: "100%",
    height: "6%",
    fill_color: BRAND.accent,  // #E2AC54 gold
  });

  // Logo (bottom center)
  if (options.logoUrl) {
    elements.push({
      type: "image",
      track: 7,
      source: options.logoUrl,
      x: "50%",
      y: "97%",
      width: "auto",
      height: "4%",
      x_alignment: "50%",
      y_alignment: "50%",
    });
  }

  return {
    output_format: "mp4",
    width,
    height,
    duration,
    fps: 30,
    elements,
  };
}

/**
 * Build a carousel source (multi-slide image output).
 * Each slide = image + text overlay + brand strip.
 * Outputs a single image (first slide) or multiple renders for each slide.
 */
export function buildCarouselSlideSource(options: {
  slideNumber: number;
  totalSlides: number;
  headline: string;
  bodyText: string;
  backgroundImageUrl?: string;
  brandColors?: { primary: string; accent: string };
  logoUrl?: string;
}): object {
  const primary = options.brandColors?.primary ?? BRAND.primary;

  const elements: object[] = [];

  // Background
  if (options.backgroundImageUrl) {
    elements.push({
      type: "image",
      track: 1,
      source: options.backgroundImageUrl,
      fit: "cover",
      x: "50%",
      y: "50%",
      width: "100%",
      height: "100%",
    });
    // overlay
    elements.push({
      type: "shape",
      track: 2,
      shape: "rectangle",
      x: "50%",
      y: "50%",
      width: "100%",
      height: "100%",
      fill_color: "rgba(0,0,0,0.50)",
    });
  } else {
    elements.push({
      type: "shape",
      track: 1,
      shape: "rectangle",
      x: "50%",
      y: "50%",
      width: "100%",
      height: "100%",
      fill_color: primary,
    });
  }

  // Slide number indicator
  if (options.totalSlides > 1) {
    elements.push({
      type: "text",
      track: 3,
      text: `${options.slideNumber} / ${options.totalSlides}`,
      x: "90%",
      y: "5%",
      font_family: BRAND.fontFamilyBody,
      font_size: 28,
      fill_color: "rgba(255,255,255,0.7)",
    });
  }

  // Headline
  elements.push({
    type: "text",
    track: 4,
    text: options.headline,
    x: "50%",
    y: "38%",
    width: "85%",
    x_alignment: "50%",
    y_alignment: "50%",
    font_family: BRAND.fontFamily,
    font_weight: "700",
    font_size: 68,
    fill_color: BRAND.textLight,
    line_height: "110%",
  });

  // Body text
  elements.push({
    type: "text",
    track: 5,
    text: options.bodyText,
    x: "50%",
    y: "65%",
    width: "82%",
    x_alignment: "50%",
    y_alignment: "50%",
    font_family: BRAND.fontFamilyBody,
    font_size: 38,
    fill_color: "rgba(255,255,255,0.90)",
    line_height: "140%",
  });

  // Brand strip
  elements.push({
    type: "shape",
    track: 6,
    shape: "rectangle",
    x: "50%",
    y: "97%",
    width: "100%",
    height: "6%",
    fill_color: primary,
  });

  return {
    output_format: "jpg",
    width: 1080,
    height: 1080,
    elements,
  };
}

/**
 * Build a quote card (static image — great for Instagram feed, stories).
 */
export function buildQuoteCardSource(options: {
  quote: string;
  attribution?: string;
  backgroundImageUrl?: string;
  brandColors?: { primary: string; accent: string };
  format?: "square" | "vertical";
}): object {
  const { width, height } = FORMAT_DIMENSIONS[options.format ?? "square"];
  const primary = options.brandColors?.primary ?? BRAND.primary;
  const elements: object[] = [];

  if (options.backgroundImageUrl) {
    elements.push({
      type: "image",
      track: 1,
      source: options.backgroundImageUrl,
      fit: "cover",
      x: "50%", y: "50%", width: "100%", height: "100%",
    });
    elements.push({
      type: "shape",
      track: 2,
      shape: "rectangle",
      x: "50%", y: "50%", width: "100%", height: "100%",
      fill_color: "rgba(0,0,0,0.55)",
    });
  } else {
    elements.push({
      type: "shape",
      track: 1,
      shape: "rectangle",
      x: "50%", y: "50%", width: "100%", height: "100%",
      fill_color: primary,
    });
  }

  // Opening quote mark
  elements.push({
    type: "text",
    track: 3,
    text: "“",
    x: "12%",
    y: "25%",
    font_family: BRAND.fontFamily,
    font_size: 160,
    fill_color: "rgba(255,255,255,0.20)",
  });

  // Quote text
  elements.push({
    type: "text",
    track: 4,
    text: options.quote,
    x: "50%",
    y: "48%",
    width: "82%",
    x_alignment: "50%",
    y_alignment: "50%",
    font_family: BRAND.fontFamily,
    font_weight: "600",
    font_size: 52,
    fill_color: BRAND.textLight,
    line_height: "140%",
  });

  if (options.attribution) {
    elements.push({
      type: "text",
      track: 5,
      text: `— ${options.attribution}`,
      x: "50%",
      y: "78%",
      x_alignment: "50%",
      font_family: BRAND.fontFamilyBody,
      font_size: 36,
      fill_color: "rgba(255,255,255,0.75)",
    });
  }

  elements.push({
    type: "shape",
    track: 6,
    shape: "rectangle",
    x: "50%", y: "97%", width: "100%", height: "5%",
    fill_color: primary,
  });

  return {
    output_format: "jpg",
    width,
    height,
    elements,
  };
}

// ─── CreatomateClient ─────────────────────────────────────────────────────

export class CreatomateClient {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  /**
   * Submit a source-based render (no template ID needed).
   */
  async createSourceRender(options: {
    source: object;
    webhookUrl?: string;
    metadata?: string;
  }): Promise<RenderResult[]> {
    const body: Record<string, unknown> = { source: options.source };
    if (options.webhookUrl) body.webhook_url = options.webhookUrl;
    if (options.metadata) body.metadata = options.metadata;

    const response = await fetch(`${CREATOMATE_API_URL}/renders`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Creatomate render failed (${response.status}): ${errText}`);
    }

    return response.json() as Promise<RenderResult[]>;
  }

  /**
   * Poll a render until complete or failed.
   */
  async pollRender(renderId: string, timeoutMs = 300_000): Promise<RenderResult> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const response = await fetch(`${CREATOMATE_API_URL}/renders/${renderId}`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
      });
      if (!response.ok) throw new Error(`getRender failed: ${response.status}`);
      const result = (await response.json()) as RenderResult;
      if (result.status === "succeeded" || result.status === "failed") return result;
      await new Promise(r => setTimeout(r, 5000));
    }
    throw new Error("Creatomate render timed out");
  }

  /**
   * Submit a voiceover video render with webhook. Returns render ID.
   */
  async submitVoiceoverRender(options: {
    format: VideoFormat;
    audioUrl: string;
    script: string;
    title?: string;
    backgroundImageUrls?: string[];
    brandColors?: { primary: string; accent: string };
    logoUrl?: string;
    durationSeconds?: number;
    webhookUrl: string;
    metadata: string;
  }): Promise<string> {
    const source = buildVoiceoverVideoSource(options);
    const renders = await this.createSourceRender({
      source,
      webhookUrl: options.webhookUrl,
      metadata: options.metadata,
    });
    if (!renders[0]) throw new Error("No render created");
    return renders[0].id;
  }

  /**
   * Render a carousel slide (image). Returns the image buffer.
   */
  async renderCarouselSlide(options: {
    slideNumber: number;
    totalSlides: number;
    headline: string;
    bodyText: string;
    backgroundImageUrl?: string;
    brandColors?: { primary: string; accent: string };
  }): Promise<{ renderId: string; url: string }> {
    const source = buildCarouselSlideSource(options);
    const renders = await this.createSourceRender({ source });
    if (!renders[0]) throw new Error("No render created");
    const result = await this.pollRender(renders[0].id, 60_000);
    if (result.status === "failed" || !result.url) {
      throw new Error(`Carousel slide render failed: ${result.errorMessage ?? "no url"}`);
    }
    return { renderId: result.id, url: result.url };
  }

  /**
   * Render a quote card. Returns the image URL.
   */
  async renderQuoteCard(options: {
    quote: string;
    attribution?: string;
    backgroundImageUrl?: string;
    brandColors?: { primary: string; accent: string };
    format?: "square" | "vertical";
  }): Promise<string> {
    const source = buildQuoteCardSource(options);
    const renders = await this.createSourceRender({ source });
    if (!renders[0]) throw new Error("No render created");
    const result = await this.pollRender(renders[0].id, 60_000);
    if (result.status === "failed" || !result.url) {
      throw new Error(`Quote card render failed: ${result.errorMessage ?? "no url"}`);
    }
    return result.url;
  }
}

// ─── Legacy template ID exports (kept for compatibility) ───────────────────

export const CREATOMATE_TEMPLATES = {
  VIDEO_HORIZONTAL: "",
  VIDEO_VERTICAL: "",
  VIDEO_SQUARE: "",
  MEME_CLASSIC: "",
  QUOTE_CARD: "",
} as const;

export function getCreatomateTemplates(env: {
  CREATOMATE_TPL_VIDEO_H?: string;
  CREATOMATE_TPL_VIDEO_V?: string;
  CREATOMATE_TPL_VIDEO_SQ?: string;
  CREATOMATE_TPL_MEME?: string;
  CREATOMATE_TPL_QUOTE?: string;
}) {
  return {
    VIDEO_HORIZONTAL: env.CREATOMATE_TPL_VIDEO_H ?? "",
    VIDEO_VERTICAL: env.CREATOMATE_TPL_VIDEO_V ?? "",
    VIDEO_SQUARE: env.CREATOMATE_TPL_VIDEO_SQ ?? "",
    MEME_CLASSIC: env.CREATOMATE_TPL_MEME ?? "",
    QUOTE_CARD: env.CREATOMATE_TPL_QUOTE ?? "",
  };
}
