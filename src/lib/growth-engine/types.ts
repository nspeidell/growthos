/**
 * Growth Optimization Engine — Core Types
 *
 * Comprehensive type system for the autonomous experimentation platform.
 */

// ─── Enums ───────────────────────────────────────────────────────────────────

export type ModuleSource = "content" | "publisher" | "ads" | "newsletter" | "swarm" | "funnel";

export type ExperimentType = "ab" | "multivariate" | "bandit" | "sequential";

export type ExperimentStatus = "draft" | "active" | "paused" | "won" | "archived";

export type ObjectiveMetric =
  | "clicks"
  | "conversions"
  | "revenue"
  | "opens"
  | "replies"
  | "engagement"
  | "ctr"
  | "roas"
  | "cpl"
  | "cac";

export type TrafficStrategy = "equal" | "weighted" | "bandit" | "sequential";

export type EventType =
  | "impression"
  | "click"
  | "lead"
  | "purchase"
  | "open"
  | "reply"
  | "engagement"
  | "bounce";

export type TestMethod = "z_test" | "chi_square" | "bayesian" | "sequential";

export type InsightCategory =
  | "headline"
  | "cta"
  | "subject_line"
  | "send_time"
  | "audience"
  | "creative"
  | "pricing"
  | "channel"
  | "general";

export type AuditAction =
  | "created"
  | "started"
  | "paused"
  | "resumed"
  | "winner_promoted"
  | "loser_killed"
  | "traffic_rebalanced"
  | "rollback"
  | "manual_override"
  | "auto_resolved"
  | "budget_exceeded"
  | "anomaly_detected";

// ─── Core Models ─────────────────────────────────────────────────────────────

export interface GrowthExperiment {
  id: string;
  workspaceId: string;
  name: string;
  moduleSource: ModuleSource;
  campaignId: string | null;
  experimentType: ExperimentType;
  status: ExperimentStatus;
  objectiveMetric: ObjectiveMetric;
  confidenceThreshold: number;
  autoPromoteWinner: boolean;
  autoKillLosers: boolean;
  trafficStrategy: TrafficStrategy;
  minSampleSize: number;
  budgetCapCents: number | null;
  startDate: string | null;
  endDate: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface GrowthVariant {
  id: string;
  experimentId: string;
  label: string;
  allocationPercent: number;
  contentJson: Record<string, unknown>;
  isControl: boolean;
  aiGenerated: boolean;
  active: boolean;
  impressions: number;
  conversions: number;
  revenueCents: number;
  createdAt: string;
}

export interface GrowthEvent {
  id: string;
  experimentId: string;
  variantId: string;
  eventType: EventType;
  revenueValueCents: number;
  userHash: string;
  metadataJson: Record<string, unknown>;
  createdAt: string;
}

export interface GrowthResult {
  id: string;
  experimentId: string;
  winningVariantId: string | null;
  confidenceScore: number;
  liftPercent: number;
  estimatedRevenueGainCents: number;
  testMethod: TestMethod;
  sampleSizeControl: number;
  sampleSizeVariant: number;
  pValue: number | null;
  effectSize: number | null;
  power: number | null;
  autoResolved: boolean;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface GrowthInsight {
  id: string;
  workspaceId: string;
  category: InsightCategory;
  finding: string;
  confidenceScore: number;
  liftPercent: number | null;
  sampleSize: number | null;
  sourceExperimentIds: string[];
  moduleSource: ModuleSource | null;
  applicableIndustries: string[];
  timesValidated: number;
  lastValidatedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface GrowthAuditEntry {
  id: string;
  workspaceId: string;
  experimentId: string | null;
  action: AuditAction;
  actor: string;
  detailsJson: Record<string, unknown>;
  createdAt: string;
}

// ─── Composite / View Models ─────────────────────────────────────────────────

export interface ExperimentWithVariants extends GrowthExperiment {
  variants: GrowthVariant[];
  latestResult: GrowthResult | null;
}

export interface VariantPerformance {
  variantId: string;
  label: string;
  isControl: boolean;
  impressions: number;
  conversions: number;
  conversionRate: number;
  revenueCents: number;
  revenuePerImpression: number;
  allocationPercent: number;
  isLeading: boolean;
}

export interface ExperimentSummary {
  experiment: GrowthExperiment;
  variants: VariantPerformance[];
  totalImpressions: number;
  totalConversions: number;
  totalRevenueCents: number;
  overallConversionRate: number;
  leadingVariant: VariantPerformance | null;
  confidenceScore: number;
  liftPercent: number;
  isSignificant: boolean;
  daysRunning: number;
  estimatedDaysToSignificance: number | null;
}

export interface RevenueImpact {
  totalRevenueGainCents: number;
  totalSpendSavedCents: number;
  totalConversionLift: number;
  experimentsWon: number;
  experimentsActive: number;
  avgLiftPercent: number;
}

export interface WeeklyWin {
  experimentId: string;
  experimentName: string;
  moduleSource: ModuleSource;
  winningLabel: string;
  liftPercent: number;
  revenueGainCents: number;
  resolvedAt: string;
}

// ─── AI Variant Generator Types ──────────────────────────────────────────────

export interface VariantGeneratorInput {
  moduleSource: ModuleSource;
  campaignObjective: string;
  industryType: string;
  tonePreference: string;
  historicalWinners: string[];
  historicalLosers: string[];
  currentContent?: Record<string, unknown>;
}

export interface VariantGeneratorOutput {
  headlines: Array<{ text: string; reasoning: string }>;
  ctas: Array<{ text: string; reasoning: string }>;
  audiences: Array<{ description: string; reasoning: string }>;
  subjectLines: Array<{ text: string; reasoning: string }>;
  funnelRecommendations: Array<{ recommendation: string; expectedImpact: string }>;
}

// ─── Stats Engine Types ──────────────────────────────────────────────────────

export interface StatisticalTest {
  method: TestMethod;
  pValue: number;
  confidenceLevel: number;
  isSignificant: boolean;
  effectSize: number;
  power: number;
  sampleSizeA: number;
  sampleSizeB: number;
  conversionRateA: number;
  conversionRateB: number;
  liftPercent: number;
  confidenceInterval: { lower: number; upper: number };
}

export interface BayesianResult {
  probabilityBBeatsA: number;
  expectedLoss: number;
  credibleInterval: { lower: number; upper: number };
  posteriorA: { alpha: number; beta: number };
  posteriorB: { alpha: number; beta: number };
}

export interface BanditAllocation {
  variantId: string;
  allocation: number;
  expectedReward: number;
  explorationBonus: number;
}

export interface DecisionRecommendation {
  action: "promote_winner" | "kill_loser" | "rebalance_traffic" | "continue" | "increase_sample" | "flag_anomaly";
  confidence: number;
  reasoning: string;
  targetVariantId?: string;
  suggestedAllocation?: Record<string, number>;
}

// ─── Autonomous Mode Types ───────────────────────────────────────────────────

export interface AutoOptimizeConfig {
  enabled: boolean;
  promoteAtConfidence: number;
  killBelowRate: number;
  rebalanceInterval: "hourly" | "daily" | "weekly";
  maxBudgetCents: number;
  notifyOnAction: boolean;
  requireApprovalAbove: number; // revenue threshold requiring human approval
}

export interface AutoAction {
  experimentId: string;
  action: AuditAction;
  reason: string;
  timestamp: string;
  reverted: boolean;
}

// ─── Safety / Enterprise Types ───────────────────────────────────────────────

export interface AnomalyAlert {
  experimentId: string;
  type: "conversion_spike" | "conversion_drop" | "traffic_imbalance" | "revenue_anomaly" | "sample_ratio_mismatch";
  severity: "low" | "medium" | "high" | "critical";
  description: string;
  detectedAt: string;
  acknowledged: boolean;
}

export interface SafetyCheck {
  passed: boolean;
  checks: Array<{
    name: string;
    passed: boolean;
    message: string;
  }>;
}
