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
  active: { bg: "bg-emerald-950 border-emerald-800", text: "text-emerald-400", dot: "bg-emerald-400 animate-pulse" },
  draft: { bg: "bg-zinc-800 border-zinc-700", text: "text-zinc-400", dot: "bg-zinc-400" },
  paused: { bg: "bg-amber-950 border-amber-800", text: "text-amber-400", dot: "bg-amber-400" },
  won: { bg: "bg-blue-950 border-blue-800", text: "text-blue-400", dot: "bg-blue-400" },
  lost: { bg: "bg-red-950 border-red-800", text: "text-red-400", dot: "bg-red-400" },
  archived: { bg: "bg-zinc-900 border-zinc-700", text: "text-zinc-500", dot: "bg-zinc-500" },
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

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const hours = Math.floor(diff / 3_600_000);
  if (hours < 1) return "just now";
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
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
      <div className="flex gap-1 rounded-lg bg-zinc-900 p-1 border border-zinc-800">
        {(["active", "wins", "insights"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 rounded-md px-3 py-2 text-xs font-mono uppercase tracking-wider transition-all ${
              activeTab === tab
                ? "bg-zinc-800 text-zinc-100 shadow-sm"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {tab === "active" ? `Active (${data.activeExperiments.length})` : tab === "wins" ? `Wins (${data.weeklyWins.length})` : `Insights (${data.recentInsights.length})`}
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

      {activeTab === "wins" && (
        <WeeklyWinsPanel wins={data.weeklyWins} />
      )}

      {activeTab === "insights" && (
        <InsightsPanel insights={data.recentInsights} />
      )}
    </div>
  );
}

// ─── Revenue Impact Strip ───────────────────────────────────────────────────

function RevenueImpactStrip({ data }: { data: ExperimentsDashboardData }) {
  const { revenueImpact } = data;

  return (
    <div className="rounded-xl border border-zinc-800 bg-gradient-to-r from-zinc-900 via-zinc-900 to-emerald-950/20 p-4 sm:p-6">
      <div className="mb-3 flex items-center gap-2">
        <div className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
        <span className="text-xs font-mono uppercase tracking-wider text-zinc-400">Revenue Impact</span>
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div>
          <p className="text-2xl font-bold text-zinc-100 font-mono">
            {formatCents(revenueImpact.totalRevenueGainCents)}
          </p>
          <p className="text-xs text-zinc-500">Revenue Gained</p>
        </div>
        <div>
          <p className="text-2xl font-bold text-emerald-400 font-mono">
            {formatPercent(revenueImpact.totalConversionLift)}
          </p>
          <p className="text-xs text-zinc-500">Conversion Lift</p>
        </div>
        <div>
          <p className="text-2xl font-bold text-zinc-100 font-mono">
            {revenueImpact.experimentsWon}
          </p>
          <p className="text-xs text-zinc-500">Experiments Won</p>
        </div>
        <div>
          <p className="text-2xl font-bold text-zinc-100 font-mono">
            {formatCents(revenueImpact.totalSpendSavedCents)}
          </p>
          <p className="text-xs text-zinc-500">Spend Saved</p>
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
  const textColor = accent ? colors[accent] : "text-zinc-100";

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3">
      <p className={`text-xl font-bold font-mono ${textColor}`}>{value}</p>
      <p className="text-xs text-zinc-500">{label}</p>
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
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-8 text-center">
        <div className="mx-auto mb-3 h-12 w-12 rounded-full bg-zinc-800 flex items-center justify-center">
          <span className="text-xl">🧪</span>
        </div>
        <p className="text-sm text-zinc-400">No active experiments</p>
        <p className="text-xs text-zinc-600 mt-1">Create one to start optimizing</p>
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
  const moduleColor = MODULE_COLORS[experiment.moduleSource] ?? "text-zinc-400";

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-zinc-800/50">
        <div className="flex items-center gap-3">
          <div className={`text-xs font-mono uppercase ${moduleColor}`}>{experiment.moduleSource}</div>
          <h3 className="text-sm font-medium text-zinc-100">{experiment.name}</h3>
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-mono border ${status.bg} ${status.text}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${status.dot}`} />
            {experiment.status.toUpperCase()}
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs text-zinc-500 font-mono">
          <span>{daysRunning}d running</span>
          <span className="text-zinc-700">|</span>
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
      <div className="flex items-center justify-between border-t border-zinc-800/50 px-4 py-3">
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
    <div className="flex items-center gap-3 rounded-lg bg-zinc-800/30 p-2.5">
      {/* Label + Control Badge */}
      <div className="flex items-center gap-2 w-32 shrink-0">
        <span className={`text-sm font-medium ${variant.isLeading ? "text-emerald-400" : "text-zinc-300"}`}>
          {variant.label}
        </span>
        {variant.isControl && (
          <span className="rounded bg-zinc-700 px-1.5 py-0.5 text-[10px] font-mono text-zinc-400">CTRL</span>
        )}
        {variant.isLeading && (
          <span className="rounded bg-emerald-900 px-1.5 py-0.5 text-[10px] font-mono text-emerald-400">LEAD</span>
        )}
      </div>

      {/* Progress Bar */}
      <div className="flex-1">
        <div className="h-2 rounded-full bg-zinc-800 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${variant.isLeading ? "bg-emerald-500" : "bg-zinc-600"}`}
            style={{ width: `${Math.min(fillPercent, 100)}%` }}
          />
        </div>
      </div>

      {/* Metrics */}
      <div className="flex items-center gap-4 text-xs font-mono shrink-0">
        <span className="text-zinc-400">{formatNumber(variant.impressions)} impr</span>
        <span className="text-zinc-300">{convRate}% CVR</span>
        <span className="text-zinc-500">{variant.allocationPercent}% traffic</span>
      </div>
    </div>
  );
}

// ─── Weekly Wins Panel ──────────────────────────────────────────────────────

function WeeklyWinsPanel({ wins }: { wins: WeeklyWin[] }) {
  if (wins.length === 0) {
    return (
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-8 text-center">
        <p className="text-sm text-zinc-400">No wins this week yet</p>
        <p className="text-xs text-zinc-600 mt-1">Keep experiments running to accumulate learnings</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {wins.map((win) => (
        <div
          key={`${win.experimentId}-${win.resolvedAt}`}
          className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900/50 p-4"
        >
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-full bg-emerald-950 border border-emerald-800 flex items-center justify-center">
              <span className="text-emerald-400 text-sm">✓</span>
            </div>
            <div>
              <p className="text-sm font-medium text-zinc-100">{win.experimentName}</p>
              <p className="text-xs text-zinc-500">
                Winner: <span className="text-zinc-300">{win.winningLabel}</span>
                <span className="mx-1.5 text-zinc-700">·</span>
                <span className={MODULE_COLORS[win.moduleSource] ?? "text-zinc-400"}>{win.moduleSource}</span>
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-sm font-mono font-bold text-emerald-400">
              {formatPercent(win.liftPercent)}
            </p>
            <p className="text-xs text-zinc-500 font-mono">
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
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-8 text-center">
        <p className="text-sm text-zinc-400">No insights generated yet</p>
        <p className="text-xs text-zinc-600 mt-1">Insights emerge from completed experiments</p>
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
        <div
          key={insight.id}
          className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4"
        >
          <div className="flex items-start gap-3">
            <span className="text-lg">{categoryIcons[insight.category] ?? "💡"}</span>
            <div className="flex-1">
              <p className="text-sm text-zinc-200">{insight.finding}</p>
              <div className="mt-2 flex items-center gap-3 text-xs text-zinc-500 font-mono">
                <span className={MODULE_COLORS[insight.moduleSource ?? ""] ?? "text-zinc-400"}>
                  {insight.moduleSource ?? "general"}
                </span>
                <span className="text-zinc-700">|</span>
                <span>Confidence: {(insight.confidenceScore * 100).toFixed(0)}%</span>
                {insight.liftPercent != null && (
                  <>
                    <span className="text-zinc-700">|</span>
                    <span className="text-emerald-400">{formatPercent(insight.liftPercent)} lift</span>
                  </>
                )}
                <span className="text-zinc-700">|</span>
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
      <span className="text-xs text-zinc-500">{label}</span>
      <span className={`text-xs font-mono font-medium ${positive === true ? "text-emerald-400" : positive === false ? "text-red-400" : "text-zinc-300"}`}>
        {value}
      </span>
    </div>
  );
}

function ActionButton({ label, onClick, color }: { label: string; onClick: () => void; color: "emerald" | "amber" | "red" }) {
  const styles = {
    emerald: "bg-emerald-950 border-emerald-800 text-emerald-400 hover:bg-emerald-900",
    amber: "bg-amber-950 border-amber-800 text-amber-400 hover:bg-amber-900",
    red: "bg-red-950 border-red-800 text-red-400 hover:bg-red-900",
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
