/**
 * Growth Optimization Engine — Enterprise Safety Layer
 *
 * Multi-layered safety system preventing:
 * - Revenue-destroying auto-actions
 * - Budget overruns
 * - Traffic allocation errors
 * - Data integrity issues
 * - Unauthorized experiment modifications
 *
 * Every auto-action passes through this gate before execution.
 */

import type {
  GrowthExperiment,
  GrowthVariant,
  AutoOptimizeConfig,
  DecisionRecommendation,
  AnomalyAlert,
} from "./types";

// ─── Safety Gate ────────────────────────────────────────────────────────────

export interface SafetyGateResult {
  allowed: boolean;
  blockedReasons: string[];
  warnings: string[];
  riskLevel: "low" | "medium" | "high" | "critical";
  requiresApproval: boolean;
}

/**
 * Main safety gate — every auto-action must pass through this.
 * Returns whether the action is allowed and any blocking reasons.
 */
export function evaluateSafetyGate(
  experiment: GrowthExperiment,
  variants: GrowthVariant[],
  recommendation: DecisionRecommendation,
  config: AutoOptimizeConfig,
  anomalies: AnomalyAlert[]
): SafetyGateResult {
  const blockedReasons: string[] = [];
  const warnings: string[] = [];
  let riskLevel: SafetyGateResult["riskLevel"] = "low";

  // ── Check 1: Active anomalies block promotions ──
  const criticalAnomalies = anomalies.filter(
    (a) => a.experimentId === experiment.id && a.severity === "critical" && !a.acknowledged
  );
  if (criticalAnomalies.length > 0 && recommendation.action === "promote_winner") {
    blockedReasons.push(
      `Critical anomaly detected: ${criticalAnomalies[0]!.description}. Cannot promote until resolved.`
    );
    riskLevel = "critical";
  }

  // ── Check 2: Minimum runtime guard ──
  const startDate = experiment.startDate ? new Date(experiment.startDate) : new Date(experiment.createdAt);
  const hoursRunning = (Date.now() - startDate.getTime()) / 3_600_000;
  const MIN_HOURS_BEFORE_ACTION = 24;

  if (hoursRunning < MIN_HOURS_BEFORE_ACTION && recommendation.action === "promote_winner") {
    blockedReasons.push(
      `Experiment running for ${hoursRunning.toFixed(0)}h — minimum ${MIN_HOURS_BEFORE_ACTION}h required before promotion`
    );
    riskLevel = elevateRisk(riskLevel, "medium");
  }

  // ── Check 3: Minimum sample per variant ──
  const minPerVariant = experiment.minSampleSize;
  const undersampled = variants.filter((v) => v.active && v.impressions < minPerVariant);
  if (undersampled.length > 0 && recommendation.action === "promote_winner") {
    blockedReasons.push(
      `${undersampled.length} variant(s) below minimum sample size (${minPerVariant}). Wait for more data.`
    );
    riskLevel = elevateRisk(riskLevel, "medium");
  }

  // ── Check 4: Budget proximity guard ──
  if (experiment.budgetCapCents != null) {
    const totalSpend = variants.reduce((s, v) => s + v.revenueCents, 0);
    const budgetUsed = totalSpend / experiment.budgetCapCents;

    if (budgetUsed > 1.0) {
      blockedReasons.push(`Budget exceeded: ${(budgetUsed * 100).toFixed(0)}% of cap spent`);
      riskLevel = elevateRisk(riskLevel, "high");
    } else if (budgetUsed > 0.9) {
      warnings.push(`Budget at ${(budgetUsed * 100).toFixed(0)}% — approaching cap`);
      riskLevel = elevateRisk(riskLevel, "medium");
    }
  }

  // ── Check 5: Sample Ratio Mismatch blocks all actions ──
  const srmAnomaly = anomalies.find(
    (a) => a.experimentId === experiment.id && a.type === "sample_ratio_mismatch" && !a.acknowledged
  );
  if (srmAnomaly) {
    blockedReasons.push(
      "Sample Ratio Mismatch detected — traffic split integrity compromised. All auto-actions blocked."
    );
    riskLevel = elevateRisk(riskLevel, "critical");
  }

  // ── Check 6: Confidence floor ──
  if (recommendation.action === "promote_winner" && recommendation.confidence < config.promoteAtConfidence) {
    blockedReasons.push(
      `Confidence ${(recommendation.confidence * 100).toFixed(1)}% below threshold ${(config.promoteAtConfidence * 100).toFixed(0)}%`
    );
    riskLevel = elevateRisk(riskLevel, "medium");
  }

  // ── Check 7: Revenue impact threshold ──
  const estimatedImpact = estimateRevenueImpact(recommendation, variants);
  if (estimatedImpact > config.requireApprovalAbove) {
    warnings.push(
      `Estimated impact $${(estimatedImpact / 100).toFixed(2)} exceeds approval threshold $${(config.requireApprovalAbove / 100).toFixed(2)}`
    );
    riskLevel = elevateRisk(riskLevel, "high");
  }

  // ── Check 8: Prevent killing last challenger ──
  if (recommendation.action === "kill_loser") {
    const activeNonControl = variants.filter((v) => v.active && !v.isControl);
    if (activeNonControl.length <= 1) {
      blockedReasons.push("Cannot kill the last active challenger — experiment would have no comparison");
      riskLevel = elevateRisk(riskLevel, "medium");
    }
  }

  // ── Check 9: End date guard ──
  if (experiment.endDate) {
    const endDate = new Date(experiment.endDate);
    if (Date.now() > endDate.getTime()) {
      warnings.push("Experiment has passed its end date — consider resolving manually");
    }
  }

  // ── Check 10: Rebalance sanity check ──
  if (recommendation.action === "rebalance_traffic" && recommendation.suggestedAllocation) {
    const allocValues = Object.values(recommendation.suggestedAllocation);
    const sum = allocValues.reduce((s, v) => s + v, 0);
    if (Math.abs(sum - 100) > 1) {
      blockedReasons.push(`Traffic allocation sums to ${sum}% (must be 100%)`);
      riskLevel = elevateRisk(riskLevel, "high");
    }

    // Ensure no variant gets less than 5% (exploitation guard)
    const tooLow = allocValues.filter((v) => v < 5 && v > 0);
    if (tooLow.length > 0) {
      warnings.push("Allocation gives variant(s) < 5% traffic — may starve data collection");
    }
  }

  const requiresApproval = riskLevel === "high" || riskLevel === "critical" || estimatedImpact > config.requireApprovalAbove;

  return {
    allowed: blockedReasons.length === 0,
    blockedReasons,
    warnings,
    riskLevel,
    requiresApproval,
  };
}

// ─── RBAC Permission Guards ─────────────────────────────────────────────────

export type ExperimentPermission = "experiments:read" | "experiments:write" | "experiments:admin";

export interface PermissionCheck {
  allowed: boolean;
  reason?: string;
}

/**
 * Check if a user action is permitted based on their permission level.
 */
export function checkExperimentPermission(
  userPermissions: ExperimentPermission[],
  action: ExperimentAction
): PermissionCheck {
  const required = ACTION_PERMISSIONS[action];
  if (!required) return { allowed: false, reason: `Unknown action: ${action}` };

  const hasPermission = userPermissions.some((p) => required.includes(p));
  if (!hasPermission) {
    return {
      allowed: false,
      reason: `Action "${action}" requires one of: ${required.join(", ")}`,
    };
  }

  return { allowed: true };
}

type ExperimentAction =
  | "view_experiments"
  | "view_results"
  | "create_experiment"
  | "edit_experiment"
  | "start_experiment"
  | "pause_experiment"
  | "delete_experiment"
  | "promote_winner"
  | "kill_variant"
  | "rollback"
  | "configure_autonomous"
  | "acknowledge_anomaly"
  | "export_data";

const ACTION_PERMISSIONS: Record<ExperimentAction, ExperimentPermission[]> = {
  view_experiments: ["experiments:read", "experiments:write", "experiments:admin"],
  view_results: ["experiments:read", "experiments:write", "experiments:admin"],
  create_experiment: ["experiments:write", "experiments:admin"],
  edit_experiment: ["experiments:write", "experiments:admin"],
  start_experiment: ["experiments:write", "experiments:admin"],
  pause_experiment: ["experiments:write", "experiments:admin"],
  delete_experiment: ["experiments:admin"],
  promote_winner: ["experiments:admin"],
  kill_variant: ["experiments:admin"],
  rollback: ["experiments:admin"],
  configure_autonomous: ["experiments:admin"],
  acknowledge_anomaly: ["experiments:write", "experiments:admin"],
  export_data: ["experiments:read", "experiments:write", "experiments:admin"],
};

// ─── Rate Limiting ──────────────────────────────────────────────────────────

export interface RateLimitConfig {
  maxActionsPerHour: number;
  maxPromotionsPerDay: number;
  maxRebalancesPerDay: number;
  cooldownAfterPromotionMinutes: number;
}

export const DEFAULT_RATE_LIMITS: RateLimitConfig = {
  maxActionsPerHour: 10,
  maxPromotionsPerDay: 3,
  maxRebalancesPerDay: 12,
  cooldownAfterPromotionMinutes: 60,
};

/**
 * Check if an auto-action would exceed rate limits.
 */
export function checkRateLimit(
  recentActions: Array<{ action: string; timestamp: string }>,
  proposedAction: string,
  limits: RateLimitConfig = DEFAULT_RATE_LIMITS
): { allowed: boolean; reason?: string } {
  const now = Date.now();
  const oneHourAgo = now - 3_600_000;
  const oneDayAgo = now - 86_400_000;

  // Total actions per hour
  const actionsLastHour = recentActions.filter(
    (a) => new Date(a.timestamp).getTime() > oneHourAgo
  ).length;
  if (actionsLastHour >= limits.maxActionsPerHour) {
    return { allowed: false, reason: `Rate limit: ${limits.maxActionsPerHour} actions/hour exceeded` };
  }

  // Promotions per day
  if (proposedAction === "winner_promoted") {
    const promotionsToday = recentActions.filter(
      (a) => a.action === "winner_promoted" && new Date(a.timestamp).getTime() > oneDayAgo
    ).length;
    if (promotionsToday >= limits.maxPromotionsPerDay) {
      return { allowed: false, reason: `Rate limit: ${limits.maxPromotionsPerDay} promotions/day exceeded` };
    }

    // Cooldown after last promotion
    const lastPromotion = recentActions
      .filter((a) => a.action === "winner_promoted")
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];

    if (lastPromotion) {
      const minutesSince = (now - new Date(lastPromotion.timestamp).getTime()) / 60_000;
      if (minutesSince < limits.cooldownAfterPromotionMinutes) {
        return {
          allowed: false,
          reason: `Cooldown: ${Math.ceil(limits.cooldownAfterPromotionMinutes - minutesSince)}min remaining after last promotion`,
        };
      }
    }
  }

  // Rebalances per day
  if (proposedAction === "traffic_rebalanced") {
    const rebalancesToday = recentActions.filter(
      (a) => a.action === "traffic_rebalanced" && new Date(a.timestamp).getTime() > oneDayAgo
    ).length;
    if (rebalancesToday >= limits.maxRebalancesPerDay) {
      return { allowed: false, reason: `Rate limit: ${limits.maxRebalancesPerDay} rebalances/day exceeded` };
    }
  }

  return { allowed: true };
}

// ─── Rollback Protection ────────────────────────────────────────────────────

export interface RollbackWindow {
  experimentId: string;
  promotedVariantId: string;
  promotedAt: string;
  canRollbackUntil: string;
  metricsAtPromotion: {
    conversionRate: number;
    revenuePerImpression: number;
    impressions: number;
  };
}

/**
 * Determine if post-promotion metrics indicate a regression.
 * Returns true if performance dropped below the threshold (suggesting the winner wasn't actually better).
 */
export function shouldAutoRollback(
  rollbackWindow: RollbackWindow,
  currentMetrics: { conversionRate: number; revenuePerImpression: number; impressions: number },
  dropThreshold: number = 0.2 // 20% drop triggers rollback
): { shouldRollback: boolean; reason?: string } {
  const now = new Date();
  const canRollbackUntil = new Date(rollbackWindow.canRollbackUntil);

  // Past the rollback window
  if (now > canRollbackUntil) {
    return { shouldRollback: false, reason: "Rollback window expired" };
  }

  // Need minimum impressions before judging
  if (currentMetrics.impressions < 100) {
    return { shouldRollback: false, reason: "Insufficient post-promotion data" };
  }

  // Check conversion rate drop
  const crDrop =
    (rollbackWindow.metricsAtPromotion.conversionRate - currentMetrics.conversionRate) /
    rollbackWindow.metricsAtPromotion.conversionRate;

  if (crDrop > dropThreshold) {
    return {
      shouldRollback: true,
      reason: `Conversion rate dropped ${(crDrop * 100).toFixed(1)}% post-promotion (threshold: ${(dropThreshold * 100).toFixed(0)}%)`,
    };
  }

  // Check revenue per impression drop
  const rpiDrop =
    (rollbackWindow.metricsAtPromotion.revenuePerImpression - currentMetrics.revenuePerImpression) /
    (rollbackWindow.metricsAtPromotion.revenuePerImpression || 1);

  if (rpiDrop > dropThreshold) {
    return {
      shouldRollback: true,
      reason: `Revenue/impression dropped ${(rpiDrop * 100).toFixed(1)}% post-promotion`,
    };
  }

  return { shouldRollback: false };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function elevateRisk(
  current: SafetyGateResult["riskLevel"],
  proposed: SafetyGateResult["riskLevel"]
): SafetyGateResult["riskLevel"] {
  const levels = { low: 0, medium: 1, high: 2, critical: 3 };
  return levels[proposed] > levels[current] ? proposed : current;
}

function estimateRevenueImpact(rec: DecisionRecommendation, variants: GrowthVariant[]): number {
  const totalRevenue = variants.reduce((s, v) => s + v.revenueCents, 0);

  switch (rec.action) {
    case "promote_winner":
      return Math.round(totalRevenue * 0.3);
    case "kill_loser": {
      const loser = variants.find((v) => v.id === rec.targetVariantId);
      return loser?.revenueCents ?? 0;
    }
    default:
      return 0;
  }
}
