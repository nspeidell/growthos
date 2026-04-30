/**
 * Signal Analysis Engine — Claude-powered classification and scoring
 *
 * Takes raw social content and produces structured signal analysis:
 * - Signal type classification (10 types)
 * - Priority scoring (1-100)
 * - Intent detection
 * - Sentiment analysis (-1.0 to 1.0)
 * - Relevance scoring (0.0 to 1.0)
 * - AI-generated summary and suggested response
 */

import type { CloudflareEnv } from "@/lib/cloudflare/bindings";
import type {
  SignalAnalysis,
  RawSignalContent,
  SignalType,
  Intent,
} from "./types";
import { SIGNAL_TYPES, INTENTS } from "./types";

// ═══════════════════════════════════════════
// Signal Analysis Prompt
// ═══════════════════════════════════════════

function buildAnalysisPrompt(
  content: RawSignalContent,
  brandContext: string,
  keywords: string[]
): string {
  return `You are a social listening analyst for a brand. Analyze this social media content and classify it.

<brand_context>
${brandContext}
</brand_context>

<tracked_keywords>
${keywords.join(", ")}
</tracked_keywords>

<content>
Platform: ${content.platform}
Author: ${content.author ?? "Unknown"}
Author Followers: ${content.authorFollowers ?? "Unknown"}
Title: ${content.title ?? "N/A"}
Content: ${content.content}
Published: ${content.publishedAt ? new Date(content.publishedAt * 1000).toISOString() : "Unknown"}
Engagement: ${content.engagementLikes ?? 0} likes, ${content.engagementComments ?? 0} comments, ${content.engagementShares ?? 0} shares
</content>

Classify this content and respond with ONLY valid JSON matching this schema:
{
  "signalType": one of [${SIGNAL_TYPES.map((t) => `"${t}"`).join(", ")}],
  "priorityScore": number 1-100 (100 = most urgent/valuable),
  "intent": one of [${INTENTS.map((i) => `"${i}"`).join(", ")}],
  "sentiment": number -1.0 to 1.0 (negative to positive),
  "relevanceScore": number 0.0 to 1.0 (how relevant to the brand),
  "summary": "One-sentence summary of the opportunity/threat",
  "suggestedResponse": "Draft response or recommended action (2-3 sentences)",
  "tags": ["relevant", "topic", "tags"],
  "reasoning": "Brief explanation of classification"
}

Priority scoring guide:
- 90-100: Immediate action needed (viral opportunity, reputation crisis, hot lead)
- 70-89: High value (strong lead, trending topic, competitor weakness)
- 50-69: Worth reviewing (relevant mention, content idea, industry trend)
- 30-49: Low priority but trackable (general mention, distant competitor)
- 1-29: Minimal relevance (noise, tangential mention)

Focus on actionable opportunities. If the content mentions a problem the brand could solve, score it higher.`;
}

// ═══════════════════════════════════════════
// Analyze Signal Content
// ═══════════════════════════════════════════

export async function analyzeSignal(
  env: CloudflareEnv,
  content: RawSignalContent,
  brandContext: string,
  keywords: string[]
): Promise<SignalAnalysis> {
  const prompt = buildAnalysisPrompt(content, brandContext, keywords);

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": env.ANTHROPIC_API_KEY,
      "content-type": "application/json",
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Claude API error (${response.status}): ${errText}`);
  }

  const result = (await response.json()) as {
    content: Array<{ type: string; text?: string }>;
  };

  const textBlock = result.content.find((b) => b.type === "text");
  if (!textBlock?.text) {
    throw new Error("No text response from Claude");
  }

  return parseAnalysisResponse(textBlock.text);
}

/**
 * Batch analyze multiple signals (more efficient for bulk processing).
 * Groups into batches of 5 for parallel processing.
 */
export async function analyzeSignalBatch(
  env: CloudflareEnv,
  items: Array<{
    content: RawSignalContent;
    brandContext: string;
    keywords: string[];
  }>
): Promise<SignalAnalysis[]> {
  const BATCH_SIZE = 5;
  const results: SignalAnalysis[] = [];

  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.allSettled(
      batch.map((item) =>
        analyzeSignal(env, item.content, item.brandContext, item.keywords)
      )
    );

    for (const result of batchResults) {
      if (result.status === "fulfilled") {
        results.push(result.value);
      } else {
        // Fallback analysis for failed items
        results.push(createFallbackAnalysis());
      }
    }
  }

  return results;
}

// ═══════════════════════════════════════════
// Response Parsing
// ═══════════════════════════════════════════

function parseAnalysisResponse(text: string): SignalAnalysis {
  // Extract JSON from response (may be wrapped in markdown code blocks)
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("Failed to extract JSON from analysis response");
  }

  const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;

  // Validate and coerce fields
  const signalType = validateEnum(parsed.signalType, SIGNAL_TYPES, "brand_mention");
  const intent = validateEnum(parsed.intent, INTENTS, "neutral");
  const priorityScore = clamp(Number(parsed.priorityScore) || 50, 1, 100);
  const sentiment = clamp(Number(parsed.sentiment) || 0, -1, 1);
  const relevanceScore = clamp(Number(parsed.relevanceScore) || 0.5, 0, 1);

  return {
    signalType,
    priorityScore,
    intent,
    sentiment,
    relevanceScore,
    summary: typeof parsed.summary === "string" ? parsed.summary : "Signal detected",
    suggestedResponse: typeof parsed.suggestedResponse === "string" ? parsed.suggestedResponse : "",
    tags: Array.isArray(parsed.tags)
      ? parsed.tags.filter((t): t is string => typeof t === "string")
      : [],
    reasoning: typeof parsed.reasoning === "string" ? parsed.reasoning : "",
  };
}

function validateEnum<T extends string>(
  value: unknown,
  options: readonly T[],
  fallback: T
): T {
  if (typeof value === "string" && (options as readonly string[]).includes(value)) {
    return value as T;
  }
  return fallback;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(Math.max(n, min), max);
}

function createFallbackAnalysis(): SignalAnalysis {
  return {
    signalType: "brand_mention",
    priorityScore: 30,
    intent: "neutral",
    sentiment: 0,
    relevanceScore: 0.3,
    summary: "Signal detected (analysis pending)",
    suggestedResponse: "",
    tags: [],
    reasoning: "Fallback: AI analysis unavailable",
  };
}

// ═══════════════════════════════════════════
// Quick Relevance Filter (pre-AI screening)
// ═══════════════════════════════════════════

/**
 * Fast keyword-based pre-filter before sending to Claude.
 * Returns true if the content likely matches tracked keywords.
 */
export function quickRelevanceCheck(
  content: string,
  keywords: string[]
): { relevant: boolean; matchedKeywords: string[] } {
  const lower = content.toLowerCase();
  const matched: string[] = [];

  for (const kw of keywords) {
    if (lower.includes(kw.toLowerCase())) {
      matched.push(kw);
    }
  }

  return {
    relevant: matched.length > 0,
    matchedKeywords: matched,
  };
}

// ═══════════════════════════════════════════
// Engagement Score Calculator
// ═══════════════════════════════════════════

/**
 * Calculate normalized engagement score from raw metrics.
 * Accounts for platform differences and author reach.
 */
export function calculateEngagementScore(
  likes: number,
  comments: number,
  shares: number,
  authorFollowers?: number
): number {
  // Weighted engagement
  const rawScore = likes + comments * 2 + shares * 3;

  // Normalize against author reach if known
  if (authorFollowers && authorFollowers > 0) {
    const engagementRate = rawScore / authorFollowers;
    // Scale: 1% engagement = 50, 5% = 80, 10%+ = 95
    return Math.min(engagementRate * 1000, 100);
  }

  // Without follower data, use absolute thresholds
  if (rawScore >= 1000) return 95;
  if (rawScore >= 500) return 85;
  if (rawScore >= 100) return 70;
  if (rawScore >= 50) return 55;
  if (rawScore >= 10) return 40;
  return 20;
}

// ═══════════════════════════════════════════
// Draft Response Generator
// ═══════════════════════════════════════════

/**
 * Generate a contextual reply draft for a signal.
 */
export async function generateReplyDraft(
  env: CloudflareEnv,
  signalContent: string,
  signalType: SignalType,
  brandContext: string,
  platform: string
): Promise<string> {
  const prompt = `You are a community manager for a brand. Draft a reply to this social media post.

<brand_context>
${brandContext}
</brand_context>

<original_post>
${signalContent}
</original_post>

<context>
Signal Type: ${signalType}
Platform: ${platform}
</context>

Write a helpful, authentic reply that:
1. Addresses the person's specific point or question
2. Is appropriate for ${platform} (tone, length, format)
3. Naturally represents the brand without being overly promotional
4. Encourages continued engagement

Reply ONLY with the draft text, no explanations or formatting.`;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": env.ANTHROPIC_API_KEY,
      "content-type": "application/json",
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 512,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!response.ok) {
    throw new Error(`Claude API error: ${response.status}`);
  }

  const result = (await response.json()) as {
    content: Array<{ type: string; text?: string }>;
  };

  const textBlock = result.content.find((b) => b.type === "text");
  return textBlock?.text ?? "Unable to generate reply draft.";
}
