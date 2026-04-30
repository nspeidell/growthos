import { describe, it, expect } from "vitest";
import { extractInsights, mergeInsight, scoreInsightsForContext, summarizeInsightMoat } from "./insights";
import { runAutonomousPipeline, calculateVelocity, DEFAULT_AUTO_CONFIG } from "./autonomous";
import type { GrowthExperiment, GrowthVariant, GrowthInsight } from "./types";

// ─── Test Fixtures ──────────────────────────────────────────────────────────

function makeExperiment(overrides: Partial<GrowthExperiment> = {}): GrowthExperiment {
  return {
    id: "exp_1",
    workspaceId: "ws_1",
    name: "Headline Test",
    moduleSource: "content",
    campaignId: null,
    experimentType: "ab",
    status: "won",
    objectiveMetric: "ctr",
    confidenceThreshold: 0.95,
    autoPromoteWinner: true,
    autoKillLosers: true,
    trafficStrategy: "equal",
    minSampleSize: 100,
    budgetCapCents: null,
    startDate: new Date(Date.now() - 14 * 86_400_000).toISOString(),
    endDate: null,
    createdBy: "user_1",
    createdAt: new Date(Date.now() - 14 * 86_400_000).toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeVariant(overrides: Partial<GrowthVariant> = {}): GrowthVariant {
  return {
    id: "var_1",
    experimentId: "exp_1",
    label: "Control",
    allocationPercent: 50,
    contentJson: {},
    isControl: true,
    aiGenerated: false,
    active: true,
    impressions: 2000,
    conversions: 200,
    revenueCents: 10000,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeInsight(overrides: Partial<GrowthInsight> = {}): GrowthInsight {
  return {
    id: "ins_1",
    workspaceId: "ws_1",
    category: "headline",
    finding: "Urgency-driven headlines outperform by 12% in content module",
    confidenceScore: 0.85,
    liftPercent: 12,
    sampleSize: 4000,
    sourceExperimentIds: ["exp_1"],
    moduleSource: "content",
    applicableIndustries: [],
    timesValidated: 3,
    lastValidatedAt: new Date(Date.now() - 5 * 86_400_000).toISOString(),
    createdAt: new Date(Date.now() - 30 * 86_400_000).toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

// ─── extractInsights ────────────────────────────────────────────────────────

describe("extractInsights", () => {
  it("extracts primary insight from winning variant", () => {
    const exp = makeExperiment();
    const variants = [
      makeVariant({ impressions: 2000, conversions: 200 }), // 10% control
      makeVariant({ id: "var_2", label: "Urgency Headline", isControl: false, impressions: 2000, conversions: 300 }), // 15%
    ];

    const insights = extractInsights(exp, variants, "var_2");

    expect(insights.length).toBeGreaterThanOrEqual(1);
    expect(insights[0]!.category).toBe("headline");
    expect(insights[0]!.liftPercent).toBeCloseTo(50, 0); // 50% relative lift
    expect(insights[0]!.moduleSource).toBe("content");
    expect(insights[0]!.sourceExperimentId).toBe("exp_1");
  });

  it("extracts negative insights from underperforming losers", () => {
    const exp = makeExperiment();
    const variants = [
      makeVariant({ impressions: 2000, conversions: 200 }), // 10% control
      makeVariant({ id: "var_2", label: "Winner", isControl: false, impressions: 2000, conversions: 300 }),
      makeVariant({ id: "var_3", label: "Bad Variant", isControl: false, impressions: 2000, conversions: 120 }), // 6% — below control
    ];

    const insights = extractInsights(exp, variants, "var_2");

    const negativeInsight = insights.find((i) => i.liftPercent < 0);
    expect(negativeInsight).toBeDefined();
    expect(negativeInsight!.finding).toContain("Avoid");
  });

  it("returns empty for null winner", () => {
    const insights = extractInsights(makeExperiment(), [makeVariant()], null);
    expect(insights).toHaveLength(0);
  });

  it("infers category from experiment name", () => {
    const exp = makeExperiment({ name: "CTA Button Color Test" });
    const variants = [
      makeVariant({ impressions: 1000, conversions: 100 }),
      makeVariant({ id: "var_2", label: "Red CTA", isControl: false, impressions: 1000, conversions: 150 }),
    ];

    const insights = extractInsights(exp, variants, "var_2");
    expect(insights[0]!.category).toBe("cta");
  });
});

// ─── mergeInsight ───────────────────────────────────────────────────────────

describe("mergeInsight", () => {
  it("creates new insight when no similar exists", () => {
    const candidate = {
      category: "headline" as const,
      finding: "Questions in headlines drive 18% more clicks",
      liftPercent: 18,
      sampleSize: 3000,
      moduleSource: "content" as const,
      sourceExperimentId: "exp_2",
      applicableIndustries: [],
    };

    const result = mergeInsight(candidate, [makeInsight()]);

    expect(result.action).toBe("create");
  });

  it("validates existing insight when similar found", () => {
    const candidate = {
      category: "headline" as const,
      finding: "Urgency-driven headlines outperform by 15% in content module experiments",
      liftPercent: 15,
      sampleSize: 3000,
      moduleSource: "content" as const,
      sourceExperimentId: "exp_2",
      applicableIndustries: [],
    };

    const existing = [makeInsight()]; // Similar finding about urgency headlines

    const result = mergeInsight(candidate, existing);

    expect(result.action).toBe("validate");
    expect(result.existingId).toBe("ins_1");
    expect(result.updatedConfidence).toBeGreaterThan(0.85); // Should increase
  });

  it("does not merge insights from different modules", () => {
    const candidate = {
      category: "headline" as const,
      finding: "Urgency-driven headlines outperform in ads by 10%",
      liftPercent: 10,
      sampleSize: 3000,
      moduleSource: "ads" as const, // Different module
      sourceExperimentId: "exp_3",
      applicableIndustries: [],
    };

    const result = mergeInsight(candidate, [makeInsight()]);

    expect(result.action).toBe("create");
  });
});

// ─── scoreInsightsForContext ────────────────────────────────────────────────

describe("scoreInsightsForContext", () => {
  it("scores same-module insights higher", () => {
    const insights = [
      makeInsight({ id: "ins_content", moduleSource: "content" }),
      makeInsight({ id: "ins_ads", moduleSource: "ads" }),
    ];

    const scored = scoreInsightsForContext(insights, { moduleSource: "content" });

    const contentScore = scored.find((s) => s.id === "ins_content")!.relevanceScore;
    const adsScore = scored.find((s) => s.id === "ins_ads")!.relevanceScore;

    expect(contentScore).toBeGreaterThan(adsScore);
  });

  it("scores same-category insights higher", () => {
    const insights = [
      makeInsight({ id: "ins_headline", category: "headline" }),
      makeInsight({ id: "ins_cta", category: "cta" }),
    ];

    const scored = scoreInsightsForContext(insights, { moduleSource: "content", category: "headline" });

    const headlineScore = scored.find((s) => s.id === "ins_headline")!.relevanceScore;
    const ctaScore = scored.find((s) => s.id === "ins_cta")!.relevanceScore;

    expect(headlineScore).toBeGreaterThan(ctaScore);
  });

  it("returns sorted by relevance", () => {
    const insights = [
      makeInsight({ id: "ins_1", moduleSource: "ads", category: "audience" }),
      makeInsight({ id: "ins_2", moduleSource: "content", category: "headline" }),
      makeInsight({ id: "ins_3", moduleSource: "content", category: "cta" }),
    ];

    const scored = scoreInsightsForContext(insights, { moduleSource: "content", category: "headline" });

    expect(scored[0]!.id).toBe("ins_2"); // Best match
  });
});

// ─── summarizeInsightMoat ───────────────────────────────────────────────────

describe("summarizeInsightMoat", () => {
  it("computes correct totals", () => {
    const insights = [
      makeInsight({ moduleSource: "content", category: "headline", timesValidated: 3 }),
      makeInsight({ id: "ins_2", moduleSource: "content", category: "cta", timesValidated: 2 }),
      makeInsight({ id: "ins_3", moduleSource: "ads", category: "creative", timesValidated: 5 }),
    ];

    const summary = summarizeInsightMoat(insights);

    expect(summary.totalInsights).toBe(3);
    expect(summary.byModule["content"]).toBe(2);
    expect(summary.byModule["ads"]).toBe(1);
    expect(summary.byCategory["headline"]).toBe(1);
    expect(summary.totalValidations).toBe(10);
  });

  it("assigns maturity level", () => {
    const fewInsights = [makeInsight()];
    expect(summarizeInsightMoat(fewInsights).maturityLevel).toBe("nascent");

    const manyInsights = Array.from({ length: 25 }, (_, i) =>
      makeInsight({ id: `ins_${i}`, timesValidated: 2 })
    );
    const summary = summarizeInsightMoat(manyInsights);
    expect(["established", "mature", "dominant"]).toContain(summary.maturityLevel);
  });

  it("finds top lift", () => {
    const insights = [
      makeInsight({ liftPercent: 12 }),
      makeInsight({ id: "ins_2", liftPercent: 25 }),
      makeInsight({ id: "ins_3", liftPercent: 8 }),
    ];

    expect(summarizeInsightMoat(insights).topLift).toBe(25);
  });
});

// ─── runAutonomousPipeline ──────────────────────────────────────────────────

describe("runAutonomousPipeline", () => {
  it("generates actions for significant experiments", () => {
    const config = { ...DEFAULT_AUTO_CONFIG, enabled: true };
    const experiments = [{
      experiment: makeExperiment({ status: "active", minSampleSize: 100 }),
      variants: [
        makeVariant({ impressions: 3000, conversions: 300 }), // 10%
        makeVariant({ id: "var_2", label: "Challenger", isControl: false, impressions: 3000, conversions: 500 }), // ~17%
      ],
    }];

    const result = runAutonomousPipeline(config, experiments, []);

    // Should produce actions or escalations
    expect(result.actions.length + result.escalations.length).toBeGreaterThan(0);
  });

  it("generates suggestions from insights", () => {
    const config = { ...DEFAULT_AUTO_CONFIG, enabled: true };
    const insights = [
      makeInsight({ confidenceScore: 0.9, liftPercent: 15 }),
    ];

    const result = runAutonomousPipeline(config, [], insights);

    expect(result.suggestions.length).toBeGreaterThan(0);
  });

  it("skips non-active experiments", () => {
    const config = { ...DEFAULT_AUTO_CONFIG, enabled: true };
    const experiments = [{
      experiment: makeExperiment({ status: "paused" }),
      variants: [makeVariant(), makeVariant({ id: "var_2", isControl: false })],
    }];

    const result = runAutonomousPipeline(config, experiments, []);

    expect(result.actions).toHaveLength(0);
  });

  it("escalates high-impact decisions", () => {
    const config = { ...DEFAULT_AUTO_CONFIG, enabled: true, requireApprovalAbove: 100 };
    const experiments = [{
      experiment: makeExperiment({ status: "active", minSampleSize: 100 }),
      variants: [
        makeVariant({ impressions: 3000, conversions: 300, revenueCents: 50000 }),
        makeVariant({ id: "var_2", isControl: false, impressions: 3000, conversions: 500, revenueCents: 80000 }),
      ],
    }];

    const result = runAutonomousPipeline(config, experiments, []);

    // High revenue means escalation likely
    expect(result.escalations.length).toBeGreaterThan(0);
  });
});

// ─── calculateVelocity ──────────────────────────────────────────────────────

describe("calculateVelocity", () => {
  it("calculates experiments per week", () => {
    const now = Date.now();
    const experiments = Array.from({ length: 8 }, (_, i) =>
      makeExperiment({
        id: `exp_${i}`,
        createdAt: new Date(now - i * 3 * 86_400_000).toISOString(), // One every 3 days
        status: i < 3 ? "won" : "active",
      })
    );

    const velocity = calculateVelocity(experiments, 30);

    expect(velocity.experimentsPerWeek).toBeGreaterThan(1);
    expect(velocity.winRate).toBeGreaterThan(0);
  });

  it("returns zeros for empty input", () => {
    const velocity = calculateVelocity([], 30);

    expect(velocity.experimentsPerWeek).toBe(0);
    expect(velocity.winRate).toBe(0);
    expect(velocity.learningsPerMonth).toBe(0);
  });

  it("only counts experiments within period", () => {
    const oldExperiment = makeExperiment({
      createdAt: new Date(Date.now() - 60 * 86_400_000).toISOString(), // 60 days ago
    });

    const velocity = calculateVelocity([oldExperiment], 30);

    expect(velocity.experimentsPerWeek).toBe(0);
  });
});
