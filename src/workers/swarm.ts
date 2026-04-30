/**
 * Swarm Queue Worker
 *
 * Consumes messages from SWARM_QUEUE (Cloudflare Queue).
 * Each message represents a task dispatched by the orchestrator.
 * The worker instantiates the appropriate agent, executes the task,
 * and writes results back to D1 (swarm_tasks + swarm_logs).
 */

import { createAgent } from "../lib/swarm/agents";
import type { AgentContext } from "../lib/swarm/agents";
import type { AgentRole, TaskType, TaskInput, TaskStatus } from "../lib/swarm/types";

// ─── Queue Message Shape ─────────────────────────────────────────────────────

interface SwarmQueueMessage {
  missionId: string;
  taskId: string;
  agentRole: AgentRole;
  taskType: TaskType;
  input: TaskInput;
  workspaceId: string;
  attempt: number;
  maxRetries: number;
  modelProvider: string;
  temperature: number;
}

// ─── Worker Env (Cloudflare bindings) ────────────────────────────────────────

interface WorkerEnv {
  DB: D1Database;
  SWARM_QUEUE: Queue;
  ANTHROPIC_API_KEY: string;
  ENVIRONMENT: string;
}

// ─── Queue Consumer ──────────────────────────────────────────────────────────

export default {
  async queue(
    batch: MessageBatch<SwarmQueueMessage>,
    env: WorkerEnv
  ): Promise<void> {
    for (const message of batch.messages) {
      const msg = message.body;

      try {
        // Update task status to "running"
        await updateTaskStatus(env.DB, msg.taskId, "running");
        await writeLog(env.DB, msg.missionId, msg.agentRole, "info", `Starting task ${msg.taskType}`);

        // Build agent context
        const context: AgentContext = {
          workspaceId: msg.workspaceId,
          missionId: msg.missionId,
          anthropicApiKey: env.ANTHROPIC_API_KEY,
          modelProvider: msg.modelProvider,
          temperature: msg.temperature,
        };

        // Execute via the specialist agent
        const agent = createAgent(msg.agentRole);
        const output = await agent.execute(msg.taskType, msg.input, context);

        // Write results to D1
        await env.DB.prepare(
          `UPDATE swarm_tasks SET
            status = 'completed',
            output = ?,
            tokens_used = ?,
            cost_cents = ?,
            completed_at = datetime('now')
          WHERE id = ?`
        )
          .bind(
            JSON.stringify(output.result),
            output.tokensUsed,
            output.costCents,
            msg.taskId
          )
          .run();

        await writeLog(
          env.DB,
          msg.missionId,
          msg.agentRole,
          "info",
          `Task completed: ${output.summary} (score: ${output.score ?? "n/a"})`
        );

        // Acknowledge message
        message.ack();
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : "Unknown error";

        // Retry logic
        if (msg.attempt < msg.maxRetries) {
          await writeLog(
            env.DB,
            msg.missionId,
            msg.agentRole,
            "warn",
            `Task failed (attempt ${msg.attempt + 1}/${msg.maxRetries}): ${errorMsg}`
          );

          // Re-queue with incremented attempt
          message.retry({ delaySeconds: Math.pow(2, msg.attempt) * 10 });
        } else {
          // Max retries exhausted
          await updateTaskStatus(env.DB, msg.taskId, "failed");
          await writeLog(
            env.DB,
            msg.missionId,
            msg.agentRole,
            "error",
            `Task permanently failed after ${msg.maxRetries} attempts: ${errorMsg}`
          );
          message.ack(); // Don't retry further
        }
      }
    }
  },
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function updateTaskStatus(
  db: D1Database,
  taskId: string,
  status: TaskStatus
): Promise<void> {
  await db
    .prepare(`UPDATE swarm_tasks SET status = ?, started_at = CASE WHEN ? = 'running' THEN datetime('now') ELSE started_at END WHERE id = ?`)
    .bind(status, status, taskId)
    .run();
}

async function writeLog(
  db: D1Database,
  missionId: string,
  agentRole: string,
  level: "info" | "warn" | "error",
  message: string
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO swarm_logs (id, mission_id, agent_role, level, message, created_at)
       VALUES (?, ?, ?, ?, ?, datetime('now'))`
    )
    .bind(
      `log_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      missionId,
      agentRole,
      level,
      message
    )
    .run();
}
