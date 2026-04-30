/**
 * Growth Optimization Engine — Insight Moat
 *
 * The competitive moat: accumulated learnings from every experiment.
 * Each resolved experiment generates insights that:
 * - Inform future experiment design
 * - Build institutional knowledge
 * - Increase confidence in patterns over time
 * - Cross-pollinate learnings between modules
 *
 * This is what makes the system smarter over time — the "flywheel."
 */

import type {
  GrowthExperiment,
  GrowthVariant,
  GrowthInsight,
  InsightCategory,
  ModuleSource,
} from "./types";

// ─── Insight Generation ─────────────────────────────────────────────────────

export interface InsightCandidate {
  category: InsightCategory;
  finding: string;
  liftPercent: number;
  sampleSize: number;
  moduleSource: ModuleSource;
  sourceExperimentId: string;
  applicableIndustries: string[];
}

/**
 * Extract insights from a resolved experiment.
 * Called after an experiment reaches significance.
 */
export function extractInsights(
  experiment: GrowthExperiment,
  variants: GrowthVariant[],
  winningVariantId: string | null
): InsightCandidate[] {
  const insights: InsightCandidate[] = [];

  if (!winningVariantId) return insights;

  const winner = variants.find((v) => v.id === winningVariantId);
  const control = variants.find((v) => v.isControl);

  if (!winner || !control) return insights;
  if (control.impressions === 0) return insights;

  const winnerRate = winner.impressions > 0 ? winner.conversions / winner.impressions : 0;
  const controlRate = control.conversions / control.impressions;
  const liftPercent = controlRate > 0 ? ((winnerRate - controlRate) / controlRate) * 100 : 0;

  // Analyze winner's content for patterns
  const contentJson = winner.contentJson;
  const category = inferCategory(experiment, contentJson);

  // Primary insight: what won and why
  insights.push({
    category,
    finding: buildFinding(experiment, winner, liftPercent),
    liftPercent,
    sampleSize: winner.impressions + control.impressions,
    moduleSource: experiment.moduleSource,
    sourceExperimentId: experiment.id,
    applicableIndustries: [], // Populated by context in production
  });

  // Secondary insights: patterns from losers (what to avoid)
  const losers = variants.filter((v) => v.id !== winningVariantId && v.id !== control.id && v.active);
  for (const loser of losers) {
    const loserRate = loser.impressions > 0 ? loser.conversions / loser.impressions : 0;
    const loserDrop = controlRate > 0 ? ((controlRate - loserRate) / controlRate) * 100 : 0;

    if (loserDrop > 10) {
      insights.push({
        category,
        finding: `Avoid: "${loser.label}" underperformed control by ${loserDrop.toFixed(1)}% in ${experiment.moduleSource}`,
        liftPercent: -loserDrop,
        sampleSize: loser.impressions + control.impressions,
        moduleSource: experiment.moduleSource,
        sourceExperimentId: experiment.id,
        applicableIndustries: [],
      });
    }
  }

  return insights;
}

/**
 * Merge a new insight with existing insights.
 * If a similar insight already exists, validate/strengthen it.
 */
export function mergeInsight(
  candidate: InsightCandidate,
  existing: GrowthInsight[]
): { action: "create" | "validate"; existingId?: string; updatedConfidence?: number } {
  // Look for similar insights by category + module + finding similarity
  const similar = existing.find((e) =>
    e.category === candidate.category &&
    e.moduleSource === candidate.moduleSource &&
    findingSimilarity(e.finding, candidate.finding) > 0.6
  );

  if (similar) {
    // Strengthen existing insight
    const newConfidence = Math.min(
      0.99,
      similar.confidenceScore + (1 - similar.confidenceScore) * 0.2
    );
    return {
      action: "validate",
      existingId: similar.id,
      updatedConfidence: newConfidence,
    };
  }

  return { action: "create" };
}

/**
 * Score insights for relevance to a specific experiment context.
 * Used when designing new experiments — "what do we already know?"
 */
export function scoreInsightsForContext(
  insights: GrowthInsight[],
  context: {
    moduleSource: ModuleSource;
    category?: InsightCategory;
    objective?: string;
  }
): Array<GrowthInsight & { relevanceScore: number }> {
  return insights
    .map((insight) => {
      let score = 0;

      // Module match is strongest signal
      if (insight.moduleSource === context.moduleSource) score += 40;

      // Category match
      if (context.category && insight.category === context.category) score += 30;

      // High confidence
      score += insight.confidenceScore * 15;

      // Recency bonus (validated recently)
      if (insight.lastValidatedAt) {
        const daysSince = (Date.now() - new Date(insight.lastValidatedAt).getTime()) / 86_400_000;
        if (daysSince < 30) score += 10;
        else if (daysSince < 90) score += 5;
      }

      // Validation count
      score += Math.min(insight.timesValidated * 2, 10);

      // Positive lift bonus
      if (insight.liftPercent != null && insight.liftPercent > 0) {
        score += Math.min(insight.liftPercent, 10);
      }

      return { ...insight, relevanceScore: score };
    })
    .sort((a, b) => b.relevanceScore - a.relevanceScore);
}

/**
 * Generate a "knowledge graph" summary for the dashboard.
 */
export function summarizeInsightMoat(insights: GrowthInsight[]): InsightMoatSummary {
  const byModule: Record<string, number> = {};
  const byCategory: Record<string, number> = {};
  let totalValidations = 0;
  let avgConfidence = 0;
  let topLift = 0;

  for (const insight of insights) {
    const mod = insight.moduleSource ?? "unknown";
    byModule[mod] = (byModule[mod] ?? 0) + 1;
    byCategory[insight.category] = (byCategory[insight.category] ?? 0) + 1;
    totalValidations += insight.timesValidated;
    avgConfidence += insight.confidenceScore;
    if (insight.liftPercent != null && insight.liftPercent > topLift) {
      topLift = insight.liftPercent;
    }
  }

  avgConfidence = insights.length > 0 ? avgConfidence / insights.length : 0;

  return {
    totalInsights: insights.length,
    byModule,
    byCategory,
    totalValidations,
    avgConfidence,
    topLift,
    maturityLevel: getMaturityLevel(insights.length, totalValidations),
  };
}

export interface InsightMoatSummary {
  totalInsights: number;
  byModule: Record<string, number>;
  byCategory: Record<string, number>;
  totalValidations: number;
  avgConfidence: number;
  topLift: number;
  maturityLevel: "nascent" | "growing" | "established" | "mature" | "dominant";
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function inferCategory(
  experiment: GrowthExperiment,
  contentJson: Record<string, unknown>
): InsightCategory {
  const name = experiment.name.toLowerCase();

  if (name.includes("headline") || name.includes("title")) return "headline";
  if (name.includes("cta") || name.includes("button")) return "cta";
  if (name.includes("subject") || name.includes("email")) return "subject_line";
  if (name.includes("time") || name.includes("schedule")) return "send_time";
  if (name.includes("audience") || name.includes("segment")) return "audience";
  if (name.includes("creative") || name.includes("image") || name.includes("video")) return "creative";
  if (name.includes("price") || name.includes("offer")) return "pricing";
  if (name.includes("channel") || name.includes("platform")) return "channel";

  // Fallback: infer from content keys
  const keys = Object.keys(contentJson);
  if (keys.some((k) => k.includes("headline"))) return "headline";
  if (keys.some((k) => k.includes("cta"))) return "cta";

  return "general";
}

function buildFinding(
  experiment: GrowthExperiment,
  winner: GrowthVariant,
  liftPercent: number
): string {
  const module = experiment.moduleSource;
  const label = winner.label;
  const lift = liftPercent.toFixed(1);

  return `In ${module}: "${label}" outperformed control by ${lift}% (experiment: ${experiment.name})`;
}

function findingSimilarity(a: string, b: string): number {
  // Simple Jaccard similarity on words
  const wordsA = new Set(a.toLowerCase().split(/\s+/).filter((w) => w.length > 3));
  const wordsB = new Set(b.toLowerCase().split(/\s+/).filter((w) => w.length > 3));

  if (wordsA.size === 0 || wordsB.size === 0) return 0;

  let intersection = 0;
  wordsA.forEach((word) => {
    if (wordsB.has(word)) intersection++;
  });

  return intersection / (wordsA.size + wordsB.size - intersection);
}

function getMaturityLevel(
  totalInsights: number,
  totalValidations: number
): InsightMoatSummary["maturityLevel"] {
  const score = totalInsights + totalValidations * 0.5;

  if (score < 5) return "nascent";
  if (score < 20) return "growing";
  if (score < 50) return "established";
  if (score < 150) return "mature";
  return "dominant";
}
