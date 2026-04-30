import { describe, it, expect } from "vitest";
import { evaluateExperiment } from "./decision-engine";
import { evaluateSafetyGate, checkExperimentPermission, checkRateLimit, shouldAutoRollback } from "./safety";
import { DEFAULT_AUTO_CONFIG } from "./autonomous";
import type { GrowthExperiment, GrowthVariant } from "./types";

// ─── Test Fixtures ──────────────────────────────────────────────────────────

function makeExperiment(overrides: Partial<GrowthExperiment> = {}): GrowthExperiment {
  return {
    id: "exp_test_1",
    workspaceId: "ws_1",
    name: "Test Headline Experiment",
    moduleSource: "content",
    campaignId: null,
    experimentType: "ab",
    status: "active",
    objectiveMetric: "ctr",
    confidenceThreshold: 0.95,
    autoPromoteWinner: true,
    autoKillLosers: true,
    trafficStrategy: "equal",
    minSampleSize: 100,
    budgetCapCents: null,
    startDate: new Date(Date.now() - 7 * 86_400_000).toISOString(),
    endDate: null,
    createdBy: "user_1",
    createdAt: new Date(Date.now() - 7 * 86_400_000).toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeVariant(overrides: Partial<GrowthVariant> = {}): GrowthVariant {
  return {
    id: "var_test_1",
    experimentId: "exp_test_1",
    label: "Control",
    allocationPercent: 50,
    contentJson: {},
    isControl: true,
    aiGenerated: false,
    active: true,
    impressions: 1000,
    conversions: 100,
    revenueCents: 5000,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

// ─── evaluateExperiment ─────────────────────────────────────────────────────

describe("evaluateExperiment", () => {
  it("recommends continue when insufficient data", () => {
    const exp = makeExperiment({ minSampleSize: 500 });
    const variants = [
      makeVariant({ impressions: 50, conversions: 5 }),
      makeVariant({ id: "var_2", label: "Challenger", isControl: false, impressions: 50, conversions: 7 }),
    ];

    const result = evaluateExperiment(exp, variants);

    expect(result.recommendations[0]!.action).toBe("continue");
    expect(result.testResult).toBeNull();
  });

  it("recommends promote_winner when significant", () => {
    const exp = makeExperiment({ minSampleSize: 100 });
    const variants = [
      makeVariant({ impressions: 2000, conversions: 200 }), // 10%
      makeVariant({ id: "var_2", label: "Challenger", isControl: false, impressions: 2000, conversions: 320 }), // 16%
    ];

    const result = evaluateExperiment(exp, variants);

    const promoteRec = result.recommendations.find((r) => r.action === "promote_winner");
    expect(promoteRec).toBeDefined();
    expect(result.testResult).not.toBeNull();
    expect(result.testResult!.isSignificant).toBe(true);
  });

  it("detects sample ratio mismatch", () => {
    const exp = makeExperiment();
    const variants = [
      makeVariant({ allocationPercent: 50, impressions: 800 }),
      makeVariant({ id: "var_2", label: "Challenger", isControl: false, allocationPercent: 50, impressions: 200 }),
    ];

    const result = evaluateExperiment(exp, variants);

    const srmAnomaly = result.anomalies.find((a) => a.type === "sample_ratio_mismatch");
    expect(srmAnomaly).toBeDefined();
  });

  it("uses chi-square for 3+ variants", () => {
    const exp = makeExperiment();
    const variants = [
      makeVariant({ impressions: 1000, conversions: 100, allocationPercent: 33 }),
      makeVariant({ id: "var_2", label: "B", isControl: false, impressions: 1000, conversions: 150, allocationPercent: 33 }),
      makeVariant({ id: "var_3", label: "C", isControl: false, impressions: 1000, conversions: 80, allocationPercent: 34 }),
    ];

    const result = evaluateExperiment(exp, variants);

    if (result.testResult) {
      expect(result.testResult.method).toBe("chi_square");
    }
  });

  it("suggests rebalance for bandit strategy", () => {
    const exp = makeExperiment({ trafficStrategy: "bandit", minSampleSize: 50 });
    const variants = [
      makeVariant({ impressions: 500, conversions: 50, allocationPercent: 50 }),
      makeVariant({ id: "var_2", label: "Challenger", isControl: false, impressions: 500, conversions: 45, allocationPercent: 50 }),
    ];

    const result = evaluateExperiment(exp, variants);

    const rebalance = result.recommendations.find((r) => r.action === "rebalance_traffic");
    // Only applies when not yet significant
    if (!result.testResult?.isSignificant) {
      expect(rebalance).toBeDefined();
      expect(rebalance!.suggestedAllocation).toBeDefined();
    }
  });

  it("returns safety checks", () => {
    const exp = makeExperiment();
    const variants = [
      makeVariant({ impressions: 1000 }),
      makeVariant({ id: "var_2", isControl: false, impressions: 1000 }),
    ];

    const result = evaluateExperiment(exp, variants);

    expect(result.safetyCheck).toBeDefined();
    expect(result.safetyCheck.checks.length).toBeGreaterThan(0);
  });

  it("handles single variant gracefully", () => {
    const exp = makeExperiment();
    const variants = [makeVariant()];

    const result = evaluateExperiment(exp, variants);

    expect(result.recommendations[0]!.action).toBe("continue");
    expect(result.recommendations[0]!.reasoning).toContain("2 active variants");
  });
});

// ─── evaluateSafetyGate ─────────────────────────────────────────────────────

describe("evaluateSafetyGate", () => {
  it("blocks promotion during critical anomaly", () => {
    const exp = makeExperiment();
    const variants = [makeVariant(), makeVariant({ id: "var_2", isControl: false })];
    const rec = { action: "promote_winner" as const, confidence: 0.97, reasoning: "test" };
    const anomalies = [{
      experimentId: "exp_test_1",
      type: "sample_ratio_mismatch" as const,
      severity: "critical" as const,
      description: "SRM detected",
      detectedAt: new Date().toISOString(),
      acknowledged: false,
    }];

    const result = evaluateSafetyGate(exp, variants, rec, DEFAULT_AUTO_CONFIG, anomalies);

    expect(result.allowed).toBe(false);
    expect(result.riskLevel).toBe("critical");
  });

  it("blocks promotion below confidence threshold", () => {
    const exp = makeExperiment();
    const variants = [makeVariant(), makeVariant({ id: "var_2", isControl: false })];
    const rec = { action: "promote_winner" as const, confidence: 0.85, reasoning: "test" };

    const result = evaluateSafetyGate(exp, variants, rec, DEFAULT_AUTO_CONFIG, []);

    expect(result.allowed).toBe(false);
    expect(result.blockedReasons.some((r) => r.includes("Confidence"))).toBe(true);
  });

  it("blocks promotion before minimum runtime", () => {
    const exp = makeExperiment({ startDate: new Date().toISOString() }); // Just started
    const variants = [makeVariant(), makeVariant({ id: "var_2", isControl: false })];
    const rec = { action: "promote_winner" as const, confidence: 0.97, reasoning: "test" };

    const result = evaluateSafetyGate(exp, variants, rec, DEFAULT_AUTO_CONFIG, []);

    expect(result.allowed).toBe(false);
    expect(result.blockedReasons.some((r) => r.includes("minimum"))).toBe(true);
  });

  it("allows action when all checks pass", () => {
    const exp = makeExperiment({ minSampleSize: 100 });
    const variants = [
      makeVariant({ impressions: 2000, conversions: 200 }),
      makeVariant({ id: "var_2", isControl: false, impressions: 2000, conversions: 320 }),
    ];
    const rec = { action: "promote_winner" as const, confidence: 0.97, reasoning: "test" };

    const result = evaluateSafetyGate(exp, variants, rec, DEFAULT_AUTO_CONFIG, []);

    expect(result.allowed).toBe(true);
    expect(result.blockedReasons).toHaveLength(0);
  });

  it("prevents killing last challenger", () => {
    const exp = makeExperiment();
    const variants = [
      makeVariant(),
      makeVariant({ id: "var_2", label: "Only Challenger", isControl: false }),
    ];
    const rec = { action: "kill_loser" as const, confidence: 0.95, reasoning: "underperforming", targetVariantId: "var_2" };

    const result = evaluateSafetyGate(exp, variants, rec, DEFAULT_AUTO_CONFIG, []);

    expect(result.allowed).toBe(false);
    expect(result.blockedReasons.some((r) => r.includes("last active challenger"))).toBe(true);
  });
});

// ─── checkExperimentPermission ──────────────────────────────────────────────

describe("checkExperimentPermission", () => {
  it("allows read with read permission", () => {
    const result = checkExperimentPermission(["experiments:read"], "view_experiments");
    expect(result.allowed).toBe(true);
  });

  it("blocks write actions with only read permission", () => {
    const result = checkExperimentPermission(["experiments:read"], "create_experiment");
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("experiments:write");
  });

  it("allows admin-only actions with admin permission", () => {
    const result = checkExperimentPermission(["experiments:admin"], "promote_winner");
    expect(result.allowed).toBe(true);
  });

  it("blocks admin actions with write permission", () => {
    const result = checkExperimentPermission(["experiments:write"], "delete_experiment");
    expect(result.allowed).toBe(false);
  });

  it("allows multiple permissions (any match)", () => {
    const result = checkExperimentPermission(
      ["experiments:read", "experiments:write"],
      "edit_experiment"
    );
    expect(result.allowed).toBe(true);
  });
});

// ─── checkRateLimit ─────────────────────────────────────────────────────────

describe("checkRateLimit", () => {
  it("allows action within limits", () => {
    const recentActions = [
      { action: "traffic_rebalanced", timestamp: new Date().toISOString() },
    ];

    const result = checkRateLimit(recentActions, "traffic_rebalanced");
    expect(result.allowed).toBe(true);
  });

  it("blocks when hourly limit exceeded", () => {
    const now = new Date();
    const recentActions = Array.from({ length: 11 }, (_, i) => ({
      action: "traffic_rebalanced",
      timestamp: new Date(now.getTime() - i * 60_000).toISOString(),
    }));

    const result = checkRateLimit(recentActions, "traffic_rebalanced");
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("actions/hour");
  });

  it("blocks promotions exceeding daily limit", () => {
    const now = new Date();
    const recentActions = Array.from({ length: 3 }, (_, i) => ({
      action: "winner_promoted",
      timestamp: new Date(now.getTime() - i * 3_600_000).toISOString(),
    }));

    const result = checkRateLimit(recentActions, "winner_promoted");
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("promotions/day");
  });

  it("enforces cooldown after promotion", () => {
    const recentActions = [
      { action: "winner_promoted", timestamp: new Date(Date.now() - 10 * 60_000).toISOString() },
    ];

    const result = checkRateLimit(recentActions, "winner_promoted");
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("Cooldown");
  });

  it("allows promotion after cooldown expires", () => {
    const recentActions = [
      { action: "winner_promoted", timestamp: new Date(Date.now() - 120 * 60_000).toISOString() },
    ];

    const result = checkRateLimit(recentActions, "winner_promoted");
    expect(result.allowed).toBe(true);
  });
});

// ─── shouldAutoRollback ─────────────────────────────────────────────────────

describe("shouldAutoRollback", () => {
  it("triggers rollback on conversion rate drop", () => {
    const window = {
      experimentId: "exp_1",
      promotedVariantId: "var_1",
      promotedAt: new Date(Date.now() - 3_600_000).toISOString(),
      canRollbackUntil: new Date(Date.now() + 86_400_000).toISOString(),
      metricsAtPromotion: { conversionRate: 0.15, revenuePerImpression: 0.05, impressions: 2000 },
    };
    const currentMetrics = { conversionRate: 0.08, revenuePerImpression: 0.03, impressions: 500 };

    const result = shouldAutoRollback(window, currentMetrics);

    expect(result.shouldRollback).toBe(true);
    expect(result.reason).toContain("dropped");
  });

  it("does not rollback within normal variation", () => {
    const window = {
      experimentId: "exp_1",
      promotedVariantId: "var_1",
      promotedAt: new Date(Date.now() - 3_600_000).toISOString(),
      canRollbackUntil: new Date(Date.now() + 86_400_000).toISOString(),
      metricsAtPromotion: { conversionRate: 0.15, revenuePerImpression: 0.05, impressions: 2000 },
    };
    const currentMetrics = { conversionRate: 0.14, revenuePerImpression: 0.048, impressions: 500 };

    const result = shouldAutoRollback(window, currentMetrics);

    expect(result.shouldRollback).toBe(false);
  });

  it("does not rollback after window expires", () => {
    const window = {
      experimentId: "exp_1",
      promotedVariantId: "var_1",
      promotedAt: new Date(Date.now() - 86_400_000 * 3).toISOString(),
      canRollbackUntil: new Date(Date.now() - 86_400_000).toISOString(), // Expired
      metricsAtPromotion: { conversionRate: 0.15, revenuePerImpression: 0.05, impressions: 2000 },
    };
    const currentMetrics = { conversionRate: 0.01, revenuePerImpression: 0.001, impressions: 500 };

    const result = shouldAutoRollback(window, currentMetrics);

    expect(result.shouldRollback).toBe(false);
    expect(result.reason).toContain("expired");
  });

  it("waits for minimum post-promotion data", () => {
    const window = {
      experimentId: "exp_1",
      promotedVariantId: "var_1",
      promotedAt: new Date(Date.now() - 3_600_000).toISOString(),
      canRollbackUntil: new Date(Date.now() + 86_400_000).toISOString(),
      metricsAtPromotion: { conversionRate: 0.15, revenuePerImpression: 0.05, impressions: 2000 },
    };
    const currentMetrics = { conversionRate: 0.01, revenuePerImpression: 0.001, impressions: 20 };

    const result = shouldAutoRollback(window, currentMetrics);

    expect(result.shouldRollback).toBe(false);
    expect(result.reason).toContain("Insufficient");
  });
});
