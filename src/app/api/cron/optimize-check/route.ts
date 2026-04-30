export const runtime = 'edge';

/**
 * Growth Optimization Cron — /api/cron/optimize-check
 *
 * Runs nightly (or on-demand) to evaluate all active experiments.
 * For each experiment:
 *   1. Run statistical tests
 *   2. Generate recommendations
 *   3. Execute auto-actions if enabled (promote, kill, rebalance)
 *   4. Log all actions to audit trail
 *   5. Generate insights from resolved experiments
 *
 * Protected by CRON_SECRET header.
 */

import { NextResponse } from "next/server";
import { getBindings } from "@/lib/cloudflare/bindings";
import { evaluateExperiment } from "@/lib/growth-engine/decision-engine";
import type { GrowthExperiment, GrowthVariant, AuditAction } from "@/lib/growth-engine/types";

export async function POST(request: Request): Promise<NextResponse> {
  const authHeader = request.headers.get("authorization");
  const env = getBindings();
  const cronSecret = (env as unknown as Record<string, string>)["CRON_SECRET"];

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const db = env.DB;
    let experimentsEvaluated = 0;
    let actionsExecuted = 0;
    let anomaliesDetected = 0;
    let winnersPromoted = 0;
    let losersKilled = 0;

    // Fetch all active experiments
    const experiments = await db
      .prepare(
        `SELECT * FROM growth_experiments WHERE status = 'active'`
      )
      .all<Record<string, unknown>>();

    for (const row of experiments.results ?? []) {
      const experiment = mapExperimentRow(row);

      // Fetch variants for this experiment
      const variantRows = await db
        .prepare(
          `SELECT * FROM growth_variants WHERE experiment_id = ? AND active = 1`
        )
        .bind(experiment.id)
        .all<Record<string, unknown>>();

      const variants = (variantRows.results ?? []).map(mapVariantRow);

      // Evaluate
      const result = evaluateExperiment(experiment, variants);
      experimentsEvaluated++;

      // Log anomalies
      for (const anomaly of result.anomalies) {
        anomaliesDetected++;
        await writeAudit(db, experiment.workspaceId, experiment.id, "anomaly_detected", "system", {
          type: anomaly.type,
          severity: anomaly.severity,
          description: anomaly.description,
        });
      }

      // Store test results
      if (result.testResult) {
        await db
          .prepare(
            `INSERT OR REPLACE INTO growth_results
             (id, experiment_id, winning_variant_id, confidence_score, lift_percent,
              estimated_revenue_gain_cents, test_method, sample_size_control, sample_size_variant,
              p_value, effect_size, power, auto_resolved, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, datetime('now'), datetime('now'))`
          )
          .bind(
            `result_${experiment.id}_${Date.now()}`,
            experiment.id,
            result.testResult.conversionRateB > result.testResult.conversionRateA
              ? variants.find((v) => !v.isControl)?.id ?? null
              : null,
            result.testResult.isSignificant ? result.testResult.confidenceLevel : 0,
            result.testResult.liftPercent,
            0, // estimated revenue gain computed separately
            result.testResult.method,
            result.testResult.sampleSizeA,
            result.testResult.sampleSizeB,
            result.testResult.pValue,
            result.testResult.effectSize,
            result.testResult.power
          )
          .run();
      }

      // Execute auto-actions
      for (const rec of result.recommendations) {
        if (rec.action === "promote_winner" && experiment.autoPromoteWinner && rec.targetVariantId) {
          // Promote winner: set experiment to 'won', deactivate other variants
          await db.prepare(`UPDATE growth_experiments SET status = 'won', updated_at = datetime('now') WHERE id = ?`)
            .bind(experiment.id).run();

          await db.prepare(`UPDATE growth_variants SET active = 0 WHERE experiment_id = ? AND id != ?`)
            .bind(experiment.id, rec.targetVariantId).run();

          await db.prepare(`UPDATE growth_variants SET allocation_percent = 100 WHERE id = ?`)
            .bind(rec.targetVariantId).run();

          // Update result as auto-resolved
          await db.prepare(
            `UPDATE growth_results SET auto_resolved = 1, winning_variant_id = ?, resolved_at = datetime('now')
             WHERE experiment_id = ? ORDER BY created_at DESC LIMIT 1`
          ).bind(rec.targetVariantId, experiment.id).run();

          await writeAudit(db, experiment.workspaceId, experiment.id, "winner_promoted", "system", {
            variantId: rec.targetVariantId,
            confidence: rec.confidence,
            reasoning: rec.reasoning,
          });

          winnersPromoted++;
          actionsExecuted++;
        }

        if (rec.action === "kill_loser" && experiment.autoKillLosers && rec.targetVariantId) {
          await db.prepare(`UPDATE growth_variants SET active = 0 WHERE id = ?`)
            .bind(rec.targetVariantId).run();

          await writeAudit(db, experiment.workspaceId, experiment.id, "loser_killed", "system", {
            variantId: rec.targetVariantId,
            reasoning: rec.reasoning,
          });

          losersKilled++;
          actionsExecuted++;
        }

        if (rec.action === "rebalance_traffic" && rec.suggestedAllocation) {
          for (const [variantId, allocation] of Object.entries(rec.suggestedAllocation)) {
            await db.prepare(`UPDATE growth_variants SET allocation_percent = ? WHERE id = ?`)
              .bind(allocation, variantId).run();
          }

          await writeAudit(db, experiment.workspaceId, experiment.id, "traffic_rebalanced", "system", {
            allocation: rec.suggestedAllocation,
            reasoning: rec.reasoning,
          });

          actionsExecuted++;
        }
      }

      // Check budget cap
      if (experiment.budgetCapCents != null) {
        const totalSpend = variants.reduce((s, v) => s + v.revenueCents, 0);
        if (totalSpend > experiment.budgetCapCents) {
          await db.prepare(`UPDATE growth_experiments SET status = 'paused', updated_at = datetime('now') WHERE id = ?`)
            .bind(experiment.id).run();

          await writeAudit(db, experiment.workspaceId, experiment.id, "budget_exceeded", "system", {
            spent: totalSpend,
            cap: experiment.budgetCapCents,
          });
          actionsExecuted++;
        }
      }
    }

    // Cleanup: archive experiments ended > 30 days ago
    await db.prepare(
      `UPDATE growth_experiments SET status = 'archived', updated_at = datetime('now')
       WHERE status = 'won' AND updated_at < datetime('now', '-30 days')`
    ).run();

    return NextResponse.json({
      success: true,
      experimentsEvaluated,
      actionsExecuted,
      winnersPromoted,
      losersKilled,
      anomaliesDetected,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Growth optimize-check cron error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function writeAudit(
  db: D1Database,
  workspaceId: string,
  experimentId: string,
  action: AuditAction,
  actor: string,
  details: Record<string, unknown>
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO growth_audit_log (id, workspace_id, experiment_id, action, actor, details_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`
    )
    .bind(
      `audit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      workspaceId,
      experimentId,
      action,
      actor,
      JSON.stringify(details)
    )
    .run();
}

function mapExperimentRow(row: Record<string, unknown>): GrowthExperiment {
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

function mapVariantRow(row: Record<string, unknown>): GrowthVariant {
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
