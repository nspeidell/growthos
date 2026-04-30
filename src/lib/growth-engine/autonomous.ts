/**
 * Growth Optimization Engine — Autonomous Mode
 *
 * Self-driving optimization that:
 * - Continuously evaluates experiments without human intervention
 * - Promotes winners, kills losers, rebalances traffic
 * - Respects safety guardrails and budget caps
 * - Escalates high-impact decisions for human approval
 * - Generates new experiments from insight memory
 *
 * Designed for "set it and forget it" growth teams.
 */

import { evaluateExperiment } from "./decision-engine";
import { generateInsightDrivenVariants } from "./ai-generator";
import type {
  GrowthExperiment,
  GrowthVariant,
  GrowthInsight,
  AutoOptimizeConfig,
  AutoAction,
  DecisionRecommendation,
  AnomalyAlert,
  ModuleSource,
} from "./types";

// ─── Default Configuration ──────────────────────────────────────────────────

export const DEFAULT_AUTO_CONFIG: AutoOptimizeConfig = {
  enabled: false,
  promoteAtConfidence: 0.95,
  killBelowRate: 0.5, // Kill variants performing < 50% of leader
  rebalanceInterval: "daily",
  maxBudgetCents: 500_00, // $500 default cap
  notifyOnAction: true,
  requireApprovalAbove: 1000_00, // Require human approval for >$1000 impact
};

// ─── Autonomous Decision Pipeline ──────────────────────────────────────────

export interface AutonomousResult {
  actions: AutoAction[];
  escalations: Escalation[];
  anomalies: AnomalyAlert[];
  suggestions: ExperimentSuggestion[];
  totalImpactCents: number;
}

export interface Escalation {
  experimentId: string;
  reason: string;
  estimatedImpactCents: number;
  recommendedAction: string;
  deadline: string; // ISO timestamp — auto-executes after this
}

export interface ExperimentSuggestion {
  name: string;
  moduleSource: string;
  basedOnInsight: string;
  expectedLift: number;
  priority: number;
}

/**
 * Run the autonomous optimization pipeline for a workspace.
 *
 * This is the "brain" that runs on each cron cycle when autonomous mode is enabled.
 * It evaluates all active experiments, generates actions, escalates when needed,
 * and suggests new experiments.
 */
export function runAutonomousPipeline(
  config: AutoOptimizeConfig,
  experiments: Array<{ experiment: GrowthExperiment; variants: GrowthVariant[] }>,
  insights: GrowthInsight[]
): AutonomousResult {
  const actions: AutoAction[] = [];
  const escalations: Escalation[] = [];
  const allAnomalies: AnomalyAlert[] = [];
  let totalImpactCents = 0;

  for (const { experiment, variants } of experiments) {
    // Skip if experiment is not active
    if (experiment.status !== "active") continue;

    // Evaluate
    const result = evaluateExperiment(experiment, variants);
    allAnomalies.push(...result.anomalies);

    // Process recommendations
    for (const rec of result.recommendations) {
      const impactCents = estimateImpact(rec, variants);
      totalImpactCents += impactCents;

      // Check if this needs human approval
      if (impactCents > config.requireApprovalAbove) {
        escalations.push({
          experimentId: experiment.id,
          reason: rec.reasoning,
          estimatedImpactCents: impactCents,
          recommendedAction: rec.action,
          deadline: getEscalationDeadline(),
        });
        continue;
      }

      // Auto-execute if confidence meets threshold
      if (shouldAutoExecute(rec, config)) {
        actions.push({
          experimentId: experiment.id,
          action: mapRecommendationToAudit(rec.action),
          reason: rec.reasoning,
          timestamp: new Date().toISOString(),
          reverted: false,
        });
      }
    }

    // Budget guard — pause if approaching cap
    const totalSpend = variants.reduce((s, v) => s + v.revenueCents, 0);
    if (totalSpend > config.maxBudgetCents * 0.9) {
      escalations.push({
        experimentId: experiment.id,
        reason: `Budget at ${((totalSpend / config.maxBudgetCents) * 100).toFixed(0)}% of cap`,
        estimatedImpactCents: config.maxBudgetCents - totalSpend,
        recommendedAction: "pause_experiment",
        deadline: getEscalationDeadline(),
      });
    }
  }

  // Generate suggestions from insights
  const suggestions = generateSuggestions(insights, experiments);

  return {
    actions,
    escalations,
    anomalies: allAnomalies,
    suggestions,
    totalImpactCents,
  };
}

// ─── Decision Helpers ───────────────────────────────────────────────────────

function shouldAutoExecute(rec: DecisionRecommendation, config: AutoOptimizeConfig): boolean {
  if (!config.enabled) return false;

  switch (rec.action) {
    case "promote_winner":
      return rec.confidence >= config.promoteAtConfidence;
    case "kill_loser":
      return rec.confidence >= config.promoteAtConfidence * 0.9; // Slightly lower threshold
    case "rebalance_traffic":
      return true; // Always auto-rebalance in autonomous mode
    case "flag_anomaly":
      return false; // Never auto-resolve anomalies
    case "increase_sample":
      return false; // Informational only
    case "continue":
      return false;
    default:
      return false;
  }
}

function estimateImpact(rec: DecisionRecommendation, variants: GrowthVariant[]): number {
  const totalRevenue = variants.reduce((s, v) => s + v.revenueCents, 0);

  switch (rec.action) {
    case "promote_winner":
      // Impact = estimated future revenue at winner's rate
      return Math.round(totalRevenue * 0.3); // Conservative 30% estimate
    case "kill_loser":
      // Impact = the loser's current revenue at risk
      const loser = variants.find((v) => v.id === rec.targetVariantId);
      return loser?.revenueCents ?? 0;
    case "rebalance_traffic":
      // Low impact — just allocation shift
      return Math.round(totalRevenue * 0.05);
    default:
      return 0;
  }
}

function mapRecommendationToAudit(action: string): AutoAction["action"] {
  const map: Record<string, string> = {
    promote_winner: "winner_promoted",
    kill_loser: "loser_killed",
    rebalance_traffic: "traffic_rebalanced",
    flag_anomaly: "anomaly_detected",
    pause_experiment: "paused",
  };
  return (map[action] ?? action) as AutoAction["action"];
}

function getEscalationDeadline(): string {
  // Default: 24 hours to respond, then auto-execute
  const deadline = new Date();
  deadline.setHours(deadline.getHours() + 24);
  return deadline.toISOString();
}

// ─── Suggestion Engine ──────────────────────────────────────────────────────

function generateSuggestions(
  insights: GrowthInsight[],
  experiments: Array<{ experiment: GrowthExperiment; variants: GrowthVariant[] }>
): ExperimentSuggestion[] {
  const suggestions: ExperimentSuggestion[] = [];

  // Get high-confidence insights not yet being tested
  const activeModules = new Set(experiments.map((e) => e.experiment.moduleSource));
  const highConfidence = insights
    .filter((i) => i.confidenceScore > 0.7 && i.liftPercent != null && i.liftPercent > 5 && i.moduleSource != null)
    .sort((a, b) => (b.liftPercent ?? 0) - (a.liftPercent ?? 0))
    .slice(0, 5);

  for (const insight of highConfidence) {
    suggestions.push({
      name: `Test: ${insight.finding.slice(0, 60)}`,
      moduleSource: insight.moduleSource!,
      basedOnInsight: insight.finding,
      expectedLift: (insight.liftPercent ?? 5) * 0.6, // Conservative
      priority: insight.confidenceScore * (insight.liftPercent ?? 5),
    });
  }

  // Suggest experiments in modules with no active tests
  const allModules: ModuleSource[] = ["content", "publisher", "ads", "newsletter", "funnel"];
  for (const mod of allModules) {
    if (!activeModules.has(mod)) {
      suggestions.push({
        name: `Start testing in ${mod} module`,
        moduleSource: mod,
        basedOnInsight: "No active experiments in this module — opportunity for optimization",
        expectedLift: 10,
        priority: 5,
      });
    }
  }

  return suggestions.sort((a, b) => b.priority - a.priority).slice(0, 8);
}

// ─── Velocity Tracking ──────────────────────────────────────────────────────

export interface OptimizationVelocity {
  experimentsPerWeek: number;
  avgDaysToSignificance: number;
  winRate: number;
  cumulativeLift: number;
  learningsPerMonth: number;
}

/**
 * Calculate optimization velocity metrics for workspace health.
 */
export function calculateVelocity(
  experiments: GrowthExperiment[],
  periodDays: number = 30
): OptimizationVelocity {
  const cutoff = new Date(Date.now() - periodDays * 86_400_000).toISOString();
  const recent = experiments.filter((e) => e.createdAt > cutoff);
  const resolved = recent.filter((e) => e.status === "won" || e.status === "archived");
  const won = recent.filter((e) => e.status === "won");

  const weeks = periodDays / 7;

  return {
    experimentsPerWeek: weeks > 0 ? recent.length / weeks : 0,
    avgDaysToSignificance: 0, // Computed from results in production
    winRate: resolved.length > 0 ? won.length / resolved.length : 0,
    cumulativeLift: 0, // Summed from results
    learningsPerMonth: resolved.length * 2, // Each experiment generates ~2 learnings
  };
}
