"use client";

import { useState } from "react";
import type { ExperimentsDashboardData } from "./actions";
import type {
  ExperimentSummary,
  WeeklyWin,
  GrowthInsight,
  VariantPerformance,
} from "@/lib/growth-engine/types";

// ─── Status Colors ──────────────────────────────────────────────────────────

const STATUS_BADGE: Record<string, { bg: string; text: string; dot: string }> = {
  active: { bg: "bg-emerald-950/60 border-emerald-800", text: "text-emerald-400", dot: "bg-emerald-400 animate-pulse" },
  draft: { bg: "bg-muted border-border", text: "text-muted-foreground", dot: "bg-muted-foreground" },
  paused: { bg: "bg-amber-950/60 border-amber-800", text: "text-amber-400", dot: "bg-amber-400" },
  won: { bg: "bg-blue-950/60 border-blue-800", text: "text-blue-400", dot: "bg-blue-400" },
  lost: { bg: "bg-destructive/10 border-destructive/30", text: "text-destructive", dot: "bg-destructive" },
  archived: { bg: "bg-muted/50 border-border", text: "text-muted-foreground", dot: "bg-muted-foreground" },
};

const MODULE_COLORS: Record<string, string> = {
  content: "text-emerald-400",
  publisher: "text-sky-400",
  ads: "text-purple-400",
  newsletter: "text-orange-400",
  swarm: "text-amber-400",
  funnel: "text-cyan-400",
};

// ─── Formatters ─────────────────────────────────────────────────────────────

function formatCents(cents: number): string {
  if (cents >= 100_000) return `$${(cents / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  return `$${(cents / 100).toFixed(2)}`;
}

function formatPercent(value: number): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

// ─── Component ──────────────────────────────────────────────────────────────

interface ExperimentsDashboardProps {
  data: ExperimentsDashboardData;
  onStartExperiment?: (experimentId: string) => Promise<void>;
  onPauseExperiment?: (experimentId: string) => Promise<void>;
  onRollback?: (experimentId: string) => Promise<void>;
}

export function ExperimentsDashboard({
  data,
  onStartExperiment,
  onPauseExperiment,
  onRollback,
}: ExperimentsDashboardProps) {
  const [activeTab, setActiveTab] = useState<"active" | "wins" | "insights">("active");

  return (
    <div className="space-y-6">
      {/* ─── Revenue Impact Strip ─────────────────────────────────────── */}
      <RevenueImpactStrip data={data} />

      {/* ─── Stats Row ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Total Experiments" value={data.stats.total.toString()} />
        <StatCard label="Active" value={data.stats.active.toString()} accent="emerald" />
        <StatCard label="Won" value={data.stats.won.toString()} accent="blue" />
        <StatCard label="Avg Lift" value={formatPercent(data.stats.avgLift)} accent="purple" />
      </div>

      {/* ─── Tab Navigation ───────────────────────────────────────────── */}
      <div className="flex gap-1 rounded-lg bg-muted p-1 border border-border">
        {(["active", "wins", "insights"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 rounded-md px-3 py-2 text-xs font-mono uppercase tracking-wider transition-all ${
              activeTab === tab
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab === "active"
              ? `Active (${data.activeExperiments.length})`
              : tab === "wins"
              ? `Wins (${data.weeklyWins.length})`
              : `Insights (${data.recentInsights.length})`}
          </button>
        ))}
      </div>

      {/* ─── Tab Content ──────────────────────────────────────────────── */}
      {activeTab === "active" && (
        <ActiveExperimentsPanel
          experiments={data.activeExperiments}
          onStart={onStartExperiment}
          onPause={onPauseExperiment}
          onRollback={onRollback}
        />
      )}

      {activeTab === "wins" && <WeeklyWinsPanel wins={data.weeklyWins} />}

      {activeTab === "insights" && <InsightsPanel insights={data.recentInsights} />}
    </div>
  );
}

// ─── Revenue Impact Strip ───────────────────────────────────────────────────

function RevenueImpactStrip({ data }: { data: ExperimentsDashboardData }) {
  const { revenueImpact } = data;

  return (
    <div className="rounded-xl border border-border bg-card p-4 sm:p-6">
      <div className="mb-3 flex items-center gap-2">
        <div className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
        <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Revenue Impact</span>
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div>
          <p className="text-2xl font-bold text-foreground font-mono">
            {formatCents(revenueImpact.totalRevenueGainCents)}
          </p>
          <p className="text-xs text-muted-foreground">Revenue Gained</p>
        </div>
        <div>
          <p className="text-2xl font-bold text-emerald-400 font-mono">
            {formatPercent(revenueImpact.totalConversionLift)}
          </p>
          <p className="text-xs text-muted-foreground">Conversion Lift</p>
        </div>
        <div>
          <p className="text-2xl font-bold text-foreground font-mono">
            {revenueImpact.experimentsWon}
          </p>
          <p className="text-xs text-muted-foreground">Experiments Won</p>
        </div>
        <div>
          <p className="text-2xl font-bold text-foreground font-mono">
            {formatCents(revenueImpact.totalSpendSavedCents)}
          </p>
          <p className="text-xs text-muted-foreground">Spend Saved</p>
        </div>
      </div>
    </div>
  );
}

// ─── Stat Card ──────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: "emerald" | "blue" | "purple" | "amber";
}) {
  const colors = {
    emerald: "text-emerald-400",
    blue: "text-blue-400",
    purple: "text-purple-400",
    amber: "text-amber-400",
  };
  const textColor = accent ? colors[accent] : "text-foreground";

  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <p className={`text-xl font-bold font-mono ${textColor}`}>{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

// ─── Active Experiments Panel ────────────────────────────────────────────────

function ActiveExperimentsPanel({
  experiments,
  onStart,
  onPause,
  onRollback,
}: {
  experiments: ExperimentSummary[];
  onStart?: (id: string) => Promise<void>;
  onPause?: (id: string) => Promise<void>;
  onRollback?: (id: string) => Promise<void>;
}) {
  if (experiments.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-8 text-center">
        <div className="mx-auto mb-3 h-12 w-12 rounded-full bg-muted flex items-center justify-center">
          <span className="text-xl">🧪</span>
        </div>
        <p className="text-sm text-muted-foreground">No active experiments</p>
        <p className="text-xs text-muted-foreground/60 mt-1">Create one to start optimizing</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {experiments.map((summary) => (
        <ExperimentCard
          key={summary.experiment.id}
          summary={summary}
          onStart={onStart}
          onPause={onPause}
          onRollback={onRollback}
        />
      ))}
    </div>
  );
}

// ─── Experiment Card ────────────────────────────────────────────────────────

function ExperimentCard({
  summary,
  onStart,
  onPause,
  onRollback,
}: {
  summary: ExperimentSummary;
  onStart?: (id: string) => Promise<void>;
  onPause?: (id: string) => Promise<void>;
  onRollback?: (id: string) => Promise<void>;
}) {
  const { experiment, variants, totalImpressions, liftPercent, confidenceScore, daysRunning, leadingVariant } = summary;
  const status = STATUS_BADGE[experiment.status] ?? STATUS_BADGE["draft"]!;
  const moduleColor = MODULE_COLORS[experiment.moduleSource] ?? "text-muted-foreground";

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border">
        <div className="flex items-center gap-3">
          <div className={`text-xs font-mono uppercase ${moduleColor}`}>{experiment.moduleSource}</div>
          <h3 className="text-sm font-medium text-foreground">{experiment.name}</h3>
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-mono border ${status.bg} ${status.text}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${status.dot}`} />
            {experiment.status.toUpperCase()}
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground font-mono">
          <span>{daysRunning}d running</span>
          <span className="text-border">|</span>
          <span>{formatNumber(totalImpressions)} impr</span>
        </div>
      </div>

      {/* Variants Grid */}
      <div className="p-4">
        <div className="grid gap-2">
          {variants.map((v) => (
            <VariantRow key={v.variantId} variant={v} totalImpressions={totalImpressions} />
          ))}
        </div>
      </div>

      {/* Footer Metrics */}
      <div className="flex items-center justify-between border-t border-border px-4 py-3">
        <div className="flex items-center gap-4">
          <MetricPill label="Lift" value={formatPercent(liftPercent)} positive={liftPercent > 0} />
          <MetricPill label="Confidence" value={`${(confidenceScore * 100).toFixed(0)}%`} />
          <MetricPill label="Leader" value={leadingVariant?.label ?? "—"} />
        </div>
        <div className="flex items-center gap-2">
          {experiment.status === "draft" && onStart && (
            <ActionButton label="Start" onClick={() => onStart(experiment.id)} color="emerald" />
          )}
          {experiment.status === "active" && onPause && (
            <ActionButton label="Pause" onClick={() => onPause(experiment.id)} color="amber" />
          )}
          {experiment.status === "won" && onRollback && (
            <ActionButton label="Rollback" onClick={() => onRollback(experiment.id)} color="red" />
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Variant Row ────────────────────────────────────────────────────────────

function VariantRow({ variant, totalImpressions }: { variant: VariantPerformance; totalImpressions: number }) {
  const fillPercent = totalImpressions > 0 ? (variant.impressions / totalImpressions) * 100 : 0;
  const convRate = (variant.conversionRate * 100).toFixed(2);

  return (
    <div className="flex items-center gap-3 rounded-lg bg-muted/40 p-2.5">
      {/* Label + Control Badge */}
      <div className="flex items-center gap-2 w-32 shrink-0">
        <span className={`text-sm font-medium ${variant.isLeading ? "text-emerald-400" : "text-foreground"}`}>
          {variant.label}
        </span>
        {variant.isControl && (
          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">CTRL</span>
        )}
        {variant.isLeading && (
          <span className="rounded bg-emerald-900/60 px-1.5 py-0.5 text-[10px] font-mono text-emerald-400">LEAD</span>
        )}
      </div>

      {/* Progress Bar */}
      <div className="flex-1">
        <div className="h-2 rounded-full bg-muted overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${variant.isLeading ? "bg-emerald-500" : "bg-muted-foreground/40"}`}
            style={{ width: `${Math.min(fillPercent, 100)}%` }}
          />
        </div>
      </div>

      {/* Metrics */}
      <div className="flex items-center gap-4 text-xs font-mono shrink-0">
        <span className="text-muted-foreground">{formatNumber(variant.impressions)} impr</span>
        <span className="text-foreground">{convRate}% CVR</span>
        <span className="text-muted-foreground">{variant.allocationPercent}% traffic</span>
      </div>
    </div>
  );
}

// ─── Weekly Wins Panel ──────────────────────────────────────────────────────

function WeeklyWinsPanel({ wins }: { wins: WeeklyWin[] }) {
  if (wins.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-8 text-center">
        <p className="text-sm text-muted-foreground">No wins this week yet</p>
        <p className="text-xs text-muted-foreground/60 mt-1">Keep experiments running to accumulate learnings</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {wins.map((win) => (
        <div
          key={`${win.experimentId}-${win.resolvedAt}`}
          className="flex items-center justify-between rounded-xl border border-border bg-card p-4"
        >
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-full bg-emerald-950/60 border border-emerald-800 flex items-center justify-center">
              <span className="text-emerald-400 text-sm">✓</span>
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">{win.experimentName}</p>
              <p className="text-xs text-muted-foreground">
                Winner: <span className="text-foreground">{win.winningLabel}</span>
                <span className="mx-1.5 text-border">·</span>
                <span className={MODULE_COLORS[win.moduleSource] ?? "text-muted-foreground"}>{win.moduleSource}</span>
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-sm font-mono font-bold text-emerald-400">
              {formatPercent(win.liftPercent)}
            </p>
            <p className="text-xs text-muted-foreground font-mono">
              {formatCents(win.revenueGainCents)} gained
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Insights Panel ─────────────────────────────────────────────────────────

function InsightsPanel({ insights }: { insights: GrowthInsight[] }) {
  if (insights.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-8 text-center">
        <p className="text-sm text-muted-foreground">No insights generated yet</p>
        <p className="text-xs text-muted-foreground/60 mt-1">Insights emerge from completed experiments</p>
      </div>
    );
  }

  const categoryIcons: Record<string, string> = {
    headline: "📝",
    cta: "🎯",
    audience: "👥",
    timing: "⏰",
    creative: "🎨",
    offer: "💰",
  };

  return (
    <div className="space-y-3">
      {insights.map((insight) => (
        <div key={insight.id} className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-start gap-3">
            <span className="text-lg">{categoryIcons[insight.category] ?? "💡"}</span>
            <div className="flex-1">
              <p className="text-sm text-foreground">{insight.finding}</p>
              <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground font-mono">
                <span className={MODULE_COLORS[insight.moduleSource ?? ""] ?? "text-muted-foreground"}>
                  {insight.moduleSource ?? "general"}
                </span>
                <span className="text-border">|</span>
                <span>Confidence: {(insight.confidenceScore * 100).toFixed(0)}%</span>
                {insight.liftPercent != null && (
                  <>
                    <span className="text-border">|</span>
                    <span className="text-emerald-400">{formatPercent(insight.liftPercent)} lift</span>
                  </>
                )}
                <span className="text-border">|</span>
                <span>Validated {insight.timesValidated}x</span>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Utility Components ─────────────────────────────────────────────────────

function MetricPill({ label, value, positive }: { label: string; value: string; positive?: boolean }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={`text-xs font-mono font-medium ${positive === true ? "text-emerald-400" : positive === false ? "text-destructive" : "text-foreground"}`}>
        {value}
      </span>
    </div>
  );
}

function ActionButton({ label, onClick, color }: { label: string; onClick: () => void; color: "emerald" | "amber" | "red" }) {
  const styles = {
    emerald: "bg-emerald-950/60 border-emerald-800 text-emerald-400 hover:bg-emerald-900/60",
    amber: "bg-amber-950/60 border-amber-800 text-amber-400 hover:bg-amber-900/60",
    red: "bg-destructive/10 border-destructive/30 text-destructive hover:bg-destructive/20",
  };

  return (
    <button
      onClick={onClick}
      className={`rounded-md border px-3 py-1.5 text-xs font-mono transition-colors ${styles[color]}`}
    >
      {label}
    </button>
  );
}
