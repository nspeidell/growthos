/**
 * Creatomate API client for video rendering.
 *
 * Creatomate handles the heavy lifting of video composition:
 * - Audio track (voiceover from ElevenLabs)
 * - B-roll image/video backgrounds
 * - Dynamic subtitles
 * - Brand styling (colors, fonts, logo)
 *
 * The API is async: submit a render → poll or receive webhook → download result.
 * Docs: https://creatomate.com/docs/api
 */

const CREATOMATE_API_URL = "https://api.creatomate.com/v1";

export interface RenderOptions {
  /** Creatomate template ID (created in their dashboard) */
  templateId: string;
  /** Dynamic modifications to the template */
  modifications: Record<string, unknown>;
  /** Webhook URL for completion notification */
  webhookUrl?: string;
  /** Output format */
  outputFormat?: "mp4" | "gif" | "png" | "jpg";
  /** Metadata to include in webhook payload */
  metadata?: string;
}

export interface RenderResult {
  id: string;
  status: "planned" | "rendering" | "succeeded" | "failed";
  url: string | null;
  errorMessage: string | null;
  snapshotUrl: string | null;
}

export interface CreatomateVideoConfig {
  templateId: string;
  audioUrl: string;
  script: string;
  brandColors?: { primary: string; secondary: string; accent: string };
  brandLogoUrl?: string;
  bRollImageUrls?: string[];
  title?: string;
  format: "horizontal" | "vertical" | "square";
}

export class CreatomateClient {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  /**
   * Submit a render job. Returns immediately with render ID.
   * Use pollRender() or a webhook for completion.
   */
  async createRender(options: RenderOptions): Promise<RenderResult[]> {
    const response = await fetch(`${CREATOMATE_API_URL}/renders`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        template_id: options.templateId,
        modifications: options.modifications,
        ...(options.webhookUrl && { webhook_url: options.webhookUrl }),
        ...(options.outputFormat && { output_format: options.outputFormat }),
        ...(options.metadata && { metadata: options.metadata }),
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Creatomate render failed (${response.status}): ${errText}`);
    }

    return response.json() as Promise<RenderResult[]>;
  }

  /**
   * Check render status by ID.
   */
  async getRender(renderId: string): Promise<RenderResult> {
    const response = await fetch(`${CREATOMATE_API_URL}/renders/${renderId}`, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });

    if (!response.ok) {
      throw new Error(`Creatomate getRender failed: ${response.status}`);
    }

    return response.json() as Promise<RenderResult>;
  }

  /**
   * Poll a render until complete or failed.
   */
  async pollRender(renderId: string, timeoutMs = 300_000): Promise<RenderResult> {
    const start = Date.now();

    while (Date.now() - start < timeoutMs) {
      const result = await this.getRender(renderId);

      if (result.status === "succeeded" || result.status === "failed") {
        return result;
      }

      // Creatomate renders take 30s-5min; poll every 5 seconds
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }

    throw new Error("Creatomate render timed out");
  }

  /**
   * Download rendered media from Creatomate CDN.
   */
  async downloadRender(url: string): Promise<ArrayBuffer> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to download render: ${response.status}`);
    }
    return response.arrayBuffer();
  }

  /**
   * High-level: render a video from config and return the video buffer.
   * For use when webhook isn't available (polling mode).
   */
  async renderVideo(config: CreatomateVideoConfig): Promise<ArrayBuffer> {
    const modifications = buildVideoModifications(config);

    const renders = await this.createRender({
      templateId: config.templateId,
      modifications,
      outputFormat: "mp4",
    });

    const firstRender = renders[0];
    if (!firstRender) {
      throw new Error("Creatomate returned no renders");
    }

    // Poll until complete
    const result = await this.pollRender(firstRender.id);

    if (result.status === "failed") {
      throw new Error(`Video render failed: ${result.errorMessage ?? "Unknown"}`);
    }

    if (!result.url) {
      throw new Error("No output URL from Creatomate");
    }

    return this.downloadRender(result.url);
  }

  /**
   * Submit a video render with webhook callback (preferred for production).
   * Returns the render ID for tracking.
   */
  async submitVideoRender(
    config: CreatomateVideoConfig,
    webhookUrl: string,
    metadata: string
  ): Promise<string> {
    const modifications = buildVideoModifications(config);

    const renders = await this.createRender({
      templateId: config.templateId,
      modifications,
      outputFormat: "mp4",
      webhookUrl,
      metadata,
    });

    const firstRender = renders[0];
    if (!firstRender) {
      throw new Error("Creatomate returned no renders");
    }

    return firstRender.id;
  }

  /**
   * Render a static image from a template (for polished memes, quote cards, etc.)
   */
  async renderImage(
    templateId: string,
    modifications: Record<string, unknown>,
    format: "png" | "jpg" = "png"
  ): Promise<ArrayBuffer> {
    const renders = await this.createRender({
      templateId,
      modifications,
      outputFormat: format,
    });

    const firstRender = renders[0];
    if (!firstRender) {
      throw new Error("Creatomate returned no renders");
    }

    const result = await this.pollRender(firstRender.id, 60_000);

    if (result.status === "failed" || !result.url) {
      throw new Error(`Image render failed: ${result.errorMessage ?? "No output"}`);
    }

    return this.downloadRender(result.url);
  }
}

/**
 * Build Creatomate modification object for video rendering.
 */
function buildVideoModifications(config: CreatomateVideoConfig): Record<string, unknown> {
  const mods: Record<string, unknown> = {
    "Audio-1.source": config.audioUrl,
  };

  // Add subtitle text
  if (config.script) {
    mods["Subtitles.text"] = config.script;
  }

  // Add title overlay
  if (config.title) {
    mods["Title.text"] = config.title;
  }

  // Brand colors
  if (config.brandColors) {
    mods["PrimaryColor"] = config.brandColors.primary;
    mods["SecondaryColor"] = config.brandColors.secondary;
    mods["AccentColor"] = config.brandColors.accent;
  }

  // Brand logo
  if (config.brandLogoUrl) {
    mods["Logo.source"] = config.brandLogoUrl;
  }

  // B-roll images as background sequence
  if (config.bRollImageUrls?.length) {
    config.bRollImageUrls.forEach((url, i) => {
      mods[`BRoll-${i + 1}.source`] = url;
    });
  }

  return mods;
}

// ═══════════════════════════════════════════
// Template ID helpers (read from Cloudflare env bindings, not process.env)
// ═══════════════════════════════════════════

/**
 * Get Creatomate template IDs from Cloudflare environment bindings.
 * These are set in wrangler.toml [vars] after creating templates in Creatomate's dashboard.
 *
 * IMPORTANT: Do NOT use process.env here — it does not exist on Cloudflare Workers.
 */
export interface CreatomateTemplateIds {
  VIDEO_HORIZONTAL: string;
  VIDEO_VERTICAL: string;
  VIDEO_SQUARE: string;
  MEME_CLASSIC: string;
  QUOTE_CARD: string;
}

export function getCreatomateTemplates(env: {
  CREATOMATE_TPL_VIDEO_H?: string;
  CREATOMATE_TPL_VIDEO_V?: string;
  CREATOMATE_TPL_VIDEO_SQ?: string;
  CREATOMATE_TPL_MEME?: string;
  CREATOMATE_TPL_QUOTE?: string;
}): CreatomateTemplateIds {
  return {
    VIDEO_HORIZONTAL: env.CREATOMATE_TPL_VIDEO_H ?? "",
    VIDEO_VERTICAL: env.CREATOMATE_TPL_VIDEO_V ?? "",
    VIDEO_SQUARE: env.CREATOMATE_TPL_VIDEO_SQ ?? "",
    MEME_CLASSIC: env.CREATOMATE_TPL_MEME ?? "",
    QUOTE_CARD: env.CREATOMATE_TPL_QUOTE ?? "",
  };
}

/**
 * @deprecated Use getCreatomateTemplates(env) instead.
 * Kept for backward compatibility with non-Worker contexts.
 */
export const CREATOMATE_TEMPLATES = {
  VIDEO_HORIZONTAL: "",
  VIDEO_VERTICAL: "",
  VIDEO_SQUARE: "",
  MEME_CLASSIC: "",
  QUOTE_CARD: "",
} as const;
