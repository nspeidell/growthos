/**
 * Growth Optimization Engine — Validation Schemas
 *
 * Zod schemas for input validation on all experiment operations.
 */

import { z } from "zod";

// ─── Enum Validators ─────────────────────────────────────────────────────────

export const moduleSourceSchema = z.enum([
  "content", "publisher", "ads", "newsletter", "swarm", "funnel",
]);

export const experimentTypeSchema = z.enum([
  "ab", "multivariate", "bandit", "sequential",
]);

export const experimentStatusSchema = z.enum([
  "draft", "active", "paused", "won", "archived",
]);

export const objectiveMetricSchema = z.enum([
  "clicks", "conversions", "revenue", "opens", "replies",
  "engagement", "ctr", "roas", "cpl", "cac",
]);

export const trafficStrategySchema = z.enum([
  "equal", "weighted", "bandit", "sequential",
]);

export const eventTypeSchema = z.enum([
  "impression", "click", "lead", "purchase", "open",
  "reply", "engagement", "bounce",
]);

export const insightCategorySchema = z.enum([
  "headline", "cta", "subject_line", "send_time", "audience",
  "creative", "pricing", "channel", "general",
]);

// ─── Create Experiment ───────────────────────────────────────────────────────

export const createExperimentSchema = z.object({
  name: z.string().min(1).max(200),
  moduleSource: moduleSourceSchema,
  campaignId: z.string().optional(),
  experimentType: experimentTypeSchema.default("ab"),
  objectiveMetric: objectiveMetricSchema,
  confidenceThreshold: z.number().min(0.5).max(0.999).default(0.95),
  autoPromoteWinner: z.boolean().default(false),
  autoKillLosers: z.boolean().default(false),
  trafficStrategy: trafficStrategySchema.default("equal"),
  minSampleSize: z.number().int().min(10).max(1_000_000).default(100),
  budgetCapCents: z.number().int().min(0).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  variants: z.array(z.object({
    label: z.string().min(1).max(100),
    allocationPercent: z.number().min(0).max(100),
    contentJson: z.record(z.unknown()).default({}),
    isControl: z.boolean().default(false),
    aiGenerated: z.boolean().default(false),
  })).min(2).max(10),
}).refine(
  (data) => {
    const totalAllocation = data.variants.reduce((s, v) => s + v.allocationPercent, 0);
    return Math.abs(totalAllocation - 100) < 0.01;
  },
  { message: "Variant allocations must sum to 100%" }
).refine(
  (data) => data.variants.filter((v) => v.isControl).length <= 1,
  { message: "At most one variant can be marked as control" }
).refine(
  (data) => {
    if (data.startDate && data.endDate) {
      return new Date(data.endDate) > new Date(data.startDate);
    }
    return true;
  },
  { message: "End date must be after start date" }
);

export type CreateExperimentInput = z.infer<typeof createExperimentSchema>;

// ─── Record Event ────────────────────────────────────────────────────────────

export const recordEventSchema = z.object({
  experimentId: z.string().min(1),
  variantId: z.string().min(1),
  eventType: eventTypeSchema,
  revenueValueCents: z.number().int().min(0).default(0),
  userHash: z.string().min(1),
  metadata: z.record(z.unknown()).optional(),
});

export type RecordEventInput = z.infer<typeof recordEventSchema>;

// ─── Update Experiment ───────────────────────────────────────────────────────

export const updateExperimentSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  status: experimentStatusSchema.optional(),
  confidenceThreshold: z.number().min(0.5).max(0.999).optional(),
  autoPromoteWinner: z.boolean().optional(),
  autoKillLosers: z.boolean().optional(),
  trafficStrategy: trafficStrategySchema.optional(),
  minSampleSize: z.number().int().min(10).optional(),
  budgetCapCents: z.number().int().min(0).nullable().optional(),
  endDate: z.string().datetime().nullable().optional(),
});

export type UpdateExperimentInput = z.infer<typeof updateExperimentSchema>;

// ─── AI Variant Request ──────────────────────────────────────────────────────

export const variantGeneratorInputSchema = z.object({
  moduleSource: moduleSourceSchema,
  campaignObjective: z.string().min(1).max(500),
  industryType: z.string().min(1).max(100),
  tonePreference: z.string().min(1).max(100),
  historicalWinners: z.array(z.string()).default([]),
  historicalLosers: z.array(z.string()).default([]),
  currentContent: z.record(z.unknown()).optional(),
});

export type VariantGeneratorInputValidated = z.infer<typeof variantGeneratorInputSchema>;

// ─── Auto-Optimize Config ────────────────────────────────────────────────────

export const autoOptimizeConfigSchema = z.object({
  enabled: z.boolean(),
  promoteAtConfidence: z.number().min(0.5).max(0.999).default(0.95),
  killBelowRate: z.number().min(0).max(1).default(0.3),
  rebalanceInterval: z.enum(["hourly", "daily", "weekly"]).default("daily"),
  maxBudgetCents: z.number().int().min(0).default(100_000),
  notifyOnAction: z.boolean().default(true),
  requireApprovalAbove: z.number().int().min(0).default(10_000),
});

export type AutoOptimizeConfigInput = z.infer<typeof autoOptimizeConfigSchema>;
