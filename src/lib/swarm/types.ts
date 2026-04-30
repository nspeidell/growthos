/**
 * Swarm Engine shared types.
 */

export type AgentRole =
  | "strategist"
  | "content"
  | "video"
  | "ads"
  | "outreach"
  | "analytics"
  | "competitor"
  | "founder_voice";

export type TaskType =
  | "generate_content"
  | "analyze_metrics"
  | "create_campaign"
  | "optimize_ads"
  | "research_competitors"
  | "send_outreach"
  | "generate_video"
  | "plan_strategy"
  | "review_brand_voice"
  | "schedule_post"
  | "summarize"
  | "recommend";

export type MissionStatus =
  | "planning"
  | "active"
  | "paused"
  | "completed"
  | "failed"
  | "cancelled";

export type TaskStatus = "queued" | "running" | "completed" | "failed" | "skipped";

export interface MissionObjective {
  goal: string;
  targetMetric?: string;
  targetValue?: number;
  deadline?: string; // ISO date
  constraints?: string[];
}

export interface TaskInput {
  instruction: string;
  context?: Record<string, unknown>;
  dependsOn?: string[]; // task IDs that must complete first
}

export interface TaskOutput {
  result: unknown;
  summary: string;
  score?: number;
  tokensUsed: number;
  costCents: number;
  artifacts?: Array<{
    type: "content" | "campaign" | "media" | "analysis" | "recommendation";
    id: string;
    preview: string;
  }>;
}

export interface AgentConfig {
  role: AgentRole;
  name: string;
  systemPrompt: string;
  modelProvider: "anthropic" | "openai" | "together" | "cloudflare";
  temperature: number;
  capabilities: TaskType[];
}

export interface MissionPlan {
  missionId: string;
  phases: Array<{
    name: string;
    tasks: Array<{
      agentRole: AgentRole;
      taskType: TaskType;
      input: TaskInput;
      priority: number;
    }>;
  }>;
}
