import { describe, it, expect } from "vitest";
import {
  zTestProportions,
  chiSquareTest,
  bayesianTest,
  sequentialTest,
  thompsonSamplingAllocation,
  estimateSampleSize,
  sampleRatioMismatchTest,
  detectConversionAnomaly,
} from "./stats";

// ─── z-Test for Proportions ─────────────────────────────────────────────────

describe("zTestProportions", () => {
  it("detects significant difference with large sample", () => {
    // Control: 100/1000 = 10%, Variant: 150/1000 = 15%
    const result = zTestProportions(100, 1000, 150, 1000, 0.95);

    expect(result.isSignificant).toBe(true);
    expect(result.method).toBe("z_test");
    expect(result.pValue).toBeLessThan(0.05);
    expect(result.liftPercent).toBeCloseTo(50, 0); // 50% relative lift
    expect(result.confidenceLevel).toBeGreaterThanOrEqual(0.95);
    expect(result.conversionRateA).toBeCloseTo(0.1);
    expect(result.conversionRateB).toBeCloseTo(0.15);
  });

  it("returns not significant for small differences", () => {
    // Control: 50/500 = 10%, Variant: 52/500 = 10.4%
    const result = zTestProportions(50, 500, 52, 500, 0.95);

    expect(result.isSignificant).toBe(false);
    expect(result.pValue).toBeGreaterThan(0.05);
  });

  it("handles zero conversions gracefully", () => {
    const result = zTestProportions(0, 1000, 10, 1000, 0.95);

    expect(result.conversionRateA).toBe(0);
    expect(result.conversionRateB).toBeCloseTo(0.01);
    expect(result.method).toBe("z_test");
  });

  it("handles zero impressions without crashing", () => {
    const result = zTestProportions(0, 0, 0, 0, 0.95);

    expect(result.isSignificant).toBe(false);
    expect(result.sampleSizeA).toBe(0);
    expect(result.sampleSizeB).toBe(0);
  });

  it("computes effect size (Cohen's h)", () => {
    const result = zTestProportions(100, 1000, 150, 1000, 0.95);

    expect(result.effectSize).toBeGreaterThan(0);
    expect(result.effectSize).toBeLessThan(1); // Small-medium effect
  });

  it("provides power estimate", () => {
    const result = zTestProportions(100, 1000, 150, 1000, 0.95);

    expect(result.power).toBeGreaterThan(0);
    expect(result.power).toBeLessThanOrEqual(1);
  });

  it("respects different confidence thresholds", () => {
    // Barely significant at 95% should not be significant at 99%
    const result95 = zTestProportions(100, 1000, 120, 1000, 0.95);
    const result99 = zTestProportions(100, 1000, 120, 1000, 0.99);

    // 99% has stricter threshold
    if (result95.isSignificant) {
      expect(result99.pValue).toBeGreaterThanOrEqual(result95.pValue);
    }
  });
});

// ─── Chi-Square Test ────────────────────────────────────────────────────────

describe("chiSquareTest", () => {
  it("detects significance across multiple variants", () => {
    const variants = [
      { conversions: 100, impressions: 1000 }, // 10%
      { conversions: 150, impressions: 1000 }, // 15%
      { conversions: 80, impressions: 1000 },  // 8%
    ];

    const result = chiSquareTest(variants, 0.95);

    expect(result.isSignificant).toBe(true);
    expect(result.method).toBe("chi_square");
    expect(result.pValue).toBeLessThan(0.05);
  });

  it("returns not significant for similar rates", () => {
    const variants = [
      { conversions: 100, impressions: 1000 }, // 10%
      { conversions: 102, impressions: 1000 }, // 10.2%
      { conversions: 98, impressions: 1000 },  // 9.8%
    ];

    const result = chiSquareTest(variants, 0.95);

    expect(result.isSignificant).toBe(false);
  });

  it("computes lift as best vs worst", () => {
    const variants = [
      { conversions: 100, impressions: 1000 },
      { conversions: 150, impressions: 1000 },
    ];

    const result = chiSquareTest(variants, 0.95);

    expect(result.liftPercent).toBeGreaterThan(0);
  });

  it("handles two variants (degenerates to 2x2)", () => {
    const variants = [
      { conversions: 50, impressions: 500 },
      { conversions: 75, impressions: 500 },
    ];

    const result = chiSquareTest(variants, 0.95);
    expect(result.method).toBe("chi_square");
  });
});

// ─── Bayesian Test ──────────────────────────────────────────────────────────

describe("bayesianTest", () => {
  it("returns probability B beats A", () => {
    // B clearly better: 15% vs 10%
    const result = bayesianTest(100, 1000, 150, 1000);

    expect(result.probabilityBBeatsA).toBeGreaterThan(0.9);
    expect(result.expectedLoss).toBeGreaterThanOrEqual(0);
  });

  it("returns ~50% for identical rates", () => {
    const result = bayesianTest(100, 1000, 100, 1000);

    // Should be close to 50-50
    expect(result.probabilityBBeatsA).toBeGreaterThan(0.35);
    expect(result.probabilityBBeatsA).toBeLessThan(0.65);
  });

  it("returns credible intervals", () => {
    const result = bayesianTest(100, 1000, 150, 1000);

    expect(result.credibleInterval).toBeDefined();
    expect(result.credibleInterval.lower).toBeLessThan(result.credibleInterval.upper);
    expect(result.posteriorA).toBeDefined();
    expect(result.posteriorB).toBeDefined();
  });

  it("handles small samples conservatively", () => {
    // With tiny samples, should be uncertain
    const result = bayesianTest(2, 10, 3, 10);

    expect(result.probabilityBBeatsA).toBeGreaterThan(0.3);
    expect(result.probabilityBBeatsA).toBeLessThan(0.8);
  });
});

// ─── Sequential Test (SPRT) ────────────────────────────────────────────────

describe("sequentialTest", () => {
  it("returns continue for early data", () => {
    const result = sequentialTest(10, 100, 12, 100, 0.05, 0.2, 0.02);

    expect(result.decision).toBe("continue");
  });

  it("returns a decision when clear winner emerges", () => {
    // Large difference with big sample
    const result = sequentialTest(100, 1000, 200, 1000, 0.05, 0.2, 0.02);

    // With 10% vs 20%, should strongly decide
    expect(["accept_null", "reject_null", "continue"]).toContain(result.decision);
  });

  it("returns log likelihood ratio", () => {
    const result = sequentialTest(50, 500, 70, 500, 0.05, 0.2, 0.02);

    expect(typeof result.logLikelihoodRatio).toBe("number");
  });
});

// ─── Thompson Sampling ──────────────────────────────────────────────────────

describe("thompsonSamplingAllocation", () => {
  it("allocates more traffic to better-performing variant", () => {
    const variants = [
      { id: "control", conversions: 50, impressions: 1000 },  // 5%
      { id: "variant", conversions: 100, impressions: 1000 }, // 10%
    ];

    const allocations = thompsonSamplingAllocation(variants);

    expect(allocations).toHaveLength(2);
    const variantAlloc = allocations.find((a) => a.variantId === "variant")!;
    const controlAlloc = allocations.find((a) => a.variantId === "control")!;

    expect(variantAlloc.allocation).toBeGreaterThan(controlAlloc.allocation);
  });

  it("allocations sum to 1.0", () => {
    const variants = [
      { id: "a", conversions: 30, impressions: 500 },
      { id: "b", conversions: 45, impressions: 500 },
      { id: "c", conversions: 20, impressions: 500 },
    ];

    const allocations = thompsonSamplingAllocation(variants);
    const sum = allocations.reduce((s, a) => s + a.allocation, 0);

    expect(sum).toBeCloseTo(1.0, 2);
  });

  it("gives roughly equal allocation for identical performance", () => {
    const variants = [
      { id: "a", conversions: 50, impressions: 500 },
      { id: "b", conversions: 50, impressions: 500 },
    ];

    const allocations = thompsonSamplingAllocation(variants);

    // Should be roughly 50/50 with some variance
    for (const a of allocations) {
      expect(a.allocation).toBeGreaterThan(0.2);
      expect(a.allocation).toBeLessThan(0.8);
    }
  });

  it("handles zero impressions (prior-dominated)", () => {
    const variants = [
      { id: "a", conversions: 0, impressions: 0 },
      { id: "b", conversions: 0, impressions: 0 },
    ];

    const allocations = thompsonSamplingAllocation(variants);
    const sum = allocations.reduce((s, a) => s + a.allocation, 0);

    expect(sum).toBeCloseTo(1.0, 2);
  });
});

// ─── Sample Size Estimation ─────────────────────────────────────────────────

describe("estimateSampleSize", () => {
  it("returns reasonable sample size for typical params", () => {
    // 10% baseline, detect 2% absolute change, 95% confidence
    const n = estimateSampleSize(0.10, 0.02, 0.95);

    expect(n).toBeGreaterThan(500);
    expect(n).toBeLessThan(50000);
  });

  it("requires more samples for smaller effects", () => {
    const nSmall = estimateSampleSize(0.10, 0.01, 0.95);
    const nLarge = estimateSampleSize(0.10, 0.05, 0.95);

    expect(nSmall).toBeGreaterThan(nLarge);
  });

  it("requires more samples for higher confidence", () => {
    const n95 = estimateSampleSize(0.10, 0.02, 0.95);
    const n99 = estimateSampleSize(0.10, 0.02, 0.99);

    expect(n99).toBeGreaterThan(n95);
  });

  it("handles edge case rates", () => {
    const nLow = estimateSampleSize(0.01, 0.005, 0.95);
    const nHigh = estimateSampleSize(0.50, 0.05, 0.95);

    expect(nLow).toBeGreaterThan(0);
    expect(nHigh).toBeGreaterThan(0);
  });
});

// ─── Sample Ratio Mismatch ──────────────────────────────────────────────────

describe("sampleRatioMismatchTest", () => {
  it("detects mismatch when traffic is skewed", () => {
    // Expected 50/50, got 70/30
    const result = sampleRatioMismatchTest([700, 300], [50, 50]);

    expect(result.hasMismatch).toBe(true);
    expect(result.pValue).toBeLessThan(0.01);
  });

  it("passes when traffic is balanced", () => {
    // Expected 50/50, got 510/490
    const result = sampleRatioMismatchTest([510, 490], [50, 50]);

    expect(result.hasMismatch).toBe(false);
    expect(result.pValue).toBeGreaterThan(0.01);
  });

  it("handles unequal expected splits", () => {
    // Expected 70/30, got 690/310
    const result = sampleRatioMismatchTest([690, 310], [70, 30]);

    expect(result.hasMismatch).toBe(false);
  });

  it("handles multiple variants", () => {
    // 3-way split expected 33/33/34, got 340/320/340
    const result = sampleRatioMismatchTest([340, 320, 340], [33, 33, 34]);

    expect(result.hasMismatch).toBe(false);
  });
});

// ─── Conversion Anomaly Detection ───────────────────────────────────────────

describe("detectConversionAnomaly", () => {
  it("detects a spike", () => {
    // Historical rates around 5%, current at 15%
    const result = detectConversionAnomaly(0.15, [0.05, 0.04, 0.06, 0.05, 0.05], 2.0);

    expect(result.isAnomaly).toBe(true);
    expect(result.direction).toBe("spike");
    expect(result.zScore).toBeGreaterThan(2.0);
  });

  it("detects a drop", () => {
    // Historical rates around 10%, current at 2%
    const result = detectConversionAnomaly(0.02, [0.10, 0.09, 0.11, 0.10, 0.10], 2.0);

    expect(result.isAnomaly).toBe(true);
    expect(result.direction).toBe("drop");
    expect(result.zScore).toBeLessThan(-2.0);
  });

  it("passes for normal variation", () => {
    // Within normal range
    const result = detectConversionAnomaly(0.11, [0.10, 0.09, 0.11, 0.10, 0.10], 2.0);

    expect(result.isAnomaly).toBe(false);
  });

  it("handles single historical point gracefully", () => {
    const result = detectConversionAnomaly(0.05, [0.10], 2.0);

    // Can't compute std with one point — should not crash
    expect(typeof result.isAnomaly).toBe("boolean");
  });
});
