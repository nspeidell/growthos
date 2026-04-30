/**
 * GrowthOS Swarm Engine
 *
 * AI agent orchestration system for autonomous growth marketing.
 * Decomposes objectives into missions, delegates to specialist agents,
 * executes with concurrency control, and delivers executive summaries.
 */

export { SwarmOrchestrator, getOrchestrator } from "./orchestrator";
export type {
  OrchestratorConfig,
  ExecutionSummary,
  MissionState,
  TaskExecution,
} from "./orchestrator";

export {
  BaseAgent,
  StrategistAgent,
  ContentAgent,
  VideoAgent,
  AdsAgent,
  OutreachAgent,
  AnalyticsAgent,
  CompetitorAgent,
  FounderVoiceAgent,
  createAgent,
  getAllAgents,
} from "./agents";
export type { AgentContext } from "./agents";

export type {
  AgentRole,
  TaskType,
  MissionStatus,
  TaskStatus,
  MissionObjective,
  TaskInput,
  TaskOutput,
  AgentConfig,
  MissionPlan,
} from "./types";
