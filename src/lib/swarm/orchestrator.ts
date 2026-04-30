/**
 * Swarm Orchestrator
 *
 * Receives user objectives, decomposes them into missions with phased tasks,
 * delegates to specialist agents, monitors execution, handles failures,
 * and returns executive summaries.
 *
 * Architecture:
 *   User Objective → Strategist (planning) → Task Queue → Agents (parallel) → Results → Summary
 */

import { createAgent, type AgentContext } from "./agents";
import type {
  AgentRole,
  TaskType,
  TaskInput,
  TaskOutput,
  MissionObjective,
  MissionPlan,
  MissionStatus,
  TaskStatus,
} from "./types";

// ─── Internal State Types ────────────────────────────────────────────────────

interface TaskExecution {
  id: string;
  agentRole: AgentRole;
  taskType: TaskType;
  input: TaskInput;
  priority: number;
  status: TaskStatus;
  output?: TaskOutput;
  error?: string;
  startedAt?: string;
  completedAt?: string;
}

interface MissionState {
  missionId: string;
  objective: MissionObjective;
  status: MissionStatus;
  plan?: MissionPlan;
  tasks: TaskExecution[];
  totalTokens: number;
  totalCostCents: number;
  startedAt: string;
  completedAt?: string;
}

interface OrchestratorConfig {
  maxConcurrentTasks: number;
  maxRetries: number;
  costLimitCents: number;
  timeoutMs: number;
  modelProvider: string;
  temperature: number;
}

interface ExecutionSummary {
  missionId: string;
  status: MissionStatus;
  tasksCompleted: number;
  tasksFailed: number;
  totalTokens: number;
  totalCostCents: number;
  durationMs: number;
  artifacts: Array<{ type: string; id: string; preview: string }>;
  summary: string;
}

// ─── Default Configuration ───────────────────────────────────────────────────

const DEFAULT_CONFIG: OrchestratorConfig = {
  maxConcurrentTasks: 4,
  maxRetries: 2,
  costLimitCents: 500, // $5 per mission max
  timeoutMs: 300_000, // 5 minutes
  modelProvider: "anthropic",
  temperature: 0.7,
};

// ─── Orchestrator Class ──────────────────────────────────────────────────────

export class SwarmOrchestrator {
  private config: OrchestratorConfig;
  private missions: Map<string, MissionState> = new Map();

  constructor(config: Partial<OrchestratorConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Launch a mission from a user objective.
   * This is the main entry point.
   */
  async launchMission(
    objective: MissionObjective,
    context: Omit<AgentContext, "missionId">
  ): Promise<ExecutionSummary> {
    const missionId = this.generateMissionId();
    const agentContext: AgentContext = { ...context, missionId };

    const mission: MissionState = {
      missionId,
      objective,
      status: "planning",
      tasks: [],
      totalTokens: 0,
      totalCostCents: 0,
      startedAt: new Date().toISOString(),
    };
    this.missions.set(missionId, mission);

    try {
      // Phase 1: Strategic Planning
      const plan = await this.planMission(objective, agentContext);
      mission.plan = plan;
      mission.status = "active";

      // Phase 2: Execute tasks by phase (sequential phases, parallel tasks within)
      for (const phase of plan.phases) {
        if (mission.status !== "active") break;

        const phaseResults = await this.executePhase(
          phase.tasks.map((t, i) => ({
            id: `${missionId}-${phase.name}-${i}`,
            agentRole: t.agentRole,
            taskType: t.taskType,
            input: t.input,
            priority: t.priority,
            status: "queued" as TaskStatus,
          })),
          agentContext
        );

        mission.tasks.push(...phaseResults);

        // Check cost limits
        const totalCost = mission.tasks.reduce(
          (sum, t) => sum + (t.output?.costCents ?? 0),
          0
        );
        mission.totalCostCents = totalCost;

        if (totalCost > this.config.costLimitCents) {
          mission.status = "paused";
          break;
        }
      }

      // Phase 3: Finalize
      if (mission.status === "active") {
        mission.status = "completed";
      }
    } catch (error) {
      mission.status = "failed";
      mission.tasks.push({
        id: `${missionId}-error`,
        agentRole: "strategist",
        taskType: "summarize",
        input: { instruction: "Handle orchestrator error" },
        priority: 0,
        status: "failed",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }

    mission.completedAt = new Date().toISOString();
    mission.totalTokens = mission.tasks.reduce(
      (sum, t) => sum + (t.output?.tokensUsed ?? 0),
      0
    );

    return this.buildSummary(mission);
  }

  /**
   * Plan the mission using the Strategist agent.
   */
  private async planMission(
    objective: MissionObjective,
    context: AgentContext
  ): Promise<MissionPlan> {
    const strategist = createAgent("strategist");
    const planOutput = await strategist.execute(
      "plan_strategy",
      {
        instruction: `Plan a mission to achieve: ${objective.goal}. Target metric: ${objective.targetMetric ?? "engagement"}. Constraints: ${objective.constraints?.join(", ") ?? "none"}`,
        context: { objective },
      },
      context
    );

    // In production, the strategist returns a structured MissionPlan.
    // For now, generate a sensible default based on the objective.
    return this.buildDefaultPlan(context.missionId, objective, planOutput);
  }

  /**
   * Execute a phase of tasks with concurrency control.
   */
  private async executePhase(
    tasks: TaskExecution[],
    context: AgentContext
  ): Promise<TaskExecution[]> {
    const results: TaskExecution[] = [];
    const queue = [...tasks].sort((a, b) => b.priority - a.priority);

    // Process in batches respecting maxConcurrentTasks
    while (queue.length > 0) {
      const batch = queue.splice(0, this.config.maxConcurrentTasks);

      const batchResults = await Promise.allSettled(
        batch.map((task) => this.executeTask(task, context))
      );

      for (let i = 0; i < batchResults.length; i++) {
        const result = batchResults[i]!;
        const task = batch[i]!;

        if (result.status === "fulfilled") {
          results.push(result.value);
        } else {
          results.push({
            ...task,
            status: "failed",
            error: result.reason instanceof Error ? result.reason.message : "Unknown error",
            completedAt: new Date().toISOString(),
          });
        }
      }
    }

    return results;
  }

  /**
   * Execute a single task with retry logic.
   */
  private async executeTask(
    task: TaskExecution,
    context: AgentContext
  ): Promise<TaskExecution> {
    const agent = createAgent(task.agentRole);
    task.status = "running";
    task.startedAt = new Date().toISOString();

    let lastError: string | undefined;

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        const output = await agent.execute(task.taskType, task.input, context);
        task.output = output;
        task.status = "completed";
        task.completedAt = new Date().toISOString();
        return task;
      } catch (error) {
        lastError = error instanceof Error ? error.message : "Unknown error";
        // Wait before retry (exponential backoff)
        if (attempt < this.config.maxRetries) {
          await this.sleep(1000 * Math.pow(2, attempt));
        }
      }
    }

    task.status = "failed";
    task.error = lastError;
    task.completedAt = new Date().toISOString();
    return task;
  }

  /**
   * Build an executive summary of the mission execution.
   */
  private buildSummary(mission: MissionState): ExecutionSummary {
    const completed = mission.tasks.filter((t) => t.status === "completed");
    const failed = mission.tasks.filter((t) => t.status === "failed");
    const artifacts = completed.flatMap(
      (t) => t.output?.artifacts ?? []
    );

    const durationMs = mission.completedAt
      ? new Date(mission.completedAt).getTime() - new Date(mission.startedAt).getTime()
      : 0;

    return {
      missionId: mission.missionId,
      status: mission.status,
      tasksCompleted: completed.length,
      tasksFailed: failed.length,
      totalTokens: mission.totalTokens,
      totalCostCents: mission.totalCostCents,
      durationMs,
      artifacts,
      summary: this.generateNarrativeSummary(mission, completed, failed),
    };
  }

  /**
   * Generate a narrative summary for the executive view.
   */
  private generateNarrativeSummary(
    mission: MissionState,
    completed: TaskExecution[],
    failed: TaskExecution[]
  ): string {
    const lines: string[] = [];
    lines.push(`Mission "${mission.objective.goal}" — ${mission.status}`);
    lines.push(`${completed.length} tasks completed, ${failed.length} failed`);
    lines.push(
      `Total cost: $${(mission.totalCostCents / 100).toFixed(2)} | Tokens: ${mission.totalTokens.toLocaleString()}`
    );

    if (failed.length > 0) {
      lines.push(`Failures: ${failed.map((f) => `${f.agentRole}/${f.taskType}`).join(", ")}`);
    }

    const avgScore =
      completed.reduce((sum, t) => sum + (t.output?.score ?? 0), 0) /
      (completed.length || 1);
    lines.push(`Average quality score: ${(avgScore * 100).toFixed(0)}%`);

    return lines.join("\n");
  }

  /**
   * Build a default mission plan when the strategist returns a placeholder.
   * In production, this is replaced by the strategist's structured output.
   */
  private buildDefaultPlan(
    missionId: string,
    objective: MissionObjective,
    _strategyOutput: TaskOutput
  ): MissionPlan {
    return {
      missionId,
      phases: [
        {
          name: "Research",
          tasks: [
            {
              agentRole: "analytics",
              taskType: "analyze_metrics",
              input: { instruction: `Analyze current state for: ${objective.goal}` },
              priority: 10,
            },
            {
              agentRole: "competitor",
              taskType: "research_competitors",
              input: { instruction: `Research competitive landscape for: ${objective.goal}` },
              priority: 9,
            },
          ],
        },
        {
          name: "Creation",
          tasks: [
            {
              agentRole: "content",
              taskType: "generate_content",
              input: {
                instruction: `Create content for: ${objective.goal}`,
                dependsOn: [`${missionId}-Research-0`],
              },
              priority: 8,
            },
            {
              agentRole: "founder_voice",
              taskType: "review_brand_voice",
              input: {
                instruction: `Review voice consistency for: ${objective.goal}`,
                dependsOn: [`${missionId}-Research-0`],
              },
              priority: 7,
            },
          ],
        },
        {
          name: "Distribution",
          tasks: [
            {
              agentRole: "ads",
              taskType: "create_campaign",
              input: {
                instruction: `Create campaign for: ${objective.goal}`,
                dependsOn: [`${missionId}-Creation-0`],
              },
              priority: 6,
            },
            {
              agentRole: "outreach",
              taskType: "send_outreach",
              input: {
                instruction: `Plan outreach for: ${objective.goal}`,
                dependsOn: [`${missionId}-Creation-0`],
              },
              priority: 5,
            },
          ],
        },
      ],
    };
  }

  // ─── Utilities ───────────────────────────────────────────────────────────────

  private generateMissionId(): string {
    return `mission_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get the current state of a mission (for dashboard polling).
   */
  getMissionState(missionId: string): MissionState | undefined {
    return this.missions.get(missionId);
  }

  /**
   * Cancel a running mission.
   */
  cancelMission(missionId: string): boolean {
    const mission = this.missions.get(missionId);
    if (mission && (mission.status === "active" || mission.status === "planning")) {
      mission.status = "cancelled";
      mission.completedAt = new Date().toISOString();
      return true;
    }
    return false;
  }

  /**
   * Resume a paused mission (e.g., after cost limit increase).
   */
  async resumeMission(
    missionId: string,
    context: Omit<AgentContext, "missionId">
  ): Promise<ExecutionSummary | null> {
    const mission = this.missions.get(missionId);
    if (!mission || mission.status !== "paused") return null;

    mission.status = "active";
    const agentContext: AgentContext = { ...context, missionId };

    // Re-run remaining phases
    if (mission.plan) {
      const completedTaskIds = new Set(
        mission.tasks.filter((t) => t.status === "completed").map((t) => t.id)
      );

      for (const phase of mission.plan.phases) {
        if (mission.status !== "active") break;

        const remainingTasks = phase.tasks
          .map((t, i) => ({
            id: `${missionId}-${phase.name}-${i}`,
            agentRole: t.agentRole,
            taskType: t.taskType,
            input: t.input,
            priority: t.priority,
            status: "queued" as TaskStatus,
          }))
          .filter((t) => !completedTaskIds.has(t.id));

        if (remainingTasks.length === 0) continue;

        const results = await this.executePhase(remainingTasks, agentContext);
        mission.tasks.push(...results);
      }

      if (mission.status === "active") {
        mission.status = "completed";
      }
    }

    mission.completedAt = new Date().toISOString();
    mission.totalTokens = mission.tasks.reduce(
      (sum, t) => sum + (t.output?.tokensUsed ?? 0),
      0
    );
    mission.totalCostCents = mission.tasks.reduce(
      (sum, t) => sum + (t.output?.costCents ?? 0),
      0
    );

    return this.buildSummary(mission);
  }
}

// ─── Singleton Export ────────────────────────────────────────────────────────

let orchestratorInstance: SwarmOrchestrator | null = null;

export function getOrchestrator(
  config?: Partial<OrchestratorConfig>
): SwarmOrchestrator {
  if (!orchestratorInstance) {
    orchestratorInstance = new SwarmOrchestrator(config);
  }
  return orchestratorInstance;
}

export type { OrchestratorConfig, ExecutionSummary, MissionState, TaskExecution };
