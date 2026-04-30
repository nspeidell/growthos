/**
 * Growth Optimization Engine — Statistical Testing Library
 *
 * Production-grade implementations of:
 * - z-test for proportions (two-tailed)
 * - Chi-square test of independence
 * - Bayesian A/B testing (Beta-Binomial conjugate)
 * - Sequential testing (SPRT)
 * - Multi-arm bandit (Thompson Sampling)
 * - Power analysis and sample size estimation
 */

import type { StatisticalTest, BayesianResult, BanditAllocation } from "./types";

// ─── Constants ───────────────────────────────────────────────────────────────

const Z_TABLE: Record<string, number> = {
  "0.90": 1.645,
  "0.95": 1.960,
  "0.99": 2.576,
  "0.999": 3.291,
};

// ─── Normal Distribution Utilities ───────────────────────────────────────────

/**
 * Standard normal CDF using Abramowitz & Stegun approximation.
 * Accurate to ~1.5e-7.
 */
function normalCdf(z: number): number {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = z < 0 ? -1 : 1;
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1.0 / (1.0 + p * x);
  const y = 1.0 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

  return 0.5 * (1.0 + sign * y);
}

/**
 * Inverse normal CDF (quantile function) using rational approximation.
 */
function normalQuantile(p: number): number {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  if (p === 0.5) return 0;

  const t = p < 0.5 ? Math.sqrt(-2 * Math.log(p)) : Math.sqrt(-2 * Math.log(1 - p));

  // Rational approximation
  const c0 = 2.515517;
  const c1 = 0.802853;
  const c2 = 0.010328;
  const d1 = 1.432788;
  const d2 = 0.189269;
  const d3 = 0.001308;

  const result = t - (c0 + c1 * t + c2 * t * t) / (1 + d1 * t + d2 * t * t + d3 * t * t * t);
  return p < 0.5 ? -result : result;
}

// ─── Chi-Square Distribution ─────────────────────────────────────────────────

/**
 * Regularized incomplete gamma function using series expansion.
 */
function gammaIncomplete(a: number, x: number): number {
  if (x < 0) return 0;
  if (x === 0) return 0;

  // For large x relative to a, use the upper incomplete gamma (continued fraction)
  // and return 1 - Q(a, x) since P(a, x) = 1 - Q(a, x)
  if (x > a + 1) {
    return 1 - gammaIncompleteUpper(a, x);
  }

  // Lower incomplete gamma series: P(a,x) = (e^-x * x^a / Gamma(a)) * sum
  let sum = 1 / a;
  let term = 1 / a;

  for (let n = 1; n < 200; n++) {
    term *= x / (a + n);
    sum += term;
    if (Math.abs(term) < 1e-12 * Math.abs(sum)) break;
  }

  return sum * Math.exp(-x + a * Math.log(x) - logGamma(a));
}

/**
 * Upper incomplete gamma Q(a,x) via continued fraction (Lentz's method).
 */
function gammaIncompleteUpper(a: number, x: number): number {
  let f = 1e-30;
  let c = 1e-30;
  let d = 1 / (x + 1 - a);
  f = d;

  for (let n = 1; n < 200; n++) {
    const an = n * (a - n);
    const bn = x + 2 * n + 1 - a;
    d = bn + an * d;
    if (Math.abs(d) < 1e-30) d = 1e-30;
    c = bn + an / c;
    if (Math.abs(c) < 1e-30) c = 1e-30;
    d = 1 / d;
    const delta = d * c;
    f *= delta;
    if (Math.abs(delta - 1) < 1e-12) break;
  }

  return f * Math.exp(-x + a * Math.log(x) - logGamma(a));
}

/**
 * Log gamma function using Stirling's approximation.
 */
function logGamma(z: number): number {
  const c = [
    76.18009172947146, -86.50532032941677, 24.01409824083091,
    -1.231739572450155, 0.001208650973866179, -0.000005395239384953,
  ];

  let x = z;
  let y = z;
  let tmp = x + 5.5;
  tmp -= (x + 0.5) * Math.log(tmp);
  let ser = 1.000000000190015;

  for (let j = 0; j < 6; j++) {
    y += 1;
    ser += c[j]! / y;
  }

  return -tmp + Math.log(2.5066282746310005 * ser / x);
}

/**
 * Chi-square CDF.
 */
function chiSquareCdf(x: number, df: number): number {
  if (x <= 0) return 0;
  return gammaIncomplete(df / 2, x / 2);
}

/**
 * Chi-square survival function (1 - CDF) = p-value.
 */
function chiSquareSf(x: number, df: number): number {
  return 1 - chiSquareCdf(x, df);
}

// ─── Z-Test for Proportions ──────────────────────────────────────────────────

/**
 * Two-proportion z-test.
 *
 * Tests H0: pA = pB vs H1: pA ≠ pB (two-tailed).
 * Returns full statistical test result.
 */
export function zTestProportions(
  conversionsA: number,
  impressionsA: number,
  conversionsB: number,
  impressionsB: number,
  confidenceLevel = 0.95
): StatisticalTest {
  const pA = impressionsA > 0 ? conversionsA / impressionsA : 0;
  const pB = impressionsB > 0 ? conversionsB / impressionsB : 0;
  const pPooled = (conversionsA + conversionsB) / (impressionsA + impressionsB || 1);

  const se = Math.sqrt(
    pPooled * (1 - pPooled) * (1 / (impressionsA || 1) + 1 / (impressionsB || 1))
  );

  const zScore = se > 0 ? (pB - pA) / se : 0;
  const pValue = 2 * (1 - normalCdf(Math.abs(zScore)));
  const isSignificant = pValue < (1 - confidenceLevel);

  // Effect size (Cohen's h)
  const h = 2 * Math.asin(Math.sqrt(pB)) - 2 * Math.asin(Math.sqrt(pA));

  // Statistical power
  const zAlpha = normalQuantile(1 - (1 - confidenceLevel) / 2);
  const ncp = Math.abs(pB - pA) / (se || 1);
  const power = 1 - normalCdf(zAlpha - ncp);

  // Lift
  const liftPercent = pA > 0 ? ((pB - pA) / pA) * 100 : 0;

  // Confidence interval for difference
  const seDiff = Math.sqrt(pA * (1 - pA) / (impressionsA || 1) + pB * (1 - pB) / (impressionsB || 1));
  const marginOfError = zAlpha * seDiff;

  return {
    method: "z_test",
    pValue,
    confidenceLevel,
    isSignificant,
    effectSize: Math.abs(h),
    power: Math.min(power, 1),
    sampleSizeA: impressionsA,
    sampleSizeB: impressionsB,
    conversionRateA: pA,
    conversionRateB: pB,
    liftPercent,
    confidenceInterval: {
      lower: (pB - pA) - marginOfError,
      upper: (pB - pA) + marginOfError,
    },
  };
}

// ─── Chi-Square Test ─────────────────────────────────────────────────────────

/**
 * Chi-square test for independence (2xK contingency table).
 * Supports multi-variant testing.
 */
export function chiSquareTest(
  variants: Array<{ conversions: number; impressions: number }>,
  confidenceLevel = 0.95
): StatisticalTest {
  const k = variants.length;
  if (k < 2) {
    throw new Error("Chi-square test requires at least 2 variants");
  }

  const totalConversions = variants.reduce((s, v) => s + v.conversions, 0);
  const totalImpressions = variants.reduce((s, v) => s + v.impressions, 0);
  const totalNonConversions = totalImpressions - totalConversions;

  let chiSq = 0;
  for (const v of variants) {
    const expectedConv = (v.impressions * totalConversions) / (totalImpressions || 1);
    const expectedNonConv = (v.impressions * totalNonConversions) / (totalImpressions || 1);
    const nonConv = v.impressions - v.conversions;

    if (expectedConv > 0) {
      chiSq += Math.pow(v.conversions - expectedConv, 2) / expectedConv;
    }
    if (expectedNonConv > 0) {
      chiSq += Math.pow(nonConv - expectedNonConv, 2) / expectedNonConv;
    }
  }

  const df = k - 1;
  const pValue = chiSquareSf(chiSq, df);
  const isSignificant = pValue < (1 - confidenceLevel);

  // Find best and control (first variant)
  const control = variants[0]!;
  const best = variants.reduce((a, b) =>
    (b.conversions / (b.impressions || 1)) > (a.conversions / (a.impressions || 1)) ? b : a
  );

  const pA = control.impressions > 0 ? control.conversions / control.impressions : 0;
  const pB = best.impressions > 0 ? best.conversions / best.impressions : 0;
  const liftPercent = pA > 0 ? ((pB - pA) / pA) * 100 : 0;

  // Cramér's V for effect size
  const cramerV = Math.sqrt(chiSq / (totalImpressions * Math.min(1, k - 1)));

  return {
    method: "chi_square",
    pValue,
    confidenceLevel,
    isSignificant,
    effectSize: cramerV,
    power: 0, // Power calculation for chi-sq is complex; omitted
    sampleSizeA: control.impressions,
    sampleSizeB: best.impressions,
    conversionRateA: pA,
    conversionRateB: pB,
    liftPercent,
    confidenceInterval: { lower: 0, upper: 0 }, // CI not standard for chi-sq
  };
}

// ─── Bayesian A/B Testing ────────────────────────────────────────────────────

/**
 * Bayesian A/B test using Beta-Binomial conjugate model.
 *
 * Prior: Beta(1, 1) = Uniform (non-informative)
 * Posterior: Beta(α + conversions, β + non-conversions)
 *
 * Returns probability that B beats A using Monte Carlo simulation.
 */
export function bayesianTest(
  conversionsA: number,
  impressionsA: number,
  conversionsB: number,
  impressionsB: number,
  numSamples = 50_000
): BayesianResult {
  // Posterior parameters (with uniform prior Beta(1,1))
  const alphaA = 1 + conversionsA;
  const betaA = 1 + (impressionsA - conversionsA);
  const alphaB = 1 + conversionsB;
  const betaB = 1 + (impressionsB - conversionsB);

  // Monte Carlo: sample from posteriors
  let bWins = 0;
  let totalLoss = 0;

  for (let i = 0; i < numSamples; i++) {
    const sampleA = betaSample(alphaA, betaA);
    const sampleB = betaSample(alphaB, betaB);

    if (sampleB > sampleA) {
      bWins++;
    } else {
      totalLoss += sampleA - sampleB;
    }
  }

  const probabilityBBeatsA = bWins / numSamples;
  const expectedLoss = totalLoss / numSamples;

  // Credible interval for B's conversion rate (95% HDI approximation)
  const meanB = alphaB / (alphaB + betaB);
  const varB = (alphaB * betaB) / ((alphaB + betaB) ** 2 * (alphaB + betaB + 1));
  const sdB = Math.sqrt(varB);

  return {
    probabilityBBeatsA,
    expectedLoss,
    credibleInterval: {
      lower: Math.max(0, meanB - 1.96 * sdB),
      upper: Math.min(1, meanB + 1.96 * sdB),
    },
    posteriorA: { alpha: alphaA, beta: betaA },
    posteriorB: { alpha: alphaB, beta: betaB },
  };
}

/**
 * Sample from Beta distribution using Jöhnk's algorithm.
 */
function betaSample(alpha: number, beta: number): number {
  // Use the gamma sampling method for general alpha, beta
  const x = gammaSample(alpha);
  const y = gammaSample(beta);
  return x / (x + y);
}

/**
 * Sample from Gamma distribution using Marsaglia & Tsang method.
 */
function gammaSample(shape: number): number {
  if (shape < 1) {
    // Boost method for shape < 1
    return gammaSample(shape + 1) * Math.pow(Math.random(), 1 / shape);
  }

  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);

  // eslint-disable-next-line no-constant-condition
  while (true) {
    let x: number;
    let v: number;

    do {
      x = normalSample();
      v = 1 + c * x;
    } while (v <= 0);

    v = v * v * v;
    const u = Math.random();

    if (u < 1 - 0.0331 * (x * x) * (x * x)) return d * v;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}

/**
 * Box-Muller normal sample.
 */
function normalSample(): number {
  const u1 = Math.random();
  const u2 = Math.random();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

// ─── Sequential Testing (SPRT) ──────────────────────────────────────────────

/**
 * Sequential Probability Ratio Test.
 *
 * Allows early stopping if strong evidence exists,
 * without inflating false positive rate.
 */
export function sequentialTest(
  conversionsA: number,
  impressionsA: number,
  conversionsB: number,
  impressionsB: number,
  alpha = 0.05,
  beta = 0.2,
  mde = 0.02 // minimum detectable effect
): { decision: "accept_null" | "reject_null" | "continue"; logLikelihoodRatio: number } {
  const pA = impressionsA > 0 ? conversionsA / impressionsA : 0;
  const pB = impressionsB > 0 ? conversionsB / impressionsB : 0;

  // Boundaries
  const upperBound = Math.log((1 - beta) / alpha);
  const lowerBound = Math.log(beta / (1 - alpha));

  // Likelihood ratio for each observation
  const p0 = pA; // null hypothesis rate
  const p1 = pA + mde; // alternative hypothesis rate

  if (p0 <= 0 || p0 >= 1 || p1 <= 0 || p1 >= 1) {
    return { decision: "continue", logLikelihoodRatio: 0 };
  }

  // Aggregate log-likelihood ratio
  const llr =
    conversionsB * Math.log(p1 / p0) +
    (impressionsB - conversionsB) * Math.log((1 - p1) / (1 - p0));

  if (llr >= upperBound) {
    return { decision: "reject_null", logLikelihoodRatio: llr };
  } else if (llr <= lowerBound) {
    return { decision: "accept_null", logLikelihoodRatio: llr };
  }

  return { decision: "continue", logLikelihoodRatio: llr };
}

// ─── Multi-Arm Bandit (Thompson Sampling) ────────────────────────────────────

/**
 * Thompson Sampling allocation for multi-arm bandit experiments.
 *
 * Balances exploration vs. exploitation by sampling from
 * posterior distributions and allocating traffic proportionally.
 */
export function thompsonSamplingAllocation(
  variants: Array<{ id: string; conversions: number; impressions: number }>,
  numSimulations = 10_000
): BanditAllocation[] {
  const wins: Record<string, number> = {};
  const rewards: Record<string, number> = {};

  for (const v of variants) {
    wins[v.id] = 0;
    rewards[v.id] = 0;
  }

  for (let i = 0; i < numSimulations; i++) {
    let bestId = "";
    let bestSample = -1;

    for (const v of variants) {
      const alpha = 1 + v.conversions;
      const beta = 1 + (v.impressions - v.conversions);
      const sample = betaSample(alpha, beta);

      rewards[v.id]! += sample;

      if (sample > bestSample) {
        bestSample = sample;
        bestId = v.id;
      }
    }

    wins[bestId]!++;
  }

  return variants.map((v) => ({
    variantId: v.id,
    allocation: Math.round((wins[v.id]! / numSimulations) * 100) / 100,
    expectedReward: rewards[v.id]! / numSimulations,
    explorationBonus: 1 / Math.sqrt(1 + v.impressions), // UCB-style bonus
  }));
}

// ─── Sample Size Estimation ──────────────────────────────────────────────────

/**
 * Estimate required sample size per variant.
 *
 * Uses the standard formula for two-proportion z-test:
 *   n = (Zα/2 + Zβ)² × (p1(1-p1) + p2(1-p2)) / (p2 - p1)²
 */
export function estimateSampleSize(
  baselineRate: number,
  minimumDetectableEffect: number,
  confidenceLevel = 0.95,
  power = 0.8
): number {
  const p1 = baselineRate;
  const p2 = baselineRate + minimumDetectableEffect;

  if (p1 <= 0 || p1 >= 1 || p2 <= 0 || p2 >= 1) {
    return 10000; // fallback
  }

  const zAlpha = normalQuantile(1 - (1 - confidenceLevel) / 2);
  const zBeta = normalQuantile(power);

  const numerator = Math.pow(zAlpha + zBeta, 2) * (p1 * (1 - p1) + p2 * (1 - p2));
  const denominator = Math.pow(p2 - p1, 2);

  return Math.ceil(numerator / denominator);
}

// ─── Anomaly Detection ───────────────────────────────────────────────────────

/**
 * Sample Ratio Mismatch (SRM) test.
 *
 * Detects if actual traffic split deviates from expected split.
 * A significant SRM indicates data quality issues.
 */
export function sampleRatioMismatchTest(
  observedCounts: number[],
  expectedRatios: number[],
  confidenceLevel = 0.99
): { hasMismatch: boolean; pValue: number; chiSquare: number } {
  const totalObserved = observedCounts.reduce((s, c) => s + c, 0);
  const totalRatio = expectedRatios.reduce((s, r) => s + r, 0);

  let chiSq = 0;
  for (let i = 0; i < observedCounts.length; i++) {
    const expected = totalObserved * (expectedRatios[i]! / totalRatio);
    if (expected > 0) {
      chiSq += Math.pow(observedCounts[i]! - expected, 2) / expected;
    }
  }

  const df = observedCounts.length - 1;
  const pValue = chiSquareSf(chiSq, df);

  return {
    hasMismatch: pValue < (1 - confidenceLevel),
    pValue,
    chiSquare: chiSq,
  };
}

/**
 * Detect conversion rate anomalies using z-score against rolling average.
 */
export function detectConversionAnomaly(
  currentRate: number,
  historicalRates: number[],
  threshold = 3.0 // z-score threshold
): { isAnomaly: boolean; zScore: number; direction: "spike" | "drop" | "normal" } {
  if (historicalRates.length < 3) {
    return { isAnomaly: false, zScore: 0, direction: "normal" };
  }

  const mean = historicalRates.reduce((s, r) => s + r, 0) / historicalRates.length;
  const variance = historicalRates.reduce((s, r) => s + Math.pow(r - mean, 2), 0) / historicalRates.length;
  const sd = Math.sqrt(variance);

  if (sd === 0) {
    return { isAnomaly: currentRate !== mean, zScore: currentRate !== mean ? Infinity : 0, direction: currentRate > mean ? "spike" : "drop" };
  }

  const zScore = (currentRate - mean) / sd;
  const isAnomaly = Math.abs(zScore) > threshold;

  return {
    isAnomaly,
    zScore,
    direction: zScore > threshold ? "spike" : zScore < -threshold ? "drop" : "normal",
  };
}
