/**
 * Social Listening & Opportunity Intelligence — Core Types
 *
 * 10 signal types, AI classification schemas, source adapters, alerts.
 */

// ═══════════════════════════════════════════
// Signal Type Definitions
// ═══════════════════════════════════════════

export const SIGNAL_TYPES = [
  "lead_opportunity",
  "viral_trend",
  "competitor_mention",
  "negative_sentiment",
  "brand_mention",
  "community_question",
  "partnership_opportunity",
  "influencer_opportunity",
  "content_idea",
  "reputation_risk",
] as const;

export type SignalType = (typeof SIGNAL_TYPES)[number];

export const SIGNAL_TYPE_LABELS: Record<SignalType, string> = {
  lead_opportunity: "Lead Opportunity",
  viral_trend: "Viral Trend",
  competitor_mention: "Competitor Mention",
  negative_sentiment: "Negative Sentiment",
  brand_mention: "Brand Mention",
  community_question: "Community Question",
  partnership_opportunity: "Partnership Opportunity",
  influencer_opportunity: "Influencer Opportunity",
  content_idea: "Content Idea",
  reputation_risk: "Reputation Risk",
};

export const SIGNAL_TYPE_COLORS: Record<SignalType, string> = {
  lead_opportunity: "#22c55e",     // green
  viral_trend: "#f97316",          // orange
  competitor_mention: "#ef4444",   // red
  negative_sentiment: "#dc2626",   // dark red
  brand_mention: "#3b82f6",        // blue
  community_question: "#8b5cf6",   // purple
  partnership_opportunity: "#06b6d4", // cyan
  influencer_opportunity: "#eab308", // yellow
  content_idea: "#10b981",         // emerald
  reputation_risk: "#f43f5e",      // rose
};

// ═══════════════════════════════════════════
// Intent Classification
// ═══════════════════════════════════════════

export const INTENTS = [
  "buying",
  "researching",
  "complaining",
  "praising",
  "asking",
  "comparing",
  "neutral",
] as const;

export type Intent = (typeof INTENTS)[number];

// ═══════════════════════════════════════════
// Source Platform Types
// ═══════════════════════════════════════════

export const SOURCE_PLATFORMS = [
  "reddit",
  "x",
  "google_news",
  "youtube",
  "forum",
  "rss",
] as const;

export type SourcePlatform = (typeof SOURCE_PLATFORMS)[number];

export const SOURCE_PLATFORM_LABELS: Record<SourcePlatform, string> = {
  reddit: "Reddit",
  x: "X (Twitter)",
  google_news: "Google News",
  youtube: "YouTube",
  forum: "Forum",
  rss: "RSS Feed",
};

// ═══════════════════════════════════════════
// Source Configuration Types
// ═══════════════════════════════════════════

export interface RedditSourceConfig {
  subreddits: string[];
  searchQueries?: string[];
  minUpvotes?: number;
  includeComments?: boolean;
}

export interface XSourceConfig {
  searchQueries: string[];
  followAccounts?: string[];
  minFollowers?: number;
  languages?: string[];
}

export interface GoogleNewsSourceConfig {
  searchQueries: string[];
  regions?: string[];
  language?: string;
}

export interface RssSourceConfig {
  feedUrls: string[];
}

export interface YouTubeSourceConfig {
  channelIds?: string[];
  searchQueries?: string[];
  includeComments?: boolean;
  minViews?: number;
}

export interface ForumSourceConfig {
  urls: string[];
  selectors?: {
    postTitle?: string;
    postContent?: string;
    postAuthor?: string;
    postUrl?: string;
  };
}

export type SourceConfig =
  | RedditSourceConfig
  | XSourceConfig
  | GoogleNewsSourceConfig
  | RssSourceConfig
  | YouTubeSourceConfig
  | ForumSourceConfig;

// ═══════════════════════════════════════════
// Signal Status
// ═══════════════════════════════════════════

export const SIGNAL_STATUSES = [
  "new",
  "reviewed",
  "actioned",
  "dismissed",
  "converted",
] as const;

export type SignalStatus = (typeof SIGNAL_STATUSES)[number];

export const SIGNAL_STATUS_COLORS: Record<SignalStatus, string> = {
  new: "#3b82f6",
  reviewed: "#f59e0b",
  actioned: "#22c55e",
  dismissed: "#6b7280",
  converted: "#8b5cf6",
};

// ═══════════════════════════════════════════
// Keyword Types
// ═══════════════════════════════════════════

export const KEYWORD_TYPES = [
  "brand",
  "competitor",
  "industry",
  "opportunity",
  "local",
] as const;

export type KeywordType = (typeof KEYWORD_TYPES)[number];

// ═══════════════════════════════════════════
// Alert Types
// ═══════════════════════════════════════════

export const ALERT_TYPES = [
  "brand_mention",
  "high_priority",
  "negative_sentiment",
  "viral_trend",
  "competitor_alert",
  "lead_detected",
] as const;

export type AlertType = (typeof ALERT_TYPES)[number];

export interface AlertConditions {
  minPriority?: number;
  signalTypes?: SignalType[];
  platforms?: SourcePlatform[];
  keywords?: string[];
}

// ═══════════════════════════════════════════
// Action Types
// ═══════════════════════════════════════════

export const ACTION_TYPES = [
  "reply",
  "dm",
  "follow",
  "like",
  "repost",
  "draft_content",
  "launch_swarm",
] as const;

export type ActionType = (typeof ACTION_TYPES)[number];

// ═══════════════════════════════════════════
// AI Analysis Result
// ═══════════════════════════════════════════

export interface SignalAnalysis {
  signalType: SignalType;
  priorityScore: number; // 1-100
  intent: Intent;
  sentiment: number; // -1.0 to 1.0
  relevanceScore: number; // 0.0 to 1.0
  summary: string;
  suggestedResponse: string;
  tags: string[];
  reasoning: string;
}

// ═══════════════════════════════════════════
// Queue Message Types
// ═══════════════════════════════════════════

export interface SignalScanMessage {
  sourceId: string;
  workspaceId: string;
  sourceType: SourcePlatform;
  config: string; // JSON-encoded SourceConfig
  keywords: string[]; // Active keywords to match against
}

export interface SignalProcessMessage {
  workspaceId: string;
  sourceId: string;
  rawContent: RawSignalContent;
  keywords: string[];
  brandContext: string; // Brand name + description for AI context
}

export interface RawSignalContent {
  platform: SourcePlatform;
  url?: string;
  author?: string;
  authorFollowers?: number;
  title?: string;
  content: string;
  publishedAt?: number; // Unix timestamp
  engagementLikes?: number;
  engagementComments?: number;
  engagementShares?: number;
}

// ═══════════════════════════════════════════
// Dashboard View Types
// ═══════════════════════════════════════════

export interface SignalFeedItem {
  id: string;
  signalType: SignalType;
  priorityScore: number;
  intent: Intent | null;
  sourcePlatform: SourcePlatform;
  sourceUrl: string | null;
  sourceAuthor: string | null;
  sourceAuthorFollowers: number | null;
  title: string | null;
  contentSnippet: string;
  aiSummary: string | null;
  aiSuggestedResponse: string | null;
  aiSentiment: number | null;
  status: SignalStatus;
  detectedAt: Date;
  engagementScore: number | null;
  keywordMatched?: string;
}

export interface SignalStats {
  totalSignals: number;
  newSignals: number;
  highPriorityCount: number;
  avgSentiment: number;
  topSignalType: SignalType | null;
  signalsByType: Record<SignalType, number>;
  signalsByPlatform: Record<SourcePlatform, number>;
  signalsTrend: { date: string; count: number }[];
}

export interface TrendingTopic {
  topic: string;
  count: number;
  avgSentiment: number;
  platforms: SourcePlatform[];
  velocity: number; // Rate of increase
}
