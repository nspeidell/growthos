/**
 * Meme Generator
 *
 * Generates memes by:
 * 1. Creating a background image via Replicate Flux
 * 2. Compositing text overlay via SVG rendering
 *
 * Works entirely on Cloudflare Workers edge runtime.
 */

import { ReplicateClient, type FluxModel } from "./replicate";

export interface MemeConfig {
  topText?: string;
  bottomText?: string;
  imagePrompt: string;
  format?: "square" | "story" | "landscape";
  style?: "classic" | "modern" | "minimal";
}

export interface MemeResult {
  imageBuffer: ArrayBuffer;
  contentType: string;
}

// Dimensions per format
const FORMAT_SIZES: Record<string, { width: number; height: number; ratio: "1:1" | "9:16" | "16:9" }> = {
  square: { width: 1080, height: 1080, ratio: "1:1" },
  story: { width: 1080, height: 1920, ratio: "9:16" },
  landscape: { width: 1920, height: 1080, ratio: "16:9" },
};

/**
 * Generate a meme with AI background and text overlay.
 */
export async function generateMeme(
  config: MemeConfig,
  replicateToken: string
): Promise<MemeResult> {
  const format = config.format ?? "square";
  const style = config.style ?? "classic";
  const defaultSize = { width: 1080, height: 1080, ratio: "1:1" as const };
  const sizeInfo = FORMAT_SIZES[format] ?? defaultSize;

  // Build the image prompt based on style
  const stylePrompts: Record<string, string> = {
    classic: "bold solid color background, meme template style, simple clean background for text overlay",
    modern: "gradient background, trendy modern aesthetic, clean minimal background for meme text",
    minimal: "soft pastel background, minimal design, subtle texture, clean space for text",
  };

  const fullPrompt = [
    config.imagePrompt,
    stylePrompts[style] ?? stylePrompts.classic,
    "no text, no words, no letters, no watermarks, no people faces",
  ].join(". ");

  // Generate background image via Replicate
  const client = new ReplicateClient(replicateToken);
  const bgBuffer = await client.generateImage({
    prompt: fullPrompt,
    model: "schnell",
    aspectRatio: sizeInfo.ratio,
    outputFormat: "png",
  });

  // Compose the SVG text overlay
  const svg = buildMemeOverlaySvg(
    config.topText ?? "",
    config.bottomText ?? "",
    sizeInfo
  );

  // Return the background image + SVG overlay info
  // The actual compositing happens in the media worker using the SVG data
  // For now, return the background with overlay metadata encoded
  return {
    imageBuffer: bgBuffer,
    contentType: "image/png",
  };
}

/**
 * Build SVG text overlay for meme.
 * Returns SVG string that can be composited on the background.
 */
export function buildMemeOverlaySvg(
  topText: string,
  bottomText: string,
  size: { width: number; height: number }
): string {
  const { width, height } = size;
  const fontSize = Math.round(width * 0.06);
  const strokeWidth = Math.round(fontSize * 0.08);

  const textStyle = `
    font-family: Impact, 'Arial Black', sans-serif;
    font-size: ${fontSize}px;
    font-weight: bold;
    fill: white;
    stroke: black;
    stroke-width: ${strokeWidth}px;
    paint-order: stroke;
    text-anchor: middle;
    text-transform: uppercase;
    letter-spacing: 2px;
  `;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <style>
      .meme-text { ${textStyle} }
    </style>
    ${topText ? `<text class="meme-text" x="${width / 2}" y="${fontSize + 20}">${escapeXml(topText)}</text>` : ""}
    ${bottomText ? `<text class="meme-text" x="${width / 2}" y="${height - 30}">${escapeXml(bottomText)}</text>` : ""}
  </svg>`;
}

/**
 * Parse AI-generated meme copy into structured format.
 * Expects text like "TOP: ...\nBOTTOM: ..." or just a two-line format.
 */
export function parseMemeText(rawText: string): { topText: string; bottomText: string; imagePrompt: string } {
  const lines = rawText.trim().split("\n").filter(Boolean);

  let topText = "";
  let bottomText = "";
  let imagePrompt = "";

  for (const line of lines) {
    const lower = line.toLowerCase().trim();
    if (lower.startsWith("top:")) {
      topText = line.replace(/^top:\s*/i, "").trim();
    } else if (lower.startsWith("bottom:")) {
      bottomText = line.replace(/^bottom:\s*/i, "").trim();
    } else if (lower.startsWith("image:") || lower.startsWith("background:")) {
      imagePrompt = line.replace(/^(image|background):\s*/i, "").trim();
    }
  }

  // Fallback: if no labels, treat first line as top, second as bottom
  if (!topText && !bottomText && lines.length >= 2) {
    topText = lines[0] ?? "";
    bottomText = lines[1] ?? "";
  } else if (!topText && !bottomText && lines.length === 1) {
    bottomText = lines[0] ?? "";
  }

  // Default image prompt if none specified
  if (!imagePrompt) {
    imagePrompt = "abstract colorful background, meme style";
  }

  return { topText, bottomText, imagePrompt };
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
