export const runtime = 'edge';

/**
 * Swarm Overnight Cron Route
 *
 * Runs on a nightly schedule (e.g., 2:00 AM UTC) to:
 * 1. Check for queued missions that should run overnight
 * 2. Launch analytics + competitor research agents
 * 3. Generate next-day content recommendations
 * 4. Clean up stale/failed tasks older than 7 days
 *
 * Protected by CRON_SECRET header validation.
 */

import { NextResponse } from "next/server";
import { getBindings } from "@/lib/cloudflare/bindings";
import type { AgentRole, TaskType } from "@/lib/swarm/types";

interface OvernightTask {
  agentRole: AgentRole;
  taskType: TaskType;
  instruction: string;
  priority: number;
}

export async function POST(request: Request): Promise<NextResponse> {
  // Validate cron secret
  const authHeader = request.headers.get("authorization");
  const env = getBindings();
  const cronSecret = (env as unknown as Record<string, string>)["CRON_SECRET"];

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const db = env.DB;
    const queue = env.SWARM_QUEUE;

    // 1. Find workspaces with overnight mode enabled
    const workspaces = await db
      .prepare(
        `SELECT DISTINCT w.id, w.name
         FROM workspaces w
         JOIN swarm_agents sa ON sa.workspace_id = w.id
         WHERE sa.is_active = 1`
      )
      .all<{ id: string; name: string }>();

    let missionsLaunched = 0;
    let tasksQueued = 0;
    let tasksCleanedUp = 0;

    for (const workspace of workspaces.results ?? []) {
      // 2. Create overnight mission
      const missionId = `overnight_${workspace.id}_${Date.now()}`;

      await db
        .prepare(
          `INSERT INTO swarm_missions (id, workspace_id, objective, status, created_at)
           VALUES (?, ?, ?, 'active', datetime('now'))`
        )
        .bind(
          missionId,
          workspace.id,
          JSON.stringify({
            goal: "Overnight analysis and content preparation",
            targetMetric: "engagement",
          })
        )
        .run();

      missionsLaunched++;

      // 3. Queue overnight tasks
      const overnightTasks: OvernightTask[] = [
        {
          agentRole: "analytics",
          taskType: "analyze_metrics",
          instruction: "Analyze yesterday's performance across all platforms. Flag anomalies and identify top-performing content patterns.",
          priority: 10,
        },
        {
          agentRole: "competitor",
          taskType: "research_competitors",
          instruction: "Check competitor activity from the last 24 hours. Identify any new campaigns, content themes, or positioning shifts.",
          priority: 9,
        },
        {
          agentRole: "content",
          taskType: "generate_content",
          instruction: "Based on recent analytics, draft 3 content pieces optimized for today's best posting windows.",
          priority: 8,
        },
        {
          agentRole: "strategist",
          taskType: "recommend",
          instruction: "Review overnight findings and recommend today's top 3 priority actions for maximum growth impact.",
          priority: 7,
        },
      ];

      for (const task of overnightTasks) {
        const taskId = `task_${missionId}_${task.agentRole}_${Date.now()}`;

        // Insert task record
        await db
          .prepare(
            `INSERT INTO swarm_tasks (id, mission_id, agent_role, task_type, input, status, priority, created_at)
             VALUES (?, ?, ?, ?, ?, 'queued', ?, datetime('now'))`
          )
          .bind(
            taskId,
            missionId,
            task.agentRole,
            task.taskType,
            JSON.stringify({ instruction: task.instruction }),
            task.priority
          )
          .run();

        // Enqueue to Cloudflare Queue
        await queue.send({
          missionId,
          taskId,
          agentRole: task.agentRole,
          taskType: task.taskType,
          input: { instruction: task.instruction },
          workspaceId: workspace.id,
          attempt: 0,
          maxRetries: 2,
          modelProvider: "anthropic",
          temperature: 0.7,
        });

        tasksQueued++;
      }
    }

    // 4. Cleanup: mark stale tasks as failed, remove old logs
    const cleanupResult = await db
      .prepare(
        `UPDATE swarm_tasks SET status = 'failed'
         WHERE status IN ('queued', 'running')
         AND created_at < datetime('now', '-7 days')`
      )
      .run();
    tasksCleanedUp = cleanupResult.meta?.changes ?? 0;

    // Remove logs older than 30 days
    await db
      .prepare(`DELETE FROM swarm_logs WHERE created_at < datetime('now', '-30 days')`)
      .run();

    return NextResponse.json({
      success: true,
      missionsLaunched,
      tasksQueued,
      tasksCleanedUp,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Swarm overnight cron error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
