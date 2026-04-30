"use client";

import { useState } from "react";
import type {
  SwarmDashboardData,
  SwarmMission,
  SwarmLog,
} from "./actions";

// ─── Agent Role Colors (Bloomberg-style) ─────────────────────────────────────

const ROLE_COLORS: Record<string, string> = {
  strategist: "text-amber-400",
  content: "text-emerald-400",
  video: "text-purple-400",
  ads: "text-blue-400",
  outreach: "text-cyan-400",
  analytics: "text-orange-400",
  competitor: "text-red-400",
  founder_voice: "text-pink-400",
};

const STATUS_COLORS: Record<string, string> = {
  completed: "text-emerald-400",
  active: "text-amber-400",
  running: "text-amber-400",
  queued: "text-zinc-400",
  planning: "text-blue-400",
  failed: "text-red-400",
  cancelled: "text-zinc-500",
  paused: "text-orange-400",
  skipped: "text-zinc-500",
};

const LEVEL_COLORS: Record<string, string> = {
  info: "text-zinc-400",
  warn: "text-amber-400",
  error: "text-red-400",
};

// ─── Formatters ──────────────────────────────────────────────────────────────

function formatCost(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}K`;
  return tokens.toString();
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
}

// ─── Component ───────────────────────────────────────────────────────────────

interface SwarmDashboardProps {
  data: SwarmDashboardData;
  onLaunchMission: (goal: string) => Promise<void>;
  onCancelMission: (missionId: string) => Promise<void>;
  onToggleAgent: (agentId: string, isActive: boolean) => Promise<void>;
}

export function SwarmDashboard({
  data,
  onLaunchMission,
  onCancelMission,
  onToggleAgent,
}: SwarmDashboardProps) {
  const [missionGoal, setMissionGoal] = useState("");
  const [isLaunching, setIsLaunching] = useState(false);
  const [activeTab, setActiveTab] = useState<"missions" | "agents" | "logs">("missions");

  const handleLaunch = async () => {
    if (!missionGoal.trim() || isLaunching) return;
    setIsLaunching(true);
    try {
      await onLaunchMission(missionGoal.trim());
      setMissionGoal("");
    } finally {
      setIsLaunching(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* ─── Header Stats (Bloomberg ticker style) ─────────────────────── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard label="MISSIONS" value={data.stats.totalMissions.toString()} />
        <StatCard label="ACTIVE" value={data.stats.activeMissions.toString()} highlight />
        <StatCard label="COMPLETED" value={data.stats.totalTasksCompleted.toString()} />
        <StatCard label="TOKENS" value={formatTokens(data.stats.totalTokensUsed)} />
        <StatCard label="COST" value={formatCost(data.stats.totalCostCents)} />
        <StatCard
          label="SUCCESS"
          value={`${(data.stats.avgSuccessRate * 100).toFixed(0)}%`}
          highlight={data.stats.avgSuccessRate > 0.8}
        />
      </div>

      {/* ─── Mission Launcher ──────────────────────────────────────────── */}
      <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xs font-mono text-emerald-400 uppercase tracking-wider">
            Launch Mission
          </span>
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={missionGoal}
            onChange={(e) => setMissionGoal(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleLaunch()}
            placeholder="Describe your growth objective..."
            className="flex-1 rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 font-mono focus:border-emerald-500 focus:outline-none"
          />
          <button
            onClick={handleLaunch}
            disabled={!missionGoal.trim() || isLaunching}
            className="rounded bg-emerald-600 px-4 py-2 text-sm font-mono font-medium text-white hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isLaunching ? "LAUNCHING..." : "EXECUTE"}
          </button>
        </div>
      </div>

      {/* ─── Tab Navigation ────────────────────────────────────────────── */}
      <div className="flex gap-1 border-b border-zinc-800">
        {(["missions", "agents", "logs"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-xs font-mono uppercase tracking-wider transition-colors ${
              activeTab === tab
                ? "text-emerald-400 border-b-2 border-emerald-400"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* ─── Tab Content ───────────────────────────────────────────────── */}
      {activeTab === "missions" && (
        <MissionsPanel missions={data.missions} onCancel={onCancelMission} />
      )}
      {activeTab === "agents" && (
        <AgentsPanel agents={data.agents} onToggle={onToggleAgent} />
      )}
      {activeTab === "logs" && <LogsPanel logs={data.recentLogs} />}
    </div>
  );
}

// ─── Stat Card ───────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="rounded border border-zinc-800 bg-zinc-950 px-3 py-2">
      <p className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider">
        {label}
      </p>
      <p
        className={`text-lg font-mono font-bold ${
          highlight ? "text-emerald-400" : "text-zinc-100"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

// ─── Missions Panel ──────────────────────────────────────────────────────────

function MissionsPanel({
  missions,
  onCancel,
}: {
  missions: SwarmMission[];
  onCancel: (id: string) => Promise<void>;
}) {
  if (missions.length === 0) {
    return (
      <div className="rounded border border-zinc-800 bg-zinc-950 p-8 text-center">
        <p className="text-sm font-mono text-zinc-500">
          No missions yet. Launch one above to get started.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {missions.map((mission) => {
        let objective = mission.objective;
        try {
          const parsed = JSON.parse(mission.objective) as { goal?: string };
          objective = parsed.goal ?? mission.objective;
        } catch {
          // Use as-is — objective is plain text, not JSON
        }

        const progress =
          mission.taskCount > 0
            ? Math.round((mission.completedCount / mission.taskCount) * 100)
            : 0;

        return (
          <div
            key={mission.id}
            className="rounded border border-zinc-800 bg-zinc-950 p-3 font-mono"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-sm text-zinc-100 truncate">{objective}</p>
                <div className="flex items-center gap-3 mt-1 text-xs text-zinc-500">
                  <span className={STATUS_COLORS[mission.status] ?? "text-zinc-400"}>
                    {mission.status.toUpperCase()}
                  </span>
                  <span>{mission.completedCount}/{mission.taskCount} tasks</span>
                  <span>{formatTokens(mission.totalTokens)} tok</span>
                  <span>{formatCost(mission.totalCostCents)}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {/* Progress bar */}
                <div className="w-16 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 transition-all"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                {(mission.status === "active" || mission.status === "planning") && (
                  <button
                    onClick={() => onCancel(mission.id)}
                    className="text-xs text-red-400 hover:text-red-300"
                  >
                    CANCEL
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Agents Panel ────────────────────────────────────────────────────────────

function AgentsPanel({
  agents,
  onToggle,
}: {
  agents: SwarmDashboardData["agents"];
  onToggle: (id: string, active: boolean) => Promise<void>;
}) {
  if (agents.length === 0) {
    return (
      <div className="rounded border border-zinc-800 bg-zinc-950 p-8 text-center">
        <p className="text-sm font-mono text-zinc-500">
          No agents configured. Agents are provisioned on first mission launch.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
      {agents.map((agent) => (
        <div
          key={agent.id}
          className="rounded border border-zinc-800 bg-zinc-950 p-3 font-mono"
        >
          <div className="flex items-center justify-between mb-2">
            <span className={`text-sm font-bold ${ROLE_COLORS[agent.role] ?? "text-zinc-300"}`}>
              {agent.name}
            </span>
            <button
              onClick={() => onToggle(agent.id, !agent.isActive)}
              className={`w-8 h-4 rounded-full transition-colors ${
                agent.isActive ? "bg-emerald-600" : "bg-zinc-700"
              }`}
            >
              <div
                className={`w-3 h-3 rounded-full bg-white transition-transform mx-0.5 ${
                  agent.isActive ? "translate-x-4" : "translate-x-0"
                }`}
              />
            </button>
          </div>
          <div className="space-y-0.5 text-[10px] text-zinc-500">
            <p>Tasks: {agent.totalTasks}</p>
            <p>Tokens: {formatTokens(agent.totalTokens)}</p>
            <p>Cost: {formatCost(agent.totalCostCents)}</p>
            <p>
              Success:{" "}
              <span className={agent.avgScore > 0.8 ? "text-emerald-400" : "text-zinc-400"}>
                {(agent.avgScore * 100).toFixed(0)}%
              </span>
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Logs Panel (terminal-style) ─────────────────────────────────────────────

function LogsPanel({ logs }: { logs: SwarmLog[] }) {
  if (logs.length === 0) {
    return (
      <div className="rounded border border-zinc-800 bg-zinc-950 p-8 text-center">
        <p className="text-sm font-mono text-zinc-500">
          No activity logs yet.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded border border-zinc-800 bg-zinc-950 p-3 max-h-96 overflow-y-auto font-mono text-xs">
      {logs.map((log) => (
        <div key={log.id} className="flex gap-2 py-0.5 border-b border-zinc-900 last:border-0">
          <span className="text-zinc-600 shrink-0">{formatTime(log.createdAt)}</span>
          <span className={`shrink-0 w-12 ${LEVEL_COLORS[log.level] ?? "text-zinc-400"}`}>
            [{log.level.toUpperCase()}]
          </span>
          <span className={`shrink-0 w-20 ${ROLE_COLORS[log.agentRole] ?? "text-zinc-400"}`}>
            {log.agentRole}
          </span>
          <span className="text-zinc-300 break-all">{log.message}</span>
        </div>
      ))}
    </div>
  );
}
