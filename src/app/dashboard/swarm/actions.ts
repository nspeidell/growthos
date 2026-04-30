"use server";

import { getDb } from "@/lib/cloudflare/bindings";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SwarmAgent {
  id: string;
  workspaceId: string;
  role: string;
  name: string;
  isActive: boolean;
  totalTasks: number;
  totalTokens: number;
  totalCostCents: number;
  avgScore: number;
  lastActiveAt: string | null;
}

export interface SwarmMission {
  id: string;
  workspaceId: string;
  objective: string;
  status: string;
  taskCount: number;
  completedCount: number;
  totalTokens: number;
  totalCostCents: number;
  createdAt: string;
  completedAt: string | null;
}

export interface SwarmTask {
  id: string;
  missionId: string;
  agentRole: string;
  taskType: string;
  status: string;
  priority: number;
  tokensUsed: number | null;
  costCents: number | null;
  createdAt: string;
  completedAt: string | null;
}

export interface SwarmLog {
  id: string;
  missionId: string;
  agentRole: string;
  level: string;
  message: string;
  createdAt: string;
}

export interface SwarmDashboardData {
  agents: SwarmAgent[];
  missions: SwarmMission[];
  recentTasks: SwarmTask[];
  recentLogs: SwarmLog[];
  stats: {
    totalMissions: number;
    activeMissions: number;
    totalTasksCompleted: number;
    totalTokensUsed: number;
    totalCostCents: number;
    avgSuccessRate: number;
  };
}

// ─── Server Actions ──────────────────────────────────────────────────────────

export async function getSwarmDashboard(
  workspaceId: string
): Promise<SwarmDashboardData> {
  const db = getDb();

  // Fetch agents with aggregated stats
  const agents = await db
    .prepare(
      `SELECT
        sa.id, sa.workspace_id, sa.role, sa.name, sa.is_active,
        COALESCE(COUNT(st.id), 0) as total_tasks,
        COALESCE(SUM(st.tokens_used), 0) as total_tokens,
        COALESCE(SUM(st.cost_cents), 0) as total_cost_cents,
        COALESCE(AVG(CASE WHEN st.status = 'completed' THEN 1.0 ELSE 0.0 END), 0) as avg_score,
        MAX(st.completed_at) as last_active_at
      FROM swarm_agents sa
      LEFT JOIN swarm_tasks st ON st.agent_id = sa.id
      WHERE sa.workspace_id = ?
      GROUP BY sa.id
      ORDER BY sa.role`
    )
    .bind(workspaceId)
    .all();

  // Fetch missions (most recent 20)
  const missions = await db
    .prepare(
      `SELECT
        sm.id, sm.workspace_id, sm.objective, sm.status,
        COALESCE(COUNT(st.id), 0) as task_count,
        COALESCE(SUM(CASE WHEN st.status = 'completed' THEN 1 ELSE 0 END), 0) as completed_count,
        COALESCE(SUM(st.tokens_used), 0) as total_tokens,
        COALESCE(SUM(st.cost_cents), 0) as total_cost_cents,
        sm.created_at, sm.completed_at
      FROM swarm_missions sm
      LEFT JOIN swarm_tasks st ON st.mission_id = sm.id
      WHERE sm.workspace_id = ?
      GROUP BY sm.id
      ORDER BY sm.created_at DESC
      LIMIT 20`
    )
    .bind(workspaceId)
    .all();

  // Recent tasks (last 50)
  const recentTasks = await db
    .prepare(
      `SELECT st.id, st.mission_id, st.agent_id, st.task_type, st.status,
              st.tokens_used, st.cost_cents, st.created_at, st.completed_at
       FROM swarm_tasks st
       JOIN swarm_missions sm ON sm.id = st.mission_id
       WHERE sm.workspace_id = ?
       ORDER BY st.created_at DESC
       LIMIT 50`
    )
    .bind(workspaceId)
    .all();

  // Recent logs (last 100)
  const recentLogs = await db
    .prepare(
      `SELECT sl.id, sl.mission_id, sl.agent_id, sl.level, sl.message, sl.created_at
       FROM swarm_logs sl
       JOIN swarm_missions sm ON sm.id = sl.mission_id
       WHERE sm.workspace_id = ?
       ORDER BY sl.created_at DESC
       LIMIT 100`
    )
    .bind(workspaceId)
    .all();

  // Aggregate stats
  const statsRow = await db
    .prepare(
      `SELECT
        COUNT(DISTINCT sm.id) as total_missions,
        SUM(CASE WHEN sm.status = 'active' THEN 1 ELSE 0 END) as active_missions,
        (SELECT COUNT(*) FROM swarm_tasks st2 JOIN swarm_missions sm2 ON sm2.id = st2.mission_id WHERE sm2.workspace_id = ? AND st2.status = 'completed') as total_tasks_completed,
        COALESCE(SUM(st.tokens_used), 0) as total_tokens_used,
        COALESCE(SUM(st.cost_cents), 0) as total_cost_cents
      FROM swarm_missions sm
      LEFT JOIN swarm_tasks st ON st.mission_id = sm.id
      WHERE sm.workspace_id = ?`
    )
    .bind(workspaceId, workspaceId)
    .first();

  const totalTasks = (recentTasks.results ?? []).length;
  const completedTasks = (recentTasks.results ?? []).filter(
    (t: Record<string, unknown>) => t["status"] === "completed"
  ).length;

  return {
    agents: (agents.results ?? []).map((a: Record<string, unknown>) => ({
      id: a["id"] as string,
      workspaceId: a["workspace_id"] as string,
      role: a["role"] as string,
      name: a["name"] as string,
      isActive: Boolean(a["is_active"]),
      totalTasks: Number(a["total_tasks"]),
      totalTokens: Number(a["total_tokens"]),
      totalCostCents: Number(a["total_cost_cents"]),
      avgScore: Number(a["avg_score"]),
      lastActiveAt: a["last_active_at"] as string | null,
    })),
    missions: (missions.results ?? []).map((m: Record<string, unknown>) => ({
      id: m["id"] as string,
      workspaceId: m["workspace_id"] as string,
      objective: m["objective"] as string,
      status: m["status"] as string,
      taskCount: Number(m["task_count"]),
      completedCount: Number(m["completed_count"]),
      totalTokens: Number(m["total_tokens"]),
      totalCostCents: Number(m["total_cost_cents"]),
      createdAt: m["created_at"] as string,
      completedAt: m["completed_at"] as string | null,
    })),
    recentTasks: (recentTasks.results ?? []).map((t: Record<string, unknown>) => ({
      id: t["id"] as string,
      missionId: t["mission_id"] as string,
      agentRole: t["agent_id"] as string,
      taskType: t["task_type"] as string,
      status: t["status"] as string,
      priority: 0,
      tokensUsed: t["tokens_used"] != null ? Number(t["tokens_used"]) : null,
      costCents: t["cost_cents"] != null ? Number(t["cost_cents"]) : null,
      createdAt: t["created_at"] as string,
      completedAt: t["completed_at"] as string | null,
    })),
    recentLogs: (recentLogs.results ?? []).map((l: Record<string, unknown>) => ({
      id: l["id"] as string,
      missionId: l["mission_id"] as string,
      agentRole: l["agent_id"] as string,
      level: l["level"] as string,
      message: l["message"] as string,
      createdAt: l["created_at"] as string,
    })),
    stats: {
      totalMissions: Number(statsRow?.["total_missions"] ?? 0),
      activeMissions: Number(statsRow?.["active_missions"] ?? 0),
      totalTasksCompleted: Number(statsRow?.["total_tasks_completed"] ?? 0),
      totalTokensUsed: Number(statsRow?.["total_tokens_used"] ?? 0),
      totalCostCents: Number(statsRow?.["total_cost_cents"] ?? 0),
      avgSuccessRate: totalTasks > 0 ? completedTasks / totalTasks : 0,
    },
  };
}

export async function launchMission(
  workspaceId: string,
  goal: string,
  targetMetric?: string,
  constraints?: string[],
  userId?: string
): Promise<{ missionId: string; status: string }> {
  const db = getDb();
  const missionId = `mission_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  await db
    .prepare(
      `INSERT INTO swarm_missions (id, workspace_id, title, objective, status, created_by, created_at)
       VALUES (?, ?, ?, ?, 'planning', ?, unixepoch())`
    )
    .bind(
      missionId,
      workspaceId,
      goal,
      JSON.stringify({ goal, targetMetric, constraints }),
      userId ?? 'system'
    )
    .run();

  // In production, this would also enqueue to SWARM_QUEUE
  // For now, mark as planning — the orchestrator picks it up

  return { missionId, status: "planning" };
}

export async function cancelMission(
  workspaceId: string,
  missionId: string
): Promise<{ success: boolean }> {
  const db = getDb();

  const result = await db
    .prepare(
      `UPDATE swarm_missions SET status = 'cancelled', completed_at = datetime('now')
       WHERE id = ? AND workspace_id = ? AND status IN ('planning', 'active', 'paused')`
    )
    .bind(missionId, workspaceId)
    .run();

  if ((result.meta?.changes ?? 0) > 0) {
    // Cancel queued tasks
    await db
      .prepare(
        `UPDATE swarm_tasks SET status = 'skipped'
         WHERE mission_id = ? AND status IN ('queued', 'running')`
      )
      .bind(missionId)
      .run();

    return { success: true };
  }

  return { success: false };
}

export async function toggleAgent(
  workspaceId: string,
  agentId: string,
  isActive: boolean
): Promise<{ success: boolean }> {
  const db = getDb();

  const result = await db
    .prepare(
      `UPDATE swarm_agents SET is_active = ?
       WHERE id = ? AND workspace_id = ?`
    )
    .bind(isActive ? 1 : 0, agentId, workspaceId)
    .run();

  return { success: (result.meta?.changes ?? 0) > 0 };
}
