/**
 * Reunion Video Brand Style Configuration.
 *
 * Official brand colors, fonts, and overlay defaults for all
 * composite video generation. Reference: Reunion Brand Guideline PDF.
 */

export const REUNION_VIDEO_BRAND = {
  // ─── Typography ───
  fonts: {
    headline: "Lombard Regular", // For titles and headlines
    caption: "Basic Sans", // For subtitles and body copy
  },

  // ─── Colors (Official Hex Codes) ───
  colors: {
    primaryText: "#FFF5E6", // Innocence/Balance — subtitle text
    accent: "#35664F", // Harmony/Growth — borders, highlight bars
    background: "#1A1A2E", // Deep overlay background (70% opacity)
    secondary: "#E8B86D", // Warm gold accent for CTAs
    shadow: "rgba(0, 0, 0, 0.6)", // Text shadow for readability
  },

  // ─── Subtitle/Overlay Defaults ───
  subtitles: {
    fontFamily: "Basic Sans",
    fontSize: 42, // px at 1080p
    fontWeight: 600,
    color: "#FFF5E6",
    strokeColor: "#000000",
    strokeWidth: 2,
    backgroundColor: "rgba(26, 26, 46, 0.7)",
    padding: { top: 8, bottom: 8, left: 16, right: 16 },
    borderRadius: 8,
    position: "bottom-center" as const,
    marginBottom: 80, // px from bottom
  },

  // ─── Headline Overlay ───
  headline: {
    fontFamily: "Lombard Regular",
    fontSize: 64, // px at 1080p
    fontWeight: 700,
    color: "#FFF5E6",
    accentUnderline: "#35664F",
    position: "top-center" as const,
    marginTop: 60,
  },

  // ─── Video Composition Defaults ───
  composition: {
    resolution: { width: 1080, height: 1920 }, // 9:16 vertical (Reels/TikTok)
    fps: 30,
    durationMaxSeconds: 60,
    transitionType: "crossfade" as const,
    transitionDuration: 0.5, // seconds
  },

  // ─── Watermark / Lower Third ───
  lowerThird: {
    enabled: true,
    logo: "reunion-logo-white.png", // R2 key
    position: "bottom-left" as const,
    opacity: 0.8,
    size: { width: 120, height: 40 },
  },
} as const;

export type VideoBrandStyle = typeof REUNION_VIDEO_BRAND;

/**
 * Generate a subtitle style object compatible with FFmpeg/Remotion configs.
 */
export function getSubtitleStyle() {
  const { subtitles } = REUNION_VIDEO_BRAND;
  return {
    fontFamily: subtitles.fontFamily,
    fontSize: `${subtitles.fontSize}px`,
    fontWeight: subtitles.fontWeight,
    color: subtitles.color,
    textShadow: `0 2px 4px ${REUNION_VIDEO_BRAND.colors.shadow}`,
    backgroundColor: subtitles.backgroundColor,
    padding: `${subtitles.padding.top}px ${subtitles.padding.right}px ${subtitles.padding.bottom}px ${subtitles.padding.left}px`,
    borderRadius: `${subtitles.borderRadius}px`,
  };
}

/**
 * Generate FFmpeg subtitle filter string.
 */
export function getFFmpegSubtitleFilter(text: string): string {
  const { subtitles, colors } = REUNION_VIDEO_BRAND;
  // FFmpeg drawtext filter
  return [
    `drawtext=text='${escapeFFmpegText(text)}'`,
    `fontfile=/fonts/${subtitles.fontFamily.replace(/ /g, "")}.ttf`,
    `fontsize=${subtitles.fontSize}`,
    `fontcolor=${colors.primaryText}`,
    `borderw=${subtitles.strokeWidth}`,
    `bordercolor=${subtitles.strokeColor}`,
    `x=(w-text_w)/2`,
    `y=h-${subtitles.marginBottom}-text_h`,
    `box=1`,
    `boxcolor=${subtitles.backgroundColor}`,
    `boxborderw=${subtitles.padding.top}`,
  ].join(":");
}

function escapeFFmpegText(text: string): string {
  return text
    .replace(/'/g, "'\\''")
    .replace(/:/g, "\\:")
    .replace(/\\/g, "\\\\");
}
