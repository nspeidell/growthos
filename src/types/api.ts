/**
 * Shared API types used across client and server.
 */

// ─── Platform Types ───
export type Platform =
  | "instagram"
  | "facebook"
  | "reddit"
  | "youtube"
  | "x"
  | "website"
  | "email"
  | "linkedin"
  | "pinterest"
  | "tiktok"
  | "threads"
  | "google_business"
  | "wordpress"
  | "medium"
  | "ghost"
  | "substack";

export type SocialPlatform =
  | "instagram"
  | "facebook"
  | "reddit"
  | "youtube"
  | "x"
  | "linkedin"
  | "pinterest"
  | "tiktok"
  | "threads"
  | "google_business";

// ─── Content Types ───
export type ContentType =
  | "caption"
  | "thread"
  | "post"
  | "script"
  | "blog"
  | "carousel"
  | "hook"
  | "meme_copy"
  | "quote_card"
  | "landing_copy"
  | "email"
  | "newsletter"
  | "pin"
  | "story"
  | "reel_script";

// ─── Doctrine Modes ───
export type DoctrineMode =
  | "garyvee"
  | "mrbeast"
  | "hormozi"
  | "brunson"
  | "sethgodin"
  | "dankennedy"
  | "balanced";

// ─── Status Types ───
export type ContentStatus =
  | "draft"
  | "generating"
  | "review"
  | "approved"
  | "published"
  | "archived";

export type PostStatus =
  | "draft"
  | "queued"
  | "approved"
  | "publishing"
  | "published"
  | "failed"
  | "cancelled";

// ─── Plan Types ───
export type PlanTier = "free" | "pro" | "enterprise";

export interface PlanLimits {
  contentPerMonth: number;
  platforms: number;
  teamMembers: number;
  features: string[];
}

export const PLAN_LIMITS: Record<PlanTier, PlanLimits> = {
  free: {
    contentPerMonth: 10,
    platforms: 2,
    teamMembers: 1,
    features: ["Basic content studio", "Manual publishing"],
  },
  pro: {
    contentPerMonth: Infinity,
    platforms: 5,
    teamMembers: 5,
    features: [
      "All content types",
      "Autonomous mode",
      "Analytics",
      "SEO",
    ],
  },
  enterprise: {
    contentPerMonth: Infinity,
    platforms: Infinity,
    teamMembers: Infinity,
    features: [
      "All features",
      "API access",
      "White-label",
      "Priority support",
    ],
  },
};
