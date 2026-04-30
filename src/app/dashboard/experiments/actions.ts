"use server";

import { getDb } from "@/lib/cloudflare/bindings";
import type {
  GrowthExperiment,
  GrowthVariant,
  GrowthResult,
  GrowthInsight,
  GrowthAuditEntry,
  ExperimentSummary,
  RevenueImpact,
  WeeklyWin,
  VariantPerformance,
} from "@/lib/growth-engine/types";
import { createExperimentSchema, type CreateExperimentInput } from "@/lib/growth-engine/validation";

// ─── Dashboard Data ──────────────────────────────────────────────────────────

export interface ExperimentsDashboardData {
  activeExperiments: ExperimentSummary[];
  revenueImpact: RevenueImpact;
  weeklyWins: WeeklyWin[];
  recentInsights: GrowthInsight[];
  stats: {
    total: number;
    active: number;
    won: number;
    avgLift: number;
    totalRevenueGainCents: number;
  };
}

export async function getExperimentsDashboard(
  workspaceId: string
): Promise<ExperimentsDashboardData> {
  const db = getDb();

  // Active experiments with variants
  const activeRows = await db
    .prepare(`SELECT * FROM growth_experiments WHERE workspace_id = ? AND status = 'active' ORDER BY created_at DESC`)
    .bind(workspaceId)
    .all<Record<string, unknown>>();

  const activeExperiments: ExperimentSummary[] = [];

  for (const row of activeRows.results ?? []) {
    const exp = mapExperiment(row);
    const variantRows = await db
      .prepare(`SELECT * FROM growth_variants WHERE experiment_id = ?`)
      .bind(exp.id)
      .all<Record<string, unknown>>();

    const variants = (variantRows.results ?? []).map(mapVariant);
    activeExperiments.push(buildSummary(exp, variants));
  }

  // Revenue impact (from won experiments)
  const wonRows = await db
    .prepare(
      `SELECT gr.lift_percent, gr.estimated_revenue_gain_cents
       FROM growth_results gr
       JOIN growth_experiments ge ON ge.id = gr.experiment_id
       WHERE ge.workspace_id = ? AND ge.status = 'won' AND gr.winning_variant_id IS NOT NULL`
    )
    .bind(workspaceId)
    .all<Record<string, unknown>>();

  const totalGain = (wonRows.results ?? []).reduce(
    (s, r) => s + Number(r["estimated_revenue_gain_cents"] ?? 0), 0
  );
  const avgLift = (wonRows.results ?? []).length > 0
    ? (wonRows.results ?? []).reduce((s, r) => s + Number(r["lift_percent"] ?? 0), 0) / (wonRows.results ?? []).length
    : 0;

  // Weekly wins (last 7 days)
  const winsRows = await db
    .prepare(
      `SELECT ge.id, ge.name, ge.module_source, gv.label, gr.lift_percent, gr.estimated_revenue_gain_cents, gr.resolved_at
       FROM growth_results gr
       JOIN growth_experiments ge ON ge.id = gr.experiment_id
       JOIN growth_variants gv ON gv.id = gr.winning_variant_id
       WHERE ge.workspace_id = ? AND gr.resolved_at > datetime('now', '-7 days')
       ORDER BY gr.resolved_at DESC
       LIMIT 10`
    )
    .bind(workspaceId)
    .all<Record<string, unknown>>();

  const weeklyWins: WeeklyWin[] = (winsRows.results ?? []).map((r) => ({
    experimentId: r["id"] as string,
    experimentName: r["name"] as string,
    moduleSource: r["module_source"] as WeeklyWin["moduleSource"],
    winningLabel: r["label"] as string,
    liftPercent: Number(r["lift_percent"]),
    revenueGainCents: Number(r["estimated_revenue_gain_cents"]),
    resolvedAt: r["resolved_at"] as string,
  }));

  // Recent insights
  const insightRows = await db
    .prepare(
      `SELECT * FROM growth_insights WHERE workspace_id = ? ORDER BY confidence_score DESC LIMIT 10`
    )
    .bind(workspaceId)
    .all<Record<string, unknown>>();

  const recentInsights: GrowthInsight[] = (insightRows.results ?? []).map(mapInsight);

  // Stats
  const statsRow = await db
    .prepare(
      `SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active,
        SUM(CASE WHEN status = 'won' THEN 1 ELSE 0 END) as won
       FROM growth_experiments WHERE workspace_id = ?`
    )
    .bind(workspaceId)
    .first<Record<string, unknown>>();

  return {
    activeExperiments,
    revenueImpact: {
      totalRevenueGainCents: totalGain,
      totalSpendSavedCents: Math.round(totalGain * 0.3), // Estimated
      totalConversionLift: avgLift,
      experimentsWon: Number(statsRow?.["won"] ?? 0),
      experimentsActive: Number(statsRow?.["active"] ?? 0),
      avgLiftPercent: avgLift,
    },
    weeklyWins,
    recentInsights,
    stats: {
      total: Number(statsRow?.["total"] ?? 0),
      active: Number(statsRow?.["active"] ?? 0),
      won: Number(statsRow?.["won"] ?? 0),
      avgLift,
      totalRevenueGainCents: totalGain,
    },
  };
}

// ─── Experiment CRUD ─────────────────────────────────────────────────────────

export async function createExperiment(
  workspaceId: string,
  userId: string,
  input: CreateExperimentInput
): Promise<{ id: string; success: boolean; error?: string }> {
  const parsed = createExperimentSchema.safeParse(input);
  if (!parsed.success) {
    return { id: "", success: false, error: parsed.error.errors[0]?.message };
  }

  const db = getDb();
  const id = `exp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  await db
    .prepare(
      `INSERT INTO growth_experiments
       (id, workspace_id, name, module_source, campaign_id, experiment_type, status,
        objective_metric, confidence_threshold, auto_promote_winner, auto_kill_losers,
        traffic_strategy, min_sample_size, budget_cap_cents, start_date, end_date, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
    )
    .bind(
      id, workspaceId, parsed.data.name, parsed.data.moduleSource,
      parsed.data.campaignId ?? null, parsed.data.experimentType,
      parsed.data.objectiveMetric, parsed.data.confidenceThreshold,
      parsed.data.autoPromoteWinner ? 1 : 0, parsed.data.autoKillLosers ? 1 : 0,
      parsed.data.trafficStrategy, parsed.data.minSampleSize,
      parsed.data.budgetCapCents ?? null, parsed.data.startDate ?? null,
      parsed.data.endDate ?? null, userId
    )
    .run();

  // Create variants
  for (const variant of parsed.data.variants) {
    const variantId = `var_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    await db
      .prepare(
        `INSERT INTO growth_variants
         (id, experiment_id, label, allocation_percent, content_json, is_control, ai_generated, active, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1, datetime('now'))`
      )
      .bind(
        variantId, id, variant.label, variant.allocationPercent,
        JSON.stringify(variant.contentJson), variant.isControl ? 1 : 0,
        variant.aiGenerated ? 1 : 0
      )
      .run();
  }

  // Audit log
  await db
    .prepare(
      `INSERT INTO growth_audit_log (id, workspace_id, experiment_id, action, actor, details_json, created_at)
       VALUES (?, ?, ?, 'created', ?, '{}', datetime('now'))`
    )
    .bind(`audit_${Date.now()}`, workspaceId, id, userId)
    .run();

  return { id, success: true };
}

export async function startExperiment(
  workspaceId: string,
  experimentId: string,
  userId: string
): Promise<{ success: boolean }> {
  const db = getDb();

  const result = await db
    .prepare(
      `UPDATE growth_experiments SET status = 'active', start_date = datetime('now'), updated_at = datetime('now')
       WHERE id = ? AND workspace_id = ? AND status = 'draft'`
    )
    .bind(experimentId, workspaceId)
    .run();

  if ((result.meta?.changes ?? 0) > 0) {
    await db
      .prepare(
        `INSERT INTO growth_audit_log (id, workspace_id, experiment_id, action, actor, created_at)
         VALUES (?, ?, ?, 'started', ?, datetime('now'))`
      )
      .bind(`audit_${Date.now()}`, workspaceId, experimentId, userId)
      .run();
    return { success: true };
  }

  return { success: false };
}

export async function pauseExperiment(
  workspaceId: string,
  experimentId: string,
  userId: string
): Promise<{ success: boolean }> {
  const db = getDb();

  const result = await db
    .prepare(
      `UPDATE growth_experiments SET status = 'paused', updated_at = datetime('now')
       WHERE id = ? AND workspace_id = ? AND status = 'active'`
    )
    .bind(experimentId, workspaceId)
    .run();

  if ((result.meta?.changes ?? 0) > 0) {
    await db
      .prepare(
        `INSERT INTO growth_audit_log (id, workspace_id, experiment_id, action, actor, created_at)
         VALUES (?, ?, ?, 'paused', ?, datetime('now'))`
      )
      .bind(`audit_${Date.now()}`, workspaceId, experimentId, userId)
      .run();
    return { success: true };
  }

  return { success: false };
}

export async function rollbackWinner(
  workspaceId: string,
  experimentId: string,
  userId: string
): Promise<{ success: boolean }> {
  const db = getDb();

  // Re-activate experiment and all variants
  await db.prepare(`UPDATE growth_experiments SET status = 'active', updated_at = datetime('now') WHERE id = ? AND workspace_id = ?`)
    .bind(experimentId, workspaceId).run();
  await db.prepare(`UPDATE growth_variants SET active = 1 WHERE experiment_id = ?`)
    .bind(experimentId).run();

  await db
    .prepare(
      `INSERT INTO growth_audit_log (id, workspace_id, experiment_id, action, actor, details_json, created_at)
       VALUES (?, ?, ?, 'rollback', ?, '{"reason":"manual rollback"}', datetime('now'))`
    )
    .bind(`audit_${Date.now()}`, workspaceId, experimentId, userId)
    .run();

  return { success: true };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildSummary(exp: GrowthExperiment, variants: GrowthVariant[]): ExperimentSummary {
  const totalImpressions = variants.reduce((s, v) => s + v.impressions, 0);
  const totalConversions = variants.reduce((s, v) => s + v.conversions, 0);
  const totalRevenue = variants.reduce((s, v) => s + v.revenueCents, 0);

  const performances: VariantPerformance[] = variants.map((v) => {
    const rate = v.impressions > 0 ? v.conversions / v.impressions : 0;
    return {
      variantId: v.id,
      label: v.label,
      isControl: v.isControl,
      impressions: v.impressions,
      conversions: v.conversions,
      conversionRate: rate,
      revenueCents: v.revenueCents,
      revenuePerImpression: v.impressions > 0 ? v.revenueCents / v.impressions : 0,
      allocationPercent: v.allocationPercent,
      isLeading: false,
    };
  });

  // Mark leader
  const leader = performances.reduce((a, b) => b.conversionRate > a.conversionRate ? b : a, performances[0]!);
  const leaderIdx = performances.findIndex((p) => p.variantId === leader.variantId);
  if (leaderIdx >= 0) performances[leaderIdx]!.isLeading = true;

  const control = performances.find((p) => p.isControl);
  const liftPercent = control && control.conversionRate > 0
    ? ((leader.conversionRate - control.conversionRate) / control.conversionRate) * 100
    : 0;

  const startDate = exp.startDate ? new Date(exp.startDate) : new Date(exp.createdAt);
  const daysRunning = Math.max(1, Math.floor((Date.now() - startDate.getTime()) / 86_400_000));

  return {
    experiment: exp,
    variants: performances,
    totalImpressions,
    totalConversions,
    totalRevenueCents: totalRevenue,
    overallConversionRate: totalImpressions > 0 ? totalConversions / totalImpressions : 0,
    leadingVariant: leader,
    confidenceScore: 0, // Computed by stats engine
    liftPercent,
    isSignificant: false,
    daysRunning,
    estimatedDaysToSignificance: null,
  };
}

function mapExperiment(row: Record<string, unknown>): GrowthExperiment {
  return {
    id: row["id"] as string,
    workspaceId: row["workspace_id"] as string,
    name: row["name"] as string,
    moduleSource: row["module_source"] as GrowthExperiment["moduleSource"],
    campaignId: row["campaign_id"] as string | null,
    experimentType: row["experiment_type"] as GrowthExperiment["experimentType"],
    status: row["status"] as GrowthExperiment["status"],
    objectiveMetric: row["objective_metric"] as GrowthExperiment["objectiveMetric"],
    confidenceThreshold: Number(row["confidence_threshold"]),
    autoPromoteWinner: Boolean(row["auto_promote_winner"]),
    autoKillLosers: Boolean(row["auto_kill_losers"]),
    trafficStrategy: row["traffic_strategy"] as GrowthExperiment["trafficStrategy"],
    minSampleSize: Number(row["min_sample_size"]),
    budgetCapCents: row["budget_cap_cents"] != null ? Number(row["budget_cap_cents"]) : null,
    startDate: row["start_date"] as string | null,
    endDate: row["end_date"] as string | null,
    createdBy: row["created_by"] as string,
    createdAt: row["created_at"] as string,
    updatedAt: row["updated_at"] as string,
  };
}

function mapVariant(row: Record<string, unknown>): GrowthVariant {
  return {
    id: row["id"] as string,
    experimentId: row["experiment_id"] as string,
    label: row["label"] as string,
    allocationPercent: Number(row["allocation_percent"]),
    contentJson: JSON.parse((row["content_json"] as string) || "{}") as Record<string, unknown>,
    isControl: Boolean(row["is_control"]),
    aiGenerated: Boolean(row["ai_generated"]),
    active: Boolean(row["active"]),
    impressions: Number(row["impressions"]),
    conversions: Number(row["conversions"]),
    revenueCents: Number(row["revenue_cents"]),
    createdAt: row["created_at"] as string,
  };
}

function mapInsight(row: Record<string, unknown>): GrowthInsight {
  return {
    id: row["id"] as string,
    workspaceId: row["workspace_id"] as string,
    category: row["category"] as GrowthInsight["category"],
    finding: row["finding"] as string,
    confidenceScore: Number(row["confidence_score"]),
    liftPercent: row["lift_percent"] != null ? Number(row["lift_percent"]) : null,
    sampleSize: row["sample_size"] != null ? Number(row["sample_size"]) : null,
    sourceExperimentIds: JSON.parse((row["source_experiment_ids"] as string) || "[]") as string[],
    moduleSource: row["module_source"] as GrowthInsight["moduleSource"],
    applicableIndustries: JSON.parse((row["applicable_industries"] as string) || "[]") as string[],
    timesValidated: Number(row["times_validated"]),
    lastValidatedAt: row["last_validated_at"] as string | null,
    createdAt: row["created_at"] as string,
    updatedAt: row["updated_at"] as string,
  };
}
