/**
 * Growth Optimization Engine — Decision Engine
 *
 * Evaluates active experiments and produces actionable recommendations:
 * - Promote winners when significance reached
 * - Kill underperformers below threshold
 * - Rebalance traffic via Thompson Sampling
 * - Flag anomalies
 * - Suggest increasing sample size
 */

import {
  zTestProportions,
  chiSquareTest,
  bayesianTest,
  thompsonSamplingAllocation,
  sampleRatioMismatchTest,
  detectConversionAnomaly,
  estimateSampleSize,
} from "./stats";
import type {
  GrowthExperiment,
  GrowthVariant,
  DecisionRecommendation,
  SafetyCheck,
  AnomalyAlert,
  StatisticalTest,
  BayesianResult,
} from "./types";

// ─── Main Evaluation ─────────────────────────────────────────────────────────

/**
 * Evaluate a single experiment and return recommendations.
 */
export function evaluateExperiment(
  experiment: GrowthExperiment,
  variants: GrowthVariant[]
): {
  recommendations: DecisionRecommendation[];
  testResult: StatisticalTest | null;
  bayesianResult: BayesianResult | null;
  anomalies: AnomalyAlert[];
  safetyCheck: SafetyCheck;
} {
  const recommendations: DecisionRecommendation[] = [];
  const anomalies: AnomalyAlert[] = [];

  // Run safety checks first
  const safetyCheck = runSafetyChecks(experiment, variants);

  // Need at least 2 active variants
  const activeVariants = variants.filter((v) => v.active);
  if (activeVariants.length < 2) {
    recommendations.push({
      action: "continue",
      confidence: 0,
      reasoning: "Need at least 2 active variants to evaluate",
    });
    return { recommendations, testResult: null, bayesianResult: null, anomalies, safetyCheck };
  }

  // Check minimum sample size
  const totalImpressions = activeVariants.reduce((s, v) => s + v.impressions, 0);
  const minRequired = experiment.minSampleSize * activeVariants.length;

  if (totalImpressions < minRequired) {
    recommendations.push({
      action: "continue",
      confidence: 0,
      reasoning: `Insufficient data: ${totalImpressions}/${minRequired} impressions collected`,
    });
    return { recommendations, testResult: null, bayesianResult: null, anomalies, safetyCheck };
  }

  // Check for sample ratio mismatch
  const observedCounts = activeVariants.map((v) => v.impressions);
  const expectedRatios = activeVariants.map((v) => v.allocationPercent);
  const srm = sampleRatioMismatchTest(observedCounts, expectedRatios);

  if (srm.hasMismatch) {
    anomalies.push({
      experimentId: experiment.id,
      type: "sample_ratio_mismatch",
      severity: "high",
      description: `Traffic split deviates from expected (p=${srm.pValue.toFixed(4)}). Data integrity may be compromised.`,
      detectedAt: new Date().toISOString(),
      acknowledged: false,
    });
    recommendations.push({
      action: "flag_anomaly",
      confidence: 1 - srm.pValue,
      reasoning: "Sample ratio mismatch detected — investigate traffic splitting logic",
    });
  }

  // Run statistical tests
  const control = activeVariants.find((v) => v.isControl) ?? activeVariants[0]!;
  const challengers = activeVariants.filter((v) => v.id !== control.id);

  let testResult: StatisticalTest | null = null;
  let bayesianResult: BayesianResult | null = null;

  if (activeVariants.length === 2) {
    // Standard A/B: z-test
    const challenger = challengers[0]!;
    testResult = zTestProportions(
      control.conversions,
      control.impressions,
      challenger.conversions,
      challenger.impressions,
      experiment.confidenceThreshold
    );

    // Also run Bayesian for supplementary insight
    bayesianResult = bayesianTest(
      control.conversions,
      control.impressions,
      challenger.conversions,
      challenger.impressions
    );
  } else {
    // Multi-variant: chi-square
    testResult = chiSquareTest(
      activeVariants.map((v) => ({ conversions: v.conversions, impressions: v.impressions })),
      experiment.confidenceThreshold
    );
  }

  // Generate recommendations based on results
  if (testResult.isSignificant) {
    // Find the winner
    const winner = activeVariants.reduce((a, b) =>
      (b.conversions / (b.impressions || 1)) > (a.conversions / (a.impressions || 1)) ? b : a
    );

    if (experiment.autoPromoteWinner) {
      recommendations.push({
        action: "promote_winner",
        confidence: testResult.confidenceLevel,
        reasoning: `Variant "${winner.label}" wins with ${testResult.liftPercent.toFixed(1)}% lift (p=${testResult.pValue.toFixed(4)})`,
        targetVariantId: winner.id,
      });
    } else {
      recommendations.push({
        action: "continue",
        confidence: testResult.confidenceLevel,
        reasoning: `Significant result found: "${winner.label}" leads by ${testResult.liftPercent.toFixed(1)}%. Manual promotion recommended.`,
        targetVariantId: winner.id,
      });
    }

    // Kill losers if enabled
    if (experiment.autoKillLosers) {
      for (const v of activeVariants) {
        if (v.id === winner.id) continue;
        const rate = v.impressions > 0 ? v.conversions / v.impressions : 0;
        const winnerRate = winner.impressions > 0 ? winner.conversions / winner.impressions : 0;
        const relativePerf = winnerRate > 0 ? rate / winnerRate : 0;

        if (relativePerf < 0.5) {
          recommendations.push({
            action: "kill_loser",
            confidence: testResult.confidenceLevel,
            reasoning: `Variant "${v.label}" performing at ${(relativePerf * 100).toFixed(0)}% of winner — recommend killing`,
            targetVariantId: v.id,
          });
        }
      }
    }
  } else {
    // Not yet significant
    const baseRate = control.impressions > 0 ? control.conversions / control.impressions : 0;
    const neededPerVariant = estimateSampleSize(baseRate, 0.02, experiment.confidenceThreshold);
    const maxImpressions = Math.max(...activeVariants.map((v) => v.impressions));

    if (maxImpressions < neededPerVariant * 0.3) {
      recommendations.push({
        action: "increase_sample",
        confidence: 0,
        reasoning: `Need ~${neededPerVariant.toLocaleString()} impressions/variant for 2% MDE. Currently at ${maxImpressions.toLocaleString()}.`,
      });
    } else {
      recommendations.push({
        action: "continue",
        confidence: 1 - (testResult.pValue || 1),
        reasoning: `Not yet significant (p=${(testResult.pValue ?? 1).toFixed(4)}). Continue collecting data.`,
      });
    }

    // Rebalance traffic for bandit strategy
    if (experiment.trafficStrategy === "bandit") {
      const allocations = thompsonSamplingAllocation(
        activeVariants.map((v) => ({
          id: v.id,
          conversions: v.conversions,
          impressions: v.impressions,
        }))
      );

      const allocationMap: Record<string, number> = {};
      for (const a of allocations) {
        allocationMap[a.variantId] = Math.round(a.allocation * 100);
      }

      recommendations.push({
        action: "rebalance_traffic",
        confidence: 0.5,
        reasoning: "Thompson Sampling suggests traffic reallocation to exploit early winners",
        suggestedAllocation: allocationMap,
      });
    }
  }

  // Check for conversion anomalies on each variant
  for (const v of activeVariants) {
    const currentRate = v.impressions > 0 ? v.conversions / v.impressions : 0;
    // Use other variants' rates as "historical" baseline
    const otherRates = activeVariants
      .filter((ov) => ov.id !== v.id && ov.impressions > 0)
      .map((ov) => ov.conversions / ov.impressions);

    if (otherRates.length >= 2) {
      const anomaly = detectConversionAnomaly(currentRate, otherRates, 2.5);
      if (anomaly.isAnomaly) {
        anomalies.push({
          experimentId: experiment.id,
          type: anomaly.direction === "spike" ? "conversion_spike" : "conversion_drop",
          severity: Math.abs(anomaly.zScore) > 4 ? "critical" : "medium",
          description: `Variant "${v.label}" ${anomaly.direction}: ${(currentRate * 100).toFixed(2)}% (z=${anomaly.zScore.toFixed(2)})`,
          detectedAt: new Date().toISOString(),
          acknowledged: false,
        });
      }
    }
  }

  return { recommendations, testResult, bayesianResult, anomalies, safetyCheck };
}

// ─── Safety Checks ───────────────────────────────────────────────────────────

function runSafetyChecks(
  experiment: GrowthExperiment,
  variants: GrowthVariant[]
): SafetyCheck {
  const checks: SafetyCheck["checks"] = [];

  // 1. Minimum sample size
  const totalImpressions = variants.reduce((s, v) => s + v.impressions, 0);
  const minTotal = experiment.minSampleSize * variants.length;
  checks.push({
    name: "Minimum sample size",
    passed: totalImpressions >= minTotal,
    message: totalImpressions >= minTotal
      ? `${totalImpressions} impressions (minimum: ${minTotal})`
      : `Only ${totalImpressions}/${minTotal} impressions collected`,
  });

  // 2. Budget cap
  if (experiment.budgetCapCents != null) {
    const totalSpend = variants.reduce((s, v) => s + v.revenueCents, 0);
    const withinBudget = totalSpend <= experiment.budgetCapCents;
    checks.push({
      name: "Budget cap",
      passed: withinBudget,
      message: withinBudget
        ? `$${(totalSpend / 100).toFixed(2)} of $${(experiment.budgetCapCents / 100).toFixed(2)} budget used`
        : `Budget exceeded: $${(totalSpend / 100).toFixed(2)} > $${(experiment.budgetCapCents / 100).toFixed(2)}`,
    });
  }

  // 3. End date not passed
  if (experiment.endDate) {
    const endDate = new Date(experiment.endDate);
    const now = new Date();
    const notExpired = now < endDate;
    checks.push({
      name: "Experiment timeframe",
      passed: notExpired,
      message: notExpired
        ? `Ends ${endDate.toLocaleDateString()}`
        : `Expired on ${endDate.toLocaleDateString()}`,
    });
  }

  // 4. At least 2 active variants
  const activeCount = variants.filter((v) => v.active).length;
  checks.push({
    name: "Active variants",
    passed: activeCount >= 2,
    message: `${activeCount} active variant(s)`,
  });

  // 5. No variant with zero impressions (after warmup)
  const warmupThreshold = Math.min(experiment.minSampleSize, 50);
  const allHaveData = variants.every(
    (v) => !v.active || v.impressions >= warmupThreshold
  );
  checks.push({
    name: "Data coverage",
    passed: allHaveData || totalImpressions < warmupThreshold * variants.length,
    message: allHaveData ? "All variants receiving traffic" : "Some variants have insufficient data",
  });

  return {
    passed: checks.every((c) => c.passed),
    checks,
  };
}

// ─── Batch Evaluation ────────────────────────────────────────────────────────

/**
 * Evaluate all active experiments in a workspace.
 * Used by the nightly cron.
 */
export function evaluateAllExperiments(
  experiments: Array<{ experiment: GrowthExperiment; variants: GrowthVariant[] }>
): Array<{
  experimentId: string;
  recommendations: DecisionRecommendation[];
  anomalies: AnomalyAlert[];
  testResult: StatisticalTest | null;
}> {
  return experiments.map(({ experiment, variants }) => {
    const result = evaluateExperiment(experiment, variants);
    return {
      experimentId: experiment.id,
      recommendations: result.recommendations,
      anomalies: result.anomalies,
      testResult: result.testResult,
    };
  });
}
