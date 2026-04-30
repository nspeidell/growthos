/**
 * Base Agent — abstract class all swarm agents extend.
 *
 * Each agent receives a task input, executes against its specialization,
 * and returns a structured output with token/cost tracking.
 */

import type { AgentRole, TaskType, TaskInput, TaskOutput } from "../types";

export interface AgentContext {
  workspaceId: string;
  missionId: string;
  anthropicApiKey: string;
  modelProvider: string;
  temperature: number;
  systemPrompt?: string;
}

export abstract class BaseAgent {
  abstract readonly role: AgentRole;
  abstract readonly name: string;
  abstract readonly capabilities: TaskType[];

  /**
   * Execute a task. Subclasses implement the actual logic.
   */
  abstract execute(
    taskType: TaskType,
    input: TaskInput,
    context: AgentContext
  ): Promise<TaskOutput>;

  /**
   * Check if this agent can handle a given task type.
   */
  canHandle(taskType: TaskType): boolean {
    return this.capabilities.includes(taskType);
  }

  /**
   * Build a system prompt enriched with workspace context.
   */
  protected buildSystemPrompt(
    basePrompt: string,
    context: AgentContext
  ): string {
    const header = `You are the ${this.name} agent in the GrowthOS swarm system. Your role: ${this.role}.\nWorkspace: ${context.workspaceId} | Mission: ${context.missionId}\n\n`;
    return header + (context.systemPrompt ?? basePrompt);
  }

  /**
   * Estimate token cost in cents (approximate).
   */
  protected estimateCost(
    inputTokens: number,
    outputTokens: number,
    provider: string
  ): number {
    // Approximate per-million-token pricing
    const rates: Record<string, { input: number; output: number }> = {
      anthropic: { input: 300, output: 1500 }, // Claude Sonnet
      openai: { input: 250, output: 1000 },
      together: { input: 80, output: 80 },
      cloudflare: { input: 10, output: 10 },
    };
    const rate = rates[provider] ?? rates.anthropic!;
    const inputCost = (inputTokens / 1_000_000) * rate.input;
    const outputCost = (outputTokens / 1_000_000) * rate.output;
    return Math.ceil((inputCost + outputCost) * 100); // cents
  }
}
